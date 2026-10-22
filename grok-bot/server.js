// Event Autopilot MCP server.
//
// MCP (Model Context Protocol) is a standard way for an AI assistant
// (Grok Bot, Claude, Cursor...) to call tools we provide. This file exposes
// our pipeline scripts as tools so the lead can drive everything by chat.
//
// Run with:  node grok-bot/server.js
// The assistant talks to us over stdin/stdout, so we must NEVER print to
// stdout ourselves. All our own logging goes to stderr (console.error).
//
// Rule 2 of CLAUDE.md: this server has NO tool that sends, posts or approves.
// Approval happens only in the dashboard (Approve button).

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

// The repo root is one folder up from this file.
const repoRoot = path.resolve(__dirname, "..");

// The files the pipeline reads and writes (CLAUDE.md rule 1).
const FILES = {
  event: "shared/event.json",
  promo: "shared/promo.json",
  runSheet: "run-sheet/output/run-sheet.md",
  pngDir: "promo-and-approval-ui/output",
};

const NEVER_SENDS =
  "Approval and sending happen only in the dashboard (Approve button). This server never sends anything.";

// ---------- small helpers ----------

// Wrap plain text in the shape MCP expects for a tool result.
function text(s) {
  return { content: [{ type: "text", text: s }] };
}

// Read a file inside the repo as text, or return null if it is not there.
function readIfExists(relPath) {
  const full = path.join(repoRoot, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
}

// List the PNG files the visuals step produced.
function listPngs() {
  const dir = path.join(repoRoot, FILES.pngDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort();
}

// Run one of our Node scripts (the same ones the command line uses) and
// return its output. If the script does not exist yet, say so politely.
function runScript(relScript, args = []) {
  const full = path.join(repoRoot, relScript);
  if (!fs.existsSync(full)) {
    return { ok: false, output: `That part is not built yet: ${relScript}` };
  }
  try {
    const out = execFileSync("node", [full, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"], // keep the script's output away from our stdout
      timeout: 5 * 60 * 1000, // Puppeteer renders can take a while
    });
    return { ok: true, output: out.trim() };
  } catch (err) {
    const details = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n").trim();
    return { ok: false, output: `The script ${relScript} failed:\n${details}` };
  }
}

// Run a script, then append the file it should have written.
function runThenShow(relScript, args, relFile) {
  const run = runScript(relScript, args);
  const parts = [run.output || "(no output)"];
  const file = readIfExists(relFile);
  parts.push(file ? `\n--- ${relFile} ---\n${file}` : `\n${relFile} does not exist yet.`);
  return text(parts.join("\n"));
}

// ---------- the server and its tools ----------

const server = new McpServer({ name: "event-autopilot", version: "0.1.0" });

server.registerTool(
  "make_event",
  {
    title: "Make event from Luma",
    description: "Read a Luma event URL or id and write shared/event.json.",
    inputSchema: { luma: z.string().describe("Luma event URL or id") },
  },
  async ({ luma }) => runThenShow("intake/from-luma.js", [luma], FILES.event)
);

server.registerTool(
  "make_event_from_text",
  {
    title: "Make event from text",
    description: "Turn a one-line idea or messy notes into shared/event.json.",
    inputSchema: { text: z.string().describe("Free text describing the event") },
  },
  async ({ text: notes }) => runThenShow("intake/from-text.js", [notes], FILES.event)
);

server.registerTool(
  "write_promo",
  {
    title: "Write promo copy",
    description: "Generate page copy, newsletter and posts from event.json into shared/promo.json (drafts only).",
    inputSchema: {},
  },
  async () => runThenShow("copy-generator/generate.js", [], FILES.promo)
);

server.registerTool(
  "render_visuals",
  {
    title: "Render visuals",
    description: "Render the HTML/CSS templates to PNG posters and social cards (Puppeteer, no image models).",
    inputSchema: {},
  },
  async () => {
    const run = runScript("promo-and-approval-ui/templates/render.js", ["shared/event.json"]);
    const pngs = listPngs();
    const list = pngs.length
      ? pngs.map((f) => `${FILES.pngDir}/${f}`).join("\n")
      : "No PNG files found yet.";
    return text(`${run.output || "(no output)"}\n\n--- rendered images ---\n${list}`);
  }
);

server.registerTool(
  "build_run_sheet",
  {
    title: "Build run sheet",
    description: "Draft timings, volunteer roles and budget into run-sheet/output/run-sheet.md.",
    inputSchema: { hours: z.number().optional().describe("Length of the event in hours") },
  },
  async ({ hours }) => {
    const args = hours === undefined ? [] : ["--hours", String(hours)];
    return runThenShow("run-sheet/build.js", args, FILES.runSheet);
  }
);

server.registerTool(
  "get_event",
  { title: "Get event", description: "Return the current shared/event.json.", inputSchema: {} },
  async () => text(readIfExists(FILES.event) || `${FILES.event} does not exist yet.`)
);

server.registerTool(
  "get_promo",
  { title: "Get promo", description: "Return the current shared/promo.json (drafts).", inputSchema: {} },
  async () => text(readIfExists(FILES.promo) || `${FILES.promo} does not exist yet.`)
);

server.registerTool(
  "status",
  {
    title: "Status",
    description: "What exists so far: event, promo, visuals, run sheet. Nothing here sends or approves.",
    inputSchema: {},
  },
  async () => {
    const yes = (relPath) => (readIfExists(relPath) !== null ? "yes" : "no");
    const pngs = listPngs();
    const lines = [
      `event.json: ${yes(FILES.event)}`,
      `promo.json: ${yes(FILES.promo)}`,
      `visuals: ${pngs.length ? pngs.join(", ") : "none yet"}`,
      `run sheet: ${yes(FILES.runSheet)}`,
      "",
      NEVER_SENDS,
    ];
    return text(lines.join("\n"));
  }
);

// ---------- start listening on stdin/stdout ----------

// ---------- more Grok jobs: sponsors, outreach drafts, rewriting one item ----------

server.registerTool(
  "find_sponsors",
  {
    title: "Find potential sponsors",
    description: "Use Grok live web search to list potential sponsors/partners for this event with public business contact emails. Research only; nobody is contacted.",
    inputSchema: { count: z.number().optional().describe("How many sponsors to look for (default 20)") },
  },
  async ({ count }) => {
    const args = count === undefined ? [] : ["--count", String(count)];
    return runThenShow("sponsors/find.js", args, "sponsors/output/sponsors.md");
  }
);

server.registerTool(
  "draft_sponsor_outreach",
  {
    title: "Draft sponsor outreach emails",
    description: "Write one short sponsorship email per sponsor found by find_sponsors. Drafts only, saved to sponsors/output/outreach/. Nothing is sent.",
    inputSchema: {},
  },
  async () => runThenShow("sponsors/draft-outreach.js", [], "sponsors/output/outreach/ALL.md")
);

server.registerTool(
  "regenerate_item",
  {
    title: "Rewrite one promo item",
    description: "Ask Grok for a fresh version of one item (page_copy, newsletter, linkedin, whatsapp or discord), optionally with a note like 'shorter' or 'more playful'. Returns the draft; it does not save or send.",
    inputSchema: {
      id: z.enum(["page_copy", "newsletter", "linkedin", "whatsapp", "discord"]),
      note: z.string().optional().describe("What to change, in plain words"),
    },
  },
  async ({ id, note }) => {
    const { regenerateItem } = require("../copy-generator/regenerate");
    const event = JSON.parse(readIfExists(FILES.event) || "{}");
    const promo = JSON.parse(readIfExists(FILES.promo) || "{}");
    const current = id === "page_copy" ? promo.page_copy : id === "newsletter" ? promo.newsletter : (promo.posts || {})[id];
    try {
      const draft = await regenerateItem(id, event, current || "", note || "");
      return text(typeof draft === "string" ? draft : `Subject: ${draft.subject}\n\n${draft.body}`);
    } catch (err) {
      return text("Could not rewrite it. " + err.message);
    }
  }
);

server.registerTool(
  "remember_voice",
  {
    title: "Remember the community's voice",
    description: "Save the voice/ samples (and, with include_event, the current event + approved copy) into Cognee, the community's memory, so future copy sounds like this community. Writes only to our own memory; contacts nobody.",
    inputSchema: { include_event: z.boolean().optional().describe("Also remember shared/event.json and shared/promo.json") },
  },
  async ({ include_event }) => {
    const run = runScript("memory/remember.js", include_event ? ["--event"] : []);
    return text(run.output || "(no output)");
  }
);

// ---------- "Grok Bot is the brain" mode: Grok Bot writes the drafts itself and saves them here ----------
// With these, Grok Bot needs no xAI API key on our side: it reads the brief, writes, and calls save_*.
// Everything saved is still a draft for the dashboard; nothing here sends.

const EVENT_KEYS = ["name", "date", "time", "venue", "description", "hosts", "guest_count"];

server.registerTool(
  "get_writing_brief",
  {
    title: "Get the writing brief",
    description: "Everything Grok Bot needs to write the promo copy itself: the event, the exact JSON shape to produce, the house rules, the community's voice samples and what Cognee remembers. Write the copy, then call save_promo. It already includes what Cognee remembers.",
    inputSchema: {},
  },
  async () => {
    const { SYSTEM, readVoiceSamples, longDate } = require("../copy-generator/generate");
    const { recall } = require("../memory/cognee");
    const event = JSON.parse(readIfExists(FILES.event) || "null");
    if (!event) return text("There is no event yet. Call make_event (Luma link) or save_event (from a one-line idea) first.");
    let memory = "";
    try { memory = await recall(`How does this community write its event posts and newsletters? Tone, length, phrases, sign-offs, with examples. Next event: "${event.name}".`); } catch { /* memory is optional */ }
    const voice = readVoiceSamples();
    return text([
      "RULES AND OUTPUT SHAPE:\n" + SYSTEM,
      "EVENT:\n" + JSON.stringify({ ...event, date_long: longDate(event.date) }, null, 2),
      memory ? "WHAT COGNEE REMEMBERS ABOUT THIS COMMUNITY'S VOICE:\n" + memory : "",
      voice ? "VOICE SAMPLES:\n" + voice : "No voice samples given; use a friendly, plain tone.",
      "When done, call save_promo with the JSON object.",
    ].filter(Boolean).join("\n\n"));
  }
);

server.registerTool(
  "save_event",
  {
    title: "Save the event",
    description: "Save an event Grok Bot wrote from a one-line idea (or edited) as shared/event.json. Use ISO date YYYY-MM-DD and 24h time HH:MM. Missing venue: 'Venue to be confirmed'.",
    inputSchema: {
      name: z.string(), date: z.string(), time: z.string(), venue: z.string(), description: z.string(),
      hosts: z.array(z.string()), guest_count: z.number(),
    },
  },
  async (event) => {
    const clean = Object.fromEntries(EVENT_KEYS.map((k) => [k, event[k]]));
    fs.writeFileSync(path.join(repoRoot, FILES.event), JSON.stringify(clean, null, 2) + "\n");
    return text(`Saved shared/event.json: "${clean.name}" on ${clean.date} at ${clean.time}, ${clean.venue}. Next: get_writing_brief, then save_promo; render_visuals; build_run_sheet.`);
  }
);

server.registerTool(
  "save_promo",
  {
    title: "Save the promo copy",
    description: "Save the copy Grok Bot wrote as shared/promo.json (a draft the lead approves in the dashboard). Shape: page_copy, newsletter {subject, body}, posts {linkedin, whatsapp, discord}.",
    inputSchema: {
      page_copy: z.string(),
      newsletter: z.object({ subject: z.string(), body: z.string() }),
      posts: z.object({ linkedin: z.string(), whatsapp: z.string(), discord: z.string() }),
    },
  },
  async (promo) => {
    const clean = {
      page_copy: promo.page_copy,
      newsletter: { subject: promo.newsletter.subject, body: promo.newsletter.body },
      posts: { linkedin: promo.posts.linkedin, whatsapp: promo.posts.whatsapp, discord: promo.posts.discord },
    };
    fs.writeFileSync(path.join(repoRoot, FILES.promo), JSON.stringify(clean, null, 2) + "\n");
    const event = JSON.parse(readIfExists(FILES.event) || "{}");
    const all = Object.values(clean.posts).concat(clean.page_copy, clean.newsletter.body).join("\n");
    const warnings = [];
    if (event.venue && !all.includes(String(event.venue).split(",")[0])) warnings.push("the venue name is missing from some copy");
    if (event.time && !all.includes(event.time)) warnings.push(`the time ${event.time} is not written anywhere`);
    return text("Saved shared/promo.json with 5 drafts for the lead to review in the dashboard." + (warnings.length ? " Worth checking: " + warnings.join("; ") + "." : ""));
  }
);

// ---------- Cognee bridge: Cognee cloud has no MCP endpoint of its own, so these two tools pass through ----------

server.registerTool(
  "recall_memory",
  {
    title: "Ask the community's memory",
    description: "Ask the community's memory (Cognee) anything: past events, how the community writes, what worked before.",
    inputSchema: { question: z.string().describe("The question, in plain words") },
  },
  async ({ question }) => {
    const { recall } = require("../memory/cognee");
    try {
      const answer = await recall(question);
      return text(answer || "Cognee is not set up (or it remembers nothing about this yet).");
    } catch (err) {
      return text("Cognee did not answer. " + err.message);
    }
  }
);

server.registerTool(
  "remember_text",
  {
    title: "Save something to the community's memory",
    description: "Save a note, past post or lesson into the community's memory (Cognee). Writes only to our own memory; contacts nobody.",
    inputSchema: {
      text: z.string().describe("What to remember"),
      label: z.string().optional().describe("A short label, e.g. 'Past LinkedIn post'"),
    },
  },
  async ({ text: note, label }) => {
    const { remember } = require("../memory/cognee");
    try {
      const result = await remember([label ? label + ": " + note : note]);
      return text(result.skipped ? result.skipped : "Remembered in Cognee (dataset community-voice).");
    } catch (err) {
      return text("Could not save to Cognee. " + err.message);
    }
  }
);

// ---------- the autopilot: every agent in one go (see autopilot/agents.js) ----------
// These run autopilot/run.js and wait for it. They only make drafts; nothing is sent.

const { execFile } = require("child_process");

// Run the autopilot command line and return what it printed (it can take a few minutes)
function runAutopilotCli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(repoRoot, "autopilot", "run.js"), ...args],
      { cwd: repoRoot, encoding: "utf8", timeout: 15 * 60 * 1000, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const out = (stdout || "").trim() || (stderr || "").trim() || (err ? err.message : "(no output)");
        resolve(text(out + "\n\nOpen the dashboard's Launch tab to watch. " + NEVER_SENDS));
      });
  });
}

server.registerTool(
  "launch_event",
  {
    title: "Launch the autopilot",
    description: "Run every agent from one line of text or a Luma link: event, visuals, run sheet, copy, sponsors, outreach drafts, event page. Everything is a draft for the lead to approve in the dashboard; nothing is sent.",
    inputSchema: { input: z.string().describe("One line about the event, or a Luma link") },
  },
  async ({ input }) => runAutopilotCli([input])
);

server.registerTool(
  "run_production",
  {
    title: "Build everything from what Grok Bot wrote",
    description: "Use after save_event and save_promo: renders the visuals, builds the run sheet and event page, and remembers the event. Drafts only; nothing is sent.",
    inputSchema: {},
  },
  async () => runAutopilotCli(["--production"])
);

// ---------- Sponsors and outreach, done by Grok Bot itself (its own web search, no xAI API key here) ----------

server.registerTool(
  "get_sponsor_brief",
  {
    title: "Get the sponsor research brief",
    description: "The rules and event details for finding sponsors. Use your own web search to find them (public business emails only, never personal ones), then call save_sponsors.",
    inputSchema: { count: z.number().optional().describe("How many sponsors to find (default 20)") },
  },
  async ({ count }) => {
    const { SYSTEM, buildUserPrompt } = require("../sponsors/find");
    const event = JSON.parse(readIfExists(FILES.event) || "null");
    if (!event) return text("There is no event yet. Call save_event or make_event first.");
    return text(SYSTEM + "\n\n" + buildUserPrompt(event, count || 20) + "\n\nWhen done, call save_sponsors with the list.");
  }
);

server.registerTool(
  "save_sponsors",
  {
    title: "Save the sponsor shortlist",
    description: "Save the sponsors Grok Bot found to sponsors/output (sponsors.json + sponsors.md). Research only; nobody is contacted.",
    inputSchema: {
      sponsors: z.array(z.object({
        name: z.string(), website: z.string().optional(), why_fit: z.string().optional(),
        tier: z.string().optional(), contact_email: z.string().optional(), contact_page: z.string().optional(),
        confidence: z.string().optional(),
      })),
    },
  },
  async ({ sponsors }) => {
    const { cleanSponsor, toMarkdown, CONFIDENCE_ORDER } = require("../sponsors/find");
    const event = JSON.parse(readIfExists(FILES.event) || "{}");
    const list = sponsors.map(cleanSponsor).filter((s) => s.name)
      .sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);
    const dir = path.join(repoRoot, "sponsors", "output");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "sponsors.json"), JSON.stringify({ event: event.name, sponsors: list }, null, 2));
    fs.writeFileSync(path.join(dir, "sponsors.md"), toMarkdown(list, event));
    return text(`Saved ${list.length} sponsors (${list.filter((s) => s.contact_email).length} with a public email). Next: get_outreach_brief, then save_outreach.`);
  }
);

server.registerTool(
  "get_outreach_brief",
  {
    title: "Get the outreach email brief",
    description: "The rules, event details and saved sponsors for writing one short sponsorship email each. Write them, then call save_outreach. Do not send them.",
    inputSchema: {},
  },
  async () => {
    const { SYSTEM, buildUserPrompt } = require("../sponsors/draft-outreach");
    const event = JSON.parse(readIfExists(FILES.event) || "null");
    const saved = JSON.parse(readIfExists("sponsors/output/sponsors.json") || "null");
    if (!event || !saved || !saved.sponsors.length) return text("Save the event and the sponsors first (save_event, save_sponsors).");
    return text(SYSTEM + "\n\n" + buildUserPrompt(event, saved.sponsors) + "\n\nWhen done, call save_outreach with the drafts.");
  }
);

server.registerTool(
  "save_outreach",
  {
    title: "Save sponsor outreach drafts",
    description: "Save one email draft per sponsor to sponsors/output/outreach/ (each with a mailto link the lead opens to send by hand). Drafts only: this never sends. If the lead later asks you to send them from a connected email account, show the list first and only send after the lead explicitly confirms.",
    inputSchema: { drafts: z.array(z.object({ name: z.string(), subject: z.string(), body: z.string() })) },
  },
  async ({ drafts }) => {
    const { draftToMarkdown, slug } = require("../sponsors/draft-outreach");
    const event = JSON.parse(readIfExists(FILES.event) || "{}");
    const saved = JSON.parse(readIfExists("sponsors/output/sponsors.json") || '{"sponsors":[]}');
    const dir = path.join(repoRoot, "sponsors", "output", "outreach");
    fs.mkdirSync(dir, { recursive: true });
    const all = [`# Sponsor outreach drafts for ${event.name}`, "", "Drafts only. Nothing was sent. Open each file, review, then send by hand.", ""];
    for (const draft of drafts) {
      const sponsor = saved.sponsors.find((s) => s.name === draft.name) || { name: draft.name };
      const file = `${slug(draft.name)}.md`;
      fs.writeFileSync(path.join(dir, file), draftToMarkdown(sponsor, draft));
      all.push(`- [${draft.name}](${file}) - To: ${sponsor.contact_email || "no public email"} - Subject: ${draft.subject}`);
    }
    fs.writeFileSync(path.join(dir, "ALL.md"), all.join("\n") + "\n");
    return text(`Saved ${drafts.length} outreach drafts to sponsors/output/outreach/ (see ALL.md). Nothing was sent.`);
  }
);

server.registerTool(
  "get_database_record",
  {
    title: "Get the Supabase table and this event's row",
    description: "Returns supabase/schema.sql (run it once to create the events table) and the event's row from the latest event page build, so you can save it with your own Supabase connector. Keep published=false: publishing happens only when the lead clicks Publish in the dashboard.",
    inputSchema: {},
  },
  async () => {
    const schema = readIfExists("supabase/schema.sql") || "(supabase/schema.sql is missing)";
    const row = readIfExists("event-page/output/supabase-row.json");
    if (!row) return text("No event page built yet. Call run_production first, then ask again.\n\nSCHEMA:\n" + schema);
    return text("SCHEMA (run once):\n" + schema + "\n\nROW to upsert into public.events (on conflict slug):\n" + row);
  }
);

server.registerTool(
  "confirm_database_saved",
  {
    title: "Confirm the event was saved to Supabase",
    description: "After you saved the event row with your own Supabase connector (see get_database_record), call this with the project name and the row id. It marks the Database agent as done in Mission Control. It does not touch the database.",
    inputSchema: { project: z.string().describe("Supabase project name"), row_id: z.string().describe("The id of the saved row") },
  },
  async ({ project, row_id }) => {
    const row = JSON.parse(readIfExists("event-page/output/supabase-row.json") || "null");
    if (!row) return text("No event page built yet. Call run_production first.");
    fs.writeFileSync(path.join(repoRoot, "event-page", "output", "database-saved.json"),
      JSON.stringify({ slug: row.slug, project, row_id, at: new Date().toISOString() }, null, 2));

    // Update the latest run so Mission Control turns the Database card green straight away
    const statusFile = path.join(repoRoot, "autopilot", "output", "status.json");
    const status = JSON.parse(readIfExists("autopilot/output/status.json") || "null");
    const card = status && status.agents.find((a) => a.id === "supabase");
    if (card && card.state !== "done") {
      const { minutesFor } = require("../autopilot/agents");
      Object.assign(card, {
        state: "done", note: "", endedAt: new Date().toISOString(), startedAt: card.startedAt || new Date().toISOString(),
        summary: `Saved by Grok Bot to Supabase (${project}) as an unpublished draft`, output: { type: "text", value: row_id },
        minutesSaved: minutesFor("supabase").minutes,
      });
      status.totalMinutesSaved = status.agents.reduce((sum, a) => sum + (a.minutesSaved || 0), 0);
      fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
    }
    return text(`Recorded: "${row.slug}" saved in ${project} (row ${row_id}). The Database agent now shows done.`);
  }
);

// ---------- start ----------
// Two ways to run:
//   node grok-bot/server.js            -> stdio, for a client on this computer (Claude Code, Cursor)
//   node grok-bot/server.js --http 4020 -> HTTP on that port, for a cloud client such as Grok Bot
//                                          (expose it with: cloudflared tunnel --url http://localhost:4020)
async function main() {
  const httpIndex = process.argv.indexOf("--http");
  if (httpIndex === -1) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Event Autopilot MCP server ready (stdio). It never sends anything.");
    return;
  }
  const port = Number(process.argv[httpIndex + 1]) || 4020;
  const http = require("http");
  const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
  // Stateless: every request gets a fresh transport, which is the simplest thing that works behind a tunnel
  http.createServer(async (req, res) => {
    if (!req.url.startsWith("/mcp")) { res.writeHead(404); return res.end("Event Autopilot MCP server: use /mcp"); }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
  }).listen(port, () => console.error(`Event Autopilot MCP server ready at http://localhost:${port}/mcp. It never sends anything.`));
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
