"use strict";
// ---------- The sea in weather: swell bands on the water, and hulls pitching and rolling (js/weather.js has the clock and the wind) ----------
// Swell: long crest bands (a dark trough, a white crest, foam behind) that travel with the wind, drawn above the sea tiles and
// under everything else, so they never cover a ship, a ball or an aim line. Their number follows the weather: none in fair
// weather, a few in rain, a crowd in a storm.
// Roll: every hull's sprite (the player, the AI, bosses) rolls a few degrees and heaves a little, each on its own phase. It moves
// the picture only: x, y, rot and the hit capsule (hl / hw), the muzzles and every hit test are untouched. Both switch off with
// the weather-effects setting; reduced motion keeps the roll at a quarter of its size.
const WX_WAVES = VFX_LOW ? 8 : 14;
const WX_ROLL = { rad: 0.075, heave: 0.04, quiet: 0.25 };   // roll angle and heave at full storm; the share kept under reduced motion
let wxWaves = [];
const wxSwell = () => (wxLive() && wxFx() ? 0.18 * wx.w.rain + 0.82 * wx.w.storm : 0);   // 0 fair .. 1 full storm (rain alone is ~0.18)

onHook("ready", () => {
  bakeCanvas(S, "wx-wave", 320, 72, 1, c => {
    const r = mulberry32(5), W0 = 320;
    const tr = c.createLinearGradient(0, 0, 0, 34); tr.addColorStop(0, "rgba(4,22,36,0)"); tr.addColorStop(1, "rgba(4,22,36,.34)");   // the trough in front of the crest
    c.fillStyle = tr; c.beginPath(); c.moveTo(0, 34);
    for (let x = 0; x <= W0; x += 8) c.lineTo(x, 34 + Math.sin(x * 0.045) * 3 - 34 * Math.pow(Math.sin(Math.PI * x / W0), 0.6) * 0.9);
    c.lineTo(W0, 34); c.fill();
    const fo = c.createLinearGradient(0, 34, 0, 70); fo.addColorStop(0, "rgba(232,246,250,.3)"); fo.addColorStop(1, "rgba(232,246,250,0)");   // foam laid behind it
    c.fillStyle = fo; c.fillRect(30, 34, W0 - 60, 36);
    c.lineCap = "round";
    for (let x = 6; x < W0 - 6; x += 5) {   // the crest line, thinning to the ends
      const e = Math.pow(Math.sin(Math.PI * x / W0), 0.7), y = 34 + Math.sin(x * 0.045) * 3;
      c.strokeStyle = `rgba(240,250,255,${0.8 * e})`; c.lineWidth = 1.5 + 2.6 * e; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6, y + Math.sin((x + 6) * 0.045) * 3 - Math.sin(x * 0.045) * 3); c.stroke();
    }
    for (let i = 0; i < 70; i++) {   // flecks of spray breaking off the crest
      const x = 20 + r() * (W0 - 40), e = Math.sin(Math.PI * x / W0), y = 34 + Math.sin(x * 0.045) * 3 + (r() - 0.35) * 26 * e;
      c.fillStyle = `rgba(245,252,255,${0.25 + r() * 0.5})`; c.beginPath(); c.arc(x, y, 0.8 + r() * 1.8, 0, TAU); c.fill();
    }
  });
  wxWaves = Array.from({ length: WX_WAVES }, () => ({ img: S.add.image(0, 0, "wx-wave").setDepth(0.6).setVisible(false), age: 0, life: 1, sp: 1, fresh: true }));
});
function wxWaveReset(w, v) {
  w.fresh = false; w.age = 0; w.life = rand(7, 13); w.sp = rand(0.75, 1.25); w.k = rand(1.1, 2.1);
  w.x = v.x + Math.random() * v.width; w.y = v.y + Math.random() * v.height;
  w.img.setScale(w.k * (VFX_LOW ? 1.2 : 1));
}
function wxSwellDraw(dt, I) {
  if (!wxWaves.length) return;
  const v = S.cameras.main.worldView, n = Math.round(WX_WAVES * I), step = !paused && !seaFrozen;
  const dx = Math.cos(wx.wind.dir), dy = Math.sin(wx.wind.dir), speed = (28 + 70 * wx.wind.strength) * (0.6 + 0.6 * I), rot = wx.wind.dir + Math.PI / 2;
  wxWaves.forEach((w, i) => {
    if (i >= n) { if (w.img.visible) w.img.setVisible(false); w.fresh = true; return; }
    if (w.fresh) wxWaveReset(w, v);
    if (step) { w.age += dt; w.x += dx * speed * w.sp * dt; w.y += dy * speed * w.sp * dt; }
    if (w.age > w.life || !v.contains(w.x, w.y) && w.age > 1.5) wxWaveReset(w, v);
    const a = Math.sin(Math.PI * clamp(w.age / w.life, 0, 1));
    w.img.setVisible(true).setPosition(w.x, w.y).setRotation(rot).setAlpha(a * (0.35 + 0.6 * I));
  });
}

// Roll and heave, applied to the sprite after the step has set it, and undone first each frame so a pause cannot pile them up.
function wxRoll(s, I, t) {
  const sp = s.spr;
  if (!sp || !sp.active) return;
  // undo last frame's roll, but only where nobody has set the sprite afresh since (the step resets its rotation, a re-skin its scale)
  if (s.wxR) { if (sp.rotation === s.wxRot) sp.rotation -= s.wxR; if (sp.scaleX === s.wxSc) sp.setScale(sp.scaleX / s.wxK, sp.scaleY / s.wxK); s.wxR = 0; s.wxK = 1; }
  if (I < 0.01 || !s.alive || s.fixed) return;
  const ph = s.wxPh ??= Math.random() * TAU, q = wxReduced ? WX_ROLL.quiet : 1;
  s.wxR = WX_ROLL.rad * I * q * (Math.sin(t * 1.7 + ph) + 0.35 * Math.sin(t * 3.1 + ph * 2));
  s.wxK = 1 + WX_ROLL.heave * I * q * Math.sin(t * 1.15 + ph * 1.3 + 1);
  sp.rotation += s.wxR; sp.setScale(sp.scaleX * s.wxK, sp.scaleY * s.wxK); s.wxRot = sp.rotation; s.wxSc = sp.scaleX;
}
onHook("frame", dt => {
  if (!S || !player || !wxWaves.length) return;
  const I = wxSwell();
  wxSwellDraw(dt, I);
  const t = wx.t;
  if (player.spr) wxRoll(player, I, t);
  for (const e of enemies) wxRoll(e, I, t);
});
