// Cognee is the community's memory: past events, posts and newsletters live there as a knowledge graph,
// and Grok asks it "how does this community write?" before drafting anything.
// Needs COGNEE_BASE_URL and COGNEE_API_KEY in .env. Without them, every function here quietly does nothing.

const { loadEnv } = require("../copy-generator/grok");

const DATASET = "community-voice"; // one dataset per community; rename if you run several

function settings() {
  loadEnv();
  const base = process.env.COGNEE_BASE_URL, key = process.env.COGNEE_API_KEY;
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ""), headers: { "Content-Type": "application/json", "X-Api-Key": key } };
}

async function call(path, body, attempt = 1) {
  const s = settings();
  let response;
  try {
    response = await fetch(s.base + path, { method: "POST", headers: s.headers, body: JSON.stringify(body) });
  } catch (err) {
    // A dropped connection ("fetch failed") is usually a blip: wait a moment and try once more
    if (attempt < 3) { await new Promise((r) => setTimeout(r, 2000 * attempt)); return call(path, body, attempt + 1); }
    throw new Error(`Cognee could not be reached on ${path} (${err.cause?.code || err.message}).`);
  }
  const textBody = await response.text();
  if (!response.ok) throw new Error(`Cognee replied with HTTP ${response.status} on ${path}: ${textBody.slice(0, 200)}`);
  try { return JSON.parse(textBody); } catch { return textBody; }
}

// Save a list of texts (past posts, event pages) into the community's memory and build the graph
async function remember(texts) {
  if (!settings()) return { skipped: "Cognee is not set up (COGNEE_BASE_URL / COGNEE_API_KEY missing)." };
  await call("/api/v1/add_text", { textData: texts, datasetName: DATASET });
  await call("/api/v1/cognify", { datasets: [DATASET], runInBackground: false });
  return { saved: texts.length, dataset: DATASET };
}

// Ask the memory a question and get plain text back (passages + a short answer)
async function recall(question) {
  if (!settings()) return "";
  const result = await call("/api/v1/search", { query: question, searchType: "HYBRID_COMPLETION", datasets: [DATASET], topK: 8 });
  // Cognee answers with { search_result: [...] } (or a list of those, one per dataset)
  const groups = Array.isArray(result) ? result : [result];
  const answers = groups.flatMap((g) => (g && g.search_result) || (typeof g === "string" ? [g] : []));
  return answers.map((a) => (typeof a === "string" ? a : a.text || a.content || JSON.stringify(a))).join("\n\n").slice(0, 6000);
}

module.exports = { remember, recall, DATASET };
