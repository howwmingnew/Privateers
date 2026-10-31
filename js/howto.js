"use strict";
// ---------- How to play + credits (static rich text; menu.js renders [data-i18n-html] on every language change) ----------
// The swatches (<i class="sw-...">) are drawn in css/menu.css with the same colours the game uses.
Object.assign(STR.en, {
  ht_replay: "Replay the first-voyage tutorial", ht_replayed: "The tutorial starts on your next voyage.", ht_restarted: "First-voyage tutorial restarted.",
  ht_controls: `<h3>Controls</h3><dl class="ctl">
    <dt>Keyboard</dt><dd><kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> turn. <kbd>W</kbd> <kbd>S</kbd> or <kbd>↑</kbd> <kbd>↓</kbd> raise and lower the sail (stopped, slow, half, full); the ship holds that speed. <kbd>Space</kbd> fires every loaded gun that bears; <kbd>Q</kbd> / <kbd>E</kbd> fire only the larboard / starboard broadside. <kbd>F</kbd> uses your captain's ability. <kbd>M</kbd> mutes. <kbd>Esc</kbd> or <kbd>P</kbd> pauses.</dd>
    <dt>Mouse</dt><dd>Hold the right button to steer toward the cursor (the farther the cursor, the more sail) and left-click to fire. Or use the left button alone: hold to steer, let go to fire. The wheel zooms.</dd>
    <dt>Touch</dt><dd>Drag anywhere to steer with the floating stick, and let go to fire. The <b>−</b> / <b>+</b> buttons lower or raise the sail: at <b>Stopped</b> the stick still turns the ship, so you can aim without sailing past. The round button above them is your captain's ability. The <b>❚❚</b> button pauses.</dd>
    <dt>Controller</dt><dd>Left stick steers. D-pad <kbd>↑</kbd> <kbd>↓</kbd> sets the sail. <kbd>A</kbd> or <kbd>RT</kbd> fires. <kbd>Y</kbd> uses the ability. <kbd>Start</kbd> pauses. In menus the D-pad or stick moves, <kbd>A</kbd> selects and <kbd>B</kbd> goes back.</dd><dt>Photo mode</dt><dd><kbd>H</kbd> (or Photo mode in the pause menu) freezes the sea and hides the interface. Drag to move the camera, wheel or pinch to zoom, and save the shot as a postcard. <kbd>H</kbd> or <kbd>Esc</kbd> returns to the game exactly as it was.</dd>
  </dl>`,
  ht_aim: `<h3>Aim lines</h3><p>When an enemy comes near your bow, stern or a broadside, that side shows one line per cannon. Each ball flies straight along its line, so you aim by turning the ship.</p>
    <ul class="legend"><li><i class="sw-aim hit"></i><span><b>Red</b>: loaded, and the shot will hit.</span></li>
    <li><i class="sw-aim miss"></i><span><b>Yellow</b>: loaded, but the shot will miss.</span></li>
    <li><i class="sw-aim reload"></i><span><b>Faint</b>: reloading. The line grows back as the gun reloads.</span></li></ul>`,
  ht_combat: `<h3>Fighting tips</h3><ul>
    <li><b>Captain's ability</b> (<kbd>F</kbd>, pad <kbd>Y</kbd>, or the round button at the bottom right): fast ships lay a <b>smoke screen</b> that throws off enemy volleys for a few seconds, heavy ships load a <b>double shot</b> for their next broadside, and the sloop drops a <b>powder keg</b> astern for whoever chases it. The button shows the seconds until it is ready again. It helps a well-sailed fight; it does not replace turning out of a red fan.</li>
    <li><b>Auto-fire</b>: hold <kbd>Space</kbd> and every loaded gun whose line is red keeps firing as it reloads. A quick tap still fires the whole side. You can turn it off in Settings.</li>
    <li><b>Ramming hurts</b>: running into an island or another ship at speed damages your hull (a full-speed head-on costs about 15 to 20% of it). Lower the sail near rocks and enemies.</li>
    <li><b>Boarding</b>: a merchant that strikes her colors (a white flag, once her hull is under about a third) can be taken. Sail up slowly alongside her and stay close for about 2 seconds until the ring fills: you get part of her gold, and sometimes a gun. Bounty captains, escorts and fireships never surrender.</li>
    <li><b>Practice waters</b>: before your first bounty, the sea near the harbor is for practice: the first few rings hold only small Lv 1 ships that never flee and never fire first. Farther out (to about two screens) ships are Lv 2-3 and fight for real.</li></ul>`,
  ht_badges: `<h3>Level badges</h3><p>Every ship's <b>Lv</b> is how hard it fights, on the same scale as your <b>Ship Lv</b> under the map; the color and mark compare the two. Ships close to you also show the gold they carry. A Wanted poster's <b>Ready at</b> level counts the bounty's escorts too.</p>
    <ul class="legend"><li><i class="sw-badge" style="--c:#86c46f">Lv 1</i><span>Weaker than you</span></li>
    <li><i class="sw-badge" style="--c:#e8c25a">Lv 2</i><span>About even</span></li>
    <li><i class="sw-badge" style="--c:#e88a3a">Lv 3</i><span>One level stronger</span></li>
    <li><i class="sw-badge dark" style="--c:#d9493a">Lv 4</i><span>Much stronger: keep your distance</span></li></ul>
    <p><b>The color says how strong a ship is next to you, not whose it is.</b> The icon in front of the level says which side she sails for: <b>⚓ Navy</b>, <b>☠ Pirate</b>, <b>$ Merchant</b>. A green Navy ship is still the Navy: sink one and you are Wanted.</p>
    <p>Merchants never attack first and carry the most gold. Pirates attack everyone. The navy hunts pirates. It leaves you alone while you are under 2 stars of Wanted, unless you shoot, ram or board it first; from 2 stars it hunts you too.</p>`,
  ht_terms: `<h3>Words you will meet</h3><ul>
    <li><b>Ship Lv</b> (under the map): how strong your ship is. It rises with stronger guns (upgrade or swap them), a better hull, sails or gear, or a bigger ship. A Wanted poster's <b>Ready at Ship Lv</b> is the level to be before you sail.</li>
    <li><b>Lv badge on an enemy</b>: that ship's strength, on the same scale as your Ship Lv.</li>
    <li><b>Gun Lv</b>: how many times you upgraded that gun with gold. Each level adds damage.</li>
    <li><b>Grade</b> (gear): the hull tier needed to wear it. A higher grade means stronger effects.</li>
    <li><b>Fittings</b>: material from breaking down spare gear or guns. Re-rolling an affix spends it.</li>
    <li><b>Affix</b>: a bonus line on a piece of gear, like "+8% speed". Rarer gear (Common, Magic, Rare, Epic, Legendary) has more of them. Re-rolling picks a new value.</li>
    <li><b>Break down</b>: scrap a spare gear piece or gun into fittings.</li>
    <li><b>Lock</b>: keeps an item from being broken down by mistake.</li>
    <li><b>Broadside</b>: all the guns on one side of the ship (<b>larboard</b> = left, <b>starboard</b> = right). A <b>volley</b> is a broadside firing at once; the red glow warns you of an enemy's.</li>
    <li><b>Wanted</b> (stars at the top): how much the Navy wants you. More stars mean richer warship bounties and stronger hunters. It cools off when you dock.</li>
    <li><b>Plunder streak</b>: every ship you sink in a row raises what the hold sells for. Losing your ship ends it.</li>
    <li><b>Wind dial</b>: the arrow points where the wind blows to. The ±% is how much it speeds you up or slows you down on your present heading.</li></ul>`,
  ht_chart: `<h3>The chart</h3><p>The chart in the corner shows the whole sea. Deeper, darker water is more dangerous, and the numbers are the ship levels you meet there. A ship's <b>shape</b> says whether you can beat it; its <b>fill and inner mark</b> say who it is, so you never need color alone.</p>
    <ul class="legend"><li><canvas class="sw-mark" data-mark="threat" aria-hidden="true"></canvas><span>Shape = strength: weaker, even, stronger, much stronger than you</span></li>
    <li><canvas class="sw-mark" data-mark="pirate" aria-hidden="true"></canvas><span><b>Pirate</b>: plain shape in its strength color</span></li>
    <li><canvas class="sw-mark" data-mark="navy" aria-hidden="true"></canvas><span><b>Navy</b>: solid blue, a bar across</span></li>
    <li><canvas class="sw-mark" data-mark="trade" aria-hidden="true"></canvas><span><b>Merchant</b>: gold, a dot inside</span></li>
    <li><canvas class="sw-mark" data-mark="ally" aria-hidden="true"></canvas><span><b>Your escort</b>: mint, a cream rim and an arrowhead</span></li>
    <li><canvas class="sw-mark" data-mark="fire" aria-hidden="true"></canvas><span><b>Fireship</b>: flickering orange, an upright tick</span></li>
    <li><canvas class="sw-mark" data-mark="boss" aria-hidden="true"></canvas><span><b>Bounty target</b>: a skull</span></li>
    <li><canvas class="sw-mark" data-mark="harbor" aria-hidden="true"></canvas><span><b>Harbor</b>: an anchor</span></li>
    <li><canvas class="sw-mark" data-mark="outpost" aria-hidden="true"></canvas><span><b>Hulk Outpost</b>: a teal cross</span></li>
    <li><canvas class="sw-mark" data-mark="supply" aria-hidden="true"></canvas><span><b>Supply Station</b>: a green cask. Mends the hull for a fee</span></li>
    <li><canvas class="sw-mark" data-mark="tradeport" aria-hidden="true"></canvas><span><b>Trade Port</b>: a gold diamond. Buys your hold</span></li>
    <li><canvas class="sw-mark" data-mark="fort" aria-hidden="true"></canvas><span><b>Fort</b>: a stone keep</span></li>
    <li><canvas class="sw-mark" data-mark="chest" aria-hidden="true"></canvas><span><b>Treasure</b>: a small chest</span></li>
    <li><canvas class="sw-mark" data-mark="wreck" aria-hidden="true"></canvas><span><b>Your wreck</b>: a red X</span></li>
    <li><canvas class="sw-mark" data-mark="land" aria-hidden="true"></canvas><span><b>Land</b>: an island</span></li></ul>
    <p>Where marks pile up, the nearest stronger ships and the bounty stay on top, and ships in one spot merge into one mark with a count.</p>`,
  ht_harbor: `<h3>The harbor</h3><p>Sail into the dashed ring <i class="sw-ring"></i> around the harbor to dock. Your hold is sold and the hull is repaired for free. Then spend your gold in the ledger:</p>
    <ul><li><b>Ship tabs</b>: your flagship, then (once the first bounty is claimed) up to four escorts, each with its own gun deck. An escort carries its own guns and sails only with at least one.</li><li><b>Gun port</b>: tap a port to upgrade its gun, put another gun there (from the store or another ship), unload it, or buy a new cannon for it; Undo takes back the last move. Each cannon has its own level.</li>
    <li><b>Hull</b>: tap the hull to upgrade that ship's hull, sails and hold, or to change ship. Every ship you buy stays in the yard with its own upgrades, so you can switch back for free, or buy the same model again. Your cannons move aboard.</li></ul>
    <p>The farther from the harbor you sail, the richer and deadlier the ships.</p>`,
  ht_wreck: `<h3>Wrecks</h3><p>If your ship goes down, the cargo in the hold sinks with it. The wreck stays where you sank, marked with a red <i class="sw-x"></i> on the map, even if you close the game. Sail over it to scoop the cargo back up, then bring it home to sell.</p>`,
  cr_body: `<p><b>Privateers</b> · 私掠者</p><p>Made with <b>Phaser 3</b>.</p>
    <p>All art and sound are generated in code. The game itself loads no image or audio files.</p>
    <p class="note">Fonts: IM Fell English SC, Barlow Semi Condensed, Noto Serif TC and Noto Sans TC, from Google Fonts under the SIL Open Font License.</p>`,
});
Object.assign(STR.zh, {
  ht_replay: "重玩首航教學", ht_replayed: "下次出航時會開始教學。", ht_restarted: "首航教學已重新開始。",
  ht_controls: `<h3>操作方式</h3><dl class="ctl">
    <dt>鍵盤</dt><dd><kbd>A</kbd> <kbd>D</kbd> 或 <kbd>←</kbd> <kbd>→</kbd> 轉向。<kbd>W</kbd> <kbd>S</kbd> 或 <kbd>↑</kbd> <kbd>↓</kbd> 升降船帆（收帆、慢速、半帆、滿帆），船會維持這個速度。<kbd>空白鍵</kbd>讓所有對準目標且已裝填的火砲開火；<kbd>Q</kbd> / <kbd>E</kbd> 只開左舷／右舷。<kbd>F</kbd> 使用船長技能。<kbd>M</kbd> 靜音。<kbd>Esc</kbd> 或 <kbd>P</kbd> 暫停。</dd>
    <dt>滑鼠</dt><dd>按住右鍵，船會朝游標駛去（游標離船越遠，帆張得越滿，按住時 W／S 暫時無效，放開後帆速維持原樣、W／S 恢復），點左鍵開火。也可以只用左鍵：按住轉向，放開開火。滾輪可以縮放。</dd>
    <dt>觸控</dt><dd>在任意位置拖曳，用浮動搖桿轉向，放開就開火。<b>−</b>／<b>+</b> 鈕降帆或升帆：收帆時搖桿仍能轉船，可以停著瞄準不衝過頭。上方的圓鈕是船長技能。按 <b>❚❚</b> 暫停。</dd>
    <dt>控制器</dt><dd>左搖桿轉向。十字鍵 <kbd>↑</kbd> <kbd>↓</kbd> 升降船帆。<kbd>A</kbd> 或 <kbd>RT</kbd> 開火。<kbd>Y</kbd> 使用技能。<kbd>Start</kbd> 暫停。在選單中用十字鍵或搖桿移動，<kbd>A</kbd> 確認，<kbd>B</kbd> 返回。</dd><dt>拍照模式</dt><dd>按 <kbd>H</kbd>（或在暫停選單選「拍照模式」）會凍結海面並隱藏介面。拖曳移動鏡頭、滾輪或兩指縮放，再把畫面存成明信片。按 <kbd>H</kbd> 或 <kbd>Esc</kbd> 回到遊戲，一切都和離開時一樣。</dd>
  </dl>`,
  ht_aim: `<h3>瞄準線</h3><p>敵船靠近船首、船尾或舷側時，那一側的每門火砲都會顯示一條瞄準線。砲彈會沿著線直直飛出去，所以要靠轉動船身來瞄準。</p>
    <ul class="legend"><li><i class="sw-aim hit"></i><span><b>紅色</b>：已裝填，這一發會命中。</span></li>
    <li><i class="sw-aim miss"></i><span><b>黃色</b>：已裝填，但這一發會落空。</span></li>
    <li><i class="sw-aim reload"></i><span><b>淡色</b>：裝填中，線會隨著裝填進度慢慢變長。</span></li></ul>`,
  ht_combat: `<h3>戰鬥小技巧</h3><ul>
    <li><b>船長技能</b>（<kbd>F</kbd>、手把 <kbd>Y</kbd>，或右下角的圓鈕）：快速線的船放<b>煙幕</b>，幾秒內敵艦齊射會大幅散開；重砲線的船裝填<b>雙發齊射</b>，下一輪舷側傷害加倍；單桅帆船從船尾丟下<b>火藥桶</b>，炸追在後面的船。圓鈕上的數字是再次可用前的秒數。技能能幫你打得更好，但看到紅色扇形還是要轉向閃開。</li>
    <li><b>自動開火</b>：按住<kbd>空白鍵</kbd>，每門已裝填且瞄準線是紅色的砲，裝填好就會自動開火。快速點一下還是整排齊射。可以在設定裡關掉。</li>
    <li><b>衝撞會受傷</b>：帶著速度撞上島或別的船，船體會受損（全速正面撞上大約損失 15% 到 20% 船體）。靠近礁石和敵船時先降帆減速。</li>
    <li><b>登船</b>：商船被打到船體剩約三分之一以下，會升白旗降旗投降，這時可以登船。放慢船速、貼緊她的船舷，停留約 2 秒、等圓環轉滿，就能拿到她一部分金幣，有時還會奪得一門砲。懸賞船長、他的護衛和火船不會投降。</li>
    <li><b>練習海域</b>：領第 1 張懸賞之前，港口附近是練習海域：最內側幾環只有不會逃、不會先開火的 Lv1 小船；再往外（約兩個螢幕內）是 Lv2～3 的船，會逃也會認真還擊。</li></ul>`,
  ht_badges: `<h3>等級標籤</h3><p>每艘船標示的 <b>Lv</b> 代表它的戰力，和地圖下方你的<b>船艦 Lv</b> 用同一套標準；顏色和符號就是兩者比較的結果。靠近你的船還會顯示船上的金幣。懸賞海報上的<b>目標等級</b>則把護衛艦也算進去。</p>
    <ul class="legend"><li><i class="sw-badge" style="--c:#86c46f">Lv 1</i><span>比你弱</span></li>
    <li><i class="sw-badge" style="--c:#e8c25a">Lv 2</i><span>旗鼓相當</span></li>
    <li><i class="sw-badge" style="--c:#e88a3a">Lv 3</i><span>比你強一級</span></li>
    <li><i class="sw-badge dark" style="--c:#d9493a">Lv 4</i><span>強很多，最好保持距離</span></li></ul>
    <p><b>標籤顏色＝這艘船比你強弱，不代表陣營。</b>等級前面的圖示才是陣營：<b>⚓ 海軍</b>、<b>☠ 海盜</b>、<b>$ 商船</b>。綠色的海軍仍是海軍，打沉牠會被通緝。</p>
    <p>商船從不主動攻擊，身上的金幣也最多。海盜見誰打誰。海軍會追捕海盜；你的通緝低於 2 星時，除非你先開火、衝撞或登船，否則海軍不會主動攻擊你，從 2 星起才會連你一起追捕。</p>`,
  ht_terms: `<h3>會遇到的詞</h3><ul>
    <li><b>船艦 Lv</b>（地圖下方）：你這艘船有多強。換更強的砲（升級或對調）、升級船體、船帆、裝備，或換大一點的船都會提高。懸賞海報上的<b>船艦 Lv 即可迎戰</b>，就是出航前最好達到的等級。</li>
    <li><b>敵船上的 Lv 標籤</b>：那艘船的戰力，和你的船艦 Lv 用同一套標準。</li>
    <li><b>砲 Lv</b>：這門砲花金幣升了幾次，每升一級傷害更高。</li>
    <li><b>品階</b>（裝備）：穿這件裝備需要的船級，品階越高效果越強。</li>
    <li><b>零件</b>（英文 Fittings）：拆解用不到的備用裝備或火砲得到的材料，重洗詞綴時會用掉。</li>
    <li><b>詞綴</b>（英文 affix）：裝備上的加成，例如「航速 +8%」。越稀有的裝備（普通、魔法、稀有、史詩、傳說）詞綴越多；重洗會換一個新數值。</li>
    <li><b>拆解</b>（Break down）：把用不到的備用裝備或火砲拆成零件。</li>
    <li><b>鎖定</b>：防止一件東西被誤拆解。</li>
    <li><b>舷</b>：船的左側或右側（<b>左舷</b> larboard、<b>右舷</b> starboard），一舷的所有砲合稱「一舷砲」。<b>齊射</b>是一舷的砲同時開火；紅光就是在警告敵艦要齊射。</li>
    <li><b>通緝</b>（上方的星星）：海軍有多想抓你。星越多，戰艦賞金越高，追捕的敵人也越強；回港靠岸就會降溫。</li>
    <li><b>連續劫掠</b>：連續擊沉的船越多，貨艙賣出的價錢就越高；船沉了就中斷。</li>
    <li><b>風向盤</b>：箭頭指向風吹去的方向；±% 是風讓你目前航向加速或減速的幅度。</li></ul>`,
  ht_chart: `<h3>海圖</h3><p>右上角的海圖顯示整片海域。水越深、越暗就越危險，數字是那一帶會遇到的船艦等級。船的<b>形狀</b>告訴你打不打得過；<b>填色和形狀裡的小記號</b>告訴你它是誰，不必只靠顏色分辨。</p>
    <ul class="legend"><li><canvas class="sw-mark" data-mark="threat" aria-hidden="true"></canvas><span>形狀＝強弱：比你弱、差不多、較強、強很多</span></li>
    <li><canvas class="sw-mark" data-mark="pirate" aria-hidden="true"></canvas><span><b>海盜</b>：單純的形狀，顏色表示強弱</span></li>
    <li><canvas class="sw-mark" data-mark="navy" aria-hidden="true"></canvas><span><b>海軍</b>：實心藍色，中間一條橫線</span></li>
    <li><canvas class="sw-mark" data-mark="trade" aria-hidden="true"></canvas><span><b>商船</b>：金色，中間一個小點</span></li>
    <li><canvas class="sw-mark" data-mark="ally" aria-hidden="true"></canvas><span><b>你的隨從</b>：薄荷綠，奶白邊和一個箭頭</span></li>
    <li><canvas class="sw-mark" data-mark="fire" aria-hidden="true"></canvas><span><b>火船</b>：閃爍的橘色，中間一條直線</span></li>
    <li><canvas class="sw-mark" data-mark="boss" aria-hidden="true"></canvas><span><b>懸賞目標</b>：骷髏頭</span></li>
    <li><canvas class="sw-mark" data-mark="harbor" aria-hidden="true"></canvas><span><b>港口</b>：船錨</span></li>
    <li><canvas class="sw-mark" data-mark="outpost" aria-hidden="true"></canvas><span><b>廢船前哨站</b>：青綠色十字</span></li>
    <li><canvas class="sw-mark" data-mark="supply" aria-hidden="true"></canvas><span><b>補給站</b>：綠色木桶。收費修船</span></li>
    <li><canvas class="sw-mark" data-mark="tradeport" aria-hidden="true"></canvas><span><b>交易港</b>：金色菱形。收購貨艙</span></li>
    <li><canvas class="sw-mark" data-mark="fort" aria-hidden="true"></canvas><span><b>砲台</b>：石造堡壘</span></li>
    <li><canvas class="sw-mark" data-mark="chest" aria-hidden="true"></canvas><span><b>寶藏</b>：小箱子</span></li>
    <li><canvas class="sw-mark" data-mark="wreck" aria-hidden="true"></canvas><span><b>你的沉船</b>：紅色叉號</span></li>
    <li><canvas class="sw-mark" data-mark="land" aria-hidden="true"></canvas><span><b>陸地</b>：島嶼</span></li></ul>
    <p>標記擠在一起時，最近的較強船艦和懸賞目標會顯示在最上面；同一處的船會合併成一個標記並標上數量。</p>`,
  ht_harbor: `<h3>港口</h3><p>駛進港口周圍的虛線圈 <i class="sw-ring"></i> 就會靠港。貨艙裡的貨物會自動賣掉，船體也會免費修好。接著在帳簿裡花掉金幣：</p>
    <ul><li><b>船隻頁籤</b>：你的旗艦，領到第一張懸賞後還有最多四艘隨從，每艘有自己的火砲配置。隨從帶自己的砲，船上至少有一門砲才會出戰。</li><li><b>砲口</b>：點砲口可以升級那門砲、從庫存或別艘船換一門砲過來、卸下，或買一門新砲裝上；「復原」可以收回上一步。每門砲有自己的等級。</li>
    <li><b>船身</b>：點船身可以升級那艘船的船體、船帆和貨艙，或換船。買過的每艘船都留在船塢，各自保留升級，可以隨時免費換回來，也能再買一艘相同型號。火砲會一起搬上船。</li></ul>
    <p>離港口越遠，敵船越富有，也越危險。</p>`,
  ht_wreck: `<h3>殘骸</h3><p>船沉的時候，貨艙裡的貨物也會跟著沉下去。殘骸會留在沉沒的地方，地圖上以紅色 <i class="sw-x"></i> 標示，關掉遊戲也不會消失。駛過殘骸就能把貨物撈回來，再帶回港口賣掉。</p>`,
  cr_body: `<p><b>私掠者</b> · Privateers</p><p>使用 <b>Phaser 3</b> 製作。</p>
    <p>所有美術和音效都由程式即時生成，遊戲本身不載入任何圖片或音訊檔。</p>
    <p class="note">字型：IM Fell English SC、Barlow Semi Condensed、Noto Serif TC、Noto Sans TC，來自 Google Fonts，採用 SIL 開放字型授權。</p>`,
});
