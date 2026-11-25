/**
 * Pure run state machine for Perihelion: scoring, probe economy, relic drafting,
 * sector transitions, endless mode, and save serialization.
 */

import { createRng, dailySeedInfo, randomSeed } from "./rng.js";
import { hasRelic, draftRelics } from "./relics.js";
import { FINAL_SECTOR, generateSector, updateSectorMotion } from "./sectors.js";
import { createFlight, stepFlight } from "./physics.js";

export const SAVE_V = 1;
export const START_PROBES = 4;
export const MAX_PROBES = 5;

function makeSectorRng(seed, sectorNum) {
  return createRng((seed ^ Math.imul(sectorNum, 0x9e3779b1)) >>> 0);
}

/**
 * Start a new Perihelion run.
 * @param {{ mode?: 'standard' | 'daily', seed?: number, dateLabel?: string }} opts
 */
export function createRun(opts = {}) {
  const mode = opts.mode === "daily" ? "daily" : "standard";
  let seed = opts.seed;
  let dateLabel = opts.dateLabel || null;
  if (seed === undefined) {
    if (mode === "daily") {
      const info = dailySeedInfo();
      seed = info.seed;
      dateLabel = info.label;
    } else {
      seed = randomSeed();
    }
  }

  const sectorNum = 1;
  const sector = generateSector(sectorNum, makeSectorRng(seed, sectorNum));

  return {
    v: SAVE_V,
    mode,
    seed,
    dateLabel,
    sectorNum,
    endless: false,
    phase: "aim", // aim | flight | draft | victory | over
    probes: START_PROBES,
    maxProbes: MAX_PROBES,
    score: 0,
    crystalsTotal: 0,
    siphonCounter: 0,
    grazesTotal: 0,
    bestChain: 0,
    shotsInSector: 0,
    relics: [],
    draftChoices: [],
    sector,
    flight: null,
    lastClearSummary: null,
  };
}

/**
 * Launch the probe with velocity (vx, vy) from the current sector's launch pad.
 */
export function launchProbe(run, vx, vy) {
  if (run.phase !== "aim") return false;
  run.phase = "flight";
  run.shotsInSector += 1;
  run.flight = createFlight(run.sector, vx, vy, run.relics);
  return true;
}

/**
 * Abort an active flight early (spends 1 probe).
 */
export function recallProbe(run) {
  if (run.phase !== "flight" || !run.flight) return [];
  const main = run.flight.probes[0];
  const ev = { type: "recall", x: main.x, y: main.y };
  run.flight.settled = true;
  run.flight.outcome = "recall";
  settleFailedFlight(run);
  return [ev];
}

function settleFailedFlight(run) {
  run.probes = Math.max(0, run.probes - 1);
  run.flight = null;
  if (run.probes <= 0) {
    run.phase = "over";
  } else {
    run.phase = "aim";
  }
}

/**
 * Advance the active run by `dt` seconds.
 * Returns events emitted this frame (annotated with points / bonuses).
 */
export function stepRun(run, dt, holding = false) {
  if (run.phase !== "aim" && run.phase !== "flight") return [];

  const main = run.flight ? run.flight.probes[0] : null;
  const chronoSlow =
    run.phase === "flight" &&
    holding &&
    main &&
    main.tether &&
    hasRelic(run.relics, "chrono_tether");

  updateSectorMotion(run.sector, dt, chronoSlow ? 0.35 : 1);

  if (run.phase !== "flight" || !run.flight) return [];

  const events = stepFlight(run.sector, run.flight, dt, holding, run.relics);
  const hasPrism = hasRelic(run.relics, "resonance_prism");
  const hasSiphon = hasRelic(run.relics, "starlight_siphon");
  const hasCapacitor = hasRelic(run.relics, "solar_capacitor");

  for (const ev of events) {
    if (ev.type === "crystal" || ev.type === "key") {
      const mult = hasPrism ? ev.chain * 2 - 1 : ev.chain;
      const base = ev.type === "key" ? 250 : 100;
      const pts = Math.round(base * mult * (hasPrism ? 1.5 : 1));
      run.score += pts;
      ev.points = pts;
      run.crystalsTotal += 1;
      if (ev.chain > run.bestChain) run.bestChain = ev.chain;

      if (hasSiphon) {
        run.siphonCounter += 1;
        if (run.siphonCounter >= 7) {
          run.siphonCounter = 0;
          if (run.probes < run.maxProbes) {
            run.probes += 1;
            ev.siphonProbe = true;
          }
        }
      }
    } else if (ev.type === "graze") {
      const pts = ev.isSingularity ? 450 : 200;
      run.score += pts;
      ev.points = pts;
      run.grazesTotal += 1;
      if (ev.chain > run.bestChain) run.bestChain = ev.chain;
    } else if (ev.type === "bumper") {
      const pts = 75;
      run.score += pts;
      ev.points = pts;
    } else if (ev.type === "tether_release") {
      const pts = Math.round(100 + ev.charge * 120);
      run.score += pts;
      ev.points = pts;
    }
  }

  if (run.flight.settled) {
    if (run.flight.outcome === "warp") {
      const ace = run.shotsInSector === 1;
      const allCleared = run.sector.crystals.every((c) => !c.alive);
      const baseBonus = 400 + run.sectorNum * 100;
      const aceBonus = ace ? (hasCapacitor ? 500 : 350) : 0;
      const perfectBonus = allCleared && run.sector.totalCrystals > 0 ? 500 : 0;
      const totalClear = baseBonus + aceBonus + perfectBonus;
      run.score += totalClear;

      const probeGain = ace && hasCapacitor ? 2 : 1;
      const prevProbes = run.probes;
      run.probes = Math.min(run.maxProbes, run.probes + probeGain);

      run.lastClearSummary = {
        sectorNum: run.sectorNum,
        sectorName: run.sector.name,
        ace,
        allCleared,
        baseBonus,
        aceBonus,
        perfectBonus,
        totalClear,
        probesGained: run.probes - prevProbes,
      };
      run.flight = null;

      if (run.sectorNum === FINAL_SECTOR && !run.endless) {
        run.phase = "victory";
      } else {
        const draftRng = makeSectorRng(run.seed ^ 0x51a7b3, run.sectorNum);
        run.draftChoices = draftRelics(draftRng, run.relics, 3);
        run.phase = "draft";
      }
    } else {
      settleFailedFlight(run);
    }
  }

  return events;
}

/**
 * Pick a relic after clearing a sector and advance to the next sector.
 */
export function pickRelic(run, relicId) {
  if (run.phase !== "draft") return false;
  if (relicId && run.draftChoices.includes(relicId) && !run.relics.includes(relicId)) {
    run.relics.push(relicId);
  }
  run.sectorNum += 1;
  run.shotsInSector = 0;
  run.draftChoices = [];
  run.flight = null;
  run.sector = generateSector(run.sectorNum, makeSectorRng(run.seed, run.sectorNum));
  run.phase = "aim";
  return true;
}

/**
 * Continue past Sector 12 victory into Endless Deep Space (starts with relic draft).
 */
export function continueEndless(run) {
  if (run.phase !== "victory") return false;
  run.endless = true;
  const draftRng = makeSectorRng(run.seed ^ 0x51a7b3, run.sectorNum);
  run.draftChoices = draftRelics(draftRng, run.relics, 3);
  run.phase = "draft";
  return true;
}

/**
 * Serialize a resumable run snapshot (safe for localStorage).
 */
export function serializeRun(run) {
  if (!run || run.phase === "over") return null;
  return {
    v: SAVE_V,
    mode: run.mode,
    seed: run.seed,
    dateLabel: run.dateLabel,
    sectorNum: run.sectorNum,
    endless: run.endless,
    phase: run.phase === "flight" ? "aim" : run.phase,
    probes: run.probes,
    maxProbes: run.maxProbes,
    score: run.score,
    crystalsTotal: run.crystalsTotal,
    siphonCounter: run.siphonCounter,
    grazesTotal: run.grazesTotal,
    bestChain: run.bestChain,
    shotsInSector: run.shotsInSector,
    relics: run.relics.slice(),
    draftChoices: run.draftChoices.slice(),
    crystalsAlive: run.sector.crystals.map((c) => c.alive),
    minesAlive: run.sector.mines.map((m) => m.alive),
    aegisUsed: run.sector.aegisUsed,
  };
}

/**
 * Restore a saved run snapshot, or return null if invalid/version-mismatched.
 */
export function deserializeRun(raw) {
  if (!raw || raw.v !== SAVE_V || typeof raw.seed !== "number" || typeof raw.sectorNum !== "number") {
    return null;
  }
  if (raw.phase === "over") return null;
  const sector = generateSector(raw.sectorNum, makeSectorRng(raw.seed, raw.sectorNum));
  if (Array.isArray(raw.crystalsAlive) && raw.crystalsAlive.length === sector.crystals.length) {
    for (let i = 0; i < sector.crystals.length; i++) {
      sector.crystals[i].alive = Boolean(raw.crystalsAlive[i]);
    }
  }
  if (Array.isArray(raw.minesAlive) && raw.minesAlive.length === sector.mines.length) {
    for (let i = 0; i < sector.mines.length; i++) {
      sector.mines[i].alive = Boolean(raw.minesAlive[i]);
    }
  }
  sector.aegisUsed = Boolean(raw.aegisUsed);

  return {
    v: SAVE_V,
    mode: raw.mode === "daily" ? "daily" : "standard",
    seed: raw.seed,
    dateLabel: raw.dateLabel || null,
    sectorNum: raw.sectorNum,
    endless: Boolean(raw.endless),
    phase: raw.phase === "draft" || raw.phase === "victory" ? raw.phase : "aim",
    probes: Math.max(1, Math.min(MAX_PROBES, raw.probes || START_PROBES)),
    maxProbes: raw.maxProbes || MAX_PROBES,
    score: raw.score || 0,
    crystalsTotal: raw.crystalsTotal || 0,
    siphonCounter: raw.siphonCounter || 0,
    grazesTotal: raw.grazesTotal || 0,
    bestChain: raw.bestChain || 0,
    shotsInSector: raw.shotsInSector || 0,
    relics: Array.isArray(raw.relics) ? raw.relics.slice() : [],
    draftChoices: Array.isArray(raw.draftChoices) ? raw.draftChoices.slice() : [],
    sector,
    flight: null,
    lastClearSummary: null,
  };
}
