"use strict";
// ---------- The ledger's Escorts page: buy slots, assign yard ships, pick guns and stance, deploy or stand down ----------
// Rendered into #escorts by the renderPort hook; its buttons carry data-act "esc*" and are handled by harbor.js's click handler
// through escortAct(), which edits `save` (the pure edits are in js/escorts.js) and returns the sound to play, or null.
Object.assign(STR.en, { escOrder: "Buy slot {n} first", escDown: "No ship aboard: assign one to deploy it" });
Object.assign(STR.zh, { escOrder: "先購買船位 {n}", escDown: "沒有指派船：先指派一艘才能出戰" });
const ESC_ACTS = ["escBuy", "escShip", "escGun", "escStance", "escOn", "escPay"];
let escArmed = -1, escArmedAt = 0, escArmTimer;

const escNext = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
function escortAct(act, d) {
  const i = Number(d.id);
  if (act === "escBuy") {
    if (i !== save.escorts.length || !escortOpen(save, i) || save.gold < escortPrice(i)) return null;
    if (escArmed === i && performance.now() - escArmedAt < 400) return null;   // a double-click is not a second tap
    clearTimeout(escArmTimer);
    if (escArmed !== i) {   // a slot is a big spend: the button needs a second tap within a few seconds
      escArmed = i; escArmedAt = performance.now();
      escArmTimer = setTimeout(() => { escArmed = -1; if (!portEl.hidden) renderEscorts(); }, 3000);
      renderEscorts(); document.querySelector(`[data-act="escBuy"][data-id="${i}"]`)?.focus();
      return null;
    }
    escArmed = -1;
    const next = buyEscortSlot(save);
    if (!next) return null;
    save = next; portMsg = ["escBought", { n: i + 1 }];
    return "buy";
  }
  let next = null;
  if (act === "escShip") {
    const ids = ["", ...escortCandidates(save, i).map(x => x.id)], cur = save.escorts[i] && save.escorts[i].id;
    if (ids.length > 1) next = setEscort(save, i, { id: escNext(ids, ids.includes(cur) ? cur : "") });
  } else if (act === "escGun") {
    const e = save.escorts[i];
    if (e) next = setEscort(save, i, { gun: escNext(escortGunTypes(save), escortGunOf(save, e)) });
  } else if (act === "escStance") next = setEscort(save, i, { stance: d.k });
  else if (act === "escOn") { const e = save.escorts[i]; if (e) next = setEscort(save, i, { on: !e.on }); }
  else if (act === "escPay") next = payEscort(save, i);
  if (!next) return null;
  save = next;
  return act === "escPay" ? "buy" : "uiClick";
}

const escBtn = (act, i, label, extra = "", k = "") => `<button class="btn" type="button" data-act="${act}" data-id="${i}"${k ? ` data-k="${k}"` : ""} ${extra}>${label}</button>`;
function slotHtml(i) {
  const e = save.escorts[i], head = t("escSlot", { n: i + 1 });
  if (!e) {   // not bought yet
    const price = escortPrice(i);
    if (!escortOpen(save, i)) return `<div class="item locked"><div class="nm">${head}</div><button class="btn" type="button" disabled>${t("locked")}</button><div class="ds"><span class="lock">${t("escLocked", { n: i + 1, price: fmt(price) })}</span></div></div>`;
    if (i > save.escorts.length) return `<div class="item locked"><div class="nm">${head}</div><button class="btn" type="button" disabled>${t("locked")}</button><div class="ds"><span class="lock">${t("escOrder", { n: i })}</span></div></div>`;
    const lbl = escArmed === i ? t("escBuyArm") : t("escBuy", { n: fmt(price) });
    return `<div class="item"><div class="nm">${head}</div>${escBtn("escBuy", i, lbl, save.gold < price ? "disabled" : "")}<div class="ds">${t("escHint")}</div></div>`;
  }
  const ship = escortShipOf(save, e), cand = escortCandidates(save, i), gun = escortGunOf(save, e);
  const lvs = ship ? t("shipLvs", { h: ship.hull, s: ship.sails, o: ship.hold }).replace(/^ · /, "") : "";
  const shipLabel = ship ? `${esc(ship.name || t("s_" + ship.ship))}<small>${ship.name ? t("s_" + ship.ship) + " · " : ""}${lvs}</small>`
    : e.id ? t("escGone") : t("escNone");
  const state = e.owed > 0 ? escBtn("escPay", i, t("escRepair", { n: fmt(e.owed) }), save.gold < e.owed ? "disabled" : "")
    : !ship ? `<button class="btn max" type="button" disabled>${t("escOff")}</button>`
    : escBtn("escOn", i, e.on ? t("escStay") : t("escDeploy"));
  const stances = ESCORT_STANCES.map(k => `<button class="btn${e.stance === k ? " on" : ""}" type="button" data-act="escStance" data-id="${i}" data-k="${k}" aria-pressed="${e.stance === k}">${t("st_" + k)}</button>`).join("");
  const status = e.owed > 0 ? `<span class="lock">${t("escOwed", { n: fmt(e.owed) })}</span>` : !ship ? t("escDown") : e.on ? t("escOn") : t("escOff");
  return `<div class="item esc"><div class="nm">${head}</div>${state}<div class="ds">${status}</div>
    <div class="esc-row"><span class="esc-l">${t("escShip")}</span><span class="esc-v">${shipLabel}</span>${escBtn("escShip", i, t("escChange"), cand.length ? "" : "disabled")}</div>
    <div class="esc-row"><span class="esc-l">${t("escGun")}</span><span class="esc-v">${t("escGunLv", { gun: t("g_" + gun), lv: escortGunLv(save, gun) })}</span>${escBtn("escGun", i, t("escChange"))}</div>
    <div class="esc-row"><span class="esc-l">${t("escStance")}</span>${stances}</div>
    <div class="ds esc-note">${t("stn_" + e.stance)} · ${t("escFire")}</div></div>`;
}
function renderEscorts() {
  const box = document.getElementById("escorts"), sec = box && box.closest("section");
  if (!box) return;
  const show = save.campaign.bounty >= 1 || save.escorts.length > 0;   // the page appears once bounty 1 has been claimed
  sec.hidden = !show;
  if (!show) { box.innerHTML = ""; return; }
  const spare = save.fleet.length > 0 || save.escorts.some(e => e.id);
  const rep = escortReport ? `<p class="hint-s">${t("escReport", { n: fmt(escortReport.paid) })}${escortReport.lost.length ? " " + t("escReportSunk", { names: escortReport.lost.join(", ") }) : ""}</p>` : "";
  box.innerHTML = `${rep}${spare ? "" : `<p class="hint-s">${t("escNoSpare")}</p>`}${Array.from({ length: ESCORT_SLOTS }, (_, i) => slotHtml(i)).join("")}`;
}
onHook("renderPort", renderEscorts);
