// config.js - 配置管理
const CONFIG = {
  api: {
    students: '',
    records: '',
    model: 'LongCat-2.0-Preview',
    baseUrl: 'https://api.longcat.chat/openai',
    apiKey: 'ak_28V3t57aU2ME4ez0PA22e4P37XT6l',
    thinking: false,
    defaultQuestionCount: 10,
    proxyUrl: ''  // CORS 代理地址，留空则不使用代理
  },

  init() {
    const saved = localStorage.getItem('ai_quiz_config');
    if (saved) {
      try {
        const cfg = JSON.parse(saved);
        if (cfg.model) this.api.model = cfg.model;
        if (cfg.baseUrl) this.api.baseUrl = cfg.baseUrl;
        if (cfg.apiKey) this.api.apiKey = cfg.apiKey;
        if (cfg.thinking !== undefined) this.api.thinking = cfg.thinking;
        if (cfg.proxyUrl !== undefined) this.api.proxyUrl = cfg.proxyUrl;
      } catch (e) {}
    }
  },

  // 从 api.json 加载 students 和 records 的 API 地址
  async loadApiConfig() {
    try {
      const resp = await fetch('api.json?v=' + Date.now());
      const cfg = await resp.json();
      if (cfg.students) this.api.students = cfg.students;
      if (cfg.records) this.api.records = cfg.records;
    } catch (e) {
      console.warn('加载 api.json 失败', e);
    }
  },

  save() {
    localStorage.setItem('ai_quiz_config', JSON.stringify({
      model: this.api.model,
      baseUrl: this.api.baseUrl,
      apiKey: this.api.apiKey,
      thinking: this.api.thinking,
      proxyUrl: this.api.proxyUrl
    }));
  },

  setProxyUrl(url) { this.api.proxyUrl = url; this.save(); },
  setModel(model) { this.api.model = model; this.save(); },
  setBaseUrl(url) { this.api.baseUrl = url; this.save(); },
  setApiKey(key) { this.api.apiKey = key; this.save(); },
  setThinking(v) { this.api.thinking = v; this.save(); },

  // 构建 API 请求 URL
  apiUrl(path) {
    const base = this.api.baseUrl.replace(/\/+$/, '');
    if (base.endsWith('/openai')) return base + path;
    return base + '/v1' + path;
  }
};
