// app.js

// Utility: Extract the first fenced JSON code block or parse direct JSON
function extractJsonFromText(text) {
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
          readTime: 10
        }
      },
      currentView: 'dashboard',
      currentCourse: null,
      currentTopic: null,
      currentContent: null
    };
    this.currentQuiz = null;
    this.menuOpen = false;

    this.init();
  }

  init() {
    this.loadData();
    this.applyDarkMode(this.data.settings.darkMode);
    this.setupEventListeners();
    this.updateDashboard();
    this.showView('dashboard');
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

  // Event Listeners
  setupEventListeners() {
    // Navigation
    document.getElementById('back-btn')?.addEventListener('click', () => this.goBack());

    // Menu button
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
        this.showToast(`Dark mode ${enabled ? 'enabled' : 'disabled'}`, 'success');
      });
    }

    // Quiz
    this.setupQuizEventListeners();
  }

  applyDarkMode(enabled) {
    document.documentElement.classList.toggle('dark', enabled);
  }

  toggleHeaderMenu() {
    const menu = document.getElementById('header-menu');
    const btn = document.getElementById('menu-btn');
    this.menuOpen = !this.menuOpen;
    if (btn) btn.setAttribute('aria-expanded', this.menuOpen ? 'true' : 'false');
    if (this.menuOpen) {
      if (menu) {
        menu.classList.remove('hidden');
        menu.classList.add('popover-enter');
        requestAnimationFrame(() => menu.classList.add('popover-enter-active'));
        setTimeout(() => menu.classList.remove('popover-enter', 'popover-enter-active'), 150);
      }
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
    document.getElementById('quiz-next-btn')?.addEventListener('click', () => this.nextQuizQuestion());
    document.getElementById('quiz-prev-btn')?.addEventListener('click', () => this.prevQuizQuestion());
    document.getElementById('retake-quiz-btn')?.addEventListener('click', () => this.retakeQuiz());
    document.getElementById('quiz-review-btn')?.addEventListener('click', () => this.reviewQuizAnswers());
  }

  // Navigation
  showView(viewName, data = null) {
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
        headerSubtitle.textContent = 'Smart queue';
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
    const activeBtn = document.querySelector(`[onclick="showView('${viewName}')"]`);
    if (activeBtn) {
      activeBtn.classList.remove('text-gray-400');
      activeBtn.classList.add('text-primary-500');
    }
  }

  // Dashboard
  updateDashboard() {
    const totalCoursesEl = document.getElementById('total-courses');
    if (totalCoursesEl) totalCoursesEl.textContent = this.data.courses.length;
    this.loadRecentActivity();
  }

  loadRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    if (this.data.courses.length === 0) {
      container.innerHTML = `
        <div class="bg-gray-100 p-4 rounded-lg text-center text-gray-500">
          <p class="text-sm">No recent activity</p>
          <p class="text-xs mt-1">Start by creating a course!</p>
        </div>
      `;
    } else {
      const recentItems = this.data.courses.slice(-3).reverse();
      container.innerHTML = recentItems.map(course => `
        <div class="bg-white border border-gray-200 p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
             onclick="app.openCourse('${course.id}')">
          <h4 class="font-medium text-gray-800">${course.name}</h4>
          <p class="text-sm text-gray-600">${course.topics?.length || 0} topics</p>
        </div>
      `).join('');
    }
  }

  // Helpers: finders and navigation shortcuts
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
    this.saveData();
    this.hideAddCourseModal();
    this.showToast('Course created successfully!', 'success');
    this.loadCourses();
  }

  loadCourses() {
    const container = document.getElementById('courses-list');
    if (!container) return;

    if (this.data.courses.length === 0) {
      container.innerHTML = `
        <div class="bg-gray-100 p-8 rounded-lg text-center text-gray-500">
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
        <div class="bg-white border border-gray-200 p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
             onclick="app.openCourse('${course.id}')">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="font-semibold text-gray-800 mb-1">${course.name}</h3>
              ${course.description ? `<p class="text-sm text-gray-600 mb-2">${course.description}</p>` : ''}
              <div class="flex items-center space-x-4 text-xs text-gray-500">
                <span>${course.topics?.length || 0} topics</span>
                <span>Created ${new Date(course.created).toLocaleDateString()}</span>
              </div>
            </div>
            <div class="flex flex-col items-end space-y-2">
              ${course.structureAnalyzed
                ? '<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Structured</span>'
                : '<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs">Setup Required</span>'}
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  loadCourseDetail(data) {
    let course = this.data.currentCourse;

    if (data?.courseId) {
      course = this.findCourseById(data.courseId);
      this.data.currentCourse = course;
    } else if (data?.id) { // legacy
      course = this.findCourseById(data.id);
      this.data.currentCourse = course;
    }

    if (!course) return;

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
    document.getElementById('structure-prompt-card').style.display = 'none';
    document.getElementById('paste-structure-card').style.display = 'block';
    this.showPromptModal('Course Structure Analyzer', this.getStructurePrompt());
  }

  parseStructureResponse() {
    const response = document.getElementById('structure-response').value.trim();
    if (!response) {
      this.showToast('Please paste the AI response', 'error');
      return;
    }
    try {
      const topics = this.parseStructureText(response);
      const course = this.data.currentCourse;
      const idx = this.data.courses.findIndex(c => c.id === course.id);
      if (idx !== -1) {
        this.data.courses[idx].topics = topics;
        this.data.courses[idx].structureAnalyzed = true;
        this.data.currentCourse = this.data.courses[idx];
        this.saveData();
        this.showToast('Course structure created successfully!', 'success');
        this.loadCourseDetail({ courseId: this.data.currentCourse.id });
      }
    } catch (error) {
      this.showToast('Failed to parse structure. Please check the format.', 'error');
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
            name: topicMatch[1].trim(),
            difficulty: this.extractValue(line, 'DIFFICULTY') || 'Medium',
            category: this.extractValue(line, 'CATEGORY') || 'General',
            subtopics: [],
            contentSlots: this.createEmptyContentSlots()
          };
          topics.push(currentTopic);
        }
      }

      if (currentTopic && line.includes('SUBTOPIC:')) {
        const subtopicMatch = line.match(/SUBTOPIC:\s*(.+?)(?:\s*##|$)/);
        if (subtopicMatch) {
          currentTopic.subtopics.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
            name: subtopicMatch[1].trim(),
            concepts: this.extractValue(line, 'CONCEPTS')?.split(',').map(c => c.trim()) || []
          });
        }
      }
    }

    if (topics.length === 0) {
      // Fallback: headers
      for (let line of lines) {
        if (/^#{2,3}\s+/.test(line)) {
          const topicName = line.replace(/^#+\s*/, '').trim();
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
      summary: { status: 'empty', content: null, lastUpdated: null },
      flashcards: { status: 'empty', content: null, lastUpdated: null, srs: { cards: {} } },
      quiz: { status: 'empty', content: null, lastUpdated: null, attempts: [], bestScore: 0 },
      explainer: { status: 'empty', content: null, lastUpdated: null },
      practice: { status: 'empty', content: null, lastUpdated: null },
      review: { status: 'empty', content: null, lastUpdated: null }
    };
  }

  loadTopics() {
    const container = document.getElementById('topics-list');
    const course = this.data.currentCourse;
    const topics = course?.topics || [];
    if (!container) return;

    if (topics.length === 0) {
      container.innerHTML = `
        <div class="bg-gray-100 p-4 rounded-lg text-center text-gray-500">
          <p class="text-sm">No topics found</p>
          <p class="text-xs mt-1">Try re-parsing the structure</p>
        </div>
      `;
    } else {
      container.innerHTML = topics.map(topic => {
        const completed = Object.values(topic.contentSlots).filter(slot => slot.status === 'filled').length;
        const total = Object.keys(topic.contentSlots).length;
        const progress = Math.round((completed / total) * 100);
        return `
          <div class="bg-white border border-gray-200 p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
               onclick="app.openTopic('${topic.id}')">
            <div class="flex items-start justify-between mb-2">
              <h4 class="font-semibold text-gray-800">${topic.name}</h4>
              <span class="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">${topic.difficulty}</span>
            </div>
            <div class="mb-3">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-gray-600">Progress</span>
                <span class="text-xs text-gray-600">${completed}/${total}</span>
              </div>
              <div class="bg-gray-200 rounded-full h-2">
                <div class="bg-primary-500 h-2 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
              </div>
            </div>
            ${topic.subtopics.length > 0
              ? `<div class="text-xs text-gray-500">Subtopics: ${topic.subtopics.map(s => s.name).join(', ')}</div>`
              : ''}
          </div>
        `;
      }).join('');
    }
  }

  loadTopicDetail(data) {
    let topic = this.data.currentTopic;
    const course = this.data.currentCourse;

    if (data?.topicId && course) {
      topic = this.findTopicById(course, data.topicId);
      this.data.currentTopic = topic;
    } else if (data?.id && course) {
      topic = this.findTopicById(course, data.id);
      this.data.currentTopic = topic;
    }

    if (!topic) return;

    document.getElementById('topic-title').textContent = topic.name;
    document.getElementById('topic-difficulty').textContent = topic.difficulty;

    const completed = Object.values(topic.contentSlots).filter(slot => slot.status === 'filled').length;
    const total = Object.keys(topic.contentSlots).length;
    document.getElementById('topic-progress').textContent = `${completed}/${total} completed`;

    this.loadContentSlots(topic);
  }

  loadContentSlots(topic) {
    const container = document.getElementById('content-slots');
    if (!container) return;

    const contentTypes = {
      summary: { icon: '📝', name: 'Summary', color: 'blue' },
      flashcards: { icon: '🃏', name: 'Flashcards', color: 'green' },
      quiz: { icon: '📊', name: 'Quiz', color: 'purple' },
      explainer: { icon: '💡', name: 'Concept Explainer', color: 'orange' },
      practice: { icon: '🔧', name: 'Practice Problems', color: 'red' },
      review: { icon: '📚', name: 'Topic Review', color: 'indigo' }
    };

    container.innerHTML = Object.entries(topic.contentSlots).map(([type, slot]) => {
      const t = contentTypes[type];
      const isEmpty = slot.status === 'empty';
      const btnClass = `bg-${t.color}-500 hover:bg-${t.color}-600`;
      return `
        <div class="bg-white border border-gray-200 p-4 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2">
              <span class="text-lg">${t.icon}</span>
              <span class="font-medium text-gray-800">${t.name}</span>
            </div>
            <div class="flex items-center space-x-2">
              ${isEmpty
                ? `<span class="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">Empty</span>`
                : `<span class="bg-green-100 text-green-600 px-2 py-1 rounded-full text-xs">✓ Complete</span>`}
            </div>
          </div>

          <div class="space-y-2">
            ${isEmpty ? `
              <button onclick="app.openContent('${type}', '${topic.id}')" class="w-full ${btnClass} text-white p-2 rounded-lg text-sm font-medium transition-colors">
                📋 Get Prompt & Create Content
              </button>
            ` : `
              <div class="flex space-x-2">
                ${type === 'quiz' ? `
                  <button onclick="app.openQuiz('${topic.id}')" class="flex-1 bg-purple-500 text-white p-2 rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors">
                    🎯 Take Quiz
                  </button>
                ` : `
                  <button onclick="app.openContent('${type}', '${topic.id}')" class="flex-1 bg-gray-500 text-white p-2 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors">
                    👁️ View Content
                  </button>
                `}
                <button onclick="app.openContent('${type}', '${topic.id}')" class="px-3 bg-gray-300 text-gray-700 p-2 rounded-lg text-sm hover:bg-gray-400 transition-colors">✏️</button>
              </div>
            `}
            ${slot.lastUpdated ? `
              <p class="text-xs text-gray-500">Last updated: ${new Date(slot.lastUpdated).toLocaleDateString()}</p>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Content
  loadContentView(data) {
    const { type, topicId } = data || {};
    const course = this.data.currentCourse;
    const topic = this.findTopicById(course, topicId);
    if (!topic) return;

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
    document.getElementById('content-title').textContent = map[type] || 'Content';
    document.getElementById('content-topic').textContent = topic.name;

    const slot = topic.contentSlots[type];
    const isEmpty = slot.status === 'empty';

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
    const json = extractJsonFromText(response);

    if (type === 'quiz') {
      if (json && (json.schema_version === 'quiz_mcq_v1' || json.items)) {
        const questions = (json.items || []).map((item, index) => {
          const options = item.options || [];
          const correctIdx = options.findIndex(o => o.isCorrect);
          const fb = {};
          options.forEach((o, i) => fb[i] = o.feedback || '');
          return {
            id: item.id || index + 1,
            text: item.stem || item.text || '',
            type: 'multiple_choice',
            difficulty: item.difficulty || 'medium',
            options: options.map(o => o.text),
            correctAnswer: correctIdx >= 0 ? correctIdx : null,
            feedback: fb,
            citation_ids: item.citation_ids || []
          };
        }).filter(q => q.options?.length === 4 && q.correctAnswer !== null);
        return { questions, totalQuestions: questions.length, schema_version: 'quiz_mcq_v1' };
      }
      // Fallback to legacy markers
      return this.parseQuizLegacy(response);
    }

    if (type === 'flashcards') {
      if (json && (json.schema_version === 'flashcards_v1' || json.cards)) {
        const cards = (json.cards || []).map((c, i) => ({
          id: c.id || 'c' + (i + 1),
          front: c.front || '',
          back: c.back || '',
          tags: c.tags || [],
          citation_ids: c.citation_ids || []
        }));
        return { cards, totalCards: cards.length, schema_version: 'flashcards_v1' };
      }
      // Fallback legacy
      return this.parseFlashcardsLegacy(response);
    }

    // Reading content types (summary/explainer/review/practice): hybrid
    if (json && (json.schema_version === 'reading_content_v1' || json.sections || json.rendered_markdown)) {
      return {
        schema_version: 'reading_content_v1',
        title: json.title || '',
        rendered_markdown: json.rendered_markdown || '',
        sections: json.sections || [],
        confidence: json.confidence || null
      };
    }

    // Generic fallback
    return this.parseGenericLegacy(response);
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
    if (!parsed) {
      this.showToast('Failed to parse content. Please check the format.', 'error');
      return;
    }

    const courseIndex = this.data.courses.findIndex(c => c.id === this.data.currentCourse.id);
    const topicIndex = this.data.courses[courseIndex].topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) {
      this.showToast('Topic not found', 'error');
      return;
    }

    this.data.courses[courseIndex].topics[topicIndex].contentSlots[type] = {
      status: 'filled',
      content: parsed,
      rawResponse: response,
      lastUpdated: new Date().toISOString(),
      attempts: type === 'quiz' ? (this.data.courses[courseIndex].topics[topicIndex].contentSlots.quiz.attempts || []) : undefined,
      bestScore: type === 'quiz' ? (this.data.courses[courseIndex].topics[topicIndex].contentSlots.quiz.bestScore || 0) : undefined
    };

    this.saveData(false);
    this.showToast('Content saved successfully!', 'success');

    // Refresh current references from state
    this.data.currentTopic = this.data.courses[courseIndex].topics[topicIndex];

    // Refresh UI
    if (type === 'quiz') {
      this.showView('topic-detail', { topicId });
    } else {
      this.loadContentView({ type, topicId });
      this.loadContentSlots(this.data.currentTopic);
    }

    // Reset editor
    document.getElementById('content-response').value = '';
    document.getElementById('paste-content-section').style.display = 'none';
  }

  displayParsedContent(content, type) {
    const container = document.getElementById('parsed-content');
    if (!container) return;

    if (content && (content.schema_version === 'reading_content_v1' || content.sections || content.rendered_markdown)) {
      if (content.rendered_markdown) {
        container.innerHTML = `<div class="whitespace-pre-wrap text-gray-800">${content.rendered_markdown}</div>`;
        return;
      }
      if (content.sections?.length) {
        container.innerHTML = content.sections.map(sec => `
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2">${sec.title || ''}</h3>
            <div class="text-gray-700 whitespace-pre-wrap">${(sec.body_markdown || '').trim()}</div>
          </div>
        `).join('');
        return;
      }
    }

    if (type === 'quiz' && content?.questions) {
      container.innerHTML = `
        <div class="bg-purple-50 p-4 rounded-lg mb-4">
          <h3 class="font-semibold text-purple-800 mb-2">Quiz Overview</h3>
          <p class="text-sm text-purple-600">Total Questions: ${content.totalQuestions || content.questions.length}</p>
        </div>
        <div class="space-y-3">
          ${content.questions.slice(0, 3).map((q, i) => `
            <div class="bg-gray-50 p-3 rounded-lg">
              <p class="font-medium text-gray-800 mb-2">${i + 1}. ${q.text}</p>
              <div class="text-sm text-gray-700">
                ${q.options.map((opt, j) => `
                  <div class="flex items-center space-x-2">
                    <span class="${j === q.correctAnswer ? 'text-green-600 font-medium' : ''}">${String.fromCharCode(65 + j)}) ${opt}</span>
                    ${j === q.correctAnswer ? '<span class="text-green-600">✓</span>' : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
          ${content.questions.length > 3 ? `<p class="text-sm text-gray-500 text-center">... and ${content.questions.length - 3} more questions</p>` : ''}
        </div>
      `;
      return;
    }

    if (content?.cards) {
      container.innerHTML = `
        <div class="bg-green-50 p-4 rounded-lg mb-4">
          <h3 class="font-semibold text-green-800 mb-2">Flashcards Overview</h3>
          <p class="text-sm text-green-700">Total Cards: ${content.totalCards || content.cards.length}</p>
        </div>
        <div class="space-y-3">
          ${content.cards.slice(0, 5).map(card => `
            <div class="bg-white border border-gray-200 p-4 rounded-lg">
              <div class="mb-2">
                <span class="text-sm font-medium text-gray-600">Front:</span>
                <p class="text-gray-800">${card.front}</p>
              </div>
              <div>
                <span class="text-sm font-medium text-gray-600">Back:</span>
                <p class="text-gray-800 whitespace-pre-wrap">${card.back}</p>
              </div>
            </div>
          `).join('')}
          ${content.cards.length > 5 ? `<p class="text-sm text-gray-500 text-center">... and ${content.cards.length - 5} more cards</p>` : ''}
        </div>
      `;
      return;
    }

    // Generic fallback
    container.innerHTML = `<div class="text-gray-700 whitespace-pre-wrap">${(content?.content || '').trim()}</div>`;
  }

  // Legacy parsers (fallbacks)
  parseQuizLegacy(response) {
    const lines = response.split('\n');
    const questions = [];
    let current = null;

    const pushIfValid = () => {
      if (current && current.options.length === 4 && typeof current.correctAnswer === 'number') {
        questions.push(current);
      }
    };

    const startQuestion = () => {
      pushIfValid();
      current = {
        id: questions.length + 1,
        text: '',
        options: [],
        correctAnswer: null,
        feedback: {},
        difficulty: 'medium',
        type: 'multiple_choice'
      };
    };

    const clean = s => (s || '').replace(/\s+/g, ' ').trim();

    for (let raw of lines) {
      const line = raw.trim();

      // Start question markers
      if (/^#{2,3}\s*QUESTION/i.test(line) || /^QUESTION[_\s-]?\d+/i.test(line)) {
        startQuestion();
        continue;
      }
      if (!current) continue;

      // First non-option line becomes stem
      if (!current.text && line && !/^\s*[A-D]KATEX_INLINE_CLOSE\s+/.test(line) && !/^#{1,}/.test(line) && !/^```/.test(line)) {
        current.text = clean(line);
        continue;
      }

      // Options: A) ... D)
      const optMatch = line.match(/^\s*([A-D])KATEX_INLINE_CLOSE\s*(.+)$/);
      if (optMatch) {
        const rest = optMatch[2];

        // Extract feedback after '## FEEDBACK:'
        let feedbackText = '';
        const feedbackMatch = rest.match(/##\s*FEEDBACK:\s*([\s\S]*?)$/i);
        if (feedbackMatch) feedbackText = clean(feedbackMatch[1]);

        // Is correct?
        const isCorrect = /##\s*CORRECT\b/i.test(rest);

        // Visible option text = before first '##'
        const optionText = clean(rest.split('##')[0] || '');

        const idx = current.options.length;
        current.options.push(optionText);
        current.feedback[idx] = feedbackText;
        if (isCorrect) current.correctAnswer = idx;
        continue;
      }
    }

    // Push last
    pushIfValid();

    return { questions, totalQuestions: questions.length, schema_version: 'quiz_mcq_legacy' };
  }

  parseFlashcardsLegacy(response) {
    const blocks = response.split(/\*\*Card\s*\d+\s*:/i).filter(b => b.trim());
    const cards = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const frontMatch = b.match(/-\s*Front:\s*([\s\S]*?)(?:\n|$)/i);
      const backMatch = b.match(/-\s*Back:\s*([\s\S]*?)(?:$|\n\*\*|$)/i);
      const front = frontMatch ? frontMatch[1].trim() : '';
      const back = backMatch ? backMatch[1].trim() : '';
      if (front && back) {
        cards.push({ id: 'c' + (cards.length + 1), front, back, tags: [] });
      }
    }
    return { cards, totalCards: cards.length, schema_version: 'flashcards_legacy' };
  }

  parseGenericLegacy(response) {
    const sections = [];
    const lines = response.split('\n');
    let current = null;
    for (let l of lines) {
      if (/^#{2,3}\s+/.test(l)) {
        if (current) sections.push(current);
        current = { title: l.replace(/^#+\s*/, '').trim(), content: '' };
      } else if (current) {
        current.content += l + '\n';
      }
    }
    if (current) sections.push(current);
    return { content: response, sections, schema_version: 'generic_legacy' };
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
    if (slot?.rawResponse) {
      document.getElementById('content-response').value = slot.rawResponse;
    }
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
      lastUpdated: null
    };
    this.saveData(false);
    this.showToast('Content deleted successfully', 'success');

    this.data.currentTopic = this.data.courses[courseIndex].topics[topicIndex];
    this.loadContentView({ type, topicId });
    this.loadContentSlots(this.data.currentTopic);
  }

  // Quiz (MCQ-only)
  loadQuizView(data) {
    const topicId = data?.topicId;
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

    const questions = (slot.content.questions || slot.content.items || [])
      .filter(q => {
        const opts = q.options || [];
        const hasCorrect = typeof q.correctAnswer === 'number' || opts.some(o => o?.isCorrect === true);
        return (opts.length === 4) && hasCorrect;
      })
      .map(q => {
        if (q.options[0]?.text !== undefined) {
          const correctIdx = q.options.findIndex(o => o.isCorrect);
          const feedback = {};
          q.options.forEach((o, i) => feedback[i] = o.feedback || '');
          return {
            id: q.id || '',
            text: q.stem || q.text || '',
            options: q.options.map(o => o.text),
            correctAnswer: correctIdx,
            feedback
          };
        }
        return q; // normalized legacy
      });

    this.currentQuiz = {
      questions,
      currentQuestion: 0,
      answers: new Array(questions.length).fill(null),
      startTime: Date.now(),
      timer: null
    };

    document.getElementById('quiz-title').textContent = `${topic.name} Quiz`;
    document.getElementById('quiz-results').classList.add('hidden');
    document.getElementById('quiz-content').style.display = 'block';
    document.getElementById('quiz-controls').style.display = 'flex';

    this.startQuiz();
  }

  startQuiz() {
    this.displayQuizQuestion();
    this.startQuizTimer();
    this.updateQuizProgress();
  }

  displayQuizQuestion() {
    const q = this.currentQuiz.questions[this.currentQuiz.currentQuestion];
    const n = this.currentQuiz.currentQuestion + 1;
    const total = this.currentQuiz.questions.length;

    document.getElementById('quiz-question-number').textContent = `Question ${n} of ${total}`;
    document.getElementById('question-text').textContent = q.text;

    const optionsContainer = document.getElementById('question-options');
    optionsContainer.innerHTML = q.options.map((opt, idx) => `
      <label class="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
        <input type="radio" name="quiz-option" value="${idx}" class="text-primary-500 focus:ring-primary-500">
        <span class="flex-1 text-gray-800">${opt}</span>
      </label>
    `).join('');

    // Remove any previous feedback
    const oldFeedback = document.querySelector('#quiz-question .quiz-feedback');
    if (oldFeedback) oldFeedback.remove();

    // Preselect if answered
    const sel = this.currentQuiz.answers[this.currentQuiz.currentQuestion];
    if (sel !== null) {
      const radio = optionsContainer.querySelector(`input[value="${sel}"]`);
      if (radio) radio.checked = true;
    }

    // Controls
    document.getElementById('quiz-prev-btn').disabled = this.currentQuiz.currentQuestion === 0;
    document.getElementById('quiz-submit-btn').style.display = 'block';
    document.getElementById('quiz-next-btn').style.display = 'none';
  }

  submitQuizAnswer() {
    const selected = document.querySelector('input[name="quiz-option"]:checked');
    if (!selected) {
      this.showToast('Please select an answer', 'error');
      return;
    }
    const answerIndex = parseInt(selected.value, 10);
    this.currentQuiz.answers[this.currentQuiz.currentQuestion] = answerIndex;

    const q = this.currentQuiz.questions[this.currentQuiz.currentQuestion];
    const isCorrect = answerIndex === q.correctAnswer;

    // Lock options and highlight
    const optionsContainer = document.getElementById('question-options');
    optionsContainer.querySelectorAll('input').forEach(i => i.disabled = true);
    optionsContainer.querySelectorAll('label').forEach((label, idx) => {
      if (idx === q.correctAnswer) {
        label.classList.add('bg-green-100', 'border-green-300');
      } else if (idx === answerIndex && !isCorrect) {
        label.classList.add('bg-red-100', 'border-red-300');
      }
    });

    this.showQuizFeedback(isCorrect, q, answerIndex);

    const last = this.currentQuiz.currentQuestion === this.currentQuiz.questions.length - 1;
    document.getElementById('quiz-submit-btn').style.display = 'none';
    document.getElementById('quiz-next-btn').style.display = last ? 'none' : 'block';

    if (last) {
      this.finishQuiz();
      return;
    }

    this.updateQuizProgress();
  }

   showQuizFeedback(isCorrect, question, selectedIndex) {
    const feedback = question.feedback?.[selectedIndex] || '';
    const correctOpt = question.options[question.correctAnswer];

    const div = document.createElement('div');
    div.className = `quiz-feedback mt-4 p-3 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`;
    div.innerHTML = `
      <div class="flex items-center space-x-2 mb-2">
        <span class="${isCorrect ? 'text-green-600' : 'text-red-600'}">${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</span>
      </div>
      ${feedback ? `<p class="text-sm text-gray-700">${feedback}</p>` : ''}
      ${!isCorrect ? `<p class="text-sm text-gray-600 mt-1">Correct answer: ${correctOpt}</p>` : ''}
    `;
    document.getElementById('quiz-question').appendChild(div);
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
    clearInterval(this.currentQuiz.timer);

    const total = this.currentQuiz.questions.length;
    let score = 0;
    this.currentQuiz.answers.forEach((ans, idx) => {
      if (ans !== null && ans === this.currentQuiz.questions[idx].correctAnswer) score++;
    });
    const percentage = Math.round((score / total) * 100);
    const timeSpent = Math.round((Date.now() - this.currentQuiz.startTime) / 1000);

    // Save attempt
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
    slot.lastUpdated = new Date().toISOString();
    this.saveData(false);

    // Show results
    const mm = Math.floor(timeSpent / 60);
    const ss = (timeSpent % 60).toString().padStart(2, '0');

    const finalScoreEl = document.getElementById('final-score');
    if (finalScoreEl) finalScoreEl.textContent = `${score}/${total} (${percentage}%)`;

    const breakdownEl = document.getElementById('score-breakdown');
    if (breakdownEl) breakdownEl.textContent = `Time: ${mm}:${ss}`;

    const resultsEl = document.getElementById('quiz-results');
    const contentEl = document.getElementById('quiz-content');
    const controlsEl = document.getElementById('quiz-controls');

    if (resultsEl) resultsEl.classList.remove('hidden');
    if (contentEl) contentEl.style.display = 'none';
    if (controlsEl) controlsEl.style.display = 'none';
  }

  startQuizTimer() {
    if (this.currentQuiz.timer) clearInterval(this.currentQuiz.timer);
    let seconds = 0;
    this.currentQuiz.timer = setInterval(() => {
      seconds++;
      const mm = Math.floor(seconds / 60);
      const ss = (seconds % 60).toString().padStart(2, '0');
      const el = document.getElementById('quiz-timer');
      if (el) el.textContent = `⏱️ ${mm}:${ss}`;
    }, 1000);
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
    clearInterval(this.currentQuiz.timer);
    const questions = this.currentQuiz.questions;
    this.currentQuiz = {
      questions,
      currentQuestion: 0,
      answers: new Array(questions.length).fill(null),
      startTime: Date.now(),
      timer: null
    };
    const results = document.getElementById('quiz-results');
    const content = document.getElementById('quiz-content');
    const controls = document.getElementById('quiz-controls');
    if (results) results.classList.add('hidden');
    if (content) content.style.display = 'block';
    if (controls) controls.style.display = 'flex';
    this.startQuiz();
  }

  reviewQuizAnswers() {
    const qc = document.getElementById('quiz-content');
    const results = document.getElementById('quiz-results');
    if (results) results.classList.add('hidden');
    if (qc) qc.style.display = 'block';

    const items = this.currentQuiz.questions.map((q, i) => {
      const user = this.currentQuiz.answers[i];
      return `
        <div class="bg-white border border-gray-200 p-4 rounded-lg mb-3">
          <p class="font-semibold mb-2">${i + 1}. ${q.text}</p>
          ${q.options.map((opt, idx) => `
            <div class="flex items-center space-x-2 text-sm">
              <span class="${idx === q.correctAnswer ? 'text-green-600 font-medium' : ''}">
                ${String.fromCharCode(65 + idx)}) ${opt}
              </span>
              ${idx === user ? '<span class="text-blue-500">• Your choice</span>' : ''}
              ${idx === q.correctAnswer ? '<span class="text-green-600">✓</span>' : ''}
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

    qc.innerHTML = `
      <div class="quiz-card bg-white p-6 rounded-xl">
        <h3 class="text-lg font-bold mb-4">Review</h3>
        <div>${items}</div>
      </div>
    `;
  }

  // Prompts and modal
  getStructurePrompt() {
    return `You are an expert academic analyzer. Create a structured breakdown using EXACT markers:

## COURSE_STRUCTURE_START: [Course Name]

### TOPIC_START: [Topic Name] ## DIFFICULTY: [Beginner/Intermediate/Advanced] ## CATEGORY: [Category]
#### SUBTOPIC: [Subtopic Name] ## CONCEPTS: [Key concept 1, Key concept 2]
### TOPIC_END

## COURSE_STRUCTURE_END

Rules:
1) Use the exact markers (TOPIC_START, SUBTOPIC, DIFFICULTY, CATEGORY, CONCEPTS).
2) Be comprehensive and ordered logically.
3) No extra commentary.`;
  }

  getContentPrompt(type, topic) {
    const p = this.data.settings.personalization || { depth: 'standard', examples: 'medium', rigor: 'light', readTime: 10 };
    const courseName = this.data.currentCourse?.name || 'Course';

    if (type === 'quiz') {
      return `ROLE: Assessment designer. Create MCQ-only quiz (10 items). Use course: ${courseName}, topic: "${topic.name}" (difficulty: ${topic.difficulty}).

OUTPUT STRICTLY AS A SINGLE FENCED JSON BLOCK:
\`\`\`json
{
  "schema_version": "quiz_mcq_v1",
  "topic_id": "${topic.id}",
  "title": "${topic.name} Quiz",
  "items": [
    {
      "id": "q1",
      "stem": "Write a clear question stem here...",
      "options": [
        {"text": "Option A", "feedback": "Why A is right/wrong", "isCorrect": false},
        {"text": "Option B", "feedback": "Why B is right/wrong", "isCorrect": true},
        {"text": "Option C", "feedback": "Why C is right/wrong", "isCorrect": false},
        {"text": "Option D", "feedback": "Why D is right/wrong", "isCorrect": false}
      ],
      "difficulty": "medium",
      "citation_ids": []
    }
  ],
  "metadata": {"count": 10}
}
\`\`\`
NO TEXT OUTSIDE THE JSON BLOCK.`;
    }

    if (type === 'flashcards') {
      return `ROLE: Flashcard expert. Create 18 high-quality cards for ${courseName} • ${topic.name}.

OUTPUT STRICTLY AS A SINGLE FENCED JSON BLOCK:
\`\`\`json
{
  "schema_version": "flashcards_v1",
  "topic_id": "${topic.id}",
  "cards": [
    {"id": "c1", "front": "Prompt question or term...", "back": "Concise answer with example.", "tags": ["definition"], "citation_ids": []}
  ],
  "total": 18
}
\`\`\`
NO TEXT OUTSIDE THE JSON BLOCK.`;
    }

    // reading_content_v1 hybrid for summary/explainer/review/practice
    return `ROLE: Expert tutor. Generate structured reading content with embedded micro-checks (MCQ) and optional citations.
TOPIC: ${courseName} • ${topic.name} (difficulty: ${topic.difficulty})
PERSONALIZATION: depth=${p.depth}, examples=${p.examples}, rigor=${p.rigor}, read_time=${p.readTime}min

OUTPUT STRICTLY AS A SINGLE FENCED JSON BLOCK:
\`\`\`json
{
  "schema_version": "reading_content_v1",
  "topic_id": "${topic.id}",
  "title": "${topic.name}",
  "rendered_markdown": "## ${topic.name}\\nWrite a coherent, accessible explanation here...",
  "sections": [
    {
      "section_id": "core",
      "title": "Core Concepts",
      "body_markdown": "Key ideas...",
      "micro_checks": [
        {
          "check_id": "mc1",
          "prompt": "Which statement is correct?",
          "options": [
            {"text": "Wrong A", "isCorrect": false, "feedback": "Why wrong"},
            {"text": "Right B", "isCorrect": true,  "feedback": "Why correct"},
            {"text": "Wrong C", "isCorrect": false, "feedback": "Why wrong"},
            {"text": "Wrong D", "isCorrect": false, "feedback": "Why wrong"}
          ],
          "citation_ids": []
        }
      ],
      "citations": []
    }
  ],
  "confidence": {"overall": 0.8, "coverage": 0.8, "notes": ""}
}
\`\`\`
NO TEXT OUTSIDE THE JSON BLOCK.`;
  }

  showPromptModal(title, prompt) {
    const titleEl = document.getElementById('prompt-modal-title');
    const textEl = document.getElementById('prompt-text');
    const modal = document.getElementById('prompt-modal');
    if (!titleEl || !textEl || !modal) return;
    titleEl.textContent = title;
    textEl.value = prompt;
    modal.classList.remove('hidden');
  }

  hidePromptModal() {
    const modal = document.getElementById('prompt-modal');
    if (modal) modal.classList.add('hidden');
  }

  copyPromptToClipboard() {
    const ta = document.getElementById('prompt-text');
    if (!ta) return;
    ta.select();
    document.execCommand('copy');
    this.showToast('Prompt copied to clipboard!', 'success');
    this.hidePromptModal();
  }

  // Study view
  loadStudyView() {
    const queueEl = document.getElementById('study-queue');
    if (!queueEl) return;

    const items = [];
    for (const course of this.data.courses) {
      for (const topic of course.topics || []) {
        for (const [type, slot] of Object.entries(topic.contentSlots || {})) {
          if (slot.status === 'empty') {
            items.push({
              kind: 'content',
              priority: 2,
              label: `${topic.name} • ${this.capitalize(type)}`,
              go: () => { this.data.currentCourse = course; this.showView('content', { type, topicId: topic.id }); }
            });
          }
        }
        if (topic.contentSlots?.flashcards?.status === 'filled') {
          items.push({
            kind: 'review',
            priority: 1,
            label: `${topic.name} • Flashcards Review`,
            go: () => { this.data.currentCourse = course; this.showView('content', { type: 'flashcards', topicId: topic.id }); }
          });
        }
      }
    }

    if (!items.length) {
      queueEl.innerHTML = `
        <div class="bg-gray-100 p-4 rounded-lg text-center text-gray-500">
          <p class="text-sm">No items in your queue yet.</p>
          <p class="text-xs mt-1">Add courses and generate content to begin.</p>
        </div>
      `;
      return;
    }

    items.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));

    queueEl.innerHTML = items.slice(0, 8).map((it, i) => `
      <div class="bg-white border border-gray-200 p-4 rounded-lg flex items-center justify-between">
        <div>
          <p class="font-medium text-gray-800">${i + 1}. ${it.label}</p>
          <p class="text-xs text-gray-500">${it.kind === 'review' ? 'Spaced repetition' : 'Create content'}</p>
        </div>
        <button class="px-3 py-1.5 bg-primary-500 text-white rounded-md text-sm hover:bg-primary-600" data-study-idx="${i}">Go</button>
      </div>
    `).join('');

    queueEl.querySelectorAll('button[data-study-idx]').forEach((btn, idx) => {
      btn.addEventListener('click', () => items[idx].go());
    });
  }

  // Utilities
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `p-4 rounded-lg shadow-lg text-white max-w-sm transform translate-x-0 opacity-100 transition-all duration-300 ${
      type === 'success' ? 'bg-green-500' :
      type === 'error' ? 'bg-red-500' :
      type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
    }`;
    toast.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="text-lg">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
        <span class="font-medium">${message}</span>
      </div>
    `;
    const container = document.getElementById('toast-container');
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
      toast.style.opacity = '0';
      setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
  }

  capitalize(str) {
    return (str || '').charAt(0).toUpperCase() + (str || '').slice(1);
  }

  // Data management
  exportData() {
    try {
      const dataStr = JSON.stringify(this.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `study-buddy-backup-${new Date().toISOString().split('T')[0]}.json`;
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
    if (file.type !== 'application/json') {
      this.showToast('Please select a valid JSON file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported || typeof imported !== 'object' || !('courses' in imported)) {
          this.showToast('Invalid file format', 'error');
          return;
        }
        if (confirm('This will replace all current data. Continue?')) {
          this.data = imported;
          this.saveData(false);
          this.showToast('Data imported successfully!', 'success');
          this.showView('dashboard');
          this.updateDashboard();
        }
      } catch {
        this.showToast('Invalid file format', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  clearAllData() {
    if (confirm('This will permanently delete all your data. Continue?')) {
      localStorage.removeItem('studyBuddyData');
      this.data = {
        courses: [],
        settings: {
          darkMode: false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          personalization: { depth: 'standard', examples: 'medium', rigor: 'light', readTime: 10 }
        },
        currentView: 'dashboard',
        currentCourse: null,
        currentTopic: null,
        currentContent: null
      };
      this.applyDarkMode(false);
      this.showToast('All data cleared', 'success');
      this.showView('dashboard');
      this.updateDashboard();
    }
  }
} // end class StudyBuddyApp

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.app = new StudyBuddyApp();
});

// Global helper for bottom nav / quick actions
function showView(viewName) {
  if (window.app) window.app.showView(viewName);
}

// Prompts Library buttons
function copyPrompt(type) {
  let prompt = '';
  if (type === 'structure') {
    prompt = app.getStructurePrompt();
  } else if (type === 'quiz') {
    prompt = `ROLE: Assessment designer. MCQ-only quiz (10 items).

OUTPUT:
\`\`\`json
{
  "schema_version": "quiz_mcq_v1",
  "topic_id": "topic_id_here",
  "title": "Topic Name Quiz",
  "items": [
    {
      "id": "q1",
      "stem": "Question here...",
      "options": [
        {"text": "Option A", "feedback": "Explain", "isCorrect": false},
        {"text": "Option B", "feedback": "Explain", "isCorrect": true},
        {"text": "Option C", "feedback": "Explain", "isCorrect": false},
        {"text": "Option D", "feedback": "Explain", "isCorrect": false}
      ],
      "difficulty": "medium",
      "citation_ids": []
    }
  ],
  "metadata": {"count": 10}
}
\`\`\`
NO TEXT OUTSIDE THE JSON BLOCK.`;
    } else if (type === 'flashcards') {
    prompt = `ROLE: Flashcard expert. Produce 18 cards.

OUTPUT:
\`\`\`json
{
  "schema_version": "flashcards_v1",
  "topic_id": "topic_id_here",
  "cards": [
    { "id": "c1", "front": "Front text", "back": "Back text", "tags": ["definition"], "citation_ids": [] }
  ],
  "total": 18
}
\`\`\`
NO TEXT OUTSIDE THE JSON BLOCK.`;
  } else {
    // reading / explainer / practice / review use reading template
    prompt = `ROLE: Expert tutor. Generate structured reading with micro-checks.

OUTPUT:
\`\`\`json
{
  "schema_version": "reading_content_v1",
  "topic_id": "topic_id_here",
  "title": "Topic Name",
  "rendered_markdown": "## Topic Name\\nContent...",
  "sections": [
    {
      "section_id": "intro",
      "title": "Introduction",
      "body_markdown": "Text...",
      "micro_checks": [
        {
          "check_id": "mc1",
          "prompt": "Which is correct?",
          "options": [
            {"text": "A", "isCorrect": false, "feedback": "Why"},
            {"text": "B", "isCorrect": true,  "feedback": "Why"},
            {"text": "C", "isCorrect": false, "feedback": "Why"},
            {"text": "D", "isCorrect": false, "feedback": "Why"}
          ],
          "citation_ids": []
        }
      ],
      "citations": []
    }
  ],
  "confidence": {"overall": 0.8, "coverage": 0.8, "notes": ""}
}
\`\`\`
NO TEXT OUTSIDE THE JSON BLOCK.`;
  }

  const fallbackCopy = () => {
    const ta = document.createElement('textarea');
    ta.value = prompt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    app.showToast('Prompt copied to clipboard!', 'success');
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(prompt)
      .then(() => app.showToast('Prompt copied to clipboard!', 'success'))
      .catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}