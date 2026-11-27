// Replay goldens: a seed and an action list replay a game exactly. Each file
// in goldens/ is a game one of the sim's keepers once played: its actions,
// and what the game looked like after every night and at the end.
//
// A golden fails when a rule or a number changes how games play out. If the
// change was meant, record them again and say so in the change:
//
//   UPDATE_GOLDENS=1 node --test tests/honey-hollow/core/replay.test.mjs
//   npx prettier --write tests/honey-hollow/core/goldens
//
// The recorded actions are replayed as they are, so a golden also proves that
// a save made of (seed, actions) still loads: none may be refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { C, playOut } from "./helpers.mjs";
import { makeBot } from "../sim/bots.mjs";

const DIR = new URL("./goldens/", import.meta.url);
const RUNS = [
  ["sensible", 1, 20],
  ["lazy", 2, 40],
  ["greedy", 3, 30],
  ["completionist", 4, 35],
];

const digest = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 12);
const look = (s) => ({
  day: s.clock.day,
  phase: s.clock.phase,
  coins: s.purse.coins,
  renown: s.progress.renown,
  jars: s.progress.stats.jars,
  goals: s.progress.claimed.length,
  pages: s.book.facts.length,
  hives: s.hives.list.map((h) => `${h.type} ${h.strength}`),
});

/** Replay `actions` from a new game. Returns the end state, a digest after every night, and how often each event came. */
function replay(seed, actions) {
  let state = C.newGame(seed);
  const nights = [];
  const events = {};
  actions.forEach((action, i) => {
    const r = C.step(state, action);
    if (r.events[0]?.type === "rejected")
      assert.fail(
        `action ${i} of the recording, ${JSON.stringify(action)}, is now refused: ${r.events[0].why} (day ${state.clock.day}, ${state.clock.phase})`,
      );
    for (const e of r.events) events[e.type] = (events[e.type] ?? 0) + 1;
    state = r.state;
    if (action.type === "sleep") nights.push(digest(state));
  });
  return { state, nights, events };
}

for (const [kind, seed, days] of RUNS) {
  const file = new URL(`${kind}-${seed}.json`, DIR);
  test(`golden: a ${kind} keeper's ${days} days on seed ${seed} replay exactly`, () => {
    if (process.env.UPDATE_GOLDENS) {
      const { actions } = playOut(makeBot(kind, seed), seed, days);
      const r = replay(seed, actions);
      mkdirSync(DIR, { recursive: true });
      const head = {
        kind,
        seed,
        days,
        end: look(r.state),
        state: digest(r.state),
        events: r.events,
        nights: r.nights,
      };
      writeFileSync(
        file,
        `${JSON.stringify(head).slice(0, -1)},"actions":[\n${actions.map((a) => JSON.stringify(a)).join(",\n")}\n]}\n`,
      );
    }
    const golden = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual([golden.kind, golden.seed, golden.days], [kind, seed, days]);
    const r = replay(seed, golden.actions);
    const first = r.nights.findIndex((d, i) => d !== golden.nights[i]);
    assert.equal(
      first,
      -1,
      `the game first differs from the recording after the night of day ${first + 1}`,
    );
    assert.deepEqual(look(r.state), golden.end);
    assert.deepEqual(r.events, golden.events);
    assert.equal(digest(r.state), golden.state);
    assert.equal(r.nights.length, days);
  });
}
