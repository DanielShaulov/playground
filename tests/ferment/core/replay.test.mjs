// Replay goldens: a seed plus a recorded action list must reach exactly the
// recorded end state. A PR that changes how games play out on purpose
// regenerates them in the same PR and says why:
//   UPDATE_GOLDENS=1 node --test tests/ferment/core/replay.test.mjs
// The diff of goldens/*.json then shows exactly what moved.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { playBot, replay, BOTS } from "./helpers.mjs";

const GOLDENS = [
  { name: "careful-seed1-5days", bot: "careful", seed: 1, days: 5 },
  { name: "careful-seed42-5days", bot: "careful", seed: 42, days: 5 },
  { name: "careless-seed7-5days", bot: "careless", seed: 7, days: 5 },
  { name: "idle-seed3-3days", bot: "idle", seed: 3, days: 3 },
];
const file = (name) => new URL(`./goldens/${name}.json`, import.meta.url);

/** Merge back-to-back ticks (same result, smaller file). */
function compact(actions) {
  const out = [];
  for (const a of actions) {
    const last = out[out.length - 1];
    if (a.type === "tick" && last?.type === "tick") last.n = (last.n ?? 1) + (a.n ?? 1);
    else out.push({ ...a });
  }
  return out;
}

function eventCounts(events) {
  const n = {};
  for (const e of events) {
    const k =
      e.type === "left" ? `left:${e.why}` : e.type === "served" ? `served:${e.mood}` : e.type;
    n[k] = (n[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(n).sort());
}

/** One action per line so a golden diff reads well. */
function serialise(g) {
  const lines = g.actions.map((a) => "    " + JSON.stringify(a));
  const head = JSON.stringify(
    { seed: g.seed, bot: g.bot, days: g.days, events: g.events },
    null,
    2,
  ).slice(0, -2);
  return `${head},\n  "actions": [\n${lines.join(",\n")}\n  ],\n  "end": ${JSON.stringify(g.end, null, 2).replace(/\n/g, "\n  ")}\n}\n`;
}

for (const g of GOLDENS) {
  test(`replay golden: ${g.name}`, async () => {
    if (process.env.UPDATE_GOLDENS) {
      const played = playBot(BOTS[g.bot], g.seed, g.days);
      const actions = compact(played.actions);
      const text = serialise({
        ...g,
        events: eventCounts(played.events),
        actions,
        end: played.state,
      });
      // Write it the way `npm run format` would, so formatting never shows up in a golden diff.
      const prettier = await import("prettier");
      const options = {
        ...(await prettier.resolveConfig(fileURLToPath(file(g.name)))),
        parser: "json",
      };
      writeFileSync(file(g.name), await prettier.format(text, options));
    }
    const golden = JSON.parse(readFileSync(file(g.name), "utf8"));
    const { state, events } = replay(golden.seed, golden.actions);
    assert.deepEqual(eventCounts(events), golden.events, "event counts moved");
    assert.deepEqual(JSON.parse(JSON.stringify(state)), golden.end, "end state moved");
    // The bot that recorded it still plays the same game too.
    const again = playBot(BOTS[g.bot], g.seed, g.days);
    assert.deepEqual(
      compact(again.actions),
      golden.actions,
      "bot no longer plays the recorded game",
    );
  });
}
