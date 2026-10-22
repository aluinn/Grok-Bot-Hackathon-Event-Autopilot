// Rewrites ONE promo item with Grok, for the dashboard's "Regenerate" button.
// Used by the dashboard server: regenerateItem("linkedin", event, currentText) -> new text
// (for the newsletter it returns { subject, body }). It only returns a draft; it never saves or sends.

const { askGrokForJson } = require("./grok");

const WHAT = {
  page_copy: "the event page copy (2 short paragraphs)",
  newsletter: "the newsletter (subject under 60 characters, body 80 to 140 words with line breaks as \\n)",
  linkedin: "the LinkedIn post (60 to 110 words, hook first, max 3 hashtags at the end)",
  whatsapp: "the WhatsApp message (2 to 4 friendly lines, ends with a question)",
  discord: "the Discord post (1 to 3 casual lines, starts with @everyone or @here, asks people to react)",
};

async function regenerateItem(id, event, currentText, note = "") {
  if (!WHAT[id]) throw new Error(`I don't know how to regenerate "${id}".`);
  const system = `You write promo copy for community events: warm, specific, plain, no hype, no invented facts.
Write a fresh, different version of ${WHAT[id]}. Keep the date, time and venue exactly as in the event.
Reply with JSON only: ${id === "newsletter" ? '{"subject": string, "body": string}' : '{"text": string}'}`;
  const user = [
    `Event: ${JSON.stringify(event)}`,
    `Current version (write something noticeably different, same facts):\n${typeof currentText === "string" ? currentText : JSON.stringify(currentText)}`,
    note ? `The lead asked for: ${note}` : "",
  ].filter(Boolean).join("\n\n");
  const answer = await askGrokForJson({ system, user });
  return id === "newsletter"
    ? { subject: String(answer.subject || ""), body: String(answer.body || "") }
    : String(answer.text || "");
}

module.exports = { regenerateItem };
