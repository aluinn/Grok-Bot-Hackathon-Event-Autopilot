// The dashboard's brain. It shows one card per item and remembers approvals/edits in this browser only.
// Nothing here sends anything anywhere: "Approve" just marks a card, "Copy" just uses your clipboard.

const STORAGE_KEY = "event-autopilot-state";

// Dummy alternative text for the Regenerate button (replaced by real Grok text later)
const DUMMY_ALTERNATIVES = {
  page_copy: "Calling all makers! London Builders Night lands at Tech Hub Shoreditch. Share what you're building, get friendly feedback and meet your local scene.",
  newsletter: {
    subject: "Last call: London Builders Night is nearly full",
    body: "Hello!\n\nSpots for London Builders Night are going fast. Come along for demos, feedback and a great crowd.\n\nHope to see you there!",
  },
  linkedin: "Builders of London: we're gathering at Tech Hub Shoreditch for an evening of demos and feedback. Join us and show what you're shipping.",
  whatsapp: "London Builders Night, 12 Nov! Demos, pizza and good people. Fancy it? Reply YES and I'll save you a spot.",
  discord: "Builders Night is coming! Tech Hub Shoreditch, 12 Nov. Drop a thumbs up if you're in.",
};

let event, promo, imageFiles;
let state = loadState(); // { itemId: { approved, text, subject, body } }
let editing = null;      // id of the card being edited right now

// Does this person's computer ask for less motion? If so, we skip the 3D scrolling.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Saving in the browser ----------
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode: just don't save */ }
}

// ---------- The list of cards ----------
function getItems() {
  return [
    { id: "page_copy", title: "Event page copy", text: promo.page_copy },
    { id: "newsletter", title: "Newsletter", subject: promo.newsletter.subject, body: promo.newsletter.body },
    { id: "linkedin", title: "LinkedIn post", text: promo.posts.linkedin },
    { id: "whatsapp", title: "WhatsApp post", text: promo.posts.whatsapp },
    { id: "discord", title: "Discord post", text: promo.posts.discord },
    { id: "images", title: "Promo images", isImages: true },
  ];
}
function findItem(id) {
  return getItems().find((i) => i.id === id);
}

// The current text of an item: the edited version if there is one, otherwise the original
function current(item) {
  const saved = state[item.id] || {};
  if (item.id === "newsletter") {
    return { subject: saved.subject ?? item.subject, body: saved.body ?? item.body };
  }
  return { text: saved.text ?? item.text };
}
function setState(id, changes) {
  state[id] = { ...state[id], ...changes };
  saveState();
}

// ---------- Scroll-in animation ----------
// When something scrolls into view, add the class "in" and the CSS slides it into place.
const revealer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("in");
      revealer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

// ---------- Building the cards (once) ----------
function buildCards() {
  const container = document.getElementById("cards");
  getItems().forEach((item, i) => {
    const card = document.createElement("article");
    card.className = "card";
    card.id = "card-" + item.id;
    // The header is built once, so the tick can animate when the card becomes approved
    card.innerHTML = `
      <div class="card-head">
        <span class="num">0${i + 1}</span>
        <h2>${item.title}</h2>
        <span class="state">
          <span class="dot"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
          <span class="t-pending">Pending review</span><span class="t-approved">Approved</span>
        </span>
      </div>
      <div class="card-body"></div>
      <div class="buttons"></div>`;
    container.appendChild(card);
    drawCard(item);
    revealer.observe(card);
  });
}

// Redraw the changing parts of ONE card (its content and buttons). The card itself stays,
// so colour changes and the tick animate smoothly instead of jumping.
function drawCard(item) {
  const card = document.getElementById("card-" + item.id);
  const approved = !!state[item.id]?.approved;
  const isEditing = editing === item.id;
  card.classList.toggle("approved", approved);

  const body = card.querySelector(".card-body");
  const buttons = card.querySelector(".buttons");
  body.replaceChildren();
  buttons.replaceChildren();

  if (item.isImages) body.appendChild(buildImages());
  else body.appendChild(isEditing ? buildEditor(item) : buildReadOnly(item));
  body.firstChild.classList.add("fade-in");

  if (isEditing) {
    buttons.appendChild(button("Save", "approve", () => saveEdit(item)));
    buttons.appendChild(button("Cancel", "", () => setEditing(null)));
  } else {
    buttons.appendChild(button(approved ? "Approved" : "Approve", "approve", () => {
      setState(item.id, { approved: !approved });
      drawCard(item);
      updateProgress();
    }));
    // The send buttons only exist once the item is approved (the server refuses otherwise too)
    if (approved && SEND_LABELS[item.id]) {
      buttons.appendChild(button(SEND_LABELS[item.id], "send", (e) => sendItem(item, e.target)));
    }
    if (!item.isImages) {
      // Approve (and send) on the left; the quieter tools on the right
      const spacer = document.createElement("span");
      spacer.className = "spacer";
      buttons.appendChild(spacer);
      buttons.appendChild(button("Edit", "", () => setEditing(item.id)));
      buttons.appendChild(button("Regenerate", "", () => regenerate(item)));
      buttons.appendChild(button("Copy", "", (e) => copyText(item, e.target)));
    }
  }
}

function button(label, className, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  if (className) b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

// Small labels above each preview, and who "posts" it in the mock-up
const PREVIEW_TAGS = {
  page_copy: "Event page",
  newsletter: "Email",
  linkedin: "LinkedIn preview",
  whatsapp: "WhatsApp preview",
  discord: "Discord preview",
};

// Show each item roughly as it will look where it ends up (all text is placed safely with textContent)
function buildReadOnly(item) {
  const c = current(item);
  const host = (event.hosts && event.hosts[0]) || "Event host";
  const initials = host.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const wrap = document.createElement("div");
  wrap.innerHTML = `<p class="preview-tag"></p><div class="panel"></div>`;
  wrap.querySelector(".preview-tag").textContent = PREVIEW_TAGS[item.id];
  const panel = wrap.querySelector(".panel");

  if (item.id === "newsletter") {
    panel.innerHTML = `<p class="label">Subject</p><p class="subject"></p><p class="content"></p>`;
    panel.querySelector(".subject").textContent = c.subject;
    panel.querySelector(".content").textContent = c.body;
  } else if (item.id === "linkedin") {
    panel.innerHTML = `<div class="p-head"><span class="avatar"></span><div><div class="p-name"></div><div class="p-meta">Event host · Just now</div></div></div>
      <p class="content"></p><div class="p-actions"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>`;
  } else if (item.id === "whatsapp") {
    panel.innerHTML = `<div class="bubble"><p class="content"></p><span class="time"></span></div>`;
    panel.querySelector(".time").textContent = time;
  } else if (item.id === "discord") {
    panel.innerHTML = `<div class="discord-row"><span class="avatar"></span><div><div class="p-name"><span class="who"></span><span class="stamp"></span></div><p class="content"></p></div></div>`;
    panel.querySelector(".who").textContent = host;
    panel.querySelector(".stamp").textContent = "Today at " + time;
  } else {
    panel.innerHTML = `<p class="content"></p>`;
  }

  if (item.id !== "newsletter") panel.querySelector(".content").textContent = c.text;
  const avatar = panel.querySelector(".avatar");
  if (avatar) avatar.textContent = initials;
  const name = panel.querySelector(".p-name");
  if (name && item.id === "linkedin") name.textContent = host;
  return wrap;
}

function buildEditor(item) {
  const wrap = document.createElement("div");
  wrap.className = "panel";
  const c = current(item);
  if (item.id === "newsletter") {
    wrap.innerHTML = `<p class="label">Subject</p><input type="text" id="edit-subject"><p class="label">Body</p><textarea id="edit-body"></textarea>`;
    wrap.querySelector("#edit-subject").value = c.subject;
    wrap.querySelector("#edit-body").value = c.body;
  } else {
    wrap.innerHTML = `<textarea id="edit-text"></textarea>`;
    wrap.querySelector("#edit-text").value = c.text;
  }
  return wrap;
}

const IMAGE_SIZES = { wide: "1200 × 630", square: "1080 × 1080", story: "1080 × 1920" };

function buildImages() {
  const wrap = document.createElement("div");
  if (imageFiles.length === 0) {
    wrap.className = "panel";
    wrap.innerHTML = `<p class="content muted">No promo images yet. They appear here once the images have been created.</p>`;
    return wrap;
  }
  wrap.className = "images";
  imageFiles.forEach((file) => {
    const url = "/output/" + encodeURIComponent(file);
    const figure = document.createElement("figure");

    // Every picture sits in the same size tile, so tall and wide images line up neatly
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const img = document.createElement("img");
    img.src = url;
    img.alt = file;
    thumb.appendChild(img);
    figure.appendChild(thumb);

    // Caption: the name and size on the left, a download button on the right
    const type = file.replace("promo-", "").replace(".png", "");
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.innerHTML = `<div><span class="cap-name"></span><span class="cap-dims"></span></div>`;
    cap.querySelector(".cap-name").textContent = type[0].toUpperCase() + type.slice(1);
    cap.querySelector(".cap-dims").textContent = IMAGE_SIZES[type] || "PNG";

    // Download button: saves the picture to your computer
    const link = document.createElement("a");
    link.className = "button";
    link.href = url;
    link.download = file;
    link.textContent = "Download";
    cap.appendChild(link);
    figure.appendChild(cap);

    wrap.appendChild(figure);
  });
  return wrap;
}

// ---------- Button actions ----------
function setEditing(id) {
  const previous = editing;
  editing = id;
  if (previous) drawCard(findItem(previous)); // close any editor that was open
  if (id) drawCard(findItem(id));
}

function saveEdit(item) {
  // Changing the text means the lead must look at it again, so approval is cleared
  if (item.id === "newsletter") {
    setState(item.id, {
      subject: document.getElementById("edit-subject").value,
      body: document.getElementById("edit-body").value,
      approved: false,
    });
  } else {
    setState(item.id, { text: document.getElementById("edit-text").value, approved: false });
  }
  editing = null;
  drawCard(item);
  updateProgress();
}

function regenerate(item) {
  // Show calm pulsing bars while we "think", then swap in the alternative text
  const body = document.querySelector(`#card-${item.id} .card-body`);
  body.innerHTML = `<div class="panel skeleton fade-in"><span></span><span></span><span></span></div>`;

  // Save the new text, un-approve the card (the lead must look again) and redraw it
  const useText = (alt) => {
    if (item.id === "newsletter") setState(item.id, { subject: alt.subject, body: alt.body, approved: false });
    else setState(item.id, { text: alt, approved: false });
    drawCard(item);
    updateProgress();
  };

  // Ask Grok (through the server) for a fresh version. If Grok is not set up, fall back to the dummy text.
  const c = current(item);
  fetch("/api/regenerate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: item.id, current: item.id === "newsletter" ? c : c.text }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      useText(data.result);
    })
    .catch((err) => {
      console.warn("Grok regenerate failed, using the dummy text:", err.message);
      setTimeout(() => useText(DUMMY_ALTERNATIVES[item.id]), 900); // keep the loading bars up briefly so it doesn't flash
    });
}

// ---------- Sending (only after Approve) ----------
// What the send button says for each item. Items not listed here have no send button.
const SEND_LABELS = {
  discord: "Post to Discord",
  newsletter: "Save Ghost draft",
  whatsapp: "Open in WhatsApp",
  linkedin: "Open in LinkedIn",
};

async function sendItem(item, buttonEl) {
  const c = current(item);
  const approved = !!state[item.id]?.approved;
  if (!approved) return alert("Approve this item first."); // belt and braces: the server refuses too
  buttonEl.textContent = "Working...";
  try {
    if (item.id === "whatsapp" || item.id === "linkedin") {
      // These platforms don't allow posting for you, so we open a pre-filled message to send by hand
      const r = await (await fetch("/api/share-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: item.id, text: c.text }) })).json();
      window.open(r.url, "_blank");
      buttonEl.textContent = SEND_LABELS[item.id];
      return;
    }
    const channel = item.id === "newsletter" ? "ghost" : "discord";
    const payload = item.id === "newsletter" ? { subject: c.subject, body: c.body, approved: true } : { text: c.text, approved: true };
    const r = await (await fetch("/api/send/" + channel, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).json();
    if (r.error) throw new Error(r.error);
    setState(item.id, { sentAt: new Date().toISOString() });
    buttonEl.textContent = channel === "ghost" ? "Draft saved in Ghost" : "Posted to Discord";
  } catch (err) {
    buttonEl.textContent = SEND_LABELS[item.id];
    alert("Could not send: " + err.message);
  }
}

function copyText(item, buttonEl) {
  const c = current(item);
  const text = item.id === "newsletter" ? `Subject: ${c.subject}\n\n${c.body}` : c.text;
  navigator.clipboard.writeText(text);
  buttonEl.textContent = "Copied!";
  setTimeout(() => (buttonEl.textContent = "Copy"), 1500);
}

// ---------- The checklist on the left ----------
function buildRail() {
  const items = getItems();
  const rail = document.getElementById("rail");
  rail.innerHTML = `<p class="rail-label">Review</p><ul></ul>
    <div class="rail-count"><span>Approved</span><span><b id="rail-count">0</b> / ${items.length}</span></div><div class="segs"></div>`;

  items.forEach((item) => {
    const li = document.createElement("li");
    li.id = "rail-" + item.id;
    li.innerHTML = `<a href="#card-${item.id}"><span class="mark"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="rail-title"></span></a>`;
    li.querySelector(".rail-title").textContent = item.title;
    rail.querySelector("ul").appendChild(li);
    rail.querySelector(".segs").appendChild(document.createElement("span"));
  });

  // Highlight the item you're currently reading
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      rail.querySelectorAll("a").forEach((a) => a.classList.remove("active"));
      rail.querySelector(`#rail-${entry.target.id.replace("card-", "")} a`).classList.add("active");
    });
  }, { rootMargin: "-35% 0px -55% 0px" });
  document.querySelectorAll(".card").forEach((card) => spy.observe(card));
}

// ---------- Progress ----------
let lastCount = null;
function updateProgress() {
  const items = getItems();
  const count = items.filter((i) => state[i.id]?.approved).length;
  document.getElementById("progress-label").textContent = `${count} of ${items.length} approved`;

  // The checklist: a tick beside each approved item, and one segment per item
  items.forEach((item, i) => {
    document.getElementById("rail-" + item.id).classList.toggle("approved", !!state[item.id]?.approved);
    document.querySelectorAll(".segs span")[i].classList.toggle("on", !!state[item.id]?.approved);
  });
  document.getElementById("rail-count").textContent = count;

  const fill = document.getElementById("bar-fill");
  fill.style.width = `${(count / items.length) * 100}%`;
  fill.classList.toggle("done", count === items.length);

  // Little "pop" on the number whenever it changes
  if (lastCount !== null && lastCount !== count) {
    const box = document.querySelector(".nav-progress");
    box.classList.remove("pop");
    void box.offsetWidth; // restart the animation
    box.classList.add("pop");
  }
  lastCount = count;

  document.getElementById("done").classList.toggle("show", count === items.length);
}

// ---------- The header and the 3D intro ----------
function prettyDate(date) {
  const d = new Date(date + "T12:00:00");
  if (isNaN(d)) return date;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function buildHeader() {
  document.title = event.name + ": Approve";
  document.getElementById("event-name").textContent = event.name;

  const chips = [
    [prettyDate(event.date) + (event.time ? " · " + event.time : ""), ""],
    [event.venue, ""],
    [event.guest_count + " going", "accent"],
  ];
  const box = document.getElementById("event-chips");
  chips.forEach(([text, extra]) => {
    const chip = document.createElement("span");
    chip.className = "chip " + extra;
    chip.textContent = text;
    box.appendChild(chip);
  });
}

// Put the promo images (or empty placeholders) in the 3D scene, left to right: wide, square, story
function buildStage() {
  const stage = document.getElementById("stage");
  ["wide", "square", "story"].forEach((type) => {
    const file = imageFiles.find((f) => f.includes(type));
    const layer = document.createElement("div");
    layer.className = "layer " + type;
    if (file) {
      const img = document.createElement("img");
      img.src = "/output/" + encodeURIComponent(file);
      img.alt = "";
      layer.appendChild(img);
    } else {
      layer.innerHTML = `<div class="placeholder">Promo image coming</div>`;
    }
    stage.appendChild(layer);
  });
}

// As you scroll through the intro, a number "p" goes from 0 (top) to 1 (bottom).
// We turn it into: images tilt flat, then fly toward you and fade; the title drifts up and fades.
let targetP = 0, currentP = 0, animating = false;

function readScroll() {
  const hero = document.getElementById("hero");
  const range = hero.offsetHeight - window.innerHeight;
  targetP = Math.min(Math.max(window.scrollY / range, 0), 1);
  if (!animating) { animating = true; requestAnimationFrame(tick); }
}

// Each frame, glide a fraction of the way to the target so movement feels smooth, not jumpy
function tick() {
  currentP += (targetP - currentP) * 0.12;
  if (Math.abs(targetP - currentP) < 0.0005) currentP = targetP;
  applyScene(currentP);
  if (currentP !== targetP) requestAnimationFrame(tick);
  else animating = false;
}

function applyScene(p) {
  const tilt = 1 - Math.min(p / 0.55, 1); // 1 = fully tilted back, 0 = flat
  const stage = document.getElementById("stage");
  stage.style.transform = `rotateX(${55 * tilt}deg) rotateZ(${-16 * tilt}deg) scale(${0.8 + 1.1 * p})`;
  stage.style.opacity = Math.min(1, Math.max(0, (0.74 - p) / 0.26)); // full until just under halfway, gone by 74%

  // The heading "Everything we made for you" fades in and settles up into place as the images dissolve
  const arrive = Math.min(1, Math.max(0, (p - 0.58) / 0.22));
  const end = document.getElementById("hero-end");
  end.style.opacity = arrive;
  end.style.transform = `translateY(${(1 - arrive) * 40}px)`;

  const fadeOut = Math.max(0, 1 - p * 2.5);
  const text = document.getElementById("hero-text");
  text.style.transform = `translateY(${-p * 140}px)`;
  text.style.opacity = fadeOut;
  document.getElementById("scroll-hint").style.opacity = fadeOut;
}

// ---------- Start up ----------
async function start() {
  event = await (await fetch("/shared/event.json")).json();
  promo = await (await fetch("/shared/promo.json")).json();
  imageFiles = await (await fetch("/api/images")).json();

  buildHeader();
  buildStage();
  buildCards();
  buildRail();
  updateProgress();
  document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

  if (!reduceMotion) {
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", readScroll);
    readScroll();
    applyScene(currentP);
  }
}

start();
