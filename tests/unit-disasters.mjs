// Unit tests for sea disasters (js/config.js DISASTER, js/disasters-core.js): how often each kind comes and its caps, the gaps between events,
// the hard damage rules (an event takes at most its cap, never the player under 10% of the hull, nothing for 8 s after an event), how
// a bow-on or beam-on hull fares, that a whirl's pull can always be outrun, the fog, and that one seed gives one voyage of disasters.
// Usage: node --test tests/unit-disasters.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = ["js/config.js", "js/util.js", "js/weather-core.js", "js/disasters-core.js"].map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const ctx = vm.createContext({ Math, Date, Float32Array });
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const D = json("DISASTER");
const SEEDS = Array.from({ length: 600 }, (_, i) => 1000 + i * 7919);
const plans = SEEDS.map(s => json(`disasterPlan(${s})`));

test("one seed gives one voyage of disasters; other seeds give other ones", () => {
  assert.deepEqual(json("disasterPlan(424242)"), json("disasterPlan(424242)"));
  const sig = p => p.map(e => e.kind + Math.round(e.t0)).join("|");
  assert.ok(new Set(plans.map(sig)).size > 50, "plans differ across seeds");
});

test("per-voyage caps: tsunami, spout, vortex, fog 1; rogue wave 2; lightning 2; at most 2 high-threat events", () => {
  for (const p of plans) {
    const n = k => p.filter(e => e.kind === k).length;
    for (const k of ["tsunami", "spout", "vortex", "fog"]) assert.ok(n(k) <= 1, k);
    assert.ok(n("rogue") <= 2 && n("lightning") <= 2);
    assert.ok(p.filter(e => e.high).length <= D.maxHigh);
    assert.ok(p.filter(e => e.kind !== "fog").length <= D.maxHigh + 2, "high-threat + lightning only");
  }
});

test("when each kind may come: spout needs rain, lightning a storm, fog is never in a storm; none before the start", () => {
  const wx = (s, t) => json(`weatherAt(${s}, ${t})`).kind;
  SEEDS.forEach((s, i) => {
    for (const e of plans[i]) {
      assert.ok(e.warnAt >= D.start && e.t0 > e.warnAt);
      assert.ok(e.t0 - e.warnAt >= D[e.kind].warn[0] - 1e-9 && e.t0 - e.warnAt <= D[e.kind].warn[1] + 1e-9, "warning time inside its range: " + e.kind);
      const k = wx(s, e.t0);
      if (e.kind === "spout") assert.notEqual(k, "clear");
      if (e.kind === "lightning") assert.equal(k, "storm");
      if (e.kind === "fog") assert.notEqual(k, "storm");
    }
  });
});

test("frequency over a 10-minute voyage: most see something, tsunami is rare, no kind comes every time", () => {
  const ten = SEEDS.map(s => json(`disasterPlan(${s}, 600)`));
  const withAny = ten.filter(p => p.length).length / ten.length, count = k => ten.filter(p => p.some(e => e.kind === k)).length / ten.length;
  assert.ok(withAny > 0.5 && withAny < 0.97, "any " + withAny);
  assert.ok(count("tsunami") > 0.01 && count("tsunami") < 0.2, "tsunami is rare " + count("tsunami"));
  for (const k of ["spout", "vortex", "rogue", "lightning", "fog"]) assert.ok(count(k) > 0.05 && count(k) < 0.6, k + " " + count(k));
  const avg = ten.reduce((a, p) => a + p.length, 0) / ten.length;
  assert.ok(avg > 0.8 && avg < 2.5, "about one to two a voyage: " + avg);
});

test("spacing: no two blows overlap, 8 s of rest between them, high-threat starts at least 90 s apart", () => {
  for (const p of plans) {
    const blows = p.filter(e => e.kind !== "fog").sort((a, b) => a.t0 - b.t0);
    for (let i = 1; i < blows.length; i++) {
      assert.ok(blows[i].t0 >= blows[i - 1].end + D.protect - 1e-9, "rest after an event");
      const hi = blows.slice(0, i).filter(e => e.high).pop();
      if (blows[i].high && hi) assert.ok(blows[i].t0 - hi.t0 >= D.gap, "90 s between high-threat starts");
    }
    const lt = p.filter(e => e.kind === "lightning");
    if (lt.length === 2) assert.ok(lt[1].t0 - lt[0].t0 >= D.lightning.own);
  }
});

test("the plan never reaches the first voyage's start and a seeded spot lies in the right rings", () => {
  for (const p of plans.slice(0, 80)) for (const e of p.filter(e => ["spout", "vortex", "tsunami"].includes(e.kind))) {
    const sp = json(`disSeededSpot(${JSON.stringify(e)})`), d = Math.hypot(sp.x - 4000, sp.y - 4000), ring = run(`disRing(${d})`);
    assert.ok(ring >= D[e.kind].ring, `${e.kind} spot in ring ${ring}`);
    assert.deepEqual(sp, json(`disSeededSpot(${JSON.stringify(e)})`));
  }
});

const ship = (hp, maxHp = 100, isPlayer = true) => ({ hp, maxHp, isPlayer });
test("hard rule: a disaster never takes the player under 10% of the hull, whatever it wants", () => {
  const dmg = (hp, pct, spent = 0, cap = 1, prot = false) => run(`disDamage(${JSON.stringify(ship(hp))}, ${pct}, ${spent}, ${cap}, ${prot})`);
  near(dmg(100, 0.15), 15);
  near(dmg(20, 0.5), 10);       // 20 left, wants 50: leaves 10
  near(dmg(10, 0.1), 0);        // already at the floor: nothing
  near(dmg(5, 0.2), 0);         // below it: nothing
  for (let hp = 1; hp <= 100; hp += 3) for (const pct of [0.02, 0.1, 0.18, 0.5, 5]) assert.ok(hp - dmg(hp, pct) >= Math.min(hp, 10) - 1e-9);
});

test("hard rule: one event takes at most its cap off a ship, and an enemy can still be sunk by one", () => {
  const dmg = (s, pct, spent, cap) => run(`disDamage(${JSON.stringify(s)}, ${pct}, ${spent}, ${cap}, false)`);
  near(dmg(ship(100), 0.05, 0.16, 0.18), 2);     // 16% spent of an 18% cap: 2% left to give
  near(dmg(ship(100), 0.05, 0.18, 0.18), 0);
  near(dmg(ship(100, 100, false), 0.05, 0.16, 0.18), 2);
  assert.ok(dmg(ship(8, 100, false), 0.5, 0, 1) >= 8);  // an AI hull has no floor: the vortex may sink it
});

test("hard rule: 8 s after an event the player takes no disaster damage; the AI is not covered", () => {
  near(run(`disDamage(${JSON.stringify(ship(100))}, 0.1, 0, 1, true)`), 0);
  near(run(`disDamage(${JSON.stringify(ship(100, 100, false))}, 0.1, 0, 1, true)`), 10);
  assert.equal(D.protect, 8); assert.equal(D.floor, 0.1);
});

test("tsunami: bow on takes the low end (8%) and the small shove, beam on the high end (15%) and the big one", () => {
  const T = (rot, dir) => json(`tsunamiHit(${rot}, ${dir})`);
  const bow = T(Math.PI, 0), beam = T(Math.PI / 2, 0), stern = T(0, 0);
  near(bow.pct, D.tsunami.dmg[0]); near(beam.pct, D.tsunami.dmg[1]);
  assert.ok(bow.push < beam.push && bow.push >= D.tsunami.push[0] - 1e-9 && beam.push <= D.tsunami.push[1] + 1e-9);
  assert.ok(stern.surf && !bow.surf && !beam.surf, "running with the wave surfs for the speed bonus");
  assert.ok(D.tsunami.boost >= 0.2 && D.tsunami.boost <= 0.3);
  for (let r = 0; r < 6.3; r += 0.2) { const h = T(r, 0.7); assert.ok(h.pct >= 0.08 - 1e-9 && h.pct <= 0.15 + 1e-9); }
});

test("tsunami: the wall is a strip that sweeps along its heading", () => {
  const has = (front, x, y) => run(`tsunamiHas({ x: 0, y: 0 }, 0, ${front}, ${x}, ${y})`);
  assert.ok(has(500, 450, 0) && !has(500, 600, 0) && !has(500, 300, 0), "inside the strip only");
  assert.ok(!has(500, 450, 800), "off the wall's width");
});

test("rogue wave: a bow within the window takes 30% of the hit and keeps the helm; any other heading takes it all and loses control", () => {
  const R = (rot, dir) => json(`rogueHit(${rot}, ${dir})`);
  const bow = R(Math.PI, 0), side = R(Math.PI / 2, 0), stern = R(0, 0);
  assert.ok(bow.bow && bow.lost === 0 && bow.stable === D.rogue.stableT);
  assert.ok(!side.bow && side.lost === D.rogue.lostT && !stern.bow);
  near(bow.pct, side.pct * D.rogue.bowK, 1e-9);   // 70% less
  assert.ok(side.pct >= D.rogue.dmg[0] && side.pct <= D.rogue.dmg[1]);
  assert.ok(R(Math.PI + 0.5, 0).bow && !R(Math.PI + 0.7, 0).bow, "the window is about 0.6 rad either side");
});

test("whirls: the pull never exceeds half the hull's own top speed, so full sail always gets out", () => {
  for (const k of ["spout", "vortex"]) {
    const c = D[k];
    let peak = 0;
    for (let r = 1; r < c.R; r += 7) for (let a = 0; a < 6.3; a += 0.4) { const f = json(`fieldPull(DISASTER.${k}, ${r}, 0, ${a}, 200)`); peak = Math.max(peak, Math.hypot(f.x, f.y)); }
    assert.ok(peak <= 200 * c.pull * 1.2 + 1e-9, `${k} peak ${peak}`);
    assert.deepEqual(json(`fieldPull(DISASTER.${k}, ${c.R + 5}, 0, 0, 200)`).w, 0);
  }
});

// Sail out of a whirl: a hull in the middle at full sail (or with a snapped mast and a headwind), heading straight out, or against the swirl.
function escape(kind, { speed = 200, k = 1, head = "out" } = {}) {
  const c = D[kind]; let x = 20, y = 0, t = 0, core = 0, taken = 0;
  while (t < 60) {
    const hd = head === "out" ? Math.atan2(y, x) : Math.atan2(y, x) - Math.PI / 2 + 0.0;   // "against": tangent against the swirl, fanning out
    const f = json(`fieldPull(DISASTER.${kind}, ${x}, ${y}, ${hd}, ${speed})`), dt = 0.05;
    if (!f.w) return { t, core, taken };
    x += (Math.cos(hd) * speed * k + f.x) * dt; y += (Math.sin(hd) * speed * k + f.y) * dt; t += dt;
    if (Math.hypot(x, y) < c.core) { core += dt; taken += (c.dps[1]) * dt; }
  }
  return { t: 99, core, taken };
}
test("whirls: a hull sailing straight out leaves in a few seconds, under the damage cap; a snapped mast and a headwind still leave", () => {
  for (const kind of ["spout", "vortex"]) {
    for (const k of [1, D.mastK, D.mastK * 0.75]) {   // full sail, snapped mast, snapped mast into a strong headwind
      const r = escape(kind, { k });
      assert.ok(r.t < 40, `${kind} k=${k} leaves (${r.t.toFixed(1)} s)`);
      assert.ok(r.taken <= D[kind].cap, `${kind} k=${k} takes ${r.taken.toFixed(3)} <= ${D[kind].cap}`);
    }
  }
  assert.ok(escape("spout", { k: 1 }).t < 12);
});

test("whirls: the worst case, sitting in the core for the whole event, is stopped by the cap and the floor", () => {
  for (const kind of ["spout", "vortex"]) {
    const c = D[kind], s = { hp: 100, maxHp: 100, isPlayer: true };
    let spent = 0;
    for (let t = 0; t < c.life; t += 0.5) {
      const hp = run(`disDamage(${JSON.stringify(s)}, ${c.dps[1] * 0.5}, ${spent}, ${c.cap}, false)`);
      s.hp -= hp; spent += hp / 100;
    }
    assert.ok(spent <= c.cap + 1e-9 && s.hp >= 100 * (1 - c.cap) - 1e-9 && s.hp >= 10, `${kind} spent ${spent}`);
  }
});

test("damage tables match the issue: tsunami 8-15%, rogue 10-18%, lightning 8-12%, spout 2-3%/s (cap 18%), vortex 1-2%/s (cap 15%), fog 0", () => {
  assert.deepEqual(D.tsunami.dmg, [0.08, 0.15]); assert.deepEqual(D.rogue.dmg, [0.10, 0.18]); assert.deepEqual(D.lightning.dmg, [0.08, 0.12]);
  assert.deepEqual(D.spout.dps, [0.02, 0.03]); assert.equal(D.spout.cap, 0.18); assert.deepEqual(D.vortex.dps, [0.01, 0.02]); assert.equal(D.vortex.cap, 0.15);
  assert.equal(D.fog.dmg, undefined); assert.equal(D.fog.dps, undefined);
  assert.deepEqual(D.tsunami.warn, [12, 18]); assert.deepEqual(D.spout.warn, [8, 12]); assert.deepEqual(D.vortex.warn, [6, 10]);
  assert.deepEqual(D.rogue.warn, [4, 6]); assert.deepEqual(D.lightning.warn, [3, 5]); assert.deepEqual(D.fog.warn, [8, 12]);
  assert.deepEqual([D.tsunami.max, D.spout.max, D.vortex.max, D.rogue.max, D.lightning.max, D.fog.max], [1, 1, 1, 2, 2, 1]);
  for (const k of ["tsunami", "spout", "vortex", "rogue", "lightning"]) assert.ok(D[k].ring >= 3, k + " never in the Shallows (rings 1-2)");
});

test("fog: thickens over its fade, thins over its fade, and an AI's wait is 0.5-2 s, shorter for higher levels", () => {
  const ev = { t0: 100, end: 200 }, L = t => run(`fogLevel(${JSON.stringify(ev)}, ${t})`);
  near(L(100), 0); near(L(103), 0.5); near(L(106), 1); near(L(150), 1); near(L(197), 0.5); near(L(200), 0); near(L(50), 0); near(L(250), 0);
  for (let l = 1; l <= 12; l++) { const r = run(`disReact(${l})`); assert.ok(r >= 0.5 && r <= 2); }
  assert.ok(run("disReact(1)") > run("disReact(8)"));
  near(run("DISASTER.fog.sight"), 380);
});

test("a fair place needs a way out: rocks all round it, or the map's edge, do not", () => {
  const ok = rocks => run(`disEscapeOK({ x: 4000, y: 4000 }, 340, ${JSON.stringify(rocks)})`);
  assert.ok(ok([]));
  assert.ok(ok([{ x: 4300, y: 4000, r: 60 }]), "one rock leaves seven ways");
  const ring = Array.from({ length: 8 }, (_, i) => ({ x: 4000 + Math.cos(i * Math.PI / 4) * 400, y: 4000 + Math.sin(i * Math.PI / 4) * 400, r: 90 }));
  assert.ok(!ok(ring), "boxed in");
});

test("lightning: fire or a snapped mast, the split is in the config; the AI's answer has a chance and a delay", () => {
  assert.ok(D.lightning.fire > 0 && D.lightning.fire < 1 && D.lightning.fireDps > 0);
  assert.ok(D.dodge.aware < 1 && D.dodge.busy < D.dodge.aware && D.dodge.margin > 1);
});
