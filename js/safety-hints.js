"use strict";
// ---------- Safety hints (#114): the way home when the hull is low, a nudge back during the lesson, the edge of the chart ----------
// All three read the ship's place only; the warnings go through the toast queue (js/notices.js: priority, one at a time, held under a banner), the way-home
// chip is a fixed box under the HUD bars (css/safety.css) that never takes input. The sea warning ahead of a dangerous sea is in js/novice.js.
Object.assign(STR.en, {
  homeChip: "Harbor {n} m",
  tutStray: "You are far from the harbor. The lesson is easier close to port: turn back toward the ⚓.",
  chartEdge: "Edge of the chart: the sea ends here. Turn back.",
});
Object.assign(STR.zh, {
  homeChip: "回港 {n} 公尺",
  tutStray: "你離港很遠了。教學在港口附近比較好上手：掉頭朝 ⚓ 的方向回去吧。",
  chartEdge: "海圖盡頭：前面沒有海了，請掉頭。",
});

const HOME_HULL = 0.4;        // under this share of hull the way home stays on the screen
const HOME_MIN_D = 500;       // px: that close the harbor is in sight, no chip (the harbor zone is SAFE_R)
const TUT_STRAY_R = 1500;     // px: during the lesson, farther than this from the harbor earns a nudge (inside the practice waters, NOVICE_PORT_R)
const TUT_STRAY_GAP = 25;     // s between nudges while the captain stays out
const CHART_EDGE_NEAR = 160, CHART_EDGE_CLEAR = 420;   // px from the map's border: the hint shows inside the first, may show again after the captain has been farther than the second

// Pure: the share of hull left under which the chip shows, and the chip's heading (rad, screen: x right, y down) toward the harbor.
const homeChipOn = (hpFrac, d) => hpFrac < HOME_HULL && d > HOME_MIN_D;
const homeHeading = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
// Pure: px to the nearest border of the map, and whether the ship is moving toward it (vx, vy px/s).
function chartEdgeInfo(x, y, vx, vy, w = W, h = H) {
  const l = x, r = w - x, t0 = y, b = h - y, m = Math.min(l, r, t0, b);
  const out = (l === m && vx < 0) || (r === m && vx > 0) || (t0 === m && vy < 0) || (b === m && vy > 0);
  return { d: m, out };
}

const homeChip = document.createElement("div");
homeChip.id = "homeChip"; homeChip.hidden = true; homeChip.setAttribute("role", "status"); homeChip.setAttribute("aria-live", "off");
homeChip.innerHTML = '<i aria-hidden="true"></i><span></span>';
document.body.append(homeChip);
const homeArrow = homeChip.querySelector("i"), homeText = homeChip.querySelector("span");
let homeShown = "", strayT = 0, edgeShown = false, safetyT = 0;
function homeChipTick(live) {
  const d = live ? dist(player, PORT) : 0, on = live && homeChipOn(player.hp / player.maxHp, d);
  if (homeChip.hidden === on) homeChip.hidden = !on;
  if (!on) { homeShown = ""; return; }
  const txt = t("homeChip", { n: edgeMeters(d) });
  if (txt !== homeShown) { homeShown = txt; homeText.textContent = txt; }
  homeArrow.style.transform = `rotate(${homeHeading(player, PORT)}rad)`;
}
function safetyTick(dt) {
  const live = !!player && player.alive && !docked && !titleOpen && !!save;
  homeChipTick(live);
  strayT = Math.max(0, strayT - dt);
  if (!live) return;
  if (strayT <= 0 && typeof tutorialRunning === "function" && tutorialRunning() && dist(player, PORT) > TUT_STRAY_R) { strayT = TUT_STRAY_GAP; toast(t("tutStray")); }
  const e = chartEdgeInfo(player.x, player.y, player.vx || 0, player.vy || 0);
  if (edgeShown && e.d > CHART_EDGE_CLEAR) edgeShown = false;
  if (!edgeShown && e.out && e.d < CHART_EDGE_NEAR) { edgeShown = true; toast(t("chartEdge"), true, 3200, TOAST_WARN); }
}
onHook("frame", dt => { if (paused) return; if ((safetyT -= dt) > 0) return; safetyT = 0.25; safetyTick(0.25); });
onHook("sail", () => { strayT = 0; edgeShown = false; });
onHook("lang", () => { homeShown = ""; });
