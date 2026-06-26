#!/bin/bash
cd "$(dirname "$0")"

if [ ! -f "data/questions.json" ]; then
  echo "正在建置題庫..."
  node scripts/build-data.mjs || { echo "建置失敗，請確認已安裝 Node.js"; read -p "按 Enter 關閉..."; exit 1; }
fi

PORT=3000
while lsof -i :$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo "啟動問卷網站：http://localhost:$PORT"
echo "關閉此視窗即可停止伺服器"
echo ""

open "http://localhost:$PORT"
python3 -m http.server "$PORT"
