"use strict";
// ---------- Sea disasters, on the sea ----------
// js/disasters-core.js plans the voyage (which disaster, when) and holds the maths; this file places each one fairly, warns, applies it
// to EVERY hull alike (the player, enemies, fleets: one pull, one shove, one damage rule), keeps the hard rules, and shows it.
// The rules: no deadly event in the harbor, the outpost's truce or the Shallows; none on the first voyage; an event never takes the player
// under 10% of the hull; 8 s of no disaster damage after each; the player only (enemy guns still sink him). A disaster pays no gold and
// no chest: the reward is tactical (surf a tsunami, steady the helm, lure a fleet into a whirlpool, draw lightning to a tall mast).
// The effects are gameplay and ignore the "weather effects" setting; that setting only thins the spray. Nothing here is saved.
Object.assign(STR.en, {
  dis_tsunami: "Tsunami", dis_spout: "Waterspout", dis_vortex: "Whirlpool", dis_rogue: "Rogue wave", dis_lightning: "Lightning", dis_fog: "Fog",
  dis_w_tsunami: "Tsunami coming! Point the bow into the wave, or run with it to surf.",
  dis_w_spout: "Waterspout! Keep clear of its path, or sail against its spin to break free.",
  dis_w_vortex: "Whirlpool opening! Sail out at full speed, or lure the fleet in.",
  dis_w_rogue: "Rogue wave! Turn the bow into it, now.",
  dis_w_lightning: "Lightning is picking the tallest mast. Move!",
  dis_w_fog: "Fog rolling in. Slow down and steer by the chart.",
  dis_cd: "{name} {s} s", dis_mast: "Mast snapped!", dis_surf: "Surfing!", dis_steady: "Bow into it! Steady helm", dis_lost: "Helm lost!", dis_struck: "Struck!", dis_fire: "On fire!",
});
Object.assign(STR.zh, {
  dis_tsunami: "海嘯", dis_spout: "水龍捲", dis_vortex: "漩渦", dis_rogue: "瘋狗浪", dis_lightning: "落雷", dis_fog: "濃霧",
  dis_w_tsunami: "海嘯來了！船頭迎浪，或順浪衝刺。",
  dis_w_spout: "水龍捲！避開路徑，或逆著旋轉方向全速脫離。",
  dis_w_vortex: "漩渦成形！全速駛離，或把敵船引進去。",
  dis_w_rogue: "瘋狗浪！立刻轉舵，船頭迎浪。",
  dis_w_lightning: "雷要打最高的桅杆，快移動！",
  dis_w_fog: "起霧了。減速，靠海圖航行。",
  dis_cd: "{name} {s} 秒", dis_mast: "桅杆斷了！", dis_surf: "順浪衝刺！", dis_steady: "迎浪成功！操舵穩定", dis_lost: "失去舵控！", dis_struck: "被雷擊中！", dis_fire: "起火了！",
});

const dis = { plan: [], i: 0, live: [], protectUntil: -1, fog: 0, g: null, fogImg: null, fogRects: [], whirlT: 0 };
const disOn = () => wxLive() && !paused && !seaFrozen && !!player && player.alive;
const disShips = () => { const a = enemies.filter(e => e.alive && !e.fixed); if (player && player.alive) a.push(player); return a; };
const disMid = c => (c[0] + c[1]) / 2;
const disSafeSpot = s => dist(s, PORT) < SAFE_R + 40 || (typeof inTruce === "function" && inTruce(s)) || disRing(dist(s, PORT)) < 3;   // where the player takes no disaster damage

// ---------- what a hull feels (called from js/ships.js move / steer) ----------
const DIS_ZERO = { x: 0, y: 0 };
const disPush = s => (s.dvx || s.dvy ? { x: s.dvx, y: s.dvy } : DIS_ZERO);
const disMul = s => (s.disSlowT > 0 ? DISASTER.mastK : 1) * (s.disStunT > 0 ? DISASTER.stunK : 1) * (s.disBoostT > 0 ? 1 + DISASTER.tsunami.boost : 1);
const disLost = s => s.disLostT > 0;
const disTurn = s => (s.disStableT > 0 ? DISASTER.rogue.stableK : 1);
// What an AI can make out: the fog's sight (Infinity in clear air). pickTarget and think (js/ships.js) read it, as do the chart and the edge boxes.
const disSight = () => (dis.fog > 0 ? 1500 - (1500 - DISASTER.fog.sight) * dis.fog : Infinity);
const disFogHides = e => dis.fog > 0.05 && dist(e, player) > disSight();
// A hull that has lost its target in the fog goes to where it last saw it, not straight at it.
function disFogLose(e) {
  if (!(dis.fog > 0) || !e.target) return false;
  if (dist(e, e.target) <= disSight()) { e.lastSeen = { x: e.target.x, y: e.target.y }; return false; }
  const at = e.lastSeen || { x: e.target.x, y: e.target.y };
  e.target = null; e.wander = { ...at }; e.thinkT = rand(5, 8);
  return true;
}

// ---------- an AI answers a disaster ----------
// Called from think() (js/ships.js), after the fleet's own steering, so it wins. A hull that finds itself in a hazard's way notices it
// with chance DISASTER.dodge.aware (less when it is busy with a target) and, after disReact() s (0.5-2 s, quicker at higher levels),
// sails clear: away from a whirl, out of a tsunami's lane, bow into a rogue wave, off the lightning's mark. A hull that did not notice, or
// is still reacting, is caught: luring an enemy into a whirlpool still works. Same rules and same hazards as the player's.
function disClear(ev, e) {
  const c = DISASTER[ev.kind], m = DISASTER.dodge.margin;
  if (ev.kind === "spout" || ev.kind === "vortex") return dist(e, ev) < c.R * m ? Math.atan2(e.y - ev.y, e.x - ev.x) : null;
  if (ev.kind === "tsunami") {
    const dx = e.x - ev.o.x, dy = e.y - ev.o.y, along = dx * Math.cos(ev.dir) + dy * Math.sin(ev.dir), side = -dx * Math.sin(ev.dir) + dy * Math.cos(ev.dir);
    const front = ev.st === "live" ? ev.front : 0;
    return Math.abs(side) < c.len / 2 + 80 && along > front - c.thick && along < c.travel ? ev.dir + (side < 0 ? -1 : 1) * Math.PI / 2 : null;
  }
  if (ev.kind === "rogue") return ev.st === "warn" && dist(e, ev) < c.R + 60 ? ev.dir + Math.PI : null;
  if (ev.kind === "lightning") return ev.st === "warn" && dist(e, ev) < c.R * 2 ? Math.atan2(e.y - ev.y, e.x - ev.x) : null;
  return null;
}
function disDodge(e) {
  if (dis.noDodge || !dis.live.length || !e.alive) return null;
  const d = DISASTER.dodge, now = wx.t, memo = e.disAw || (e.disAw = {});
  for (const ev of dis.live) {
    if (ev.kind === "fog" || ev.st === "done") continue;
    const to = disClear(ev, e);
    if (to === null) continue;
    const m = memo[ev.uid] || (memo[ev.uid] = { at: now + disReact(e.L), aware: !!e.ally || Math.random() < (e.target ? d.busy : d.aware) });   // an escort always sees it coming: saving the ship comes before the fight (js/escort-ai.js)
    if (m.aware && now >= m.at) return { desired: to, thr: ev.kind === "rogue" ? 0.5 : 1 };
  }
  return null;
}

// ---------- placing one fairly ----------
const disFar = (p, q, r) => Math.hypot(p.x - q.x, p.y - q.y) > r;
function disFair(p, R, c) {   // a spot for a deadly event: ring, harbor, outpost, rocks and a way out
  const out = disRing(dist(p, PORT)) >= c.ring && disFar(p, PORT, SAFE_R + R + 120) && (!save.campaign.outpost || disFar(p, OUTPOST, TRUCE_R + R + 100)) && STATIONS.every(st => disFar(p, st, STATION_TRUCE_R + R + 100)) && STATIONS.every(st => disFar(p, st, STATION_TRUCE_R + R + 100));
  return out && !islands.some(i => Math.hypot(i.x - p.x, i.y - p.y) < i.r + 70) && disEscapeOK(p, R, islands);
}
// Fills in the event's geometry: where it is, which way it runs. false = no fair place just now.
function disGeom(ev, force) {
  const c = DISASTER[ev.kind], P = player, seeded = !force && runActive();
  ev.x = P.x; ev.y = P.y; ev.dir = ev.a2;
  if (ev.kind === "fog") return true;
  const mine = !seeded || ev.kind === "rogue" || ev.kind === "lightning";   // events tied to the player need him in fair water; a seeded spot is fair or not by itself
  if (!force && mine && (disRing(dist(P, PORT)) < c.ring || disSafeSpot(P))) return false;
  if (ev.kind === "spout" || ev.kind === "vortex") {
    const away = disLerp(ev.v1, c.away);
    const p = force ? { x: force.x, y: force.y } : seeded ? disSeededSpot(ev) : { x: P.x + Math.cos(ev.a) * away, y: P.y + Math.sin(ev.a) * away };
    if (!force && !disFair(p, c.R, c)) return false;
    ev.x = p.x; ev.y = p.y;
    ev.h = ev.kind === "spout" ? Math.atan2(P.y - p.y, P.x - p.x) + (ev.v2 - 0.5) * 0.8 : 0;   // a spout wanders toward the player's side of the sea
  } else if (ev.kind === "tsunami") {
    ev.dir = ev.a;
    const mid = force ? { x: force.x, y: force.y } : seeded ? disSeededSpot(ev) : { x: P.x - Math.sin(ev.dir) * (ev.v1 - 0.5) * 500, y: P.y + Math.cos(ev.dir) * (ev.v1 - 0.5) * 500 };
    const back = c.speed * c.lead + c.thick;   // the wall starts this far upstream of the spot, so it reaches it `lead` s after the strike
    ev.o = { x: mid.x - Math.cos(ev.dir) * back, y: mid.y - Math.sin(ev.dir) * back };
    if (!force) for (let d = 0; d <= c.travel; d += 400) { const p = { x: ev.o.x + Math.cos(ev.dir) * d, y: ev.o.y + Math.sin(ev.dir) * d }; if (!disFar(p, PORT, SAFE_R + 100) || (save.campaign.outpost && !disFar(p, OUTPOST, TRUCE_R + 100))) return false; }
    ev.x = ev.o.x; ev.y = ev.o.y;
  } else if (ev.kind === "rogue") {
    const lead = Math.min(P.speed * ev.warn * 0.6, 450);   // where the player is headed: sit still and it lands on you, turn away and it misses
    ev.x = P.x + Math.cos(P.rot) * lead; ev.y = P.y + Math.sin(P.rot) * lead;
    if (force) { ev.x = force.x; ev.y = force.y; }
  } else if (ev.kind === "lightning") {
    ev.tg = null; disAim(ev, true);
    if (!ev.tg) return false;
  }
  return true;
}
// Lightning picks the ship with the tallest mast (the longest hull) near the player, and holds that aim for the last `lock` seconds.
function disAim(ev, first) {
  const c = DISASTER.lightning;
  if (first) ev.c0 = { x: player.x, y: player.y };
  let best = null, bl = -1;
  for (const s of disShips()) {
    if (Math.hypot(s.x - ev.c0.x, s.y - ev.c0.y) > c.track) continue;
    const l = s.hl ?? 28;
    if (!best || l > bl || (l === bl && dist(s, player) < dist(best, player))) { best = s; bl = l; }
  }
  ev.tg = best;
  if (best) { ev.x = best.x; ev.y = best.y; }
}
function disArm(ev) {
  ev.st = "warn"; ev.uid = ++disIds; ev.spent = {}; ev.hit = new Set(); ev.tick = 0; ev.txt = null;
  if (ev.kind === "tsunami") ev.front = 0;
  toast(t("dis_w_" + ev.kind), true); sfx("disWarn");
  if (ev.kind !== "fog") ev.txt = labelText(S.add.text(ev.x, ev.y, "", { fontFamily: UI_FONT, fontSize: "15px", fontStyle: "700", color: "#ffd8a0", stroke: "#0b2530", strokeThickness: 4 }).setOrigin(0.5).setDepth(9.5));
  dis.live.push(ev);
}
function disShift(ev, by) { ev.warnAt += by; ev.t0 += by; ev.end += by; }
// A plan event whose hour has come: place it, or look again a little later, or let it go.
function disStart(ev, now) {
  const busy = ev.kind !== "fog" && dis.live.some(o => o.kind !== "fog");   // one blow at a time
  if (busy || !disGeom(ev)) { if ((ev.tries = (ev.tries || 0) + 1) < DISASTER.tries) { disShift(ev, DISASTER.retry); dis.plan.splice(dis.i, 0, ev); } return; }
  disArm(ev);
}
// The test and debug door: make an event now, at a given spot (no fairness checks), warning for `warn` seconds.
function disForce(kind, at, over = {}) {
  const c = DISASTER[kind], warn = over.warn ?? disMid(c.warn), now = wx.t, rand0 = mulberry32(7);
  const ev = { id: 900 + dis.live.length, kind, high: !!c.high, warnAt: now, t0: now + warn, warn, a: over.a ?? 0, a2: over.a2 ?? 0, r: 0.5, v1: over.v1 ?? 0.5, v2: over.v2 ?? 0.5, ...over };
  ev.end = over.end ?? ev.t0 + (kind === "fog" ? disMid(c.dur) : kind === "tsunami" ? c.travel / c.speed + 4 : kind === "rogue" ? 1.4 : kind === "lightning" ? 0.6 : c.life);
  if (!disGeom(ev, at || { x: player.x, y: player.y })) return null;
  disArm(ev);
  return ev;
}

// ---------- the effects ----------
function disHit(s, ev, pct, cap) {
  const spent = ev.spent[s.id ??= ++disIds] || 0, now = wx.t;
  const hp = disDamage(s, pct, spent, cap, s.isPlayer && (now < dis.protectUntil || disSafeSpot(s)));
  if (hp <= 0) return 0;
  ev.spent[s.id] = spent + hp / s.maxHp;
  hurt(s, hp, 0, null);
  return hp;
}
let disIds = 0;
function disMast(s, c) {
  if (s.isPlayer && (wx.t < dis.protectUntil || disSafeSpot(s))) return;
  s.disSlowT = c.mastT; if (onScreen(s.x, s.y)) floatText(s.x, s.y - 54, t("dis_mast"), "#ffd36a", 15);
}
// Fire: the ordinary burn (js/arsenal.js addBurn), sized so the whole of it stays inside the event's cap and, for the player, above the 10% floor.
function disFire(s, ev, c) {
  if (s.isPlayer && (wx.t < dis.protectUntil || disSafeSpot(s))) return;
  let room = (c.dmg[1] - (ev.spent[s.id] || 0)) * s.maxHp;
  if (s.isPlayer) room = Math.min(room, s.hp - DISASTER.floor * s.maxHp);
  const dps = Math.min(c.fireDps * s.maxHp, Math.max(0, room) / BURN_T);
  if (dps <= 0) return;
  addBurn(s, dps, null); ev.spent[s.id] = (ev.spent[s.id] || 0) + dps * BURN_T / s.maxHp;
  if (onScreen(s.x, s.y)) floatText(s.x, s.y - 54, t("dis_fire"), "#ff9a4a", 15);
}
const disText = (s, key, col) => { if (onScreen(s.x, s.y)) floatText(s.x, s.y - 48, t(key), col, 15); };
function disShove(s, dx, dy, v, tt = 1.2) { s.dpx = dx * v; s.dpy = dy * v; s.dpT = tt; s.dpK = tt; }

function disWall(ev, dt, ships) {   // tsunami: the wall runs on, and every hull it meets is shoved and struck once
  const c = DISASTER.tsunami, cx = Math.cos(ev.dir), sy = Math.sin(ev.dir);
  ev.front = (wx.t - ev.t0) * c.speed;
  ev.x = ev.o.x + cx * (ev.front - c.thick / 2); ev.y = ev.o.y + sy * (ev.front - c.thick / 2);
  for (const s of ships) {
    if (ev.hit.has(s) || !tsunamiHas(ev.o, ev.dir, ev.front, s.x, s.y)) continue;
    ev.hit.add(s);
    const h = tsunamiHit(s.rot, ev.dir);
    disHit(s, ev, h.pct, c.dmg[1]);
    if (!s.alive) continue;
    disShove(s, cx, sy, h.push);
    if (h.surf) { s.disBoostT = c.boostT; disText(s, "dis_surf", "#8fe3ff"); }
    if (wxFx() && onScreen(s.x, s.y)) S.fx.splash.explode(8, s.x, s.y);
  }
}
function disWhirl(ev, dt, ships) {   // waterspout and whirlpool: a pull toward the middle, a swirl, damage in the core
  const c = DISASTER[ev.kind];
  if (ev.kind === "spout") { ev.h += Math.sin(wx.t * 0.3 + ev.id) * 0.04 * dt; ev.x += Math.cos(ev.h) * c.speed * dt; ev.y += Math.sin(ev.h) * c.speed * dt; if (dist(ev, PORT) < SAFE_R + c.R * 0.5) ev.end = Math.min(ev.end, wx.t); }
  const tick = (ev.tick += dt) >= 0.5; if (tick) ev.tick = 0;
  const dps = disLerp(ev.v2, c.dps);
  for (const s of ships) {
    const f = fieldPull(c, s.x - ev.x, s.y - ev.y, s.rot, s.maxSpeed || 200);
    if (!f.w) continue;
    s.dvx += f.x; s.dvy += f.y;
    if (tick && fieldCore(c, s.x - ev.x, s.y - ev.y)) {
      const first = !ev.hit.has(s); ev.hit.add(s);
      disHit(s, ev, dps * 0.5, c.cap);
      if (first && s.alive && c.mast && Math.random() < c.mast) disMast(s, c);
    }
  }
}
function disRogueStrike(ev, ships) {   // the crest lands: bow on it (70% off, steady helm for a while) or lose the helm
  const c = DISASTER.rogue, cx = Math.cos(ev.dir), sy = Math.sin(ev.dir);
  for (const s of ships) {
    if (Math.hypot(s.x - ev.x, s.y - ev.y) > c.R) continue;
    const h = rogueHit(s.rot, ev.dir);
    disHit(s, ev, h.pct, c.dmg[1]);
    if (!s.alive) continue;
    if (h.bow) { s.disStableT = h.stable; disText(s, "dis_steady", "#8fe3ff"); }
    else { s.disLostT = h.lost; s.disSpin = (Math.random() < 0.5 ? -1 : 1) * 1.2; disShove(s, cx, sy, c.push, 0.9); disText(s, "dis_lost", "#ffb0a0"); }
    if (wxFx() && onScreen(s.x, s.y)) S.fx.splash.explode(10, s.x, s.y);
  }
}
function disBolt(ev, ships) {   // lightning: the strike point is fixed; whoever is in it is struck, snapped and stunned
  const c = DISASTER.lightning;
  wx.bolt = 0;   // the sky flashes (js/weather.js)
  sfx("thunder", { delay: 0.05 });
  S.fx.spark.explode(18, ev.x, ev.y);
  for (const s of ships) {
    if (Math.hypot(s.x - ev.x, s.y - ev.y) > c.R) continue;
    disHit(s, ev, disMid(c.dmg), c.dmg[1]);
    if (!s.alive) continue;
    if (Math.random() < c.fire) disFire(s, ev, c); else disMast(s, c);   // fire or a snapped mast
    if (!(s.isPlayer && (wx.t < dis.protectUntil || disSafeSpot(s)))) { s.disStunT = c.stunT; disText(s, "dis_struck", "#fff2a0"); }
  }
}

function disTick(dt) {
  const now = wx.t, ships = disShips();
  for (const s of ships) {   // timers; the shove fades away
    s.dvx = 0; s.dvy = 0;
    if (s.disSlowT > 0) s.disSlowT -= dt; if (s.disStunT > 0) s.disStunT -= dt; if (s.disBoostT > 0) s.disBoostT -= dt;
    if (s.disLostT > 0) s.disLostT -= dt; if (s.disStableT > 0) s.disStableT -= dt;
    if (s.dpT > 0) { s.dpT -= dt; const k = Math.max(0, s.dpT / s.dpK); s.dvx += s.dpx * k; s.dvy += s.dpy * k; }
  }
  while (dis.i < dis.plan.length && now >= dis.plan[dis.i].warnAt) { const ev = dis.plan[dis.i++]; disStart(ev, now); }
  let fog = 0;
  for (const ev of dis.live) {
    if (ev.st === "warn") {
      if (ev.kind === "lightning" && now < ev.t0 - DISASTER.lightning.lock) disAim(ev, false);
      else if (ev.kind === "lightning" && ev.tg) { ev.x = ev.tx ?? (ev.tx = ev.tg.x); ev.y = ev.ty ?? (ev.ty = ev.tg.y); }
      if (now >= ev.t0) {
        ev.st = "live"; sfx(ev.kind === "tsunami" || ev.kind === "rogue" ? "disSurge" : "disWhirlBurst");
        if (ev.kind === "rogue") disRogueStrike(ev, ships);
        else if (ev.kind === "lightning") disBolt(ev, ships);
        else if (ev.kind === "fog") for (const e of enemies) if (e.alive && !e.fixed) e.retarget = Math.max(e.retarget, disReact(e.L));
      }
    }
    if (ev.st === "live") {
      if (ev.kind === "tsunami") disWall(ev, dt, ships);
      else if (ev.kind === "spout" || ev.kind === "vortex") disWhirl(ev, dt, ships);
      else if (ev.kind === "fog") fog = Math.max(fog, fogLevel(ev, now));
      if (now >= ev.end) {
        ev.st = "done";
        if (ev.kind !== "fog") dis.protectUntil = Math.max(dis.protectUntil, now + DISASTER.protect);   // 8 s of no disaster damage after an event
      }
    }
  }
  dis.fog = fog;
  for (const s of ships) if (s.dvx || s.dvy) s.disInfT = now + 2;   // under the sea's hand: see disCrashCap
  for (let i = dis.live.length - 1; i >= 0; i--) if (dis.live[i].st === "done") { dis.live[i].txt?.destroy(); dis.live.splice(i, 1); }
  // the whirl's roar while the player is near
  if ((dis.whirlT -= dt) <= 0) { dis.whirlT = 2.4; if (dis.live.some(e => e.st === "live" && (e.kind === "spout" || e.kind === "vortex") && dist(e, player) < DISASTER[e.kind].R * 1.4)) sfx("disWhirl"); }
}
// A crash (js/collision.js) that a disaster drove, in the 2 s after the sea last shoved or pulled the hull, follows the disaster rules for the
// player: it never takes him under 10% and does nothing inside the rest after an event. Any other crash is #30's, untouched.
function disCrashCap(s, dmg) {
  if (!s.isPlayer || !(s.disInfT > wx.t)) return dmg;
  return disDamage(s, dmg / s.maxHp, 0, 1, wx.t < dis.protectUntil);
}
// The marks for the chart and the screen edge: events that are warning or running (the fog has none).
const disMarks = () => dis.live.filter(e => e.kind !== "fog" && e.st !== "done");

onHook("sail", () => {
  dis.live.forEach(e => e.txt?.destroy()); dis.live = []; dis.i = 0; dis.protectUntil = -1; dis.fog = 0;
  dis.plan = wx.easy ? [] : disasterPlan(wx.seed).map(e => ({ ...e }));   // the first voyage and the tutorial have none
  for (const s of [player, ...enemies]) Object.assign(s, { dvx: 0, dvy: 0, dpT: 0, disSlowT: 0, disStunT: 0, disBoostT: 0, disLostT: 0, disStableT: 0 });
});
onHook("dock", () => { dis.live.forEach(e => e.txt?.destroy()); dis.live = []; dis.fog = 0; });
onHook("frame", dt => {
  if (!S || !player || !dis.g) return;
  if (wxLive() && !paused && !seaFrozen && player.alive) disTick(dt);
  else if (!wxLive()) { dis.fog = 0; if (dis.live.length) { dis.live.forEach(e => e.txt?.destroy()); dis.live = []; } }
  disDraw(dt);
});
