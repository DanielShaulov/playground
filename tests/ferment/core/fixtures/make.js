// Writes the release save fixtures: real saves from the player's start, each
// caught at a moment a phone could have saved it. Run once, by hand:
//
//   node tests/ferment/core/fixtures/make.js
//
// Run `npx prettier --write` on a new file. The files are frozen from the release on. A later build must still load
// them (tests/ferment/core/release-saves.test.mjs), so this script never
// overwrites one: delete a file only if you mean to retire that save.
import { existsSync, writeFileSync } from "node:fs";
import * as C from "../../../../games/ferment/core/index.js";
import { BOTS } from "../../sim/bots.mjs";

const DIR = new URL("./", import.meta.url);
const SEED = 3;

/** name → [what it is, test the state must pass]. The first state that passes is kept. */
const CASES = {
  "first-morning": ["day 1 before the intro scene", (s) => s.tutorial.intro],
  "mid-tutorial": [
    "day 1, open, a keeper's note showing and a scripted customer at the counter",
    (s) =>
      s.clock.phase === "open" &&
      s.tutorial.now !== null &&
      s.customers.queue.some((c) => c.script),
  ],
  "kept-portions": [
    "open, with portions of jars set aside for orders",
    (s) => s.clock.phase === "open" && s.orders.list.filter((o) => o.jars?.length).length >= 2,
  ],
  "regular-pending": [
    "a standing regular dropping in who hasn't joined yet",
    (s) => Object.values(s.regulars.met).some((m) => m.pending),
  ],
  evening: [
    "an evening after a day's trade, the takings on screen",
    (s) => s.clock.phase === "evening" && s.clock.day >= 3,
  ],
  "upgrades-crocks": [
    "more shelf, a crock fitted, jars started in it",
    (s) =>
      s.progress.upgrades.shelf >= 1 &&
      Object.keys(s.progress.crocks).length >= 1 &&
      s.shelf.slots.some((j) => j?.pace),
  ],
  "high-tier": [
    "tier 5, bigger jars, recipes found at the bench",
    (s) => s.progress.tier >= 5 && s.progress.upgrades.bigjars >= 1 && s.bench.known.length >= 1,
  ],
};

const caught = {};
let s = C.newGame(SEED, { tutorial: true });
const check = () => {
  for (const [name, [, test]] of Object.entries(CASES))
    if (!caught[name] && test(s)) caught[name] = structuredClone(s);
};
check();
s = C.step(s, { type: "tutorial", do: "begin" }).state;
for (let guard = 0; s.clock.day <= 40 && Object.keys(caught).length < 7; guard++) {
  if (guard > 500000) throw new Error("bot stuck");
  // Read each note as it comes, as a player would, so the notes move along.
  const tip = s.tutorial.now;
  const action =
    tip && guard % 40 === 0 ? { type: "tutorial", do: "next", id: tip.id } : BOTS.careful(s);
  const r = C.step(s, action);
  if (r.events[0]?.type !== "rejected") s = r.state;
  else if (action.type !== "tutorial") throw new Error(JSON.stringify(r.events[0]));
  else s = C.step(s, BOTS.careful(s)).state;
  check();
}

for (const [name, [what]] of Object.entries(CASES)) {
  const file = new URL(`${name}.json`, DIR);
  if (!caught[name]) console.log(`MISSING ${name}: ${what}`);
  else if (existsSync(file)) console.log(`kept    ${name} (already frozen)`);
  else {
    writeFileSync(file, JSON.stringify(caught[name]) + "\n");
    console.log(`wrote   ${name}: day ${caught[name].clock.day} ${caught[name].clock.phase}`);
  }
}
