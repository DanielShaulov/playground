/**
 * Where everything sits on the battle screen, as plain numbers.
 *
 * Pure geometry: given the stage size (and, when following, a camera), it
 * says where the field is, how many pixels a metre is, where a squad's hit
 * area is, and how tall the command bar is. game.js draws and hit-tests from
 * it, the DOM bar takes its height from it, and the browser tests tap from
 * it — one copy of where things are (ui.md §1, rule 7).
 */

/** The command bar's rows, top to bottom (ui.md §5): chips, orders, actions. */
export const BAR = { pad: 8, gap: 6, chips: 52, orders: 46, actions: 56 };
export const barHeight = () => BAR.pad * 2 + BAR.gap * 2 + BAR.chips + BAR.orders + BAR.actions;

/** The smallest a tap target may be, in CSS pixels (ui.md §1, rule 2). */
export const MIN_HIT = 44;

/**
 * @param {number} W stage width
 * @param {number} H stage height
 * @param {{follow?: {x: number, y: number}|null, zoom?: number}} [camera]
 *   With `follow`, the field is drawn `zoom` times bigger, centred on that
 *   point (metres) and clamped to the field.
 */
export function layout(W, H, camera = {}) {
  const bar = barHeight();
  const viewH = Math.max(120, H - bar);
  const pad = 4;
  const fit = Math.min((W - pad * 2) / 100, (viewH - pad * 2) / 140);
  let scale = fit;
  let ox = (W - 100 * fit) / 2;
  let oy = (viewH - 140 * fit) / 2;
  let view = { x: 0, y: 0, w: 100, h: 140 };
  if (camera.follow) {
    scale = fit * (camera.zoom ?? 2.5);
    const hw = W / 2 / scale;
    const hh = viewH / 2 / scale;
    const cx = Math.max(hw, Math.min(100 - hw, camera.follow.x));
    const cy = Math.max(hh, Math.min(140 - hh, camera.follow.y));
    ox = W / 2 - cx * scale;
    oy = viewH / 2 - cy * scale;
    view = { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
  }
  return {
    W,
    H,
    bar,
    barY: H - bar,
    viewH,
    fit,
    scale,
    ox,
    oy,
    view,
    follow: !!camera.follow,
    /** The whole field on screen, in pixels (it may run off-screen when following). */
    field: { x: ox, y: oy, w: 100 * scale, h: 140 * scale },
  };
}

export const toScreen = (L, x, y) => ({ x: L.ox + x * L.scale, y: L.oy + y * L.scale });
export const toField = (L, px, py) => ({ x: (px - L.ox) / L.scale, y: (py - L.oy) / L.scale });

/** Half-width and half-depth of a squad in metres, from what the rules keep. */
export function squadHalf(s, n = s.n) {
  const files = Math.max(1, Math.min(s.files0, n));
  const ranks = Math.ceil(n / files);
  return { hw: (files * s.spacing) / 2, hd: (ranks * s.spacing) / 2 };
}

/**
 * A squad's tap area: its rectangle, turned to its facing, grown to at least
 * MIN_HIT across both ways. `at` is where it is drawn ({x, y, fx, fy, n}).
 */
export function hitArea(L, s, at = s) {
  const { hw, hd } = squadHalf(s, at.n);
  const c = toScreen(L, at.x, at.y);
  return {
    x: c.x,
    y: c.y,
    fx: at.fx,
    fy: at.fy,
    hw: Math.max(MIN_HIT / 2, hw * L.scale + 4),
    hd: Math.max(MIN_HIT / 2, hd * L.scale + 4),
  };
}

/** Is screen point p inside a hit area? */
export function inHit(h, px, py) {
  const dx = px - h.x;
  const dy = py - h.y;
  // Facing (fx, fy) is the squad's depth axis; across is perpendicular to it.
  const along = Math.abs(dx * h.fx + dy * h.fy);
  const across = Math.abs(dx * -h.fy + dy * h.fx);
  return along <= h.hd && across <= h.hw;
}

/**
 * The squad under a tap, nearest centre first among those whose hit area
 * holds the point. `squads` is a list of {s, at}.
 */
export function squadAt(L, squads, px, py) {
  let best = null;
  let bd = Infinity;
  for (const { s, at } of squads) {
    const h = hitArea(L, s, at);
    if (!inHit(h, px, py)) continue;
    const d = Math.hypot(px - h.x, py - h.y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}
