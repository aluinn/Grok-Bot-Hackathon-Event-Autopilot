// Creates a DRAFT newsletter post in Ghost. It never publishes and never emails anyone.
// The lead opens Ghost afterwards to review and send it by hand.
// Only runs when approved === true (the lead clicked Approve). Otherwise it refuses.
const crypto = require("crypto");
const env = require("./env");

// Base64url = base64 without padding and with URL-safe characters (what JWT uses)
function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Build the short-lived login token Ghost's Admin API expects (HS256 JWT, 5 minutes)
function makeToken(apiKey) {
  const [id, secret] = apiKey.split(":");
  if (!id || !secret) {
    throw new Error("GHOST_ADMIN_API_KEY looks wrong. It should be in the form id:secret (copy it from Ghost > Settings > Integrations).");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }));
  const claims = base64url(JSON.stringify({ iat: now, exp: now + 5 * 60, aud: "/admin/" }));
  const signature = crypto
    .createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`${header}.${claims}`)
    .digest("base64")
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${header}.${claims}.${signature}`;
}

// Turn plain text with blank-line paragraphs into simple <p> HTML
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function toHtml(body) {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

async function createGhostDraft({ subject, body, approved }) {
  if (approved !== true) {
    throw new Error("Refused: nothing is sent without the lead clicking Approve.");
  }
  if (!subject || !body) throw new Error("Nothing to draft: the newsletter subject or body is empty.");

  const adminUrl = env.get("GHOST_ADMIN_URL").replace(/\/+$/, ""); // drop trailing slash
  const token = makeToken(env.get("GHOST_ADMIN_API_KEY"));

  const res = await fetch(`${adminUrl}/ghost/api/admin/posts/?source=html`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Ghost ${token}` },
    // status: "draft" is what keeps this a draft. Never change it to "published".
    body: JSON.stringify({ posts: [{ title: subject, html: toHtml(body), status: "draft" }] }),
  });

  let data = {};
  try { data = await res.json(); } catch (_) { /* some errors have no JSON body */ }

  if (!res.ok) {
    const msg = data.errors && data.errors[0] ? data.errors[0].message : `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: msg };
  }
  const post = data.posts && data.posts[0] ? data.posts[0] : {};
  // Ghost returns the draft's id; build a handy link to edit it in the Ghost admin
  return {
    ok: true,
    status: res.status,
    id: post.id,
    url: post.id ? `${adminUrl}/ghost/#/editor/post/${post.id}` : undefined,
  };
}

module.exports = { createGhostDraft, makeToken, toHtml };
