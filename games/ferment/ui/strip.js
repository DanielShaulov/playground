// @ts-check
/** The flavour strip: crisp → funky, with a customer's window, jar marks and day ticks. */

export function strip({ f = null, ghosts = [], win = null, ticks = [], big = false } = {}) {
  let h = "";
  if (win)
    h += `<i class="win" style="left:${(win.lo * 100).toFixed(1)}%;width:${((win.hi - win.lo) * 100).toFixed(1)}%"></i>`;
  for (const g of ghosts) h += `<i class="mark ghost" style="left:${(g * 100).toFixed(1)}%"></i>`;
  for (const t of ticks)
    h += `<i class="tick" style="left:${(t.at * 100).toFixed(1)}%"><span>${t.label}</span></i>`;
  if (f !== null) h += `<i class="mark" style="left:${(f * 100).toFixed(1)}%"></i>`;
  return `<div class="strip${big ? " big" : ""}">${h}</div>`;
}

export const stripLabels = `<div class="strip-labels"><span class="crisp">crisp</span><span class="tangy">tangy</span><span class="sour">sour</span><span class="funky">funky</span></div>`;
