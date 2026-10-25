// Campaign checks in headless Chrome: ring-quota spawning, the sea banner, all five bounties, ship gates, the outpost,
// victory (both choices), New Game+, achievements across a reload, old saves, string parity, frame time, screenshots.
// Usage: node tests/campaign.mjs [url] [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
// CI runners render without a GPU (~10 fps, game time runs at half speed): TEST_SLOW stretches every wait.
const SLOW = +process.env.TEST_SLOW || 1;

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/campaign";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const DESK = { width: 1280, height: 720 }, PHONE = { width: 390, height: 844 };

async function open(viewport, { lang = "en", saveJson = null, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  // the game reads the save only on boot: ours goes in just before it, once per tab, so the reloads below find what the game wrote
  await ctx.addInitScript(([l, s]) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", l); if (s) localStorage.setItem("privateers-save-v2", s);
  }, [lang, saveJson]);
  await page.goto(url, { waitUntil: "load" });
  await ready(page);
  return { ctx, page, errors, shot: name => page.screenshot({ path: join(out, name + ".png") }) };
}
// Boot shows the title screen (js/menu.js); its start button docks at the harbor as boot used to.
const ready = async page => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });   // a fresh save sails straight out (js/menu.js)
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
};
const done = async (tag, o) => { check(o.errors.length === 0, `${tag}: no page errors${o.errors.length ? " -> " + o.errors.join(" | ") : ""}`); await o.ctx.close(); };
// Sink the active bounty's ship by hand: sail if needed, park beside it, one big hit from the player.
const claim = (page, i) => page.evaluate(i => {
  const b = BOUNTIES[i];
  if (!enemies.some(e => e.boss === b.id && e.alive)) { if (!docked) sendHome(), dock("return"); setSail(); }   // a boss only takes its lair on departure
  const boss = enemies.find(e => e.boss === b.id);
  if (!boss) return { err: "no boss for " + b.id };
  const info = { L: boss.L, ring: ringAt(dist(boss, PORT)), hp: Math.round(boss.maxHp), escorts: enemies.filter(e => e.escortOf === b.id).map(e => e.L),
    gold0: save.gold, reward: bountyReward(b), tag: !!bossTag };
  player.x = boss.x - 260; player.y = boss.y; player.maxHp = 1e6; player.hp = 1e6;   // kept afloat until the next dock
  hurt(boss, boss.hp + 1, 0, player);
  return { ...info, gold1: save.gold, bounty: save.campaign.bounty, rank: save.campaign.rank, ships: save.campaign.ships, next: activeBounty()?.id ?? null,
    outpost: save.campaign.outpost, tagGone: !bossTag };
}, i);

// ---------- 1. Fresh game: seed, spawning by ring quota, the banner, bounties, gates, outpost, victory, NG+ ----------
console.log("Fresh campaign (desktop, en)");
{
  const o = await open(DESK), { page } = o;
  const boot = await page.evaluate(() => ({ seed: save.seed, islands: islands.filter(i => !i.outpost).length, W, ZONE_STEP,
    edgeL: levelAt(W / 2 - 150), cornerL: levelAt(Math.hypot(W / 2 - 150, H / 2 - 150)), mini: mini.width,
    parity: [Object.keys(STR.en).filter(k => !(k in STR.zh)), Object.keys(STR.zh).filter(k => !(k in STR.en))],
    emptyZh: Object.entries(STR.zh).filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k) }));
  check(boot.seed !== 7 && boot.seed > 0, `new game rolls its own island seed (${boot.seed})`);
  check(boot.islands >= 80 && boot.islands <= 85, `about 85 islands (${boot.islands})`);
  check(boot.edgeL === 10 && boot.cornerL === 10, `axis edge and corners are Lv 10 (${boot.edgeL}, ${boot.cornerL})`);
  check(boot.parity[0].length === 0 && boot.parity[1].length === 0 && boot.emptyZh.length === 0, `every string in both languages ${JSON.stringify(boot.parity)} ${boot.emptyZh}`);
  const lock0 = await page.evaluate(() => { resetLedgerPick(); hullOpen = true; renderPort();   // the ships are in the hull's panel (js/ledger-panel.js)
    const b = document.querySelector('#ships [data-id="schooner"]'); return { dis: b?.disabled, txt: b?.textContent, why: b?.closest(".item").querySelector(".lock")?.textContent }; });
  check(lock0.dis && /Red Ned/.test(lock0.why || ""), `schooner locked before bounty 1: "${lock0.txt}" / "${lock0.why}"`);
  await o.shot("desktop-en-1-ledger");

  // spawning: record every quota spawn, then park the player in each ring for 30 simulated seconds
  await page.evaluate(() => {
    window.__spawns = [];
    const orig = spawnEnemy;
    spawnEnemy = function (sc, at) { const e = orig(sc, at); if (e && !at) __spawns.push({ L: e.L, d: Math.hypot(e.x - PORT.x, e.y - PORT.y) }); return e; };
    setSail(); paused = true; player.maxHp = 1e6;
  });
  const rows = [];
  for (const r of [700, 1100, 1420, 1740, 2060, 2380, 2700, 3020, 3340, 3700, 4900]) {
    rows.push(await page.evaluate(r => {
      const a = r > 4000 ? Math.PI * 0.25 : -0.3;
      player.x = PORT.x + Math.cos(a) * r; player.y = PORT.y + Math.sin(a) * r;
      for (let i = 0; i < 600; i++) { player.hp = player.maxHp; step(0.05); }
      const c = seaCensus(), nearN = c.near.reduce((s, L) => s + c.count[L], 0);
      return { r, ring: playerRing(), count: c.count.slice(1), total: c.total, nearShare: +(nearN / c.total).toFixed(2), nearMin: Math.min(...c.near.map(L => c.count[L])),
        within1500: enemies.filter(e => e.alive && isOrdinary(e) && dist(e, player) < 1500).length };
    }, r));
  }
  for (const row of rows) console.log(`        r=${row.r} ring ${row.ring}: per ring ${row.count.join(" ")} | total ${row.total} | near share ${row.nearShare} | within 1500px ${row.within1500}`);
  const sp = await page.evaluate(() => ({ n: __spawns.length, bad: __spawns.filter(s => s.L !== ringAt(s.d)).length, levels: [...new Set(__spawns.map(s => s.L))].sort((a, b) => a - b) }));
  check(sp.bad === 0, `every spawn's level comes from its distance (${sp.n} spawns, ${sp.bad} off)`);
  check(sp.levels.join() === "1,2,3,4,5,6,7,8,9,10", `spawns cover Lv 1-10 (${sp.levels})`);
  // Far rings hold 1-2 ships each, so one of them can sit empty for a moment between a sinking and the next top-up
  // (spawns come every 1.2 s); the rings around the player never may.
  check(rows.every(r => r.count.filter(n => n < 1).length <= 1 && r.nearMin >= 1),
    "the player's ring and its neighbours are always populated; at most one far ring is briefly empty");
  check(rows.every(r => r.total <= 30 && r.nearShare >= 0.45), "near rings hold most of the ships (~60%)");
  await page.evaluate(() => { player.maxHp = yardVal("hull"); player.hp = player.maxHp; sendHome(), dock("return"); });

  // banner: sail from the Shallows into the Reef Straits
  await page.evaluate(() => { setSail(); player.x = PORT.x - 1000; player.y = PORT.y + 60; });
  await page.waitForTimeout(900 * SLOW);
  // the first voyage's coach keeps sea banners back (js/world-seas.js): put it away for this check
  await page.evaluate(() => { tutorialReset(); player.x = PORT.x - 1460; player.y = PORT.y + 60; player.hp = player.maxHp; });
  // until the banner is up (and faded in, for the picture below); the check that follows says what was missing
  await page.waitForFunction(() => seaBanner.classList.contains("on") && seaBanner.dataset.sea === "reef" && !!save.ach.sea_reef && getComputedStyle(seaBanner).opacity === "1", null, { polling: 50, timeout: 3000 * SLOW }).catch(() => {});
  const ban = await page.evaluate(() => ({ on: seaBanner.classList.contains("on"), sea: seaBanner.dataset.sea, txt: seaBanner.textContent, ach: !!save.ach.sea_reef }));
  check(ban.on && ban.sea === "reef" && /Reef Straits/.test(ban.txt) && /Lv 3–5/.test(ban.txt), `banner on crossing into the Reef Straits: "${ban.txt}"`);
  check(ban.ach, "reaching the Reef Straits unlocks its achievement");
  await o.shot("desktop-en-2-banner");

  // bounty 1, with the arrow (boss off screen) and the tag / boss bar (boss close)
  // the previous step left the camera out west, where Red Ned's lair is; snap it home so the boss is truly off screen.
  // A fresh save is still on its first voyage, which holds the bounty back (js/campaign.js): call the tutorial done.
  await page.evaluate(() => { save.tutorialDone = true; sendHome(), dock("return"); setSail(); S.cameras.main.centerOn(player.x, player.y); });
  // the arrow / edge box is placed on a frame of its own after the camera settles, and edge marks sit out banners: wait for it
  await page.waitForFunction(() => !bossArrow.hidden || !!document.querySelector("#edgeMarks .em.boss:not(.gone)"), null, { timeout: 8000 * SLOW }).catch(() => {});
  // within the edge markers' range the bounty's skull box (with its distance, js/edge-marks.js) stands in for the arrow
  const arrow =await page.evaluate(() => ({ arrow: !bossArrow.hidden || !!document.querySelector("#edgeMarks .em.boss:not(.gone)"), mini: !!activeBounty() }));
  check(arrow.arrow, "edge arrow (or, within range, the bounty's edge box) points at the bounty while it is off screen");
  await o.shot("desktop-en-3-arrow");
  await page.evaluate(() => { const b = enemies.find(e => e.boss); player.x = b.x - 280; player.y = b.y + 40; player.rot = 0; b.target = null; });
  await page.waitForTimeout(700 * SLOW);
  const near = await page.evaluate(() => ({ bar: !bossBar.hidden, arrow: !bossArrow.hidden, name: bossBar.textContent }));
  check(near.bar && !near.arrow && /Red Ned/.test(near.name), `boss bar shows when close, arrow hides (${near.name})`);
  await o.shot("desktop-en-4-boss");

  const expect = [["ned", 3, "schooner"], ["carey", 5, "brig"], ["saint", 7, "frigate"], ["hale", 9, "line"], ["thorne", 10, null]];
  for (let i = 0; i < 5; i++) {
    const [id, L, ship] = expect[i];
    const r = await claim(page, i);
    if (r.err) { check(false, r.err); break; }
    check(r.L === L && r.ring === L, `bounty ${i + 1} ${id}: Lv ${r.L} in ring ${r.ring}, ${r.hp} HP, escorts at Lv ${r.escorts.join("/") || "-"}`);
    check(r.escorts.every(e => e === L), `bounty ${i + 1}: escorts share the boss's level`);
    check(r.gold1 - r.gold0 === r.reward, `bounty ${i + 1}: chest pays ${r.reward} straight into gold (${r.gold0} -> ${r.gold1})`);
    check(r.bounty === i + 1 && r.rank === Math.min(i + 1, 4), `bounty ${i + 1}: campaign ${r.bounty}/5, rank ${r.rank}`);
    if (ship) check(r.ships.includes(ship), `bounty ${i + 1}: unlocks the ${ship}`);
    check(r.next === (expect[i + 1]?.[0] ?? null), `bounty ${i + 1}: next bounty is ${r.next}`);
    check(r.tagGone, `bounty ${i + 1}: name tag removed with the ship`);
    if (i === 0) {   // buy the schooner now that it is unlocked: the gate opened and the yard sells it
      await page.evaluate(() => { sendHome(); dock("return"); });
      await page.waitForTimeout(400 * SLOW);   // shop buttons ignore clicks for a moment after the ledger opens (js/menu.js)
      const story =await page.evaluate(() => document.querySelector("#wanted .story")?.textContent || "");
      check(/Privateer/.test(story), "harbor tells the story of the bounty just claimed");
      await o.shot("desktop-en-5-after-ned");
      await page.evaluate(() => { resetLedgerPick(); hullOpen = true; renderPort(); });
      await page.click('#ships [data-act="ship"][data-id="schooner"]'); await page.waitForTimeout(500 * SLOW);
      await page.click('#ships [data-act="ship"][data-id="schooner"]'); await page.waitForTimeout(200 * SLOW);
      const own = await page.evaluate(() => (hullOpen = true, renderPort(), { ship: save.ship, ach: !!save.ach.own_schooner, brigLock: document.querySelector('#ships [data-id="brig"]')?.closest(".item").querySelector(".lock")?.textContent }));
      check(own.ship === "schooner" && own.ach, "schooner bought after bounty 1; its achievement unlocks");
      check(/Mother Carey/.test(own.brigLock || ""), `brig still locked: "${own.brigLock}"`);
    }
    if (i === 2) {   // the outpost: sail in with cargo, sell, see the trimmed ledger, sail out under truce
      check(r.outpost, "bounty 3 opens the Hulk Outpost");
      // loose crates (struck merchants drop theirs afloat) would be magnetted in on the approach and sold too: clear them
      const o1 = await page.evaluate(() => { sendHome(), dock("return"); setSail(); for (const c of crates) if (!c.wreck) c.value = 0;
        player.x = OUTPOST.x + 420; player.y = OUTPOST.y; player.hp = player.maxHp; cargo = 120; return save.gold; });
      await page.waitForTimeout(300 * SLOW);
      await page.evaluate(() => { for (const c of crates) if (!c.wreck) c.value = 0; cargo = 120; player.x = OUTPOST.x + 70; player.y = OUTPOST.y + 30; player.hp = player.maxHp; });
      await page.waitForFunction(() => docked, null, { timeout: 7000 * SLOW }).catch(() => {});   // sold on the way in, ledger after 3 s stopped (js/mooring.js)
      const op = await page.evaluate(() => ({ docked, atOutpost, gold: save.gold, title: document.getElementById("portTitle").textContent,
        fleet: document.getElementById("deck").closest("section").hidden, gear: document.getElementById("gear").closest("section").hidden }));
      check(op.docked && op.atOutpost && op.title === "Hulk Outpost", `docks at the outpost ("${op.title}")`);
      check(op.gold - o1 === 120, `outpost buys the hold (${o1} -> ${op.gold})`);
      check(op.fleet && op.gear, "outpost has no gun deck, armoury or shipyard (they all live under the fleet tabs)");
      await o.shot("desktop-en-6-outpost");
      const tr = await page.evaluate(() => { setSail(); return { truce: inSafe(player), near: nearestHarbor().outpost }; });
      check(tr.truce && tr.near, "sailing out of the outpost starts inside its truce water");
    }
  }
  await page.waitForFunction(() => !vicEl.hidden, null, { timeout: 20000 * SLOW });   // the ending's own delay runs on game time: wait for it, not a fixed sleep
  const vic = await page.evaluate(() => ({ shown: !vicEl.hidden, paused, txt: vicEl.textContent }));
  check(vic.shown && vic.paused && /Free Port Stands/.test(vic.txt) && /Time played/.test(vic.txt), "victory screen after Admiral Thorne, with the captain's stats");
  await o.shot("desktop-en-7-victory");
  // a fire key still held from the last broadside must not dismiss the ending: presses inside the grace period are ignored
  // (the grace runs on wall-clock time from the screen opening: restart it right at the press so a slow machine cannot outlast it)
  await page.evaluate(() => { vicShownAt = performance.now(); vicLastTry = 0; document.querySelector("[data-v=keep]").click(); });
  check(await page.evaluate(() => !vicEl.hidden), "a press right as the victory screen opens does not skip it");
  await page.evaluate(() => { vicShownAt = performance.now() - VIC_GRACE_MS - 100; vicLastTry = 0; });   // the grace and the press-spam calm have run out
  await page.click("[data-v=keep]"); await page.waitForTimeout(200 * SLOW);
  const keep = await page.evaluate(() => ({ hidden: vicEl.hidden, paused, docked, won: save.campaign.won }));
  check(keep.hidden && !keep.paused && !keep.docked && keep.won, "Keep sailing: back at sea, campaign marked won");

  // the rest of the achievements, by doing the thing
  const ach = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    sendHome(); dock("return"); setSail();   // a fresh sea, away from the Admiral's escorts
    player.maxHp = 1e6; player.hp = 1e6; player.x = PORT.x + 800; player.y = PORT.y;
    await wait(100);
    cargo = player.cap; await wait(150); cargo = 0;
    const w = { x: Math.round(player.x + 20), y: Math.round(player.y), value: 5 }; save.wrecks.push(w); addCrate(w.x, w.y, w.value, w);
    await wait(500);
    const [a, b] = enemies.filter(e => e.alive && isOrdinary(e));
    b.x = player.x + 30; b.y = player.y - 10;
    hurt(b, b.hp + 1, 0, a);   // sunk by someone else: its plunder floats right next to us
    await wait(700);
    return save.ach;
  });
  for (const id of ["first_hit", "first_sink", "full_hold", "salvage", "vulture", "bounty_1", "bounty_2", "bounty_3", "bounty_4", "bounty_5", "charmed", "own_schooner"])
    check(!!ach[id], `achievement ${id}`);

  // New Game+ from the harbor poster, then levels +3, then New Game+ again from the victory screen
  await page.evaluate(() => { sendHome(); dock("return"); });
  const before = await page.evaluate(() => ({ seed: save.seed, gunLv: save.gunLv, unlocked: save.unlocked, ach: Object.keys(save.ach).length, stats: save.stats.bounties }));
  await page.click("[data-camp=ng]"); await page.waitForTimeout(150 * SLOW); await page.click("[data-camp=ng]"); await page.waitForTimeout(300 * SLOW);
  const ng = await page.evaluate(() => ({ ng: save.ngPlus, bounty: save.campaign.bounty, gold: save.gold, ship: save.ship, seed: save.seed, islandSeed,
    gunLv: save.gunLv, unlocked: save.unlocked, ach: Object.keys(save.ach).length, stats: save.stats.bounties, poster: document.querySelector("#wanted .poster")?.textContent, rec: bountyRecLv(BOUNTIES[0]),
    recBase: (() => { const ng = save.ngPlus; save.ngPlus = 0; const r = bountyRecLv(BOUNTIES[0]); save.ngPlus = ng; return r; })() }));
  check(ng.ng === 1 && ng.bounty === 0 && ng.gold === 0 && ng.ship === "sloop", "New Game+ (poster): campaign, gold and ship start over");
  check(ng.seed !== before.seed && ng.islandSeed === ng.seed, "New Game+ rolls a new map");
  check(JSON.stringify(ng.gunLv) === JSON.stringify(before.gunLv) && JSON.stringify(ng.unlocked) === JSON.stringify(before.unlocked), "New Game+ keeps guns and their levels");
  check(ng.ach === before.ach && ng.stats === before.stats, "New Game+ keeps achievements and lifetime stats");
  // the poster's one level is its Goal line (Ready at Ship Lv N) (boss + escorts), and New Game+ must raise it
  check(ng.rec > ng.recBase && (ng.poster || "").includes(`Ship Lv ${ng.rec} `), `New Game+ poster recommends a higher Ship Lv for Red Ned (${ng.recBase} -> ${ng.rec}): "${ng.poster}"`);
  await o.shot("desktop-en-8-ngplus");
  const lv = await page.evaluate(() => { setSail(); const s = enemies.filter(e => e.alive && isOrdinary(e));
    return { bad: s.filter(e => e.L !== ringAt(dist(e, PORT)) + 3).length, min: Math.min(...s.map(e => e.L)), boss: enemies.find(e => e.boss)?.L }; });
  check(lv.bad === 0 && lv.min >= 4 && lv.boss === 6, `New Game+ enemies are ring level +3 (min Lv ${lv.min}, Red Ned Lv ${lv.boss})`);
  for (let i = 0; i < 5; i++) await claim(page, i);
  await page.evaluate(() => { player.maxHp = 100; hurt(player, 1e9, 0, null); });   // the Admiral's escorts sink us right after: the ending still comes
  await page.waitForFunction(() => !vicEl.hidden, null, { timeout: 20000 * SLOW });
  const die = await page.evaluate(() => ({ vic: !vicEl.hidden, docked }));
  check(die.vic && die.docked, "sunk right after the final kill: the victory screen still shows, over the harbor");
  // past the victory screen's input grace. Not shortened: the kill and the dock after the sinking each queue a showVictory
  // (js/campaign.js), the second is still pending here and would open the screen again over a New Game+ taken too soon
  await page.waitForTimeout(1300 * SLOW);
  await page.click("[data-v=ng]"); await page.waitForTimeout(150 * SLOW); await page.click("[data-v=ng]"); await page.waitForTimeout(300 * SLOW);
  const ng2 = await page.evaluate(() => ({ ng: save.ngPlus, vic: vicEl.hidden, docked, bounty: save.campaign.bounty }));
  check(ng2.ng === 2 && ng2.vic && ng2.docked && ng2.bounty === 0, "New Game+ (victory screen) starts cycle 2 in the harbor");

  // achievements and stats survive a reload; the log lists them
  const saved = await page.evaluate(() => Object.keys(save.ach).sort().join());
  await page.reload({ waitUntil: "load" }); await ready(page);
  const after = await page.evaluate(() => ({ ach: Object.keys(save.ach).sort().join(), ng: save.ngPlus }));
  check(after.ach === saved && after.ng === 2, `achievements and NG+ count persist across reload (${after.ach.split(",").length})`);
  await page.click("[data-camp=log]"); await page.waitForTimeout(200 * SLOW);
  const log = await page.evaluate(() => ({ open: !logEl.hidden, on: logEl.querySelectorAll(".achs li.on").length, all: logEl.querySelectorAll(".achs li").length, txt: logEl.textContent }));
  check(log.open && log.on === after.ach.split(",").length && log.all === 20, `Captain's log lists ${log.on} of ${log.all} achievements`);
  check(/Time played/.test(log.txt) && /Longest sortie/.test(log.txt) && /Pirates/.test(log.txt), "Captain's log shows the stats");
  await o.shot("desktop-en-9-log");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => logEl.hidden), "Escape closes the log");
  await done("fresh campaign", o);
}

// ---------- 2. Saves from before this change ----------
console.log("Old saves");
{
  const old = { v: 2, gold: 777, ship: "frigate", hull: 4, sails: 2, hold: 3, unlocked: { six: true, long12: true }, gunLv: { six: 3, long12: 2, carronade: 1, fire: 1 },
    bow: ["six", "long12"], left: ["six", "six", "six", "six"], right: ["long12", "six", "six", "six"], stern: ["six"], sunk: 42, wrecks: [{ x: 3100, y: 1800, value: 90 }] };
  const o = await open(DESK, { saveJson: JSON.stringify(old) }), { page } = o;
  const s = await page.evaluate(() => {
    // the original generator, run as it was on the 5000-px map
    const r = mulberry32(7), orig = [];
    for (let tries = 0; orig.length < 34 && tries++ < 2000;) {
      const R = 60 + r() * 130, x = 150 + r() * 4700, y = 150 + r() * 4700;
      if (Math.hypot(x - 2500, y - 2500) < SAFE_R + R + 80 || orig.some(o => Math.hypot(o.x - x, o.y - y) < o.r + R + 160)) continue;
      for (let i = 0; i < 14; i++) r(); r(); orig.push({ x, y, r: R });
    }
    const there = o => islands.some(i => Math.abs(i.x - o.x - 1500) < 1e-6 && Math.abs(i.y - o.y - 1500) < 1e-6);
    const spots = clearSpots(), onSpot = o => spots.some(p => Math.hypot(p.x - o.x - 1500, p.y - o.y - 1500) < p.r + o.r);
    const same = orig.filter(there).length, kept = orig.filter(o => !onSpot(o)), keptOk = kept.every(there);
    const w = save.wrecks[0];
    return { seed: save.seed, gold: save.gold, ship: save.ship, camp: save.campaign, stats: save.stats, ngPlus: save.ngPlus, same, keptOk, kept: kept.length, wreck: w,
      wreckClear: islands.every(i => Math.hypot(i.x - w.x, i.y - w.y) > i.r + 40), crates: crates.filter(c => c.wreck).length,
      shipsList: (hullOpen = true, renderPort(), [...document.querySelectorAll("#ships .item")].map(el => el.querySelector(".nm").textContent + ":" + el.querySelector(".btn").textContent + ":" + (el.querySelector(".lock")?.textContent || ""))) };
  });
  check(s.seed === 7, `old save keeps the fixed map (seed ${s.seed})`);
  check(s.keptOk && s.same === s.kept, `the original islands are still there, shifted with the harbor (${s.same} of 34; the rest sat on a lair, the outpost or the wreck)`);
  check(s.wreck.x === 4600 && s.wreck.y === 3300 && s.wreckClear && s.crates === 1, `old wreck moved with the harbor and lies in open water (${s.wreck.x}, ${s.wreck.y})`);
  check(s.gold === 777 && s.ship === "frigate" && s.camp.ships.includes("frigate") && s.camp.bounty === 0, "keeps gold and the frigate it already sails; campaign starts at bounty 1");
  check(s.stats.time >= 0 && s.stats.sunk.pirate === 0 && s.ngPlus === 0, "stats and NG+ get defaults");
  check(s.shipsList.length === 9 && /^Sloop:Switch/.test(s.shipsList[0]) && !s.shipsList.some(r => /Frigate:Your ship/.test(r)) && s.shipsList.some(r => /Commodore Hale/.test(r)), `ship list (the lost starter sloop parked in the yard (#72), then every model for sale, both lines; the ship you sail is the tab's own): ${s.shipsList.join(" | ")}`);
  await o.shot("desktop-en-10-oldsave");
  await page.reload({ waitUntil: "load" }); await ready(page);
  const again = await page.evaluate(() => ({ seed: save.seed, w: save.wrecks[0] }));
  check(again.seed === 7 && again.w.x === 4600, "after a reload the wreck is not shifted twice");
  await done("old save", o);

  const blank = { v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1, unlocked: { six: true }, gunLv: { six: 1, long12: 1, carronade: 1, fire: 1 },
    bow: ["six"], left: ["six"], right: ["six"], stern: [], sunk: 0, wrecks: [] };
  const o2 = await open(DESK, { saveJson: JSON.stringify(blank) });
  const s2 = await o2.page.evaluate(() => ({ seed: save.seed, camp: save.campaign.bounty }));
  check(s2.seed !== 7 && s2.camp === 0, `an untouched old save is a new game and rolls a map (${s2.seed})`);
  const junk = await o2.page.evaluate(() => sanitizeCampaignSave({ ...save, seed: "x", campaign: { bounty: 99, ships: ["galleon", "brig"], deaths: -3 }, stats: { time: "NaN", sunk: 5, byLevel: { 3: 2, __proto__: 1, x: 4 } }, ach: { first_hit: 1, "<b>": 3 }, ngPlus: 1e9 }));
  check(junk.campaign.bounty === 5 && junk.campaign.deaths === 0 && junk.stats.time === 0 && JSON.stringify(junk.stats.byLevel) === '{"3":2}' && Object.keys(junk.ach).join() === "first_hit" && junk.ngPlus === 99,
    "hostile campaign fields are coerced");
  await done("blank save", o2);
}

// ---------- 3. Frame time with the full sea ----------
console.log("Frame time");
{
  const o = await open(DESK), { page } = o;
  const ft = await page.evaluate(async () => {
    setSail(); player.maxHp = 1e6; player.hp = 1e6; player.x = PORT.x + 2060; player.y = PORT.y;
    await new Promise(r => setTimeout(r, 500));
    const steps = [], frames = []; let last = performance.now(), run = true;
    const orig = step; step = dt => { const t0 = performance.now(); orig(dt); steps.push(performance.now() - t0); };
    const raf = now => { frames.push(now - last); last = now; if (run) requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    await new Promise(r => setTimeout(r, 8000)); run = false; step = orig;
    const st = a => { const s = [...a].sort((x, y) => x - y); return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2) }; };
    return { step: st(steps), frame: st(frames.slice(5)), ships: enemies.filter(e => e.alive).length, fps: Math.round(S.game.loop.actualFps) };
  });
  console.log(`        ${ft.ships} ships alive · step() ms mean ${ft.step.mean} p95 ${ft.step.p95} max ${ft.step.max} · frame ms mean ${ft.frame.mean} p95 ${ft.frame.p95} · ${ft.fps} fps`);
  check(ft.step.p95 < 4, `step() stays cheap with ${ft.ships} ships (p95 ${ft.step.p95} ms)`);
  await done("frame time", o);
}

// ---------- 4. Screenshots: phone and both languages ----------
console.log("Screenshots");
const late = JSON.stringify({ v: 2, gold: 12000, ship: "frigate", hull: 5, sails: 3, hold: 4, unlocked: { six: true, long12: true, carronade: true }, gunLv: { six: 4, long12: 3, carronade: 2, fire: 1 },
  bow: ["long12", "long12"], left: ["carronade", "carronade", "six", "six"], right: ["carronade", "carronade", "six", "six"], stern: ["six"], sunk: 180, wrecks: [],
  seed: 424242, campaign: { bounty: 4, ships: ["sloop", "schooner", "brig", "frigate", "line"], deaths: 2 }, stats: { time: 7400, gold: 61000, sunk: { pirate: 80, navy: 60, merchant: 40 }, byLevel: { 1: 20, 2: 25, 3: 30, 4: 28, 5: 24, 6: 20, 7: 15, 8: 10, 9: 6, 10: 2 }, deaths: 2, longest: 412, sorties: 70, wrecks: 2, bounties: 4 },
  ach: { first_hit: 1, first_sink: 1, bounty_1: 1, bounty_2: 1, bounty_3: 1, bounty_4: 1, sea_reef: 1 } });
for (const [tag, vp, mobile] of [["desktop", DESK, false], ["mobile", PHONE, true]]) for (const lang of ["en", "zh"]) {
  if (tag === "desktop" && lang === "en") continue;   // covered above
  const o = await open(vp, { lang, mobile }), { page } = o;
  await o.shot(`${tag}-${lang}-1-ledger`);
  await page.evaluate(() => { setSail(); player.x = PORT.x - 1000; player.y = PORT.y + 60; });
  await page.waitForTimeout(900 * SLOW);
  await page.evaluate(() => { player.x = PORT.x - 1460; player.y = PORT.y + 60; player.hp = player.maxHp; });
  await page.waitForTimeout(1000 * SLOW);
  await o.shot(`${tag}-${lang}-2-banner`);
  await o.ctx.close();
  const o2 = await open(vp, { lang, mobile, saveJson: late }), p2 = o2.page;
  await o2.shot(`${tag}-${lang}-3-ledger-late`);
  await p2.click("[data-camp=log]"); await p2.waitForTimeout(200 * SLOW);
  await o2.shot(`${tag}-${lang}-4-log`);
  await p2.evaluate(() => closeLog());
  await claim(p2, 4); await p2.waitForFunction(() => !vicEl.hidden, null, { timeout: 20000 * SLOW }).catch(() => {});
  check(await p2.evaluate(() => !vicEl.hidden), `${tag} ${lang}: victory screen shows`);
  await o2.shot(`${tag}-${lang}-5-victory`);
  await done(`${tag} ${lang}`, o2);
}

await browser.close();
if (fails.length) { console.error(`FAIL (${fails.length})\n` + fails.map(f => "  - " + f).join("\n")); process.exit(1); }
console.log("PASS: campaign checks. Screenshots in " + out);
