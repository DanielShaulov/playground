// Everything the flows know about the page lives here: the selectors (SEL),
// the storage keys, and the Kit each flow is handed to drive the game and to
// check it. Other builders are still polishing screens, so the selectors lean
// on what should survive that: roles and names, data-act, data-sheet,
// data-scene. When a screen changes, this is the one file to mend.
import { isDeepStrictEqual } from "node:util";
import { mkdirSync } from "node:fs";
import { BLANK } from "./serve.mjs";

/** shared/storage.js: createStore("honey-hollow"). */
export const KEY = {
  save: "playground:honey-hollow:save",
  settings: "playground:honey-hollow:settings",
  broken: "playground:honey-hollow:save-broken",
};

const within = (scope, sel) => `${scope} ${sel}`;
const SCENE = (name) => `.hh-scene[data-scene="${name}"]:not([inert])`;
const SHEET = `.hh-sheet[role="dialog"]`;

export const SEL = {
  scene: SCENE,
  /** A button of the meadow, the title or a settings row: data-act names what it does. */
  act: (name) => `[data-act="${name}"]`,
  loading: "#hh-loading",
  toasts: `[role="status"][aria-live]`,

  // Sheets.
  sheet: SHEET,
  sheetBody: (name) => `[data-sheet="${name}"]`,
  sheetTitle: "#hh-sheet-title",
  sheetClose: `${SHEET} button[aria-label="Close"]`,
  scrim: ".hh-sheet-wrap:not([inert]) .hh-scrim",
  confirm: `[role="alertdialog"]`,
  /** A keeper's note (ui/teach.js). It takes no taps; a tap anywhere, or Escape, puts it away. */
  note: `[role="note"]`,

  // Intro and the creator (also the wardrobe sheet).
  introPage: (n) => `${SCENE("intro")} [role="img"][aria-label="Page ${n} of 3"]`,
  keeperPainted: `.keeper-stage[data-painting="0"]`,
  keeperTab: (id) => `[role="tab"][data-tab="${id}"]`,
  keeperChoice: (tab, id) => `[role="tabpanel"][data-tab="${tab}"] button[data-id="${id}"]`,
  keeperOther: (tab) => `[role="tabpanel"][data-tab="${tab}"] button[aria-pressed="false"]:visible`,
  keeperName: `input[aria-label="Name"]`,
  talent: (id) => `[role="radio"][data-talent="${id}"]`,
  talents: `[role="radio"][data-talent]`,

  // The meadow.
  canvas: within(SCENE("meadow"), `canvas[role="img"]`),
  hint: within(SCENE("meadow"), `[data-act="hint"]`),
  primary: within(SCENE("meadow"), "[data-phase]"),
  badge: (act) => within(SCENE("meadow"), `[data-act="${act}"] .hh-badge`),
  place: ".hm-place",

  // Inside sheets.
  seed: (flower) => `[data-sheet="seeds"] button[data-flower="${flower}"]`,
  seedsForSale: `[data-sheet="seeds"] button[data-flower][aria-disabled="false"]`,
  buy: (item) => `[data-sheet="hives"] [data-buy="${item}"]`,
  care: (what) => `[data-sheet="hive"] [data-care="${what}"]`,
  more: (sheet) => `[data-sheet="more"] [data-go="${sheet}"]`,
  fact: (id) => `[data-sheet="book"] [data-fact="${id}"]`,
  factOpen: (id) => `[data-sheet="book"] [data-fact="${id}"] button[aria-expanded]`,
  make: (recipe) => `[data-sheet="workshop"] [data-make="${recipe}"]`,
  setting: (key) => `[data-sheet="settings"] [role="switch"][data-set="${key}"]`,
  speed: (value) => `[data-sheet="settings"] [data-set="speed"][data-value="${value}"]`,
  backupCode: `[data-sheet="settings"] textarea[aria-label="Backup code"]`,
  restoreCode: `[data-sheet="settings"] textarea[aria-label="Paste a backup code"]`,

  // The stall, the show, the night card, the year page.
  shelfItem: within(SCENE("stall"), "button[data-product]"),
  showPhase: (phase) => within(SCENE("stall"), `[data-phase="${phase}"]`),
  fairCard: within(SCENE("stall"), `[role="dialog"][aria-label="The Winter Fair"]`),
  yearPage: (page) => within(SCENE("year"), `[data-page="${page}"]`),
  yearNext: within(SCENE("year"), "button[data-last]"),
  bookTopic: (topic) => `${SHEET} button[data-topic="${topic}"]`,
};

/** The words on buttons that have no data attribute to go by. */
export const NAME = {
  turn: /^turn the page$/i,
  makeKeeper: /^make my beekeeper$/i,
  toTalent: /^next: a talent$/i,
  begin: /^begin$/i,
  take: /^take \d+ jars?$/i,
  offer: /^offer \d+$/i,
  nothing: /^nothing today$/i,
  carryOn: /^carry on$/i,
  nextCustomer: /^next customer$/i,
  toCrate: /^to the grocer/i,
  closeStall: /^close the stall$/i,
  openStall: /^open the stall$/i,
  sleep: /^sleep$/i,
  goodMorning: /^good morning$/i,
  dig: /^dig up$/i,
  claim: /^claim/i,
  enter: /^enter \d+ jars?$/i,
  onToStall: /^on to the stall$/i,
  keepLook: /^keep this look$/i,
};

/** What counts as something to tap, for the size and safe-area checks. */
const BUTTONS = `button, a[href], [role="button"], [role="tab"], [role="switch"], [role="radio"]`;
const FIELDS = `input:not([type="hidden"]), textarea, select`;

/**
 * Runs in the page. Returns one line for each thing wrong with the layout:
 * the document wider than the screen, the page scrolled or able to scroll,
 * a button under 44 × 44, anything to tap off the side or under a safe area.
 */
function lookOver({ top, bottom, slop, buttons, fields }) {
  const W = document.documentElement.clientWidth;
  const H = window.innerHeight;
  const doc = document.documentElement;
  const out = [];
  const px = (n) => Math.round(n * 10) / 10;
  const say = (el) => {
    const words = (
      el.getAttribute("aria-label") ||
      el.innerText ||
      el.getAttribute("placeholder") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 32);
    const tag = el.dataset.act ? `[data-act="${el.dataset.act}"]` : el.tagName.toLowerCase();
    return `${tag} "${words}"`;
  };
  const wide = Math.max(doc.scrollWidth, document.body.scrollWidth);
  if (wide > W + 1) out.push(`the document is ${wide}px wide on a ${W}px screen`);
  if (window.scrollX || window.scrollY || doc.scrollTop || document.body.scrollTop)
    out.push(`the page itself has scrolled (to ${window.scrollX}, ${window.scrollY})`);
  if (doc.scrollHeight > H + 1)
    out.push(`the page itself can scroll: ${doc.scrollHeight}px of it on a ${H}px screen`);

  for (const el of document.querySelectorAll(`${buttons}, ${fields}`)) {
    if (el.closest("[inert], [hidden], [aria-hidden='true']")) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.pointerEvents === "none") continue;
    // What of it can be seen and tapped: its box, cut by every box that clips it.
    let [l, t, rt, b] = [r.left, r.top, r.right, r.bottom];
    let slides = false;
    let rolls = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      const q = p.getBoundingClientRect();
      if (s.overflowX !== "visible") {
        l = Math.max(l, q.left);
        rt = Math.min(rt, q.right);
        if (/auto|scroll/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) slides = true;
      }
      if (s.overflowY !== "visible") {
        t = Math.max(t, q.top);
        b = Math.min(b, q.bottom);
        if (/auto|scroll/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1) rolls = true;
      }
    }
    if (rt - l < 1 || b - t < 1) continue; // scrolled out of its box
    if (b <= 0 || t >= H || rt <= 0 || l >= W) continue; // off the screen altogether, on its way in or out
    // Its size as laid out: a button squeezed a little while a thumb is on it is still its full size to tap.
    const [w, h] = [el.offsetWidth || r.width, el.offsetHeight || r.height];
    if (el.matches(buttons) && (w < 43.5 || h < 43.5))
      out.push(`${say(el)} is ${px(w)} × ${px(h)}: under 44 × 44`);
    // A row made to slide sideways may run past the edge; nothing else may.
    if (!slides && (r.left < -1 || r.right > W + 1))
      out.push(`${say(el)} runs off the side: ${px(r.left)} to ${px(r.right)} of ${W}`);
    // A list that rolls can be rolled out from under the bars; a fixed button cannot.
    if (!rolls && t < top - slop)
      out.push(`${say(el)} is under the top safe area: starts at ${px(t)}, safe from ${top}`);
    if (!rolls && b > H - bottom + slop)
      out.push(`${say(el)} is under the bottom safe area: ends at ${px(b)}, safe to ${H - bottom}`);
  }
  return out;
}

export class Kit {
  /**
   * @param {{ page: import("playwright-core").Page, phone: string, safe: { top: number, bottom: number },
   *           base: string, flow: string, shotsDir: string | null }} o
   */
  constructor(o) {
    Object.assign(this, o);
    /** @type {import("playwright-core").Page} */
    this.page = o.page;
    this.url = `${o.base}games/honey-hollow/index.html`;
    this.shots = [];
    /** Things wrong that do not stop the flow: layout, console, network. */
    this.problems = [];
    this.allowed = [];
    const page = o.page;
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => this.problem(`page error: ${String(e).slice(0, 300)}`));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning")
        this.problem(`console ${m.type()}: ${m.text().slice(0, 300)}`);
    });
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "";
      if (!why.includes("ERR_ABORTED"))
        this.problem(`request failed: ${this.short(r.url())} ${why}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) this.problem(`${r.status()} for ${this.short(r.url())}`);
    });
    page.on("request", (r) => {
      const u = r.url();
      if (!u.startsWith(o.base) && !/^(data|blob|about):/.test(u))
        this.problem(`asked the network for ${u.slice(0, 120)}`);
    });
  }

  short(url) {
    return url.replace(this.base, "/");
  }

  /** Note something wrong and carry on; the flow fails at its end. */
  problem(text) {
    if (this.allowed.some((re) => re.test(text))) return;
    if (!this.problems.includes(text)) this.problems.push(text);
  }

  /** Console lines this flow expects (a broken save being put aside, say). */
  allow(re) {
    this.allowed.push(re);
  }

  /** Stop the flow: something the game should have done, it did not. */
  expect(ok, what) {
    if (!ok) throw new Error(what);
  }

  eq(got, want, what) {
    if (!isDeepStrictEqual(got, want))
      throw new Error(
        `${what}: got ${JSON.stringify(got)?.slice(0, 200)}, wanted ${JSON.stringify(want)?.slice(0, 200)}`,
      );
  }

  // ───────── the page ─────────

  /** Put `entries` (key → string, as stored) in an empty localStorage, standing where the game is not running. */
  async profile(entries = {}) {
    await this.page.goto(this.base + BLANK.slice(1));
    await this.page.evaluate((e) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
    }, entries);
  }

  async boot(query = "") {
    await this.page.goto(this.url + query);
    await this.ready();
  }

  /** Leave and come back, as closing and opening the app does. The game saves as the page goes. */
  async reload() {
    await this.page.reload();
    await this.ready();
  }

  async ready() {
    await this.until(() => !!window.__hollow?.ready, null, "the game to start", 30000);
    await this.page.evaluate(() => window.__hollow.ready);
    await this.page.locator(SEL.loading).waitFor({ state: "hidden" });
  }

  /** Run `fn` in the page; `__hollow` is the game's test hook. */
  in(fn, arg) {
    return this.page.evaluate(fn, arg);
  }

  state() {
    return this.page.evaluate(() => window.__hollow.state);
  }

  ui() {
    return this.page.evaluate(() => {
      const u = window.__hollow.app.ui;
      return { scene: u.scene, sheet: u.sheet, mode: u.mode, plot: u.plot, selected: u.selected };
    });
  }

  settings() {
    return this.page.evaluate(() => ({ ...window.__hollow.app.settings }));
  }

  /** What is in storage under `key`, parsed; undefined if it will not parse. */
  stored(key) {
    return this.page.evaluate((k) => {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return undefined;
      }
    }, key);
  }

  /** Step the game through the hook. A refusal stops the flow. */
  async dispatch(action) {
    const events = await this.page.evaluate((a) => window.__hollow.dispatch(a), action);
    const no = events.find((e) => e.type === "rejected");
    if (no) throw new Error(`the game refused ${JSON.stringify(action)}: ${no.why}`);
    return events;
  }

  /** Swap in a whole position through the hook, and stand on `scene`. */
  async seed(state, scene = "meadow") {
    await this.page.evaluate(
      async ([s, scene]) => {
        const H = window.__hollow;
        H.state = s;
        await new Promise((ok) => setTimeout(ok, 60));
        if (H.app.ui.scene !== scene) await H.app.go(scene);
      },
      [state, scene],
    );
    await this.scene(scene);
  }

  async until(fn, arg, what, timeout = 12000) {
    try {
      await this.page.waitForFunction(fn, arg, { timeout });
    } catch (e) {
      if (!/Timeout/.test(String(e))) throw e;
      throw new Error(`waited ${timeout / 1000} s for ${what}`);
    }
  }

  /** Wait for a scene to be the one showing. */
  async scene(name, timeout = 15000) {
    await this.until(
      ([n, sel]) =>
        window.__hollow.app.ui.scene === n &&
        !!document.querySelector(sel) &&
        (n !== "meadow" ||
          !!window.__hollow.squareRect?.(window.__hollow.app.ui.plot ?? "home", 0, 0)),
      [name, SEL.scene(name)],
      `the ${name} scene`,
      timeout,
    );
  }

  /** Wait for a sheet to be up (or, with null, for none to be). */
  async sheet(name) {
    await this.until(
      ([n, body, any]) =>
        window.__hollow.app.ui.sheet === n &&
        (n
          ? !!document.querySelector(`${any} ${body}`)
          : !document.querySelector(".hh-sheet-wrap:not([inert])")),
      [name, name ? SEL.sheetBody(name) : "", SEL.sheet],
      name ? `the ${name} sheet` : "the sheet to close",
    );
  }

  /** Let anything that slides or fades finish, so a button is measured at rest. */
  async settle() {
    await this.page
      .waitForFunction(
        () =>
          document.getAnimations().every((a) => {
            const end = a.effect?.getComputedTiming().endTime;
            return a.playState !== "running" || end === Infinity || !Number.isFinite(Number(end));
          }),
        null,
        { timeout: 2500 },
      )
      .catch(() => {});
  }

  loc(target) {
    return typeof target === "string" ? this.page.locator(target).first() : target;
  }

  /** A button by its name, in `scope` (a selector) or anywhere. */
  button(name, scope = "body") {
    return this.page.locator(scope).getByRole("button", { name }).first();
  }

  /** A real tap: Playwright waits for the thing to be visible, still and on top. */
  async tap(target, what) {
    const loc = this.loc(target);
    try {
      await loc.tap({ timeout: 10000 });
    } catch (e) {
      throw new Error(
        `could not tap ${what ?? target}: ${String(e).split("\n").slice(0, 3).join(" ").slice(0, 300)}`,
      );
    }
  }

  async visible(target) {
    return this.loc(target).isVisible();
  }

  async text(target) {
    const t = await this.loc(target).innerText({ timeout: 4000 });
    return t.replace(/\s+/g, " ").trim();
  }

  /**
   * Whether the top bar's day chip says this season and day. A narrow phone
   * gets a short form, so only the season's first letters and the number are held to.
   */
  async saysDay(season, day) {
    const chip = await this.text(SEL.act("calendar"));
    const ok =
      chip.toLowerCase().startsWith(season.slice(0, 2).toLowerCase()) &&
      new RegExp(`\\b${day}\\b`).test(chip);
    this.expect(ok, `the top bar says "${chip}", not ${season} day ${day}`);
  }

  /** Where a square of the meadow is on the screen (the game's own squareRect). */
  async squareRect(plot, x, y) {
    const r = await this.page.evaluate(
      ([p, x, y]) => window.__hollow.squareRect(p, x, y),
      [plot, x, y],
    );
    this.expect(r && r.width > 0, `squareRect(${plot}, ${x}, ${y}) gave nothing`);
    return r;
  }

  /**
   * Squares of `plot` as [x, y] pairs: "plant:<flower>" where the core says
   * that seed can go, "hive" (or "hive:<id>" for one being moved) where a
   * hive can stand, "bed" where a bed is.
   */
  squares(plot, what) {
    return this.page.evaluate(
      ([plot, what]) => {
        const { core, state } = window.__hollow;
        const [kind, arg] = what.split(":");
        const out = [];
        for (let y = 0; y < 6; y++)
          for (let x = 0; x < 6; x++) {
            const ok =
              kind === "plant"
                ? core.canPlant(state, plot, x, y, arg)
                : kind === "hive"
                  ? core.canPlaceHive(state, plot, x, y, arg ? Number(arg) : undefined)
                  : state.land.plots[plot].squares[y * 6 + x]?.t === "bed";
            if (ok === true) out.push([x, y]);
          }
        return out;
      },
      [plot, what],
    );
  }

  /** What stands on a square in the state: a bed, a hive's reference, or null. */
  square(plot, x, y) {
    return this.page.evaluate(
      ([p, x, y]) => window.__hollow.state.land.plots[p].squares[y * 6 + x],
      [plot, x, y],
    );
  }

  async tapSquare(plot, x, y) {
    const r = await this.squareRect(plot, x, y);
    await this.page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  }

  /** A thumb dragged up or down the screen (touch events, as a phone sends them). */
  async swipe(x, fromY, toY, inside) {
    // A sheet takes no touch in its first moments: wait until the thumb would land in the list.
    if (inside)
      await this.until(
        ([x, y, sel]) => !!document.elementFromPoint(x, y)?.closest(sel),
        [x, fromY, inside],
        "the list to be under the thumb",
        3000,
      );
    const cdp = await this.page.context().newCDPSession(this.page);
    const at = (y) => [{ x: Math.round(x), y: Math.round(y) }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(fromY) });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: at(fromY + ((toY - fromY) * i) / 8),
      });
      await this.page.waitForTimeout(16);
    }
    // Hold still before lifting, and let the list come to rest: a tap on a list that is still gliding only stops it.
    await this.page.waitForTimeout(200);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await this.page.waitForTimeout(350);
  }

  /** A line for a failure report: which screen is up, and what is on it to tap. */
  async where() {
    return this.page
      .evaluate(() => {
        const u = window.__hollow?.app.ui;
        const names = [...document.querySelectorAll("button")]
          .filter(
            (b) =>
              !b.closest("[inert], [hidden]") &&
              b.getBoundingClientRect().width > 0 &&
              getComputedStyle(b).visibility !== "hidden",
          )
          .map(
            (b) =>
              (b.innerText || b.getAttribute("aria-label") || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 20) + (b.disabled ? " (off)" : ""),
          );
        const c = window.__hollow?.state.clock;
        return `scene ${u?.scene}, sheet ${u?.sheet ?? "none"}, day ${c?.day} ${c?.phase}; buttons: ${names.slice(-14).join(" | ")}`;
      })
      .catch(() => "the page could not be asked");
  }

  // ───────── checks ─────────

  /** The checks every screen must pass; what is wrong is noted against `where`. */
  async audit(where) {
    await this.settle();
    const found = await this.page.evaluate(lookOver, {
      ...this.safe,
      slop: 6, // a hit area may spill a few pixels past its painted button, never the button
      buttons: BUTTONS,
      fields: FIELDS,
    });
    for (const line of found) {
      // The same button is the same problem wherever it is seen.
      if (!this.problems.some((p) => p.endsWith(line)))
        this.problems.push(`at "${where}": ${line}`);
    }
  }

  /** A named screenshot (and the checks, on what it shows). */
  async snap(name) {
    await this.audit(name);
    if (!this.shotsDir) return;
    // JPEG: watercolour paper as PNG made the gallery over 100 MB a run.
    const file = `${this.phone}/${this.flow}-${name}.jpg`;
    mkdirSync(`${this.shotsDir}${this.phone}`, { recursive: true });
    await this.page.screenshot({ path: this.shotsDir + file, type: "jpeg", quality: 80 });
    this.shots.push(file);
  }

  // ───────── things several flows do ─────────

  /** Fly the day to its evening through the hook, fending off wasps on the way. */
  async flyToEvening() {
    for (let i = 0; i < 12; i++) {
      const s = await this.state();
      if (s.clock.phase !== "day") break;
      for (const h of s.hives.list)
        if (h.raid) await this.dispatch({ type: "fendWasps", hive: h.id });
      await this.dispatch({ type: "tick", n: 240 });
    }
    await this.until(() => window.__hollow.state.clock.phase === "evening", null, "the evening");
  }

  /** Tap a confirm card's answer: the yes on the right, or the no on the left. */
  async confirm(yes) {
    const any = this.page.locator(SEL.confirm).last();
    await any.waitFor({ state: "visible" });
    // Another card may follow this one (start again asks twice): hold on to this card, not "the card".
    const card = this.page.locator(
      `[aria-labelledby="${await any.getAttribute("aria-labelledby")}"]`,
    );
    const words = (await card.innerText()).replace(/\s+/g, " ").trim();
    const buttons = card.getByRole("button");
    await this.tap(
      yes ? buttons.last() : buttons.first(),
      `the ${yes ? "yes" : "no"} of "${words.slice(0, 40)}"`,
    );
    await card.waitFor({ state: "detached" });
    return words;
  }

  /** How many confirm cards are up. */
  confirms() {
    return this.page.locator(SEL.confirm).count();
  }

  /** Close the open sheet the way a player would: "cross", "scrim" or "escape". */
  async closeSheet(how = "cross") {
    if (how === "cross") await this.tap(SEL.sheetClose, "the sheet's cross");
    else if (how === "escape") {
      // Escape puts a keeper's note away first, if one is up; the sheet is the next press.
      const note = await this.page.locator(SEL.note).count();
      await this.page.keyboard.press("Escape");
      if (note) {
        await this.page.waitForTimeout(150);
        if ((await this.ui()).sheet) await this.page.keyboard.press("Escape");
      }
    } else {
      const top = await this.page.evaluate(
        (sel) => document.querySelector(sel)?.getBoundingClientRect().top,
        SEL.sheet,
      );
      const room = top - this.safe.top;
      this.expect(
        room >= 12,
        `only ${Math.round(room)}px of scrim shows above the sheet: nowhere to tap it shut`,
      );
      const at = [this.page.viewportSize().width / 2, this.safe.top + room / 2];
      // A sheet does not take a tap on its scrim in its first moments (the tap that opened it must not shut it).
      await this.until(
        ([x, y, sel]) => !!document.elementFromPoint(x, y)?.matches(sel),
        [...at, SEL.scrim],
        "the scrim to be what a tap above the sheet lands on",
        3000,
      );
      await this.page.touchscreen.tap(...at);
    }
    const up = (await this.ui()).sheet;
    try {
      await this.sheet(null);
    } catch {
      throw new Error(
        `the ${up} sheet did not close by ${how === "cross" ? "its cross" : how === "scrim" ? "a tap on the scrim" : "Escape"}`,
      );
    }
  }

  /** From the evening meadow: skip the stall, sleep, and wake on the next morning's meadow. */
  async skipAndSleep() {
    const day = (await this.state()).clock.day;
    await this.tap(SEL.act("skip"));
    await this.scene("night");
    await this.sleep(day);
  }

  /** From the night card: sleep, past the season card if the season turned, to `scene`. */
  async sleep(day, scene = "meadow") {
    await this.tap(this.button(NAME.sleep, SEL.scene("night")), "Sleep");
    await this.until(
      (d) => window.__hollow.state.clock.day === d + 1,
      day,
      `day ${day + 1} to begin`,
    );
    const morning = this.button(NAME.goodMorning, SEL.scene("night"));
    const moved = this.page
      .waitForFunction((n) => window.__hollow.app.ui.scene === n, scene)
      .catch(() => {});
    await Promise.race([morning.waitFor({ state: "visible" }).catch(() => {}), moved]);
    if (await morning.isVisible()) await this.tap(morning, "Good morning");
    await this.scene(scene);
  }

  /**
   * At the stall: sell the customer in front the first thing on the shelf,
   * and return what the Offer button promised and what happened.
   */
  async sellOne() {
    const before = await this.state();
    const item = this.page.locator(SEL.shelfItem).first();
    await this.tap(item, "the first thing on the shelf");
    const offer = this.button(NAME.offer, SEL.scene("stall"));
    const shown = Number((await this.text(offer)).match(/\d+/)[0]);
    await this.tap(offer, "Offer");
    await this.until((at) => window.__hollow.state.market.at > at, before.market.at, "the sale");
    const after = await this.state();
    const sale = after.market.queue[before.market.at].bought;
    return { shown, sale, got: after.purse.coins - before.purse.coins, before, after };
  }

  /** At the stall: let everyone else go, close up, and arrive at the night card. */
  async finishStall() {
    const here = SEL.scene("stall");
    for (let i = 0; i < 40; i++) {
      if ((await this.ui()).scene === "night") break;
      let tapped = false;
      for (const name of [
        NAME.closeStall,
        NAME.carryOn,
        NAME.nextCustomer,
        NAME.toCrate,
        NAME.nothing,
        NAME.openStall,
        NAME.onToStall,
      ]) {
        const b = this.button(name, here);
        if (!(await b.isVisible().catch(() => false))) continue;
        await b.tap({ timeout: 2000 }).catch(() => {});
        tapped = true;
        break;
      }
      await this.page.waitForTimeout(tapped ? 120 : 200);
    }
    await this.scene("night");
  }
}

/** All the jars of honey in stock. */
export const jars = (state) => Object.values(state.stock.honey).reduce((a, n) => a + n, 0);
