// app.js - Production Ready & Refined

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
    this.menuOpen = false;
    this.quizMasteryThreshold = 70; // auto-complete quiz at or above this %
    this._flash = null;
    this._flashWired = false;

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

  // Dark Mode Initialization & Sync
  initDarkModeState() {
    const storedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // If settings has darkMode explicitly saved as boolean, honor it; otherwise detect
    if (typeof this.data.settings?.darkMode === 'boolean') {
      this.applyDarkMode(this.data.settings.darkMode);
    } else {
      const isDark = storedTheme === 'dark' || (!storedTheme && prefersDark);
      this.data.settings.darkMode = isDark;
      this.applyDarkMode(isDark);
    }
  }

  applyDarkMode(enabled) {
    document.documentElement.classList.toggle('dark', enabled);
    try {
      localStorage.setItem('theme', enabled ? 'dark' : 'light');
    } catch { }
    const darkToggle = document.getElementById('dark-mode-toggle');
    if (darkToggle && darkToggle.checked !== enabled) {
      darkToggle.checked = enabled;
    }
  }

  // Persistence
  saveData(showToast = true) {
    try {
      localStorage.setItem('studyBuddyData', JSON.stringify(this.data));
      if (showToast) this.showToast('Data saved successfully', 'success');
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

    // Backfill personalization defaults
    this.data.settings = this.data.settings || {};
    this.data.settings.personalization = this.data.settings.personalization || {};
    const pp = this.data.settings.personalization;
    if (!pp.depth) pp.depth = 'standard';
    if (!pp.examples) pp.examples = 'medium';
    if (!pp.rigor) pp.rigor = 'light';
    if (typeof pp.readTime !== 'number') pp.readTime = 10;
    if (!pp.difficulty) pp.difficulty = 'Intermediate';
    if (!pp.citation) pp.citation = 'minimal';
    if (typeof pp.flashcardsCount !== 'number') pp.flashcardsCount = 15;

    // Backfill stats
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

  // Streak tracking (using local calendar day)
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

    if (last === today) return; // Already recorded today

    const yesterday = this._addDays(-1);
    if (last === yesterday) {
      this.data.stats.streak += 1;
    } else {
      this.data.stats.streak = 1; // Streak reset
    }
    this.data.stats.lastActiveDate = today;
    this.saveData(false);
  }

  recordActivity() {
    this.checkAndUpdateStreak();
    this.updateDashboard();
  }

  _getDefaultPrefs() {
    return {
      depth: 'standard',
      examples: 'medium',
      rigor: 'light',
      readTime: 10,
      difficulty: 'Intermediate',
      citation: 'minimal',
      flashcardsCount: 15
    };
  }

  syncPreferencesUI() {
    const pp = this.data.settings.personalization || this._getDefaultPrefs();
    const el = (id) => document.getElementById(id);

    const darkToggle = el('dark-mode-toggle');
    if (darkToggle) darkToggle.checked = !!this.data.settings.darkMode;

    const depthEl = el('pref-depth');
    const exEl = el('pref-examples');
    const rigEl = el('pref-rigor');
    const diffEl = el('pref-difficulty');
    const citEl = el('pref-citation');
    const rtEl = el('pref-readtime');
    const rtVal = el('pref-readtime-value');
    const fcEl = el('pref-fc-count');

    if (!depthEl) return;

    depthEl.value = pp.depth;
    exEl.value = pp.examples;
    rigEl.value = pp.rigor;
    diffEl.value = pp.difficulty;
    citEl.value = pp.citation;
    rtEl.value = pp.readTime;
    if (rtVal) rtVal.textContent = String(pp.readTime);
    fcEl.value = pp.flashcardsCount;
  }

  _initPreferenceControls() {
    this.syncPreferencesUI();

    const el = (id) => document.getElementById(id);
    const depthEl = el('pref-depth');
    const exEl = el('pref-examples');
    const rigEl = el('pref-rigor');
    const diffEl = el('pref-difficulty');
    const citEl = el('pref-citation');
    const rtEl = el('pref-readtime');
    const rtVal = el('pref-readtime-value');
    const fcEl = el('pref-fc-count');
    const resetEl = el('prefs-reset-btn');

    if (!depthEl) return;

    const pp = this.data.settings.personalization;
    const save = () => {
      this.saveData(false);
      this.showToast('Preferences saved', 'success');
    };

    depthEl.addEventListener('change', e => { pp.depth = e.target.value; save(); });
    exEl.addEventListener('change', e => { pp.examples = e.target.value; save(); });
    rigEl.addEventListener('change', e => { pp.rigor = e.target.value; save(); });
    diffEl.addEventListener('change', e => { pp.difficulty = e.target.value; save(); });
    citEl.addEventListener('change', e => { pp.citation = e.target.value; save(); });
    rtEl.addEventListener('input', e => { if (rtVal) rtVal.textContent = e.target.value; });
    rtEl.addEventListener('change', e => { pp.readTime = Number(e.target.value); save(); });
    fcEl.addEventListener('change', e => {
      let n = Number(e.target.value);
      if (!Number.isFinite(n)) n = 15;
      n = Math.max(5, Math.min(50, n));
      pp.flashcardsCount = n;
      e.target.value = String(n);
      save();
    });

    resetEl?.addEventListener('click', () => {
      this.data.settings.personalization = this._getDefaultPrefs();
      this.syncPreferencesUI();
      this.saveData(false);
      this.showToast('Preferences reset to defaults', 'info');
    });
  }

  // Event Listeners
  setupEventListeners() {
    // Navigation
    document.getElementById('back-btn')?.addEventListener('click', () => this.goBack());

    // Menu button & popover
    document.getElementById('menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHeaderMenu();
    });

    document.addEventListener('click', (e) => {
      if (this.menuOpen) {
        const menu = document.getElementById('header-menu');
        const btn = document.getElementById('menu-btn');
        if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
          this.closeHeaderMenu();
        }
      }
    });

    document.getElementById('header-menu')?.addEventListener('click', (e) => {
      const action = e.target.closest('button')?.dataset?.menuAction;
      if (!action) return;
      if (action === 'settings') this.showView('settings');
      if (action === 'prompts') this.showView('prompts');
      if (action === 'export') this.exportData();
      this.closeHeaderMenu();
    });

    // Course management
    document.getElementById('add-course-btn')?.addEventListener('click', () => this.showAddCourseModal());
    document.getElementById('add-course-form')?.addEventListener('submit', (e) => this.addCourse(e));
    document.getElementById('cancel-course-btn')?.addEventListener('click', () => this.hideAddCourseModal());

    // Modals backdrop clicks & ESC key
    document.getElementById('add-course-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'add-course-modal') this.hideAddCourseModal();
    });
    document.getElementById('prompt-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'prompt-modal') this.hidePromptModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideAddCourseModal();
        this.hidePromptModal();
        this.closeFlashcardsStudy();
      }
    });

    // Structure handling
    document.getElementById('get-structure-prompt-btn')?.addEventListener('click', () => this.showStructurePrompt());
    document.getElementById('parse-structure-btn')?.addEventListener('click', () => this.parseStructureResponse());

    // Content management
    document.getElementById('get-content-prompt-btn')?.addEventListener('click', () => this.showContentPrompt());
    document.getElementById('save-content-btn')?.addEventListener('click', () => this.saveContent());
    document.getElementById('cancel-content-btn')?.addEventListener('click', () => this.cancelContentEdit());
    document.getElementById('edit-content-btn')?.addEventListener('click', () => this.editContent());
    document.getElementById('delete-content-btn')?.addEventListener('click', () => this.deleteContent());

    // Prompt modal
    document.getElementById('close-prompt-modal')?.addEventListener('click', () => this.hidePromptModal());
    document.getElementById('copy-prompt-btn')?.addEventListener('click', () => this.copyPromptToClipboard());

    // Settings
    document.getElementById('export-data-btn')?.addEventListener('click', () => this.exportData());
    document.getElementById('import-data-btn')?.addEventListener('click', () => this.importData());
    document.getElementById('import-file-input')?.addEventListener('change', (e) => this.handleImportFile(e));
    document.getElementById('clear-all-data-btn')?.addEventListener('click', () => this.clearAllData());

    // Dark mode toggle
    const darkToggle = document.getElementById('dark-mode-toggle');
    if (darkToggle) {
      darkToggle.checked = !!this.data.settings.darkMode;
      darkToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        this.data.settings.darkMode = enabled;
        this.applyDarkMode(enabled);
        this.saveData(false);
        this.showToast(`Dark mode ${enabled ? 'enabled' : 'disabled'}`, 'info');
      });
    }

    // Flashcards delegation
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-start-flashcards]');
      if (!btn) return;
      const topicId = btn.getAttribute('data-topic-id') || this.data.currentTopic?.id;
      this.openFlashcardsStudy(topicId);
    });

    // Quiz
    this.setupQuizEventListeners();
    this._initPreferenceControls();
  }

  toggleHeaderMenu() {
    const menu = document.getElementById('header-menu');
    const btn = document.getElementById('menu-btn');
    this.menuOpen = !this.menuOpen;
    if (btn) btn.setAttribute('aria-expanded', this.menuOpen ? 'true' : 'false');
    if (this.menuOpen && menu) {
      menu.classList.remove('hidden');
      menu.classList.add('popover-enter');
      requestAnimationFrame(() => menu.classList.add('popover-enter-active'));
      setTimeout(() => menu.classList.remove('popover-enter', 'popover-enter-active'), 150);
    } else {
      this.closeHeaderMenu();
    }
  }

  closeHeaderMenu() {
    const menu = document.getElementById('header-menu');
    if (menu) menu.classList.add('hidden');
    this.menuOpen = false;
    const btn = document.getElementById('menu-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  setupQuizEventListeners() {
    document.getElementById('quiz-submit-btn')?.addEventListener('click', () => this.submitQuizAnswer());
    document.getElementById('quiz-next-btn')?.addEventListener('click', () => this.handleQuizNextOrFinish());
    document.getElementById('quiz-prev-btn')?.addEventListener('click', () => this.prevQuizQuestion());
    document.getElementById('retake-quiz-btn')?.addEventListener('click', () => this.retakeQuiz());
    document.getElementById('quiz-review-btn')?.addEventListener('click', () => this.reviewQuizAnswers());
    document.getElementById('review-back-to-results-btn')?.addEventListener('click', () => this.backToQuizResults());
  }

  markContentCompleted(type, topicId) {
    const cIdx = this.data.courses.findIndex(c => c.id === this.data.currentCourse?.id);
    if (cIdx < 0) return;
    const tIdx = this.data.courses[cIdx].topics.findIndex(t => t.id === topicId);
    if (tIdx < 0) return;
    const slot = this.data.courses[cIdx].topics[tIdx].contentSlots[type];
    if (!slot || slot.status === 'empty') {
      this.showToast('Generate content before marking completed', 'warning');
      return;
    }
    slot.completed = true;
    slot.lastUpdated = new Date().toISOString();
    this.recordActivity();
    this.saveData(false);
    this.showToast('Marked as completed ✅', 'success');
    this.loadContentSlots(this.data.courses[cIdx].topics[tIdx]);
    this.loadTopicDetail({ topicId });
  }

  unmarkContentCompleted(type, topicId) {
    const cIdx = this.data.courses.findIndex(c => c.id === this.data.currentCourse?.id);
    if (cIdx < 0) return;
    const tIdx = this.data.courses[cIdx].topics.findIndex(t => t.id === topicId);
    if (tIdx < 0) return;
    const slot = this.data.courses[cIdx].topics[tIdx].contentSlots[type];
    if (!slot) return;
    slot.completed = false;
    slot.lastUpdated = new Date().toISOString();
    this.saveData(false);
    this.showToast('Completion undone', 'info');
    this.loadContentSlots(this.data.courses[cIdx].topics[tIdx]);
    this.loadTopicDetail({ topicId });
  }

  // Navigation
  showView(viewName, data = null) {
    if (this.data.currentView === 'quiz' && viewName !== 'quiz') {
      this.stopQuizTimer();
    }

    document.querySelectorAll('.view-content').forEach(v => v.classList.add('hidden'));
    const view = document.getElementById(`${viewName}-view`);
    if (view) {
      view.classList.remove('hidden');
      this.data.currentView = viewName;
      this.updateHeader(viewName);
      this.updateNavigation(viewName);

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
        case 'settings':
          this.syncPreferencesUI();
          break;
        default:
          break;
      }
    }
  }

  goBack() {
    switch (this.data.currentView) {
      case 'course-detail':
        this.showView('courses');
        break;
      case 'topic-detail':
        this.showView('course-detail', { courseId: this.data.currentCourse?.id });
        break;
      case 'content':
      case 'quiz':
        this.showView('topic-detail', { topicId: this.data.currentTopic?.id });
        break;
      default:
        this.showView('dashboard');
    }
  }

  updateHeader(viewName) {
    const backBtn = document.getElementById('back-btn');
    const headerTitle = document.getElementById('header-title');
    const headerSubtitle = document.getElementById('header-subtitle');

    if (['dashboard', 'courses', 'prompts', 'settings', 'study'].includes(viewName)) {
      backBtn?.classList.add('hidden');
    } else {
      backBtn?.classList.remove('hidden');
    }

    switch (viewName) {
      case 'dashboard':
        headerTitle.textContent = 'Study Buddy';
        headerSubtitle.textContent = '';
        break;
      case 'courses':
        headerTitle.textContent = 'My Courses';
        headerSubtitle.textContent = '';
        break;
      case 'course-detail':
        headerTitle.textContent = this.data.currentCourse?.name || 'Course';
        headerSubtitle.textContent = 'Course Structure';
        break;
      case 'topic-detail':
        headerTitle.textContent = this.data.currentTopic?.name || 'Topic';
        headerSubtitle.textContent = this.data.currentCourse?.name || '';
        break;
      case 'content':
        headerTitle.textContent = this.data.currentContent?.type ? this.capitalize(this.data.currentContent.type) : 'Content';
        headerSubtitle.textContent = this.data.currentTopic?.name || '';
        break;
      case 'quiz':
        headerTitle.textContent = 'Quiz';
        headerSubtitle.textContent = this.data.currentTopic?.name || '';
        break;
      case 'prompts':
        headerTitle.textContent = 'Prompts Library';
        headerSubtitle.textContent = '';
        break;
      case 'settings':
        headerTitle.textContent = 'Settings';
        headerSubtitle.textContent = '';
        break;
      case 'study':
        headerTitle.textContent = 'Study';
        headerSubtitle.textContent = 'Smart Queue';
        break;
      default:
        break;
    }
  }

  updateNavigation(viewName) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.remove('text-primary-500');
      btn.classList.add('text-gray-400');
    });

    let navTarget = viewName;
    if (['course-detail', 'topic-detail', 'content', 'quiz'].includes(viewName)) {
      navTarget = 'courses';
    }

    const activeBtn = document.querySelector(`[onclick="showView('${navTarget}')"]`);
    if (activeBtn) {
      activeBtn.classList.remove('text-gray-400');
      activeBtn.classList.add('text-primary-500');
    }
  }

  // Dashboard
  updateDashboard() {
    const totalCoursesEl = document.getElementById('total-courses');
    if (totalCoursesEl) totalCoursesEl.textContent = this.data.courses.length;

    const streakEl = document.getElementById('study-streak');
    if (streakEl) streakEl.textContent = this.data.stats?.streak || 0;

    this.loadRecentActivity();
  }

  loadRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    if (this.data.courses.length === 0) {
      container.innerHTML = `
        <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-center text-gray-500 dark:text-gray-400">
          <p class="text-sm">No recent activity</p>
          <p class="text-xs mt-1">Start by creating a course!</p>
        </div>
      `;
    } else {
      const recentItems = this.data.courses.slice(-3).reverse();
      container.innerHTML = recentItems.map(course => `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
             onclick="app.openCourse('${course.id}')">
          <h4 class="font-medium text-gray-800 dark:text-gray-200">${escapeHtml(course.name)}</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">${course.topics?.length || 0} topics</p>
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

  // Courses
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
    const name = document.getElementById('course-name').value.trim();
    const description = document.getElementById('course-description').value.trim();
    if (!name) {
      this.showToast('Please enter a course name', 'error');
      return;
    }
    const newCourse = {
      id: Date.now().toString(),
      name,
      description,
      created: new Date().toISOString(),
      topics: [],
      structureAnalyzed: false
    };
    this.data.courses.push(newCourse);
    this.recordActivity();
    this.saveData();
    this.hideAddCourseModal();
    this.showToast('Course created successfully!', 'success');
    this.loadCourses();
  }

  confirmDeleteCourse(courseId, ev) {
    try { ev && ev.stopPropagation && ev.stopPropagation(); } catch { }
    const course = this.findCourseById(courseId);
    if (!course) return;

    if (!confirm(`Delete "${course.name}" and all its topics and content?\nThis cannot be undone.`)) return;
    this.deleteCourse(courseId);
  }

  deleteCourse(courseId) {
    const idx = this.data.courses.findIndex(c => c.id === courseId);
    if (idx === -1) return;

    const wasCurrent = this.data.currentCourse && this.data.currentCourse.id === courseId;
    this.data.courses.splice(idx, 1);

    if (wasCurrent) {
      this.data.currentCourse = null;
      this.data.currentTopic = null;
      this.data.currentContent = null;
    }

    this.saveData(false);
    this.showToast('Course deleted', 'success');

    const inCourseContext = ['course-detail', 'topic-detail', 'content', 'quiz'].includes(this.data.currentView);
    if (wasCurrent && inCourseContext) {
      this.showView('courses');
    } else {
      if (this.data.currentView === 'courses') this.loadCourses();
      if (this.data.currentView === 'dashboard') this.updateDashboard();
      if (this.data.currentView === 'study') this.loadStudyView();
    }

    this.updateDashboard();
  }

  loadCourses() {
    const container = document.getElementById('courses-list');
    if (!container) return;

    if (this.data.courses.length === 0) {
      container.innerHTML = `
        <div class="bg-gray-100 dark:bg-gray-800 p-8 rounded-lg text-center text-gray-500 dark:text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p class="text-lg font-medium mb-2">No courses yet</p>
          <p class="text-sm">Create your first course to get started!</p>
        </div>
      `;
    } else {
      container.innerHTML = this.data.courses.map(course => `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
             onclick="app.openCourse('${course.id}')">
          <div class="flex items-start justify-between">
            <div class="flex-1 pr-2">
              <h3 class="font-semibold text-gray-800 dark:text-gray-100 mb-1">${escapeHtml(course.name)}</h3>
              ${course.description ? `<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">${escapeHtml(course.description)}</p>` : ''}
              <div class="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                <span>${course.topics?.length || 0} topics</span>
                <span>Created ${new Date(course.created).toLocaleDateString()}</span>
              </div>
            </div>
            <div class="flex flex-col items-end space-y-2">
              ${course.structureAnalyzed
                ? '<span class="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded-full text-xs">Structured</span>'
                : '<span class="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 px-2 py-1 rounded-full text-xs">Setup Required</span>'}
              <button class="text-red-600 dark:text-red-400 text-xs hover:underline"
                      onclick="app.confirmDeleteCourse('${course.id}', event)">
                Delete
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  loadCourseDetail(data) {
    const courseId = data?.courseId || this.data.currentCourse?.id;
    let course = this.findCourseById(courseId);
    if (course) {
      this.data.currentCourse = course;
    } else {
      course = this.data.currentCourse;
    }

    if (!course) {
      this.showView('courses');
      return;
    }

    if (!course.structureAnalyzed) {
      document.getElementById('structure-prompt-card').style.display = 'block';
      document.getElementById('paste-structure-card').style.display = 'none';
      document.getElementById('topics-section').classList.add('hidden');
    } else {
      document.getElementById('structure-prompt-card').style.display = 'none';
      document.getElementById('paste-structure-card').style.display = 'none';
      document.getElementById('topics-section').classList.remove('hidden');
      this.loadTopics();
    }
  }

  showStructurePrompt() {
    const promptCard = document.getElementById('structure-prompt-card');
    const pasteCard = document.getElementById('paste-structure-card');
    if (promptCard) promptCard.style.display = 'none';
    if (pasteCard) pasteCard.style.display = 'block';

    const prompt = this.getStructurePrompt();
    this.showPromptModal('Course Structure Analyzer', prompt);
  }

  parseStructureResponse() {
    const response = document.getElementById('structure-response').value.trim();
    if (!response) {
      this.showToast('Please paste the AI response', 'error');
      return;
    }
    try {
      const topics = this.parseStructureText(response);
      if (!topics.length) {
        this.showToast('No topics found. Please verify the AI response format.', 'error');
        return;
      }
      const course = this.data.currentCourse;
      const idx = this.data.courses.findIndex(c => c.id === course.id);
      if (idx !== -1) {
        this.data.courses[idx].topics = topics;
        this.data.courses[idx].structureAnalyzed = true;
        this.data.currentCourse = this.data.courses[idx];
        this.recordActivity();
        this.saveData();
        this.showToast('Course structure created successfully!', 'success');
        this.loadCourseDetail({ courseId: this.data.currentCourse.id });
      }
    } catch (error) {
      this.showToast('Failed to parse structure. Check the format.', 'error');
      console.error('Parse error:', error);
    }
  }

  parseStructureText(text) {
    const topics = [];
    const lines = text.split('\n');
    let currentTopic = null;

    for (let raw of lines) {
      const line = raw.trim();

      if (line.includes('TOPIC_START:')) {
        const topicMatch = line.match(/TOPIC_START:\s*(.+?)(?:\s*##|$)/);
        if (topicMatch) {
          currentTopic = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
            name: cleanBrackets(topicMatch[1]),
            difficulty: cleanBrackets(this.extractValue(line, 'DIFFICULTY')) || 'Medium',
            category: cleanBrackets(this.extractValue(line, 'CATEGORY')) || 'General',
            subtopics: [],
            contentSlots: this.createEmptyContentSlots()
          };
          topics.push(currentTopic);
        }
      }

      if (currentTopic && line.includes('SUBTOPIC:')) {
        const subtopicMatch = line.match(/SUBTOPIC:\s*(.+?)(?:\s*##|$)/);
        if (subtopicMatch) {
          const rawConcepts = this.extractValue(line, 'CONCEPTS');
          const cleanConcepts = rawConcepts
            ? cleanBrackets(rawConcepts).split(',').map(c => cleanBrackets(c.trim())).filter(Boolean)
            : [];
          currentTopic.subtopics.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
            name: cleanBrackets(subtopicMatch[1]),
            concepts: cleanConcepts
          });
        }
      }

      if (line.includes('TOPIC_END')) {
        currentTopic = null;
      }
    }

    // Markdown heading fallback
    if (topics.length === 0) {
      for (let line of lines) {
        if (/^#{2,3}\s+/.test(line)) {
          const topicName = cleanBrackets(line.replace(/^#+\s*/, '').trim());
          if (topicName && !topics.find(t => t.name === topicName)) {
            topics.push({
              id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
              name: topicName,
              difficulty: 'Medium',
              category: 'General',
              subtopics: [],
              contentSlots: this.createEmptyContentSlots()
            });
          }
        }
      }
    }

    return topics;
  }

  extractValue(text, key) {
    const regex = new RegExp(`${key}:\\s*([^#\\n]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  createEmptyContentSlots() {
    return {
      summary: { status: 'empty', content: null, lastUpdated: null, completed: false },
      flashcards: { status: 'empty', content: null, lastUpdated: null, completed: false, srs: { cards: {} } },
      quiz: { status: 'empty', content: null, lastUpdated: null, completed: false, attempts: [], bestScore: 0 },
      explainer: { status: 'empty', content: null, lastUpdated: null, completed: false },
      practice: { status: 'empty', content: null, lastUpdated: null, completed: false },
      review: { status: 'empty', content: null, lastUpdated: null, completed: false }
    };
  }

  loadTopics() {
    const container = document.getElementById('topics-list');
    const course = this.data.currentCourse;
    const topics = course?.topics || [];
    if (!container) return;

    if (topics.length === 0) {
      container.innerHTML = `
        <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-center text-gray-500 dark:text-gray-400">
          <p class="text-sm">No topics found</p>
          <p class="text-xs mt-1">Try re-parsing the structure</p>
        </div>
      `;
      return;
    }

    container.innerHTML = topics.map(topic => {
      const completed = Object.values(topic.contentSlots || {}).filter(slot => slot.completed === true).length;
      const total = Object.keys(topic.contentSlots || {}).length;
      const progress = Math.round((completed / Math.max(total, 1)) * 100);

      return `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
             onclick="app.openTopic('${topic.id}')">
          <div class="flex items-start justify-between mb-2">
            <h4 class="font-semibold text-gray-800 dark:text-gray-100">${escapeHtml(topic.name)}</h4>
            <span class="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 px-2 py-1 rounded-full text-xs">${escapeHtml(topic.difficulty)}</span>
          </div>
          <div class="mb-3">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-gray-600 dark:text-gray-400">Progress</span>
              <span class="text-xs text-gray-600 dark:text-gray-400">${completed}/${total}</span>
            </div>
            <div class="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div class="bg-primary-500 h-2 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
            </div>
          </div>
          ${topic.subtopics?.length
            ? `<div class="text-xs text-gray-500 dark:text-gray-400">Subtopics: ${escapeHtml(topic.subtopics.map(s => s.name).join(', '))}</div>`
            : ''
          }
        </div>
      `;
    }).join('');
  }

  loadTopicDetail(data) {
    const course = this.data.currentCourse;
    const topicId = data?.topicId || this.data.currentTopic?.id;
    let topic = this.findTopicById(course, topicId) || this.data.currentTopic;

    if (topic) {
      this.data.currentTopic = topic;
    } else {
      this.showView('courses');
      return;
    }

    document.getElementById('topic-title').textContent = topic.name;
    document.getElementById('topic-difficulty').textContent = topic.difficulty;

    const completed = Object.values(topic.contentSlots || {}).filter(slot => slot.completed === true).length;
    const total = Object.keys(topic.contentSlots || {}).length;
    document.getElementById('topic-progress').textContent = `${completed}/${total} completed`;
    this.loadContentSlots(topic);
  }

  loadContentSlots(topic) {
    const container = document.getElementById('content-slots');
    if (!container) return;

    const contentTypes = {
      summary: { icon: '📝', name: 'Summary', btnClass: 'bg-blue-600 hover:bg-blue-700' },
      flashcards: { icon: '🃏', name: 'Flashcards', btnClass: 'bg-emerald-600 hover:bg-emerald-700' },
      quiz: { icon: '📊', name: 'Quiz', btnClass: 'bg-purple-600 hover:bg-purple-700' },
      explainer: { icon: '💡', name: 'Concept Explainer', btnClass: 'bg-amber-600 hover:bg-amber-700' },
      practice: { icon: '🔧', name: 'Practice Problems', btnClass: 'bg-rose-600 hover:bg-rose-700' },
      review: { icon: '📚', name: 'Topic Review', btnClass: 'bg-indigo-600 hover:bg-indigo-700' }
    };

    container.innerHTML = Object.entries(topic.contentSlots).map(([type, slot]) => {
      const t = contentTypes[type] || { icon: '📄', name: this.capitalize(type), btnClass: 'bg-primary-500 hover:bg-primary-600' };
      const isEmpty = slot.status === 'empty';
      const isCompleted = slot.completed === true;

      const statusChip = isEmpty
        ? '<span class="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 px-2 py-1 rounded-full text-xs">Empty</span>'
        : isCompleted
          ? '<span class="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded-full text-xs font-medium">✓ Completed</span>'
          : '<span class="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded-full text-xs">Ready</span>';

      const actions = isEmpty ? `
        <button onclick="app.openContent('${type}', '${topic.id}')" class="w-full ${t.btnClass} text-white p-2.5 rounded-lg text-sm font-medium transition-colors">
          📋 Get Prompt & Create Content
        </button>
      ` : `
        <div class="flex flex-wrap gap-2">
          ${type === 'quiz' ? `
            <button onclick="app.openQuiz('${topic.id}')" class="flex-1 bg-purple-600 text-white p-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
              🎯 Take Quiz
            </button>
          ` : `
            <button onclick="app.openContent('${type}', '${topic.id}')" class="flex-1 bg-gray-600 dark:bg-gray-700 text-white p-2 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
              👁️ View Content
            </button>
          `}
          ${isCompleted ? `
            <button onclick="app.unmarkContentCompleted('${type}', '${topic.id}')" class="px-3 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 p-2 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Undo</button>
          ` : `
            <button onclick="app.markContentCompleted('${type}', '${topic.id}')" class="px-3 bg-green-600 text-white p-2 rounded-lg text-sm hover:bg-green-700 transition-colors">Mark Done</button>
          `}
          <button onclick="app.openContent('${type}', '${topic.id}')" aria-label="Edit content" class="px-3 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 p-2 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">✏️</button>
        </div>
      `;

      return `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2">
              <span class="text-lg">${t.icon}</span>
              <span class="font-medium text-gray-800 dark:text-gray-100">${escapeHtml(t.name)}</span>
            </div>
            <div>${statusChip}</div>
          </div>
          <div class="space-y-2">
            ${actions}
            ${slot.lastUpdated ? `<p class="text-xs text-gray-500 dark:text-gray-400">Last updated: ${new Date(slot.lastUpdated).toLocaleDateString()}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Content View
  loadContentView(data) {
    const type = data?.type || this.data.currentContent?.type;
    const topicId = data?.topicId || this.data.currentContent?.topicId || this.data.currentTopic?.id;
    const course = this.data.currentCourse;
    const topic = this.findTopicById(course, topicId);
    if (!topic || !type) {
      this.goBack();
      return;
    }

    this.data.currentTopic = topic;
    this.data.currentContent = { type, topicId };

    const map = {
      summary: 'Summary',
      flashcards: 'Flashcards',
      quiz: 'Quiz',
      explainer: 'Concept Explainer',
      practice: 'Practice Problems',
      review: 'Topic Review'
    };
    document.getElementById('content-title').textContent = map[type] || this.capitalize(type);
    document.getElementById('content-topic').textContent = topic.name;

    const slot = topic.contentSlots[type];
    const isEmpty = !slot || slot.status === 'empty';

    if (isEmpty) {
      document.getElementById('content-actions').style.display = 'block';
      document.getElementById('content-display').classList.add('hidden');
      document.getElementById('paste-content-section').style.display = 'none';
    } else {
      document.getElementById('content-actions').style.display = 'none';
      document.getElementById('content-display').classList.remove('hidden');
      this.displayParsedContent(slot.content, type);
    }
  }

  showContentPrompt() {
    const { type, topicId } = this.data.currentContent || {};
    const topic = this.findTopicById(this.data.currentCourse, topicId);
    if (!topic) {
      this.showToast('Topic not found', 'error');
      return;
    }
    const prompt = this.getContentPrompt(type, topic);
    this.showPromptModal(`${this.capitalize(type)} Prompt`, prompt);
    document.getElementById('paste-content-section').style.display = 'block';
  }

  parseContentResponse(response, type) {
    const maybeJson = extractJsonFromText(response);

    if (type === 'flashcards') {
      if (maybeJson && (maybeJson.schema_version === 'flashcards_v1' || Array.isArray(maybeJson.cards))) {
        const cards = (maybeJson.cards || []).map((c, i) => ({
          id: c.id || 'c' + (i + 1),
          front: c.front || '',
          back: c.back || '',
          tags: c.tags || [],
          citation_ids: c.citation_ids || []
        }));
        return { cards, totalCards: cards.length, schema_version: 'flashcards_v1' };
      }
      return { error: 'Flashcards must be valid JSON (flashcards_v1). Please paste only the JSON block.' };
    }

    if (type === 'quiz') {
      const items = maybeJson?.items || maybeJson?.questions;
      if (maybeJson && (maybeJson.schema_version === 'quiz_mcq_v1' || Array.isArray(items))) {
        const questions = (items || []).map((item, index) => {
          const rawOptions = item.options || [];
          let options = [];
          let correctIdx = item.correctAnswer;
          const fb = {};

          if (rawOptions.length > 0 && typeof rawOptions[0] === 'object' && rawOptions[0] !== null) {
            options = rawOptions.map(o => o.text || '');
            correctIdx = rawOptions.findIndex(o => o.isCorrect === true);
            rawOptions.forEach((o, i) => { fb[i] = o.feedback || ''; });
          } else {
            options = rawOptions.map(String);
            if (typeof item.feedback === 'object' && item.feedback !== null) {
              Object.assign(fb, item.feedback);
            }
          }

          return {
            id: item.id || index + 1,
            text: item.stem || item.text || '',
            type: 'multiple_choice',
            difficulty: item.difficulty || 'medium',
            options,
            correctAnswer: typeof correctIdx === 'number' && correctIdx >= 0 ? correctIdx : 0,
            feedback: fb,
            citation_ids: item.citation_ids || []
          };
        }).filter(q => q.options.length === 4 && typeof q.correctAnswer === 'number');

        if (questions.length === 0) return { error: 'Quiz JSON parsed but no valid items found. Ensure 4 options with one correct answer.' };
        return { questions, totalQuestions: questions.length, schema_version: 'quiz_mcq_v1' };
      }
      return { error: 'Quiz must be valid JSON (quiz_mcq_v1). Please paste only the JSON block.' };
    }

    // Reading types: strip outer markdown code fences if wrapped by the LLM
    if (maybeJson && !response.includes('#')) {
      return { error: 'Reading content must be plain Markdown (no JSON). Please regenerate and paste Markdown only.' };
    }

    let md = response.trim();
    const fencedMatch = md.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
    if (fencedMatch) {
      md = fencedMatch[1].trim();
    }

    if (!md) return { error: 'Empty content. Paste Markdown only.' };
    if (!/^#+\s/m.test(md)) {
      return { error: 'Markdown must include headings (##, ###). Please format with headings.' };
    }
    return { schema_version: 'md_v1', markdown: md };
  }

  saveContent() {
    const response = document.getElementById('content-response').value.trim();
    if (!response) {
      this.showToast('Please paste the AI response', 'error');
      return;
    }

    const { type, topicId } = this.data.currentContent || {};
    if (!type || !topicId || !this.data.currentCourse) {
      this.showToast('Internal error: missing context', 'error');
      return;
    }

    const parsed = this.parseContentResponse(response, type);
    if (parsed.error) {
      this.showToast(parsed.error, 'error');
      return;
    }

    // Soft warnings for reading types
    if (parsed.schema_version === 'md_v1' && ['summary', 'explainer', 'practice', 'review'].includes(type)) {
      const warnList = this.validateReadingMarkdown(parsed.markdown, type);
      if (warnList.length) {
        this.showToast(`Heads up: missing ${warnList.slice(0, 3).join(', ')}`, 'warning');
      }
    }

    const courseIndex = this.data.courses.findIndex(c => c.id === this.data.currentCourse.id);
    const topicIndex = this.data.courses[courseIndex].topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) {
      this.showToast('Topic not found', 'error');
      return;
    }

    const prevSlot = this.data.courses[courseIndex].topics[topicIndex].contentSlots[type] || {};

    const newSlot = {
      ...prevSlot,
      status: 'filled',
      content: parsed,
      rawResponse: response,
      lastUpdated: new Date().toISOString(),
      completed: prevSlot.completed === true
    };

    if (type === 'quiz') {
      newSlot.attempts = Array.isArray(prevSlot.attempts) ? prevSlot.attempts : [];
      newSlot.bestScore = Number.isFinite(prevSlot.bestScore) ? prevSlot.bestScore : 0;
    }

    if (type === 'flashcards') {
      newSlot.srs = prevSlot.srs || { cards: {} };
    }

    this.data.courses[courseIndex].topics[topicIndex].contentSlots[type] = newSlot;
    this.recordActivity();
    this.saveData(false);
    this.showToast('Content saved successfully!', 'success');

    this.data.currentTopic = this.data.courses[courseIndex].topics[topicIndex];

    if (type === 'quiz') {
      this.showView('topic-detail', { topicId });
    } else {
      this.loadContentView({ type, topicId });
      this.loadContentSlots(this.data.currentTopic);
    }

    document.getElementById('content-response').value = '';
    document.getElementById('paste-content-section').style.display = 'none';
  }

  displayParsedContent(content, type) {
    const container = document.getElementById('parsed-content');
    if (!container) return;

    // Handle Markdown content
    if (content?.schema_version === 'md_v1' || typeof content?.markdown === 'string' || (typeof content === 'string' && content.trim())) {
      const mdText = content.markdown || (typeof content === 'string' ? content : '');
      container.innerHTML = this.renderMarkdown(mdText);
      return;
    }

    // Handle Quiz preview
    if (type === 'quiz' && (content?.questions || content?.items)) {
      const questions = content.questions || content.items || [];
      const total = content.totalQuestions || questions.length;
      container.innerHTML = `
        <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg mb-4 border border-purple-200 dark:border-purple-800/40">
          <h3 class="font-semibold text-purple-800 dark:text-purple-300 mb-1">Quiz Overview</h3>
          <p class="text-sm text-purple-600 dark:text-purple-400">Total Questions: ${total}</p>
        </div>
        <div class="space-y-3">
          ${questions.slice(0, 3).map((q, i) => {
            const opts = q.options?.map(o => typeof o === 'object' && o !== null ? (o.text || '') : String(o)) || [];
            let corr = q.correctAnswer;
            if (typeof corr !== 'number' && Array.isArray(q.options)) {
              corr = q.options.findIndex(o => typeof o === 'object' && o !== null && o.isCorrect === true);
            }
            return `
              <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <p class="font-medium text-gray-800 dark:text-gray-100 mb-2">${i + 1}. ${escapeHtml(q.text || q.stem)}</p>
                <div class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  ${opts.map((opt, j) => `
                    <div class="flex items-center space-x-2">
                      <span class="${j === corr ? 'text-green-600 dark:text-green-400 font-medium' : ''}">${String.fromCharCode(65 + j)}) ${escapeHtml(opt)}</span>
                      ${j === corr ? '<span class="text-green-600 dark:text-green-400 font-bold">✓</span>' : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
          ${questions.length > 3 ? `<p class="text-sm text-gray-500 text-center">... and ${questions.length - 3} more questions</p>` : ''}
        </div>
      `;
      return;
    }

    // Handle Flashcards preview
    if (content?.cards) {
      const total = content.totalCards || content.cards.length;
      const currentTopicId = this.data.currentTopic?.id || '';
      container.innerHTML = `
        <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg mb-4 border border-green-200 dark:border-green-800/40">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-semibold text-green-800 dark:text-green-300 mb-1">Flashcards</h3>
              <p class="text-sm text-green-700 dark:text-green-400">Total Cards: ${total}</p>
            </div>
            <button type="button"
                    data-start-flashcards
                    data-topic-id="${currentTopicId}"
                    class="px-3.5 py-2 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 shadow-sm transition-colors text-xs">
              Study Now
            </button>
          </div>
        </div>
        <div class="space-y-3">
          ${content.cards.slice(0, 5).map(card => `
            <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg">
              <div class="mb-2">
                <span class="text-xs uppercase tracking-wider font-semibold text-gray-500">Front</span>
                <p class="text-gray-800 dark:text-gray-100 mt-1">${escapeHtml(card.front)}</p>
              </div>
              <div>
                <span class="text-xs uppercase tracking-wider font-semibold text-gray-500">Back</span>
                <p class="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">${escapeHtml(card.back)}</p>
              </div>
            </div>
          `).join('')}
          ${total > 5 ? `<p class="text-sm text-gray-500 text-center">... and ${total - 5} more cards</p>` : ''}
        </div>
      `;
      return;
    }

    // Generic fallback
    const rawVal = content?.markdown || content?.content || (typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content || ''));
    container.innerHTML = `<div class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono text-xs">${escapeHtml(rawVal)}</div>`;
  }

  cancelContentEdit() {
    document.getElementById('paste-content-section').style.display = 'none';
    document.getElementById('content-response').value = '';
  }

  editContent() {
    const { type, topicId } = this.data.currentContent || {};
    const topic = this.findTopicById(this.data.currentCourse, topicId);
    if (!topic) return;
    const slot = topic.contentSlots[type];
    document.getElementById('content-actions').style.display = 'block';
    document.getElementById('content-display').classList.add('hidden');
    document.getElementById('paste-content-section').style.display = 'block';

    const fallbackVal = slot?.content?.markdown || (slot?.content ? JSON.stringify(slot.content, null, 2) : '');
    document.getElementById('content-response').value = slot?.rawResponse || fallbackVal;
  }

  deleteContent() {
    if (!confirm('Are you sure you want to delete this content?')) return;
    const { type, topicId } = this.data.currentContent || {};
    if (!type || !topicId) return;

    const courseIndex = this.data.courses.findIndex(c => c.id === this.data.currentCourse.id);
    const topicIndex = this.data.courses[courseIndex].topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) return;

    this.data.courses[courseIndex].topics[topicIndex].contentSlots[type] = {
      status: 'empty',
      content: null,
      rawResponse: null,
      lastUpdated: null,
      completed: false
    };
    this.saveData(false);
    this.showToast('Content deleted successfully', 'success');

    this.data.currentTopic = this.data.courses[courseIndex].topics[topicIndex];
    this.loadContentView({ type, topicId });
    this.loadContentSlots(this.data.currentTopic);
  }

  // Flashcards SRS
  openFlashcardsStudy(topicId = null) {
    let topic = topicId ? this.findTopicById(this.data.currentCourse, topicId) : this.data.currentTopic;

    if (!topic && topicId) {
      const course = this.data.courses.find(c => (c.topics || []).some(t => t.id === topicId));
      if (course) {
        this.data.currentCourse = course;
        topic = this.findTopicById(course, topicId);
      }
    }
    if (!topic) { this.showToast('Topic not found', 'error'); return; }

    const slot = topic.contentSlots?.flashcards;
    if (!slot || slot.status === 'empty' || !slot.content?.cards?.length) {
      this.showToast('No flashcards available. Create flashcards first.', 'error');
      return;
    }

    const modal = document.getElementById('flashcards-modal');
    if (!modal) return;

    slot.srs = slot.srs || { cards: {} };
    const srs = slot.srs.cards;

    const cards = slot.content.cards;
    const today = this._today();
    const isDue = (c) => {
      const st = srs[c.id];
      if (!st) return true;
      return !st.due || st.due <= today;
    };

    const due = cards.filter(isDue);
    const later = cards.filter(c => !isDue(c));
    const deck = [...due, ...later];

    this._flash = {
      topicId: topic.id,
      srsRef: srs,
      deck,
      index: 0,
      showBack: false,
      seen: 0,
      total: deck.length
    };

    this._wireFlashModal();
    modal.classList.remove('hidden');
    this._renderFlashcard();
  }

  closeFlashcardsStudy() {
    const modal = document.getElementById('flashcards-modal');
    if (modal) modal.classList.add('hidden');
    this._flash = null;
    this.saveData(false);
  }

  _flipFlashcard() {
    if (!this._flash) return;
    this._flash.showBack = !this._flash.showBack;
    this._renderFlashcardFaces();
  }

  _nextFlashcard() {
    if (!this._flash) return;
    if (this._flash.index < this._flash.total - 1) {
      this._flash.index++;
      this._flash.showBack = false;
      this._renderFlashcard();
    } else {
      // Mark topic flashcards as completed when session completes
      const courseIdx = this.data.courses.findIndex(c => c.id === this.data.currentCourse?.id);
      if (courseIdx >= 0) {
        const tIdx = this.data.courses[courseIdx].topics.findIndex(t => t.id === this._flash.topicId);
        if (tIdx >= 0) {
          const fcSlot = this.data.courses[courseIdx].topics[tIdx].contentSlots?.flashcards;
          if (fcSlot) {
            fcSlot.completed = true;
            fcSlot.lastUpdated = new Date().toISOString();
          }
        }
      }
      this.showToast('Session complete 🎉', 'success');
      this.recordActivity();
      this.closeFlashcardsStudy();
      if (this.data.currentView === 'topic-detail') {
        this.loadTopicDetail({ topicId: this.data.currentTopic?.id });
      }
    }
  }

  _prevFlashcard() {
    if (!this._flash) return;
    if (this._flash.index > 0) {
      this._flash.index--;
      this._flash.showBack = false;
      this._renderFlashcard();
    }
  }

  _gradeFlashcard(quality) {
    if (!this._flash) return;
    const { deck, index, srsRef } = this._flash;
    const card = deck[index];
    const st = srsRef[card.id] || { ease: 2.5, reps: 0, interval: 0, due: this._today(), lastGrade: null };

    const q = quality;
    if (q < 3) {
      st.reps = 0;
      st.interval = 0;
      st.due = this._today();
    } else {
      if (st.reps === 0) { st.interval = 1; }
      else if (st.reps === 1) { st.interval = 6; }
      else { st.interval = Math.round(st.interval * st.ease); }
      st.reps += 1;
      st.ease = Math.max(1.3, st.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      st.due = this._addDays(st.interval);
    }
    st.lastGrade = q;
    srsRef[card.id] = st;

    if (q < 3) {
      const insertPos = Math.min(this._flash.index + 2, this._flash.deck.length);
      this._flash.deck.splice(insertPos, 0, card);
      this._flash.total = this._flash.deck.length;
    }

    this._flash.seen = Math.max(this._flash.seen, this._flash.index + 1);
    this.recordActivity();
    this.saveData(false);
    this._nextFlashcard();
  }

  _renderFlashcard() {
    if (!this._flash) return;
    const { index, total } = this._flash;

    const countsEl = document.getElementById('flash-counts');
    if (countsEl) countsEl.textContent = `Card ${index + 1} of ${total}`;

    const progress = Math.round(((index + 1) / Math.max(total, 1)) * 100);
    const bar = document.getElementById('flash-progress-bar');
    const ptext = document.getElementById('flash-progress-text');
    if (bar) bar.style.width = `${progress}%`;
    if (ptext) ptext.textContent = `${progress}% completed`;

    this._renderFlashcardFaces();
    this._renderFlashFooterInfo();
  }

  _renderFlashcardFaces() {
    const { deck, index, showBack } = this._flash;
    const card = deck[index];
    const frontEl = document.getElementById('flash-front');
    const backEl = document.getElementById('flash-back');

    if (frontEl) frontEl.textContent = card.front || '';
    if (backEl) backEl.textContent = card.back || '';

    if (showBack) {
      backEl?.classList.remove('hidden');
      frontEl?.classList.add('hidden');
    } else {
      frontEl?.classList.remove('hidden');
      backEl?.classList.add('hidden');
    }
  }

  _renderFlashFooterInfo() {
    const info = document.getElementById('flash-due-info');
    if (!info || !this._flash) return;
    const { deck, index, srsRef } = this._flash;
    const card = deck[index];
    const st = srsRef[card.id];
    if (!st) { info.textContent = 'Status: New Card'; return; }
    info.textContent = `Ease ${st.ease.toFixed(2)} • Interval ${st.interval}d • Due ${st.due}`;
  }

  _wireFlashModal() {
    if (this._flashWired) return;
    this._flashWired = true;

    document.addEventListener('keydown', (e) => {
      if (!this._flash) return;
      if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;

      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); this._flipFlashcard(); }
      else if (e.key === 'ArrowRight') this._nextFlashcard();
      else if (e.key === 'ArrowLeft') this._prevFlashcard();
      else if (e.key === '1') this._gradeFlashcard(1);
      else if (e.key === '2') this._gradeFlashcard(3);
      else if (e.key === '3') this._gradeFlashcard(4);
      else if (e.key === '4') this._gradeFlashcard(5);
    });

    document.getElementById('flashcard-face')?.addEventListener('click', () => this._flipFlashcard());
    document.getElementById('flash-close-btn')?.addEventListener('click', () => this.closeFlashcardsStudy());
    document.getElementById('flash-flip-btn')?.addEventListener('click', () => this._flipFlashcard());
    document.getElementById('flash-next-btn')?.addEventListener('click', () => this._nextFlashcard());
    document.getElementById('flash-prev-btn')?.addEventListener('click', () => this._prevFlashcard());

    document.getElementById('flash-grade-again')?.addEventListener('click', () => this._gradeFlashcard(1));
    document.getElementById('flash-grade-hard')?.addEventListener('click', () => this._gradeFlashcard(3));
    document.getElementById('flash-grade-good')?.addEventListener('click', () => this._gradeFlashcard(4));
    document.getElementById('flash-grade-easy')?.addEventListener('click', () => this._gradeFlashcard(5));
  }

  // Quiz Engine
  loadQuizView(data) {
    const topicId = data?.topicId || this.data.currentTopic?.id;
    const topic = this.findTopicById(this.data.currentCourse, topicId);
    if (!topic) {
      this.showToast('Topic not found', 'error');
      this.goBack();
      return;
    }
    this.data.currentTopic = topic;
    const slot = topic.contentSlots.quiz;
    if (!slot || slot.status === 'empty' || !slot.content) {
      this.showToast('No quiz available. Create quiz content first.', 'error');
      this.goBack();
      return;
    }

    const rawQuestions = slot.content.questions || slot.content.items || [];
    const questions = rawQuestions.map((q, idx) => {
      const opts = Array.isArray(q.options)
        ? q.options.map(o => typeof o === 'object' && o !== null ? (o.text || '') : String(o))
        : [];
      let correct = q.correctAnswer;
      if (typeof correct !== 'number' && Array.isArray(q.options)) {
        correct = q.options.findIndex(o => typeof o === 'object' && o !== null && o.isCorrect === true);
      }
      const fb = q.feedback || {};
      if (Array.isArray(q.options)) {
        q.options.forEach((o, i) => {
          if (typeof o === 'object' && o !== null && o.feedback) fb[i] = o.feedback;
        });
      }
      return {
        id: q.id || idx + 1,
        text: q.text || q.stem || '',
        options: opts,
        correctAnswer: typeof correct === 'number' && correct >= 0 ? correct : 0,
        feedback: fb
      };
    }).filter(q => q.options.length === 4);

    if (!questions.length) {
      this.showToast('No valid 4-option questions in quiz', 'error');
      this.goBack();
      return;
    }

    this.currentQuiz = {
      questions,
      currentQuestion: 0,
      answers: new Array(questions.length).fill(null),
      startTime: Date.now(),
      timer: null
    };

    document.getElementById('quiz-title').textContent = `${topic.name} Quiz`;
    document.getElementById('quiz-results').classList.add('hidden');
    document.getElementById('quiz-review-card').classList.add('hidden');
    document.getElementById('quiz-question-card').classList.remove('hidden');
    document.getElementById('quiz-controls').style.display = 'flex';

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
    let seconds = 0;
    this.currentQuiz.timer = setInterval(() => {
      seconds++;
      const mm = Math.floor(seconds / 60);
      const ss = (seconds % 60).toString().padStart(2, '0');
      const el = document.getElementById('quiz-timer');
      if (el) el.textContent = `⏱️ ${mm}:${ss}`;
    }, 1000);
  }

  displayQuizQuestion() {
    const q = this.currentQuiz.questions[this.currentQuiz.currentQuestion];
    const n = this.currentQuiz.currentQuestion + 1;
    const total = this.currentQuiz.questions.length;

    document.getElementById('quiz-question-number').textContent = `Question ${n} of ${total}`;
    document.getElementById('question-text').textContent = q.text;

    const optionsContainer = document.getElementById('question-options');
    optionsContainer.innerHTML = q.options.map((opt, idx) => `
      <label class="flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors">
        <input type="radio" name="quiz-option" value="${idx}" class="text-primary-500 focus:ring-primary-500">
        <span class="flex-1 text-gray-800 dark:text-gray-200">${escapeHtml(opt)}</span>
      </label>
    `).join('');

    // Remove prior feedback
    document.querySelector('#quiz-question .quiz-feedback')?.remove();

    // Re-select if already answered
    const answered = this.currentQuiz.answers[this.currentQuiz.currentQuestion];
    const prevBtn = document.getElementById('quiz-prev-btn');
    const submitBtn = document.getElementById('quiz-submit-btn');
    const nextBtn = document.getElementById('quiz-next-btn');

    prevBtn.disabled = this.currentQuiz.currentQuestion === 0;

    if (answered !== null) {
      const radio = optionsContainer.querySelector(`input[value="${answered}"]`);
      if (radio) radio.checked = true;
      this.lockAndShowFeedback(answered);
    } else {
      submitBtn.style.display = 'block';
      nextBtn.style.display = 'none';
    }
  }

  submitQuizAnswer() {
    const selected = document.querySelector('input[name="quiz-option"]:checked');
    if (!selected) {
      this.showToast('Please select an answer', 'error');
      return;
    }
    const answerIndex = parseInt(selected.value, 10);
    this.currentQuiz.answers[this.currentQuiz.currentQuestion] = answerIndex;

    this.lockAndShowFeedback(answerIndex);
    this.updateQuizProgress();
  }

  lockAndShowFeedback(answerIndex) {
    const q = this.currentQuiz.questions[this.currentQuiz.currentQuestion];
    const isCorrect = answerIndex === q.correctAnswer;
    const isLast = this.currentQuiz.currentQuestion === this.currentQuiz.questions.length - 1;

    const optionsContainer = document.getElementById('question-options');
    optionsContainer.querySelectorAll('input').forEach(i => i.disabled = true);
    optionsContainer.querySelectorAll('label').forEach((label, idx) => {
      if (idx === q.correctAnswer) {
        label.classList.add('bg-green-100', 'border-green-300', 'dark:bg-green-900/40', 'dark:border-green-700');
      } else if (idx === answerIndex && !isCorrect) {
        label.classList.add('bg-red-100', 'border-red-300', 'dark:bg-red-900/40', 'dark:border-red-700');
      }
    });

    document.querySelector('#quiz-question .quiz-feedback')?.remove();
    this.showQuizFeedback(isCorrect, q, answerIndex);

    const submitBtn = document.getElementById('quiz-submit-btn');
    const nextBtn = document.getElementById('quiz-next-btn');

    submitBtn.style.display = 'none';
    nextBtn.style.display = 'block';
    nextBtn.textContent = isLast ? 'Finish & View Results 🏁' : 'Next Question →';
  }

  showQuizFeedback(isCorrect, question, selectedIndex) {
    const feedback = question.feedback?.[selectedIndex] || '';
    const correctOpt = question.options[question.correctAnswer];

    const div = document.createElement('div');
    div.className = `quiz-feedback mt-4 p-3 rounded-lg ${
      isCorrect ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
    }`;
    div.innerHTML = `
      <div class="flex items-center space-x-2 mb-1">
        <span class="${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} font-semibold">
          ${isCorrect ? '✅ Correct!' : '❌ Incorrect'}
        </span>
      </div>
      ${feedback ? `<p class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(feedback)}</p>` : ''}
      ${!isCorrect ? `<p class="text-sm font-medium text-gray-800 dark:text-gray-200 mt-1">Correct answer: ${escapeHtml(correctOpt)}</p>` : ''}
    `;
    document.getElementById('quiz-question').appendChild(div);
  }

  handleQuizNextOrFinish() {
    const isLast = this.currentQuiz.currentQuestion === this.currentQuiz.questions.length - 1;
    if (isLast) {
      this.finishQuiz();
    } else {
      this.nextQuizQuestion();
    }
  }

  nextQuizQuestion() {
    if (this.currentQuiz.currentQuestion < this.currentQuiz.questions.length - 1) {
      this.currentQuiz.currentQuestion++;
      this.displayQuizQuestion();
      this.updateQuizProgress();
    }
  }

  prevQuizQuestion() {
    if (this.currentQuiz.currentQuestion > 0) {
      this.currentQuiz.currentQuestion--;
      this.displayQuizQuestion();
      this.updateQuizProgress();
    }
  }

  finishQuiz() {
    this.stopQuizTimer();

    const total = this.currentQuiz.questions.length;
    let score = 0;
    this.currentQuiz.answers.forEach((ans, idx) => {
      if (ans !== null && ans === this.currentQuiz.questions[idx].correctAnswer) score++;
    });
    const percentage = Math.round((score / total) * 100);
    const timeSpent = Math.round((Date.now() - this.currentQuiz.startTime) / 1000);

    const topic = this.data.currentTopic;
    const courseIndex = this.data.courses.findIndex(c => c.id === this.data.currentCourse.id);
    const topicIndex = this.data.courses[courseIndex].topics.findIndex(t => t.id === topic.id);
    const slot = this.data.courses[courseIndex].topics[topicIndex].contentSlots.quiz;

    const attempt = {
      score,
      total,
      percentage,
      timeSpent,
      date: new Date().toISOString(),
      answers: this.currentQuiz.answers.slice()
    };

    slot.attempts = slot.attempts || [];
    slot.attempts.push(attempt);
    slot.bestScore = Math.max(slot.bestScore || 0, percentage);

    if (slot.bestScore >= this.quizMasteryThreshold) {
      slot.completed = true;
    }

    slot.lastUpdated = new Date().toISOString();
    this.recordActivity();
    this.saveData(false);

    const mm = Math.floor(timeSpent / 60);
    const ss = (timeSpent % 60).toString().padStart(2, '0');

    document.getElementById('final-score').textContent = `${score}/${total} (${percentage}%)`;
    document.getElementById('score-breakdown').textContent = `Completed in ${mm}m ${ss}s • Mastery: ${percentage >= this.quizMasteryThreshold ? 'Achieved 🏆' : 'Needs Practice'}`;

    document.getElementById('quiz-results').classList.remove('hidden');
    document.getElementById('quiz-question-card').classList.add('hidden');
    document.getElementById('quiz-controls').style.display = 'none';
  }

  updateQuizProgress() {
    const total = this.currentQuiz.questions.length;
    const current = this.currentQuiz.currentQuestion + 1;
    const progress = Math.round((current / total) * 100);

    const bar = document.getElementById('quiz-progress-bar');
    if (bar) bar.style.width = `${progress}%`;

    const answered = this.currentQuiz.answers.filter(a => a !== null).length;
    const correct = this.currentQuiz.answers.reduce((acc, a, i) =>
      acc + (a !== null && a === this.currentQuiz.questions[i].correctAnswer ? 1 : 0), 0);

    const scoreEl = document.getElementById('quiz-score');
    if (scoreEl) scoreEl.textContent = `Score: ${correct}/${answered}`;
  }

  retakeQuiz() {
    this.stopQuizTimer();
    const questions = this.currentQuiz.questions;
    this.currentQuiz = {
      questions,
      currentQuestion: 0,
      answers: new Array(questions.length).fill(null),
      startTime: Date.now(),
      timer: null
    };

    document.getElementById('quiz-results').classList.add('hidden');
    document.getElementById('quiz-review-card').classList.add('hidden');
    document.getElementById('quiz-question-card').classList.remove('hidden');
    document.getElementById('quiz-controls').style.display = 'flex';

    this.startQuiz();
  }

  reviewQuizAnswers() {
    const results = document.getElementById('quiz-results');
    const reviewCard = document.getElementById('quiz-review-card');
    const reviewList = document.getElementById('quiz-review-list');

    results.classList.add('hidden');
    reviewCard.classList.remove('hidden');

    reviewList.innerHTML = this.currentQuiz.questions.map((q, i) => {
      const user = this.currentQuiz.answers[i];
      const isCorrect = user === q.correctAnswer;

      return `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg mb-3">
          <div class="flex items-start justify-between mb-2">
            <p class="font-medium text-gray-800 dark:text-gray-100">${i + 1}. ${escapeHtml(q.text)}</p>
            <span class="text-xs px-2 py-0.5 rounded ${isCorrect ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}">
              ${isCorrect ? 'Correct' : 'Missed'}
            </span>
          </div>
          <div class="space-y-1.5 mt-2 text-sm">
            ${q.options.map((opt, idx) => {
              const isSelected = idx === user;
              const isAnswer = idx === q.correctAnswer;
              let highlight = 'text-gray-600 dark:text-gray-400';
              if (isAnswer) highlight = 'text-green-600 dark:text-green-400 font-semibold';
              if (isSelected && !isAnswer) highlight = 'text-red-500 font-medium line-through';

              return `
                <div class="flex items-center space-x-2">
                  <span class="${highlight}">${String.fromCharCode(65 + idx)}) ${escapeHtml(opt)}</span>
                  ${isSelected ? '<span class="text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">Your Choice</span>' : ''}
                  ${isAnswer ? '<span class="text-green-600 dark:text-green-400">✓</span>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  backToQuizResults() {
    document.getElementById('quiz-review-card').classList.add('hidden');
    document.getElementById('quiz-results').classList.remove('hidden');
  }

  // Prompts & Modals
  getStructurePrompt() {
    return `You are an expert academic analyzer. Create a topic structure for the chapter/course below using EXACT markers only. NO extra commentary or text outside these markers.

Required markers:
## COURSE_STRUCTURE_START: Course or Chapter Name
### TOPIC_START: Topic Name ## DIFFICULTY: Beginner/Intermediate/Advanced ## CATEGORY: Category
#### SUBTOPIC: Subtopic Name ## CONCEPTS: Concept 1, Concept 2, Concept 3
### TOPIC_END
## COURSE_STRUCTURE_END

Rules:
- Use the exact markers and casing shown.
- Do NOT wrap values in square brackets [].
- Include ALL major topics and key subtopics.
- Keep it comprehensive and logically ordered.`;
  }

  getContentPrompt(type, topic) {
    const p = this.data.settings.personalization || this._getDefaultPrefs();
    const courseName = this.data.currentCourse?.name || 'Course';
    const topicName = topic?.name || 'Selected Topic';
    const personalize = `Personalization: depth=${p.depth}, examples=${p.examples}, rigor=${p.rigor}, target_read_time=${p.readTime}min, audience_difficulty=${p.difficulty || 'Intermediate'}, citation=${p.citation || 'minimal'}`;

    const hasSubs = Array.isArray(topic?.subtopics) && topic.subtopics.length > 0;
    const mustCoverLines = hasSubs
      ? topic.subtopics.map(s => `- ${s.name}${s.concepts?.length ? `: ${s.concepts.join(', ')}` : ''}`).join('\n')
      : '';
    const mustCoverBlock = hasSubs ? `\nMUST COVER (from course structure):\n${mustCoverLines}\n` : '';

    if (type === 'flashcards') {
      const n = p.flashcardsCount || 15;
      return `ROLE: Flashcard expert. Create exactly ${n} high-quality flashcards for ${courseName} • "${topicName}".

OUTPUT STRICTLY AS A SINGLE FENCED JSON BLOCK:
\`\`\`json
{
  "schema_version": "flashcards_v1",
  "topic_id": "${topic?.id || 'topic_id_here'}",
  "cards": [
    {"id": "c1", "front": "Term or question...", "back": "Concise answer with example.", "tags": ["definition"], "citation_ids": []}
  ],
  "total": ${n}
}
\`\`\``;
    }

    if (type === 'quiz') {
      return `ROLE: Assessment designer. Create a 10-item MCQ quiz for ${courseName} • "${topicName}".
Constraints: JSON ONLY (quiz_mcq_v1). Exactly 4 options per item, single correct. Every option has feedback.

\`\`\`json
{
  "schema_version": "quiz_mcq_v1",
  "topic_id": "${topic?.id || 'topic_id_here'}",
  "title": "${topicName} Quiz",
  "items": [
    {
      "id": "q1",
      "stem": "Clear question stem...",
      "options": [
        {"text": "Option A", "feedback": "Why right/wrong", "isCorrect": false},
        {"text": "Option B", "feedback": "Why right/wrong", "isCorrect": true},
        {"text": "Option C", "feedback": "Why right/wrong", "isCorrect": false},
        {"text": "Option D", "feedback": "Why right/wrong", "isCorrect": false}
      ],
      "difficulty": "medium",
      "citation_ids": []
    }
  ],
  "metadata": {"count": 10}
}
\`\`\``;
    }

    if (type === 'summary') {
      return `ROLE: Expert subject-matter educator. Write a textbook-quality teaching text that replaces reading the source chapter for "${topicName}" in "${courseName}".

${mustCoverBlock}${personalize}

OUTPUT FORMAT:
- Return pure Markdown wrapped in \`\`\`markdown code block.
- Structure with ## ${topicName}, ### Scope Map, ### Core Sections, ### Quick Reference, ### TL;DR, and ### Self-Check (with answers inline).`;
    }

    if (type === 'explainer') {
      return `ROLE: Expert tutor known for clarity. Produce an in-depth concept breakdown for "${topicName}" in "${courseName}".
${personalize}
Wrap in \`\`\`markdown. Structure: Simple Definition, Step-by-Step Breakdown, Worked Example, Common Questions, Why It Matters, and Self-Check.`;
    }

    if (type === 'practice') {
      return `ROLE: Problem creator for "${courseName}". Generate scaffolded practice problems for "${topicName}".
${personalize}
Wrap in \`\`\`markdown. Structure: Warm-Up Problems, Standard Problems, Challenge Problems with complete step-by-step solutions.`;
    }

    if (type === 'review') {
      return `ROLE: Instructor preparing a full review for "${topicName}" in "${courseName}".
${personalize}
Wrap in \`\`\`markdown. Structure: Topic Mastery Checklist, Quick Reference Sheet, Self-Assessment Questions (inline answers), and Common Exam Traps.`;
    }

    return `ROLE: Expert educator. Create a comprehensive topic summary for "${topicName}" in "${courseName}".\n${personalize}`;
  }

  showPromptModal(title, prompt) {
    const modal = document.getElementById('prompt-modal');
    const titleEl = document.getElementById('prompt-modal-title');
    const textEl = document.getElementById('prompt-text');

    if (!modal || !titleEl || !textEl) return;

    titleEl.textContent = title;
    textEl.value = prompt;
    modal.classList.remove('hidden');
    textEl.scrollTop = 0;
  }

  hidePromptModal() {
    document.getElementById('prompt-modal')?.classList.add('hidden');
  }

  copyPromptToClipboard() {
    const ta = document.getElementById('prompt-text');
    if (!ta) return;

    const copyFallback = () => {
      ta.select();
      document.execCommand('copy');
      this.showToast('Prompt copied to clipboard!', 'success');
      this.hidePromptModal();
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(ta.value).then(() => {
        this.showToast('Prompt copied to clipboard!', 'success');
        this.hidePromptModal();
      }).catch(copyFallback);
    } else {
      copyFallback();
    }
  }

  // Study View (Smart Queue)
  loadStudyView() {
    const queueEl = document.getElementById('study-queue');
    if (!queueEl) return;

    const today = this._today();
    const items = [];

    for (const course of this.data.courses) {
      for (const topic of course.topics || []) {
        // 1. Spaced Repetition reviews due
        const fcSlot = topic.contentSlots?.flashcards;
        if (fcSlot?.status === 'filled' && fcSlot?.content?.cards?.length) {
          const srs = fcSlot.srs?.cards || {};
          const hasDue = fcSlot.content.cards.some(c => {
            const st = srs[c.id];
            return !st || !st.due || st.due <= today;
          });

          if (hasDue || !fcSlot.completed) {
            items.push({
              kind: 'review',
              priority: 1,
              label: `${course.name} • ${topic.name} • Flashcards Review`,
              go: () => {
                this.data.currentCourse = course;
                this.data.currentTopic = topic;
                this.openFlashcardsStudy(topic.id);
              }
            });
          }
        }

        // 2. Pending content generations
        for (const [type, slot] of Object.entries(topic.contentSlots || {})) {
          if (slot.status === 'empty') {
            items.push({
              kind: 'content',
              priority: 2,
              label: `${course.name} • ${topic.name} • ${this.capitalize(type)}`,
              go: () => {
                this.data.currentCourse = course;
                this.data.currentTopic = topic;
                this.showView('content', { type, topicId: topic.id });
              }
            });
          }
        }
      }
    }

    if (!items.length) {
      queueEl.innerHTML = `
        <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-center text-gray-500 dark:text-gray-400">
          <p class="text-sm">No items in your queue!</p>
          <p class="text-xs mt-1">All up to date. Add courses or generate more content.</p>
        </div>
      `;
      return;
    }

    items.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));

    queueEl.innerHTML = items.slice(0, 10).map((it, i) => `
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg flex items-center justify-between">
        <div class="pr-2">
          <p class="font-medium text-gray-800 dark:text-gray-200 text-sm">${i + 1}. ${escapeHtml(it.label)}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${it.kind === 'review' ? 'Spaced Repetition Due' : 'Pending Content Generation'}</p>
        </div>
        <button class="px-3.5 py-1.5 bg-primary-500 text-white font-medium rounded-lg text-xs hover:bg-primary-600 transition-colors" data-study-idx="${i}">Go</button>
      </div>
    `).join('');

    queueEl.querySelectorAll('button[data-study-idx]').forEach((btn, idx) => {
      btn.addEventListener('click', () => items[idx].go());
    });
  }

  renderMarkdown(md) {
    if (window.marked) {
      const html = window.marked.parse(md);
      return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
    }
    return escapeHtml(md).replace(/\n/g, '<br>');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const color = type === 'success' ? 'bg-green-600' :
                  type === 'error' ? 'bg-red-600' :
                  type === 'warning' ? 'bg-amber-500' : 'bg-primary-600';

    toast.className = `p-3.5 px-4 rounded-xl shadow-lg text-white max-w-sm flex items-center space-x-2 text-sm transition-all duration-300 transform translate-y-2 opacity-0 ${color}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span><span class="font-medium">${escapeHtml(message)}</span>`;

    const container = document.getElementById('toast-container');
    if (container) container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-x-full');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  capitalize(str) {
    return (str || '').charAt(0).toUpperCase() + (str || '').slice(1);
  }

  validateReadingMarkdown(md, type) {
    const warnings = [];
    const hasHeading = (variants) => {
      const escaped = variants.map(s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      return new RegExp(`(^|\\n)\\s*#{2,4}\\s*(${escaped})\\b`, 'mi').test(md);
    };

    if (type === 'summary') {
      if (!hasHeading(['Scope Map', 'What you will learn'])) warnings.push('Scope Map');
      if (!/(^|\n)\s*#{2,4}\s*(TL;?DR)\b/mi.test(md)) warnings.push('TL;DR');
      if (!hasHeading(['Self-Check', 'Self Check'])) warnings.push('Self-Check');
    }
    return warnings;
  }

  // Backup & Restore
  exportData() {
    try {
      const dataStr = JSON.stringify(this.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `study-buddy-backup-${this._today()}.json`;
      a.click();
      this.showToast('Data exported successfully!', 'success');
    } catch (e) {
      this.showToast('Failed to export data', 'error');
    }
  }

  importData() {
    document.getElementById('import-file-input')?.click();
  }

  handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported || typeof imported !== 'object' || !('courses' in imported)) {
          this.showToast('Invalid backup file format', 'error');
          return;
        }
        if (confirm('Replace all current study data with this backup?')) {
          this.data = imported;
          this.migrateDataSchema();
          this.applyDarkMode(!!(this.data.settings && this.data.settings.darkMode));
          this.syncPreferencesUI();
          this.saveData(false);
          this.showToast('Backup restored successfully!', 'success');
          this.showView('dashboard');
        }
      } catch {
        this.showToast('Corrupted or invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  clearAllData() {
    if (confirm('Permanently delete all courses, content, and progress?')) {
      localStorage.removeItem('studyBuddyData');
      this.data = {
        courses: [],
        settings: {
          darkMode: false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          personalization: this._getDefaultPrefs()
        },
        stats: { streak: 0, lastActiveDate: null },
        currentView: 'dashboard',
        currentCourse: null,
        currentTopic: null,
        currentContent: null
      };
      this.applyDarkMode(false);
      this.syncPreferencesUI();
      this.showToast('All data cleared', 'info');
      this.showView('dashboard');
    }
  }
}

// Global bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.app = new StudyBuddyApp();
});

function showView(viewName) {
  if (window.app) window.app.showView(viewName);
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
