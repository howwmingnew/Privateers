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
// Gun art (js/gun-art.js): a mount's layer kicks back GUN_RECOIL_PX px per shot and settles at GUN_RECOIL_DECAY per s; a muzzle flash lasts
// GUN_FLASH_S s (at most GUN_FLASH_MAX at once); GUN_TEX_CAP baked gun-layer textures are kept (the ones no ship shows go first).
const GUN_RECOIL_PX = 2.4, GUN_RECOIL_DECAY = 7, GUN_FLASH_S = 0.09, GUN_FLASH_MAX = 36, GUN_TEX_CAP = 64;
const MAX_PORTS = 15, DENSE_PORTS = 7, ROLL_GAP_MS = 70, ROLL_MAX_MS = 520, FX_GUNS = 6, MAX_BALLS = 220;
const AIM_FULL_L = 8;       // enemy gunners get more accurate with level, up to this level
const REPAIR_RATE = 0.01;        // share of max hull mended per second at sea, always (100 s from empty to full; js/repair.js)
const REPAIR_RATE_STILL = 0.03;  // ... while the ship lies stopped (about 33 s from empty to full)
const REPAIR_STILL = 0.08;       // "stopped": below this share of top speed (the same as the harbor ring's, js/mooring.js)
// Powder-magazine crits (js/powder.js): a rake (along the hull) from the player's guns blows the magazine, 1 in POWDER_CHANCE.
const POWDER_CHANCE = 1 / 12, POWDER_R = 230;   // blast radius, px
const POWDER_BOSS_FRAC = 0.25;     // a boss takes this share of its max hull and never dies of the crit itself
const POWDER_SPLASH = { ai: 0.3, player: 0.15, boss: 0.08 };   // share of max hull at the centre of the blast; fades to 40% at the rim
// VFX upgrade (#76): the effects the owner picked in tools/vfx-lab.html, with the sliders' values (size, count = particle share, dur = duration x).
// blast: powder-magazine C chain blast · muzzle: C powder smoke and haze bank · fire: A flame tongues + smoke column (and the fire patch an incendiary
// leaves on the water) · spout: A spiral column · vortex: A funnel · wave: A foam wall · storm: B pre-flash strike with violet ball, and swirling fog.
const VFX_NEW = {
  blast: { size: 0.8, count: 1, dur: 0.5 }, muzzle: { size: 0.8, count: 0.75, dur: 1.2 }, fire: { size: 1, count: 1, dur: 1 },
  spout: { size: 1, count: 1, dur: 1 }, vortex: { size: 1, count: 1, dur: 1 }, wave: { size: 1, count: 1, dur: 1 }, storm: { size: 1, count: 1, dur: 1 },
};
const VFX_POOL_MAX = 240;      // live sprites of the new effects, all kinds together (x0.55 on phones)
const VFX_MUZZLE_LOUD = 5;     // loud muzzle plumes per 300 ms; past this a shot only gets a small puff (30-gun rolling broadsides, fleets firing together)
const VFX_HAZE_MAX = 16;       // the long drifting haze puffs alive at once
const VFX_SPILL_MAX = 4;       // fire patches on the water at once (an incendiary's burning oil)
const VFX_FOG_PUFFS = 6;      // (at the high level)
// Effects quality (settings "fxq": auto / low / mid / high; js/vfx.js fxLevel). k: share of every effect's particles; cull: px past the screen edge where
// particles are not made (and ones that drift there are not drawn); haze: the lingering muzzle-smoke bank; embers: ember rain; flotsam: burning wreckage;
// steam: the steam after a bolt; forks: lightning forks; fog: fog puffs at the edge of sight; rings, arms: the funnel's drawn rings and foam arms. Warnings and the fog's sight rule never depend on these.
// "auto" starts from the device (FXQ_DEVICE) and, while frames run slow (a smoothed frame gap above FXQ_SLOW_MS for FXQ_SLOW_S s), steps one level down.
const FXQ = [
  { k: 0.4, cull: 30, haze: 0, embers: 0, flotsam: 0, steam: 0, forks: 0, fog: 0, lite: 0.35, rings: 3, arms: 2 },    // low
  { k: 0.7, cull: 80, haze: 0.5, embers: 0.5, flotsam: 0, steam: 1, forks: 2, fog: 0.5, lite: 0.6, rings: 4, arms: 3 },   // mid
  { k: 1, cull: 140, haze: 1, embers: 1, flotsam: 1, steam: 1, forks: 3, fog: 1, lite: 0.8, rings: 5, arms: 4 },     // high: the owner's picked look
];
const FXQ_SLOW_MS = 22, FXQ_SLOW_S = 2.5, FXQ_COOL_S = 5;      // fog puffs circling at the edge of sight
// Size sliders in the settings panel (js/settings.js, js/options.js): percentages of a base, 50-250 in steps of 5.
const SCALE_MIN = 50, SCALE_MAX = 250, SCALE_STEP = 5, SCALE_DEFAULT = 100;
const MINI_COARSE_PCT = 150;   // the chart's starting size on a touch screen (phone, tablet): 100% is too small to read there (js/settings.js)
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
const EDGE_MAX_SMALL = 3;    // ...on a touch screen or a narrow window, where five boxes crowd the edge (edgeMax, js/edge-math.js)
const EDGE_SMALL_W = 900;    // css px: a window narrower than this counts as small
const MINI_NEAR_R = 1000;   // px: a ship this close that out-fights you is drawn above the harbor and the rest of the chart's marks
const MINI_MERGE = 5;       // chart units: ordinary ships closer than this on the chart merge into one mark with a count
const MINI_UNIT_MIN = 0.35;   // a chart unit never draws smaller than this many CSS px, so the marks stay readable at 50% icon size on a small chart

// Sharing (js/sharecard.js) and the daily sea (js/daily.js, js/run.js). [PLACEHOLDER] loadout until playtested.
const PLAYER_TURN = 2.5;   // rad/s the captain turns at before the hull's own turn factor (SHIPS[id].turn)
const GUN_UP_BATCH = 5;   // levels the gun card's "Upgrade 5 levels" button buys at once (js/gunbay.js)
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
// AI plunder (js/ai-plunder.js): pirate and navy ships scoop floating loot and level up on the spot, for this sortie only.
const AIP_SEEK_R = 420;      // px: loose loot this close pulls an idle ship off its course
const AIP_BREAK = 700;       // px: a ship whose target is nearer than this keeps fighting and ignores loot
const AIP_PICK_R = 44;       // px from a crate that a ship takes it
const AIP_PATIENCE = 14;     // s a ship chases one crate before it gives up on it for a while
const AIP_COST_K = 1;        // loot needed for the next level = this x the loot of one of its own level (enemyStats) ...
const AIP_COST_GROW = 0.5;   // ... x (1 + this x levels already gained)
const AIP_MAX_UP = 5;        // levels a ship can gain in one sortie
const AIP_HP = 1.12, AIP_DMG = 1.1;   // per level: hull and gun damage multipliers

// Collision damage (js/collision.js): speed is the component of the ship's velocity along the line into the island / the
// other hull, in px/s. Below CRASH_MIN_V nothing happens (hugging a coast, mooring); CRASH_FULL_V is a sloop at top speed.
const CRASH_MIN_V = 45, CRASH_FULL_V = 150, CRASH_OVER_MAX = 1.25;   // a faster hull than CRASH_FULL_V hurts up to this many times more
const CRASH_ISLAND_K = 0.08;      // share of max hull lost ramming an island head-on at CRASH_FULL_V (was 0.15: a schooner at 165 lost 28 of 180 in one bump, #125)
const CRASH_SHIP_K = 0.2;        // ... for the lighter of two equal hulls meeting at CRASH_FULL_V closing speed
const CRASH_TOUCH = 0.015;       // share of max hull any ship-on-ship contact costs, however slow (weighted by hull size like a blow)
const CRASH_MASS_MIN = 0.5, CRASH_MASS_MAX = 1.6;   // the share a hull takes of the blow: 2 * (other mass / total mass), kept in this range
const CRASH_COOLDOWN = 0.8;      // seconds before the same ship may be hurt by the same island / ship again
const CRASH_SPARE = 0.15;        // above this share of max hull a crash never kills (it leaves 1 hp); an AI is never killed by rock
const CRASH_GAP = 0.3;           // a blow needs this long without contact before it: pressing on or scraping along a rock is one blow, not many
const CRASH_SHED = 0.6;          // share of its speed a ship keeps after a ship-on-ship blow
const CRASH_BIG = 0.1;           // a blow this share of max hull or more shakes the screen hard and shows "Crash!"
// Boarding (js/boarding.js): a struck ship can be boarded by lying alongside. [PLACEHOLDER] until playtested.
const BOARD_T = 2;               // seconds alongside to finish boarding
const BOARD_GAP = 26;            // px between the two hull circles that still counts as alongside
const BOARD_REL_V = 80;          // px/s: faster than this relative to the prize and the grapples will not hold
const BOARD_HINT_R = 260;        // px from the prize at which the "stay alongside" prompt shows and she heaves to
const BOARD_DECAY = 2;           // progress drains this many times faster than it fills when you drift off
// The grapple's spring (js/grapple.js): hooked within BOARD_HOOK_GAP, it reels the flagship in and matches the prize's drift,
// never faster than BOARD_PULL_MAX; a full-speed run straight away for BOARD_SNAP_T seconds (or a rope BOARD_ROPE_MAX long) cuts it.
const BOARD_HOOK_GAP = 90;       // px between the hull circles within which the hooks catch
const BOARD_HOOK_V = 260;        // px/s: faster than this relative to the prize and the hooks skip off the rail
const BOARD_REST = 13;           // px between the hull circles where the rope hangs slack: hulls nearly touching
const BOARD_PULL_K = 2.2;        // px/s of reel per px of stretch (the spring)
const BOARD_PULL_MAX = 60;       // px/s: the most the rope can drag the flagship, so any ship can still sail away at full speed
const BOARD_PULL_MATCH = 0.7;    // share of the flagship's drift past the prize the rope cancels (so no fine steering is needed)
const BOARD_PULL_RESP = 4;       // 1/s: how fast the pull eases toward what the spring asks for (no jerks)
const BOARD_SNAP_FRAC = 0.8;     // sailing straight away at this share of full speed strains the rope
const BOARD_SNAP_T = 1.2;        // seconds of that strain before the rope parts
const BOARD_STRAIN_DECAY = 2;    // strain eases off this many times faster than it builds once you stop pulling away
const BOARD_ROPE_MAX = 420;      // px between the hull circles at which the rope parts whatever the speed
const BOARD_REHOOK_S = 2.5;      // seconds after a parted rope before the hooks can bite again
const BOARD_GOLD_K = 0.5;        // gold paid at once: this share of the prize's loot (a merchant's cargo already went over the side)
const BOARD_GUN_CHANCE = { merchant: 0.3, pirate: 0.5, navy: 0.5 };   // chance she yields a gun, by faction
const BOARD_GUNS = {             // which gun, by faction: weights (a rarity roll joins these in #38)
  merchant: { six: 5, long12: 3, carronade: 1 },
  pirate:   { six: 2, carronade: 3, chain: 3, fire: 2 },
  navy:     { six: 1, long12: 4, carronade: 3, chain: 1 },
};
const BOARD_LV_EVERY = 4, BOARD_LV_MAX = 3;   // prize gun level: 1 + floor((L - 1) / this), capped
const BOARD_FULL_K = 1;          // gun store full: gold of this many times the gun's armory price (times its level) instead
const SURRENDER_AT = 0.12;       // a pirate or navy hull below this share may strike (once) ...
const SURRENDER_CHANCE = 0.5;    // ... with this chance
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
// Escorts (js/escorts.js, js/escort-ai.js): up to 4 ships from the yard follow the flagship. Slot prices are the owner's proposal,
// not yet confirmed [PLACEHOLDER]; slot n opens once bounty n has been claimed. Repair is charged after a sortie, per escort.
const ESCORT_PRICES = [200, 800, 2000, 5000];
const ESCORT_SLOTS = ESCORT_PRICES.length;
const ESCORT_FIRE = FLEET_FIRE;      // an escort's effective firepower against the same ship as the flagship (owner's call, #44)
const ESCORT_REPAIR_MAX = 0.10;      // damage repair, at most this share of the ship's base price, by the share of hull lost
const ESCORT_SUNK_FEE = 0.15, ESCORT_SUNK_MIN = 30;   // a sunk escort is refitted for this share of its base price (never less than the minimum)
const ESCORT_AIM_L = 6;              // the gun crews aim like a level-6 enemy (js/data.js enemyStats)
const ESCORT_GAP = 120;              // px between slots of the escort formation
const ESCORT_SPEED_K = 1.08;         // the crews hold station well: this much faster than the yard's sails, so they can rejoin
const ESCORT_CATCH_D = 110, ESCORT_CATCH_OFF = 70;   // an escort this far from its slot presses on (inside ESCORT_LEASH): it may sail up to ESCORT_CATCH_K x the flagship's top speed to rejoin, and eases off once within the second (#108)
const ESCORT_CATCH_K = 1.12;
const ESCORT_WARN = 0.35;            // an escort under this share of hull gets a red bar on the ship and one warning (js/escort-ai.js, js/escort-hud.js)
const ESCORT_LOST = 1500;            // an escort this far from the flagship and out of sight is set back on its station
const ESCORT_RETREAT = 0.3;          // a passive escort under this share of hull breaks off and keeps to the flagship
// Per attack stance: aggro = how close an enemy must be to the escort to be engaged (px for active, a multiple of the escort's gun range for normal), reach = how far from the flagship it
// may fight. The stance picks targets only: every escort fights from its station and never strays more than ESCORT_LEASH from it (owner's call).
const ESCORT_STANCE = { active: { aggro: 800, reach: 1000 }, normal: { aggro: 1.2, reach: 620 }, passive: { aggro: 0, reach: 420 } };
const ESCORT_LEASH = 120;            // px (about 60 m, EDGE_M_PER_PX) an escort may stray from its formation slot before it turns back to it
// Wind, weather and the hour of day (js/weather-core.js is the maths, js/weather.js the sea). Every number here is gameplay:
// the same for every player whatever the weather-effects setting says, so a daily sea plays the same everywhere.
const WIND = { tail: 1.5, head: 0.30, full: 0.6, min: 0.7, max: 3 };   // speed gained running before the wind (a bare ship x2.5, the best sails x3 = max), lost beating into it (a bare ship x0.7 = min; head gear softens it), at wind strength >= full (a calm gives less); min/max bound it as a safety net (#wind-range)
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
// Fleeing enemies (js/flee.js). [PLACEHOLDER] until playtested. Per kind: gap = how many levels the captain's ship rating must
// stand above the enemy's threat level for it to run on sight; hp = hull share below which it may retreat; min = the least
// rating lead (negative: even when stronger than you) at which a hurt ship retreats. Merchants run first, the Navy last.
const FLEE = {
  merchant: { gap: 2, hp: 0.65, min: -99 }, pirate: { gap: 4, hp: 0.5, min: -1 }, navy: { gap: 7, hp: 0.35, min: 1 },
  sight: 700, escape: 1250,          // px: a gap-runner starts inside sight; any runner is clear once this far off (gap-runners resume, hurt ones sail away for good)
  cornerR: 200, cornerT: 4,          // pinned this close for this many s (a map edge, a rock): it turns and fights, once
  pad: 320, windSpan: 1, windStep: 0.25, windBend: 0.35,   // px from a map edge where it veers inward; the rad either side of "straight away" it may bend to find fair wind, and how much each bit of bend costs (0 = none, 1 = as much as the lost range)
  tick: 0.25, dump: 0.5, boost: 1.1,       // s between decisions; a hurt merchant tips this share of its cargo and sails this much faster
};
// Navy heat and the Admiral's fleet (js/heat.js). Heat is per sortie (not saved): sinking Navy ships raises it, quiet cools it, any harbor clears it.
// [PLACEHOLDER] until playtested. Off in the daily sea and #seed voyages (their ships come from a fixed seed).
const HEAT_STARS = 5, HEAT_STAR_SIZE = 20;   // heat 0..100; a star lights every 20
const HEAT_PER_SINK = 14, HEAT_HUNTER_SINK = 7, HEAT_FLAGSHIP_SINK = 30;   // heat for a Navy ship, a hunter (half: no treadmill), the Admiral's flagship
const HEAT_CALM_S = 15, HEAT_COOL = 1.5;   // seconds since the last Navy sinking before heat cools, then heat lost per second (100 to 0 in about 67 s)
const HEAT_BOUNTY_STEP = 0.2;              // warship bounties pay +20% per star: double at five stars
const HEAT_HUNT_FROM = 2;                  // stars from which the Navy puts hunting fleets to sea (heat 1 only pays more)
const HEAT_HUNT_EVERY = [0, 0, 70, 50, 36, 26];   // seconds between hunting fleets, by stars
const HEAT_HUNT_MAX = [0, 0, 1, 1, 2, 2];         // hunting fleets alive at once, by stars
const HEAT_HUNT_LV = [0, 0, 0, 1, 1, 2];          // levels above the local ring a hunter's lead is, by stars (wingmen = stars - 1, up to the sea's size cap)
const HEAT_HUNT_FIRST = 10, HEAT_HUNT_R = [850, 1250];   // s before the first hunter after heat 2; px from the player they come over the horizon
const ADMIRAL_AFTER = 4;                   // bounties claimed before the Admiral's fleet patrols (after the 4th poster, ahead of the last)
const ADMIRAL_EVERY = [190, 300];          // s between sightings; heat shortens it by ADMIRAL_HEAT per star
const ADMIRAL_HEAT = 0.12, ADMIRAL_R = [1400, 2000], ADMIRAL_RING = 3;   // the player must be in at least this ring to meet him
const ADMIRAL_GONE = 4500;                 // px: an Admiral's fleet left this far behind sails off for good
const ADMIRAL_HP = 1.3, ADMIRAL_LOOT = 2.5, ADMIRAL_LV = 1;   // flagship: hull x, plunder x, levels above the ring

// Highlight replay (js/replay.js): two recorders, staggered by half a clip, each lives exactly REPLAY_SEG_S; the first one that ends
// at least REPLAY_TAIL_S after a big moment is the clip, so a clip is always REPLAY_SEG_S long.
const REPLAY_FPS = 30, REPLAY_MAX_W = 960, REPLAY_BITRATE = 2000000;   // recording rate, widest picture, bits per second
const REPLAY_SEG_S = 6, REPLAY_MIN_S = 3;   // clip length; the second recorder starts this long after the first
const REPLAY_TAIL_S = 1.5, REPLAY_COOL_S = 6, REPLAY_OFFER_MS = 10000;   // footage after the moment, quiet time between clips, how long the chip stays
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

// Gear (#38; js/gear-core.js is the rules, js/gear-save.js the save edits, js/gear-fx.js the sea, js/gear-ui.js the ledger page). Seven parts: the
// gun part is each gun in the mounts and the gun store (js/data.js), the other six are worn one apiece (save.gear). Every figure here is a
// proposal for the owner [PLACEHOLDER] until playtested; the PR lists them.
const GEAR_PARTS = ["prow", "body", "sail", "gun", "supply", "instr", "flag"];
const GEAR_RARITY = [   // af: how many affixes a roll gets (a legendary gets its own effect on top)
  { id: "common", af: [0, 0] }, { id: "magic", af: [1, 2] }, { id: "rare", af: [2, 3] }, { id: "epic", af: [3, 4] }, { id: "legend", af: [2, 3] },
];
// Item level 1-5 follows the ship tier: a kill drops min(the ring's level, the tier of the ship you sail), and an item only wears on a hull of
// at least its level, so the early sea can never hand out late gear. Rings 1-10 give item levels 1,1,2,2,3,3,4,4,5,5 (the Shallows 1, the Reef 2-3, the Lanes 3-4, the Maelstrom 5).
const GEAR_ILV_RING = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
const GEAR_ILV_K = [0.6, 0.8, 1, 1.25, 1.5];   // every affix value rolled for an item level is scaled by this
const GEAR_LV_MAX = 10, GEAR_LV_STEP = 0.04, GEAR_UP_BASE = 40;   // a worn part (not a gun) levels with gold like a gun does: values x (1 + step x (Lv - 1)); price = base x item level x 1.5^(Lv - 1)
const GEAR_REST = 0.5;   // the same effect on several parts: the best counts in full, the rest at this share (then the cap below)
const GEAR_DROP = {
  chance: { pirate: 0.22, navy: 0.3, merchant: 0.14 },   // a drop per sinking you make, by faction (a fort counts as a warship; a boarded prize drops its gun instead)
  weights: [62, 28, 10, 0, 0],                           // rarity weights of an ordinary drop: common to rare
  boss: [0, 0, 60, 32, 8], bossExtra: true,              // a bounty captain always drops one (rare or better) and an ordinary roll too
  board: { merchant: [30, 45, 20, 5, 0], pirate: [20, 40, 28, 10, 2], navy: [20, 40, 28, 10, 2] },   // rarity weights of a prize gun
  part: { prow: 1, body: 1, sail: 1, gun: 2, supply: 1, instr: 1, flag: 1 },   // which part drops
  gun: { six: 4, long12: 3, carronade: 2, chain: 1.5, fire: 1 },               // which gun, for a gun drop
};
const GEAR_BAG_MAX = 60;   // worn-part spares; guns keep the gun store's own limit (MAX_STORE, js/save.js). Past it a drop is broken down at once, so nothing blocks play
const GEAR_SCRAP = [1, 3, 8, 18, 45];   // fittings (the one material) from breaking an item down, by rarity, x (1 + 0.25 x (item level - 1))
const GEAR_REROLL = { mats: [0, 2, 5, 12, 25], gold: 30, step: 0.6 };   // one affix re-rolled: fittings by rarity x (1 + step x earlier re-rolls) and gold x item level x (1 + re-rolls)
// Affixes by part: [lowest, highest] roll at item level 3 (before GEAR_ILV_K). Percent as a fraction. Four per part, so an epic always has a pool.
const GEAR_AFFIX = {
  prow:   { ram: [0.08, 0.18], keep: [0.10, 0.25], brace: [0.06, 0.14], jolt: [0.10, 0.25] },   // ram: damage a collision deals; keep: speed kept after one; brace: damage it does you (also body); jolt: the other ship's extra lost speed
  body:   { hp: [0.06, 0.14], brace: [0.06, 0.14], fire: [0.10, 0.25], armor: [0.04, 0.09] },   // fire: burning damage you take (also supply); armor: cannon damage you take
  sail:   { spd: [0.04, 0.08], turn: [0.05, 0.12], tail: [0.07, 0.165], head: [0.15, 0.35] },    // tail: more of the following wind's gain (best roll at item level 5, Lv 10: 0.165 x 1.5 x 1.36 = +0.337, so 1 + 1.5 x 1.337 reaches the x3 cap); head: less of the head wind's loss
  gun:    { gdmg: [0.06, 0.14], grange: [0.05, 0.12], greload: [0.06, 0.14], gtype: [0.10, 0.25] },   // gtype: burn x, chain slow time x, ball speed x for the plain guns
  supply: { repair: [0.15, 0.35], fire: [0.10, 0.25], cargo: [0.08, 0.20], powder: [0.20, 0.50] },   // powder: more magazine blasts from your rakes
  instr:  { view: [0.08, 0.20], aim: [0.06, 0.15], storm: [0.15, 0.35], reach: [0.04, 0.10] },  // view: plunder seen and ships marked farther; aim: damage rises up to this at full range; storm: storm yaw; reach: every gun's range
  flag:   { escDef: [0.08, 0.20], loot: [0.06, 0.16], heat: [0.10, 0.25], luck: [0.10, 0.25] },   // escDef: escorts take less; heat: Navy heat gained; luck: drop chance
};
const GEAR_BASE = { prow: ["ram", 0.04], body: ["hp", 0.03], sail: ["spd", 0.015], supply: ["cargo", 0.04], instr: ["view", 0.04], flag: ["loot", 0.025], gun: ["gdmg", 0.02] };   // every piece's own effect, x item level (a gun: x (level - 1), so an old Lv 1 gun is unchanged)
const GEAR_CAP = { ram: 0.6, keep: 0.3, brace: 0.4, jolt: 0.4, hp: 0.5, fire: 0.6, armor: 0.3, spd: 0.25, turn: 0.3, tail: 0.8, head: 0.6, repair: 1, cargo: 0.6, powder: 1.5,
  view: 0.5, aim: 0.4, storm: 0.7, reach: 0.25, escDef: 0.5, loot: 0.5, heat: 0.6, luck: 0.5 };
const GEAR_LEG = { prow: "scatter", body: "lastStand", sail: "swift", gun: "drag", supply: "dock", instr: "mark", flag: "rally" };   // the legendary effect of each part
const GEAR_LEGX = {   // closing: px/s of closing speed; t: seconds; cut / k: share; cd: seconds between; r: px
  scatter: { closing: 120, t: 4 }, lastStand: { below: 0.25, t: 5, cut: 0.5 }, swift: { turn: 1.5, within: 1, t: 2.5, k: 0.15, cd: 6 },
  drag: { t: 1.5, k: 0.25 }, dock: { k: 2 }, mark: { r: 420, t: 8, k: 0.15, cd: 12 }, rally: { t: 4, k: 0.3, gap: 10 },
};
