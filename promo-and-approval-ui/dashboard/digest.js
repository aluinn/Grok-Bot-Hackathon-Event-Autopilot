// Makes the preview frame exactly as tall as the newsletter inside it, so there is no inner scrollbar.
const frame = document.getElementById("digest-frame");

function fitFrame() {
  const doc = frame.contentDocument;
  // The newsletter sets body[data-ready] once its fonts have loaded and its rows are built
  if (!doc || !doc.body || !doc.body.hasAttribute("data-ready")) return false;
  frame.style.height = doc.documentElement.scrollHeight + "px";
  return true;
}

// Check every 100ms (for up to 4 seconds) until the newsletter is ready
frame.addEventListener("load", () => {
  let tries = 0;
  const timer = setInterval(() => { if (fitFrame() || ++tries > 40) clearInterval(timer); }, 100);
});
// The newsletter gets taller on narrow screens, so fit again when the window changes size
window.addEventListener("resize", fitFrame);
