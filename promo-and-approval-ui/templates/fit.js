// Shrinks any text marked data-fit until it fits its box, so long text is never cut off.
function fitText() {
  document.querySelectorAll("[data-fit]").forEach((el) => {
    let size = parseFloat(getComputedStyle(el).fontSize);
    const maxHeight = parseFloat(getComputedStyle(el).maxHeight); // the tallest this box may be (NaN if no limit)
    const min = 14;
    // Too big = the text is taller than the box's limit, or wider than the box
    const tooBig = () => (maxHeight && el.scrollHeight > maxHeight) || el.scrollWidth > el.clientWidth + 1;
    while (tooBig() && size > min) {
      size -= 2;
      el.style.fontSize = size + "px";
    }
  });
}
// Wait for the fonts to load first, otherwise the measuring would be wrong
document.fonts.ready.then(() => { fitText(); document.body.setAttribute("data-ready", "yes"); });
