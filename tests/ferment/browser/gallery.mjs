// Art gallery: every jar state on one scrolling page (games/ferment/art-gallery.html),
// snapped section by section on both phones. Fails if a jar fails to draw, if
// two ripeness stops of a recipe draw the same picture, or if the add-ins and
// serving levels don't change the jar. Customers: every mood must draw a
// different face, walk-in looks must differ, and a regular's fixed parts must
// stick whatever the seed.
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

  const faces = await page.evaluate(async () => {
    const { faceSvg, portraitLook, MOODS } = await import("./ui/art/customer.js");
    const out = [];
    for (let n = 0; n < 1000; n += 37) {
      const seen = new Map();
      for (const m of MOODS) {
        // The mood is also tagged on the <svg>; compare the drawing only.
        const art = faceSvg(n, m).replace(/ data-mood="[^"]*"/, "");
        if (seen.has(art)) out.push(`look ${n}: ${seen.get(art)} and ${m} look the same`);
        seen.set(art, m);
      }
      if (faceSvg(n, "wait") !== faceSvg(n, "wait")) out.push(`look ${n} is not stable`);
    }
    const walkIns = new Set();
    for (let n = 0; n < 1000; n++) walkIns.add(faceSvg(n, "wait"));
    if (walkIns.size < 980) out.push(`only ${walkIns.size} of 1000 walk-in looks differ`);
    const fixed = { top: "apron", hat: "headscarf", extra: "pencil", glasses: "round" };
    for (let seed = 0; seed < 50; seed++) {
      const l = portraitLook({ seed, ...fixed });
      for (const [k, v] of Object.entries(fixed))
        if (l[k] !== v) out.push(`seed ${seed}: fixed ${k} came out ${l[k]}`);
    }
    return out;
  });
  assert.deepEqual(faces, []);

  for (const s of sections) {
    await page.evaluate(
      (k) =>
        document.querySelector(`section[data-section="${k}"]`).scrollIntoView({ block: "start" }),
      s.key,
    );
    await snap(s.key);
  }
  return `${jars} pictures in ${sections.length} sections`;
}
