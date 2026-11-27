// @ts-check
/**
 * The workshop: `app.sheet("workshop")`.
 *
 * A warm bench. At the top the beekeeper, the crafts left today (one little
 * candle each) and what there is to make things from: beeswax, bunches,
 * honey, each with a word on where it comes from. Then a card for every
 * recipe the keeper knows (`recipesNow`):
 *
 *   the painted good, its name, what it is worth today (`priceOf`)
 *   what it needs, with what you hold beside each ingredient and a tick
 *     when that is enough
 *   where there is a choice (which bunch for the soap, which honey for the
 *     balm and the basket) a row of pictures to choose from, in place; the
 *     last choice is remembered (in the game's own store)
 *   "Make one" → `craft { recipe, bunch?, honey?, candle?, soap? }`
 *   a line that is the recipe's blurb, or exactly what is missing
 *
 * and under them the recipes still to learn, each with what unlocks it.
 *
 * Nothing above a "Make one" button changes height when something is made,
 * so the list never moves under the thumb. Built once; `update` patches.
 *
 * The core's `recipesNow` does not say that crafting waits while the bees
 * are out (`craft` answers "not-now"), so this screen looks at the phase
 * itself. See the builder's report: a helper is wanted.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { img } from "../paint/sprite.js";
import { good, item, bunch } from "../art/goods.js";
import { jar } from "../art/jars.js";
import { icon } from "../art/icons.js";
import { keeper } from "../art/people.js";
import { createStore } from "../../../../shared/storage.js";
import { say, stars, number } from "../words.js";
import { WORKSHOP as W } from "../words/workshop.js";

export const title = W.title;

const styled = css(new URL("./workshop.css", import.meta.url));

// The last bunch and honey chosen for each recipe, kept beside the save.
const store = createStore("honey-hollow");
/** @type {Record<string, Record<string, string>>} */
let picks = {};
try {
  const kept = store.get("workshop-picks", {});
  if (kept && typeof kept === "object" && !Array.isArray(kept)) picks = { ...kept };
} catch {
  /* no storage: choices last as long as the page */
}

const pic = (sprite, width, alt = "") => {
  const p = img(sprite, width, alt);
  p.className = "hh-pic";
  return p;
};
const text = (node, s) => {
  if (node.textContent !== s) node.textContent = s;
};
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

/** Put a picture in a holder, only if it is not the one already there. */
function setPic(holder, key, make) {
  if (holder.dataset.key === key) return;
  holder.dataset.key = key;
  holder.replaceChildren(make());
}

/** Fill a list with these nodes, only if the ids in it changed. */
function setList(list, ids, nodeOf) {
  const key = ids.join("|");
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren(...ids.map(nodeOf));
}

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  const C = app.core;
  root.classList.add("hh-ws");

  /** @type {any} */
  const RECIPES = C.RECIPES;
  /** @type {any} */
  const GOODS = C.GOODS;
  /** @type {any} */
  const FLOWERS = C.FLOWERS;
  const isGood = (id) => Object.hasOwn(GOODS, id);
  const artOf = (made) => (isGood(made) ? good(made) : item("remedy"));
  const flowerName = (f) => FLOWERS[f]?.name ?? f;
  const honeyCount = (s, product) => {
    const info = C.productInfo(product);
    return info ? (s.stock.honey[info.stockKey] ?? 0) : 0;
  };

  /** Timers of celebrations still to come, so a closed sheet makes no sparkles. */
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  // ── the bench: the keeper, the crafts left, what you hold

  const face = el("span.hh-ws__keeper", { "aria-hidden": "true" });
  const craftsText = el("div.hh-heading.hh-ws__crafts");
  const pips = el("div.hh-ws__pips", { "aria-hidden": "true" });
  const craftsSub = el("p.hh-sub.hh-ws__sub");
  const bench = el("header.hh-ws__bench", null, [
    face,
    el("div.hh-ws__benchtext", null, [craftsText, pips, craftsSub]),
  ]);

  /** @type {Record<string, { box: HTMLElement, n: HTMLElement }>} */
  const holds = {};
  const holdTile = (id, picture) => {
    const n = el("span.hh-ws__holdn.hh-num");
    const box = el("div.hh-ws__hold", { dataset: { hold: id } }, [
      el("span.hh-ws__holdpic", { "aria-hidden": "true" }, picture),
      n,
      el("span.hh-ws__holdname", { text: W.hold[id].name }),
      el("span.hh-ws__holdfrom", { text: W.hold[id].from }),
    ]);
    holds[id] = { box, n };
    return box;
  };
  const holdRow = el("div.hh-ws__holds", null, [
    holdTile("wax", pic(item("wax"), 40)),
    holdTile("bunches", pic(bunch("lavender"), 40)),
    holdTile("honey", pic(jar("clover", 0), 36)),
  ]);

  const slip = el("p.hh-note.hh-ws__slip", { hidden: true });

  // ── the recipes

  const cardList = el("div.hh-ws__cards");
  const lockedList = el("ul.hh-list.hh-ws__lockedlist");
  const lockedBox = el("section.hh-ws__section", { hidden: true }, [
    el("h3.hh-heading.hh-ws__h", { text: W.locked.heading }),
    lockedList,
  ]);
  const whereBunches = el("p.hh-sub");
  const whereBox = el("section.hh-ws__section.hh-ws__where", null, [
    el("h3.hh-heading.hh-ws__h", { text: W.whereHeading }),
    el("div.hh-ws__whererow", null, [
      el("span.hh-ws__wherepic", { "aria-hidden": "true" }, pic(item("wax"), 30)),
      el("p.hh-sub", { text: W.whereWax }),
    ]),
    el("div.hh-ws__whererow", null, [
      el("span.hh-ws__wherepic", { "aria-hidden": "true" }, pic(bunch("mint"), 30)),
      whereBunches,
    ]),
  ]);
  text(whereBunches, W.whereBunches(/** @type {string[]} */ (C.BUNCHES).map(flowerName)));

  root.append(bench, holdRow, slip, cardList, lockedBox, whereBox);

  /** @type {Map<string, any>} */
  const cards = new Map();

  /** One ingredient of a recipe: a line, and for a choice the row of pictures under it. */
  function needRow(id, kind, choice) {
    const n = {
      kind,
      choice,
      pic: el("span.hh-ws__needpic", { "aria-hidden": "true" }),
      label: el("span.hh-ws__needlabel"),
      sub: el("span.hh-ws__needsub"),
      have: el("span.hh-ws__have.hh-num"),
      tick: el("span.hh-ws__tick", { "aria-hidden": "true" }, pic(icon("check"), 20)),
      /** @type {HTMLElement | null} */ using: null,
      /** @type {HTMLElement | null} */ strip: null,
      /** @type {HTMLElement | null} */ none: null,
      /** @type {Map<string, { btn: HTMLElement, count: HTMLElement }>} */ opts: new Map(),
      box: /** @type {any} */ (null),
    };
    n.box = el(
      "div.hh-ws__need",
      { dataset: { need: kind } },
      el("div.hh-ws__needline", null, [
        n.pic,
        el("span.hh-ws__needtext", null, [n.label, n.sub]),
        n.have,
        n.tick,
      ]),
    );
    if (choice) {
      n.using = el("div.hh-ws__using");
      n.none = el("div.hh-ws__none", { hidden: true });
      n.strip = el("div.hh-ws__strip", { role: "group", "aria-label": W.pick[kind] }, n.none);
      n.box.append(el("div.hh-ws__pick", null, [n.using, n.strip]));
    }
    return n;
  }

  /** A picture to choose in a row: a bunch or a jar, with how many you hold. */
  function option(c, kind, value) {
    const n = c.needs[kind];
    let o = n.opts.get(value);
    if (o) return o;
    const info = kind === "honey" ? C.productInfo(value) : null;
    const sprite =
      kind === "honey"
        ? jar(info?.honey ?? "blend", /** @type {any} */ (info?.stars ?? 0))
        : bunch(value);
    const count = el("span.hh-ws__optn.hh-num");
    const btn = el(
      "button.hh-ws__opt",
      {
        type: "button",
        "aria-pressed": "false",
        dataset: { opt: value },
        onclick: () => choose(c.id, kind, value),
      },
      [pic(sprite, kind === "honey" ? 34 : 40), count],
    );
    o = { btn, count };
    n.opts.set(value, o);
    return o;
  }

  function choose(id, kind, value) {
    picks = { ...picks, [id]: { ...picks[id], [kind]: value } };
    try {
      store.set("workshop-picks", picks);
    } catch {
      /* remembered for now, at least */
    }
    draw();
  }

  /** A recipe's card. Its shape never changes; `drawCard` fills it in. */
  function card(id) {
    let c = cards.get(id);
    if (c) return c;
    const r = RECIPES[id];
    const sold = r.makes === "soap-*" || isGood(r.makes);
    const picBox = el("span.hh-ws__pic", { "aria-hidden": "true" });
    const name = el("h3.hh-row__title.hh-ws__name");
    const price = el("span.hh-num");
    const worth = sold
      ? el("div.hh-sub.hh-ws__worth", null, [
          W.worth[0],
          el("span.hh-coins", null, [pic(item("coin"), 17), price]),
          W.worth[1],
        ])
      : el("div.hh-sub.hh-ws__worth", { text: W.notSold });
    const held = el("span.hh-ws__held");
    const btn = el(
      "button.hh-btn.hh-ws__make",
      { type: "button", dataset: { make: id, sound: "none" }, onclick: () => make(id) },
      W.make,
    );
    const status = el("p.hh-ws__status");
    const newsText = el("span");
    const news = el(
      "button.hh-btn.hh-btn--quiet.hh-btn--small.hh-ws__news",
      {
        type: "button",
        hidden: true,
        onclick: () => c.newFact && app.sheet("book", { fact: c.newFact }),
      },
      [pic(icon("book"), 24), newsText],
    );

    /** @type {Record<string, ReturnType<typeof needRow>>} */
    const needs = {};
    if (r.wax > 0) needs.wax = needRow(id, "wax", false);
    if (r.bunch) needs.bunch = needRow(id, "bunch", r.bunch.length > 1);
    if (r.honey) needs.honey = needRow(id, "honey", true);
    if (r.candle) needs.candle = needRow(id, "candle", false);
    if (r.soap) needs.soap = needRow(id, "soap", false);

    const box = el("article.hh-card.hh-ws__card", { dataset: { recipe: id } }, [
      el("div.hh-ws__head", null, [picBox, el("div.hh-ws__headtext", null, [name, worth])]),
      el(
        "div.hh-ws__needs",
        null,
        Object.values(needs).map((n) => n.box),
      ),
      el("div.hh-ws__act", null, [held, btn]),
      status,
      news,
    ]);
    c = { id, r, sold, box, picBox, name, price, worth, held, btn, status, news, newsText, needs };
    Object.assign(c, { rest: "", choice: {}, newFact: "", heldN: -1 });
    cards.set(id, c);
    return c;
  }

  /** A recipe not learnt yet: what it makes, and what unlocks it. */
  /** @type {Map<string, HTMLElement>} */
  const lockedRows = new Map();
  function lockedRow(id) {
    let row = lockedRows.get(id);
    if (row) return row;
    const r = RECIPES[id];
    const made = r.makes === "soap-*" ? `soap-${r.bunch[0]}` : r.makes;
    const u = r.unlock ?? {};
    const tier = /** @type {any[]} */ (C.TIERS).find((t) => t.tier === u.tier);
    const goal = /** @type {any[]} */ (C.GOALS).find((g) => g.id === u.goal);
    const plot = u.plot ? /** @type {any} */ (C.PLOTS)[u.plot] : null;
    const how = tier
      ? W.locked.tier(tier.name)
      : goal
        ? W.locked.goal(goal.name)
        : plot
          ? W.locked.plot(plot.name)
          : W.locked.other;
    row = el("li.hh-row.hh-ws__locked", { dataset: { locked: id } }, [
      el("span.hh-ws__lockpic", { "aria-hidden": "true" }, pic(artOf(made), 40)),
      el("div.hh-row__text", null, [
        el("div.hh-row__title", { text: r.name }),
        el("div.hh-row__sub", { text: how }),
      ]),
      el("div.hh-row__end", { "aria-hidden": "true" }, pic(icon("lock"), 24)),
    ]);
    lockedRows.set(id, row);
    return row;
  }

  // ── making

  function make(id) {
    const c = cards.get(id);
    if (!c) return;
    if (c.rest) {
      app.toast(c.rest, { sound: "nope" });
      return;
    }
    const events = /** @type {any[]} */ (app.dispatch({ type: "craft", recipe: id, ...c.choice }));
    const done = events.find((e) => e.type === "crafted");
    if (!done) return; // refused: the spine has said why
    const sprite = artOf(done.made);
    const name = isGood(done.made) ? GOODS[done.made].name : c.r.name;
    app.sound("craft");
    app.toast(W.made(name), { icon: sprite, sound: false });
    fly(c, sprite);
    later(
      () => {
        app.fx("pop", { el: c.picBox });
        app.fx("sparkle", { at: c.picBox, n: 6 });
        c.held.classList.remove("hh-pop");
        void c.held.offsetWidth;
        c.held.classList.add("hh-pop");
      },
      app.settings.motion ? 360 : 0,
    );
    const fresh = events.find((e) => e.type === "factUnlocked");
    if (fresh) {
      c.newFact = fresh.fact;
      const fact = /** @type {any[]} */ (C.FACTS).find((f) => f.id === fresh.fact);
      text(c.newsText, W.newFact(fact?.title ?? ""));
      c.news.hidden = false;
    }
  }

  /** The made thing rises from the button to the card's picture. */
  function fly(c, sprite) {
    if (!app.settings.motion) return;
    const from = c.btn.getBoundingClientRect();
    const to = c.picBox.getBoundingClientRect();
    const home = c.box.getBoundingClientRect();
    const p = pic(sprite, 48);
    if (!p.animate) return;
    p.classList.add("hh-ws__fly");
    const x0 = from.left + from.width / 2;
    const y0 = from.top;
    p.style.left = `${x0 - home.left - c.box.clientLeft - 24}px`;
    p.style.top = `${y0 - home.top - c.box.clientTop - 44}px`;
    c.box.append(p);
    const dx = to.left + to.width / 2 - x0;
    const dy = to.top + to.height / 2 - (y0 - 18);
    const a = p.animate(
      [
        { transform: "translate(0, 12px) scale(0.5)", opacity: 0 },
        { transform: "translate(0, -14px) scale(1.25)", opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 0.15 },
      ],
      { duration: 560, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" },
    );
    a.onfinish = a.oncancel = () => p.remove();
  }

  // ── drawing

  let faceKey = "";

  function draw() {
    const s = /** @type {any} */ (app.state);
    const open = C.workshopOpen(s);
    const left = C.craftsLeft(s);
    const out = s.clock.phase === "day";
    const winter = C.calendarOf(s.clock.day).season === 3;
    const madeToday = s.workshop.made.day === s.clock.day ? s.workshop.made.n : 0;
    const total = left + madeToday;

    // the bench
    if (s.keeper?.made) {
      const mood = open && left > 0 && !out ? "happy" : "calm";
      const key = `${JSON.stringify(s.keeper)}|${mood}`;
      if (key !== faceKey) {
        faceKey = key;
        try {
          face.replaceChildren(pic(keeper(s.keeper, "bust", mood), 84));
        } catch {
          face.replaceChildren();
        }
      }
    } else if (faceKey) {
      faceKey = "";
      face.replaceChildren();
    }
    text(craftsText, W.crafts(left));
    if (pips.childElementCount !== total) {
      pips.replaceChildren(...Array.from({ length: total }, () => pic(good("candle"), 24)));
    }
    [...pips.children].forEach((p, i) => p.classList.toggle("is-used", i >= left));
    text(
      craftsSub,
      !open
        ? W.sub.closed
        : out
          ? W.sub.out
          : left < 1
            ? W.sub.none
            : winter
              ? W.sub.winter
              : W.sub.normal,
    );

    const held = {
      wax: s.stock.wax ?? 0,
      bunches: sum(s.stock.bunches),
      honey: sum(s.stock.honey),
    };
    for (const id of Object.keys(holds)) {
      text(holds[id].n, number(held[id]));
      holds[id].box.classList.toggle("is-none", !held[id]);
      holds[id].box.setAttribute(
        "aria-label",
        W.holdLabel(W.hold[id].name, held[id], W.hold[id].from),
      );
    }

    const word = !open ? W.closedNote : out ? W.outNote : "";
    text(slip, word);
    slip.hidden = !word;

    // the recipes
    const recipes = C.recipesNow(s);
    const known = recipes.map((r) => r.recipe);
    setList(cardList, known, (id) => card(id).box);
    const locked = /** @type {string[]} */ (C.RECIPE_IDS).filter((id) => !known.includes(id));
    setList(lockedList, locked, lockedRow);
    lockedBox.hidden = !locked.length;
    for (const rn of recipes) drawCard(s, rn, out);
  }

  /** @param {any} s @param {ReturnType<typeof C.recipesNow>[number]} rn @param {boolean} out */
  function drawCard(s, rn, out) {
    const c = card(rn.recipe);
    const r = c.r;
    const missing = rn.missing;
    const mine = picks[c.id] ?? {};
    const opts = rn.options;

    // What goes in: the last choice if it is still there, else the first on offer.
    /** @type {Record<string, string>} */
    const choice = {};
    for (const kind of ["bunch", "honey", "candle", "soap"]) {
      const on = opts[kind] ?? [];
      const want = kind === "candle" || kind === "soap" ? undefined : mine[kind];
      const take = on.includes(want) ? want : on[0];
      if (take) choice[kind] = take;
    }
    c.choice = choice;
    // The bunch the card shows when there is none to use: the last chosen, or the first.
    const shownBunch = r.bunch
      ? (choice.bunch ?? (r.bunch.includes(mine.bunch) ? mine.bunch : r.bunch[0]))
      : "";

    // head
    const made = r.makes === "soap-*" ? `soap-${shownBunch}` : r.makes;
    setPic(c.picBox, made, () => pic(artOf(made), 56));
    text(c.name, isGood(made) ? GOODS[made].name : r.name);
    if (c.sold) {
      const worth = C.priceOf(s, `good:${made}`);
      text(c.price, number(worth));
      c.worth.setAttribute("aria-label", W.worthLabel(worth));
    }
    const heldN = isGood(made) ? (s.stock.goods[made] ?? 0) : (s.stock.remedy ?? 0);
    text(c.held, W.held(heldN));

    // needs
    const line = (n, key, sprite, width, label, have, enough) => {
      setPic(n.pic, key, () => pic(sprite(), width));
      text(n.label, label);
      text(n.have, W.have(have));
      n.have.classList.toggle("hh-bad", !enough);
      n.have.setAttribute("aria-label", W.haveLabel(have, enough));
      n.tick.classList.toggle("is-on", enough);
      n.box.classList.toggle("is-short", !enough);
    };
    if (c.needs.wax) {
      const label = rn.wax > 1 ? `${W.need.wax} ${W.times(rn.wax)}` : W.need.wax;
      line(
        c.needs.wax,
        "wax",
        () => item("wax"),
        28,
        label,
        s.stock.wax ?? 0,
        !missing.includes("no-wax"),
      );
    }
    if (c.needs.bunch) {
      const n = c.needs.bunch;
      const enough = !missing.includes("no-bunch");
      if (!n.choice) {
        const f = r.bunch[0];
        line(
          n,
          f,
          () => bunch(f),
          28,
          W.need.bunchOf(flowerName(f)),
          s.stock.bunches[f] ?? 0,
          enough,
        );
      } else {
        const have = r.bunch.reduce((a, f) => a + (s.stock.bunches[f] ?? 0), 0);
        line(n, shownBunch, () => bunch(shownBunch), 28, W.need.bunchAny, have, enough);
        // All the kinds, always: the ones you have none of rest.
        setList(n.strip, r.bunch, (f) => option(c, "bunch", f).btn);
        for (const f of r.bunch) {
          const o = option(c, "bunch", f);
          const count = s.stock.bunches[f] ?? 0;
          text(o.count, number(count));
          /** @type {any} */ (o.btn).disabled = count < 1;
          o.btn.setAttribute("aria-pressed", String(choice.bunch === f));
          o.btn.setAttribute("aria-label", W.optionLabel(W.need.bunchOf(flowerName(f)), count));
        }
        text(
          n.using,
          enough
            ? W.bunchMakes(flowerName(shownBunch), GOODS[`soap-${shownBunch}`]?.name ?? r.name)
            : W.none.bunch,
        );
      }
    }
    if (c.needs.honey) {
      const n = c.needs.honey;
      const on = opts.honey ?? [];
      const enough = !missing.includes("no-honey");
      const have = on.reduce((a, p) => a + honeyCount(s, p), 0);
      const info = choice.honey ? C.productInfo(choice.honey) : null;
      line(
        n,
        choice.honey ?? "none",
        () => jar(info?.honey ?? "blend", /** @type {any} */ (info?.stars ?? 0)),
        24,
        r.honey === "pure" ? W.need.honeyPure : W.need.honeyAny,
        have,
        enough,
      );
      if (on.length) setList(n.strip, on, (p) => option(c, "honey", p).btn);
      else setList(n.strip, ["none"], () => n.none);
      n.none.hidden = on.length > 0;
      text(n.none, r.honey === "pure" ? W.none.honeyPure : W.none.honey);
      for (const p of on) {
        const o = option(c, "honey", p);
        const i = C.productInfo(p);
        const count = honeyCount(s, p);
        text(o.count, number(count));
        o.btn.setAttribute("aria-pressed", String(choice.honey === p));
        o.btn.setAttribute(
          "aria-label",
          W.optionLabel(`${i?.name ?? W.blend}${i?.stars ? ` ${stars(i.stars)}` : ""}`, count),
        );
      }
      text(
        n.using,
        info
          ? W.usingHoney(info.name, stars(info.stars), C.priceOf(s, choice.honey))
          : W.pick.honey,
      );
    }
    for (const kind of ["candle", "soap"]) {
      const n = c.needs[kind];
      if (!n) continue;
      const on = opts[kind] ?? [];
      const have = on.reduce((a, id) => a + (s.stock.goods[id] ?? 0), 0);
      const shown = choice[kind] ?? (kind === "candle" ? "candle" : "soap-lavender");
      line(n, shown, () => good(shown), 28, W.need[kind], have, !missing.includes(`no-${kind}`));
      // Which one it will take (the cheapest), on a line of its own that is always there.
      text(n.sub, choice[kind] ? GOODS[shown].name : W.none[kind]);
    }

    // can it be made, and if not, exactly why
    const parts = [];
    if (missing.includes("no-wax"))
      parts.push(W.missing.wax(Math.max(1, rn.wax - (s.stock.wax ?? 0))));
    if (missing.includes("no-bunch")) {
      parts.push(
        r.bunch.length === 1 ? W.missing.bunchOf(flowerName(r.bunch[0])) : W.missing.bunchAny,
      );
    }
    if (missing.includes("no-honey"))
      parts.push(r.honey === "pure" ? W.missing.honeyPure : W.missing.honeyAny);
    if (missing.includes("no-candle")) parts.push(W.missing.candle);
    if (missing.includes("no-soap")) parts.push(W.missing.soap);
    const other = missing.find(
      (m) => !["no-wax", "no-bunch", "no-honey", "no-candle", "no-soap"].includes(m),
    );
    let rest = "";
    if (parts.length) rest = W.needs(parts);
    else if (other === "workshop-closed") rest = W.rest.closed;
    else if (other === "no-crafts-left") rest = W.rest.noCrafts;
    else if (other) rest = say(other);
    else if (out) rest = W.rest.out;
    c.rest = rest;
    c.btn.setAttribute("aria-disabled", String(!!rest));
    text(c.status, rest || r.blurb);
    c.status.classList.toggle("is-rest", parts.length > 0);
    c.box.classList.toggle("is-resting", !!rest);
  }

  draw();

  return {
    update(state, events, action) {
      // A different game altogether: yesterday's "new page" links mean nothing in it.
      if (action?.type === "@replace") {
        for (const c of cards.values()) {
          c.newFact = "";
          c.news.hidden = true;
        }
      }
      draw();
    },
    unmount() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
