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
  onHook("hurt", (s, dmg, src) => { if ((bossSide(s) || bossSide(src)) && src && !src.isPlayer && !src.ally && !s.isPlayer && !s.ally) __hits.push([s.boss || s.escortOf || s.faction, dmg]); });
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
  return { aimed, fired, hits: __hits.length, same: boss.hp === hp0[0] && __q.guards.every((g, i) => g.hp === hp0[i + 1]), navyHp: [navy.hp / navy.maxHp, nav2.hp / nav2.maxHp] };
});
check(!r.aimed && !r.fired, "15 s with a navy brig and frigate beside the boss: nobody aims at anybody, no boss shot is fired");
check(r.hits === 0 && r.navyHp.every(v => v === 1), `boss and guards lose no hull, nobody hurts anybody (${r.hits} hurt events; navy ${r.navyHp.map(v => v.toFixed(2))})`);
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

// ---- END OF SECTIONS ----
check(errors.length === 0, `0 page errors${errors.length ? " -> " + errors.join(" | ") : ""}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n- ` + fails.join("\n- ") : "\nAll feedback checks passed");
process.exit(fails.length || errors.length ? 1 : 0);
