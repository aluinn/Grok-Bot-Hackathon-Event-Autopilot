# Event Autopilot brand

Clean, minimal, large type. **No gradients. No shadows.** Dark background with one orange accent.

## Colours

| Name        | Hex       | Use                                          |
|-------------|-----------|----------------------------------------------|
| Background  | `#0B0B0F` | Page and image backgrounds                   |
| Cards       | `#16161D` | Panels and cards that sit on the background  |
| Accent      | `#FF5A1F` | Buttons, highlights, the logo dot, badges    |
| Text        | `#F5F5F7` | Main text and headings                       |
| Muted text  | `#9A9AA5` | Secondary text, labels, small print          |

## Fonts (all free from Google Fonts)

- **Headings:** Space Grotesk (weights 500 and 700)
- **Body text:** Geist (weights 400, 500 and 600), a sharp, modern interface font
- **Small labels:** Geist Mono (weights 400 and 500), for tiny technical labels like "PENDING REVIEW", item numbers and image sizes. Used in the website's review area only; the images don't need it.

(The body font was Inter until October 2026. It was replaced with Geist across the website, the images and the newsletter.)

Add this line to the top of any web page or template to load them:

```html
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
```

Images only use Space Grotesk and Geist, so their templates can leave out `Geist+Mono`.

Fallback if the fonts can't load: `system-ui, sans-serif`.

## Logo

`logo.svg` is a plain text wordmark: "Event Autopilot" in Space Grotesk Bold, with an orange dot at the end.

- Made for dark backgrounds (the text is light).
- Keep clear space around it equal to the height of the letter "E".
- Don't stretch it, recolour it or add effects.
- The font loads from Google Fonts when the file is opened in a browser. If you place it somewhere that blocks the internet, it falls back to a standard sans-serif.

## Rules of thumb

- Big, short headlines. One idea per image.
- Orange is for the one thing you want people to notice. Use it sparingly.
- Rounded corners are fine; borders are fine; shadows and gradients are not.
