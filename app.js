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

// Utility: Web Audio API sound chime (no external audio files needed)
function playSoundChime(type = 'success') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    } else {
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc.frequency.exponentialRampToValueAtTime(523.25, ctx.currentTime + 0.15); // C5
    }

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // AudioContext blocked or not supported
  }
}

class StudyBuddyApp {
  constructor() {
    this.data = {
      courses: [],
      currentCourse: null,
      currentTopic: null,
      currentContent: null,
      settings: {
        darkMode: false,
        themeMode: 'auto', // 'auto' | 'dark' | 'light'
        apiKey: '',
        studyStreak: 0,
        lastStudyDate: null,
        focusMinutesTotal: 0,
        personalization: {
          depth: 'standard', // concise, standard, deep
          examples: 'medium', // few, medium, many
          rigor: 'standard', // light, standard, technical
          difficulty: 'Intermediate' // Beginner, Intermediate, Advanced
        }
      },
      currentView: 'dashboard'
    };

    this.currentQuiz = {
      questions: [],
      currentIndex: 0,
      userAnswers: [],
      score: 0,
      timer: null,
      seconds: 0,
      locked: false,
      isReviewMode: false
    };

    this.pomodoro = {
      timer: null,
      mode: 'work', // work, short, long
      timeLeft: 25 * 60,
      running: false
    };

    this.init();
  }

  init() {
    this.loadData();
    this.migrateDataSchema();
    this.initDarkModeState();
    this.checkAndUpdateStreak();
    this.setupEventListeners();
    this.updateDashboard();
    this.showView('dashboard');
  }

  // Theme Management (Automatic System Detection + User Preference in Settings)
  initDarkModeState() {
    if (!this.data.settings) this.data.settings = {};
    if (!this.data.settings.themeMode) {
      if (typeof this.data.settings.darkMode === 'boolean') {
        this.data.settings.themeMode = this.data.settings.darkMode ? 'dark' : 'light';
      } else {
        const stored = localStorage.getItem('theme');
        this.data.settings.themeMode = (stored === 'dark' || stored === 'light' || stored === 'auto') ? stored : 'auto';
      }
    }

    this.applyThemeMode(this.data.settings.themeMode);

    // Watch for OS system dark mode changes in real-time
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        if (this.data.settings.themeMode === 'auto') {
          this.applyThemeMode('auto');
        }
      };
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(listener);
      }
    }
  }

  applyThemeMode(mode) {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let isDark = prefersDark;

    if (mode === 'dark') {
      isDark = true;
    } else if (mode === 'light') {
      isDark = false;
    } else {
      mode = 'auto';
      isDark = prefersDark;
    }

    document.documentElement.classList.toggle('dark', isDark);
    this.data.settings.darkMode = isDark;
    this.data.settings.themeMode = mode;

    try {
      localStorage.setItem('theme', mode);
    } catch { }

    this.updateThemeSettingsUI();
  }

  setThemeMode(mode) {
    this.applyThemeMode(mode);
    this.saveData(false);
    const label = mode === 'auto' ? 'Automatic (System)' : (mode === 'dark' ? 'Dark Mode' : 'Light Mode');
    this.showToast(`Theme set to ${label}`, 'info');
  }

  updateThemeSettingsUI() {
    const select = document.getElementById('theme-mode-select');
    const desc = document.getElementById('theme-mode-desc');
    const mode = this.data.settings?.themeMode || 'auto';
    if (select) select.value = mode;
    if (desc) {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (mode === 'auto') {
        desc.textContent = `Automatic (currently ${prefersDark ? 'Dark' : 'Light'} from system)`;
      } else if (mode === 'dark') {
        desc.textContent = 'Always dark mode';
      } else {
        desc.textContent = 'Always light mode';
      }
    }
  }

  applyDarkMode(enabled) {
    this.applyThemeMode(enabled ? 'dark' : 'light');
  }

  toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    this.setThemeMode(isDark ? 'light' : 'dark');
  }

  // Storage
  saveData(showToast = true) {
    try {
      localStorage.setItem('studyBuddyData', JSON.stringify(this.data));
      if (showToast) this.showToast('Data saved successfully!', 'success');
    } catch (e) {
      this.showToast('Error saving data: ' + e.message, 'error');
    }
  }

  migrateDataSchema() {
    try {
      if (!Array.isArray(this.data.courses)) return;
      for (const course of this.data.courses) {
        if (!Array.isArray(course.topics)) continue;
        for (const topic of course.topics) {
          if (!topic.contentSlots) topic.contentSlots = {};
          const validKeys = ['summary', 'explainer', 'flashcards', 'quiz'];
          for (const k of validKeys) {
            if (!topic.contentSlots[k]) {
              topic.contentSlots[k] = { content: null, completed: false, lastStudied: null, srs: { cards: {} } };
            }
            const slot = topic.contentSlots[k];
            if (!slot.srs) slot.srs = { cards: {} };
          }
        }
      }
    } catch (e) {
      console.warn('Schema migration skipped:', e);
    }

    this.data.settings = this.data.settings || {};
    this.data.settings.personalization = this.data.settings.personalization || {};
    const pp = this.data.settings.personalization;
    if (!pp.depth) pp.depth = 'standard';
    if (!pp.examples) pp.examples = 'medium';
    if (!pp.rigor) pp.rigor = 'standard';
    if (!pp.difficulty) pp.difficulty = 'Intermediate';

    if (typeof this.data.settings.studyStreak !== 'number') this.data.settings.studyStreak = 0;
    if (typeof this.data.settings.focusMinutesTotal !== 'number') this.data.settings.focusMinutesTotal = 0;
  }

  loadData() {
    try {
      const data = localStorage.getItem('studyBuddyData');
      if (data) {
        this.data = { ...this.data, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error('Error loading data:', e);
      this.showToast('Error loading saved data', 'error');
    }
  }

  _today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  _addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  checkAndUpdateStreak() {
    const today = this._today();
    const last = this.data.settings.lastStudyDate;

    if (!last) return;

    const diffDays = Math.round((new Date(today) - new Date(last)) / (1000 * 60 * 60 * 24));
    if (diffDays > 1) {
      this.data.settings.studyStreak = 0;
      this.saveData(false);
    }

    this._updateStreakDisplay();
  }

  _updateStreakDisplay() {
    const streak = this.data.settings.studyStreak || 0;
    const badgeCount = document.getElementById('header-streak-count');
    const heroStreak = document.getElementById('study-streak');
    if (badgeCount) badgeCount.textContent = streak;
    if (heroStreak) heroStreak.textContent = streak;
  }

  recordActivity() {
    const today = this._today();
    const last = this.data.settings.lastStudyDate;

    if (last !== today) {
      const diff = last ? Math.round((new Date(today) - new Date(last)) / (1000 * 60 * 60 * 24)) : 1;
      if (diff === 1 || !last) {
        this.data.settings.studyStreak = (this.data.settings.studyStreak || 0) + 1;
      } else if (diff > 1) {
        this.data.settings.studyStreak = 1;
      }
      this.data.settings.lastStudyDate = today;
      this.saveData(false);
      this._updateStreakDisplay();
    }
  }

  _getDefaultPrefs() {
    return {
      depth: 'standard',
      examples: 'medium',
      rigor: 'standard',
      difficulty: 'Intermediate'
    };
  }

  syncPreferencesUI() {
    const prefs = this.data.settings?.personalization || this._getDefaultPrefs();
    const d = document.getElementById('pref-depth');
    const e = document.getElementById('pref-examples');
    const r = document.getElementById('pref-rigor');
    const diff = document.getElementById('pref-difficulty');

    if (d) d.value = prefs.depth;
    if (e) e.value = prefs.examples;
    if (r) r.value = prefs.rigor;
    if (diff) diff.value = prefs.difficulty;

    const keyInput = document.getElementById('gemini-api-key');
    if (keyInput) keyInput.value = this.data.settings.apiKey || '';

    this.updateThemeSettingsUI();
  }

  _initPreferenceControls() {
    const bindSelect = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', (ev) => {
        if (!this.data.settings.personalization) this.data.settings.personalization = this._getDefaultPrefs();
        this.data.settings.personalization[key] = ev.target.value;
        this.saveData(false);
        this.showToast(`Preference updated: ${key} = ${ev.target.value}`, 'info');
      });
    };

    bindSelect('pref-depth', 'depth');
    bindSelect('pref-examples', 'examples');
    bindSelect('pref-rigor', 'rigor');
    bindSelect('pref-difficulty', 'difficulty');

    // Theme Mode select listener
    const themeSelect = document.getElementById('theme-mode-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', (ev) => {
        this.setThemeMode(ev.target.value);
      });
    }

    // Direct Gemini API Key bind
    document.getElementById('save-api-key-btn')?.addEventListener('click', () => {
      const input = document.getElementById('gemini-api-key');
      if (!input) return;
      this.data.settings.apiKey = input.value.trim();
      this.saveData();
      this.showToast('API Key saved successfully', 'success');
    });

    document.getElementById('test-api-key-btn')?.addEventListener('click', async () => {
      const key = this.data.settings.apiKey;
      if (!key) {
        this.showToast('Please enter an API Key first', 'error');
        return;
      }
      this.showToast('Testing Gemini Connection...', 'info');
      try {
        const res = await this.callGeminiAPI('Respond with only the word: "OK"');
        if (res && res.includes('OK')) {
          this.showToast('Connected to Gemini successfully! ✨', 'success');
          playSoundChime('success');
        } else {
          this.showToast('Received response from Gemini!', 'info');
        }
      } catch (err) {
        this.showToast('API Key test failed: ' + err.message, 'error');
      }
    });
  }

  async callGeminiAPI(prompt) {
    const apiKey = this.data.settings.apiKey;
    if (!apiKey) {
      throw new Error('No API key configured. Enter your key in Settings or use manual prompts.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.4
        }
      })
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const msg = errorJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
      throw new Error(msg);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) throw new Error('Empty response returned by AI model.');
    return candidate;
  }

  setupEventListeners() {
    // Back Button
    document.getElementById('back-btn')?.addEventListener('click', () => this.goBack());

    // Course Creation
    document.getElementById('add-course-btn')?.addEventListener('click', () => this.showAddCourseModal());
    document.getElementById('add-course-form')?.addEventListener('submit', (e) => this.addCourse(e));
    document.getElementById('cancel-course-btn')?.addEventListener('click', () => this.hideAddCourseModal());

    // Search Filter
    document.getElementById('course-search-input')?.addEventListener('input', (e) => this.filterCourses(e.target.value));

    // Modals Backdrop Clicks & Escape key
    window.addEventListener('click', (e) => {
      if (e.target.id === 'add-course-modal') this.hideAddCourseModal();
      if (e.target.id === 'flashcards-modal') this.closeFlashcardsStudy();
      if (e.target.id === 'prompt-modal') this.hidePromptModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideAddCourseModal();
        this.hidePromptModal();
        this.closeFlashcardsStudy();
      }
    });

    // Structure Handling
    document.getElementById('ai-generate-structure-btn')?.addEventListener('click', () => this.autoGenerateStructureWithAI());
    document.getElementById('get-structure-prompt-btn')?.addEventListener('click', () => this.showStructurePrompt());
    document.getElementById('parse-structure-btn')?.addEventListener('click', () => this.parseStructureResponse());
    document.getElementById('cancel-structure-paste-btn')?.addEventListener('click', () => {
      document.getElementById('paste-structure-card').style.display = 'none';
      document.getElementById('structure-prompt-card').style.display = 'block';
    });

    // Content Handling
    document.getElementById('ai-generate-content-btn')?.addEventListener('click', () => this.autoGenerateContentWithAI());
    document.getElementById('get-content-prompt-btn')?.addEventListener('click', () => this.showContentPrompt());
    document.getElementById('save-content-btn')?.addEventListener('click', () => this.saveContent());
    document.getElementById('cancel-content-btn')?.addEventListener('click', () => this.cancelContentEdit());
    document.getElementById('edit-content-btn')?.addEventListener('click', () => this.editContent());
    document.getElementById('delete-content-btn')?.addEventListener('click', () => this.deleteContent());

    // Exports
    document.getElementById('export-course-md-btn')?.addEventListener('click', () => this.exportCourseMarkdown());
    document.getElementById('export-anki-topic-btn')?.addEventListener('click', () => this.exportAnkiTopic());

    // Audio TTS
    document.getElementById('tts-listen-btn')?.addEventListener('click', () => this.toggleTTS());

    // Prompts modal
    document.getElementById('close-prompt-modal')?.addEventListener('click', () => this.hidePromptModal());
    document.getElementById('copy-prompt-btn')?.addEventListener('click', () => this.copyPromptToClipboard());

    // Data controls
    document.getElementById('export-data-btn')?.addEventListener('click', () => this.exportData());
    document.getElementById('import-data-btn')?.addEventListener('click', () => this.importData());
    document.getElementById('import-file-input')?.addEventListener('change', (e) => this.handleImportFile(e));
    document.getElementById('clear-all-data-btn')?.addEventListener('click', () => this.clearAllData());

    // Bottom Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-nav');
        if (view) this.showView(view);
      });
    });

    // Pomodoro listeners
    this.setupPomodoroListeners();

    // Quiz listeners
    this.setupQuizEventListeners();
    this._initPreferenceControls();
  }

  // 1-Click AI Generation for Course Structure
  async autoGenerateStructureWithAI() {
    if (!this.data.currentCourse) return;
    const btn = document.getElementById('ai-generate-structure-btn');
    const oldText = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Generating Topics...</span>';

      const prompt = `${this.getStructurePrompt()}\n\nCourse Title: "${this.data.currentCourse.name}"\nCourse Description: "${this.data.currentCourse.description || ''}"\n\nPlease output the structured topics now:`;
      const response = await this.callGeminiAPI(prompt);

      const parsed = this.parseStructureText(response);
      if (!parsed || parsed.length === 0) {
        throw new Error('AI responded, but no topics could be parsed from the structure format.');
      }

      this.data.currentCourse.topics = parsed;
      this.saveData();
      this.loadTopics();
      playSoundChime('success');
      this.showToast(`Generated ${parsed.length} topics automatically! 🎉`, 'success');
    } catch (err) {
      this.showToast('1-Click AI failed: ' + err.message, 'error');
      // Fallback: switch to manual prompt view
      this.showStructurePrompt();
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  }

  // 1-Click AI Generation for Content Slot
  async autoGenerateContentWithAI() {
    const course = this.data.currentCourse;
    const topic = this.data.currentTopic;
    const slotType = this.data.currentContent?.type;
    if (!course || !topic || !slotType) return;

    const btn = document.getElementById('ai-generate-content-btn');
    const oldText = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Generating Content...</span>';

      const prompt = this.getContentPrompt(slotType, topic);
      const response = await this.callGeminiAPI(prompt);

      const input = document.getElementById('content-response');
      if (input) input.value = response;

      this.saveContent();
      playSoundChime('success');
      this.showToast('Content auto-generated & saved! ✨', 'success');
    } catch (err) {
      this.showToast('1-Click AI failed: ' + err.message, 'error');
      this.showContentPrompt();
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  }

  // Text-To-Speech Reader
  toggleTTS() {
    if (!('speechSynthesis' in window)) {
      this.showToast('Text-to-speech is not supported on this browser', 'error');
      return;
    }

    const ttsBtn = document.getElementById('tts-listen-btn');
    const ttsText = document.getElementById('tts-text');

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (ttsText) ttsText.textContent = 'Listen';
      ttsBtn?.classList.remove('bg-rose-100', 'text-rose-700', 'dark:bg-rose-950/40', 'dark:text-rose-300');
      return;
    }

    const contentDiv = document.getElementById('parsed-content');
    if (!contentDiv || !contentDiv.textContent.trim()) {
      this.showToast('No readable content available', 'info');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(contentDiv.textContent);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      if (ttsText) ttsText.textContent = 'Stop';
      ttsBtn?.classList.add('bg-rose-100', 'text-rose-700', 'dark:bg-rose-950/40', 'dark:text-rose-300');
    };

    utterance.onend = utterance.onerror = () => {
      if (ttsText) ttsText.textContent = 'Listen';
      ttsBtn?.classList.remove('bg-rose-100', 'text-rose-700', 'dark:bg-rose-950/40', 'dark:text-rose-300');
    };

    window.speechSynthesis.speak(utterance);
  }

  // Pomodoro Focus Hub
  setupPomodoroListeners() {
    const el = id => document.getElementById(id);

    el('pomo-mode-work')?.addEventListener('click', () => this.setPomodoroMode('work', 25 * 60));
    el('pomo-mode-short')?.addEventListener('click', () => this.setPomodoroMode('short', 5 * 60));
    el('pomo-mode-long')?.addEventListener('click', () => this.setPomodoroMode('long', 15 * 60));

    el('pomo-toggle-btn')?.addEventListener('click', () => this.togglePomodoro());
    el('pomo-reset-btn')?.addEventListener('click', () => this.resetPomodoro());
  }

  setPomodoroMode(mode, seconds) {
    if (this.pomodoro.running) this.togglePomodoro();
    this.pomodoro.mode = mode;
    this.pomodoro.timeLeft = seconds;

    // UI Pills
    ['work', 'short', 'long'].forEach(m => {
      const btn = document.getElementById(`pomo-mode-${m}`);
      if (!btn) return;
      if (m === mode) {
        btn.className = 'px-4 py-1.5 rounded-lg bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm transition';
      } else {
        btn.className = 'px-4 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 transition';
      }
    });

    const label = document.getElementById('pomo-status-label');
    if (label) {
      label.textContent = mode === 'work' ? 'Time to Focus' : (mode === 'short' ? 'Short Break' : 'Long Break');
    }

    this.updatePomodoroDisplay();
  }

  togglePomodoro() {
    const btn = document.getElementById('pomo-toggle-btn');
    if (this.pomodoro.running) {
      clearInterval(this.pomodoro.timer);
      this.pomodoro.running = false;
      if (btn) btn.textContent = 'Start Focus';
    } else {
      this.pomodoro.running = true;
      if (btn) btn.textContent = 'Pause Timer';
      this.pomodoro.timer = setInterval(() => {
        if (this.pomodoro.timeLeft > 0) {
          this.pomodoro.timeLeft--;
          this.updatePomodoroDisplay();
        } else {
          // Completed
          clearInterval(this.pomodoro.timer);
          this.pomodoro.running = false;
          playSoundChime('success');
          if (this.pomodoro.mode === 'work') {
            this.recordActivity();
            this.data.settings.focusMinutesTotal = (this.data.settings.focusMinutesTotal || 0) + 25;
            this.saveData(false);
            this.showToast('Pomodoro completed! Fantastic focus! Take a break. 🍵', 'success');
          } else {
            this.showToast('Break finished! Ready to get back into the zone? 🚀', 'info');
          }
          this.resetPomodoro();
        }
      }, 1000);
    }
  }

  resetPomodoro() {
    if (this.pomodoro.timer) clearInterval(this.pomodoro.timer);
    this.pomodoro.running = false;
    const defaultMins = this.pomodoro.mode === 'work' ? 25 : (this.pomodoro.mode === 'short' ? 5 : 15);
    this.pomodoro.timeLeft = defaultMins * 60;
    const btn = document.getElementById('pomo-toggle-btn');
    if (btn) btn.textContent = 'Start Focus';
    this.updatePomodoroDisplay();
  }

  updatePomodoroDisplay() {
    const mins = Math.floor(this.pomodoro.timeLeft / 60);
    const secs = this.pomodoro.timeLeft % 60;
    const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const el = document.getElementById('pomo-timer-display');
    if (el) el.textContent = display;

    const completed = Math.floor((this.data.settings.focusMinutesTotal || 0) / 25);
    const sessEl = document.getElementById('pomo-sessions-count');
    if (sessEl) sessEl.textContent = completed;
  }

  // Navigation
  showView(viewName, data = null) {
    this.stopQuizTimer();

    // Hide all views
    document.querySelectorAll('.view-content').forEach(view => {
      view.classList.add('hidden');
    });

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
      targetView.classList.remove('hidden');
      this.data.currentView = viewName;
    }

    // Scroll to top on transition
    window.scrollTo({ top: 0, behavior: 'instant' });

    this.updateHeader(viewName);
    this.updateNavigation(viewName);

    // View-specific loader
    switch (viewName) {
      case 'dashboard':
        this.updateDashboard();
        break;
      case 'courses':
        this.loadCourses();
        break;
      case 'course-detail':
        this.loadCourseDetail(data);
        break;
      case 'topic-detail':
        this.loadTopicDetail(data);
        break;
      case 'content':
        this.loadContentView(data);
        break;
      case 'quiz':
        this.loadQuizView(data);
        break;
      case 'study':
        this.loadStudyView();
        break;
      case 'pomodoro':
        this.updatePomodoroDisplay();
        break;
      case 'settings':
        this.syncPreferencesUI();
        break;
    }
  }

  goBack() {
    const view = this.data.currentView;
    if (view === 'content' || view === 'quiz') {
      this.showView('topic-detail', { topicId: this.data.currentTopic?.id });
    } else if (view === 'topic-detail') {
      this.showView('course-detail', { courseId: this.data.currentCourse?.id });
    } else if (view === 'course-detail') {
      this.showView('courses');
    } else {
      this.showView('dashboard');
    }
  }

  updateHeader(viewName) {
    const titleEl = document.getElementById('header-title');
    const subtitleEl = document.getElementById('header-subtitle');
    const backBtn = document.getElementById('back-btn');

    if (!titleEl) return;

    // Back button visibility
    const rootViews = ['dashboard', 'courses', 'study', 'pomodoro', 'prompts', 'settings'];
    if (rootViews.includes(viewName)) {
      backBtn?.classList.add('hidden');
    } else {
      backBtn?.classList.remove('hidden');
    }

    switch (viewName) {
      case 'dashboard':
        titleEl.textContent = 'Study Buddy';
        subtitleEl.textContent = 'Your AI Focus Hub';
        break;
      case 'courses':
        titleEl.textContent = 'Courses';
        subtitleEl.textContent = `${this.data.courses.length} Active`;
        break;
      case 'course-detail':
        titleEl.textContent = this.data.currentCourse?.name || 'Course Overview';
        subtitleEl.textContent = `${this.data.currentCourse?.topics?.length || 0} Topics`;
        break;
      case 'topic-detail':
        titleEl.textContent = this.data.currentTopic?.name || 'Topic';
        subtitleEl.textContent = this.data.currentCourse?.name || '';
        break;
      case 'content':
        titleEl.textContent = this.capitalize(this.data.currentContent?.type || 'Content');
        subtitleEl.textContent = this.data.currentTopic?.name || '';
        break;
      case 'quiz':
        titleEl.textContent = 'Quiz Arena';
        subtitleEl.textContent = this.data.currentTopic?.name || '';
        break;
      case 'study':
        titleEl.textContent = 'Smart Queue';
        subtitleEl.textContent = 'SRS & Due Reviews';
        break;
      case 'pomodoro':
        titleEl.textContent = 'Focus Hub';
        subtitleEl.textContent = 'Pomodoro Timer';
        break;
      case 'prompts':
        titleEl.textContent = 'Prompts';
        subtitleEl.textContent = 'AI Generation Library';
        break;
      case 'settings':
        titleEl.textContent = 'Settings';
        subtitleEl.textContent = 'Preferences & API';
        break;
      default:
        titleEl.textContent = 'Study Buddy';
        subtitleEl.textContent = '';
    }

    this._updateStreakDisplay();
  }

  updateNavigation(viewName) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const active = btn.getAttribute('data-nav') === viewName;
      if (active) {
        btn.classList.add('text-primary-600', 'dark:text-primary-400', 'font-bold');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('text-primary-600', 'dark:text-primary-400', 'font-bold');
        btn.classList.add('text-slate-400');
      }
    });
  }

  // Dashboard
  updateDashboard() {
    const totalCourses = document.getElementById('total-courses');
    if (totalCourses) totalCourses.textContent = this.data.courses.length;

    const streakEl = document.getElementById('study-streak');
    if (streakEl) streakEl.textContent = this.data.settings.studyStreak || 0;

    const pomoHours = document.getElementById('pomodoro-count');
    if (pomoHours) pomoHours.textContent = ((this.data.settings.focusMinutesTotal || 0) / 60).toFixed(1);

    this.loadRecentActivity();
  }

  loadRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    if (this.data.courses.length === 0) {
      container.innerHTML = `
        <div class="text-center py-6 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
          <p class="text-xs font-semibold">No enrolled courses yet</p>
          <button onclick="showView('courses')" class="mt-2 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline">+ Create your first course</button>
        </div>
      `;
    } else {
      const recentItems = this.data.courses.slice(-3).reverse();
      container.innerHTML = recentItems.map(course => `
        <div class="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl cursor-pointer hover:border-primary-500 hover:shadow-md transition"
             onclick="window.app.openCourse('${course.id}')">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-900 dark:text-white text-sm">${escapeHtml(course.name)}</h4>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400">${course.topics?.length || 0} topics</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">${escapeHtml(course.description || 'No description provided')}</p>
        </div>
      `).join('');
    }
  }
  // Helpers
  findCourseById(courseId) {
    return this.data.courses.find(c => c.id === courseId) || null;
  }
  findTopicById(course, topicId) {
    return (course?.topics || []).find(t => t.id === topicId) || null;
  }
  openCourse(courseId) {
    this.showView('course-detail', { courseId });
  }
  openTopic(topicId) {
    this.showView('topic-detail', { topicId });
  }
  openContent(type, topicId) {
    this.showView('content', { type, topicId });
  }
  openQuiz(topicId) {
    this.showView('quiz', { topicId });
  }

  // Course Management
  showAddCourseModal() {
    document.getElementById('add-course-modal')?.classList.remove('hidden');
    document.getElementById('course-name')?.focus();
  }

  hideAddCourseModal() {
    document.getElementById('add-course-modal')?.classList.add('hidden');
    document.getElementById('add-course-form')?.reset();
  }

  addCourse(e) {
    e.preventDefault();
    const nameInput = document.getElementById('course-name');
    const descInput = document.getElementById('course-description');

    const name = nameInput.value.trim();
    const description = descInput.value.trim();

    if (!name) {
      this.showToast('Please enter a course name', 'error');
      return;
    }

    const newCourse = {
      id: 'course_' + Date.now(),
      name,
      description,
      topics: [],
      createdAt: new Date().toISOString()
    };

    this.data.courses.push(newCourse);
    this.saveData();
    this.hideAddCourseModal();
    this.showToast(`Course "${name}" created!`, 'success');
    this.loadCourses();
  }

  confirmDeleteCourse(courseId, ev) {
    if (ev) ev.stopPropagation();
    const course = this.findCourseById(courseId);
    if (!course) return;

    if (confirm(`Are you sure you want to delete the course "${course.name}" and all its topics?`)) {
      this.deleteCourse(courseId);
    }
  }

  deleteCourse(courseId) {
    const idx = this.data.courses.findIndex(c => c.id === courseId);
    if (idx === -1) return;

    const name = this.data.courses[idx].name;
    this.data.courses.splice(idx, 1);

    if (this.data.currentCourse?.id === courseId) {
      this.data.currentCourse = null;
      this.data.currentTopic = null;
      this.data.currentContent = null;
    }

    this.saveData();
    this.showToast(`Course "${name}" deleted.`, 'info');

    if (this.data.currentView === 'courses') this.loadCourses();
    if (this.data.currentView === 'dashboard') this.updateDashboard();
    if (this.data.currentView === 'study') this.loadStudyView();
    if (this.data.currentView === 'course-detail') this.showView('courses');
  }

  filterCourses(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      this.renderCoursesList(this.data.courses);
      return;
    }

    const filtered = this.data.courses.filter(course => {
      const matchName = course.name.toLowerCase().includes(q);
      const matchDesc = (course.description || '').toLowerCase().includes(q);
      const matchTopic = (course.topics || []).some(t => t.name.toLowerCase().includes(q));
      return matchName || matchDesc || matchTopic;
    });

    this.renderCoursesList(filtered);
  }

  loadCourses() {
    this.renderCoursesList(this.data.courses);
  }

  renderCoursesList(courses, container = null) {
    const target = container || document.getElementById('courses-list');
    if (!target) return;

    if (!courses || courses.length === 0) {
      target.innerHTML = `
        <div class="text-center py-10 px-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
          <p class="text-xs font-semibold">No courses match your filter</p>
          <button onclick="window.app.showAddCourseModal()" class="mt-2 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline">+ Create New Course</button>
        </div>
      `;
      return;
    }

    target.innerHTML = courses.map(course => {
      const topicsCount = course.topics?.length || 0;
      let completedSlots = 0;
      let totalSlots = 0;

      (course.topics || []).forEach(t => {
        ['summary', 'explainer', 'flashcards', 'quiz'].forEach(k => {
          totalSlots++;
          if (t.contentSlots?.[k]?.completed) completedSlots++;
        });
      });

      const pct = totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0;

      return `
        <div class="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm hover:border-primary-500 hover:shadow-md transition cursor-pointer group"
             onclick="window.app.openCourse('${course.id}')">
          <div class="flex items-start justify-between">
            <div class="flex-1 pr-3">
              <h3 class="font-bold text-slate-900 dark:text-white text-sm group-hover:text-primary-600 dark:group-hover:text-primary-400 transition">${escapeHtml(course.name)}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">${escapeHtml(course.description || 'No description provided')}</p>
            </div>
            <button onclick="window.app.confirmDeleteCourse('${course.id}', event)" class="text-slate-400 hover:text-red-500 p-1 rounded-lg transition" title="Delete Course">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-[11px]">${topicsCount} Topics</span>
              <span class="text-slate-400 text-[11px]">${pct}% mastered</span>
            </div>
            <div class="w-20 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div class="bg-primary-600 h-1.5 rounded-full transition-all" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Course Detail
  loadCourseDetail(data) {
    const courseId = data?.courseId || this.data.currentCourse?.id;
    const course = this.findCourseById(courseId);

    if (!course) {
      this.showToast('Course not found', 'error');
      this.showView('courses');
      return;
    }

    this.data.currentCourse = course;

    const structureSection = document.getElementById('course-structure-section');
    const topicsSection = document.getElementById('topics-section');

    if (!course.topics || course.topics.length === 0) {
      structureSection.style.display = 'block';
      topicsSection.classList.add('hidden');
      document.getElementById('structure-prompt-card').style.display = 'block';
      document.getElementById('paste-structure-card').style.display = 'none';
    } else {
      structureSection.style.display = 'none';
      topicsSection.classList.remove('hidden');
      this.loadTopics();
    }
  }

  showStructurePrompt() {
    document.getElementById('structure-prompt-card').style.display = 'none';
    document.getElementById('paste-structure-card').style.display = 'block';
    document.getElementById('structure-response').focus();

    const prompt = this.getStructurePrompt();
    this.showPromptModal('Course Structure Prompt', prompt);
  }

  parseStructureResponse() {
    const textarea = document.getElementById('structure-response');
    const text = textarea.value.trim();

    if (!text) {
      this.showToast('Please paste the AI output first', 'error');
      return;
    }

    const topics = this.parseStructureText(text);

    if (topics.length === 0) {
      this.showToast('Could not find topics in response. Check the prompt format!', 'error');
      return;
    }

    this.data.currentCourse.topics = topics;
    this.saveData();

    textarea.value = '';
    document.getElementById('paste-structure-card').style.display = 'none';
    document.getElementById('topics-section').classList.remove('hidden');
    document.getElementById('course-structure-section').style.display = 'none';

    this.loadTopics();
    playSoundChime('success');
    this.showToast(`Extracted ${topics.length} topics!`, 'success');
  }

  parseStructureText(text) {
    const topics = [];

    // Approach A: Try JSON first
    const maybeJson = extractJsonFromText(text);
    if (Array.isArray(maybeJson)) {
      return maybeJson.map((t, i) => ({
        id: 'topic_' + Date.now() + '_' + i,
        name: cleanBrackets(t.name || t.topic || `Topic ${i + 1}`),
        difficulty: t.difficulty || 'Medium',
        estimatedMinutes: Number(t.estimatedMinutes) || 15,
        contentSlots: this.createEmptyContentSlots()
      }));
    }

    // Approach B: Markers TOPIC_START ... TOPIC_END
    const topicBlocks = text.split(/TOPIC_START|TOPIC:/i);

    for (let i = 1; i < topicBlocks.length; i++) {
      const block = topicBlocks[i].split(/TOPIC_END/i)[0];
      const name = this.extractValue(block, /TOPIC_NAME:\s*(.+)/i) ||
                   this.extractValue(block, /NAME:\s*(.+)/i) ||
                   this.extractValue(block, /TITLE:\s*(.+)/i);

      if (name) {
        const difficulty = this.extractValue(block, /DIFFICULTY:\s*(.+)/i) || 'Medium';
        const mins = parseInt(this.extractValue(block, /ESTIMATED_TIME:\s*(\d+)/i) || '15', 10);

        topics.push({
          id: 'topic_' + Date.now() + '_' + i,
          name: cleanBrackets(name),
          difficulty: cleanBrackets(difficulty),
          estimatedMinutes: mins,
          contentSlots: this.createEmptyContentSlots()
        });
      }
    }

    // Approach C: Numbered list fallback "1. Topic Name"
    if (topics.length === 0) {
      const lines = text.split('\n');
      let idx = 0;
      for (const line of lines) {
        const match = line.match(/^\s*(?:\d+[\.\)]|\-|\*)\s+(.+)/);
        if (match && match[1].trim()) {
          const rawTitle = match[1].split('(')[0].replace(/\[.*?\]/g, '').trim();
          if (rawTitle.length > 2 && rawTitle.length < 80) {
            topics.push({
              id: 'topic_' + Date.now() + '_' + (idx++),
              name: cleanBrackets(rawTitle),
              difficulty: 'Medium',
              estimatedMinutes: 15,
              contentSlots: this.createEmptyContentSlots()
            });
          }
        }
      }
    }

    return topics;
  }

  extractValue(text, regex) {
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  createEmptyContentSlots() {
    const slots = {};
    const types = ['summary', 'explainer', 'flashcards', 'quiz'];
    types.forEach(type => {
      slots[type] = {
        content: null,
        completed: false,
        lastStudied: null,
        srs: { cards: {} } // SM-2 card tracking
      };
    });
    return slots;
  }

  loadTopics() {
    const container = document.getElementById('topics-list');
    if (!container || !this.data.currentCourse) return;

    const topics = this.data.currentCourse.topics || [];
    if (topics.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400">No topics found.</p>';
      return;
    }

    container.innerHTML = topics.map((topic, index) => {
      let completedCount = 0;
      ['summary', 'explainer', 'flashcards', 'quiz'].forEach(t => {
        if (topic.contentSlots?.[t]?.completed) completedCount++;
      });
      const pct = Math.round((completedCount / 4) * 100);

      const diffColor = topic.difficulty === 'Beginner' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                        topic.difficulty === 'Advanced' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' :
                        'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';

      return `
        <div class="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl hover:border-primary-500 hover:shadow-md transition cursor-pointer group"
             onclick="window.app.openTopic('${topic.id}')">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <span class="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center">${index + 1}</span>
              <div>
                <h4 class="font-bold text-slate-900 dark:text-white text-sm group-hover:text-primary-600 dark:group-hover:text-primary-400 transition">${escapeHtml(topic.name)}</h4>
                <div class="flex items-center space-x-2 mt-0.5">
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${diffColor}">${escapeHtml(topic.difficulty || 'Medium')}</span>
                  <span class="text-[11px] text-slate-400">⏱️ ${topic.estimatedMinutes || 15}m</span>
                </div>
              </div>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${completedCount}/4</span>
              <p class="text-[10px] text-slate-400">${pct}% done</p>
            </div>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1 mt-3 overflow-hidden">
            <div class="bg-primary-600 h-1 rounded-full transition-all" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Topic Detail View
  loadTopicDetail(data) {
    const topicId = data?.topicId || this.data.currentTopic?.id;
    const course = this.data.currentCourse;

    if (!course) {
      this.showView('courses');
      return;
    }

    const topic = this.findTopicById(course, topicId);
    if (!topic) {
      this.showToast('Topic not found', 'error');
      this.showView('course-detail', { courseId: course.id });
      return;
    }

    this.data.currentTopic = topic;

    // Header info
    const titleEl = document.getElementById('topic-title');
    const diffEl = document.getElementById('topic-difficulty');
    const progEl = document.getElementById('topic-progress');

    if (titleEl) titleEl.textContent = topic.name;
    if (diffEl) diffEl.textContent = topic.difficulty || 'Medium';

    let completed = 0;
    ['summary', 'explainer', 'flashcards', 'quiz'].forEach(t => {
      if (topic.contentSlots?.[t]?.completed) completed++;
    });

    if (progEl) progEl.textContent = `${completed}/4 modules completed`;

    this.loadContentSlots(topic);
  }

  loadContentSlots(topic) {
    const container = document.getElementById('content-slots');
    if (!container) return;

    const slotTypes = [
      { key: 'summary', name: 'Comprehensive Summary', icon: '📝', desc: 'Markdown study notes and concepts', badgeBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300' },
      { key: 'explainer', name: 'Concept Explainer', icon: '💡', desc: 'Intuitions, real-world analogies', badgeBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300' },
      { key: 'flashcards', name: '3D Flashcards (SM-2 SRS)', icon: '🃏', desc: 'Active recall spaced repetition cards', badgeBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300' },
      { key: 'quiz', name: '10-Question MCQ Arena', icon: '📊', desc: 'Timed quiz with instant answers', badgeBg: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300' }
    ];

    container.innerHTML = slotTypes.map(t => {
      const slot = topic.contentSlots?.[t.key];
      const hasContent = !!slot?.content;
      const isCompleted = !!slot?.completed;

      let statusChip = '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">Empty</span>';
      if (isCompleted) {
        statusChip = '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">✓ Completed</span>';
      } else if (hasContent) {
        statusChip = '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">Ready to Study</span>';
      }

      let actions = '';
      if (t.key === 'quiz') {
        actions = `
          <div class="flex space-x-2 mt-3">
            <button onclick="window.app.openContent('quiz', '${topic.id}')" class="flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 transition">
              ${hasContent ? 'Edit Quiz' : 'Add Quiz'}
            </button>
            <button onclick="window.app.openQuiz('${topic.id}')" ${!hasContent ? 'disabled' : ''} class="flex-1 py-2 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold disabled:opacity-40 shadow-sm transition">
              Launch Quiz 🚀
            </button>
          </div>
        `;
      } else if (t.key === 'flashcards') {
        actions = `
          <div class="flex space-x-2 mt-3">
            <button onclick="window.app.openContent('flashcards', '${topic.id}')" class="flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 transition">
              ${hasContent ? 'Edit Cards' : 'Add Cards'}
            </button>
            <button onclick="window.app.openFlashcardsStudy('${topic.id}')" ${!hasContent ? 'disabled' : ''} class="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 shadow-sm transition">
              Practice SRS 🃏
            </button>
          </div>
        `;
      } else {
        actions = `
          <div class="flex space-x-2 mt-3">
            <button onclick="window.app.openContent('${t.key}', '${topic.id}')" class="flex-1 py-2 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold shadow-sm transition">
              ${hasContent ? 'Open Material' : 'Generate / Add'}
            </button>
          </div>
        `;
      }

      return `
        <div class="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2.5">
              <span class="w-8 h-8 rounded-xl ${t.badgeBg} flex items-center justify-center text-sm">${t.icon}</span>
              <span class="font-bold text-slate-900 dark:text-white text-xs">${escapeHtml(t.name)}</span>
            </div>
            <div>${statusChip}</div>
          </div>
          <div>${actions}</div>
        </div>
      `;
    }).join('');
  }

  // Content View
  loadContentView(data) {
    const type = data?.type || this.data.currentContent?.type;
    const topicId = data?.topicId || this.data.currentContent?.topicId || this.data.currentTopic?.id;
    const course = this.data.currentCourse;

    if (!course || !topicId || !type) {
      this.showView('courses');
      return;
    }

    const topic = this.findTopicById(course, topicId);
    if (!topic) {
      this.showView('course-detail', { courseId: course.id });
      return;
    }

    this.data.currentTopic = topic;
    this.data.currentContent = { type, topicId };

    document.getElementById('content-title').textContent = this.capitalize(type);
    document.getElementById('content-topic').textContent = topic.name;

    const slot = topic.contentSlots?.[type];
    const actionsDiv = document.getElementById('content-actions');
    const displayDiv = document.getElementById('content-display');
    const pasteSec = document.getElementById('paste-content-section');

    if (slot && slot.content) {
      actionsDiv.classList.add('hidden');
      displayDiv.classList.remove('hidden');
      pasteSec.style.display = 'none';
      this.displayParsedContent(slot.content, type);
    } else {
      actionsDiv.classList.remove('hidden');
      displayDiv.classList.add('hidden');
      pasteSec.style.display = 'none';
    }
  }

  showContentPrompt() {
    const pasteSection = document.getElementById('paste-content-section');
    pasteSection.style.display = 'block';
    document.getElementById('content-response').focus();

    const slotType = this.data.currentContent?.type;
    const topic = this.data.currentTopic;
    const prompt = this.getContentPrompt(slotType, topic);
    this.showPromptModal(`Prompt: ${this.capitalize(slotType)}`, prompt);
  }

  parseContentResponse(response, type) {
    const trimmed = (response || '').trim();
    if (!trimmed) return null;

    if (type === 'flashcards' || type === 'quiz') {
      const parsedJson = extractJsonFromText(trimmed);
      if (parsedJson) return parsedJson;

      // Flashcard simple bullet parsing fallback
      if (type === 'flashcards') {
        const cards = [];
        const lines = trimmed.split('\n');
        for (const line of lines) {
          if (line.includes(' - ') || line.includes(' : ') || line.includes('\t')) {
            const parts = line.split(/ - | : |\t/);
            if (parts.length >= 2) {
              cards.push({
                front: parts[0].replace(/^[\*\-\d\.]+\s*/, '').trim(),
                back: parts[1].trim()
              });
            }
          }
        }
        if (cards.length > 0) return { flashcards: cards };
      }

      // Quiz fallback parsing
      if (type === 'quiz') {
        const questions = [];
        const qBlocks = trimmed.split(/Q\d+:|Question \d+:/i);
        for (let i = 1; i < qBlocks.length; i++) {
          const qText = qBlocks[i].split('\n')[0].trim();
          const optMatches = qBlocks[i].match(/[A-D]\)\s*([^\n]+)/g);
          if (qText && optMatches && optMatches.length >= 2) {
            questions.push({
              question: qText,
              options: optMatches.map(o => o.replace(/^[A-D]\)\s*/, '').trim()),
              correctAnswer: 0,
              explanation: 'Select the best answer.'
            });
          }
        }
        if (questions.length > 0) return { questions };
      }

      throw new Error('Could not parse valid JSON or formatted cards/questions from AI output.');
    }

    // Markdown content
    return trimmed;
  }

  saveContent() {
    const textarea = document.getElementById('content-response');
    const raw = textarea.value.trim();

    if (!raw) {
      this.showToast('Please paste or write content before saving', 'error');
      return;
    }

    const type = this.data.currentContent?.type;
    const topic = this.data.currentTopic;

    try {
      const parsed = this.parseContentResponse(raw, type);

      if (!topic.contentSlots) topic.contentSlots = {};
      if (!topic.contentSlots[type]) {
        topic.contentSlots[type] = { content: null, completed: false, lastStudied: null, srs: { cards: {} } };
      }

      topic.contentSlots[type].content = parsed;
      topic.contentSlots[type].completed = true;
      topic.contentSlots[type].lastStudied = new Date().toISOString();

      this.recordActivity();
      this.saveData();

      textarea.value = '';
      document.getElementById('paste-content-section').style.display = 'none';
      document.getElementById('content-actions').classList.add('hidden');
      document.getElementById('content-display').classList.remove('hidden');

      this.displayParsedContent(parsed, type);
      playSoundChime('success');
      this.showToast(`${this.capitalize(type)} saved successfully!`, 'success');
    } catch (err) {
      this.showToast('Save failed: ' + err.message, 'error');
    }
  }

  displayParsedContent(content, type) {
    const container = document.getElementById('parsed-content');
    if (!container) return;

    if (type === 'flashcards') {
      const cards = content.flashcards || (Array.isArray(content) ? content : []);
      if (cards.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400">No cards found in stored data.</p>';
        return;
      }
      container.innerHTML = `
        <div class="mb-4">
          <button onclick="window.app.openFlashcardsStudy()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-3 rounded-2xl text-xs shadow-md transition flex items-center justify-center space-x-2">
            <span>🃏 Launch 3D Flashcard Study Session (${cards.length} cards)</span>
          </button>
        </div>
        <div class="space-y-2">
          ${cards.map((c, i) => `
            <div class="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-1">
              <p class="font-bold text-slate-900 dark:text-white">Q${i + 1}: ${escapeHtml(c.front || c.question || '')}</p>
              <p class="text-slate-600 dark:text-slate-300 font-medium">A: ${escapeHtml(c.back || c.answer || '')}</p>
            </div>
          `).join('')}
        </div>
      `;
    } else if (type === 'quiz') {
      const qs = content.questions || (Array.isArray(content) ? content : []);
      container.innerHTML = `
        <div class="mb-4">
          <button onclick="window.app.openQuiz()" class="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold p-3 rounded-2xl text-xs shadow-md transition flex items-center justify-center space-x-2">
            <span>📊 Start Interactive Quiz Arena (${qs.length} Questions)</span>
          </button>
        </div>
        <div class="space-y-3">
          ${qs.map((q, i) => `
            <div class="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-1.5">
              <p class="font-bold text-slate-900 dark:text-white">${i + 1}. ${escapeHtml(q.question)}</p>
              <ul class="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                ${(q.options || []).map((opt, oi) => `
                  <li class="${oi === q.correctAnswer ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}">${escapeHtml(opt)}</li>
                `).join('')}
              </ul>
              ${q.explanation ? `<p class="text-[11px] text-slate-400 italic mt-1">Note: ${escapeHtml(q.explanation)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } else {
      // Markdown render
      container.innerHTML = this.renderMarkdown(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
  }

  cancelContentEdit() {
    const pasteSection = document.getElementById('paste-content-section');
    pasteSection.style.display = 'none';

    const slot = this.data.currentTopic?.contentSlots?.[this.data.currentContent?.type];
    if (slot && slot.content) {
      document.getElementById('content-actions').classList.add('hidden');
      document.getElementById('content-display').classList.remove('hidden');
    }
  }

  editContent() {
    const slot = this.data.currentTopic?.contentSlots?.[this.data.currentContent?.type];
    if (!slot) return;

    const contentVal = typeof slot.content === 'object' ? JSON.stringify(slot.content, null, 2) : slot.content;
    document.getElementById('content-response').value = contentVal;

    document.getElementById('content-display').classList.add('hidden');
    document.getElementById('content-actions').classList.remove('hidden');
    document.getElementById('paste-content-section').style.display = 'block';
  }

  deleteContent() {
    if (!confirm('Are you sure you want to remove this module content?')) return;

    const type = this.data.currentContent?.type;
    const topic = this.data.currentTopic;

    if (topic?.contentSlots?.[type]) {
      topic.contentSlots[type].content = null;
      topic.contentSlots[type].completed = false;
    }

    this.saveData();
    this.showToast('Module content deleted', 'info');
    this.loadContentView({ type, topicId: topic.id });
  }

  // 3D Animated Flashcards SRS
  openFlashcardsStudy(topicId = null) {
    const tId = topicId || this.data.currentTopic?.id;
    const topic = this.findTopicById(this.data.currentCourse, tId) || this.data.currentTopic;

    if (!topic) return;
    this.data.currentTopic = topic;

    const slot = topic.contentSlots?.flashcards;
    const cards = slot?.content?.flashcards || (Array.isArray(slot?.content) ? slot.content : []);

    if (cards.length === 0) {
      this.showToast('No flashcards found. Please generate or paste flashcards first!', 'error');
      return;
    }

    // Ensure SRS state dict
    if (!slot.srs) slot.srs = { cards: {} };
    if (!slot.srs.cards) slot.srs.cards = {};

    this._flash = {
      topicId: topic.id,
      srsRef: slot.srs.cards,
      deck: cards,
      index: 0,
      total: cards.length,
      flipped: false,
      seen: 0
    };

    const modal = document.getElementById('flashcards-modal');
    modal?.classList.remove('hidden');

    this._wireFlashModal();
    this._renderFlashcard();
  }

  closeFlashcardsStudy() {
    const modal = document.getElementById('flashcards-modal');
    modal?.classList.add('hidden');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this._flash = null;
  }

  _flipFlashcard() {
    if (!this._flash) return;
    this._flash.flipped = !this._flash.flipped;
    const cardInner = document.getElementById('flashcard-card-inner');
    if (cardInner) {
      cardInner.classList.toggle('rotate-y-180', this._flash.flipped);
    }
  }

  _nextFlashcard() {
    if (!this._flash) return;
    if (this._flash.index < this._flash.total - 1) {
      this._flash.index++;
      this._flash.flipped = false;
      const cardInner = document.getElementById('flashcard-card-inner');
      if (cardInner) cardInner.classList.remove('rotate-y-180');
      this._renderFlashcard();
    } else {
      // Completed session
      playSoundChime('success');
      this.showToast('Flashcard deck completed! Great job! 🎉', 'success');

      const topic = this.data.currentTopic;
      if (topic?.contentSlots?.flashcards) {
        topic.contentSlots.flashcards.completed = true;
        topic.contentSlots.flashcards.lastStudied = new Date().toISOString();
      }

      this.recordActivity();
      this.saveData(false);
      this.closeFlashcardsStudy();
      if (this.data.currentView === 'topic-detail') this.loadTopicDetail();
      if (this.data.currentView === 'study') this.loadStudyView();
    }
  }

  _prevFlashcard() {
    if (!this._flash || this._flash.index <= 0) return;
    this._flash.index--;
    this._flash.flipped = false;
    const cardInner = document.getElementById('flashcard-card-inner');
    if (cardInner) cardInner.classList.remove('rotate-y-180');
    this._renderFlashcard();
  }

  // SM-2 Spaced Repetition Algorithm
  _gradeFlashcard(quality) {
    // quality: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
    if (!this._flash) return;
    const cardId = `c_${this._flash.index}`;
    const srs = this._flash.srsRef;

    let item = srs[cardId] || { reps: 0, interval: 1, ease: 2.5, due: this._today() };

    if (quality < 3) {
      item.reps = 0;
      item.interval = 1;
    } else {
      if (item.reps === 0) item.interval = 1;
      else if (item.reps === 1) item.interval = quality === 4 ? 6 : 4;
      else item.interval = Math.round(item.interval * item.ease);

      item.reps++;
    }

    // Ease Factor update
    item.ease = Math.max(1.3, item.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    item.due = this._addDays(item.interval);
    srs[cardId] = item;

    if (quality >= 3) {
      playSoundChime('success');
    }

    this._flash.seen = Math.max(this._flash.seen, this._flash.index + 1);
    this.recordActivity();
    this.saveData(false);
    this._nextFlashcard();
  }
  _renderFlashcard() {
    if (!this._flash) return;
    const { index, total, deck, srsRef } = this._flash;
    const card = deck[index];

    const countsEl = document.getElementById('flash-counts');
    if (countsEl) countsEl.textContent = `Card ${index + 1} of ${total}`;

    const progBar = document.getElementById('flash-progress-bar');
    const progText = document.getElementById('flash-progress-text');
    const pct = Math.round(((index + 1) / total) * 100);
    if (progBar) progBar.style.width = `${pct}%`;
    if (progText) progText.textContent = `${pct}% completed`;

    const frontEl = document.getElementById('flash-front');
    const backEl = document.getElementById('flash-back');
    if (frontEl) frontEl.textContent = card.front || card.question || '';
    if (backEl) backEl.textContent = card.back || card.answer || '';

    // Due info badge
    const cardId = `c_${index}`;
    const st = srsRef[cardId];
    const info = document.getElementById('flash-due-info');
    if (info) {
      if (!st) { info.textContent = 'Status: New Card'; }
      else { info.textContent = `Ease ${st.ease.toFixed(2)} • Interval ${st.interval}d • Due ${st.due}`; }
    }
  }

  _wireFlashModal() {
    if (this._flashWired) return;
    this._flashWired = true;

    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('flashcards-modal');
      if (!modal || modal.classList.contains('hidden') || !this._flash) return;

      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); this._flipFlashcard(); }
      else if (e.key === 'ArrowRight') this._nextFlashcard();
      else if (e.key === 'ArrowLeft') this._prevFlashcard();
      else if (e.key === '1') this._gradeFlashcard(1);
      else if (e.key === '2') this._gradeFlashcard(2);
      else if (e.key === '3') this._gradeFlashcard(3);
      else if (e.key === '4') this._gradeFlashcard(4);
    });

    document.getElementById('flashcard-card-inner')?.addEventListener('click', () => this._flipFlashcard());
    document.getElementById('flash-close-btn')?.addEventListener('click', () => this.closeFlashcardsStudy());
    document.getElementById('flash-flip-btn')?.addEventListener('click', () => this._flipFlashcard());
    document.getElementById('flash-next-btn')?.addEventListener('click', () => this._nextFlashcard());
    document.getElementById('flash-prev-btn')?.addEventListener('click', () => this._prevFlashcard());

    document.getElementById('flash-grade-again')?.addEventListener('click', () => this._gradeFlashcard(1));
    document.getElementById('flash-grade-hard')?.addEventListener('click', () => this._gradeFlashcard(2));
    document.getElementById('flash-grade-good')?.addEventListener('click', () => this._gradeFlashcard(3));
    document.getElementById('flash-grade-easy')?.addEventListener('click', () => this._gradeFlashcard(4));

    document.getElementById('flash-tts-btn')?.addEventListener('click', () => {
      if (!('speechSynthesis' in window) || !this._flash) return;
      const card = this._flash.deck[this._flash.index];
      const text = this._flash.flipped ? (card.back || card.answer) : (card.front || card.question);
      if (text) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(u);
      }
    });
  }

  // Quiz Engine
  loadQuizView(data) {
    const topicId = data?.topicId || this.data.currentTopic?.id;
    const course = this.data.currentCourse;

    if (!course || !topicId) {
      this.showView('courses');
      return;
    }

    const topic = this.findTopicById(course, topicId);
    if (!topic) {
      this.showView('course-detail', { courseId: course.id });
      return;
    }

    this.data.currentTopic = topic;
    const slot = topic.contentSlots?.quiz;

    if (!slot || !slot.content) {
      this.showToast('Please generate or paste a quiz first!', 'error');
      this.showView('content', { type: 'quiz', topicId: topic.id });
      return;
    }

    const quizData = slot.content;
    const questions = quizData.questions || (Array.isArray(quizData) ? quizData : []);

    if (questions.length === 0) {
      this.showToast('No quiz questions found in stored data.', 'error');
      this.showView('content', { type: 'quiz', topicId: topic.id });
      return;
    }

    // Initialize Quiz state
    this.currentQuiz = {
      questions: questions,
      currentIndex: 0,
      userAnswers: new Array(questions.length).fill(null),
      answers: new Array(questions.length).fill(null),
      score: 0,
      timer: null,
      seconds: 0,
      startTime: Date.now(),
      locked: false,
      isReviewMode: false
    };

    // Reset views
    document.getElementById('quiz-results')?.classList.add('hidden');
    document.getElementById('quiz-review-card')?.classList.add('hidden');
    document.getElementById('quiz-question-card')?.classList.remove('hidden');
    document.getElementById('quiz-controls')?.classList.remove('hidden');

    const titleEl = document.getElementById('quiz-title');
    if (titleEl) titleEl.textContent = topic.name;

    this.startQuiz();
  }

  startQuiz() {
    this.displayQuizQuestion();
    this.startQuizTimer();
    this.updateQuizProgress();
  }

  stopQuizTimer() {
    if (this.currentQuiz?.timer) {
      clearInterval(this.currentQuiz.timer);
      this.currentQuiz.timer = null;
    }
  }

  startQuizTimer() {
    this.stopQuizTimer();
    const timerEl = document.getElementById('quiz-timer');
    this.currentQuiz.timer = setInterval(() => {
      this.currentQuiz.seconds++;
      const mins = Math.floor(this.currentQuiz.seconds / 60);
      const secs = this.currentQuiz.seconds % 60;
      if (timerEl) {
        timerEl.textContent = `⏱️ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }, 1000);
  }

  displayQuizQuestion() {
    const q = this.currentQuiz.questions[this.currentQuiz.currentIndex];
    if (!q) return;

    this.currentQuiz.locked = false;

    const questionTextEl = document.getElementById('question-text');
    const optionsContainer = document.getElementById('question-options');
    const submitBtn = document.getElementById('quiz-submit-btn');
    const nextBtn = document.getElementById('quiz-next-btn');

    if (questionTextEl) questionTextEl.textContent = q.question;
    if (submitBtn) {
      submitBtn.style.display = 'inline-block';
      submitBtn.disabled = true;
    }
    if (nextBtn) nextBtn.style.display = 'none';

    // Existing answer for back navigation
    const prevAnswer = this.currentQuiz.userAnswers[this.currentQuiz.currentIndex];

    if (optionsContainer) {
      optionsContainer.innerHTML = (q.options || []).map((opt, i) => {
        const isChecked = prevAnswer === i ? 'checked' : '';
        return `
          <label class="quiz-option-label flex items-center p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition text-xs font-semibold" data-index="${i}">
            <input type="radio" name="quiz-option" value="${i}" ${isChecked} class="mr-3 text-primary-600 focus:ring-primary-500" />
            <span class="text-slate-800 dark:text-slate-200">${escapeHtml(opt)}</span>
          </label>
        `;
      }).join('');

      // Enable submit when radio selected
      optionsContainer.querySelectorAll('input[type="radio"]').forEach(r => {
        r.addEventListener('change', () => {
          if (submitBtn) submitBtn.disabled = false;
        });
      });
    }

    if (prevAnswer !== null && prevAnswer !== undefined) {
      this.lockAndShowFeedback(prevAnswer);
    }
  }

  submitQuizAnswer() {
    if (this.currentQuiz.locked) return;

    const selected = document.querySelector('input[name="quiz-option"]:checked');
    if (!selected) {
      this.showToast('Please select an option first!', 'info');
      return;
    }

    const answerIndex = parseInt(selected.value, 10);
    this.currentQuiz.userAnswers[this.currentQuiz.currentIndex] = answerIndex;
    this.lockAndShowFeedback(answerIndex);
    this.updateQuizProgress();
  }

  lockAndShowFeedback(answerIndex) {
    this.currentQuiz.locked = true;

    const q = this.currentQuiz.questions[this.currentQuiz.currentIndex];
    const isCorrect = answerIndex === q.correctAnswer;

    // Play chime sound
    playSoundChime(isCorrect ? 'success' : 'wrong');

    // Visual feedback
    this.showQuizFeedback(isCorrect, q, answerIndex);

    // Toggle button to next
    const submitBtn = document.getElementById('quiz-submit-btn');
    const nextBtn = document.getElementById('quiz-next-btn');

    if (submitBtn) submitBtn.style.display = 'none';
    if (nextBtn) {
      nextBtn.style.display = 'inline-block';
      const isLast = this.currentQuiz.currentIndex === this.currentQuiz.questions.length - 1;
      nextBtn.textContent = isLast ? 'Finish Quiz 🎉' : 'Next Question ➔';
    }
  }

  showQuizFeedback(isCorrect, question, selectedIndex) {
    const labels = document.querySelectorAll('.quiz-option-label');
    labels.forEach((label, idx) => {
      const radio = label.querySelector('input');
      if (radio) radio.disabled = true;

      if (idx === question.correctAnswer) {
        label.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-800', 'dark:bg-emerald-950/40', 'dark:text-emerald-200');
      } else if (idx === selectedIndex && !isCorrect) {
        label.classList.add('bg-red-50', 'border-red-500', 'text-red-800', 'dark:bg-red-950/40', 'dark:text-red-200');
      } else {
        label.classList.add('opacity-50');
      }
    });

    if (question.explanation) {
      const card = document.getElementById('quiz-question');
      const note = document.createElement('div');
      note.className = 'mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 italic';
      note.textContent = `💡 Explanation: ${question.explanation}`;
      card?.appendChild(note);
    }
  }

  handleQuizNextOrFinish() {
    if (this.currentQuiz.currentIndex < this.currentQuiz.questions.length - 1) {
      this.nextQuizQuestion();
    } else {
      this.finishQuiz();
    }
  }

  nextQuizQuestion() {
    if (this.currentQuiz.currentIndex < this.currentQuiz.questions.length - 1) {
      this.currentQuiz.currentIndex++;
      this.displayQuizQuestion();
      this.updateQuizProgress();
    }
  }

  prevQuizQuestion() {
    if (this.currentQuiz.currentIndex > 0) {
      this.currentQuiz.currentIndex--;
      this.displayQuizQuestion();
      this.updateQuizProgress();
    }
  }

  finishQuiz() {
    this.stopQuizTimer();

    let score = 0;
    this.currentQuiz.questions.forEach((q, i) => {
      if (this.currentQuiz.userAnswers[i] === q.correctAnswer) {
        score++;
      }
    });
    this.currentQuiz.score = score;

    const timeSpent = Math.round((Date.now() - this.currentQuiz.startTime) / 1000);
    const total = this.currentQuiz.questions.length;
    const pct = Math.round((score / total) * 100);

    // Save state
    const topic = this.data.currentTopic;
    if (topic?.contentSlots?.quiz) {
      topic.contentSlots.quiz.completed = true;
      topic.contentSlots.quiz.lastStudied = new Date().toISOString();
      topic.contentSlots.quiz.lastScore = {
        score,
        total,
        percentage: pct,
        timeSpent,
        date: new Date().toISOString(),
        answers: this.currentQuiz.userAnswers.slice()
      };
    }

    this.recordActivity();
    this.saveData(false);

    // Show Results View
    document.getElementById('quiz-question-card')?.classList.add('hidden');
    document.getElementById('quiz-controls')?.classList.add('hidden');

    const res = document.getElementById('quiz-results');
    res?.classList.remove('hidden');

    const finalScore = document.getElementById('final-score');
    const breakdown = document.getElementById('score-breakdown');

    if (finalScore) finalScore.textContent = `${pct}%`;
    if (breakdown) {
      breakdown.textContent = `You scored ${score} out of ${total} in ${Math.floor(timeSpent / 60)}m ${timeSpent % 60}s.`;
    }

    playSoundChime(pct >= 60 ? 'success' : 'wrong');
  }

  updateQuizProgress() {
    const total = this.currentQuiz.questions.length;
    const current = this.currentQuiz.currentIndex + 1;
    const pct = Math.round((current / total) * 100);

    const bar = document.getElementById('quiz-progress-bar');
    const numEl = document.getElementById('quiz-question-number');
    const prevBtn = document.getElementById('quiz-prev-btn');

    if (bar) bar.style.width = `${pct}%`;
    if (numEl) numEl.textContent = `Question ${current} of ${total}`;
    if (prevBtn) prevBtn.disabled = this.currentQuiz.currentIndex === 0;

    let answered = 0;
    this.currentQuiz.userAnswers.forEach(a => { if (a !== null && a !== undefined) answered++; });
    const scoreEl = document.getElementById('quiz-score');
    if (scoreEl) scoreEl.textContent = `Answered: ${answered}/${total}`;
  }

  retakeQuiz() {
    this.stopQuizTimer();
    this.currentQuiz.currentIndex = 0;
    this.currentQuiz.userAnswers = new Array(this.currentQuiz.questions.length).fill(null);
    this.currentQuiz.score = 0;
    this.currentQuiz.seconds = 0;
    this.currentQuiz.startTime = Date.now();
    this.currentQuiz.locked = false;

    document.getElementById('quiz-results')?.classList.add('hidden');
    document.getElementById('quiz-review-card')?.classList.add('hidden');
    document.getElementById('quiz-question-card')?.classList.remove('hidden');
    document.getElementById('quiz-controls')?.classList.remove('hidden');

    this.startQuiz();
  }

  reviewQuizAnswers() {
    document.getElementById('quiz-results')?.classList.add('hidden');
    const reviewCard = document.getElementById('quiz-review-card');
    reviewCard?.classList.remove('hidden');

    const list = document.getElementById('quiz-review-list');
    if (!list) return;

    list.innerHTML = this.currentQuiz.questions.map((q, i) => {
      const userAns = this.currentQuiz.userAnswers[i];
      const isCorrect = userAns === q.correctAnswer;
      const optUser = q.options?.[userAns] || 'Skipped';
      const optCorrect = q.options?.[q.correctAnswer] || '';

      return `
        <div class="p-4 rounded-2xl border ${isCorrect ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20'} space-y-2 text-xs">
          <div class="flex items-start justify-between font-bold">
            <span class="text-slate-900 dark:text-white">${i + 1}. ${escapeHtml(q.question)}</span>
            <span class="${isCorrect ? 'text-emerald-600' : 'text-red-600'} font-black text-sm">${isCorrect ? '✓' : '✗'}</span>
          </div>
          <div class="space-y-1">
            <p class="text-slate-600 dark:text-slate-400">Your choice: <span class="font-bold ${isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}">${escapeHtml(optUser)}</span></p>
            ${!isCorrect ? `<p class="text-slate-600 dark:text-slate-400">Correct answer: <span class="font-bold text-emerald-700 dark:text-emerald-300">${escapeHtml(optCorrect)}</span></p>` : ''}
          </div>
          ${q.explanation ? `<p class="text-[11px] text-slate-500 italic mt-1">Explanation: ${escapeHtml(q.explanation)}</p>` : ''}
        </div>
      `;
    }).join('');
  }

  setupQuizEventListeners() {
    document.getElementById('quiz-submit-btn')?.addEventListener('click', () => this.submitQuizAnswer());
    document.getElementById('quiz-next-btn')?.addEventListener('click', () => this.handleQuizNextOrFinish());
    document.getElementById('quiz-prev-btn')?.addEventListener('click', () => this.prevQuizQuestion());
    document.getElementById('retake-quiz-btn')?.addEventListener('click', () => this.retakeQuiz());
    document.getElementById('quiz-review-btn')?.addEventListener('click', () => this.reviewQuizAnswers());
    document.getElementById('review-back-to-results-btn')?.addEventListener('click', () => this.backToQuizResults());
  }

  backToQuizResults() {
    document.getElementById('quiz-review-card')?.classList.add('hidden');
    document.getElementById('quiz-results')?.classList.remove('hidden');
  }

  // Exports
  exportAnkiTopic() {
    const topic = this.data.currentTopic;
    if (!topic) return;

    const slot = topic.contentSlots?.flashcards;
    const cards = slot?.content?.flashcards || (Array.isArray(slot?.content) ? slot.content : []);

    if (cards.length === 0) {
      this.showToast('No flashcards available to export for this topic', 'error');
      return;
    }

    // Generate TSV for Anki
    const tsvContent = cards.map(c => `${(c.front || c.question || '').replace(/\t/g, ' ')}\t${(c.back || c.answer || '').replace(/\t/g, ' ')}`).join('\n');

    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${topic.name.replace(/[^a-z0-9]/gi, '_')}_anki.tsv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('Anki deck exported (.tsv)!', 'success');
  }

  exportCourseMarkdown() {
    const course = this.data.currentCourse;
    if (!course) return;

    let md = `# Course: ${course.name}\n\n`;
    md += `${course.description || ''}\n\n`;
    md += `---\n\n`;

    (course.topics || []).forEach((topic, idx) => {
      md += `## Topic ${idx + 1}: ${topic.name} (${topic.difficulty || 'Medium'})\n\n`;

      if (topic.contentSlots?.summary?.content) {
        md += `### Summary\n\n${topic.contentSlots.summary.content}\n\n`;
      }
      if (topic.contentSlots?.explainer?.content) {
        md += `### Concept Explainer\n\n${topic.contentSlots.explainer.content}\n\n`;
      }
      if (topic.contentSlots?.flashcards?.content) {
        const cards = topic.contentSlots.flashcards.content.flashcards || [];
        if (cards.length > 0) {
          md += `### Flashcards\n\n`;
          cards.forEach((c, ci) => {
            md += `- **Q${ci + 1}**: ${c.front}\n  - **A**: ${c.back}\n`;
          });
          md += `\n`;
        }
      }
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${course.name.replace(/[^a-z0-9]/gi, '_')}_study_guide.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('Course study guide exported (.md)!', 'success');
  }

  // Prompts & Modals
  getStructurePrompt() {
    const prefs = this.data.settings?.personalization || this._getDefaultPrefs();
    return `You are a world-class educational designer and subject matter tutor.
Analyze the course title and description provided.
Break down this curriculum into 5 to 10 sequential, bite-sized topics.
Strict difficulty setting: ${prefs.difficulty}.

Please format your response EXACTLY like this for each topic:

TOPIC_START
TOPIC_NAME: [Clear topic title]
DIFFICULTY: [Beginner/Intermediate/Advanced]
ESTIMATED_TIME: [Estimated study minutes, e.g. 15]
TOPIC_END

Do not include conversational chatter or filler text. Output the topics directly.`;
  }

  getContentPrompt(type, topic) {
    const prefs = this.data.settings?.personalization || this._getDefaultPrefs();
    const courseName = this.data.currentCourse?.name || 'Subject';
    const topicName = topic?.name || 'Topic';

    const pDepth = `Depth level: ${prefs.depth}.`;
    const pEx = `Examples: ${prefs.examples}.`;
    const pRig = `Rigor: ${prefs.rigor}.`;
    const pDiff = `Target Difficulty: ${topic?.difficulty || prefs.difficulty}.`;

    switch (type) {
      case 'summary':
        return `You are an expert tutor creating a comprehensive study guide.
Course: "${courseName}"
Topic: "${topicName}"
Parameters: ${pDepth} ${pEx} ${pRig} ${pDiff}

Write a comprehensive, crystal-clear study summary in clean Markdown:
- # Overview
- ## Core Principles & Mechanisms
- ## Real-World Examples & Demonstrations
- ## Key Formulas, Definitions & Terminology
- ## Common Pitfalls & Edge Cases
- ## Quick Review Checklist

Make it direct, dense with insight, and visually organized with bold terms and lists.`;

      case 'explainer':
        return `You are Feynman-style master teacher renowned for explaining difficult ideas simply.
Course: "${courseName}"
Topic: "${topicName}"
Parameters: ${pDepth} ${pRig}

Deliver an intuitive deep-dive concept explainer in clean Markdown:
1. The 1-Sentence Core Intuition
2. The Everyday Analogy (relate this to familiar physical intuition)
3. Step-by-Step Breakdown (how and why it works from first principles)
4. Why this matters in practice
5. A thought experiment or 'What if?' scenario testing the boundary conditions.`;

      case 'flashcards':
        return `You are a cognitive science expert specializing in spaced repetition (Anki/SuperMemo).
Generate 10 high-impact, atomic flashcards for:
Course: "${courseName}"
Topic: "${topicName}"
Difficulty: ${topic?.difficulty || prefs.difficulty}

Rules:
- Minimum information principle: Each card must test ONE single concept, definition, mechanism, or distinction.
- Front must be an active recall question or prompt.
- Back must be a concise, direct answer.

Respond ONLY with valid JSON in this exact structure:
\`\`\`json
{
  "flashcards": [
    {
      "front": "What is ...?",
      "back": "..."
    }
  ]
}
\`\`\``;

      case 'quiz':
        return `You are an exam designer creating a high-yield assessment quiz.
Course: "${courseName}"
Topic: "${topicName}"
Difficulty: ${topic?.difficulty || prefs.difficulty}

Create a rigorous 10-question multiple choice quiz.
Each question must test conceptual understanding or problem solving, not pure trivia.
Provide 4 options (A, B, C, D) and a detailed explanation for why the correct answer is right and distractors are wrong.

Respond ONLY with valid JSON in this exact structure:
\`\`\`json
{
  "questions": [
    {
      "question": "Clear question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Detailed explanation of the solution..."
    }
  ]
}
\`\`\`
Note: correctAnswer is the 0-indexed number (0 for first option, 1 for second, 2 for third, 3 for fourth).`;

      default:
        return `Generate comprehensive educational study material for ${topicName}.`;
    }
  }

  showPromptModal(title, prompt) {
    const modal = document.getElementById('prompt-modal');
    const titleEl = document.getElementById('prompt-modal-title');
    const textEl = document.getElementById('prompt-text');

    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.value = prompt;
    modal?.classList.remove('hidden');
  }

  hidePromptModal() {
    const modal = document.getElementById('prompt-modal');
    modal?.classList.add('hidden');
  }

  copyPromptToClipboard() {
    const textEl = document.getElementById('prompt-text');
    if (!textEl) return;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(textEl.value)
        .then(() => {
          this.showToast('Prompt copied to clipboard! Paste it into Gemini or ChatGPT. 📋', 'success');
          this.hidePromptModal();
        })
        .catch(() => {
          this.fallbackCopyPrompt(textEl.value);
          this.hidePromptModal();
        });
    } else {
      this.fallbackCopyPrompt(textEl.value);
      this.hidePromptModal();
    }
  }

  // Study View (Smart Queue)
  loadStudyView() {
    const container = document.getElementById('study-queue');
    if (!container) return;

    const dueCards = [];
    const unstudiedSlots = [];
    const today = this._today();

    (this.data.courses || []).forEach(course => {
      (course.topics || []).forEach(topic => {
        // 1. Check SRS Flashcards due
        const srsSlot = topic.contentSlots?.flashcards;
        if (srsSlot?.content && srsSlot.srs?.cards) {
          const cardsMap = srsSlot.srs.cards;
          let countDue = 0;
          for (const cid in cardsMap) {
            if (cardsMap[cid].due <= today) countDue++;
          }
          if (countDue > 0) {
            dueCards.push({
              course,
              topic,
              dueCount: countDue
            });
          }
        }

        // 2. Check unstudied or incomplete materials
        ['summary', 'explainer', 'flashcards', 'quiz'].forEach(type => {
          const slot = topic.contentSlots?.[type];
          if (slot?.content && !slot.completed) {
            unstudiedSlots.push({ course, topic, type });
          }
        });
      });
    });

    if (dueCards.length === 0 && unstudiedSlots.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 px-4 bg-slate-50 dark:bg-slate-850 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 space-y-2">
          <span class="text-4xl block mb-2">🎉</span>
          <h3 class="font-bold text-slate-800 dark:text-slate-200 text-sm">You are all caught up!</h3>
          <p class="text-xs">No flashcard reviews are due today, and all current modules have been reviewed.</p>
          <button onclick="window.app.showView('courses')" class="mt-4 px-4 py-2 bg-primary-600 text-white rounded-xl text-xs font-bold hover:bg-primary-700 transition">
            Explore Courses
          </button>
        </div>
      `;
      return;
    }

    let html = '';

    if (dueCards.length > 0) {
      html += `<h3 class="font-bold text-xs uppercase tracking-wider text-rose-600 dark:text-rose-400 px-1 mb-2">🔥 Due Spaced Repetition (SRS)</h3>`;
      dueCards.forEach(item => {
        html += `
          <div class="bg-white dark:bg-slate-850 border border-rose-200 dark:border-rose-950 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-rose-600">${escapeHtml(item.course.name)}</span>
              <h4 class="font-bold text-slate-900 dark:text-white text-sm">${escapeHtml(item.topic.name)}</h4>
              <p class="text-xs text-slate-500">${item.dueCount} flashcard reviews due today</p>
            </div>
            <button onclick="window.app.openFlashcardsStudy('${item.topic.id}')" class="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition">
              Review Now 🃏
            </button>
          </div>
        `;
      });
    }

    if (unstudiedSlots.length > 0) {
      html += `<h3 class="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 px-1 mt-4 mb-2">📖 Modules Ready to Study</h3>`;
      unstudiedSlots.forEach(item => {
        html += `
          <div class="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-primary-600">${escapeHtml(item.course.name)}</span>
              <h4 class="font-bold text-slate-900 dark:text-white text-sm">${escapeHtml(item.topic.name)}</h4>
              <p class="text-xs text-slate-500 capitalize">${item.type} module</p>
            </div>
            <button onclick="window.app.openContent('${item.type}', '${item.topic.id}')" class="bg-primary-600 hover:bg-primary-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition">
              Study
            </button>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  }

  markContentCompleted(type, topicId) {
    const topic = this.findTopicById(this.data.currentCourse, topicId);
    if (!topic?.contentSlots?.[type]) return;

    topic.contentSlots[type].completed = true;
    topic.contentSlots[type].lastStudied = new Date().toISOString();
    this.recordActivity();
    this.saveData(false);
    playSoundChime('success');
    this.showToast(`Marked ${this.capitalize(type)} as completed!`, 'success');

    if (this.data.currentView === 'topic-detail') this.loadTopicDetail();
    if (this.data.currentView === 'study') this.loadStudyView();
  }

  unmarkContentCompleted(type, topicId) {
    const topic = this.findTopicById(this.data.currentCourse, topicId);
    if (!topic?.contentSlots?.[type]) return;

    topic.contentSlots[type].completed = false;
    this.saveData(false);
    this.showToast(`Unmarked ${this.capitalize(type)}.`, 'info');

    if (this.data.currentView === 'topic-detail') this.loadTopicDetail();
    if (this.data.currentView === 'study') this.loadStudyView();
  }

  // Utilities
  renderMarkdown(md) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      const rawHtml = marked.parse(md || '');
      return DOMPurify.sanitize(rawHtml);
    }
    return `<pre class="whitespace-pre-wrap font-sans text-xs">${escapeHtml(md)}</pre>`;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-emerald-600 text-white' :
               type === 'error' ? 'bg-rose-600 text-white' :
               'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900';

    toast.className = `${bg} px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center space-x-2 transition-all transform duration-200 pointer-events-auto max-w-xs`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'ℹ')}</span>
      <span class="flex-1">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Backup & Import
  exportData() {
    const jsonStr = JSON.stringify(this.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study_buddy_backup_${this._today()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    this.showToast('Backup JSON downloaded!', 'success');
  }

  importData() {
    document.getElementById('import-file-input')?.click();
  }

  handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported || typeof imported !== 'object') throw new Error('Invalid JSON');

        if (!confirm('This will replace your current study data. Continue?')) {
          event.target.value = '';
          return;
        }

        this.data = imported;
        this.migrateDataSchema();
        this.saveData(false);
        this.initDarkModeState();
        this.checkAndUpdateStreak();
        this.updateDashboard();
        this.showView('dashboard');
        playSoundChime('success');
        this.showToast('Backup restored successfully!', 'success');
      } catch (err) {
        this.showToast('Failed to import backup: ' + err.message, 'error');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  clearAllData() {
    if (!confirm('Are you ABSOLUTELY sure? This will delete all courses, topics, and study progress.')) return;
    if (!confirm('Second confirmation: All data will be permanently wiped.')) return;

    localStorage.removeItem('studyBuddyData');
    localStorage.removeItem('theme');
    location.reload();
  }
}

// Global bootstrap
function initApp() {
  if (!window.app) {
    window.app = new StudyBuddyApp();
    window.appInstance = window.app;
  }
  return window.app;
}

// Attach listener and run immediate fallback
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Global property alias
var app = window.app;
Object.defineProperty(window, 'app', {
  get: () => window.appInstance,
  set: (val) => { window.appInstance = val; }
});

// View routing helper for inline onclicks
function showView(viewName) {
  if (window.app) window.app.showView(viewName);
}

function copyPrompt(type) {
  if (!window.app) return;
  const topic = window.app.data.currentTopic || { name: 'Selected Topic', id: 'topic_id', difficulty: 'Medium' };
  const prompt = type === 'structure' ? window.app.getStructurePrompt() : window.app.getContentPrompt(type, topic);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(prompt)
      .then(() => window.app.showToast('Prompt copied to clipboard! Paste it into Gemini or ChatGPT. 📋', 'success'))
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
