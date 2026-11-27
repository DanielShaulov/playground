/**
 * Broadside! — Pocket World of Warships (The Bridge & One Persistent Warship).
 *
 * - Build ONE persistent warship from a Coastal Gunboat into a Dreadnought across
 *   4 Hardpoint Bays with real branching trade-offs (Turrets vs Torps, Armor vs Speed).
 * - Choose terrain-previewed Admiralty Dispatches from The Bridge across 3 Theaters.
 * - No global lives or run wipes: defeat means "Escaped With Injuries" (1–2 equipped
 *   parts get knocked offline until repaired in Drydock at ~45% cost).
 * - One-Thumb Battle Controls:
 *   TAP Water = Course Waypoint · TAP Enemy = Lock Target · HOLD & DRAG = Trackpad Aim + Fire
 *   Bottom 3 Pills: [ ⚫ AP / 🔥 HE ] · [ ⏹ STOP / ▲ FULL ] · [ 🚀 TORP / 💨 SMOKE / 🛠️ REPAIR ]
 */

import { createLoop, createInput, vibrate } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

import { PART_BY_ID } from "./core/content.js";
import {
  createCampaign,
  sanitizeCampaign,
  computeShipStats,
  buyPart,
  equipPart,
  repairPart,
  getDamagedEquippedIds,
  applyRetreatDamage,
  recordBattleWin,
  generateDispatches,
} from "./core/campaign.js";
import {
  ARENA_W,
  ARENA_H,
  SHELL_SPEED,
  AIM_BLOOM_START,
  clamp,
  createBattle,
  stepBattle,
  setPlayerWaypoint,
  cyclePlayerThrottle,
  togglePlayerAmmo,
  lockTargetEnemy,
  isAimOnLockedEnemy,
  stepAimBloom,
  triggerInstantSpecial,
  firePlayerSalvo,
  launchPlayerTorpedoes,
} from "./core/sim.js";
import { createAudio } from "./audio.js";
import {
  AIM_LIFT_PX,
  createRenderer,
  getUiRects,
  getSeaViewport,
  computeAimSeaLift,
  arenaToScreen,
  screenToArena,
  hitRect,
} from "./render.js";

const shell = createShell({
  title: "Broadside!",
  stats: ["Theater", "Hull", "Gold"],
});
const { stage } = shell;
const store = createStore("broadside");
const audio = createAudio(store.get("muted", false));
const renderer = createRenderer();

let campaign = sanitizeCampaign(store.get("campaign", null));
let dispatches = generateDispatches(campaign);

let scene = "title"; // title | bridge | drydock | battle | aftermath
let selectedDispatchIdx = 0;
let selectedBay = "hull";
let battle = null;
let aftermath = null;
let confirmReset = false;
let armedTorp = false;
let coachCue = null; // null | "he" | "torp"
let coachBanner = null; // { text, color, timer } | null
let seaLiftY = 0;

// One-Thumb Tap-to-Steer / Rangefinder Stylus Drag-to-Aim State (fixed 74px upward offset)
const aimDrag = {
  down: false,
  active: false,
  cancel: false,
  startScreenX: 0,
  startScreenY: 0,
  screenX: 0,
  screenY: 0,
  tx: ARENA_W * 0.5,
  ty: ARENA_H * 0.3,
  prevTx: ARENA_W * 0.5,
  prevTy: ARENA_H * 0.3,
  spreadMult: AIM_BLOOM_START,
  onLocked: false,
};

function updateStylusAim(sx, sy) {
  aimDrag.screenX = sx;
  aimDrag.screenY = sy;
  const vp = getSeaViewport(stage.width, stage.height, seaLiftY);
  const ap = screenToArena(sx, sy - AIM_LIFT_PX, vp);
  aimDrag.tx = clamp(ap.x, 10, ARENA_W - 10);
  aimDrag.ty = clamp(ap.y, 10, ARENA_H - 10);
}

// Autonomous Title Background Warship Duel
let demoBattle = null;
function resetDemoBattle() {
  const demoCamp = createCampaign(909);
  demoCamp.ownedParts.hull_cruiser = true;
  demoCamp.ownedParts.guns_broadside = true;
  demoCamp.equipped.hull = "hull_cruiser";
  demoCamp.equipped.guns = "guns_broadside";
  const demoDispatches = generateDispatches(demoCamp);
  demoBattle = createBattle(demoCamp, demoDispatches[1] || demoDispatches[0]);
}
resetDemoBattle();

function formatPlanks(hp, maxHp) {
  const cur = Math.max(0, Math.min(maxHp, Math.round(hp)));
  return `♥ ${cur}/${maxHp}`;
}

function saveAll() {
  store.set("campaign", campaign);
  store.set("muted", audio.muted);
  syncHud();
}

function syncHud() {
  if (scene === "battle" && battle) {
    shell.setStat("Theater", `${battle.act}/3`);
    shell.setStat("Hull", formatPlanks(battle.player.hp, battle.player.maxHp));
    shell.setStat("Gold", `${campaign.gold + battle.goldCollected}💰`);
  } else {
    const stats = computeShipStats(campaign);
    shell.setStat("Theater", `${campaign.theater}/3`);
    shell.setStat("Hull", formatPlanks(stats.maxHp, stats.maxHp));
    shell.setStat("Gold", `${campaign.gold}💰`);
  }
}
syncHud();

function openDrydock(preferredBay = null) {
  if (preferredBay) {
    selectedBay = preferredBay;
  } else {
    const dmg = getDamagedEquippedIds(campaign);
    if (dmg.length > 0 && PART_BY_ID[dmg[0]]) {
      selectedBay = PART_BY_ID[dmg[0]].bay;
    }
  }
  scene = "drydock";
  syncHud();
}

function openBridge() {
  dispatches = generateDispatches(campaign);
  selectedDispatchIdx = clamp(selectedDispatchIdx, 0, Math.max(0, dispatches.length - 1));
  scene = "bridge";
  syncHud();
}

function startBattle(dispatch) {
  if (!dispatch) return;
  battle = createBattle(campaign, dispatch);
  renderer.clearFx();
  armedTorp = false;
  coachCue = null;
  coachBanner = null;
  aimDrag.down = false;
  aimDrag.active = false;
  aimDrag.cancel = false;
  seaLiftY = 0;
  scene = "battle";
  syncHud();
}

function pickRetreatTip(b) {
  const alive = b.enemies.filter((e) => e.hp > 0);
  if (alive.some((e) => e.heavyArmor)) {
    return "🔥 Tip: Use 🔥 HE & 🚀 Torps on heavy armor, or flank!";
  }
  if (alive.some((e) => e.torpCount > 0)) {
    return "🚀 Tip: Turn bow-in & tap ⏹ STOP to dodge torpedoes!";
  }
  return "🛡️ Tip: Point your bow at red shells to bounce AP!";
}

function concludeBattle() {
  if (!battle) return;
  const dispatch = battle.dispatch;

  if (battle.outcome === "won") {
    const winRes = recordBattleWin(campaign, dispatch, {
      goldCollected: battle.goldCollected,
      shipsSunk: battle.shipsSunk,
      citadels: battle.citadels,
      bounces: battle.bounces,
    });
    audio.victoryFanfare();
    vibrate(20);

    aftermath = {
      won: true,
      dispatchName: dispatch.name,
      totalGold: winRes.totalGold,
      shipsSunk: battle.shipsSunk,
      citadels: battle.citadels,
      bounces: battle.bounces,
      unlockedTheater: winRes.unlockedTheater,
    };
  } else {
    const ret = applyRetreatDamage(campaign, battle.seed);
    audio.playerHit();
    vibrate(22);

    aftermath = {
      won: false,
      dispatchName: dispatch.name,
      damagedIds: ret.damagedIds,
      protectedByBulkhead: ret.protectedByBulkhead,
      tip: pickRetreatTip(battle),
    };
  }

  battle = null;
  armedTorp = false;
  coachCue = null;
  coachBanner = null;
  dispatches = generateDispatches(campaign);
  scene = "aftermath";
  saveAll();
}

function updateBattleCoach(b, dt) {
  if (coachBanner) {
    coachBanner.timer -= dt;
    if (coachBanner.timer <= 0) coachBanner = null;
  }
  for (const ev of b.events) {
    if (ev.type === "ricochet" && !ev.playerBounce && !campaign.tutorialSeen.heTip) {
      coachCue = "he";
      coachBanner = {
        text: "🛡️ AP bounced! Tap 🔥 HE or flank side!",
        color: "#fb923c",
        timer: 5.5,
      };
    }
  }
  if (
    b.shotsFired >= 2 &&
    b.stats.torpCount > 0 &&
    (b.player.torpCd || 0) <= 0.02 &&
    !campaign.tutorialSeen.torpTip &&
    !coachCue &&
    !coachBanner
  ) {
    coachCue = "torp";
    coachBanner = {
      text: "🚀 Torps ready! Tap 🚀 TORP then drag!",
      color: "#38bdf8",
      timer: 5.0,
    };
  }
}

function playBattleAudioEvents(b) {
  for (const ev of b.events) {
    if (ev.type === "broadside") {
      audio.broadside(ev.ammo === "he" ? "fire" : "round");
      vibrate(10);
    } else if (ev.type === "enemy_volley") {
      audio.enemyVolley();
    } else if (ev.type === "ricochet") {
      audio.clang();
      vibrate(ev.playerBounce ? 12 : 6);
    } else if (ev.type === "citadel") {
      audio.rakeCrit();
      vibrate(20);
    } else if (ev.type === "hit") {
      audio.hit(false);
    } else if (ev.type === "keg_boom") {
      audio.kegBoom();
      vibrate(22);
    } else if (ev.type === "torp_launch" || ev.type === "surge") {
      audio.surge();
    } else if (ev.type === "torp_warn") {
      audio.ammoSwitch("chain");
    } else if (ev.type === "board") {
      audio.board();
    } else if (ev.type === "player_hit") {
      audio.playerHit();
      vibrate(18);
    } else if (ev.type === "ram") {
      audio.clang();
      vibrate(20);
    } else if (ev.type === "island_hit" && ev.torp) {
      audio.hit(false);
    } else if (ev.type === "sink") {
      audio.sink(ev.boss);
    }
  }
}

function toggleMute() {
  audio.toggleMute();
  store.set("muted", audio.muted);
}

// --- Unified One-Thumb Input ------------------------------------------------

createInput(stage, {
  onDown(p) {
    audio.unlock();
    const w = stage.width;
    const h = stage.height;

    if (scene === "title") {
      const r = getUiRects(w, h, { scene: "title" });
      if (hitRect(p, r.mute)) {
        toggleMute();
        return;
      }
      if (hitRect(p, r.reset)) {
        if (!confirmReset) {
          confirmReset = true;
          audio.click();
        } else {
          campaign = createCampaign();
          dispatches = generateDispatches(campaign);
          selectedDispatchIdx = 0;
          confirmReset = false;
          audio.kegBoom();
          saveAll();
        }
        return;
      }
      confirmReset = false;
      if (hitRect(p, r.drydock)) {
        audio.click();
        openDrydock();
        return;
      }
      if (hitRect(p, r.primary)) {
        audio.click();
        if (campaign.totalWins === 0 && campaign.totalRetreats === 0) {
          // Drop brand-new captains straight into Battle 1 tutorial!
          dispatches = generateDispatches(campaign);
          startBattle(dispatches[0]);
        } else {
          openBridge();
        }
        return;
      }
      return;
    }

    if (scene === "bridge") {
      const r = getUiRects(w, h, { scene: "bridge" });
      if (hitRect(p, r.theaterPrev) && campaign.theater > 1) {
        campaign.theater -= 1;
        selectedDispatchIdx = 0;
        dispatches = generateDispatches(campaign);
        audio.click();
        saveAll();
        return;
      }
      if (hitRect(p, r.theaterNext) && campaign.theater < campaign.maxUnlockedTheater) {
        campaign.theater += 1;
        selectedDispatchIdx = 0;
        dispatches = generateDispatches(campaign);
        audio.click();
        saveAll();
        return;
      }
      if (hitRect(p, r.drydockBtn)) {
        audio.click();
        openDrydock();
        return;
      }
      for (const slot of r.dispatches) {
        if (hitRect(p, slot) && dispatches[slot.index]) {
          audio.click();
          if (selectedDispatchIdx === slot.index) {
            startBattle(dispatches[slot.index]);
          } else {
            selectedDispatchIdx = slot.index;
          }
          return;
        }
      }
      if (hitRect(p, r.primary) && dispatches[selectedDispatchIdx]) {
        audio.click();
        startBattle(dispatches[selectedDispatchIdx]);
        return;
      }
      return;
    }

    if (scene === "drydock") {
      const r = getUiRects(w, h, { scene: "drydock", selectedBay });
      for (const tab of r.bayTabs) {
        if (hitRect(p, tab)) {
          selectedBay = tab.bayId;
          audio.click();
          return;
        }
      }
      for (const cell of r.partCards) {
        if (hitRect(p, cell)) {
          const pid = cell.partId;
          if (campaign.damagedParts[pid]) {
            const res = repairPart(campaign, pid);
            if (res.ok) {
              equipPart(campaign, pid);
              audio.board();
              saveAll();
            } else {
              audio.clang();
            }
          } else if (campaign.ownedParts[pid]) {
            equipPart(campaign, pid);
            audio.click();
            saveAll();
          } else {
            const res = buyPart(campaign, pid);
            if (res.ok) {
              audio.victoryFanfare();
              saveAll();
            } else {
              audio.clang();
            }
          }
          return;
        }
      }
      if (hitRect(p, r.primary)) {
        audio.click();
        openBridge();
        return;
      }
      return;
    }

    if (scene === "aftermath") {
      const r = getUiRects(w, h, { scene: "aftermath" });
      if (hitRect(p, r.drydock)) {
        audio.click();
        const firstDmg = aftermath?.damagedIds?.[0];
        openDrydock(firstDmg ? PART_BY_ID[firstDmg]?.bay : null);
        return;
      }
      if (hitRect(p, r.primary)) {
        audio.click();
        if (aftermath?.unlockedTheater) {
          campaign.theater = aftermath.unlockedTheater;
          selectedDispatchIdx = 0;
          saveAll();
        }
        openBridge();
        return;
      }
      return;
    }

    if (scene === "battle" && battle) {
      const r = getUiRects(w, h, { scene: "battle", battle });
      if (hitRect(p, r.muteBtn)) {
        toggleMute();
        return;
      }
      if (hitRect(p, r.ammoBtn)) {
        const nextAmmo = togglePlayerAmmo(battle);
        armedTorp = false;
        if (nextAmmo === "he") {
          if (coachCue === "he") coachCue = null;
          if (coachBanner?.color === "#fb923c") coachBanner = null;
          if (!campaign.tutorialSeen.heTip) {
            campaign.tutorialSeen.heTip = true;
            saveAll();
          }
        }
        audio.ammoSwitch(nextAmmo === "he" ? "fire" : "round");
        vibrate(8);
        return;
      }
      if (hitRect(p, r.throttleBtn)) {
        cyclePlayerThrottle(battle);
        audio.click();
        vibrate(8);
        return;
      }
      if (r.torpBtn && hitRect(p, r.torpBtn)) {
        if ((battle.player.torpCd || 0) <= 0.02) {
          armedTorp = !armedTorp;
          audio.surge();
          vibrate(8);
        } else {
          audio.click();
        }
        return;
      }
      if (hitRect(p, r.specialBtn)) {
        if (battle.stats.special.id === "none") {
          audio.clang();
        } else if (battle.stats.special.id === "torp") {
          if ((battle.player.torpCd || 0) <= 0.02) {
            armedTorp = !armedTorp;
            audio.surge();
            vibrate(8);
          } else {
            audio.click();
          }
        } else {
          const res = triggerInstantSpecial(battle);
          if (!res.ok) audio.click();
          else vibrate(10);
        }
        return;
      }

      if (p.y >= r.dockBand.y) return;

      // Touch anywhere above bottom dock: quick tap inside sea = Steer/Lock, drag >= 10px = Rangefinder Stylus Aim!
      aimDrag.down = true;
      aimDrag.active = false;
      aimDrag.cancel = false;
      aimDrag.startScreenX = p.x;
      aimDrag.startScreenY = p.y;
      aimDrag.spreadMult = AIM_BLOOM_START;
      aimDrag.onLocked = false;
      updateStylusAim(p.x, p.y);
      aimDrag.prevTx = aimDrag.tx;
      aimDrag.prevTy = aimDrag.ty;
    }
  },

  onMove(p) {
    if (scene !== "battle" || !battle || !aimDrag.down) return;
    const dx = p.x - aimDrag.startScreenX;
    const dy = p.y - aimDrag.startScreenY;
    if (!aimDrag.active && Math.hypot(dx, dy) >= 10) {
      aimDrag.active = true;
      aimDrag.spreadMult = AIM_BLOOM_START;
      updateStylusAim(p.x, p.y);
      aimDrag.prevTx = aimDrag.tx;
      aimDrag.prevTy = aimDrag.ty;
    }
    if (!aimDrag.active) return;

    const r = getUiRects(stage.width, stage.height, { scene: "battle", battle });
    aimDrag.cancel = p.y >= r.dockBand.y;
    updateStylusAim(p.x, p.y);
  },

  onUp(p) {
    if (scene === "battle" && battle && aimDrag.down) {
      if (aimDrag.active) {
        if (!aimDrag.cancel) {
          if (armedTorp && battle.stats.torpCount > 0) {
            const res = launchPlayerTorpedoes(battle, aimDrag.tx, aimDrag.ty);
            if (res.ok) {
              armedTorp = false;
              if (coachCue === "torp") coachCue = null;
              if (coachBanner?.color === "#38bdf8" || coachBanner?.color === "#f87171") {
                coachBanner = null;
              }
              if (!campaign.tutorialSeen.torpTip || !campaign.tutorialSeen.fired) {
                campaign.tutorialSeen.torpTip = true;
                campaign.tutorialSeen.fired = true;
                saveAll();
              }
            } else if (res.reason === "no_arc") {
              audio.click();
              coachBanner = {
                text: "🚀 Swing broadside to fire side torpedo tubes!",
                color: "#f87171",
                timer: 2.6,
              };
            }
          } else {
            const res = firePlayerSalvo(battle, aimDrag.tx, aimDrag.ty, aimDrag.spreadMult);
            if (res.ok && !campaign.tutorialSeen.fired) {
              campaign.tutorialSeen.fired = true;
              saveAll();
            }
          }
        }
      } else {
        const vp = getSeaViewport(stage.width, stage.height, seaLiftY);
        const ap = screenToArena(p.x, p.y, vp);
        // Ignore quick taps in the dark margin below the sea (reserved for bottom-edge stylus drags!)
        if (ap.y <= ARENA_H + 10) {
          const tappedEnemy = battle.enemies.find(
            (e) => e.hp > 0 && !e.hidden && Math.hypot(e.x - ap.x, e.y - ap.y) <= e.radius + 12,
          );
          if (tappedEnemy) {
            lockTargetEnemy(battle, tappedEnemy.uid);
            audio.click();
          } else {
            setPlayerWaypoint(battle, ap.x, ap.y);
            if (!campaign.tutorialSeen.steered) {
              campaign.tutorialSeen.steered = true;
              saveAll();
            }
            audio.click();
          }
        }
      }
    }
    aimDrag.down = false;
    aimDrag.active = false;
    aimDrag.cancel = false;
    aimDrag.onLocked = false;
  },
});

// Expose read-only inspection bridge for automated portrait-phone tests
window.__broadside = {
  get scene() {
    return scene;
  },
  get campaign() {
    return campaign;
  },
  get dispatches() {
    return dispatches;
  },
  get selectedDispatchIdx() {
    return selectedDispatchIdx;
  },
  get selectedBay() {
    return selectedBay;
  },
  get aftermath() {
    return aftermath;
  },
  get armedTorp() {
    return armedTorp;
  },
  get coachCue() {
    return coachCue;
  },
  get coachBanner() {
    return coachBanner;
  },
  get aimDrag() {
    return aimDrag;
  },
  get battle() {
    return battle;
  },
  getUiRects: (s = scene) =>
    getUiRects(stage.width, stage.height, {
      scene: s,
      selectedBay,
      battle,
    }),
  arenaToScreen: (ax, ay) => arenaToScreen(ax, ay, getSeaViewport(stage.width, stage.height)),
};

// --- Main 60fps Loop --------------------------------------------------------

createLoop((dt, elapsed) => {
  const { ctx, width, height } = stage;
  if (width <= 0 || height <= 0) return;

  if (scene === "title" && demoBattle) {
    const foe = demoBattle.enemies.find((e) => e.hp > 0);
    if (foe) {
      if (!demoBattle.player.waypoint) {
        setPlayerWaypoint(demoBattle, demoBattle.player.x > 180 ? 85 : 275, 360);
      }
      if (demoBattle.player.reloadTimer <= 0) {
        const d = Math.hypot(foe.x - demoBattle.player.x, foe.y - demoBattle.player.y);
        const ft = d / SHELL_SPEED;
        firePlayerSalvo(
          demoBattle,
          foe.x + Math.cos(foe.ang) * foe.spd * ft,
          foe.y + Math.sin(foe.ang) * foe.spd * ft,
        );
      }
    }
    stepBattle(demoBattle, dt);
    renderer.ingestBattleEvents(demoBattle);
    renderer.stepFx(demoBattle, dt);
    if (demoBattle.outcome !== "ongoing" || demoBattle.elapsed > 32) {
      resetDemoBattle();
    }
  } else if (scene === "battle" && battle) {
    const targetLift =
      aimDrag.active && !aimDrag.cancel ? computeAimSeaLift(aimDrag.screenY, width, height) : 0;
    seaLiftY += (targetLift - seaLiftY) * (1 - Math.exp(-18 * dt));
    if (seaLiftY < 0.25 && targetLift === 0) seaLiftY = 0;
    if (aimDrag.active && !aimDrag.cancel) {
      updateStylusAim(aimDrag.screenX, aimDrag.screenY);
      const moveDist = Math.hypot(aimDrag.tx - aimDrag.prevTx, aimDrag.ty - aimDrag.prevTy);
      const moveSpeed = dt > 0.0001 ? moveDist / dt : 0;
      aimDrag.prevTx = aimDrag.tx;
      aimDrag.prevTy = aimDrag.ty;
      aimDrag.onLocked = isAimOnLockedEnemy(battle, aimDrag.tx, aimDrag.ty);
      aimDrag.spreadMult = stepAimBloom(aimDrag.spreadMult, moveSpeed, aimDrag.onLocked, dt);
    }

    stepBattle(battle, dt);
    updateBattleCoach(battle, dt);
    playBattleAudioEvents(battle);
    renderer.ingestBattleEvents(battle);
    renderer.stepFx(battle, dt);
    syncHud();

    if (battle.outcome !== "ongoing") {
      seaLiftY = 0;
      concludeBattle();
    }
  } else {
    seaLiftY = 0;
  }

  renderer.render(
    ctx,
    {
      scene,
      campaign,
      dispatches,
      selectedDispatchIdx,
      selectedBay,
      aftermath,
      battle,
      demoBattle,
      aimDrag,
      armedTorp,
      seaLiftY,
      coachCue,
      coachBanner,
      confirmReset,
      muted: audio.muted,
    },
    width,
    height,
    elapsed,
  );
});
