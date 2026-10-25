"use strict";
// ---------- Harbor ledger: moving guns about, the gun store, the armory ----------
// The ledger (js/ledger-tabs.js, js/ledger-panel.js) shows one ship's gun deck at a time: tap a port to pick it (deckSel; the context panel
// then offers its upgrades, the guns to put there instead (gfrom: the store and your other ships' ports) and the armory (buy mounts it at
// once, the gun it replaces goes to the store)). A place is { side: mount key | "store", i } on the flagship, plus e = the escort slot for a
// port of that escort (js/escorts.js); the pure edits below take any of them. The older tap-the-source-then-the-destination rules, still
// what gunAct "slot" / "store" do:
//   - a stored gun or a mounted one: tap it to pick it up (deckSel) and every place it can go is outlined; tap it again to put it down.
//   - with a stored gun picked: an empty port mounts it (the store closes up); a mounted gun trades places with it.
//   - with a mounted gun picked: an empty port takes it (the old port is left empty); another mounted gun swaps with it; a stored
//     gun trades places with it (the port's gun goes to the store); "Unload" (or the store's "Put in store" tile) sends it to the
//     store, unless the store is full: nothing is ever dropped.
//   - tapping an empty port with nothing picked changes nothing and says what to do; two stored guns never trade.
// Esc, the pad's back button, tapping the source again, or tapping a blank spot in the ledger drops the pick. Every move says what
// happened ("Swapped", "Mounted", "Unloaded") with an Undo button for the latest one only (gunNote). The picked gun's card offers
// its upgrade (named with the next level and its price), the same upgrade five levels at a time (total price; fewer levels near
// the cap, disabled with the shortfall when gold runs out) and Unload. The armory sells one gun at a time: with a port picked it is mounted
// there at once (the gun it replaces goes to the store), with nothing picked it lands in the store, picked. renderPort (js/harbor.js) calls
// renderGunBay; js/ledger-panel.js builds the panel from gunCardHtml, armoryHtml and gunNoteHtml; the click handler hands every gun action to gunAct; Esc reaches cancelGunPick through goBack (js/menu.js). A gun may carry a rarity, item level and affixes
// (#38, js/gear-core.js): its slot is edged in the rarity colour, and its card (gearExtraHtml, js/gear-ui.js) lists them with re-roll, lock and break down.
Object.assign(STR.en, {
  bay: "Gun store", bayEmpty: "Nothing in store. Guns bought in the armory wait here until you mount them.",
  emptyPort: "Empty", toStore: "Unload", owned: "{n} owned", storeAria: "Stored gun {n}: {gun}, Lv {lv}",
  toStoreDest: "Put in store",
  pickHintPort: "Pick a replacement below, or upgrade or unload this gun. Tap the port again, press Esc or tap × to close.",
  pickHintStore: "Now tap where it goes: an empty port to mount it, or a mounted gun to trade places. Tap it again, press Esc or tap a blank spot to cancel.",
  emptyTip: "Empty port: tap a stored gun first, then tap here to mount it.",
  storeFullWhy: "The gun store is full ({n}): free a place before unloading.",
  movedMount: "Mounted {gun}.", movedShift: "Moved {gun} to another port.", movedSwap: "Swapped {a} and {b}.", movedUnload: "Unloaded {gun} to the store.", gunUndo: "Undo", gunUndone: "Undone.",
  upTo: "Upgrade to Lv {n} ({cost} gold)", upShort: "Upgrade to Lv {n} ({cost} gold, need {d} more)",
  upNArm: "Tap again to confirm: +{n} levels for {cost} gold", spreadHint: "This gun is already {d} levels above your {gun}. Each level costs 1.5x the last, so spreading the gold over the lower guns pays off more.",
  upN: "Upgrade {n} levels at once ({cost} gold)", upNShort: "Upgrade {n} levels at once: {d} gold short ({cost} in all)", gainDmg: "Damage +{p}%", gainFx: "Effect +{p}%",
  boughtMounted: "Bought a <em>{gun}</em> and mounted it.", putHere: "Put here", candInfo: "Details",
});
Object.assign(STR.zh, {
  bay: "火砲庫存", bayEmpty: "庫存是空的。在軍械庫買的砲會先放在這裡，等你裝上船。",
  emptyPort: "空砲位", toStore: "卸下", owned: "持有 {n} 門", storeAria: "庫存第 {n} 門：{gun}，Lv {lv}",
  toStoreDest: "放入庫存",
  pickHintPort: "在下方挑一門砲來換，或升級、卸下這門砲。再點一次砲口、按 Esc 或點 × 可關閉。",
  pickHintStore: "再點目的地：空砲位會裝上，船上的砲會對調。再點一次、按 Esc 或點空白處可取消。",
  emptyTip: "空砲位：先點庫存裡的砲，再點這裡裝上。",
  storeFullWhy: "庫存已滿（{n} 門）：先騰出位置才能卸下。",
  movedMount: "已裝上{gun}。", movedShift: "已把{gun}移到另一個砲位。", movedSwap: "已交換{a}與{b}。", movedUnload: "已把{gun}卸下到庫存。", gunUndo: "復原", gunUndone: "已復原。",
  upNArm: "再點一次確認：升 {n} 級，花 {cost} 金幣", spreadHint: "這門砲已比你的{gun}高 {d} 級。每升一級費用 ×1.5，把錢分給較低級的砲更划算。",
  upTo: "升級到 Lv {n}（{cost} 金幣）", upShort: "升級到 Lv {n}（{cost} 金幣，還差 {d}）",
  upN: "一次升 {n} 級（共 {cost} 金幣）", upNShort: "一次升 {n} 級：還差 {d} 金（共 {cost}）", gainDmg: "火力 +{p}%", gainFx: "效果 +{p}%",
  boughtMounted: "已買下<em>{gun}</em>並裝上。", putHere: "裝到這裡", candInfo: "詳情",
});
const GUN_ACTS = ["slot", "store", "buy", "gup", "gup5", "unload", "tostore", "gundo", "gfrom"];
let deckSel = null;   // the picked port or stored gun: { side: mount key | "store", i } (+ e: an escort's slot, for one of its ports), or null
let gunNote = null;   // the latest move: { text: [key, args], before: the guns as they were } for the Undo button, or a bare { tip } line
// Places (see the top): the array a place sits in, the gun there, whether two are the same place. Pure on the save `s` they are given.
const placeOf = (side, i, e) => ({ side, i, ...(e != null && e !== "" ? { e: +e } : {}) });
const locArr = (s, p) => (p.side === "store" ? s.store : p.e != null ? ((s.escorts[p.e] || {}).guns || {})[p.side] : s[p.side]);
const gunIn = (s, p) => (p && (locArr(s, p) || [])[p.i]) || null;
const samePlace = (a, b) => a.side === b.side && a.i === b.i && (a.e ?? -1) === (b.e ?? -1);
const gunAt = p => gunIn(save, p);
const isPicked = (side, i, e) => !!deckSel && samePlace(deckSel, { side, i, e });
// The ship a place belongs to (its hull sets the gun's damage, gunK): the escort's yard ship, else the flagship.
const placeShip = p => { const y = p && p.e != null && typeof escortShipOf === "function" ? escortShipOf(save, save.escorts[p.e]) : null; return y ? y.ship : save.ship; };
function withGun(s, p, gun) {
  if (p.side !== "store" && p.e != null) {
    const ports = s.escorts[p.e] && s.escorts[p.e].guns && s.escorts[p.e].guns[p.side];
    if (!ports || p.i < 0 || p.i >= ports.length) throw new Error("withGun: no escort port " + JSON.stringify(p));   // never drop a gun into a port that is not there
    return { ...s, escorts: s.escorts.map((e, k) => (k === p.e ? { ...e, guns: { ...e.guns, [p.side]: e.guns[p.side].map((g, j) => (j === p.i ? gun : g)) } } : e)) };
  }
  const arr = s[p.side].slice(); arr[p.i] = gun; return { ...s, [p.side]: arr };
}
// Swap what two places hold. A stored gun moved into an empty port leaves a hole, so the store closes up.
function swapGunsIn(s, a, b) {
  const ga = gunIn(s, a), gb = gunIn(s, b), t = withGun(withGun(s, a, gb), b, ga);
  return { ...t, store: t.store.filter(Boolean) };
}
const swapGuns = (a, b) => swapGunsIn(save, a, b);
const gunMark = gun => (gun.lg ? "!" : "");   // a legendary gun's picture has gold inlay (js/gun-art.js)
const gunIcon = (id, cls) => (typeof gunSideImg === "function" ? gunSideImg(id, cls) : "");   // the side view (js/gun-art.js); the unit tests load this file without it
// to: the next level, to show what the upgrade does to every number the gun states (damage and, for the incendiary, its burn)
// Figures to one decimal (12 -> 13.8, not 12 -> 14), so the "+15%" on the button and the numbers beside it say the same thing.
const dmgNum = v => Math.round(v * 10) / 10;
const gunStats = (g, lv, ship = save.ship, to = 0) => { const G = GUNS[g], k = shipGunK(ship), m = gunLvMul(lv) * k;   // what it hits for on this hull (js/data.js)
  const was = dmgNum(G.dmg * m), wasB = dmgNum(G.burn * m * BURN_T);
  const m2 = gunLvMul(to) * k, arrow = n => (to ? ` <span class="up">→ ${n}</span>` : "");
  return t("dmg", { n: was }) + (to ? arrow(dmgNum(G.dmg * m2)) : "") + (G.burn ? t("burn", { n: wasB }) + (to ? arrow(dmgNum(G.burn * m2 * BURN_T)) : "") : ""); };
const armedNow = key => typeof armedTap === "function" && armedTap(key);   // the two-tap confirm lives in js/escort-ui.js (not loaded by the unit tests)
const confirmed = key => typeof twoTap !== "function" || twoTap(key);
const up5Key = p => `gup5:${p.side}${p.i}${p.e ?? ""}`;   // the armed state of one port's "upgrade N levels" button (js/escort-ui.js twoTap)
const gunName = gun => t("gf_" + gun.g) + " Lv " + gun.lv;
const gunRar = gun => (typeof rarClass === "function" ? rarClass(gun) : "");   // " r0".." r4": the rarity colour of the slot and card (css/gear.css)

// ---------- the rules, pure ----------
// What a tap on (side, i) does with `src` picked (or null): { kind: "pick" | "drop" | "repick" | "move" | "tip" | "none", ... }.
function gunTap(s, src, side, i, e) {
  const at = placeOf(side, i, e), gun = gunIn(s, at), from = src && gunIn(s, src) ? src : null;
  if (from && samePlace(from, at)) return { kind: "drop" };
  if (!from) return gun ? { kind: "pick" } : { kind: "tip" };   // an empty port with nothing picked: say what to do
  if (!gun) return { kind: "move", how: from.side === "store" ? "mount" : "shift", from, to: at };   // a stored gun is mounted, a mounted one is moved
  if (from.side === "store" && side === "store") return { kind: "repick" };   // two stored guns do not trade
  return { kind: "move", how: "swap", from, to: at };
}
// Is (side, i) a place the picked gun could go? Drives the outlines.
const isDest = (side, i, e) => !!deckSel && gunTap(save, deckSel, side, i, e).kind === "move";
// The guns as they stand, for Undo: the four mounts and the store, nothing else (gold, levels of ships are not part of a move).
const gunSnap = s => ({ ...Object.fromEntries(MOUNTS.map(({ key }) => [key, s[key].slice()])), store: s.store.slice(), shipId: s.shipId,
  esc: (s.escorts || []).map(e => ({ id: e.id, guns: e.guns })) });   // each escort's ports too (the objects are never edited in place)
// Pure: the lowest-level gun on the same ship as the one at `p`, when that gun stands 2 or more levels above it (the price climbs x1.5 a level, so the
// next level of the lower gun is the better buy); else null. The ship is the escort's for one of its ports, else the flagship (a stored gun is compared with it too).
function gunSpread(s, p) {
  const gun = gunIn(s, p); if (!gun) return null;
  const ports = p.e != null ? (s.escorts[p.e] || {}).guns || {} : s;
  const peers = MOUNTS.flatMap(({ key }, k) => (ports[key] || []).map((g, i) => ({ g, here: p.side === key && p.i === i }))).filter(x => x.g && !x.here).map(x => x.g);
  const low = peers.sort((a, b) => a.lv - b.lv)[0];
  return low && gun.lv - low.lv >= 2 ? { gun: low, d: gun.lv - low.lv } : null;
}
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
    const side = act === "store" ? "store" : d.side, r = gunTap(save, deckSel, side, +d.i, d.e);
    if (r.kind === "move") return doMove(r);
    if (r.kind === "pick" || r.kind === "repick") { deckSel = placeOf(side, +d.i, d.e); gunNote = null; if (typeof gearSel !== "undefined") gearSel = null; return "uiClick"; }   // one pick at a time: a gun or a gear part (js/gear-ui.js)
    if (r.kind === "drop") { deckSel = null; return "uiClick"; }
    gunNote = { tip: "emptyTip" }; return "denied";   // r.kind "tip": nothing moved
  }
  if (act === "gundo") {
    const n = gunNote;
    if (!n || !n.before || n.before.shipId !== save.shipId) return null;
    const { shipId, esc, ...guns } = n.before;
    const now = save.escorts || [];
    if (esc.length !== now.length || esc.some((e, k) => e.id !== now[k].id)) return null;   // an escort changed ship since: its ports are not the ones saved
    save = { ...save, ...guns, escorts: now.map((e, k) => ({ ...e, guns: esc[k].guns })) }; deckSel = null; gunNote = { tip: "gunUndone" };
    return "uiClick";
  }
  if (act === "gfrom") {   // the ledger's "put this here" list: the gun at d (a place) goes to the picked port; a gun already there goes back where this one came from
    const src = placeOf(d.side, +d.i, d.e), dst = deckSel, r = dst && dst.side !== "store" ? gunTap(save, src, dst.side, dst.i, dst.e) : null;
    if (!r || r.kind !== "move") return null;
    const snd = doMove(r); deckSel = dst; if (typeof candSel !== "undefined") candSel = null;   // the port stays picked: its card shows the new gun; the store shifted under the candidate card, so it closes
    return snd;
  }
  if (act === "buy") {
    const id = d.id, cost = Object.hasOwn(GUNS, id) ? GUNS[id].cost : Infinity;
    const into = deckSel && deckSel.side !== "store" ? deckSel : null, old = into ? gunAt(into) : null;   // a port picked in the ledger: the new gun goes straight in
    if (save.gold < cost || (!into || old) && save.store.length >= MAX_STORE) return null;   // the store takes the new gun, or the one it replaces
    const paid = { ...save, gold: save.gold - cost };
    if (into) { const next = withGun(paid, into, gunItem(id)); save = old ? { ...next, store: next.store.concat([old]) } : next; }
    else { save = { ...paid, store: paid.store.concat([gunItem(id)]) }; deckSel = { side: "store", i: save.store.length - 1 }; }
    gunNote = null;   // a purchase is not a move: nothing to undo
    portMsg = [into ? "boughtMounted" : "bought", { gun: t("gf_" + id) }];
    return "buy";
  }
  if (act === "tostore") return gunAct("unload", d);
  const at = (act === "gup" || act === "gup5") && d && d.side !== undefined ? placeOf(d.side, +d.i, d.e) : deckSel;   // the ledger's candidate card names its own gun
  const gun = gunAt(at);
  if (!gun) return null;
  if (act === "gup" || act === "gup5") {
    const plan = act === "gup5" ? gunUpPlan(gun, save.gold) : { n: gun.lv < GUN_MAX ? 1 : 0, cost: gunUpCost(gun), short: Math.max(0, gunUpCost(gun) - save.gold) };
    if (!plan.n || plan.short > 0) return null;
    if (act === "gup5" && !confirmed(up5Key(at))) return null;   // a big spend: the first tap arms the button (js/escort-ui.js)
    save = withGun({ ...save, gold: save.gold - plan.cost }, at, { ...gun, lv: gun.lv + plan.n });   // rarity, affixes and lock stay with the gun
    gunNote = null;   // gold was spent: Undo would hand the levels back for free, so it only ever covers a move
    return "upgrade";
  }
  if (act === "unload" && deckSel.side !== "store" && save.store.length < MAX_STORE) {   // a full store would drop it on the next load
    const before = gunSnap(save);
    save = { ...withGun(save, deckSel, null), store: save.store.concat([gun]) };
    gunNote = { text: ["movedUnload", { gun: gunName(gun) }], before }; deckSel = null;
    return "uiClick";
  }
  return null;
}

// ---------- markup ----------
// Before each render: drop a pick whose place is gone (a smaller store, a port the ship no longer has, a new ship) and an Undo made on another ship.
// An empty port stays picked: the panel then offers guns for it.
function renderGunBay() {
  if (deckSel && !(locArr(save, deckSel) && deckSel.i < locArr(save, deckSel).length)) deckSel = null;
  if (gunNote && gunNote.before && gunNote.before.shipId !== save.shipId) gunNote = null;   // Undo is for this ship only
}
// The status line: what the last move did, with Undo; or a one-off tip (an empty port tapped with nothing to mount).
function gunNoteHtml() {
  if (!gunNote) return "";
  if (gunNote.tip) return `<p class="gnote tip" role="status">${t(gunNote.tip)}</p>`;
  return `<div class="gnote" role="status"><span>${t(...gunNote.text)}</span><button class="btn ghost" type="button" data-act="gundo">${t("gunUndo")}</button></div>`;
}
// The card of the picked gun, or (cand) of a candidate in the ledger's replace list: its buttons then carry the gun's place and add "Put here".
function gunCardHtml(p = deckSel, cand = false) {
  const gun = p && gunAt(p), ship = placeShip(p);
  if (!gun) return "";   // nothing picked, or an empty port (the ledger's panel says so itself)
  const pl = cand ? ` data-side="${p.side}" data-i="${p.i}"${p.e != null ? ` data-e="${p.e}"` : ""}` : "";
  const G = GUNS[gun.g], max = gun.lv >= GUN_MAX, cost = max ? 0 : gunUpCost(gun), short = cost - save.gold, mounted = p.side !== "store";
  const up = max ? `<button class="btn max" type="button" disabled>${t("max")}</button>`
    : `<button class="btn" type="button" data-act="gup"${pl} ${short > 0 ? "disabled" : ""}>${upgradeLabel(gun.lv + 1, cost, short, gunGain(gun, 1))}</button>`;
  const plan = gunUpPlan(gun, save.gold), up5 = plan.n >= 2   // one level left is just the button above
    ? `<button class="btn" type="button" data-act="gup5"${pl} ${plan.short > 0 ? "disabled" : ""}${armedNow(up5Key(p)) ? armAttrs() : ""}>${t(plan.short > 0 ? "upNShort" : armedNow(up5Key(p)) ? "upNArm" : "upN", { n: plan.n, cost: fmt(plan.cost), d: fmt(plan.short) })}${gainLine(gunGain(gun, plan.n))}</button>` : "";
  const spread = gunSpread(save, p), spreadNote = spread ? `<p class="hint-s spread">${t("spreadHint", { d: spread.d, gun: gunName(spread.gun) })}</p>` : "";
  const full = save.store.length >= MAX_STORE;
  const off = !mounted || cand ? "" : `<button class="btn ghost" type="button" data-act="unload" ${full ? "disabled" : ""}>${t("toStore")}</button>`;
  const x = typeof gearExtraHtml === "function" ? gearExtraHtml(gun, "gun", pl) : null;   // rarity, affixes, re-roll, lock, break down (js/gear-ui.js)
  const put = cand ? `<button class="btn" type="button" data-act="gfrom"${pl}>${t("putHere")}</button>` : "";
  const acts = put + up + up5 + off + (x ? x.lockBtn + (mounted ? "" : x.scrapBtn) : "");
  const name = typeof gearTitle === "function" ? gearTitle(gun) : t("gf_" + gun.g);
  return `<div class="gcard${gunRar(gun)}"><div class="nm">${gunIcon(gun.g + gunMark(gun))}${name}<small>Lv ${gun.lv}${x ? " · " + rarLine(gun) : ""}</small></div><div class="gacts">${acts}</div>
    <div class="ds">${gunStats(gun.g, gun.lv, ship, max ? 0 : gun.lv + 1)} · ${t("range", { n: G.range })} · ${t("rpm", { n: G.rpm })}${G.chain ? t("chainFx", { n: CHAIN_T }) : ""}</div>
    ${x ? x.list + (mounted ? "" : gunCompareHtml(gun)) : ""}${cand ? "" : `<p class="hint-s">${mounted && full ? t("storeFullWhy", { n: MAX_STORE }) + " " : ""}${t(mounted ? "pickHintPort" : "pickHintStore")}</p>`}${spreadNote}</div>`;
}
// "Upgrade to Lv 4 (310 gold)"; with too little gold the same label says how much is missing (the button is disabled then).
// `gain` (a text) goes under it as a second line: what the upgrade buys (#97), so the price can be weighed against it.
// The arrow is real text (not CSS), so a screen reader or a copied label reads "(12 gold) → Damage +15%", not "(12 gold)Damage +15%".
const gainLine = gain => (gain ? `<span class="gain"><span class="gsep">→ </span>${gain}</span>` : "");
const upgradeLabel = (n, cost, short, gain = "") => t(short > 0 ? "upShort" : "upTo", { n, cost: fmt(cost), d: fmt(Math.max(0, short)) }) + gainLine(gain);
// What `n` upgrade levels do to a gun: its damage, and (a gun on the flagship) the share of the way to the next Ship Lv (js/lv-path.js).
const gunGain = (gun, n) => { const lv = typeof lvGainGun === "function" ? lvGainGun(gun, n) : "";
  return t("gainDmg", { p: pctUp(gunLvMul(gun.lv), gunLvMul(gun.lv + n)) }) + (lv ? " · " + lv : ""); };
const pctUp = (from, to) => Math.round((to / from - 1) * 100);   // 1.15x per gun level -> 15; k levels at once -> the compound figure
// The armory sells Lv 1 guns one at a time; how many of each the captain has is shown beside the name.
function armoryHtml() {
  const full = save.store.length >= MAX_STORE && !(deckSel && deckSel.side !== "store" && !gunAt(deckSel));   // a gun bought into an empty port needs no room in the store
  const mounted = deckSel && deckSel.side !== "store", mine = !mounted || deckSel.e == null;   // a gun bought for an escort's port does not count in the flagship's Ship Lv
  return GUN_ORDER.map(id => {
    const G = GUNS[id], n = allGuns().filter(x => x.g === id).length;
    const gain = mine && typeof lvGainNewGun === "function" ? lvGainNewGun(id, mounted ? deckSel : null) : "";   // js/lv-path.js
    return `<div class="item"><div class="nm">${gunIcon(id)}${t("gf_" + id)}<small>${t("owned", { n })}</small></div>
      <button class="btn" type="button" data-act="buy" data-id="${id}" ${save.gold < G.cost || full ? "disabled" : ""}>${save.gold < G.cost ? t("buyNeed", { n: fmt(G.cost), d: fmt(G.cost - save.gold) }) : t("buy", { n: fmt(G.cost) })}${gainLine(gain)}</button>
      <div class="ds">${gunStats(id, 1)} · ${t("range", { n: G.range })} · ${t("rpm", { n: G.rpm })}${G.chain ? t("chainFx", { n: CHAIN_T }) : ""} · ${t("gn_" + id)}</div></div>`;
  }).join("");
}
