// Phase 2 checks in a real browser: share cards (sortie, boss, victory, hall of fame; desktop download + clipboard, phone share
// sheet), the hall of fame and an old save without it, the daily sea (#daily: same captain and islands on two devices, the
// 5-minute result, the share line, its own storage) and #seed= links. Pure logic is in tests/unit-phase2.mjs.
// Usage: node tests/phase2.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/phase2";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let failed = 0;
const ok = (name, pass, info) => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const SAVE_KEY = "privateers-save-v2", DAILY_KEY = "privateers-daily-v1";
const OLD_SAVE = JSON.stringify({ v: 2, gold: 777, sunk: 5, tutorialDone: true, seed: 4242, ship: "sloop" });   // no hall, as before this phase

// seedStore: { key: string } written before the game's first load; hash: "#daily", "#seed=12345" or "".
async function open({ viewport = { width: 1100, height: 700 }, mobile = false, seedStore = {}, hash = "", reuse = null } = {}) {
  const ctx = reuse || await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  if (!reuse) await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(url).origin }).catch(() => {});
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(([store]) => { localStorage.clear(); for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v); }, [seedStore]);
  if (hash) await page.goto(url + hash, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && typeof run !== "undefined" && typeof S !== "undefined" && S && S.sys.isActive(), null, { timeout: 20000 * SLOW });
  await page.waitForTimeout(600 * SLOW);
  return { ctx, page };
}
async function toSea(page) {   // the title's start button, then out of the ledger, tutorial out of the way
  if (await ev(page, () => titleOpen)) await page.click("[data-smoke=start]");
  await page.waitForTimeout(400 * SLOW);
  await ev(page, () => { if (docked) setSail(); });
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 8000 * SLOW });
  await ev(page, () => { save.tutorialDone = true; tutorialReset(); });
}
// A link opens the challenge panel over the title and starts nothing: press its Start.
const startChallenge = async page => { await page.click("#challenge [data-ch=start]"); await page.waitForFunction(() => runActive(), null, { timeout: 8000 * SLOW }); };
const TODAY = Math.floor((Date.now() - Date.UTC(2026, 9, 24)) / 864e5) + 1;   // the daily's number, as js/daily.js reckons it
// keep every ship the test did not place away from the player
const calm = page => ev(page, () => { window.__calm = setInterval(() => { for (const e of enemies) if (!e.boss && !e.escortOf && Math.hypot(e.x - player.x, e.y - player.y) < 1300) { e.x = 200; e.y = 200; } }, 40); });
const stored = (page, k) => ev(page, k => localStorage.getItem(k), k);
// The sea as it is the instant a run starts (restarted inside one evaluate, so no frame has moved a ship yet): what must be
// the same on every device. kind "daily" or "seed" (then seed).
const freshSnap = (page, kind, seed = 0) => ev(page, ([kind, seed]) => {
  runLeave(); startRun(kind, seed);
  return {
    boss: bossShip ? { id: bossShip.boss, cls: bossShip.cls, x: Math.round(bossShip.x), y: Math.round(bossShip.y), hp: Math.round(bossShip.maxHp), esc: enemies.filter(e => e.escortOf).map(e => e.cls).sort() } : null,
    islands: islands.map(i => [Math.round(i.x), Math.round(i.y), Math.round(i.r)]),
    ships: enemies.map(e => [Math.round(e.x), Math.round(e.y), e.faction, e.cls, e.L, !!e.boss, !!e.escortOf]),
  };
}, [kind, seed]);

// ============ 1. a paid sortie: the share chip, a download, the text on the clipboard (desktop) ============
{
  const { ctx, page } = await open({ seedStore: { [SAVE_KEY]: OLD_SAVE } });
  ok("an old save with no hall loads: hall defaults in", await ev(page, () => JSON.stringify(save.hall)) === '{"sunk":0,"chain":0,"boss":{},"win":0}');
  ok("...and its gold is intact", await ev(page, () => save.gold) === 777);
  await page.click("[data-smoke=start]");   // Continue
  await page.waitForTimeout(500 * SLOW);
  await ev(page, () => setSail());
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 8000 * SLOW });
  await calm(page);
  await ev(page, () => { sortieTally({ sunk: 3, cargo: 100, bonus: 0.3, gold: 130 }); });
  const chip = page.locator("#shareChip");
  await chip.waitFor({ state: "visible", timeout: 3000 * SLOW });
  ok("a paid sortie at sea offers the share chip (beside the postcard chip)", await chip.isVisible() && await page.locator("#postcardChip").isVisible());
  const dl = page.waitForEvent("download", { timeout: 8000 * SLOW });
  await chip.click();
  const d = await dl;
  const path = join(out, "share-sortie.png"); await d.saveAs(path);
  const png = readFileSync(path);
  ok("the download is a 1200x630 PNG", png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.subarray(1, 4).toString() === "PNG", { w: png.readUInt32BE(16), h: png.readUInt32BE(20), bytes: png.length });
  await page.waitForTimeout(300 * SLOW);
  const clip = await ev(page, () => navigator.clipboard.readText().catch(e => "ERR " + e.message));
  ok("the text is on the clipboard with the game's address", /^⚓ Privateers: 3 sunk · 130 gold · /.test(clip) && clip.endsWith("https://howwmingnew.github.io/Privateers/"), clip);
  ok("the chip says what happened", /copied/i.test(await chip.textContent()), await chip.textContent());
  await page.screenshot({ path: join(out, "sortie-chip.png") });
  // the ledger carries the button after a sortie that docked
  await ev(page, () => { sortieTally({ sunk: 2, cargo: 50, bonus: 0, gold: 60 }); });
  await ev(page, () => { paused = true; docked = true; document.getElementById("port").hidden = false; sortieTally({ sunk: 2, cargo: 50, bonus: 0, gold: 60 }); });
  ok("a docked sortie puts a share button in the ledger", await page.locator("#pShare [data-share]").count() === 1);
  await ctx.close();
}

// ============ 2. boss: the chip after the card, the hall of fame, the log, the language switch ============
{
  const { ctx, page } = await open({});
  await toSea(page); await calm(page);
  await page.waitForFunction(() => typeof bossShip !== "undefined" && bossShip, null, { timeout: 8000 * SLOW });   // it sails once the tutorial is out of the way
  await ev(page, () => { player.x = bossShip.x - 400; player.y = bossShip.y; player.hp = player.maxHp = 1e6; });
  const info = await ev(page, () => ({ id: bossShip.boss, n: save.campaign.bounty }));
  ok("the first bounty is Red Ned", info.id === "ned" && info.n === 0);
  await ev(page, () => { hurt(bossShip, 1, 0, player, null); });
  await page.waitForTimeout(1200 * SLOW);
  await ev(page, () => { hurt(bossShip, 1e9, 0, player, null); });
  await page.locator("#shareChip").waitFor({ state: "visible", timeout: 6000 * SLOW });
  ok("sinking a captain offers the share chip after the card", true);
  const hall = await ev(page, () => save.hall);
  ok("the hall has the captain's fastest time and a streak", hall.boss.ned > 0 && hall.sunk >= 1, hall);
  const persisted = JSON.parse(await stored(page, SAVE_KEY) || "{}");
  ok("...and it was saved", persisted.hall && persisted.hall.boss && persisted.hall.boss.ned > 0);
  const text = await ev(page, () => shareSpec("boss", { bossName: bossName(findBounty("ned")), secs: 552, sunk: 14 }).text);
  ok("the boss share line names the captain", /Red Ned taken in 9 min 12 s/.test(text), text);
  // the captain's log shows the hall and a share button
  await ev(page, () => { paused = true; openLog(); });
  ok("the log has a hall of fame section with a share button", await page.locator("#logbook .hall").count() === 1 && await page.locator("#logbook .hall [data-share]").count() === 1);
  ok("...listing the fastest sinking", /red ned/i.test(await page.locator("#logbook .hall").innerText()));
  await ev(page, () => { lang = "zh"; document.dispatchEvent(new Event("langchange")); runHook("lang"); });
  const zh = await page.locator("#logbook .hall").innerText();
  ok("the hall reads in Chinese too", /名人堂/.test(zh) && /紅鬍奈德/.test(zh), zh.slice(0, 60));
  await page.screenshot({ path: join(out, "log-hall.png") });
  await ev(page, () => { closeLog(); lang = "en"; });
  // the victory page
  await ev(page, () => { save.winTime = 3725; showVictory(); });
  ok("the victory page has a share button next to the postcard one", await page.locator("#victory [data-share]").count() === 1);
  await ctx.close();
}

// ============ 3. a phone: the system share sheet gets files, text and url ============
{
  const { ctx, page } = await open({ mobile: true, viewport: { width: 390, height: 780 }, seedStore: { [SAVE_KEY]: OLD_SAVE } });
  await ev(page, () => {
    window.__shared = null;
    navigator.canShare = d => !!(d && d.files && d.files.length);
    navigator.share = async d => { window.__shared = { files: d.files.map(f => [f.name, f.type, f.size]), text: d.text, url: d.url, title: d.title }; };
  });
  await page.tap("[data-smoke=start]"); await page.waitForTimeout(500 * SLOW);
  await ev(page, () => setSail());
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 8000 * SLOW });
  await calm(page);
  await ev(page, () => sortieTally({ sunk: 4, cargo: 100, bonus: 0.2, gold: 120 }));
  await page.locator("#shareChip").waitFor({ state: "visible", timeout: 3000 * SLOW });
  await page.locator("#shareChip").tap();
  await page.waitForFunction(() => window.__shared, null, { timeout: 8000 * SLOW });
  const sh = await ev(page, () => window.__shared);
  ok("the phone share sheet gets a PNG file, the text and the link", sh.files.length === 1 && sh.files[0][1] === "image/png" && sh.files[0][2] > 5000 && /4 sunk/.test(sh.text) && sh.url === "https://howwmingnew.github.io/Privateers/", sh);
  await page.screenshot({ path: join(out, "phone-chip.png") });
  await ctx.close();
}

// ============ 4. the daily sea: same on two devices, sandboxed, five minutes, a result ============
let snapA = null;
{
  const { ctx, page } = await open({ seedStore: { [SAVE_KEY]: OLD_SAVE }, hash: "#daily" });
  ok("#daily opens the challenge panel over the title and does not start", await page.locator("#challenge").isVisible() && await ev(page, () => !runActive() && titleOpen));
  ok("...it names the daily and today's difficulty rules", /Daily #\d+/i.test(await page.locator("#challenge").innerText()));
  await startChallenge(page);
  ok("Start begins the daily run", await ev(page, () => runActive() && runKind() === "daily" && !titleOpen));
  ok("...the challenge panel is gone and the address is cleaned", !(await page.locator("#challenge").isVisible()) && await ev(page, () => location.hash === ""));
  ok("...on a throwaway save: a fixed brig, the real gold is not in it", await ev(page, () => save.ship === "brig" && save.gold === 0 && save.hull === 3));
  ok("...the clock is up", await page.locator("#runClock").isVisible(), await page.locator("#runClock").textContent());
  snapA = await freshSnap(page, "daily");
  ok("today's captain is out there, a daily one", snapA.boss && /^d\d+$/.test(snapA.boss.id), snapA.boss);
  await calm(page);
  await page.waitForTimeout(1500 * SLOW);
  ok("the real save is untouched while the run goes on", await stored(page, SAVE_KEY) === OLD_SAVE);
  await ev(page, () => { player.x = bossShip.x - 400; player.y = bossShip.y; player.hp = player.maxHp = 1e6; });
  await page.waitForTimeout(300 * SLOW);
  ok("no harbor in a daily run: the ring does not open the ledger", await ev(page, () => { player.x = PORT.x + 400; player.speed = 0; return !docked; }));
  await ev(page, () => { player.x = bossShip.x - 400; player.y = bossShip.y; });
  await ev(page, () => { hurt(bossShip, 1e9, 0, player, null); });
  await page.locator("#runEnd").waitFor({ state: "visible", timeout: 10000 * SLOW });
  const t1 = await page.locator("#runEnd").innerText();
  ok("sinking the captain ends the run with a result page", /sunk/i.test(t1) && /Daily sea #\d+/i.test(t1), t1.replace(/\n+/g, " | ").slice(0, 120));
  const daily = JSON.parse(await stored(page, DAILY_KEY) || "null");
  const day = daily && Object.values(daily.days)[0];
  ok("the day's result is kept under its own key", day && day.won === true && daily.streak === 1, daily);
  ok("...and the campaign save is still byte for byte the same", await stored(page, SAVE_KEY) === OLD_SAVE);
  const sp = await ev(page, () => { const d = dailyResult({ won: run.result.won, bossT: run.result.bossT, sunk: run.result.sunk, hull: run.result.hull }); return shareSpec("daily", { n: run.n, bossName: bossName(run.bounty), ...run.result }).text; });
  ok("the share line is the daily format", /^Privateers Daily #\d+ · .+ sunk in \d+:\d\d · hull \d+%$/.test(sp), sp);
  const dl = page.waitForEvent("download", { timeout: 8000 * SLOW });
  await page.locator("#runEnd [data-share]").click();
  await dl;
  await page.waitForTimeout(300 * SLOW);
  const clip = await ev(page, () => navigator.clipboard.readText().catch(e => "ERR " + e.message));
  ok("sharing the result copies the line with a #daily= link that carries the result", /#daily=\d+&t=\d+&hp=\d+&k=\d+$/.test(clip) && /Privateers Daily #\d+/.test(clip), clip);
  ok("...and the result page names the weekday and its difficulty", /Difficulty \d\/7/i.test(t1), t1.slice(0, 60));
  // #39: the day's reward is cosmetic, kept under its own key, and paid once
  const rw = JSON.parse(await stored(page, "privateers-rewards-v1") || "null");
  ok("the win earns a reward and a badge, kept under their own key", rw && rw.owned.length === 1 && rw.badges.includes("first") && Object.keys(rw.days).length === 1, rw);
  ok("...the result page shows what was earned", /Daily reward/i.test(t1) && /New: /.test(t1) && /Badge: /.test(t1), t1.replace(/\n+/g, " | ").slice(0, 300));
  ok("...the campaign save is still byte for byte the same", await stored(page, SAVE_KEY) === OLD_SAVE);
  const bl = await ev(page, () => ({ daily: shareSpec("daily", { n: run.n, tier: run.tier, bossName: "x", ...run.result }).badges, hall: shareSpec("log", { hall: save.hall, total: 0 }).sub }));
  ok("the daily share card carries the badge line, the same text as the hall card", bl.daily === "Badges: First sea cleared" && bl.daily === bl.hall, bl);
  await page.click("[data-run=again]");
  await page.waitForTimeout(1800 * SLOW);
  await ev(page, () => { player.hp = player.maxHp = 1e6; hurt(bossShip, 1e9, 0, player, null); });
  await page.locator("#runEnd").waitFor({ state: "visible", timeout: 10000 * SLOW });
  const rw2 = JSON.parse(await stored(page, "privateers-rewards-v1") || "null");
  ok("a replay of the same day pays nothing more", rw2 && JSON.stringify(rw2) === JSON.stringify(rw) && /already claimed/i.test(await page.locator("#runEnd").innerText()), rw2);
  await page.screenshot({ path: join(out, "daily-result.png") });
  await page.click("[data-run=title]");
  await page.waitForTimeout(800 * SLOW);
  ok("back to title: the real save is back, no run, harbor works again", await ev(page, () => !runActive() && save.gold === 777 && titleOpen && genRng === null));
  ok("the title shows today's number", /#\d+/.test(await page.locator("#tDaily").textContent()), await page.locator("#tDaily").textContent());
  await page.click("[data-smoke=start]");
  await page.waitForTimeout(600 * SLOW);
  ok("Continue goes to the real harbor with the real gold", await ev(page, () => docked && save.gold === 777 && save.ship === "sloop"));
  await ctx.close();
}
{
  // a second device, same day: the same captain, the same escort, the same islands, the same opening sea
  const { ctx, page } = await open({ hash: "#daily" });
  await startChallenge(page);
  const snapB = await freshSnap(page, "daily");
  ok("a second device sees the same captain, hull, lair and escort", JSON.stringify(snapB.boss) === JSON.stringify(snapA.boss), { a: snapA.boss, b: snapB.boss });
  ok("...the same islands", JSON.stringify(snapB.islands) === JSON.stringify(snapA.islands), snapB.islands.length);
  ok("...and the same ships in the opening sea", JSON.stringify(snapB.ships) === JSON.stringify(snapA.ships), snapB.ships.slice(0, 3));
  // time up: five minutes pass and the run ends without the captain
  await calm(page);
  await ev(page, () => { run = { ...run, t: DAILY_SECONDS - 0.4 }; });
  await page.locator("#runEnd").waitFor({ state: "visible", timeout: 8000 * SLOW });
  const t2 = await page.locator("#runEnd").innerText();
  ok("five minutes up: a result page says the captain got away", /got away/i.test(t2) && /Time's up/i.test(t2), t2.replace(/\n+/g, " | ").slice(0, 100));
  const d2 = JSON.parse(await stored(page, DAILY_KEY));
  ok("...the loss is recorded too", Object.values(d2.days)[0].won === false);
  // sail again restarts the same sea
  await page.click("[data-run=again]");
  await page.waitForTimeout(800 * SLOW);
  ok("'Sail again' puts the same sea back with a fresh clock", await ev(page, () => runActive() && run.t < 2 && !run.over && bossShip && bossShip.boss === run.bounty.id));
  await ctx.close();
}

// ============ 5. #seed= ============
{
  const { ctx, page } = await open({ seedStore: { [SAVE_KEY]: OLD_SAVE }, hash: "#seed=12345" });
  ok("#seed= opens the challenge panel first", await page.locator("#challenge").isVisible() && /seed 12345/i.test(await page.locator("#challenge").innerText()) && await ev(page, () => !runActive()));
  await startChallenge(page);
  ok("#seed=12345 opens a free voyage on that seed", await ev(page, () => runActive() && runKind() === "seed" && save.seed === 12345 && runLink() === "#seed=12345"));
  const a = await freshSnap(page, "seed", 12345);
  await page.waitForTimeout(800 * SLOW);
  ok("...with a fresh sloop, the real gold left alone, and the harbor still there", await ev(page, () => save.ship === "sloop" && save.gold === 0 && !docked));
  await ev(page, () => { save.gold = 999; persist(); });
  ok("nothing the run does reaches storage", await stored(page, SAVE_KEY) === OLD_SAVE);
  ok("no daily record is made by a seed run", await stored(page, DAILY_KEY) === null);
  const link = await ev(page, () => shareSpec("sortie", { sunk: 1, gold: 1, secs: 1 }).url);
  ok("a share from a seeded sea carries the seed link", link.endsWith("#seed=12345"), link);
  await ctx.close();
  const b = await open({ hash: "#seed=12345" });
  await startChallenge(b.page);
  const bb = await freshSnap(b.page, "seed", 12345);
  ok("the same seed on another device: the same islands and opening sea", JSON.stringify(bb.islands) === JSON.stringify(a.islands) && JSON.stringify(bb.ships) === JSON.stringify(a.ships) && JSON.stringify(bb.boss) === JSON.stringify(a.boss));
  const c = await open({ hash: "#seed=12346" });
  await startChallenge(c.page);
  ok("a different seed is a different sea", JSON.stringify((await freshSnap(c.page, "seed", 12346)).islands) !== JSON.stringify(a.islands));
  await b.ctx.close(); await c.ctx.close();
}

// ============ 6. a friend's result: the panel, closing it, the comparison, sharing back; stale and bad links ============
{
  const { ctx, page } = await open({ seedStore: { [SAVE_KEY]: OLD_SAVE }, hash: `#daily=${TODAY}&t=102&hp=64&k=9` });
  const panel = await page.locator("#challenge").innerText();
  ok("a link with a friend's result shows it on the panel", /Friend: .+ sunk in 1:42 · hull 64% · 9 sunk/.test(panel), panel.replace(/\n+/g, " | "));
  await page.screenshot({ path: join(out, "challenge-friend.png") });
  await page.click("#challenge [data-ch=close]");
  ok("closing it goes back to the ordinary title, nothing started", await ev(page, () => titleOpen && !runActive()) && !(await page.locator("#challenge").isVisible()));
  await ctx.close();
}
{
  const { ctx, page } = await open({ seedStore: { [SAVE_KEY]: OLD_SAVE }, hash: `#daily=${TODAY}&t=102&hp=64&k=9` });
  await startChallenge(page); await calm(page);
  ok("the run keeps the friend's result", await ev(page, () => run.friend && run.friend.bossT === 102 && run.friend.sunk === 9));
  await ev(page, () => { run = { ...run, t: DAILY_SECONDS - 0.4 }; });   // time up, the captain got away
  await page.locator("#runEnd").waitFor({ state: "visible", timeout: 8000 * SLOW });
  const t = await page.locator("#runEnd").innerText();
  ok("the result compares with the friend", /versus your friend/i.test(t) && /your friend sank the captain/i.test(t) && /ships short/i.test(t), t.replace(/\n+/g, " | ").slice(0, 260));
  await page.screenshot({ path: join(out, "daily-vs-friend.png") });
  const link = await ev(page, () => shareSpec("daily", { n: run.n, tier: run.tier, bossName: "x", ...run.result }).url);
  ok("sharing back carries my own figures", /#daily=\d+&hp=\d+&k=0$/.test(link), link);
  await ctx.close();
}
{
  const stale = TODAY + 5;
  const { ctx, page } = await open({ hash: `#daily=${stale}&t=50&hp=50&k=2` });
  const panel = await page.locator("#challenge").innerText();
  ok("a link to another day says so and offers today's daily or that sea", new RegExp(`daily #${stale}; today is #${TODAY}`, "i").test(panel) && await page.locator("#challenge [data-ch=today]").count() === 1 && await page.locator("#challenge [data-ch=free]").count() === 1 && await page.locator("#challenge [data-ch=start]").count() === 0, panel.replace(/\n+/g, " | "));
  await page.click("#challenge [data-ch=free]");
  await page.waitForFunction(() => runActive(), null, { timeout: 8000 * SLOW });
  ok("'free voyage' sails that day's seed, not a daily run", await ev(page, ([n]) => runKind() === "seed" && save.seed === dailySeed(n) && !run.friend, [stale]));
  await ctx.close();
  const o = await open({ hash: `#daily=${stale}&t=50&hp=50&k=2` });
  await o.page.click("#challenge [data-ch=today]");
  await o.page.waitForFunction(() => runActive(), null, { timeout: 8000 * SLOW });
  ok("'play today's daily' starts today's run without the old friend", await ev(o.page, () => runKind() === "daily" && run.n === dailyNumber() && !run.friend));
  await o.ctx.close();
  const bad = await open({ hash: "#daily=abc" });
  ok("a malformed link opens no panel", !(await bad.page.locator("#challenge").isVisible()) && await ev(bad.page, () => titleOpen));
  await bad.ctx.close();
  const clamp = await open({ hash: `#daily=${TODAY}&t=99999&hp=900&k=77777` });
  ok("out-of-range figures are clamped", /sunk in 5:00 · hull 100% · 999 sunk/.test(await clamp.page.locator("#challenge").innerText()));
  await clamp.ctx.close();
}

ok("no page errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall phase 2 checks passed");
process.exit(failed ? 1 : 0);
