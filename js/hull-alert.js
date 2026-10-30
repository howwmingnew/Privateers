"use strict";
// ---------- Hull alerts (#102): the crew's mending explained once, and a plain warning before the hull goes ----------
// The hull mends by itself at sea (js/repair.js): the first time the captain sees it, one line says so. When the hull falls
// under HULL_CRIT_AT a line says it in words (the red vignette and the bell, js/vfx.js, js/main.js, say it in colour and
// sound); it warns again only after the hull has climbed back over HULL_REARM_AT. tipOnce keeps a one-time note across
// sorties in this browser's storage (not the save: nothing there to migrate, and a cleared save shows the notes again).
Object.assign(STR.en, {
  hullMend: "Your crew patches the hull at sea: slowly while sailing, faster while stopped. A harbor mends it fully.",
  hullCrit: "Hull critical! Run or heave to and mend.",
});
Object.assign(STR.zh, {
  hullMend: "船員會在海上自動修補船體：航行時慢，停船時更快；回港則一次修好。",
  hullCrit: "船體危急！快逃，或停船修補。",
});

const HULL_CRIT_AT = 0.25, HULL_REARM_AT = 0.45;
const TIP_KEY = "privateers-tips";
function tipsRead() { try { return JSON.parse(localStorage.getItem(TIP_KEY) || "{}") || {}; } catch (e) { return {}; } }
// True the first time it is asked for `id` (and remembers), false after.
function tipOnce(id) {
  const seen = tipsRead();
  if (seen[id]) return false;
  try { localStorage.setItem(TIP_KEY, JSON.stringify({ ...seen, [id]: 1 })); } catch (e) { /* no storage: the note may show again next time */ }
  return true;
}
// Pure: the alert's state after a frame. armed = it may fire; returns { armed, fire }.
function hullAlertStep(armed, frac) {
  if (armed && frac < HULL_CRIT_AT) return { armed: false, fire: true };
  if (!armed && frac > HULL_REARM_AT) return { armed: true, fire: false };
  return { armed, fire: false };
}

let hullArmed = true;
onHook("frame", () => {
  if (!player || !player.alive || paused || docked || titleOpen) return;
  const a = hullAlertStep(hullArmed, player.hp / player.maxHp);
  hullArmed = a.armed;
  if (a.fire) { toast(t("hullCrit"), true, undefined, TOAST_WARN); sfx("bell", { pitch: 0.35 }); }
  if (typeof repairOn !== "undefined" && repairOn && player.hp < player.maxHp * 0.9 && save.tutorialDone && tipOnce("mend")) toast(t("hullMend"), false, 5200, TOAST_TIP);
});
onHook("sail", () => { hullArmed = true; });
