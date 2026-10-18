// Backup codes (core/save.js): a shop survives being turned into a code and
// pasted back, and every kind of bad paste is turned away with a reason
// instead of loading something half-broken.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { playBot, BOTS } from "./helpers.mjs";

const json = (s) => JSON.parse(JSON.stringify(s));

test("a fresh shop and a played one round-trip through a code", () => {
  for (const state of [
    C.newGame(3),
    playBot(BOTS.careful, 5, 2).state,
    playBot(BOTS.careful, 9, 5).state,
  ]) {
    const back = C.readCode(C.saveCode(state));
    assert.equal(back.ok, true);
    assert.deepEqual(back.state, C.loadSave(json(state)));
  }
});

test("a loaded code plays on exactly like the original", () => {
  const { state } = playBot(BOTS.careful, 7, 3);
  const back = C.readCode(C.saveCode(state)).state;
  const a = C.step(state, { type: "tick", n: 500 });
  const b = C.step(back, { type: "tick", n: 500 });
  assert.deepEqual(json(b), json(a));
});

test("the code is one line of safe characters", () => {
  const code = C.saveCode(playBot(BOTS.careful, 5, 2).state);
  assert.match(code, /^BRINE1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{6}$/);
});

test("non-ASCII text in a save survives", () => {
  const s = json(C.newGame(4));
  s.regulars.met = { "Zoë 🥒": { visits: 1 } };
  const back = C.readCode(C.saveCode(s));
  assert.equal(back.ok, true);
  assert.deepEqual(back.state.regulars.met, s.regulars.met);
});

test("spaces and line breaks from a chat app are ignored", () => {
  const code = C.saveCode(C.newGame(5));
  const wrapped = "  " + code.match(/.{1,40}/g).join("\n ") + "\n";
  assert.equal(C.readCode(wrapped).ok, true);
});

test("bad pastes are turned away with a reason", () => {
  const code = C.saveCode(playBot(BOTS.careful, 5, 2).state);
  const [tag, body, sum] = code.split(".");
  const why = (t) => C.readCode(t).why;
  assert.equal(why(""), "empty");
  assert.equal(why("   \n"), "empty");
  assert.equal(why(undefined), "empty");
  assert.equal(why("hello there"), "notACode");
  assert.equal(why(JSON.stringify(C.newGame(1))), "notACode");
  assert.equal(why(code.slice(0, -10)), "damaged"); // cut short
  assert.equal(why(code.slice(0, code.length / 2)), "damaged");
  assert.equal(why(`${tag}.${body}`), "damaged"); // no checksum
  assert.equal(why(`${tag}.${body}.${sum}.x`), "damaged");
  assert.equal(why(`${tag}.${body.slice(0, 50)}%${body.slice(51)}.${sum}`), "damaged"); // bad character
  // one character changed anywhere in the body
  for (const at of [0, 7, Math.floor(body.length / 2), body.length - 2]) {
    const c = body[at] === "A" ? "B" : "A";
    assert.equal(
      why(`${tag}.${body.slice(0, at)}${c}${body.slice(at + 1)}.${sum}`),
      "damaged",
      `at ${at}`,
    );
  }
});

test("a well-formed code of something that isn't a shop is unplayable", () => {
  // Build a code for a non-save with the real encoder, so only loadSave() can refuse it.
  for (const raw of [{ hello: 1 }, [1, 2], { ...json(C.newGame(2)), shelf: { slots: [1] } }]) {
    const code = C.saveCode(/** @type {any} */ (raw));
    assert.equal(C.readCode(code).why, "unplayable");
  }
});
