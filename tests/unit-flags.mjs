// Unit tests for ship names and flags (js/flags.js): name cleaning and length, the rude-word guard, flag validation, old saves
// getting the default flag and name, and the livery the sea draws. Scripts load into one node:vm context, as in tests/unit-rematch.mjs.
// Usage: node --test tests/unit-flags.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/flags.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
vm.runInContext("var LIVERY = { player: { hull: '#6e3d1f', flag: '#2f8ad6', flag2: '#fff7e2', pennant: '#3fa9ff', trim: '#2f8ad6' } };", ctx);
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
const name = s => run(`cleanShipName(${JSON.stringify(s)})`);

test("name: plain names pass, spaces collapse and trim", () => {
  assert.equal(name("Black Pearl"), "Black Pearl");
  assert.equal(name("  Sea   Wolf  "), "Sea Wolf");
  assert.equal(name("海鷗號"), "海鷗號");
  assert.equal(name("Wolf 海狼"), "Wolf 海狼");
});

test("name: HTML, quotes and control characters are removed", () => {
  assert.equal(name("<b>Wolf</b>"), "bWolf/b");
  assert.equal(name('"><img src=x onerror=alert(1)>'), "img src=x onerror=al");
  assert.equal(name("a\u0000b\u0007c\nd\te"), "a b c d e");
  assert.equal(name("a‮bc"), "a bc");   // bidi override
  assert.equal(name("x​y"), "x y");     // zero-width space
  for (const bad of ["&", "<", ">", '"', "'", "`", "\\"]) assert.ok(!name(`a${bad}b`).includes(bad));
});

test("name: non-strings and empty input give the empty (default) name", () => {
  for (const v of [undefined, null, 5, {}, [], "", "   ", "\n\t"]) assert.equal(run(`cleanShipName(${JSON.stringify(v)})`), "");
});

test("name: length is capped by width (CJK counts 2) and never splits a character", () => {
  const max = run("FLAG_NAME_UNITS");
  assert.equal(max, 20);
  assert.equal(name("a".repeat(50)), "a".repeat(20));
  assert.equal(name("海".repeat(30)), "海".repeat(10));
  assert.equal(run(`nameUnits(cleanShipName(${JSON.stringify("海a".repeat(30))}))`) <= max, true);
  const emoji = name("🏴‍☠️".repeat(30));
  assert.ok(run(`nameUnits(${JSON.stringify(emoji)})`) <= max);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(emoji));   // no lone surrogate
});

test("rude words: refused whole-word in English, by substring in Chinese, never an innocent name", () => {
  for (const bad of ["Fuck", "you SHIT", "b1tch", "f.u.c.k", "他媽的海盜", "傻逼號", "Nazi Ship"]) assert.equal(run(`shipNameRude(${JSON.stringify(bad)})`), true, bad);
  for (const ok of ["Scunthorpe", "Cockburn", "Shiitake", "Assassin", "Black Pearl", "海狼號", "Dickens", "Classic"]) assert.equal(run(`shipNameRude(${JSON.stringify(ok)})`), false, ok);
  assert.equal(run('goodShipName("Fuck Off")'), "");
  assert.equal(run('goodShipName("Good Ship")'), "Good Ship");
});

test("flag: valid ids kept, anything else falls back to the default per field", () => {
  assert.deepEqual(json('cleanFlag({ main: "red", alt: "gold", emblem: "skull" })'), { main: "red", alt: "gold", emblem: "skull" });
  assert.deepEqual(json('cleanFlag({ main: "pink", alt: 3, emblem: "anchor" })'), { main: "blue", alt: "white", emblem: "anchor" });
  for (const v of [undefined, null, "red", 5, [], {}]) assert.deepEqual(json(`cleanFlag(${JSON.stringify(v)})`), { main: "blue", alt: "white", emblem: "diag" });
  assert.deepEqual(json('cleanFlag({ main: "__proto__", emblem: "constructor" })'), { main: "blue", alt: "white", emblem: "diag" });
});

test("flag: every colour has a hex and every emblem a name; the default is on the lists", () => {
  for (const id of json("FLAG_COLORS")) assert.match(run(`FLAG_HEX.${id}`), /^#[0-9a-f]{6}$/);
  assert.ok(json("FLAG_COLORS").includes(run("DEFAULT_FLAG.main")) && json("FLAG_COLORS").includes(run("DEFAULT_FLAG.alt")) && json("FLAG_EMBLEMS").includes(run("DEFAULT_FLAG.emblem")));
  for (const lang of ["en", "zh"]) {
    for (const id of json("FLAG_COLORS")) assert.ok(run(`STR.${lang}.fc_${id}`), `${lang} fc_${id}`);
    for (const id of json("FLAG_EMBLEMS")) assert.ok(run(`STR.${lang}.fe_${id}`), `${lang} fe_${id}`);
    for (const k of ["flTitle", "flHint", "flName", "flDefName", "flReset", "flRude", "flMain", "flAlt", "flEmblem", "flShip"]) assert.ok(run(`STR.${lang}.${k}`), `${lang} ${k}`);
  }
});

test("old saves: no flag or name loads with the classic blue-and-cream ensign and the default name", () => {
  const s = json('sanitizeSave({ v: 2, gold: 40, ship: "brig" })');
  assert.deepEqual(s.flag, { main: "blue", alt: "white", emblem: "diag" });
  assert.equal(s.shipName, "");
  assert.equal(s.gold, 40);
  assert.equal(run("t('flDefName')"), "Sea Wolf");
});

test("saves: a good flag and name survive loading; junk and rude names are dropped", () => {
  const good = json('sanitizeSave({ v: 2, flag: { main: "black", alt: "gold", emblem: "swords" }, shipName: "Dread Queen" })');
  assert.deepEqual(good.flag, { main: "black", alt: "gold", emblem: "swords" });
  assert.equal(good.shipName, "Dread Queen");
  const junk = json('sanitizeSave({ v: 2, flag: "red", shipName: { x: 1 } })');
  assert.deepEqual(junk.flag, { main: "blue", alt: "white", emblem: "diag" });
  assert.equal(junk.shipName, "");
  assert.equal(json('sanitizeSave({ v: 2, shipName: "<script>alert(1)</script>" })').shipName.includes("<"), false);
  assert.equal(json('sanitizeSave({ v: 2, shipName: "fuck you" })').shipName, "");
  assert.equal(json(`sanitizeSave({ v: 2, shipName: ${JSON.stringify("x".repeat(500))} })`).shipName.length, 20);
});

test("new games start with the default flag and name", () => {
  const d = json("defaultSave()");
  assert.deepEqual(d.flag, { main: "blue", alt: "white", emblem: "diag" });
  assert.equal(d.shipName, "");
});

test("livery: the flag becomes the sea livery, cached by its three ids, other player colours kept", () => {
  assert.equal(run('flagLivery({ main: "red", alt: "gold", emblem: "skull" })'), "pf-red-gold-skull");
  const L = json("LIVERY['pf-red-gold-skull']");
  assert.equal(L.flag, "#b02626"); assert.equal(L.flag2, "#e0b44a"); assert.equal(L.pennant, "#b02626"); assert.equal(L.emblem, "skull");
  assert.equal(L.hull, "#6e3d1f");
  assert.equal(run('flagLivery({ main: "red", alt: "gold", emblem: "skull" }) === flagLivery({ main: "red", alt: "gold", emblem: "skull" })'), true);
  assert.equal(run('flagLivery({ main: "bad" })'), "pf-blue-white-diag");
});
