// The offline warm-up (ui/offline.js) must name every stylesheet a screen
// loads for itself, or that screen is missing on a day without signal.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UI = fileURLToPath(new URL("../../../games/honey-hollow/ui/", import.meta.url));

/** Every .css under ui/, as "./path" from ui/. */
function stylesheets(dir = "") {
  return readdirSync(UI + dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? stylesheets(`${dir}${e.name}/`)
      : e.name.endsWith(".css")
        ? [`./${dir}${e.name}`]
        : [],
  );
}

test("the offline warm-up names every stylesheet a screen loads", () => {
  const source = readFileSync(UI + "offline.js", "utf8");
  const listed = [...source.matchAll(/"(\.\/[^"]+\.css)"/g)].map((m) => m[1]).sort();
  // index.html links these two itself, so the worker has them from the start.
  const fromPage = ["./base.css", "./shell.css"];
  const wanted = stylesheets()
    .filter((f) => !fromPage.includes(f))
    .sort();
  assert.deepEqual(listed, wanted);
});
