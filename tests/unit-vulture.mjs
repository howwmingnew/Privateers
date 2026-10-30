// Unit test for the hidden "Vulture" achievement's trigger (js/achievements.js, #125): only a ship sunk by another ship's guns
// leaves a vulture's crate, never one the flagship, its escort or nobody (killer null) sank.
// Usage: node --test tests/unit-vulture.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../js/achievements.js", import.meta.url), "utf8");
const line = src.split("\n").find(l => l.startsWith("const vultureKill"));
assert.ok(line, "vultureKill is defined in js/achievements.js");
const vultureKill = vm.runInContext("(" + line.replace("const vultureKill =", "").replace(/;\s*$/, "") + ")", vm.createContext({}));
const me = { isPlayer: true }, pirate = { faction: "pirate" }, navy = { faction: "navy" };

test("vulture: someone else's kill counts", () => {
  assert.equal(vultureKill(pirate, me), true);
  assert.equal(vultureKill(navy, me), true);
});
test("vulture: the player's own kill, an escort's kill, or no killer does not", () => {
  assert.equal(vultureKill(me, me), false);
  assert.equal(vultureKill({ isPlayer: true }, me), false);
  assert.equal(vultureKill({ ally: true }, me), false);
  assert.equal(vultureKill(null, me), false);
  assert.equal(vultureKill(undefined, me), false);
});
test("the pickup hook still requires the flag and a non-empty take", () => {
  assert.match(src, /c\.vulture && taken > 0/);
});
