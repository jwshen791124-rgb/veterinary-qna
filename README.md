# 獸醫問卷練習

手機優化的獸醫題庫練習網站，支援七大分類練習、模擬測驗（100 題）、錯題記錄與標記複習。

## 線上使用

https://jwshen791124-rgb.github.io/veterinary-qna/

## 功能

- **練習**：七大分類題庫
- **錯題**：依「日期 · 練習」與「日期 · 測驗」分開記錄
- **標記**：標記題目後複習
- **測驗**：依題庫比例隨機 100 題，滿分 100 分
- **受試者登入**：輸入代號，紀錄與錯題綁定個人（存在瀏覽器本地）

## 本地開發

```bash
npm run build
npm start
```

瀏覽器開啟 http://localhost:3000

## 更新題庫

```bash
npm run build
git add .
git commit -m "更新題庫"
git push
```

## 像 App 一樣使用（免 Render）

用手機瀏覽器開啟網站後：

- **iPhone（Safari）**：分享 → **加入主畫面**
- **Android（Chrome）**：選單 → **安裝應用程式** 或 **加入主畫面**

會出現自訂圖示，全螢幕開啟，題庫載入後可離線練習。

## GitHub Pages 設定

若網站尚未上線，到 repo **Settings → Pages**：

- Source：**Deploy from a branch**
- Branch：**main** / **/ (root)**
