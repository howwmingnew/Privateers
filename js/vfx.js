"use strict";
// ---------- Combat VFX: muzzle flash, impacts, splashes, damage states, sinking, hit-stop, low-hull vignette ----------
// Every texture is drawn in code at boot and every emitter has a hard cap on live particles (halved-ish on touch
// devices). Effects off screen are skipped outright, so a 30-ship brawl costs only what the camera can see.
// Hooks (single-line calls from gameplay code):
//   vfxInit(sc)             once in create(), after makeTextures()
//   vfxFrame(dt) -> k       every frame, paused or not; returns the time scale for step() (< 1 during a hit-stop)
//   vfxShip(s, dt)          each living ship each step: wake + bow spray, damage smoke and flames, badge, player halo
//   vfxMuzzle(x, y, a)      each shot: flash and smoke blown along the firing direction a
//   vfxFlash(s)             a hull takes damage: white tint-fill flash (reads on black hulls too), then a short red tint
//   vfxHit(x, y)            a ball strikes a hull: sparks and wood splinters
//   vfxSplash(x, y, rock)   a ball falls in the sea (ring, column, droplets) or on rock (dust)
//   vfxSink(s, killer)      the sinking: lists, darkens and goes under with bubbles, foam and planks; sets s.dead (AI)
//   vfxRespawn(s)           put a sunk player's sprite back to normal
//   vfxHitStop(sec)         freeze the simulation briefly; particles and tweens keep moving
//   vfxSlowMo(sec, k)       run the simulation at k (< 1) for a while: a boss going down
const VFX_LOW = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } })();
let PERF_LOW = false;   // set by js/tech.js while frames run long: damage smoke and flames puff half as often
const vfxCap = n => Math.round(n * (VFX_LOW ? 0.55 : 1));
const FX = { deg: 0, tint: 0xffffff, sTint: 0xe9e5dc };
const SINK_TINT = 0x1d4e60;   // the hull fades toward the sea colour, so it goes under rather than into thin air
const DEBRIS_MAX = 60;
let hitStopT = 0, slowT = 0, slowK = 1, vigOn = false, vigEl = null, halo = null, debris = 0;
const toDeg = r => r * 180 / Math.PI;
const lerpColor = (a, b, k) => { const ch = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) << s; return ch(16) | ch(8) | ch(0); };

function vfxTextures(sc) {
  bakeCanvas(sc, "fx-soft", 32, 32, 1, c => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  bakeCanvas(sc, "fx-flash", 32, 16, 1, c => {   // a teardrop pointing +x, white core to orange tip
    const g = c.createRadialGradient(5, 8, 0, 8, 8, 25);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,226,140,.95)"); g.addColorStop(0.7, "rgba(255,140,50,.5)"); g.addColorStop(1, "rgba(255,90,30,0)");
    c.beginPath(); c.moveTo(1, 8); c.quadraticCurveTo(12, -1, 31, 8); c.quadraticCurveTo(12, 17, 1, 8); c.fillStyle = g; c.fill();
  });
  bakeCanvas(sc, "fx-ring", 64, 64, 1, c => { blur(c, 4, "#fff"); c.beginPath(); c.arc(32, 32, 26, 0, TAU); c.lineWidth = 3.5; c.strokeStyle = "rgba(255,255,255,.95)"; c.stroke(); });
  bakeCanvas(sc, "fx-splinter", 6, 2, 1, c => { c.fillStyle = "#fff"; c.fillRect(0, 0, 6, 2); });   // tinted per particle
  bakeCanvas(sc, "fx-bubble", 10, 10, 1, c => { c.beginPath(); c.arc(5, 5, 3.6, 0, TAU); c.lineWidth = 1.2; c.strokeStyle = "rgba(255,255,255,.95)"; c.stroke(); dot(c, 3.8, 3.8, 0.9, "#fff"); });
  bakeCanvas(sc, "fx-plank", 16, 5, artRes(), c => {
    c.fillStyle = "#8a5a2b"; c.fillRect(0.5, 0.5, 15, 4); c.lineWidth = 0.6; c.strokeStyle = "#4a2f16"; c.strokeRect(0.5, 0.5, 15, 4);
    line(c, 1.5, 2.2, 14, 2.6, 0.4, "rgba(40,20,8,.5)"); dot(c, 2.2, 2.5, 0.5, "#2a1a0e"); dot(c, 13.6, 2.5, 0.5, "#2a1a0e");
  });
  bakeCanvas(sc, "fx-halo", 128, 72, 1, c => {   // the player's marker: a soft light ring on the water
    blur(c, 8, "rgba(210,245,255,1)"); c.beginPath(); c.ellipse(64, 36, 54, 26, 0, 0, TAU); c.lineWidth = 4; c.strokeStyle = "rgba(225,248,255,.9)"; c.stroke();
    c.shadowBlur = 0; c.fillStyle = "rgba(200,240,255,.12)"; c.fill();
  });
}
function vfxInit(sc) {
  vfxTextures(sc);
  const E = (tex, depth, cfg) => sc.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(depth);
  Object.assign(FX, {
    flash: E("fx-flash", 8.6, { lifespan: 90, speed: 0, rotate: { onEmit: () => FX.deg }, scale: { start: 1.15, end: 0.7 }, alpha: { start: 1, end: 0 }, blendMode: "ADD", maxAliveParticles: vfxCap(60) }),
    smoke: E("fx-soft", 8, { lifespan: { min: 900, max: 1500 }, speed: { min: 18, max: 85 }, angle: { onEmit: () => FX.deg + rand(-26, 26) },
      scale: { start: 0.5, end: 1.9 }, alpha: { start: 0.55, end: 0 }, tint: { onEmit: () => FX.sTint }, maxAliveParticles: vfxCap(260) }),
    // a broadside's 1-2 frame bloom, and the embers it spits: what makes a still frame read as a gun going off
    bloom: E("fx-soft", 8.7, { lifespan: 50, speed: 0, scale: { start: 1.7, end: 1.2 }, alpha: { start: 0.95, end: 0 }, tint: 0xffd890, blendMode: "ADD", maxAliveParticles: vfxCap(30) }),
    ember: E("dot", 8.6, { lifespan: { min: 450, max: 850 }, speed: { min: 40, max: 120 }, angle: { onEmit: () => FX.deg + rand(-28, 28) }, scale: { start: 0.42, end: 0 },
      tint: [0xffb347, 0xff7a2a, 0xffd27a], blendMode: "ADD", maxAliveParticles: vfxCap(60) }),
    splinter: E("fx-splinter", 7.5, { lifespan: { min: 350, max: 700 }, speed: { min: 60, max: 170 }, rotate: { min: 0, max: 360 }, scale: { start: 1.1, end: 0.5 },
      alpha: { start: 1, end: 0 }, tint: [0xc79a62, 0x8a5a2b, 0xe3c08a, 0x5a3a20], maxAliveParticles: vfxCap(140) }),
    ring: E("fx-ring", 3, { lifespan: 520, speed: 0, scale: { start: 0.12, end: 0.55 }, alpha: { start: 0.75, end: 0 }, maxAliveParticles: vfxCap(60) }),
    column: E("fx-soft", 7, { lifespan: 380, speed: { min: 0, max: 16 }, scale: { start: 0.25, end: 0.95 }, alpha: { start: 0.95, end: 0 }, tint: 0xf2fbff, maxAliveParticles: vfxCap(70) }),
    dust: E("fx-soft", 7, { lifespan: 450, speed: { min: 10, max: 40 }, scale: { start: 0.3, end: 0.9 }, alpha: { start: 0.7, end: 0 }, tint: 0xb9ab8e, maxAliveParticles: vfxCap(40) }),
    dmg: E("fx-soft", 8.1, { lifespan: { min: 1200, max: 1900 }, speed: { min: 6, max: 22 }, scale: { start: 0.5, end: 2.6 }, alpha: { start: 0.72, end: 0 },
      tint: { onEmit: () => FX.tint }, maxAliveParticles: vfxCap(240) }),
    flame: E("fx-soft", 8.05, { lifespan: { min: 300, max: 600 }, speed: { min: 8, max: 30 }, scale: { start: 0.8, end: 0.15 }, alpha: { start: 1, end: 0 },
      tint: [0xffe08a, 0xffa040, 0xff6a2a], blendMode: "ADD", maxAliveParticles: vfxCap(150) }),
    bubble: E("fx-bubble", 3, { lifespan: { min: 500, max: 900 }, speed: { min: 0, max: 10 }, scale: { start: 0.45, end: 1 }, alpha: { start: 0.9, end: 0 }, maxAliveParticles: vfxCap(90) }),
    spray: E("fx-soft", 3.1, { lifespan: 520, speed: { min: 20, max: 45 }, angle: { onEmit: () => FX.deg + rand(-8, 8) }, scale: { start: 0.18, end: 0.55 },
      alpha: { start: 0.5, end: 0 }, tint: 0xf4fbfd, maxAliveParticles: vfxCap(180) }),
  });
  halo = sc.add.image(0, 0, "fx-halo").setDepth(3.5).setVisible(false);
  vigEl = document.getElementById("vignette") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "vignette" }));
}
function vfxHitStop(sec) { hitStopT = Math.max(hitStopT, sec); }
// Slow motion for a big kill: the simulation runs at k for sec real seconds (js/juice.js also slows tweens and particles).
function vfxSlowMo(sec, k) { slowT = Math.max(slowT, sec); slowK = k; }
function vfxFrame(dt) {
  if (typeof sceneryFrame === "function") sceneryFrame();
  if (halo && !(player && player.alive && !docked)) halo.setVisible(false);
  const low = !!(player && player.alive && !docked && !paused && player.hp < player.maxHp * 0.3);
  if (vigEl && low !== vigOn) { vigOn = low; vigEl.classList.toggle("on", low); }
  if (paused) return 1;   // hit-stop and slow motion are sea time: a pause (or the ledger) must not use them up
  if (hitStopT > 0) { hitStopT -= dt; return 0.05; }
  if (slowT > 0) { slowT -= dt; return slowK; }
  return 1;
}
const vfxSlowLeft = () => Math.max(0, slowT);
function vfxShip(s, dt) {
  const a = s.art || SHIP_ART.sloop, c = Math.cos(s.rot), sn = Math.sin(s.rot), vis = onScreen(s.x, s.y, 100);
  s.wakeT -= dt;
  if (s.kick) kickApply(s);   // hit knockback / broadside recoil, drawn on the sprite only (js/juice.js)
  if (s.speed > 25 && s.wakeT <= 0) {
    s.wakeT = 0.07;
    const back = a.len * 0.46;
    S.fx.wake.emitParticleAt(s.x - c * back, s.y - sn * back, 1);
    if (vis && s.speed > s.maxSpeed * 0.4) {   // bow spray: foam peeling off both shoulders in a V
      const bx = s.x + c * a.len * 0.36, by = s.y + sn * a.len * 0.36, w = a.beam * 0.45;
      for (const sg of [-1, 1]) { FX.deg = toDeg(s.rot + Math.PI - sg * 0.55); FX.spray.emitParticleAt(bx - sn * w * sg, by + c * w * sg, 1); }
    }
  }
  if (vis && s.maxHp) {   // damage states: grey smoke under half hull, black smoke and flames under a quarter
    const f = s.hp / s.maxHp;
    if (f < 0.5 && (s.smokeT = (s.smokeT || 0) - dt) <= 0) {
      s.smokeT = (f < 0.25 ? 0.1 : 0.22) * (PERF_LOW ? 2 : 1); FX.tint = f < 0.25 ? 0x1e1a17 : 0x9a958e;
      const k = rand(-0.35, 0.35) * a.len; FX.dmg.emitParticleAt(s.x + c * k, s.y + sn * k, 1);
    }
    if ((f < 0.25 || s.burnT > 0) && (s.flameT = (s.flameT || 0) - dt) <= 0) {
      s.flameT = (s.burnT > 0 ? 0.04 : 0.06) * (PERF_LOW ? 2 : 1);
      const k = rand(-0.3, 0.3) * a.len, w = rand(-0.3, 0.3) * a.beam;
      FX.flame.emitParticleAt(s.x + c * k - sn * w, s.y + sn * k + c * w, 1);
    }
    if (a.smoulder && f >= 0.5 && (s.smokeT = (s.smokeT || 0) - dt) <= 0) { s.smokeT = 0.35; FX.tint = 0x5a524a; FX.dmg.emitParticleAt(s.x + rand(-8, 8), s.y + rand(-5, 5), 1); }
  }
  if (s.badge) {
    const seen = dist(s, player) < LOOT_SEEN_R;
    if (seen !== !!s.lootSeen) { s.lootSeen = seen; refreshBadge(s); }
    labelText(s.badge); s.badge.setPosition(s.x, shipTop(s) - 20 * labelScale());
  }
  if (s.isPlayer && halo) halo.setPosition(s.x, s.y).setRotation(s.rot).setDisplaySize(a.len * 1.45, a.beam * 2.7)
    .setVisible(true).setAlpha(0.32 + 0.12 * Math.sin(S.time.now * 0.004));
}
function vfxMuzzle(x, y, a) {
  if (!onScreen(x, y, 120)) return;
  const c = Math.cos(a), s = Math.sin(a);
  FX.deg = toDeg(a);
  FX.flash.emitParticleAt(x + c * 12, y + s * 12, 1);   // the teardrop's base sits on the muzzle
  FX.bloom.emitParticleAt(x + c * 10, y + s * 10, 1);
  // smoke strung out along the barrel line, the outer puffs dirtier: a plume, not a white disc on the muzzle
  for (let i = 0; i < 5; i++) {
    const d = 4 + i * 6.5 + rand(-2, 2), w = rand(-2.5, 2.5);
    FX.sTint = i >= 3 ? 0xb3a998 : 0xe9e5dc;
    FX.smoke.emitParticleAt(x + c * d - s * w, y + s * d + c * w, 1);
  }
  FX.sTint = 0xe9e5dc;
  S.fx.spark.emitParticleAt(x + c * 8, y + s * 8, 2);
  FX.ember.emitParticleAt(x + c * 10, y + s * 10, 2);
}
function vfxFlash(s) {
  if (!s.spr || !s.alive) return;
  s.spr.setTintFill(0xffffff);
  S.time.delayedCall(60, () => { if (s.alive && s.spr.active) s.spr.setTint(0xffb0a0); });
  S.time.delayedCall(150, () => { if (s.alive && s.spr.active) s.spr.clearTint(); });
}
function vfxHit(x, y) {
  if (!onScreen(x, y, 80)) return;
  S.fx.spark.explode(8, x, y); FX.splinter.explode(7, x, y);
  FX.deg = rand(0, 360); FX.smoke.emitParticleAt(x, y, 2);
}
function vfxSplash(x, y, rock) {
  if (!onScreen(x, y, 60)) return;
  if (rock) { FX.dust.explode(5, x, y); S.fx.splash.explode(3, x, y); return; }
  FX.ring.emitParticleAt(x, y, 1); FX.column.explode(3, x, y); S.fx.splash.explode(7, x, y);
}
// A quick zoom kick that hands the zoom back untouched unless something else changed it meanwhile. One punch at a
// time: a bigger one takes over from a running one at its base zoom (a boss kill's +9% comes in the same frame as the
// ordinary kill's +3.5%, which used to stop it), and a smaller one during a bigger one is dropped.
let punchNow = null;   // { tw, z0, amt, last }
function vfxPunch(amt) {
  if (!SETTINGS.shake) return;
  const cam = S.cameras.main, run = punchNow && punchNow.tw.isPlaying() && Math.abs(cam.zoom - punchNow.last) < 1e-9 ? punchNow : null;
  if (run && run.amt >= amt) return;
  if (run) { run.tw.stop(); cam.setZoom(run.z0); }
  const p = { z0: cam.zoom, amt, last: cam.zoom };
  p.tw = S.tweens.addCounter({ from: 1, to: 0, duration: 180, ease: "Quad.easeOut",
    onUpdate: tw => { if (Math.abs(cam.zoom - p.last) > 1e-9) return tw.stop(); p.last = p.z0 * (1 + amt * tw.getValue()); cam.setZoom(p.last); },
    onComplete: () => { if (Math.abs(cam.zoom - p.last) < 1e-9) cam.setZoom(p.z0); } });
  punchNow = p;
}
function vfxSink(s, killer) {
  const spr = s.spr, a = s.art || SHIP_ART.sloop, base = s.artScale || 1, vis = onScreen(s.x, s.y, 120);
  if (s.isPlayer) { vfxHitStop(0.12); camShake(220, 0.008); }
  else if (killer === player) { vfxHitStop(0.065); camShake(160, 0.0063); vfxPunch(0.035); if (vis && typeof magazineBurst === "function") magazineBurst(s); }
  spr.setTintFill(0xffffff);
  const side = Math.random() < 0.5 ? -1 : 1;
  // she lists (rolls: narrower from above), swings a little and darkens toward the sea colour as she goes down
  S.tweens.add({ targets: spr, angle: spr.angle + side * rand(26, 40), scaleY: base * 0.55, scaleX: base * 0.88, duration: 1600, ease: "Quad.easeIn",
    onUpdate: tw => { if (tw.progress > 0.045) spr.setTint(lerpColor(0xffffff, SINK_TINT, Math.min(1, tw.progress * 1.4))); } });
  S.tweens.add({ targets: spr, alpha: 0, duration: 1600, ease: "Cubic.easeIn", onComplete: () => { if (!s.isPlayer) { spr.destroy(); s.dead = true; } } });
  if (!vis) return;
  S.time.addEvent({ delay: 65, repeat: 22, callback: () => FX.bubble.emitParticleAt(s.x + rand(-0.3, 0.3) * a.len, s.y + rand(-0.5, 0.5) * a.beam, 1) });
  foamRing(s.x, s.y, a.len / 64, 0); foamRing(s.x, s.y, a.len / 85, 380);
  for (let i = 0, n = 3 + Math.round(a.len / 28); i < n && debris < DEBRIS_MAX; i++) plank(s.x + rand(-0.3, 0.3) * a.len, s.y + rand(-0.4, 0.4) * a.beam);
}
function foamRing(x, y, k, delay) {
  const r = S.add.image(x, y, "fx-ring").setDepth(2.6).setScale(0.3 * k).setAlpha(0.7);
  S.tweens.add({ targets: r, scale: 1.9 * k, alpha: 0, duration: 1800, delay, ease: "Cubic.easeOut", onComplete: () => r.destroy() });
}
function plank(x, y) {   // floating debris: drifts, turns, fades over 8 s
  const p = S.add.image(x, y, "fx-plank").setDepth(2.7).setRotation(rand(0, TAU)).setScale(rand(0.7, 1.15) / artResOf("fx-plank"))
    .setTint(lerpColor(0xffffff, 0x6b4a2a, rand(0, 0.5)));
  const a = rand(0, TAU), d = rand(18, 50); debris++;
  S.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, angle: p.angle + rand(-120, 120), duration: 8000, ease: "Sine.easeOut" });
  S.tweens.add({ targets: p, alpha: 0, duration: 8000, ease: "Quart.easeIn", onComplete: () => { p.destroy(); debris--; } });
}
function vfxRespawn(s) {
  S.tweens.killTweensOf(s.spr);
  s.spr.clearTint().setAlpha(1).setScale(s.artScale || 1).setAngle(0);
}
