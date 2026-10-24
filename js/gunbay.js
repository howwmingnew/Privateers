"use strict";
// ---------- Harbor ledger: picking guns up, the gun store under the gun deck, the armory ----------
// Guns are items { g, lv } (js/data.js). Tap a gun port or a stored gun to pick it (deckSel). Tapping another only moves the
// pick; to trade places the card's "Swap position" button must be pressed first (swapping), and then the next tap on another
// port or stored gun swaps the two: port <-> port, or port <-> store (an empty port takes the stored gun, and the store
// closes up). Esc, the button again, or tapping the picked gun cancels. The picked gun's card offers its own upgrade
// (named with the next level and its price), and "to store" for a mounted one. The armory sells one gun at a time; it lands in
// the store already picked, so the next tap on a port mounts it. renderPort (js/harbor.js) calls renderGunBay and
// armoryHtml; its click handler hands every gun action to gunAct.
Object.assign(STR.en, {
  bay: "Gun store", bayEmpty: "Nothing in store. Guns bought in the armory wait here until you mount them.",
  emptyPort: "Empty", toStore: "To store", owned: "{n} owned", storeAria: "Stored gun {n}: {gun}, Lv {lv}",
  selHint: "Press Swap position to trade this gun's place with another port or a stored gun.", selEmpty: "Empty gun port: press Swap position, then choose a stored gun to mount it here.",
  swapGun: "Swap position", swapCancel: "Cancel swap", swapHint: "Swapping: now choose the other gun port or stored gun. Esc cancels.",
  upTo: "Upgrade to Lv {n} ({cost} gold)", upShort: "Upgrade to Lv {n} ({cost} gold, {d} short)",
});
Object.assign(STR.zh, {
  bay: "火砲庫存", bayEmpty: "庫存是空的。在軍械庫買的砲會先放在這裡，等你裝上船。",
  emptyPort: "空砲位", toStore: "卸到庫存", owned: "持有 {n} 門", storeAria: "庫存第 {n} 門：{gun}，Lv {lv}",
  selHint: "按「切換砲位」，再選另一個砲位或庫存裡的砲，才會互換。", selEmpty: "空砲位：按「切換砲位」，再選庫存裡的砲就能裝到這裡。",
  swapGun: "切換砲位", swapCancel: "取消切換", swapHint: "切換中：請選另一個砲位或庫存裡的砲。按 Esc 可取消。",
  upTo: "升級到 Lv {n}（{cost} 金幣）", upShort: "升級到 Lv {n}（{cost} 金幣，還差 {d}）",
});
const GUN_ACTS = ["slot", "store", "buy", "gup", "unload", "swap"];
let deckSel = null;   // the picked port or stored gun: { side: mount key | "store", i }, or null
let swapping = false;   // "Swap position" is on: the next tap on another port or stored gun swaps it with the picked one
const gunAt = p => (p && save[p.side] && save[p.side][p.i]) || null;
const isPicked = (side, i) => !!deckSel && deckSel.side === side && deckSel.i === i;
function withGun(s, side, i, gun) { const arr = s[side].slice(); arr[i] = gun; return { ...s, [side]: arr }; }
// Swap what two places hold. A stored gun moved into an empty port leaves a hole, so the store closes up.
function swapGuns(a, b) {
  const ga = gunAt(a), gb = gunAt(b);
  const s = withGun(withGun(save, a.side, a.i, gb), b.side, b.i, ga);
  return { ...s, store: s.store.filter(Boolean) };
}
const gunStats = (g, lv) => { const G = GUNS[g], m = gunLvMul(lv);
  return t("dmg", { n: Math.round(G.dmg * m) }) + (G.burn ? t("burn", { n: Math.round(G.burn * m * BURN_T) }) : ""); };

// ---------- actions: each returns the sound to play, or null when nothing happened ----------
// Every place the picked one could trade with: the other ports and the stored guns (two empties, or two stored guns, make no trade).
function swapPlaces(from) {
  const all = MOUNTS.flatMap(({ key }) => save[key].map((_, i) => ({ side: key, i }))).concat(save.store.map((_, i) => ({ side: "store", i })));
  return all.filter(p => !(p.side === from.side && p.i === from.i) && (gunAt(from) || gunAt(p)) && !(from.side === "store" && p.side === "store"));
}
const canSwap = () => !!deckSel && swapPlaces(deckSel).length > 0;
function cancelSwap() {   // Esc (js/menu.js goBack): true when a swap was waiting and is now called off
  if (!swapping) return false;
  swapping = false; renderPort(); document.querySelector('#gunSel [data-act="swap"]')?.focus();
  return true;
}
function pickGun(side, i) {
  const at = { side, i }, trade = swapping && !!deckSel && !isPicked(side, i) && swapPlaces(deckSel).some(p => p.side === side && p.i === i);
  if (trade) { save = swapGuns(deckSel, at); deckSel = null; swapping = false; return "reload"; }   // a gun run into its port
  const cancel = swapping && isPicked(side, i);   // tapping the picked gun again only calls the swap off
  swapping = false;   // any other tap ends the swap too: it moves the pick
  if (!cancel) deckSel = isPicked(side, i) ? null : at;
  return "uiClick";
}
function gunAct(act, d) {
  if (act === "slot" || act === "store") return pickGun(act === "store" ? "store" : d.side, +d.i);
  if (act === "swap") { if (!canSwap()) return null; swapping = !swapping; return "uiClick"; }
  if (act === "buy") {
    const id = d.id, cost = Object.hasOwn(GUNS, id) ? GUNS[id].cost : Infinity;
    if (save.gold < cost || save.store.length >= MAX_STORE) return null;
    save = { ...save, gold: save.gold - cost, store: save.store.concat([gunItem(id)]) };
    deckSel = { side: "store", i: save.store.length - 1 }; swapping = false;
    portMsg = ["bought", { gun: t("gf_" + id) }];
    return "buy";
  }
  const gun = gunAt(deckSel);
  if (!gun) return null;
  if (act === "gup") {
    const cost = gunUpCost(gun);
    if (gun.lv >= GUN_MAX || save.gold < cost) return null;
    save = withGun({ ...save, gold: save.gold - cost }, deckSel.side, deckSel.i, gunItem(gun.g, gun.lv + 1));
    return "upgrade";
  }
  if (act === "unload" && deckSel.side !== "store" && save.store.length < MAX_STORE) {   // a full store would drop it on the next load
    save = { ...withGun(save, deckSel.side, deckSel.i, null), store: save.store.concat([gun]) };
    deckSel = { side: "store", i: save.store.length - 1 }; swapping = false;
    return "uiClick";
  }
  return null;
}

// ---------- markup ----------
function renderGunBay() {
  if (deckSel && !(deckSel.i < (save[deckSel.side] || []).length)) deckSel = null;   // the store shrank, or a new ship
  if (!canSwap()) swapping = false;
  document.getElementById("port").classList.toggle("swapping", swapping);   // lights every place the picked gun could trade with
  document.getElementById("gunSel").innerHTML = gunCardHtml();
  document.getElementById("bay").innerHTML = `<div class="lbl">${t("bay")}</div>` + (save.store.length
    ? `<div class="slots">${save.store.map((gun, i) => `<button class="slot${isPicked("store", i) ? " sel" : ""}" type="button" data-act="store" data-i="${i}" aria-pressed="${isPicked("store", i)}" ` +
      `aria-label="${t("storeAria", { n: i + 1, gun: t("gf_" + gun.g), lv: gun.lv })}">${t("g_" + gun.g)}<small>Lv ${gun.lv}</small></button>`).join("")}</div>`
    : `<p class="hint-s">${t("bayEmpty")}</p>`);
}
function gunCardHtml() {
  if (!deckSel) return "";
  const gun = gunAt(deckSel);
  const swap = swapButtonHtml(), hint = swapping ? t("swapHint") : null;
  if (!gun) return `<div class="gcard${swapping ? " swapping" : ""}"><div class="gacts">${swap}</div><p class="hint-s">${hint || t("selEmpty")}</p></div>`;
  const G = GUNS[gun.g], max = gun.lv >= GUN_MAX, cost = max ? 0 : gunUpCost(gun), short = cost - save.gold;
  const up = max ? `<button class="btn max" type="button" disabled>${t("max")}</button>`
    : `<button class="btn" type="button" data-act="gup" ${short > 0 ? "disabled" : ""}>${upgradeLabel(gun.lv + 1, cost, short)}</button>`;
  const off = deckSel.side === "store" || save.store.length >= MAX_STORE ? "" : `<button class="btn ghost" type="button" data-act="unload">${t("toStore")}</button>`;
  const next = max ? "" : ` <span class="up">→ ${Math.round(G.dmg * gunLvMul(gun.lv + 1))}</span>`;
  return `<div class="gcard${swapping ? " swapping" : ""}"><div class="nm">${t("gf_" + gun.g)}<small>Lv ${gun.lv}</small></div><div class="gacts">${up}${swap}${off}</div>
    <div class="ds">${gunStats(gun.g, gun.lv)}${next} · ${t("range", { n: G.range })} · ${t("rpm", { n: G.rpm })}${G.chain ? t("chainFx", { n: CHAIN_T }) : ""}</div>
    <p class="hint-s">${hint || t("selHint")}</p></div>`;
}
const swapButtonHtml = () => `<button class="btn ghost${swapping ? " on" : ""}" type="button" data-act="swap" aria-pressed="${swapping}" ${canSwap() ? "" : "disabled"}>${t(swapping ? "swapCancel" : "swapGun")}</button>`;
// "Upgrade to Lv 4 (310 gold)"; with too little gold the same label says how much is missing (the button is disabled then).
const upgradeLabel = (n, cost, short) => t(short > 0 ? "upShort" : "upTo", { n, cost: fmt(cost), d: fmt(Math.max(0, short)) });
// The armory sells Lv 1 guns one at a time; how many of each the captain has is shown beside the name.
function armoryHtml() {
  const full = save.store.length >= MAX_STORE;
  return GUN_ORDER.map(id => {
    const G = GUNS[id], n = allGuns().filter(x => x.g === id).length;
    return `<div class="item"><div class="nm">${t("gf_" + id)}<small>${t("owned", { n })}</small></div>
      <button class="btn" type="button" data-act="buy" data-id="${id}" ${save.gold < G.cost || full ? "disabled" : ""}>${t("buy", { n: fmt(G.cost) })}</button>
      <div class="ds">${gunStats(id, 1)} · ${t("range", { n: G.range })} · ${t("rpm", { n: G.rpm })}${G.chain ? t("chainFx", { n: CHAIN_T }) : ""} · ${t("gn_" + id)}</div></div>`;
  }).join("");
}
