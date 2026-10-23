"use strict";
// ---------- Ships ----------
function makeShip(sc, tex, x, y) {
  const spr = sc.add.image(x, y, tex).setDepth(5);
  return { spr, x, y, rot: rand(0, TAU), speed: 0, vx: 0, vy: 0, alive: true, burnT: 0, burnDps: 0, burnFx: 0, wakeT: 0, turnRate: 2.2 };
}
function playerGuns() {
  const mk = id => { const g = GUNS[id], m = gunLvMul(save.gunLv[id]);
    return { id, dmg: g.dmg * m, burn: g.burn ? g.burn * m : 0, range: g.range, interval: 60 / g.rpm, cd: 0 }; };
  return Object.fromEntries(MOUNTS.map(({ key }) => [key, save[key].map(mk)]));
}
function applyPlayerStats(full) {
  player.maxHp = yardVal("hull");
  if (full) player.hp = player.maxHp;
  player.maxSpeed = yardVal("sails");
  player.cap = yardVal("hold");
  player.guns = playerGuns();
  applyShipArt(player, save.ship, "player");   // hull art, hitbox, muzzles and view follow the ship in the save
}
function makePlayer(sc) {
  const p = makeShip(sc, "ship-player", PORT.x + 140, PORT.y);
  p.isPlayer = true; p.rot = 0; p.turnRate = 2.5; p.spr.setDepth(6);
  player = p; applyPlayerStats(true);
  return p;
}
// Enemy level is set purely by distance from the harbor: each level owns one ring, ZONE_STEP wide.
const SPAWN_R_MIN = SAFE_R + 120, SPAWN_R_MAX = Math.hypot(PORT.x - 150, PORT.y - 150);
const levelAt = d => clamp(1 + Math.floor((d - SAFE_R) / ZONE_STEP), 1, 14);
const ringOf = L => ({ r0: Math.max(SPAWN_R_MIN, SAFE_R + (L - 1) * ZONE_STEP), r1: SAFE_R + L * ZONE_STEP });
// `at` = { x, y, merchant } places one exactly (the tutorial's easy first target); otherwise a random spot.
function spawnEnemy(sc, at) {
  let x, y, ok = !!at;
  if (at) ({ x, y } = at);
  for (let tries = 0; tries < 40 && !ok; tries++) {
    // radius (not area) is uniform, so every ring gets a similar share and low levels stay common near the harbor
    const r = rand(SPAWN_R_MIN, SPAWN_R_MAX), a = rand(0, TAU);
    x = PORT.x + Math.cos(a) * r; y = PORT.y + Math.sin(a) * r;
    ok = x > 150 && x < W - 150 && y > 150 && y < H - 150 &&
         (!player || Math.hypot(x - player.x, y - player.y) > 750) &&
         !islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r * 1.3 + 40);
  }
  if (!ok) return;
  const L = levelAt(Math.hypot(x - PORT.x, y - PORT.y));
  const merchant = at ? !!at.merchant : Math.random() < 0.35;
  const tex = merchant ? "ship-merchant" : (Math.random() < 0.5 ? "ship-pirate" : "ship-navy");
  const st = enemyStats(L, merchant);
  const e = makeShip(sc, tex, x, y);
  Object.assign(e, { L, merchant, maxHp: st.hp, hp: st.hp, maxSpeed: st.speed, loot: st.loot, aimLead: st.lead, aimSpread: st.spread, angry: 0, thinkT: 0, wander: null, turnRate: 1.7,
    faction: merchant ? "merchant" : tex === "ship-pirate" ? "pirate" : "navy",
    target: null, chaseFrom: null, retarget: rand(0, 0.5), attacker: null, ignore: new Map() });
  const mk = () => ({ dmg: st.dmg, burn: 0, range: st.range, interval: st.interval, cd: rand(0.5, 2.2) });
  e.guns = { left: Array.from({ length: st.per }, mk), right: Array.from({ length: st.per }, mk) };
  e.badge = sc.add.text(x, y - 36, "", { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#1b1410", padding: { x: 5, y: 1 } })
    .setOrigin(0.5).setDepth(9);
  refreshBadge(e);
  applyShipArt(e);   // class + livery art and hitbox (js/art.js)
  enemies.push(e);
  return e;
}
function refreshBadge(e) {
  const tier = threatTier(e.L), c = tier.color;   // glyph + colour, so threat reads without colour vision
  e.badge.setText(tier.glyph + " " + t("badge", { n: e.L, g: fmt(e.loot) })).setBackgroundColor(c).setColor(c === "#d9493a" ? "#fff6ea" : "#1b1410");
}

// ---------- Steering & AI ----------
function steer(s, desired, thr, dt) {
  const turn = s.turnRate * dt * (0.45 + 0.55 * Math.min(1, s.speed / s.maxSpeed + 0.2));
  if (desired != null) s.rot += clamp(angDiff(desired, s.rot), -turn, turn);
  const target = thr * s.maxSpeed;
  s.speed += clamp(target - s.speed, -s.maxSpeed * 1.1 * dt, s.maxSpeed * 0.7 * dt);
}
function avoidIslands(s, desired) {
  const lx = s.x + Math.cos(s.rot) * 120, ly = s.y + Math.sin(s.rot) * 120;
  for (const isl of islands) {
    if (Math.hypot(isl.x - lx, isl.y - ly) < isl.r * 1.05 + 45) {
      const cross = Math.cos(s.rot) * (isl.y - s.y) - Math.sin(s.rot) * (isl.x - s.x);
      return s.rot - Math.sign(cross || 1) * 1.3;
    }
  }
  return desired;
}
// Who fights whom:
//   pirate -> attacks everyone that is not a pirate (player, navy, merchants)
//   navy   -> attacks pirates and the player
//   merchant -> attacks nobody; runs from pirates and the player, fires back at whoever shot it
// Anyone fights back against the ship that last hit it.
const LEASH = 900;          // an AI gives up once it has sailed this far from where the chase began and still cannot reach
const GIVE_UP_DIST = 1300;  // ...or as soon as the target is this far away
const IGNORE_TIME = 10;     // seconds an AI ignores a target it gave up on
const inSafe = s => Math.hypot(s.x - PORT.x, s.y - PORT.y) < SAFE_R * 0.6;
function isHostile(e, o) {
  if (!o || o === e || !o.alive) return false;
  if (o.isPlayer && (docked || inSafe(o))) return false;
  if (e.attacker === o && e.angry > 0) return true;
  const g = o.isPlayer ? "player" : o.faction;
  if (e.faction === "pirate") return g !== "pirate";
  if (e.faction === "navy") return g === "pirate" || g === "player";
  return false;
}
const ignoring = (e, o, now) => (e.ignore.get(o) || 0) > now;
function pickTarget(e, now) {
  const aggro = 520 + e.L * 15;
  let best = null, bd = 1e9;
  for (const o of enemies.concat([player])) {
    if (!isHostile(e, o) || ignoring(e, o, now)) continue;
    const d = dist(e, o), lim = e.attacker === o && e.angry > 0 ? 1100 : aggro;
    if (d < lim && d < bd) { best = o; bd = d; }
  }
  return best;
}
function onScreen(x, y, pad = 60) { const v = S.cameras.main.worldView; return x > v.x - pad && x < v.right + pad && y > v.y - pad && y < v.bottom + pad; }
function giveUp(e, tg, now) {
  e.ignore.set(tg, now + IGNORE_TIME);
  if (e.attacker === tg) e.angry = 0;
  e.target = null;
  e.wander = { ...e.chaseFrom }; e.thinkT = rand(6, 10);     // head back toward where the chase began
  if (onScreen(e.x, e.y)) floatText(e.x, e.y - 48, t("gaveUp"), "#c9d6da", 14);
}
function think(e, dt) {
  const now = S.time.now / 1000;
  e.angry = Math.max(0, e.angry - dt);
  if (e.target && (!isHostile(e, e.target) || ignoring(e, e.target, now))) e.target = null;
  e.retarget -= dt;
  if (e.retarget <= 0) {
    e.retarget = 0.5;
    const nt = pickTarget(e, now);
    if (nt && nt !== e.target) { e.target = nt; e.chaseFrom = { x: e.x, y: e.y }; }
  }
  let desired = null, thr = 0.55;
  const tg = e.target;
  if (tg) {
    const d = dist(e, tg), toT = Math.atan2(tg.y - e.y, tg.x - e.x);
    const range = e.guns.left[0]?.range ?? 250;
    const chased = Math.hypot(e.x - e.chaseFrom.x, e.y - e.chaseFrom.y);
    if ((chased > LEASH && d > range) || d > GIVE_UP_DIST) giveUp(e, tg, now);
    else if (e.merchant) { desired = toT + Math.PI + Math.sin(now * 1.1 + e.L) * 0.5; thr = 1; }
    else if (d > range * 0.85) { desired = toT; thr = 1; }
    else {
      // present a broadside: run perpendicular to the target, side chosen by current heading
      const a1 = toT + Math.PI / 2, a2 = toT - Math.PI / 2;
      desired = Math.abs(angDiff(a1, e.rot)) < Math.abs(angDiff(a2, e.rot)) ? a1 : a2;
      if (d < range * 0.45) desired += (desired === a1 ? 0.35 : -0.35);
      thr = 0.75;
    }
  }
  if (desired == null && e.merchant) {
    // merchants run from any pirate or the player that comes close, even before a shot is fired
    let threat = null, td = 480;
    for (const o of enemies.concat([player])) {
      if (!o.alive || o === e || !(o.isPlayer ? !docked && !inSafe(o) : o.faction === "pirate")) continue;
      const d = dist(e, o); if (d < td) { threat = o; td = d; }
    }
    if (threat) { desired = Math.atan2(e.y - threat.y, e.x - threat.x) + Math.sin(now * 1.1 + e.L) * 0.5; thr = 1; }
  }
  if (desired == null) {
    e.thinkT -= dt;
    if (!e.wander || e.thinkT <= 0 || Math.hypot(e.wander.x - e.x, e.wander.y - e.y) < 80) {
      // idle ships roam their own level's ring, so stronger ships don't drift in toward the harbor
      const { r0, r1 } = ringOf(e.L), r = rand(r0, r1);
      const a = Math.atan2(e.y - PORT.y, e.x - PORT.x) + rand(-1, 1) * 600 / r;
      e.thinkT = rand(5, 10);
      e.wander = { x: clamp(PORT.x + Math.cos(a) * r, 200, W - 200), y: clamp(PORT.y + Math.sin(a) * r, 200, H - 200) };
    }
    desired = Math.atan2(e.wander.y - e.y, e.wander.x - e.x); thr = 0.5;
  }
  // stay out of the harbor's safe waters
  const dPort = Math.hypot(e.x - PORT.x, e.y - PORT.y);
  if (dPort < SAFE_R + 60) { desired = Math.atan2(e.y - PORT.y, e.x - PORT.x); thr = 0.8; }
  desired = avoidIslands(e, desired);
  steer(e, desired, thr, dt);
}

function move(s, dt) {
  s.vx = Math.cos(s.rot) * s.speed; s.vy = Math.sin(s.rot) * s.speed;
  s.x = clamp(s.x + s.vx * dt, 60, W - 60); s.y = clamp(s.y + s.vy * dt, 60, H - 60);
  // islands are solid
  const solid = islands.concat([{ x: PORT.x, y: PORT.y, r: PORT_ISLAND_R / 0.9 }]);
  for (const isl of solid) {
    const dx = s.x - isl.x, dy = s.y - isl.y, d = Math.hypot(dx, dy), R = isl.r * 0.9 + 18;
    if (d < R && d > 0.01) { s.x = isl.x + dx / d * R; s.y = isl.y + dy / d * R; s.speed *= 0.9; }
  }
}
