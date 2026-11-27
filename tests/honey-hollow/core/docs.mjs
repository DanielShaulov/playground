// What the docs promise, read out of the docs themselves, so the tests can
// hold the code to it (and the docs to the code). No tests in here.
import { readFileSync } from "node:fs";
import * as C from "../../../games/honey-hollow/core/index.js";

const DOCS = new URL("../../../docs/honey-hollow/", import.meta.url);
export const readDoc = (name) => readFileSync(new URL(name, DOCS), "utf8");

/** The lines under a heading, up to the next heading of the same or a higher level. */
export function section(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`no "${heading}" in the doc`);
  const level = heading.match(/^#+/)[0].length;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^(#+) /);
    if (m && m[1].length <= level) break;
    out.push(line);
  }
  return out;
}

/** The `why` codes architecture.md lists: the first cell of each row of its "Why codes" table. */
export function documentedWhys() {
  const out = new Set();
  const lines = section(readDoc("architecture.md"), "### Why codes");
  lines.forEach((line, i) => {
    // The header row is the one above the rule of dashes.
    if (/^\|\s*-+/.test(lines[i + 1] ?? "")) return;
    const m = line.match(/^\| `([a-z-]+)`\s*\|/);
    if (m) out.add(m[1]);
  });
  return out;
}

/** The action and event names architecture.md lists, from the first cell of each table row. */
export function documentedNames(heading) {
  const out = new Set();
  for (const line of section(readDoc("architecture.md"), heading)) {
    const m = line.match(/^\| `([A-Za-z]+)`/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** The bee book's trigger keys as rules.md lists them, with the `<...>` families written out. */
export function documentedTriggers() {
  const text = readDoc("rules.md");
  const from = text.indexOf("**The bee book.**");
  const para = text.slice(from, text.indexOf("\n\n", text.indexOf("Keys:", from) + 8));
  const keys = [...para.slice(para.indexOf("Keys:")).matchAll(/`([a-z0-9<>-]+)`/g)].map(
    (m) => m[1],
  );
  const out = [];
  for (const key of keys) {
    if (key === "honey-<flower>") out.push(...C.FLOWER_IDS.map((f) => `honey-${f}`));
    else if (key === "renown-<tier>") out.push(...C.TIERS.slice(1).map((t) => `renown-${t.tier}`));
    else if (key === "gift-<regular>-<n>")
      out.push(
        ...C.REGULAR_IDS.flatMap((r) => C.TUNING.HEART_GIFTS.map((_, i) => `gift-${r}-${i + 1}`)),
      );
    else out.push(key);
  }
  return out;
}
