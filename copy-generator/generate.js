// Writes all the promo copy for the event with Grok, in the community's own voice.
// Usage: node copy-generator/generate.js
// Reads shared/event.json (+ the voice samples in voice/), writes shared/promo.json.
// Everything it writes is a DRAFT: the lead reviews and approves it in the dashboard.

const fs = require("fs");
const path = require("path");
const { askGrokForJson } = require("./grok");
const { recall } = require("../memory/cognee");

const ROOT = path.join(__dirname, "..");
const EVENT_FILE = path.join(ROOT, "shared", "event.json");
const PROMO_FILE = path.join(ROOT, "shared", "promo.json");
const VOICE_DIR = path.join(ROOT, "voice");

// Past posts and event pages the community wrote, so Grok can copy their tone (not their content)
function readVoiceSamples() {
  if (!fs.existsSync(VOICE_DIR)) return "";
  return fs.readdirSync(VOICE_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
    .filter((f) => f.toLowerCase() !== "readme.md")
    .map((f) => fs.readFileSync(path.join(VOICE_DIR, f), "utf8").trim())
    .filter((text) => (text.match(/PASTE HERE/g) || []).length < 3) // skip the unfilled template
    .map((text, i) => `--- sample ${i + 1} ---\n${text.replace(/PASTE HERE/g, "")}`)
    .join("\n\n")
    .slice(0, 12000); // keep the prompt a sensible size
}

// "2026-11-12" -> "Thursday 12 November"
function longDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

const SYSTEM = `You write promo copy for community events. Warm, specific, human, never corporate, no hype words, no emojis unless the voice samples use them.
Reply with JSON only, exactly these keys:
{"page_copy": string, "newsletter": {"subject": string, "body": string}, "posts": {"linkedin": string, "whatsapp": string, "discord": string}}
- page_copy: the event page text, 2 short paragraphs, says what happens, who it is for, what to bring, how to sign up.
- newsletter.subject: under 60 characters, no clickbait. newsletter.body: 80 to 140 words, greeting, 2 short paragraphs, a sign-off with the hosts' names, line breaks as \\n.
- posts.linkedin: 60 to 110 words, first line is a hook, no hashtag spam (max 3 at the end).
- posts.whatsapp: 2 to 4 lines, friendly, ends with a question so people reply.
- posts.discord: 1 to 3 lines, casual, starts with a mention like @everyone or @here, ends asking people to react if they're coming.
Every piece must state the date, time and venue exactly as given. Never invent facts (no prices, speakers or sponsors that are not in the event).
If voice samples are given, match their tone, sentence length and typical sign-off, but do not copy sentences from them.`;

async function main() {
  if (!fs.existsSync(EVENT_FILE)) {
    console.log("There is no shared/event.json yet. Run intake/from-luma.js or intake/from-text.js first.");
    process.exit(1);
  }
  const event = JSON.parse(fs.readFileSync(EVENT_FILE, "utf8"));
  const voice = readVoiceSamples();

  // If Cognee (the community's memory) is set up, ask it how this community usually writes
  let memory = "";
  try {
    memory = await recall(`How does this community write its event posts and newsletters? Give the tone, typical length, phrases and sign-offs, with examples. The next event is "${event.name}".`);
    if (memory) console.log("Using what Cognee remembers about this community's voice.");
  } catch (err) {
    console.log("Cognee memory not available right now (" + err.message + "), using the voice/ files only.");
  }

  const user = [
    `Event: ${JSON.stringify({ ...event, date_long: longDate(event.date) }, null, 2)}`,
    memory ? `What the community's memory (Cognee) says about its voice:\n${memory}` : "",
    voice ? `Voice samples from this community:\n${voice}` : "",
    !memory && !voice ? "No voice samples given; use a friendly, plain tone." : "",
  ].filter(Boolean).join("\n\n");

  console.log("Asking Grok to draft the page copy, newsletter and posts...");
  const promo = await askGrokForJson({ system: SYSTEM, user });

  // Keep exactly the shape the rest of the project expects (CLAUDE.md rule 1)
  const clean = {
    page_copy: String(promo.page_copy || ""),
    newsletter: { subject: String(promo.newsletter?.subject || ""), body: String(promo.newsletter?.body || "") },
    posts: {
      linkedin: String(promo.posts?.linkedin || ""),
      whatsapp: String(promo.posts?.whatsapp || ""),
      discord: String(promo.posts?.discord || ""),
    },
  };
  fs.writeFileSync(PROMO_FILE, JSON.stringify(clean, null, 2) + "\n");

  // A quick sanity check so the lead hears about obvious mistakes before reading
  const all = Object.values(clean.posts).concat(clean.page_copy, clean.newsletter.body).join("\n");
  const warnings = [];
  if (!all.includes(event.venue.split(",")[0])) warnings.push("the venue name is missing from some copy");
  if (!all.includes(event.time)) warnings.push(`the time ${event.time} is not written anywhere`);
  console.log("Saved shared/promo.json with 5 drafts. Review them in the dashboard before approving.");
  if (warnings.length) console.log("Worth checking: " + warnings.join("; ") + ".");
}

main().catch((err) => { console.log("Could not write the promo copy. " + err.message); process.exit(1); });
