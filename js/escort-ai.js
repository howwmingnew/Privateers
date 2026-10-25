"use strict";
// ---------- Escorts at sea (the slots, prices and save: js/escorts.js; the ledger page: js/escort-ui.js) ----------
// An escort is an ordinary AI ship in `enemies` with ally = true and faction "ally": pirates and the Navy shoot at it like at the
// player, it shoots them, and the rest of the game treats it as one more hull. It is bound to the flagship in an "escort" fleet
// (js/fleet.js): the player is the lead, the escorts are the wingmen, so they share the formation slots and the 80% firepower.
// What differs from an enemy: it never takes part in the sea's quota or loot (isOrdinary, loot 0), balls of the player and of
// other escorts pass through it, it picks its targets by its stance (escortRetarget) and returns to its slot when it strays.
const ALLY_COLOR = "#4cf0a8";
LIVERY.ally = { ...LIVERY.player, trim: ALLY_COLOR, flag: ALLY_COLOR, flag2: "#fff7e2", pennant: ALLY_COLOR, pennant2: "#fff7e2" };

let escortLive = [];      // this sortie's escorts: [{ slot, e }]
let escortReport = null;  // the last sortie's bill, for the ledger: { paid, lost: [names] }
let escortT = 0;

const escortName = entry => entry.name || t("s_" + entry.ship);

// Give a freshly made enemy the numbers of yard ship `entry` carrying the gun items `guns` ({ bow, left, right, stern }, the slot's own ports).
function outfitAlly(e, entry, slotNo, stance, guns) {
  const sh = SHIPS[entry.ship], st = enemyStats(ESCORT_AIM_L, false);
  Object.assign(e, { ally: true, slot: slotNo, stance, yardId: entry.id, allyName: escortName(entry), loot: 0, stolen: 0, merchant: false, fixed: false,
    arch: entry.ship, A: { plan: ESCORT_PLAN[entry.ship] || "circle" }, angry: 0, target: null, boss: undefined, escortOf: undefined });
  e.maxHp = e.hp = yardVal("hull", entry.hull, sh);
  e.maxSpeed = yardVal("sails", entry.sails, sh) * ESCORT_SPEED_K;
  e.turnRate = 1.7 * (ESCORT_TURN[entry.ship] || 1);
  e.aim = st.aim; e.aimLead = st.lead; e.aimLeadErr = st.leadErr; e.aimTurn = st.turn; e.aimSpread = st.spread;
  e.guns = { ...escortBattery(entry.ship, guns), turret: [] };
  e.vol = {};
  for (const m in e.guns) if (e.guns[m].length) e.vol[m] = { cd: rand(0.4, 1.8), warn: 0, aims: null };
  e.range = Math.max(0, ...["left", "right", "bow", "stern"].flatMap(k => e.guns[k].map(g => g.range))) || 250;
  applyShipArt(e, entry.ship, "ally");
  e.cls = entry.ship;
  e.threatL = threatLevelOf(e);
  refreshBadge(e);
  return e;
}

// Take the ready escorts out with the flagship: made at their formation slots, bound into one fleet.
function deployEscorts() {
  escortLive = [];
  if (typeof runActive === "function" && runActive()) return;   // the daily sea and seeded runs sail alone
  const picks = save.escorts.map((e, i) => i).filter(i => escortReady(save, i));
  if (!picks.length) return;
  for (const id of SHIP_ORDER) shipArt(id, "ally", {}, S);   // baked now, not mid-fight
  const slots = formationSlots("wedge", picks.length, ESCORT_GAP), ships = [];
  picks.forEach((i, k) => {
    const entry = escortShipOf(save, save.escorts[i]), cfg = save.escorts[i], p = safeSlot(slotWorld(player, slots[k]), player);
    const e = makeEnemy(S, p.x, p.y, ESCORT_AIM_L, "ally", "brig");
    e.rot = player.rot;
    outfitAlly(e, entry, i, cfg.stance, cfg.guns);
    ships.push(e); escortLive.push({ slot: i, e });
  });
  const f = makeFleet("escort", [player, ...ships], { formation: "wedge", power: ESCORT_FIRE });
  f.gap = ESCORT_GAP; f.look = 0.15; f.seen = true;   // wider slots, and a shorter lookahead than a leader's fleet: the flagship stops and turns more
  player.fleet = null;   // the flagship leads but is not a member: a lost shipmate or a hit on it must not run the fleet's own reactions
}

// ---------- Who an escort fights ----------
// active: any enemy near it; normal: an enemy in gun range, one hunting the flagship or an escort, one that hit it;
// passive: only one that hit it or is bearing down on it. Always inside the stance's reach of the flagship.
function escortRetarget(e, now) {
  const P = ESCORT_STANCE[e.stance] || ESCORT_STANCE.normal, lead = player;
  if (!lead.alive || docked) { e.target = null; return; }
  const hitMe = o => e.attacker === o && e.angry > 0;
  const wants = o => {
    const d = dist(e, o), on = o.target;
    if (e.stance === "active") return d < P.aggro;
    if (e.stance === "normal") return d < e.range * P.aggro || on === lead || !!(on && on.ally) || hitMe(o);
    return hitMe(o) || on === e;
  };
  const ok = o => o && o.alive && !o.ally && isHostile(e, o) && !ignoring(e, o, now) && dist(o, lead) <= P.reach * 1.25;
  if (ok(e.target) && wants(e.target)) return;   // stay on the one it has
  let best = null, bd = 1e9;
  for (const o of enemies) {
    if (!ok(o) || dist(o, lead) > P.reach || !wants(o)) continue;
    const d = dist(e, o); if (d < bd) { best = o; bd = d; }
  }
  if (best !== e.target) { e.target = best; if (best) e.chaseFrom = { x: e.x, y: e.y }; }
}
// Station keeping: called from fleetSteer for an "escort" fleet. null = let the class's battle plan steer (it is fighting inside its leash, ESCORT_LEASH from its slot).
function escortSteer(e, f, tg, d, toT, now) {
  const lead = f.lead;
  if (!lead.alive || docked) return null;
  const s = slotOf(f, e), home = s ? slotWorld(fleetFrame(f), s) : lead, away = dist(e, home);   // measured from its own slot, so an outer slot is not always "too far"
  e.retreat = e.stance === "passive" && e.hp < e.maxHp * ESCORT_RETREAT;   // a hurt passive escort keeps to the flagship and does not chase
  if (e.retreat || away > ESCORT_LEASH || !tg) return holdStation(e, f);
  return null;
}
// Twice a second: claw off a rock, and put an escort that fell far behind out of sight back on its station.
function escortTick(dt) {
  if (!escortLive.length || (escortT -= dt) > 0) return;
  escortT = 0.5;
  const now = S.time.now / 1000;
  for (const { e } of escortLive) {
    if (!e.alive || !e.fleet) continue;
    if (e.strayD > 90 && !(e.target && e.target.alive)) unstick(e, now); else e.anchor = null;   // an escort lying to its slot is not stuck: only one that cannot get there
    if (player.alive && dist(e, player) > ESCORT_LOST && !onScreen(e.x, e.y, 160)) {
      const f = e.fleet, s = slotOf(f, e);
      if (s) { const p = safeSlot(slotWorld(fleetFrame(f), s), player); e.x = p.x; e.y = p.y; e.speed = player.speed; e.spr.setPosition(p.x, p.y); }
    }
  }
}

// ---------- Hooks ----------
onHook("sail", deployEscorts);
onHook("frame", dt => { if (!paused && !docked && S && player) escortTick(dt); });
// After the sortie: each escort that sailed is billed (js/escorts.js); what gold cannot cover stays owed.
onHook("dock", () => {
  if (!escortLive.length) return;
  const results = escortLive.map(({ slot, e }) => ({ slot, hpFrac: e.alive ? clamp(e.hp / e.maxHp, 0, 1) : 0, sunk: !e.alive }));
  const lost = escortLive.filter(({ e }) => !e.alive).map(({ e }) => e.allyName), out = billEscorts(save, results);
  save = out.save; escortReport = { paid: out.paid, lost };
  escortLive = [];
});
onHook("sunk", s => { if (s.ally) toast(t("escSunkToast", { name: s.allyName })); });
// A bounty ship the escorts sink without the player's own hit in the last ASSIST_MS (js/campaign.js) still pays nothing: the captain
// has to take part in that fight, so an escort's hit is not the player's assist.
onHook("lang", () => { for (const { e } of escortLive) { const y = save.fleet.find(x => x.id === e.yardId); if (y) e.allyName = escortName(y); if (e.badge) refreshBadge(e); } });
// The chart: escorts are drawn over the other ships, in the friendly colour (js/mini-marks.js miniAlly).
onHook("mini", (c, k, u) => { for (const { e } of escortLive) if (e.alive) miniAlly(c, e.x * k, e.y * k, e.rot, u, e.speed); });
