// A player coming back to a phone that has held the game before. Four ways
// that has gone wrong, or could:
//
// 0. What a phone showed on the day of release: the painted interface's file
//    missing, so plain buttons, a title in plain letters and no intro. The
//    game now fetches itself again and comes up painted.
// 1. A screen's file does not arrive. The game says so in plain words with
//    the reason, never "not built", offers to fetch the game again, and after
//    that the screen opens. Settings keeps the reason.
// 2. The phone brings back a page from an older release than the site now
//    serves (a tab from days ago). On a built copy of the site, where every
//    file's address carries its release, the page leaves for a fresh copy
//    before anything is shown, and every script and stylesheet of the fresh
//    one carries the new release.
// 3. A site that says one release and serves another's page, whatever is
//    asked: the game fetches itself again once, then plays what it has. A
//    phone must never go round in circles.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stamp } from "../../../../scripts/stamp-build.mjs";
import { serve } from "../serve.mjs";
import { SEL, NAME } from "../helpers.mjs";

export const name = "returning";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const NEWER = "c".repeat(40);
const mark = (sha) => sha.slice(0, 12);

/** A copy of the site as the deploy builds it, stamped with `sha`. */
function built(into, sha) {
  const dir = join(into, mark(sha));
  mkdirSync(join(dir, "games"), { recursive: true });
  cpSync(join(ROOT, "games/honey-hollow"), join(dir, "games/honey-hollow"), { recursive: true });
  cpSync(join(ROOT, "shared"), join(dir, "shared"), { recursive: true });
  for (const file of ["manifest.webmanifest", "icon.svg", "icon-180.png"])
    cpSync(join(ROOT, file), join(dir, file));
  stamp(dir, sha);
  return dir;
}

export async function run(t) {
  const { page } = t;

  // ───── 0. The interface's file is missing the first time ─────
  let missing = 1;
  await page.route(/\/ui\/art\/chrome\.js/, (route) =>
    missing-- > 0 ? route.abort("connectionfailed") : route.continue(),
  );
  t.allow(/request failed: .*chrome\.js/);
  t.allow(/Failed to load resource/);
  t.allow(/\[hollow\] the painted interface did not load/);
  await page.goto(t.url);
  await page.waitForURL(/[?&]v=/);
  await t.ready();
  await t.scene("title");
  t.expect(
    await page.evaluate(() => document.documentElement.classList.contains("hh-painted")),
    "the interface is in plain colours although the game fetched itself again",
  );
  t.expect(await t.loc(".hh-title__logo").isVisible(), "the title is not lettered in paint");
  await t.tap(SEL.act("new"));
  await t.scene("intro");
  await page.unroute(/\/ui\/art\/chrome\.js/);

  // ───── 1. A screen's file does not arrive ─────
  let down = true;
  await page.route(/\/ui\/scenes\/intro\.js/, (route) =>
    down ? route.abort("connectionfailed") : route.continue(),
  );
  t.allow(/request failed: .*intro\.js/);
  t.allow(/\[hollow\] scene "intro" did not load/);
  await t.boot();
  await t.scene("title");
  await t.tap(SEL.act("new"));
  const card = t.loc(SEL.confirm);
  await card.waitFor();
  const said = await card.innerText();
  t.expect(/did not open/i.test(said), `the card does not say the page did not open: "${said}"`);
  t.expect(/scene "intro": \S/.test(said), `the card does not give the reason: "${said}"`);
  const everything = await page.locator("body").innerText();
  t.expect(!/not built/i.test(everything), `the game still says "not built": "${said}"`);
  await t.snap("page-lost");
  down = false;
  await card.getByRole("button", { name: /^fetch it again$/i }).tap();
  await page.waitForURL(/[?&]v=/);
  await t.ready();
  await t.scene("title");
  t.expect(!/[?&]v=/.test(page.url()), `the address kept its mark: ${page.url()}`);
  await t.tap(SEL.act("new"));
  await t.scene("intro");
  await t.loc(SEL.introPage(1)).waitFor();
  const [kept] = (await t.stored("playground:honey-hollow:troubles")) ?? [];
  t.eq(kept?.what, 'scene "intro"', "what is kept of the trouble");
  await t.in(() => window.__hollow.app.go("title"));
  await t.scene("title");
  await t.tap(SEL.act("settings"));
  await t.loc(SEL.sheetBody("settings")).waitFor();
  const small = await t.text(`${SEL.sheetBody("settings")} .hh-set__trouble`);
  t.expect(
    /^Last trouble, .*scene "intro": \S/.test(small),
    `Settings does not say what last went wrong: "${small}"`,
  );
  await t.loc(`${SEL.sheetBody("settings")} .hh-set__trouble`).scrollIntoViewIfNeeded();
  await t.snap("settings-trouble");
  await t.tap(SEL.sheetClose);
  await page.unroute(/\/ui\/scenes\/intro\.js/);

  // ───── 2. A page from an older release, on a built copy of the site ─────
  const tmp = mkdtempSync(join(tmpdir(), "hollow-site-"));
  const site = await serve(built(tmp, OLD));
  let now = "the old release";
  try {
    const oldPage = readFileSync(join(tmp, mark(OLD), "games/honey-hollow/index.html"), "utf8");
    /** @type {string[]} every script and stylesheet asked of the site */
    let asked = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (r.url().startsWith(site.url) && /\.(js|css)$/.test(u.pathname)) asked.push(r.url());
    });
    const release = () => page.evaluate(async () => (await import("./ui/build.js")).BUILD);
    const unmarked = (m) => asked.filter((u) => !u.endsWith(`?v=${m}`)).map((u) => t.short(u));

    // The old release, as it was on the day: every file by its release's address.
    t.site(site.url);
    await t.profile();
    await t.boot();
    await t.scene("title");
    t.eq(await release(), mark(OLD), "the release the page says it is");
    await t.tap(SEL.act("new"));
    await t.scene("intro");
    // The warm-up asks for every screen a few seconds in.
    await t.until(
      () =>
        performance.getEntriesByType("resource").some((e) => /sheets\/workshop\.js/.test(e.name)),
      null,
      "the game to fetch every screen",
      20000,
    );
    t.expect(asked.length > 60, `only ${asked.length} scripts and stylesheets were asked for`);
    t.eq(unmarked(mark(OLD)), [], "files asked for without the release's mark");

    // The site moves on. The phone brings the old page back from its own
    // copy (a page asked for by its plain address gets the old one).
    site.use(built(tmp, NEW));
    now = "the new release";
    let fetches = 0;
    await page.route(
      (url) => url.href.startsWith(site.url) && /honey-hollow\/(index\.html)?$/.test(url.pathname),
      (route) => {
        const again = new URL(route.request().url()).searchParams.has("v");
        if (again) fetches++;
        return again && now === "the new release"
          ? route.continue()
          : route.fulfill({ contentType: "text/html", body: oldPage });
      },
    );
    asked = [];
    await page.goto(t.url);
    await page.waitForURL(/[?&]v=/);
    asked = [];
    await t.ready();
    await t.scene("title");
    t.eq(await release(), mark(NEW), "the release after the page fetched itself again");
    t.eq(fetches, 1, "times the page fetched itself again");
    t.expect(!/[?&]v=/.test(page.url()), `the address kept its mark: ${page.url()}`);
    t.eq(unmarked(mark(NEW)), [], "files of the fresh copy without the new release's mark");
    await t.tap(SEL.act("new"));
    await t.scene("intro");
    await t.snap("fresh-copy");

    // ───── 3. A site that says one release and serves another's page ─────
    site.use(built(tmp, NEWER));
    now = "a site that only ever serves the old page";
    fetches = 0;
    await page.goto(t.url);
    await page.waitForURL(/[?&]v=/);
    await t.ready();
    await t.scene("title");
    t.eq(fetches, 1, "times the page fetched itself again when that could not help");
    t.eq(await release(), mark(OLD), "the release it plays when no newer page can be had");
    await t.tap(SEL.act("new"));
    await t.scene("intro");
    await t.tap(t.button(NAME.turn, SEL.scene("intro")), "Turn the page");
    await t.loc(SEL.introPage(2)).waitFor();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    site.close();
    rmSync(tmp, { recursive: true, force: true });
  }
  return "a missing interface was fetched again and came up painted; a page that did not arrive was explained and fetched again; an old page left for the new release, once, and every file of the fresh copy carried its mark";
}

// The flow must go red if the game stops asking which release is out.
export const fault = {
  what: "the game never learns that a newer release is out",
  expect: /waiting for navigation|waitForURL|Timeout/i,
  install: (page) =>
    page.route(/\/build\.json/, (route) =>
      route.fulfill({ contentType: "application/json", body: '{ "sha": "dev" }' }),
    ),
};
