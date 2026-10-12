// @ts-check
/**
 * The brewing bench: a full-screen panel over the shop.
 *
 * Pick a base recipe, drop add-ins from the pantry into the mix, and the
 * time-lapse redraws at once: jars at fixed hours from 0 to past the pop, a
 * green curve of how many walk-ins want the jar at each hour (with a dashed
 * ghost for a plain jar),
 * and a timeline bar coloured by flavour hour by hour. Nothing changes the
 * game until a button dispatches an action:
 *
 *   evening            buy { ingredient } in the pantry, experiment { recipe, adds }
 *   morning / open     brew { slot, recipe, adds } into the empty spot it was opened for
 *
 * Screen-only state lives in ui.bench = { recipe, adds, slot, note } (null when closed).
 * Buttons carry data-act="bench…"; main.js hands them to benchAct().
 */

import { RECIPES, RECIPE_IDS } from "../content/recipes.js";
import { INGREDIENTS, INGREDIENT_IDS, MAX_ADDS } from "../content/ingredients.js";
import { BANDS } from "../content/flavour.js";
import { SERVINGS } from "../content/tuning.js";
import {
  previewCurve,
  recipeCard,
  ageAt,
  forecast,
  demand,
  demandAt,
  marketToday,
  menu,
} from "../core/index.js";
import { jarSvg } from "./art/jar.js";
import { recipeCardHtml } from "./recipe-card.js";
import { patch } from "./dom.js";

/** Columns in the time-lapse. */
const COLS = 5;
/** Flavour → colour, matching the shop's flavour strip. */
/** @type {[number, string][]} */
const STOPS = [
  [0, "var(--crisp)"],
  [0.4, "var(--tangy)"],
  [0.7, "var(--sour)"],
  [1, "var(--funky)"],
];
const TAG_ICON = { slower: "⏪", faster: "⏩", sweet: "✨", funk: "✨" };

let lastRecipe = RECIPE_IDS[0];

/** The time-lapse axis for a base recipe: a bit past a plain jar's pop, in whole 4 h steps. */
const axisOf = (base) => Math.ceil((RECIPES[base].hours * 1.25) / 4) * 4;
const hrs = (h) => `${Math.round(h)}h`;
const pct = (x) => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;

export const tagHtml = (tag) => `<span class="tag t-${tag}">${TAG_ICON[tag] ?? ""} ${tag}</span>`;

export function mountBench(parent) {
  const el = document.createElement("div");
  el.className = "bench";
  el.hidden = true;
  el.innerHTML = `
    <header class="top">
      <button class="back" data-act="bench-close" aria-label="Back to the shop">‹</button>
      <div class="title">Brewing bench</div>
      <div class="pill coins" data-r="coins"></div>
    </header>
    <div class="scroll">
      <div class="bases" data-r="bases"></div>
      <section class="card mix" data-r="mix"></section>
      <section class="card lapse" data-r="lapse"></section>
      <section class="card pantry" data-r="pantry"></section>
      <section class="card rcard" data-r="card"></section>
    </div>
    <div data-r="note"></div>
    <footer class="actions" data-r="actions"></footer>`;
  parent.appendChild(el);
  /** @type {Record<string, HTMLElement>} */
  const r = {};
  for (const x of el.querySelectorAll("[data-r]"))
    r[/** @type {HTMLElement} */ (x).dataset.r] = /** @type {HTMLElement} */ (x);
  return { el, r };
}

/** Open the bench; `slot` is the empty shelf spot a brew goes into (none in the evening). */
export function openBench(ui, slot = null) {
  ui.bench = { recipe: lastRecipe, adds: [], slot, note: null };
}

/**
 * Handle a bench button. Returns false for anything that isn't the bench's.
 * @param {string} act
 * @param {HTMLElement} t
 * @param {any} ui
 * @param {(action: any) => any[]} dispatch
 * @param {(text: string) => void} toast
 */
export function benchAct(act, t, ui, dispatch, toast) {
  if (act === "bench") {
    openBench(ui, t.dataset.slot !== undefined ? Number(t.dataset.slot) : null);
    if (ui.sheet?.kind === "brew") ui.sheet = null;
    return true;
  }
  const b = ui.bench;
  if (!b || !act.startsWith("bench-")) return false;
  const s = ui.s;
  const ing = t.dataset.ingredient;
  if (act === "bench-close") {
    ui.bench = null;
  } else if (act === "bench-base") {
    b.recipe = lastRecipe = t.dataset.recipe;
  } else if (act === "bench-add") {
    if (b.adds.includes(ing)) b.adds = b.adds.filter((a) => a !== ing);
    else if (b.adds.length < MAX_ADDS && (s.pantry.stock[ing] ?? 0) > 0) b.adds.push(ing);
  } else if (act === "bench-drop") {
    b.adds = b.adds.filter((a) => a !== ing);
  } else if (act === "bench-buy") {
    dispatch({ type: "buy", ingredient: ing });
  } else if (act === "bench-try") {
    const events = dispatch({ type: "experiment", recipe: b.recipe, adds: b.adds });
    const found = events.find((e) => e.type === "discovered");
    if (events.some((e) => e.type === "experimented")) {
      b.note = found
        ? { big: true, text: `✨ New recipe: ${RECIPES[found.recipe].name}! It's on the menu now.` }
        : { text: "Tried it. The recipe card has noted what you used." };
      b.note.until = performance.now() + 4000;
      b.adds = b.adds.filter((a) => (ui.s.pantry.stock[a] ?? 0) > 0);
    }
  } else if (act === "bench-brew") {
    const events = dispatch({ type: "brew", slot: b.slot, recipe: b.recipe, adds: b.adds });
    const brewed = events.find((e) => e.type === "brewed");
    if (brewed) {
      const found = events.find((e) => e.type === "discovered");
      if (found) toast(`✨ New recipe: ${RECIPES[found.recipe].name}! It's on the menu now.`);
      ui.bench = null;
    }
  }
  return true;
}

/** What the bench can do right now: brew into a spot, try a mix, or only look. */
function modeOf(s, b) {
  if (b.slot !== null && s.clock.phase !== "evening" && !s.shelf.slots[b.slot]) return "brew";
  if (s.clock.phase === "evening") return "try";
  return "look";
}

export function renderBench(view, ui) {
  const b = ui.bench;
  view.el.hidden = !b;
  if (!b) return;
  const s = ui.s;
  if (b.note && performance.now() > b.note.until) b.note = null;
  const mode = modeOf(s, b);
  const curve = previewCurve(b.recipe, b.adds);
  const made = curve.recipe;
  const secret = made !== b.recipe && !s.bench.known.includes(made);
  const evening = s.clock.phase === "evening";

  // Every recipe on the menu that isn't a discovered one: the starting four and those a tier unlocked.
  const baseIds = menu(s).filter((id) => !RECIPES[id].base);
  const bases = baseIds
    .map((id, i) => {
      const r = RECIPES[id];
      const jar = {
        id: 800 + i,
        recipe: id,
        age: r.hours * 0.3,
        servings: SERVINGS,
      };
      return `<button class="base${id === b.recipe ? " on" : ""}" data-act="bench-base" data-recipe="${id}">${jarSvg(jar, "bjar-base")}<span>${r.name}</span></button>`;
    })
    .join("");

  const mixName =
    made === b.recipe
      ? RECIPES[b.recipe].name
      : secret
        ? `${RECIPES[b.recipe].name} + ✨?`
        : RECIPES[made].name;
  let slots = "";
  for (let i = 0; i < MAX_ADDS; i++) {
    const a = b.adds[i];
    if (a) {
      const g = INGREDIENTS[a];
      slots += `<button class="add" data-act="bench-drop" data-ingredient="${a}" aria-label="Take out ${g.name}"><span class="ico">${g.icon}</span><b>${g.name}</b>${tagHtml(g.tag)}</button>`;
    } else {
      slots += `<div class="add empty">+<small>${i === b.adds.length ? "from the pantry" : ""}</small></div>`;
    }
  }

  const market = evening ? marketToday(s) : [];
  const pantry = INGREDIENT_IDS.map((id) => {
    const g = INGREDIENTS[id];
    const have = s.pantry.stock[id] ?? 0;
    const inMix = b.adds.includes(id);
    const canAdd = inMix || (have > 0 && b.adds.length < MAX_ADDS);
    // Until the market screen lands, the pantry buys from today's stalls.
    const stall = market.find((m) => m.ingredient === id);
    const buy = !evening
      ? ""
      : !stall
        ? `<button class="buy" disabled>Not today</button>`
        : `<button class="buy" data-act="bench-buy" data-ingredient="${id}" ${stall.room < 1 || stall.left < 1 || s.shop.coins < stall.price ? "disabled" : ""}>+1 · 🪙${stall.price}</button>`;
    return `<div class="pi${inMix ? " in" : ""}${have ? "" : " out"}"><button class="pick" data-act="bench-add" data-ingredient="${id}" ${canAdd ? "" : "disabled"}>
      <span class="ico">${g.icon}</span><b>${g.name}</b><i class="n">×${have}</i>${tagHtml(g.tag)}</button>${buy}</div>`;
  }).join("");

  const card = recipeCard(s, b.recipe);

  let action;
  if (mode === "brew") {
    const cost = RECIPES[b.recipe].cost;
    action = `<button class="main" data-act="bench-brew" ${s.shop.coins < cost ? "disabled" : ""}>Brew in spot ${b.slot + 1}<small>🪙 ${cost}${b.adds.length ? " + add-ins" : ""}</small></button>`;
  } else if (mode === "try") {
    action = `<button class="main" data-act="bench-try" ${b.adds.length ? "" : "disabled"}>${b.adds.length ? "Try this mix" : "Pick add-ins to try"}<small>uses 1 of each add-in, no coins</small></button>`;
  } else {
    action = `<button class="main" disabled>Tap an empty shelf spot to brew</button>`;
  }

  const note = b.note
    ? `<div class="note${b.note.big ? " big" : ""}">${b.note.text}</div>`
    : `<div class="note hint">${
        mode === "try"
          ? "Trying a mix is free in the evening. The recipe card remembers."
          : mode === "brew"
            ? `Add-ins come from the pantry. Restock it in the evening.`
            : ""
      }</div>`;

  const { r } = view;
  patch(r.coins, `🪙 ${s.shop.coins}`);
  patch(r.bases, bases);
  patch(
    r.mix,
    `<h3>Your mix · <span>${mixName}</span></h3>
    <div class="slots"><div class="add basejar">${jarSvg({ id: 870, recipe: secret ? b.recipe : made, age: 0, servings: SERVINGS }, "bjar-mix")}<b>${RECIPES[b.recipe].name}</b><span class="tag t-base">base</span></div>${slots}</div>`,
  );
  patch(r.lapse, timelapseHtml(b.recipe, b.adds, curve, secret));
  patch(
    r.pantry,
    `<h3>Pantry${evening ? "" : ` <span class="dim">· restock in the evening</span>`}</h3><div class="items">${pantry}</div>`,
  );
  patch(r.card, recipeCardHtml(card));
  patch(r.note, note);
  patch(r.actions, `<button data-act="bench-close">Back</button>${action}`);
}

/**
 * The time-lapse: jars at fixed hours over the demand curve (and a plain
 * jar's as a dashed ghost), and a bar coloured by the jar's flavour at each
 * hour. A secret mix shows its base's demand so nothing gives the find away.
 */
function timelapseHtml(base, adds, curve, secret) {
  const axis = axisOf(base);
  const showRecipe = secret ? base : curve.recipe;
  const popAt = curve.popAt;
  // How keen walk-ins are on a jar of `recipe` with `adds` after `hour` hours (0 once popped).
  const keen = (recipe, mix, hour) =>
    hour >= ageAt(recipe, mix, 1) ? 0 : demandAt(recipe, forecast(recipe, hour, mix));
  const peak = ageAt(showRecipe, adds, demand(showRecipe).mean);
  const plainPeak = ageAt(base, [], demand(base).mean);

  let jars = "";
  for (let i = 0; i < COLS; i++) {
    const hour = (axis * i) / (COLS - 1);
    const jar = { id: 880, recipe: showRecipe, age: hour, servings: SERVINGS, adds };
    const wanted = keen(showRecipe, adds, hour) >= 0.6;
    jars += `<div class="col${wanted ? " sweet" : ""}" style="left:${pct(i / (COLS - 1))}">${jarSvg(jar, `bjar${i}`)}<span>${hrs(hour)}</span></div>`;
  }

  // The demand curve over the hours: how many walk-ins want the jar as it is then.
  const line = (recipe, mix) => {
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const y = 100 - 88 * keen(recipe, mix, (axis * i) / 100);
      pts.push(`${i},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const showGhost = adds.length > 0 && Math.abs(plainPeak - peak) > 0.5;
  const svg = `<svg class="curve" viewBox="0 0 100 100" preserveAspectRatio="none" data-peak="${((peak / axis) * 100).toFixed(1)}">
      ${showGhost ? `<polyline class="ghost" points="${line(base, [])}"/>` : ""}
      <polygon class="area" points="0,100 ${line(showRecipe, adds)} 100,100"/>
    </svg>
    <div class="want" style="left:${pct(peak / axis)}">most wanted ~${hrs(peak)}</div>`;

  // Colour stops along the time axis: flavour f is reached at ageAt(f).
  const stops = STOPS.map(([f, c]) => `${c} ${pct(ageAt(showRecipe, adds, f) / axis)}`);
  const popPct = pct(popAt / axis);
  const bar = `linear-gradient(90deg, ${stops.join(", ")}, #cbb9a0 ${popPct})`;
  const ticks = BANDS.slice(1)
    .map((band) => ageAt(showRecipe, adds, band.lo) / axis)
    .filter((x) => x > 0 && x < 1)
    .map((x) => `<i style="left:${pct(x)}"></i>`)
    .join("");

  // How much sooner the most wanted moment comes than for a plain jar of the base.
  const sooner = plainPeak - peak;
  const shiftLine =
    sooner >= 1
      ? `<b class="soon">ready ${hrs(sooner)} sooner</b>`
      : sooner <= -1
        ? `<b class="late">ready ${hrs(-sooner)} later</b>`
        : "";
  // Flavour words under the bar, centred on each band's stretch of hours.
  const words = BANDS.map((band) => {
    const lo = ageAt(showRecipe, adds, band.lo) / axis;
    const hi = Math.min(1, ageAt(showRecipe, adds, Math.min(1, band.hi)) / axis);
    const mid = (lo + hi) / 2;
    // The pop label sits right of the pop, or ends at it near the right edge.
    const popX = popAt <= axis ? popAt / axis : 0.62;
    if (hi - lo < 0.13 || mid > popX - (popX > 0.75 ? 0.45 : 0.15)) return "";
    return `<span class="w-${band.id}" style="left:${pct(mid)}">${band.id}</span>`;
  }).join("");
  const pops =
    popAt <= axis
      ? `<span class="pop${popAt / axis > 0.75 ? " end" : ""}" style="left:${popPct}">💥 pops ${hrs(popAt)}</span>`
      : `<span class="pop off">pops ${hrs(popAt)} →</span>`;

  return `<h3>Time-lapse <span class="right">${shiftLine}</span></h3>
    <div class="track">
      ${svg}
      ${jars}
    </div>
    <div class="bar" style="background:${bar}">${ticks}</div>
    <div class="words">${words}${pops}</div>
    <div class="key"><b></b> how many customers want it${showGhost ? ` · <i></i> plain ${RECIPES[base].name.toLowerCase()}` : ""}</div>`;
}
