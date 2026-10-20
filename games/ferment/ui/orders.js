// @ts-check
/**
 * The evening's orders corner: every order still to collect, split into what
 * needs handling and what is already reserved, so the next day can be planned
 * at a glance. Each order is one card: who, what, when, its window on the
 * strip with the kept jars' marks at pickup, and where it stands (board.js
 * orderStatus). Tapping a card opens the planner for it, over the evening.
 */

import { RECIPES } from "../content/recipes.js";
import { faceSvg } from "./art/customer.js";
import { jarSvg, emptyJarSvg } from "./art/jar.js";
import { orderStatus, stripMarks, clockAt } from "./board.js";
import { word } from "./text.js";

/** @typedef {import("../core/types.js").State} State */

const byDue = (a, b) => a.due - b.due || a.arriveAt - b.arriveAt;

/** "Tomorrow at 10:40", "Day 4 at 9:00". */
function whenText(s, o) {
  const d = o.due - s.clock.day;
  const day = d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `Day ${o.due}`;
  return `${day} at ${clockAt(o.arriveAt)}`;
}

/** The orders, each with where it stands; `todo` is true for any that needs handling. */
export function ordersNow(s) {
  return s.orders.list
    .slice()
    .sort(byDue)
    .map((o) => {
      const st = orderStatus(s, o);
      return { o, st, todo: st.kind !== "set" };
    });
}

/** What the card says about where the order stands. */
function statusHtml(o, st) {
  const n = st.left;
  const jarWord = o.kind === "bulk" ? `${n} jar${n > 1 ? "s" : ""}` : "a jar";
  switch (st.kind) {
    case "set":
      return `<b class="st good">✓ Reserved</b><small>${
        o.kind === "bulk"
          ? `${st.jars.length} jar${st.jars.length > 1 ? "s" : ""} kept`
          : "a portion kept"
      }</small>`;
    case "swap":
      return `<b class="st warn">Kept jar won't suit</b><small>Pick another jar</small>`;
    case "bench":
      return `<b class="st bad">Needs ${jarWord}</b><small>🧪 Work it out at the bench</small>`;
    default:
      return `<b class="st bad">Needs ${jarWord}</b><small>${
        st.shelf ? "A shelf jar would suit" : "Start one tonight"
      }</small>`;
  }
}

function cardHtml(s, o, st) {
  const mid = (o.lo + o.hi) / 2;
  const qty = o.qty ? ` ×${o.qty}` : "";
  const marks = st.jars.map((x) => x.at);
  const fits = marks.some((f) => f >= o.lo && f <= o.hi && f < 1);
  const jars =
    st.jars.map((x) => jarSvg(x.jar, "mini")).join("") +
    (st.left > 0 ? emptyJarSvg.replace('class="jar"', 'class="mini need"') : "");
  return `<button class="ocard s-${st.kind}" data-act="order" data-order="${o.id}">
    <span class="face">${faceSvg(o.look, st.kind === "set" ? "delight" : "wait")}</span>
    <span class="otext">
      <span class="oname"><b>${o.name}</b>${o.regular ? `<span class="stamp">regular</span>` : ""}</span>
      <span class="owhat">${RECIPES[o.recipe].name}${qty}, ${word(mid)}</span>
      <span class="owhen">${whenText(s, o)}</span>
      ${stripMarks(o, marks, fits)}
    </span>
    <span class="ostate"><span class="ojars">${jars}</span>${statusHtml(o, st)}</span>
  </button>`;
}

/** The orders corner of the evening. */
export function ordersHtml(s) {
  const all = ordersNow(s);
  if (!all.length)
    return `<section class="card none"><h3>Orders</h3>
      <p>No orders yet. When a customer's jar isn't ready, offer them a pre-order and plan it here.</p></section>`;
  const todo = all.filter((x) => x.todo);
  const set = all.filter((x) => !x.todo);
  const tomorrow = all.filter((x) => x.o.due === s.clock.day + 1).length;
  const lead = `<p class="olead">${
    tomorrow ? `${tomorrow} coming in tomorrow. ` : ""
  }${todo.length ? `${todo.length} still need${todo.length > 1 ? "" : "s"} a jar.` : "Everything is reserved."}</p>`;
  const section = (cls, title, list) =>
    list.length
      ? `<section class="olist ${cls}"><h3>${title} <span class="n">${list.length}</span></h3>${list
          .map(({ o, st }) => cardHtml(s, o, st))
          .join("")}</section>`
      : "";
  return `${lead}${section("todo", "Needs handling", todo)}${section("set", "Reserved", set)}`;
}
