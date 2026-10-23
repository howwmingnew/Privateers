"use strict";
// ---------- Boot guard ----------
// Loaded before the engine. If Phaser never arrives (offline, CDN blocked) or an error stops the game loop (during boot
// or later), show a readable message with a Retry button instead of a black or frozen sea.
// Self-contained on purpose: it must work when nothing else loaded, so it carries its own text and styles.
const BOOT_TXT = {
  en: { engineT: "Couldn't load the game engine", engineB: "The game downloads its engine (Phaser) from the internet when it starts. Check your connection, or whether a firewall or content blocker is stopping cdnjs.cloudflare.com, then try again.",
    startT: "The game couldn't start", startB: "Something went wrong while getting ready to sail. Reloading usually fixes it. Your save is not affected.",
    crashT: "The game stopped unexpectedly", crashB: "Something went wrong and the game stopped. Progress saved at the harbor is safe; reload to carry on.",
    retry: "Try again", details: "Error details" },
  zh: { engineT: "無法載入遊戲引擎", engineB: "遊戲啟動時要先從網路下載遊戲引擎（Phaser）。請檢查網路連線，或看看防火牆、廣告攔截器是否擋住了 cdnjs.cloudflare.com，然後再試一次。",
    startT: "遊戲無法啟動", startB: "準備出航時出了問題，重新載入通常就會好。你的存檔不受影響。",
    crashT: "遊戲意外停止", crashB: "發生錯誤，遊戲停了下來。在港口存下的進度都還在，重新載入就能繼續。",
    retry: "重試", details: "錯誤詳情" },
};
const BOOT_CSS = `#bootFail{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgba(4,18,24,.9);
font-family:var(--f-ui,"Barlow Semi Condensed","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif)}
#bootFail .sheet{width:min(100%,520px);max-height:100%;overflow-y:auto;box-sizing:border-box;background:var(--parch,#efe3c4);color:var(--ink,#2a1d10);
border-radius:4px;padding:22px 22px 20px;box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 0 60px rgba(150,110,50,.25)}
#bootFail h1{font-family:var(--f-display,"IM Fell English SC","Noto Serif TC",Georgia,serif);font-weight:400;font-size:28px;line-height:1.1;margin:0 0 10px}
#bootFail p{margin:0 0 16px;font-size:16px;line-height:1.45}
#bootFail .alt{border-top:1px solid rgba(42,29,16,.25);padding-top:14px}
#bootFail .alt h1{font-size:20px}#bootFail .alt p{font-size:14px;color:var(--ink-soft,#6b5638)}
#bootFail button{font:inherit;font-family:var(--f-display,Georgia,serif);font-size:22px;padding:8px 26px;border:0;border-radius:3px;cursor:pointer;
background:var(--blood,#b4412c);color:var(--foam,#f6f1e3);box-shadow:0 3px 0 #6e2416}
#bootFail button:focus-visible{outline:3px solid var(--brass,#c08f2e);outline-offset:2px}
#bootFail details{margin-top:16px;font-size:12px;color:var(--ink-soft,#6b5638)}
#bootFail pre{white-space:pre-wrap;word-break:break-word;margin:6px 0 0;font-size:12px}`;

let bootGame = null, bootFailShown = false, bootCheckT = 0;
const bootErrors = [];
function bootLang() {
  try { const l = localStorage.getItem("privateers-lang"); if (l === "en" || l === "zh") return l; } catch (e) {}
  return /^zh/i.test(navigator.language || "") ? "zh" : "en";
}
// Both languages, the player's first: i18n may be the thing that failed to load. Text only (textContent), never HTML.
function showBootFail(kind) {
  if (bootFailShown) return;
  if (!document.body) { document.addEventListener("DOMContentLoaded", () => showBootFail(kind)); return; }
  bootFailShown = true;
  const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  const [a, b] = bootLang() === "zh" ? ["zh", "en"] : ["en", "zh"];
  const block = (l, cls) => el("div", { className: cls, lang: l === "zh" ? "zh-Hant" : "en" },
    el("h1", { textContent: BOOT_TXT[l][kind + "T"] }), el("p", { textContent: BOOT_TXT[l][kind + "B"] }));
  const retry = el("button", { type: "button", textContent: `${BOOT_TXT[a].retry} · ${BOOT_TXT[b].retry}` });
  retry.addEventListener("click", () => location.reload());
  const sheet = el("div", { className: "sheet" }, block(a, "main"), block(b, "alt"), retry);
  if (bootErrors.length) sheet.append(el("details", {}, el("summary", { textContent: `${BOOT_TXT[a].details} · ${BOOT_TXT[b].details}` }),
    el("pre", { textContent: bootErrors.slice(0, 3).join("\n") })));
  const root = el("div", { id: "bootFail", role: "alertdialog" }, el("style", { textContent: BOOT_CSS }), sheet);
  root.setAttribute("aria-label", BOOT_TXT[a][kind + "T"]);
  document.body.append(root);
  retry.focus();
}
const engineMissing = () => typeof window.Phaser === "undefined";
// Called by the game config's preBoot callback (js/main.js) with the Phaser.Game.
function watchBoot(game) { bootGame = game; }
// After an error, give the game a moment: a stray error that leaves the loop running is not worth a full-screen message.
// An exception inside a frame stops Phaser's requestAnimationFrame loop for good, so "not advancing" means stuck.
function bootVerdict(waits) {
  if (bootFailShown) return;
  if (engineMissing()) return showBootFail("engine");
  if (document.hidden) { document.addEventListener("visibilitychange", () => bootVerdict(waits), { once: true }); return; }   // no frames while hidden
  const g = bootGame;
  if (!g || !g.isRunning) {
    // not made yet (boot() may still wait on fonts), or made but its loop never started (create() threw)
    if (waits < (g ? 1 : 3)) setTimeout(() => bootVerdict(waits + 1), 1500); else showBootFail("start");
    return;
  }
  if (!g.loop.running) return;   // put to sleep on purpose, not stuck
  const f0 = g.loop.frame;
  setTimeout(() => { if (!bootFailShown && !document.hidden && g.loop.running && g.loop.frame === f0) showBootFail(f0 > 0 ? "crash" : "start"); }, 600);
}
function bootOnError(msg) {
  bootErrors.push(String(msg));
  if (bootFailShown) return;
  if (engineMissing()) { showBootFail("engine"); return; }
  clearTimeout(bootCheckT);
  bootCheckT = setTimeout(() => bootVerdict(0), 1200);
}
window.addEventListener("error", e => {
  const tag = e.target && e.target.tagName;
  if (tag === "SCRIPT") { if (/phaser/i.test(e.target.src)) { bootErrors.push("Could not load " + e.target.src); showBootFail("engine"); } return; }
  if (tag) return;   // a missing image or stylesheet is not fatal
  bootOnError(e.error && e.error.stack || e.message || "Unknown error");
}, true);   // capture: failed <script> loads don't bubble
window.addEventListener("unhandledrejection", e => bootOnError(e.reason && e.reason.stack || e.reason || "Unhandled rejection"));
window.addEventListener("load", () => { if (engineMissing()) showBootFail("engine"); });
