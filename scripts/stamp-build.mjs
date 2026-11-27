// Stamp a built copy of the site with its commit: build.json (bug reports
// read it) and, on every game's page, ?v=<sha> on its stylesheet links and
// on every script it can load. Run by build-pages.sh for main and each PR
// preview.
// Usage: node scripts/stamp-build.mjs <site dir> <sha> [pr number]
//
// Why the ?v=: a phone kept serving a game's old CSS days after a deploy
// while its JS was new, so new screens drew unstyled. Later a phone brought
// a tab back with some of its scripts from an older build and the rest
// fetched new; they did not fit, and a screen would not load. A new URL per
// deploy can't be answered from any cache. (sw.js ignores the query offline.)
//
// Scripts get theirs two ways: the page's own <script type="module" src> is
// rewritten, and an import map sends every other module of the game, and
// every shared one, to the same file with ?v= on it. An import map rewrites
// `import` wherever it is written, so the games' sources stay as they are.
// A browser too old for import maps loads the plain URLs, as before.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Every .js under `dir`, as paths from it with forward slashes. */
function scripts(dir, under = "") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) =>
      e.isDirectory()
        ? scripts(join(dir, e.name), `${under}${e.name}/`)
        : e.name.endsWith(".js")
          ? [`${under}${e.name}`]
          : [],
    );
}

export function stamp(dir, sha, pr) {
  writeFileSync(join(dir, "build.json"), JSON.stringify(pr ? { sha, pr } : { sha }) + "\n");
  const v = sha.slice(0, 12);
  const games = join(dir, "games");
  const shared = scripts(join(dir, "shared")).map((f) => `../../shared/${f}`);
  for (const id of existsSync(games) ? readdirSync(games) : []) {
    const page = join(games, id, "index.html");
    if (!existsSync(page)) continue;
    let html = readFileSync(page, "utf8").replace(
      /(<link rel="stylesheet" href="\.{1,2}\/[^"?]+\.css)"/g,
      `$1?v=${v}"`,
    );
    // Only a page of modules, and never over an import map of its own.
    const first = html.search(/<script type="module"/);
    if (first >= 0 && !/<script type="importmap"/.test(html)) {
      const own = scripts(join(games, id)).map((f) => `./${f}`);
      const imports = Object.fromEntries([...own, ...shared].map((f) => [f, `${f}?v=${v}`]));
      // The map has to come before the first module script.
      html =
        html.slice(0, first) +
        `<script type="importmap">${JSON.stringify({ imports })}</script>\n    ` +
        html
          .slice(first)
          .replace(/(<script type="module" src="\.{1,2}\/[^"?]+\.js)"/g, `$1?v=${v}"`);
    }
    writeFileSync(page, html);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, sha, pr] = process.argv.slice(2);
  if (!dir || !sha) throw new Error("usage: stamp-build.mjs <site dir> <sha> [pr]");
  stamp(dir, sha, pr ? Number(pr) : undefined);
}
