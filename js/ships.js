"use strict";
// ---------- Ships ----------
function makeShip(sc, tex, x, y) {
  const spr = sc.add.image(x, y, tex).setDepth(5);
  return { spr, x, y, rot: rand(0, TAU), speed: 0, vx: 0, vy: 0, alive: true, burnT: 0, burnDps: 0, burnFx: 0, wakeT: 0, turnRate: 2.2 };
}
function playerGuns() {
  const mk = id => { const g = GUNS[id], m = gunLvMul(save.gunLv[id]);
    return { id, dmg: g.dmg * m, burn: g.burn ? g.burn * m : 0, chain: !!g.chain, range: g.range, speed: g.speed || BALL_SPEED, interval: 60 / g.rpm, cd: 0 }; };
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
// Enemy level is set purely by distance from the harbor: each level owns one ring, ZONE_STEP wide (js/world-seas.js),
// plus 3 levels per New Game+ cycle.
const SPAWN_R_MIN = SAFE_R + 120, SPAWN_R_MAX = Math.hypot(PORT.x - 150, PORT.y - 150);
const levelAt = d => ringAt(d) + levelBonus();
// The ring an enemy of level L roams when idle (the outermost one runs on into the corners).
const ringOf = L => { const k = clamp(L - levelBonus(), 1, MAX_RING);
  return { r0: Math.max(SPAWN_R_MIN, ringEdge(k)), r1: k === MAX_RING ? SPAWN_R_MAX : ringEdge(k + 1) }; };
// at: { x, y, faction } places a chosen ship (bosses, escorts); otherwise the ring quotas pick where. Returns the ship.
// at.near lets it start closer than the usual 750 px to the player (the tutorial's easy first target, js/tutorial.js).
function spawnEnemy(sc, at) {
  let x, y, ok = false;
  const ring = at ? 0 : spawnRing();
  for (let tries = 0; tries < 40 && !ok; tries++) {
    ({ x, y } = at ? { x: at.x + rand(-60, 60), y: at.y + rand(-60, 60) } : spawnPoint(ring));
    ok = x > 150 && x < W - 150 && y > 150 && y < H - 150 &&
         (!player || (at && at.near) || Math.hypot(x - player.x, y - player.y) > 750) &&
         !islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r * 1.3 + 40);
  }
  if (!ok) return null;
  const L = levelAt(Math.hypot(x - PORT.x, y - PORT.y)), faction = at && at.faction ? at.faction : pickFaction();
  const e = makeEnemy(sc, x, y, L, faction);
  // placed ships (bosses, escorts, the tutorial's target) sail alone; a convoy only fills what its own ring is short of
  // its quota (js/world-seas.js), so it never starves the other rings
  if (e.merchant && !at) maybeConvoy(sc, e, convoyRoom(e));
  return e;
}
// One enemy of level L and faction at (x, y); its class (js/archetypes.js) is picked by level and faction unless given.
// A campaign boss or escort re-takes its bounty's class next frame (js/volley.js campaignOutfit).
function makeEnemy(sc, x, y, L, faction, cls = pickArch(L, faction)) {
  const e = makeShip(sc, "ship-" + faction, x, y);
  Object.assign(e, { L, ring: ringAt(Math.hypot(x - PORT.x, y - PORT.y)), faction, angry: 0, thinkT: 0, wander: null, target: null, chaseFrom: null,
    retarget: rand(0, 0.5), attacker: null, ignore: new Map() });
  e.badge = sc.add.text(x, y - 36, "", { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#1b1410", padding: { x: 5, y: 1 } })
    .setOrigin(0.5).setDepth(9);
  outfitEnemy(e, cls);   // numbers, guns, and the class's art + hitbox via applyShipArt (js/art.js)
  refreshBadge(e);
  enemies.push(e);
  return e;
}
const LOOT_SEEN_R = 650;   // px from the player inside which an enemy's badge shows its plunder
function refreshBadge(e) {
  const tier = threatTier(e.threatL ?? e.L), c = tier.color;   // glyph + colour (by how hard it fights, js/archetypes.js), readable without colour vision
  // the plunder aboard only reads through the spyglass, so a distant fleet is a tidy row of levels, not a price list
  const label = e.lootSeen ? t("badge", { n: e.L, g: fmt(e.loot) }) : t("badgeLv", { n: e.L });
  e.badge.setText(tier.glyph + " " + label).setBackgroundColor(c).setColor(c === "#d9493a" ? "#fff6ea" : "#1b1410");
}

// ---------- Steering & AI ----------
// Letting go of the helm (which is also how touch fires) doesn't brake the player's ship at once: it holds its heading at
// COAST_K of its speed for COAST_T s, then slows, so firing doesn't make you a sitting target. Chain shot (s.chainT)
// costs a ship speed and turn while its rigging is torn.
const COAST_T = 1.2, COAST_K = 0.8;
function steer(s, desired, thr, dt) {
  if (s.isPlayer) {
    if (desired == null && thr === 0) {
      if (s.helmThr > 0) { s.coastT = COAST_T; s.coastV = s.speed * COAST_K; }
      if (s.coastT > 0) { s.coastT -= dt; thr = Math.min(s.coastV, s.speed) / s.maxSpeed; }
    } else s.coastT = 0;
    s.helmThr = desired == null ? 0 : thr;
  }
  const torn = s.chainT > 0;
  const turn = s.turnRate * (torn ? CHAIN_TURN : 1) * dt * (0.45 + 0.55 * Math.min(1, s.speed / s.maxSpeed + 0.2));
  if (desired != null) s.rot += clamp(angDiff(desired, s.rot), -turn, turn);
  const target = thr * s.maxSpeed * (torn ? CHAIN_SPEED : 1);
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
const inSafe = s => Math.hypot(s.x - PORT.x, s.y - PORT.y) < SAFE_R * 0.6 || inTruce(s);   // inTruce: the outpost, js/campaign.js
function isHostile(e, o) {
  if (!o || o === e || !o.alive) return false;
  if (o.isPlayer && (docked || inSafe(o))) return false;
  if (e.attacker === o && e.angry > 0) return true;
  const g = o.isPlayer ? "player" : o.faction;
  if (e.faction === "pirate") return g !== "pirate";
  if (e.faction === "navy") return g === "pirate" || g === "player";
  if (e.escort) return g === "pirate";   // a convoy's escort brig keeps pirates off its fluyts
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
  if (e.fixed) return fortThink(e, dt);   // shore batteries (js/forts.js) only pick targets
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
    const range = e.range ?? 250;
    const chased = Math.hypot(e.x - e.chaseFrom.x, e.y - e.chaseFrom.y);
    if ((chased > LEASH && d > range) || d > GIVE_UP_DIST) giveUp(e, tg, now);
    else ({ desired, thr } = archTactic(e, tg, d, toT, now));   // each class's battle plan (js/archetypes.js)
  }
  if (desired == null) { const c = convoyIdle(e); if (c) ({ desired, thr } = c); }
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
  if (s.fixed) { s.vx = s.vy = s.speed = 0; return; }   // shore batteries stand on their island
  s.vx = Math.cos(s.rot) * s.speed; s.vy = Math.sin(s.rot) * s.speed;
  s.x = clamp(s.x + s.vx * dt, 60, W - 60); s.y = clamp(s.y + s.vy * dt, 60, H - 60);
  // islands are solid to the whole hull: the hit capsule (s.hl / s.hw, cutter to man-o'-war) is kept off the rock
  const solid = islands.concat([{ x: PORT.x, y: PORT.y, r: PORT_ISLAND_R / 0.9 }]);
  const c = Math.cos(s.rot), sn = Math.sin(s.rot), hl = s.hl ?? 28, hw = s.hw ?? 13;
  for (const isl of solid) {
    const R = isl.r * 0.9 + hw + 5, ix = isl.x - s.x, iy = isl.y - s.y;
    if (Math.abs(ix) > R + hl || Math.abs(iy) > R + hl) continue;
    const k = clamp(ix * c + iy * sn, -hl, hl), qx = s.x + c * k - isl.x, qy = s.y + sn * k - isl.y, d = Math.hypot(qx, qy);
    if (d < R && d > 0.01) { s.x += qx / d * (R - d); s.y += qy / d * (R - d); s.speed *= 0.9; }
  }
}
// Radius two hulls keep between them (half capsule length + beam): 20 px for the old one-size hull, more for big ships.
const shipRadius = s => ((s.hl ?? 28) + (s.hw ?? 13)) / 2;
