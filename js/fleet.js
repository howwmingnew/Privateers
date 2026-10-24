"use strict";
// ---------- Fleets: a lead ship, wingmen in formation, and what they do when the lead goes down ----------
// A fleet is { type, lead, ships: [lead, ...wingmen], formation, lost, ... }; each member carries e.fleet. Three kinds:
//   wolfpack  pirates, fast hulls, wedge; on sighting the prey the wingmen fan out and close from different bearings
//   patrol    navy, abreast (line) at sea; engaged, the wingmen fall in astern of the lead (line ahead) and trade broadsides
//   convoy    fluyts in a column with an armed escort brig (the old merchant convoy of js/archetypes.js, moved here)
// Reusable API for the admiral's fleet (#14) and the player's followers (#44): formationSlots / slotWorld (where each
// wingman sits), makeFleet (bind ships), fleetFirepower (the wingman's 80%), fleetSteer (a wingman's heading, called from
// think() in js/ships.js), fleetLeadSunk (the leader's loss: charge or scatter).
Object.assign(STR.en, {
  fleet_wolfpack: "Pirate wolfpack", fleet_patrol: "Navy patrol", fleet_convoy: "Merchant convoy", fleet_admiral: "Admiral's fleet",
  fleetCharge: "Avenge the leader!", fleetScatter: "Scatter!",
});
Object.assign(STR.zh, {
  fleet_wolfpack: "海盜狼群", fleet_patrol: "海軍巡邏隊", fleet_convoy: "商船隊", fleet_admiral: "上將艦隊",
  fleetCharge: "替老大報仇！", fleetScatter: "快逃啊！",
});

// formation: where wingmen sit; engage: what they do once the lead has a target; leadLoss: charge | scatter | mixed
// (mixed: every other wingman charges); minSize: ships in all, the sea's depth sets the max (fleetMaxSize).
const FLEET_TYPES = {
  wolfpack: { faction: "pirate",   formation: "wedge",  engage: "flank",  leadLoss: "mixed",   minSize: 2 },
  patrol:   { faction: "navy",     formation: "line",   engage: "column", leadLoss: "charge",  minSize: 2 },
  convoy:   { faction: "merchant", formation: "column", engage: "guard",  leadLoss: "scatter", minSize: 3 },
  admiral:  { faction: "navy",     formation: "wedge",  engage: "column", leadLoss: "charge",  minSize: 3 },   // the Admiral's flagship and escort (js/heat.js); only ever made there
};
const fleetTypeFor = faction => Object.keys(FLEET_TYPES).find(k => FLEET_TYPES[k].faction === faction) || null;
// Ships in a fleet by ring: the shallows send pairs and trios, the deep sends five.
const fleetMaxSize = ring => ring <= 2 ? 3 : ring <= 5 ? 4 : 5;

// Slot offsets (ax ahead, ay to starboard, in the lead's frame) for n wingmen. Slot 0 is the first wingman.
function formationSlots(kind, n, gap = FLEET_GAP) {
  return Array.from({ length: n }, (_, i) => {
    const k = Math.ceil((i + 1) / 2), side = i % 2 === 0 ? 1 : -1;
    if (kind === "column") return { ax: -gap * (i + 1), ay: 0 };
    if (kind === "line") return { ax: -gap * 0.1, ay: side * gap * k };
    return { ax: -gap * 0.8 * k, ay: side * gap * 0.75 * k };   // wedge
  });
}
function slotWorld(lead, s) {
  const c = Math.cos(lead.rot), sn = Math.sin(lead.rot);
  return { x: lead.x + c * s.ax - sn * s.ay, y: lead.y + sn * s.ax + c * s.ay };
}
// The wingmen's classes for a fleet led by `lead` ({ L, arch, ring }), at most `room` of them. Uses the generation RNG
// (grandom), so a daily run's seed gives the same fleet. Returns [] when no fleet fits.
function fleetPlan(type, lead, room) {
  const T = FLEET_TYPES[type], n = Math.min(fleetMaxSize(lead.ring) - 1, room);
  if (!T || n < T.minSize - 1) return [];
  const count = Math.min(n, Math.round(grand(T.minSize - 1, n + 0.49)));
  const pick = mix => { let r = grandom() * Object.values(mix).reduce((a, b) => a + b, 0); for (const k in mix) if ((r -= mix[k]) <= 0) return k; return Object.keys(mix)[0]; };
  const out = [];
  for (let i = 0; i < count; i++) {
    if (type === "convoy") out.push(i === count - 1 ? "brig" : "fluyt");   // the escort rides last
    else if (type === "wolfpack") out.push(pick(lead.L >= 6 ? { cutter: 0.4, brig: 0.4, fireship: 0.2 } : lead.L >= 3 ? { cutter: 0.7, brig: 0.3 } : { cutter: 1 }));
    else out.push(lead.arch === "cutter" ? "cutter" : pick({ brig: 0.6, [lead.arch === "manowar" ? "frigate" : lead.arch]: 0.4 }));
  }
  return out;
}
// A wingman's guns: half the cut from a slower reload, half from looser aim, so the product is `mul` (default 80%).
function fleetFirepower(e, mul = FLEET_FIRE) {
  const k = Math.sqrt(mul);
  for (const m in e.guns) for (const g of e.guns[m]) g.interval /= k;
  e.aimSpread /= k; e.fireMul = (e.fireMul || 1) * mul;
  if (typeof threatLevelOf === "function") e.threatL = threatLevelOf(e);
  return e;
}

// ---------- Fleet records ----------
let fleets = [];
const fleetLive = f => !f.dead && f.ships.some(s => s.alive && enemies.includes(s));
const fleetsLive = () => fleets.filter(fleetLive);
// Shipmates never hit each other: a broadside across a column would otherwise turn the fleet on itself (js/main.js ball loop).
const sameFleet = (a, b) => !!(a && b && a.fleet && a.fleet === b.fleet);
const wingmen = f => f.ships.filter(s => s.alive && s !== f.lead);
// Bind ships into a fleet (the first is the lead). Wingmen get FLEET_FIRE; pass { power: 1 } to keep full guns.
function makeFleet(type, ships, opts = {}) {
  const T = FLEET_TYPES[type] || {}, power = opts.power ?? FLEET_FIRE;
  const f = { type, lead: ships[0], ships: [...ships], formation: opts.formation || T.formation || "wedge", power, lost: false, seen: false, shareT: 0, hdg: ships[0].rot };
  ships.forEach((s, i) => { s.fleet = f; s.strayT = 0; s.strayD = 0; if (i > 0 && power !== 1) fleetFirepower(s, power); });
  if (type === "convoy") ships.forEach(s => { s.convoy = f; });   // js/archetypes.js convoyAlarm
  fleets.push(f);
  return f;
}
// The wingmen for `lead` in their formation slots (a fresh ship per class, in the lead's ring and level); returns [lead, ...them].
// Shared with the Navy's hunters and the Admiral's fleet (js/heat.js).
function spawnWing(sc, type, lead, classes) {
  const slots = formationSlots(FLEET_TYPES[type].formation, classes.length), d0 = dist(lead, PORT);
  const r0 = SAFE_R + (lead.ring - 1) * ZONE_STEP + 6, r1 = r0 + ZONE_STEP - 12, ships = [lead];
  classes.forEach((cls, i) => {
    let { x, y } = slotWorld(lead, slots[i]);
    // keep every ship in the lead's level ring (its level is the lead's; the census counts it there)
    const a = Math.atan2(y - PORT.y, x - PORT.x), r = clamp(Math.hypot(x - PORT.x, y - PORT.y), r0, lead.ring >= MAX_RING ? Math.max(r1, d0 + 200) : r1);
    x = PORT.x + Math.cos(a) * r; y = PORT.y + Math.sin(a) * r;
    if (islands.some(isl => Math.hypot(isl.x - x, isl.y - y) < isl.r + 30)) return;
    const e = makeEnemy(sc, x, y, lead.L, lead.faction, cls);
    e.rot = lead.rot; ships.push(e);
    if (type === "convoy" && cls === "brig") e.escort = true;   // keeps pirates off the fluyts (js/ships.js isHostile)
  });
  return ships;
}
// Called from spawnEnemy for each ordinary new ship: it may lead a fleet. Returns the fleet or null.
function maybeFleet(sc, lead) {
  if (lead.boss || lead.escortOf || lead.fixed || (typeof firstVoyage === "function" && firstVoyage())) return null;
  const type = fleetTypeFor(lead.faction), sea = seaOfRing(lead.ring);
  if (!type || grandom() >= (FLEET_CHANCE[sea.id] || 0)) return null;
  const live = fleetsLive(), used = live.reduce((a, f) => a + f.ships.filter(s => s.alive).length, 0);
  if (live.length >= FLEETS_AT_SEA || used + 2 > FLEET_SHIPS) return null;
  const classes = fleetPlan(type, lead, Math.min(FLEET_SHIPS - used - 1, fleetRoom(lead)));
  if (!classes.length) return null;
  const ships = spawnWing(sc, type, lead, classes);
  if (ships.length < 2) return null;
  return makeFleet(type, ships);
}
// Ships the sea may still add beside a lead: what its ring is short of its quota (js/world-seas.js, which already counts
// the lead), or the room under the ship count without it.
function fleetRoom(lead) {
  if (typeof seaCensus === "function" && player) { const c = seaCensus(); return Math.max(0, (c.quota[lead.ring] || 0) - (c.count[lead.ring] || 0)); }
  return Math.max(0, ENEMY_COUNT - enemies.filter(o => o.alive && !o.boss && !o.escortOf && !o.fixed).length);
}

// ---------- Steering ----------
// The frame the slots hang on: the lead's position with a heading that follows its own with a lag, so a lead that swings
// about does not whip the line abreast round with it.
const fleetFrame = f => ({ x: f.lead.x, y: f.lead.y, rot: f.hdg ?? f.lead.rot });
const slotOf = (f, e) => formationSlots(f.formation, wingmen(f).length, f.gap)[wingmen(f).indexOf(e)];   // f.gap: the escorts' wider spacing (js/escort-ai.js)
// A slot may not sit on an island: pull it toward the lead until it is clear of the rock.
function safeSlot(p, lead) {
  p = { x: clamp(p.x, 160, W - 160), y: clamp(p.y, 160, H - 160) };   // a slot over the map's edge would pin its ship to the border
  const rocks = islands.concat([{ x: PORT.x, y: PORT.y, r: PORT_ISLAND_R / 0.9 }]);   // the harbor island is solid too
  for (let k = 0; k < 3; k++) {
    if (!rocks.some(isl => Math.hypot(isl.x - p.x, isl.y - p.y) < isl.r * 1.05 + 50)) return p;
    p = { x: (p.x + lead.x) / 2, y: (p.y + lead.y) / 2 };
  }
  return { x: lead.x - Math.cos(lead.rot) * 70, y: lead.y - Math.sin(lead.rot) * 70 };
}
// Station keeping: head for the slot at the lead's pace, speeding up when behind. null if it has no slot.
function holdStation(e, f) {
  const s = slotOf(f, e);
  if (!s) return null;
  const la = f.look ?? 0.5, q = slotWorld(fleetFrame(f), s), p = safeSlot({ x: q.x + (f.lead.vx || 0) * la, y: q.y + (f.lead.vy || 0) * la }, f.lead),   // a half second ahead: on a turn the outer slots run
     d = Math.hypot(p.x - e.x, p.y - e.y), pace = clamp(f.lead.speed / Math.max(1, e.maxSpeed), 0.3, 1);
  e.strayD = d;
  if (d < 40 && f.lead.speed < 8) return tac(f.lead.rot, 0);   // the lead lies stopped (the player at anchor): lie to as well
  return tac(d < 25 ? f.lead.rot : Math.atan2(p.y - e.y, p.x - e.x), d > 140 ? 1 : d > 40 ? Math.min(1, pace * 1.4) : pace);
}
// The wingman's heading this frame, or null to let its own plan decide (js/archetypes.js archTactic or the idle roam).
// Called from think() after the target branch: tg is its target (or null), d and toT its distance and bearing.
function fleetSteer(e, tg, d, toT, now) {
  const f = e.fleet;
  if (!f) return null;
  if (e.unstickT > now) return tac(e.unstickA, 1);   // clawing off a rock it has sat against (fleetTick)
  if (f.type === "escort") return escortSteer(e, f, tg, d, toT, now);   // the player's escorts: stance and leash (js/escort-ai.js)
  if (e.scatterT > now) {   // the lead is gone and this one runs, away from whoever sank it
    const from = f.killer && f.killer.alive ? f.killer : f.lead;
    return tac(Math.atan2(e.y - from.y, e.x - from.x) + Math.sin(now * 1.3 + e.L) * 0.3, 1);
  }
  if (e.rageT > now) return tg && tg.alive && d > e.range * 0.6 ? tac(toT, 1) : null;   // a beeline for the killer, then its usual guns
  if (f.lost) { e.fleet = null; return null; }   // the mood has passed: sails alone
  if (e === f.lead || !f.lead.alive) return null;
  const T = FLEET_TYPES[f.type] || {};
  if (!tg) return holdStation(e, f);
  if (T.engage === "column") { const h = holdStation(e, f); return h && e.strayD < 200 ? h : null; }   // line ahead behind the lead
  if (T.engage === "flank" && d > e.range * 1.15) {   // fan out around the target, each wingman on its own bearing
    const i = wingmen(f).indexOf(e), side = (i % 2 === 0 ? 1 : -1) * (0.9 + 0.5 * Math.floor(i / 2));
    const a = Math.atan2(f.lead.y - tg.y, f.lead.x - tg.x) + side, R = e.range * 0.85;
    return tac(Math.atan2(tg.y + Math.sin(a) * R - e.y, tg.x + Math.cos(a) * R - e.x), 1);
  }
  return null;
}
// The lead went down: the wingmen charge the killer or scatter, by the fleet's temper (FLEET_TYPES.leadLoss).
function fleetLeadSunk(f, killer) {
  if (f.lost) return;
  f.lost = true; f.killer = killer || null;
  const now = S.time.now / 1000, T = FLEET_TYPES[f.type] || {};
  wingmen(f).forEach((m, i) => {
    const charge = killer && !m.merchant && (m.escort || T.leadLoss === "charge" || (T.leadLoss === "mixed" && i % 2 === 0));
    if (charge) { m.rageT = now + FLEET_RAGE_T; m.attacker = killer; m.angry = FLEET_RAGE_T; m.ignore.delete(killer); m.target = killer; m.chaseFrom = { x: m.x, y: m.y }; }
    else { m.scatterT = now + FLEET_SCATTER_T; m.target = null; }
    if (onScreen(m.x, m.y)) floatText(m.x, m.y - 48, t(charge ? "fleetCharge" : "fleetScatter"), charge ? "#ff8a5a" : "#c9d6da", 15);
  });
}

// Watchdog: a fleet ship that has gone FLEET_STUCK_T s without leaving a 140 px circle is up against something (an island
// its slot or its lead's wake lies behind, the map's edge): it sails straight off for a few seconds, then rejoins.
function unstick(m, now) {
  const a = m.anchor;
  if (!a || Math.hypot(m.x - a.x, m.y - a.y) > FLEET_STUCK_R) { m.anchor = { x: m.x, y: m.y, t: now }; return; }
  if (now - a.t < FLEET_STUCK_T) return;
  let best = null, bd = 1e9;
  for (const isl of islands) { const d = Math.hypot(isl.x - m.x, isl.y - m.y) - isl.r; if (d < bd) { bd = d; best = isl; } }
  const edge = m.x < 220 || m.x > W - 220 || m.y < 220 || m.y > H - 220;
  m.unstickA = best && bd < 260 ? Math.atan2(m.y - best.y, m.x - best.x) : edge ? Math.atan2(H / 2 - m.y, W / 2 - m.x) : m.rot + Math.PI * 0.6;
  m.unstickT = now + 4; m.anchor = { x: m.x, y: m.y, t: now };
}
// ---------- Upkeep (every frame, cheap: the heavy part runs twice a second) ----------
function fleetTick(dt) {
  if (!fleets.length) return;
  const now = S.time.now / 1000;
  fleets = fleets.filter(fleetLive);
  for (const f of fleets) {
    f.ships = f.ships.filter(s => s === f.lead || (s.alive && s.fleet === f && enemies.includes(s)));
    if (!f.lost && !f.lead.alive && f.type !== "escort") {   // retired off-screen, not sunk (that goes through fleetLeadSunk): the next ship leads
      const n = f.ships.find(s => s.alive);
      if (n) f.lead = n; else { f.dead = true; continue; }
    }
    if (!f.lost && !f.seen && player.alive && dist(f.lead, player) < 650) {
      f.seen = true;
      if (onScreen(f.lead.x, f.lead.y, 200)) floatText(f.lead.x, f.lead.y - 62, t("fleet_" + f.type), "#f6f1e3", 15);
    }
    f.hdg = (f.hdg ?? f.lead.rot) + angDiff(f.lead.rot, f.hdg ?? f.lead.rot) * Math.min(1, dt / FLEET_HDG_LAG);
    if (f.type === "escort") continue;   // the player's escorts keep their own watch (js/escort-ai.js escortTick)
    if ((f.shareT -= dt) > 0) continue;
    f.shareT = 0.5;
    for (const m of f.ships) if (m.alive) unstick(m, now);
    if (f.lost) continue;
    for (const m of wingmen(f)) {
      m.strayT = m.strayD > FLEET_STRAY ? m.strayT + 0.5 : 0;
      if (m.strayT > FLEET_STRAY_T) { m.fleet = null; m.strayT = 0; continue; }   // lost its station for good (an island, a long chase): sails alone
      const tg = f.lead.target;   // the lead's quarry is the fleet's quarry
      if (tg && !m.target && !m.merchant && isHostile(m, tg) && dist(m, tg) < 1100) { m.target = tg; m.chaseFrom = { x: m.x, y: m.y }; }
    }
  }
}
// A hit on one is a hit on all: the wingmen turn on whoever fired (a convoy's alarm is js/archetypes.js convoyAlarm).
onHook("hurt", (s, dmg, src) => {
  const f = s.fleet;
  if (!f || f.lost || !src || src === s || src.fleet === f || f.type === "convoy" || f.type === "escort") return;
  for (const m of f.ships) if (m.alive && m !== s && !m.merchant) { m.attacker = src; m.angry = Math.max(m.angry, 8); m.ignore.delete(src); }
});
onHook("sunk", (s, killer) => { if (s.fleet && s.fleet.lead === s) fleetLeadSunk(s.fleet, killer); });
onHook("frame", dt => { if (!paused && !docked && S && player) fleetTick(dt); });
// The chart: a thin line from each lead to its wingmen, so a fleet reads as one (js/mini-marks.js draws the ships).
onHook("mini", (c, k, u) => {
  c.strokeStyle = "rgba(246,241,227,.45)"; c.lineWidth = 1 * u; c.beginPath();
  for (const f of fleets) if (!f.lost && f.lead.alive) for (const m of f.ships) if (m.alive && m !== f.lead) { c.moveTo(f.lead.x * k, f.lead.y * k); c.lineTo(m.x * k, m.y * k); }
  c.stroke();
});
