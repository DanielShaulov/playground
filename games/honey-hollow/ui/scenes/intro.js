// @ts-check
/**
 * The intro: three pages of a picture book. A tap on the page (or a swipe to
 * the left, or the big button) turns it; a swipe to the right turns back;
 * "Skip" goes straight on. After the last page comes "make your beekeeper"
 * (or the meadow, if a beekeeper already exists).
 *
 * The first picture is painted before the scene shows; the other two are
 * painted just after, while the first page is being read.
 */

import { app } from "../app.js";
import { el, on, css } from "../dom.js";
import { drop, img } from "../paint/sprite.js";
import { page, fliers, fit, PAGE_COUNT, PIC_W, PIC_H } from "./intro-art.js";
import { INTRO as W } from "../words/keeper.js";

const styled = css(new URL("./intro.css", import.meta.url));

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  root.classList.add("hh-page", "intro");
  const made = !!app.state.keeper?.made;
  const count = Math.min(PAGE_COUNT, W.pages.length);
  let at = 0;
  let leaving = false;

  /** @type {HTMLElement[]} */
  const cards = [];
  /** @type {HTMLElement[]} */
  const frames = [];
  /** @type {HTMLElement[]} */
  const dots = [];
  for (let i = 0; i < count; i++) {
    const frame = el("div.intro__pic", { role: "img", "aria-label": W.pages[i].alt });
    frames.push(frame);
    cards.push(
      el("article.hh-card.intro__card", { hidden: i > 0 }, [
        frame,
        el("p.intro__text", { text: W.pages[i].text }),
      ]),
    );
    dots.push(el("span.intro__dot"));
  }

  /** How tall the pictures are painted, in picture units; set once the page is laid out. */
  let high = PIC_H;

  /** Paint page `i`'s picture if it is not in yet, and set its bees hovering over it. */
  function ensure(i) {
    const frame = frames[i];
    if (!frame || frame.firstChild) return;
    try {
      const canvas = page(i, high).canvas;
      canvas.className = "intro__canvas";
      frame.append(canvas);
      fliers(i, high).forEach((f, n) => {
        const pic = img(f.sprite);
        pic.removeAttribute("width");
        pic.removeAttribute("height");
        pic.className = f.flip ? "intro__flier-pic is-flipped" : "intro__flier-pic";
        frame.append(
          el(
            "span.intro__flier",
            {
              style: {
                left: `${f.left}%`,
                top: `${f.top}%`,
                width: `${f.width}%`,
                animationDuration: `${3.1 + ((n * 7 + i * 3) % 5) * 0.55}s`,
                animationDelay: `${-n * 0.8}s`,
              },
            },
            pic,
          ),
        );
      });
    } catch (err) {
      // A page with no picture is still a page.
      console.warn("[hollow] intro picture could not be painted:", err);
    }
  }

  const book = el("div.intro__book", null, cards);
  const dotRow = el("div.intro__dots", { role: "img" }, dots);
  const skip = el(
    "button.hh-btn.hh-btn--quiet.intro__skip",
    { type: "button", onclick: finish },
    W.skip,
  );
  const next = el("button.hh-btn.intro__next", { type: "button", onclick: () => turn(1) });
  root.append(
    book,
    el("div.intro__foot", null, [dotRow, el("div.intro__buttons", null, [skip, next])]),
  );

  function render() {
    const last = at === count - 1;
    next.textContent = last ? (made ? W.lastMade : W.last) : W.next;
    // On the last page the big button already does what "Skip" does.
    skip.style.visibility = last ? "hidden" : "";
    dotRow.setAttribute("aria-label", W.page(at + 1, count));
    dots.forEach((dot, i) => dot.classList.toggle("is-on", i === at));
  }

  /** @param {1 | -1} dir */
  function turn(dir) {
    if (leaving) return;
    const to = at + dir;
    if (to < 0) return;
    if (to >= count) return finish();
    ensure(to);
    cards[at].hidden = true;
    at = to;
    const card = cards[at];
    card.hidden = false;
    card.classList.remove("is-from-left", "is-from-right");
    void card.offsetWidth;
    card.classList.add(dir > 0 ? "is-from-right" : "is-from-left");
    render();
  }

  function finish() {
    if (leaving) return;
    leaving = true;
    // The three pictures are big and never shown again: let them go.
    drop("intro-page-");
    app.go(made ? "meadow" : "creator").then((went) => {
      if (!went) leaving = false;
    });
  }

  // A tap turns the page; a swipe turns it either way.
  let startX = 0;
  let startY = 0;
  let id = -1;
  const offs = [
    on(book, "pointerdown", (e) => {
      id = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
    }),
    on(book, "pointerup", (e) => {
      if (e.pointerId !== id) return;
      id = -1;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) turn(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        app.sound("tap");
        turn(1);
      }
    }),
    on(book, "pointercancel", () => {
      id = -1;
    }),
  ];

  // The picture grows with the phone: the card takes the room there is
  // between the top of the page and the buttons, less a little air.
  const wide = frames[0].clientWidth;
  if (wide) {
    const spare = Math.max(0, book.clientHeight - cards[0].offsetHeight - 46) * 0.85;
    high = fit((PIC_W * (frames[0].clientHeight + spare)) / wide);
    root.style.setProperty("--intro-pic-h", String(high));
  }

  ensure(0);
  render();
  const later = setTimeout(() => {
    ensure(1);
    requestAnimationFrame(() => ensure(2));
  }, 350);

  return {
    unmount() {
      clearTimeout(later);
      for (const off of offs) off();
    },
  };
}
