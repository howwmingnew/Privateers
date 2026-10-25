"use strict";
// ---------- Harbor ledger: moving guns about, the gun store under the gun deck, the armory ----------
// Guns are items { g, lv } (js/data.js). Moving one is "tap the source, then tap the destination", with no mode button:
//   - a stored gun or a mounted one: tap it to pick it up (deckSel) and every place it can go is outlined; tap it again to put it down.
//   - with a stored gun picked: an empty port mounts it (the store closes up); a mounted gun trades places with it.
//   - with a mounted gun picked: an empty port takes it (the old port is left empty); another mounted gun swaps with it; a stored
//     gun trades places with it (the port's gun goes to the store); "Unload" (or the store's "Put in store" tile) sends it to the
//     store, unless the store is full: nothing is ever dropped.
//   - tapping an empty port with nothing picked changes nothing and says what to do; two stored guns never trade.
// Esc, the pad's back button, tapping the source again, or tapping a blank spot in the ledger drops the pick. Every move says what
// happened ("Swapped", "Mounted", "Unloaded") with an Undo button for the latest one only (gunNote). The picked gun's card offers
// its upgrade (named with the next level and its price), the same upgrade five levels at a time (total price; fewer levels near
// the cap, disabled with the shortfall when gold runs out) and Unload. The armory sells one gun at a time; it lands in the store
// already picked, so the next tap on a port mounts it. renderPort (js/harbor.js) calls renderGunBay and armoryHtml; its click
// handler hands every gun action to gunAct; Esc reaches cancelGunPick through goBack (js/menu.js).
Object.assign(STR.en, {
  bay: "Gun store", bayEmpty: "Nothing in store. Guns bought in the armory wait here until you mount them.",
  emptyPort: "Empty", toStore: "Unload", owned: "{n} owned", storeAria: "Stored gun {n}: {gun}, Lv {lv}",
  toStoreDest: "Put in store",
  pickHintPort: "Now tap where it goes: an empty port to move it there, another gun port to swap, or a stored gun to trade places. Tap it again, press Esc or tap a blank spot to cancel.",
  pickHintStore: "Now tap where it goes: an empty port to mount it, or a mounted gun to trade places. Tap it again, press Esc or tap a blank spot to cancel.",
  emptyTip: "Empty port: tap a stored gun first, then tap here to mount it.",
  storeFullWhy: "The gun store is full ({n}): free a place before unloading.",
  movedMount: "Mounted {gun}.", movedShift: "Moved {gun} to another port.", movedSwap: "Swapped {a} and {b}.", movedUnload: "Unloaded {gun} to the store.", gunUndo: "Undo", gunUndone: "Undone.",
  upTo: "Upgrade to Lv {n} ({cost} gold)", upShort: "Upgrade to Lv {n} ({cost} gold, {d} short)",
  upN: "Upgrade {n} levels ({cost} gold total)", upNShort: "Upgrade {n} levels ({cost} gold total, {d} short)",
});
Object.assign(STR.zh, {
  bay: "火砲庫存", bayEmpty: "庫存是空的。在軍械庫買的砲會先放在這裡，等你裝上船。",
  emptyPort: "空砲位", toStore: "卸下", owned: "持有 {n} 門", storeAria: "庫存第 {n} 門：{gun}，Lv {lv}",
  toStoreDest: "放入庫存",
  pickHintPort: "再點目的地：空砲位會直接移過去，另一個砲位會互換，庫存裡的砲會對調。再點一次、按 Esc 或點空白處可取消。",
  pickHintStore: "再點目的地：空砲位會裝上，船上的砲會對調。再點一次、按 Esc 或點空白處可取消。",
  emptyTip: "空砲位：先點庫存裡的砲，再點這裡裝上。",
  storeFullWhy: "庫存已滿（{n} 門）：先騰出位置才能卸下。",
  movedMount: "已裝上{gun}。", movedShift: "已把{gun}移到另一個砲位。", movedSwap: "已交換{a}與{b}。", movedUnload: "已把{gun}卸下到庫存。", gunUndo: "復原", gunUndone: "已復原。",
  upTo: "升級到 Lv {n}（{cost} 金幣）", upShort: "升級到 Lv {n}（{cost} 金幣，還差 {d}）",
  upN: "升級 {n} 級（總價 {cost} 金幣）", upNShort: "升級 {n} 級（總價 {cost} 金幣，還差 {d}）",
});
const GUN_ACTS = ["slot", "store", "buy", "gup", "gup5", "unload", "tostore", "gundo"];
let deckSel = null;   // the picked port or stored gun (the move's source): { side: mount key | "store", i }, or null
let gunNote = null;   // the latest move: { text: [key, args], before: the guns as they were } for the Undo button, or a bare { tip } line
const gunAt = p => (p && save[p.side] && save[p.side][p.i]) || null;
const isPicked = (side, i) => !!deckSel && deckSel.side === side && deckSel.i === i;
function withGun(s, side, i, gun) { const arr = s[side].slice(); arr[i] = gun; return { ...s, [side]: arr }; }
// Swap what two places hold. A stored gun moved into an empty port leaves a hole, so the store closes up.
function swapGuns(a, b) {
  const ga = gunAt(a), gb = gunAt(b);
  const s = withGun(withGun(save, a.side, a.i, gb), b.side, b.i, ga);
  return { ...s, store: s.store.filter(Boolean) };
}
const gunIcon = (id, cls) => (typeof gunSideImg === "function" ? gunSideImg(id, cls) : "");   // the side view (js/gun-art.js); the unit tests load this file without it
const gunStats = (g, lv) => { const G = GUNS[g], m = gunLvMul(lv) * shipGunK();   // what it hits for on this hull (js/data.js)
  return t("dmg", { n: Math.round(G.dmg * m) }) + (G.burn ? t("burn", { n: Math.round(G.burn * m * BURN_T) }) : ""); };
const gunName = gun => t("gf_" + gun.g) + " Lv " + gun.lv;

// ---------- the rules, pure ----------
// What a tap on (side, i) does with `src` picked (or null): { kind: "pick" | "drop" | "repick" | "move" | "tip" | "none", ... }.
function gunTap(s, src, side, i) {
  const at = { side, i }, gun = (s[side] || [])[i] || null, from = src && (s[src.side] || [])[src.i] ? src : null;
  if (from && from.side === side && from.i === i) return { kind: "drop" };
  if (!from) return gun ? { kind: "pick" } : { kind: "tip" };   // an empty port with nothing picked: say what to do
  if (!gun) return { kind: "move", how: from.side === "store" ? "mount" : "shift", from, to: at };   // a stored gun is mounted, a mounted one is moved
  if (from.side === "store" && side === "store") return { kind: "repick" };   // two stored guns do not trade
  return { kind: "move", how: "swap", from, to: at };
}
// Is (side, i) a place the picked gun could go? Drives the outlines.
const isDest = (side, i) => !!deckSel && gunTap(save, deckSel, side, i).kind === "move";
// The guns as they stand, for Undo: the four mounts and the store, nothing else (gold, levels of ships are not part of a move).
const gunSnap = s => ({ ...Object.fromEntries(MOUNTS.map(({ key }) => [key, s[key].slice()])), store: s.store.slice(), shipId: s.shipId });
// Pure: the upgrade `n` levels at once: how many levels that really is (the cap stops it), what it costs in all, and the gold missing.
function gunUpPlan(gun, gold, n = GUN_UP_BATCH) {
  const k = Math.max(0, Math.min(n, GUN_MAX - gun.lv));
  let cost = 0;
  for (let j = 0; j < k; j++) cost += gunUpCost({ ...gun, lv: gun.lv + j });
  return { n: k, cost, short: Math.max(0, cost - gold) };
}

// ---------- actions: each returns the sound to play, or null when nothing happened ----------
function cancelGunPick() {   // Esc (js/menu.js goBack) or a tap on a blank spot: true when a gun was picked and is now put down
  if (!deckSel) return false;
  deckSel = null; gunNote = null; renderPort();
  return true;
}
function doMove(m) {
  const a = gunAt(m.from), b = gunAt(m.to), before = gunSnap(save);
  save = swapGuns(m.from, m.to);
  const text = m.how === "mount" ? ["movedMount", { gun: gunName(a) }] : m.how === "shift" ? ["movedShift", { gun: gunName(a) }] : ["movedSwap", { a: gunName(a), b: gunName(b) }];
  gunNote = { text, before }; deckSel = null;
  return "reload";   // a gun run into its port
}
function gunAct(act, d) {
  if (act === "slot" || act === "store") {
    const side = act === "store" ? "store" : d.side, r = gunTap(save, deckSel, side, +d.i);
    if (r.kind === "move") return doMove(r);
    if (r.kind === "pick" || r.kind === "repick") { deckSel = { side, i: +d.i }; gunNote = null; return "uiClick"; }
    if (r.kind === "drop") { deckSel = null; return "uiClick"; }
    gunNote = { tip: "emptyTip" }; return "denied";   // r.kind "tip": nothing moved
  }
  if (act === "gundo") {
    const n = gunNote;
    if (!n || !n.before || n.before.shipId !== save.shipId) return null;
    const { shipId, ...guns } = n.before;
    save = { ...save, ...guns }; deckSel = null; gunNote = { tip: "gunUndone" };
    return "uiClick";
  }
  if (act === "buy") {
    const id = d.id, cost = Object.hasOwn(GUNS, id) ? GUNS[id].cost : Infinity;
    if (save.gold < cost || save.store.length >= MAX_STORE) return null;
    save = { ...save, gold: save.gold - cost, store: save.store.concat([gunItem(id)]) };
    deckSel = { side: "store", i: save.store.length - 1 }; gunNote = null;   // a purchase is not a move: nothing to undo
    portMsg = ["bought", { gun: t("gf_" + id) }];
    return "buy";
  }
  if (act === "tostore") return gunAct("unload", d);
  const gun = gunAt(deckSel);
  if (!gun) return null;
  if (act === "gup" || act === "gup5") {
    const plan = act === "gup5" ? gunUpPlan(gun, save.gold) : { n: gun.lv < GUN_MAX ? 1 : 0, cost: gunUpCost(gun), short: Math.max(0, gunUpCost(gun) - save.gold) };
    if (!plan.n || plan.short > 0) return null;
    save = withGun({ ...save, gold: save.gold - plan.cost }, deckSel.side, deckSel.i, gunItem(gun.g, gun.lv + plan.n));
    gunNote = null;   // gold was spent: Undo would hand the levels back for free, so it only ever covers a move
    return "upgrade";
  }
  if (act === "unload" && deckSel.side !== "store" && save.store.length < MAX_STORE) {   // a full store would drop it on the next load
    const before = gunSnap(save);
    save = { ...withGun(save, deckSel.side, deckSel.i, null), store: save.store.concat([gun]) };
    gunNote = { text: ["movedUnload", { gun: gunName(gun) }], before }; deckSel = null;
    return "uiClick";
  }
  return null;
}

// ---------- markup ----------
function renderGunBay() {
  if (deckSel && !gunAt(deckSel)) deckSel = null;   // the store shrank, a port emptied, or a new ship
  if (gunNote && gunNote.before && gunNote.before.shipId !== save.shipId) gunNote = null;   // Undo is for this ship only
  document.getElementById("port").classList.toggle("picking", !!deckSel);   // outlines every place the picked gun could go
  document.getElementById("gunSel").innerHTML = gunNoteHtml() + gunCardHtml();
  const toStore = deckSel && deckSel.side !== "store" && save.store.length < MAX_STORE;   // "Put in store": the store as a destination, when it has room
  document.getElementById("bay").innerHTML = `<div class="lbl">${t("bay")}</div>` + (save.store.length || toStore
    ? `<div class="slots">${save.store.map((gun, i) => `<button class="slot${isPicked("store", i) ? " sel" : ""}${isDest("store", i) ? " dest" : ""}" type="button" data-act="store" data-i="${i}" aria-pressed="${isPicked("store", i)}" ` +
      `aria-label="${t("storeAria", { n: i + 1, gun: t("gf_" + gun.g), lv: gun.lv })}">${gunIcon(gun.g, "sm")}${t("g_" + gun.g)}<small>Lv ${gun.lv}</small></button>`).join("")}` +
      (toStore ? `<button class="slot dest put" type="button" data-act="tostore">${t("toStoreDest")}<small>${save.store.length} / ${MAX_STORE}</small></button>` : "") + `</div>`
    : `<p class="hint-s">${t("bayEmpty")}</p>`);
}
// The status line: what the last move did, with Undo; or a one-off tip (an empty port tapped with nothing to mount).
function gunNoteHtml() {
  if (!gunNote) return "";
  if (gunNote.tip) return `<p class="gnote tip" role="status">${t(gunNote.tip)}</p>`;
  return `<div class="gnote" role="status"><span>${t(...gunNote.text)}</span><button class="btn ghost" type="button" data-act="gundo">${t("gunUndo")}</button></div>`;
}
function gunCardHtml() {
  if (!deckSel) return "";
  const gun = gunAt(deckSel);
  const G = GUNS[gun.g], max = gun.lv >= GUN_MAX, cost = max ? 0 : gunUpCost(gun), short = cost - save.gold, mounted = deckSel.side !== "store";
  const up = max ? `<button class="btn max" type="button" disabled>${t("max")}</button>`
    : `<button class="btn" type="button" data-act="gup" ${short > 0 ? "disabled" : ""}>${upgradeLabel(gun.lv + 1, cost, short)}</button>`;
  const plan = gunUpPlan(gun, save.gold), up5 = plan.n >= 2   // one level left is just the button above
    ? `<button class="btn" type="button" data-act="gup5" ${plan.short > 0 ? "disabled" : ""}>${t(plan.short > 0 ? "upNShort" : "upN", { n: plan.n, cost: fmt(plan.cost), d: fmt(plan.short) })}</button>` : "";
  const full = save.store.length >= MAX_STORE;
  const off = !mounted ? "" : `<button class="btn ghost" type="button" data-act="unload" ${full ? "disabled" : ""}>${t("toStore")}</button>`;
  const next = max ? "" : ` <span class="up">→ ${Math.round(G.dmg * gunLvMul(gun.lv + 1) * shipGunK())}</span>`;
  return `<div class="gcard"><div class="nm">${gunIcon(gun.g)}${t("gf_" + gun.g)}<small>Lv ${gun.lv}</small></div><div class="gacts">${up}${up5}${off}</div>
    <div class="ds">${gunStats(gun.g, gun.lv)}${next} · ${t("range", { n: G.range })} · ${t("rpm", { n: G.rpm })}${G.chain ? t("chainFx", { n: CHAIN_T }) : ""}</div>
    <p class="hint-s">${mounted && full ? t("storeFullWhy", { n: MAX_STORE }) + " " : ""}${t(mounted ? "pickHintPort" : "pickHintStore")}</p></div>`;
}
// "Upgrade to Lv 4 (310 gold)"; with too little gold the same label says how much is missing (the button is disabled then).
const upgradeLabel = (n, cost, short) => t(short > 0 ? "upShort" : "upTo", { n, cost: fmt(cost), d: fmt(Math.max(0, short)) });
// The armory sells Lv 1 guns one at a time; how many of each the captain has is shown beside the name.
function armoryHtml() {
  const full = save.store.length >= MAX_STORE;
  return GUN_ORDER.map(id => {
    const G = GUNS[id], n = allGuns().filter(x => x.g === id).length;
    return `<div class="item"><div class="nm">${gunIcon(id)}${t("gf_" + id)}<small>${t("owned", { n })}</small></div>
      <button class="btn" type="button" data-act="buy" data-id="${id}" ${save.gold < G.cost || full ? "disabled" : ""}>${t("buy", { n: fmt(G.cost) })}</button>
      <div class="ds">${gunStats(id, 1)} · ${t("range", { n: G.range })} · ${t("rpm", { n: G.rpm })}${G.chain ? t("chainFx", { n: CHAIN_T }) : ""} · ${t("gn_" + id)}</div></div>`;
  }).join("");
}
