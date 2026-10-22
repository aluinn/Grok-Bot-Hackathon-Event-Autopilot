// Puts everything back to a clean start before recording a demo.
// Usage: node demo/reset.js
// It clears the last run (event, copy, sponsors, run sheet, page, newsletter, Mission Control) and puts
// aluinn's sample event back, so the Review tab still works while Grok Bot builds the new one.
// It does NOT touch Supabase, Cognee, the published website or anything that was sent.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const at = (rel) => path.join(ROOT, rel);
const remove = (rel) => fs.rmSync(at(rel), { recursive: true, force: true });

// 1. The sample event and copy go back into shared/
fs.copyFileSync(at("data/event.json"), at("shared/event.json"));
fs.copyFileSync(at("data/promo.json"), at("shared/promo.json"));

// 2. Forget the last run's outputs
for (const rel of [
  "autopilot/output",           // Mission Control's last run
  "event-page/output",          // the built page and its Supabase row
  "newsletter/output",
  "run-sheet/agenda.json",      // a custom agenda from save_run_sheet
  "sponsors/output/outreach",
]) remove(rel);

// 3. Rebuild the quick, offline parts for the sample so nothing looks broken
const run = (args) => spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
run(["sponsors/find.js", "--sample"]);
run(["run-sheet/build.js"]);
run(["promo-and-approval-ui/templates/render.js", "shared/event.json"]);

console.log("Reset done: Mission Control is idle and the sample event is back.");
console.log("Before recording, open the dashboard in a NEW private/incognito window (approvals are remembered per browser):");
console.log("  http://localhost:4010/launch.html");
