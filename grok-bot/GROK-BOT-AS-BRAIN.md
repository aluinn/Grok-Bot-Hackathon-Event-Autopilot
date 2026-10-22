# Grok Bot as the brain (no xAI API key needed)

Grok Bot writes the event and all the copy itself, using its own credits. Our MCP server gives it the
brief, saves what it writes, and renders the rest. The lead still approves everything in the dashboard.

## 1. Start the server and give it a public address

```bash
node grok-bot/server.js --http 4020                    # our tools, on this computer
cloudflared tunnel --url http://localhost:4020         # prints https://<random>.trycloudflare.com
node promo-and-approval-ui/dashboard/server.js         # the lead's Approve screen, http://localhost:4010
```

Grok Bot's MCP address is the tunnel URL plus `/mcp`, e.g. `https://<random>.trycloudflare.com/mcp`.
Install cloudflared once with `winget install Cloudflare.cloudflared` (Windows) or `brew install cloudflared` (Mac).

## 2. Add it to Grok Bot

In Grok Bot's settings, add an MCP server / connector / custom tool with that URL (name: Event Autopilot).
If Grok Bot only supports MCP from a desktop app, use `mcp-config.example.json` instead (stdio, no tunnel).

## 3. What to say to Grok Bot

> Use Event Autopilot. Create a Healthcare Grok Bot hackathon in London on 5 December at 6pm: write the
> event and call save_event. Then call get_writing_brief, write the promo copy and call save_promo.
> Then render_visuals and build_run_sheet. Tell me when it's ready to approve.

Or start from Luma: "Use Event Autopilot: make_event with https://lu.ma/abc123, then the same steps."

## Tools Grok Bot gets

`save_event`, `get_writing_brief`, `save_promo` (Grok Bot writes, we save) · `make_event` (Luma link) ·
`render_visuals` · `build_run_sheet` · `get_event` · `get_promo` · `status` · `remember_voice` (Cognee).
Tools that call the xAI API from our side (`make_event_from_text`, `write_promo`, `regenerate_item`,
`find_sponsors`, `draft_sponsor_outreach`) need `XAI_API_KEY` with credits; skip them in this mode.

## Safety

- No tool sends or approves anything. Sending only happens from the dashboard after Approve.
- The tunnel URL is public while it runs and has no password. Anyone with it can overwrite the drafts.
  Run it only for the demo, don't share the URL, and stop it (Ctrl+C) afterwards.
