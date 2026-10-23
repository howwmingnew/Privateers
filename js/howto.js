"use strict";
// ---------- How to play + credits (static rich text; menu.js renders [data-i18n-html] on every language change) ----------
// The swatches (<i class="sw-...">) are drawn in css/menu.css with the same colours the game uses.
Object.assign(STR.en, {
  ht_replay: "Replay the first-voyage tutorial", ht_replayed: "The tutorial starts on your next voyage.", ht_restarted: "First-voyage tutorial restarted.",
  ht_controls: `<h3>Controls</h3><dl class="ctl">
    <dt>Keyboard</dt><dd><kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> turn. <kbd>W</kbd> <kbd>S</kbd> or <kbd>↑</kbd> <kbd>↓</kbd> raise and lower the sail (stopped, slow, half, full); the ship holds that speed. <kbd>Space</kbd> fires every loaded gun that bears; <kbd>Q</kbd> / <kbd>E</kbd> fire only the larboard / starboard broadside. <kbd>M</kbd> mutes. <kbd>Esc</kbd> or <kbd>P</kbd> pauses.</dd>
    <dt>Mouse</dt><dd>Hold the right button to steer toward the cursor (the farther the cursor, the more sail) and left-click to fire. Or use the left button alone: hold to steer, let go to fire. The wheel zooms.</dd>
    <dt>Touch</dt><dd>Drag anywhere to steer with the floating stick, and let go to fire. The <b>❚❚</b> button pauses.</dd>
    <dt>Controller</dt><dd>Left stick steers. D-pad <kbd>↑</kbd> <kbd>↓</kbd> sets the sail. <kbd>A</kbd> or <kbd>RT</kbd> fires. <kbd>Start</kbd> pauses. In menus the D-pad or stick moves, <kbd>A</kbd> selects and <kbd>B</kbd> goes back.</dd></dl>`,
  ht_aim: `<h3>Aim lines</h3><p>When an enemy comes near your bow, stern or a broadside, that side shows one line per cannon. Each ball flies straight along its line, so you aim by turning the ship.</p>
    <ul class="legend"><li><i class="sw-aim hit"></i><span><b>Red</b>: loaded, and the shot will hit.</span></li>
    <li><i class="sw-aim miss"></i><span><b>Yellow</b>: loaded, but the shot will miss.</span></li>
    <li><i class="sw-aim reload"></i><span><b>Faint</b>: reloading. The line grows back as the gun reloads.</span></li></ul>`,
  ht_badges: `<h3>Level badges</h3><p>Every ship's <b>Lv</b> is how hard it fights, on the same scale as your <b>Ship Lv</b> under the map; the colour and mark compare the two. Ships close to you also show the gold they carry. A Wanted poster's <b>Recommended</b> level counts the bounty's escorts too.</p>
    <ul class="legend"><li><i class="sw-badge" style="--c:#86c46f">Lv 1</i><span>Weaker than you</span></li>
    <li><i class="sw-badge" style="--c:#e8c25a">Lv 2</i><span>About even</span></li>
    <li><i class="sw-badge" style="--c:#e88a3a">Lv 3</i><span>One level stronger</span></li>
    <li><i class="sw-badge dark" style="--c:#d9493a">Lv 4</i><span>Much stronger: keep your distance</span></li></ul>
    <p>Merchants never attack first and carry the most gold. Pirates attack everyone. The navy hunts pirates, and you.</p>`,
  ht_harbor: `<h3>The harbor</h3><p>Sail into the dashed ring <i class="sw-ring"></i> around the harbor to dock. Your hold is sold and the hull is repaired for free. Then spend your gold in the ledger:</p>
    <ul><li><b>Armory</b>: buy new cannons and upgrade the ones you own.</li><li><b>Gun deck</b>: choose which cannon sits in each gun port.</li>
    <li><b>Shipwright</b>: upgrade the hull, sails and hold.</li><li><b>New ships</b>: more guns and a sturdier hull, but hull, sails and hold start again at Lv 1.</li></ul>
    <p>The farther from the harbor you sail, the richer and deadlier the ships.</p>`,
  ht_wreck: `<h3>Wrecks</h3><p>If your ship goes down, the cargo in the hold sinks with it. The wreck stays where you sank, marked with a red <i class="sw-x"></i> on the map, even if you close the game. Sail over it to scoop the cargo back up, then bring it home to sell.</p>`,
  cr_body: `<p><b>Privateers</b> · 私掠者</p><p>Made with <b>Phaser 3</b>.</p>
    <p>All art and sound are generated in code. The game ships no image or audio files.</p>
    <p class="note">Fonts: IM Fell English SC, Barlow Semi Condensed, Noto Serif TC and Noto Sans TC, from Google Fonts under the SIL Open Font License.</p>`,
});
Object.assign(STR.zh, {
  ht_replay: "重玩首航教學", ht_replayed: "下次出航時會開始教學。", ht_restarted: "首航教學已重新開始。",
  ht_controls: `<h3>操作方式</h3><dl class="ctl">
    <dt>鍵盤</dt><dd><kbd>A</kbd> <kbd>D</kbd> 或 <kbd>←</kbd> <kbd>→</kbd> 轉向。<kbd>W</kbd> <kbd>S</kbd> 或 <kbd>↑</kbd> <kbd>↓</kbd> 升降船帆（收帆、慢速、半帆、滿帆），船會維持這個速度。<kbd>空白鍵</kbd>讓所有對準目標且已裝填的火砲開火；<kbd>Q</kbd> / <kbd>E</kbd> 只開左舷／右舷。<kbd>M</kbd> 靜音。<kbd>Esc</kbd> 或 <kbd>P</kbd> 暫停。</dd>
    <dt>滑鼠</dt><dd>按住右鍵，船會朝游標駛去（游標離船越遠，帆張得越滿），點左鍵開火。也可以只用左鍵：按住轉向，放開開火。滾輪可以縮放。</dd>
    <dt>觸控</dt><dd>在任意位置拖曳，用浮動搖桿轉向，放開就開火。按 <b>❚❚</b> 暫停。</dd>
    <dt>控制器</dt><dd>左搖桿轉向。十字鍵 <kbd>↑</kbd> <kbd>↓</kbd> 升降船帆。<kbd>A</kbd> 或 <kbd>RT</kbd> 開火。<kbd>Start</kbd> 暫停。在選單中用十字鍵或搖桿移動，<kbd>A</kbd> 確認，<kbd>B</kbd> 返回。</dd></dl>`,
  ht_aim: `<h3>瞄準線</h3><p>敵船靠近船首、船尾或舷側時，那一側的每門火砲都會顯示一條瞄準線。砲彈會沿著線直直飛出去，所以要靠轉動船身來瞄準。</p>
    <ul class="legend"><li><i class="sw-aim hit"></i><span><b>紅色</b>：已裝填，這一發會命中。</span></li>
    <li><i class="sw-aim miss"></i><span><b>黃色</b>：已裝填，但這一發會落空。</span></li>
    <li><i class="sw-aim reload"></i><span><b>淡色</b>：裝填中，線會隨著裝填進度慢慢變長。</span></li></ul>`,
  ht_badges: `<h3>等級標籤</h3><p>每艘船標示的 <b>Lv</b> 代表它的戰力，和地圖下方你的<b>船艦 Lv</b> 用同一套標準；顏色和符號就是兩者比較的結果。靠近你的船還會顯示船上的金幣。懸賞海報上的<b>建議等級</b>則把護衛艦也算進去。</p>
    <ul class="legend"><li><i class="sw-badge" style="--c:#86c46f">Lv 1</i><span>比你弱</span></li>
    <li><i class="sw-badge" style="--c:#e8c25a">Lv 2</i><span>旗鼓相當</span></li>
    <li><i class="sw-badge" style="--c:#e88a3a">Lv 3</i><span>比你強一級</span></li>
    <li><i class="sw-badge dark" style="--c:#d9493a">Lv 4</i><span>強很多，最好保持距離</span></li></ul>
    <p>商船從不主動攻擊，身上的金幣也最多。海盜見誰打誰。海軍會追捕海盜，也會追捕你。</p>`,
  ht_harbor: `<h3>港口</h3><p>駛進港口周圍的虛線圈 <i class="sw-ring"></i> 就會靠港。貨艙裡的貨物會自動賣掉，船體也會免費修好。接著在帳簿裡花掉金幣：</p>
    <ul><li><b>軍械庫</b>：購買新火砲，或升級已有的火砲。</li><li><b>火砲配置</b>：決定每個砲位要裝哪一門火砲。</li>
    <li><b>造船廠</b>：升級船體、船帆和貨艙。</li><li><b>新船</b>：火砲更多、船體更堅固，但船體、船帆和貨艙會從 Lv 1 重新開始。</li></ul>
    <p>離港口越遠，敵船越富有，也越危險。</p>`,
  ht_wreck: `<h3>殘骸</h3><p>船沉的時候，貨艙裡的貨物也會跟著沉下去。殘骸會留在沉沒的地方，地圖上以紅色 <i class="sw-x"></i> 標示，關掉遊戲也不會消失。駛過殘骸就能把貨物撈回來，再帶回港口賣掉。</p>`,
  cr_body: `<p><b>私掠者</b> · Privateers</p><p>使用 <b>Phaser 3</b> 製作。</p>
    <p>所有美術和音效都由程式即時生成，遊戲裡沒有任何圖片或音訊檔。</p>
    <p class="note">字型：IM Fell English SC、Barlow Semi Condensed、Noto Serif TC、Noto Sans TC，來自 Google Fonts，採用 SIL 開放字型授權。</p>`,
});
