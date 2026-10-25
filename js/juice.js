"use strict";
// ---------- Juice: what a hit, a kill and a broadside feel like ----------
// Hooks from the core (one line each): juiceHit(s, ball) and playerRecoil(rx, ry) from js/combat.js, killCard(s) from
// sink(), magazineBurst(s) from vfxSink (js/vfx.js), kickApply(s) from vfxShip. DOM payoffs (flyers, tally, banners)
// live in js/juice-ui.js. Everything here is short-lived and skipped off screen, so a brawl costs what the camera sees.
Object.assign(STR.en, {
  fDouble: "Double!", fMassacre: "Broadside Massacre!", fStreakX: "streak ×{x}", bountyClaimed: "Bounty claimed",
});
Object.assign(STR.zh, {
  fDouble: "雙殺！", fMassacre: "橫掃千軍！", fStreakX: "連勝 ×{x}", bountyClaimed: "懸賞到手",
});
const KICK_MS = 120;          // knockback and recoil ease back over this long
const HIT_STOP = 0.025, MULTI_STOP = 0.1;
const MULTI_MS = 4000;        // player sinks this close together make a Double / Massacre
const BOSS_SLOW = 0.3;        // a boss goes down at this time scale for BOSS_SLOW_S (the finale's flagship BOSS_SLOW_FINAL_S)
const BOSS_SLOW_S = 1.0, BOSS_SLOW_FINAL_S = 1.5;   // 0.6 s was ~180 ms of game time: too short to read, or to clip
let killTimes = [], slowOn = false;
const J = {};

onHook("ready", () => {
  J.burst = S.add.particles(0, 0, "fx-soft", { emitting: false, lifespan: { min: 300, max: 620 }, speed: { min: 120, max: 260 },
    scale: { start: 0.95, end: 0.15 }, alpha: { start: 1, end: 0 }, tint: [0xfff0b0, 0xffb040, 0xff6a2a], blendMode: "ADD",
    maxAliveParticles: vfxCap(70) }).setDepth(8.5);
});

// ---------- knockback ----------
// A visual offset on the sprite only (step() re-places it from s.x / s.y every frame), so physics never moves.
function kickStart(s, dx, dy, rad) { s.kick = { x: dx, y: dy, r: rad, t0: S.time.now }; }
function kickApply(s) {
  const k = 1 - (S.time.now - s.kick.t0) / KICK_MS;
  if (k <= 0 || !s.spr || !s.spr.active) { s.kick = null; return; }
  const e = k * k;
  s.spr.x += s.kick.x * e; s.spr.y += s.kick.y * e; s.spr.rotation += s.kick.r * e;
}
// Every player hit (not the killing one: that is the kill card's): a tiny freeze, the hull shoved along the ball and rolled 2°.
function juiceHit(s, ball) {
  if (!s.alive || !s.spr) return;
  vfxHitStop(HIT_STOP);
  let vx = ball ? ball.vx : s.x - player.x, vy = ball ? ball.vy : s.y - player.y;
  const d = Math.hypot(vx, vy) || 1; vx /= d; vy /= d;
  const side = Math.sign(Math.cos(s.rot) * vy - Math.sin(s.rot) * vx) || 1;   // rolls away from the side it was struck on
  kickStart(s, vx * 3.5, vy * 3.5, side * 2 * Math.PI / 180);
}
// The player's hull kicks 2 px away from the side that fired (rx, ry: summed away-from-muzzle directions).
function playerRecoil(rx, ry) {
  const d = Math.hypot(rx, ry);
  if (d < 0.3 || !player.alive) return;   // both broadsides at once: no net shove
  kickStart(player, rx / d * 2, ry / d * 2, 0);
}

// ---------- the kill: a powder-magazine burst ----------
function magazineBurst(s) {
  const a = s.art || SHIP_ART.sloop, x = s.x, y = s.y;
  if (typeof vnBlast !== "function" || !vnBlast(s)) {   // the picked C chain blast (js/vfx-new.js); the old burst only if its pool is not up
    J.burst && J.burst.explode(vfxCap(18), x, y);
    FX.flame.explode(vfxCap(10), x, y);
    const f = S.add.image(x, y, "fx-soft").setDepth(8.8).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa040).setDisplaySize(a.len * 3, a.len * 3);
    S.tweens.add({ targets: f, scale: f.scale * 1.3, alpha: 0, duration: 140, ease: "Quad.easeOut", onComplete: () => f.destroy() });
    for (let i = 0, n = Math.random() < 0.5 ? 2 : 3; i < n; i++) spar(x, y, a);
    for (let i = 0; i < 4; i++) S.time.delayedCall(i * 90, () => { FX.tint = 0x2a2420; FX.dmg.emitParticleAt(x + rand(-8, 8), y + rand(-8, 8), 2); });   // dark smoke column
  }
  screenFlash();   // js/juice-ui.js
  sfx("magazine", { x, y });
}
// a mast or yard thrown clear, spinning, then gone under
function spar(x, y, a) {
  const ang = rand(0, TAU), d = rand(0.5, 1.1) * a.len, k = 1 / artResOf("fx-plank");
  const p = S.add.image(x, y, "fx-plank").setDepth(8.4).setRotation(rand(0, TAU)).setScale(k * rand(2, 2.8), k * rand(1, 1.3)).setTint(0x6b4a2a);
  S.tweens.add({ targets: p, x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d, angle: p.angle + rand(360, 720) * (Math.random() < 0.5 ? -1 : 1),
    duration: 650, ease: "Cubic.easeOut" });
  S.tweens.add({ targets: p, alpha: 0, scaleX: p.scaleX * 0.6, scaleY: p.scaleY * 0.6, delay: 450, duration: 450, ease: "Quad.easeIn", onComplete: () => p.destroy() });
}

// ---------- the kill card: one big word at the hull, then its pay as one line that flies to the HUD ----------
function popText(x, y, str, color, size) {
  const txt = worldText(x, y, str, { fontFamily: UI_FONT, fontSize: size + "px", fontStyle: "700", color, stroke: "#0b2530", strokeThickness: 5 })
    .setOrigin(0.5).setDepth(10.2);
  const lk = txt.scaleX;
  txt.setScale(lk * 1.4);
  S.tweens.add({ targets: txt, scale: lk, duration: 160, ease: "Back.easeOut" });
  return txt;
}
function fadeUp(txt, delay) {
  S.tweens.add({ targets: txt, y: txt.y - 22 * labelScale(), alpha: 0, delay, duration: 520, ease: "Cubic.easeIn", onComplete: () => txt.destroy() });
}
function payLine(pay) {
  if (pay.streak == null) return "";
  if (typeof streakQuiet === "function" && streakQuiet()) return pay.gold > 0 ? `+${fmt(pay.gold)}` : "";   // kill #1: no jargon (js/notify-order.js)
  const x = t("fStreakX", { x: (1 + pay.streak).toFixed(1) });
  return pay.gold > 0 ? `+${fmt(pay.gold)} · ${x}` : x;
}
function killCard(s) {
  const now = S.time.now, lk = labelScale(), pay = s.pay || {};
  killTimes = [...killTimes.filter(t0 => now - t0 < MULTI_MS), now];
  const n = killTimes.length;
  if (n >= 2) vfxHitStop(MULTI_STOP);
  if (n >= 3) runHook("moment", "massacre");   // js/replay.js
  if (onScreen(s.x, s.y, 60) && !s.boss) {   // a boss gets its own name card (bossMoment)
    const word = n >= 3 ? "fMassacre" : n === 2 ? "fDouble" : "fSunk";
    if (J.word && J.word.active) { S.tweens.killTweensOf(J.word); J.word.destroy(); }   // one big word on screen at a time: a Double replaces the Sunk!
    fadeUp(J.word = popText(s.x, s.y - 26 * lk, t(word), n >= 2 ? "#ffd04a" : "#f0c766", n >= 3 ? 30 : n === 2 ? 27 : 24), 850);
  }
  const line = s.boss ? "" : payLine(pay);   // a boss's pay is its Captain's Chest, on the name card
  if (!line) return;
  S.time.delayedCall(250, () => {   // the sink reads first
    const y = s.y + (14 + 18 * Math.min(n - 1, 3)) * labelScale(), txt = popText(s.x, y, line, pay.gold > 0 ? "#ffe08a" : "#9fe0a0", 16);
    S.time.delayedCall(560, () => {
      if (!txt.active) return;
      const from = worldToCss(txt.x, txt.y);   // js/juice-ui.js
      txt.destroy();
      flyTo(from, pay.gold > 0 ? "gold" : streakTarget(), line, pay.gold > 0 ? "jfly-gold" : "jfly-streak");
    });
  });
}

// ---------- a boss goes down: slow motion, the camera leans in, the captain's name ----------
onHook("sunk", (s, killer) => {
  if (!s.boss) return;
  const paid = killer === player || (typeof bossHitAt === "number" && typeof ASSIST_MS === "number" && S.time.now - bossHitAt < ASSIST_MS);
  if (!paid) return;
  const b = typeof findBounty === "function" ? findBounty(s.boss) : null, sec = b && b.final ? BOSS_SLOW_FINAL_S : BOSS_SLOW_S;
  slowMo(sec, BOSS_SLOW);
  if (SETTINGS.shake) { vfxPunch(0.09); leanToward(s, sec); }
  bossCard(b ? bossName(b) : "");   // js/juice-ui.js
});
function slowMo(sec, k) {
  vfxSlowMo(sec, k);
  S.tweens.timeScale = k;
  for (const o of S.children.list) if (o instanceof Phaser.GameObjects.Particles.ParticleEmitter) o.timeScale = k;
  slowOn = true;
}
// The slow ends with the simulation's own count (js/vfx.js), which stands still while paused, so a pause neither ends
// it early nor stretches it; docking (or the title) ends it at once, as the ledger has no use for slow tweens.
onHook("frame", () => {
  if (!slowOn || (vfxSlowLeft() > 0 && !docked)) return;
  slowOn = false; S.tweens.timeScale = 1;
  for (const o of S.children.list) if (o instanceof Phaser.GameObjects.Particles.ParticleEmitter) o.timeScale = 1;
});
// The camera's follow point slides toward the wreck, then back to the player.
function leanToward(s, sec) {
  const cam = S.cameras.main, dx = player.x - s.x, dy = player.y - s.y, d = Math.hypot(dx, dy), k = Math.min(0.45, 180 / Math.max(d, 1));
  const o = { k: 0 };
  S.tweens.add({ targets: o, k: 1, duration: 220, ease: "Quad.easeOut", yoyo: true, hold: sec * 1000 * BOSS_SLOW + 300,   // (tweens run at the slow scale)
    onUpdate: () => cam.setFollowOffset(dx * k * o.k, dy * k * o.k), onComplete: () => cam.setFollowOffset(0, 0) });
}

// ---------- plunder crates: bigger, with a gold glint and a soft ring on the water ----------
const glints = new Map();
onHook("frame", () => {
  if (!S || typeof crates === "undefined") return;
  for (const c of crates) if (!c.wreck && !glints.has(c) && c.spr.active) {
    c.spr.setScale(1.6);
    glints.set(c, { g: S.add.image(c.x, c.y, "fx-soft").setDepth(2.05).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd36a),
      r: S.add.image(c.x, c.y, "fx-ring").setDepth(1.95).setTint(0xf0c766), ph: rand(0, TAU) });
  }
  const now = S.time.now / 1000;
  for (const [c, o] of glints) {
    if (!c.spr.active) { o.g.destroy(); o.r.destroy(); glints.delete(c); continue; }
    const w = 0.5 + 0.5 * Math.sin(now * 4 + o.ph), a = c.spr.alpha;
    o.g.setPosition(c.spr.x + 4, c.spr.y - 6).setScale(0.35 + 0.4 * w).setAlpha((0.25 + 0.6 * w * w) * a);
    o.r.setPosition(c.x, c.y).setScale(0.6 + 0.08 * Math.sin(now * 2 + o.ph)).setAlpha(0.28 * a);
  }
});
