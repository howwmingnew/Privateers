"use strict";
// ---------- Enemy gunnery: telegraphed volleys ----------
// A side (or a chaser, or a fort's battery) fires all its guns together, VOLLEY_WARN s after its gun ports glow red.
// The gunners lay their guns when the glow starts, on where they expect the target to be when the balls arrive, so a
// captain who turns bow-on in that window (a narrow target, off the path they planned for) makes them miss. Low-level
// crews allow for only part of the target's motion. From FAN_L they fan the balls of a side over the turns the target
// is likely to make (its current turn +/- FAN_W), so a ship that simply keeps circling gets hit.
const FAN_L = 5;             // fanned volleys from this level
const FAN_W = 1.0;           // rad/s either side of the target's current turn that a fan covers
const ARC_FIRE = ARC * 1.3;  // at the moment of firing the target may have drifted a little out of the arc
const EMOUNT = { bow: MOUNTS[0], left: MOUNTS[1], right: MOUNTS[2], stern: MOUNTS[3] };

// Where ship t will be in T s if it keeps its speed and turns at w rad/s, scaled toward its current spot by `lead`.
function predictAt(t, T, w, lead) {
  const v = t.speed || 0, th = t.rot;
  let dx, dy;
  if (Math.abs(w) < 1e-3) { dx = Math.cos(th) * v * T; dy = Math.sin(th) * v * T; }
  else { const r = v / w; dx = r * (Math.sin(th + w * T) - Math.sin(th)); dy = -r * (Math.cos(th + w * T) - Math.cos(th)); }
  return { x: t.x + dx * lead, y: t.y + dy * lead };
}
// Muzzle i of n on mount `key` of ship s, using the hull's own gun geometry when js/art.js gives one.
function enemyMuzzle(s, key, i, n) {
  if (key === "turret") return { x: s.x, y: s.y, a: null };
  const m = EMOUNT[key], g = s.mounts && s.mounts[key], out = g ? g.out : m.out, span = g ? g.span : m.span;
  const a = s.rot + m.ang, p = s.rot + m.perp, off = n === 1 ? 0 : -span / 2 + span * i / (n - 1);
  return { x: s.x + Math.cos(p) * off + Math.cos(a) * out, y: s.y + Math.sin(p) * off + Math.sin(a) * out, a };
}
const bears = (s, key, tg, arc) => key === "turret" || Math.abs(angDiff(Math.atan2(tg.y - s.y, tg.x - s.x), s.rot + EMOUNT[key].ang)) < arc;

// Called every frame for each living enemy (from fire() in js/combat.js) with its current target, if any.
function enemyFire(s, targets, dt) {
  const tg = targets[0];
  for (const key in s.vol) {
    const v = s.vol[key], guns = s.guns[key];
    if (v.cd > 0) v.cd -= dt;
    if (v.warn > 0) { v.warn -= dt; if (v.warn <= 0) releaseVolley(s, key, v, guns); continue; }
    if (v.cd > 0 || !tg || !tg.alive || dist(s, tg) > guns[0].range || !bears(s, key, tg, ARC)) continue;
    const aims = layGuns(s, tg, guns), a = aims[0];
    if (Math.hypot(a.x - s.x, a.y - s.y) > guns[0].range) continue;   // it will have sailed out of reach: hold fire
    v.warn = VOLLEY_WARN; v.tgt = tg; v.aims = aims;
  }
}
// Pick an aim point per gun when the warning starts. The whole side shares one misjudgement of the target's speed.
function layGuns(s, tg, guns) {
  const n = guns.length, fan = s.L >= FAN_L && n >= 2 ? Math.min(3, n) : 1, w0 = (tg.omega || 0) * s.aimTurn;
  const lead = s.aimLead * (1 + rand(-1, 1) * (s.aimLeadErr || 0));
  return guns.map((g, i) => {
    const k = fan === 1 ? 0 : fan === 2 ? (i % 2 ? 0.5 : -0.5) : [0, -1, 1][i % 3];
    const w = w0 + k * FAN_W;
    let T = VOLLEY_WARN + dist(s, tg) / g.speed, p = predictAt(tg, T, w, lead);
    T = VOLLEY_WARN + Math.hypot(p.x - s.x, p.y - s.y) / g.speed; p = predictAt(tg, T, w, lead);
    return { x: p.x, y: p.y, err: rand(-1, 1) * s.aimSpread };
  });
}
function releaseVolley(s, key, v, guns) {
  const tg = v.tgt; v.tgt = null;
  if (!tg || !tg.alive || !bears(s, key, tg, ARC_FIRE) || (tg.isPlayer && (docked || inSafe(tg)))) { v.cd = 0.5; v.aims = null; return; }   // lost the bearing
  const n = guns.length;
  guns.forEach((g, i) => {
    const m = enemyMuzzle(s, key, i, n), aim = v.aims[i];
    let ang = Math.atan2(aim.y - m.y, aim.x - m.x) + aim.err;
    if (m.a != null) ang = m.a + clamp(angDiff(ang, m.a), -ARC_FIRE, ARC_FIRE);   // a gun only trains so far
    const p = s.fixed ? fortMuzzle(s, ang) : m, life = g.range * 1.08 / g.speed;
    balls.push({ spr: S.add.image(p.x, p.y, "ball").setDepth(7), x: p.x, y: p.y, vx: Math.cos(ang) * g.speed, vy: Math.sin(ang) * g.speed,
      life, life0: life, dmg: g.dmg, burn: 0, fromPlayer: false, owner: s });
    vfxMuzzle(p.x, p.y, ang);
  });
  Snd.play("cannonFar", { x: s.x, y: s.y });
  v.aims = null; v.cd = guns[0].interval * rand(0.9, 1.1);
}

// ---------- Warning glow ----------
// Red light on the gun ports of a side about to fire, brightening as the moment comes. js/vfx.js may replace
// drawVolleyGlow(g, s, key, k) (k = 0 at the first warning .. 1 at the shot) with its own look.
function drawVolleyGlow(g, s, key, k) {
  const guns = s.guns[key], n = guns.length, pulse = 0.55 + 0.45 * Math.sin(S.time.now / 45);
  if (key === "turret") { g.lineStyle(3, 0xff3b24, 0.25 + 0.6 * k); g.strokeCircle(s.x, s.y, 30 + 6 * k); return; }
  for (let i = 0; i < n; i++) {
    const m = enemyMuzzle(s, key, i, n);
    g.fillStyle(0xff2a10, (0.18 + 0.3 * k) * pulse); g.fillCircle(m.x, m.y, 6 + 5 * k);
    g.fillStyle(0xffb08a, 0.5 + 0.5 * k); g.fillCircle(m.x, m.y, 2 + 1.5 * k);
    g.lineStyle(2, 0xff3b24, 0.25 + 0.5 * k);
    g.lineBetween(m.x, m.y, m.x + Math.cos(m.a) * (8 + 14 * k), m.y + Math.sin(m.a) * (8 + 14 * k));
  }
}
function drawVolleyWarnings(g) {
  for (const s of enemies) {
    if (!s.alive || !s.vol || !onScreen(s.x, s.y, 80)) continue;
    for (const key in s.vol) { const v = s.vol[key]; if (v.warn > 0) drawVolleyGlow(g, s, key, 1 - v.warn / VOLLEY_WARN); }
  }
}

// ---------- Per-frame combat bookkeeping (called once per step) ----------
// Each ship's turn rate (rad/s, smoothed) is what enemy gunners read to fan their volleys.
function trackTurns(dt, ships) {
  for (const s of ships) {
    if (s.prevRot != null && dt > 0) s.omega = (s.omega || 0) * 0.8 + 0.2 * angDiff(s.rot, s.prevRot) / dt;
    s.prevRot = s.rot;
  }
}
function combatTick(dt) {
  const ships = enemies.filter(e => e.alive); if (player.alive) ships.push(player);
  trackTurns(dt, ships);
  for (const e of ships) {
    if (e.panicT > 0) e.panicT -= dt;
    if (e.boss && e.bossFit !== e.boss && e.arch) outfitEnemy(e, e.boss.cls || e.arch);   // a campaign boss tagged after spawning
  }
  fireshipContact();
  updateForts(dt);
  streakChip();
}
