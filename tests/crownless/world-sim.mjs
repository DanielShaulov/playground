/**
 * The living map, run for 200 days on 50 seeds (roadmap.md M2, world.md §5):
 * brigands and wolves spawning, growing, hunting and roaming, and a player
 * who walks from town to town and fights whatever catches them. It fails if
 * a party gets stuck where no path leads, a party stands where nothing can,
 * the caps are broken, or a tick or a day goes over its budget (tech.md §5);
 * it reports the rest.
 *
 *     npm run test:crownless:world-sim            # 50 seeds × 200 days (about a minute)
 *     npm run test:crownless:world-sim -- 5 60    # 5 seeds × 60 days
 *
 * Budgets are a phone's (an hour's tick ≤ 1 ms with 80 parties; a day,
 * battles included, ≤ 30 ms). Node on a laptop is 3–5× faster, so a pass
 * here is a margin, not a measurement on a phone.
 */
import {
  newCampaign,
  realmOf,
  advance,
  busy,
  travelTo,
  rest,
  hexCost,
} from "../../games/crownless/rules/world.js";
import { partyWorth } from "../../games/crownless/rules/parties.js";
import { autoResolve, dismiss } from "../../games/crownless/rules/encounter.js";
import { MAX_BRIGANDS, MAX_WOLVES } from "../../games/crownless/rules/data/parties.js";
import { CULTURE_IDS } from "../../games/crownless/rules/data/world.js";
import { dist } from "../../games/crownless/rules/hex.js";

const [SEEDS = 50, DAYS = 200] = process.argv.slice(2).map(Number);
const TICK_MS = 1;
const DAY_MS = 30;
/** A party that hasn't changed hex in this long is stuck: none waits past 10 hours. */
const STUCK_DAYS = 7;

let failed = 0;
const problems = [];
const fail = (why) => {
  failed++;
  if (problems.length < 12) problems.push(why);
};
const ticks = [];
const days = [];
const tally = { met: 0, won: 0, lost: 0, draw: 0, chiefs: 0, bands: 0, packs: 0, far: 0 };
const pct = (list, p) => list[Math.min(list.length - 1, Math.floor(list.length * p))];

for (let seed = 1; seed <= SEEDS; seed++) {
  const culture = CULTURE_IDS[seed % CULTURE_IDS.length];
  const s = newCampaign({ seed, culture, background: "sellsword" });
  const realm = realmOf(s);
  const towns = realm.places.filter((p) => p.kind === "town" || p.kind === "castle");
  const seen = new Map(); // party id → [hex, hour it got there]
  let k = seed;
  for (let day = 0; day < DAYS; day++) {
    const d0 = performance.now();
    for (let h = 0; h < 24; h++) {
      if (s.encounter) {
        tally.met++;
        tally[autoResolve(s, realm).kind]++;
      }
      if (s.result) dismiss(s);
      if (!busy(s) && !travelTo(s, towns[(k = (k * 7 + 3) % towns.length)].i)) rest(s);
      const t0 = performance.now();
      advance(s, realm);
      ticks.push(performance.now() - t0);
    }
    days.push(performance.now() - d0);

    // What has to hold every day.
    const bands = s.parties.filter((p) => p.kind === "brigands");
    const packs = s.parties.filter((p) => p.kind === "wolves");
    if (bands.length > MAX_BRIGANDS || packs.length > MAX_WOLVES)
      fail(`seed ${seed} day ${day + 1}: ${bands.length} bands, ${packs.length} packs`);
    for (const p of s.parties) {
      const i = p.at.to >= 0 && p.at.progress >= 0.5 ? p.at.to : p.at.i;
      if (!Number.isFinite(hexCost(realm, p.at.i, "wild")) || !(p.at.progress >= 0))
        fail(`seed ${seed} day ${day + 1}: ${p.name} stands where nothing can (${p.at.i})`);
      if (!p.troops.length || p.troops.some((t) => !(t.n > 0)))
        fail(`seed ${seed} day ${day + 1}: ${p.name} has an empty stack`);
      const last = seen.get(p.id);
      if (!last || last[0] !== i) seen.set(p.id, [i, s.t]);
      else if (s.t - last[1] > STUCK_DAYS * 24 && p.goal !== "wait")
        fail(`seed ${seed} day ${day + 1}: ${p.name} stuck on ${i} as "${p.goal}"`);
      else if (s.t - last[1] > STUCK_DAYS * 24)
        fail(`seed ${seed} day ${day + 1}: ${p.name} waiting on ${i} for a week`);
      const home = realm.places[p.home];
      tally.far = Math.max(tally.far, dist(realm.grid, home.i, i));
    }
  }
  tally.bands += s.parties.filter((p) => p.kind === "brigands").length;
  tally.packs += s.parties.filter((p) => p.kind === "wolves").length;
  tally.chiefs += s.parties.filter((p) => p.chief).length;
  if (seed === 1) {
    const worths = s.parties
      .filter((p) => p.kind === "brigands")
      .map((p) => Math.round(partyWorth(p)));
    console.log(`seed 1, day ${DAYS}: bands worth ${worths.join(", ")}`);
  }
}

ticks.sort((a, b) => a - b);
days.sort((a, b) => a - b);
const ms = (v) => `${v.toFixed(2)} ms`;
console.log(`\n${SEEDS} seeds × ${DAYS} days, the player fighting whatever catches them\n`);
console.log(
  `meetings ${tally.met} (${(tally.met / SEEDS).toFixed(1)} a campaign): ` +
    `won ${tally.won}, lost ${tally.lost}, drawn ${tally.draw}`,
);
console.log(
  `at the end, on average: ${(tally.bands / SEEDS).toFixed(1)} bands (${(tally.chiefs / SEEDS).toFixed(1)} with chiefs), ` +
    `${(tally.packs / SEEDS).toFixed(1)} packs; the farthest any party got from home: ${tally.far} hexes`,
);
console.log(
  `tick: median ${ms(pct(ticks, 0.5))}, p99 ${ms(pct(ticks, 0.99))}, max ${ms(ticks.at(-1))}`,
);
console.log(
  `day:  median ${ms(pct(days, 0.5))}, p99 ${ms(pct(days, 0.99))}, max ${ms(days.at(-1))}`,
);
if (pct(ticks, 0.99) > TICK_MS) fail(`p99 tick ${ms(pct(ticks, 0.99))} is over ${TICK_MS} ms`);
if (pct(days, 0.99) > DAY_MS) fail(`p99 day ${ms(pct(days, 0.99))} is over ${DAY_MS} ms`);

console.log(failed ? `\nFAIL  ${failed} problems:\n  ${problems.join("\n  ")}` : "\nPASS");
process.exit(failed ? 1 : 0);
