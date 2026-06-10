// sound.js - 音效管理
const Sound = {
  success: null,
  fail: null,
  enabled: true,

  init() {
    this.success = new Audio('sounds/success.mp3');
    this.fail = new Audio('sounds/fail.mp3');
    this.success.volume = 0.6;
    this.fail.volume = 0.6;
    // 从 localStorage 读取音效开关
    const v = localStorage.getItem('ai_quiz_sound');
    if (v !== null) this.enabled = v === '1';
  },

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('ai_quiz_sound', this.enabled ? '1' : '0');
    return this.enabled;
  },

  playSuccess() {
    if (!this.enabled || !this.success) return;
    this.success.currentTime = 0;
    this.success.play().catch(() => {});
  },

  playFail() {
    if (!this.enabled || !this.fail) return;
    this.fail.currentTime = 0;
    this.fail.play().catch(() => {});
  }
};
