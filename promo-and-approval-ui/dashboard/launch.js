// Mission Control: start a run and watch the agents work.
//
// How it works, in plain words:
// 1. The lead types one line (or pastes a Luma link) and clicks Launch. We send it to POST /api/launch.
// 2. The server keeps one "status" object describing every agent. It pushes a fresh copy to this page
//    over GET /api/launch/stream every time something changes (a "Server-Sent Events" stream).
// 3. Each time a copy arrives, render() updates the cards, the counters and the lines between cards.
// Because the page only draws whatever the stream says, it also follows runs started from the
// command line or from Grok Bot. Nothing on this page sends or publishes anything.

// ---------- Small helpers ----------
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Turn text into safe HTML (so text from the server can never inject code into the page)
function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// 75 -> "1h 15m", 40 -> "40m", 0 -> "0m"
function formatMinutes(total) {
  const m = Math.round(total);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m`;
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}
// milliseconds -> "02:14"
function formatClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
// milliseconds -> "0:34" (short, for card badges)
function formatShort(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
const time = (iso) => (iso ? new Date(iso).getTime() : null);

// The tick icon used in the "done" badge
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ARROW_OUT = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4h8v8M16 4 5 15"/></svg>';

// ---------- What the board looks like before anything has run ----------
// A preview of the usual line-up, so the screen is never empty. As soon as the server sends a
// real status, its own list of agents replaces this one.
const PREVIEW_AGENTS = [
  { id: "intake", name: "Intake agent", wave: 1, needs: [], summary: "Turns your line or Luma link into the event details." },
  { id: "memory", name: "Community memory", wave: 2, needs: ["intake"], summary: "Recalls past events so the copy sounds like you." },
  { id: "visuals", name: "Visuals", wave: 2, needs: ["intake"], summary: "Renders the promo images from the brand templates." },
  { id: "runsheet", name: "Run sheet", wave: 2, needs: ["intake"], summary: "Times the evening and makes a calendar invite." },
  { id: "sponsors", name: "Sponsor finder", wave: 2, needs: ["intake"], summary: "Finds partners with public contact emails." },
  { id: "copy", name: "Copywriter", wave: 3, needs: ["memory"], summary: "Writes the page copy, newsletter and posts." },
  { id: "outreach", name: "Outreach drafts", wave: 3, needs: ["sponsors"], summary: "Drafts one email per sponsor. Never sent." },
  { id: "page", name: "Event page", wave: 4, needs: ["copy", "visuals"], summary: "Builds the event page from the copy and images." },
  { id: "supabase", name: "Database", wave: 4, needs: ["copy"], summary: "Saves the event so the team can find it." },
  { id: "remember", name: "Remember", wave: 5, needs: ["page", "supabase"], summary: "Teaches the memory what worked this time." },
].map((a) => ({ ...a, state: "queued", output: { type: "none" }, minutesSaved: 0 }));

// ---------- Page state ----------
let status = { state: "idle" }; // the latest status object from the server
let boardKey = "";              // which set of agents the board was built for (rebuild when it changes)
let shownMinutes = 0;           // the hours-saved number currently on screen (it counts up towards the real one)
let countAnim = null;           // the running count-up animation, if any

// ---------- Building the board ----------
// Make one column per wave and one card per agent. Only done when the line-up changes,
// so cards can animate between states instead of being replaced.
function buildBoard(agents) {
  const board = $("board");
  board.querySelectorAll(".wave").forEach((w) => w.remove());

  const waves = [...new Set(agents.map((a) => a.wave))].sort((a, b) => a - b);
  board.style.setProperty("--waves", waves.length);

  waves.forEach((n) => {
    const col = document.createElement("div");
    col.className = "wave";
    col.dataset.wave = n;
    col.innerHTML = `<div class="wave-head"><span class="wave-name">Wave ${n}</span><span class="wave-meta"></span></div>`;
    agents.filter((a) => a.wave === n).forEach((a) => col.appendChild(makeCard(a)));
    board.appendChild(col);
  });
}

function makeCard(agent) {
  const card = document.createElement("article");
  card.className = "agent";
  card.id = "agent-" + agent.id;
  card.innerHTML = `
    <div class="agent-head">
      <h3 class="agent-name"></h3>
      <span class="badge"><span class="badge-dot">${TICK}</span><span class="badge-text"></span></span>
    </div>
    <p class="agent-summary"></p>
    <div class="agent-result"></div>
    <div class="agent-foot"></div>`;
  return card;
}

// ---------- Updating one card ----------
function updateCard(agent, byId) {
  const card = $("agent-" + agent.id);
  if (!card) return;
  const was = card.dataset.state;
  card.dataset.state = agent.state;
  card.querySelector(".agent-name").textContent = agent.name;

  // Badge word. The running timer itself is filled in by tick() every quarter second.
  const words = { queued: "Queued", running: "Running", done: "Done", error: "Error", skipped: "Skipped" };
  const badge = card.querySelector(".badge-text");
  badge.dataset.since = agent.state === "running" ? agent.startedAt || "" : "";
  if (agent.state === "done" && agent.startedAt && agent.endedAt) {
    badge.textContent = "Done " + formatShort(time(agent.endedAt) - time(agent.startedAt));
  } else if (agent.state !== "running") {
    badge.textContent = words[agent.state] || agent.state;
  }

  // The one-line summary. Waiting cards say what they are waiting for.
  const waitingOn = (agent.needs || []).filter((id) => byId[id] && byId[id].state !== "done").map((id) => byId[id].name);
  let line = agent.summary || "";
  if (agent.state === "queued" && waitingOn.length && status.state === "running") line = "Waiting on " + waitingOn.join(" and ");
  if (agent.state === "skipped") line = agent.note || (waitingOn.length ? "Waiting on " + waitingOn.join(" and ") : "Skipped");
  card.querySelector(".agent-summary").textContent = line;

  // The result (images, text or a link). Only redrawn when it actually changes.
  const result = card.querySelector(".agent-result");
  const key = agent.state + "|" + (agent.state === "error" ? agent.note : JSON.stringify(agent.output || {}));
  if (result.dataset.key !== key) {
    result.dataset.key = key;
    result.innerHTML = resultHtml(agent);
    if (!reduceMotion && result.innerHTML && was) {
      result.classList.remove("reveal");
      void result.offsetWidth; // restart the reveal animation
      result.classList.add("reveal");
    }
  }

  // Footer: how long it took and how much time it saved
  const foot = card.querySelector(".agent-foot");
  foot.innerHTML = agent.state === "done" && agent.minutesSaved
    ? `<span>${esc(agentKind(agent))}</span><span class="agent-saved">Saved ${formatMinutes(agent.minutesSaved)}</span>`
    : "";
}

// A short word describing what the agent produced, for the card footer
function agentKind(agent) {
  const out = agent.output || {};
  if (out.type === "images") return `${(out.value || []).length} images`;
  if (out.type === "link") return "Page ready";
  if (out.type === "text") return "Draft ready";
  return "Finished";
}

// Error notes can be long technical messages. Known ones get a plain sentence;
// the full original stays available by hovering over it.
function plainError(note) {
  if (!note) return "Something went wrong. The other agents carried on.";
  if (/credits|licen[cs]es/i.test(note)) return "Grok has no credits yet. Add credits at console.x.ai, then run it again.";
  if (/401|api key|unauthori[sz]ed/i.test(note)) return "The Grok API key is missing or wrong. Check the .env file, then run it again.";
  return note;
}

// If a text result is JSON (e.g. the event details), show its values as plain lines instead of code
function plainText(value) {
  const text = String(value).trim();
  if (!text.startsWith("{")) return text;
  try {
    const data = JSON.parse(text);
    return Object.values(data).filter((v) => typeof v === "string" || typeof v === "number").join("\n") || text;
  } catch {
    return text;
  }
}

function resultHtml(agent) {
  if (agent.state === "error") {
    return `<p class="agent-error" title="${esc(agent.note || "")}">${esc(plainError(agent.note))}</p>`;
  }
  if (agent.state !== "done" && agent.state !== "running") return "";
  const out = agent.output || {};
  if (out.type === "images" && Array.isArray(out.value) && out.value.length) {
    // Thumbnails; clicking one opens the full image in a new tab
    return `<div class="shots">${out.value.map((src, i) =>
      `<a href="${esc(src)}" target="_blank" rel="noopener" aria-label="Open image ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></a>`).join("")}</div>`;
  }
  if (out.type === "text" && out.value) return `<p class="snippet">${esc(plainText(out.value))}</p>`;
  if (out.type === "link" && out.value) {
    return `<a class="button open-link" href="${esc(out.value)}" target="_blank" rel="noopener">Open page ${ARROW_OUT}</a>`;
  }
  return "";
}

// ---------- The connector lines between cards ----------
// For every "needs" link, draw a soft curve from the right edge of the earlier card
// to the left edge of the later one. Only on wide screens, where waves sit side by side.
function drawWires(agents) {
  const svg = $("wires");
  const board = $("board");
  if (getComputedStyle(svg).display === "none") { svg.innerHTML = ""; return; }
  const box = board.getBoundingClientRect();
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
  let paths = "";

  agents.forEach((to) => {
    (to.needs || []).forEach((fromId) => {
      const from = byId[fromId];
      const a = $("agent-" + fromId);
      const b = $("agent-" + to.id);
      if (!from || !a || !b) return;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x1 = ra.right - box.left, y1 = ra.top - box.top + 24;
      const x2 = rb.left - box.left, y2 = rb.top - box.top + 24;
      const mid = (x1 + x2) / 2;

      // Colour tells the story: orange and moving = data is flowing into a running agent
      let cls = "wire";
      if (to.state === "skipped" || from.state === "error" || from.state === "skipped") cls += " dead";
      else if (from.state === "done" && to.state === "running") cls += " live";
      else if (from.state === "done" && (to.state === "done" || to.state === "error")) cls += " done";
      else if (from.state === "done") cls += " ready";

      paths += `<path class="${cls}" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}"/>`;
    });
  });
  svg.innerHTML = paths;
}

// ---------- The big hours-saved number ----------
// Counts up smoothly from what is on screen to the new total, and shows "+45m" next to it.
function setHours(target) {
  const el = $("hours");
  const gained = target - shownMinutes;
  if (gained === 0) return;

  if (gained > 0 && status.runId) {
    const delta = $("hours-delta");
    delta.textContent = "+" + formatMinutes(gained);
    delta.classList.add("show");
    clearTimeout(setHours.hideTimer);
    setHours.hideTimer = setTimeout(() => delta.classList.remove("show"), 1600);
  }

  if (reduceMotion || gained < 0) { // jump straight there
    shownMinutes = target;
    el.textContent = formatMinutes(target);
    return;
  }
  cancelAnimationFrame(countAnim);
  const start = shownMinutes, startTime = performance.now(), duration = 1100;
  const step = (now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 4); // fast at first, gently settles
    shownMinutes = start + (target - start) * eased;
    el.textContent = formatMinutes(shownMinutes);
    if (t < 1) countAnim = requestAnimationFrame(step);
    else shownMinutes = target;
  };
  countAnim = requestAnimationFrame(step);
}

// ---------- Drawing everything from one status object ----------
function render() {
  const live = status.state === "running";
  const agents = status.agents && status.agents.length ? status.agents : PREVIEW_AGENTS;
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]));

  // Rebuild the board only if the line-up of agents changed (e.g. a new run)
  const key = (status.runId || "preview") + ":" + agents.map((a) => a.id + a.wave).join(",");
  if (key !== boardKey) {
    boardKey = key;
    buildBoard(agents);
    shownMinutes = 0;
    $("hours").textContent = "0m";
  }
  agents.forEach((a) => updateCard(a, byId));

  // Wave headers: "2 of 4 done"
  document.querySelectorAll(".wave").forEach((col) => {
    const inWave = agents.filter((a) => a.wave === Number(col.dataset.wave));
    const finished = inWave.filter((a) => ["done", "error", "skipped"].includes(a.state)).length;
    col.classList.toggle("is-running", inWave.some((a) => a.state === "running"));
    col.classList.toggle("is-done", Boolean(status.runId) && finished === inWave.length);
    col.querySelector(".wave-meta").textContent = status.runId ? `${finished}/${inWave.length}` : `${inWave.length} agent${inWave.length > 1 ? "s" : ""}`;
  });

  // Stats
  const done = agents.filter((a) => a.state === "done").length;
  $("done-count").textContent = status.runId ? done : 0;
  $("done-total").textContent = "/" + agents.length;
  $("segs").innerHTML = agents.map((a) => `<span class="${status.runId && a.state === "done" ? "on" : status.runId && a.state === "error" ? "err" : ""}"></span>`).join("");
  setHours(status.totalMinutesSaved || 0);

  // The line above the board: what this run is
  const runLine = $("run-line");
  if (status.runId) {
    const mode = status.mode === "production" ? '<span class="tag">Production</span>' : "";
    const verb = live ? "Working on" : "Finished";
    runLine.innerHTML = status.input
      ? `${verb}: <b>${esc(status.input)}</b>${mode}`
      : `${verb}: <b>the event Grok Bot wrote</b>${mode}`;
  } else {
    runLine.textContent = "Waiting for a launch. This page also follows runs started from the command line or from Grok Bot.";
  }

  // Top bar pill
  const pill = $("run-pill");
  if (pill.dataset.state !== "offline") {
    pill.dataset.state = live ? "running" : status.state === "done" ? "done" : "idle";
    const runningWaves = agents.filter((a) => a.state === "running").map((a) => a.wave);
    const maxWave = Math.max(...agents.map((a) => a.wave));
    $("run-pill-text").textContent = live
      ? `Live · wave ${runningWaves.length ? Math.min(...runningWaves) : "…"} of ${maxWave}`
      : status.state === "done" ? "Finished" : "Ready";
  }

  // Composer: fold the intro away while a run is on screen; block a second launch while one runs
  document.body.classList.toggle("is-live", live);
  $("launch-btn").disabled = live;
  $("production-btn").disabled = live;
  document.querySelectorAll(".example").forEach((b) => (b.disabled = live));

  // Finished banner
  const finish = $("finish");
  if (status.state === "done" && status.runId) {
    const failed = agents.filter((a) => a.state === "error").length;
    const took = time(status.finishedAt) && time(status.startedAt) ? formatClock(time(status.finishedAt) - time(status.startedAt)) : "";
    $("finish-title").textContent = `Done${took ? " in " + took : ""}. ${formatMinutes(status.totalMinutesSaved || 0)} of volunteer time saved.`;
    $("finish-sub").textContent = (failed ? `${failed} agent${failed > 1 ? "s" : ""} could not finish (see below). ` : "") +
      "Nothing has been sent. Every item is a draft until you approve it.";
    finish.hidden = false;
  } else {
    finish.hidden = true;
  }

  tick();
  requestAnimationFrame(() => drawWires(agents)); // after the cards have their final size
}

// ---------- Clocks ----------
// Runs four times a second: the total elapsed time and each running card's timer.
function tick() {
  let ms = 0;
  if (status.startedAt) ms = (time(status.finishedAt) || Date.now()) - time(status.startedAt);
  $("elapsed").textContent = formatClock(ms);
  document.querySelectorAll(".badge-text[data-since]").forEach((el) => {
    if (!el.dataset.since) return;
    el.textContent = "Running " + formatShort(Date.now() - time(el.dataset.since));
  });
}
setInterval(tick, 250);

// ---------- Listening to the server ----------
// EventSource reconnects by itself after a dropped connection. If the server refuses
// (for example it is restarting), we wait 3 seconds and open a new one.
function listen() {
  const source = new EventSource("/api/launch/stream");
  source.onmessage = (e) => {
    try { status = JSON.parse(e.data); } catch { return; }
    $("run-pill").dataset.state = ""; // back online
    render();
  };
  source.onerror = () => {
    const pill = $("run-pill");
    pill.dataset.state = "offline";
    $("run-pill-text").textContent = "Reconnecting";
    if (source.readyState === EventSource.CLOSED) setTimeout(listen, 3000);
  };
}

// ---------- Launching ----------
async function launch(body) {
  const msg = $("form-msg");
  msg.className = "form-msg";
  msg.textContent = "Starting the agents…";
  $("launch-btn").disabled = true;
  try {
    const res = await fetch("/api/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      msg.textContent = (data.error || "A run is already going.") + " Following it below.";
    } else if (!res.ok) {
      throw new Error(data.error || `The server said ${res.status}.`);
    } else {
      msg.textContent = "";
    }
    // The stream will bring the run's status in a moment; ask once now too so the board reacts at once.
    fetch("/api/launch/status").then((r) => r.json()).then((s) => { if (s && s.runId) { status = s; render(); } }).catch(() => {});
  } catch (err) {
    msg.className = "form-msg error";
    msg.textContent = "Could not start: " + err.message;
    $("launch-btn").disabled = status.state === "running";
  }
}

$("launch-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("idea").value.trim();
  if (!input) {
    $("form-msg").className = "form-msg error";
    $("form-msg").textContent = "Type one line about your event first, or paste a Luma link.";
    $("idea").focus();
    return;
  }
  launch({ input });
});
$("production-btn").addEventListener("click", () => launch({ mode: "production" }));

// Example chips fill the box; the lead still clicks Launch
document.querySelectorAll(".example").forEach((chip) => chip.addEventListener("click", () => {
  $("idea").value = chip.textContent.trim();
  $("idea").focus();
}));

// Clear the "type something first" message as soon as they type
$("idea").addEventListener("input", () => {
  if ($("form-msg").classList.contains("error")) { $("form-msg").textContent = ""; $("form-msg").className = "form-msg"; }
});

// Redraw the connector lines when the window or the cards change size
new ResizeObserver(() => drawWires(status.agents && status.agents.length ? status.agents : PREVIEW_AGENTS)).observe($("board"));

// ---------- Start ----------
render();  // show the preview line-up straight away
fetch("/api/launch/status").then((r) => r.json()).then((s) => { if (s && s.state) { status = s; render(); } }).catch(() => {});
listen();
