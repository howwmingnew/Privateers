"use strict";
// ---------- Data tables ----------
const GUNS = {
  six:       { name: "6-pounder",  full: "Iron 6-pounder",   dmg: 10, range: 270, rpm: 36, cost: 0,   upBase: 60,  note: "Reliable all-rounder" },
  long12:    { name: "Long 12",    full: "Long 12-pounder",  dmg: 14, range: 390, rpm: 26, cost: 350, upBase: 140, note: "Outranges most ships" },
  carronade: { name: "Carronade",  full: "24-pdr Carronade", dmg: 30, range: 210, rpm: 22, cost: 600, upBase: 220, note: "Smashes hulls up close" },
  fire:      { name: "Incendiary", full: "Incendiary Gun",   dmg: 7,  range: 260, rpm: 30, cost: 900, upBase: 300, burn: 8, note: "Sets hulls burning for 3 s" },
};
const GUN_ORDER = ["six", "long12", "carronade", "fire"];
const GUN_MAX = 10;

// Ships for sale. Bigger ships carry more guns and start sturdier, but their yard upgrades begin again at Lv 1.
const SHIPS = {
  sloop:    { slots: { bow: 1, left: 1, right: 1, stern: 0 }, hp: 100, speed: 150, hold: 150, cost: 0 },
  schooner: { slots: { bow: 1, left: 2, right: 2, stern: 0 }, hp: 140, speed: 165, hold: 220, cost: 400 },
  brig:     { slots: { bow: 1, left: 3, right: 3, stern: 0 }, hp: 200, speed: 155, hold: 330, cost: 1200 },
  frigate:  { slots: { bow: 2, left: 4, right: 4, stern: 1 }, hp: 300, speed: 150, hold: 500, cost: 3600 },
  line:     { slots: { bow: 2, left: 5, right: 5, stern: 2 }, hp: 450, speed: 140, hold: 750, cost: 9000 },
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

// Yard upgrades scale the current ship's base stats.
const YARD = {
  hull:  { val: (l, sh) => Math.round(sh.hp * 1.28 ** (l - 1)),   show: v => t("u_hp", { n: v }),                cost: l => Math.round(120 * 1.6 ** (l - 1)), max: 15 },
  sails: { val: (l, sh) => sh.speed + 14 * (l - 1),               show: v => t("u_kn", { n: (v / 15).toFixed(1) }), cost: l => Math.round(90 * 1.6 ** (l - 1)),  max: 10 },
  hold:  { val: (l, sh) => Math.round(sh.hold * 1.6 ** (l - 1)),  show: v => t("u_cargo", { n: fmt(v) }),         cost: l => Math.round(100 * 1.7 ** (l - 1)), max: 12 },
};
function yardVal(k, l = save[k], sh = SHIPS[save.ship]) { return YARD[k].val(l, sh); }

function gunLvMul(lv) { return 1.2 ** (lv - 1); }
function gunUpCost(id) { return Math.round(GUNS[id].upBase * 1.55 ** (save.gunLv[id] - 1)); }

// Enemy stats by level L. Merchants are tankier, slower, nearly unarmed, and richer.
function enemyStats(L, merchant) {
  const aim = clamp((L - 1) / (AIM_FULL_L - 1), 0, 1);
  return {
    lead: 0.7 * aim,             // share of the target's motion they aim ahead of
    spread: 0.45 - 0.36 * aim,   // ± random aim error in radians
    hp: 60 * 1.32 ** (L - 1) * (merchant ? 1.25 : 1),
    per: merchant ? 1 : Math.min(1 + Math.floor((L - 1) / 2), 4),
    dmg: 7 * 1.22 ** (L - 1),
    range: 230 + 10 * L,
    interval: 2.6,
    speed: (118 + 6 * L) * (merchant ? 0.85 : 1),
    loot: Math.round(50 * 1.4 ** (L - 1) * (merchant ? 1.7 : 1)),
  };
}
// "Power" = sqrt(hp * dps per side). Used only to show a comparable ship level.
function enemyPower(L) { const s = enemyStats(L, false); return Math.sqrt(s.hp * s.per * s.dmg / s.interval); }
function playerPower() {
  const mountDps = key => save[key].reduce((a, id) => {
    const g = GUNS[id], m = gunLvMul(save.gunLv[id]);
    return a + (g.dmg * m + (g.burn ? g.burn * m * 3 : 0)) * g.rpm / 60;
  }, 0);
  // bow and stern guns bear on a target less often than a broadside, so they count half
  const dps = (mountDps("left") + mountDps("right")) / 2 + (mountDps("bow") + mountDps("stern")) / 2;
  return Math.sqrt(yardVal("hull") * dps);
}
function shipRating() { const p = playerPower(); let L = 1; while (L < 40 && enemyPower(L + 1) <= p) L++; return L; }
