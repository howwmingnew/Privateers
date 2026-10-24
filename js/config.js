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
// Big gun decks (js/gundeck.js, js/combat.js): the most ports on one side, and the gun-bay layout that goes compact from DENSE_PORTS.
// A broadside rolls off gun by gun, ROLL_GAP_MS apart but never longer than ROLL_MAX_MS in all; only about FX_GUNS guns of a
// side get their own muzzle smoke and report; MAX_BALLS caps live shot (the rest of a crowded fight is not drawn).
const AUTOFIRE_HOLD_MS = 250;   // holding Space this long turns on auto-fire (guns whose aim line is red fire as they reload)
const MAX_PORTS = 15, DENSE_PORTS = 7, ROLL_GAP_MS = 70, ROLL_MAX_MS = 520, FX_GUNS = 6, MAX_BALLS = 220;
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
// Edge markers (js/edge-marks.js): off-screen ships, harbor and outpost within EDGE_RANGE screen widths get a box on the screen edge.
const EDGE_RANGE = 1.8;      // screen widths (of the world view) a target may be away and still be marked
const EDGE_M_PER_PX = 0.5;   // metres per world pixel, for the distance on a box
const EDGE_ROUND_M = 10;     // the distance is rounded to this many metres
const EDGE_MAX = 5;          // boxes on screen at once: the bounty, then the most dangerous, then the nearest
const MINI_NEAR_R = 1000;   // px: a ship this close that out-fights you is drawn above the harbor and the rest of the chart's marks
const MINI_MERGE = 5;       // chart units: ordinary ships closer than this on the chart merge into one mark with a count
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

// Collision damage (js/collision.js): speed is the component of the ship's velocity along the line into the island / the
// other hull, in px/s. Below CRASH_MIN_V nothing happens (hugging a coast, mooring); CRASH_FULL_V is a sloop at top speed.
const CRASH_MIN_V = 45, CRASH_FULL_V = 150, CRASH_OVER_MAX = 1.25;   // a faster hull than CRASH_FULL_V hurts up to this many times more
const CRASH_ISLAND_K = 0.15;      // share of max hull lost ramming an island head-on at CRASH_FULL_V
const CRASH_SHIP_K = 0.2;        // ... for the lighter of two equal hulls meeting at CRASH_FULL_V closing speed
const CRASH_TOUCH = 0.015;       // share of max hull any ship-on-ship contact costs, however slow (weighted by hull size like a blow)
const CRASH_MASS_MIN = 0.5, CRASH_MASS_MAX = 1.6;   // the share a hull takes of the blow: 2 * (other mass / total mass), kept in this range
const CRASH_COOLDOWN = 0.8;      // seconds before the same ship may be hurt by the same island / ship again
const CRASH_SPARE = 0.15;        // above this share of max hull a crash never kills (it leaves 1 hp); an AI is never killed by rock
const CRASH_GAP = 0.3;           // a blow needs this long without contact before it: pressing on or scraping along a rock is one blow, not many
const CRASH_SHED = 0.6;          // share of its speed a ship keeps after a ship-on-ship blow
const CRASH_BIG = 0.1;           // a blow this share of max hull or more shakes the screen hard and shows "Crash!"
// AI fleets (js/fleet.js): a lead ship and 1-4 wingmen of one faction that keep formation. [PLACEHOLDER] until playtested.
const FLEET_CHANCE = { shallows: 0.08, reef: 0.18, lanes: 0.22, maelstrom: 0.22 };   // share of new ships that lead a fleet, by sea
const FLEETS_AT_SEA = 4;          // fleets at sea at once
const FLEET_SHIPS = 14;       // ships in fleets at once (of ENEMY_COUNT), so the sea keeps loners
const FLEET_FIRE = 0.8;       // a wingman's effective firepower against the same ship as a lead (owner's call, #36 / #44)
const FLEET_GAP = 88;         // px between formation slots
const FLEET_STRAY = 420;      // a wingman this far from its slot for FLEET_STRAY_T s leaves the fleet and sails alone
const FLEET_STRAY_T = 12;
const FLEET_HDG_LAG = 1.2;   // s: how slowly the formation turns after its lead
const FLEET_STUCK_T = 8, FLEET_STUCK_R = 140;   // a fleet ship that stays inside this circle this long claws off the nearest rock
const FLEET_RAGE_T = 12, FLEET_SCATTER_T = 8;   // after the lead sinks: seconds the wingmen charge or flee
// Wind, weather and the hour of day (js/weather-core.js is the maths, js/weather.js the sea). Every number here is gameplay:
// the same for every player whatever the weather-effects setting says, so a daily sea plays the same everywhere.
const WIND = { tail: 0.20, head: 0.25, full: 0.6 };   // speed gained running before the wind, lost beating into it, at wind strength >= full (a calm gives less)
const WEATHER = {
  seg: [75, 150], blend: 12,                          // a spell of weather lasts seg[0]..seg[1] s and fades into the next over `blend` s
  first: { clear: 0.5, rain: 0.3, storm: 0.2 },       // the opening weather of a sortie
  next: { clear: { clear: 0.55, rain: 0.38, storm: 0.07 }, rain: { clear: 0.35, rain: 0.35, storm: 0.3 }, storm: { clear: 0.1, rain: 0.55, storm: 0.35 } },
  hour: { day: 0.55, dusk: 0.2, night: 0.25 },        // the hour a sortie sails in
  windMin: 0.05, windRain: 0.15, windStorm: 0.35,     // strength 0..1: the wind's own wander, plus what rain and storm add
  knots: [4, 40],                                     // strength 0 .. 1 as the dial's number
  yaw: 0.32, leeway: 26, calmRadius: 230,             // storm: rad/s the hull is slewed beam-on at full gale, px/s pushed downwind, px from a coast inside which neither acts
  ballDrift: 45,                                      // storm: px/s a cannonball is blown downwind
};

// Supply stations and trade ports (js/ports.js): a ring-docked service point on the open sea.
const STATION_TRUCE_R = 280;     // no ship opens fire on the player this close to a station, and idle ships sail out of it
const SUPPLY_FEE_PER_RING = 25;  // gold for a hull from empty to full at a supply station, per level ring it lies in
const SUPPLY_HEAL = 0.4;         // share of max hull a supply station mends per second inside its ring (while gold lasts)
// Ship name and flag (js/flags.js). Name width counts a CJK character as 2, so 10 Chinese or 20 Latin characters fit.
const FLAG_NAME_UNITS = 20;
const FLAG_COLORS = ["red", "blue", "green", "black", "gold", "purple", "teal", "orange", "white", "grey"];   // main and second colour ids
const FLAG_HEX = { red: "#b02626", blue: "#2f8ad6", green: "#3d8b4a", black: "#1a1618", gold: "#e0b44a", purple: "#7a3f98", teal: "#1f9aa0", orange: "#e07b2c", white: "#f4efe2", grey: "#6b6f78" };
const FLAG_EMBLEMS = ["diag", "skull", "anchor", "swords", "star", "cross"];
const DEFAULT_FLAG = { main: "blue", alt: "white", emblem: "diag" };   // what the player's ensign always looked like

// Sea disasters (js/disasters-core.js is the plan and the maths, js/disasters.js the sea). Every figure is gameplay, the same
// for every player whatever the weather-effects setting says. [PLACEHOLDER] until playtested.
// warn: seconds of warning before the strike · ring: the nearest ring it may happen in (the Shallows are rings 1-2, so no
// deadly event there) · p: chance per 10-second slot (scaled by wx, the weight in [clear, rain, storm]) · max: per voyage ·
// dmg / dps / cap: % of the hull max (a hit, per second in the core, and the most one event may take off one ship).
const DISASTER = {
  start: 70, horizon: 1800, slot: 10,   // first event no sooner than this many seconds into the voyage; the plan covers this many seconds
  gap: 90, maxHigh: 2, protect: 8,      // two high-threat events start at least `gap` s apart; at most `maxHigh` a voyage; s of no disaster damage to you after an event
  floor: 0.10,                          // a disaster never takes the player below this share of the hull (enemy guns still can)
  retry: 8, tries: 4,                   // a spot that is not fair (a coast, the harbor, the Shallows): look again after this many seconds, this many times
  tsunami: { high: 1, warn: [12, 18], max: 1, ring: 6, p: 0.0015, wx: [1, 1, 1], dmg: [0.08, 0.15], len: 1500, thick: 110, speed: 260, travel: 2800, push: [90, 300], bowK: 0.28, boost: 0.25, boostT: 4, lead: 6 },
  spout:   { high: 1, warn: [8, 12], max: 1, ring: 4, p: 0.01, wx: [0, 1, 1.5], dps: [0.02, 0.03], cap: 0.18, R: 340, core: 110, pull: 0.5, swirl: 0.45, life: 30, speed: 55, mast: 0.35, mastT: 7, away: [700, 900] },
  vortex:  { high: 1, warn: [6, 10], max: 1, ring: 4, p: 0.004, wx: [1, 1, 1], dps: [0.01, 0.02], cap: 0.15, R: 360, core: 80, pull: 0.5, swirl: 0.5, life: 24, away: [650, 850] },
  rogue:   { high: 1, warn: [4, 6], max: 2, ring: 3, p: 0.01, wx: [0.1, 1, 1.4], dmg: [0.10, 0.18], R: 240, bowK: 0.3, bowAng: 0.6, lostT: 1.6, stableT: 3, stableK: 1.35, push: 140 },
  lightning: { high: 0, warn: [3, 5], max: 2, ring: 4, p: 0.04, wx: [0, 0, 1], dmg: [0.08, 0.12], R: 80, mastT: 7, stunT: 1.5, own: 40, track: 700, lock: 1.2,
    fire: 0.5, fireDps: 0.005 },   // the struck hull either catches fire (chance `fire`, burning fireDps of the hull per second for BURN_T s, js/arsenal.js addBurn) or loses a mast (the rest)
  fog:     { high: 0, warn: [8, 12], max: 1, ring: 1, p: 0.006, wx: [1, 1, 0], dur: [45, 70], sight: 380, fade: 6, react: [0.5, 2] },
  dodge: { aware: 0.85, busy: 0.55, look: 1300, margin: 1.2 },   // an AI notices a hazard it is in the way of with this chance (busy: it has a target), then answers after disReact() s; margin: how far past the radius it sails to be clear
  mastK: 0.8, stunK: 0.4,               // a snapped mast leaves 80% of the speed; a lightning stun 40%
};
