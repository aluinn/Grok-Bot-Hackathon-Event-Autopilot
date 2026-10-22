// Run the autopilot from the command line and print each agent's progress.
//   node autopilot/run.js "Healthcare hackathon in London on 5 Dec"   (or a Luma link)
//   node autopilot/run.js --production    (Grok Bot already wrote the event and the copy)
// Everything it makes is a draft for the dashboard; nothing is sent (CLAUDE.md rule 2).

const { runAutopilot } = require("./agents");

const args = process.argv.slice(2);
const production = args.includes("--production");
const input = args.filter((a) => a !== "--production").join(" ").trim();

if (!production && !input) {
  console.log('Give me a Luma link or one line of text, e.g. node autopilot/run.js "AI builders meetup, Shoreditch, 20 Nov, 6pm"');
  console.log("Or, if Grok Bot already wrote the event and copy: node autopilot/run.js --production");
  process.exit(1);
}

// Print one line each time an agent changes state
const lastState = {};
function report(status) {
  for (const a of status.agents) {
    if (lastState[a.id] === a.state) continue;
    lastState[a.id] = a.state;
    const detail = a.state === "done" ? a.summary : a.note;
    console.log(`[wave ${a.wave}] ${a.name}: ${a.state}${detail ? " - " + detail : ""}`);
  }
}

runAutopilot({ input, mode: production ? "production" : "full" }, report).then((status) => {
  const seconds = Math.round((new Date(status.finishedAt) - new Date(status.startedAt)) / 1000);
  const count = (s) => status.agents.filter((a) => a.state === s).length;
  const h = Math.floor(status.totalMinutesSaved / 60), m = status.totalMinutesSaved % 60;
  console.log(`\nFinished in ${seconds} s: ${count("done")} done, ${count("error")} errors, ${count("skipped")} skipped.`);
  console.log(`Time saved: ${status.totalMinutesSaved} minutes (${h} h ${m} min). Everything is a draft: review and approve in the dashboard.`);
});
