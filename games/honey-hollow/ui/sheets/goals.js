// @ts-check
/**
 * The goals sheet: `app.sheet("goals")`. Where a lost player finds out what
 * to do next.
 *
 * Up to three open goals (`goalsNow`), each a card: a picture, the goal's
 * name and its sentence (content/goals.js), a line saying where to tap (and,
 * when the place is another sheet, a button that opens it), a meter, the
 * reward, and "Claim" once it is met (`claimGoal`, with sparkles and coins).
 * Then the renown ladder: the five tiers, where the keeper stands, how far
 * the next one is and what it brings. Then, folded away, what is done.
 *
 * Built once; `update` patches. A goal's card is made once and kept for as
 * long as the goal is open; the list is re-ordered only when it changes.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { img } from "../paint/sprite.js";
import { jar } from "../art/jars.js";
import { hive as hiveArt } from "../art/hives.js";
import { good, item, bunch, seeds, ribbon, starsBadge, heart, honeycomb } from "../art/goods.js";
import { icon } from "../art/icons.js";
import { list, number } from "../words.js";
import { GOALS as W, GOAL_HINTS } from "../words/planning.js";

const styled = css(new URL("./goals.css", import.meta.url));

export const title = W.title;

/** @param {any} s @param {number} width */
const pic = (s, width, alt = "", cls = "hh-pic") => {
  const p = img(s, width, alt);
  p.className = cls;
  return p;
};
/** A picture by its height. @param {any} s @param {number} height */
const tall = (s, height, cls = "hh-pic") => pic(s, (height * s.w) / s.h, "", cls);
/** @param {Element} node @param {string} s */
const text = (node, s) => {
  if (node.textContent !== s) node.textContent = s;
};
/** @param {HTMLElement} node @param {any} on */
const show = (node, on) => {
  if (node.hidden === !!on) node.hidden = !on;
};
/** A sprite, or the goals icon when a painter does not know what it was asked for. */
const safe = (/** @type {() => any} */ make) => {
  try {
    return make() ?? icon("goals");
  } catch {
    return icon("goals");
  }
};

/** The thing a family of goods is pictured by. */
const FAMILY_PIC = {
  candle: "candle",
  soap: "soap-lavender",
  balm: "balm",
  wraps: "wraps",
  basket: "basket",
};

/** A goal's picture, by what it measures. */
const GOAL_PIC = {
  days: () => icon("play"),
  jars: () => jar("dandelion", 1),
  jarsOf: (g) => jar(g.arg, 1),
  kinds: () => jar("lavender", 2),
  kinds3: () => starsBadge(3),
  customers: () => icon("stall"),
  delighted: () => heart(true),
  planted: () => seeds("clover"),
  picked: () => bunch("lavender"),
  moved: () => icon("move"),
  upgraded: () => hiveArt("box"),
  increase: () => icon("split"),
  dusted: () => icon("dust"),
  fended: () => hiveArt("skep"),
  fairSold: () => good("lavender-candle"),
  ribbons: () => ribbon("silver"),
  gold: () => ribbon("gold"),
  goodWinters: () => icon("winter"),
  hives: () => hiveArt("skep"),
  bestHive: () => hiveArt("stack"),
  craftedOf: (g) => good(FAMILY_PIC[g.arg] ?? "candle"),
  plot: () => icon("map"),
  maxHearts: () => heart(true),
  friends: () => heart(true),
  facts: () => icon("book"),
  renown: () => item("star"),
};

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  const C = app.core;
  root.classList.add("hh-goals");
  /** For a moment after a claim no other claim is taken: the card under the thumb has just changed. */
  let settleUntil = 0;

  /** A reward as pictures and words. */
  function rewardBits(reward) {
    /** @type {{ s: any, t: string }[]} */
    const bits = [];
    if (reward.coins) bits.push({ s: item("coin"), t: W.rewardCoins(reward.coins) });
    if (reward.renown) bits.push({ s: item("star"), t: W.rewardRenown(reward.renown) });
    for (const [flower, n] of Object.entries(reward.seeds ?? {}))
      bits.push({
        s: safe(() => seeds(flower)),
        t: W.rewardSeeds(Number(n), C.FLOWERS[flower]?.name ?? flower),
      });
    for (const [id, n] of Object.entries(reward.items ?? {}))
      bits.push({ s: safe(() => item(id)), t: W.rewardItem[id]?.(Number(n)) ?? `${n} × ${id}` });
    if (reward.recipe) {
      const recipe = C.RECIPES[reward.recipe];
      const makes = String(recipe?.makes ?? reward.recipe).replace("soap-*", "soap-lavender");
      bits.push({ s: safe(() => good(makes)), t: W.rewardRecipe(recipe?.name ?? reward.recipe) });
    }
    if (reward.wardrobe) {
      const hat = C.WARDROBE.hat?.find((h) => h.id === reward.wardrobe);
      bits.push({ s: icon("wardrobe"), t: W.rewardWardrobe(hat?.name ?? reward.wardrobe) });
    }
    return bits;
  }

  // ---------- the purse, always in view: claimed coins fly to it ----------

  const coinsText = el("span");
  const coinsChip = el("span.hh-chip.hh-chip--honey", null, [
    pic(item("coin"), 20, "", "hh-icon"),
    coinsText,
  ]);
  const lead = el("div.hh-goals__lead", null, [el("p.hh-sub", { text: W.lead }), coinsChip]);
  let shownCoins = -1;
  let ticking = 0;
  /** Show the coins; after a claim the number counts up as the coins land. */
  function setCoins(n, countUp) {
    cancelAnimationFrame(ticking);
    if (!countUp || !app.settings.motion || shownCoins < 0 || n <= shownCoins) {
      shownCoins = n;
      text(coinsText, number(n));
      return;
    }
    const from = shownCoins;
    const t0 = performance.now() + 350;
    const tick = (/** @type {number} */ t) => {
      const k = Math.max(0, Math.min(1, (t - t0) / 500));
      shownCoins = Math.round(from + (n - from) * k);
      text(coinsText, number(shownCoins));
      if (k < 1) ticking = requestAnimationFrame(tick);
    };
    ticking = requestAnimationFrame(tick);
  }

  // ---------- the open goals ----------

  const openList = el("div.hh-goals__open");
  const emptyText = el("p.hh-text");
  const empty = el("div.hh-card.hh-card--tint.hh-goals__empty", { hidden: true }, [
    pic(honeycomb(), 44),
    emptyText,
  ]);

  /** @type {Map<string, { node: HTMLElement, meter: HTMLElement, count: HTMLElement, hint: HTMLElement | null, claim: HTMLElement }>} */
  const cards = new Map();
  let openKey = "\u0000";

  function makeCard(goal, fresh) {
    const hint = GOAL_HINTS[goal.measure];
    const meter = el("div.hh-meter.hh-meter--leaf");
    const count = el("span.hh-goals__count");
    const claim = el(
      "button.hh-btn.hh-btn--leaf.hh-btn--block.hh-goals__claim",
      {
        type: "button",
        hidden: true,
        dataset: { sound: "claim", act: "claim" },
        "aria-label": W.claimLabel(goal.name),
        onclick: () => claimGoal(goal.id),
      },
      W.claim,
    );
    const hintEl = hint
      ? el("div.hh-goals__hint", null, [
          el("p.hh-sub", { text: hint.text }),
          hint.sheet &&
            el(
              "button.hh-btn.hh-btn--small.hh-btn--secondary",
              { type: "button", onclick: () => app.sheet(hint.sheet ?? "") },
              hint.open ?? "",
            ),
        ])
      : null;
    const node = el(
      "article.hh-card.hh-goals__card",
      { class: fresh ? "hh-fade" : null, dataset: { goal: goal.id } },
      [
        el("div.hh-goals__top", null, [
          el(
            "span.hh-goals__pic",
            null,
            tall(
              safe(() => GOAL_PIC[goal.measure]?.(goal)),
              46,
            ),
          ),
          el("div.hh-goals__words", null, [
            el("h3.hh-heading.hh-goals__name", { text: goal.name }),
            el("p.hh-goals__text", { text: goal.text }),
          ]),
        ]),
        hintEl,
        el("div.hh-goals__meter", null, [meter, count]),
        el("div.hh-goals__reward", null, [
          el("span.hh-goals__rewardlabel", { text: W.reward }),
          ...rewardBits(goal.reward).map((b) =>
            el("span.hh-goals__gift", null, [tall(b.s, 22, "hh-icon"), b.t]),
          ),
        ]),
        claim,
      ],
    );
    return { node, meter, count, hint: hintEl, claim };
  }

  function claimGoal(id) {
    if (performance.now() < settleUntil) return;
    const card = cards.get(id);
    const box = card?.claim.getBoundingClientRect();
    const at = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
    const goal = C.GOALS.find((g) => g.id === id);
    const events = app.dispatch({ type: "claimGoal", goal: id });
    if (!goal || !events.some((e) => e.type === "goalClaimed")) return;
    settleUntil = performance.now() + 500;
    const bits = rewardBits(goal.reward);
    app.toast(W.claimed(list(bits.map((b) => b.t))), { icon: bits[0]?.s, sound: false });
    if (at) {
      app.fx("sparkle", { at, n: 9 });
      if (goal.reward.coins)
        app.fx("coins", {
          from: at,
          to: coinsChip,
          n: Math.min(9, 2 + Math.ceil(goal.reward.coins / 10)),
        });
    }
    if (events.some((e) => e.type === "renownUp")) {
      app.sound("tier");
      const rung = rungs[app.state.progress.tier];
      if (rung) app.fx("pop", { el: rung.node });
    }
  }

  // ---------- the renown ladder ----------

  const renownChip = el("span");
  /** @type {{ node: HTMLElement, star: HTMLElement, here: HTMLElement }[]} */
  const rungs = [];
  const nextMeter = el("div.hh-meter");
  const nextText = el("p.hh-sub.hh-goals__nexttext");
  const customers = el("p.hh-sub.hh-goals__customers");
  const nextBox = el("div.hh-goals__next", null, [nextMeter, nextText, customers]);
  const ladder = el("section.hh-goals__ladder", null, [
    el("div.hh-goals__ladderhead", null, [
      el("h3.hh-heading", { text: W.renown }),
      el("span.hh-chip", null, [pic(item("star"), 20, "", "hh-icon"), renownChip]),
    ]),
    el("p.hh-sub.hh-goals__source", { text: W.source }),
    el(
      "ol.hh-goals__rungs",
      null,
      C.TIERS.map((tier) => {
        const star = el("span.hh-goals__star", null, pic(item("star"), 26));
        const here = el("span.hh-chip.hh-chip--leaf.hh-goals__here", {
          hidden: true,
          text: W.here,
        });
        const node = el("li.hh-goals__rung", null, [
          star,
          el("div.hh-goals__rungwords", null, [
            el("div.hh-goals__rungname", null, [el("b", { text: tier.name }), here]),
            el("div.hh-row__sub", { text: W.from(tier.renown) }),
            el("div.hh-goals__brings", { text: tier.blurb }),
          ]),
        ]);
        rungs.push({ node, star, here });
        return node;
      }),
    ),
  ]);
  let nextAt = -1;

  // ---------- what is done ----------

  const doneTitle = el("span");
  const doneList = el("ul.hh-list.hh-goals__donelist");
  const done = el("details.hh-goals__done", { hidden: true }, [
    el("summary.hh-goals__donehead", null, [
      doneTitle,
      el("span.hh-goals__chev", { "aria-hidden": "true" }),
    ]),
    doneList,
  ]);
  let doneKey = "";

  root.append(lead, openList, empty, el("div.hh-sprig", { role: "separator" }), ladder, done);

  function draw(countUp = false) {
    const state = app.state;
    setCoins(state.purse.coins, countUp);

    // The open goals, each card kept for as long as its goal is open.
    // A reward that is waiting goes to the top; the rest keep the list's order.
    const now = C.goalsNow(state);
    const open = [...now.filter((g) => g.ready), ...now.filter((g) => !g.ready)];
    const key = open.map((g) => g.goal.id).join(",");
    if (key !== openKey) {
      const first = openKey === "\u0000";
      openKey = key;
      for (const g of open)
        if (!cards.has(g.goal.id)) cards.set(g.goal.id, makeCard(g.goal, !first));
      for (const id of [...cards.keys()]) if (!open.some((g) => g.goal.id === id)) cards.delete(id);
      openList.replaceChildren(...open.map((g) => /** @type {any} */ (cards.get(g.goal.id)).node));
    }
    for (const g of open) {
      const card = cards.get(g.goal.id);
      if (!card) continue;
      card.node.classList.toggle("is-ready", g.ready);
      card.meter.style.setProperty("--hh-value", String(g.need > 0 ? g.have / g.need : 1));
      text(card.count, g.ready ? W.ready : W.progress(g.have, g.need));
      if (card.hint) show(card.hint, !g.ready);
      show(card.claim, g.ready);
    }
    show(empty, open.length === 0);
    if (!open.length)
      text(emptyText, state.progress.claimed.length >= C.GOALS.length ? W.allDone : W.noneNow);

    // The ladder.
    const standing = C.tierOf(state);
    text(renownChip, W.have(standing.renown));
    rungs.forEach((rung, i) => {
      const reached = i <= standing.tier;
      rung.node.classList.toggle("is-reached", reached);
      rung.node.classList.toggle("is-here", i === standing.tier);
      rung.node.setAttribute("aria-label", W.rung(C.TIERS[i].name, reached));
      show(rung.here, i === standing.tier);
    });
    if (nextAt !== standing.tier) {
      nextAt = standing.tier;
      rungs[standing.tier]?.node.querySelector(".hh-goals__rungwords")?.append(nextBox);
    }
    if (standing.next) {
      const base = C.TIERS[standing.tier].renown;
      const span = standing.next.renown - base;
      nextMeter.style.setProperty(
        "--hh-value",
        String(span > 0 ? (standing.renown - base) / span : 1),
      );
      text(
        nextText,
        W.next(Math.max(0, standing.next.renown - standing.renown), standing.next.name),
      );
    } else text(nextText, W.top);
    show(nextMeter, !!standing.next);
    text(customers, W.customers(standing.customers));

    // What is done, newest first.
    const claimed = state.progress.claimed;
    const dk = claimed.join(",");
    if (dk !== doneKey) {
      doneKey = dk;
      text(doneTitle, W.done(claimed.length));
      doneList.replaceChildren(
        ...[...claimed].reverse().map((id) => {
          const goal = C.GOALS.find((g) => g.id === id);
          return (
            goal &&
            el("li.hh-row", null, [
              pic(icon("check"), 26, "", "hh-icon"),
              el("div.hh-row__text", null, [
                el("div.hh-row__title", { text: goal.name }),
                el("div.hh-row__sub", { text: goal.text }),
              ]),
            ])
          );
        }),
      );
    }
    show(done, claimed.length > 0);
  }

  draw();

  return {
    update(state, events) {
      draw(!!events?.some((e) => e.type === "goalClaimed"));
    },
    unmount() {
      cancelAnimationFrame(ticking);
    },
  };
}
