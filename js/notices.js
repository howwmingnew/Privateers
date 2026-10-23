"use strict";
// ---------- Notices: the toast lane, merged damage numbers, hit markers, text size for world labels ----------
//   toast(msg)                 one line at the top. While the ledger is open it waits (it used to print over the
//                              ledger's first lines) and shows once the ship is at sea again; docking clears it.
//   dmgNumber(s, dmg, col, px) the floating damage number on ship s (combat.js hurt). Hits on the same ship within
//                              DMG_MERGE_MS add into one number instead of stacking "10 10 10" over the badge.
//   Hit markers                a ship that hits the player gets a red "!" over it, or at the screen edge pointing at it
//                              when it is off screen, for HIT_SHOW seconds after its last hit.

// ---------- toasts ----------
const TOAST_MS = 2400, TOAST_GAP_MS = 350, TOAST_QUEUE_MAX = 3;
const toastEl = document.getElementById("toast");
let toastTimer, toastOn = false, toastQueue = [];
function toast(msg) {
  if (typeof docked !== "undefined" && docked) {   // the sheet is up: hold it (newest kept, no repeats)
    toastQueue = [...toastQueue.filter(m => m !== msg), msg].slice(-TOAST_QUEUE_MAX);
    return;
  }
  showToast(msg);
}
function showToast(msg) {
  toastEl.textContent = msg; toastEl.classList.add("on"); toastOn = true;
  clearTimeout(toastTimer); toastTimer = setTimeout(endToast, TOAST_MS);
}
function endToast() {
  toastEl.classList.remove("on"); toastOn = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(nextToast, TOAST_GAP_MS);
}
function nextToast() {
  if (toastOn || !toastQueue.length || docked) return;
  const [msg, ...rest] = toastQueue; toastQueue = rest;
  showToast(msg);
}
// The sinking toast fires just before dock("sunk"): it must not sit on the ledger's first line.
onHook("dock", () => { clearTimeout(toastTimer); toastEl.classList.remove("on"); toastOn = false; });
onHook("sail", () => { if (!toastOn) { clearTimeout(toastTimer); toastTimer = setTimeout(nextToast, 700); } });   // a live toast chains on by itself

// ---------- damage numbers ----------
const DMG_MERGE_MS = 300;
function riseText(txt, x, y) {
  const lk = labelScale();
  S.tweens.killTweensOf(txt);
  txt.setPosition(x, y).setAlpha(1).setScale(lk * 1.3);
  S.tweens.add({ targets: txt, scale: lk, duration: 150, ease: "Back.easeOut" });
  S.tweens.add({ targets: txt, y: y - 34 * lk, alpha: 0, delay: 120, duration: 900, ease: "Cubic.easeOut", onComplete: () => { txt.destroy(); txt.gone = true; } });
}
function dmgNumber(s, dmg, color, size) {
  const now = S.time.now, m = s.dmgTxt;
  if (m && !m.txt.gone && now - m.at < DMG_MERGE_MS) {
    s.dmgTxt = { ...m, total: m.total + dmg, at: now };
    m.txt.setText(String(Math.round(m.total + dmg)));
    riseText(m.txt, s.x, s.y - 22);
    return;
  }
  const txt = S.add.text(s.x, s.y - 22, String(Math.round(dmg)), { fontFamily: UI_FONT, fontSize: size + "px", fontStyle: "700", color, stroke: "#0b2530", strokeThickness: 4 })
    .setOrigin(0.5).setDepth(10);
  labelText(txt);
  s.dmgTxt = { txt, total: dmg, at: now };
  riseText(txt, s.x + rand(-6, 6), s.y - 22);
}

// ---------- hit markers ----------
const HIT_SHOW = 1.8, HIT_FADE = 0.4, HIT_MAX = 4;
const HIT_INSET = { side: 64, top: 112, bottom: 70 };   // the edge ring stays inside the HUD strip and the boss arrow's edge
const hitLayer = document.createElement("div");
hitLayer.id = "hitDirs"; hitLayer.setAttribute("aria-hidden", "true");
document.body.append(hitLayer);
let hitMarks = [];
function popMark(el) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
onHook("hurt", (s, dmg, src) => {
  if (!s.isPlayer || !src || src === player || !src.spr) return;
  const old = hitMarks.find(h => h.src === src);
  if (old) { old.t = HIT_SHOW; popMark(old.el); return; }
  const el = document.createElement("div");
  el.className = "hd"; el.innerHTML = "<i></i><b>!</b>";
  hitLayer.append(el); popMark(el);
  const keep = hitMarks.slice(-(HIT_MAX - 1)), drop = hitMarks.slice(0, Math.max(0, hitMarks.length - (HIT_MAX - 1)));
  for (const h of drop) h.el.remove();
  hitMarks = [...keep, { src, el, t: HIT_SHOW }];
});
function placeMark(h) {
  const v = S.cameras.main.worldView, vw = VIEW.cssW, vh = VIEW.cssH, k = vw / v.width;
  const sx = (h.src.x - v.x) * k, sy = (h.src.y - v.y) * k;
  const near = sx > 24 && sx < vw - 24 && sy > HIT_INSET.top && sy < vh - 24;
  h.el.classList.toggle("near", near);
  if (near) {   // just above the shooter's level badge (the boss: its name tag), wherever zoom and text size put it
    const tag = h.src.boss && h.src === bossShip && bossTag ? bossTag.txt : h.src.badge;
    const top = tag ? (tag.y - v.y) * k - tag.displayHeight * k / 2 - 17 : (shipTop(h.src) - v.y) * k - 40;
    h.el.style.transform = `translate(${sx}px, ${Math.max(top, HIT_INSET.top - 40)}px)`;
    return;
  }
  // off screen: on an ellipse inside the screen edge, along the line from the player toward the shooter
  const hx = vw / 2 - HIT_INSET.side, hy = (vh - HIT_INSET.top - HIT_INSET.bottom) / 2, cx = vw / 2, cy = HIT_INSET.top + hy;
  const dx = h.src.x - player.x, dy = h.src.y - player.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const r = 1 / Math.sqrt((ux / hx) ** 2 + (uy / hy) ** 2);
  h.el.style.transform = `translate(${cx + ux * r}px, ${cy + uy * r}px)`;
  h.el.firstElementChild.style.transform = `rotate(${Math.atan2(uy, ux)}rad)`;
}
onHook("frame", dt => {
  if (!hitMarks.length) return;
  const live = !docked && player.alive && !titleOpen;
  hitMarks = hitMarks.filter(h => {
    if (!paused) h.t -= dt;
    const keep = live && h.t > 0 && h.src.alive;
    if (!keep) h.el.remove();
    return keep;
  });
  for (const h of hitMarks) { h.el.classList.toggle("fade", h.t < HIT_FADE); placeMark(h); }
});

// ---------- text size for world labels ----------
// labelScale() (js/art.js) carries the text-size setting, so badges, numbers and name tags follow it frame by frame;
// labels made once (the harbor and outpost names, wreck markers) are refreshed here when the zoom or the setting changes.
let labelKey = "";
onHook("frame", () => {
  const key = S.cameras.main.zoom + "|" + SETTINGS.textScale;
  if (key === labelKey) return;
  labelKey = key;
  if (harborLabel) { harborLabel.setScale(SETTINGS.textScale); crispText(harborLabel, viewTextRes(S.cameras.main.zoom * SETTINGS.textScale)); }
  if (typeof outpostLabel !== "undefined" && outpostLabel) labelText(outpostLabel);
  for (const c of crates) if (c.label) labelText(c.label);
});
