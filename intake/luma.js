// Reads one event from Luma's free public API and shapes it into our event.json format.
// No API key needed. Works with a full link (https://lu.ma/abc123), a short code (abc123) or an id (evt-...).

const LUMA_API = "https://api.lu.ma/event/get?event_api_id=";

// Pull the event code out of whatever the lead pasted
function lumaIdFrom(input) {
  const text = String(input).trim();
  const match = text.match(/lu\.ma\/([A-Za-z0-9_-]+)/); // a link like https://lu.ma/gkmdzbk9
  return match ? match[1] : text;                       // otherwise assume it's already the code or id
}

// Luma sometimes stores the description as a rich-text tree. This pulls the plain words out of it.
function textFrom(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textFrom).join("");
  const inner = textFrom(node.content) + (node.text || "");
  return node.type === "paragraph" || node.type === "heading" ? inner + "\n" : inner;
}

// "2026-11-12T18:30:00.000Z" in a timezone -> { date: "2026-11-12", time: "18:30" }
function localDateTime(iso, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// Fetch the event and return it in our event.json shape
async function fetchLumaEvent(input) {
  const id = lumaIdFrom(input);
  const response = await fetch(LUMA_API + encodeURIComponent(id));
  if (!response.ok) throw new Error(`Luma could not find an event for "${input}" (HTTP ${response.status}). Check the link.`);
  const data = await response.json();
  const event = data.event;

  const where = event.geo_address_info || {};
  const venue = [where.address, where.city].filter(Boolean).join(", ")
    || (event.location_type === "online" ? "Online" : "Venue to be confirmed");
  const description = (event.description_md || event.description || textFrom(event.description_mirror) || "").trim();
  const when = localDateTime(event.start_at, event.timezone);

  return {
    name: event.name,
    date: when.date,
    time: when.time,
    venue,
    description,
    hosts: (data.hosts || []).map((h) => h.name).filter(Boolean),
    guest_count: data.guest_count || 0,
  };
}

module.exports = { fetchLumaEvent, lumaIdFrom };
