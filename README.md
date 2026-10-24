# Privateers 私掠者

一款俯視角的海盜海戰遊戲。轉動船身讓瞄準線對準敵船，打一輪舷側齊射，撿起戰利品帶回港口賣掉，再換更大的船、更好的砲，往更深、更危險的海域推進。拿下五張私掠許可狀上的懸賞，最後在大漩渦擊沉海軍上將的君權號。

A top-down pirate naval battle game. Turn your ship to lay the aim lines on an enemy, fire a rolling broadside, scoop up the plunder and sell it in port, then buy bigger ships and better guns and push into deeper, deadlier seas. Clear the five Letters of Marque and sink the Admiral's HMS *Sovereign* in the Maelstrom.

用 [Phaser 3](https://phaser.io/) 製作。不需要安裝或建置，所有圖形都用程式繪製，所有音效和音樂都用 Web Audio 即時合成，沒有任何外部素材。

**▶ 線上試玩 / Play online：<https://howwmingnew.github.io/Privateers/>**

也可以把專案下載下來，直接用瀏覽器打開 `index.html`。

## 遊戲內容

- **戰役**：五張懸賞，各有一位有名有姓的船長和護衛艦隊，打完會升階級、解鎖新船，最後一張觸發結局。通關後可以繼續自由航行，或開始新遊戲+（敵人更強、戰利品更多、保留火砲）。
- **四片海域**：淺灘、暗礁海峽、海軍航道、大漩渦，敵人等級 1–10，離港口越遠越富有也越危險。外海有一座解鎖後可以賣貨、修船的前哨站。
- **船與火砲**：五種可購買的船（單桅帆船到戰列艦），有船首、舷側和船尾砲位；多種火砲可以購買、升級、自由配置。換船時船體、船帆、貨艙的升級從 Lv 1 重新開始。
- **勢力**：海盜攻擊所有人，海軍追捕海盜和你，商船逃跑。AI 之間也會互打，殘骸裡的戰利品誰都能撿。
- **殘骸**：你的船沉了，貨物會留在沉沒處（地圖上的紅色 ✕），關掉遊戲也會保留，可以回去撈。
- **其他**：首航互動教學、航海日誌與統計、20 個成就、標題畫面、暫停選單、設定（音量、語言、畫面震動、文字大小、全螢幕）、繁體中文 / English。

## 操作

| 裝置 | 操作 |
|---|---|
| 鍵盤 | `A` `D` / `←` `→` 轉向；`W` `S` / `↑` `↓` 升降船帆，船會維持速度；`空白鍵` 開火；`Esc` / `P` 暫停；`M` 靜音 |
| 滑鼠 | 按住左鍵往游標方向航行（離船越遠帆越滿），放開或快速點一下開火；滾輪縮放 |
| 觸控 | 任意位置拖曳出浮動搖桿轉向，放開開火；`❚❚` 暫停 |
| 控制器 | 左搖桿轉向，十字鍵升降船帆，`A` / `RT` 開火，`Start` 暫停，選單中十字鍵移動、`A` 確認、`B` 返回 |

瞄準線顏色：紅色＝現在開火會打中，黃色＝會打空，淡白色＝裝填中。敵船標籤的顏色和符號（▼ ● ▲ ▲▲）表示它和你的船艦等級相比有多危險。

## 更新路線圖 / Roadmap

接下來要做的新功能分成幾個階段，一次聚焦一個階段。下面兩張圖會在 GitHub issue 變動時自動重畫；遊戲標題選單的「更新路線圖」可以看到即時版本，也能切換各階段。

What's coming next, one phase at a time. These images redraw themselves whenever an issue changes; the live, clickable version is under **Roadmap** on the title menu.

**▶ [查看更新路線圖 / Open the roadmap](https://howwmingnew.github.io/Privateers/roadmap/)**

![更新路線圖總覽：各階段進度](roadmap/roadmap-overview.svg)

![目前階段的功能](roadmap/roadmap-current.svg)

## 開發

```bash
npm install          # 只裝測試用的 Playwright（使用系統安裝的 Chrome，不另外下載瀏覽器）
npm run serve        # 在 http://127.0.0.1:8765 提供遊戲
npm test             # 單元測試 + 冒煙測試
npm run test:all     # 全部測試（外殼、戰役、修補、平台、音效、命中判定）
```

- Phaser 3.80.1 從 cdnjs 載入；程式是 `js/` 下的一般 `<script>`（不是 ES module），所以 `file://` 也能直接開。
- 存檔在瀏覽器的 localStorage（`privateers-save-v2`，舊版 v1 存檔會自動轉換）；設定另存在 `privateers-settings`。
- `tools/sound-test.html` 可以試聽所有音效和音樂，`tools/art-test.html` 可以檢視所有船型與塗裝。
- 更新路線圖：`roadmap/index.html` 讀取標記為 `enhancement` 的 GitHub issue。每個要上圖的 issue 開頭有一行隱藏註解 `<!-- roadmap: phase=3; en=English title; deps=10 -->`（階段、英文標題、前置 issue）；加上 `in progress` 標籤會顯示為「進行中」。`.github/workflows/roadmap.yml` 在 issue 變動時執行 `node tools/roadmap-build.mjs`，重畫 README 的圖和離線快照。
- 部署在 GitHub Pages，直接發布 `main` 分支根目錄；push 後約 1～2 分鐘自動更新。
