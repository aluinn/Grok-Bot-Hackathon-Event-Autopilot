# Event Autopilot

One event goes in as a Luma link or one line of text. Out come the event page copy, a newsletter, posts for WhatsApp, LinkedIn and Discord, on-brand visuals, a run sheet with a calendar file, and a shortlist of sponsors with outreach drafts. The event lead reads each piece and clicks **Approve**. Nothing is sent before that.

Built in one evening for the Grok Bot hackathon, Event Autopilot track. MIT licence. Plan and who-does-what: [PLAN.md](PLAN.md).

## Try it in two minutes

```bash
corepack pnpm install        # or: npm install   (this installs the libraries the project needs)
cp .env.example .env         # then paste your Grok key (XAI_API_KEY) into .env

node autopilot.js https://lu.ma/abc123                                   # start from a Luma link
node autopilot.js "Healthcare Grok Bot hackathon in London, 5 Dec, 6pm"  # or from one line of text

node promo-and-approval-ui/dashboard/server.js   # open http://localhost:4010 to review and approve
```

Each step also runs on its own: `pnpm intake:luma <link>`, `pnpm intake:text "<idea>"`, `pnpm copy`, `pnpm visuals`, `pnpm runsheet`, `pnpm sponsors`, `pnpm outreach`.

## How it works

Every part reads `shared/event.json` and writes its own output. The two JSON files are the contract between all parts.

| Step | Folder | What it makes |
| --- | --- | --- |
| Intake | `intake/` | `shared/event.json` from a Luma link (free API, no key) or one line of text (Grok) |
| Copy | `copy-generator/` | `shared/promo.json`: page copy, newsletter, 3 posts, in the community's voice (`voice/`) |
| Visuals | `promo-and-approval-ui/templates/` | square, wide and story PNGs from HTML/CSS templates rendered with Puppeteer (no image models) |
| Run sheet | `run-sheet/` | timed run sheet, volunteer rota, budget and `event.ics` |
| Sponsors | `sponsors/` | 20 potential partners found with Grok live search, one outreach draft each (never sent) |
| Review | `promo-and-approval-ui/` | the dashboard where the lead edits and approves every item |
| Sending | `sending/` | Discord post and Ghost newsletter draft, only with the Approve flag; WhatsApp/LinkedIn open ready to send |
| Memory | `memory/` | Cognee holds the community's past posts and approved copy; the copy generator asks it how the community writes |
| Grok Bot | `grok-bot/` | an MCP server so Grok Bot (or Claude, Cursor) can run all of the above by chat. It has no send tool. |

## The rules we keep

1. All data flows through `shared/event.json` and `shared/promo.json`.
2. Nothing is ever sent without the lead clicking Approve.
3. Visuals come from HTML/CSS templates rendered with Puppeteer, never image models.
4. Brand: `brand/brand.md`.

Secrets live in `.env` (git-ignored). See `.env.example` for every key and where to get it.
