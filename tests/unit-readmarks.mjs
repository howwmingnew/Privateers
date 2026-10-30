// Unit tests for #119 (combat readability): edge boxes clear of level plates, the shooter's box ranks first, the Navy aim warning,
// the bow chevron and the plate rim strength. Pure functions only, loaded into one node:vm context.
// Usage: node --test tests/unit-readmarks.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const dom = new Proxy(function () {}, { get: (_, k) => (k === "length" ? 0 : dom), apply: () => dom, construct: () => dom, set: () => true });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { language: "en-US" },
  document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }), console, onHook() {},
});
for (const f of ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/edge-math.js", "js/read-marks.js"]) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx), json = code => JSON.parse(run(`JSON.stringify(${code})`));

test("plateSpans: only plates that reach into the box's band block the edge", () => {
  const plates = [{ l: 100, r: 180, t: 6, b: 24 }, { l: 300, r: 380, t: 200, b: 218 }];
  // a top box centred 20 px down, 30 px thick: its band is y 5..35 (+pad), so only the first plate
  assert.deepEqual(json(`plateSpans(${JSON.stringify(plates)}, "top", 20, 30)`), [[97, 183]]);
  assert.deepEqual(json(`plateSpans(${JSON.stringify(plates)}, "top", 400, 30)`), [], "a box far from every plate");
  // a left box centred 340 px in: the second plate (x 300..380) is inside the band, and blocks along y
  assert.deepEqual(json(`plateSpans(${JSON.stringify(plates)}, "left", 340, 60)`), [[197, 221]]);
});

test("plateSpans + dodgeAlong: a box that would sit on a plate slides clear of it", () => {
  const spans = json(`plateSpans([{ l: 180, r: 260, t: 10, b: 28 }], "top", 22, 30)`);
  const p = run(`dodgeAlong(220, 40, ${JSON.stringify(spans)}, 0, 800)`);
  assert.ok(p + 40 <= spans[0][0] || p - 40 >= spans[0][1], "the box [" + (p - 40) + ", " + (p + 40) + "] clears " + spans[0]);
});

test("edgeRank: a shooter that just hit you outranks the bounty, nearer shooter first", () => {
  assert.ok(run(`edgeRank({ kind: "ship", d: 0, px: 900, atk: true })`) > run(`edgeRank({ kind: "ship", boss: true, d: 3, px: 100 })`));
  assert.ok(run(`edgeRank({ kind: "ship", d: 0, px: 300, atk: true })`) > run(`edgeRank({ kind: "ship", d: 0, px: 900, atk: true })`));
  assert.equal(run(`edgePick([{ kind: "ship", d: 0, px: 800, atk: true }, { kind: "ship", boss: true, d: 3, px: 100 }], 1)[0].atk`), true);
});

test("navyAim: only a Navy ship that is not an escort, and only while heat is in play", () => {
  run("var heatOn = () => true");
  assert.equal(run(`navyAim({ faction: "navy" })`), true);
  assert.equal(run(`navyAim({ faction: "navy", ally: true })`), false, "an escort is never aimed at");
  assert.equal(run(`navyAim({ faction: "pirate" })`), false);
  assert.equal(run(`navyAim({ faction: "merchant" })`), false);
  assert.equal(run(`navyAim(null)`), false);
  run("heatOn = () => false");
  assert.equal(run(`navyAim({ faction: "navy" })`), false, "the tutorial / first voyage: no heat, no warning");
  assert.notEqual(run("NAVY_AIM"), run("AIM_RED"), "the warning is not the hit colour");
});

test("bowChevron: the tip leads the bow by gap along the heading, the wings sit behind it, symmetric about the keel", () => {
  for (const rot of [0, Math.PI / 2, 2.3, -1]) {
    const [tip, a, b] = json(`bowChevron(100, 200, ${rot}, 60, 8, 10)`), c = Math.cos(rot), s = Math.sin(rot);
    const along = p => (p[0] - 100) * c + (p[1] - 200) * s, side = p => -(p[0] - 100) * s + (p[1] - 200) * c;
    assert.ok(along(tip) > 30 + 8 - 1e-9 && Math.abs(side(tip)) < 1e-9, "tip on the keel line, past the bow");
    assert.ok(along(a) < along(tip) && along(b) < along(tip), "wings behind the tip");
    assert.ok(Math.abs(side(a) + side(b)) < 1e-9 && Math.abs(along(a) - along(b)) < 1e-9, "mirror images");
  }
});

test("rimAlpha: stronger at night and in rain, never above 1", () => {
  const day = run("rimAlpha(0, false)"), night = run("rimAlpha(1, false)"), rain = run("rimAlpha(0, true)");
  assert.ok(night > day && rain > day);
  assert.ok(run("rimAlpha(1, true)") <= 1);
});
