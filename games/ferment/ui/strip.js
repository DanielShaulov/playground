// @ts-check
/**
 * The flavour strip: crisp → funky, with a customer's window, jar marks and day ticks.
 *
 * Every strip carries its four bands (BANDS) as children. The default look
 * hides them behind the smooth colour blend; the "Patterns" strip style
 * (ui/settings.js sets <html data-strip="marked">) shows them instead, each
 * band with its own texture and a notch at each border, so a mark or a window
 * can be read without telling the colours apart.
 */

import { BANDS } from "../content/flavour.js";

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const bands = BANDS.map(
  (b) => `<b class="band ${b.id}" style="left:${pct(b.lo)};width:${pct(b.hi - b.lo)}"></b>`,
).join("");

export function strip({ f = null, ghosts = [], win = null, ticks = [], big = false } = {}) {
  let h = "";
  if (win) h += `<i class="win" style="left:${pct(win.lo)};width:${pct(win.hi - win.lo)}"></i>`;
  for (const g of ghosts) h += `<i class="mark ghost" style="left:${pct(g)}"></i>`;
  for (const t of ticks)
    h += `<i class="tick" style="left:${pct(t.at)}"><span>${t.label}</span></i>`;
  if (f !== null) h += `<i class="mark" style="left:${pct(f)}"></i>`;
  return `<div class="strip${big ? " big" : ""}">${h}${bands}</div>`;
}

export const stripLabels = `<div class="strip-labels"><span class="crisp">crisp</span><span class="tangy">tangy</span><span class="sour">sour</span><span class="funky">funky</span></div>`;
