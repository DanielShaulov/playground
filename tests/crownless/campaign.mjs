/**
 * The campaign in a real browser: New campaign from the title, a journey
 * tapped out on the map, a reload in the middle of it, Rest and Stop, the
 * tabs — then screenshots of each campaign screen on both phones.
 *
 *     npm start                      # then, in another terminal:
 *     npm run test:crownless:campaign
 *
 * The contract is harness.mjs's: taps in, `localStorage` out. The campaign
 * keeps its own key (`playground:crownless:campaign`) and, like the battle,
 * is the state the rules hold. The map is a canvas, tapped where
 * view/map-layout.js puts a hex for the game itself. A journey's expected
 * end is the same journey played in Node without a break: the browser, its
 * reload included, must land on exactly that state.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, createReport, URL } from "./harness.mjs";
import {
  newCampaign,
  realmOf,
  route,
  travelTo,
  busy,
  advance,
  explored,
  dayOf,
  hourOf,
} from "../../games/crownless/rules/world.js";
import { CAMPAIGN_V, makeCampaign } from "../../games/crownless/rules/campaign-save.js";
import { TERRAIN } from "../../games/crownless/rules/data/world.js";
import { neighbours } from "../../games/crownless/rules/hex.js";
import { mapLayout, cameraOn, hexScreen } from "../../games/crownless/view/map-layout.js";

const KEY = "playground:crownless:campaign";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
await mkdir(OUT, { recursive: true });
const report = createReport();
const { check } = report;

/** Play a state on until time stops, as the game's loop does an hour at a time. */
function playOut(s) {
  for (let k = 0; k < 24 * 30 && busy(s); k++) advance(s);
  return s;
}

/** What the context bar calls hex i before you go there (no place on it). */
function nameOf(s, i) {
  return explored(s)(i) ? TERRAIN[realmOf(s).terrain[i]].name : "Unexplored";
}

/**
 * A hex on screen with nothing on it that is `lo`–`hi` hours away and is
 * reached without stopping on the way. Setup: found with the rules.
 */
function targetOnScreen(s, L, lo, hi) {
  const realm = realmOf(s);
  const cam = cameraOn(L, realm.grid, s.player.at.i);
  let best = null;
  for (let i = 0; i < realm.grid.n; i++) {
    if (realm.placeAt[i] >= 0) continue;
    const p = hexScreen(L, cam, realm.grid, i);
    if (p.x < 30 || p.x > L.W - 30 || p.y < 80 || p.y > L.viewH - 30) continue;
    const r = route(s, i, realm);
    if (!r || r.hours < lo || r.hours > hi) continue;
    const end = structuredClone(s);
    travelTo(end, i);
    playOut(end);
    if (end.player.at.i !== i) continue; // a watchtower on the way would stop you
    if (!best || r.hours > best.r.hours) best = { i, r, p, end };
  }
  return best;
}

async function seedCampaign(game, save) {
  const { page } = game;
  // Leave the game first: an open campaign saves itself on the way out.
  await page.goto("about:blank");
  await page.goto(URL, { waitUntil: "load" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, save]);
  await page.reload({ waitUntil: "load" });
  await game.settle(400);
}

const readSave = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const waitStill = (page, ms = 15000) =>
  page.waitForFunction(
    (k) => {
      const s = JSON.parse(localStorage.getItem(k));
      return s && s.player.dest < 0 && !s.player.resting;
    },
    KEY,
    { timeout: ms },
  );
const ctxText = (page) =>
  page.evaluate(() => ({
    title: document.querySelector(".cl-ctx-title")?.textContent ?? "",
    sub: document.querySelector(".cl-ctx-sub")?.textContent ?? "",
  }));
const hudText = (page) => page.evaluate(() => document.querySelector(".hud")?.textContent ?? "");
const goEnabled = (page) =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Go ▶");
    return !!b && b.getAttribute("aria-disabled") !== "true";
  });
const continueBtn = (page) => page.getByRole("button", { name: /^Continue campaign/ });

// ---------------------------------------------------------------------------
// Play, on an iPhone 13
// ---------------------------------------------------------------------------

{
  const game = await openGame();
  const { page, settle, press } = game;
  const L = mapLayout(game.rect.width, game.rect.height);

  console.log("\n# New campaign\n");
  check(
    "a fresh title offers New campaign and no campaign to continue",
    (await game.can("New campaign")) && (await continueBtn(page).count()) === 0,
  );
  await press("New campaign", 500);
  const sheet = page.getByRole("dialog", { name: "New campaign" });
  await sheet
    .getByRole("group", { name: "Home culture" })
    .getByRole("button", { name: /^Fenreach/ })
    .tap();
  await sheet
    .getByRole("group", { name: "Background" })
    .getByRole("button", { name: /^Outlaw/ })
    .tap();
  await settle(300);
  check("nothing is saved until you begin", (await readSave(page)) === null);
  await press("Begin ▶", 500);
  const begun = await readSave(page);
  const realmA = begun && realmOf(begun);
  const startA = realmA && realmA.places[realmA.starts.fen];
  check(
    "Begin saves day 1, 08:00 at a Fenreach village: an outlaw with 400 gold and Scouting",
    begun?.v === CAMPAIGN_V &&
      begun.t === 8 &&
      begun.player.culture === "fen" &&
      begun.player.background === "outlaw" &&
      begun.player.gold === 400 &&
      begun.player.hero.scouting === 1 &&
      begun.player.at.i === startA?.i,
    begun && `seed ${begun.seed}`,
  );
  check("the HUD reads Day 1 · 08:00", (await hudText(page)).includes("Day 1 · 08:00"));
  check(
    "the context bar names the village you stand in",
    (await ctxText(page)).title === startA?.name,
    (await ctxText(page)).title,
  );

  // One step: tap a neighbouring hex, Go, and arrive.
  const camA = cameraOn(L, realmA.grid, begun.player.at.i);
  const step = neighbours(realmA.grid, begun.player.at.i).find(
    (j) => realmA.placeAt[j] < 0 && route(begun, j),
  );
  const sp = hexScreen(L, camA, realmA.grid, step);
  await game.tap(sp.x, sp.y);
  await settle(300);
  const picked = await ctxText(page);
  check(
    "a tap on the next hex shows it, how far, and an open Go",
    picked.title === nameOf(begun, step) &&
      /^\d+ h away$/.test(picked.sub) &&
      (await goEnabled(page)),
    `${picked.title} · ${picked.sub}`,
  );
  await press("Go ▶", 100);
  await waitStill(page);
  const stepped = await readSave(page);
  check(
    `Go: you arrive in the hour promised (${picked.sub})`,
    stepped.player.at.i === step && stepped.t === 8 + parseInt(picked.sub, 10),
    `t ${stepped.t}`,
  );

  console.log("\n# A journey, and a reload in the middle of it\n");
  const s0 = newCampaign({ seed: 7, culture: "vale", background: "sellsword" });
  const realmB = realmOf(s0);
  const startB = realmB.places[realmB.starts.vale];
  const target = targetOnScreen(s0, L, 14, 40);
  await seedCampaign(game, makeCampaign(s0));
  check(
    "the title offers the campaign: Continue campaign — day 1",
    (await continueBtn(page).count()) === 1 &&
      (await continueBtn(page).textContent()) === "Continue campaign — day 1",
  );
  await continueBtn(page).tap();
  await settle(500);
  check("Continue opens the map where you stood", (await ctxText(page)).title === startB.name);
  await game.tap(target.p.x, target.p.y);
  await settle(300);
  const shown = await ctxText(page);
  const hours = Math.max(1, Math.ceil(target.r.hours));
  check(
    `the bar shows where you'd go and how long: ${nameOf(s0, target.i)}, ${hours} h`,
    shown.title === nameOf(s0, target.i) && shown.sub === `${hours} h away`,
    `${shown.title} · ${shown.sub}`,
  );
  await press("Go ▶", 450);
  await page.reload({ waitUntil: "load" });
  await settle(400);
  const mid = await readSave(page);
  check(
    "a reload mid-journey keeps it: on the road, part of the way there",
    mid.player.dest === target.i && mid.t > 8 && mid.t < target.end.t,
    `t ${mid.t} of ${target.end.t}`,
  );
  check(
    `the title offers it back on day ${dayOf(mid.t)}`,
    (await continueBtn(page).textContent()) === `Continue campaign — day ${dayOf(mid.t)}`,
  );
  await continueBtn(page).tap();
  await settle(200);
  check("Continue picks the journey up", (await ctxText(page)).title.startsWith("To "));
  await waitStill(page);
  const done = await readSave(page);
  delete done.v;
  check(
    "it ends exactly where the unbroken journey ends: same hex, hour, sight and Journal",
    JSON.stringify(done) === JSON.stringify(target.end),
    `t ${done.t} at ${done.player.at.i}; Node: t ${target.end.t} at ${target.end.player.at.i}`,
  );

  console.log("\n# Rest and Stop\n");
  // From 23:00 morning is 7 hours off, under a second: Stop goes in at once.
  await press("Rest", 30);
  check("Rest makes camp", (await ctxText(page)).title === "Resting");
  await press("Stop", 400);
  const broke = await readSave(page);
  check(
    "Stop breaks camp at once, and says so in the save",
    !broke.player.resting && !busy(broke) && broke.t >= done.t && broke.t < done.t + 7,
    `t ${broke.t}`,
  );
  await press("Rest", 100);
  await waitStill(page);
  const morning = await readSave(page);
  check(
    "left alone, the rest lasts until 06:00",
    hourOf(morning.t) === 6 && morning.t > broke.t && morning.t - broke.t <= 24,
    `t ${morning.t}`,
  );

  console.log("\n# A tap on the road\n");
  const far = targetOnScreen(morning, L, 10, 60);
  await game.tap(far.p.x, far.p.y);
  await settle(250);
  await game.tap(far.p.x, far.p.y);
  await settle(100);
  const going = await readSave(page);
  check("a second tap on the chosen hex sets off", going.player.dest === far.i);
  await settle(350);
  await game.tap(L.W / 2, L.viewH / 3);
  await waitStill(page);
  await settle(200);
  const halted = await readSave(page);
  check(
    "a tap on the map while travelling stops you at the next hex",
    halted.player.at.to === -1 &&
      halted.player.at.i !== far.i &&
      halted.t > morning.t &&
      halted.t < far.end.t,
    `t ${halted.t}`,
  );
  check(
    "…and picks the hex you tapped, with Go to go on there",
    (await page.getByRole("button", { name: "Go ▶", exact: true }).count()) === 1,
  );

  console.log("\n# Tabs\n");
  await press("Army", 300);
  check(
    "Army: 12 of a limit of 22",
    (await page.getByRole("dialog", { name: "Army" }).textContent()).includes("Army · 12 / 22"),
  );
  await press("Log", 300);
  const log = await page.getByRole("dialog", { name: "Log" }).textContent();
  check(
    "Log: the Journal, from setting out to arriving",
    log.includes(`You set out from ${startB.name}.`) && log.includes("Found "),
  );
  await press("Menu", 300);
  await press("Title screen", 400);
  const left = await readSave(page);
  check(
    "Menu → Title screen saves and offers the campaign back",
    (await continueBtn(page).textContent()) === `Continue campaign — day ${dayOf(left.t)}` &&
      left.t === halted.t,
  );

  console.log("\n# Replacing a campaign\n");
  const before = JSON.stringify(await readSave(page));
  await press("New campaign", 500);
  check(
    "New campaign warns that it replaces the one in progress",
    (await page.getByRole("dialog", { name: "New campaign" }).textContent()).includes(
      `This replaces your campaign on day ${dayOf(left.t)}.`,
    ),
  );
  await press("Back", 400);
  check(
    "Back leaves the campaign untouched",
    JSON.stringify(await readSave(page)) === before && (await continueBtn(page).count()) === 1,
  );
  await seedCampaign(game, { ...makeCampaign(s0), v: CAMPAIGN_V + 1 });
  check(
    "a save from another version isn't offered; New campaign is",
    (await continueBtn(page).count()) === 0 && (await game.can("New campaign")),
  );

  check("the console stayed clean", game.errors.length === 0, game.errors.join(" | "));
  await game.close();
}

// ---------------------------------------------------------------------------
// Screenshots, on both phones
// ---------------------------------------------------------------------------

console.log("\n# Screens (written to tests/crownless/shots/)\n");
/** Every visible button: at least 44 px each way, and wholly on screen. */
async function badButtons(page) {
  return page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const box = b.closest(".cl-body")?.getBoundingClientRect();
      if (box && (r.bottom <= box.top + 1 || r.top >= box.bottom - 1)) continue;
      const text = (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 24);
      if (r.height < 43.5 || r.width < 43.5)
        out.push(`${text}: ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)
        out.push(`${text}: off screen`);
    }
    return out;
  });
}

for (const device of ["iPhone 13", "iPhone SE"]) {
  const label = device.replace(/\s+/g, "-").toLowerCase();
  const game = await openGame({ device });
  const { page, press, settle } = game;
  const L = mapLayout(game.rect.width, game.rect.height);
  const problems = [];
  const shot = async (name) => {
    await page.screenshot({ path: join(OUT, `campaign-${name}-${label}.png`) });
    for (const b of await badButtons(page)) problems.push(`${name}: ${b}`);
  };

  const s0 = newCampaign({ seed: 7, culture: "vale", background: "sellsword" });
  await press("New campaign", 600);
  await shot("new");
  await seedCampaign(game, makeCampaign(s0));
  await shot("title");
  await continueBtn(page).tap();
  await settle(700);
  await shot("map");
  const t = targetOnScreen(s0, L, 6, 60);
  await game.tap(t.p.x, t.p.y);
  await settle(300);
  await shot("pick");
  await press("Go ▶", 900);
  await shot("travel");
  await waitStill(page);
  await settle(600);
  await press("Map", 400);
  await shot("overview");
  await press("Map", 300);
  for (const tab of ["Army", "Log", "Menu"]) {
    await press(tab, 300);
    await shot(tab.toLowerCase());
  }
  check(
    `${device}: every button at least 44 px and on screen`,
    problems.length === 0,
    problems.slice(0, 4).join("; "),
  );
  check(`${device}: the console stayed clean`, game.errors.length === 0, game.errors.join(" | "));
  await game.close();
}

process.exit(report.finish() ? 1 : 0);
