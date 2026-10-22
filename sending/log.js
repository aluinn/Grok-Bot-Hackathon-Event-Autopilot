// Keeps a simple record of what was sent and when, one JSON line per send.
// File: sending/output/sent-log.jsonl
const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "output");
const LOG_FILE = path.join(LOG_DIR, "sent-log.jsonl");

// entry = { channel, ok, status, preview } ; "at" is added automatically
function appendLog(entry) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const line = {
    at: new Date().toISOString(),
    channel: entry.channel,
    ok: entry.ok,
    status: entry.status,
    preview: String(entry.preview || "").slice(0, 120), // first 120 characters, enough to recognise it
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(line) + "\n");
  return LOG_FILE;
}

module.exports = { appendLog, LOG_FILE };
