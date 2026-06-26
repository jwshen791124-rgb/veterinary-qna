import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const BATCH_SIZE = 8;
const DELAY_MS = 1200;
const MODEL = 'gemini-2.0-flash';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadQuestions() {
  const raw = readFileSync(join(root, 'Question.json'), 'utf8');
  const match = raw.match(/const questions = (\[[\s\S]*\]);?/);
  return JSON.parse(match[1]);
}

function loadExplanations() {
  const path = join(root, 'data', 'explanations.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function saveExplanations(data) {
  writeFileSync(join(root, 'data', 'explanations.json'), JSON.stringify(data, null, 2), 'utf8');
}

async function callGemini(apiKey, questions) {
  const payload = questions.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options,
    answer: q.answer,
  }));

  const prompt = `你是獸醫與動物醫事領域的教學專家。請為以下選擇題撰寫「答案備註」，幫助學習者理解為何正確答案正確。

要求：
1. 使用繁體中文
2. 每題 1～3 句，說明關鍵概念與為何該選項正確（可簡述其他選項為何較不合適）
3. 專業但易懂，適合獸醫助理／護理學習
4. 只回傳 JSON 物件，格式：{"題號":"備註文字", ...}，題號必須與輸入 id 完全一致
5. 不要 markdown，不要其他說明

題目：
${JSON.stringify(payload, null, 2)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 回傳為空');

  const parsed = JSON.parse(text);
  const out = {};
  for (const q of questions) {
    if (parsed[q.id]) out[q.id] = parsed[q.id];
  }
  return out;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('請設定環境變數 GEMINI_API_KEY');
    console.error('取得金鑰：https://aistudio.google.com/apikey');
    process.exit(1);
  }

  const questions = loadQuestions();
  const explanations = loadExplanations();
  const pending = questions.filter((q) => !explanations[q.id]);

  console.log(`總題數 ${questions.length}，已有註解 ${questions.length - pending.length}，待產生 ${pending.length}`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const ids = batch.map((q) => q.id).join(', ');
    process.stdout.write(`[${i + 1}-${i + batch.length}/${pending.length}] 題 ${ids} ... `);

    try {
      const chunk = await callGemini(apiKey, batch);
      Object.assign(explanations, chunk);
      saveExplanations(explanations);
      console.log(`✓ ${Object.keys(chunk).length} 題`);
    } catch (err) {
      console.log('✗');
      console.error(err.message);
      console.error('已保存進度，可重新執行繼續');
      process.exit(1);
    }

    await sleep(DELAY_MS);
  }

  console.log('全部完成！執行 npm run build 更新題庫');
}

main();
