// A tiny web server for the dashboard. It only READS files and shows them. It never sends anything anywhere.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4010;
const SHARED_DIR = path.join(__dirname, "..", "..", "shared"); // event.json + promo.json
const OUTPUT_DIR = path.join(__dirname, "..", "output");        // promo images
const TEMPLATES_DIR = path.join(__dirname, "..", "..", "templates"); // the picture / digest templates
const DATA_DIR = path.join(__dirname, "..", "..", "data");           // sample data for the digest
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

// Send one file to the browser (only if it lives inside the allowed folder)
function sendFile(res, folder, name) {
  const file = path.join(folder, name);
  if (!file.startsWith(folder) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  // If the file vanishes mid-read (e.g. images being re-rendered), answer 404 instead of crashing the server
  fs.createReadStream(file)
    .on("error", () => { if (!res.headersSent) res.writeHead(404); res.end(); })
    .pipe(res);
}

// Sending (only after Approve) and regenerating (Grok) live in their own folders
const sending = require("../../sending");
const { regenerateItem } = require("../../copy-generator/regenerate");
const { buildNewsletterHtml } = require("../../newsletter/build");

// Read the JSON the browser posted, then run `handler` and reply with JSON
function handleJson(req, res, handler) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const result = await handler(JSON.parse(body || "{}"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// ---------- Launch: the autopilot runs every agent and the Launch tab watches it live ----------
const { runAutopilot, STATUS_FILE } = require("../../autopilot/agents");
const EVENT_PAGE_DIR = path.join(__dirname, "..", "..", "event-page", "output"); // the built event page
let launchRunning = false;  // true while a run started from this dashboard is going
const streams = new Set();  // browsers watching /api/launch/stream
let lastSent = "";

function readStatus() {
  try { return fs.readFileSync(STATUS_FILE, "utf8"); } catch { return JSON.stringify({ state: "idle" }); }
}
// Send the latest status to every watching browser (only if it changed)
function broadcast(json) {
  try { json = JSON.stringify(JSON.parse(json)); } catch { return; } // one line; skip a half-written file
  if (json === lastSent) return;
  lastSent = json;
  for (const res of streams) res.write(`data: ${json.replace(/\n/g, "")}\n\n`);
}
// Runs started elsewhere (command line, Grok Bot) also show up: watch status.json for changes
fs.watchFile(STATUS_FILE, { interval: 300 }, () => broadcast(readStatus()));

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);

  // POST /api/send/discord | ghost  — only reached after the lead clicked Approve in the page.
  // The sending functions refuse unless approved === true, so nothing can slip through.
  if (req.method === "POST" && url.startsWith("/api/send/")) {
    const channel = url.slice("/api/send/".length);
    return handleJson(req, res, async (data) => {
      if (data.approved !== true) throw new Error("Refused: nothing is sent without the lead clicking Approve.");
      let result;
      if (channel === "discord") result = await sending.sendDiscord({ text: data.text, approved: true });
      else if (channel === "ghost") {
        // The draft uses aluinn's branded email template, with the lead's edited subject and body
        const html = buildNewsletterHtml({ subject: data.subject, body: data.body });
        result = await sending.createGhostDraft({ subject: data.subject, body: data.body, html, approved: true });
      }
      else throw new Error(`Unknown channel "${channel}".`);
      sending.appendLog({ at: new Date().toISOString(), channel, ok: result.ok, status: result.status, preview: (data.text || data.subject || "").slice(0, 80) });
      return result;
    });
  }
  // POST /api/publish-page  — put the event page online, only after the lead approved the page copy.
  // Body: { approved: true, page_copy: "<the lead's approved text>" }
  if (req.method === "POST" && url === "/api/publish-page") {
    return handleJson(req, res, async (data) => {
      if (data.approved !== true) throw new Error("Refused: nothing is published without the lead clicking Approve.");
      const args = ["event-page/publish.js", "--approved"];
      if (data.page_copy) {
        const copyFile = path.join(require("os").tmpdir(), "event-autopilot-page-copy.txt");
        fs.writeFileSync(copyFile, data.page_copy);
        args.push("--page-copy-file=" + copyFile);
      }
      const out = await new Promise((resolve) => {
        require("child_process").execFile("node", args, { cwd: path.join(__dirname, "..", ".."), timeout: 180000 }, (err, stdout, stderr) =>
          resolve({ err, text: (stdout || "") + (stderr || "") }));
      });
      const urlLine = out.text.match(/Published: (\S+)/);
      if (!urlLine) throw new Error(out.text.trim().split("\n").filter(Boolean).pop() || "Publishing failed.");
      sending.appendLog({ at: new Date().toISOString(), channel: "event-page", ok: true, status: 200, preview: urlLine[1] });
      return { ok: true, url: urlLine[1], note: out.text.trim().split("\n").pop() };
    });
  }
  // GET /newsletter/  — preview the branded newsletter email for the current event
  if (url === "/newsletter" || url === "/newsletter/") {
    try {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(buildNewsletterHtml());
    } catch (err) {
      res.writeHead(404);
      return res.end(err.message);
    }
  }
  // POST /api/share-link  — a pre-filled WhatsApp or LinkedIn message the lead sends by hand
  if (req.method === "POST" && url === "/api/share-link") {
    return handleJson(req, res, async (data) => ({
      url: data.channel === "whatsapp" ? sending.whatsappLink(data.text) : sending.linkedinLink(data.text),
    }));
  }
  // POST /api/regenerate  — ask Grok for a fresh version of one item (a draft; the page still needs Approve)
  if (req.method === "POST" && url === "/api/regenerate") {
    return handleJson(req, res, async (data) => {
      const event = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, "event.json"), "utf8"));
      return { result: await regenerateItem(data.id, event, data.current, data.note) };
    });
  }

  // POST /api/launch  {input} or {mode:"production"}  — start the autopilot (drafts only, nothing is sent)
  if (req.method === "POST" && url === "/api/launch") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    return req.on("end", () => {
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch { /* treat as empty */ }
      const mode = data.mode === "production" ? "production" : "full";
      const input = String(data.input || "").trim();
      // Also refuse if another program (command line, Grok Bot) is in the middle of a run
      let other = {};
      try { other = JSON.parse(readStatus()); } catch { /* ignore */ }
      const otherBusy = other.state === "running" && Date.now() - fs.statSync(STATUS_FILE).mtimeMs < 10 * 60 * 1000;
      const reply = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (launchRunning || otherBusy) return reply(409, { error: "A run is already going. Wait for it to finish." });
      if (mode === "full" && !input) return reply(400, { error: "Type one line about the event, or paste a Luma link." });
      launchRunning = true;
      let runId = null;
      runAutopilot({ input, mode }, (status) => {
        if (!runId) { runId = status.runId; reply(200, { runId }); }
        broadcast(JSON.stringify(status));
      }).finally(() => { launchRunning = false; });
    });
  }
  // GET /api/launch/status  — the latest status.json (or {state:"idle"})
  if (url === "/api/launch/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(readStatus());
  }
  // GET /api/launch/stream  — live updates (Server-Sent Events): the status now, then on every change
  if (url === "/api/launch/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`data: ${readStatus().replace(/\n/g, "")}\n\n`);
    streams.add(res);
    return req.on("close", () => streams.delete(res));
  }
  // The built event page (a draft preview; publishing happens only after Approve)
  if (url === "/event-page" || url === "/event-page/") return sendFile(res, EVENT_PAGE_DIR, "index.html");
  if (url.startsWith("/event-page/")) return sendFile(res, EVENT_PAGE_DIR, url.slice("/event-page/".length));
  if (url === "/launch" || url === "/launch/") return sendFile(res, __dirname, "launch.html");

  if (url === "/api/images") {
    // List the PNG files in the output folder
    const files = fs.existsSync(OUTPUT_DIR) ? fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".png")) : [];
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(files));
  }
  // The weekly digest tab shows templates/digest-newsletter.html, which reads one sample data file.
  // Only that file is shared from data/ (the rest of data/ stays private).
  if (url.startsWith("/templates/")) return sendFile(res, TEMPLATES_DIR, url.slice("/templates/".length));
  if (url === "/data/digest-sample.json") return sendFile(res, DATA_DIR, "digest-sample.json");
  if (url === "/data/digest-week.json") return sendFile(res, DATA_DIR, "digest-week.json"); // live week from Luma (digest/fetch-week.js)
  if (url.startsWith("/shared/")) return sendFile(res, SHARED_DIR, url.slice("/shared/".length));
  if (url.startsWith("/output/")) return sendFile(res, OUTPUT_DIR, url.slice("/output/".length));
  sendFile(res, __dirname, url === "/" ? "index.html" : url.slice(1));
}).listen(PORT, () => console.log(`Dashboard running: open http://localhost:${PORT}`));
