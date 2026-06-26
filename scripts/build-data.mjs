import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const FARM_KEYWORDS = ['牛', '馬', '豬', '雞', '鴨', '羊'];

const CATEGORIES = [
  '法規與倫理',
  '犬貓專區',
  '牛馬豬雞鴨羊專區',
  '藥理與計算',
  '臨床營養學',
  '特殊寵物與非哺乳類專區',
  '其他基礎臨床護理',
];

const RULES = [
  {
    category: '法規與倫理',
    keywords: ['法', '條文', '責任', '檢舉', '執照', '醫療糾紛', '轉介', '倫理', '棄養', '罰鍰', '獸醫師法'],
  },
  {
    category: '犬貓專區',
    keywords: [
      '貓', '貓咪', '貓隻', 'Feline', 'FIC', '貓砂', '公貓', '母貓',
      '犬', '狗', '巴哥', '貴賓', '黃金獵犬', '鬥牛犬', '小獵犬', 'Heartgard', '吉娃娃', '柴犬', '公犬', '母犬', '馬爾濟斯',
    ],
  },
  {
    category: '牛馬豬雞鴨羊專區',
    keywords: FARM_KEYWORDS,
  },
  {
    category: '藥理與計算',
    keywords: [
      'mg/kg', 'mL', '劑量', '輸液', '流速', '流率', '藥物', '利尿', '麻醉', '抗生素',
      '計算', '顆/天', '周轉率', '再訂購點', 'lb', '公斤', '公克', '倍', '毫克', '毫升', '推注',
    ],
    regex: /\d+\s*(mg|ml|kg|lb)/i,
  },
  {
    category: '臨床營養學',
    keywords: ['糧', '處方', '食品', '飲食', 'BCS', '蛋白質', '脂肪', '纖維', '營養', '體態評分', '飽腹感', '乞食', '減肥', '低敏', '罐頭', '換糧'],
  },
  {
    category: '特殊寵物與非哺乳類專區',
    keywords: ['兩生類', '爬蟲類', '鳥', '兔子', '老鼠', '原蟲', '弓蟲', '蜥蜴', '烏龜', '非哺乳', '蛙'],
  },
];

function getFullText(question) {
  const optionText = Object.values(question.options || {}).join(' ');
  return `${question.question} ${optionText}`;
}

function matchesFarm(fullText) {
  // 牛馬豬雞鴨羊專區：題目或選項含「牛、馬、豬、雞、鴨、羊」任一即歸類
  return FARM_KEYWORDS.some((kw) => fullText.includes(kw));
}

function categorize(question) {
  const fullText = getFullText(question);

  for (const rule of RULES) {
    if (rule.category === '牛馬豬雞鴨羊專區') {
      if (matchesFarm(fullText)) return rule.category;
      continue;
    }
    if (rule.keywords.some((kw) => fullText.includes(kw))) {
      return rule.category;
    }
    if (rule.regex && rule.regex.test(fullText)) {
      return rule.category;
    }
  }

  return '其他基礎臨床護理';
}

function parseQuestions(raw) {
  const match = raw.match(/const questions = (\[[\s\S]*\]);?/);
  if (!match) {
    throw new Error('無法解析 Question.json 格式');
  }
  // Question.json 含未轉義反斜線，使用 eval 解析原始 JS 陣列
  // eslint-disable-next-line no-eval
  return eval(match[1]);
}

const raw = readFileSync(join(root, 'Question.json'), 'utf8');
const questions = parseQuestions(raw);

let explanations = {};
const explanationsPath = join(root, 'data', 'explanations.json');
try {
  explanations = JSON.parse(readFileSync(explanationsPath, 'utf8'));
} catch {
  // 尚無註解檔
}

let explanationMeta = { model: 'GPT-5.5', label: '獸醫知識解析' };
const explanationMetaPath = join(root, 'data', 'explanation-meta.json');
try {
  explanationMeta = JSON.parse(readFileSync(explanationMetaPath, 'utf8'));
} catch {
  // 使用預設
}

for (const q of questions) {
  if (explanations[q.id]) {
    q.explanation = explanations[q.id];
  }
}

const categorized = {};
for (const cat of CATEGORIES) {
  categorized[cat] = [];
}

for (const q of questions) {
  const category = categorize(q);
  categorized[category].push({
    id: q.id,
    question: q.question,
    options: q.options,
    answer: q.answer,
    ...(q.explanation ? { explanation: q.explanation } : {}),
  });
}

const output = {
  meta: {
    explanationModel: explanationMeta.model,
    explanationLabel: explanationMeta.label,
  },
  categories: CATEGORIES.map((name) => ({
    name,
    count: categorized[name].length,
  })),
  questions: categorized,
};

const outDir = join(root, 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'questions.json'), JSON.stringify(output, null, 2), 'utf8');

console.log('題庫建置完成：');
for (const cat of CATEGORIES) {
  console.log(`  ${cat}: ${categorized[cat].length} 題`);
}
console.log(`  總計: ${questions.length} 題`);

const farmCount = questions.filter((q) => matchesFarm(getFullText(q))).length;
const inFarm = categorized['牛馬豬雞鴨羊專區']?.length;
console.log(`\n含牛/馬/豬/雞/鴨/羊任一關鍵字: ${farmCount} 題`);
console.log(`已歸入牛馬豬雞鴨羊專區: ${inFarm} 題`);
