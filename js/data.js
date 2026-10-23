"use strict";
// ---------- Data tables ----------
// Every number here is a tuning value [PLACEHOLDER until playtested]: .review/combat/model.mjs prints the curves they
// make (DPS per gold, ship ladder, enemy levels) and .review/combat/play.mjs measures the pacing they give.
// speed = ball speed (px/s). Long 12 balls are fast (easy at range), carronade balls slow (close range only).
const GUNS = {
  six:       { name: "6-pounder",  full: "Iron 6-pounder",   dmg: 10, range: 270, rpm: 36, speed: 480, cost: 0,   upBase: 60,  note: "Reliable all-rounder" },
  long12:    { name: "Long 12",    full: "Long 12-pounder",  dmg: 18, range: 400, rpm: 26, speed: 620, cost: 350, upBase: 130, note: "Fast balls, outranges most ships" },
  carronade: { name: "Carronade",  full: "24-pdr Carronade", dmg: 32, range: 200, rpm: 20, speed: 400, cost: 600, upBase: 200, note: "Smashes hulls up close" },
  chain:     { name: "Chain shot", full: "Chain-shot Gun",   dmg: 5,  range: 240, rpm: 30, speed: 480, cost: 500, upBase: 120, chain: true, note: "Cuts rigging: slows the target" },
  fire:      { name: "Incendiary", full: "Incendiary Gun",   dmg: 6,  range: 260, rpm: 30, speed: 480, cost: 900, upBase: 260, burn: 5, note: "Each hit starts a fire" },
};
const GUN_ORDER = ["six", "long12", "carronade", "chain", "fire"];
const GUN_MAX = 10;
// Incendiary: each hit adds one fire of `burn`/s for BURN_T s; a hull holds at most BURN_MAX at once (oldest goes out).
const BURN_T = 4, BURN_MAX = 4;
// Chain shot: torn rigging costs the target 40% of its speed and 30% of its turn for CHAIN_T s (a new hit renews it).
const CHAIN_T = 4, CHAIN_SPEED = 0.6, CHAIN_TURN = 0.7;

// Ships for sale. Bigger ships carry more guns and start sturdier, but their yard upgrades begin again at Lv 1, so each
// one's base stats beat the previous ship at a typical refit (hull Lv 4-5, hold Lv 3-4). The yard pays back 60% of the
// old refit on purchase (js/plunder.js). refit scales yard prices: a bigger hull costs more to refit.
const SHIPS = {
  sloop:    { slots: { bow: 1, left: 1, right: 1, stern: 0 }, hp: 100,  speed: 150, hold: 240,  cost: 0,     refit: 1 },
  schooner: { slots: { bow: 1, left: 2, right: 2, stern: 0 }, hp: 180,  speed: 165, hold: 440,  cost: 400,   refit: 1.7 },
  brig:     { slots: { bow: 1, left: 3, right: 3, stern: 0 }, hp: 325,  speed: 155, hold: 1250, cost: 2000,  refit: 3.2 },
  frigate:  { slots: { bow: 2, left: 4, right: 4, stern: 1 }, hp: 585,  speed: 150, hold: 2200, cost: 6000,  refit: 6 },
  line:     { slots: { bow: 2, left: 5, right: 5, stern: 2 }, hp: 1050, speed: 140, hold: 4100, cost: 16000, refit: 11 },
};
const SHIP_ORDER = Object.keys(SHIPS);
// Gun mounts. ang = firing direction relative to the bow; muzzles sit `out` px that way,
// spread over `span` px along the direction (s.rot + perp).
const MOUNTS = [
  { key: "bow",   ang: 0,            out: 34, perp: Math.PI / 2, span: 12 },
  { key: "left",  ang: -Math.PI / 2, out: 13, perp: 0,           span: 36 },
  { key: "right", ang: Math.PI / 2,  out: 13, perp: 0,           span: 36 },
  { key: "stern", ang: Math.PI,      out: 34, perp: Math.PI / 2, span: 12 },
];

// Yard upgrades scale the current ship's base stats by a percentage per level, so a level means the same on any hull.
const YARD = {
  hull:  { val: (l, sh) => Math.round(sh.hp * 1.15 ** (l - 1)),          show: v => t("u_hp", { n: v }),                  cost: (l, sh = SHIPS[save.ship]) => Math.round(110 * sh.refit * 1.5 ** (l - 1)), max: 15 },
  sails: { val: (l, sh) => Math.round(sh.speed * (1 + 0.045 * (l - 1))), show: v => t("u_kn", { n: (v / 15).toFixed(1) }), cost: (l, sh = SHIPS[save.ship]) => Math.round(80 * sh.refit * 1.5 ** (l - 1)),  max: 10 },
  hold:  { val: (l, sh) => Math.round(sh.hold * 1.2 ** (l - 1)),         show: v => t("u_cargo", { n: fmt(v) }),           cost: (l, sh = SHIPS[save.ship]) => Math.round(90 * sh.refit * 1.5 ** (l - 1)),  max: 12 },
};
function yardVal(k, l = save[k], sh = SHIPS[save.ship]) { return YARD[k].val(l, sh); }

function gunLvMul(lv) { return 1.15 ** (lv - 1); }
function gunUpCost(id) { return Math.round(GUNS[id].upBase * 1.55 ** (save.gunLv[id] - 1)); }

// Enemy base stats by level L (the brig; js/archetypes.js scales them per class). Merchants are tankier, nearly
// unarmed and richer. Enemy guns fire a side together after VOLLEY_WARN s of warning (js/volley.js). Every crew aims
// where the target is heading (lead 1), so changing course when the gun ports glow is a dodge at any level. Skill is
// how much of the target's turn they read (turn, 0..1), how badly a volley misjudges its speed (leadErr, +/- share of
// the lead) and each gun's random error (spread, rad). Green crews (low L) mostly miss a ship that keeps moving.
const VOLLEY_WARN = 0.6;
// Growth per level up to Lv 10, then a gentler `after` rate: New Game+ adds 3 levels a cycle (up to Lv 19), and a
// maxed ship of the line must still be able to sink what it meets there.
const lvGrow = (L, k, after) => L <= 10 ? k ** (L - 1) : k ** 9 * after ** (L - 10);
function enemyStats(L, merchant) {
  const aim = clamp((L - 1) / (AIM_FULL_L - 1), 0, 1), past = Math.max(0, L - 10), Lc = Math.min(L, 10);
  return {
    aim,
    lead: 1,
    leadErr: 0.8 * (1 - aim),
    turn: clamp((L - 2) / 5, 0, 1),
    spread: 0.5 - 0.4 * aim,
    hp: 60 * lvGrow(L, 1.45, 1.22) * (merchant ? 1.25 : 1),
    per: merchant ? 1 : Math.min(1 + Math.floor((L - 1) / 2), 4),
    dmg: 7 * lvGrow(L, 1.24, 1.12),
    range: 230 + 10 * Lc + 4 * past,
    interval: 2.4,
    speed: 118 + 6 * Lc + 2 * past,
    loot: Math.round(22 * lvGrow(L, 1.45, 1.25) * (merchant ? 1.3 : 1)),
  };
}
// Ship level shown to the player: the strongest enemy level whose power its own power matches.
// Power = sqrt(hull x the damage per second it really lands), so equal power means about equal time to sink each other.
// The player aims by hand: each mount bears on a target about a quarter of the time (a broadside half the time, on one
// side or the other), and incendiary fires count once, at the stack level that rate of hits keeps burning.
const MOUNT_UPTIME = 0.25;
// Enemy side: a volley every interval + warning, times ENEMY_FIRE_K for how much of it lands relative to the player's
// share. Calibrated with duels (.review/combat/duel.mjs: a bot that dodges half the volleys, one enemy brig): the level
// a loadout wins with ~55-75% of its hull left comes out as its rating (sloop 2, schooner 4, brig 7, frigate 9, line 11).
const ENEMY_FIRE_K = 0.705;
function enemyPower(L) {
  const s = enemyStats(L, false);
  return Math.sqrt(s.hp * s.per * s.dmg / (s.interval + VOLLEY_WARN) * ENEMY_FIRE_K);
}
function playerPower() {
  let dps = 0, fireRate = 0, fireDps = 0;
  for (const { key } of MOUNTS) for (const id of save[key]) {
    const g = GUNS[id], m = gunLvMul(save.gunLv[id]), rate = g.rpm / 60 * MOUNT_UPTIME;
    dps += g.dmg * m * rate;
    if (g.burn) { fireRate += rate; fireDps = Math.max(fireDps, g.burn * m); }
  }
  dps += Math.min(BURN_MAX, fireRate * BURN_T) * fireDps;
  return Math.sqrt(yardVal("hull") * dps);
}
function shipRating() { const p = playerPower(); let L = 1; while (L < 40 && enemyPower(L + 1) <= p) L++; return L; }
