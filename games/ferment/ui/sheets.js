// @ts-check
/**
 * Bottom sheets: starting a jar, and the confirm before tipping out a jar that
 * hasn't popped. (The evening has its own screen: ui/evening.js.)
 */

import { RECIPES } from "../content/recipes.js";
import { crockAt, forecast, jarSize, menu } from "../core/index.js";
import { jarSvg } from "./art/jar.js";
import { strip } from "./strip.js";
import { tipAskHtml } from "./board.js";

export function sheetHtml(s, sheet) {
  if (sheet.kind === "brew") {
    const pace = crockAt(s, sheet.slot).pace;
    const bases = menu(s).filter((id) => !RECIPES[id].base);
    const rows = bases
      .map((id, i) => {
        const r = RECIPES[id];
        const ticks = [];
        for (let d = 1; d <= 5; d++) {
          const at = forecast(id, d * 24, [], pace);
          if (at >= 1) break;
          ticks.push({ at, label: d + "d" });
        }
        const order = s.orders.list.find((o) => o.recipe === id);
        const size = jarSize(s);
        const fresh = { id: 900 + i, recipe: id, age: 0, servings: size, size };
        return `<button class="recipe" data-act="brew" data-recipe="${id}" ${s.shop.coins < r.cost ? "disabled" : ""}>
        ${jarSvg(fresh, "icon")}
        <div class="info"><div class="name"><span>${r.name}</span><span>🪙 ${r.cost}</span></div>
        ${strip({ ticks, win: order ?? null })}</div></button>`;
      })
      .join("");
    return `<div class="panel"><h2>Start a jar</h2>
      <p>Dots show where the jar will be after each day. A green box is a pre-order you could time it for.</p>
      ${rows}<div class="btns"><button data-act="cancel">Cancel</button><button data-act="bench" data-slot="${sheet.slot}">🧪 Add-ins…</button></div></div>`;
  }
  if (sheet.kind === "tip") {
    const jar = s.shelf.slots[sheet.slot];
    if (!jar) return "";
    return `<div class="panel tip-sheet"><h2>Tip out this jar?</h2>
      ${tipAskHtml(s, jar)}
      <div class="btns"><button data-act="cancel">Keep it</button><button class="main warn" data-act="tip">Tip it out</button></div></div>`;
  }
  return "";
}
