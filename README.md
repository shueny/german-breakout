# RETRO DEUTSCH A1 BREAKOUT

復古風德語 A1 單字打磚塊，Vue 3 + Vite + TypeScript。

## 開發

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 輸出到 dist/
npm run preview  # 預覽 build 結果
```

## 結構

- `public/vocab.json`：單字庫（de / zh / gender / category），分類為使用情境；`scripts/recategorize.py` 是分類對照表
- `src/game/engine.ts`：遊戲引擎（磚塊、球、球拍、懸賞、補磚、碰撞、繪圖），不依賴 Vue
- `src/game/constants.ts`：尺寸、分數、球速等參數
- `src/game/audio.ts`：8-bit 音效與德語發音
- `src/composables/useGame.ts`：把引擎接到 Vue（載字庫、鍵盤滑鼠、HUD 狀態）
- `src/components/`：Hud、HitBar、GameCanvas、Controls
- `legacy/`：改版前的單檔版本，僅供參考

## 規則

- 懸賞單字只會從每欄最下方（亮框）的磚塊中挑選
- 命中懸賞 +30，該磚塊消失並補上該主題尚未出現過的單字
- 連續命中有 COMBO：每多一連擊 +20 分（最多疊 5 級，單次 110 分），特效與德文鼓勵語隨連擊增強；打錯或漏接就中斷
- 球每次碰到磚塊都會唸出該單字
- 打錯（非懸賞）的磚塊只反彈、不消失、不計分；畫面停頓一秒並震動，中央顯示該字與字義
- 沒有生命與 Game Over：漏接只是連擊歸零、重新發球
- 彈道可預測：球拍分 5 區固定角度（-50°/-25°/0°/25°/50°）、發球直上或按住左右鍵斜 25°、沒有隨機；發球前有預測軌跡與目標框，球下落時有落點標記
- 新手模式：接到球會黏住、移好位置再按空白鍵發射；球拍加寬、靠近球拍時慢動作、漏接自動降速、命中慢慢恢復
- 單字全部用完且清空才 STAGE CLEAR
