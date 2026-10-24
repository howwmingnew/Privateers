// Gun art (#35): every gun has its own side view (harbor cards, store, armory) and top view (on the hulls at sea and on the harbor deck);
// the guns drawn are the ones the ship really carries (player, AI, boss), a swap shows at once, a shot kicks the mount back and lights
// a flash, the layers follow the hull through a storm's roll, and 30 guns stay a handful of sprites.
// Usage: node tests/gunart.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/gunart";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [], results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass }); console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`); };
const D = { width: 1280, height: 720 }, M = { width: 390, height: 844 };

async function open(viewport, { mobile = false, tag = "" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(300 * SLOW);
  return { ctx, page };
}
// The ship of the line, every port armed with a mix of the five guns; then out to open water, stepped by hand.
const armLine = () => {
  save = fitMounts({ ...save, ship: "line", gold: 99999 });
  const kinds = ["six", "long12", "carronade", "chain", "fire"];
  for (const { key } of MOUNTS) save[key] = save[key].map((_, i) => gunItem(kinds[i % 5], 1 + (i % 4)));
  applyPlayerStats(true);
};
const toSea = () => {
  titleOpen = false; const ti = document.getElementById("title"); if (ti) ti.hidden = true; showPlayer(true);
  document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; resetEnemies(S);
  let ax = PORT.x + 1700, ay = PORT.y + 300;
  for (let a = 0; a < 64; a++) { const x = PORT.x + Math.cos(a) * 1700, y = PORT.y + Math.sin(a) * 1700; if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 650)) { ax = x; ay = y; break; } }
  Object.assign(player, { x: ax, y: ay, rot: -Math.PI / 2, speed: 0, maxHp: 1e9, hp: 1e9 });
};
const stepper = `window.__g = S.game; __g.loop.sleep(); window.__now = performance.now(); window.__step = (n = 1) => { for (let i = 0; i < n; i++) { __now += 16.667; __g.step(__now, 16.667); } };`;

// ---- the side and top views are five different pictures ----
{
  const { ctx, page } = await open(D, { tag: "views" });
  const r = await page.evaluate(() => {
    const ids = GUN_ORDER, side = ids.map(id => gunSideUrl(id));
    const top = ids.map(id => { const cv = document.createElement("canvas"); cv.width = 60; cv.height = 40; const c = cv.getContext("2d"); c.translate(44, 20); c.scale(3, 3); drawGunTop(c, id); return cv.toDataURL(); });
    const ink = u => new Promise(res => { const im = new Image(); im.onload = () => { const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const c = cv.getContext("2d"); c.drawImage(im, 0, 0);
      const d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; res(n); }; im.src = u; });
    return Promise.all(side.map(ink)).then(inks => ({ side: new Set(side).size, top: new Set(top).size, inks, n: ids.length }));
  });
  ok("five guns: five different side views and five different top views, each with something drawn", r.n === 5 && r.side === 5 && r.top === 5 && r.inks.every(n => n > 300), r);
  await ctx.close();
}

// ---- harbor: side views in the armory, the store and the card; the deck draws the loadout from above ----
for (const [name, vp, mobile] of [["desktop", D, false], ["phone", M, true]]) {
  const { ctx, page } = await open(vp, { mobile, tag: "harbor-" + name });
  await page.evaluate(`(${armLine})(); save.store = ["six", "long12", "carronade", "chain", "fire"].map(g => gunItem(g, 2)); titleOpen = false; const ti = document.getElementById("title"); if (ti) ti.hidden = true; paused = true; dock("welcome"); document.getElementById("port").hidden = false;`);
  await page.waitForTimeout(700 * SLOW);
  const info = await page.evaluate(() => ({
    armory: document.querySelectorAll("#armory .item .gsv").length, store: document.querySelectorAll("#bay .slot .gsv").length, dkCanvas: !!document.querySelector("#deck canvas.dk-art"),
    over: document.querySelector(".sheet").scrollWidth - document.querySelector(".sheet").clientWidth }));
  await page.locator('#bay .slot').first().scrollIntoViewIfNeeded(); await page.locator('#bay .slot').nth(2).click();
  const card = await page.evaluate(() => { const i = document.querySelector("#gunSel .gcard .gsv"); return i ? { w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), loaded: i.complete && i.naturalWidth > 0 } : null; });
  ok(`${name}: the armory shows 5 side views, the store 5, the picked gun's card 1, and the page does not scroll sideways`, info.armory === 5 && info.store === 5 && card && card.loaded && card.w >= 40 && info.over <= 1, { ...info, card });
  await page.screenshot({ path: `${out}/${name}-card.png` });
  // a swap repaints the deck art (the key carries the loadout)
  const k0 = await page.evaluate(() => document.querySelector("#deck canvas.dk-art").dataset.key);
  await page.evaluate(() => { save.left[0] = gunItem("carronade"); renderPort(); });
  await page.waitForTimeout(300 * SLOW);
  const k1 = await page.evaluate(() => document.querySelector("#deck canvas.dk-art").dataset.key);
  ok(`${name}: a gun changed in the ledger repaints the deck's ship from above`, k0 && k1 && k0 !== k1);
  await page.evaluate(() => document.getElementById("deck").scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${out}/${name}-deck.png` });
  await ctx.close();
}

// ---- at sea: the player's guns, a swap, a shot, a storm ----
{
  const { ctx, page } = await open(D, { tag: "sea" });
  await page.evaluate(`(${armLine})(); (${toSea})(); ${stepper}; __step(40); S.cameras.main.centerOn(player.x, player.y);`);
  const a = await page.evaluate(() => {
    __step(3);
    const L = player.gl, sp = player.spr, im = L.all, keys = Object.keys(L.mounts);
    return { mounts: keys, resting: Object.values(L.img).filter(i => i.visible).length + (im.visible ? 1 : 0), follow: Math.abs(im.x - sp.x) < 0.01 && Math.abs(im.y - sp.y) < 0.01 && im.rotation === sp.rotation,
      sigs: keys.map(k => gunSig(L.mounts[k])), depth: im.depth > sp.depth };
  });
  ok("the ship of the line's 30 guns (bow, larboard, starboard, stern) are ONE extra sprite at rest, glued to the hull", a.mounts.length === 4 && a.resting === 1 && a.follow && a.depth, { mounts: a.mounts, sigs: a.sigs });
  ok("every one of the five gun types is on the deck", ["s", "l", "c", "k", "f"].every(ch => a.sigs.join("").includes(ch)) && a.sigs.join("").replace(/-/g, "").length === 30, { sigs: a.sigs });
  await page.evaluate(() => { document.getElementById("hud") && 0; S.cameras.main.setZoom(2.4); __step(2); });
  await page.screenshot({ path: `${out}/sea-line.png` });

  // swap: a gun in the save shows on the very next frame
  const sw = await page.evaluate(() => {
    const before = player.gl.all.texture.key; save.left[0] = gunItem(save.left[0].g === "fire" ? "six" : "fire"); __step(1);
    const after = player.gl.all.texture.key, sig = after.split(":").pop().split("|")[1];
    return { changed: before !== after, first: sig[0], want: gunSig(save.left.map(g => g && g.g))[0] };
  });
  ok("changing a gun changes the picture on the next frame", sw.changed && sw.first === sw.want, sw);

  // fire: the mount kicks back, a flash blooms, then both settle
  const f = await page.evaluate(() => {
    resetEnemies(S); const e = makeEnemy(S, player.x - 170, player.y, 4, "pirate", "brig"); Object.assign(e, { x: player.x - 170, y: player.y, speed: 0, maxHp: 1e9, hp: 1e9, rot: Math.PI / 2 });
    for (let i = 0; i < 4; i++) { Object.assign(e, { x: player.x - 170, y: player.y, speed: 0 }); __step(1); }
    let shots = 0; const real = window.gunFired; window.gunFired = (...a) => { shots++; return real(...a); }; playerFire(["left"]);
    let kick = 0, flashes = 0, sprites = 0, rightStill = true; const L = player.gl;
    for (let i = 0; i < 40; i++) { Object.assign(e, { x: player.x - 170, y: player.y, speed: 0 }); __step(1);
      if (L.img.left) kick = Math.max(kick, Math.hypot(L.img.left.x - player.spr.x, L.img.left.y - player.spr.y));
      sprites = Math.max(sprites, Object.values(L.img).filter(im => im.visible).length); if (L.img.right && L.img.right.visible && L.img.right.x !== player.spr.x) rightStill = false;
      flashes = Math.max(flashes, gaFlash.length); }
    window.gunFired = real;
    for (let i = 0; i < 90; i++) { Object.assign(e, { x: player.x - 170, y: player.y, speed: 0 }); __step(1); }
    return { kick: +kick.toFixed(2), shots, flashes, sprites, rightStill, settled: L.all.visible && !Object.values(L.img).some(im => im.visible) && Math.hypot(L.all.x - player.spr.x, L.all.y - player.spr.y) < 0.01, flashesLeft: gaFlash.length };
  });
  ok("a broadside kicks its own mount back (up to GUN_RECOIL_PX) and lights muzzle flashes, then settles back to one sprite", f.kick > 0.8 && f.kick <= 2.5 && f.shots === 12 && f.flashes >= 1 && f.sprites === 4 && f.rightStill && f.settled && f.flashesLeft === 0, f);
  await page.evaluate(() => { for (const g of Object.values(player.guns).flat()) g.cd = 0; playerFire(["left"]); __step(14); });
  await page.screenshot({ path: `${out}/sea-fire.png` });

  // AI ships carry what their guns say; a long-12 bow chaser on a cutter; a carronade boss
  const ai = await page.evaluate(() => {
    resetEnemies(S); const mk = (cls, L, gun) => { const e = makeEnemy(S, player.x + 100, player.y + 100, L, "pirate", cls); if (gun) { outfitEnemy(e, cls, { gun }); } return e; };
    const cutter = mk("cutter", 1), brig = mk("brig", 3), boss = mk("frigate", 8, "carronade"), lg = mk("manowar", 9, "long");
    __step(3);
    const sig = e => Object.fromEntries(Object.keys(e.gl.mounts).map(k => [k, gunSig(e.gl.mounts[k])]));
    const match = e => Object.keys(e.gl.mounts).every(k => gunSig(e.guns[k].map(g => g.gt)) === sig(e)[k]) && Object.keys(e.guns).filter(k => e.guns[k].length && k !== "turret").length === Object.keys(e.gl.mounts).length;
    return { cutter: sig(cutter), brig: sig(brig), boss: sig(boss), lg: sig(lg), all: [cutter, brig, boss, lg].every(match) };
  });
  ok("AI hulls show their own guns: cutter long-12 chaser, brig 6-pounders, a carronade boss, a long-gun flagship", ai.all && ai.cutter.bow[0] === "l" && ai.cutter.left === "s" && /^s+$/.test(ai.brig.left) && /^c+$/.test(ai.boss.left) && /^l+$/.test(ai.lg.left), ai);

  // layers follow the roll of a storm
  const roll = await page.evaluate(() => {
    for (let s = 1; s < 9000; s++) { const w = weatherAt(s, 1); if (w.kind === "storm" && w.hour === "day" && w.spell === 0) { Object.assign(wx, { seed: s, t: 1, easy: false, on: true }); break; } }
    let worst = 0, rolled = 0;
    for (let i = 0; i < 120; i++) { __step(1); for (const im of [player.gl.all, ...Object.values(player.gl.img)]) if (im.visible) worst = Math.max(worst, Math.abs(im.rotation - player.spr.rotation), Math.abs(im.scaleX - player.spr.scaleX)); rolled = Math.max(rolled, Math.abs(player.spr.rotation - player.rot)); }
    return { worst, rolled: +rolled.toFixed(3), hull: player.hl === Math.max(4, player.art.len / 2 - player.hw) };
  });
  ok("in a storm the guns roll with the hull (same angle and scale), and the hit capsule is untouched", roll.rolled > 0.01 && roll.worst < 1e-9 && roll.hull, roll);
  await page.evaluate(() => { S.cameras.main.setZoom(2.4); __step(2); });
  await page.screenshot({ path: `${out}/sea-storm.png` });

  // sinking: the layers fade with the hull and are gone with it
  const sk = await page.evaluate(() => {
    resetEnemies(S); const e = makeEnemy(S, player.x + 100, player.y + 100, 4, "navy", "brig"); __step(3); const had = Object.keys(e.gl.mounts).length;
    e.spr.setAlpha(0.4).setTintFill(0xffffff); __step(1);   // what a sinking and a hit flash do to the hull
    const mid = [e.gl.all].every(im => im.alpha === 0.4 && im.isTinted && im.tintFill);
    e.spr.destroy(); e.dead = true; __step(2);
    return { had, mid, gone: !e.gl && !gaShips.has(e) };
  });
  ok("the guns take a hull's fade and hit flash, and are freed when the hull is destroyed", sk.had >= 2 && sk.mid && sk.gone, sk);
  await page.evaluate(() => { __g.loop.wake(); });
  await ctx.close();
}

// ---- a gun taken by boarding (js/boarding.js) and the sea's disasters (js/disasters.js) ----
{
  const { ctx, page } = await open(D, { tag: "prize-disasters" });
  await page.evaluate(`(${armLine})(); (${toSea})(); ${stepper}; __step(10); S.cameras.main.centerOn(player.x, player.y); __step(2);`);
  const pz = await page.evaluate(() => {
    const out = {};
    for (const id of GUN_ORDER) {   // each kind of gun a prize can be: into the store, then onto a port
      const r = claimPrize(save, gunItem(id, 2)); save = r.save; const i = save.store.length - 1;
      save = swapGuns({ side: "store", i }, { side: "left", i: 0 });
      __step(1); out[id] = { kind: r.kind, code: gunSig(player.gl.mounts.left)[0], url: gunSideUrl(id).length > 200 };
    }
    return out;
  });
  ok("a prize gun of every kind reaches the store, mounts on a port and shows on the hull the next frame, with its side view",
    Object.values(pz).length === 5 && Object.entries(pz).every(([id, v]) => v.kind === "gun" && v.code === ({ six: "s", long12: "l", carronade: "c", chain: "k", fire: "f" })[id] && v.url), pz);
  const dz = await page.evaluate(() => {
    for (let s = 1; s < 9000; s++) { const w = weatherAt(s, 1); if (w.kind === "storm" && w.hour === "day" && w.spell === 0) { Object.assign(wx, { seed: s, t: 100, easy: false, on: true }); break; } }
    save.tutorialDone = true; resetEnemies(S);
    const foes = [0, 1, 2].map(i => makeEnemy(S, player.x + 120 + 40 * i, player.y + 100, 5, "navy", "brig"));
    disForce("fog", null, { warn: 0.5, end: wx.t + 1e5 });
    let worst = 0, frames = 0, rolled = 0, forced = 0;
    for (let i = 0; i < 420; i++) {
      if (i % 100 === 20) { const k = ["vortex", "tsunami", "rogue", "lightning"][i / 100 | 0]; if (disForce(k, { x: player.x + 80, y: player.y }, { warn: 1 })) forced++; }
      __step(1);
      for (const sh of [player, ...foes]) {
        if (!sh.spr || !sh.spr.active || !sh.gl) continue;
        for (const im of [sh.gl.all, ...Object.values(sh.gl.img)]) if (im.visible) { frames++; worst = Math.max(worst, Math.abs(im.rotation - sh.spr.rotation), Math.abs(im.scaleX - sh.spr.scaleX), Math.abs(im.x - sh.spr.x) > 3 ? 1 : 0); }
        rolled = Math.max(rolled, Math.abs(sh.spr.rotation - sh.rot));
      }
    }
    return { worst: +worst.toFixed(6), frames, rolled: +rolled.toFixed(3), forced };
  });
  ok("through a storm and forced whirlpool, tsunami, rogue wave and lightning, every gun layer stays on its hull's pose (player and AI)", dz.worst < 1e-6 && dz.frames > 300 && dz.rolled > 0.01 && dz.forced >= 3, dz);
  await page.evaluate(() => { __g.loop.wake(); });
  await ctx.close();
}

// ---- 30-gun deck: texture sharing and the cap ----
{
  const { ctx, page } = await open(D, { tag: "cache" });
  await page.evaluate(`(${armLine})(); (${toSea})(); ${stepper}; __step(10); S.cameras.main.centerOn(player.x, player.y); __step(2);`);
  const r = await page.evaluate(() => {
    const count = (pre = "gunlayer:") => S.textures.getTextureKeys().filter(k => k.startsWith(pre)).length;
    resetEnemies(S); __step(2); const base = count("gunlayer:brig:");
    for (let i = 0; i < 20; i++) { resetEnemies(S); for (let j = 0; j < 8; j++) makeEnemy(S, player.x + 40 * j - 140, player.y + 150, 6, "navy", "brig"); __step(2); }
    const shared = count("gunlayer:brig:") - base;
    const kinds = ["six", "long12", "carronade", "chain", "fire"];
    for (let n = 0; n < 150; n++) { save.left = save.left.map((_, i) => gunItem(kinds[((Math.imul(i + 1, 2654435761) ^ Math.imul(n + 7, 40503)) >>> 7) % 5])); __step(1); }
    return { shared, afterChurn: count(), cap: GUN_TEX_CAP, ownTex: S.textures.exists(player.gl.all.texture.key) };
  });
  ok("160 AI hulls of one class and loadout add only a few textures (they share one per mount); rearranging 150 times stays under the cap and never frees one in use", r.shared <= 5 && r.afterChurn < 150 && r.afterChurn <= r.cap + 4 && r.ownTex, r);
  await page.evaluate(() => { __g.loop.wake(); });
  await ctx.close();
}

const bad = results.filter(r => !r.pass).length;
if (errors.length) console.error("page errors:\n" + errors.join("\n"));
console.log(`\n${results.length - bad}/${results.length} checks passed, ${errors.length} page errors`);
await browser.close();
process.exit(bad || errors.length ? 1 : 0);
