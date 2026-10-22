// Smoke test for the MCP server.
// It starts server.js as a child process, does the MCP handshake over
// stdin/stdout, lists the tools, calls `status`, prints both, and exits 0.
//
// Run with:  node grok-bot/test.js

const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  // Start the server exactly the way an AI client would.
  const transport = new StdioClientTransport({
    command: process.execPath, // the same `node` that runs this test
    args: [path.join(__dirname, "server.js")],
    stderr: "inherit", // show the server's own log lines
  });
  const client = new Client({ name: "smoke-test", version: "0.1.0" });

  await client.connect(transport); // this does the `initialize` handshake

  const { tools } = await client.listTools();
  console.log("Tools:", tools.map((t) => t.name).join(", "));

  // Make sure no tool can send or approve (CLAUDE.md rule 2).
  const forbidden = tools.filter((t) => /send|approve|post|publish/i.test(t.name));
  if (forbidden.length) throw new Error("Found a sending/approving tool: " + forbidden.map((t) => t.name));

  const result = await client.callTool({ name: "status", arguments: {} });
  console.log("\nstatus:\n" + result.content.map((c) => c.text).join("\n"));

  await client.close();
  console.log("\nOK");
  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
