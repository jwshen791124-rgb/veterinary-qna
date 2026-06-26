import {
  getCurrentUser,
  setCurrentUser,
  logoutUser,
  normalizeUserCode,
  saveWrongAnswers,
  getWrongRecords,
  getWrongItems,
  getBookmarks,
  isBookmarked,
  toggleBookmark,
  removeBookmark,
  getExamHistory,
  saveExamRecord,
} from './storage.js';

const CATEGORY_ICONS = {
  '法規與倫理': { icon: '⚖️', cls: 'cat-law' },
  '藥理與計算': { icon: '💊', cls: 'cat-calc' },
  '臨床營養學': { icon: '🥗', cls: 'cat-nutrition' },
  '特殊寵物與非哺乳類專區': { icon: '🦎', cls: 'cat-exotic' },
  '牛馬豬雞鴨羊專區': { icon: '🐄', cls: 'cat-farm' },
  '犬貓專區': { icon: '🐾', cls: 'cat-pet' },
  '其他基礎臨床護理': { icon: '🏥', cls: 'cat-other' },
};

const EXAM_SIZE = 100;

const SOURCE_LABELS = {
  practice: '練習',
  exam: '測驗',
};

const state = {
  data: null,
  questionMap: {},
  category: null,
  quizLabel: null,
  questions: [],
  currentIndex: 0,
  answered: false,
  selectedKey: null,
  results: [],
  wrongIds: [],
  returnTab: 'home',
  quizMode: 'category',
};

const $ = (sel) => document.querySelector(sel);

const views = {
  login: $('#view-login'),
  home: $('#view-home'),
  wrong: $('#view-wrong'),
  bookmarks: $('#view-bookmarks'),
  exam: $('#view-exam'),
  quiz: $('#view-quiz'),
  result: $('#view-result'),
};

const tabViews = ['home', 'wrong', 'bookmarks', 'exam'];

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove('active'));
  views[name].classList.add('active');
  const inApp = tabViews.includes(name) || name === 'quiz' || name === 'result';
  $('#bottom-nav').classList.toggle('hidden', !tabViews.includes(name));
  $('#app-user-bar').classList.toggle('visible', inApp && !!getCurrentUser());
}

function updateUserBar() {
  const user = getCurrentUser();
  $('#user-display').textContent = user ? `受試者：${user}` : '';
}

function showLogin() {
  showView('login');
  $('#app-user-bar').classList.remove('visible');
  $('#login-code').value = '';
  $('#login-error').classList.add('hidden');
  setTimeout(() => $('#login-code').focus(), 100);
}

function showApp() {
  updateUserBar();
  showTab(state.returnTab || 'home');
}

function handleLogin() {
  const code = normalizeUserCode($('#login-code').value);
  if (!code) {
    $('#login-error').textContent = '請輸入受試者代號';
    $('#login-error').classList.remove('hidden');
    return;
  }

  setCurrentUser(code);
  $('#login-error').classList.add('hidden');
  refreshUserData();
  showApp();
}

function handleLogout() {
  flushUnsavedWrongs();
  logoutUser();
  showLogin();
}

function refreshUserData() {
  if (!state.data) return;
  renderHome();
  renderWrongHistory();
  renderBookmarks();
  renderExamTab();
}

function showTab(name) {
  state.returnTab = name;
  showView(name);
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  if (name === 'wrong') renderWrongHistory();
  if (name === 'bookmarks') renderBookmarks();
  if (name === 'exam') renderExamTab();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestionMap(data) {
  const map = {};
  for (const [category, questions] of Object.entries(data.questions)) {
    for (const q of questions) {
      map[q.id] = { ...q, category };
    }
  }
  return map;
}

async function loadData() {
  const res = await fetch('./data/questions.json');
  if (!res.ok) throw new Error('無法載入題庫');
  state.data = await res.json();
  state.questionMap = buildQuestionMap(state.data);
  if (getCurrentUser()) refreshUserData();
}

function renderHome() {
  if (!state.data) return;
  const list = $('#category-list');
  const total = state.data.categories.reduce((s, c) => s + c.count, 0);
  $('#total-count').textContent = `共 ${total} 題 · 7 大分類`;

  list.innerHTML = state.data.categories
    .map((cat) => {
      const meta = CATEGORY_ICONS[cat.name] || { icon: '📋', cls: 'cat-other' };
      return `
        <button type="button" class="category-card" data-category="${cat.name}">
          <div class="category-icon ${meta.cls}">${meta.icon}</div>
          <div class="category-info">
            <div class="category-name">${cat.name}</div>
            <div class="category-count">${cat.count} 題</div>
          </div>
          <span class="category-arrow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </span>
        </button>`;
    })
    .join('');

  list.querySelectorAll('.category-card').forEach((btn) => {
    btn.addEventListener('click', () => startCategoryQuiz(btn.dataset.category));
  });
}

function getWrongSource() {
  return state.quizMode === 'exam' ? 'exam' : 'practice';
}

function buildProportionalExamQuestions() {
  const categories = state.data.categories;
  const total = categories.reduce((sum, cat) => sum + cat.count, 0);

  const slots = categories.map((cat) => {
    const exact = (cat.count / total) * EXAM_SIZE;
    const base = Math.floor(exact);
    return { name: cat.name, count: base, remainder: exact - base };
  });

  let assigned = slots.reduce((sum, slot) => sum + slot.count, 0);
  const ranked = [...slots].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; assigned < EXAM_SIZE; i++, assigned++) {
    ranked[i % ranked.length].count += 1;
  }

  const picked = [];
  for (const slot of slots) {
    const pool = state.data.questions[slot.name] || [];
    const sampled = shuffle(pool).slice(0, Math.min(slot.count, pool.length));
    for (const q of sampled) {
      picked.push({ ...q, category: slot.name });
    }
  }

  return shuffle(picked);
}

function renderExamTab() {
  if (!state.data) return;
  const list = $('#exam-breakdown');
  const categories = state.data.categories;
  const total = categories.reduce((sum, cat) => sum + cat.count, 0);

  const slots = categories.map((cat) => {
    const exact = (cat.count / total) * EXAM_SIZE;
    const base = Math.floor(exact);
    return { name: cat.name, count: base, remainder: exact - base };
  });

  let assigned = slots.reduce((sum, slot) => sum + slot.count, 0);
  const ranked = [...slots].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; assigned < EXAM_SIZE; i++, assigned++) {
    ranked[i % ranked.length].count += 1;
  }

  list.innerHTML = slots
    .map((slot) => {
      const pct = ((slot.count / EXAM_SIZE) * 100).toFixed(0);
      return `<li><span>${slot.name}</span><span class="bd-count">約 ${slot.count} 題 (${pct}%)</span></li>`;
    })
    .join('');

  const historyEl = $('#exam-history');
  const exams = getExamHistory();
  if (!exams.length) {
    historyEl.classList.add('hidden');
    historyEl.innerHTML = '';
    return;
  }

  historyEl.classList.remove('hidden');
  historyEl.innerHTML = `
    <h3>測驗紀錄</h3>
    <ul class="exam-history-list">
      ${exams
        .slice(0, 10)
        .map(
          (item) => `
        <li>
          <span>${item.date}</span>
          <span class="exam-history-score">${item.score} / ${item.total} 分 · 錯 ${item.wrong} 題</span>
        </li>`
        )
        .join('')}
    </ul>`;
}

function renderWrongHistory() {
  const list = $('#wrong-list');
  const records = getWrongRecords();

  if (!records.length) {
    list.innerHTML = '<p class="empty-state">尚無錯題記錄<br>練習或測驗答錯的題目會自動保存</p>';
    return;
  }

  list.innerHTML = records
    .map(({ date, source, items }) => {
      const uniqueIds = new Set(items.map((i) => i.id));
      const sourceLabel = SOURCE_LABELS[source];
      return `
        <details class="record-card">
          <summary class="record-summary">
            <div>
              <div class="record-date">${date} · ${sourceLabel}</div>
              <div class="record-meta">${items.length} 次答錯 · ${uniqueIds.size} 題</div>
            </div>
            <span class="record-chevron">›</span>
          </summary>
          <div class="record-body">
            ${items
              .map(
                (item, idx) => `
              <div class="record-item">
                <span class="record-badge">${item.category}</span>
                <p class="record-question">${idx + 1}. ${item.question}</p>
                <p class="record-answer wrong-text">你的答案：${item.selected}. ${item.options[item.selected] || '—'}</p>
                <p class="record-answer correct-text">正確答案：${item.answer}. ${item.options[item.answer]}</p>
              </div>`
              )
              .join('')}
            <button type="button" class="btn-secondary record-practice-btn" data-date="${date}" data-source="${source}">複習此紀錄</button>
          </div>
        </details>`;
    })
    .join('');

  list.querySelectorAll('.record-practice-btn').forEach((btn) => {
    btn.addEventListener('click', () => startWrongDateQuiz(btn.dataset.date, btn.dataset.source));
  });
}

function renderBookmarks() {
  const list = $('#bookmark-list');
  const bookmarks = getBookmarks();
  const items = Object.values(bookmarks).sort(
    (a, b) => new Date(b.markedAt) - new Date(a.markedAt)
  );

  const actions = $('#bookmark-actions');
  if (items.length) {
    actions.classList.remove('hidden');
  } else {
    actions.classList.add('hidden');
  }

  if (!items.length) {
    list.innerHTML = '<p class="empty-state">尚無標記題目<br>練習時點擊右上角 ☆ 即可標記</p>';
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
      <div class="record-card bookmark-card">
        <div class="record-item">
          <div class="bookmark-row">
            <span class="record-badge">${item.category}</span>
            <button type="button" class="unmark-btn" data-id="${item.id}" aria-label="取消標記">✕</button>
          </div>
          <p class="record-question">${item.question}</p>
          <p class="record-answer correct-text">答案：${item.answer}. ${item.options[item.answer]}</p>
        </div>
      </div>`
    )
    .join('');

  list.querySelectorAll('.unmark-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeBookmark(btn.dataset.id);
      renderBookmarks();
    });
  });
}

function startCategoryQuiz(category, questionIds = null) {
  state.quizMode = 'category';
  state.category = category;
  state.quizLabel = category;
  const all = state.data.questions[category] || [];

  if (questionIds) {
    const idSet = new Set(questionIds);
    state.questions = shuffle(all.filter((q) => idSet.has(q.id)));
  } else {
    state.questions = shuffle(all);
  }

  beginQuiz();
}

function startWrongDateQuiz(date, source) {
  const items = getWrongItems(date, source);

  const seen = new Set();
  const questions = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    questions.push({
      id: item.id,
      question: item.question,
      options: item.options,
      answer: item.answer,
      category: item.category,
    });
  }

  if (!questions.length) return;

  state.quizMode = 'wrong';
  state.category = null;
  state.wrongReviewDate = date;
  state.wrongReviewSource = source;
  state.quizLabel = `${date} · ${SOURCE_LABELS[source]}錯題`;
  state.questions = shuffle(questions);
  beginQuiz();
}

function startExamQuiz() {
  state.quizMode = 'exam';
  state.category = null;
  state.quizLabel = '模擬測驗';
  state.questions = buildProportionalExamQuestions();
  beginQuiz();
}

function startBookmarkQuiz() {
  const bookmarks = Object.values(getBookmarks());
  if (!bookmarks.length) return;

  state.quizMode = 'bookmark';
  state.category = null;
  state.quizLabel = '標記複習';
  state.questions = shuffle(
    bookmarks.map((b) => ({
      id: b.id,
      question: b.question,
      options: b.options,
      answer: b.answer,
      category: b.category,
    }))
  );
  beginQuiz();
}

function beginQuiz() {
  state.currentIndex = 0;
  state.results = [];
  state.wrongIds = [];
  state.answered = false;
  state.selectedKey = null;

  $('#quiz-category').textContent = state.quizLabel;
  updateQuizChrome();
  showView('quiz');
  renderQuestion();
}

function updateQuizChrome() {
  const isExam = state.quizMode === 'exam';
  $('#btn-shuffle').classList.toggle('hidden-tools', isExam);
  $('#btn-bookmark').classList.toggle('hidden-tools', isExam);
}

function getCurrentCategory() {
  const q = state.questions[state.currentIndex];
  return q.category || state.category;
}

function updateBookmarkBtn() {
  const q = state.questions[state.currentIndex];
  const btn = $('#btn-bookmark');
  const marked = isBookmarked(q.id);
  btn.textContent = marked ? '★' : '☆';
  btn.classList.toggle('marked', marked);
}

function renderQuestion() {
  const q = state.questions[state.currentIndex];
  const total = state.questions.length;
  const idx = state.currentIndex + 1;

  $('#quiz-progress-text').textContent = `第 ${idx} / ${total} 題`;
  $('#progress-bar').style.width = `${(idx / total) * 100}%`;
  $('#question-text').textContent = q.question;
  updateBookmarkBtn();

  const optionsList = $('#options-list');
  const keys = Object.keys(q.options).sort();
  optionsList.innerHTML = keys
    .map(
      (key) => `
      <button type="button" class="option-btn" data-key="${key}">
        <span class="option-key">${key}</span>
        <span class="option-text">${q.options[key]}</span>
      </button>`
    )
    .join('');

  optionsList.querySelectorAll('.option-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectOption(btn.dataset.key));
  });

  $('#feedback').classList.add('hidden');
  $('#feedback').classList.remove('correct-fb', 'wrong-fb');
  $('#btn-next').classList.add('hidden');
  $('#btn-finish').classList.add('hidden');
  $('#btn-finish').textContent = '查看成績';
  state.answered = false;
  state.selectedKey = null;
}

function selectOption(key) {
  if (state.answered) return;

  const q = state.questions[state.currentIndex];
  const isExam = state.quizMode === 'exam';
  const isCorrect = key === q.answer;
  state.answered = true;
  state.selectedKey = key;

  const result = { id: q.id, correct: isCorrect, selected: key, saved: false };
  state.results.push(result);
  if (!isCorrect) state.wrongIds.push(q.id);

  if (isExam) {
    document.querySelectorAll('.option-btn').forEach((btn) => {
      btn.disabled = true;
      if (btn.dataset.key === key) btn.classList.add('exam-selected');
    });
    $('#feedback').classList.add('hidden');
  } else {
    if (!isCorrect) saveWrongResult(result);

    document.querySelectorAll('.option-btn').forEach((btn) => {
      btn.disabled = true;
      const k = btn.dataset.key;
      if (k === q.answer) {
        btn.classList.add('correct');
      } else if (k === key && !isCorrect) {
        btn.classList.add('wrong');
      } else if (k !== q.answer) {
        btn.classList.add('dimmed');
      }
    });

    const feedback = $('#feedback');
    feedback.classList.remove('hidden', 'correct-fb', 'wrong-fb');
    feedback.classList.add(isCorrect ? 'correct-fb' : 'wrong-fb');
    $('#feedback-icon').textContent = isCorrect ? '✅' : '❌';
    $('#feedback-text').textContent = isCorrect ? '答對了！' : '答錯了';

    const correctEl = $('#correct-answer');
    if (!isCorrect) {
      correctEl.classList.remove('hidden');
      correctEl.textContent = `正確答案：${q.answer}. ${q.options[q.answer]}`;
    } else {
      correctEl.classList.add('hidden');
    }
  }

  const isLast = state.currentIndex >= state.questions.length - 1;
  if (isLast) {
    $('#btn-finish').classList.remove('hidden');
    $('#btn-finish').textContent = isExam ? '交卷看成績' : '查看成績';
  } else {
    $('#btn-next').classList.remove('hidden');
  }
}

function nextQuestion() {
  state.currentIndex++;
  renderQuestion();
}

function saveWrongResult(result) {
  if (result.correct || result.saved) return;
  if (state.quizMode === 'exam') return;

  const q = state.questions.find((item) => item.id === result.id);
  if (!q) return;

  const ok = saveWrongAnswers([
    {
      id: q.id,
      category: q.category || state.category,
      question: q.question,
      options: q.options,
      answer: q.answer,
      selected: result.selected,
      source: getWrongSource(),
      savedAt: new Date().toISOString(),
    },
  ]);

  if (ok) {
    result.saved = true;
    renderWrongHistory();
  }
}

function flushUnsavedWrongs() {
  state.results.filter((r) => !r.correct && !r.saved).forEach(saveWrongResult);
}

function showResult() {
  flushUnsavedWrongs();

  const correct = state.results.filter((r) => r.correct).length;
  const wrong = state.results.length - correct;
  const total = state.results.length;
  const isExam = state.quizMode === 'exam';

  if (isExam) {
    state.results.filter((r) => !r.correct).forEach((result) => {
      const q = state.questions.find((item) => item.id === result.id);
      if (!q || result.saved) return;
      const ok = saveWrongAnswers([
        {
          id: q.id,
          category: q.category,
          question: q.question,
          options: q.options,
          answer: q.answer,
          selected: result.selected,
          source: 'exam',
          savedAt: new Date().toISOString(),
        },
      ]);
      if (ok) result.saved = true;
    });
    renderWrongHistory();
    saveExamRecord({ score: correct, total: EXAM_SIZE, wrong });
  }

  const percent = isExam ? correct : total > 0 ? Math.round((correct / total) * 100) : 0;

  $('#result-percent').textContent = isExam ? String(correct) : `${percent}%`;
  $('#result-unit').classList.toggle('hidden', !isExam);
  $('#result-title').textContent = isExam
    ? correct >= 80
      ? '測驗通過！'
      : correct >= 60
        ? '尚可，繼續加油'
        : '需要再加強'
    : percent >= 80
      ? '表現優秀！'
      : percent >= 60
        ? '繼續加油！'
        : '再多練習吧';
  $('#result-category').textContent = isExam
    ? `模擬測驗 · ${correct} / ${EXAM_SIZE} 分`
    : state.quizLabel;
  $('#stat-correct').textContent = correct;
  $('#stat-wrong').textContent = wrong;
  $('#stat-total').textContent = total;

  const ring = $('#result-ring');
  const score = isExam ? correct : percent;
  ring.style.borderColor =
    score >= 80 ? 'var(--correct)' : score >= 60 ? 'var(--accent)' : 'var(--wrong)';

  const retryWrong = $('#btn-retry-wrong');
  retryWrong.textContent = isExam ? '複習測驗錯題' : '重練錯題';
  if (state.wrongIds.length > 0) {
    retryWrong.classList.remove('hidden');
  } else {
    retryWrong.classList.add('hidden');
  }

  $('#btn-retry-all').textContent = isExam ? '再考一次' : '再練一次';

  showView('result');
}

function retryQuiz(questionIds = null) {
  if (state.quizMode === 'exam') {
    if (questionIds) {
      const idSet = new Set(questionIds);
      state.questions = shuffle(state.questions.filter((q) => idSet.has(q.id)));
      state.currentIndex = 0;
      state.results = [];
      state.wrongIds = [];
      state.quizMode = 'category';
      state.quizLabel = '測驗錯題複習';
      beginQuiz();
    } else {
      startExamQuiz();
    }
    return;
  }

  if (state.quizMode === 'category') {
    startCategoryQuiz(state.category, questionIds);
  } else if (state.quizMode === 'bookmark') {
    startBookmarkQuiz();
  } else if (state.quizMode === 'wrong') {
    if (questionIds) {
      let items = getWrongItems(state.wrongReviewDate, state.wrongReviewSource);
      items = items.filter((i) => questionIds.includes(i.id));
      const seen = new Set();
      state.questions = shuffle(
        items
          .filter((i) => {
            if (seen.has(i.id)) return false;
            seen.add(i.id);
            return true;
          })
          .map((i) => ({
            id: i.id,
            question: i.question,
            options: i.options,
            answer: i.answer,
            category: i.category,
          }))
      );
      state.currentIndex = 0;
      state.results = [];
      state.wrongIds = [];
      showView('quiz');
      renderQuestion();
    } else {
      startWrongDateQuiz(state.wrongReviewDate, state.wrongReviewSource);
    }
  }
}

$('#btn-back').addEventListener('click', () => {
  flushUnsavedWrongs();
  showTab(state.returnTab);
});
$('#btn-shuffle').addEventListener('click', () => retryQuiz());
$('#btn-bookmark').addEventListener('click', () => {
  const q = state.questions[state.currentIndex];
  toggleBookmark(q, getCurrentCategory());
  updateBookmarkBtn();
});
$('#btn-next').addEventListener('click', nextQuestion);
$('#btn-finish').addEventListener('click', showResult);
$('#btn-home').addEventListener('click', () => {
  $('#btn-retry-all').textContent = '再練一次';
  $('#btn-retry-wrong').textContent = '重練錯題';
  showTab(state.returnTab);
});
$('#btn-retry-all').addEventListener('click', () => retryQuiz());
$('#btn-retry-wrong').addEventListener('click', () => retryQuiz(state.wrongIds));
$('#btn-practice-bookmarks').addEventListener('click', startBookmarkQuiz);
$('#btn-start-exam').addEventListener('click', () => {
  state.returnTab = 'exam';
  startExamQuiz();
});

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

$('#btn-login').addEventListener('click', handleLogin);
$('#login-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});
$('#btn-logout').addEventListener('click', handleLogout);

async function bootstrap() {
  try {
    await loadData();
    if (getCurrentUser()) {
      showApp();
    } else {
      showLogin();
    }
  } catch (err) {
    $('#total-count').textContent = '載入失敗，請確認已執行建置腳本';
    console.error(err);
  }
}

bootstrap();
