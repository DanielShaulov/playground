// @ts-check
/**
 * The workshop, one corner of the evening (ui/evening.js): every upgrade as a
 * card that draws what it changes on the thing itself.
 *
 * - shelf: the shelf in miniature, with the new spots dashed in green;
 * - jars: today's jar beside the bigger one, notch for notch;
 * - crocks: the crock, a plain jar's days along the flavour strip against the
 *   same jar's days in the crock, and the shelf spots to fit it in.
 *
 * Screen-only state: ui.evening.spot = { crock id → chosen shelf spot }.
 * Buttons carry data-act="up-…"; upgradesAct() dispatches `upgrade`.
 */

import { RECIPES } from "../content/recipes.js";
import { UPGRADES } from "../content/upgrades.js";
import { TIERS } from "../content/goals.js";
import { SERVINGS } from "../content/tuning.js";
import { upgradeOffers, jarSize, menu } from "../core/index.js";
import { jarSvg } from "./art/jar.js";
import { strip } from "./strip.js";

/** Stoneware colours per crock: body, shadow. A spot with no crock is plain. */
const CROCK = {
  cool: ["#8ea4ae", "#6c818b"],
  warm: ["#cf7f4f", "#a65c34"],
};

/** A crock, drawn for its upgrade id. */
export function crockSvg(id, cls = "crock") {
  const [body, dark] = CROCK[id] ?? ["#d9c6a5", "#b9a37f"];
  return `<svg class="${cls}" viewBox="-30 -30 60 56" aria-hidden="true">
    <path d="M-22 -18 Q-27 0 -21 18 Q-19 24 -12 24 H12 Q19 24 21 18 Q27 0 22 -18 Z" fill="${body}"/>
    <path d="M-25 -2 H25" stroke="${dark}" stroke-width="3" opacity=".7"/>
    <path d="M-24 6 H24" stroke="${dark}" stroke-width="1.6" opacity=".5"/>
    <rect x="-25" y="-25" width="50" height="8" rx="3" fill="${dark}"/>
    <path d="M-15 -11 Q-17 4 -13 16" stroke="#fff" stroke-width="2.5" fill="none" opacity=".25" stroke-linecap="round"/>
    ${id === "warm" ? `<path d="M-8 -36 q4 -5 0 -10 M2 -35 q4 -5 0 -10 M12 -36 q4 -5 0 -10" stroke="#c9895a" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7" transform="translate(-2 6)"/>` : ""}
    ${id === "cool" ? `<path d="M-30 -29 l3 3 M30 -29 l-3 3 M-29 -20 h4 M29 -20 h-4" stroke="#8ea4ae" stroke-width="2" stroke-linecap="round"/>` : ""}
  </svg>`;
}

/** The first base recipe on the menu: the jar every crock card measures with. */
const refRecipe = (s) => menu(s).find((id) => !RECIPES[id].base) ?? "dill";

/** Day ticks along the strip for a plain jar of `recipe` ripening at `pace`. */
function dayTicks(recipe, pace) {
  const ticks = [];
  for (let d = 1; d <= 6; d++) {
    const at = (d * 24 * pace) / RECIPES[recipe].hours;
    if (at >= 1) break;
    ticks.push({ at, label: `${d}d` });
  }
  return ticks;
}

const days = (h) => {
  const d = Math.round((h / 24) * 2) / 2;
  return `${Math.floor(d)}${d % 1 ? "½" : ""} day${d === 1 ? "" : "s"}`;
};

/** The button at the foot of a card: buy, locked behind a tier, or all done. */
function buyButton(s, o, label, extra = "") {
  if (!o.next) return `<button class="buy done" disabled>All built</button>`;
  if (o.locked) {
    const t = TIERS[o.next.tier];
    return `<button class="buy locked" disabled>🔒 Opens at ${t.name}<small>after 🪙 ${t.earned} taken</small></button>`;
  }
  return `<button class="buy" data-act="up-buy" data-id="${o.id}" ${extra} ${s.shop.coins < o.next.cost ? "disabled" : ""}>${label}<small>🪙 ${o.next.cost}</small></button>`;
}

function shelfCard(s, o) {
  const have = s.shelf.slots.length;
  const add = o.next ? (UPGRADES[o.id].slots ?? 0) : 0;
  let cells = "";
  for (let i = 0; i < have + add; i++) {
    const jar = s.shelf.slots[i];
    cells += i < have ? `<i class="${jar ? "full" : ""}"></i>` : `<i class="new">+</i>`;
  }
  return `<div class="look mini-shelf">${cells}</div>
    <p>${have} spots now${add ? `, <b>${have + add}</b> after` : ""}.</p>
    ${buyButton(s, o, `Build ${add} more spots`)}`;
}

function jarsCard(s, o) {
  const now = jarSize(s);
  const id = refRecipe(s);
  const jar = (size, k) =>
    jarSvg({ id: 760 + k, recipe: id, age: 0, servings: size, size }, "ujar");
  const after = o.next ? now + 1 : now;
  return `<div class="look jars">
      <figure>${jar(now, 0)}<figcaption>${now} portions</figcaption></figure>
      ${o.next ? `<span class="arrow">→</span><figure class="bigger">${jar(after, 1)}<figcaption><b>${after} portions</b></figcaption></figure>` : ""}
    </div>
    <p>Same price to start. Jars already on the shelf keep their size.</p>
    ${buyButton(s, o, "Get bigger jars")}`;
}

function crockCard(s, o, ui) {
  const pace = o.pace ?? 1;
  const id = refRecipe(s);
  const r = RECIPES[id];
  const spots = s.shelf.slots.length;
  const picked = ui.evening.spot ?? (ui.evening.spot = {});
  let spot = picked[o.id];
  if (spot === undefined || spot >= spots) {
    spot = s.shelf.slots.findIndex((_, i) => s.progress.crocks[i] !== o.id);
    picked[o.id] = spot;
  }
  let grid = "";
  for (let i = 0; i < spots; i++) {
    const c = s.progress.crocks[i];
    const cls = `spot${i === spot ? " on" : ""}${c ? ` c-${c}` : ""}`;
    grid += `<button class="${cls}" data-act="up-spot" data-id="${o.id}" data-slot="${i}" aria-label="Spot ${i + 1}">${c ? crockSvg(c, "mini") : ""}<span>${i + 1}</span></button>`;
  }
  const there = spot >= 0 ? s.progress.crocks[spot] : undefined;
  const fitted = there === o.id;
  const note =
    spot < 0
      ? "Every spot has one."
      : fitted
        ? `Spot ${spot + 1} has one.`
        : there
          ? `Spot ${spot + 1}: swaps out the ${UPGRADES[there].name.toLowerCase()}.`
          : s.shelf.slots[spot]
            ? `Spot ${spot + 1}: the jar there now keeps its pace. The next one ripens in the crock.`
            : `Spot ${spot + 1}: the next jar started there ripens in the crock.`;
  const btn =
    spot < 0 || fitted
      ? `<button class="buy done" disabled>Fitted</button>`
      : buyButton(s, o, `Fit in spot ${spot + 1}`, `data-slot="${spot}"`);
  return `<div class="look crockrow">${crockSvg(o.id)}
      <div class="pace">
        <div class="lane"><small>Plain spot · ${r.name.toLowerCase()} pops after ${days(r.hours)}</small>${strip({ ticks: dayTicks(id, 1) })}</div>
        <div class="lane"><small>${o.name} · pops after <b>${days(r.hours / pace)}</b></small>${strip({ ticks: dayTicks(id, pace) })}</div>
      </div></div>
    <div class="spots">${grid}</div>
    <p>${note}</p>
    ${btn}`;
}

export function upgradesHtml(s, ui) {
  const cards = upgradeOffers(s).map((o) => {
    const body =
      o.kind === "shelf"
        ? shelfCard(s, o)
        : o.kind === "jars"
          ? jarsCard(s, o)
          : crockCard(s, o, ui);
    const lvl =
      o.kind === "crock"
        ? o.level
          ? `<span class="lvl">in ${o.level} spot${o.level > 1 ? "s" : ""}</span>`
          : ""
        : UPGRADES[o.id].levels.length > 1
          ? `<span class="lvl">${o.level} of ${UPGRADES[o.id].levels.length}</span>`
          : o.level
            ? `<span class="lvl">done</span>`
            : "";
    return `<section class="up up-${o.kind}${o.locked ? " is-locked" : ""}" data-id="${o.id}">
      <h3>${o.name}${lvl}</h3><p class="what">${o.text}</p>${body}</section>`;
  });
  return `<p class="lead">Buy tonight, use from tomorrow morning.</p>${cards.join("")}`;
}

/**
 * Handle a workshop button. Returns false for anything that isn't the workshop's.
 * @param {string} act
 * @param {HTMLElement} t
 * @param {any} ui
 * @param {(action: any) => any[]} dispatch
 * @param {(text: string) => void} toast
 */
export function upgradesAct(act, t, ui, dispatch, toast) {
  if (act === "up-spot") {
    (ui.evening.spot ??= {})[/** @type {string} */ (t.dataset.id)] = Number(t.dataset.slot);
    return true;
  }
  if (act !== "up-buy") return false;
  /** @type {any} */
  const action = { type: "upgrade", id: t.dataset.id };
  if (t.dataset.slot !== undefined) action.slot = Number(t.dataset.slot);
  const events = dispatch(action);
  const no = events.find((e) => e.type === "rejected");
  if (no) toast(no.why[0].toUpperCase() + no.why.slice(1));
  return true;
}

/** Portions a jar on the shelf holds beyond the usual, for the shop to draw it larger. */
export const bigJar = (jar) => (jar?.size ?? SERVINGS) > SERVINGS;
