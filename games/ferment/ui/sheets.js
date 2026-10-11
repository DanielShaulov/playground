// @ts-check
/** Bottom sheets: starting a jar, and the evening takings. */

import { RECIPES, RECIPE_IDS } from "../content/recipes.js";
import { SERVINGS } from "../content/tuning.js";
import { forecast } from "../core/index.js";
import { jarSvg } from "./art/jar.js";
import { strip } from "./strip.js";

export function sheetHtml(s, sheet) {
  if (sheet.kind === "brew") {
    const rows = RECIPE_IDS.map((id, i) => {
      const r = RECIPES[id];
      const ticks = [];
      for (let d = 1; d <= 5; d++) {
        const at = forecast(id, d * 24);
        if (at >= 1) break;
        ticks.push({ at, label: d + "d" });
      }
      const order = s.orders.list.find((o) => o.recipe === id);
      const fresh = { id: 900 + i, recipe: id, age: 0, servings: SERVINGS };
      return `<button class="recipe" data-act="brew" data-recipe="${id}" ${s.shop.coins < r.cost ? "disabled" : ""}>
        ${jarSvg(fresh, "icon")}
        <div class="info"><div class="name"><span>${r.name}</span><span>🪙 ${r.cost}</span></div>
        ${strip({ ticks, win: order ?? null })}</div></button>`;
    }).join("");
    return `<div class="panel"><h2>Start a jar</h2>
      <p>Dots show where the jar will be after each day. A green box is a pre-order you could time it for.</p>
      ${rows}<div class="btns"><button data-act="cancel">Cancel</button><button data-act="bench" data-slot="${sheet.slot}">🧪 Add-ins…</button></div></div>`;
  }
  const t = sheet.summary;
  const dr = s.shop.rep - t.repStart;
  return `<div class="panel"><h2>Day ${s.clock.day} closed</h2><p>Jars on the shelf will age overnight.</p>
    <div class="stats">
      <div><b>${t.served}</b>customers served</div>
      <div><b>🪙 ${t.earned}</b>earned, ${t.tips} in tips</div>
      <div><b>${dr >= 0 ? "+" : "−"}${Math.abs(dr)} ♥</b>reputation</div>
      <div><b>${t.preorders}</b>pre-orders taken</div>
      ${t.missed ? `<div><b>${t.missed}</b>pre-orders missed</div>` : ""}
      ${t.left ? `<div><b>${t.left}</b>walked out waiting</div>` : ""}
    </div>
    <div class="btns"><button data-act="bench">🧪 Bench</button><button class="main" data-act="sleep">Sleep → Day ${s.clock.day + 1}</button></div></div>`;
}
