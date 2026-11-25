/**
 * Canvas 2D renderer and pure UI hit-box layout for Perihelion.
 * Features:
 * - Warped spacetime gravity grid responding to planets, repulsors & singularities
 * - Living 24-orbit Constellation Star Chart across 4 themed chapters + Ship Hangar
 * - Hands-on animated tutorials (Ghost Thumb pull on Orbit 1, Slow-Mo Grapple on Orbit 2)
 * - Diegetic leader-line callouts introducing new cosmic bodies on first sight
 * - Ghost previous-shot trace & live curved RK4 Orbit Grapple exit trajectory
 * - Sleek non-blocking 3-star Clear Ribbon (zero powerup card modals!)
 */

import {
  WORLD_W,
  WORLD_H,
  CHAPTERS,
  ORBIT_SPECS,
  ORBIT_BY_ID,
  planetTheme,
  isGateUnlocked,
  remainingKeys,
} from "./core/campaign.js";
import { SHIPS, getShip, isShipUnlocked } from "./core/ships.js";
import { PROBE_R, warpSpacePoint, predictTrajectory, pullToVelocity } from "./core/physics.js";
import {
  totalStars,
  chapterStars,
  isChapterUnlocked,
  isOrbitUnlocked,
  nextPlayableOrbitId,
  DAILY_STAGES,
} from "./core/progress.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

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
 * Compute clickable UI rectangles in 400 x 720 world coordinates.
 * Every touch target is >= 50u tall (>= 44px even on 320px iPhone SE).
 */
export function uiRects(scene, session, profile, chartChapter = 0) {
  if (scene === "title") {
    const stars = totalStars(profile);
    if (stars > 0 || profile.seenPullTutorial) {
      return {
        primary: { x: 42, y: 428, w: 316, h: 64 },
        chart: { x: 42, y: 506, w: 316, h: 60 },
        daily: { x: 42, y: 578, w: 316, h: 58 },
        mute: { x: 324, y: 654, w: 60, h: 50 },
      };
    }
    return {
      primary: { x: 42, y: 468, w: 316, h: 66 },
      chart: { x: 42, y: 548, w: 316, h: 60 },
      mute: { x: 324, y: 654, w: 60, h: 50 },
    };
  }

  if (scene === "chart") {
    const tabs = CHAPTERS.map((ch, i) => ({
      chapter: i,
      x: 16 + i * 93,
      y: 18,
      w: 88,
      h: 54,
    }));
    const nodes = ORBIT_SPECS.filter((o) => o.chapter === chartChapter).map((o) => ({
      id: o.id,
      cx: o.mapPos.x,
      cy: o.mapPos.y,
      x: o.mapPos.x - 32,
      y: o.mapPos.y - 32,
      w: 64,
      h: 64,
    }));
    const ships = SHIPS.map((s, i) => ({
      id: s.id,
      x: 16 + i * 93,
      y: 522,
      w: 88,
      h: 82,
    }));
    return {
      tabs,
      nodes,
      ships,
      daily: { x: 16, y: 646, w: 298, h: 56 },
      mute: { x: 324, y: 646, w: 60, h: 56 },
    };
  }

  if (!session) return {};

  if (session.phase === "clear") {
    const hasNext = Boolean(session.clearResult && session.clearResult.nextOrbitId);
    return {
      next: hasNext ? { x: 36, y: 530, w: 328, h: 62 } : null,
      replay: { x: 36, y: 604, w: 158, h: 56 },
      chart: { x: 206, y: 604, w: 158, h: 56 },
    };
  }

  if (session.phase === "daily_over" || session.phase === "daily_won") {
    return {
      retryDaily: { x: 42, y: 492, w: 316, h: 62 },
      chart: { x: 42, y: 568, w: 316, h: 58 },
    };
  }

  if (session.phase === "flight") {
    return {
      recall: { x: 266, y: 656, w: 118, h: 52 },
    };
  }

  // Aim phase bottom bar
  return {
    chartBtn: { x: 16, y: 656, w: 94, h: 50 },
    restartBtn: session.mode === "campaign" ? { x: 118, y: 656, w: 96, h: 50 } : null,
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

function drawStarIcon(ctx, cx, cy, r, filled, strokeCol = "rgba(148,163,184,0.4)") {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.44;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
    ctx.fill();
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

export function createRenderer() {
  const stars = Array.from({ length: 120 }, (_, i) => ({
    nx: ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1,
    ny: ((Math.sin(i * 311.7) * 43758.5453) % 1 + 1) % 1,
    r: 0.55 + (i % 5) * 0.27,
    alpha: 0.2 + ((i * 37) % 68) / 100,
    twinkle: 1.1 + (i % 7) * 0.45,
    phase: i * 1.13,
    tint: i % 9 === 0 ? "#bae6fd" : i % 11 === 0 ? "#fde68a" : "#e2e8f0",
  }));

  let particles = [];
  let rings = [];
  let popups = [];
  let shake = 0;
  let flash = 0;
  let flashColor = "#fbbf24";

  function addBurst(x, y, color, count = 16, speed = 155) {
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
    const cx = Math.max(48, Math.min(WORLD_W - 48, x));
    const cy = Math.max(48, Math.min(WORLD_H - 72, y));
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
      } else if (ev.type === "key") {
        addBurst(ev.x, ev.y, "#fde047", 24, 190);
        addRing(ev.x, ev.y, "#fbbf24", 62, 0.5, 3);
        pop(
          ev.x,
          ev.y - 12,
          ev.gateJustUnlocked ? "GATE UNLOCKED!" : `KEY +${ev.points ?? 250}`,
          "#fde047",
          15,
        );
        shake = Math.max(shake, 5);
      } else if (ev.type === "graze") {
        const col = ev.isSingularity ? "#f97316" : "#fbbf24";
        addBurst(ev.x, ev.y, col, 18, 175);
        addRing(ev.x, ev.y, col, 52, 0.42, 2.5);
        if (ev.points !== undefined) {
          pop(ev.x, ev.y - 14, `GRAZE! +${ev.points}`, col, 14);
        }
        shake = Math.max(shake, 4);
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
        addRing(ev.x, ev.y, "#2dd4bf", 38, 0.3, 2.2);
      } else if (ev.type === "tether_release") {
        addBurst(ev.x, ev.y, "#5eead4", 18, 175);
        addRing(ev.x, ev.y, "#fbbf24", 50, 0.36, 2.5);
        if (ev.points !== undefined) pop(ev.x, ev.y - 14, `WHIP! +${ev.points}`, "#5eead4", 14);
      } else if (ev.type === "aegis_bounce") {
        addBurst(ev.x, ev.y, "#60a5fa", 20, 180);
        addRing(ev.x, ev.y, "#93c5fd", 58, 0.42, 3);
        pop(ev.x, ev.y - 16, "AEGIS SHIELD!", "#93c5fd", 14);
        shake = Math.max(shake, 5);
      } else if (ev.type === "gate_locked") {
        addRing(ev.x, ev.y, "#a78bfa", 44, 0.32, 2);
        pop(ev.x, ev.y + 34, "BREAK KEY PRISMS!", "#fde047", 13);
      } else if (ev.type === "gate_warp") {
        addBurst(ev.x, ev.y, "#fde047", 36, 240);
        addRing(ev.x, ev.y, "#fbbf24", 115, 0.65, 4);
        if (showPopups) {
          flash = 0.42;
          flashColor = "#fde047";
          shake = Math.max(shake, 6);
        }
      } else if (ev.type === "planet_crash" || ev.type === "mine_hit") {
        addBurst(ev.x, ev.y, "#f87171", ev.isTwin ? 12 : 24, 195);
        addRing(ev.x, ev.y, "#ef4444", ev.isTwin ? 30 : 58, 0.42, 3);
        if (!ev.isTwin && showPopups) {
          shake = Math.max(shake, 8);
          flash = 0.22;
          flashColor = "#ef4444";
        }
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
      pp.y -= 30 * dt;
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

  // --- Full-Bleed Cosmic Backdrop --------------------------------------------

  function drawBackdrop(ctx, stageW, stageH, chapterIdx, t) {
    const ch = CHAPTERS[chapterIdx] || CHAPTERS[0];
    const bg = ctx.createLinearGradient(0, 0, 0, stageH);
    bg.addColorStop(0, ch.bgTop);
    bg.addColorStop(0.55, ch.bgMid);
    bg.addColorStop(1, ch.bgBot);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, stageW, stageH);

    const drawNebula = (cx, cy, rad, col) => {
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rad);
      g.addColorStop(0, col);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    };
    drawNebula(
      stageW * (0.22 + 0.04 * Math.sin(t * 0.25)),
      stageH * 0.28,
      Math.max(stageW, stageH) * 0.45,
      ch.glow,
    );
    drawNebula(
      stageW * (0.8 + 0.04 * Math.cos(t * 0.2)),
      stageH * 0.68,
      Math.max(stageW, stageH) * 0.44,
      "rgba(168, 85, 247, 0.07)",
    );

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

  // --- Warped Spacetime Grid (Visualizes Invisible Gravity Wells!) -----------

  function drawWarpedGrid(ctx, bodies) {
    if (!bodies || bodies.length === 0) return;
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.065)";
    ctx.lineWidth = 1;
    const step = 40;
    const cols = Math.floor(WORLD_W / step);
    const rows = Math.floor(WORLD_H / step);

    // Precompute warped grid nodes
    const pts = [];
    for (let r = 1; r < rows; r++) {
      const row = [];
      for (let c = 0; c <= cols; c++) {
        row.push(warpSpacePoint(c * step, r * step, bodies));
      }
      pts.push(row);
    }

    // Horizontal warped lines
    for (let r = 0; r < pts.length; r++) {
      ctx.beginPath();
      for (let c = 0; c < pts[r].length; c++) {
        const p = pts[r][c];
        if (c === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // Vertical warped lines
    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      for (let r = 0; r < pts.length; r++) {
        const p = pts[r][c];
        if (r === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- World Entities --------------------------------------------------------

  function drawOrbitWorld(ctx, orbit, state, t) {
    const ship = getShip(state.shipId || "solaris");
    const unlocked = isGateUnlocked(orbit);

    // Warped spacetime gravity fabric
    drawWarpedGrid(ctx, orbit.bodies);

    // Binary orbit tracks
    const drawnOrbits = new Set();
    for (const b of orbit.bodies) {
      if (!b.orbit) continue;
      const key = `${b.orbit.cx},${b.orbit.cy},${b.orbit.rx}`;
      if (drawnOrbits.has(key)) continue;
      drawnOrbits.add(key);
      ctx.save();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.17)";
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(b.orbit.cx, b.orbit.cy, b.orbit.rx, b.orbit.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Ghost previous-shot trace for surgical micro-adjustments!
    if (state.lastTrail && state.lastTrail.length > 2 && state.phase === "aim") {
      ctx.save();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.26)";
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(state.lastTrail[0].x, state.lastTrail[0].y);
      for (let i = 1; i < state.lastTrail.length; i++) {
        if (state.lastTrail[i].breakHere) ctx.moveTo(state.lastTrail[i].x, state.lastTrail[i].y);
        else ctx.lineTo(state.lastTrail[i].x, state.lastTrail[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Wormholes
    if (orbit.wormholes.length === 2) {
      const [wa, wb] = orbit.wormholes;
      ctx.save();
      ctx.strokeStyle = "rgba(99, 102, 241, 0.24)";
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wa.x, wa.y);
      ctx.quadraticCurveTo(WORLD_W * 0.5, (wa.y + wb.y) * 0.5, wb.x, wb.y);
      ctx.stroke();
      ctx.restore();

      for (const w of orbit.wormholes) {
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

    // Key Prism -> Gate beams
    if (!unlocked) {
      ctx.save();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.30)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.6;
      for (const c of orbit.crystals) {
        if (!c.alive || !c.isKey) continue;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(orbit.gate.x, orbit.gate.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Warp Gate
    const exitHitGate = Boolean(
      state.flight && state.flight.grappleExit && state.flight.grappleExit.hitGate,
    );
    drawWarpGate(ctx, orbit.gate, unlocked, state.aimHitGate || exitHitGate, t);

    // Celestial Bodies
    const nearestGrappleId = state.flight ? state.flight.nearestGrappleId : null;
    const activeTether =
      state.flight && state.flight.probes[0] ? state.flight.probes[0].tether : null;
    for (const b of orbit.bodies) {
      drawBody(
        ctx,
        b,
        t,
        b.id === nearestGrappleId,
        activeTether && activeTether.bodyId === b.id ? activeTether : null,
        state.tutorialAssistActive && b.id === nearestGrappleId,
      );
    }

    // Solar Bumpers
    for (const bp of orbit.bumpers) {
      ctx.save();
      ctx.translate(bp.x, bp.y);
      const sc = 1 + bp.flash * 0.22;
      ctx.scale(sc, sc);
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
    for (const m of orbit.mines) {
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

    // Crystals & Key Prisms
    for (const c of orbit.crystals) {
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

    // Launch Pad
    drawLaunchPad(ctx, orbit.launch, state.phase === "aim", ship.color, t);

    // Diegetic Callouts (only before first drag on new-mechanic orbits)
    if (
      state.phase === "aim" &&
      !state.aim &&
      state.shots === 0 &&
      orbit.callouts &&
      orbit.callouts.length > 0
    ) {
      drawDiegeticCallouts(ctx, orbit.callouts);
    }

    // Interactive Animated Ghost Thumb Tutorial on Orbit 1 ("First Curve")!
    if (
      state.phase === "aim" &&
      !state.aim &&
      orbit.tutorial === "pull" &&
      state.shots === 0
    ) {
      drawPullGhostTutorial(ctx, orbit, state.shipId, t);
    }

    // Aiming Trajectory Preview
    if (state.aim && state.aim.pred) {
      drawAimOverlay(ctx, orbit.launch, state.aim);
    }

    // Active Flight OR Docked Probe
    if (state.flight) {
      drawFlight(ctx, orbit, state.flight, ship, t);
    } else if (state.phase === "aim") {
      drawProbeSprite(
        ctx,
        orbit.launch.x,
        orbit.launch.y,
        0,
        -1,
        false,
        ship.traits.aegisShield && !orbit.aegisUsed,
        ship.color,
      );
    }

    // Slow-Mo Grapple Tutorial Pill on Orbit 2 ("Orbit Whip")
    if (state.tutorialAssistActive && state.flight && state.flight.probes[0]) {
      const tethered = Boolean(state.flight.probes[0].tether);
      const readyToRelease = Boolean(state.flight.grappleExit && state.flight.grappleExit.hitGate);
      const pillText = !tethered
        ? "HOLD THUMB NOW → ORBIT PLANET"
        : readyToRelease
          ? "RELEASE NOW → WHIP INTO GATE!"
          : "KEEP HOLDING · AIM GOLD ARC AT GATE";
      const pillCol = readyToRelease ? "#fde047" : "#5eead4";
      drawCenterPill(ctx, 182, pillText, pillCol);
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

  function drawCenterPill(ctx, y, text, borderCol) {
    ctx.save();
    ctx.font = `800 12px ${MONO}`;
    const w = Math.min(356, ctx.measureText(text).width + 34);
    const x = (WORLD_W - w) * 0.5;
    roundRect(ctx, x, y - 18, w, 36, 18);
    ctx.fillStyle = "rgba(7, 11, 24, 0.92)";
    ctx.fill();
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = borderCol;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, WORLD_W * 0.5, y);
    ctx.restore();
  }

  function drawDiegeticCallouts(ctx, callouts) {
    ctx.save();
    ctx.font = `700 10.5px ${MONO}`;
    for (const c of callouts) {
      const dir = c.side === "left" ? -1 : 1;
      const anchorX = c.x + dir * 32;
      const anchorY = c.y - 24;
      const tw = ctx.measureText(c.text).width + 18;
      let bx = dir > 0 ? anchorX + 10 : anchorX - 10 - tw;
      bx = Math.max(14, Math.min(WORLD_W - 14 - tw, bx));
      const by = Math.max(58, Math.min(WORLD_H - 120, anchorY - 12));

      ctx.strokeStyle = c.color;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(c.x + dir * 18, c.y - 10);
      ctx.lineTo(dir > 0 ? bx : bx + tw, by + 12);
      ctx.stroke();

      ctx.globalAlpha = 0.94;
      roundRect(ctx, bx, by, tw, 24, 8);
      ctx.fillStyle = "rgba(8, 13, 28, 0.88)";
      ctx.fill();
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = c.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.text, bx + tw * 0.5, by + 12.5);
    }
    ctx.restore();
  }

  /**
   * Animated Ghost Thumb showing the exact Pull-Back Slingshot gesture on Orbit 1.
   */
  function drawPullGhostTutorial(ctx, orbit, shipId, t) {
    const cycle = (t * 0.42) % 1;
    // Smooth ease pull down, hold briefly, fade out
    const pullPhase = cycle < 0.55 ? cycle / 0.55 : cycle < 0.82 ? 1 : 1 - (cycle - 0.82) / 0.18;
    const ease = 1 - Math.pow(1 - Math.max(0, Math.min(1, pullPhase)), 2.5);
    const alpha = cycle > 0.82 ? Math.max(0, 1 - (cycle - 0.82) / 0.18) : 1;

    const sx = 264;
    const sy = 434;
    const targetPullDx = 48;
    const targetPullDy = -84;
    const cx = sx - targetPullDx * ease;
    const cy = sy - targetPullDy * ease;

    ctx.save();
    ctx.globalAlpha = alpha * 0.85;

    // Preview the gently curving demo trajectory while ghost pulls!
    const vel = pullToVelocity(targetPullDx * ease, targetPullDy * ease, shipId);
    if (vel) {
      const pred = predictTrajectory(orbit, orbit.launch.x, orbit.launch.y, vel.vx, vel.vy, shipId, 46);
      for (let i = 0; i < pred.points.length; i++) {
        const pt = pred.points[i];
        const f = 1 - i / pred.points.length;
        ctx.fillStyle = pred.hitGate
          ? `rgba(253, 224, 71, ${f * 0.55})`
          : `rgba(186, 230, 253, ${f * 0.42})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.5 + f * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Dashed pull vector from ghost start to ghost thumb
    ctx.strokeStyle = "rgba(253, 224, 71, 0.55)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Translucent thumb circle
    ctx.fillStyle = "rgba(253, 224, 71, 0.22)";
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Compact label pill below
    drawCenterPill(ctx, 560, "DRAG DOWN TO AIM · RELEASE TO SLING", "#fde047");
    ctx.restore();
  }

  function drawWarpGate(ctx, gate, unlocked, highlight, t) {
    ctx.save();
    ctx.translate(gate.x, gate.y);
    const pulse = Math.sin(gate.pulse) * 2.2;
    const boost = highlight && unlocked ? 1.15 : 1;
    const r = (gate.r + pulse) * boost;

    if (unlocked) {
      const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, r + 26);
      halo.addColorStop(0, "rgba(253, 224, 71, 0.48)");
      halo.addColorStop(0.55, "rgba(56, 189, 248, 0.16)");
      halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r + 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.rotate(t * 0.9);
      ctx.strokeStyle = highlight ? "#fef08a" : "#fbbf24";
      ctx.lineWidth = highlight ? 3.2 : 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 1.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, Math.PI * 1.5, Math.PI * 1.9);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "rgba(251, 191, 36, 0.22)";
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-t * 2.1);
      ctx.strokeStyle = "rgba(186, 230, 253, 0.72)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.56, 0, Math.PI * 1.25);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(100, 116, 139, 0.16)";
      ctx.strokeStyle = "rgba(167, 139, 250, 0.58)";
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, gate.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(253, 224, 71, 0.8)";
      ctx.font = `700 10.5px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("LOCKED", 0, 0);
    }
    ctx.restore();
  }

  function drawBody(ctx, b, t, isGrappleCandidate, activeTether, pulseTutorial) {
    const theme = planetTheme(b.kind);
    ctx.save();
    ctx.translate(b.x, b.y);

    if (b.kind === "repulsor") {
      const wave = (t * 0.75) % 1;
      ctx.strokeStyle = `rgba(253, 224, 71, ${(1 - wave) * 0.34})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 8 + wave * 54, 0, Math.PI * 2);
      ctx.stroke();
      const wave2 = (t * 0.75 + 0.5) % 1;
      ctx.strokeStyle = `rgba(253, 224, 71, ${(1 - wave2) * 0.34})`;
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 8 + wave2 * 54, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle =
        b.grazeFlash > 0
          ? `rgba(251, 191, 36, ${0.4 + b.grazeFlash * 0.6})`
          : b.kind === "singularity"
            ? "rgba(249, 115, 22, 0.36)"
            : "rgba(148, 163, 184, 0.18)";
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = b.grazeFlash > 0 ? 2.2 : 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, b.grazeR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (isGrappleCandidate || activeTether) {
      ctx.save();
      ctx.rotate(t * (activeTether ? 2.4 : 1.1));
      ctx.strokeStyle = activeTether || pulseTutorial ? "#2dd4bf" : "rgba(45, 212, 191, 0.62)";
      ctx.lineWidth = activeTether || pulseTutorial ? 2.8 : 1.7;
      const rr = b.r + 12 + (pulseTutorial ? Math.sin(t * 8) * 3 : 0);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, rr, -0.32, 0.32);
        ctx.stroke();
      }
      ctx.restore();

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

    // Back half of ring
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

    const glow = ctx.createRadialGradient(0, 0, b.r * 0.5, 0, 0, b.r + 28);
    glow.addColorStop(0, theme.glow);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 28, 0, Math.PI * 2);
    ctx.fill();

    if (b.kind === "singularity") {
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

      ctx.fillStyle = "#04030a";
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const sphere = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.35, b.r * 0.1, 0, 0, b.r);
      sphere.addColorStop(0, theme.rim);
      sphere.addColorStop(0.32, theme.base);
      sphere.addColorStop(1, theme.deep);
      ctx.fillStyle = sphere;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(-b.r, -b.r * 0.36, b.r * 2, b.r * 0.22);
      ctx.fillRect(-b.r, b.r * 0.16, b.r * 2, b.r * 0.16);
      ctx.restore();

      if (b.kind === "repulsor") {
        ctx.strokeStyle = "rgba(255, 251, 235, 0.92)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(7, 0);
        ctx.moveTo(0, -7);
        ctx.lineTo(0, 7);
        ctx.stroke();
      }
    }

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

  function drawLaunchPad(ctx, launch, ready, color, t) {
    ctx.save();
    ctx.translate(launch.x, launch.y);
    const pulse = ready ? 0.5 + 0.5 * Math.sin(t * 3.4) : 0.2;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.22 + pulse * 0.3;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 19 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAimOverlay(ctx, launch, aim) {
    const { pred, power, pullDx, pullDy, startX, startY, curX, curY } = aim;
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.26)";
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

    const powerCol = pred.hitGate ? "#fde047" : power > 0.8 ? "#fb923c" : "#38bdf8";
    ctx.strokeStyle = powerCol;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(launch.x, launch.y, 25, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * power);
    ctx.stroke();

    const mag = Math.hypot(pullDx, pullDy) || 1;
    const stem = Math.min(34, mag * 0.26);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(launch.x, launch.y);
    ctx.lineTo(launch.x - (pullDx / mag) * stem, launch.y - (pullDy / mag) * stem);
    ctx.stroke();

    const pts = pred.points;
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const frac = 1 - i / pts.length;
      const rad = 1.6 + frac * 2.5;
      ctx.fillStyle = pred.hitGate
        ? `rgba(253, 224, 71, ${0.2 + frac * 0.8})`
        : `rgba(186, 230, 253, ${0.14 + frac * 0.78})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = powerCol;
    ctx.font = `700 11px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(power * 100)}%`, launch.x, launch.y + 42);
    ctx.restore();
  }

  function drawFlight(ctx, orbit, flight, ship, t) {
    const main = flight.probes[0];

    // Live Curved RK4 Exit Trajectory during Orbit Grapple!
    if (main && main.alive && main.tether) {
      const body = orbit.bodies.find((b) => b.id === main.tether.bodyId);
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

        if (flight.grappleExit && flight.grappleExit.points.length > 0) {
          const pts = flight.grappleExit.points;
          const hit = flight.grappleExit.hitGate;
          for (let i = 0; i < pts.length; i++) {
            const pt = pts[i];
            const frac = 1 - i / pts.length;
            ctx.fillStyle = hit
              ? `rgba(253, 224, 71, ${0.25 + frac * 0.75})`
              : `rgba(94, 234, 212, ${0.18 + frac * 0.72})`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 1.5 + frac * 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    const aegisActive = ship.traits.aegisShield && !orbit.aegisUsed;
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
          ship.color,
        );
      }
    }
  }

  function drawProbeSprite(ctx, x, y, ux, uy, isTwin, hasAegis, color = "#fef08a") {
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
      ctx.strokeStyle = "rgba(96, 165, 250, 0.86)";
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = isTwin ? "#e0f2fe" : color;
    ctx.beginPath();
    ctx.moveTo(r + 3.5, 0);
    ctx.lineTo(-r, -r * 0.78);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r, r * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --- Shared Button Primitives ----------------------------------------------

  function drawMuteButton(ctx, r, muted) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = "rgba(18, 25, 44, 0.84)";
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = muted ? "#64748b" : "#e2e8f0";
    ctx.font = `700 13px ${FONT}`;
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
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.62)";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(24, 33, 54, 0.82)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = style === "primary" ? "#0b1120" : "#f1f5f9";
    ctx.font = `800 15.5px ${FONT}`;
    ctx.fillText(label, r.x + r.w * 0.5, r.y + r.h * (sublabel ? 0.38 : 0.51));
    if (sublabel) {
      ctx.fillStyle = style === "primary" ? "rgba(11, 17, 32, 0.72)" : "#94a3b8";
      ctx.font = `600 10.5px ${MONO}`;
      ctx.fillText(sublabel, r.x + r.w * 0.5, r.y + r.h * 0.72);
    }
    ctx.restore();
  }

  // --- Screens: Title, Constellation Star Chart, In-Game Chrome, Clear -------

  function drawTitleOverlay(ctx, profile, dailyLabel, muted, t) {
    ctx.save();
    const vig = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    vig.addColorStop(0, "rgba(5, 8, 20, 0.55)");
    vig.addColorStop(0.45, "rgba(5, 8, 20, 0.35)");
    vig.addColorStop(1, "rgba(5, 8, 20, 0.90)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const halo = ctx.createRadialGradient(WORLD_W * 0.5, 195, 20, WORLD_W * 0.5, 195, 195);
    halo.addColorStop(0, "rgba(5, 8, 20, 0.84)");
    halo.addColorStop(0.65, "rgba(5, 8, 20, 0.45)");
    halo.addColorStop(1, "transparent");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 20, WORLD_W, 340);

    // Animated Emblem
    ctx.save();
    ctx.translate(WORLD_W * 0.5, 134);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.78)";
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

    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText("PERIHELION", WORLD_W * 0.5, 206);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = `500 13.5px ${FONT}`;
    ctx.fillText("Pull to sling · Hold in flight to orbit", WORLD_W * 0.5, 234);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("24 handcrafted orbits across 4 constellations", WORLD_W * 0.5, 254);

    const stars = totalStars(profile);
    if (stars > 0) {
      roundRect(ctx, 114, 280, 172, 30, 15);
      ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
      ctx.fill();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.38)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#fde047";
      ctx.font = `700 12px ${MONO}`;
      ctx.fillText(`★ ${stars} / ${ORBIT_SPECS.length * 3} STARS`, WORLD_W * 0.5, 299);
    }

    const rects = uiRects("title", null, profile);
    if (stars > 0 || profile.seenPullTutorial) {
      const nextSpec = ORBIT_BY_ID[nextPlayableOrbitId(profile)];
      drawButton(
        ctx,
        rects.primary,
        `CONTINUE · ${nextSpec.name.toUpperCase()}`,
        `CHAPTER ${nextSpec.chapter + 1} · ORBIT ${nextSpec.index}`,
        "primary",
      );
      drawButton(
        ctx,
        rects.chart,
        "STAR CHART & SHIPS",
        `${stars} / 72 ★ COLLECTED`,
        "secondary",
      );
      drawButton(ctx, rects.daily, "DAILY GAUNTLET", `5 SECTORS · ${dailyLabel}`, "ghost");
    } else {
      drawButton(ctx, rects.primary, "START EXPEDITION", "INTERACTIVE ORBITAL GUIDE", "primary");
      drawButton(ctx, rects.chart, "STAR CHART", "4 CONSTELLATIONS · 4 SHIPS", "secondary");
    }
    drawMuteButton(ctx, rects.mute, muted);
    ctx.restore();
  }

  function drawChartScreen(ctx, profile, chartChapter, dailyLabel, muted, t) {
    const ch = CHAPTERS[chartChapter] || CHAPTERS[0];
    const rects = uiRects("chart", null, profile, chartChapter);
    const starsTotal = totalStars(profile);
    const chUnlocked = isChapterUnlocked(profile, chartChapter);
    const nextId = nextPlayableOrbitId(profile);

    ctx.save();

    // 1. Chapter Tabs at top
    for (const tab of rects.tabs) {
      const c = CHAPTERS[tab.chapter];
      const active = tab.chapter === chartChapter;
      const unlocked = isChapterUnlocked(profile, tab.chapter);
      roundRect(ctx, tab.x, tab.y, tab.w, tab.h, 12);
      ctx.fillStyle = active ? "rgba(24, 34, 58, 0.96)" : "rgba(12, 18, 34, 0.72)";
      ctx.fill();
      ctx.strokeStyle = active ? c.accent : "rgba(148, 163, 184, 0.22)";
      ctx.lineWidth = active ? 2 : 1.1;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = unlocked ? (active ? "#f8fafc" : "#cbd5e1") : "#64748b";
      ctx.font = `800 9.8px ${FONT}`;
      ctx.fillText(c.name.toUpperCase(), tab.x + tab.w * 0.5, tab.y + 22);

      ctx.font = `700 10px ${MONO}`;
      ctx.fillStyle = unlocked ? "#fbbf24" : "#64748b";
      const sub = unlocked ? `★ ${chapterStars(profile, tab.chapter)}/18` : `🔒 ${c.starsToUnlock}★`;
      ctx.fillText(sub, tab.x + tab.w * 0.5, tab.y + 40);
    }

    // Chapter Header Banner
    ctx.textAlign = "center";
    ctx.fillStyle = ch.accent;
    ctx.font = `700 11px ${MONO}`;
    ctx.fillText(`CONSTELLATION ${ch.num} · ${ch.subtitle.toUpperCase()}`, WORLD_W * 0.5, 92);

    // 2. Constellation Star Map (y = 100..475)
    const nodes = rects.nodes;
    // Draw constellation connecting lines
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const aClear = Boolean(profile.orbits[a.id]?.clear);
      const bUnlocked = isOrbitUnlocked(profile, b.id);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.cx, a.cy);
      ctx.lineTo(b.cx, b.cy);
      if (aClear) {
        ctx.strokeStyle = "rgba(251, 191, 36, 0.72)";
        ctx.lineWidth = 2.4;
      } else if (bUnlocked) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = 1.6;
      } else {
        ctx.strokeStyle = "rgba(71, 85, 105, 0.28)";
        ctx.setLineDash([3, 6]);
        ctx.lineWidth = 1.2;
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw star nodes
    for (const n of nodes) {
      const spec = ORBIT_BY_ID[n.id];
      const rec = profile.orbits[n.id];
      const unlocked = isOrbitUnlocked(profile, n.id);
      const isNext = n.id === nextId;

      ctx.save();
      ctx.translate(n.cx, n.cy);

      if (isNext && unlocked) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        ctx.strokeStyle = `rgba(253, 224, 71, ${0.3 + pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 23 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (rec?.clear) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
        g.addColorStop(0, "rgba(253, 224, 71, 0.55)");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = rec?.clear
        ? "#fbbf24"
        : unlocked
          ? "#1e293b"
          : "rgba(15, 23, 42, 0.75)";
      ctx.strokeStyle = rec?.clear
        ? "#fef08a"
        : unlocked
          ? ch.accent
          : "rgba(100, 116, 139, 0.45)";
      ctx.lineWidth = unlocked ? 2.2 : 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = rec?.clear ? "#0b1120" : unlocked ? "#f8fafc" : "#64748b";
      ctx.font = `800 13px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(unlocked ? `${spec.index}` : "·", 0, 0.5);

      // Orbit Name below node
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = unlocked ? "#e2e8f0" : "#64748b";
      ctx.font = `700 10.5px ${FONT}`;
      ctx.fillText(spec.name, 0, 31);

      // 3 miniature stars
      if (unlocked) {
        const sCount = rec ? rec.stars : 0;
        drawStarIcon(ctx, -12, 42, 5, sCount >= 1);
        drawStarIcon(ctx, 0, 42, 5, sCount >= 2);
        drawStarIcon(ctx, 12, 42, 5, sCount >= 3);
      }
      ctx.restore();
    }

    if (!chUnlocked) {
      drawCenterPill(
        ctx,
        280,
        `EARN ${ch.starsToUnlock} ★ (OR CLEAR CH. ${ch.num - 1}) TO UNLOCK`,
        ch.accent,
      );
    }

    // 3. Ship Hangar Strip (y = 492..634)
    ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, 492);
    ctx.lineTo(WORLD_W - 16, 492);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 10.5px ${MONO}`;
    ctx.fillText("PROBE HANGAR", 18, 511);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`★ ${starsTotal} / 72`, WORLD_W - 18, 511);

    for (const sRect of rects.ships) {
      const s = getShip(sRect.id);
      const unlocked = isShipUnlocked(s.id, starsTotal);
      const active = profile.selectedShip === s.id;
      roundRect(ctx, sRect.x, sRect.y, sRect.w, sRect.h, 14);
      ctx.fillStyle = active ? "rgba(25, 36, 62, 0.96)" : "rgba(14, 20, 36, 0.78)";
      ctx.fill();
      ctx.strokeStyle = active
        ? s.color
        : unlocked
          ? "rgba(148, 163, 184, 0.28)"
          : "rgba(71, 85, 105, 0.25)";
      ctx.lineWidth = active ? 2 : 1.1;
      ctx.stroke();

      // Mini probe icon
      drawProbeSprite(
        ctx,
        sRect.x + sRect.w * 0.5,
        sRect.y + 26,
        0,
        -1,
        false,
        s.traits.aegisShield,
        unlocked ? s.color : "#475569",
      );

      ctx.textAlign = "center";
      ctx.fillStyle = unlocked ? "#f8fafc" : "#64748b";
      ctx.font = `700 11.5px ${FONT}`;
      ctx.fillText(s.name, sRect.x + sRect.w * 0.5, sRect.y + 54);

      ctx.font = `700 9.5px ${MONO}`;
      ctx.fillStyle = active ? s.color : unlocked ? "#94a3b8" : "#64748b";
      ctx.fillText(
        active ? "ACTIVE" : unlocked ? "SELECT" : `🔒 ${s.starsRequired}★`,
        sRect.x + sRect.w * 0.5,
        sRect.y + 70,
      );
    }

    // Selected ship perk line
    const curShip = getShip(profile.selectedShip);
    ctx.textAlign = "center";
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `500 11.5px ${FONT}`;
    ctx.fillText(`${curShip.name}: ${curShip.perk}`, WORLD_W * 0.5, 626);

    // 4. Bottom Row: Daily Gauntlet + Mute
    drawButton(ctx, rects.daily, "DAILY GAUNTLET", `5 SECTORS · ${dailyLabel}`, "secondary");
    drawMuteButton(ctx, rects.mute, muted);
    ctx.restore();
  }

  function drawInGameChrome(ctx, session, muted) {
    const orbit = session.orbit;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(241, 245, 249, 0.9)";
    ctx.font = `700 13px ${FONT}`;
    const title =
      session.mode === "daily"
        ? `DAILY GAUNTLET · SECTOR ${session.dailyStage} / ${DAILY_STAGES}`
        : `${orbit.chapterName.toUpperCase()} ${orbit.index} — ${orbit.name.toUpperCase()}`;
    ctx.fillText(title, WORLD_W * 0.5, 24);

    // Sub-status line
    let sub = "";
    let subCol = "rgba(148, 163, 184, 0.88)";
    const keysLeft = remainingKeys(orbit);
    const leftCrystals = orbit.crystals.filter((c) => c.alive).length;
    if (session.phase === "flight" && session.flight && session.flight.probes[0].tether) {
      sub = "ORBIT LOCKED · RELEASE WHEN ARC HITS GATE";
      subCol = "#5eead4";
    } else if (session.phase === "flight" && session.flight && session.flight.nearestGrappleId) {
      sub = "HOLD ANYWHERE TO GRAPPLE ORBIT";
      subCol = "#2dd4bf";
    } else if (keysLeft > 0) {
      sub = `${keysLeft} KEY PRISM${keysLeft > 1 ? "S" : ""} LOCKING GATE`;
      subCol = "#fde047";
    } else if (session.mode === "campaign") {
      sub = `SHOT ${session.shots} · PAR ${orbit.par} · CRYSTALS ${orbit.totalCrystals - leftCrystals}/${orbit.totalCrystals}`;
    } else {
      sub = `PROBES ${session.probes}/${session.maxProbes} · SCORE ${session.score.toLocaleString()}`;
    }
    ctx.fillStyle = subCol;
    ctx.font = `600 11px ${MONO}`;
    ctx.fillText(sub, WORLD_W * 0.5, 42);

    // Bottom thumb controls
    const rects = uiRects("play", session, null);
    if (session.phase === "flight" && rects.recall) {
      const r = rects.recall;
      roundRect(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fillStyle = "rgba(30, 41, 59, 0.86)";
      ctx.fill();
      ctx.strokeStyle = "rgba(248, 113, 113, 0.58)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#fca5a5";
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("↻ RECALL", r.x + r.w * 0.5, r.y + r.h * 0.5);
    } else {
      if (rects.chartBtn) {
        roundRect(ctx, rects.chartBtn.x, rects.chartBtn.y, rects.chartBtn.w, rects.chartBtn.h, 14);
        ctx.fillStyle = "rgba(18, 25, 44, 0.84)";
        ctx.fill();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.fillStyle = "#e2e8f0";
        ctx.font = `700 12px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✦ CHART", rects.chartBtn.x + rects.chartBtn.w * 0.5, rects.chartBtn.y + rects.chartBtn.h * 0.5);
      }
      if (rects.restartBtn) {
        roundRect(
          ctx,
          rects.restartBtn.x,
          rects.restartBtn.y,
          rects.restartBtn.w,
          rects.restartBtn.h,
          14,
        );
        ctx.fillStyle = "rgba(18, 25, 44, 0.84)";
        ctx.fill();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.fillStyle = "#e2e8f0";
        ctx.font = `700 12px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          "↻ RESET",
          rects.restartBtn.x + rects.restartBtn.w * 0.5,
          rects.restartBtn.y + rects.restartBtn.h * 0.5,
        );
      }
      if (session.mode === "daily") {
        // Daily probe pips on bottom-left
        for (let i = 0; i < session.maxProbes; i++) {
          const px = 132 + i * 20;
          const py = 681;
          ctx.fillStyle = i < session.probes ? "#fbbf24" : "rgba(148, 163, 184, 0.22)";
          ctx.beginPath();
          ctx.moveTo(px, py - 7);
          ctx.lineTo(px + 5.5, py);
          ctx.lineTo(px, py + 7);
          ctx.lineTo(px - 5.5, py);
          ctx.closePath();
          ctx.fill();
        }
      }
      if (rects.mute) drawMuteButton(ctx, rects.mute, muted);
    }
    ctx.restore();
  }

  /**
   * Sleek bottom celebration sheet on Orbit Clear — zero powerup cards!
   */
  function drawClearSheet(ctx, session) {
    const res = session.clearResult;
    if (!res) return;
    ctx.save();

    // Gentle dim only over lower half so the cleared orbit remains visible!
    const grad = ctx.createLinearGradient(0, 260, 0, WORLD_H);
    grad.addColorStop(0, "rgba(5, 8, 20, 0)");
    grad.addColorStop(0.28, "rgba(5, 8, 20, 0.84)");
    grad.addColorStop(1, "rgba(5, 8, 20, 0.96)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 260, WORLD_W, WORLD_H - 260);

    roundRect(ctx, 20, 326, WORLD_W - 40, 356, 24);
    ctx.fillStyle = "rgba(15, 22, 40, 0.96)";
    ctx.fill();
    ctx.strokeStyle = "rgba(251, 191, 36, 0.45)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#fde047";
    ctx.font = `800 11.5px ${MONO}`;
    ctx.fillText(
      res.starsThisAttempt === 3 ? "PERFECT ORBIT" : "ORBIT CLEARED",
      WORLD_W * 0.5,
      356,
    );

    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(session.orbit.name, WORLD_W * 0.5, 386);

    // 3 Mastery Stars with explicit criteria labels
    const criteria = [
      { ok: true, label: "WARPED" },
      { ok: res.parMet, label: `PAR ${res.par} (${res.shots})` },
      { ok: res.allCrystals, label: "ALL CRYSTALS" },
    ];
    for (let i = 0; i < 3; i++) {
      const sx = 96 + i * 104;
      const sy = 430;
      drawStarIcon(ctx, sx, sy, 18, criteria[i].ok);
      ctx.fillStyle = criteria[i].ok ? "#fde047" : "#64748b";
      ctx.font = `700 10px ${MONO}`;
      ctx.fillText(criteria[i].label, sx, sy + 30);
    }

    // Unlock celebration banner if a Ship or Chapter unlocked!
    if (res.newlyUnlockedShips.length > 0 || res.newlyUnlockedChapters.length > 0) {
      const msg =
        res.newlyUnlockedShips.length > 0
          ? `NEW SHIP UNLOCKED: ${getShip(res.newlyUnlockedShips[0]).name.toUpperCase()}!`
          : `NEW CONSTELLATION: ${res.newlyUnlockedChapters[0].toUpperCase()}!`;
      roundRect(ctx, 42, 480, 316, 34, 10);
      ctx.fillStyle = "rgba(45, 212, 191, 0.16)";
      ctx.fill();
      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#5eead4";
      ctx.font = `800 11.5px ${MONO}`;
      ctx.fillText(msg, WORLD_W * 0.5, 501);
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = `700 12px ${MONO}`;
      ctx.fillText(`SCORE ${res.score.toLocaleString()}`, WORLD_W * 0.5, 502);
    }

    const rects = uiRects("play", session, null);
    if (rects.next) {
      const nextSpec = ORBIT_BY_ID[res.nextOrbitId];
      drawButton(
        ctx,
        rects.next,
        "NEXT ORBIT →",
        nextSpec ? `${nextSpec.name.toUpperCase()}` : "",
        "primary",
      );
    }
    drawButton(ctx, rects.replay, "↻ REPLAY", res.starsThisAttempt < 3 ? "CHASE 3 ★" : "", "secondary");
    drawButton(ctx, rects.chart, "✦ CHART", "CONSTELLATIONS", "ghost");
    ctx.restore();
  }

  function drawDailyEndOverlay(ctx, session, profile) {
    const won = session.phase === "daily_won";
    ctx.save();
    ctx.fillStyle = "rgba(5, 8, 20, 0.88)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.textAlign = "center";
    ctx.fillStyle = won ? "#fde047" : "#f87171";
    ctx.font = `800 12px ${MONO}`;
    ctx.fillText(won ? "DAILY GAUNTLET COMPLETE" : "PROBES DEPLETED", WORLD_W * 0.5, 112);

    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText(`DAILY · ${session.dailyLabel}`, WORLD_W * 0.5, 150);

    roundRect(ctx, 36, 184, 328, 240, 20);
    ctx.fillStyle = "rgba(18, 25, 44, 0.94)";
    ctx.fill();
    ctx.strokeStyle = won ? "rgba(251, 191, 36, 0.55)" : "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 11px ${MONO}`;
    ctx.fillText("DAILY SCORE", WORLD_W * 0.5, 224);

    ctx.fillStyle = "#fde047";
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(session.score.toLocaleString(), WORLD_W * 0.5, 276);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = `600 13px ${MONO}`;
    ctx.fillText(
      `SECTORS CLEARED: ${won ? DAILY_STAGES : session.dailyStage - 1} / ${DAILY_STAGES}`,
      WORLD_W * 0.5,
      334,
    );
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`BEST DAILY: ${profile.bestDailyScore.toLocaleString()}`, WORLD_W * 0.5, 368);

    const rects = uiRects("play", session, profile);
    drawButton(ctx, rects.retryDaily, "RETRY DAILY", session.dailyLabel, "primary");
    drawButton(ctx, rects.chart, "✦ STAR CHART", "BACK TO CONSTELLATIONS", "secondary");
    ctx.restore();
  }

  // --- Main Render Entry -----------------------------------------------------

  function render(ctx, vp, view, t) {
    const chIdx =
      view.scene === "chart"
        ? view.chartChapter
        : view.session
          ? view.session.orbit.chapter
          : 0;

    drawBackdrop(ctx, vp.stageW, vp.stageH, chIdx, t);

    ctx.save();
    const sx = shake > 0.1 ? (Math.random() - 0.5) * shake * 2 : 0;
    const sy = shake > 0.1 ? (Math.random() - 0.5) * shake * 2 : 0;
    ctx.translate(vp.ox + sx * vp.scale, vp.oy + sy * vp.scale);
    ctx.scale(vp.scale, vp.scale);

    if (view.scene === "title") {
      drawOrbitWorld(
        ctx,
        view.demoOrbit,
        { phase: "flight", flight: view.demoFlight, shipId: "solaris", shots: 1 },
        t,
      );
      drawTitleOverlay(ctx, view.profile, view.dailyLabel, view.muted, t);
    } else if (view.scene === "chart") {
      drawChartScreen(ctx, view.profile, view.chartChapter, view.dailyLabel, view.muted, t);
    } else if (view.session) {
      const s = view.session;
      drawOrbitWorld(
        ctx,
        s.orbit,
        {
          phase: s.phase,
          flight: s.flight,
          shipId: s.shipId,
          shots: s.shots,
          lastTrail: s.lastTrail,
          aim: view.aim,
          aimHitGate: Boolean(view.aim && view.aim.pred && view.aim.pred.hitGate),
          tutorialAssistActive: s.tutorialAssistActive,
        },
        t,
      );

      if (s.phase === "aim" || s.phase === "flight") {
        drawInGameChrome(ctx, s, view.muted);
      } else if (s.phase === "clear") {
        drawClearSheet(ctx, s);
      } else if (s.phase === "daily_over" || s.phase === "daily_won") {
        drawDailyEndOverlay(ctx, s, view.profile);
      }
    }

    if (flash > 0.01) {
      ctx.fillStyle = flashColor;
      ctx.globalAlpha = flash * 0.24;
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
