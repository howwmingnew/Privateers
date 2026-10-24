"use strict";
// ---------- Combat ----------
// AI gunnery: telegraphed volleys per side, chaser and fort battery (js/volley.js).
function fire(s, targets, dt) { enemyFire(s, targets, dt); }

// ---------- Player gunnery: straight aim lines, fire on release ----------
// Each cannon shoots straight out of its mount: bow guns forward, broadside guns perpendicular to the hull,
// stern guns aft. No auto-aim and no lead: the ball flies exactly along the line that was shown,
// so the player aims by turning the ship.
const AIM_SHOW_PAD = 1.15;   // aim lines appear when an enemy is within (range x this) of a mount's firing arc
let engagedPrev = false, releaseTips = 0, spaceDownAt = 0;   // spaceDownAt: when Space went down, 0 when up
function muzzle(s, m, i, n) {
  const g = (s.mounts && s.mounts[m.key]) || m;   // per-hull out/span from applyShipArt, else the MOUNTS defaults
  const a = s.rot + m.ang, p = s.rot + m.perp, off = n === 1 ? 0 : -g.span / 2 + g.span * i / (n - 1);
  return { x: s.x + Math.cos(p) * off + Math.cos(a) * g.out, y: s.y + Math.sin(p) * off + Math.sin(a) * g.out, a };
}
// Is an enemy inside this mount's firing arc, and on screen (AIM_SCREEN_PAD world px of slack)? Only then are its aim
// lines shown and can it fire: nothing the player cannot see draws a line or eats a broadside.
const AIM_SCREEN_PAD = 24;
function mountEngaged(m) {
  const arr = player.guns[m.key];
  if (!arr.length) return false;
  const r = Math.max(...arr.map(g => g.range)) * AIM_SHOW_PAD, normal = player.rot + m.ang;
  return enemies.some(e => e.alive && dist(e, player) < r && Math.abs(angDiff(Math.atan2(e.y - player.y, e.x - player.x), normal)) < ARC && onScreen(e.x, e.y, AIM_SCREEN_PAD));
}
// Would a straight shot from (x, y) at angle a, length len, pass through an enemy hull right now? Returns that enemy.
// Only ships the player can see count: a "will hit" line must never point at something off screen.
function lineHits(x, y, a, len) {
  const c = Math.cos(a), sn = Math.sin(a);
  for (const e of enemies) {
    if (!e.alive || !onScreen(e.x, e.y, 0)) continue;
    const ext = (e.hl ?? 28) + (e.hw ?? 13), ex = e.x - x, ey = e.y - y, along = ex * c + ey * sn;
    if (along < -ext || along > len + ext || Math.abs(ex * sn - ey * c) > ext + 2) continue;   // cheap reject
    for (let d = Math.max(0, along - ext); d <= Math.min(len, along + ext); d += 5) if (hitShip(e, x + c * d, y + sn * d)) return e;
  }
  return null;
}
// Fire every loaded cannon on each engaged mount: Space, letting go of the stick or mouse, a click, pad A / RT.
// `only`: mount keys to fire (Q / E fire one broadside); all of them when omitted.
// `pick(mount, gun)`: when given, only the guns it accepts fire (auto-fire: those whose aim line is red).
function playerFire(only, pick) {
  if (paused || docked || !player.alive) return;
  let shots = 0, rx = 0, ry = 0;
  for (const mount of MOUNTS) {
    if ((only && !only.includes(mount.key)) || !mountEngaged(mount)) continue;
    const ready = player.guns[mount.key].filter(g => g.cd <= 0 && (!pick || pick(mount, g))), plan = rollPlan(ready.length);   // a rolling broadside (js/gundeck.js)
    ready.forEach((g, k) => {
      const { delay, loud } = plan[k];
      g.cd = g.interval; shots++; rx -= Math.cos(player.rot + mount.ang); ry -= Math.sin(player.rot + mount.ang);
      S.time.delayedCall(delay, () => {
        if (!player.alive || paused || !ballRoom()) return;
        const m = muzzle(player, mount, g.pi, g.pn), life = g.range / g.speed;   // each gun has its own ball speed
        balls.push({ spr: S.add.image(m.x, m.y, "ball").setDepth(7), x: m.x, y: m.y,
          vx: Math.cos(m.a) * g.speed, vy: Math.sin(m.a) * g.speed, life, life0: life, dmg: g.dmg, burn: g.burn, chain: g.chain, fromPlayer: true, owner: player });
        vfxMuzzle(m.x, m.y, m.a, !loud);
        gunFired(player, mount.key, g.pi, g.pn);   // the mount recoils, a flash at the gun (js/gun-art.js)
        if (loud) Snd.play("cannon", { pan: Math.cos(m.a) * 0.35 });
      });
    });
  }
  if (shots && !(pick && shots < 3)) { camShake(70, Math.min(0.004, 0.0015 + 0.0002 * shots)); playerRecoil(rx, ry); }   // a bigger broadside kicks harder (js/juice.js)
}

// Hold-to-fire (keyboard): once Space has been held AUTOFIRE_HOLD_MS, every frame fires the reloaded guns whose aim line
// is red, i.e. would hit an enemy right now. A quick tap still fires the whole engaged broadside as before. Off in settings.
function autoFire() {
  if (!SETTINGS.autoFire || !spaceDownAt || performance.now() - spaceDownAt < AUTOFIRE_HOLD_MS || paused || docked || !player.alive) return;
  playerFire(null, (mount, g) => { const m = muzzle(player, mount, g.pi, g.pn); return !!lineHits(m.x, m.y, m.a, g.range); });
}
// ship hit test: capsule along the hull axis, sized to the drawn hull by applyShipArt (s.hl / s.hw)
function hitShip(s, x, y) {
  const dx = x - s.x, dy = y - s.y, hl = s.hl ?? 28, hw = s.hw ?? 13;
  if (dx > hl + hw || dx < -hl - hw || dy > hl + hw || dy < -hl - hw) return false;   // far off: skip the trig
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  const along = clamp(dx * c + dy * sn, -hl, hl);
  return Math.hypot(dx - c * along, dy - sn * along) < hw;
}
function floatText(x, y, str, color, size = 16) {
  const txt = S.add.text(x, y, str, { fontFamily: UI_FONT, fontSize: size + "px", fontStyle: "700", color, stroke: "#0b2530", strokeThickness: 4 })
    .setOrigin(0.5).setDepth(10);
  labelText(txt);   // counter-scaled so it stays readable when zoomed out
  S.tweens.add({ targets: txt, y: y - 34 * labelScale(), alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => txt.destroy() });
}
function hurt(s, dmg, burn, src, ball) {
  if (!s.alive) return;
  dmg = onHit(s, dmg, burn, src, ball);   // raking, fires, chain shot, merchants and convoys raising the alarm (js/arsenal.js)
  s.hp -= dmg;
  vfxFlash(s);
  const byPlayer = src === player, lethal = s.hp <= 0 && byPlayer && !s.isPlayer;
  if (byPlayer && !lethal) juiceHit(s, ball);   // hit-stop and knockback (js/juice.js)
  if (onScreen(s.x, s.y) && !lethal) {   // the killing blow shows the kill card instead of a number
    dmgNumber(s, dmg, s.isPlayer ? "#ff8a75" : byPlayer ? "#fff4d6" : "#a9c3cb", byPlayer || s.isPlayer ? 16 : 13);   // a broadside merges (js/notices.js)
  }
  Snd.play("hit", { x: s.x, y: s.y, big: s.isPlayer });
  if (!s.isPlayer && src) { s.attacker = src; s.angry = 8; s.ignore.delete(src); }
  if (s.isPlayer) camShake(90, 0.0024);
  runHook("hurt", s, dmg, src);   // stats, achievements, bounty assists (js/hooks.js)
  if (s.hp <= 0) sink(s, src);
}
// A crate floating on the sea. AI loot is temporary; a player wreck is saved and never expires.
function addCrate(x, y, value, wreck) {
  const c = { spr: S.add.image(x, y, wreck ? "wreck" : "crate").setDepth(2), x, y, value, t: 0, wreck: wreck || null, label: null };
  if (wreck) c.label = labelText(S.add.text(x, y - 26, t("wreckLabel"), { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#ffd8cf", stroke: "#0b2530", strokeThickness: 4 })
    .setOrigin(0.5).setDepth(9));
  crates.push(c);
  return c;
}
let lastLost = 0;
function sink(s, killer) {
  if (!s.alive) return;
  s.alive = false; s.speed = 0; s.hp = 0;
  S.fx.spark.explode(26, s.x, s.y); S.fx.smoke.explode(14, s.x, s.y);
  Snd.play("sink", { x: s.x, y: s.y, big: s.isPlayer });
  if (s.isPlayer) Snd.play("defeat"); else if (killer === player) Snd.play(s.boss ? "victory" : "kill", { delay: 0.25 });   // the fanfare is for bounties
  if (s.badge) { s.badge.destroy(); s.badge = null; }
  vfxSink(s, killer);   // list, darken, go under; sets s.dead for AI ships when done (js/vfx.js)
  if (s.isPlayer) {
    // half the hold stays where the ship went down, and survives closing the game; the plunder streak is lost
    lastLost = Math.round(cargo * WRECK_KEEP); streak = 0;
    if (lastLost > 0) { const w = { x: Math.round(s.x), y: Math.round(s.y), value: lastLost }; save.wrecks.push(w); addCrate(w.x, w.y, w.value, w); }
    save.salvage = [];   // whatever was salvaged went down again inside the new wreck
    cargo = 0; persist();
    toast(t(lastLost > 0 ? "toastSunkHalf" : "toastSunk"), true);
    S.time.delayedCall(1700, () => {
      cargo = 0;
      Object.assign(player, { x: PORT.x + 140, y: PORT.y, rot: 0, speed: 0, alive: true, burnT: 0 });
      vfxRespawn(player); player.spr.setPosition(player.x, player.y);
      if (runActive() && runKind() === "daily") { runPlayerSunk(); return; }   // a daily run ends here, no ledger (js/run.js)
      dock("sunk");
    });
  }
  // whoever sank it, the loot floats here (not saved); the player's kills pay bounty + streak (js/plunder.js)
  const loot = s.isPlayer ? null : lootDrop(s, killer);
  if (!s.isPlayer && killer === player) { save.sunk++; killCard(s); }   // one card: Sunk!, then its pay flies to the HUD (js/juice.js)
  runHook("sunk", s, killer, loot);   // bounties, stats, achievements (js/hooks.js)
}
