"use strict";
// ---------- World constants ----------
const W = 5000, H = 5000;
const PORT = { x: 2500, y: 2500 };
const PORT_ISLAND_R = 95;   // the harbor island itself (solid)
const DOCK_R = 185;         // sail inside this ring to dock
const SAFE_R = 620;         // enemies will not enter, and do not shoot inside 0.6 of it
const ENEMY_COUNT = 26;
const BALL_SPEED = 480;
const ARC = 0.62;           // half-angle (rad) of each broadside firing arc
const ZONE_STEP = 420;      // every this many px from the harbor, enemy level +1
const AIM_FULL_L = 8;       // enemy gunners get more accurate with level, up to this level
