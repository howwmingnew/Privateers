"use strict";
// ---------- Captain's abilities (#16): one cooldown ability per ship line, so changing ship changes the ability ----------
// Fast line (SHIPS[id].line "fast") -> smoke screen; heavy line -> double shot; the sloop (no line: "both") -> powder keg. Numbers in js/config.js.
// One key for all three: F on a keyboard (Q / E are the one-side broadsides), Y on a pad (js/input.js), and a round HUD button for touch
// (also clickable), which shows the recharge as a pie and the seconds left. Only at sea: not docked, on the title, paused (photo mode
// rides on the pause) or sunk. The clock is simulated time (the "frame" hook skips paused frames), and every sortie starts with it ready.
// Hooks into the core: playerFire asks abilityShotK (js/combat.js), releaseVolley asks abilityAimErr (js/volley.js).
Object.assign(STR.en, {
  ab_smoke: "Smoke screen", ab_double: "Double shot", ab_keg: "Powder keg", ab_head: "Captain's ability",
  ab_smoke_ds: "Enemy volleys at you scatter wide for {s} s. It is not a shield: keep dodging the red fans. Recharges in {cd} s.",
  ab_double_ds: "Your next broadside does double damage. Recharges {cd} s after it fires.",
  ab_keg_ds: "Drops a keg astern that blows up when an enemy sails close, or after {f} s. Bounty ships take little from it; it never hurts you or your escorts. Recharges in {cd} s.",
  ab_byLine: "Fast ships: smoke screen · heavy ships: double shot · the sloop: powder keg.", ab_line: "Ability: {name}",
  ab_ready: "Ready", ab_on: "Active", ab_armed: "Loaded", ab_cool: "{n} s", ab_wait: "{name}: ready in {n} s", ab_tip: "{name} ({key}): {state}",
  f_smoke: "Smoke!", f_double: "Double shot!", f_dblLoad: "Double shot loaded", f_keg: "Keg away!",
});
Object.assign(STR.zh, {
  ab_smoke: "煙幕", ab_double: "雙發齊射", ab_keg: "火藥桶", ab_head: "船長技能",
  ab_smoke_ds: "{s} 秒內敵艦對你的齊射會大幅散開。這不是護盾，看到紅色扇形還是要閃。{cd} 秒後可再用。",
  ab_double_ds: "下一輪舷側齊射傷害加倍。射出後 {cd} 秒可再用。",
  ab_keg_ds: "從船尾丟下一個火藥桶，敵船靠近就爆炸，{f} 秒後也會自己引爆。懸賞首領只受輕傷，不會傷到你和你的隨從。{cd} 秒後可再用。",
  ab_byLine: "快速線：煙幕 · 重砲線：雙發齊射 · 單桅帆船：火藥桶。", ab_line: "技能：{name}",
  ab_ready: "就緒", ab_on: "生效中", ab_armed: "已裝填", ab_cool: "{n} 秒", ab_wait: "{name}：{n} 秒後可用", ab_tip: "{name}（{key}）：{state}",
  f_smoke: "放煙幕！", f_double: "雙發齊射！", f_dblLoad: "雙發齊射已裝填", f_keg: "火藥桶入水！",
});

// ---------- pure: which ability, and its clock ----------
const abilityOf = id => { const sh = SHIPS[id]; return sh && sh.line === "fast" ? "smoke" : sh && sh.line === "heavy" ? "double" : "keg"; };
const abilityCd = kind => (kind === "smoke" ? SMOKE_CD : kind === "double" ? DOUBLE_CD : KEG_CD);
// { cd: s until it can be used again, on: s of smoke left, armed: a double shot waiting for its broadside }
const abilityFresh = () => ({ cd: 0, on: 0, armed: false });
const abilityReady = st => st.cd <= 0 && st.on <= 0 && !st.armed;
const abilityTick = (st, dt) => ({ cd: Math.max(0, st.cd - dt), on: Math.max(0, st.on - dt), armed: st.armed });
// The clock after using `kind`, or null when it is not ready. Smoke's recharge counts from the moment it is lit (its SMOKE_T included);
// a double shot only loads: its recharge starts when the broadside goes (doubleTake).
function abilityUse(st, kind) {
  if (!abilityReady(st)) return null;
  if (kind === "smoke") return { cd: SMOKE_CD, on: SMOKE_T, armed: false };
  if (kind === "double") return { cd: 0, on: 0, armed: true };
  return { cd: KEG_CD, on: 0, armed: false };
}
// A fire that launched side guns (sideFired) spends a loaded double shot: { k: the damage factor for that fire's side guns, st: the clock after }.
// A bow or stern chaser alone does not spend it, and a second broadside gets 1 again.
const doubleTake = (st, sideFired) => (st.armed && sideFired ? { k: DOUBLE_K, st: { cd: DOUBLE_CD, on: 0, armed: false } } : { k: 1, st });
// Smoke: the extra error (rad) an enemy gun firing at a ship gets, for a roll in [-1, 1].
const smokeErr = (on, roll) => (on > 0 ? roll * SMOKE_SPREAD : 0);
// Keg: may this ship set it off / be hurt by it? Never the flagship, an escort, a fort, a struck ship or a Navy ship auto-fire skips
// (calm: the captain is not Wanted and it is not fighting him), so a drifting keg never makes him Wanted by accident.
const kegTarget = (e, calmNavy) => !!e && e.alive !== false && !e.isPlayer && !e.ally && !e.fixed && !e.struck && !calmNavy;
// The first ship close enough to set it off: within KEG_TRIGGER px of the keg plus the ship's own half-beam. `calm(e)` as above.
function kegTrip(k, ships, calm = () => false) {
  for (const e of ships) if (Math.hypot(e.x - k.x, e.y - k.y) < KEG_TRIGGER + (e.hw ?? 13) && kegTarget(e, calm(e))) return e;   // distance first: the calm check reads heat
  return null;
}
// Damage to ship `e` d px from the blast: KEG_K of its max hull (a boss KEG_BOSS_K) at the centre, 40% of that at KEG_R, 0 past it.
function kegDamage(e, d) {
  if (d >= KEG_R) return 0;
  return e.maxHp * (e.boss ? KEG_BOSS_K : KEG_K) * blastFalloff(d, KEG_R);
}

// ---------- live state ----------
let abil = abilityFresh(), kegs = [];
const abilityKind = () => abilityOf(typeof save !== "undefined" && save ? save.ship : "sloop");
const abilityAtSea = () => typeof player !== "undefined" && !!player && player.alive && !paused && !docked && !(typeof titleOpen !== "undefined" && titleOpen) && !(typeof photoOn === "function" && photoOn());
// For js/volley.js: extra aim error for a ball laid on `tg` now.
const abilityAimErr = tg => (tg && tg.isPlayer ? smokeErr(abil.on, rand(-1, 1)) : 0);
// For js/combat.js playerFire: the damage factor of this fire's side guns (spends a loaded double shot).
function abilityShotK(sideFired) {
  const r = doubleTake(abil, sideFired);
  if (r.k !== 1) { abil = r.st; abilityFx("double"); }
  return r.k;
}
// F, pad Y, the HUD button.
function useAbility() {
  if (!abilityAtSea()) return false;
  const kind = abilityKind(), next = abilityUse(abil, kind);
  if (!next) {
    if (typeof Snd !== "undefined") Snd.play("denied");
    if (abil.cd > 0 && !abil.armed) toast(t("ab_wait", { name: t("ab_" + kind), n: Math.ceil(abil.cd) }), true, 1400);
    return false;
  }
  abil = next;
  if (kind === "keg") dropKeg();
  abilityFx(kind === "double" ? "load" : kind);
  abilityRender(true);
  return true;
}
function dropKeg() {
  const back = (player.hl ?? 28) + 14, x = player.x - Math.cos(player.rot) * back, y = player.y - Math.sin(player.rot) * back;
  kegs.push({ x, y, t: 0, spr: S.add.image(x, y, kegTex()).setDepth(2.6) });
}
// A Navy ship not yet hunting us is left alone (autoSkips, js/combat.js), so a keg never makes the captain Wanted by accident. `stars` read once per pass.
const calmNavyAt = stars => e => typeof autoSkips === "function" && autoSkips(e, stars, isHostile(e, player));
const starsNow = () => (typeof heatStars === "function" ? heatStars(heatNow()) : 0);
function kegBlow(k) {
  const calm = calmNavyAt(starsNow());
  kegFx(k.x, k.y);
  for (const e of enemies) { const d = kegTarget(e, calm(e)) ? kegDamage(e, dist(e, k)) : 0; if (d > 0) hurt(e, d, 0, player); }   // the captain's kill: it pays (js/plunder.js)
  k.spr.destroy();
}
function kegTick(dt) {
  const calm = kegs.length ? calmNavyAt(starsNow()) : null;
  for (let i = kegs.length - 1; i >= 0; i--) {
    const k = kegs[i]; k.t += dt;
    k.spr.setPosition(k.x, k.y + Math.sin(k.t * 3) * 1.5).setRotation(Math.sin(k.t * 1.7) * 0.25);
    const left = KEG_FUSE - k.t;
    if (left < 3 && onScreen(k.x, k.y, 40) && Math.random() < 0.4) S.fx.spark.emitParticleAt(k.x + rand(-3, 3), k.y - 6, 1);   // the fuse burning down
    if (left <= 0 || kegTrip(k, enemies, calm)) { kegs.splice(i, 1); kegBlow(k); }
  }
}
function kegsClear() { for (const k of kegs) k.spr.destroy(); kegs = []; }

// ---------- drawing ----------
function kegTex() {
  const key = "abil-keg";
  if (!S.textures.exists(key)) bakeCanvas(S, key, 22, 22, 2, c => {
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(11, 13, 9, 7, 0, 0, TAU); c.fill();
    c.fillStyle = "#7a4a22"; c.strokeStyle = "#2a160a"; c.lineWidth = 1; c.beginPath(); c.ellipse(11, 11, 8, 6.5, 0, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = "#c9a35a"; c.lineWidth = 1.4; for (const x of [6.5, 15.5]) { c.beginPath(); c.moveTo(x, 5.3); c.lineTo(x, 16.7); c.stroke(); }   // the hoops
    c.fillStyle = "#1b1410"; c.beginPath(); c.arc(11, 11, 1.8, 0, TAU); c.fill();   // the bung, where the fuse goes in
  });
  return key;
}
// The keg's reach, faint, so the captain can lay it on a chaser's path; nothing in photo mode.
function kegRings() {
  if (!kegs.length || (typeof photoOn === "function" && photoOn())) return;
  const g = S.arcG, lk = labelScale();
  for (const k of kegs) {
    const urgent = KEG_FUSE - k.t < 3, a = urgent ? 0.35 + 0.25 * Math.sin(S.time.now * 0.02) : 0.22;
    g.lineStyle(1.5 * lk, urgent ? 0xff8a3a : 0xf0c766, a); strokeRing(g, k.x, k.y, KEG_TRIGGER + 10);
  }
}
function kegFx(x, y) {
  const P = typeof VN !== "undefined" && VN.pool;
  if (P && onScreen(x, y, 200)) {
    const c = { ...vnCtx(VFX_NEW.blast), pool: P };
    vnGlow(c, x, y, 220, 180, 0xfff0b0); vnFireball(c, x, y, 0.55); vnRing(c, x, y, 8, KEG_R, 420, 0xffd08a, 5, 0.9);
    vnSparks(c, x, y, vnN(c, 14), 200, 0.8, [0xffb347, 0xff7a2a]); vnSmokeColumn(c, x, y, vnN(c, 6), 26, 0.8, 150, 2);
  } else { S.fx.spark.explode(30, x, y); S.fx.smoke.explode(16, x, y); }
  vfxHitStop(0.05);
  if (dist(player, { x, y }) < 600) camShake(200, 0.007);
  Snd.play("magazine", { x, y });
}
// Smoke rolls off the hull while it lasts: big grey puffs that drift a little and fade, thick enough to read as cover.
let smokeAcc = 0;
function smokeTick(dt) {
  if (abil.on <= 0 || !player.alive) return;
  const P = typeof VN !== "undefined" && VN.pool;
  for (smokeAcc += dt; smokeAcc >= 0.04; smokeAcc -= 0.04) {
    const a = rand(0, TAU), r = rand(10, 80), x = player.x + Math.cos(a) * r, y = player.y + Math.sin(a) * r;
    if (P) vnPuff({ pool: P }, x, y, { vx: rand(-14, 14), vy: rand(-14, 6), drag: 0.4, s0: 44, s1: rand(130, 180), life: rand(1.6, 2.4), a0: 0.7, a1: 0, tint: rand(0, 1) < 0.5 ? 0xcfc9bb : 0xa8a296, depth: 8.6 });
    else S.fx.smoke.emitParticleAt(x, y, 1);
  }
}
// While a double shot waits: embers at both broadsides' gun rows, so the captain sees the guns are double-loaded.
function doubleTick() {
  if (!abil.armed || !player.alive || Math.random() > 0.35) return;
  const side = Math.random() < 0.5 ? MOUNTS[1] : MOUNTS[2], arr = player.guns[side.key];
  if (!arr || !arr.length) return;
  const g = arr[(Math.random() * arr.length) | 0], m = muzzle(player, side, g.pi, g.pn);
  S.fx.spark.emitParticleAt(m.x, m.y, 1);
}
function abilityFx(kind) {
  const lk = labelScale(), word = { smoke: "f_smoke", double: "f_double", load: "f_dblLoad", keg: "f_keg" }[kind];
  if (word) floatText(player.x, player.y - 46 * lk, t(word), kind === "smoke" ? "#e6e0d2" : "#ffb04a", kind === "double" ? 22 : 18);
  if (typeof Snd === "undefined") return;
  if (kind === "smoke") Snd.play("burn", { x: player.x, y: player.y });
  else if (kind === "load") Snd.play("reload");
  else if (kind === "keg") Snd.play("splash", { x: player.x, y: player.y });
}

// ---------- the HUD button ----------
const AB_ICON = {
  smoke: '<path d="M6 17a4 4 0 0 1 .6-8A5.5 5.5 0 0 1 17 8.2 4.4 4.4 0 0 1 18 17Z" fill="currentColor" opacity=".9"/><circle cx="8" cy="19.5" r="1.6" fill="currentColor" opacity=".6"/><circle cx="14" cy="20.5" r="1.2" fill="currentColor" opacity=".45"/>',
  double: '<circle cx="8" cy="12" r="4.6" fill="currentColor"/><circle cx="17" cy="12" r="4.6" fill="currentColor"/><path d="M2 5l3 2M2 19l3-2M22 5l-3 2M22 19l-3-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  keg: '<rect x="5" y="6" width="14" height="14" rx="5" fill="currentColor"/><path d="M5.5 10h13M5.5 16h13" stroke="#1b2b30" stroke-width="1.6"/><path d="M12 6c0-2 1.5-3 3.5-3.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
};
let abBtn = null, abShown = null, abKindNow = "", abSig = "", abP = "";   // abP: the pie value last written (--p), so a ready button is not restyled every frame
function abilityUi() {
  abBtn = document.createElement("button");
  abBtn.id = "abilityBtn"; abBtn.type = "button"; abBtn.hidden = true;
  abBtn.innerHTML = `<svg class="ab-ic" viewBox="0 0 24 24" aria-hidden="true"></svg><b class="ab-cd" aria-hidden="true"></b><kbd class="ab-key" aria-hidden="true"></kbd>`;
  document.body.append(abBtn);
  abBtn.addEventListener("pointerdown", e => e.stopPropagation());   // never reaches the sea's stick or the mouse helm
  abBtn.addEventListener("click", () => { useAbility(); abBtn.blur(); });   // blur: Space must not "click" it again
}
const abKey = () => (device === "pad" ? "Y" : device === "touch" ? "" : "F");
const abState = () => (abil.on > 0 ? "on" : abil.armed ? "armed" : abil.cd > 0 ? "cool" : "ready");
// Re-rendered only when something it shows changed (whole seconds, state, kind, key, language).
function abilityRender(force) {
  if (!abBtn) return;
  const kind = abilityKind(), st = abState(), key = abKey(), left = st === "on" ? abil.on : st === "cool" ? abil.cd : 0, secs = Math.ceil(left);
  const p = clamp(left / (st === "on" ? SMOKE_T : abilityCd(kind)), 0, 1).toFixed(3);   // the cooldown pie; 0 when ready or loaded
  if (p !== abP) { abP = p; abBtn.style.setProperty("--p", p); }
  const sig = [kind, st, key, secs, lang].join("|");
  if (!force && sig === abSig) return;
  abSig = sig;
  if (kind !== abKindNow) { abKindNow = kind; abBtn.querySelector(".ab-ic").innerHTML = AB_ICON[kind]; }
  abBtn.dataset.kind = kind; abBtn.dataset.state = st;
  abBtn.querySelector(".ab-cd").textContent = secs ? String(secs) : "";
  const k = abBtn.querySelector(".ab-key"); k.textContent = key; k.hidden = !key;
  const state = st === "ready" ? t("ab_ready") : st === "on" ? t("ab_on") : st === "armed" ? t("ab_armed") : t("ab_cool", { n: secs });
  const label = key ? t("ab_tip", { name: t("ab_" + kind), key, state }) : t("ab_" + kind) + " · " + state;
  abBtn.setAttribute("aria-label", label); abBtn.title = label + "\n" + abilityDesc(kind);
}
// Where the button goes (pure, CSS px): the first spot of a short list that covers none of the HUD's rects, else the one that covers least.
// ts: the touch sail buttons' rect (null off a touch screen), side: the chart column's, hintTop: where the hint line starts. A phone in
// landscape has its chart column right above the sail buttons, so there the button moves up and to their left instead of on top (#16).
const AB_SIZE = 56, AB_GAP = 8;
function abilitySpot(vw, vh, { ts, side, hintTop }, obstacles) {
  const s = AB_SIZE, g = AB_GAP, base = ts || { left: vw - 12 - s, right: vw - 12, top: Math.min(hintTop ?? vh, vh - 28) - 10, bottom: Math.min(hintTop ?? vh, vh - 28) - 10 };
  const above = ts ? ts.top - g - s : base.top - s;
  const cands = [{ left: base.right - s, top: above }];
  // beside the sail buttons but raised above their row first: the bottom row belongs to the edge boxes (js/edge-marks.js), which need the gap
  // between the hint and the sail buttons; level with the buttons is the fallback
  if (ts) cands.push({ left: ts.left - g - s, top: above }, { left: ts.left - g - s, top: ts.bottom - s }, { left: ts.left, top: above });
  if (side) cands.push({ left: side.left - g - s, top: above });
  const cover = c => obstacles.reduce((a, o) => a + Math.max(0, Math.min(o.right, c.left + s) - Math.max(o.left, c.left)) * Math.max(0, Math.min(o.bottom, c.top + s) - Math.max(o.top, c.top)), 0);
  const inside = c => c.left >= 4 && c.top >= 4 && c.left + s <= vw - 4 && c.top + s <= vh - 4;
  let best = null, bestA = Infinity;
  for (const c of cands) {
    if (!inside(c)) continue;
    const a = cover(c);
    if (a <= 1) return c;
    if (a < bestA) { best = c; bestA = a; }
  }
  return best || cands[0];
}
const abRect = sel => { const el = document.querySelector(sel); if (!el || el.hidden || getComputedStyle(el).display === "none") return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
let abPlaceT = 0;
function abilityPlace() {
  const ts = abRect("#touchSail"), side = abRect("#hud .side"), hint = abRect("#hint");
  const obstacles = ["#touchSail", "#hud .side", "#hud .bars", "#hint", "#bossBar", "#homeChip", "#runClock"].map(abRect).filter(Boolean);
  const c = abilitySpot(innerWidth, innerHeight, { ts, side, hintTop: hint ? hint.top : null }, obstacles);
  const l = Math.round(c.left) + "px", tp = Math.round(c.top) + "px";
  if (abBtn.style.left !== l) abBtn.style.left = l;
  if (abBtn.style.top !== tp) abBtn.style.top = tp;
}
const abilityDesc = kind => t("ab_" + kind + "_ds", { s: SMOKE_T, cd: abilityCd(kind), f: KEG_FUSE });
// The flagship's hull panel names its ability (js/ledger-panel.js), under the ram.
const abilityRowHtml = () => { const kind = abilityKind(); return `<div class="item" id="abilityRow"><div class="nm">${t("ab_head")}<small>${t("ab_" + kind)}</small></div><div class="ds">${abilityDesc(kind)} ${t("ab_byLine")}</div></div>`; };

if (typeof document !== "undefined" && document.body) {
  abilityUi();
  onHook("sail", () => { abil = abilityFresh(); kegsClear(); abilityRender(true); });
  onHook("dock", () => { abil = { ...abil, on: 0 }; kegsClear(); abShown = false; abBtn.hidden = true; });
  onHook("frame", dt => {
    const sea = abilityAtSea();
    if (sea) {   // paused, docked and the title freeze the clock (photo mode is a pause)
      abil = abilityTick(abil, dt);
      kegTick(dt); smokeTick(dt); doubleTick();
    }
    kegRings();
    const show = !!player && player.alive && !docked && !titleOpen && !(typeof photoOn === "function" && photoOn());   // css/safety.css hides it under the pause sheet
    if (abShown !== show) { abShown = show; abBtn.hidden = !show; abPlaceT = 0; }
    if (!show) return;
    abilityRender(false);
    if ((abPlaceT -= dt) <= 0) { abPlaceT = 0.25; abilityPlace(); }   // a layout read: 4 times a second, like the hint's height (js/notify-order.js)
  });
  document.addEventListener("langchange", () => abilityRender(true));
  document.addEventListener("devicechange", () => abilityRender(true));
}
