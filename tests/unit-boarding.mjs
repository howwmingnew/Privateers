// Unit tests for boarding (js/boarding.js, js/strike.js): who can be boarded, the 2-second progress, the alongside test, the
// prize gun (chance, type by faction, level), the gun store and the full-store gold, and who may surrender. Scripts load into one
// node:vm context, as in tests/unit-flags.mjs.
// Usage: node --test tests/unit-boarding.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/strike.js", "js/boarding.js"];
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
// what the game provides around these files
vm.runInContext(`var crates = [], enemies = [], player = null, tut = { target: null };
  const shipRadius = s => ((s.hl ?? 28) + (s.hw ?? 13)) / 2;
  const addCrate = (x, y, v) => crates.push(v), refreshBadge = () => {}, onScreen = () => false, coachUp = () => false;`, ctx);
for (const f of FILES) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
const ship = (o = {}) => ({ alive: true, struck: true, faction: "merchant", merchant: true, L: 1, x: 0, y: 0, vx: 0, vy: 0, hp: 50, maxHp: 100, maxSpeed: 100, loot: 100, ...o });

test("boardable: a struck ship can be boarded; one that has not struck cannot", () => {
  assert.equal(run(`boardable(${JSON.stringify({ alive: true, struck: true, faction: "merchant" })})`), true);
  assert.equal(run(`boardable(${JSON.stringify({ alive: true, struck: false })})`), false);
  assert.equal(run(`boardable(${JSON.stringify({ alive: false, struck: true })})`), false);
  assert.equal(run(`boardable(null)`), false);
});

test("boardable: bosses, escorts, convoy escorts, the tutorial target, fireships, forts and boarded ships are refused", () => {
  for (const x of [{ boss: "hale" }, { boss: 1, rematch: true }, { escortOf: 3 }, { escort: true }, { fixed: true }, { A: { boom: true } }, { boarded: true }, { isPlayer: true }])
    assert.equal(run(`boardable({ alive: true, struck: true, ...${JSON.stringify(x)} })`), false, JSON.stringify(x));
  run(`var tm = { alive: true, struck: true }; tut.target = tm;`);
  assert.equal(run("boardable(tm)"), false);
  run("tut.target = null");
  assert.equal(run("boardable(tm)"), true);
});

test("boardTick: fills in BOARD_T seconds, drains faster than it fills, stays within 0..BOARD_T", () => {
  assert.equal(run("BOARD_T"), 2);
  let t = 0; for (let i = 0; i < 119; i++) t = run(`boardTick(${t}, true, 1 / 60)`);
  assert.ok(t < 2 && t > 1.95);
  t = run(`boardTick(${t}, true, 1 / 60)`); assert.ok(Math.abs(t - 2) < 1e-9);
  assert.equal(run("boardTick(2, true, 5)"), 2);
  assert.equal(run("boardTick(1, false, 0.25)"), 1 - 0.25 * run("BOARD_DECAY"));
  assert.equal(run("boardTick(0.1, false, 5)"), 0);
});

test("alongside: close and slow enough, not when far or when ramming past", () => {
  const r = run(`shipRadius({}) * 2`), gap = run("BOARD_GAP");
  const at = (d, v = 0) => run(`alongside({ x: 0, y: 0, vx: ${v}, vy: 0 }, { x: ${d}, y: 0, vx: 0, vy: 0 })`);
  assert.equal(at(r - 5), true);
  assert.equal(at(r + gap - 1), true);
  assert.equal(at(r + gap + 1), false);
  assert.equal(at(r, run("BOARD_REL_V") + 1), false);
  assert.equal(at(r, run("BOARD_REL_V") - 1), true);
});

test("prizeGun: the roll decides whether, by faction; level follows the ship's level", () => {
  const c = f => run(`BOARD_GUN_CHANCE.${f}`);
  assert.equal(run(`prizeGun({ faction: "merchant", L: 1 }, ${c("merchant")}, 0)`), null);   // at the chance: no
  assert.notEqual(run(`prizeGun({ faction: "merchant", L: 1 }, ${c("merchant") - 0.001}, 0)`), null);
  assert.notEqual(run(`prizeGun({ faction: "navy", L: 1 }, ${c("navy") - 0.001}, 0)`), null);
  assert.equal(run(`prizeGun({ faction: "pirate", L: 1 }, 0.99, 0)`), null);
  assert.deepEqual(json(`prizeGun({ faction: "merchant", L: 1 }, 0, 0)`), { g: "six", lv: 1 });
  assert.equal(run(`prizeGun({ faction: "navy", L: 1 }, 0, 0).lv`), 1);
  assert.equal(run(`prizeGun({ faction: "navy", L: 5 }, 0, 0).lv`), 2);
  assert.equal(run(`prizeGun({ faction: "navy", L: 99 }, 0, 0).lv`), run("BOARD_LV_MAX"));
  assert.equal(run(`prizeGun({ faction: "navy" }, 0, 0).lv`), 1);   // no level: Lv 1
});

test("prizeGun: every pick is a real gun, every weighted gun is reachable, a merchant never yields a fire gun", () => {
  for (const f of ["merchant", "pirate", "navy"]) {
    const seen = new Set();
    for (let i = 0; i < 400; i++) { const g = json(`prizeGun({ faction: "${f}", L: 3 }, 0, ${i / 400})`); assert.ok(run(`Object.hasOwn(GUNS, "${g.g}")`)); seen.add(g.g); }
    assert.deepEqual([...seen].sort(), json(`Object.keys(BOARD_GUNS.${f})`).sort(), f);
  }
  assert.ok(!json(`Object.keys(BOARD_GUNS.merchant)`).includes("fire"));
  assert.deepEqual(json(`prizeGun({ faction: "ghost", L: 1 }, 0, 0)`), { g: "six", lv: 1 });   // an unknown faction is treated as a merchant
});

test("claimPrize: a gun goes to the store (the save is not mutated); nothing leaves the save alone", () => {
  run(`var sv = { gold: 10, store: [] }, gun = gunItem("long12", 2);`);
  const r = json("claimPrize(sv, gun)");
  assert.equal(r.kind, "gun"); assert.deepEqual(r.save.store, [{ g: "long12", lv: 2 }]); assert.equal(r.gold, 0);
  assert.deepEqual(json("sv"), { gold: 10, store: [] });
  assert.equal(json("claimPrize(sv, null)").kind, "none");
});

test("claimPrize: a full gun store turns the gun into gold and keeps the store as it was", () => {
  run(`var full = { gold: 100, store: Array.from({ length: MAX_STORE }, () => gunItem("six")) };`);
  const r = json(`claimPrize(full, gunItem("carronade", 2))`);
  assert.equal(r.kind, "sold");
  assert.equal(r.gold, run(`GUNS.carronade.cost * 2 * BOARD_FULL_K`));
  assert.equal(r.save.gold, 100 + r.gold);
  assert.equal(r.save.store.length, run("MAX_STORE"));
  assert.equal(run("claimPrize(full, gunItem('six')).save.store.length"), run("MAX_STORE"));
  run(`var almost = { gold: 0, store: Array.from({ length: MAX_STORE - 1 }, () => gunItem("six")) };`);
  assert.equal(run("claimPrize(almost, gunItem('six')).kind"), "gun");   // one slot left still takes it
});

test("boardGold: a share of the loot she carried, nothing for an old ship without a record", () => {
  assert.equal(run("boardGold({ lootWas: 200 })"), Math.round(200 * run("BOARD_GOLD_K")));
  assert.equal(run("boardGold({})"), 0);
});

test("striking: a merchant dumps her cargo and records it; a warship keeps hers; both stop fighting", () => {
  run(`var M = ${JSON.stringify(ship({ vol: { bow: {} } }))}; M.target = {}; M.angry = 5; crates.length = 0; strikeColors(M, null);`);
  assert.equal(run("M.struck"), true); assert.equal(run("M.lootWas"), 100); assert.equal(run("M.loot"), 0);
  assert.deepEqual(json("crates"), [100]); assert.deepEqual(json("M.vol"), {}); assert.equal(run("M.target"), null); assert.equal(run("M.angry"), 0);
  assert.equal(run("M.maxSpeed"), 100 * run("STRIKE_SLOW"));
  run(`var WS = { alive: true, faction: "navy", merchant: false, x: 0, y: 0, hp: 5, maxHp: 100, maxSpeed: 100, loot: 80, vol: { bow: {} } }; crates.length = 0; strikeColors(WS, null);`);
  assert.equal(run("WS.loot"), 80); assert.equal(run("WS.lootWas"), 80); assert.equal(run("crates.length"), 0);
});

test("canSurrender: pirates and navy only, never bosses, escorts, fireships, forts, merchants or the struck", () => {
  const ok = { alive: true, faction: "pirate" };
  assert.equal(run(`canSurrender(${JSON.stringify(ok)})`), true);
  assert.equal(run(`canSurrender(${JSON.stringify({ ...ok, faction: "navy" })})`), true);
  for (const x of [{ faction: "merchant", merchant: true }, { boss: "hale" }, { escortOf: 1 }, { escort: true }, { fixed: true }, { A: { boom: true } }, { struck: true }, { surrenderRolled: true }, { alive: false }, { isPlayer: true }])
    assert.equal(run(`canSurrender({ ...${JSON.stringify(ok)}, ...${JSON.stringify(x)} })`), false, JSON.stringify(x));
});

test("maybeSurrender: only under SURRENDER_AT of the hull, one roll per ship, chance SURRENDER_CHANCE", () => {
  run(`var wins = 0, N = 2000;
    for (let i = 0; i < N; i++) { const s = { alive: true, faction: "navy", x: 0, y: 0, hp: 10, maxHp: 100, maxSpeed: 100, loot: 0 }; maybeSurrender(s, null); maybeSurrender(s, null); if (s.struck) wins++; }`);
  const p = run("wins / N"), want = run("SURRENDER_CHANCE");
  assert.ok(Math.abs(p - want) < 0.06, `rate ${p} vs ${want}`);
  run(`var hi = { alive: true, faction: "navy", x: 0, y: 0, hp: 40, maxHp: 100, maxSpeed: 100, loot: 0 }; maybeSurrender(hi, null);`);
  assert.equal(run("!!hi.struck"), false); assert.equal(run("!!hi.surrenderRolled"), false);   // healthy: no roll spent
  run(`var dead = { alive: true, faction: "navy", x: 0, y: 0, hp: 0, maxHp: 100, maxSpeed: 100, loot: 0 }; maybeSurrender(dead, null);`);
  assert.equal(run("!!dead.struck"), false);
});

test("strings: every boarding string exists in English and Chinese with the same placeholders", () => {
  for (const k of ["boardHint", "fBoarded", "fBoardGold", "toastPrizeGun", "toastPrizeSold"]) {
    const en = run(`STR.en.${k}`), zh = run(`STR.zh.${k}`);
    assert.ok(en && zh, k);
    assert.deepEqual((en.match(/\{\w+\}/g) || []).sort(), (zh.match(/\{\w+\}/g) || []).sort(), k);
  }
});
