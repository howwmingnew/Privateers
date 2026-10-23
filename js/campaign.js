"use strict";
// ---------- Campaign: Letters of Marque ----------
// Five bounties, one at a time, posted in the harbor ledger (poster: js/campaign-ui.js). A boss is an ordinary enemy
// (think / fire / hurt untouched) with a name, a gold skull, an HP multiplier, its own escorts and a fixed lair; `e.boss`
// and `e.cls` let later systems (archetypes, AI) specialise it. Sinking one pays a Captain's Chest straight into gold,
// raises the captain's rank and unlocks the next hull (the third also opens the Hulk Outpost). The fifth ends the war.
Object.assign(STR.en, {
  boss_ned: "Red Ned", boss_carey: "Mother Carey", boss_saint: "The Ashen Saint", boss_hale: "Commodore Hale", boss_thorne: "Admiral Thorne",
  rank_0: "Deckhand", rank_1: "Privateer", rank_2: "Captain", rank_3: "Commodore", rank_4: "Pirate Lord",
  cls_cutter: "cutter", cls_brig: "brig", cls_frigate: "frigate", cls_manowar: "man-o'-war", cls_fireship: "fire-raider",
  intro_ned: "Burns fishing smacks in the Reef Straits and sells their crews' boots in the market. Fast, and fond of long shots.",
  intro_carey: "Rules the northern reefs with a brig and a pack of cutthroats. She closes fast and boards anything that floats.",
  intro_saint: "A preacher turned pirate who sets ships ablaze and calls it mercy. Never sails without his fire-raiders.",
  intro_hale: "The Navy wants the free port for itself. Hale has orders to blockade it, and to hang you from his yardarm.",
  intro_thorne: "Admiral Thorne has brought HMS Sovereign, the greatest warship ever to sail these waters, to burn the free port. Meet her in the Maelstrom.",
  done_ned: "Red Ned's colours hang over the tavern door. The Harbourmaster signs your Letter of Marque: you sail as a <em>Privateer</em> now, and the yard will sell you a <em>schooner</em>.",
  done_carey: "Mother Carey's brig lies on the reef she ruled. The docks stand you drinks and call you <em>Captain</em>, and there's a <em>brig</em> at the yard with your name on it.",
  done_saint: "The Saint's fires are out. The merchants have moored an old hulk on the Navy Lanes as the <em>Hulk Outpost</em>: sell and patch up there, far from home. They call you <em>Commodore</em> now, and a <em>frigate</em> waits at the yard.",
  done_hale: "Hale struck his colours. The Navy calls you a pirate; the harbour calls you <em>Pirate Lord</em>. A <em>Ship of the Line</em> waits at the yard. Admiral Thorne is coming.",
  done_thorne: "HMS Sovereign lies at the bottom of the Maelstrom, and the free port is free.",
  ngStory: "<em>New Game+ {n}.</em> A new sea, fiercer captains and richer prizes. Your guns came with you; your fortune did not.",
  huntToast: "Bounty: {name} · {sea}", bossSighted: "{name} sighted!", fChest: "Captain's Chest +{n}",
  rankUp: "Bounty claimed! You are now a {rank}.",
  bossEscaped: "{name}'s ship went down to other guns, but {name} got away in a longboat. Back next time you sail.",
  locked: "Locked", shipLock: "Sink {name} to unlock",
  outpostName: "Hulk Outpost", outpostMap: "HULK OUTPOST",
  outpostNote: "A trading post on an old hulk: it buys cargo and patches hulls. The shipyard and armoury are back at Safe Harbor.",
});
Object.assign(STR.zh, {
  boss_ned: "紅鬍奈德", boss_carey: "凱莉大娘", boss_saint: "灰燼聖徒", boss_hale: "海爾准將", boss_thorne: "索恩上將",
  rank_0: "見習水手", rank_1: "私掠者", rank_2: "船長", rank_3: "准將", rank_4: "海盜王",
  cls_cutter: "快艇", cls_brig: "雙桅船", cls_frigate: "巡防艦", cls_manowar: "主力戰艦", cls_fireship: "縱火船",
  intro_ned: "在暗礁海峽放火燒漁船，還把船員的靴子拿到市場上賣。船快，愛從遠處開砲。",
  intro_carey: "帶著一艘雙桅船和一群亡命之徒稱霸北方礁區。逼近得很快，什麼船都敢跳上去搶。",
  intro_saint: "當了海盜的傳教士，放火燒船還說這是慈悲。身邊總跟著一群縱火船。",
  intro_hale: "海軍想把這座自由港據為己有。海爾奉命封鎖港口，還要把你吊死在他的帆桁上。",
  intro_thorne: "索恩上將帶著皇家海軍「君權號」來了。那是這片海域有史以來最強大的戰艦，要來燒掉自由港。到大漩渦去迎戰她。",
  done_ned: "紅鬍奈德的旗子掛在酒館門口。港務長簽下你的私掠許可狀：你現在是正式的<em>私掠者</em>，造船廠也願意賣你<em>縱帆船</em>了。",
  done_carey: "凱莉大娘的船沉在她稱霸的礁石上。碼頭上的人搶著請你喝酒，改口叫你<em>船長</em>。造船廠替你留了一艘<em>雙桅橫帆船</em>。",
  done_saint: "聖徒的火終於熄了。商人們在海軍航道上停了一艘舊船殼，改成<em>廢船前哨站</em>，讓你在遠洋也能賣貨修船。大家現在叫你<em>准將</em>，造船廠也備好了一艘<em>巡防艦</em>。",
  done_hale: "海爾降旗投降了。海軍說你是海盜，港口的人則叫你<em>海盜王</em>。造船廠裡有一艘<em>戰列艦</em>在等你。索恩上將就要來了。",
  done_thorne: "君權號沉入了大漩渦的海底，自由港依然自由。",
  ngStory: "<em>新遊戲+ {n}。</em>新的海域，更兇狠的船長，更豐厚的戰利品。火砲跟著你來了，財富可沒有。",
  huntToast: "懸賞目標：{name} · {sea}", bossSighted: "發現{name}！", fChest: "船長寶箱 +{n}",
  rankUp: "懸賞達成！你晉升為{rank}。",
  bossEscaped: "{name}的船被別人擊沉了，但{name}搭小艇逃走了。下次啟航還會再出現。",
  locked: "未解鎖", shipLock: "擊沉{name}後解鎖",
  outpostName: "廢船前哨站", outpostMap: "廢船前哨站",
  outpostNote: "用舊船殼改成的交易站，可以賣貨和修船。造船廠和軍械庫都在安全港。",
});

// [PLACEHOLDER] rewards, multipliers and escort strength: retune with .review/design/play.mjs once archetypes land.
// Lair: polar from the harbor (screen y points south), placed mid-ring so its level is the bounty's level.
// Escorts with `guns`/`hpMul` are stand-ins for archetypes that do not exist yet (a fireship has no guns at all).
const FIRE_RAIDER = { cls: "fireship", hpMul: 0.6, guns: 1 };
const BOUNTIES = [
  { id: "ned",    L: 3,  cls: "cutter",  faction: "pirate", hpMul: 2.5, speed: 0.9, ang: Math.PI,      r: ringMid(3), reward: 400,   escorts: [] },   // a stock sloop must be able to catch and sink him (cutters are fast)
  { id: "carey",  L: 5,  cls: "brig",    faction: "pirate", hpMul: 3,              ang: -Math.PI / 2,   r: ringMid(5), reward: 1500,  escorts: [{ cls: "brig" }] },
  { id: "saint",  L: 7,  cls: "brig",    faction: "pirate", hpMul: 3,              ang: Math.PI * 0.75, r: ringMid(7), reward: 4000,  escorts: [FIRE_RAIDER, FIRE_RAIDER, FIRE_RAIDER] },
  { id: "hale",   L: 9,  cls: "frigate", faction: "navy",   hpMul: 3,              ang: 0,              r: ringMid(9), reward: 10000, escorts: [{ cls: "frigate" }, { cls: "frigate" }] },
  { id: "thorne", L: 10, cls: "manowar", faction: "navy",   hpMul: 4, speed: 0.85, guns: 5, ang: Math.PI / 4, r: 3800, reward: 20000, final: true,
    escorts: [{ cls: "frigate" }, { cls: "frigate" }, { cls: "frigate" }] },
];
const LAIR_LEASH = 380;   // an idle boss (or escort) further than this from its lair heads back to it
const ASSIST_MS = 20000;  // a boss someone else sinks still pays if the player hit it this recently
const lairOf = b => polarPt(b.ang, b.r);
// Hull art for a spec class until the archetype pass gives the man-o'-war its own (js/art.js SHIP_ART).
const artClass = cls => cls === "manowar" ? "line" : SHIP_ART[cls] ? cls : "brig";
const activeBounty = () => BOUNTIES[save.campaign.bounty] || null;
const bossName = b => t("boss_" + b.id);
const shipFor = i => SHIP_ORDER.find(id => SHIP_GATE[id] === i + 1);   // the hull bounty i (0-based) unlocks
const bountyReward = b => Math.round(b.reward * lootMul());
function shipLock(id) {
  if (save.campaign.ships.includes(id)) return null;
  const b = BOUNTIES[SHIP_GATE[id] - 1];
  return b ? t("shipLock", { name: bossName(b) }) : t("locked");
}

// ---------- The bounty at sea ----------
let bossShip = null, bossTag = null, bossSeen = false, bossHitAt = -1e9, storyKey = null;
function makeSkullTex(sc) {
  if (sc.textures.exists("skull")) return;
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x1b1410, 1); g.fillCircle(11, 11, 11);
  g.fillStyle(0xf0c766, 1); g.fillCircle(11, 9.5, 7); g.fillRect(7.5, 12, 7, 5.5);
  g.fillStyle(0x1b1410, 1); g.fillCircle(8.4, 9.6, 2.1); g.fillCircle(13.6, 9.6, 2.1); g.fillRect(9.6, 15, 1, 2.5); g.fillRect(11.4, 15, 1, 2.5);
  g.generateTexture("skull", 22, 22); g.destroy();
}
function setGuns(e, n) {
  const g0 = e.guns.left[0], mk = () => ({ ...g0, cd: rand(0.5, 2.2) });
  e.guns = { left: Array.from({ length: n }, mk), right: Array.from({ length: n }, mk) };
}
function clearBoss() {
  if (bossTag) { bossTag.txt.destroy(); bossTag.skull.destroy(); }
  bossShip = bossTag = null; bossSeen = false; bossHitAt = -1e9;
}
function spawnBounty() {
  const b = activeBounty();
  if (!b) return;
  const lair = lairOf(b), boss = spawnEnemy(S, { ...lair, faction: b.faction });
  if (!boss) { console.warn(`Bounty "${b.id}": no room at the lair; it sails next time.`); return; }
  const hp = boss.maxHp * b.hpMul;
  Object.assign(boss, { boss: b.id, cls: b.cls, lair, maxHp: hp, hp, maxSpeed: boss.maxSpeed * (b.speed || 1) });
  if (b.guns) setGuns(boss, b.guns);
  applyShipArt(boss, artClass(b.cls), "boss");   // the boss livery: gold trim, big flag (js/art.js)
  makeSkullTex(S);
  bossShip = boss;
  bossTag = { skull: S.add.image(0, 0, "skull").setDepth(9),
    txt: S.add.text(0, 0, bossName(b), { fontFamily: UI_FONT, fontSize: "15px", fontStyle: "700", color: "#f6d27a", stroke: "#1b1410", strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(9) };
  // escorts sail along the ring beside the boss, so they share its level
  const along = b.ang + Math.PI / 2;
  b.escorts.forEach((spec, i) => {
    const off = (i % 2 ? 1 : -1) * 200 * (1 + (i >> 1));
    const e = spawnEnemy(S, { x: lair.x + Math.cos(along) * off, y: lair.y + Math.sin(along) * off, faction: b.faction });
    if (!e) return;
    const ehp = e.maxHp * (spec.hpMul || 1);
    Object.assign(e, { escortOf: b.id, cls: spec.cls, lair, maxHp: ehp, hp: ehp });
    if (spec.guns) setGuns(e, spec.guns);
    applyShipArt(e, artClass(spec.cls));
  });
  toast(t("huntToast", { name: bossName(b), sea: t("sea_" + seaOfRing(b.L).id) }));
  sfx("bell", { pitch: 0.75, delay: 0.8 });
}
// Above the level badge, counter-scaled like it so the name stays readable when the camera zooms out.
function placeBossTag() {
  if (!bossTag || !bossShip) return;
  const lk = labelScale(); labelText(bossTag.txt); bossTag.skull.setScale(lk);
  const w = bossTag.txt.displayWidth, x = bossShip.x - (w + 24 * lk) / 2, y = shipTop(bossShip) - 42 * lk;
  bossTag.skull.setPosition(x + 11 * lk, y); bossTag.txt.setPosition(x + 25 * lk, y);
}
function claimBounty(b, s) {
  const c = save.campaign, n = c.bounty + 1, reward = bountyReward(b), ship = shipFor(c.bounty);
  save.gold += reward;
  save.campaign = { ...c, bounty: n, rank: Math.min(n, RANK_MAX), outpost: n >= OUTPOST_BOUNTY,
    ships: SHIP_ORDER.filter(id => c.ships.includes(id) || id === ship) };
  save.stats = { ...save.stats, gold: save.stats.gold + reward, bounties: save.stats.bounties + 1 };
  persist();
  storyKey = "done_" + b.id;
  floatText(s.x, s.y - 60, t("fChest", { n: fmt(reward) }), "#f6d27a", 22);
  sfx("coin", { amount: reward, delay: 0.35 });
  if (b.final) S.time.delayedCall(2600, showVictory);   // js/victory.js
  else { toast(t("rankUp", { rank: t("rank_" + save.campaign.rank) })); sfx("buy", { big: true, delay: 1.1 }); }
  syncOutpost();
  hud(true);
  runHook("bounty", n, b);
}
onHook("sail", () => { storyKey = null; clearBoss(); spawnBounty(); });
onHook("hurt", (s, dmg, src) => { if (s === bossShip && src === player) bossHitAt = S.time.now; });
onHook("sunk", (s, killer) => {
  if (!s.boss || s !== bossShip) return;
  const b = BOUNTIES.find(x => x.id === s.boss);
  const paid = killer === player || S.time.now - bossHitAt < ASSIST_MS;
  clearBoss();
  if (paid) claimBounty(b, s); else toast(t("bossEscaped", { name: bossName(b) }));
});
onHook("frame", () => {
  if (bossShip && !bossShip.alive) clearBoss();
  placeBossTag();
  if (paused || docked) return;
  for (const e of enemies) {   // idle bosses and escorts keep to their lair
    if (!e.lair || !e.alive || e.target) continue;
    if (dist(e, e.lair) > LAIR_LEASH && (!e.wander || dist(e.wander, e.lair) > 260)) {
      e.wander = { x: e.lair.x + rand(-160, 160), y: e.lair.y + rand(-160, 160) }; e.thinkT = rand(5, 8);
    }
  }
  if (bossShip && !bossSeen && player.alive && dist(player, bossShip) < 1100) {
    bossSeen = true; toast(t("bossSighted", { name: bossName(activeBounty()) })); sfx("bell", { pitch: 0.6 });
  }
});
onHook("lang", () => { if (bossTag && bossShip) bossTag.txt.setText(bossName(BOUNTIES.find(b => b.id === bossShip.boss))); });

// ---------- The Hulk Outpost: sells cargo and repairs, on the line between the L6 and L7 rings ----------
// It docks through the normal dock() flow with kind "outpost"; within TRUCE_R no ship opens fire on the player.
const OUTPOST = polarPt(Math.PI / 8, ringEdge(7));
const TRUCE_R = 300;
const PORT_DOCK = { x: PORT.x, y: PORT.y, outpost: false }, OUTPOST_DOCK = { x: OUTPOST.x, y: OUTPOST.y, outpost: true };
const inTruce = s => save.campaign.outpost && Math.hypot(s.x - OUTPOST.x, s.y - OUTPOST.y) < TRUCE_R;
const nearestHarbor = () => save.campaign.outpost && dist(player, OUTPOST) < dist(player, PORT) ? OUTPOST_DOCK : PORT_DOCK;
let atOutpost = false, outpostObjs = [], outpostLabel = null;
// Painted like Safe Harbor (js/harbor-art.js): a buoyed dock ring in the traders' green, planked floating jetties with
// cargo and lanterns. The hulk itself and a tender are moored ships from the ship art, rocking on slow tweens.
const OUTPOST_JETTIES = [[-10, 14, -30, 92], [18, -14, 62, -86]];
function paintOutpost(c, C) {
  const rng = mulberry32(23);
  const g = c.createRadialGradient(C, C, 30, C, C, 170);
  g.addColorStop(0, "rgba(130,218,210,.5)"); g.addColorStop(1, "rgba(130,218,210,0)"); c.fillStyle = g; c.fillRect(0, 0, C * 2, C * 2);
  c.save(); c.setLineDash([3, 9]); c.beginPath(); c.arc(C, C, DOCK_R, 0, TAU); c.lineWidth = 1.5; c.strokeStyle = "rgba(246,241,227,.3)"; c.stroke(); c.restore();
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU + 0.2, x = C + Math.cos(a) * DOCK_R, y = C + Math.sin(a) * DOCK_R, on = i % 2 ? "#f4efe2" : "#4f9c4b";
    dot(c, x + 1.2, y + 1.2, 4.2, "rgba(0,20,30,.35)"); dot(c, x, y, 4, on); dot(c, x, y, 1.6, i % 2 ? "#4f9c4b" : "#f4efe2");
  }
  for (const [x0, y0, x1, y1] of OUTPOST_JETTIES) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    c.save(); c.translate(C + x0, C + y0); c.rotate(Math.atan2(y1 - y0, x1 - x0));
    c.save(); blur(c, 4, "rgba(0,0,0,.45)"); c.fillStyle = "#6b4a2a"; c.fillRect(0, -7, len, 14); c.restore();
    for (let d = 0; d < len; d += 5) { c.fillStyle = rng() < 0.5 ? "#8a6238" : "#7a5530"; c.fillRect(d, -7, 4.2, 14); }
    for (const d of [6, len - 6]) { dot(c, d, -8, 2.2, WOOD); dot(c, d, 8, 2.2, WOOD); }
    c.restore();
  }
  const crate = (x, y, w) => {
    c.save(); blur(c, 2, "rgba(0,0,0,.45)"); c.fillStyle = "#9a6a36"; c.fillRect(C + x - w / 2, C + y - w / 2, w, w); c.restore();
    c.strokeStyle = "#5a3a1c"; c.lineWidth = 1; c.strokeRect(C + x - w / 2 + 0.5, C + y - w / 2 + 0.5, w - 1, w - 1);
    line(c, C + x - w / 2, C + y - w / 2, C + x + w / 2, C + y + w / 2, 0.8, "#5a3a1c");
  };
  const barrel = (x, y) => { dot(c, C + x + 1, C + y + 1, 4.2, "rgba(0,0,0,.3)"); dot(c, C + x, C + y, 4, "#7a4f2a"); dot(c, C + x, C + y, 2.2, "#5a3a1c"); };
  crate(-22, 58, 10); crate(-31, 74, 9); barrel(-15, 72); barrel(44, -60); crate(53, -74, 10);
  for (const [, , x, y] of OUTPOST_JETTIES) { c.save(); blur(c, 10, "rgba(255,214,120,.9)"); dot(c, C + x, C + y, 3, "#ffe7a8"); c.restore(); }
}
function buildOutpost(sc) {
  const C = DOCK_R + 26;
  if (!sc.textures.exists("outpost")) bakeCanvas(sc, "outpost", C * 2, C * 2, artRes(), c => paintOutpost(c, C));
  const moored = (cls, dx, dy, rot) => { const key = shipArt(cls, "merchant", { furled: true }, sc);
    const img = sc.add.image(OUTPOST.x + dx, OUTPOST.y + dy, key).setScale(1 / artResOf(key)).setRotation(rot).setDepth(4.2);
    sc.tweens.add({ targets: img, angle: img.angle + rand(1, 1.8), duration: rand(2200, 3200), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    return img; };
  outpostLabel = labelText(sc.add.text(OUTPOST.x, OUTPOST.y + 122, t("outpostMap"), { fontFamily: UI_FONT, fontSize: "18px", fontStyle: "700", color: "#f6f1e3" })
    .setOrigin(0.5).setAlpha(0.7).setDepth(1));
  outpostObjs = [sc.add.image(OUTPOST.x, OUTPOST.y, "outpost").setScale(1 / artResOf("outpost")).setDepth(1),
    moored("fluyt", 4, 0, -0.32), moored("sloop", 16, 62, 1.82), outpostLabel];
}
// Show the outpost (and make its hulk solid) exactly when the campaign has opened it; rebuild the chart to match.
function syncOutpost() {
  if (!S) return;
  const on = save.campaign.outpost;
  islands = islands.filter(i => !i.outpost).concat(on ? [{ x: OUTPOST.x, y: OUTPOST.y, r: 48, pts: [], seed: 0, outpost: true }] : []);
  if (on && !outpostObjs.length) buildOutpost(S);
  else if (!on && outpostObjs.length) { for (const o of outpostObjs) { S.tweens.killTweensOf(o); o.destroy(); } outpostObjs = []; outpostLabel = null; }
  buildMiniBase();
}
function sendHome() {
  Object.assign(player, { x: PORT.x + 140, y: PORT.y, rot: 0, speed: 0 });
  player.spr.setPosition(player.x, player.y).setRotation(0);
}
onHook("ready", syncOutpost);
onHook("dock", (kind, hold) => {
  atOutpost = kind === "outpost";
  if (kind === "welcome") { storyKey = null; sendHome(); }   // a new or reset game always starts at home
  syncWorld(); syncOutpost();
  if (atOutpost) { sfx("bell", { pitch: 1.25 }); if (hold > 0) sfx("coin", { amount: hold, delay: 0.45 }); }
  // the Admiral sank but the epilogue was never seen (closed the game too soon): show it now
  if (save.campaign.bounty >= BOUNTY_COUNT && !save.campaign.won) setTimeout(showVictory, 400);
});
onHook("lang", () => outpostLabel?.setText(t("outpostMap")));

// ---------- New Game+: a new map, enemies +3 levels, loot x1.5; guns (and their levels) carry over ----------
function startNewGamePlus() {
  flushTime();   // js/logbook.js
  const keep = { unlocked: save.unlocked, gunLv: save.gunLv, bow: save.bow, left: save.left, right: save.right, stern: save.stern,
    sunk: save.sunk, stats: save.stats, ach: save.ach, ngPlus: save.ngPlus + 1 };
  save = fitMounts({ ...defaultSave(), ...keep });
  for (const c of crates) { c.spr.destroy(); c.label?.destroy(); }
  crates.length = 0; cargo = 0;
  persist();
  dock("welcome");
  storyKey = "ngStory"; renderPort(); hud(true);
  runHook("newGamePlus", save.ngPlus);
}
