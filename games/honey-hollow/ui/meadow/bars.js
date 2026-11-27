// @ts-check
/**
 * Everything on the meadow screen that is not the canvas: the sky with its
 * chips and the day's arc, the plot's header, the hint line and the action
 * bar. It builds the page once and afterwards only writes what changed, so
 * it can be told the whole view after every step of the game.
 *
 * Other modules find things here by class and by `data-act` (the teaching
 * notes in ui/teach.js, the browser tests): those names are not to change.
 */

import { el, clear } from "../dom.js";
import { iconImg, pic } from "../chrome.js";
import { url } from "../paint/sprite.js";
import { weather, sun, moon, skyBand } from "../art/sky.js";
import { hive } from "../art/hives.js";
import { item } from "../art/goods.js";
import { number } from "../words.js";
import { MEADOW } from "../words/meadow.js";
import { moreIcon, skyVeil, VEIL_W, VEIL_H } from "./marks.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
/** How much of the sun shows through each weather. */
const SUN = { sunny: 1, windy: 1, frost: 0.85, cloudy: 0.5, rain: 0.16, snow: 0.22 };
const btn = (cls, act, props, ...kids) =>
  el(`button.${cls}`, { type: "button", dataset: { act }, ...props }, ...kids);

/**
 * @param {HTMLElement} root the scene's root
 */
export function createBars(root) {
  // ---- sky: two bands to cross-fade, the chips, the day's arc
  const bands = [0, 1].map(() => /** @type {HTMLCanvasElement} */ (el("canvas.hm-band")));
  let band = 0;

  const dayIcon = el("span.hm-chip__pic");
  const dayWide = el("span.hm-day--wide");
  const dayShort = el("span.hm-day--short");
  const dayChip = btn(
    "hm-chipbtn",
    "calendar",
    { "aria-label": MEADOW.dayChip },
    el("span.hh-chip.hh-chip--leaf", null, dayIcon, dayWide, dayShort),
  );
  const wxNow = el("span.hm-chip__pic");
  const wxNext = el("span.hm-chip__pic.hm-chip__pic--next");
  const wxChip = btn(
    "hm-chipbtn",
    "weather",
    null,
    el("span.hh-chip.hh-chip--sky", null, wxNow, wxNext),
  );
  const coinText = el("span");
  const coinChip = el(
    "span.hh-chip.hh-chip--honey.hm-coins",
    { dataset: { fx: "coins" } },
    pic(item("coin"), 18),
    coinText,
  );
  const renownText = el("span");
  const renownChip = btn(
    "hm-chipbtn",
    "renown",
    null,
    el("span.hh-chip", null, pic(item("star"), 18), renownText),
  );
  const chips = el("div.hm-chips", null, dayChip, wxChip, el("span.hm-gap"), coinChip, renownChip);

  const orb = /** @type {HTMLImageElement} */ (el("img.hm-orb", { alt: "", draggable: "false" }));
  const arc = el("div.hm-arc", { "aria-hidden": "true" });
  arc.innerHTML =
    '<svg viewBox="0 0 100 24" preserveAspectRatio="none"><path d="M4,19.2 Q50,-4.8 96,19.2"/></svg>';
  arc.append(orb);
  const sky = el(
    "div.hm-sky",
    null,
    el("div.hm-bands", { "aria-hidden": "true" }, bands),
    chips,
    arc,
  );

  // ---- the plot's header
  const name = el("h1.hm-name");
  const pips = el("span.hm-pips", { "aria-hidden": "true" });
  const sale = el("span.hm-sale", { text: MEADOW.forSale, hidden: true });
  const back = () => iconImg("back", 24);
  const head = el(
    "div.hm-head",
    null,
    btn("hh-iconbtn.hh-iconbtn--bare.hm-arrow", "prev", { "aria-label": MEADOW.prev }, back()),
    el("div.hm-title", null, name, el("div.hm-under", null, pips, sale)),
    btn(
      "hh-iconbtn.hh-iconbtn--bare.hm-arrow.hm-arrow--next",
      "next",
      { "aria-label": MEADOW.next },
      back(),
    ),
  );

  // ---- the stage
  const bg = /** @type {HTMLCanvasElement} */ (el("canvas.hm-canvas", { "aria-hidden": "true" }));
  const fg = /** @type {HTMLCanvasElement} */ (
    el("canvas.hm-canvas.hm-canvas--fg", { role: "img" })
  );
  const buyBlurb = el("p.hm-buy__blurb");
  const buyOnly = el("p.hm-buy__only");
  const buyPrice = el("span");
  const buyShort = el("p.hm-buy__short");
  const buy = el(
    "div.hm-buy.hh-card",
    { hidden: true },
    buyBlurb,
    buyOnly,
    el(
      "div.hm-buy__row",
      null,
      el("span.hh-chip.hh-chip--honey", null, pic(item("coin"), 18), buyPrice),
      btn("hh-btn", "buy", { "data-sound": "none" }, MEADOW.buy.button),
    ),
    buyShort,
  );
  const veil = el("div.hm-veil", { hidden: true }, el("span", { text: MEADOW.painting }));
  const stage = el("div.hm-stage", null, bg, fg, buy, veil);

  // ---- the hint line
  const hintIcon = el("span.hm-hint__icon");
  const hintText = el("span.hm-hint__text");
  const hint = btn("hm-hint", "hint", null, hintIcon, hintText);

  // ---- the action bar: five round buttons, and under them, where the thumb
  // rests, the one big button of the hour
  const primary = el("div.hm-primary");
  /** @type {Record<string, HTMLElement>} */
  const badges = {};
  const act = (id, picture) => {
    badges[id] = el("span.hh-badge.hm-act__badge", { hidden: true });
    return btn(
      "hh-iconbtn.hm-act",
      id,
      null,
      picture,
      el("span.hm-act__label", { text: MEADOW.act[id] }),
      badges[id],
    );
  };
  const acts = el(
    "div.hm-acts",
    null,
    act("seeds", iconImg("plant", 28)),
    act("hives", pic(hive("skep"), 24)),
    act("workshop", iconImg("workshop", 28)),
    act("book", iconImg("book", 28)),
    act("more", pic(moreIcon(), 28)),
  );
  const bar = el("div.hm-bar", null, acts, primary);
  const foot = el("div.hm-foot", null, bar);

  root.append(sky, head, stage, hint, foot);

  // ---- writing only what changed
  /** @type {Record<string, any>} */
  const last = {};
  const changed = (key, value) => {
    if (last[key] === value) return false;
    last[key] = value;
    return true;
  };
  const swap = (node, child) => {
    clear(node);
    if (child) node.append(child);
  };

  /** The sky of the season and the hour, with the day's weather laid over it. */
  function paintSky(season, phase, wx) {
    const s = skyBand(/** @type {any} */ (SEASONS[season] ?? "spring"), phase, VEIL_W, VEIL_H);
    band = 1 - band;
    const c = bands[band];
    c.width = s.canvas.width;
    c.height = s.canvas.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    ctx.drawImage(s.canvas, 0, 0);
    if (wx && wx !== "sunny") {
      try {
        const v = skyVeil(wx);
        ctx.globalCompositeOperation = "source-atop";
        ctx.drawImage(v.canvas, 0, 0, c.width, c.height);
        ctx.globalCompositeOperation = "source-over";
      } catch (err) {
        console.warn("[meadow] no sky for this weather", err);
      }
    }
    c.classList.add("is-on");
    bands[1 - band].classList.remove("is-on");
  }

  function setPrimary(key, fast, cue) {
    clear(primary);
    primary.dataset.phase = key;
    if (key === "morning")
      primary.append(
        btn(
          `hh-btn.hh-btn--leaf.hh-btn--block${cue ? ".hm-cue" : ""}`,
          "start",
          { "data-sound": "none" },
          iconImg("play", 22),
          MEADOW.start,
        ),
      );
    else if (key === "winter")
      primary.append(
        btn("hh-btn.hh-btn--block", "start", null, iconImg("stall", 22), MEADOW.toStall),
      );
    else if (key === "day") {
      const one = (id, icon, text, on) =>
        btn(
          `hh-btn.hh-btn--small${on ? "" : ".hh-btn--secondary"}`,
          `speed-${id}`,
          { "aria-pressed": String(on) },
          iconImg(icon, 20),
          text,
        );
      primary.append(
        el("span.hm-speed", { text: MEADOW.speedLabel }),
        one("normal", "play", MEADOW.normal, !fast),
        one("fast", "fast", MEADOW.fast, fast),
      );
    } else
      primary.append(
        btn("hh-btn.hm-grow", "stall", null, iconImg("stall", 22), MEADOW.toStall),
        btn("hh-btn.hh-btn--quiet.hh-btn--small", "skip", null, MEADOW.skipStall),
      );
  }

  /**
   * Show the view. Every field is a plain value; unchanged ones cost nothing.
   * @param {any} v
   */
  function update(v) {
    if (changed("season", v.season)) swap(dayIcon, iconImg(SEASONS[v.season] ?? "spring", 18));
    if (changed("day", v.dayWide)) {
      dayWide.textContent = v.dayWide;
      dayShort.textContent = v.dayShort;
    }
    if (changed("wx", `${v.today}|${v.tomorrow}`)) {
      swap(wxNow, pic(weather(v.today), 22));
      swap(wxNext, pic(weather(v.tomorrow), 15));
      wxChip.setAttribute(
        "aria-label",
        MEADOW.weatherLabel(MEADOW.weather[v.today], MEADOW.weather[v.tomorrow]),
      );
      root.dataset.weather = v.today;
    }
    if (changed("coins", v.coins)) {
      coinText.textContent = number(v.coins);
      coinChip.setAttribute("aria-label", MEADOW.coinsLabel(v.coins));
    }
    if (changed("renown", v.renown)) {
      renownText.textContent = number(v.renown);
      renownChip.setAttribute("aria-label", MEADOW.renownLabel(v.renown));
    }
    if (changed("sky", `${v.season}|${v.phase}|${v.today}`)) {
      paintSky(v.season, v.phase, v.today);
      orb.style.opacity = String(v.phase === "evening" ? 0.9 : (SUN[v.today] ?? 1));
    }

    if (changed("plot", `${v.plotName}|${v.plotIndex}|${v.plots}|${v.owned}`)) {
      name.textContent = v.plotName;
      clear(pips);
      for (let i = 0; i < v.plots; i++) pips.append(el(i === v.plotIndex ? "i.is-on" : "i"));
      sale.hidden = v.owned;
      root.classList.toggle("is-forsale", !v.owned);
      fg.setAttribute("aria-label", v.plotName);
    }
    if (changed("buy", v.owned ? "" : `${v.plotName}|${v.price}|${v.short}|${v.only}`)) {
      buy.hidden = v.owned;
      if (!v.owned) {
        buyBlurb.textContent = v.blurb;
        buyOnly.textContent = v.only;
        buyOnly.hidden = !v.only;
        buyPrice.textContent = number(v.price);
        buyShort.textContent = v.short > 0 ? MEADOW.buy.short(v.short) : "";
        buyShort.hidden = !(v.short > 0);
      }
    }

    if (changed("primary", `${v.primary}|${v.fast}|${v.cue}`)) setPrimary(v.primary, v.fast, v.cue);
    if (changed("unread", v.unread)) {
      badges.book.hidden = !(v.unread > 0);
      badges.book.textContent = v.unread > 9 ? "9+" : String(v.unread);
    }
    if (changed("ready", v.goalReady)) {
      badges.more.hidden = !v.goalReady;
      badges.more.classList.toggle("hh-badge--dot", true);
    }
    if (changed("hint", `${v.hintKind}|${v.hint}`)) {
      hintText.textContent = v.hint;
      hint.dataset.kind = v.hintKind;
      swap(hintIcon, v.hintIcon ? iconImg(v.hintIcon, 18) : null);
    }
  }

  // ---- the sun on its arc
  let arcW = 0;
  let arcH = 0;
  let sunKey = -1;
  const arcWatch = new ResizeObserver(() => {
    arcW = arc.clientWidth;
    arcH = arc.clientHeight;
    sunKey = -1;
  });
  arcWatch.observe(arc);

  /**
   * @param {number} t how far through the day, 0..1
   * @param {boolean} night show the moon instead
   */
  function frame(t, night) {
    const key = Math.round(t * 500) + (night ? 1000 : 0);
    if (key === sunKey || !arcW) return;
    sunKey = key;
    if (changed("orb", night)) orb.src = url(night ? moon() : sun());
    const u = t < 0 ? 0 : t > 1 ? 1 : t;
    const v = 1 - u;
    const x = (0.04 + 0.92 * u) * arcW;
    const y = (v * v * 0.8 - 2 * u * v * 0.2 + u * u * 0.8) * arcH;
    orb.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  return {
    root,
    stage,
    bg,
    fg,
    foot,
    head,
    coinChip,
    update,
    frame,
    /** A soft "Painting…" over the stage while a plot's pictures are made. */
    veil(on) {
      veil.hidden = !on;
    },
    destroy() {
      arcWatch.disconnect();
    },
  };
}
