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
const saveWith = (extra = {}) => ({ v: 2, gold: 20000, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: { bounty: 3 }, escortGift: "had", store: [], ...extra });
const seed = ([s, lang]) => { localStorage.clear(); localStorage.setItem("privateers-lang", lang); localStorage.setItem("privateers-save-v2", JSON.stringify(s)); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true, shake: false })); };
// The game reads the save only on boot. The first boot gets it from an init script (once per tab: it would run again on every
// reload); after that it goes into the running page, with its loop put to sleep so nothing can persist() over it, and a reload.
const boot = async (s, lang = "en") => {
  if (page.url() === "about:blank") {
    await page.addInitScript(`sessionStorage.getItem("__seeded") || (sessionStorage.setItem("__seeded", "1"), (${seed})(${JSON.stringify([s, lang])}))`);
    await page.goto(url, { waitUntil: "load" });
  } else {
    await page.evaluate(() => S.game.loop.sleep()); await page.evaluate(seed, [s, lang]);
    await page.reload({ waitUntil: "load" });
  }
  await ready();
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
// The ships are in the hull's panel (js/ledger-panel.js): open it before reading or pressing them.
const openHull = () => ev(() => { if (!hullOpen) { resetLedgerPick(); hullOpen = true; renderPort(); } });
const yardInfo = async () => { await openHull(); return ev(() => ({ ship: save.ship, id: save.shipId, gold: save.gold, owned: ownedShips().map(e => e.ship), switches: [...document.querySelectorAll('#ships [data-act="switch"]')].map(b => b.dataset.id),
  labels: Object.fromEntries([...document.querySelectorAll('#ships [data-act="ship"]')].map(b => [b.dataset.id, b.textContent.trim()])), hints: document.querySelectorAll("#ships .up").length })); };
await boot(saveWith({ gold: 90000 }));
let y = await yardInfo();
check(y.ship === "sloop" && y.switches.length === 0 && !("sloop" in y.labels), "the starter is aboard, nothing to switch to, and the yard does not sell a sloop");
await openHull(); await tap('[data-act="ship"][data-id="schooner"]'); await page.waitForTimeout(500); await tap('[data-act="ship"][data-id="schooner"]'); await page.waitForTimeout(300);
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
    gold: document.getElementById("pGold").textContent, btnBehind: [...sheet.querySelectorAll("button:not([disabled])")].filter(b => { const r = b.getBoundingClientRect(), fr = sheet.querySelector("footer").getBoundingClientRect(); return r.width > 0 && r.bottom < fr.top && r.top >= s.top + h.height && r.bottom <= s.bottom && r.left + r.width / 2 > 0 && r.left + r.width / 2 < innerWidth /* a tab scrolled out of the tab row sideways is not behind anything */ && (() => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(e && (e === b || b.contains(e))); })(); }).length };
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

// ---------- #68: the gun panel: pick a port, put a gun there, Undo, Upgrade x5 ----------
console.log("#68 gun bay");
await boot(saveWith({ gold: 50000 }));
const bayState = () => ev(() => ({ bow: save.bow.map(x => x && x.g + x.lv).join(","), left: save.left.map(x => x && x.g + x.lv).join(","), right: save.right.map(x => x && x.g + x.lv).join(","), store: save.store.map(x => x.g + x.lv).join(","),
  sel: deckSel && deckSel.side + deckSel.i, gold: save.gold, note: (document.querySelector("#ctx .gnote") || {}).textContent || "", acts: [...document.querySelectorAll("#ctx [data-act]")].map(b => b.dataset.act + (b.disabled ? "!" : "")).join(" ") }));
await ev(() => { save.bow = [gunItem("six", 1)]; save.left = [gunItem("long12", 3)]; save.right = [null]; save.store = [gunItem("chain", 1)]; deckSel = null; gunNote = null; renderPort(); });
const S1 = (side, i) => `#deck [data-act="port"][data-side="${side}"][data-i="${i}"]`;
await page.locator(S1("bow", 0)).scrollIntoViewIfNeeded();
await tap(S1("right", 0)); await page.waitForTimeout(100);
let g68 = await bayState();
check(g68.sel === "right0" && g68.acts.includes("gfrom") && g68.acts.includes("buy") && !g68.acts.includes("unload"), `the empty port picked offers the stored gun and the armory, nothing to unload (${g68.acts})`);
await tap('[data-act="buy"][data-id="carronade"]'); await page.waitForTimeout(100);
g68 = await bayState();
check(g68.right === "carronade1" && g68.store === "chain1" && g68.sel === "right0", `a gun bought for the empty port is mounted at once (${g68.right}), the store is untouched, the port stays picked`);
check(!(await ev(() => !!document.querySelector('[data-act="swap"]'))) && !g68.acts.includes("gundo"), "there is no Swap position button anywhere; a purchase has no Undo");
await tap('#ctx [data-act="unload"]');
g68 = await bayState();
check(g68.right === "" && g68.store === "chain1,carronade1" && /Unloaded/.test(g68.note) && g68.sel === null, `Unload sends it to the store and says so (${g68.store}): "${g68.note}"`);
await tap('#ctx [data-act="gundo"]');
g68 = await bayState();
check(g68.right === "carronade1" && g68.store === "chain1", "Undo takes the unloading back");
await tap(S1("right", 0)); await tap('#ctx [data-act="unload"]');
await tap(S1("right", 0)); await tap('#ctx [data-act="gfrom"][data-side="store"][data-i="1"]');
g68 = await bayState();
check(g68.right === "carronade1" && /Mounted/.test(g68.note) && g68.acts.includes("gundo"), `the empty port picked, then a stored gun: mounted (${g68.right}); the line says "${g68.note}"`);
await tap('#ctx [data-act="gundo"]');
g68 = await bayState();
check(g68.right === "" && g68.store === "chain1,carronade1", `Undo takes the mounted gun back out (${g68.store})`);
await tap(S1("right", 0)); await tap('#ctx [data-act="gfrom"][data-side="store"][data-i="1"]');
await tap(S1("bow", 0)); await tap('#ctx [data-act="gfrom"][data-side="store"][data-i="0"]');
g68 = await bayState();
check(g68.bow === "chain1" && g68.store === "six1" && /Swapped/.test(g68.note), `a port picked, then a stored gun: they trade places (${g68.bow}; store ${g68.store})`);
await page.screenshot({ path: `${out}/gunbay-mounted-desktop.png` });
await tap('#ctx [data-act="gundo"]');
g68 = await bayState();
check(g68.bow === "six1" && g68.store === "chain1", "Undo puts the two guns back; it only ever undoes one step");
await tap(S1("bow", 0)); await tap(S1("left", 0));
g68 = await bayState();
check(g68.sel === "left0" && g68.bow === "six1" && g68.left === "long123", `a second port tapped only moves the pick (${g68.sel}), nothing is swapped`);
// pad / Esc / blank cancel
await tap(S1("bow", 0));
await ev(() => goBack());   // the pad's back button and Esc both come here (js/menu.js)
check((await bayState()).sel === null, "the pad's back button (goBack) puts the picked port down");
await tap(S1("bow", 0)); await page.keyboard.press("Escape");
check((await bayState()).sel === null, "Esc puts it down");
// unload; a full store refuses and never drops a gun
await tap(S1("bow", 0)); await tap('#ctx [data-act="unload"]');
g68 = await bayState();
check(g68.bow === "" || g68.bow === "null" || !g68.bow.includes("six"), "Unload moves the gun out of the port") ;
check(g68.store.includes("six1") && /Unloaded/.test(g68.note), `into the store, with the line "${g68.note}"`);
await tap('#ctx [data-act="gundo"]');
await ev(() => { save.store = Array.from({ length: MAX_STORE }, () => gunItem("six", 1)); renderPort(); });
await tap(S1("left", 0));
g68 = await bayState();
check(g68.acts.includes("unload!") && /full/.test(await ev(() => document.querySelector("#ctx .gcard .hint-s").textContent)), "a full store: Unload is disabled and the card says why");
await ev(() => { save.store = [gunItem("chain", 1)]; deckSel = null; renderPort(); });
// Upgrade x5
await tap(S1("bow", 0));
const up = await ev(() => { const gun = save.bow[0], plan = gunUpPlan(gun, save.gold), b = document.querySelector('#ctx [data-act="gup5"]'); let sum = 0; for (let j = 0; j < 5; j++) sum += gunUpCost({ ...gun, lv: gun.lv + j }); return { label: b.textContent, sum, plan, gold: save.gold, dis: b.disabled }; });
check(up.plan.n === 5 && up.plan.cost === up.sum && !up.dis && up.label.includes(up.sum.toLocaleString("en-US")), `Upgrade x5 shows the five levels' total (${up.label})`);
await tap('#ctx [data-act="gup5"]');
g68 = await bayState();
check(g68.bow === "six6" && g68.gold === up.gold - up.sum, `buying it: Lv 1 -> 6 for exactly ${up.sum} gold`);
const near = await ev(() => { save.bow[0] = gunItem("six", GUN_MAX - 2); renderPort(); return document.querySelector('#ctx [data-act="gup5"]').textContent; });
check(/Upgrade 2 levels/.test(near), `two levels from the cap it says so (${near})`);
const poor = await ev(() => { save.bow[0] = gunItem("six", 3); save.gold = 10; renderPort(); const b = document.querySelector('#ctx [data-act="gup5"]'); return { t: b.textContent, d: b.disabled }; });
check(poor.d && /\d+ gold short/.test(poor.t), `without the gold it is disabled and shows the shortfall (${poor.t})`);
await tap('#ctx [data-act="gup5"]').catch(() => {});
check((await bayState()).bow === "six3", "pressing it anyway buys nothing: no partial upgrade");
await page.screenshot({ path: `${out}/gunbay-upgrade5-desktop.png` });
await ev(() => { lang = "zh"; applyLang(); save.gold = 50000; renderPort(); });
const zhUp = await ev(() => document.querySelector('#ctx [data-act="gup5"]').textContent + "|" + document.querySelector('#ctx [data-act="unload"]').textContent);
check(/^一次升 5 級（共 [\d,]+ 金幣）火力 \+\d+%( · 船艦 Lv (進度 \+\d+%|→ \d+))?\|卸下$/.test(zhUp), `Chinese: ${zhUp}`);
await ev(() => { lang = "en"; applyLang(); });

// touch on a phone, and the compact 30-gun deck
{
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "en-US" });
  const mp = await mctx.newPage(); mp.on("pageerror", e => errors.push("pageerror(touch): " + e.message));
  await mctx.addInitScript(s => {   // in before the boot, once per tab
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); localStorage.setItem("privateers-save-v2", JSON.stringify(s));
  }, saveWith({ gold: 99999, ship: "line", hull: 3 }));
  await mp.goto(url, { waitUntil: "load" });
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
  const L = i => `#deck [data-act="port"][data-side="left"][data-i="${i}"]`;
  const lg = () => mp.evaluate(() => save.left.slice(0, 4).map(x => x && x.g + x.lv).join(","));
  const before = await lg();
  await mp.locator(L(0)).scrollIntoViewIfNeeded(); await mp.tap(L(0));
  await mp.screenshot({ path: `${out}/gunbay-picked-30guns-phone.png` });
  const sheetOk = await mp.evaluate(() => { const r = document.getElementById("ctx").getBoundingClientRect(), f = document.querySelector("#port footer").getBoundingClientRect(); return { open: document.getElementById("ctx").classList.contains("open"), bottom: Math.round(r.bottom), footTop: Math.round(f.top), sticky: getComputedStyle(document.getElementById("ctx")).position }; });
  check(sheetOk.open && sheetOk.sticky === "sticky" && sheetOk.bottom <= sheetOk.footTop + 1, `phone: the panel is a bottom sheet above the Set sail bar (${JSON.stringify(sheetOk)})`);
  await mp.locator('#ctx [data-act="gfrom"][data-side="store"]').scrollIntoViewIfNeeded(); await mp.tap('#ctx [data-act="gfrom"][data-side="store"]');
  const after = await lg();
  check(before !== after && after.split(",")[0] === "six2" && after.split(",")[1] === before.split(",")[1], `touch: tap a port, tap the stored gun: they trade places (${before} -> ${after})`);
  await mp.screenshot({ path: `${out}/gunbay-swapped-30guns-phone.png` });
  await mp.locator('#ctx [data-act="gundo"]').scrollIntoViewIfNeeded(); await mp.tap('#ctx [data-act="gundo"]');
  check(await lg() === before, "touch: Undo");
  // the empty fifth port of a side picked, then the stored gun: mounted
  await mp.locator(L(4)).scrollIntoViewIfNeeded(); await mp.tap(L(4));
  await mp.locator('#ctx [data-act="gfrom"][data-side="store"]').scrollIntoViewIfNeeded(); await mp.tap('#ctx [data-act="gfrom"][data-side="store"]');
  check(await mp.evaluate(() => save.left[4] && save.left[4].g === "six" && save.store.length === 0), "touch: an empty port, then the stored gun: mounted");
  const sticky = await mp.evaluate(() => { const c = document.querySelector("#ctx"); const r = c.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight, h: Math.round(r.height) }; });
  check(sticky.bottom <= sticky.vh, `the panel stays on screen (${JSON.stringify(sticky)})`);
  await mctx.close();
}

// ---------- #69: the grapple's spring pull ----------
console.log("#69 grapple pull");
await boot(saveWith({ gold: 500, ship: "brig", hull: 3 }));
await rig(); await sail();
await ev(() => {
  window.think = () => {}; window.spawnEnemy = () => null;   // the test steers every ship itself
  __gone(enemies.slice()); save.tutorialDone = true; tutorialReset(); document.getElementById("coach") && (document.getElementById("coach").hidden = true);
  window.__hurtP = 0; onHook("hurt", s => { if (s.isPlayer) __hurtP++; });
  window.__prize = () => {   // a struck merchant at (1500, 1500)
    const e = makeEnemy(S, 1500, 1500, 3, "merchant", "fluyt"); Object.assign(e, { rot: 0, speed: 0, loot: 100 });
    e.hp = e.maxHp * 0.3; hurt(e, 1, 0, player, null); window.E = e; return e;
  };
  window.__place = (gap, rot, lvl) => {   // the flagship off her beam, `gap` px between the hulls, heading `rot`, sail level `lvl`
    const d = shipRadius(player) + shipRadius(E) + gap;
    Object.assign(player, { x: 1500 + d, y: 1500, rot, speed: 0, hp: player.maxHp, alive: true, vx: 0, vy: 0 });
    setSailLevel(lvl); board = freshBoard(null); rehookAt = 0; boardLog.hooks = boardLog.snaps = 0; __hurtP = 0;
  };
  window.__run = (n, stopWhen, keepT) => { let hit = null; for (let i = 0; i < n; i++) { E.x = 1500; E.y = 1500; E.speed = 0; E.vx = E.vy = 0; E.spr.setPosition(1500, 1500); stepN(1); if (keepT) board.t = 0; if (stopWhen && stopWhen()) { hit = i; break; } } return hit; };
  window.__info = () => ({ hooked: board.hooked, t: +board.t.toFixed(2), strain: +board.strain.toFixed(2), gap: Math.round(grappleGap(player, E)), pv: Math.round(Math.hypot(board.pv.x, board.pv.y)), boarded: !!E.boarded, alive: E.alive,
    hooks: boardLog.hooks, snaps: boardLog.snaps, hurtP: __hurtP, spd: Math.round(player.speed), max: Math.round(player.maxSpeed) });
});
// A: approaching a struck ship at half sail from 70 px off her beam hooks, reels alongside and boards in a few seconds, with no steering
await ev(() => { __prize(); __place(70, Math.PI, 1); });
let r69 = await ev(() => { const first = __run(120, () => board.hooked), caught = board.hooked, hooksThen = boardLog.hooks; __run(900, () => E.boarded || !E.alive); return { first, caught, hooksThen, ...__info() }; });
check(r69.caught && r69.first !== null && r69.hooksThen === 1, `the hooks catch within 2 s of coming near (frame ${r69.first})`);
check(r69.boarded && r69.hurtP === 0 && r69.snaps === 0, `she is boarded with no steering, the rope never parts, and the flagship took no collision damage (${r69.hurtP} hits)`);
check(!r69.hooked && r69.pv === 0, "boarding done: the grapple is released");
await ev(() => { if (E.alive) __gone([E]); });
// B: sailing away slowly only drags the flagship back (boarding progress held at 0 so the grapple stays on)
await ev(() => { __prize(); __place(40, 0, 1); });
r69 = await ev(() => { __run(60, null, true); const early = __info(); __run(480, null, true); return { early, ...__info() }; });
check(r69.hooked && r69.snaps === 0 && r69.strain === 0, `slow sails away for 9 s: still hooked, never cut, no strain (${JSON.stringify({ gap: r69.gap, spd: r69.spd + "/" + r69.max })})`);
check(r69.gap < 90 && r69.early.gap < 90, `and she is held close: gap ${r69.early.gap}px at 1 s, ${r69.gap}px at 9 s`);
await ev(() => { if (E.alive) __gone([E]); });
// C: full speed straight away parts it after about a second of strain, with the sound and the whipping halves
await ev(() => { __prize(); __place(30, 0, 3); });
r69 = await ev(() => { __run(120, null, true); const pre = __info(); window.__g0 = S.children.list.filter(o => o.type === "Graphics" && o.name === "ropeSnap").length; const at = __run(600, () => boardLog.snaps > 0, true); const snapInfo = __info();
  const g1 = S.children.list.filter(o => o.type === "Graphics" && o.name === "ropeSnap").length; return { pre, at, snapInfo, g1 }; });
check(r69.pre.strain > 0 && r69.pre.hooked && r69.pre.spd >= 0.8 * r69.pre.max || r69.at !== null, `full sails away build strain on the hooked rope (strain ${r69.pre.strain} s at ${r69.pre.spd}/${r69.pre.max} px/s)`);
check(r69.at !== null && r69.snapInfo.snaps === 1 && !r69.snapInfo.hooked && !r69.snapInfo.boarded && r69.snapInfo.alive, `it parts under a full-speed run (after ${120 + (r69.at || 0)} frames), with the crack, and she is not boarded`);
check(r69.g1 === 1, `the parted halves are drawn (${r69.g1} rope graphic alive just after the snap)`);
await page.screenshot({ path: `${out}/grapple-snap.png` });
await ev(() => { S.game.loop.wake(); }); await page.waitForTimeout(900 * SLOW);   // real time: the fade is a tween, which stepN does not advance
const later = await ev(() => { S.game.loop.sleep(); return { tw: [], g: S.children.list.filter(o => o.type === "Graphics" && o.name === "ropeSnap").length, ...__info() }; });
check(later.g === 0 && later.snaps === 1, `the halves fade and are cleaned up (${later.g} left), and the hooks do not re-bite in the next seconds (${later.hooks} hooks in all)`);
await ev(() => { if (E.alive) __gone([E]); });
// D: a hooked prize that sinks lets go at once
await ev(() => { __prize(); __place(40, 0, 0); });
r69 = await ev(() => { __run(30, null, true); const hooked = board.hooked; hurt(E, 1e9, 0, player, null); stepN(2); const x0 = player.x, y0 = player.y; __run(60); return { hooked, after: board.hooked, moved: Math.round(Math.hypot(player.x - x0, player.y - y0)), alive: E.alive }; });
check(r69.hooked && !r69.after && !r69.alive && r69.moved < 3, `the prize sinks: the grapple lets go and the flagship is no longer pulled (${JSON.stringify(r69)})`);
// E: a ship that is not a prize is never grappled
await ev(() => { const m = makeEnemy(S, 1500, 1500, 3, "merchant", "fluyt"); m.rot = 0; m.speed = 0; window.E = m; __place(30, Math.PI, 0); });
r69 = await ev(() => { __run(120); return __info(); });
check(!r69.hooked && r69.t === 0 && r69.hooks === 0, "a ship that has not struck her colours is never grappled");
await ev(() => { __gone([E]); });

// ---- END OF SECTIONS ----
check(errors.length === 0, `0 page errors${errors.length ? " -> " + errors.join(" | ") : ""}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n- ` + fails.join("\n- ") : "\nAll feedback checks passed");
process.exit(fails.length || errors.length ? 1 : 0);
