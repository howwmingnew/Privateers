"use strict";
// ---------- Combat ----------
// AI gunnery: telegraphed volleys per side, chaser and fort battery (js/volley.js).
function fire(s, targets, dt) { enemyFire(s, targets, dt); }

// ---------- Player gunnery: straight aim lines, fire on release ----------
// Each cannon shoots straight out of its mount: bow guns forward, broadside guns perpendicular to the hull,
// stern guns aft. No auto-aim and no lead: the ball flies exactly along the line that was shown,
// so the player aims by turning the ship.
const AIM_SHOW_PAD = 1.15;   // aim lines appear when an enemy is within (range x this) of a mount's firing arc
let prevKeyActive = false, engagedPrev = false, releaseTips = 0;
function muzzle(s, m, i, n) {
  const a = s.rot + m.ang, p = s.rot + m.perp, off = n === 1 ? 0 : -m.span / 2 + m.span * i / (n - 1);
  return { x: s.x + Math.cos(p) * off + Math.cos(a) * m.out, y: s.y + Math.sin(p) * off + Math.sin(a) * m.out, a };
}
// Is an enemy inside this mount's firing arc? Only then are its aim lines shown and can it fire.
function mountEngaged(m) {
  const arr = player.guns[m.key];
  if (!arr.length) return false;
  const r = Math.max(...arr.map(g => g.range)) * AIM_SHOW_PAD, normal = player.rot + m.ang;
  return enemies.some(e => e.alive && dist(e, player) < r && Math.abs(angDiff(Math.atan2(e.y - player.y, e.x - player.x), normal)) < ARC);
}
// Would a straight shot from (x, y) at angle a, length len, pass through an enemy hull right now?
function lineHits(x, y, a, len) {
  const c = Math.cos(a), sn = Math.sin(a);
  for (const e of enemies) {
    if (!e.alive) continue;
    const ex = e.x - x, ey = e.y - y, along = ex * c + ey * sn;
    if (along < -30 || along > len + 30 || Math.abs(ex * sn - ey * c) > 45) continue;   // cheap reject
    for (let d = Math.max(0, along - 40); d <= Math.min(len, along + 40); d += 6) if (hitShip(e, x + c * d, y + sn * d)) return true;
  }
  return false;
}
// Fire every loaded cannon on each engaged mount. Called when the player lets go.
function playerFire() {
  if (paused || docked || !player.alive) return;
  let shots = 0;
  for (const mount of MOUNTS) {
    if (!mountEngaged(mount)) continue;
    const arr = player.guns[mount.key];
    arr.forEach((g, i) => {
      if (g.cd > 0) return;
      g.cd = g.interval;
      S.time.delayedCall(shots++ * 70, () => {          // a rolling broadside, not one blast
        if (!player.alive || paused) return;
        const m = muzzle(player, mount, i, arr.length), life = g.range / g.speed;   // each gun has its own ball speed
        balls.push({ spr: S.add.image(m.x, m.y, "ball").setDepth(7), x: m.x, y: m.y,
          vx: Math.cos(m.a) * g.speed, vy: Math.sin(m.a) * g.speed, life, life0: life, dmg: g.dmg, burn: g.burn, chain: g.chain, fromPlayer: true, owner: player });
        S.fx.smoke.emitParticleAt(m.x + Math.cos(m.a) * 6, m.y + Math.sin(m.a) * 6, 3);
        Snd.play("cannon", { pan: Math.cos(m.a) * 0.35 });
      });
    });
  }
  if (shots) S.cameras.main.shake(70, 0.002);
}

// ship hit test: capsule along the hull axis
function hitShip(s, x, y) {
  const dx = x - s.x, dy = y - s.y, c = Math.cos(s.rot), sn = Math.sin(s.rot);
  const hl = s.hl ?? 28, along = clamp(dx * c + dy * sn, -hl, hl);   // s.hl / s.hw: per-hull capsule (art, forts)
  return Math.hypot(dx - c * along, dy - sn * along) < (s.hw ?? 13);
}
function floatText(x, y, str, color, size = 16) {
  const txt = S.add.text(x, y, str, { fontFamily: UI_FONT, fontSize: size + "px", fontStyle: "700", color, stroke: "#0b2530", strokeThickness: 4 })
    .setOrigin(0.5).setDepth(10);
  S.tweens.add({ targets: txt, y: y - 34, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => txt.destroy() });
}
function hurt(s, dmg, burn, src, ball) {
  if (!s.alive) return;
  dmg = onHit(s, dmg, burn, src, ball);   // raking, fires, chain shot, merchants and convoys raising the alarm (js/arsenal.js)
  s.hp -= dmg;
  s.spr.setTint(0xffb4a0); S.time.delayedCall(90, () => s.spr && s.spr.clearTint());
  if (onScreen(s.x, s.y)) {
    const byPlayer = src === player;
    floatText(s.x + rand(-10, 10), s.y - 22, Math.round(dmg), s.isPlayer ? "#ff8a75" : byPlayer ? "#fff4d6" : "#a9c3cb", byPlayer || s.isPlayer ? 16 : 13);
  }
  Snd.play("hit", { x: s.x, y: s.y, big: s.isPlayer });
  if (!s.isPlayer && src) { s.attacker = src; s.angry = 8; s.ignore.delete(src); }
  if (s.isPlayer) S.cameras.main.shake(90, 0.004);
  if (s.hp <= 0) sink(s, src);
}
// A crate floating on the sea. AI loot is temporary; a player wreck is saved and never expires.
function addCrate(x, y, value, wreck) {
  const c = { spr: S.add.image(x, y, wreck ? "wreck" : "crate").setDepth(2), x, y, value, t: 0, wreck: wreck || null, label: null };
  if (wreck) c.label = S.add.text(x, y - 26, t("wreckLabel"), { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#ffd8cf", stroke: "#0b2530", strokeThickness: 4 })
    .setOrigin(0.5).setDepth(9);
  crates.push(c);
  return c;
}
let lastLost = 0;
function sink(s, killer) {
  if (!s.alive) return;
  s.alive = false; s.speed = 0; s.hp = 0;
  S.fx.spark.explode(26, s.x, s.y); S.fx.smoke.explode(14, s.x, s.y);
  Snd.play("sink", { x: s.x, y: s.y, big: s.isPlayer });
  if (s.isPlayer) Snd.play("defeat"); else if (killer === player) Snd.play("victory", { delay: 0.25 });
  if (s.badge) { s.badge.destroy(); s.badge = null; }
  S.tweens.add({ targets: s.spr, alpha: 0, scale: 0.6, angle: s.spr.angle + 25, duration: 1300, ease: "Quad.easeIn",
    onComplete: () => { if (!s.isPlayer) { s.spr.destroy(); s.dead = true; } } });
  if (s.isPlayer) {
    // half the hold stays where the ship went down, and survives closing the game; the plunder streak is lost
    lastLost = Math.round(cargo * WRECK_KEEP); streak = 0;
    if (lastLost > 0) { const w = { x: Math.round(s.x), y: Math.round(s.y), value: lastLost }; save.wrecks.push(w); addCrate(w.x, w.y, w.value, w); }
    cargo = 0; persist();
    toast(t(lastLost > 0 ? "toastSunkHalf" : "toastSunk"));
    S.time.delayedCall(1700, () => {
      cargo = 0;
      Object.assign(player, { x: PORT.x + 140, y: PORT.y, rot: 0, speed: 0, alive: true, burnT: 0 });
      player.spr.setAlpha(1).setScale(1).setAngle(0).setPosition(player.x, player.y);
      dock("sunk");
    });
  } else {
    lootDrop(s, killer);     // whoever sank it, the loot floats here (not saved); the player's kills pay bounty + streak
    if (killer === player) { save.sunk++; floatText(s.x, s.y - 30, t("fSunk"), "#f0c766", 20); }
  }
}
