// Release saves: from the release on, a player's save is kept, never dropped.
// Each file in fixtures/ is a real save from the player's start (fixtures/make.js),
// frozen at release. Every later build must load each one, keep everything in
// it, and play on from it. If a build ever has to change a saved field, it
// migrates the field in loadSave() and says here what it now expects; the
// fixture files themselves never change.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as C from "../../../games/ferment/core/index.js";
import { BOTS } from "../sim/bots.mjs";

const DIR = new URL("./fixtures/", import.meta.url);
const FIXTURES = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(new URL(f, DIR), "utf8"))]);

test("the release fixtures are all there", () => {
  assert.deepEqual(FIXTURES.map(([name]) => name).sort(), [
    "evening",
    "first-morning",
    "high-tier",
    "kept-portions",
    "mid-tutorial",
    "regular-pending",
    "upgrades-crocks",
  ]);
});

for (const [name, raw] of FIXTURES) {
  test(`${name}: loads, keeping everything it saved`, () => {
    const s = C.loadSave(structuredClone(raw));
    assert.ok(s, "loadSave turned the save away");
    for (const [slice, fields] of Object.entries(raw))
      for (const [field, value] of Object.entries(fields))
        assert.deepEqual(s[slice][field], value, `${slice}.${field} changed on load`);
  });

  test(`${name}: survives a backup code`, () => {
    const back = C.readCode(C.saveCode(C.loadSave(structuredClone(raw))));
    assert.ok(back.ok, back.why);
    assert.deepEqual(back.state, C.loadSave(structuredClone(raw)));
  });

  test(`${name}: plays on for three days`, () => {
    let s = C.loadSave(structuredClone(raw));
    // A save from before the intro starts with it, as the phone would.
    if (s.tutorial.intro) s = C.step(s, { type: "tutorial", do: "begin" }).state;
    const until = s.clock.day + 3;
    for (let guard = 0; s.clock.day < until; guard++) {
      assert.ok(guard < 100000, `stuck on day ${s.clock.day}`);
      const action = BOTS.careful(s);
      const r = C.step(s, action);
      assert.notEqual(
        r.events[0]?.type,
        "rejected",
        `day ${s.clock.day}: ${JSON.stringify(action)} → ${r.events[0]?.why}`,
      );
      s = r.state;
    }
    assert.ok(s.shop.coins >= 0);
    assert.deepEqual(C.loadSave(JSON.parse(JSON.stringify(s))), s);
  });
}
