// Unit tests for the practice waters (#113): near the harbor, before the first bounty, a ship made is a Lv 1 target that never
// runs and never fires first (js/novice.js practiceZone / practiceShip, js/notify-order.js tameFirstVoyage, js/flee.js, js/ships.js isHostile).
// Usage: node --test tests/unit-practice.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const dom = new Proxy(function () {}, { get: (_, k) => (k === "length" ? 0 : dom), apply: () => dom, construct: () => dom, set: () => true });
const ships = src("js/ships.js"), hostile = ships.slice(ships.indexOf("function isHostile"), ships.indexOf("const ignoring"));
function boot() {
  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Number, WeakSet, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {} }, navigator: { language: "en-US" }, onHook() {}, setTimeout, clearTimeout, performance,
    STR: { en: {}, zh: {} }, docked: false, heat: 0, runActive: () => false, shipRating: () => 1, seaOfRing: () => ({ id: "shallows" }),
    save: { campaign: { bounty: 0 }, ngPlus: 0, tutorialDone: false }, bossFeud: () => false, inSafe: () => false,
    pickArch: (L, f) => f === "navy" ? "fireship" : "brig",   // worst case: the mix hands out a fireship
    outfitEnemy(e, k) { e.threatL = e.L; e.arch = k; e.A = { boom: k === "fireship" }; e.merchant = k === "fluyt"; e.cls = k; },
  });
  for (const f of ["js/config.js", "js/util.js", "js/flee.js", "js/novice.js", "js/notify-order.js"]) vm.runInContext(src(f), ctx, { filename: f });
  vm.runInContext(hostile, ctx);
  return { ctx, run: code => vm.runInContext(code, ctx) };
}
const mk = (o = {}) => ({ x: 4600, y: 4000, L: 5, threatL: 5, faction: "pirate", merchant: false, alive: true, ...o });

test("zone: the harbor circle, until the first bounty, outside New Game+ and the daily run", () => {
  const g = boot();
  assert.equal(g.run("practiceZone(PORT.x + 1000, PORT.y)"), true);
  assert.equal(g.run("practiceZone(PORT.x + NOVICE_PORT_R + 50, PORT.y)"), false, "outside the circle: as before");
  g.run("save.campaign.bounty = 1");
  assert.equal(g.run("practiceZone(PORT.x + 1000, PORT.y)"), false, "first bounty claimed");
  g.run("save.campaign.bounty = 0; save.ngPlus = 1");
  assert.equal(g.run("practiceZone(PORT.x + 1000, PORT.y)"), false, "New Game+");
  g.run("save.ngPlus = 0; runActive = () => true");
  assert.equal(g.run("practiceZone(PORT.x + 1000, PORT.y)"), false, "a daily run");
});

test("spawn: an ordinary ship made in the zone is a Lv 1 practice target, never a fireship", () => {
  const g = boot();
  const e = g.run("(" + JSON.stringify(mk({ faction: "navy" })) + ")");
  g.ctx.e = e;
  g.run("tameFirstVoyage(e, false)");
  assert.equal(e.L, 1); assert.equal(e.practice, true); assert.notEqual(e.arch, "fireship");
  const m = mk({ faction: "merchant", merchant: true }); g.ctx.m = m; g.run("tameFirstVoyage(m, false)");
  assert.equal(m.practice, true); assert.equal(m.arch, "fluyt");
});

test("spawn: placed ships, Red Ned and his guards, ships outside the zone, and any ship after the first bounty or in NG+ are not targets", () => {
  const g = boot();
  const check = (o, placed = false) => { const e = mk(o); g.ctx.e = e; g.run(`tameFirstVoyage(e, ${placed})`); return e; };
  assert.notEqual(check({}, true).practice, true, "placed (a bounty, its guard, the tutorial's mark)");
  assert.notEqual(check({ boss: true, fixed: false }, true).practice, true);
  assert.notEqual(check({ x: 9000 }).practice, true, "outside the circle");
  assert.notEqual(check({ fixed: true }).practice, true, "a shore battery");
  assert.notEqual(check({ faction: "ally" }).practice, true, "the captain's escort");
  g.run("heat = 3");
  assert.notEqual(check({ faction: "navy" }).practice, true, "a hunter's spawn while Wanted");
  g.run("heat = 0; save.campaign.bounty = 1");
  assert.notEqual(check({}).practice, true, "first bounty claimed");
  g.run("save.campaign.bounty = 0; save.ngPlus = 2");
  assert.notEqual(check({}).practice, true, "New Game+");
});

test("flee: a practice target is never a runner; the same ship after the first bounty can be", () => {
  const g = boot();
  g.ctx.p = mk({ practice: true });
  assert.equal(g.run("fleeBold(p)"), true);
  g.run("save.campaign.bounty = 1");
  assert.equal(g.run("fleeBold(p)"), false, "the flag lapses with the first bounty");
  g.ctx.o = mk(); assert.equal(g.run("fleeBold(o)"), false, "an ordinary ship outside the practice still runs by the old rules");
});

test("hostility: a practice target never locks on the captain first, but fights back once shot, and still fights other ships", () => {
  const g = boot();
  g.ctx.player = { isPlayer: true, alive: true, faction: "player" };
  const e = mk({ practice: true, attacker: null, angry: 0, ignore: new Map() }); g.ctx.e = e;
  assert.equal(g.run("isHostile(e, player)"), false, "pirate practice ship, player in range");
  e.faction = "navy"; assert.equal(g.run("isHostile(e, player)"), false, "navy too");
  Object.assign(e, { attacker: g.ctx.player, angry: 8 });
  assert.equal(g.run("isHostile(e, player)"), true, "shot at: it fights back");
  const plain = mk({ practice: false, attacker: null, angry: 0, ignore: new Map() }); g.ctx.plain = plain;
  assert.equal(g.run("isHostile(plain, player)"), true, "a ship from outside keeps its old hostility");
  const other = mk({ faction: "navy", alive: true }); g.ctx.other = other;
  Object.assign(e, { faction: "pirate", attacker: null, angry: 0 });
  assert.equal(g.run("isHostile(e, other)"), true, "pirate vs navy fights go on");
  g.run("save.campaign.bounty = 1");
  assert.equal(g.run("isHostile(e, player)"), true, "after the first bounty a leftover pirate is ordinary");
});

test("provoked: a practice target the captain hit fights on (no timer), still never runs; escort flag is cleared", () => {
  const g = boot();
  g.ctx.player = { isPlayer: true, alive: true, faction: "player" };
  const e = mk({ practice: true, attacker: null, angry: 0, ignore: new Map() }); g.ctx.e = e;
  assert.equal(g.run("practiceShip(e)"), true);
  e.practiceProvoked = true;
  assert.equal(g.run("practiceShip(e)"), false, "provoked: no longer a never-fires-first target");
  assert.equal(g.run("practiceTarget(e)"), true, "but still a target that never runs");
  assert.equal(g.run("fleeBold(e)"), true);
  assert.equal(g.run("isHostile(e, player)"), true, "hostile long after the 8 s anger has lapsed");
  const b = mk({ escort: true, faction: "merchant" }); g.ctx.b = b; g.run("tameFirstVoyage(b, false)");
  assert.equal(b.practice, true); assert.equal(!!b.escort, false, "a convoy brig made in the zone is no escort");
});

// ---- #115: two bands. Inner (first 3 rings, to PRACTICE_R = ringEdge(4)): practice targets. Outer (to NOVICE_PORT_R): ordinary Lv 2-3 ships.
test("bands: the inner band is the first 3 rings, the outer band runs from there to NOVICE_PORT_R", () => {
  const g = boot();
  assert.equal(g.run("PRACTICE_R"), 1580, "SAFE_R 620 + 3 x ZONE_STEP 320 = ringEdge(4)");
  assert.ok(g.run("PRACTICE_R") < g.run("NOVICE_PORT_R"));
  assert.equal(g.run("practiceZone(PORT.x + PRACTICE_R - 1, PORT.y)"), true);
  assert.equal(g.run("practiceZone(PORT.x + PRACTICE_R, PORT.y)"), false);
  assert.equal(g.run("outerZone(PORT.x + PRACTICE_R - 1, PORT.y)"), false);
  assert.equal(g.run("outerZone(PORT.x + PRACTICE_R, PORT.y)"), true);
  assert.equal(g.run("outerZone(PORT.x + NOVICE_PORT_R - 1, PORT.y)"), true);
  assert.equal(g.run("outerZone(PORT.x + NOVICE_PORT_R, PORT.y)"), false, "beyond the circle: the usual bands");
  const ned = g.run("SAFE_R + 2 * ZONE_STEP + ZONE_STEP / 2");   // ringMid(3), Red Ned's lair
  assert.ok(ned < g.run("PRACTICE_R"), "Red Ned's lair is in the inner band");
  g.run("save.campaign.bounty = 1");
  assert.equal(g.run("outerZone(PORT.x + 2000, PORT.y)"), false, "first bounty claimed");
  g.run("save.campaign.bounty = 0; save.ngPlus = 1");
  assert.equal(g.run("outerZone(PORT.x + 2000, PORT.y)"), false, "New Game+");
  g.run("save.ngPlus = 0; runActive = () => true");
  assert.equal(g.run("outerZone(PORT.x + 2000, PORT.y)"), false, "a daily run");
});

test("outerLv: Lv 2 on ring 4, Lv 3 on rings 5-6, never above Ship Lv + 1, never under 2", () => {
  const g = boot(), lv = (ring, me) => g.run(`outerLv(${ring}, ${me})`);
  assert.deepEqual([4, 5, 6].map(r => lv(r, 9)), [2, 3, 3]);
  assert.deepEqual([4, 5, 6].map(r => lv(r, 1)), [2, 2, 2], "a Ship Lv 1 captain: capped at Lv 2");
  assert.deepEqual([4, 5, 6].map(r => lv(r, 2)), [2, 3, 3]);
  for (let me = 1; me <= 12; me++) for (let r = 4; r <= 6; r++) { assert.ok(lv(r, me) >= 2); assert.ok(lv(r, me) <= me + 1); assert.ok(lv(r, me) <= 3); }
});

test("spawn: an ordinary ship made in the outer band is a normal ship at outerLv; it keeps its flee/first-strike rules", () => {
  const g = boot();
  g.run("seaOfRing = r => ({ id: r <= 3 ? \"shallows\" : \"reef\" })");
  const make = (o, me = 1) => { g.ctx.me = me; g.run("shipRating = () => me"); const e = mk({ x: 4000 + 2000, ring: 5, ...o }); g.ctx.e = e; g.run("tameFirstVoyage(e, false)"); return e; };
  const e = make({});
  assert.equal(e.L, 2, "Ship Lv 1: Lv 2"); assert.notEqual(e.practice, true, "not a practice target");
  assert.equal(g.run("practiceShip(e)"), false); assert.equal(g.run("practiceTarget(e)"), false, "it may flee");
  assert.equal(make({}, 6).L, 3, "ring 5 at Ship Lv 6: Lv 3");
  assert.equal(make({ ring: 4 }, 6).L, 2, "ring 4: Lv 2");
  assert.equal(make({ x: 4000 + 1500 }).practice, true, "just inside the line: still a practice target");
  assert.equal(make({ x: 4000 + 3000, ring: 8 }).L, 5, "beyond the circle: untouched");
  g.run("heat = 3");
  assert.equal(make({ faction: "navy" }, 1).L, 2, "a hunter's spawn while Wanted keeps the old cap (Ship Lv + 1)");
});
