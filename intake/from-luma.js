// Option 1 of 2: start from a Luma link.
// Usage: node intake/from-luma.js https://lu.ma/abc123
// Writes shared/event.json, the file every other part reads from.

const fs = require("fs");
const path = require("path");
const { fetchLumaEvent } = require("./luma");

const EVENT_FILE = path.join(__dirname, "..", "shared", "event.json");

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.log("Give me a Luma link, like: node intake/from-luma.js https://lu.ma/abc123");
    process.exit(1);
  }
  const event = await fetchLumaEvent(input);
  fs.writeFileSync(EVENT_FILE, JSON.stringify(event, null, 2) + "\n");
  console.log(`Saved shared/event.json: "${event.name}" on ${event.date} at ${event.time}, ${event.venue}, ${event.guest_count} going.`);
}

main().catch((err) => { console.log("Could not read the Luma event. " + err.message); process.exit(1); });
