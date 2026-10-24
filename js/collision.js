"use strict";
// ---------- Collision damage: ramming an island or another hull hurts, by how hard the blow lands ----------
// Ship on ship: even a gentle touch hurts a little (CRASH_TOUCH).
// Island: the speed into the rock (the velocity component along the line from the hull to the island's centre) sets the
// damage. Ship: the closing speed along the line between the two hulls, shared by hull size (hl * hw): the heavier hull
// deals more and takes less. Below CRASH_MIN_V nothing; the same pair gets CRASH_COOLDOWN seconds of peace, so a ship
// wedged against a rock is not bled every frame. The harbor island, the safe waters, a truce and the outpost's pier are
// harmless; two AI hulls never sink each other this way; a fireship's ram (js/archetypes.js) is its own explosion and is left alone. Numbers: js/config.js.
Object.assign(STR.en, { fCrash: "Crash!" });
Object.assign(STR.zh, { fCrash: "撞擊！" });

// Share of max hull a blow at closing speed vn takes, before hull-size weighting; 0 under the threshold.
function crashFrac(vn, k) {
  if (!(vn > CRASH_MIN_V)) return 0;
  return k * Math.min(CRASH_OVER_MAX, (vn - CRASH_MIN_V) / (CRASH_FULL_V - CRASH_MIN_V));
}
// Ship on ship: even a gentle touch costs CRASH_TOUCH of the hull; harder blows follow crashFrac.
const shipFrac = vn => Math.max(CRASH_TOUCH, crashFrac(vn, CRASH_SHIP_K));
const hullMass = s => ((s.hl ?? 28) * (s.hw ?? 13)) / (28 * 13);
// The share of a ship-on-ship blow ship `a` takes: the lighter one takes more.
const massShare = (ma, mb) => clamp(2 * mb / (ma + mb), CRASH_MASS_MIN, CRASH_MASS_MAX);
// Damage in hit points for a ship with hp / maxHp. It cannot kill unless already below CRASH_SPARE of its hull, and
// `mayKill` false (an AI against rock) never kills at all: the blow leaves 1 hp.
function crashDamage(frac, maxHp, hp, mayKill = true) {
  const dmg = frac * maxHp;
  return !mayKill || hp > maxHp * CRASH_SPARE ? Math.max(0, Math.min(dmg, hp - 1)) : dmg;
}
// Contact book: a Map from the other party to { until, last }. crashContact is called on every overlapping frame and says
// whether this is a fresh impact (no contact for CRASH_GAP s before), so a hull pressed or scraping along the same rock
// is hurt once, by the blow that arrived. crashDue then grants one blow per CRASH_COOLDOWN.
function crashContact(book, key, now, gap = CRASH_GAP) {
  const e = book.get(key) || { until: 0, last: -99 }, fresh = now - e.last > gap;
  e.last = now; book.set(key, e);
  return fresh;
}
function crashDue(book, key, now, cd = CRASH_COOLDOWN) {
  const e = book.get(key);
  if (e.until > now) return false;
  e.until = now + cd;
  return true;
}
// An island or a harbor works for everybody's safety: no harm in the safe waters, at the harbor island or the outpost.
const crashSafe = (s, isl) => isl.harbor || isl.outpost || (typeof inSafe === "function" && inSafe(s)) || (s.isPlayer && docked);

function crashLand(s, dmg, src, x, y, nx, ny) {
  const frac = dmg / s.maxHp;
  s.hp -= dmg;
  vfxFlash(s);
  if (onScreen(s.x, s.y)) {
    dmgNumber(s, dmg, s.isPlayer ? "#ff8a75" : "#c9b48a", s.isPlayer ? 16 : 13);
    if (frac >= CRASH_BIG) floatText(s.x, s.y - 54, t("fCrash"), "#ffd36a", 15);
    const n = Math.min(14, 4 + Math.round(frac * 40)) >> (PERF_LOW ? 1 : 0);
    FX.splinter.explode(n, x + nx * 6, y + ny * 6);   // wood splinters off the stove-in planking
  }
  Snd.play("crash", { x: s.x, y: s.y, big: s.isPlayer, amount: clamp(frac / CRASH_BIG, 0.3, 1.5) });
  if (s.isPlayer || src === player) camShake(80 + frac * 600, Math.min(0.007, 0.0015 + frac * 0.03));
  runHook("hurt", s, dmg, src);
  if (s.hp <= 0) sink(s, src);
}
// Called by move() (js/ships.js) when the hull is pushed off an island; (nx, ny) points from the ship to the island,
// vx / vy are the velocity it arrived with.
function crashIsland(s, isl, nx, ny) {
  if (!s.alive || s.fixed || s.ally || crashSafe(s, isl)) return;   // an escort scrapes a rock harmlessly: it must not be bled for its flagship's course
  const now = S.time.now / 1000, book = s.crashBook || (s.crashBook = new Map());
  const fresh = crashContact(book, isl, now), frac = crashFrac(s.vx * nx + s.vy * ny, CRASH_ISLAND_K);
  if (!frac || !fresh || !crashDue(book, isl, now)) return;
  crashLand(s, crashDamage(frac, s.maxHp, s.hp, !!s.isPlayer), null, s.x + nx * ((s.hw ?? 13) + 2), s.y + ny * ((s.hw ?? 13) + 2), nx, ny);
  if (!s.isPlayer) s.shoreAway = { x: isl.x, y: isl.y, until: now + 2 };   // an AI turns away from the rock for a moment
}
// Called by step() (js/main.js) for two overlapping hulls; (nx, ny) is the unit vector from a to b.
function crashShips(a, b, nx, ny) {
  if (a.struck || b.struck) return;   // a ship that struck her colours (js/strike.js) is never rammed to the bottom, and lying alongside her to board (js/boarding.js) is no collision
  if (a.fixed || b.fixed || (a.A && a.A.boom) || (b.A && b.A.boom) || (docked && (a.isPlayer || b.isPlayer))) return;
  if ((typeof inSafe === "function") && (inSafe(a) || inSafe(b))) return;
  if ((a.isPlayer || a.ally) && (b.isPlayer || b.ally)) return;   // the flagship and its escorts jostle in formation: no blow, no damage
  const now = S.time.now / 1000, book = a.crashBook || (a.crashBook = new Map());
  const fresh = crashContact(book, b, now), base = shipFrac((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
  if (!fresh || !crashDue(book, b, now)) return;
  a.speed *= CRASH_SHED; b.speed *= CRASH_SHED;   // the blow takes the way off both hulls: two AI ships don't grind on each other
  const mayKill = !!(a.isPlayer || b.isPlayer), ma = hullMass(a), mb = hullMass(b), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  crashLand(a, crashDamage(base * massShare(ma, mb), a.maxHp, a.hp, mayKill), b, cx, cy, -nx, -ny);
  crashLand(b, crashDamage(base * massShare(mb, ma), b.maxHp, b.hp, mayKill), a, cx, cy, nx, ny);
}
