// Builds the public event page: one self-contained HTML file with everything a guest needs.
// Usage: node event-page/build.js
// Reads shared/event.json, shared/promo.json, run-sheet/output/run-sheet.json and the promo images.
// Writes event-page/output/index.html (the page) and event-page/output/supabase-row.json (the same
// data for the Supabase "events" table). It only BUILDS the page; publishing happens after Approve.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(__dirname, "output");
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null);

// Make text safe to place inside HTML
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Turn plain text with blank lines into paragraphs
const paragraphs = (s) => String(s || "").split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
// "my Event: 2026!" -> "my-event-2026"
const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// "2026-12-05" -> "Saturday 5 December 2026"
function longDate(date) {
  const d = new Date(date + "T12:00:00");
  return isNaN(d) ? date : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// The guest-facing part of the run sheet (volunteer-only blocks like setup and pack-down are left out)
const BACKSTAGE = /volunteer|setup|set up|pack|brief/i;
function publicAgenda(runSheet) {
  return (runSheet || []).filter((b) => !BACKSTAGE.test(b.what));
}

// End time: the "Close" block of the run sheet, or three hours after the start
function endTime(event, runSheet) {
  const close = (runSheet || []).find((b) => /close/i.test(b.what));
  if (close) return close.time;
  const [h, m] = event.time.split(":").map(Number);
  return `${String((h + 3) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// A Google Calendar link (times are London local time; ctz tells Google which zone)
function googleCalendarLink(event, end, description) {
  const day = event.date.replace(/-/g, "");
  const t = (hhmm) => hhmm.replace(":", "") + "00";
  const params = new URLSearchParams({
    action: "TEMPLATE", text: event.name, dates: `${day}T${t(event.time)}/${day}T${t(end)}`,
    ctz: "Europe/London", location: event.venue, details: description.slice(0, 800),
  });
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

// A tiny .ics file for "Add to Apple/Outlook calendar", embedded in the page as a download link
function icsDataUri(event, end, description) {
  const day = event.date.replace(/-/g, "");
  const t = (hhmm) => hhmm.replace(":", "") + "00";
  const clean = (s) => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Event Autopilot//EN", "BEGIN:VEVENT",
    `UID:${slugify(event.name)}-${day}@event-autopilot`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/London:${day}T${t(event.time)}`, `DTEND;TZID=Europe/London:${day}T${t(end)}`,
    `SUMMARY:${clean(event.name)}`, `LOCATION:${clean(event.venue)}`, `DESCRIPTION:${clean(description.slice(0, 500))}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
}

// Every promo image we rendered, embedded so the page is a single file that works anywhere
const IMAGE_DIR = path.join(ROOT, "promo-and-approval-ui", "output");
const IMAGE_LABELS = { "promo-wide": "Wide (LinkedIn, X, newsletter header)", "promo-square": "Square (Instagram, LinkedIn)", "promo-story": "Story (WhatsApp status, Instagram stories)" };
function promoImages() {
  if (!fs.existsSync(IMAGE_DIR)) return [];
  return fs.readdirSync(IMAGE_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => Object.keys(IMAGE_LABELS).indexOf(a.replace(".png", "")) - Object.keys(IMAGE_LABELS).indexOf(b.replace(".png", "")))
    .map((f) => ({
      file: f,
      label: IMAGE_LABELS[f.replace(".png", "")] || f.replace(".png", ""),
      src: "data:image/png;base64," + fs.readFileSync(path.join(IMAGE_DIR, f)).toString("base64"),
    }));
}

function buildPage({ event, promo, agenda, end, rsvpUrl }) {
  const description = promo?.page_copy || event.description || "";
  const images = promoImages();
  const contact = (event.hosts || []).length ? `the hosts (${esc(event.hosts.join(", "))})` : "the hosts";
  const hosts = (event.hosts || []).filter(Boolean);
  const mapUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(event.venue);
  const venueKnown = !/to be confirmed/i.test(event.venue);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(event.name)}</title>
<meta name="description" content="${esc(event.description).slice(0, 160)}">
<meta property="og:title" content="${esc(event.name)}">
<meta property="og:description" content="${esc(longDate(event.date))} · ${esc(event.time)} · ${esc(event.venue)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
  /* Brand (brand/brand.md): dark background, one orange accent, no gradients, no shadows */
  :root { --bg:#0B0B0F; --card:#16161D; --line:#26262F; --accent:#FF5A1F; --text:#F5F5F7; --muted:#9A9AA5; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:17px/1.65 "Inter", sans-serif; -webkit-font-smoothing:antialiased; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 16px 80px; }
  h1, h2 { font-family:"Space Grotesk", sans-serif; letter-spacing:-0.03em; margin:0; }
  h1 { font-size: clamp(36px, 7vw, 64px); line-height:1.02; margin: 12px 0 24px; }
  h2 { font-size: 22px; margin: 0 0 14px; }
  .brand { font-family:"Space Grotesk", sans-serif; font-weight:700; font-size:18px; }
  .brand i { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--accent); margin-left:3px; }
  .eyebrow { color:var(--accent); font-size:13px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; margin: 36px 0 0; }
  .gallery { display:grid; grid-template-columns: 2fr 1.2fr 0.8fr; gap:12px; align-items:start; margin-top: 16px; }
  .shot { display:block; color:var(--muted); text-decoration:none; font-size:13px; }
  .shot img { width:100%; display:block; border-radius:10px; border:1px solid var(--line); margin-bottom:8px; transition: border-color .2s; }
  .shot:hover img { border-color: var(--accent); }
  @media (max-width: 640px) { .gallery { grid-template-columns: 1fr 1fr; } .shot.promo-wide { grid-column: 1 / -1; } }
  .facts { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin: 8px 0 28px; }
  .fact { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .fact span { display:block; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
  .fact b { font-weight:600; }
  .actions { display:flex; flex-wrap:wrap; gap:10px; margin-bottom: 36px; }
  .btn { display:inline-block; padding:12px 20px; border-radius:999px; border:1px solid var(--line); color:var(--text); text-decoration:none; font-weight:600; font-size:15px; }
  .btn.primary { background:var(--accent); border-color:var(--accent); color:var(--bg); }
  section { border-top:1px solid var(--line); padding: 28px 0; }
  section p { margin: 0 0 14px; color: #D9D9DE; }
  table { width:100%; border-collapse:collapse; }
  td { padding: 10px 0; border-bottom:1px solid var(--line); vertical-align:top; }
  td.time { width: 84px; font-family:"Space Grotesk", sans-serif; font-weight:700; color:var(--accent); }
  td small { display:block; color:var(--muted); font-size:14px; }
  footer { color:var(--muted); font-size:13px; padding-top: 28px; border-top:1px solid var(--line); }
</style>
</head>
<body>
<main>
  <div class="brand">Event Autopilot<i></i></div>
  <p class="eyebrow">You're invited</p>
  <h1>${esc(event.name)}</h1>

  <div class="facts">
    <div class="fact"><span>When</span><b>${esc(longDate(event.date))}</b><br>${esc(event.time)} to ${esc(end)}</div>
    <div class="fact"><span>Where</span><b>${esc(event.venue)}</b></div>
    ${hosts.length ? `<div class="fact"><span>Hosted by</span><b>${esc(hosts.join(", "))}</b></div>` : ""}
    ${event.guest_count ? `<div class="fact"><span>Going</span><b>${esc(event.guest_count)} people</b></div>` : ""}
  </div>

  <div class="actions">
    ${rsvpUrl ? `<a class="btn primary" href="${esc(rsvpUrl)}">Save your spot</a>` : ""}
    <a class="btn ${rsvpUrl ? "" : "primary"}" href="${googleCalendarLink(event, end, description)}" target="_blank" rel="noopener">Add to Google Calendar</a>
    <a class="btn" href="${icsDataUri(event, end, description)}" download="${slugify(event.name)}.ics">Add to Apple / Outlook</a>
    ${venueKnown ? `<a class="btn" href="${mapUrl}" target="_blank" rel="noopener">Map</a>` : ""}
  </div>

  <section>
    <h2>About</h2>
    ${paragraphs(description)}
  </section>

  ${agenda.length ? `<section>
    <h2>Programme</h2>
    <table>${agenda.map((b) => `<tr><td class="time">${esc(b.time)}</td><td>${esc(b.what)}${b.notes ? `<small>${esc(b.notes)}</small>` : ""}</td></tr>`).join("")}</table>
  </section>` : ""}

  ${images.length ? `<section>
    <h2>Spread the word</h2>
    <p>Share these on your channels. Tap one to download it.</p>
    <div class="gallery">${images.map((img) => `<a class="shot ${img.file.replace(".png", "")}" href="${img.src}" download="${slugify(event.name)}-${img.file}"><img src="${img.src}" alt="${esc(event.name)}: ${esc(img.label)}" loading="lazy"><span>${esc(img.label)}</span></a>`).join("")}</div>
  </section>` : ""}

  <section>
    <h2>Partner with us</h2>
    <p>We're looking for a few partners to help make the night happen: a venue, food and drinks, tools and credits for builders. Partners get their logo on the visuals and the newsletter, two minutes on stage and a table on the night. Get in touch with ${contact}.</p>
  </section>

  <footer>Page made with Event Autopilot, open source (MIT). Details may change; check back before you travel.</footer>
</main>
</body>
</html>
`;
}

function main() {
  const eventText = read("shared/event.json");
  if (!eventText) {
    console.log("There is no shared/event.json yet. Create the event first.");
    process.exit(1);
  }
  const event = JSON.parse(eventText);
  const promo = JSON.parse(read("shared/promo.json") || "null");
  // --page-copy-file=<path>: use the lead's edited page copy from the dashboard instead of promo.json
  const copyFile = process.argv.find((a) => a.startsWith("--page-copy-file="))?.slice(17);
  if (copyFile && promo && fs.existsSync(copyFile)) promo.page_copy = fs.readFileSync(copyFile, "utf8");
  const runSheet = JSON.parse(read("run-sheet/output/run-sheet.json") || "[]");
  const rsvpUrl = process.argv.find((a) => a.startsWith("--rsvp="))?.slice(7) || "";

  const agenda = publicAgenda(runSheet);
  const end = endTime(event, runSheet);
  const html = buildPage({ event, promo, agenda, end, rsvpUrl });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);

  // The same information as one row for the Supabase "events" table (see supabase/schema.sql)
  const row = {
    slug: slugify(event.name) + "-" + event.date,
    name: event.name, date: event.date, start_time: event.time, end_time: end,
    venue: event.venue, description: event.description, hosts: event.hosts || [], guest_count: event.guest_count || 0,
    page_copy: promo?.page_copy || null, newsletter: promo?.newsletter || null, posts: promo?.posts || null,
    agenda, rsvp_url: rsvpUrl || null, published: false, page_url: null,
  };
  fs.writeFileSync(path.join(OUT_DIR, "supabase-row.json"), JSON.stringify(row, null, 2) + "\n");

  console.log(`Built event-page/output/index.html for "${event.name}" (${agenda.length} programme items, ${Math.round(html.length / 1024)} KB).`);
  console.log("Also wrote event-page/output/supabase-row.json. Nothing is published until the lead approves.");
}

main();
