# Autopilot

One line ("I want to create a healthcare hackathon in London on 5 Dec") or a Luma link goes in; about ten agents build every draft, several at the same time.

- `node autopilot/run.js "<idea or Luma link>"` runs everything from scratch.
- `node autopilot/run.js --production` is for when Grok Bot already wrote the event and copy (save_event, save_promo).
- The dashboard's Launch tab (`/launch`) starts a run with one button and shows each agent live.
- `agents.js` holds the agent list: who needs whom, which script each runs, and the minutes it saves.
- Progress is written to `output/status.json` (git-ignored) after every change.
- If an agent fails (e.g. Grok has no credits), the ones that depend on it are skipped; the rest keep going.
- Nothing is sent, posted or published here. The lead still approves every draft in the dashboard.
