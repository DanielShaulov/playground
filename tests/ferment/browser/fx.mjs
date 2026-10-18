// Phone flow: motion (ui/fx.js). Every other flow plays with reduced motion,
// so first check that nothing moves then; then turn motion on and play the
// moments that have some: opening up, a customer walking in, a sale (coins to
// the till, the brine dropping), a portion set aside (its chip stamped), a lid
// popping, a tier up, closing and the next morning. Motion must never hold
// back the state, never sit in the way of a tap, and clean up after itself.
// Records each element.animate() call to see what moved. Depends on
// window.__ferment and the fx-* classes of ui/fx.css.
import assert from "node:assert/strict";

export const name = "fx";

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const fx = (sel = ".fx") => page.locator(`.fx-layer ${sel}`).count();
  const moved = () => page.evaluate(() => window.__moved.splice(0));
  // How many overlay pieces with all these classes have been set moving so far
  // (a log, so a slow tap can't let them land and vanish before we look).
  const seen = (...cls) =>
    page.evaluate(
      (cls) => window.__seen.filter((w) => cls.every((c) => w.split(/[.\s]/).includes(c))).length,
      cls,
    );
  // Change the state, then (in the same breath) dispatch `then` and return its events.
  const edit = (fn, arg, then = null) =>
    page.evaluate(
      ([src, arg, then]) => {
        const s = structuredClone(window.__ferment.state);
        new Function("s", "arg", src)(s, arg);
        window.__ferment.state = s;
        return then ? window.__ferment.dispatch(then).map((e) => ({ type: e.type })) : [];
      },
      [fn, arg, then],
    );
  await page.evaluate(() => {
    window.__moved = [];
    window.__seen = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const what = `${this.tagName.toLowerCase()}.${this.getAttribute("class") ?? ""}`;
      window.__moved.push(what);
      window.__seen.push(what);
      return animate.apply(this, args);
    };
  });

  // Reduced motion: opening up moves nothing.
  await page.evaluate(() => window.__ferment.dispatch({ type: "open" }));
  await page.waitForTimeout(100);
  assert.equal(await fx(), 0, "nothing moves with reduced motion");
  assert.deepEqual(await moved(), []);

  // Motion on, from a fresh morning.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => (window.__ferment.state = window.__ferment.core.newGame(7)));
  await page.locator('[data-act="open"]').tap();
  assert.equal((await state()).clock.phase, "open", "the shop opens at once");
  assert.equal(await seen("fx-sign"), 1);
  // A tap goes straight through the light wash and the sign.
  const empty = (await state()).shelf.slots.findIndex((j) => !j);
  await page.locator(`.slot[data-slot="${empty}"]`).tap();
  await page.locator(".sheet .recipe").first().waitFor();
  await snap("1-open");
  await page.locator('.sheet [data-act="cancel"]').tap();

  // A customer walks in.
  await page.evaluate(() => {
    for (let k = 0; k < 400 && !window.__ferment.state.customers.queue.length; k++)
      window.__ferment.dispatch({ type: "tick", n: 10 });
  });
  await page.locator(".counter .say small").waitFor();
  await page.waitForTimeout(150);
  assert.ok((await moved()).includes("div.face"), "the customer walks in");

  // A sale from a three-portion jar right in their window.
  const c = (await state()).customers.queue[0];
  const hours = await page.evaluate(
    async (id) => (await import("./content/recipes.js")).RECIPES[id].hours,
    c.recipe,
  );
  await edit(
    "s.shelf.slots[0] = { id: 9001, recipe: arg.recipe, age: arg.age, servings: 3, size: 3 }",
    { recipe: c.recipe, age: ((c.lo + c.hi) / 2) * hours },
  );
  await page.locator('.slot[data-slot="0"]').tap();
  const coins = (await state()).shop.coins;
  await page.locator('[data-act="serve"]').tap();
  const sold = await state();
  assert.ok(sold.shop.coins > coins, "the till fills at once, before any coin lands");
  assert.equal(sold.shelf.slots[0].servings, 2);
  assert.ok((await seen("fx-coin")) >= 2, "coins fly to the till");
  const blocked = await page.evaluate(() =>
    [...document.querySelectorAll(".fx-layer .fx")].some((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".fx-layer");
    }),
  );
  assert.equal(blocked, false, "a flying coin never takes a tap");
  await page.waitForTimeout(200);
  await snap("2-coins");
  let m = await moved();
  assert.ok(m.includes("svg.jar"), "the jar tips as it pours");
  assert.ok(
    m.some((x) => x.startsWith("rect")),
    "the brine drops to its new level",
  );
  await page.waitForTimeout(1500);
  m = m.concat(await moved()); // the walk-out may already be in the first batch
  assert.ok(m.includes("div.face"), `the customer walks out (moved: ${m.join(" ")})`);

  // A portion set aside for an order: its chip gets the face.
  await edit(
    `s.orders.list.push({ id: 950, kind: "preorder", name: "Sam", look: 33, recipe: s.shelf.slots[0].recipe,
       lo: 0.3, hi: 0.5, due: s.clock.day + 1, arriveAt: 4, arrived: false })`,
  );
  await page.evaluate(() => window.__ferment.dispatch({ type: "hold", orderId: 950, slot: 0 }));
  await page.waitForTimeout(80);
  assert.ok((await moved()).includes("i.held"), "the kept chip is stamped");
  assert.ok((await seen("fx-ring")) >= 1);
  await snap("3-stamp");

  // A lid pops. (The edit and the step it needs go in one go, so the game's own
  // clock can't take that step first.)
  const popped = await edit(
    "s.shelf.slots[2] = { id: 9002, recipe: 'dill', age: 47.9, servings: 3, size: 3 }",
    null,
    { type: "tick", n: 60 },
  );
  assert.ok(popped.some((e) => e.type === "popped"));
  assert.equal(await seen("fx-lid"), 1, "the lid flies off");
  assert.ok((await seen("fx-drop")) > 3, "with a splash of brine");
  await page.waitForTimeout(200);
  await snap("4-pop");

  // A tier up.
  const up = await edit("s.progress.stats.earned = 250", null, { type: "tick", n: 1 });
  assert.ok(up.some((e) => e.type === "tierUp"));
  assert.ok((await seen("fx-confetti")) > 10, "confetti for the new tier");
  await page.waitForTimeout(450);
  await snap("5-tier-up");

  // Closing: dusk, and the evening comes up. Then sleep into the morning.
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__ferment.dispatch({ type: "close" }));
  assert.equal((await state()).clock.phase, "evening");
  assert.equal(await seen("fx-wash", "night"), 1);
  await page.waitForTimeout(80);
  assert.ok((await moved()).includes("div.evening"), "the evening fades in");
  await page.waitForTimeout(300);
  await snap("6-dusk");
  await page.waitForTimeout(1200);
  await page.locator('.evening [data-act="sleep"]').tap();
  assert.equal((await state()).clock.phase, "morning", "morning comes at once");
  assert.ok((await seen("fx-wash", "sunrise")) >= 1);
  await page.waitForTimeout(400);
  await snap("7-dawn");

  // Everything cleans up after itself.
  await page.waitForTimeout(2500);
  assert.equal(await fx(), 0, "the overlay is empty again");
  return "coins, walk in/out, pour, stamp, lid, tier up, dusk and dawn all move; taps go through";
}
