// @ts-check
/**
 * The evening: a full-screen place over the shop once it closes, with four
 * corners picked from tabs along the top:
 *
 *   till       today's takings on a receipt, and what tonight holds
 *   market     the market stall (ui/market.js)
 *   workshop   upgrades, each drawn on the thing it changes (ui/upgrades.js)
 *   goals      the reputation track with its tiers, and the goals ladder
 *
 * The evening only plans: buying, building, claiming. Jars are started in
 * the morning. The ‹ back (or Orders) shows the shop and its order board;
 * the shop's own button comes back here.
 *
 * Screen-only state: ui.evening = { tab, spot } (null while the shop shows).
 * Buttons carry data-act="eve-…", "mk-…", "up-…" or "sleep"; main.js hands
 * them to eveningAct().
 */

import { RECIPES } from "../content/recipes.js";
import { UPGRADES } from "../content/upgrades.js";
import { INGREDIENTS } from "../content/ingredients.js";
import { TIERS } from "../content/goals.js";
import { goalNow, goalAt, goalText, tierOf, upgradeOffers } from "../core/index.js";
import { marketHtml, marketAct, rareToday } from "./market.js";
import { upgradesHtml, upgradesAct } from "./upgrades.js";
import { patch } from "./dom.js";

const TABS = [
  ["till", "🧾", "Takings"],
  ["market", "🧺", "Market"],
  ["workshop", "🔨", "Workshop"],
  ["goals", "🏆", "Goals"],
];

export function mountEvening(parent) {
  const el = document.createElement("div");
  el.className = "evening";
  el.hidden = true;
  el.innerHTML = `
    <header class="top">
      <button class="back" data-act="eve-close" aria-label="Back to the shop">‹</button>
      <div class="title" data-r="title"></div>
      <div class="pill rep" data-r="rep"></div>
      <div class="pill coins" data-r="coins"></div>
    </header>
    <nav class="tabs" data-r="tabs"></nav>
    <div class="scroll" data-r="body"></div>
    <footer class="actions" data-r="actions"></footer>`;
  parent.appendChild(el);
  /** @type {Record<string, HTMLElement>} */
  const r = {};
  for (const x of el.querySelectorAll("[data-r]"))
    r[/** @type {HTMLElement} */ (x).dataset.r] = /** @type {HTMLElement} */ (x);
  return { el, r };
}

/** Show the evening, on `tab` (the till unless said otherwise). */
export function openEvening(ui, tab = "till") {
  ui.evening = { tab, spot: ui.evening?.spot ?? {} };
  ui.sheet = null;
  ui.departing = null;
}

/**
 * Handle an evening button. Returns false for anything that isn't the evening's.
 * @param {string} act
 * @param {HTMLElement} t
 * @param {any} ui
 * @param {(action: any) => any[]} dispatch
 * @param {(text: string) => void} toast
 */
export function eveningAct(act, t, ui, dispatch, toast) {
  if (act === "evening") {
    openEvening(ui, t.dataset.tab);
    ui.bench = null;
    return true;
  }
  if (act === "sleep") {
    ui.evening = null;
    ui.sheet = null;
    dispatch({ type: "sleep" });
    return true;
  }
  if (!ui.evening) return false;
  if (act === "eve-close") {
    ui.evening = null;
  } else if (act === "eve-tab") {
    ui.evening.tab = t.dataset.tab;
  } else if (act === "eve-claim") {
    const events = dispatch({ type: "claimGoal" });
    const no = events.find((e) => e.type === "rejected");
    if (no) toast(no.why[0].toUpperCase() + no.why.slice(1));
  } else if (!marketAct(act, t, dispatch, toast) && !upgradesAct(act, t, ui, dispatch, toast)) {
    return false;
  }
  return true;
}

/** Toasts for what the evening's systems did, wherever they happened. */
export function eveningReact(e, toast) {
  switch (e.type) {
    case "upgraded": {
      const u = UPGRADES[e.id];
      toast(
        u.kind === "crock"
          ? `${u.name} fitted in spot ${e.slot + 1}`
          : u.kind === "shelf"
            ? `${u.slots ?? 0} new spots on the shelf`
            : `New jars hold one more portion`,
      );
      break;
    }
    case "claimedGoal":
      toast(`Goal claimed: +${e.goal.reward.coins} 🪙`);
      break;
    case "goalReady":
      toast(`🏆 Goal met: ${goalText(e.goal)}`);
      break;
    case "tierUp":
      toast(`🫙 The shop is now ${TIERS[e.tier].name}!`);
      break;
    case "rareAtMarket":
      toast(
        `✨ ${e.ingredients.map((id) => INGREDIENTS[id].name).join(" and ")} at the market tonight`,
      );
      break;
  }
}

// ---------- the till ----------

function tillHtml(s) {
  const t = s.shop.today;
  const dr = s.shop.rep - t.repStart;
  const line = (label, value, cls = "") =>
    `<div class="ln${cls ? " " + cls : ""}"><span>${label}</span><b>${value}</b></div>`;
  const receipt = `<div class="receipt">
      <div class="rhead">The Brine Nook<small>Day ${s.clock.day}</small></div>
      ${line("Portions sold", t.served)}
      ${line("Takings", `🪙 ${t.earned - t.tips}`)}
      ${t.tips ? line("Tips", `🪙 ${t.tips}`) : ""}
      ${line("Total", `🪙 ${t.earned}`, "total")}
      ${line("Reputation", `${dr >= 0 ? "+" : "−"}${Math.abs(dr)} ♥`, dr > 0 ? "up" : dr < 0 ? "down" : "")}
      ${t.preorders ? line("Orders taken", t.preorders) : ""}
      ${t.missed ? line("Orders missed", t.missed, "down") : ""}
      ${t.left ? line("Walked out waiting", t.left, "down") : ""}
      <div class="rfoot">Thank you, come again</div>
    </div>`;

  // Tonight: what is worth a look in the other corners, each a way in.
  const notes = [];
  const rare = rareToday(s);
  if (rare.length)
    notes.push([
      "market",
      `✨ ${rare.map((id) => INGREDIENTS[id].name).join(", ")} at the market tonight`,
    ]);
  const g = goalNow(s);
  if (g.ready) notes.push(["goals", `🏆 Goal met: ${g.text}. Claim 🪙 ${g.goal.reward.coins}`]);
  const can = upgradeOffers(s).filter(
    (o) => o.next && !o.locked && s.shop.coins >= o.next.cost && o.kind !== "crock",
  );
  if (can.length) notes.push(["workshop", `🔨 You can afford ${can[0].name.toLowerCase()}`]);
  const due = s.orders.list.filter((o) => o.due === s.clock.day + 1).length;
  if (due) notes.push(["orders", `📋 ${due} order${due > 1 ? "s" : ""} to collect tomorrow`]);
  const tonight = notes
    .map(([tab, text]) =>
      tab === "orders"
        ? `<button class="go" data-act="eve-close">${text}<span>›</span></button>`
        : `<button class="go" data-act="eve-tab" data-tab="${tab}">${text}<span>›</span></button>`,
    )
    .join("");
  return `${receipt}${tonight ? `<div class="tonight"><h3>Tonight</h3>${tonight}</div>` : ""}
    <p class="lead">Jars on the shelf keep working while you sleep.</p>`;
}

// ---------- goals ----------

/** What reaching tier `k` opens: its recipes and upgrade levels. */
function opensAt(k) {
  const things = Object.values(RECIPES)
    .filter((r) => !r.base && r.tier === k)
    .map((r) => r.name);
  for (const u of Object.values(UPGRADES))
    if (u.levels.some((l) => l.tier === k)) things.push(u.name);
  return things;
}

function rewardHtml(reward) {
  const stock = Object.entries(reward.stock ?? {})
    .map(([id, n]) => `<i>${INGREDIENTS[id]?.icon ?? ""} ×${n}</i>`)
    .join("");
  return `<span class="reward"><i>🪙 ${reward.coins}</i>${stock}</span>`;
}

/** Coins shown short on the tier track: 500, 1.8k, 12k. */
const short = (n) =>
  n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10000 && n % 1000 ? 1 : 0)}k`;

function goalsHtml(s) {
  const tier = tierOf(s);
  const taken = s.progress.stats.earned;
  const next = TIERS[tier + 1];
  // Tiers sit evenly along the track; the marker is part-way to the next one by coins taken.
  const last = Math.max(1, TIERS.length - 1);
  const part = next
    ? Math.max(0, Math.min(1, (taken - TIERS[tier].earned) / (next.earned - TIERS[tier].earned)))
    : 0;
  const at = `${(((tier + part) / last) * 100).toFixed(1)}%`;
  const flags = TIERS.map(
    (t, k) =>
      `<i class="flag${k <= tier ? " got" : ""}" style="left:${((k / last) * 100).toFixed(1)}%"><span>🪙${short(t.earned)}</span></i>`,
  ).join("");
  const opens = next ? opensAt(tier + 1) : [];
  const track = `<section class="card tiers">
      <h3>The shop</h3>
      <div class="tiername">${TIERS[tier].name}</div>
      <div class="track"><b style="width:${at}"></b>${flags}<i class="heart" style="left:${at}">🫙</i></div>
      <p>${
        next
          ? `🪙 <b>${taken}</b> of ${next.earned} taken. Then the shop becomes <b>${next.name}</b>.${opens.length ? ` Opens: ${opens.map((x) => x.toLowerCase()).join(", ")}.` : ""}`
          : `🪙 ${taken} taken. As famous as a brine shop gets.`
      }</p>
    </section>`;

  const now = goalNow(s);
  const rungs = [];
  for (let i = now.i + 3; i > now.i; i--) {
    const g = goalAt(i);
    rungs.push(
      `<li class="rung later"><span class="txt">${goalText(g)}</span>${rewardHtml(g.reward)}</li>`,
    );
  }
  const frac = Math.max(0, Math.min(1, now.have / now.goal.n));
  rungs.push(`<li class="rung now${now.ready ? " ready" : ""}">
      <span class="txt">${now.text}</span>${rewardHtml(now.goal.reward)}
      <div class="bar"><b style="width:${(frac * 100).toFixed(1)}%"></b><span>${Math.min(now.have, now.goal.n)} / ${now.goal.n}</span></div>
      ${now.ready ? `<button class="claim" data-act="eve-claim">Claim 🪙 ${now.goal.reward.coins}</button>` : ""}
    </li>`);
  for (let i = now.i - 1; i >= Math.max(0, now.i - 2); i--)
    rungs.push(`<li class="rung done"><span class="txt">✓ ${goalText(goalAt(i))}</span></li>`);
  return `${track}<section class="card ladder"><h3>Goals</h3><ol>${rungs.join("")}</ol>
    <p class="more">The ladder goes on, each rung asking a little more.</p></section>`;
}

// ---------- render ----------

export function renderEvening(view, ui) {
  const s = ui.s;
  if (ui.evening && s.clock.phase !== "evening") ui.evening = null;
  const ev = ui.evening;
  view.el.hidden = !ev;
  if (!ev) return;
  const { r } = view;
  patch(r.title, `🌙 Day ${s.clock.day}`);
  patch(r.rep, `♥ ${s.shop.rep}`);
  patch(r.coins, `🪙 ${s.shop.coins}`);
  const dot = {
    market: rareToday(s).length > 0,
    goals: goalNow(s).ready,
  };
  patch(
    r.tabs,
    TABS.map(
      ([id, icon, label]) =>
        `<button class="tab${ev.tab === id ? " on" : ""}" data-act="eve-tab" data-tab="${id}"><span class="ico">${icon}</span>${label}${dot[id] ? `<i class="dot"></i>` : ""}</button>`,
    ).join(""),
  );
  const body =
    ev.tab === "market"
      ? marketHtml(s)
      : ev.tab === "workshop"
        ? upgradesHtml(s, ui)
        : ev.tab === "goals"
          ? goalsHtml(s)
          : tillHtml(s);
  const was = r.body.dataset.tab;
  patch(r.body, `<div class="corner c-${ev.tab}">${body}</div>`);
  if (was !== ev.tab) {
    r.body.dataset.tab = ev.tab;
    r.body.scrollTop = 0;
  }
  patch(
    r.actions,
    `<button data-act="bench">🧪 Bench</button><button data-act="eve-close">📋 Orders</button><button class="main" data-act="sleep">Sleep<small>→ Day ${s.clock.day + 1}</small></button>`,
  );
}
