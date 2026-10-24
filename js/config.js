"use strict";
// ---------- World constants ----------
const W = 8000, H = 8000;
const PORT = { x: 4000, y: 4000 };
const PORT_ISLAND_R = 95;   // the harbor island itself (solid)
const DOCK_R = 185;         // sail inside this ring to dock
const SAFE_R = 620;         // enemies will not enter, and do not shoot inside 0.6 of it
const ENEMY_COUNT = 30;     // ordinary ships at sea, shared out by ring quota (bosses and escorts come on top)
const BALL_SPEED = 480;
const ARC = 0.62;           // half-angle (rad) of each broadside firing arc
const ZONE_STEP = 320;      // every this many px from the harbor, enemy level +1: the axis edge reaches Lv 10
const MAX_RING = 10;        // the outermost level ring; the corners past it belong to it too
const AIM_FULL_L = 8;       // enemy gunners get more accurate with level, up to this level
const REPAIR_DELAY = 3;     // seconds without a hit before the hull starts to mend at sea (js/repair.js)
const REPAIR_RATE = 0.01;   // share of max hull mended per second after that (100 s from empty to full)
// Powder-magazine crits (js/powder.js): a rake (along the hull) from the player's guns blows the magazine, 1 in POWDER_CHANCE.
const POWDER_CHANCE = 1 / 12, POWDER_R = 230;   // blast radius, px
const POWDER_BOSS_FRAC = 0.25;     // a boss takes this share of its max hull and never dies of the crit itself
const POWDER_SPLASH = { ai: 0.3, player: 0.15, boss: 0.08 };   // share of max hull at the centre of the blast; fades to 40% at the rim

// Sharing (js/sharecard.js) and the daily sea (js/daily.js, js/run.js). [PLACEHOLDER] loadout until playtested.
const SHARE_URL = "https://howwmingnew.github.io/Privateers/";
const DAILY_EPOCH = Date.UTC(2026, 9, 24);   // daily #1: 2026-10-24, UTC, so every device agrees on the day
const DAILY_SECONDS = 300;                   // a daily run lasts five minutes
const DAILY_LEVEL = 5;                       // the daily captain's ring (the Reef Straits)
// The same ship and guns for everyone: a brig with a long 12 on the bow and a carronade between two 6-pounders each side.
const DAILY_LOADOUT = { ship: "brig", hull: 3, sails: 2, hold: 1, gunLv: 3,
  bow: ["long12"], left: ["six", "carronade", "six"], right: ["six", "carronade", "six"] };
const CHAIN_GAP = 20;                        // seconds between sinkings that still count as one kill chain (js/hall.js)
