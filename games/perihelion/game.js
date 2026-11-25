/**
 * Perihelion — orbital gravity slingshot across 24 handcrafted orbits.
 *
 * Pull back anywhere to bend a live RK4 gravity arc around planets, repulsors,
 * binaries, wormholes, and singularities. Hold anywhere mid-flight to grapple
 * into a planet's orbit with a live curved exit trajectory, then release to whip
 * straight into the Warp Gate.
 */

import { createLoop, createInput, vibrate } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

import { dailySeedInfo } from "./core/rng.js";
import { ORBIT_BY_ID, buildOrbit, updateOrbitMotion } from "./core/campaign.js";
import {
  pullToVelocity,
  predictTrajectory,
  createFlight,
  stepFlight,
} from "./core/physics.js";
import {
  createProfile,
  sanitizeProfile,
  totalStars,
  isOrbitUnlocked,
  nextPlayableOrbitId,
  selectShip,
  createSession,
  retryOrbit,
  launchSessionProbe,
  recallSessionProbe,
  stepSession,
} from "./core/progress.js";
import { createAudio } from "./audio.js";
import { createRenderer, computeViewport, uiRects, hitRect } from "./render.js";

// --- Shell, storage, audio & renderer ---------------------------------------

const shell = createShell({ title: "Perihelion", stats: ["Stars", "Orbit", "Score"] });
const { stage } = shell;
const store = createStore("perihelion");
const audio = createAudio(store.get("muted", false));
const renderer = createRenderer();

let vp = computeViewport(stage.width || 400, stage.height || 720);
stage.onResize((w, h) => {
  vp = computeViewport(w, h);
});

const daily = dailySeedInfo();
let profile = sanitizeProfile(store.get("profile", null));

// --- Live State -------------------------------------------------------------

let scene = "title"; // title | chart | play
let chartChapter = ORBIT_BY_ID[nextPlayableOrbitId(profile)].chapter;
let session = null;
let confirmReset = false;

// Pointer / aiming / grapple state
let pointerDown = false;
let aimDrag = null;
let holdingGrapple = false;
let pointerDownOnUi = false;

// Animated background orbital demo behind Title Screen
let demoOrbit = buildOrbit("h4");
let demoFlight = null;
let demoCooldown = 0.2;

function resetDemoFlight() {
  demoOrbit = buildOrbit("h4");
  demoFlight = createFlight(demoOrbit, 155, -420, "solaris");
}
resetDemoFlight();

function saveProfile() {
  store.set("profile", profile);
  syncHud();
}

function syncHud() {
  shell.setStat("Stars", `${totalStars(profile)}★`);
  if (scene === "play" && session) {
    shell.setStat(
      "Orbit",
      session.mode === "daily" ? `D${session.dailyStage}` : `${session.orbit.globalNum}/24`,
    );
    shell.setStat("Score", session.score.toLocaleString());
  } else {
    shell.setStat("Orbit", `${Object.values(profile.orbits).filter((r) => r.clear).length}/24`);
    shell.setStat("Score", profile.bestDailyScore.toLocaleString());
  }
}

function openOrbit(orbitId) {
  audio.unlock();
  session = createSession({
    mode: "campaign",
    orbitId,
    shipId: profile.selectedShip,
  });
  chartChapter = session.orbit.chapter;
  scene = "play";
  aimDrag = null;
  holdingGrapple = false;
  renderer.clearFx();
  syncHud();
}

function openDaily(customSeed = undefined) {
  audio.unlock();
  session = createSession({
    mode: "daily",
    shipId: profile.selectedShip,
    seed: customSeed,
    dateLabel: daily.label,
  });
  scene = "play";
  aimDrag = null;
  holdingGrapple = false;
  renderer.clearFx();
  syncHud();
}

function openChart(chapterIdx = null) {
  audio.unlock();
  if (chapterIdx !== null) chartChapter = chapterIdx;
  else if (session && session.mode === "campaign") chartChapter = session.orbit.chapter;
  else chartChapter = ORBIT_BY_ID[nextPlayableOrbitId(profile)].chapter;
  confirmReset = false;
  scene = "chart";
  aimDrag = null;
  holdingGrapple = false;
  syncHud();
}

function resetAllProgress() {
  profile = createProfile();
  store.clear("profile");
  saveProfile();
  session = null;
  chartChapter = 0;
  confirmReset = false;
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
    } else if (ev.type === "tether_gate_lock") {
      audio.playGateNotch();
      vibrate(6);
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
        vibrate(26);
      }
    }
  }
}

function computeAimState() {
  if (scene !== "play" || !session || session.phase !== "aim" || !aimDrag) return null;
  const pullDx = aimDrag.startX - aimDrag.curX;
  const pullDy = aimDrag.startY - aimDrag.curY;
  const vel = pullToVelocity(pullDx, pullDy, session.shipId);
  if (!vel) return null;
  const pred = predictTrajectory(
    session.orbit,
    session.orbit.launch.x,
    session.orbit.launch.y,
    vel.vx,
    vel.vy,
    session.shipId,
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
      const rects = uiRects("title", null, profile);
      if (rects.primary && hitRect(wp, rects.primary)) {
        audio.playDraft();
        openOrbit(nextPlayableOrbitId(profile));
      } else if (rects.chart && hitRect(wp, rects.chart)) {
        audio.playDraft();
        openChart();
      } else if (rects.daily && hitRect(wp, rects.daily)) {
        audio.playDraft();
        openDaily();
      } else if (rects.mute && hitRect(wp, rects.mute)) {
        toggleMute();
      }
      return;
    }

    if (scene === "chart") {
      pointerDownOnUi = true;
      const rects = uiRects("chart", null, profile, chartChapter, confirmReset);
      if (confirmReset) {
        if (rects.confirmResetYes && hitRect(wp, rects.confirmResetYes)) {
          audio.playCrash();
          vibrate(20);
          resetAllProgress();
        } else if (rects.confirmResetCancel && hitRect(wp, rects.confirmResetCancel)) {
          audio.playDraft();
          confirmReset = false;
        }
        return;
      }
      for (const tab of rects.tabs) {
        if (hitRect(wp, tab)) {
          audio.playDraft();
          chartChapter = tab.chapter;
          return;
        }
      }
      for (const node of rects.nodes) {
        if (hitRect(wp, node)) {
          if (isOrbitUnlocked(profile, node.id)) {
            audio.playDraft();
            openOrbit(node.id);
          } else {
            audio.playLockedBounce();
          }
          return;
        }
      }
      for (const sRect of rects.ships) {
        if (hitRect(wp, sRect)) {
          if (selectShip(profile, sRect.id)) {
            audio.playDraft();
            vibrate(10);
            saveProfile();
          } else {
            audio.playLockedBounce();
          }
          return;
        }
      }
      if (rects.resetChart && hitRect(wp, rects.resetChart)) {
        audio.playDraft();
        confirmReset = true;
      } else if (rects.launchNext && hitRect(wp, rects.launchNext)) {
        audio.playDraft();
        openOrbit(nextPlayableOrbitId(profile));
      } else if (rects.daily && hitRect(wp, rects.daily)) {
        audio.playDraft();
        openDaily();
      } else if (rects.mute && hitRect(wp, rects.mute)) {
        toggleMute();
      }
      return;
    }

    if (!session) return;

    if (session.phase === "clear") {
      pointerDownOnUi = true;
      const rects = uiRects("play", session, profile);
      if (rects.next && hitRect(wp, rects.next) && session.clearResult?.nextOrbitId) {
        audio.playDraft();
        openOrbit(session.clearResult.nextOrbitId);
      } else if (rects.replay && hitRect(wp, rects.replay)) {
        audio.playDraft();
        retryOrbit(session);
        session.lastTrail = null;
        renderer.clearFx();
        syncHud();
      } else if (rects.chart && hitRect(wp, rects.chart)) {
        audio.playDraft();
        openChart();
      }
      return;
    }

    if (session.phase === "daily_over" || session.phase === "daily_won") {
      pointerDownOnUi = true;
      const rects = uiRects("play", session, profile);
      if (rects.retryDaily && hitRect(wp, rects.retryDaily)) {
        audio.playDraft();
        openDaily();
      } else if (rects.chart && hitRect(wp, rects.chart)) {
        audio.playDraft();
        openChart();
      }
      return;
    }

    if (session.phase === "aim") {
      const rects = uiRects("play", session, profile);
      if (rects.chartBtn && hitRect(wp, rects.chartBtn)) {
        pointerDownOnUi = true;
        audio.playDraft();
        openChart();
        return;
      }
      if (rects.restartBtn && hitRect(wp, rects.restartBtn)) {
        pointerDownOnUi = true;
        audio.playDraft();
        retryOrbit(session);
        session.lastTrail = null;
        renderer.clearFx();
        syncHud();
        return;
      }
      if (rects.mute && hitRect(wp, rects.mute)) {
        pointerDownOnUi = true;
        toggleMute();
        return;
      }
      aimDrag = { startX: wp.x, startY: wp.y, curX: wp.x, curY: wp.y };
      return;
    }

    if (session.phase === "flight") {
      const rects = uiRects("play", session, profile);
      if (rects.recall && hitRect(wp, rects.recall)) {
        pointerDownOnUi = true;
        const evs = recallSessionProbe(session, profile);
        audio.playCrash();
        vibrate(16);
        renderer.pushEventFx(evs);
        saveProfile();
        return;
      }
      holdingGrapple = true;
    }
  },

  onMove(p) {
    if (!pointerDown || pointerDownOnUi) return;
    const wp = vp.toWorld(p.x, p.y);
    if (scene === "play" && session && session.phase === "aim" && aimDrag) {
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

    if (scene === "play" && session && session.phase === "aim" && aimDrag) {
      const aim = computeAimState();
      aimDrag = null;
      if (aim) {
        launchSessionProbe(session, profile, aim.vx, aim.vy);
        audio.playLaunch(aim.power);
        vibrate(14);
        saveProfile();
      }
    }
  },
});

// --- Main Loop --------------------------------------------------------------

syncHud();

createLoop((dt, elapsed) => {
  renderer.updateFx(dt);

  if (scene === "title") {
    updateOrbitMotion(demoOrbit, dt, 1);
    if (demoFlight && !demoFlight.settled) {
      const evs = stepFlight(demoOrbit, demoFlight, dt, false, "solaris");
      renderer.pushEventFx(evs, { showPopups: false });
    } else {
      demoCooldown -= dt;
      if (demoCooldown <= 0) {
        resetDemoFlight();
        demoCooldown = 0.8;
      }
    }
  } else if (scene === "play" && session) {
    const prevPhase = session.phase;
    const prevScore = session.score;
    const events = stepSession(session, profile, dt, holdingGrapple);
    if (events.length > 0) {
      renderer.pushEventFx(events);
      triggerEventAudioAndHaptics(events);
    }
    if (session.score !== prevScore) {
      syncHud();
    }
    if (session.phase !== prevPhase) {
      holdingGrapple = false;
      aimDrag = null;
      if (session.phase === "clear" && session.clearResult) {
        audio.playStars(session.clearResult.starsThisAttempt);
      }
      saveProfile();
    }
  }

  renderer.render(
    stage.ctx,
    vp,
    {
      scene,
      profile,
      chartChapter,
      confirmReset,
      session,
      aim: computeAimState(),
      demoOrbit,
      demoFlight,
      dailyLabel: daily.label,
      muted: audio.muted,
    },
    elapsed,
  );
});

// --- Verification hook ------------------------------------------------------

window.__perihelion = {
  getState: () => ({ scene, profile, session, chartChapter, confirmReset, vp }),
  uiRects: () => uiRects(scene, session, profile, chartChapter, confirmReset),
  worldToScreen: (wx, wy) => ({
    x: vp.ox + wx * vp.scale,
    y: vp.oy + wy * vp.scale,
  }),
  openOrbit,
  openChart,
  openDaily,
  launchDirect: (vx, vy) => {
    if (scene === "play" && session && session.phase === "aim") {
      launchSessionProbe(session, profile, vx, vy);
    }
  },
};
