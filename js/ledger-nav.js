"use strict";
// ---------- Harbor ledger: D-pad, stick and arrow-key focus; focus kept when the shop re-renders ----------
// The sheet scrolls under a sticky footer (Set sail, Settings, How to play). Spatial navigation over only the controls
// in view let that always-visible footer win every "nearest below" contest, so most of the shop was out of reach.
// Here every control in the sheet is a candidate, scrolled into view or not; the footer is a row of its own, reached
// down from the last control (or with pad Y) and left by going up. LB / RB jump between the shop's sections.
// After a purchase the shop is rebuilt (renderPort); focus goes back to the same item, or the next one that can still
// be pressed, never to <body>.
const LEDGER_BOXES = ["deck", "armory", "yard", "ships"];
const inFooter = el => !!el.closest("footer");
const ledgerControls = () => focusables(sheetEl).filter(el => el !== sheetEl);
function centre(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function inView(el) {
  const box = sheetEl.getBoundingClientRect(), r = el.getBoundingClientRect();
  return r.bottom > box.top + 4 && r.top < box.bottom - 4;
}
// Nearest control in a direction. Up / down: the nearest row that way, then the control in it closest sideways (so the
// gun deck's slots on the left are not skipped for the Buy buttons on the right). Sideways: distance along it plus
// twice the offset, the menus' own rule (js/menu.js).
const ROW_SLACK = 18;
function nearestFrom(from, pool, dx, dy) {
  const a = centre(from), cands = [];
  for (const el of pool) {
    const p = centre(el), along = dx ? (p.x - a.x) * dx : (p.y - a.y) * dy, across = dx ? Math.abs(p.y - a.y) : Math.abs(p.x - a.x);
    if (along >= 6) cands.push({ el, along, across });
  }
  if (!cands.length) return null;
  if (dy) {
    const row = Math.min(...cands.map(c => c.along)) + ROW_SLACK;
    return cands.filter(c => c.along <= row).sort((p, q) => p.across - q.across)[0].el;
  }
  return cands.sort((p, q) => p.along + p.across * 2 - (q.along + q.across * 2))[0].el;
}
function ledgerMove(dx, dy) {
  const els = ledgerControls(), cur = document.activeElement;
  if (!els.includes(cur)) {   // focus on the bare sheet: start on the shop control nearest the top (bottom, going up) of the view
    const seen = els.filter(el => !inFooter(el) && inView(el)).sort((p, q) => centre(p).y - centre(q).y || centre(p).x - centre(q).x);
    const f = (dy < 0 ? seen[seen.length - 1] : seen[0]) || els.find(el => !inFooter(el)) || $m("sail");
    if (f) focusEl(f);
    return;
  }
  // the gun deck is a diagram with the broadsides side by side (js/deck-art.js): down reads it like a page (bow, larboard
  // top to bottom, starboard, stern) so a run of downs reaches every port; up and sideways stay spatial
  if (dy > 0 && cur.closest("#deck")) {
    const ports = [...$m("deck").querySelectorAll(".slot")], next = ports[ports.indexOf(cur) + 1];
    if (next) { focusEl(next); return; }
  }
  const foot = inFooter(cur), col = cur.closest(".lcol");
  // sideways stays in its row (footer or shop); up and down move through the shop, never into the footer, and finish
  // the column they are in (the shop, or the poster beside it) before crossing to the other
  const pool = els.filter(el => el !== cur && (dx ? inFooter(el) === foot : !inFooter(el)));
  const best = (dy && col && nearestFrom(cur, pool.filter(el => el.closest(".lcol") === col), dx, dy)) || nearestFrom(cur, pool, dx, dy);
  if (best) { focusEl(best); return; }
  if (dy > 0 && !foot) { focusEl($m("sail")); return; }   // past the last control: Set sail
  if (dy) sheetEl.scrollBy({ top: dy * sheetEl.clientHeight * 0.45 });   // the top of the sheet (its message), or its end
}
function ledgerJump(dir) {
  const els = ledgerControls();
  const boxes = LEDGER_BOXES.map(id => $m(id)).filter(b => b && !b.closest("[hidden]") && els.some(el => b.contains(el)));
  if (!boxes.length) return;
  const at = boxes.findIndex(b => b.contains(document.activeElement));
  const next = boxes[at < 0 ? (dir > 0 ? 0 : boxes.length - 1) : (at + dir + boxes.length) % boxes.length];
  const el = els.find(x => next.contains(x));
  if (!el) return;
  el.focus({ preventScroll: true });
  next.closest("section").scrollIntoView({ block: "nearest" }); el.scrollIntoView({ block: "nearest" });
}
// Pad buttons the ledger adds to the menus' A / B: Y = Set sail, LB / RB = previous / next shop section.
function ledgerPad(pressed) {
  if (activeRoot() !== sheetEl) return;
  if (pressed("y")) focusEl($m("sail"));
  else if (pressed("rb")) ledgerJump(1);
  else if (pressed("lb")) ledgerJump(-1);
}

// ---------- keep focus through re-renders ----------
let ledgerLast = null;   // { el, box, idx }: the control that last had focus in the sheet, its list and row there
sheetEl.addEventListener("focusin", e => {
  const box = e.target.closest(LEDGER_BOXES.map(id => "#" + id).join(", ") + ", #wanted"), item = e.target.closest(".item");
  ledgerLast = { el: e.target, box: box ? box.id : null, idx: box && item ? [...box.querySelectorAll(".item")].indexOf(item) : -1 };
});
const DATA_KEYS = ["act", "id", "k", "side", "i", "camp"];
const keyOf = (el, skip = []) => DATA_KEYS.filter(k => el.dataset[k] !== undefined && !skip.includes(k)).map(k => `[data-${k}="${el.dataset[k]}"]`).join("");
function refocusLedger(last) {
  const els = ledgerControls(), shop = els.filter(el => !inFooter(el)), box = last.box && $m(last.box);
  const scope = box || sheetEl, k1 = keyOf(last.el), k2 = keyOf(last.el, ["act"]);   // "buy" turns into "up" once bought
  const row = box && last.idx >= 0 ? box.querySelectorAll(".item")[last.idx] : null;   // a maxed item's button loses its data-*
  const same = (k1 && scope.querySelector(k1)) || (k2 && scope.querySelector(k2)) || row || null;
  let pick = same && els.includes(same) ? same : null;
  if (!pick && same) {   // maxed out or no longer affordable: the next control in the shop, else the one before
    pick = shop.find(el => same.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
      || [...shop].reverse().find(el => same.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) || null;
  }
  if (!pick && box) {   // the item itself is gone (a new ship): the first control left in its list, or in the lists after it
    const from = LEDGER_BOXES.indexOf(box.id);
    for (const id of from >= 0 ? LEDGER_BOXES.slice(from) : [box.id]) { pick = shop.find(el => $m(id) && $m(id).contains(el)); if (pick) break; }
  }
  focusEl(pick || $m("sail"));
}
// Runs after the poster has re-rendered too (this file loads after js/campaign-ui.js). The ledger opening (dock) has
// the sheet hidden or focused, so only a rebuild under a focused control triggers this.
onHook("renderPort", () => {
  const last = ledgerLast;
  if (!last || last.el.isConnected || portEl.hidden || !docked) return;
  if (document.activeElement && document.activeElement !== document.body && sheetEl.contains(document.activeElement)) return;
  refocusLedger(last);
});
