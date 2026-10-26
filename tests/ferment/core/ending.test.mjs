// The end of the first month (core/ending.js): due on the morning after day
// 30, seen once, and the shop plays on from it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../../games/ferment/core/index.js";
import { ENDING_DAY } from "../../../games/ferment/content/ending.js";
import { BOTS } from "../sim/bots.mjs";

const at = (day, phase = "morning") => {
  const s = C.newGame(4);
  s.clock.day = day;
  s.clock.phase = phase;
  return s;
};
const monthEnd = () =>
  C.loadSave(
    JSON.parse(readFileSync(new URL("./fixtures/month-end.json", import.meta.url), "utf8")),
  );

test("a new shop has not seen it, and an older save gets the default", () => {
  assert.deepEqual(C.newGame(1).ending, { seen: false, name: "" });
  const old = JSON.parse(JSON.stringify(C.newGame(1)));
  delete old.ending;
  assert.deepEqual(C.loadSave(old).ending, C.SLICES.ending());
});

test("due only on a morning after the first month, until seen", () => {
  assert.equal(C.endingDue(at(ENDING_DAY)), false, "not during the last day");
  assert.equal(C.endingDue(at(ENDING_DAY, "evening")), false, "not on its evening");
  assert.equal(C.endingDue(at(ENDING_DAY + 1)), true);
  assert.equal(C.endingDue(at(ENDING_DAY + 1, "open")), false, "never in the middle of a day");
  assert.equal(C.endingDue(at(ENDING_DAY + 9)), true, "a shop already past it gets it once too");
});

test("seen: only while due, once, and it keeps", () => {
  const early = C.step(at(ENDING_DAY), { type: "ending", do: "seen" });
  assert.equal(early.events[0].type, "rejected");
  assert.equal(
    C.step(at(ENDING_DAY + 1), { type: "ending", do: "next" }).events[0].type,
    "rejected",
  );
  const r = C.step(at(ENDING_DAY + 1), { type: "ending", do: "seen" });
  assert.deepEqual(r.events, [{ type: "endingSeen", day: ENDING_DAY + 1 }]);
  assert.equal(C.endingDue(r.state), false);
  assert.equal(C.loadSave(JSON.parse(JSON.stringify(r.state))).ending.seen, true);
  assert.equal(C.step(r.state, { type: "ending", do: "seen" }).events[0].type, "rejected");
});

test("sign: three letters, once, only while due; on time only on day 31", () => {
  const sign = (s, name) => C.step(s, { type: "ending", do: "sign", name });
  assert.equal(sign(at(ENDING_DAY), "ABC").events[0].type, "rejected", "not before it's due");
  for (const bad of ["AB", "ABCD", "abc", "A1C", 7, undefined])
    assert.equal(sign(at(ENDING_DAY + 1), bad).events[0].type, "rejected", `name ${bad}`);
  const r = sign(at(ENDING_DAY + 1), "HAD");
  assert.deepEqual(r.events, [{ type: "signed", name: "HAD", onTime: true }]);
  assert.equal(r.state.ending.name, "HAD");
  assert.equal(sign(r.state, "ZZZ").events[0].type, "rejected", "signed once");
  assert.ok(C.endingDue(r.state), "signing doesn't end the scene");
  assert.equal(sign(at(ENDING_DAY + 4), "HAD").events[0].onTime, false, "a late shop");
  const seen = C.step(r.state, { type: "ending", do: "seen" }).state;
  assert.equal(C.loadSave(JSON.parse(JSON.stringify(seen))).ending.name, "HAD");
});

test("the month in numbers, from a real save at the month's end", () => {
  const s = monthEnd();
  assert.ok(C.endingDue(s), "the fixture is waiting on it");
  const m = C.monthOf(s);
  assert.equal(m.days, ENDING_DAY);
  assert.equal(m.served, s.progress.stats.served);
  assert.equal(m.earned, s.progress.stats.earned);
  assert.ok(m.regulars.length > 0);
  const visits = m.regulars.map((id) => s.regulars.met[id].visits);
  assert.deepEqual(
    visits,
    [...visits].sort((a, b) => b - a),
    "most visits first",
  );
  assert.ok(m.tier.length > 0);
});

test("after it, the shop plays on", () => {
  let s = C.step(monthEnd(), { type: "ending", do: "seen" }).state;
  const until = s.clock.day + 3;
  for (let guard = 0; s.clock.day < until; guard++) {
    assert.ok(guard < 100000, `stuck on day ${s.clock.day}`);
    const r = C.step(s, BOTS.careful(s));
    assert.notEqual(r.events[0]?.type, "rejected", JSON.stringify(r.events[0]));
    s = r.state;
  }
  assert.equal(C.endingDue(s), false, "seen once is seen for good");
});
