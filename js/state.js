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

// The islands are rolled per game from save.seed: genIslands() in js/world-seas.js.
