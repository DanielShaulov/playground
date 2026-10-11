// Purity: the core and content must not touch the clock, Math.random, the DOM,
// storage or the network, and may import only each other. That is what keeps
// every game replayable from a seed and testable in Node.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../../../games/ferment/", import.meta.url);
const FORBIDDEN = [
  /\bMath\.random\b/,
  /\bDate\b/,
  /\bperformance\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bglobalThis\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bnavigator\b/,
  /\bfetch\s*\(/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\brequestAnimationFrame\b/,
  /\bconsole\./,
  /\bimport\s*\(/,
];

/** Source with comments and string contents blanked, so prose can say "Math.random". */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
}

for (const dir of ["core", "content"]) {
  for (const name of readdirSync(new URL(dir + "/", root)).filter((f) => f.endsWith(".js"))) {
    test(`purity: ${dir}/${name}`, () => {
      const src = readFileSync(new URL(`${dir}/${name}`, root), "utf8");
      const body = code(src);
      for (const re of FORBIDDEN) assert.ok(!re.test(body), `${dir}/${name} uses ${re.source}`);
      for (const [, from] of src.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
        assert.match(
          from,
          /^\.\.?\/(\.\.\/(core|content)\/)?[\w./-]+\.js$/,
          `${dir}/${name} imports ${from}`,
        );
        assert.ok(
          !from.includes("ui/") && !from.includes("shared/"),
          `${dir}/${name} imports ${from}`,
        );
      }
    });
  }
}

test("purity check bites: it would catch Math.random and a ui import", () => {
  assert.ok(FORBIDDEN.some((re) => re.test(code("const x = Math.random();"))));
  assert.ok(!FORBIDDEN.some((re) => re.test(code("// Math.random is banned\nconst s = 'Date';"))));
});
