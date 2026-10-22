// A tiny web server for the dashboard. It only READS files and shows them. It never sends anything anywhere.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4010;
const SHARED_DIR = path.join(__dirname, "..", "..", "shared"); // event.json + promo.json
const OUTPUT_DIR = path.join(__dirname, "..", "output");        // promo images
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

// Send one file to the browser (only if it lives inside the allowed folder)
function sendFile(res, folder, name) {
  const file = path.join(folder, name);
  if (!file.startsWith(folder) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

// Sending (only after Approve) and regenerating (Grok) live in their own folders
const sending = require("../../sending");
const { regenerateItem } = require("../../copy-generator/regenerate");

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
      else if (channel === "ghost") result = await sending.createGhostDraft({ subject: data.subject, body: data.body, approved: true });
      else throw new Error(`Unknown channel "${channel}".`);
      sending.appendLog({ at: new Date().toISOString(), channel, ok: result.ok, status: result.status, preview: (data.text || data.subject || "").slice(0, 80) });
      return result;
    });
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

  if (url === "/api/images") {
    // List the PNG files in the output folder
    const files = fs.existsSync(OUTPUT_DIR) ? fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".png")) : [];
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(files));
  }
  if (url.startsWith("/shared/")) return sendFile(res, SHARED_DIR, url.slice("/shared/".length));
  if (url.startsWith("/output/")) return sendFile(res, OUTPUT_DIR, url.slice("/output/".length));
  sendFile(res, __dirname, url === "/" ? "index.html" : url.slice(1));
}).listen(PORT, () => console.log(`Dashboard running: open http://localhost:${PORT}`));
