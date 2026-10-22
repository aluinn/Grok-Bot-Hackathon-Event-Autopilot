# Post previews

Three small, standalone pages that show a post **as it will look** on each platform, so the lead can check it before approving.

| File                      | Shows                                                                    |
|---------------------------|--------------------------------------------------------------------------|
| `linkedin-preview.html`   | A feed card: author, text, event image, Like / Comment / Repost / Send  |
| `whatsapp-preview.html`   | A group chat with your post as a green message bubble (image, time, ticks) |
| `discord-preview.html`    | A dark channel with your post as a message, plus an embed card for the event |

They are **imitations in plain CSS**: no logos, no copied artwork, no trademarks, system fonts only, and flat (no shadows or gradients, in line with `brand/brand.md`). They are close to how each platform looks, not pixel-perfect copies; platforms change their designs over time.

**They only show things. Nothing in them can post, send or open a page** (there are no buttons, forms or links). Posting still needs the lead's Approve (rule 2 in `CLAUDE.md`).

## What goes in

Each page needs a post, and can show an event image.

| Value              | What it is                                                              | If you leave it out                    |
|--------------------|-------------------------------------------------------------------------|----------------------------------------|
| `window.POSTS`     | An object: `{ linkedin: "...", whatsapp: "...", discord: "..." }` (the same as `posts` in `promo.json`) | On its own in a browser tab, the page reads `../../data/promo.json` and uses its `posts`. **Inside an iframe it doesn't read any file; it waits for your message instead** (see below). |
| `window.IMAGE_URL` | The event image to show with the post (any image address)               | No image                               |

Each page uses only its own platform's text (the LinkedIn page shows `POSTS.linkedin`, and so on).

Optional extras (all have sensible defaults):

| Value                    | Used by   | Default                                                   |
|--------------------------|-----------|-----------------------------------------------------------|
| `window.EVENT`           | LinkedIn, Discord | `../../data/event.json`, or nothing if it can't be read. LinkedIn takes the author's name from `hosts[0]`; the Discord embed shows the event name, date, venue and number going. |
| `window.AUTHOR_NAME`     | LinkedIn, Discord | LinkedIn: the first host, else "Event host". Discord: "Event Autopilot". |
| `window.AUTHOR_HEADLINE` | LinkedIn  | "Community organiser"                                     |
| `window.GROUP_NAME`      | WhatsApp  | "Community group"                                         |
| `window.CHANNEL_NAME`    | Discord   | "events"                                                  |
| `window.TIME`            | WhatsApp, Discord | The current time ("18:42")                         |

## How Tiago can embed them in the UI

The simplest and safest way is an **iframe**: the preview keeps its own styling, so it can't clash with the UI, and the UI sends it the post to show. The page tells the UI how tall it needs to be, so there is no inner scrollbar.

```html
<iframe id="linkedin" src="/templates/previews/linkedin-preview.html" title="LinkedIn preview"
        style="width:100%; max-width:600px; border:0; height:300px"></iframe>

<script>
  const frame = document.getElementById("linkedin");

  // 1. When the frame has loaded, send it the post (and the image, if there is one)
  frame.addEventListener("load", () => {
    frame.contentWindow.postMessage({ type: "preview-update", post: "The text of the post", imageUrl: "https://..." }, "*");
  });

  // 2. The frame reports how tall it is; make the iframe exactly that tall
  window.addEventListener("message", (e) => {
    if (e.source === frame.contentWindow && e.data && e.data.type === "preview-height") frame.style.height = e.data.height + "px";
  });

  // 3. Later, when the lead edits the text, just send again. Anything you leave out keeps its last value.
  // frame.contentWindow.postMessage({ type: "preview-update", post: "The edited text" }, "*");
</script>
```

The same code works for the other two pages: change the `src` to `whatsapp-preview.html` or `discord-preview.html`.

### The message you can send

`frame.contentWindow.postMessage({ type: "preview-update", ... }, "*")`, with any of these:

| Field            | What it does                                                          |
|------------------|-----------------------------------------------------------------------|
| `post`           | The text to show                                                      |
| `posts`          | Or the whole `{ linkedin, whatsapp, discord }` object; the page picks its own |
| `imageUrl`       | The event image. Send `""` to remove it                                |
| `event`          | An event object (the `event.json` shape): author name (LinkedIn) and embed (Discord) |
| `authorName`, `authorHeadline`, `groupName`, `channelName`, `time` | The optional extras above |

You can also send `window.POSTS` / `window.IMAGE_URL` into the page before it loads (that's what a Puppeteer screenshot would do), or, if the UI and the preview are on the same address, call `frame.contentWindow.renderPreview({ post: "..." })` directly.

### Important when it is inside the dashboard

The dashboard's server (port 4010) shares the `/templates/` folder, so these pages load there, but it does **not** share `/data/promo.json`. That is why a preview inside an iframe never reads the data files: **always send the post** (step 1 above). Until a post arrives, the page just shows "No post written yet." A post you send, or `window.POSTS`, always wins, even if it arrives a moment after the page has loaded (this is tested).

### Other messages the page sends back

- `{ type: "preview-height", height: 523 }`, sent whenever the page's height changes (a new post, an image arriving).
- The page's `<body>` gets a `data-ready` attribute once it is drawn and its image has loaded (or failed). Wait for `body[data-ready]` before taking a screenshot.

## What happens with awkward posts

- **Long posts wrap.** Line breaks and blank lines are kept. A very long web address or one huge word breaks across lines instead of running off the edge. Tested with a 1,480-character post, a 140-letter word, a long link and emoji, down to a 360px-wide phone screen.
- **Empty posts** (nothing, spaces only, `null`, or the key missing) show a quiet "No post written yet." and never a blank card or an error.
- **A broken image address** is quietly left out, rather than showing a broken-picture icon.
- **Any text is made safe.** A `<script>` or `<img onerror=...>` in a post is shown as plain text and runs nothing.
- Platform formatting is imitated: WhatsApp shows `*bold*`, `_italic_` and `~strikethrough~`; Discord shows `**bold**`, `*italic*` and highlights `@everyone` / `@here`; LinkedIn shows `#hashtags` and web addresses in blue (and `*stars*` as plain stars, because LinkedIn doesn't format them). Web addresses look like links but aren't clickable.

## Things to know

- **LinkedIn shows the whole post.** The real feed cuts a long post after a few lines with a "see more" link; this preview shows everything so the lead can read it all.
- **The Discord embed is a preview extra.** It is built from the event's details and image. Whether the real post includes an embed depends on how the sender is set up.
- **Safe messages.** The pages accept `preview-update` messages from any page that embeds them. That is harmless here because everything they receive is shown as text and none of them can send or open anything.
- **Tested in Chrome only,** on desktop and at phone width (including embedded cross-origin from a different address).

## Previewing on your own

Browsers won't read data files straight off your disk, so run a small local server from the **project's main folder**:

```
python3 -m http.server 8000
```

Then open:

- http://localhost:8000/templates/previews/linkedin-preview.html
- http://localhost:8000/templates/previews/whatsapp-preview.html
- http://localhost:8000/templates/previews/discord-preview.html

They show the posts from `data/promo.json`. Edit that file and refresh to see a change.
