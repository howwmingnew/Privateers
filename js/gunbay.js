"use strict";
// ---------- Harbor ledger: picking guns up, the gun store under the gun deck, the armory ----------
// Guns are items { g, lv } (js/data.js). Tap a gun port or a stored gun to pick it (deckSel), then tap another to swap
// the two: port <-> port, or port <-> store (an empty port takes the stored gun, and the store closes up). The picked
// gun's card offers its own upgrade, and "to store" for a mounted one. The armory sells one gun at a time; it lands in
// the store already picked, so the next tap on a port mounts it. renderPort (js/harbor.js) calls renderGunBay and
// armoryHtml; its click handler hands every gun action to gunAct.
Object.assign(STR.en, {
  bay: "Gun store", bayEmpty: "Nothing in store. Guns bought in the armory wait here until you mount them.",
  emptyPort: "Empty", toStore: "To store", owned: "{n} owned", storeAria: "Stored gun {n}: {gun}, Lv {lv}",
  selHint: "Choose another gun port or a stored gun to swap them.", selEmpty: "Empty gun port: choose a stored gun to mount it here.",
});
Object.assign(STR.zh, {
  bay: "火砲庫存", bayEmpty: "庫存是空的。在軍械庫買的砲會先放在這裡，等你裝上船。",
  emptyPort: "空砲位", toStore: "卸到庫存", owned: "持有 {n} 門", storeAria: "庫存第 {n} 門：{gun}，Lv {lv}",
  selHint: "再選另一個砲位或庫存裡的砲，就能互換。", selEmpty: "空砲位：選庫存裡的砲就能裝到這裡。",
});
const GUN_ACTS = ["slot", "store", "buy", "gup", "unload"];
let deckSel = null;   // the picked port or stored gun: { side: mount key | "store", i }, or null
const gunAt = p => (p && save[p.side] && save[p.side][p.i]) || null;
const isPicked = (side, i) => !!deckSel && deckSel.side === side && deckSel.i === i;
function withGun(s, side, i, gun) { const arr = s[side].slice(); arr[i] = gun; return { ...s, [side]: arr }; }
// Swap what two places hold. A stored gun moved into an empty port leaves a hole, so the store closes up.
function swapGuns(a, b) {
  const ga = gunAt(a), gb = gunAt(b);
  const s = withGun(withGun(save, a.side, a.i, gb), b.side, b.i, ga);
  return { ...s, store: s.store.filter(Boolean) };
}
const gunStats = (g, lv) => { const G = GUNS[g], m = gunLvMul(lv) * shipGunK();   // what it hits for on this hull (js/data.js)
  return t("dmg", { n: Math.round(G.dmg * m) }) + (G.burn ? t("burn", { n: Math.round(G.burn * m * BURN_T) }) : ""); };

// ---------- actions: each returns the sound to play, or null when nothing happened ----------
function pickGun(side, i) {
  const at = { side, i };
  if (!deckSel || (deckSel.side === "store" && side === "store") || (!gunAt(deckSel) && !gunAt(at))) { deckSel = isPicked(side, i) ? null : at; return "uiClick"; }
  if (isPicked(side, i)) { deckSel = null; return "uiClick"; }
  save = swapGuns(deckSel, at); deckSel = null;
  return "reload";   // a gun run into its port
}
function gunAct(act, d) {
  if (act === "slot" || act === "store") return pickGun(act === "store" ? "store" : d.side, +d.i);
  if (act === "buy") {
    const id = d.id, cost = Object.hasOwn(GUNS, id) ? GUNS[id].cost : Infinity;
    if (save.gold < cost || save.store.length >= MAX_STORE) return null;
    save = { ...save, gold: save.gold - cost, store: save.store.concat([gunItem(id)]) };
    deckSel = { side: "store", i: save.store.length - 1 };
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
    deckSel = { side: "store", i: save.store.length - 1 };
    return "uiClick";
  }
  return null;
}

// ---------- markup ----------
function renderGunBay() {
  if (deckSel && !(deckSel.i < (save[deckSel.side] || []).length)) deckSel = null;   // the store shrank, or a new ship
  document.getElementById("gunSel").innerHTML = gunCardHtml();
  document.getElementById("bay").innerHTML = `<div class="lbl">${t("bay")}</div>` + (save.store.length
    ? `<div class="slots">${save.store.map((gun, i) => `<button class="slot${isPicked("store", i) ? " sel" : ""}" type="button" data-act="store" data-i="${i}" aria-pressed="${isPicked("store", i)}" ` +
      `aria-label="${t("storeAria", { n: i + 1, gun: t("gf_" + gun.g), lv: gun.lv })}">${t("g_" + gun.g)}<small>Lv ${gun.lv}</small></button>`).join("")}</div>`
    : `<p class="hint-s">${t("bayEmpty")}</p>`);
}
function gunCardHtml() {
  if (!deckSel) return "";
  const gun = gunAt(deckSel);
  if (!gun) return `<div class="gcard"><p class="hint-s">${t("selEmpty")}</p></div>`;
  const G = GUNS[gun.g], max = gun.lv >= GUN_MAX, cost = max ? 0 : gunUpCost(gun);
  const up = max ? `<button class="btn max" type="button" disabled>${t("max")}</button>`
    : `<button class="btn" type="button" data-act="gup" ${save.gold < cost ? "disabled" : ""}>${t("upgrade", { n: fmt(cost) })}</button>`;
  const off = deckSel.side === "store" || save.store.length >= MAX_STORE ? "" : `<button class="btn ghost" type="button" data-act="unload">${t("toStore")}</button>`;
  const next = max ? "" : ` <span class="up">→ ${Math.round(G.dmg * gunLvMul(gun.lv + 1) * shipGunK())}</span>`;
  return `<div class="gcard"><div class="nm">${t("gf_" + gun.g)}<small>Lv ${gun.lv}</small></div><div class="gacts">${up}${off}</div>
    <div class="ds">${gunStats(gun.g, gun.lv)}${next} · ${t("range", { n: G.range })} · ${t("rpm", { n: G.rpm })}${G.chain ? t("chainFx", { n: CHAIN_T }) : ""}</div>
    <p class="hint-s">${t("selHint")}</p></div>`;
}
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
