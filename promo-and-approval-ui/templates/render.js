// Turns event.json into 3 promo pictures (square, wide, story) using the HTML templates and Puppeteer.
// Run it:  node render.js [path to event.json]
// Or use it from other code:  const { renderPromo } = require("./render.js");  const files = await renderPromo(eventData);
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const DEFAULT_OUTPUT = path.join(__dirname, "..", "output");

// The three sizes: file name, template, width, height
const SIZES = [
  { name: "square", width: 1080, height: 1080 },
  { name: "wide", width: 1200, height: 630 },
  { name: "story", width: 1080, height: 1920 },
];

// Make text safe to place inside HTML
function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "2026-11-12" becomes "Thursday 12 November 2026" (if it isn't a real date, show it as typed)
function prettyDate(date) {
  const d = new Date(date + "T12:00:00");
  if (isNaN(d)) return date;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Join names: "A", "A & B", "A, B & C"
function joinHosts(hosts) {
  if (hosts.length <= 1) return hosts.join("");
  return hosts.slice(0, -1).join(", ") + " & " + hosts[hosts.length - 1];
}

// Build the HTML pieces. Anything missing from event.json is simply left out.
function buildPieces(event) {
  const hosts = Array.isArray(event.hosts) ? event.hosts.filter(Boolean) : [];
  const when = [event.date ? prettyDate(event.date) : "", event.time || ""].filter(Boolean).join(" · ");
  const hasGuests = Number.isFinite(Number(event.guest_count)) && event.guest_count !== null && event.guest_count !== "";

  return {
    NAME: esc(event.name || "Upcoming event"),
    WHEN: when ? `<div class="when" data-fit>${esc(when)}</div>` : "",
    VENUE: event.venue ? `<div class="venue" data-fit>${esc(event.venue)}</div>` : "",
    HOSTS: hosts.length ? `<div class="hosts" data-fit>Hosted by ${esc(joinHosts(hosts))}</div>` : "",
    BADGE: hasGuests ? `<div class="badge">${esc(event.guest_count)} going</div>` : "",
  };
}

async function renderPromo(eventData, outputDir = DEFAULT_OUTPUT) {
  fs.mkdirSync(outputDir, { recursive: true });
  const pieces = buildPieces(eventData);
  const browser = await puppeteer.launch();
  const files = [];

  try {
    for (const size of SIZES) {
      // Fill the template and save a temporary copy next to it (so the CSS and fonts load)
      let html = fs.readFileSync(path.join(__dirname, size.name + ".html"), "utf8");
      for (const [key, value] of Object.entries(pieces)) html = html.replace(`{{${key}}}`, () => value);
      const tempFile = path.join(__dirname, `_filled-${size.name}.html`);
      fs.writeFileSync(tempFile, html);

      const page = await browser.newPage();
      await page.setViewport({ width: size.width, height: size.height });
      await page.goto("file://" + tempFile, { waitUntil: "networkidle0" });
      await page.waitForSelector("body[data-ready]"); // text shrinking has finished

      const outFile = path.join(outputDir, `promo-${size.name}.png`);
      await page.screenshot({ path: outFile });
      await page.close();
      fs.unlinkSync(tempFile);
      files.push(outFile);
    }
  } finally {
    await browser.close();
  }
  return files;
}

module.exports = { renderPromo };

// If you run this file directly:  node render.js [event.json path]
if (require.main === module) {
  const eventPath = process.argv[2] || path.join(__dirname, "..", "..", "shared", "event.json");
  const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  renderPromo(eventData).then((files) => console.log("Created:\n" + files.join("\n")));
}
