"use strict";
// ---------- Chart marks (the HUD chart, js/hud.js) ----------
// Every mark sits on a dark outline so it reads on any sea tint. Threat is always the shape (▼ ● ▲ ▲▲, threatMark in
// js/art.js); what kind of ship or place it is shows in the frame around it, so colour is never the only cue.
// Sizes are in chart units: u is one pixel of the original 224-px chart.
const MINI_INK = "rgba(4,18,24,.9)", MINI_CREAM = "#f6f1e3", MINI_GOLD = "#f0c766";

// A ship under way leaves a short wake behind it, so the chart shows where it is heading.
function miniWake(c, x, y, rot, u) {
  c.strokeStyle = "rgba(246,241,227,.55)"; c.lineWidth = 1.2 * u;
  c.beginPath(); c.moveTo(x - Math.cos(rot) * 5 * u, y - Math.sin(rot) * 5 * u); c.lineTo(x - Math.cos(rot) * 10 * u, y - Math.sin(rot) * 10 * u); c.stroke();
}
// Pirates fly the bare threat shape; navy ships sit in a pale diamond (the King's colours), merchants in a gold
// coin ring (prey), fireships in a flickering flame ring.
function miniShip(c, e, x, y, u) {
  const tier = threatTier(e.threatL ?? e.L), r = 4 * u;
  if (e.speed > 5) miniWake(c, x, y, e.rot, u);
  const trade = e.merchant || e.faction === "merchant";
  if (trade) {
    c.strokeStyle = "rgba(240,199,102,.8)"; c.lineWidth = 1.2 * u; c.beginPath(); c.arc(x, y, 6 * u, 0, TAU); c.stroke();
  } else if (e.faction === "navy") {
    const d = 7.5 * u;
    c.beginPath(); c.moveTo(x, y - d); c.lineTo(x + d, y); c.lineTo(x, y + d); c.lineTo(x - d, y); c.closePath();
    c.fillStyle = "rgba(20,40,70,.6)"; c.fill(); c.strokeStyle = "#cfe0f5"; c.lineWidth = 1.5 * u; c.stroke();
  } else if (e.arch === "fireship") {
    const f = 0.75 + 0.25 * Math.sin(performance.now() / 90 + x);
    c.strokeStyle = `rgba(255,140,40,${f})`; c.lineWidth = 2 * u;
    c.beginPath(); c.arc(x, y, 7 * u, 0, TAU); c.stroke();
  }
  threatMark(c, x, y, tier, trade || e.faction === "navy" ? r * 0.85 : r);
}
// A shore battery: a crenellated stone keep with its threat shape on the wall. Shown from the start, so the
// player can see which islands are armed before sailing into range.
function miniFort(c, x, y, L, u) {
  const w = 6.5 * u, h = 5 * u, m = 2.6 * u, top = y - h + m;
  c.beginPath(); c.moveTo(x - w, y + h); c.lineTo(x - w, y - h);
  for (const [a, b] of [[-w + m, -w + 2 * m - 0.4 * u], [w - 2 * m + 0.4 * u, w - m]]) {   // two gaps between three merlons
    c.lineTo(x + a, y - h); c.lineTo(x + a, top); c.lineTo(x + b, top); c.lineTo(x + b, y - h);
  }
  c.lineTo(x + w, y - h); c.lineTo(x + w, y + h); c.closePath();
  c.fillStyle = "#8f8a7e"; c.fill(); c.lineWidth = 1.5 * u; c.strokeStyle = MINI_INK; c.stroke();
  threatMark(c, x, y + 1.2 * u, threatTier(L), 2.8 * u);
}
// Plunder: a gold chest (a fort's treasure is a bigger one). The player's own lost cargo is a red X in a pulsing ring.
function miniChest(c, x, y, u, big) {
  const s = (big ? 1.4 : 1) * u, w = 3.2 * s, h = 2.4 * s;
  c.fillStyle = MINI_GOLD; c.strokeStyle = MINI_INK; c.lineWidth = 1.2 * u;
  c.beginPath(); c.rect(x - w, y - h, 2 * w, 2 * h); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(x - w, y - h * 0.15); c.lineTo(x + w, y - h * 0.15); c.stroke();   // the lid
  c.fillStyle = MINI_INK; c.fillRect(x - 0.7 * s, y - h * 0.15 - 0.6 * s, 1.4 * s, 1.6 * s);   // the lock
}
function miniWreck(c, x, y, u) {
  const r = 4.5 * u, p = 1 + 0.2 * Math.sin(performance.now() / 300);
  c.strokeStyle = "rgba(255,90,60,.7)"; c.lineWidth = 1.3 * u; c.beginPath(); c.arc(x, y, 8.5 * u * p, 0, TAU); c.stroke();
  const cross = () => { c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); };
  c.lineCap = "round";
  c.strokeStyle = MINI_INK; c.lineWidth = 4.5 * u; cross();
  c.strokeStyle = "#ff5a3c"; c.lineWidth = 2.5 * u; cross();
  c.lineCap = "butt";
}
// The home harbor: a cream anchor on a dark disc (drawn once into the chart's base layer).
function miniHarbor(c, x, y, u) {
  c.fillStyle = MINI_INK; c.beginPath(); c.arc(x, y, 8 * u, 0, TAU); c.fill();
  c.strokeStyle = MINI_GOLD; c.lineWidth = 1.2 * u; c.stroke();
  c.strokeStyle = MINI_CREAM; c.lineWidth = 1.5 * u; c.lineCap = "round";
  c.beginPath(); c.arc(x, y - 4.2 * u, 1.3 * u, 0, TAU); c.stroke();   // the ring
  c.beginPath(); c.moveTo(x, y - 2.9 * u); c.lineTo(x, y + 4.6 * u);   // the shank
  c.moveTo(x - 2.8 * u, y - 1.4 * u); c.lineTo(x + 2.8 * u, y - 1.4 * u); c.stroke();   // the stock
  c.beginPath(); c.arc(x, y + 0.6 * u, 4 * u, Math.PI * 0.15, Math.PI * 0.85); c.stroke();   // the arms
  c.lineCap = "butt";
}
// The outpost: a gold pennant on a pole, on a dark square (a built place, not a ship).
function miniOutpost(c, x, y, u) {
  const s = 6 * u;
  c.fillStyle = MINI_INK; c.beginPath(); c.rect(x - s, y - s, 2 * s, 2 * s); c.fill();
  c.strokeStyle = MINI_CREAM; c.lineWidth = 1.2 * u; c.stroke();
  c.strokeStyle = MINI_CREAM; c.lineWidth = 1.4 * u; c.beginPath(); c.moveTo(x - 2.5 * u, y + 4 * u); c.lineTo(x - 2.5 * u, y - 4 * u); c.stroke();
  c.fillStyle = MINI_GOLD; c.beginPath(); c.moveTo(x - 2.5 * u, y - 4 * u); c.lineTo(x + 4 * u, y - 2 * u); c.lineTo(x - 2.5 * u, y); c.closePath(); c.fill();
}
// The player: a white hull (sharp bow, square stern) with a heading line ahead, on a soft halo so it is found at a glance.
function miniPlayer(c, x, y, rot, u) {
  c.save();
  c.fillStyle = "rgba(255,255,255,.16)"; c.beginPath(); c.arc(x, y, 11 * u, 0, TAU); c.fill();
  c.translate(x, y); c.rotate(rot); c.scale(u, u);
  c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 1.2; c.setLineDash([2, 2]);
  c.beginPath(); c.moveTo(10, 0); c.lineTo(17, 0); c.stroke(); c.setLineDash([]);
  c.beginPath(); c.moveTo(9, 0); c.quadraticCurveTo(3, -4.8, -6, -4); c.lineTo(-6, 4); c.quadraticCurveTo(3, 4.8, 9, 0); c.closePath();
  c.fillStyle = "#fff"; c.fill(); c.lineWidth = 1.6; c.strokeStyle = MINI_INK; c.stroke();
  c.fillStyle = "#c08f2e"; c.beginPath(); c.arc(0.5, 0, 1.6, 0, TAU); c.fill();   // the mast
  c.restore();
}
