"use strict";
// ---------- VFX upgrade (#76): the effects the owner picked in tools/vfx-lab.html, now in the game ----------
// Look reference: the 00GameDevs effects library (look only; every line here is our own 2D Phaser code). One small pooled
// particle system (VnPool) draws all of it, capped at VFX_POOL_MAX live sprites (x0.55 on phones) so a brawl, a 30-gun
// broadside or a storm never runs away; effects off screen are skipped. Parameters live in VFX_NEW (js/config.js).
// Hooks, each a one-line call from the module that owned the old effect:
//   vnBlast(s)                  powder-magazine C chain blast at a hull (js/juice.js magazineBurst)
//   vnMuzzle(x, y, a, lite)     muzzle smoke (js/vfx.js vfxMuzzle); false while the pool is not up
//   vnFlame(x, y) vnSmoke(x, y) a burning hull: flame tongue, smoke column puff (js/vfx.js vfxShip)
//   vnSpill(x, y)               the oil an incendiary ball splashes on the water, burning (js/arsenal.js onHit)
//   vnSwirl / vnWall / vnCrest / vnBolt*  the disasters (js/disasters-art.js); the fog circles in vnFogFrame()
// All of it is looks: no hit, damage or sight rule is read or changed here. "Weather effects" off or reduced motion thin the
// disaster spray (the effects themselves are gameplay and stay); the effects quality level (js/vfx.js fxLevel, FXQ in js/config.js: low / mid / high, auto by device and frame time) scales every count.
const VN = { pool: null, fog: [], loud: [], last: 0 };
const VN_TAU = Math.PI * 2, VN_ADD = Phaser.BlendModes.ADD, VN_NORMAL = Phaser.BlendModes.NORMAL;
const VN_FIRE = [0xffffff, 0xfff0a0, 0xffb040, 0xff6a2a, 0xa02a14, 0x2a2420];
const VN_FLAME = [0xffe58a, 0xffa23a, 0xff6a2a, 0xa02a14, 0x3a2420];   // no white start: additive white vanishes on a bright sea
const VN_SMOKE = [0x6a625a, 0x4a443f, 0x8a8479];
const VN_TAGMAX = { haze: VFX_HAZE_MAX };
const vnRnd = (a, b) => a + Math.random() * (b - a), vnPick = a => a[(Math.random() * a.length) | 0];
const vnMix = (a, b, k) => { const ch = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) << s; return ch(16) | ch(8) | ch(0); };
const vnRamp = (arr, k) => { const n = arr.length - 1, f = Math.min(Math.max(k, 0), 0.9999) * n, i = f | 0; return vnMix(arr[i], arr[i + 1], f - i); };
const vnReduced = () => typeof wxReduced !== "undefined" && wxReduced;
const vnQ = () => FXQ[fxLevel()];   // the current level's row (reduced motion already caps the level at mid)
const vnK = () => vnQ().k * (PERF_LOW ? 0.7 : 1);
const vnDisK = () => (typeof wxFx === "function" && !wxFx() ? FXQ[0].k : vnQ().k) * (PERF_LOW ? 0.7 : 1);   // disaster spray: the low level's share when weather effects are off
const vnCtx = (o, k = vnK()) => ({ p: o, k });
const vnN = (c, base) => Math.max(1, Math.round(base * c.p.count * c.k));
const vnL = (c, s) => s * c.p.dur;   // a lifetime in seconds

class VnPool {
  constructor(sc) {
    this.sc = sc; this.ps = []; this.free = {};   // free sprites by depth: setDepth queues a re-sort of the whole display list, so a sprite keeps the depth it was made with
    this.ps = this.ps; this.timers = []; this.draws = []; this.t = 0; this.tags = {}; this.widths = {};
    this.g = sc.add.graphics().setDepth(8.9); this.ga = sc.add.graphics().setDepth(9.3).setBlendMode(VN_ADD);
  }
  get cap() { return Math.round(VFX_POOL_MAX * vnQ().k); }   // live: the level can change at any time
  add(o) {   // x y vx vy ax ay drag life s0 s1 (px) a0 a1 tint|ramp tex add rot vr depth fn delay tag face sx sy
    if (this.ps.length >= this.cap || (o.tag && (this.tags[o.tag] || 0) >= (VN_TAGMAX[o.tag] || 1e9))) return null;
    const v = this.view, cu = vnQ().cull; if (v && !o.fn && (o.x < v.x - cu || o.x > v.right + cu || o.y < v.y - cu || o.y > v.bottom + cu)) return null;   // far off screen: not made
    const fl = this.free[o.depth ?? 9] || (this.free[o.depth ?? 9] = []);
    const im = fl.pop() || Object.assign(this.sc.add.image(0, 0, "fx-soft").setDepth(o.depth ?? 9), { vnKey: o.depth ?? 9 });
    const p = Object.assign({ vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, a0: 1, a1: 0, s0: 20, s1: 20, tex: "fx-soft", add: true, rot: 0, vr: 0, depth: 9, age: 0, life: 1, tint: 0xffffff, delay: 0 }, o);
    p.im = im; p.w = this.widths[p.tex] || (this.widths[p.tex] = this.sc.textures.get(p.tex).getSourceImage().width);
    im.setTexture(p.tex).setBlendMode(p.add ? VN_ADD : VN_NORMAL).setVisible(false).setActive(true);
    if (!p.ramp) im.setTint(p.tint);   // a ramp re-tints every frame; a fixed tint is set once
    if (p.tag) this.tags[p.tag] = (this.tags[p.tag] || 0) + 1;
    this.ps.push(p); return p;
  }
  at(ms, fn) { this.timers.push({ t: this.t + ms / 1000, fn }); }
  draw(fn, ms) { this.draws.push({ fn, t0: this.t, dur: ms / 1000 }); }   // fn(g, ga, k 0..1, dt) each frame for ms
  update(dt) {
    this.t += dt; const v = this.view = this.sc.cameras.main.worldView, cu = vnQ().cull;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.t >= this.timers[i].t) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i], im = p.im;
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { im.setVisible(false).setActive(false); this.free[im.vnKey].push(im); this.ps.splice(i, 1); if (p.tag) this.tags[p.tag]--; continue; }
      if (p.fn) p.fn(p, dt, k);
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx = (p.vx + p.ax * dt) * dr; p.vy = (p.vy + p.ay * dt) * dr; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.x < v.x - cu || p.x > v.right + cu || p.y < v.y - cu || p.y > v.bottom + cu) { if (im.visible) im.visible = false; continue; }   // off screen: still lives and moves, is not drawn
      const fade = k < 0.08 ? k / 0.08 : 1, sz = (p.s0 + (p.s1 - p.s0) * k) / p.w;
      if (p.ramp) im.setTint(vnRamp(p.ramp, k));
      im.x = p.x; im.y = p.y; im.scaleX = p.sx ? sz * p.sx : sz; im.scaleY = p.sy ? sz * p.sy : sz;   // plain assignments: cheaper than the chained setters at hundreds of sprites
      im.rotation = p.face ? Math.atan2(p.vy, p.vx) : p.rot; im.alpha = (p.a0 + (p.a1 - p.a0) * k) * fade; if (!im.visible) im.visible = true;
    }
    this.g.clear(); this.ga.clear();
    for (let i = this.draws.length - 1; i >= 0; i--) {
      const d = this.draws[i], k = (this.t - d.t0) / d.dur;
      if (k >= 1) { this.draws.splice(i, 1); continue; }
      d.fn(this.g, this.ga, k, dt);
    }
  }
  clear() { for (const p of this.ps) { p.im.setVisible(false).setActive(false); this.free[p.im.vnKey].push(p.im); } this.ps = []; this.timers = []; this.draws = []; this.tags = {}; spillN = 0; }
}

function vnBake(sc) {
  if (sc.textures.exists("vn-puff0")) return;
  for (let v = 0; v < 3; v++) bakeCanvas(sc, "vn-puff" + v, 64, 64, 1, c => {   // a lumpy cloud: overlapping soft blobs, not one disc
    const r = mulberry32(31 + v * 7);
    for (let i = 0; i < 9; i++) {
      const a = r() * VN_TAU, d = r() * 15, x = 32 + Math.cos(a) * d, y = 32 + Math.sin(a) * d, rad = 13 + r() * 10, g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(0.6, "rgba(255,255,255,.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    }
  });
  bakeCanvas(sc, "vn-streak", 24, 4, 1, c => {   // a spark with a tail, bright head at +x
    const g = c.createLinearGradient(0, 0, 24, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,1)");
    c.fillStyle = g; c.fillRect(0, 1, 24, 2);
  });
  bakeCanvas(sc, "vn-flame", 32, 48, 1, c => {   // a flame tongue pointing up
    const g = c.createRadialGradient(16, 34, 0, 16, 30, 22); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.beginPath(); c.moveTo(4, 40); c.quadraticCurveTo(2, 20, 16, 1); c.quadraticCurveTo(30, 20, 28, 40); c.quadraticCurveTo(16, 50, 4, 40); c.fill();
  });
}
onHook("ready", () => { vnBake(S); VN.pool = new VnPool(S); });
onHook("frame", dt => {
  const now = performance.now(); fxqTick(now - VN.last, now); VN.last = now;   // the auto level's frame-time watch (js/vfx.js)
  if (!VN.pool || paused) return;
  VN.pool.update(dt * (typeof vfxSlowLeft === "function" && vfxSlowLeft() > 0 ? slowK : 1));
  vnFogFrame(dt);
});
onHook("sail", () => VN.pool && VN.pool.clear());
onHook("dock", () => VN.pool && VN.pool.clear());

// ---------- building blocks ----------
function vnRing(c, x, y, r0, r1, ms, col, w, a = 1) {   // an expanding shock ring
  c.pool.draw((g, ga, k) => { const e = 1 - (1 - k) * (1 - k), r = r0 + (r1 - r0) * e; ga.lineStyle(w * (1 - k * 0.7), col, a * (1 - k)); ga.strokeCircle(x, y, r); }, ms);
}
const vnGlow = (c, x, y, size, ms, tint, a = 1) => c.pool.add({ x, y, s0: size * 0.5, s1: size, a0: a, a1: 0, life: ms / 1000, tint, depth: 8.95 });
const vnPuff = (c, x, y, o) => c.pool.add({ tex: "vn-puff" + ((Math.random() * 3) | 0), x, y, rot: vnRnd(0, VN_TAU), vr: vnRnd(-0.6, 0.6), add: false, ...o });
function vnSparks(c, x, y, cnt, spd, life, cols, ay = 0) {
  for (let i = 0; i < cnt; i++) { const a = vnRnd(0, VN_TAU), v = vnRnd(0.35, 1) * spd; c.pool.add({ tex: "vn-streak", face: true, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.6, s0: 14, s1: 6, sy: 0.7, life: vnL(c, vnRnd(0.5, 1) * life), a0: 1, a1: 0, tint: vnPick(cols), ay, depth: 8.9 }); }
}
function vnFireball(c, x, y, k) {   // lumpy cloud blobs (normal blend, volume) under additive blobs (light): swell, rise, cool
  const m = c.p.size, cnt = vnN(c, 34 * k);
  for (let i = 0; i < cnt; i++) {
    const a = vnRnd(0, VN_TAU), v = vnRnd(15, 130) * m / c.p.dur, life = vnL(c, vnRnd(0.6, 1.2)), bx = x + Math.cos(a) * 6 * m, by = y + Math.sin(a) * 6 * m;
    c.pool.add({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 18 * m, drag: 2.4, s0: 24 * m, s1: vnRnd(90, 150) * m, life, ramp: [0xffd070, 0xff8a30, 0xd8481c, 0x5a2a1c, 0x2a2420], tex: "vn-puff" + (i % 3), add: false, a0: 0.92, a1: 0, rot: vnRnd(0, VN_TAU), vr: vnRnd(-1, 1), depth: 8.95 });
    if (i % 2) c.pool.add({ x: bx, y: by, vx: Math.cos(a) * v * 0.8, vy: Math.sin(a) * v * 0.8 - 18 * m, drag: 2.6, s0: 20 * m, s1: vnRnd(60, 100) * m, life: life * 0.8, ramp: VN_FLAME, a0: 0.7, a1: 0, depth: 8.96 });
  }
}
function vnSmokeColumn(c, x, y, cnt, rise, wide, delayMs, life) {
  for (let i = 0; i < cnt; i++) vnPuff(c, x + vnRnd(-8, 8), y, { delay: delayMs / 1000 + i * 0.07 * c.p.dur, vx: vnRnd(-8, 8) * wide, vy: -rise * vnRnd(0.7, 1.2), drag: 0.5, s0: 20 * wide, s1: 70 * wide, life: vnL(c, life * vnRnd(0.8, 1.2)), a0: 0.6, a1: 0, tint: vnPick(VN_SMOKE), depth: 8.5 });
}

// ---------- 1. powder-magazine blast: three quick pops along the hull, the big one, ember rain, burning wreckage ----------
function vnBlast(s) {
  const P = VN.pool; if (!P || !onScreen(s.x, s.y, 320)) return false;
  const c = { ...vnCtx(VFX_NEW.blast), pool: P }, m = c.p.size, x = s.x, y = s.y, len = (s.art || SHIP_ART.sloop).len, rot = s.rot || 0, ca = Math.cos(rot), sa = Math.sin(rot);
  [-0.35, 0.3, -0.05].forEach((o, i) => P.at(i * 140 * c.p.dur, () => {
    const px = x + ca * o * len, py = y + sa * o * len;
    vnGlow(c, px, py, 120 * m, 160, 0xfff0b0); vnFireball(c, px, py + vnRnd(-6, 6), 0.3); vnSparks(c, px, py, vnN(c, 8), 160 * m, 0.5, [0xffd070, 0xff8a30]); vnRing(c, px, py, 6, 70 * m, 300, 0xffe0a0, 4, 0.8);
  }));
  P.at(520 * c.p.dur, () => {
    vnGlow(c, x, y, 360 * m, 200, 0xffffff); vnFireball(c, x, y, 1); vnRing(c, x, y, 10, 230 * m, 520 * c.p.dur, 0xffd08a, 6, 0.9);
    vnSparks(c, x, y, vnN(c, 24), 230 * m, 1, [0xffb347, 0xff7a2a]);
    for (let i = 0; i < vnN(c, 7); i++) {   // planks
      const a = vnRnd(0, VN_TAU), v = vnRnd(0.4, 1) * 200 * m;
      P.add({ tex: "fx-plank", add: false, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.4, s0: 11, s1: 8, rot: vnRnd(0, VN_TAU), vr: vnRnd(-9, 9), life: vnL(c, vnRnd(0.8, 1.6)), a0: 1, a1: 0, tint: 0x6b4a2a, depth: 8.9 });
    }
    for (let i = 0; i < Math.round(vnN(c, 30) * vnQ().embers); i++) P.add({ x: x + vnRnd(-60, 60) * m, y: y - vnRnd(10, 80) * m, vx: vnRnd(-20, 20), vy: vnRnd(-30, 10), ay: 90, drag: 0.4, s0: 6, s1: 2, life: vnL(c, vnRnd(0.9, 1.9)), tint: vnPick([0xffb347, 0xff7a2a, 0xffd27a]), a0: 1, a1: 0, delay: vnRnd(0, 0.4), depth: 8.9 });   // ember rain
    for (let i = 0; i < Math.round(vnN(c, 6) * vnQ().flotsam); i++) P.add({ x: x + vnRnd(-1, 1) * len * 0.4, y: y + vnRnd(-10, 10), s0: 28 * m, s1: 6, life: vnL(c, 3), ramp: VN_FLAME.slice(0, 3), a0: 0.9, a1: 0, delay: vnRnd(0, 0.6), depth: 2.8 });   // burning flotsam on the water
    vnSmokeColumn(c, x, y, vnN(c, 10), 30 * m, m, 200, 2.6);
  });
  return true;
}

// ---------- 2. muzzle smoke: dirty powder smoke that rolls into a wind-blown haze bank ----------
// Past VFX_MUZZLE_LOUD loud plumes in 300 ms a shot only gets a small puff, and at most VFX_HAZE_MAX haze puffs live at once.
function vnMuzzle(x, y, a, lite) {
  const P = VN.pool; if (!P) return false;
  const c = { ...vnCtx(VFX_NEW.muzzle), pool: P }, m = c.p.size, ca = Math.cos(a), sa = Math.sin(a), now = S.time.now;
  if (!lite) { VN.loud = VN.loud.filter(t => now - t < 300); if (VN.loud.length >= VFX_MUZZLE_LOUD) lite = true; else VN.loud.push(now); }
  if (lite) {
    if (Math.random() > vnQ().lite) return true;   // small puffs thin out at lower levels; the muzzle flash itself is untouched
    for (let j = 0; j < vnN(c, 1); j++) vnPuff(c, x + ca * 8, y + sa * 8, { vx: ca * vnRnd(20, 60) * m + 20, vy: sa * vnRnd(20, 60) * m, drag: 0.9, s0: 12 * m, s1: vnRnd(34, 50) * m, life: vnL(c, vnRnd(1, 1.6)), a0: 0.7, a1: 0, tint: vnPick([0xb3a998, 0xcfc4ae]), depth: 8 });
    return true;
  }
  vnGlow(c, x + ca * 12, y + sa * 12, 56 * m, 80, 0xffc060);
  for (let j = 0; j < vnN(c, 4); j++) { const sp = vnRnd(30, 110) * m / c.p.dur;
    vnPuff(c, x, y, { vx: ca * sp + 20, vy: sa * sp * 0.6 - 4, drag: 0.9, s0: 16 * m, s1: vnRnd(50, 80) * m, life: vnL(c, vnRnd(1.2, 2)), a0: 0.8, a1: 0, tint: vnPick([0xb3a998, 0x8a8479, 0xcfc4ae]), depth: 8 }); }
  for (let j = 0, nh = Math.round(vnN(c, 2) * vnQ().haze); j < nh; j++) vnPuff(c, x + vnRnd(-6, 6), y - 10, { vx: vnRnd(14, 34), vy: vnRnd(-6, 2), drag: 0.15, s0: 30 * m, s1: vnRnd(90, 130) * m, life: vnL(c, vnRnd(3, 4.2)), a0: 0.4, a1: 0, tint: 0xcfc9bb, depth: 7.9, tag: "haze" });
  return true;
}

// ---------- 3. fire: flame tongues and a bending smoke column on a burning hull; burning oil on the water ----------
function vnFlame(x, y) {
  const P = VN.pool; if (!P) return false;
  const m = VFX_NEW.fire.size;
  P.add({ tex: "vn-flame", x, y, vx: vnRnd(-6, 6), vy: -vnRnd(24, 50) * m, drag: 0.6, s0: 26 * m, s1: 9 * m, sy: 1.4, life: vnRnd(0.35, 0.7) * VFX_NEW.fire.dur, ramp: VN_FLAME, a0: 1, a1: 0, depth: 8.2 });
  return true;
}
function vnSmoke(x, y) {
  const P = VN.pool; if (!P) return false;
  const m = VFX_NEW.fire.size;
  vnPuff({ pool: P }, x, y - 6, { vx: 12 + vnRnd(-6, 10), vy: -vnRnd(34, 58) * m, drag: 0.15, s0: 14 * m, s1: vnRnd(60, 90) * m, life: vnRnd(2.2, 3.2) * VFX_NEW.fire.dur, a0: 0.65, a1: 0, tint: vnPick(VN_SMOKE), depth: 8.1 });
  return true;
}
let spillN = 0;
function vnSpill(x, y) {   // an incendiary ball's oil: a small fire patch on the water for ~4 s
  const P = VN.pool; if (!P || spillN >= VFX_SPILL_MAX || !onScreen(x, y, 100)) return false;
  const c = { ...vnCtx(VFX_NEW.fire), pool: P }, m = c.p.size, secs = 4 * c.p.dur; let acc = 0; spillN++;
  P.at(secs * 1000, () => { spillN = Math.max(0, spillN - 1); });
  P.draw((g, ga, k, dt) => {
    const f = k < 0.8 ? 1 : (1 - k) / 0.2; ga.fillStyle(0xff6a2a, 0.22 * f); ga.fillEllipse(x, y, 110 * m * f, 62 * m * f);
    acc += dt;
    for (; acc >= 0.06 / c.k; acc -= 0.06 / c.k) if (f > 0.3) P.add({ tex: "vn-flame", x: x + vnRnd(-32, 32) * m, y: y + vnRnd(-14, 14) * m, vy: -vnRnd(8, 28), s0: 18 * m, s1: 6 * m, sy: 1.3, life: vnRnd(0.4, 0.8), ramp: VN_FLAME, a0: 0.95, a1: 0, depth: 3.1 });
  }, secs * 1000);
  return true;
}

// ---------- 4 + 5. waterspout (spiral column) and whirlpool (funnel): drawn into the disaster layer under the ships ----------
function vnSwirl(g, ev, c, dt) {
  const P = VN.pool; if (!P) return false;
  const t = wx.t, spout = ev.kind === "spout", o = VFX_NEW[spout ? "spout" : "vortex"], f = Math.max(0, Math.min(1, (t - ev.t0) / 1.2, (ev.end - t) / 1.5)), R = c.R * o.size;
  const m = R / (spout ? 78 : 95), tt = t - ev.t0;
  if (spout) {   // a grey cloud heart, white spray arms spun up and out
    g.fillStyle(0x37454d, 0.5 * f); g.fillCircle(ev.x, ev.y, 65 * m); g.fillStyle(0x1f2b31, 0.5 * f); g.fillCircle(ev.x, ev.y, 20 * m);
  } else {   // rings that darken toward the middle, foam arms running inward
    const rn = vnQ().rings, an4 = vnQ().arms;
    for (let i = 0; i < rn; i++) { g.fillStyle(vnMix(0x2a8ab0, 0x020c14, i / (rn - 1)), 0.34 * f); g.fillCircle(ev.x, ev.y, (95 - i * 80 / rn) * m * f); }
    g.lineStyle(3, 0xdff6ff, 0.65 * f);
    for (let a = 0; a < an4; a++) { g.beginPath(); for (let i = 0; i <= 20; i += an4 < 4 ? 2 : 1) { const u = i / 20, r = (92 - u * 80) * m * f, an = a * VN_TAU / an4 + tt * 2.4 + u * 5, px = ev.x + Math.cos(an) * r, py = ev.y + Math.sin(an) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.strokePath(); }
  }
  ev.vnAcc = (ev.vnAcc || 0) + dt;
  const gap = 1 / (22 * Math.sqrt(Math.min(m, 4)) * o.count * vnDisK() * Math.max(f, 0.05));
  const ps = Math.sqrt(Math.min(m, 4));
  for (; ev.vnAcc >= gap; ev.vnAcc -= gap) {
    const a0 = vnRnd(0, VN_TAU), life = vnRnd(spout ? 1.1 : 1.4, spout ? 2 : 2.2) * o.dur, r0 = spout ? vnRnd(0.15, 0.28) * R : vnRnd(0.75, 1.05) * R, r1 = spout ? 0.95 * R : 0.04 * R, spin = spout ? 5.5 : 3.2;
    P.add(spout ? { tex: "vn-puff1", add: false, s0: 12 * ps, s1: vnRnd(28, 46) * ps, ramp: [0xf2fafc, 0xb9cdd4, 0x7f939b], a0: 0.8, a1: 0, life, depth: 4.7, x: ev.x, y: ev.y }
      : { s0: 12 * ps, s1: 2, tint: vnPick([0xffffff, 0xbfe8f5]), a0: 0.85, a1: 0, life, depth: 4.7, x: ev.x, y: ev.y, fn: null });
    const p = P.ps[P.ps.length - 1];
    if (p) p.fn = (q, d, k) => { const r = r0 + (r1 - r0) * (spout ? k : k * k), an = a0 + spin * k * life / o.dur; q.x = ev.x + Math.cos(an) * r; q.y = ev.y + Math.sin(an) * r; q.vx = q.vy = 0; };
  }
  return true;
}

// ---------- 6. tsunami / rogue wave: a foam wall (puffs ride the front, spray leaps ahead, a pale wash behind it) ----------
function vnWallPuffs(ev, ptAt, speedAlong, dir, dt, rate) {   // ptAt(): a random point on the front, {x, y}
  const P = VN.pool, o = VFX_NEW.wave; if (!P) return;
  ev.vnAcc = (ev.vnAcc || 0) + dt;
  const gap = 1 / (rate * o.count * vnDisK()), cx = Math.cos(dir), sy = Math.sin(dir);
  for (; ev.vnAcc >= gap; ev.vnAcc -= gap) for (let tries = 0; tries < 3; tries++) {
    const p = ptAt(); if (!onScreen(p.x, p.y, 40)) continue;
    vnPuff({ pool: P }, p.x, p.y, { vx: cx * speedAlong * 0.55 - sy * vnRnd(-12, 12), vy: sy * speedAlong * 0.55 + cx * vnRnd(-12, 12), drag: 0.4, s0: 16 * o.size, s1: vnRnd(34, 52) * o.size, life: vnRnd(0.7, 1.3) * o.dur, a0: 0.9, a1: 0, tint: vnPick([0xffffff, 0xeaf8ff, 0xcfeef7]), depth: 4.7 });
    if (Math.random() < 0.3) P.add({ x: p.x + cx * 6, y: p.y + sy * 6, vx: cx * speedAlong * vnRnd(1.1, 1.7), vy: sy * speedAlong * vnRnd(1.1, 1.7) + vnRnd(-40, 40), drag: 1.4, s0: 5, s1: 2, life: vnRnd(0.4, 0.8), tint: 0xffffff, a0: 0.9, a1: 0, depth: 4.7 });
    break;
  }
}
function vnWall(g, ev, c, dt, P, f, h, a) {   // P(along, side) -> [x, y] (the caller's frame); draws the wash and seeds the puffs
  if (!VN.pool) return false;
  const [x0, y0] = P(f - 40, -h), [x1, y1] = P(f, -h), [x2, y2] = P(f, h), [x3, y3] = P(f - 40, h);
  g.fillStyle(0xbfeaf5, 0.14 * a); g.fillPoints([{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }], true);
  g.lineStyle(3, 0xeaf8ff, 0.55 * a); g.lineBetween(x1, y1, x2, y2);   // a thin edge so the wall reads at night
  vnWallPuffs(ev, () => { const [x, y] = P(f + vnRnd(-10, 6), vnRnd(-h, h)); return { x, y }; }, c.speed, ev.dir, dt, 90 * a);
  return true;
}
function vnCrest(ev, c, f, dt) {   // the rogue wave's crest points (the caller's curve), as puffs
  if (!VN.pool) return false;
  const cx = Math.cos(ev.dir), sy = Math.sin(ev.dir);
  vnWallPuffs(ev, () => { const s = vnRnd(-0.5, 0.5) * c.R * 2.3, bow = -Math.abs(s) * 0.22; return { x: ev.x + cx * (f + bow) - sy * s, y: ev.y + sy * (f + bow) + cx * s }; }, 260, ev.dir, dt, 70);
  return true;
}

// ---------- 7. lightning: two pre-flickers, the stroke with forks, a violet ball and steam; fog: puffs swirling at the edge of sight ----------
function vnJag(x0, y0, x1, y1, jag) {
  const pts = [{ x: x0, y: y0 }], segs = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 18)), dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segs; i++) { const o = vnRnd(-jag, jag) * Math.sin(Math.PI * i / segs) * 1.4 + vnRnd(-2, 2); pts.push({ x: x0 + dx * i / segs + nx * o, y: y0 + dy * i / segs + ny * o }); }
  pts.push({ x: x1, y: y1 }); return pts;
}
const vnStroke = (g, pts, w, col, a) => { g.lineStyle(w, col, a); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.strokePath(); };
function vnBoltPlan(ev) {   // the bolt's shape is fixed once per event, so the flickers and the stroke are one bolt
  if (ev.vnBolt) return ev.vnBolt;
  const main = vnJag(ev.x, ev.y - 700, ev.x, ev.y, 34), forks = [];
  for (let i = 0; i < vnQ().forks; i++) { const s = main[1 + ((Math.random() * (main.length - 3)) | 0)], a = Math.PI / 2 + vnRnd(-1, 1) * 0.8, len = vnRnd(60, 160); forks.push(vnJag(s.x, s.y, s.x + Math.cos(a) * len, s.y + Math.sin(a) * len * 0.8, 12)); }
  return (ev.vnBolt = { main, forks });
}
function vnBoltFlicker(top, ev, left) {   // warn state, last 0.35 s: two faint flickers of the coming bolt
  const b = vnBoltPlan(ev);
  if ((left > 0.3 - 0.09 && left <= 0.3) || (left > 0.17 - 0.09 && left <= 0.17)) vnStroke(top, b.main, 4, 0xb9a8ff, 0.7);
}
function vnBoltDraw(top, ev, age) {   // live state, the first 0.35 s
  const a = 1 - age / 0.35, b = vnBoltPlan(ev);
  if (!ev.vnHit) {
    ev.vnHit = 1;
    const P = VN.pool;
    if (P && onScreen(ev.x, ev.y, 200)) {
      const c = { ...vnCtx(VFX_NEW.storm), pool: P }, m = c.p.size;
      vnGlow(c, ev.x, ev.y, 200 * m, 300, 0xffffff); vnRing(c, ev.x, ev.y, 8, 120 * m, 520, 0xd8c8ff, 6, 0.9); vnSparks(c, ev.x, ev.y, vnN(c, 28), 230 * m, 0.8, [0xffffff, 0xd8c8ff, 0xfff2a0], 90);
      P.add({ x: ev.x, y: ev.y, s0: 30 * m, s1: 80 * m, life: 0.8 * c.p.dur, a0: 1, a1: 0, tint: 0xa890ff, depth: 8.95 });   // the violet ball
      for (let i = 0; i < vnN(c, 8) * vnQ().steam; i++) vnPuff(c, ev.x + vnRnd(-12, 12), ev.y, { vy: -vnRnd(24, 44), vx: vnRnd(-8, 8), s0: 12 * m, s1: 44 * m, life: 1.6 * c.p.dur, a0: 0.5, a1: 0, tint: 0xe9eef2, delay: vnRnd(0, 0.4), depth: 8.5 });   // steam
    }
    if (typeof screenFlash === "function" && !vnReduced()) screenFlash();
  }
  for (const f of b.forks) { vnStroke(top, f, 5, 0xd8c8ff, 0.35 * a); vnStroke(top, f, 1.8, 0xffffff, a); }
  vnStroke(top, b.main, 14, 0xd8c8ff, 0.4 * a); vnStroke(top, b.main, 6, 0xffffff, 0.8 * a); vnStroke(top, b.main, 2.6, 0xffffff, a);
}
function vnFogFrame(dt) {   // fog puffs swirl round the player at the edge of sight; the veil and the sight rule are js/disasters*.js's, untouched
  const lvl = typeof dis !== "undefined" && dis.fog > 0.01 && player && player.alive && !docked ? dis.fog : 0;
  const want = lvl ? Math.round(VFX_FOG_PUFFS * VFX_NEW.storm.count * vnDisK() * (typeof wxFx === "function" && !wxFx() ? 0 : vnQ().fog)) : 0;
  while (VN.fog.length > want) { const q = VN.fog.pop(); q.im.destroy(); }
  while (VN.fog.length < want) VN.fog.push({ im: S.add.image(0, 0, "vn-puff" + (VN.fog.length % 3)).setDepth(12.1).setTint(0xd6e0e4), a: vnRnd(0, VN_TAU), w: vnRnd(0.08, 0.2) * (Math.random() < 0.5 ? -1 : 1), ph: vnRnd(0, VN_TAU), s: vnRnd(150, 220) });
  if (!want) return;
  const sight = disSight(), t = S.time.now / 1000;
  for (const q of VN.fog) {
    q.a += q.w * dt;
    const r = sight * (0.92 + 0.14 * Math.sin(t * 0.6 + q.ph));
    q.im.setPosition(player.x + Math.cos(q.a) * r, player.y + Math.sin(q.a) * r).setRotation(q.a + t * 0.1).setDisplaySize(q.s, q.s).setAlpha(0.34 * Math.min(1, lvl * 1.4));
  }
}
