// @ts-check
/**
 * The bee book: `app.sheet("book", { fact? })`.
 *
 * A keepsake notebook of true things about bees (content/facts.js), in
 * chapters by topic. The chapters are six painted buttons along the bottom
 * of the sheet, under the thumb; each wears a badge while it holds a page
 * that has not been opened.
 *
 * A found fact is a little card: its picture and its title. Tapping it
 * unfolds the text and a "Sources" button, which unfolds the sources (plain
 * text; each link opens in a new tab). Opening a card is what reads it: that
 * dispatches `readFact { fact }` and the "New" mark comes off. A fact not
 * found yet is a closed row with a faded picture and a hint of when it opens,
 * from its trigger key (ui/words/book.js `hintFor`); its text is never put
 * in the page.
 *
 * `params.fact` opens the book at that fact's chapter with the card unfolded
 * (and so read). With no fact asked for, it opens at the newest unread page.
 *
 * Built once. `update` patches counts, marks and badges, and only refills a
 * list when the pages in it changed.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { img } from "../paint/sprite.js";
import { bed } from "../art/flowers.js";
import { tree } from "../art/scenery.js";
import { hive } from "../art/hives.js";
import { jar } from "../art/jars.js";
import { good, item, bunch, honeycomb, ribbon } from "../art/goods.js";
import { bee, swarm } from "../art/creatures.js";
import { weather, sun } from "../art/sky.js";
import { keeper } from "../art/people.js";
import { capital } from "../words.js";
import { BOOK as W, TOPICS, TOPIC_ORDER, hintFor } from "../words/book.js";

export const title = W.title;

const styled = css(new URL("./book.css", import.meta.url));

/** The chapter last looked at, for as long as the page lives. */
let lastTopic = "";

// ───────────────────────── the pictures ─────────────────────────
//
// Each fact has a painted picture that suits it: a flower bed, a jar, a hive,
// something from the workshop. `bees` little bees fly round it (they are the
// meadow's own bee sprite, at its own size, laid over the picture).

/** @typedef {{ paint: () => any, bees: number }} Art */

/** @returns {Art} */
const A = (paint, bees = 0) => ({ paint, bees });

/** The hive types, smallest first, by the art's own names. */
const HIVE = ["skep", "box", "double", "stack"];

/** @type {Record<string, Art>} */
const TOPIC_ART = {
  colony: A(() => honeycomb(), 2),
  honey: A(() => jar("clover", 2)),
  flowers: A(() => bed("lavender"), 1),
  seasons: A(() => sun()),
  wax: A(() => good("candle")),
  keeping: A(() => hive(/** @type {any} */ (HIVE[0]))),
};

/** @type {Record<string, Art>} */
const FACT_ART = {
  // the colony
  "flowers-per-trip": A(() => bed("dandelion"), 2),
  "tidy-hive": A(() => good("soap-lavender"), 1),
  "royal-jelly": A(() => honeycomb(), 1),
  swarming: A(() => swarm(0)),
  "swarm-scouts": A(() => swarm(1), 2),
  "guard-bees": A(() => hive(/** @type {any} */ (HIVE[0])), 2),
  "waggle-dance": A(() => honeycomb(), 2),
  "colony-size": A(() => hive(/** @type {any} */ (HIVE[3])), 2),
  "water-carriers": A(() => bed("mint"), 1),
  "wing-beats": A(() => bunch("lavender"), 2),
  "bees-learn-faces": A(() => keeper(app.state?.keeper, "bust", "happy"), 1),
  "drones-no-father": A(() => honeycomb(), 1),
  "queen-piping": A(() => hive(/** @type {any} */ (HIVE[1])), 1),
  "five-eyes": A(() => bed("sunflower"), 1),
  propolis: A(() => item("spare"), 1),
  "surfing-bees": A(() => bed("mint"), 2),
  // honey
  "twelfth-of-a-teaspoon": A(() => jar("blend", 0), 1),
  "honey-colour-and-taste": A(() => jar("buckwheat", 1)),
  "ripening-nectar": A(() => jar("lavender", 3)),
  "honey-keeps": A(() => jar("clover", 1)),
  "honey-judging": A(() => ribbon("gold")),
  "thyme-honey-fame": A(() => jar("thyme", 2)),
  "heather-jelly": A(() => jar("heather", 1)),
  "honey-holds-water": A(() => jar("dandelion", 1)),
  // flowers
  "flower-constancy": A(() => bed("clover"), 1),
  "mint-family": A(() => bunch("mint")),
  "apples-need-partners": A(() => tree("bloom"), 1),
  "dandelion-florets": A(() => bed("dandelion")),
  "ten-pips": A(() => tree("fruit")),
  "clover-tongues": A(() => bed("clover")),
  "borage-favourite": A(() => bed("borage"), 1),
  "lavender-sips": A(() => bed("lavender"), 1),
  "water-mint": A(() => bed("mint")),
  "sunflowers-face-east": A(() => bed("sunflower")),
  "buckwheat-mornings": A(() => bed("buckwheat")),
  "ivy-autumn": A(() => bed("ivy"), 1),
  "caffeine-nectar": A(() => bed("heather"), 1),
  "bee-colours": A(() => bed("borage"), 1),
  "crops-need-pollinators": A(() => tree("fruit"), 1),
  // the seasons
  "fair-weather-fliers": A(() => weather("rain")),
  "winter-stores": A(() => jar("ivy", 1)),
  "cooling-the-hive": A(() => sun()),
  "drones-evicted": A(() => weather("windy")),
  "winter-cluster": A(() => weather("snow")),
  "winter-bees": A(() => weather("frost")),
  // beeswax
  "wax-glands": A(() => item("wax"), 1),
  "price-of-wax": A(() => good("candle")),
  "cold-cream": A(() => good("balm")),
  "honeycomb-hexagons": A(() => honeycomb()),
  // keeping bees
  "three-feet-or-three-miles": A(() => hive(/** @type {any} */ (HIVE[0]))),
  "making-a-split": A(() => item("spare")),
  varroa: A(() => hive(/** @type {any} */ (HIVE[1]))),
  thymol: A(() => item("remedy")),
  "sugar-syrup": A(() => item("syrup")),
  "bee-space": A(() => hive(/** @type {any} */ (HIVE[2]))),
  "going-to-the-heather": A(() => bed("heather")),
  smoke: A(() => keeper(app.state?.keeper, "smoker", "calm")),
  "queen-marking": A(() => honeycomb(), 1),
};

/** Where the little bees sit over a picture: left and top, as shares of its box. */
const BEE_SPOTS = [
  [0.02, 0.1],
  [0.74, 0.02],
  [0.78, 0.5],
];

/** The picture for a fact (or a chapter), `box` px square. A painter that fails gives the honeycomb. */
function picture(/** @type {Art | undefined} */ art, box, withBees = true) {
  let s;
  try {
    s = (art ?? TOPIC_ART.colony).paint();
  } catch {
    s = honeycomb();
  }
  const k = Math.min(box / s.w, box / s.h);
  const p = img(s, Math.max(8, Math.round(s.w * k)));
  p.className = "hh-pic";
  const holder = el(
    "span.hh-book__art",
    { style: { width: `${box}px`, height: `${box}px` }, "aria-hidden": "true" },
    p,
  );
  const n = withBees ? Math.min(art?.bees ?? 0, BEE_SPOTS.length) : 0;
  for (let i = 0; i < n; i++) {
    const b = img(bee(i % 2 ? 1 : 0));
    b.className = "hh-pic";
    if (i === 1) b.style.transform = "scaleX(-1)";
    holder.append(
      el(
        "span.hh-book__bee",
        {
          style: {
            left: `${Math.round(BEE_SPOTS[i][0] * box)}px`,
            top: `${Math.round(BEE_SPOTS[i][1] * box)}px`,
            animationDelay: `${-0.7 * i}s`,
          },
        },
        b,
      ),
    );
  }
  return holder;
}

const text = (node, s) => {
  if (node.textContent !== s) node.textContent = s;
};

/** Fill a list with these nodes, only if the ids in it changed. */
function setList(list, ids, nodeOf) {
  const key = ids.join("|");
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren(...ids.map(nodeOf));
}

/**
 * @param {HTMLElement} root
 * @param {{ fact?: string }} [params]
 */
export async function mount(root, params = {}) {
  await styled;
  const C = app.core;
  root.classList.add("hh-book");

  /** @type {{ id: string, trigger: string, topic: string, title: string, text: string, sources: { title: string, url: string }[] }[]} */
  const FACTS = /** @type {any} */ (C.FACTS);
  const byId = new Map(FACTS.map((f) => [f.id, f]));
  const topics = [
    ...TOPIC_ORDER.filter((t) => FACTS.some((f) => f.topic === t)),
    ...new Set(FACTS.map((f) => f.topic).filter((t) => !TOPIC_ORDER.includes(t))),
  ];
  const inTopic = (t) => FACTS.filter((f) => f.topic === t);
  const wordsOf = (t) => TOPICS[t] ?? { name: capital(t), tab: capital(t), line: "" };
  const artOf = (f) => FACT_ART[f.id] ?? TOPIC_ART[f.topic];

  /** The names a hint may need, from the core's tables. */
  const look = {
    honey: (id) => /** @type {any} */ (C.HONEYS)[id]?.name,
    tier: (n) => /** @type {any[]} */ (C.TIERS).find((t) => t.tier === n)?.name,
    regular: (id) => /** @type {any} */ (C.REGULARS)[id]?.name,
    hearts: (n) => /** @type {any} */ (C.TUNING).HEART_GIFTS?.[n - 1],
  };

  const book = () => app.state?.book ?? { facts: [], unread: [] };

  // ── the top: how full the book is
  const overall = el("div.hh-heading.hh-book__overall");
  const meter = el("span.hh-meter.hh-book__meter", { "aria-hidden": "true" });
  const slip = el("p.hh-note.hh-book__slip", { hidden: true });
  const owner = el("span.hh-book__owner", { "aria-hidden": "true" });
  let ownerKey = "";
  const top = el("header.hh-book__top", null, [
    owner,
    el("div.hh-book__toptext", null, [overall, meter]),
  ]);

  // ── the chapter that is showing
  const headPic = el("span.hh-book__headpic");
  const headName = el("h3.hh-heading.hh-book__name");
  const headCount = el("span.hh-chip.hh-chip--honey.hh-book__count");
  const headLine = el("p.hh-sub.hh-book__line");
  const head = el("div.hh-book__head", null, [
    headPic,
    el("div.hh-book__headtext", null, [
      el("div.hh-book__headrow", null, [headName, headCount]),
      headLine,
    ]),
  ]);
  const foundList = el("ul.hh-book__found");
  const restHead = el("h4.hh-sub.hh-book__resthead");
  const restList = el("ul.hh-book__rest");
  const rest = el("section.hh-book__restbox", null, [restHead, restList]);
  root.append(top, slip, head, foundList, rest);

  // ── the chapters, along the bottom
  /** @type {Map<string, { btn: HTMLElement, badge: HTMLElement }>} */
  const tabs = new Map();
  const foot = el(
    "nav.hh-sheet__foot.hh-book__tabs",
    { "aria-label": W.chapters },
    topics.map((t) => {
      const badge = el("span.hh-badge", { hidden: true });
      const btn = el(
        "button.hh-tab",
        {
          type: "button",
          "aria-pressed": "false",
          dataset: { topic: t, sound: "page" },
          onclick: () => show(t),
        },
        [picture(TOPIC_ART[t], 30, false), el("span", { text: wordsOf(t).tab }), badge],
      );
      tabs.set(t, { btn, badge });
      return btn;
    }),
  );
  root.after(foot);

  // ── the pages

  /** The cards that are unfolded. */
  const open = new Set();
  /** @type {Map<string, any>} */
  const cards = new Map();
  /** @type {Map<string, HTMLElement>} */
  const closed = new Map();

  /** A found fact: its picture and title; the text and sources are built when first unfolded. */
  function card(id) {
    let c = cards.get(id);
    if (c) return c;
    const f = byId.get(id);
    const pic = el("span.hh-book__pic", null, picture(artOf(f), 52));
    const badge = el("span.hh-badge.hh-book__new", { text: W.fresh, hidden: true });
    const btn = el(
      "button.hh-book__open",
      {
        type: "button",
        "aria-expanded": "false",
        dataset: { sound: "none" },
        onclick: () => toggle(id),
      },
      [
        pic,
        el("span.hh-book__title", { text: f.title }),
        badge,
        el("span.hh-book__chev", { "aria-hidden": "true" }),
      ],
    );
    const body = el("div.hh-book__body", { hidden: true });
    const li = el("li.hh-card.hh-book__fact", { dataset: { fact: id } }, [btn, body]);
    c = { f, li, btn, body, badge, pic, built: false };
    cards.set(id, c);
    return c;
  }

  /** The inside of a card: the text, then "Sources" and the list it unfolds. */
  function fill(c) {
    if (c.built) return;
    c.built = true;
    const list = el(
      "ol.hh-book__sources",
      { hidden: true },
      c.f.sources.map((s) =>
        el("li", null, [
          el("span.hh-book__srctitle", { text: s.title }),
          /^https?:\/\//.test(s.url)
            ? el("a.hh-book__link", { href: s.url, target: "_blank", rel: "noopener", text: s.url })
            : el("span.hh-book__link", { text: s.url }),
        ]),
      ),
    );
    const more = el(
      "button.hh-btn.hh-btn--quiet.hh-btn--small.hh-book__more",
      {
        type: "button",
        "aria-expanded": "false",
        dataset: { sound: "page" },
        onclick: () => {
          list.hidden = !list.hidden;
          more.setAttribute("aria-expanded", String(!list.hidden));
          more.classList.toggle("is-open", !list.hidden);
          if (!list.hidden) reveal(list);
        },
      },
      [W.sources, el("span.hh-book__chev", { "aria-hidden": "true" })],
    );
    c.body.append(el("p.hh-book__text", { text: c.f.text }), more, list);
  }

  /** A fact not found yet: a faded picture and when it opens. Never its words. */
  function closedRow(id) {
    let row = closed.get(id);
    if (row) return row;
    const f = byId.get(id);
    row = el("li.hh-book__closed", { dataset: { closed: id } }, [
      el("span.hh-book__pic", null, picture(artOf(f), 34, false)),
      el("span.hh-book__hint", { text: W.opens(hintFor(f.trigger, look)) }),
    ]);
    closed.set(id, row);
    return row;
  }

  /** Bring a card wholly into the sheet's view, if it is not. */
  function reveal(node, smooth = true) {
    const r = root.getBoundingClientRect();
    const c = node.getBoundingClientRect();
    let dy = 0;
    if (c.bottom > r.bottom - 8) dy = c.bottom - r.bottom + 8;
    if (c.top - dy < r.top + 4) dy = c.top - r.top - 4;
    if (Math.abs(dy) < 1) return;
    root.scrollTo({
      top: root.scrollTop + dy,
      behavior: smooth && app.settings.motion ? "smooth" : "auto",
    });
  }

  /** Unfold or fold a card. Unfolding one that is new reads it. */
  function toggle(id, want = !open.has(id), quietly = false) {
    const c = card(id);
    if (want) open.add(id);
    else open.delete(id);
    if (want) fill(c);
    c.body.hidden = !want;
    c.li.classList.toggle("is-open", want);
    c.btn.setAttribute("aria-expanded", String(want));
    const fresh = want && book().unread.includes(id);
    if (!quietly) {
      app.sound(fresh ? "fact" : "page");
      if (fresh) app.fx("sparkle", { at: c.pic, n: 6 });
      if (want) reveal(c.li);
    }
    if (fresh) app.dispatch({ type: "readFact", fact: id }, { quiet: true });
  }

  let topic = topics[0] ?? "";

  function show(t) {
    if (t === topic) return;
    topic = t;
    lastTopic = t;
    draw();
    root.scrollTop = 0;
  }

  function draw() {
    const found = new Set(book().facts);
    const unread = new Set(book().unread);
    const nFound = FACTS.filter((f) => found.has(f.id)).length;

    // whose book it is: the beekeeper's face and name
    const who = app.state?.keeper;
    const key = who?.made ? JSON.stringify(who) : "nobody";
    if (key !== ownerKey) {
      ownerKey = key;
      owner.replaceChildren(
        picture(who?.made ? A(() => keeper(who, "bust", "happy"), 1) : TOPIC_ART.colony, 56),
      );
      app.sheetTitle(W.titleOf(who?.made ? who.name : ""));
    }

    text(overall, W.found(nFound, FACTS.length));
    meter.style.setProperty("--hh-value", String(FACTS.length ? nFound / FACTS.length : 0));
    const word = nFound === 0 ? W.empty : nFound >= FACTS.length ? W.complete : "";
    text(slip, word);
    slip.hidden = !word;

    for (const t of topics) {
      const tab = tabs.get(t);
      const fs = inTopic(t);
      const fresh = fs.filter((f) => unread.has(f.id)).length;
      tab.btn.classList.toggle("is-on", t === topic);
      tab.btn.setAttribute("aria-pressed", String(t === topic));
      tab.btn.setAttribute(
        "aria-label",
        W.tabLabel(wordsOf(t).name, fs.filter((f) => found.has(f.id)).length, fs.length, fresh),
      );
      text(tab.badge, String(fresh));
      tab.badge.hidden = !fresh;
    }

    const fs = inTopic(topic);
    const got = fs.filter((f) => found.has(f.id));
    const still = fs.filter((f) => !found.has(f.id));
    if (head.dataset.topic !== topic) {
      head.dataset.topic = topic;
      headPic.replaceChildren(picture(TOPIC_ART[topic], 60));
    }
    text(headName, wordsOf(topic).name);
    text(headLine, got.length ? wordsOf(topic).line : W.topicEmpty);
    text(
      headCount,
      got.length === fs.length ? W.topicDone(fs.length) : W.topicCount(got.length, fs.length),
    );

    setList(
      foundList,
      got.map((f) => f.id),
      (id) => card(id).li,
    );
    foundList.hidden = !got.length;
    setList(
      restList,
      still.map((f) => f.id),
      closedRow,
    );
    text(restHead, W.stillToFind(still.length));
    rest.hidden = !still.length;

    for (const f of got) {
      const c = card(f.id);
      const fresh = unread.has(f.id);
      c.li.classList.toggle("is-new", fresh);
      c.badge.hidden = !fresh;
      c.btn.setAttribute("aria-label", W.pageLabel(f.title, fresh));
    }
  }

  // Where to open: at the fact asked for; else the newest page not yet read;
  // else the chapter last looked at; else the first with anything in it.
  const asked = typeof params?.fact === "string" ? byId.get(params.fact) : undefined;
  const has = (id) => book().facts.includes(id);
  const newest = [...book().unread].reverse().find((id) => byId.has(id) && has(id));
  const firstFound = FACTS.find((f) => has(f.id));
  if (asked) topic = asked.topic;
  else if (newest) topic = byId.get(newest).topic;
  else if (topics.includes(lastTopic)) topic = lastTopic;
  else if (firstFound) topic = firstFound.topic;
  lastTopic = topic;

  if (asked && has(asked.id)) toggle(asked.id, true, true);
  draw();
  const at = asked
    ? has(asked.id)
      ? card(asked.id).li
      : closed.get(asked.id)
    : newest
      ? card(newest).li
      : null;
  if (at) {
    const r = root.getBoundingClientRect();
    const c = at.getBoundingClientRect();
    if (c.bottom > r.bottom - 8 || c.top < r.top) root.scrollTop += c.top - r.top - 8;
  }

  return { update: draw };
}
