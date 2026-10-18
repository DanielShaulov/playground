// Art gallery: every jar state on one scrolling page (games/ferment/art-gallery.html),
// snapped section by section on both phones. Fails if a jar fails to draw, if
// two ripeness stops of a recipe draw the same picture, or if the add-ins and
// serving levels don't change the jar. Customers: every mood must draw a
// different face, walk-in looks must differ, and a regular's fixed parts must
// stick whatever the seed. The shop scene: ingredient icons all drawn and
// distinct, the window and light differ hour to hour, bigger jars look bigger.
import assert from "node:assert/strict";

export const name = "gallery";

export async function run(page, snap) {
  await page.goto(new URL("art-gallery.html", page.url()).href);
  await page.waitForSelector("body[data-ready]");
  const sections = await page.evaluate(() =>
    [...document.querySelectorAll("section")].map((s) => ({
      key: s.dataset.section,
      // Chips and text-size icons are small on purpose; everything else is a picture.
      jars: [...s.querySelectorAll("svg")]
        .filter((svg) => !svg.closest(".portions, .inline"))
        .map((svg) => {
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
    const base = { id: 1, f: 0, over: false, servings: 2, size: 2, adds: [] };
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
        bigger: draw({ servings: 3, size: 3 }),
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

  // The shop around the jars: every pantry ingredient has its own drawing, no
  // two alike; the window and its light change through the day; a bigger jar
  // is drawn as a different jar, not just a fuller one.
  const scene = await page.evaluate(async () => {
    const { ingredientSvg, DRAWN } = await import("./ui/art/ingredients.js");
    const { INGREDIENT_IDS } = await import("./content/ingredients.js");
    const { windowArt, lightAt } = await import("./ui/art/scene.js");
    const { jarArt } = await import("./ui/art/jar.js");
    const out = [];
    const icons = new Map();
    for (const id of INGREDIENT_IDS) {
      if (!DRAWN.includes(id)) out.push(`ingredient ${id} has no drawing`);
      const art = ingredientSvg(id).replace(/ data-ingredient="[^"]*"/, "");
      if (icons.has(art)) out.push(`ingredients ${icons.get(art)} and ${id} look the same`);
      icons.set(art, id);
    }
    const hours = [7, 8.5, 12, 16, 18.8, 20, 21.5];
    const windows = new Map();
    const lights = new Map();
    for (const h of hours) {
      const w = windowArt(h);
      if (windows.has(w)) out.push(`the window at ${windows.get(w)} and ${h} looks the same`);
      windows.set(w, h);
      const l = JSON.stringify(lightAt(h));
      if (lights.has(l)) out.push(`the light at ${lights.get(l)} and ${h} is the same`);
      lights.set(l, h);
    }
    const base = { id: 3, recipe: "dill", f: 0.3, over: false, adds: [] };
    const small = jarArt({ ...base, servings: 2, size: 2 });
    const big = jarArt({ ...base, servings: 2, size: 3 });
    if (!big.includes("data-big") || small.includes("data-big"))
      out.push("a bigger jar is not drawn as a bigger jar");
    return out;
  });
  assert.deepEqual(scene, []);

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
