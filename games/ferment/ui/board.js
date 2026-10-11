// @ts-check
/**
 * The order board and morning planning.
 *
 * The board is a row of tickets under the top bar, one per order taken
 * (state.orders.list), soonest first: who, what, how many, when, and their
 * window drawn on the flavour strip. A regular's ticket carries a stamp; a
 * bulk order shows its jars as pips. Jars already started for an order show
 * as marks on its strip, at the spot they will reach by pickup. Today's bulk
 * offers (state.orders.offers) sit at the front; their planner has Take / Pass. Off-menu
 * requests (state.orders.asked, recipes not on the menu yet) pin a hint ticket that opens the
 * bench on the right base.
 *
 * Tapping an order ticket opens the planner: a jar for that order, started
 * now, previewed through core planFor() on the strip and on a day timeline
 * (when it is at its best, when they come) before anything is committed.
 * Timing add-ins from the pantry can be toggled in; "Start" dispatches
 * startForOrder into the chosen empty shelf spot.
 *
 * Screen-only state: ui.plan = { orderId, slot, adds } (null when closed).
 * Buttons carry data-act="board-…" (and "order"); main.js hands them to boardAct().
 */

import { RECIPES } from "../content/recipes.js";
import { INGREDIENTS, INGREDIENT_IDS, MAX_ADDS } from "../content/ingredients.js";
import { OPEN_AT, OPEN_HOURS } from "../content/tuning.js";
import { REGULARS } from "../content/regulars.js";
import { planFor, forecast, isOver, ageAt } from "../core/index.js";
import { faceSvg } from "./art/customer.js";
import { jarSvg, emptyJarSvg } from "./art/jar.js";
import { openBench } from "./bench.js";
import { strip, stripLabels } from "./strip.js";
import { word } from "./text.js";
import { patch, setClass } from "./dom.js";

/** @typedef {import("../core/types.js").State} State */
/** @typedef {import("../core/types.js").Order} Order */

const pct = (x) => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;

/** Clock text for an hour counted from opening (may run into the night). */
export function clockAt(hour) {
  const t = (((OPEN_AT + hour) % 24) + 24) % 24;
  const h = Math.floor(t);
  const m = Math.floor(((t - h) * 60) / 10) * 10;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** "Today 9:30", "Tomorrow", "In 3 days" for an order's pickup. */
export function dueText(s, o) {
  const d = o.due - s.clock.day;
  if (d <= 0) return `Today ${clockAt(o.arriveAt)}`;
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

/** Hours from now until (day, hour). */
const hoursUntil = (s, day, hour) => (day - s.clock.day) * 24 + hour - s.clock.hour;

/** Jars on the shelf started for an order, with where each will be at pickup. */
function jarsFor(s, o) {
  const dt = Math.max(0, hoursUntil(s, o.due, o.arriveAt));
  return (o.jars ?? [])
    .map((id) => s.shelf.slots.find((j) => j && j.id === id))
    .filter(Boolean)
    .map((jar) => ({
      jar,
      at: isOver(jar) ? 1 : Math.min(1, forecast(jar.recipe, jar.age + dt, jar.adds ?? [])),
    }));
}

/** Off-menu requests still waiting to be worked out at the bench. */
const askedOf = (s) =>
  (s.orders.asked ?? []).filter((a) => RECIPES[a.recipe] && !s.bench.known.includes(a.recipe));

const whatLine = (o) => {
  const mid = (o.lo + o.hi) / 2;
  const qty = o.qty ? ` ×${o.qty}` : "";
  return `${RECIPES[o.recipe].name}${qty}, ${word(mid)}`;
};

function ticketHtml(s, o) {
  const today = o.due <= s.clock.day;
  const reg = o.regular && REGULARS[o.regular];
  const jars = jarsFor(s, o);
  const cls = ["ticket", `k-${o.kind ?? "preorder"}`];
  if (today) cls.push("today");
  if (o.arrived) cls.push("here");
  const need = o.qty ?? 1;
  const got = o.got ?? 0;
  let pips = "";
  if (o.qty) {
    for (let i = 0; i < need; i++)
      pips += `<i class="${i < got ? "got" : i < got + jars.length ? "brewing" : ""}"></i>`;
    pips = `<span class="pips">${pips}</span>`;
  }
  const marks = jars.map((x) => x.at);
  const fits = marks.some((f) => f >= o.lo && f <= o.hi && f < 1);
  return `<button class="${cls.join(" ")}" data-act="order" data-order="${o.id}">
    <div class="who"><span class="face">${faceSvg(o.look, "wait")}</span><span class="name">${o.name}</span></div>
    <div class="what">${whatLine(o)} ${pips}</div>
    <div class="due"><span>${o.arrived ? "Here now" : dueText(s, o)}</span>${reg ? `<span class="stamp">regular</span>` : ""}</div>
    ${stripMarks(o, marks, fits)}</button>`;
}

/** A strip with the order's window and the started jars' marks at pickup. */
function stripMarks(win, marks, fits, big = false) {
  const html = strip({ win, big });
  if (!marks.length) return html;
  const m = marks
    .map((f) => `<i class="mark jarmark${f >= 1 ? " over" : ""}" style="left:${pct(f)}"></i>`)
    .join("");
  return html.replace(
    `<div class="strip${big ? " big" : ""}">`,
    `<div class="strip${big ? " big" : ""}${fits ? " fits" : ""}">${m}`,
  );
}

function offerHtml(s, o) {
  return `<button class="ticket offer k-bulk" data-act="order" data-order="${o.id}">
    <div class="who"><span class="face">${faceSvg(o.look, "wait")}</span><span class="name">${o.name}</span></div>
    <div class="what">${whatLine(o)}</div>
    <div class="due"><span>${o.due - s.clock.day === 1 ? "For tomorrow" : `For day ${o.due}`}</span><span class="stamp">new order</span></div>
    ${strip({ win: o })}</button>`;
}

function askedHtml(a) {
  const r = RECIPES[a.recipe];
  return `<button class="ticket hint" data-act="board-hint" data-recipe="${a.recipe}">
    <div class="who"><span class="face">${faceSvg(a.look ?? 0, "wait")}</span><span class="name">${a.name ?? "A new face"}</span></div>
    <div class="what">“Any ${r.name.toLowerCase()}?”</div>
    <div class="due"><span>Not on the menu yet</span></div>
    <div class="try">🧪 Work it out at the bench</div></button>`;
}

/** The ticket row. `el` is the #board element from the shop skeleton. */
export function renderBoard(el, ui) {
  const s = ui.s;
  el.dataset.scrollX = "";
  const evening = s.clock.phase === "evening";
  const offers = evening ? [] : (s.orders.offers ?? []);
  const html =
    offers.map((o) => offerHtml(s, o)).join("") +
    s.orders.list
      .slice()
      .sort((a, b) => a.due - b.due || a.arriveAt - b.arriveAt)
      .map((o) => ticketHtml(s, o))
      .join("") +
    askedOf(s)
      .map((a) => askedHtml(a))
      .join("");
  patch(el, html);
  renderPlan(ui);
}

// ---------- the planner ----------

let planEl = /** @type {HTMLElement | null} */ (null);

function planSheet() {
  if (!planEl) {
    planEl = document.createElement("div");
    planEl.className = "sheet plan";
    planEl.hidden = true;
    planEl.dataset.act = "board-close";
    (document.querySelector(".app") ?? document.body).appendChild(planEl);
  }
  return planEl;
}

const firstEmpty = (s) => s.shelf.slots.findIndex((j) => !j);

/** Open the planner for an order, on the first empty shelf spot. */
export function openPlan(ui, orderId) {
  ui.plan = { orderId, slot: firstEmpty(ui.s), adds: [] };
}

/** Timing add-ins the pantry has that keep the jar the order's recipe. */
function timingAdds(s, o) {
  return INGREDIENT_IDS.filter((id) => INGREDIENTS[id].speed !== 1).map((id) => {
    const p = planFor(s, o, [id]);
    return { id, ok: !!p && p.right, stock: s.pantry.stock[id] ?? 0 };
  });
}

/** Day timeline: now → a little past pickup, with the jar's best stretch and the pickup pin. */
function timelineHtml(s, o, plan) {
  const now = s.clock.day * 24 + s.clock.hour;
  const pick = o.due * 24 + o.arriveAt;
  const lands = plan.lands.day * 24 + plan.lands.hour;
  const leaves = plan.leaves.day * 24 + plan.leaves.hour;
  const end = Math.max(pick + 10, Math.min(leaves + 6, pick + 30), now + 24);
  const x = (t) => pct((t - now) / (end - now));
  let days = "";
  for (let d = s.clock.day; d * 24 <= end; d++) {
    const open0 = Math.max(now, d * 24);
    const open1 = Math.min(end, d * 24 + OPEN_HOURS);
    if (open1 > open0)
      days += `<i class="open" style="left:${x(open0)};width:calc(${x(open1)} - ${x(open0)})"></i>`;
    if (d * 24 > now) days += `<i class="midnight" style="left:${x(d * 24 - OPEN_AT)}"></i>`;
    const label = d === s.clock.day ? "Today" : d === s.clock.day + 1 ? "Tomorrow" : `Day ${d}`;
    if (open1 > open0 + 2) days += `<span class="dlabel" style="left:${x(open0)}">${label}</span>`;
  }
  const best = `<i class="best${plan.fits ? " fits" : ""}" style="left:${x(lands)};width:calc(${x(Math.min(leaves, end))} - ${x(lands)})"></i>`;
  const pin = `<i class="pin" style="left:${x(pick)}"><span class="face">${faceSvg(o.look, plan.fits ? "delight" : "wait")}</span></i>`;
  return `<div class="timeline">${days}${best}${pin}<i class="now" style="left:0"></i></div>`;
}

/** What the planner says about the jar at pickup, in the shop's voice. */
function verdict(s, o, plan) {
  if (!plan.right)
    return `<b class="bad">That mix turns into ${RECIPES[plan.recipe].name.toLowerCase()}.</b>`;
  if (plan.fits) return `<b class="good">Just right when ${o.name} comes in.</b>`;
  const now =
    plan.f >= 1
      ? "By then its lid will have popped."
      : plan.f < o.lo
        ? `Still too ${bandWord(plan.f)} when ${o.name} comes in.`
        : `Gone ${bandWord(plan.f)} by the time ${o.name} comes in.`;
  const t = bestStart(s, o, plan);
  let tip;
  if (t) {
    const day =
      t.day === s.clock.day ? "today" : t.day === s.clock.day + 1 ? "tomorrow" : `on day ${t.day}`;
    tip =
      t.hour < 0.5
        ? `Start it ${day === "today" ? "now" : `${day} morning`} instead.`
        : `Start it ${day} around ${clockAt(t.hour)} instead.`;
    if (t.day === s.clock.day && Math.abs(t.hour - s.clock.hour) < 0.5) tip = "";
  } else if (plan.f < o.lo) tip = "A little chili would hurry it along.";
  else tip = "A pinch of salt would hold it back.";
  return `<b class="bad">${now}</b> <span class="tip">${tip}</span>`;
}

/**
 * When a jar like `plan` could be started (shop hours only, from now on) to sit
 * in the middle of the order's window at pickup, as close as possible.
 * Null when no start time while the shop is open lands it in the window.
 * @returns {{ day: number, hour: number } | null}
 */
export function bestStart(s, o, plan) {
  const pick = o.due * 24 + o.arriveAt;
  const from = pick - ageAt(plan.recipe, plan.adds, o.hi);
  const to = pick - ageAt(plan.recipe, plan.adds, o.lo);
  const aim = (from + to) / 2;
  let best = null;
  for (let d = s.clock.day; d * 24 <= to; d++) {
    const lo = Math.max(from, d * 24 + (d === s.clock.day ? s.clock.hour : 0));
    const hi = Math.min(to, d * 24 + OPEN_HOURS);
    if (lo > hi) continue;
    const t = Math.min(hi, Math.max(lo, aim));
    if (!best || Math.abs(t - aim) < Math.abs(best - aim)) best = t;
  }
  if (best === null) return null;
  const day = Math.floor(best / 24);
  return { day, hour: best - day * 24 };
}

const bandWord = (f) => word(f).replace(/<[^>]+>/g, "");

function renderPlan(ui) {
  const el = planSheet();
  const p = ui.plan;
  const s = ui.s;
  const taken = p && s.orders.list.find((x) => x.id === p.orderId);
  const offer =
    p && !taken && s.clock.phase !== "evening"
      ? (s.orders.offers ?? []).find((x) => x.id === p.orderId)
      : null;
  const o = taken ?? offer;
  if (!o) {
    ui.plan = null;
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (p.slot >= 0 && s.shelf.slots[p.slot]) p.slot = firstEmpty(s);
  const plan = planFor(s, o, p.adds);
  if (!plan) {
    p.adds = [];
    return;
  }
  const r = RECIPES[o.recipe];
  const evening = s.clock.phase === "evening";
  const jars = jarsFor(s, o);
  const need = (o.qty ?? 1) - (o.got ?? 0);
  const ghosts = s.shelf.slots
    .filter((j) => j && j.recipe === o.recipe && !(o.jars ?? []).includes(j.id))
    .map((j) =>
      Math.min(
        1,
        forecast(j.recipe, j.age + Math.max(0, hoursUntil(s, o.due, o.arriveAt)), j.adds ?? []),
      ),
    )
    .filter((f) => f < 1);
  const missing = plan.adds.filter((a) => (s.pantry.stock[a] ?? 0) < 1);
  const adds = timingAdds(s, o)
    .map(
      (a) =>
        `<button class="add${p.adds.includes(a.id) ? " on" : ""}" data-act="board-add" data-ingredient="${a.id}" ${!a.ok || (a.stock < 1 && !p.adds.includes(a.id)) ? "disabled" : ""}>${INGREDIENTS[a.id].icon} ${INGREDIENTS[a.id].name}<small>${INGREDIENTS[a.id].tag} · ${a.stock} left</small></button>`,
    )
    .join("");
  const spots = s.shelf.slots
    .map((j, i) =>
      j
        ? `<span class="spot full">${jarSvg(j, "mini")}</span>`
        : `<button class="spot${i === p.slot ? " sel" : ""}" data-act="board-slot" data-slot="${i}">${emptyJarSvg}</button>`,
    )
    .join("");
  const noRoom = firstEmpty(s) < 0;
  let go;
  if (offer)
    go = `<button class="main" data-act="board-take" data-order="${o.id}">Take it</button>`;
  else if (evening) go = `<button class="main" disabled>Start it in the morning</button>`;
  else if (noRoom) go = `<button class="main" disabled>No room on the shelf</button>`;
  else if (missing.length)
    go = `<button class="main" disabled>Needs ${missing.map((a) => INGREDIENTS[a].icon + " " + INGREDIENTS[a].name.toLowerCase()).join(", ")}</button>`;
  else
    go = `<button class="main" data-act="board-start" ${s.shop.coins < r.cost ? "disabled" : ""}>Start a jar<small>🪙 ${r.cost}</small></button>`;
  const html = `<div class="panel" data-act="board-keep">
    <div class="phead"><span class="face">${faceSvg(o.look, "wait")}</span>
      <div><h2>${o.name}</h2><p>${whatLine(o)} · ${o.due <= s.clock.day ? `today at ${clockAt(o.arriveAt)}` : o.due === s.clock.day + 1 ? `tomorrow at ${clockAt(o.arriveAt)}` : `day ${o.due} at ${clockAt(o.arriveAt)}`}</p></div></div>
    ${jars.length ? `<div class="have">${jars.map((x) => `<span>${jarSvg(x.jar, "mini")}</span>`).join("")}<small>${jars.length} of ${need} started</small></div>` : ""}
    <div class="pickup">${stripPlan(o, plan, ghosts)}${stripLabels}</div>
    ${timelineHtml(s, o, plan)}
    <div class="verdict">${verdict(s, o, plan)}</div>
    ${offer ? "" : `${adds ? `<div class="adds">${adds}</div>` : ""}<div class="spots">${spots}</div>`}
    <div class="btns">${offer ? `<button data-act="board-pass" data-order="${o.id}">Pass</button>` : `<button data-act="board-close">Not now</button>`}${go}</div></div>`;
  patch(el, html);
}

/** The big strip in the planner: window, other jars of that recipe, and the new jar at pickup. */
function stripPlan(o, plan, ghosts) {
  return strip({ win: o, ghosts, f: Math.min(1, plan.f), big: true }).replace(
    '<div class="strip big">',
    `<div class="strip big${plan.fits ? " fits" : ""}">`,
  );
}

// ---------- input ----------

/** Handle a board tap. Returns true when the act was the board's. */
export function boardAct(act, t, ui, dispatch, toast) {
  const s = ui.s;
  const id = Number(t.dataset.order);
  if (act === "order") {
    openPlan(ui, id);
    return true;
  }
  if (!act.startsWith("board-")) return false;
  if (act === "board-take") {
    const events = dispatch({ type: "acceptOrder", orderId: id });
    if (events.some((e) => e.type === "accepted")) toast("It's on the board!");
  } else if (act === "board-pass") {
    dispatch({ type: "declineOrder", orderId: id });
    ui.plan = null;
  } else if (act === "board-hint") {
    const r = RECIPES[t.dataset.recipe];
    openBench(ui, s.clock.phase === "evening" ? null : firstEmpty(s) < 0 ? null : firstEmpty(s));
    ui.bench.recipe = r.base ?? t.dataset.recipe;
  } else if (act === "board-close") {
    ui.plan = null;
  } else if (act === "board-keep") {
    // a tap on the panel itself
  } else if (ui.plan) {
    const p = ui.plan;
    if (act === "board-slot") {
      p.slot = Number(t.dataset.slot);
    } else if (act === "board-add") {
      const ing = t.dataset.ingredient;
      if (p.adds.includes(ing)) p.adds = p.adds.filter((a) => a !== ing);
      else if (p.adds.length < MAX_ADDS) p.adds = [...p.adds, ing];
    } else if (act === "board-start") {
      const events = dispatch({
        type: "startForOrder",
        orderId: p.orderId,
        slot: p.slot,
        adds: p.adds,
      });
      if (events.some((e) => e.type === "startedForOrder")) {
        const o = ui.s.orders.list.find((x) => x.id === p.orderId);
        const left = o ? (o.qty ?? 1) - (o.got ?? 0) - (o.jars?.length ?? 0) : 0;
        if (left > 0 && firstEmpty(ui.s) >= 0) {
          p.slot = firstEmpty(ui.s);
          toast(`Started! ${left} more to go.`);
        } else {
          ui.plan = null;
          toast("Started! It's on the shelf.");
        }
      }
    }
  }
  return true;
}

/** Toasts for what lands on the board while you play. */
export function boardReact(e, toast) {
  if (e.type === "offered") toast(`${e.order.name} has an order for you`);
  else if (e.type === "hinted") toast(`${e.customer.name} asked for something new`);
  else if (e.type === "delivered" && !e.done)
    toast(`${e.customer.got} of ${e.customer.qty} jars handed over`);
}
