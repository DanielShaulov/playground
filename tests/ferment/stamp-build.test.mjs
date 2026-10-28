// scripts/stamp-build.mjs: what the deploy writes into each built copy of the site.
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
