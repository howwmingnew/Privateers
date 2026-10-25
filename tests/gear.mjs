// Gear in headless Chrome (#38; js/gear-*.js): a sinking drops gear into the bag (a boss always a rare or better), the ledger's Gear page wears and takes
// off parts with Undo and a green-up / red-down compare, the effects reach the sea (hull, speed, turn, hold, armor, aim, ram and brace, wind, powder, heat,
// loot, supply, repair, escorts, the legendary tricks, gun affixes), switching ships carries the gear along, the page fits a 390 x 844 phone, and nothing
// throws. Pure rules are in tests/unit-gear.mjs. Screenshots go to .review/gear/ (not committed).
// Usage: node tests/gear.mjs [url]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const SHOTS = ".review/gear/";
mkdirSync(SHOTS, { recursive: true });
const fails = [], errors = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

const bag = [
  { p: "body", lv: 1, r: 3, il: 3, af: [["hp", 0.13], ["armor", 0.07], ["brace", 0.1]] },
  { p: "sail", lv: 2, r: 1, il: 2, af: [["spd", 0.06]] },
  { p: "prow", lv: 1 },
  { p: "instr", lv: 1, r: 4, il: 3, af: [["view", 0.1], ["aim", 0.1]], lg: 1 },
  { p: "supply", lv: 1, r: 2, il: 3, af: [["repair", 0.3], ["powder", 0.5]] },
  { p: "flag", lv: 1, r: 4, il: 3, af: [["loot", 0.1], ["heat", 0.5]], lg: 1 },
  { p: "sail", lv: 1, r: 4, il: 3, af: [["turn", 0.1], ["tail", 0.3], ["head", 0.3]], lg: 1 },
  { p: "prow", lv: 1, r: 4, il: 3, af: [["ram", 0.18], ["brace", 0.1], ["keep", 0.2]], lg: 1 },
  { p: "body", lv: 1, r: 4, il: 3, af: [["fire", 0.2], ["hp", 0.1]], lg: 1 },
  { p: "body", lv: 1, il: 5 },
];
const storeGuns = [
  { g: "long12", lv: 2, r: 3, il: 3, af: [["gdmg", 0.1], ["grange", 0.1], ["gtype", 0.2]] },
  { g: "six", lv: 1, r: 4, il: 2, af: [["greload", 0.1], ["gdmg", 0.1]], lg: 1 },
  { g: "chain", lv: 1, r: 2, il: 2, af: [["gtype", 0.25], ["grange", 0.1]] },
];
const save = JSON.stringify({ v: 2, gold: 20000, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], ship: "brig", left: [{ g: "six", lv: 1 }, { g: "six", lv: 1 }, null], right: [{ g: "six", lv: 1 }, null, null], store: storeGuns, gear: { worn: {}, bag, mats: 200 } });
await page.goto(url, { waitUntil: "load" });
await page.evaluate(s => { localStorage.clear(); localStorage.setItem("privateers-save-v2", s); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true, shake: false })); }, save);
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 20000 * SLOW });
if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
await page.evaluate(() => { if (!docked) dock("welcome"); });
await page.evaluate(() => setSail());
await page.waitForFunction(() => !docked && !paused, null, { timeout: 10000 * SLOW });
await page.evaluate(() => {
  window.think = () => {};   // AI frozen: the test places every ship itself
  window.spawnEnemy = () => null;
  for (const s of enemies.slice()) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); }
  tutorialReset();
  window.__ship = (cls, faction, L = 3, extra = {}) => { const e = makeEnemy(S, 1500, 1500, L, faction, cls); Object.assign(e, { rot: 0, speed: 0, hp: e.maxHp, ring: L, holdSea: true, ...extra }); return e; };   // holdSea: the population manager keeps its hands off
  window.__kill = e => { hurt(e, e.maxHp * 10, 0, player, null); };
  window.__wear = (part, it) => { save = { ...save, gear: { ...save.gear, worn: { ...save.gear.worn, [part]: it } } }; applyPlayerStats(true); };
  window.__bare = () => { save = { ...save, gear: { ...save.gear, worn: {} } }; applyPlayerStats(true); };
  window.__bag = i => save.gear.bag[i];
});
const wait = ms => page.waitForTimeout(ms * SLOW);
const shot = async name => { await page.screenshot({ path: SHOTS + name + ".png" }); };

console.log("Strings, sound and wiring exist");
check(await page.evaluate(() => ["gearTitle", "gearHint", "gr_4", "ga_ram", "gleg_scatter", "gln_prow", "gGot", "gCmp"].every(k => STR.en[k] && STR.zh[k])), "the gear strings exist in both languages");
check(await page.evaluate(() => typeof gx === "function" && typeof gxHurt === "function" && typeof gearAct === "function" && document.getElementById("gear")), "the gear modules and the ledger page are loaded");
check(await page.evaluate(() => save.gear.bag.length === 10 && save.store[0].r === 3 && save.gear.mats === 200), "the save's gear came through loading untouched");

console.log("Drops: a sinking puts gear in the bag, saved at once; a boss never drops less than rare");
await page.evaluate(() => { window.gxRoll = () => 0; window.__n0 = save.gear.bag.length; window.E = __ship("sloop", "pirate", 3); __kill(E); });
await wait(300);
let r = await page.evaluate(() => ({ n: save.gear.bag.length - __n0, last: save.gear.bag[save.gear.bag.length - 1], disk: JSON.parse(localStorage.getItem("privateers-save-v2")).gear.bag.length, now: save.gear.bag.length }));
check(r.n === 1 && r.last.p === "prow" && !r.last.r, `an ordinary kill (rolls fixed low) drops a common piece into the bag (${JSON.stringify(r.last)})`);
check(r.disk === r.now, "the drop is written to the save at once");
check(await page.evaluate(() => (__bag(10).il || 1) <= gearTierOf(save.ship)), "its item level is within the hull's tier");
await page.evaluate(() => { window.gxRoll = () => 0.99; window.__n1 = save.gear.bag.length + save.store.length; window.B = __ship("brig", "pirate", 4, { boss: "ned" }); __kill(B); });
await wait(300);
r = await page.evaluate(() => { const all = [...save.gear.bag, ...save.store].slice(__n1 - 0); return { n: save.gear.bag.length + save.store.length - __n1, rars: all.map(x => x.r | 0) }; });
check(r.n >= 1 && r.rars.some(x => x >= 2), `a bounty captain always drops a rare or better (${r.rars})`);
await page.evaluate(() => { window.gxRoll = () => 0.99; window.__n2 = save.gear.bag.length + save.store.length; const e = __ship("fluyt", "merchant", 2); __kill(e); });
check(await page.evaluate(() => save.gear.bag.length + save.store.length === __n2), "a roll above the chance drops nothing");
await page.evaluate(() => { delete window.gxRoll; });
// a full bag breaks the drop down instead of blocking
await page.evaluate(() => { window.gxRoll = () => 0; const keep = save.gear; save = { ...save, gear: { ...keep, bag: Array.from({ length: GEAR_BAG_MAX }, () => ({ p: "flag", lv: 1 })) } }; window.__m0 = save.gear.mats; const e = __ship("sloop", "pirate", 3); __kill(e); window.__keep = keep; });
r = await page.evaluate(() => ({ bag: save.gear.bag.length, mats: save.gear.mats - __m0 }));
check(r.bag === 60 && r.mats >= 1, `a full bag keeps its size and the drop turns into fittings (+${r.mats})`);
await page.evaluate(() => { delete window.gxRoll; save = { ...save, gear: window.__keep }; });
check(await page.evaluate(() => { save = { ...save, gear: { ...save.gear, bag: save.gear.bag.slice(0, 10) } }; return save.gear.bag.length === 10; }), "(test bag restored)");

console.log("The Gear page: slots, picking a spare, wearing it, compare, Undo, take off");
await page.evaluate(() => { dock("welcome"); });
await wait(1000);   // the ledger settles (its sheet scrolls to the top and the first toast leaves) before the first tap
check(await page.evaluate(() => document.querySelectorAll("#gear .gslot").length === 7), "seven part slots are shown");
await page.click('#gear [data-act="gbag"][data-i="0"]');
check(await page.evaluate(() => !!document.querySelector("#gear .gcard") && document.querySelector('#gear [data-act="gslot"][data-p="body"]').classList.contains("dest") && !document.querySelector('#gear [data-act="gslot"][data-p="sail"]').classList.contains("dest")), "picking a spare outlines only its own slot and opens its card");
check(await page.evaluate(() => /▲/.test(document.querySelector("#gear .cmp").innerText) && !!document.querySelector("#gear .gcard.r3")), "the card compares with what is worn (▲ gains) and carries the epic edge");
await shot("gear-pick-compare");
const hp0 = await page.evaluate(() => player.maxHp);
await page.click('#gear [data-act="gslot"][data-p="body"]');
r = await page.evaluate(() => ({ worn: save.gear.worn.body && save.gear.worn.body.r, bag: save.gear.bag.length, hp: player.maxHp, base: yardVal("hull"), note: document.querySelector("#gear .gnote")?.innerText || "" }));
check(r.worn === 3 && r.bag === 9, "tapping its slot wears it and the spare leaves the bag");
check(near(r.hp, Math.round(r.base * (1 + 0.13 + 0.09)), 0.005) && r.hp > hp0, `the hull grows with the worn part (${hp0} to ${r.hp}, expected ${Math.round(r.base * 1.22)})`);
check(/復原|Undo/.test(r.note), "the move says what happened and offers Undo");
await page.click('#gear [data-act="gearundo"]');
r = await page.evaluate(() => ({ worn: save.gear.worn.body, bag: save.gear.bag.length, hp: player.maxHp }));
check(!r.worn && r.bag === 10, "Undo puts the piece back");
await page.evaluate(() => applyPlayerStats(true));
await page.click('#gear [data-act="gbag"][data-i="0"]');
await page.click('#gear [data-act="gslot"][data-p="body"]');
await page.click('#gear [data-act="gbag"][data-i="7"]');   // the legendary body, to swap with the epic
await page.click('#gear [data-act="gslot"][data-p="body"]');
r = await page.evaluate(() => ({ worn: save.gear.worn.body, bagHasEpic: save.gear.bag.some(x => x.p === "body" && x.r === 3) }));
check(r.worn && r.worn.lg === 1 && r.bagHasEpic, "wearing over a worn piece swaps: the old one is back in the bag");
await page.click('#gear [data-act="gslot"][data-p="body"]');
check(await page.evaluate(() => !!document.querySelector("#gear .gcard.r4 .afx .leg")), "tapping a worn piece opens its card with the legendary line");
await shot("gear-legendary-card");
await page.click('#gear [data-act="gunequip"]');
check(await page.evaluate(() => !save.gear.worn.body && save.gear.bag.length === 10), "Take off sends it back to the bag");
await page.click('#gear [data-act="gbag"][data-i="8"]');   // an item level 5 spare: too big for a tier-3 brig
check(await page.evaluate(() => { const it = save.gear.bag[8]; return gearIl(it) === 5 && document.querySelector('#gear [data-act="gequip"]').disabled && /需要船級|tier/.test(document.querySelector("#gear .gcard .hint-s").innerText); }), "an item level 5 spare cannot be worn on a tier-3 hull, and the card says why");

console.log("Lock, break down, batch, re-roll, upgrade (including five levels)");
await page.click('#gear [data-act="glock"]');
check(await page.evaluate(() => save.gear.bag[8].lk === 1 && document.querySelector('#gear [data-act="gscrap"]').disabled), "Lock sticks and disables Break down");
await page.click('#gear [data-act="glock"]');
const m0 = await page.evaluate(() => save.gear.mats);
await page.click('#gear [data-act="gscrap"]');
r = await page.evaluate(() => ({ bag: save.gear.bag.length, mats: save.gear.mats }));
check(r.bag === 9 && r.mats > m0, `Break down removes the piece and pays fittings (${m0} to ${r.mats})`);
await page.evaluate(() => { save = { ...save, gear: { ...save.gear, bag: save.gear.bag.concat([{ p: "flag", lv: 1, lk: 1 }]) } }; renderPort(); });
await page.click('#gear [data-act="gbatch"][data-r="0"]');
r = await page.evaluate(() => ({ plain: save.gear.bag.filter(x => !(x.r | 0) && !x.lk).length, locked: save.gear.bag.some(x => x.lk) }));
check(r.plain === 0 && r.locked, "the batch breaks down every unlocked common piece and spares the locked one");
await page.evaluate(() => { window.__ei = save.gear.bag.findIndex(x => x.p === "body" && x.r === 3); });
await page.click(`#gear [data-act="gbag"][data-i="${await page.evaluate(() => __ei)}"]`);   // the epic body
const rr0 = await page.evaluate(() => ({ af: save.gear.bag[__ei].af.map(a => a[0]).join(), mats: save.gear.mats, gold: save.gold }));
await page.click('#gear [data-act="greroll"][data-k="1"]');
r = await page.evaluate(() => ({ af: save.gear.bag[__ei].af.map(a => a[0]).join(), rr: save.gear.bag[__ei].rr, mats: save.gear.mats, gold: save.gold }));
check(r.rr === 1 && r.af.split(",")[1] !== rr0.af.split(",")[1] && r.af.split(",")[0] === rr0.af.split(",")[0] && r.mats < rr0.mats && r.gold < rr0.gold, `re-rolling one affix changes only it and costs fittings and gold (${rr0.af} to ${r.af})`);
const c1 = await page.evaluate(() => document.querySelector('#gear [data-act="greroll"]').innerText);
await page.click('#gear [data-act="greroll"][data-k="1"]');
check(await page.evaluate(c => save.gear.bag[__ei].rr === 2 && document.querySelector('#gear [data-act="greroll"]').innerText !== c, c1), "the re-roll price climbs with each re-roll");
const g0 = await page.evaluate(() => ({ gold: save.gold, lv: save.gear.bag[__ei].lv }));
await page.click('#gear [data-act="gpup5"]');   // the first tap arms the button (#110): nothing is spent yet
check(await page.evaluate(g => save.gold === g.gold && document.querySelector('#gear [data-act="gpup5"]').hasAttribute("data-armed"), g0), "the first tap on Upgrade x5 only arms it");
await page.waitForTimeout(450);
await page.click('#gear [data-act="gpup5"]');
r = await page.evaluate(() => ({ lv: save.gear.bag[__ei].lv, gold: save.gold, plan: gearUpPlan({ ...save.gear.bag[__ei], lv: 1 }, 1e9, 5) }));
check(r.lv === 6 && g0.gold - r.gold === r.plan.cost, `"Upgrade 5 levels" raises a worn part five levels for the total price (${r.lv}, ${g0.gold - r.gold} gold)`);

console.log("Guns: rarity edge, the card with affixes, lock and re-roll, compare with a mounted gun, upgrade keeps the gear fields");
await page.evaluate(() => { cancelGearPick(); deckSel = { side: "bow", i: 0 }; renderPort(); document.getElementById("ctx").scrollIntoView(); });   // a port picked: its panel lists the store
check(await page.evaluate(() => document.querySelectorAll("#ctx .cand .slot.r3, #ctx .cand .slot.r4").length === 2), "stored guns are edged in their rarity colour");
await page.click('#ctx [data-act="gprev"][data-side="store"][data-i="0"]');
check(await page.evaluate(() => !!document.querySelector("#ctx .candcard .gcard.r3 .afx") && !!document.querySelector('#ctx .candcard [data-act="glock"]') && !!document.querySelector("#ctx .candcard .cmp") && /▲|▼/.test(document.querySelector("#ctx .candcard .cmp").innerText)), "a stored gun's card lists its affixes, offers Lock and compares with a mounted gun");
await shot("gear-gun-card");
await page.click('#ctx .candcard [data-act="gup"]');
check(await page.evaluate(() => save.store[0].lv === 3 && save.store[0].r === 3 && save.store[0].af.length === 3), "upgrading a gun keeps its rarity and affixes");
await page.click('#ctx .candcard [data-act="glock"][data-w="gun"]');
check(await page.evaluate(() => save.store[0].lk === 1), "a gun can be locked");
await page.click('#ctx .candcard [data-act="glock"][data-w="gun"]');
await page.click('#ctx .candcard [data-act="greroll"][data-k="0"]');
check(await page.evaluate(() => save.store[0].rr === 1), "a gun's affix can be re-rolled");
await page.click('#ctx .candcard [data-act="gscrap"][data-w="gun"]');
check(await page.evaluate(() => save.store.length === 2 && save.store[0].g === "six" && !candSel && !!deckSel), "a stored gun can be broken down (the picked port stays picked)");
await page.evaluate(() => { cancelGunPick(); });
check(await page.evaluate(() => gunSig(["six!", null, "long12", "fire!"]) === "s!-lf!" && gunSig(["six", "carronade"]) === "sc"), "a legendary gun has its own picture key; plain guns keep theirs");
await page.evaluate(() => { save = { ...save, left: [{ g: "six", lv: 4, r: 4, il: 2, af: [["gdmg", 0.1], ["greload", 0.1]], lg: 1 }, { g: "long12", lv: 1, r: 2, il: 2, af: [["grange", 0.1], ["gdmg", 0.1]] }, { g: "chain", lv: 1 }] }; renderPort(); });
await wait(300);
check(await page.evaluate(() => document.querySelector("#deck .dk-left .slot.r4") && document.querySelector("#deck .dk-left .slot.r2") && document.querySelector("#deck canvas.dk-art")), "the gun deck edges mounted guns in their rarity colour and draws the legendary one with its inlay");
await page.evaluate(() => { document.getElementById("deck").scrollIntoView(); });
await shot("gear-deck");
await page.click('#deck .dk-left .slot.r4');
await shot("gear-legendary-gun-card");
await page.evaluate(() => { cancelGunPick(); });

console.log("Effects at sea");
await page.evaluate(() => { setSail(); });   // the ledger paused the game: back to sea, and nobody else sails
await page.waitForFunction(() => !docked && !paused, null, { timeout: 10000 * SLOW });
await page.evaluate(() => { for (const s of enemies.slice()) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); } window.E = __ship("sloop", "pirate", 3); });
await page.evaluate(() => { __bare(); setSailLevel && setSailLevel(0); });
const base = await page.evaluate(() => ({ hp: player.maxHp, spd: player.maxSpeed, turn: player.turnRate, cap: player.cap }));
await page.evaluate(() => { __wear("body", { p: "body", lv: 1, r: 1, il: 3, af: [["hp", 0.1]] }); __wear("sail", { p: "sail", lv: 1, r: 2, il: 3, af: [["spd", 0.08], ["turn", 0.1]] }); __wear("supply", { p: "supply", lv: 1, r: 1, il: 3, af: [["cargo", 0.2]] }); });
r = await page.evaluate(() => ({ hp: player.maxHp, spd: player.maxSpeed, turn: player.turnRate, cap: player.cap }));
check(near(r.hp / base.hp, 1 + 0.1 + 0.09, 0.01), `hull: ${base.hp} to ${r.hp} (affix 10% + base 3% x item level 3)`);
check(near(r.spd / base.spd, 1 + 0.08 + 0.015 * 3, 0.01), `sails: top speed x${(r.spd / base.spd).toFixed(3)} (the 8% affix plus the 4.5% base of the same piece)`);
check(near(r.turn / base.turn, 1.1, 0.01), `sails: turn rate x${(r.turn / base.turn).toFixed(3)}`);
check(near(r.cap / base.cap, 1 + 0.2 + 0.12, 0.01), `supply hold: cargo x${(r.cap / base.cap).toFixed(3)} (the 20% affix plus the 12% base)`);
await page.evaluate(() => { __bare(); __wear("body", { p: "body", lv: 1, r: 1, il: 1, af: [["armor", 0.2]] }); player.hp = player.maxHp; });
r = await page.evaluate(() => { const a = player.hp; hurt(player, 100, 0, E, { vx: 0, vy: 1, life: 1, life0: 1 }); return a - player.hp; });
check(near(r, 80, 0.01), `armor 20%: a 100-damage ball does ${r.toFixed(1)}`);
r = await page.evaluate(() => { const a = player.hp; hurt(player, 100, 0, null, null); return a - player.hp; });
check(near(r, 100, 0.01), "armor does not blunt a disaster (no ball)");
await page.evaluate(() => { __bare(); __wear("instr", { p: "instr", lv: 1, r: 1, il: 1, af: [["aim", 0.4]] }); window.T = __ship("brig", "pirate", 3); T.hp = T.maxHp = 1e6; });
r = await page.evaluate(() => { const a = T.hp; hurt(T, 100, 0, player, { vx: 0, vy: 1, life: 0, life0: 1, fromPlayer: true }); const far = a - T.hp; const b = T.hp; hurt(T, 100, 0, player, { vx: 0, vy: 1, life: 1, life0: 1, fromPlayer: true }); return [far, b - T.hp]; });
check(near(r[0], 140, 0.01) && near(r[1], 100, 0.01), `aim 40%: a ball at full range hits for ${r[0].toFixed(0)}, a point-blank one for ${r[1].toFixed(0)}`);
await page.evaluate(() => { __bare(); __wear("prow", { p: "prow", lv: 1, r: 1, il: 1, af: [["ram", 0.5], ["brace", 0.4], ["keep", 0.3], ["jolt", 0.5]] }); });
r = await page.evaluate(() => {
  const one = (gear) => {
    __bare(); if (gear) __wear("prow", { p: "prow", lv: 1, r: 1, il: 1, af: [["ram", 0.5], ["brace", 0.4], ["keep", 0.3], ["jolt", 0.5]] });
    const e = __ship("brig", "pirate", 3); e.hp = e.maxHp = 1000; Object.assign(e, { x: 2000, y: 2000, vx: 0, vy: 0, speed: 100 });
    Object.assign(player, { x: 1990, y: 2000, vx: 200, vy: 0, hp: player.maxHp, speed: 200, alive: true }); player.crashBook = new Map(); e.crashBook = new Map();
    const eh = e.hp, ph = player.hp; crashShips(player, e, 1, 0);
    return { dealt: eh - e.hp, taken: ph - player.hp, ps: player.speed, es: e.speed };
  };
  const plain = one(false), geared = one(true);
  return { plain, geared };
});
check(r.plain.dealt > 0 && r.geared.dealt / r.plain.dealt > 1.5 && r.geared.dealt / r.plain.dealt < 1.65, `ram +50% (and the base): the other ship takes x${(r.geared.dealt / r.plain.dealt).toFixed(2)} of the collision damage`);
check(near(r.geared.taken / r.plain.taken, 0.6, 0.03) || r.geared.taken < r.plain.taken, `brace 40%: the player takes x${(r.geared.taken / r.plain.taken).toFixed(2)}`);
check(r.geared.ps > r.plain.ps && r.geared.es < r.plain.es, `keep and jolt: the player keeps more speed (${r.geared.ps.toFixed(0)} vs ${r.plain.ps.toFixed(0)}), the rammed ship loses more (${r.geared.es.toFixed(0)} vs ${r.plain.es.toFixed(0)})`);
r = await page.evaluate(() => {
  __bare(); __wear("prow", { p: "prow", lv: 1, r: 4, il: 1, af: [["ram", 0.1], ["keep", 0.1]], lg: 1 });
  const e = __ship("brig", "pirate", 3); Object.assign(e, { x: 2000, y: 2000, vx: 0, vy: 0, speed: 100, chainT: 0 });
  Object.assign(player, { x: 1990, y: 2000, vx: 250, vy: 0, speed: 250, alive: true }); player.crashBook = new Map(); e.crashBook = new Map();
  crashShips(player, e, 1, 0); const fast = e.chainT;
  e.chainT = 0; player.crashBook = new Map(); e.crashBook = new Map(); player.vx = 40; player.speed = 40; crashShips(player, e, 1, 0);
  return { fast, slow: e.chainT };
});
check(r.fast > 0 && !(r.slow > 0), `legendary prow: a hard ram tears the other ship's rigging (${r.fast} s), a gentle one does not`);
// wind, storm
r = await page.evaluate(() => {
  wx.on = true; wx.wind = { dir: 0, strength: 1 }; player.rot = 0; const out = {};
  __bare(); out.tail0 = wxMul(player); player.rot = Math.PI; out.head0 = wxMul(player);
  __wear("sail", { p: "sail", lv: 1, r: 1, il: 1, af: [["tail", 0.5], ["head", 0.5]] }); player.rot = 0; out.tail1 = wxMul(player); player.rot = Math.PI; out.head1 = wxMul(player);
  const e = { rot: 0, isPlayer: false }; out.other = wxMul(e);
  return out;
});
check(near(r.tail1 - 1, (r.tail0 - 1) * 1.5, 0.01) && near(1 - r.head1, (1 - r.head0) * 0.5, 0.01), `wind: following +50% (${r.tail0.toFixed(3)} to ${r.tail1.toFixed(3)}), head wind loss halved (${r.head0.toFixed(3)} to ${r.head1.toFixed(3)})`);
check(near(r.other, r.tail0, 0.001), "other ships feel the plain wind");
r = await page.evaluate(() => { wx.w.storm = 1; wx.calm = false; player.rot = Math.PI / 4; __bare(); const a = wxYaw(player); __wear("instr", { p: "instr", lv: 1, r: 1, il: 1, af: [["storm", 0.5]] }); return [a, wxYaw(player)]; });
check(r[0] !== 0 && near(r[1] / r[0], 0.5, 0.01), "navigation instruments cut the storm's yaw by 50%");
await page.evaluate(() => { wx.on = false; wx.w.storm = 0; });
// powder, heat, loot, supply, repair, view, escorts
r = await page.evaluate(() => {
  __bare(); const e = __ship("brig", "pirate", 3); e.hp = e.maxHp = 1000;
  const ball = { fromPlayer: true, vx: Math.cos(e.rot), vy: Math.sin(e.rot) }, real = Math.random, hits = {};
  const blasts = [];
  const was = window.powderBlast; window.powderBlast = s => { blasts.push(1); };
  Math.random = () => 0.1;   // above 1/12, below 2/12
  powderStrike(e, 10, ball, player); hits.plain = blasts.length;
  __wear("supply", { p: "supply", lv: 1, r: 1, il: 1, af: [["powder", 1]] });
  powderStrike(e, 10, ball, player); hits.geared = blasts.length - hits.plain;
  Math.random = real; window.powderBlast = was;
  return hits;
});
check(r.plain === 0 && r.geared === 1, `the supply hold's powder affix turns a 10% roll into a magazine blast (${JSON.stringify(r)})`);
r = await page.evaluate(() => {
  __bare(); heatReset(); heatAdd(14); const plain = heat; heatReset();
  __wear("flag", { p: "flag", lv: 1, r: 1, il: 1, af: [["heat", 0.5]] }); heatAdd(14); const geared = heat; heatReset(); return [plain, geared];
});
check(r[0] > 0 && near(r[1], r[0] * 0.5, 0.05), `the flag's heat affix halves heat gained (${r[0]} to ${r[1]})`);
r = await page.evaluate(() => {
  const crate = lv => { __bare(); if (lv) __wear("flag", { p: "flag", lv: 1, r: 1, il: 1, af: [["loot", 0.5]] }); const e = __ship("fluyt", "merchant", 3, { loot: 100 }); const c = lootDrop(e, player); return c ? c.value : 0; };
  return [crate(false), crate(true)];
});
check(near(r[1], r[0] * 1.5, 0.02), `the flag's loot affix pays 50% more (${r[0]} to ${r[1]})`);
r = await page.evaluate(() => {
  const plain = supplyStep(50, 100, 0.25, 1e6, 1).hp - 50, geared = supplyStep(50, 100, 0.25, 1e6, 1, 2).hp - 50;
  __bare(); const k0 = gxDockK(); __wear("supply", { p: "supply", lv: 1, r: 4, il: 1, af: [["repair", 0.1], ["cargo", 0.1]], lg: 1 }); const k1 = gxDockK();
  const rp = repairStep(50, 100, 1, false), rg = repairStep(50, 100, 1, false, gearMul("repair"));
  return { plain, geared, k0, k1, rp, rg };
});
check(near(r.geared, r.plain * 2, 0.01) && r.k0 === 1 && r.k1 === 2, "legendary supply hold: a supply station mends twice as fast");
check(r.rg > r.rp, `repair affix: the crew mends faster at sea (${(r.rp - 50).toFixed(2)} to ${(r.rg - 50).toFixed(2)})`);
r = await page.evaluate(() => { __bare(); const a = gearMul("view"); __wear("instr", { p: "instr", lv: 1, r: 1, il: 1, af: [["view", 0.5]] }); return [a, gearMul("view")]; });
check(r[0] === 1 && near(r[1], 1.5, 0.01), `the spyglass widens how far plunder is read and ships are marked (x${r[1]}: 50% affix plus 4% base, at the 50% cap)`);
r = await page.evaluate(() => {
  __bare(); __wear("flag", { p: "flag", lv: 1, r: 4, il: 1, af: [["escDef", 0.4]], lg: 1 });
  const ally = { ally: true, isPlayer: false, hp: 100, maxHp: 100 }, foe = __ship("brig", "pirate", 3);
  const hit = gxHurt(ally, 100, foe, { vx: 0, vy: 1 });
  const t0 = gxRally(); foe.hp = foe.maxHp = 1e6; hurt(foe, 10, 0, player, { vx: 0, vy: 1, life: 1, life0: 1, fromPlayer: true }); const t1 = gxRally();
  return { hit, t0, t1 };
});
check(near(r.hit, 60, 0.01), `the flag's escDef: an escort takes ${r.hit.toFixed(0)} of a 100 hit`);
check(r.t0 === 1 && near(r.t1, 1.3, 0.01), "legendary flag: the first hit on a ship gives the escorts +30% for a while");
r = await page.evaluate(() => {
  __bare(); __wear("body", { p: "body", lv: 1, r: 4, il: 1, af: [["hp", 0.1]], lg: 1 }); player.hp = player.maxHp * 0.3;
  const a = player.hp; hurt(player, player.maxHp * 0.1, 0, E, null); const first = a - player.hp;   // crosses 25%: the steady spell starts
  const b = player.hp; hurt(player, player.maxHp * 0.05, 0, E, null); const second = b - player.hp;
  return { first, second, max: player.maxHp, standing: gxS.stand };
});
check(r.standing && near(r.first, r.max * 0.05, 0.03) && near(r.second, r.max * 0.025, 0.03), "legendary hull: below 25% it steadies once, damage halves for a spell");
r = await page.evaluate(() => {
  __bare(); __wear("instr", { p: "instr", lv: 1, r: 4, il: 1, af: [["view", 0.1]], lg: 1 });
  for (const o of enemies.slice()) { o.alive = false; o.spr.destroy(); o.badge && o.badge.destroy(); enemies.splice(enemies.indexOf(o), 1); }   // only this one is near
  const e = __ship("brig", "pirate", 3, { x: player.x + 200, y: player.y }); e.hp = e.maxHp = 1e6; gxS.markAt = 0; paused = false;
  return new Promise(res => setTimeout(() => { const marked = e.markT > S.time.now / 1000; const a = e.hp; hurt(e, 100, 0, player, { vx: 0, vy: 1, life: 1, life0: 1, fromPlayer: true }); res({ marked, dmg: a - e.hp }); }, 400));
});
check(r.marked && near(r.dmg, 115, 0.02), `legendary instruments: the nearest enemy is marked and takes +15% (${r.dmg.toFixed(1)})`);
r = await page.evaluate(() => {
  __bare(); const hit = (lg) => { const e = __ship("brig", "pirate", 3); e.hp = e.maxHp = 1e6; e.dragT = 0; hurt(e, 1, 0, player, { vx: 0, vy: 1, life: 1, life0: 1, fromPlayer: true, drag: lg ? 1.5 : 0 }); return e.dragT || 0; };
  const a = hit(false), b = hit(true);
  const sp = s => gxSpeedK(s); return { a, b, k: sp({ dragT: 1 }), k0: sp({ dragT: 0 }) };
});
check(r.a === 0 && r.b > 1 && near(r.k, 0.75, 0.001) && r.k0 === 1, "legendary gun: a hit drags the target's speed by 25% for a moment");
await page.evaluate(() => { __bare(); __wear("sail", { p: "sail", lv: 1, r: 4, il: 1, af: [["spd", 0.05]], lg: 1 }); paused = false; player.speed = 100; });
r = await page.evaluate(() => new Promise(res => { gxS.swiftAt = -99; gxS.turned.length = 0; gxS.prevRot = player.rot; let n = 0; const iv = setInterval(() => { player.rot += 0.25; if (++n > 12) { clearInterval(iv); setTimeout(() => res({ k: gxSpeedK(player) }), 100); } }, 40); }));
check(near(r.k, 1.15, 0.001), "legendary sails: a hard turn gives +15% speed for a moment");
// gun affixes
await page.evaluate(() => { __bare(); save = { ...save, left: save.left.map((g, i) => (i === 0 ? { g: "long12", lv: 1, r: 3, il: 3, af: [["gdmg", 0.2], ["grange", 0.1], ["greload", 0.2]] } : g)) }; applyPlayerStats(true); });
r = await page.evaluate(() => { const g = player.guns.left.find(x => x.id === "long12"), plain = GUNS.long12; return { dmg: g.dmg / (plain.dmg * gunLvMul(1) * shipGunK()), range: g.range / plain.range, rate: (60 / plain.rpm) / g.interval }; });
check(near(r.dmg, 1.2 + 0.02 * 2, 0.01) && near(r.range, 1.1, 0.01) && near(r.rate, 1.2, 0.01), `a gun's own affixes shape its ball (damage x${r.dmg.toFixed(2)}, range x${r.range.toFixed(2)}, fire rate x${r.rate.toFixed(2)})`);
await page.evaluate(() => { __bare(); save = { ...save, left: save.left.map((g, i) => (i === 0 ? { g: "long12", lv: 1 } : g)) }; applyPlayerStats(true); });
check(await page.evaluate(() => { const g = player.guns.left.find(x => x.id === "long12"); return Math.abs(g.dmg - GUNS.long12.dmg * shipGunK()) < 1e-9 && g.range === GUNS.long12.range && g.interval === 60 / GUNS.long12.rpm; }), "an old plain gun is exactly what it was");

console.log("Switching ships carries the gear; what the new hull cannot wear goes back to the bag");
await page.evaluate(() => {
  __bare(); save = { ...save, gear: { ...save.gear, worn: { prow: { p: "prow", lv: 1, r: 1, il: 3, af: [["ram", 0.1]] }, flag: { p: "flag", lv: 1 } } },
    left: save.left.map((g, i) => (i === 0 ? { g: "long12", lv: 1, r: 3, il: 3, af: [["gdmg", 0.2]] } : g)) };
  window.__sloop = save.fleet.find(e => e.ship === "sloop");
});
await page.evaluate(() => { dock("welcome"); });
await wait(1000);   // the ledger settles (its sheet scrolls to the top and the first toast leaves) before the first tap
await page.evaluate(() => { resetLedgerPick(); hullOpen = true; renderPort(); document.querySelector(`#ships [data-act="switch"][data-id="${__sloop.id}"]`).scrollIntoView(); });
await page.click(`#ships [data-act="switch"][data-id="${await page.evaluate(() => __sloop.id)}"]`);
r = await page.evaluate(() => ({ ship: save.ship, prow: save.gear.worn.prow, flag: save.gear.worn.flag && save.gear.worn.flag.p, bag: save.gear.bag.some(x => x.p === "prow" && x.il === 3), store: save.store.some(g => g.g === "long12" && g.r === 3), hp: player.maxHp }));
check(r.ship === "sloop" && !r.prow && r.flag === "flag" && r.bag && r.store, `switching to the sloop: the item level 1 flag stays, the item level 3 prow goes to the bag, the rare Long 12 to the store (${JSON.stringify({ ...r, hp: undefined })})`);
await page.evaluate(() => { resetLedgerPick(); hullOpen = true; renderPort(); document.querySelector('#ships [data-act="switch"]').scrollIntoView(); });
await page.click(`#ships [data-act="switch"][data-id="${await page.evaluate(() => save.fleet.find(e => e.ship === "brig").id)}"]`);
check(await page.evaluate(() => save.ship === "brig" && save.gear.worn.flag && save.gear.bag.some(x => x.p === "prow" && x.il === 3)), "and back on the brig nothing was lost");

console.log("Both languages: every key resolves (a missing one would show as its own name)");
for (const l of ["en", "zh"]) {
  r = await page.evaluate(l => {
    lang = l; applyLang(); dock("welcome");
    save = { ...save, gear: { ...save.gear, worn: { flag: { p: "flag", lv: 3, r: 4, il: 3, af: [["loot", 0.1], ["heat", 0.1]], lg: 1 } }, bag: save.gear.bag.slice(0, 3).concat([{ p: "supply", lv: 1, r: 4, il: 3, af: [["repair", 0.1], ["powder", 0.2], ["fire", 0.1]], lg: 1 }]) } };
    renderPort(); gearAct("gbag", { i: "3" }); gearNote = { text: ["gMoved", { name: "x" }], before: { gear: save.gear, shipId: save.shipId } }; renderPort();
    const raw = /(ga_|gleg_|gp_|gr_|gln_)\w+|g(Empty|Bag\w*|Equip|Unequip|Cmp\w*|Lock\w*|Scrap\w*|Need\w+|Pick\w+|Worn\w+|Batch\w*|Reroll|Base|LvLine|Guns|Moved\w*|Undo\w*|Tip\w+|Got\w*|Il)|gearTitle|gearHint/;
    return { bad: (document.getElementById("gear").innerText + document.querySelector("#gear").closest("section").innerText).match(raw), text: document.getElementById("gear").innerText.length };
  }, l);
  check(!r.bad && r.text > 80, `the gear page has no unresolved keys in ${l}${r.bad ? " (" + r.bad[0] + ")" : ""}`);
  await page.evaluate(() => { document.getElementById("gear").scrollIntoView(); });
  await shot("gear-" + l);
}
await page.evaluate(() => { lang = "zh"; applyLang(); renderPort(); });

console.log("Phone layout (390 x 844): no sideways scroll, the cards and tiles fit");
await page.setViewportSize({ width: 390, height: 844 });
await wait(300);
await page.evaluate(() => { save = { ...save, gear: { ...save.gear, bag: save.gear.bag.concat(Array.from({ length: 14 }, (_, i) => ({ p: ["prow", "body", "sail", "supply", "instr", "flag"][i % 6], lv: 1, r: i % 5, il: 1 + (i % 3), af: [] }))) } }; renderPort(); });
await page.evaluate(() => { document.getElementById("gear").scrollIntoView(); });
await page.click('#gear [data-act="gbag"][data-i="3"]');
let w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth, sheet: [document.querySelector("#port .sheet").scrollWidth, document.querySelector("#port .sheet").clientWidth], gear: [document.getElementById("gear").scrollWidth, document.getElementById("gear").clientWidth] }));
check(w.doc <= w.win && w.sheet[0] <= w.sheet[1] + 1 && w.gear[0] <= w.gear[1] + 1, `no horizontal scroll with a legendary card open (${JSON.stringify(w)})`);
await page.evaluate(() => { document.getElementById("gear").scrollIntoView(); });
await shot("gear-mobile");
await page.click('#gear [data-act="gslot"][data-p="instr"]');
await page.click('#gear [data-act="gslot"][data-p="instr"]');
await page.evaluate(() => { resetLedgerPick(); deckSel = { side: "bow", i: 0 }; renderPort(); document.getElementById("ctx").scrollIntoView(); });
await page.click('#ctx [data-act="gprev"][data-side="store"][data-i="0"]');
w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth, sheet: [document.querySelector("#port .sheet").scrollWidth, document.querySelector("#port .sheet").clientWidth] }));
check(w.doc <= w.win && w.sheet[0] <= w.sheet[1] + 1, `no horizontal scroll with a gun card open (${JSON.stringify(w)})`);
await page.evaluate(() => { document.getElementById("ctx").scrollIntoView(); });
await shot("gear-mobile-gun");
check(await page.evaluate(() => [...document.querySelectorAll("#gear .gslot, #gear .slot, #gear .btn, #ctx .btn")].every(el => { const r = el.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= innerWidth + 1); })), "every gear control sits inside the screen width");
await page.setViewportSize({ width: 1280, height: 900 });
await wait(200);
await page.evaluate(() => { cancelGunPick(); document.getElementById("gear").scrollIntoView(); });
await shot("gear-desktop");

console.log("The daily sea has no gear: it plays on a default save");
check(await page.evaluate(() => { const s = runSave("daily", 1); return Object.keys(s.gear.worn).length === 0 && s.gear.bag.length === 0; }), "a daily run's save has an empty gear set");

console.log("New Game+ keeps the gear");
r = await page.evaluate(() => {
  save = { ...save, ship: "brig", gear: { worn: { prow: { p: "prow", lv: 1, r: 1, il: 3, af: [["ram", 0.1]] }, flag: { p: "flag", lv: 2 } }, bag: [{ p: "sail", lv: 1 }], mats: 33 } };
  startNewGamePlus();
  return { ship: save.ship, flag: save.gear.worn.flag && save.gear.worn.flag.lv, prow: !!save.gear.worn.prow, bag: save.gear.bag.some(x => x.p === "prow" && x.il === 3) && save.gear.bag.some(x => x.p === "sail"), mats: save.gear.mats };
});
check(r.ship === "sloop" && r.flag === 2 && !r.prow && r.bag && r.mats === 33, `after New Game+ the gear is still the captain's (${JSON.stringify(r)})`);

check(errors.length === 0, `no page errors (${errors.length})` + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""));
await browser.close();
if (fails.length) { console.log("\nFAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("\ngear: all checks passed");
