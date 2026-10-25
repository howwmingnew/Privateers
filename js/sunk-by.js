"use strict";
// ---------- Who sank you, and where (#109) ----------
// A new captain who goes down needs to know what to avoid next time: the ship type and Lv that fired the last shot, and the
// sea it happened in (its Lv range tells how far over the captain's own rating that water is). sink() calls noteSunk() with the
// killer; the toast and the ledger's first line (js/harbor.js renderPort) read sunkByText(), built in the current language.
Object.assign(STR.en, {
  sunkBy: "Sunk by {who} in {sea} (Lv {a}–{b}).", sunkNoShip: "You went down in {sea} (Lv {a}–{b}).",
  sunkWho: "a {kind} (Lv {L})", sunkBoss: "{name} (Lv {L})", sunkKind: "{fac} {cls}", sunkShip: "ship", sunkAlly: "one of your own escorts (Lv {L})",
  sunkFac_pirate: "pirate", sunkFac_navy: "Navy", sunkFac_merchant: "merchant",
  cls_fluyt: "fluyt", cls_fort: "shore battery",
});
Object.assign(STR.zh, {
  sunkBy: "擊沉你的是{who}，地點在{sea}（Lv {a}–{b}）。", sunkNoShip: "你沉在{sea}（Lv {a}–{b}）。",
  sunkWho: "Lv {L} 的{kind}", sunkBoss: "{name}（Lv {L}）", sunkKind: "{fac}{cls}", sunkShip: "船", sunkAlly: "你自己的隨從（Lv {L}）",
  sunkFac_pirate: "海盜", sunkFac_navy: "海軍", sunkFac_merchant: "商船",
  cls_fluyt: "商船", cls_fort: "岸防砲台",
});
let lastSunk = null;   // { sea, boss, L, arch, faction, ship, ally } of the latest sinking of the player; sea is a SEAS id
// Pure: the record for a sinking at (x, y) by `killer` (a ship, or null for the sea itself, a hazard or a reef).
function sunkRecord(killer, x, y) {
  const sea = seaOfRing(ringAt(Math.hypot(x - PORT.x, y - PORT.y))).id;
  const k = killer && killer !== player ? killer : null;
  return { sea, boss: k && k.boss ? k.boss : null, L: k ? Math.round(k.L) : 0, arch: k ? (k.arch || k.cls || "") : "", faction: k ? k.faction || "" : "", ship: !!k, ally: !!(k && k.ally) };
}
function noteSunk(killer) { lastSunk = sunkRecord(killer, player.x, player.y); }
// The sentence for the last sinking, or "" when none was noted.
function sunkByText() {
  const r = lastSunk;
  if (!r) return "";
  const s = SEAS.find(x => x.id === r.sea), bonus = levelBonus() + warLevels(s.L0);
  const where = { sea: t("sea_" + r.sea), a: s.L0 + bonus, b: s.L1 + bonus };
  if (!r.ship) return t("sunkNoShip", where);
  const cls = STR.en["cls_" + r.arch] !== undefined ? t("cls_" + r.arch) : "";
  const fac = STR.en["sunkFac_" + r.faction] !== undefined && r.arch !== "fluyt" && r.arch !== "fort" ? t("sunkFac_" + r.faction) : "";
  const kind = t("sunkKind", { fac, cls }).trim() || t("sunkShip");   // a type the strings do not know still reads as "a ship"
  const who = r.boss ? t("sunkBoss", { name: t("boss_" + r.boss), L: r.L }) : r.ally ? t("sunkAlly", { L: r.L }) : t("sunkWho", { kind, L: r.L });
  return t("sunkBy", { who, ...where });
}
// A ledger line that opens after a sinking carries the sentence (js/harbor.js renderPort); every other message gets nothing.
const sunkByHtml = msg => (lastSunk && /^sunk/.test(msg[0]) ? " " + sunkByText() : "");
