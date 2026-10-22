// Finds potential sponsors and partners for the event using Grok with live web search.
// Usage: node sponsors/find.js [--count 20] [--sample] [--dry-run]
//   --sample   use 5 built-in example sponsors instead of calling Grok (works offline)
//   --dry-run  print the exact request that would be sent to Grok, then stop
// Reads shared/event.json, writes sponsors/output/sponsors.json and sponsors/output/sponsors.md.
// This script only RESEARCHES. It never contacts anyone.

const fs = require("fs");
const path = require("path");
const { askGrokForJson } = require("../copy-generator/grok");
const { SAMPLE_SPONSORS } = require("./sample");

const ROOT = path.join(__dirname, "..");
const EVENT_FILE = path.join(ROOT, "shared", "event.json");
const OUT_DIR = path.join(__dirname, "output");

// Turn on xAI Live Search so Grok looks at the real, current web and returns citations.
const SEARCH = { search_parameters: { mode: "on", return_citations: true } };

const TIERS = ["venue", "food & drink", "tooling", "recruiting", "community"];
const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

const SYSTEM = `You research sponsors and partners for small community events. You use live web search and only report companies and contact details you actually found online.
Reply with JSON only, exactly this shape:
{"sponsors":[{"name": string, "website": string, "why_fit": string, "tier": "venue"|"food & drink"|"tooling"|"recruiting"|"community", "contact_email": string, "contact_page": string, "confidence": "high"|"medium"|"low"}]}
Rules:
- why_fit: one sentence tied to THIS event (its theme, city and audience).
- contact_email: ONLY a public business address the company itself publishes for partnerships or events (partnerships@, events@, community@, hello@, sponsorship@ ...). Never a named person's personal email. Use "" if you did not find one.
- contact_page: the URL of their partnerships / sponsorship / contact page, or "".
- confidence: high only if the company is local or clearly active with events like this and you found a real contact route.
- Mix the tiers. Prefer companies in or near the event's city. No duplicates.`;

// Read command-line flags like --count 20, --sample, --dry-run
function readArgs() {
  const args = process.argv.slice(2);
  const countIndex = args.indexOf("--count");
  return {
    count: countIndex >= 0 ? Number(args[countIndex + 1]) || 20 : 20,
    sample: args.includes("--sample"),
    dryRun: args.includes("--dry-run"),
  };
}

// Build the question we ask Grok, from the event details
function buildUserPrompt(event, count) {
  return `Find the ${count} best potential sponsors or partners for this event.
Event name: ${event.name}
Date and time: ${event.date} at ${event.time}
Venue: ${event.venue}
Expected guests: ${event.guest_count}
Hosts: ${event.hosts.join(", ")}
What it is: ${event.description}`;
}

// Make sure every sponsor row has the fields we expect, in a tidy form
function cleanSponsor(s) {
  return {
    name: String(s.name || "").trim(),
    website: String(s.website || "").trim(),
    why_fit: String(s.why_fit || "").trim(),
    tier: TIERS.includes(s.tier) ? s.tier : "community",
    contact_email: String(s.contact_email || "").trim().toLowerCase(),
    contact_page: String(s.contact_page || "").trim(),
    confidence: ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "low",
  };
}

// Readable Markdown table, sorted high -> medium -> low
function toMarkdown(sponsors, event) {
  const rows = sponsors.map(
    (s) => `| ${s.name} | ${s.tier} | ${s.confidence} | ${s.contact_email || "-"} | ${s.contact_page || s.website || "-"} | ${s.why_fit} |`
  );
  return [
    `# Potential sponsors for ${event.name}`,
    "",
    `${sponsors.length} candidates, sorted by confidence. Research only; nobody has been contacted.`,
    "",
    "| Sponsor | Tier | Confidence | Public contact email | Contact page | Why it fits |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

async function main() {
  const { count, sample, dryRun } = readArgs();
  const event = JSON.parse(fs.readFileSync(EVENT_FILE, "utf8"));
  const request = { system: SYSTEM, user: buildUserPrompt(event, count), extra: SEARCH };

  if (dryRun) {
    // Show the full request body exactly as grok.js would send it, then stop
    const body = {
      model: process.env.GROK_MODEL || "grok-4-fast",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      ...request.extra,
    };
    console.log(JSON.stringify(body, null, 2));
    console.log("\nDry run: nothing was sent to the API.");
    return;
  }

  let sponsors;
  if (sample) {
    sponsors = SAMPLE_SPONSORS;
  } else {
    const answer = await askGrokForJson(request);
    sponsors = Array.isArray(answer.sponsors) ? answer.sponsors : [];
  }

  sponsors = sponsors
    .map(cleanSponsor)
    .filter((s) => s.name)
    .sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "sponsors.json"), JSON.stringify({ event: event.name, sponsors }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "sponsors.md"), toMarkdown(sponsors, event));

  const withEmail = sponsors.filter((s) => s.contact_email).length;
  console.log(
    `Found ${sponsors.length} potential sponsors (${withEmail} with a public contact email)${sample ? " [sample data]" : ""} -> sponsors/output/sponsors.json and sponsors.md. Research only; nobody was contacted.`
  );
}

main().catch((err) => {
  console.error("Sponsor search failed:", err.message);
  process.exit(1);
});
