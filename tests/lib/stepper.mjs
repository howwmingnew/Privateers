// Hand-stepped game time for browser tests: "what the AI does in N seconds" needs N seconds of game time, not of wall time
// (a busy machine renders fewer frames and the game clamps each one to 50 ms, js/main.js), and stepping is many times faster.
//   await page.evaluate(stepper);   then in the page   stepN(n, each)
// stepN puts the real-time loop to sleep and runs n frames of 16.667 ms, calling each(i) after every frame: setInterval cannot fire
// inside the synchronous loop, so whatever a test keeps up with one (parking stray ships ...) belongs in `each`.
// The clock carries on from the loop's last frame, so S.time.now never runs backwards (crash books, shore timers and grudges
// read it), and tweens get the same fixed delta. Once stepped, game time is ahead of the wall clock: do not wake the loop and
// go on in real time on the same page.
export function stepper() {
  window.stepN = (n, each) => {
    const g = S.game, tw = S.tweens, gd = tw.getDelta;
    window.fixT = Math.max(window.fixT || 0, g.loop.now);
    g.loop.sleep(); tw.getDelta = () => 16.667;
    try { for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); if (each) each(i); } }
    finally { tw.getDelta = gd; }
  };
}
