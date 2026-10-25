"use strict";
// ---------- Shot effects: fires, chain shot, raking ----------
// onHit() runs first thing in hurt(): it adjusts the damage (raking a man-o'-war along its length), lights fires,
// tears rigging, and tells merchants and convoys who fired on them. tickStatus() runs for every ship every frame.
Object.assign(STR.en, {
  g_chain: "Chain shot", gf_chain: "Chain-shot Gun", gn_chain: "Cuts rigging: catches runners and fireships",
  gn_fire: "Each hit lights a fire; up to 4 burn at once",
  chainFx: " · target <b>−40%</b> speed, <b>−30%</b> turn for {n} s", fRaked: "Raked!", fChain: "Rigging cut!",
});
Object.assign(STR.zh, {
  g_chain: "鏈彈砲", gf_chain: "鏈彈砲", gn_chain: "打斷索具：追得上逃跑的船和火船",
  gn_fire: "每次命中都會點起一處火；最多同時燒 4 處",
  chainFx: " · 目標速度 <b>−40%</b>、轉向 <b>−30%</b>，持續 {n} 秒", fRaked: "縱射！", fChain: "索具斷了！",
});
const RAKE_COS = Math.cos(0.45);   // a ball within ~26 degrees of the hull's axis rakes it from bow or stern

function onHit(s, dmg, burn, src, ball) {
  const byPlayer = src === player, seen = byPlayer && onScreen(s.x, s.y);
  if (ball && s.A && s.A.rake && Math.abs(Math.cos(Math.atan2(ball.vy, ball.vx) - s.rot)) > RAKE_COS) {
    dmg *= s.A.rake;
    if (seen) floatText(s.x, s.y - 54, t("fRaked"), "#ffd36a", 15);
  }
  if (typeof powderStrike === "function") dmg = powderStrike(s, dmg, ball, src);   // a rake may blow the magazine (js/powder.js)
  if (typeof gxHurt === "function") dmg = gxHurt(s, dmg, src, ball);   // armor, long-range aim, marks, a legendary's tricks (js/gear-fx.js)
  if (burn) { addBurn(s, burn, src); if (ball && typeof vnSpill === "function") vnSpill(ball.x, ball.y); }   // the oil burning on the water (js/vfx-new.js)
  if (ball && ball.chain) {
    if (!(s.chainT > 0) && seen) floatText(s.x, s.y - 54, t("fChain"), "#d8e4e8", 14);
    s.chainT = ball.chainT || CHAIN_T;   // a gun's own affixes may lengthen it (js/gear-fx.js)
  }
  if (!s.isPlayer && src && src !== s && src.alive !== false) {
    if (s.merchant && src.faction !== "merchant") panic(s, src);
    convoyAlarm(s, src);
  }
  return dmg;
}
// Fires stack: each one burns `dps` for BURN_T s; past BURN_MAX the oldest goes out. Setting s.burnT = 0 (docking,
// respawning) puts them all out.
function addBurn(s, dps, src) {
  if (s.isPlayer) dps *= gearCut("fire");   // fire-resistant planking and stores (js/gear-core.js)
  const b = s.burns || (s.burns = []);
  if (!(s.burnT > 0)) b.length = 0;
  if (b.length >= BURN_MAX) b.shift();
  b.push({ t: BURN_T, dps });
  s.burnT = BURN_T; s.burnSrc = src;
}
function tickStatus(s, dt) {
  if (s.chainT > 0) s.chainT -= dt;
  if (s.dragT > 0) s.dragT -= dt;
  const b = s.burns;
  if (!b || !b.length) return;
  if (!(s.burnT > 0)) { b.length = 0; s.burnDps = 0; return; }
  let dps = 0, left = 0;
  for (let i = b.length - 1; i >= 0; i--) { const f = b[i]; f.t -= dt; if (f.t <= 0) b.splice(i, 1); else { dps += f.dps; left = Math.max(left, f.t); } }
  s.burnT = left; s.burnDps = dps;
  if (!dps) return;
  s.hp -= dps * dt;   // the flames themselves are drawn by vfxShip() while s.burnT > 0
  s.burnSnd = (s.burnSnd || 0) - dt; if (s.burnSnd <= 0) { s.burnSnd = rand(0.2, 0.45); Snd.play("burn", { x: s.x, y: s.y }); }
  if (s.hp <= 0) sink(s, s.burnSrc);
}
