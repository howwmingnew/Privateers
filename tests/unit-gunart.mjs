// Unit tests for the gun art's pure parts (js/gun-art.js): the signature of a mount's ports, the gun table, and the layout of each gun's
// muzzle on every hull, which must agree with where the shots really leave (applyShipArt's s.mounts in js/art.js, muzzle() in js/combat.js).
// Usage: node --test tests/unit-gunart.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/data.js", "js/art.js", "js/gun-art.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
function boot() {
  const ctx = vm.createContext({
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    navigator: { language: "en-US" }, document: { addEventListener() {} }, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
    onHook() {},   // js/hooks.js: not loaded, the ready / frame hooks are browser-only
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const g = boot();

test("every gun in GUNS has a top view, a one-letter code of its own, and a size that fits its barrel in", () => {
  const ids = g.json("Object.keys(GUNS)"), look = g.json("Object.keys(GUN_LOOK)"), code = g.json("GUN_CODE");
  assert.deepEqual([...look].sort(), [...ids].sort());
  assert.deepEqual(Object.keys(code).sort(), [...ids].sort());
  assert.equal(new Set(Object.values(code)).size, ids.length, "codes are unique");
  assert.ok(!Object.values(code).includes("-"), "'-' is the empty port");
  const lens = g.json("Object.values(GUN_LOOK).map(l => l.len + 'x' + l.w)");
  assert.equal(new Set(lens).size, ids.length, "each gun has its own length and width, so they differ by shape and not only by colour");
});

test("gunSig: a letter per port, '-' for an empty one, 's' for an unknown type", () => {
  assert.equal(g.run(`gunSig(["six", "long12", null, "carronade", "chain", "fire"])`), "sl-ckf");
  assert.equal(g.run(`gunSig([])`), "");
  assert.equal(g.run(`gunSig(["mortar", null])`), "s-");
  assert.notEqual(g.run(`gunSig(["six", "fire"])`), g.run(`gunSig(["fire", "six"])`), "order matters: the picture does");
});

test("layout: broadside guns sit where the shots leave (same spacing as s.mounts), outside the planking, pointing out", () => {
  for (const an of g.json("Object.keys(SHIP_ART)")) {
    const a = g.json(`SHIP_ART.${an}`);
    for (const n of [1, 2, 3, 7, 12, 15]) {
      const span = a.len * 0.48, L = g.json(`gunLayout("${an}", "left", ${n})`), R = g.json(`gunLayout("${an}", "right", ${n})`);
      assert.equal(L.length, n);
      L.forEach((p, i) => {
        const x = n === 1 ? 0 : -span / 2 + span * i / (n - 1);
        assert.ok(Math.abs(p.x - x) < 1e-9, `${an} n=${n} gun ${i} x`);
        assert.ok(p.y < -a.beam / 2 * 0.5, "larboard is -y, at the rail");
        assert.ok(Math.abs(R[i].y + p.y) < 1e-9 && R[i].x === p.x, "starboard mirrors larboard");
        assert.ok(Math.abs(p.ang + Math.PI / 2) < 1e-9 && Math.abs(R[i].ang - Math.PI / 2) < 1e-9, "muzzles point out");
        assert.ok(Math.abs(p.x) < a.len / 2, "inside the length of the hull");
      });
    }
  }
});

test("layout: bow guns stay on the hull and point ahead, stern guns on the transom point aft", () => {
  for (const an of g.json("Object.keys(SHIP_ART)")) {
    const a = g.json(`SHIP_ART.${an}`);
    for (const n of [1, 2, 3]) {
      const span = a.beam * 0.36;
      g.json(`gunLayout("${an}", "bow", ${n})`).forEach((p, i) => {
        assert.ok(Math.abs(p.y - (n === 1 ? 0 : -span / 2 + span * i / (n - 1))) < 1e-9, `${an} bow y`);
        assert.ok(p.x > 0 && p.x <= a.len / 2 + 1, `${an} bow gun ${i} x=${p.x} on the forecastle`);
        assert.equal(p.ang, 0);
      });
      g.json(`gunLayout("${an}", "stern", ${n})`).forEach(p => { assert.ok(p.x < -a.len / 2 + 0.5); assert.equal(p.ang, Math.PI); });
    }
  }
});

test("layout: on every real deck (each ship's slots, the man-of-war's ten, a line of battle filled to MAX_PORTS) a squeezed gun fits its pitch", () => {
  const decks = g.json("Object.entries(SHIPS).map(([id, sh]) => [id, sh.slots.left])").concat([["manowar", 10], ["line", g.run("MAX_PORTS")]]);
  for (const [an, n] of decks) for (const id of g.json("Object.keys(GUNS)")) {
    const p = g.json(`gunLayout("${an}", "left", ${n})`)[0], w = g.json(`GUN_LOOK.${id}.w`), sc = Math.min(1, Math.max(0.6, p.pitch / (w * 1.3)));
    assert.ok(w * sc <= p.pitch * 0.97 || n === 1, `${an} ${n} ${id}: width ${(w * sc).toFixed(2)} vs pitch ${p.pitch.toFixed(2)}`);
  }
});

test("layout is cached per hull, mount and count (the same array comes back)", () => {
  assert.equal(g.run(`gunLayout("line", "left", 12) === gunLayout("line", "left", 12)`), true);
  assert.equal(g.run(`gunLayout("line", "left", 12) === gunLayout("line", "left", 11)`), false);
});
