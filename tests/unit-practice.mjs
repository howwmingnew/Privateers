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
    outfitEnemy(e, k) { e.arch = k; e.A = { boom: k === "fireship" }; e.merchant = k === "fluyt"; e.cls = k; },
  });
  for (const f of ["js/config.js", "js/flee.js", "js/novice.js", "js/notify-order.js"]) vm.runInContext(src(f), ctx, { filename: f });
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
