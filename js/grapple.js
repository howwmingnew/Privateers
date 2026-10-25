"use strict";
// ---------- Grapple: the rope between the flagship and a prize is a spring (#69) ----------
// Once the hooks catch (a struck ship within BOARD_HOOK_GAP, not passing too fast) the rope reels the flagship toward the prize:
// the pull grows with the stretch (BOARD_PULL_K) and with the flagship's drift past the prize (BOARD_PULL_MATCH), capped at
// BOARD_PULL_MAX px/s, so a boarding party needs no fine steering to stay alongside for BOARD_T seconds. The pull is a velocity
// of its own, added to the flagship's position after the hull's: it never enters vx / vy, so js/collision.js does not read it
// as a blow. To get free, sail straight away at BOARD_SNAP_FRAC of full speed for BOARD_SNAP_T seconds (strain builds, and eases
// off BOARD_STRAIN_DECAY times faster when you stop), or stretch the rope past BOARD_ROPE_MAX; a slow retreat is only reeled
// back. js/boarding.js owns the state (hooked, pull, strain), the rope's drawing, and its sound and snap. All pure here.
const relVel = (p, e) => ({ x: (p.vx || 0) - (e.vx || 0), y: (p.vy || 0) - (e.vy || 0) });
// px between the two hull circles (negative: overlapping)
const grappleGap = (p, e) => dist(p, e) - shipRadius(p) - shipRadius(e);
// Do the hooks catch? Near enough, and not racing past.
const canHook = (p, e) => grappleGap(p, e) < BOARD_HOOK_GAP && Math.hypot(relVel(p, e).x, relVel(p, e).y) < BOARD_HOOK_V;
// The pull velocity after dt: it eases toward what the spring asks for (reel in the stretch, cancel the drift), capped.
function grapplePull(pv, p, e, dt) {
  const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, stretch = Math.max(0, grappleGap(p, e) - BOARD_REST);
  const rv = relVel(p, e);
  let wx = (dx / d) * BOARD_PULL_K * stretch - BOARD_PULL_MATCH * rv.x, wy = (dy / d) * BOARD_PULL_K * stretch - BOARD_PULL_MATCH * rv.y;
  const m = Math.hypot(wx, wy);
  if (m > BOARD_PULL_MAX) { wx *= BOARD_PULL_MAX / m; wy *= BOARD_PULL_MAX / m; }
  const k = Math.min(1, BOARD_PULL_RESP * dt);
  return { x: pv.x + (wx - pv.x) * k, y: pv.y + (wy - pv.y) * k };
}
// How fast the flagship is sailing straight away from the prize (px/s, negative: toward her).
function awaySpeed(p, e) {
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, rv = relVel(p, e);
  return (rv.x * dx + rv.y * dy) / d;
}
// Strain after dt: builds while the flagship runs for it at full speed, eases off faster when she does not.
const grappleStrain = (strain, p, e, dt) => (awaySpeed(p, e) >= BOARD_SNAP_FRAC * (p.maxSpeed || 1) ? strain + dt : Math.max(0, strain - dt * BOARD_STRAIN_DECAY));
// Does the rope part? A long enough run at full speed, or a rope stretched past its length.
const grappleParts = (strain, p, e) => strain >= BOARD_SNAP_T || grappleGap(p, e) > BOARD_ROPE_MAX;
