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
    description: "Everything Grok Bot needs to write the promo copy itself: the event, the exact JSON shape to produce, the house rules, the community's voice samples and what Cognee remembers. Write the copy, then call save_promo.",
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
