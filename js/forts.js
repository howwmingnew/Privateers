"use strict";
// ---------- Shore batteries ----------
// From FORT_L, a few islands carry a pirate battery: a stone fort with a ring of guns (range 420, fast balls) that fires
// in every direction at anyone the pirates fight, and a treasure crate on the beach below it. The same islands every
// sortie (picked from the map), rebuilt with each fresh sea. A battery only exists as a ship while the player is near,
// so it never counts against the sea's population for long and the distance despawn can't lose it.
const FORT_L = 8, FORT_MAX = 4, FORT_NEAR = 2200, TREASURE_K = 3;
let fortSites = [];

function fortTex(sc) {
  if (sc.textures.exists("fort")) return "fort";
  const g = sc.make.graphics({ add: false }), C = 34;
  g.fillStyle(0x000000, 0.25); g.fillCircle(C + 2, C + 3, 27);
  for (let i = 0; i < 3; i++) {   // three guns run out of the embrasures
    const a = i / 3 * TAU - Math.PI / 2;
    g.lineStyle(7, 0x2b2622, 1); g.lineBetween(C + Math.cos(a) * 14, C + Math.sin(a) * 14, C + Math.cos(a) * 32, C + Math.sin(a) * 32);
  }
  g.fillStyle(0x8f8a7e, 1); g.fillCircle(C, C, 25);
  g.fillStyle(0x6f6a60, 1);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; g.fillRect(C + Math.cos(a) * 22 - 3.5, C + Math.sin(a) * 22 - 3.5, 7, 7); }   // crenels
  g.fillStyle(0xb5ad9b, 1); g.fillCircle(C, C, 16);
  g.fillStyle(0x3b2414, 1); g.fillRect(C - 1, C - 15, 2, 15);
  g.fillStyle(0x121014, 1); g.fillTriangle(C + 1, C - 15, C + 13, C - 11, C + 1, C - 7);   // black flag
  g.fillStyle(0xefeae0, 1); g.fillCircle(C + 5, C - 11, 1.6);
  g.generateTexture("fort", C * 2, C * 2); g.destroy();
  return "fort";
}
// Battery sites: the L8+ islands, spread out (every k-th by seed), each with the side facing open water.
function pickFortSites() {
  const deep = islands.filter(i => levelAt(Math.hypot(i.x - PORT.x, i.y - PORT.y)) >= FORT_L).sort((a, b) => a.seed - b.seed);
  const k = Math.max(1, Math.floor(deep.length / FORT_MAX)), out = [];
  for (let i = 0; i < deep.length && out.length < FORT_MAX; i += k) {
    const isl = deep[i], a = Math.atan2(PORT.y - isl.y, PORT.x - isl.x), rho = isl.r * 0.9 - 24;   // ships can't get within 40 px
    out.push({ isl, a, x: isl.x + Math.cos(a) * rho, y: isl.y + Math.sin(a) * rho, L: levelAt(Math.hypot(isl.x - PORT.x, isl.y - PORT.y)), hp: null, ent: null, crate: null });
  }
  return out;
}
// A fresh sea (js/harbor.js resetEnemies): every battery rebuilt at full strength, with a new treasure crate.
function seaReset(sc) {
  for (const s of fortSites) if (s.crate) { const i = crates.indexOf(s.crate); if (i >= 0) { s.crate.spr.destroy(); crates.splice(i, 1); } }
  fortSites = pickFortSites();
  for (const s of fortSites) {
    const r = s.isl.r * 0.9 + 40;
    s.crate = addCrate(s.isl.x + Math.cos(s.a) * r, s.isl.y + Math.sin(s.a) * r, Math.round(enemyStats(s.L, false).loot * TREASURE_K), null);
  }
}
function makeFort(sc, site) {
  const e = makeShip(sc, fortTex(sc), site.x, site.y);
  Object.assign(e, { L: site.L, faction: "pirate", rot: 0, angry: 0, thinkT: 0, wander: null, target: null, chaseFrom: { x: site.x, y: site.y },
    retarget: 0, attacker: null, ignore: new Map(), site, isl: site.isl });
  outfitEnemy(e, "fort");
  if (site.hp != null) e.hp = site.hp;
  e.hl = 1; e.hw = 30;   // round: hitShip's capsule shrunk to a circle
  e.spr.setDepth(4);
  e.badge = sc.add.text(e.x, e.y - 36, "", { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#1b1410", padding: { x: 5, y: 1 } }).setOrigin(0.5).setDepth(9);
  refreshBadge(e);
  enemies.push(e);
  return e;
}
function updateForts() {
  for (const s of fortSites) {
    if (s.crate) {   // the treasure never expires (wind its clock back by whole bobs, so the bobbing stays smooth)
      if (s.crate.value > 0 && crates.includes(s.crate)) { if (s.crate.t > 40) s.crate.t -= 20 * TAU / 3; } else s.crate = null;
    }
    if (s.ent && !s.ent.alive) { s.hp = Math.max(0, s.ent.hp); s.ent = null; if (s.hp <= 0) s.hp = 0; }
    if (!s.ent && s.hp !== 0 && player.alive && !docked && dist(player, s) < FORT_NEAR) s.ent = makeFort(S, s);
  }
}
// A battery stands inside its island's rock; its balls leave from where the line of fire clears the shore.
function fortMuzzle(s, ang) {
  if (!s.isl) return { x: s.x + Math.cos(ang) * 32, y: s.y + Math.sin(ang) * 32 };
  const isl = s.isl, R = isl.r * 0.9 + 6, dx = s.x - isl.x, dy = s.y - isl.y, c = Math.cos(ang), sn = Math.sin(ang);
  const b = dx * c + dy * sn, q = dx * dx + dy * dy - R * R, t = -b + Math.sqrt(Math.max(0, b * b - q));
  return { x: s.x + c * t, y: s.y + sn * t };
}
// Forts never move; they only pick a target (think() hands them here).
function fortThink(e, dt) {
  const now = S.time.now / 1000;
  e.angry = Math.max(0, e.angry - dt); e.speed = 0;
  if (e.target && (!isHostile(e, e.target) || dist(e, e.target) > e.range * 1.3)) e.target = null;
  e.retarget -= dt;
  if (e.retarget <= 0) { e.retarget = 0.5; const nt = pickTarget(e, now); if (nt) e.target = nt; }
}
