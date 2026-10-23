"use strict";
// ---------- Mooring: the dock ring at Safe Harbor (and the Hulk Outpost) ----------
// Sailing through the ring is a quick resupply, no menu: the hold sells at once (streak price, js/plunder.js) and the
// hull mends while the ship is inside. Stopping inside the ring for MOOR_T seconds opens the harbor ledger (dock()).
// A quick resupply is not a dock: the sortie goes on, so the "dock" / "sail" hooks don't run and the sea isn't reset
// (no new bounty spawn, no sortie count, no wiped enemies). Those still happen when the ledger opens and closes.
Object.assign(STR.en, {
  moor_hold: "Hold still to open the ledger", moor_open: "Opening the ledger…",
  moor_go_touch: "Let go of the stick to stop and open the ledger", moor_go_desk: "Drop sail (S) to stop and open the ledger",
  moor_go_keys: "Drop sail (S) to stop and open the ledger", moor_go_mouse: "Let go of the mouse to stop and open the ledger",
  moor_go_pad: "D-pad down to stop and open the ledger",
  moorSold: "Sold the hold for {n} gold", moorSoldStreak: "Sold the hold for {n} gold (streak +{p}%)", fRepair: "Repairing",
});
Object.assign(STR.zh, {
  moor_hold: "保持靜止，即可打開帳簿", moor_open: "正在打開帳簿…",
  moor_go_touch: "放開搖桿停船，即可打開帳簿", moor_go_desk: "收帆（S）停船，即可打開帳簿",
  moor_go_keys: "收帆（S）停船，即可打開帳簿", moor_go_mouse: "放開滑鼠停船，即可打開帳簿",
  moor_go_pad: "按十字鍵下停船，即可打開帳簿",
  moorSold: "貨艙賣得 {n} 金幣", moorSoldStreak: "貨艙賣得 {n} 金幣（連勝 +{p}%）", fRepair: "修理中",
});

const MOOR_T = 3;          // seconds stopped inside the ring before the ledger opens
const MOOR_STOP = 0.08;    // "stopped": below this share of top speed
const MOOR_HEAL = 0.4;     // share of max hull mended per second inside the ring
// visit: the current pass through the ring. sold/bonus carry the quick sale into the ledger's message if it opens.
let moor = { inside: false, t: 0, sold: 0, bonus: 0 };
let moorG = null;
const moorEl = (() => { const el = document.createElement("div"); el.id = "moor"; el.hidden = true; document.body.appendChild(el); return el; })();

// Called each sea frame from step() (js/main.js) with the nearest harbor and the distance to it.
function moorTick(dt, hb, dPort) {
  const inside = player.alive && dPort < DOCK_R;
  if (!inside) { if (moor.inside) moorReset(); return; }
  const kind = hb.outpost ? "outpost" : "return";
  if (!moor.inside) { moor = { ...moor, inside: true }; if (player.hp < player.maxHp) floatText(player.x, player.y - 40, t("fRepair"), "#9fe0a0", 15); }
  if (cargo > 0) quickSell(kind);
  if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + player.maxHp * MOOR_HEAL * dt);
  player.burnT = 0;
  // the ledger: only once the ship has left the ring since it last set sail (canDock, js/main.js)
  const still = player.speed < player.maxSpeed * MOOR_STOP;
  moor = { ...moor, t: canDock && still ? moor.t + dt : 0 };
  if (moor.t >= MOOR_T) { const prior = { sold: moor.sold, bonus: moor.bonus }; moorReset(); dock(kind, prior); return; }
  drawMoor(still);
}
// The hold sells exactly as dock() sells it, minus the ledger. The logbook's "dock" hook would have counted the
// plain value, so it is counted here (sellHold adds the streak's share itself).
function quickSell(kind) {
  statsGold(Math.round(cargo));
  const { sold, bonus } = sellHold(kind);
  save.gold += sold; cargo = 0; save.salvage = [];
  persist(); hud(true);
  moor = { ...moor, sold: moor.sold + sold, bonus: Math.max(moor.bonus, bonus) };
  toast(t(bonus > 0 ? "moorSoldStreak" : "moorSold", { n: fmt(sold), p: Math.round(bonus * 100) }));
  floatText(player.x, player.y - 58, `+${fmt(sold)}`, "#ffe08a", 18);
  Snd.play("coin", { amount: sold });
}
function moorReset() {
  moor = { inside: false, t: 0, sold: 0, bonus: 0 };
  if (moorG) moorG.clear();
  if (!moorEl.hidden) moorEl.hidden = true;
}
// A gold ring round the ship fills over MOOR_T; the prompt under the ship says what to do.
function drawMoor(still) {
  if (!moorG) moorG = S.add.graphics().setDepth(9);
  moorG.clear();
  const armed = canDock;
  const txt = !armed ? "" : moor.t > 0 ? t(moor.t > MOOR_T * 0.5 ? "moor_open" : "moor_hold") : t("moor_go_" + device);
  if (moorEl.textContent !== txt) moorEl.textContent = txt;
  if (moorEl.hidden === !!txt) moorEl.hidden = !txt;
  if (!armed || !still) return;
  const cam = S.cameras.main, px = (typeof VIEW !== "undefined" ? VIEW.dpr : 1) / cam.zoom;
  const r = shipRadius(player) + 22 * px, k = clamp(moor.t / MOOR_T, 0, 1), a0 = -Math.PI / 2;
  moorG.lineStyle(6 * px, 0x08222d, 0.55); moorG.strokeCircle(player.x, player.y, r);
  moorG.lineStyle(4 * px, 0xf0c766, 0.95); moorG.beginPath(); moorG.arc(player.x, player.y, r, a0, a0 + k * TAU); moorG.strokePath();
}
// Anything that stops the sea (pause, title, the ledger) hides the ring and the prompt.
onHook("frame", () => { if ((paused || docked) && (moor.inside || !moorEl.hidden)) moorReset(); });
