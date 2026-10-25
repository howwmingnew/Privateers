// Unit tests for #108: the newcomer's cap near the harbor, Red Ned's leash and kept wounds, the escorts' catch-up speed and low-hull warning.
// Pure functions only, loaded into node:vm contexts. Usage: node --test tests/unit-sea108.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const dom = new Proxy(function () {}, { get: (_, k) => (k === "length" ? 0 : dom), apply: () => dom, construct: () => dom, set: () => true });
function boot(files, extra = {}) {
  const ctx = vm.createContext({
    console, Math, Map, Set, WeakSet, Array, Number, JSON, Object, document: dom, window: dom,
    onHook() {}, STR: { en: {}, zh: {} }, shipRating: () => 1, LIVERY: { player: {} }, ...extra,
  });
  for (const f of files) vm.runInContext(src(f), ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test("noviceHome: held to the cap only before the first bounty, outside New Game+, and within two screens of the harbor", () => {
  const g = boot(["js/novice.js"]);
  assert.equal(g.run("noviceHome(0, 0, NOVICE_PORT_R - 1)"), true);
  assert.equal(g.run("noviceHome(0, 0, NOVICE_PORT_R + 1)"), false, "the far seas keep their difficulty bands");
  assert.equal(g.run("noviceHome(1, 0, 500)"), false, "after the first bounty the sea is as usual");
  assert.equal(g.run("noviceHome(0, 1, 500)"), false, "a New Game+ captain is no novice");
  assert.ok(g.run("NOVICE_PORT_R") >= 2200, "reaches the Reef Straits and the edge of the Lanes");
});

test("escortPace: its own speed in formation, enough to catch a full-sail flagship once it has fallen behind", () => {
  const g = boot(["js/config.js", "js/escort-ai.js"]);
  assert.equal(g.run("escortPace(100, 120, ESCORT_CATCH_D - 1)"), 100, "in formation: the yard's speed");
  near(g.run("escortPace(100, 120, ESCORT_CATCH_D + 1)"), 120 * g.run("ESCORT_CATCH_K"), "behind a faster flagship: it presses on");
  assert.equal(g.run("escortPace(150, 120, ESCORT_CATCH_D + 1)"), 150, "an escort already faster never slows to the flagship");
  assert.ok(g.run("ESCORT_CATCH_K") > 1, "it can out-run a flagship at full sail to rejoin");
});

test("escIsLow: under ESCORT_WARN of the hull", () => {
  const g = boot(["js/config.js", "js/escort-hud.js"], { clamp: (v, a, b) => Math.min(b, Math.max(a, v)), lang: "en" });
  assert.equal(g.run("escIsLow(0.34)"), true);
  assert.equal(g.run("escIsLow(ESCORT_WARN)"), false);
  assert.equal(g.run("escIsLow(1)"), false);
  assert.equal(g.json("escHudRows([{ slot: 0, e: { alive: true, hp: 30, maxHp: 100 } }])")[0].p, 30);
});

test("bossTether: slides along the leash line while fighting, turns for the lair only well past it; Ned stands, the others do not", () => {
  const findBounty = id => (id === "ned" ? { id, tether: 480, stands: true } : id === "carey" ? { id } : null);
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b)), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // campaign.js needs the whole game's globals to load; only the two pure helpers are cut out and run here
  const code = src("js/campaign.js"), cut = (from, to) => code.slice(code.indexOf(from), code.indexOf(to));
  const ctx = vm.createContext({ Math, findBounty, angDiff, dist });
  vm.runInContext(cut("const TETHER_BACK", "// Hull art for a spec class") + "; globalThis.bossTether = bossTether; globalThis.bossStands = bossStands;", ctx);
  const lair = { x: 0, y: 0 }, ship = (x, extra = {}) => ({ boss: "ned", lair, x, y: 0, ...extra });
  const T = ctx.bossTether, within = v => Math.abs(Math.cos(v.desired)) < 0.5;
  assert.equal(T(ship(300), 0, 1), null, "inside the line: free");
  const slide = T(ship(520), 0, 1);
  assert.ok(slide && within(slide) && Math.cos(slide.desired) < 0, "just past the line: along it, bent inward, still fighting");
  const side = T(ship(520), 0.3, 1), side2 = T(ship(520), -0.3, 1);
  assert.ok(Math.sin(side.desired) * Math.sin(side2.desired) < 0, "the slide goes the side the chase wanted");
  const e = ship(600), home = T(e, 0, 1);
  assert.equal(Math.round(Math.cos(home.desired)), -1, "well past the line: home");
  assert.equal(e.tethered, true);
  assert.equal(T(ship(530, { tethered: true }), Math.PI, 1) !== null, true, "stays turned until 120 px inside the line");
  assert.equal(T(ship(300, { tethered: true }), 0, 1), null);
  assert.equal(T(ship(700, { boss: "carey" }), 0, 1), null, "only a tethered bounty");
  assert.equal(ctx.bossStands({ boss: "ned" }), true);
  assert.equal(ctx.bossStands({ boss: "carey" }), false);
  assert.equal(ctx.bossStands({}), false);
});

test("Ned's wounds are kept exactly between sorties: BOSS_MEND is 0 and an unhurt or sunk bounty sails whole", () => {
  const code = src("js/campaign.js"), cut = (from, to) => code.slice(code.indexOf(from), code.indexOf(to));
  const ctx = vm.createContext({ Math });
  vm.runInContext(cut("const BOSS_MEND", "let huntSeenAt") + "; globalThis.m = bossMended; globalThis.mend = BOSS_MEND;", ctx);
  assert.equal(ctx.mend, 0);
  assert.equal(ctx.m(0.02), 0.02, "2% stays 2%");
  assert.equal(ctx.m(0.5), 0.5);
  assert.equal(ctx.m(undefined), 1, "no record (sunk, new game, NG+): whole");
});

function near(a, b, msg) { assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`); }
