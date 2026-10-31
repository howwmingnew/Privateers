// Phase 1 checks in a real browser: out-of-combat repair, powder-magazine crits, the first-voyage ambush, photo mode and
// postcards (desktop and phone), and the link-preview picture. The pure logic is in tests/unit-phase1.mjs.
// Usage: node tests/phase1.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/phase1";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let failed = 0;
const ok = (name, pass, info) => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const ev = (page, fn, arg) => page.evaluate(fn, arg);

// A fresh game at sea with the tutorial out of the way, every other ship parked in a corner.
async function openSea(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 });
  await page.click("[data-smoke=start]");
  await page.waitForTimeout(500);
  await page.evaluate(() => { if (docked) setSail(); });
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 8000 });
  await ev(page, () => {
    save.tutorialDone = true; tutorialReset();
    player.x = PORT.x + 1500; player.y = PORT.y; player.speed = 0; moved = true;
    for (const e of enemies) { e.x = 200; e.y = 200; }
    // a ship the sea spawns near the player would shoot at it: keep every ship the test did not place (or the ambush send, angry) at a distance
    window.__calm = setInterval(() => { for (const e of enemies) if (!e.mine && !(e.angry > 5) && Math.hypot(e.x - player.x, e.y - player.y) < 1500) { e.x = 200; e.y = 200; } }, 40);
  });
  await page.waitForFunction(() => !bannerBusy(), null, { timeout: 15000 });   // the sea banner of the new place
  return { ctx, page };
}
const enemyNear = (page, dx, dy, extra = {}) => ev(page, ([dx, dy, extra]) => {
  const e = makeEnemy(S, player.x + dx, player.y + dy, 1, "pirate");
  Object.assign(e, { rot: 0, speed: 0, mine: true }, extra); e.vol = {};
  (window.__e = window.__e || []).push(e); return window.__e.length - 1;
}, [dx, dy, extra]);
// run `fn` with the first Math.random() call returning 0.001 (a 1-in-12 roll that comes up)
const forcedRoll = (page, fn, arg) => ev(page, ([src, arg]) => {
  const real = Math.random; let first = true; Math.random = () => (first ? (first = false, 0.001) : real());
  try { return new Function("arg", "return (" + src + ")(arg)")(arg); } finally { Math.random = real; }
}, [fn.toString(), arg]);

// ---------- repair at sea ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  await ev(page, () => { player.hp = player.maxHp * 0.5; });
  await page.waitForTimeout(700);
  const early = await ev(page, () => ({ f: player.hp / player.maxHp, mend: document.querySelector(".bar.hp").classList.contains("mend") }));
  ok("repair: the hull starts mending at once, and the bar glows", early.f > 0.5 && early.mend, early);
  // 1% a second under way, 3% stopped: the rate seen over 2 s must match the ship's state at both ends
  // (game seconds, summed from the frame hook: a busy machine caps each frame's dt, so the game runs slower than the wall clock)
  await ev(page, () => { window.__gt = 0; onHook("frame", dt => { window.__gt += dt; }); });
  const r0 = await ev(page, () => ({ hp: player.hp, still: player.speed < player.maxSpeed * REPAIR_STILL, t: window.__gt * 1000 }));
  await page.waitForTimeout(2000);
  const r1 = await ev(page, () => ({ hp: player.hp, still: player.speed < player.maxSpeed * REPAIR_STILL, t: window.__gt * 1000, max: player.maxHp }));
  const rate = (r1.hp - r0.hp) / r1.max / ((r1.t - r0.t) / 1000);
  if (r0.still === r1.still) ok(`repair: ${r0.still ? "stopped ~3%" : "under way ~1%"} a second (saw ${(rate * 100).toFixed(2)}%)`,
    r0.still ? rate > 0.02 && rate <= 0.031 : rate > 0.006 && rate <= 0.0105, { r0, r1, rate });
  await ev(page, () => { player.burnT = 20; });
  const a = await ev(page, () => player.hp); await page.waitForTimeout(700);
  ok("repair: a burning ship still mends", await ev(page, a0 => player.hp > a0 || player.hp >= player.maxHp, a));
  await ev(page, () => { player.burnT = 0; });
  await ctx.close();
}

// ---------- powder-magazine crits ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  const rake = { vx: 100, vy: 0, fromPlayer: true };
  const a = await enemyNear(page, 300, 0), near = await enemyNear(page, 380, 0), far = await enemyNear(page, 800, 0);
  const r = await forcedRoll(page, ([a, near, far]) => {
    const A = __e[a], N = __e[near], F = __e[far];
    // the ships are live AI and the sea moved on while this was set up: put each back on its mark, heading along the rake, right before the hit
    [[A, 300], [N, 380], [F, 800]].forEach(([e, dx]) => Object.assign(e, { x: player.x + dx, y: player.y, rot: 0, speed: 0 }));
    const hp = [N.hp, F.hp];
    hurt(A, 1, 0, player, { ...{ vx: 100, vy: 0, fromPlayer: true }, owner: player });
    return { aDead: !A.alive, nearHurt: N.hp < hp[0], farHurt: F.hp < hp[1], playerAlive: player.alive };
  }, [a, near, far]);
  ok("powder: a rake can blow the magazine: the ship goes, its neighbour is hurt, a far ship is not", r.aDead && r.nearHurt && !r.farHurt && r.playerAlive, r);
  const boss = await enemyNear(page, -300, 100, { boss: "ned", hp: 300, maxHp: 300 });
  const rb = await forcedRoll(page, boss => { const B = __e[boss]; Object.assign(B, { rot: 0, speed: 0 }); hurt(B, 1, 0, player, { vx: 100, vy: 0, fromPlayer: true, owner: player }); return { alive: B.alive, hp: B.hp }; }, boss);
  ok("powder: a boss is hurt hard (25%) but never sunk by it", rb.alive && rb.hp > 0 && rb.hp < 300 * 0.8, rb);
  const c = await enemyNear(page, 300, -150);
  await ev(page, () => { save.tutorialDone = false; });
  const rt = await forcedRoll(page, c => { const C = __e[c]; Object.assign(C, { rot: 0, speed: 0 }); hurt(C, 1, 0, player, { vx: 100, vy: 0, fromPlayer: true, owner: player }); return C.alive; }, c);
  ok("powder: not during the tutorial", rt === true);
  await ev(page, () => { save.tutorialDone = true; });
  const d = await enemyNear(page, -400, -150);
  const rp = await forcedRoll(page, d => { const D = __e[d]; hurt(D, 1, 0, player, { vx: 0, vy: 100, fromPlayer: true, owner: player }); return D.alive; }, d);   // across the beam: no rake
  ok("powder: a broadside hit is not a rake", rp === true);
  await page.screenshot({ path: join(out, "powder.png") });
  await ctx.close();
}

// ---------- first-voyage ambush ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  const placed = await ev(page, () => {   // somewhere with an island in range whose far side is open water
    for (const o of islands.filter(i => Math.hypot(i.x - PORT.x, i.y - PORT.y) > 1500))
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4; player.x = o.x + Math.cos(a) * (o.r + 500); player.y = o.y + Math.sin(a) * (o.r + 500);
        if (!inSafe(player) && ambushIsland()) { window.__spot = { x: player.x, y: player.y }; return true; }   // not in a station's truce: the ambush never comes there
      }
    return false;
  });
  ok("ambush: (setup) found a spot with an island to hide behind", placed);
  await page.waitForTimeout(3200);   // a sea banner for the new waters comes after 2.5 s: let it show and go
  await page.waitForFunction(() => !bannerBusy(), null, { timeout: 15000 });
  await ev(page, () => { for (const e of enemies) { e.x = 200; e.y = 200; } save.sunk = 0; save.ambushDone = false; ambushT = 100; });
  await page.waitForTimeout(600);
  ok("ambush: nothing before the first sinking", await ev(page, () => !save.ambushDone));
  await ev(page, () => { save.sunk = 1; ambushT = 44.9; });
  // the trigger runs on game time (0.1 s of sea) and waits out banners: wait for it to come rather than sleep a fixed time
  // (keep the ship on its spot while it waits: drift or a current would carry it out of the island's range)
  await page.waitForFunction(() => { player.x = __spot.x; player.y = __spot.y; player.speed = 0; return save.ambushDone; }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(100);
  const r = await ev(page, () => {
    const pirates = enemies.filter(e => e.alive && e.faction === "pirate" && Math.hypot(e.x - player.x, e.y - player.y) < 1300 && e.angry > 0);
    return { done: save.ambushDone, n: pirates.length, L: pirates.map(e => e.L), rating: shipRating(), cls: pirates.map(e => e.cls), saved: JSON.parse(localStorage.getItem("privateers-save-v2")).ambushDone,
      why: { t: ambushT, banner: bannerBusy(), calm: tutorialCalm(), engaged: enemies.filter(e => e.alive && e.target === player).map(e => [e.faction, e.cls, Math.round(dist(e, player))]), hp: player.hp / player.maxHp, safe: inSafe(player), isl: !!ambushIsland(), paused, docked, sunk: save.sunk } };
  });
  ok("ambush: two weak cutters come out, never above the captain's Lv, and it is saved", r.done && r.n === 2 && r.L.every(l => l <= Math.max(r.rating, 1)) && r.cls.every(c => c === "cutter") && r.saved === true, r);
  await ev(page, () => { window.__calls = 0; const real = ambushSpawn; ambushSpawn = (...a) => { window.__calls++; return real(...a); }; ambushT = 100; });
  await page.waitForTimeout(800);
  ok("ambush: only once", await ev(page, () => window.__calls === 0 && ambushT >= 100));
  await ctx.close();
}

// ---------- photo mode (desktop) ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  // the crowd rule (js/tech.js) hides plates by how many ships the sea happens to have on screen: not what this test is about
  await ev(page, () => { thinPlates = () => {}; for (const e of enemies) e.badge?.setVisible(true); });
  await ev(page, () => { makeEnemy(S, player.x + 250, player.y + 60, 1, "pirate"); player.hp = 70; });
  await page.waitForTimeout(300);
  const snap = () => ev(page, () => {
    const cam = S.cameras.main;
    window.__id = window.__id || 0;
    const ships = Object.fromEntries(enemies.map(e => [e.__id || (e.__id = ++window.__id), { xy: [e.x, e.y], hp: e.hp, alive: e.alive, badge: !!(e.badge && e.badge.visible) }]));
    return { p: [player.x, player.y, player.rot, player.hp, cargo], ships, z: cam.zoom, fo: [cam.followOffset.x, cam.followOffset.y],
      paused, tp: S.time.paused, pauseOpen, seaFrozen, save: JSON.stringify(save), nBadges: Object.values(ships).filter(x => x.badge).length };
  });
  const before = await snap();
  await page.keyboard.press("h");
  await page.waitForTimeout(500);
  const inMode = await ev(page, () => ({ on: photoOn(), body: document.body.classList.contains("photo"), hud: getComputedStyle(document.getElementById("hud")).display,
    bar: !document.getElementById("photoBar").hidden, badges: enemies.filter(e => e.badge && e.badge.visible).length, pauseUi: document.getElementById("pause").hidden, paused }));
  ok("photo: H freezes the sea and hides the HUD, labels and the pause menu", inMode.on && inMode.body && inMode.hud === "none" && inMode.bar && inMode.badges === 0 && inMode.pauseUi && inMode.paused, inMode);
  const frozenA = await snap(); await page.waitForTimeout(700); const frozenB = await snap();
  ok("photo: time stands still", JSON.stringify(frozenA.p) === JSON.stringify(frozenB.p) && JSON.stringify(frozenA.ships) === JSON.stringify(frozenB.ships));
  for (let i = 0; i < 20; i++) await page.keyboard.press("+");
  const zMax = await ev(page, () => S.cameras.main.zoom / viewZoom());
  for (let i = 0; i < 40; i++) await page.keyboard.press("-");
  const zMin = await ev(page, () => S.cameras.main.zoom / viewZoom());
  ok("photo: zoom runs 0.6x to 2.2x", Math.abs(zMax - 2.2) < 0.01 && Math.abs(zMin - 0.6) < 0.01, [zMax, zMin]);
  const s0 = await ev(page, () => [S.cameras.main.scrollX, S.cameras.main.scrollY]);
  await page.mouse.move(600, 360); await page.mouse.down(); await page.mouse.move(500, 300, { steps: 5 }); await page.mouse.up();
  await page.keyboard.down("d"); await page.waitForTimeout(400); await page.keyboard.up("d");
  const s1 = await ev(page, () => [S.cameras.main.scrollX, S.cameras.main.scrollY]);
  ok("photo: drag and WASD move the camera", Math.abs(s1[0] - s0[0]) > 20 && s1[1] !== s0[1], [s0, s1]);
  await page.screenshot({ path: join(out, "photo-mode.png") });
  const dl = page.waitForEvent("download", { timeout: 15000 });
  await page.click("#photoBar .ph-save");
  const d = await dl, path = join(out, d.suggestedFilename());
  await d.saveAs(path);
  const png = readFileSync(path), cv = await ev(page, () => [S.game.canvas.width, S.game.canvas.height]);
  const dims = [png.readUInt32BE(16), png.readUInt32BE(20)];
  ok("postcard: a PNG the size of the canvas, named privateers-<time>.png", png.subarray(1, 4).toString() === "PNG" && dims[0] === cv[0] && dims[1] === cv[1] && /^privateers-\d{8}-\d{6}\.png$/.test(d.suggestedFilename()), { dims, cv, name: d.suggestedFilename(), bytes: png.length });
  await page.keyboard.press("Escape");
  const after = await snap();   // straight away: the sea runs again from here
  // the sea is already running again when the snapshot lands, and on a busy machine that is a good fraction of a second: allow for the drift of a ship that long
  const close = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) < tol);
  const common = Object.keys(frozenB.ships).filter(id => after.ships[id]);
  const same = close(frozenB.p.slice(0, 2), after.p.slice(0, 2), 40) && common.every(id => close(frozenB.ships[id].xy, after.ships[id].xy, 80));   // what was frozen is what comes back
  const labels = Object.keys(before.ships).filter(id => after.ships[id]).every(id => before.ships[id].badge === after.ships[id].badge);
  await page.waitForTimeout(400);
  const parts = { same, save: after.save === before.save, badges: labels, paused: !after.paused && !after.tp && !after.pauseOpen, zoom: Math.abs(after.z - before.z) < 1e-9, offset: after.fo[0] === before.fo[0] && after.fo[1] === before.fo[1] };
  ok("photo: leaving puts everything back (ships, hull, cargo, save, labels, zoom, offset)", Object.values(parts).every(Boolean), parts);
  const follow = await ev(page, () => { const c = S.cameras.main; return Math.hypot(c.midPoint.x - player.x, c.midPoint.y - player.y); });
  ok("photo: the camera follows the ship again", follow < 40, follow);
  // from the pause menu, and back to it
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await page.click('[data-menu="photo"]'); await page.waitForTimeout(300);
  ok("photo: the pause menu's button opens it", await ev(page, () => photoOn() && document.getElementById("pause").hidden));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  ok("photo: leaving it returns to the pause menu", await ev(page, () => !photoOn() && pauseOpen && !document.getElementById("pause").hidden));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  ok("photo: and Resume carries on", await ev(page, () => !paused && !pauseOpen));
  await ctx.close();
}

// ---------- photo mode (phone) ----------
{
  const { ctx, page } = await openSea({ width: 390, height: 844 }, true);
  await ev(page, () => pauseGame());
  await page.tap('[data-menu="photo"]'); await page.waitForTimeout(300);
  const m = await ev(page, () => ({ on: photoOn(), bar: document.getElementById("photoBar").getBoundingClientRect().toJSON(), hint: document.querySelector("#photoBar .ph-hint").textContent, w: innerWidth }));
  ok("photo (phone): opens from the pause menu, the bar fits the screen, the hint speaks of pinching", m.on && m.bar.left >= 0 && m.bar.right <= m.w && /pinch|兩指/.test(m.hint), m);
  await page.tap('#photoBar [data-ph="zin"]'); await page.waitForTimeout(100);
  ok("photo (phone): the + button zooms", await ev(page, () => photo.f > 1.1));
  await ev(page, () => { window.__shared = null; navigator.canShare = o => !!(o && o.files); navigator.share = async o => { window.__shared = o.files.map(f => [f.name, f.type, f.size]); }; });
  await page.tap("#photoBar .ph-save");
  await page.waitForFunction(() => window.__shared, null, { polling: 50, timeout: 4500 }).catch(() => {});   // the picture is made and shared; the check says if it never was
  const sh = await ev(page, () => window.__shared);
  ok("postcard (phone): goes to the share sheet as a PNG file when the phone has one", !!sh && sh.length === 1 && sh[0][1] === "image/png" && sh[0][2] > 5000, sh);
  await ev(page, () => { navigator.canShare = undefined; navigator.share = undefined; });
  await page.waitForFunction(() => !document.querySelector("#photoBar .ph-save").disabled, null, { polling: 50, timeout: 5400 }).catch(() => {});   // the button takes presses again 1.6 s after its "Saved" (js/postcard.js)
  const dl = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
  await page.tap("#photoBar .ph-save");
  const d = await dl;
  ok("postcard (phone): otherwise a PNG download", !!d && /\.png$/.test(d.suggestedFilename()));
  await page.screenshot({ path: join(out, "photo-phone.png") });
  await ctx.close();
}

// ---------- postcard offers: after a boss, after a paid sortie, on the victory screen ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  const chip = () => ev(page, () => { const c = document.getElementById("postcardChip"); return !!c && !c.hidden; });
  ok("postcard: no offer before anything happened", !(await chip()));
  await ev(page, () => sortieTally({ sunk: 2, cargo: 100, bonus: 0.1, gold: 110 }));
  ok("postcard: a sortie that sank ships offers one", await chip());
  await ev(page, () => { paused = true; }); await page.waitForTimeout(200);
  ok("postcard: a pause takes the offer away", !(await chip()));
  await ev(page, () => { paused = false; });
  await ev(page, () => { const b = makeEnemy(S, player.x + 300, player.y, 1, "pirate"); b.boss = "ned"; b.mine = true; sink(b, player); });
  await page.waitForFunction(() => { const c = document.getElementById("postcardChip"); return !!c && !c.hidden; }, null, { polling: 50, timeout: 7200 }).catch(() => {});   // offered 1.8 s after the boss card
  ok("postcard: sinking a boss offers one after its card", await chip());
  await ev(page, () => { showVictory(); });
  ok("postcard: the victory screen carries the button", await ev(page, () => !!document.querySelector("#victory .v-card") && document.querySelector("#victory .v-card").textContent.length > 0));
  await ev(page, () => closeVictory());
  await ctx.close();
}

// ---------- link preview ----------
{
  const png = readFileSync(new URL("../og.png", import.meta.url)), html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  ok("og.png is a 1200x630 PNG", png.subarray(1, 4).toString() === "PNG" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length < 2e6, png.length);
  ok("index.html points og:image at it by absolute address, with size and a large twitter card", /og:image" content="https:\/\/howwmingnew\.github\.io\/Privateers\/og\.png"/.test(html) && /og:image:width" content="1200"/.test(html) && /summary_large_image/.test(html));
}

await browser.close();
if (errors.length) { console.error("PAGE ERRORS\n" + errors.join("\n")); process.exit(1); }
if (failed) { console.error(`FAIL: ${failed} check(s) failed`); process.exit(1); }
console.log("PASS: phase 1 checks. Screenshots in " + out);
