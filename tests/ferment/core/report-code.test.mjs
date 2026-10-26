// Bug report codes (ui/report-code.js): a report survives the trip through an
// email (re-wrapped, pasted whole, surrounded by the player's note), stays
// small enough for a mailto: link on the biggest release save, and a damaged
// one is turned away instead of half-read. Replaying a report's trail lands
// on its shop, ticks merged or not.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../../games/ferment/core/index.js";
import { encodeReport, decodeReport, replayReport } from "../../../games/ferment/ui/report-code.js";

const fixture = (name) =>
  C.loadSave(JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")));
const json = (s) => JSON.parse(JSON.stringify(s));

function played() {
  const start = C.newGame(11, { tutorial: false });
  const actions = [
    { type: "open" },
    { type: "tick", n: 40 },
    { type: "tick", n: 60 },
    { type: "sendAway" },
    { type: "tick", n: 200 },
  ];
  let now = start;
  for (const a of actions) now = C.step(now, a).state;
  return { start, actions, now };
}

test("a report round-trips, including non-ASCII text", async () => {
  const r = {
    v: 1,
    ...played(),
    taps: [{ act: "slot", data: { slot: "0" } }],
    errors: [],
    note: "Zoë 🥒",
  };
  assert.deepEqual(await decodeReport(await encodeReport(r)), json(r));
});

test("the code is wrapped in short lines of safe characters", async () => {
  const code = await encodeReport({ v: 1, ...played() });
  assert.match(code, /^FERMENT-REPORT1\.z\./);
  for (const line of code.split("\n")) assert.match(line, /^[A-Za-z0-9_.\-]{1,76}$/);
});

test("found inside a whole email, re-wrapped by a mail app", async () => {
  const r = { v: 1, ...played() };
  const code = await encodeReport(r);
  const rewrapped = code
    .replace(/\n/g, "")
    .match(/.{1,50}/g)
    .join("\r\n ");
  const email = `The jar vanished!\r\n\r\n-- Added by the game. --\r\nDay 2 · build abc1234\r\n\r\n${rewrapped}\r\n\r\nSent from my iPhone`;
  assert.deepEqual(await decodeReport(email), json(r));
});

test("a line break anywhere past the tag still reads, even inside END", async () => {
  const r = { v: 1, ...played() };
  const flat = (await encodeReport(r)).replace(/\n/g, "");
  for (let k = "FERMENT-REPORT1.".length; k < flat.length; k++)
    assert.deepEqual(
      await decodeReport(flat.slice(0, k) + "\n" + flat.slice(k)),
      json(r),
      `break at ${k}`,
    );
});

test("a damaged or missing code reads as null", async () => {
  const code = await encodeReport({ v: 1, ...played() });
  assert.equal(await decodeReport("no report here"), null);
  assert.equal(await decodeReport(code.slice(0, code.length / 2)), null);
  assert.equal(await decodeReport(code.replace(/\.z\.(...)/, ".z.AAA")), null);
  assert.equal(await decodeReport(42), null);
});

test("the biggest release save, twice over with a long trail, stays mailable", async () => {
  const big = fixture("high-tier");
  const actions = Array.from({ length: 300 }, (_, i) =>
    i % 2 ? { type: "tick", n: 37 } : { type: "serve", slot: i % 6 },
  );
  const code = await encodeReport({ v: 1, start: big, actions, now: big, taps: [], errors: [] });
  // Mail apps take far longer links, but a short code is also a short wall of text.
  assert.ok(code.length < 16000, `report code is ${code.length} characters`);
});

test("replaying the trail lands on the reported shop", () => {
  const { start, actions, now } = played();
  assert.equal(replayReport(json({ start, actions, now }), C.step).matches, true);
  const merged = [actions[0], { type: "tick", n: 100 }, ...actions.slice(3)];
  assert.equal(
    replayReport(json({ start, actions: merged, now }), C.step).matches,
    true,
    "merged ticks replay the same",
  );
  assert.equal(
    replayReport(json({ start, actions: actions.slice(0, 3), now }), C.step).matches,
    false,
  );
});
