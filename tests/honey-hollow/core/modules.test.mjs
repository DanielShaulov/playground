// What must hold of the game's modules as files, whatever they do.
//
// - No module waits at its top level. A module that does makes every module
//   that imports it wait too, and browsers have disagreed about what happens
//   when several importers arrive at once; the painted interface once hung on
//   a font this way. Wait inside a function and let the caller decide.
// - Every scene and sheet in the registries is a file that is there and
//   exports mount(). The game has no "not built yet" screens and says no
//   such thing.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const GAME = fileURLToPath(new URL("../../../games/honey-hollow/", import.meta.url));

function scripts(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? scripts(join(dir, e.name))
      : e.name.endsWith(".js")
        ? [join(dir, e.name)]
        : [],
  );
}
const FILES = scripts(GAME);
const parse = (file) =>
  ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

/** Lines where a module awaits outside every function. */
function topLevelAwaits(source) {
  const lines = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node)) return;
    if (ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier))
      lines.push(source.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lines;
}

test("the check sees a top-level await when there is one", () => {
  const src = (text) => ts.createSourceFile("x.js", text, ts.ScriptTarget.Latest, true);
  assert.deepEqual(topLevelAwaits(src("const a = 1;\nawait a;\n")), [2]);
  assert.deepEqual(topLevelAwaits(src("try {\n  await x();\n} catch {}\n")), [2]);
  assert.deepEqual(topLevelAwaits(src("for await (const x of y) {}\n")), [1]);
  assert.deepEqual(
    topLevelAwaits(src("async function f() { await x; }\nconst g = async () => await x;\n")),
    [],
  );
});

test("no module of the game waits at its top level", () => {
  assert.ok(FILES.length > 90, `only ${FILES.length} modules found`);
  const waits = FILES.flatMap((file) =>
    topLevelAwaits(parse(file)).map((line) => `${relative(GAME, file)}:${line}`),
  );
  assert.deepEqual(waits, []);
});

test("every registered scene and sheet is a module that exports mount()", () => {
  let seen = 0;
  for (const registry of ["ui/scenes/index.js", "ui/sheets/index.js"]) {
    const file = join(GAME, registry);
    const text = readFileSync(file, "utf8");
    const entries = [...text.matchAll(/^\s+(\w+): \(\) => import\("([^"]+)"\),$/gm)];
    assert.ok(entries.length >= 7, `${registry}: only ${entries.length} entries read`);
    // Nothing in a registry but plain entries: no name left pointing at a stand-in.
    const body = text.slice(
      text.indexOf("= {", text.indexOf("export const")) + 3,
      text.lastIndexOf("};"),
    );
    assert.equal(
      body.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length,
      entries.length,
      `${registry} has a line that is not a plain entry`,
    );
    for (const [, name, path] of entries) {
      const module = join(dirname(file), path);
      assert.ok(existsSync(module), `${registry}: "${name}" points at ${path}, which is not there`);
      assert.match(
        readFileSync(module, "utf8"),
        /^export (async )?function mount\(/m,
        `${registry}: "${name}" (${path}) exports no mount()`,
      );
      seen++;
    }
  }
  assert.ok(seen >= 18, `only ${seen} screens checked`);
});

test("the game never says a screen is not built", () => {
  const says = [];
  for (const file of FILES) {
    const text = readFileSync(file, "utf8");
    // Words the player could be shown: string and template literals, not comments.
    const visit = (node) => {
      if (
        (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) &&
        /not (yet )?built|not built yet|still being painted/i.test(node.getText())
      )
        says.push(`${relative(GAME, file)}: ${node.getText().slice(0, 60)}`);
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  assert.deepEqual(says, []);
});
