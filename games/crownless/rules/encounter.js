/**
 * Meeting a party on the map (world.md §5): the battle it would be, what you
 * may do about it, and what each choice does to the campaign.
 *
 * The battle is built only from what battle-setup.js and battle.js agreed to
 * export (tech.md §2), so the battle can change underneath without this file
 * noticing. Auto-resolve is that battle played out by the plain AI, and its
 * aftermath (battle.md §11) is what the campaign keeps.
 */
import {
  armySquads,
  bannerSquad,
  deploy,
  makeWoods,
  skirmishHero,
  oddsRun,
  summarizeOdds,
  strength,
} from "./battle-setup.js";
import { createBattle, autoFinish, aftermath } from "./battle.js";
import { dist } from "./hex.js";
import { troop, worthOf, cultureTroop } from "./data/troops.js";
import { T } from "./data/world.js";
import { CAPTIVE_DAYS, ESCAPE } from "./data/warband.js";
import {
  BRIGAND_NAMES,
  VALUE,
  LOOT_SHARE,
  DISENGAGE,
  PAY_SHARE,
  PAID_HOURS,
  REARGUARD,
  CHIEF_LEVEL,
  CHIEF_GUARDS,
} from "./data/parties.js";
import { realmOf, pace, log } from "./world.js";
import { partyPace, hexOf } from "./parties.js";
import { fightXp, cheer, takePrisoners } from "./warband.js";
import { roll, rollInt } from "./rng.js";

/** The odds and the strengths, for the sheet: battle's own, passed through. */
export { oddsRun, summarizeOdds, strength };

/** The party you've met, if you have. */
export const foeOf = (state) =>
  state.encounter ? state.parties.find((p) => p.id === state.encounter.party) : null;

/** What a party calls a troop: brigands have names of their own (army.md §5). */
export const troopName = (party, type) =>
  (party?.kind === "brigands" && BRIGAND_NAMES[type]) || troop(type).name;

/** The battle this meeting would be, you on side 0. The same meeting is always the same battle. */
export function encounterBattle(state, realm = realmOf(state)) {
  const p = state.player;
  const party = foeOf(state);
  const seed = state.encounter.seed;
  const fit = p.party.troops
    .map((t) => ({ type: t.type, n: t.n - t.wounded }))
    .filter((t) => t.n > 0);
  const mine = [...armySquads(fit), bannerSquad(p.hero)];
  const theirs = party.troops.map((t) => ({ ...t }));
  let chief = null;
  let banner = [];
  if (party.chief) {
    chief = skirmishHero(null, CHIEF_LEVEL);
    const k = guardsOf(party);
    if (k) theirs.find((t) => t.type === "militia").n -= k;
    banner = [bannerSquad(chief, k ? [{ type: "militia", n: k }] : [])];
  }
  const specs = [...armySquads(theirs.filter((t) => t.n > 0)), ...banner];
  const forest = realm.terrain[hexOf(p.at)] === T.forest;
  return createBattle({
    seed,
    sides: [
      {
        name: "You",
        culture: p.culture,
        hero: p.hero,
        ai: false,
        place: true,
        squads: deploy(mine, 0, "line", p.hero.tactics),
      },
      {
        name: party.name,
        culture: null,
        hero: chief,
        ai: true,
        place: true,
        squads: deploy(specs, 1, "line", 0),
      },
    ],
    woods: forest ? makeWoods(seed) : [],
  });
}

/** A chief keeps up to six of the band's brigands about him (army.md §6). */
const guardsOf = (party) =>
  Math.min(CHIEF_GUARDS, party.troops.find((t) => t.type === "militia")?.n ?? 0);

/**
 * The type of a side's household, if its banner has one: four footmen who
 * stand in when a hero has fewer than four guards (battle-setup.js).
 */
const householdOf = (state, party, side) =>
  side === 0
    ? cultureTroop(state.player.culture, "footman")
    : party.chief && guardsOf(party) < 4
      ? "footman"
      : null;

/**
 * What the sheet offers (world.md §5): Leave if you came for them or you're
 * the faster; otherwise a rearguard, if you have fit men to leave; Pay a
 * brigand band that came for you.
 */
export function choices(state) {
  const p = state.player;
  const party = foeOf(state);
  const faster = pace(p) > partyPace(party);
  const yours = state.encounter.by === "you";
  const leave = yours || faster;
  const fit = p.party.troops.some((t) => t.n > t.wounded);
  const pay = party.kind === "brigands" && !yours ? Math.floor(PAY_SHARE * p.gold) : 0;
  return { leave, rearguard: !leave && fit, pay, faster };
}

const end = (state, party, hours) => {
  state.truce[party.id] = state.t + hours;
  state.encounter = null;
};

/** Walk away. They can't catch you for 6 hours (battle.md §11). */
export function leave(state) {
  const party = foeOf(state);
  if (!party || !choices(state).leave) return false;
  end(state, party, DISENGAGE);
  return true;
}

/** Buy them off: 20% of your gold, and they leave you alone for three days. */
export function payOff(state) {
  const party = foeOf(state);
  const cost = party ? choices(state).pay : 0;
  if (cost <= 0) return false;
  state.player.gold -= cost;
  party.gold += cost;
  log(state, "paid", null, { name: party.name, gold: cost });
  state.paid[party.id] = state.t + PAID_HOURS;
  state.encounter = null;
  return true;
}

/**
 * The men a rearguard costs: the slowest of your fit men until they are
 * worth 15% of the fit men's worth (world.md §5). They are lost.
 */
export function rearguardOf(troops) {
  const fit = troops.map((t) => ({ type: t.type, n: t.n - t.wounded })).filter((t) => t.n > 0);
  const total = fit.reduce((m, t) => m + t.n * worthOf(t.type), 0);
  let left = total * REARGUARD;
  const lost = {};
  const slow = [...fit].sort(
    (a, b) => troop(a.type).speed - troop(b.type).speed || worthOf(a.type) - worthOf(b.type),
  );
  for (const t of slow) {
    if (left <= 0) break;
    const w = worthOf(t.type);
    const k = Math.min(t.n, Math.ceil(left / w));
    lost[t.type] = k;
    left -= k * w;
  }
  return lost;
}

/** Leave a rearguard to hold them and get away with the rest. */
export function sacrifice(state) {
  const party = foeOf(state);
  if (!party || !choices(state).rearguard) return false;
  const lost = rearguardOf(state.player.party.troops);
  for (const t of state.player.party.troops) t.n -= lost[t.type] ?? 0;
  state.player.party.troops = state.player.party.troops.filter((t) => t.n > 0);
  log(state, "rearguard", null, { name: party.name, men: sum(lost) });
  end(state, party, DISENGAGE);
  return true;
}

const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);

/**
 * Fight it out with the plain AI on both sides (battle.md §12) and keep the
 * aftermath: your dead and wounded, their dead and captured, the loot, your
 * men's XP and the party's morale. Lose to brigands and you are taken; lose
 * to wolves and you get away alone (world.md §7). Sets `state.result` for
 * the sheet that tells you, and returns it.
 */
export function autoResolve(state, realm = realmOf(state)) {
  const p = state.player;
  const party = foeOf(state);
  if (!party) return null;
  const b = encounterBattle(state, realm);
  const fielded = [strength(b, 0).worth, strength(b, 1).worth];
  const fought = Object.fromEntries(p.party.troops.map((t) => [t.type, t.n - t.wounded]));
  autoFinish(b);
  const [ours, theirs] = aftermath(b, { worthOf, medicine: [p.hero.medicine ?? 0, 0] });
  withoutHousehold(b, 0, ours, householdOf(state, party, 0));
  withoutHousehold(b, 1, theirs, householdOf(state, party, 1));
  const won = b.winner === 0;
  const lost = b.winner === 1;
  if (party.kind === "brigands") p.provoked = true;

  // Their side: the killed and the captured leave the band; its wounded
  // limp along with it (a band keeps no sick list).
  const theirDead = {};
  for (const m of [theirs.killed, theirs.captured])
    for (const [t, n] of Object.entries(m)) theirDead[t] = (theirDead[t] ?? 0) + n;
  for (const t of party.troops) t.n -= theirDead[t.type] ?? 0;
  party.troops = party.troops.filter((t) => t.n > 0);

  const result = {
    kind: won ? "won" : lost ? "lost" : "draw",
    name: party.name,
    foe: party.kind,
    killed: sum(ours.killed),
    wounded: sum(ours.wounded),
    theirDead: sum(theirDead),
    taken: 0,
    loot: 0,
    xp: 0,
    at: null,
    held: 0,
  };
  if (!lost) {
    for (const t of p.party.troops) {
      const k = Math.min(t.n, ours.killed[t.type] ?? 0);
      t.n -= k;
      t.wounded = Math.min(t.n, t.wounded + (ours.wounded[t.type] ?? 0));
    }
    p.party.troops = p.party.troops.filter((t) => t.n > 0);
    // Beaten: all of them if you won, else those they lost (army.md §3).
    let beaten = fielded[1];
    if (!won) {
      beaten = 0;
      for (const m of [theirs.killed, theirs.wounded, theirs.captured])
        for (const [t, n] of Object.entries(m)) beaten += n * worthOf(t);
    }
    result.xp = fightXp(p, { fought, killed: ours.killed, beaten, fielded: fielded[0], won });
  }
  if (won) {
    // Loot: 15% of the value of the dead and the taken, and the whole purse.
    let value = 0;
    for (const m of [theirs.killed, theirs.captured])
      for (const [t, n] of Object.entries(m)) value += n * (VALUE[troop(t).type] ?? 0);
    result.loot = Math.round(LOOT_SHARE * value) + party.gold;
    p.gold += result.loot;
    if (party.kind !== "wolves") result.taken = takePrisoners(state, ours.taken);
    state.parties = state.parties.filter((pt) => pt !== party);
    state.encounter = null;
    cheer(p, "won");
  } else if (lost) {
    // The warband scatters and your prisoners go free. Brigands hold you
    // 3–10 days and let you go near the nearest village, ransomed or
    // escaped; wolves leave you to get there alone (world.md §7).
    const village = nearestVillage(realm, hexOf(p.at));
    p.party.troops = [];
    p.party.prisoners = [];
    p.at = { i: village.i, to: -1, progress: 0 };
    p.dest = -1;
    result.at = village.name;
    if (party.kind === "brigands") {
      result.held = rollInt(state, CAPTIVE_DAYS[0], CAPTIVE_DAYS[1]);
      p.captive = {
        by: party.name,
        until: state.t + 24 * result.held,
        ransom: roll(state) >= ESCAPE,
      };
    }
    cheer(p, "lost");
    end(state, party, DISENGAGE * 4);
  } else end(state, party, DISENGAGE);
  log(state, result.kind, null, {
    name: party.name,
    loot: result.loot,
    lost: result.killed,
    held: result.held,
  });
  state.result = result;
  return result;
}

/** The result has been read. */
export function dismiss(state) {
  state.result = null;
}

/**
 * A banner's household are the hero's own (army.md §6): what they lose isn't
 * the party's, so take it back out of that side's aftermath.
 */
function withoutHousehold(b, side, ours, type) {
  const banner = b.squads.find((s) => s.side === side && s.banner);
  if (!banner || !type) return;
  for (const u of banner.units) {
    if (u.type !== type) continue;
    let extra = u.n0 - u.n;
    for (const m of [ours.killed, ours.wounded, ours.captured]) {
      const k = Math.min(extra, m[u.type] ?? 0);
      if (!k) continue;
      m[u.type] -= k;
      if (!m[u.type]) delete m[u.type];
      extra -= k;
    }
    ours.fled[u.type] = Math.max(0, (ours.fled[u.type] ?? 0) - u.n);
  }
}

function nearestVillage(realm, i) {
  let best = null;
  let bd = Infinity;
  for (const p of realm.places) {
    if (p.kind !== "village") continue;
    const d = dist(realm.grid, p.i, i);
    if (d < bd) [bd, best] = [d, p];
  }
  return best;
}
