// Unit tests for phase 1 logic (out-of-combat repair, powder-magazine crits, first-voyage ambush): pure functions only,
// the scripts load into one node:vm context, as in tests/unit.mjs. Usage: node --test tests/unit-phase1.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/repair.js", "js/powder.js", "js/ambush.js", "js/postcard.js", "js/photo.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);

// Any property, call or assignment on a stand-in DOM object is accepted: photo.js builds its bar at load time.
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
// A fresh page load. `extra` = more globals the scripts may touch at load time.
function boot(extra = {}) {
  const store = new Map();
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
    console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, ...extra,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test("repair: a hull below full always mends 1% of max a second, with no wait", () => {
  const g = boot();
  assert.equal(g.run("typeof REPAIR_DELAY"), "undefined");
  assert.equal(g.run("repairStep(50, 100, 1, false)"), 51);
  assert.equal(g.run("repairStep(50, 100, 0.016, false)"), 50 + 0.016);
});

test("repair: a stopped ship mends 3% a second", () => {
  const g = boot();
  assert.equal(g.run("repairStep(50, 100, 1, true)"), 53);
});

test("repair: a hull at full stays full, and mending never overshoots", () => {
  const g = boot();
  assert.equal(g.run("repairStep(100, 100, 1, false)"), 100);
  assert.equal(g.run("repairStep(99.8, 100, 1, true)"), 100);
});

test("repair: empty to full takes about 100 s under way and 33 s stopped", () => {
  const g = boot();
  const t = still => g.run(`(() => { let hp = 0, n = 0; while (hp < 100 && n < 1e5) { hp = repairStep(hp, 100, 0.05, ${still}); n++; } return n * 0.05; })()`);
  assert.ok(t(false) > 99 && t(false) < 101.5, `under way took ${t(false)} s`);
  assert.ok(t(true) > 33 && t(true) < 34.5, `stopped took ${t(true)} s`);
});

// ---------- powder-magazine crits ----------
const trig = (o, roll) => ({ rake: true, byPlayer: true, fixed: false, tutorial: false, roll, ...o });

test("powder: only a rake from the player, outside the tutorial, on a roll under 1 in 12", () => {
  const g = boot();
  const t = o => g.run(`powderTrigger(${JSON.stringify(trig(o, o.roll ?? 0.01))})`);
  assert.equal(t({}), true);
  assert.equal(t({ roll: 0.09 }), false, "1/12 is 0.0833");
  assert.equal(t({ rake: false }), false);
  assert.equal(t({ byPlayer: false }), false);
  assert.equal(t({ tutorial: true }), false, "never during the tutorial");
  assert.equal(t({ fixed: true }), false, "shore batteries do not blow up");
});

test("powder: about 1 rake in 12 blows the magazine over many rolls", () => {
  const g = boot();
  const n = g.run(`(() => { let k = 0; for (let i = 0; i < 120000; i++) if (powderTrigger({ rake: true, byPlayer: true, fixed: false, tutorial: false, roll: (i * 0.6180339887) % 1 })) k++; return k / 120000; })()`);
  assert.ok(Math.abs(n - 1 / 12) < 0.003, `rate ${n}`);
});

test("powder: an ordinary ship is finished, a boss is hurt hard but never killed", () => {
  const g = boot();
  assert.equal(g.run("powderSelfDmg({ hp: 80, maxHp: 100 }, 10)"), 80);
  assert.equal(g.run("powderSelfDmg({ boss: 'x', hp: 300, maxHp: 1000 }, 10)"), 250, "25% of max hull");
  assert.equal(g.run("powderSelfDmg({ boss: 'x', hp: 100, maxHp: 1000 }, 10)"), 99, "a wounded boss is left on 1 hp");
});

test("powder: the blast fades with distance, and never kills the player or a boss", () => {
  const g = boot();
  assert.equal(g.run("powderSplash({ maxHp: 100, hp: 100 }, 0)"), 30);
  assert.ok(Math.abs(g.run("powderSplash({ maxHp: 100, hp: 100 }, POWDER_R)") - 12) < 1e-9, "40% at the rim");
  assert.equal(g.run("powderSplash({ isPlayer: true, maxHp: 100, hp: 100 }, 0)"), 15, "the player is hurt");
  assert.equal(g.run("powderSplash({ isPlayer: true, maxHp: 100, hp: 5 }, 0)"), 4, "but left alive");
  assert.equal(g.run("powderSplash({ boss: 'x', maxHp: 1000, hp: 30 }, 0)"), 29);
});

// ---------- first-voyage ambush ----------
const open = { done: false, sunk: 1, t: 45, calm: false, banner: false, engaged: false, hp: 1, safe: false };
const ready = o => boot().run(`ambushReady(${JSON.stringify({ ...open, ...o })})`);

test("ambush: comes once, 45 s after the first sinking, and only when the floor is clear", () => {
  assert.equal(ready({}), true);
  assert.equal(ready({ t: 44.9 }), false, "not before AMBUSH_DELAY");
  assert.equal(ready({ sunk: 0 }), false, "the clock starts at the first sinking");
  assert.equal(ready({ done: true }), false, "once in a lifetime");
  assert.equal(ready({ calm: true }), false, "the tutorial's opening is still on");
  assert.equal(ready({ banner: true }), false, "a boss card / sea banner is up or waiting");
  assert.equal(ready({ engaged: true }), false, "still fighting the tutorial merchant (or anything else)");
  assert.equal(ready({ hp: 0.59 }), false, "a hurt captain is given time to mend");
  assert.equal(ready({ safe: true }), false, "never in the safe waters");
});

test("ambush: the pirates start on the island's far side, a shore's width apart", () => {
  const g = boot();
  const isl = { x: 1000, y: 1000, r: 100 }, from = { x: 400, y: 1000 };
  const a = g.json(`ambushSpot(${JSON.stringify(isl)}, ${JSON.stringify(from)}, -1)`), b = g.json(`ambushSpot(${JSON.stringify(isl)}, ${JSON.stringify(from)}, 1)`);
  assert.ok(a.x > 1000 + 100 && b.x > 1000 + 100, "beyond the island as seen from the player");
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 100 && Math.abs(a.y - b.y) < 160, "side by side");
});

test("ambush: the flag is in new saves; old saves that already sank a ship never get it", () => {
  const g = boot();
  assert.equal(g.run("defaultSave().ambushDone"), false);
  assert.equal(g.run("sanitizeSave({ v: 2, sunk: 0 }).ambushDone"), false, "no sinking yet: the first voyage is still ahead");
  assert.equal(g.run("sanitizeSave({ v: 2, sunk: 7 }).ambushDone"), true);
  assert.equal(g.run("sanitizeSave({ v: 2, sunk: 7, ambushDone: false }).ambushDone"), false, "a stored flag wins");
  assert.equal(g.run("sanitizeSave({ v: 2, ambushDone: 'yes' }).ambushDone"), false, "junk is not a flag");
});

// ---------- photo mode and postcards ----------
test("photo: the zoom factor stays between 0.6 and 2.2, a step at a time", () => {
  const g = boot();
  assert.equal(g.run("PHOTO_ZOOM.min"), 0.6); assert.equal(g.run("PHOTO_ZOOM.max"), 2.2);
  assert.equal(g.run("photoClamp(9)"), 2.2); assert.equal(g.run("photoClamp(0.1)"), 0.6); assert.equal(g.run("photoClamp(1)"), 1);
  assert.equal(g.run("(() => { let f = 1; for (let i = 0; i < 50; i++) f = photoStep(f, 1); return f; })()"), 2.2);
  assert.equal(g.run("(() => { let f = 1; for (let i = 0; i < 50; i++) f = photoStep(f, -1); return f; })()"), 0.6);
  assert.ok(g.run("photoStep(1, 1)") > 1 && g.run("photoStep(1, -1)") < 1);
});

test("postcard: the file name carries the local time, zero padded", () => {
  const g = boot();
  assert.equal(g.run("postcardName(new Date(2026, 0, 5, 3, 4, 9))"), "privateers-20260105-030409.png");
  assert.equal(g.run("postcardName(new Date(2026, 11, 31, 23, 59, 59))"), "privateers-20261231-235959.png");
});

test("postcard: the wordmark sits in the bottom-right corner at a readable size on any canvas", () => {
  const g = boot();
  for (const [w, h] of [[390, 844], [844, 390], [1280, 720], [2560, 1440], [3840, 2160]]) {
    const L = g.json(`postcardMarkLayout(${w}, ${h})`);
    assert.ok(L.size >= 14 && L.size <= 56, `size ${L.size} at ${w}`);
    assert.ok(L.x < w && L.x > w * 0.9 && L.y < h && L.y > h - L.size * 3, `corner at ${w}x${h}`);
  }
  assert.equal(g.run("POSTCARD_MARK"), "Privateers · howwmingnew.github.io/Privateers");
});

test("postcard and photo strings exist in both languages", () => {
  const g = boot();
  for (const k of ["pc_save", "pc_saved", "pc_fail", "p_photo", "p_exit", "p_zin", "p_zout", "p_hintDesk", "p_hintTouch", "fPowder", "ambushToast"]) {
    assert.ok(g.run(`STR.en.${k}`) && g.run(`STR.zh.${k}`), k);
  }
});

test("og.png is a 1200x630 PNG small enough for every crawler", () => {
  const png = readFileSync(new URL("../og.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length < 2_000_000, `${png.length} bytes`);
});
