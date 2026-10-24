// Unit tests for the highlight replay (#20): the pure helpers of js/replay.js. Usage: node --test tests/unit-replay.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = ["js/config.js", "js/util.js", "js/postcard.js", "js/replay.js"].map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
function boot() {
  const ctx = vm.createContext({ console, STR: { en: {}, zh: {} }, onHook() {}, document: { addEventListener() {} }, device: "desk" });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test("the first recordable container wins, none gives an empty string", () => {
  const g = boot();
  assert.equal(g.run(`replayPickMime(m => true)`), "video/webm;codecs=vp9");
  assert.equal(g.run(`replayPickMime(m => m === "video/mp4")`), "video/mp4", "Safari: mp4 only");
  assert.equal(g.run(`replayPickMime(m => false)`), "");
  assert.equal(g.run(`replayPickMime(() => { throw new Error("x"); })`), "", "a throwing probe counts as unsupported");
  assert.equal(g.run(`replayPickMime(undefined)`), "");
});

test("support needs MediaRecorder, captureStream and a container, and says which one is missing", () => {
  const g = boot();
  const R = "function MR() {}; MR.isTypeSupported = m => m === 'video/webm';";
  assert.deepEqual(g.json(`(() => { ${R} return replaySupport({ MediaRecorder: MR, canvas: { captureStream() {} } }); })()`), { ok: true, mime: "video/webm" });
  assert.equal(g.json(`replaySupport({ MediaRecorder: undefined, canvas: { captureStream() {} } })`).reason, "recorder");
  assert.equal(g.json(`replaySupport(null)`).reason, "recorder");
  assert.equal(g.json(`(() => { ${R} return replaySupport({ MediaRecorder: MR, canvas: {} }); })()`).reason, "capture");
  assert.equal(g.json(`(() => { ${R} return replaySupport({ MediaRecorder: MR, canvas: null }); })()`).reason, "capture");
  assert.equal(g.json(`(() => { function MR() {}; MR.isTypeSupported = () => false; return replaySupport({ MediaRecorder: MR, canvas: { captureStream() {} } }); })()`).reason, "mime");
});

test("the recording size is capped in width, even on both sides, with the aspect kept", () => {
  const g = boot();
  assert.deepEqual(g.json("replayFitSize(1920, 1080, 960)"), { w: 960, h: 540 });
  assert.deepEqual(g.json("replayFitSize(800, 601, 960)"), { w: 800, h: 602 }, "small canvases are not scaled up, odd heights are rounded to even");
  assert.deepEqual(g.json("replayFitSize(2560, 1440, 960)"), { w: 960, h: 540 });
  const p = g.json("replayFitSize(1001, 333, 960)");
  assert.ok(p.w % 2 === 0 && p.h % 2 === 0 && p.w <= 960);
  assert.deepEqual(g.json("replayFitSize(0, 0, 960)"), { w: 2, h: 2 });
});

test("file names carry the container: privateers-<time>.webm / .mp4", () => {
  const g = boot();
  assert.equal(g.run(`replayName(new Date(2026, 9, 24, 13, 5, 9), "video/webm")`), "privateers-20261024-130509.webm");
  assert.equal(g.run(`replayName(new Date(2026, 9, 24, 13, 5, 9), "video/mp4")`), "privateers-20261024-130509.mp4");
  assert.equal(g.run(`replayExt("")`), "webm");
});

test("recording is on by default on a desktop with 4+ cores, off on a phone or a weak machine", () => {
  const g = boot();
  assert.equal(g.run("replayDefault(false, 8)"), true);
  assert.equal(g.run("replayDefault(false, 4)"), true);
  assert.equal(g.run("replayDefault(false, 2)"), false);
  assert.equal(g.run("replayDefault(true, 8)"), false);
  assert.equal(g.run("replayDefault(false, undefined)"), true, "unknown core count: assume enough");
});

test("two recorders stay staggered: start one, start the other once the first is old enough, restart the older at the clip length", () => {
  const g = boot(), plan = (a, b) => g.json(`replayPlan([${a === null ? "null" : `{ age: ${a} }`}, ${b === null ? "null" : `{ age: ${b} }`}], 8, 3)`);
  assert.deepEqual(plan(null, null), { act: "start", i: 0 });
  assert.deepEqual(plan(1, null), { act: "" }, "too young to share the work");
  assert.deepEqual(plan(3, null), { act: "start", i: 1 });
  assert.deepEqual(plan(null, 4), { act: "start", i: 0 }, "either slot can be the older one");
  assert.deepEqual(plan(7, 3), { act: "" });
  assert.deepEqual(plan(8, 4), { act: "rotate", i: 0 });
  assert.deepEqual(plan(2, 9), { act: "" }, "the other holds under 3 s: the older one keeps going");
  assert.deepEqual(plan(3, 9), { act: "rotate", i: 1 });
  // simulate a minute: a clip cut at any moment after the first 3 s holds at least REPLAY_MIN_S
  let s = [{ age: 0 }, null], min = Infinity;
  for (let t = 0; t < 600; t += 0.016) {
    s = s.map(x => x && { age: x.age + 0.016 });
    const p = g.json(`replayPlan(${JSON.stringify(s)}, 6, 3)`);
    if (p.act) s[p.i] = { age: 0 };
    if (t > 7 && s[0] && s[1]) min = Math.min(min, Math.abs(s[0].age - s[1].age));
  }
  assert.ok(min >= 3 - 0.05, `the stagger never drops under ${min.toFixed(2)} s`);
});
