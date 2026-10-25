// Polish checks: ledger focus with pad and keyboard, the two-column ledger, notice discipline (sea banner, bounty toast,
// toasts while docked), damage-number merging, hit markers, text size on world labels, off-screen aim, boss liveries,
// the poster's recommended level, no bounty on the first voyage. Screenshots at 1280x720, 1920x1080 and 390x844.
// Usage: node tests/polish.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
// CI runners render without a GPU (~10 fps, game time runs at half speed): TEST_SLOW stretches every wait.
const SLOW = +process.env.TEST_SLOW || 1;

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/polish";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [], results = [];
const ok = (name, pass, info) => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const D = { width: 1280, height: 720 }, HD = { width: 1920, height: 1080 }, M = { width: 390, height: 844 };

async function open(viewport, { mobile = false, lang = "en", tag = "", save = null } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[${tag}] pageerror: ${e.message} ${(e.stack || "").split("\n").slice(1, 4).join(" | ")}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.evaluate(([l, s]) => { localStorage.clear(); localStorage.setItem("privateers-lang", l); if (s) localStorage.setItem("privateers-save-v2", s); }, [lang, save]);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(300 * SLOW);
  return { ctx, page };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const toLedger = async page => { await page.click("[data-smoke=start]"); await page.evaluate(() => { if (!docked) { tutorialReset(); dock("welcome"); } }); await page.waitForFunction(() => docked); await page.waitForTimeout(450 * SLOW); };
const padStub = page => ev(page, () => {
  const pad = { id: "Stub pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  Object.defineProperty(pad, "timestamp", { get: () => performance.now() });
  window.__pad = pad;
  window.__btn = (i, v) => { pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v }; };
  navigator.getGamepads = () => [pad, null, null, null];
  const e = new Event("gamepadconnected"); e.gamepad = pad; window.dispatchEvent(e);
});
const tapper = page => async i => { await ev(page, j => __btn(j, 1), i); await page.waitForTimeout(110 * SLOW); await ev(page, j => __btn(j, 0), i); await page.waitForTimeout(110 * SLOW); };
const desc = () => { const a = document.activeElement; return a === document.body ? "BODY" : a.id ? "#" + a.id : `${a.dataset.act || a.dataset.camp || a.className}:${a.dataset.id || a.dataset.k || a.dataset.i || ""}`; };
// every control in the sheet that can be pressed, and a walk of the nav graph from the first one
const navGraph = page => ev(page, () => {
  const name = a => a.id ? "#" + a.id : `${a.dataset.act || a.dataset.camp || a.className}:${a.dataset.id || a.dataset.k || a.dataset.side || ""}${a.dataset.i ?? ""}`;
  const all = ledgerControls(), shop = all.filter(el => !el.closest("footer"));
  sheetEl.focus(); moveFocus(sheetEl, 0, 1);
  const first = document.activeElement, seen = new Set([first]), todo = [first];
  while (todo.length) {
    const el = todo.pop();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      el.focus({ preventScroll: true }); moveFocus(sheetEl, dx, dy);
      const to = document.activeElement;
      if (to && !seen.has(to) && all.includes(to)) { seen.add(to); todo.push(to); }
    }
  }
  // down only, from the top of the sheet: the shop lists before the footer
  sheetEl.scrollTop = 0; sheetEl.focus(); moveFocus(sheetEl, 0, 1);
  const downs = [name(document.activeElement)];
  for (let i = 0; i < 60 && document.activeElement.id !== "sail"; i++) { moveFocus(sheetEl, 0, 1); downs.push(name(document.activeElement)); }
  const listCtl = shop.filter(el => el.closest("#tabs, #deck, #ctx"));
  sheetEl.scrollTop = 0; sheetEl.focus();
  return { total: all.length, missed: all.filter(el => !seen.has(el)).map(name), first: name(first), downs, listMissedByDown: listCtl.map(name).filter(n => !downs.includes(n)),
    footerOnlyAtEnd: downs.findIndex(n => n.startsWith("#sail") || /textbtn|lang/.test(n)) === downs.length - 1 };
});

// ---------- 1 + 2. ledger: pad and keyboard reach every control, focus survives purchases; layout per screen ----------
for (const [vp, tag, mobile] of [[D, "720", false], [HD, "1080", false], [M, "phone", true]]) {
  const { ctx, page } = await open(vp, { mobile, tag: "ledger-" + tag });
  await toLedger(page);
  await ev(page, () => { save.gold = 5000; renderPort(); hud(true); });
  const lay = await ev(page, () => {
    const sh = sheetEl.getBoundingClientRect(), l = document.querySelector(".lcol-l"), r = document.querySelector(".lcol-r");
    const deck = document.getElementById("deck").getBoundingClientRect(), stats = document.getElementById("pStats").getBoundingClientRect();
    return { two: getComputedStyle(r).display !== "contents", deckTop: Math.round(deck.top - sh.top), sheetH: Math.round(sh.height), sideBySide: deck.left > stats.right,
      w: Math.round(sh.width), scroll: sheetEl.scrollHeight > sheetEl.clientHeight };
  });
  if (vp === M) ok(`${tag}: phone keeps the one-column ledger`, !lay.two && !lay.sideBySide, lay);
  else ok(`${tag}: two columns, the gun deck starts in the first screen beside the poster`, lay.two && lay.sideBySide && lay.deckTop < lay.sheetH * 0.4, lay);
  await page.screenshot({ path: join(out, `ledger-${tag}-en.png`) });
  const g = await navGraph(page);
  ok(`${tag}: D-pad / arrows reach every ledger control (${g.total}); going down walks every shop list before the footer`, !g.missed.length && !g.listMissedByDown.length && g.footerOnlyAtEnd, g);
  if (vp === D) {
    // the real pad: a D-pad press on the bare sheet lands in the shop, Y goes to Set sail, RB jumps a section, A buys
    await padStub(page);
    const tap = tapper(page);
    await ev(page, () => sheetEl.focus());
    await tap(13);
    const p1 = await ev(page, desc);
    await tap(3);
    const p2 = await ev(page, desc);
    await tap(12);
    const p3 = await ev(page, desc);
    await ev(page, () => { deckSel = { side: "bow", i: 0 }; renderPort(); document.querySelector('#deck [data-act="port"]').focus(); });   // a port picked: its panel has controls to jump to
    await tap(5);
    const p4 = await ev(page, () => document.activeElement.closest("#ctx") ? "ctx" : document.activeElement.tagName);   // the panel sits between the gun deck and the Gear page (#38)
    await tap(5);
    const p5 = await ev(page, () => document.activeElement.closest("#gear") ? "gear" : document.activeElement.tagName);
    ok("pad: D-pad from the sheet enters the shop, Y = Set sail, up leaves the footer, RB jumps Gun deck > panel > Gear",
      !p1.startsWith("#sail") && p1 !== "BODY" && p2 === "#sail" && p3 !== "#sail" && p3 !== "BODY" && !/textbtn|lang/.test(p3) && p4 === "ctx" && p5 === "gear", { p1, p2, p3, p4, p5 });
    await ev(page, () => { deckSel = null; hullOpen = true; renderPort(); document.querySelector('#yard [data-k="hull"]').focus(); });   // the hull picked: its rows are in the panel
    const g0 = await ev(page, () => save.gold);
    await tap(0);
    const a1 = await ev(page, () => ({ d: (() => { const a = document.activeElement; return a.dataset.k || a.id || a.tagName; })(), hull: save.hull, gold: save.gold }));
    ok("pad A buys the hull upgrade and focus stays on it", a1.hull === 2 && a1.gold < g0 && a1.d === "hull", a1);
    // keyboard: Enter on a picked gun's upgrade keeps focus; an upgrade that leaves too little gold moves on to the next control
    const lv0 = await ev(page, () => { document.body.classList.remove("pad-nav"); hullOpen = false; deckSel = { side: "bow", i: 0 }; renderPort();
      document.querySelector('#ctx [data-act="gup"]').focus(); return save.bow[0].lv; });
    await page.keyboard.press("Enter");
    const k1 = await ev(page, () => ({ d: document.activeElement.dataset.act + ":" + (document.activeElement.dataset.id || "six"), lv: save.bow[0].lv }));
    await ev(page, () => { save.gold = gunUpCost(save.bow[0]); renderPort(); document.querySelector('#ctx [data-act="gup"]').focus(); });
    await page.keyboard.press("Enter");
    const k2 = await ev(page, () => ({ inSheet: sheetEl.contains(document.activeElement) && document.activeElement !== sheetEl, body: document.activeElement === document.body, dis: document.activeElement.disabled, d: document.activeElement.id || document.activeElement.dataset.act }));
    await page.keyboard.press("ArrowUp");
    const k3 = await ev(page, () => document.activeElement !== document.body && sheetEl.contains(document.activeElement));
    ok("keyboard: Enter upgrades and keeps focus; when the item can no longer be bought, focus moves on (never <body>); arrows walk from there",
      k1.d === "gup:six" && k1.lv === lv0 + 1 && k2.inSheet && !k2.body && !k2.dis && k3, { k1, k2, k3 });
    // a gun bought goes straight into the picked port, the gun it replaces to the store; focus stays on the Buy button so a second Enter buys another
    await ev(page, () => { save.gold = 5000; deckSel = { side: "bow", i: 0 }; renderPort(); document.querySelector('#armory [data-act="buy"][data-id="long12"]').focus(); });
    const n0 = await ev(page, () => save.store.length);
    await page.keyboard.press("Enter");
    const k4 = await ev(page, () => ({ d: document.activeElement.dataset.act + ":" + document.activeElement.dataset.id, store: save.store.map(x => x.g), bow: save.bow[0].g + save.bow[0].lv, sel: deckSel }));
    ok("keyboard: buying a gun mounts it in the picked port, the old gun goes to the store, and focus stays on Buy",
      k4.d === "buy:long12" && k4.store.length === n0 + 1 && k4.bow === "long121" && k4.sel && k4.sel.side === "bow" && k4.sel.i === 0, k4);
    // the language switch rebuilds the ledger too
    await ev(page, () => { deckSel = null; hullOpen = true; renderPort(); document.querySelector('#yard [data-k="sails"]').focus(); });
    await ev(page, () => { lang = "zh"; applyLang(); });
    const l1 = await ev(page, () => document.activeElement.dataset.k);
    await ev(page, () => { lang = "en"; applyLang(); });
    ok("a language change keeps focus on the same ledger control", l1 === "sails", l1);
  }
  if (vp === HD) {
    await ev(page, () => { lang = "zh"; applyLang(); sheetEl.scrollTop = 0; });
    await page.screenshot({ path: join(out, `ledger-${tag}-zh.png`) });
  }
  if (vp === M) {
    await ev(page, () => { lang = "zh"; applyLang(); sheetEl.scrollTop = 0; });
    await page.screenshot({ path: join(out, `ledger-${tag}-zh.png`) });
  }
  await ctx.close();
}

// ---------- 3. noise: sea banner, bounty toast, toasts while docked; 8. no bounty on the first voyage ----------
{
  const { ctx, page } = await open(D, { tag: "noise" });
  await toLedger(page);
  await ev(page, () => {
    window.__toasts = []; window.__banners = [];
    const ot = toast; toast = m => { __toasts.push(m); return ot(m); };
    const ob = showSeaBanner; showSeaBanner = id => { __banners.push(id); return ob(id); };
  });
  await page.click("#sail"); await page.waitForFunction(() => !docked && !paused);
  await page.waitForTimeout(300 * SLOW);
  const tut = await ev(page, () => ({ tut: tut.active, boss: enemies.some(e => e.boss), arrow: !bossArrow.hidden, hunt: __toasts.filter(m => /Bounty/.test(m)).length, held: bountyHeld }));
  ok("first voyage: the tutorial runs and the bounty is held back (no boss, no arrow, no hunt toast)", tut.tut && !tut.boss && !tut.arrow && tut.hunt === 0 && tut.held, tut);
  await ev(page, () => tutorialSkip());
  await page.waitForTimeout(300 * SLOW);
  const sk = await ev(page, () => ({ boss: enemies.some(e => e.boss && e.alive), hunt: __toasts.filter(m => /Bounty/.test(m)).length }));
  ok("skipping the tutorial at sea brings the bounty out, announced once", sk.boss && sk.hunt === 1, sk);
  // sea banner: deep in the Shallows, then 20 s of fighting on the Reef border (±70 px), then deep in the Reef, then back
  const ban = await ev(page, () => {
    player.maxHp = player.hp = 1e6;
    const at = d => { player.x = PORT.x + d; player.y = PORT.y; };
    const run = (d, secs) => { at(d); for (let i = 0; i < secs * 10; i++) { player.hp = player.maxHp; runHook("frame", 0.1); } };
    __banners.length = 0;
    run(1000, 1);
    const line = ringEdge(3);
    for (let k = 0; k < 40; k++) run(line + (k % 2 ? 70 : -70), 0.5);   // across the line and back every half second
    const border = __banners.slice();
    run(line + 220, 1); run(1000, 1); run(line + 220, 1); run(1000, 1);
    return { border, all: __banners.slice() };
  });
  ok("sea banner: once for the Shallows, none while weaving across the Reef line, once for the Reef, none on the way back",
    ban.border.join() === "shallows" && ban.all.join() === "shallows,reef", ban);
  const ban2 = await ev(page, () => {
    __banners.length = 0;
    sendHome(); dock("return"); setSail();
    player.x = PORT.x + 1000; player.y = PORT.y; for (let i = 0; i < 10; i++) runHook("frame", 0.1);
    const quick = __banners.slice();
    seaLastIn = { ...seaLastIn, shallows: performance.now() - 61000 };
    sendHome(); dock("return"); setSail();
    player.x = PORT.x + 1000; player.y = PORT.y; for (let i = 0; i < 10; i++) runHook("frame", 0.1);
    return { quick, later: __banners.slice(quick.length) };
  });
  ok("a new sortie straight after the last one skips the sea it just left; a minute later it shows again", !ban2.quick.length && ban2.later.join() === "shallows", ban2);
  // the hunt toast: news only
  const hunt = await ev(page, () => {
    const n = () => __toasts.filter(m => /^Bounty/.test(m)).length, n0 = n();
    sendHome(); dock("return"); setSail();
    const again = n() - n0;
    huntSeenAt = { ...huntSeenAt, ned: performance.now() - 6 * 60 * 1000 };
    sendHome(); dock("return"); setSail();
    return { again, later: n() - n0 - again };
  });
  ok("bounty toast: not on every departure; again after five minutes away from it", hunt.again === 0 && hunt.later === 1, hunt);
  // toasts wait while the ledger is open, and docking clears one already up
  await ev(page, () => { toast("Away we go"); });
  const t1 = await ev(page, () => document.getElementById("toast").classList.contains("on"));
  await ev(page, () => { sendHome(); dock("return"); toast("Held for later"); });
  const t2 = await ev(page, () => ({ on: document.getElementById("toast").classList.contains("on"), z: +getComputedStyle(document.getElementById("toast")).zIndex, port: +getComputedStyle(document.getElementById("port")).zIndex }));
  await ev(page, () => setSail());
  await page.waitForFunction(() => document.getElementById("toast").classList.contains("on") && /Held for later/.test(document.getElementById("toast").textContent), null, { timeout: 5000 * SLOW }).catch(() => {});
  const t3 = await ev(page, () => ({ on: document.getElementById("toast").classList.contains("on"), txt: document.getElementById("toast").textContent }));
  ok("toasts: docking clears the live one, a toast while docked waits and shows at sea, and the lane sits under the ledger",
    t1 && !t2.on && t2.z < t2.port && t3.on && /Held for later/.test(t3.txt), { t1, t2, t3 });
  // a sinking: the toast is gone by the time the ledger is up
  await ev(page, () => { player.maxHp = 100; player.hp = 1; hurt(player, 50, 0, null); });
  await page.waitForFunction(() => docked, null, { timeout: 6000 * SLOW });
  await page.waitForTimeout(100 * SLOW);
  ok("the sinking toast never sits on the ledger", await ev(page, () => !document.getElementById("toast").classList.contains("on")));
  await ctx.close();
}

// ---------- 4. readability: merged numbers, hit markers, text size; 5. off-screen aim; 6. liveries; 7. poster ----------
{
  const { ctx, page } = await open(D, { tag: "read" });
  await toLedger(page);
  const rec = await ev(page, () => ({ txt: document.querySelector(".poster .p-rec")?.textContent || "", ned: bountyRecLv(BOUNTIES[0]), all: BOUNTIES.map(bountyRecLv), me: shipRating() }));
  ok("poster: a goal ship level from the boss's real threat (Red Ned: Ready at Ship Lv 3, his badge Lv 2 + 1: #98)", rec.ned === 3 && rec.all.slice(1).join() === "9,11,13,17" && /Goal/.test(rec.txt) && /Ready/.test(rec.txt) && new RegExp(`Lv ${rec.ned}`).test(rec.txt) && /you: Lv/.test(rec.txt), rec);
  // #91 #92: the poster is folded to head, goal and reward; its goal line shows the badge number it adds to; the toggle opens the rest
  const fold = await ev(page, () => { const p = document.querySelector("#wanted .poster"), vis = s => { const el = p.querySelector(s); return !!el && getComputedStyle(el).display !== "none"; };
    return { min: p.classList.contains("min"), story: vis(".p-story"), ship: vis(".p-ship"), goal: vis(".p-rec .goal"), calc: p.querySelector(".p-rec .calc")?.textContent || "", badge: bountyThreat(BOUNTIES[0]), h: Math.round(p.getBoundingClientRect().height) }; });
  ok("poster starts folded: no story or ship picture, the goal stays, and it says the boss's badge + the lair margin", fold.min && !fold.story && !fold.ship && fold.goal && new RegExp(`Lv ${fold.badge} \\+ \\d`).test(fold.calc), fold);
  await page.click('#wanted [data-camp="poster"]');
  const open2 = await ev(page, () => { const p = document.querySelector("#wanted .poster"); return { min: p.classList.contains("min"), story: getComputedStyle(p.querySelector(".p-story")).display !== "none", ship: getComputedStyle(p.querySelector(".p-ship")).display !== "none", why: p.querySelector(".p-rec .why")?.textContent || "", pressed: p.querySelector("[data-camp=poster]").getAttribute("aria-expanded"), h: Math.round(p.getBoundingClientRect().height) }; });
  ok("the toggle unfolds the story, the ship and the long reason, and says Ship Lv's meaning", !open2.min && open2.story && open2.ship && /level badge/.test(open2.why) && /Ship Lv is your ship/.test(open2.why) && open2.pressed === "true" && open2.h > fold.h, open2);
  await page.click('#wanted [data-camp="poster"]');
  await ev(page, () => { save.tutorialDone = true; });
  await page.click("#sail"); await page.waitForFunction(() => !docked && !paused);
  await page.waitForTimeout(200 * SLOW);
  // damage numbers on one ship within 0.3 s merge
  const dm = await ev(page, async () => {
    player.maxHp = player.hp = 1e6;
    const e = enemies.filter(x => x.alive && !x.boss).sort((a, b) => dist(a, player) - dist(b, player))[0];
    e.x = player.x + 160; e.y = player.y; e.speed = 0; e.maxSpeed = 0.001; e.hp = e.maxHp = 1e6;
    const nums = () => S.children.list.filter(o => o instanceof Phaser.GameObjects.Text && /^\d+$/.test(o.text) && o.active).map(o => o.text);
    const before = nums().length;
    hurt(e, 10, 0, player); hurt(e, 10, 0, player); hurt(e, 10, 0, player);
    const merged = nums().slice(before);
    await new Promise(r => setTimeout(r, 450));
    hurt(e, 10, 0, player);
    return { merged, after: nums().slice(before) };
  });
  ok("damage numbers: three hits inside 0.3 s show one '30'; a later hit starts a new number", dm.merged.join() === "30" && dm.after.includes("10"), dm);
  // hit markers
  const hm = await ev(page, () => {
    for (const e of enemies) { e.guns = { left: [], right: [] }; e.vol = {}; }   // only the two staged hits below may land
    hitLayer.innerHTML = ""; hitMarks = [];
    const foes = enemies.filter(x => x.alive && !x.boss).sort((a, b) => dist(a, player) - dist(b, player));
    const far = foes[1], near = foes[2];
    far.x = player.x + 1400; far.y = player.y - 100; near.x = player.x - 200; near.y = player.y + 60;
    hurt(player, 1, 0, far); hurt(player, 1, 0, near);
    runHook("frame", 0.016);
    const box = el => { const r = el.querySelector("b").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), near: el.classList.contains("near") }; };
    return { n: hitLayer.children.length, marks: [...hitLayer.children].map(box), vw: innerWidth };
  });
  const edge = hm.marks.find(m => !m.near), over = hm.marks.find(m => m.near);
  ok("hit markers: an off-screen shooter gets an edge marker on its side, an on-screen one a marker over it", hm.n === 2 && edge && edge.x > hm.vw * 0.8 && over && over.x < hm.vw / 2, hm);
  await page.screenshot({ path: join(out, "sea-720-hit-markers.png") });
  // game time runs slower than the wall clock on a busy machine: poll until the markers are gone instead of sleeping 2.3 s
  const fade = await ev(page, async () => { const t0 = performance.now(); await new Promise(r => setTimeout(r, 2300)); while (hitLayer.children.length && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100)); return hitLayer.children.length; });
  ok("hit markers clear about two seconds after the last hit", fade === 0, fade);
  // text size reaches the world labels
  const ts = await ev(page, async () => {
    const e = enemies.find(x => x.alive && x.badge), k1 = labelScale(), b1 = e.badge.scaleX, h1 = harborLabel.scaleX;
    saveSettings({ uiPct: 130 }); applyUiScale();
    // the badge is rescaled on a game frame: wait for it (up to 5 s) rather than a fixed 200 ms
    for (let w = 0; w < 50 && e.badge.scaleX === b1; w++) await new Promise(r => setTimeout(r, 100));
    const k2 = labelScale(), b2 = e.badge.scaleX, h2 = harborLabel.scaleX;
    saveSettings({ uiPct: 100 }); applyUiScale();
    return { k: +(k2 / k1).toFixed(3), badge: +(b2 / b1).toFixed(3), harbor: +(h2 / h1).toFixed(3) };
  });
  ok("text size 130% scales level badges, floating numbers (labelScale) and the harbor name", ts.k === 1.3 && ts.badge === 1.3 && ts.harbor === 1.3, ts);
  // off-screen enemies: no aim line, no shot
  const aim = await ev(page, async () => {
    for (const e of enemies) if (e.alive) { e.x = PORT.x - 3000; e.y = PORT.y - 3000; }
    player.rot = 0; S.cameras.main.centerOn(player.x, player.y);
    const right = MOUNTS.find(m => m.key === "right"), g = player.guns.right[0];
    g.range = 700; g.cd = 0;
    const e = enemies.find(x => x.alive && !x.boss), half = S.cameras.main.worldView.height / 2;
    e.x = player.x; e.y = player.y + half + 120; e.speed = 0; e.maxSpeed = 0.001;
    await new Promise(r => setTimeout(r, 50));
    const offEng = mountEngaged(right), b0 = balls.filter(b => b.fromPlayer).length;
    playerFire();
    await new Promise(r => setTimeout(r, 150));
    const offShots = balls.filter(b => b.fromPlayer).length - b0;
    e.y = player.y + half - 120;
    await new Promise(r => setTimeout(r, 50));
    return { half: Math.round(half), offEng, offShots, onEng: mountEngaged(right) };
  });
  ok("aim lines and fire ignore a ship in range but off screen, and engage it once it is in view", !aim.offEng && aim.offShots === 0 && aim.onEng, aim);
  // boss liveries: navy bosses fly the ensign, Thorne's flagship is its own, bigger hull
  const liv = await ev(page, () => BOUNTIES.map(b => ({ id: b.id, liv: bossLivery(b), cls: artClass(b.cls), len: SHIP_ART[artClass(b.cls)].len })));
  const bigBuy = await ev(page, () => Math.max(...SHIP_ORDER.map(id => SHIP_ART[id].len)));
  const by = Object.fromEntries(liv.map(l => [l.id, l]));
  ok("liveries: pirate bosses keep the skull livery, Hale flies navy colours, Thorne's man-o'-war is larger than any buyable hull",
    by.ned.liv === "boss" && by.carey.liv === "boss" && by.saint.liv === "boss" && by.hale.liv === "bossNavy" && by.thorne.liv === "admiral" &&
    by.thorne.cls === "manowar" && by.thorne.len > bigBuy, { liv, bigBuy });
  // a staged lineup to look at: the player's line ship, Hale, Thorne, a pirate boss
  await ev(page, () => {
    for (const e of enemies) if (e.alive) { e.x = PORT.x - 3000; e.y = PORT.y - 3000; }
    hitLayer.innerHTML = ""; hitMarks = [];
    player.x = 2000; player.y = 2000; player.rot = 0; save.ship = "line"; applyPlayerStats(true);
    const put = (b, dx, dy) => { const e = enemies.find(x => x.alive && !x.boss && !x.staged); e.staged = true; e.boss = b.id; e.faction = b.faction;
      applyShipArt(e, artClass(b.cls), bossLivery(b)); e.x = player.x + dx; e.y = player.y + dy; e.rot = 0; e.speed = 0; e.maxSpeed = 0.001; e.spr.setPosition(e.x, e.y).setRotation(0); };
    put(BOUNTIES[4], 0, -150); put(BOUNTIES[3], 230, 110); put(BOUNTIES[1], -230, 110);
    S.cameras.main.stopFollow(); S.cameras.main.centerOn(player.x, player.y); S.cameras.main.setZoom(S.cameras.main.zoom * 1.6);
  });
  await page.waitForTimeout(200 * SLOW);
  await page.screenshot({ path: join(out, "bosses-lineup.png") });
  await ctx.close();
}

// ---------- screenshots at sea: banner + toast + hit markers together, 1920x1080 and a phone ----------
for (const [vp, tag, mobile] of [[HD, "1080", false], [M, "phone", true]]) {
  const { ctx, page } = await open(vp, { mobile, tag: "sea-" + tag, lang: mobile ? "zh" : "en" });
  await toLedger(page);
  await ev(page, () => { save.tutorialDone = true; setSail(); });
  await page.waitForTimeout(300 * SLOW);
  const lap = await ev(page, () => {
    player.maxHp = player.hp = 1e6;
    for (const e of enemies) { e.guns = { left: [], right: [] }; e.vol = {}; }
    const foes = enemies.filter(x => x.alive && !x.boss).sort((a, b) => dist(a, player) - dist(b, player));
    foes[0].x = player.x + 120; foes[0].y = player.y - 160; foes[1].x = player.x - 2000; foes[1].y = player.y + 300;
    hurt(player, 3, 0, foes[0]); hurt(player, 3, 0, foes[1]);
    showSeaBanner("reef"); toast(t("bossSighted", { name: bossName(BOUNTIES[0]) }));
    runHook("frame", 0.016);
    const r = id => document.getElementById(id).getBoundingClientRect();
    const b = r("seaBanner"), tt = r("toast"), on = document.getElementById("toast").classList.contains("on");
    return { on, overlap: on && !(tt.bottom <= b.top || tt.top >= b.bottom) };   // the toast waits for the banner (js/onboard.js)
  });
  ok(`${tag}: the toast and the sea banner never print over each other`, !lap.overlap, lap);
  await page.waitForTimeout(400 * SLOW);
  await page.screenshot({ path: join(out, `sea-${tag}-notices.png`) });
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r.pass);
if (errors.length) console.error("page errors:\n" + errors.join("\n"));
console.log(`${results.length - failed.length}/${results.length} checks passed, ${errors.length} page errors. Screenshots in ${out}`);
console.log(failed.length || errors.length ? "FAIL" : "PASS: polish checks");
process.exit(failed.length || errors.length ? 1 : 0);
