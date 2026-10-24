"use strict";
// ---------- Harbor gun deck: the player's ship as it sails, bow up, each gun port's button beside its muzzle ----------
// deckHtml() (called by renderPort, js/harbor.js) lays the buttons out in a CSS grid round an empty .dk-ship cell: bow
// guns above, larboard left, starboard right, stern below. paintGunDeck() then paints the real hull art (drawShip,
// js/art-draw.js) into that cell and runs a leader line from each button to its muzzle. Muzzles follow muzzle()
// (js/combat.js): slot i of n sits at -span/2 + span*i/(n-1) along the mount, so broadside slot 0 is the aftmost gun and
// bow / stern slot 0 the larboard one. Broadside guns sit where drawDeck's barrels poke through the rail.
const DECK_K = 2.6;   // ship cell width per art px of the sprite's width (beam plus sails), capped at 46% of the deck

function deckMuzzle(a, side, i, n) {   // ship-local point: bow +x, larboard -y (as in the baked sprite)
  const at = span => n === 1 ? 0 : -span / 2 + span * i / (n - 1);
  if (side === "bow") return { x: a.len / 2 + 2, y: at(a.beam * 0.36) };
  if (side === "stern") return { x: -a.len / 2, y: at(a.beam * 0.36) };
  const x = at(a.len * 0.48), y = hullHalf(a, 0.5 + x / a.len) + 1;
  return { x, y: side === "left" ? -y : y };
}
function deckHtml() {
  const a = SHIP_ART[save.ship] || SHIP_ART.sloop, { w, h } = texSize(a);
  const btn = (side, label, i) => { const gun = save[side][i], cls = (gun ? "slot" : "slot empty") + (isPicked(side, i) ? " sel" : "");   // js/gunbay.js
    const name = gun ? `${t("gf_" + gun.g)} Lv ${gun.lv}` : t("emptyPort");
    return `<button class="${cls}" type="button" data-act="slot" data-side="${side}" data-i="${i}" data-k="${side}${i}" aria-pressed="${isPicked(side, i)}" aria-label="${t("slotAria", { side: label, n: i + 1, gun: name })}">` +
      (gun ? `${t("g_" + gun.g)}<small>Lv ${gun.lv}</small>` : `${t("emptyPort")}<small>&nbsp;</small>`) + `</button>`; };   // .deck.dense css: one line per port
  const grp = (side, label) => {
    const idx = save[side].map((_, i) => i);
    if (!idx.length) return "";
    if (side === "left" || side === "right") idx.reverse();   // bow-most gun on top, so the list reads like the hull
    return `<div class="dk-grp dk-${side}"><div class="lbl">${label}</div><div class="slots">${idx.map(i => btn(side, label, i)).join("")}</div></div>`;
  };
  const rows = Math.max(save.left.length, save.right.length);   // a dense deck (js/gundeck.js) stretches the ship cell to as many rows as the longest side
  return { dense: denseDeck(save.ship), style: `--shipw: min(46%, ${Math.round(h * DECK_K)}px); --ship-ar: ${h} / ${w}; --rows: ${rows}`,
    html: `<svg class="dk-lines" aria-hidden="true"></svg>` + grp("bow", t("bow")) + grp("left", t("larboard")) +
      `<div class="dk-ship" aria-hidden="true"></div>` + grp("right", t("starboard")) + grp("stern", t("stern")) };
}
function renderDeck(el = document.getElementById("deck")) {
  // the canvas survives re-renders; paintGunDeck repaints it only when the ship, the size or a gun changes
  const cv = el.querySelector("canvas.dk-art") || Object.assign(document.createElement("canvas"), { className: "dk-art" });
  const { style, html, dense } = deckHtml();
  el.classList.toggle("dense", dense);
  el.setAttribute("style", style); el.innerHTML = html; el.prepend(cv);
  paintGunDeck(el);
}
function paintGunDeck(el = document.getElementById("deck")) {
  const cv = el.querySelector(".dk-art"), svg = el.querySelector(".dk-lines"), cell = el.querySelector(".dk-ship");
  if (!cv || !svg || !cell) return;
  const box = el.getBoundingClientRect(), r = cell.getBoundingClientRect();
  if (!box.width || !r.height) return;   // ledger still hidden: the ResizeObserver calls again once it shows
  const cls = SHIP_ART[save.ship] ? save.ship : "sloop", a = SHIP_ART[cls], k = r.height / texSize(a).w, dpr = window.devicePixelRatio || 1;
  const cx = r.left - box.left + r.width / 2, cy = r.top - box.top + r.height / 2;
  const liv = liveryFor(player), key = [cls, liv, box.width, box.height, cx, cy, k, dpr, MOUNTS.map(m => gunSig(save[m.key].map(g => g && g.g))).join("/")].join("|");   // a swapped gun repaints the ship
  if (cv.dataset.key !== key) {
    cv.dataset.key = key;
    cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.translate(cx, cy); c.rotate(-Math.PI / 2); c.scale(k, k);
    BLURK = k * dpr;   // shadowBlur ignores the transform (js/art.js)
    try {
      drawShip(c, a, LIVERY[liv], 0, 0, false, mulberry32(artSeed(`ship:${cls}:${liv}`)), true);   // bare hull, then the guns the save really holds (js/gun-art.js)
      for (const m of MOUNTS) drawGunsOn(c, cls, 0, 0, m.key, save[m.key].map(g => g && g.g));
    } finally { BLURK = 1; }
  }
  // leader lines: from the button's edge facing the ship to its muzzle (rotated bow-up: local +x is screen up)
  const f = n => n.toFixed(1), on = deckActive(el);
  svg.setAttribute("viewBox", `0 0 ${f(box.width)} ${f(box.height)}`);
  svg.innerHTML = [...el.querySelectorAll(".slot")].map(b => {
    const side = b.dataset.side, p = deckMuzzle(a, side, +b.dataset.i, save[side].length), q = b.getBoundingClientRect();
    const mx = cx + p.y * k, my = cy - p.x * k, x = q.left - box.left, y = q.top - box.top;
    const [ex, ey] = side === "left" ? [x + q.width, y + q.height / 2] : side === "right" ? [x, y + q.height / 2]
      : side === "bow" ? [x + q.width / 2, y + q.height] : [x + q.width / 2, y];
    const ln = `x1="${f(ex)}" y1="${f(ey)}" x2="${f(mx)}" y2="${f(my)}"`;
    return `<g data-k="${b.dataset.k}"${b.dataset.k === on ? ` class="on"` : ""}><line class="halo" ${ln}/><line ${ln}/><circle cx="${f(mx)}" cy="${f(my)}" r="3"/></g>`;
  }).join("");
}
// The hovered, picked or focused port's line lights up, so it is plain which gun on the hull a button sets.
function deckActive(el) { return (el.querySelector(".slot:hover") || el.querySelector(".slot.sel") || el.querySelector(".slot:focus"))?.dataset.k; }
(() => {
  const el = document.getElementById("deck");
  const mark = () => { const k = deckActive(el); el.querySelectorAll(".dk-lines g").forEach(g => g.classList.toggle("on", g.dataset.k === k)); };
  for (const ev of ["pointerover", "pointerout", "focusin", "focusout"]) el.addEventListener(ev, () => { mark(); requestAnimationFrame(mark); });   // again next frame, once :hover / :focus settle
  new ResizeObserver(() => paintGunDeck(el)).observe(el);   // first show, window resize, text size, language
  document.fonts?.ready.then(() => paintGunDeck(el));
})();
