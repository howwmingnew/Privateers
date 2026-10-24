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
const REPAIR_RATE = 0.01;        // share of max hull mended per second at sea, always (100 s from empty to full; js/repair.js)
const REPAIR_RATE_STILL = 0.03;  // ... while the ship lies stopped (about 33 s from empty to full)
const REPAIR_STILL = 0.08;       // "stopped": below this share of top speed (the same as the harbor ring's, js/mooring.js)
// Powder-magazine crits (js/powder.js): a rake (along the hull) from the player's guns blows the magazine, 1 in POWDER_CHANCE.
const POWDER_CHANCE = 1 / 12, POWDER_R = 230;   // blast radius, px
const POWDER_BOSS_FRAC = 0.25;     // a boss takes this share of its max hull and never dies of the crit itself
const POWDER_SPLASH = { ai: 0.3, player: 0.15, boss: 0.08 };   // share of max hull at the centre of the blast; fades to 40% at the rim
// Size sliders in the settings panel (js/settings.js, js/options.js): percentages of a base, 50-250 in steps of 5.
const SCALE_MIN = 50, SCALE_MAX = 250, SCALE_STEP = 5, SCALE_DEFAULT = 100;
// The chart (the HUD radar) at 100%: 18% of the shorter screen side, kept between these CSS pixels so a phone still has
// a readable one and a 4K screen does not get a poster. It never takes more than 44% of the width or 60% of the height.
const MINI_BASE_FRAC = 0.18, MINI_BASE_MIN = 124, MINI_BASE_MAX = 420, MINI_MIN_PX = 64, MINI_MAX_VW = 0.44, MINI_MAX_VH = 0.6;
const MINI_HUD_FIXED = 30, MINI_HUD_PER_TS = 76;   // screen px the chart's column needs besides the chart: a fixed part and one that grows with the UI size
const MINI_CANVAS_MIN = 160, MINI_CANVAS_MAX = 1024;   // the chart's drawing size in device pixels
const MINI_UNIT_MIN = 0.35;   // a chart unit never draws smaller than this many CSS px, so the marks stay readable at 50% icon size on a small chart

// Sharing (js/sharecard.js) and the daily sea (js/daily.js, js/run.js). [PLACEHOLDER] loadout until playtested.
const FLEET_MAX = 12;   // ships the yard keeps for one captain, the one you sail included (js/shipyard.js)
const SHARE_URL = "https://howwmingnew.github.io/Privateers/";
const DAILY_EPOCH = Date.UTC(2026, 9, 24);   // daily #1: 2026-10-24, UTC, so every device agrees on the day
const DAILY_SECONDS = 300;                   // a daily run lasts five minutes
// Difficulty by UTC weekday, Monday (1) easiest to Sunday (7) hardest: the captain's hull and speed times these. [PLACEHOLDER]
const DAILY_TIERS = [{ hp: 0.7, speed: 0.9 }, { hp: 0.85, speed: 0.95 }, { hp: 1, speed: 1 }, { hp: 1.15, speed: 1.03 },
  { hp: 1.3, speed: 1.06 }, { hp: 1.5, speed: 1.1 }, { hp: 1.75, speed: 1.15 }];
const DAILY_LEVEL = 5;                       // the daily captain's ring (the Reef Straits)
// The same ship and guns for everyone: a brig with a long 12 on the bow and a carronade between two 6-pounders each side.
const DAILY_LOADOUT = { ship: "brig", hull: 3, sails: 2, hold: 1, gunLv: 3,
  bow: ["long12"], left: ["six", "carronade", "six"], right: ["six", "carronade", "six"] };
const REMATCH_PCT = 0.25;                     // a rematch sinking pays this share of the bounty's Captain's Chest (js/rematch.js)
const REMATCH_MAX = 2;                        // beaten captains that sail again at once; the farthest lairs first
const CHAIN_GAP = 20;                        // seconds between sinkings that still count as one kill chain (js/hall.js)
// AI fleets (js/fleet.js): a lead ship and 1-4 wingmen of one faction that keep formation. [PLACEHOLDER] until playtested.
const FLEET_CHANCE = { shallows: 0.08, reef: 0.18, lanes: 0.22, maelstrom: 0.22 };   // share of new ships that lead a fleet, by sea
const FLEET_MAX = 4;          // fleets at sea at once
const FLEET_SHIPS = 14;       // ships in fleets at once (of ENEMY_COUNT), so the sea keeps loners
const FLEET_FIRE = 0.8;       // a wingman's effective firepower against the same ship as a lead (owner's call, #36 / #44)
const FLEET_GAP = 88;         // px between formation slots
const FLEET_STRAY = 420;      // a wingman this far from its slot for FLEET_STRAY_T s leaves the fleet and sails alone
const FLEET_STRAY_T = 12;
const FLEET_HDG_LAG = 1.2;   // s: how slowly the formation turns after its lead
const FLEET_STUCK_T = 8, FLEET_STUCK_R = 140;   // a fleet ship that stays inside this circle this long claws off the nearest rock
const FLEET_RAGE_T = 12, FLEET_SCATTER_T = 8;   // after the lead sinks: seconds the wingmen charge or flee
