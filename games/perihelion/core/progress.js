/**
 * Pure Constellation progression, star-unlockable ships, active orbit session,
 * and 5-stage Daily Gauntlet state machine.
 */

import { createRng, dailySeedInfo } from "./rng.js";
import { SHIPS, isShipUnlocked, getShip } from "./ships.js";
import {
  CHAPTERS,
  ORBIT_SPECS,
  ORBIT_BY_ID,
  buildOrbit,
  buildDailyOrbit,
  updateOrbitMotion,
} from "./campaign.js";
import { createFlight, stepFlight } from "./physics.js";

export const SAVE_V = 2;
export const DAILY_STAGES = 5;
export const DAILY_START_PROBES = 4;

export function createProfile() {
  return {
    v: SAVE_V,
    orbits: {}, // orbitId -> { stars, clear, par, sweep, bestShots, bestScore }
    selectedShip: "solaris",
    seenPullTutorial: false,
    seenGrappleTutorial: false,
    bestDailyScore: 0,
    dailyRecords: {}, // YYYY-MM-DD -> { bestScore, cleared }
  };
}

export function sanitizeProfile(raw) {
  const base = createProfile();
  if (!raw || raw.v !== SAVE_V) return base;
  if (raw.orbits && typeof raw.orbits === "object") {
    for (const spec of ORBIT_SPECS) {
      const r = raw.orbits[spec.id];
      if (!r || typeof r !== "object") continue;
      const clear = Boolean(r.clear);
      const par = Boolean(r.par);
      const sweep = Boolean(r.sweep);
      const stars = (clear ? 1 : 0) + (par ? 1 : 0) + (sweep ? 1 : 0);
      base.orbits[spec.id] = {
        clear,
        par,
        sweep,
        stars,
        bestShots: Number(r.bestShots) || 1,
        bestScore: Number(r.bestScore) || 0,
      };
    }
  }
  base.seenPullTutorial = Boolean(raw.seenPullTutorial);
  base.seenGrappleTutorial = Boolean(raw.seenGrappleTutorial);
  base.bestDailyScore = Number(raw.bestDailyScore) || 0;
  if (raw.dailyRecords && typeof raw.dailyRecords === "object") {
    base.dailyRecords = { ...raw.dailyRecords };
  }
  const stars = totalStars(base);
  base.selectedShip =
    typeof raw.selectedShip === "string" && isShipUnlocked(raw.selectedShip, stars)
      ? raw.selectedShip
      : "solaris";
  return base;
}

export function totalStars(profile) {
  let sum = 0;
  for (const spec of ORBIT_SPECS) {
    const r = profile.orbits[spec.id];
    if (r) sum += r.stars;
  }
  return sum;
}

export function chapterStars(profile, chapterIdx) {
  let sum = 0;
  for (const spec of ORBIT_SPECS) {
    if (spec.chapter !== chapterIdx) continue;
    const r = profile.orbits[spec.id];
    if (r) sum += r.stars;
  }
  return sum;
}

export function isChapterUnlocked(profile, chapterIdx) {
  const ch = CHAPTERS[chapterIdx];
  if (!ch) return false;
  if (chapterIdx === 0) return true;
  if (totalStars(profile) >= ch.starsToUnlock) return true;
  // Also unlock if the player cleared the boss orbit of the previous chapter
  const prevLast = ORBIT_SPECS.find((o) => o.chapter === chapterIdx - 1 && o.index === 6);
  return Boolean(prevLast && profile.orbits[prevLast.id]?.clear);
}

export function isOrbitUnlocked(profile, orbitId) {
  const spec = ORBIT_BY_ID[orbitId];
  if (!spec) return false;
  if (!isChapterUnlocked(profile, spec.chapter)) return false;
  if (spec.index === 1) return true;
  const prev = ORBIT_SPECS.find((o) => o.chapter === spec.chapter && o.index === spec.index - 1);
  return Boolean(prev && profile.orbits[prev.id]?.clear);
}

export function nextOrbitIdAfter(orbitId) {
  const idx = ORBIT_SPECS.findIndex((o) => o.id === orbitId);
  if (idx === -1 || idx + 1 >= ORBIT_SPECS.length) return null;
  return ORBIT_SPECS[idx + 1].id;
}

export function nextPlayableOrbitId(profile) {
  for (const spec of ORBIT_SPECS) {
    if (isOrbitUnlocked(profile, spec.id) && !profile.orbits[spec.id]?.clear) {
      return spec.id;
    }
  }
  return ORBIT_SPECS[ORBIT_SPECS.length - 1].id;
}

export function selectShip(profile, shipId) {
  if (!isShipUnlocked(shipId, totalStars(profile))) return false;
  profile.selectedShip = shipId;
  return true;
}

/**
 * Create an active gameplay session for either a Constellation Orbit or the
 * 5-stage Daily Gauntlet.
 */
export function createSession(opts) {
  const mode = opts.mode === "daily" ? "daily" : "campaign";
  const shipId = opts.shipId || "solaris";

  if (mode === "daily") {
    const info = opts.seed !== undefined
      ? { seed: opts.seed, label: opts.dateLabel || "CUSTOM" }
      : dailySeedInfo();
    const stageNum = 1;
    const orbit = buildDailyOrbit(stageNum, createRng((info.seed ^ 0x9e3779b1) >>> 0));
    return {
      mode: "daily",
      shipId,
      dailySeed: info.seed,
      dailyLabel: info.label,
      dailyStage: stageNum,
      probes: DAILY_START_PROBES,
      maxProbes: 5,
      score: 0,
      orbit,
      phase: "aim", // aim | flight | clear | daily_over | daily_won
      shots: 0,
      flight: null,
      lastTrail: null,
      clearResult: null,
      tutorialAssistActive: false,
    };
  }

  const orbit = buildOrbit(opts.orbitId || "h1");
  return {
    mode: "campaign",
    shipId,
    orbitId: orbit.id,
    score: 0,
    orbit,
    phase: "aim", // aim | flight | clear
    shots: 0,
    flight: null,
    lastTrail: null,
    clearResult: null,
    tutorialAssistActive: false,
  };
}

export function retryOrbit(session) {
  if (session.mode !== "campaign") return;
  const keepTrail = session.lastTrail;
  session.orbit = buildOrbit(session.orbitId);
  session.phase = "aim";
  session.shots = 0;
  session.score = 0;
  session.flight = null;
  session.clearResult = null;
  session.lastTrail = keepTrail;
  session.tutorialAssistActive = false;
}

export function launchSessionProbe(session, profile, vx, vy) {
  if (session.phase !== "aim") return false;
  session.phase = "flight";
  session.shots += 1;
  session.flight = createFlight(session.orbit, vx, vy, session.shipId);
  if (session.orbit.tutorial === "pull") {
    profile.seenPullTutorial = true;
  }
  return true;
}

export function recallSessionProbe(session, profile) {
  if (session.phase !== "flight" || !session.flight) return [];
  const main = session.flight.probes[0];
  session.lastTrail = main.trail.slice();
  const ev = { type: "recall", x: main.x, y: main.y };
  session.flight = null;
  session.tutorialAssistActive = false;
  settleCrash(session, profile);
  return [ev];
}

function settleCrash(session, profile) {
  if (session.mode === "daily") {
    session.probes = Math.max(0, session.probes - 1);
    if (session.probes <= 0) {
      session.phase = "daily_over";
      recordDailyScore(profile, session);
    } else {
      session.phase = "aim";
    }
  } else {
    // Campaign mode: instant frictionless return to launch pad (already-collected
    // crystals & unlocked keys persist until the player hits Restart, OR we
    // keep the orbit live so 2-shot Par orbits work seamlessly!)
    session.phase = "aim";
  }
}

function recordDailyScore(profile, session) {
  if (session.score > profile.bestDailyScore) {
    profile.bestDailyScore = session.score;
  }
  const prev = profile.dailyRecords[session.dailyLabel] || { bestScore: 0, cleared: 0 };
  const cleared = session.phase === "daily_won" ? DAILY_STAGES : Math.max(0, session.dailyStage - 1);
  profile.dailyRecords[session.dailyLabel] = {
    bestScore: Math.max(prev.bestScore, session.score),
    cleared: Math.max(prev.cleared, cleared),
  };
}

/**
 * Step active orbit session by `dt` seconds.
 */
export function stepSession(session, profile, dt, holding = false) {
  if (session.phase !== "aim" && session.phase !== "flight") return [];

  const ship = getShip(session.shipId);
  const main = session.flight ? session.flight.probes[0] : null;

  // Interactive Orbit-2 Grapple Tutorial: smoothly dilate time on first approach
  // to the Ice Planet so the player has plenty of time to see "HOLD THUMB NOW"
  // and feel the Orbit Grapple lock!
  let tutorialSlow = 1;
  session.tutorialAssistActive = false;
  if (
    session.phase === "flight" &&
    main &&
    main.alive &&
    session.orbit.tutorial === "grapple" &&
    !profile.seenGrappleTutorial
  ) {
    if (main.tether) {
      tutorialSlow = 0.85;
      session.tutorialAssistActive = true;
    } else if (session.flight.nearestGrappleId) {
      tutorialSlow = 0.24;
      session.tutorialAssistActive = true;
    }
  }

  const isTethered = Boolean(session.phase === "flight" && holding && main && main.tether);
  const hazardScale = isTethered ? (ship.traits.chronoGrapple ? 0.15 : 0.35) : 1;

  const worldDt = dt * tutorialSlow;
  updateOrbitMotion(session.orbit, worldDt, hazardScale);

  if (session.phase !== "flight" || !session.flight) return [];

  const events = stepFlight(session.orbit, session.flight, worldDt, holding, session.shipId);

  for (const ev of events) {
    if (ev.type === "tether_release" && session.orbit.tutorial === "grapple") {
      profile.seenGrappleTutorial = true;
    }
    if (ev.points) {
      session.score += ev.points;
    } else if (ev.type === "tether_release") {
      const pts = Math.round(100 + ev.charge * 120);
      ev.points = pts;
      session.score += pts;
    }
  }

  if (session.flight.settled) {
    const mainEnd = session.flight.probes[0];
    session.lastTrail = mainEnd.trail.slice();
    const outcome = session.flight.outcome;
    session.flight = null;
    session.tutorialAssistActive = false;

    if (outcome === "warp") {
      if (session.mode === "daily") {
        const ace = session.shots === 1;
        const allCrystals = session.orbit.crystals.every((c) => !c.alive);
        const bonus = 400 + session.dailyStage * 120 + (ace ? 300 : 0) + (allCrystals ? 400 : 0);
        session.score += bonus;
        if (ace) session.probes = Math.min(session.maxProbes, session.probes + 1);
        if (session.dailyStage >= DAILY_STAGES) {
          session.phase = "daily_won";
          recordDailyScore(profile, session);
        } else {
          session.dailyStage += 1;
          session.shots = 0;
          session.lastTrail = null;
          session.orbit = buildDailyOrbit(
            session.dailyStage,
            createRng((session.dailySeed ^ Math.imul(session.dailyStage, 0x9e3779b1)) >>> 0),
          );
          session.phase = "aim";
        }
      } else {
        const allCrystals = session.orbit.crystals.every((c) => !c.alive);
        const parMet = session.shots <= session.orbit.par;
        const warpBonus = 400 + (parMet ? 300 : 0) + (allCrystals ? 400 : 0);
        session.score += warpBonus;

        const prevStarsTotal = totalStars(profile);
        const prevRec = profile.orbits[session.orbitId] || {
          clear: false,
          par: false,
          sweep: false,
          stars: 0,
          bestShots: 99,
          bestScore: 0,
        };
        const merged = {
          clear: true,
          par: prevRec.par || parMet,
          sweep: prevRec.sweep || allCrystals,
          bestShots: Math.min(prevRec.bestShots, session.shots),
          bestScore: Math.max(prevRec.bestScore, session.score),
          stars: 0,
        };
        merged.stars = (merged.clear ? 1 : 0) + (merged.par ? 1 : 0) + (merged.sweep ? 1 : 0);
        profile.orbits[session.orbitId] = merged;

        const newStarsTotal = totalStars(profile);
        const newlyUnlockedShips = SHIPS.filter(
          (s) => s.starsRequired > prevStarsTotal && s.starsRequired <= newStarsTotal,
        ).map((s) => s.id);
        const newlyUnlockedChapters = CHAPTERS.filter(
          (c) =>
            c.num > 1 &&
            ((c.starsToUnlock > prevStarsTotal && c.starsToUnlock <= newStarsTotal) ||
              (session.orbit.index === 6 &&
                c.num === session.orbit.chapter + 2 &&
                !prevRec.clear)),
        ).map((c) => c.name);

        const nextId = nextOrbitIdAfter(session.orbitId);
        const nextUnlocked = nextId ? isOrbitUnlocked(profile, nextId) : false;

        session.clearResult = {
          shots: session.shots,
          par: session.orbit.par,
          parMet,
          allCrystals,
          starsThisAttempt: 1 + (parMet ? 1 : 0) + (allCrystals ? 1 : 0),
          bestStars: merged.stars,
          score: session.score,
          newlyUnlockedShips,
          newlyUnlockedChapters,
          nextOrbitId: nextUnlocked ? nextId : null,
        };
        session.phase = "clear";
      }
    } else {
      settleCrash(session, profile);
    }
  }

  return events;
}
