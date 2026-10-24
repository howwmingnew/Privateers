"use strict";
// ---------- Hooks: a tiny event hub, so feature modules listen in without rewriting the core loop ----------
// Core files call runHook(name, ...args); campaign, stats and achievements subscribe with onHook(name, fn).
//   ready ()                     the scene exists (after the first dock)
//   frame (dt)                   every frame, paused or not (Phaser postupdate)
//   sail ()                      after the sea has been reset for a new sortie
//   dock (kind, cargo)           at the start of dock(), before the hold is sold
//   renderPort ()                after the harbor ledger has been re-rendered
//   hurt (ship, dmg, src)        after damage lands, before a possible sink
//   sunk (ship, killer, crate)   after a ship goes down (crate = its loot, if any)
//   pickup (crate, taken)        cargo scooped from a crate or wreck
//   sale (gold, kind)            the hold sold, in the ring or at the ledger (js/plunder.js sellHold)
//   lang ()                      after the language changed
//   mini (ctx, k, u)             drawing the minimap: k = px per world px, u = size relative to the old 224-px chart
const HOOKS = {};
function onHook(name, fn) { (HOOKS[name] ||= []).push(fn); }
function runHook(name, ...args) {
  for (const fn of HOOKS[name] || []) {
    try { fn(...args); } catch (e) { console.error(`hook "${name}" failed:`, e); }
  }
}
onHook("ready", () => S.events.on("postupdate", (time, delta) => runHook("frame", Math.min(delta / 1000, 0.1))));
// Sound is optional: every campaign cue goes through here, so a missing audio module never breaks play.
function sfx(name, opts) { if (typeof Snd !== "undefined") Snd.play(name, opts); }
