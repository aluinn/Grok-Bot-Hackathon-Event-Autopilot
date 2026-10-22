# Event Autopilot

An open-source (MIT) tool that helps community event leads turn event details into ready-to-use promo material. Built at a hackathon in one evening, so keep everything small and simple.

## Who is using this

The project owner is **non-technical**. This shapes how you work:

- **Explain every command in one plain sentence** before running it (e.g. "This installs the libraries the project needs.").
- Avoid jargon. If you must use a technical term, define it briefly.
- **Keep the code simple.** Prefer short, readable, boring code over clever code. No unnecessary abstractions, frameworks, or dependencies. Add brief comments saying what each part does.
- When something fails, say what went wrong in plain words and what you'll try next.

## Rules (do not break these)

### 1. All data flows through two JSON files

- `event.json` — the source of truth for the event:
  - `name`, `date`, `time`, `venue`, `description`, `hosts[]`, `guest_count`
- `promo.json` — all generated promo content:
  - `page_copy`
  - `newsletter`: `{ subject, body }`
  - `posts`: `{ linkedin, whatsapp, discord }`

Every feature reads from `event.json` and/or writes to `promo.json`. Don't pass event data around any other way, and don't add fields to these files without asking.

### 2. Nothing is ever sent anywhere without the lead clicking Approve

No emails, posts, messages, or publishing of any kind happens automatically. Everything is a draft until the event lead explicitly clicks **Approve**. Never add code that sends or posts on its own, and never bypass or pre-click the Approve step.

### 3. Visuals come from HTML/CSS templates rendered with Puppeteer

Images (posters, social cards, etc.) are made by filling HTML/CSS templates with data from `event.json` and rendering them with Puppeteer. **Never use image-generation models.**

### 4. Brand

Use these in every template and page:

- Background: `#0B0B0F` (cards `#16161D`)
- Accent: `#FF5A1F`
- Text: `#F5F5F7` (muted `#9A9AA5`)
- Fonts: Space Grotesk for headings, Inter for body (Google Fonts)

Full guide, logo and rules of thumb (no gradients, no shadows): `brand/brand.md`.

## Parts of the project

- **Promo and Approval UI** — the screen where the event lead reviews everything in `promo.json` (page copy, newsletter, LinkedIn/WhatsApp/Discord posts, and the rendered visuals), edits it if needed, and clicks **Approve**. This is the only place where approval happens (see rule 2).

## Project basics

- Repo: https://github.com/aluinn/Grok-Bot-Hackathon-Event-Autopilot

- License: MIT.
- Keep the repo easy to understand for first-time contributors.
- Don't commit secrets or API keys. Put them in a `.env` file that is git-ignored.

## Plan

- Who builds what, the timeline and the demo script are in [PLAN.md](PLAN.md).
