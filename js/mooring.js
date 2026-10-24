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
  fRepair: "Repairing",
  moor_arm: "Sail out of the ring to arm docking",
});
Object.assign(STR.zh, {
  moor_hold: "保持靜止，即可打開帳簿", moor_open: "正在打開帳簿…",
  moor_go_touch: "放開搖桿停船，即可打開帳簿", moor_go_desk: "收帆（S）停船，即可打開帳簿",
  moor_go_keys: "收帆（S）停船，即可打開帳簿", moor_go_mouse: "放開滑鼠停船，即可打開帳簿",
  moor_go_pad: "按十字鍵下停船，即可打開帳簿",
  fRepair: "修理中",
  moor_arm: "先駛出圓圈，回來才能靠港",
});

const MOOR_T = 3;          // seconds stopped inside the ring before the ledger opens
const MOOR_STOP = 0.08;    // "stopped": below this share of top speed
const MOOR_HEAL = 0.4;     // share of max hull mended per second inside the ring
// visit: the current pass through the ring. sold/bonus carry the quick sale into the ledger's message if it opens.
let moor = { inside: false, t: 0, sold: 0, bonus: 0 };
// moorArmed: docking has armed once this session (the "sail out" hint is only for before that) · moorMoved: under way
// since Set sail · moorStillT: seconds sat stopped in the ring since then
const MOOR_ARM_WAIT = 1.5;   // a ship that never moved gets the "sail out" hint after this long stopped in the ring
let moorG = null, moorArmed = false, moorMoved = false, moorStillT = 0;
onHook("sail", () => { moorMoved = false; moorStillT = 0; });
const inMoorRing = () => moor.inside && canDock;   // S / D-pad down stop the ship dead here (js/input.js)
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
  drawMoor(still, dt);
}
// The hold sells exactly as dock() sells it, minus the ledger. The logbook's "dock" hook would have counted the
// plain value, so it is counted here (sellHold adds the streak's share itself).
function quickSell(kind) {
  statsGold(Math.round(cargo));
  const tally = { sunk: streak, cargo: Math.round(cargo) };
  const { sold, bonus } = sellHold(kind);
  save.gold += sold; cargo = 0; save.salvage = [];
  persist(); hud(true);
  moor = { ...moor, sold: moor.sold + sold, bonus: Math.max(moor.bonus, bonus) };
  sortieTally({ ...tally, bonus, gold: sold });   // the sale's one report: the count-up and its coin roll (js/juice-ui.js)
}
function moorReset() {
  moor = { inside: false, t: 0, sold: 0, bonus: 0 };
  if (moorG) moorG.clear();
  if (!moorEl.hidden) moorEl.hidden = true;
}
// A gold ring round the ship fills over MOOR_T; the prompt under the ship says what to do.
function drawMoor(still, dt) {
  if (!moorG) moorG = S.add.graphics().setDepth(9);
  moorG.clear();
  const armed = canDock;
  if (armed) moorArmed = true;
  // stopped in the ring straight after setting sail: nothing happens until the ship has left it once, so say so (once)
  // (also when the ship never moved at all: stopping straight after Set sail used to show nothing). The coach card has
  // the floor on the first voyage.
  if (!still) moorMoved = true;
  moorStillT = still && !armed ? moorStillT + dt : 0;
  const quiet = typeof firstVoyage === "function" && firstVoyage();
  const hint = !armed && still && !moorArmed && !quiet && (moorMoved || moorStillT > MOOR_ARM_WAIT);
  // a quick sale's tally is up: it already reports the sale, so the "stop to open the ledger" line waits for it to go
  const txt = hint ? t("moor_arm") : !armed ? "" : moor.t > 0 ? t(moor.t > MOOR_T * 0.5 ? "moor_open" : "moor_hold")
    : typeof tallyShowing === "function" && tallyShowing() ? "" : t("moor_go_" + device);
  if (moorEl.textContent !== txt) moorEl.textContent = txt;
  moorEl.classList.toggle("faint", hint);
  if (moorEl.hidden === !!txt) moorEl.hidden = !txt;
  if (!armed || !still) return;
  const cam = S.cameras.main, px = (typeof VIEW !== "undefined" ? VIEW.dpr : 1) / cam.zoom;
  const r = shipRadius(player) + 22 * px, k = clamp(moor.t / MOOR_T, 0, 1), a0 = -Math.PI / 2;
  moorG.lineStyle(6 * px, 0x08222d, 0.55); moorG.strokeCircle(player.x, player.y, r);
  moorG.lineStyle(4 * px, 0xf0c766, 0.95); moorG.beginPath(); moorG.arc(player.x, player.y, r, a0, a0 + k * TAU); moorG.strokePath();
}
// The ledger (or the title) ends the visit; a pause only hides the ring and the prompt, and the count picks up after it.
onHook("frame", () => {
  if (docked) { if (moor.inside || !moorEl.hidden) moorReset(); return; }
  if (paused && !moorEl.hidden) { moorEl.hidden = true; if (moorG) moorG.clear(); }
});
