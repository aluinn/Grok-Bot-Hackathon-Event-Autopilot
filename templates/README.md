# Templates

Three picture templates, one design in three sizes. Each is a single, self-contained HTML file (all styling and code inside it).

| File          | Size (pixels) | Use                         |
|---------------|---------------|-----------------------------|
| `poster.html` | 1200 x 630    | Wide: link previews, banners |
| `square.html` | 1080 x 1080   | Square: feed posts           |
| `story.html`  | 1080 x 1920   | Tall: stories                |

Brand colours and fonts come from `brand/brand.md`. Each template includes the Event Autopilot logo.

## The data contract (what the templates read)

The templates show the event in `data/event.json`. These are the fields they use:

| Field         | What it is              | What the picture shows                  | If it's missing        |
|---------------|-------------------------|-----------------------------------------|------------------------|
| `name`        | Event name (text)       | The big headline                        | Shows "Upcoming event" |
| `date`        | `YYYY-MM-DD` (text)     | "Thursday, 12 November 2026"            | Date is left out       |
| `time`        | Text, e.g. `"18:30"`    | Added after the date: "... · 18:30"     | Time is left out       |
| `venue`       | Text                    | The venue line                          | Line is left out       |
| `hosts`       | List of names           | "Hosted by A, B & C"                    | Line is left out       |
| `guest_count` | Number                  | Orange badge: "84 going"                | Badge is left out      |
| `description` | Text                    | Not shown (reserved for other uses)     | n/a                    |

Rules the templates follow:

- **Nothing breaks if a field is missing.** That line simply disappears and the layout re-centres.
- **Long text shrinks to fit.** A 90-character name, a long venue or 6+ hosts get smaller type; text is never cut off or pushed off the picture.
- **Text is shown as plain text.** Characters like `<` or `&` in a name are safe.
- A date that isn't `YYYY-MM-DD` is shown exactly as typed.

## How the templates get their data

Each template does this, in order:

1. If the page has a `window.EVENT` value, it uses that.
2. Otherwise it loads `../data/event.json` (so it must be opened from a web address, not by double-clicking the file; see Previewing below).

### For Tiago's renderer (Puppeteer)

Give the page its data **before the page loads**, then wait for the "ready" signal:

```js
await page.setViewport({ width: 1200, height: 630 });          // poster; use 1080x1080 / 1080x1920 for the others
await page.evaluateOnNewDocument((event) => { window.EVENT = event; }, eventData);
await page.goto("file:///full/path/to/templates/poster.html", { waitUntil: "networkidle0" });
await page.waitForSelector("body[data-ready]");                // text has been fitted; safe to photograph
await page.screenshot({ path: "poster.png" });
```

- `body[data-ready]` appears once the fonts are loaded and the text has been shrunk to fit. **Always wait for it** before taking the screenshot, or long names may still be at full size.
- When the data is injected with `window.EVENT`, opening the file directly with `file://` works fine.
- Alternative: load the page first, then call `await page.evaluate((e) => window.renderEvent(e), eventData)` and wait for `body[data-ready]` again.
- The fonts load from Google Fonts, so the renderer needs internet access (use `waitUntil: "networkidle0"`).

## Previewing in your browser

Browsers block pages from reading files straight off your disk, so run a tiny local server from the **project's main folder**:

```
python3 -m http.server 8000
```

(That starts a small web server on your computer. Stop it any time with Ctrl+C.) Then open:

- http://localhost:8000/templates/poster.html
- http://localhost:8000/templates/square.html
- http://localhost:8000/templates/story.html

Edit `data/event.json`, refresh, and the picture changes.

## For Tiago: please confirm

- [ ] Your renderer sets `window.EVENT` (or calls `renderEvent`) and waits for `body[data-ready]`.
- [ ] Your `event.json` uses exactly the field names above (`hosts` is a list, `guest_count` is a number).
- [ ] The three output sizes match the table at the top.
