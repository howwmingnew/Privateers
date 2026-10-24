"use strict";
// ---------- Big gun decks: rolling broadsides and what they cost on screen ----------
// A mount may carry up to MAX_PORTS guns (js/config.js). Fired together they would be a wall of balls and smoke, so a
// player's broadside rolls off from the stern forward, ROLL_GAP_MS apart (squeezed so the whole side is done inside ROLL_MAX_MS),
// and only every `step`-th gun draws its own muzzle plume and report: the rest add their ball but no particles or sound.
Object.assign(STR.en, { gunK: " · each gun hits at <b>×{k}</b> (more of them)" });
Object.assign(STR.zh, { gunK: " · 每門砲傷害 <b>×{k}</b>（但砲更多）" });
// Pure functions: js/combat.js (player) and js/volley.js (enemy) call them, tests/unit-gundeck.mjs checks them.
function rollGap(n) { return n > 1 ? Math.min(ROLL_GAP_MS, ROLL_MAX_MS / (n - 1)) : 0; }
// Guns 0..n-1 of one mount: { i, delay (ms after the trigger), loud (own plume and report) }.
function rollPlan(n) {
  const gap = rollGap(n), step = Math.max(1, Math.ceil(n / FX_GUNS));
  return Array.from({ length: n }, (_, i) => ({ i, delay: Math.round(i * gap), loud: i % step === 0 }));
}
// Does a new ball fit? Past MAX_BALLS a shot still lands its fire and sound but is not added.
const ballRoom = () => balls.length < MAX_BALLS;
// The gun bay draws a mount compactly (short labels, tight rows) from DENSE_PORTS ports on.
const denseDeck = ship => Math.max(...MOUNTS.map(m => SHIPS[ship].slots[m.key])) >= DENSE_PORTS;
