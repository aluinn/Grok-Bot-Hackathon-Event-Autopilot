// Fetches this week's events from a Luma calendar and saves them to data/digest-week.json
// for the dashboard's "Weekly digest" tab. Read-only: it never sends or posts anything.
//
// Use:  node digest/fetch-week.js [calendar id or Luma calendar link] [--days 7]
// Calendar: the first argument, else LUMA_CALENDAR_ID in .env, else the brief's example calendar.

const fs = require("fs");
const path = require("path");
const { loadEnv } = require("../copy-generator/grok");
const { fetchLumaEvent } = require("../intake/luma");

const OUT_FILE = path.join(__dirname, "..", "data", "digest-week.json");
const DEFAULT_CALENDAR = "cal-wUKLVX9VWOdVkpg";
const MAX_EVENTS = 12;   // the newsletter is designed for a handful of events
const AT_ONCE = 4;       // how many Luma requests we make at the same time
const TIMEZONE = "Europe/London";

// ---------- reading the command line ----------

function readArgs() {
  const args = process.argv.slice(2);
  let days = 7, calendar = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days") days = Number(args[++i]) || 7;
    else calendar = args[i];
  }
  loadEnv();
  return { days, calendar: calendar || process.env.LUMA_CALENDAR_ID || DEFAULT_CALENDAR };
}

// Turn what the user typed into a "cal-..." id.
// A calendar page link (lu.ma/<name>) is best effort: we open the page and take the "cal-..." id it mentions most.
// Real ids are long ("cal-" + about 15 letters/digits), which skips page words like "cal-padding".
async function calendarIdFrom(input) {
  const direct = String(input).match(/cal-[A-Za-z0-9]{12,}/);
  if (direct) return direct[0];
  const url = /^https?:\/\//.test(input) ? input : `https://lu.ma/${input}`;
  const page = await fetch(url);
  if (!page.ok) throw new Error(`Luma has no calendar page at ${url} (HTTP ${page.status}). Paste the "cal-..." id instead.`);
  const html = await page.text();
  const counts = {};
  for (const id of html.match(/cal-[A-Za-z0-9]{12,}/g) || []) counts[id] = (counts[id] || 0) + 1;
  const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (!best) throw new Error(`Could not find a Luma calendar id on ${url}. Paste the "cal-..." id instead.`);
  return best;
}

// ---------- reading the calendar file (iCalendar / .ics) ----------

// Undo the .ics escaping: "\n" means a new line, "\," a comma, and so on
const unescapeText = (s) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

// Wall-clock time in a timezone -> real moment. Guess it as UTC, then correct by that zone's offset.
function zonedToDate(y, mo, d, h, mi, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).reduce((o, x) => ((o[x.type] = x.value), o), {});
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (shown - guess));
}

// DTSTART value -> Date. Handles "20261022T160000Z", TZID=Europe/London times and date-only "20261022".
function parseIcsDate(params, value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined) return zonedToDate(+y, +mo, +d, 0, 0, TIMEZONE);           // all-day event
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));                       // already UTC
  const tz = (params.match(/TZID=([^;:]+)/) || [])[1] || TIMEZONE;                  // local time in a zone
  try { return zonedToDate(+y, +mo, +d, +h, +mi, tz); } catch { return zonedToDate(+y, +mo, +d, +h, +mi, TIMEZONE); }
}

// Split the .ics text into simple event objects
function parseIcs(text) {
  // Long lines are folded: a line starting with a space continues the line before it
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT") { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const m = line.match(/^([A-Z-]+)([^:]*):(.*)$/); // NAME;PARAMS:VALUE
    if (!m) continue;
    const [, key, params, value] = m;
    if (key === "DTSTART") { current.start = parseIcsDate(params, value); current.allDay = /^\d{8}$/.test(value); }
    if (key === "DTEND") current.end = parseIcsDate(params, value);
    if (key === "SUMMARY") current.summary = unescapeText(value);
    if (key === "LOCATION") current.location = unescapeText(value);
    if (key === "DESCRIPTION") current.description = unescapeText(value);
    if (key === "URL") current.url = value;
  }
  return events;
}

// Luma puts the event link in the description ("Get up-to-date information at: https://luma.com/abc")
function eventLink(e) {
  const text = (e.url || "") + " " + (e.description || "");
  const m = text.match(/https?:\/\/(?:lu\.ma|luma\.com)\/([A-Za-z0-9_-]+)/);
  return m ? { url: m[0], code: m[1] } : null;
}

// Date -> { date: "2026-10-22", time: "17:00" } in London time
function londonDateTime(d) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// The event in our usual shape, using only what the calendar file says (used if Luma's event API fails)
function fromIcs(e, link) {
  const when = londonDateTime(e.start);
  const description = (e.description || "").replace(/^Get up-to-date information at:.*\n*/i, "").trim();
  return { name: e.summary || "Upcoming event", date: when.date, time: e.allDay ? "" : when.time, venue: e.location || "",
    description, hosts: [], guest_count: 0, url: link ? link.url : "" };
}

// Run `work` on every item, at most `limit` at a time, keeping the original order
async function inBatches(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; results[i] = await work(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------- main ----------

async function main() {
  const { days, calendar } = readArgs();
  const calId = await calendarIdFrom(calendar);

  const response = await fetch(`https://api.lu.ma/ics/get?entity=calendar&id=${encodeURIComponent(calId)}`);
  if (!response.ok) throw new Error(`Luma did not return the calendar ${calId} (HTTP ${response.status}).`);
  const all = parseIcs(await response.text());

  // Keep events that are still on or start within the next N days, soonest first
  const now = Date.now(), until = now + days * 24 * 60 * 60 * 1000;
  const week = all
    .filter((e) => e.start && (e.end || e.start) > now && e.start < until)
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_EVENTS);

  // Fill in hosts, guest count and full description from Luma's event API, falling back to the calendar file
  let enriched = 0;
  const events = await inBatches(week, AT_ONCE, async (e) => {
    const link = eventLink(e);
    if (!link) return fromIcs(e, link);
    try {
      const event = await fetchLumaEvent(link.code);
      enriched++;
      return { ...event, url: link.url };
    } catch { return fromIcs(e, link); }
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(events, null, 2) + "\n");
  if (!events.length) return console.log(`No events on ${calId} in the next ${days} days. Wrote an empty list to data/digest-week.json.`);
  console.log(`${events.length} event(s) in the next ${days} days on ${calId} (${enriched} with full Luma details) saved to data/digest-week.json. First: ${events[0].name} on ${events[0].date} ${events[0].time}.`);
}

// Run when started from the command line (exitCode, not exit(), avoids a Node-on-Windows crash message)
if (require.main === module) {
  main().catch((err) => { console.error("Could not build this week's digest: " + err.message); process.exitCode = 1; });
}
module.exports = { parseIcs, fromIcs, eventLink };
