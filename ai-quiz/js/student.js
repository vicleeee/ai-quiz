// student.js - 学生答题主逻辑
const Quiz = {
  state: {
    questions: [],
    currentIndex: 0,
    correctCount: 0,
    answered: false,
    startTime: 0,
    answers: [], // {question, userAnswer, correctAnswer, isCorrect, timeSpent}
    questionStartTime: 0,
    className: '',
    studentName: '',
    knowledge: '',
    totalQuestions: 10
  },

  // 初始化
  init() {
    Sound.init();
    CONFIG.init();
    CONFIG.loadApiConfig().then(() => this.loadClasses());
    this.bindEvents();
    this.loadKnowledgePresets();
  },

  // 加载班级数据
  async loadClasses() {
    const cached = Storage.getClasses();
    if (Object.keys(cached).length > 0) {
      this.renderClasses(cached);
      this.restoreLastSelection();
    }
    try {
      const fresh = await API.fetchStudents();
      Storage.setClasses(fresh);
      this.renderClasses(fresh);
      this.restoreLastSelection();
    } catch (e) {
      if (Object.keys(Storage.getClasses()).length === 0) {
        Toast.show('班级数据加载失败，请检查网络', 'error');
      }
    }
  },

  renderClasses(data) {
    const sel = $('sel-class');
    sel.innerHTML = '<option value="">请选择班级</option>';
    Object.keys(data).sort().forEach(cls => {
      sel.innerHTML += `<option value="${cls}">${cls}</option>`;
    });
  },

  // 加载知识点预设
  loadKnowledgePresets() {
    const container = $('knowledge-presets');
    if (!container) return;

    const defaults = ['形容词比较级', '一般现在时', '方位介词', '一般过去时', '现在进行时', '一般将来时', '名词单复数'];
    const presets = defaults;

    // 预设知识点对应的优化提示词
    const promptMap = {
      '形容词比较级': '小学英语形容词比较级，难度中等，题型为选择题，选项顺序随机排列',
      '一般现在时': '小学英语一般现在时，第三人称单数变化，难度中等，题型为选择题，选项顺序随机排列',
      '方位介词': '小学英语方位介词（in/on/under/behind等），难度较低，题型为选择题，选项顺序随机排列',
      '一般过去时': '小学英语一般过去时，规则与不规则动词过去式，难度中等，题型为选择题，选项顺序随机排列',
      '现在进行时': '小学英语现在进行时（be+动词ing），难度中等，题型为选择题，选项顺序随机排列',
      '一般将来时': '小学英语一般将来时（will/be going to），难度较高，题型为选择题，选项顺序随机排列',
      '名词单复数': '小学英语名词单复数变化规则，难度较低，题型为选择题，选项顺序随机排列'
    };

    container.style.display = 'flex';
    container.innerHTML = '';
    presets.forEach(k => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = k;
      chip.addEventListener('click', () => {
        $('knowledge-input').value = promptMap[k] || k;
        document.querySelectorAll('#knowledge-presets .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.checkStartReady();
      });
      container.appendChild(chip);
    });
  },

  restoreLastSelection() {
    const cls = Storage.getLastClass();
    const name = Storage.getLastStudent();
    if (cls) {
      const selClass = $('sel-class');
      selClass.value = cls;
      selClass.dispatchEvent(new Event('change'));
      setTimeout(() => {
        if (name) {
          $('sel-name').value = name;
          this.checkStartReady();
        }
      }, 300);
    }
  },

  bindEvents() {
    $('sel-class').addEventListener('change', () => this.onClassChange());
    $('sel-name').addEventListener('change', () => {
      Storage.setLastStudent($('sel-name').value);
      this.checkStartReady();
    });
    $('knowledge-input').addEventListener('input', () => this.checkStartReady());
    $('btn-start').addEventListener('click', () => this.startQuiz());
    $('btn-next').addEventListener('click', () => this.nextQuestion());
    $('btn-retry').addEventListener('click', () => this.resetToSelect());
    $('btn-leaderboard').addEventListener('click', () => this.showLeaderboard());
    $('btn-settings').addEventListener('click', () => this.showSettings());
    $('btn-save-settings').addEventListener('click', () => this.saveSettings());
    $('btn-teacher').addEventListener('click', () => { window.location.href = 'teacher.html'; });

    // 排行榜按钮
    const btnRank = $('btn-view-rank');
    if (btnRank) btnRank.addEventListener('click', () => this.showLeaderboard());
  },

  onClassChange() {
    const cls = $('sel-class').value;
    Storage.setLastClass(cls);
    const data = Storage.getClasses();
    const selName = $('sel-name');

    if (!cls || !data[cls]) {
      selName.innerHTML = '<option value="">请先选择班级</option>';
      selName.disabled = true;
    } else {
      selName.innerHTML = '<option value="">请选择姓名</option>' +
        data[cls].sort().map(n => `<option value="${n}">${n}</option>`).join('');
      selName.disabled = false;
    }
    this.checkStartReady();
  },

  checkStartReady() {
    const cls = $('sel-class').value;
    const name = $('sel-name').value;
    const knowledge = ($('knowledge-input').value || '').trim();
    const btn = $('btn-start');
    btn.disabled = !(cls && name && knowledge);
  },

  // 开始答题
  async startQuiz() {
    this.state.className = $('sel-class').value;
    this.state.studentName = $('sel-name').value;
    this.state.knowledge = $('knowledge-input').value.trim();
    this.state.totalQuestions = parseInt($('question-count').value) || 10;

    Storage.setLastStudent(this.state.studentName);
    // 不再保存知识点到本地存储

    this.showScreen('loading');

    // 1分钟倒计时
    let remaining = 60;
    const countdownEl = $('loading-countdown');
    if (countdownEl) countdownEl.textContent = `预计等待时间不超过 ${remaining} 秒`;
    const countdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        if (countdownEl) countdownEl.innerHTML = '<span style="color:var(--danger);">生成超时，请<a href="javascript:location.reload()" style="color:var(--primary);text-decoration:underline;">刷新页面</a>后重试</span>';
      } else {
        if (countdownEl) countdownEl.textContent = `预计等待时间不超过 ${remaining} 秒`;
      }
    }, 1000);

    try {
      const questions = await API.generateQuestions(this.state.knowledge, this.state.totalQuestions);
      clearInterval(countdownTimer);
      if (countdownEl) countdownEl.textContent = '';

      if (questions.length === 0) throw new Error('AI未生成有效题目');

      this.state.questions = questions;
      this.state.currentIndex = 0;
      this.state.correctCount = 0;
      this.state.answers = [];
      this.state.startTime = Date.now();

      this.showScreen('quiz');
      $('correct-count').textContent = '0';
      $('accuracy').textContent = '0%';
      this.renderQuestion();
    } catch (e) {
      clearInterval(countdownTimer);
      Toast.show(e.message || '生成题目失败', 'error');
      this.showScreen('select');
    }
  },

  renderQuestion() {
    const q = this.state.questions[this.state.currentIndex];
    if (!q) return;

    this.state.answered = false;
    this.state.questionStartTime = Date.now();

    $('q-num').textContent = `第${this.state.currentIndex + 1}题`;
    $('q-text').textContent = q.text;
    $('q-index-label').textContent = `第 ${this.state.currentIndex + 1} 题`;
    $('next-wrap').style.display = 'none';
    $('q-explanation').className = 'explanation';

    // 更新进度条
    const pct = ((this.state.currentIndex) / this.state.questions.length) * 100;
    $('progress-fill').style.width = pct + '%';
    $('progress-count').textContent = `${this.state.currentIndex + 1} / ${this.state.questions.length}`;

    // 渲染选项
    const letters = ['A', 'B', 'C', 'D'];
    $('q-options').innerHTML = q.options.map((opt, i) => `
      <div class="option-item" data-index="${i}" onclick="Quiz.selectAnswer(${i})">
        <span class="opt-letter">${letters[i]}</span>
        <span>${opt}</span>
      </div>
    `).join('');

    this.updateTimer();
  },

  selectAnswer(idx) {
    if (this.state.answered) return;

    const q = this.state.questions[this.state.currentIndex];
    const timeSpent = Date.now() - this.state.questionStartTime;
    this.state.answered = true;

    const isCorrect = idx === q.correctIndex;
    if (isCorrect) {
      this.state.correctCount++;
      Sound.playSuccess();
    } else {
      Sound.playFail();
    }

    this.state.answers.push({
      question: q.text,
      options: q.options,
      userAnswer: q.options[idx],
      correctAnswer: q.correctAnswer,
      isCorrect,
      timeSpent
    });

    // 高亮选项
    const items = document.querySelectorAll('#q-options .option-item');
    items.forEach((item, i) => {
      item.classList.add('disabled');
      if (i === idx) item.classList.add(isCorrect ? 'correct' : 'wrong');
      if (i === q.correctIndex && !isCorrect) item.classList.add('reveal-correct');
    });

    // 显示解析
    const exp = $('q-explanation');
    if (isCorrect) {
      exp.className = 'explanation show correct';
      exp.textContent = '回答正确！';
    } else {
      exp.className = 'explanation show wrong';
      exp.textContent = `正确答案是：${q.correctAnswer}`;
    }

    $('next-wrap').style.display = 'block';
    $('correct-count').textContent = this.state.correctCount;
    const acc = Math.round((this.state.correctCount / (this.state.currentIndex + 1)) * 100);
    $('accuracy').textContent = acc + '%';

    // 最后一道题
    if (this.state.currentIndex >= this.state.questions.length - 1) {
      $('btn-next').textContent = '查看结果';
    }
  },

  nextQuestion() {
    const isLast = this.state.currentIndex >= this.state.questions.length - 1;
    if (isLast) {
      this.showResult();
    } else {
      this.state.currentIndex++;
      this.renderQuestion();
    }
  },

  showResult() {
    const totalTime = Math.round((Date.now() - this.state.startTime) / 1000);
    const total = this.state.questions.length;
    const correct = this.state.correctCount;
    const accuracy = Math.round((correct / total) * 100);
    const avgTime = total > 0 ? Math.round(totalTime / total) : 0;

    this.showScreen('result');
    $('result-player').textContent = `${this.state.studentName}（${this.state.className}）`;

    // 分数圈
    const circle = document.getElementById('score-ring');
    const circumference = 389.56;
    const offset = circumference - (accuracy / 100) * circumference;
    circle.setAttribute('stroke-dashoffset', offset);
    $('score-num').textContent = accuracy;

    $('stat-total').textContent = total;
    $('stat-correct').textContent = correct;
    $('stat-wrong').textContent = total - correct;
    $('stat-time').textContent = this.formatTime(totalTime);
    $('stat-avg').textContent = avgTime + 's';
    $('stat-rank').textContent = '--';

    // 渲染答题记录
    this.renderReview();

    // 提交记录
    this.submitQuizRecord(totalTime, accuracy);
  },

  renderReview() {
    const wrongOnly = document.getElementById('review-wrong-only');
    const filterWrong = wrongOnly ? wrongOnly.checked : false;
    const answers = filterWrong
      ? this.state.answers.filter(a => !a.isCorrect)
      : this.state.answers;

    const container = $('review-list');
    if (answers.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">没有错题，太棒了！</p>';
    } else {
      container.innerHTML = answers.map((a, i) => `
        <div class="review-item ${a.isCorrect ? 'correct' : 'wrong'}">
          <div class="q">${i + 1}. ${a.question}</div>
          <div class="a">你的答案：<b style="color:${a.isCorrect ? 'var(--success)' : 'var(--danger)'}">${a.userAnswer}</b> | 正确答案：<b style="color:var(--success)">${a.correctAnswer}</b></div>
        </div>
      `).join('');
    }
  },

  async submitQuizRecord(totalTime, accuracy) {
    const record = {
      studentName: this.state.studentName,
      className: this.state.className,
      topic: this.state.knowledge,
      totalQuestions: this.state.questions.length,
      correctCount: this.state.correctCount,
      accuracy,
      totalTime,
      details: JSON.stringify(this.state.answers),
      time: new Date().toLocaleString('zh-CN')
    };

    try {
      await API.submitRecord(record);
    } catch (e) {
      console.warn('提交失败:', e);
    }
  },

  // 排行榜
  async showLeaderboard() {
    this.showScreen('leaderboard');
    $('rank-list').innerHTML = '<div class="spinner"></div>';

    try {
      const records = await API.fetchRecords();
      this.renderLeaderboard(records);
    } catch (e) {
      $('rank-list').innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">排行榜加载失败</p>';
    }
  },

  renderLeaderboard(records) {
    // 按最高正确率排序
    const studentMap = {};
    records.forEach(r => {
      const key = r.studentName + '|' + (r.className || '');
      if (!studentMap[key] || r.accuracy > studentMap[key].accuracy) {
        studentMap[key] = r;
      }
    });

    const sorted = Object.values(studentMap).sort((a, b) => b.accuracy - a.accuracy);

    // 渲染标签
    const classes = [...new Set(sorted.map(s => s.className).filter(Boolean))];
    let tabsHtml = '<button class="chip active" data-cls="all" onclick="Quiz.filterRank(this)">全部</button>';
    classes.forEach(c => {
      tabsHtml += `<button class="chip" data-cls="${c}" onclick="Quiz.filterRank(this)">${c}</button>`;
    });
    $('rank-tabs').innerHTML = tabsHtml;

    this._rankData = sorted;
    this._currentRankFilter = 'all';
    this.renderRankList(sorted);
  },

  filterRank(btn) {
    document.querySelectorAll('#rank-tabs .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    this._currentRankFilter = btn.dataset.cls;
    const data = this._currentRankFilter === 'all'
      ? this._rankData
      : this._rankData.filter(s => s.className === this._currentRankFilter);
    this.renderRankList(data);
  },

  renderRankList(data) {
    const container = $('rank-list');
    if (data.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">暂无数据</p>';
      return;
    }

    container.innerHTML = data.map((s, i) => {
      let rankClass = '';
      if (i === 0) rankClass = 'top1';
      else if (i === 1) rankClass = 'top2';
      else if (i === 2) rankClass = 'top3';

      return `
        <div class="rank-item">
          <div class="rank-num ${rankClass}">${i + 1}</div>
          <div class="rank-info">
            <div class="rank-name">${s.studentName}</div>
            <div class="rank-class">${s.className || ''} | ${s.topic || ''}</div>
          </div>
          <div class="rank-stats">
            <div class="rank-accuracy">${s.accuracy}%</div>
            <div class="rank-meta">${s.correctCount}/${s.totalQuestions}题</div>
          </div>
        </div>
      `;
    }).join('');
  },

  // 设置
  showSettings() {
    $('settings-model').value = CONFIG.api.model;
    $('settings-baseurl').value = CONFIG.api.baseUrl;
    $('settings-apikey').value = CONFIG.api.apiKey;
    const thinkingToggle = $('settings-thinking');
    if (CONFIG.api.thinking) thinkingToggle.classList.add('on');
    else thinkingToggle.classList.remove('on');
    $('modal-settings').classList.add('active');
  },

  saveSettings() {
    CONFIG.setModel($('settings-model').value.trim() || 'LongCat-2.0-Preview');
    CONFIG.setBaseUrl($('settings-baseurl').value.trim() || 'https://api.longcat.chat/openai');
    CONFIG.setApiKey($('settings-apikey').value.trim());
    $('modal-settings').classList.remove('active');
    Toast.show('设置已保存', 'success');
  },

  toggleThinking() {
    CONFIG.setThinking(!CONFIG.api.thinking);
    const t = $('settings-thinking');
    if (CONFIG.api.thinking) t.classList.add('on');
    else t.classList.remove('on');
  },

  // 工具方法
  showScreen(name) {
    ['select', 'loading', 'quiz', 'result', 'leaderboard'].forEach(s => {
      const el = document.getElementById('screen-' + s);
      if (el) el.style.display = s === name ? 'block' : 'none';
    });
  },

  resetToSelect() {
    this.showScreen('select');
  },

  updateTimer() {
    // 简化版计时器
  },

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
  },

  filterReview() {
    this.renderReview();
  },

  copyWrongQuestions() {
    const wrongs = this.state.answers.filter(a => !a.isCorrect);
    if (wrongs.length === 0) {
      Toast.show('没有错题', 'warning');
      return;
    }
    const text = wrongs.map((a, i) =>
      `${i + 1}. ${a.question}\n   你的答案：${a.userAnswer}\n   正确答案：${a.correctAnswer}`
    ).join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      Toast.show('错题已复制到剪贴板', 'success');
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      Toast.show('错题已复制', 'success');
    });
  },

  backFromRank() {
    this.showScreen('select');
  }
};

// 工具函数
function $(id) { return document.getElementById(id); }

const Toast = {
  show(msg, type) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, 2000);
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => Quiz.init());
