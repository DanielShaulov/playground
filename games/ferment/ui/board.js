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
 * Tapping an order ticket opens the planner: which jar will serve it. Each
 * shelf jar of that recipe with a portion free is an option, shown where it
 * will sit at pickup, beside "a new jar, started now" (core planFor()). The
 * chosen one drives the big strip, a day timeline and the verdict. A shelf
 * jar is kept with a "hold" action; a new jar takes timing add-ins and an
 * empty spot and starts with "startForOrder". The planner offers only what
 * the order still needs, and jars already kept for it can be let go.
 *
 * Screen-only state: ui.plan = { orderId, slot, adds, src } (null when closed),
 * src being the shelf slot of the chosen jar or "new".
 * Buttons carry data-act="board-…" (and "order"); main.js hands them to boardAct().
 */

import { RECIPES } from "../content/recipes.js";
import { INGREDIENTS, INGREDIENT_IDS, MAX_ADDS } from "../content/ingredients.js";
import { OPEN_AT, OPEN_HOURS } from "../content/tuning.js";
import { REGULARS } from "../content/regulars.js";
import { planFor, forecast, isOver, ageAt, holdsOn, freePortions } from "../core/index.js";
import { faceSvg } from "./art/customer.js";
import { jarSvg, emptyJarSvg } from "./art/jar.js";
import { ingredientSvg } from "./art/ingredients.js";
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
      at: isOver(jar)
        ? 1
        : Math.min(1, forecast(jar.recipe, jar.age + dt, jar.adds ?? [], jar.pace ?? 1)),
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
      pips += `<i class="${i < got ? "got" : i < got + jars.length + (o.morning?.length ?? 0) ? "brewing" : ""}"></i>`;
    pips = `<span class="pips">${pips}</span>`;
  }
  const marks = [
    ...jars.map((x) => x.at),
    ...(o.morning ?? []).map((m) => planFor(fromStart(s), o, m.adds, m.slot)?.f ?? 0),
  ];
  const fits = marks.some((f) => f >= o.lo && f <= o.hi && f < 1);
  return `<button class="${cls.join(" ")}" data-act="order" data-order="${o.id}">
    <div class="who"><span class="face">${faceSvg(o.look, "wait")}</span><span class="name">${o.name}</span></div>
    <div class="what">${whatLine(o)} ${pips}</div>
    <div class="due"><span>${o.arrived ? "Here now" : dueText(s, o)}</span>${reg ? `<span class="stamp">regular</span>` : ""}</div>
    ${stripMarks(o, marks, fits)}</button>`;
}

/** A strip with the order's window and the started jars' marks at pickup. */
export function stripMarks(win, marks, fits, big = false) {
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

const firstEmpty = (s) => s.shelf.slots.findIndex((j, i) => !j && !bookedFor(s, i));

/** The order a shelf spot is booked for, to start next morning (after closing). */
const bookedFor = (s, i) => s.orders.list.find((o) => o.morning?.some((m) => m.slot === i));

/** Open the planner for an order: on the best shelf jar for it if one suits, else a new jar. */
export function openPlan(ui, orderId) {
  ui.plan = { orderId, slot: firstEmpty(ui.s), adds: [], src: "new" };
  const o = ui.s.orders.list.find((x) => x.id === orderId);
  if (o) ui.plan.src = pickSrc(ui.s, o);
}

/** Absolute hours → { day, hour }. */
const dayHour = (t) => {
  const day = Math.floor(t / 24);
  return { day, hour: t - day * 24 };
};

/** A jar already on the shelf, previewed like planFor previews a new one. */
function shelfPlan(s, o, j) {
  const now = s.clock.day * 24 + s.clock.hour;
  const adds = j.adds ?? [];
  const dt = Math.max(0, hoursUntil(s, o.due, o.arriveAt));
  const pace = j.pace ?? 1;
  const f = isOver(j) ? 1 : Math.min(1, forecast(j.recipe, j.age + dt, adds, pace));
  const from = (x) => dayHour(now + Math.max(0, ageAt(j.recipe, adds, x, pace) - j.age));
  return {
    recipe: j.recipe,
    adds,
    pace,
    right: true,
    f,
    fits: f < 1 && f >= o.lo && f <= o.hi,
    lands: from(o.lo),
    leaves: from(o.hi),
    shelf: true,
  };
}

/** Jars on the shelf that could still be kept for an order, with how each will be at pickup. */
function candidates(s, o) {
  return s.shelf.slots
    .map((j, i) => ({ i, j }))
    .filter(
      ({ j }) =>
        j &&
        j.recipe === o.recipe &&
        !(o.jars ?? []).includes(j.id) &&
        !isOver(j) &&
        freeFor(s, j, o),
    )
    .map((c) => ({ ...c, plan: shelfPlan(s, o, c.j) }))
    .filter((c) => c.plan.f < 1);
}

/** The shelf jar that suits an order best (nearest the middle of its window), else "new". */
function pickSrc(s, o) {
  const mid = (o.lo + o.hi) / 2;
  const fits = candidates(s, o)
    .filter((c) => c.plan.fits)
    .sort((a, b) => Math.abs(a.plan.f - mid) - Math.abs(b.plan.f - mid));
  return fits.length ? fits[0].i : "new";
}

/** How many more jars (or portions) an order still needs kept or started. */
const stillNeeds = (s, o) =>
  (o.qty ?? 1) - (o.got ?? 0) - jarsFor(s, o).length - (o.morning?.length ?? 0);

/**
 * Where an order stands, for the evening's order list:
 *   set    every jar it needs is kept, and each will suit at pickup
 *   swap   covered, but a kept jar won't suit by then
 *   need   still needs a jar kept or started (`left` of them)
 *   bench  needs a jar of a recipe not worked out at the bench yet
 * `jars` are the kept jars with where each will be at pickup.
 * @returns {{ kind: "set" | "swap" | "need" | "bench", left: number, jars: { jar: any, at: number }[], shelf: boolean }}
 */
export function orderStatus(s, o) {
  const jars = jarsFor(s, o);
  const left = stillNeeds(s, o);
  const r = RECIPES[o.recipe];
  const shelf = left > 0 && candidates(s, o).some((c) => c.plan.fits);
  if (left > 0) {
    const unknown = !!r.base && !s.bench.known.includes(o.recipe);
    return { kind: unknown && !shelf ? "bench" : "need", left, jars, shelf };
  }
  const suits = jars.every(({ at }) => at < 1 && at >= o.lo && at <= o.hi);
  return { kind: suits ? "set" : "swap", left: 0, jars, shelf: false };
}

/** The shop as it will be when a new jar can go on: now, or tomorrow morning after closing. */
const fromStart = (s) =>
  s.clock.phase === "evening" ? { ...s, clock: { ...s.clock, day: s.clock.day + 1, hour: 0 } } : s;

/** Timing add-ins the pantry has that keep the jar the order's recipe. */
function timingAdds(s, o) {
  const needs = RECIPES[o.recipe].needs ?? [];
  return INGREDIENT_IDS.filter((id) => INGREDIENTS[id].speed !== 1 && !needs.includes(id)).map(
    (id) => {
      const p = planFor(fromStart(s), o, [id]);
      return { id, ok: !!p && p.right, makes: p?.recipe, stock: s.pantry.stock[id] ?? 0 };
    },
  );
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
        ? `Not ready yet when ${o.name} comes in.`
        : `Gone ${bandWord(plan.f)} by the time ${o.name} comes in.`;
  if (plan.shelf) {
    const fresh = planFor(fromStart(s), o, [], firstEmpty(s));
    const better = fresh && (fresh.fits || bestStart(s, o, fresh));
    return `<b class="bad">${now}</b>${better ? ` <span class="tip">A fresh jar would suit ${o.name} better.</span>` : ""}`;
  }
  const t = bestStart(s, o, plan);
  let tip;
  if (t) {
    const day =
      t.day === s.clock.day ? "today" : t.day === s.clock.day + 1 ? "tomorrow" : `on day ${t.day}`;
    tip =
      t.hour < 0.5
        ? `Start it ${day === "today" ? "now" : `${day} morning`} instead.`
        : `Start it ${day} around ${clockAt(t.hour)} instead.`;
    const st = fromStart(s).clock;
    if (t.day === st.day && Math.abs(t.hour - st.hour) < 0.5) tip = "";
  } else {
    // Only suggest an add-in the pantry has that keeps it the same recipe.
    const fast = plan.f < o.lo;
    const a = timingAdds(s, o).find(
      (a) =>
        a.ok && a.stock > 0 && !plan.adds.includes(a.id) && INGREDIENTS[a.id].speed > 1 === fast,
    );
    const n = a && INGREDIENTS[a.id].name.toLowerCase();
    tip = !a
      ? ""
      : fast
        ? `A little ${n} would hurry it along.`
        : `A pinch of ${n} would hold it back.`;
  }
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
  const from = pick - ageAt(plan.recipe, plan.adds, o.hi, plan.pace);
  const to = pick - ageAt(plan.recipe, plan.adds, o.lo, plan.pace);
  const aim = (from + to) / 2;
  // After closing (even early) the first chance is the next morning.
  const start = fromStart(s).clock;
  let best = null;
  for (let d = start.day; d * 24 <= to; d++) {
    const lo = Math.max(from, d * 24 + (d === start.day ? start.hour : 0));
    const hi = Math.min(to, d * 24 + OPEN_HOURS - 0.5); // before closing
    if (lo > hi) continue;
    const t = Math.min(hi, Math.max(lo, aim));
    if (!best || Math.abs(t - aim) < Math.abs(best - aim)) best = t;
  }
  if (best === null) return null;
  const day = Math.floor(best / 24);
  return { day, hour: best - day * 24 };
}

const bandWord = (f) => word(f).replace(/<[^>]+>/g, "");

/** How a jar will be at pickup, in a word or two. */
function fitWord(o, f) {
  if (f >= 1) return `<small class="fit bad">Lid popped</small>`;
  if (f < o.lo) return `<small class="fit bad">Not ready</small>`;
  if (f > o.hi) return `<small class="fit bad">Gone ${bandWord(f)}</small>`;
  return `<small class="fit good">Just right</small>`;
}

/** Hours a jar has been brewing, as the shop says it. */
const ageText = (h) =>
  h < 24 ? `${Math.max(1, Math.round(h))}h in` : `${Math.round(h / 24)} day${h < 36 ? "" : "s"} in`;

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
  if (p.slot >= 0 && (s.shelf.slots[p.slot] || bookedFor(s, p.slot))) p.slot = firstEmpty(s);
  const fresh = planFor(fromStart(s), o, p.adds, p.slot);
  if (!fresh) {
    p.adds = [];
    return;
  }
  const r = RECIPES[o.recipe];
  const evening = s.clock.phase === "evening";
  // A recipe not worked out at the bench yet can be ordered, but not started.
  const unknown = !!r.base && !s.bench.known.includes(o.recipe);
  const jars = jarsFor(s, o);
  const need = (o.qty ?? 1) - (o.got ?? 0);
  const left = offer ? need : stillNeeds(s, o);
  const options = offer || left <= 0 ? [] : candidates(s, o);
  if (p.src !== "new" && !options.some((c) => c.i === p.src)) p.src = offer ? "new" : pickSrc(s, o);
  const chosen = options.find((c) => c.i === p.src);
  // What the strip, timeline and verdict show: the chosen shelf jar, a new jar,
  // or once the order is covered, a kept jar that won't suit (to swap it) or else one that will.
  const keptPlans = jars
    .map((x) => ({ slot: s.shelf.slots.indexOf(x.jar), plan: shelfPlan(s, o, x.jar) }))
    .sort((a, b) => Number(a.plan.fits) - Number(b.plan.fits));
  const swap = left <= 0 && keptPlans[0] && !keptPlans[0].plan.fits ? keptPlans[0] : null;
  // A jar booked for the morning shows as planned, with its own add-ins.
  const bookedPlan = o.morning?.length
    ? planFor(fromStart(s), o, o.morning[0].adds, o.morning[0].slot)
    : null;
  const plan =
    left <= 0 && keptPlans.length
      ? keptPlans[0].plan
      : left <= 0 && bookedPlan
        ? bookedPlan
        : (chosen?.plan ?? fresh);
  const portion = o.kind === "bulk" ? "it" : "a portion";

  const booked = o.morning ?? [];
  const kept =
    jars.length || booked.length
      ? `<div class="have">${jars
          .map(
            (x) =>
              `<button class="kept" data-act="board-unhold" data-slot="${s.shelf.slots.indexOf(x.jar)}">${jarSvg(x.jar, "mini")}<small>Let go</small></button>`,
          )
          .join("")}${booked
          .map(
            () =>
              `<button class="kept" data-act="board-unmorning">${emptyJarSvg}<small>Let go</small></button>`,
          )
          .join("")}<small>${
          booked.length && !jars.length
            ? `Starts in the morning for ${o.name}`
            : `${jars.length + booked.length} of ${need} kept for ${o.name}${booked.length ? ` (${booked.length} in the morning)` : ""}`
        }</small></div>`
      : "";
  const optHtml = options.length
    ? `<div class="opts">${options
        .map(
          (c) =>
            `<button class="opt${p.src === c.i ? " sel" : ""}" data-act="board-src" data-src="${c.i}"><span class="ojar">${jarSvg(c.j, "mini")}</span><span class="otext">On the shelf, ${ageText(c.j.age)}${stripMarks(o, [c.plan.f], c.plan.fits)}</span>${fitWord(o, c.plan.f)}</button>`,
        )
        .join(
          "",
        )}<button class="opt${p.src === "new" ? " sel" : ""}" data-act="board-src" data-src="new"><span class="ojar">${emptyJarSvg}</span><span class="otext">A new jar, started ${evening ? "in the morning" : "now"}${stripMarks(o, [fresh.f], fresh.fits)}</span>${fresh.right ? fitWord(o, fresh.f) : ""}</button></div>`
    : "";

  const adds = timingAdds(s, o)
    .map(
      (a) =>
        `<button class="add${p.adds.includes(a.id) ? " on" : ""}" data-act="board-add" data-ingredient="${a.id}" ${!a.ok || (a.stock < 1 && !p.adds.includes(a.id)) ? "disabled" : ""}>${ingredientSvg(a.id)} ${INGREDIENTS[a.id].name}<small>${a.ok || !a.makes ? `${INGREDIENTS[a.id].tag} · ${a.stock} left` : s.bench.known.includes(a.makes) ? `makes ${RECIPES[a.makes].name.toLowerCase()}` : "makes something new"}</small></button>`,
    )
    .join("");
  const spots = s.shelf.slots
    .map((j, i) =>
      j
        ? `<span class="spot full">${portionsHtml(s, j)}${jarSvg(j, "mini")}</span>`
        : bookedFor(s, i)
          ? `<span class="spot full"><span class="portions"><i class="held" title="For ${bookedFor(s, i).name} in the morning">${faceSvg(bookedFor(s, i).look, "wait")}</i></span>${emptyJarSvg}</span>`
          : `<button class="spot${i === p.slot ? " sel" : ""}" data-act="board-slot" data-slot="${i}">${emptyJarSvg}</button>`,
    )
    .join("");
  const newJar = !offer && !unknown && left > 0 && p.src === "new";

  const missing = fresh.adds.filter((a) => (s.pantry.stock[a] ?? 0) < 1);
  let go;
  if (offer)
    go = `<button class="main" data-act="board-take" data-order="${o.id}">Take it</button>`;
  else if (swap)
    go = `<button class="main" data-act="board-unhold" data-slot="${swap.slot}">Pick another jar</button>`;
  else if (left <= 0) go = `<button class="main" data-act="board-close">All set</button>`;
  else if (chosen)
    go = `<button class="main" data-act="board-hold" data-slot="${chosen.i}">Keep ${portion} for ${o.name}</button>`;
  else if (unknown)
    go = `<button class="main" data-act="board-hint" data-recipe="${o.recipe}">🧪 To the bench</button>`;
  else if (firstEmpty(s) < 0) go = `<button class="main" disabled>No room on the shelf</button>`;
  else if (missing.length)
    go = `<button class="main" disabled>Needs ${missing.map((a) => ingredientSvg(a) + " " + INGREDIENTS[a].name.toLowerCase()).join(", ")}</button>`;
  else if (evening)
    go = `<button class="main" data-act="board-morning" ${s.shop.coins < r.cost ? "disabled" : ""}>Start it in the morning<small>🪙 ${r.cost}</small></button>`;
  else
    go = `<button class="main" data-act="board-start" ${s.shop.coins < r.cost ? "disabled" : ""}>Start a jar<small>🪙 ${r.cost}</small></button>`;

  const html = `<div class="panel" data-act="board-keep">
    <div class="phead"><span class="face">${faceSvg(o.look, "wait")}</span>
      <div><h2>${o.name}</h2><p>${whatLine(o)} · ${o.due <= s.clock.day ? `today at ${clockAt(o.arriveAt)}` : o.due === s.clock.day + 1 ? `tomorrow at ${clockAt(o.arriveAt)}` : `day ${o.due} at ${clockAt(o.arriveAt)}`}</p></div></div>
    ${regularHtml(s, o)}
    ${kept}
    ${optHtml}
    <div class="pickup">${stripPlan(
      o,
      plan,
      left <= 0 ? [] : jars.map((x) => x.at),
    )}${stripLabels}</div>
    ${timelineHtml(s, o, plan)}
    <div class="verdict">${
      unknown && !chosen && left > 0
        ? `<b class="bad">We don't know how to make ${r.name.toLowerCase()} yet.</b> <span class="tip">Work it out at the bench, then start ${o.name}'s jar here.</span>`
        : verdict(s, o, plan)
    }</div>
    ${newJar ? `${adds ? `<div class="adds">${adds}</div>` : ""}<div class="spots">${spots}</div>` : ""}
    <div class="btns">${offer ? `<button data-act="board-pass" data-order="${o.id}">Pass</button>` : `<button data-act="board-close">Not now</button>`}${go}</div></div>`;
  patch(el, html);
}

/** The big strip in the planner: the order's window, jars already kept for it, and the jar being planned at pickup. */
function stripPlan(o, plan, kept) {
  const m = kept
    .map((f) => `<i class="mark jarmark${f >= 1 ? " over" : ""}" style="left:${pct(f)}"></i>`)
    .join("");
  return strip({ win: o, f: Math.min(1, plan.f), big: true }).replace(
    '<div class="strip big">',
    `<div class="strip big${plan.fits ? " fits" : ""}">${m}`,
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
    ui.plan = null;
    openBench(ui, s.clock.phase === "evening" ? null : firstEmpty(s) < 0 ? null : firstEmpty(s));
    ui.bench.recipe = r.base ?? t.dataset.recipe;
  } else if (act === "board-release") {
    // At the counter: sell a jar that was kept for someone else after all.
    const slot = ui.selected;
    const freed = dispatch({ type: "release", slot });
    if (freed.some((e) => e.type === "released")) dispatch({ type: "serve", slot });
  } else if (act === "board-close") {
    ui.plan = null;
  } else if (act === "board-keep") {
    // a tap on the panel itself
  } else if (ui.plan) {
    const p = ui.plan;
    // Once an order is covered the planner closes; otherwise it moves on to the next jar.
    const next = (said) => {
      const o = ui.s.orders.list.find((x) => x.id === p.orderId);
      const left = o ? stillNeeds(ui.s, o) : 0;
      if (left > 0) {
        p.src = pickSrc(ui.s, o);
        p.slot = firstEmpty(ui.s);
        toast(`${said} ${left} more to go.`);
      } else {
        ui.plan = null;
        toast(`${said} That's ${o?.name ?? "them"} sorted.`);
      }
    };
    if (act === "board-slot") {
      p.slot = Number(t.dataset.slot);
    } else if (act === "board-src") {
      p.src = t.dataset.src === "new" ? "new" : Number(t.dataset.src);
    } else if (act === "board-hold") {
      const events = dispatch({ type: "hold", orderId: p.orderId, slot: Number(t.dataset.slot) });
      if (events.some((e) => e.type === "held")) next("Kept back!");
    } else if (act === "board-unhold") {
      dispatch({ type: "release", slot: Number(t.dataset.slot), orderId: p.orderId });
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
      if (events.some((e) => e.type === "startedForOrder")) next("Started!");
    } else if (act === "board-morning") {
      const events = dispatch({
        type: "planMorning",
        orderId: p.orderId,
        slot: p.slot,
        adds: p.adds,
      });
      if (events.some((e) => e.type === "plannedMorning")) next("It goes on first thing!");
    } else if (act === "board-unmorning") {
      dispatch({ type: "planMorning", orderId: p.orderId, slot: null });
    }
  }
  return true;
}

/** Toasts for what lands on the board while you play. */
export function boardReact(e, toast) {
  if (e.type === "offered") toast(`${e.order.name} has an order for you`);
  else if (e.type === "hinted") toast(`${e.customer.name} asked for something new`);
  else if (e.type === "regularJoined" && REGULARS[e.regular].kind === "standing")
    toast(`${REGULARS[e.regular].name} will keep coming back. Look for the ticket on the board.`);
  else if (e.type === "morningFailed")
    toast(`Couldn't start ${e.order.name}'s jar this morning: ${e.why}`);
  else if (e.type === "delivered" && !e.done)
    toast(`${e.customer.got} of ${e.customer.qty} jars handed over`);
}

/** Can `cust` be served from `jar`? Not from portions kept back for other orders. */
export function freeFor(s, jar, cust) {
  return freePortions(s, jar, cust?.orderId) >= (cust?.kind === "bulk" ? jar.servings : 1);
}

/**
 * The portions left in a jar, one chip each, hung on the jar: a kept-back
 * portion shows the face of who it's for, a free one is a plain chip.
 */
export function portionsHtml(s, jar) {
  let chips = "";
  let held = 0;
  for (const h of holdsOn(s, jar))
    for (let k = 0; k < h.n && held < jar.servings; k++, held++)
      chips += `<i class="held" title="For ${h.order.name}">${faceSvg(h.order.look, "wait")}</i>`;
  chips += "<i></i>".repeat(Math.max(0, jar.servings - held));
  return `<span class="portions">${chips}</span>`;
}

/** Names of who has portions kept back in a jar, as the shop would say them. */
export const keptFor = (s, jar) => {
  const names = holdsOn(s, jar).map((h) => h.order.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : (names[0] ?? "");
};

/** What the counter adds after a collecting customer's name. */
export function whoNote(c) {
  if (!c.orderId) return "";
  if (c.kind === "bulk") return ` · ${c.got ?? 0} of ${c.qty} jars`;
  if (c.kind === "standing") return " · regular";
  return " · pre-order";
}

const EVERY = ["every day", "every other day"];

/** A regular's line in the planner: how often they come, and how their visits went. */
function regularHtml(s, o) {
  const r = o.regular && REGULARS[o.regular];
  if (!r) return "";
  const met = s.regulars.met?.[o.regular] ?? { visits: 0, happy: 0, missed: 0 };
  const often = EVERY[r.every - 1] ?? `every ${r.every} days`;
  const line =
    r.kind === "bulk"
      ? `${r.name.split(" from ")[1] ?? r.name} orders ${often}.`
      : `${r.name} comes in ${often} for ${bandWord(r.spot)} ${RECIPES[r.recipe].name.toLowerCase()}.`;
  const dots =
    '<i class="v-happy"></i>'.repeat(met.happy) +
    '<i class="v-ok"></i>'.repeat(Math.max(0, met.visits - met.happy)) +
    '<i class="v-missed"></i>'.repeat(met.missed);
  return `<div class="regular"><span>${line}</span>${
    dots
      ? `<span class="visits" title="Past visits">${dots}</span>`
      : `<span class="visits new">first visit</span>`
  }</div>`;
}
