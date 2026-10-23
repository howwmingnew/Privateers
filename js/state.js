"use strict";
// ---------- Game state ----------
let S;                    // the Phaser scene
let harborLabel = null;   // in-world harbor name, re-labelled on language change
let player;
const enemies = [], balls = [], crates = [];
let islands = [];
let cargo = 0, paused = true, canDock = false, docked = false;
let joyVec = { x: 0, y: 0, m: 0 };
let lastHoldToast = 0, hudT = 0, miniT = 0, spawnT = 0, moved = false;

// Fixed map: same islands for every run.
function genIslands() {
  const r = mulberry32(7), out = [];
  let tries = 0;
  while (out.length < 34 && tries++ < 2000) {
    const R = 60 + r() * 130, x = 150 + r() * (W - 300), y = 150 + r() * (H - 300);
    if (Math.hypot(x - PORT.x, y - PORT.y) < SAFE_R + R + 80) continue;
    if (out.some(o => Math.hypot(o.x - x, o.y - y) < o.r + R + 160)) continue;
    const pts = []; const n = 14;
    for (let i = 0; i < n; i++) pts.push(0.82 + r() * 0.28);
    out.push({ x, y, r: R, pts, seed: r() });
  }
  return out;
}
