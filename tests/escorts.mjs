// Escorts in headless Chrome (js/escorts.js, js/escort-ai.js, js/escort-ui.js): the ledger page (unlock, buy a slot, assign a yard ship,
// stance, deploy), the sortie (ready ships only, 80% guns, formation, no collision bill, friendly fire off), the three stances,
// being sunk and repaired in port, the daily sea sailing alone, the chart and edge marks, and no page errors.
// Saves pictures to <outDir> (default .review/escorts, not committed).
// Usage: node tests/escorts.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
// A spend of CONFIRM_GOLD or more (a gun upgrade or purchase, a break-down) arms its button on the first tap (#117): press again once it shows "Tap again to confirm".
const sureClick = async (page, sel) => { await page.click(sel); if (await page.evaluate(s => !!document.querySelector(s + "[data-armed]"), sel)) { await page.waitForTimeout(450); await page.click(sel); } };
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/escorts";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
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
const YARD = [{ id: "s1", ship: "sloop", hull: 2, sails: 2, hold: 1 }, { id: "s3", ship: "schooner", hull: 3, sails: 1, hold: 1 },
  { id: "s4", ship: "frigate", hull: 4, sails: 2, hold: 1 }, { id: "s5", ship: "brig", hull: 2, sails: 1, hold: 1, name: "Sea Mule" }];
const saveWith = (extra = {}) => ({ v: 2, gold: 20000, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: { bounty: 3 }, escortGift: "had", ship: "brig", hull: 3, shipId: "s2", shipSeq: 9,
  fleet: YARD, store: [{ g: "long12", lv: 4 }], bow: [{ g: "six", lv: 1 }], left: Array(3).fill({ g: "six", lv: 1 }), right: Array(3).fill({ g: "six", lv: 1 }), ...extra });
const boot = async (s, lang = "en") => {
  await page.goto(url, { waitUntil: "load" }); await ready();
  await page.evaluate(([s, lang]) => { localStorage.clear(); localStorage.setItem("privateers-lang", lang); localStorage.setItem("privateers-save-v2", JSON.stringify(s)); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); }, [s, lang]);
  await page.reload({ waitUntil: "load" }); await ready();
  await page.waitForTimeout(500);   // the ledger ignores clicks in its first 350 ms (js/menu.js)
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const rig = () => ev(() => {
  window.fixT = 0;
  window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); } };
  window.openAt = (ring, near = 420, skip = 0) => {
    for (let a = 0, n = 0; a < 200; a++) { const p = polarPt(a * 0.37, ringMid(ring)); if (!islands.some(i => Math.hypot(i.x - p.x, i.y - p.y) < i.r + near) && !STATIONS.some(s => dist(s, p) < 800) && n++ >= skip) return p; }
    return polarPt(0, ringMid(ring));
  };
  window.pin = e => { e.angry = 1e6; return e; };
  window.clearSea = () => { for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; fleets = []; escortLive = []; spawnT = 1e9; };
  window.park = p => { Object.assign(player, { x: p.x, y: p.y, rot: 0, speed: 0, maxHp: 1e9, hp: 1e9, alive: true }); player.spr.setPosition(p.x, p.y); joyVec = { x: 0, y: 0, m: 0 }; const c = S.cameras.main; c.centerOn(p.x, p.y); c.preRender(); };   // the camera is there at once, as onScreen() tests read it
  window.depart = () => { spawnT = 0; document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; if (typeof tut !== "undefined") tut.active = false; save.tutorialDone = true; };
  // a slot injected into the live save: every port of its ship holds a new 6-pounder unless `guns` says otherwise
  window.cfg = (id, extra = {}) => { const y = save.fleet.find(x => x.id === id), guns = emptyGuns(y ? y.ship : ""); for (const k in guns) guns[k] = guns[k].map(() => gunItem("six")); return { id, on: true, stance: "normal", owed: 0, guns, ...extra }; };
  window.hurts = { player: 0, escort: 0 };
  onHook("hurt", (s, dmg) => { if (s.isPlayer) hurts.player++; else if (s.ally) hurts.escort++; });
  // an idle punching bag: hostile, armed with nothing, never picks a target, never moves
  window.dummy = (x, y, tgt = null) => { const d = pin(makeEnemy(S, x, y, 3, "pirate", "brig")); d.vol = {}; d.maxSpeed = 0; d.speed = 0; d.retarget = 1e9; d.target = tgt; d.maxHp = d.hp = 5000; d.ring = ringAt(dist(player, PORT)); return d; };   // same ring as the flagship: an enemy does not break off from a shallower captain
  // the longest clear stretch of water heading east that this sea has (the most room to the nearest rock along the run)
  window.openRun = (len = 3800) => { let best = null;
    for (let gx = 500; gx <= 4000; gx += 250) for (let gy = 600; gy <= 7400; gy += 250) {
      if (Math.abs(gy - PORT.y) < 1000) continue;
      let room = 1e9; for (const i of islands) { const t = clamp((i.x - gx) / len, 0, 1); room = Math.min(room, Math.hypot(i.x - (gx + t * len), i.y - gy) - i.r); }
      if (!best || room > best.room) best = { x: gx, y: gy, room };
    } return best; };
  window.sailOut = (escorts, at = 5) => { Object.assign(save, { escorts }); const p = typeof at === "number" ? openAt(at, 700) : at; park(p); depart(); clearSea(); deployEscorts(); return escortLive.map(x => x.e); };
});
const stage = () => ev(() => document.getElementById("stage").innerText);
// The ports of each yard ship type (js/data.js SHIPS), and every one of them holding `g` at level `lv`: an escort's guns are items now (js/escorts.js).
const SLOTS = { sloop: [1, 1, 1, 0], schooner: [1, 2, 2, 0], brig: [1, 3, 3, 0], frigate: [2, 7, 7, 1] };
const full = (ship, g = "six", lv = 1) => Object.fromEntries(["bow", "left", "right", "stern"].map((k, i) => [k, Array.from({ length: SLOTS[ship][i] }, () => ({ g, lv }))]));
// A slot for a save: no guns given, so loading arms it with new Lv 1 6-pounders (the migration); pass `guns` to choose.
const cfg = (id, extra = {}) => ({ id, on: true, stance: "normal", owed: 0, ...extra });

console.log("First escort gift (#101)");
await boot(saveWith({ campaign: { bounty: 0 }, escortGift: "", escorts: [], gold: 100 }));
check(await ev(() => /Free escort slot 1/.test(document.getElementById("wanted").innerText)), "the first poster says what comes with the bounty");
await ev(() => { claimBounty(findBounty("ned"), player); });
check(await ev(() => save.escortGift === "given" && save.escorts.length === 1 && save.fleet.some(x => x.id === save.escorts[0].id && x.ship === "sloop") &&
  ["bow", "left", "right"].every(k => save.escorts[0].guns[k].length === 1 && save.escorts[0].guns[k][0].g === "six" && save.escorts[0].guns[k][0].lv === 1) && save.escorts[0].on),
  "claiming the first bounty posts a Sloop with a Lv 1 6-pounder per port in slot 1, deployed");
check(await ev(() => { const before = JSON.stringify(save.escorts); claimEscortGift(); return before === JSON.stringify(save.escorts) && save.escorts.length === 1; }), "claiming again does not give a second one");
await boot(saveWith({ campaign: { bounty: 1 }, escortGift: "", escorts: [], gold: 100 }));
check(await ev(() => save.escortGift === "given" && save.escorts.length === 1 && readStored("privateers-save-v2") && JSON.parse(localStorage.getItem("privateers-save-v2")).escortGift === "given"), "an old save past bounty 1 with no escort gets it once on load, and it is saved");
check(await ev(() => /first escort/.test(document.querySelector("#giftCard")?.innerText || "")), "the ledger shows the next-step card");
await page.click('#giftCard [data-act="escGift"]');
check(await ev(() => document.querySelector('#tabs .tab.sel')?.dataset.i === "1" && /Estimated fire: about [\d.]+ damage\/s, \d+% of your flagship/.test(document.getElementById("shead").innerText)), "its button opens Escort 1, which shows the estimated output against the flagship");
await page.screenshot({ path: `${out}/gift.png` });
await boot(saveWith({ campaign: { bounty: 1 }, escortGift: "", escorts: [], gold: 100 }), "zh");
check(await ev(() => /第一艘隨從已在船位 1 就位/.test(document.querySelector("#giftCard")?.innerText || "")), "the card is in Chinese too");
await boot(saveWith({ campaign: { bounty: 1 }, escortGift: "had", escorts: [], gold: 100 }));
await page.click('#tabs [data-act="tab"][data-i="1"]');
check(/Slot 200 gold, plus a ship/.test(await ev(() => document.getElementById("stage").innerText)), "an unbought slot spells out the total (slot, a ship, guns)");
await ev(() => { tab = 0; hullOpen = true; renderPort(); });
check(await ev(() => [...document.querySelectorAll('#ships [data-act="ship"]:disabled')].some(b => /need [\d,]+ more/.test(b.textContent))), "a ship button greyed for lack of gold says how much is missing");

console.log("Ledger: tabs, unlock, buy, assign, arm");
await boot(saveWith({ campaign: { bounty: 0 }, escorts: [] }));
check(await ev(() => document.getElementById("tabs").hidden && document.getElementById("tabs").children.length === 0), "no escort tabs before bounty 1: only the flagship's deck");
check(await ev(() => !!document.querySelector('#deck [data-act="port"]') && document.getElementById("shead").innerText.includes("Flagship")), "...and the flagship's gun deck is there as always");
await boot(saveWith({ campaign: { bounty: 1 }, gold: 500, escorts: [] }));
check(await ev(() => !document.getElementById("tabs").hidden && document.querySelectorAll("#tabs [data-act=tab]").length === 5), "the tabs appear once bounty 1 is claimed: the flagship and four escort slots");
let t = await ev(() => document.getElementById("tabs").innerText);
check(/Flagship/.test(t) && /Escort 1\s+200 gold/.test(t) && (t.match(/Locked/g) || []).length === 3, `slot 1 shows its price, slots 2-4 are locked (${t.replace(/\s+/g, " ")})`);
const tabTo = i => page.click(`#tabs [data-act="tab"][data-i="${i}"]`);
// #92: a locked tab is greyed and names what opens it
check(await ev(() => { const l = [...document.querySelectorAll("#tabs .tab.lock")]; return l.length === 3 && l.every(b => getComputedStyle(b).filter.includes("grayscale") && b.querySelector(".tw")) && /Sink bounty 2/.test(l[0].textContent) && /Sink bounty 3/.test(l[1].textContent) && /Sink bounty 4/.test(l[2].textContent); }),
  "locked tabs are grey and name the bounty that opens them");
await tabTo(1);
t = await stage();
check(/Buy slot · 200/.test(t), `slot 1 offers to be bought for 200 (${t.replace(/\s+/g, " ").slice(0, 80)})`);
await tabTo(2); t = await stage();
check(/Sink bounty 2 to unlock · 800 gold/.test(t), "slot 2 says what unlocks it");
await tabTo(4); t = await stage();
check(/Sink bounty 4 to unlock · 5,000 gold/.test(t), "slot 4 says what unlocks it and for how much");
await tabTo(1);
await page.click('#stage [data-act="escBuy"][data-id="0"]');
check(await ev(() => save.gold === 500 && save.escorts.length === 0) && /Confirm purchase\?/.test(await stage()), "the first tap on a slot only arms the button");
// #107: the armed state has no timer; a tap elsewhere or Esc puts it down, only the second tap on the button buys
const armedNow = () => ev(() => !!document.querySelector('#stage [data-act="escBuy"][data-armed]'));
await page.waitForTimeout(6500 * SLOW);
check(await armedNow() && await ev(() => save.gold === 500), "the armed button does not run out (still armed after 6.5 s)");
await page.click("#pMsg");
check(!(await armedNow()) && /Buy slot/.test(await stage()) && await ev(() => save.gold === 500 && save.escorts.length === 0), "a tap anywhere else puts the purchase down");
await page.click('#stage [data-act="escBuy"][data-id="0"]'); await page.waitForTimeout(450);
await page.keyboard.press("Escape");
check(!(await armedNow()) && await ev(() => save.gold === 500 && docked), "Esc puts it down too, and stays in the ledger");
await page.click('#stage [data-act="escBuy"][data-id="0"]');
await page.waitForTimeout(500);
await page.click('#stage [data-act="escBuy"][data-id="0"]');
check(await ev(() => save.gold === 300 && save.escorts.length === 1 && save.escorts[0].id === "" && save.escorts[0].stance === "normal"), "the second tap buys slot 1 for 200 (stance Normal by default)");
check(await ev(() => JSON.parse(localStorage.getItem("privateers-save-v2")).escorts.length === 1), "the purchase is saved");
t = await stage();
check(/assign from the yard/i.test(t) && /buy a new ship for this escort/i.test(t) && await ev(() => !!document.querySelector('#stage [data-act="escAssign"]') && !!document.querySelector('#stage [data-act="escBuyShip"]')),
  "a bought, empty slot shows the two choices: assign an idle ship, or buy a new one");
await page.click('#stage [data-act="escAssign"][data-id="0"][data-ship="s1"]');
check(await ev(() => save.escorts[0].id === "s1" && Object.values(save.escorts[0].guns).flat().length === 3 && Object.values(save.escorts[0].guns).flat().every(x => x === null)), "Assign posts the sloop; its three ports start empty");
check(/No guns aboard/.test(await ev(() => document.getElementById("shead").innerText)) && await ev(() => !escortReady(save, 0)), "with no guns the ledger says why it will not sail, and it does not");
await page.click('#deck [data-act="port"][data-side="bow"][data-i="0"][data-e="0"]');
check(await ev(() => deckSel && deckSel.e === 0 && !!document.querySelector('#ctx [data-act="buy"][data-id="six"]')), "tapping an escort's empty port opens the panel with the armory");
await sureClick(page, '#ctx [data-act="buy"][data-id="six"]');
check(await ev(() => save.escorts[0].guns.bow[0] && save.escorts[0].guns.bow[0].g === "six" && save.store.length === 1 && escortReady(save, 0)), "a gun bought there is mounted on the escort's port (the store is untouched) and the escort is ready to sail");
await page.click('#ctx [data-act="gfrom"][data-side="store"]');
check(await ev(() => save.escorts[0].guns.bow[0].g === "long12" && save.escorts[0].guns.bow[0].lv === 4 && save.store[0].g === "six"), "picking the stored Long 12 for that port trades it with the six");
await sureClick(page, '#ctx [data-act="gup"]');
check(await ev(() => save.escorts[0].guns.bow[0].lv === 5), "the card upgrades the gun on the escort's port");
await page.click('#ctx [data-act="ctxclose"]');
check(await ev(() => !deckSel && !document.querySelector("#ctx .cpanel") && /Tap a gun port/.test(document.getElementById("ctx").innerText)), "closing the panel leaves the one hint line");
await page.click('#deck [data-act="hull"]');
check(await ev(() => hullOpen && !!document.querySelector('#yard [data-act="yard"][data-k="hull"][data-id="s1"]') && !!document.querySelector('#ctx [data-act="escEvict"]')), "the escort's hull panel has its own yard rows and a free-the-slot button");
const hull0 = await ev(() => save.fleet.find(x => x.id === "s1").hull);
await ev(() => { save.gold += 1000; renderPort(); });
await page.click('#yard [data-act="yard"][data-k="hull"]');
check(await ev(([h]) => save.fleet.find(x => x.id === "s1").hull === h + 1 && save.hull === 3, [hull0]), "upgrading the hull upgrades the escort's yard ship, not the flagship");
await page.click('#ctx [data-act="escEvict"]');
check(await ev(() => save.escorts[0].id === "" && save.fleet.some(x => x.id === "s1") && save.store.length === 2 && !hullOpen), "freeing the slot returns the ship to the yard and the gun to the store");
await page.click('#stage [data-act="escAssign"][data-id="0"][data-ship="s1"]');
await page.click('#shead [data-act="escStance"][data-id="0"][data-k="passive"]');
check(await ev(() => save.escorts[0].stance) === "passive" && await ev(() => !!document.querySelector('#shead [data-k="passive"].on')), "a stance button sets and shows the stance");
await page.click('#shead [data-act="escStance"][data-id="0"][data-k="active"]');
check(await ev(() => save.escorts[0].stance) === "active", "...and Active too");
await page.click('#shead [data-act="escOn"][data-id="0"][data-v="0"]');
check(await ev(() => save.escorts[0].on === false && !!document.querySelector('#shead [data-v="0"].on[aria-pressed="true"]')), "Standby keeps the ship in port and shows it");
await page.click('#shead [data-act="escOn"][data-id="0"][data-v="1"]');
check(await ev(() => save.escorts[0].on === true), "Deploy puts it back");
check(await ev(() => document.querySelectorAll("#shead [data-act]").length >= 5 && document.activeElement !== document.body), "focus is not lost when the page re-renders");
await boot(saveWith({ campaign: { bounty: 2 }, gold: 1000, escorts: [] }));
await tabTo(2);
check(/Buy slot 1 first/.test(await stage()), "slot 2 waits for slot 1");
await boot(saveWith({ campaign: { bounty: 1 }, gold: 100, escorts: [] }));
await tabTo(1);
check(await ev(() => document.querySelector('#stage [data-act="escBuy"]').disabled), "not enough gold: the buy button is off");
await boot(saveWith({ escorts: [cfg("s1"), cfg("s3", { owed: 40 }), cfg("")] }));
await tabTo(2);
await page.evaluate(() => document.getElementById("fleet").scrollIntoView());
await page.screenshot({ path: `${out}/ledger.png` });
t = await ev(() => document.getElementById("shead").innerText);
check(/Owes 40 gold/.test(t) && /Repair · 40/.test(t), "an escort that owes gold says so and offers Repair");
await tabTo(0);
check(/must be paid before they can sail/.test(await ev(() => document.getElementById("shead").innerText)), "the flagship page also says the repair fees must be paid before sailing (#121)");
await tabTo(2);
check(await ev(() => document.querySelector('#tabs [data-i="2"] .dot') && !document.querySelector('#tabs [data-i="2"] .dot.on') && document.querySelector('#tabs [data-i="1"] .dot.on')), "the tabs show who sails (green dot) and who waits");
await page.click('#shead [data-act="escPay"]');
check(await ev(() => save.escorts[1].owed === 0 && save.gold === 19960), "paying the debt takes exactly what was owed");
await tabTo(3);
check(/Escort slot 3: no ship/.test(await stage()), "a bought slot with no ship shows its berth");
await boot(saveWith({ escorts: [cfg("s1")] }), "zh");
await tabTo(1);
t = await ev(() => document.getElementById("shead").innerText + document.getElementById("tabs").innerText);
check(/隨從 1/.test(t) && /攻擊傾向|主動/.test(t) && /主動/.test(t) && /待命/.test(t) && !/undefined|\{/.test(t), "the page reads in Traditional Chinese, no raw keys");
await page.screenshot({ path: `${out}/ledger-zh.png` });
const strs = await ev(() => { const en = Object.keys(STR.en), zh = Object.keys(STR.zh); return { miss: [...en.filter(k => !(k in STR.zh)), ...zh.filter(k => !(k in STR.en))], n: en.filter(k => /^(esc|st_|stn_)/.test(k)).length }; });
check(strs.miss.length === 0 && strs.n > 25, `every string exists in both languages (${strs.n} escort strings; missing: ${strs.miss})`);

console.log("The sortie: who sails, and with what");
await boot(saveWith({ escorts: [cfg("s1"), cfg("s3", { stance: "active" }), cfg("s4", { guns: full("frigate", "long12", 4) }), cfg("s5", { on: false })] }));
await rig();
let r = await ev(() => { depart(); setSail(); stepN(3); const es = enemies.filter(e => e.ally);
  return { n: es.length, live: escortLive.length, ships: es.map(e => e.cls), names: es.map(e => e.badge.text), hp: es.map(e => e.maxHp), want: [save.fleet[0], save.fleet[1], save.fleet[2]].map(y => yardVal("hull", y.hull, SHIPS[y.ship])),
    spk: ESCORT_SPEED_K, fire: es.map(e => e.fireMul), loot: es.map(e => e.loot), liv: es.map(e => e.livery), stances: es.map(e => e.stance), fl: fleets.filter(f => f.type === "escort").length, lead: fleets.find(f => f.type === "escort")?.lead === player,
    pf: player.fleet || null, ord: enemies.filter(e => e.alive && isOrdinary(e)).length, ally: es.every(e => !isOrdinary(e)), sp: es.map(e => e.maxSpeed / yardVal("sails", save.fleet.find(y => y.id === e.yardId).sails, SHIPS[e.cls])),
    gunDps: es.map(e => Object.values(e.guns).flat().reduce((a, g) => a + g.dmg / (g.interval + VOLLEY_WARN), 0) / mainGunDps(e.cls, e.yardId === "s4" ? "long12" : "six", e.yardId === "s4" ? 4 : 1)) }; });
check(r.n === 3 && r.live === 3, `three ready escorts sail (the fourth is stood down): ${r.ships}`);
check(r.ships.join() === "sloop,schooner,frigate", "each escort is the yard ship you assigned");
check(r.hp.every((h, i) => h === r.want[i]), `their hulls are the yard ships' own (${r.hp})`);
check(r.fire.every(f => f === 0.8) && r.gunDps.every(x => Math.abs(x - Math.sqrt(0.8)) < 1e-6), `every escort fires at 80% of the same ship's guns: reload x${Math.sqrt(0.8).toFixed(3)} (${r.gunDps.map(x => x.toFixed(3))}) with looser aim, fireMul ${r.fire}`);
check(r.sp.every(x => Math.abs(x - r.spk) < 1e-9), "they sail at the yard's speed times the crews' station-keeping bonus");
check(r.loot.every(l => l === 0), "an escort carries no loot");
check(r.liv.every(l => l === "ally"), "escorts fly the friendly livery");
check(r.stances.join() === "normal,active,normal", `each keeps its own stance (${r.stances})`);
check(r.fl === 1 && r.lead && r.pf === null, "bound into one escort fleet led by the flagship (js/fleet.js), which is not itself a member");
check(r.ally && r.ord <= 30, `escorts are outside the sea's quota (${r.ord} ordinary ships)`);
check(r.names.every(n => n.startsWith("◆")) && /Sea Mule/.test(await ev(() => (save.fleet.find(y => y.id === "s5") || {}).name || "Sea Mule")), `their plates show the ships' names (${r.names})`);
await boot(saveWith({ escorts: [cfg("s1", { on: false }), cfg("s3", { owed: 10 }), cfg(""), cfg("s2")] }));
await rig();
r = await ev(() => { depart(); setSail(); stepN(2); return { n: enemies.filter(e => e.ally).length, live: escortLive.length }; });
check(r.n === 0 && r.live === 0, "stood down, in debt, unassigned, or the flagship itself: none sail");
await boot(saveWith({ escorts: [cfg("s1")] }));
await rig();
const census = await ev(() => { depart(); setSail(); spawnT = 0; for (let i = 0; i < 60; i++) { stepN(10); } const withE = seaCensus().total; save.escorts = []; setSail(); spawnT = 0; for (let i = 0; i < 60; i++) { stepN(10); } return { withE, without: seaCensus().total, max: ENEMY_COUNT }; });
check(Math.abs(census.withE - census.without) <= 1 && census.withE <= census.max && census.withE >= 28, `the sea holds the same ${census.withE} ships with and without an escort (not stronger, not fewer) ${JSON.stringify(census)}`);

console.log("The guns are the escort's own");
await boot(saveWith({ escorts: [cfg("s1", { guns: { bow: [{ g: "long12", lv: 3 }], left: [null], right: [{ g: "carronade", lv: 2 }], stern: [] } }), cfg("s3", { guns: { bow: [null], left: [null, null], right: [null, null], stern: [] } }), cfg("s4", { gun: "carronade" })] }));
await rig();
r = await ev(() => { depart(); setSail(); stepN(3); const es = enemies.filter(e => e.ally), sloop = es.find(e => e.cls === "sloop"), fr = es.find(e => e.cls === "frigate");
  const sh = ["bow", "left", "right", "stern"].map(k => sloop.guns[k].map(g => g.gt));
  return { cls: es.map(e => e.cls).sort().join(), sh, bowDmg: sloop.guns.bow[0].dmg, carrDmg: sloop.guns.right[0].dmg, bowRange: sloop.guns.bow[0].range, carrRange: sloop.guns.right[0].range,
    frig: Object.values(fr.guns).flat().length, frigSix: Object.values(fr.guns).flat().every(g => g.gt === "six"), vol: Object.keys(sloop.vol).sort().join() }; });
check(r.cls === "frigate,sloop", `an escort with every port empty does not sail; the armed ones do (${r.cls})`);
check(JSON.stringify(r.sh) === JSON.stringify([["long12"], [], ["carronade"], []]), `the battery is built port by port from the gun items; an empty port fires nothing (${JSON.stringify(r.sh)})`);
check(Math.abs(r.bowDmg - 18 * 1.15 ** 2) < 1e-6 && Math.abs(r.carrDmg - 32 * 1.15) < 1e-6 && r.bowRange === 400 && r.carrRange === 200, `each gun keeps its own type's damage, level and range (${r.bowDmg.toFixed(2)} / ${r.carrDmg.toFixed(2)})`);
check(r.vol === "bow,right", `only the sides that hold a gun get a volley (${r.vol})`);
check(r.frig === 17 && r.frigSix, "an old save's escort (a shared gun type, no guns) came out armed with a new 6-pounder in each of the frigate's 17 ports");
await ev(() => { dock("return"); tab = 2; renderPort(); });
check(/No guns aboard/.test(await ev(() => document.getElementById("shead").innerText)), "and the ledger tells the unarmed one why it stayed in port");

console.log("Following in formation, and no collision bill");
await boot(saveWith({ escorts: [cfg("s1"), cfg("s3"), cfg("s4")] }));
await rig();
const follow = await ev(() => {
  const isl0 = islands; islands = [];   // open water for the whole manoeuvre; rocks have their own check below
  const es = sailOut(save.escorts, openRun()), f = fleets.find(x => x.type === "escort"); hurts.player = hurts.escort = 0;
  const frame = { x: 0, y: 0 }, slotErr = () => es.map(e => { const s = slotOf(f, e), q = slotWorld(fleetFrame(f), s); return Math.hypot(e.x - q.x, e.y - q.y); });
  const phases = [];
  const run = (secs, ang, thr) => { for (let i = 0; i < secs * 60; i++) { joyVec = { x: Math.cos(ang(i)), y: Math.sin(ang(i)), m: thr }; stepN(1); } phases.push({ err: slotErr().map(Math.round), speed: Math.round(player.speed), left: es.filter(e => !e.fleet).length }); };
  run(12, () => 0, 0.9);           // steady course
  run(8, i => i / 60 * 0.2, 0.9);   // a long turn to starboard
  run(6, () => 1.6, 0.5);            // slow
  joyVec = { x: 0, y: 0, m: 0 }; for (let i = 0; i < 600; i++) { stepN(1); } phases.push({ err: slotErr().map(Math.round), speed: Math.round(player.speed), left: es.filter(e => !e.fleet).length });   // at anchor
  const rel = es.map(e => { const c = Math.cos(player.rot), s = Math.sin(player.rot), dx = e.x - player.x, dy = e.y - player.y; return { ax: dx * c + dy * s, ay: -dx * s + dy * c, half: e.hl + e.hw }; });
  const span = (player.mounts.left.span) / 2;
  islands = isl0;
  return { phases, hurts: { ...hurts }, hpAll: es.map(e => e.hp === e.maxHp), pl: player.hp === 1e9, rel, span, hl: es.map(e => e.hl) };
});
check(follow.phases[0].err.every(e => e < 90), `on a steady course every escort sits within 90 px of its slot (${follow.phases[0].err})`);
check(follow.phases[1].err.every(e => e < 260) && follow.phases[2].err.every(e => e < 200), `through a long turn and at half speed they stay close (${follow.phases[1].err} / ${follow.phases[2].err})`);
check(follow.phases[3].err.every(e => e < 60) && follow.phases[3].speed === 0, `at anchor they settle on their slots (${follow.phases[3].err}) instead of sailing on`);
check(follow.phases.every(p => p.left === 0), "no escort drops out of the fleet");
check(follow.hurts.player === 0 && follow.hurts.escort === 0 && follow.hpAll.every(Boolean) && follow.pl, `a minute of following and turning costs nobody a point of hull (hurt events: ${follow.hurts.player}/${follow.hurts.escort})`);
check(follow.rel.every(x => x.ax + x.half < -follow.span + 1), `escorts ride astern of the broadside's guns, never in front of a muzzle (ahead-most hull edge ${follow.rel.map(x => Math.round(x.ax + x.half))} vs -${Math.round(follow.span)})`);
await page.screenshot({ path: `${out}/formation.png` });
const jostle = await ev(() => {
  const es = sailOut([cfg("s1")]), e = es[0]; hurts.player = hurts.escort = 0;
  const p0 = { x: player.x, y: player.y }; Object.assign(e, { x: player.x + 12, y: player.y + 4 }); stepN(30);
  return { moved: Math.hypot(player.x - p0.x, player.y - p0.y), apart: dist(e, player), hurts: { ...hurts } };
});
check(jostle.moved < 0.5 && jostle.apart > 30 && jostle.hurts.player === 0 && jostle.hurts.escort === 0, `an escort that drifts onto the flagship is the one that gives way, no damage (flagship moved ${jostle.moved.toFixed(2)} px)`);

// #108: a flagship at full sail (its gear can make it faster than the yard's sails times ESCORT_SPEED_K) is kept up with; a badly hurt escort is warned about once
const sprint = await ev(() => {
  const isl0 = islands; islands = [];
  const es = sailOut([cfg("s1"), cfg("s3")], openRun()), f = fleets.find(x => x.type === "escort");
  player.maxSpeed = Math.max(...es.map(e => e.baseSpeed)) * 1.3; joyVec = { x: 1, y: 0, m: 1 };
  for (let i = 0; i < 30 * 60; i++) stepN(1);
  const errs = es.map(e => { const q = slotWorld(fleetFrame(f), slotOf(f, e)); return Math.round(Math.hypot(e.x - q.x, e.y - q.y)); }), speed = Math.round(player.speed);
  joyVec = { x: 0, y: 0, m: 0 }; for (let i = 0; i < 300; i++) stepN(1);
  const said = []; const toast0 = toast; toast = (m, ...a) => { said.push(m); return toast0(m, ...a); };
  es[0].hp = es[0].maxHp * 0.2; es[1].hp = es[1].maxHp * 0.9; stepN(60);
  const warned = [...escWarned], low = document.querySelectorAll("#escHud .eh.low").length;
  es[0].hp = es[0].maxHp * 0.1; stepN(60);
  islands = isl0; toast = toast0;
  return { errs, speed, warned, low, again: [...escWarned], toasted: said.join(" | ") };
});
check(sprint.errs.every(e => e < 200), `at full sail (${sprint.speed}) both escorts stay within 200 px of their slots (${sprint.errs})`);
check(sprint.warned.join() === "1" && sprint.low === 1 && sprint.again.join() === "1", `a hull under ${35}% warns once for that escort only (${sprint.warned} / ${sprint.low} red chip / ${sprint.again})`);
check(/Escort 1 is badly hurt/.test(sprint.toasted), `the warning reads "${sprint.toasted}"`);

console.log("Stances");
const stanceRows = await ev(() => {
  const rows = {};
  for (const stance of ["active", "normal", "passive"]) {
    rows[stance] = {};
    for (const kind of ["far", "near", "hunter", "attacker"]) {
      const es = sailOut([cfg("s1", { stance })], 4), e = es[0];
      const fw = a => ({ x: player.x + Math.cos(a) * 600, y: player.y + Math.sin(a) * 600 });
      let d;
      if (kind === "far") d = dummy(fw(0).x, fw(0).y);                       // 600 from the flagship, ~700 from the escort, idle
      else if (kind === "near") d = dummy(e.x + Math.cos(Math.PI / 2) * 230, e.y + 230);   // close beside the escort, idle
      else if (kind === "hunter") d = dummy(fw(0.5).x, fw(0.5).y, player);   // hunting the flagship, 600 away
      else d = dummy(e.x + 260, e.y + 120, e);                                 // bearing down on the escort
      if (kind === "attacker") { d.angry = 1e6; }
      let tgt = false, fired = false, dbg = null; for (let i = 0; i < 600; i++) { stepN(1); if (e.target === d) tgt = true; if (!fired && balls.some(b => b.owner === e)) fired = true; if (kind === "attacker") d.target = e; if (i === 40) dbg = { dl: Math.round(dist(d, player)), dtP: d.target === player, host: isHostile(e, d), ign: ignoring(e, d, S.time.now / 1000), range: e.range, angry: d.angry, alive: d.alive, inSafeP: inSafe(player), dock: docked, rt: e.retarget }; }
      rows[stance][kind] = { tgt, hit: fired, dbg };
    }
  }
  return rows;
});
const want = { active: { far: 1, near: 1, hunter: 1, attacker: 1 }, normal: { far: 0, near: 1, hunter: 1, attacker: 1 }, passive: { far: 0, near: 0, hunter: 0, attacker: 1 } };
for (const st of ["active", "normal", "passive"]) {
  const got = Object.fromEntries(Object.entries(stanceRows[st]).map(([k, v]) => [k, v.tgt ? 1 : 0]));
  check(JSON.stringify(got) === JSON.stringify(want[st]), `${st}: engages ${JSON.stringify(got)} (far idle, near idle, hunting the flagship, bearing down on it)${JSON.stringify(got) === JSON.stringify(want[st]) ? "" : " " + JSON.stringify(stanceRows[st].hunter.dbg)}`);
}
// active still picks the far idle ship but no longer leaves its station (ESCORT_LEASH) to reach gun range, so it is not asked to fire there
check(stanceRows.active.near.hit && stanceRows.normal.near.hit && stanceRows.passive.attacker.hit && !stanceRows.passive.near.hit && !stanceRows.normal.far.hit, `and only the engaged ones fire (${JSON.stringify(Object.fromEntries(Object.entries(stanceRows).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([q, x]) => [q, x.hit ? 1 : 0]))])))})`);
// #121 / #143: a Normal escort turns down a ship far above it; no stance starts on the Navy, even at two Wanted stars; Active still goes for a strong
// pirate; a Navy ship that hit it is fair
const care = await ev(() => {
  const rows = {};
  for (const [name, stance, tweak] of [["strongN", "normal", d => { d.threatL = 40; }], ["strongA", "active", d => { d.threatL = 40; }], ["navyN", "normal", d => { d.faction = "navy"; }],
    ["navyA", "active", d => { d.faction = "navy"; }], ["navyWantedA", "active", d => { d.faction = "navy"; heat = 40; }],
    ["navyHurtN", "normal", d => { d.faction = "navy"; }], ["navyHurtA", "active", d => { d.faction = "navy"; }], ["weakN", "normal", () => {}]]) {
    const es = sailOut([cfg("s1", { stance })], 4), e = es[0], d = dummy(e.x, e.y + 230), hurt = name.startsWith("navyHurt"); d.angry = 0; tweak(d);
    if (hurt) { d.angry = 1e6; d.target = e; } else Object.defineProperty(d, "target", { get: () => null, set() {} });   // an idle ship: nothing may point it at anyone
    let tgt = false;
    for (let i = 0; i < 200; i++) { stepN(1); if (e.target === d) tgt = true; if (hurt) d.target = e; }
    rows[name] = tgt ? 1 : 0; heat = 0;
  }
  return rows;
});
check(JSON.stringify(care) === JSON.stringify({ strongN: 0, strongA: 1, navyN: 0, navyA: 0, navyWantedA: 0, navyHurtN: 1, navyHurtA: 1, weakN: 1 }), `Normal avoids a far stronger ship; no stance starts on the Navy, even when Wanted; Active still goes; a Navy ship attacking it is fair (${JSON.stringify(care)})`);
const retreat = await ev(() => {
  const es = sailOut([cfg("s4", { stance: "passive" })], 4), e = es[0];
  const d = dummy(e.x + 300, e.y, e); d.angry = 1e6; e.hp = e.maxHp * 0.2;
  let far = 0; for (let i = 0; i < 600; i++) { stepN(1); d.target = e; far = Math.max(far, dist(e, player)); }
  return { retreat: !!e.retreat, far: Math.round(far), now: Math.round(dist(e, player)) };
});
check(retreat.retreat && retreat.far < 450, `a hurt passive escort keeps to the flagship (never more than ${retreat.far} px off, now ${retreat.now})`);

console.log("Friendly fire and being a target");
const ff = await ev(() => {
  const es = sailOut([cfg("s1"), cfg("s3")], 5), [a, b] = es, rs = {};
  const ball = (x, y, extra) => { const o = { spr: S.add.image(x, y, "ball"), x, y, vx: 0, vy: 0, life: 1, life0: 1, dmg: 10, burn: 0, chain: false, ...extra }; balls.push(o); return o; };
  const h0 = a.hp; ball(a.x, a.y, { fromPlayer: true, owner: player }); stepN(3); rs.playerShotThrough = a.hp === h0;
  ball(a.x, a.y, { fromPlayer: false, friendly: true, owner: b }); stepN(3); rs.escortShotThrough = a.hp === h0;
  const foe = dummy(a.x + 900, a.y), hp0 = player.hp; ball(player.x, player.y, { fromPlayer: false, friendly: true, owner: a }); stepN(3); rs.noHitOnFlagship = player.hp === hp0;
  ball(a.x, a.y, { fromPlayer: false, owner: foe }); stepN(3); rs.foeHits = a.hp < h0;
  ball(foe.x, foe.y, { fromPlayer: false, friendly: true, owner: a }); stepN(3); rs.escortHitsFoe = foe.hp < foe.maxHp;
  // a blast from the player's own powder crit leaves them alone
  const hb = b.hp; powderBlast(dummy(b.x + 50, b.y)); rs.blastSpares = b.hp === hb;
  return rs;
});
check(ff.playerShotThrough && ff.escortShotThrough && ff.noHitOnFlagship, "the flagship's and the escorts' shot pass through their own side");
check(ff.foeHits && ff.escortHitsFoe, "an enemy's shot hurts an escort, and an escort's shot hurts an enemy");
check(ff.blastSpares, "the player's powder-magazine blast spares the escorts");
const tgt = await ev(() => {
  const es = sailOut([cfg("s3")], 5), e = es[0], rs = {};
  const far = { x: player.x + 3000, y: player.y }; Object.assign(e, { x: far.x, y: far.y }); e.spr.setPosition(far.x, far.y);
  heat = 40; if (typeof noviceTick === "function") noviceTick();   // the Navy shoots only from two stars (#120)
  for (const fac of ["pirate", "navy"]) { const o = pin(makeEnemy(S, far.x + 250, far.y, 3, fac, "brig")); o.retarget = 0; rs[fac] = pickTarget(o, S.time.now / 1000) === e; o.alive = false; o.spr.destroy(); o.badge.destroy(); enemies.splice(enemies.indexOf(o), 1); }
  const m = makeEnemy(S, far.x + 250, far.y, 3, "merchant", "fluyt"); rs.merchantSafe = !isHostile(e, m) && !isHostile(m, e);
  rs.noBatteries = !isHostile(e, { alive: true, fixed: true, faction: "pirate", x: 0, y: 0 });
  rs.notPlayer = !isHostile(e, player) && !isHostile(player.fleet || e, e);
  return rs;
});
check(tgt.pirate && tgt.navy, "pirates and the Navy shoot at an escort that is the nearest hull");
check(tgt.merchantSafe && tgt.noBatteries && tgt.notPlayer, "escorts leave merchants and shore batteries alone, and the flagship is never their enemy");

console.log("Prizes and the bounty stay the captain's");
const prize = await ev(() => {
  const es = sailOut([cfg("s4")], 5), e = es[0], p = dummy(e.x + 200, e.y), sunk0 = save.sunk, gold0 = save.gold, st0 = streak, n0 = crates.length;
  p.loot = 100; hurt(p, 1e9, 0, e, null); stepN(5);
  const c = crates[crates.length - 1];
  return { crate: crates.length - n0, value: c && c.value, sunk: save.sunk - sunk0, gold: save.gold - gold0, streak: streak - st0 };
});
check(prize.crate === 1 && prize.value === 100 && prize.sunk === 0 && prize.gold === 0 && prize.streak === 0, `a ship an escort sinks leaves its whole 100 loot afloat for you; no bounty, streak or kill count (${JSON.stringify(prize)})`);
const boss = await ev(() => {
  save.campaign = { ...save.campaign, bounty: 1 }; const es = sailOut([cfg("s4")], 5), e = es[0]; clearBoss();
  const b = pin(makeEnemy(S, e.x + 200, e.y, 5, "pirate", "brig")); b.boss = "carey"; bossShip = b; bossHitAt = -1e9; const gold0 = save.gold, claimed = save.campaign.bounty;
  hurt(b, 1e9, 0, e, null); stepN(5);
  return { gold: save.gold - gold0, bounty: save.campaign.bounty - claimed };
});
check(boss.gold === 0 && boss.bounty === 0, "a bounty ship sunk by the escorts alone pays nothing: the captain has to take part (js/campaign.js ASSIST_MS)");

console.log("Sunk, damaged, and the repair bill");
await boot(saveWith({ gold: 1000, escorts: [cfg("s1"), cfg("s3"), cfg("s4")] }));
await rig();
const bill = await ev(() => {
  depart(); setSail(); stepN(3);
  const [a, b, c] = escortLive.map(x => x.e), pirate = dummy(player.x + 900, player.y);
  const names = [a.allyName, b.allyName]; const g0 = save.gold;
  hurt(a, 1e9, 0, pirate, null);              // the sloop: free hull, sunk fee min 30
  hurt(b, 1e9, 0, pirate, null);              // the schooner (400): sunk 15% = 60
  c.hp = c.maxHp * 0.5;                        // the frigate (6000): half the hull = 5% of 6000 = 300
  stepN(240);
  const gone = { dead: !a.alive && !b.alive, c: c.alive, targeted: pirate.target === a || pirate.target === b, fighting: a.target === null && b.target === null, inEnemies: (fleets.find(x => x.type === "escort") || { ships: [] }).ships.some(x => x === a || x === b) };
  dock("return");
  return { gone, paid: g0 - save.gold, report: escortReport && { paid: escortReport.paid, lost: escortReport.lost }, owed: save.escorts.map(e => e.owed), ids: save.escorts.map(e => e.id), fleet: save.fleet.map(y => y.id), live: escortLive.length, names };
});
check(bill.gone.dead && bill.gone.c && !bill.gone.inEnemies && !bill.gone.targeted, `a sunk escort leaves the battle for good (not targeted, out of the fleet) ${JSON.stringify(bill.gone)}`);
check(bill.paid === 30 + 60 + 300 && bill.owed.every(o => o === 0), `the bill after the sortie: sunk sloop 30, sunk schooner 60, frigate half-damaged 300 = ${bill.paid} gold`);
check(bill.report && bill.report.paid === 390 && bill.report.lost.length === 2, "the ledger reports the bill and who was lost");
check(bill.ids.join() === "s1,s3,s4" && bill.fleet.length === 4 && bill.live === 0, "nothing is lost for ever: ships, slots and guns all still there");
check(/390 gold in repairs/.test(await ev(() => { renderPort(); return document.getElementById("escRep").innerText; })), "the ledger shows last sortie's bill");
r = await ev(() => { document.getElementById("sail").click(); stepN(3); return { n: enemies.filter(e => e.ally && e.alive).length, full: enemies.filter(e => e.ally).every(e => e.hp === e.maxHp) }; });
check(r.n === 3 && r.full, `the next sortie sails all three again, hulls full ${JSON.stringify(r)}`);
const poor = await ev(() => {
  dock("return"); save.gold = 10; save.escorts = save.escorts.map(e => e.id === "s3" ? { ...e, owed: 0 } : e); persist(); setSail(); stepN(3);
  const b = escortLive.find(x => x.e.cls === "schooner").e; hurt(b, 1e9, 0, dummy(b.x + 500, b.y), null); stepN(200);
  dock("return");
  const owed = save.escorts.find(e => e.id === "s3").owed, gold = save.gold; renderPort();
  setSail(); stepN(2); const sails = escortLive.map(x => x.e.cls);
  dock("return"); tab = 2; renderPort();
  return { owed, gold, sails, text: document.getElementById("shead").innerText };
});
check(poor.gold === 0 && poor.owed === 50 && poor.sails.join() === "sloop,frigate", `short of gold the rest stays owed (${poor.owed}) and that escort waits in port; the others sail (${poor.sails})`);
check(/Owes 50 gold/.test(poor.text), "the ledger asks for the 50 gold");
await ev(() => { dock("return"); save.gold = 500; renderPort(); });
await page.waitForTimeout(500);
await ev(() => { tab = 2; renderPort(); });
await page.click('#shead [data-act="escPay"]');
r = await ev(() => { setSail(); stepN(2); return { gold: save.gold, live: escortLive.map(x => x.e.cls).sort().join() }; });
check(r.gold <= 450 + 400 && /schooner/.test(r.live) && r.live.split(",").length === 3, `pay the debt and it sails again (${r.live})`);

console.log("The flagship goes down");
const sunkFlag = await ev(() => { dock("return"); save.gold = 5000; persist(); setSail(); stepN(3); const p = openAt(5, 700); park(p); player.maxHp = 100; player.hp = 1; depart();
  hurt(player, 50, 0, dummy(player.x + 200, player.y)); return { sunk: !player.alive }; });
await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW }).catch(() => {});
await ev(() => { if (!docked) { stepN(200); } });
check(sunkFlag.sunk && await ev(() => docked), "the flagship sunk with escorts at sea ends in the harbor ledger as ever");
check(await ev(() => escortLive.length === 0 && save.escorts.every(e => e.owed >= 0)), "and the escorts were settled with it");
console.log("The daily sea and seeded runs sail alone");
await boot(saveWith({ escorts: [cfg("s1"), cfg("s3")] }));
await rig();
const solo = await ev(() => {
  const rs = {};
  depart(); setSail(); stepN(2); rs.before = enemies.filter(e => e.ally).length;
  if (titleOpen) closeTitle();
  startRun("daily"); stepN(3); rs.daily = { allies: enemies.filter(e => e.ally).length, live: escortLive.length, esc: save.escorts.length }; runLeave();
  setSail(); stepN(2); rs.after = enemies.filter(e => e.ally).length;
  startRun("seed", 4242); stepN(3); rs.seed = enemies.filter(e => e.ally).length; runLeave();
  rs.kept = save.escorts.length;
  return rs;
});
check(solo.before === 2 && solo.daily.allies === 0 && solo.daily.live === 0 && solo.seed === 0, `the real sortie has ${solo.before} escorts; the daily sea has ${solo.daily.allies} and a seeded run ${solo.seed}`);
check(solo.after === 2 && solo.kept === 2, "back on the real sea they sail again, and the daily run never touched the saved slots");

console.log("Old saves");
await boot({ v: 2, gold: 120, ship: "sloop", hull: 2, bow: ["six"], left: ["six"], right: ["six"], sunk: 3 });
check(await ev(() => Array.isArray(save.escorts) && save.escorts.length === 0 && save.gold === 120), "a save from before escorts loads with none, everything else intact");
check(await ev(() => document.getElementById("tabs").hidden), "and the tabs stay out of the way until bounty 1");

console.log("Chart and edge marks");
await boot(saveWith({ escorts: [cfg("s3"), cfg("s4")] }));
await rig();
const marks = await ev(() => {
  const es = sailOut(save.escorts, 5), rs = {};
  clearSea(); deployEscorts();
  const e = escortLive[0].e; Object.assign(e, { x: player.x + 1100, y: player.y }); e.spr.setPosition(e.x, e.y); stepN(2);
  const M = mini.width, k = M / W, calls = { ally: [], hostile: 0 }, oA = window.miniAlly, oS = window.miniShip;
  window.miniAlly = (...a) => { calls.ally.push([Math.round(a[1]), Math.round(a[2])]); return oA(...a); };
  window.miniShip = (c, s, ...a) => { if (s.ally) calls.hostile++; return oS(c, s, ...a); };
  drawMini(); window.miniAlly = oA; window.miniShip = oS;
  rs.kind = shipKind(e); rs.calls = calls; rs.at = [Math.round(e.x * k), Math.round(e.y * k)]; rs.n = escortLive.length;
  const cv = document.createElement("canvas"); cv.width = cv.height = 60; const g = cv.getContext("2d"); oA(g, 30, 30, 0, 3, 0);   // the mark itself, big enough to read its colours
  const q = g.getImageData(0, 0, 60, 60).data; rs.mint = 0; for (let i = 0; i < q.length; i += 4) if (q[i + 1] > 220 && q[i] < 110 && q[i + 2] > 130 && q[i + 2] < 200) rs.mint++;
  const v = S.cameras.main.worldView, cands = edgeCandidates(v, VIEW.cssW / v.width, VIEW.cssH / v.height);
  rs.edge = cands.filter(c => c.ally).length; rs.hostileAsAlly = cands.filter(c => c.o.ally && !c.ally).length;
  updateEdgeMarks(0.05); stepN(2); updateEdgeMarks(0.05);
  rs.boxes = document.querySelectorAll("#edgeMarks .em.ally").length;
  rs.rank = edgeRank({ ally: true, kind: "ship", d: 0, px: 800 }) < edgeRank({ kind: "ship", d: 0, px: 800 });
  rs.howto = STR.en.ht_chart.includes('data-mark="ally"') && STR.zh.ht_chart.includes('data-mark="ally"');
  return rs;
});
check(marks.kind === "ally" && marks.calls.ally.length === marks.n && marks.calls.ally.some(p => p[0] === marks.at[0] && p[1] === marks.at[1]) && marks.calls.hostile === 0 && marks.mint > 100,
  `the chart draws each escort once with the ally mark (mint ${marks.mint} px), never as a threat shape: ${marks.calls.ally.length}/${marks.n} marks, ${marks.calls.hostile} drawn as ships`);
check(marks.edge >= 1 && marks.hostileAsAlly === 0 && marks.boxes === 1, `only the escort that has dropped out of sight gets a mint edge box (${marks.boxes} box, ${marks.edge} candidates)`);
check(marks.rank && marks.howto, "an escort's edge box ranks below the sea's own ships, and the How to play legend explains the mark");
await page.waitForTimeout(500);   // the boxes fade in
await page.screenshot({ path: `${out}/edge-marks.png` });

console.log("Not stuck on rocks");
const rock = await ev(() => {
  const isl = islands.filter(i => dist(i, PORT) > 1500 && i.r > 60).sort((a, b) => b.r - a.r)[0], a = Math.atan2(isl.y - PORT.y, isl.x - PORT.x);
  const P = { x: isl.x - Math.cos(a) * (isl.r + 260), y: isl.y - Math.sin(a) * (isl.r + 260) };   // 130 px off the rock, facing out so astern is the rock
  Object.assign(save, { escorts: [cfg("s3"), cfg("s4")] }); park(P); player.rot = a + Math.PI; depart(); clearSea(); deployEscorts();
  const es = escortLive.map(x => x.e); es.forEach((e, i) => { const q = { x: isl.x + Math.cos(a) * (isl.r + 90 + 70 * i), y: isl.y + Math.sin(a) * (isl.r + 90 + 70 * i) }; Object.assign(e, { x: q.x, y: q.y, rot: a + Math.PI }); e.spr.setPosition(q.x, q.y); });
  let inRock = false; for (let i = 0; i < 60 * 40; i++) { stepN(1); if (islands.some(o => Math.hypot(o.x - es[0].x, o.y - es[0].y) < o.r * 0.9)) inRock = true; }
  const f = fleets.find(x => x.type === "escort");
  return { inRock, err: es.map(e => Math.round(dist(e, player))), left: es.filter(e => !e.fleet).length, r: Math.round(isl.r) };
});
check(!rock.inRock && rock.err.every(d => d < 420) && rock.left === 0, `escorts on the far side of a rock sail round it and rejoin within 40 s (distances ${rock.err}, rock r ${rock.r})`);

await page.screenshot({ path: `${out}/sea.png` });
check(errors.length === 0, `no page errors${errors.length ? " -> " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
if (fails.length) { console.error("\nFAILED:\n" + fails.join("\n")); process.exit(1); }
console.log("\nescorts: all checks passed");
