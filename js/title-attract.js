"use strict";
// ---------- Title attract mode: the framed pair trades broadsides ----------
// Cosmetic only. The two ships js/onboard.js frames behind the logo fire balls with muzzle flashes, hits and splashes,
// but the balls live in their own list here: no hurt(), nothing sinks, no save write, the player is never involved,
// and no sound plays (the title music has the floor). setSail rebuilds the sea anyway.
const TA_GAP = [1.6, 2.6];   // s between one ship's broadsides
const TA_SPREAD = 0.07;      // rad of aim scatter per gun, so a broadside lands as a spread of hits and splashes
const TA_STAGGER = 0.07;     // s between the guns of one broadside: a rolling broadside, not one blast
const TA_REACH = 1.4;        // fires a little past its range: a short shot still splashes in frame, which reads as a fight
let taBalls = [];
function attractGuns(dt) {
  const p = attract.pair;
  if (p) { attractVolley(p[0], p[1], dt); attractVolley(p[1], p[0], dt); }
  taBalls = taBalls.filter(b => attractBall(b, dt));
}
function attractVolley(s, tg, dt) {
  if (!s.alive || !tg.alive || !s.guns) return;
  // locked on each other, "provoked" (js/ships.js isHostile) and never leashed, so the pair closes and circles
  s.attacker = tg; s.angry = 8; s.ignore?.delete(tg);
  if (s.target !== tg) s.target = tg;
  s.chaseFrom = { x: s.x, y: s.y };
  s.taCd = (s.taCd ?? rand(0.3, 1.2)) - dt;
  if (s.taCd > 0) return;
  for (const key in s.guns) {
    const guns = s.guns[key];
    if (key === "turret" || !guns || !guns.length || !bears(s, key, tg, ARC) || dist(s, tg) > guns[0].range * TA_REACH) continue;
    s.taCd = rand(TA_GAP[0], TA_GAP[1]);
    guns.forEach((g, i) => {
      const m = enemyMuzzle(s, key, i, guns.length), aim = Math.atan2(tg.y - m.y, tg.x - m.x) + rand(-TA_SPREAD, TA_SPREAD);
      const a = m.a == null ? aim : m.a + clamp(angDiff(aim, m.a), -ARC_FIRE, ARC_FIRE), life = g.range * 1.08 / g.speed;
      taBalls.push({ owner: s, key, i, n: guns.length, wait: i * TA_STAGGER, x: m.x, y: m.y, a, vx: Math.cos(a) * g.speed, vy: Math.sin(a) * g.speed, life, life0: life, spr: null });
    });
    return;
  }
}
// One ball: waits its turn in the broadside, leaves the muzzle where the gun is now, flies, and ends in a hit or a splash.
function attractBall(b, dt) {
  if (!b.spr) {
    if ((b.wait -= dt) > 0) return true;
    if (!b.owner.alive) return false;
    const m = enemyMuzzle(b.owner, b.key, b.i, b.n);
    b.x = m.x; b.y = m.y;
    b.spr = S.add.image(b.x, b.y, "ball").setDepth(7);
    vfxMuzzle(b.x, b.y, b.a);
  }
  b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
  b.spr.setPosition(b.x, b.y).setScale(1 + Math.sin(Math.PI * clamp(1 - b.life / b.life0, 0, 1)) * 0.6);
  const hit = enemies.find(e => e !== b.owner && e.alive && hitShip(e, b.x, b.y));
  const rock = !hit && islands.some(isl => Math.hypot(isl.x - b.x, isl.y - b.y) < isl.r * 0.9);
  if (!hit && !rock && b.life > 0) return true;
  if (hit) vfxHit(b.x, b.y); else vfxSplash(b.x, b.y, rock);
  ballFree(b);   // a pooled sprite goes back to the pool, any other is destroyed (js/ball-pool.js)
  return false;
}
function attractGunsClear() { for (const b of taBalls) if (b.spr) ballFree(b); taBalls = []; }
onHook("sail", attractGunsClear);
onHook("dock", attractGunsClear);
// The in-world harbor name would sit half under the title card: the title shows the logo instead.
onHook("frame", () => { const show = !titleOpen && !portsOff(); if (harborLabel && harborLabel.visible !== show) harborLabel.setVisible(show); });   // and none in the daily sea (js/ports.js)
