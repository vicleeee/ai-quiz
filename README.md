# AI 智能答题系统 - 技术文档

## 项目概述
这是一个基于 AI 生成题目的小学英语答题系统，包含学生端和教师端。学生可在线答题、查看排行榜，教师可查看学生数据、错题汇总和 AI 学情诊断。

**在线地址**：https://lxl.bella.press/aiquiz-new/index.html

## 技术栈
- **前端**：原生 HTML/CSS/JavaScript（无框架）
- **AI 模型**：LongCat-2.0-Preview（OpenAI 兼容 API）
- **数据存储**：QuickForm.cn（表单 API，存储班级、学生、做题记录）
- **部署**：腾讯云 COS（对象存储，静态网站托管）
- **CORS 处理**：直连 API（已移除代理设置）

## 文件结构
```
ai-quiz/
├── index.html              # 学生端主页面
├── teacher.html            # 教师后台
├── api.json                # API 端点配置（学生/记录 API）
├── css/
│   ├── common.css          # 公共样式（导航、容器、卡片、按钮等）
│   ├── quiz.css            # 答题界面专用样式
│   └── teacher.css         # 教师后台专用样式
├── js/
│   ├── config.js           # 配置管理（AI 模型、API Key、本地存储）
│   ├── api.js              # 数据获取与 AI 接口（班级、记录、生成题目、诊断）
│   ├── storage.js          # 本地存储封装（班级、学生选择、知识点预设）
│   ├── sound.js            # 音效管理（正确/错误提示音）
│   ├── student.js          # 学生端主逻辑（答题流程、排行榜、设置）
│   └── teacher.js          # 教师端逻辑（登录、数据统计、错题分析、诊断）
└── sounds/
    ├── success.mp3         # 答题正确音效
    └── fail.mp3            # 答题错误音效
```

## 核心模块说明

### 1. 配置层 (config.js)
- 管理 AI 模型设置（model、baseUrl、apiKey）
- 从 `api.json` 加载外部 API 地址（students、records）
- 本地存储用户设置（localStorage）

### 2. 数据接口层 (api.js)
- **fetchStudents()**：从 QuickForm 获取班级-学生列表
- **fetchRecords()**：获取所有做题记录
- **generateQuestions(knowledge, count)**：调用 AI 生成题目
  - 系统提示词要求返回 JSON 数组 `[["题目",["A","B","C","D"],"正确答案"]]`
  - 内置多级 JSON 解析容错（移除代码块、修复尾随逗号、控制字符转义）
- **diagnose(errors, studentName)**：AI 学情诊断（返回 Markdown）
- **submitRecord(record)**：提交做题记录到 QuickForm

### 3. 学生端逻辑 (student.js)
- **状态管理**：questions、currentIndex、correctCount、answers 等
- **预设知识点**：7 个小学英语知识点（形容词比较级、一般现在时、方位介词、一般过去时、现在进行时、一般将来时、名词单复数）
  - 点击 chip 自动填入优化提示词（如"小学英语形容词比较级，难度中等，题型为选择题，选项顺序随机排列"）
- **答题流程**：
  1. 选择班级 → 选择学生 → 输入/选择知识点
  2. 点击"开始答题" → 1 分钟倒计时（超时提示刷新）
  3. AI 生成题目 → 逐题作答（选项高亮、音效反馈）
  4. 结果页（正确率、答题时间、错题回顾）
- **排行榜**：按最高正确率排序，支持按班级筛选
- **设置**：可修改 AI 模型、API Key（已移除 CORS 代理设置）

### 4. 教师端逻辑 (teacher.js)
- **密码登录**：默认密码 `admin123`（输入框预填）
- **数据看板**：学生数、班级数、答题次数、平均正确率
- **时间筛选**：全部、今天、昨天、本周
- **班级筛选**：`t-filter-class` 下拉框（需更新 `state.currentClass`）
- **三个 Tab**：
  - **做题记录**：按学生汇总（最佳正确率、最近正确率、答题次数）
  - **易错题汇总**：班级高频错题（错误次数、常见错误答案）
  - **AI 学情诊断**：班级整体诊断（3 分钟倒计时，超时提示刷新）
- **模态框功能**：
  - 学生详情（查看错题、复制错题、AI 诊断）
  - AI 诊断结果（Markdown 渲染、复制、下载 Word）

### 5. 样式设计
- **设计 Token**：主色 `#5C4CEB`、背景 `#F5F6FA`、标题 `#3C2A8B`
- **响应式**：手机端 `max-width: 640px`，桌面端（≥1200px）`max-width: 80%`
- **组件**：导航栏、卡片、按钮、chip 标签、表单控件、模态框、进度条

## 数据流

### 学生答题
```
用户选择班级/学生/知识点
  → startQuiz()
  → API.generateQuestions()
  → AI 返回 JSON 题目数组
  → 逐题渲染作答
  → 提交记录 API.submitRecord()
  → 结果页展示
```

### 教师数据分析
```
教师登录
  → loadAllData()
  → API.fetchRecords()
  → 渲染统计、记录、错题
  → 点击"AI诊断"
  → API.diagnose()
  → 渲染 Markdown 结果
```

## 关键配置

### api.json
```json
{
  "students": "https://quickform.cn/api/1dpyoyyfcv",
  "records": "https://quickform.cn/api/6z5s0afyqw"
}
```

### 本地存储键名
- `ai_quiz_config`：AI 模型设置
- `ai_quiz_classes`：班级数据缓存
- `ai_quiz_last_class`：上次选择的班级
- `ai_quiz_last_student`：上次选择的学生
- `ai_quiz_knowledge_presets`：历史知识点（已停用，现为固定 7 项）

## 部署说明

### COS 部署命令
```bash
# 进入项目目录
cd /path/to/ai-quiz

# 上传单个文件
coscmd upload index.html ai-quiz/index.html

# 上传整个目录（递归）
coscmd upload -r css/ ai-quiz/css/
coscmd upload -r js/ ai-quiz/js/
coscmd upload -r sounds/ ai-quiz/sounds/
```

### 访问地址
- 学生端：https://lxl.bella.press/aiquiz-new/index.html
- 教师端：https://lxl.bella.press/aiquiz-new/teacher.html

## 注意事项

1. **CORS 问题**：已移除代理设置，依赖 API 服务器开启跨域支持
2. **AI 生成超时**：学生端 1 分钟、教师诊断 3 分钟倒计时，超时提示刷新
3. **JSON 解析**：api.js 内置多级容错，但 AI 返回格式不稳定时仍可能失败
4. **班级筛选**：教师端 `t-filter-class` change 事件需更新 `state.currentClass`
5. **知识点预设**：固定 7 项，不再保存用户输入历史
6. **音效文件**：需确保 sounds/ 目录下存在 success.mp3 和 fail.mp3

## 扩展建议

- **题目类型**：可扩展填空题、判断题
- **难度分级**：可在提示词中增加"小学低年级/高年级"参数
- **多学科**：修改预设知识点和提示词模板即可支持数学、语文等
- **数据可视化**：教师端可增加正确率趋势图、知识点掌握热力图
- **离线支持**：Service Worker 缓存静态资源，PWA 化
*（内容由AI生成，仅供参考）*
