"use strict";
// ---------- Gear at sea: what the worn parts do, the drops, the legendary tricks ----------
// gx(key) is the total of one effect over the worn parts (js/gear-core.js gearTotals, cached until the worn set changes), 0 with none, so every
// hook below is a plain multiplier that does nothing for a captain without gear. The wiring: ships.js (hull, speed, turn, hold, guns, drag and swift
// speed), collision.js (ram, brace, keep, jolt, scatter), arsenal.js (armor, aim, marks, fire), weather.js (wind, storm), repair.js, powder.js, ports.js
// (supply stations), heat.js, plunder.js (loot), vfx.js and edge-marks.js (view), volley.js (the flag's rally). A daily or seeded run plays on a default
// save (js/run.js), which has no gear: the fixed loadout stays fixed. Escorts wear nothing: their numbers are their ship's (js/escorts.js); only the
// flag's escDef and rally reach them, as orders from the flagship.
Object.assign(STR.en, { gxMarked: "Weak point marked", gxStand: "Steady!", gxScatter: "Line broken!" });
Object.assign(STR.zh, { gxMarked: "弱點已標記", gxStand: "穩住！", gxScatter: "隊形被打亂！" });

const gxTotals = (() => {
  let worn = null, tot = {};
  return () => { const w = typeof save !== "undefined" && save && save.gear ? save.gear.worn : null; if (w !== worn) { worn = w; tot = w ? gearTotals(w) : {}; } return tot; };
})();
const gx = k => gxTotals()[k] || 0;
const gxLegend = part => typeof save !== "undefined" && !!save && !!save.gear && gearLegend(save.gear.worn, part);
const gxNow = () => (typeof S !== "undefined" && S && S.time ? S.time.now / 1000 : 0);
const gxFresh = () => ({ stand: false, standUntil: 0, swiftUntil: 0, swiftAt: -99, turned: [], prevRot: null, markAt: 0, rallyUntil: 0 });
let gxS = gxFresh();   // one sortie's state
onHook("sail", () => { gxS = gxFresh(); });

// ---------- the guns ----------
// One player gun as combat reads it: `gun` the save item, G its type, m its Lv x hull factor.
function gxGun(gun, G, m) {
  const mod = gunMods(gun), plain = !G.burn && !G.chain;
  return { dmg: G.dmg * m * (1 + mod.gdmg), burn: G.burn ? G.burn * m * (1 + mod.gdmg) * (1 + mod.gtype) : 0, chain: !!G.chain, chainT: G.chain ? CHAIN_T * (1 + mod.gtype) : 0,
    drag: gun.lg ? GEAR_LEGX.drag.t : 0, range: G.range * (1 + mod.grange + gx("reach")), speed: (G.speed || BALL_SPEED) * (plain ? 1 + mod.gtype : 1),
    interval: 60 / G.rpm / (1 + mod.greload), cd: 0 };
}

// ---------- collisions ----------
// Damage `s` takes from a collision with `o` (null: a rock) is scaled: your brace lowers what you take, your ram raises what the other ship takes.
const gxHitK = (s, o) => (s.isPlayer ? gearCut("brace") : o && o.isPlayer ? gearMul("ram") : 1);
// Speed `s` keeps after a collision: yours by keep, a ship you rammed loses jolt more.
const gxShed = (s, o) => (s.isPlayer ? CRASH_SHED + (1 - CRASH_SHED) * gx("keep") : o && o.isPlayer ? CRASH_SHED * (1 - gx("jolt")) : CRASH_SHED);
function gxRam(a, b, closing) {   // the legendary prow: a hard ram tears the other ship's rigging
  const o = a.isPlayer ? b : b.isPlayer ? a : null, x = GEAR_LEGX.scatter;
  if (!o || o.ally || !gxLegend("prow") || !(closing > x.closing)) return;
  o.chainT = Math.max(o.chainT || 0, x.t);
  if (onScreen(o.x, o.y)) floatText(o.x, o.y - 54, t("gxScatter"), "#ffd36a", 15);
}

// ---------- damage in and out (called from onHit, js/arsenal.js) ----------
function gxHurt(s, dmg, src, ball) {
  const now = gxNow();
  if (s.isPlayer) {
    if (ball) dmg *= gearCut("armor");
    if (gxLegend("body")) {   // once a sortie, low on hull: a short steady spell
      const x = GEAR_LEGX.lastStand;
      if (!gxS.stand && s.hp - dmg < s.maxHp * x.below) { gxS.stand = true; gxS.standUntil = now + x.t; if (onScreen(s.x, s.y)) floatText(s.x, s.y - 54, t("gxStand"), "#9fe09a", 16); }
      if (gxS.standUntil > now) dmg *= 1 - x.cut;
    }
    return dmg;
  }
  if (s.ally) return dmg * gearCut("escDef");
  if (src !== player) return dmg;
  if (s.markT > now) dmg *= 1 + GEAR_LEGX.mark.k;
  if (ball && ball.fromPlayer && ball.life0 > 0) dmg *= 1 + gx("aim") * clamp(1 - ball.life / ball.life0, 0, 1);   // the far shot hits harder
  if (ball && ball.drag > 0) s.dragT = ball.drag;
  if (gxLegend("flag") && !(now - (s.rallyAt ?? -99) < GEAR_LEGX.rally.gap)) { s.rallyAt = now; gxS.rallyUntil = now + GEAR_LEGX.rally.t; }
  return dmg;
}
const gxSpeedK = s => (s.dragT > 0 ? 1 - GEAR_LEGX.drag.k : 1) * (s.isPlayer && gxS.swiftUntil > gxNow() ? 1 + GEAR_LEGX.swift.k : 1);
const gxRally = () => (gxS.rallyUntil > gxNow() ? 1 + GEAR_LEGX.rally.k : 1);
const gxDockK = () => (gxLegend("supply") ? GEAR_LEGX.dock.k : 1);

// ---------- per frame: the swift sail and the instruments' mark ----------
onHook("frame", () => {
  if (typeof player === "undefined" || !player || !player.alive || paused || docked || !save.gear) return;
  const now = gxNow();
  if (gxLegend("sail")) {   // enough turning inside a second: a burst of speed, then a rest
    const x = GEAR_LEGX.swift, turned = gxS.turned;
    if (gxS.prevRot != null) turned.push({ t: now, d: Math.abs(angDiff(player.rot, gxS.prevRot)) });
    while (turned.length && now - turned[0].t > x.within) turned.shift();
    if (turned.reduce((a, b) => a + b.d, 0) >= x.turn && now - gxS.swiftAt >= x.cd) { gxS.swiftAt = now; gxS.swiftUntil = now + x.t; turned.length = 0; }
  }
  gxS.prevRot = player.rot;
  if (gxLegend("instr") && now >= gxS.markAt) {   // the nearest hostile ship in reach is marked for a while
    const x = GEAR_LEGX.mark, near = enemies.filter(e => e.alive && !e.ally && !e.struck && !e.fixed && dist(e, player) < x.r).sort((a, b) => dist(a, player) - dist(b, player))[0];
    if (near) { near.markT = now + x.t; gxS.markAt = now + x.cd; if (onScreen(near.x, near.y)) floatText(near.x, near.y - 54, t("gxMarked"), "#ffd36a", 14); }
  }
});

// ---------- drops ----------
function gxRoll() { return Math.random(); }   // a function so the browser test can fix the rolls
function gxGive(it, at) {
  const r = gearDrop(save, it), name = gearTitle(it), rar = gearR(it);
  save = r.save; persist();
  if (at && typeof floatText === "function") floatText(at.x, at.y - 74, name, GEAR_COLORS[rar], 15 + rar);
  toast(r.kind === "scrap" ? t("gScrapFull", { name, m: r.mats }) : rar >= 2 ? t("gGot", { name, r: t("gr_" + rar), n: gearIl(it) }) : t("gGotShort", { name }));
  if (rar >= 2) sfx("bell", { pitch: 0.6 + rar * 0.15 });
  return r;
}
// A sinking you make: an ordinary roll by faction (and the flag's luck), plus one guaranteed rare-or-better piece from a bounty captain or the Admiral.
onHook("sunk", (s, killer) => {
  if (killer !== player || s.isPlayer || s.ally || s.boarded || !save.gear || !save.tutorialDone || (typeof portsOff === "function" && portsOff())) return;
  const ring = s.ring || ringAt(dist(s, PORT)), tier = gearTierOf(save.ship), luck = gx("luck"), faction = s.fixed ? "pirate" : s.faction;
  const boss = (s.boss && !s.rematch) || s.admiral;
  const drops = [];
  if (boss) drops.push(gearDropRoll({ faction, boss: true, luck, ring, tier }, gxRoll));
  if (!boss || GEAR_DROP.bossExtra) drops.push(gearDropRoll({ faction, luck, ring, tier }, gxRoll));
  drops.filter(Boolean).forEach((it, i) => gxGive(it, { x: s.x, y: s.y + i * 22 }));
});
