/**
 * Perihelion — orbital gravity slingshot roguelike for one thumb.
 *
 * Pull back anywhere to aim with a live RK4 gravity trajectory preview.
 * Hold anywhere mid-flight to grapple into a planet's orbit and build a
 * slingshot overcharge, then release to whip out along the tangent.
 */

import { createLoop, createInput, vibrate } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

import { createRng, dailySeedInfo } from "./core/rng.js";
import { generateSector, updateSectorMotion } from "./core/sectors.js";
import {
  pullToVelocity,
  predictTrajectory,
  createFlight,
  stepFlight,
} from "./core/physics.js";
import {
  createRun,
  launchProbe,
  stepRun,
  recallProbe,
  pickRelic,
  continueEndless,
  serializeRun,
  deserializeRun,
} from "./core/run.js";
import { createAudio } from "./audio.js";
import { createRenderer, computeViewport, uiRects, hitRect } from "./render.js";

// --- Shell, storage, audio & renderer ---------------------------------------

const shell = createShell({ title: "Perihelion", stats: ["Sector", "Score", "Best"] });
const { stage } = shell;
const store = createStore("perihelion");
const audio = createAudio(store.get("muted", false));
const renderer = createRenderer();

let vp = computeViewport(stage.width || 400, stage.height || 720);
stage.onResize((w, h) => {
  vp = computeViewport(w, h);
});

const daily = dailySeedInfo();

function getBest() {
  return store.get("best", 0);
}

function loadSavedRun() {
  return deserializeRun(store.get("run", null));
}

// --- Live State -------------------------------------------------------------

let scene = "title"; // title | play
let run = null;
let savedRun = loadSavedRun();
let isNewBest = false;

// Pointer / aiming / grapple state
let pointerDown = false;
let aimDrag = null; // { startX, startY, curX, curY }
let holdingGrapple = false;
let pointerDownOnUi = false;

// Background live orbital demo behind the Title Screen
let demoSector = generateSector(2, createRng(2026));
let demoFlight = null;
let demoCooldown = 0.2;

function resetDemoFlight() {
  demoSector = generateSector(2, createRng(2026));
  demoFlight = createFlight(demoSector, 155, -425, []);
}
resetDemoFlight();

function syncHud() {
  if (scene === "play" && run) {
    shell.setStat("Sector", run.sectorNum);
    shell.setStat("Score", run.score.toLocaleString());
    shell.setStat("Best", Math.max(getBest(), run.score).toLocaleString());
  } else {
    shell.setStat("Sector", savedRun ? savedRun.sectorNum : 1);
    shell.setStat("Score", savedRun ? savedRun.score.toLocaleString() : "0");
    shell.setStat("Best", getBest().toLocaleString());
  }
}

function persistState() {
  if (!run) return;
  if (run.score > getBest()) {
    store.setBest("best", run.score);
    isNewBest = true;
  }
  const snap = serializeRun(run);
  if (snap) {
    store.set("run", snap);
    savedRun = deserializeRun(snap);
  } else {
    store.clear("run");
    savedRun = null;
  }
  syncHud();
}

function startNewRun(mode = "standard", customSeed = undefined) {
  audio.unlock();
  run = createRun({
    mode,
    seed: customSeed,
    dateLabel: mode === "daily" ? daily.label : null,
  });
  scene = "play";
  isNewBest = false;
  aimDrag = null;
  holdingGrapple = false;
  renderer.clearFx();
  persistState();
}

function resumeSavedRun() {
  audio.unlock();
  const loaded = loadSavedRun();
  if (!loaded) {
    startNewRun("standard");
    return;
  }
  run = loaded;
  scene = "play";
  isNewBest = false;
  aimDrag = null;
  holdingGrapple = false;
  renderer.clearFx();
  syncHud();
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  store.set("muted", audio.muted);
  if (!audio.muted) {
    audio.unlock();
    audio.playDraft();
  }
}

function triggerEventAudioAndHaptics(events) {
  for (const ev of events) {
    if (ev.type === "crystal") {
      audio.playCrystal(ev.chain, false);
      vibrate(8);
    } else if (ev.type === "key") {
      audio.playCrystal(ev.chain, true);
      if (ev.gateJustUnlocked) audio.playGateUnlock();
      vibrate(16);
    } else if (ev.type === "graze") {
      audio.playGraze(ev.isSingularity);
      vibrate(12);
    } else if (ev.type === "bumper") {
      audio.playBumper();
      vibrate(10);
    } else if (ev.type === "wormhole") {
      audio.playWormhole();
      vibrate(10);
    } else if (ev.type === "tether_lock") {
      audio.playTetherLock();
      vibrate(8);
    } else if (ev.type === "tether_release") {
      audio.playTetherRelease(ev.charge);
      vibrate(14);
    } else if (ev.type === "aegis_bounce") {
      audio.playAegis();
      vibrate(16);
    } else if (ev.type === "gate_locked") {
      audio.playLockedBounce();
      vibrate(10);
    } else if (ev.type === "gate_warp") {
      audio.playWarp();
      vibrate(24);
    } else if (ev.type === "planet_crash" || ev.type === "mine_hit") {
      if (!ev.isTwin) {
        audio.playCrash();
        vibrate(28);
      }
    }
  }
}

function computeAimState() {
  if (scene !== "play" || !run || run.phase !== "aim" || !aimDrag) return null;
  const pullDx = aimDrag.startX - aimDrag.curX;
  const pullDy = aimDrag.startY - aimDrag.curY;
  const vel = pullToVelocity(pullDx, pullDy, run.relics);
  if (!vel) return null;
  const pred = predictTrajectory(
    run.sector,
    run.sector.launch.x,
    run.sector.launch.y,
    vel.vx,
    vel.vy,
    run.relics,
  );
  return {
    pullDx,
    pullDy,
    vx: vel.vx,
    vy: vel.vy,
    power: vel.power,
    startX: aimDrag.startX,
    startY: aimDrag.startY,
    curX: aimDrag.curX,
    curY: aimDrag.curY,
    pred,
  };
}

// --- One-Thumb Pointer Input ------------------------------------------------

createInput(stage, {
  onDown(p) {
    audio.unlock();
    pointerDown = true;
    pointerDownOnUi = false;
    const wp = vp.toWorld(p.x, p.y);

    if (scene === "title") {
      pointerDownOnUi = true;
      const rects = uiRects("title", null, Boolean(savedRun));
      if (rects.resume && hitRect(wp, rects.resume)) {
        audio.playDraft();
        resumeSavedRun();
      } else if (rects.start && hitRect(wp, rects.start)) {
        audio.playDraft();
        startNewRun("standard");
      } else if (rects.daily && hitRect(wp, rects.daily)) {
        audio.playDraft();
        startNewRun("daily");
      } else if (rects.mute && hitRect(wp, rects.mute)) {
        toggleMute();
      }
      return;
    }

    if (!run) return;

    if (run.phase === "draft") {
      pointerDownOnUi = true;
      const rects = uiRects("play", run, false);
      for (const card of rects.cards || []) {
        if (hitRect(wp, card)) {
          audio.playDraft();
          vibrate(12);
          pickRelic(run, card.id);
          renderer.clearFx();
          persistState();
          return;
        }
      }
      return;
    }

    if (run.phase === "victory" || run.phase === "over") {
      pointerDownOnUi = true;
      const rects = uiRects("play", run, false);
      if (rects.primary && hitRect(wp, rects.primary)) {
        audio.playDraft();
        if (run.phase === "victory") {
          continueEndless(run);
          persistState();
        } else {
          startNewRun(run.mode);
        }
      } else if (rects.secondary && hitRect(wp, rects.secondary)) {
        audio.playDraft();
        if (run.phase === "victory") {
          startNewRun("standard");
        } else {
          startNewRun(run.mode === "daily" ? "standard" : "daily");
        }
      } else if (rects.home && hitRect(wp, rects.home)) {
        audio.playDraft();
        scene = "title";
        savedRun = loadSavedRun();
        syncHud();
      }
      return;
    }

    if (run.phase === "aim") {
      const rects = uiRects("play", run, false);
      if (rects.mute && hitRect(wp, rects.mute)) {
        pointerDownOnUi = true;
        toggleMute();
        return;
      }
      aimDrag = { startX: wp.x, startY: wp.y, curX: wp.x, curY: wp.y };
      return;
    }

    if (run.phase === "flight") {
      const rects = uiRects("play", run, false);
      if (rects.recall && hitRect(wp, rects.recall)) {
        pointerDownOnUi = true;
        const evs = recallProbe(run);
        audio.playCrash();
        vibrate(18);
        renderer.pushEventFx(evs);
        persistState();
        return;
      }
      holdingGrapple = true;
    }
  },

  onMove(p) {
    if (!pointerDown || pointerDownOnUi) return;
    const wp = vp.toWorld(p.x, p.y);
    if (scene === "play" && run && run.phase === "aim" && aimDrag) {
      aimDrag.curX = wp.x;
      aimDrag.curY = wp.y;
    }
  },

  onUp() {
    if (!pointerDown) return;
    pointerDown = false;
    holdingGrapple = false;
    if (pointerDownOnUi) {
      pointerDownOnUi = false;
      return;
    }

    if (scene === "play" && run && run.phase === "aim" && aimDrag) {
      const aim = computeAimState();
      aimDrag = null;
      if (aim) {
        launchProbe(run, aim.vx, aim.vy);
        audio.playLaunch(aim.power);
        vibrate(14);
        syncHud();
      }
    }
  },
});

// --- Main Loop --------------------------------------------------------------

syncHud();

createLoop((dt, elapsed) => {
  renderer.updateFx(dt);

  if (scene === "title") {
    updateSectorMotion(demoSector, dt, 1);
    if (demoFlight && !demoFlight.settled) {
      const evs = stepFlight(demoSector, demoFlight, dt, false, []);
      renderer.pushEventFx(evs, { showPopups: false });
    } else {
      demoCooldown -= dt;
      if (demoCooldown <= 0) {
        resetDemoFlight();
        demoCooldown = 0.8;
      }
    }
  } else if (run) {
    const prevPhase = run.phase;
    const prevScore = run.score;
    const events = stepRun(run, dt, holdingGrapple);
    if (events.length > 0) {
      renderer.pushEventFx(events);
      triggerEventAudioAndHaptics(events);
    }
    if (run.score !== prevScore) {
      if (run.score > getBest()) {
        store.setBest("best", run.score);
        isNewBest = true;
      }
      syncHud();
    }
    if (run.phase !== prevPhase) {
      holdingGrapple = false;
      aimDrag = null;
      persistState();
    }
  }

  renderer.render(
    stage.ctx,
    vp,
    {
      scene,
      run,
      aim: computeAimState(),
      demoSector,
      demoFlight,
      bestScore: Math.max(getBest(), run ? run.score : 0),
      isNewBest,
      dailyLabel: daily.label,
      savedRun,
      muted: audio.muted,
    },
    elapsed,
  );
});

// --- Verification hook (used by tests/perihelion/browser.test.mjs) ----------

window.__perihelion = {
  getState: () => ({ scene, run, best: getBest(), vp }),
  uiRects: () => uiRects(scene, run, Boolean(savedRun)),
  worldToScreen: (wx, wy) => ({
    x: vp.ox + wx * vp.scale,
    y: vp.oy + wy * vp.scale,
  }),
  startSeed: (seed) => startNewRun("standard", seed),
  launchDirect: (vx, vy) => {
    if (scene === "play" && run && run.phase === "aim") {
      launchProbe(run, vx, vy);
    }
  },
};
