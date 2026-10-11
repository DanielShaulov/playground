// Art gallery: every jar state on one scrolling page (games/ferment/art-gallery.html),
// snapped section by section on both phones. Fails if a jar fails to draw, if
// two ripeness stops of a recipe draw the same picture, or if the add-ins and
// serving levels don't change the jar.
import assert from "node:assert/strict";

export const name = "gallery";

export async function run(page, snap) {
  await page.goto(new URL("art-gallery.html", page.url()).href);
  await page.waitForSelector("body[data-ready]");
  const sections = await page.evaluate(() =>
    [...document.querySelectorAll("section")].map((s) => ({
      key: s.dataset.section,
      jars: [...s.querySelectorAll("svg")].map((svg) => {
        const b = svg.getBoundingClientRect();
        return { w: b.width, h: b.height };
      }),
    })),
  );
  let jars = 0;
  for (const s of sections) {
    for (const j of s.jars)
      assert.ok(j.w > 20 && j.h > 20, `${s.key}: a jar drew at ${j.w}×${j.h}`);
    jars += s.jars.length;
  }

  // Same jar (same id, so the same placement), one thing changed at a time:
  // every change of state must change the picture.
  const same = await page.evaluate(async () => {
    const { jarArt } = await import("./ui/art/jar.js");
    const { RECIPES } = await import("./content/recipes.js");
    const base = { id: 1, f: 0, over: false, servings: 2, adds: [] };
    const out = [];
    for (const recipe of Object.keys(RECIPES)) {
      const draw = (more) => jarArt({ ...base, recipe, ...more });
      const states = {
        crisp: draw({}),
        tangy: draw({ f: 0.4 }),
        sour: draw({ f: 0.65 }),
        funky: draw({ f: 0.9 }),
        over: draw({ f: 1, over: true }),
        sold: draw({ servings: 1 }),
        addin: draw({ adds: ["garlic"] }),
      };
      const seen = new Map();
      for (const [k, art] of Object.entries(states)) {
        if (seen.has(art)) out.push(`${recipe}: ${seen.get(art)} and ${k} look the same`);
        seen.set(art, k);
      }
    }
    return out;
  });
  assert.deepEqual(same, []);

  for (const s of sections) {
    await page.evaluate(
      (k) =>
        document.querySelector(`section[data-section="${k}"]`).scrollIntoView({ block: "start" }),
      s.key,
    );
    await snap(s.key);
  }
  return `${jars} jars in ${sections.length} sections`;
}
