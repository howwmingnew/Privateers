"use strict";
// ---------- Boarding: a ship that struck her colours can be taken by lying alongside ----------
// Stay within BOARD_GAP of her hull, slower than BOARD_REL_V relative to her, for BOARD_T seconds (js/config.js). Drift off and the
// grapples slip: progress drains. When it fills, the crew swarms over: a share of her loot is paid in gold at once
// (BOARD_GOLD_K, no hold space needed), she may yield one of her guns (BOARD_GUN_CHANCE by faction) into the gun store
// (js/gunbay.js), and she is scuttled behind you (counts as a sinking for the streak). A full gun store (MAX_STORE) never
// eats the gun: it is paid in gold instead. Not boardable, struck or not: bosses (rematch captains too), a campaign
// captain's escorts, a convoy's escort brig, the tutorial's target, fireships, shore batteries. Warships may strike too
// (js/strike.js). Rolls use Math.random, the same in a daily run as in an ordinary sortie.
// The prize is an ordinary gun item from prizeGun(); the rarity of #38 joins there.
Object.assign(STR.en, {
  boardHint: "Stay alongside to board", fBoarded: "Boarded!", fBoardGold: "+{n} gold",
  toastPrizeGun: "Prize gun taken: {gun}, Lv {lv}. It waits in the gun store.",
  toastPrizeSold: "Gun store full: the prize gun sold for {n} gold instead.",
});
Object.assign(STR.zh, {
  boardHint: "貼緊對方船舷就能登船", fBoarded: "登船成功！", fBoardGold: "+{n} 金幣",
  toastPrizeGun: "奪得火砲：{gun}，Lv {lv}，已放進火砲庫存。",
  toastPrizeSold: "火砲庫存已滿，奪來的砲改賣了 {n} 金幣。",
});

// Can this ship be boarded at all (struck, and not one of the exceptions)?
const boardable = s => !!s && s.alive && s.struck && !s.isPlayer && !s.boss && !s.escortOf && !s.escort && !s.fixed
  && !(s.A && s.A.boom) && !s.boarded && !(typeof tut !== "undefined" && s === tut.target);
// Boarding progress in seconds after dt: it fills while alongside and drains BOARD_DECAY times faster otherwise.
const boardTick = (t, isAlongside, dt) => clamp(t + (isAlongside ? dt : -dt * BOARD_DECAY), 0, BOARD_T);
// Alongside: the hulls nearly touching and no great speed between them.
const alongside = (p, e) => dist(p, e) < shipRadius(p) + shipRadius(e) + BOARD_GAP
  && Math.hypot((p.vx || 0) - (e.vx || 0), (p.vy || 0) - (e.vy || 0)) < BOARD_REL_V;

// The gun she yields, or null. r1 decides whether, r2 which gun (both 0..1). `s` needs faction and L.
function prizeGun(s, r1, r2) {
  const f = Object.hasOwn(BOARD_GUN_CHANCE, s.faction) ? s.faction : "merchant";
  if (!(r1 < BOARD_GUN_CHANCE[f])) return null;
  const w = BOARD_GUNS[f], ids = Object.keys(w).filter(id => Object.hasOwn(GUNS, id));
  let r = r2 * ids.reduce((a, id) => a + w[id], 0), pick = ids[0];
  for (const id of ids) { pick = id; if ((r -= w[id]) < 0) break; }
  return gunItem(pick, clamp(1 + Math.floor((Math.max(1, s.L || 1) - 1) / BOARD_LV_EVERY), 1, BOARD_LV_MAX));
}
const boardGold = s => Math.round((s.lootWas || 0) * BOARD_GOLD_K);
// Put a prize in a save: the gun store takes it, unless it is full, then it turns into gold. Returns { save, kind, gold }.
function claimPrize(sv, gun) {
  if (!gun) return { save: sv, kind: "none", gold: 0 };
  if ((sv.store || []).length < MAX_STORE) return { save: { ...sv, store: (sv.store || []).concat([gun]) }, kind: "gun", gold: 0 };
  const gold = Math.round(GUNS[gun.g].cost * gun.lv * BOARD_FULL_K);
  return { save: { ...sv, gold: sv.gold + gold }, kind: "sold", gold };
}

let board = { ship: null, t: 0 };
let boardG = null, boardTxt = null, boardTxtShown = "";
function boardReset() { board = { ship: null, t: 0 }; if (boardG) boardG.clear(); if (boardTxt) boardTxt.setVisible(false); }
// The nearest prize within the prompt's reach.
function boardCandidate() {
  let best = null, bd = BOARD_HINT_R;
  for (const e of enemies) { if (!boardable(e)) continue; const d = dist(player, e); if (d < bd) { best = e; bd = d; } }
  return best;
}
function boardRoll() { return Math.random(); }   // a function so the browser test can fix the rolls
function completeBoarding(e) {
  e.boarded = true;
  const gold = boardGold(e), p = claimPrize(save, prizeGun(e, boardRoll(), boardRoll()));
  const total = gold + p.gold;
  save = { ...p.save, gold: p.save.gold + gold };
  if (total > 0) statsGold(total);
  persist();
  floatText(e.x, e.y - 50, t("fBoarded"), "#f6f1e3", 20);
  if (gold > 0) floatText(e.x, e.y - 74, t("fBoardGold", { n: fmt(gold) }), "#f0c766", 17);
  const got = p.save.store[p.save.store.length - 1];
  if (p.kind === "gun") toast(t("toastPrizeGun", { gun: t("gf_" + got.g), lv: got.lv }));
  else if (p.kind === "sold") toast(t("toastPrizeSold", { n: fmt(p.gold) }));
  Snd.play("board", { x: e.x, y: e.y, gun: p.kind !== "none", amount: total });
  S.fx.spark.explode(18, e.x, e.y);
  hud(true);
  sink(e, player);   // she is scuttled: the usual loot (a warship's bounty) and the plunder streak follow
  boardReset();
}
function drawBoarding(e, k, px) {
  boardG ||= S.add.graphics().setDepth(9);
  boardG.clear();
  const r = shipRadius(e) + 16 * px, a0 = -Math.PI / 2;
  boardG.lineStyle(6 * px, 0x08222d, 0.55); boardG.strokeCircle(e.x, e.y, r);
  if (k <= 0) return;
  boardG.lineStyle(4 * px, 0xf6f1e3, 0.95); boardG.beginPath(); boardG.arc(e.x, e.y, r, a0, a0 + k * TAU); boardG.strokePath();
  const c = Math.cos(e.rot), sn = Math.sin(e.rot), hl = (e.hl ?? 28) * 0.7;   // grapple lines to both ends of her hull
  boardG.lineStyle(2.5 * px, 0x3a2412, 0.9);
  for (const s of [-1, 1]) { boardG.beginPath(); boardG.moveTo(player.x, player.y); boardG.lineTo(e.x + c * hl * s, e.y + sn * hl * s); boardG.strokePath(); }
}
function boardPrompt(e, show) {
  if (!boardTxt) boardTxt = labelText(S.add.text(0, 0, "", { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#f6f1e3", stroke: "#0b2530", strokeThickness: 4 }).setOrigin(0.5).setDepth(9));
  if (!show) { boardTxt.setVisible(false); return; }
  const txt = t("boardHint");
  if (txt !== boardTxtShown) { boardTxtShown = txt; boardTxt.setText(txt); }
  boardTxt.setPosition(e.x, e.y + 46 * labelScale()).setVisible(true);
}
onHook("frame", dt => {
  if (!player || docked || !player.alive) { if (board.ship || board.t) boardReset(); return; }
  if (paused) return;
  const e = boardCandidate();
  if (e) e.speed *= 0.6;   // a prize heaves to while the boarding party comes over
  if (board.ship !== e) board = { ship: e, t: 0 };
  if (!e) { boardPrompt(null, false); if (boardG) boardG.clear(); return; }
  board.t = boardTick(board.t, alongside(player, e), dt);
  if (board.t >= BOARD_T) { boardPrompt(null, false); completeBoarding(e); return; }
  const px = (typeof VIEW !== "undefined" ? VIEW.dpr : 1) / S.cameras.main.zoom;
  drawBoarding(e, board.t / BOARD_T, px);
  boardPrompt(e, board.t === 0);
});
onHook("sail", boardReset);
