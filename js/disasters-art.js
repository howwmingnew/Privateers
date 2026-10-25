"use strict";
// ---------- Sea disasters: what they look like (all drawn in code) ----------
// One Graphics layer under the ships for the warnings and the wall / spiral / crest, one for the lightning above them, a fog veil over
// everything, a glyph for each kind on the chart and the screen-edge boxes. Warnings are amber and pulse, so they read on any sea tint;
// a hazard's own colour (white foam, blue whirl, grey spout) only shows once it is running. The "weather effects" setting thins the spray.
const DIS_AMBER = 0xffb347, DIS_FOAM = 0xeaf8ff;
const disCull = (x, y, r) => { const v = S.cameras.main.worldView; return x + r < v.x || x - r > v.right || y + r < v.y || y - r > v.bottom; };
const disPulse = () => 0.5 + 0.5 * Math.sin(performance.now() / 160);

onHook("ready", () => {
  dis.g = S.add.graphics().setDepth(4.6);
  dis.top = S.add.graphics().setDepth(11);
  bakeCanvas(S, "dis-fog", 256, 256, 1, c => {   // clear in the middle, a soft wall of white-grey at the rim
    const g = c.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, "rgba(214,224,228,0)"); g.addColorStop(0.5, "rgba(214,224,228,0.22)"); g.addColorStop(0.82, "rgba(214,224,228,0.82)"); g.addColorStop(1, "rgba(214,224,228,0.94)");
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  dis.fogImg = S.add.image(0, 0, "dis-fog").setDepth(12).setVisible(false);
  dis.fogRects = Array.from({ length: 4 }, () => S.add.image(0, 0, "wx-px").setDepth(12).setTint(0xd6e0e4).setVisible(false));
});

function disFog() {
  const lvl = dis.fog, vis = lvl > 0.01;
  dis.fogImg.setVisible(vis); dis.fogRects.forEach(r => r.setVisible(vis));
  if (!vis) return;
  const v = S.cameras.main.worldView, s = disSight(), px = player.x, py = player.y, al = 0.94 * Math.min(1, lvl * 1.4);
  dis.fogImg.setPosition(px, py).setDisplaySize(s * 2, s * 2).setAlpha(Math.min(1, lvl * 1.4));
  const l = px - s, r = px + s, tp = py - s, b = py + s, X0 = v.x - 80, X1 = v.right + 80, Y0 = v.y - 80, Y1 = v.bottom + 80;
  const put = (img, x0, y0, x1, y1) => (x1 > x0 && y1 > y0 ? img.setVisible(true).setPosition((x0 + x1) / 2, (y0 + y1) / 2).setDisplaySize(x1 - x0, y1 - y0).setAlpha(al) : img.setVisible(false));
  put(dis.fogRects[0], X0, Y0, X1, Math.min(tp, Y1)); put(dis.fogRects[1], X0, Math.max(b, Y0), X1, Y1);
  put(dis.fogRects[2], X0, Math.max(tp, Y0), Math.min(l, X1), Math.min(b, Y1)); put(dis.fogRects[3], Math.max(r, X0), Math.max(tp, Y0), X1, Math.min(b, Y1));
}

// ---------- the pieces ----------
function disDashRing(g, x, y, R, col, a, w = 3) {   // a dashed ring
  g.lineStyle(w, col, a);
  const n = 28, off = performance.now() / 900;
  for (let i = 0; i < n; i += 2) { const a0 = (i + off) / n * TAU, a1 = (i + 1 + off) / n * TAU; g.beginPath(); g.arc(x, y, R, a0, a1); g.strokePath(); }
}
function disArrow(g, x, y, dir, len, col, a) {
  const cx = Math.cos(dir), sy = Math.sin(dir), ex = x + cx * len, ey = y + sy * len;
  g.lineStyle(5, col, a); g.lineBetween(x - cx * len, y - sy * len, ex, ey);
  g.fillStyle(col, a); g.fillTriangle(ex + cx * 26, ey + sy * 26, ex - sy * 18, ey + cx * 18, ex + sy * 18, ey - cx * 18);
}
function disSwirl(g, ev, c, t, pal) {   // arms of a spiral, turning the way the water turns
  const arms = ev.kind === "spout" ? 3 : 4, spin = t * 1.6, grow = Math.min(1, (t - ev.t0 + 2) / 2.5);
  g.fillStyle(pal.deep, 0.5 * grow); g.fillCircle(ev.x, ev.y, c.R * 0.55 * grow);
  g.fillStyle(pal.deep, 0.55 * grow); g.fillCircle(ev.x, ev.y, c.core * 1.15);
  for (let k = 0; k < arms; k++) for (let pass = 0; pass < 2; pass++) {
    g.lineStyle(pass ? 3 : 9, pass ? pal.crest : pal.arm, (pass ? 0.8 : 0.4) * grow);
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, r = (c.core * 0.4 + u * c.R * 0.92) * grow, a = k * TAU / arms + spin - u * 4.2;   // the arm trails behind, so the water seems to run inward
      const x = ev.x + Math.cos(a) * r, y = ev.y + Math.sin(a) * r;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.strokePath();
  }
  g.lineStyle(3, DIS_AMBER, 0.5); g.strokeCircle(ev.x, ev.y, c.core);   // the part that hurts
}
function disWallDraw(g, ev, t, dt) {
  const c = DISASTER.tsunami, cx = Math.cos(ev.dir), sy = Math.sin(ev.dir), nx = -sy, ny = cx, h = c.len / 2, f = ev.front, a = Math.min(1, (t - ev.t0) / 1.2);
  const P = (along, side) => [ev.o.x + cx * along + nx * side, ev.o.y + sy * along + ny * side];
  const [x0, y0] = P(f - c.thick, -h), [x1, y1] = P(f, -h), [x2, y2] = P(f, h), [x3, y3] = P(f - c.thick, h);
  g.fillStyle(0x06202e, 0.38 * a); g.fillPoints([{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }], true);   // the trough under the wall
  if (typeof vnWall === "function" && vnWall(g, ev, c, dt, P, f, h, a)) return;   // the picked foam wall (js/vfx-new.js); the trough above stays
  const foam = (back, w, al) => {
    g.lineStyle(w, DIS_FOAM, al * a); g.beginPath();
    for (let i = 0; i <= 30; i++) { const s = -h + i * c.len / 30, [x, y] = P(f - back + Math.sin(i * 0.9 + t * 3) * 7, s); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.strokePath();
  };
  foam(0, 10, 0.95); foam(c.thick * 0.35, 5, 0.6); foam(c.thick * 0.7, 3, 0.35);
}

function disDraw(dt) {
  const g = dis.g, top = dis.top, t = wx.t, pulse = disPulse();
  g.clear(); top.clear(); disFog();
  for (const ev of dis.live) {
    const c = DISASTER[ev.kind], warn = ev.st === "warn", left = Math.max(0, Math.ceil(ev.t0 - t));
    if (ev.txt) {
      const sig = ev.st + left; if (ev.sig !== sig) { ev.sig = sig; ev.txt.setText(warn ? t_s("dis_cd", { name: t_s("dis_" + ev.kind), s: left }) : t_s("dis_" + ev.kind)); }
      ev.txt.setPosition(ev.x, ev.y - (ev.kind === "tsunami" ? 0 : (c.R || 90) + 20));
    }
    if (ev.kind === "fog") continue;
    if (ev.kind === "tsunami") {
      const cx = Math.cos(ev.dir), sy = Math.sin(ev.dir), len = c.travel, mid = { x: ev.o.x + cx * len / 2, y: ev.o.y + sy * len / 2 };
      if (disCull(mid.x, mid.y, len / 2 + c.len / 2)) continue;
      if (warn) {   // the lane the wall will sweep, with chevrons running down it
        const nx = -sy, ny = cx, h = c.len / 2, al = 0.35 + 0.35 * pulse;
        g.lineStyle(4, DIS_AMBER, al);
        for (const s of [-h, h]) for (let d = 0; d < len; d += 90) { if (disCull(ev.o.x + cx * d, ev.o.y + sy * d, 140)) continue; g.lineBetween(ev.o.x + cx * d + nx * s, ev.o.y + sy * d + ny * s, ev.o.x + cx * (d + 45) + nx * s, ev.o.y + sy * (d + 45) + ny * s); }
        for (let d = (performance.now() / 6) % 260; d < len; d += 260) for (let s = -h + 150; s < h; s += 300) disArrow(g, ev.o.x + cx * d + nx * s, ev.o.y + sy * d + ny * s, ev.dir, 30, DIS_AMBER, al * 0.8);
      } else disWallDraw(g, ev, t, dt);
    } else if (ev.kind === "rogue") {
      if (disCull(ev.x, ev.y, c.R + 80)) continue;
      if (warn) { disDashRing(g, ev.x, ev.y, c.R, DIS_AMBER, 0.45 + 0.4 * pulse, 4); g.fillStyle(DIS_AMBER, 0.08 + 0.1 * pulse); g.fillCircle(ev.x, ev.y, c.R); disArrow(g, ev.x - Math.cos(ev.dir) * c.R * 0.5, ev.y - Math.sin(ev.dir) * c.R * 0.5, ev.dir, 70, DIS_AMBER, 0.8); }
      else {   // the crest sweeping across the circle
        const u = clamp((t - ev.t0) / 1.0, 0, 1), cx = Math.cos(ev.dir), sy = Math.sin(ev.dir), f = -c.R * 1.1 + u * c.R * 2.2;
        if (typeof vnCrest === "function") vnCrest(ev, c, f, dt);   // foam puffs along the crest (js/vfx-new.js)
        for (const [w, al, col] of [[16, 0.4, 0x0b3a52], [7, 0.95, DIS_FOAM]]) {
          g.lineStyle(w, col, al * (1 - Math.max(0, u - 0.7) / 0.3)); g.beginPath();
          for (let i = 0; i <= 14; i++) { const s = (i / 14 - 0.5) * c.R * 2.3, bow = -Math.abs(s) * 0.22, x = ev.x + cx * (f + bow) - sy * s, y = ev.y + sy * (f + bow) + cx * s; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
          g.strokePath();
        }
      }
    } else if (ev.kind === "lightning") {
      if (disCull(ev.x, ev.y, 300)) continue;
      if (warn) {
        const k = clamp((ev.t0 - t) / c.warn[1], 0, 1);   // the ring closes in as the stroke nears; it flashes once it has locked
        g.lineStyle(4, 0xfff2a0, 0.5 + 0.5 * pulse); g.strokeCircle(ev.x, ev.y, c.R * (1 + k)); g.fillStyle(0xfff2a0, 0.1 + 0.12 * pulse); g.fillCircle(ev.x, ev.y, c.R);
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + t * 2; g.lineBetween(ev.x + Math.cos(a) * c.R * 0.6, ev.y + Math.sin(a) * c.R * 0.6, ev.x + Math.cos(a + 0.3) * c.R * 1.05, ev.y + Math.sin(a + 0.3) * c.R * 1.05); }
        if (typeof vnBoltFlicker === "function") vnBoltFlicker(top, ev, ev.t0 - t);   // two faint flickers of the coming bolt (js/vfx-new.js)
      } else if (t - ev.t0 < 0.35) {
        const a = 1 - (t - ev.t0) / 0.35;
        vnBoltDraw(top, ev, t - ev.t0);   // forked bolt, violet ball, steam (js/vfx-new.js)
        top.fillStyle(0xffffff, a * 0.5); top.fillCircle(ev.x, ev.y, c.R * (1.3 - a * 0.3));
      }
    } else {   // spout, whirlpool
      if (disCull(ev.x, ev.y, c.R + 60)) continue;
      if (warn) {
        disDashRing(g, ev.x, ev.y, c.R, DIS_AMBER, 0.4 + 0.4 * pulse, 4);
        g.fillStyle(0xff5a3a, 0.1 + 0.12 * pulse); g.fillCircle(ev.x, ev.y, c.core);
        if (ev.kind === "spout") disArrow(g, ev.x + Math.cos(ev.h) * c.R, ev.y + Math.sin(ev.h) * c.R, ev.h, 60, DIS_AMBER, 0.5 + 0.3 * pulse);   // the way it wanders
      } else if (typeof vnSwirl === "function" && vnSwirl(g, ev, c, dt)) { g.lineStyle(3, DIS_AMBER, 0.5); g.strokeCircle(ev.x, ev.y, c.core); }   // spiral column / funnel (js/vfx-new.js); the amber ring is the part that hurts
      else disSwirl(g, ev, c, t, ev.kind === "spout" ? { deep: 0x37454d, arm: 0x8a9aa2, crest: 0xe6f0f2 } : { deep: 0x04121f, arm: 0x1b4f78, crest: 0xbfe8f5 });
    }
  }
}
const t_s = (k, p) => t(k, p);
onHook("lang", () => { for (const e of dis.live) e.sig = ""; });

// ---------- glyphs for the chart and the screen-edge boxes ----------
// A hazard is an amber disc with its own white figure, so it never reads as a ship (ships are the threat shapes, places are the anchor and cross).
function disGlyph(c, kind, x, y, u) {
  const r = 6.5 * u;
  c.fillStyle = MINI_INK; c.beginPath(); c.arc(x, y, r + 1.2 * u, 0, TAU); c.fill();
  c.fillStyle = "#ffb347"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.strokeStyle = MINI_INK; c.fillStyle = MINI_INK; c.lineWidth = 1.5 * u; c.lineCap = "round"; c.lineJoin = "round";
  if (kind === "tsunami" || kind === "rogue") {   // a breaking wave
    c.beginPath(); c.moveTo(x - r * 0.7, y + r * 0.3); c.bezierCurveTo(x - r * 0.4, y - r * 0.9, x + r * 0.5, y - r * 0.8, x + r * 0.7, y - r * 0.1); c.stroke();
    c.beginPath(); c.moveTo(x - r * 0.6, y + r * 0.65); c.lineTo(x + r * 0.6, y + r * 0.65); c.stroke();
    if (kind === "tsunami") { c.beginPath(); c.moveTo(x - r * 0.35, y + r * 0.05); c.lineTo(x + r * 0.2, y + r * 0.05); c.stroke(); }
  } else if (kind === "lightning") {
    c.beginPath(); c.moveTo(x + r * 0.2, y - r * 0.8); c.lineTo(x - r * 0.4, y + r * 0.1); c.lineTo(x + r * 0.05, y + r * 0.1); c.lineTo(x - r * 0.2, y + r * 0.8); c.lineTo(x + r * 0.5, y - r * 0.2); c.lineTo(x + r * 0.05, y - r * 0.2); c.closePath(); c.fill();
  } else {   // a spiral: waterspout and whirlpool
    c.beginPath();
    for (let i = 0; i <= 18; i++) { const a = i * 0.55 + (kind === "spout" ? 0 : 1.6), rr = r * (0.12 + 0.72 * i / 18); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.stroke();
  }
}
onHook("mini", (c, k, u) => {
  for (const ev of disMarks()) {
    const d = DISASTER[ev.kind], x = ev.x * k, y = ev.y * k;
    c.save(); c.globalAlpha = 0.9;
    if (ev.kind === "tsunami") {   // the lane, then the wall
      c.strokeStyle = "rgba(255,179,71,.55)"; c.lineWidth = Math.max(2, d.len * k); c.lineCap = "butt";
      c.beginPath(); c.moveTo(ev.o.x * k, ev.o.y * k); c.lineTo((ev.o.x + Math.cos(ev.dir) * d.travel) * k, (ev.o.y + Math.sin(ev.dir) * d.travel) * k); c.stroke();
    } else {
      c.fillStyle = "rgba(255,179,71,.22)"; c.strokeStyle = "rgba(255,179,71,.9)"; c.lineWidth = 1.2 * u;
      c.beginPath(); c.arc(x, y, Math.max(d.R * k, 3 * u), 0, TAU); c.fill(); c.stroke();
    }
    c.restore(); disGlyph(c, ev.kind, x, y, u * 0.75);
  }
});
