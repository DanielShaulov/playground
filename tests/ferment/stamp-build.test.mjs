// scripts/stamp-build.mjs: what the deploy writes into each built copy of the site.
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stamp } from "../../scripts/stamp-build.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;

test("a deploy stamps build.json and versions every game's stylesheets", () => {
  // A phone drew new decor screens with day-old CSS: links must change per deploy.
  const dir = mkdtempSync(join(tmpdir(), "site-"));
  try {
    cpSync(join(ROOT, "games"), join(dir, "games"), { recursive: true });
    stamp(dir, "f291e5dc3c390c65bec880c832806fd71b8b954c", 58);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "build.json"), "utf8")), {
      sha: "f291e5dc3c390c65bec880c832806fd71b8b954c",
      pr: 58,
    });
    const page = readFileSync(join(dir, "games/ferment/index.html"), "utf8");
    const links = [...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(links.length >= 9);
    for (const href of links) assert.match(href, /\.css\?v=f291e5dc3c39$/, href);
    // The repo's own copy stays unstamped.
    assert.doesNotMatch(readFileSync(join(ROOT, "games/ferment/index.html"), "utf8"), /\?v=/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a deploy gives every script of every game its build's address", () => {
  // A phone brought a tab back with some scripts from an older build and the
  // rest fetched new: they did not fit, and a screen would not load. The page's
  // own script is rewritten; an import map sends every other module the same way.
  const dir = mkdtempSync(join(tmpdir(), "site-"));
  try {
    cpSync(join(ROOT, "games"), join(dir, "games"), { recursive: true });
    cpSync(join(ROOT, "shared"), join(dir, "shared"), { recursive: true });
    stamp(dir, "f291e5dc3c390c65bec880c832806fd71b8b954c");
    const scripts = (at, under = "") =>
      readdirSync(join(dir, at), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? scripts(join(at, e.name), `${under}${e.name}/`)
          : e.name.endsWith(".js")
            ? [`${under}${e.name}`]
            : [],
      );
    const shared = scripts("shared").map((f) => `../../shared/${f}`);
    assert.ok(shared.includes("../../shared/storage.js"));
    let pages = 0;
    for (const id of readdirSync(join(dir, "games"))) {
      const page = readFileSync(join(dir, "games", id, "index.html"), "utf8");
      const maps = [...page.matchAll(/<script type="importmap">(.*?)<\/script>/gs)];
      assert.equal(maps.length, 1, `${id}: one import map`);
      const first = page.indexOf('<script type="module"');
      assert.ok(first > page.indexOf('<script type="importmap">'), `${id}: the map comes first`);
      assert.match(
        page.slice(first),
        /^<script type="module" src="\.\/[\w/.-]+\.js\?v=f291e5dc3c39">/,
        `${id}: the page's own script`,
      );
      const { imports } = JSON.parse(maps[0][1]);
      const want = [...scripts(join("games", id)).map((f) => `./${f}`), ...shared].sort();
      assert.deepEqual(Object.keys(imports).sort(), want, `${id}: every module is in the map`);
      for (const [from, to] of Object.entries(imports))
        assert.equal(to, `${from}?v=f291e5dc3c39`, `${id}: ${from}`);
      pages++;
    }
    assert.ok(pages >= 9, `only ${pages} games stamped`);
    // Stamping what is already stamped changes nothing more.
    const before = readFileSync(join(dir, "games/honey-hollow/index.html"), "utf8");
    stamp(dir, "f291e5dc3c390c65bec880c832806fd71b8b954c");
    assert.equal(readFileSync(join(dir, "games/honey-hollow/index.html"), "utf8"), before);
    // The repo's own copy stays unstamped.
    assert.doesNotMatch(readFileSync(join(ROOT, "games/ferment/index.html"), "utf8"), /importmap/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
