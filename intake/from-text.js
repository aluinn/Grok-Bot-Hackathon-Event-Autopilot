// Option 2 of 2: start from one line of text.
// Usage: node intake/from-text.js "I want to run a Healthcare Grok Bot hackathon in London on 5 Dec, 6pm, at Huckletree"
// Grok turns the idea into a full event, with sensible guesses for anything you left out. You can
// edit shared/event.json afterwards. Nothing is sent anywhere.

const fs = require("fs");
const path = require("path");
const { askGrokForJson } = require("../copy-generator/grok");

const EVENT_FILE = path.join(__dirname, "..", "shared", "event.json");

const SYSTEM = `You help community event leads. Turn a short event idea into a complete event record.
Reply with JSON only, exactly these keys:
{"name": string, "date": "YYYY-MM-DD", "time": "HH:MM" (24h), "venue": string, "description": string, "hosts": [string], "guest_count": number}
Rules: keep the name short and punchy (under 60 characters). If the date is missing, pick a weekday evening 3 to 5 weeks after today.
If the time is missing use 18:30. If the venue is missing write "Venue to be confirmed". If hosts are missing use [].
If guest_count is missing use 0. The description is 2 or 3 warm, plain sentences: what happens, who it is for, why come.`;

async function main() {
  const idea = process.argv.slice(2).join(" ").trim();
  if (!idea) {
    console.log('Describe the event in one line, like: node intake/from-text.js "AI builders meetup in Shoreditch, 20 Nov, 6pm"');
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const event = await askGrokForJson({ system: SYSTEM, user: `Today is ${today}. Event idea: ${idea}` });

  // Make sure every field exists, even if Grok skipped one
  const clean = {
    name: String(event.name || idea).slice(0, 80),
    date: event.date || today,
    time: event.time || "18:30",
    venue: event.venue || "Venue to be confirmed",
    description: event.description || "",
    hosts: Array.isArray(event.hosts) ? event.hosts : [],
    guest_count: Number(event.guest_count) || 0,
  };
  fs.writeFileSync(EVENT_FILE, JSON.stringify(clean, null, 2) + "\n");
  console.log(`Saved shared/event.json: "${clean.name}" on ${clean.date} at ${clean.time}, ${clean.venue}.`);
}

main().catch((err) => { console.log("Could not create the event. " + err.message); process.exitCode = 1; });
