"use strict";
// ---------- Enemy archetypes ----------
// Every enemy is one class with its own hull numbers, guns and battle plan, picked per spawn by level and faction.
// Contract with js/art.js: e.cls is one of cutter | brig | frigate | manowar | fireship | fluyt (manowar draws as the
// "line" hull); the AI itself reads e.arch, so art may rewrite e.cls freely. Bosses (e.boss, set by the campaign) use
// the same classes: set e.boss = { hpMul, dmgMul, lootMul, speedMul, gun: "carronade" | "long", cls } and e.L, then
// call outfitEnemy(e, cls) (or leave it: combatTick re-outfits any ship whose e.boss changed).
//
// Multipliers apply to enemyStats(L) (the brig). sides(per) = guns per broadside; bow / stern = chasers.
// plan: circle = today's broadside circling, orbit = a steadier wide circle, kite = hold off at bow-gun range,
// ram = sail into the target and explode, line = run parallel ("line ahead") and trade full broadsides, flee, fort.
const ARCH = {
  cutter:   { hp: 0.7,  speed: 1.2,  turn: 1.3,  sides: () => 1, bow: 1, stern: 0, dmg: 1, reload: 1, range: 1, loot: 0.8, plan: "kite",
              bowGun: { dmg: 1.1, range: 1.15, speed: 560 } },
  brig:     { hp: 1,    speed: 1,    turn: 1,    sides: per => per, bow: 0, stern: 0, dmg: 1, reload: 1, range: 1, loot: 1, plan: "circle" },
  frigate:  { hp: 1.25, speed: 0.95, turn: 0.9,  sides: per => Math.min(per + 1, 5), bow: 0, stern: 1, dmg: 1, reload: 1.2, range: 1.05, loot: 1.3, plan: "orbit" },
  fireship: { hp: 0.55, speed: 1.35, turn: 1.15, sides: () => 0, bow: 0, stern: 0, dmg: 0, reload: 1, range: 1, loot: 0.6, plan: "ram", boom: true },
  manowar:  { hp: 1.7,  speed: 0.75, turn: 0.6,  sides: () => 5, bow: 0, stern: 1, dmg: 1, reload: 1.35, range: 1.1, loot: 1.9, plan: "line", rake: 1.5 },
  fluyt:    { hp: 1,    speed: 1,    turn: 0.9,  sides: () => 1, bow: 0, stern: 0, dmg: 1, reload: 1.2, range: 1, loot: 1, plan: "flee" },
  fort:     { hp: 3.6,  speed: 0,    turn: 0,    sides: () => 0, bow: 0, stern: 0, turret: 3, dmg: 1.2, reload: 1.2, rangeAbs: 420, gunSpeed: 560, loot: 2.5, plan: "fort" },
};
// Boss gun loadouts (e.boss.gun): carronades hit hard up close, long guns reach out.
const EGUN = { std: { dmg: 1, range: 1 }, carronade: { dmg: 1.6, range: 0.75, speed: 400 }, long: { dmg: 0.85, range: 1.35, speed: 600 } };
// Which classes sail in each faction's waters: [from level, { class: weight }]; the last row at or below L applies.
const ARCH_MIX = {
  pirate: [[1, { cutter: 1 }], [2, { cutter: 0.6, brig: 0.4 }], [3, { cutter: 0.45, brig: 0.55 }], [4, { cutter: 0.3, brig: 0.55, frigate: 0.15 }],
    [5, { cutter: 0.15, brig: 0.45, frigate: 0.2, fireship: 0.2 }], [6, { brig: 0.45, frigate: 0.3, fireship: 0.25 }],
    [8, { brig: 0.3, frigate: 0.45, fireship: 0.25 }], [9, { frigate: 0.6, fireship: 0.25, manowar: 0.15 }]],
  navy: [[1, { cutter: 1 }], [2, { cutter: 0.5, brig: 0.5 }], [3, { cutter: 0.35, brig: 0.65 }], [4, { cutter: 0.2, brig: 0.6, frigate: 0.2 }],
    [5, { cutter: 0.1, brig: 0.5, frigate: 0.4 }], [6, { brig: 0.5, frigate: 0.5 }], [7, { brig: 0.35, frigate: 0.4, manowar: 0.25 }],
    [8, { brig: 0.25, frigate: 0.4, manowar: 0.35 }], [9, { frigate: 0.5, manowar: 0.5 }]],
  merchant: [[1, { fluyt: 1 }]],
};
const CONVOY_P = 0.3;          // share of merchants that sail as a convoy: 1-2 more fluyts and an armed escort brig
const BOOM_R = 70, BOOM_K = 0.25, BOOM_BOSS_K = 0.08;   // fireship blast: radius, share of each hull's max HP (bosses less)

function pickArch(L, faction) {
  const rows = ARCH_MIX[faction] || ARCH_MIX.pirate;
  let mix = rows[0][1];
  for (const [from, m] of rows) if (L >= from) mix = m;
  let r = Math.random() * Object.values(mix).reduce((a, b) => a + b, 0);
  for (const k in mix) if ((r -= mix[k]) <= 0) return k;
  return Object.keys(mix)[0];
}
const pickFaction = () => Math.random() < 0.35 ? "merchant" : Math.random() < 0.5 ? "pirate" : "navy";

// (Re)build an enemy's numbers and guns from its level, class and boss multipliers. Safe to call again.
function outfitEnemy(e, key) {
  const k = Object.hasOwn(ARCH, key) ? key : "brig", A = ARCH[k];
  const b = e.boss && typeof e.boss === "object" ? e.boss : {}, st = enemyStats(e.L, k === "fluyt");
  e.arch = k; e.A = A; e.cls = k; e.merchant = k === "fluyt"; e.fixed = k === "fort"; e.bossFit = e.boss;
  e.maxHp = e.hp = st.hp * A.hp * (b.hpMul || 1);
  e.maxSpeed = st.speed * A.speed * (b.speedMul || 1);
  e.turnRate = 1.7 * A.turn;
  e.loot = Math.round(st.loot * A.loot * (b.lootMul || 1));
  e.aim = st.aim; e.aimLead = st.lead; e.aimLeadErr = st.leadErr; e.aimTurn = st.turn; e.aimSpread = st.spread * (b.spreadMul || 1);
  const eg = EGUN[b.gun] || EGUN.std;
  const main = { dmg: st.dmg * A.dmg * eg.dmg * (b.dmgMul || 1), range: (A.rangeAbs || st.range * A.range) * eg.range,
    interval: st.interval * A.reload, speed: eg.speed || A.gunSpeed || BALL_SPEED };
  const bow = A.bowGun ? { ...main, dmg: main.dmg * A.bowGun.dmg, range: main.range * A.bowGun.range, speed: A.bowGun.speed } : main;
  const mk = (n, g) => Array.from({ length: n }, () => ({ ...g, burn: 0, cd: 0 }));
  const n = A.sides(st.per);
  e.guns = { bow: mk(A.bow, bow), left: mk(n, main), right: mk(n, main), stern: mk(A.stern, main), turret: mk(A.turret || 0, main) };
  e.vol = {};
  for (const m in e.guns) if (e.guns[m].length) e.vol[m] = { cd: rand(0.4, 1.8), warn: 0, aims: null };
  e.range = A.bow && !n ? bow.range : A.plan === "kite" ? bow.range : main.range;
  if (!A.bow && !n && !A.turret) e.range = 200;   // fireship: no guns, only how close it means to get
  if (typeof applyShipArt === "function" && !e.fixed) {   // js/art.js draws the class; manowar uses the "line" hull
    applyShipArt(e, k === "manowar" ? "line" : k, typeof liveryFor === "function" ? liveryFor(e) : e.faction);
    e.cls = k;
  }
  return e;
}

// ---------- Battle plans ----------
// archTactic -> TAC.desired (heading) and TAC.thr (throttle), given the target, its distance d and bearing toT.
const TAC = { desired: null, thr: 0.55 };
const STEER_LEAD = 1.2;   // s ahead that a broadside ship steers for (half that for green crews)
const tac = (desired, thr) => { TAC.desired = desired; TAC.thr = thr; return TAC; };
const nearSide = (e, toT) => Math.abs(angDiff(toT + Math.PI / 2, e.rot)) < Math.abs(angDiff(toT - Math.PI / 2, e.rot)) ? 1 : -1;
function archTactic(e, tg, d, toT, now) {
  const R = e.range, plan = e.A.plan;
  if ((plan === "circle" || plan === "orbit" || plan === "line") && !e.inBroad) {
    // close in on where the target is going (its turn included), not where it is: chasing a circling ship's current
    // spot only ever trails it round the outside of its circle, out of reach
    const P = predictAt(tg, STEER_LEAD * (0.5 + 0.5 * e.aim), (tg.omega || 0) * e.aim, 1);
    d = Math.hypot(P.x - e.x, P.y - e.y); toT = Math.atan2(P.y - e.y, P.x - e.x);
  }
  switch (plan) {
    case "flee": {
      const h = e.haven;   // hit: run for the nearest navy ship and its guns
      if (e.panicT > 0 && h && h.alive && dist(e, h) > 140) return tac(Math.atan2(h.y - e.y, h.x - e.x) + Math.sin(now * 1.3 + e.L) * 0.25, 1);
      return tac(toT + Math.PI + Math.sin(now * 1.1 + e.L) * 0.5, 1);
    }
    case "ram": {   // aim for where the target will be when we get there
      const tt = Math.min(1.5, d / Math.max(60, e.speed));
      return tac(Math.atan2(tg.y + (tg.vy || 0) * tt * 0.8 - e.y, tg.x + (tg.vx || 0) * tt * 0.8 - e.x), 1);
    }
    case "kite": {  // hold off near bow-gun range, bow on, slightly off the line; back off when crowded, then turn again
      if (e.kiteOut) { if (d > R * 0.92) e.kiteOut = false; return tac(toT + Math.PI + (e.kiteSide || 1) * 0.5, 1); }
      if (d < R * 0.55) { e.kiteOut = true; e.kiteSide = nearSide(e, toT); return tac(toT + Math.PI, 1); }
      return tac(toT + (e.kiteSide || 1) * 0.18, d > R * 0.9 ? 1 : 0.35);
    }
    case "orbit": { // a steady circle at 0.68 x range, keeping the same broadside on the target
      if (!closing(e, d, R)) return tac(toT, 1);
      if (!e.orbitSide || e.orbitTg !== tg) { e.orbitSide = nearSide(e, toT); e.orbitTg = tg; }
      return tac(broadside(e.orbitSide, toT, d, R * 0.68, R * 0.27), d > R * 0.68 ? 1 : 0.8);
    }
    case "line": {  // sail parallel to the target at 0.7 x range; slow to turn, so its bow and stern are open
      if (!closing(e, d, R)) return tac(toT, 1);
      const ref = (tg.speed || 0) > 30 ? tg.rot : e.rot;
      const side = Math.abs(angDiff(toT + Math.PI / 2, ref)) < Math.abs(angDiff(toT - Math.PI / 2, ref)) ? 1 : -1;
      return tac(broadside(side, toT, d, R * 0.7, R * 0.3), d > R * 0.7 ? 1 : 0.7);
    }
    default: {      // circle: close to range, then run across the target with a broadside on it, side by heading
      if (!closing(e, d, R)) return tac(toT, 1);
      return tac(broadside(nearSide(e, toT), toT, d, R * 0.68, R * 0.3), d > R * 0.68 ? 1 : 0.75);
    }
  }
}
// In broadside range? With hysteresis: a ship sitting on one threshold flipped between "chase" and "broadside" every
// frame and ended up only ever chasing a circling target, never bringing a side to bear.
function closing(e, d, R) { e.inBroad = d < R * (e.inBroad ? 1.12 : 0.95); return e.inBroad; }
// Heading that keeps the target abeam on `side` while drifting toward distance r0 (tilted up to BROAD_TILT, which
// stays inside the firing arc). Without the tilt a ship at the edge of its range only ever chased a circling target.
const BROAD_TILT = 0.5;
const broadside = (side, toT, d, r0, band) => toT + side * (Math.PI / 2 - BROAD_TILT * clamp((d - r0) / band, -1, 1));

// ---------- Convoys ----------
// A merchant may sail with 1-2 more fluyts and an armed escort brig. The escort guards the fluyts against pirates and
// anyone who fires on them; the fluyts keep station on the lead ship.
function maybeConvoy(sc, lead) {
  if (Math.random() >= CONVOY_P) return;
  const cv = { lead, ships: [lead] }; lead.convoy = cv;
  const slots = [[-90, 70], [-90, -70], [-180, 0]], n = 1 + (Math.random() < 0.5 ? 1 : 0);
  slots.slice(0, n + 1).forEach(([ax, ay], i) => {
    const c = Math.cos(lead.rot), s = Math.sin(lead.rot), x = lead.x + c * ax - s * ay, y = lead.y + s * ax + c * ay;
    if (islands.some(isl => Math.hypot(isl.x - x, isl.y - y) < isl.r + 30)) return;
    const e = makeEnemy(sc, x, y, lead.L, "merchant", i === n ? "brig" : "fluyt");
    e.rot = lead.rot; e.convoy = cv; e.station = { ax, ay }; cv.ships.push(e);
    if (i === n) e.escort = cv;
  });
}
// Idle heading for a convoy ship that is not the lead: keep its station, at the lead's pace. null = roam as usual.
function convoyIdle(e) {
  const cv = e.convoy;
  if (!cv) return null;
  if (!cv.lead.alive) { cv.lead = cv.ships.find(s => s.alive && s.merchant) || cv.lead; if (!cv.lead.alive) return null; }
  const L = cv.lead;
  if (L === e) return null;
  const { ax, ay } = e.station || { ax: -100, ay: 0 }, c = Math.cos(L.rot), s = Math.sin(L.rot);
  const x = L.x + c * ax - s * ay, y = L.y + s * ax + c * ay, d = Math.hypot(x - e.x, y - e.y);
  return tac(d < 25 ? L.rot : Math.atan2(y - e.y, x - e.x), d > 140 ? 0.8 : d > 40 ? 0.55 : 0.45);
}
// Someone fired on a convoy ship: the whole convoy knows who, the escort turns on them, the fluyts run.
function convoyAlarm(e, src) {
  if (!e.convoy || !src || src.faction === "merchant") return;
  for (const s of e.convoy.ships) if (s.alive && s !== e) { s.attacker = src; s.angry = 10; s.ignore.delete(src); if (s.merchant) panic(s, src); }
}
// A hit merchant runs for the nearest navy ship (within 1800 px) for protection, or just away.
function panic(e, src) {
  e.panicT = 10;
  let best = null, bd = 1800;
  for (const o of enemies) if (o.alive && o.faction === "navy" && o !== src) { const d = dist(e, o); if (d < bd) { best = o; bd = d; } }
  e.haven = best;
}

// ---------- Fireships ----------
// Rams its target and goes up on contact; shot down, it goes up where it is. Every hull within BOOM_R takes a share
// of its own max HP, so a fireship blown up beside its friends hurts them too.
function fireshipContact() {
  for (const e of enemies) {
    if (!e.alive || e.arch !== "fireship" || !e.target || !e.target.alive) continue;
    if (dist(e, e.target) < 30 + (e.target.hw || 13) + (e.hw || 11)) { e.rammed = true; e.loot = 0; sink(e, null); }
  }
}
function fireshipBoom(s) {
  S.fx.spark.explode(46, s.x, s.y); S.fx.smoke.explode(26, s.x, s.y);
  Snd.play("sink", { x: s.x, y: s.y, big: true }); Snd.play("cannonFar", { x: s.x, y: s.y });
  const hit = enemies.filter(o => o.alive && o !== s && dist(o, s) < BOOM_R);
  if (player.alive && !docked && dist(player, s) < BOOM_R) hit.push(player);
  for (const o of hit) hurt(o, o.maxHp * (o.boss ? BOOM_BOSS_K : BOOM_K), 0, s.rammed ? s : s.killedBy || s);
  if (dist(player, s) < 500) camShake(220, 0.008);
}
// The default hull js/art.js draws for an enemy is its archetype (this replaces art.js's interim guess by level), so
// applyShipArt(e) after tagging e.boss keeps the class. manowar draws as the "line" hull.
function enemyClassFor(e) { return e.arch ? (e.arch === "manowar" ? "line" : e.arch === "fort" ? "brig" : e.arch) : e.merchant ? "fluyt" : "brig"; }
