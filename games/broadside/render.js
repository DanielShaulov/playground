/**
 * Visual-First Single-Screen Portrait Canvas Renderer for Broadside!
 * (Pocket World of Warships — Live Slow Naval Tactics).
 *
 * Entire 360 × 520 sea strait fits cleanly on any portrait phone:
 * - Steel warships with rotating Bow & Stern turrets, bow waves & foam wakes
 * - Parabolic arcing ballistic shells with water shadows, splash geysers & ricochet sparks
 * - Slow underwater torpedoes with cyan/red wakes & warning chevrons
 * - Trackpad Artillery Reticle (dispersion ellipse, flight time, turret count, torp fan)
 * - Clean 3-pill bottom thumb dock: [ AP/HE ] [ FULL/HALF/STOP ] [ TORP/SMOKE/REPAIR ]
 */

import { BAYS, PARTS_BY_BAY, THEATERS } from "./core/content.js";
import {
  ARENA_W,
  ARENA_H,
  SHELL_SPEED,
  TORP_ARC_COS,
  clamp,
  wrapAngle,
  canLaunchTorpedoAt,
  getSalvoMetrics,
  getLockedEnemy,
  getIncomingArmorStatus,
  raycastIslandDist,
} from "./core/sim.js";
import { createScreenRenderers } from "./screens.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
}

export function hitRect(p, rect) {
  return (
    Boolean(rect) &&
    p.x >= rect.x &&
    p.x <= rect.x + rect.w &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.h
  );
}

export const AIM_LIFT_PX = 74; // Rigid vertical brass sightline stem above fingertip!

export function getSeaViewport(w, h, liftY = 0) {
  const topBar = 44;
  const botDock = 72;
  const padX = Math.max(6, Math.round(w * 0.02));
  const availW = Math.max(200, w - padX * 2);
  const availH = Math.max(240, h - topBar - botDock);
  const scale = Math.min(availW / ARENA_W, availH / ARENA_H);
  const drawW = ARENA_W * scale;
  const drawH = ARENA_H * scale;
  return {
    x: (w - drawW) * 0.5,
    y: topBar + (availH - drawH) * 0.5 - liftY,
    w: drawW,
    h: drawH,
    scale,
  };
}

/**
 * Viewport-Adaptive Bottom Sea Lift:
 * - On tall phones (iPhone 13, ~100px natural margin between sea & dock), returns 0px (zero camera movement!).
 * - On compact phones (iPhone SE, ~9.5px margin), smoothly lifts the sea upward only when your thumb
 *   enters the bottom approach strip so southern targets stay cleanly 74px above your thumb!
 */
export function computeAimSeaLift(screenY, w, h) {
  const vp0 = getSeaViewport(w, h, 0);
  const dockBandY = h - 66;
  const gap = dockBandY - (vp0.y + vp0.h);
  const maxLift = Math.max(0, AIM_LIFT_PX + 14 - gap);
  if (maxLift <= 0.5) return 0;
  const zone = 135;
  const u = clamp((screenY - (dockBandY - zone)) / (zone - 12), 0, 1);
  const smooth = u * u * (3 - 2 * u);
  return maxLift * smooth;
}

export function arenaToScreen(ax, ay, vp) {
  return { x: vp.x + ax * vp.scale, y: vp.y + ay * vp.scale };
}

export function screenToArena(sx, sy, vp) {
  return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
}

export function getUiRects(w, h, state = {}) {
  const pad = Math.max(10, Math.round(w * 0.034));
  const innerW = w - pad * 2;
  const botY = h - 62;

  if (state.scene === "title") {
    const btnW = Math.min(340, innerW);
    const bx = (w - btnW) * 0.5;
    return {
      mute: { x: w - pad - 44, y: 12, w: 44, h: 44 },
      reset: { x: pad, y: 12, w: 94, h: 40 },
      drydock: { x: bx, y: botY - 58, w: btnW, h: 48 },
      primary: { x: bx, y: botY, w: btnW, h: 52 },
    };
  }

  if (state.scene === "bridge") {
    const topH = 38;
    const drydockW = Math.min(104, Math.round(innerW * 0.3));
    const navBtnW = 32;
    const headerW = innerW - drydockW - 8;
    const horizonY = 10 + topH + 8;
    const horizonH = clamp(Math.round(h * 0.21), 84, 146);
    const cardsY = horizonY + horizonH + 10;
    const availCardsH = Math.max(180, botY - cardsY - 10);
    const gap = 8;
    const cardH = Math.floor((availCardsH - gap * 2) / 3);

    const dispatches = [0, 1, 2].map((index) => ({
      index,
      x: pad,
      y: cardsY + index * (cardH + gap),
      w: innerW,
      h: cardH,
    }));

    return {
      theaterPrev: { x: pad, y: 10, w: navBtnW, h: topH },
      theaterLabel: { x: pad + navBtnW + 4, y: 10, w: headerW - navBtnW * 2 - 8, h: topH },
      theaterNext: { x: pad + headerW - navBtnW, y: 10, w: navBtnW, h: topH },
      drydockBtn: { x: w - pad - drydockW, y: 10, w: drydockW, h: topH },
      horizon: { x: pad, y: horizonY, w: innerW, h: horizonH },
      dispatches,
      primary: { x: pad, y: botY, w: innerW, h: 52 },
    };
  }

  if (state.scene === "drydock") {
    const slipH = clamp(Math.round(h * 0.22), 102, 148);
    const slip = { x: pad, y: 8, w: innerW, h: slipH };
    const tabY = slip.y + slip.h + 8;
    const tabH = 38;
    const tabGap = 6;
    const tabW = (innerW - tabGap * 3) / 4;
    const bayTabs = BAYS.map((b, i) => ({
      bayId: b.id,
      x: pad + i * (tabW + tabGap),
      y: tabY,
      w: tabW,
      h: tabH,
    }));

    const activeBay = state.selectedBay || "hull";
    const parts = (PARTS_BY_BAY[activeBay] || []).filter((p) => !p.starter);
    const gridY = tabY + tabH + 8;
    const availH = Math.max(180, botY - gridY - 8);
    const cols = 2;
    const rows = Math.max(2, Math.ceil(parts.length / cols));
    const colGap = 8;
    const rowGap = 7;
    const cellW = (innerW - colGap) / cols;
    const cellH = Math.min(96, Math.floor((availH - rowGap * (rows - 1)) / rows));

    const partCards = parts.map((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        partId: p.id,
        x: pad + col * (cellW + colGap),
        y: gridY + row * (cellH + rowGap),
        w: cellW,
        h: cellH,
      };
    });

    return {
      slip,
      bayTabs,
      partCards,
      primary: { x: pad, y: botY, w: innerW, h: 52 },
    };
  }

  if (state.scene === "battle") {
    const dockY = h - 62;
    const dual = Boolean(state.battle?.stats?.hasDualSpecial);
    if (dual) {
      const gap = 5;
      const colW = Math.floor((innerW - gap * 3) / 4);
      const lastW = innerW - colW * 3 - gap * 3;
      return {
        sea: getSeaViewport(w, h),
        dockBand: { x: pad, y: dockY - 4, w: innerW, h: 62 },
        ammoBtn: { x: pad, y: dockY, w: colW, h: 54 },
        throttleBtn: { x: pad + colW + gap, y: dockY, w: colW, h: 54 },
        torpBtn: { x: pad + (colW + gap) * 2, y: dockY, w: colW, h: 54 },
        specialBtn: { x: pad + (colW + gap) * 3, y: dockY, w: lastW, h: 54 },
        muteBtn: { x: w - pad - 40, y: 6, w: 40, h: 32 },
      };
    }
    const colW = Math.floor((innerW - 12) / 3);
    return {
      sea: getSeaViewport(w, h),
      dockBand: { x: pad, y: dockY - 4, w: innerW, h: 62 },
      ammoBtn: { x: pad, y: dockY, w: colW, h: 54 },
      throttleBtn: { x: pad + colW + 6, y: dockY, w: innerW - colW * 2 - 12, h: 54 },
      torpBtn: null,
      specialBtn: { x: pad + innerW - colW, y: dockY, w: colW, h: 54 },
      muteBtn: { x: w - pad - 40, y: 6, w: 40, h: 32 },
    };
  }

  if (state.scene === "aftermath") {
    return {
      drydock: { x: pad, y: botY - 58, w: innerW, h: 48 },
      primary: { x: pad, y: botY, w: innerW, h: 52 },
    };
  }

  return {};
}

export function createRenderer() {
  let shake = 0;
  let hitFlash = 0;
  const wakes = [];
  const particles = [];
  const splashes = [];
  const popups = [];

  function clearFx() {
    wakes.length = 0;
    particles.length = 0;
    splashes.length = 0;
    popups.length = 0;
    shake = 0;
    hitFlash = 0;
  }

  function addPopup(text, x, y, color = "#fde047", big = false) {
    popups.push({
      text,
      x,
      y,
      color,
      big,
      life: big ? 1.25 : 0.85,
      maxLife: big ? 1.25 : 0.85,
    });
  }

  function ingestBattleEvents(battle) {
    for (const ev of battle.events) {
      if (ev.type === "broadside") {
        shake = Math.max(shake, 0.14);
        for (let i = 0; i < 8; i++) {
          const sp = 24 + Math.random() * 44;
          particles.push({
            x: ev.x + Math.cos(ev.ang) * 8,
            y: ev.y + Math.sin(ev.ang) * 8,
            vx: Math.cos(ev.ang + (Math.random() - 0.5) * 0.7) * sp,
            vy: Math.sin(ev.ang + (Math.random() - 0.5) * 0.7) * sp,
            r: 3.2 + Math.random() * 2.5,
            life: 0.42,
            maxLife: 0.42,
            color: ev.ammo === "he" ? "#fdba74" : "#e2e8f0",
          });
        }
      } else if (ev.type === "enemy_volley") {
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * 28,
            vy: Math.sin(a) * 28,
            r: 3.4,
            life: 0.36,
            maxLife: 0.36,
            color: "#fb923c",
          });
        }
      } else if (ev.type === "ricochet") {
        addPopup(
          ev.playerBounce ? "🛡️ BOUNCED!" : "🛡️ RICOCHET",
          ev.x,
          ev.y - 16,
          ev.playerBounce ? "#38bdf8" : "#cbd5e1",
          ev.playerBounce,
        );
        for (let i = 0; i < 7; i++) {
          const a = ev.ang + Math.PI + (Math.random() - 0.5) * 1.4;
          particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * (45 + Math.random() * 45),
            vy: Math.sin(a) * (45 + Math.random() * 45),
            r: 1.9,
            life: 0.32,
            maxLife: 0.32,
            color: "#f8fafc",
          });
        }
      } else if (ev.type === "citadel") {
        shake = Math.max(shake, 0.28);
        const jx = (Math.random() - 0.5) * 14;
        const jy = (Math.random() - 0.5) * 8;
        addPopup(`💥 CITADEL -${ev.dmg}!`, ev.x + jx, ev.y - 18 + jy, "#fde047", true);
        splashes.push({ x: ev.x, y: ev.y, maxR: 28, life: 0.38, maxLife: 0.38, color: "#fde047" });
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * (35 + Math.random() * 60),
            vy: Math.sin(a) * (35 + Math.random() * 60),
            r: 2.6,
            life: 0.48,
            maxLife: 0.48,
            color: i % 2 ? "#fbbf24" : "#f97316",
          });
        }
      } else if (ev.type === "hit") {
        const jx = (Math.random() - 0.5) * 12;
        const jy = (Math.random() - 0.5) * 7;
        const lbl =
          ev.source === "torpedo"
            ? `🚀 TORP -${ev.dmg}!`
            : ev.source === "fire"
              ? `🔥 BURN -${ev.dmg}`
              : `-${ev.dmg}`;
        addPopup(
          lbl,
          ev.x + jx,
          ev.y - 15 + jy,
          ev.source === "torpedo" ? "#38bdf8" : "#fca5a5",
          ev.source === "torpedo",
        );
      } else if (ev.type === "fire_start") {
        addPopup("🔥 FIRE!", ev.x, ev.y - 24, "#fb923c", false);
      } else if (ev.type === "splash") {
        splashes.push({ x: ev.x, y: ev.y, maxR: 11, life: 0.42, maxLife: 0.42, color: "#e0f2fe" });
      } else if (ev.type === "island_hit") {
        splashes.push({
          x: ev.x,
          y: ev.y,
          maxR: ev.torp ? 18 : 10,
          life: 0.36,
          maxLife: 0.36,
          color: ev.torp ? "#fb923c" : "#d6d3d1",
        });
        const count = ev.torp ? 7 : 4;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * (18 + Math.random() * 26),
            vy: Math.sin(a) * (18 + Math.random() * 26) - 8,
            r: ev.torp ? 2.6 : 2.1,
            life: 0.36,
            maxLife: 0.36,
            color: i % 2 ? "#e7e5e4" : "#ca8a04",
          });
        }
      } else if (ev.type === "keg_boom") {
        shake = Math.max(shake, 0.28);
        splashes.push({
          x: ev.x,
          y: ev.y,
          maxR: ev.r || 48,
          life: 0.44,
          maxLife: 0.44,
          color: "#fb923c",
        });
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * (30 + Math.random() * 70),
            vy: Math.sin(a) * (30 + Math.random() * 70),
            r: 3,
            life: 0.46,
            maxLife: 0.46,
            color: i % 2 ? "#f97316" : "#fde047",
          });
        }
      } else if (ev.type === "ram") {
        shake = Math.max(shake, 0.24);
        addPopup(ev.tbone ? "💥 T-BONE RAM!" : "💥 RAM!", ev.x, ev.y - 16, "#fbbf24", true);
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * (25 + Math.random() * 55),
            vy: Math.sin(a) * (25 + Math.random() * 55),
            r: 2.4,
            life: 0.38,
            maxLife: 0.38,
            color: i % 2 ? "#fde047" : "#f8fafc",
          });
        }
      } else if (ev.type === "player_hit") {
        shake = Math.max(shake, 0.3);
        hitFlash = 0.28;
        addPopup(
          ev.source === "citadel" ? `💥 CITADEL -${ev.dmg}!` : `-${ev.dmg} HULL!`,
          ev.x,
          ev.y - 18,
          "#ef4444",
          true,
        );
      } else if (ev.type === "board") {
        addPopup(`🛠️ +${ev.heal || 2} HP REPAIRED`, ev.x, ev.y - 18, "#4ade80", true);
      } else if (ev.type === "torp_warn") {
        addPopup("⚠️ TORPS!", ev.x, ev.y - 16, "#f87171", true);
      } else if (ev.type === "sink") {
        splashes.push({ x: ev.x, y: ev.y, maxR: 26, life: 0.55, maxLife: 0.55, color: "#bae6fd" });
        if (ev.gold) addPopup(`+${ev.gold}💰`, ev.x, ev.y - 8, "#fde047", false);
      } else if (ev.type === "enrage") {
        addPopup(`⚡ ${ev.text}`, ev.x, ev.y - 22, "#fbbf24", true);
      } else if (ev.type === "convoy_escaped") {
        addPopup("💨 Gold Ship Escaped!", ev.x, ev.y + 18, "#fbbf24", true);
      }
    }
  }

  function stepFx(battle, dt) {
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (hitFlash > 0) hitFlash = Math.max(0, hitFlash - dt);

    if (battle) {
      const p = battle.player;
      if (p.spd > 5 && Math.random() < 0.38) {
        wakes.push({
          x: p.x - Math.cos(p.ang) * (p.radius * 1.1),
          y: p.y - Math.sin(p.ang) * (p.radius * 1.1),
          r: 2.5,
          life: 0.85,
          maxLife: 0.85,
        });
      }
      for (const e of battle.enemies) {
        if (e.hp > 0 && !e.stationary && e.spd > 5 && Math.random() < 0.25) {
          wakes.push({
            x: e.x - Math.cos(e.ang) * (e.radius * 1.1),
            y: e.y - Math.sin(e.ang) * (e.radius * 1.1),
            r: 2.3,
            life: 0.75,
            maxLife: 0.75,
          });
        }
      }
      for (const tp of battle.torpedoes) {
        if (Math.random() < 0.65) {
          wakes.push({
            x: tp.x - Math.cos(tp.ang) * 4,
            y: tp.y - Math.sin(tp.ang) * 4,
            r: 1.5,
            life: 0.45,
            maxLife: 0.45,
            torp: true,
            friendly: tp.friendly,
          });
        }
      }
    }

    for (let i = wakes.length - 1; i >= 0; i--) {
      wakes[i].r += (wakes[i].torp ? 2.5 : 5.5) * dt;
      wakes[i].life -= dt;
      if (wakes[i].life <= 0) wakes.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      splashes[i].life -= dt;
      if (splashes[i].life <= 0) splashes.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 16 * dt;
      popups[i].life -= dt;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
  }

  function drawPlankPips(ctx, cx, y, hp, maxHp, isPlayer = false) {
    const w = clamp(22 + maxHp * 1.5, 26, isPlayer ? 50 : 54);
    const h = isPlayer ? 5.6 : 4.6;
    const x = cx - w * 0.5;
    const frac = clamp(hp / Math.max(1, maxHp), 0, 1);

    rrect(ctx, x - 1, y - h * 0.5 - 1, w + 2, h + 2, 2.5);
    ctx.fillStyle = "rgba(7, 13, 24, 0.86)";
    ctx.fill();

    if (frac > 0) {
      const fillCol = !isPlayer
        ? "#ef4444"
        : frac > 0.5
          ? "#4ade80"
          : frac > 0.25
            ? "#fbbf24"
            : "#f87171";
      rrect(ctx, x, y - h * 0.5, w * frac, h, 1.8);
      ctx.fillStyle = fillCol;
      ctx.fill();
    }

    const step = maxHp > 14 ? 4 : 2;
    ctx.strokeStyle = "rgba(7, 13, 24, 0.65)";
    ctx.lineWidth = 0.85;
    for (let v = step; v < maxHp; v += step) {
      const tx = x + (v / maxHp) * w;
      ctx.beginPath();
      ctx.moveTo(tx, y - h * 0.5);
      ctx.lineTo(tx, y + h * 0.5);
      ctx.stroke();
    }
  }

  /**
   * Translate a player's 4 equipped modular bays into exact visual warship hardware!
   */
  function buildPlayerShipVisual(stats, extra = {}) {
    const hullId = stats.activeParts?.hull?.id || "hull_gunboat";
    const gunsId = stats.activeParts?.guns?.id || "guns_starter";
    const sysId = stats.activeParts?.sys?.id || "sys_iron_sights";

    let hullStyle = "gunboat";
    if (hullId === "hull_hydrofoil") hullStyle = "hydrofoil";
    else if (hullId === "hull_cruiser") hullStyle = "cruiser";
    else if (
      hullId === "hull_ironclad" ||
      hullId === "hull_dreadnought" ||
      hullId === "hull_fast_bb"
    ) {
      hullStyle = "ironclad";
    }

    let sysStyle = "none";
    if (sysId === "sys_admiralty") sysStyle = "radar";
    else if (sysId === "sys_rangefinder") sysStyle = "rangefinder";
    else if (sysId === "sys_thermite") sysStyle = "thermite";
    else if (sysId === "sys_bulkheads") sysStyle = "bulkheads";
    else if (sysId === "sys_rudder") sysStyle = "rudder";

    return {
      radius: stats.hull.radius,
      hullColor: stats.hull.hullColor,
      deckColor: stats.hull.deckColor,
      trimColor: "#fbbf24",
      hullStyle,
      bowGuns: stats.bowGuns,
      sternGuns: stats.sternGuns,
      longBarrels: gunsId === "guns_ap_rifles" || gunsId === "guns_triple",
      torpDeck: gunsId === "guns_torp_deck",
      torpCount: stats.torpCount || 0,
      auxStyle:
        stats.special?.id === "smoke" || stats.special?.id === "repair" ? stats.special.id : "none",
      sysStyle,
      heavyArmor: Boolean(stats.strengthenedHull),
      isPlayer: true,
      ...extra,
    };
  }

  /**
   * Map each enemy warship class to a distinct, recognizable naval silhouette!
   */
  function buildEnemyShipVisual(e, elapsed) {
    const t = e.typeId;
    let hullStyle = "cruiser";
    let bowGuns = 1;
    let sternGuns = 1;
    let longBarrels = false;

    if (t === "patrol_boat") {
      hullStyle = "gunboat";
      bowGuns = 1;
      sternGuns = 0;
    } else if (t === "destroyer") {
      hullStyle = "destroyer";
      bowGuns = 1;
      sternGuns = 1;
    } else if (t === "cruiser") {
      hullStyle = "cruiser";
      bowGuns = 2;
      sternGuns = 1;
    } else if (t === "battleship") {
      hullStyle = "ironclad";
      bowGuns = 2;
      sternGuns = 2;
      longBarrels = true;
    } else if (t === "convoy") {
      hullStyle = "convoy";
      bowGuns = 0;
      sternGuns = 0;
    } else if (t === "fireship") {
      hullStyle = "gunboat";
      bowGuns = 0;
      sternGuns = 0;
    } else if (t === "twin_scharn" || t === "twin_gneis") {
      hullStyle = "cruiser";
      bowGuns = 2;
      sternGuns = 2;
      longBarrels = true;
    } else if (t === "boss_ironclad") {
      hullStyle = "ironclad";
      bowGuns = 2;
      sternGuns = 2;
      longBarrels = true;
    } else if (t === "boss_dreadnought") {
      hullStyle = "ironclad";
      bowGuns = 3;
      sternGuns = 2;
      longBarrels = true;
    }

    return {
      radius: e.radius,
      hullColor: e.hullColor,
      deckColor: e.deckColor,
      trimColor: e.boss || e.treasure ? "#fbbf24" : "#1e293b",
      turretAng: e.turretAng,
      hullStyle,
      bowGuns,
      sternGuns,
      longBarrels,
      torpCount: e.torpCount || 0,
      heavyArmor: e.heavyArmor,
      boss: e.boss,
      fireship: e.explodesOnDeath,
      onFire: e.fireTimer > 0,
      chargingShot: e.guns > 0 && e.reloadTimer < 0.75,
      isPlayer: false,
      elapsed,
    };
  }

  /**
   * Draw a modular steel warship whose silhouette, armor plates, turret barrel counts,
   * side torpedo racks, deck auxiliaries, and bridge radar mast visibly evolve!
   */
  function drawSteelWarship(ctx, x, y, ang, opts) {
    const {
      radius = 11.5,
      hullColor = "#475569",
      deckColor = "#9a3412",
      trimColor = "#fbbf24",
      turretAng = ang,
      hullStyle = "gunboat",
      bowGuns = 1,
      sternGuns = 1,
      longBarrels = false,
      torpDeck = false,
      torpCount = 0,
      auxStyle = "none",
      sysStyle = "none",
      heavyArmor = false,
      boss = false,
      fireship = false,
      onFire = false,
      hidden = false,
      chargingShot = false,
      isPlayer = false,
      elapsed = 0,
    } = opts;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (hidden) ctx.globalAlpha = 0.48;

    // Distinct class proportions
    let lMult = 1.46;
    let bMult = 0.54;
    if (hullStyle === "hydrofoil") {
      lMult = 1.66;
      bMult = 0.44;
    } else if (hullStyle === "destroyer") {
      lMult = 1.62;
      bMult = 0.45;
    } else if (hullStyle === "cruiser") {
      lMult = 1.58;
      bMult = 0.52;
    } else if (hullStyle === "ironclad") {
      lMult = 1.5;
      bMult = 0.64;
    } else if (hullStyle === "convoy") {
      lMult = 1.44;
      bMult = 0.66;
    }
    const L = radius * lMult;
    const B = radius * bMult;

    // Geared Rudder twin stern fins
    if (sysStyle === "rudder") {
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-L * 0.9, -B * 0.46);
      ctx.lineTo(-L * 1.12, -B * 0.66);
      ctx.moveTo(-L * 0.9, B * 0.46);
      ctx.lineTo(-L * 1.12, B * 0.66);
      ctx.stroke();
    }

    // Hydrofoil swept-back wing strakes (drawn beneath hull flanks)
    if (hullStyle === "hydrofoil") {
      ctx.fillStyle = "#0891b2";
      ctx.strokeStyle = "#67e8f9";
      ctx.lineWidth = 1.0;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(L * 0.16, s * B * 0.82);
        ctx.lineTo(-L * 0.18, s * B * 1.58);
        ctx.lineTo(-L * 0.4, s * B * 1.42);
        ctx.lineTo(-L * 0.14, s * B * 0.78);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Steel Warship Hull Silhouette (pointed bow vs wide merchant prow)
    ctx.fillStyle = hullColor;
    ctx.beginPath();
    if (hullStyle === "convoy") {
      ctx.moveTo(L * 1.02, 0);
      ctx.quadraticCurveTo(L * 0.75, B * 1.02, L * 0.2, B * 0.98);
      ctx.lineTo(-L * 0.92, B * 0.92);
      ctx.lineTo(-L * 0.96, -B * 0.92);
      ctx.lineTo(L * 0.2, -B * 0.98);
      ctx.quadraticCurveTo(L * 0.75, -B * 1.02, L * 1.02, 0);
    } else {
      ctx.moveTo(L * 1.12, 0);
      ctx.quadraticCurveTo(L * 0.46, B * 1.08, -L * 0.88, B * 0.82);
      ctx.lineTo(-L * 0.96, -B * 0.82);
      ctx.quadraticCurveTo(L * 0.46, -B * 1.08, L * 1.12, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = isPlayer || boss ? 1.35 : 1.0;
    ctx.stroke();

    // Inner Deck
    ctx.fillStyle = deckColor;
    ctx.beginPath();
    ctx.moveTo(L * 0.78, 0);
    ctx.lineTo(-L * 0.76, B * 0.58);
    ctx.lineTo(-L * 0.76, -B * 0.58);
    ctx.closePath();
    ctx.fill();

    // Heavy Side Armor Belt Plates (Ironclad / Dreadnought / Battleship / Boss)
    if (hullStyle === "ironclad" || heavyArmor) {
      ctx.strokeStyle = boss ? "#fbbf24" : "#cbd5e1";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(L * 0.36, -B * 0.92);
      ctx.lineTo(-L * 0.52, -B * 0.84);
      ctx.moveTo(L * 0.36, B * 0.92);
      ctx.lineTo(-L * 0.52, B * 0.84);
      ctx.stroke();
    }

    // Armored Bulkheads cross-bracing ribs on deck
    if (sysStyle === "bulkheads") {
      ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
      ctx.lineWidth = 1.0;
      for (const bx of [-L * 0.34, L * 0.2]) {
        ctx.beginPath();
        ctx.moveTo(bx, -B * 0.58);
        ctx.lineTo(bx, B * 0.58);
        ctx.stroke();
      }
    }

    // Gleaming Sloped Bow Armor Ram Chevron on armored hulls & player!
    if (heavyArmor || isPlayer) {
      ctx.strokeStyle = heavyArmor ? "#f8fafc" : "rgba(226, 232, 240, 0.75)";
      ctx.lineWidth = heavyArmor ? 2.5 : 1.4;
      ctx.beginPath();
      ctx.moveTo(L * 0.44, -B * 0.95);
      ctx.lineTo(L * 1.14, 0);
      ctx.lineTo(L * 0.44, B * 0.95);
      ctx.stroke();
    }

    // Gold Convoy Freighter Cargo Holds (instantly recognizable!)
    if (hullStyle === "convoy") {
      for (const cx of [L * 0.32, -L * 0.04, -L * 0.4]) {
        ctx.fillStyle = "#facc15";
        rrect(ctx, cx - 3.6, -B * 0.54, 7.2, B * 1.08, 1.5);
        ctx.fill();
        ctx.strokeStyle = "#854d0e";
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      // Aft merchant funnel
      ctx.fillStyle = "#1e293b";
      rrect(ctx, -L * 0.78, -B * 0.38, L * 0.24, B * 0.76, 1.5);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Port & Starboard Side Torpedo Launcher Racks (whenever ship carries torps!)
    if (torpCount > 0) {
      const tipCol = isPlayer ? "#38bdf8" : "#fb923c";
      const tubes = torpCount >= 4 ? 3 : 2;
      const rackLen = tubes >= 3 ? 6.4 : 4.6;
      for (const s of [-1, 1]) {
        ctx.fillStyle = "#0f172a";
        rrect(ctx, -rackLen * 0.5 - L * 0.08, s * B * 0.62 - 1.5, rackLen, 3.0, 1);
        ctx.fill();
        ctx.fillStyle = tipCol;
        for (let t = 0; t < tubes; t++) {
          const ox = -L * 0.08 + (t - (tubes - 1) * 0.5) * 2.0;
          ctx.beginPath();
          ctx.arc(ox, s * B * 0.76, 0.95, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Torpedo Conversion aft torpedo battery (when stern guns removed!)
    if (torpDeck && sternGuns <= 0) {
      ctx.fillStyle = "#0f172a";
      rrect(ctx, -L * 0.64, -B * 0.42, L * 0.28, B * 0.84, 1.8);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }

    // Center Bridge / Superstructure + Funnels
    const brW = hullStyle === "ironclad" ? L * 0.52 : L * 0.44;
    const brH = hullStyle === "ironclad" ? B * 1.02 : B * 0.86;
    ctx.fillStyle = "#1e293b";
    rrect(ctx, -brW * 0.5, -brH * 0.5, brW, brH, 2.2);
    ctx.fill();
    ctx.strokeStyle = boss ? "#fbbf24" : "rgba(148, 163, 184, 0.45)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Twin Funnels on Destroyers, Cruisers, and Battleships
    if (hullStyle === "destroyer" || hullStyle === "cruiser" || hullStyle === "ironclad") {
      ctx.fillStyle = "#0f172a";
      for (const fx of [-L * 0.14, L * 0.08]) {
        ctx.beginPath();
        ctx.arc(fx, 0, Math.max(1.6, B * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Auxiliary Deck Gear: Smoke Drums or Repair Cross Pad
    if (auxStyle === "smoke") {
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(-L * 0.74, -B * 0.28, 1.8, 0, Math.PI * 2);
      ctx.arc(-L * 0.74, B * 0.28, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (auxStyle === "repair") {
      ctx.fillStyle = "#14532d";
      rrect(ctx, -L * 0.38, -2.8, 5.6, 5.6, 1.2);
      ctx.fill();
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-L * 0.38 + 2.8, -1.8);
      ctx.lineTo(-L * 0.38 + 2.8, 1.8);
      ctx.moveTo(-L * 0.38 + 1.0, 0);
      ctx.lineTo(-L * 0.38 + 4.6, 0);
      ctx.stroke();
    }

    // Thermite Magazine deck glow
    if (sysStyle === "thermite") {
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(-L * 0.04, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bridge Mast Tech: Spinning Admiralty Radar or Brass Optical Rangefinder!
    if (sysStyle === "radar") {
      ctx.save();
      ctx.translate(L * 0.06, 0);
      ctx.rotate(elapsed * 3.6);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-4.4, 0);
      ctx.lineTo(4.4, 0);
      ctx.stroke();
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (sysStyle === "rangefinder") {
      ctx.save();
      ctx.translate(L * 0.06, 0);
      ctx.rotate(wrapAngle(turretAng - ang));
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -4.2);
      ctx.lineTo(0, 4.2);
      ctx.stroke();
      ctx.restore();
    } else if (boss) {
      // Golden Admiral Bridge Crest
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(L * 0.04, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rotating Bow & Stern Turrets with Exact Barrel Counts (1, 2, or 3 barrels!)
    const relT = wrapAngle(turretAng - ang);
    const drawTurret = (tx, barrels) => {
      if (barrels <= 0) return;
      ctx.save();
      ctx.translate(tx, 0);
      ctx.rotate(relT);
      const tRad = Math.max(2.3, B * (barrels >= 3 ? 0.5 : barrels === 2 ? 0.44 : 0.38));
      const bLen = radius * (longBarrels ? 0.72 : barrels >= 3 ? 0.66 : 0.56);
      ctx.fillStyle = chargingShot ? "#f87171" : "#cbd5e1";
      ctx.beginPath();
      ctx.arc(0, 0, tRad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 0.7;
      ctx.stroke();

      ctx.strokeStyle = chargingShot ? "#fef08a" : longBarrels ? "#fde68a" : "#e2e8f0";
      ctx.lineWidth = barrels >= 3 ? 1.1 : 1.25;
      const spacing = barrels >= 3 ? 1.55 : 1.8;
      ctx.beginPath();
      for (let i = 0; i < barrels; i++) {
        const oy = (i - (barrels - 1) * 0.5) * spacing;
        ctx.moveTo(0, oy);
        ctx.lineTo(bLen, oy);
      }
      ctx.stroke();
      ctx.restore();
    };

    if (!fireship) {
      drawTurret(L * 0.48, bowGuns);
      drawTurret(-L * 0.48, sternGuns);
    } else {
      // Blazing Fire-Ship powder barrels & bow cauldron
      const flick = Math.sin(elapsed * 22) * 1.5;
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(-L * 0.32, 0, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(L * 0.24, 0, 4.8 + flick * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(L * 0.24, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active Deck Fire Flames!
    if (onFire) {
      const f = Math.sin(elapsed * 26) * 1.6;
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(0, 0, 5 + f * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function renderBattleArena(ctx, state, vp, elapsed, isDemo = false) {
    const { battle, aimDrag, armedTorp } = state;
    const actDef = THEATERS[(battle.act - 1) % THEATERS.length];
    const pal = actDef.palette;

    ctx.save();
    if (!isDemo && shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * 7 * (shake / 0.28),
        (Math.random() - 0.5) * 7 * (shake / 0.28),
      );
    }

    rrect(ctx, vp.x, vp.y, vp.w, vp.h, 14);
    ctx.save();
    ctx.clip();

    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.scale, vp.scale);

    // Rich Deep-Sea Strait Gradient
    const sea = ctx.createLinearGradient(0, 0, 0, ARENA_H);
    sea.addColorStop(0, pal.seaTop);
    sea.addColorStop(0.55, pal.seaMid);
    sea.addColorStop(1, pal.seaBot);
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    // Subtle Nautical Grid & Wave Shimmer
    ctx.strokeStyle = "rgba(186, 230, 253, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 60; x < ARENA_W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_H);
      ctx.stroke();
    }
    for (let y = 65; y < ARENA_H; y += 65) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_W, y);
      ctx.stroke();
    }

    if (battle.nodeType === "convoy") {
      ctx.fillStyle = "rgba(251, 191, 36, 0.14)";
      ctx.fillRect(0, 0, ARENA_W, 34);
      ctx.fillStyle = "#fde047";
      ctx.font = `800 9.5px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("▲ GOLD SHIP ESCAPE ▲", ARENA_W * 0.5, 20);
      ctx.textAlign = "left";
    }

    // Wakes & Torpedo Bubble Trails
    for (const wk of wakes) {
      const a = (wk.life / wk.maxLife) * (wk.torp ? 0.55 : 0.3);
      ctx.strokeStyle = wk.torp
        ? wk.friendly
          ? `rgba(103, 232, 249, ${a})`
          : `rgba(248, 113, 113, ${a})`
        : `rgba(224, 242, 254, ${a})`;
      ctx.lineWidth = wk.torp ? 1.5 : 1.0;
      ctx.beginPath();
      ctx.arc(wk.x, wk.y, wk.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player Brass Course Waypoint & Dotted Course Line!
    const { player } = battle;
    if (!isDemo && player.waypoint) {
      const wp = player.waypoint;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.45)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(wp.x, wp.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 7 + Math.sin(elapsed * 6) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- HANDCRAFTED LANDFORMS, BREAKWATERS, PIERS, BUOYS & LIGHTHOUSES ---
    const surf = Math.sin(elapsed * 2.4) * 1.6;
    const traceLand = (pts, cx, cy, inflate = 0) => {
      if (!pts || pts.length < 3) return;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        let px = pt.x;
        let py = pt.y;
        if (inflate !== 0) {
          const dx = px - cx;
          const dy = py - cy;
          const d = Math.hypot(dx, dy) || 1;
          px += (dx / d) * inflate;
          py += (dy / d) * inflate;
        }
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const landforms = battle.landforms || [];
    if (landforms.length > 0) {
      // Pass 1: Animated Turquoise Reef Shoals & Breaking Surf Foam
      for (const lf of landforms) {
        traceLand(lf.pts, lf.cx, lf.cy, 8 + surf);
        ctx.fillStyle = pal.shoal;
        ctx.fill();
        traceLand(lf.pts, lf.cx, lf.cy, 2.5 + surf * 0.45);
        ctx.strokeStyle = pal.foam;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Pass 2: Wooden Harbor Piers (under land overhang)
      for (const pier of battle.piers || []) {
        ctx.save();
        ctx.translate(pier.x, pier.y);
        ctx.rotate(pier.ang);
        ctx.fillStyle = "#78350f";
        ctx.fillRect(0, -3.4, pier.len, 6.8);
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 0.9;
        for (let px = 3; px < pier.len; px += 4) {
          ctx.beginPath();
          ctx.moveTo(px, -3.2);
          ctx.lineTo(px, 3.2);
          ctx.stroke();
        }
        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(pier.len - 2, -2.4, 1.1, 0, Math.PI * 2);
        ctx.arc(pier.len - 2, 2.4, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Pass 3: Terrain Bodies (Stone Breakwaters, Jagged Cliffs, Sandy Headlands)
      for (const lf of landforms) {
        // Subtle directional drop shadow
        ctx.save();
        ctx.translate(2.5, 3.2);
        traceLand(lf.pts, lf.cx, lf.cy, 0);
        ctx.fillStyle = "rgba(2, 6, 23, 0.38)";
        ctx.fill();
        ctx.restore();

        traceLand(lf.pts, lf.cx, lf.cy, 0);
        if (lf.kind === "breakwater") {
          ctx.fillStyle = "#64748b";
          ctx.fill();
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 1.6;
          ctx.stroke();
          // Inner masonry walkway
          traceLand(lf.pts, lf.cx, lf.cy, -4.5);
          ctx.fillStyle = "#475569";
          ctx.fill();
        } else if (lf.kind === "cliff") {
          ctx.fillStyle = battle.act === 3 ? "#44403c" : "#64594c";
          ctx.fill();
          ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Sunlit cliff plateau
          traceLand(lf.pts, lf.cx, lf.cy, -5.5);
          ctx.fillStyle = battle.act === 3 ? "#57534e" : pal.foliage;
          ctx.fill();
        } else {
          ctx.fillStyle = pal.sand;
          ctx.fill();
          ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
          ctx.lineWidth = 1.3;
          ctx.stroke();
          // Elevated rocky turf core
          traceLand(lf.pts, lf.cx, lf.cy, -6.5);
          ctx.fillStyle = pal.foliage;
          ctx.fill();
        }

        // Layered Pine Trees / Ridge Foliage
        for (const tr of lf.trees || []) {
          ctx.fillStyle = "rgba(2, 6, 23, 0.25)";
          ctx.beginPath();
          ctx.arc(tr.x + 1.5, tr.y + 1.8, tr.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = battle.act === 3 ? "#7c2d12" : "#1e5631";
          ctx.beginPath();
          ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = battle.act === 3 ? "#9a3412" : "#2e7d47";
          ctx.beginPath();
          ctx.arc(tr.x - tr.r * 0.22, tr.y - tr.r * 0.22, tr.r * 0.56, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // Fallback for plain circle islands
      for (const isl of battle.islands) {
        ctx.beginPath();
        ctx.arc(isl.x, isl.y, isl.r + 7 + surf, 0, Math.PI * 2);
        ctx.fillStyle = pal.shoal;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(isl.x, isl.y, isl.r, 0, Math.PI * 2);
        ctx.fillStyle = isl.fortIsland ? "#64748b" : pal.sand;
        ctx.fill();
      }
    }

    // Channel Marker Buoys (Gently bobbing along shipping lanes & straits)
    for (const buoy of battle.buoys || []) {
      const bob = Math.sin(elapsed * 3.4 + buoy.x * 0.1) * 1.1;
      ctx.save();
      ctx.translate(buoy.x, buoy.y + bob);
      ctx.strokeStyle = "rgba(224, 242, 254, 0.35)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, 5.2 + Math.sin(elapsed * 3 + buoy.y) * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = buoy.color || "#ef4444";
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Rotating Coastal Lighthouses
    for (const lh of battle.lighthouses || []) {
      const beamAng = elapsed * 0.75 + (lh.phase || 0);
      ctx.save();
      ctx.translate(lh.x, lh.y);
      // Soft sweeping golden beam cone
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 68);
      grad.addColorStop(0, "rgba(254, 240, 138, 0.36)");
      grad.addColorStop(1, "rgba(254, 240, 138, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 68, beamAng - 0.24, beamAng + 0.24);
      ctx.closePath();
      ctx.fill();

      // Tower base + red/white cap
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Floating Naval Mines
    for (const m of battle.mines) {
      if (!m.alive) continue;
      ctx.save();
      ctx.translate(m.x, m.y + Math.sin(elapsed * 4 + m.x) * 1.2);
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = "#991b1b";
      ctx.fill();
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#fef08a";
      ctx.font = `800 6.2px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("TNT", 0, 2.2);
      ctx.restore();
    }

    // Slow Underwater Torpedoes!
    for (const tp of battle.torpedoes) {
      ctx.save();
      ctx.translate(tp.x, tp.y);
      ctx.rotate(tp.ang);
      ctx.fillStyle = tp.friendly ? "#38bdf8" : "#ef4444";
      rrect(ctx, -5, -1.8, 10, 3.6, 1.8);
      ctx.fill();
      if (!tp.friendly) {
        ctx.strokeStyle = "#fef08a";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Enemy Warships + Target Lock Bracket + Discrete ♥ Planks
    const locked = !isDemo ? getLockedEnemy(battle) : null;
    for (const e of battle.enemies) {
      if (e.hp <= 0 || (!isDemo && e.hidden)) continue;

      if (e.stationary && (e.typeId === "fort" || e.typeId === "bastion")) {
        ctx.save();
        ctx.translate(e.x, e.y);
        // Octagonal masonry star-fort bastion
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          const rr = i % 2 === 0 ? 15 : 12.5;
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = "#475569";
        ctx.fill();
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Dark concrete gun-pit embrasure
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.fill();

        // Heavy twin coastal artillery turret
        ctx.rotate(e.turretAng);
        const hot = e.reloadTimer < 0.75;
        ctx.fillStyle = hot ? "#f87171" : "#94a3b8";
        ctx.beginPath();
        ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hot ? "#fef08a" : "#e2e8f0";
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(0, -2.1);
        ctx.lineTo(15.5, -2.1);
        ctx.moveTo(0, 2.1);
        ctx.lineTo(15.5, 2.1);
        ctx.stroke();
        ctx.restore();
      } else {
        drawSteelWarship(ctx, e.x, e.y, e.ang, buildEnemyShipVisual(e, elapsed));
      }

      if (!isDemo) {
        // Subtle Corner Target-Lock Bracket on locked enemy
        if (locked && locked.uid === e.uid) {
          const r = e.radius + 7;
          ctx.strokeStyle = "rgba(253, 224, 71, 0.75)";
          ctx.lineWidth = 1.3;
          for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ]) {
            ctx.beginPath();
            ctx.moveTo(e.x + sx * r, e.y + sy * (r - 4));
            ctx.lineTo(e.x + sx * r, e.y + sy * r);
            ctx.lineTo(e.x + sx * (r - 4), e.y + sy * r);
            ctx.stroke();
          }
        }
        drawPlankPips(ctx, e.x, e.y - e.radius - 10, e.hp, e.maxHp, false);
      }
    }

    // Player Warship + Live Diegetic Armor-Angling Halo + Discrete ♥ Planks
    if (!isDemo) {
      const armor = getIncomingArmorStatus(battle);
      if (armor && (armor.status === "safe" || armor.status === "danger")) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.ang);
        if (armor.status === "safe") {
          // Glowing Cyan Bow Bounce Shield!
          ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(0, 0, player.radius + 9, -0.62, 0.62);
          ctx.stroke();
        } else {
          // Pulsing Red Broadside Warning!
          const pulse = 0.55 + Math.sin(elapsed * 14) * 0.35;
          ctx.strokeStyle = `rgba(248, 113, 113, ${pulse})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(0, 0, player.radius + 9, 0.85, 2.25);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, player.radius + 9, -2.25, -0.85);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    drawSteelWarship(
      ctx,
      player.x,
      player.y,
      player.ang,
      buildPlayerShipVisual(battle.stats, {
        turretAng: aimDrag?.active
          ? Math.atan2(aimDrag.ty - player.y, aimDrag.tx - player.x)
          : player.turretAng,
        onFire: player.fireTimer > 0,
        hidden: player.hidden,
        elapsed,
      }),
    );
    if (!isDemo) {
      drawPlankPips(ctx, player.x, player.y + 18, player.hp, player.maxHp, true);
    }

    // Smoke Screens
    for (const sm of battle.smokes) {
      const a = clamp(sm.life / 1.5, 0, 1) * 0.42;
      const g = ctx.createRadialGradient(sm.x, sm.y, sm.r * 0.2, sm.x, sm.y, sm.r);
      g.addColorStop(0, `rgba(226, 232, 240, ${a})`);
      g.addColorStop(1, "rgba(226, 232, 240, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sm.x, sm.y, sm.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Parabolic Arcing Ballistic Shells (Water Shadows + Elevated Glowing Tracers!)
    for (const sh of battle.shells) {
      ctx.fillStyle = "rgba(8, 15, 28, 0.35)";
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, 2.5, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();

      const u = clamp(sh.t / sh.flightTime, 0, 1);
      if (!sh.friendly && u > 0.35) {
        ctx.strokeStyle = `rgba(248, 113, 113, ${(u - 0.35) * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sh.tx, sh.ty, 6 * (1.15 - u), 0, Math.PI * 2);
        ctx.stroke();
      }

      const sy = sh.y - sh.z;
      const col = !sh.friendly ? "#f87171" : sh.ammo === "he" ? "#fb923c" : "#fde047";
      ctx.strokeStyle = col;
      ctx.lineWidth = sh.friendly ? 2.1 : 1.9;
      ctx.beginPath();
      ctx.moveTo(sh.x - Math.cos(sh.ang) * 6, sy - Math.sin(sh.ang) * 6 + 1.5);
      ctx.lineTo(sh.x, sy);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(sh.x, sy, sh.friendly ? 2.3 : 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Splashes & Particles
    for (const sp of splashes) {
      const p = 1 - sp.life / sp.maxLife;
      ctx.save();
      ctx.strokeStyle = sp.color;
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 2.4 * (1 - p) + 0.7;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.maxR * p, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const pt of particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // --- DRIFTING STEALTH SEA-FOG BANKS (Conceals Player Inside!) ---
    for (const fog of battle.fogZones || []) {
      const playerInside = Math.hypot(player.x - fog.x, player.y - fog.y) <= fog.r;
      ctx.save();
      const g = ctx.createRadialGradient(fog.x, fog.y, fog.r * 0.15, fog.x, fog.y, fog.r);
      g.addColorStop(0, "rgba(226, 232, 240, 0.34)");
      g.addColorStop(0.65, "rgba(203, 213, 225, 0.2)");
      g.addColorStop(1, "rgba(203, 213, 225, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fog.x, fog.y, fog.r, 0, Math.PI * 2);
      ctx.fill();

      // Secondary drifting mist puffs for painterly cloud feel
      for (let k = 0; k < 3; k++) {
        const a = elapsed * 0.25 + k * 2.1 + (fog.phase || 0);
        const ox = Math.cos(a) * fog.r * 0.32;
        const oy = Math.sin(a * 0.8) * fog.r * 0.24;
        ctx.fillStyle = "rgba(241, 245, 249, 0.14)";
        ctx.beginPath();
        ctx.arc(fog.x + ox, fog.y + oy, fog.r * 0.56, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle dashed stealth ring (lights up cyan when you're concealed inside!)
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = playerInside ? "rgba(56, 189, 248, 0.72)" : "rgba(226, 232, 240, 0.28)";
      ctx.lineWidth = playerInside ? 1.6 : 1.0;
      ctx.beginPath();
      ctx.arc(fog.x, fog.y, fog.r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `700 8px ${FONT}`;
      ctx.fillStyle = playerInside ? "#38bdf8" : "rgba(226, 232, 240, 0.65)";
      ctx.textAlign = "center";
      ctx.fillText(playerInside ? "👻 HIDDEN" : "FOG", fog.x, fog.y - fog.r * 0.62);
      ctx.restore();
    }

    // --- WEATHER ATMOSPHERE (Squall Rain Streaks / Volcanic Embers) ---
    if (battle.weather === "squall") {
      ctx.save();
      ctx.strokeStyle = "rgba(186, 230, 253, 0.16)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 24; i++) {
        const rx = ((i * 71 + elapsed * 90) % (ARENA_W + 40)) - 20;
        const ry = ((i * 97 + elapsed * 240) % (ARENA_H + 40)) - 20;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 5, ry + 13);
        ctx.stroke();
      }
      ctx.restore();
    } else if (battle.weather === "ash") {
      ctx.save();
      for (let i = 0; i < 16; i++) {
        const ex = (i * 83 + Math.sin(elapsed * 0.9 + i) * 18 + elapsed * 14) % ARENA_W;
        const ey = ARENA_H - ((i * 67 + elapsed * 26) % ARENA_H);
        ctx.fillStyle = i % 3 === 0 ? "rgba(251, 146, 60, 0.42)" : "rgba(253, 186, 116, 0.22)";
        ctx.beginPath();
        ctx.arc(ex, ey, i % 3 === 0 ? 1.6 : 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // --- LIVE TRACKPAD ARTILLERY RETICLE / TORPEDO FAN (WHILE DRAGGING!) ---
    if (!isDemo && aimDrag && aimDrag.active && !aimDrag.cancel) {
      const { tx, ty } = aimDrag;

      // Battle 1 Training Wheel ONLY: subtle Lead Ghost pip ahead of locked moving enemy!
      if (battle.tutorial && !armedTorp && locked && locked.spd > 4) {
        const dL = Math.hypot(locked.x - player.x, locked.y - player.y);
        const fT = clamp(dL / SHELL_SPEED, 0.38, 1.85);
        const gx = clamp(locked.x + Math.cos(locked.ang) * locked.spd * fT, 18, ARENA_W - 18);
        const gy = clamp(locked.y + Math.sin(locked.ang) * locked.spd * fT, 18, ARENA_H - 18);
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(74, 222, 128, 0.75)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(locked.x, locked.y);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(gx, gy, 6.5, 0, Math.PI * 2);
        ctx.strokeStyle = "#4ade80";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = `800 8px ${FONT}`;
        ctx.fillStyle = "#4ade80";
        ctx.textAlign = "center";
        ctx.fillText("LEAD", gx, gy - 9);
        ctx.restore();
      }

      if (armedTorp && battle.stats.torpCount > 0) {
        const arc = canLaunchTorpedoAt(player, tx, ty);
        const baseA = arc.aimAngle;
        const n = battle.stats.torpCount;
        const halfDead = Math.acos(TORP_ARC_COS);

        ctx.save();
        // Port & Starboard Broadside Torpedo Tube Arcs!
        for (const [a0, a1] of [
          [player.ang + halfDead, player.ang + Math.PI - halfDead],
          [player.ang - Math.PI + halfDead, player.ang - halfDead],
        ]) {
          ctx.beginPath();
          ctx.moveTo(player.x, player.y);
          ctx.arc(player.x, player.y, 52, a0, a1);
          ctx.closePath();
          ctx.fillStyle = arc.inArc ? "rgba(56, 189, 248, 0.12)" : "rgba(251, 191, 36, 0.14)";
          ctx.fill();
          ctx.strokeStyle = arc.inArc ? "rgba(56, 189, 248, 0.45)" : "rgba(251, 191, 36, 0.55)";
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }

        for (let i = 0; i < n; i++) {
          const sp = (i - (n - 1) * 0.5) * 0.115;
          const a = wrapAngle(baseA + sp);
          const ray = raycastIslandDist(player.x, player.y, a, 240, battle.islands);
          const ex = player.x + Math.cos(a) * ray.dist;
          const ey = player.y + Math.sin(a) * ray.dist;
          ctx.strokeStyle = !arc.inArc
            ? "rgba(248, 113, 113, 0.65)"
            : ray.blocked
              ? "rgba(251, 146, 60, 0.72)"
              : "rgba(56, 189, 248, 0.82)";
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(player.x + Math.cos(a) * 14, player.y + Math.sin(a) * 14);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          if (ray.blocked && arc.inArc) {
            ctx.setLineDash([]);
            ctx.strokeStyle = "#fb923c";
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(ex - 4, ey - 4);
            ctx.lineTo(ex + 4, ey + 4);
            ctx.moveTo(ex + 4, ey - 4);
            ctx.lineTo(ex - 4, ey + 4);
            ctx.stroke();
          }
        }

        const tLbl = arc.inArc ? `🚀 ${n}× SIDE TORPS` : "SWING SIDE FOR TORP ARC";
        ctx.setLineDash([]);
        ctx.font = `800 9.5px ${FONT}`;
        const tw = ctx.measureText(tLbl).width + 12;
        const bx = clamp(tx, tw * 0.5 + 4, ARENA_W - tw * 0.5 - 4);
        const by = ty - 18 >= 14 ? ty - 18 : clamp(ty + 18, 14, ARENA_H - 12);
        rrect(ctx, bx - tw * 0.5, by - 7.5, tw, 15, 6);
        ctx.fillStyle = "rgba(10, 16, 26, 0.9)";
        ctx.fill();
        ctx.fillStyle = arc.inArc ? "#38bdf8" : "#f87171";
        ctx.textAlign = "center";
        ctx.fillText(tLbl, bx, by + 3.2);
        ctx.restore();
      } else {
        const sMult = aimDrag.spreadMult || 1;
        const m = getSalvoMetrics(battle, tx, ty, sMult);
        const ready = player.reloadTimer <= 0.02;
        const lockedTight = Boolean(aimDrag.onLocked) && sMult <= 0.74;
        const col = !ready
          ? "#94a3b8"
          : lockedTight && player.ammo === "ap"
            ? "#4ade80"
            : player.ammo === "he"
              ? "#fb923c"
              : m.bearing.fullBroadside
                ? "#fde047"
                : "#38bdf8";

        ctx.save();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = "rgba(226, 232, 240, 0.25)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(tx, ty, m.spreadR, 0, Math.PI * 2);
        ctx.fillStyle = lockedTight
          ? "rgba(74, 222, 128, 0.1)"
          : ready
            ? "rgba(253, 224, 71, 0.08)"
            : "rgba(148, 163, 184, 0.08)";
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = lockedTight ? 2.1 : ready ? 1.8 : 1.3;
        ctx.stroke();

        // Rangefinder Lock-In Ticks: converge inward around the ring while tracking your locked target!
        if (aimDrag.onLocked) {
          const tickColor = lockedTight ? "#4ade80" : "rgba(253, 224, 71, 0.85)";
          const innerR = m.spreadR + 1.5;
          const outerR = m.spreadR + (lockedTight ? 5.5 : 8.5);
          ctx.strokeStyle = tickColor;
          ctx.lineWidth = lockedTight ? 1.9 : 1.4;
          for (let k = 0; k < 4; k++) {
            const a = Math.PI * 0.25 + k * Math.PI * 0.5;
            ctx.beginPath();
            ctx.moveTo(tx + Math.cos(a) * innerR, ty + Math.sin(a) * innerR);
            ctx.lineTo(tx + Math.cos(a) * outerR, ty + Math.sin(a) * outerR);
            ctx.stroke();
          }
        }

        if (!ready) {
          const frac = 1 - clamp(player.reloadTimer / battle.stats.reload, 0, 1);
          ctx.beginPath();
          ctx.arc(tx, ty, m.spreadR + 3, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * frac);
          ctx.strokeStyle = "#fde047";
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tx - 6, ty);
        ctx.lineTo(tx + 6, ty);
        ctx.moveTo(tx, ty - 6);
        ctx.lineTo(tx, ty + 6);
        ctx.stroke();

        const lockTag = lockedTight ? "🎯 " : "";
        const lbl = !ready
          ? `Reload ${player.reloadTimer.toFixed(1)}s`
          : `${lockTag}${m.bearing.guns}× ${player.ammo.toUpperCase()} · ${m.flightTime.toFixed(1)}s`;
        ctx.font = `800 9.5px ${FONT}`;
        const tw = ctx.measureText(lbl).width + 10;
        const bx = clamp(tx, tw * 0.5 + 4, ARENA_W - tw * 0.5 - 4);
        const aboveY = ty - m.spreadR - 13;
        const by = aboveY >= 14 ? aboveY : clamp(ty + m.spreadR + 13, 14, ARENA_H - 12);
        rrect(ctx, bx - tw * 0.5, by - 7.5, tw, 15, 6);
        ctx.fillStyle = "rgba(10, 16, 26, 0.88)";
        ctx.fill();
        ctx.fillStyle = col;
        ctx.textAlign = "center";
        ctx.fillText(lbl, bx, by + 3.2);
        ctx.restore();
      }
    }

    // --- DIEGETIC STEP-BY-STEP BATTLE COACH (Zero Walls of Text!) ---
    if (!isDemo && !aimDrag?.active) {
      const tut = state.campaign?.tutorialSeen || {};
      if (battle.tutorial && !tut.steered) {
        // Animated pulsing brass tap target on open water!
        const pulse = 10 + Math.sin(elapsed * 6) * 3;
        ctx.save();
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(112, 372, pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(253, 224, 71, 0.25)";
        ctx.beginPath();
        ctx.arc(112, 372, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawCoachBanner(ctx, "👆 Tap water to steer your course", "#fde047");
      } else if (battle.tutorial && !tut.fired) {
        drawCoachBanner(ctx, "🎯 Drag anywhere to LEAD enemy · Lift to Fire!", "#4ade80");
      } else if (state.coachBanner) {
        drawCoachBanner(ctx, state.coachBanner.text, state.coachBanner.color);
      }
    }

    // Combat Popups
    if (!isDemo) {
      for (const pop of popups) {
        ctx.save();
        ctx.globalAlpha = clamp(pop.life / pop.maxLife, 0, 1);
        ctx.font = `${pop.big ? "800 10.5px" : "700 9.5px"} ${FONT}`;
        ctx.fillStyle = pop.color;
        ctx.textAlign = "center";
        ctx.fillText(pop.text, clamp(pop.x, 54, ARENA_W - 54), clamp(pop.y, 16, ARENA_H - 12));
        ctx.restore();
      }
    }

    ctx.restore(); // end arena clip

    rrect(ctx, vp.x, vp.y, vp.w, vp.h, 14);
    ctx.strokeStyle = "rgba(186, 230, 253, 0.24)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore(); // end shake
  }

  function drawCoachBanner(ctx, msg, color) {
    ctx.save();
    ctx.font = `800 9.5px ${FONT}`;
    const tw = Math.min(ARENA_W - 16, ctx.measureText(msg).width + 16);
    rrect(ctx, ARENA_W * 0.5 - tw * 0.5, ARENA_H - 28, tw, 18, 8);
    ctx.fillStyle = "rgba(10, 16, 26, 0.9)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(msg, ARENA_W * 0.5, ARENA_H - 15.5, tw - 8);
    ctx.restore();
  }

  function renderBattleHud(ctx, state, w, h, elapsed) {
    const { battle, aimDrag, armedTorp, coachCue } = state;
    const rects = getUiRects(w, h, { scene: "battle", battle });
    const pad = Math.max(10, Math.round(w * 0.036));
    const { player, stats } = battle;

    // Compact Top Status Bar
    const barW = w - pad * 2 - 46;
    rrect(ctx, pad, 6, barW, 32, 10);
    ctx.fillStyle = "rgba(12, 20, 30, 0.88)";
    ctx.fill();

    const remaining = battle.enemies.filter((e) => e.hp > 0);
    const iconsLeft = remaining.map((e) => e.icon || "⛵").join(" ");
    const reloadTxt =
      player.reloadTimer <= 0.02 ? "GUNS READY" : `Reload ${player.reloadTimer.toFixed(1)}s`;
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `700 11.5px ${FONT}`;
    ctx.fillText(
      player.hidden ? `👻 Hidden · ${iconsLeft}` : `Foes: ${iconsLeft}`,
      pad + 10,
      26,
      barW - 96,
    );
    ctx.textAlign = "right";
    ctx.fillStyle = player.reloadTimer <= 0.02 ? "#4ade80" : "#fbbf24";
    ctx.font = `800 10.5px ${FONT}`;
    ctx.fillText(reloadTxt, pad + barW - 10, 26);
    ctx.textAlign = "left";

    // Mute Button
    rrect(ctx, rects.muteBtn.x, rects.muteBtn.y, rects.muteBtn.w, rects.muteBtn.h, 10);
    ctx.fillStyle = "rgba(12, 20, 30, 0.88)";
    ctx.fill();
    ctx.font = `13.5px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(state.muted ? "🔇" : "🔊", rects.muteBtn.x + 20, rects.muteBtn.y + 21);
    ctx.textAlign = "left";

    if (aimDrag && aimDrag.active && aimDrag.cancel) {
      const db = rects.dockBand;
      rrect(ctx, db.x, db.y + 4, db.w, 54, 14);
      ctx.fillStyle = "#7f1d1d";
      ctx.fill();
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fecaca";
      ctx.font = `800 14px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("✕ RELEASE TO CANCEL", db.x + db.w * 0.5, db.y + 36);
      ctx.textAlign = "left";
      return;
    }

    const pulseLw = 2 + Math.sin((elapsed || 0) * 8) * 1.1;

    // 1. Left Pill: [ ⚫ AP / 🔥 HE ]
    const ab = rects.ammoBtn;
    const isAp = player.ammo === "ap";
    const highlightHe = coachCue === "he" && isAp;
    rrect(ctx, ab.x, ab.y, ab.w, ab.h, 13);
    ctx.fillStyle = isAp ? "#1e293b" : "#3b1d14";
    ctx.fill();
    ctx.strokeStyle = highlightHe ? "#fb923c" : isAp ? "#fde047" : "#fb923c";
    ctx.lineWidth = highlightHe ? pulseLw + 1 : 1.6;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 12.5px ${FONT}`;
    ctx.fillText(isAp ? "⚫ AP" : "🔥 HE", ab.x + ab.w * 0.5, ab.y + 23);
    ctx.font = `700 9.5px ${FONT}`;
    ctx.fillStyle = highlightHe ? "#fdba74" : isAp ? "#fde047" : "#fb923c";
    ctx.fillText(
      highlightHe ? "Tap for 🔥 HE!" : isAp ? "2× Citadel" : "Burns Armor",
      ab.x + ab.w * 0.5,
      ab.y + 41,
      ab.w - 8,
    );

    // 2. Center Pill: Action-First Engine Brake / Throttle [ ⏹ STOP <-> ▲ FULL ]
    const tb = rects.throttleBtn;
    const isMoving = player.throttle > 0;
    const thMeta = isMoving
      ? {
          lbl: "⏹ STOP",
          sub: "Full Speed ▲",
          borderCol: "#f87171",
          subCol: "#4ade80",
          bg: "#26181c",
        }
      : {
          lbl: "▲ FULL",
          sub: "Stopped ⏹",
          borderCol: "#4ade80",
          subCol: "#f87171",
          bg: "#162621",
        };
    rrect(ctx, tb.x, tb.y, tb.w, tb.h, 13);
    ctx.fillStyle = thMeta.bg;
    ctx.fill();
    ctx.strokeStyle = thMeta.borderCol;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.font = `800 12.5px ${FONT}`;
    ctx.fillText(thMeta.lbl, tb.x + tb.w * 0.5, tb.y + 23);
    ctx.font = `700 9.5px ${FONT}`;
    ctx.fillStyle = thMeta.subCol;
    ctx.fillText(thMeta.sub, tb.x + tb.w * 0.5, tb.y + 41, tb.w - 8);

    // Optional 3rd Pill when player has BOTH Torpedo Conversion + Repair/Smoke!
    if (rects.torpBtn) {
      const trb = rects.torpBtn;
      const tCd = player.torpCd || 0;
      const tReady = tCd <= 0.02;
      const tArmed = armedTorp && tReady;
      const tHi = coachCue === "torp" && tReady && !tArmed;
      rrect(ctx, trb.x, trb.y, trb.w, trb.h, 13);
      ctx.fillStyle = tArmed ? "#0284c7" : tReady ? "#1e293b" : "rgba(15, 23, 42, 0.9)";
      ctx.fill();
      if (!tReady && stats.torpCd > 0) {
        const p = 1 - clamp(tCd / stats.torpCd, 0, 1);
        rrect(ctx, trb.x, trb.y, trb.w * p, trb.h, 13);
        ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
        ctx.fill();
      }
      ctx.strokeStyle = tArmed || tHi ? "#fde047" : tReady ? "#38bdf8" : "#334155";
      ctx.lineWidth = tArmed ? 2.2 : tHi ? pulseLw + 1 : 1.5;
      ctx.stroke();
      ctx.fillStyle = tArmed ? "#ffffff" : tReady ? "#f8fafc" : "#64748b";
      ctx.font = `800 11.5px ${FONT}`;
      ctx.fillText("🚀 TORP", trb.x + trb.w * 0.5, trb.y + 23, trb.w - 6);
      ctx.font = `700 9px ${FONT}`;
      ctx.fillStyle = tArmed || tHi ? "#fde047" : tReady ? "#38bdf8" : "#64748b";
      ctx.fillText(
        tArmed ? "DRAG AIM!" : tReady ? `${stats.torpCount}× Ready` : `${tCd.toFixed(1)}s`,
        trb.x + trb.w * 0.5,
        trb.y + 41,
        trb.w - 6,
      );
    }

    // Right Pill: Special [ 🚀 TORP / 💨 SMOKE / 🛠️ REPAIR / 🔒 NO AUX ]
    const sb = rects.specialBtn;
    const sp = stats.special;
    const spNone = sp.id === "none";
    const spCdVal = sp.id === "torp" ? player.torpCd || 0 : player.specialCd || 0;
    const spMaxCd = sp.id === "torp" ? stats.torpCd || sp.cd : sp.cd;
    const spReady = !spNone && spCdVal <= 0.02;
    const torpArmed = !rects.torpBtn && sp.id === "torp" && armedTorp && spReady;
    const highlightTorp =
      !rects.torpBtn && coachCue === "torp" && sp.id === "torp" && spReady && !torpArmed;
    rrect(ctx, sb.x, sb.y, sb.w, sb.h, 13);
    ctx.fillStyle = spNone
      ? "rgba(15, 23, 42, 0.72)"
      : torpArmed
        ? "#0284c7"
        : spReady
          ? "#1e293b"
          : "rgba(15, 23, 42, 0.9)";
    ctx.fill();
    if (!spNone && !spReady && spMaxCd > 0) {
      const p = 1 - clamp(spCdVal / spMaxCd, 0, 1);
      rrect(ctx, sb.x, sb.y, sb.w * p, sb.h, 13);
      ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
      ctx.fill();
    }
    ctx.strokeStyle = spNone
      ? "#334155"
      : torpArmed || highlightTorp
        ? "#fde047"
        : spReady
          ? sp.color
          : "#334155";
    ctx.lineWidth = torpArmed ? 2.2 : highlightTorp ? pulseLw + 1 : 1.5;
    ctx.stroke();
    ctx.fillStyle = spNone ? "#64748b" : torpArmed ? "#ffffff" : spReady ? "#f8fafc" : "#64748b";
    ctx.font = `800 ${rects.torpBtn ? "11px" : "12px"} ${FONT}`;
    ctx.fillText(`${sp.icon} ${sp.short}`, sb.x + sb.w * 0.5, sb.y + 23, sb.w - 6);
    ctx.font = `700 ${rects.torpBtn ? "9px" : "9.5px"} ${FONT}`;
    ctx.fillStyle = spNone
      ? "#64748b"
      : torpArmed || highlightTorp
        ? "#fde047"
        : spReady
          ? sp.color
          : "#64748b";
    ctx.fillText(
      spNone
        ? "Buy in Drydock"
        : torpArmed
          ? "DRAG AIM!"
          : highlightTorp
            ? "Tap + Drag!"
            : spReady
              ? sp.id === "torp"
                ? `${stats.torpCount}× Ready`
                : "Ready"
              : `${spCdVal.toFixed(1)}s`,
      sb.x + sb.w * 0.5,
      sb.y + 41,
      sb.w - 6,
    );
    ctx.textAlign = "left";
  }

  const screens = createScreenRenderers({
    getUiRects,
    renderBattleArena,
    drawSteelWarship,
    buildPlayerShipVisual,
  });

  return {
    clearFx,
    ingestBattleEvents,
    stepFx,
    render(ctx, state, w, h, elapsed) {
      if (state.scene === "title") screens.renderTitle(ctx, state, w, h, elapsed);
      else if (state.scene === "bridge") screens.renderBridge(ctx, state, w, h, elapsed);
      else if (state.scene === "drydock") screens.renderDrydock(ctx, state, w, h, elapsed);
      else if (state.scene === "aftermath") screens.renderAftermath(ctx, state, w, h);
      else if (state.scene === "battle" && state.battle) {
        ctx.fillStyle = "#09111a";
        ctx.fillRect(0, 0, w, h);
        const liftY = state.seaLiftY || 0;
        const vp = getSeaViewport(w, h, liftY);
        ctx.save();
        if (liftY > 0.5) {
          ctx.beginPath();
          ctx.rect(0, 44, w, Math.max(0, h - 66 - 44));
          ctx.clip();
        }
        renderBattleArena(ctx, state, vp, elapsed, false);
        ctx.restore();

        if (hitFlash > 0) {
          ctx.fillStyle = `rgba(239, 68, 68, ${(hitFlash / 0.28) * 0.24})`;
          ctx.fillRect(0, 0, w, h);
        }

        // Rangefinder Stylus: subtle brass thumb-contact ring + vertical sightline stem!
        const ad = state.aimDrag;
        if (
          ad?.active &&
          !ad.cancel &&
          Number.isFinite(ad.screenX) &&
          Number.isFinite(ad.screenY)
        ) {
          const retPt = arenaToScreen(ad.tx, ad.ty, vp);
          const stemCol = state.armedTorp ? "rgba(56, 189, 248, 0.55)" : "rgba(253, 224, 71, 0.55)";
          ctx.save();
          // Vertical dashed sightline stem connecting thumb pad to reticle above it
          const stemStartY = ad.screenY - 15;
          const stemEndY = retPt.y + (state.armedTorp ? 8 : 14);
          if (stemStartY > stemEndY + 4) {
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = stemCol;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(ad.screenX, stemStartY);
            ctx.lineTo(retPt.x, stemEndY);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          // Subtle brass thumb-contact ring under fingertip
          ctx.strokeStyle = stemCol;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ad.screenX, ad.screenY, 15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = stemCol;
          ctx.beginPath();
          ctx.arc(ad.screenX, ad.screenY, 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        renderBattleHud(ctx, state, w, h, elapsed);
      }
    },
  };
}
