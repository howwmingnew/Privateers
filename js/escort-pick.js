"use strict";
// ---------- Which fights a Normal escort turns down (#121) ----------
// Pure rules for escortRetarget (js/escort-ai.js). Only the Normal stance is careful: Active may still take on anything near it (that is its job), Passive
// fights only what hit it. `mine`: the escort's own rated level (threatL), `theirs`: the target's, `zone`: the sea level where the target floats.
// provoked: the target hit this escort, or is already shooting at the flagship or an escort: then it is a defence and every rule is off.
// navyPeace: the target is Navy and the captain is not wanted (under HEAT_HUNT_FROM stars): the Navy leaves us alone (#120), so we must not start it.
const escortOutclassed = (mine, theirs, zone) => theirs - mine > ESCORT_OVER || zone - mine > ESCORT_OVER;
const escortShuns = (stance, { mine, theirs, zone, provoked, navyPeace }) =>
  stance === "normal" && !provoked && (navyPeace || escortOutclassed(mine, theirs, zone));
// Is the captain wanted enough that the Navy hunts him (so a Navy ship is a fair target)? Heat lives in js/heat.js.
const escortNavyPeace = o => o.faction === "navy" && !(typeof heatStars === "function" && typeof heatNow === "function" && heatStars(heatNow()) >= HEAT_HUNT_FROM);
