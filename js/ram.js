"use strict";
// ---------- The bow ram (#149): bought at the harbor ledger, fitted to the flagship's stem ----------
// save.ram (true once bought; an old save has none, so it loads as false) follows the captain, like the worn gear: switching ships keeps it, and it is the
// flagship alone that wears it (an escort never does). While it is fitted, a ship you ram takes RAM_OUT_K times the crash damage and your own hull takes
// RAM_SELF_K times what a ship or an island crash would cost it. js/collision.js reads the two (ramHitK); a crash already ignores the wind's speed bonus (#136)
// and the ram does not change that. Ship Lv (js/data.js shipRating) is the guns' damage against the hull, so the ram, which only acts in a collision, is not part of it.
// A daily or seeded run plays on a default save (js/run.js), so it has no ram. This file holds the save field, the purchase, the ledger row and the drawing.
Object.assign(STR.en, {
  ramName: "Bow ram", ramOwned: "Fitted", ramFit: "Fit ram · {n}", ramNeed: "Fit ram · {n} (need {d} more)", ramArm: "Tap again to confirm: fit the ram for {n} gold",
  ramDs: "A bronze ram on the stem: ships you ram take <b>+{o}%</b> damage, and ship or island crashes cost your hull <b>{s}%</b> less. Does not change Ship Lv.",
  ramGain: "Ram +{o}% dealt, −{s}% taken", ramHave: "Ram fitted: +{o}% dealt, −{s}% taken", ramBought: "The carpenters fit a bronze ram to your stem.",
});
Object.assign(STR.zh, {
  ramName: "船首撞角", ramOwned: "已裝上", ramFit: "裝上撞角 · {n}", ramNeed: "裝上撞角 · {n}（還差 {d} 金）", ramArm: "再點一次確認：花 {n} 金裝上撞角",
  ramDs: "船首裝一根青銅撞角：你撞到的船多受 <b>{o}%</b> 傷害，你自己撞船或撞島少受 <b>{s}%</b>。不影響船艦 Lv。",
  ramGain: "撞擊傷害 +{o}%，自身受傷 −{s}%", ramHave: "已裝撞角：撞擊傷害 +{o}%，自身受傷 −{s}%", ramBought: "木匠在你的船首裝上了青銅撞角。",
});
SAVE_DEFAULTS.push(() => ({ ram: false }));
SAVE_SANITIZERS.push(s => ({ ...s, ram: s.ram === true }));

// The percentages the ledger shows, from the multipliers in js/config.js.
const ramPct = () => ({ o: Math.round((RAM_OUT_K - 1) * 100), s: Math.round((1 - RAM_SELF_K) * 100) });
// Pure: the save with the ram bought, or null when it is already fitted or the gold is short.
function buyRam(s) {
  if (s.ram || s.gold < RAM_PRICE) return null;
  return { ...s, ram: true, gold: s.gold - RAM_PRICE };
}
// The ledger tap (js/harbor.js): a price from CONFIRM_GOLD up takes a second tap, the same rule as a gun upgrade (spendNeedsTap, js/gunbay.js).
function ramAct() {
  if (save.ram || save.gold < RAM_PRICE) return null;
  if (typeof spendNeedsTap === "function" && spendNeedsTap(RAM_PRICE) && !confirmed("ramBuy")) return null;
  const next = buyRam(save);
  if (!next) return null;
  save = next; portMsg = ["ramBought"];
  return "buy";
}
// The row in the flagship's hull panel (js/ledger-panel.js), under the hull, sails and hold.
function ramRowHtml() {
  const p = ramPct(), short = RAM_PRICE - save.gold;
  const btn = save.ram ? `<button class="btn max" type="button" disabled>${t("ramOwned")}</button>`
    : `<button class="btn" type="button" data-act="ram" ${short > 0 ? "disabled" : ""}${armedTap("ramBuy") ? armAttrs() : ""}>${armedTap("ramBuy") ? t("ramArm", { n: fmt(RAM_PRICE) }) : t(short > 0 ? "ramNeed" : "ramFit", { n: fmt(RAM_PRICE), d: fmt(short) })}${gainLine(t("ramGain", p))}</button>`;
  return `<div class="item" id="ramRow"><div class="nm">${t("ramName")}</div>${btn}<div class="ds">${t("ramDs", p)}</div></div>`;
}

// ---------- the drawing: a bronze beak on the stem, a sprite over the player's hull at sea and a paint over the flagship's deck in the ledger ----------
function drawRam(c, a, cx, cy) {
  const x0 = cx + a.len / 2 - 5, tip = cx + a.len / 2 + 4.5, w = Math.max(2, Math.min(hullHalf(a, 0.9) * 0.8, 5));
  const g = c.createLinearGradient(x0, cy - w, x0, cy + w);
  g.addColorStop(0, "#7a5128"); g.addColorStop(0.45, "#d9a14f"); g.addColorStop(1, "#6a4420");
  c.beginPath(); c.moveTo(x0, cy - w); c.lineTo(tip - 2.2, cy - w * 0.42); c.quadraticCurveTo(tip + 0.6, cy - w * 0.1, tip, cy);
  c.quadraticCurveTo(tip + 0.6, cy + w * 0.1, tip - 2.2, cy + w * 0.42); c.lineTo(x0, cy + w); c.closePath();
  c.fillStyle = g; c.fill(); c.lineWidth = 0.7; c.strokeStyle = "rgba(40,22,8,.85)"; c.stroke();
  line(c, x0 + 2.6, cy - w * 0.78, x0 + 2.6, cy + w * 0.78, 0.8, "rgba(40,22,8,.7)");   // the band that holds it to the stem
  line(c, x0 + 0.8, cy - w * 0.35, tip - 1.2, cy - w * 0.12, 0.6, "rgba(255,226,160,.65)");   // a glint along the top
}
const ramTexKey = (an, res) => `ram:${an}:${res}`;
let ramSpr = null, ramSprKey = "";
function ramSync() {
  const sp = typeof player !== "undefined" && player ? player.spr : null;
  if (!save || !save.ram || !sp || !sp.active || !player.art) { if (ramSpr) ramSpr.setVisible(false); return; }
  const an = artNameOf(player.art), res = Math.max(1, Math.round(1 / (player.artScale || 1))), key = ramTexKey(an, res);
  if (!S.textures.exists(key)) { const a = player.art; bakeCanvas(S, key, Math.ceil(a.len + 24), Math.ceil(a.beam + 14), res, c => drawRam(c, a, Math.ceil(a.len + 24) / 2, Math.ceil(a.beam + 14) / 2)); }
  if (!ramSpr || !ramSpr.active) { ramSpr = S.add.image(0, 0, key); ramSprKey = key; }
  else if (ramSprKey !== key) { ramSpr.setTexture(key); ramSprKey = key; }
  ramSpr.setDepth(sp.depth + 0.04).setVisible(sp.visible).setPosition(sp.x, sp.y).setRotation(sp.rotation).setScale(sp.scaleX, sp.scaleY).setAlpha(sp.alpha);
}
onHook("frame", ramSync);
