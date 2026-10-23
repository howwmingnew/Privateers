"use strict";
// ============================================================
// Privateers — MVP
// Core loop: sail out -> sink ships (auto broadside) -> collect plunder into the hold
// -> return to harbor to sell -> buy / upgrade guns and ship -> push into deeper, harder waters.
// ============================================================

// ---------- Scene ----------
class Main extends Phaser.Scene {
  constructor() { super("main"); }
  create() {
    S = this;
    islands = genIslands();
    makeTextures(this);
    const cam = this.cameras.main;
    cam.setBackgroundColor("#155a73").setBounds(0, 0, W, H);
    this.sea1 = this.add.tileSprite(0, 0, 16, 16, "wave").setOrigin(0).setDepth(0).setAlpha(0.36);
    this.sea2 = this.add.tileSprite(0, 0, 16, 16, "wave").setOrigin(0).setDepth(0).setAlpha(0.18).setTileScale(1.7);
    drawWorld(this);
    this.fx = {
      wake:   this.add.particles(0, 0, "puff", { lifespan: 1500, speed: 0, scale: { start: 0.6, end: 1.8 }, alpha: { start: 0.45, end: 0 }, emitting: false }).setDepth(3),
      smoke:  this.add.particles(0, 0, "puff", { lifespan: 800, speed: { min: 10, max: 45 }, scale: { start: 0.8, end: 2.2 }, alpha: { start: 0.8, end: 0 }, tint: 0xdedad0, emitting: false }).setDepth(8),
      spark:  this.add.particles(0, 0, "dot", { lifespan: 450, speed: { min: 60, max: 200 }, scale: { start: 1, end: 0 }, tint: [0xffd27a, 0xff8a3a, 0xff5a2a], blendMode: "ADD", emitting: false }).setDepth(8),
      splash: this.add.particles(0, 0, "dot", { lifespan: 550, speed: { min: 30, max: 90 }, scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.9, end: 0 }, tint: 0xe9f7fa, emitting: false }).setDepth(3),
    };
    this.arcG = this.add.graphics().setDepth(4);
    this.barG = this.add.graphics().setDepth(9);
    makePlayer(this);
    cam.startFollow(player.spr, true, 0.15, 0.15);
    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT");
    this.input.keyboard.on("keydown-SPACE", () => playerFire());
    for (let i = 0; i < ENEMY_COUNT; i++) spawnEnemy(this);
    for (const w of save.wrecks) addCrate(w.x, w.y, w.value, w);
    const fit = () => cam.setZoom(clamp(Math.min(this.scale.width, this.scale.height) / 720, 0.55, 1.1));
    this.scale.on("resize", fit); fit();
    buildMiniBase();
    player.spr.setPosition(player.x, player.y);
    cam.centerOn(player.x, player.y);
    hud(true);
    dock("welcome");
  }
  update(_, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const v = this.cameras.main.worldView;
    for (const [ts, k] of [[this.sea1, 1], [this.sea2, 0.6]]) {
      const tw = Math.ceil(v.width + 128), th = Math.ceil(v.height + 128);
      if (ts.width !== tw || ts.height !== th) ts.setSize(tw, th);
      ts.setPosition(v.x - 64, v.y - 64);
      ts.tilePositionX = (v.x - 64) / ts.tileScaleX + this.time.now * 0.004 * k; ts.tilePositionY = (v.y - 64) / ts.tileScaleY + this.time.now * 0.002 * k;
    }
    if (!paused) step(dt);
    drawOverlays();
    hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.1; }
    miniT -= dt; if (miniT <= 0) { drawMini(); miniT = 0.15; }
  }
}

function step(dt) {
  const K = S.keys;
  // --- player input ---
  if (player.alive) {
    let kx = (K.D.isDown || K.RIGHT.isDown) - (K.A.isDown || K.LEFT.isDown);
    let ky = (K.S.isDown || K.DOWN.isDown) - (K.W.isDown || K.UP.isDown);
    let ix = joyVec.x, iy = joyVec.y, m = joyVec.m;
    const keyActive = !!(kx || ky);
    if (prevKeyActive && !keyActive) playerFire();      // letting go of the keys fires, like letting go of the stick
    prevKeyActive = keyActive;
    if (kx || ky) { ix = kx; iy = ky; m = 1; }
    if (m > 0.2) { steer(player, Math.atan2(iy, ix), Math.min(1, m * 1.25), dt);
      if (!moved) { moved = true; document.getElementById("hint").style.opacity = 0; } }
    else steer(player, null, 0, dt);
  }
  // --- AI ---
  for (const e of enemies) if (e.alive) think(e, dt);
  // --- movement ---
  const ships = enemies.filter(e => e.alive); if (player.alive) ships.push(player);
  for (const s of ships) move(s, dt);
  for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
    const a = ships[i], b = ships[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < 40 && d > 0.01) { const p = (40 - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
  }
  for (const s of ships) {
    s.spr.setPosition(s.x, s.y).setRotation(s.rot);
    s.wakeT -= dt;
    if (s.speed > 25 && s.wakeT <= 0) { s.wakeT = 0.07; S.fx.wake.emitParticleAt(s.x - Math.cos(s.rot) * 30, s.y - Math.sin(s.rot) * 30, 1); }
    if (s.burnT > 0) { s.burnT -= dt; s.hp -= s.burnDps * dt; s.burnFx -= dt;
      if (s.burnFx <= 0) { s.burnFx = 0.08; S.fx.spark.emitParticleAt(s.x + rand(-20, 20), s.y + rand(-8, 8), 1); }
      if (s.hp <= 0) sink(s, s.burnSrc); }
    if (s.badge) s.badge.setPosition(s.x, s.y - 38);
  }
  // --- firing ---
  const living = enemies.filter(e => e.alive);
  for (const g of Object.values(player.guns).flat()) g.cd = Math.max(0, g.cd - dt);   // reload
  const engaged = player.alive && MOUNTS.some(mountEngaged);
  if (engaged && !engagedPrev && releaseTips < 3 && (joyVec.m > 0 || prevKeyActive)) { releaseTips++; toast(t("releaseTip")); }
  engagedPrev = engaged;
  for (const e of living) fire(e, e.target && isHostile(e, e.target) ? [e.target] : [], dt);
  // --- cannonballs ---
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const p = 1 - b.life / b.life0;
    b.spr.setPosition(b.x, b.y).setScale(1 + Math.sin(Math.PI * clamp(p, 0, 1)) * 0.6);
    let hit = null;
    if (!b.fromPlayer && player.alive && hitShip(player, b.x, b.y)) hit = player;
    if (!hit) for (const e of living) if (e !== b.owner && e.alive && hitShip(e, b.x, b.y)) { hit = e; break; }
    const onRock = !hit && islands.some(isl => Math.hypot(isl.x - b.x, isl.y - b.y) < isl.r * 0.9);
    if (hit) { S.fx.spark.explode(10, b.x, b.y); hurt(hit, b.dmg, b.burn, b.owner); }
    if (hit || onRock || b.life <= 0) {
      if (!hit) S.fx.splash.explode(onRock ? 4 : 8, b.x, b.y);
      b.spr.destroy(); balls.splice(i, 1);
    }
  }
  // --- plunder crates ---
  for (let i = crates.length - 1; i >= 0; i--) {
    const c = crates[i]; c.t += dt;
    const d = dist(c, player), room = player.cap - cargo;
    if (player.alive && d < 150 && room > 0) { const k = Math.min(1, 260 * dt / Math.max(d, 1)); c.x += (player.x - c.x) * k; c.y += (player.y - c.y) * k; }
    if (player.alive && d < 32) {
      if (room > 0) { const take = Math.min(room, c.value); cargo += take; c.value -= take; floatText(c.x, c.y - 10, t("fCargo", { n: fmt(take) }), "#f0c766", 17);
        if (c.wreck) { c.wreck.value = c.value; if (c.value <= 0) save.wrecks = save.wrecks.filter(w => w !== c.wreck); persist(); } }
      else if (S.time.now - lastHoldToast > 3000) { lastHoldToast = S.time.now; toast(t("toastFull")); }
    }
    if (c.wreck) { c.wreck.x = Math.round(c.x); c.wreck.y = Math.round(c.y); }
    c.spr.setPosition(c.x, c.y + Math.sin(c.t * 3) * 2).setAlpha(!c.wreck && c.t > 55 ? clamp((60 - c.t) / 5, 0, 1) : 1);
    if (c.label) c.label.setPosition(c.x, c.y - 26);
    if (c.value <= 0 || (!c.wreck && c.t > 60)) { c.spr.destroy(); c.label?.destroy(); crates.splice(i, 1); }
  }
  // --- harbor ---
  const dPort = Math.hypot(player.x - PORT.x, player.y - PORT.y);
  if (!canDock && dPort > DOCK_R + 80) canDock = true;
  if (canDock && player.alive && dPort < DOCK_R) dock("return");
  // --- population ---
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if (e.alive && e.angry <= 0 && dist(e, player) > 3000) { e.alive = false; e.spr.destroy(); e.badge.destroy(); enemies.splice(i, 1); }
  }
  spawnT -= dt;
  if (spawnT <= 0) { spawnT = 1.2; if (enemies.filter(e => e.alive).length < ENEMY_COUNT) spawnEnemy(S); }
}

function drawOverlays() {
  const g = S.arcG, bg = S.barG; g.clear(); bg.clear();
  const v = S.cameras.main.worldView;
  // Aim lines: hidden until an enemy nears a mount's firing arc. One straight line per cannon.
  //   red    = loaded, and the line passes through an enemy right now
  //   yellow = loaded, line misses
  //   faint  = reloading; the line grows back to full length as the gun reloads
  if (player.alive && !docked) {
    for (const mount of MOUNTS) {
      if (!mountEngaged(mount)) continue;
      const arr = player.guns[mount.key];
      arr.forEach((gun, i) => {
        const m = muzzle(player, mount, i, arr.length), ready = gun.cd <= 0;
        const len = gun.range * (ready ? 1 : 1 - gun.cd / gun.interval);
        const hit = ready && lineHits(m.x, m.y, m.a, gun.range);
        const col = !ready ? 0xf6f1e3 : hit ? 0xff4a2e : 0xffd76a, alpha = !ready ? 0.25 : hit ? 0.95 : 0.75;
        const c = Math.cos(m.a), sn = Math.sin(m.a);
        g.lineStyle(hit ? 3 : 2, col, alpha);
        for (let d = 0; d < len; d += 18) g.lineBetween(m.x + c * d, m.y + sn * d, m.x + c * Math.min(d + 11, len), m.y + sn * Math.min(d + 11, len));
        g.fillStyle(col, alpha); g.fillCircle(m.x + c * len, m.y + sn * len, ready ? 4 : 2.5);
      });
    }
  }
  // health bars
  for (const e of enemies) {
    if (!e.alive || e.x < v.x - 60 || e.x > v.right + 60 || e.y < v.y - 60 || e.y > v.bottom + 60) continue;
    const w = 46, x = e.x - w / 2, y = e.y - 27;
    bg.fillStyle(0x08222d, 0.8); bg.fillRect(x - 1, y - 1, w + 2, 6);
    bg.fillStyle(e.burnT > 0 ? 0xff8a3a : 0x86c46f, 1); bg.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
  if (player.alive && !docked && player.hp < player.maxHp) {
    const w = 50, x = player.x - w / 2, y = player.y - 30;
    bg.fillStyle(0x08222d, 0.8); bg.fillRect(x - 1, y - 1, w + 2, 6);
    bg.fillStyle(0xd45a43, 1); bg.fillRect(x, y, w * clamp(player.hp / player.maxHp, 0, 1), 4);
  }
}

// ---------- Boot ----------
function boot() {
  new Phaser.Game({
    type: Phaser.AUTO, parent: "game", backgroundColor: "#155a73",
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    render: { antialias: true }, scene: [Main],
  });
}
Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(boot);
