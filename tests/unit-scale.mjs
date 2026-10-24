// Unit tests for the size sliders (js/config.js, js/settings.js): percentage clamping, the old text / chart size
// settings, the chart's base size from the screen, and its canvas size. Usage: node --test tests/unit-scale.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = ["js/config.js", "js/settings.js"].map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);

// A fresh page load with `stored` already in localStorage under the settings key.
function boot(stored) {
  const store = new Map(stored === undefined ? [] : [["privateers-settings", typeof stored === "string" ? stored : JSON.stringify(stored)]]);
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    matchMedia: () => ({ matches: false }),
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), store };
}

test("a fresh browser starts every size at 100%", () => {
  const g = boot();
  assert.deepEqual([g.run("SETTINGS.uiPct"), g.run("SETTINGS.miniPct"), g.run("SETTINGS.markPct")], [100, 100, 100]);
  assert.equal(g.run("uiScale()"), 1);
});

test("percentages snap to the 5% step and stay inside 50-250", () => {
  const g = boot();
  assert.equal(g.run("scalePct(10)"), 50);
  assert.equal(g.run("scalePct(49)"), 50);
  assert.equal(g.run("scalePct(999)"), 250);
  assert.equal(g.run("scalePct(103)"), 105);
  assert.equal(g.run("scalePct(102)"), 100);
  assert.equal(g.run("scalePct(50)"), 50);
  assert.equal(g.run("scalePct(250)"), 250);
  for (const bad of ["null", "undefined", "'120'", "NaN", "Infinity", "{}"]) assert.equal(g.run(`scalePct(${bad})`), null, bad);
});

test("stored out-of-range or junk values are clamped or reset on load", () => {
  const g = boot({ uiPct: 400, miniPct: 12, markPct: "big" });
  assert.deepEqual([g.run("SETTINGS.uiPct"), g.run("SETTINGS.miniPct"), g.run("SETTINGS.markPct")], [250, 50, 100]);
  assert.equal(boot("not json").run("SETTINGS.miniPct"), 100);
});

test("old text size (1 / 1.15 / 1.3) and chart size (0.8 / 1 / 1.25) become percentages", () => {
  const g = boot({ textScale: 1.15, miniScale: 1.25 });
  assert.equal(g.run("SETTINGS.uiPct"), 115);
  assert.equal(g.run("SETTINGS.miniPct"), 125);
  const h = boot({ textScale: 1.3, miniScale: 0.8 });
  assert.deepEqual([h.run("SETTINGS.uiPct"), h.run("SETTINGS.miniPct")], [130, 80]);
  const odd = boot({ textScale: 7, miniScale: "x" });
  assert.deepEqual([odd.run("SETTINGS.uiPct"), odd.run("SETTINGS.miniPct")], [100, 100]);
});

test("a new percentage wins over the old multiplier it replaces", () => {
  const g = boot({ textScale: 1.3, uiPct: 70, miniScale: 0.8, miniPct: 200 });
  assert.deepEqual([g.run("SETTINGS.uiPct"), g.run("SETTINGS.miniPct")], [70, 200]);
});

test("saveSettings keeps the other stored fields (audio volume, shake)", () => {
  const g = boot({ volume: { master: 0.4 }, shake: false });
  g.run("saveSettings({ markPct: 150 })");
  const saved = JSON.parse(g.store.get("privateers-settings"));
  assert.deepEqual(saved, { volume: { master: 0.4 }, shake: false, markPct: 150 });
});

test("chart base is 18% of the shorter side, between 124 and 420 css px", () => {
  const g = boot();
  const px = (w, h, p = 100) => g.run(`miniSizePx(${w}, ${h}, ${p})`);
  assert.equal(px(1280, 720), 130);      // 0.18 * 720
  assert.equal(px(1920, 1080), 194);
  assert.equal(px(3840, 2160), 389);     // the 4K screen that started this
  assert.equal(px(1920, 1080, 250), 486);
  assert.equal(px(390, 844), 124);       // a phone: the floor
  assert.equal(px(7680, 4320), 420);     // 8K: the ceiling
});

test("the chart never passes 44% of the width or 60% of the height, nor shrinks under 64 px", () => {
  const g = boot();
  const px = (w, h, p) => g.run(`miniSizePx(${w}, ${h}, ${p})`);
  assert.equal(px(390, 844, 250), Math.round(0.44 * 390));   // phone at 250%: about 44vw
  assert.ok(px(390, 844, 100) <= 0.44 * 390);
  assert.equal(px(844, 390, 250), Math.round(0.6 * 390));    // landscape phone: held by the height
  assert.equal(px(300, 800, 50), 64);
});

test("a big UI size leaves room under the chart for the labels on a short screen", () => {
  const g = boot();
  const px = (w, h, p, ts) => g.run(`miniSizePx(${w}, ${h}, ${p}, ${ts})`);
  assert.equal(px(844, 390, 250, 1), Math.round(0.6 * 390));   // at 100% the height cap still rules
  assert.equal(px(844, 390, 250, 2.5), 390 - (30 + 76 * 2.5));
  assert.equal(px(1280, 720, 250, 2.5), px(1280, 720, 250, 0));   // a normal screen is untouched
});

test("chart canvas is css size times the pixel ratio, bounded", () => {
  const g = boot();
  const cv = (c, d) => g.run(`miniCanvasPx(${c}, ${d})`);
  assert.equal(cv(194, 2), 388);
  assert.equal(cv(389, 1), 389);
  assert.equal(cv(972, 2), 1024);
  assert.equal(cv(64, 1), 160);
  assert.equal(cv(130, 0), 160);   // a broken ratio counts as 1
});
