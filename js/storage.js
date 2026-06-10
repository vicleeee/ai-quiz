// storage.js - 本地存储管理
const Storage = {
  // 班级数据缓存
  getClasses() {
    try { return JSON.parse(localStorage.getItem('ai_quiz_classes') || '{}'); }
    catch { return {}; }
  },
  setClasses(data) {
    localStorage.setItem('ai_quiz_classes', JSON.stringify(data));
  },

  // 当前选择的班级
  getLastClass() { return localStorage.getItem('ai_quiz_last_class') || ''; },
  setLastClass(c) { localStorage.setItem('ai_quiz_last_class', c); },

  // 当前选择的学生
  getLastStudent() { return localStorage.getItem('ai_quiz_last_student') || ''; },
  setLastStudent(s) { localStorage.setItem('ai_quiz_last_student', s); },

  // 知识点预设
  getKnowledgePresets() {
    try { return JSON.parse(localStorage.getItem('ai_quiz_kp') || '[]'); }
    catch { return []; }
  },
  addKnowledgePreset(k) {
    const list = this.getKnowledgePresets();
    if (!list.includes(k)) { list.unshift(k); if (list.length > 20) list.pop(); }
    localStorage.setItem('ai_quiz_kp', JSON.stringify(list));
  },

  // 教师密码
  getTeacherPassword() { return localStorage.getItem('ai_quiz_tp') || 'admin123'; },
  setTeacherPassword(p) { localStorage.setItem('ai_quiz_tp', p); }
};
