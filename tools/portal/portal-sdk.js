"use strict";
// ---------- Portal SDK shim (Poki / CrazyGames) ----------
// Only the portal build loads this (tools/build-portal.mjs copies it to portal/js/ and adds the script tag); the main version never has it.
// It talks to the platform's SDK when one is on the page and does nothing when not, so the portal build also runs on its own.
// It uses the game's own hooks (js/hooks.js) and state, and changes no game file:
//   gameplayStart   the first input, and every time the sea is live again (set sail, resume)
//   gameplayStop    pause, docking, the title screen, a hidden tab, and while an ad runs
//   ads             a midgame ad on docking, the natural break; the sound is held (Snd.pauseAll, not saved as "muted") until it ends
//   loading         the SDK is initialised on load and told when the game is ready
// window.PortalSdk.state() shows what it believes, for tests.
(() => {
  const AD_GAP_MS = 120000;   // our own floor between ads; the platforms add their own frequency limits
  let touched = false, playing = false, adActive = false, sailedSinceAd = false, lastAdAt = -Infinity, ready = false;
  const calls = [];

  const poki = () => (typeof window.PokiSDK === "object" && window.PokiSDK ? window.PokiSDK : null);
  const cg = () => (window.CrazyGames && window.CrazyGames.SDK ? window.CrazyGames.SDK : null);
  const platform = () => (poki() ? "poki" : cg() ? "crazygames" : "none");
  // An SDK call may throw (blocked by an ad blocker, not initialised yet): the game never depends on it.
  // Returns the call's result, or FAILED when it threw; `after` runs ok / fail once that result settles.
  const FAILED = Symbol("failed");
  const guard = (name, fn) => { try { const r = fn(); if (r && typeof r.catch === "function") r.catch(() => {}); calls.push(name); return r; } catch (e) { return FAILED; } };
  const after = (r, ok, fail) => (r && typeof r.then === "function" ? r.then(ok, fail) : r === FAILED ? fail() : ok());

  function gameplay(on) {
    if (poki()) guard(on ? "gameplayStart" : "gameplayStop", () => poki()[on ? "gameplayStart" : "gameplayStop"]());
    else if (cg()) guard(on ? "gameplayStart" : "gameplayStop", () => cg().game[on ? "gameplayStart" : "gameplayStop"]());
  }
  // The sea is live: not the title, not paused, not docked (js/state.js, js/menu.js).
  const sailing = () => typeof paused !== "undefined" && !paused && !docked && !titleOpen;
  function sync() {
    const want = touched && sailing() && !adActive && !document.hidden;
    if (want !== playing) { playing = want; gameplay(want); }
  }

  function setSound(held) {
    if (typeof Snd === "undefined") return;
    if (held) Snd.pauseAll("ad"); else Snd.resumeAll("ad");
  }
  function adDone() {
    if (!adActive) return;
    adActive = false; setSound(false); lastAdAt = performance.now(); sailedSinceAd = false; sync();
  }
  function breakForAd() {
    if (adActive || !sailedSinceAd || performance.now() - lastAdAt < AD_GAP_MS) return;
    if (poki()) {
      adActive = true; sync();
      after(guard("commercialBreak", () => poki().commercialBreak(() => setSound(true))), adDone, adDone);
    } else if (cg()) {
      adActive = true; sync();
      if (guard("requestAd", () => cg().ad.requestAd("midgame", { adStarted: () => setSound(true), adFinished: adDone, adError: adDone })) === FAILED) adDone();
    }
  }

  function init() {
    if (ready) return;
    const p = poki(), c = cg();
    if (!p && !c) return;
    ready = true;
    if (p) after(guard("init", () => p.init()), () => guard("gameLoadingFinished", () => p.gameLoadingFinished()), () => {});
    else guard("init", () => c.init());
  }

  const firstInput = () => { touched = true; init(); sync(); };
  for (const ev of ["keydown", "pointerdown", "touchstart"]) window.addEventListener(ev, firstInput, { capture: true, passive: true });
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("load", init);
  onHook("frame", sync);   // every frame, paused or not: pause, dock and the title all show up here
  onHook("sail", () => { sailedSinceAd = true; });
  onHook("dock", breakForAd);

  window.PortalSdk = { platform, state: () => ({ platform: platform(), touched, playing, adActive, calls: calls.slice() }) };
})();
