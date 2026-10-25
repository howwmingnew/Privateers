"use strict";
// ---------- The ledger's fleet: a tab per ship, the picked ship's gun deck, one context panel ----------
// Tabs: the flagship, then escort slots 1-4 once the first bounty is claimed (js/escorts.js). The stage under them is the picked ship's gun deck, drawn
// by js/deck-art.js from that ship's own ports; an escort's header carries its stance and deploy controls. A slot with no ship has no deck: its stage
// holds the choices (js/ledger-panel.js berthHtml). Tapping a gun port picks it (deckSel, js/gunbay.js) and tapping the hull picks the hull (hullOpen);
// the context panel under the stage (#ctx, js/ledger-panel.js) shows what that pick offers. Esc closes it (cancelLedgerPick / cancelGunPick, js/menu.js).
// Actions: harbor.js hands TAB_ACTS to tabAct(), the esc* ones to escortAct() (js/escort-ui.js).
const TAB_ACTS = ["tab", "port", "hull", "ctxclose", "gprev"];
let tab = 0;            // the picked tab: 0 the flagship, n the escort in slot n - 1
let hullOpen = false;   // the hull of that ship is picked
let candSel = null;     // a gun of the panel's replace list whose card is open: a place like deckSel (js/gunbay.js), or null
let lastPick = "";      // what the context panel showed last (renderFleet): a new pick scrolls the panel back to its top
let ledgerFocus = null; // a selector the click handler focuses after the next render (a closed panel: the thing it was about)

// Nothing picked: no gun port, no hull, no undo note.
function resetLedgerPick() { deckSel = null; gunNote = null; hullOpen = false; candSel = null; if (typeof gearSel !== "undefined") gearSel = null; }
const escortsShown = () => save.campaign.bounty >= 1 || save.escorts.length > 0;   // the tabs appear once bounty 1 has been claimed

function tabAct(act, d) {
  if (act === "tab") {
    const n = +d.i;
    if (!(n >= 0 && n <= ESCORT_SLOTS) || n === tab) return null;
    tab = n; resetLedgerPick();
    return "uiClick";
  }
  if (act === "port") {   // pick the port, or put it down again when it is the one already picked
    const p = placeOf(d.side, +d.i, d.e);
    deckSel = deckSel && samePlace(deckSel, p) ? null : p; hullOpen = false; gunNote = null; candSel = null; if (typeof gearSel !== "undefined") gearSel = null;
    return "uiClick";
  }
  if (act === "gprev") { const p = placeOf(d.side, +d.i, d.e); candSel = candSel && samePlace(candSel, p) ? null : p; return "uiClick"; }   // open or close a candidate's card
  if (act === "hull") { const open = !hullOpen; resetLedgerPick(); hullOpen = open; return "uiClick"; }
  if (act === "ctxclose") {
    ledgerFocus = deckSel ? `#deck [data-act="port"][data-side="${deckSel.side}"][data-i="${deckSel.i}"]${deckSel.e != null ? `[data-e="${deckSel.e}"]` : ":not([data-e])"}` : '#deck [data-act="hull"]';
    resetLedgerPick();
    return "uiClick";
  }
  return null;
}
// Esc (js/menu.js goBack): an open hull panel closes; a picked gun port is cancelGunPick's (js/gunbay.js).
function cancelLedgerPick() {
  if (!hullOpen) return false;
  hullOpen = false; renderPort();
  document.querySelector('#deck [data-act="hull"]')?.focus();
  return true;
}

// ---------- the tabs ----------
const MINI_HULL = `<svg class="mini" viewBox="0 0 20 30" aria-hidden="true"><path d="M10 1C15 8 16 18 14 28H6C4 18 5 8 10 1Z"/></svg>`;
function tabsHtml() {
  const one = (n, role, name, cls, dot, extra = "", why = "") => `<button class="tab${cls}${n === tab ? " sel" : ""}" type="button" role="tab" aria-selected="${n === tab}" data-act="tab" data-i="${n}" ` +
    `aria-label="${role} · ${name.replace(/<[^>]+>/g, "")}${extra ? " · " + extra : ""}${why ? " · " + why : ""}">${MINI_HULL}<span><span class="tl">${role}</span><span class="tn">${name}</span>${why ? `<span class="tw">${why}</span>` : ""}</span>${dot}</button>`;
  const out = [one(0, t("tabFlag"), shipNameOf(activeShip(save)), "", "")];
  for (let i = 0; i < ESCORT_SLOTS; i++) {
    const e = save.escorts[i], role = t("tabEsc", { n: i + 1 });
    if (e) {
      const ship = escortShipOf(save, e), on = ship && escortReady(save, i), state = t(on ? "stOn" : "stOff");
      out.push(ship ? one(i + 1, role, shipNameOf(ship), "", `<span class="dot${on ? " on" : ""}" title="${state}"></span>`, state) : one(i + 1, role, t("tabEmpty"), " empty", ""));
    } else if (!escortOpen(save, i) || i > save.escorts.length) {   // greyed, and it says what opens it: a bounty, or the slot before it
      out.push(one(i + 1, role, t("tabLock"), " empty lock", "", "", t(!escortOpen(save, i) ? "tabLockBounty" : "tabLockOrder", { n: !escortOpen(save, i) ? i + 1 : i })));
    }
    else out.push(one(i + 1, role, t("tabBuy", { n: fmt(escortPrice(i)) }), " empty", ""));
  }
  return out.join("");
}

// ---------- the stage: header, deck, the ship's levels ----------
function escHeadHtml(i, e, ship) {
  const stances = ESCORT_STANCES.map(k => `<button class="${e.stance === k ? "on" : ""}" type="button" data-act="escStance" data-id="${i}" data-k="${k}" aria-pressed="${e.stance === k}">${t("st_" + k)}</button>`).join("");
  const go = [[1, "escDeploy"], [0, "stOff"]].map(([v, k]) => `<button class="${!!v === e.on ? "on" : ""}${v ? " go" : ""}" type="button" data-act="escOn" data-id="${i}" data-v="${v}" aria-pressed="${!!v === e.on}">${t(k)}</button>`).join("");
  const pay = e.owed > 0 ? `<button class="btn" type="button" data-act="escPay" data-id="${i}" ${save.gold < e.owed ? "disabled" : ""}>${t("escRepair", { n: fmt(e.owed) })}</button>` : "";
  const status = e.owed > 0 ? `<span class="lock">${t("escOwed", { n: fmt(e.owed) })}</span>` : escortGunCount(e) === 0 ? `<span class="lock">${t("escNoGuns")}</span>` : !e.on ? t("escOff") : t("escOn");
  return `<div class="ctl"><div class="seg" role="group" aria-label="${t("escStance")}">${stances}</div><div class="seg" role="group">${go}</div>${pay}</div>
    <p class="ds estatus">${t("stn_" + e.stance)} · ${t("escFire")} · ${status}</p>`;
}
function stageHeadHtml(ship, i) {
  const role = i < 0 ? t("tabFlag") : t("tabEsc", { n: i + 1 }), e = i >= 0 ? save.escorts[i] : null;
  const name = ship ? `${shipNameOf(ship)}<small>${ship.name ? t("s_" + ship.ship) : ""}</small>` : "";
  return `<div class="hl"><div class="role">${role}</div>${name ? `<div class="sname">${name}</div>` : ""}</div>` + (ship && e ? escHeadHtml(i, e, ship) : "");
}
const shipFootHtml = e => Object.entries(YARD).map(([k, y]) => `<span>${t("y_" + k)} <b>${t("sfootLv", { n: e[k] })}</b> · ${y.show(yardVal(k, e[k], SHIPS[e.ship]))}</span>`).join("");
// What a slot with no ship shows in the stage: why it is shut, the price, or the two choices.
function slotBodyHtml(i) {
  const e = save.escorts[i], head = t("tabEsc", { n: i + 1 });
  if (e) return berthHtml(i);   // bought: assign an idle ship or buy one
  const price = escortPrice(i);
  if (!escortOpen(save, i)) return `<div class="berth"><p class="role">${head}</p><p class="lock">${t("escLocked", { n: i + 1, price: fmt(price) })}</p></div>`;
  if (i > save.escorts.length) return `<div class="berth"><p class="role">${head}</p><p class="lock">${t("escOrder", { n: i })}</p></div>`;
  const lbl = armedTap("escBuy" + i) ? t("escBuyArm") : t(save.gold < price ? "escBuyShort" : "escBuy", { n: fmt(price), d: fmt(price - save.gold) });
  return `<div class="berth"><p class="role">${head}</p><div class="card"><h3>${t("escSlot", { n: i + 1 })}</h3><p class="sub">${t("escHint")}</p>` +
    `<button class="btn" type="button" data-act="escBuy" data-id="${i}" ${save.gold < price ? "disabled" : ""}>${lbl}</button></div></div>`;
}
function deckView(n, ship) {
  if (n === 0) return { ship: save.ship, mounts: save, e: undefined, hull: hullOpen, livery: null };
  const guns = save.escorts[n - 1].guns || {}, empty = emptyGuns(ship.ship);
  return { ship: ship.ship, mounts: Object.fromEntries(MOUNTS.map(({ key }) => [key, Array.isArray(guns[key]) ? guns[key] : empty[key]])), e: n - 1, hull: hullOpen, livery: typeof LIVERY !== "undefined" && LIVERY.ally ? "ally" : null };
}

// The whole fleet block of the ledger, called by renderPort (js/harbor.js) after renderGunBay has dropped a pick whose place is gone.
function renderFleet() {
  const $ = id => document.getElementById(id), show = escortsShown();
  if (!show) tab = 0;
  tab = clamp(tab, 0, ESCORT_SLOTS);
  const ship = tabShipOf(tab), i = tab - 1;
  if (!ship) { deckSel = null; hullOpen = false; }
  if (candSel && (!deckSel || !gunAt(candSel))) candSel = null;   // the card belongs to a picked port's list, and to a gun still there
  const tabs = $("tabs");
  tabs.hidden = !show; tabs.innerHTML = show ? tabsHtml() : "";
  const rep = $("escRep"), r = typeof escortReport !== "undefined" ? escortReport : null;
  rep.hidden = !(show && r);
  rep.innerHTML = show && r ? `${t("escReport", { n: fmt(r.paid) })}${r.lost.length ? " " + t("escReportSunk", { names: r.lost.join(", ") }) : ""}` : "";
  $("shead").innerHTML = stageHeadHtml(ship, i);
  const deck = $("deck"), foot = $("sfoot"), berth = $("berth");
  deck.style.display = foot.style.display = ship ? "" : "none";
  if (ship) { renderDeck(deck, deckView(tab, ship)); foot.innerHTML = shipFootHtml(ship); berth.innerHTML = ""; }
  else { foot.innerHTML = ""; berth.innerHTML = slotBodyHtml(i); }
  const ctx = $("ctx"), pick = `${tab}|${hullOpen}|${deckSel ? `${deckSel.side}${deckSel.i}${deckSel.e ?? ""}` : ""}`;
  ctx.innerHTML = ctxHtml();
  ctx.classList.toggle("open", !!ship && (hullOpen || !!deckSel));
  if (pick !== lastPick) { ctx.scrollTop = 0; lastPick = pick; }   // a newly opened panel starts at its top, not where the last one was scrolled to (a phone's bottom sheet scrolls)
}
