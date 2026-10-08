// app.js - Study Buddy Modern Redesign & Feature-Rich Engine

// Utility: HTML Escaper
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Utility: Clean placeholder brackets e.g. "[Cell Biology]" -> "Cell Biology"
function cleanBrackets(str) {
  if (!str) return '';
  return String(str).replace(/^\[(.*)\]$/, '$1').trim();
}

// Utility: Extract the first fenced JSON code block or parse direct JSON
function extractJsonFromText(text) {
  if (!text) return null;
  try {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonString = codeBlockMatch ? codeBlockMatch[1] : text.trim();
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

class StudyBuddyApp {
  constructor() {
    this.data = {
      courses: [],
      settings: {
        darkMode: false,
        geminiApiKey: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        personalization: {
          depth: 'standard',
          examples: 'medium',
          rigor: 'light',
          readTime: 10,
          difficulty: 'Intermediate',
          citation: 'minimal',
          flashcardsCount: 15
        }
      },
      stats: {
        streak: 0,
        lastActiveDate: null
      },
      currentView: 'dashboard',
      currentCourse: null,
      currentTopic: null,
      currentContent: null
    };

    this.currentQuiz = null;
    this.currentFlashcards = [];
    this.currentFlashcardIndex = 0;
    this.quizMasteryThreshold = 70;

    // Pomodoro Timer State
    this.pomodoro = {
      timeLeft: 25 * 60,
      initialTime: 25 * 60,
      mode: 'work', // 'work' | 'shortBreak' | 'longBreak'
      running: false,
      intervalId: null,
      sessionsCompleted: 0
    };

    // Text-to-Speech State
    this.isSpeaking = false;

    this.init();
  }

  init() {
    this.loadData();
    this.migrateDataSchema();
    this.checkAndUpdateStreak();
    this.applyDarkMode(this.data.settings.darkMode);
    this.setupEventListeners();
    this.updateDashboard();
    this.initPomodoroUI();
    this.showView('dashboard');
  }

  // --- Persistence ---
  saveData(showToast = true) {
    try {
      localStorage.setItem('studyBuddyData', JSON.stringify(this.data));
      if (showToast) this.showToast('Saved successfully', 'success');
    } catch (error) {
      this.showToast('Failed to save data', 'error');
    }
  }

  migrateDataSchema() {
    try {
      for (const course of this.data.courses || []) {
        for (const topic of course.topics || []) {
          const slots = topic.contentSlots || {};
          for (const key of Object.keys(slots)) {
            const slot = slots[key] || {};
            if (typeof slot.completed !== 'boolean') slot.completed = false;
            if (key === 'quiz') {
              if (!Array.isArray(slot.attempts)) slot.attempts = [];
              if (typeof slot.bestScore !== 'number') slot.bestScore = 0;
            }
            if (key === 'flashcards') {
              if (!slot.srs) slot.srs = { cards: {} };
            }
          }
        }
      }
    } catch (e) {
      console.warn('Schema migration skipped:', e);
    }

    this.data.settings = this.data.settings || {};
    this.data.settings.geminiApiKey = this.data.settings.geminiApiKey || '';
    this.data.settings.personalization = this.data.settings.personalization || {};
    const pp = this.data.settings.personalization;
    if (!pp.depth) pp.depth = 'standard';
    if (!pp.examples) pp.examples = 'medium';
    if (!pp.rigor) pp.rigor = 'light';
    if (typeof pp.readTime !== 'number') pp.readTime = 10;
    if (!pp.difficulty) pp.difficulty = 'Intermediate';
    if (!pp.citation) pp.citation = 'minimal';
    if (typeof pp.flashcardsCount !== 'number') pp.flashcardsCount = 15;

    this.data.stats = this.data.stats || { streak: 0, lastActiveDate: null };
  }

  loadData() {
    try {
      const saved = localStorage.getItem('studyBuddyData');
      if (saved) {
        const loadedData = JSON.parse(saved);
        this.data = { ...this.data, ...loadedData };
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  // --- Streak Tracking ---
  _today() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  checkAndUpdateStreak() {
    const today = this._today();
    const last = this.data.stats.lastActiveDate;

    if (!last) {
      this.data.stats.streak = 1;
      this.data.stats.lastActiveDate = today;
      this.saveData(false);
      return;
    }

    if (last === today) return;

    const yesterday = this._addDays(-1);
    if (last === yesterday) {
      this.data.stats.streak += 1;
    } else {
      this.data.stats.streak = 1;
    }
    this.data.stats.lastActiveDate = today;
    this.saveData(false);
  }

  recordActivity() {
    this.checkAndUpdateStreak();
    this.updateDashboard();
  }

  // --- Audio Chimes ---
  playAudioChime(type = 'complete') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'complete') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24); // G5
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else if (type === 'alert') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch (e) {
      // Audio context not allowed or unsupported
    }
  }

  // --- Dark Mode ---
  applyDarkMode(isDark) {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }

    const toggle = document.getElementById('dark-mode-toggle');
    if (toggle) toggle.checked = !!isDark;

    const ind = document.getElementById('dark-mode-indicator');
    if (ind) ind.textContent = isDark ? 'Dark Mode' : 'Light Mode';
  }

  toggleDarkMode() {
    this.data.settings.darkMode = !this.data.settings.darkMode;
    this.applyDarkMode(this.data.settings.darkMode);
    this.saveData(false);
    this.showToast(this.data.settings.darkMode ? 'Dark mode enabled' : 'Light mode enabled');
  }

  // --- View Navigation ---
  showView(viewName) {
    document.querySelectorAll('.view-content').forEach(view => {
      view.classList.add('hidden');
    });

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
      targetView.classList.remove('hidden');
      this.data.currentView = viewName;
    }

    this.updateHeader(viewName);
    this.updateNav(viewName);

    if (viewName === 'dashboard') {
      this.updateDashboard();
    } else if (viewName === 'prompts') {
      this.updatePromptsView();
    } else if (viewName === 'settings') {
      this.syncPreferencesUI();
    }

    // Stop speaking if leaving content view
    if (viewName !== 'content' && this.isSpeaking) {
      this.stopTTS();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateHeader(viewName) {
    const backBtn = document.getElementById('back-btn');
    const headerTitle = document.getElementById('header-title');
    const headerSubtitle = document.getElementById('header-subtitle');

    switch (viewName) {
      case 'dashboard':
        backBtn.classList.add('hidden');
        headerTitle.textContent = 'Study Buddy';
        headerSubtitle.textContent = 'Your AI Study Companion';
        break;
      case 'course':
        backBtn.classList.remove('hidden');
        headerTitle.textContent = cleanBrackets(this.data.currentCourse?.name || 'Course');
        headerSubtitle.textContent = cleanBrackets(this.data.currentCourse?.code || '');
        break;
      case 'topic':
        backBtn.classList.remove('hidden');
        headerTitle.textContent = cleanBrackets(this.data.currentTopic?.name || 'Topic');
        headerSubtitle.textContent = cleanBrackets(this.data.currentCourse?.name || '');
        break;
      case 'content':
        backBtn.classList.remove('hidden');
        headerTitle.textContent = this.getContentTypeTitle(this.data.currentContent?.type);
        headerSubtitle.textContent = cleanBrackets(this.data.currentTopic?.name || '');
        break;
      case 'quiz':
        backBtn.classList.remove('hidden');
        headerTitle.textContent = 'Topic Quiz';
        headerSubtitle.textContent = cleanBrackets(this.data.currentTopic?.name || '');
        break;
      case 'flashcards':
        backBtn.classList.remove('hidden');
        headerTitle.textContent = 'Flashcards';
        headerSubtitle.textContent = cleanBrackets(this.data.currentTopic?.name || '');
        break;
      case 'settings':
        backBtn.classList.remove('hidden');
        headerTitle.textContent = 'Settings';
        headerSubtitle.textContent = 'Preferences & API';
        break;
      case 'prompts':
        backBtn.classList.remove('hidden');
        headerTitle.textContent = 'Prompts Library';
        headerSubtitle.textContent = 'Copy study prompts';
        break;
      default:
        backBtn.classList.add('hidden');
        headerTitle.textContent = 'Study Buddy';
        headerSubtitle.textContent = '';
    }
  }

  updateNav(viewName) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const targetView = btn.dataset.view;
      const isActive = (targetView === viewName) ||
        (targetView === 'dashboard' && ['course', 'topic', 'content', 'quiz', 'flashcards'].includes(viewName));

      if (isActive) {
        btn.classList.add('active', 'text-primary-600', 'dark:text-primary-400');
        btn.classList.remove('text-gray-500', 'dark:text-gray-400');
      } else {
        btn.classList.remove('active', 'text-primary-600', 'dark:text-primary-400');
        btn.classList.add('text-gray-500', 'dark:text-gray-400');
      }
    });
  }

  handleBackNavigation() {
    switch (this.data.currentView) {
      case 'course':
        this.showView('dashboard');
        break;
      case 'topic':
        this.showView('course');
        break;
      case 'content':
      case 'quiz':
      case 'flashcards':
        this.showView('topic');
        break;
      case 'settings':
      case 'prompts':
        this.showView('dashboard');
        break;
      default:
        this.showView('dashboard');
    }
  }

  // --- Pomodoro Timer ---
  initPomodoroUI() {
    this.updatePomodoroDisplay();
  }

  setPomodoroMode(mode) {
    if (this.pomodoro.running) this.pausePomodoro();
    this.pomodoro.mode = mode;

    if (mode === 'work') {
      this.pomodoro.initialTime = 25 * 60;
    } else if (mode === 'shortBreak') {
      this.pomodoro.initialTime = 5 * 60;
    } else if (mode === 'longBreak') {
      this.pomodoro.initialTime = 15 * 60;
    }
    this.pomodoro.timeLeft = this.pomodoro.initialTime;

    ['work', 'shortBreak', 'longBreak'].forEach(m => {
      const btn = document.getElementById(`pomo-mode-${m}`);
      if (!btn) return;
      if (m === mode) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm transition-all';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all';
      }
    });

    this.updatePomodoroDisplay();
  }

  togglePomodoro() {
    if (this.pomodoro.running) {
      this.pausePomodoro();
    } else {
      this.startPomodoro();
    }
  }

  startPomodoro() {
    if (this.pomodoro.running) return;
    this.pomodoro.running = true;
    const btn = document.getElementById('pomo-toggle-btn');
    if (btn) btn.innerHTML = `<span>⏸</span><span>Pause</span>`;

    this.pomodoro.intervalId = setInterval(() => {
      this.pomodoro.timeLeft--;
      this.updatePomodoroDisplay();

      if (this.pomodoro.timeLeft <= 0) {
        this.completePomodoroSession();
      }
    }, 1000);
  }

  pausePomodoro() {
    this.pomodoro.running = false;
    clearInterval(this.pomodoro.intervalId);
    const btn = document.getElementById('pomo-toggle-btn');
    if (btn) btn.innerHTML = `<span>▶</span><span>Start</span>`;
  }

  resetPomodoro() {
    this.pausePomodoro();
    this.pomodoro.timeLeft = this.pomodoro.initialTime;
    this.updatePomodoroDisplay();
  }

  completePomodoroSession() {
    this.pausePomodoro();
    this.playAudioChime('alert');

    if (this.pomodoro.mode === 'work') {
      this.pomodoro.sessionsCompleted++;
      this.recordActivity();
      this.showToast('Work session completed! Take a break 🎉', 'success');
      const countEl = document.getElementById('pomo-session-count');
      if (countEl) countEl.textContent = this.pomodoro.sessionsCompleted;

      if (this.pomodoro.sessionsCompleted % 4 === 0) {
        this.setPomodoroMode('longBreak');
      } else {
        this.setPomodoroMode('shortBreak');
      }
    } else {
      this.showToast('Break finished! Ready to focus?', 'info');
      this.setPomodoroMode('work');
    }
  }

  updatePomodoroDisplay() {
    const min = Math.floor(this.pomodoro.timeLeft / 60);
    const sec = this.pomodoro.timeLeft % 60;
    const display = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    const timerEl = document.getElementById('pomo-timer-display');
    if (timerEl) timerEl.textContent = display;

    const ring = document.getElementById('pomo-progress-ring');
    if (ring) {
      const circumference = 2 * Math.PI * 44; // r=44 => ~276.46
      const fraction = 1 - (this.pomodoro.timeLeft / this.pomodoro.initialTime);
      ring.style.strokeDashoffset = circumference * fraction;
    }
  }

  // --- Text to Speech (TTS) ---
  toggleTTS() {
    if (this.isSpeaking) {
      this.stopTTS();
    } else {
      this.startTTS();
    }
  }

  startTTS() {
    if (!('speechSynthesis' in window)) {
      this.showToast('Speech synthesis not supported by this browser', 'error');
      return;
    }

    const contentEl = document.getElementById('content-display');
    if (!contentEl) return;
    const text = contentEl.innerText || contentEl.textContent;
    if (!text || !text.trim()) {
      this.showToast('No readable text found', 'error');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      this.isSpeaking = true;
      const ttsBtn = document.getElementById('content-tts-btn');
      if (ttsBtn) {
        ttsBtn.classList.add('bg-primary-500', 'text-white');
        ttsBtn.classList.remove('bg-gray-100', 'dark:bg-gray-800', 'text-gray-700', 'dark:text-gray-300');
        ttsBtn.title = 'Stop reading aloud';
      }
    };

    utterance.onend = utterance.onerror = () => {
      this.stopTTS();
    };

    window.speechSynthesis.speak(utterance);
  }

  stopTTS() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    const ttsBtn = document.getElementById('content-tts-btn');
    if (ttsBtn) {
      ttsBtn.classList.remove('bg-primary-500', 'text-white');
      ttsBtn.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-700', 'dark:text-gray-300');
      ttsBtn.title = 'Read aloud (TTS)';
    }
  }

  // --- Preferences & Settings ---
  syncPreferencesUI() {
    const pp = this.data.settings.personalization || {};
    const el = (id) => document.getElementById(id);

    const depthEl = el('pref-depth');
    const exEl = el('pref-examples');
    const rigEl = el('pref-rigor');
    const readEl = el('pref-read-time');
    const diffEl = el('pref-difficulty');
    const citEl = el('pref-citation');
    const fcEl = el('pref-flashcards-count');
    const apiEl = el('pref-gemini-key');

    if (depthEl) depthEl.value = pp.depth || 'standard';
    if (exEl) exEl.value = pp.examples || 'medium';
    if (rigEl) rigEl.value = pp.rigor || 'light';
    if (readEl) readEl.value = pp.readTime ?? 10;
    if (diffEl) diffEl.value = pp.difficulty || 'Intermediate';
    if (citEl) citEl.value = pp.citation || 'minimal';
    if (fcEl) fcEl.value = pp.flashcardsCount ?? 15;
    if (apiEl) apiEl.value = this.data.settings.geminiApiKey || '';

    const darkToggle = el('dark-mode-toggle');
    if (darkToggle) darkToggle.checked = !!this.data.settings.darkMode;
  }

  savePreferencesFromUI() {
    const el = (id) => document.getElementById(id);

    const apiKeyVal = el('pref-gemini-key')?.value?.trim() || '';
    this.data.settings.geminiApiKey = apiKeyVal;

    this.data.settings.personalization = {
      depth: el('pref-depth')?.value || 'standard',
      examples: el('pref-examples')?.value || 'medium',
      rigor: el('pref-rigor')?.value || 'light',
      readTime: parseInt(el('pref-read-time')?.value || '10', 10),
      difficulty: el('pref-difficulty')?.value || 'Intermediate',
      citation: el('pref-citation')?.value || 'minimal',
      flashcardsCount: parseInt(el('pref-flashcards-count')?.value || '15', 10)
    };

    this.saveData(true);
    this.showToast('Preferences saved!');
  }

  resetPreferences() {
    this.data.settings.personalization = {
      depth: 'standard',
      examples: 'medium',
      rigor: 'light',
      readTime: 10,
      difficulty: 'Intermediate',
      citation: 'minimal',
      flashcardsCount: 15
    };
    this.syncPreferencesUI();
    this.saveData(true);
    this.showToast('Preferences reset to default');
  }

  // --- Gemini 1-Click Generation ---
  async callGeminiApi(promptText) {
    const apiKey = this.data.settings.geminiApiKey?.trim();
    if (!apiKey) {
      throw new Error('NO_API_KEY');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [{ text: promptText }]
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) throw new Error('No content returned from Gemini');
    return candidate;
  }

  async runAiGenerateCurrentTopic(type) {
    const apiKey = this.data.settings.geminiApiKey?.trim();
    if (!apiKey) {
      this.showToast('Add your Gemini API key in Settings first!', 'error');
      this.showView('settings');
      return;
    }

    const topic = this.data.currentTopic;
    if (!topic) {
      this.showToast('Select a topic first', 'error');
      return;
    }

    this.showLoading('Generating with Gemini AI...');
    try {
      const prompt = this.getContentPrompt(type, topic);
      const rawRes = await this.callGeminiApi(prompt);
      const parsed = extractJsonFromText(rawRes);

      if (!parsed) {
        throw new Error('Could not parse JSON response from Gemini');
      }

      this.saveContentFromPaste(type, parsed);
      this.hideLoading();
      this.showToast(`${this.getContentTypeTitle(type)} generated!`, 'success');

      if (type === 'quiz') {
        this.startQuiz();
      } else if (type === 'flashcards') {
        this.startFlashcards();
      } else {
        this.viewContent(type);
      }
    } catch (err) {
      this.hideLoading();
      if (err.message === 'NO_API_KEY') {
        this.showToast('API key missing. Open Settings to set it.', 'error');
      } else {
        this.showToast(`AI generation failed: ${err.message}`, 'error');
      }
    }
  }

  // --- Prompts View ---
  updatePromptsView() {
    const list = document.getElementById('prompts-list');
    if (!list) return;

    const topic = this.data.currentTopic || { name: 'Cellular Respiration', id: 'sample_topic', difficulty: 'Intermediate' };

    const promptItems = [
      {
        id: 'structure',
        title: 'Course Structure Prompt',
        desc: 'Extract units, topics, and difficulty from course outline/syllabus',
        prompt: this.getStructurePrompt()
      },
      {
        id: 'core',
        title: 'Core Concepts Prompt',
        desc: `Generate in-depth explanations & breakdowns for "${escapeHtml(topic.name)}"`,
        prompt: this.getContentPrompt('core', topic)
      },
      {
        id: 'examples',
        title: 'Real-world Examples Prompt',
        desc: `Generate practical applications & case studies for "${escapeHtml(topic.name)}"`,
        prompt: this.getContentPrompt('examples', topic)
      },
      {
        id: 'quiz',
        title: 'Quiz Generator Prompt',
        desc: `Create 10 multi-format MCQs & challenge questions for "${escapeHtml(topic.name)}"`,
        prompt: this.getContentPrompt('quiz', topic)
      },
      {
        id: 'flashcards',
        title: 'Flashcards Prompt',
        desc: `Create interactive Leitner SRS flashcards for "${escapeHtml(topic.name)}"`,
        prompt: this.getContentPrompt('flashcards', topic)
      },
      {
        id: 'cheatsheet',
        title: 'Quick Cheatsheet Prompt',
        desc: `Create a high-yield summary table & mnemonics for "${escapeHtml(topic.name)}"`,
        prompt: this.getContentPrompt('cheatsheet', topic)
      }
    ];

    list.innerHTML = promptItems.map(p => `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
        <div class="flex items-start justify-between">
          <div>
            <h4 class="font-bold text-gray-900 dark:text-gray-100 text-sm">${p.title}</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${p.desc}</p>
          </div>
          <button onclick="copyPrompt('${p.id}')"
            class="px-3 py-1.5 bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/60 dark:hover:bg-primary-900/60 text-primary-600 dark:text-primary-400 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors">
            <span>📋</span><span>Copy</span>
          </button>
        </div>
        <div class="bg-gray-50 dark:bg-gray-900/80 p-3 rounded-xl border border-gray-100 dark:border-gray-800 max-h-36 overflow-y-auto font-mono text-[11px] text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
${escapeHtml(p.prompt.slice(0, 300))}...
        </div>
      </div>
    `).join('');
  }

  // --- Prompts Generation Logic ---
  getStructurePrompt() {
    return `Generate a comprehensive study structure for the following course material. Return strictly valid JSON inside a \`\`\`json\`\`\` code fence.

SCHEMA REQUIREMENTS:
{
  "courseName": "string",
  "courseCode": "string (optional)",
  "description": "string",
  "topics": [
    {
      "id": "topic_1",
      "name": "string",
      "description": "string",
      "estimatedHours": number,
      "difficulty": "Beginner" | "Intermediate" | "Advanced"
    }
  ]
}

Ensure topics follow a logical pedagogical progression. Do not include extra text outside the JSON code block.`;
  }

  getContentPrompt(type, topic) {
    const pp = this.data.settings.personalization || {};
    const depth = pp.depth || 'standard';
    const examples = pp.examples || 'medium';
    const rigor = pp.rigor || 'light';
    const readTime = pp.readTime ?? 10;
    const diff = topic.difficulty || pp.difficulty || 'Intermediate';
    const fcCount = pp.flashcardsCount ?? 15;

    const basePrompt = `You are a high-level academic tutor. Generate study content for:
Topic: "${topic.name}"
Target Difficulty: ${diff}
Depth Level: ${depth}
Target Read Time: ${readTime} minutes
Example Density: ${examples}
Mathematical/Conceptual Rigor: ${rigor}

Return ONLY valid JSON matching the exact schema inside a \`\`\`json\`\`\` block.`;

    switch (type) {
      case 'core':
        return `${basePrompt}

SCHEMA:
{
  "topicId": "${topic.id}",
  "type": "core",
  "title": "${topic.name}: Core Concepts",
  "readTimeMinutes": ${readTime},
  "sections": [
    {
      "heading": "string",
      "content": "Detailed markdown explanation with bold key terms",
      "keyTakeaways": ["string", "string"]
    }
  ],
  "commonMisconceptions": [
    {
      "misconception": "string",
      "reality": "string"
    }
  ]
}`;

      case 'examples':
        return `${basePrompt}

SCHEMA:
{
  "topicId": "${topic.id}",
  "type": "examples",
  "title": "${topic.name}: Real-World Examples & Applications",
  "examples": [
    {
      "title": "string",
      "scenario": "string",
      "walkthrough": "Step-by-step breakdown",
      "takeaway": "string"
    }
  ]
}`;

      case 'quiz':
        return `${basePrompt}

SCHEMA:
{
  "topicId": "${topic.id}",
  "type": "quiz",
  "title": "${topic.name} Mastery Quiz",
  "questions": [
    {
      "id": "q1",
      "question": "string",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Detailed explanation of why this answer is correct and others are wrong"
    }
  ]
}
Generate 5 to 10 high-quality conceptual and application questions.`;

      case 'flashcards':
        return `${basePrompt}

SCHEMA:
{
  "topicId": "${topic.id}",
  "type": "flashcards",
  "title": "${topic.name} Key Flashcards",
  "cards": [
    {
      "id": "card_1",
      "front": "Question or prompt",
      "back": "Concise, precise answer",
      "hint": "Optional hint string"
    }
  ]
}
Generate exactly ${fcCount} cards.`;

      case 'cheatsheet':
        return `${basePrompt}

SCHEMA:
{
  "topicId": "${topic.id}",
  "type": "cheatsheet",
  "title": "${topic.name} Quick Cheatsheet",
  "keyFormulasOrDefinitions": [
    { "term": "string", "definition": "string" }
  ],
  "summaryTable": {
    "headers": ["Concept", "Key Rule", "Application"],
    "rows": [
      ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"]
    ]
  },
  "mnemonics": ["string"]
}`;

      default:
        return basePrompt;
    }
  }

  // --- Dashboard Rendering ---
  updateDashboard() {
    this.renderStats();
    this.renderCourseList();
  }

  renderStats() {
    const totalCourses = this.data.courses.length;
    let totalTopics = 0;
    let completedTopics = 0;
    let totalStudyMinutes = 0;

    for (const course of this.data.courses) {
      for (const topic of course.topics || []) {
        totalTopics++;
        const slots = Object.values(topic.contentSlots || {});
        const hasCompletedSlot = slots.some(s => s && s.completed);
        if (hasCompletedSlot) completedTopics++;

        slots.forEach(slot => {
          if (slot && slot.completed) {
            totalStudyMinutes += slot.readTimeMinutes || 10;
          }
        });
      }
    }

    const streakEl = document.getElementById('stat-streak');
    if (streakEl) streakEl.textContent = this.data.stats.streak || 1;

    const coursesEl = document.getElementById('stat-courses');
    if (coursesEl) coursesEl.textContent = totalCourses;

    const topicsEl = document.getElementById('stat-completed-topics');
    if (topicsEl) topicsEl.textContent = `${completedTopics}/${totalTopics}`;

    const hoursEl = document.getElementById('stat-hours');
    if (hoursEl) hoursEl.textContent = (totalStudyMinutes / 60).toFixed(1);

    const overallPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
    const progressEl = document.getElementById('overall-progress-bar');
    if (progressEl) progressEl.style.width = `${overallPct}%`;

    const progressPctText = document.getElementById('overall-progress-pct');
    if (progressPctText) progressPctText.textContent = `${overallPct}%`;
  }

  renderCourseList() {
    const container = document.getElementById('courses-list');
    const emptyState = document.getElementById('empty-courses-state');
    if (!container) return;

    if (!this.data.courses.length) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    const searchInput = document.getElementById('course-search-input');
    const query = (searchInput?.value || '').toLowerCase().trim();

    const filtered = this.data.courses.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.code && c.code.toLowerCase().includes(query))
    );

    if (!filtered.length) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          No courses matching "${escapeHtml(query)}"
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(course => {
      const topics = course.topics || [];
      const completedCount = topics.filter(t => {
        const slots = Object.values(t.contentSlots || {});
        return slots.some(s => s && s.completed);
      }).length;
      const pct = topics.length ? Math.round((completedCount / topics.length) * 100) : 0;

      return `
        <div onclick="window.app.openCourse('${course.id}')"
          class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all cursor-pointer flex flex-col justify-between">
          <div class="flex items-start justify-between">
            <div class="space-y-1">
              <div class="flex items-center space-x-2">
                ${course.code ? `<span class="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 text-xs font-semibold rounded-md">${escapeHtml(cleanBrackets(course.code))}</span>` : ''}
                <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">${topics.length} topics</span>
              </div>
              <h3 class="font-bold text-gray-900 dark:text-gray-100 text-base leading-snug">${escapeHtml(cleanBrackets(course.name))}</h3>
              ${course.description ? `<p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">${escapeHtml(cleanBrackets(course.description))}</p>` : ''}
            </div>
            <button onclick="event.stopPropagation(); window.app.deleteCourse('${course.id}')"
              class="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Delete Course">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>

          <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60">
            <div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1.5">
              <span>Progress</span>
              <span class="font-semibold text-primary-600 dark:text-primary-400">${pct}%</span>
            </div>
            <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div class="bg-primary-500 h-2 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Course View ---
  openCourse(courseId) {
    const course = this.data.courses.find(c => c.id === courseId);
    if (!course) return;

    this.data.currentCourse = course;
    this.renderCourseView();
    this.showView('course');
  }

  renderCourseView() {
    const course = this.data.currentCourse;
    if (!course) return;

    const nameEl = document.getElementById('course-detail-name');
    const descEl = document.getElementById('course-detail-desc');
    const topicsList = document.getElementById('course-topics-list');

    if (nameEl) nameEl.textContent = cleanBrackets(course.name);
    if (descEl) descEl.textContent = cleanBrackets(course.description || 'No description provided.');

    const topics = course.topics || [];
    if (!topics.length) {
      topicsList.innerHTML = `
        <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <p class="text-gray-500 dark:text-gray-400 text-sm mb-4">No topics in this course yet.</p>
          <button onclick="window.app.openPasteModal('structure')"
            class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium text-xs rounded-xl shadow transition-all">
            Import Topics Outline
          </button>
        </div>
      `;
      return;
    }

    topicsList.innerHTML = topics.map((topic, index) => {
      const slots = topic.contentSlots || {};
      const completedCount = Object.values(slots).filter(s => s && s.completed).length;
      const totalSlots = 5; // core, examples, quiz, flashcards, cheatsheet
      const pct = Math.round((completedCount / totalSlots) * 100);

      const diffBadge = topic.difficulty ? `
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${
          topic.difficulty === 'Beginner' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' :
          topic.difficulty === 'Advanced' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' :
          'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
        }">${escapeHtml(topic.difficulty)}</span>` : '';

      return `
        <div onclick="window.app.openTopic('${topic.id}')"
          class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-500 shadow-sm transition-all cursor-pointer space-y-3">
          <div class="flex items-start justify-between">
            <div class="space-y-1 flex-1 pr-2">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-bold text-gray-400">#${index + 1}</span>
                ${diffBadge}
              </div>
              <h4 class="font-bold text-gray-900 dark:text-gray-100 text-sm leading-snug">${escapeHtml(cleanBrackets(topic.name))}</h4>
              ${topic.description ? `<p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">${escapeHtml(cleanBrackets(topic.description))}</p>` : ''}
            </div>
            <div class="text-right flex flex-col items-end">
              <span class="text-xs font-semibold text-primary-600 dark:text-primary-400">${completedCount}/${totalSlots}</span>
              <span class="text-[10px] text-gray-400">slots</span>
            </div>
          </div>

          <div class="flex items-center space-x-1.5 pt-1">
            ${['core', 'examples', 'quiz', 'flashcards', 'cheatsheet'].map(type => {
              const hasContent = !!slots[type];
              const isComp = !!slots[type]?.completed;
              return `
                <div title="${this.getContentTypeTitle(type)}: ${isComp ? 'Completed' : (hasContent ? 'In Progress' : 'Empty')}"
                  class="flex-1 h-1.5 rounded-full ${
                    isComp ? 'bg-green-500' : (hasContent ? 'bg-primary-400' : 'bg-gray-200 dark:bg-gray-700')
                  }"></div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Topic View ---
  openTopic(topicId) {
    const course = this.data.currentCourse;
    if (!course) return;

    const topic = (course.topics || []).find(t => t.id === topicId);
    if (!topic) return;

    this.data.currentTopic = topic;
    this.renderTopicView();
    this.showView('topic');
  }

  renderTopicView() {
    const topic = this.data.currentTopic;
    if (!topic) return;

    const titleEl = document.getElementById('topic-detail-title');
    const descEl = document.getElementById('topic-detail-desc');
    const diffEl = document.getElementById('topic-detail-diff');

    if (titleEl) titleEl.textContent = cleanBrackets(topic.name);
    if (descEl) descEl.textContent = cleanBrackets(topic.description || 'Master this topic across all 5 learning modules.');
    if (diffEl) {
      diffEl.textContent = topic.difficulty || 'Intermediate';
      diffEl.className = `px-2 py-0.5 rounded text-xs font-semibold ${
        topic.difficulty === 'Beginner' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' :
        topic.difficulty === 'Advanced' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' :
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
      }`;
    }

    const slots = topic.contentSlots || {};
    const slotTypes = [
      { key: 'core', name: 'Core Concepts', icon: '📖', desc: 'In-depth conceptual guide & takeaways' },
      { key: 'examples', name: 'Real-World Examples', icon: '🌍', desc: 'Case studies, applications & walkthroughs' },
      { key: 'quiz', name: 'Mastery Quiz', icon: '❓', desc: 'Practice test & score evaluation' },
      { key: 'flashcards', name: 'Flashcards', icon: '🗂️', desc: 'Spaced repetition Leitner flashcards' },
      { key: 'cheatsheet', name: 'Cheatsheet & Summary', icon: '⚡', desc: 'High-yield table & mnemonics' }
    ];

    const container = document.getElementById('topic-slots-list');
    if (!container) return;

    container.innerHTML = slotTypes.map(s => {
      const data = slots[s.key];
      const hasData = !!data;
      const isCompleted = !!data?.completed;

      let scoreBadge = '';
      if (s.key === 'quiz' && data?.bestScore !== undefined && data.bestScore > 0) {
        scoreBadge = `<span class="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded text-xs font-bold">Best: ${data.bestScore}%</span>`;
      }

      return `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between transition-all">
          <div class="flex items-center space-x-3.5 flex-1 pr-2">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
              isCompleted ? 'bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400' :
              (hasData ? 'bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400')
            }">
              ${isCompleted ? '✓' : s.icon}
            </div>
            <div class="space-y-0.5">
              <div class="flex items-center space-x-2">
                <h4 class="font-bold text-gray-900 dark:text-gray-100 text-sm">${s.name}</h4>
                ${scoreBadge}
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">${s.desc}</p>
            </div>
          </div>

          <div class="flex items-center space-x-2">
            ${hasData ? `
              <button onclick="window.app.launchSlot('${s.key}')"
                class="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors">
                ${s.key === 'quiz' ? 'Take Quiz' : (s.key === 'flashcards' ? 'Practice' : 'Study')}
              </button>
            ` : `
              <div class="flex items-center space-x-1.5">
                <button onclick="window.app.openPasteModal('${s.key}')"
                  class="px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium transition-colors" title="Paste JSON">
                  📥 Paste
                </button>
                <button onclick="window.app.runAiGenerateCurrentTopic('${s.key}')"
                  class="px-2.5 py-1.5 bg-primary-50 dark:bg-primary-950/70 hover:bg-primary-100 text-primary-600 dark:text-primary-400 rounded-xl text-xs font-semibold border border-primary-200 dark:border-primary-800 transition-colors" title="Generate with Gemini">
                  ✨ AI
                </button>
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  launchSlot(type) {
    if (type === 'quiz') {
      this.startQuiz();
    } else if (type === 'flashcards') {
      this.startFlashcards();
    } else {
      this.viewContent(type);
    }
  }

  // --- Content Viewer ---
  viewContent(type) {
    const topic = this.data.currentTopic;
    if (!topic) return;

    const content = topic.contentSlots?.[type];
    if (!content) return;

    this.data.currentContent = { type, data: content };
    this.renderContentView();
    this.showView('content');
  }

  renderContentView() {
    const { type, data } = this.data.currentContent || {};
    const container = document.getElementById('content-display');
    const completeBtn = document.getElementById('complete-content-btn');

    if (!container || !data) return;

    let html = '';

    if (type === 'core') {
      html += `
        <div class="space-y-6">
          <div class="border-b border-gray-100 dark:border-gray-800 pb-3">
            <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">${escapeHtml(cleanBrackets(data.title || 'Core Concepts'))}</h2>
            ${data.readTimeMinutes ? `<span class="text-xs text-gray-500 dark:text-gray-400">⏱ ${data.readTimeMinutes} min read</span>` : ''}
          </div>
      `;

      if (Array.isArray(data.sections)) {
        html += data.sections.map(sec => `
          <div class="space-y-3">
            <h3 class="text-base font-bold text-primary-600 dark:text-primary-400">${escapeHtml(cleanBrackets(sec.heading))}</h3>
            <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-2">
              ${this.renderMarkdown(sec.content)}
            </div>
            ${Array.isArray(sec.keyTakeaways) && sec.keyTakeaways.length ? `
              <div class="bg-primary-50/60 dark:bg-primary-950/30 border-l-4 border-primary-500 p-3 rounded-r-xl">
                <p class="text-xs font-bold text-primary-700 dark:text-primary-300 mb-1">Key Takeaways:</p>
                <ul class="list-disc list-inside text-xs text-gray-700 dark:text-gray-300 space-y-1">
                  ${sec.keyTakeaways.map(t => `<li>${escapeHtml(cleanBrackets(t))}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        `).join('');
      }

      if (Array.isArray(data.commonMisconceptions) && data.commonMisconceptions.length) {
        html += `
          <div class="mt-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl space-y-3">
            <h4 class="text-sm font-bold text-amber-800 dark:text-amber-300">⚠️ Common Misconceptions</h4>
            <div class="space-y-2">
              ${data.commonMisconceptions.map(m => `
                <div class="text-xs space-y-0.5">
                  <p class="font-semibold text-red-600 dark:text-red-400">❌ Myth: ${escapeHtml(cleanBrackets(m.misconception))}</p>
                  <p class="text-gray-700 dark:text-gray-300">✅ Reality: ${escapeHtml(cleanBrackets(m.reality))}</p>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      html += `</div>`;
    } else if (type === 'examples') {
      html += `
        <div class="space-y-6">
          <div class="border-b border-gray-100 dark:border-gray-800 pb-3">
            <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">${escapeHtml(cleanBrackets(data.title || 'Real-World Examples'))}</h2>
          </div>
      `;

      if (Array.isArray(data.examples)) {
        html += data.examples.map((ex, i) => `
          <div class="bg-gray-50 dark:bg-gray-800/80 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 space-y-3">
            <div class="flex items-center space-x-2">
              <span class="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400 text-xs font-bold flex items-center justify-center">${i + 1}</span>
              <h3 class="font-bold text-sm text-gray-900 dark:text-gray-100">${escapeHtml(cleanBrackets(ex.title))}</h3>
            </div>
            ${ex.scenario ? `
              <div class="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                <span class="font-semibold text-gray-800 dark:text-gray-200">Scenario:</span> ${escapeHtml(cleanBrackets(ex.scenario))}
              </div>
            ` : ''}
            ${ex.walkthrough ? `
              <div class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                ${this.renderMarkdown(ex.walkthrough)}
              </div>
            ` : ''}
            ${ex.takeaway ? `
              <div class="text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 p-2.5 rounded-lg">
                💡 Takeaway: ${escapeHtml(cleanBrackets(ex.takeaway))}
              </div>
            ` : ''}
          </div>
        `).join('');
      }

      html += `</div>`;
    } else if (type === 'cheatsheet') {
      html += `
        <div class="space-y-6">
          <div class="border-b border-gray-100 dark:border-gray-800 pb-3">
            <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">${escapeHtml(cleanBrackets(data.title || 'Quick Cheatsheet'))}</h2>
          </div>
      `;

      if (Array.isArray(data.keyFormulasOrDefinitions) && data.keyFormulasOrDefinitions.length) {
        html += `
          <div class="space-y-3">
            <h3 class="text-sm font-bold text-primary-600 dark:text-primary-400">Key Terms & Definitions</h3>
            <div class="grid grid-cols-1 gap-2">
              ${data.keyFormulasOrDefinitions.map(item => `
                <div class="bg-gray-50 dark:bg-gray-800/80 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                  <span class="font-bold text-xs text-gray-900 dark:text-gray-100">${escapeHtml(cleanBrackets(item.term))}:</span>
                  <span class="text-xs text-gray-600 dark:text-gray-300 ml-1">${escapeHtml(cleanBrackets(item.definition))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      if (data.summaryTable && Array.isArray(data.summaryTable.headers) && Array.isArray(data.summaryTable.rows)) {
        html += `
          <div class="space-y-3">
            <h3 class="text-sm font-bold text-primary-600 dark:text-primary-400">Summary Matrix</h3>
            <div class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table class="w-full text-left text-xs">
                <thead class="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 font-semibold">
                  <tr>
                    ${data.summaryTable.headers.map(h => `<th class="p-2.5">${escapeHtml(cleanBrackets(h))}</th>`).join('')}
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  ${data.summaryTable.rows.map(row => `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      ${row.map(c => `<td class="p-2.5 text-gray-700 dark:text-gray-300">${escapeHtml(cleanBrackets(c))}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      if (Array.isArray(data.mnemonics) && data.mnemonics.length) {
        html += `
          <div class="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-2xl space-y-2">
            <h4 class="text-xs font-bold text-purple-800 dark:text-purple-300">🧠 Memory Tricks & Mnemonics</h4>
            <ul class="list-disc list-inside text-xs text-gray-700 dark:text-gray-300 space-y-1">
              ${data.mnemonics.map(m => `<li>${escapeHtml(cleanBrackets(m))}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      html += `</div>`;
    }

    container.innerHTML = html;

    if (completeBtn) {
      if (data.completed) {
        completeBtn.textContent = 'Completed ✓';
        completeBtn.className = 'w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm shadow transition-all cursor-default';
      } else {
        completeBtn.textContent = 'Mark Module as Completed';
        completeBtn.className = 'w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-sm shadow-md transition-all';
      }
    }
  }

  renderMarkdown(text) {
    if (!text) return '';
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }

  markCurrentContentComplete() {
    if (!this.data.currentContent || !this.data.currentTopic) return;
    const { type, data } = this.data.currentContent;

    data.completed = true;
    this.recordActivity();
    this.playAudioChime('complete');
    this.saveData(false);
    this.showToast('Module completed! Keep going 🚀', 'success');
    this.renderContentView();
  }

  // --- Quiz System ---
  startQuiz() {
    const topic = this.data.currentTopic;
    if (!topic || !topic.contentSlots?.quiz) return;

    const quizData = topic.contentSlots.quiz;
    const questions = quizData.questions || [];

    if (!questions.length) {
      this.showToast('Quiz contains no questions', 'error');
      return;
    }

    this.currentQuiz = {
      questions,
      currentIndex: 0,
      userAnswers: new Array(questions.length).fill(null),
      submitted: false,
      score: 0
    };

    this.showView('quiz');
    this.renderQuizQuestion();
  }

  renderQuizQuestion() {
    const qState = this.currentQuiz;
    if (!qState) return;

    const q = qState.questions[qState.currentIndex];
    const container = document.getElementById('quiz-container');
    const resultsContainer = document.getElementById('quiz-results');

    if (!container) return;

    if (resultsContainer) resultsContainer.classList.add('hidden');
    container.classList.remove('hidden');

    const total = qState.questions.length;
    const currentNum = qState.currentIndex + 1;
    const pct = Math.round((currentNum / total) * 100);

    const progressEl = document.getElementById('quiz-progress-bar');
    if (progressEl) progressEl.style.width = `${pct}%`;

    const progressText = document.getElementById('quiz-question-number');
    if (progressText) progressText.textContent = `Question ${currentNum} of ${total}`;

    const selectedIdx = qState.userAnswers[qState.currentIndex];

    let optionsHtml = '';
    (q.options || []).forEach((opt, idx) => {
      const isSelected = selectedIdx === idx;
      optionsHtml += `
        <button onclick="window.app.selectQuizAnswer(${idx})"
          class="w-full text-left p-3.5 rounded-xl border text-sm font-medium transition-all ${
            isSelected
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/30'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750'
          }">
          <div class="flex items-center space-x-3">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isSelected ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
            }">${String.fromCharCode(65 + idx)}</span>
            <span class="flex-1">${escapeHtml(cleanBrackets(opt))}</span>
          </div>
        </button>
      `;
    });

    container.innerHTML = `
      <div class="space-y-4">
        <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 leading-snug">${escapeHtml(cleanBrackets(q.question))}</h3>
        <div class="space-y-2.5">
          ${optionsHtml}
        </div>
      </div>
    `;

    const prevBtn = document.getElementById('quiz-prev-btn');
    const nextBtn = document.getElementById('quiz-next-btn');

    if (prevBtn) {
      prevBtn.disabled = qState.currentIndex === 0;
      prevBtn.className = `px-4 py-2 rounded-xl text-xs font-semibold ${
        qState.currentIndex === 0 ? 'opacity-40 cursor-not-allowed bg-gray-200 dark:bg-gray-700 text-gray-500' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-800 dark:text-gray-200'
      }`;
    }

    if (nextBtn) {
      const isLast = qState.currentIndex === total - 1;
      nextBtn.textContent = isLast ? 'Submit Quiz' : 'Next Question';
      nextBtn.onclick = () => isLast ? this.submitQuiz() : this.nextQuizQuestion();
    }
  }

  selectQuizAnswer(idx) {
    if (!this.currentQuiz) return;
    this.currentQuiz.userAnswers[this.currentQuiz.currentIndex] = idx;
    this.renderQuizQuestion();
  }

  prevQuizQuestion() {
    if (!this.currentQuiz || this.currentQuiz.currentIndex === 0) return;
    this.currentQuiz.currentIndex--;
    this.renderQuizQuestion();
  }

  nextQuizQuestion() {
    if (!this.currentQuiz) return;
    const total = this.currentQuiz.questions.length;
    if (this.currentQuiz.currentIndex < total - 1) {
      this.currentQuiz.currentIndex++;
      this.renderQuizQuestion();
    }
  }

  submitQuiz() {
    const qState = this.currentQuiz;
    if (!qState) return;

    let correctCount = 0;
    qState.questions.forEach((q, idx) => {
      if (qState.userAnswers[idx] === q.correctIndex) {
        correctCount++;
      }
    });

    const scorePct = Math.round((correctCount / qState.questions.length) * 100);
    qState.score = scorePct;
    qState.submitted = true;

    // Record slot score
    const slot = this.data.currentTopic?.contentSlots?.quiz;
    if (slot) {
      if (!Array.isArray(slot.attempts)) slot.attempts = [];
      slot.attempts.push({ date: this._today(), score: scorePct });
      slot.bestScore = Math.max(slot.bestScore || 0, scorePct);

      if (scorePct >= this.quizMasteryThreshold) {
        slot.completed = true;
      }
      this.saveData(false);
    }

    this.recordActivity();
    if (scorePct >= this.quizMasteryThreshold) {
      this.playAudioChime('complete');
    }

    this.renderQuizResults(scorePct, correctCount, qState.questions.length);
  }

  renderQuizResults(scorePct, correctCount, total) {
    const container = document.getElementById('quiz-container');
    const resultsContainer = document.getElementById('quiz-results');
    const controls = document.getElementById('quiz-controls');

    if (container) container.classList.add('hidden');
    if (controls) controls.classList.add('hidden');
    if (!resultsContainer) return;

    resultsContainer.classList.remove('hidden');

    const passed = scorePct >= this.quizMasteryThreshold;

    let reviewHtml = '';
    this.currentQuiz.questions.forEach((q, idx) => {
      const userAns = this.currentQuiz.userAnswers[idx];
      const isCorrect = userAns === q.correctIndex;

      reviewHtml += `
        <div class="p-3.5 rounded-xl border text-xs space-y-2 ${
          isCorrect ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800/60' : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800/60'
        }">
          <div class="flex items-start space-x-2">
            <span>${isCorrect ? '✅' : '❌'}</span>
            <div class="flex-1 space-y-1">
              <p class="font-bold text-gray-900 dark:text-gray-100">${escapeHtml(cleanBrackets(q.question))}</p>
              <p class="text-gray-600 dark:text-gray-400">Your answer: <span class="font-semibold ${isCorrect ? 'text-green-600' : 'text-red-500'}">${escapeHtml(cleanBrackets(q.options[userAns] || 'None'))}</span></p>
              ${!isCorrect ? `<p class="text-green-600 dark:text-green-400 font-semibold">Correct: ${escapeHtml(cleanBrackets(q.options[q.correctIndex]))}</p>` : ''}
              ${q.explanation ? `<p class="text-gray-500 dark:text-gray-400 text-[11px] pt-1 border-t border-gray-200 dark:border-gray-700">${escapeHtml(cleanBrackets(q.explanation))}</p>` : ''}
            </div>
          </div>
        </div>
      `;
    });

    resultsContainer.innerHTML = `
      <div class="space-y-6">
        <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-2">
          <div class="text-4xl">${passed ? '🎉' : '📚'}</div>
          <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">${passed ? 'Great Job!' : 'Keep Practicing!'}</h3>
          <p class="text-3xl font-extrabold ${passed ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}">${scorePct}%</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">${correctCount} of ${total} questions correct</p>
          ${passed ? `<p class="text-xs font-semibold text-green-600 dark:text-green-400">Mastery criterion reached! Slot marked complete.</p>` : `<p class="text-xs text-gray-500">Score 70% or higher to complete this slot.</p>`}

          <div class="flex items-center justify-center space-x-3 pt-3">
            <button onclick="window.app.startQuiz()"
              class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow transition-all">
              Retake Quiz
            </button>
            <button onclick="window.app.showView('topic')"
              class="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium transition-all">
              Back to Topic
            </button>
          </div>
        </div>

        <div class="space-y-3">
          <h4 class="font-bold text-sm text-gray-900 dark:text-gray-100">Review Questions</h4>
          <div class="space-y-2.5">
            ${reviewHtml}
          </div>
        </div>
      </div>
    `;
  }

  // --- Flashcards (Leitner SRS + 3D Flip) ---
  startFlashcards() {
    const topic = this.data.currentTopic;
    if (!topic || !topic.contentSlots?.flashcards) return;

    const fcData = topic.contentSlots.flashcards;
    const cards = fcData.cards || [];

    if (!cards.length) {
      this.showToast('No cards in flashcard deck', 'error');
      return;
    }

    if (!fcData.srs) fcData.srs = { cards: {} };

    this.currentFlashcards = cards;
    this.currentFlashcardIndex = 0;

    this.showView('flashcards');
    this.renderCurrentFlashcard();
  }

  renderCurrentFlashcard() {
    const cards = this.currentFlashcards;
    if (!cards.length) return;

    const card = cards[this.currentFlashcardIndex];
    const total = cards.length;
    const currentNum = this.currentFlashcardIndex + 1;

    const topic = this.data.currentTopic;
    const srsData = topic?.contentSlots?.flashcards?.srs?.cards?.[card.id] || { box: 1 };

    const counter = document.getElementById('fc-counter');
    if (counter) counter.textContent = `${currentNum} / ${total}`;

    const boxBadge = document.getElementById('fc-srs-box');
    if (boxBadge) boxBadge.textContent = `Box ${srsData.box || 1}`;

    const frontEl = document.getElementById('fc-front-text');
    const backEl = document.getElementById('fc-back-text');
    const hintEl = document.getElementById('fc-hint-text');

    if (frontEl) frontEl.textContent = cleanBrackets(card.front);
    if (backEl) backEl.textContent = cleanBrackets(card.back);
    if (hintEl) {
      hintEl.textContent = card.hint ? `💡 Hint: ${cleanBrackets(card.hint)}` : '';
    }

    // Reset card flip to front
    const inner = document.getElementById('fc-card-inner');
    if (inner) {
      inner.classList.remove('rotate-y-180');
    }
  }

  flipFlashcard() {
    const inner = document.getElementById('fc-card-inner');
    if (inner) {
      inner.classList.toggle('rotate-y-180');
    }
  }

  rateFlashcard(level) {
    const cards = this.currentFlashcards;
    if (!cards.length) return;

    const card = cards[this.currentFlashcardIndex];
    const topic = this.data.currentTopic;
    const fcSlot = topic?.contentSlots?.flashcards;

    if (fcSlot) {
      if (!fcSlot.srs) fcSlot.srs = { cards: {} };
      const currentBox = fcSlot.srs.cards[card.id]?.box || 1;

      let nextBox = currentBox;
      if (level === 'easy') nextBox = Math.min(5, currentBox + 1);
      else if (level === 'hard') nextBox = Math.max(1, currentBox - 1);

      fcSlot.srs.cards[card.id] = {
        box: nextBox,
        lastReviewed: this._today()
      };

      // If at end of deck, mark completed
      if (this.currentFlashcardIndex === cards.length - 1) {
        fcSlot.completed = true;
        this.playAudioChime('complete');
        this.showToast('Flashcard deck completed! 🎉', 'success');
      }

      this.saveData(false);
    }

    this.recordActivity();

    // Advance
    if (this.currentFlashcardIndex < cards.length - 1) {
      this.currentFlashcardIndex++;
      this.renderCurrentFlashcard();
    } else {
      this.renderCurrentFlashcard();
    }
  }

  prevFlashcard() {
    if (this.currentFlashcardIndex > 0) {
      this.currentFlashcardIndex--;
      this.renderCurrentFlashcard();
    }
  }

  nextFlashcard() {
    if (this.currentFlashcardIndex < this.currentFlashcards.length - 1) {
      this.currentFlashcardIndex++;
      this.renderCurrentFlashcard();
    }
  }

  // --- Exporting (Anki TSV / Markdown) ---
  exportAnkiDeck() {
    const topic = this.data.currentTopic;
    const cards = topic?.contentSlots?.flashcards?.cards || [];

    if (!cards.length) {
      this.showToast('No flashcards available to export', 'error');
      return;
    }

    const tsvContent = cards.map(c => {
      const front = (c.front || '').replace(/\t/g, ' ').replace(/\n/g, '<br>');
      const back = (c.back || '').replace(/\t/g, ' ').replace(/\n/g, '<br>');
      return `${front}\t${back}`;
    }).join('\n');

    this.downloadFile(tsvContent, `${topic.name || 'flashcards'}_anki.txt`, 'text/tab-separated-values');
    this.showToast('Anki deck exported (TSV format)!', 'success');
  }

  exportCurrentContentMarkdown() {
    const { type, data } = this.data.currentContent || {};
    const topic = this.data.currentTopic;

    if (!data || !topic) {
      this.showToast('No active content to export', 'error');
      return;
    }

    let md = `# ${topic.name}: ${this.getContentTypeTitle(type)}\n\n`;

    if (type === 'core') {
      (data.sections || []).forEach(s => {
        md += `## ${s.heading}\n\n${s.content}\n\n`;
        if (s.keyTakeaways?.length) {
          md += `**Key Takeaways:**\n` + s.keyTakeaways.map(t => `- ${t}`).join('\n') + `\n\n`;
        }
      });
    } else if (type === 'examples') {
      (data.examples || []).forEach(ex => {
        md += `## ${ex.title}\n\n**Scenario:** ${ex.scenario}\n\n${ex.walkthrough}\n\n**Takeaway:** ${ex.takeaway}\n\n`;
      });
    } else if (type === 'cheatsheet') {
      md += `## Key Definitions\n\n`;
      (data.keyFormulasOrDefinitions || []).forEach(d => {
        md += `- **${d.term}**: ${d.definition}\n`;
      });
      md += `\n`;
    }

    this.downloadFile(md, `${topic.name || 'study'}_notes.md`, 'text/markdown');
    this.showToast('Markdown exported!', 'success');
  }

  // --- Modal & Paste Handling ---
  openPasteModal(type) {
    const modal = document.getElementById('paste-modal');
    const title = document.getElementById('paste-modal-title');
    const typeInput = document.getElementById('paste-modal-type');
    const textarea = document.getElementById('paste-modal-textarea');

    if (!modal) return;

    if (typeInput) typeInput.value = type;
    if (textarea) textarea.value = '';

    if (title) {
      if (type === 'structure') {
        title.textContent = 'Import Course Outline (JSON)';
      } else {
        title.textContent = `Import ${this.getContentTypeTitle(type)} (JSON)`;
      }
    }

    modal.classList.remove('hidden');
    if (textarea) textarea.focus();
  }

  closePasteModal() {
    const modal = document.getElementById('paste-modal');
    if (modal) modal.classList.add('hidden');
  }

  handlePasteModalSubmit() {
    const typeInput = document.getElementById('paste-modal-type');
    const textarea = document.getElementById('paste-modal-textarea');

    if (!typeInput || !textarea) return;

    const type = typeInput.value;
    const rawText = textarea.value.trim();

    if (!rawText) {
      this.showToast('Please paste content first', 'error');
      return;
    }

    const parsed = extractJsonFromText(rawText);
    if (!parsed) {
      this.showToast('Invalid JSON. Please verify syntax', 'error');
      return;
    }

    if (type === 'structure') {
      this.saveStructureFromPaste(parsed);
    } else {
      this.saveContentFromPaste(type, parsed);
    }

    this.closePasteModal();
  }

  saveStructureFromPaste(data) {
        const course = this.data.currentCourse;
    if (!course) {
      this.showToast('No active course selected', 'error');
      return;
    }

    if (data.courseName) course.name = data.courseName;
    if (data.courseCode) course.code = data.courseCode;
    if (data.description) course.description = data.description;

    if (Array.isArray(data.topics) && data.topics.length) {
      const existingMap = new Map((course.topics || []).map(t => [t.id, t]));

      course.topics = data.topics.map((t, index) => {
        const id = t.id || `topic_${index + 1}`;
        const existing = existingMap.get(id);

        return {
          id,
          name: t.name || `Topic ${index + 1}`,
          description: t.description || '',
          estimatedHours: t.estimatedHours || 2,
          difficulty: t.difficulty || 'Intermediate',
          contentSlots: existing?.contentSlots || {
            core: null,
            examples: null,
            quiz: null,
            flashcards: null,
            cheatsheet: null
          }
        };
      });

      course.structureAnalyzed = true;
      this.saveData(true);
      this.recordActivity();
      this.renderCourseView();
      this.showToast('Course structure imported successfully!', 'success');
    } else {
      this.showToast('No valid topics array found in JSON', 'error');
    }
  }

  saveContentFromPaste(type, data) {
    const topic = this.data.currentTopic;
    if (!topic) {
      this.showToast('No active topic selected', 'error');
      return;
    }

    if (!topic.contentSlots) {
      topic.contentSlots = {
        core: null,
        examples: null,
        quiz: null,
        flashcards: null,
        cheatsheet: null
      };
    }

    data.completed = false;
    if (type === 'quiz') {
      data.attempts = [];
      data.bestScore = 0;
    } else if (type === 'flashcards') {
      data.srs = { cards: {} };
    }

    topic.contentSlots[type] = data;
    this.saveData(true);
    this.recordActivity();
    this.renderTopicView();
    this.showToast(`${this.getContentTypeTitle(type)} imported successfully!`, 'success');
  }

  // --- Course Creation & Deletion ---
  openCreateCourseModal() {
    const modal = document.getElementById('create-course-modal');
    if (modal) modal.classList.remove('hidden');
    const input = document.getElementById('new-course-name');
    if (input) {
      input.value = '';
      input.focus();
    }
    const code = document.getElementById('new-course-code');
    if (code) code.value = '';
    const desc = document.getElementById('new-course-desc');
    if (desc) desc.value = '';
  }

  closeCreateCourseModal() {
    const modal = document.getElementById('create-course-modal');
    if (modal) modal.classList.add('hidden');
  }

  handleCreateCourseSubmit() {
    const nameEl = document.getElementById('new-course-name');
    const codeEl = document.getElementById('new-course-code');
    const descEl = document.getElementById('new-course-desc');

    const name = nameEl?.value?.trim();
    if (!name) {
      this.showToast('Please enter a course title', 'error');
      return;
    }

    const newCourse = {
      id: `course_${Date.now()}`,
      name,
      code: codeEl?.value?.trim() || '',
      description: descEl?.value?.trim() || '',
      structureAnalyzed: false,
      topics: []
    };

    this.data.courses.push(newCourse);
    this.saveData(false);
    this.recordActivity();
    this.closeCreateCourseModal();
    this.openCourse(newCourse.id);
    this.showToast('Course created! Now import or add topics.', 'success');
  }

  deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course and all its study materials?')) return;

    this.data.courses = this.data.courses.filter(c => c.id !== courseId);
    this.saveData(false);
    this.updateDashboard();
    this.showToast('Course deleted', 'info');

    if (this.data.currentCourse?.id === courseId) {
      this.showView('dashboard');
    }
  }

  // --- Export & Import Entire Workspace ---
  exportAllData() {
    const jsonStr = JSON.stringify(this.data, null, 2);
    this.downloadFile(jsonStr, `study_buddy_backup_${this._today()}.json`, 'application/json');
    this.showToast('All data exported successfully!', 'success');
  }

  triggerImportData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (imported && Array.isArray(imported.courses)) {
            this.data = imported;
            this.migrateDataSchema();
            this.saveData(false);
            this.applyDarkMode(this.data.settings.darkMode);
            this.updateDashboard();
            this.showToast('Data imported successfully!', 'success');
          } else {
            this.showToast('Invalid backup file structure', 'error');
          }
        } catch (err) {
          this.showToast('Failed to parse JSON file', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  downloadFile(content, fileName, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // --- Toast & UI Feedback ---
  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl transition-all duration-300 z-50 ${
      type === 'success' ? 'bg-green-600 text-white' :
      type === 'error' ? 'bg-red-600 text-white' :
      type === 'info' ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' :
      'bg-primary-600 text-white'
    }`;

    toast.classList.remove('hidden', 'opacity-0', 'translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2800);
  }

  showLoading(text = 'Loading...') {
    const modal = document.getElementById('loading-modal');
    const textEl = document.getElementById('loading-text');
    if (modal) {
      if (textEl) textEl.textContent = text;
      modal.classList.remove('hidden');
    }
  }

  hideLoading() {
    const modal = document.getElementById('loading-modal');
    if (modal) modal.classList.add('hidden');
  }

  getContentTypeTitle(type) {
    switch (type) {
      case 'core': return 'Core Concepts';
      case 'examples': return 'Real-World Examples';
      case 'quiz': return 'Topic Quiz';
      case 'flashcards': return 'Flashcards';
      case 'cheatsheet': return 'Quick Cheatsheet';
      default: return 'Study Module';
    }
  }

  // --- Global Event Listeners ---
  setupEventListeners() {
    // Top bar back button
    document.getElementById('back-btn')?.addEventListener('click', () => {
      this.handleBackNavigation();
    });

    // Dark mode toggle in Settings
    document.getElementById('dark-mode-toggle')?.addEventListener('change', (e) => {
      this.applyDarkMode(e.target.checked);
      this.data.settings.darkMode = e.target.checked;
      this.saveData(false);
    });

    // Navigation buttons in bottom dock
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) this.showView(view);
      });
    });

    // Course search input
    document.getElementById('course-search-input')?.addEventListener('input', () => {
      this.renderCourseList();
    });

    // Paste modal submit
    document.getElementById('paste-modal-submit')?.addEventListener('click', () => {
      this.handlePasteModalSubmit();
    });

    // Complete current content button
    document.getElementById('complete-content-btn')?.addEventListener('click', () => {
      this.markCurrentContentComplete();
    });

    // Content TTS button
    document.getElementById('content-tts-btn')?.addEventListener('click', () => {
      this.toggleTTS();
    });

    // Content Export Markdown button
    document.getElementById('content-export-btn')?.addEventListener('click', () => {
      this.exportCurrentContentMarkdown();
    });

    // Quiz controls
    document.getElementById('quiz-prev-btn')?.addEventListener('click', () => {
      this.prevQuizQuestion();
    });

    // Settings save & reset
    document.getElementById('save-preferences-btn')?.addEventListener('click', () => {
      this.savePreferencesFromUI();
    });
    document.getElementById('reset-preferences-btn')?.addEventListener('click', () => {
      this.resetPreferences();
    });

    // Settings export & import data
    document.getElementById('export-data-btn')?.addEventListener('click', () => {
      this.exportAllData();
    });
    document.getElementById('import-data-btn')?.addEventListener('click', () => {
      this.triggerImportData();
    });

    // Flashcard interaction listeners
    document.getElementById('fc-card')?.addEventListener('click', () => {
      this.flipFlashcard();
    });
    document.getElementById('fc-rate-easy')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rateFlashcard('easy');
    });
    document.getElementById('fc-rate-good')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rateFlashcard('good');
    });
    document.getElementById('fc-rate-hard')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rateFlashcard('hard');
    });
    document.getElementById('fc-prev-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.prevFlashcard();
    });
    document.getElementById('fc-next-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.nextFlashcard();
    });
    document.getElementById('fc-export-anki-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportAnkiDeck();
    });

    // Pomodoro timer buttons
    document.getElementById('pomo-toggle-btn')?.addEventListener('click', () => {
      this.togglePomodoro();
    });
    document.getElementById('pomo-reset-btn')?.addEventListener('click', () => {
      this.resetPomodoro();
    });
    document.getElementById('pomo-mode-work')?.addEventListener('click', () => {
      this.setPomodoroMode('work');
    });
    document.getElementById('pomo-mode-shortBreak')?.addEventListener('click', () => {
      this.setPomodoroMode('shortBreak');
    });
    document.getElementById('pomo-mode-longBreak')?.addEventListener('click', () => {
      this.setPomodoroMode('longBreak');
    });

    // Keyboard navigation shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (this.data.currentView === 'flashcards') {
        if (e.code === 'Space') {
          e.preventDefault();
          this.flipFlashcard();
        } else if (e.code === 'ArrowLeft') {
          this.prevFlashcard();
        } else if (e.code === 'ArrowRight') {
          this.nextFlashcard();
        } else if (e.key === '1') {
          this.rateFlashcard('hard');
        } else if (e.key === '2') {
          this.rateFlashcard('good');
        } else if (e.key === '3') {
          this.rateFlashcard('easy');
        }
      }
    });
  }
}

// Global bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.app = new StudyBuddyApp();
});

// Helper global methods for direct inline onclick events
function showView(viewName) {
  if (window.app) window.app.showView(viewName);
}

function openCreateCourseModal() {
  if (window.app) window.app.openCreateCourseModal();
}

function closeCreateCourseModal() {
  if (window.app) window.app.closeCreateCourseModal();
}

function submitCreateCourse() {
  if (window.app) window.app.handleCreateCourseSubmit();
}

function closePasteModal() {
  if (window.app) window.app.closePasteModal();
}

function copyPrompt(type) {
  if (!window.app) return;
  const topic = window.app.data.currentTopic || { name: 'Selected Topic', id: 'topic_id', difficulty: 'Medium' };
  const prompt = type === 'structure' ? window.app.getStructurePrompt() : window.app.getContentPrompt(type, topic);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(prompt)
      .then(() => window.app.showToast('Prompt copied to clipboard!', 'success'))
      .catch(() => fallbackCopyPrompt(prompt));
  } else {
    fallbackCopyPrompt(prompt);
  }
}

function fallbackCopyPrompt(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  window.app.showToast('Prompt copied to clipboard!', 'success');
}
