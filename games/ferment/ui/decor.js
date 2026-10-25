// @ts-check
/**
 * Decor, one corner of the evening (ui/evening.js): dress the shop.
 *
 * At the top, the shop in miniature (window, back wall, shelf, garland,
 * dressed jars and a bag on the counter) wearing what is up, or what the
 * player is trying on. Below, a card per spot (content/decor.js SPOTS) with a
 * swatch per piece. Tapping a piece the shop owns puts it up; tapping any
 * other tries it on in the miniature, and the card's button then buys it,
 * says which tier it waits for, or which Shop pride goal wins it.
 *
 * Screen-only state: ui.evening.peek = { spot → piece id being tried on }.
 * Buttons carry data-act="dc-…"; decorAct() dispatches buyDecor / useDecor.
 */

import { DECOR, SPOTS } from "../content/decor.js";
import { PRIDE, TIERS } from "../content/goals.js";
import { decorLook, decorOffers } from "../core/index.js";
import { jarArt } from "./art/jar.js";
import { windowArt } from "./art/scene.js";
import { wallCss, woodVars, garlandArt, bagArt, decorSwatch, cssUrl } from "./art/decor.js";

/** What the miniature wears: what is up, with any piece being tried on. */
function previewLook(s, peek) {
  const look = { ...decorLook(s) };
  for (const [spot, id] of Object.entries(peek ?? {}))
    if (DECOR[id]?.spot === spot) look[spot] = id;
  return look;
}

const q = (/** @type {string} */ v) => v.replace(/"/g, "'");

/** The shop in miniature, wearing `look`. */
function miniShop(look) {
  const wall = wallCss(look.wall);
  const wood = woodVars(look.wood);
  const g = garlandArt(look.garland, true);
  const jars = ["dill", "kimchi", "hotsauce"]
    .map((recipe, k) =>
      jarArt(
        {
          id: 940 + k,
          recipe,
          f: [0.3, 0.5, 0.4][k],
          over: false,
          servings: 2,
          size: 2,
          adds: [],
          dress: look.jars,
        },
        `djar${k}`,
      ),
    )
    .join("");
  const win = `data:image/svg+xml,${encodeURIComponent(windowArt(17.5, look))}`;
  return `<div class="mini" style="--panel:${wall.color};--paper:${q(wall.image)};--plank:${wood.plank};--plank-hi:${wood.hi};--plank-lo:${wood.lo};--wood-dark:${wood.dark}">
    <div class="mcounter"><img class="mwin" alt="" src="${win}"><span class="mbag">${bagArt(look.bag)}</span></div>
    <div class="mshelf">${g ? `<i class="mgarland" style="background-image:${q(cssUrl(g.svg))};background-size:${g.w}px 26px"></i>` : ""}<div class="mrow">${jars}</div></div>
  </div>`;
}

/** The button under a spot's swatches, for the piece being tried on there. */
function lineFor(s, o) {
  if (o.owned) return "";
  let btn;
  if (o.pride) {
    const p = PRIDE.find((x) => x.id === o.pride);
    btn = `<button class="go" data-act="eve-tab" data-tab="goals">Win it: ${p ? p.text.toLowerCase() : "a Shop pride goal"}<span>›</span></button>`;
  } else if (o.locked) {
    btn = `<button disabled>Opens when the shop is ${TIERS[o.tier].name}</button>`;
  } else if (s.shop.coins < o.cost) {
    btn = `<button disabled>🪙 ${o.cost} · ${o.cost - s.shop.coins} more to go</button>`;
  } else {
    btn = `<button class="buy" data-act="dc-buy" data-id="${o.id}">Buy for 🪙 ${o.cost}</button>`;
  }
  return `<div class="dline"><b>${o.name}</b>${btn}</div>`;
}

export function decorHtml(s, ui) {
  const peek = ui.evening?.peek ?? {};
  const offers = decorOffers(s);
  const look = previewLook(s, peek);
  const trying = Object.entries(peek).some(([spot, id]) => {
    const o = offers.find((x) => x.id === id);
    return o && o.spot === spot && !o.on;
  });
  const cards = SPOTS.map(({ id: spot, name }) => {
    const mine = offers.filter((o) => o.spot === spot);
    const up = mine.find((o) => o.on);
    const tried = mine.find((o) => o.id === peek[spot] && !o.on);
    const sw = mine
      .map((o) => {
        const cls = ["sw"];
        if (o.on) cls.push("on");
        if (tried && o.id === tried.id) cls.push("try");
        if (!o.owned) cls.push(o.pride ? "prize" : o.locked ? "locked" : "shop");
        const tag = o.on
          ? "✓ up"
          : o.owned
            ? "yours"
            : o.pride
              ? "🏆 prize"
              : o.locked
                ? `🔒 tier ${o.tier}`
                : `🪙 ${o.cost}`;
        return `<button class="${cls.join(" ")}" data-act="dc-pick" data-id="${o.id}" aria-label="${o.name}"><span class="pic">${decorSwatch(o.id)}</span><small>${tag}</small></button>`;
      })
      .join("");
    return `<section class="card dspot" data-spot="${spot}"><h3>${name}<small>${up ? up.name : ""}</small></h3>
      <div class="swatches">${sw}</div>${tried ? lineFor(s, tried) : ""}</section>`;
  }).join("");
  return `<section class="card dprev${trying ? " trying" : ""}"><h3>The Brine Nook${trying ? `<small>trying on</small><button class="undo" data-act="dc-undo">Put back</button>` : ""}</h3>${miniShop(look)}
    <p class="lead">Make the shop your own. Looks only: customers pay the same either way.</p></section>${cards}`;
}

/**
 * Handle a decor button. Returns false for anything that isn't decor's.
 * @param {string} act
 * @param {HTMLElement} t
 * @param {any} ui
 * @param {(action: any) => any[]} dispatch
 * @param {(text: string) => void} toast
 */
export function decorAct(act, t, ui, dispatch, toast) {
  if (!act.startsWith("dc-")) return false;
  const ev = ui.evening;
  const peek = (ev.peek ??= {});
  if (act === "dc-undo") {
    ev.peek = {};
    return true;
  }
  const id = /** @type {string} */ (t.dataset.id);
  const d = DECOR[id];
  if (!d) return true;
  const o = decorOffers(ui.s).find((x) => x.id === id);
  if (act === "dc-pick") {
    if (o?.owned) {
      delete peek[d.spot];
      if (!o.on) dispatch({ type: "useDecor", id });
    } else if (peek[d.spot] === id) {
      delete peek[d.spot];
    } else {
      peek[d.spot] = id;
    }
    return true;
  }
  if (act === "dc-buy") {
    const events = dispatch({ type: "buyDecor", id });
    const no = events.find((e) => e.type === "rejected");
    if (no) toast(no.why[0].toUpperCase() + no.why.slice(1));
    else delete peek[d.spot];
    return true;
  }
  return false;
}
