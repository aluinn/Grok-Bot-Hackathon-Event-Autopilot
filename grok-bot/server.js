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
    const run = runScript("visuals/render.js");
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Event Autopilot MCP server ready (stdio). It never sends anything.");
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
