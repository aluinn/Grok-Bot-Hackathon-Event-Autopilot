# The email newsletter

A branded newsletter email, built from `event.json` and `promo.json` (the newsletter subject and body that the copy generator wrote).

| File                      | What it is                                                                 |
|---------------------------|----------------------------------------------------------------------------|
| `render-newsletter.js`    | The builder. One function that returns the finished email as text.         |
| `newsletter.html`         | A browser preview: shows exactly what the builder makes. Not sent anywhere. |
| `newsletter-sample.html`  | A finished example (from the sample data). Open it in a browser, or send it to yourself to see it in a real inbox. |

**Nothing here sends anything.** It only builds the email. Sending still needs the lead to click Approve (rule 2 in `CLAUDE.md`).

## How to call it

```js
const { renderNewsletter } = require("./templates/render-newsletter.js");

const html = renderNewsletter(event, promo, {
  posterUrl: "https://example.com/promo-wide.png",   // optional
  brandName: "Shoreditch Makers",                     // optional
  ctaUrl: "https://lu.ma/your-event",                 // optional
});
// `html` is a ready-to-send string. Put it in a Ghost draft, save it to a file, or show it in the preview.
```

- `event` is the contents of `data/event.json`.
- `promo` is the contents of `data/promo.json` (the email uses `promo.newsletter.subject` and `promo.newsletter.body`).
- The third part (the options) is optional. Leave it out and you get sensible defaults.

To make the sample file again, run `node templates/render-newsletter.js` (it reads `data/event.json` and `data/promo.json`, and saves `templates/newsletter-sample.html`).

## The options

| Option           | What it does                                                          | If you leave it out                          |
|------------------|-----------------------------------------------------------------------|----------------------------------------------|
| `posterUrl`      | The wide poster shown across the top, full 600px width                | A placeholder block in the brand colours (event name, date and venue on a dark panel with an orange edge) |
| `brandName`      | Your community's name in the header and footer                        | "Event Autopilot" in the header; "our community" in the footer |
| `ctaUrl`         | Where the big "Reserve your spot" button goes                         | `event.url` if the event has one, otherwise `#` (goes nowhere) |
| `unsubscribeUrl` | The "Unsubscribe" link in the footer                                  | `#` (a placeholder, see below)               |
| `communityName`  | What the footer says you joined ("...because you joined X"), if different from `brandName` | `brandName`, or "our community" |
| `accentWord`     | Which word of the headline is painted orange                          | The longest word                             |

### Images must be public web addresses

**A poster in an email must be a public link (starting `https://`), not a file on your computer.** Email apps open the email on the reader's phone or laptop, which can't see a file on yours. If you pass something that isn't a normal web link (`file://...`, `data:...`, or a plain file name), the builder ignores it and shows the placeholder instead. So: render the poster with Puppeteer, upload the PNG somewhere public (for example, as an image in the Ghost draft), and pass that link as `posterUrl`.

## What it shows

| From                                   | Shown as                                                          | If it's missing                      |
|----------------------------------------|-------------------------------------------------------------------|--------------------------------------|
| `promo.newsletter.subject`             | The big headline, with one word in orange                         | "You're invited: {event name}"       |
| `promo.newsletter.body`                | The message. Blank lines become paragraphs; single line breaks are kept | The body section is left out (no empty gap) |
| `event.date`, `event.time`             | "Date" and "Time" rows in the details card                        | That row is left out                 |
| `event.venue`                          | The "Venue" row                                                   | That row is left out                 |
| `event.guest_count`                    | A "Guests" row: "84 going"                                        | Left out (also left out when it is 0) |
| `event.hosts`                          | "Hosted by Aluinn & Tiago"                                        | The line is left out                 |
| `event.name`                           | The poster placeholder and the picture's alt text                 | "Upcoming event"                     |

If every detail is missing the details card disappears completely. Nothing ever shows "undefined" or an empty box.

## Safe by default

- **Any text you pass in is made safe.** A stray `<`, `&` or even a whole `<script>` tag in an event name, venue or body is shown as plain text and can't break the layout.
- **Links are checked.** The button and the poster only accept normal `http://` or `https://` (and `mailto:` for the button) links. Anything else, such as `javascript:...`, is replaced with `#`.
- **There is no JavaScript in the finished email.** (Email apps remove it anyway.) The only JavaScript is in `newsletter.html`, the browser preview.

## How it is built, and what has and hasn't been tested

The email uses tables and inline styles only, which is the old-fashioned layout email apps understand. The button is a coloured table cell with the link inside it, with extra settings for Outlook. The card is 600px wide and stacks to fit a phone. Fonts are Geist for text and Space Grotesk for the headline (from Google Fonts), with fallbacks (`-apple-system`, `Segoe UI`, `Arial`) because many email apps ignore web fonts. The design stays dark. Every cell carries its own background and text colour, so it stays readable even if an app tries to recolour it (checked below).

**Tested in Chrome only.** In a real browser, on desktop and phone width: the sample, a 90-character event name, a missing venue, an empty body, a 1,000-word body, a poster image, a minimal event with almost no data, hostile text, and with colours inverted to imitate a "forced light mode". Colour contrast is 5.8:1 or better everywhere (the accessibility minimum for normal text is 4.5:1).

**Not tested in Gmail, Outlook or Apple Mail.** The techniques used are the standard ones for those apps, but please send `newsletter-sample.html` to yourself and look at it in each one you care about before a real send. Two things to expect: Outlook on Windows shows the details card and button with square corners, and Outlook ignores web fonts.

**Length:** Gmail cuts off ("clips") emails over about 102 KB. A 1,000-word body makes an email of about 17 KB, so ordinary newsletters are nowhere near the limit.

## The unsubscribe link

A newsletter needs a working unsubscribe link, and only the tool that actually sends it (for example Ghost) knows each reader's link. So the footer link is `#` until you pass `unsubscribeUrl`. Check the sending tool's documentation for the placeholder it expects, and pass that as `unsubscribeUrl`. It isn't altered, so it can be a tool's own placeholder.

## Previewing in a browser

`newsletter.html` shows the builder's output. It loads `data/event.json` and `data/promo.json`, so run a small local server from the **project's main folder** (browsers won't read files straight off disk):

```
python3 -m http.server 8000
```

Then open http://localhost:8000/templates/newsletter.html. (Stop the server with Ctrl+C.)

For Tiago's renderer or tests, give the page its data **before it loads**, then wait for the ready signal:

```js
await page.evaluateOnNewDocument((event, promo) => {
  window.EVENT = event;                // the same shape as data/event.json
  window.PROMO = promo;                // the same shape as data/promo.json
  window.POSTER_URL = "https://...";   // optional
  window.BRAND_NAME = "Shoreditch Makers";  // optional
}, eventData, promoData);
await page.goto("file:///full/path/to/templates/newsletter.html", { waitUntil: "networkidle0" });
await page.waitForSelector("body[data-ready]");
await page.screenshot({ path: "newsletter.png", fullPage: true });
```

When `window.EVENT` and `window.PROMO` are given, opening the file directly (`file://`) works fine. The preview also accepts `window.EVENT.url` for the button's link.
