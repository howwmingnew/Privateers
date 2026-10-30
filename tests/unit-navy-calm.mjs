// Unit tests for #120: the Navy never opens fire on the captain or his escorts while Wanted is under 2 stars (js/novice.js navyCalm,
// js/ships.js isHostile), retaliation lifts it, and Space auto-fire skips a Navy ship while the captain is not Wanted (js/combat.js autoSkips).
// Usage: node --test tests/unit-navy-calm.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const dom = new Proxy(function () {}, { get: (_, k) => (k === "length" ? 0 : dom), apply: () => dom, construct: () => dom, set: () => true });
const ships = src("js/ships.js"), hostile = ships.slice(ships.indexOf("function isHostile"), ships.indexOf("const ignoring"));
const combat = src("js/combat.js"), skips = combat.slice(combat.indexOf("const autoSkips"), combat.indexOf("function autoFire"));
function boot() {
  const hooks = {};
  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Number, WeakSet, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {} }, navigator: { language: "en-US" }, onHook: (n, f) => { (hooks[n] ||= []).push(f); }, setTimeout, clearTimeout, performance,
    STR: { en: {}, zh: {} }, docked: false, runActive: () => false, shipRating: () => 1, bossFeud: () => false, inSafe: () => false,
    player: { isPlayer: true, alive: true }, save: { campaign: { bounty: 0 }, ngPlus: 0, tutorialDone: true },
  });
  for (const f of ["js/config.js", "js/novice.js", "js/heat.js"]) vm.runInContext(src(f), ctx, { filename: f });
  vm.runInContext(hostile + skips, ctx);
  return { ctx, hooks, run: code => vm.runInContext(code, ctx) };
}
const navy = (o = {}) => ({ faction: "navy", alive: true, L: 5, x: 0, y: 0, ...o });
const hurtAll = (g, ...a) => (g.hooks.hurt || []).forEach(f => f(...a));
const esc = { alive: true, ally: true, faction: "ally" };
const setHeat = (g, h) => { g.run(`heat = ${h}; spare.navy = heatStars(heatNow()) < HEAT_HUNT_FROM`); };   // what noviceTick computes each frame

test("under 2 stars the Navy does not open fire on the captain or an escort; from 2 stars it does", () => {
  const g = boot(), n = navy(); g.ctx.n = n; g.ctx.esc = esc;
  for (const h of [0, 20, 39]) { setHeat(g, h); assert.equal(g.run("isHostile(n, player)"), false, `heat ${h}`); assert.equal(g.run("isHostile(n, esc)"), false, `escort, heat ${h}`); }
  for (const h of [40, 100]) { setHeat(g, h); assert.equal(g.run("isHostile(n, player)"), true, `heat ${h}`); assert.equal(g.run("isHostile(n, esc)"), true); }
});

test("pirates are untouched by the rule, and the Navy still fights pirates", () => {
  const g = boot(); g.ctx.p = navy({ faction: "pirate" }); g.ctx.n = navy(); setHeat(g, 0);
  assert.equal(g.run("isHostile(p, player)"), true);
  assert.equal(g.run("isHostile(n, p)"), true);
});

test("retaliation: hurt by the captain or an escort (hook) or angry at the attacker lifts the calm", () => {
  const g = boot(); setHeat(g, 0);
  const a = navy(), b = navy(), c = navy(), d = navy(); Object.assign(g.ctx, { a, b, c, d, esc });
  hurtAll(g, a, 5, g.ctx.player);   // shot or rammed by the captain
  hurtAll(g, b, 5, esc);            // by an escort
  assert.equal(g.run("isHostile(a, player)"), true); assert.equal(g.run("isHostile(b, esc)"), true);
  assert.equal(g.run("isHostile(c, player)"), false, "its neighbour stays calm");
  d.attacker = g.ctx.player; d.angry = 3; assert.equal(g.run("isHostile(d, player)"), true, "angry at the one who hit it");
  d.angry = 0; assert.equal(g.run("isHostile(d, player)"), false, "once it cools, back to calm");
  hurtAll(g, c, 5, navy({ faction: "pirate" })); assert.equal(g.run("isHostile(c, player)"), false, "a pirate's shot is not the captain's");
});

test("bosses and their escorts are not calmed", () => {
  const g = boot(); setHeat(g, 0);
  for (const o of [{ boss: "hale" }, { escortOf: "hale" }]) { g.ctx.x = navy(o); assert.equal(g.run("navyCalm(x)"), false); }
});

test("the daily run keeps the old behaviour (heat is off there)", () => {
  const g = boot(); g.run("heat = 0; spare.navy = false");   // noviceTick: live is false in a run
  g.ctx.n = navy(); assert.equal(g.run("isHostile(n, player)"), true);
});

test("auto-fire skips a Navy ship only at 0 stars and only if it is not already hostile", () => {
  const g = boot(); g.ctx.n = navy(); g.ctx.p = navy({ faction: "pirate" });
  assert.equal(g.run("autoSkips(n, 0, false)"), true);
  assert.equal(g.run("autoSkips(n, 0, true)"), false, "already at war with the captain");
  assert.equal(g.run("autoSkips(n, 1, false)"), false, "Wanted: no more accidents to avoid");
  assert.equal(g.run("autoSkips(p, 0, false)"), false, "pirates are still shot");
  assert.equal(g.run("autoSkips(null, 0, false)"), false);
});
