// @ts-check
/**
 * The year page: "A year in Honey Hollow".
 *
 * A keepsake, shown on the first morning of spring when a year has just
 * ended (the core's `yearDue`). It is a few pages of butter paper, turned
 * with one button by the thumb:
 *
 *   cover     the title, whose year it was, your beekeeper waving in the
 *             meadow, and the year in three numbers with its honeys
 *   keeps     ribbons, the bee book, friends, the size of the place
 *   credits   the first year only: the name of the game, "An idea from
 *             Sari", who made it, and that the Hollow goes on
 *
 * Later years have the first two pages, with the credit kept small on the
 * second. "Carry on" marks the year seen (`seenYear`) and goes back to the
 * meadow; if another year is waiting (a save that slept through two), that
 * one is shown next. Opened when no year is due, it is one page, "The year
 * so far", from the running tallies, with "Back to the meadow".
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { number } from "../words.js";
import { YEAR as W } from "../words/night.js";
import { pic, iconImg } from "../chrome.js";
import { put, DPR } from "../paint/sprite.js";
import { skyBand, sun } from "../art/sky.js";
import { ground } from "../art/ground.js";
import { hive as hiveArt } from "../art/hives.js";
import { bed } from "../art/flowers.js";
import { tree } from "../art/scenery.js";
import { jar } from "../art/jars.js";
import { keeper, villager } from "../art/people.js";
import { item, heart as heartArt, ribbon } from "../art/goods.js";
import { logo } from "../art/chrome.js";
import { safe } from "./stall-art.js";

const styled = css(new URL("./year.css", import.meta.url));

/** The picture's own units. CSS fits it to the phone. */
const PIC_W = 320;
const PIC_H = 190;
/** How the tree stands in each season, for "The year so far". */
const TREE = { spring: "bloom", summer: "leaf", autumn: "fruit", winter: "dormant" };

const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  /** @type {any} */
  const core = app.core;
  root.classList.add("hh-page", "yr");
  app.ambience("morning");

  const page = el("article.yr-page");
  const count = el("span.yr-count");
  const next = el("button.hh-btn.hh-btn--block.yr-next", {
    type: "button",
    dataset: { act: "continue" },
    onclick: onNext,
  });
  root.append(page, el("footer.yr-foot", null, count, next));

  /** @type {any} the year on the page, or null for "The year so far" */
  let due = null;
  let at = 0;
  let key = "";
  let busy = false;
  let leaving = false;

  const pagesFor = (year) =>
    !year ? ["sofar"] : year.year === 1 ? ["cover", "keeps", "credits"] : ["cover", "keeps"];
  const honeyName = (flower) =>
    core.HONEYS[flower]?.name ?? core.FLOWERS[flower]?.name ?? String(flower);

  // ───────────────────────── the picture ─────────────────────────

  /** Your beekeeper waving among the year's flowers, the hives behind. */
  function picture(state, kinds, season, phase) {
    const canvas = /** @type {HTMLCanvasElement} */ (
      el("canvas.yr-pic", { "aria-hidden": "true" })
    );
    canvas.width = Math.ceil(PIC_W * DPR);
    canvas.height = Math.ceil(PIC_H * DPR);
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sky = safe(() =>
      skyBand(/** @type {any} */ (season), /** @type {any} */ (phase), PIC_W, 130),
    );
    if (sky) ctx.drawImage(sky.canvas, 0, 0, sky.w, sky.h);
    const day = safe(() => sun());
    if (day) put(ctx, day, 262, 52);
    const turf = safe(() => ground("year", /** @type {any} */ (season), PIC_W, 104));
    if (turf) ctx.drawImage(turf.canvas, 0, PIC_H - 100, turf.w, turf.h);
    const stand = (make, x, y, k) => {
      const s = safe(make);
      if (s) put(ctx, s, x, y, k);
    };
    stand(() => tree(/** @type {any} */ (TREE[season] ?? "leaf"), 0), 50, 166, 0.84);
    const hives = state.hives.list.slice(0, 2).map((h) => h.type);
    if (hives[1]) stand(() => hiveArt(/** @type {any} */ (hives[1])), 232, 150, 0.6);
    stand(() => hiveArt(/** @type {any} */ (hives[0] ?? "skep")), 276, 164, 0.76);
    const beds = kinds.filter((f) => core.FLOWERS[f]?.where !== "tree").slice(-4);
    const spots = [
      [108, 172],
      [222, 180],
      [134, 184],
      [196, 186],
    ];
    const stage = season === "winter" ? "dormant" : "bloom";
    beds.forEach((flower, i) =>
      stand(() => bed(flower, stage, i % 2), spots[i][0], spots[i][1], 0.6),
    );
    stand(() => keeper(state.keeper, "wave", "happy"), 166, 180, 0.9);
    return canvas;
  }

  /** The whole year in one picture: spring on the left, through to winter on the right. */
  /** Phones tall enough for a cover composed like a plate in an almanac (year.css draws the same line). */
  const tallPhone = window.matchMedia("(min-height: 700px)");
  /** The cover picture's height in its own units: 190, or taller on a tall phone. */
  function coverUnits() {
    if (!tallPhone.matches) return PIC_H;
    const wide = Math.min(root.clientWidth || window.innerWidth, 620) - 32;
    const high = Math.min((root.clientHeight || window.innerHeight) * 0.42, wide * 0.94);
    return Math.max(PIC_H, Math.round((320 * high) / wide / 4) * 4);
  }

  function yearPicture(state, kinds, H = PIC_H) {
    const canvas = /** @type {HTMLCanvasElement} */ (
      el("canvas.yr-pic", { "aria-hidden": "true" })
    );
    canvas.width = Math.ceil(PIC_W * DPR);
    canvas.height = Math.ceil(H * DPR);
    if (H > PIC_H) {
      canvas.style.width = "100%";
      canvas.style.aspectRatio = `${PIC_W} / ${H}`;
    }
    // A taller picture has more sky, a deeper meadow and everything in it bigger.
    const big = 1 + (H / PIC_H - 1) * 0.8;
    const deep = Math.round(104 + (H - PIC_H) * 0.3);
    const by = (y) => H - ((PIC_H - y) * deep) / 104;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const names = ["spring", "summer", "autumn", "winter"];
    const band = PIC_W / 4;
    names.forEach((season, i) => {
      const sheet = document.createElement("canvas");
      sheet.width = canvas.width;
      sheet.height = canvas.height;
      const sc = sheet.getContext("2d");
      if (!sc) return;
      sc.setTransform(DPR, 0, 0, DPR, 0, 0);
      const sky = safe(() => skyBand(/** @type {any} */ (season), "day", PIC_W, H - 60));
      if (sky) sc.drawImage(sky.canvas, 0, 0, sky.w, sky.h);
      const turf = safe(() => ground("year", /** @type {any} */ (season), PIC_W, deep));
      if (turf) sc.drawImage(turf.canvas, 0, H - deep + 4, turf.w, turf.h);
      if (i > 0) {
        // Each season washes in over the one before it.
        const x0 = i * band - 20;
        const fade = sc.createLinearGradient(x0, 0, x0 + 40, 0);
        fade.addColorStop(0, "rgba(0, 0, 0, 0)");
        fade.addColorStop(1, "rgba(0, 0, 0, 1)");
        sc.globalCompositeOperation = "destination-in";
        sc.fillStyle = fade;
        sc.fillRect(0, 0, PIC_W, H);
      }
      ctx.drawImage(sheet, 0, 0, PIC_W, H);
    });
    const day = safe(() => sun());
    if (day) put(ctx, day, 30, 44);
    const stand = (make, x, y, k) => {
      const s = safe(make);
      if (s) put(ctx, s, x, y, k);
    };
    /** The season a flower mostly blooms in, by the core's window. */
    const seasonOf = (flower) => {
      const w = safe(() => core.bloomWindow(state, flower));
      return w ? Math.max(0, Math.min(3, Math.floor((w.from + w.to) / 2 / 7))) : -1;
    };
    const beds = kinds.filter((f) => core.FLOWERS[f]?.where !== "tree");
    const spare = ["dandelion", "lavender", "heather", "ivy"];
    names.forEach((season, i) => {
      const x = i * band;
      stand(() => tree(/** @type {any} */ (TREE[season]), i % 2), x + 26, by(156), 0.52 * big);
      const mine = beds.filter((f) => seasonOf(f) === i).slice(0, 2);
      const show = mine.length ? mine : i < 3 ? [spare[i]] : beds.slice(0, 1);
      show.forEach((flower, j) =>
        stand(
          () => bed(flower, i === 3 ? "dormant" : "bloom", j),
          x + 30 + j * 30,
          by(178 + j * 8),
          0.5 * big,
        ),
      );
    });
    const hives = state.hives.list.slice(0, 2).map((h) => h.type);
    if (hives[1]) stand(() => hiveArt(/** @type {any} */ (hives[1])), 118, by(152), 0.5 * big);
    stand(() => hiveArt(/** @type {any} */ (hives[0] ?? "skep")), 296, by(166), 0.6 * big);
    stand(() => keeper(state.keeper, "wave", "happy"), 164, by(182), 0.82 * big);
    return canvas;
  }

  // ───────────────────────── the pieces ─────────────────────────

  const stat = (picture, n, label) =>
    el(
      "div.yr-stat",
      null,
      picture,
      el("span.yr-stat__n", { text: number(n) }),
      el("span.yr-stat__label", { text: label }),
    );

  /** The year in three numbers, then a jar of every pure honey found. */
  function numbers(y, big = false) {
    const kinds = y.kinds ?? [];
    return [
      el(
        "div.yr-stats",
        null,
        stat(
          safe(() => pic(jar(kinds[0] ?? "blend", kinds.length ? 3 : 0), big ? 46 : 34)),
          y.jars,
          W.jars(y.jars),
        ),
        stat(
          safe(() => pic(item("star"), big ? 40 : 30)),
          kinds.length,
          W.kinds(kinds.length),
        ),
        stat(
          safe(() => pic(item("coin"), big ? 40 : 30)),
          y.earned,
          W.earned,
        ),
      ),
      kinds.length
        ? el(
            "div.yr-kinds",
            null,
            kinds.map((f) => safe(() => pic(jar(f, 3), big ? 40 : 30, honeyName(f)))),
          )
        : el("p.hh-sub.yr-note", { text: W.noKinds }),
    ];
  }

  function ribbons(list) {
    return [
      el("h2.yr-h", { text: W.ribbonsHead }),
      list.length
        ? el(
            "div.yr-ribbons",
            null,
            list.map((r) =>
              el(
                "figure.yr-ribbon",
                null,
                safe(() => pic(ribbon(r.medal), 42)),
                el("figcaption", { text: W.ribbon(r.medal, lower(honeyName(r.honey))) }),
              ),
            ),
          )
        : el("p.hh-sub.yr-note", { text: W.noRibbons }),
    ];
  }

  function book(found) {
    return [
      el("h2.yr-h", { text: W.bookHead }),
      el("p.yr-line", null, iconImg("book", 30), W.facts(found, core.FACTS.length)),
    ];
  }

  function friends(state, y) {
    const hearts = y?.heartsBy ?? state.regulars?.hearts ?? {};
    const known = Object.entries(hearts)
      .filter(([, n]) => Number(n) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 8);
    return [
      el("h2.yr-h", { text: W.friendsHead }),
      known.length
        ? el(
            "div.yr-friends",
            null,
            known.map(([id, n]) =>
              el(
                "figure.yr-friend",
                null,
                safe(() =>
                  pic(
                    villager(id, "bust", "happy"),
                    40,
                    W.heartsAlt(core.REGULARS[id]?.name ?? id, n),
                  ),
                ),
                el(
                  "figcaption.yr-friend__n",
                  { "aria-hidden": "true" },
                  safe(() => pic(heartArt(true), 12)),
                  number(n),
                ),
              ),
            ),
          )
        : null,
      el("p.hh-sub.yr-note", { text: W.friends(y?.friends ?? core.MEASURES.friends(state)) }),
    ];
  }

  const place = (hives, plots, tier) =>
    el("p.yr-place", { text: W.place(hives, plots, core.TIERS[tier]?.name ?? "") });

  // ───────────────────────── the pages ─────────────────────────

  const PAGES = {
    cover: (state, y) => [
      el("h1.hh-banner.hh-banner--honey.yr-title", { text: W.title(y.year) }),
      el("p.hh-sub.yr-by", { text: W.by(state.keeper?.name, y.year) }),
      yearPicture(state, y.kinds ?? [], coverUnits()),
      ...numbers(y, tallPhone.matches),
    ],
    keeps: (state, y) => [
      el("p.yr-over", { text: W.title(y.year) }),
      ...ribbons(y.ribbons ?? []),
      ...book(y.facts),
      ...friends(state, y),
      el("div.hh-sprig", { role: "separator" }),
      place(y.hives, y.plots, y.tier),
      y.year === 1 ? null : el("p.yr-idea.yr-idea--small", { text: W.idea }),
      y.year === 1 ? null : el("p.hh-sub.yr-note", { text: W.goesOnLater }),
    ],
    credits: () => [
      safe(() => {
        const lettered = pic(logo(), 210, W.title(1));
        lettered.classList.add("yr-logo");
        return lettered;
      }),
      el("p.yr-idea", { text: W.idea }),
      el(
        "div.yr-credits",
        null,
        W.credits.map((text) => el("p", { text })),
      ),
      el("div.hh-sprig", { role: "separator" }),
      el("p.yr-goes", { text: W.goesOn }),
    ],
    sofar: (state) => {
      const cal = core.calendarOf(state.clock.day);
      const running = state.progress.year;
      const won = (state.progress.ribbons ?? []).filter((r) => r.year === cal.year);
      const plots = Object.values(state.land.plots).filter(
        (p) => /** @type {any} */ (p).owned,
      ).length;
      return [
        el("h1.hh-banner.yr-title", { text: W.soFar }),
        el("p.hh-sub.yr-by", { text: W.soFarBy(state.keeper?.name) }),
        picture(state, running.kinds ?? [], cal.seasonName, "day"),
        ...numbers(running),
        ...(won.length ? ribbons(won) : []),
        el(
          "p.yr-line",
          null,
          iconImg("book", 30),
          W.facts(state.book.facts.length, core.FACTS.length),
        ),
        place(state.hives.list.length, plots, state.progress.tier),
      ];
    },
  };

  // ───────────────────────── what is on screen ─────────────────────────

  function draw(state) {
    const now = core.yearDue(state);
    if ((now?.year ?? 0) !== (due?.year ?? 0)) at = 0;
    due = now;
    const pages = pagesFor(due);
    at = Math.min(at, pages.length - 1);
    const k = `${due?.year ?? "so-far"}|${at}|${due ? "" : JSON.stringify([state.progress.year, state.clock.day])}`;
    if (k === key) return;
    const turned = key !== "";
    key = k;
    page.replaceChildren(...PAGES[pages[at]](state, due).flat().filter(Boolean));
    page.scrollTop = 0;
    page.dataset.page = pages[at];
    if (turned && app.settings.motion) {
      page.classList.remove("is-in");
      void page.offsetWidth;
      page.classList.add("is-in");
    }
    const last = at === pages.length - 1;
    next.dataset.last = String(last);
    next.textContent = !due ? W.back : last ? W.carryOn : W.next;
    count.textContent = pages.length > 1 ? W.pageOf(at + 1, pages.length) : "";
  }

  function onNext() {
    if (leaving) return;
    if (at < pagesFor(due).length - 1) {
      at += 1;
      app.sound("page");
      draw(app.state);
      return;
    }
    if (due) {
      busy = true;
      app.dispatch({ type: "seenYear", year: due.year });
      busy = false;
      if (core.yearDue(app.state)) {
        draw(app.state);
        return;
      }
    }
    leaving = true;
    app.go("meadow");
  }

  draw(app.state);

  return {
    update(state) {
      if (!busy && !leaving) draw(state);
    },
    unmount() {
      leaving = true;
    },
  };
}
