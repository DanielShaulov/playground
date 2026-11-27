/**
 * Persistent Single-Warship Campaign, Bridge Dispatches, Drydock Economy &
 * "Escaped With Injuries" (Option A: damaged parts go offline until repaired)
 * for Broadside! (SAVE_V = 6).
 */

import {
  BAYS,
  PARTS,
  PART_BY_ID,
  STARTER_LOADOUT,
  SPECIALS,
  THEATERS,
  ENEMY_TYPES,
} from "./content.js";
import { createRng, hashSeed } from "./rng.js";
import { getArenaTemplate } from "./arenas.js";

export const SAVE_V = 6;
export const BASE_TORP_SPEED = 62;

export function createCampaign(seed = Math.floor(Math.random() * 0x7fffffff) || 101) {
  const numericSeed = (typeof seed === "string" ? hashSeed(seed) : seed >>> 0) || 101;
  return {
    v: SAVE_V,
    seed: numericSeed,
    gold: 0,
    theater: 1, // Active Theater selected on Bridge (1..3)
    maxUnlockedTheater: 1, // Unlocks 2 after Theater 1 Flagship, 3 after Theater 2 Flagship
    theaterWins: { 1: 0, 2: 0, 3: 0 },
    flagshipsSunk: { 1: false, 2: false, 3: false },
    ownedParts: {
      hull_gunboat: true,
      guns_starter: true,
      aux_none: true,
      sys_iron_sights: true,
    },
    equipped: { ...STARTER_LOADOUT },
    damagedParts: {}, // { [partId]: true } -> offline in battle until repaired in Drydock!
    dispatchTurn: 1,
    totalWins: 0,
    totalRetreats: 0,
    shipsSunk: 0,
    citadels: 0,
    bounces: 0,
    tutorialSeen: {
      steered: false,
      fired: false,
      heTip: false,
      torpTip: false,
    },
  };
}

export function sanitizeCampaign(raw) {
  const base = createCampaign();
  if (!raw || typeof raw !== "object" || raw.v !== SAVE_V) return base;

  const owned = { ...base.ownedParts };
  if (raw.ownedParts && typeof raw.ownedParts === "object") {
    for (const [k, v] of Object.entries(raw.ownedParts)) {
      if (v && PART_BY_ID[k]) owned[k] = true;
    }
  }

  const equipped = { ...STARTER_LOADOUT };
  for (const bay of BAYS) {
    const pid = raw.equipped?.[bay.id];
    if (pid && owned[pid] && PART_BY_ID[pid]?.bay === bay.id) {
      equipped[bay.id] = pid;
    }
  }

  const damaged = {};
  if (raw.damagedParts && typeof raw.damagedParts === "object") {
    for (const [k, v] of Object.entries(raw.damagedParts)) {
      if (v && owned[k] && !PART_BY_ID[k]?.starter) damaged[k] = true;
    }
  }

  const maxTheater = Math.min(3, Math.max(1, Number(raw.maxUnlockedTheater) || 1));
  const theater = Math.min(maxTheater, Math.max(1, Number(raw.theater) || 1));

  return {
    v: SAVE_V,
    seed: Number(raw.seed) || base.seed,
    gold: Math.max(0, Number(raw.gold) || 0),
    theater,
    maxUnlockedTheater: maxTheater,
    theaterWins: {
      1: Math.max(0, Number(raw.theaterWins?.[1]) || 0),
      2: Math.max(0, Number(raw.theaterWins?.[2]) || 0),
      3: Math.max(0, Number(raw.theaterWins?.[3]) || 0),
    },
    flagshipsSunk: {
      1: Boolean(raw.flagshipsSunk?.[1]),
      2: Boolean(raw.flagshipsSunk?.[2]),
      3: Boolean(raw.flagshipsSunk?.[3]),
    },
    ownedParts: owned,
    equipped,
    damagedParts: damaged,
    dispatchTurn: Math.max(1, Number(raw.dispatchTurn) || 1),
    totalWins: Math.max(0, Number(raw.totalWins) || 0),
    totalRetreats: Math.max(0, Number(raw.totalRetreats) || 0),
    shipsSunk: Math.max(0, Number(raw.shipsSunk) || 0),
    citadels: Math.max(0, Number(raw.citadels) || 0),
    bounces: Math.max(0, Number(raw.bounces) || 0),
    tutorialSeen: {
      steered: Boolean(raw.tutorialSeen?.steered),
      fired: Boolean(raw.tutorialSeen?.fired),
      heTip: Boolean(raw.tutorialSeen?.heTip),
      torpTip: Boolean(raw.tutorialSeen?.torpTip),
    },
  };
}

/**
 * Return the active (intact) part for a bay — if the equipped part is DAMAGED IN RETREAT,
 * the bay falls back to its starter part until repaired or swapped!
 */
export function getActiveBayPart(campaign, bayId) {
  const eqId = campaign.equipped?.[bayId] || STARTER_LOADOUT[bayId];
  if (campaign.damagedParts?.[eqId]) {
    return PART_BY_ID[STARTER_LOADOUT[bayId]];
  }
  return PART_BY_ID[eqId] || PART_BY_ID[STARTER_LOADOUT[bayId]];
}

export function getDamagedEquippedIds(campaign) {
  const out = [];
  for (const bay of BAYS) {
    const pid = campaign.equipped?.[bay.id];
    if (pid && campaign.damagedParts?.[pid]) out.push(pid);
  }
  return out;
}

export function getAnyDamagedPartIds(campaign) {
  return Object.keys(campaign.damagedParts || {}).filter((id) => campaign.damagedParts[id]);
}

/**
 * Compute full live warship stats from the 4 equipped (and intact) Hardpoint Bays!
 * Every trade-off (speed vs armor, turrets vs torps, spread vs rudder) is resolved here.
 */
export function computeShipStats(campaign) {
  const hullP = getActiveBayPart(campaign, "hull");
  const gunsP = getActiveBayPart(campaign, "guns");
  const auxP = getActiveBayPart(campaign, "aux");
  const sysP = getActiveBayPart(campaign, "sys");

  const hs = hullP.stats;
  const gs = gunsP.stats;
  const as = auxP.stats;
  const ss = sysP.stats;

  const speedMult = (gs.speedMult || 1) * (as.speedMult || 1) * (ss.speedMult || 1);
  const turnMult = ss.turnMult || 1;
  const rudderRateMult = ss.rudderRateMult || 1;
  const reloadMult = (as.reloadMult || 1) * (ss.reloadMult || 1);
  const dispMult = ss.dispersionMult || 1;

  // Torpedo Deck conversion grants torpedoes even if aux is Smoke/Repair — OR stacks with Torp Tubes!
  const baseTorps = as.torpCount || 0;
  const bonusTorps = gs.bonusTorps || 0;
  const torpCount = baseTorps + bonusTorps;

  let specialId = as.specialId || "none";
  if (specialId === "none" && bonusTorps > 0) specialId = "torp";
  const baseSp = SPECIALS[specialId] || SPECIALS.none;
  const rawCd = as.specialCd || baseSp.cd || 7.5;
  const specialCd = specialId === "torp" ? rawCd * (gs.torpCdMult || 1) : rawCd;
  const rawTorpCd = as.specialId === "torp" ? as.specialCd || 7.5 : SPECIALS.torp.cd;
  const torpCd = torpCount > 0 ? Number((rawTorpCd * (gs.torpCdMult || 1)).toFixed(1)) : 0;
  const hasDualSpecial = torpCount > 0 && (specialId === "smoke" || specialId === "repair");

  const special = {
    ...baseSp,
    cd: Number(specialCd.toFixed(1)),
  };

  // Dynamic Warship Class Name reflecting your actual modular build!
  const classTag = hs.classTag || "Gunboat";
  let shipTitle = `HMS ${classTag}`;
  if (bonusTorps > 0) shipTitle = `Torp ${classTag}`;
  else if (gs.bowGuns >= 3) shipTitle = `Super ${classTag}`;
  else if (specialId === "smoke" && hs.speed >= 36) shipTitle = `Ghost ${classTag}`;

  const powerTier = Math.max(hullP.tier, gunsP.tier, auxP.tier, sysP.tier);

  return {
    shipTitle,
    powerTier,
    hull: {
      id: hullP.id,
      name: shipTitle,
      radius: hs.radius,
      hullColor: hs.hullColor,
      deckColor: hs.deckColor,
      maxHp: hs.maxHp,
    },
    maxHp: hs.maxHp,
    speed: Math.max(18, hs.speed * speedMult),
    turnRate: Math.max(0.85, hs.turnRate * turnMult),
    rudderRate: 2.35 * rudderRateMult,
    reload: Math.max(1.5, gs.reload * reloadMult),
    bowGuns: gs.bowGuns,
    sternGuns: gs.sternGuns,
    ricochetSin: hs.ricochetSin,
    citadelSin: Math.min(0.86, Math.max(0.55, gs.citadelSin + (ss.citadelSinDelta || 0))),
    dispersion: Math.max(7, gs.dispersion * dispMult),
    fireChance: Math.min(1, gs.fireChance + (ss.fireChanceBonus || 0)),
    fireDuration: 3.8 * (ss.fireDurationMult || 1),
    torpCount,
    torpCd,
    torpSpeed: BASE_TORP_SPEED * (as.torpSpeedMult || 1),
    smokeDuration: as.smokeDuration || 6.5,
    repairAmt: as.repairAmt || 2,
    dmgCtrlHeal: Boolean(ss.dmgCtrlHeal),
    bulkheadGuard: Boolean(ss.bulkheadGuard),
    strengthenedHull: Boolean(hs.strengthenedHull || ss.bulkheadGuard),
    hasDualSpecial,
    special,
    activeParts: { hull: hullP, guns: gunsP, aux: auxP, sys: sysP },
  };
}

// --- Drydock Economy: Buy, Equip, Repair ------------------------------------

export function isPartUnlocked(campaign, part) {
  if (!part) return false;
  if (part.tier <= 1) return true;
  if (part.tier === 2) return campaign.maxUnlockedTheater >= 2 || campaign.totalWins >= 2;
  return campaign.maxUnlockedTheater >= 3 || campaign.flagshipsSunk?.[2];
}

export function buyPart(campaign, partId) {
  const part = PART_BY_ID[partId];
  if (!part) return { ok: false, reason: "unknown" };
  if (campaign.ownedParts[partId]) return { ok: false, reason: "owned" };
  if (!isPartUnlocked(campaign, part)) return { ok: false, reason: "locked" };
  if (campaign.gold < part.cost) return { ok: false, reason: "gold" };

  campaign.gold -= part.cost;
  campaign.ownedParts[partId] = true;
  campaign.equipped[part.bay] = partId;
  delete campaign.damagedParts[partId];
  return { ok: true, part };
}

export function equipPart(campaign, partId) {
  const part = PART_BY_ID[partId];
  if (!part || !campaign.ownedParts[partId]) return { ok: false, reason: "unowned" };
  campaign.equipped[part.bay] = partId;
  return { ok: true, part };
}

export function repairPart(campaign, partId) {
  const part = PART_BY_ID[partId];
  if (!part || !campaign.damagedParts[partId]) return { ok: false, reason: "intact" };
  if (campaign.gold < part.repairCost) return { ok: false, reason: "gold" };
  campaign.gold -= part.repairCost;
  delete campaign.damagedParts[partId];
  return { ok: true, part };
}

export function hasAffordableUpgrade(campaign) {
  if (
    getAnyDamagedPartIds(campaign).some((id) => campaign.gold >= (PART_BY_ID[id]?.repairCost || 0))
  ) {
    return true;
  }
  return PARTS.some(
    (p) =>
      !p.starter &&
      !campaign.ownedParts[p.id] &&
      isPartUnlocked(campaign, p) &&
      campaign.gold >= p.cost,
  );
}

// --- Option A: "Escaped With Injuries" --------------------------------------

/**
 * Called when the player's hull hits 0♥ in battle:
 * Your ship limps back to Port (no game over, no wipe!), keeping your campaign & gold,
 * but 1 (or 2 in Theater 3) equipped non-starter parts are knocked offline ("DAMAGED IN RETREAT")
 * until repaired in Drydock (~45% cost) or swapped out!
 */
export function applyRetreatDamage(campaign, seed = Date.now()) {
  campaign.totalRetreats += 1;
  campaign.dispatchTurn += 1;

  const stats = computeShipStats(campaign);
  const candidates = [];
  for (const bay of BAYS) {
    const pid = campaign.equipped[bay.id];
    const part = PART_BY_ID[pid];
    if (part && !part.starter && !campaign.damagedParts[pid]) {
      candidates.push(pid);
    }
  }

  if (candidates.length === 0) {
    return { damagedIds: [], protectedByBulkhead: false };
  }

  const rng = createRng(hashSeed(`retreat:${campaign.seed}:${campaign.totalRetreats}:${seed}`));
  const rawCount = campaign.theater >= 3 && candidates.length >= 2 ? 2 : 1;
  let protectedByBulkhead = false;
  let count = rawCount;
  if (stats.bulkheadGuard) {
    // Bulkheads absorb 1 hit (and take the hit themselves only if no other damage occurs)
    protectedByBulkhead = true;
    count = Math.max(0, rawCount - 1);
  }

  const pool = [...candidates];
  const damagedIds = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    const chosen = pool.splice(idx, 1)[0];
    campaign.damagedParts[chosen] = true;
    damagedIds.push(chosen);
  }

  return { damagedIds, protectedByBulkhead };
}

export function recordBattleWin(campaign, dispatch, battleStats) {
  const bounty = dispatch.bonusGold || 0;
  const totalGold = (battleStats.goldCollected || 0) + bounty;
  campaign.gold += totalGold;
  campaign.totalWins += 1;
  campaign.theaterWins[dispatch.theater] = (campaign.theaterWins[dispatch.theater] || 0) + 1;
  campaign.shipsSunk += battleStats.shipsSunk || 0;
  campaign.citadels += battleStats.citadels || 0;
  campaign.bounces += battleStats.bounces || 0;
  campaign.dispatchTurn += 1;

  let unlockedTheater = null;
  if (dispatch.isBoss) {
    campaign.flagshipsSunk[dispatch.theater] = true;
    if (dispatch.theater < 3 && campaign.maxUnlockedTheater < dispatch.theater + 1) {
      campaign.maxUnlockedTheater = dispatch.theater + 1;
      unlockedTheater = campaign.maxUnlockedTheater;
    }
  }

  return { totalGold, bounty, unlockedTheater };
}

// --- Bridge Admiralty Dispatches (Terrain-First Missions) -------------------

function makeDispatch(theater, slotIndex, cfg, seed) {
  const terrain = getArenaTemplate(cfg.terrainId);
  const icons = cfg.roster.map((id) => ENEMY_TYPES[id]?.icon || "⛵").join("");
  const lootGold = cfg.roster.reduce((sum, id) => sum + (ENEMY_TYPES[id]?.gold || 3), 0);
  return {
    id: `t${theater}_d${slotIndex}_${seed % 997}`,
    theater,
    slotIndex,
    seed,
    name: cfg.name,
    kind: cfg.kind, // patrol | contract | assault | boss
    nodeType: cfg.nodeType || "skirmish", // skirmish | convoy | fort | boss
    isBoss: Boolean(cfg.isBoss),
    tutorial: Boolean(cfg.tutorial),
    threat: cfg.threat, // 1 | 2 | 3
    roster: cfg.roster,
    icons,
    bonusGold: cfg.bonusGold,
    estGold: lootGold + cfg.bonusGold,
    terrainId: terrain.id,
    terrainLabel: terrain.label,
    weather: theater === 3 && terrain.weather === "clear" ? "ash" : terrain.weather,
    islands: terrain.islands.map((isl) => ({ ...isl })),
    landforms: terrain.landforms,
    piers: terrain.piers,
    lighthouses: terrain.lighthouses,
    buoys: terrain.buoys,
    fogZones: terrain.fogZones.map((f) => ({ ...f })),
    mines: terrain.mines.map((m) => ({ ...m, alive: true })),
  };
}

/**
 * Generate 3 curated Admiralty Dispatches for the current Bridge Theater:
 * - Slot 0: Safe / Farmable Patrol (never soft-locks a damaged ship!)
 * - Slot 1: Tactical Contract (convoy, fort, or armored duel with solid salvage)
 * - Slot 2: High-Stakes Raid — OR the Theater Flagship once you've won >= 2 battles here!
 */
export function generateDispatches(campaign) {
  const th = campaign.theater || 1;
  const thDef = THEATERS[th - 1] || THEATERS[0];
  const baseSeed = hashSeed(`bridge:${campaign.seed}:t${th}:turn${campaign.dispatchTurn}`);
  const rng = createRng(baseSeed);
  const winsHere = campaign.theaterWins?.[th] || 0;
  const bossReady = winsHere >= 2;

  if (th === 1) {
    const slot0 = makeDispatch(
      1,
      0,
      campaign.totalWins === 0
        ? {
            name: "First Watch Patrol",
            kind: "patrol",
            nodeType: "skirmish",
            tutorial: true,
            threat: 1,
            roster: ["patrol_boat", "patrol_boat"],
            bonusGold: 6,
            terrainId: "archipelago",
          }
        : rng.pick([
            {
              name: "Coastal Scout Sweep",
              kind: "patrol",
              nodeType: "skirmish",
              threat: 1,
              roster: ["patrol_boat", "destroyer"],
              bonusGold: 4,
              terrainId: "archipelago",
            },
            {
              name: "Smuggler Interdiction",
              kind: "patrol",
              nodeType: "convoy",
              threat: 1,
              roster: ["convoy", "patrol_boat"],
              bonusGold: 3,
              terrainId: "shipping_lane",
            },
          ]),
      baseSeed + 11,
    );

    const slot1 = makeDispatch(
      1,
      1,
      rng.pick([
        {
          name: "Twin Narrows Ambush",
          kind: "contract",
          nodeType: "skirmish",
          threat: 2,
          roster: ["cruiser", "destroyer"],
          bonusGold: 6,
          terrainId: "twin_narrows",
        },
        {
          name: "Harbor Battery Raid",
          kind: "contract",
          nodeType: "fort",
          threat: 2,
          roster: ["fort", "patrol_boat"],
          bonusGold: 7,
          terrainId: "harbor_fort",
        },
        {
          name: "Lone Battleship Duel",
          kind: "contract",
          nodeType: "skirmish",
          threat: 2,
          roster: ["battleship"],
          bonusGold: 7,
          terrainId: "open_squall",
        },
      ]),
      baseSeed + 29,
    );

    const slot2 = bossReady
      ? makeDispatch(
          1,
          2,
          {
            name: `FLAGSHIP: ${thDef.bossName}`,
            kind: "boss",
            nodeType: "boss",
            isBoss: true,
            threat: 3,
            roster: thDef.bossRoster,
            bonusGold: 12,
            terrainId: "flagship_basin",
          },
          baseSeed + 47,
        )
      : makeDispatch(
          1,
          2,
          {
            name: "Armored Escort Strike",
            kind: "assault",
            nodeType: "skirmish",
            threat: 3,
            roster: ["battleship", "destroyer"],
            bonusGold: 10,
            terrainId: slot1.terrainId === "twin_narrows" ? "open_squall" : "twin_narrows",
          },
          baseSeed + 47,
        );

    return [slot0, slot1, slot2];
  }

  if (th === 2) {
    const slot0 = makeDispatch(
      2,
      0,
      rng.pick([
        {
          name: "Iron Convoy Raid",
          kind: "patrol",
          nodeType: "convoy",
          threat: 1,
          roster: ["convoy", "cruiser"],
          bonusGold: 7,
          terrainId: "shipping_lane",
        },
        {
          name: "Destroyer Flotilla",
          kind: "patrol",
          nodeType: "skirmish",
          threat: 1,
          roster: ["destroyer", "destroyer", "fireship"],
          bonusGold: 8,
          terrainId: "open_squall",
        },
      ]),
      baseSeed + 13,
    );

    const slot1 = makeDispatch(
      2,
      1,
      rng.pick([
        {
          name: "Fortified Sound Assault",
          kind: "contract",
          nodeType: "fort",
          threat: 2,
          roster: ["fort", "cruiser", "fireship"],
          bonusGold: 12,
          terrainId: "harbor_fort",
        },
        {
          name: "Heavy Cruiser Squadron",
          kind: "contract",
          nodeType: "skirmish",
          threat: 2,
          roster: ["battleship", "cruiser"],
          bonusGold: 12,
          terrainId: "twin_narrows",
        },
      ]),
      baseSeed + 31,
    );

    const slot2 = bossReady
      ? makeDispatch(
          2,
          2,
          {
            name: `FLAGSHIP: ${thDef.bossName}`,
            kind: "boss",
            nodeType: "boss",
            isBoss: true,
            threat: 3,
            roster: thDef.bossRoster,
            bonusGold: 22,
            terrainId: "flagship_basin",
          },
          baseSeed + 53,
        )
      : makeDispatch(
          2,
          2,
          {
            name: "Steel Line Breakthrough",
            kind: "assault",
            nodeType: "skirmish",
            threat: 3,
            roster: ["battleship", "battleship"],
            bonusGold: 18,
            terrainId: "open_squall",
          },
          baseSeed + 53,
        );

    return [slot0, slot1, slot2];
  }

  // Theater 3 — Abyssal Reach
  const slot0 = makeDispatch(
    3,
    0,
    {
      name: "Caldera Treasure Run",
      kind: "patrol",
      nodeType: "convoy",
      threat: 1,
      roster: ["convoy", "cruiser", "destroyer"],
      bonusGold: 12,
      terrainId: "shipping_lane",
    },
    baseSeed + 17,
  );

  const slot1 = makeDispatch(
    3,
    1,
    rng.pick([
      {
        name: "Abyssal Citadel Battery",
        kind: "contract",
        nodeType: "fort",
        threat: 2,
        roster: ["fort", "battleship", "fireship"],
        bonusGold: 18,
        terrainId: "harbor_fort",
      },
      {
        name: "Volcanic Strait Clash",
        kind: "contract",
        nodeType: "skirmish",
        threat: 2,
        roster: ["battleship", "cruiser", "destroyer"],
        bonusGold: 18,
        terrainId: "twin_narrows",
      },
    ]),
    baseSeed + 37,
  );

  const slot2 = bossReady
    ? makeDispatch(
        3,
        2,
        {
          name: `FLAGSHIP: ${thDef.bossName}`,
          kind: "boss",
          nodeType: "boss",
          isBoss: true,
          threat: 3,
          roster: thDef.bossRoster,
          bonusGold: 35,
          terrainId: "flagship_basin",
        },
        baseSeed + 59,
      )
    : makeDispatch(
        3,
        2,
        {
          name: "Dreadnought Vanguard",
          kind: "assault",
          nodeType: "skirmish",
          threat: 3,
          roster: ["battleship", "battleship", "fireship"],
          bonusGold: 26,
          terrainId: "twin_narrows",
        },
        baseSeed + 59,
      );

  return [slot0, slot1, slot2];
}
