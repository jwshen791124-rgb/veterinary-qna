const CURRENT_USER_KEY = 'qna_current_user';
const LEGACY_WRONG_KEY = 'qna_wrong_history';
const LEGACY_BOOKMARK_KEY = 'qna_bookmarks';

let currentUser = null;

function readRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('無法寫入本地儲存:', err);
    return false;
  }
}

export function normalizeUserCode(code) {
  return String(code || '').trim();
}

function safeUserKey(code) {
  return code.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_');
}

function userDataKey(suffix) {
  if (!currentUser) return null;
  return `qna_user_${safeUserKey(currentUser)}_${suffix}`;
}

function readUser(suffix, fallback) {
  const key = userDataKey(suffix);
  if (!key) return fallback;
  return readRaw(key, fallback);
}

function writeUser(suffix, value) {
  const key = userDataKey(suffix);
  if (!key) return false;
  return writeRaw(key, value);
}

export function getCurrentUser() {
  if (currentUser) return currentUser;
  currentUser = normalizeUserCode(localStorage.getItem(CURRENT_USER_KEY) || '');
  return currentUser || null;
}

export function setCurrentUser(code) {
  const normalized = normalizeUserCode(code);
  if (!normalized) return false;
  currentUser = normalized;
  localStorage.setItem(CURRENT_USER_KEY, normalized);
  migrateLegacyData();
  return true;
}

export function logoutUser() {
  currentUser = null;
  localStorage.removeItem(CURRENT_USER_KEY);
}

function migrateLegacyData() {
  const wrongKey = userDataKey('wrong_history');
  const bookmarkKey = userDataKey('bookmarks');

  if (!readRaw(wrongKey, null) && localStorage.getItem(LEGACY_WRONG_KEY)) {
    writeRaw(wrongKey, readRaw(LEGACY_WRONG_KEY, {}));
    localStorage.removeItem(LEGACY_WRONG_KEY);
  }

  if (!readRaw(bookmarkKey, null) && localStorage.getItem(LEGACY_BOOKMARK_KEY)) {
    writeRaw(bookmarkKey, readRaw(LEGACY_BOOKMARK_KEY, {}));
    localStorage.removeItem(LEGACY_BOOKMARK_KEY);
  }
}

export function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function emptyDayBucket() {
  return { practice: [], exam: [] };
}

function normalizeDayBucket(dayData) {
  if (Array.isArray(dayData)) {
    return {
      practice: dayData.filter((i) => (i.source || 'practice') === 'practice'),
      exam: dayData.filter((i) => i.source === 'exam'),
    };
  }
  return {
    practice: dayData?.practice || [],
    exam: dayData?.exam || [],
  };
}

function normalizeWrongHistory(raw) {
  const out = {};
  for (const [date, dayData] of Object.entries(raw || {})) {
    out[date] = normalizeDayBucket(dayData);
  }
  return out;
}

function needsWrongMigration(raw) {
  return Object.values(raw || {}).some((v) => Array.isArray(v));
}

export function getWrongHistory() {
  if (!getCurrentUser()) return {};
  const raw = readUser('wrong_history', {});
  const normalized = normalizeWrongHistory(raw);
  if (needsWrongMigration(raw)) {
    writeUser('wrong_history', normalized);
  }
  return normalized;
}

export function getWrongRecords() {
  const history = getWrongHistory();
  const records = [];

  for (const date of Object.keys(history).sort((a, b) => b.localeCompare(a))) {
    for (const source of ['practice', 'exam']) {
      const items = history[date][source] || [];
      if (items.length) {
        records.push({ date, source, items });
      }
    }
  }

  return records;
}

export function getWrongItems(date, source) {
  const history = getWrongHistory();
  return history[date]?.[source] || [];
}

export function saveWrongAnswers(entries) {
  if (!entries.length || !getCurrentUser()) return false;
  const history = getWrongHistory();
  const date = todayKey();
  if (!history[date]) history[date] = emptyDayBucket();

  for (const entry of entries) {
    const source = entry.source || 'practice';
    const { source: _source, ...item } = entry;
    if (!history[date][source]) history[date][source] = [];
    history[date][source].push(item);
  }

  return writeUser('wrong_history', history);
}

export function getWrongDates() {
  return Object.keys(getWrongHistory()).sort((a, b) => b.localeCompare(a));
}

export function getBookmarks() {
  if (!getCurrentUser()) return {};
  return readUser('bookmarks', {});
}

export function isBookmarked(id) {
  return id in getBookmarks();
}

export function toggleBookmark(question, category) {
  if (!getCurrentUser()) return false;
  const bookmarks = getBookmarks();
  if (bookmarks[question.id]) {
    delete bookmarks[question.id];
    writeUser('bookmarks', bookmarks);
    return false;
  }
  bookmarks[question.id] = {
    id: question.id,
    category,
    question: question.question,
    options: question.options,
    answer: question.answer,
    markedAt: new Date().toISOString(),
  };
  writeUser('bookmarks', bookmarks);
  return true;
}

export function removeBookmark(id) {
  if (!getCurrentUser()) return;
  const bookmarks = getBookmarks();
  delete bookmarks[id];
  writeUser('bookmarks', bookmarks);
}

export function getExamHistory() {
  if (!getCurrentUser()) return [];
  return readUser('exam_history', []);
}

export function saveExamRecord({ score, total, wrong }) {
  if (!getCurrentUser()) return false;
  const history = getExamHistory();
  history.unshift({
    date: todayKey(),
    score,
    total,
    wrong,
    savedAt: new Date().toISOString(),
  });
  return writeUser('exam_history', history.slice(0, 50));
}

export function getCategoryProgress() {
  if (!getCurrentUser()) return {};
  return readUser('category_progress', {});
}

export function getCategoryDoneIds(category) {
  const ids = getCategoryProgress()[category] || [];
  return new Set(ids);
}

export function getCategoryDoneCount(category) {
  return getCategoryDoneIds(category).size;
}

export function markCategoryQuestionDone(category, questionId) {
  if (!getCurrentUser() || !category) return false;
  const progress = getCategoryProgress();
  if (!progress[category]) progress[category] = [];
  if (progress[category].includes(questionId)) return true;
  progress[category].push(questionId);
  return writeUser('category_progress', progress);
}

export function resetCategoryProgress(category) {
  if (!getCurrentUser()) return false;
  const progress = getCategoryProgress();
  if (!progress[category]) return true;
  delete progress[category];
  return writeUser('category_progress', progress);
}
