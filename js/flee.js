"use strict";
// ---------- Fleeing enemies: the outmatched and the beaten run instead of fighting to the sinking (issue #70) ----------
// Two reasons to run, judged by the same rating the threat badges use (shipRating() against the enemy's threatL):
//   gap   the captain's ship rates FLEE[kind].gap levels above it: it turns away as soon as you are inside FLEE.sight
//   hurt  hull under FLEE[kind].hp and it is being hit by someone FLEE[kind].min levels stronger (a merchant runs from anyone)
// Merchants run first, pirates in between, the Navy last. A runner sails full away from its threat and bends up to
// FLEE.windSpan either side to find fair wind (windFactor, js/weather.js); a hurt merchant tips half its cargo (a crate to scoop)
// and sails a little faster. Clear by FLEE.escape: a gap-runner goes back to cruising, a hurt one sails off the map for good
// (retired off-screen, not sunk). Pinned against a rock or the edge for FLEE.cornerT s it turns and fights, once.
// A fleet's wingmen follow a fleeing lead. Never: bosses and their guards, rematch captains, the Admiral's fleet, hunters, the
// player's escorts, fireships, forts, the tutorial's mark, practice targets (js/novice.js), a ship that has struck her colours (js/strike.js).
// No dice are thrown (a daily sea plays the same as any other); the player's own rating is the only thing that varies.
Object.assign(STR.en, { fleeTag: "Fleeing", fleeCall: "Retreat!" });
Object.assign(STR.zh, { fleeTag: "逃跑中", fleeCall: "撤退！" });

const fleeKind = e => e.merchant ? "merchant" : e.faction;
const fleeBold = e => !!(e.boss || e.escortOf || e.ally || e.fixed || e.hunter || e.admiral || e.holdSea || e.struck || e.isPlayer
  || (e.A && e.A.boom) || (typeof practiceTarget === "function" && practiceTarget(e)) || (typeof tut !== "undefined" && e === tut.target));
const fleeFollows = e => e.alive && !fleeBold(e) && !e.fleeDone;                      // a wingman (even a convoy's escort brig) trails a runner
const fleeCan = e => fleeFollows(e) && !e.escort && !!FLEE[fleeKind(e)];              // ...but only the rest pick running for themselves
// "gap", "hurt" or null. diff: the threat's level minus the runner's (the player: shipRating() - threatL).
function fleeTrigger(kind, diff, hpFrac, d, attacked) {
  const c = FLEE[kind];
  if (!c) return null;
  if (diff >= c.gap && d < FLEE.sight) return "gap";
  if (attacked && hpFrac < c.hp && diff >= c.min) return "hurt";
  return null;
}
// The way away from `from`, bent inward off the map's edge so a runner is not herded into a corner.
function fleeAway(e, from) {
  const m = Math.hypot(e.x - from.x, e.y - from.y) || 1, lean = (v, hi) => v < FLEE.pad ? (FLEE.pad - v) / FLEE.pad : v > hi - FLEE.pad ? (hi - FLEE.pad - v) / FLEE.pad : 0;
  return Math.atan2((e.y - from.y) / m + 1.6 * lean(e.y, H), (e.x - from.x) / m + 1.6 * lean(e.x, W));
}
// Of the headings within `span` of straight away, the one that makes the most way from the threat: windFn(a) is the wind's
// speed factor on heading a. Calm (or no wind): straight away, since the first candidate wins ties.
function fleeHeading(away, windFn, span = FLEE.windSpan, step = FLEE.windStep) {
  let best = away, bs = windFn(away);
  for (let o = step; o <= span + 1e-9; o += step) for (const s of [1, -1]) {
    const a = away + s * o, sc = windFn(a) * (1 - FLEE.windBend * (1 - Math.cos(o)));   // the bend costs a little of the range it makes
    if (sc > bs + 1e-9) { best = a; bs = sc; }
  }
  return best;
}
const fleeWind = a => typeof wx !== "undefined" && wx.on && !docked ? windFactor(a, wx.wind) : 1;
let fleeRateT = -1, fleeRateV = 1;   // shipRating() walks the power table: once per decision tick is plenty
const fleeRate = now => { if (now - fleeRateT > 0.2 || now < fleeRateT) { fleeRateT = now; fleeRateV = shipRating(); } return fleeRateV; };

function fleeBegin(e, mode, from, now) {
  e.flee = { mode, from, cornerT: 0, t0: now };
  if (mode === "hurt" && e.merchant && e.loot > 0 && !e.fleeDumped && typeof addCrate === "function") {   // lighten ship: half the hold over the side
    const n = Math.round(e.loot * FLEE.dump);
    if (n > 0) { addCrate(e.x, e.y, n, null); e.loot -= n; e.fleeDumped = true; }
  }
  if (!e.fleeBoost) { e.fleeBoost = true; e.maxSpeed *= FLEE.boost; }
  if (onScreen(e.x, e.y)) floatText(e.x, e.y - 48, t("fleeCall"), "#c9d6da", 15);
}
function fleeEnd(e, final) {
  if (!e.flee) return;
  e.flee = null;
  if (e.fleeBoost) { e.fleeBoost = false; if (!e.struck) e.maxSpeed /= FLEE.boost; }   // a struck ship's speed was cut after the boost: leave it
  if (final) e.fleeDone = true;
  if (e.badge) refreshBadge(e);
}
function fleeEval(e, now) {
  const f = e.flee;
  if (f) {
    const th = f.from;
    if (!th || !th.alive || docked) return fleeEnd(e, false);
    const d = dist(e, th);
    f.cornerT = d < FLEE.cornerR ? f.cornerT + FLEE.tick : Math.max(0, f.cornerT - FLEE.tick);
    if (f.cornerT > FLEE.cornerT) return fleeEnd(e, true);
    if (d > FLEE.escape) { if (f.mode === "gap") fleeEnd(e, false); else e.fleeGone = true; }   // clear: calm again, or off the map
    return;
  }
  const L = e.threatL ?? e.L, lead = e.fleet && e.fleet.type !== "escort" && e.fleet.lead !== e && e.fleet.lead.alive ? e.fleet.lead : null;
  if (lead && lead.flee && fleeFollows(e)) return fleeBegin(e, lead.flee.mode, lead.flee.from, now);   // the lead runs, the wingmen go with it
  if (!fleeCan(e)) return;
  const kind = fleeKind(e);
  if (player.alive && !docked && !inSafe(player) && fleeTrigger(kind, fleeRate(now) - L, 1, dist(e, player), false) === "gap") return fleeBegin(e, "gap", player, now);
  const att = e.attacker && e.attacker.alive && e.angry > 0 ? e.attacker : null;
  if (att && fleeTrigger(kind, (att.isPlayer ? fleeRate(now) : att.threatL ?? att.L) - L, e.hp / e.maxHp, 0, true) === "hurt") fleeBegin(e, "hurt", att, now);
}
// From think() (js/ships.js), before the disaster dodge: the runner's course, or null if this ship is not running.
function fleeSteer(e, now) {
  if (e.struck || !e.alive) { fleeEnd(e, false); return null; }
  if (now >= (e.fleeNext || 0)) { e.fleeNext = now + FLEE.tick; fleeEval(e, now); }
  const f = e.flee;
  if (!f) return null;
  if (f.from === player && f.mode !== "hurt") { e.ignore.set(player, now + 1); if (e.target === player) e.target = null; }   // not out to fight: nothing to shoot at
  if (e.badge && !e.badge.text.includes(t("fleeTag"))) e.badge.setText(e.badge.text + " · " + t("fleeTag"));
  return { desired: fleeHeading(fleeAway(e, f.from), fleeWind), thr: 1 };
}
// Sail off for good (retired off-screen, as the sea retires a spare ship), after the AI pass so no loop skips a ship.
onHook("frame", () => {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.fleeGone || onScreen(e.x, e.y, 200)) continue;
    e.alive = false; e.spr.destroy(); e.badge?.destroy(); enemies.splice(i, 1);
  }
});
// The chart: a thin pale ring round each runner (solid: the chart draws no dashed line, tests/phase1b.mjs).
onHook("mini", (c, k, u) => {
  c.strokeStyle = "rgba(246,241,227,.85)"; c.lineWidth = 1.2 * u;
  for (const e of enemies) if (e.alive && e.flee) { c.beginPath(); c.arc(e.x * k, e.y * k, 7.5 * u, 0, TAU); c.stroke(); }
});
