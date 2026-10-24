// Unit tests for supply stations and trade ports (#13): placement, services, the paid repair step. Pure functions only; the
// scripts load into one node:vm context, as in tests/unit.mjs. Usage: node --test tests/unit-ports.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/world-seas.js", "js/ports.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
// world-seas.js builds its banner element at load: a stub document is enough
const PRELUDE = `const STR = { en: {}, zh: {} }; const onHook = () => {};
  const el = () => ({ setAttribute() {}, append() {}, style: {}, classList: { add() {}, remove() {}, toggle() {} } });
  const document = { createElement: el, body: el(), getElementById: () => null, addEventListener() {} };`;

function boot() {
  const ctx = vm.createContext({ console });
  vm.runInContext(PRELUDE, ctx);
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
// the bounty lairs (js/campaign.js) and the hulk outpost, as polar spots, for the spacing checks
const FIXED = `[[Math.PI, ringMid(3)], [-Math.PI / 2, ringMid(5)], [Math.PI * 0.75, ringMid(7)], [0, ringMid(9)], [Math.PI / 4, 3800], [Math.PI / 8, ringEdge(7)]].map(([a, r]) => polarPt(a, r))`;

test("there are supply stations and trade ports, fewer in the deadlier seas", () => {
  const g = boot();
  const list = g.json("STATIONS.map(s => ({ kind: s.kind, ring: s.ring }))");
  assert.ok(list.some(s => s.kind === "supply") && list.some(s => s.kind === "trade"), "both kinds exist");
  const per = id => list.filter(s => g.run(`seaOfRing(${s.ring}).id`) === id).length;
  assert.ok(per("shallows") >= per("reef") && per("reef") >= per("lanes") && per("lanes") >= per("maelstrom"), "never more stations further out");
  assert.equal(per("maelstrom"), 0, "the Maelstrom has none");
  assert.equal(new Set(g.json("STATIONS.map(s => s.id)")).size, list.length, "ids are unique");
});

test("stations sit on the map, clear of the harbor, the lairs, the outpost and each other", () => {
  const g = boot();
  const spots = g.json("STATIONS"), fixed = g.json(FIXED);
  for (const s of spots) {
    assert.ok(s.x > 300 && s.x < 7700 && s.y > 300 && s.y < 7700, `${s.id} inside the world`);
    assert.ok(Math.hypot(s.x - 4000, s.y - 4000) > 620 + 300, `${s.id} outside the harbor's safe water`);
    for (const f of fixed) assert.ok(Math.hypot(s.x - f.x, s.y - f.y) > 1000, `${s.id} clear of a lair or the outpost`);
    for (const o of spots) if (o !== s) assert.ok(Math.hypot(s.x - o.x, s.y - o.y) > 1000, `${s.id} clear of ${o.id}`);
    assert.equal(g.run(`ringAt(Math.hypot(${s.x} - PORT.x, ${s.y} - PORT.y))`), s.ring, `${s.id} lies in its own ring`);
  }
});

test("each dock kind does only its own job", () => {
  const g = boot();
  assert.deepEqual(g.json('serviceOf("supply")'), { sell: false, heal: true, fee: true }, "supply: mends for a fee, never buys");
  assert.deepEqual(g.json('serviceOf("trade")'), { sell: true, heal: false }, "trade: buys, never mends");
  assert.deepEqual(g.json('serviceOf("return")'), { sell: true, heal: true });
  assert.deepEqual(g.json('serviceOf("outpost")'), { sell: true, heal: true });
  assert.deepEqual(g.json('serviceOf("whatever")'), { sell: true, heal: true }, "an unknown kind falls back to the harbor");
  assert.equal(g.run('isStationKind("supply") && isStationKind("trade")'), true);
  assert.equal(g.run('isStationKind("return") || isStationKind("outpost")'), false);
});

test("the repair fee grows with the ring", () => {
  const g = boot();
  const fees = [2, 4, 7].map(r => g.run(`supplyFee(${r})`));
  assert.ok(fees[0] > 0 && fees[0] < fees[1] && fees[1] < fees[2]);
  assert.equal(g.run("supplyFee(4)"), g.run("SUPPLY_FEE_PER_RING * 4"));
});

test("a paid repair step mends at the set rate and charges for exactly what it mended", () => {
  const g = boot();
  const r = g.json("supplyStep(100, 200, 0.5, 1e9, 4)");
  const mended = r.hp - 100;
  assert.ok(Math.abs(mended - 200 * 0.4 * 0.5) < 1e-9, "SUPPLY_HEAL of max hull per second");
  assert.ok(Math.abs(r.cost - mended / 200 * 100) < 1e-9, "the fee is the hull's share times the full fee (25 x ring 4 = 100)");
});

test("a paid repair never overshoots full hull, and is free when nothing is missing", () => {
  const g = boot();
  const top = g.json("supplyStep(199, 200, 5, 1e9, 4)");
  assert.equal(top.hp, 200);
  assert.ok(Math.abs(top.cost - 0.5) < 1e-9, "only the missing 1 hp (0.5% of 100 gold... 1/200 x 100) is charged");
  assert.deepEqual(g.json("supplyStep(200, 200, 1, 1e9, 4)"), { hp: 200, cost: 0 });
});

test("a paid repair stops when the gold runs out, and charges no more than the purse", () => {
  const g = boot();
  assert.deepEqual(g.json("supplyStep(50, 200, 1, 0, 4)"), { hp: 50, cost: 0 }, "no gold, no repair");
  const r = g.json("supplyStep(50, 200, 1, 10, 4)");   // a full second would cost 80 x 100/200 = 40 gold
  assert.ok(Math.abs(r.cost - 10) < 1e-9 && r.cost <= 10, "the whole purse, no more");
  assert.ok(r.hp > 50 && r.hp < 50 + 200 * 0.4, "a part of the second's repair");
  assert.deepEqual(g.json("supplyStep(50, 200, 0, 100, 4)"), { hp: 50, cost: 0 }, "no time, no repair");
});

test("stationAt finds the circle a ship is in, and nothing outside it", () => {
  const g = boot();
  const s = g.json("STATIONS[0]");
  assert.equal(g.run(`stationAt({ x: ${s.x + 100}, y: ${s.y} }).id`), s.id);
  assert.equal(g.run(`stationAt({ x: ${s.x + 100}, y: ${s.y} }, 50)`), null, "a smaller radius excludes it");
  assert.equal(g.run(`stationAt({ x: ${s.x + 2000}, y: ${s.y + 2000} })`), null);
});

test("the dock list mirrors the stations", () => {
  const g = boot();
  const docks = g.json("STATION_DOCKS"), st = g.json("STATIONS");
  assert.equal(docks.length, st.length);
  docks.forEach((d, i) => { assert.equal(d.x, st[i].x); assert.equal(d.y, st[i].y); assert.equal(d.kind, st[i].kind); assert.equal(d.ring, st[i].ring); assert.equal(d.outpost, false); });
});
