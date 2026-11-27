/**
 * Live Slow-Moving Naval Combat Engine for Broadside! (Pocket World of Warships).
 *
 * Real-time heavy naval physics inside a single visible 360 × 520 sea strait:
 * - Slow, deliberate speeds (20–42 px/s) with realistic rudder-shift inertia
 *   and engine telegraph (FULL / HALF / STOP) — zero twitchy arcade jumpiness.
 * - Authentic Armor Angling: AP shells RICOCHET (0 dmg, *CLANG!*) off sloped
 *   bows/sterns and deal devastating CITADELS (-2♥) into flat broadsides.
 *   HE shells crack angled armor (-1♥) and ignite Deck Fires.
 * - Bow & Stern Turret Arcs: Bow-in protects your citadel (half guns); swinging
 *   broadside brings all turrets to bear (full salvo, exposed citadel!).
 * - Ballistic Shell Flight Time (0.5–1.6s): Lead moving ships, dodge incoming
 *   salvos by braking or angling bow-in, and launch slow Torpedo spreads that
 *   force enemy Battleships to turn flat broadside!
 */

import { ENEMY_TYPES } from "./content.js";
import { computeShipStats } from "./campaign.js";
import { createRng, hashSeed } from "./rng.js";

export const ARENA_W = 360;
export const ARENA_H = 520;
export const MARGIN = 18;
export const SHELL_SPEED = 175; // px/s horizontal flight speed -> 0.8s–1.6s real lead time!
export const TORP_SPEED = 62;

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
export const lerp = (a, b, t) => a + (b - a) * t;

export function wrapAngle(a) {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

export function angleDiff(a, b) {
  return Math.abs(wrapAngle(a - b));
}

/**
 * Check if an island blocks line-of-sight between two points.
 */
export function hasLineOfSight(x1, y1, x2, y2, islands) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return true;
  const ux = dx / dist;
  const uy = dy / dist;
  for (const isl of islands) {
    if (isl.fortIsland) continue;
    const ocx = isl.x - x1;
    const ocy = isl.y - y1;
    const proj = ocx * ux + ocy * uy;
    if (proj > 4 && proj < dist - 4) {
      const p2 = ocx * ocx + ocy * ocy - proj * proj;
      const r = isl.r * 0.96;
      if (p2 < r * r) return false;
    }
  }
  return true;
}

/**
 * Raycast a water-level line (e.g. torpedo lane) against island shorelines.
 * Returns { dist, blocked } where dist <= maxDist.
 */
export function raycastIslandDist(x, y, ang, maxDist, islands) {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  let best = maxDist;
  let blocked = false;
  for (const isl of islands) {
    if (isl.fortIsland) continue;
    const r = isl.r + 2;
    const ocx = isl.x - x;
    const ocy = isl.y - y;
    const proj = ocx * ux + ocy * uy;
    if (proj < 0) continue;
    const d2 = ocx * ocx + ocy * ocy - proj * proj;
    if (d2 >= r * r) continue;
    const hitDist = proj - Math.sqrt(r * r - d2);
    if (hitDist > 4 && hitDist < best) {
      best = hitDist;
      blocked = true;
    }
  }
  return { dist: best, blocked };
}

export const TORP_ARC_COS = 0.766; // Broadside torpedo launch arcs: 40°–140° port & starboard!

/**
 * Determine whether a ship's side-mounted torpedo tubes can bear on (tx, ty).
 * Torpedoes launch from Port or Starboard broadside arcs (40°–140° off the bow),
 * never straight through your armored bow or rudder stern!
 */
export function canLaunchTorpedoAt(ship, tx, ty) {
  const aimAngle = Math.atan2(ty - ship.y, tx - ship.x);
  const rel = wrapAngle(aimAngle - ship.ang);
  const inArc = Math.abs(Math.cos(rel)) <= TORP_ARC_COS;
  return {
    inArc,
    aimAngle,
    side: Math.sin(rel) >= 0 ? "starboard" : "port",
  };
}

/**
 * Determine which turrets (bow / stern) can bear on a target coordinate!
 * Bow-in protects your citadel (bow guns only); broadside brings ALL guns to bear!
 */
export function getBearingTurrets(player, stats, tx, ty) {
  const angTo = Math.atan2(ty - player.y, tx - player.x);
  const rel = wrapAngle(angTo - player.ang);
  const cosR = Math.cos(rel);
  const bowCan = cosR > -0.66; // forward ±131°
  const sternCan = cosR < 0.66; // aft ±131°
  const guns = (bowCan ? stats.bowGuns : 0) + (sternCan ? stats.sternGuns : 0);
  return {
    bowCan,
    sternCan,
    guns,
    fullBroadside: bowCan && sternCan,
    aimAngle: angTo,
  };
}

export const AIM_BLOOM_START = 1.18;
export const AIM_BLOOM_MAX = 1.38;
export const AIM_FLOOR_FREE = 0.78;
export const AIM_FLOOR_LOCKED = 0.62;

/**
 * Check whether the player's reticle (tx, ty) is tracking the currently locked enemy
 * (either its hull or its predicted ballistic lead point).
 */
export function isAimOnLockedEnemy(battle, tx, ty) {
  const locked = getLockedEnemy(battle);
  if (!locked) return false;
  const dist = Math.hypot(locked.x - battle.player.x, locked.y - battle.player.y);
  const flightT = clamp(dist / SHELL_SPEED, 0.38, 1.85);
  const leadX = locked.x + Math.cos(locked.ang) * locked.spd * flightT;
  const leadY = locked.y + Math.sin(locked.ang) * locked.spd * flightT;
  const tol = locked.radius + 68;
  return (
    Math.hypot(tx - locked.x, ty - locked.y) <= tol || Math.hypot(tx - leadX, ty - leadY) <= tol
  );
}

/**
 * Dynamic Fire-Control Settling & Turret Slew Bloom:
 * - Whipping aim rapidly enlarges dispersion up to AIM_BLOOM_MAX (1.38x).
 * - Holding steady (or calmly tracking a moving target) shrinks dispersion cleanly!
 * - Tracking your LOCKED target settles ~1.7x faster and tightens all the way to 0.62x (vs 0.78x unlocked).
 */
export function stepAimBloom(currentBloom, moveSpeedPxPerSec, onLocked, dt) {
  const floor = onLocked ? AIM_FLOOR_LOCKED : AIM_FLOOR_FREE;
  const deadSpeed = onLocked ? 58 : 42; // Forgives calm tracking of a moving ship without blooming!
  if (moveSpeedPxPerSec > deadSpeed) {
    const bloomRate = ((moveSpeedPxPerSec - deadSpeed) / 165) * 1.15;
    return clamp(currentBloom + bloomRate * dt, floor, AIM_BLOOM_MAX);
  }
  const settleRate = onLocked ? 0.62 : 0.36;
  return Math.max(floor, currentBloom - settleRate * dt);
}

/**
 * Compute shell flight time & dispersion radius to a target coordinate.
 */
export function getSalvoMetrics(battle, tx, ty, spreadMult = 1) {
  const { player, stats } = battle;
  const dist = Math.hypot(tx - player.x, ty - player.y);
  const flightTime = clamp(dist / SHELL_SPEED, 0.38, 1.85);
  const spreadR = (stats.dispersion + dist * 0.032) * clamp(spreadMult, 0.55, 1.5);
  const bearing = getBearingTurrets(player, stats, tx, ty);
  return { dist, flightTime, spreadR, bearing };
}

/**
 * Live armor-angle status against incoming enemy AP shells (or nearest charging enemy):
 * returns "safe" (armored bow angled to bounce!), "danger" (flat broadside!), or "caution".
 */
export function getIncomingArmorStatus(battle) {
  const { player } = battle;
  let threatAng = null;

  const incoming = battle.shells.find(
    (s) => !s.friendly && s.ammo === "ap" && Math.hypot(s.tx - player.x, s.ty - player.y) < 58,
  );
  if (incoming) {
    threatAng = incoming.ang;
  } else {
    const charging = battle.enemies.find(
      (e) =>
        e.hp > 0 &&
        e.guns > 0 &&
        !e.stationary &&
        e.reloadTimer < 1.1 &&
        Math.hypot(e.x - player.x, e.y - player.y) <= e.range + 20,
    );
    if (charging) {
      threatAng = Math.atan2(player.y - charging.y, player.x - charging.x);
    }
  }

  if (threatAng === null) return null;
  const rel = wrapAngle(threatAng - player.ang);
  const sinImp = Math.abs(Math.sin(rel));
  const facingBow = Math.cos(rel) < 0; // Shell flying against our heading -> hits armored BOW!
  if (facingBow && sinImp < player.ricochetSin) return { status: "safe", threatAng };
  if (sinImp >= 0.74) return { status: "danger", threatAng };
  return { status: "caution", threatAng };
}

function makeEnemy(typeId, x, y, ang, act, rng) {
  const def = ENEMY_TYPES[typeId] || ENEMY_TYPES.cruiser;
  const hpBonus = act >= 3 && def.hp >= 8 && !def.boss ? 2 : 0;
  const hp = def.hp + hpBonus;

  return {
    uid: `e_${rng.int(10000, 999999)}`,
    typeId: def.id,
    name: def.name,
    icon: def.icon,
    x,
    y,
    ang,
    rudder: 0,
    spd: def.speed * 0.8,
    maxSpeed: def.speed * (1 + (act - 1) * 0.05),
    turnRate: def.turnRate,
    hp,
    maxHp: hp,
    reload: def.reload,
    reloadTimer: rng.range(1.6, def.reload),
    guns: def.guns,
    range: def.range,
    ricochetSin: def.ricochetSin,
    torpCd: def.torpCd ? rng.range(3.5, def.torpCd) : 0,
    baseTorpCd: def.torpCd || 0,
    torpCount: def.torpCount || 0,
    radius: def.radius,
    gold: def.gold,
    hullColor: def.hullColor,
    deckColor: def.deckColor,
    heavyArmor: Boolean(def.heavyArmor),
    explodesOnDeath: Boolean(def.explodesOnDeath),
    stationary: Boolean(def.stationary),
    treasure: Boolean(def.treasure),
    boss: Boolean(def.boss),
    ai: def.ai,
    turretAng: ang,
    fireTimer: 0, // deck fire countdown -> 2 dmg when it ticks!
    hidden: false,
    gunBloom: 0,
    orbitDir: rng.chance(0.5) ? 1 : -1,
    enraged: false,
  };
}

/**
 * Create a live single-screen World of Warships naval skirmish from a Bridge Dispatch.
 */
export function createBattle(campaign, dispatch) {
  const act = dispatch.theater || campaign.theater || 1;
  const seed = hashSeed(`wows-v6:${campaign.seed}:${dispatch.id}:${dispatch.seed}`);
  const rng = createRng(seed);
  const stats = computeShipStats(campaign);

  const px = ARENA_W * 0.5;
  const py = ARENA_H - 72;

  const player = {
    x: px,
    y: py,
    ang: -Math.PI * 0.5,
    rudder: 0, // smooth [-1..1]
    spd: stats.speed * 0.7,
    throttle: 2, // 0 = STOP, 2 = FULL
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    radius: stats.hull.radius,
    ricochetSin: stats.ricochetSin,
    ammo: "ap", // "ap" | "he"
    reloadTimer: 0,
    specialCd: 0,
    torpCd: 0,
    turretAng: -Math.PI * 0.5,
    fireTimer: 0,
    hidden: false,
    gunBloom: 0,
    waypoint: null, // { x, y }
  };

  // Use the exact handcrafted terrain previewed on the Bridge Dispatch mini-map!
  const islands = (dispatch.islands || []).map((isl) => ({ ...isl }));
  const landforms = dispatch.landforms || [];
  const piers = dispatch.piers || [];
  const lighthouses = dispatch.lighthouses || [];
  const buoys = dispatch.buoys || [];
  const fogZones = (dispatch.fogZones || []).map((f) => ({ ...f }));
  const weather = dispatch.weather || "clear";
  const mines = (dispatch.mines || []).map((m, idx) => ({
    id: m.id || `m_${idx}`,
    x: m.x,
    y: m.y,
    alive: true,
  }));
  const enemies = [];
  const smokes = [];

  const roster = dispatch.roster && dispatch.roster.length ? dispatch.roster : ["patrol_boat"];
  const fortIsl = islands.find((isl) => isl.fortIsland) || islands[0];
  const mobileSlots = roster.filter(
    (id) =>
      id !== "fort" &&
      id !== "convoy" &&
      id !== "boss_ironclad" &&
      id !== "boss_dreadnought" &&
      id !== "twin_scharn" &&
      id !== "twin_gneis",
  );
  let mIdx = 0;

  roster.forEach((typeId) => {
    if (typeId === "fort" && fortIsl) {
      enemies.push(makeEnemy("fort", fortIsl.x, fortIsl.y, Math.PI * 0.5, act, rng));
      return;
    }
    if (typeId === "convoy") {
      enemies.push(makeEnemy("convoy", ARENA_W * 0.5, 295, -Math.PI * 0.5, act, rng));
      return;
    }
    if (typeId === "boss_ironclad" || typeId === "boss_dreadnought") {
      enemies.push(makeEnemy(typeId, ARENA_W * 0.5, 96, 0.08, act, rng));
      return;
    }
    if (typeId === "twin_scharn" || typeId === "twin_gneis") {
      const left = typeId === "twin_scharn";
      enemies.push(
        makeEnemy(typeId, left ? 96 : ARENA_W - 96, 118, left ? 0.35 : Math.PI - 0.35, act, rng),
      );
      return;
    }

    const frac = mobileSlots.length <= 1 ? 0.5 : mIdx / (mobileSlots.length - 1);
    mIdx++;
    let ex = lerp(78, ARENA_W - 78, frac) + rng.range(-14, 14);
    let ey = 92 + (mIdx % 2) * 38 + rng.range(-8, 12);
    for (let pass = 0; pass < 2; pass++) {
      for (const isl of islands) {
        const d = Math.hypot(ex - isl.x, ey - isl.y);
        if (d < isl.r + 40) {
          const aOut = Math.atan2(ey - isl.y, ex - isl.x);
          ex = clamp(isl.x + Math.cos(aOut) * (isl.r + 44), 48, ARENA_W - 48);
          ey = clamp(isl.y + Math.sin(aOut) * (isl.r + 44), 54, 210);
        }
      }
    }
    const startAng =
      typeId === "fireship" ? Math.atan2(py - ey, px - ex) : frac < 0.5 ? 0.2 : Math.PI - 0.2;
    enemies.push(makeEnemy(typeId, ex, ey, startAng, act, rng));
  });

  return {
    seed,
    rngState: seed ^ 0x5f3759df,
    act,
    dispatch,
    nodeId: dispatch.id,
    nodeType: dispatch.nodeType || "skirmish",
    nodeName: dispatch.name,
    tutorial: Boolean(dispatch.tutorial),
    stats,
    elapsed: 0,
    salvoSeq: 0,
    player,
    lockedEnemyId: enemies[0]?.uid || null,
    islands,
    landforms,
    piers,
    lighthouses,
    buoys,
    fogZones,
    weather,
    mines,
    smokes,
    enemies,
    shells: [], // arcing ballistic shells in flight
    queuedShells: [],
    torpedoes: [], // slow underwater torpedoes
    events: [],
    goldCollected: 0,
    shipsSunk: 0,
    citadels: 0,
    bounces: 0,
    shotsFired: 0,
    outcome: "ongoing",
    victoryDelay: 0,
  };
}

function nextBattleRand(battle) {
  let t = (battle.rngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// --- Player Commands (100% One-Thumb Friendly!) -----------------------------

export function setPlayerWaypoint(battle, x, y) {
  battle.player.waypoint = {
    x: clamp(x, MARGIN + 10, ARENA_W - MARGIN - 10),
    y: clamp(y, MARGIN + 10, ARENA_H - MARGIN - 10),
  };
  if (battle.player.throttle === 0) battle.player.throttle = 2;
}

export function cyclePlayerThrottle(battle) {
  // Clean 2-state toggle between FULL (2) and STOP (0): 1 tap brakes, 1 tap resumes full steam!
  const p = battle.player;
  p.throttle = p.throttle > 0 ? 0 : 2;
  return p.throttle;
}

export function togglePlayerAmmo(battle) {
  battle.player.ammo = battle.player.ammo === "ap" ? "he" : "ap";
  return battle.player.ammo;
}

export function lockTargetEnemy(battle, uid) {
  battle.lockedEnemyId = uid;
}

export function getLockedEnemy(battle) {
  let tgt = battle.enemies.find((e) => e.uid === battle.lockedEnemyId && e.hp > 0 && !e.hidden);
  if (!tgt) {
    let bestD = Infinity;
    for (const e of battle.enemies) {
      if (e.hp <= 0 || e.hidden) continue;
      const d = Math.hypot(e.x - battle.player.x, e.y - battle.player.y);
      if (d < bestD) {
        bestD = d;
        tgt = e;
      }
    }
    battle.lockedEnemyId = tgt?.uid || null;
  }
  return tgt;
}

/**
 * Trigger instant special (Smoke Screen or Repair Party); Torpedoes are launched via drag!
 */
export function triggerInstantSpecial(battle) {
  const { player, stats } = battle;
  if (battle.outcome !== "ongoing" || stats.special.id === "none") {
    return { ok: false, reason: "none" };
  }
  if (player.specialCd > 0) return { ok: false, reason: "cd" };

  if (stats.special.id === "smoke") {
    const dur = stats.smokeDuration || 6.5;
    player.specialCd = stats.special.cd;
    battle.smokes.push({ x: player.x, y: player.y, r: 60, life: dur, maxLife: dur });
    battle.events.push({ type: "surge", x: player.x, y: player.y });
    return { ok: true, special: "smoke" };
  }

  if (stats.special.id === "repair") {
    if (player.hp >= player.maxHp && player.fireTimer <= 0) return { ok: false, reason: "full" };
    const heal = stats.repairAmt || 2;
    player.specialCd = stats.special.cd;
    player.hp = Math.min(player.maxHp, player.hp + heal);
    if (heal >= 4) player.fireTimer = 0;
    battle.events.push({ type: "board", x: player.x, y: player.y, heal });
    return { ok: true, special: "repair" };
  }

  return { ok: false, reason: "drag_aim" };
}

/**
 * Fire an arcing Main Battery AP or HE Salvo at target water coordinate (tx, ty)!
 */
export function firePlayerSalvo(battle, tx, ty, spreadMult = 1) {
  if (battle.outcome !== "ongoing") return { ok: false, reason: "ended" };
  const { player, stats } = battle;
  if (player.reloadTimer > 0.02) return { ok: false, reason: "reload" };

  const metrics = getSalvoMetrics(battle, tx, ty, spreadMult);
  const { bowCan, sternCan, guns, aimAngle } = metrics.bearing;
  if (guns <= 0) return { ok: false, reason: "no_arc" };

  player.reloadTimer = stats.reload;
  player.turretAng = aimAngle;
  player.gunBloom = 2.0; // Muzzle flash briefly reveals you in natural fog (active Smoke still conceals!)
  battle.shotsFired += 1;
  battle.salvoSeq += 1;
  const salvoId = `p_${battle.salvoSeq}`;

  // Queue staggered bow + stern turret shells with realistic elliptical dispersion
  const turretList = [];
  if (bowCan) {
    for (let i = 0; i < stats.bowGuns; i++) turretList.push({ mount: 7, idx: i });
  }
  if (sternCan) {
    for (let i = 0; i < stats.sternGuns; i++) turretList.push({ mount: -7, idx: i });
  }

  turretList.forEach((slot, k) => {
    const r = Math.sqrt(nextBattleRand(battle)) * metrics.spreadR;
    const th = nextBattleRand(battle) * Math.PI * 2;
    const sx = player.x + Math.cos(player.ang) * slot.mount;
    const sy = player.y + Math.sin(player.ang) * slot.mount;
    const lx = clamp(tx + Math.cos(th) * r, 10, ARENA_W - 10);
    const ly = clamp(ty + Math.sin(th) * r, 10, ARENA_H - 10);
    const d = Math.hypot(lx - sx, ly - sy);
    battle.queuedShells.push({
      delay: k * 0.055,
      friendly: true,
      salvoId,
      ammo: player.ammo,
      sx,
      sy,
      tx: lx,
      ty: ly,
      flightTime: clamp(d / SHELL_SPEED, 0.36, 1.9),
      peakH: clamp(d * 0.22, 16, 54),
      ang: Math.atan2(ly - sy, lx - sx),
    });
  });

  battle.events.push({
    type: "broadside",
    x: player.x,
    y: player.y,
    ang: aimAngle,
    ammo: player.ammo,
    guns,
  });
  return { ok: true, guns, ammo: player.ammo, flightTime: metrics.flightTime };
}

/**
 * Launch a fan of slow underwater Torpedoes from Port/Starboard side tubes toward (tx, ty)!
 */
export function launchPlayerTorpedoes(battle, tx, ty) {
  if (battle.outcome !== "ongoing") return { ok: false, reason: "ended" };
  const { player, stats } = battle;
  if (stats.torpCount <= 0 || player.torpCd > 0.02) return { ok: false, reason: "cd" };

  const arc = canLaunchTorpedoAt(player, tx, ty);
  if (!arc.inArc) return { ok: false, reason: "no_arc" };

  const cd = stats.torpCd || stats.special.cd || 7.5;
  player.torpCd = cd;
  if (stats.special.id === "torp") player.specialCd = cd;
  const baseAng = arc.aimAngle;
  const n = stats.torpCount;

  for (let i = 0; i < n; i++) {
    const spread = (i - (n - 1) * 0.5) * 0.115;
    const a = wrapAngle(baseAng + spread);
    battle.torpedoes.push({
      friendly: true,
      x: player.x + Math.cos(a) * 12,
      y: player.y + Math.sin(a) * 12,
      ang: a,
      spd: stats.torpSpeed,
      life: 5.2,
    });
  }

  battle.events.push({ type: "torp_launch", x: player.x, y: player.y, ang: baseAng });
  return { ok: true, count: n };
}

// --- Damage, Armor Angling, Fire & Mine Resolution --------------------------

function detonateMine(battle, mx, my) {
  const blastR = 52;
  const innerR = 30;
  battle.events.push({ type: "keg_boom", x: mx, y: my, r: blastR });

  for (const e of battle.enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - mx, e.y - my);
    if (d <= blastR + e.radius) {
      applyDirectDamageToEnemy(battle, e, d <= innerR + e.radius ? 4 : 2, "mine");
    }
  }
  const pd = Math.hypot(battle.player.x - mx, battle.player.y - my);
  if (pd <= blastR + battle.player.radius) {
    applyDirectDamageToPlayer(battle, pd <= innerR + battle.player.radius ? 4 : 2, "mine");
  }
}

/**
 * Symmetric angle-aware ramming resolution!
 * - Ordinarily both ships take 2 dmg scraping damage.
 * - Bow ramming directly into the other ship's broadside (T-Bone!) inflicts 4 dmg on the broadside ship.
 * - A strengthened/armored hull (Ironclad/Dreadnought/Fast BB/Bulkheads or enemy Battleship/Boss)
 *   reduces its own ram damage by 2 when ramming bow-first (taking 0 dmg instead of 2)!
 */
export function computeRamDamage(player, enemy, playerArmored = false) {
  const angPtoE = Math.atan2(enemy.y - player.y, enemy.x - player.x);
  const angEtoP = wrapAngle(angPtoE + Math.PI);

  const playerBow = Math.cos(wrapAngle(player.ang - angPtoE));
  const enemyBow = Math.cos(wrapAngle(enemy.ang - angEtoP));
  const enemySide = Math.abs(Math.sin(angPtoE - enemy.ang));
  const playerSide = Math.abs(Math.sin(angEtoP - player.ang));

  let enemyDmg = playerBow > 0.55 && enemySide > 0.65 ? 4 : 2;
  let playerDmg = enemyBow > 0.55 && playerSide > 0.65 ? 4 : 2;

  if (playerArmored && playerBow > 0.55) {
    playerDmg = Math.max(0, playerDmg - 2);
  }
  if (enemy.heavyArmor && enemyBow > 0.55) {
    enemyDmg = Math.max(0, enemyDmg - 2);
  }

  return {
    playerDmg,
    enemyDmg,
    tbone: enemyDmg >= 4 || playerDmg >= 4,
  };
}

function applyDirectDamageToPlayer(battle, dmg, source) {
  const { player } = battle;
  if (player.hp <= 0 || battle.outcome !== "ongoing") return;
  player.hp = Math.max(0, player.hp - dmg);
  battle.events.push({ type: "player_hit", x: player.x, y: player.y, dmg, source });
  if (player.hp <= 0) {
    battle.outcome = "lost";
  }
}

function applyDirectDamageToEnemy(battle, e, dmg, source, isCitadelOrTorp = false) {
  if (e.hp <= 0) return;
  e.hp = Math.max(0, e.hp - dmg);
  battle.events.push({
    type: source === "citadel" ? "citadel" : "hit",
    x: e.x,
    y: e.y,
    dmg,
    source,
  });

  if (e.hp <= 0) {
    battle.shipsSunk += 1;
    battle.goldCollected += e.gold;
    battle.events.push({ type: "sink", x: e.x, y: e.y, name: e.name, boss: e.boss, gold: e.gold });

    if (isCitadelOrTorp && battle.stats.dmgCtrlHeal && battle.player.hp < battle.player.maxHp) {
      const heal = Math.min(2, battle.player.maxHp - battle.player.hp);
      battle.player.hp += heal;
      battle.events.push({ type: "board", x: battle.player.x, y: battle.player.y, heal });
    }

    if (e.explodesOnDeath) {
      detonateMine(battle, e.x, e.y);
    }

    if (e.typeId === "twin_scharn" || e.typeId === "twin_gneis") {
      const surv = battle.enemies.find(
        (o) => (o.typeId === "twin_scharn" || o.typeId === "twin_gneis") && o.hp > 0,
      );
      if (surv && !surv.enraged) {
        surv.enraged = true;
        surv.reload *= 0.82;
        battle.events.push({ type: "enrage", x: surv.x, y: surv.y, text: `${surv.name} ENRAGED!` });
      }
    }
  }
}

/**
 * Resolve Armor Angling when an AP or HE shell strikes a warship!
 * - Zero salvo damage cap: every connecting shell deals full damage!
 * - Bow-only AP Ricochet: only shells striking the pointed armored BOW bounce (never stern!).
 * - Flat Broadside AP Citadel: 2 dmg per shell; normal AP pen / stern hit / HE hit: 1 dmg per shell!
 */
export function resolveShellHit(battle, shell, target, isPlayerTarget) {
  const rel = wrapAngle(shell.ang - target.ang);
  const sinImpact = Math.abs(Math.sin(rel));
  const hitBow = Math.cos(rel) < 0; // Shell flying against target's heading -> strikes armored BOW!

  if (shell.ammo === "ap") {
    // Sloped Armored Bow Ricochet Check (stern hits NEVER ricochet!)
    if (!target.stationary && hitBow && sinImpact < target.ricochetSin) {
      if (isPlayerTarget) battle.bounces += 1;
      battle.events.push({
        type: "ricochet",
        x: target.x,
        y: target.y,
        ang: shell.ang,
        playerBounce: isPlayerTarget,
      });
      return { result: "ricochet", dmg: 0 };
    }

    // Flat Broadside CITADEL Check! (Symmetric 0.76 base unless upgraded with Heavy AP Rifles)
    const citSin = isPlayerTarget ? 0.76 : battle.stats.citadelSin;
    const isCitadel = !target.stationary && sinImpact >= citSin;
    const dmg = isCitadel ? 2 : 1;

    if (isPlayerTarget) {
      applyDirectDamageToPlayer(battle, dmg, isCitadel ? "citadel" : "ap");
    } else {
      if (isCitadel) battle.citadels += 1;
      applyDirectDamageToEnemy(battle, target, dmg, isCitadel ? "citadel" : "ap", isCitadel);
    }
    return { result: isCitadel ? "citadel" : "pen", dmg };
  }

  // HE Shell: NEVER ricochets, deals 1 dmg per shell + rolls for Deck Fire (2 dmg tick)!
  if (isPlayerTarget) applyDirectDamageToPlayer(battle, 1, "he");
  else applyDirectDamageToEnemy(battle, target, 1, "he", false);

  if (target.hp > 0 && target.fireTimer <= 0) {
    const chance = isPlayerTarget ? 0.35 : battle.stats.fireChance;
    if (nextBattleRand(battle) <= chance) {
      target.fireTimer = isPlayerTarget ? 3.8 : battle.stats.fireDuration || 3.8;
      battle.events.push({ type: "fire_start", x: target.x, y: target.y });
    }
  }
  return { result: "he", dmg: 1 };
}

// --- Smooth Heavy Naval Physics & Live Enemy AI -----------------------------

function stepShipPhysics(
  ship,
  targetHeading,
  desiredThrottle,
  turnRate,
  rudderRate,
  maxSpeed,
  islands,
  dt,
) {
  // Smooth heavy rudder shift [-1..1]
  const diff = targetHeading !== null ? wrapAngle(targetHeading - ship.ang) : 0;
  const desiredRudder = targetHeading !== null ? clamp(diff / 0.45, -1, 1) : 0;
  ship.rudder = lerp(ship.rudder, desiredRudder, 1 - Math.exp(-rudderRate * 2.2 * dt));
  ship.ang = wrapAngle(ship.ang + ship.rudder * turnRate * dt);

  // Smooth heavy naval acceleration / braking
  const tgtSpd = maxSpeed * desiredThrottle * (1 - Math.abs(ship.rudder) * 0.16);
  ship.spd = lerp(ship.spd, tgtSpd, 1 - Math.exp(-1.9 * dt));

  ship.x += Math.cos(ship.ang) * ship.spd * dt;
  ship.y += Math.sin(ship.ang) * ship.spd * dt;

  // Gentle arena boundary containment
  const minX = MARGIN + ship.radius;
  const maxX = ARENA_W - MARGIN - ship.radius;
  const minY = MARGIN + ship.radius;
  const maxY = ARENA_H - MARGIN - ship.radius;
  ship.x = clamp(ship.x, minX, maxX);
  ship.y = clamp(ship.y, minY, maxY);

  // Island grounding (slows ship realistically like World of Warships, no instant death!)
  for (const isl of islands) {
    const dx = ship.x - isl.x;
    const dy = ship.y - isl.y;
    const d = Math.hypot(dx, dy);
    const minD = isl.r + ship.radius;
    if (d < minD) {
      const nx = dx / (d || 1);
      const ny = dy / (d || 1);
      ship.x = isl.x + nx * (minD + 0.5);
      ship.y = isl.y + ny * (minD + 0.5);
      ship.spd *= 0.45;
    }
  }
  ship.x = clamp(ship.x, minX, maxX);
  ship.y = clamp(ship.y, minY, maxY);
}

function clearanceAt(x, y, radius, islands, allowNorth = false) {
  let c = Math.min(
    x - MARGIN - radius,
    ARENA_W - MARGIN - radius - x,
    allowNorth ? 999 : y - MARGIN - radius,
    ARENA_H - MARGIN - radius - y,
  );
  for (const isl of islands) {
    c = Math.min(c, Math.hypot(x - isl.x, y - isl.y) - isl.r - radius);
  }
  return c;
}

function pickClearestEscapeHeading(e, islands) {
  const cx = ARENA_W * 0.5;
  const cy = ARENA_H * 0.44;
  let bestAng = Math.atan2(cy - e.y, cx - e.x);
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const c1 = clearanceAt(e.x + ux * 28, e.y + uy * 28, e.radius, islands, false);
    const c2 = clearanceAt(e.x + ux * 58, e.y + uy * 58, e.radius, islands, false);
    const c3 = clearanceAt(e.x + ux * 92, e.y + uy * 92, e.radius, islands, false);
    const toCenter = Math.cos(wrapAngle(a - Math.atan2(cy - e.y, cx - e.x)));
    const score = Math.min(c1, c2) * 1.4 + c2 * 0.7 + c3 * 0.5 + toCenter * 14;
    if (score > bestScore) {
      bestScore = score;
      bestAng = a;
    }
  }
  return bestAng;
}

function stepEnemyAI(battle, e, dt) {
  const { player, islands } = battle;

  // Deck Fire tick!
  if (e.fireTimer > 0) {
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      applyDirectDamageToEnemy(battle, e, 2, "fire", false);
      if (e.hp <= 0) return;
    }
  }

  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy);
  const angToP = Math.atan2(dy, dx);
  const seesPlayer = !player.hidden && hasLineOfSight(e.x, e.y, player.x, player.y, islands);

  if (seesPlayer) {
    e.turretAng = wrapAngle(
      e.turretAng + clamp(wrapAngle(angToP - e.turretAng), -1.8 * dt, 1.8 * dt),
    );
  }

  if (!e.stationary) {
    let desired = e.ang;
    let throttle = 0.85;

    // 1. Torpedo Evasion! Nearby player torpedoes force enemies to turn — often exposing broadside!
    const threatTorp = battle.torpedoes.find(
      (tp) =>
        tp.friendly &&
        Math.hypot(tp.x - e.x, tp.y - e.y) < 105 &&
        Math.cos(Math.atan2(e.y - tp.y, e.x - tp.x) - tp.ang) > 0.5,
    );

    if (threatTorp) {
      // Turn parallel to torpedo vector to comb the spread (exposing flank to player!)
      desired =
        angleDiff(e.ang, threatTorp.ang) < angleDiff(e.ang, wrapAngle(threatTorp.ang + Math.PI))
          ? threatTorp.ang
          : wrapAngle(threatTorp.ang + Math.PI);
      throttle = 1.0;
    } else if (e.ai === "convoy") {
      desired = -Math.PI * 0.5 + Math.sin(battle.elapsed * 0.4) * 0.14;
      if (e.y <= MARGIN + e.radius + 8) {
        e.hp = 0;
        e.escaped = true;
        battle.events.push({ type: "convoy_escaped", x: e.x, y: e.y });
        return;
      }
    } else if (e.ai === "kamikaze") {
      desired = seesPlayer ? angToP : e.ang;
      throttle = 1.0;
    } else if (e.ai === "destroyer") {
      // Dart to ~140px flank, turn briefly for torps, then kite
      if (dist > 155) desired = wrapAngle(angToP + e.orbitDir * 0.35);
      else if (dist < 95) desired = wrapAngle(angToP + Math.PI - e.orbitDir * 0.4);
      else desired = wrapAngle(angToP + e.orbitDir * Math.PI * 0.48);
      throttle = 1.0;
    } else if (e.ai === "cruiser") {
      // Classic WoWS Cruiser dance: angle bow while reloading, swing broadside to shoot!
      if (e.reloadTimer < 1.25 && seesPlayer) {
        desired = wrapAngle(angToP + e.orbitDir * 1.15); // swings out broadside!
      } else if (dist > 220) {
        desired = wrapAngle(angToP + e.orbitDir * 0.42);
      } else if (dist < 120) {
        desired = wrapAngle(angToP + Math.PI * 0.78 * e.orbitDir);
      } else {
        desired = wrapAngle(angToP + e.orbitDir * 0.5); // angled ~28° bow!
      }
      throttle = 0.85;
    } else {
      // Battleship: slowly angles bow toward player, cruises steadily across upper/mid strait
      if (e.reloadTimer < 1.3 && seesPlayer) {
        desired = wrapAngle(angToP + e.orbitDir * 0.92);
      } else if (dist > 250) {
        desired = wrapAngle(angToP + e.orbitDir * 0.32);
      } else {
        desired = wrapAngle(angToP + e.orbitDir * 0.45);
      }
      throttle = 0.75;
    }

    // Additive vector-sum avoidance (prevents island push from overwriting wall push and trapping ships in pockets!)
    const isConvoy = e.ai === "convoy";
    let effTurnRate = e.turnRate;
    let effRudderRate = 2.0;

    if (!isConvoy && (e.unstickTimer || 0) > 0) {
      e.unstickTimer = Math.max(0, e.unstickTimer - dt);
      desired = e.unstickHeading;
      throttle = 1.0;
      effTurnRate = e.turnRate * 1.35;
      effRudderRate = 3.2;
    } else {
      const lookX = e.x + Math.cos(e.ang) * 42;
      const lookY = e.y + Math.sin(e.ang) * 42;
      const hitLeft = lookX < 36;
      const hitRight = lookX > ARENA_W - 36;
      const hitNorth = !isConvoy && lookY < 40;
      const hitSouth = lookY > ARENA_H - 44;
      let avoidX = 0;
      let avoidY = 0;

      if (hitLeft) avoidX += 2.2;
      if (hitRight) avoidX -= 2.2;
      if (hitNorth) avoidY += 2.2;
      if (hitSouth) avoidY -= 2.2;

      const openX = ARENA_W * 0.5;
      const openY = ARENA_H * 0.44;
      for (const isl of islands) {
        const dShip = Math.hypot(e.x - isl.x, e.y - isl.y);
        const dLook = Math.hypot(lookX - isl.x, lookY - isl.y);
        if (dShip < isl.r + e.radius + 7 || dLook < isl.r + e.radius + 15) {
          const rx = (e.x - isl.x) / (dShip || 1);
          const ry = (e.y - isl.y) / (dShip || 1);
          avoidX += rx * 2.2;
          avoidY += ry * 2.2;

          // Slide around the open-water side of coastal headlands rather than into borders
          const tx1 = -ry;
          const ty1 = rx;
          const sign = tx1 * (openX - e.x) + ty1 * (openY - e.y) >= 0 ? 1 : -1;
          avoidX += tx1 * sign * 1.6;
          avoidY += ty1 * sign * 1.6;
        }
      }

      if (Math.hypot(avoidX, avoidY) > 0.05) {
        const wx = Math.cos(desired) * 0.5 + avoidX;
        const wy = Math.sin(desired) * 0.5 + avoidY;
        desired = Math.atan2(wy, wx);
      }
    }

    const prevX = e.x;
    const prevY = e.y;
    stepShipPhysics(e, desired, throttle, effTurnRate, effRudderRate, e.maxSpeed, islands, dt);

    // Active stuck-detector: if an enemy is pinned against an island/border pinch, pivot cleanly into open water!
    if (!isConvoy && dt > 0.0001) {
      const movedSpd = Math.hypot(e.x - prevX, e.y - prevY) / dt;
      if (movedSpd < e.maxSpeed * 0.25) {
        e.stuckTimer = (e.stuckTimer || 0) + dt;
        if (e.stuckTimer >= 0.55) {
          e.stuckTimer = 0;
          e.orbitDir = -e.orbitDir;
          e.unstickHeading = pickClearestEscapeHeading(e, islands);
          e.unstickTimer = 1.6;
        }
      } else {
        e.stuckTimer = Math.max(0, (e.stuckTimer || 0) - dt * 1.5);
      }
    }

    // Fire-ship ramming check
    if (
      e.ai === "kamikaze" &&
      Math.hypot(player.x - e.x, player.y - e.y) <= e.radius + player.radius + 3
    ) {
      e.hp = 0;
      detonateMine(battle, e.x, e.y, true);
      battle.shipsSunk += 1;
      battle.events.push({ type: "sink", x: e.x, y: e.y, name: e.name, boss: false, gold: e.gold });
      return;
    }
  }

  if (!seesPlayer) return;

  // Enemy Torpedo Spread Launch (Destroyers & Bosses — symmetric side torpedo arcs!)
  if (e.baseTorpCd > 0) {
    e.torpCd -= dt;
    if (e.torpCd <= 0 && dist < 215) {
      const leadT = clamp(dist / (TORP_SPEED * 0.9), 0.6, 2.6);
      const lx = player.x + Math.cos(player.ang) * player.spd * leadT * 0.65;
      const ly = player.y + Math.sin(player.ang) * player.spd * leadT * 0.65;
      const arc = canLaunchTorpedoAt(e, lx, ly);
      if (arc.inArc) {
        e.torpCd = e.baseTorpCd;
        const baseA = arc.aimAngle;
        for (let i = 0; i < e.torpCount; i++) {
          const sp = (i - (e.torpCount - 1) * 0.5) * 0.14;
          const a = wrapAngle(baseA + sp);
          battle.torpedoes.push({
            friendly: false,
            x: e.x + Math.cos(a) * (e.radius + 3),
            y: e.y + Math.sin(a) * (e.radius + 3),
            ang: a,
            spd: TORP_SPEED * 0.85,
            life: 4.8,
          });
        }
        battle.events.push({ type: "torp_warn", x: e.x, y: e.y });
      }
    }
  }

  // Enemy Main Battery Arcing Salvo!
  if (e.guns > 0) {
    e.reloadTimer -= dt;
    if (e.reloadTimer <= 0 && dist <= e.range) {
      e.reloadTimer = e.reload * 1.28;
      battle.salvoSeq += 1;
      const salvoId = `e_${battle.salvoSeq}`;
      const flightT = clamp(dist / (SHELL_SPEED * 0.76), 0.78, 2.0);
      // Enemies lead player's current speed cleanly — braking (STOP) or turning dodges them!
      const lx = clamp(
        player.x + Math.cos(player.ang) * player.spd * flightT * 0.88,
        20,
        ARENA_W - 20,
      );
      const ly = clamp(
        player.y + Math.sin(player.ang) * player.spd * flightT * 0.88,
        20,
        ARENA_H - 20,
      );
      const disp = 22 + dist * 0.058;
      const ammo = e.stationary ? "he" : "ap";

      for (let i = 0; i < e.guns; i++) {
        const r = Math.sqrt(nextBattleRand(battle)) * disp;
        const th = nextBattleRand(battle) * Math.PI * 2;
        const tx = clamp(lx + Math.cos(th) * r, 10, ARENA_W - 10);
        const ty = clamp(ly + Math.sin(th) * r, 10, ARENA_H - 10);
        const d = Math.hypot(tx - e.x, ty - e.y);
        battle.queuedShells.push({
          delay: i * 0.065,
          friendly: false,
          salvoId,
          ammo,
          sx: e.x,
          sy: e.y,
          tx,
          ty,
          flightTime: clamp(d / (SHELL_SPEED * 0.78), 0.7, 2.0),
          peakH: clamp(d * 0.24, 18, 56),
          ang: Math.atan2(ty - e.y, tx - e.x),
        });
      }
      e.gunBloom = 2.0; // Enemy muzzle flash reveals them inside fog briefly too!
      battle.events.push({ type: "enemy_volley", x: e.x, y: e.y });
    }
  }
}

export function stepBattle(battle, rawDt) {
  battle.events.length = 0;
  if (battle.outcome !== "ongoing") return battle;

  const dt = clamp(rawDt, 0, 0.05);
  battle.elapsed += dt;

  const { player, stats, islands } = battle;
  player.reloadTimer = Math.max(0, player.reloadTimer - dt);
  player.specialCd = Math.max(0, player.specialCd - dt);
  player.torpCd = Math.max(0, (player.torpCd || 0) - dt);
  player.gunBloom = Math.max(0, (player.gunBloom || 0) - dt);

  // Player Deck Fire tick
  if (player.fireTimer > 0) {
    player.fireTimer -= dt;
    if (player.fireTimer <= 0) {
      applyDirectDamageToPlayer(battle, 2, "fire");
      if (battle.outcome !== "ongoing") return battle;
    }
  }

  // Update Smoke Screens & Drifting Sea-Fog Banks (Symmetric concealment for BOTH sides!)
  for (let i = battle.smokes.length - 1; i >= 0; i--) {
    battle.smokes[i].life -= dt;
    if (battle.smokes[i].life <= 0) battle.smokes.splice(i, 1);
  }
  for (const fog of battle.fogZones || []) {
    fog.x = fog.baseX + Math.sin(battle.elapsed * 0.24 + fog.phase) * (fog.driftX || 14);
  }
  const inSmoke = battle.smokes.some((s) => Math.hypot(player.x - s.x, player.y - s.y) <= s.r);
  const inFog = (battle.fogZones || []).some(
    (f) => Math.hypot(player.x - f.x, player.y - f.y) <= f.r,
  );
  const proxSpotted = battle.enemies.some(
    (e) => e.hp > 0 && Math.hypot(e.x - player.x, e.y - player.y) <= 58,
  );
  const anySees = battle.enemies.some(
    (e) => e.hp > 0 && hasLineOfSight(e.x, e.y, player.x, player.y, islands),
  );
  // Natural Fog hides you unless firing (gunBloom) or point-blank; active Smoke hides even while firing!
  player.hidden = !proxSpotted && (inSmoke || (inFog && player.gunBloom <= 0) || !anySees);

  // Player Heavy Waypoint Rudder Steering
  let targetHeading = null;
  if (player.waypoint) {
    const dx = player.waypoint.x - player.x;
    const dy = player.waypoint.y - player.y;
    if (Math.hypot(dx, dy) < 16) {
      player.waypoint = null;
    } else {
      targetHeading = Math.atan2(dy, dx);
    }
  }
  // Gentle auto-avoid outer screen border if no waypoint is pulling inward
  if (targetHeading === null) {
    const lx = player.x + Math.cos(player.ang) * 32;
    const ly = player.y + Math.sin(player.ang) * 32;
    if (lx < 26 || lx > ARENA_W - 26 || ly < 28 || ly > ARENA_H - 30) {
      targetHeading = Math.atan2(ARENA_H * 0.5 - player.y, ARENA_W * 0.5 - player.x);
    }
  }

  const throttleMult = player.throttle === 2 ? 1.0 : player.throttle === 1 ? 0.5 : 0.0;
  stepShipPhysics(
    player,
    targetHeading,
    throttleMult,
    stats.turnRate,
    stats.rudderRate,
    stats.speed,
    islands,
    dt,
  );

  // Smoothly track locked enemy with visual deck turrets
  const locked = getLockedEnemy(battle);
  if (locked) {
    const ta = Math.atan2(locked.y - player.y, locked.x - player.x);
    player.turretAng = wrapAngle(
      player.turretAng + clamp(wrapAngle(ta - player.turretAng), -2.4 * dt, 2.4 * dt),
    );
  }

  // Emit Queued Staggered Salvo Shells
  for (let i = battle.queuedShells.length - 1; i >= 0; i--) {
    const q = battle.queuedShells[i];
    q.delay -= dt;
    if (q.delay <= 0) {
      battle.shells.push({
        ...q,
        t: 0,
        x: q.sx,
        y: q.sy,
        z: 0,
      });
      battle.queuedShells.splice(i, 1);
    }
  }

  // Step Enemies & Symmetric Fog Concealment!
  for (const e of battle.enemies) {
    if (e.hp <= 0) continue;
    if (e.ramCd > 0) e.ramCd = Math.max(0, e.ramCd - dt);
    e.gunBloom = Math.max(0, (e.gunBloom || 0) - dt);
    stepEnemyAI(battle, e, dt);
    if (battle.outcome !== "ongoing") return battle;

    const eInFog = (battle.fogZones || []).some((f) => Math.hypot(e.x - f.x, e.y - f.y) <= f.r);
    const eProx = Math.hypot(e.x - player.x, e.y - player.y) <= 58;
    e.hidden = !eProx && e.gunBloom <= 0 && eInFog;
  }

  // Symmetric Floating Naval Mine Contact Detonation (hazards for BOTH player and enemies!)
  for (const m of battle.mines) {
    if (!m.alive) continue;
    let triggered = Math.hypot(player.x - m.x, player.y - m.y) <= player.radius + 7;
    if (!triggered) {
      triggered = battle.enemies.some(
        (e) => e.hp > 0 && !e.stationary && Math.hypot(e.x - m.x, e.y - m.y) <= e.radius + 7,
      );
    }
    if (triggered) {
      m.alive = false;
      detonateMine(battle, m.x, m.y);
      if (battle.outcome !== "ongoing") return battle;
    }
  }

  // Solid Ship-to-Ship Hull Separation & Symmetric Angle-Aware Ramming!
  for (const e of battle.enemies) {
    if (e.hp <= 0 || e.ai === "kamikaze") continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy);
    const minD = player.radius + e.radius + 1;
    if (d < minD) {
      const nx = d > 0.01 ? dx / d : 0;
      const ny = d > 0.01 ? dy / d : 1;
      const overlap = minD - d + 0.5;
      if (e.stationary) {
        player.x = clamp(
          player.x + nx * overlap,
          MARGIN + player.radius,
          ARENA_W - MARGIN - player.radius,
        );
        player.y = clamp(
          player.y + ny * overlap,
          MARGIN + player.radius,
          ARENA_H - MARGIN - player.radius,
        );
      } else {
        player.x = clamp(
          player.x + nx * overlap * 0.5,
          MARGIN + player.radius,
          ARENA_W - MARGIN - player.radius,
        );
        player.y = clamp(
          player.y + ny * overlap * 0.5,
          MARGIN + player.radius,
          ARENA_H - MARGIN - player.radius,
        );
        e.x = clamp(e.x - nx * overlap * 0.5, MARGIN + e.radius, ARENA_W - MARGIN - e.radius);
        e.y = clamp(e.y - ny * overlap * 0.5, MARGIN + e.radius, ARENA_H - MARGIN - e.radius);
        e.spd *= 0.45;
      }
      player.spd *= 0.45;

      if (!e.ramCd || e.ramCd <= 0) {
        e.ramCd = 1.8;
        const mx = (player.x + e.x) * 0.5;
        const my = (player.y + e.y) * 0.5;
        const ram = computeRamDamage(player, e, Boolean(stats.strengthenedHull));
        battle.events.push({ type: "ram", x: mx, y: my, tbone: ram.tbone });
        if (ram.enemyDmg > 0) applyDirectDamageToEnemy(battle, e, ram.enemyDmg, "ram", false);
        if (ram.playerDmg > 0) applyDirectDamageToPlayer(battle, ram.playerDmg, "ram");
        if (battle.outcome !== "ongoing") return battle;
      }
    }
  }

  // Prevent enemy warships from overlapping one another
  for (let i = 0; i < battle.enemies.length; i++) {
    const a = battle.enemies[i];
    if (a.hp <= 0 || a.stationary) continue;
    for (let j = i + 1; j < battle.enemies.length; j++) {
      const b = battle.enemies[j];
      if (b.hp <= 0 || b.stationary) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      const minD = a.radius + b.radius + 2;
      if (d < minD) {
        const nx = d > 0.01 ? dx / d : 1;
        const ny = d > 0.01 ? dy / d : 0;
        const push = (minD - d + 0.5) * 0.5;
        a.x = clamp(a.x + nx * push, MARGIN + a.radius, ARENA_W - MARGIN - a.radius);
        a.y = clamp(a.y + ny * push, MARGIN + a.radius, ARENA_H - MARGIN - a.radius);
        b.x = clamp(b.x - nx * push, MARGIN + b.radius, ARENA_W - MARGIN - b.radius);
        b.y = clamp(b.y - ny * push, MARGIN + b.radius, ARENA_H - MARGIN - b.radius);
      }
    }
  }

  // Step Arcing Ballistic Shells
  for (let i = battle.shells.length - 1; i >= 0; i--) {
    const sh = battle.shells[i];
    sh.t += dt;
    const u = clamp(sh.t / sh.flightTime, 0, 1);
    sh.x = lerp(sh.sx, sh.tx, u);
    sh.y = lerp(sh.sy, sh.ty, u);
    sh.z = 4 * sh.peakH * u * (1 - u);

    // Island peak occlusion (only low flat shots clip cliffs; arcing cannon salvos lob over islands!)
    let blockedByIsland = false;
    if (sh.z < 14 && u > 0.08 && u < 0.94) {
      for (const isl of islands) {
        if (!isl.fortIsland && Math.hypot(sh.x - isl.x, sh.y - isl.y) < isl.r * 0.85) {
          blockedByIsland = true;
          battle.events.push({ type: "island_hit", x: sh.x, y: sh.y });
          break;
        }
      }
    }
    if (blockedByIsland) {
      battle.shells.splice(i, 1);
      continue;
    }

    if (u >= 1) {
      let hitAny = false;
      if (sh.friendly) {
        // Check Naval Mines
        for (const m of battle.mines) {
          if (m.alive && Math.hypot(sh.x - m.x, sh.y - m.y) <= (sh.ammo === "he" ? 24 : 14)) {
            m.alive = false;
            detonateMine(battle, m.x, m.y, false);
            hitAny = true;
          }
        }
        // Check Enemy Hulls
        for (const e of battle.enemies) {
          if (e.hp <= 0) continue;
          if (Math.hypot(sh.x - e.x, sh.y - e.y) <= e.radius + 5) {
            resolveShellHit(battle, sh, e, false);
            hitAny = true;
            break;
          }
        }
      } else {
        if (Math.hypot(sh.x - player.x, sh.y - player.y) <= player.radius + 4) {
          resolveShellHit(battle, sh, player, true);
          hitAny = true;
        }
      }

      if (!hitAny) {
        battle.events.push({ type: "splash", x: sh.x, y: sh.y });
      }
      battle.shells.splice(i, 1);
    }
  }

  // Step Slow Underwater Torpedoes!
  for (let i = battle.torpedoes.length - 1; i >= 0; i--) {
    const tp = battle.torpedoes[i];
    tp.x += Math.cos(tp.ang) * tp.spd * dt;
    tp.y += Math.sin(tp.ang) * tp.spd * dt;
    tp.life -= dt;
    let remove = tp.life <= 0 || tp.x < 8 || tp.x > ARENA_W - 8 || tp.y < 8 || tp.y > ARENA_H - 8;

    // Check warship/fort hull hits first (so Coastal Forts on fortIslands can still be torpedoed!)
    if (!remove && tp.friendly) {
      for (const e of battle.enemies) {
        if (e.hp > 0 && Math.hypot(tp.x - e.x, tp.y - e.y) <= e.radius + 5) {
          battle.events.push({ type: "keg_boom", x: tp.x, y: tp.y, r: 34 });
          applyDirectDamageToEnemy(battle, e, 4, "torpedo", true);
          remove = true;
          break;
        }
      }
    } else if (!remove && !tp.friendly) {
      if (Math.hypot(tp.x - player.x, tp.y - player.y) <= player.radius + 4) {
        battle.events.push({ type: "keg_boom", x: tp.x, y: tp.y, r: 34 });
        applyDirectDamageToPlayer(battle, 4, "torpedo");
        remove = true;
      }
    }

    // Solid island shoreline blocking: torpedoes detonate on beaches/rocks!
    if (!remove) {
      for (const isl of islands) {
        if (Math.hypot(tp.x - isl.x, tp.y - isl.y) < isl.r + 2) {
          remove = true;
          battle.events.push({ type: "island_hit", x: tp.x, y: tp.y, torp: true });
          break;
        }
      }
    }

    if (remove) battle.torpedoes.splice(i, 1);
  }

  // Victory / Defeat Check
  if (battle.outcome === "ongoing") {
    if (player.hp <= 0) {
      battle.outcome = "lost";
    } else {
      const alive = battle.enemies.some((e) => e.hp > 0);
      if (!alive) {
        battle.victoryDelay += dt;
        if (battle.victoryDelay >= 0.45) {
          battle.outcome = "won";
        }
      }
    }
  }

  return battle;
}
