/**
 * Pure RK4 N-body orbital physics, live trajectory prediction, orbit grapple
 * tether, Perihelion Graze detection, and collision resolution.
 * No DOM dependencies — runs identically in browser and Node tests.
 */

import { hasRelic } from "./relics.js";
import { WORLD_W, WORLD_H, isGateUnlocked } from "./sectors.js";

export const PROBE_R = 7;
export const MIN_PULL = 14;
export const MAX_PULL = 145;
export const BASE_MAX_SPEED = 560;
export const MIN_LAUNCH_SPEED = 150;
export const GRAVITY_SOFT = 460;
export const BASE_GRAPPLE_RANGE = 165;
export const MAX_FLIGHT_SECONDS = 14;

/**
 * Convert a relative pull vector (start - current) into launch velocity.
 * Returns null if pull is inside the cancel deadzone.
 */
export function pullToVelocity(pullDx, pullDy, ownedRelics = []) {
  const dist = Math.hypot(pullDx, pullDy);
  if (dist < MIN_PULL) return null;
  const maxSpeed = hasRelic(ownedRelics, "tachyon_launch")
    ? BASE_MAX_SPEED * 1.22
    : BASE_MAX_SPEED;
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
 * RK4 single-step integration for position & velocity under gravity.
 */
export function rk4Step(x, y, vx, vy, bodies, h) {
  const a1 = computeAccel(x, y, bodies);
  const k1vx = a1.ax,
    k1vy = a1.ay;

  const x2 = x + vx * (h * 0.5);
  const y2 = y + vy * (h * 0.5);
  const vx2 = vx + k1vx * (h * 0.5);
  const vy2 = vy + k1vy * (h * 0.5);
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
    vx: vx + ((k1vx + 2 * a2.ax + 2 * a3.ax + a4.ax) * h) / 6,
    vy: vy + ((k1vy + 2 * a2.ay + 2 * a3.ay + a4.ay) * h) / 6,
  };
}

/**
 * Find the best attractive body within grapple tether range.
 * Repulsors cannot be orbit-grappled (they push away).
 */
export function findGrappleTarget(sector, probe, ownedRelics = []) {
  const range = hasRelic(ownedRelics, "graviton_drive")
    ? BASE_GRAPPLE_RANGE * 1.3
    : BASE_GRAPPLE_RANGE;
  let best = null;
  let bestScore = Infinity;
  for (const b of sector.bodies) {
    if (b.gm <= 0) continue;
    const d = Math.hypot(probe.x - b.x, probe.y - b.y);
    const edgeDist = d - b.r;
    if (edgeDist <= range && edgeDist < bestScore) {
      bestScore = edgeDist;
      best = b;
    }
  }
  return best;
}

/**
 * Predict the probe's orbital trajectory for the aiming dotted arc.
 * Accounts for planets, repulsors, wormholes, and Forcefield Walls.
 */
export function predictTrajectory(sector, startX, startY, vx, vy, ownedRelics = []) {
  const longSight = hasRelic(ownedRelics, "long_sight");
  const ricochet = hasRelic(ownedRelics, "ricochet_field");
  const steps = longSight ? 84 : 52;
  const h = 0.024;
  const points = [];
  let x = startX;
  let y = startY;
  let curVx = vx;
  let curVy = vy;
  let warpsLeft = longSight ? 2 : 1;
  let whCooldown = 0;
  let bouncesLeft = ricochet ? 3 : 0;
  let hitGate = false;

  for (let i = 0; i < steps; i++) {
    const next = rk4Step(x, y, curVx, curVy, sector.bodies, h);
    x = next.x;
    y = next.y;
    curVx = next.vx;
    curVy = next.vy;
    if (whCooldown > 0) whCooldown -= h;

    // Forcefield side bounce preview
    if (bouncesLeft > 0) {
      if (x < PROBE_R) {
        x = PROBE_R;
        curVx = Math.abs(curVx) * 0.94;
        bouncesLeft--;
      } else if (x > WORLD_W - PROBE_R) {
        x = WORLD_W - PROBE_R;
        curVx = -Math.abs(curVx) * 0.94;
        bouncesLeft--;
      }
    }

    let breakHere = false;

    // Wormhole preview
    if (warpsLeft > 0 && whCooldown <= 0 && sector.wormholes.length === 2) {
      for (const w of sector.wormholes) {
        if (Math.hypot(x - w.x, y - w.y) <= w.r + PROBE_R * 0.6) {
          const dst = sector.wormholes.find((o) => o.id === w.target);
          if (dst) {
            const spd = Math.hypot(curVx, curVy) || 1;
            x = dst.x + (curVx / spd) * (dst.r + 6);
            y = dst.y + (curVy / spd) * (dst.r + 6);
            warpsLeft--;
            whCooldown = 0.25;
            breakHere = true;
            break;
          }
        }
      }
    }

    points.push({ x, y, breakHere });

    // Gate check
    if (Math.hypot(x - sector.gate.x, y - sector.gate.y) <= sector.gate.r + PROBE_R) {
      hitGate = true;
      break;
    }

    // Body crash stops prediction
    let crashed = false;
    for (const b of sector.bodies) {
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
 * Create a live flight state when launching from the sector's launch pad.
 */
export function createFlight(sector, vx, vy, ownedRelics = []) {
  // Reset per-shot graze flags on bodies
  for (const b of sector.bodies) b.grazed = false;

  const mainProbe = {
    id: "main",
    isTwin: false,
    x: sector.launch.x,
    y: sector.launch.y,
    vx,
    vy,
    alive: true,
    trail: [{ x: sector.launch.x, y: sector.launch.y }],
    whCooldown: 0,
    wallBounces: hasRelic(ownedRelics, "ricochet_field") ? 3 : 0,
    tether: null, // { bodyId, orbitR, charge, dir }
  };

  const probes = [mainProbe];

  if (hasRelic(ownedRelics, "twin_probe")) {
    const angle = 0.14; // ~8 deg companion spread
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    probes.push({
      id: "twin",
      isTwin: true,
      x: sector.launch.x,
      y: sector.launch.y,
      vx: (vx * cos - vy * sin) * 0.96,
      vy: (vx * sin + vy * cos) * 0.96,
      alive: true,
      trail: [{ x: sector.launch.x, y: sector.launch.y }],
      whCooldown: 0,
      wallBounces: hasRelic(ownedRelics, "ricochet_field") ? 2 : 0,
      tether: null,
    });
  }

  return {
    probes,
    elapsed: 0,
    chain: 0,
    crystalsThisShot: 0,
    grazesThisShot: 0,
    settled: false,
    outcome: null, // 'warp' | 'crash' | 'mine' | 'oob' | 'timeout' | 'recall'
    nearestGrappleId: null,
  };
}

/**
 * Step active flight physics by `dt` seconds.
 * Returns an array of gameplay events for scoring, audio, and VFX.
 */
export function stepFlight(sector, flight, dt, holding, ownedRelics = []) {
  const events = [];
  if (flight.settled) return events;

  flight.elapsed += dt;
  const substeps = 4;
  const h = dt / substeps;
  const hasMagWake = hasRelic(ownedRelics, "magnetic_wake");
  const hasGraviton = hasRelic(ownedRelics, "graviton_drive");
  const hasAegis = hasRelic(ownedRelics, "aegis_hull");
  const hasNova = hasRelic(ownedRelics, "perihelion_nova");
  const main = flight.probes[0];

  // Update tether lock / release on main probe
  if (main.alive) {
    if (holding && !main.tether) {
      const target = findGrappleTarget(sector, main, ownedRelics);
      if (target) {
        const dx = main.x - target.x;
        const dy = main.y - target.y;
        const dist = Math.max(target.r + 20, Math.hypot(dx, dy));
        // Determine current angular direction (CW or CCW)
        const cross = dx * main.vy - dy * main.vx;
        const dir = cross >= 0 ? 1 : -1;
        main.tether = { bodyId: target.id, orbitR: dist, charge: 0, dir };
        events.push({ type: "tether_lock", x: main.x, y: main.y, bodyId: target.id });
      }
    } else if (!holding && main.tether) {
      const charge = main.tether.charge;
      const bodyId = main.tether.bodyId;
      main.tether = null;
      if (charge > 0.12) {
        const boost = 1 + (0.2 + charge * 0.34);
        main.vx *= boost;
        main.vy *= boost;
        // Clamp extreme speed
        const spd = Math.hypot(main.vx, main.vy);
        if (spd > 780) {
          main.vx = (main.vx / spd) * 780;
          main.vy = (main.vy / spd) * 780;
        }
        events.push({ type: "tether_release", x: main.x, y: main.y, charge, bodyId });
      } else {
        events.push({ type: "tether_cancel", x: main.x, y: main.y, bodyId });
      }
    }
  }

  for (let s = 0; s < substeps; s++) {
    if (flight.settled) break;

    for (const probe of flight.probes) {
      if (!probe.alive) continue;
      if (probe.whCooldown > 0) probe.whCooldown = Math.max(0, probe.whCooldown - h);

      // Gravity integration
      const next = rk4Step(probe.x, probe.y, probe.vx, probe.vy, sector.bodies, h);
      probe.x = next.x;
      probe.y = next.y;
      probe.vx = next.vx;
      probe.vy = next.vy;

      // Active orbit tether constraint + slingshot overcharge
      if (probe.tether) {
        const body = sector.bodies.find((b) => b.id === probe.tether.bodyId);
        if (!body) {
          probe.tether = null;
        } else {
          const dx = probe.x - body.x;
          const dy = probe.y - body.y;
          const d = Math.hypot(dx, dy) || 1;
          const nx = dx / d;
          const ny = dy / d;
          const minSafeR = body.r + 18;
          // Gently tighten orbit slightly toward comfortable slingshot radius
          probe.tether.orbitR = Math.max(minSafeR, probe.tether.orbitR - 14 * h);

          // Damp radial velocity so the probe circularizes cleanly without crashing
          const vRad = probe.vx * nx + probe.vy * ny;
          probe.vx -= nx * vRad * Math.min(1, 14 * h);
          probe.vy -= ny * vRad * Math.min(1, 14 * h);

          // Correct distance gently onto orbit radius
          const err = d - probe.tether.orbitR;
          probe.x -= nx * err * Math.min(1, 12 * h);
          probe.y -= ny * err * Math.min(1, 12 * h);

          // Tangential acceleration builds slingshot speed & charge
          const tx = -ny * probe.tether.dir;
          const ty = nx * probe.tether.dir;
          const vTan = probe.vx * tx + probe.vy * ty;
          const targetV = hasGraviton ? 470 : 410;
          if (vTan < targetV) {
            const accelT = hasGraviton ? 380 : 280;
            probe.vx += tx * accelT * h;
            probe.vy += ty * accelT * h;
          }
          const chargeRate = hasGraviton ? 1.55 : 1.05;
          probe.tether.charge = Math.min(1, probe.tether.charge + chargeRate * h);
        }
      }

      // Magnetic Wake gently pulls nearby crystals toward the probe
      if (hasMagWake) {
        for (const c of sector.crystals) {
          if (!c.alive) continue;
          const dx = probe.x - c.x;
          const dy = probe.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d > 2 && d < 62) {
            const pull = 195 * h;
            c.x += (dx / d) * pull;
            c.y += (dy / d) * pull;
          }
        }
      }

      // Crystals & Resonance Keys
      for (const c of sector.crystals) {
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
            gateJustUnlocked: c.isKey && isGateUnlocked(sector),
          });
        }
      }

      // Solar Bumpers (elastic ricochet)
      for (const bp of sector.bumpers) {
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
          const minBounce = 340;
          if (spd < minBounce) {
            const scale = minBounce / (spd || 1);
            probe.vx *= scale;
            probe.vy *= scale;
          }
          bp.flash = 1;
          events.push({ type: "bumper", x: bp.x, y: bp.y });
        }
      }

      // Wormholes
      if (probe.whCooldown <= 0 && sector.wormholes.length === 2) {
        for (const w of sector.wormholes) {
          if (Math.hypot(probe.x - w.x, probe.y - w.y) <= w.r + PROBE_R * 0.5) {
            const dst = sector.wormholes.find((o) => o.id === w.target);
            if (dst) {
              const spd = Math.hypot(probe.vx, probe.vy) || 1;
              probe.x = dst.x + (probe.vx / spd) * (dst.r + 7);
              probe.y = dst.y + (probe.vy / spd) * (dst.r + 7);
              probe.whCooldown = 0.3;
              probe.tether = null;
              probe.trail.push({ x: probe.x, y: probe.y, breakHere: true });
              events.push({
                type: "wormhole",
                fromX: w.x,
                fromY: w.y,
                toX: dst.x,
                toY: dst.y,
              });
              break;
            }
          }
        }
      }

      // Warp Gate check
      const gateD = Math.hypot(probe.x - sector.gate.x, probe.y - sector.gate.y);
      if (gateD <= sector.gate.r + PROBE_R * 0.6) {
        if (isGateUnlocked(sector)) {
          flight.settled = true;
          flight.outcome = "warp";
          events.push({ type: "gate_warp", x: sector.gate.x, y: sector.gate.y });
          break;
        } else {
          // Locked gate gently deflects the probe so you can still grab keys!
          const nx = (probe.x - sector.gate.x) / (gateD || 1);
          const ny = (probe.y - sector.gate.y) / (gateD || 1);
          probe.x = sector.gate.x + nx * (sector.gate.r + PROBE_R + 2);
          probe.y = sector.gate.y + ny * (sector.gate.r + PROBE_R + 2);
          const vn = probe.vx * nx + probe.vy * ny;
          if (vn < 0) {
            probe.vx -= 1.85 * vn * nx;
            probe.vy -= 1.85 * vn * ny;
          }
          events.push({ type: "gate_locked", x: sector.gate.x, y: sector.gate.y });
        }
      }

      // Celestial Body Crash & Perihelion Graze
      for (const b of sector.bodies) {
        const dx = probe.x - b.x;
        const dy = probe.y - b.y;
        const d = Math.hypot(dx, dy);

        // Collision with body core
        if (d <= b.r + PROBE_R * 0.8) {
          if (!probe.isTwin && hasAegis && !sector.aegisUsed) {
            sector.aegisUsed = true;
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
            events.push({
              type: "planet_crash",
              x: probe.x,
              y: probe.y,
              isTwin: probe.isTwin,
              bodyKind: b.kind,
            });
          }
          break;
        }

        // Perihelion Graze (main probe skimming inside the Roche ring!)
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
            bodyX: b.x,
            bodyY: b.y,
            isSingularity: isSing,
            chain: flight.chain,
          });
          // Perihelion Nova blasts nearby crystals and mines
          if (hasNova) {
            const novaR = 96;
            events.push({ type: "nova", x: probe.x, y: probe.y, r: novaR });
            for (const c of sector.crystals) {
              if (c.alive && Math.hypot(c.x - probe.x, c.y - probe.y) <= novaR) {
                c.alive = false;
                flight.chain += 1;
                flight.crystalsThisShot += 1;
                events.push({
                  type: c.isKey ? "key" : "crystal",
                  x: c.x,
                  y: c.y,
                  chain: flight.chain,
                  gateJustUnlocked: c.isKey && isGateUnlocked(sector),
                });
              }
            }
            for (const m of sector.mines) {
              if (m.alive && Math.hypot(m.x - probe.x, m.y - probe.y) <= novaR) {
                m.alive = false;
                events.push({ type: "mine_cleared", x: m.x, y: m.y });
              }
            }
          }
        }
      }

      if (!probe.alive) continue;

      // Mines
      for (const m of sector.mines) {
        if (!m.alive) continue;
        const dx = probe.x - m.x;
        const dy = probe.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d <= m.r + PROBE_R) {
          m.alive = false;
          if (!probe.isTwin && hasAegis && !sector.aegisUsed) {
            sector.aegisUsed = true;
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

      // Side Forcefield Walls (if relic owned)
      if (probe.wallBounces > 0) {
        if (probe.x < PROBE_R) {
          probe.x = PROBE_R;
          probe.vx = Math.abs(probe.vx) * 0.94;
          probe.wallBounces -= 1;
          events.push({ type: "wall_bounce", x: PROBE_R, y: probe.y });
        } else if (probe.x > WORLD_W - PROBE_R) {
          probe.x = WORLD_W - PROBE_R;
          probe.vx = -Math.abs(probe.vx) * 0.94;
          probe.wallBounces -= 1;
          events.push({ type: "wall_bounce", x: WORLD_W - PROBE_R, y: probe.y });
        }
      }

      // Out of bounds
      if (
        probe.x < -34 ||
        probe.x > WORLD_W + 34 ||
        probe.y < -34 ||
        probe.y > WORLD_H + 34
      ) {
        probe.alive = false;
        probe.tether = null;
        events.push({ type: "oob", x: probe.x, y: probe.y, isTwin: probe.isTwin });
      }
    }
  }

  // Record smooth trails
  for (const probe of flight.probes) {
    if (!probe.alive) continue;
    probe.trail.push({ x: probe.x, y: probe.y });
    if (probe.trail.length > 54) probe.trail.shift();
  }

  // Highlight nearest eligible grapple body for HUD indicator
  if (main.alive && !main.tether) {
    const tgt = findGrappleTarget(sector, main, ownedRelics);
    flight.nearestGrappleId = tgt ? tgt.id : null;
  } else if (main.tether) {
    flight.nearestGrappleId = main.tether.bodyId;
  } else {
    flight.nearestGrappleId = null;
  }

  // Settle flight once all probes have expired or time limit reached
  if (!flight.settled) {
    const anyAlive = flight.probes.some((p) => p.alive);
    if (!anyAlive) {
      flight.settled = true;
      const lastMainEv = [...events]
        .reverse()
        .find((e) => !e.isTwin && (e.type === "planet_crash" || e.type === "mine_hit" || e.type === "oob"));
      flight.outcome = lastMainEv
        ? lastMainEv.type === "mine_hit"
          ? "mine"
          : lastMainEv.type === "oob"
            ? "oob"
            : "crash"
        : "crash";
    } else if (flight.elapsed >= MAX_FLIGHT_SECONDS) {
      flight.settled = true;
      flight.outcome = "timeout";
      events.push({ type: "timeout", x: main.x, y: main.y });
    }
  }

  return events;
}
