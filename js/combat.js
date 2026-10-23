"use strict";
// ---------- Combat ----------
function fire(s, targets, dt) {
  for (const side of [-1, 1]) {
    const arr = side < 0 ? s.guns.left : s.guns.right;
    const normal = s.rot + side * Math.PI / 2;
    const n = arr.length;
    arr.forEach((g, i) => {
      g.cd -= dt; if (g.cd > 0) return;
      let best = null, bd = 1e9;
      for (const t of targets) {
        if (!t.alive) continue;
        const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy);
        if (d > g.range || d >= bd) continue;
        if (Math.abs(angDiff(Math.atan2(dy, dx), normal)) > ARC) continue;
        best = t; bd = d;
      }
      if (!best) { g.cd = 0; return; }
      const off = n === 1 ? 0 : -18 + 36 * i / (n - 1);
      const mx = s.x + Math.cos(s.rot) * off + Math.cos(normal) * 13;
      const my = s.y + Math.sin(s.rot) * off + Math.sin(normal) * 13;
      const lead = s.isPlayer ? 1 : s.aimLead, t = bd / BALL_SPEED;
      const tx = best.x + best.vx * t * lead, ty = best.y + best.vy * t * lead;
      const ang = Math.atan2(ty - my, tx - mx) + rand(-1, 1) * (s.isPlayer ? 0.05 : s.aimSpread);
      const life = g.range * 1.08 / BALL_SPEED;
      const spr = S.add.image(mx, my, "ball").setDepth(7);
      balls.push({ spr, x: mx, y: my, vx: Math.cos(ang) * BALL_SPEED + s.vx * 0.3, vy: Math.sin(ang) * BALL_SPEED + s.vy * 0.3,
        life, life0: life, dmg: g.dmg, burn: g.burn, fromPlayer: !!s.isPlayer, owner: s });
      S.fx.smoke.emitParticleAt(mx + Math.cos(normal) * 6, my + Math.sin(normal) * 6, 3);
      g.cd = g.interval * rand(0.85, 1.15);
    });
  }
}

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
        const m = muzzle(player, mount, i, arr.length), life = g.range / BALL_SPEED;
        balls.push({ spr: S.add.image(m.x, m.y, "ball").setDepth(7), x: m.x, y: m.y,
          vx: Math.cos(m.a) * BALL_SPEED, vy: Math.sin(m.a) * BALL_SPEED, life, life0: life, dmg: g.dmg, burn: g.burn, fromPlayer: true, owner: player });
        S.fx.smoke.emitParticleAt(m.x + Math.cos(m.a) * 6, m.y + Math.sin(m.a) * 6, 3);
      });
    });
  }
  if (shots) S.cameras.main.shake(70, 0.002);
}

// ship hit test: capsule along the hull axis
function hitShip(s, x, y) {
  const dx = x - s.x, dy = y - s.y, c = Math.cos(s.rot), sn = Math.sin(s.rot);
  const along = clamp(dx * c + dy * sn, -28, 28);
  return Math.hypot(dx - c * along, dy - sn * along) < 13;
}
function floatText(x, y, str, color, size = 16) {
  const t = S.add.text(x, y, str, { fontFamily: UI_FONT, fontSize: size + "px", fontStyle: "700", color, stroke: "#0b2530", strokeThickness: 4 })
    .setOrigin(0.5).setDepth(10);
  S.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
}
function hurt(s, dmg, burn, src) {
  if (!s.alive) return;
  s.hp -= dmg;
  if (burn) { s.burnT = 3; s.burnDps = burn; s.burnSrc = src; }
  s.spr.setTint(0xffb4a0); S.time.delayedCall(90, () => s.spr && s.spr.clearTint());
  if (onScreen(s.x, s.y)) {
    const byPlayer = src === player;
    floatText(s.x + rand(-10, 10), s.y - 22, Math.round(dmg), s.isPlayer ? "#ff8a75" : byPlayer ? "#fff4d6" : "#a9c3cb", byPlayer || s.isPlayer ? 16 : 13);
  }
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
  if (s.badge) { s.badge.destroy(); s.badge = null; }
  S.tweens.add({ targets: s.spr, alpha: 0, scale: 0.6, angle: s.spr.angle + 25, duration: 1300, ease: "Quad.easeIn",
    onComplete: () => { if (!s.isPlayer) { s.spr.destroy(); s.dead = true; } } });
  if (s.isPlayer) {
    // the hold's cargo stays where the ship went down, and survives closing the game
    lastLost = Math.round(cargo);
    if (lastLost > 0) { const w = { x: Math.round(s.x), y: Math.round(s.y), value: lastLost }; save.wrecks.push(w); addCrate(w.x, w.y, w.value, w); }
    cargo = 0; persist();
    toast(t(lastLost > 0 ? "toastSunkWreck" : "toastSunk"));
    S.time.delayedCall(1700, () => {
      cargo = 0;
      Object.assign(player, { x: PORT.x + 140, y: PORT.y, rot: 0, speed: 0, alive: true, burnT: 0 });
      player.spr.setAlpha(1).setScale(1).setAngle(0).setPosition(player.x, player.y);
      dock("sunk");
    });
  } else {
    addCrate(s.x, s.y, s.loot, null);     // whoever sank it, the loot floats here (not saved)
    if (killer === player) { save.sunk++; floatText(s.x, s.y - 30, t("fSunk"), "#f0c766", 20); }
  }
}
