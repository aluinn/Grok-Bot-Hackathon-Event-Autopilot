// A tiny client for Grok (xAI's model). Every part that needs writing or judgement calls this.
// Needs XAI_API_KEY in the .env file at the repo root. Optional: GROK_MODEL (default grok-4-fast).

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");
const API_URL = "https://api.x.ai/v1/chat/completions";

// Read KEY=VALUE lines from .env into process.env (without overriding what's already set)
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;
    const value = match[2].replace(/^["']|["']$/g, ""); // strip surrounding quotes
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

// Ask Grok a question and get a JSON object back.
// `system` says who Grok is for this job, `user` is the request. Both plain strings.
async function askGrokForJson({ system, user }) {
  loadEnv();
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY is missing. Put it in the .env file at the project root (see .env.example).");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROK_MODEL || "grok-4-fast",
      temperature: 0.7,
      response_format: { type: "json_object" }, // makes Grok answer with JSON only
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Grok replied with HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data.choices[0].message.content;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Grok's answer was not valid JSON. Try again. It said: " + text.slice(0, 200));
  }
}

module.exports = { askGrokForJson, loadEnv };
