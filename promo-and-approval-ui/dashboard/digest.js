// Makes the preview frame exactly as tall as the newsletter inside it, so there is no inner scrollbar.
const frame = document.getElementById("digest-frame");

function fitFrame() {
  const doc = frame.contentDocument;
  // The newsletter sets body[data-ready] once its fonts have loaded and its rows are built
  if (!doc || !doc.body || !doc.body.hasAttribute("data-ready")) return false;
  frame.style.height = doc.documentElement.scrollHeight + "px";
  return true;
}

// Prefer this week's real Luma events (made by digest/fetch-week.js). If that file is missing or empty,
// the newsletter keeps the sample events it already loaded from data/digest-sample.json.
// We wait until the sample has finished drawing, so it can't overwrite the real events afterwards.
frame.addEventListener("load", async () => {
  try {
    const r = await fetch("/data/digest-week.json");
    const events = r.ok ? await r.json() : [];
    if (!Array.isArray(events) || !events.length) return;
    for (let i = 0; i < 40 && !frame.contentDocument.body.hasAttribute("data-ready"); i++) await new Promise((ok) => setTimeout(ok, 100));
    await frame.contentWindow.renderDigest(events);
    fitFrame();
  } catch (e) { /* no live file: the sample stays */ }
});

// Check every 100ms (for up to 4 seconds) until the newsletter is ready
frame.addEventListener("load", () => {
  let tries = 0;
  const timer = setInterval(() => { if (fitFrame() || ++tries > 40) clearInterval(timer); }, 100);
});
// The newsletter gets taller on narrow screens, so fit again when the window changes size
window.addEventListener("resize", fitFrame);
