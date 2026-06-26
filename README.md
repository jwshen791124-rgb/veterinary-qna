# 獸醫問卷練習

手機優化的獸醫題庫練習網站，支援七大分類練習、模擬測驗（100 題）、錯題記錄與標記複習。

## 線上使用

部署完成後，網址為：

`https://<你的 GitHub 帳號>.github.io/<repo 名稱>/`

## 功能

- **練習**：七大分類題庫
- **錯題**：依「日期 · 練習」與「日期 · 測驗」分開記錄
- **標記**：標記題目後複習
- **測驗**：依題庫比例隨機 100 題，滿分 100 分
- **受試者登入**：輸入代號，紀錄與錯題綁定個人（存在瀏覽器本地）

## 本地開發

```bash
# 更新題庫分類（修改 Question.json 後執行）
npm run build

# 啟動本地伺服器
npm start
# 或雙擊 start.command（Mac）
```

瀏覽器開啟 http://localhost:3000

> 請勿直接雙擊 `index.html`，需透過本地伺服器或 GitHub Pages 開啟。

## 部署到 GitHub Pages

1. 在 GitHub 建立新 repository（例如 `veterinary-qna`）
2. 推送此專案到 `main` 分支
3. 到 repo **Settings → Pages → Build and deployment**
4. Source 選 **GitHub Actions**
5. 推送後會自動執行 `Deploy GitHub Pages` workflow

## 更新題庫

1. 編輯 `Question.json`
2. 執行 `npm run build`
3. commit 並 push 到 `main`

GitHub Actions 也會在每次 push 時自動重新建置題庫。
