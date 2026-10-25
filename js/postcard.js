"use strict";
// ---------- Postcards: the sea as a PNG with the game's name in the corner ----------
// postcardSave() snapshots the canvas (Phaser's renderer.snapshot: a WebGL canvas can't be read back outside its own
// frame), stamps the wordmark (WORDMARK, js/victory.js) bottom right and hands the PNG over: the share sheet on a phone
// that has one, a download everywhere else. postcardOffer() shows a small button for a few seconds after a boss goes down
// or a sortie that sank something pays out (sortieTally, js/juice-ui.js); photo mode (js/photo.js) and the victory screen carry the button too.
Object.assign(STR.en, { pc_save: "Save postcard", pc_saved: "Saved!", pc_fail: "Could not save the picture." });
Object.assign(STR.zh, { pc_save: "存成明信片", pc_saved: "已儲存！", pc_fail: "無法儲存圖片。" });
const POSTCARD_MARK = "Privateers · howwmingnew.github.io/Privateers";   // the same text as WORDMARK (js/victory.js)
const POSTCARD_OFFER_MS = 8000;

const pad2 = n => String(n).padStart(2, "0");
const postcardName = d => `privateers-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.png`;
// The wordmark's size and right-aligned baseline for a w x h picture: about 2.2% of the width, kept legible on a small phone
// canvas and unobtrusive on a big one, with a margin of about one text height.
function postcardMarkLayout(w, h) {
  const size = clamp(Math.round(w * 0.022), 14, 56), margin = Math.round(size * 1.1);
  return { size, x: w - margin, y: h - margin };
}
function stampMark(ctx, w, h) {
  const L = postcardMarkLayout(w, h);
  ctx.save();
  ctx.font = `700 ${L.size}px "Barlow Semi Condensed", "Noto Sans TC", system-ui, sans-serif`;
  ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round"; ctx.lineWidth = Math.max(3, L.size * 0.28); ctx.strokeStyle = "rgba(8,34,45,.85)";
  ctx.strokeText(POSTCARD_MARK, L.x, L.y);
  ctx.fillStyle = "#f6f1e3"; ctx.fillText(POSTCARD_MARK, L.x, L.y);
  ctx.restore();
}
// The canvas as a PNG Blob with the wordmark on it.
function postcardBlob() {
  return new Promise((resolve, reject) => {
    if (!S || !S.game || !S.game.renderer) return reject(new Error("no renderer"));
    S.game.renderer.snapshot(img => {
      if (!img || !img.width) return reject(new Error("empty snapshot"));
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0); stampMark(ctx, c.width, c.height);
      c.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
  });
}
// Resolves "shared" | "saved" | "cancelled", rejects when the picture could not be made.
async function postcardSave() { return deliverImage(await postcardBlob(), postcardName(new Date())); }
// A PNG (or a video, js/replay.js: the blob's own type) to the player: the share sheet on a phone that has one (meta adds text / url to it, for the share card,
// js/sharecard.js), a download everywhere else. Resolves "shared" | "saved" | "cancelled".
async function deliverImage(blob, name, meta = {}) {
  if (device === "touch" && typeof File === "function" && navigator.canShare && navigator.share) {   // a phone: the share sheet has "Save image"
    const file = new File([blob], name, { type: blob.type || "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Privateers", ...meta }); return "shared"; }
      catch (e) { if (e && e.name === "AbortError") return "cancelled"; }   // anything else: fall back to a download
    }
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "saved";
}
// A button that saves a postcard and says how it went in its own label. Returns it; the caller places it.
function postcardButton(cls) {
  const b = document.createElement("button");
  b.type = "button"; b.className = cls; b.textContent = t("pc_save");
  let timer = 0;
  const say = key => { b.textContent = t(key); clearTimeout(timer); timer = setTimeout(() => { b.textContent = t("pc_save"); b.disabled = false; }, 1600); };
  b.addEventListener("click", () => {
    if (b.disabled) return;
    b.disabled = true;
    postcardSave().then(r => say(r === "cancelled" ? "pc_save" : "pc_saved"), e => { console.error("Postcard failed:", e); say("pc_fail"); });
  });
  document.addEventListener("langchange", () => { if (!b.disabled) b.textContent = t("pc_save"); });
  return b;
}

// ---------- the offer: a chip at the bottom of the sea for a few seconds ----------
// home: offered where a quick sale was made (the harbor ring): it goes once the ship has sailed off from that spot, so it
// never trails the captain out to sea. The boss's offer is not tied to a place.
let chipEl = null, chipTimer = 0, chipHome = null;
const CHIP_HOME_R = 260;
const leftSpot = spot => !!spot && !!player && dist(player, spot) > CHIP_HOME_R;
// Stopped in the dock ring with the ledger about to open (js/mooring.js): no chip floats over the "Opening the ledger" line.
const dockingNow = () => typeof moor !== "undefined" && moor.t > 0;
const spotNow = () => (player ? { x: player.x, y: player.y } : null);
function postcardOffer(ms = POSTCARD_OFFER_MS, home = false) {
  if (!chipEl) { chipEl = postcardButton("pcchip"); chipEl.id = "postcardChip"; chipEl.hidden = true; document.body.appendChild(chipEl); }
  chipEl.hidden = false; chipHome = home ? spotNow() : null;
  clearTimeout(chipTimer); chipTimer = setTimeout(() => { chipEl.hidden = true; }, ms);
}
// It belongs to the sea it was offered on: the ledger, a pause and the title take it away.
onHook("frame", () => { if (chipEl && !chipEl.hidden && (docked || paused || titleOpen || dockingNow() || leftSpot(chipHome) || !player.alive)) chipEl.hidden = true; });
onHook("dock", () => { if (chipEl) { chipEl.hidden = true; clearTimeout(chipTimer); } });
onHook("sunk", (s, killer) => {   // a boss goes down to the player: after its card has been read
  if (s.boss && killer === player) setTimeout(() => { if (!docked) postcardOffer(); }, 1800);
});
