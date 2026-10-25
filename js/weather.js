"use strict";
// ---------- Wind, weather and the hour of day, on the sea ----------
// js/weather-core.js holds the maths; this file keeps the clock, applies the wind to hulls and balls (ships.js and main.js ask
// wxMul / wxYaw / wxLee / wxDrift), draws the sky (a tint under the ships, rain, lightning), reports to the sound (Snd.setWeather)
// and shows the wind dial in the HUD. The wind and the storm's push are gameplay and never depend on the "weather effects"
// setting, so a daily sea plays the same for everyone; that setting only turns off the rain, tint, lightning and weather sounds.
// Nothing here is saved. A sortie draws a seed when it sails; a daily or seeded run uses its own seed and run clock (js/run.js).
Object.assign(STR.en, {
  wx_clear: "Clear", wx_rain: "Rain", wx_storm: "Storm", hr_day: "Day", hr_dusk: "Dusk", hr_night: "Moonlit",
  wx_kn: "kn", wx_label: "Wind {kn} knots. {fx} speed on this heading. {wx}, {hr}.", wx_toastStorm: "A storm is rolling in!",
});
Object.assign(STR.zh, {
  wx_clear: "晴", wx_rain: "雨", wx_storm: "暴風雨", hr_day: "白天", hr_dusk: "黃昏", hr_night: "月夜",
  wx_kn: "節", wx_label: "風速 {kn} 節。這個航向的速度 {fx}。{wx}，{hr}。", wx_toastStorm: "暴風雨來了！",
});

const wx = { on: false, seed: 1, t: 0, easy: false, w: { kind: "clear", rain: 0, storm: 0, hour: "day", spell: 0 }, wind: { dir: 0, strength: 0.3 },
  calm: false, sway: 0, kind: "clear", bolt: -1, nextBolt: 6, dropT: 0 };
const wxFx = () => SETTINGS.weatherFx !== false;
const wxLive = () => wx.on && !docked && !titleOpen;
const WX_ZERO = { x: 0, y: 0 }, wxLeeV = { x: 0, y: 0 }, wxDriftV = { x: 0, y: 0 };

// ---------- what the hull feels (called per ship from js/ships.js move / steer and js/main.js) ----------
const wxFactor = (rot, own) => windFactor(rot, wx.wind, own ? gearMul("tail") : 1, own ? gearCut("head") : 1);   // the player's sails may be geared (js/gear-core.js)
const wxMul = s => (wx.on && !docked ? wxFactor(s.rot, s.isPlayer) : 1);
function wxYaw(s) {
  if (!wxLive() || wx.w.storm < 0.02 || (s.isPlayer && wx.calm)) return 0;
  return stormYaw(s.rot, wx.wind, wx.w.storm, wx.sway) * (s.isPlayer ? gearCut("storm") : 1);   // navigation instruments hold her head up
}
function wxLee(s) {
  if (!wxLive() || wx.w.storm < 0.02 || (s.isPlayer && wx.calm)) return WX_ZERO;
  return Object.assign(wxLeeV, stormLeeway(wx.wind, wx.w.storm));
}
function wxDrift() { return wxLive() && wx.w.storm > 0.02 ? Object.assign(wxDriftV, ballDrift(wx.wind, wx.w.storm)) : WX_ZERO; }

// A new sortie: a fresh seed (the run's own in a daily or seeded run), the clock at zero. The first voyage is always a fair day.
onHook("sail", () => {
  wx.seed = typeof runActive === "function" && runActive() ? run.seed : wxNewSeed();
  wx.t = 0; wx.on = true; wx.bolt = -1; wx.nextBolt = rand(4, 9); wx.kind = "clear";
  wx.easy = !(typeof runActive === "function" && runActive()) && !save.tutorialDone;
  wxCompute();
});
onHook("dock", () => { wx.on = false; });

function wxCompute() {
  const w = weatherAt(wx.seed, wx.t);
  if (wx.easy) Object.assign(w, { kind: "clear", rain: 0, storm: 0, hour: "day" });
  wx.w = w; wx.wind = windAt(wx.seed, wx.t, w);
  wx.sway = Math.sin(wx.t * 0.7) * 0.6 + Math.sin(wx.t * 1.9 + 1) * 0.4;
}
// Is the player within a hull's breathing room of a coast? Neither the yaw nor the leeway act there, so a gale never
// shoves a ship onto the rocks or pins it against them.
function wxCalmCheck() {
  let near = false;
  const gap = isl => Math.hypot(isl.x - player.x, isl.y - player.y) - isl.r;
  for (const isl of islands) if (gap(isl) < WEATHER.calmRadius) { near = true; break; }
  wx.calm = near || gap({ x: PORT.x, y: PORT.y, r: PORT_ISLAND_R }) < WEATHER.calmRadius;
}

// ---------- the sky: a tint under the ships, rain, lightning ----------
let wxWarm, wxTintHour, wxTintWx, wxFlash, wxDrops = [], wxDialEl = null, wxDialT = 0, wxCalmT = 0;
const WX_TINT = { day: [0xffffff, 0], dusk: [0xff5a14, 0.37], night: [0x060f2a, 0.64] };
const wxMixCol = (a, b, k) => {
  const r = (a >> 16 & 255) + ((b >> 16 & 255) - (a >> 16 & 255)) * k, g = (a >> 8 & 255) + ((b >> 8 & 255) - (a >> 8 & 255)) * k, l = (a & 255) + ((b & 255) - (a & 255)) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(l);
};
const wxReduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } })();
const WX_DROPS = VFX_LOW ? 70 : 140;

function wxBuildSky(sc) {
  bakeCanvas(sc, "wx-px", 4, 4, 1, c => { c.fillStyle = "#fff"; c.fillRect(0, 0, 4, 4); });
  bakeCanvas(sc, "wx-drop", 4, 22, 1, c => {   // one rain streak: bright head, fading tail
    const g = c.createLinearGradient(0, 0, 0, 22); g.addColorStop(0, "rgba(220,240,250,0)"); g.addColorStop(1, "rgba(235,248,255,1)");
    c.fillStyle = g; c.fillRect(1, 0, 2, 22);
  });
  // the tint sits above the sea and the islands but below every ship, ball and aim line: a dark night never dims what you must read
  const wxQuad = d => sc.add.image(0, 0, "wx-px").setDepth(d).setVisible(false);
  wxTintHour = wxQuad(3.5); wxWarm = wxQuad(3.55).setBlendMode(Phaser.BlendModes.ADD); wxTintWx = wxQuad(3.6);
  wxFlash = wxQuad(30).setTint(0xe8f1ff);
  wxDrops = Array.from({ length: WX_DROPS }, () => ({ img: sc.add.image(0, 0, "wx-drop").setDepth(8.5).setVisible(false), x: 0, y: 0, sp: rand(0.85, 1.2), fresh: true }));
}
function wxCover(img, v, col, alpha) {
  if (alpha < 0.004) { img.setVisible(false); return; }
  img.setVisible(true).setTint(col).setAlpha(alpha).setPosition(v.centerX, v.centerY).setDisplaySize(v.width + 160, v.height + 160);
}
function wxSky(dt, live, fx) {
  const v = S.cameras.main.worldView, rain = live && fx ? wx.w.rain : 0, storm = live && fx ? wx.w.storm : 0;
  const [hc, ha] = live && fx ? WX_TINT[wx.w.hour] : [0, 0];
  wxCover(wxTintHour, v, hc, ha);
  wxCover(wxWarm, v, 0xff7a30, wx.w.hour === "dusk" && live && fx ? 0.13 : 0);   // dusk: a golden glow on top of the red, so the sea reads orange, not grey
  wxCover(wxTintWx, v, wxMixCol(0x2a3d4d, 0x0f1a24, storm), 0.2 * rain + 0.2 * storm);
  if (S.sea1) { const k = 0.36 + 0.14 * storm, k2 = 0.2 + 0.12 * storm; S.sea1.setAlpha(k); if (S.sea2) S.sea2.setAlpha(k2); }   // higher, whiter swell
  // lightning: a double flash, thunder a beat behind it
  if (live && fx && storm > 0.5 && !paused && !seaFrozen) {
    wx.nextBolt -= dt;
    if (wx.nextBolt <= 0) { wx.nextBolt = rand(4, 11); wx.bolt = 0; if (typeof Snd !== "undefined") Snd.play("thunder", { delay: rand(0.3, 1.4) }); }
  }
  if (wx.bolt >= 0 && !seaFrozen) wx.bolt += dt;
  const b = wx.bolt, amp = wxReduced ? 0.12 : 0.3;
  const a = b < 0 ? 0 : amp * Math.exp(-b * 16) + (b > 0.22 ? amp * 0.6 * Math.exp(-(b - 0.22) * 16) : 0);
  if (b > 0.8) wx.bolt = -1;
  if (a > 0.004) wxFlash.setVisible(true).setAlpha(a).setPosition(v.centerX, v.centerY).setDisplaySize(v.width + 160, v.height + 160); else wxFlash.setVisible(false);
  // rain: streaks in world space, slanted by the wind, recycled across the view
  const n = Math.round(WX_DROPS * rain);
  const sl = wx.wind.strength, vx = Math.cos(wx.wind.dir) * sl * 420, vy = 950 + Math.sin(wx.wind.dir) * sl * 260, ang = Math.atan2(vy, vx) - Math.PI / 2;
  const zk = clamp((typeof VIEW !== "undefined" ? VIEW.dpr : 1) / S.cameras.main.zoom, 1, 2.4), step = !seaFrozen && !paused;
  wxDrops.forEach((d, i) => {
    if (i >= n) { if (d.img.visible) d.img.setVisible(false); return; }
    if (step && !d.fresh) { d.x += vx * d.sp * dt; d.y += vy * d.sp * dt; }
    if (d.fresh || d.y > v.bottom + 30 || d.x < v.x - 80 || d.x > v.right + 80 || d.y < v.y - 120) {
      d.fresh = false;
      d.y = d.y > v.bottom + 30 || !d.img.visible ? v.y + Math.random() * v.height : v.y - Math.random() * 60;
      d.x = v.x - 60 + Math.random() * (v.width + 120);
    }
    d.img.setVisible(true).setPosition(d.x, d.y).setRotation(ang).setAlpha(0.3 + 0.25 * storm).setScale(zk, zk * (0.8 + sl * 0.6));
  });
}

// ---------- the wind dial ----------
const WX_DIAL_HTML = `<svg viewBox="-26 -26 52 52" aria-hidden="true"><circle class="wd-ring" r="23"/><path class="wd-ticks" d="M0-23v-3M0 23v3M-23 0h-3M23 0h3"/>
  <g class="wd-hd"><path d="M0-23.5l3 4.5h-6z"/></g>
  <g class="wd-arrow"><path class="wd-shaft" d="M0 12V-14"/><path class="wd-flow" d="M0 12V-14"/><path class="wd-head" d="M0-19l7 9h-4v6h-6v-6h-4z"/></g></svg>
  <span class="wd-txt"><b class="wd-kn"></b><span class="wd-fx"></span><small class="wd-wx"></small></span>`;
function wxBuildDial() {
  const bars = document.querySelector("#hud .bars");
  if (!bars || document.getElementById("windDial")) return;
  wxDialEl = document.createElement("div");
  wxDialEl.id = "windDial"; wxDialEl.setAttribute("role", "img"); wxDialEl.innerHTML = WX_DIAL_HTML;
  bars.appendChild(wxDialEl);
  wxDialEl.q = { arrow: wxDialEl.querySelector(".wd-arrow"), hd: wxDialEl.querySelector(".wd-hd"), kn: wxDialEl.querySelector(".wd-kn"), fx: wxDialEl.querySelector(".wd-fx"), wx: wxDialEl.querySelector(".wd-wx") };
  wxDialEl.sig = "";
}
function wxDial() {
  if (!wxDialEl) return;
  const w = wx.wind, kn = windKnots(w), f = wxFactor(player.rot, true), pct = Math.round((f - 1) * 100);
  const fx = pct === 0 ? "0%" : (pct > 0 ? "+" : "−") + Math.abs(pct) + "%", cls = f > 1.03 ? "tail" : f < 0.97 ? "head" : "beam";
  const wxName = t("wx_" + wx.w.kind), hrName = t("hr_" + wx.w.hour), sig = [kn, fx, cls, wxName, hrName, Math.round(w.dir * 20), Math.round(player.rot * 20)].join("|");
  if (sig === wxDialEl.sig) return;
  wxDialEl.sig = sig;
  const q = wxDialEl.q, deg = w.dir * 180 / Math.PI + 90, len = 0.55 + 0.6 * w.strength;
  q.arrow.setAttribute("transform", `rotate(${deg.toFixed(1)}) scale(${len.toFixed(2)})`);
  q.hd.setAttribute("transform", `rotate(${(player.rot * 180 / Math.PI + 90).toFixed(1)})`);   // the ring's notch is the bow: wind ahead of it is a headwind
  wxDialEl.style.setProperty("--wd-spd", (2.4 - 1.8 * w.strength).toFixed(2) + "s");
  wxDialEl.className = cls;
  q.kn.textContent = kn + " " + t("wx_kn"); q.fx.textContent = fx; q.wx.textContent = wxName + " · " + hrName;
  wxDialEl.setAttribute("aria-label", t("wx_label", { kn, fx, wx: wxName, hr: hrName }));
}

onHook("ready", () => { wxBuildSky(S); wxBuildDial(); });
onHook("lang", () => { if (wxDialEl) { wxDialEl.sig = ""; wxDial(); } });
onHook("frame", dt => {
  if (!S || !wxTintHour || !player) return;
  const live = wxLive();
  if (live && !paused && !seaFrozen) {
    wx.t = typeof runKind === "function" && runKind() === "daily" ? run.t : wx.t + dt;   // a daily sea keeps the run's clock
    wxCompute();
    if (wx.w.kind !== wx.kind) {
      if (wx.w.kind === "storm" && !wx.easy && wxFx()) toast(t("wx_toastStorm"));
      wx.kind = wx.w.kind;
    }
  }
  if ((wxCalmT -= dt) <= 0) { wxCalmT = 0.2; wxCalmCheck(); }
  wxSky(dt, live, wxFx());
  if (wxDialEl) { if (wxDialEl.hidden !== !live) wxDialEl.hidden = !live; }
  if ((wxDialT -= dt) <= 0) { wxDialT = 0.1; if (live) wxDial(); }
  if (typeof Snd !== "undefined" && Snd.setWeather) Snd.setWeather(live && wxFx() ? wx.w.rain : 0, live && wxFx() ? wx.wind.strength : 0, live && wxFx() ? wx.w.storm : 0);
});
