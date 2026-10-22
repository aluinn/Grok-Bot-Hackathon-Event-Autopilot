// The autopilot: about ten small "agents" that together turn one line (or a Luma link) into every draft.
// Each agent is one of our existing scripts, started as its own process, so several run at the same time.
// An agent starts as soon as everything it "needs" is done. Progress is written to
// autopilot/output/status.json after every change, which the dashboard's Launch tab shows live.
//
// Everything made here is a DRAFT. No agent sends, posts or publishes anything (CLAUDE.md rule 2).

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { loadEnv } = require("../copy-generator/grok");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(__dirname, "output");
const STATUS_FILE = path.join(OUT_DIR, "status.json");
const AGENT_TIMEOUT_MS = 10 * 60 * 1000; // give up on one agent after 10 minutes

// ---------- small helpers ----------

const now = () => new Date().toISOString();
const readText = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null);
const readJson = (rel) => { try { return JSON.parse(readText(rel)); } catch { return null; } };
const short = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// Minutes saved per agent: from data/hours.json where we have a matching task, otherwise a team estimate
function minutesFor(id) {
  const tasks = (readJson("data/hours.json") || {}).tasks || {};
  const fromHours = { copy: ["event_page_copy", "newsletter", "social_posts"], visuals: ["visuals"], runsheet: ["run_sheet_and_calendar_invite"] };
  if (fromHours[id]) return { minutes: fromHours[id].reduce((sum, t) => sum + ((tasks[t] || {}).minutes || 0), 0), source: "data/hours.json" };
  const estimates = { intake: 10, sponsors: 90, outreach: 60, page: 45, newsletter: 30, supabase: 10, memory: 0, remember: 0, digest: 30 };
  return { minutes: estimates[id] || 0, source: "team estimate" };
}

// The last line of a script's output that says something useful. Skips blank lines, stack traces and
// the "Assertion failed ... async.c" line Node on Windows sometimes prints when a script exits early.
function lastMeaningfulLine(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && !/^at\s/.test(l) && !/^node:/.test(l) && l !== "^" && !/^Assertion failed/.test(l));
  return short(lines[lines.length - 1] || "", 300);
}

// Run one script as its own process and collect what it prints. Never throws.
function runScript(script, args) {
  return new Promise((resolve) => {
    let stdout = "", stderr = "";
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, windowsHide: true });
    const timer = setTimeout(() => { stderr += "\nStopped: took longer than 10 minutes."; child.kill(); }, AGENT_TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => { clearTimeout(timer); resolve({ code: 1, stdout, stderr: stderr + "\n" + err.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code === null ? 1 : code, stdout, stderr }); });
  });
}

// ---------- what each agent shows when it is done ----------

function eventSummary() {
  const e = readJson("shared/event.json") || {};
  return { summary: `${e.name || "Event"} · ${e.date || "?"} ${e.time || ""} · ${e.venue || "venue to be confirmed"}`.trim(), output: { type: "text", value: JSON.stringify(e, null, 2) } };
}

function visualsSummary() {
  const dir = path.join(ROOT, "promo-and-approval-ui", "output");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort() : [];
  return { summary: `${files.length} on-brand images: ${files.join(", ")}`, output: { type: "images", value: files.map((f) => `/output/${f}`) } };
}

function runsheetSummary() {
  const rows = readJson("run-sheet/output/run-sheet.json") || [];
  const doors = rows.find((r) => /doors/i.test(r.what)), close = rows.find((r) => /close/i.test(r.what));
  return {
    summary: `${rows.length} timed blocks · doors ${doors ? doors.time : "?"} · close ${close ? close.time : "?"} · calendar file ready`,
    output: { type: "text", value: rows.map((r) => `${r.time}  ${r.what}`).join("\n") },
  };
}

function sponsorsSummary() {
  const list = (readJson("sponsors/output/sponsors.json") || {}).sponsors || [];
  const top = list.slice(0, 3).map((s) => s.name).join(", ");
  return { summary: `${list.length} potential sponsors found${top ? ` · top: ${top}` : ""} · nobody contacted`, output: { type: "text", value: list.map((s) => `${s.name}: ${s.why_fit || ""}`).join("\n") } };
}

function copySummary() {
  const p = readJson("shared/promo.json") || {};
  const subject = (p.newsletter || {}).subject || "";
  const linkedin = short((p.posts || {}).linkedin, 140);
  return { summary: `Newsletter: "${subject}"`, output: { type: "text", value: `Newsletter subject: ${subject}\n\nLinkedIn: ${linkedin}` } };
}

function outreachSummary(run) {
  const m = run.stdout.match(/Wrote (\d+) outreach drafts/);
  const n = m ? m[1] : "Some";
  return { summary: `${n} drafts, nothing sent`, output: { type: "text", value: lastMeaningfulLine(run.stdout) } };
}

// ---------- the agent list ----------
// Each agent: id, name, needs (ids that must finish first), and run() which returns { summary, output }
// or throws an Error (state "error") or an object { skipped: "why" } (state "skipped").

function buildAgents(input) {
  const isLuma = /(lu\.ma|luma\.com)\//.test(input) || /^evt-[A-Za-z0-9]+$/.test(input);
  const script = (rel, args, show) => async () => {
    const run = await runScript(rel, args);
    // Scripts print their reason on stdout or stderr, so look at both
    if (run.code !== 0) throw new Error(lastMeaningfulLine(run.stdout + "\n" + run.stderr) || `${rel} stopped with code ${run.code}`);
    return show(run);
  };

  return [
    { id: "intake", name: "Intake agent", needs: [],
      run: script(isLuma ? "intake/from-luma.js" : "intake/from-text.js", [input], eventSummary) },

    { id: "memory", name: "Memory agent (Cognee)", needs: ["intake"],
      run: async () => {
        const { recall } = require("../memory/cognee");
        const event = readJson("shared/event.json") || {};
        let answer;
        try {
          answer = await recall(`How does this community write its event posts and newsletters? Tone, length, phrases, sign-offs. Next event: "${event.name}".`);
        } catch (err) {
          return { skipped: "Cognee did not answer (" + short(err.message, 150) + "); copy uses the voice/ files" };
        }
        if (!answer) return { skipped: "Cognee is not set up (COGNEE_BASE_URL / COGNEE_API_KEY); copy uses the voice/ files" };
        return { summary: short(answer, 200), output: { type: "text", value: answer } };
      } },

    { id: "visuals", name: "Design agent", needs: ["intake"],
      run: script("promo-and-approval-ui/templates/render.js", ["shared/event.json"], visualsSummary) },

    { id: "runsheet", name: "Run-sheet agent", needs: ["intake"],
      run: script("run-sheet/build.js", [], runsheetSummary) },

    { id: "sponsors", name: "Sponsor research agent (Grok web search)", needs: ["intake"],
      run: script("sponsors/find.js", ["--count", "20"], sponsorsSummary) },

    { id: "copy", name: "Copywriter agent (Grok)", needs: ["intake", "memory"],
      run: script("copy-generator/generate.js", [], copySummary) },

    { id: "outreach", name: "Outreach agent", needs: ["sponsors"],
      run: script("sponsors/draft-outreach.js", [], outreachSummary) },

    { id: "page", name: "Web page agent", needs: ["copy", "visuals", "runsheet"],
      run: script("event-page/build.js", [], (run) => ({ summary: "Event page built (draft, not published)", output: { type: "link", value: "/event-page/" } })) },

    { id: "digest", name: "Digest agent (this week on Luma)", needs: [],
      run: script("digest/fetch-week.js", [], (run) => ({ summary: lastMeaningfulLine(run.stdout), output: { type: "link", value: "/digest.html" } })) },

    { id: "newsletter", name: "Newsletter agent", needs: ["copy"],
      run: script("newsletter/build.js", [], (run) => ({ summary: "Branded email built from the newsletter copy (draft, not sent)", output: { type: "link", value: "/newsletter/" } })) },

    { id: "supabase", name: "Database agent (Supabase)", needs: ["page"],
      run: async () => {
        const row = readJson("event-page/output/supabase-row.json");
        if (!row) throw new Error("event-page/output/supabase-row.json is missing");
        const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!base || !key) {
          // No keys here: if Grok Bot already saved this event with its own Supabase connector, that counts
          const saved = readJson("event-page/output/database-saved.json");
          if (saved && saved.slug === row.slug) return { summary: `Saved by Grok Bot to Supabase (${saved.project}) as an unpublished draft`, output: { type: "text", value: saved.row_id } };
          return { skipped: "Ask Grok Bot to save it with its Supabase connector (get_database_record), then confirm_database_saved" };
        }
        // Save as a private draft row: published stays false until the lead approves
        const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/events?on_conflict=slug`, {
          method: "POST",
          headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ ...row, published: false }),
        });
        if (!response.ok) throw new Error(`Supabase replied with HTTP ${response.status}: ${short(await response.text(), 200)}`);
        return { summary: `Saved "${row.slug}" to the events table as an unpublished draft`, output: { type: "text", value: row.slug } };
      } },

    { id: "remember", name: "Memory agent: learn this event", needs: ["copy"],
      run: script("memory/remember.js", ["--event"], (run) => ({ summary: lastMeaningfulLine(run.stdout), output: { type: "none", value: "" } })) },
  ];
}

// ---------- the orchestrator ----------

// Save status.json safely: write a temporary file, then swap it in, so readers never see half a file
function writeStatus(status) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(status, null, 2);
  const tmp = STATUS_FILE + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, json);
  try {
    fs.renameSync(tmp, STATUS_FILE);
  } catch {
    // Windows sometimes refuses the swap while another program is reading the file; write it directly instead
    fs.writeFileSync(STATUS_FILE, json);
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// Run all agents. mode "full" starts from `input`; mode "production" means Grok Bot already wrote
// shared/event.json and shared/promo.json, so intake, memory and copy count as done straight away.
// onUpdate(status) is called after every change. Returns the final status. Never throws.
async function runAutopilot({ input = "", mode = "full" } = {}, onUpdate = () => {}) {
  loadEnv();
  const agents = buildAgents(input);
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
  const waveOf = (a) => (a.needs.length ? 1 + Math.max(...a.needs.map((n) => waveOf(byId[n]))) : 1);

  const status = {
    runId: now(), input, mode, state: "running", startedAt: now(), finishedAt: null, totalMinutesSaved: 0,
    agents: agents.map((a) => ({
      id: a.id, name: a.name, wave: waveOf(a), needs: a.needs, state: "queued",
      startedAt: null, endedAt: null, summary: "", note: "", minutesSaved: 0, minutesSource: minutesFor(a.id).source,
      output: { type: "none", value: "" },
    })),
  };
  const view = Object.fromEntries(status.agents.map((a) => [a.id, a]));
  const blockedBy = {}; // id -> name of the failed agent that stopped it (only for "waiting on" skips)

  const publish = () => {
    status.totalMinutesSaved = status.agents.reduce((sum, a) => sum + a.minutesSaved, 0);
    try { writeStatus(status); } catch (err) { console.error("Could not write status.json: " + err.message); }
    try { onUpdate(JSON.parse(JSON.stringify(status))); } catch { /* a broken listener must not stop the run */ }
  };

  const finish = (id, state, fields = {}) => {
    Object.assign(view[id], { state, endedAt: now() }, fields);
    if (!view[id].startedAt) view[id].startedAt = view[id].endedAt;
    if (state === "done") view[id].minutesSaved = minutesFor(id).minutes;
  };

  // In production mode Grok Bot already did these three
  if (mode === "production") {
    const e = readJson("shared/event.json"), p = readJson("shared/promo.json");
    finish("intake", e ? "done" : "error", e ? { summary: "Written by Grok Bot: " + eventSummary().summary, output: eventSummary().output } : { note: "shared/event.json is missing. Ask Grok Bot to call save_event." });
    finish("memory", "done", { summary: "Written by Grok Bot (it read the memory itself)" });
    finish("copy", p ? "done" : "error", p ? { summary: "Written by Grok Bot. " + copySummary().summary, output: copySummary().output } : { note: "shared/promo.json is missing. Ask Grok Bot to call save_promo." });
    // If Grok Bot already researched sponsors and wrote outreach for THIS event (save_sponsors / save_outreach),
    // count them as done instead of calling the xAI API again
    const s = readJson("sponsors/output/sponsors.json");
    if (e && s && s.event === e.name && (s.sponsors || []).length) {
      finish("sponsors", "done", { summary: "Found by Grok Bot: " + sponsorsSummary().summary, output: sponsorsSummary().output });
      const allMd = path.join(ROOT, "sponsors", "output", "outreach", "ALL.md");
      if (fs.existsSync(allMd) && fs.readFileSync(allMd, "utf8").includes(e.name)) {
        const count = (fs.readFileSync(allMd, "utf8").match(/^- \[/gm) || []).length;
        finish("outreach", "done", { summary: `Written by Grok Bot: ${count} drafts, nothing sent`, output: { type: "text", value: "sponsors/output/outreach/ALL.md" } });
      }
    }
  }
  publish();

  const running = new Set();
  await new Promise((resolveAll) => {
    const tick = () => {
      // 1. Skip agents whose needs failed (or were skipped because something before them failed)
      let changed = true;
      while (changed) {
        changed = false;
        for (const a of agents) {
          if (view[a.id].state !== "queued") continue;
          const failed = a.needs.find((n) => view[n].state === "error" || (view[n].state === "skipped" && blockedBy[n]));
          if (failed) {
            blockedBy[a.id] = blockedBy[failed] || byId[failed].name;
            finish(a.id, "skipped", { note: `waiting on ${blockedBy[a.id]}` });
            changed = true;
          }
        }
      }
      // 2. Start every queued agent whose needs are all finished (done, or skipped for its own reasons)
      for (const a of agents) {
        if (view[a.id].state !== "queued") continue;
        if (!a.needs.every((n) => view[n].state === "done" || (view[n].state === "skipped" && !blockedBy[n]))) continue;
        Object.assign(view[a.id], { state: "running", startedAt: now() });
        running.add(a.id);
        a.run()
          .then((result) => {
            if (result && result.skipped) finish(a.id, "skipped", { note: result.skipped });
            else finish(a.id, "done", { summary: (result && result.summary) || "Done", output: (result && result.output) || { type: "none", value: "" } });
          })
          .catch((err) => finish(a.id, "error", { note: short(err && err.message, 300) || "Failed" }))
          .finally(() => { running.delete(a.id); tick(); });
      }
      publish();
      if (!running.size && !status.agents.some((x) => x.state === "queued")) resolveAll();
    };
    tick();
  });

  status.state = "done";
  status.finishedAt = now();
  publish();
  return status;
}

module.exports = { runAutopilot, STATUS_FILE, minutesFor };
