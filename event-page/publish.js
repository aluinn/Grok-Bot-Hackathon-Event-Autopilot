// Puts the approved event page online (Cloudflare Pages) and marks the event as published in Supabase.
// Usage: node event-page/publish.js --approved [--page-copy-file=<path>]
// Only runs with --approved: the dashboard passes it after the lead clicks Approve on the page copy
// and then "Publish event page" (CLAUDE.md rule 2). Without it, it refuses.
//
// Every published event keeps its own address: https://<project>.pages.dev/<event-slug>/
// The site folder (event-page/site/) holds all published events plus a simple list page.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadEnv } = require("../copy-generator/grok");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(__dirname, "output");
const SITE_DIR = path.join(__dirname, "site");
const IMAGE_DIR = path.join(ROOT, "promo-and-approval-ui", "output");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Run a command and return { ok, out }. A shell lets Windows find npx; every argument here is our own text.
function run(cmd, args) {
  const result = spawnSync([cmd, ...args].join(" "), { cwd: ROOT, encoding: "utf8", shell: true });
  return { ok: result.status === 0, out: (result.stdout || "") + (result.stderr || "") };
}

// The list page at the site root: every published event, newest first
function writeIndex() {
  const events = fs.readdirSync(SITE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SITE_DIR, d.name, "event.json")))
    .map((d) => ({ slug: d.name, ...JSON.parse(fs.readFileSync(path.join(SITE_DIR, d.name, "event.json"), "utf8")) }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const items = events.map((e) => `<li><a href="/${esc(e.slug)}/">${esc(e.name)}</a><span>${esc(e.date)} · ${esc(e.venue)}</span></li>`).join("");
  fs.writeFileSync(path.join(SITE_DIR, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Events</title>
<style>body{margin:0;background:#0B0B0F;color:#F5F5F7;font:17px/1.6 system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:48px 16px}h1{font-size:40px;margin:0 0 24px}ul{list-style:none;padding:0}li{padding:16px 0;border-bottom:1px solid #26262F}a{color:#F5F5F7;font-weight:600;text-decoration:none}a:hover{color:#FF5A1F}span{display:block;color:#9A9AA5;font-size:14px}</style>
</head><body><main><h1>Events</h1><ul>${items}</ul></main></body></html>`);
}

// Mark the event as published in Supabase, if this computer has the keys (otherwise Grok Bot can do it)
async function markPublishedInSupabase(row, pageUrl) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return "Supabase keys not set here: ask Grok Bot to set published=true and page_url in the events table.";
  const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/events?on_conflict=slug`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...row, published: true, page_url: pageUrl, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) return `Supabase replied with HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`;
  return "Marked as published in Supabase.";
}

async function main() {
  if (!process.argv.includes("--approved")) {
    console.log("Refused: nothing is published without the lead clicking Approve.");
    process.exitCode = 1;
    return;
  }
  loadEnv();
  const project = process.env.CF_PAGES_PROJECT || "event-autopilot-events";

  // 1. Rebuild the page from the latest drafts (and the lead's edited copy, if given)
  const copyArg = process.argv.find((a) => a.startsWith("--page-copy-file="));
  const build = run("node", ["event-page/build.js", ...(copyArg ? [copyArg] : [])]);
  if (!build.ok) throw new Error("Could not build the page: " + build.out.trim().split("\n").pop());
  const row = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "supabase-row.json"), "utf8"));

  // 2. Copy it into the site folder under its own address, with the images (the newsletter links to them)
  const dir = path.join(SITE_DIR, row.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(OUT_DIR, "index.html"), path.join(dir, "index.html"));
  if (fs.existsSync(IMAGE_DIR)) {
    for (const f of fs.readdirSync(IMAGE_DIR).filter((f) => f.endsWith(".png"))) fs.copyFileSync(path.join(IMAGE_DIR, f), path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, "event.json"), JSON.stringify({ name: row.name, date: row.date, venue: row.venue }));
  writeIndex();

  // 3. Deploy the whole site folder (creating the Cloudflare Pages project the first time)
  console.log(`Publishing to Cloudflare Pages project "${project}"...`);
  let deploy = run("npx", ["-y", "wrangler@latest", "pages", "deploy", "event-page/site", "--project-name", project, "--branch", "main", "--commit-dirty=true"]);
  if (!deploy.ok) {
    // Most likely the project doesn't exist yet: create it (harmless if it does) and try once more
    run("npx", ["-y", "wrangler@latest", "pages", "project", "create", project, "--production-branch", "main", "--force"]); // --force: classic Pages (newer Wrangler otherwise tries Workers and fails)
    deploy = run("npx", ["-y", "wrangler@latest", "pages", "deploy", "event-page/site", "--project-name", project, "--branch", "main", "--commit-dirty=true"]);
  }
  if (!deploy.ok) throw new Error("Cloudflare deploy failed: " + deploy.out.trim().split("\n").slice(-3).join(" "));
  const pageUrl = `https://${project}.pages.dev/${row.slug}/`;

  // 4. Remember where it lives (the newsletter uses this for its poster and RSVP button) and tell Supabase
  fs.writeFileSync(path.join(OUT_DIR, "published.json"), JSON.stringify({ slug: row.slug, page_url: pageUrl, published_at: new Date().toISOString() }, null, 2));
  const supabaseNote = await markPublishedInSupabase(row, pageUrl);

  console.log(`Published: ${pageUrl}`);
  console.log(supabaseNote);
}

main().catch((err) => { console.log("Could not publish the page. " + err.message); process.exitCode = 1; });
