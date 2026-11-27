/**
 * Pure Node test & live naval balance suite for Broadside! (The Bridge & One Persistent Warship).
 *
 * Verifies:
 * 1. Deterministic PRNG & seed hashing.
 * 2. Modular Ship Trade-Off Tech Tree: Ironclad (more armor, less speed) vs Hydrofoil
 *    (fast, fragile bow), Torpedo Conversion (+2 torps, loses stern gun), Rangefinder vs Rudder.
 * 3. Option A "Escaped With Injuries": retreat knocks equipped upgrades offline until repaired
 *    at ~45% cost, Bulkheads absorb 1 hit, and SAVE_V = 6 roundtrips cleanly.
 * 4. Heavy Naval Rudder Inertia, Armor Angling (AP Ricochet vs Citadel), Turret Arcs,
 *    Island Shoreline Torpedo Raycast, Live Armor-Angle Halo, and 2-state FULL/STOP Toggle.
 * 5. Anti-Candy-Land Campaign Balance Gate: Naive broadside sailors stall out in Theater 1,
 *    while Tactical WoWS captains build up their ship from Gunboat -> Cruiser/Dreadnought
 *    and sink Theater Flagships.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createRng, hashSeed } from "../../games/broadside/core/rng.js";
import { ARENAS } from "../../games/broadside/core/arenas.js";
import { PART_BY_ID } from "../../games/broadside/core/content.js";
import {
  createCampaign,
  sanitizeCampaign,
  computeShipStats,
  buyPart,
  equipPart,
  repairPart,
  applyRetreatDamage,
  recordBattleWin,
  generateDispatches,
} from "../../games/broadside/core/campaign.js";
import {
  SHELL_SPEED,
  AIM_BLOOM_START,
  AIM_FLOOR_FREE,
  AIM_FLOOR_LOCKED,
  createBattle,
  stepBattle,
  setPlayerWaypoint,
  cyclePlayerThrottle,
  togglePlayerAmmo,
  canLaunchTorpedoAt,
  getBearingTurrets,
  getSalvoMetrics,
  getIncomingArmorStatus,
  getLockedEnemy,
  isAimOnLockedEnemy,
  stepAimBloom,
  raycastIslandDist,
  computeRamDamage,
  firePlayerSalvo,
  launchPlayerTorpedoes,
  triggerInstantSpecial,
  resolveShellHit,
  wrapAngle,
} from "../../games/broadside/core/sim.js";

test("Deterministic PRNG & seed hashing", () => {
  const a = createRng("broadside-bridge");
  const b = createRng("broadside-bridge");
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
  assert.equal(hashSeed("sunlit-strait"), hashSeed("sunlit-strait"));
  assert.notEqual(hashSeed("sunlit-strait"), hashSeed("iron-sound"));
});

test("Modular Trade-Off Tech Tree: real build choices (armor vs speed, turrets vs torps)", () => {
  const camp = createCampaign(42);
  camp.gold = 200;
  camp.maxUnlockedTheater = 3;

  const base = computeShipStats(camp);
  assert.equal(base.maxHp, 6);
  assert.equal(base.bowGuns + base.sternGuns, 2);
  assert.equal(base.special.id, "none");

  // Hull trade-off: Ironclad Belt (more HP & wider bounce, slower) vs Hydrofoil (faster, thinner bow)
  assert.equal(buyPart(camp, "hull_ironclad").ok, true);
  const iron = computeShipStats(camp);
  assert.equal(buyPart(camp, "hull_hydrofoil").ok, true);
  const hydro = computeShipStats(camp);
  assert.ok(iron.maxHp > hydro.maxHp, "Ironclad must have more HP than Hydrofoil");
  assert.ok(iron.ricochetSin > hydro.ricochetSin, "Ironclad must bounce wider angles");
  assert.ok(hydro.speed > iron.speed * 1.35, "Hydrofoil must be much faster than Ironclad");
  assert.ok(hydro.turnRate > iron.turnRate * 1.4, "Hydrofoil must turn much faster");

  // Weapon trade-off: Twin Broadsides (2+2 guns) vs Torpedo Conversion (2+0 guns, +2 torps!)
  assert.equal(buyPart(camp, "aux_long_lance").ok, true);
  assert.equal(buyPart(camp, "guns_broadside").ok, true);
  const broad = computeShipStats(camp);
  assert.equal(broad.bowGuns + broad.sternGuns, 4);
  assert.equal(broad.torpCount, 4);

  assert.equal(buyPart(camp, "guns_torp_deck").ok, true);
  const torpBoat = computeShipStats(camp);
  assert.equal(torpBoat.bowGuns, 2);
  assert.equal(torpBoat.sternGuns, 0, "Torpedo Conversion sacrifices stern guns");
  assert.equal(torpBoat.torpCount, 6, "Torpedo Conversion stacks +2 torps with Quad Long-Lance");
  assert.ok(torpBoat.special.cd < broad.special.cd, "Torpedo Conversion shortens torp cooldown");

  // Dual-special synergy: Torpedo Conversion (Guns) + Repair Party (Deck) keeps BOTH usable!
  assert.equal(buyPart(camp, "aux_repair").ok, true);
  assert.equal(equipPart(camp, "guns_torp_deck").ok, true);
  const dualStats = computeShipStats(camp);
  assert.equal(dualStats.torpCount, 2, "Torpedo Conversion must keep 2 torps even with Repair");
  assert.equal(dualStats.special.id, "repair");
  assert.equal(dualStats.hasDualSpecial, true);
  assert.ok(dualStats.torpCd > 0 && dualStats.torpCd < 6);

  const dualBattle = createBattle(camp, generateDispatches(camp)[0]);
  dualBattle.player.hp = 4;
  dualBattle.player.ang = -Math.PI * 0.5;
  assert.equal(triggerInstantSpecial(dualBattle).ok, true, "Repair Party must still trigger");
  assert.equal(dualBattle.player.hp, 6);
  assert.equal(
    launchPlayerTorpedoes(dualBattle, dualBattle.player.x + 120, dualBattle.player.y).ok,
    true,
    "Torpedo launch must remain independently ready even right after using Repair!",
  );

  // Swapping back to already-owned part is free!
  assert.equal(equipPart(camp, "guns_broadside").ok, true);
  assert.equal(computeShipStats(camp).sternGuns, 2);
});

test("Option A Escaped With Injuries: retreat knocks upgrades offline until repaired at ~45% cost", () => {
  const camp = createCampaign(77);
  camp.gold = 30;
  assert.equal(buyPart(camp, "hull_ironclad").ok, true);
  assert.equal(buyPart(camp, "aux_torp2").ok, true);
  assert.equal(computeShipStats(camp).maxHp, 10);
  assert.equal(computeShipStats(camp).torpCount, 2);

  // Defeat -> 1 equipped non-starter part gets DAMAGED IN RETREAT
  const ret = applyRetreatDamage(camp, 123);
  assert.equal(ret.damagedIds.length, 1);
  const brokenId = ret.damagedIds[0];
  assert.equal(camp.damagedParts[brokenId], true);

  // Damaged part goes OFFLINE (falls back to starter stats until repaired!)
  const afterDmg = computeShipStats(camp);
  if (brokenId === "hull_ironclad") assert.equal(afterDmg.maxHp, 6);
  if (brokenId === "aux_torp2") assert.equal(afterDmg.torpCount, 0);

  // Repair restores it for ~40–45% cost
  const cost = PART_BY_ID[brokenId].repairCost;
  assert.ok(cost > 0 && cost < PART_BY_ID[brokenId].cost * 0.6);
  camp.gold = cost;
  assert.equal(repairPart(camp, brokenId).ok, true);
  assert.equal(Boolean(camp.damagedParts[brokenId]), false);
  assert.equal(computeShipStats(camp).maxHp, 10);
  assert.equal(computeShipStats(camp).torpCount, 2);

  // Armored Bulkheads absorbs 1 retreat damage hit!
  camp.gold = 50;
  camp.maxUnlockedTheater = 2;
  assert.equal(buyPart(camp, "sys_bulkheads").ok, true);
  const ret2 = applyRetreatDamage(camp, 456);
  assert.equal(ret2.protectedByBulkhead, true);
  assert.equal(ret2.damagedIds.length, 0);

  // Save roundtrip (SAVE_V = 6)
  const restored = sanitizeCampaign(JSON.parse(JSON.stringify(camp)));
  assert.equal(restored.ownedParts.hull_ironclad, true);
  assert.equal(restored.equipped.sys, "sys_bulkheads");
});

test("Heavy Rudder Inertia, Bow-Only Ricochet, Uncapped Salvos, Broadside Torp Arcs & Throttle", () => {
  const camp = createCampaign(42);
  camp.gold = 40;
  buyPart(camp, "hull_ironclad");
  buyPart(camp, "guns_broadside");
  buyPart(camp, "aux_torp2");

  const dispatches = generateDispatches(camp);
  assert.equal(dispatches.length, 3);
  const battle = createBattle(camp, dispatches[2]); // Battleship + Destroyer!
  const bb = battle.enemies.find((e) => e.typeId === "battleship");
  assert.ok(bb);

  // 1. Heavy Rudder Inertia (< 10° in 0.15s)
  const startAng = battle.player.ang;
  setPlayerWaypoint(battle, battle.player.x + 120, battle.player.y);
  for (let i = 0; i < 3; i++) stepBattle(battle, 0.05);
  const deltaDeg = (Math.abs(wrapAngle(battle.player.ang - startAng)) * 180) / Math.PI;
  assert.ok(deltaDeg > 0.4 && deltaDeg < 10, `Expected smooth turn, got ${deltaDeg.toFixed(1)}°`);

  // 2. Turret Arcs: Bow-in bears 2 Bow Guns; Broadside bears all 4 Guns!
  battle.player.ang = -Math.PI * 0.5;
  assert.equal(
    getBearingTurrets(battle.player, battle.stats, battle.player.x, battle.player.y - 120).guns,
    2,
  );
  assert.equal(
    getBearingTurrets(battle.player, battle.stats, battle.player.x + 120, battle.player.y).guns,
    4,
  );

  // 3. Bow-Only AP Ricochet vs Stern Penetration vs Uncapped Multi-Shell Broadside Citadels!
  bb.ang = Math.PI * 0.5; // Facing South
  const startHp = bb.hp;
  // Shell flying North (-PI/2) strikes BB's armored BOW -> RICOCHET (0 dmg)!
  assert.equal(
    resolveShellHit(battle, { ammo: "ap", ang: -Math.PI * 0.5 + 0.2, salvoId: "s1" }, bb, false)
      .result,
    "ricochet",
  );
  assert.equal(bb.hp, startHp);

  // Shell flying South (+PI/2) chases BB into its flat unarmored STERN -> PEN (never ricochets!)
  assert.equal(
    resolveShellHit(battle, { ammo: "ap", ang: Math.PI * 0.5 + 0.2, salvoId: "s1b" }, bb, false)
      .result,
    "pen",
  );
  assert.equal(bb.hp, startHp - 1);

  // HE cracks angled bow (1 dmg)
  assert.equal(
    resolveShellHit(battle, { ammo: "he", ang: -Math.PI * 0.5 + 0.2, salvoId: "s2" }, bb, false)
      .result,
    "he",
  );
  assert.equal(bb.hp, startHp - 2);

  // Uncapped Multi-Shell Salvo: 3 AP shells from the SAME salvoId into flat broadside deal 6 dmg!
  bb.ang = 0; // Facing East
  for (let k = 0; k < 3; k++) {
    const res = resolveShellHit(
      battle,
      { ammo: "ap", ang: -Math.PI * 0.5, salvoId: "s_multi" },
      bb,
      false,
    );
    assert.equal(res.result, "citadel");
    assert.equal(res.dmg, 2);
  }
  assert.equal(bb.hp, startHp - 8, "Every shell in a broadside salvo must deal uncapped damage");

  // 4. Broadside Torpedo Launch Arcs: dead-ahead blocked, side launch succeeds!
  battle.player.ang = -Math.PI * 0.5; // Facing North
  assert.equal(
    launchPlayerTorpedoes(battle, battle.player.x, battle.player.y - 120).reason,
    "no_arc",
    "Torpedoes cannot fire dead-ahead through your armored bow",
  );
  assert.equal(
    launchPlayerTorpedoes(battle, battle.player.x + 120, battle.player.y).ok,
    true,
    "Torpedoes must launch cleanly from starboard broadside tubes",
  );
  assert.equal(togglePlayerAmmo(battle), "he");
  assert.equal(cyclePlayerThrottle(battle), 0); // FULL -> STOP
  assert.equal(cyclePlayerThrottle(battle), 2); // STOP -> FULL

  const isl = battle.islands[0];
  const angToIsl = Math.atan2(isl.y - battle.player.y, isl.x - battle.player.x);
  assert.equal(
    raycastIslandDist(battle.player.x, battle.player.y, angToIsl, 240, battle.islands).blocked,
    true,
  );

  // Incoming AP shell heading South (+PI/2) toward player:
  battle.shells.push({
    friendly: false,
    ammo: "ap",
    ang: Math.PI * 0.5,
    tx: battle.player.x,
    ty: battle.player.y,
    x: battle.player.x,
    y: battle.player.y - 60,
    t: 0.2,
    duration: 0.8,
  });
  battle.player.ang = -Math.PI * 0.5; // Bow facing North into shell -> SAFE!
  assert.equal(getIncomingArmorStatus(battle)?.status, "safe");
  battle.player.ang = Math.PI * 0.5; // Running away South (stern exposed!) -> NOT safe!
  assert.equal(getIncomingArmorStatus(battle)?.status, "caution");
  battle.player.ang = 0; // Flat broadside -> DANGER!
  assert.equal(getIncomingArmorStatus(battle)?.status, "danger");

  // 5. Dynamic Hold-to-Settle Dispersion & Lock-On Fire-Control Bonus:
  // Whipping aim fast expands dispersion; holding steady shrinks it; locked target settles faster & tighter!
  let bloom = AIM_BLOOM_START;
  bloom = stepAimBloom(bloom, 280, false, 0.25);
  assert.ok(bloom > AIM_BLOOM_START, "Moving aim quickly must enlarge dispersion circle");

  let freeSettle = AIM_BLOOM_START;
  let lockSettle = AIM_BLOOM_START;
  for (let i = 0; i < 12; i++) {
    freeSettle = stepAimBloom(freeSettle, 0, false, 0.05);
    lockSettle = stepAimBloom(lockSettle, 40, true, 0.05); // calm tracking on locked ship still settles!
  }
  assert.ok(freeSettle < AIM_BLOOM_START, "Holding steady must tighten dispersion");
  assert.ok(
    lockSettle < freeSettle,
    "Locked target must settle faster even while tracking ship motion",
  );

  for (let i = 0; i < 40; i++) {
    freeSettle = stepAimBloom(freeSettle, 0, false, 0.05);
    lockSettle = stepAimBloom(lockSettle, 0, true, 0.05);
  }
  assert.equal(freeSettle, AIM_FLOOR_FREE);
  assert.equal(lockSettle, AIM_FLOOR_LOCKED);
  assert.ok(
    getSalvoMetrics(battle, bb.x, bb.y, lockSettle).spreadR <
      getSalvoMetrics(battle, bb.x, bb.y, AIM_BLOOM_START).spreadR * 0.6,
    "Settled locked aim must noticeably tighten actual salvo dispersion radius",
  );
  battle.lockedEnemyId = bb.uid;
  assert.equal(isAimOnLockedEnemy(battle, bb.x, bb.y), true);
});

test("Handcrafted Encounter Arenas: all 6 arenas valid & Sea-Fog Banks grant stealth", () => {
  const keys = Object.keys(ARENAS);
  assert.equal(keys.length, 6);
  const camp = createCampaign(88);

  for (const k of keys) {
    const a = ARENAS[k];
    assert.ok(a.landforms.length >= 2, `${k} must have sculpted landforms`);
    assert.ok(a.islands.length >= 2, `${k} must have collision islands`);
    // Ensure player spawn (180, 448) is completely clear of every landmass
    for (const isl of a.islands) {
      assert.ok(
        Math.hypot(180 - isl.x, 448 - isl.y) > isl.r + 45,
        `${k} spawn must be clear of island`,
      );
    }
  }

  // Verify Foggy Shipping Lane fog bank grants player.hidden stealth!
  const fogArena = ARENAS.shipping_lane;
  const fogBattle = createBattle(camp, {
    id: "test_fog",
    theater: 1,
    seed: 12,
    name: "Fog Test",
    roster: ["cruiser"],
    ...fogArena,
  });
  const fog = fogBattle.fogZones[0];
  fogBattle.player.x = fog.x;
  fogBattle.player.y = fog.y;
  fogBattle.enemies[0].x = fog.x + 120;
  fogBattle.enemies[0].y = fog.y - 120;
  stepBattle(fogBattle, 0.05);
  assert.equal(fogBattle.player.hidden, true, "Sailing inside a Sea-Fog Bank must conceal player");

  // Symmetric Fog Concealment: enemy sailing into fog becomes hidden & cannot be locked!
  const foe = fogBattle.enemies[0];
  fogBattle.player.x = 280;
  fogBattle.player.y = 420;
  foe.x = fog.x;
  foe.y = fog.y;
  foe.gunBloom = 0;
  stepBattle(fogBattle, 0.05);
  assert.equal(foe.hidden, true, "Enemy inside fog bank must also be concealed symmetrically");
  assert.equal(getLockedEnemy(fogBattle), undefined, "Cannot auto-lock an enemy hidden in fog");

  // Proximity spotting & solid hull separation: ships never ghost through each other even in fog!
  fogBattle.player.x = fog.x;
  fogBattle.player.y = fog.y;
  foe.x = fogBattle.player.x + 6;
  foe.y = fogBattle.player.y;
  stepBattle(fogBattle, 0.05);
  assert.equal(fogBattle.player.hidden, false, "Point-blank enemy spots player through fog");
  assert.equal(foe.hidden, false, "Point-blank player spots enemy through fog");
  assert.ok(
    Math.hypot(fogBattle.player.x - foe.x, fogBattle.player.y - foe.y) >=
      fogBattle.player.radius + foe.radius,
    "Ships must separate solidly and never pass through each other",
  );

  // Angle-aware Bow-into-Broadside Ramming & Strengthened Hull Armor:
  // Player heading North (-PI/2) slams bow-first into Enemy sailing East (0) broadside!
  const pRam = { x: 180, y: 210, ang: -Math.PI * 0.5 };
  const eBroad = { x: 180, y: 190, ang: 0, heavyArmor: false };
  const unarmoredTbone = computeRamDamage(pRam, eBroad, false);
  assert.equal(unarmoredTbone.enemyDmg, 4, "Broadside ship takes 4 dmg from bow T-bone ram");
  assert.equal(unarmoredTbone.playerDmg, 2, "Unarmored bow rammer still takes 2 dmg");
  assert.equal(unarmoredTbone.tbone, true);

  const armoredTbone = computeRamDamage(pRam, eBroad, true);
  assert.equal(armoredTbone.enemyDmg, 4, "Strengthened hull deals 4 dmg on bow T-bone");
  assert.equal(armoredTbone.playerDmg, 0, "Strengthened hull takes 0 dmg when ramming bow-first");

  // Symmetric reverse: armored enemy Battleship bow-rams into player's flat broadside!
  const pBroad = { x: 180, y: 210, ang: 0 };
  const eRam = { x: 180, y: 190, ang: Math.PI * 0.5, heavyArmor: true };
  const revTbone = computeRamDamage(pBroad, eRam, false);
  assert.equal(revTbone.playerDmg, 4, "Player taking a bow ram to the side takes 4 dmg");
  assert.equal(revTbone.enemyDmg, 0, "Heavy armored Battleship takes 0 dmg when bow-ramming");

  // Gold Convoy on Foggy Shipping Lane: must spawn at full 6/6 HP (clear of mines) and escape across top line!
  const convBattle = createBattle(camp, {
    id: "test_convoy",
    theater: 1,
    seed: 55,
    name: "Convoy Test",
    nodeType: "convoy",
    roster: ["convoy"],
    ...ARENAS.shipping_lane,
  });
  convBattle.player.throttle = 0;
  convBattle.player.spd = 0;
  const convoy = convBattle.enemies.find((e) => e.typeId === "convoy");
  assert.ok(convoy);
  assert.equal(convoy.hp, 6, "Gold Convoy must start at full 6 HP");
  stepBattle(convBattle, 0.05);
  assert.equal(convoy.hp, 6, "Gold Convoy must not spawn on top of a naval mine");

  let escapedEvent = false;
  for (let i = 0; i < 400 && convoy.hp > 0; i++) {
    stepBattle(convBattle, 0.05);
    if (convBattle.events.some((ev) => ev.type === "convoy_escaped")) escapedEvent = true;
  }
  assert.equal(
    convoy.escaped,
    true,
    "Gold Convoy must cross the top escape line instead of turning around",
  );
  assert.equal(escapedEvent, true, "Gold Convoy escape must emit convoy_escaped event");
  assert.equal(convBattle.goldCollected, 0, "Escaped Gold Convoy must award 0 bounty gold");
});

function runCampaignSim(seed, mode) {
  const camp = createCampaign(seed);
  const buyOrder = [
    "aux_torp2",
    "hull_ironclad",
    "guns_broadside",
    "sys_rangefinder",
    "hull_dreadnought",
    "aux_long_lance",
    "guns_ap_rifles",
  ];

  for (let step = 0; step < 12; step++) {
    // Drydock shopping / repairs for tactical captain
    if (mode === "tactical") {
      for (const pid of Object.keys(camp.damagedParts)) {
        if (camp.damagedParts[pid]) repairPart(camp, pid);
      }
      for (const pid of buyOrder) {
        if (!camp.ownedParts[pid]) buyPart(camp, pid);
      }
    }

    const dispatches = generateDispatches(camp);
    const stats = computeShipStats(camp);
    // Pick dispatch matched to current ship strength
    let d = dispatches[0];
    if (mode === "tactical") {
      if (dispatches[2].isBoss && stats.maxHp >= 10 && stats.torpCount >= 2) d = dispatches[2];
      else if (stats.maxHp >= 10) d = dispatches[1];
    } else {
      d = dispatches[Math.min(2, step)]; // Naive rushes harder contracts without tactics!
    }

    const b = createBattle(camp, d);
    let t = 0;
    while (b.outcome === "ongoing" && t < 110) {
      t += 0.05;
      const live = b.enemies.filter((e) => e.hp > 0);
      const tgt =
        live.find(
          (e) => e.typeId === "fireship" && Math.hypot(e.x - b.player.x, e.y - b.player.y) < 160,
        ) ||
        live.find((e) => e.treasure) ||
        live.sort(
          (a, c) =>
            Math.hypot(a.x - b.player.x, a.y - b.player.y) -
            Math.hypot(c.x - b.player.x, c.y - b.player.y),
        )[0];

      if (mode === "naive" && tgt) {
        setPlayerWaypoint(b, b.player.x > 180 ? 70 : 290, 380);
        b.player.ammo = "ap";
        if (b.player.reloadTimer <= 0) firePlayerSalvo(b, tgt.x, tgt.y);
      } else if (tgt) {
        const incomingShell = b.shells.find(
          (s) => !s.friendly && Math.hypot(s.tx - b.player.x, s.ty - b.player.y) < 38,
        );
        const incomingTorp = b.torpedoes.find(
          (tp) => !tp.friendly && Math.hypot(tp.x - b.player.x, tp.y - b.player.y) < 95,
        );
        const dist = Math.hypot(tgt.x - b.player.x, tgt.y - b.player.y);
        const angToTgt = Math.atan2(tgt.y - b.player.y, tgt.x - b.player.x);

        if (incomingTorp) {
          b.player.throttle = 2;
          setPlayerWaypoint(
            b,
            b.player.x + Math.cos(incomingTorp.ang) * 90,
            b.player.y + Math.sin(incomingTorp.ang) * 90,
          );
        } else if (incomingShell) {
          b.player.throttle = 0;
          const shellFrom = wrapAngle(incomingShell.ang + Math.PI);
          setPlayerWaypoint(
            b,
            b.player.x + Math.cos(shellFrom) * 85,
            b.player.y + Math.sin(shellFrom) * 85,
          );
        } else if (
          b.player.reloadTimer < 0.7 ||
          (b.player.specialCd <= 0.3 && b.stats.torpCount > 0 && dist < 215)
        ) {
          b.player.throttle = 2;
          const broadA = wrapAngle(angToTgt + (b.player.x > 180 ? -1.1 : 1.1));
          setPlayerWaypoint(
            b,
            b.player.x + Math.cos(broadA) * 90,
            b.player.y + Math.sin(broadA) * 90,
          );
        } else {
          b.player.throttle = 2;
          const angleA = wrapAngle(angToTgt + (b.player.x > 180 ? -0.42 : 0.42));
          setPlayerWaypoint(
            b,
            b.player.x + Math.cos(angleA) * 90,
            b.player.y + Math.sin(angleA) * 90,
          );
        }

        if (b.player.specialCd <= 0 && b.stats.torpCount > 0 && dist < 215 && !tgt.stationary) {
          const leadT = dist / b.stats.torpSpeed;
          const tx = tgt.x + Math.cos(tgt.ang) * tgt.spd * leadT * 0.75;
          const ty = tgt.y + Math.sin(tgt.ang) * tgt.spd * leadT * 0.75;
          const tAng = Math.atan2(ty - b.player.y, tx - b.player.x);
          if (
            canLaunchTorpedoAt(b.player, tx, ty).inArc &&
            !raycastIslandDist(b.player.x, b.player.y, tAng, dist, b.islands).blocked
          ) {
            launchPlayerTorpedoes(b, tx, ty);
          }
        }

        if (b.player.reloadTimer <= 0) {
          const flightT = Math.min(1.8, Math.max(0.38, dist / SHELL_SPEED));
          const leadX = tgt.x + Math.cos(tgt.ang) * tgt.spd * flightT;
          const leadY = tgt.y + Math.sin(tgt.ang) * tgt.spd * flightT;
          const shotAng = Math.atan2(leadY - b.player.y, leadX - b.player.x);
          const rel = wrapAngle(shotAng - tgt.ang);
          const sinImp = Math.abs(Math.sin(rel));
          const hitBow = Math.cos(rel) < 0;
          b.player.ammo =
            tgt.stationary || (hitBow && sinImp < tgt.ricochetSin + 0.08) ? "he" : "ap";
          firePlayerSalvo(b, leadX, leadY);
        }
      }
      stepBattle(b, 0.05);
    }

    if (b.outcome === "won") {
      const winRes = recordBattleWin(camp, d, b);
      if (winRes.unlockedTheater) camp.theater = winRes.unlockedTheater;
    } else {
      applyRetreatDamage(camp, b.seed);
    }
  }
  return camp;
}

test("Anti-Candy-Land Campaign Balance Gate: Naive broadside sailors stall while Tactical builders unlock Theaters", () => {
  let naiveT2 = 0;
  let naiveAvgWins = 0;
  let tactT2 = 0;
  let tactAvgWins = 0;

  const N = 10;
  for (let i = 1; i <= N; i++) {
    const n = runCampaignSim(5000 + i * 71, "naive");
    const t = runCampaignSim(5000 + i * 71, "tactical");
    if (n.maxUnlockedTheater >= 2) naiveT2++;
    if (t.maxUnlockedTheater >= 2) tactT2++;
    naiveAvgWins += n.totalWins;
    tactAvgWins += t.totalWins;
  }

  naiveAvgWins /= N;
  tactAvgWins /= N;

  assert.equal(
    naiveT2,
    0,
    `Naive sailor must NEVER beat Theater 1 Flagship (got ${naiveT2}/${N}, avg wins ${naiveAvgWins.toFixed(1)})`,
  );
  assert.ok(
    tactT2 >= 7 && tactAvgWins >= naiveAvgWins * 2.5,
    `Tactical captain must build up ship & unlock Theater 2 (tact unlocked ${tactT2}/${N}, avg wins ${tactAvgWins.toFixed(1)} vs naive ${naiveAvgWins.toFixed(1)})`,
  );
});
