"use strict";
// ---------- The ledger's Gear page: seven part slots, the spares, the picked piece's card (compare, upgrade, re-roll, lock, break down) ----------
// Rendered into #gear by the renderPort hook; its buttons carry data-act "g*" (GEAR_ACTS), handled by harbor.js's click handler through gearAct(),
// which edits `save` (the pure edits are in js/gear-save.js) and returns the sound to play, or null. Moving a part follows the gun deck's rule
// (js/gunbay.js): tap a spare to pick it up and its slot is outlined, tap the slot to wear it (the piece worn there goes back to the bag); tap a
// worn piece to look at it or take it off. Every move says what happened with an Undo for the latest one only. The gun slot is a pointer to the
// gun deck above: guns keep their own picking, and their cards use gearExtraHtml() below for affixes, re-roll, lock and break down.
Object.assign(STR.en, {
  gEmpty: "Empty", gGuns: "{n} mounted", gSlotAria: "{part}: {item}", gBag: "Spares {n} / {max} · Fittings {m}", gBagEmpty: "No spare parts yet. Sunk ships may drop gear.",
  gEquip: "Wear", gEquipTo: "Wear on {part}", gWear: "After wearing", gUnequip: "Take off", gLock: "Lock", gUnlock: "Unlock", gLocked: "Locked", gScrap: "Break down · +{n} fittings", gScrapTip: "Scrap this item into fittings. Fittings pay for re-rolling an affix (a bonus line on gear). It cannot be undone.",
  gNeedTier: "Needs a hull of tier {n} or better", gBagFull: "The bag is full ({n}): break something down first.", gNeedMats: "Needs {m} fittings and {g} gold",
  gReroll: "Re-roll · {m} fittings + {g} gold", gLvLine: "Lv {n}", gBase: "Base: ",
  gLockHint: "Lock keeps this from being broken down by mistake, batch buttons included.", gFitHint: "Fittings come from breaking down spare gear or guns. Re-rolling an affix (a bonus line on the item) spends them.",
  gPickHint: "Now tap its slot to wear it. Tap it again, press Esc or tap a blank spot to cancel.", gWornHint: "Worn. Take it off to put a spare on, or tap a spare to swap.",
  gCmp: "Compared with what you wear", gCmpNone: "Nothing worn here: all of it is new", gCmpSame: "No change", gCmpLost: "Lose: {text}", gCmpLeg: "A legendary effect", gCmpWas: "was {n}%",
  gBatch: "Break down up to {r}: {n} · +{m} fittings", gBatchNone: "Nothing to break down up to {r}",
  gMoved: "Wore {name}.", gMovedOff: "Took off {name}.", gSwapped: "Wore {a}; {b} is back in the bag.", gUndo: "Undo", gUndone: "Undone.", gTipEmpty: "Nothing worn here: pick a spare first, then tap here.", gTipWrong: "That spare belongs to another part.",
  gGunRef: "Compared with your {gun}", gGunNone: "No mounted gun to compare with",
});
Object.assign(STR.zh, {
  gEmpty: "空", gGuns: "已裝 {n} 門", gSlotAria: "{part}：{item}", gBag: "備用 {n} / {max} · 零件 {m}", gBagEmpty: "還沒有備用裝備。擊沉的船可能掉裝備。",
  gEquip: "穿上", gEquipTo: "穿上到「{part}」", gWear: "穿上後的數值", gUnequip: "卸下", gLock: "鎖定", gUnlock: "解鎖", gLocked: "已鎖定", gScrap: "拆解 · +{n} 零件", gScrapTip: "把這件拆成零件。零件用來重洗詞綴（裝備上的加成）。拆了就回不來。",
  gNeedTier: "需要船級 {n} 以上的船", gBagFull: "背包已滿（{n}）：先拆解一些。", gNeedMats: "需要 {m} 零件與 {g} 金幣",
  gReroll: "重洗 · {m} 零件 + {g} 金幣", gLvLine: "Lv {n}", gBase: "基礎：",
  gLockHint: "鎖定後這件不會被誤拆解，批次拆解也會跳過它。", gFitHint: "零件來自拆解用不到的備用裝備或火砲，重洗詞綴（裝備上的加成）時會用掉。",
  gPickHint: "再點它的部位格來穿上。再點一次、按 Esc 或點空白處可取消。", gWornHint: "已穿上。卸下才能換別件，或直接點備用品對調。",
  gCmp: "與目前穿的比較", gCmpNone: "這個部位還沒穿東西：全都是新增", gCmpSame: "沒有變化", gCmpLost: "失去：{text}", gCmpLeg: "傳說效果", gCmpWas: "原本 {n}%",
  gBatch: "批次拆解到{r}：{n} 件，+{m} 零件", gBatchNone: "沒有可拆解到{r}的裝備",
  gMoved: "已穿上{name}。", gMovedOff: "已卸下{name}。", gSwapped: "已穿上{a}；{b}回到背包。", gUndo: "復原", gUndone: "已復原。", gTipEmpty: "這裡還沒穿東西：先點一件備用品，再點這裡。", gTipWrong: "那件備用品屬於別的部位。",
  gGunRef: "與你的{gun}比較", gGunNone: "沒有可比較的船上火砲",
});
const GEAR_ACTS = ["gslot", "gbag", "gequip", "gunequip", "gpup", "gpup5", "glock", "gscrap", "greroll", "gbatch", "gearundo", "gdeck"];
let gearSel = null;    // the picked spare { w: "bag", i } or worn piece { w: "worn", p }, or null
let gearNote = null;   // the latest move { text: [key, args], before: { gear, shipId } } for Undo, or a bare { tip }
const cancelGearPick = () => { if (!gearSel) return false; gearSel = null; gearNote = null; renderPort(); return true; };   // Esc (js/menu.js goBack)
const gunLoc = () => (deckSel ? { w: deckSel.side === "store" ? "store" : "mount", side: deckSel.side, i: deckSel.i, ...(deckSel.e != null ? { e: deckSel.e } : {}) } : null);   // the picked gun (js/gunbay.js)
const locOf = w => (w === "gun" ? gunLoc() : gearSel);

// ---------- the compare numbers ----------
// Pure: rows [{ k, now, was, dir }] for the effects that change when `it` replaces the worn piece of its part: dir 1 better, -1 worse.
function gearCompare(worn, it) {
  const before = gearTotals(worn), after = gearTotals({ ...worn, [it.p]: it });
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map(k => ({ k, now: after[k] || 0, was: before[k] || 0 }))
    .filter(r => Math.abs(r.now - r.was) > 0.0005).map(r => ({ ...r, dir: r.now > r.was ? 1 : -1 }));
}
// What a gun does on this hull with its gear: damage per ball, range, shots per minute.
function gunEff(gun) {
  const G = GUNS[gun.g], mod = gunMods(gun);
  return { dmg: G.dmg * gunLvMul(gun.lv) * shipGunK() * (1 + mod.gdmg), range: G.range * (1 + mod.grange + gx("reach")), rpm: G.rpm * (1 + mod.greload) };
}
// The mounted gun a picked stored gun would most likely replace: the weakest of its type, else the weakest of all.
function gunRef(s, gun) {
  const mounted = MOUNTS.flatMap(({ key }) => s[key] || []).filter(Boolean), same = mounted.filter(x => x.g === gun.g);
  return (same.length ? same : mounted).slice().sort((a, b) => gunEff(a).dmg - gunEff(b).dmg)[0] || null;
}
const arrow = d => (d > 0 ? `<b class="up" aria-hidden="true">▲</b> ` : d < 0 ? `<b class="dn" aria-hidden="true">▼</b> ` : "");
// "After wearing": the ship's own numbers, before and after (the % lines under it say where they come from).
function wearHtml(it) {
  const rows = gearWearStats(save.gear.worn, it, { hull: yardVal("hull"), sails: yardVal("sails"), hold: yardVal("hold") });
  return rows.length ? `<div class="cmp wear"><div class="lbl">${t("gWear")}</div><ul>${rows.map(r => `<li>${arrow(r.next > r.now ? 1 : -1)}${YARD[r.k].show(r.now)} → <b>${YARD[r.k].show(r.next)}</b></li>`).join("")}</ul></div>` : "";
}
function compareHtml(rows, head, legend) {
  const li = rows.map(r => `<li>${arrow(r.dir)}${r.now > 0 ? t("ga_" + r.k, { n: gearPct(r.now) }) + ` <small>(${t("gCmpWas", { n: gearPct(r.was) })})</small>` : t("gCmpLost", { text: t("ga_" + r.k, { n: gearPct(r.was) }) })}</li>`);
  if (legend) li.push(`<li>${arrow(legend)}${t("gCmpLeg")}</li>`);
  return `<div class="cmp"><div class="lbl">${head}</div>${li.length ? `<ul>${li.join("")}</ul>` : `<p class="hint-s">${t("gCmpSame")}</p>`}</div>`;
}
function gunCompareHtml(gun) {
  const ref = gunRef(save, gun);
  if (!ref || ref === gun) return "";
  const a = gunEff(gun), b = gunEff(ref), row = (key, now, was, dir) => `<li>${arrow(dir)}${t(key, { n: Math.round(now) })}</li>`;
  const d = (x, y) => (Math.abs(x - y) < 0.05 ? 0 : x > y ? 1 : -1);
  return `<div class="cmp"><div class="lbl">${t("gGunRef", { gun: t("gf_" + ref.g) + " Lv " + ref.lv })}</div><ul>${row("dmg", a.dmg, b.dmg, d(a.dmg, b.dmg))}${row("range", a.range, b.range, d(a.range, b.range))}${row("rpm", a.rpm, b.rpm, d(a.rpm, b.rpm))}</ul></div>`;
}

// ---------- the card pieces (shared with the gun card, js/gunbay.js) ----------
const rarClass = it => " r" + gearR(it);
const rarLine = it => `${t("gr_" + gearR(it))} · ${t("gIl", { n: gearIl(it) })}${it.g ? "" : " · " + t("gLvLine", { n: gearLv(it) })}${it.lk ? " · " + t("gLocked") : ""}`;
// Affix lines (each with its re-roll button), the base line and the legendary line. `w`: "gun" or "gear" (which pick the buttons act on).
function gearExtraHtml(it, w, at = "") {   // at: extra attributes on its buttons: the ledger's candidate card names the gun it is about (js/ledger-panel.js)
  const c = gearRerollCost(it), r = gearR(it), canPay = save.gear.mats >= c.mats && save.gold >= c.gold, mult = it.g ? 1 : gearLvMul(it);
  const base = gearSources({ ...it, af: [] })[0], part = gearPart(it);
  const lines = (base ? [`<li class="base">${t("gBase")}${t("ga_" + base[0], { n: gearPct(base[1]) })}</li>`] : []).concat(gearAffixes(it).map(([k, v], i) =>
    `<li>${t("ga_" + k, { n: gearPct(v * mult) })}${r ? ` <button class="btn ghost sm" type="button" data-act="greroll" data-w="${w}" data-k="${i}"${at} ${canPay ? "" : "disabled"}>${t("gReroll", { m: c.mats, g: fmt(c.gold) })}</button>` : ""}</li>`));
  if (it.lg) lines.push(`<li class="leg">${gearLegendText(part)}</li>`);
  const lockBtn = `<button class="btn ghost" type="button" data-act="glock" data-w="${w}"${at}>${t(it.lk ? "gUnlock" : "gLock")}</button>`;
  return { list: (lines.length ? `<ul class="afx">${lines.join("")}</ul>` : "") + `<p class="lockhint">${t("gLockHint")}</p>`, lockBtn,
    scrapBtn: `<button class="btn ghost" type="button" data-act="gscrap" title="${t("gScrapTip")}" data-w="${w}"${at} ${it.lk ? "disabled" : ""}>${t("gScrap", { n: gearScrapValue(it) })}</button>` };
}

// ---------- actions: each returns the sound to play, or null when nothing happened ----------
const gearSnap = () => ({ gear: save.gear, shipId: save.shipId });
const gearUp5Key = () => `gpup5:${gearSel.w}${gearSel.i ?? gearSel.p ?? ""}`;   // the armed state of the picked piece's "upgrade N levels" button
const itemAt = () => (gearSel ? gearAt(save, gearSel) : null);
function gearAct(act, d) {
  const cand = d.side !== undefined && (d.w || "gear") === "gun";   // a button of the ledger's candidate card: the gun it names, not the picked port's
  const need = w => { const l = cand ? { w: d.side === "store" ? "store" : "mount", side: d.side, i: +d.i, ...(d.e !== undefined ? { e: +d.e } : {}) } : locOf(w); return l && gearAt(save, l) ? l : null; };
  if (act === "gdeck") { document.getElementById("deck")?.closest("section")?.scrollIntoView({ block: "start", behavior: "smooth" }); return null; }
  if (act === "gearundo") {
    const n = gearNote;
    if (!n || !n.before || n.before.shipId !== save.shipId) return null;
    save = { ...save, gear: n.before.gear }; gearSel = null; gearNote = { tip: "gUndone" }; return "uiClick";
  }
  if (act === "gbatch") {
    const r = gearScrapBelow(save, +d.r);
    if (!r.n) return null;
    save = r.save; gearSel = null; gearNote = null; deckSel = null; return "buy";
  }
  if (act === "gslot" || act === "gbag") {
    const at = act === "gbag" ? { w: "bag", i: +d.i } : { w: "worn", p: d.p }, tapped = gearAt(save, at), sel = itemAt();
    if (sel && gearSel.w === at.w && gearSel.i === at.i && gearSel.p === at.p) { gearSel = null; return "uiClick"; }
    if (act === "gslot" && sel && gearSel.w === "bag") {   // a spare is picked and a slot tapped: wear it there
      if (sel.p !== d.p) { gearNote = { tip: "gTipWrong" }; return "denied"; }
      const next = gearEquip(save, gearSel.i);
      if (!next) { gearNote = { tip: "gNeedTier", n: gearIl(sel) }; return "denied"; }
      const old = save.gear.worn[d.p], before = gearSnap();
      save = next; gearSel = null; deckSel = null;
      gearNote = { text: old ? ["gSwapped", { a: gearTitle(sel), b: gearTitle(old) }] : ["gMoved", { name: gearTitle(sel) }], before };
      return "reload";
    }
    if (!tapped) { gearNote = { tip: "gTipEmpty" }; return "denied"; }
    gearSel = at; gearNote = null; deckSel = null; return "uiClick";
  }
  const w = d.w || "gear", l = need(w), it = l && gearAt(save, l);
  if (!it) return null;
  if (act === "gequip") {   // from the card of a picked spare
    return gearAct("gslot", { p: it.p });
  }
  if (act === "gunequip") {
    const next = gearUnequip(save, l.p), before = gearSnap();
    if (!next) { gearNote = { tip: "gBagFull", n: GEAR_BAG_MAX }; return "denied"; }
    save = next; gearNote = { text: ["gMovedOff", { name: gearTitle(it) }], before }; gearSel = null; return "uiClick";
  }
  if (act === "glock") { const next = gearToggleLock(save, l); if (!next) return null; save = next; return "uiClick"; }
  if (act === "gscrap") {
    const next = gearScrapAt(save, l);
    if (!next) return null;
    save = next; if (w === "gun") { if (cand) candSel = null; else deckSel = null; } else gearSel = null; gearNote = null; return "buy";
  }
  if (act === "greroll") { const next = gearRerollAt(save, l, +d.k); if (!next) return null; save = next; return "upgrade"; }
  if (act === "gpup" || act === "gpup5") {
    if (act === "gpup5" && !confirmed(`gpup5:${l.w}${l.i ?? l.p ?? ""}`)) return null;   // a big spend: the first tap arms the button (js/escort-ui.js twoTap)
    const next = gearUpAt(save, l, act === "gpup5" ? GUN_UP_BATCH : 1);
    if (!next) return null;
    save = next; gearNote = null; return "upgrade";
  }
  return null;
}

// ---------- markup ----------
const slotItemName = it => (it ? `${gearTypeName(it)}<small>${t("gIl", { n: gearIl(it) })} · ${t("gLvLine", { n: gearLv(it) })}${it.lk ? " · " + t("gLocked") : ""}</small>` : `${t("gEmpty")}<small>&nbsp;</small>`);
function slotsHtml() {
  const tier = gearTierOf(save.ship), sel = itemAt(), cells = GEAR_PARTS.map(p => {
    if (p === "gun") {
      const guns = MOUNTS.flatMap(({ key }) => save[key] || []).filter(Boolean), best = guns.reduce((m, g) => Math.max(m, gearR(g)), 0);
      return `<button class="gslot r${best}" type="button" data-act="gdeck" aria-label="${t("gSlotAria", { part: t("gp_gun"), item: t("gGuns", { n: guns.length }) })}"><span class="pn">${t("gp_gun")}</span>${t("gGuns", { n: guns.length })}<small>${t("gr_" + best)}</small></button>`;
    }
    const it = save.gear.worn[p], picked = !!gearSel && gearSel.w === "worn" && gearSel.p === p, dest = !!sel && gearSel.w === "bag" && sel.p === p && gearWearable(sel, tier);
    return `<button class="gslot${it ? rarClass(it) : " empty"}${picked ? " sel" : ""}${dest ? " dest" : ""}" type="button" data-act="gslot" data-p="${p}" aria-pressed="${picked}" aria-label="${t("gSlotAria", { part: t("gp_" + p), item: it ? gearTypeName(it) : t("gEmpty") })}"><span class="pn">${t("gp_" + p)}</span>${slotItemName(it)}</button>`;
  });
  return `<div class="gslots">${cells.join("")}</div>`;
}
function cardHtml() {
  const it = itemAt(); if (!it) return "";
  const spare = gearSel.w === "bag", tier = gearTierOf(save.ship), x = gearExtraHtml(it, "gear"), ok = gearWearable(it, tier);
  const max = gearLv(it) >= GEAR_LV_MAX, cost = gearUpCost(it), short = cost - save.gold, plan = gearUpPlan(it, save.gold), worn = save.gear.worn[it.p];
  const up = max ? `<button class="btn max" type="button" disabled>${t("max")}</button>` : `<button class="btn" type="button" data-act="gpup" ${short > 0 ? "disabled" : ""}>${upgradeLabel(gearLv(it) + 1, cost, short, t("gainFx", { p: pctUp(gearLvMul(it), gearLvMul({ ...it, lv: gearLv(it) + 1 })) }))}</button>`;
  const up5 = plan.n >= 2 ? `<button class="btn" type="button" data-act="gpup5" ${plan.short > 0 ? "disabled" : ""}${armedNow(gearUp5Key()) ? armAttrs() : ""}>${t(plan.short > 0 ? "upNShort" : armedNow(gearUp5Key()) ? "upNArm" : "upN", { n: plan.n, cost: fmt(plan.cost), d: fmt(plan.short) })}${gainLine(t("gainFx", { p: pctUp(gearLvMul(it), gearLvMul({ ...it, lv: gearLv(it) + plan.n })) }))}</button>` : "";
  const wear = spare ? `<button class="btn" type="button" data-act="gequip" data-w="gear" ${ok ? "" : "disabled"}>${t("gEquipTo", { part: t("gp_" + it.p) })}</button>` : `<button class="btn ghost" type="button" data-act="gunequip" data-w="gear">${t("gUnequip")}</button>`;
  const cmp = spare ? wearHtml(it) + compareHtml(gearCompare(save.gear.worn, it), worn ? t("gCmp") : t("gCmpNone"), it.lg && !(worn && worn.lg) ? 1 : !it.lg && worn && worn.lg ? -1 : 0) : "";
  return `<div class="gcard gear${rarClass(it)}"><div class="nm">${gearTitle(it)}<small>${rarLine(it)}</small></div>
    <div class="gacts">${wear}${up}${up5}${x.lockBtn}${spare ? x.scrapBtn : ""}</div>${x.list}${cmp}
    <p class="hint-s">${!ok ? t("gNeedTier", { n: gearIl(it) }) + ". " : ""}${t(spare ? "gPickHint" : "gWornHint")}</p></div>`;
}
function noteHtml() {
  if (!gearNote) return "";
  if (gearNote.tip) return `<p class="gnote tip" role="status">${t(gearNote.tip, { n: gearNote.n })}</p>`;
  return `<div class="gnote" role="status"><span>${t(...gearNote.text)}</span><button class="btn ghost" type="button" data-act="gearundo">${t("gUndo")}</button></div>`;
}
function bagHtml() {
  const bag = save.gear.bag, tier = gearTierOf(save.ship);
  const tiles = bag.map((it, i) => `<button class="slot${rarClass(it)}${gearSel && gearSel.w === "bag" && gearSel.i === i ? " sel" : ""}${gearWearable(it, tier) ? "" : " over"}" type="button" data-act="gbag" data-i="${i}" aria-pressed="${!!gearSel && gearSel.w === "bag" && gearSel.i === i}" aria-label="${gearTitle(it)}, ${rarLine(it)}">${t("gp_" + it.p)}<small>${gearTypeName(it) === t("gp_" + it.p) ? t("gr_" + gearR(it)) : gearTypeName(it)} · ${gearIl(it)}${it.lk ? " · " + t("gLocked") : ""}</small></button>`);
  const batch = [0, 1, 2].map(r => { const b = gearScrapBelow(save, r);
    return `<button class="btn ghost sm" type="button" data-act="gbatch" title="${t("gScrapTip")}" data-r="${r}" ${b.n ? "" : "disabled"}>${t(b.n ? "gBatch" : "gBatchNone", { r: t("gr_" + r), n: b.n, m: b.mats })}</button>`; });
  return `<div class="lbl" title="${t("gFitHint")}">${t("gBag", { n: bag.length, max: GEAR_BAG_MAX, m: save.gear.mats })}</div>` +
    (tiles.length ? `<div class="slots">${tiles.join("")}</div>` : `<p class="hint-s">${t("gBagEmpty")}</p>`) + `<div class="gbatch">${batch.join("")}</div><p class="hint-s">${t("gFitHint")}</p>`;
}
function renderGear() {
  const box = document.getElementById("gear");
  if (!box || !save.gear) return;
  if (gearSel && !itemAt()) gearSel = null;   // the spare was worn, broken down, or the ship changed
  if (gearNote && gearNote.before && gearNote.before.shipId !== save.shipId) gearNote = null;
  document.getElementById("port").classList.toggle("gpicking", !!gearSel);
  box.innerHTML = slotsHtml() + noteHtml() + cardHtml() + `<div class="gbag">${bagHtml()}</div>`;
}
onHook("renderPort", renderGear);
