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
    vfxInit(this);   // combat effects, player halo, low-hull vignette (js/vfx.js)
    this.arcG = this.add.graphics().setDepth(4);
    this.barG = this.add.graphics().setDepth(9);
    makePlayer(this);
    cam.startFollow(player.spr, true, 0.15, 0.15);
    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT");
    this.input.keyboard.on("keydown-SPACE", () => playerFire());
    this.input.keyboard.on("keydown-M", () => toast(t(Snd.toggleMute() ? "muted" : "unmuted")));
    for (let i = 0; i < ENEMY_COUNT; i++) spawnEnemy(this);
    for (const w of save.wrecks) addCrate(w.x, w.y, w.value, w);
    fitView(this);   // camera zoom, crisp text and canvas size for HiDPI screens (js/view.js)
    buildMiniBase();
    player.spr.setPosition(player.x, player.y);
    cam.centerOn(player.x, player.y);
    hud(true);
    shellBoot(this);   // title screen first; it docks at the harbor on Continue / New game (js/menu.js)
    runHook("ready");   // feature modules start their per-frame work (js/hooks.js)
  }
  update(_, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const v = this.cameras.main.worldView;
    if (!seaFrozen) this.seaT = (this.seaT || 0) + deltaMs;   // own clock: time.now keeps running while paused
    for (const [ts, k] of [[this.sea1, 1], [this.sea2, 0.6]]) {
      const tw = Math.ceil(v.width + 128), th = Math.ceil(v.height + 128);
      if (ts.width !== tw || ts.height !== th) ts.setSize(tw, th);
      ts.setPosition(v.x - 64, v.y - 64);
      ts.tilePositionX = (v.x - 64) / ts.tileScaleX + this.seaT * 0.004 * k; ts.tilePositionY = (v.y - 64) / ts.tileScaleY + this.seaT * 0.002 * k;
    }
    shellTick(dt);     // pause / menus / gamepad / tutorial (js/menu.js)
    const timeK = vfxFrame(dt);   // < 1 during a hit-stop
    if (!paused) step(dt * timeK);
    drawOverlays();
    hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.1; }
    miniT -= dt; if (miniT <= 0) { drawMini(); miniT = 0.15; }
  }
}

function step(dt) {
  // --- player input: touch stick, mouse, keyboard sail and turn, gamepad (js/input.js) ---
  if (player.alive) playerInput(dt);
  // --- AI ---
  for (const e of enemies) if (e.alive) think(e, dt);
  // --- movement ---
  const ships = enemies.filter(e => e.alive); if (player.alive) ships.push(player);
  for (const s of ships) move(s, dt);
  for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
    const a = ships[i], b = ships[j];
    if (a.fixed || b.fixed) continue;   // shore batteries aren't shoved; their island keeps ships off
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), r = shipRadius(a) + shipRadius(b);   // sized per hull
    if (d < r && d > 0.01) { const p = (r - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
  }
  for (const s of ships) {
    s.spr.setPosition(s.x, s.y).setRotation(s.rot);
    vfxShip(s, dt);   // wake, damage smoke/flames, badge, player halo
    tickStatus(s, dt);   // stacked fires and torn rigging (js/arsenal.js)
  }
  // --- firing ---
  const living = enemies.filter(e => e.alive);
  for (const g of Object.values(player.guns).flat()) g.cd = Math.max(0, g.cd - dt);   // reload
  const engaged = player.alive && MOUNTS.some(mountEngaged);
  const tip = engaged && !engagedPrev && releaseTips < 3 && fireTipKey();
  if (tip) { releaseTips++; toast(t(tip)); }
  engagedPrev = engaged;
  for (const e of living) fire(e, e.target && isHostile(e, e.target) ? [e.target] : [], dt);
  combatTick(dt);   // turn tracking for enemy gunners, fireship rams, shore batteries, streak chip (js/volley.js)
  // --- audio: ears on the player, combat music while a hostile ship is close ---
  Snd.setListener(player.x, player.y);
  Snd.setMotion(player.alive ? player.speed / player.maxSpeed : 0);
  Snd.setIntensity(player.alive ? threatLevel(living, engaged) : 0);
  if (player.alive && player.hp < player.maxHp * 0.3) Snd.play("lowHull");   // rate-limited inside Snd
  for (const m of MOUNTS) {   // a soft knock when a whole mount has reloaded
    const arr = player.guns[m.key], ready = arr.every(g => g.cd <= 0);
    if (arr.length && ready && reloadWas[m.key] === false && player.alive) Snd.play("reload", { pan: Math.cos(player.rot + m.ang) * 0.4 });
    reloadWas[m.key] = ready;
  }
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
    if (hit) { vfxHit(b.x, b.y); hurt(hit, b.dmg, b.burn, b.owner, b); }
    if (hit || onRock || b.life <= 0) {
      if (!hit) vfxSplash(b.x, b.y, onRock);
      if (!hit && !onRock) Snd.play("splash", { x: b.x, y: b.y });
      b.spr.destroy(); balls.splice(i, 1);
    }
  }
  // --- plunder crates ---
  for (let i = crates.length - 1; i >= 0; i--) {
    const c = crates[i]; c.t += dt;
    const d = dist(c, player), room = player.cap - cargo;
    if (player.alive && d < 150 && room > 0) { const k = Math.min(1, 260 * dt / Math.max(d, 1)); c.x += (player.x - c.x) * k; c.y += (player.y - c.y) * k; }
    if (player.alive && d < 32) {
      if (room > 0) { const take = Math.min(room, c.value); cargo += take; c.value -= take; floatText(c.x, c.y - 10, t("fCargo", { n: fmt(take) }), "#f0c766", 17); Snd.play("pickup");
        if (c.wreck) { c.wreck.value = c.value; if (c.value <= 0) save.wrecks = save.wrecks.filter(w => w !== c.wreck); persist(); }
        runHook("pickup", c, take); }
      else if (S.time.now - lastHoldToast > 3000) { lastHoldToast = S.time.now; toast(t("toastFull")); Snd.play("denied"); }
    }
    if (c.wreck) { c.wreck.x = Math.round(c.x); c.wreck.y = Math.round(c.y); }
    c.spr.setPosition(c.x, c.y + Math.sin(c.t * 3) * 2).setAlpha(!c.wreck && c.t > 55 ? clamp((60 - c.t) / 5, 0, 1) : 1);
    if (c.label) c.label.setPosition(c.x, c.y - 26);
    if (c.value <= 0 || (!c.wreck && c.t > 60)) { c.spr.destroy(); c.label?.destroy(); crates.splice(i, 1); }
  }
  // --- harbor (or the Hulk Outpost once a bounty has opened it: js/campaign.js) ---
  const hb = nearestHarbor(), dPort = Math.hypot(player.x - hb.x, player.y - hb.y);
  if (!canDock && dPort > DOCK_R + 80) canDock = true;
  if (canDock && player.alive && dPort < DOCK_R) dock(hb.outpost ? "outpost" : "return");
  // --- population: ring quotas (js/world-seas.js) ---
  managePopulation(dt);
}

const reloadWas = {};   // per mount: were all its guns loaded last frame? (for the reload knock)
// 0..1 for the music's combat layer: 1 when a ship is closing on us, less when hostiles are merely about.
function threatLevel(living, engaged) {
  let k = engaged ? 0.6 : 0;
  for (const e of living) {
    const d = dist(e, player); if (d > 900) continue;
    if (e.target === player) k = Math.max(k, d < 600 ? 1 : 0.75);
    else if (isHostile(e, player)) k = Math.max(k, 0.35);
  }
  return k;
}

function drawOverlays() {
  const g = S.arcG, bg = S.barG; g.clear(); bg.clear();
  const v = S.cameras.main.worldView, lk = labelScale();   // widths counter-scaled with the labels, so lines survive zoom 0.55
  // Aim lines: hidden until an enemy nears a mount's firing arc. One straight line per cannon.
  //   red    = loaded, and the line passes through an enemy on screen right now (that ship also gets a bracket)
  //   yellow = loaded, line misses
  //   faint  = reloading; the line grows back to full length as the gun reloads
  // With many guns every line is drawn thinner and fainter, so a 14-gun broadside doesn't paint a red grid.
  if (player.alive && !docked) {
    const mounts = MOUNTS.filter(mountEngaged), total = mounts.reduce((n, m) => n + player.guns[m.key].length, 0);
    const k = clamp(2.2 / Math.sqrt(Math.max(1, total)), 0.5, 1), marked = new Set();
    for (const mount of mounts) {
      const arr = player.guns[mount.key];
      arr.forEach((gun, i) => {
        const m = muzzle(player, mount, i, arr.length), ready = gun.cd <= 0;
        const len = gun.range * (ready ? 1 : 1 - gun.cd / gun.interval);
        const tg = ready ? lineHits(m.x, m.y, m.a, gun.range) : null;
        if (tg) marked.add(tg);
        const col = !ready ? 0xf6f1e3 : tg ? 0xff4a2e : 0xffd76a, alpha = (!ready ? 0.25 : tg ? 0.95 : 0.75) * (tg ? Math.max(k, 0.7) : k);
        const c = Math.cos(m.a), sn = Math.sin(m.a);
        g.lineStyle((tg ? 3 : 2) * Math.max(k, 0.65) * lk, col, alpha);
        for (let d = 0; d < len; d += 18) g.lineBetween(m.x + c * d, m.y + sn * d, m.x + c * Math.min(d + 11, len), m.y + sn * Math.min(d + 11, len));
        g.fillStyle(col, alpha); g.fillCircle(m.x + c * len, m.y + sn * len, (ready ? 4 : 2.5) * lk);
      });
    }
    const pulse = 1 + 0.07 * Math.sin(S.time.now * 0.012);
    for (const e of marked) {   // target bracket: four arcs around the hull, a shape cue as well as a colour one
      const r = ((e.hl ?? 28) + (e.hw ?? 13)) * 0.8 * pulse + 8 * lk;
      g.lineStyle(2.5 * lk, 0xff4a2e, 0.9);
      for (let q = 0; q < 4; q++) { g.beginPath(); g.arc(e.x, e.y, r, q * Math.PI / 2 + 0.35, q * Math.PI / 2 + 1.22); g.strokePath(); }
    }
  }
  // health bars, just above each hull's drawn extent
  for (const e of enemies) {
    if (!e.alive || e.x < v.x - 60 || e.x > v.right + 60 || e.y < v.y - 60 || e.y > v.bottom + 60) continue;
    const w = 46 * lk, h = 4 * lk, x = e.x - w / 2, y = shipTop(e) - 8 * lk;
    bg.fillStyle(0x08222d, 0.8); bg.fillRect(x - lk, y - lk, w + 2 * lk, h + 2 * lk);
    bg.fillStyle(e.burnT > 0 ? 0xff8a3a : 0x86c46f, 1); bg.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }
  if (player.alive && !docked && player.hp < player.maxHp) {
    const w = 50 * lk, h = 4 * lk, x = player.x - w / 2, y = shipTop(player) - 8 * lk;
    bg.fillStyle(0x08222d, 0.8); bg.fillRect(x - lk, y - lk, w + 2 * lk, h + 2 * lk);
    bg.fillStyle(0xd45a43, 1); bg.fillRect(x, y, w * clamp(player.hp / player.maxHp, 0, 1), h);
  }
  drawVolleyWarnings(bg);   // red glow on gun ports about to fire (js/volley.js)
}

// ---------- Boot ----------
function boot() {
  new Phaser.Game({
    type: Phaser.AUTO, parent: "game", backgroundColor: "#155a73",
    scale: viewScaleConfig(),   // device-pixel canvas shown at CSS size (js/view.js)
    callbacks: { preBoot: g => { if (typeof watchBoot === "function") watchBoot(g); } },   // crash message (js/boot-guard.js)
    input: { gamepad: padsAllowed() },   // js/input.js
    render: { antialias: true }, scene: [Main], audio: { noAudio: true },   // all sound goes through Snd (js/audio.js)
  });
}
Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(boot);
