"use strict";
// ---------- Highlight replay: the last few seconds of a big moment, saved as a video ----------
// A boss going down, a Broadside Massacre or a powder-magazine crit that takes a crowd with it marks a moment (the "moment"
// hook; a boss through "sunk"). The next finished recording (at most a few seconds on) is the clip and a chip offers it ("Save video"; the victory screen
// carries the button too). It goes out through the postcard pipeline (deliverImage, js/postcard.js): the share sheet on a phone
// that takes a video file, a download everywhere else, with the same wordmark burned into the corner.
// Cost: nothing unless recording is on (settings; the default is on for a desktop with 4+ cores, off on a phone) and the sea is
// being sailed: the title, the ledger and a hidden tab record nothing. While it records, every REPLAY_FPS-th frame the sea is
// drawn once, scaled to at most REPLAY_MAX_W wide, onto a small 2D canvas (with the wordmark) and that canvas is what
// MediaRecorder encodes: the encoder never sees the full-size canvas. A WebM file cannot be cut from the middle, so two
// recorders run staggered by half a clip, each lives exactly REPLAY_SEG_S (6 s) and is kept as the clip when it ends after a
// moment: the clip is always 6 s, with the moment 1.5 to 4.5 s from its end. No sound: the sea's Web Audio graph is not tapped (that
// would route the mix through a second node chain on every device), so the video is silent.
// Where MediaRecorder or canvas.captureStream is missing (old Safari) the setting row and the buttons do not appear.
Object.assign(STR.en, {
  rp_save: "Save video", rp_saved: "Saved!", rp_fail: "Could not save the video.",
  set_replay: "Highlight replay", set_replayNote: "Keeps the last few seconds so a big moment can be saved as a silent video. Uses some CPU: off by default on phones.",
});
Object.assign(STR.zh, {
  rp_save: "存成影片", rp_saved: "已儲存！", rp_fail: "無法儲存影片。",
  set_replay: "精彩回放", set_replayNote: "持續保留最近幾秒，大場面後可存成無聲影片。會多吃一點效能，手機預設關閉。",
});

// ---------- pure helpers (tests/unit-replay.mjs) ----------
const REPLAY_MIMES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
// The first container the browser can record, "" for none. isTypeSupported: (mime) => bool
const replayPickMime = isTypeSupported => (typeof isTypeSupported === "function" && REPLAY_MIMES.find(m => { try { return isTypeSupported(m); } catch (e) { return false; } })) || "";
// { ok, mime } or { ok: false, reason } for an environment { MediaRecorder, canvas } (canvas: an element or null). reason: "recorder" | "capture" | "mime".
function replaySupport(env) {
  if (!env || typeof env.MediaRecorder !== "function") return { ok: false, reason: "recorder" };
  if (!env.canvas || typeof env.canvas.captureStream !== "function") return { ok: false, reason: "capture" };
  const mime = replayPickMime(env.MediaRecorder.isTypeSupported && (m => env.MediaRecorder.isTypeSupported(m)));
  return mime ? { ok: true, mime } : { ok: false, reason: "mime" };
}
// The recording size for a w x h canvas: at most maxW wide, even sides (encoders want them), aspect kept.
function replayFitSize(w, h, maxW) {
  const k = w > maxW ? maxW / w : 1;
  return { w: Math.max(2, Math.round(w * k / 2) * 2), h: Math.max(2, Math.round(h * k / 2) * 2) };
}
const replayExt = mime => (/mp4/.test(mime || "") ? "mp4" : "webm");
const replayName = (d, mime) => postcardName(d).replace(/\.png$/, "." + replayExt(mime));
// Whether recording is on until the player chooses: not on a phone, not on a machine with under 4 cores.
const replayDefault = (touch, cores) => !touch && (cores || 4) >= 4;
// What to do with the two recorders, each { age } in seconds or null when not running: "start" a missing one, "rotate" the older, or "".
function replayPlan(slots, seg, min) {
  const live = slots.map((s, i) => ({ i, age: s ? s.age : -1 })).sort((a, b) => b.age - a.age);
  if (live[0].age < 0) return { act: "start", i: live[0].i };
  if (live[1].age < 0) return live[0].age >= min ? { act: "start", i: live[1].i } : { act: "" };
  return live[0].age >= seg && live[1].age >= min ? { act: "rotate", i: live[0].i } : { act: "" };
}

// ---------- recording ----------
const RP = { slots: [null, null], stream: null, cv: null, ctx: null, mime: "", sup: null, running: false, last: 0, pending: null, coolUntil: 0, armed: null, chip: null };
function replayEnv() { return replaySupport({ MediaRecorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder, canvas: RP.cv || document.createElement("canvas") }); }
const replaySupported = () => (RP.sup ||= replayEnv()).ok;
const replayWanted = () => replaySupported() && (typeof SETTINGS.replay === "boolean" ? SETTINGS.replay : replayDefault(device === "touch", navigator.hardwareConcurrency));
const slotAge = s => (s ? (performance.now() - s.t0) / 1000 : -1);

function replayStartSlot(i) {
  const rec = new MediaRecorder(RP.stream, { mimeType: RP.mime, videoBitsPerSecond: REPLAY_BITRATE });
  const s = { rec, chunks: [], t0: performance.now() };
  rec.ondataavailable = e => { if (e.data && e.data.size) s.chunks.push(e.data); };
  rec.start();
  RP.slots[i] = s;
}
function replayDrop(s) { if (!s) return; s.rec.ondataavailable = null; try { if (s.rec.state !== "inactive") s.rec.stop(); } catch (e) {} s.chunks = []; }
function replayDraw() {
  const now = performance.now();
  if (now - RP.last < 1000 / REPLAY_FPS - 2) return;
  RP.last = now;
  const src = S.game.canvas, sz = replayFitSize(src.width, src.height, REPLAY_MAX_W);
  if (RP.cv.width !== sz.w || RP.cv.height !== sz.h) { RP.cv.width = sz.w; RP.cv.height = sz.h; }   // a resize changes the picture size; the encoder follows the canvas
  RP.ctx.drawImage(src, 0, 0, sz.w, sz.h);
  stampMark(RP.ctx, sz.w, sz.h);
}
function replayStart() {
  if (RP.running || !replaySupported() || !S) return;
  try {
    RP.cv ||= document.createElement("canvas");
    RP.ctx ||= RP.cv.getContext("2d", { alpha: false });
    RP.mime = RP.sup.mime;
    const sz = replayFitSize(S.game.canvas.width, S.game.canvas.height, REPLAY_MAX_W);
    RP.cv.width = sz.w; RP.cv.height = sz.h;
    RP.stream = RP.cv.captureStream(REPLAY_FPS);
    S.game.events.on("postrender", replayDraw);
    RP.running = true; RP.last = 0;
    replayStartSlot(0);
  } catch (e) { console.error("Replay could not start:", e); replayStop(); RP.sup = { ok: false, reason: "start" }; replayRefresh(); }
}
function replayStop() {
  RP.armed = null;
  if (S && S.game && S.game.events) S.game.events.off("postrender", replayDraw);
  for (const s of RP.slots) replayDrop(s);
  RP.slots = [null, null];
  if (RP.stream) RP.stream.getTracks().forEach(tr => tr.stop());
  RP.stream = null; RP.running = false;
}
// Each frame: record while it is wanted and the sea is being sailed (the title, the ledger and a hidden tab are not), keep the pair of recorders staggered.
onHook("frame", () => {
  const want = replayWanted() && !docked && !titleOpen && !document.hidden;
  if (want !== RP.running) { want ? replayStart() : replayStop(); return; }
  if (!RP.running) return;
  const plan = replayPlan(RP.slots.map(s => (s ? { age: slotAge(s) } : null)), REPLAY_SEG_S, REPLAY_MIN_S);
  if (plan.act === "rotate") replayFinish(plan.i);
  if (plan.act) try { replayStartSlot(plan.i); } catch (e) { console.error("Replay stopped:", e); replayStop(); }
});
document.addEventListener("visibilitychange", () => { if (document.hidden && RP.running) replayStop(); });

// ---------- a moment: the next recorder to reach REPLAY_SEG_S, at least REPLAY_TAIL_S on, is the clip ----------
// A recorder is never trimmed (a WebM cannot be cut from the middle): it simply lives REPLAY_SEG_S and is kept instead of dropped
// when it ends after an armed moment. Recorders end every REPLAY_SEG_S / 2 seconds, so the clip lands at most 4.5 s after the
// moment, holds it with between REPLAY_TAIL_S and REPLAY_SEG_S / 2 + REPLAY_TAIL_S of aftermath, and is REPLAY_SEG_S long.
function replayMoment(kind) {
  if (!RP.running || RP.armed || performance.now() < RP.coolUntil) return false;
  RP.armed = { kind, at: performance.now() };
  RP.coolUntil = RP.armed.at + REPLAY_COOL_S * 1000;
  return true;
}
function replayFinish(i) {
  const s = RP.slots[i], arm = RP.armed;
  if (!arm || performance.now() - arm.at < REPLAY_TAIL_S * 1000) return replayDrop(s);
  RP.armed = null;
  const secs = slotAge(s), mime = RP.mime;
  s.rec.onstop = () => {
    const blob = new Blob(s.chunks, { type: mime.split(";")[0] });
    s.chunks = [];
    if (blob.size < 1000) return;
    RP.pending = { blob, secs: +secs.toFixed(2), kind: arm.kind, at: Date.now(), mime };
    replayRefresh(); replayOffer();
  };
  try { s.rec.stop(); } catch (e) { console.error("Replay cut failed:", e); }
}
onHook("moment", kind => replayMoment(kind));
onHook("sunk", (s, killer) => { if (s.boss && killer === player) replayMoment("boss"); });
onHook("sail", () => { RP.pending = null; replayRefresh(); });

// ---------- out to the player ----------
async function replaySave() {
  const c = RP.pending;
  if (!c) throw new Error("no clip");
  return deliverImage(c.blob, replayName(new Date(c.at), c.mime));   // the postcard's pipeline: it keeps the blob's own type
}
const replayButtons = new Set();
// A button for the clip: hidden until there is one. Returns it; the caller places it.
function replayButton(cls) {
  const b = document.createElement("button");
  b.type = "button"; b.className = cls; b.textContent = t("rp_save");
  let timer = 0;
  const say = key => { b.textContent = t(key); clearTimeout(timer); timer = setTimeout(() => { b.textContent = t("rp_save"); b.disabled = false; }, 1600); };
  b.addEventListener("click", () => {
    if (b.disabled) return;
    b.disabled = true;
    replaySave().then(r => say(r === "cancelled" ? "rp_save" : "rp_saved"), e => { console.error("Replay failed:", e); say("rp_fail"); });
  });
  b.hidden = !RP.pending; replayButtons.add(b);
  return b;
}
function replayRefresh() { for (const b of replayButtons) if (b !== RP.chip) b.hidden = !RP.pending; }
document.addEventListener("langchange", () => { for (const b of replayButtons) if (!b.disabled) b.textContent = t("rp_save"); });
let replayChipTimer = 0;
function replayOffer(ms = REPLAY_OFFER_MS) {
  if (!RP.chip) { RP.chip = replayButton("pcchip sharechip replaychip"); RP.chip.id = "replayChip"; document.body.appendChild(RP.chip); }
  RP.chip.hidden = false;
  clearTimeout(replayChipTimer); replayChipTimer = setTimeout(() => { RP.chip.hidden = true; }, ms);
}
onHook("frame", () => { if (RP.chip && !RP.chip.hidden && (docked || paused || titleOpen || (typeof dockingNow === "function" && dockingNow()))) RP.chip.hidden = true; });
onHook("dock", () => { if (RP.chip) { RP.chip.hidden = true; clearTimeout(replayChipTimer); } });
