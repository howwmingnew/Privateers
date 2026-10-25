"use strict";
// ---------- VFX lab: new effect candidates (only the lab page loads this; the game does not yet) ----------
// Look reference: the 00GameDevs effects library (billowing fireball, lumpy puffs, smoke column, spiky ground fire, branching bolt).
// Only the look is borrowed: every line here is our own 2D Phaser code. A tiny pooled particle system (Pool) drives all of
// it, so particle counts and per-frame cost are exact. Each effect: { id, cat, ver, name, desc, play(c) } where
// c = { pool, sc, x, y, ship, W, H, p: { size, count, dur, hue }, low, cur } and play() returns nothing (the Pool owns what it spawns).
const VFXLAB = (() => {
  const ADD = Phaser.BlendModes.ADD, NORMAL = Phaser.BlendModes.NORMAL, T = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];
  const mix = (a, b, k) => { const ch = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) << s; return ch(16) | ch(8) | ch(0); };
  const ramp = (arr, k) => { const n = arr.length - 1, f = Math.min(Math.max(k, 0), 0.9999) * n, i = f | 0; return mix(arr[i], arr[i + 1], f - i); };
  function hue(hex, deg) {   // rotate a colour's hue (the lab's "color" slider)
    if (!deg) return hex;
    const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    if (!d) return hex;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = ((h * 60 + deg) % 360 + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return (Math.round((R + m) * 255) << 16) | (Math.round((G + m) * 255) << 8) | Math.round((B + m) * 255);
  }
  const HR = (arr, d) => arr.map(c => hue(c, d));

  function bake(sc) {   // lab-only textures, drawn in code
    if (sc.textures.exists("lab-puff0")) return;
    for (let v = 0; v < 3; v++) bakeCanvas(sc, "lab-puff" + v, 64, 64, 1, c => {   // a lumpy cloud: overlapping soft blobs, not one disc
      const r = mulberry32(31 + v * 7);
      for (let i = 0; i < 9; i++) {
        const a = r() * T, d = r() * 15, x = 32 + Math.cos(a) * d, y = 32 + Math.sin(a) * d, rad = 13 + r() * 10, g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(0.6, "rgba(255,255,255,.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      }
    });
    bakeCanvas(sc, "lab-streak", 24, 4, 1, c => {   // a spark with a tail, bright head at +x
      const g = c.createLinearGradient(0, 0, 24, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = g; c.fillRect(0, 1, 24, 2);
    });
    bakeCanvas(sc, "lab-flame", 32, 48, 1, c => {   // a flame tongue pointing up
      const g = c.createRadialGradient(16, 34, 0, 16, 30, 22); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.beginPath(); c.moveTo(4, 40); c.quadraticCurveTo(2, 20, 16, 1); c.quadraticCurveTo(30, 20, 28, 40); c.quadraticCurveTo(16, 50, 4, 40); c.fill();
    });
    bakeCanvas(sc, "lab-curfog", 256, 256, 1, c => {   // the game's fog rim (js/disasters-art.js): clear middle, grey wall outside
      const g = c.createRadialGradient(128, 128, 20, 128, 128, 128);
      g.addColorStop(0, "rgba(214,224,228,0)"); g.addColorStop(0.5, "rgba(214,224,228,0.22)"); g.addColorStop(0.82, "rgba(214,224,228,0.82)"); g.addColorStop(1, "rgba(214,224,228,0.94)");
      c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    });
  }

  // ---------- the pool: pooled sprites + timed callbacks + per-frame Graphics draws ----------
  class Pool {
    constructor(sc) {
      this.sc = sc; this.ps = []; this.free = []; this.timers = []; this.draws = []; this.extras = []; this.t = 0; this.peak = 0;
      this.g = sc.add.graphics().setDepth(9.1); this.ga = sc.add.graphics().setDepth(9.3).setBlendMode(ADD);
    }
    get count() { return this.ps.length; }
    add(o) {   // o: x y vx vy ax ay drag life s0 s1 (px) a0 a1 tint|ramp tex add rot vr depth fn delay
      const im = this.free.pop() || this.sc.add.image(0, 0, "fx-soft");
      const p = Object.assign({ vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, a0: 1, a1: 0, s0: 20, s1: 20, tex: "fx-soft", add: true, rot: 0, vr: 0, depth: 9, age: 0, life: 1, tint: 0xffffff, delay: 0 }, o);
      p.im = im; p.w = this.sc.textures.get(p.tex).getSourceImage().width;
      im.setTexture(p.tex).setBlendMode(p.add ? ADD : NORMAL).setDepth(p.depth).setVisible(false).setActive(true).setRotation(p.rot);
      this.ps.push(p); return p;
    }
    at(ms, fn) { this.timers.push({ t: this.t + ms / 1000, fn }); }
    draw(fn, dur) { this.draws.push({ fn, t0: this.t, dur: dur / 1000 }); }   // fn(g, ga, k 0..1, dt) each frame for dur ms
    update(dt) {
      this.t += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) if (this.t >= this.timers[i].t) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
      for (let i = this.ps.length - 1; i >= 0; i--) {
        const p = this.ps[i], im = p.im;
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) { im.setVisible(false).setActive(false); this.free.push(im); this.ps.splice(i, 1); continue; }
        if (p.fn) p.fn(p, dt, k);
        const dr = Math.max(0, 1 - p.drag * dt);
        p.vx = (p.vx + p.ax * dt) * dr; p.vy = (p.vy + p.ay * dt) * dr; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const col = p.ramp ? ramp(p.ramp, k) : p.tint, fade = k < 0.08 ? k / 0.08 : 1, sz = (p.s0 + (p.s1 - p.s0) * k) / p.w;
        im.setPosition(p.x, p.y).setScale(p.sx ? sz * p.sx : sz, p.sy ? sz * p.sy : sz).setRotation(p.face ? Math.atan2(p.vy, p.vx) : p.rot).setTint(col)
          .setAlpha((p.a0 + (p.a1 - p.a0) * k) * fade).setVisible(true);
      }
      this.g.clear(); this.ga.clear();
      for (let i = this.draws.length - 1; i >= 0; i--) {
        const d = this.draws[i], k = (this.t - d.t0) / d.dur;
        if (k >= 1) { this.draws.splice(i, 1); continue; }
        d.fn(this.g, this.ga, k, dt);
      }
      this.peak = Math.max(this.peak, this.ps.length);
    }
    clear() { for (const p of this.ps) { p.im.setVisible(false).setActive(false); this.free.push(p.im); } this.ps = []; this.timers = []; this.draws = []; this.peak = 0; for (const f of this.extras) f(); this.extras = []; }
    busy() { return this.ps.length || this.draws.length || this.timers.length; }
  }

  // ---------- shared building blocks ----------
  const n = (c, base) => Math.max(1, Math.round(base * c.p.count * (c.low ? 0.5 : 1)));
  const S_ = c => c.p.size, D_ = c => 1 / c.p.dur;   // size multiplier; speed multiplier (a longer effect runs slower)
  const L = (c, s) => s * c.p.dur;                   // a lifetime in seconds
  const FIRE = [0xffffff, 0xfff0a0, 0xffb040, 0xff6a2a, 0xa02a14, 0x2a2420];
  const FLAME = [0xffe58a, 0xffa23a, 0xff6a2a, 0xa02a14, 0x3a2420];   // no white start: additive white vanishes on a bright sea
  const SMOKE = [0x6a625a, 0x4a443f, 0x8a8479];
  const rate = (c, every) => every / c.p.count / (c.low ? 0.5 : 1);   // emit interval for looping effects
  function ring(c, x, y, r0, r1, ms, col, w, a = 1, add = true, sq = 1) {   // an expanding shock ring drawn as a stroke
    c.pool.draw((g, ga, k) => { const gg = add ? ga : g, e = 1 - (1 - k) * (1 - k), r = r0 + (r1 - r0) * e; gg.lineStyle(w * (1 - k * 0.7), col, a * (1 - k)); gg.strokeEllipse(x, y, r * 2, r * 2 * sq); }, ms);
  }
  function glow(c, x, y, size, ms, tint, a = 1) { c.pool.add({ x, y, s0: size * 0.5, s1: size, a0: a, a1: 0, life: ms / 1000, tint }); }
  function puff(c, x, y, o) { return c.pool.add({ tex: "lab-puff" + ((Math.random() * 3) | 0), x, y, rot: rnd(0, T), vr: rnd(-0.6, 0.6), add: false, ...o }); }
  function sparks(c, x, y, cnt, spd, life, cols, o = {}) {
    for (let i = 0; i < cnt; i++) { const a = rnd(0, T), v = rnd(0.35, 1) * spd; c.pool.add({ tex: "lab-streak", face: true, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.6, s0: 14, s1: 6, sy: 0.7, life: L(c, rnd(0.5, 1) * life), a0: 1, a1: 0, tint: pick(cols), ay: o.ay || 0 }); }
  }
  function planks(c, x, y, cnt, spd) {
    for (let i = 0; i < cnt; i++) { const a = rnd(0, T), v = rnd(0.4, 1) * spd; c.pool.add({ tex: "fx-plank", add: false, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.4, s0: 11, s1: 8, rot: rnd(0, T), vr: rnd(-9, 9), life: L(c, rnd(0.8, 1.6)), a0: 1, a1: 0, tint: 0x6b4a2a, depth: 8.9 }); }
  }
  function bolt(x0, y0, x1, y1, jag) {   // a jagged polyline from (x0,y0) to (x1,y1)
    const pts = [{ x: x0, y: y0 }], segs = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 18)), dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let i = 1; i < segs; i++) { const o = rnd(-jag, jag) * Math.sin(Math.PI * i / segs) * 1.4 + rnd(-2, 2); pts.push({ x: x0 + dx * i / segs + nx * o, y: y0 + dy * i / segs + ny * o }); }
    pts.push({ x: x1, y: y1 }); return pts;
  }
  const strokePts = (g, pts, w, col, a) => { g.lineStyle(w, col, a); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.strokePath(); };
  function branches(pts, nb, spread) {   // forks leaving the main bolt
    const out = [];
    for (let i = 0; i < nb; i++) { const s = pts[1 + ((Math.random() * (pts.length - 3)) | 0)], a = Math.PI / 2 + rnd(-1, 1) * spread, len = rnd(35, 90); out.push(bolt(s.x, s.y, s.x + Math.cos(a) * len, s.y + Math.sin(a) * len * 0.8, 9)); }
    return out;
  }
  function emitLoop(c, secs, every, fn) { const t = L(c, secs); let k = 0; c.pool.draw((g, ga, kk, dt) => { k += dt; while (k >= every) { k -= every; fn(kk); } }, t * 1000); }
  const edge = (k, a = 0.9) => Math.min(1, k * 6) * (k > a ? (1 - k) / (1 - a) : 1);   // fade in fast, fade out at the end

  // ================= 1. powder-magazine blast =================
  function fireball(c, x, y, k) {   // billowing fireball: lumpy cloud blobs (normal blend, give volume) under additive blobs (give light), rising, swelling, cooling
    const m = S_(c), cnt = n(c, 34 * k);
    for (let i = 0; i < cnt; i++) {
      const a = rnd(0, T), v = rnd(15, 130) * m * D_(c), life = L(c, rnd(0.6, 1.2)), bx = x + Math.cos(a) * 6 * m, by = y + Math.sin(a) * 6 * m;
      c.pool.add({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 18 * m, drag: 2.4, s0: 24 * m, s1: rnd(90, 150) * m, life, ramp: HR([0xffd070, 0xff8a30, 0xd8481c, 0x5a2a1c, 0x2a2420], c.p.hue), tex: "lab-puff" + (i % 3), add: false, a0: 0.92, a1: 0, rot: rnd(0, T), vr: rnd(-1, 1), depth: 8.95 });
      if (i % 2) c.pool.add({ x: bx, y: by, vx: Math.cos(a) * v * 0.8, vy: Math.sin(a) * v * 0.8 - 18 * m, drag: 2.6, s0: 20 * m, s1: rnd(60, 100) * m, life: life * 0.8, ramp: HR(FLAME, c.p.hue), a0: 0.7, a1: 0 });
    }
  }
  function smokeColumn(c, x, y, cnt, rise, wide, delayMs, life = 2.2) {
    for (let i = 0; i < cnt; i++) puff(c, x + rnd(-8, 8), y, { delay: delayMs / 1000 + i * 0.07 * c.p.dur, vx: rnd(-8, 8) * wide, vy: -rise * rnd(0.7, 1.2), drag: 0.5, s0: 20 * wide, s1: 70 * wide, life: L(c, life * rnd(0.8, 1.2)), a0: 0.6, a1: 0, tint: pick(HR(SMOKE, c.p.hue * 0.2)), depth: 9.05 });
  }
  const blast = {
    cur(c) {   // as the game does now: burst + FX.flame + one flat flash disc + dark smoke column (js/juice.js magazineBurst, js/powder.js ring)
      const x = c.x, y = c.y;
      c.cur.burst.explode(18, x, y); FX.flame.explode(10, x, y);
      c.pool.add({ x, y, s0: 312, s1: 400, a0: 1, a1: 0, life: 0.14, tint: 0xffa040, depth: 8.8 });
      for (let i = 0; i < 4; i++) c.pool.at(i * 90, () => { FX.tint = 0x2a2420; FX.dmg.emitParticleAt(x + rnd(-8, 8), y + rnd(-8, 8), 2); });
      c.pool.add({ tex: "fx-ring", x, y, s0: 14, s1: 220, a0: 0.9, a1: 0, life: 0.42, tint: 0xffd08a });
    },
    A(c) {   // fireball swells, orange debris and a white shock ring
      const x = c.x, y = c.y, m = S_(c);
      glow(c, x, y, 330 * m, 160, 0xffffff, 1);
      fireball(c, x, y, 1); fireball(c, x, y, 0.6);
      ring(c, x, y, 10, 210 * m, 520 * c.p.dur, 0xffffff, 6, 0.9);
      sparks(c, x, y, n(c, 36), 260 * m, 0.9, HR([0xffd070, 0xff8a30, 0xffb347], c.p.hue), { ay: 80 });
      planks(c, x, y, n(c, 6), 190 * m);
      smokeColumn(c, x, y - 6, n(c, 9), 34 * m, m, 250);
    },
    B(c) {   // blinding flash, twin shock rings, radial light spikes and a pressed-down sea
      const x = c.x, y = c.y, m = S_(c), nr = n(c, 14);
      glow(c, x, y, 420 * m, 200, 0xffffff, 1); glow(c, x, y, 220 * m, 380, hue(0xffc070, c.p.hue), 1);
      ring(c, x, y, 8, 250 * m, 600 * c.p.dur, 0xffffff, 7, 1); ring(c, x, y, 4, 170 * m, 480 * c.p.dur, hue(0xff9a40, c.p.hue), 10, 0.8);
      const rays = Array.from({ length: nr }, (_, i) => ({ a: i / nr * T + rnd(-0.2, 0.2), l: rnd(90, 190) * m }));
      c.pool.draw((g, ga, k) => { for (const r of rays) { const l = r.l * (0.3 + k * 0.7); ga.lineStyle(5 * (1 - k), 0xfff2c0, 0.9 * (1 - k)); ga.lineBetween(x + Math.cos(r.a) * 20 * m, y + Math.sin(r.a) * 20 * m, x + Math.cos(r.a) * l, y + Math.sin(r.a) * l); } }, 380 * c.p.dur);
      c.pool.draw((g, ga, k) => { g.fillStyle(0x03141c, 0.4 * (1 - k) * Math.min(1, k * 10)); g.fillEllipse(x, y, 320 * m * (0.3 + k), 220 * m * (0.3 + k)); }, 900 * c.p.dur);   // the sea pressed dark
      fireball(c, x, y, 0.55); sparks(c, x, y, n(c, 22), 320 * m, 0.7, [0xffffff, 0xffe9a0]); planks(c, x, y, n(c, 8), 230 * m);
      smokeColumn(c, x, y, n(c, 5), 26 * m, m * 0.9, 300, 1.8);
    },
    C(c) {   // three quick pops along the hull, then the big one, ember rain and burning wreckage
      const m = S_(c), x = c.x, y = c.y, len = c.ship.art.len;
      [-0.35, 0.3, -0.05].forEach((o, i) => c.pool.at(i * 140 * c.p.dur, () => { const px = x + o * len; glow(c, px, y, 120 * m, 160, 0xfff0b0); fireball(c, px, y + rnd(-6, 6), 0.3); sparks(c, px, y, n(c, 8), 160 * m, 0.5, [0xffd070, 0xff8a30]); ring(c, px, y, 6, 70 * m, 300, 0xffe0a0, 4, 0.8); }));
      c.pool.at(520 * c.p.dur, () => {
        glow(c, x, y, 360 * m, 200, 0xffffff); fireball(c, x, y, 1); ring(c, x, y, 10, 230 * m, 520 * c.p.dur, 0xffd08a, 6, 0.9);
        sparks(c, x, y, n(c, 24), 230 * m, 1, [0xffb347, 0xff7a2a]); planks(c, x, y, n(c, 7), 200 * m);
        for (let i = 0; i < n(c, 30); i++) c.pool.add({ x: x + rnd(-60, 60) * m, y: y - rnd(10, 80) * m, vx: rnd(-20, 20), vy: rnd(-30, 10), ay: 90, drag: 0.4, s0: 6, s1: 2, life: L(c, rnd(0.9, 1.9)), tint: pick([0xffb347, 0xff7a2a, 0xffd27a]), a0: 1, a1: 0, delay: rnd(0, 0.4) });
        for (let i = 0; i < n(c, 6); i++) c.pool.add({ x: x + rnd(-1, 1) * len * 0.4, y: y + rnd(-10, 10), s0: 28 * m, s1: 6, life: L(c, 3), ramp: HR(FIRE.slice(1, 4), c.p.hue), a0: 0.9, a1: 0, delay: rnd(0, 0.6) });   // burning flotsam
        smokeColumn(c, x, y, n(c, 10), 30 * m, m, 200, 2.6);
      });
    },
  };

  // ================= 2. muzzle smoke =================
  const volley = (c, fire) => {   // a broadside from the ship's port side (up on screen), gun by gun
    const sh = c.ship, g = sh.art.guns, a = -Math.PI / 2;
    for (let i = 0; i < g; i++) c.pool.at(i * 70, () => { const off = (i / (g - 1) - 0.5) * sh.art.len * 0.62; fire(sh.x + off, sh.y - sh.art.beam * 0.5, a, i); });
  };
  function embers(c, x, y, a, m) { for (let i = 0; i < n(c, 3); i++) c.pool.add({ x, y, vx: Math.cos(a + rnd(-0.5, 0.5)) * rnd(60, 130) * m, vy: Math.sin(a + rnd(-0.5, 0.5)) * rnd(60, 130) * m, ay: 20, drag: 1, s0: 5, s1: 1, life: L(c, rnd(0.5, 1)), tint: pick([0xffb347, 0xff7a2a, 0xffd27a]) }); }
  const muzzleFx = {
    cur(c) { volley(c, (x, y, a) => vfxMuzzle(x, y, a)); },
    A(c) {   // plump white billows that drift, swell and thin out
      const m = S_(c);
      volley(c, (x, y, a) => {
        glow(c, x + Math.cos(a) * 14, y + Math.sin(a) * 14, 60 * m, 90, hue(0xffe0a0, c.p.hue));
        for (let j = 0; j < n(c, 7); j++) { const sp = rnd(25, 90) * m / c.p.dur, d = a + rnd(-0.45, 0.45);
          puff(c, x + Math.cos(a) * 8, y + Math.sin(a) * 8, { vx: Math.cos(d) * sp + 12, vy: Math.sin(d) * sp, drag: 1.1, s0: 14 * m, s1: rnd(54, 84) * m, life: L(c, rnd(1.4, 2.4)), a0: 0.85, a1: 0, tint: pick([0xf4f1ea, 0xdedad0, 0xe9e5dc]) }); }
        sparks(c, x, y, n(c, 4), 140 * m, 0.4, [0xffd27a, 0xffa040]);
      });
    },
    B(c) {   // a hard jet that opens into a cone, with a smoke ring
      const m = S_(c);
      volley(c, (x, y, a) => {
        glow(c, x + Math.cos(a) * 16, y + Math.sin(a) * 16, 70 * m, 80, hue(0xffffff, c.p.hue));
        for (let j = 0; j < n(c, 9); j++) { const sp = rnd(150, 300) * m / c.p.dur, d = a + rnd(-0.14, 0.14);
          puff(c, x, y, { vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, drag: 3.4, s0: 10 * m, s1: rnd(40, 62) * m, life: L(c, rnd(0.7, 1.3)), a0: 0.8, a1: 0, tint: pick([0xcfcac0, 0xe9e5dc, 0xa8a398]) }); }
        const cx = x + Math.cos(a) * 24 * m, cy = y + Math.sin(a) * 24 * m;
        c.pool.draw((g, ga, k) => { const r = (10 + 40 * k) * m; g.lineStyle(7 * (1 - k) + 1, 0xe9e5dc, 0.55 * (1 - k)); g.strokeEllipse(cx + Math.cos(a) * 40 * k * m, cy + Math.sin(a) * 40 * k * m, r * 2, r * 0.7); }, 520 * c.p.dur);
      });
    },
    C(c) {   // dirty powder smoke that rolls into a long wind-blown haze bank
      const m = S_(c);
      volley(c, (x, y, a) => {
        glow(c, x + Math.cos(a) * 12, y + Math.sin(a) * 12, 56 * m, 80, hue(0xffc060, c.p.hue));
        for (let j = 0; j < n(c, 6); j++) { const sp = rnd(30, 110) * m / c.p.dur;
          puff(c, x, y, { vx: Math.cos(a) * sp + 20, vy: Math.sin(a) * sp * 0.6 - 4, drag: 0.9, s0: 16 * m, s1: rnd(50, 80) * m, life: L(c, rnd(1.2, 2)), a0: 0.8, a1: 0, tint: pick([0xb3a998, 0x8a8479, 0xcfc4ae]) }); }
        for (let j = 0; j < n(c, 3); j++) puff(c, x + rnd(-6, 6), y - 10, { vx: rnd(14, 34), vy: rnd(-6, 2), drag: 0.15, s0: 30 * m, s1: rnd(90, 130) * m, life: L(c, rnd(3, 4.2)), a0: 0.4, a1: 0, tint: 0xcfc9bb, depth: 8.9 });
        embers(c, x, y, a, m);
      });
    },
  };

  // ================= 3. burning ship and incendiary fire =================
  // These loop for ~5 s; the ship burns at its middle and a fire patch lies on the water ahead of it (the game has no ground fire yet).
  const PX = c => c.x + 150, PY = c => c.y + 30;
  const fireFx = {
    cur(c) {   // the game's damage states: flames on the hull (FX.flame) and dark smoke (FX.dmg)
      const sh = c.ship; sh.hp = sh.maxHp * 0.2; sh.burnT = 4 * c.p.dur;
      emitLoop(c, 4, 0.05, () => FX.flame.emitParticleAt(sh.x + rnd(-0.3, 0.3) * sh.art.len, sh.y + rnd(-5, 5), 1));
      emitLoop(c, 4, 0.1, () => { FX.tint = 0x1e1a17; FX.dmg.emitParticleAt(sh.x + rnd(-0.3, 0.3) * sh.art.len, sh.y, 1); });
      c.pool.at(4200 * c.p.dur, () => { sh.hp = sh.maxHp; sh.burnT = 0; });
    },
    A(c) {   // tapered flame tongues and a tall, bending smoke column; a flaming oil patch ahead
      const m = S_(c), sh = c.ship, px = PX(c), py = PY(c);
      emitLoop(c, 5, rate(c, 0.035), () => c.pool.add({ tex: "lab-flame", x: sh.x + rnd(-0.3, 0.3) * sh.art.len, y: sh.y + rnd(-6, 6), vx: rnd(-6, 6), vy: -rnd(24, 50) * m, drag: 0.6, s0: 22 * m, s1: 8 * m, sy: 1.4, life: rnd(0.35, 0.7), ramp: HR(FLAME, c.p.hue), a0: 1, a1: 0, depth: 9.2 }));
      emitLoop(c, 5, rate(c, 0.07), () => puff(c, sh.x + rnd(-0.3, 0.3) * sh.art.len, sh.y - 6, { vx: 12 + rnd(-6, 10), vy: -rnd(34, 58) * m, drag: 0.15, s0: 14 * m, s1: rnd(60, 90) * m, life: rnd(2.2, 3.2), a0: 0.65, a1: 0, tint: pick(HR(SMOKE, c.p.hue * 0.2)), depth: 9.05 }));
      emitLoop(c, 5, rate(c, 0.06), () => c.pool.add({ tex: "lab-flame", x: px + rnd(-32, 32) * m, y: py + rnd(-12, 12) * m, vy: -rnd(8, 28), s0: 18 * m, s1: 6 * m, sy: 1.3, life: rnd(0.4, 0.8), ramp: HR(FLAME, c.p.hue), a0: 0.95, a1: 0 }));
      c.pool.draw((g, ga, k) => { ga.fillStyle(hue(0xff6a2a, c.p.hue), 0.22 * (1 - k * k)); ga.fillEllipse(px, py, 110 * m, 46 * m); }, L(c, 5) * 1000);
    },
    B(c) {   // ground-fire: spiky flames on a glowing scorch, embers rising; the ship only smoulders
      const m = S_(c), sh = c.ship, px = PX(c), py = PY(c);
      c.pool.draw((g, ga, k) => { const f = k < 0.85 ? 1 : (1 - k) / 0.15, r = (52 + 6 * Math.sin(k * 40)) * m * f; g.fillStyle(0x1a0c06, 0.45 * f); g.fillEllipse(px, py, r * 2.1, r * 1.1); ga.fillStyle(hue(0xff7a2a, c.p.hue), 0.3 * f); ga.fillEllipse(px, py, r * 1.7, r * 0.9); ga.lineStyle(2, hue(0xffd070, c.p.hue), 0.7 * f); ga.strokeEllipse(px, py, r * 2, r); }, L(c, 5) * 1000);
      emitLoop(c, 4.3, rate(c, 0.02), () => { const a = rnd(0, T), r = Math.sqrt(Math.random()) * 50 * m; c.pool.add({ tex: "lab-flame", x: px + Math.cos(a) * r, y: py + Math.sin(a) * r * 0.5, vy: -rnd(6, 20), s0: rnd(14, 24) * m, s1: 4, sy: rnd(1.2, 1.9), life: rnd(0.3, 0.7), ramp: HR(FLAME, c.p.hue), a0: 1, a1: 0 }); });
      emitLoop(c, 4.5, rate(c, 0.12), () => c.pool.add({ x: px + rnd(-40, 40) * m, y: py, vx: rnd(-10, 10), vy: -rnd(30, 70), s0: 4, s1: 1, life: rnd(0.8, 1.6), tint: pick([0xffb347, 0xff7a2a, 0xffd27a]) }));
      emitLoop(c, 5, rate(c, 0.18), () => puff(c, px + rnd(-20, 20), py - 8, { vx: 10, vy: -rnd(20, 36), s0: 18 * m, s1: 56 * m, life: 2.2, a0: 0.4, a1: 0, tint: 0x4a443f, depth: 9.05 }));
      emitLoop(c, 5, rate(c, 0.22), () => puff(c, sh.x + rnd(-0.3, 0.3) * sh.art.len, sh.y - 4, { vx: 10, vy: -rnd(20, 34), s0: 12 * m, s1: 48 * m, life: 2, a0: 0.45, a1: 0, tint: 0x5a524a, depth: 9.05 }));
    },
    C(c) {   // oil fire: a dark slick with fingers of flame, popping sparks; the deck fire is hotter with thick black smoke
      const m = S_(c), sh = c.ship, px = PX(c), py = PY(c), fingers = Array.from({ length: 9 }, (_, i) => ({ a: i / 9 * T + rnd(-0.3, 0.3), l: rnd(0.55, 1) }));
      c.pool.draw((g, ga, k) => { const f = k < 0.85 ? 1 : (1 - k) / 0.15, t = k * 30; g.fillStyle(0x0c0806, 0.55 * f); g.fillEllipse(px, py, 120 * m * f, 56 * m * f);
        for (const fg of fingers) { const l = fg.l * 60 * m * f * (0.85 + 0.15 * Math.sin(t + fg.a * 3)); ga.lineStyle(7 * m, hue(0xff6a2a, c.p.hue), 0.55 * f); ga.lineBetween(px, py, px + Math.cos(fg.a) * l, py + Math.sin(fg.a) * l * 0.5); ga.lineStyle(2.5 * m, hue(0xffe08a, c.p.hue), 0.8 * f); ga.lineBetween(px, py, px + Math.cos(fg.a) * l * 0.8, py + Math.sin(fg.a) * l * 0.4); } }, L(c, 5) * 1000);
      emitLoop(c, 4.5, rate(c, 0.03), () => { const a = rnd(0, T), r = Math.sqrt(Math.random()) * 52 * m; c.pool.add({ x: px + Math.cos(a) * r, y: py + Math.sin(a) * r * 0.5, vy: -rnd(14, 34), s0: rnd(16, 26) * m, s1: 6, life: rnd(0.3, 0.6), ramp: HR(FLAME, c.p.hue), a0: 0.85, a1: 0 }); });
      emitLoop(c, 4.5, rate(c, 0.2), () => sparks(c, px + rnd(-30, 30), py, 3, 90 * m, 0.7, [0xffd27a, 0xff8a3a], { ay: 120 }));
      emitLoop(c, 5, rate(c, 0.04), () => c.pool.add({ x: sh.x + rnd(-0.28, 0.28) * sh.art.len, y: sh.y + rnd(-5, 5), vy: -rnd(20, 44), s0: rnd(18, 30) * m, s1: 6, life: rnd(0.3, 0.6), ramp: HR(FLAME, c.p.hue), a0: 0.95, a1: 0 }));
      emitLoop(c, 5, rate(c, 0.1), () => puff(c, sh.x + rnd(-0.3, 0.3) * sh.art.len, sh.y - 8, { vx: 14, vy: -rnd(40, 70) * m, s0: 14 * m, s1: 70 * m, life: 2.6, a0: 0.55, a1: 0, tint: 0x1e1a17, depth: 9.05 }));
    },
  };

  // ================= 4 + 5. waterspout and whirlpool =================
  const SPOUT = [0xf2fafc, 0xb9cdd4, 0x7f939b];
  function spiralAt(c, x, y, o) {   // particles that circle (x, y), their radius going r0 -> r1; fn drives the orbit
    const m = S_(c), cnt = n(c, o.cnt);
    for (let i = 0; i < cnt; i++) {
      const a0 = rnd(0, T), r0 = rnd(o.r0[0], o.r0[1]) * m, life = L(c, rnd(o.life[0], o.life[1]));
      c.pool.add({ depth: 9.2, ...o.p(i, m), x, y, life, delay: rnd(0, life), a0: o.a0 ?? 0.9, a1: 0, fn: (p, dt, k) => {
        const r = r0 + (o.r1 * m - r0) * (o.ease ? k * k : k), a = a0 + o.spin * k * life / c.p.dur;
        p.x = x + Math.cos(a) * r; p.y = y + Math.sin(a) * r * o.sq - (o.rise || 0) * k * m; p.vx = p.vy = 0; } });
    }
  }
  function ghost(c, kind, x, y, secs) {   // the "current" spout / whirlpool: the game's arms on a Graphics (copied from js/disasters-art.js disSwirl)
    const R = kind === "spout" ? 110 : 130, core = kind === "spout" ? 40 : 48, arms = kind === "spout" ? 3 : 4, pal = kind === "spout" ? { deep: 0x37454d, arm: 0x8a9aa2, crest: 0xe6f0f2 } : { deep: 0x04121f, arm: 0x1b4f78, crest: 0xbfe8f5 };
    c.pool.draw((g, ga, k) => { const t = k * secs * 5, grow = Math.min(1, t * 0.2 + 0.6), spin = t * 1.6;
      g.fillStyle(pal.deep, 0.5 * grow); g.fillCircle(x, y, R * 0.55 * grow); g.fillStyle(pal.deep, 0.55 * grow); g.fillCircle(x, y, core * 1.15);
      for (let a = 0; a < arms; a++) for (let pass = 0; pass < 2; pass++) { g.lineStyle(pass ? 3 : 9, pass ? pal.crest : pal.arm, (pass ? 0.8 : 0.4) * grow); g.beginPath();
        for (let i = 0; i <= 16; i++) { const u = i / 16, r = (core * 0.4 + u * R * 0.92) * grow, an = a * T / arms + spin - u * 4.2; const px = x + Math.cos(an) * r, py = y + Math.sin(an) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.strokePath(); }
      g.lineStyle(3, 0xffb347, 0.5); g.strokeCircle(x, y, core); }, secs * 1000 * c.p.dur);
  }
  const spoutFx = {
    cur(c) { ghost(c, "spout", c.x, c.y, 5); },
    A(c) {   // grey cloud heart with white spray arms spinning up and out
      const x = c.x, y = c.y, m = S_(c);
      c.pool.draw((g, ga, k) => { const f = edge(k); g.fillStyle(0x37454d, 0.5 * f); g.fillEllipse(x, y, 130 * m, 90 * m); g.fillStyle(0x1f2b31, 0.5 * f); g.fillEllipse(x, y, 40 * m, 28 * m); }, L(c, 5) * 1000);
      spiralAt(c, x, y, { cnt: 100, r0: [12, 22], r1: 78, life: [1.1, 2], spin: 5.5, sq: 0.62, rise: 70, p: () => ({ s0: 16 * m, s1: rnd(40, 64) * m, ramp: HR(SPOUT, c.p.hue * 0.3), add: false, tex: "lab-puff1", depth: 9.2 }), a0: 0.8 });
      emitLoop(c, 4.6, 0.5 * c.p.dur, () => ring(c, x, y, 20 * m, 80 * m, 800 * c.p.dur, 0xeaf8ff, 4, 0.6, false, 0.62));
    },
    B(c) {   // wind-streak arcs on several radii, turning at different speeds, droplets flung off tangentially
      const x = c.x, y = c.y, m = S_(c), na = n(c, 22), arcs = Array.from({ length: na }, (_, i) => ({ r: (14 + i * 3.4) * m, a: rnd(0, T), sp: (4.2 - i * 0.12) * (i % 2 ? 1 : 0.8), l: rnd(0.5, 1.4), w: 1.5 + (i % 3) }));
      c.pool.draw((g, ga, k) => { const f = edge(k), t = k * L(c, 5);
        g.fillStyle(0x2b3a42, 0.35 * f); g.fillEllipse(x, y, 140 * m, 90 * m);
        for (const r of arcs) { const a0 = r.a + t * r.sp / c.p.dur; ga.lineStyle(r.w * 1.6, 0xeaf8ff, 0.8 * f); ga.beginPath(); ga.arc(x, y, r.r, a0, a0 + r.l); ga.strokePath(); } }, L(c, 5) * 1000);
      emitLoop(c, 4.6, rate(c, 0.04), () => { const a = rnd(0, T), r = rnd(50, 66) * m; c.pool.add({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.65, vx: -Math.sin(a) * 150 * m, vy: Math.cos(a) * 100 * m, drag: 1.5, s0: 5, s1: 2, life: rnd(0.4, 0.9), tint: 0xeaf8ff, a0: 0.9, a1: 0 }); });
    },
    C(c) {   // glowing cyan energy vortex: additive arms, lifted motes, bright core
      const x = c.x, y = c.y, m = S_(c);
      c.pool.draw((g, ga, k) => { const f = edge(k), t = k * L(c, 5), pu = 0.7 + 0.3 * Math.sin(t * 9);
        g.fillStyle(0x0a2a3a, 0.45 * f); g.fillEllipse(x, y, 130 * m, 84 * m);
        for (let a = 0; a < 3; a++) { ga.lineStyle(4 * m, hue(0x7fe8ff, c.p.hue), 0.7 * f); ga.beginPath();
          for (let i = 0; i <= 22; i++) { const u = i / 22, r = (8 + u * 62) * m, an = a * T / 3 + t * 5 / c.p.dur - u * 4.4, px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.62 - u * 20 * m; i ? ga.lineTo(px, py) : ga.moveTo(px, py); } ga.strokePath(); }
        ga.fillStyle(hue(0xcff8ff, c.p.hue), 0.5 * f * pu); ga.fillCircle(x, y, 14 * m); }, L(c, 5) * 1000);
      spiralAt(c, x, y, { cnt: 46, r0: [60, 72], r1: 6, life: [0.9, 1.6], spin: 6, sq: 0.62, rise: 40, ease: 1, p: () => ({ s0: 9 * m, s1: 2, tint: hue(pick([0xbff6ff, 0x7fe8ff, 0xffffff]), c.p.hue) }) });
    },
  };
  const vortexFx = {
    cur(c) { ghost(c, "vortex", c.x, c.y, 5); },
    A(c) {   // a funnel of rings that darken toward the middle, foam arms running inward
      const x = c.x, y = c.y, m = S_(c);
      c.pool.draw((g, ga, k) => { const f = edge(k), t = k * L(c, 6);
        for (let i = 0; i < 7; i++) { const r = (95 - i * 12) * m * f; g.fillStyle(mix(0x2a8ab0, 0x020c14, i / 6), 0.3 * f); g.fillEllipse(x + i * 1.5, y + i * 2, r * 2, r * 1.15); }
        for (let a = 0; a < 4; a++) { ga.lineStyle(3, 0xdff6ff, 0.65 * f); ga.beginPath(); for (let i = 0; i <= 20; i++) { const u = i / 20, r = (92 - u * 80) * m * f, an = a * T / 4 + t * 2.4 / c.p.dur + u * 5, px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.57; i ? ga.lineTo(px, py) : ga.moveTo(px, py); } ga.strokePath(); } }, L(c, 6) * 1000);
      spiralAt(c, x, y, { cnt: 50, r0: [70, 100], r1: 4, life: [1.4, 2.2], spin: 3.2, sq: 0.57, ease: 1, p: () => ({ s0: 12 * m, s1: 2, tint: hue(pick([0xffffff, 0xbfe8f5]), c.p.hue * 0.3) }), a0: 0.85 });
    },
    B(c) {   // blue-violet energy vortex: glowing arms, sparkles falling in, a pulsing bright eye
      const x = c.x, y = c.y, m = S_(c);
      c.pool.draw((g, ga, k) => { const f = edge(k), t = k * L(c, 6), pu = 0.6 + 0.4 * Math.sin(t * 7);
        g.fillStyle(0x050818, 0.55 * f); g.fillEllipse(x, y, 190 * m * f, 108 * m * f);
        for (let a = 0; a < 5; a++) for (const [w, al, col] of [[9, 0.25, 0x4a38c8], [3, 0.85, 0x9fd8ff]]) { ga.lineStyle(w * m, hue(col, c.p.hue), al * f); ga.beginPath();
          for (let i = 0; i <= 22; i++) { const u = i / 22, r = (94 - u * 84) * m * f, an = a * T / 5 + t * 3 / c.p.dur + u * 4.6, px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.57; i ? ga.lineTo(px, py) : ga.moveTo(px, py); } ga.strokePath(); }
        ga.fillStyle(hue(0xb9a8ff, c.p.hue), 0.55 * f * pu); ga.fillEllipse(x, y, 34 * m, 20 * m); ga.lineStyle(2, 0xffffff, 0.8 * f); ga.strokeEllipse(x, y, 36 * m * (1 + 0.2 * pu), 22 * m * (1 + 0.2 * pu)); }, L(c, 6) * 1000);
      spiralAt(c, x, y, { cnt: 40, r0: [60, 100], r1: 3, life: [1, 1.8], spin: 4, sq: 0.57, ease: 1, p: () => ({ s0: 8 * m, s1: 1, tint: hue(pick([0xffffff, 0xb9a8ff, 0x7fc8ff]), c.p.hue) }) });
    },
    C(c) {   // stacked foamy rings turning at different speeds, darker and slower toward the core; bubbles escape
      const x = c.x, y = c.y, m = S_(c);
      c.pool.draw((g, ga, k) => { const f = edge(k), t = k * L(c, 6);
        for (let i = 0; i < 6; i++) { const r = (92 - i * 14) * m * f, sp = (0.6 + i * 0.5) * (i % 2 ? -1 : 1) / c.p.dur; g.fillStyle(mix(0x2f8fb8, 0x03121c, i / 5), 0.38 * f); g.fillEllipse(x, y + i * 2, r * 2, r * 1.14);
          ga.lineStyle(3 + (i % 2) * 2, 0xe6f8ff, 0.6 * f); for (let s = 0; s < 6; s++) { const a0 = t * sp + s * T / 6; ga.beginPath(); ga.arc(x, y + i * 2, r, a0, a0 + 0.5); ga.strokePath(); } } }, L(c, 6) * 1000);
      emitLoop(c, 5.5, rate(c, 0.07), () => c.pool.add({ tex: "fx-bubble", add: false, x: x + rnd(-14, 14) * m, y: y + rnd(-5, 5), vy: -rnd(10, 30), s0: 6, s1: 12, life: rnd(0.7, 1.3), a0: 0.9, a1: 0 }));
    },
  };

  // ================= 6. tsunami / rogue wave =================
  // The wall sweeps left to right across the stage over ~3.4 s * dur. Its extent is the whole stage height.
  const waveFx = {
    cur(c) {   // the game's wall: a dark trough strip and three wobbling foam lines (js/disasters-art.js disWallDraw)
      const W = c.W, H = c.H;
      c.pool.draw((g, ga, k) => { const f = -60 + k * (W + 220), t = k * 10;
        g.fillStyle(0x06202e, 0.38); g.fillRect(f - 150, 0, 150, H);
        for (const [back, w, al] of [[0, 10, 0.95], [52, 5, 0.6], [105, 3, 0.35]]) { g.lineStyle(w, 0xeaf8ff, al); g.beginPath(); for (let i = 0; i <= 30; i++) { const y = i * H / 30, x = f - back + Math.sin(i * 0.9 + t * 3) * 7; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokePath(); } }, L(c, 3.4) * 1000);
    },
    A(c) {   // a foam-capped wall: crest puffs ride the front, spray leaps ahead, white wash trails behind
      const W = c.W, H = c.H, m = S_(c), dur = L(c, 3.4), vx = (W + 220) / dur;
      c.pool.draw((g, ga, k) => { const f = -60 + k * (W + 220); g.fillStyle(0x08334a, 0.4); g.fillRect(f - 180 * m, 0, 180 * m, H); g.fillStyle(0xbfeaf5, 0.14); g.fillRect(f - 40 * m, 0, 40 * m, H); }, dur * 1000);
      emitLoop(c, 3.4, rate(c, 0.012), kk => { const f = -60 + kk * (W + 220), y = rnd(0, H);
        puff(c, f + rnd(-10, 6), y, { vx: vx * 0.55, vy: rnd(-12, 12), drag: 0.4, s0: 16 * m, s1: rnd(34, 52) * m, life: rnd(0.7, 1.3), a0: 0.9, a1: 0, tint: pick([0xffffff, 0xeaf8ff, 0xcfeef7]) });
        if (Math.random() < 0.3) c.pool.add({ x: f + 6, y, vx: vx * rnd(1.1, 1.7), vy: rnd(-40, 40), drag: 1.4, s0: 5, s1: 2, life: rnd(0.4, 0.8), tint: 0xffffff, a0: 0.9, a1: 0 }); });
    },
    B(c) {   // layered tidal surge: translucent turquoise bands stepping down behind a curling crest line, mist off the lip
      const W = c.W, H = c.H, m = S_(c);
      c.pool.draw((g, ga, k) => { const f = -60 + k * (W + 220), t = k * 12;
        for (let b = 5; b >= 0; b--) { g.fillStyle(mix(0x7fe3e8, 0x0a4a62, b / 5), 0.2 + (5 - b) * 0.02); g.fillRect(f - (b + 1) * 34 * m, 0, 34 * m, H); }
        for (const [w, al, col, off] of [[14, 0.5, 0x9fe8ee, -4], [6, 0.95, 0xffffff, 0]]) { ga.lineStyle(w * m, hue(col, c.p.hue), al); ga.beginPath(); for (let i = 0; i <= 40; i++) { const y = i * H / 40, x = f + off + Math.sin(i * 0.7 + t * 3) * 6 + Math.sin(i * 0.23 + t) * 9; i ? ga.lineTo(x, y) : ga.moveTo(x, y); } ga.strokePath(); }
        for (let i = 0; i < 12; i++) { const y = (i + 0.5) * H / 12, x = f - 8 - ((i * 37 + t * 20) % 60) * m; ga.lineStyle(2, 0xffffff, 0.45); ga.lineBetween(x, y, x - 26 * m, y + 3); } }, L(c, 3.4) * 1000);
      emitLoop(c, 3.4, rate(c, 0.02), kk => { const f = -60 + kk * (W + 220); puff(c, f, rnd(0, H), { vx: rnd(10, 40), vy: rnd(-8, 8), s0: 18 * m, s1: 44 * m, life: 0.9, a0: 0.45, a1: 0, tint: 0xeaf8ff }); });
    },
    C(c) {   // rogue wave: one tall curved crest that breaks into a spray burst and a ripple on the ship
      const W = c.W, H = c.H, m = S_(c), T0 = L(c, 3.4), sh = c.ship, bow = y => -Math.pow((y - sh.y) / (H * 0.5), 2) * 70, hitK = (sh.x + 60 - bow(sh.y)) / (W + 220);
      c.pool.draw((g, ga, k) => { const f = -60 + k * (W + 220), t = k * 12;
        for (const [gg, w, al, col] of [[g, 26 * m, 0.35, 0x0b3a52], [ga, 10 * m, 0.95, 0xeaf8ff]]) { gg.lineStyle(w, col, al); gg.beginPath();
          for (let i = 0; i <= 30; i++) { const y = i * H / 30, x = f + bow(y) + Math.sin(i * 0.8 + t * 3) * 4; i ? gg.lineTo(x, y) : gg.moveTo(x, y); } gg.strokePath(); } }, T0 * 1000);
      c.pool.at(T0 * 1000 * hitK, () => { const x = sh.x - 20; glow(c, x, sh.y, 140 * m, 260, 0xeaf8ff, 0.5);
        for (let i = 0; i < n(c, 46); i++) c.pool.add({ x, y: sh.y + rnd(-30, 30), vx: rnd(-40, 200) * m, vy: rnd(-120, 120) * m, drag: 1.2, s0: rnd(6, 16) * m, s1: 3, life: L(c, rnd(0.5, 1.2)), tint: 0xffffff, a0: 0.9, a1: 0 });
        ring(c, x + 20, sh.y, 10, 130 * m, 900 * c.p.dur, 0xeaf8ff, 5, 0.8, true, 0.5); });
      emitLoop(c, 3.4, rate(c, 0.03), kk => { const f = -60 + kk * (W + 220), y = rnd(0, H); c.pool.add({ x: f + bow(y), y, vx: 40, s0: 8 * m, s1: 3, life: 0.5, tint: 0xffffff, a0: 0.8, a1: 0 }); });
    },
  };

  // ================= 7. lightning strike + fog =================
  function flashScreen(c, a, ms) { const W = c.W, H = c.H; c.pool.draw((g, ga, k) => { ga.fillStyle(0xdceeff, a * (1 - k) * (1 - k)); ga.fillRect(0, 0, W, H); }, ms); }
  function fogBanks(c, mode, cnt) {   // fog rolling in: low wide puffs; mode 0 layered banks, 1 swirling round the ship, 2 dense and lit
    const m = S_(c), sh = c.ship, W = c.W, H = c.H, dur = L(c, 5), top = mode === 2 ? 0.34 : 0.26;
    for (let i = 0; i < n(c, cnt); i++) {
      const y = mode === 1 ? sh.y + rnd(-90, 90) : rnd(30, H - 30), x0 = rnd(-40, W + 40), s = rnd(170, 280) * m, ph = rnd(0, T);
      puff(c, x0, y, { s0: s * 0.5, s1: s, life: dur * rnd(0.8, 1.1), delay: rnd(0, dur * 0.35), a0: top, a1: 0, tint: mode === 2 ? 0xdbe5ea : 0xc9d6dc, depth: 9.6,
        fn: (p, dt, k) => { p.vx = mode === 1 ? -(p.y - sh.y) * 0.3 + 8 : 14 * Math.sin(ph + k * 3); p.vy = mode === 1 ? (p.x - sh.x) * 0.03 : 3 * Math.cos(ph + k * 2); p.a0 = top * (k < 0.25 ? k / 0.25 : 1); } });
    }
  }
  function strike(c, kind) {
    const sh = c.ship, m = S_(c), x = sh.x + sh.art.len * 0.15, y = sh.y, top = -20, col = hue(kind === "B" ? 0xd8c8ff : 0xdff0ff, c.p.hue);
    const main = bolt(x, top, x, y, 26), forks = branches(main, kind === "C" ? 2 : 3, 0.8);
    const hit = () => {
      flashScreen(c, kind === "B" ? 0.55 : 0.4, 380 * c.p.dur);
      c.pool.draw((g, ga, k) => { const a = 1 - k; for (const f of forks) { strokePts(ga, f, 5 * m * a, col, 0.35 * a); strokePts(g, f, 1.8, 0xffffff, a); } strokePts(ga, main, 14 * m * a, col, 0.4 * a); strokePts(ga, main, 6 * m * a, 0xffffff, 0.8 * a); strokePts(g, main, 2.6, 0xffffff, a); }, 320 * c.p.dur);
      glow(c, x, y, 200 * m, 300, 0xffffff, 1); ring(c, x, y, 8, 120 * m, 520 * c.p.dur, col, 6, 0.9, true, 0.55); sparks(c, x, y, n(c, 28), 230 * m, 0.8, [0xffffff, col, 0xfff2a0], { ay: 90 });
    };
    if (kind === "B") {   // two pre-flickers, then the stroke; a violet plasma ball and rising steam
      const pre = bolt(x, top, x, y, 30);
      [0, 130].forEach(d => c.pool.at(d * c.p.dur, () => { c.pool.draw((g, ga, k) => strokePts(ga, pre, 4, 0xb9a8ff, 0.7 * (1 - k)), 90); flashScreen(c, 0.15, 160); }));
      c.pool.at(320 * c.p.dur, () => { hit(); c.pool.add({ x, y, s0: 30 * m, s1: 80 * m, life: L(c, 0.8), a0: 1, a1: 0, tint: hue(0xa890ff, c.p.hue) });
        for (let i = 0; i < n(c, 8); i++) puff(c, x + rnd(-12, 12), y, { vy: -rnd(24, 44), vx: rnd(-8, 8), s0: 12 * m, s1: 44 * m, life: L(c, 1.6), a0: 0.5, a1: 0, tint: 0xe9eef2, delay: rnd(0, 0.4) }); });
    } else if (kind === "C") {   // stroke, then electric arcs crawl over the hull
      hit();
      for (let a = 0; a < n(c, 6); a++) c.pool.at(a * 90 * c.p.dur + 80, () => { const p0 = { x: x + rnd(-0.4, 0.4) * sh.art.len, y: y + rnd(-6, 6) }, ar = bolt(p0.x, p0.y, p0.x + rnd(-30, 30), p0.y + rnd(-14, 14), 7);
        c.pool.draw((g, ga, k) => { strokePts(ga, ar, 4, 0x8fd0ff, 0.5 * (1 - k)); strokePts(g, ar, 1.5, 0xffffff, 1 - k); }, 120); });
    } else hit();
  }
  const stormFx = {
    cur(c) {   // the game's bolt: one zig-zag line, a white disc at the foot; fog as a clear circle with a grey wall (dis-fog)
      const sh = c.ship, W = c.W, H = c.H, x = sh.x + 10, y = sh.y, pts = [{ x, y: -90 }].concat(Array.from({ length: 8 }, (_, i) => ({ x: x + (i % 2 ? 1 : -1) * (14 + (i + 1) * 3) * (i < 7 ? 1 : 0), y: -90 + (i + 1) * ((y + 90) / 8) })));
      c.pool.draw((g, ga, k) => { const a = 1 - k; strokePts(g, pts, 9, 0xbfe3ff, a * 0.5); strokePts(g, pts, 3, 0xffffff, a); g.fillStyle(0xffffff, a * 0.5); g.fillCircle(x, y, 36 * (1.3 - a * 0.3)); }, 350);
      c.pool.at(500, () => {
        const im = c.sc.add.image(sh.x, sh.y, "lab-curfog").setDepth(9.6).setDisplaySize(340, 340).setAlpha(0), s = 170;
        const rects = [[0, 0, W, sh.y - s], [0, sh.y + s, W, H], [0, Math.max(0, sh.y - s), sh.x - s, Math.min(H, sh.y + s)], [sh.x + s, Math.max(0, sh.y - s), W, Math.min(H, sh.y + s)]]
          .map(r => c.sc.add.rectangle((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, Math.max(0, r[2] - r[0]), Math.max(0, r[3] - r[1]), 0xd6e0e4).setDepth(9.6).setAlpha(0));
        const dur = L(c, 4.5); let dead = false; const kill = () => { if (dead) return; dead = true; im.destroy(); rects.forEach(r => r.destroy()); };
        c.pool.draw((g, ga, k) => { const a = Math.min(1, k * 4) * (k > 0.85 ? (1 - k) / 0.15 : 1); im.setAlpha(a); rects.forEach(r => r.setAlpha(a * 0.94)); }, dur * 1000);
        c.pool.at(dur * 1000 + 20, kill);
        c.pool.extras.push(kill);   // a stop mid-way must clean these up too
      });
    },
    A(c) { strike(c, "A"); c.pool.at(500, () => fogBanks(c, 0, 46)); },   // forked bolt, then layered fog banks
    B(c) { strike(c, "B"); c.pool.at(700, () => fogBanks(c, 1, 46)); },   // flickering bolt + violet ball, then fog swirling round the ship
    C(c) { strike(c, "C"); c.pool.at(400, () => fogBanks(c, 2, 56)); },   // bolt + hull arcs, then dense fog
  };

  const mk = (cat, ver, fn, extra) => ({ cat, ver, play: fn, id: cat + "-" + ver, ...extra });
  const EFFECTS = [
    mk(1, "cur", blast.cur, { fixed: 1 }),
    mk(1, "A", blast.A),
    mk(1, "B", blast.B),
    mk(1, "C", blast.C),
    mk(2, "cur", muzzleFx.cur, { fixed: 1 }),
    mk(2, "A", muzzleFx.A),
    mk(2, "B", muzzleFx.B),
    mk(2, "C", muzzleFx.C),
    mk(3, "cur", fireFx.cur, { fixed: 1 }),
    mk(3, "A", fireFx.A),
    mk(3, "B", fireFx.B),
    mk(3, "C", fireFx.C),
    mk(4, "cur", spoutFx.cur, { fixed: 1 }),
    mk(4, "A", spoutFx.A),
    mk(4, "B", spoutFx.B),
    mk(4, "C", spoutFx.C),
    mk(5, "cur", vortexFx.cur, { fixed: 1 }),
    mk(5, "A", vortexFx.A),
    mk(5, "B", vortexFx.B),
    mk(5, "C", vortexFx.C),
    mk(6, "cur", waveFx.cur, { fixed: 1 }),
    mk(6, "A", waveFx.A),
    mk(6, "B", waveFx.B),
    mk(6, "C", waveFx.C),
    mk(7, "cur", stormFx.cur, { fixed: 1 }),
    mk(7, "A", stormFx.A),
    mk(7, "B", stormFx.B),
    mk(7, "C", stormFx.C),
  ];
  const SECS = [0, 3.5, 6, 6.5, 6.5, 7.5, 5, 6.5];   // how long (s at duration x1) until the effect is surely over
  return { EFFECTS, SECS, Pool, bake };
})();
