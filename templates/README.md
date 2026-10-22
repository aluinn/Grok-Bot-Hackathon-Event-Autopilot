# Templates

Three picture templates, one design in three sizes. Each is a single, self-contained HTML file (all styling and code inside it).

| File          | Size (pixels) | Use                         |
|---------------|---------------|-----------------------------|
| `poster.html` | 1200 x 630    | Wide: link previews, banners |
| `square.html` | 1080 x 1080   | Square: feed posts           |
| `story.html`  | 1080 x 1920   | Tall: stories                |

Brand colours and fonts come from `brand/brand.md`. Each template includes the Event Autopilot logo.

There are also two **weekly digest** templates ("This week's events"): an email-style page and a WhatsApp group message. They are described in [Weekly digest](#weekly-digest-this-weeks-events) below.

And a **branded email newsletter** for a single event (built from the newsletter text in `promo.json`): see [NEWSLETTER-README.md](NEWSLETTER-README.md).

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

## Weekly digest ("This week's events")

Two templates that turn a **list of events** into one weekly roundup.

| File                          | What it makes                                                     |
|-------------------------------|-------------------------------------------------------------------|
| `digest-newsletter.html`      | An email-style page: branded header, intro line, one row per event, footer |
| `digest-group-message.txt`    | The WhatsApp group version: plain text with `*bold*` titles       |

### The data shape

An **array of event objects**, each exactly the same shape as `data/event.json` (`name`, `date`, `time`, `venue`, `description`, `hosts[]`, `guest_count`). There is a realistic example of 4 events in `data/digest-sample.json`.

```json
[
  { "name": "Design Systems Drop-in", "date": "2026-10-28", "time": "18:00",
    "venue": "Southbank Studio, London", "description": "...", "hosts": ["Marta Kowalska"], "guest_count": 21 },
  { "...": "one object per event, any order" }
]
```

These are the fields the digest shows:

| Field         | What the digest shows                                    | If it's missing                      |
|---------------|----------------------------------------------------------|--------------------------------------|
| `name`        | The event title                                          | Shows "Upcoming event"               |
| `date`        | The date badge ("OCT 26") and the weekday ("Monday")     | Badge shows "TBC"; the event goes last |
| `time`        | After the weekday: "Monday · 08:30"                      | Time is left out                     |
| `venue`       | The venue line                                           | Line is left out                     |
| `guest_count` | An orange "84 going" pill                                | Pill is left out (also left out when it is 0) |
| `hosts`, `description` | Not shown (kept so the same objects work everywhere) | n/a                                  |

Rules both templates follow:

- **Works with any number of events; tested with 0, 1, 4 and 8.** The rows simply stack. An empty array shows "There are no events on this week yet."
- **Soonest first.** The template sorts by `date`, then `time`, so you can pass the events in any order.
- **The date range is worked out for you:** "26–31 Oct" or "29 Oct – 3 Nov" (or "29 Oct" for a single day).
- **Long names wrap** onto more lines; nothing is cut off, and it fits phone screens.
- **Text is plain text.** Characters like `<` or `&` in an event name are safe.

### `digest-newsletter.html`: how it gets its data

1. If the page has a `window.EVENTS` value (the array), it uses that.
2. Otherwise it loads `../data/digest-sample.json` (so open it from a web address, see Previewing below).

For Tiago's renderer, the same idea as the pictures: inject the array **before the page loads**, then wait for the ready signal:

```js
await page.setViewport({ width: 720, height: 900 });
await page.evaluateOnNewDocument((events) => { window.EVENTS = events; }, eventsArray);
await page.goto("file:///full/path/to/templates/digest-newsletter.html", { waitUntil: "networkidle0" });
await page.waitForSelector("body[data-ready]");                 // fonts loaded, rows built
await page.screenshot({ path: "digest.png", fullPage: true });  // the whole newsletter as one tall image
const html = await page.content();                              // or: the finished page as HTML text
```

- Alternative: load the page first, then call `await page.evaluate((e) => window.renderDigest(e), eventsArray)` and wait for `body[data-ready]` again.
- The page has no fixed height: it grows with the number of events, so use `fullPage: true`.
- **If you paste the HTML into an email tool, test it first.** The page uses a `<style>` block and web fonts, which some email apps strip or ignore. The safest route is to send the screenshot as an image, or check the email tool's preview before sending.

### `digest-group-message.txt`: the WhatsApp text

It is a standard [Mustache](https://mustache.github.io/) template (the `{{...}}` placeholders). Fill it with a **view** built from the events array:

| View field   | What it is                                                         | Example                      |
|--------------|--------------------------------------------------------------------|------------------------------|
| `date_range` | Earliest to latest date                                            | `26-31 Oct`                  |
| `intro`      | One line: "4 events this week. Here's the lineup:" (for 1 event: "1 event this week. Here's the one to put in your calendar.") | |
| `events`     | List, soonest first, each with the fields below                    |                              |
| `number`     | 1, 2, 3 ... (so people can reply with a number if you want)         | `1`                          |
| `name`       | Event title                                                        | `Design Systems Drop-in`     |
| `when`       | Weekday, day, month, then time, joined with " · "                  | `Wed 28 Oct · 18:00`         |
| `venue`      | Venue, or `""` if there isn't one                                  | `Southbank Studio, London`   |
| `going`      | `"21 going"`, or `""` if the count is missing or 0                 | `21 going`                   |

Two things to know:

- Lines with an empty `venue` or `going` disappear completely (no blank lines), because the template wraps them in `{{#venue}}...{{/venue}}`.
- The template uses triple braces (`{{{name}}}`) so an `&` stays an `&`. With the `mustache` package that just works; if you use another library, turn HTML-escaping off.

Example, for the 4 events in `data/digest-sample.json` (this is real output from the template):

```
*This week's events* (26-31 Oct)

4 events this week. Here's the lineup:

*1. Founders & Friends Breakfast*
Mon 26 Oct · 08:30
Spitalfields Workspace, London
32 going

*2. Design Systems Drop-in*
Wed 28 Oct · 18:00
Southbank Studio, London
21 going

*3. London Builders Night: Ship It in One Evening*
Thu 29 Oct · 18:30
Tech Hub Shoreditch, London
84 going

*4. Saturday Run & Coffee*
Sat 31 Oct · 09:00
Regent's Park, Hanover Gate, London
17 going

Reply here if you're coming, and bring a friend.
```

As with every message in this project, **nothing is posted by these templates.** They only produce text and pictures; sending still needs the lead's Approve.

## Previewing in your browser

Browsers block pages from reading files straight off your disk, so run a tiny local server from the **project's main folder**:

```
python3 -m http.server 8000
```

(That starts a small web server on your computer. Stop it any time with Ctrl+C.) Then open:

- http://localhost:8000/templates/poster.html
- http://localhost:8000/templates/square.html
- http://localhost:8000/templates/story.html
- http://localhost:8000/templates/digest-newsletter.html

Edit `data/event.json` (or `data/digest-sample.json` for the digest), refresh, and the picture changes.

## For Tiago: please confirm

- [ ] Your renderer sets `window.EVENT` (or calls `renderEvent`) and waits for `body[data-ready]`.
- [ ] Your `event.json` uses exactly the field names above (`hosts` is a list, `guest_count` is a number).
- [ ] The three output sizes match the table at the top.
- [ ] For the digest: you pass an **array** of event objects (not one object) as `window.EVENTS`, and wait for `body[data-ready]`.
- [ ] For the WhatsApp digest: your view has the fields in the table above (`when`, `venue`, `going` are plain strings, empty when missing).
