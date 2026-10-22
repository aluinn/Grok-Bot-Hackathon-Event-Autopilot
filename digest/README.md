# Weekly digest: real events from Luma

`node digest/fetch-week.js [calendar] [--days 7]` saves the next 7 days of a Luma calendar's events to `data/digest-week.json`. The dashboard's **Weekly digest** tab shows them.

- **Calendar**: a `cal-...` id, or a calendar link like `https://lu.ma/futureforward-events` (best effort: we read the page to find its id). Default: `LUMA_CALENDAR_ID` in `.env`, else `cal-wUKLVX9VWOdVkpg`.
- **How**: reads Luma's free calendar feed (no key), then each event's free Luma page data for hosts and guest count (max 12 events, 4 at a time).
- **No events this week?** It writes an empty list, and the tab falls back to the sample events in `data/digest-sample.json`.
- It only reads from Luma. Nothing is sent anywhere.
