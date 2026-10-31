// Unit tests for the captain's abilities (#16, js/abilities.js): which ship gets which, the clock (ready, recharge, smoke time, a double shot that
// waits for its broadside), the smoke's aim error and what it does to a broadside's hits, and the keg's trigger, fuse reach, boss share and the
// ships it never hurts. Usage: node --test tests/unit-abilities.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/abilities.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

function boot() {
  const ctx = vm.createContext({
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { language: "en-US" }, Map, Math,
    document: { addEventListener() {} }, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const g = boot();

test("every ship in SHIPS has the ability of its line: fast smoke, heavy double shot, the sloop the keg", () => {
  const ids = g.json("Object.keys(SHIPS)");
  assert.ok(ids.length >= 9);
  for (const id of ids) {
    const line = g.run(`SHIPS[${JSON.stringify(id)}].line`), kind = g.run(`abilityOf(${JSON.stringify(id)})`);
    assert.equal(kind, line === "fast" ? "smoke" : line === "heavy" ? "double" : "keg", id);
  }
  assert.deepEqual(["schooner", "brigantine", "cruiser", "corsair"].map(id => g.run(`abilityOf("${id}")`)), ["smoke", "smoke", "smoke", "smoke"]);
  assert.deepEqual(["gunboat", "brig", "frigate", "line"].map(id => g.run(`abilityOf("${id}")`)), ["double", "double", "double", "double"]);
  assert.equal(g.run(`abilityOf("sloop")`), "keg");
  assert.equal(g.run(`abilityOf("nope")`), "keg");   // an unknown id (a hand-edited save) still gets a working ability
});

test("numbers: recharges in 20-35 s, short effects, every one in js/config.js", () => {
  for (const k of ["smoke", "double", "keg"]) { const cd = g.run(`abilityCd("${k}")`); assert.ok(cd >= 20 && cd <= 35, `${k} ${cd}`); }
  assert.ok(g.run("SMOKE_T") <= 6 && g.run("SMOKE_T") < g.run("SMOKE_CD") / 4);
  assert.equal(g.run("DOUBLE_K"), 2);
  assert.ok(g.run("KEG_FUSE") < g.run("KEG_CD"), "a keg has blown before the next can be dropped");
  assert.ok(g.run("KEG_BOSS_K") < g.run("KEG_K") / 3, "bosses take far less");
});

test("the clock: ready -> used -> counts down -> ready again; not usable while recharging", () => {
  const r = g.json(`(() => { const out = []; let st = abilityFresh(); out.push(abilityReady(st));
    st = abilityUse(st, "keg"); out.push(st.cd, abilityReady(st), abilityUse(st, "keg"));
    st = abilityTick(st, KEG_CD - 0.5); out.push(abilityReady(st)); st = abilityTick(st, 0.6); out.push(abilityReady(st), st.cd); return out; })()`);
  assert.deepEqual(r, [true, g.run("KEG_CD"), false, null, false, true, 0]);
});

test("smoke: lit for SMOKE_T s, recharge counted from the moment it is lit", () => {
  const r = g.json(`(() => { let st = abilityUse(abilityFresh(), "smoke"); const a = [st.on, st.cd]; st = abilityTick(st, SMOKE_T); a.push(st.on, st.cd, abilityReady(st));
    st = abilityTick(st, SMOKE_CD); a.push(abilityReady(st)); return a; })()`);
  const T = g.run("SMOKE_T"), CD = g.run("SMOKE_CD");
  assert.deepEqual(r, [T, CD, 0, CD - T, false, true]);
});

test("smoke: an extra error of up to +/- SMOKE_SPREAD rad while lit, none otherwise", () => {
  near(g.run("smokeErr(1, 1)"), g.run("SMOKE_SPREAD"));
  near(g.run("smokeErr(1, -1)"), -g.run("SMOKE_SPREAD"));
  assert.equal(g.run("smokeErr(0, 1)"), 0);
  assert.equal(g.run("abilityAimErr({ isPlayer: false })"), 0);   // only shot at the flagship (and only while lit: abil.on is 0 here)
  assert.equal(g.run("abilityAimErr({ isPlayer: true })"), 0);
});

test("smoke cuts an elite crew's hits on a broadside-on hull to well under half, never to nothing", () => {
  // Monte Carlo: a gun with a perfect aim point, an L8 crew's spread (0.1 rad), a target presenting 50 px of hull, at 150 and 260 px.
  const r = g.json(`(() => { let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
    const hit = (range, on) => { let n = 0; for (let i = 0; i < 20000; i++) { const a = rnd() * enemyStats(8).spread + smokeErr(on, rnd()); if (Math.abs(Math.tan(a) * range) < 25) n++; } return n / 20000; };
    return [150, 260].map(R => [hit(R, 0), hit(R, 1)]); })()`);
  for (const [clear, smoke] of r) { assert.ok(clear > 0.85, `clear ${clear}`); assert.ok(smoke < clear * 0.6 && smoke > 0.2, `smoke ${smoke} vs ${clear}`); }
});

test("double shot: loads without a recharge, doubles exactly one fire that launches side guns, then recharges", () => {
  const r = g.json(`(() => { let st = abilityUse(abilityFresh(), "double"); const out = [st.armed, st.cd, abilityReady(st), abilityUse(st, "double")];
    let x = doubleTake(st, false); out.push(x.k, x.st.armed);          // a bow chaser alone: not spent
    x = doubleTake(x.st, true); out.push(x.k, x.st.armed, x.st.cd);    // the broadside: doubled, spent, recharging
    x = doubleTake(x.st, true); out.push(x.k);                         // the next one: plain
    out.push(doubleTake(abilityFresh(), true).k);                     // never loaded: plain
    return out; })()`);
  assert.deepEqual(r, [true, 0, false, null, 1, true, 2, false, g.run("DOUBLE_CD"), 1, 1]);
});

test("abilityShotK spends the live charge once", () => {
  const r = g.json(`(() => { abilityFx = () => {}; abil = abilityUse(abilityFresh(), "double"); return [abilityShotK(true), abilityShotK(true), abil.armed, abil.cd]; })()`);
  assert.deepEqual(r, [2, 1, false, g.run("DOUBLE_CD")]);
});

test("keg: set off by an enemy within KEG_TRIGGER + its half-beam, not by the flagship, escorts, forts, struck or calm Navy ships", () => {
  const T = g.run("KEG_TRIGGER");
  const trip = (ships, calm = "() => false") => g.run(`(() => { const r = kegTrip({ x: 0, y: 0 }, ${ships}, ${calm}); return r ? r.id : null; })()`);
  assert.equal(trip(`[{ id: "a", x: ${T + 12}, y: 0, hw: 13, alive: true }]`), "a");
  assert.equal(trip(`[{ id: "a", x: ${T + 14}, y: 0, hw: 13, alive: true }]`), null);
  assert.equal(trip(`[{ id: "p", x: 5, y: 0, isPlayer: true, alive: true }]`), null);
  assert.equal(trip(`[{ id: "e", x: 5, y: 0, ally: true, alive: true }]`), null);
  assert.equal(trip(`[{ id: "f", x: 5, y: 0, fixed: true, alive: true }]`), null);
  assert.equal(trip(`[{ id: "s", x: 5, y: 0, struck: true, alive: true }]`), null);
  assert.equal(trip(`[{ id: "d", x: 5, y: 0, alive: false }]`), null);
  assert.equal(trip(`[{ id: "n", x: 5, y: 0, faction: "navy", alive: true }]`, `e => e.faction === "navy"`), null);
  assert.equal(trip(`[{ id: "e", x: 5, y: 0, ally: true, alive: true }, { id: "b", x: 20, y: 0, boss: "x", alive: true }]`), "b");
});

test("keg: the blast's share of max hull, fading to 40% at KEG_R, a boss only KEG_BOSS_K, nothing past the rim", () => {
  const R = g.run("KEG_R"), K = g.run("KEG_K"), B = g.run("KEG_BOSS_K");
  near(g.run("kegDamage({ maxHp: 1000 }, 0)"), 1000 * K);
  near(g.run(`kegDamage({ maxHp: 1000 }, ${R / 2})`), 1000 * K * 0.7);
  near(g.run(`kegDamage({ maxHp: 1000 }, ${R - 1e-6})`), 1000 * K * 0.4, 1e-3);
  assert.equal(g.run(`kegDamage({ maxHp: 1000 }, ${R})`), 0);
  near(g.run("kegDamage({ maxHp: 5000, boss: 'b1' }, 0)"), 5000 * B);
  assert.equal(g.run("kegTarget({ ally: true })"), false);
  assert.equal(g.run("kegTarget({ isPlayer: true })"), false);
  assert.equal(g.run("kegTarget({ boss: 'b1' })"), true);
});

test("the HUD button's spot: above the sail buttons on a portrait phone, beside them when the chart column is in the way, above the hint on a desktop", () => {
  const R = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });
  const spot = (vw, vh, a, obs) => g.json(`abilitySpot(${vw}, ${vh}, ${JSON.stringify(a)}, ${JSON.stringify(obs)})`);
  // 390x844 portrait (measured): sail buttons 194..378 x 733..787, chart column 250..374 x 10..186
  const ts = R(194, 733, 378, 787), side = R(250, 10, 374, 186), hint = R(31, 797, 359, 826);
  assert.deepEqual(spot(390, 844, { ts, side, hintTop: 797 }, [ts, side, hint]), { left: 322, top: 669 });
  // 844x390 landscape, chart 250%: the column (594..828 x 10..296) reaches the sail buttons (648..832 x 279..333): left of the column
  const ts2 = R(648, 279, 832, 333), side2 = R(594, 10, 828, 296), hint2 = R(258, 343, 586, 372), bars = R(16, 10, 236, 163);
  const c = spot(844, 390, { ts: ts2, side: side2, hintTop: 343 }, [ts2, side2, hint2, bars]);
  const hit = o => Math.min(o.right, c.left + 56) - Math.max(o.left, c.left) > 0 && Math.min(o.bottom, c.top + 56) - Math.max(o.top, c.top) > 0;
  assert.ok(![ts2, side2, hint2, bars].some(hit), JSON.stringify(c));
  // a desktop: no sail buttons, bottom right just above the hint line
  assert.deepEqual(spot(1280, 720, { ts: null, side: R(1140, 10, 1268, 200), hintTop: 672 }, [R(470, 672, 810, 702)]), { left: 1212, top: 606 });
});

test("every string has English and Traditional Chinese", () => {
  const keys = g.json("Object.keys(STR.en).filter(k => /^(ab_|f_(smoke|double|dblLoad|keg)$)/.test(k))");
  assert.ok(keys.length >= 15);
  for (const k of keys) assert.ok(g.run(`typeof STR.zh[${JSON.stringify(k)}] === "string" && STR.zh[${JSON.stringify(k)}].length > 0`), k);
});
