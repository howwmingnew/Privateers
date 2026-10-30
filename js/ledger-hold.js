"use strict";
// ---------- Harbor ledger: keeping the page still while it redraws (#117) ----------
// Every action redraws the whole ledger (renderPort, js/harbor.js). Two things used to move what the player was looking at: the message under the
// title changing its line count (the gun deck's muzzles under it jumped ~40px), and the open panel changing height (the right column re-scrolled
// ~160px, clamped by the browser or dragged along by the focus that came back). holdMsg keeps the message box as tall as the tallest text it has shown
// since the dock; ledgerAnchor remembers where the open panel sits and, after the redraw, scrolls the sheet by whatever it moved; panelInView brings a
// panel that opened out of sight (a 720 px tall window: the deck is taller than the screen) on screen.
let msgHold = 0;   // the tallest the message box has been (px) since the last dock
function holdMsg(el, html) {
  msgHold = Math.max(msgHold, el.offsetHeight);   // the height it has now (its own floor included), before the new text replaces it
  el.style.minHeight = ""; el.innerHTML = html;
  msgHold = Math.max(msgHold, el.offsetHeight);
  el.style.minHeight = msgHold ? msgHold + "px" : "";
}
function resetMsgHold() { msgHold = 0; const el = document.getElementById("pMsg"); if (el) el.style.minHeight = ""; }
onHook("dock", resetMsgHold);
window.addEventListener("resize", resetMsgHold);   // the text wraps differently at another width: measure again

// Called before a redraw; returns what to call after it (or null: no panel is open). A different panel (another pick) is left to scroll as it likes.
function ledgerAnchor() {
  const ctx = document.getElementById("ctx");
  if (!ctx || !ctx.classList.contains("open") || typeof sheetEl === "undefined") return null;
  const top = ctx.getBoundingClientRect().top, was = lastPick;
  return () => {
    if (!ctx.classList.contains("open") || lastPick !== was) return;
    const d = ctx.getBoundingClientRect().top - top;
    if (Math.abs(d) >= 1) sheetEl.scrollTop += d;
  };
}

// The open panel's top is under the title bar (above the view) or below the foot of the sheet: scroll it in. Checked again a frame later,
// when the deck's canvas has settled to its final size.
function panelInView() {
  const ctx = document.getElementById("ctx"); if (!ctx || typeof sheetEl === "undefined") return;
  const look = () => {
    const r = ctx.getBoundingClientRect(), box = sheetEl.getBoundingClientRect();
    if (r.top > box.bottom - 120 || r.bottom < box.top + 120) ctx.scrollIntoView({ block: "nearest" });
  };
  ctx.scrollIntoView({ block: "nearest" }); requestAnimationFrame(look);
}
