// teacher.js - 教师后台逻辑
const Teacher = {
  state: {
    records: [],
    currentTab: 'records',
    currentClass: '__all__',
    timeRange: 'all',
    passwordVerified: false
  },

  init() {
    CONFIG.init();
    CONFIG.loadApiConfig();
    this.bindEvents();
  },

  bindEvents() {
    $('btn-login').addEventListener('click', () => this.verifyPassword());
    $('password-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.verifyPassword();
    });

    // 时间筛选
    document.querySelectorAll('.time-chip').forEach(chip => {
      chip.addEventListener('click', () => this.setTimeFilter(chip.dataset.range));
    });

    // 班级筛选
    $('t-filter-class').addEventListener('change', () => {
      this.state.currentClass = $('t-filter-class').value;
      this.renderStats();
      this.refreshCurrentTab();
    });
  },

  verifyPassword() {
    const pw = $('password-input').value.trim();
    if (pw === Storage.getTeacherPassword()) {
      this.state.passwordVerified = true;
      $('login-screen').style.display = 'none';
      $('dashboard-screen').style.display = 'block';
      this.loadAllData();
    } else {
      Toast.show('密码错误', 'error');
    }
  },

  async loadAllData() {
    try {
      this.state.records = await API.fetchRecords();
      this.renderStats();
      this.populateClassFilter();
      this.renderRecords();
    } catch (e) {
      Toast.show('数据加载失败: ' + e.message, 'error');
    }
  },

  renderStats() {
    const recs = this.getFilteredRecords();
    const students = new Set(recs.map(r => r.studentName));
    const classes = new Set(recs.map(r => r.className));
    const avgAcc = recs.length > 0
      ? Math.round(recs.reduce((s, r) => s + r.accuracy, 0) / recs.length)
      : 0;

    $('t-stat-students').textContent = students.size;
    $('t-stat-classes').textContent = classes.size;
    $('t-stat-quizzes').textContent = recs.length;
    $('t-stat-avg').textContent = avgAcc + '%';
  },

  getFilteredRecords() {
    let recs = this.state.records || [];

    // 班级筛选
    if (this.state.currentClass !== '__all__') {
      recs = recs.filter(r => r.className === this.state.currentClass);
    }

    // 时间筛选
    const now = new Date();
    if (this.state.timeRange === 'today') {
      const today = now.toISOString().split('T')[0];
      recs = recs.filter(r => (r.submittedAt || '').startsWith(today));
    } else if (this.state.timeRange === 'yesterday') {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().split('T')[0];
      recs = recs.filter(r => (r.submittedAt || '').startsWith(yesterday));
    } else if (this.state.timeRange === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      recs = recs.filter(r => new Date(r.submittedAt) >= weekAgo);
    }

    return recs;
  },

  populateClassFilter() {
    const classes = [...new Set((this.state.records || []).map(r => r.className).filter(Boolean))];
    const sel = $('t-filter-class');
    sel.innerHTML = '<option value="__all__">全部班级</option>' +
      classes.sort().map(c => `<option value="${c}">${c}</option>`).join('');
  },

  setTimeFilter(range) {
    this.state.timeRange = range;
    document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
    document.querySelector(`.time-chip[data-range="${range}"]`)?.classList.add('active');
    this.refreshCurrentTab();
  },

  refreshCurrentTab() {
    if (this.state.currentTab === 'records') this.renderRecords();
    else if (this.state.currentTab === 'errors') this.renderErrors();
    else if (this.state.currentTab === 'diagnosis') this.renderDiagnosisTab();
  },

  switchTab(tab) {
    this.state.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById('tab-' + tab);
    if (panel) panel.style.display = 'block';
    if (tab === 'diagnosis') this.loadAllDataIfNeeded();
    this.refreshCurrentTab();
  },

  loadAllDataIfNeeded() {
    if (!this.state.records || this.state.records.length === 0) {
      this.loadAllData();
    }
  },

  // --- 做题记录 ---
  renderRecords() {
    const recs = this.getFilteredRecords();
    const tbody = $('records-tbody');

    // 按学生汇总
    const studentMap = {};
    recs.forEach(r => {
      const key = r.studentName;
      if (!studentMap[key]) {
        studentMap[key] = { ...r, quizCount: 0, bestAccuracy: 0, lastAccuracy: 0, totalTimeSum: 0 };
      }
      studentMap[key].quizCount++;
      if (r.accuracy > studentMap[key].bestAccuracy) studentMap[key].bestAccuracy = r.accuracy;
      studentMap[key].lastAccuracy = r.accuracy;
      studentMap[key].totalTimeSum += r.totalTime;
      if (!studentMap[key].className || r.className) studentMap[key].className = r.className;
    });

    const sorted = Object.values(studentMap).sort((a, b) => b.bestAccuracy - a.bestAccuracy);

    tbody.innerHTML = sorted.map((s, i) => {
      const avgTime = s.quizCount > 0 ? Math.round(s.totalTimeSum / s.quizCount) : 0;
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${s.studentName}</td>
          <td>${s.className || ''}</td>
          <td>${s.quizCount}</td>
          <td style="color:var(--success);font-weight:600;">${s.bestAccuracy}%</td>
          <td>${s.lastAccuracy}%</td>
          <td>${avgTime}s</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="Teacher.showStudentDetail('${s.studentName}')">详情</button>
            <button class="btn btn-sm btn-warning" onclick="Teacher.diagnoseStudent('${s.studentName}')">诊断</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // --- 学生详情（错题） ---
  showStudentDetail(studentName) {
    const records = this.getFilteredRecords().filter(r => r.studentName === studentName);
    const allErrors = [];
    records.forEach(r => {
      (r.details || []).forEach(d => {
        if (!d.isCorrect) allErrors.push({ ...d, submittedAt: r.submittedAt });
      });
    });

    let html = `<h3 style="margin-bottom:12px;">${studentName} 的错题记录（${allErrors.length}道）</h3>`;
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
    html += `<button class="btn btn-sm btn-outline" onclick="Teacher.copyStudentErrors('${studentName}')">一键复制全部错题</button>`;
    html += `<button class="btn btn-sm btn-danger" onclick="Teacher.deleteStudentErrors('${studentName}')">删除全部错题记录</button>`;
    html += `<button class="btn btn-sm btn-warning" onclick="Teacher.diagnoseStudent('${studentName}')">AI诊断</button>`;
    html += '</div>';

    if (allErrors.length === 0) {
      html += '<p style="color:var(--gray-400);text-align:center;padding:20px;">该学生没有错题</p>';
    } else {
      html += '<div style="max-height:400px;overflow-y:auto;">';
      allErrors.forEach((e, i) => {
        html += `
          <div class="error-card">
            <div class="q">${i + 1}. ${e.question}</div>
            <div class="a">学生答案：<span class="user">${e.userAnswer}</span> | 正确答案：<span class="correct">${e.correctAnswer}</span></div>
            <div class="meta">提交时间：${e.submittedAt || ''}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    $('modal-title').textContent = studentName + ' - 错题详情';
    $('modal-content').innerHTML = html;
    $('modal-detail').classList.add('active');
  },

  copyStudentErrors(studentName) {
    const records = (this.state.records || []).filter(r => r.studentName === studentName);
    const errors = [];
    records.forEach(r => {
      (r.details || []).forEach(d => {
        if (!d.isCorrect) errors.push(d);
      });
    });

    if (errors.length === 0) {
      Toast.show('没有错题', 'warning');
      return;
    }

    const text = `${studentName} 的错题汇总\n\n` + errors.map((e, i) =>
      `${i + 1}. ${e.question}\n   学生答案：${e.userAnswer}\n   正确答案：${e.correctAnswer}`
    ).join('\n\n');

    this.copyText(text);
    Toast.show('错题已复制', 'success');
  },

  deleteStudentErrors(studentName) {
    if (!confirm(`确认删除 ${studentName} 的所有错题记录？此操作不可恢复。`)) return;
    Toast.show('当前版本通过API删除功能开发中，请联系管理员', 'warning');
  },

  // --- 易错题汇总 ---
  renderErrors() {
    const recs = this.getFilteredRecords();
    const errorMap = {};
    recs.forEach(r => {
      (r.details || []).forEach(d => {
        if (!d.isCorrect) {
          const key = d.question;
          if (!errorMap[key]) errorMap[key] = { question: d.question, correctAnswer: d.correctAnswer, count: 0, wrongAnswers: {} };
          errorMap[key].count++;
          errorMap[key].wrongAnswers[d.userAnswer] = (errorMap[key].wrongAnswers[d.userAnswer] || 0) + 1;
        }
      });
    });

    const sorted = Object.values(errorMap).sort((a, b) => b.count - a.count);

    const container = $('errors-list');
    if (sorted.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">暂无错题数据</p>';
    } else {
      container.innerHTML = '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<button class="btn btn-sm btn-outline" onclick="Teacher.copyAllErrors()">一键复制全部错题</button>' +
        '<button class="btn btn-sm btn-warning" onclick="Teacher.diagnoseClass()">AI班级诊断</button>' +
        '</div>' +
        '<div style="max-height:500px;overflow-y:auto;">' +
        sorted.map((e, i) => {
          const wrongList = Object.entries(e.wrongAnswers)
            .sort((a, b) => b[1] - a[1])
            .map(([ans, cnt]) => `${ans}（${cnt}次）`)
            .join('、');
          return `
            <div class="error-card">
              <div class="q">${i + 1}. ${e.question}</div>
              <div class="a">正确答案：<span class="correct">${e.correctAnswer}</span> | 错误${e.count}次</div>
              <div class="a">常见错误答案：${wrongList}</div>
            </div>
          `;
        }).join('') +
        '</div>';
    }
  },

  copyAllErrors() {
    const recs = this.getFilteredRecords();
    const errors = [];
    recs.forEach(r => {
      (r.details || []).forEach(d => {
        if (!d.isCorrect) errors.push({ ...d, studentName: r.studentName });
      });
    });

    if (errors.length === 0) { Toast.show('没有错题', 'warning'); return; }

    const text = errors.map((e, i) =>
      `${i + 1}. [${e.studentName}] ${e.question}\n   学生答案：${e.userAnswer}\n   正确答案：${e.correctAnswer}`
    ).join('\n\n');

    this.copyText(text);
    Toast.show('全部错题已复制', 'success');
  },

  // --- AI 诊断 ---
  renderDiagnosisTab() {
    const content = document.getElementById('diagnosis-tab-content');
    if (!content) return;
    if (!this.state.records || this.state.records.length === 0) {
      content.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:40px;">暂无数据，请先加载做题记录</p>';
    }
  },

  // Markdown 转 HTML（轻量）
  renderMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // 标题
      .replace(/^#### (.+)$/gm, '<h5>$1</h5>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h3>$1</h3>')
      // 粗体
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // 无序列表
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/^\* (.+)$/gm, '<li>$1</li>')
      // 有序列表
      .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
      // 段落
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // 包裹连续 <li>
    html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<ul>\s*<\/ul>/g, '');
    return html;
  },

  async diagnoseStudent(studentName) {
    const records = (this.state.records || []).filter(r => r.studentName === studentName);
    const errors = [];
    records.forEach(r => {
      (r.details || []).forEach(d => {
        if (!d.isCorrect) errors.push(d);
      });
    });

    if (errors.length === 0) {
      Toast.show('该学生没有错题，无需诊断', 'warning');
      return;
    }

    $('modal-title').textContent = studentName + ' - AI学情诊断';
    $('modal-content').innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--gray-500);">AI正在分析中...</p><p id="modal-diagnosis-countdown" style="text-align:center;font-size:13px;color:var(--gray-400);margin-top:8px;"></p>';
    $('modal-detail').classList.add('active');

    // 3分钟倒计时
    let remaining = 180;
    const countdownEl = document.getElementById('modal-diagnosis-countdown');
    if (countdownEl) countdownEl.textContent = `预计等待时间不超过 ${Math.floor(remaining / 60)} 分钟`;
    const countdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        if (countdownEl) countdownEl.innerHTML = '<span style="color:var(--danger);">诊断超时，请<a href="javascript:location.reload()" style="color:var(--primary);text-decoration:underline;">刷新页面</a>后重试</span>';
      } else {
        if (countdownEl) countdownEl.textContent = `预计等待时间不超过 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`;
      }
    }, 1000);

    try {
      const diagnosis = await API.diagnose(errors, studentName);
      clearInterval(countdownTimer);
      if (countdownEl) countdownEl.style.display = 'none';
      $('modal-content').innerHTML = `
        <div class="diagnosis-card">${this.renderMarkdown(diagnosis)}</div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-sm btn-outline" onclick="Teacher.copyDiagnosis()">一键复制诊断结果</button>
          <button class="btn btn-sm btn-success" onclick="Teacher.downloadDiagnosis('${studentName}')">下载Word文档</button>
        </div>
      `;
      this._currentDiagnosis = diagnosis;
      this._currentDiagnosisTitle = studentName + ' 学情诊断';
    } catch (e) {
      clearInterval(countdownTimer);
      if (countdownEl) countdownEl.style.display = 'none';
      $('modal-content').innerHTML = '<p style="color:var(--danger);">诊断失败：' + e.message + '</p>';
    }
  },

  async diagnoseClass() {
    const recs = this.getFilteredRecords();
    const allErrors = [];
    const studentErrMap = {};
    recs.forEach(r => {
      const errs = [];
      (r.details || []).forEach(d => {
        if (!d.isCorrect) {
          errs.push(d);
          allErrors.push({ ...d, studentName: r.studentName });
        }
      });
      if (errs.length > 0) {
        if (!studentErrMap[r.studentName]) studentErrMap[r.studentName] = [];
        studentErrMap[r.studentName].push(...errs);
      }
    });

    if (allErrors.length === 0) {
      Toast.show('没有错题数据，无需诊断', 'warning');
      return;
    }

    const className = this.state.currentClass === '__all__' ? '全部班级' : this.state.currentClass;
    const tabContent = document.getElementById('diagnosis-tab-content');
    const isFromTab = this.state.currentTab === 'diagnosis';

    // 构建学生错题分布摘要
    let classSummary = `班级：${className}，共 ${Object.keys(studentErrMap).length} 名学生有错题，错题总数 ${allErrors.length} 道。\n`;
    Object.entries(studentErrMap).sort((a, b) => b[1].length - a[1].length).forEach(([name, errs]) => {
      classSummary += `- ${name}：${errs.length} 道错题\n`;
    });

    const targetEl = isFromTab ? tabContent : $('modal-content');
    const countdownEl = isFromTab ? $('diagnosis-countdown') : null;

    if (isFromTab) {
      tabContent.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--gray-500);">AI正在综合分析中...</p>';
      if (countdownEl) countdownEl.style.display = 'block';
    } else {
      $('modal-title').textContent = className + ' - AI班级学情诊断';
      $('modal-content').innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--gray-500);">AI正在综合分析中...</p><p id="modal-diagnosis-countdown" style="text-align:center;font-size:13px;color:var(--gray-400);margin-top:8px;"></p>';
      $('modal-detail').classList.add('active');
    }

    // 3分钟倒计时
    let remaining = 180;
    const activeCountdownEl = isFromTab ? countdownEl : document.getElementById('modal-diagnosis-countdown');
    if (activeCountdownEl) activeCountdownEl.textContent = `预计等待时间不超过 ${Math.floor(remaining / 60)} 分钟`;
    const countdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        const refreshHtml = '<span style="color:var(--danger);">诊断超时，请<a href="javascript:location.reload()" style="color:var(--primary);text-decoration:underline;">刷新页面</a>后重试</span>';
        if (activeCountdownEl) activeCountdownEl.innerHTML = refreshHtml;
        if (isFromTab && countdownEl) countdownEl.style.display = 'block';
      } else {
        if (activeCountdownEl) activeCountdownEl.textContent = `预计等待时间不超过 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`;
      }
    }, 1000);

    try {
      const diagnosis = await API.diagnose(allErrors, null);
      clearInterval(countdownTimer);
      if (activeCountdownEl) activeCountdownEl.style.display = 'none';
      const html = `
        <div class="diagnosis-card">
          <h4>班级错题分布</h4>
          <div style="background:var(--gray-50);border-radius:8px;padding:12px;margin-bottom:16px;max-height:160px;overflow-y:auto;">
            ${Object.entries(studentErrMap).sort((a, b) => b[1].length - a[1].length).map(([name, errs]) =>
              `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gray-100);"><span>${name}</span><span style="color:var(--danger);">${errs.length}道错题</span></div>`
            ).join('')}
          </div>
          ${this.renderMarkdown(diagnosis)}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-sm btn-outline" onclick="Teacher.copyDiagnosis()">一键复制</button>
          <button class="btn btn-sm btn-success" onclick="Teacher.downloadDiagnosis('${className} 班级诊断')">下载Word</button>
        </div>
      `;

      if (isFromTab) {
        tabContent.innerHTML = html;
      } else {
        $('modal-content').innerHTML = html;
      }

      this._currentDiagnosis = diagnosis;
      this._currentDiagnosisTitle = className + ' 班级学情诊断';
    } catch (e) {
      clearInterval(countdownTimer);
      if (activeCountdownEl) activeCountdownEl.style.display = 'none';
      const errHtml = '<p style="color:var(--danger);">诊断失败：' + e.message + '</p>';
      if (isFromTab) tabContent.innerHTML = errHtml;
      else $('modal-content').innerHTML = errHtml;
    }
  },

  copyDiagnosis() {
    if (!this._currentDiagnosis) return;
    this.copyText(this._currentDiagnosis);
    Toast.show('诊断结果已复制', 'success');
  },

  downloadDiagnosis(title) {
    if (!this._currentDiagnosis) return;
    const bodyHtml = this._currentDiagnosis
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const html = `
      <html>
      <head><meta charset="UTF-8"><title>${title}</title>
      <style>body{font-family:'Microsoft YaHei',SimSun,serif;line-height:1.8;padding:40px;max-width:800px;margin:0 auto;color:#333;}
      h1{text-align:center;border-bottom:2px solid #333;padding-bottom:10px;}
      h2{color:#2563eb;margin-top:24px;}h3{color:#374151;margin-top:18px;}
      p{margin:10px 0;}li{margin:6px 0;}</style></head>
      <body>
      <h1>${title}</h1>
      <p>${bodyHtml}</p>
      </body></html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title + '.doc';
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Word文档已下载', 'success');
  },

  // 工具方法
  copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  },

  closeModal() {
    $('modal-detail').classList.remove('active');
  },

  refreshData() {
    this.loadAllData();
    Toast.show('数据已刷新', 'success');
  }
};

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

document.addEventListener('DOMContentLoaded', () => Teacher.init());
