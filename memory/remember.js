// Loads the community's voice into Cognee (Grok Bot's memory).
// Usage: node memory/remember.js            -> saves every file in voice/ (except README and unfilled templates)
//        node memory/remember.js --event    -> also saves the current shared/event.json + shared/promo.json,
//                                             so approved copy teaches the next event how this community sounds
// Nothing is sent to people; this only writes to our own memory.

const fs = require("fs");
const path = require("path");
const { remember } = require("./cognee");

const ROOT = path.join(__dirname, "..");
const VOICE_DIR = path.join(ROOT, "voice");

function voiceTexts() {
  if (!fs.existsSync(VOICE_DIR)) return [];
  return fs.readdirSync(VOICE_DIR)
    .filter((f) => (f.endsWith(".md") || f.endsWith(".txt")) && f.toLowerCase() !== "readme.md")
    .map((f) => fs.readFileSync(path.join(VOICE_DIR, f), "utf8").trim())
    .filter((t) => t && (t.match(/PASTE HERE/g) || []).length < 3);
}

async function main() {
  const texts = voiceTexts();
  if (process.argv.includes("--event")) {
    const read = (f) => (fs.existsSync(path.join(ROOT, "shared", f)) ? fs.readFileSync(path.join(ROOT, "shared", f), "utf8") : "");
    const event = read("event.json"), promo = read("promo.json");
    if (event && promo) texts.push(`A past event of this community, with the copy the lead approved:\nEVENT ${event}\nCOPY ${promo}`);
  }
  if (!texts.length) {
    console.log("Nothing to remember yet: add past posts to voice/ (or fill voice/examples.md) first.");
    return;
  }
  console.log(`Saving ${texts.length} text(s) into Cognee (this builds a small knowledge graph, so it can take a minute)...`);
  const result = await remember(texts);
  console.log(result.skipped ? result.skipped : `Done: ${result.saved} text(s) remembered in dataset "${result.dataset}".`);
}

main().catch((err) => { console.log("Could not save to Cognee. " + err.message); process.exit(1); });
