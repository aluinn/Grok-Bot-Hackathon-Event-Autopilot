// Builds the branded email newsletter as one finished HTML string (no JavaScript inside it).
//
//   const { renderNewsletter } = require("./render-newsletter.js");
//   const html = renderNewsletter(event, promo, { posterUrl, brandName, ctaUrl });
//
// It only BUILDS the email. It never sends anything: sending needs the lead's Approve (see CLAUDE.md, rule 2).
// Everything uses tables and inline styles, because email apps ignore most modern web styling.
// Read templates/NEWSLETTER-README.md for the plain-English guide.

(function (root, factory) {
  // Works in Node (require) and in a browser page (<script src="render-newsletter.js">)
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.renderNewsletter = factory().renderNewsletter;
})(typeof self !== "undefined" ? self : this, function () {
  // Brand colours (brand/brand.md)
  const BG = "#0B0B0F";      // page background
  const CARD = "#16161D";    // the content card
  const ACCENT = "#FF5A1F";  // orange
  const TEXT = "#F5F5F7";
  const MUTED = "#9A9AA5";
  const LINE = "#26262F";    // thin dividers and borders

  // Fonts: Geist for body, Space Grotesk for headings, then fonts every email app has
  const BODY_FONT = "Geist, -apple-system, 'Segoe UI', Arial, sans-serif";
  const HEAD_FONT = "'Space Grotesk', Geist, -apple-system, 'Segoe UI', Arial, sans-serif";
  const FONTS_LINK = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap";

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // ---------- small helpers ----------

  // Make any text safe to place inside HTML, so a stray < or & can never break the layout
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Only let normal web links through (never "javascript:" or similar). Anything else becomes the fallback.
  function safeUrl(url, fallback) {
    const text = String(url == null ? "" : url).trim();
    return /^(https?:\/\/|mailto:)/i.test(text) ? text : fallback;
  }

  // "2026-11-12" becomes "Thursday, 12 November 2026" (anything that isn't a real date is shown as typed)
  function prettyDate(text) {
    const raw = String(text == null ? "" : text).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return raw;
    const y = +m[1], mo = +m[2], d = +m[3];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return raw;
    return DAYS[date.getUTCDay()] + ", " + d + " " + MONTHS[mo - 1] + " " + y;
  }

  // "A", "A & B", "A, B & C"
  function joinHosts(hosts) {
    const names = (Array.isArray(hosts) ? hosts : []).map((h) => String(h == null ? "" : h).trim()).filter(Boolean);
    return names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
  }

  // Blank lines become paragraphs; single line breaks inside a paragraph are kept
  function paragraphs(body, style) {
    const text = String(body == null ? "" : body).replace(/\r\n?/g, "\n").trim();
    if (!text) return "";
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => '<p style="' + style + '">' + esc(p).replace(/\n/g, "<br>") + "</p>")
      .join("");
  }

  // The big headline. One key word is painted in the accent colour: the one you name in options.accentWord,
  // or otherwise the longest word.
  function headline(subject, accentWord) {
    const parts = String(subject).split(/(\s+)/); // words and the spaces between them
    const wordOf = (token) => /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(token); // [all, punctuation before, word, punctuation after]

    let pick = -1;
    if (accentWord) {
      pick = parts.findIndex((t) => t.trim() && wordOf(t)[2].toLowerCase() === String(accentWord).toLowerCase());
    }
    if (pick === -1) {
      let longest = 2; // a word must be at least 3 letters to be worth highlighting
      parts.forEach((t, i) => { if (t.trim() && wordOf(t)[2].length > longest) { longest = wordOf(t)[2].length; pick = i; } });
    }

    return parts.map((token, i) => {
      if (i !== pick) return esc(token);
      const m = wordOf(token);
      return esc(m[1]) + '<span style="color:' + ACCENT + ';">' + esc(m[2]) + "</span>" + esc(m[3]);
    }).join("");
  }

  // Pick a type size that suits the text length (a finished email can't shrink text by itself)
  function sizeFor(text, steps) {
    const length = String(text).length;
    for (const [maxLength, size] of steps) if (length <= maxLength) return size;
    return steps[steps.length - 1][1];
  }

  // One labelled row in the event details card
  function detailRow(label, value, isFirst) {
    const border = isFirst ? "" : "border-top:1px solid " + LINE + ";";
    return '<tr>' +
      '<td class="t-muted bg-dark" width="96" valign="top" bgcolor="' + BG + '" style="width:96px;padding:14px 0 14px 22px;' + border + 'background-color:' + BG + ';font-family:' + BODY_FONT + ';font-size:11px;line-height:24px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:' + MUTED + ';">' + esc(label) + "</td>" +
      '<td class="t-text bg-dark" valign="top" bgcolor="' + BG + '" style="padding:14px 22px 14px 12px;' + border + 'background-color:' + BG + ';font-family:' + BODY_FONT + ';font-size:17px;line-height:24px;font-weight:500;color:' + TEXT + ';overflow-wrap:anywhere;word-break:break-word;">' + esc(value) + "</td>" +
      "</tr>";
  }

  // ---------- the newsletter ----------

  function renderNewsletter(event, promo, options) {
    event = event || {};
    options = options || {};
    const newsletter = (promo && promo.newsletter) || {};

    const name = String(event.name || "").trim() || "Upcoming event";
    const subject = String(newsletter.subject || "").trim() || "You're invited: " + name;
    const brand = String(options.brandName || "").trim() || "Event Autopilot";
    const community = String(options.communityName || options.brandName || "").trim() || "our community";
    const ctaUrl = safeUrl(options.ctaUrl || event.url, "#");
    const posterUrl = safeUrl(options.posterUrl, "");
    const unsubscribeUrl = options.unsubscribeUrl || "#";

    const date = prettyDate(event.date);
    const time = String(event.time == null ? "" : event.time).trim();
    const venue = String(event.venue == null ? "" : event.venue).trim();
    const going = Number(event.guest_count) >= 1 ? event.guest_count + " going" : "";
    const hosts = joinHosts(event.hosts);

    const bodyHtml = paragraphs(newsletter.body, "margin:0 0 18px 0;");
    const preview = String(newsletter.body || subject).replace(/\s+/g, " ").trim().slice(0, 110); // the grey line shown beside the subject in inboxes

    // --- hero: the wide poster, or a placeholder in brand colours ---
    let hero;
    if (posterUrl) {
      hero = '<tr><td bgcolor="' + BG + '" style="padding:0;background-color:' + BG + ';font-size:0;line-height:0;">' +
        '<img src="' + esc(posterUrl) + '" width="600" alt="' + esc(name) + '" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">' +
        "</td></tr>";
    } else {
      const when = [date, time].filter(Boolean).join(" · ");
      hero = '<tr><td bgcolor="' + BG + '" style="padding:0;background-color:' + BG + ';">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="8" bgcolor="' + ACCENT + '" style="width:8px;background-color:' + ACCENT + ';font-size:0;line-height:0;">&nbsp;</td>' +
        '<td class="px bg-dark" height="315" valign="middle" bgcolor="' + BG + '" style="height:315px;padding:32px 36px;background-color:' + BG + ';">' +
        '<div class="t-accent" style="font-family:' + BODY_FONT + ';font-size:13px;line-height:18px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:' + ACCENT + ';">You’re invited</div>' +
        '<div class="t-text" style="padding-top:12px;font-family:' + HEAD_FONT + ';font-size:' + sizeFor(name, [[28, 44], [55, 34], [9999, 26]]) + 'px;line-height:1.08;font-weight:700;color:' + TEXT + ';overflow-wrap:anywhere;word-break:break-word;">' + esc(name) + "</div>" +
        (when ? '<div class="t-muted" style="padding-top:14px;font-family:' + BODY_FONT + ';font-size:16px;line-height:24px;color:' + MUTED + ';">' + esc(when) + "</div>" : "") +
        (venue ? '<div class="t-muted" style="font-family:' + BODY_FONT + ';font-size:16px;line-height:24px;color:' + MUTED + ';overflow-wrap:anywhere;word-break:break-word;">' + esc(venue) + "</div>" : "") +
        "</td></tr></table></td></tr>";
    }

    // --- event details card (rows with nothing to show are left out) ---
    const rows = [];
    if (date) rows.push(["Date", date]);
    if (time) rows.push(["Time", time]);
    if (venue) rows.push(["Venue", venue]);
    if (going) rows.push(["Guests", going]);
    const details = rows.length
      ? '<tr><td class="px bg-card" bgcolor="' + CARD + '" style="padding:8px 36px 8px;background-color:' + CARD + ';">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + BG + '" style="width:100%;background-color:' + BG + ';border:1px solid ' + LINE + ';border-radius:14px;border-collapse:separate;overflow:hidden;">' +
        rows.map((r, i) => detailRow(r[0], r[1], i === 0)).join("") +
        "</table></td></tr>"
      : "";

    // --- the page ---
    return [
      "<!DOCTYPE html>",
      '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
      '<meta name="x-apple-disable-message-reformatting">',
      '<meta name="color-scheme" content="dark light">',
      '<meta name="supported-color-schemes" content="dark light">',
      "<title>" + esc(subject) + "</title>",
      '<link href="' + FONTS_LINK + '" rel="stylesheet">',
      "<!--[if mso]><style>td, th, div, p, a, span { font-family: Arial, sans-serif !important; }</style><![endif]-->",
      "<style>",
      "  body { margin: 0; padding: 0; }",
      "  a { color: " + MUTED + "; }",
      "  /* Phones: let the card use the full screen width */",
      "  @media only screen and (max-width: 620px) {",
      "    .container { width: 100% !important; }",
      "    .px { padding-left: 24px !important; padding-right: 24px !important; }",
      "    .headline { font-size: 30px !important; }",
      "  }",
      "  /* Outlook's dark mode and similar tools can recolour things. These keep our colours and keep everything readable. */",
      "  [data-ogsc] .t-text { color: " + TEXT + " !important; }",
      "  [data-ogsc] .t-muted { color: " + MUTED + " !important; }",
      "  [data-ogsc] .t-accent { color: " + ACCENT + " !important; }",
      "  [data-ogsb] .bg-page { background-color: " + BG + " !important; }",
      "  [data-ogsb] .bg-dark { background-color: " + BG + " !important; }",
      "  [data-ogsb] .bg-card { background-color: " + CARD + " !important; }",
      "</style>",
      "</head>",
      '<body class="bg-page" bgcolor="' + BG + '" style="margin:0;padding:0;background-color:' + BG + ';color:' + TEXT + ';">',
      // hidden "preview text" shown next to the subject in the inbox list
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:' + BG + ';">' + esc(preview) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>",
      '<table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + BG + '" style="width:100%;background-color:' + BG + ';">',
      '<tr><td align="center" class="bg-page" bgcolor="' + BG + '" style="padding:24px 12px;background-color:' + BG + ';">',

      // the 600px card
      '<table role="presentation" class="container bg-card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="' + CARD + '" style="width:600px;max-width:600px;background-color:' + CARD + ';">',

      // header: wordmark with the accent dot, then a thin divider
      '<tr><td class="px bg-card" bgcolor="' + CARD + '" style="padding:28px 36px 24px;background-color:' + CARD + ';">' +
        '<span class="t-text" style="font-family:' + HEAD_FONT + ';font-size:22px;line-height:26px;font-weight:700;letter-spacing:-0.3px;color:' + TEXT + ';">' + esc(brand) + "</span>" +
        '<span class="t-accent" style="font-family:' + BODY_FONT + ';font-size:13px;line-height:26px;color:' + ACCENT + ';">&nbsp;&#9679;</span>' +
        "</td></tr>",
      '<tr><td height="1" bgcolor="' + LINE + '" style="height:1px;line-height:1px;font-size:1px;background-color:' + LINE + ';">&nbsp;</td></tr>',

      hero,

      // the subject as the large headline
      '<tr><td class="px bg-card" bgcolor="' + CARD + '" style="padding:36px 36px ' + (bodyHtml ? "20px" : "28px") + ';background-color:' + CARD + ';">' +
        '<h1 class="headline t-text" style="margin:0;font-family:' + HEAD_FONT + ';font-size:' + sizeFor(subject, [[40, 38], [70, 32], [9999, 26]]) + 'px;line-height:1.12;font-weight:700;letter-spacing:-0.5px;color:' + TEXT + ';overflow-wrap:anywhere;word-break:break-word;">' + headline(subject, options.accentWord) + "</h1>" +
        "</td></tr>",

      // the body text (left out entirely when it is empty)
      bodyHtml
        ? '<tr><td class="px t-text bg-card" bgcolor="' + CARD + '" style="padding:0 36px 16px;background-color:' + CARD + ';font-family:' + BODY_FONT + ';font-size:17px;line-height:27px;mso-line-height-rule:exactly;color:' + TEXT + ';overflow-wrap:anywhere;word-break:break-word;">' + bodyHtml + "</td></tr>"
        : "",

      details,

      // the big button (padding on the link AND mso-padding-alt so Outlook draws the full-size button)
      '<tr><td align="center" class="px bg-card" bgcolor="' + CARD + '" style="padding:28px 36px ' + (hosts ? "8px" : "40px") + ';background-color:' + CARD + ';">' +
        '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>' +
        '<td align="center" bgcolor="' + ACCENT + '" style="background-color:' + ACCENT + ';border-radius:999px;">' +
        '<a href="' + esc(ctaUrl) + '" target="_blank" style="display:inline-block;padding:18px 44px;mso-padding-alt:18px 44px;font-family:' + BODY_FONT + ';font-size:18px;line-height:20px;font-weight:700;color:#000000;text-decoration:none;border-radius:999px;">Reserve your spot</a>' +
        "</td></tr></table></td></tr>",

      // hosts
      hosts
        ? '<tr><td align="center" class="px t-muted bg-card" bgcolor="' + CARD + '" style="padding:16px 36px 40px;background-color:' + CARD + ';font-family:' + BODY_FONT + ';font-size:15px;line-height:22px;color:' + MUTED + ';">Hosted by <span class="t-text" style="color:' + TEXT + ';">' + esc(hosts) + "</span></td></tr>"
        : "",

      "</table>", // end of the card

      // footer, on the page background
      '<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;"><tr>' +
        '<td align="center" class="px t-muted bg-page" bgcolor="' + BG + '" style="padding:28px 36px 8px;background-color:' + BG + ';font-family:' + BODY_FONT + ';font-size:13px;line-height:20px;color:' + MUTED + ';">' +
        "You’re receiving this because you joined " + esc(community) + '. <a href="' + esc(unsubscribeUrl) + '" style="color:' + MUTED + ';text-decoration:underline;">Unsubscribe</a>' +
        '<br><span style="display:inline-block;padding-top:10px;">Made with Event Autopilot (open source, MIT)</span>' +
        "</td></tr></table>",

      "</td></tr></table>",
      "</body>",
      "</html>",
    ].join("\n");
  }

  return { renderNewsletter };
});

// Run it directly to make a sample file:  node templates/render-newsletter.js [where to save it]
if (typeof module === "object" && typeof require === "function" && require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const event = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "event.json"), "utf8"));
  const promo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "promo.json"), "utf8"));
  const out = process.argv[2] || path.join(__dirname, "newsletter-sample.html");
  fs.writeFileSync(out, module.exports.renderNewsletter(event, promo));
  console.log("Saved " + out);
}
