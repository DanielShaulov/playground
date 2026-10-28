// Stamp a built copy of the site with its commit: build.json (bug reports
// read it) and ?v=<sha> on every game's stylesheet links. Run by
// build-pages.sh for main and each PR preview.
// Usage: node scripts/stamp-build.mjs <site dir> <sha> [pr number]
//
// Why the ?v=: a phone kept serving a game's old CSS days after a deploy
// while its JS was new, so new screens drew unstyled. A new URL per deploy
// can't be answered from any cache. (sw.js ignores the query offline.)
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function stamp(dir, sha, pr) {
  writeFileSync(join(dir, "build.json"), JSON.stringify(pr ? { sha, pr } : { sha }) + "\n");
  const v = sha.slice(0, 12);
  const games = join(dir, "games");
  for (const id of existsSync(games) ? readdirSync(games) : []) {
    const page = join(games, id, "index.html");
    if (!existsSync(page)) continue;
    const html = readFileSync(page, "utf8").replace(
      /(<link rel="stylesheet" href="\.{1,2}\/[^"?]+\.css)"/g,
      `$1?v=${v}"`,
    );
    writeFileSync(page, html);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, sha, pr] = process.argv.slice(2);
  if (!dir || !sha) throw new Error("usage: stamp-build.mjs <site dir> <sha> [pr]");
  stamp(dir, sha, pr ? Number(pr) : undefined);
}
