"use strict";
// ---------- How to play: the chart legend's swatches (strings: js/howto.js ht_chart) ----------
// Each swatch is painted with the very function the chart uses (js/mini-marks.js), so the legend cannot drift from the map.
// A swatch is a small canvas with a data-mark: threat (▼ ● ▲ ▲▲ side by side in a pirate's threat colours), pirate, navy, trade,
// fire, harbor, outpost, fort, chest, wreck, boss, land. The ship swatches show a ▲ (one level stronger), as the chart colours it.
const LEGEND_W = 56, LEGEND_H = 28, LEGEND_U = 4.6;   // CSS px; u = chart units per backing pixel
function paintLegendMark(cv) {
  const dpr = Math.max(2, window.devicePixelRatio || 1), c = cv.getContext("2d"), u = LEGEND_U * dpr / 2;
  cv.width = LEGEND_W * dpr; cv.height = LEGEND_H * dpr;
  const mx = cv.width / 2, my = cv.height / 2, kind = cv.dataset.mark, me = typeof shipRating === "function" ? shipRating() : 1;
  const ship = (faction, arch, d, px = mx) => miniShip(c, { faction, arch, L: me + d, threatL: me + d, speed: 0, rot: 0, merchant: faction === "merchant" }, px, my, u);
  c.clearRect(0, 0, cv.width, cv.height);
  if (kind === "threat") {   // the four threat shapes in a row, one swatch for all of them
    [-1, 0, 1, 2].forEach((d, i) => ship("pirate", "brig", d, cv.width * (0.14 + i * 0.24) + (d === 2 ? u : 0)));
  } else if (kind === "navy") ship("navy", "brig", 1);
  else if (kind === "trade") ship("merchant", "fluyt", 1);
  else if (kind === "fire") ship("pirate", "fireship", 1);
  else if (kind === "pirate") ship("pirate", "brig", 1);
  else if (kind === "harbor") miniHarbor(c, mx, my, u * 0.8);
  else if (kind === "outpost") miniOutpost(c, mx, my, u * 1.1);
  else if (kind === "fort") miniFort(c, mx, my, me + 1, u * 1.1);
  else if (kind === "chest") miniChest(c, mx, my, u * 1.2, false);
  else if (kind === "wreck") miniWreck(c, mx, my, u * 0.8);
  else if (kind === "boss") {
    c.strokeStyle = "rgba(240,199,102,.85)"; c.lineWidth = 1.5 * u; c.beginPath(); c.arc(mx, my, 10 * u * 0.62, 0, TAU); c.stroke();
    c.fillStyle = "#1b1410"; c.beginPath(); c.arc(mx, my, 7.5 * u * 0.62, 0, TAU); c.fill();
    c.strokeStyle = MINI_GOLD; c.lineWidth = 1.3 * u; c.stroke(); drawSkull(c, mx, my + 0.4 * u, 5.5 * u * 0.62);
  } else if (kind === "land") {
    c.fillStyle = ISLAND_FILL; c.beginPath(); c.moveTo(mx - 9 * u, my + 1 * u); c.quadraticCurveTo(mx - 7 * u, my - 6 * u, mx, my - 5 * u); c.quadraticCurveTo(mx + 8 * u, my - 6 * u, mx + 9 * u, my);
    c.quadraticCurveTo(mx + 6 * u, my + 6 * u, mx - 2 * u, my + 5 * u); c.closePath(); c.fill();
  }
}
function paintChartLegend() {
  if (typeof drawSkull !== "function") return;   // langchange fires while the scripts are still loading; the load event paints
  document.querySelectorAll("canvas.sw-mark").forEach(paintLegendMark);
}
document.addEventListener("langchange", paintChartLegend);   // the legend's markup is rebuilt on every language change (js/menu.js)
window.addEventListener("load", paintChartLegend);
