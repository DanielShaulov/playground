/**
 * Meta-screen renderers for Broadside!:
 * - Title Screen (over live warship duel)
 * - The Bridge (animated bow-turret horizon + 3 Brass Admiralty Dispatches with mini-map thumbnails)
 * - Single-Ship Modular Drydock (blueprint warship slipway + 4 Hardpoint Bays + 2-col branching trade-off grid)
 * - Aftermath (Victory Salvage / "Escaped With Injuries!" retreat damage screen)
 */

import { BAYS, PART_BY_ID, THEATERS } from "./core/content.js";
import { ARENA_W, ARENA_H, clamp } from "./core/sim.js";
import {
  computeShipStats,
  isPartUnlocked,
  getAnyDamagedPartIds,
  hasAffordableUpgrade,
} from "./core/campaign.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
}

export function createScreenRenderers({
  getUiRects,
  renderBattleArena,
  drawSteelWarship,
  buildPlayerShipVisual,
}) {
  function renderTitle(ctx, state, w, h, elapsed) {
    if (state.demoBattle) {
      const vp = { x: 0, y: 0, w, h, scale: Math.max(w / ARENA_W, h / ARENA_H) };
      renderBattleArena(
        ctx,
        { battle: state.demoBattle, campaign: state.campaign },
        vp,
        elapsed,
        true,
      );
    } else {
      ctx.fillStyle = "#0b293a";
      ctx.fillRect(0, 0, w, h);
    }

    const vig = ctx.createLinearGradient(0, 0, 0, h);
    vig.addColorStop(0, "rgba(10, 16, 26, 0.62)");
    vig.addColorStop(0.5, "rgba(10, 16, 26, 0.78)");
    vig.addColorStop(1, "rgba(10, 16, 26, 0.95)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    const rects = getUiRects(w, h, { scene: "title" });
    const stats = computeShipStats(state.campaign);

    rrect(ctx, rects.reset.x, rects.reset.y, rects.reset.w, rects.reset.h, 10);
    ctx.fillStyle = state.confirmReset ? "#7f1d1d" : "rgba(25, 33, 48, 0.85)";
    ctx.fill();
    ctx.fillStyle = state.confirmReset ? "#fecaca" : "#94a3b8";
    ctx.font = `600 11.5px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(
      state.confirmReset ? "Confirm?" : "Reset",
      rects.reset.x + rects.reset.w * 0.5,
      rects.reset.y + 24,
    );

    rrect(ctx, rects.mute.x, rects.mute.y, rects.mute.w, rects.mute.h, 10);
    ctx.fillStyle = "rgba(25, 33, 48, 0.85)";
    ctx.fill();
    ctx.font = `16px ${FONT}`;
    ctx.fillText(state.muted ? "🔇" : "🔊", rects.mute.x + 22, rects.mute.y + 27);

    const cy = h * 0.35;
    ctx.font = `40px ${FONT}`;
    ctx.fillText("⚓", w * 0.5, cy - 22);

    ctx.fillStyle = "#f8fafc";
    ctx.font = `900 34px ${FONT}`;
    ctx.fillText("BROADSIDE!", w * 0.5, cy + 24, w - 32);

    ctx.fillStyle = "#fbbf24";
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText("Build Your Warship · Angle · Lead · Citadel!", w * 0.5, cy + 50, w - 32);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(
      `${stats.shipTitle} (${stats.maxHp} HP) · Theater ${state.campaign.theater}/3 · ${state.campaign.gold}💰`,
      w * 0.5,
      cy + 78,
      w - 32,
    );

    const damagedCount = getAnyDamagedPartIds(state.campaign).length;
    rrect(ctx, rects.drydock.x, rects.drydock.y, rects.drydock.w, rects.drydock.h, 13);
    ctx.fillStyle = damagedCount > 0 ? "#451a03" : "#1e293b";
    ctx.fill();
    ctx.strokeStyle = damagedCount > 0 ? "#f87171" : "#475569";
    ctx.lineWidth = damagedCount > 0 ? 1.8 : 1.2;
    ctx.stroke();
    ctx.fillStyle = damagedCount > 0 ? "#fca5a5" : "#e2e8f0";
    ctx.font = `700 13.5px ${FONT}`;
    ctx.fillText(
      damagedCount > 0 ? `🔧 Drydock (${damagedCount} Damaged!)` : "🔧 Ship Drydock",
      rects.drydock.x + rects.drydock.w * 0.5,
      rects.drydock.y + 29,
    );

    rrect(ctx, rects.primary.x, rects.primary.y, rects.primary.w, rects.primary.h, 15);
    ctx.fillStyle = "#eab308";
    ctx.fill();
    ctx.fillStyle = "#1c1917";
    ctx.font = `800 16px ${FONT}`;
    ctx.fillText(
      state.campaign.totalWins > 0 ? "⚓ TO THE BRIDGE →" : "⚓ SET SAIL →",
      rects.primary.x + rects.primary.w * 0.5,
      rects.primary.y + 32,
    );
    ctx.textAlign = "left";
  }

  function drawBridgeHorizon(ctx, box, campaign, stats, theaterDef, elapsed) {
    const pal = theaterDef.palette;
    ctx.save();
    rrect(ctx, box.x, box.y, box.w, box.h, 14);
    ctx.clip();

    const horizonY = box.y + box.h * 0.52;
    const sky = ctx.createLinearGradient(0, box.y, 0, horizonY);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBot);
    ctx.fillStyle = sky;
    ctx.fillRect(box.x, box.y, box.w, horizonY - box.y);

    ctx.fillStyle =
      campaign.theater === 3 ? "rgba(251, 146, 60, 0.25)" : "rgba(253, 224, 71, 0.22)";
    ctx.beginPath();
    ctx.arc(box.x + box.w * 0.24, horizonY - 12, 28, 0, Math.PI * 2);
    ctx.fill();

    const sea = ctx.createLinearGradient(0, horizonY, 0, box.y + box.h);
    sea.addColorStop(0, pal.seaTop);
    sea.addColorStop(1, pal.seaBot);
    ctx.fillStyle = sea;
    ctx.fillRect(box.x, horizonY, box.w, box.y + box.h - horizonY);

    ctx.strokeStyle = pal.horizon;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x, horizonY);
    ctx.lineTo(box.x + box.w, horizonY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Distant Sea Stacks
    ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
    ctx.beginPath();
    ctx.moveTo(box.x + 12, horizonY);
    ctx.lineTo(box.x + 28, horizonY - 22);
    ctx.lineTo(box.x + 48, horizonY - 16);
    ctx.lineTo(box.x + 62, horizonY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(box.x + box.w - 76, horizonY);
    ctx.lineTo(box.x + box.w - 58, horizonY - 14);
    ctx.lineTo(box.x + box.w - 34, horizonY - 26);
    ctx.lineTo(box.x + box.w - 14, horizonY);
    ctx.closePath();
    ctx.fill();

    // Distant Warship Silhouettes + Drifting Smoke Plumes
    const silhouettes = [
      { rx: 0.44, scale: 0.9, dir: 1 },
      { rx: 0.72, scale: 1.15, dir: -1 },
    ];
    for (const s of silhouettes) {
      const sx = box.x + box.w * s.rx + Math.sin(elapsed * 0.35 + s.rx * 8) * 6;
      const sy = horizonY - 1;
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.moveTo(sx - 14 * s.scale, sy);
      ctx.lineTo(sx - 11 * s.scale, sy - 4 * s.scale);
      ctx.lineTo(sx - 3 * s.scale, sy - 4 * s.scale);
      ctx.lineTo(sx - 1 * s.scale, sy - 9 * s.scale);
      ctx.lineTo(sx + 4 * s.scale, sy - 9 * s.scale);
      ctx.lineTo(sx + 6 * s.scale, sy - 4 * s.scale);
      ctx.lineTo(sx + 15 * s.scale, sy - 4 * s.scale);
      ctx.lineTo(sx + 12 * s.scale, sy);
      ctx.closePath();
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        const p = (elapsed * 0.35 + k * 0.33) % 1;
        ctx.fillStyle = `rgba(15, 23, 42, ${0.38 * (1 - p)})`;
        ctx.beginPath();
        ctx.arc(sx + 2 + p * 18 * s.dir, sy - 10 - p * 11, 2.5 + p * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Animated Water Shimmer
    ctx.strokeStyle = "rgba(186, 230, 253, 0.22)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const wy = horizonY + 8 + i * ((box.h * 0.42) / 6);
      const wx = box.x + ((i * 67 + elapsed * (12 + i * 2)) % Math.max(40, box.w - 30));
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + 24 + i * 4, wy);
      ctx.stroke();
    }

    // Foreground Bridge Rail + Live Bow Turret Silhouette (barrels reflect your equipped bowGuns!)
    const railY = box.y + box.h - 14;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(box.x, railY, box.w, 16);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(box.x, railY);
    ctx.lineTo(box.x + box.w, railY);
    ctx.stroke();

    const tx = box.x + box.w - 46;
    const ty = railY + 2;
    const barrels = Math.max(1, Math.min(3, stats.bowGuns || 1));
    const gunsId = stats.activeParts?.guns?.id || "guns_starter";
    const sysId = stats.activeParts?.sys?.id || "sys_iron_sights";
    const bLen = gunsId === "guns_ap_rifles" || gunsId === "guns_triple" ? 38 : 30;
    ctx.strokeStyle = gunsId === "guns_ap_rifles" ? "#fde68a" : "#94a3b8";
    ctx.lineWidth = barrels >= 3 ? 2.1 : 2.4;
    for (let b = 0; b < barrels; b++) {
      const off = (b - (barrels - 1) * 0.5) * 4.2;
      ctx.beginPath();
      ctx.moveTo(tx - 6, ty - 6 + off * 0.4);
      ctx.lineTo(tx - bLen, ty - 16 + off);
      ctx.stroke();
    }
    rrect(ctx, tx - 14, ty - 14, 28, 16, 4);
    ctx.fillStyle = stats.strengthenedHull ? "#1e293b" : "#334155";
    ctx.fill();
    ctx.strokeStyle = stats.strengthenedHull ? "#fbbf24" : "#64748b";
    ctx.lineWidth = stats.strengthenedHull ? 1.6 : 1.2;
    ctx.stroke();
    if (sysId === "sys_admiralty" || sysId === "sys_rangefinder") {
      const spin = sysId === "sys_admiralty" ? Math.cos(elapsed * 3.5) * 8 : 7;
      ctx.strokeStyle = sysId === "sys_admiralty" ? "#38bdf8" : "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 14);
      ctx.lineTo(tx, ty - 22);
      ctx.moveTo(tx - spin, ty - 22);
      ctx.lineTo(tx + spin, ty - 22);
      ctx.stroke();
    }

    // Flagship Progress Pill
    const winsHere = campaign.theaterWins?.[campaign.theater] || 0;
    const bossReady = winsHere >= 2;
    const statusTxt = campaign.flagshipsSunk?.[campaign.theater]
      ? `★ ${theaterDef.name} Secured`
      : bossReady
        ? "👑 FLAGSHIP IN RANGE!"
        : `Flagship Hunt: ${winsHere}/2 Wins`;

    rrect(ctx, box.x + 8, box.y + 8, Math.min(box.w - 16, 178), 22, 8);
    ctx.fillStyle = "rgba(10, 16, 26, 0.78)";
    ctx.fill();
    ctx.fillStyle = bossReady ? "#fde047" : "#e2e8f0";
    ctx.font = `800 10.5px ${FONT}`;
    ctx.fillText(statusTxt, box.x + 15, box.y + 22.5, 164);

    // Bottom-left Ship Identity tag on rail
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `700 10.5px ${FONT}`;
    ctx.fillText(
      `${stats.shipTitle} · ${stats.bowGuns}+${stats.sternGuns} Guns · ${Math.round(stats.speed)}kt`,
      box.x + 10,
      box.y + box.h - 3.5,
      box.w - 86,
    );

    ctx.restore();
    rrect(ctx, box.x, box.y, box.w, box.h, 14);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  function drawDispatchMinimap(ctx, x, y, size, dispatch, theaterDef) {
    const pal = theaterDef.palette;
    ctx.save();
    rrect(ctx, x, y, size, size, 9);
    ctx.clip();

    const g = ctx.createLinearGradient(0, y, 0, y + size);
    g.addColorStop(0, pal.seaTop);
    g.addColorStop(1, pal.seaBot);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);

    const sx = size / ARENA_W;
    const sy = size / ARENA_H;

    if (dispatch.nodeType === "convoy") {
      ctx.fillStyle = "rgba(250, 204, 21, 0.2)";
      ctx.fillRect(x + size * 0.36, y, size * 0.28, size);
    }

    // Handcrafted Landform Silhouettes (exact 1:1 preview of the battle map!)
    const landforms = dispatch.landforms || [];
    if (landforms.length > 0) {
      for (const lf of landforms) {
        if (!lf.pts || lf.pts.length < 3) continue;
        ctx.beginPath();
        lf.pts.forEach((pt, idx) => {
          const px = x + pt.x * sx;
          const py = y + pt.y * sy;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle =
          lf.kind === "breakwater" ? "#94a3b8" : lf.kind === "cliff" ? "#78716c" : pal.sand;
        ctx.fill();
        ctx.strokeStyle = pal.shoal;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    } else {
      for (const isl of dispatch.islands || []) {
        const ix = x + isl.x * sx;
        const iy = y + isl.y * sy;
        const ir = Math.max(3, isl.r * Math.min(sx, sy));
        ctx.fillStyle = isl.fortIsland ? "#94a3b8" : pal.sand;
        ctx.beginPath();
        ctx.arc(ix, iy, ir, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sea-Fog Banks on mini-map
    for (const fog of dispatch.fogZones || []) {
      ctx.fillStyle = "rgba(226, 232, 240, 0.34)";
      ctx.beginPath();
      ctx.arc(x + fog.x * sx, y + fog.y * sy, Math.max(5, fog.r * sx), 0, Math.PI * 2);
      ctx.fill();
    }

    // Lighthouse golden pips
    ctx.fillStyle = "#fef08a";
    for (const lh of dispatch.lighthouses || []) {
      ctx.beginPath();
      ctx.arc(x + lh.x * sx, y + lh.y * sy, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#f97316";
    for (const m of dispatch.mines || []) {
      ctx.beginPath();
      ctx.arc(x + m.x * sx, y + m.y * sy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const nE = Math.min(3, (dispatch.roster || []).length);
    ctx.fillStyle = dispatch.isBoss ? "#fde047" : "#f87171";
    for (let i = 0; i < nE; i++) {
      const ex = x + size * (nE === 1 ? 0.5 : 0.28 + (i / (nE - 1)) * 0.44);
      const ey = y + size * 0.2;
      ctx.beginPath();
      ctx.arc(ex, ey, dispatch.isBoss && i === 0 ? 3.2 : 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.arc(x + size * 0.5, y + size * 0.84, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    rrect(ctx, x, y, size, size, 9);
    ctx.strokeStyle = "rgba(186, 230, 253, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function renderBridge(ctx, state, w, h, elapsed) {
    const { campaign, dispatches, selectedDispatchIdx } = state;
    const stats = computeShipStats(campaign);
    const theaterDef = THEATERS[campaign.theater - 1] || THEATERS[0];
    const rects = getUiRects(w, h, { scene: "bridge" });

    ctx.fillStyle = "#0e1622";
    ctx.fillRect(0, 0, w, h);

    // Top Theater Selector Bar
    const canPrev = campaign.theater > 1;
    const canNext = campaign.theater < campaign.maxUnlockedTheater;

    rrect(
      ctx,
      rects.theaterPrev.x,
      rects.theaterPrev.y,
      rects.theaterPrev.w,
      rects.theaterPrev.h,
      9,
    );
    ctx.fillStyle = canPrev ? "#1e293b" : "#111827";
    ctx.fill();
    ctx.fillStyle = canPrev ? "#f8fafc" : "#475569";
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("◀", rects.theaterPrev.x + rects.theaterPrev.w * 0.5, rects.theaterPrev.y + 24);

    rrect(
      ctx,
      rects.theaterLabel.x,
      rects.theaterLabel.y,
      rects.theaterLabel.w,
      rects.theaterLabel.h,
      9,
    );
    ctx.fillStyle = "#162030";
    ctx.fill();
    ctx.strokeStyle = "rgba(251, 191, 36, 0.3)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.font = `800 12.5px ${FONT}`;
    ctx.fillText(
      `${theaterDef.name} (${campaign.theater}/3)`,
      rects.theaterLabel.x + rects.theaterLabel.w * 0.5,
      rects.theaterLabel.y + 24,
      rects.theaterLabel.w - 10,
    );

    rrect(
      ctx,
      rects.theaterNext.x,
      rects.theaterNext.y,
      rects.theaterNext.w,
      rects.theaterNext.h,
      9,
    );
    ctx.fillStyle = canNext ? "#1e293b" : "#111827";
    ctx.fill();
    ctx.fillStyle = canNext ? "#f8fafc" : "#475569";
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText("▶", rects.theaterNext.x + rects.theaterNext.w * 0.5, rects.theaterNext.y + 24);

    // Drydock Button (glows red if parts damaged, gold if upgrade affordable!)
    const damagedCount = getAnyDamagedPartIds(campaign).length;
    const canUpgrade = hasAffordableUpgrade(campaign);
    const pulseLw = 1.6 + Math.sin(elapsed * 6) * 0.8;
    rrect(ctx, rects.drydockBtn.x, rects.drydockBtn.y, rects.drydockBtn.w, rects.drydockBtn.h, 9);
    ctx.fillStyle = damagedCount > 0 ? "#451a03" : canUpgrade ? "#262116" : "#1e293b";
    ctx.fill();
    ctx.strokeStyle = damagedCount > 0 ? "#f87171" : canUpgrade ? "#fbbf24" : "#475569";
    ctx.lineWidth = damagedCount > 0 || canUpgrade ? pulseLw : 1.2;
    ctx.stroke();
    ctx.fillStyle = damagedCount > 0 ? "#fca5a5" : canUpgrade ? "#fde047" : "#e2e8f0";
    ctx.font = `800 11.5px ${FONT}`;
    ctx.fillText(
      damagedCount > 0 ? `🔧 Fix (${damagedCount})` : canUpgrade ? "🔧 Refit!" : "🔧 Drydock",
      rects.drydockBtn.x + rects.drydockBtn.w * 0.5,
      rects.drydockBtn.y + 24,
      rects.drydockBtn.w - 8,
    );
    ctx.textAlign = "left";

    // Live Animated Bridge Horizon
    drawBridgeHorizon(ctx, rects.horizon, campaign, stats, theaterDef, elapsed);

    // 3 Brass Admiralty Dispatch Cards
    const selIdx = clamp(selectedDispatchIdx || 0, 0, Math.max(0, (dispatches?.length || 1) - 1));
    for (const slot of rects.dispatches) {
      const d = dispatches?.[slot.index];
      if (!d) continue;
      const isSel = slot.index === selIdx;

      rrect(ctx, slot.x, slot.y, slot.w, slot.h, 13);
      ctx.fillStyle = isSel ? "#1b283b" : "#131d2b";
      ctx.fill();
      ctx.strokeStyle = isSel
        ? d.isBoss
          ? "#fde047"
          : "#fbbf24"
        : d.isBoss
          ? "rgba(248, 113, 113, 0.5)"
          : "rgba(148, 163, 184, 0.22)";
      ctx.lineWidth = isSel ? 2.2 : 1.2;
      ctx.stroke();

      const mapSize = Math.max(44, Math.min(slot.h - 14, 72));
      const mx = slot.x + 8;
      const my = slot.y + (slot.h - mapSize) * 0.5;
      drawDispatchMinimap(ctx, mx, my, mapSize, d, theaterDef);

      const tx = mx + mapSize + 10;
      const tw = slot.x + slot.w - tx - 10;

      ctx.fillStyle = d.isBoss ? "#fde047" : "#f8fafc";
      ctx.font = `800 12.5px ${FONT}`;
      ctx.fillText(d.name, tx, slot.y + 21, tw - 54);

      ctx.textAlign = "right";
      ctx.fillStyle = "#fbbf24";
      ctx.font = `800 12px ${FONT}`;
      ctx.fillText(`+${d.estGold}💰`, slot.x + slot.w - 10, slot.y + 21);
      ctx.textAlign = "left";

      ctx.fillStyle = "#94a3b8";
      ctx.font = `600 11px ${FONT}`;
      ctx.fillText(`${d.terrainLabel} · ${d.icons}`, tx, slot.y + Math.min(41, slot.h * 0.56), tw);

      const threatLbl = d.isBoss
        ? "👑 SECTOR FLAGSHIP"
        : d.threat === 1
          ? "💀 Safe Patrol"
          : d.threat === 2
            ? "💀💀 Tactical Contract"
            : "💀💀💀 High-Stakes Raid";
      ctx.fillStyle = d.isBoss
        ? "#f87171"
        : d.threat === 1
          ? "#4ade80"
          : d.threat === 2
            ? "#fbbf24"
            : "#fb923c";
      ctx.font = `700 10.5px ${FONT}`;
      ctx.fillText(threatLbl, tx, slot.y + slot.h - 10, tw);
    }

    const selD = dispatches?.[selIdx];
    rrect(ctx, rects.primary.x, rects.primary.y, rects.primary.w, rects.primary.h, 14);
    ctx.fillStyle = selD?.isBoss ? "#eab308" : "#4ade80";
    ctx.fill();
    ctx.fillStyle = selD?.isBoss ? "#1c1917" : "#052e16";
    ctx.font = `800 15px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(
      selD ? `⚓ ENGAGE: ${selD.name.toUpperCase()} →` : "⚓ ENGAGE TARGET →",
      rects.primary.x + rects.primary.w * 0.5,
      rects.primary.y + 32,
      rects.primary.w - 18,
    );
    ctx.textAlign = "left";
  }

  function renderDrydock(ctx, state, w, h, elapsed) {
    const { campaign, selectedBay } = state;
    const activeBay = selectedBay || "hull";
    const stats = computeShipStats(campaign);
    const rects = getUiRects(w, h, { scene: "drydock", selectedBay: activeBay });

    ctx.fillStyle = "#0b1320";
    ctx.fillRect(0, 0, w, h);

    // 1. Upper Blueprint Slipway with Live Top-Down Warship
    const slip = rects.slip;
    rrect(ctx, slip.x, slip.y, slip.w, slip.h, 14);
    ctx.fillStyle = "#102033";
    ctx.fill();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.32)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.save();
    rrect(ctx, slip.x, slip.y, slip.w, slip.h, 14);
    ctx.clip();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
    ctx.lineWidth = 1;
    for (let gx = slip.x + 18; gx < slip.x + slip.w; gx += 18) {
      ctx.beginPath();
      ctx.moveTo(gx, slip.y);
      ctx.lineTo(gx, slip.y + slip.h);
      ctx.stroke();
    }
    for (let gy = slip.y + 18; gy < slip.y + slip.h; gy += 18) {
      ctx.beginPath();
      ctx.moveTo(slip.x, gy);
      ctx.lineTo(slip.x + slip.w, gy);
      ctx.stroke();
    }

    const shipCx = slip.x + Math.min(76, slip.w * 0.22);
    const shipCy = slip.y + slip.h * 0.52;
    ctx.save();
    ctx.translate(shipCx, shipCy);
    ctx.scale(1.8, 1.8);
    drawSteelWarship(
      ctx,
      0,
      0,
      -Math.PI * 0.5,
      buildPlayerShipVisual(stats, {
        turretAng: -Math.PI * 0.5 + Math.sin(elapsed * 1.2) * 0.35,
        elapsed,
      }),
    );
    ctx.restore();
    ctx.restore();

    const infoX = slip.x + Math.min(144, slip.w * 0.42);
    const infoW = slip.x + slip.w - infoX - 10;
    ctx.fillStyle = "#fbbf24";
    ctx.font = `800 14px ${FONT}`;
    ctx.fillText(stats.shipTitle, infoX, slip.y + 22, infoW);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(
      `♥ ${stats.maxHp} HP · ⚡ ${Math.round(stats.speed)} kt`,
      infoX,
      slip.y + 42,
      infoW,
    );
    ctx.fillText(
      `🔫 ${stats.bowGuns}+${stats.sternGuns} Guns · ${stats.reload.toFixed(1)}s`,
      infoX,
      slip.y + 60,
      infoW,
    );
    const auxTxt = stats.hasDualSpecial
      ? `🚀 ${stats.torpCount}× Torps + ${stats.special.icon} ${stats.special.short}`
      : stats.special.id === "torp"
        ? `🚀 ${stats.torpCount}× Torpedoes`
        : stats.special.id === "none"
          ? "🔒 No Deck Special"
          : `${stats.special.icon} ${stats.special.name}`;
    ctx.fillStyle = stats.special.id === "none" ? "#94a3b8" : "#38bdf8";
    ctx.fillText(auxTxt, infoX, slip.y + 78, infoW);

    const dmgCount = getAnyDamagedPartIds(campaign).length;
    ctx.fillStyle = dmgCount > 0 ? "#f87171" : "#4ade80";
    ctx.font = `700 10.5px ${FONT}`;
    ctx.fillText(
      dmgCount > 0 ? `🔧 ${dmgCount} Part(s) Damaged!` : "✓ All Systems Nominal",
      infoX,
      slip.y + slip.h - 9,
      infoW,
    );

    // 2. 4 Hardpoint Bay Tabs
    for (const tab of rects.bayTabs) {
      const bayDef = BAYS.find((b) => b.id === tab.bayId);
      const isSel = tab.bayId === activeBay;
      const eqId = campaign.equipped[tab.bayId];
      const bayDamaged = Boolean(campaign.damagedParts?.[eqId]);

      rrect(ctx, tab.x, tab.y, tab.w, tab.h, 10);
      ctx.fillStyle = isSel ? "#1e3a5f" : bayDamaged ? "#3b1414" : "#151f2e";
      ctx.fill();
      ctx.strokeStyle = bayDamaged ? "#f87171" : isSel ? "#fbbf24" : "#334155";
      ctx.lineWidth = isSel || bayDamaged ? 2 : 1.2;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = bayDamaged ? "#fca5a5" : isSel ? "#fde047" : "#cbd5e1";
      ctx.font = `800 11.5px ${FONT}`;
      ctx.fillText(
        `${bayDamaged ? "🔧" : bayDef.icon} ${bayDef.short}`,
        tab.x + tab.w * 0.5,
        tab.y + 23,
        tab.w - 6,
      );
      ctx.textAlign = "left";
    }

    // 3. 2-Column Branching Trade-Off Part Grid
    for (const cell of rects.partCards) {
      const part = PART_BY_ID[cell.partId];
      if (!part) continue;
      const owned = Boolean(campaign.ownedParts[part.id]);
      const equipped = campaign.equipped[part.bay] === part.id;
      const damaged = Boolean(campaign.damagedParts[part.id]);
      const unlocked = isPartUnlocked(campaign, part);
      const canBuy = !owned && unlocked && campaign.gold >= part.cost;
      const canRepair = damaged && campaign.gold >= part.repairCost;

      rrect(ctx, cell.x, cell.y, cell.w, cell.h, 12);
      ctx.fillStyle = damaged
        ? "#2c1317"
        : equipped
          ? "#172b3d"
          : owned
            ? "#162233"
            : unlocked
              ? "#121a28"
              : "#0e131d";
      ctx.fill();
      ctx.strokeStyle = damaged ? "#f87171" : equipped ? "#4ade80" : canBuy ? "#fbbf24" : "#273449";
      ctx.lineWidth = damaged || equipped ? 2 : 1.2;
      ctx.stroke();

      const padX = 7;
      ctx.fillStyle = unlocked || owned ? "#f8fafc" : "#64748b";
      ctx.font = `800 11px ${FONT}`;
      ctx.fillText(`${part.icon} ${part.name}`, cell.x + padX, cell.y + 16, cell.w - 30);

      ctx.textAlign = "right";
      ctx.fillStyle = "#64748b";
      ctx.font = `700 9.5px ${FONT}`;
      ctx.fillText(`T${part.tier}`, cell.x + cell.w - 6, cell.y + 15);
      ctx.textAlign = "left";

      ctx.fillStyle = unlocked || owned ? "#4ade80" : "#475569";
      ctx.font = `700 9.5px ${FONT}`;
      const proTxt = part.pro.startsWith("+") ? part.pro : `+ ${part.pro}`;
      ctx.fillText(proTxt, cell.x + padX, cell.y + 31, cell.w - padX * 2);

      ctx.fillStyle = unlocked || owned ? "#fb923c" : "#475569";
      ctx.font = `600 9.2px ${FONT}`;
      const conTxt = part.con.startsWith("-") ? part.con : `- ${part.con}`;
      ctx.fillText(conTxt, cell.x + padX, cell.y + 44, cell.w - padX * 2);

      const pillH = 20;
      const pillY = cell.y + cell.h - pillH - 5;
      rrect(ctx, cell.x + 6, pillY, cell.w - 12, pillH, 7);

      let pillBg = "#1e293b";
      let pillCol = "#94a3b8";
      let pillTxt = `BUY ${part.cost}💰`;

      if (damaged) {
        pillBg = canRepair ? "#ea580c" : "#7f1d1d";
        pillCol = "#ffffff";
        pillTxt = `🔧 REPAIR ${part.repairCost}💰`;
      } else if (equipped) {
        pillBg = "#14532d";
        pillCol = "#86efac";
        pillTxt = "✓ EQUIPPED";
      } else if (owned) {
        pillBg = "#1e3a5f";
        pillCol = "#bae6fd";
        pillTxt = "TAP TO EQUIP";
      } else if (!unlocked) {
        pillBg = "#111827";
        pillCol = "#64748b";
        pillTxt = part.tier === 2 ? "🔒 2 Wins / T2" : "🔒 Theater 3";
      } else if (canBuy) {
        pillBg = "#eab308";
        pillCol = "#1c1917";
        pillTxt = `BUY · ${part.cost}💰`;
      } else {
        pillBg = "#1e293b";
        pillCol = "#94a3b8";
        pillTxt = `NEED ${part.cost}💰`;
      }

      ctx.fillStyle = pillBg;
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = pillCol;
      ctx.font = `800 9.8px ${FONT}`;
      ctx.fillText(pillTxt, cell.x + cell.w * 0.5, pillY + 13.5, cell.w - 16);
      ctx.textAlign = "left";
    }

    // 4. Bottom Return to Bridge Button
    rrect(ctx, rects.primary.x, rects.primary.y, rects.primary.w, rects.primary.h, 14);
    ctx.fillStyle = "#4ade80";
    ctx.fill();
    ctx.fillStyle = "#052e16";
    ctx.font = `800 15px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(
      "⚓ RETURN TO BRIDGE →",
      rects.primary.x + rects.primary.w * 0.5,
      rects.primary.y + 32,
    );
    ctx.textAlign = "left";
  }

  function renderAftermath(ctx, state, w, h) {
    const res = state.aftermath;
    if (!res) return;
    const pad = Math.max(10, Math.round(w * 0.034));
    const rects = getUiRects(w, h, { scene: "aftermath" });
    const won = res.won;

    ctx.fillStyle = "#0d131d";
    ctx.fillRect(0, 0, w, h);

    rrect(ctx, pad, 28, w - pad * 2, h - 168, 18);
    ctx.fillStyle = "#162030";
    ctx.fill();
    ctx.strokeStyle = won ? "#4ade80" : "#f87171";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = `38px ${FONT}`;
    ctx.fillText(won ? "🏆" : "🛟", w * 0.5, 80);

    ctx.fillStyle = won ? "#4ade80" : "#f87171";
    ctx.font = `900 20px ${FONT}`;
    ctx.fillText(won ? "VICTORY!" : "ESCAPED WITH INJURIES!", w * 0.5, 112, w - pad * 2 - 20);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(res.dispatchName || "", w * 0.5, 134, w - pad * 2 - 24);

    if (won) {
      ctx.fillStyle = "#fde047";
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText(`+${res.totalGold}💰 Salvage Banked`, w * 0.5, 178);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = `600 12.5px ${FONT}`;
      ctx.fillText(
        `Sunk: ${res.shipsSunk}  ·  Citadels: ${res.citadels}  ·  Bounces: ${res.bounces}`,
        w * 0.5,
        210,
        w - pad * 2 - 24,
      );

      if (res.unlockedTheater) {
        const thDef = THEATERS[res.unlockedTheater - 1];
        ctx.fillStyle = "#38bdf8";
        ctx.font = `800 14px ${FONT}`;
        ctx.fillText(
          `🌊 UNLOCKED: ${thDef?.name?.toUpperCase() || `THEATER ${res.unlockedTheater}`}!`,
          w * 0.5,
          250,
          w - pad * 2 - 24,
        );
      } else if (hasAffordableUpgrade(state.campaign)) {
        ctx.fillStyle = "#4ade80";
        ctx.font = `700 13px ${FONT}`;
        ctx.fillText("🔧 New Ship Refit affordable in Drydock!", w * 0.5, 250, w - pad * 2 - 24);
      }
    } else {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = `600 12px ${FONT}`;
      ctx.fillText("Your ship limped safely back to Port.", w * 0.5, 164, w - pad * 2 - 24);

      if (res.damagedIds && res.damagedIds.length > 0) {
        ctx.fillStyle = "#fca5a5";
        ctx.font = `800 12px ${FONT}`;
        ctx.fillText(
          "DAMAGED IN RETREAT (Offline until repaired):",
          w * 0.5,
          196,
          w - pad * 2 - 24,
        );

        res.damagedIds.forEach((pid, idx) => {
          const p = PART_BY_ID[pid];
          if (!p) return;
          const ry = 208 + idx * 34;
          rrect(ctx, pad + 16, ry, w - pad * 2 - 32, 28, 8);
          ctx.fillStyle = "#3b1414";
          ctx.fill();
          ctx.strokeStyle = "#f87171";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = "#fef2f2";
          ctx.font = `800 11.5px ${FONT}`;
          ctx.fillText(
            `🔧 ${p.icon} ${p.name} · Repair: ${p.repairCost}💰`,
            w * 0.5,
            ry + 18,
            w - pad * 2 - 44,
          );
        });
      } else if (res.protectedByBulkhead) {
        ctx.fillStyle = "#4ade80";
        ctx.font = `800 12.5px ${FONT}`;
        ctx.fillText("⚓ Armored Bulkheads protected your gear!", w * 0.5, 210, w - pad * 2 - 24);
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.font = `700 12px ${FONT}`;
        ctx.fillText("Starter hull patched — no parts lost!", w * 0.5, 210, w - pad * 2 - 24);
      }

      ctx.fillStyle = "#38bdf8";
      ctx.font = `700 11.5px ${FONT}`;
      ctx.fillText(
        res.tip || "🛡️ Tip: Point your bow at red shells to bounce AP!",
        w * 0.5,
        Math.min(h - 154, 294),
        w - pad * 2 - 24,
      );
    }

    const hasDmg = getAnyDamagedPartIds(state.campaign).length > 0;
    const hasUpg = hasAffordableUpgrade(state.campaign);
    rrect(ctx, rects.drydock.x, rects.drydock.y, rects.drydock.w, rects.drydock.h, 13);
    ctx.fillStyle = hasDmg ? "#9a3412" : hasUpg ? "#262116" : "#1e293b";
    ctx.fill();
    ctx.strokeStyle = hasDmg ? "#f87171" : hasUpg ? "#fbbf24" : "#475569";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = hasDmg ? "#ffedd5" : hasUpg ? "#fde047" : "#e2e8f0";
    ctx.font = `800 13.5px ${FONT}`;
    ctx.fillText(
      hasDmg ? "🔧 Repair in Drydock" : "🔧 Open Drydock",
      rects.drydock.x + rects.drydock.w * 0.5,
      rects.drydock.y + 29,
    );

    rrect(ctx, rects.primary.x, rects.primary.y, rects.primary.w, rects.primary.h, 14);
    ctx.fillStyle = "#4ade80";
    ctx.fill();
    ctx.fillStyle = "#052e16";
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(
      "⚓ RETURN TO BRIDGE →",
      rects.primary.x + rects.primary.w * 0.5,
      rects.primary.y + 32,
    );
    ctx.textAlign = "left";
  }

  return { renderTitle, renderBridge, renderDrydock, renderAftermath };
}
