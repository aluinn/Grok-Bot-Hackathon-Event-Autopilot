// Builds the branded newsletter email for the current event, using aluinn's template
// (templates/render-newsletter.js) and the copy in shared/promo.json.
// Usage: node newsletter/build.js
// Writes newsletter/output/newsletter.html. It only BUILDS the email: sending (a Ghost draft) waits for Approve.

const fs = require("fs");
const path = require("path");
const { renderNewsletter } = require("../templates/render-newsletter.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(__dirname, "output");
const readJson = (rel) => {
  const file = path.join(ROOT, rel);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
};

// Email images must live on the internet (inboxes block embedded ones), so the poster and the
// "Save your spot" button only appear once the event page has been published (event-page/publish.js).
function linksForEmail() {
  const published = readJson("event-page/output/published.json");
  if (!published || !published.page_url) return {};
  return { posterUrl: published.page_url.replace(/\/$/, "") + "/promo-wide.png", ctaUrl: published.page_url };
}

// Build the email HTML. `newsletter` can override the subject/body (e.g. the lead's edits in the dashboard).
function buildNewsletterHtml(newsletter) {
  const event = readJson("shared/event.json");
  const promo = readJson("shared/promo.json") || {};
  if (!event) throw new Error("There is no shared/event.json yet. Create the event first.");
  const merged = { ...promo, newsletter: { ...(promo.newsletter || {}), ...(newsletter || {}) } };
  return renderNewsletter(event, merged, linksForEmail());
}

function main() {
  const html = buildNewsletterHtml();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "newsletter.html"), html);
  const hasPoster = Boolean(linksForEmail().posterUrl);
  console.log(`Built newsletter/output/newsletter.html (${Math.round(html.length / 1024)} KB, ${hasPoster ? "with the poster and RSVP button" : "poster appears once the event page is published"}). Nothing was sent.`);
}

if (require.main === module) {
  try { main(); } catch (err) { console.log("Could not build the newsletter. " + err.message); process.exitCode = 1; }
}

module.exports = { buildNewsletterHtml };
