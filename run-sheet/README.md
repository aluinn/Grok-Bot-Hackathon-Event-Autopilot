# Run sheet

Turns `shared/event.json` into a timed plan for the night, written to `run-sheet/output/`:
`run-sheet.md` (timings, volunteer rota, starter budget, night-of checklist), `run-sheet.json` (same timings for other tools) and `event.ics` (calendar invite for the event plus one entry per block for volunteers).

Run: `node run-sheet/build.js` — the event is assumed to last 3 hours.
Change the length with `node run-sheet/build.js --hours 2.5`.
Check the calendar file is well-formed: `node run-sheet/check.js`.
No extra libraries needed.
