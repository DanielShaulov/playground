#!/usr/bin/env node
// Read a Ferment bug report (the "FERMENT-REPORT1." block a player emails in
// from Settings → Report a problem) and turn it back into something to debug.
//
//   node scripts/ferment-report.mjs <email.txt | -> [out-dir]
//
// Takes the whole email text (or just the block) from a file or stdin and
// prints a summary: build, device, day, recent taps, errors, and whether
// replaying the trail lands on the player's shop. With out-dir it writes
// report.json, start.json (the shop when the day began) and now.json (the
// shop when they reported). A browser flow or Playwright session can load
// either through window.__ferment.state = <json>.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { decodeReport, replayReport } from "../games/ferment/ui/report-code.js";
import { step } from "../games/ferment/core/index.js";

const [src, out] = process.argv.slice(2);
if (!src) {
  console.error("usage: node scripts/ferment-report.mjs <email.txt | -> [out-dir]");
  process.exit(2);
}
const report = await decodeReport(readFileSync(src === "-" ? 0 : src, "utf8"));
if (!report) {
  console.error("No readable FERMENT-REPORT1 block in that text (cut short or changed?).");
  process.exit(1);
}
const { matches } = replayReport(report, step);
const d = report.device ?? {};
const lines = [
  `when      ${report.when}`,
  `build     ${report.build?.sha ?? "?"}${report.build?.pr ? ` (PR #${report.build.pr})` : ""}`,
  `page      ${report.page}`,
  `device    ${d.w}x${d.h} @${d.dpr}x ${d.app ? "home-screen app" : "browser tab"}`,
  `          ${d.ua}`,
  `settings  ${JSON.stringify(report.settings)}`,
  `shop      day ${report.now?.clock?.day} ${report.now?.clock?.phase} hour ${report.now?.clock?.hour}, ${report.now?.shop?.coins} coins`,
  `trail     ${report.actions?.length ?? 0} actions from day ${report.start?.clock?.day} ${report.start?.clock?.phase}${report.restarted ? " (restarted mid-day: trail was long)" : ""}`,
  `replay    ${matches ? "lands exactly on the reported shop" : "DOES NOT match the reported shop (non-deterministic bug, or a different build)"}`,
  `taps      ${(report.taps ?? []).map((t) => t.act + (Object.keys(t.data).length ? JSON.stringify(t.data) : "")).join(" > ") || "none"}`,
  `errors    ${report.errors?.length ? "" : "none"}`,
  ...(report.errors ?? []).map(
    (e) => `  ${e.at} ${e.msg} ${e.where ?? ""}\n    ${(e.stack ?? "").split("\n").join("\n    ")}`,
  ),
];
console.log(lines.join("\n"));
if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${out}/start.json`, JSON.stringify(report.start));
  writeFileSync(`${out}/now.json`, JSON.stringify(report.now));
  console.log(`wrote ${out}/report.json, start.json, now.json`);
}
