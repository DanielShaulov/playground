/**
 * Canvas 2D renderer and pure UI hit-box layout for Perihelion.
 * Uses a 400 x 720 logical world fitted uniformly inside any portrait viewport,
 * with full-bleed cosmic starfield & nebula filling the entire screen.
 */

import { WORLD_W, WORLD_H, FINAL_SECTOR, planetTheme, isGateUnlocked, remainingKeys } from "./core/sectors.js";
import { RELIC_BY_ID, hasRelic } from "./core/relics.js";
import { PROBE_R } from "./core/physics.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Compute uniform world-to-screen transform for any stage size.
 */
export function computeViewport(stageW, stageH) {
  const scale = Math.min(stageW / WORLD_W, stageH / WORLD_H);
  const ox = (stageW - WORLD_W * scale) * 0.5;
  const oy = (stageH - WORLD_H * scale) * 0.5;
  return {
    scale,
    ox,
    oy,
    stageW,
    stageH,
    toWorld(sx, sy) {
      return { x: (sx - ox) / scale, y: (sy - oy) / scale };
    },
  };
}

export function hitRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Compute clickable UI rectangles in world coordinates for the current state.
 * Every touch target is >= 50u tall (>= 44px even on iPhone SE 320px width).
 */
export function uiRects(scene, run, hasSavedRun) {
  if (scene === "title") {
    if (hasSavedRun) {
      return {
        resume: { x: 42, y: 428, w: 316, h: 64 },
        start: { x: 42, y: 506, w: 316, h: 60 },
        daily: { x: 42, y: 578, w: 316, h: 58 },
        mute: { x: 324, y: 654, w: 60, h: 50 },
      };
    }
    return {
      start: { x: 42, y: 468, w: 316, h: 66 },
      daily: { x: 42, y: 548, w: 316, h: 60 },
      mute: { x: 324, y: 654, w: 60, h: 50 },
    };
  }
  if (!run) return {};
  if (run.phase === "draft") {
    return {
      cards: run.draftChoices.map((id, i) => ({
        id,
        x: 26,
        y: 256 + i * 110,
        w: 348,
        h: 94,
      })),
    };
  }
  if (run.phase === "victory" || run.phase === "over") {
    return {
      primary: { x: 42, y: 472, w: 316, h: 64 },
      secondary: { x: 42, y: 548, w: 316, h: 58 },
      home: { x: 100, y: 618, w: 200, h: 52 },
    };
  }
  if (run.phase === "flight") {
    return {
      recall: { x: 266, y: 656, w: 118, h: 52 },
    };
  }
  return {
    mute: { x: 326, y: 656, w: 58, h: 50 },
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Create a self-contained VFX & starfield renderer.
 */
export function createRenderer() {
  // Normalized full-bleed background stars (0..1 across entire stage)
  const stars = Array.from({ length: 110 }, (_, i) => ({
    nx: ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1,
    ny: ((Math.sin(i * 311.7) * 43758.5453) % 1 + 1) % 1,
    r: 0.55 + (i % 5) * 0.28,
    alpha: 0.22 + ((i * 37) % 65) / 100,
    twinkle: 1.2 + (i % 7) * 0.45,
    phase: i * 1.13,
    tint: i % 9 === 0 ? "#bae6fd" : i % 11 === 0 ? "#fde68a" : "#e2e8f0",
  }));

  let particles = [];
  let rings = [];
  let popups = [];
  let shake = 0;
  let flash = 0;
  let flashColor = "#fbbf24";

  function addBurst(x, y, color, count = 16, speed = 150) {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const sp = speed * (0.35 + Math.random() * 0.85);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 1.6 + Math.random() * 2.4,
        life: 0.35 + Math.random() * 0.38,
        maxLife: 0.72,
        color,
      });
    }
    if (particles.length > 260) particles.splice(0, particles.length - 260);
  }

  function addRing(x, y, color, maxR = 54, dur = 0.45, lineWidth = 2.5) {
    rings.push({ x, y, color, maxR, life: dur, maxLife: dur, lineWidth });
  }

  function addPopup(x, y, text, color = "#67e8f9", size = 14) {
    const cx = Math.max(46, Math.min(WORLD_W - 46, x));
    const cy = Math.max(48, Math.min(WORLD_H - 70, y));
    popups.push({ x: cx, y: cy, text, color, size, life: 0.95, maxLife: 0.95 });
  }

  function pushEventFx(events, { showPopups = true } = {}) {
    const pop = (x, y, text, color, size) => {
      if (showPopups) addPopup(x, y, text, color, size);
    };
    for (const ev of events) {
      if (ev.type === "crystal") {
        addBurst(ev.x, ev.y, "#67e8f9", 14, 155);
        addRing(ev.x, ev.y, "#22d3ee", 34, 0.32, 2);
        if (ev.points !== undefined) {
          const label = ev.chain > 1 ? `+${ev.points} ×${ev.chain}` : `+${ev.points}`;
          pop(ev.x, ev.y - 10, label, "#67e8f9", ev.chain > 2 ? 16 : 14);
        }
        if (ev.siphonProbe) pop(ev.x, ev.y - 28, "+1 PROBE!", "#4ade80", 15);
      } else if (ev.type === "key") {
        addBurst(ev.x, ev.y, "#fde047", 24, 190);
        addRing(ev.x, ev.y, "#fbbf24", 62, 0.5, 3);
        pop(
          ev.x,
          ev.y - 12,
          ev.gateJustUnlocked ? "GATE UNLOCKED!" : `KEY +${ev.points ?? 250}`,
          "#fde047",
          16,
        );
        shake = Math.max(shake, 5);
      } else if (ev.type === "graze") {
        const col = ev.isSingularity ? "#f97316" : "#fbbf24";
        addBurst(ev.x, ev.y, col, 18, 175);
        addRing(ev.x, ev.y, col, 52, 0.42, 2.5);
        if (ev.points !== undefined) {
          pop(
            ev.x,
            ev.y - 14,
            ev.isSingularity ? `SINGULARITY GRAZE +${ev.points}` : `GRAZE! +${ev.points}`,
            col,
            14,
          );
        }
        shake = Math.max(shake, 4);
      } else if (ev.type === "nova") {
        addRing(ev.x, ev.y, "#fb923c", ev.r, 0.45, 3.5);
        addBurst(ev.x, ev.y, "#fdba74", 22, 220);
      } else if (ev.type === "bumper") {
        addBurst(ev.x, ev.y, "#fde047", 12, 140);
        addRing(ev.x, ev.y, "#fbbf24", 42, 0.3, 2.5);
        if (ev.points !== undefined) pop(ev.x, ev.y - 14, `+${ev.points}`, "#fde047", 13);
        shake = Math.max(shake, 3);
      } else if (ev.type === "wormhole") {
        addRing(ev.fromX, ev.fromY, "#2dd4bf", 46, 0.4, 2.5);
        addRing(ev.toX, ev.toY, "#818cf8", 54, 0.45, 2.5);
        addBurst(ev.toX, ev.toY, "#a5b4fc", 16, 150);
      } else if (ev.type === "tether_lock") {
        addRing(ev.x, ev.y, "#2dd4bf", 34, 0.28, 2);
      } else if (ev.type === "tether_release") {
        addBurst(ev.x, ev.y, "#5eead4", 16, 170);
        addRing(ev.x, ev.y, "#fbbf24", 48, 0.35, 2.5);
        if (ev.points !== undefined) pop(ev.x, ev.y - 14, `WHIP! +${ev.points}`, "#5eead4", 14);
      } else if (ev.type === "aegis_bounce") {
        addBurst(ev.x, ev.y, "#60a5fa", 20, 180);
        addRing(ev.x, ev.y, "#93c5fd", 58, 0.42, 3);
        pop(ev.x, ev.y - 16, "AEGIS SAVED!", "#93c5fd", 14);
        shake = Math.max(shake, 5);
      } else if (ev.type === "wall_bounce") {
        addBurst(ev.x, ev.y, "#818cf8", 10, 120);
        addRing(ev.x, ev.y, "#818cf8", 32, 0.28, 2);
      } else if (ev.type === "gate_locked") {
        addRing(ev.x, ev.y, "#a78bfa", 44, 0.32, 2);
        pop(ev.x, ev.y + 34, "BREAK KEY PRISMS!", "#fde047", 13);
      } else if (ev.type === "gate_warp") {
        addBurst(ev.x, ev.y, "#fde047", 36, 240);
        addRing(ev.x, ev.y, "#fbbf24", 110, 0.65, 4);
        if (showPopups) {
          flash = 0.45;
          flashColor = "#fde047";
          shake = Math.max(shake, 6);
        }
      } else if (ev.type === "planet_crash" || ev.type === "mine_hit") {
        addBurst(ev.x, ev.y, "#f87171", ev.isTwin ? 12 : 26, 200);
        addRing(ev.x, ev.y, "#ef4444", ev.isTwin ? 30 : 62, 0.45, 3);
        if (!ev.isTwin && showPopups) {
          shake = Math.max(shake, 9);
          flash = 0.28;
          flashColor = "#ef4444";
        }
      } else if (ev.type === "mine_cleared") {
        addBurst(ev.x, ev.y, "#fb923c", 14, 150);
      }
    }
  }

  function updateFx(dt) {
    shake = Math.max(0, shake - dt * 26);
    flash = Math.max(0, flash - dt * 1.8);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.18, dt);
      p.vy *= Math.pow(0.18, dt);
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const r of rings) r.life -= dt;
    rings = rings.filter((r) => r.life > 0);
    for (const pp of popups) {
      pp.y -= 32 * dt;
      pp.life -= dt;
    }
    popups = popups.filter((pp) => pp.life > 0);
  }

  function clearFx() {
    particles = [];
    rings = [];
    popups = [];
    shake = 0;
    flash = 0;
  }

  // --- Background ------------------------------------------------------------

  function drawBackdrop(ctx, stageW, stageH, t) {
    const bg = ctx.createLinearGradient(0, 0, 0, stageH);
    bg.addColorStop(0, "#050814");
    bg.addColorStop(0.52, "#0b1126");
    bg.addColorStop(1, "#130d24");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, stageW, stageH);

    // Subtle breathing nebula washes
    const drawNebula = (cx, cy, rad, col) => {
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rad);
      g.addColorStop(0, col);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    };
    drawNebula(
      stageW * (0.2 + 0.04 * Math.sin(t * 0.25)),
      stageH * 0.28,
      Math.max(stageW, stageH) * 0.44,
      "rgba(56, 189, 248, 0.075)",
    );
    drawNebula(
      stageW * (0.82 + 0.04 * Math.cos(t * 0.2)),
      stageH * 0.65,
      Math.max(stageW, stageH) * 0.46,
      "rgba(168, 85, 247, 0.085)",
    );
    drawNebula(
      stageW * 0.5,
      stageH * 0.12,
      Math.max(stageW, stageH) * 0.3,
      "rgba(251, 191, 36, 0.05)",
    );

    // Twinkling starfield
    for (const s of stars) {
      const tw = 0.52 + 0.48 * Math.sin(t * s.twinkle + s.phase);
      ctx.globalAlpha = s.alpha * tw;
      ctx.fillStyle = s.tint;
      ctx.beginPath();
      ctx.arc(s.nx * stageW, s.ny * stageH, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- World Entities --------------------------------------------------------

  function drawSectorWorld(ctx, sector, state, t) {
    const ownedRelics = state.relics || [];
    const hasEdgeShield = hasRelic(ownedRelics, "ricochet_field");
    const unlocked = isGateUnlocked(sector);

    // Subtle astronomical framing & Forcefield side edges
    ctx.strokeStyle = hasEdgeShield
      ? "rgba(129, 140, 248, 0.55)"
      : "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = hasEdgeShield ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(2, 16);
    ctx.lineTo(2, WORLD_H - 16);
    ctx.moveTo(WORLD_W - 2, 16);
    ctx.lineTo(WORLD_W - 2, WORLD_H - 16);
    ctx.stroke();

    // Binary orbit tracks
    const drawnOrbits = new Set();
    for (const b of sector.bodies) {
      if (!b.orbit) continue;
      const key = `${b.orbit.cx},${b.orbit.cy},${b.orbit.rx}`;
      if (drawnOrbits.has(key)) continue;
      drawnOrbits.add(key);
      ctx.save();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(b.orbit.cx, b.orbit.cy, b.orbit.rx, b.orbit.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Wormhole link & vortices
    if (sector.wormholes.length === 2) {
      const [wa, wb] = sector.wormholes;
      ctx.save();
      ctx.strokeStyle = "rgba(99, 102, 241, 0.22)";
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wa.x, wa.y);
      ctx.quadraticCurveTo(WORLD_W * 0.5, (wa.y + wb.y) * 0.5, wb.x, wb.y);
      ctx.stroke();
      ctx.restore();

      for (const w of sector.wormholes) {
        ctx.save();
        ctx.translate(w.x, w.y);
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, w.r + 14);
        glow.addColorStop(0, w.color);
        glow.addColorStop(0.55, "rgba(45, 212, 191, 0.16)");
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, w.r + 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.rotate(w.spin);
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 2.2;
        for (let k = 0; k < 3; k++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.arc(0, 0, w.r, 0, 1.35);
          ctx.stroke();
        }
        ctx.fillStyle = "#060814";
        ctx.beginPath();
        ctx.arc(0, 0, w.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Key Prism -> Locked Gate energy filaments
    if (!unlocked) {
      ctx.save();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.28)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.6;
      for (const c of sector.crystals) {
        if (!c.alive || !c.isKey) continue;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(sector.gate.x, sector.gate.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Warp Gate
    drawWarpGate(ctx, sector.gate, unlocked, state.aimHitGate, t);

    // Celestial Bodies
    const nearestGrappleId = state.flight ? state.flight.nearestGrappleId : null;
    const activeTether =
      state.flight && state.flight.probes[0] ? state.flight.probes[0].tether : null;
    for (const b of sector.bodies) {
      drawBody(
        ctx,
        b,
        t,
        b.id === nearestGrappleId,
        activeTether && activeTether.bodyId === b.id ? activeTether : null,
      );
    }

    // Solar Bumpers
    for (const bp of sector.bumpers) {
      ctx.save();
      ctx.translate(bp.x, bp.y);
      const scale = 1 + bp.flash * 0.22;
      ctx.scale(scale, scale);
      if (bp.flash > 0) {
        ctx.fillStyle = `rgba(251, 191, 36, ${bp.flash * 0.45})`;
        ctx.beginPath();
        ctx.arc(0, 0, bp.r + 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#1c1917";
      ctx.strokeStyle = bp.flash > 0.1 ? "#ffffff" : "#fbbf24";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + t * 0.5;
        const px = Math.cos(a) * bp.r;
        const py = Math.sin(a) * bp.r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Asteroid Mines
    for (const m of sector.mines) {
      if (!m.alive) continue;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.phase * 0.5);
      const pulse = 0.65 + 0.35 * Math.sin(m.phase * 2.6);
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (m.r - 2), Math.sin(a) * (m.r - 2));
        ctx.lineTo(Math.cos(a) * (m.r + 5), Math.sin(a) * (m.r + 5));
        ctx.stroke();
      }
      ctx.fillStyle = "#2b1218";
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, m.r - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(248, 113, 113, ${pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Crystals & Resonance Keys
    for (const c of sector.crystals) {
      if (!c.alive) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(t * (c.isKey ? 1.1 : 1.7) + c.phase);
      if (c.isKey) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
        g.addColorStop(0, "rgba(253, 224, 71, 0.55)");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#fde047";
        ctx.strokeStyle = "#fffbeb";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i;
          const r = i % 2 === 0 ? c.r + 2 : c.r * 0.52;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
        g.addColorStop(0, "rgba(103, 232, 249, 0.45)");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#67e8f9";
        ctx.beginPath();
        ctx.moveTo(0, -c.r - 1);
        ctx.lineTo(c.r * 0.72, 0);
        ctx.lineTo(0, c.r + 1);
        ctx.lineTo(-c.r * 0.72, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ecfeff";
        ctx.beginPath();
        ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Launch Pad Beacon
    drawLaunchPad(ctx, sector.launch, state.phase === "aim", t);

    // Live Aiming Trajectory & Tension Ring
    if (state.aim && state.aim.pred) {
      drawAimOverlay(ctx, sector.launch, state.aim, t);
    }

    // Active Flight: Tether Beam, Trails, Probes
    if (state.flight) {
      drawFlight(ctx, sector, state.flight, ownedRelics, t);
    } else if (state.phase === "aim") {
      // Docked probe resting on Launch Pad
      drawProbeSprite(
        ctx,
        sector.launch.x,
        sector.launch.y,
        0,
        -1,
        false,
        hasRelic(ownedRelics, "aegis_hull") && !sector.aegisUsed,
      );
    }

    // VFX: Rings, Particles, Floating Popups
    for (const r of rings) {
      const p = 1 - r.life / r.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lineWidth * (1 - p * 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, 8 + p * r.maxR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const pt of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const pp of popups) {
      const a = Math.min(1, (pp.life / pp.maxLife) * 1.8);
      ctx.globalAlpha = a;
      ctx.font = `700 ${pp.size}px ${FONT}`;
      ctx.fillStyle = "rgba(5, 8, 20, 0.72)";
      ctx.fillText(pp.text, pp.x + 1, pp.y + 1.5);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.restore();
  }

  function drawWarpGate(ctx, gate, unlocked, aimHitGate, t) {
    ctx.save();
    ctx.translate(gate.x, gate.y);
    const pulse = Math.sin(gate.pulse) * 2.2;
    const boost = aimHitGate && unlocked ? 1.15 : 1;
    const r = (gate.r + pulse) * boost;

    if (unlocked) {
      const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, r + 26);
      halo.addColorStop(0, "rgba(253, 224, 71, 0.45)");
      halo.addColorStop(0.55, "rgba(56, 189, 248, 0.16)");
      halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r + 26, 0, Math.PI * 2);
      ctx.fill();

      // Rotating outer astrolabe arcs
      ctx.save();
      ctx.rotate(t * 0.9);
      ctx.strokeStyle = aimHitGate ? "#fef08a" : "#fbbf24";
      ctx.lineWidth = aimHitGate ? 3.2 : 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 1.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, Math.PI * 1.5, Math.PI * 1.9);
      ctx.stroke();
      ctx.restore();

      // Main ring & swirling core
      ctx.fillStyle = "rgba(251, 191, 36, 0.2)";
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-t * 2.1);
      ctx.strokeStyle = "rgba(186, 230, 253, 0.7)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.56, 0, Math.PI * 1.25);
      ctx.stroke();
    } else {
      // Locked gate
      ctx.fillStyle = "rgba(100, 116, 139, 0.14)";
      ctx.strokeStyle = "rgba(167, 139, 250, 0.55)";
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, gate.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      // Small lock diamond inside
      ctx.fillStyle = "rgba(253, 224, 71, 0.75)";
      ctx.font = `700 12px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("LOCKED", 0, 0);
    }
    ctx.restore();
  }

  function drawBody(ctx, b, t, isGrappleCandidate, activeTether) {
    const theme = planetTheme(b.kind);
    ctx.save();
    ctx.translate(b.x, b.y);

    // Gravity / Anti-gravity field lines
    if (b.kind === "repulsor") {
      const wave = (t * 0.75) % 1;
      ctx.strokeStyle = `rgba(253, 224, 71, ${(1 - wave) * 0.32})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 8 + wave * 54, 0, Math.PI * 2);
      ctx.stroke();
      const wave2 = (t * 0.75 + 0.5) % 1;
      ctx.strokeStyle = `rgba(253, 224, 71, ${(1 - wave2) * 0.32})`;
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 8 + wave2 * 54, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Subtle Roche graze ring
      ctx.strokeStyle =
        b.grazeFlash > 0
          ? `rgba(251, 191, 36, ${0.4 + b.grazeFlash * 0.6})`
          : b.kind === "singularity"
            ? "rgba(249, 115, 22, 0.34)"
            : "rgba(148, 163, 184, 0.16)";
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = b.grazeFlash > 0 ? 2.2 : 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, b.grazeR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Grapple lock-on reticle (shows player which planet Hold will tether to!)
    if (isGrappleCandidate || activeTether) {
      ctx.save();
      ctx.rotate(t * (activeTether ? 2.4 : 0.9));
      ctx.strokeStyle = activeTether ? "#2dd4bf" : "rgba(45, 212, 191, 0.58)";
      ctx.lineWidth = activeTether ? 2.6 : 1.6;
      const rr = b.r + 12;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, rr, -0.28, 0.28);
        ctx.stroke();
      }
      ctx.restore();

      // Active tether charge ring around planet
      if (activeTether && activeTether.charge > 0.02) {
        ctx.strokeStyle = activeTether.charge > 0.7 ? "#fde047" : "#5eead4";
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          b.r + 18,
          -Math.PI * 0.5,
          -Math.PI * 0.5 + Math.PI * 2 * activeTether.charge,
        );
        ctx.stroke();
      }
    }

    // Back half of planetary ring
    if (b.ring) {
      ctx.save();
      ctx.rotate(b.ringTilt);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.38)";
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r * 1.75, b.r * 0.42, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Atmospheric bloom
    const glow = ctx.createRadialGradient(0, 0, b.r * 0.5, 0, 0, b.r + 28);
    glow.addColorStop(0, theme.glow);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 28, 0, Math.PI * 2);
    ctx.fill();

    if (b.kind === "singularity") {
      // Accretion swirl disk
      ctx.save();
      ctx.rotate(t * 1.9);
      const acc = ctx.createRadialGradient(0, 0, b.r * 0.72, 0, 0, b.r + 18);
      acc.addColorStop(0, "rgba(251, 146, 60, 0.92)");
      acc.addColorStop(0.45, "rgba(168, 85, 247, 0.58)");
      acc.addColorStop(1, "transparent");
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Event horizon core
      ctx.fillStyle = "#04030a";
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Shaded 3D sphere
      const sphere = ctx.createRadialGradient(
        -b.r * 0.35,
        -b.r * 0.35,
        b.r * 0.1,
        0,
        0,
        b.r,
      );
      sphere.addColorStop(0, theme.rim);
      sphere.addColorStop(0.32, theme.base);
      sphere.addColorStop(1, theme.deep);
      ctx.fillStyle = sphere;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();

      // Subtle clipped latitude bands for tactile richness
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(-b.r, -b.r * 0.36, b.r * 2, b.r * 0.22);
      ctx.fillRect(-b.r, b.r * 0.16, b.r * 2, b.r * 0.16);
      ctx.restore();

      if (b.kind === "repulsor") {
        // Plus / Push icon glint in center of Magnetar
        ctx.strokeStyle = "rgba(255, 251, 235, 0.9)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(7, 0);
        ctx.moveTo(0, -7);
        ctx.lineTo(0, 7);
        ctx.stroke();
      }
    }

    // Front half of planetary ring
    if (b.ring) {
      ctx.save();
      ctx.rotate(b.ringTilt);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.62)";
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r * 1.75, b.r * 0.42, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawLaunchPad(ctx, launch, ready, t) {
    ctx.save();
    ctx.translate(launch.x, launch.y);
    const pulse = ready ? 0.5 + 0.5 * Math.sin(t * 3.4) : 0.2;
    ctx.strokeStyle = `rgba(251, 191, 36, ${0.22 + pulse * 0.28})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 19 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAimOverlay(ctx, launch, aim, t) {
    const { pred, power, pullDx, pullDy, startX, startY, curX, curY } = aim;

    // Subtle relative thumb anchor line (never obscures the probe)
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(startX, startY, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(curX, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tension power ring around Launch Pad
    const powerCol = pred.hitGate ? "#fde047" : power > 0.8 ? "#fb923c" : "#38bdf8";
    ctx.strokeStyle = powerCol;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(launch.x, launch.y, 25, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * power);
    ctx.stroke();

    // Small pull-back vector stem behind probe
    const mag = Math.hypot(pullDx, pullDy) || 1;
    const stem = Math.min(34, mag * 0.26);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(launch.x, launch.y);
    ctx.lineTo(launch.x - (pullDx / mag) * stem, launch.y - (pullDy / mag) * stem);
    ctx.stroke();

    // Live RK4 bending dotted trajectory preview
    const pts = pred.points;
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const frac = 1 - i / pts.length;
      const rad = 1.6 + frac * 2.5;
      ctx.fillStyle = pred.hitGate
        ? `rgba(253, 224, 71, ${0.18 + frac * 0.82})`
        : `rgba(186, 230, 253, ${0.14 + frac * 0.78})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Power readout chip beside launch pad
    ctx.fillStyle = powerCol;
    ctx.font = `700 11px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(power * 100)}%`, launch.x, launch.y + 42);
    ctx.restore();
  }

  function drawFlight(ctx, sector, flight, ownedRelics, t) {
    const main = flight.probes[0];

    // Grapple tether beam & tangent exit vector
    if (main && main.alive && main.tether) {
      const body = sector.bodies.find((b) => b.id === main.tether.bodyId);
      if (body) {
        ctx.save();
        ctx.strokeStyle = "#2dd4bf";
        ctx.lineWidth = 2.4;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -t * 48;
        ctx.beginPath();
        ctx.moveTo(main.x, main.y);
        ctx.lineTo(body.x, body.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tangent whip release arrow showing exact exit direction!
        const spd = Math.hypot(main.vx, main.vy) || 1;
        const ux = main.vx / spd;
        const uy = main.vy / spd;
        const arrowLen = 36 + main.tether.charge * 34;
        const ex = main.x + ux * arrowLen;
        const ey = main.y + uy * arrowLen;
        ctx.strokeStyle = main.tether.charge > 0.65 ? "#fde047" : "#5eead4";
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(main.x, main.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // Arrowhead
        const ang = Math.atan2(uy, ux);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang - 0.5) * 9, ey - Math.sin(ang - 0.5) * 9);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang + 0.5) * 9, ey - Math.sin(ang + 0.5) * 9);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw probe trails & sprites
    const aegisActive = hasRelic(ownedRelics, "aegis_hull") && !sector.aegisUsed;
    for (const probe of flight.probes) {
      if (!probe.alive && probe.trail.length < 2) continue;
      const tr = probe.trail;
      for (let i = 1; i < tr.length; i++) {
        if (tr[i].breakHere) continue;
        const a = i / tr.length;
        ctx.strokeStyle = probe.isTwin
          ? `rgba(186, 230, 253, ${a * 0.65})`
          : `rgba(251, 191, 36, ${a * 0.88})`;
        ctx.lineWidth = (probe.isTwin ? 2.4 : 4.2) * a;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
        ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
      if (probe.alive) {
        const spd = Math.hypot(probe.vx, probe.vy) || 1;
        drawProbeSprite(
          ctx,
          probe.x,
          probe.y,
          probe.vx / spd,
          probe.vy / spd,
          probe.isTwin,
          !probe.isTwin && aegisActive,
        );
      }
    }
  }

  function drawProbeSprite(ctx, x, y, ux, uy, isTwin, hasAegis) {
    ctx.save();
    ctx.translate(x, y);
    const r = isTwin ? PROBE_R * 0.72 : PROBE_R;

    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.8);
    glow.addColorStop(0, isTwin ? "rgba(186,230,253,0.75)" : "rgba(253,224,71,0.85)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.8, 0, Math.PI * 2);
    ctx.fill();

    if (hasAegis) {
      ctx.strokeStyle = "rgba(96, 165, 250, 0.82)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = isTwin ? "#e0f2fe" : "#fef08a";
    ctx.beginPath();
    ctx.moveTo(r + 3, 0);
    ctx.lineTo(-r, -r * 0.78);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r, r * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --- HUD & Overlays (in world coordinates) ---------------------------------

  function drawInGameChrome(ctx, run, muted, t) {
    // Sector Name & subtle hint banner at top
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
    ctx.font = `700 13px ${FONT}`;
    const tag = run.mode === "daily" ? "DAILY · " : "";
    ctx.fillText(`${tag}SECTOR ${run.sectorNum} — ${run.sector.name.toUpperCase()}`, WORLD_W * 0.5, 24);

    // Hint or active status subtitle
    let sub = "";
    let subCol = "rgba(148, 163, 184, 0.85)";
    const keysLeft = remainingKeys(run.sector);
    if (run.phase === "flight" && run.flight && run.flight.probes[0].tether) {
      sub = "ORBIT LOCKED — RELEASE TO WHIP!";
      subCol = "#5eead4";
    } else if (run.phase === "flight" && run.flight && run.flight.nearestGrappleId) {
      sub = "HOLD ANYWHERE TO GRAPPLE ORBIT";
      subCol = "#2dd4bf";
    } else if (keysLeft > 0) {
      sub = `${keysLeft} KEY PRISM${keysLeft > 1 ? "S" : ""} REMAINING`;
      subCol = "#fde047";
    } else if (run.sector.hint && run.shotsInSector === 0) {
      sub = run.sector.hint;
    }

    if (sub) {
      ctx.fillStyle = subCol;
      ctx.font = `500 11.5px ${FONT}`;
      ctx.fillText(sub, WORLD_W * 0.5, 42);
    }

    // Bottom thumb-bar: Reserve Probes (left) + Relics + Action Button (right)
    const barY = 682;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
    ctx.font = `700 10px ${MONO}`;
    ctx.fillText("PROBES", 20, 668);

    for (let i = 0; i < run.maxProbes; i++) {
      const px = 26 + i * 19;
      const py = barY + 2;
      const active = i < run.probes;
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = active ? "#fbbf24" : "rgba(148, 163, 184, 0.2)";
      ctx.strokeStyle = active ? "#fef08a" : "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5.5, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-5.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Owned Relics badges next to probes
    if (run.relics.length > 0) {
      const startX = 132;
      const maxShow = Math.min(run.relics.length, 6);
      for (let i = 0; i < maxShow; i++) {
        const rel = RELIC_BY_ID[run.relics[i]];
        if (!rel) continue;
        const rx = startX + i * 24;
        const ry = barY;
        ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
        ctx.strokeStyle = rel.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(rx, ry, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = rel.color;
        ctx.font = `700 11px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(rel.glyph, rx, ry + 0.5);
      }
      if (run.relics.length > 6) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = `700 10px ${MONO}`;
        ctx.textAlign = "left";
        ctx.fillText(`+${run.relics.length - 6}`, startX + 6 * 24 - 6, barY + 1);
      }
    }

    // Right-side thumb button: RECALL while flying, Mute while aiming
    const rects = uiRects("play", run, false);
    if (run.phase === "flight" && rects.recall) {
      const r = rects.recall;
      roundRect(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(248, 113, 113, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#fca5a5";
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("↻ RECALL", r.x + r.w * 0.5, r.y + r.h * 0.5);
    } else if (rects.mute) {
      drawMuteButton(ctx, rects.mute, muted);
    }
    ctx.restore();
  }

  function drawMuteButton(ctx, r, muted) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = "rgba(30, 41, 59, 0.78)";
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = muted ? "#64748b" : "#e2e8f0";
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(muted ? "SFX ×" : "SFX ♪", r.x + r.w * 0.5, r.y + r.h * 0.5);
    ctx.restore();
  }

  function drawButton(ctx, r, label, sublabel, style = "primary") {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 16);
    if (style === "primary") {
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, "#fbbf24");
      g.addColorStop(1, "#f59e0b");
      ctx.fillStyle = g;
      ctx.fill();
    } else if (style === "secondary") {
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(30, 41, 59, 0.7)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = style === "primary" ? "#0b1120" : "#f1f5f9";
    ctx.font = `800 16px ${FONT}`;
    ctx.fillText(label, r.x + r.w * 0.5, r.y + r.h * (sublabel ? 0.39 : 0.51));
    if (sublabel) {
      ctx.fillStyle = style === "primary" ? "rgba(11, 17, 32, 0.72)" : "#94a3b8";
      ctx.font = `600 11px ${MONO}`;
      ctx.fillText(sublabel, r.x + r.w * 0.5, r.y + r.h * 0.72);
    }
    ctx.restore();
  }

  function drawTitleOverlay(ctx, bestScore, dailyLabel, savedRun, muted, t) {
    ctx.save();
    // Soft vignette behind text
    const vig = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    vig.addColorStop(0, "rgba(5, 8, 20, 0.55)");
    vig.addColorStop(0.45, "rgba(5, 8, 20, 0.35)");
    vig.addColorStop(1, "rgba(5, 8, 20, 0.88)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Soft dark halo behind title block so animated demo stays readable
    const titleHalo = ctx.createRadialGradient(WORLD_W * 0.5, 195, 20, WORLD_W * 0.5, 195, 190);
    titleHalo.addColorStop(0, "rgba(5, 8, 20, 0.82)");
    titleHalo.addColorStop(0.65, "rgba(5, 8, 20, 0.45)");
    titleHalo.addColorStop(1, "transparent");
    ctx.fillStyle = titleHalo;
    ctx.fillRect(0, 20, WORLD_W, 340);

    // Emblem
    ctx.save();
    ctx.translate(WORLD_W * 0.5, 134);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 15, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    const sun = ctx.createRadialGradient(-4, -4, 2, 0, 0, 17);
    sun.addColorStop(0, "#fef9c3");
    sun.addColorStop(0.5, "#fbbf24");
    sun.addColorStop(1, "#ea580c");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    // Orbiting mini-probe dot
    const oa = t * 1.9;
    const ex = Math.cos(oa) * 44;
    const ey = Math.sin(oa) * 15;
    const rx = ex * Math.cos(-0.35) - ey * Math.sin(-0.35);
    const ry = ex * Math.sin(-0.35) + ey * Math.cos(-0.35);
    ctx.fillStyle = "#67e8f9";
    ctx.beginPath();
    ctx.arc(rx, ry, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Title
    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText("PERIHELION", WORLD_W * 0.5, 206);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = `500 13.5px ${FONT}`;
    ctx.fillText("Pull to sling · Hold in flight to grapple orbit", WORLD_W * 0.5, 234);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Twelve sectors to the Singularity", WORLD_W * 0.5, 254);

    if (bestScore > 0) {
      roundRect(ctx, 118, 280, 164, 30, 15);
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#fde047";
      ctx.font = `700 12px ${MONO}`;
      ctx.fillText(`BEST ${bestScore.toLocaleString()}`, WORLD_W * 0.5, 299);
    }

    const rects = uiRects("title", null, Boolean(savedRun));
    if (savedRun && rects.resume) {
      drawButton(
        ctx,
        rects.resume,
        `RESUME SECTOR ${savedRun.sectorNum}`,
        `${savedRun.score.toLocaleString()} PTS · ${savedRun.probes} PROBES`,
        "primary",
      );
      drawButton(ctx, rects.start, "NEW RUN", "FRESH COSMIC SEED", "secondary");
      drawButton(ctx, rects.daily, "DAILY ORBIT", dailyLabel, "ghost");
    } else {
      drawButton(ctx, rects.start, "LAUNCH RUN", "TWELVE SECTORS + ENDLESS", "primary");
      drawButton(ctx, rects.daily, "DAILY ORBIT", `SEED ${dailyLabel}`, "secondary");
    }
    drawMuteButton(ctx, rects.mute, muted);
    ctx.restore();
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let cy = y;
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = words[i];
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }

  function drawDraftOverlay(ctx, run) {
    ctx.save();
    ctx.fillStyle = "rgba(5, 8, 20, 0.88)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const sum = run.lastClearSummary;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fde047";
    ctx.font = `800 12px ${MONO}`;
    ctx.fillText(`SECTOR ${run.sectorNum} CLEARED`, WORLD_W * 0.5, 62);

    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(sum ? sum.sectorName : "Warp Complete", WORLD_W * 0.5, 96);

    // Bonus breakdown pills
    if (sum) {
      const parts = [`+${sum.baseBonus} WARP`];
      if (sum.ace) parts.push(`ACE +${sum.aceBonus}`);
      if (sum.allCleared) parts.push(`ALL CRYSTALS +${sum.perfectBonus}`);
      if (sum.probesGained > 0) parts.push(`+${sum.probesGained} PROBE`);
      ctx.fillStyle = "#5eead4";
      ctx.font = `700 11.5px ${MONO}`;
      ctx.fillText(parts.join(" · "), WORLD_W * 0.5, 126);
    }

    ctx.fillStyle = "#cbd5e1";
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText("INSTALL ONE ORBITAL RELIC", WORLD_W * 0.5, 224);

    const rects = uiRects("play", run, false);
    for (const card of rects.cards || []) {
      const rel = RELIC_BY_ID[card.id];
      if (!rel) continue;
      roundRect(ctx, card.x, card.y, card.w, card.h, 18);
      ctx.fillStyle = "rgba(18, 25, 44, 0.96)";
      ctx.fill();
      ctx.strokeStyle = rel.color;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Relic glyph badge
      const bx = card.x + 42;
      const by = card.y + card.h * 0.5;
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.beginPath();
      ctx.arc(bx, by, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rel.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = rel.color;
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(rel.glyph, bx, by + 1);

      // Relic Name & wrapped Description
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f8fafc";
      ctx.font = `800 16px ${FONT}`;
      ctx.fillText(rel.name, card.x + 80, card.y + 34);

      ctx.fillStyle = "#94a3b8";
      ctx.font = `500 12.5px ${FONT}`;
      drawWrappedText(ctx, rel.short, card.x + 80, card.y + 54, card.w - 96, 16);
    }

    ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
    ctx.font = `600 11px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(
      `NEXT: SECTOR ${run.sectorNum + 1}${run.sectorNum + 1 > FINAL_SECTOR ? " (ENDLESS)" : ` OF ${FINAL_SECTOR}`}`,
      WORLD_W * 0.5,
      628,
    );
    ctx.restore();
  }

  function drawEndOverlay(ctx, run, bestScore, isNewBest, dailyLabel) {
    const isVictory = run.phase === "victory";
    ctx.save();
    ctx.fillStyle = "rgba(5, 8, 20, 0.88)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.textAlign = "center";
    ctx.fillStyle = isVictory ? "#fde047" : "#f87171";
    ctx.font = `800 12px ${MONO}`;
    ctx.fillText(
      isVictory ? "SINGULARITY CONQUERED" : "ALL PROBES LOST",
      WORLD_W * 0.5,
      78,
    );

    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(isVictory ? "PERIHELION REACHED" : `SECTOR ${run.sectorNum}`, WORLD_W * 0.5, 116);

    // Big Score Card
    roundRect(ctx, 32, 146, 336, 286, 20);
    ctx.fillStyle = "rgba(18, 25, 44, 0.94)";
    ctx.fill();
    ctx.strokeStyle = isVictory ? "rgba(251, 191, 36, 0.55)" : "rgba(148, 163, 184, 0.22)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 11px ${MONO}`;
    ctx.fillText(isNewBest ? "NEW HIGH SCORE!" : "FINAL SCORE", WORLD_W * 0.5, 178);

    ctx.fillStyle = isNewBest ? "#fde047" : "#f8fafc";
    ctx.font = `800 42px ${FONT}`;
    ctx.fillText(run.score.toLocaleString(), WORLD_W * 0.5, 224);

    // 2x2 Stats Grid
    const stats = [
      ["SECTOR", `${run.sectorNum}`],
      ["BEST SCORE", bestScore.toLocaleString()],
      ["CRYSTALS", `${run.crystalsTotal}`],
      ["GRAZES / MAX CHAIN", `${run.grazesTotal} / ×${Math.max(1, run.bestChain)}`],
    ];
    for (let i = 0; i < stats.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = 54 + col * 164;
      const sy = 264 + row * 62;
      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = `700 10px ${MONO}`;
      ctx.fillText(stats[i][0], sx, sy);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = `700 17px ${FONT}`;
      ctx.fillText(stats[i][1], sx, sy + 22);
    }

    // Relic strip inside end card
    if (run.relics.length > 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = `700 10px ${MONO}`;
      ctx.fillText("RELICS", 54, 386);
      const maxR = Math.min(run.relics.length, 10);
      for (let i = 0; i < maxR; i++) {
        const rel = RELIC_BY_ID[run.relics[i]];
        if (!rel) continue;
        const rx = 64 + i * 28;
        const ry = 408;
        ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
        ctx.strokeStyle = rel.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(rx, ry, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = rel.color;
        ctx.font = `700 11px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(rel.glyph, rx, ry + 0.5);
      }
    }

    const rects = uiRects("play", run, false);
    if (isVictory) {
      drawButton(ctx, rects.primary, "ENTER ENDLESS →", "KEEP YOUR RELICS & CLIMB", "primary");
      drawButton(ctx, rects.secondary, "NEW RUN", "START AT SECTOR 1", "secondary");
    } else {
      drawButton(
        ctx,
        rects.primary,
        run.mode === "daily" ? "RETRY DAILY ORBIT" : "LAUNCH AGAIN",
        run.mode === "daily" ? dailyLabel : "NEW COSMIC SEED",
        "primary",
      );
      drawButton(
        ctx,
        rects.secondary,
        run.mode === "daily" ? "STANDARD RUN" : "DAILY ORBIT",
        run.mode === "daily" ? "RANDOM SEED" : dailyLabel,
        "secondary",
      );
    }
    drawButton(ctx, rects.home, "TITLE SCREEN", "", "ghost");
    ctx.restore();
  }

  // --- Main Render Entry -----------------------------------------------------

  function render(ctx, vp, viewState, t) {
    drawBackdrop(ctx, vp.stageW, vp.stageH, t);

    ctx.save();
    const sx = shake > 0.1 ? (Math.random() - 0.5) * shake * 2 : 0;
    const sy = shake > 0.1 ? (Math.random() - 0.5) * shake * 2 : 0;
    ctx.translate(vp.ox + sx * vp.scale, vp.oy + sy * vp.scale);
    ctx.scale(vp.scale, vp.scale);

    if (viewState.scene === "title") {
      drawSectorWorld(ctx, viewState.demoSector, {
        phase: "flight",
        flight: viewState.demoFlight,
        relics: [],
      }, t);
      drawTitleOverlay(
        ctx,
        viewState.bestScore,
        viewState.dailyLabel,
        viewState.savedRun,
        viewState.muted,
        t,
      );
    } else if (viewState.run) {
      const run = viewState.run;
      drawSectorWorld(
        ctx,
        run.sector,
        {
          phase: run.phase,
          flight: run.flight,
          relics: run.relics,
          aim: viewState.aim,
          aimHitGate: Boolean(viewState.aim && viewState.aim.pred && viewState.aim.pred.hitGate),
        },
        t,
      );

      if (run.phase === "aim" || run.phase === "flight") {
        drawInGameChrome(ctx, run, viewState.muted, t);
      } else if (run.phase === "draft") {
        drawDraftOverlay(ctx, run);
      } else if (run.phase === "victory" || run.phase === "over") {
        drawEndOverlay(ctx, run, viewState.bestScore, viewState.isNewBest, viewState.dailyLabel);
      }
    }

    if (flash > 0.01) {
      ctx.fillStyle = flashColor;
      ctx.globalAlpha = flash * 0.25;
      ctx.fillRect(-40, -40, WORLD_W + 80, WORLD_H + 80);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  return {
    render,
    pushEventFx,
    updateFx,
    clearFx,
  };
}
