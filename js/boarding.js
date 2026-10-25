"use strict";
// ---------- Boarding: a ship that struck her colours can be taken by lying alongside ----------
// Stay within BOARD_GAP of her hull, slower than BOARD_REL_V relative to her, for BOARD_T seconds (js/config.js). Drift off and the
// grapples slip: progress drains. When it fills, the crew swarms over: a share of her loot is paid in gold at once
// (BOARD_GOLD_K, no hold space needed), she may yield one of her guns (BOARD_GUN_CHANCE by faction) into the gun store
// (js/gunbay.js), and she is scuttled behind you (counts as a sinking for the streak). A full gun store (MAX_STORE) never
// eats the gun: it is paid in gold instead. Not boardable, struck or not: bosses (rematch captains too), a campaign
// captain's escorts, a convoy's escort brig, the tutorial's target, fireships, shore batteries. Warships may strike too
// (js/strike.js). Rolls use Math.random, the same in a daily run as in an ordinary sortie.
// The prize is an ordinary gun item from prizeGun(); with a third roll it carries a rarity, item level and affixes (#38, js/gear-core.js gearPrize).
// A struck prize within reach is grappled (#69, the spring in js/grapple.js): the rope reels the flagship alongside and a full-speed
// run straight away parts it; boarding finished, or the prize sunk, ends the grapple.
Object.assign(STR.en, {
  boardHint: "Stay alongside to board", fBoarded: "Boarded!", fBoardGold: "+{n} gold", fHook: "Grappled", fSnap: "Rope parted!",
  toastPrizeGun: "Prize gun taken: {gun}, Lv {lv}. It waits in the gun store.",
  toastPrizeSold: "Gun store full: the prize gun sold for {n} gold instead.",
});
Object.assign(STR.zh, {
  boardHint: "貼緊對方船舷就能登船", fBoarded: "登船成功！", fBoardGold: "+{n} 金幣", fHook: "抓鉤勾上", fSnap: "繩索斷了！",
  toastPrizeGun: "奪得火砲：{gun}，Lv {lv}，已放進火砲庫存。",
  toastPrizeSold: "火砲庫存已滿，奪來的砲改賣了 {n} 金幣。",
});

// Can this ship be boarded at all (struck, and not one of the exceptions)?
const boardable = s => !!s && s.alive && s.struck && !s.isPlayer && !s.boss && !s.escortOf && !s.escort && !s.fixed
  && !(s.A && s.A.boom) && !s.boarded && !(typeof tut !== "undefined" && s === tut.target);
// Boarding progress in seconds after dt: it fills while alongside and drains BOARD_DECAY times faster otherwise.
const boardTick = (t, isAlongside, dt) => clamp(t + (isAlongside ? dt : -dt * BOARD_DECAY), 0, BOARD_T);
// Alongside: the hulls nearly touching and no great speed between them.
// `pv` is the grapple's pull on the flagship (js/grapple.js): it counts toward the relative speed, as the hull really moves by it.
const alongside = (p, e, pv) => dist(p, e) < shipRadius(p) + shipRadius(e) + BOARD_GAP
  && Math.hypot((p.vx || 0) + (pv ? pv.x : 0) - (e.vx || 0), (p.vy || 0) + (pv ? pv.y : 0) - (e.vy || 0)) < BOARD_REL_V;

// The gun she yields, or null. r1 decides whether, r2 which gun, r3 its rarity (all 0..1). `s` needs faction and L (and ring, for the item level).
function prizeGun(s, r1, r2, r3) {
  const f = Object.hasOwn(BOARD_GUN_CHANCE, s.faction) ? s.faction : "merchant";
  if (!(r1 < BOARD_GUN_CHANCE[f])) return null;
  const w = BOARD_GUNS[f], ids = Object.keys(w).filter(id => Object.hasOwn(GUNS, id));
  let r = r2 * ids.reduce((a, id) => a + w[id], 0), pick = ids[0];
  for (const id of ids) { pick = id; if ((r -= w[id]) < 0) break; }
  const gun = gunItem(pick, clamp(1 + Math.floor((Math.max(1, s.L || 1) - 1) / BOARD_LV_EVERY), 1, BOARD_LV_MAX));
  return r3 == null || typeof gearPrize !== "function" ? gun : gearPrize(gun, f, s.ring || 1, gearTierOf(save.ship), r3);
}
const boardGold = s => Math.round((s.lootWas || 0) * BOARD_GOLD_K);
// Put a prize in a save: the gun store takes it, unless it is full, then it turns into gold. Returns { save, kind, gold }.
function claimPrize(sv, gun) {
  if (!gun) return { save: sv, kind: "none", gold: 0 };
  if ((sv.store || []).length < MAX_STORE) return { save: { ...sv, store: (sv.store || []).concat([gun]) }, kind: "gun", gold: 0 };
  const gold = Math.round(GUNS[gun.g].cost * gun.lv * BOARD_FULL_K);
  return { save: { ...sv, gold: sv.gold + gold }, kind: "sold", gold };
}

const NO_PULL = { x: 0, y: 0 };
const freshBoard = ship => ({ ship, t: 0, hooked: false, pv: NO_PULL, strain: 0 });
// ship: the prize in reach; t: boarding progress (s); hooked: the grapple is on her; pv: its pull (px/s); strain: seconds of full-speed run
let board = freshBoard(null);
let rehookAt = 0;   // after a parted rope, the hooks cannot bite again until this time (s)
const boardLog = { hooks: 0, snaps: 0 };   // how often the hooks bit and the rope parted this session (the browser test reads it)
let boardG = null, boardTxt = null, boardTxtShown = "";
function boardReset() { board = freshBoard(null); if (boardG) boardG.clear(); if (boardTxt) boardTxt.setVisible(false); }
// The nearest prize within the prompt's reach.
function boardCandidate() {
  let best = null, bd = BOARD_HINT_R;
  for (const e of enemies) { if (!boardable(e)) continue; const d = dist(player, e); if (d < bd) { best = e; bd = d; } }
  return best;
}
function boardRoll() { return Math.random(); }   // a function so the browser test can fix the rolls
function completeBoarding(e) {
  e.boarded = true;
  const gold = boardGold(e), p = claimPrize(save, prizeGun(e, boardRoll(), boardRoll(), boardRoll()));
  const total = gold + p.gold;
  save = { ...p.save, gold: p.save.gold + gold };
  if (total > 0) statsGold(total);
  persist();
  floatText(e.x, e.y - 50, t("fBoarded"), "#f6f1e3", 20);
  if (gold > 0) floatText(e.x, e.y - 74, t("fBoardGold", { n: fmt(gold) }), "#f0c766", 17);
  const got = p.save.store[p.save.store.length - 1];
  if (p.kind === "gun") toast(t("toastPrizeGun", { gun: t("gf_" + got.g) + (got.r ? ` [${t("gr_" + got.r)}]` : ""), lv: got.lv }));
  else if (p.kind === "sold") toast(t("toastPrizeSold", { n: fmt(p.gold) }));
  Snd.play("board", { x: e.x, y: e.y, gun: p.kind !== "none", amount: total });
  S.fx.spark.explode(18, e.x, e.y);
  hud(true);
  sink(e, player);   // she is scuttled: the usual loot (a warship's bounty) and the plunder streak follow
  boardReset();
}
// The grapple lines to both ends of her hull; the rope darkens toward red as the strain nears BOARD_SNAP_T.
const ropeEnds = e => { const c = Math.cos(e.rot), sn = Math.sin(e.rot), hl = (e.hl ?? 28) * 0.7; return [-1, 1].map(s => ({ x: e.x + c * hl * s, y: e.y + sn * hl * s })); };
const ropeColour = f => Phaser.Display.Color.GetColor(Math.round(0x3a + (0xd9 - 0x3a) * f), Math.round(0x24 + (0x53 - 0x24) * f), Math.round(0x12 + (0x3a - 0x12) * f));
function drawBoarding(e, k, px, strain) {
  boardG ||= S.add.graphics().setDepth(9);
  boardG.clear();
  const r = shipRadius(e) + 16 * px, a0 = -Math.PI / 2;
  if (k > 0) {
    boardG.lineStyle(6 * px, 0x08222d, 0.55); strokeRing(boardG, e.x, e.y, r);
    boardG.lineStyle(4 * px, 0xf6f1e3, 0.95); strokeArc(boardG, e.x, e.y, r, a0, a0 + k * TAU);
  }
  if (!board.hooked) return;
  const f = clamp(strain / BOARD_SNAP_T, 0, 1);
  boardG.lineStyle((2.5 + 1.5 * f) * px, ropeColour(f), 0.9);
  for (const q of ropeEnds(e)) { boardG.beginPath(); boardG.moveTo(player.x, player.y); boardG.lineTo(q.x, q.y); boardG.strokePath(); }
}
// The hooks bite: a thud and a spark at each end of her rail.
function hookOn(e) {
  board = { ...freshBoard(e), t: board.t, hooked: true };
  for (const q of ropeEnds(e)) S.fx.spark.explode(5, q.x, q.y);
  boardLog.hooks++; Snd.play("grapple", { x: e.x, y: e.y });
  floatText(e.x, e.y - 50, t("fHook"), "#f6f1e3", 15);
}
// The rope parts: both halves whip back and fade, a crack, a spark, and the hooks stay off the rail for BOARD_REHOOK_S.
function ropeSnap(e) {
  const ends = ropeEnds(e), from = { x: player.x, y: player.y }, g = S.add.graphics().setDepth(9).setName("ropeSnap"), px = (typeof VIEW !== "undefined" ? VIEW.dpr : 1) / S.cameras.main.zoom;
  boardLog.snaps++; Snd.play("ropeSnap", { x: player.x, y: player.y, big: true });
  S.fx.spark.explode(10, (from.x + e.x) / 2, (from.y + e.y) / 2);
  floatText(player.x, player.y - 44, t("fSnap"), "#f0b3a4", 18);
  S.tweens.addCounter({ from: 0, to: 1, duration: 520, ease: "Cubic.easeOut",
    onUpdate: tw => {
      const k = tw.getValue(), keep = 0.5 * (1 - k);   // each half shrinks back toward its own end
      g.clear(); g.lineStyle(3 * px, 0x8c5a32, 1 - k);
      for (const q of ends) {
        g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(from.x + (q.x - from.x) * keep, from.y + (q.y - from.y) * keep); g.strokePath();
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - (q.x - from.x) * keep, q.y - (q.y - from.y) * keep); g.strokePath();
      }
    },
    onComplete: () => g.destroy() });
  rehookAt = S.time.now / 1000 + BOARD_REHOOK_S;
  board = freshBoard(board.ship);
}
function boardPrompt(e, show) {
  if (!boardTxt) boardTxt = labelText(S.add.text(0, 0, "", { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#f6f1e3", stroke: "#0b2530", strokeThickness: 4 }).setOrigin(0.5).setDepth(9));
  if (!show) { boardTxt.setVisible(false); return; }
  const txt = t("boardHint");
  if (txt !== boardTxtShown) { boardTxtShown = txt; boardTxt.setText(txt); }
  boardTxt.setPosition(e.x, e.y + 46 * labelScale()).setVisible(true);
}
// The hooks and the spring (js/grapple.js) act in the frame loop, after the hulls have moved. The grapple ends when she is boarded,
// sinks or stops being a prize (boardable), when the flagship is lost or docks (boardReset), or when the rope parts (ropeSnap).
onHook("frame", dt => {
  if (!player || docked || !player.alive) { if (board.ship || board.t || board.hooked) boardReset(); return; }
  if (paused) return;
  const e = board.hooked && boardable(board.ship) ? board.ship : boardCandidate();   // a hooked prize stays in reach however far the rope runs
  if (e) e.speed *= 0.6;   // a prize heaves to while the boarding party comes over
  if (board.ship !== e) board = freshBoard(e);
  if (!e) { boardPrompt(null, false); if (boardG) boardG.clear(); return; }
  if (!board.hooked && S.time.now / 1000 >= rehookAt && canHook(player, e)) hookOn(e);
  if (board.hooked) {
    const pv = grapplePull(board.pv, player, e, dt), strain = grappleStrain(board.strain, player, e, dt);
    board = { ...board, pv, strain };
    player.x = clamp(player.x + pv.x * dt, 60, W - 60); player.y = clamp(player.y + pv.y * dt, 60, H - 60);   // not part of vx / vy: no collision reads it
    if (grappleParts(strain, player, e)) { boardPrompt(null, false); ropeSnap(e); if (boardG) boardG.clear(); return; }
  }
  board.t = boardTick(board.t, alongside(player, e, board.hooked ? board.pv : null), dt);
  if (board.t >= BOARD_T) { boardPrompt(null, false); completeBoarding(e); return; }
  const px = (typeof VIEW !== "undefined" ? VIEW.dpr : 1) / S.cameras.main.zoom;
  drawBoarding(e, board.t / BOARD_T, px, board.strain);
  boardPrompt(e, board.t === 0);
});
onHook("sail", boardReset);
