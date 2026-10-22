// Builds the run sheet for the night from shared/event.json.
// Run:  node run-sheet/build.js            (event lasts 3 hours)
//       node run-sheet/build.js --hours 2.5
// Writes run-sheet.md, run-sheet.json and event.ics into run-sheet/output/.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'output');
const event = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'event.json'), 'utf8'));

// --- How long the event runs (default 3 hours, or --hours N) ---
const args = process.argv.slice(2);
const hoursIdx = args.indexOf('--hours');
const hours = hoursIdx >= 0 ? Number(args[hoursIdx + 1]) : 3;
if (!(hours > 0)) { console.error('--hours needs a positive number, e.g. --hours 2.5'); process.exit(1); }

// --- Time helpers. We count minutes from midnight on the event day. ---
const [startH, startM] = event.time.split(':').map(Number);
const startMin = startH * 60 + startM;
const closeMin = startMin + Math.round(hours * 60);

// Turn minutes-from-midnight into "HH:MM" (wraps past midnight).
function hhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
// Round to the nearest 5 minutes so the sheet looks tidy.
const r5 = (n) => Math.round(n / 5) * 5;

// --- The timing blocks for the night ---
// Main programme = welcome end to close, split into talks / break / talks / networking.
const welcomeEnd = startMin + 15;
const main = closeMin - welcomeEnd;
const talks1 = r5(main * 0.3);
const breakLen = 15;
const talks2 = r5(main * 0.3);
const networkingStart = welcomeEnd + talks1 + breakLen + talks2;
const hostNames = event.hosts.join(' and ');

const blocks = [
  { min: startMin - 60, what: 'Volunteers arrive', who: 'Lead', notes: 'Briefing, hand out roles, check the venue is open.' },
  { min: startMin - 55, what: 'Setup', who: 'AV, Food, Door', notes: 'Test projector and mic, lay out signage, set up the welcome table.' },
  { min: startMin - 15, what: 'Doors open', who: 'Door', notes: 'Greet guests, tick off names, point people to drinks.' },
  { min: startMin, what: 'Welcome', who: 'Lead', notes: (event.hosts && event.hosts.length > 1 ? 'Hosts ' + hostNames + ' say hello' : 'Host ' + hostNames + ' says hello') + ', housekeeping, the plan for the night.' },
  { min: welcomeEnd, what: 'Talks and demos, part 1', who: 'AV', notes: 'Keep each demo to time. Floater watches the door.' },
  { min: welcomeEnd + talks1, what: 'Break', who: 'Food', notes: 'Food and drinks out. Quick room reset.' },
  { min: welcomeEnd + talks1 + breakLen, what: 'Talks and demos, part 2', who: 'AV', notes: 'Second round of demos and feedback.' },
  { min: networkingStart, what: 'Networking', who: 'Floater', notes: 'Introduce people who are standing alone. Music low.' },
  { min: closeMin, what: 'Close', who: 'Lead', notes: 'Thank everyone, next event date, nudge people out.' },
  { min: closeMin + 30, what: 'Pack-down', who: 'Lead, AV, Food, Door, Floater', notes: 'Bins out, kit packed, venue left as found.' },
];
const rows = blocks.map((b) => ({ time: hhmm(b.min), what: b.what, who: b.who, notes: b.notes }));
const packDownEnd = closeMin + 60;

// --- Budget: made-up starting numbers sized by guest_count ---
const n = event.guest_count;
const budget = [
  ['Pizza', '~£3 x ' + n, 3 * n],
  ['Drinks', '~£2 x ' + n, 2 * n],
  ['Printing (signs, name labels)', 'flat', 20],
];
const budgetTotal = budget.reduce((s, b) => s + b[2], 0);

// --- run-sheet.md ---
const md = [];
md.push('# Run sheet: ' + event.name);
md.push('');
md.push('- **Date:** ' + event.date + '  ');
md.push('- **Start:** ' + event.time + ' (doors ' + hhmm(startMin - 15) + ', close ' + hhmm(closeMin) + ')  ');
md.push('- **Venue:** ' + event.venue + '  ');
md.push('- **Hosts:** ' + hostNames + '  ');
md.push('- **Expected guests:** ' + n);
md.push('');
md.push('## Timings');
md.push('');
md.push('| Time | What | Who | Notes |');
md.push('|---|---|---|---|');
for (const r of rows) md.push('| ' + r.time + ' | ' + r.what + ' | ' + r.who + ' | ' + r.notes + ' |');
md.push('');
md.push('## Volunteer rota');
md.push('');
md.push('| Role | Name | Shift |');
md.push('|---|---|---|');
md.push('| Lead | | ' + hhmm(startMin - 60) + ' - ' + hhmm(packDownEnd) + ' |');
md.push('| Door | | ' + hhmm(startMin - 55) + ' - ' + hhmm(startMin + 45) + ' |');
md.push('| AV | | ' + hhmm(startMin - 55) + ' - ' + hhmm(networkingStart) + ' |');
md.push('| Food | | ' + hhmm(startMin - 55) + ' - ' + hhmm(packDownEnd) + ' |');
md.push('| Floater | | ' + hhmm(startMin - 15) + ' - ' + hhmm(packDownEnd) + ' |');
md.push('');
md.push('## Suggested budget');
md.push('');
md.push('**Made-up starting numbers, edit before use.** Sized for ' + n + ' guests.');
md.push('');
md.push('| Item | Basis | Cost |');
md.push('|---|---|---|');
for (const b of budget) md.push('| ' + b[0] + ' | ' + b[1] + ' | £' + b[2] + ' |');
md.push('| **Total** | | **£' + budgetTotal + '** |');
md.push('');
md.push('## Night-of checklist');
md.push('');
[
  'Venue keys / contact number saved on the Lead\'s phone',
  'Projector, mic and HDMI adapters tested',
  'Guest list printed or open on a phone at the door',
  'Signage up: entrance, toilets, Wi-Fi password',
  'Food order confirmed for ' + hhmm(welcomeEnd + talks1) + ' delivery',
  'Drinks chilled and cups out',
  'Photo taker named (ask guests before posting)',
  'Bin bags and a first-aid kit to hand',
].forEach((item) => md.push('- [ ] ' + item));
md.push('');

// --- event.ics (written by hand, RFC 5545) ---
// Europe/London wall-clock -> UTC Date, so the invite is right wherever this script runs.
function londonToUtc(dateStr, min) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, 0, 0) + min * 60000);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(guess);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  // Offset = what London shows minus what UTC shows (minutes), then shift back.
  let offset = get('hour') * 60 + get('minute') - (guess.getUTCHours() * 60 + guess.getUTCMinutes());
  if (offset > 720) offset -= 1440; else if (offset < -720) offset += 1440;
  return new Date(guess.getTime() - offset * 60000);
}
const stamp = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261112T183000Z
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Fold a line so no row is longer than 75 bytes (continuation rows start with a space).
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (Buffer.byteLength(cur + ch) > limit) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.map((l, i) => (i === 0 ? l : ' ' + l)).join('\r\n');
}

const now = stamp(new Date());
const slug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
function vevent(uid, startMinOfDay, endMinOfDay, summary, description) {
  return [
    'BEGIN:VEVENT',
    'UID:' + uid + '@event-autopilot',
    'DTSTAMP:' + now,
    'DTSTART:' + stamp(londonToUtc(event.date, startMinOfDay)),
    'DTEND:' + stamp(londonToUtc(event.date, endMinOfDay)),
    'SUMMARY:' + esc(summary),
    'LOCATION:' + esc(event.venue),
    'DESCRIPTION:' + esc(description),
    'END:VEVENT',
  ];
}
let lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Event Autopilot//Run Sheet//EN', 'CALSCALE:GREGORIAN'];
lines = lines.concat(vevent(slug + '-' + event.date, startMin, closeMin, event.name, event.description));
blocks.forEach((b, i) => {
  const end = i + 1 < blocks.length ? blocks[i + 1].min : packDownEnd;
  lines = lines.concat(vevent(slug + '-' + event.date + '-block-' + (i + 1), b.min, end, '[Volunteers] ' + b.what + ' (' + b.who + ')', b.notes));
});
lines.push('END:VCALENDAR');
const ics = lines.map(fold).join('\r\n') + '\r\n';

// --- Write everything ---
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'run-sheet.md'), md.join('\n'));
console.log('Wrote run-sheet/output/run-sheet.md (' + rows.length + ' timed blocks, rota, budget, checklist)');
fs.writeFileSync(path.join(OUT, 'run-sheet.json'), JSON.stringify(rows, null, 2) + '\n');
console.log('Wrote run-sheet/output/run-sheet.json (' + rows.length + ' blocks)');
fs.writeFileSync(path.join(OUT, 'event.ics'), ics);
console.log('Wrote run-sheet/output/event.ics (1 event + ' + blocks.length + ' volunteer events)');
