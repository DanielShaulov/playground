// Purity: the core and the content are plain data and pure functions. They
// never ask the time, roll their own dice or touch a browser; they import
// nothing but each other; and the screens reach them through core/index.js
// alone. Checked twice: by reading the source, and by playing a game with
// Math.random and Date.now switched off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { C, playOut } from "./helpers.mjs";
import { makeBot } from "../sim/bots.mjs";

const GAME = new URL("../../../games/honey-hollow/", import.meta.url);
const filesIn = (dir, deep = false) =>
  readdirSync(new URL(dir, GAME), { recursive: deep })
    .map(String)
    .filter((f) => f.endsWith(".js"))
    .map((f) => `${dir}${f.replaceAll("\\", "/")}`);
const read = (file) => readFileSync(new URL(file, GAME), "utf8");

/**
 * The source without comments and with every string emptied (`bare`), and the
 * strings themselves in order (`strings`): in `marked` each string is its
 * number in that list, so a word inside a string is never mistaken for code.
 */
function strip(text) {
  let marked = "";
  let bare = "";
  const strings = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && d === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      marked += `${c}#${strings.length}${c}`;
      strings.push(text.slice(i + 1, j));
      bare += c + c;
      i = j + 1;
    } else {
      marked += c;
      bare += c;
      i++;
    }
  }
  return { marked, bare, strings };
}
/** Every module a source file imports from, statically or with import(). */
const importsOf = (text) => {
  const { marked, strings } = strip(text);
  return [...marked.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'`]#(\d+)["'`]/g)].map(
    (m) => strings[Number(m[1])],
  );
};

const IMPURE =
  /\b(Math\s*\.\s*random|Date|performance|document|window|localStorage|sessionStorage|indexedDB|navigator|location|setTimeout|setInterval|requestAnimationFrame|fetch|XMLHttpRequest|globalThis|process|require|console|crypto)\b/;

test("strip() tells code from comments and strings (or the checks below see nothing)", () => {
  const { bare, strings } = strip(
    'const a = "Date // not a comment"; // Math.random()\n/* window */ const b = `x${1}`; const c = Date.now();',
  );
  assert.equal(bare, 'const a = ""; \n const b = ``; const c = Date.now();');
  assert.deepEqual(strings, ["Date // not a comment", "x${1}"]);
  assert.match(bare, IMPURE);
  assert.doesNotMatch(strip('const a = "Date"; // Date\n').bare, IMPURE);
  assert.deepEqual(
    importsOf(
      'import { a } from "./a.js";\nexport { b } from "../content/b.js";\nconst c = await import("./c.js");\nconst d = "came from"; const e = "./d.js";',
    ),
    ["./a.js", "../content/b.js", "./c.js"],
  );
});

test("core and content: no clock, no dice, no browser, and no imports but each other", () => {
  const core = filesIn("core/");
  const content = filesIn("content/");
  assert.ok(core.length >= 12 && content.length >= 9, "found the files");
  for (const file of [...core, ...content]) {
    const hit = strip(read(file)).bare.match(IMPURE);
    assert.equal(hit, null, `${file} uses ${hit?.[0]}`);
    const inCore = file.startsWith("core/");
    for (const spec of importsOf(read(file)))
      assert.match(
        spec,
        inCore ? /^(\.\/|\.\.\/content\/)[a-z-]+\.js$/ : /^\.\/[a-z-]+\.js$/,
        `${file} imports ${spec}`,
      );
  }
});

test("the screens reach the rules through core/index.js alone", () => {
  const ui = filesIn("ui/", true);
  assert.ok(ui.length >= 5, "found the screens");
  let through = 0;
  for (const file of ui)
    for (const spec of importsOf(read(file))) {
      if (!/(^|\/)(core|content)\//.test(spec)) continue;
      assert.match(spec, /(^|\/)core\/index\.js$/, `${file} imports ${spec}`);
      through++;
    }
  assert.ok(through >= 1, "at least one screen imports the core");
});

test("index.js hands out the whole public face: every action handler's module, and nothing undefined", () => {
  for (const [name, value] of Object.entries(C)) assert.notEqual(value, undefined, name);
  for (const fn of ["newGame", "loadSave", "step"]) assert.equal(typeof C[fn], "function");
});

test("a game plays with Math.random and Date.now switched off, and the same seed plays the same game", () => {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => {
    throw new Error("Math.random was called");
  };
  Date.now = () => {
    throw new Error("Date.now was called");
  };
  let a;
  let b;
  let other;
  try {
    a = playOut(makeBot("sensible", 5), 5, 20);
    b = playOut(makeBot("sensible", 5), 5, 20);
    other = playOut(makeBot("sensible", 6), 6, 20);
  } finally {
    Math.random = random;
    Date.now = now;
  }
  assert.deepEqual(a.actions, b.actions);
  assert.deepEqual(a.state, b.state);
  assert.notEqual(
    JSON.stringify(a.state.meta.rng),
    JSON.stringify(other.state.meta.rng),
    "another seed is another game",
  );
});
