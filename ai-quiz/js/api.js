// api.js - 数据获取与提交
const API = {
  // 代理模式：通过代理URL转发请求，解决CORS跨域问题
  async _fetch(url, options = {}) {
    const proxyUrl = CONFIG.api.proxyUrl;
    if (proxyUrl) {
      // 代理模式：将完整的请求信息发送给代理
      const proxyOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          method: options.method || 'GET',
          headers: options.headers || {},
          body: options.body || null
        })
      };
      const resp = await fetch(proxyUrl, proxyOptions);
      if (!resp.ok) throw new Error(`代理请求失败 (${resp.status})`);
      // 代理返回原始API的响应体
      return {
        ok: resp.ok,
        status: resp.status,
        json: () => resp.json(),
        text: () => resp.text()
      };
    }
    // 直连模式
    try {
      return await fetch(url, options);
    } catch (e) {
      if (e instanceof TypeError && e.message.includes('Failed to fetch') && !CONFIG.api.proxyUrl) {
        throw new Error('CORS跨域错误：浏览器阻止了直接请求。请在设置中配置 CORS 代理地址，或确认 API 服务器开启了跨域支持。');
      }
      throw e;
    }
  },

  // 获取班级学生数据
  async fetchStudents() {
    const url = CONFIG.api.students;
    if (!url) throw new Error('未配置班级数据API');
    const resp = await this._fetch(url);
    if (!resp.ok) throw new Error('获取班级数据失败');
    const data = await resp.json();
    return this.parseStudents(data);
  },

  parseStudents(data) {
    const list = [];
    const subs = data.submissions || [];
    subs.forEach(sub => {
      (sub.list || []).forEach(item => {
        list.push({ className: item.class, name: item.name });
      });
    });
    // 按班级分组
    const classes = {};
    list.forEach(s => {
      if (!classes[s.className]) classes[s.className] = [];
      classes[s.className].push(s.name);
    });
    return classes;
  },

  // 获取做题记录（用于排行榜和教师后台）
  async fetchRecords() {
    const url = CONFIG.api.records;
    if (!url) throw new Error('未配置记录API');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('获取记录失败');
    const data = await resp.json();
    const records = data.submissions || data.data || [];
    return records.map(s => ({
      studentName: s.studentName,
      className: s.className || '',
      topic: s.topic || '',
      totalQuestions: parseInt(s.totalQuestions) || 0,
      correctCount: parseInt(s.correctCount) || 0,
      accuracy: parseInt(s.accuracy) || 0,
      totalTime: parseInt(s.totalTime) || 0,
      submittedAt: s.submitted_at || s.time || '',
      details: this.parseDetails(s.details)
    }));
  },

  parseDetails(detailsStr) {
    if (!detailsStr) return [];
    try {
      return JSON.parse(detailsStr);
    } catch (e) {
      return [];
    }
  },

  // AI 生成题目
  async generateQuestions(knowledge, count) {
    if (!CONFIG.api.apiKey) {
      throw new Error('请先在设置中填入 API Key');
    }
    const systemPrompt = `你是一个出题专家。请生成${count}道关于"${knowledge}"的单选题。

要求：
1. 严格按以下JSON数组格式返回，不要任何额外解释：
[["题目内容", ["选项A", "选项B", "选项C", "选项D"], "正确答案文本"]]
2. 正确答案必须是选项数组中的完整文本，不是字母索引
3. 正确答案随机分布在A/B/C/D四个位置
4. 干扰项要有迷惑性，与题目相关
5. 题目要有一定难度和区分度`;

    const body = {
      model: CONFIG.api.model,
      messages: [{ role: 'user', content: systemPrompt }],
      temperature: 0.7
    };

    // 关闭思考
    if (!CONFIG.api.thinking) {
      body.extra_body = { thinking: false };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.api.apiKey}`
    };

    const resp = await this._fetch(CONFIG.apiUrl('/chat/completions'), {
      method: 'POST', headers, body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 429) throw new Error('请求过于频繁，请稍后重试');
      throw new Error(err.error?.message || err.message || 'AI生成失败');
    }

    const data = await resp.json();
    const content = data.choices[0].message.content;

    const questions = API._parseQuestions(content);
    if (!questions || questions.length === 0) throw new Error('AI未生成有效题目');

    return questions;
  },

  // 解析 AI 返回的题目 JSON（增强容错）
  _parseQuestions(raw) {
    let content = raw.trim();

    // 1. 移除 markdown 代码块
    content = content.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1');

    // 2. 尝试多种策略提取 JSON 数组
    const strategies = [
      () => {
        // 策略A: 直接解析整个内容
        const m = content.match(/^\[[\s\S]*\]$/);
        return m ? m[0] : null;
      },
      () => {
        // 策略B: 找到最外层 JSON 数组
        const m = content.match(/\[[\s\S]*\]/);
        return m ? m[0] : null;
      },
      () => {
        // 策略C: 逐行提取，重新拼接
        const lines = content.split('\n').filter(l => l.trim());
        const arrLines = [];
        let inArray = false;
        for (const line of lines) {
          const t = line.trim();
          if (!inArray && t.startsWith('[')) inArray = true;
          if (inArray) arrLines.push(t);
          if (inArray && t.endsWith(']')) break;
        }
        return arrLines.length > 0 ? arrLines.join('\n') : null;
      }
    ];

    let jsonStr = null;
    for (const s of strategies) {
      jsonStr = s();
      if (jsonStr) break;
    }
    if (!jsonStr) throw new Error('AI返回中未找到题目数据');

    // 3. 修复常见 JSON 问题
    jsonStr = jsonStr
      .replace(/,\s*]/g, ']')          // 移除尾随逗号
      .replace(/,\s*,/g, ',')          // 移除连续逗号
      .replace(/\n/g, ' ')             // 压缩换行
      .replace(/\t/g, ' ')             // 压缩制表符
      .replace(/\s{2,}/g, ' ');        // 压缩多余空格

    // 4. 尝试解析，失败则逐步修复
    const parseAttempts = [
      () => JSON.parse(jsonStr),
      () => {
        // 尝试替换未转义的控制字符
        const fixed = jsonStr.replace(/[\x00-\x1f\x7f]/g, (ch) => {
          if (ch === '\t') return '\\t';
          if (ch === '\n') return '\\n';
          if (ch === '\r') return '\\r';
          return '';
        });
        return JSON.parse(fixed);
      },
      () => {
        // 尝试用 eval 兜底（仅用于 JSON 数组）
        const fn = new Function('return ' + jsonStr);
        return fn();
      }
    ];

    for (const attempt of parseAttempts) {
      try {
        const result = attempt();
        if (Array.isArray(result)) {
          if (result.length === 0) throw new Error('AI返回了空题目列表');
          return result.map((q, i) => {
            if (!Array.isArray(q) || q.length < 3) {
              throw new Error(`第${i + 1}题格式不完整`);
            }
            const [text, options, answer] = q;
            if (!Array.isArray(options) || options.length < 2) {
              throw new Error(`第${i + 1}题选项不足`);
            }
            const correctIdx = options.indexOf(answer);
            return {
              id: i,
              text: String(text),
              options: options.map(String),
              correctIndex: correctIdx >= 0 ? correctIdx : 0,
              correctAnswer: String(answer)
            };
          });
        }
      } catch (e) {
        if (attempt === parseAttempts[parseAttempts.length - 1]) {
          throw new Error(`AI返回格式异常，无法解析题目。请重试或更换知识点。`);
        }
      }
    }
  },

  // AI 学情诊断
  async diagnose(errors, studentName) {
    const errorText = errors.map((e, i) =>
      `${i + 1}. 题目: ${e.question}\n   学生答案: ${e.userAnswer}\n   正确答案: ${e.correctAnswer}`
    ).join('\n\n');

    const prompt = studentName
      ? `以下是学生"${studentName}"的错题，请进行学情诊断分析。请使用 Markdown 格式输出，包含：
## 薄弱知识点
## 常见错误类型
## 个性化学习建议
\n\n${errorText}`
      : `以下是班级整体错题汇总，请进行班级学情诊断分析。请使用 Markdown 格式输出，包含：
## 共性薄弱点
## 教学改进建议
## 重点关注学生（如有）
\n\n${errorText}`;

    const body = {
      model: CONFIG.api.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      extra_body: { thinking: false }
    };

    const resp = await this._fetch(CONFIG.apiUrl('/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.api.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) throw new Error('诊断失败');
    const data = await resp.json();
    return data.choices[0].message.content;
  },

  // 提交做题记录到 API
  async submitRecord(record) {
    const url = CONFIG.api.records;
    if (!url) {
      console.warn('未配置记录API');
      return;
    }
    console.log('提交记录到:', url, record);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (!resp.ok) {
        console.warn('提交失败:', await resp.text());
      } else {
        console.log('提交成功');
      }
    } catch (e) {
      console.warn('提交记录失败:', e);
    }
  }
};
