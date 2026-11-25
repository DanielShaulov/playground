/**
 * Pure RK4 N-body orbital physics, live trajectory prediction, real-time
 * Orbit Grapple exit-arc prediction, spacetime warping, and collision resolution.
 * No DOM dependencies — runs identically in browser and Node tests.
 */

import { getShip } from "./ships.js";
import { WORLD_W, WORLD_H, isGateUnlocked } from "./campaign.js";

export const PROBE_R = 7;
export const MIN_PULL = 14;
export const MAX_PULL = 148;
export const BASE_MAX_SPEED = 565;
export const MIN_LAUNCH_SPEED = 145;
export const GRAVITY_SOFT = 460;
export const BASE_GRAPPLE_RANGE = 172;
export const MAX_FLIGHT_SECONDS = 14;

/**
 * Convert a relative pull vector (start - current) into launch velocity.
 * Returns null if inside the cancel deadzone.
 */
export function pullToVelocity(pullDx, pullDy, shipId = "solaris") {
  const dist = Math.hypot(pullDx, pullDy);
  if (dist < MIN_PULL) return null;
  const { traits } = getShip(shipId);
  const maxSpeed = BASE_MAX_SPEED * traits.speedMult;
  const frac = Math.min(1, (dist - MIN_PULL) / (MAX_PULL - MIN_PULL));
  const speed = MIN_LAUNCH_SPEED + Math.pow(frac, 0.92) * (maxSpeed - MIN_LAUNCH_SPEED);
  return {
    vx: (pullDx / dist) * speed,
    vy: (pullDy / dist) * speed,
    power: frac,
    speed,
  };
}

/**
 * Compute gravitational acceleration at (x, y) from all celestial bodies.
 */
export function computeAccel(x, y, bodies) {
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const dx = b.x - x;
    const dy = b.y - y;
    const d2 = dx * dx + dy * dy + GRAVITY_SOFT;
    const invD = 1 / Math.sqrt(d2);
    const f = (b.gm * invD) / d2;
    ax += dx * f;
    ay += dy * f;
  }
  return { ax, ay };
}

/**
 * Subtle spacetime displacement for rendering gravity-warped background grids.
 */
export function warpSpacePoint(x, y, bodies) {
  let wx = x;
  let wy = y;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const dx = b.x - x;
    const dy = b.y - y;
    const d2 = dx * dx + dy * dy + 2400;
    const d = Math.sqrt(d2);
    const strength = (b.gm / 1.1e7) * (b.kind === "singularity" ? 20 : 13);
    const pull = Math.max(-18, Math.min(20, (strength * 1400) / d2));
    wx += (dx / d) * pull;
    wy += (dy / d) * pull;
  }
  return { x: wx, y: wy };
}

/**
 * RK4 single-step integration for position & velocity under gravity.
 */
export function rk4Step(x, y, vx, vy, bodies, h) {
  const a1 = computeAccel(x, y, bodies);
  const x2 = x + vx * (h * 0.5);
  const y2 = y + vy * (h * 0.5);
  const vx2 = vx + a1.ax * (h * 0.5);
  const vy2 = vy + a1.ay * (h * 0.5);
  const a2 = computeAccel(x2, y2, bodies);

  const x3 = x + vx2 * (h * 0.5);
  const y3 = y + vy2 * (h * 0.5);
  const vx3 = vx + a2.ax * (h * 0.5);
  const vy3 = vy + a2.ay * (h * 0.5);
  const a3 = computeAccel(x3, y3, bodies);

  const x4 = x + vx3 * h;
  const y4 = y + vy3 * h;
  const vx4 = vx + a3.ax * h;
  const vy4 = vy + a3.ay * h;
  const a4 = computeAccel(x4, y4, bodies);

  return {
    x: x + ((vx + 2 * vx2 + 2 * vx3 + vx4) * h) / 6,
    y: y + ((vy + 2 * vy2 + 2 * vy3 + vy4) * h) / 6,
    vx: vx + ((a1.ax + 2 * a2.ax + 2 * a3.ax + a4.ax) * h) / 6,
    vy: vy + ((a1.ay + 2 * a2.ay + 2 * a3.ay + a4.ay) * h) / 6,
  };
}

/**
 * Find the nearest attractive body within Orbit Grapple range.
 */
export function findGrappleTarget(orbit, probe, shipId = "solaris") {
  const { traits } = getShip(shipId);
  const range = BASE_GRAPPLE_RANGE * traits.grappleRangeMult;
  let best = null;
  let bestEdge = Infinity;
  for (const b of orbit.bodies) {
    if (b.gm <= 0) continue;
    const edgeDist = Math.hypot(probe.x - b.x, probe.y - b.y) - b.r;
    if (edgeDist <= range && edgeDist < bestEdge) {
      bestEdge = edgeDist;
      best = b;
    }
  }
  return best;
}

/**
 * Predict an RK4 trajectory arc from (startX, startY) with velocity (vx, vy).
 * Works both for initial slingshot aiming AND live Orbit Grapple exit preview!
 */
export function predictTrajectory(orbit, startX, startY, vx, vy, shipId = "solaris", maxSteps = null) {
  const { traits } = getShip(shipId);
  const steps = maxSteps ?? traits.trajectorySteps;
  const h = 0.024;
  const points = [];
  let x = startX;
  let y = startY;
  let curVx = vx;
  let curVy = vy;
  let warpsLeft = 2;
  let whCooldown = 0;
  let hitGate = false;

  for (let i = 0; i < steps; i++) {
    const next = rk4Step(x, y, curVx, curVy, orbit.bodies, h);
    x = next.x;
    y = next.y;
    curVx = next.vx;
    curVy = next.vy;
    if (whCooldown > 0) whCooldown -= h;

    let breakHere = false;

    // Preview bumper ricochets cleanly too!
    for (const bp of orbit.bumpers) {
      const dx = x - bp.x;
      const dy = y - bp.y;
      const d = Math.hypot(dx, dy);
      if (d < bp.r + PROBE_R && d > 0.001) {
        const nx = dx / d;
        const ny = dy / d;
        x = bp.x + nx * (bp.r + PROBE_R + 1);
        y = bp.y + ny * (bp.r + PROBE_R + 1);
        const vn = curVx * nx + curVy * ny;
        if (vn < 0) {
          curVx -= 2 * vn * nx;
          curVy -= 2 * vn * ny;
        }
        const spd = Math.hypot(curVx, curVy);
        if (spd < 350) {
          const s = 350 / (spd || 1);
          curVx *= s;
          curVy *= s;
        }
      }
    }

    // Wormhole preview
    if (warpsLeft > 0 && whCooldown <= 0 && orbit.wormholes.length === 2) {
      for (const w of orbit.wormholes) {
        if (Math.hypot(x - w.x, y - w.y) <= w.r + PROBE_R * 0.6) {
          const dst = orbit.wormholes.find((o) => o.id === w.target);
          if (dst) {
            const spd = Math.hypot(curVx, curVy) || 1;
            x = dst.x + (curVx / spd) * (dst.r + 7);
            y = dst.y + (curVy / spd) * (dst.r + 7);
            warpsLeft--;
            whCooldown = 0.28;
            breakHere = true;
            break;
          }
        }
      }
    }

    points.push({ x, y, breakHere });

    if (Math.hypot(x - orbit.gate.x, y - orbit.gate.y) <= orbit.gate.r + PROBE_R) {
      hitGate = true;
      break;
    }

    let crashed = false;
    for (const b of orbit.bodies) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r + PROBE_R * 0.85) {
        crashed = true;
        break;
      }
    }
    if (crashed) break;
    if (x < -28 || x > WORLD_W + 28 || y < -28 || y > WORLD_H + 28) break;
  }

  return { points, hitGate };
}

/**
 * Compute exact release velocity if the player releases Orbit Grapple right now.
 * Uses a steady, predictable tangent launch speed so the live curved exit arc
 * matches the actual flight path 1:1 upon release.
 */
export function grappleReleaseVelocity(probe) {
  if (!probe.tether) return { vx: probe.vx, vy: probe.vy, boosted: false };
  const spd = Math.hypot(probe.vx, probe.vy) || 1;
  const launchSpd = probe.tether.launchSpeed || 430;
  return {
    vx: (probe.vx / spd) * launchSpd,
    vy: (probe.vy / spd) * launchSpd,
    boosted: true,
  };
}

/**
 * Predict the live curved exit trajectory while holding Orbit Grapple!
 */
export function predictGrappleExit(orbit, probe, shipId = "solaris") {
  if (!probe || !probe.alive || !probe.tether) return null;
  const rel = grappleReleaseVelocity(probe);
  return predictTrajectory(orbit, probe.x, probe.y, rel.vx, rel.vy, shipId, 68);
}

/**
 * Create a live flight state when launching from the orbit's launch pad.
 */
export function createFlight(orbit, vx, vy, shipId = "solaris") {
  for (const b of orbit.bodies) b.grazed = false;
  const { traits } = getShip(shipId);

  const main = {
    id: "main",
    isTwin: false,
    x: orbit.launch.x,
    y: orbit.launch.y,
    vx,
    vy,
    alive: true,
    trail: [{ x: orbit.launch.x, y: orbit.launch.y }],
    whCooldown: 0,
    tether: null,
  };

  const probes = [main];

  if (traits.twinProbe) {
    const a = 0.13;
    const c = Math.cos(a);
    const s = Math.sin(a);
    probes.push({
      id: "twin",
      isTwin: true,
      x: orbit.launch.x,
      y: orbit.launch.y,
      vx: (vx * c - vy * s) * 0.97,
      vy: (vx * s + vy * c) * 0.97,
      alive: true,
      trail: [{ x: orbit.launch.x, y: orbit.launch.y }],
      whCooldown: 0,
      tether: null,
    });
  }

  return {
    probes,
    elapsed: 0,
    chain: 0,
    crystalsThisShot: 0,
    grazesThisShot: 0,
    usedGrapple: false,
    settled: false,
    outcome: null,
    nearestGrappleId: null,
    grappleExit: null,
  };
}

/**
 * Step active flight physics by `dt` seconds.
 * Returns structured events for scoring, audio, and VFX.
 */
export function stepFlight(orbit, flight, dt, holding, shipId = "solaris") {
  const events = [];
  if (flight.settled) return events;

  const { traits } = getShip(shipId);
  const substeps = 4;
  const h = dt / substeps;
  const main = flight.probes[0];
  // Don't burn flight timeout while calmly aiming an Orbit Grapple
  if (!main.tether) flight.elapsed += dt;

  // Tether lock / release on main probe
  if (main.alive) {
    if (holding && !main.tether) {
      const target = findGrappleTarget(orbit, main, shipId);
      if (target) {
        const dx = main.x - target.x;
        const dy = main.y - target.y;
        const dist = Math.max(target.r + 24, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        const cross = dx * main.vy - dy * main.vx;
        const dir = cross >= 0 ? 1 : -1;
        const vEsc = Math.sqrt((2 * Math.max(1e6, target.gm)) / Math.max(40, dist));
        const launchSpeed = Math.max(460, Math.min(740, vEsc * 1.16));
        main.tether = {
          bodyId: target.id,
          orbitR: dist,
          angle,
          dir,
          launchSpeed,
          charge: 0,
          aimingGate: false,
        };
        // Immediately orient velocity along exact tangent so exit arc is smooth from frame 1
        main.vx = -Math.sin(angle) * dir * launchSpeed;
        main.vy = Math.cos(angle) * dir * launchSpeed;
        flight.usedGrapple = true;
        events.push({ type: "tether_lock", x: main.x, y: main.y, bodyId: target.id });
      }
    } else if (!holding && main.tether) {
      const charge = main.tether.charge;
      const bodyId = main.tether.bodyId;
      const rel = grappleReleaseVelocity(main);
      main.tether = null;
      main.vx = rel.vx;
      main.vy = rel.vy;
      events.push({ type: "tether_release", x: main.x, y: main.y, charge, bodyId });
    }
  }

  for (let s = 0; s < substeps; s++) {
    if (flight.settled) break;

    for (const probe of flight.probes) {
      if (!probe.alive) continue;
      if (probe.whCooldown > 0) probe.whCooldown = Math.max(0, probe.whCooldown - h);

      if (probe.tether) {
        // Calm, deliberate angular sextant orbit around the grappled body.
        // Smoothly slows into a magnetic detent whenever the live exit arc hits the Warp Gate!
        const b = orbit.bodies.find((body) => body.id === probe.tether.bodyId);
        if (!b) {
          probe.tether = null;
        } else {
          const baseOmega = traits.chronoGrapple ? 0.95 : 1.32;
          const omega = probe.tether.aimingGate ? baseOmega * 0.36 : baseOmega;
          probe.tether.angle += probe.tether.dir * omega * h;
          const a = probe.tether.angle;
          probe.x = b.x + Math.cos(a) * probe.tether.orbitR;
          probe.y = b.y + Math.sin(a) * probe.tether.orbitR;
          probe.vx = -Math.sin(a) * probe.tether.dir * probe.tether.launchSpeed;
          probe.vy = Math.cos(a) * probe.tether.dir * probe.tether.launchSpeed;
          probe.tether.charge = Math.min(1, probe.tether.charge + 1.2 * h);
        }
      } else {
        const next = rk4Step(probe.x, probe.y, probe.vx, probe.vy, orbit.bodies, h);
        probe.x = next.x;
        probe.y = next.y;
        probe.vx = next.vx;
        probe.vy = next.vy;
      }

      // Aegis magnetic crystal wake
      if (traits.magneticWake) {
        for (const c of orbit.crystals) {
          if (!c.alive) continue;
          const dx = probe.x - c.x;
          const dy = probe.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d > 2 && d < 62) {
            c.x += (dx / d) * 195 * h;
            c.y += (dy / d) * 195 * h;
          }
        }
      }

      // Crystals & Key Prisms
      for (const c of orbit.crystals) {
        if (!c.alive) continue;
        if (Math.hypot(probe.x - c.x, probe.y - c.y) <= c.r + PROBE_R + 3) {
          c.alive = false;
          flight.chain += 1;
          flight.crystalsThisShot += 1;
          events.push({
            type: c.isKey ? "key" : "crystal",
            x: c.x,
            y: c.y,
            chain: flight.chain,
            points: (c.isKey ? 250 : 100) * flight.chain,
            gateJustUnlocked: c.isKey && isGateUnlocked(orbit),
          });
        }
      }

      // Solar Bumpers
      for (const bp of orbit.bumpers) {
        const dx = probe.x - bp.x;
        const dy = probe.y - bp.y;
        const d = Math.hypot(dx, dy);
        if (d < bp.r + PROBE_R && d > 0.001) {
          const nx = dx / d;
          const ny = dy / d;
          probe.x = bp.x + nx * (bp.r + PROBE_R + 1);
          probe.y = bp.y + ny * (bp.r + PROBE_R + 1);
          const vn = probe.vx * nx + probe.vy * ny;
          if (vn < 0) {
            probe.vx -= 2 * vn * nx;
            probe.vy -= 2 * vn * ny;
          }
          const spd = Math.hypot(probe.vx, probe.vy);
          if (spd < 350) {
            const sc = 350 / (spd || 1);
            probe.vx *= sc;
            probe.vy *= sc;
          }
          bp.flash = 1;
          events.push({ type: "bumper", x: bp.x, y: bp.y, points: 75 });
        }
      }

      // Wormholes
      if (probe.whCooldown <= 0 && orbit.wormholes.length === 2) {
        for (const w of orbit.wormholes) {
          if (Math.hypot(probe.x - w.x, probe.y - w.y) <= w.r + PROBE_R * 0.5) {
            const dst = orbit.wormholes.find((o) => o.id === w.target);
            if (dst) {
              const spd = Math.hypot(probe.vx, probe.vy) || 1;
              probe.x = dst.x + (probe.vx / spd) * (dst.r + 7);
              probe.y = dst.y + (probe.vy / spd) * (dst.r + 7);
              probe.whCooldown = 0.3;
              probe.tether = null;
              probe.trail.push({ x: probe.x, y: probe.y, breakHere: true });
              events.push({ type: "wormhole", fromX: w.x, fromY: w.y, toX: dst.x, toY: dst.y });
              break;
            }
          }
        }
      }

      // Warp Gate
      const gateD = Math.hypot(probe.x - orbit.gate.x, probe.y - orbit.gate.y);
      if (gateD <= orbit.gate.r + PROBE_R * 0.65) {
        if (isGateUnlocked(orbit)) {
          flight.settled = true;
          flight.outcome = "warp";
          events.push({ type: "gate_warp", x: orbit.gate.x, y: orbit.gate.y });
          break;
        } else {
          const nx = (probe.x - orbit.gate.x) / (gateD || 1);
          const ny = (probe.y - orbit.gate.y) / (gateD || 1);
          probe.x = orbit.gate.x + nx * (orbit.gate.r + PROBE_R + 2);
          probe.y = orbit.gate.y + ny * (orbit.gate.r + PROBE_R + 2);
          const vn = probe.vx * nx + probe.vy * ny;
          if (vn < 0) {
            probe.vx -= 1.85 * vn * nx;
            probe.vy -= 1.85 * vn * ny;
          }
          events.push({ type: "gate_locked", x: orbit.gate.x, y: orbit.gate.y });
        }
      }

      // Body Crash & Perihelion Graze
      for (const b of orbit.bodies) {
        const dx = probe.x - b.x;
        const dy = probe.y - b.y;
        const d = Math.hypot(dx, dy);

        if (d <= b.r + PROBE_R * 0.8) {
          if (!probe.isTwin && traits.aegisShield && !orbit.aegisUsed) {
            orbit.aegisUsed = true;
            const nx = dx / (d || 1);
            const ny = dy / (d || 1);
            probe.x = b.x + nx * (b.r + PROBE_R + 4);
            probe.y = b.y + ny * (b.r + PROBE_R + 4);
            const vn = probe.vx * nx + probe.vy * ny;
            probe.vx -= 2 * vn * nx;
            probe.vy -= 2 * vn * ny;
            probe.tether = null;
            events.push({ type: "aegis_bounce", x: probe.x, y: probe.y });
          } else {
            probe.alive = false;
            probe.tether = null;
            events.push({ type: "planet_crash", x: probe.x, y: probe.y, isTwin: probe.isTwin });
          }
          break;
        }

        if (!probe.isTwin && !b.grazed && d <= b.grazeR) {
          b.grazed = true;
          b.grazeFlash = 1;
          flight.grazesThisShot += 1;
          flight.chain += 1;
          const isSing = b.kind === "singularity";
          events.push({
            type: "graze",
            x: probe.x,
            y: probe.y,
            isSingularity: isSing,
            chain: flight.chain,
            points: isSing ? 450 : 200,
          });
        }
      }

      if (!probe.alive) continue;

      // Mines
      for (const m of orbit.mines) {
        if (!m.alive) continue;
        const dx = probe.x - m.x;
        const dy = probe.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d <= m.r + PROBE_R) {
          m.alive = false;
          if (!probe.isTwin && traits.aegisShield && !orbit.aegisUsed) {
            orbit.aegisUsed = true;
            const nx = dx / (d || 1);
            const ny = dy / (d || 1);
            const vn = probe.vx * nx + probe.vy * ny;
            if (vn < 0) {
              probe.vx -= 2 * vn * nx;
              probe.vy -= 2 * vn * ny;
            }
            events.push({ type: "aegis_bounce", x: m.x, y: m.y });
          } else {
            probe.alive = false;
            probe.tether = null;
            events.push({ type: "mine_hit", x: m.x, y: m.y, isTwin: probe.isTwin });
          }
          break;
        }
      }

      if (!probe.alive) continue;

      // Out of bounds
      if (probe.x < -34 || probe.x > WORLD_W + 34 || probe.y < -34 || probe.y > WORLD_H + 34) {
        probe.alive = false;
        probe.tether = null;
        events.push({ type: "oob", x: probe.x, y: probe.y, isTwin: probe.isTwin });
      }
    }
  }

  for (const probe of flight.probes) {
    if (!probe.alive) continue;
    probe.trail.push({ x: probe.x, y: probe.y });
    if (probe.trail.length > 56) probe.trail.shift();
  }

  if (main.alive && !main.tether) {
    const tgt = findGrappleTarget(orbit, main, shipId);
    flight.nearestGrappleId = tgt ? tgt.id : null;
    flight.grappleExit = null;
  } else if (main.alive && main.tether) {
    flight.nearestGrappleId = main.tether.bodyId;
    flight.grappleExit = predictGrappleExit(orbit, main, shipId);
    const nowHit = Boolean(flight.grappleExit && flight.grappleExit.hitGate);
    if (nowHit && !main.tether.aimingGate) {
      events.push({ type: "tether_gate_lock", x: orbit.gate.x, y: orbit.gate.y });
    }
    main.tether.aimingGate = nowHit;
  } else {
    flight.nearestGrappleId = null;
    flight.grappleExit = null;
  }

  if (!flight.settled) {
    const anyAlive = flight.probes.some((p) => p.alive);
    if (!anyAlive) {
      flight.settled = true;
      flight.outcome = "crash";
    } else if (flight.elapsed >= MAX_FLIGHT_SECONDS) {
      flight.settled = true;
      flight.outcome = "timeout";
      events.push({ type: "timeout", x: main.x, y: main.y });
    }
  }

  return events;
}
