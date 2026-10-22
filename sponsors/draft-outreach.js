// Drafts one short sponsorship email per sponsor found by find.js.
// Usage: node sponsors/draft-outreach.js [--sample] [--dry-run]
//   --sample   write template emails for the 5 built-in sponsors, no Grok call (works offline)
//   --dry-run  print the exact request that would be sent to Grok, then stop
// Reads shared/event.json + sponsors/output/sponsors.json.
// Writes sponsors/output/outreach/<slug>.md (one per sponsor) and outreach/ALL.md.
// DRAFTS ONLY. This script never sends email. The lead opens the mailto link and sends by hand.

const fs = require("fs");
const path = require("path");
const { askGrokForJson } = require("../copy-generator/grok");
const { SAMPLE_SPONSORS, sampleDraft } = require("./sample");

const ROOT = path.join(__dirname, "..");
const EVENT_FILE = path.join(ROOT, "shared", "event.json");
const SPONSORS_FILE = path.join(__dirname, "output", "sponsors.json");
const OUT_DIR = path.join(__dirname, "output", "outreach");

const SYSTEM = `You write short, plain sponsorship emails for a community event. Specific, warm, no hype, no emojis, no buzzwords.
Reply with JSON only, exactly this shape:
{"drafts":[{"name": string, "subject": string, "body": string}]}
One draft per sponsor, same order as given, "name" copied exactly.
- subject: under 60 characters.
- body: 90 to 140 words. Mention the event name, date, venue and the expected number of guests. Say in one sentence why this sponsor fits. Say what they get: logo on the event visuals and newsletter, two minutes on stage, a table at the event. Ask for a 15-minute call. Use \\n for line breaks. Sign with the hosts' names exactly as given.
- Never invent facts, prices or names not given here.`;

// "2026-11-12" -> "Thursday 12 November 2026"
function longDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// "Example Brewing Co" -> "example-brewing-co" (safe file name)
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sponsor";
}

function buildUserPrompt(event, sponsors) {
  const list = sponsors
    .map((s, i) => `${i + 1}. ${s.name} (${s.tier}) - ${s.website}\n   Why it fits: ${s.why_fit}`)
    .join("\n");
  return `Event: ${event.name}
Date: ${longDate(event.date)} at ${event.time}
Venue: ${event.venue}
Expected guests: ${event.guest_count}
About: ${event.description}
Hosts (sign-off): ${event.hosts.join(" and ")}

Write one email for each of these ${sponsors.length} sponsors:
${list}`;
}

// Markdown for one draft, with a mailto link the lead can click to open their mail app
function draftToMarkdown(sponsor, draft) {
  const to = sponsor.contact_email || "(no public email found - use the contact page)";
  const mailto = `mailto:${encodeURIComponent(sponsor.contact_email || "")}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  return [
    `# ${sponsor.name}`,
    "",
    `**To:** ${to}  `,
    `**Contact page:** ${sponsor.contact_page || sponsor.website || "-"}  `,
    `**Subject:** ${draft.subject}`,
    "",
    "**Body:**",
    "",
    draft.body,
    "",
    `[Open in your mail app](${mailto})`,
    "",
    "_Draft only. Nothing has been sent. Review, edit and send by hand._",
    "",
  ].join("\n");
}

// Warn (but do not fail) if a draft is outside the length rules
function checkLength(draft) {
  const words = draft.body.trim().split(/\s+/).length;
  const notes = [];
  if (draft.subject.length >= 60) notes.push(`subject is ${draft.subject.length} chars (want under 60)`);
  if (words < 90 || words > 140) notes.push(`body is ${words} words (want 90-140)`);
  return notes;
}

async function main() {
  const args = process.argv.slice(2);
  const sample = args.includes("--sample");
  const dryRun = args.includes("--dry-run");
  const event = JSON.parse(fs.readFileSync(EVENT_FILE, "utf8"));

  // Sponsors come from find.js. In sample mode fall back to the built-in list if that file is missing.
  let sponsors;
  if (fs.existsSync(SPONSORS_FILE)) {
    sponsors = JSON.parse(fs.readFileSync(SPONSORS_FILE, "utf8")).sponsors;
  } else if (sample || dryRun) {
    sponsors = SAMPLE_SPONSORS;
  } else {
    throw new Error("sponsors/output/sponsors.json not found. Run `node sponsors/find.js` first.");
  }

  const request = { system: SYSTEM, user: buildUserPrompt(event, sponsors) };

  if (dryRun) {
    const body = {
      model: process.env.GROK_MODEL || "grok-4-fast",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    };
    console.log(JSON.stringify(body, null, 2));
    console.log("\nDry run: nothing was sent to the API.");
    return;
  }

  // One Grok call writes all the drafts at once
  let drafts;
  if (sample) {
    drafts = sponsors.map((s) => sampleDraft(s, event));
  } else {
    const answer = await askGrokForJson(request);
    drafts = Array.isArray(answer.drafts) ? answer.drafts : [];
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const all = [`# Sponsor outreach drafts for ${event.name}`, "", "Drafts only. Nothing was sent. Open each file, review, then send by hand.", ""];
  let written = 0;
  for (const sponsor of sponsors) {
    // Match a draft to its sponsor by name (fall back to position)
    const draft = drafts.find((d) => d.name === sponsor.name) || drafts[sponsors.indexOf(sponsor)];
    if (!draft || !draft.subject || !draft.body) {
      console.warn(`No draft came back for ${sponsor.name}; skipped.`);
      continue;
    }
    const file = `${slug(sponsor.name)}.md`;
    fs.writeFileSync(path.join(OUT_DIR, file), draftToMarkdown(sponsor, draft));
    for (const note of checkLength(draft)) console.warn(`Check ${sponsor.name}: ${note}`);
    all.push(`- [${sponsor.name}](${file}) - To: ${sponsor.contact_email || "no public email"} - Subject: ${draft.subject}`);
    written++;
  }
  fs.writeFileSync(path.join(OUT_DIR, "ALL.md"), all.join("\n") + "\n");

  console.log(`Wrote ${written} outreach drafts${sample ? " [sample data]" : ""} to sponsors/output/outreach/ (see ALL.md). Drafts only. Nothing was sent.`);
}

main().catch((err) => {
  console.error("Drafting failed:", err.message);
  process.exit(1);
});
