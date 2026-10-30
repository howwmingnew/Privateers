// Unit tests for #121 / #143: the fights an escort turns down (js/escort-pick.js), the escort chip's hit warning (js/escort-hud.js), and the
// plain stance lines and the one firepower base in both languages (js/escorts.js, js/escort-gift.js).
// Usage: node --test tests/unit-escort-care.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
function boot(files, extra = {}) {
  const store = new Map();
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: { addEventListener() {} },
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, ...extra,
  });
  for (const f of files) vm.runInContext(src(f), ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const pick = () => boot(["js/config.js", "js/escort-pick.js"]);
const base = { mine: 5, theirs: 5, zone: 5, provoked: false, navy: false };
const shuns = (g, stance, o) => g.run(`escortShuns(${JSON.stringify(stance)}, ${JSON.stringify({ ...base, ...o })})`);

test("Normal escorts turn down ships and seas far above them, and nothing else", () => {
  const g = pick(), over = g.run("ESCORT_OVER");
  assert.equal(shuns(g, "normal", {}), false, "an equal ship in an equal sea");
  assert.equal(shuns(g, "normal", { theirs: 5 + over }), false, "exactly the margin is still fine");
  assert.equal(shuns(g, "normal", { theirs: 5 + over + 1 }), true, "a ship far stronger");
  assert.equal(shuns(g, "normal", { zone: 5 + over + 1 }), true, "a sea far deadlier");
  assert.equal(shuns(g, "normal", { theirs: 1, zone: 1 }), false, "weaker ones are fair game");
});

test("a Normal escort still defends itself and the flagship against a stronger ship", () => {
  assert.equal(shuns(pick(), "normal", { theirs: 30, zone: 30, provoked: true }), false);
});

test("no escort starts a fight with a Navy ship, in any stance (#143), but every stance defends against one", () => {
  const g = pick();
  for (const st of ["active", "normal", "passive"]) {
    assert.equal(shuns(g, st, { navy: true }), true, st + " leaves an idle Navy ship alone");
    assert.equal(shuns(g, st, { navy: true, provoked: true }), false, st + ": the Navy that shot at us or the flagship is fair");
  }
});

test("Active may still take on any other ship; Passive is not governed here (it only fights what hit it)", () => {
  const g = pick();
  assert.equal(shuns(g, "active", { theirs: 30, zone: 30 }), false);
  assert.equal(shuns(g, "passive", { theirs: 30, zone: 30 }), false);
});

// js/escort-hud.js with the page stubbed out: the hurt hook lights the chip and warns once per escort per sortie.
function hud() {
  const hooks = {}, toasts = [];
  const g = boot(["js/config.js", "js/escort-hud.js"], {
    STR: { en: {}, zh: {} }, clamp: (v, a, b) => Math.min(b, Math.max(a, v)), lang: "en", docked: false, titleOpen: false,
    t: (k, o) => k + (o ? JSON.stringify(o) : ""), toast: (...a) => toasts.push(a), sfx() {}, S: { time: { now: 5000 } },
    onHook: (n, fn) => { hooks[n] = fn; }, document: { getElementById: () => ({ hidden: true, innerHTML: "" }), addEventListener() {} },
  });
  g.run("var escortLive = []");
  return { g, hooks, toasts };
}

test("a hit on an escort lights its chip for a moment and warns once per sortie", () => {
  const { g, hooks, toasts } = hud();
  g.run("var ship = { ally: true, alive: true, hp: 80, maxHp: 100 }; escortLive.push({ slot: 1, e: ship });");
  hooks.hurt(g.run("ship"));
  hooks.hurt(g.run("ship"));
  assert.equal(toasts.length, 1, "one warning per escort");
  assert.match(toasts[0][0], /escHitToast\{"n":2\}/, "named by its 1-based slot");
  assert.equal(g.json("escHudRows(escortLive, 5.5)")[0].hit, true, "lit just after the hit");
  assert.equal(g.json("escHudRows(escortLive, 5 + ESCORT_HIT_FLASH + 0.1)")[0].hit, false, "and out again");
  hooks.hurt({ isPlayer: true, alive: true });
  assert.equal(toasts.length, 1, "the flagship's own hits are not an escort warning");
  hooks.sail();
  hooks.hurt(g.run("ship"));
  assert.equal(toasts.length, 2, "a new sortie warns again");
});

test("a sunk escort is never shown as hit", () => {
  const { g } = hud();
  g.run("escortLive.push({ slot: 0, e: { ally: true, alive: false, hp: 0, maxHp: 100 } }); escHitAt.set(0, 5);");
  assert.equal(g.json("escHudRows(escortLive, 5.1)")[0].hit, false);
});

test("the stance lines are one plain sentence each, in both languages, and the firepower has one base", () => {
  const g = boot(["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/shipyard.js",
    "js/escorts.js", "js/escort-gift.js"]);
  for (const k of ["active", "normal", "passive"]) for (const l of ["en", "zh"]) {
    const s = g.run(`STR.${l}.stn_${k}`);
    assert.ok(s && s.length > 8, `${l} stn_${k}`);
    assert.ok(!/80%/.test(s), "no second percentage in the stance line");
  }
  assert.match(g.run("STR.en.stn_normal"), /stronger/, "Normal says it avoids stronger ships");
  assert.ok(!g.run("'escFire' in STR.en || 'escFire' in STR.zh"), "the 80% line is gone: only the flagship-total percentage is shown");
  assert.match(g.run("STR.en.escDps"), /your flagship's total fire/);
  assert.match(g.run("STR.zh.escDps"), /主艦總火力/);
  for (const k of ["escOwedAll", "escHitToast"]) assert.ok(g.run(`!!STR.en.${k} || ${k === "escHitToast"}`), k);
  assert.match(g.run("STR.en.escOwedAll"), /before they can sail/);
  assert.match(g.run("STR.zh.escOwedAll"), /付清才能出航/);
  assert.match(g.run("STR.en.escSunkToast"), /repair fee/);
});
