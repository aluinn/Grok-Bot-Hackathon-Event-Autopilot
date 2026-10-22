# Grok Bot MCP server

MCP (Model Context Protocol) is a standard plug that lets an AI assistant such as Grok Bot, Claude or Cursor call our scripts as tools, so the lead can run the whole pipeline by chat.

**Run:** `node grok-bot/server.js` (it waits for an AI client; nothing prints). **Test:** `node grok-bot/test.js`.

**Plug it in:** copy `mcp-config.example.json`, replace the path with the absolute path to `grok-bot/server.js` on your machine, and paste the `mcpServers` block into your client's MCP settings:
- Claude Code: `claude mcp add event-autopilot -- node <abs path>/grok-bot/server.js`
- Cursor: `.cursor/mcp.json`
- Grok Bot: its MCP server settings, same JSON shape

**Tools:** `make_event` (Luma link), `make_event_from_text`, `write_promo`, `render_visuals`, `build_run_sheet`, `get_event`, `get_promo`, `status`. Each one runs the same script the command line uses and returns the resulting file.

**Rule:** this server never sends, posts or approves anything. Approval and sending happen only in the dashboard (Approve button).
