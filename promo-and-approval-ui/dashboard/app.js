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

// ---------- Saving in the browser ----------
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- The list of cards ----------
// Each item: id, title, and (for text items) how to read its original text from promo.json
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

// ---------- Drawing the page ----------
function render() {
  const items = getItems();
  const container = document.getElementById("cards");
  container.innerHTML = "";
  items.forEach((item) => container.appendChild(buildCard(item)));

  // Progress bar
  const approvedCount = items.filter((i) => state[i.id]?.approved).length;
  document.getElementById("progress-label").textContent = `${approvedCount} of ${items.length} approved`;
  const fill = document.getElementById("bar-fill");
  fill.style.width = `${(approvedCount / items.length) * 100}%`;
  fill.classList.toggle("done", approvedCount === items.length);
}

function button(label, className, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  if (className) b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

function buildCard(item) {
  const approved = !!state[item.id]?.approved;
  const isEditing = editing === item.id;

  const card = document.createElement("article");
  card.className = "card" + (approved ? " approved" : "");
  card.id = "card-" + item.id;

  const top = document.createElement("div");
  top.className = "card-top";
  top.innerHTML = `<h2>${item.title}</h2>` + (approved ? `<span class="tick">&#10003; Approved</span>` : "");
  card.appendChild(top);

  // --- Content area ---
  if (item.isImages) {
    card.appendChild(buildImages());
  } else if (isEditing) {
    card.appendChild(buildEditor(item));
  } else {
    card.appendChild(buildReadOnly(item));
  }

  // --- Buttons ---
  const buttons = document.createElement("div");
  buttons.className = "buttons";

  if (isEditing) {
    buttons.appendChild(button("Save", "approve", () => saveEdit(item)));
    buttons.appendChild(button("Cancel", "", () => { editing = null; render(); }));
  } else {
    buttons.appendChild(button(approved ? "Approved" : "Approve", "approve", () => {
      setState(item.id, { approved: !approved });
      render();
    }));
    if (!item.isImages) {
      buttons.appendChild(button("Edit", "", () => { editing = item.id; render(); }));
      buttons.appendChild(button("Regenerate", "", () => regenerate(item)));
      buttons.appendChild(button("Copy", "", (e) => copyText(item, e.target)));
    }
  }
  card.appendChild(buttons);
  return card;
}

function buildReadOnly(item) {
  const wrap = document.createElement("div");
  const c = current(item);
  if (item.id === "newsletter") {
    wrap.innerHTML = `<p class="label">Subject</p><p class="subject"></p><p class="label">Body</p><p class="content"></p>`;
    wrap.querySelector(".subject").textContent = c.subject;
    wrap.querySelector(".content").textContent = c.body;
  } else {
    wrap.innerHTML = `<p class="content"></p>`;
    wrap.querySelector(".content").textContent = c.text;
  }
  return wrap;
}

function buildEditor(item) {
  const wrap = document.createElement("div");
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

function buildImages() {
  const wrap = document.createElement("div");
  if (imageFiles.length === 0) {
    wrap.innerHTML = `<p class="content muted">No promo images yet. They appear here once the images have been created.</p>`;
    return wrap;
  }
  wrap.className = "images";
  imageFiles.forEach((file) => {
    const img = document.createElement("img");
    img.src = "/output/" + encodeURIComponent(file);
    img.alt = file;
    wrap.appendChild(img);
  });
  return wrap;
}

// ---------- Button actions ----------
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
  render();
}

function regenerate(item) {
  // Show a short loading message, then swap in the alternative text
  const content = document.querySelector(`#card-${item.id} .content`);
  content.textContent = "Regenerating...";
  content.classList.add("loading");

  // TODO: Replace this timer + dummy text with the real Grok call.
  // The real call should return new text for this item, which we save with setState() below.
  setTimeout(() => {
    const alt = DUMMY_ALTERNATIVES[item.id];
    if (item.id === "newsletter") setState(item.id, { subject: alt.subject, body: alt.body, approved: false });
    else setState(item.id, { text: alt, approved: false });
    render();
  }, 1200);
}

function copyText(item, buttonEl) {
  const c = current(item);
  const text = item.id === "newsletter" ? `Subject: ${c.subject}\n\n${c.body}` : c.text;
  navigator.clipboard.writeText(text);
  buttonEl.textContent = "Copied!";
  setTimeout(() => (buttonEl.textContent = "Copy"), 1500);
}

// ---------- Start up ----------
async function start() {
  event = await (await fetch("/shared/event.json")).json();
  promo = await (await fetch("/shared/promo.json")).json();
  imageFiles = await (await fetch("/api/images")).json();

  document.title = event.name + ": Approve";
  document.getElementById("event-name").textContent = event.name;
  document.getElementById("event-details").textContent =
    `${event.date} · ${event.venue} · ${event.guest_count} guests`;
  render();
}

start();
