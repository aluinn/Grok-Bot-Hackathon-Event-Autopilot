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
          <span class="dot"></span>
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
  buttons.replaceChildren();

  if (isLive(item)) {
    drawLiveBody(item, body, isEditing);
  } else {
    body.replaceChildren();
    if (item.isImages) body.appendChild(buildImages());
    else body.appendChild(isEditing ? buildEditor(item) : buildReadOnly(item));
    body.firstChild.classList.add("fade-in");
  }

  if (isEditing) {
    buttons.appendChild(button("Save", "approve", () => saveEdit(item), "check"));
    buttons.appendChild(button("Cancel", "", () => setEditing(null)));
  } else {
    buttons.appendChild(button(approved ? "Approved" : "Approve", "approve", () => {
      setState(item.id, { approved: !approved });
      drawCard(item);
      updateProgress();
    }, "check"));
    // The send buttons only exist once the item is approved (the server refuses otherwise too)
    if (approved && SEND_LABELS[item.id]) {
      buttons.appendChild(button(SEND_LABELS[item.id], "send", (e) => sendItem(item, e.currentTarget)));
    }
    // Preview links: the event page (for the page copy) and the branded email (for the newsletter)
    if (PREVIEW_LINKS[item.id]) {
      const link = document.createElement("a");
      link.className = "button";
      link.href = PREVIEW_LINKS[item.id].href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = PREVIEW_LINKS[item.id].label;
      buttons.appendChild(link);
    }
    if (!item.isImages) {
      // Approve (and send) on the left; the quieter tools on the right
      const spacer = document.createElement("span");
      spacer.className = "spacer";
      buttons.appendChild(spacer);
      buttons.appendChild(button("Edit", "", () => setEditing(item.id), "pencil"));
      buttons.appendChild(button("Regenerate", "", () => regenerate(item), "refresh"));
      buttons.appendChild(button("Copy", "", (e) => copyText(item, e.currentTarget), "copy"));
    }
  }
}

// Small line icons (inline SVG, all drawn the same way, no icon library)
const ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.2L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.2L20 15"/><path d="M20 20v-5h-5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>',
};

// The label sits in its own span so an icon can sit before it and survive label changes (like "Copied!")
function button(label, className, onClick, icon) {
  const b = document.createElement("button");
  if (icon) b.innerHTML = ICONS[icon];
  const text = document.createElement("span");
  text.className = "btn-label";
  text.textContent = label;
  b.appendChild(text);
  if (className) b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

// ---------- Live post previews (LinkedIn, WhatsApp, Discord) ----------
// These three cards show the real preview pages from templates/previews/ inside a frame.
// The frame is created ONCE per card and then only sent messages. If we rebuilt it every time you
// approved or edited, it would reload and flicker.
const POST_IDS = ["linkedin", "whatsapp", "discord"];
function isPost(item) {
  return POST_IDS.includes(item.id);
}

function previewFrame(item) {
  return document.querySelector(`#card-${item.id} .post-preview iframe`);
}

// The event image shown with the post: the wide poster if there is one, otherwise the first image, otherwise none
function previewImageUrl() {
  const file = imageFiles.find((f) => f.includes("wide")) || imageFiles[0];
  return file ? "/output/" + encodeURIComponent(file) : "";
}

// Tell a preview frame what to show. (If the frame hasn't finished loading yet, its load handler sends this.)
function sendPreview(item) {
  const frame = previewFrame(item);
  if (!frame || frame.dataset.loaded !== "yes") return;
  frame.contentWindow.postMessage(
    { type: "preview-update", post: current(item).text, imageUrl: previewImageUrl(), event },
    location.origin
  );
}

function buildPostPreview(item) {
  const wrap = document.createElement("div");
  wrap.className = "post-preview " + item.id;
  wrap.innerHTML = `<p class="preview-tag"></p><div class="frame-box"><iframe></iframe></div>`;
  wrap.querySelector(".preview-tag").textContent = PREVIEW_TAGS[item.id];
  const frame = wrap.querySelector("iframe");
  frame.title = PREVIEW_TAGS[item.id];
  frame.addEventListener("load", () => { frame.dataset.loaded = "yes"; sendPreview(item); });
  frame.src = "/templates/previews/" + item.id + "-preview.html";
  return wrap;
}

// ---------- Live previews of the real event page and the real email ----------
// The Event page card shows Tiago's real page (event-page/), the Newsletter card shows the real branded email.
// Both are shown in a locked-down frame (no scripts can run in it), and both show the lead's CURRENT text,
// so what you approve is what gets published or sent.
const DOC_IDS = ["page_copy", "newsletter"];
function isDoc(item) {
  return DOC_IDS.includes(item.id);
}
function isLive(item) {
  return isPost(item) || isDoc(item);
}
const LIVE_PREVIEW = ".post-preview, .doc-preview"; // the preview of any live card

const DOC_NOTES = {
  page_copy: "This is the real event page. Only the About text is your copy; the programme comes from the run sheet.",
  newsletter: "This is the email as it will be sent. The poster and the Reserve button go live once the event page is published.",
};

function docFrame(item) {
  return document.querySelector(`#card-${item.id} .doc-preview iframe`);
}

function escapeHtml(text) {
  return String(text == null ? "" : text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A short message shown inside the frame when the page or email can't be shown
function noticePage(message) {
  return `<!DOCTYPE html><body style="margin:0;padding:32px;background:#0B0B0F;color:#9A9AA5;font:16px/1.6 system-ui,sans-serif">${escapeHtml(message)}</body>`;
}

// The built event page, with its About section showing the lead's current copy
async function eventPageHtml(copy) {
  const response = await fetch("/event-page/", { cache: "no-store" });
  if (!response.ok) throw new Error("The event page hasn't been built yet. It appears when the autopilot runs.");
  const doc = new DOMParser().parseFromString(await response.text(), "text/html"); // parsing never runs scripts
  const about = [...doc.querySelectorAll("section")].find((sec) => (sec.querySelector("h2")?.textContent || "").trim() === "About");
  if (!about) return "<!DOCTYPE html>" + doc.documentElement.outerHTML; // the page layout changed: show it as built

  about.querySelectorAll("p").forEach((p) => p.remove());
  const paragraphs = String(copy || "").trim().split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  if (!paragraphs.length) paragraphs.push("No page copy written yet.");
  paragraphs.forEach((text) => {
    const p = doc.createElement("p");
    text.split("\n").forEach((line, i) => {
      if (i) p.appendChild(doc.createElement("br"));
      p.appendChild(doc.createTextNode(line)); // text node: safe even if the copy contains < or &
    });
    about.appendChild(p);
  });
  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

// The branded email for the lead's current subject and body (the server builds it; nothing is sent)
async function newsletterHtml(c) {
  const response = await fetch("/api/preview/newsletter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: c.subject, body: c.body }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.html;
}

// Show the current text in the frame. Does nothing if the text hasn't changed since last time,
// so approving a card never reloads its preview.
async function updateDocPreview(item) {
  const frame = docFrame(item);
  if (!frame) return;
  const c = current(item);
  const key = JSON.stringify(c);
  if (frame.dataset.key === key) return;
  frame.dataset.key = key;
  let html;
  try {
    html = item.id === "newsletter" ? await newsletterHtml(c) : await eventPageHtml(c.text);
  } catch (err) {
    html = noticePage(err.message);
  }
  if (frame.dataset.key === key) frame.srcdoc = html; // ignore an answer that arrives after a newer edit
}

// Size the preview frame to its content.
// - The email: as tall as the email, up to a limit (longer emails scroll inside the frame).
// - The event page: laid out at desktop width and scaled down to fit the card, so the header, the facts and the
//   About text are all visible together. On a phone (a narrow card) it lays out normally instead of shrinking to nothing.
const PAGE_DESKTOP_WIDTH = 1000;
function fitDocFrame(frame, item) {
  try {
    const doc = frame.contentDocument;
    const apply = () => {
      if (item.id !== "page_copy") {
        frame.style.height = Math.min(doc.documentElement.scrollHeight + 2, 720) + "px";
        return;
      }
      const box = frame.parentElement; // the .scaler around the frame
      const cardWidth = box.clientWidth;
      const layoutWidth = cardWidth >= 700 ? PAGE_DESKTOP_WIDTH : cardWidth;
      const scale = cardWidth / layoutWidth;
      frame.style.width = layoutWidth + "px";
      frame.style.transform = `scale(${scale})`;
      frame.style.transformOrigin = "0 0";
      const shown = Math.min(doc.documentElement.scrollHeight * scale, 640); // how tall the window looks on screen
      box.style.height = shown + "px";
      frame.style.height = shown / scale + "px";
    };
    apply();
    if (doc.fonts) doc.fonts.ready.then(apply);
  } catch (e) { /* if the frame can't be measured, it keeps its default height */ }
}

function buildDocPreview(item) {
  const wrap = document.createElement("div");
  wrap.className = "doc-preview " + item.id;
  wrap.innerHTML = `<p class="preview-tag"></p>
    <div class="frame-box"><div class="chrome"><i></i><i></i><i></i><span class="chrome-title"></span></div><div class="scaler"><iframe></iframe></div></div>
    <p class="preview-note"></p>`;
  wrap.querySelector(".preview-tag").textContent = PREVIEW_TAGS[item.id];
  wrap.querySelector(".chrome-title").textContent = PREVIEW_TAGS[item.id];
  wrap.querySelector(".preview-note").textContent = DOC_NOTES[item.id];
  const frame = wrap.querySelector("iframe");
  frame.title = PREVIEW_TAGS[item.id];
  // No "allow-scripts": nothing inside can run code. Links may open in a new tab.
  frame.setAttribute("sandbox", "allow-same-origin allow-popups allow-popups-to-escape-sandbox");
  frame.addEventListener("load", () => fitDocFrame(frame, item));
  // If the window is resized, fit the page to the new card width
  let lastWidth = 0;
  new ResizeObserver(() => {
    const width = wrap.querySelector(".scaler").clientWidth;
    if (width !== lastWidth) { lastWidth = width; if (frame.dataset.key) fitDocFrame(frame, item); }
  }).observe(wrap.querySelector(".scaler"));
  return wrap;
}

// Tell a card's preview to show the current text
function updatePreview(item) {
  if (isPost(item)) sendPreview(item);
  else updateDocPreview(item);
}

// The body of a card: its live preview (made once), or the text editor while you are editing
function drawLiveBody(item, body, isEditing) {
  let host = body.querySelector(LIVE_PREVIEW);
  if (!host) {
    body.replaceChildren();
    host = isPost(item) ? buildPostPreview(item) : buildDocPreview(item);
    host.classList.add("fade-in");
    body.appendChild(host);
  }
  body.querySelectorAll(".panel").forEach((n) => n.remove()); // an old editor or loading bars
  host.hidden = isEditing; // hiding keeps the frame alive, so nothing reloads
  if (isEditing) {
    const editor = buildEditor(item);
    editor.classList.add("fade-in");
    body.appendChild(editor);
  } else {
    updatePreview(item);
  }
}

// A frame tells us how tall its page is; make the frame exactly that tall so it has no inner scrollbar
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || e.data.type !== "preview-height") return;
  document.querySelectorAll(".post-preview iframe").forEach((f) => {
    if (f.contentWindow === e.source) f.style.height = e.data.height + "px";
  });
});

// Small labels above each preview, and who "posts" it in the mock-up
const PREVIEW_TAGS = {
  page_copy: "Event page",
  newsletter: "Email",
  linkedin: "LinkedIn preview",
  whatsapp: "WhatsApp preview",
  discord: "Discord preview",
};

// The page copy and the newsletter, shown as plain readable blocks (all text is placed safely with textContent)
function buildReadOnly(item) {
  const c = current(item);
  const wrap = document.createElement("div");
  wrap.innerHTML = `<p class="preview-tag"></p><div class="panel"></div>`;
  wrap.querySelector(".preview-tag").textContent = PREVIEW_TAGS[item.id];
  const panel = wrap.querySelector(".panel");

  if (item.id === "newsletter") {
    panel.innerHTML = `<p class="label">Subject</p><p class="subject"></p><p class="content"></p>`;
    panel.querySelector(".subject").textContent = c.subject;
    panel.querySelector(".content").textContent = c.body;
  } else {
    panel.innerHTML = `<p class="content"></p>`;
    panel.querySelector(".content").textContent = c.text;
  }
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
  const bars = `<div class="panel skeleton fade-in"><span></span><span></span><span></span></div>`;
  const host = body.querySelector(LIVE_PREVIEW);
  if (host) { host.hidden = true; body.insertAdjacentHTML("beforeend", bars); } // keep the preview frame alive
  else body.innerHTML = bars;

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
  page_copy: "Publish event page",
  discord: "Post to Discord",
  newsletter: "Save Ghost draft",
  whatsapp: "Open in WhatsApp",
  linkedin: "Open in LinkedIn",
};

// "View" links shown on a card whether or not it is approved (they only preview, never send)
const PREVIEW_LINKS = {
  page_copy: { href: "/event-page/", label: "View event page" },
  newsletter: { href: "/newsletter/", label: "View email" },
};

async function sendItem(item, buttonEl) {
  const c = current(item);
  const approved = !!state[item.id]?.approved;
  if (!approved) return alert("Approve this item first."); // belt and braces: the server refuses too
  buttonEl.textContent = "Working...";
  try {
    if (item.id === "page_copy") {
      // Publishing puts the page online for everyone, so ask once more
      if (!confirm("Put the event page online now? Anyone with the link will be able to see it.")) {
        buttonEl.textContent = SEND_LABELS[item.id];
        return;
      }
      buttonEl.textContent = "Publishing...";
      const r = await (await fetch("/api/publish-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: true, page_copy: c.text }) })).json();
      if (r.error) throw new Error(r.error);
      setState(item.id, { sentAt: new Date().toISOString(), publishedUrl: r.url });
      buttonEl.textContent = "Published";
      window.open(r.url, "_blank");
      return;
    }
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
  const label = buttonEl.querySelector(".btn-label") || buttonEl;
  label.textContent = "Copied!";
  setTimeout(() => (label.textContent = "Copy"), 1500);
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
