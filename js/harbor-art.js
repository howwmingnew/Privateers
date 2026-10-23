"use strict";
// ---------- Harbour town: quay, houses, piers, lighthouse, buoys, moored ships ----------
// Baked once (bakeHarbor, from drawWorld); the only live parts are the lighthouse beams (sceneryFrame) and three
// moored ships that rock on slow tweens. The east pier is left empty: it is where the player's ship berths.
const PIERS = [[0.05, 18], [Math.PI / 2 + 0.1, 60], [Math.PI - 0.05, 70], [-Math.PI / 2 + 0.08, 60]];
const LIGHTHOUSE_A = -0.78;
function bakeHarbor(sc) {
  const res = artRes(), C = DOCK_R + 26;
  bakeCanvas(sc, "harbor", C * 2, C * 2, res, c => paintHarbor(c, C));
  sc.add.image(PORT.x, PORT.y, "harbor").setScale(1 / res).setDepth(1);
  // lighthouse beams: an additive cone sweeping slowly over the water
  bakeCanvas(sc, "fx-beam", 256, 96, 1, c => {
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "rgba(255,246,205,1)"); g.addColorStop(0.5, "rgba(255,246,205,.35)"); g.addColorStop(1, "rgba(255,246,205,0)");
    c.beginPath(); c.moveTo(0, 46); c.lineTo(256, 0); c.lineTo(256, 96); c.lineTo(0, 50); c.closePath(); c.fillStyle = g; c.fill();
    c.globalCompositeOperation = "destination-in";   // soften the cone's long edges
    const v = c.createLinearGradient(0, 0, 0, 96);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.5, "rgba(0,0,0,1)"); v.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = v; c.fillRect(0, 0, 256, 96);
  });
  const lx = PORT.x + Math.cos(LIGHTHOUSE_A) * PORT_ISLAND_R * 1.02, ly = PORT.y + Math.sin(LIGHTHOUSE_A) * PORT_ISLAND_R * 1.02;
  harborBeams = [0, Math.PI].map(a0 => sc.add.image(lx, ly, "fx-beam").setOrigin(0, 0.5).setDisplaySize(500, 170)
    .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.075).setDepth(2).setData("a0", a0));
  // moored ships, sails furled, rocking gently at three of the piers (the short east pier is the player's berth)
  for (const [pi, cls, liv, side] of [[1, "sloop", "navy", 1], [2, "fluyt", "merchant", -1], [3, "schooner", "merchant", 1]]) {
    const [a, len] = PIERS[pi], key = shipArt(cls, liv, { furled: true }, sc), b = SHIP_ART[cls].beam;
    const d = PORT_ISLAND_R * 0.8 + len * 0.62, off = 8 + b / 2 + 5;
    const x = PORT.x + Math.cos(a) * d - Math.sin(a) * off * side, y = PORT.y + Math.sin(a) * d + Math.cos(a) * off * side;
    const img = sc.add.image(x, y, key).setScale(1 / artResOf(key)).setRotation(a).setDepth(4.2);
    sc.tweens.add({ targets: img, angle: img.angle + rand(1, 1.8), duration: rand(2200, 3200), yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: rand(0, 1500) });
  }
}
function sceneryFrame() {
  const t = S.time.now * 0.00042;
  for (const b of harborBeams) b.setRotation(t + b.getData("a0"));
}
function paintHarbor(c, C) {
  const R = PORT_ISLAND_R, rng = mulberry32(11), wob = a => 1 + 0.025 * Math.sin(a * 5 + 1) + 0.015 * Math.sin(a * 9 + 4);
  const ring = k => { c.beginPath(); for (let i = 0; i <= 90; i++) { const a = i / 90 * TAU, r = R * k * wob(a); c.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r); } c.closePath(); };
  // shallows and surf
  let g = c.createRadialGradient(C, C, R * 0.9, C, C, R + 70);
  g.addColorStop(0, "rgba(130,218,210,.55)"); g.addColorStop(1, "rgba(130,218,210,0)"); c.fillStyle = g; c.fillRect(0, 0, C * 2, C * 2);
  // the docking ring: buoys every 30 degrees on a faint chalk line
  c.save(); c.setLineDash([3, 9]); c.beginPath(); c.arc(C, C, DOCK_R, 0, TAU); c.lineWidth = 1.5; c.strokeStyle = "rgba(246,241,227,.3)"; c.stroke(); c.restore();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.26, x = C + Math.cos(a) * DOCK_R, y = C + Math.sin(a) * DOCK_R;
    dot(c, x + 1.2, y + 1.2, 4.2, "rgba(0,20,30,.35)"); dot(c, x, y, 4, i % 2 ? "#f4efe2" : "#c8352a"); dot(c, x, y, 1.6, i % 2 ? "#c8352a" : "#f4efe2"); dot(c, x - 1.3, y - 1.3, 1, "rgba(255,255,255,.7)");
  }
  c.save(); blur(c, 5, "rgba(255,255,255,.8)"); ring(1.06); c.lineWidth = 2.6; c.strokeStyle = "rgba(255,255,255,.55)"; c.stroke(); c.restore();
  c.fillStyle = "#c7ae78"; ring(1.0); c.fill();
  g = c.createRadialGradient(C - 20, C - 20, 10, C, C, R); g.addColorStop(0, "#efdcaa"); g.addColorStop(1, "#dcc48b"); c.fillStyle = g; ring(0.955); c.fill();
  c.save(); blur(c, 4, "rgba(50,70,25,.5)"); c.fillStyle = "#5f9c56"; ring(0.86); c.fill(); c.restore();
  // piers (under the quay edge so they read as built out from it)
  for (const [a, len] of PIERS) pier(c, C, a, len, rng);
  // stone quay and paved town
  c.save(); blur(c, 4, "rgba(0,0,0,.45)"); c.beginPath(); c.arc(C, C, R * 0.74, 0, TAU); c.fillStyle = "#8f897d"; c.fill(); c.restore();
  g = c.createRadialGradient(C - 15, C - 15, 5, C, C, R * 0.7); g.addColorStop(0, "#cfc5ad"); g.addColorStop(1, "#b0a68f");
  c.beginPath(); c.arc(C, C, R * 0.69, 0, TAU); c.fillStyle = g; c.fill();
  for (let i = 0; i < 260; i++) {   // cobbles
    const a = rng() * TAU, d = Math.sqrt(rng()) * R * 0.67;
    dot(c, C + Math.cos(a) * d, C + Math.sin(a) * d, 0.7 + rng() * 0.7, rng() < 0.5 ? "rgba(255,250,235,.25)" : "rgba(80,70,55,.18)");
  }
  // houses on a ring around the market square, ridges running along the ring
  const roofs = ["#b04a32", "#9a3c28", "#c0673e", "#7d3222", "#b85a35", "#5f6b7a", "#a8452f"];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + 0.35 + (rng() - 0.5) * 0.12, d = 47 + (i % 2) * 6;
    house(c, C + Math.cos(a) * d, C + Math.sin(a) * d, a + Math.PI / 2, 17 + rng() * 6, 11 + rng() * 3, roofs[i % roofs.length], rng);
  }
  for (const [a, d] of [[0.9, 24], [2.6, 25], [4.3, 23]]) {   // market stalls with striped awnings
    const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d;
    c.save(); blur(c, 2, "rgba(0,0,0,.35)"); c.fillStyle = "#efe6cf"; c.fillRect(x - 5, y - 4, 10, 8); c.restore();
    for (let k = 0; k < 3; k++) { c.fillStyle = k % 2 ? "#efe6cf" : ["#2f86c8", "#c8352a", "#4f9c4b"][Math.floor(a) % 3]; c.fillRect(x - 5 + k * 3.4, y - 4, 3.4, 8); }
  }
  dot(c, C, C, 7, "#8f897d"); dot(c, C, C, 5, "#3e6f86"); dot(c, C - 1.5, C - 1.5, 1.5, "rgba(255,255,255,.5)");   // the well
  for (const [a, k] of [[1.95, 0.93], [2.25, 0.95]]) rowboat(c, C + Math.cos(a) * R * k, C + Math.sin(a) * R * k, a + 1.3);
  lighthouse(c, C + Math.cos(LIGHTHOUSE_A) * R * 1.02, C + Math.sin(LIGHTHOUSE_A) * R * 1.02, rng);
}
function pier(c, C, a, len, rng) {
  const r0 = PORT_ISLAND_R * 0.7, w = 8;
  c.save(); c.translate(C, C); c.rotate(a);
  c.save(); blur(c, 3, "rgba(0,0,0,.45)"); c.fillStyle = "#6e4826"; c.fillRect(r0, -w, PORT_ISLAND_R * 0.3 + len, w * 2); c.restore();
  for (let x = r0; x < r0 + PORT_ISLAND_R * 0.3 + len; x += 2.6) { c.fillStyle = rng() < 0.5 ? "#94643a" : "#865a33"; c.fillRect(x, -w + 0.6, 2.2, w * 2 - 1.2); }
  for (let x = r0 + 14; x < r0 + PORT_ISLAND_R * 0.3 + len; x += 12) for (const s of [-1, 1]) dot(c, x, s * (w + 0.6), 1.5, "#3e2814");
  const end = r0 + PORT_ISLAND_R * 0.3 + len;
  for (const s of [-1, 1]) { dot(c, end - 3, s * (w - 2.5), 1.6, "#2a1a0e"); }   // bollards
  if (rng() < 0.7) { c.fillStyle = "#a9814f"; c.fillRect(end - 22, -5, 6, 6); c.strokeStyle = "#5a3a1c"; c.lineWidth = 0.6; c.strokeRect(end - 22, -5, 6, 6); dot(c, end - 12, 3, 2.6, "#6b4425"); }
  c.restore();
}
function house(c, x, y, rot, w, h, roof, rng) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.save(); blur(c, 2.5, "rgba(0,0,0,.45)"); c.shadowOffsetX = c.shadowOffsetY = 2 * BLURK; c.fillStyle = roof; c.fillRect(-w / 2, -h / 2, w, h); c.restore();
  // the half of the roof whose slope faces the top-left light is lighter
  const ny = -Math.cos(rot), nx = Math.sin(rot);   // world direction of the local -y half
  const lit = nx * -0.707 + ny * -0.707 > 0;
  c.fillStyle = shade(roof, lit ? 0.18 : -0.12); c.fillRect(-w / 2, -h / 2, w, h / 2);
  c.fillStyle = shade(roof, lit ? -0.12 : 0.18); c.fillRect(-w / 2, 0, w, h / 2);
  for (let k = 1; k < 4; k++) { const yy = -h / 2 + h * k / 4; line(c, -w / 2, yy, w / 2, yy, 0.4, "rgba(0,0,0,.15)"); }   // tile courses
  line(c, -w / 2, 0, w / 2, 0, 0.9, shade(roof, 0.3));   // ridge
  const cx = -w / 2 + 3 + rng() * (w - 6); c.fillStyle = "#5a4e44"; c.fillRect(cx - 1.4, -h / 2 + 1, 2.8, 2.8);   // chimney
  c.restore();
}
function rowboat(c, x, y, rot) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.ellipse(0, 0, 6, 2.6, 0, 0, TAU); c.fillStyle = "#8a5a30"; c.fill(); c.lineWidth = 0.7; c.strokeStyle = "#4a2f1a"; c.stroke();
  c.beginPath(); c.ellipse(0, 0, 4.8, 1.7, 0, 0, TAU); c.fillStyle = "#c79a62"; c.fill();
  line(c, -1.5, -1.8, -1.5, 1.8, 0.6, "#4a2f1a"); line(c, 1.5, -1.8, 1.5, 1.8, 0.6, "#4a2f1a");
  c.restore();
}
function lighthouse(c, x, y, rng) {
  for (let i = 0; i < 5; i++) rock(c, x + (rng() - 0.5) * 22, y + (rng() - 0.5) * 22, 4 + rng() * 4, rng);
  c.save(); blur(c, 4, "rgba(0,0,0,.5)"); c.shadowOffsetX = c.shadowOffsetY = 2.5 * BLURK; dot(c, x, y, 10, "#f2eee4"); c.restore();
  const g = c.createRadialGradient(x - 3, y - 3, 1, x, y, 10); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#d8d2c2");
  dot(c, x, y, 10, g);
  c.beginPath(); c.arc(x, y, 7.6, 0, TAU); c.lineWidth = 2.2; c.strokeStyle = "#c8352a"; c.stroke();
  c.beginPath(); c.arc(x, y, 5.2, 0, TAU); c.lineWidth = 0.9; c.strokeStyle = "#2a2a2a"; c.stroke();   // gallery rail
  const lg = c.createRadialGradient(x, y, 0, x, y, 6); lg.addColorStop(0, "rgba(255,250,215,1)"); lg.addColorStop(1, "rgba(255,210,110,0)");
  dot(c, x, y, 6, lg); dot(c, x, y, 2, "#fff6cf");
}
