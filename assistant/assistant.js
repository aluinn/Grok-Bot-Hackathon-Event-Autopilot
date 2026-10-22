// Autopilot assistant: a small floating chat widget for the approval dashboard.
// No frameworks and no build step. Add it with two lines (see assistant/README.md).
//
// SAFETY: this widget only PROPOSES changes. It never changes, approves or sends anything itself.
// When you click "Apply" on a proposal it only announces the change (a browser event called "autopilot:apply");
// the dashboard decides what to do with it, and the lead still has to approve it (CLAUDE.md, rule 2).

(function () {
  "use strict";
  if (window.AutopilotAssistant && window.AutopilotAssistant.__loaded) return; // already added once

  // Where this script was loaded from, so the stylesheet can be found next to it
  const SCRIPT_SRC = document.currentScript && document.currentScript.src;

  // ---------- The items the assistant knows about (the same ids the dashboard uses) ----------
  const ITEMS = [
    { id: "page_copy", label: "Event page copy", words: /event page|page copy|\bpage\b/, text: (p) => p.page_copy },
    { id: "newsletter", label: "Newsletter", words: /newsletter|e-?mail/, text: (p) => p.newsletter && p.newsletter.body },
    { id: "linkedin", label: "LinkedIn post", words: /linkedin/, text: (p) => p.posts && p.posts.linkedin },
    { id: "whatsapp", label: "WhatsApp post", words: /whatsapp/, text: (p) => p.posts && p.posts.whatsapp },
    { id: "discord", label: "Discord post", words: /discord/, text: (p) => p.posts && p.posts.discord },
    { id: "images", label: "Promo images", words: /image|poster|visual/, text: () => null }, // pictures can't be rewritten as text
  ];
  const labelFor = (id) => (ITEMS.find((i) => i.id === id) || { label: id }).label;

  const QUICK_REPLIES = ["Make the LinkedIn post shorter", "Make the tone more casual", "Write a reminder post", "What's still to approve?"];

  // ---------- Reading what the page knows ----------
  const history = []; // this page session only: it is forgotten when the page is reloaded

  // The event, the promo texts and which items are approved, read from the page's globals when they exist.
  //   window.EVENT    like data/event.json
  //   window.PROMO    like data/promo.json
  //   window.APPROVED a list of item ids, e.g. ["linkedin", "page_copy"] (or an object like { linkedin: true })
  // "approved" is null when the page hasn't shared it, and [] when nothing is approved yet.
  function readContext() {
    const raw = window.APPROVED;
    let approved = null;
    if (Array.isArray(raw)) approved = raw.map(String);
    else if (raw && typeof raw === "object") approved = Object.keys(raw).filter((k) => raw[k]);
    return {
      event: window.EVENT || null,
      promo: window.PROMO || null,
      approved,
      history: history.slice(-10), // the last few messages, in case the real assistant wants them
    };
  }

  // ---------- The default (mock) assistant ----------
  // TODO for Tiago: replace with a fetch call to our server, which calls Grok. Never put API keys in this file.
  // Don't edit this file to do it: call  window.AutopilotAssistant.setHandler(yourFunction)  instead (see README.md).
  // The function receives (message, context) and must return a Promise of { reply, action? }, where
  // action is { type: "update_text", target: "linkedin", newText: "..." }.
  async function mockAsk(message, context) {
    await new Promise((done) => setTimeout(done, 700 + Math.random() * 500)); // a short "thinking" pause
    const text = String(message).toLowerCase();
    const promo = context.promo || {};
    const event = context.event || {};

    // "What's still to approve?"
    if (/still|left|remaining|to approve|not approved|status/.test(text) && /approv|left|remaining|status/.test(text)) {
      if (context.approved === null) {
        return { reply: "I can't see which items are approved yet, because this page hasn't shared that with me. Here is everything that needs your OK before anything goes out:\n" + ITEMS.map((i) => "• " + i.label).join("\n") };
      }
      const waiting = ITEMS.filter((i) => !context.approved.includes(i.id));
      if (!waiting.length) return { reply: "Everything is approved. Nothing has been sent by me; you decide when each item goes out." };
      return { reply: `${waiting.length} of ${ITEMS.length} still need your approval:\n` + waiting.map((i) => "• " + i.label).join("\n") };
    }

    // "Make the LinkedIn post shorter"
    if (/short|trim|cut|brief|condens/.test(text)) {
      const target = pickTarget(text, "linkedin");
      const original = textOf(target, promo);
      if (!original) return { reply: `I can't see the ${labelFor(target)} yet. Once the copy is written I can shorten it.` };
      const result = shorten(original);
      if (!result.changed) return { reply: `The ${labelFor(target)} is already short (${original.length} characters), so I'd leave it as it is.` };
      return {
        reply: `Here's a shorter ${labelFor(target)}: ${result.text.length} characters instead of ${original.length}. Have a look, then click Apply if you like it.`,
        action: { type: "update_text", target, newText: result.text },
      };
    }

    // "Make the tone more casual"
    if (/casual|friendly|relaxed|informal|chill|tone/.test(text)) {
      const target = pickTarget(text, "linkedin");
      return {
        reply: `Here's a more casual ${labelFor(target)} (an example written from the event details). Check it, then click Apply if you like it.`,
        action: { type: "update_text", target, newText: casualText(target, event) },
      };
    }

    // "Write a reminder post"
    if (/remind/.test(text)) {
      const target = pickTarget(text, "whatsapp");
      return {
        reply: `Here's a reminder you could use for the ${labelFor(target)}. Check it, then click Apply if you like it.`,
        action: { type: "update_text", target, newText: reminderText(event) },
      };
    }

    // Anything else
    return {
      reply: "I can help with a few things:\n• make a post shorter\n• make the tone more casual\n• write a reminder post\n• tell you what's still to approve\nTry one of those, or ask in your own words.",
    };
  }

  // ---------- Helpers for the mock ----------
  function pickTarget(text, fallback) {
    const hit = ITEMS.find((i) => i.id !== "images" && i.words.test(text));
    return hit ? hit.id : fallback;
  }

  function textOf(id, promo) {
    const item = ITEMS.find((i) => i.id === id);
    const value = item && promo ? item.text(promo) : null;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  // Shorten to under 200 characters by keeping whole sentences. If it already fits, drop the last sentence instead.
  function shorten(text) {
    const LIMIT = 195;
    const clean = text.replace(/\s+/g, " ").trim();
    const sentences = clean.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [clean];
    let kept = "";
    for (const sentence of sentences) {
      if ((kept + sentence).trim().length > LIMIT) break;
      kept += sentence;
    }
    kept = kept.trim();
    if (!kept) { // even the first sentence is too long: cut it at a word boundary
      kept = clean.slice(0, LIMIT - 1).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + "…";
    }
    if (clean.length < 200) { // already short enough: trim a little further, if there is a sentence to drop
      if (sentences.length < 2) return { changed: false, text: clean };
      kept = sentences.slice(0, -1).join("").trim();
    }
    return { changed: kept !== clean, text: kept };
  }

  function shortDate(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
    if (!m) return String(date || "");
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] + " " + +m[3] + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1];
  }

  // "Thu 12 Nov at 18:30 at Tech Hub" pieces, using only what the event actually has
  function whenWhere(event) {
    const when = [shortDate(event.date), event.time].filter(Boolean).join(" at ");
    return { name: event.name || "our event", when, venue: event.venue || "", going: Number(event.guest_count) >= 1 ? event.guest_count : 0 };
  }

  function casualText(target, event) {
    const e = whenWhere(event);
    const where = e.venue ? ` at ${e.venue}` : "";
    const when = e.when ? ` on ${e.when}` : "";
    const crowd = e.going ? ` ${e.going} of us are already in.` : "";
    if (target === "whatsapp") return `Hey! ${e.name} is${when}${where}.${crowd} Who's coming? Bring a friend!`;
    if (target === "discord") return `Hey all! ${e.name} is${when}${where}.${crowd} Drop a reply if you're joining!`;
    if (target === "newsletter") return `Hey there,\n\n${e.name} is${when}${where}.${crowd}\n\nCome along, say hi and bring a friend.\n\nSee you there!`;
    return `Hey everyone! ${e.name} is${when}${where}.${crowd} Come hang out, share what you're working on and bring a friend!`;
  }

  function reminderText(event) {
    const e = whenWhere(event);
    const where = e.venue ? ` at ${e.venue}` : "";
    const when = e.when ? ` ${e.when}` : "";
    return `Reminder: ${e.name} is coming up${when ? " on" + when : ""}${where}.${e.going ? ` ${e.going} people are going.` : ""} See you there!`;
  }

  // ---------- The public API ----------
  let handler = mockAsk;

  const api = {
    __loaded: true,
    // Ask the assistant. Resolves to { reply, action? }. (The chat panel uses this too.)
    ask(message, context) {
      return Promise.resolve().then(() => handler(String(message == null ? "" : message), context || readContext()));
    },
    // Plug in the real assistant (for example a fetch call to our server) without editing this file.
    // Calling setHandler() with nothing puts the demo assistant back.
    setHandler(fn) {
      if (fn == null) fn = mockAsk;
      if (typeof fn !== "function") throw new TypeError("setHandler needs a function(message, context) that returns a Promise.");
      handler = fn;
      refreshDemoLabel();
    },
    getContext: readContext,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => !!root && root.dataset.state === "open",
  };
  window.AutopilotAssistant = api;

  // ---------- The widget ----------
  let host, shadow, root, panel, launcher, log, input, sendButton, demoLabel;
  let busy = false;

  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2z"/><path d="M19 3.5v3M17.5 5h3"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

  // Make an element with optional class and text (text is always placed as plain text, never as HTML)
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // The widget lives inside a "shadow root": a sealed box. The page's own styles can't reach in and break it,
  // and the widget's styles can't leak out and change the page.
  function build() {
    host = el("div");
    host.id = "autopilot-assistant";
    shadow = host.attachShadow({ mode: "open" });

    // The stylesheet: use the page's <link> for assistant.css if there is one, otherwise look next to this script
    const pageLink = document.querySelector('link[rel="stylesheet"][href*="assistant.css"]');
    const css = el("link");
    css.rel = "stylesheet";
    css.href = pageLink ? pageLink.href : SCRIPT_SRC ? new URL("assistant.css", SCRIPT_SRC).href : "assistant.css";
    host.style.visibility = "hidden"; // hidden until the styles have loaded, so it never flashes unstyled
    const reveal = () => { host.style.visibility = ""; };
    css.addEventListener("load", reveal);
    css.addEventListener("error", reveal);
    shadow.appendChild(css);

    // Web fonts must be loaded by the page itself (fonts can't be loaded from inside a shadow root)
    if (!document.querySelector('link[href*="fonts.googleapis.com"][href*="Geist"]')) {
      const fonts = el("link");
      fonts.rel = "stylesheet";
      fonts.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap";
      document.head.appendChild(fonts);
    }

    root = el("div", "ap-assistant");
    root.dataset.state = "closed";

    // Closed: the round button, with its tooltip
    launcher = el("button", "ap-launcher");
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Ask Autopilot");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-controls", "ap-panel");
    launcher.innerHTML = SPARK + '<span class="ap-tip" aria-hidden="true">Ask Autopilot</span>';
    launcher.addEventListener("click", () => setOpen(root.dataset.state !== "open"));

    // Open: the chat panel
    panel = el("div", "ap-panel");
    panel.id = "ap-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Autopilot assistant");
    panel.setAttribute("aria-hidden", "true");

    const head = el("div", "ap-head");
    const badge = el("span", "ap-badge");
    badge.innerHTML = SPARK;
    const titles = el("div", "ap-titles");
    const title = el("div", "ap-title");
    title.append("Autopilot assistant");
    demoLabel = el("span", "ap-demo", "demo");
    demoLabel.title = "Demo answers: the real assistant isn't connected yet";
    title.append(demoLabel);
    const status = el("div", "ap-status");
    status.append(el("i", "ap-dot"), "online");
    titles.append(title, status);
    const close = el("button", "ap-icon-btn");
    close.type = "button";
    close.setAttribute("aria-label", "Close assistant");
    close.innerHTML = CLOSE;
    close.addEventListener("click", () => setOpen(false));
    head.append(badge, titles, close);

    log = el("div", "ap-log");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");

    const form = el("form", "ap-form");
    input = el("textarea", "ap-input");
    input.rows = 1;
    input.maxLength = 4000;
    input.placeholder = "Ask Autopilot…";
    input.setAttribute("aria-label", "Message to Autopilot");
    sendButton = el("button", "ap-send");
    sendButton.type = "submit";
    sendButton.setAttribute("aria-label", "Send");
    sendButton.innerHTML = SEND;
    form.append(input, sendButton);
    form.addEventListener("submit", (e) => { e.preventDefault(); submit(input.value); });
    // Enter sends, Shift+Enter makes a new line
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(input.value); }
    });
    input.addEventListener("input", autosize);

    const foot = el("div", "ap-foot", "Nothing changes until you click Apply");

    panel.append(head, log, form, foot);
    root.append(panel, launcher);
    shadow.appendChild(root);
    document.body.appendChild(host);

    // Esc closes the panel
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && api.isOpen()) setOpen(false); });

    greet();
    refreshDemoLabel();
  }

  // Only the default (mock) assistant gets the small "demo" tag, so nobody mistakes example text for the real thing
  function refreshDemoLabel() {
    if (demoLabel) demoLabel.hidden = handler !== mockAsk;
  }

  function setOpen(open) {
    if (!root) return;
    root.dataset.state = open ? "open" : "closed";
    panel.setAttribute("aria-hidden", String(!open));
    launcher.setAttribute("aria-expanded", String(open));
    if (open) { input.focus({ preventScroll: true }); scrollToEnd(); }
    else if (shadow.activeElement && panel.contains(shadow.activeElement)) launcher.focus({ preventScroll: true });
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  function scrollToEnd() {
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }

  function addMessage(role, text) {
    const row = el("div", "ap-msg ap-" + role);
    row.append(el("div", "ap-bubble", text));
    log.appendChild(row);
    scrollToEnd();
    return row;
  }

  function greet() {
    const row = addMessage("bot", "Hi! I'm Autopilot. I can tweak your posts, write a reminder, or tell you what's still to approve. I only suggest changes; you decide.");
    const chips = el("div", "ap-chips");
    QUICK_REPLIES.forEach((text) => {
      const chip = el("button", "ap-chip", text);
      chip.type = "button";
      chip.addEventListener("click", () => submit(text));
      chips.appendChild(chip);
    });
    row.appendChild(chips);
  }

  function showTyping() {
    const row = el("div", "ap-msg ap-bot ap-typing-row");
    const bubble = el("div", "ap-bubble ap-typing");
    bubble.setAttribute("aria-label", "Autopilot is typing");
    bubble.append(el("i"), el("i"), el("i"));
    row.append(bubble);
    log.appendChild(row);
    scrollToEnd();
    return row;
  }

  // Turn whatever the assistant sent back into something safe to show
  function normalise(result) {
    if (typeof result === "string") result = { reply: result };
    if (!result || typeof result.reply !== "string" || !result.reply.trim()) {
      return { reply: "Sorry, I didn't get an answer to that. Nothing was changed." };
    }
    const a = result.action;
    const action = a && typeof a.target === "string" && typeof a.newText === "string" && a.newText.trim()
      ? { type: typeof a.type === "string" ? a.type : "update_text", target: a.target, newText: a.newText }
      : null;
    return { reply: result.reply, action };
  }

  async function submit(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true;
    sendButton.disabled = true;
    const context = readContext(); // before this message is added, so "history" is the earlier conversation
    addMessage("user", text);
    history.push({ role: "user", text });
    input.value = "";
    autosize();

    const typing = showTyping();
    let result;
    try {
      result = await api.ask(text, context);
    } catch (err) {
      result = null; // shown as a gentle error below
    }
    typing.remove();
    result = normalise(result || {});
    addMessage("bot", result.reply);
    history.push({ role: "assistant", text: result.reply });
    if (result.action) addActionCard(result.action);

    busy = false;
    sendButton.disabled = false;
    if (api.isOpen()) input.focus({ preventScroll: true });
  }

  // The proposal card: the new text with Apply and Dismiss. Nothing happens until the user clicks one.
  function addActionCard(action) {
    const card = el("div", "ap-card");
    card.append(el("div", "ap-card-label", "Proposed change · " + labelFor(action.target)));
    card.append(el("div", "ap-card-text", action.newText));

    const buttons = el("div", "ap-card-buttons");
    const apply = el("button", "ap-apply", "Apply");
    apply.type = "button";
    const dismiss = el("button", "ap-dismiss", "Dismiss");
    dismiss.type = "button";
    buttons.append(apply, dismiss);
    card.append(buttons);

    const finish = (message) => { buttons.remove(); card.append(el("div", "ap-card-done", message)); scrollToEnd(); };
    apply.addEventListener("click", () => {
      // Only announces the change. The dashboard decides what to do; nothing is approved or sent from here.
      document.dispatchEvent(new CustomEvent("autopilot:apply", { detail: { target: action.target, newText: action.newText }, bubbles: true }));
      finish("Applied to " + labelFor(action.target) + ". Check it, then approve it when you're happy.");
    });
    dismiss.addEventListener("click", () => finish("Dismissed. Nothing was changed."));

    const row = el("div", "ap-msg ap-bot ap-card-row");
    row.append(card);
    log.appendChild(row);
    scrollToEnd();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
