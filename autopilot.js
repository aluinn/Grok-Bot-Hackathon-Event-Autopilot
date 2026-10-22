// The one-command version: start from a Luma link OR one line of text, and build every draft.
//   node autopilot.js https://lu.ma/abc123
//   node autopilot.js "Healthcare Grok Bot hackathon in London, 5 Dec, 6pm"
//   node autopilot.js --production      (Grok Bot already wrote the event and the copy)
// The real work lives in autopilot/ (several agents run at once). Everything it makes is a draft
// for the dashboard; nothing is sent anywhere (CLAUDE.md rule 2).

if (!process.argv.slice(2).join(" ").trim()) {
  console.log('Give me a Luma link or one line of text, e.g. node autopilot.js "AI builders meetup, Shoreditch, 20 Nov, 6pm"');
  process.exit(1);
}
require("./autopilot/run");
