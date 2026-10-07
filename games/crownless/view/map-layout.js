/**
 * Where everything sits on the map screen, as plain numbers (ui.md §1 rule 7,
 * §3): the map above, the context bar and the tab bar below, and the camera
 * between world and screen. Pure, like layout.js: the game draws and
 * hit-tests from it, the DOM bars take their heights from it, and the
 * browser tests tap from it.
 */
import { centre, hexAt, extent } from "../rules/hex.js";

/** A hex is 26 px from centre to corner, 45 px across (world.md §1). */
export const HEX_R = 26;
/** The context bar and the tab bar (ui.md §3). */
export const CONTEXT_H = 64;
export const TABS_H = 56;

/** The map screen for a stage of W × H. */
export function mapLayout(W, H) {
  const tabsY = H - TABS_H;
  const ctxY = tabsY - CONTEXT_H;
  return { W, H, R: HEX_R, viewH: Math.max(80, ctxY), ctxY, tabsY };
}

/** The map's size in pixels at the map's scale. */
export const worldSize = (g, R = HEX_R) => {
  const e = extent(g);
  return { w: e.w * R, h: e.h * R };
};

/**
 * Keep the camera (the world pixel at the centre of the map view) where the
 * map still fills the view; a map smaller than the view sits centred.
 */
export function clampCamera(L, g, cam) {
  const { w, h } = worldSize(g, L.R);
  const hw = L.W / 2;
  const hh = L.viewH / 2;
  const x = w <= L.W ? w / 2 : Math.max(hw, Math.min(w - hw, cam.x));
  const y = h <= L.viewH ? h / 2 : Math.max(hh, Math.min(h - hh, cam.y));
  return { x, y };
}

export const toScreen = (L, cam, wx, wy) => ({
  x: wx - cam.x + L.W / 2,
  y: wy - cam.y + L.viewH / 2,
});
export const toWorld = (L, cam, sx, sy) => ({
  x: sx + cam.x - L.W / 2,
  y: sy + cam.y - L.viewH / 2,
});

/** A hex's centre on screen. */
export function hexScreen(L, cam, g, i) {
  const c = centre(g, i);
  return toScreen(L, cam, c.x * L.R, c.y * L.R);
}

/** The hex under a tap on the map, or −1 (off the map, or on the bars). */
export function hexUnder(L, cam, g, sx, sy) {
  if (sy < 0 || sy >= L.viewH) return -1;
  const w = toWorld(L, cam, sx, sy);
  return hexAt(g, w.x / L.R, w.y / L.R);
}

/** The camera that puts hex i at the centre of the view, clamped. */
export const cameraOn = (L, g, i) => {
  const c = centre(g, i);
  return clampCamera(L, g, { x: c.x * L.R, y: c.y * L.R });
};

/** The overview (ui.md §3): the whole realm fitted into the map view. */
export function overview(L, g) {
  const e = extent(g);
  const pad = 8;
  const R = Math.min((L.W - pad * 2) / e.w, (L.viewH - pad * 2) / e.h);
  return { R, ox: (L.W - e.w * R) / 2, oy: (L.viewH - e.h * R) / 2, w: e.w * R, h: e.h * R };
}

/** The hex under a tap on the overview, or −1. */
export function hexUnderOverview(L, g, sx, sy) {
  const o = overview(L, g);
  return hexAt(g, (sx - o.ox) / o.R, (sy - o.oy) / o.R);
}
