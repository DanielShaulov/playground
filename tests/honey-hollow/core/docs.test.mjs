// The notes are held to the code, and the code to the notes: what
// architecture.md lists (actions, events, why codes, the state's shape,
// everything index.js exports) and what rules.md's tables and numbers say.
// The bee book's keys are checked in book.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { C, T, fresh } from "./helpers.mjs";
import { readDoc, section, documentedWhys, documentedNames } from "./docs.mjs";

const CORE = new URL("../../../games/honey-hollow/core/", import.meta.url);
const source = readdirSync(CORE)
  .filter((f) => f.endsWith(".js"))
  .map((f) => readFileSync(new URL(f, CORE), "utf8"))
  .join("\n");
const arch = readDoc("architecture.md");
const rules = readDoc("rules.md");

/** The rows of the markdown table whose first header cell starts with `head`, as lists of cells. */
function table(text, head) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`| ${head}`));
  assert.ok(start >= 0, `no table starting "| ${head}"`);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(
      line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  }
  return rows;
}

test("architecture.md lists every action, and no action that is not one", () => {
  assert.deepEqual([...documentedNames("### Actions")].sort(), Object.keys(C.ACTIONS).sort());
});

test("architecture.md lists every event the core raises, and no other", () => {
  const raised = new Set(
    [...source.matchAll(/events\.push\(\{\s*type:\s*"([A-Za-z]+)"/g)].map((m) => m[1]),
  );
  raised.add("rejected");
  assert.ok(raised.size >= 40, "found the events in the source");
  assert.deepEqual([...documentedNames("### Events")].sort(), [...raised].sort());
});

test("architecture.md lists every why code the core returns, and none it does not", () => {
  const listed = documentedWhys();
  const returned = new Set(
    [...source.matchAll(/return\s+"([a-z]+(?:-[a-z]+)+)"/g)].map((m) => m[1]),
  );
  assert.ok(returned.size >= 50, "found the why codes in the source");
  for (const why of returned)
    assert.ok(listed.has(why), `"${why}" is returned by the core and not in the list`);
  const made = (why) =>
    source.includes(`"${why}"`) ||
    (/^no-(candle|soap)$/.test(why) && source.includes("`no-${part}`"));
  for (const why of listed)
    assert.ok(made(why), `"${why}" is listed, and nothing in the core says it`);
});

test("architecture.md names everything index.js exports", () => {
  for (const name of Object.keys(C))
    assert.match(arch, new RegExp(`\`${name}[\`(]`), `${name} is exported and not in the notes`);
});

test("architecture.md's state block has every slice and every field", () => {
  const block = section(arch, "### State").join("\n");
  const s = C.newGame(1);
  assert.deepEqual(Object.keys(s), Object.keys(C.SLICES));
  for (const slice of Object.keys(C.SLICES)) {
    assert.match(block, new RegExp(`^${slice}\\s+\\{`, "m"), `no ${slice} slice in the notes`);
    for (const key of Object.keys(s[slice]))
      assert.match(block, new RegExp(`\\b${key}\\b`), `${slice}.${key} is not in the notes`);
  }
  for (const key of Object.keys(s.hives.list[0]))
    assert.match(block, new RegExp(`\\b${key}\\b`), `a hive's ${key} is not in the notes`);
  for (const key of Object.keys(s.hives.list[0].today))
    assert.match(block, new RegExp(`\\b${key}\\b`), `a hive's today.${key} is not in the notes`);
  for (const key of Object.keys(s.progress.today))
    assert.match(block, new RegExp(`\\b${key}\\b`), `progress.today.${key} is not in the notes`);
});

test("architecture.md gives the helpers' shapes as they are returned", () => {
  const s = fresh();
  const shape = (o) => `{ ${Object.keys(o).join(", ")} }`;
  assert.ok(arch.includes(shape(C.forecast(s, 1))), `forecast returns ${shape(C.forecast(s, 1))}`);
  assert.ok(arch.includes(shape(C.careOf(s, 1))), `careOf returns ${shape(C.careOf(s, 1))}`);
  assert.ok(arch.includes(shape(C.tierOf(s))), `tierOf returns ${shape(C.tierOf(s))}`);
  assert.ok(
    arch.includes(shape(C.recipesNow(s)[0])),
    `recipesNow rows are ${shape(C.recipesNow(s)[0])}`,
  );
  assert.ok(arch.includes(shape(C.calendarOf(1))), `calendarOf returns ${shape(C.calendarOf(1))}`);
  const night = arch.split("\n").find((l) => l.includes("`tomorrow(state)`"));
  for (const key of Object.keys(C.tomorrow(s)))
    assert.match(night, new RegExp(`\\b${key}\\b`), `tomorrow().${key} is not in the notes`);
  const hat = C.wardrobeNow(s).hat[0];
  assert.ok(arch.includes(shape(hat)), `wardrobeNow rows are ${shape(hat)}`);
});

test("rules.md: the tables say what the content says", () => {
  const where = { any: "anywhere", tree: "orchard tree", hill: "hill", water: "beside water" };
  assert.deepEqual(
    table(rules, "Flower").map((r) => [r[0], r[1], r[2], r[3], r[4], r[6]]),
    C.FLOWER_IDS.map((id) => {
      const f = C.FLOWERS[id];
      return [
        f.name,
        where[f.where],
        `${f.from}–${f.to}`,
        String(f.nectar),
        f.seed === null ? "–" : String(f.seed),
        String(C.HONEYS[id].price),
      ];
    }),
  );
  assert.deepEqual(
    table(rules, "Hive").map((r) => [r[0], Number(r[1]), Number(r[2]), r[3]]),
    C.HIVE_IDS.map((id, i) => [
      C.HIVES[id].name,
      C.HIVES[id].jars,
      C.HIVES[id].limit,
      i === 0 ? "first one free" : `upgrade ${C.HIVES[id].cost}`,
    ]),
  );
  assert.deepEqual(
    table(rules, "Plot").map((r) => [r[0], r[1]]),
    C.PLOT_IDS.map((id) => [
      C.PLOTS[id].name,
      C.PLOTS[id].price === 0 ? "owned" : String(C.PLOTS[id].price),
    ]),
  );
  assert.deepEqual(
    table(rules, "Weather").map((r) => [r[0], Number(r[1])]),
    ["sunny", "cloudy", "windy", "rain"].map((w) => [w, T.FLIGHT[w]]),
  );
  assert.deepEqual(
    table(rules, "Tier").map((r) => [Number(r[0]), r[1], Number(r[2])]),
    C.TIERS.map((t) => [t.tier, t.name, t.renown]),
  );
  assert.deepEqual(
    table(rules, "Recipe").map((r) => [r[0], Number(r[1].match(/(\d+) wax/)?.[1] ?? 0), r[2]]),
    C.RECIPE_IDS.map((id) => {
      const r = C.RECIPES[id];
      const good = C.GOODS[r.makes === "soap-*" ? `soap-${r.bunch[0]}` : r.makes];
      return [r.name, r.wax, good ? String(good.price) : "not sold"];
    }),
  );
  assert.deepEqual(
    table(rules, "Talent").map((r) => r[0]),
    C.TALENT_IDS.map((id) => C.TALENTS[id].name),
  );
  assert.deepEqual(
    table(rules, "Id").map((r) => r[0]),
    C.REGULAR_IDS.map((id) => `\`${id}\``),
  );
  assert.deepEqual(
    table(rules, "Wish")
      .map((r) => r[0])
      .sort(),
    Object.keys(T.WISH_WEIGHTS).sort(),
  );
});

test("rules.md: the numbers in the prose are the numbers in tuning.js", () => {
  const says = (re, ...values) => {
    const m = rules.match(re);
    assert.ok(m, `rules.md no longer says ${re}`);
    assert.deepEqual(m.slice(1).map(Number), values, String(re));
  };
  says(/syrup\*\* costs (\d+) coins for (\d+) units/, T.SHOP.syrup.price, T.SYRUP_UNITS);
  says(/a spare hive \((\d+) coins/, T.SHOP.spare.price);
  says(/thyme remedy\*\* \((\d+) coins/, T.SHOP.remedy.price);
  says(/`SWARMS_FROM_DAY`, day (\d+)/, T.SWARMS_FROM_DAY);
  says(/between doy\s+(\d+) and (\d+) \(`SWARM_DOY`\)/, ...T.SWARM_DOY);
  says(/costs (\d+) \(`HIVE_PRICE`\), and (\d+)\s+more/, T.HIVE_PRICE, T.HIVE_PRICE_STEP);
  says(/less than (\d+)% \(`WILD_SHARE`\)/, T.WILD_SHARE * 100);
  says(/At (\d+) the hive shows/, T.MITES_SPOTTED);
  says(/At (\d+) the colony stops growing/, T.MITES_STALL);
  says(/at (\d+) \(`MITES_HARM`\)/, T.MITES_HARM);
  says(/coins \((\d+) \/ (\d+) \/ (\d+)\)/, ...T.RIBBONS.map((r) => r.coins));
  says(/renown \((\d+) \/ (\d+) \/ (\d+)\)/, ...T.RIBBONS.map((r) => r.renown));
  says(
    /`CRAFTS_PER_DAY` \((\d+)\) things a day, (\d+) in winter/,
    T.CRAFTS_PER_DAY,
    T.WINTER_CRAFTS,
  );
  says(/`GROW_DAYS` \((\d+)\) growth days/, T.GROW_DAYS);
  says(/`NECTAR_PER_JAR` = (\d+) units/, T.NECTAR_PER_JAR);
  says(/`TICKS_PER_DAY` = (\d+) ticks/, T.TICKS_PER_DAY);
});
