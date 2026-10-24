"use strict";
// ---------- Sea disasters: the plan and the maths (pure; the sea itself is js/disasters.js) ----------
// One seed and one clock (seconds of sailing) decide which disaster comes and when, so disasterPlan(seed) is the same list on every
// device: the daily sea passes its seed. Six kinds (DISASTER, js/config.js): tsunami, waterspout, whirlpool, rogue wave, lightning, fog.
// The hard rules live here, where they can be tested: a disaster never takes the player under DISASTER.floor of the hull, one event
// takes no more than its cap off a ship, and nothing hurts the player for DISASTER.protect seconds after an event.
const DIS_KINDS = ["tsunami", "spout", "vortex", "rogue", "lightning", "fog"];
const DIS_WX = { clear: 0, rain: 1, storm: 2 };
const disRing = d => clamp(1 + Math.floor((d - SAFE_R) / ZONE_STEP), 1, MAX_RING);   // the same ring as ringAt (js/world-seas.js)
const disLerp = (r, [a, b]) => a + r * (b - a);

// Rolls for one slot are drawn from a stream of their own, so adding a kind or changing a rate never reshuffles another slot.
function disSlotRng(seed, slot, k) { return mulberry32((Math.imul(seed ^ 0x5ea5, 2654435761) ^ Math.imul(slot + 1, 40503) ^ Math.imul(k + 1, 9973)) >>> 0); }

// The voyage's disasters, by time: { id, kind, high, warnAt, t0 (the strike), end, warn, a (the way it comes or heads), a2, r (the
// ring-based radius of a seeded spot), v1, v2 }. Caps: each kind's `max`, `maxHigh` high-threat events; between events: no overlap,
// `protect` s of rest, high-threat starts `gap` s apart. The weather of the strike decides how likely a kind is.
function disasterPlan(seed, horizon = DISASTER.horizon) {
  const out = [], n = {}, last = { end: -1e9, high: -1e9 };
  let high = 0;
  for (let slot = 0; slot * DISASTER.slot < horizon; slot++) {
    const now = DISASTER.start + slot * DISASTER.slot;
    for (let k = 0; k < DIS_KINDS.length; k++) {
      const kind = DIS_KINDS[k], c = DISASTER[kind], r = disSlotRng(seed, slot, k), roll = r();
      const warn = disLerp(r(), c.warn), t0 = now + warn, w = weatherAt(seed, t0);
      const p = c.p * c.wx[DIS_WX[w.kind]], a = r() * TAU, a2 = r() * TAU, rr = r(), v1 = r(), v2 = r();
      if (roll >= p || (n[kind] || 0) >= c.max || (c.high && high >= DISASTER.maxHigh)) continue;
      const len = kind === "fog" ? disLerp(v1, c.dur) : kind === "tsunami" ? c.travel / c.speed + 4 : kind === "rogue" ? 1.4 : kind === "lightning" ? 0.6 : c.life;
      const ev = { id: out.length, kind, high: !!c.high, warnAt: now, t0, end: t0 + len, warn, a, a2, r: rr, v1, v2 };
      if (kind !== "fog") {   // resting after the last event; fog is a haze, not a blow, so it may overlap
        if (t0 < last.end + DISASTER.protect || (c.high && t0 < last.high + DISASTER.gap) || (kind === "lightning" && out.some(o => o.kind === kind && t0 < o.t0 + c.own))) continue;
        last.end = Math.max(last.end, ev.end); if (c.high) { last.high = t0; high++; }
      }
      n[kind] = (n[kind] || 0) + 1; out.push(ev);
    }
  }
  return out.sort((x, y) => x.warnAt - y.warnAt).map((e, i) => ({ ...e, id: i }));
}
// A seeded spot for an event that sits on the sea (spout, vortex, tsunami): polar around the harbor, in rings from its own minimum outward.
function disSeededSpot(ev, port = PORT) {
  const c = DISASTER[ev.kind], r0 = SAFE_R + (c.ring - 1) * ZONE_STEP + 200, r1 = SAFE_R + (MAX_RING - 1) * ZONE_STEP;
  const d = r0 + ev.r * (r1 - r0);
  return { x: port.x + Math.cos(ev.a) * d, y: port.y + Math.sin(ev.a) * d };
}

// ---------- damage: the hard rules ----------
// `ship` { hp, maxHp, isPlayer }, `pct` the share of the hull the event wants to take now, `spent` the share it has taken from this
// ship already, `cap` its limit, `protectedNow` true inside the rest after an event. Returns the hit points to take (never negative).
function disDamage(ship, pct, spent, cap, protectedNow) {
  let hp = Math.max(0, pct) * ship.maxHp;
  hp = Math.min(hp, Math.max(0, cap - spent) * ship.maxHp);
  if (ship.isPlayer) hp = protectedNow ? 0 : Math.min(hp, Math.max(0, ship.hp - DISASTER.floor * ship.maxHp));
  return hp;
}
// ---------- tsunami and rogue wave: bow on, or beam on ----------
// How a hull lies to the way a wave travels: 1 = bow or stern to it (it runs along the wave's path), 0 = beam on.
const disAxis = (rot, dir) => Math.abs(Math.cos(rot - dir));
// 1 when the bow points straight into the oncoming wave (which travels along `dir`), -1 when the hull runs with it.
const disBowOn = (rot, dir) => -Math.cos(rot - dir);
// A tsunami's blow on a hull: the share of the hull it takes and the shove in px/s (bow on is the low end, beam on the high end).
function tsunamiHit(rot, dir, c = DISASTER.tsunami) {
  const ax = disAxis(rot, dir);
  return { pct: c.dmg[1] - (c.dmg[1] - c.dmg[0]) * ax, push: c.push[1] - (c.push[1] - c.push[0]) * ax, surf: Math.cos(rot - dir) > 0.7 };
}
// Is a point inside the wall? A strip `thick` deep and `len` wide whose front is `front` px along `dir` from its start `o`.
function tsunamiHas(o, dir, front, px, py, c = DISASTER.tsunami) {
  const dx = px - o.x, dy = py - o.y, along = dx * Math.cos(dir) + dy * Math.sin(dir), side = -dx * Math.sin(dir) + dy * Math.cos(dir);
  return along <= front && along >= front - c.thick && Math.abs(side) <= c.len / 2;
}
// A rogue wave's blow: a bow within bowAng of the oncoming crest takes bowK of it and keeps the helm; any other heading takes it all and loses control.
function rogueHit(rot, dir, c = DISASTER.rogue) {
  const bow = disBowOn(rot, dir) >= Math.cos(c.bowAng), mid = (c.dmg[0] + c.dmg[1]) / 2;
  return { bow, pct: bow ? mid * c.bowK : mid, lost: bow ? 0 : c.lostT, stable: bow ? c.stableT : 0 };
}
// ---------- waterspout and whirlpool: one field ----------
// The pull on a ship at (dx, dy) from the centre, in px/s: inward plus a swirl, each a share of the ship's own top speed, so a hull at
// full sail can always claw out (the pull peaks at c.pull = 0.5 of it; a snapped mast leaves 0.8). Sailing against the swirl halves it.
function fieldPull(c, dx, dy, rot, maxSpeed) {
  const r = Math.hypot(dx, dy);
  if (r >= c.R || r < 1e-6) return { x: 0, y: 0, r, w: 0 };
  const w = Math.pow(1 - r / c.R, 1.3), ix = -dx / r, iy = -dy / r, tx = -iy, ty = ix;   // inward, and the way the water turns
  const against = Math.cos(rot) * tx + Math.sin(rot) * ty < -0.5, m = against ? 0.5 : 1;
  const k = c.pull * w * maxSpeed * m, sw = c.swirl * c.pull * w * maxSpeed * m;
  return { x: ix * k + tx * sw, y: iy * k + ty * sw, r, w };
}
const fieldCore = (c, dx, dy) => Math.hypot(dx, dy) < c.core;
// ---------- fog ----------
// How thick the fog is at second t: up over `fade` s from the strike, down over `fade` s to the end.
const fogLevel = (ev, t, c = DISASTER.fog) => clamp(Math.min((t - ev.t0) / c.fade, (ev.end - t) / c.fade), 0, 1);
// An AI's wait before it answers a disaster, 0.5-2 s: the higher its level, the shorter.
const disReact = (L, c = DISASTER.fog) => clamp(c.react[1] - (L - 1) * 0.15, c.react[0], c.react[1]);
// A place with a way out: some direction leaves the radius R plus a margin with no rock in the way and the map's edge behind it.
function disEscapeOK(p, R, rocks, margin = 160) {
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8, far = R + margin; let ok = true;
    for (let d = 0; d <= far && ok; d += 60) {
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (x < 150 || y < 150 || x > W - 150 || y > H - 150 || rocks.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 50)) ok = false;
    }
    if (ok) return true;
  }
  return false;
}
