// Built-in sample data so the sponsors pipeline can be tested offline (no API key).
// Used by `node sponsors/find.js --sample` and `node sponsors/draft-outreach.js --sample`.
// These are example-only placeholders; run without --sample to get real, researched sponsors.

const SAMPLE_SPONSORS = [
  {
    name: "Example Coworking",
    website: "https://example-coworking.example",
    why_fit: "A Shoreditch coworking space whose members are exactly the makers and founders this builders night attracts.",
    tier: "venue",
    contact_email: "events@example-coworking.example",
    contact_page: "https://example-coworking.example/events",
    confidence: "high",
  },
  {
    name: "Example Brewing Co",
    website: "https://example-brewing.example",
    why_fit: "A local East London brewery that already supplies drinks for community meetups of 50-100 people.",
    tier: "food & drink",
    contact_email: "hello@example-brewing.example",
    contact_page: "",
    confidence: "medium",
  },
  {
    name: "Example Cloud",
    website: "https://example-cloud.example",
    why_fit: "Gives builders free hosting credits and wants to meet people shipping side projects in one evening.",
    tier: "tooling",
    contact_email: "community@example-cloud.example",
    contact_page: "https://example-cloud.example/community",
    confidence: "high",
  },
  {
    name: "Example Talent",
    website: "https://example-talent.example",
    why_fit: "A London tech recruiter looking to meet 80+ designers and engineers who build things in their spare time.",
    tier: "recruiting",
    contact_email: "partnerships@example-talent.example",
    contact_page: "",
    confidence: "low",
  },
  {
    name: "Example Makers Collective",
    website: "https://example-makers.example",
    why_fit: "A London maker community that cross-promotes events like this one to its own newsletter.",
    tier: "community",
    contact_email: "",
    contact_page: "https://example-makers.example/partner",
    confidence: "medium",
  },
];

// Offline stand-in for Grok: writes a plain sponsorship email from a template.
function sampleDraft(sponsor, event) {
  const hosts = event.hosts.join(" and ");
  const body =
    `Hi ${sponsor.name} team,\n\n` +
    `We are hosting ${event.name} on ${event.date} at ${event.time}, at ${event.venue}. ` +
    `It is an informal evening where about ${event.guest_count} local makers, designers and founders demo what they are building and swap feedback.\n\n` +
    `We think ${sponsor.name} is a natural fit: ${sponsor.why_fit}\n\n` +
    `As a sponsor you would get your logo on all event visuals and in our newsletter, two minutes on stage to say hello, and a table to meet guests during the evening.\n\n` +
    `Would you be open to a 15-minute call next week to see if it makes sense? Happy to work around your calendar.\n\n` +
    `Thanks,\n${hosts}`;
  return { name: sponsor.name, subject: `Sponsor ${event.name.split(":")[0]} (${event.date})`, body };
}

module.exports = { SAMPLE_SPONSORS, sampleDraft };
