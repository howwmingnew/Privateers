// Shot-away masts in headless Chrome (js/masts.js, #43): a ball can break a mast (chain shot at will), the hull is redrawn with a stump and swaps its texture only
// when the mask changes, speed and turn follow the masts left (merged with chain shot's slow, not added to it), a boss keeps a floor, the HUD shows the captain's
// masts, a dock ring or a supply station steps them back (a trade port does not), a crippled AI ship stands and fires its broadside, and no page errors.
// Fixed seed; every wait steps frames until its condition holds (no fixed sleeps).
// Usage: node tests/masts.mjs [url]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });

const SAVE = JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: { bounty: 2 } });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(), errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
const ready = async () => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
};
await page.goto(url, { waitUntil: "load" }); await ready();
await page.evaluate(s => { localStorage.clear(); localStorage.setItem("privateers-lang", "en"); localStorage.setItem("privateers-save-v2", s); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); }, SAVE);
await page.reload({ waitUntil: "load" }); await ready();
const ev = (fn, arg) => page.evaluate(fn, arg);

await ev(() => {
  window.fixT = 0;
  window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); } };
  window.openAt = (ring, near = 420) => { for (let a = 0; a < 200; a++) { const p = polarPt(a * 0.37, ringMid(ring)); if (!islands.some(i => Math.hypot(i.x - p.x, i.y - p.y) < i.r + near)) return p; } return polarPt(0, ringMid(ring)); };
  window.pin = e => { e.angry = 1e6; return e; };
  window.clearSea = () => { for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; fleets = []; spawnT = 1e9; };
  window.park = p => { Object.assign(player, { x: p.x, y: p.y, rot: 0, speed: 0, maxHp: 1e9, hp: 1e9 }); player.spr.setPosition(p.x, p.y); };
  window.depart = () => { spawnT = 0; document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; if (typeof tut !== "undefined") tut.active = false; save.tutorialDone = true; };
  window.stage = (L, faction, cls, off = 600, ring = 5) => {
    const p = openAt(ring, 700); park(p); depart(); clearSea();
    const e = makeEnemy(S, p.x + off, p.y, L, faction, cls); e.rot = 0; pin(e); e.speed = 0; e.hp = e.maxHp = 1e9;
    return e;
  };
  // a ball that breaks a mast for certain: its die reads 0 (under the odds), and the first mast standing goes
  // the dice mastHit throws are fixed through mastRoll itself (Phaser draws from Math.random too, e.g. in a float text, so a stubbed Math.random would be shared with it)
  const dice = v => { const roll = mastRoll; window.mastRoll = (lost, n, chance) => roll(lost, n, chance, v, 0); return () => { window.mastRoll = roll; }; };
  window.hit = (e, chain) => { const back = dice(0); try { hurt(e, 1, 0, player, { x: e.x, y: e.y, vx: 0, vy: 1, chain: !!chain, chainT: chain ? CHAIN_T : 0, dmg: 1 }); } finally { back(); } };
  window.miss = e => { const back = dice(0.999); try { hurt(e, 1, 0, player, { x: e.x, y: e.y, vx: 0, vy: 1, chain: true, chainT: CHAIN_T, dmg: 1 }); } finally { back(); } };
  depart();
});

console.log("A hull with three masts");
const three = await ev(() => {
  const e = stage(6, "pirate", "frigate", 600);
  const n = mastN(e), key0 = e.spr.texture.key, base = rigSpeed(e);
  const ships = () => S.textures.getTextureKeys().filter(k => k.startsWith("ship:")).length, textures0 = ships();
  stepN(60);
  const quiet = ships() === textures0 && e.spr.texture.key === key0;
  hit(e, false);
  const a = { lost: e.mastLost, key: e.spr.texture.key, left: mastLeft(e.mastLost, n), speed: rigSpeed(e), turn: rigTurn(e), baked: S.textures.exists(e.spr.texture.key) };
  stepN(60);
  const steady = e.spr.texture.key === a.key;
  hit(e, false); hit(e, false);
  const gone = { lost: e.mastLost, speed: rigSpeed(e), key: e.spr.texture.key };
  hit(e, false);   // nothing left to break
  return { n, key0, base, quiet, a, steady, gone, same: e.mastLost === gone.lost && e.spr.texture.key === gone.key, art: e.artCls, cls: e.cls };
});
check(three.n === 3 && three.base === 1, `a frigate has ${three.n} masts and a whole rig sails at ${three.base}`);
check(three.quiet, "60 quiet frames bake no ship texture and keep the same one");
check(three.a.left === 2 && three.a.key === `${three.key0}:m${three.a.lost}` && three.a.baked, `one ball takes one mast (mask ${three.a.lost}) and the hull swaps to its own texture ${three.a.key}`);
check(Math.abs(three.a.speed - 0.7167) < 0.01 && three.a.turn < 1 && three.a.turn > 0.8, `two of three standing: speed x${three.a.speed.toFixed(2)}, turn x${three.a.turn.toFixed(2)}`);
check(three.steady, "the texture is not redrawn on later frames");
check(three.gone.lost === 7 && Math.abs(three.gone.speed - 0.15) < 1e-6, `three balls take all three masts: speed x${three.gone.speed}`);
check(three.same, "a fourth ball has no mast left to break and changes nothing");

console.log("Misses and chain shot");
const odds = await ev(() => {
  const e = stage(6, "pirate", "frigate", 600);
  miss(e);   // chain shot that fails the roll: the rigging slow, no mast
  const m = { lost: mastMask(e), chainT: e.chainT > 0, speed: rigSpeed(e), turn: rigTurn(e) };
  hit(e, true);   // chain shot that breaks a mast: mask changes AND chain slow runs: worse of the two, not the product
  const c = { lost: e.mastLost, speed: rigSpeed(e), turn: rigTurn(e) };
  e.chainT = 0; const after = rigSpeed(e);
  // plain odds, many real rolls at the config chance
  let broke = 0, N = 20000; for (let i = 0; i < N; i++) if (mastRoll(0, 3, mastChance(false), Math.random(), Math.random()) !== 0) broke++;
  let brokeC = 0; for (let i = 0; i < N; i++) if (mastRoll(0, 3, mastChance(true), Math.random(), Math.random()) !== 0) brokeC++;
  return { m, c, after, p: broke / N, pc: brokeC / N };
});
check(odds.m.lost === 0 && odds.m.chainT && Math.abs(odds.m.speed - 0.6) < 1e-6 && Math.abs(odds.m.turn - 0.7) < 1e-6, "chain shot that breaks nothing is the old torn-rigging slow (x0.6 speed, x0.7 turn)");
check(odds.c.lost === 1 && Math.abs(odds.c.speed - 0.6) < 1e-6 && Math.abs(odds.c.turn - 0.7) < 1e-6, `chain shot plus a lost mast: the worse of the two (x${odds.c.speed.toFixed(2)}), not 0.6 x 0.72`);
check(Math.abs(odds.after - (0.15 + 0.85 * 2 / 3)) < 1e-6, `once the chain's few seconds are over, the mast loss alone holds (x${odds.after.toFixed(2)})`);
check(odds.p > 0.02 && odds.p < 0.04 && odds.pc > 0.22 && odds.pc < 0.28, `the odds: ${(odds.p * 100).toFixed(1)}% a ball, ${(odds.pc * 100).toFixed(1)}% chain shot`);

console.log("Speed on the water");
const sail = await ev(() => {
  const e = stage(6, "pirate", "frigate", 1500);
  e.target = null; e.maxSpeed = 200;
  const run = () => { steer(e, 0, 1, 0.016); for (let i = 0; i < 400; i++) steer(e, 0, 1, 0.016); return e.speed; };
  const whole = run();
  hit(e, false); const one = run();
  hit(e, false); hit(e, false); const none = run();
  return { whole, one, none };
});
check(Math.abs(sail.whole - 200) < 2, `a whole rig reaches its top speed (${sail.whole.toFixed(0)})`);
check(sail.one < sail.whole * 0.8 && sail.one > sail.whole * 0.6, `with one mast down she tops out lower (${sail.one.toFixed(0)})`);
check(sail.none < sail.whole * 0.2 && sail.none > 0, `with none left she drifts (${sail.none.toFixed(0)})`);

console.log("Boss floor");
const boss = await ev(() => {
  const e = stage(6, "pirate", "frigate", 600);
  e.boss = "test-boss"; hit(e, false); hit(e, false); hit(e, false);
  return { lost: e.mastLost, speed: rigSpeed(e) };
});
check(boss.lost === 7 && Math.abs(boss.speed - 0.55) < 1e-6, `a boss with every mast shot away still sails at x${boss.speed}`);

console.log("Particles and sound");
const fx = await ev(() => {
  const e = stage(6, "pirate", "frigate", 200);
  S.cameras.main.centerOn(player.x + 100, player.y); stepN(3);   // the break is in view
  rags = 0;   // the earlier balls in this run left scraps that no real time has faded
  const r0 = rags, ims = S.children.list.length;
  hit(e, false);
  return { rags: rags - r0, more: S.children.list.length > ims, named: Snd.names.includes("mastBreak") && Snd.names.includes("mastFix"), flt: e.mastLost };
});
check(fx.named, "the crack and the refit knock are registered synthesized sounds");
check(fx.rags > 0 && fx.more, `canvas scraps and splinters appear where it broke (${fx.rags} scraps)`);

console.log("The captain's HUD");
const hudA = await ev(() => {
  const p = openAt(5, 700); park(p); depart(); clearSea(); player.mastLost = 0; mastRedraw(player); stepN(10);
  const el = document.getElementById("mastInd");
  const n = mastN(player), whole = { icons: el.querySelectorAll("svg").length, down: el.querySelectorAll("svg.down").length, shown: !el.hidden, aria: el.getAttribute("aria-label") };
  const key0 = player.spr.texture.key;
  hit(player, false); stepN(10);
  const one = { down: el.querySelectorAll("svg.down").length, up: el.querySelectorAll("svg.up").length, aria: el.getAttribute("aria-label"), key: player.spr.texture.key, key0, hurt: el.classList.contains("hurt") };
  lang = "zh"; applyLang(); stepN(10); const zh = el.getAttribute("aria-label"); lang = "en"; applyLang(); stepN(10);
  return { n, whole, one, zh, toast: document.getElementById("toast").textContent + "|" + toastQueue.map(q => q.msg).join("|") };
});
check(hudA.whole.shown && hudA.whole.icons === hudA.n && hudA.whole.down === 0, `the HUD shows one icon per mast (${hudA.whole.icons} of ${hudA.n}), none grey`);
check(hudA.one.down === 1 && hudA.one.up === hudA.n - 1 && hudA.one.hurt, "one broken mast greys one icon");
check(hudA.one.key === `${hudA.one.key0}:m1` || hudA.one.key.includes(":m1"), `her own hull is redrawn too (${hudA.one.key})`);
check(/masts standing/.test(hudA.whole.aria + hudA.one.aria) && /根桅杆/.test(hudA.zh), `the label reads in both languages (${hudA.one.aria} / ${hudA.zh})`);
check(/mast is shot away/.test(hudA.toast), "the first lost mast of the session is explained in a toast");

console.log("Refit");
const fix = await ev(() => {
  const n = mastN(player); player.mastLost = 7 & mastFull(n); mastRedraw(player);
  const out = {};
  runHook("dock", "trade"); out.trade = player.mastLost;
  mastsMend(player, 0.1); out.shortStep = player.mastLost;
  mastsMend(player, MAST.fixT); out.step1 = player.mastLost;
  mastsMend(player, MAST.fixT); out.step2 = player.mastLost;
  mastsMend(player, MAST.fixT); out.step3 = player.mastLost;
  player.mastLost = 1; runHook("dock", "supply"); out.supply = player.mastLost;
  player.mastLost = 1; runHook("dock", "return"); out.harbor = player.mastLost; out.key = player.spr.texture.key;
  player.mastLost = 3; runHook("sail"); out.sail = player.mastLost;
  const before = player.hp; player.mastLost = 1; player.hp = player.maxHp / 2; const stillRepair = typeof repairStep === "function" ? repairStep(player.hp, player.maxHp, 5, true) > player.hp : true; out.sea = { stillRepair, lost: player.mastLost };
  player.mastLost = 0; mastRedraw(player);
  return { n, ...out };
});
check(fix.trade === (7 & ((1 << fix.n) - 1)), "a trade port refits nothing");
check(fix.shortStep === fix.trade && fix.step1 === (fix.trade & ~1), "the ring steps the lowest broken mast up once MAST.fixT seconds have passed");
check(fix.step3 === 0, "...and the rest after it, one at a time");
check(fix.supply === 0 && fix.harbor === 0 && fix.sail === 0, "docking at a supply station or the harbor, and setting sail, leave the masts whole");
check(fix.sea.lost === 1 && fix.sea.stillRepair, "mending the hull at sea does not touch the masts");

console.log("A crippled AI ship stands and fires");
const cr = await ev(() => {
  const e = stage(6, "pirate", "frigate", 320);
  for (let i = 0; i < 3; i++) hit(e, false);
  e.angry = 1e6; e.attacker = player; e.target = player;
  stepN(300);
  const toP = Math.atan2(player.y - e.y, player.x - e.x), off = Math.abs(Math.abs(angDiff(e.rot, toP)) - Math.PI / 2);
  return { off, speed: e.speed, max: e.maxSpeed, d: dist(e, player), crippled: mastCrippled(e) };
});
check(cr.crippled && cr.off < 0.6, `a dismasted pirate lies broadside on to her target (${cr.off.toFixed(2)} rad off beam-on)`);
check(cr.speed < cr.max * 0.25, `...and does not chase (speed ${cr.speed.toFixed(0)} of ${cr.max.toFixed(0)})`);

console.log("Whole-rig hulls are untouched");
const whole = await ev(() => { const e = stage(6, "pirate", "frigate", 320); e.target = player; e.angry = 1e6; stepN(180); return { crippled: mastCrippled(e), speed: e.speed, d: dist(e, player) }; });
check(!whole.crippled && whole.speed > 20, `a ship with her masts up still works her way (speed ${whole.speed.toFixed(0)})`);

check(errors.length === 0, errors.length ? errors.join(" | ") : "no page errors");
await browser.close();
if (fails.length) { console.log(`\n${fails.length} failed`); process.exit(1); }
console.log("\nall ok");
