// The meadow by thumb: the planting brush, digging up, buying a hive with the
// preview, moving a hive, the other plots, buying one, and a resize mid-day.
import { SEL, NAME } from "../helpers.mjs";
import { positions } from "../positions.mjs";

export const name = "meadow";

const num = (text, re) => Number(re.exec(text)?.[1] ?? NaN);

export async function run(t) {
  // A summer morning of the bot's game, three hives at home, the pond not
  // bought; coins seeded through the hook so that everything can be afforded.
  const start = positions().meadow;
  start.purse.coins = 900;
  await t.boot();
  await t.seed(start);
  const coins = async () => (await t.state()).purse.coins;

  // ── The brush: pick a seed, tap squares, each costs what the strip says.
  await t.tap(SEL.act("seeds"));
  await t.sheet("seeds");
  const seed = await t.in((sel) => {
    const { core, state } = window.__hollow;
    for (const row of document.querySelectorAll(sel)) {
      const price = /, (\d+) coins?/.exec(row.getAttribute("aria-label") ?? "");
      if (!price) continue; // free: a packet in the pocket
      const at = [];
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 6; x++)
          if (core.canPlant(state, "home", x, y, row.dataset.flower) === true) at.push([x, y]);
      if (at.length >= 2) return { flower: row.dataset.flower, price: Number(price[1]), at };
    }
    return null;
  }, SEL.seedsForSale);
  t.expect(seed, "no seed in the tray that costs coins and has two squares to go on");
  await t.tap(SEL.seed(seed.flower));
  await t.sheet(null);
  t.eq((await t.ui()).mode, { type: "plant", flower: seed.flower }, "the brush, armed");
  const strip = await t.text(SEL.hint);
  t.eq(
    num(strip, /(\d+) coins? each/),
    seed.price,
    `the price on the brush strip ("${strip}") against the seed tray`,
  );
  let had = await coins();
  const [a, b] = seed.at;
  for (const [x, y] of [a, b]) {
    await t.tapSquare("home", x, y);
    await t.until(
      ([x, y]) => window.__hollow.state.land.plots.home.squares[y * 6 + x]?.t === "bed",
      [x, y],
      `a bed on square ${x},${y}`,
    );
    t.eq((await t.square("home", x, y)).flower, seed.flower, `what grows on ${x},${y}`);
    t.eq(had - (await coins()), seed.price, `coins spent planting on ${x},${y}`);
    had = await coins();
  }
  await t.snap("brush");
  // A square that cannot take it says why, and costs nothing.
  await t.tapSquare("home", ...a);
  await t.until(
    (sel) => (document.querySelector(sel)?.innerText ?? "").trim().length > 0,
    SEL.toasts,
    "a toast saying why a planted square cannot be planted again",
  );
  t.eq(await coins(), had, "coins after tapping a square that is taken");
  await t.tap(SEL.act("done"));
  t.eq((await t.ui()).mode, null, "the brush, put away");

  // ── Dig up: it asks first.
  await t.tapSquare("home", ...a);
  await t.sheet("bed");
  await t.tap(t.button(NAME.dig, SEL.sheet), "Dig up");
  await t.page.locator(SEL.confirm).waitFor();
  t.expect((await t.square("home", ...a))?.t === "bed", "the bed was dug up before the answer");
  await t.snap("dig-asks");
  await t.confirm(false);
  t.expect((await t.square("home", ...a))?.t === "bed", "the bed was dug up after “no”");
  if ((await t.ui()).sheet !== "bed") {
    await t.tapSquare("home", ...a);
    await t.sheet("bed");
  }
  await t.tap(t.button(NAME.dig, SEL.sheet), "Dig up");
  await t.confirm(true);
  await t.until(
    ([x, y]) => window.__hollow.state.land.plots.home.squares[y * 6 + x] === null,
    a,
    "the bed to be gone",
  );
  await t.sheet(null);

  // ── A new hive: the preview shows numbers, and the hive stands where it was put.
  await t.tap(SEL.act("hives"));
  await t.sheet("hives");
  const hivePrice = num(await t.text(SEL.buy("hive")), /(\d+)/);
  await t.tap(SEL.buy("hive"));
  await t.sheet(null);
  t.eq((await t.ui()).mode?.what, "buy", "placing a bought hive");
  t.expect(
    await t.loc(SEL.act("put")).isDisabled(),
    "“Put it here” is live before a square is chosen",
  );
  const spots = await t.squares("home", "hive");
  t.expect(spots.length >= 2, "fewer than two squares a hive can stand on");
  const [first, there] = [spots[0], spots[spots.length - 1]];
  const forecasts = [];
  for (const [x, y] of [first, there]) {
    await t.tapSquare("home", x, y);
    await t.until(
      (sel) => !document.querySelector(sel)?.disabled,
      SEL.act("put"),
      `a preview on ${x},${y}`,
    );
    const card =
      (await t.text(SEL.scene("meadow"))).match(/Home Meadow(.*?)Cancel/)?.[1]?.trim() ?? "";
    t.expect(/\d/.test(card), `the forecast for ${x},${y} shows no numbers: "${card}"`);
    forecasts.push(card);
  }
  await t.snap("preview");
  had = await coins();
  const count = (await t.state()).hives.list.length;
  await t.tap(SEL.act("put"));
  await t.until((n) => window.__hollow.state.hives.list.length > n, count, "the hive to be bought");
  let s = await t.state();
  const bought = s.hives.list[s.hives.list.length - 1];
  t.eq(
    [bought.plot, bought.x, bought.y],
    ["home", ...there],
    "the hive does not stand where it was put",
  );
  t.eq(had - s.purse.coins, hivePrice, "coins spent on the hive, against the shop's price");
  await t.tapSquare("home", ...there);
  await t.sheet("hive");
  t.eq(
    (await t.ui()).selected,
    { kind: "hive", id: bought.id },
    "the hive that opens when its square is tapped",
  );
  await t.closeSheet("escape");

  // ── Move a hive, in the morning.
  const old = s.hives.list[0];
  await t.tapSquare(old.plot, old.x, old.y);
  await t.sheet("hive");
  await t.tap(SEL.care("move"));
  await t.sheet(null);
  t.eq((await t.ui()).mode, { type: "place", what: "move", hive: old.id }, "placing a moved hive");
  const to = (await t.squares("home", `hive:${old.id}`)).find(
    ([x, y]) => x !== old.x || y !== old.y,
  );
  await t.tapSquare("home", ...to);
  await t.until(
    (sel) => !document.querySelector(sel)?.disabled,
    SEL.act("put"),
    "a preview for the move",
  );
  await t.tap(SEL.act("put"));
  await t.until(
    ([id, x, y]) =>
      window.__hollow.state.hives.list.some((h) => h.id === id && h.x === x && h.y === y),
    [old.id, ...to],
    `hive ${old.id} to stand on ${to}`,
  );
  t.eq(await t.square("home", old.x, old.y), null, "the square the hive left");
  await t.snap("moved");

  // ── The next plot: for sale, then bought.
  await t.tap(SEL.act("next"));
  await t.until(() => window.__hollow.app.ui.plot !== "home", null, "the next plot");
  const plot = (await t.ui()).plot;
  const land = await t.in(
    (p) => ({ ...window.__hollow.core.PLOTS[p], owned: window.__hollow.state.land.plots[p].owned }),
    plot,
  );
  t.eq(
    await t.loc(SEL.canvas).getAttribute("aria-label"),
    land.name,
    "the plot the picture says it is",
  );
  t.expect(!land.owned, `the ${plot} is owned already`);
  await t.snap("for-sale");
  had = await coins();
  await t.tap(`${SEL.scene("meadow")} ${SEL.act("buy")}`);
  const asked = await t.confirm(true);
  t.expect(
    asked.includes(String(land.price)),
    `buying the plot does not say its price (${land.price}): "${asked}"`,
  );
  await t.until((p) => window.__hollow.state.land.plots[p].owned, plot, "the plot to be bought");
  t.eq(had - (await coins()), land.price, "coins spent on the plot");
  const grass = (await t.squares(plot, "hive"))[0];
  await t.until(
    ([p, x, y]) => !!window.__hollow.squareRect(p, x, y),
    [plot, ...grass],
    "the new plot's squares",
  );
  await t.tapSquare(plot, ...grass);
  await t.sheet("seeds");
  await t.closeSheet("escape");
  await t.tap(SEL.act("prev"));
  await t.until(() => window.__hollow.app.ui.plot === "home", null, "the home meadow again");

  // ── The URL bar comes back mid-day: the squares are still where the taps land.
  await t.tap(SEL.act("start"));
  await t.until(() => window.__hollow.state.clock.phase === "day", null, "the day to start");
  const full = t.page.viewportSize();
  const was = await t.squareRect("home", ...there);
  await t.page.setViewportSize({ width: full.width, height: full.height - 72 });
  await t
    .until(
      ([y, x, yy]) =>
        Math.abs(window.__hollow.squareRect("home", x, yy).y - y) > 0.5 ||
        document.documentElement.clientHeight < 0,
      [was.y, ...there],
      "the meadow to be laid out again after the resize",
    )
    .catch(() => {});
  const now = await t.squareRect("home", ...there);
  t.expect(
    now.y + now.height <= full.height - 72,
    `after the resize square ${there} is off the screen (${Math.round(now.y + now.height)} of ${full.height - 72})`,
  );
  await t.tapSquare("home", ...there);
  await t.sheet("hive");
  t.eq(
    (await t.ui()).selected,
    { kind: "hive", id: bought.id },
    "the hive under the tap after a resize",
  );
  await t.snap("resized");
  await t.closeSheet("cross");
  await t.page.setViewportSize(full);
  await t.page.waitForTimeout(250);
  const bed = (await t.squares("home", "bed"))[0];
  await t.tapSquare("home", ...bed);
  await t.sheet("bed");
  await t.closeSheet("escape");
  return `planted 2 ${seed.flower} at ${seed.price} each, dug one up, bought a hive for ${hivePrice} onto ${there} ("${forecasts[1].slice(0, 44)}…"), moved hive ${old.id}, bought the ${plot} for ${land.price}, tapped on through a resize`;
}

export const fault = {
  what: "a bought hive is put down on another square than the one chosen",
  expect: /the hive does not stand where it was put/,
  install: (page) =>
    page.addInitScript(() => {
      let hook;
      Object.defineProperty(window, "__hollow", {
        configurable: true,
        get: () => hook,
        set(v) {
          hook = v;
          const real = v.app.dispatch;
          v.app.dispatch = (a, o) => {
            if (a?.type !== "buyHive") return real(a, o);
            for (let i = 0; i < 36; i++) {
              const [x, y] = [i % 6, Math.floor(i / 6)];
              if (
                (x !== a.x || y !== a.y) &&
                v.core.canPlaceHive(v.app.state, a.plot, x, y) === true
              )
                return real({ ...a, x, y }, o);
            }
            return real(a, o);
          };
        },
      });
    }),
};
