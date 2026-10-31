"use strict";
// ---------- Which fights an escort turns down (#121, #143) ----------
// Pure rules for escortRetarget (js/escort-ai.js). No escort starts a fight with the Navy, in any stance and at any Wanted stars (#143); the Normal stance
// also turns down fights it would lose, while Active may take on any other ship near it (that is its job) and Passive fights only what hit it.
// `mine`: the escort's own rated level (threatL), `theirs`: the target's, `zone`: the sea level where the target floats, `navy`: the target is a Navy ship.
// provoked: the target hit this escort, or is already shooting at the flagship or an escort: then it is a defence and every rule is off.
const escortOutclassed = (mine, theirs, zone) => theirs - mine > ESCORT_OVER || zone - mine > ESCORT_OVER;
const escortShuns = (stance, { mine, theirs, zone, provoked, navy }) =>
  !provoked && (navy || (stance === "normal" && escortOutclassed(mine, theirs, zone)));
