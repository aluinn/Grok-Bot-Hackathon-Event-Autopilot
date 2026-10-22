// Posts one message to a Discord channel through a webhook.
// Only runs when approved === true (the lead clicked Approve). Otherwise it refuses.
const env = require("./env");

const DISCORD_MAX = 2000; // Discord rejects messages longer than this

async function sendDiscord({ text, approved }) {
  if (approved !== true) {
    throw new Error("Refused: nothing is sent without the lead clicking Approve.");
  }
  if (!text || !text.trim()) throw new Error("Nothing to send: the Discord post is empty.");

  const url = env.get("DISCORD_WEBHOOK_URL");

  // Keep within Discord's length limit
  let content = text;
  if (content.length > DISCORD_MAX) content = content.slice(0, DISCORD_MAX - 1) + "…";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  // Discord answers 204 (no body) on success
  return { ok: res.ok, status: res.status, sentAt: new Date().toISOString() };
}

module.exports = { sendDiscord };
