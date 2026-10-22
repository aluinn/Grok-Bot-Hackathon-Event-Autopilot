// The one-command version: start from a Luma link OR one line of text, and build every draft.
//   node autopilot.js https://lu.ma/abc123
//   node autopilot.js "Healthcare Grok Bot hackathon in London, 5 Dec, 6pm"
// It runs the steps below in order. Everything it makes is a draft for the dashboard;
// nothing is sent anywhere (CLAUDE.md rule 2).

const { spawnSync } = require("child_process");
const path = require("path");

const input = process.argv.slice(2).join(" ").trim();
if (!input) {
  console.log('Give me a Luma link or one line of text, e.g. node autopilot.js "AI builders meetup, Shoreditch, 20 Nov, 6pm"');
  process.exit(1);
}

// A Luma link or code goes to from-luma.js; anything else is treated as an idea in words
const isLuma = /lu\.ma\//.test(input) || /^evt-[A-Za-z0-9]+$/.test(input);
const steps = [
  { name: isLuma ? "Read the Luma event" : "Turn the idea into an event (Grok)",
    cmd: isLuma ? ["intake/from-luma.js", input] : ["intake/from-text.js", input] },
  { name: "Write page copy, newsletter and posts (Grok)", cmd: ["copy-generator/generate.js"] },
  { name: "Render the visuals (Puppeteer)", cmd: ["visuals/render.js"] },
  { name: "Build the run sheet and calendar file", cmd: ["run-sheet/build.js"] },
  { name: "Find potential sponsors (Grok)", cmd: ["sponsors/find.js"], optional: true },
  { name: "Draft sponsor outreach emails (Grok)", cmd: ["sponsors/draft-outreach.js"], optional: true },
];

const started = Date.now();
for (const step of steps) {
  console.log(`\n== ${step.name}`);
  const result = spawnSync("node", step.cmd, { cwd: __dirname, stdio: "inherit" });
  if (result.status !== 0) {
    if (step.optional) { console.log("(skipped: this optional step did not finish)"); continue; }
    console.log(`\nStopped at "${step.name}". Fix the message above and run again.`);
    process.exit(1);
  }
}

console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)} s. Open the dashboard to review and approve: node ${path.join("promo-and-approval-ui", "dashboard", "server.js")}`);
