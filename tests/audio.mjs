// Audio check: boots the game and tools/sound-test.html in headless Chrome and verifies the synthesised audio.
// It cannot listen; it checks the AudioContext unlocks on a real click, every effect plays without throwing,
// the output is not silent and never clips, pause / mute work, and nothing logs an error.
// Usage: node tests/audio.mjs [baseUrl] [--levels]
//   baseUrl  defaults to http://127.0.0.1:8765/ (serve the repo root, e.g. `npm run serve`)
//   --levels also prints the peak / RMS of every effect, theme and ambience on its own, for mixing
import { chromium } from "playwright";
// CI runners render without a GPU (~10 fps, game time runs at half speed): TEST_SLOW stretches every wait.
const SLOW = +process.env.TEST_SLOW || 1;

const args = process.argv.slice(2);
const base = (args.find(a => !a.startsWith("--")) || "http://127.0.0.1:8765/").replace(/index\.html$/, "").replace(/\/?$/, "/");
const levels = args.includes("--levels");
const problems = [];
const check = (ok, msg) => { console.log((ok ? "ok    " : "FAIL  ") + msg); if (!ok) problems.push(msg); };
const db = x => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : "-inf").padStart(6) + " dBFS";

const browser = await chromium.launch({ channel: "chrome", headless: true });
async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => problems.push(`${path} pageerror: ${e.message}`));
  // every error counts; warnings only when they come from Snd (the browser itself warns about unrelated things)
  page.on("console", m => { const x = m.text(); if ((m.type() === "error" && !/favicon/i.test(x)) || (m.type() === "warning" && /^Snd/.test(x))) problems.push(`${path} console ${m.type()}: ${x}`); });
  await page.goto(base + path, { waitUntil: "load" });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  return { ctx, page };
}
// Loudest peak / mean RMS of the final output over `ms`, sampled every 15 ms inside the page.
const measure = (page, ms) => page.evaluate(ms => new Promise(res => {
  let peak = 0, sum = 0, n = 0; const t0 = performance.now();
  const id = setInterval(() => { const m = Snd.meter(); peak = Math.max(peak, m.peak); sum += m.rms * m.rms; n++;
    if (performance.now() - t0 > ms) { clearInterval(id); res({ peak, rms: Math.sqrt(sum / Math.max(1, n)) }); } }, 15);
}), ms);
const quiet = page => page.evaluate(() => { Snd.music(null); Snd.ambience(null); });

try {
  // ---------- the game ----------
  const { ctx, page } = await open("index.html");
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof Snd !== "undefined", null, { timeout: 15000 * SLOW });
  check(await page.evaluate(() => Snd.state()) === "locked", "no AudioContext before the first gesture");
  await page.click("[data-smoke=start]");                            // a real user gesture (title screen, js/menu.js)
  if (await page.evaluate(() => docked)) await page.click("#sail");  // a fresh save sails straight out
  await page.waitForFunction(() => Snd.state() === "running", null, { timeout: 4000 * SLOW }).catch(() => {});
  check(await page.evaluate(() => Snd.state()) === "running", "AudioContext is running after a click");
  await page.waitForTimeout(400 * SLOW);
  const d0 = await page.evaluate(() => Snd.debug());
  check(d0.theme === "sea" && d0.ambience === "sea", `setting sail starts the sea music and ambience (${d0.theme} / ${d0.ambience})`);

  const thrown = await page.evaluate(async () => {
    const bad = [];
    for (const n of Snd.names) {
      for (const o of [{}, { x: player.x + 500, y: player.y - 200, big: true, amount: 900 }, { pan: -1, delay: 0.1, pitch: 1.2 }]) {
        try { Snd.play(n, o); } catch (e) { bad.push(`${n}: ${e.message}`); }
      }
      await new Promise(r => setTimeout(r, 40));
    }
    return bad;
  });
  check(thrown.length === 0, `every Snd.play name runs without throwing (${thrown.join("; ") || "18 names x 3 option sets"})`);
  const names = await page.evaluate(() => Snd.names.length);
  check(names >= 18, `${names} effects registered`);

  // stacked fire must not clip: the limiter + soft clip keep the final output at or under full scale
  await page.waitForTimeout(1500 * SLOW);
  const stack = page.evaluate(() => { for (let i = 0; i < 24; i++) setTimeout(() => { Snd.play("cannon"); Snd.play("hit", { big: true }); Snd.play("cannonFar", { x: player.x + 200, y: player.y }); }, i * 35); });
  const [, loud] = await Promise.all([stack, measure(page, 1600)]);
  check(loud.peak > 0.05, `stacked cannon fire is audible (peak ${db(loud.peak)})`);
  check(loud.peak <= 1.0001, `stacked cannon fire never clips (peak ${db(loud.peak)})`);
  const v = await page.evaluate(() => Snd.debug().voices);
  check(v <= 40, `voice cap holds under load (${v} active)`);

  // positional: a shot beyond earshot is dropped
  check(await page.evaluate(() => Snd.play("splash", { x: player.x + 5000, y: player.y })) === false, "a splash 5000 px away is culled");

  // pause and resume (also what a hidden tab does)
  await page.evaluate(() => Snd.pauseAll("test"));
  await page.waitForFunction(() => Snd.state() === "suspended", null, { timeout: 2000 * SLOW }).catch(() => {});
  check(await page.evaluate(() => Snd.state()) === "suspended", "pauseAll suspends the context");
  await page.evaluate(() => Snd.resumeAll("test"));
  await page.waitForFunction(() => Snd.state() === "running", null, { timeout: 2000 * SLOW }).catch(() => {});
  check(await page.evaluate(() => Snd.state()) === "running", "resumeAll resumes it");
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForFunction(() => Snd.state() === "suspended", null, { timeout: 2000 * SLOW }).catch(() => {});
  check(await page.evaluate(() => Snd.state()) === "suspended", "a hidden tab suspends audio");
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
  // hiding the tab at sea also opened the pause menu (js/menu.js), which keeps the game and its sound paused until Resume
  await page.waitForTimeout(300 * SLOW);
  check(await page.evaluate(() => pauseOpen && Snd.state() === "suspended"), "back on the tab, the pause menu keeps audio paused");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => Snd.state() === "running", null, { timeout: 2000 * SLOW }).catch(() => {});
  check(await page.evaluate(() => !pauseOpen && Snd.state()) === "running", "Resume from the pause menu resumes audio");

  // M toggles mute, with a toast in the current language, and it persists
  // Phaser reads the keyboard on its next game step, not inside the key event: wait for each press to land
  // (a slow, busy machine can take several frames) instead of reading the state straight after pressing.
  await page.keyboard.press("KeyM");
  await page.waitForFunction(() => Snd.isMuted(), null, { timeout: 4000 * SLOW }).catch(() => {});
  const m1 = await page.evaluate(() => ({ muted: Snd.isMuted(), toast: document.getElementById("toast").textContent, want: t("muted"), saved: JSON.parse(localStorage.getItem("privateers-settings")) }));
  check(m1.muted && m1.toast === m1.want && m1.saved.muted === true, `M mutes, toasts "${m1.toast}", and saves it`);
  await page.keyboard.press("KeyM");
  await page.waitForFunction(() => !Snd.isMuted(), null, { timeout: 4000 * SLOW }).catch(() => {});
  check(!(await page.evaluate(() => Snd.isMuted())), "M again unmutes");
  check(await page.evaluate(() => STR.zh.muted && STR.zh.unmuted && STR.en.muted && STR.en.unmuted) ? true : false, "mute strings exist in English and Traditional Chinese");

  // volume API: clamps, persists, and merges into whatever else the settings object holds
  const vol = await page.evaluate(() => {
    localStorage.setItem("privateers-settings", JSON.stringify({ ...JSON.parse(localStorage.getItem("privateers-settings")), other: 1 }));
    Snd.setVolume("music", 0.3); Snd.setVolume("sfx", 7);
    return { music: Snd.getVolume("music"), sfx: Snd.getVolume("sfx"), saved: JSON.parse(localStorage.getItem("privateers-settings")) };
  });
  check(vol.music === 0.3 && vol.sfx === 1 && vol.saved.volume.music === 0.3 && vol.saved.other === 1, "setVolume clamps, persists and keeps other settings");

  // docking: harbour music + ambience; combat intensity follows a nearby hostile
  await page.evaluate(() => { player.x = PORT.x + 1200; player.y = PORT.y; const e = enemies.find(x => x.alive && !x.merchant) || enemies[0]; e.x = player.x + 300; e.y = player.y; e.target = player; e.chaseFrom = { x: e.x, y: e.y }; });
  // the intensity eases toward its target, so wait for it to cross the line rather than sampling once after a fixed sleep
  await page.waitForFunction(() => Snd.debug().intensity > 0.4, null, { timeout: 8000 * SLOW }).catch(() => {});
  const iv = await page.evaluate(() => Snd.debug().intensity);
  check(iv > 0.4, `combat layer rises with a hostile ship close (intensity ${iv})`);
  await page.evaluate(() => dock("return"));
  await page.waitForTimeout(300 * SLOW);
  const d1 = await page.evaluate(() => Snd.debug());
  check(d1.theme === "harbor" && d1.ambience === "harbor", `docking switches to the harbour theme and ambience (${d1.theme} / ${d1.ambience})`);
  // the ledger: "denied" rides on pointerdown, because a disabled (too expensive) button never gets a click
  const hasDisabled = await page.evaluate(() => { const b = document.querySelector("#port [data-act][disabled]"); if (b) b.scrollIntoView();
    window.__pressed = null; document.getElementById("port").addEventListener("pointerdown", e => { window.__pressed = !!e.target.closest("[data-act]")?.disabled; }); return !!b; });
  if (hasDisabled) await page.click("#port [data-act][disabled]", { force: true });
  const pressed = await page.evaluate(() => window.__pressed);
  check(hasDisabled && pressed === true, `pressing a disabled ledger button reaches the "denied" listener (${hasDisabled ? pressed : "no disabled button"})`);
  await page.click("#port [data-act=port]");
  await page.waitForFunction(() => Snd.debug().voices > 0, null, { timeout: 2000 * SLOW }).catch(() => {});
  check(await page.evaluate(() => Snd.debug().voices) > 0, "a ledger click plays a sound");

  if (levels) {
    console.log("\n-- levels at default volumes (each alone, 1.6 s window) --");
    await quiet(page); await page.waitForTimeout(3500 * SLOW);
    for (const n of await page.evaluate(() => Snd.names)) {
      for (const o of n === "cannonFar" || n === "hit" || n === "splash" || n === "sink" || n === "burn" ? [{}, { dx: 600 }, { dx: 1200 }] : [{}]) {
        const p = page.evaluate(([n, o]) => { setTimeout(() => Snd.play(n, o.dx ? { x: player.x + o.dx, y: player.y, amount: 500 } : { amount: 500 }), 30); }, [n, o]);
        const [, r] = await Promise.all([p, measure(page, n === "sink" || n === "defeat" || n === "bell" ? 3500 : 1600)]);
        console.log(`${(n + (o.dx ? " @" + o.dx : "")).padEnd(16)} peak ${db(r.peak)}`);
        await page.waitForTimeout(300 * SLOW);
      }
    }
    for (const [th, k] of [["sea", 0], ["sea", 1], ["harbor", 0]]) {
      await page.evaluate(([th, k]) => { Snd.music(th); Snd.setIntensity(k); }, [th, k]);
      await page.waitForTimeout(k ? 6000 : 4000);
      const r = await measure(page, 8000);
      console.log(`music ${th} i=${k}`.padEnd(22) + `peak ${db(r.peak)}  rms ${db(r.rms)}`);
    }
    await page.evaluate(() => { Snd.music(null); Snd.setIntensity(0); }); await page.waitForTimeout(4000 * SLOW);
    for (const a of ["sea", "harbor"]) {
      await page.evaluate(a => Snd.ambience(a), a); await page.waitForTimeout(5000 * SLOW);
      const r = await measure(page, 10000);
      console.log(`ambience ${a}`.padEnd(22) + `peak ${db(r.peak)}  rms ${db(r.rms)}`);
    }
    await quiet(page);
  }
  await ctx.close();

  // ---------- the sound test page: press every button ----------
  const t = await open("tools/sound-test.html");
  await t.page.click("body", { position: { x: 5, y: 5 } });
  await t.page.waitForFunction(() => Snd.state() === "running", null, { timeout: 4000 * SLOW }).catch(() => {});
  check(await t.page.evaluate(() => Snd.state()) === "running", "sound test page unlocks audio on click");
  const buttons = await t.page.$$("button");
  for (const b of buttons) { await b.click(); await t.page.waitForTimeout(60 * SLOW); }
  await t.page.fill("#int", "0.8").catch(() => {});
  await t.page.waitForTimeout(500 * SLOW);
  check(buttons.length >= 18 + 5, `sound test page: clicked all ${buttons.length} buttons`);
  await t.ctx.close();
} catch (e) {
  problems.push("harness: " + e.message);
} finally {
  await browser.close();
}
if (problems.length) { console.error("\nFAIL\n" + problems.join("\n")); process.exit(1); }
console.log("\nPASS: audio checks");
