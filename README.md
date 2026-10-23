# Privateers

一款俯視角的海盜海戰網頁遊戲，參考 *Privateers: Pirate Wars* 的玩法。用 [Phaser 3](https://phaser.io/) 製作，整個遊戲只有一個 `index.html`。

A top-down pirate naval battle browser game, inspired by *Privateers: Pirate Wars*. Built with Phaser 3 as a single `index.html`.

**▶ 線上試玩 / Play online：<https://howwmingnew.github.io/Privateers/>**

## 怎麼玩

打開上面的線上網址就能玩；也可以把專案下載下來，用瀏覽器打開 `index.html`。不需要安裝或建置。

- **移動**：在畫面上拖曳（手機和桌機都可以），或用 WASD / 方向鍵。
- **開火**：敵船靠近船首、舷側或船尾的射界時，會出現瞄準線。砲彈會沿著瞄準線直線飛行。放開手（或按空白鍵）就開火。
  - 紅線：現在開火會打中。黃線：會打空。淡白線：裝填中。
- **戰利品**：擊沉敵船後會掉落木箱，撿起來放進貨艙。貨艙有容量上限。
- **港口**：回到港口會賣掉貨物並修船，可以購買或升級火砲，以及升級船體、船帆、貨艙。
- **換船**：想要更多砲位就要買新船。初始的單桅帆船有船首、左舷、右舷各 1 門砲，大船砲位更多，巡防艦以上還有船尾砲。換船後船體、船帆、貨艙的升級會從 Lv 1 重新開始，火砲會一起搬上新船。
- **沉船**：船被擊沉時，貨物會留在沉沒的地方（地圖上的紅色 ✕）。關掉遊戲也會保留，可以回去撈。
- **AI 勢力**：海盜攻擊所有非海盜船；海軍攻擊海盜和玩家；商船只會逃跑或還擊。AI 追擊太遠會放棄。
- **語言**：繁體中文 / English，可在畫面左上角切換。

## 技術

- Phaser 3.80.1（從 cdnjs 載入）
- 所有圖形都用程式繪製，沒有外部素材
- 存檔使用瀏覽器的 localStorage
- 部署在 GitHub Pages，直接發布 `main` 分支根目錄；push 後約 1～2 分鐘自動更新
