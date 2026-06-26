import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const chunksDir = join(root, 'data', 'explanation-chunks');

function loadExplanations() {
  const path = join(root, 'data', 'explanations.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

const merged = loadExplanations();
let added = 0;

try {
  for (const file of readdirSync(chunksDir)) {
    if (!file.endsWith('.json')) continue;
    const chunk = JSON.parse(readFileSync(join(chunksDir, file), 'utf8'));
    for (const [id, text] of Object.entries(chunk)) {
      if (!merged[id]) {
        merged[id] = text;
        added++;
      }
    }
  }
} catch {
  console.log('無 chunk 資料夾或為空');
}

writeFileSync(join(root, 'data', 'explanations.json'), JSON.stringify(merged, null, 2), 'utf8');
console.log(`合併完成：新增 ${added} 題，共 ${Object.keys(merged).length} 題有註解`);
