/**
 * The campaign in a real browser: New campaign from the title, a journey
 * tapped out on the map, a reload in the middle of it, Rest and Stop, the
 * tabs, brigands and wolves met on the road — then screenshots of each
 * campaign screen on both phones.
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
  partiesInSight,
} from "../../games/crownless/rules/world.js";
import { autoResolve, choices } from "../../games/crownless/rules/encounter.js";
import { wagesOf } from "../../games/crownless/rules/warband.js";
import { CAMPAIGN_V, makeCampaign } from "../../games/crownless/rules/campaign-save.js";
import { TERRAIN } from "../../games/crownless/rules/data/world.js";
import { neighbours } from "../../games/crownless/rules/hex.js";
import { mapLayout, cameraOn, hexScreen, toScreen } from "../../games/crownless/view/map-layout.js";
import { partyAt } from "../../games/crownless/view/map-view.js";

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

const payable = (p, s) => p.kind === "brigands" && choices(s).pay > 0;

/**
 * A round of the towns on seed 7 until a meeting `want` accepts; the hour
 * before it, and the meeting. Meetings it doesn't want are walked away from.
 * Setup: found with the rules.
 */
function hourBefore(want) {
  const s = newCampaign({ seed: 7, culture: "vale", background: "sellsword" });
  const realm = realmOf(s);
  const towns = realm.places.filter((p) => p.kind === "town" || p.kind === "castle");
  let k = 0;
  for (let h = 0; h < 24 * 120; h++) {
    if (!busy(s)) travelTo(s, towns[k++ % towns.length].i);
    const before = structuredClone(s);
    advance(s);
    if (!s.encounter) continue;
    const party = s.parties.find((p) => p.id === s.encounter.party);
    if (want(party, s)) return { before, met: s, party };
    s.truce[party.id] = s.t + 6;
    s.encounter = null;
  }
  return null;
}

/** Where a party's shield is drawn, standing where `s` has it, the camera on you. */
function shieldAt(s, party, L) {
  const realm = realmOf(s);
  const cam = cameraOn(L, realm.grid, s.player.at.i);
  const w = partyAt(realm, party.at, L.R);
  return toScreen(L, cam, w.x, w.y - 3);
}

/** The first time a party comes into sight and stops you on seed 7 (setup). */
function inSight() {
  const s = newCampaign({ seed: 7, culture: "vale", background: "sellsword" });
  const realm = realmOf(s);
  const towns = realm.places.filter((p) => p.kind === "town" || p.kind === "castle");
  let k = 0;
  for (let h = 0; h < 24 * 120; h++) {
    if (s.encounter) {
      s.truce[s.encounter.party] = s.t + 6;
      s.encounter = null;
    }
    if (!busy(s)) travelTo(s, towns[k++ % towns.length].i);
    const ev = advance(s);
    const pt = partiesInSight(s)[0];
    if (!busy(s) && !s.encounter && pt && ev.some((e) => e.k === "spotted")) return { s, pt };
  }
  return null;
}

/**
 * You on seed 7, walked to `place` (so the map around it is explored) with
 * nobody else on the map, then given `troops` and `gold`. Setup.
 */
function standing(place, troops, gold = 500) {
  const s = newCampaign({ seed: 7, culture: "vale", background: "sellsword" });
  for (let k = 0; k < 10 && (s.player.at.i !== place.i || s.player.at.to >= 0); k++) {
    s.parties = [];
    s.encounter = null;
    s.result = null;
    travelTo(s, place.i);
    playOut(s);
  }
  s.parties = [];
  s.spotted = [];
  s.player.party.troops = troops.map(([type, n, xp = 0, wounded = 0]) => ({
    type,
    n,
    xp,
    wounded,
  }));
  s.player.gold = gold;
  return s;
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

  console.log("\n# Brigands and wolves\n");
  // A band that comes for you, and what the sheet lets you do about it.
  const hunt = hourBefore(payable);
  await seedCampaign(game, makeCampaign(hunt.before));
  await continueBtn(page).tap();
  const sheetE = page.getByRole("dialog", { name: "Encounter" });
  await sheetE.waitFor({ timeout: 10000 });
  const metSave = await readSave(page);
  check(
    `travelling on, ${hunt.party.name} catch you: the sheet opens and the meeting is saved`,
    metSave.encounter?.party === hunt.party.id &&
      metSave.encounter.by === "them" &&
      metSave.t === hunt.met.t &&
      (await sheetE.textContent()).includes(hunt.party.name),
    `t ${metSave.t}`,
  );
  await page.waitForFunction(
    () => /\(\d of 8\)/.test(document.querySelector(".cl-odds")?.textContent ?? ""),
    null,
    { timeout: 10000 },
  );
  check(
    "the odds come in from eight auto-resolves",
    /^Odds: \w+ \(\d of 8\)/.test(await page.locator(".cl-odds").textContent()),
    await page.locator(".cl-odds").textContent(),
  );
  const pay = choices(hunt.met).pay;
  check(
    `it offers Pay ${pay}, a rearguard (they're as fast as you) and Auto`,
    (await game.can(`Pay ${pay}`)) && (await game.can("Rearguard")) && (await game.can("Auto ▶")),
  );
  await page.reload({ waitUntil: "load" });
  await settle(400);
  await continueBtn(page).tap();
  await settle(500);
  check(
    "a reload brings the meeting back, still waiting on you",
    (await sheetE.count()) === 1 &&
      JSON.stringify(await readSave(page)) === JSON.stringify(metSave),
  );
  await press(`Pay ${pay}`, 400);
  const paid = await readSave(page);
  check(
    `Pay: ${pay} gold gone, the band leaves you be for 3 days, the map back`,
    paid.player.gold === hunt.met.player.gold - pay &&
      paid.paid[hunt.party.id] === hunt.met.t + 72 &&
      !paid.encounter &&
      (await sheetE.count()) === 0 &&
      (await page.locator(".cl-ctx").count()) === 1,
  );

  // Auto-resolve: the browser's fight is Node's fight.
  await seedCampaign(game, makeCampaign(hunt.met));
  await continueBtn(page).tap();
  await sheetE.waitFor({ timeout: 5000 });
  await press("Auto ▶", 500);
  const fought = await readSave(page);
  const node = structuredClone(hunt.met);
  const expect = autoResolve(node);
  const sheetR = page.locator(".cl-sheet");
  check(
    `Auto ▶: the fight is the one Node fights (${expect.kind}), and its result waits on screen`,
    JSON.stringify(fought.result) === JSON.stringify(expect) &&
      (await sheetR.textContent()).includes(
        expect.kind === "lost" ? "Defeat" : expect.kind === "won" ? "Victory" : "draw",
      ),
    `${expect.kind}: ${expect.killed} of yours killed`,
  );
  await page.reload({ waitUntil: "load" });
  await settle(400);
  await continueBtn(page).tap();
  await settle(400);
  check(
    "a reload keeps the result on screen",
    (await page.getByRole("button", { name: "Continue", exact: true }).count()) === 1,
  );
  await press("Continue", 400);
  const after = await readSave(page);
  delete after.v;
  node.result = null;
  check(
    "Continue: back on the map, the save exactly Node's",
    JSON.stringify(after) === JSON.stringify(node) && (await page.locator(".cl-ctx").count()) === 1,
  );
  await press("Log", 300);
  check(
    "the Log tells of the fight",
    (await page.getByRole("dialog", { name: "Log" }).textContent()).includes(hunt.party.name),
  );
  await press("Log", 200);

  // A party in sight: its card, and Attack.
  const look = inSight();
  await seedCampaign(game, makeCampaign(look.s));
  await continueBtn(page).tap();
  await settle(700);
  const at = shieldAt(look.s, look.pt, L);
  await game.tap(at.x, at.y);
  await settle(300);
  const card = await ctxText(page);
  check(
    `a tap on ${look.pt.name}'s shield shows its card, with Attack`,
    card.title === look.pt.name &&
      card.sub.startsWith(`${look.pt.troops.reduce((m, t) => m + t.n, 0)} men`) &&
      (await game.can("Attack ▶")),
    `${card.title} · ${card.sub}`,
  );
  await press("Attack ▶", 100);
  const chasing = await readSave(page);
  check(
    "Attack: you go after it",
    chasing.player.chase === look.pt.id || chasing.encounter?.party === look.pt.id,
  );

  console.log("\n# The warband: recruit, upgrade, wages\n");
  // Recruit at the village you start in.
  await seedCampaign(game, makeCampaign(s0));
  await continueBtn(page).tap();
  await settle(500);
  await press("Visit ▶", 300);
  const place = page.getByRole("dialog", { name: "Place" });
  check(
    `Visit opens ${startB.name}: 12 levies at 10 gold, room for 10`,
    (await place.count()) === 1 &&
      (await place.textContent()).includes("12 here · 10 gold each") &&
      (await game.can("+10")),
  );
  await press("+10", 300);
  const hired = await readSave(page);
  const levies = hired.player.party.troops.find((t) => t.type === "vale:levy");
  check(
    "+10: ten levies join, 100 gold paid, 2 left in the village, all in the save",
    levies?.n === 22 &&
      hired.player.gold === s0.player.gold - 100 &&
      hired.stock[startB.id]?.["vale:levy"] === 2 &&
      (await place.textContent()).includes("2 here"),
  );
  await press("Back", 200);

  // Upgrade at a town: levies with the XP for it become militia.
  const town = realmB.places.find((p) => p.kind === "town" && p.culture === "vale");
  const atTown = standing(town, [["vale:levy", 12, 240]], 500);
  await seedCampaign(game, makeCampaign(atTown));
  await continueBtn(page).tap();
  await settle(500);
  await press("Army", 300);
  check(
    "the Army sheet: 12 levies, all 12 ready to train, ▲ Militia ×12",
    (await page.getByRole("dialog", { name: "Army" }).textContent()).includes("12 of 12 ready") &&
      (await game.can("▲ Militia ×12")),
  );
  await press("▲ Militia ×12", 300);
  const trained = await readSave(page);
  check(
    "▲ Militia ×12: twelve militia, 240 gold paid, the XP spent",
    JSON.stringify(trained.player.party.troops) ===
      JSON.stringify([{ type: "vale:militia", n: 12, xp: 0, wounded: 0 }]) &&
      trained.player.gold === 260,
  );
  await press("Army", 200);
  await press("Visit ▶", 300);
  await press("+1", 300); // the first +1 is the town's militia
  await page
    .getByRole("dialog", { name: "Place" })
    .getByRole("button", { name: "+5", exact: true })
    .tap();
  await settle(300);
  const shopped = await readSave(page);
  check(
    "at the town: a militia recruit for 30, and the market's 5 iron for 150",
    shopped.player.party.troops[0].n === 13 &&
      shopped.player.iron === 5 &&
      shopped.player.gold === 80,
    `gold ${shopped.player.gold}, iron ${shopped.player.iron}`,
  );

  // The week's turn: wages leave, the hour before midnight on day 7.
  const payday = standing(startB, [["vale:levy", 22]], 300);
  payday.t = 167;
  await seedCampaign(game, makeCampaign(payday));
  await continueBtn(page).tap();
  await settle(400);
  await press("Visit ▶", 300);
  await press("Rest here", 100);
  await waitStill(page);
  const paidDay = await readSave(page);
  const week = paidDay.journal.find((e) => e.k === "week");
  check(
    `resting through the week's turn: ${wagesOf(payday.player)} gold in wages leaves, and the Journal says so`,
    week?.due === 22 && week.paid === 22 && week.t === 168 && paidDay.player.gold === 278,
    `gold ${paidDay.player.gold}`,
  );
  await press("Log", 300);
  check(
    "the Log: the week's wages",
    (await page.getByRole("dialog", { name: "Log" }).textContent()).includes(
      "The week's wages: 22 of 22 gold paid.",
    ),
  );
  await press("Log", 200);

  // Prisoners sold at a town's broker.
  const broker = standing(town, [["vale:militia", 10]], 100);
  broker.player.party.prisoners = [{ type: "militia", n: 6, since: broker.t }];
  await seedCampaign(game, makeCampaign(broker));
  await continueBtn(page).tap();
  await settle(400);
  await press("Visit ▶", 300);
  await press("Sell · 60", 300);
  const sold = await readSave(page);
  check(
    "the ransom broker buys 6 brigands for 60",
    sold.player.gold === 160 && sold.player.party.prisoners.length === 0,
  );
  await press("Back", 200);

  // Taken: the days pass on their own, and you're let go.
  const taken = standing(startB, [], 500);
  taken.player.captive = { by: "Brigands of the Test", until: taken.t + 30, ransom: true };
  const nodeFree = playOut(structuredClone(taken));
  await seedCampaign(game, makeCampaign(taken));
  await continueBtn(page).tap();
  await settle(200);
  check(
    "held: the bar says by whom and until when, and the hours run",
    (await ctxText(page)).title === "Held by Brigands of the Test",
  );
  await page.waitForFunction((k) => !JSON.parse(localStorage.getItem(k)).player.captive, KEY, {
    timeout: 15000,
  });
  await settle(300);
  const free = await readSave(page);
  delete free.v;
  check(
    "…then you're ransomed for a fifth of your gold, as in Node",
    JSON.stringify(free) === JSON.stringify(nodeFree) && free.player.gold === 400,
    `gold ${free.player.gold}`,
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
  const look = inSight();
  await seedCampaign(game, makeCampaign(look.s));
  await continueBtn(page).tap();
  await settle(700);
  const at = shieldAt(look.s, look.pt, L);
  await game.tap(at.x, at.y);
  await settle(300);
  await shot("party");
  const hunt = hourBefore(payable);
  await seedCampaign(game, makeCampaign(hunt.met));
  await continueBtn(page).tap();
  await page.waitForFunction(
    () => /\(\d of 8\)/.test(document.querySelector(".cl-odds")?.textContent ?? ""),
    null,
    { timeout: 10000 },
  );
  await shot("encounter");
  await press("Auto ▶", 500);
  await shot("result");
  const realm = realmOf(s0);
  const town = realm.places.find((p) => p.kind === "town" && p.culture === "vale");
  const shop = standing(
    town,
    [
      ["vale:militia", 10, 400, 3],
      ["vale:levy", 6, 60],
      ["vale:bowman", 4, 0],
    ],
    420,
  );
  shop.player.party.prisoners = [
    { type: "militia", n: 4, since: shop.t - 100 },
    { type: "squire", n: 2, since: shop.t },
  ];
  await seedCampaign(game, makeCampaign(shop));
  await continueBtn(page).tap();
  await settle(500);
  await press("Visit ▶", 400);
  await shot("town");
  await press("Back", 200);
  await press("Army", 400);
  await shot("warband");
  await press("Army", 200);
  const held = standing(realm.places[realm.starts.vale], [], 500);
  held.player.captive = { by: "Brigands of the Test", until: held.t + 24 * 6, ransom: false };
  await seedCampaign(game, makeCampaign(held));
  await continueBtn(page).tap();
  await settle(600);
  await shot("held");
  check(
    `${device}: every button at least 44 px and on screen`,
    problems.length === 0,
    problems.slice(0, 4).join("; "),
  );
  check(`${device}: the console stayed clean`, game.errors.length === 0, game.errors.join(" | "));
  await game.close();
}

process.exit(report.finish() ? 1 : 0);
