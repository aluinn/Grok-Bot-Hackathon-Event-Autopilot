# sponsors/

Finds potential sponsors for the event in `shared/event.json` (Grok + xAI live web search) and drafts a short sponsorship email for each. Research and drafts only.

- `node sponsors/find.js [--count 20]` -> `sponsors/output/sponsors.json` + `sponsors.md` (table sorted by confidence)
- `node sponsors/draft-outreach.js` -> `sponsors/output/outreach/<sponsor>.md` (To, Subject, Body, mailto link) + `ALL.md`

Add `--sample` to either command to test offline with 5 example sponsors (no API key needed). Add `--dry-run` to print the exact Grok request without calling the API.

**Public emails only.** Only public business addresses the company itself publishes (partnerships@, events@, community@, hello@, sponsorship@) or its contact page. Never a named person's personal email.

**Nothing is ever sent.** These scripts never email anyone. The lead opens the `mailto:` link, reviews, and sends by hand (CLAUDE.md rule 2).
