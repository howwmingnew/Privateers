"use strict";
// ---------- Ships ----------
function makeShip(sc, tex, x, y) {
  const spr = sc.add.image(x, y, tex).setDepth(5);
  return { spr, x, y, rot: grand(0, TAU), speed: 0, vx: 0, vy: 0, alive: true, burnT: 0, burnDps: 0, burnFx: 0, wakeT: 0, turnRate: 2.2 };
}
function playerGuns() {
  // pi / pn: the gun's port and the port count, so a muzzle sits at its port even with empty ports beside it
  const mk = (gun, pi, pn) => { const id = gun.g, g = GUNS[id], m = gunLvMul(gun.lv) * shipGunK();
    return typeof gxGun === "function" ? { ...gxGun(gun, g, m), id, pi, pn }   // rarity and affixes shape the gun (js/gear-fx.js)
      : { id, pi, pn, dmg: g.dmg * m, burn: g.burn ? g.burn * m : 0, chain: !!g.chain, range: g.range, speed: g.speed || BALL_SPEED, interval: 60 / g.rpm, cd: 0 }; };
  return Object.fromEntries(MOUNTS.map(({ key }) => [key, save[key].flatMap((gun, i, ports) => gun ? [mk(gun, i, ports.length)] : [])]));
}
function applyPlayerStats(full) {
  player.maxHp = Math.round(yardVal("hull") * gearMul("hp"));   // the worn gear's share (js/gear-fx.js) is 1 + 0 with none
  if (full) player.hp = player.maxHp;
  player.maxSpeed = yardVal("sails") * gearMul("spd");
  player.turnRate = PLAYER_TURN * shipTurn() * gearMul("turn");   // the fast line turns tighter, the gunboat wider (js/data.js)
  player.cap = Math.round(yardVal("hold") * gearMul("cargo"));
  player.guns = playerGuns();
  applyShipArt(player, save.ship, liveryFor(player));   // hull art, hitbox, muzzles and view follow the ship in the save
}
function makePlayer(sc) {
  const p = makeShip(sc, "ship-player", PORT.x + 140, PORT.y);
  p.isPlayer = true; p.rot = 0; p.spr.setDepth(6);
  player = p; applyPlayerStats(true);
  return p;
}
// Enemy level is set purely by distance from the harbor: each level owns one ring, ZONE_STEP wide (js/world-seas.js),
// plus 3 levels per New Game+ cycle.
const SPAWN_R_MIN = SAFE_R + 120, SPAWN_R_MAX = Math.hypot(PORT.x - 150, PORT.y - 150);
const levelAt = d => ringAt(d) + levelBonus() + warLevels(ringAt(d));
// The ring an enemy of level L roams when idle (the outermost one runs on into the corners).
const ringBand = k => ({ r0: Math.max(SPAWN_R_MIN, ringEdge(k)), r1: k === MAX_RING ? SPAWN_R_MAX : ringEdge(k + 1) });
const ringOf = L => ringBand(clamp(L - levelBonus(), 1, MAX_RING));
// at: { x, y, faction } places a chosen ship (bosses, escorts); otherwise the ring quotas pick where. Returns the ship.
// at.near lets it start closer than the usual 750 px to the player (the tutorial's easy first target, js/tutorial.js).
function spawnEnemy(sc, at) {
  let x, y, ok = false;
  const ring = at ? 0 : spawnRing();
  for (let tries = 0; tries < 40 && !ok; tries++) {
    ({ x, y } = at ? { x: at.x + grand(-60, 60), y: at.y + grand(-60, 60) } : spawnPoint(ring));
    ok = x > 150 && x < W - 150 && y > 150 && y < H - 150 &&
         (!player || (at && at.near) || Math.hypot(x - player.x, y - player.y) > 750) &&
         !islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r * 1.3 + 40);
  }
  if (!ok) return null;
  // placed ships (bosses, escorts, the tutorial's mark) keep their designed level: the war's escalation is for the open sea
  const d0 = Math.hypot(x - PORT.x, y - PORT.y), L = at ? ringAt(d0) + levelBonus() : levelAt(d0);
  const faction = at && at.faction ? at.faction : pickFaction();
  const e = makeEnemy(sc, x, y, L, faction, undefined, !!at);
  // placed ships (bosses, escorts, the tutorial's target) sail alone; a fleet only fills what its own ring is short of
  // its quota (js/world-seas.js), so it never starves the other rings (js/fleet.js)
  if (!at) maybeFleet(sc, e);
  return e;
}
// One enemy of level L and faction at (x, y); its class (js/archetypes.js) is picked by level and faction unless given.
// A campaign boss or escort re-takes its bounty's class next frame (js/volley.js campaignOutfit).
function makeEnemy(sc, x, y, L, faction, cls = pickArch(L, faction), placed = false) {
  const e = makeShip(sc, "ship-" + faction, x, y);
  Object.assign(e, { L, ring: ringAt(Math.hypot(x - PORT.x, y - PORT.y)), faction, angry: 0, thinkT: 0, wander: null, target: null, chaseFrom: null,
    retarget: rand(0, 0.5), attacker: null, ignore: new Map() });
  e.badge = worldText(x, y - 36, "", { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#1b1410", padding: { x: 5, y: 1 } })   // sc is S: worldText (js/art.js) draws into S
    .setOrigin(0.5).setDepth(9);
  outfitEnemy(e, cls);   // numbers, guns, and the class's art + hitbox via applyShipArt (js/art.js)
  if (typeof tameFirstVoyage === "function") tameFirstVoyage(e, placed);   // no ▲▲ ship in the Shallows on a first voyage, none above a newcomer's cap near the harbor (js/notify-order.js)
  refreshBadge(e);
  enemies.push(e);
  return e;
}
const LOOT_SEEN_R = 450;   // px from the player inside which an enemy's badge shows its plunder (about gun range)
// The plate's colour and glyph say how strong a ship is next to you; this icon says whose it is (the Navy's sinking makes you Wanted).
const factionIcon = e => e.merchant || e.faction === "merchant" ? "$ " : e.faction === "navy" ? "⚓ " : e.faction === "pirate" ? "☠ " : "";
function refreshBadge(e) {
  // Phaser redraws and re-uploads the whole label on every setColor / setBackgroundColor, even to the colour it has, so the
  // colours go straight into its style and it is drawn once. Compared with the label itself, not a remembered copy: js/flee.js adds its tag with setText.
  const b = e.badge, paint = (text, bg, fg) => {
    const st = b.style;
    if (b.text === text && st.backgroundColor === bg && st.color === fg) return;
    st.backgroundColor = bg; st.color = fg;
    if (b.text !== text) b.setText(text); else b.updateText();
  };
  if (e.ally) return paint("◆ " + e.allyName, ALLY_COLOR, "#0d2a1f");   // an escort's plate is its name (js/escort-ai.js)
  const tier = threatTier(e.threatL ?? e.L), c = tier.color;   // glyph + colour (by how hard it fights, js/archetypes.js), readable without colour vision
  // the plunder aboard only reads through the spyglass, so a distant fleet is a tidy row of levels, not a price list
  // the number is how hard it fights (threatL), the same figure its colour and glyph compare with your Ship Lv
  const n = e.threatL ?? e.L, label = e.lootSeen ? t("badge", { n, g: fmt(e.loot + (e.stolen || 0)) }) : t("badgeLv", { n });
  paint(factionIcon(e) + tier.glyph + " " + label, c, c === "#d9493a" ? "#fff6ea" : "#1b1410");
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
      if (s.coastT > 0) { s.coastT -= dt; thr = Math.min(s.coastV, s.speed) / Math.max(1, s.maxSpeed); }
    } else s.coastT = 0;
    s.helmThr = desired == null ? 0 : thr;
  }
  if (typeof disLost === "function" && disLost(s)) { s.rot += (s.disSpin || 1) * dt; desired = null; }   // a rogue wave has torn the helm away (js/disasters.js)
  const torn = s.chainT > 0;
  const turn = s.turnRate * (torn ? CHAIN_TURN : 1) * (typeof disTurn === "function" ? disTurn(s) : 1) * dt * (0.45 + 0.55 * Math.min(1, s.speed / Math.max(1, s.maxSpeed) + 0.2));
  if (desired != null) s.rot += clamp(angDiff(desired, s.rot), -turn, turn);
  else if (typeof wxYaw === "function") s.rot += wxYaw(s) * dt;   // a storm slews a hull whose helm is let go (js/weather.js)
  const target = thr * s.maxSpeed * (torn ? CHAIN_SPEED : 1) * (typeof gxSpeedK === "function" ? gxSpeedK(s) : 1);   // a legendary gun drags its target, a legendary sail speeds a hard turn (js/gear-fx.js)
  s.speed += clamp(target - s.speed, -s.maxSpeed * 1.1 * dt, s.maxSpeed * 0.7 * dt);
}
function avoidIslands(s, desired) {
  const away = s.shoreAway;   // just rammed a rock (js/collision.js): head out from it for a moment
  if (away && away.until > S.time.now / 1000) return Math.atan2(s.y - away.y, s.x - away.x);
  const look = 120 + s.speed * 0.5, lx = s.x + Math.cos(s.rot) * look, ly = s.y + Math.sin(s.rot) * look;   // a faster hull needs more warning
  for (const isl of islandsNear(lx, ly)) {   // only the rocks near the look-ahead point, in map order (js/ai-nav.js)
    const dx = isl.x - lx, dy = isl.y - ly, R = isl.r * 1.05 + 45 + (s.hw ?? 13);
    if (dx * dx + dy * dy < R * R) {
      const cross = Math.cos(s.rot) * (isl.y - s.y) - Math.sin(s.rot) * (isl.x - s.x);
      return s.rot - Math.sign(cross || 1) * 1.3;
    }
  }
  for (const isl of islandsNear(s.x, s.y)) { const slid = slideOff(s, isl, desired); if (slid !== desired) return slid; }   // about to touch a rock: turn along it (js/ai-nav.js)
  return desired;
}
// Who fights whom:
//   pirate -> attacks everyone that is not a pirate (player, navy, merchants)
//   navy   -> attacks pirates, and the player and escorts only from 2 stars of heat (or when provoked: js/novice.js navyCalm)
//   merchant -> attacks nobody; runs from pirates and the player, fires back at whoever shot it
// Anyone fights back against the ship that last hit it.
const LEASH = 900;          // an AI gives up once it has sailed this far from where the chase began and still cannot reach
const GIVE_UP_DIST = 1300;  // ...or as soon as the target is this far away
const IGNORE_TIME = 10;     // seconds an AI ignores a target it gave up on
const SAFE_IN2 = (SAFE_R * 0.6) ** 2;   // squared: inSafe runs in every hostility check, many times a frame
const inSafe = s => { const dx = s.x - PORT.x, dy = s.y - PORT.y; return dx * dx + dy * dy < SAFE_IN2 || inTruce(s); };   // inTruce: the outpost, js/campaign.js
function isHostile(e, o) {
  if (!o || o === e || !o.alive || e.struck) return false;   // a ship that struck her colours fights no more (js/strike.js)
  if (o.isPlayer && (docked || inSafe(o))) return false;
  if (bossFeud(e, o)) return false;   // bosses, rematch captains and their guards stay out of the other AI's fights (js/archetypes.js)
  if (e.ally) return !o.isPlayer && !o.fixed && !o.ally && (o.faction === "pirate" || o.faction === "navy");   // an escort fights pirates and the Navy, not batteries or merchants (js/escort-ai.js)
  if (e.attacker === o && e.angry > 0) return true;
  if (o.ally && typeof navyCalm === "function" && navyCalm(e)) return false;   // under 2 stars the Navy does not open on the escorts either (js/novice.js)
  if (o.isPlayer && typeof practiceShip === "function" && practiceShip(e)) return false;   // a practice target never fires first (js/novice.js)
  if (o.isPlayer && typeof noviceSpare === "function" && noviceSpare(e)) return false;   // a newcomer's first bounty is a duel; the Shallows are not hunted (js/novice.js)
  const g = o.isPlayer ? "player" : o.faction;
  if (e.faction === "pirate") return g !== "pirate";
  if (e.faction === "navy") return g === "pirate" || g === "player" || g === "ally";
  if (e.escort) return g === "pirate";   // a convoy's escort brig keeps pirates off its fluyts
  return false;
}
const ignoring = (e, o, now) => (e.ignore.get(o) || 0) > now;
function pickTarget(e, now) {
  const aggro = 520 + e.L * 15, sight = typeof disSight === "function" ? disSight() : Infinity;   // fog: an AI sees only so far (js/disasters.js)
  // the first voyage's opening: only the tutorial's mark, or a ship the player hit, goes for the player (js/tutorial.js)
  const calm = typeof tutorialCalm === "function" && tutorialCalm() && e !== tut.target && !(e.attacker === player && e.angry > 0);
  let best = null, bd = 1e9;
  for (const o of enemies.concat([player])) {
    if (!isHostile(e, o) || ignoring(e, o, now) || (calm && o === player)) continue;
    const d = dist(e, o), lim = Math.min(e.attacker === o && e.angry > 0 ? 1100 : aggro, sight);
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
    if (e.ally) escortRetarget(e, now);   // the escort's stance picks (js/escort-ai.js)
    else {
      const nt = (e.backOffT || 0) > now ? null : pickTarget(e, now);   // turning back out of the Shallows (js/sea-guard.js)
      if (nt && nt !== e.target) { e.target = nt; e.chaseFrom = { x: e.x, y: e.y }; }
    }
  }
  if (typeof disFogLose === "function") disFogLose(e);   // a target lost in the fog is chased to where it was last seen
  let desired = null, thr = 0.55, fd = 0, fToT = 0;
  const tg = e.target;
  if (tg) {
    const d = dist(e, tg), toT = Math.atan2(tg.y - e.y, tg.x - e.x);
    const range = e.range ?? 250;
    const cf = e.chaseFrom || (e.chaseFrom = { x: e.x, y: e.y });   // a target set without its chase origin must not stop the game loop
    const chased = dist(e, cf);
    // an ordinary ship breaks off once its quarry has fled two or more rings shallower than the ring it calls home
    const shoal = tg === player && !e.boss && !e.escortOf && e.ring && ringAt(dist(player, PORT)) <= e.ring - 2;
    const stands = typeof bossStands === "function" && bossStands(e);   // Red Ned keeps the fight on however far it has run (js/campaign.js, #108)
    if ((chased > LEASH && d > range && !stands) || d > GIVE_UP_DIST || shoal) giveUp(e, tg, now);
    else { ({ desired, thr } = archTactic(e, tg, d, toT, now)); fd = d; fToT = toT; }   // each class's battle plan (js/archetypes.js)
  }
  if (e.fleet) { const c = fleetSteer(e, tg, fd, fToT, now); if (c) ({ desired, thr } = c); }   // formation, flanking, a lost lead (js/fleet.js)
  const plunder = typeof aipSeek === "function" && (desired == null || (tg && dist(e, tg) >= AIP_BREAK)) ? aipSeek(e, tg ? dist(e, tg) : 0, dt) : null;   // loose loot (js/ai-plunder.js)
  if (plunder) ({ desired, thr } = plunder);
  if (typeof fleeSteer === "function") { const c = fleeSteer(e, now); if (c) ({ desired, thr } = c); }   // outmatched or beaten: run, downwind if it helps (js/flee.js)
  if (typeof bossTether === "function") { const c = bossTether(e, desired, thr); if (c) ({ desired, thr } = c); }   // a boss keeps to its own waters (js/campaign.js)
  if (typeof disDodge === "function") { const c = disDodge(e); if (c) ({ desired, thr } = c); }   // clear of a disaster that has been noticed (js/disasters.js)
  if (desired == null && e.merchant && !e.tutMark && !(typeof practiceTarget === "function" && practiceTarget(e))) {   // (the tutorial's mark holds its course: js/tutorial.js)
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
    if (!e.wander || e.thinkT <= 0 || dist(e.wander, e) < 80) {
      // idle ships roam their own level's ring, so stronger ships don't drift in toward the harbor
      const { r0, r1 } = e.ring ? ringBand(e.ring) : ringOf(e.L), r = rand(r0, r1);   // by home ring: level != ring once the war escalates
      const a = Math.atan2(e.y - PORT.y, e.x - PORT.x) + rand(-1, 1) * 600 / r;
      e.thinkT = rand(5, 10);
      const pt = { x: clamp(PORT.x + Math.cos(a) * r, 200, W - 200), y: clamp(PORT.y + Math.sin(a) * r, 200, H - 200) };
      e.wander = clearOfTruces(pt);   // never a point on the outpost's hulk or inside a station's circle (js/campaign.js, js/ai-nav.js)
    }
    desired = Math.atan2(e.wander.y - e.y, e.wander.x - e.x); thr = 0.5;
    const tc = truceCentre(e); if (tc) { desired = Math.atan2(e.y - tc.y, e.x - tc.x); thr = 0.7; }   // an idle ship inside the truce circle sails out of it
  }
  // stay out of the harbor's safe waters
  const dPort = dist(e, PORT);
  if (dPort < SAFE_R + 60 && !e.ally) { desired = Math.atan2(e.y - PORT.y, e.x - PORT.x); thr = 0.8; }
  desired = avoidIslands(e, desired);
  steer(e, desired, thr, dt);
}

const NO_PUSH = { x: 0, y: 0 };
function move(s, dt) {
  if (s.fixed) { s.vx = s.vy = s.speed = 0; return; }   // shore batteries stand on their island
  const wm = (typeof wxMul === "function" ? wxMul(s) : 1) * (typeof disMul === "function" ? disMul(s) : 1), lee = typeof wxLee === "function" ? wxLee(s) : NO_PUSH;   // wind and storm (js/weather.js), disasters (js/disasters.js)
  const dp = typeof disPush === "function" ? disPush(s) : NO_PUSH;   // a whirl's pull or a wave's shove, on every hull alike
  s.vx = Math.cos(s.rot) * s.speed * wm + dp.x; s.vy = Math.sin(s.rot) * s.speed * wm + dp.y;   // a wave's shove counts as speed, so a hull driven onto a rock is hurt by it (js/collision.js)
  s.x = clamp(s.x + (s.vx + lee.x) * dt, 60, W - 60); s.y = clamp(s.y + (s.vy + lee.y) * dt, 60, H - 60);
  // islands are solid to the whole hull: the hit capsule (s.hl / s.hw, cutter to man-o'-war) is kept off the rock
  const c = Math.cos(s.rot), sn = Math.sin(s.rot), hl = s.hl ?? 28, hw = s.hw ?? 13;
  for (const isl of islandsNear(s.x, s.y)) pushOffRock(s, isl, c, sn, hl, hw, dt);   // the rocks near it, in map order (js/ai-nav.js)
  if (!portsOff()) pushOffRock(s, HARBOR_ROCK, c, sn, hl, hw, dt);   // the harbor island last, as before; none in the daily sea (js/ports.js)
}
function pushOffRock(s, isl, c, sn, hl, hw, dt) {
  const R = isl.r * 0.9 + hw + 5, ix = isl.x - s.x, iy = isl.y - s.y;
  if (Math.abs(ix) > R + hl || Math.abs(iy) > R + hl) return;
  const k = clamp(ix * c + iy * sn, -hl, hl), qx = s.x + c * k - isl.x, qy = s.y + sn * k - isl.y, d = Math.sqrt(qx * qx + qy * qy);
  if (d < R && d > 0.01) {
    crashIsland(s, isl, -qx / d, -qy / d);   // damage by the speed it arrived at (js/collision.js)
    s.x += qx / d * (R - d); s.y += qy / d * (R - d);
    const sl = slideAlong(s.rot, -qx / d, -qy / d);   // glide along the shore: only the speed that drove into the rock is lost (js/ai-nav.js)
    s.speed *= sl.keep;
    if (s.isPlayer) s.rot += sl.turn * dt;
  } else if (s.isPlayer && d < R + SLIDE_SKIN && d > 0.01) s.rot += slideAlong(s.rot, -qx / d, -qy / d).turn * dt;   // the bow keeps turning along the rock while it hugs the shore
}
// Radius two hulls keep between them (half capsule length + beam): 20 px for the old one-size hull, more for big ships.
const shipRadius = s => ((s.hl ?? 28) + (s.hw ?? 13)) / 2;
