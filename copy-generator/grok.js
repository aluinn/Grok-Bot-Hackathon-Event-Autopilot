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
// `extra` (optional) is an object merged into the request body, e.g. xAI's search_parameters.
async function askGrokForJson({ system, user, extra = {} }) {
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
      ...extra,
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

// Ask Grok a question that needs fresh facts from the web (e.g. who sponsors London meetups).
// Uses xAI's Agent Tools (the /v1/responses endpoint with the web_search tool), which replaced the old
// "live search" option. Grok searches by itself, then answers; we pull the JSON out of its answer.
async function askGrokWithWebSearchForJson({ system, user }) {
  loadEnv();
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY is missing. Put it in the .env file at the project root (see .env.example).");

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROK_SEARCH_MODEL || "grok-4.7",
      input: [
        { role: "system", content: system + "\nReply with the JSON object only, no other text." },
        { role: "user", content: user },
      ],
      tools: [{ type: "web_search" }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Grok replied with HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = await response.json();

  // The answer text is in output[].content[] items of type "output_text" (or a ready-made output_text field)
  const text = data.output_text || (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((c) => c.type === "output_text" && c.text)
    .map((c) => c.text)
    .join("\n");

  // Grok may wrap the JSON in ```json fences or a sentence; take the outermost {...}
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Grok's search answer had no JSON in it. It said: " + text.slice(0, 200));
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Grok's search answer was not valid JSON. It said: " + text.slice(0, 200));
  }
}

module.exports = { askGrokForJson, askGrokWithWebSearchForJson, loadEnv };
