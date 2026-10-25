// Phase-1 feedback fixes in headless Chrome: #71 other AI leave bosses alone, #72 every ship ever owned (the starter too) is in the
// yard and swaps back free, #73 the ledger's gold stays in view while scrolling, #68 gun bay "tap the source, then the destination"
// plus the x5 upgrade, #69 the grapple's spring pull. Pure rules are in tests/unit-feedback.mjs.
// Saves pictures to <outDir> (default .review/feedback, not committed).
// Usage: node tests/feedback.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/feedback";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(), errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
const ready = async () => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 20000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
};
const saveWith = (extra = {}) => ({ v: 2, gold: 20000, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: { bounty: 3 }, store: [], ...extra });
const boot = async (s, lang = "en") => {
  await page.goto(url, { waitUntil: "load" }); await ready();
  await page.evaluate(([s, lang]) => { localStorage.clear(); localStorage.setItem("privateers-lang", lang); localStorage.setItem("privateers-save-v2", JSON.stringify(s)); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true, shake: false })); }, [s, lang]);
  await page.reload({ waitUntil: "load" }); await ready();
  await page.waitForTimeout(500);   // the ledger ignores clicks in its first 350 ms (js/menu.js)
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const rig = () => ev(() => {
  window.fixT = 0;
  window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); } };
  window.__gone = list => { for (const s of list) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); } };
});
const sail = async () => { await ev(() => setSail()); await page.waitForFunction(() => !docked && !paused, null, { timeout: 10000 * SLOW }); };

// ---------- #71: other AI leave bosses alone ----------
console.log("#71 other AI never fight a boss");
await boot(saveWith());
await rig(); await sail();
let r = await ev(() => {
  __gone(enemies.slice()); window.__hits = [];
  onHook("hurt", (s, dmg, src) => { if (bossSide(s) !== bossSide(src) && src && !src.isPlayer && !src.ally && !s.isPlayer && !s.ally) __hits.push((s.boss || s.escortOf || s.faction) + "<-" + (src.boss || src.escortOf || src.faction) + (src.A && src.A.boom ? "(boom)" : "")); });
  const spot = { x: 2600, y: 2600 }, b = BOUNTIES[1];
  const boss = spawnCaptain(b), navy = makeEnemy(S, spot.x + 220, spot.y, 3, "navy", "brig"), nav2 = makeEnemy(S, spot.x - 220, spot.y, 6, "navy", "frigate");
  for (const s of [boss, ...enemies.filter(e => e.escortOf)]) { s.x = spot.x + (s === boss ? 0 : 60); s.y = spot.y + (s === boss ? 0 : 80); s.spr.setPosition(s.x, s.y); }
  window.__q = { boss, navy, nav2, guards: enemies.filter(e => e.escortOf) };
  player.x = 9000; player.y = 9000;   // the flagship is far off: the brawl is AI against AI
  return { hostile: isHostile(navy, boss) || isHostile(boss, navy) || __q.guards.some(g => isHostile(navy, g) || isHostile(g, navy)), hp: boss.hp, guards: __q.guards.length };
});
check(!r.hostile && r.guards > 0, `no AI is hostile to the boss or its ${r.guards} guards, nor they to it`);
r = await ev(() => {
  const { boss, navy, nav2 } = __q, hp0 = [boss.hp, ...__q.guards.map(g => g.hp)];
  let aimed = false, fired = false;
  for (let i = 0; i < 900; i++) { stepN(1); for (const o of [navy, nav2]) if (o.target === boss || __q.guards.includes(o.target)) aimed = true; if (boss.target === navy || boss.target === nav2) aimed = true; if (balls.some(b => b.owner === boss && !b.fromPlayer)) fired = true; player.x = 9000; player.y = 9000; }
  return { aimed, fired, hits: __hits.slice(), same: boss.hp === hp0[0] && __q.guards.every((g, i) => g.hp === hp0[i + 1]), navyHp: [navy.hp / navy.maxHp, nav2.hp / nav2.maxHp] };
});
check(!r.aimed && !r.fired, "15 s with a navy brig and frigate beside the boss: nobody aims at anybody, no boss shot is fired");
check(r.hits.length === 0, `boss and guards lose no hull, no outsider hurts the boss side or the other way round (${r.hits.length} hurt events ${r.hits.slice(0, 4)})`);
r = await ev(() => {
  const { boss, navy } = __q; navy.attacker = boss; navy.angry = 8; __hits.length = 0;   // even an AI that was "hit" by the boss does not retaliate
  const b0 = boss.hp; hurt(navy, 1, 0, boss, null);
  const ball = { x: boss.x, y: boss.y, owner: navy, fromPlayer: false, friendly: false };
  return { hostile: isHostile(navy, boss), feud: bossFeud(ball.owner, boss), b0, b1: boss.hp };
});
check(!r.hostile && r.feud, "a grudge never makes an AI hostile to the boss, and an AI's cannonball is spared to the boss test");
r = await ev(() => { const { boss } = __q; player.x = boss.x + 300; player.y = boss.y; player.hp = player.maxHp; return { vsPlayer: isHostile(boss, player), plr: isHostile(__q.guards[0], player) }; });
check(r.vsPlayer && r.plr, "the boss and its guard stay hostile to the flagship");
r = await ev(() => { const { boss } = __q; const ally = makeEnemy(S, boss.x + 200, boss.y, 3, "ally", "brig"); ally.ally = true; return { b: isHostile(boss, ally), a: isHostile(ally, boss) }; });
check(r.b && r.a, "and to the player's own escorts (and the escorts to the boss)");

// ---------- #72: the starter and every bought ship swap back free ----------
console.log("#72 owned ships switch back free");
const tap = sel => page.click(sel);
const yardInfo = () => ev(() => ({ ship: save.ship, id: save.shipId, gold: save.gold, owned: ownedShips().map(e => e.ship), switches: [...document.querySelectorAll('#ships [data-act="switch"]')].map(b => b.dataset.id),
  labels: Object.fromEntries([...document.querySelectorAll('#ships [data-act="ship"]')].map(b => [b.dataset.id, b.textContent.trim()])), hints: document.querySelectorAll("#ships .up").length }));
await boot(saveWith({ gold: 90000 }));
let y = await yardInfo();
check(y.ship === "sloop" && y.switches.length === 0 && !("sloop" in y.labels), "the starter is aboard, nothing to switch to, and the yard does not sell a sloop");
await tap('[data-act="ship"][data-id="schooner"]'); await page.waitForTimeout(500); await tap('[data-act="ship"][data-id="schooner"]'); await page.waitForTimeout(300);
y = await yardInfo();
check(y.ship === "schooner" && y.switches.includes("s1"), "bought a schooner: the sloop waits in the yard with a Switch button");
const goldAfterBuy = y.gold;
await tap('[data-act="switch"][data-id="s1"]'); await page.waitForTimeout(300);
y = await yardInfo();
check(y.ship === "sloop" && y.id === "s1" && y.gold === goldAfterBuy, "switched back to the starter sloop: no gold spent");
check(/another|再買/i.test(y.labels.schooner || "") && y.hints >= 1, `an owned model's sale button says "another" and a hint points at the free switch ("${y.labels.schooner}")`);
await tap('[data-act="switch"][data-id="s2"]'); await page.waitForTimeout(300);
y = await yardInfo();
check(y.ship === "schooner" && y.gold === goldAfterBuy, "and over to the schooner and back again is free as well");
await boot(saveWith({ gold: 0, ship: "brig", hull: 4 }));   // an old save: the starter was replaced long ago
y = await yardInfo();
check(y.ship === "brig" && y.owned.includes("sloop") && y.switches.length === 1, "an old save with no starter gets a sloop in the yard");
await tap('[data-act="switch"]'); await page.waitForTimeout(300);
y = await yardInfo();
check(y.ship === "sloop" && y.gold === 0, "which switches on with an empty purse");

// ---------- #73: the ledger's gold stays in view ----------
console.log("#73 ledger gold is sticky");
const ledgerState = () => ev(() => {
  const sheet = document.querySelector("#port .sheet"), hd = sheet.querySelector("header"), g = document.getElementById("pGold").getBoundingClientRect(), s = sheet.getBoundingClientRect(), h = hd.getBoundingClientRect();
  const hit = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2);
  return { top: Math.round(sheet.scrollTop), max: sheet.scrollHeight - sheet.clientHeight, goldVisible: g.top >= s.top - 1 && g.bottom <= s.top + h.height + 1 && !!hit && (hit.id === "pGold" || hit === hd || hd.contains(hit)),
    hdrH: Math.round(h.height), vh: innerHeight, sheetH: Math.round(s.height), noHScroll: document.documentElement.scrollWidth <= innerWidth + 1 && sheet.scrollWidth <= sheet.clientWidth + 1,
    gold: document.getElementById("pGold").textContent, btnBehind: [...sheet.querySelectorAll("button:not([disabled])")].filter(b => { const r = b.getBoundingClientRect(), fr = sheet.querySelector("footer").getBoundingClientRect(); return r.width > 0 && r.bottom < fr.top && r.top >= s.top + h.height && r.bottom <= s.bottom && (() => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(e && (e === b || b.contains(e))); })(); }).length };
});
const sizes = [[1280, 720, 100], [390, 844, 100], [390, 844, 150], [390, 844, 250], [1280, 720, 250], [390, 844, 50]];
for (const [w, h, pct] of sizes) {
  await page.setViewportSize({ width: w, height: h });
  await boot(saveWith({ gold: 12345 }));
  await ev(pct => { SETTINGS.uiPct = pct; applyUiScale(); if (typeof applyMiniSize === "function") applyMiniSize(); }, pct);
  await page.waitForTimeout(150);
  const where = `${w}x${h} @${pct}%`;
  let st = await ledgerState();
  check(st.goldVisible && st.noHScroll, `${where}: gold visible at the top, no horizontal scroll`);
  for (const f of [0.5, 1]) {
    await ev(f => { const s = document.querySelector("#port .sheet"); s.scrollTop = (s.scrollHeight - s.clientHeight) * f; }, f);
    await page.waitForTimeout(80);
    st = await ledgerState();
    check(st.max > 0 && st.goldVisible && st.noHScroll && st.hdrH < st.vh * 0.3 && st.btnBehind === 0, `${where}: scrolled to ${f * 100}% (${st.top}/${st.max}) the gold is still in view; bar ${st.hdrH}px of ${st.vh}px; ${st.btnBehind} buttons covered`);
  }
  if (pct === 100 && w === 390) await page.screenshot({ path: `${out}/ledger-mobile-scrolled.png` });
  if (pct === 100 && w === 1280) await page.screenshot({ path: `${out}/ledger-desktop-scrolled.png` });
}
await page.setViewportSize({ width: 390, height: 844 });
await boot(saveWith({ gold: 5000 }));
await ev(() => { document.querySelector("#port .sheet").scrollTop = 600; });
const before = await ev(() => document.getElementById("pGold").textContent);
await ev(() => { save.gold -= 400; renderPort(); });
await page.waitForTimeout(60);
const mid = await ev(() => ({ txt: document.getElementById("pGold").textContent, cls: document.getElementById("pGold").className }));
await page.waitForTimeout(600);
const after = await ev(() => ({ txt: document.getElementById("pGold").textContent, cls: document.getElementById("pGold").className }));
check(before === "5,000" && after.txt === "4,600" && /spent/.test(mid.cls), `spending 400 rolls the purse ${before} -> ${mid.txt} -> ${after.txt} and flashes (${mid.cls})`);
await ev(() => { save.gold += 700; renderPort(); }); await page.waitForTimeout(60);
check(await ev(() => document.getElementById("pGold").classList.contains("gained")), "earning gold flashes green");
for (const kind of ["supply", "trade", "outpost"]) {
  await ev(k => { setSail(); }, kind); await page.waitForFunction(() => !docked, null, { timeout: 8000 * SLOW });
  await ev(k => { dock(k); }, kind); await page.waitForFunction(() => docked, null, { timeout: 8000 * SLOW });
  await ev(() => { document.querySelector("#port .sheet").scrollTop = 99999; }); await page.waitForTimeout(80);
  const st = await ledgerState();
  check(st.goldVisible && st.noHScroll, `${kind}: the ledger's gold is in view (scroll ${st.top}/${st.max})`);
  if (kind === "supply") await page.screenshot({ path: `${out}/ledger-supply-mobile.png` });
}
await page.setViewportSize({ width: 1280, height: 720 });

// ---------- #68: gun bay, tap the source then the destination, Undo, Upgrade x5 ----------
console.log("#68 gun bay");
await boot(saveWith({ gold: 50000 }));
const bayState = () => ev(() => ({ bow: save.bow.map(x => x && x.g + x.lv).join(","), left: save.left.map(x => x && x.g + x.lv).join(","), right: save.right.map(x => x && x.g + x.lv).join(","), store: save.store.map(x => x.g + x.lv).join(","),
  sel: deckSel && deckSel.side + deckSel.i, gold: save.gold, note: (document.querySelector("#gunSel .gnote") || {}).textContent || "", acts: [...document.querySelectorAll("#gunSel [data-act]")].map(b => b.dataset.act + (b.disabled ? "!" : "")).join(" ") }));
await ev(() => { save.bow = [gunItem("six", 1)]; save.left = [gunItem("long12", 3)]; save.right = [null]; save.store = [gunItem("chain", 1)]; deckSel = null; gunNote = null; renderPort(); });
const S1 = (side, i) => `#deck [data-act="slot"][data-side="${side}"][data-i="${i}"]`;
await page.locator(S1("bow", 0)).scrollIntoViewIfNeeded();
await tap('[data-act="buy"][data-id="carronade"]'); await page.waitForTimeout(100);
let g68 = await bayState();
check(/store/.test(g68.sel || "") && g68.store.includes("carronade"), `a gun bought in the armory lands in the store already picked (${g68.sel})`);
await tap(S1("right", 0));
g68 = await bayState();
check(g68.right === "carronade1" && g68.sel === null && /Mounted/.test(g68.note), `then one tap on the empty port mounts it (${g68.right}); the line says "${g68.note}"`);
check(!g68.acts.includes("swap") && g68.acts.includes("gundo") && !(await ev(() => !!document.querySelector('[data-act="swap"]'))), "there is no Swap position button anywhere; Undo is offered");
await page.screenshot({ path: `${out}/gunbay-mounted-desktop.png` });
await tap('#gunSel [data-act="gundo"]');
g68 = await bayState();
check(g68.right === "null" || g68.right === "" || g68.right === "0" || !g68.right.includes("carronade"), "Undo takes the mounted gun back out");
check(g68.store.includes("carronade") && g68.store.includes("chain"), `and it is back in the store (${g68.store})`);
await tap(S1("bow", 0)); await tap(S1("left", 0));
g68 = await bayState();
check(g68.bow === "long123" && g68.left === "six1" && /Swapped/.test(g68.note), `a port tapped, then another: swapped at once (${g68.bow} / ${g68.left})`);
await tap('#gunSel [data-act="gundo"]');
g68 = await bayState();
check(g68.bow === "six1" && g68.left === "long123", "Undo puts the two guns back; it only ever undoes one step");
await tap(S1("bow", 0)); await tap('#bay [data-act="store"][data-i="0"]');
g68 = await bayState();
check(g68.bow.startsWith("carronade") || g68.bow.startsWith("chain"), `a port, then a stored gun: they trade places (${g68.bow}; store ${g68.store})`);
await tap('#gunSel [data-act="gundo"]');
// pad / Esc / blank cancel
await tap(S1("bow", 0));
await ev(() => goBack());   // the pad's back button and Esc both come here (js/menu.js)
check((await bayState()).sel === null, "the pad's back button (goBack) puts the picked gun down");
await tap(S1("bow", 0)); await page.keyboard.press("Escape");
check((await bayState()).sel === null, "Esc puts it down");
// unload; a full store refuses and never drops a gun
await tap(S1("bow", 0)); await tap('#gunSel [data-act="unload"]');
g68 = await bayState();
check(g68.bow === "" || g68.bow === "null" || !g68.bow.includes("six"), "Unload moves the gun out of the port") ;
check(g68.store.includes("six1") && /Unloaded/.test(g68.note), `into the store, with the line "${g68.note}"`);
await tap('#gunSel [data-act="gundo"]');
await ev(() => { save.store = Array.from({ length: MAX_STORE }, () => gunItem("six", 1)); renderPort(); });
await tap(S1("left", 0));
g68 = await bayState();
check(g68.acts.includes("unload!") && /full/.test(await ev(() => document.querySelector("#gunSel .hint-s").textContent)), "a full store: Unload is disabled and the card says why");
await ev(() => { save.store = [gunItem("chain", 1)]; deckSel = null; renderPort(); });
// Upgrade x5
await tap(S1("bow", 0));
const up = await ev(() => { const gun = save.bow[0], plan = gunUpPlan(gun, save.gold), b = document.querySelector('#gunSel [data-act="gup5"]'); let sum = 0; for (let j = 0; j < 5; j++) sum += gunUpCost({ ...gun, lv: gun.lv + j }); return { label: b.textContent, sum, plan, gold: save.gold, dis: b.disabled }; });
check(up.plan.n === 5 && up.plan.cost === up.sum && !up.dis && up.label.includes(up.sum.toLocaleString("en-US")), `Upgrade x5 shows the five levels' total (${up.label})`);
await tap('#gunSel [data-act="gup5"]');
g68 = await bayState();
check(g68.bow === "six6" && g68.gold === up.gold - up.sum, `buying it: Lv 1 -> 6 for exactly ${up.sum} gold`);
const near = await ev(() => { save.bow[0] = gunItem("six", GUN_MAX - 2); renderPort(); return document.querySelector('#gunSel [data-act="gup5"]').textContent; });
check(/Upgrade 2 levels/.test(near), `two levels from the cap it says so (${near})`);
const poor = await ev(() => { save.bow[0] = gunItem("six", 3); save.gold = 10; renderPort(); const b = document.querySelector('#gunSel [data-act="gup5"]'); return { t: b.textContent, d: b.disabled }; });
check(poor.d && /short/.test(poor.t), `without the gold it is disabled and shows the shortfall (${poor.t})`);
await tap('#gunSel [data-act="gup5"]').catch(() => {});
check((await bayState()).bow === "six3", "pressing it anyway buys nothing: no partial upgrade");
await page.screenshot({ path: `${out}/gunbay-upgrade5-desktop.png` });
await ev(() => { lang = "zh"; applyLang(); save.gold = 50000; renderPort(); });
const zhUp = await ev(() => document.querySelector('#gunSel [data-act="gup5"]').textContent + "|" + document.querySelector('#gunSel [data-act="unload"]').textContent);
check(/^升級 5 級（總價 [\d,]+ 金幣）\|卸下$/.test(zhUp), `Chinese: ${zhUp}`);
await ev(() => { lang = "en"; applyLang(); });

// touch on a phone, and the compact 30-gun deck
{
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "en-US" });
  const mp = await mctx.newPage(); mp.on("pageerror", e => errors.push("pageerror(touch): " + e.message));
  await mp.goto(url, { waitUntil: "load" });
  await mp.evaluate(s => { localStorage.clear(); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); localStorage.setItem("privateers-save-v2", JSON.stringify(s)); }, saveWith({ gold: 99999, ship: "line", hull: 3 }));
  await mp.reload({ waitUntil: "load" });
  await mp.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await mp.evaluate(() => {
    save = fitMounts({ ...save, ship: "line", gold: 99999 });
    const kinds = ["six", "long12", "carronade", "chain", "fire"];
    for (const { key } of MOUNTS) save[key] = save[key].map((_, i) => (i % 5 === 4 ? null : gunItem(kinds[i % 5], 1 + (i % 4))));
    save.store = [gunItem("six", 2)];
    applyPlayerStats(true); titleOpen = false; const ti = document.getElementById("title"); if (ti) ti.hidden = true;
    paused = true; dock("welcome"); document.getElementById("port").hidden = false;
  });
  await mp.waitForTimeout(700 * SLOW);
  const ports = await mp.evaluate(() => ({ n: document.querySelectorAll("#deck .slot").length, minH: Math.round(Math.min(...[...document.querySelectorAll("#deck .slot")].map(b => b.getBoundingClientRect().height))), dense: document.getElementById("deck").classList.contains("dense") }));
  check(ports.n === 30 && ports.dense && ports.minH >= 30, `phone, 30 guns: compact deck, every port at least 30px tall (${ports.minH}px)`);
  const L = i => `#deck [data-act="slot"][data-side="left"][data-i="${i}"]`;
  const lg = () => mp.evaluate(() => save.left.slice(0, 4).map(x => x && x.g + x.lv).join(","));
  const before = await lg();
  await mp.locator(L(0)).scrollIntoViewIfNeeded(); await mp.tap(L(0));
  await mp.screenshot({ path: `${out}/gunbay-picked-30guns-phone.png` });
  await mp.locator(L(1)).scrollIntoViewIfNeeded(); await mp.tap(L(1));
  const after = await lg();
  check(before !== after && after.split(",")[0] === before.split(",")[1] && after.split(",")[1] === before.split(",")[0], `touch: tap a port, tap another: swapped (${before} -> ${after})`);
  await mp.screenshot({ path: `${out}/gunbay-swapped-30guns-phone.png` });
  await mp.tap('#gunSel [data-act="gundo"]');
  check(await lg() === before, "touch: Undo");
  // a tap on a stored gun and the empty fifth port of a side mounts it
  await mp.locator('#bay [data-act="store"]').first().scrollIntoViewIfNeeded(); await mp.tap('#bay [data-act="store"]');
  await mp.locator(L(4)).scrollIntoViewIfNeeded(); await mp.tap(L(4));
  check(await mp.evaluate(() => save.left[4] && save.left[4].g === "six" && save.store.length === 0), "touch: stored gun, then an empty port: mounted");
  const sticky = await mp.evaluate(() => { const c = document.querySelector("#gunSel"); const r = c.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight, h: Math.round(r.height) }; });
  check(sticky.bottom <= sticky.vh, `the status line stays on screen (${JSON.stringify(sticky)})`);
  await mctx.close();
}

// ---- END OF SECTIONS ----
check(errors.length === 0, `0 page errors${errors.length ? " -> " + errors.join(" | ") : ""}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n- ` + fails.join("\n- ") : "\nAll feedback checks passed");
process.exit(fails.length || errors.length ? 1 : 0);
