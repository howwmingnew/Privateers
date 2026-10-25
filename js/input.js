"use strict";
// ---------- Desktop and controller input (touch keeps the floating joystick in hud.js) ----------
// Keyboard: A/D turn, W/S step the sail through SAIL_THR and the ship holds that speed; Space fires.
// Mouse: hold the left button to steer toward the cursor (its distance sets the sail), let go to fire;
//   a quick click only fires. Holding the right button steers the same way but never fires, so the left button can be
//   kept for shooting (the usual desktop split). Q / E fire only the larboard / starboard broadside.
// Gamepad (Phaser plugin): left stick points the bow, A or RT fires, D-pad up/down steps the sail, Start pauses.
Object.assign(STR.en, {
  hintDesk: "WASD or hold the right mouse button to steer · Space or left-click to fire · Esc pause",
  hint_keys: "A/D turn · W/S sail · Space fire (Q/E one side) · Esc pause",
  hint_mouse: "Hold right (or left) button to steer · left-click or let go of left to fire · Esc pause",
  hint_pad: "Left stick steer · D-pad sail · A / RT fire · Start pause",
  tip_keys: "Press Space to fire!", tip_pad: "Press A to fire!", tip_click: "Click to fire!", tip_desk: "Space or click to fire!",
  sl_lbl: "Sail", sl_0: "Stopped", sl_1: "Slow", sl_2: "Half", sl_3: "Full", sl_less: "Lower the sail", sl_more: "Raise the sail",
  // device-neutral wording for the ledger (it used to say "tap" everywhere)
  slotHint: "Choose a gun, then choose where it goes: a port swaps, an empty port takes it, the store keeps the spares.", shipArm: "Press again within 6 s to buy",
  resetArm: "Press again to wipe all progress", bought: "Bought a <em>{gun}</em>. It is in the gun store: choose a gun port to mount it.",
  welcome: "Sail out, find a ship and turn until your aim lines point at it, then fire. Sink ships, scoop up their plunder, and bring it back here to sell. Deeper waters hold richer and deadlier ships. The controls are under How to play.",
});
Object.assign(STR.zh, {
  hintDesk: "WASD 或按住滑鼠右鍵轉向 ·空白鍵或左鍵開火 · Esc 暫停",
  hint_keys: "A/D 轉向 · W/S 升降帆 · 空白鍵開火（Q/E 單舷）· Esc 暫停",
  hint_mouse: "按住右鍵（或左鍵）轉向 · 點左鍵或放開左鍵開火 · Esc 暫停",
  hint_pad: "左搖桿轉向 · 十字鍵升降帆 · A／RT 開火 · Start 暫停",
  tip_keys: "按空白鍵開火！", tip_pad: "按 A 開火！", tip_click: "點一下開火！", tip_desk: "按空白鍵或點一下開火！",
  sl_lbl: "船帆", sl_0: "收帆", sl_1: "慢速", sl_2: "半帆", sl_3: "滿帆", sl_less: "降帆", sl_more: "升帆",
  slotHint: "選一門砲，再選它要去的地方：砲位互換、空砲位直接移過去、庫存放備用的砲。", shipArm: "6 秒內再按一次確認購買",
  resetArm: "再按一次會清除所有進度", bought: "買下一門<em>{gun}</em>，放在火砲庫存。選擇一個砲位就能裝上。",
  welcome: "出港找一艘船，轉動船身讓瞄準線對準它，然後開火。擊沉敵船、撿起戰利品，再帶回這裡賣掉。離港口越遠，敵船越富有，也越危險。操作方式請看「玩法說明」。",
});

const SAIL_THR = [0, 0.35, 0.65, 1];   // stopped, slow, half, full
const PAD_DEAD = 0.2, CLICK_MS = 180, CLICK_PX = 8;
const MOUSE_SAIL_PX = [45, 110, 190];  // cursor-to-ship distance (CSS px) where the mouse raises the sail a step
let sailLevel = 0;
// Touch: the stick sets heading and (by how far it is pulled) speed; the sail buttons (js/touch-sail.js) cap that speed at a step
// of SAIL_THR, so a finger can hold the bow on a target with the ship slowed or stopped. Full (3) is no cap: nothing changes
// until a button is pressed. Keyboard, mouse and pad never read it.
let touchCap = SAIL_THR.length - 1;
function setTouchCap(l) {
  l = clamp(l, 0, SAIL_THR.length - 1);
  if (l === touchCap) return;
  touchCap = l; document.dispatchEvent(new Event("touchsail"));
}
// "desk" = a desktop nobody has touched yet; becomes keys / mouse / pad on first use, "touch" on a phone.
let device = matchMedia("(pointer: coarse)").matches ? "touch" : "desk";
let mouseHold = null;                  // { id, t, x, y, steer } while the left button is held on the sea
let padVec = { x: 0, y: 0, m: 0 };
const sailing = () => !paused && !docked;

function setDevice(d) {
  if (d === device) return;
  device = d;
  document.body.classList.toggle("pad-nav", d === "pad");
  refreshHint(); refreshSailInd();
  document.dispatchEvent(new Event("devicechange"));
}
function refreshHint() {
  document.getElementById("hint").textContent = t(device === "touch" ? "hintTouch" : device === "desk" ? "hintDesk" : "hint_" + device);
}
// The "how do I fire" tip for the current device; null when it would not make sense (touch, finger lifted).
function fireTipKey() {
  if (device === "keys") return "tip_keys";
  if (device === "pad") return "tip_pad";
  if (device === "desk") return "tip_desk";
  if (device === "mouse") return mouseHold ? "releaseTip" : "tip_click";
  return joyVec.m > 0 && !(typeof sinkingNear === "function" && sinkingNear(200)) ? "releaseTip" : null;   // not over a sinking hull
}
function setSailLevel(l) {
  l = clamp(l, 0, SAIL_THR.length - 1);
  if (l === sailLevel) return;
  sailLevel = l; refreshSailInd();
}
function refreshSailInd() {
  const el = document.getElementById("sailInd");
  el.hidden = device === "touch";
  el.querySelectorAll(".pips i").forEach((p, i) => p.classList.toggle("on", i < sailLevel));
  document.getElementById("sailTxt").textContent = t("sl_" + sailLevel);
}
document.addEventListener("langchange", () => { refreshHint(); refreshSailInd(); });

// ---------- Keyboard: sail steps (turning reads the held keys each frame in playerInput) ----------
window.addEventListener("keydown", e => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  setDevice("keys");
  if (!sailing() || e.repeat) return;
  if (e.code === "KeyW" || e.code === "ArrowUp") setSailLevel(sailLevel + 1);
  else if (e.code === "KeyS" || e.code === "ArrowDown") setSailLevel(inMoorRing() ? 0 : sailLevel - 1);   // in the dock ring S stops dead
  else if (e.code === "KeyQ") playerFire(["left"]);
  else if (e.code === "KeyE") playerFire(["right"]);
}, true);

// ---------- Mouse: hold to steer, release to fire ----------
// No pointer capture here: Phaser tracks mousemove on the canvas only, and capture would retarget it away.
(function mouse() {
  const area = document.getElementById("game");
  area.addEventListener("contextmenu", e => e.preventDefault());
  area.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse") { setDevice("touch"); return; }
    setDevice("mouse");
    if ((e.button !== 0 && e.button !== 2) || !sailing() || mouseHold) return;
    const right = e.button === 2;   // bit 1 = left, bit 2 = right in PointerEvent.buttons
    mouseHold = { id: e.pointerId, t: performance.now(), x: e.clientX, y: e.clientY, steer: right, mask: right ? 2 : 1, fires: !right };
  });
  // With another button also down, letting go of the held one is a pointermove (its buttons bit cleared), not a pointerup.
  const leftUp = e => {
    if (!mouseHold || e.pointerId !== mouseHold.id || (e.buttons & mouseHold.mask)) return false;
    const fires = mouseHold.fires; mouseHold = null;
    if (fires) playerFire();   // left: a long hold and a quick click both fire on release; right: steering only
    return true;
  };
  window.addEventListener("pointermove", e => {
    if (leftUp(e)) return;
    if (mouseHold && e.pointerId === mouseHold.id && Math.hypot(e.clientX - mouseHold.x, e.clientY - mouseHold.y) > CLICK_PX) mouseHold.steer = true;
  });
  // A left click while steering with the right button fires at once. A second button pressed on an already-active pointer
  // raises no pointerdown (only a pointermove), but mousedown fires for every button.
  area.addEventListener("mousedown", e => { if (e.button === 0 && mouseHold && !mouseHold.fires && sailing()) playerFire(); });
  window.addEventListener("pointerup", leftUp);
  window.addEventListener("pointercancel", e => { if (mouseHold && e.pointerId === mouseHold.id) mouseHold = null; });
})();
function cancelPointerInput() {
  mouseHold = null; padVec = { x: 0, y: 0, m: 0 }; joyVec = { x: 0, y: 0, m: 0 };
  document.getElementById("joy").hidden = true;
}
// Heading toward the cursor, and the sail step its on-screen distance asks for.
function mouseSteer() {
  if (!mouseHold) return null;
  if (!mouseHold.steer && performance.now() - mouseHold.t < CLICK_MS) return null;   // still might be a click
  mouseHold.steer = true;
  const cam = S.cameras.main, p = S.input.mousePointer || S.input.activePointer;
  p.updateWorldPoint(cam);   // the camera follows the ship, so the world point moves even when the mouse does not
  const dx = p.worldX - player.x, dy = p.worldY - player.y;
  const css = Math.hypot(dx, dy) * cam.zoom / (typeof VIEW !== "undefined" ? VIEW.dpr : 1);   // zoom includes dpr (js/view.js)
  setSailLevel(MOUSE_SAIL_PX.filter(px => css >= px).length);
  return Math.atan2(dy, dx);
}

// ---------- Gamepad ----------
// A cross-origin iframe without allow="gamepad" makes getGamepads() throw, and Phaser's plugin calls it every frame,
// so only enable the plugin when the call works (js/main.js boot config).
function padsAllowed() { try { return typeof navigator.getGamepads === "function" && (navigator.getGamepads(), true); } catch (e) { return false; } }
// Phaser keeps a stale pad object after a disconnect, so only trust pads the browser still lists.
function readPad() {
  const gp = S && S.input && S.input.gamepad;
  if (!gp || !gp.enabled || !navigator.getGamepads) return null;
  let live = [];
  try { live = navigator.getGamepads() || []; } catch (e) { return null; }
  for (const p of gp.getAll()) { const l = live[p.index]; if (l && l.connected && p.buttons.length) return p; }
  return null;
}
function padSnapshot() {
  const p = readPad();
  if (!p) return null;
  const b = i => (p.buttons[i] ? p.buttons[i].value : 0) > 0.5;
  const s = { lx: p.leftStick.x, ly: p.leftStick.y, a: b(0), b: b(1), y: b(3), lb: b(4), rb: b(5), rt: b(7), start: b(9), up: b(12), down: b(13), left: b(14), right: b(15) };
  if (s.a || s.b || s.y || s.lb || s.rb || s.rt || s.start || s.up || s.down || s.left || s.right || Math.hypot(s.lx, s.ly) > 0.35) setDevice("pad");
  return s;
}
// At sea: stick to padVec, buttons fire / step the sail / pause. `pressed(k)` is true on the frame a button goes down.
function padSea(s, pressed) {
  const m = Math.min(1, Math.hypot(s.lx, s.ly));
  padVec = m > PAD_DEAD ? { x: s.lx, y: s.ly, m } : { x: 0, y: 0, m: 0 };
  if (pressed("a") || pressed("rt")) playerFire();
  if (pressed("up")) setSailLevel(sailLevel + 1);
  if (pressed("down")) setSailLevel(inMoorRing() ? 0 : sailLevel - 1);
}

// ---------- Per-frame steering, called from step() ----------
function playerInput(dt) {
  const K = S.keys, kx = (K.D.isDown || K.RIGHT.isDown) - (K.A.isDown || K.LEFT.isDown);
  let desired = null, thr = SAIL_THR[sailLevel];
  if (joyVec.m > 0.2) { desired = Math.atan2(joyVec.y, joyVec.x); thr = Math.min(1, joyVec.m * 1.25, SAIL_THR[touchCap]); }   // touch: the stick's pull, under the sail buttons' cap
  else if (mouseHold) { desired = mouseSteer(); thr = SAIL_THR[sailLevel]; }
  else if (padVec.m > 0) { desired = Math.atan2(padVec.y, padVec.x); thr = Math.max(thr, Math.min(1, padVec.m * 1.25)); }
  if (kx) desired = player.rot + kx;      // keys turn the bow at the ship's full turn rate; steer() clamps it
  player.wantThr = thr;   // what the helm asks for (js/aground.js tells a ship that asks and does not move)
  steer(player, desired, thr, dt);
  if (!moved && (desired != null || thr > 0)) { moved = true; document.getElementById("hint").style.opacity = 0; }
}
