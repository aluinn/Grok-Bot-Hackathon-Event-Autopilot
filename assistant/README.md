# Autopilot assistant

A small chat assistant that floats in the bottom-left corner of the approval dashboard. The lead can ask it to tweak a post, write a reminder, or say what is still to approve.

**It only suggests. It never changes, approves or sends anything by itself.** It shows a proposed new text, and only when the lead clicks **Apply** does it announce the change to the page. The page then decides what to do, and the lead still has to approve the new text. This follows rule 2 in `CLAUDE.md` (nothing goes out without the lead clicking Approve). The panel says so at the bottom: "Nothing changes until you click Apply".

Right now the answers are **demo answers** made by simple rules, not by Grok (the panel shows a small "demo" tag to make that clear). Plugging in the real Grok is a small job for Tiago; see [Where the Grok call goes](#where-the-grok-call-goes).

| File             | What it is                                                              |
|------------------|-------------------------------------------------------------------------|
| `assistant.js`   | The widget. No frameworks, no build step.                                |
| `assistant.css`  | Its styles                                                              |
| `test.html`      | A demo page with fake event and promo data. **Double-click it to try the widget.** |
| `README.md`      | This guide                                                              |

## Try it now

Open `assistant/test.html` in a browser (just double-click it). Click the round button at the bottom left, try each quick reply, and press **Apply** on a suggestion: the matching fake card on the page changes. The three buttons at the bottom of the page let you try plugging in a different assistant.

## Add it to the dashboard: two lines

**This is already done for the dashboard's review page** (`promo-and-approval-ui/dashboard/`): the two lines are in `index.html`, the `assistant/` folder is shared in `server.js`, and the data and the Apply listener are in `app.js` (all three are described below, so you can see what was added or copy it to another page).

Put these two lines just before `</body>` in `promo-and-approval-ui/dashboard/index.html`:

```html
<link rel="stylesheet" href="/assistant/assistant.css">
<script src="/assistant/assistant.js"></script>
```

That is all the widget needs. Two things make it actually useful inside the dashboard:

**1. The dashboard's server must share the `assistant/` folder.** It already shares `/templates/`, `/shared/` and `/output/`, but not this folder yet. In `promo-and-approval-ui/dashboard/server.js`, add a folder path next to the other ones, and one line next to the `/templates/` line:

```js
const ASSISTANT_DIR = path.join(__dirname, "..", "..", "assistant");          // with the other folder paths
```
```js
if (url.startsWith("/assistant/")) return sendFile(res, ASSISTANT_DIR, url.slice("/assistant/".length));   // next to the /templates/ line
```

**2. The dashboard must tell the widget what it knows, and listen for Apply.** The widget reads three values from the page (see [What it reads](#what-it-reads)), but the dashboard keeps its data in private variables. Add this at the end of `promo-and-approval-ui/dashboard/app.js`. It was tested against the real dashboard:

```js
// Let the assistant READ the page's data (read-only: it can't change anything through these)
window.EVENT = event;
Object.defineProperty(window, "PROMO", { configurable: true, get: () => ({
  page_copy: current(findItem("page_copy")).text,
  newsletter: current(findItem("newsletter")),
  posts: { linkedin: current(findItem("linkedin")).text, whatsapp: current(findItem("whatsapp")).text, discord: current(findItem("discord")).text },
}) });
Object.defineProperty(window, "APPROVED", { configurable: true, get: () => getItems().filter((i) => state[i.id]?.approved).map((i) => i.id) });

// When the user clicks "Apply" in the assistant, put the new text in that card.
// The text must be approved again, so setState clears the approval.
document.addEventListener("autopilot:apply", (e) => {
  const item = findItem(e.detail.target);
  if (!item || item.isImages) return;
  if (editing === item.id) editing = null; // if the lead was mid-edit on this card, close the editor
  if (item.id === "newsletter") setState(item.id, { body: e.detail.newText, approved: false });
  else setState(item.id, { text: e.detail.newText, approved: false });
  drawCard(item);
  updateProgress();
});
```

(`window.EVENT = event;` has to run after the dashboard has loaded `event`, so put it inside `start()` after the data is fetched; the rest can go anywhere. If you skip step 2 the widget still works, but it can't see the posts or the approvals; it says so honestly instead of guessing.)

The widget draws itself inside a sealed container (a "shadow root"), so the dashboard's own button and text-box styles can't break it, and it can't change anything on the page. It was checked inside the real dashboard.

## What it reads

The widget looks for these three values on the page each time you send a message, so they are always up to date:

| Value            | What it is                                                                 | Same shape as     |
|------------------|----------------------------------------------------------------------------|-------------------|
| `window.EVENT`   | The event                                                                  | `data/event.json` |
| `window.PROMO`   | The promo texts: `page_copy`, `newsletter: { subject, body }`, `posts: { linkedin, whatsapp, discord }` | `data/promo.json` |
| `window.APPROVED`| The ids of the items the lead has approved, e.g. `["linkedin", "page_copy"]` (an object like `{ linkedin: true }` also works) | (none)            |

The item ids are the dashboard's own: `page_copy`, `newsletter`, `linkedin`, `whatsapp`, `discord`, `images`.

Anything missing is fine. If `APPROVED` isn't shared, "What's still to approve?" says it can't see the approval status; if `PROMO` isn't shared, "make it shorter" says it can't see that post yet.

All of this is bundled as the **context** passed to the assistant: `{ event, promo, approved, history }`, where `approved` is a list (or `null` if the page doesn't share it) and `history` is the last few messages.

## What it can do now (the demo assistant)

| Ask                                              | What happens                                                              |
|--------------------------------------------------|---------------------------------------------------------------------------|
| "Make the LinkedIn post shorter" (or WhatsApp, Discord, event page, newsletter) | Proposes a version under 200 characters, keeping whole sentences. If the post is already short it says so (or trims the last sentence). |
| "Make the tone more casual"                      | Proposes an example casual version written from the event's details       |
| "Write a reminder post"                          | Proposes a reminder (for the WhatsApp post unless you name another)       |
| "What's still to approve?"                       | Lists the items that are not in `APPROVED`. Makes no change.               |
| Anything else                                    | A friendly message listing what it can do                                 |

These are rules, not AI, and the wording is just an example. The real assistant replaces all of this.

## The `autopilot:apply` event

When the lead clicks **Apply** on a proposal, the widget does exactly one thing: it fires a browser event on the page called `autopilot:apply`:

```js
document.addEventListener("autopilot:apply", (e) => {
  e.detail.target;   // which item: "linkedin", "whatsapp", "discord", "page_copy" or "newsletter"
  e.detail.newText;  // the text to put there (for "newsletter" this is the body)
});
```

- `detail` is exactly `{ target, newText }`.
- The widget does **not** change any card, approve anything or send anything. The page decides what to do (the snippet above puts the text in the card and clears its approval, so the lead has to approve it again).
- **Dismiss** fires nothing.
- It fires on `document` and bubbles up, so listening on either `document` or `window` works.

## Where the Grok call goes

The demo answers come from one function, `mockAsk`, near the top of `assistant.js`, marked with a "TODO for Tiago" comment. **You do not need to edit that file.** Plug in the real assistant from your own code with one call:

```js
AutopilotAssistant.setHandler(async (message, context) => {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context }),   // context = { event, promo, approved, history }
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;                                    // { reply: "...", action?: { type, target, newText } }
});
```

The function you give `setHandler` receives `(message, context)` and must return a Promise of:

```js
{
  reply: "Here's a shorter version...",            // required: what the assistant says
  action: {                                        // optional: a proposed change
    type: "update_text",                           //   currently the only type
    target: "linkedin",                            //   one of the item ids above
    newText: "The proposed new text",
  }
}
```

If you leave `action` out, nothing is proposed (the reply is just shown). If the function fails or returns nonsense, the widget shows "Sorry, I didn't get an answer to that. Nothing was changed." and carries on. Calling `setHandler()` with nothing puts the demo assistant back (and its "demo" tag).

**The Grok call itself belongs on the server, not in the browser.** `/api/assistant` is a new route in the dashboard's `server.js` that calls Grok with the key from `.env` (the same way the regenerate route does). **Never put an API key in `assistant.js` or any file the browser loads.** Rule 2 applies on the server too: that route may only *return suggestions*. It must never send, post or approve anything.

You can also call it yourself: `AutopilotAssistant.ask("make it shorter", context)` returns the same `{ reply, action? }` Promise.

## How it looks and behaves

- **Closed:** a 52px round button, 24px from the bottom-left corner, with an accent spark icon and glow. It pulses once shortly after the page loads. Hovering shows "Ask Autopilot".
- **Open:** a 360px panel (at most 70% of the screen height; on phones, the full width minus 32px) that slides and fades in. The header says "Autopilot assistant" with a green "online" dot and a close button. Your messages are orange with black text; the assistant's are dark grey. Three bouncing dots show while it thinks. Four quick-reply chips sit under the first message. New messages scroll into view.
- **Keyboard:** **Enter** sends, **Shift+Enter** makes a new line, **Esc** closes the panel (and focus returns to the round button). Everything you can tab to gets an accent-orange focus ring.
- **Reduced motion:** if the computer is set to reduce motion, there is no pulsing, sliding or bouncing.
- **Safe text:** everything is shown as plain text. A `<script>` or `<img onerror=...>` in a message, a reply or a proposal can't run or change the layout.
- **Memory:** the conversation lasts for the page session only. Reloading the page starts fresh. Nothing is saved anywhere.
- **Limits:** the message box takes up to 4,000 characters. Long words and links wrap.
- **No network for answers:** the demo assistant makes no network calls to get its answers (it only loads its own stylesheet, and the fonts if the page doesn't already). Nothing it does ever leaves the browser.

To change colours or sizes, edit `assistant.css` (the colours are variables at the top, such as `--ap-accent`).

## Fonts

It uses Geist for text and Geist Mono for small labels, like the dashboard. Web fonts have to be loaded by the page itself, so if the page doesn't already load them, the widget adds one tag to the page's `<head>` for them. The dashboard already loads them, so nothing is added there. Without them it falls back to the computer's normal font.

## What has and hasn't been tested

Tested in Chrome, on desktop and at phone width, on the demo page and inside the real dashboard:

- Every quick reply, Apply and Dismiss.
- Enter, Shift+Enter and Esc.
- Messages of 3,000 and 700 words, opening and closing about 40 times quickly, and reloading.
- Hostile text.
- Custom assistants that succeed, fail and return junk.
- The reduced-motion setting.
- Reading the dashboard's real data, and applying a proposal to the LinkedIn card and to the newsletter (the edit survives a refresh).

**Not tested:** other browsers (Safari, Firefox) and screen readers. The widget uses standard accessibility labels, but it hasn't been checked with a real screen reader.
