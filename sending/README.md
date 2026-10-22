# Sending

**Rule: nothing is sent without the lead clicking Approve.** Every send function needs `approved: true`, and the command line needs `--approved`. No timers, no auto-run, no "send all".

Settings go in `.env` at the repo root (copy `.env.example`): `DISCORD_WEBHOOK_URL`, `GHOST_ADMIN_URL`, `GHOST_ADMIN_API_KEY`.

Commands (all read `shared/promo.json`):
- `node sending/send.js discord --approved` — posts the Discord message via webhook
- `node sending/send.js ghost --approved` — creates the newsletter as a Ghost DRAFT (never published or emailed)
- `node sending/send.js whatsapp` — prints a WhatsApp share link you send by hand
- `node sending/send.js linkedin` — prints a LinkedIn share link you post by hand

Every send is recorded in `sending/output/sent-log.jsonl` (time, channel, status, preview).
