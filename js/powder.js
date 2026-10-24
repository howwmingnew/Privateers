"use strict";
// ---------- Powder-magazine crits ----------
// A rake (a ball along the hull's axis, js/arsenal.js) from the player's guns blows the target's magazine 1 time in
// POWDER_CHANCE. An ordinary ship goes up outright; a boss only takes POWDER_BOSS_FRAC of its hull and lives. The blast
// hurts every other ship in POWDER_R, the player included (never to the last hit point), with a short hit-stop, a ring
// and a "Magazine!" word. Never during the first voyage's tutorial. Called from onHit() (js/arsenal.js).
Object.assign(STR.en, { fPowder: "Magazine explosion!" });
Object.assign(STR.zh, { fPowder: "火藥庫爆炸！" });
const POWDER_STOP = 0.12;   // hit-stop (s), longer than an ordinary kill's

// Does this hit blow the magazine? roll: a number in [0, 1).
const powderTrigger = ({ rake, byPlayer, fixed, tutorial, roll }) => !!(rake && byPlayer && !fixed && !tutorial && roll < POWDER_CHANCE);
// Damage the crit does to its own target: a boss is hurt hard but left on 1 hp, anything else is finished.
const powderSelfDmg = (s, dmg) => s.boss ? Math.max(dmg, Math.min(s.maxHp * POWDER_BOSS_FRAC, s.hp - 1)) : Math.max(dmg, s.hp);
// Damage the blast does to a bystander `d` px from it: the kind's share of max hull, fading to 40% at the rim.
// The player is never killed by it (their own gunnery shouldn't end the run).
function powderSplash(t, d) {
  const share = t.isPlayer ? POWDER_SPLASH.player : t.boss ? POWDER_SPLASH.boss : POWDER_SPLASH.ai;
  const dmg = t.maxHp * share * (1 - 0.6 * clamp(d / POWDER_R, 0, 1));
  return t.isPlayer || t.boss ? Math.min(dmg, t.hp - 1) : dmg;
}

// The hook: returns the damage `s` takes from this ball (more, if its magazine goes).
function powderStrike(s, dmg, ball, src) {
  if (!ball || !ball.fromPlayer || src !== player || s.isPlayer) return dmg;
  const rake = Math.abs(Math.cos(Math.atan2(ball.vy, ball.vx) - s.rot)) > RAKE_COS;
  if (!powderTrigger({ rake, byPlayer: true, fixed: s.fixed, tutorial: !save.tutorialDone, roll: Math.random() })) return dmg;
  powderBlast(s);
  return powderSelfDmg(s, dmg);
}
function powderBlast(s) {
  const near = [...enemies.filter(e => e.alive && !e.fixed && e !== s), ...(player.alive && !docked ? [player] : [])]
    .filter(t => dist(t, s) < POWDER_R);
  powderFx(s);
  for (const t of near) {
    const d = powderSplash(t, dist(t, s));
    if (d > 0) hurt(t, d, 0, t.isPlayer ? s : player);   // the crit is the player's: its kills pay out (js/plunder.js)
  }
}
function powderFx(s) {
  vfxHitStop(POWDER_STOP);
  camShake(280, 0.011);
  Snd.play("magazine", { x: s.x, y: s.y });
  if (!onScreen(s.x, s.y, POWDER_R)) return;
  if (s.boss && typeof magazineBurst === "function") magazineBurst(s);   // a lethal one gets its own at the sink
  const lk = labelScale(), x = s.x, y = s.y;
  J.burst && J.burst.explode(vfxCap(24), x, y);
  FX.flame.explode(vfxCap(12), x, y);
  const flash = S.add.image(x, y, "fx-soft").setDepth(8.9).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb050).setDisplaySize(POWDER_R * 1.4, POWDER_R * 1.4);
  S.tweens.add({ targets: flash, scale: flash.scale * 1.6, alpha: 0, duration: 260, ease: "Quad.easeOut", onComplete: () => flash.destroy() });
  const ring = S.add.image(x, y, "fx-ring").setDepth(8.7).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd08a).setScale(0.2).setAlpha(0.9);
  S.tweens.add({ targets: ring, scale: POWDER_R / (ring.width * 26 / 64), alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
  screenFlash();
  if (typeof popText === "function") fadeUp(popText(x, y - 62 * lk, t("fPowder"), "#ff9a4a", 28), 900);
}
