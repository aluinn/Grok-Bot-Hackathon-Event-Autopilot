// Quick sanity check of run-sheet/output/event.ics against RFC 5545 basics.
// Run:  node run-sheet/check.js
const fs = require('fs');
const path = require('path');

const text = fs.readFileSync(path.join(__dirname, 'output', 'event.ics'), 'utf8');
const lines = text.split('\r\n');
let problems = [];

// Every line must end in CRLF (so a split on CRLF never leaves a lone \n or \r).
if (/[^\r]\n|\r[^\n]/.test(text)) problems.push('found a line ending that is not CRLF');
if (!text.endsWith('\r\n')) problems.push('file does not end with CRLF');

// No line over 75 octets.
lines.forEach((l, i) => { if (Buffer.byteLength(l) > 75) problems.push('line ' + (i + 1) + ' is ' + Buffer.byteLength(l) + ' octets'); });

// BEGIN/END must balance and nest correctly.
const stack = [];
for (const l of lines) {
  if (l.startsWith('BEGIN:')) stack.push(l.slice(6));
  else if (l.startsWith('END:')) { if (stack.pop() !== l.slice(4)) problems.push('mismatched ' + l); }
}
if (stack.length) problems.push('unclosed: ' + stack.join(', '));
if (lines[0] !== 'BEGIN:VCALENDAR') problems.push('does not start with BEGIN:VCALENDAR');

// Each event needs UID, DTSTAMP, DTSTART (after unfolding).
const unfolded = text.replace(/\r\n[ \t]/g, '');
const events = unfolded.split('BEGIN:VEVENT').slice(1);
events.forEach((ev, i) => {
  for (const p of ['UID:', 'DTSTAMP:', 'DTSTART:']) if (!ev.includes('\r\n' + p)) problems.push('event ' + (i + 1) + ' missing ' + p);
});
const uids = (unfolded.match(/^UID:.*$/gm) || []);
if (new Set(uids).size !== uids.length) problems.push('duplicate UIDs');

if (problems.length) { console.error('event.ics FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('event.ics OK: ' + events.length + ' events, ' + lines.length + ' lines, all CRLF and <= 75 octets.');
