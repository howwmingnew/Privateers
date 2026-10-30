// Unit tests for phase 2 logic (hall of fame, daily sea, seeded generation, share text): pure functions only, the scripts
// load into one node:vm context, as in tests/unit.mjs. Usage: node --test tests/unit-phase2.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js",
  "js/postcard.js", "js/logbook.js", "js/hall.js", "js/daily.js", "js/sharecard.js", "js/archetypes.js", "js/world-seas.js", "js/ports.js", "js/campaign.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);

// Any property, call or assignment on a stand-in DOM object is accepted: several files build elements at load time.
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
function boot(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
    console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
  });
  // js/run.js is not loaded (it needs the scene): the stubs say "no run is going"
  vm.runInContext("function runActive() { return false; } function runBounty() { return null; } function runKind() { return null; } function runLink() { return ''; }", ctx);
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)), store };
}
const g = boot();

// ---------- hall of fame ----------
test("hall: a new save starts with an empty hall, and an old save without the field loads", () => {
  assert.deepEqual(g.json("defaultSave().hall"), { sunk: 0, chain: 0, boss: {}, win: 0 });
  const old = g.json(`sanitizeSave(JSON.parse('{"v":2,"gold":5,"sunk":3}'))`);   // no hall at all
  assert.deepEqual(old.hall, { sunk: 0, chain: 0, boss: {}, win: 0 });
  assert.equal(old.gold, 5);
});

test("hall: hand-edited values are cleaned, not trusted", () => {
  const h = g.json(`sanitizeHall({ sunk: "12", chain: -4, win: "x", boss: { ned: 61.26, "__proto__": 5, "BAD KEY": 3, carey: -1, saint: "n/a" } })`);
  assert.deepEqual(h, { sunk: 12, chain: 0, boss: { ned: 61.3 }, win: 0 });
  assert.deepEqual(g.json("sanitizeHall(null)"), { sunk: 0, chain: 0, boss: {}, win: 0 });
});

test("hall: records only move the right way, and say when they broke", () => {
  const a = g.json(`hallApply({ sunk: 5, chain: 0, boss: {}, win: 0 }, { type: "sunk", n: 9 })`);
  assert.equal(a.hall.sunk, 9); assert.equal(a.broke, true);
  const b = g.json(`hallApply({ sunk: 9, chain: 0, boss: {}, win: 0 }, { type: "sunk", n: 9 })`);
  assert.equal(b.broke, false, "a tie is not a record");
  const c = g.json(`hallApply({ sunk: 0, chain: 4, boss: {}, win: 0 }, { type: "chain", n: 3 })`);
  assert.equal(c.hall.chain, 4); assert.equal(c.broke, false);
});

test("hall: the fastest sinking of each captain and the fastest win keep the lower time", () => {
  let r = g.json(`hallApply({ sunk: 0, chain: 0, boss: {}, win: 0 }, { type: "boss", id: "ned", sec: 80 })`);
  assert.deepEqual(r.hall.boss, { ned: 80 });
  r = g.json(`hallApply({ sunk: 0, chain: 0, boss: { ned: 80 }, win: 0 }, { type: "boss", id: "ned", sec: 95 })`);
  assert.equal(r.broke, false); assert.equal(r.hall.boss.ned, 80);
  r = g.json(`hallApply({ sunk: 0, chain: 0, boss: { ned: 80 }, win: 0 }, { type: "boss", id: "carey", sec: 120 })`);
  assert.deepEqual(r.hall.boss, { ned: 80, carey: 120 });
  r = g.json(`hallApply({ sunk: 0, chain: 0, boss: {}, win: 4000 }, { type: "win", sec: 3500 })`);
  assert.equal(r.hall.win, 3500); assert.equal(r.broke, true);
  r = g.json(`hallApply({ sunk: 0, chain: 0, boss: {}, win: 3500 }, { type: "win", sec: 3600 })`);
  assert.equal(r.hall.win, 3500);
});

test("hall: applying an event never mutates the old hall", () => {
  const out = g.run(`(() => { const h = { sunk: 1, chain: 1, boss: { ned: 90 }, win: 0 }; const frozen = JSON.stringify(h);
    hallApply(h, { type: "sunk", n: 7 }); hallApply(h, { type: "boss", id: "ned", sec: 10 }); return JSON.stringify(h) === frozen; })()`);
  assert.equal(out, true);
});

test("hall: it survives New Game+ (the new save is built from a keep list)", () => {
  assert.match(readFileSync(new URL("../js/campaign.js", import.meta.url), "utf8"), /hall: save\.hall/);
});

// ---------- the daily sea ----------
const at = iso => Date.parse(iso);
test("daily: #1 is 2026-10-24 UTC and the number grows at every UTC midnight", () => {
  assert.equal(g.run(`dailyNumber(${at("2026-10-24T00:00:00Z")})`), 1);
  assert.equal(g.run(`dailyNumber(${at("2026-10-24T23:59:59.999Z")})`), 1);
  assert.equal(g.run(`dailyNumber(${at("2026-10-25T00:00:00Z")})`), 2);
  assert.equal(g.run(`dailyNumber(${at("2027-01-01T00:00:00Z")})`), 70);
  assert.equal(g.run(`dailyNumber(${at("2026-01-01T00:00:00Z")})`), 1, "a clock before the epoch still reads #1");
});

test("daily: the seed follows the day number alone, in range, and differs day to day", () => {
  const seeds = g.json("Array.from({ length: 400 }, (_, i) => dailySeed(i + 1))");
  assert.deepEqual(seeds, g.json("Array.from({ length: 400 }, (_, i) => dailySeed(i + 1))"));
  assert.ok(seeds.every(s => Number.isInteger(s) && s >= 1000 && s <= 2147000000 && s !== 7));
  assert.equal(new Set(seeds).size, 400);
});

test("daily: the same seed gives the same captain, hull, escort and lair", () => {
  const a = g.json("dailySpec(dailySeed(57))"), b = g.json("dailySpec(dailySeed(57))");
  assert.deepEqual(a, b);
  assert.equal(a.L, 5); assert.equal(a.daily, true);
  assert.equal(a.r, 620 + 4 * 320 + 160, "mid ring 5");
});

test("daily: every day makes a hunt the campaign code can run, and the days vary", () => {
  const specs = g.json("Array.from({ length: 120 }, (_, i) => dailySpec(dailySeed(i + 1)))");
  for (const s of specs) {
    assert.match(s.id, /^d([0-9]|1[01])$/);
    assert.ok(["cutter", "brig", "frigate"].includes(s.cls));
    assert.ok(s.hpMul >= 0.5 && s.hpMul <= 7, "hull multiplier " + s.hpMul);
    assert.ok(s.ang >= 0 && s.ang <= 2 * Math.PI);
    assert.ok(Array.isArray(s.escorts));
  }
  assert.ok(new Set(specs.map(s => s.id)).size >= 8, "names vary");
  assert.ok(new Set(specs.map(s => s.cls)).size === 3, "all three hulls turn up");
  assert.ok(new Set(specs.map(s => s.trait)).size === 5, "all five escorts turn up");
});

test("daily: every captain has a name in both languages", () => {
  for (let i = 0; i < 12; i++) {
    assert.ok(g.run(`STR.en["boss_d${i}"]`) && g.run(`STR.zh["boss_d${i}"]`));
  }
  assert.equal(g.run(`t("boss_d0")`), "Black Jerry");
});

// ---------- seeded generation ----------
test("seeded RNG: with a seed the generation rolls repeat; without one they are Math.random", () => {
  const same = g.json(`(() => { const roll = seed => { setGenRng(mulberry32(seed)); return [grandom(), grand(10, 20), pickFaction(), pickArch(5, "pirate"), pickArch(8, "navy")]; };
    const a = JSON.stringify(roll(99)), b = JSON.stringify(roll(99)), c = JSON.stringify(roll(100)); setGenRng(null); return [a === b, a !== c]; })()`);
  assert.deepEqual(same, [true, true]);
  assert.equal(g.run("genRng"), null);
  assert.notEqual(g.run("grandom()"), g.run("grandom()"));
});

test("seeded RNG: a long run of picks is the same from the same seed", () => {
  const run = seed => g.run(`(() => { setGenRng(mulberry32(${seed})); const out = []; for (let i = 0; i < 200; i++) out.push(pickFaction() + ":" + pickArch(1 + i % 10, pickFaction())); setGenRng(null); return out.join(","); })()`);
  assert.equal(run(4242), run(4242));
  assert.notEqual(run(4242), run(4243));
});

test("islands: a seed lays out the same islands every time", () => {
  const a = g.run("JSON.stringify(genIslands(123456))"), b = g.run("JSON.stringify(genIslands(123456))"), c = g.run("JSON.stringify(genIslands(123457))");
  assert.equal(a, b); assert.notEqual(a, c);
  assert.ok(g.json("genIslands(123456)").length >= 60);
});

// ---------- the record of days played ----------
const R = (won, bossT, sunk, hull) => ({ won, bossT, sunk, hull });
test("daily result: a sunk captain beats a free one, then speed, then ships, then hull", () => {
  const beats = (a, b) => g.run(`dailyBeats(dailyResult(${JSON.stringify(a)}), ${b ? `dailyResult(${JSON.stringify(b)})` : "null"})`);
  assert.equal(beats(R(true, 200, 0, 10), R(false, 0, 30, 100)), true);
  assert.equal(beats(R(false, 0, 30, 100), R(true, 200, 0, 10)), false);
  assert.equal(beats(R(true, 90, 1, 10), R(true, 100, 9, 100)), true);
  assert.equal(beats(R(true, 100, 5, 10), R(true, 100, 4, 100)), true);
  assert.equal(beats(R(true, 100, 5, 60), R(true, 100, 5, 50)), true);
  assert.equal(beats(R(true, 100, 5, 50), R(true, 100, 5, 50)), false, "a tie is not a new best");
  assert.equal(beats(R(false, 0, 1, 1), null), true);
});

test("daily record: best result per day, streak counts consecutive days, a gap restarts it", () => {
  const step = (store, n, r) => g.json(`dailyRecord(${JSON.stringify(store)}, ${n}, dailyResult(${JSON.stringify(r)}))`);
  let s = step(null, 10, R(false, 0, 3, 40));
  assert.equal(s.best, true); assert.equal(s.streak, 1);
  s = step(s.store, 10, R(true, 120, 5, 70));   // same day again: better, streak unchanged
  assert.equal(s.best, true); assert.equal(s.streak, 1); assert.equal(s.store.days[10].won, true);
  s = step(s.store, 10, R(true, 150, 9, 90));   // slower: not a new best, kept result stays
  assert.equal(s.best, false); assert.equal(s.store.days[10].bossT, 120);
  s = step(s.store, 11, R(false, 0, 0, 0));
  assert.equal(s.streak, 2); assert.equal(s.store.bestStreak, 2);
  s = step(s.store, 13, R(false, 0, 0, 0));      // skipped #12
  assert.equal(s.streak, 1); assert.equal(s.store.bestStreak, 2);
});

test("daily record: the streak shown on the title lapses after a missed day", () => {
  const store = { v: 1, days: {}, streak: 4, bestStreak: 6, last: 20 };
  assert.equal(g.run(`liveStreak(${JSON.stringify(store)}, 20)`), 4);
  assert.equal(g.run(`liveStreak(${JSON.stringify(store)}, 21)`), 4);
  assert.equal(g.run(`liveStreak(${JSON.stringify(store)}, 22)`), 0);
});

test("daily record: bad stored data is cleaned; the record keeps 60 days at most; nothing is mutated", () => {
  const messy = g.json(`sanitizeDaily({ days: { "5": { won: true, bossT: 99, sunk: 4, hull: 250 }, "x": {}, "7": 3 }, streak: "2", last: -1 })`);
  assert.deepEqual(Object.keys(messy.days), ["5"]);
  assert.equal(messy.days["5"].hull, 100); assert.equal(messy.streak, 2); assert.equal(messy.last, 0);
  assert.deepEqual(g.json("sanitizeDaily('junk')"), { v: 1, days: {}, streak: 0, bestStreak: 0, last: 0 });
  const days = g.json(`(() => { let s = null; for (let n = 1; n <= 80; n++) s = dailyRecord(s && s.store, n, dailyResult({ won: false, bossT: 0, sunk: n, hull: 0 })); return Object.keys(s.store.days).length; })()`);
  assert.equal(days, 60);
  assert.equal(g.run(`(() => { const s = { v: 1, days: {}, streak: 1, bestStreak: 1, last: 4 }, f = JSON.stringify(s); dailyRecord(s, 5, dailyResult({ won: true, bossT: 5, sunk: 1, hull: 1 })); return JSON.stringify(s) === f; })()`), true);
});

test("daily: the record lives under its own key and never touches the campaign save", () => {
  const b = boot({ "privateers-save-v2": '{"v":2,"gold":77}' });
  b.run(`saveDaily(dailyRecord(null, 3, dailyResult({ won: true, bossT: 60, sunk: 2, hull: 50 })).store)`);
  assert.equal(b.store.get("privateers-save-v2"), '{"v":2,"gold":77}');
  assert.equal(b.json("loadDaily()").days["3"].bossT, 60);
  assert.equal(b.run("DAILY_KEY"), "privateers-daily-v1");
});

test("links: #daily and #seed=N open the right run; anything else does not", () => {
  assert.deepEqual(g.json(`parseRunHash("#daily")`), { kind: "daily", n: 0, seed: 0, friend: null });
  assert.deepEqual(g.json(`parseRunHash("#seed=12345")`), { kind: "seed", n: 0, seed: 12345, friend: null });
  for (const bad of ["", "#", "#seed=", "#seed=0", "#seed=abc", "#seed=-5", "#seed=99999999999", "#seed=2147483648", "#daily2", "#other", "#daily=0", "#daily=abc", "#daily=-3", "#daily=1234567"]) {
    assert.equal(g.json(`parseRunHash(${JSON.stringify(bad)})`), null, bad);
  }
  assert.equal(g.run(`parseRunHash("#seed=2147483647").seed`), 2147483647);
});

test("links: a friend's result rides in the address; figures are validated and clamped", () => {
  const p = h => g.json(`parseRunHash(${JSON.stringify(h)})`);
  assert.deepEqual(p("#daily=57&t=102&hp=64&k=9"), { kind: "daily", n: 57, seed: 0, friend: { won: true, bossT: 102, hull: 64, sunk: 9 } });
  assert.deepEqual(p("#daily=57&hp=0&k=3").friend, { won: false, bossT: 0, hull: 0, sunk: 3 }, "no t: the captain got away");
  assert.deepEqual(p("#daily=57&t=9999&hp=500&k=123456").friend, { won: true, bossT: 300, hull: 100, sunk: 999 }, "clamped to what a run can reach");
  assert.equal(p("#daily=57&t=abc&hp=50&k=2").friend.won, false, "a bad t is ignored");
  assert.equal(p("#daily=57&t=60&hp=x&k=2").friend, null, "a bad hp drops the friend result");
  assert.equal(p("#daily=57&t=60&hp=50").friend, null, "k missing");
  assert.equal(p("#daily=57&t=-5&hp=50&k=2").friend.won, false, "negative is not a number here");
  assert.equal(p("#daily=57&t=60&hp=50&k=2&__proto__=1&name=bob").friend.sunk, 2, "unknown parameters are ignored");
  assert.equal(p("#daily=57&t=1e3&hp=5.5&k=2").friend, null);
  assert.equal(p("#daily=57").friend, null);
});

test("links: a result becomes an address that parses back to the same figures", () => {
  const won = g.json(`dailyLink(57, dailyResult({ won: true, bossT: 102, sunk: 9, hull: 64 }))`);
  assert.equal(won, "#daily=57&t=102&hp=64&k=9");
  const lost = g.json(`dailyLink(57, dailyResult({ won: false, bossT: 0, sunk: 4, hull: 0 }))`);
  assert.equal(lost, "#daily=57&hp=0&k=4");
  assert.deepEqual(g.json(`parseRunHash(${JSON.stringify(won)}).friend`), { won: true, bossT: 102, hull: 64, sunk: 9 });
  assert.deepEqual(g.json(`parseRunHash(${JSON.stringify(lost)}).friend`), { won: false, bossT: 0, hull: 0, sunk: 4 });
});

// ---------- difficulty by weekday ----------
test("difficulty: Monday is 1 and Sunday is 7 by the UTC date, the same for everyone", () => {
  // #1 = 2026-10-24, a Saturday (6); the 7 days from Monday 2026-10-26 (#3) climb 1..7
  assert.equal(g.run("dailyTier(1)"), 6);
  assert.equal(g.run("dailyTier(2)"), 7);
  assert.deepEqual(g.json("[3, 4, 5, 6, 7, 8, 9].map(dailyTier)"), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(g.run("dailyTier(10)"), 1, "and it wraps");
  assert.equal(g.run("dailyTier(0)"), g.run("dailyTier(1)"), "an impossible day reads as #1");
});

test("difficulty: the table has 7 levels that only get harder, and the captain follows it", () => {
  const T = g.json("DAILY_TIERS");
  assert.equal(T.length, 7);
  for (let i = 1; i < 7; i++) assert.ok(T[i].hp > T[i - 1].hp && T[i].speed >= T[i - 1].speed, "tier " + (i + 1));
  const hp = tier => g.run(`dailySpec(dailySeed(57), ${tier}).hpMul`), sp = tier => g.run(`dailySpec(dailySeed(57), ${tier}).speed`);
  assert.ok(hp(7) > hp(1) * 2, `${hp(1)} -> ${hp(7)}`); assert.ok(sp(7) > sp(1));
  const a = g.json("dailySpec(dailySeed(57), 3)"), b = g.json("dailySpec(dailySeed(57), 3)");
  assert.deepEqual(a, b, "same day, same tier, same captain");
  const x = g.json("dailySpec(dailySeed(57), 2)"), y = g.json("dailySpec(dailySeed(57), 6)");
  assert.deepEqual({ ...x, hpMul: 0, speed: 0 }, { ...y, hpMul: 0, speed: 0 }, "only the hull and speed change with the tier");
  assert.equal(g.json("dailySpec(dailySeed(57), 99)").hpMul, hp(7), "a tier out of range is clamped");
});

test("difficulty: the label names the weekday in both languages", () => {
  const b = boot();
  lang(b, "en"); assert.equal(b.run("dailyTierLabel(9)"), "Sunday · Difficulty 7/7"); assert.equal(b.run("dailyTierLabel(3)"), "Monday · Difficulty 1/7");
  lang(b, "zh"); assert.equal(b.run("dailyTierLabel(9)"), "週日・難度 7/7");
});

// ---------- comparing with a friend ----------
test("friend: both sank the captain: faster or slower, more or fewer ships, more or less hull", () => {
  const cmp = (me, fr) => g.json(`compareFriend(${JSON.stringify(me)}, ${JSON.stringify(fr)})`);
  assert.deepEqual(cmp({ won: true, bossT: 90, sunk: 7, hull: 74 }, { won: true, bossT: 102, sunk: 9, hull: 64 }),
    [["dc_faster", { s: 12 }], ["dc_fewer", { n: 2 }], ["dc_hullUp", { n: 10 }]]);
  assert.deepEqual(cmp({ won: true, bossT: 110, sunk: 9, hull: 60 }, { won: true, bossT: 102, sunk: 7, hull: 64 }),
    [["dc_slower", { s: 8 }], ["dc_more", { n: 2 }], ["dc_hullDown", { n: 4 }]]);
  assert.deepEqual(cmp({ won: true, bossT: 100, sunk: 3, hull: 50 }, { won: true, bossT: 100, sunk: 3, hull: 50 }), [["dc_same", {}], ], "same time; nothing else differs");
});
test("friend: one of you let the captain get away", () => {
  const cmp = (me, fr) => g.json(`compareFriend(${JSON.stringify(me)}, ${JSON.stringify(fr)})`);
  assert.equal(cmp({ won: true, bossT: 100, sunk: 3, hull: 50 }, { won: false, bossT: 0, sunk: 3, hull: 50 })[0][0], "dc_winOnly");
  assert.equal(cmp({ won: false, bossT: 0, sunk: 3, hull: 50 }, { won: true, bossT: 100, sunk: 3, hull: 50 })[0][0], "dc_friendOnly");
  assert.deepEqual(cmp({ won: false, bossT: 0, sunk: 3, hull: 20 }, { won: false, bossT: 0, sunk: 3, hull: 20 }), [["dc_tie", {}]]);
  assert.deepEqual(cmp({ won: false, bossT: 0, sunk: 5, hull: 20 }, { won: false, bossT: 0, sunk: 3, hull: 30 }), [["dc_more", { n: 2 }], ["dc_hullDown", { n: 10 }]]);
});
test("friend: the lines read in both languages, and the friend's result names today's captain", () => {
  const b = boot();
  const lines = r => b.json(`compareFriend(dailyResult(${JSON.stringify(r[0])}), dailyResult(${JSON.stringify(r[1])})).map(([k, v]) => t(k, v))`);
  const pair = [{ won: true, bossT: 90, sunk: 7, hull: 74 }, { won: true, bossT: 102, sunk: 9, hull: 64 }];
  lang(b, "zh"); assert.deepEqual(lines(pair), ["比朋友快 12 秒", "還差 2 艘", "船體多 10%"]);
  lang(b, "en"); assert.deepEqual(lines(pair), ["12 s faster than your friend", "2 ships short", "10% more hull"]);
  const name = b.run(`t("boss_" + dailySpec(dailySeed(57)).id)`);
  assert.equal(b.run(`friendText(57, { won: true, bossT: 102, hull: 64, sunk: 9 })`), `Friend: ${name} sunk in 1:42 · hull 64% · 9 sunk`);
  lang(b, "zh");
  assert.match(b.run(`friendText(57, { won: false, bossT: 0, hull: 0, sunk: 3 })`), /^朋友：.+ 逃脫 · 船體 0% · 擊沉 3 艘$/);
});


// ---------- share text ----------
const lang = (b, l) => b.run(`lang = "${l}"`);
test("share text: sortie, boss, victory and hall in both languages", () => {
  const b = boot();
  lang(b, "en");
  assert.equal(b.run(`shareSpec("sortie", { sunk: 14, gold: 2340, secs: 552 }).text`), "⚓ Privateers: 14 sunk · 2,340 gold · 9 min 12 s at sea");
  assert.equal(b.run(`shareSpec("boss", { bossName: "Red Ned", secs: 552, sunk: 14 }).text`), "⚓ Privateers: 14 sunk · Red Ned taken in 9 min 12 s");
  assert.match(b.run(`shareSpec("victory", { winTime: 3725, sunk: 400, gold: 52000 }).text`), /Admiral Thorne sunk in 1 h 2 min · 400 ships · 52.0K gold/);
  assert.match(b.run(`shareSpec("victory", { winTime: 0, sunk: 4, gold: 5 }).text`), /^⚓ Privateers: Admiral Thorne sunk · 4 ships/);
  assert.equal(b.run(`shareSpec("log", { hall: { sunk: 21, chain: 8, win: 0 } }).text`), "⚓ Privateers hall of fame: 21 sunk in one sortie · a 8-kill chain");
  lang(b, "zh");
  assert.equal(b.run(`shareSpec("sortie", { sunk: 14, gold: 2340, secs: 552 }).text`), "⚓ Privateers：擊沉 14 艘 · 2,340 金 · 出航 9 分 12 秒");
  assert.equal(b.run(`shareSpec("boss", { bossName: "紅鬍奈德", secs: 552, sunk: 14 }).text`), "⚓ Privateers：擊沉 14 艘 · 9 分 12 秒拿下紅鬍奈德");
});

test("share text: the daily line has the number, the captain, the time and the hull", () => {
  const b = boot();
  lang(b, "zh");
  assert.equal(b.run(`shareSpec("daily", { n: 57, bossName: "黑喬瑞", won: true, bossT: 102, sunk: 6, hull: 64 }).text`), "Privateers 每日 #57 · 黑喬瑞 1:42 擊沉 · 船體 64%");
  assert.equal(b.run(`shareSpec("daily", { n: 57, bossName: "黑喬瑞", won: false, bossT: 0, sunk: 6, hull: 0 }).text`), "Privateers 每日 #57 · 黑喬瑞 逃脫 · 擊沉 6 艘 · 船體 0%");
  lang(b, "en");
  assert.equal(b.run(`shareSpec("daily", { n: 57, bossName: "Black Jerry", won: true, bossT: 102, sunk: 6, hull: 64 }).text`), "Privateers Daily #57 · Black Jerry sunk in 1:42 · hull 64%");
  assert.equal(b.run(`shareSpec("daily", { n: 57, bossName: "x", won: true, bossT: 1, sunk: 0, hull: 1 }).badges`), "", "no daily-rewards script (or no badge): no badge line");
});

test("share text: the link is the game's page, with #daily for the daily and #seed= for a seeded sea", () => {
  const b = boot();
  assert.equal(b.run(`shareSpec("sortie", { sunk: 1, gold: 1, secs: 1 }).url`), "https://howwmingnew.github.io/Privateers/");
  assert.equal(b.run(`shareSpec("daily", { n: 1, bossName: "x", won: true, bossT: 5, sunk: 0, hull: 1 }).url`), "https://howwmingnew.github.io/Privateers/#daily=1&t=5&hp=1&k=0");
  assert.equal(b.run(`shareSpec("sortie", { sunk: 1, gold: 1, secs: 1, link: "#seed=77" }).url`), "https://howwmingnew.github.io/Privateers/#seed=77");
  assert.equal(b.run(`(() => { const s = shareSpec("sortie", { sunk: 2, gold: 3, secs: 4 }); return shareFull(s) === s.text + " " + s.url; })()`), true);
});

test("share cards: every kind has a title and 3-4 stat tiles; the clock reads m:ss", () => {
  const b = boot();
  const kinds = { sortie: { sunk: 1, gold: 2, secs: 3 }, boss: { bossName: "Ned", secs: 4, sunk: 1 }, victory: { winTime: 99, sunk: 3, gold: 4 },
    log: { hall: { sunk: 1, chain: 2, win: 3 } }, daily: { n: 2, bossName: "x", won: true, bossT: 61, sunk: 2, hull: 9, streak: 3 } };
  for (const [k, d] of Object.entries(kinds)) {
    const s = b.json(`shareSpec(${JSON.stringify(k)}, ${JSON.stringify(d)})`);
    assert.ok(s.title && s.text && s.name.endsWith(".png"), k);
    assert.ok(s.stats.length >= 3 && s.stats.length <= 4, k + " tiles: " + s.stats.length);
  }
  assert.equal(b.run("fmtClock(102)"), "1:42"); assert.equal(b.run("fmtClock(5)"), "0:05"); assert.equal(b.run("fmtClock(-3)"), "0:00");
  assert.throws(() => b.run(`shareSpec("nope")`), /unknown share kind/);
});
