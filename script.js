/* ============================================================
   PivotMe — Main Script
   Offline-first architecture:
   1. IndexedDB is the primary data source
   2. Sync queue stores mutations for background sync
   3. Google Sheets is the cloud backup (synced when online)
   4. Notifications scheduled via Service Worker
   ============================================================ */

'use strict';

// ============================================================
// Configuration
// Dynamic API URL from localStorage (keeps sheet private to user)
// ============================================================
let API_URL = localStorage.getItem('blog-api-url') || '';

// ============================================================
// Standardized SVG Icon System
// ============================================================
const icons = {
  check: '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  partial: '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>',
  skip: '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>',
  calendar: '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevronRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  subtask: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><polyline points="3 6 4 7 6 5"/></svg>',
  shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  focus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>',
  parallel: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>',
  task: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  history: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 8 14"/></svg>',
  arrowRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  habit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
};

// In-memory suggestions cache to avoid repeated IndexedDB scans
const _suggestionCache = new Map();
function invalidateSuggestionCache() {
  _suggestionCache.clear();
}

// ============================================================
// API Helpers
// All operations use GET to avoid CORS redirect issues
// with Google Apps Script.
// ============================================================

async function apiCall(params) {
  if (!API_URL) {
    throw new Error('API URL not configured');
  }
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_URL}?${query}`);
  const data = await response.json();
  if (data && data.error) {
    throw new Error(data.error);
  }
  return data;
}

/** Fetch all habits from the Habits sheet. */
async function fetchHabits() {
  return apiCall({ action: 'getHabits' });
}

/** Fetch all tasks from the Tasks sheet. */
async function fetchTasks() {
  return apiCall({ action: 'getTasks' });
}

/** Fetch all logs from the Logs sheet. */
async function fetchLogs() {
  return apiCall({ action: 'getLogs' });
}

/**
 * Save a new log entry (v4 — includes behavioral fields).
 * @param {Object} logParams — full log parameter object
 */
async function saveLog(logParams) {
  return apiCall({
    action: 'saveLog',
    ...logParams
  });
}

/**
 * Save a new custom item (Habit or Task) — v4 with priority, chain, recurrence.
 */
async function apiAddItem(params) {
  return apiCall({
    action: 'addItem',
    ...params
  });
}

/**
 * Delete a custom item from the spreadsheet.
 * @param {string} type — "Habit" or "Task"
 * @param {string} name — name of the item to delete
 */
async function apiDeleteItem(type, name) {
  return apiCall({
    action: 'deleteItem',
    type,
    name
  });
}

/**
 * Update the remind configuration for an item.
 * @param {string} type — "Habit" or "Task"
 * @param {string} name — item name
 * @param {boolean} remind — true/false
 */
async function apiToggleReminder(type, name, remind) {
  return apiCall({
    action: 'toggleReminder',
    type,
    name,
    remind: remind ? 'true' : 'false'
  });
}

// ============================================================
// Theme
// ============================================================

/** Read saved theme or fall back to system preference. */
function initTheme() {
  const saved = localStorage.getItem('blog-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
  updateThemeIcon();
}

/** Toggle between dark and light. */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('blog-theme', next);
  updateThemeIcon();
}

/** Swap the SVG inside the theme toggle button. */
function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  // Sun icon for dark mode (click to go light), Moon for light mode
  btn.innerHTML = isDark
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

// ============================================================
// Utility: String and Date helpers
// ============================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getTodayDate() {
  return todayDateStr();
}

function priorityBadgeHTML(priority) {
  const p = priority || 'Normal';
  const cls = {
    'Important & To Do': 'priority-important',
    'To Do': 'priority-todo',
    'Optional': 'priority-optional',
    "Don't Do": 'priority-dontdo',
    'Normal': 'priority-normal'
  }[p] || 'priority-normal';
  return `<span class="priority-badge ${cls}">${escapeHtml(p)}</span>`;
}

function todayDateStr() {
  return new Date().toLocaleDateString('en-CA');
}

function nowTimeStr() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// List Rendering
// ============================================================

// State for infinite scroll pagination
let _renderedItems = [];
let _renderedType = '';
let _renderedContainerId = '';
let _shownCount = 6;
let _scrollObserver = null;

/**
 * Safely parse task subtasks array
 */
function getTaskSubtasks(item) {
  if (!item || !item.subtasks) return [];
  if (Array.isArray(item.subtasks)) return item.subtasks;
  if (typeof item.subtasks === 'string') {
    try { return JSON.parse(item.subtasks); } catch(e) { return []; }
  }
  return [];
}

/**
 * Safely parse task or subtask next actions array
 */
function getItemNextActions(item) {
  if (!item || !item.nextActions) return [];
  if (Array.isArray(item.nextActions)) return item.nextActions;
  if (typeof item.nextActions === 'string') {
    try { return JSON.parse(item.nextActions); } catch(e) { return []; }
  }
  return [];
}

/**
 * Safely parse task next actions.
 * If task has legacy subtasks and no direct nextActions, flattens them for backwards compatibility.
 */
function getTaskNextActions(item) {
  if (!item) return [];
  const directActions = getItemNextActions(item);
  if (directActions.length > 0) return directActions;

  // Backward compatibility: flatten legacy subtasks into Next Actions
  const legacySubtasks = getTaskSubtasks(item);
  if (legacySubtasks.length > 0) {
    const flattened = [];
    legacySubtasks.forEach((st, idx) => {
      flattened.push({
        id: st.id || `legacy_${idx}`,
        name: st.name,
        type: 'action',
        priority: st.priority || item.priority || '',
        place: st.place || '',
        time: st.time || '',
        removeAfterCompletion: st.removeAfterCompletion !== false,
        done: st.done || st.status === 'Done',
        status: st.status || (st.done ? 'Done' : ''),
        order: idx
      });
      const childActions = getItemNextActions(st);
      if (childActions.length > 0) {
        childActions.forEach((ca, cidx) => {
          flattened.push({
            id: ca.id || `legacy_child_${idx}_${cidx}`,
            name: `${st.name}: ${ca.name}`,
            type: 'action',
            priority: ca.priority || st.priority || item.priority || '',
            place: ca.place || '',
            time: ca.time || '',
            removeAfterCompletion: ca.removeAfterCompletion !== false,
            done: ca.done || ca.status === 'Done',
            status: ca.status || (ca.done ? 'Done' : ''),
            order: flattened.length
          });
        });
      }
    });
    return flattened;
  }
  return [];
}

/**
 * Calculate upward structural progress according to meaningful child hierarchy.
 * Returns null if the item has no subtasks and no next actions (do not show percentage).
 * Equal branch weighting: deeply nested groups do not unfairly overweight one branch.
 */
function calculateTaskProgress(item) {
  if (!item) return null;
  const subtasks = getTaskSubtasks(item);
  const nextActions = getItemNextActions(item);

  // If node has no subtasks and no next actions
  if (subtasks.length === 0 && nextActions.length === 0) {
    return null; // No structural children
  }

  // If node has ordered next actions and no child subtasks
  if (subtasks.length === 0 && nextActions.length > 0) {
    let completedCount = 0;
    let partialCount = 0;
    let sumScore = 0;
    nextActions.forEach(a => {
      if (a.status === 'Done' || a.done) {
        completedCount++;
        sumScore += 1.0;
      } else if (a.status === 'Partially Done') {
        partialCount++;
        sumScore += 0.5;
      }
    });
    const totalCount = nextActions.length;
    const score = totalCount > 0 ? sumScore / totalCount : 0;
    const pct = Math.round(score * 100);
    return {
      score,
      pct,
      completedCount,
      partialCount,
      totalCount,
      type: 'actions',
      isComplete: completedCount === totalCount && totalCount > 0,
      isPartial: partialCount > 0 || (completedCount > 0 && completedCount < totalCount)
    };
  }

  // If node has subtasks (meaningful branches)
  const branches = [...subtasks];
  let directActionsBranch = null;
  if (nextActions.length > 0) {
    let actDone = 0;
    let actPartial = 0;
    let actSum = 0;
    nextActions.forEach(a => {
      if (a.status === 'Done' || a.done) { actDone++; actSum += 1.0; }
      else if (a.status === 'Partially Done') { actPartial++; actSum += 0.5; }
    });
    const actTotal = nextActions.length;
    directActionsBranch = {
      score: actTotal > 0 ? actSum / actTotal : 0,
      isComplete: actDone === actTotal && actTotal > 0,
      isPartial: actPartial > 0 || (actDone > 0 && actDone < actTotal)
    };
  }

  let completedBranches = 0;
  let partialBranches = 0;
  let sumBranchScores = 0;

  branches.forEach(sub => {
    const childCalc = calculateTaskProgress(sub);
    if (childCalc !== null) {
      sumBranchScores += childCalc.score;
      if (childCalc.score >= 0.999) {
        completedBranches++;
      } else if (childCalc.score > 0.001 || childCalc.isPartial) {
        partialBranches++;
      }
    } else {
      // Leaf subtask with no children
      if (sub.status === 'Done' || sub.done) {
        completedBranches++;
        sumBranchScores += 1.0;
      } else if (sub.status === 'Partially Done') {
        partialBranches++;
        sumBranchScores += 0.5;
      }
    }
  });

  if (directActionsBranch) {
    sumBranchScores += directActionsBranch.score;
    if (directActionsBranch.isComplete) completedBranches++;
    else if (directActionsBranch.isPartial) partialBranches++;
  }

  const totalBranches = branches.length + (directActionsBranch ? 1 : 0);
  const score = totalBranches > 0 ? sumBranchScores / totalBranches : 0;
  const pct = Math.round(score * 100);

  return {
    score,
    pct,
    completedCount: completedBranches,
    partialCount: partialBranches,
    totalCount: totalBranches,
    type: 'subtasks',
    isComplete: completedBranches === totalBranches && totalBranches > 0,
    isPartial: partialBranches > 0 || (completedBranches > 0 && completedBranches < totalBranches)
  };
}

/**
 * Resolve the next available concrete action in sequence.
 * Next Actions are strictly ordered. When Action 1 is done, Action 2 becomes next available.
 */
function resolveNextAvailableAction(item) {
  if (!item) return null;
  const subtasks = getTaskSubtasks(item);
  const nextActions = getItemNextActions(item);

  // 1. Direct next actions on the item (ordered)
  if (nextActions.length > 0) {
    const nextAct = nextActions.find(a => !a.done && a.status !== 'Done');
    if (nextAct) {
      return {
        id: nextAct.id || nextAct.name,
        name: nextAct.name,
        priority: nextAct.priority || item.priority || '',
        parentName: item.name,
        isAction: true,
        action: nextAct
      };
    }
  }

  // 2. Uncompleted subtasks
  for (const sub of subtasks) {
    const isSubDone = sub.status === 'Done' || sub.done;
    if (!isSubDone) {
      // Check if this subtask has child next actions
      const subActions = getItemNextActions(sub);
      if (subActions.length > 0) {
        const subAct = subActions.find(a => !a.done && a.status !== 'Done');
        if (subAct) {
          return {
            id: subAct.id || subAct.name,
            name: subAct.name,
            priority: subAct.priority || sub.priority || item.priority || '',
            parentName: sub.name,
            isAction: true,
            action: subAct
          };
        }
      }
      // Check if this subtask has child subtasks
      const childSubs = getTaskSubtasks(sub);
      if (childSubs.length > 0) {
        const nestedRes = resolveNextAvailableAction(sub);
        if (nestedRes) return nestedRes;
      }
      // Leaf subtask itself is the next step
      return {
        id: sub.id || sub.name,
        name: sub.name,
        priority: sub.priority || item.priority || '',
        parentName: item.name,
        isAction: false,
        subtask: sub
      };
    }
  }

  // 3. Fallback to item.nextStep if present
  if (item.nextStep && item.nextStep.trim()) {
    return { name: item.nextStep.trim(), parentName: item.name, isAction: false };
  }

  return null;
}

/**
 * Recursive tree search for a node by ID or name
 */
function findNodeInTaskTree(task, targetId) {
  if (!task || !targetId) return null;
  const subtasks = getTaskSubtasks(task);
  const nextActions = getItemNextActions(task);

  for (let i = 0; i < nextActions.length; i++) {
    const a = nextActions[i];
    if (a.id === targetId || (a.name && a.name === targetId)) {
      return { node: a, type: 'action', parent: task, index: i, list: nextActions };
    }
  }

  for (let i = 0; i < subtasks.length; i++) {
    const s = subtasks[i];
    if (s.id === targetId || (s.name && s.name === targetId)) {
      return { node: s, type: 'subtask', parent: task, index: i, list: subtasks };
    }
    const found = findNodeInTaskTree(s, targetId);
    if (found) return found;
  }

  return null;
}

function renderList(items, type, containerId) {
  _renderedItems = items || [];
  _renderedType = type;
  _renderedContainerId = containerId;
  _shownCount = 6;

  // Filter completed tasks when removeAfterCompletion is enabled or by default
  if (type === 'Task') {
    _renderedItems = _renderedItems.filter(t => {
      if (t.isCompleted) {
        return t.removeAfterCompletion === false;
      }
      return true;
    });
  }
  
  renderNextBatch();
}

function renderNextBatch() {
  const container = document.getElementById(_renderedContainerId);
  if (!container) return;

  // Clean up observer if it exists
  if (_scrollObserver) {
    _scrollObserver.disconnect();
    _scrollObserver = null;
  }

  // Remove existing sentinel if it exists
  const existingSentinel = document.getElementById('infinite-scroll-sentinel');
  if (existingSentinel) {
    existingSentinel.remove();
  }

  // Clear container if this is the first batch
  if (_shownCount === 6) {
    container.innerHTML = '';
  }

  if (_renderedItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No items yet. Add them in Settings or click + Add.</div>';
    return;
  }

  // Slice only the new items to render in this batch
  const startIndex = _shownCount - 6;
  const endIndex = Math.min(_renderedItems.length, _shownCount);
  const itemsToRender = _renderedItems.slice(startIndex, endIndex);

  itemsToRender.forEach((item, i) => {
    try {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.animationDelay = `${i * 0.05}s`;

    const titleRow = document.createElement('div');
    titleRow.className = 'card-title-row';

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = item.name;
    titleRow.appendChild(name);

    // Badges container
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'card-badges';

    // Bad Habit Badge
    if (_renderedType === 'Habit' && item.behaviorType === 'Bad') {
      const badge = document.createElement('span');
      badge.className = 'badge-quit';
      badge.textContent = 'To Quit';
      badgeContainer.appendChild(badge);
    }

    // Priority Badge (always visible for tasks; for habits if set)
    if (_renderedType === 'Task' || item.priority) {
      const badge = document.createElement('span');
      badge.innerHTML = priorityBadgeHTML(item.priority);
      badgeContainer.appendChild(badge.firstElementChild || badge);
    }

    if (badgeContainer.children.length > 0) {
      titleRow.appendChild(badgeContainer);
    }
    card.appendChild(titleRow);

    // Optional meta (time, place, dates, chain, recurrence)
    const parts = [];
    if (item.time) parts.push(formatTimeForDisplay(item.time));
    if (item.place) parts.push(item.place);
    if (_renderedType === 'Task') {
      if (item.taskDate) parts.push(`Date: ${item.taskDate}`);
      if (item.startDate) parts.push(`Start: ${item.startDate}`);
      
      // Recurrence indicator
      if (item.recurrence && Array.isArray(item.recurrence) && item.recurrence.length > 0) {
        const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const days = item.recurrence.map(d => dayLabels[d]).join(', ');
        parts.push(`Repeats: ${days}`);
      }
    }
    if (parts.length) {
      const meta = document.createElement('span');
      meta.className = 'card-meta';
      meta.textContent = parts.join(' · ');
      card.appendChild(meta);
    }

    // Objective for Tasks
    if (_renderedType === 'Task' && item.objective && item.objective.trim()) {
      const objEl = document.createElement('div');
      objEl.className = 'card-task-objective';
      objEl.innerHTML = `<span class="card-objective-label">Objective:</span> ${escapeHtml(item.objective.trim())}`;
      card.appendChild(objEl);
    }

    // Deadline Tag for Tasks
    if (_renderedType === 'Task' && item.deadline) {
      const todayStr = new Date().toLocaleDateString('en-CA');
      const deadEl = document.createElement('div');
      deadEl.style.marginTop = '6px';
      if (item.deadline < todayStr) {
        deadEl.innerHTML = `<span class="badge-deadline overdue">Overdue: ${item.deadline}</span>`;
      } else if (item.deadline === todayStr) {
        deadEl.innerHTML = `<span class="badge-deadline today">Due Today</span>`;
      } else {
        deadEl.innerHTML = `<span class="badge-deadline">Due ${item.deadline}</span>`;
      }
      card.appendChild(deadEl);
    }

    // Habit Fallback & Replacement context indicators
    if (_renderedType === 'Habit') {
      if (item.behaviorType !== 'Bad' && item.fallbackAction) {
        const fbEl = document.createElement('div');
        fbEl.className = 'card-fallback-preview';
        fbEl.innerHTML = `<span class="card-objective-label">Fallback:</span> ${escapeHtml(item.fallbackAction)}`;
        card.appendChild(fbEl);
      } else if (item.behaviorType === 'Bad' && item.replacementAction) {
        const replEl = document.createElement('div');
        replEl.className = 'card-fallback-preview';
        replEl.innerHTML = `<span class="card-objective-label">Replacement:</span> ${escapeHtml(item.replacementAction)}`;
        card.appendChild(replEl);
      }
    }

    // Chain info for habits
    if (_renderedType === 'Habit' && (item.prevHabit || item.nextHabit)) {
      const chainInfo = document.createElement('div');
      chainInfo.className = 'chain-badge';
      let chainText = '';
      if (item.prevHabit) chainText += `Prev: ${item.prevHabit}`;
      if (item.prevHabit && item.nextHabit) chainText += ' · ';
      if (item.nextHabit) chainText += `Next: ${item.nextHabit}`;
      chainInfo.innerHTML = `${icons.link} ${chainText}`;
      card.appendChild(chainInfo);
    }

    if (_renderedType === 'Task') {
      const actions = getTaskNextActions(item);

      const nextActionsSection = document.createElement('div');
      nextActionsSection.className = 'card-next-actions-group';
      nextActionsSection.style.cssText = 'margin: 12px 0 14px 0; padding-top: 10px; border-top: 1px solid var(--separator);';

      const groupTitle = document.createElement('div');
      groupTitle.style.cssText = 'font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin-bottom: 8px;';
      groupTitle.textContent = 'Next Actions:';
      nextActionsSection.appendChild(groupTitle);

      if (actions.length === 0) {
        const emptyHint = document.createElement('div');
        emptyHint.style.cssText = 'font-size: 0.82rem; color: var(--text-tertiary); font-style: italic;';
        emptyHint.textContent = 'No Next Actions yet. What could you do next?';
        nextActionsSection.appendChild(emptyHint);
      } else {
        const actionsList = document.createElement('div');
        actionsList.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

        let firstUnfinishedFound = false;
        actions.forEach(act => {
          const isDone = act.status === 'Done' || act.done;
          if (isDone && act.removeAfterCompletion !== false) return;

          const actRow = document.createElement('div');
          actRow.className = 'next-action-row-item';
          actRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; border-radius: var(--radius-xs); background: var(--surface-hover); cursor: pointer; transition: all 0.2s;';

          let prefix = '○ ';
          let color = 'var(--text)';
          let fontWeight = '500';

          if (!isDone && !firstUnfinishedFound) {
            prefix = '→ ';
            color = 'var(--accent)';
            fontWeight = '700';
            firstUnfinishedFound = true;
            actRow.style.background = 'rgba(99, 102, 241, 0.08)';
            actRow.style.borderLeft = '3px solid var(--accent)';
          } else if (isDone) {
            prefix = '✓ ';
            color = 'var(--text-tertiary)';
            actRow.style.textDecoration = 'line-through';
          }

          actRow.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
              <span style="color: ${color}; font-weight: 700; font-size: 0.9rem;">${prefix}</span>
              <span style="color: ${color}; font-weight: ${fontWeight}; font-size: 0.86rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(act.name)}</span>
            </div>
            <span style="font-size: 0.72rem; color: var(--text-tertiary); text-transform: uppercase; font-weight: 600;">Execute ▸</span>
          `;

          actRow.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `next-action.html?task=${encodeURIComponent(item.name)}&actionId=${encodeURIComponent(act.id || act.name)}`;
          });

          actionsList.appendChild(actRow);
        });
        nextActionsSection.appendChild(actionsList);
      }
      card.appendChild(nextActionsSection);
    }

    // Card Action Footer
    const actionsBar = document.createElement('div');
    actionsBar.className = 'card-actions-bar';
    if (_renderedType === 'Task') {
      const addActionBtn = document.createElement('button');
      addActionBtn.className = 'card-action-btn primary';
      addActionBtn.innerHTML = `+ Next Action`;
      addActionBtn.title = "Add next action";
      addActionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modalState = { item: item, type: 'Task', name: item.name };
        openAddActionModal('', item.name);
      });
      actionsBar.appendChild(addActionBtn);

      const editBtn = document.createElement('button');
      editBtn.className = 'card-action-btn';
      editBtn.innerHTML = `${icons.edit} Edit`;
      editBtn.title = "Edit task";
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditItemModal(item, 'Task');
      });
      actionsBar.appendChild(editBtn);

      // If task has 0 next actions (Simple Task) or user wants to log outcome directly:
      const actions = getTaskNextActions(item);
      if (actions.length === 0) {
        const logBtn = document.createElement('button');
        logBtn.className = 'card-action-btn';
        logBtn.innerHTML = `${icons.check} Log Task`;
        logBtn.title = "Log task";
        logBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openModal(item, 'Task');
        });
        actionsBar.appendChild(logBtn);
      }
    } else {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'card-action-btn primary';
      actionBtn.innerHTML = `${icons.check} Log Habit`;
      actionsBar.appendChild(actionBtn);

      const editBtn = document.createElement('button');
      editBtn.className = 'card-action-btn';
      editBtn.innerHTML = `${icons.edit} Edit`;
      editBtn.title = "Edit habit";
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditItemModal(item, 'Habit');
      });
      actionsBar.appendChild(editBtn);
    }
    card.appendChild(actionsBar);

    card.addEventListener('click', () => {
      if (_renderedType === 'Task') {
        window.location.href = `task-details.html?task=${encodeURIComponent(item.name)}`;
      } else {
        openModal(item, _renderedType);
      }
    });
    container.appendChild(card);
    } catch (e) {
      console.error('Error rendering item card:', item, e);
    }
  });

  // If there are more items, append a sentinel and observe it
  if (_shownCount < _renderedItems.length) {
    const sentinel = document.createElement('div');
    sentinel.id = 'infinite-scroll-sentinel';
    sentinel.style.height = '40px';
    sentinel.style.display = 'flex';
    sentinel.style.justifyContent = 'center';
    sentinel.style.alignItems = 'center';
    sentinel.innerHTML = '<div class="loading-spinner" style="width:20px;height:20px;margin:0;"></div>';
    container.appendChild(sentinel);

    _scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        _shownCount += 6;
        renderNextBatch();
      }
    }, { rootMargin: '100px' });
    _scrollObserver.observe(sentinel);
  }
}

/**
 * Format a 24h time string (HH:MM) to a friendly display format (h:MM AM/PM).
 */
function formatTimeForDisplay(timeStr) {
  if (!timeStr) return '';
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr;
  let h = parseInt(match[1]);
  const m = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

// ============================================================
// Modal — Log Entry (v4: behavioral logging)
// ============================================================
let modalState = { name: '', type: '', status: '', reason: '', behaviorType: 'Good', item: null };
let editItemState = { isEdit: false, oldName: '', item: null };
let currentSubtasks = [];

/** Open the edit modal for an existing habit/task */
function openEditItemModal(item, type) {
  editItemState = { isEdit: true, oldName: item.name, item: item };
  const overlay = document.getElementById('add-item-overlay');
  if (overlay) {
    document.getElementById('add-modal-title').textContent = `Edit ${type}`;
    const saveBtn = document.getElementById('add-item-save-btn');
    if (saveBtn) saveBtn.textContent = 'Save Changes';

    document.getElementById('new-item-name').value = item.name || '';
    document.getElementById('new-item-time').value = item.time || '';
    document.getElementById('new-item-place').value = item.place || '';
    
    const typeSelect = document.getElementById('new-item-type');
    if (typeSelect) typeSelect.value = item.behaviorType || 'Good';

    const prioritySelect = document.getElementById('new-item-priority');
    if (prioritySelect) prioritySelect.value = item.priority || '';

    const remindCheckbox = document.getElementById('new-item-remind');
    if (remindCheckbox) remindCheckbox.checked = !!item.remind;

    // Habit target, fallback, and replacement action fields
    const targetInput = document.getElementById('new-item-target');
    const fallbackInput = document.getElementById('new-item-fallback');
    const replacementInput = document.getElementById('new-item-replacement');
    if (targetInput) targetInput.value = item.target || '';
    if (fallbackInput) fallbackInput.value = item.fallbackAction || item.fallback || '';
    if (replacementInput) replacementInput.value = item.replacementAction || item.replacement || '';

    const growthFields = document.getElementById('growth-habit-config-fields');
    const quitFields = document.getElementById('quit-habit-config-fields');
    const nameLabel = document.getElementById('new-item-name-label');
    const nameInput = document.getElementById('new-item-name');
    if (growthFields && quitFields) {
      const isBad = (item.behaviorType || 'Good') === 'Bad';
      growthFields.style.display = isBad ? 'none' : 'block';
      quitFields.style.display = isBad ? 'block' : 'none';
      if (type === 'Habit') {
        if (nameLabel) nameLabel.textContent = isBad ? 'Behavior being stopped *' : 'Habit Name *';
        if (nameInput) nameInput.placeholder = isBad ? 'e.g. Late night scrolling, Nail biting' : 'e.g. Morning Exercise, Read 30 mins';
      } else {
        if (nameLabel) nameLabel.textContent = 'Task Name *';
        if (nameInput) nameInput.placeholder = 'e.g. Prepare presentation, File taxes';
      }
    }

    // Task-specific fields
    const startDateInput = document.getElementById('new-item-start-date');
    const deadlineInput = document.getElementById('new-item-deadline');
    if (startDateInput) startDateInput.value = item.startDate || '';
    if (deadlineInput) deadlineInput.value = item.deadline || '';

    const objectiveInput = document.getElementById('new-item-objective');
    if (objectiveInput) objectiveInput.value = item.objective || '';

    // Temporary task toggle
    const tempToggle = document.getElementById('new-item-is-temporary');
    const nonTempFields = document.getElementById('non-temp-fields');
    if (tempToggle) {
      tempToggle.checked = !!item.isTemporary;
      if (nonTempFields) nonTempFields.style.display = item.isTemporary ? 'none' : 'block';
    }

    // Remove after completion toggle
    const removeAfterCompToggle = document.getElementById('new-item-remove-after-completion');
    if (removeAfterCompToggle) {
      removeAfterCompToggle.checked = item.removeAfterCompletion !== false;
    }

    // Recurrence toggles
    const recurrenceContainer = document.getElementById('new-item-recurrence');
    if (recurrenceContainer) {
      const recDays = (item.recurrence && Array.isArray(item.recurrence)) ? item.recurrence : [];
      recurrenceContainer.querySelectorAll('.weekday-btn').forEach(btn => {
        const day = parseInt(btn.dataset.day);
        btn.classList.toggle('active', recDays.includes(day));
      });
    }

    // Load subtasks
    if (item.subtasks) {
      if (typeof item.subtasks === 'string') {
        try { currentSubtasks = JSON.parse(item.subtasks); } catch (e) { currentSubtasks = []; }
      } else if (Array.isArray(item.subtasks)) {
        currentSubtasks = JSON.parse(JSON.stringify(item.subtasks));
      } else {
        currentSubtasks = [];
      }
    } else {
      currentSubtasks = [];
    }

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

// ============================================================
// Simplified Task & Next Action View Architecture
// ============================================================

let _editingAction = null;

function renderTaskDetailsMeta(task) {
  renderActiveDetailView();
}

/**
 * Main detail view renderer for task-details.html.
 * Focused single-task overview displaying ordered Next Actions.
 */
function renderActiveDetailView() {
  if (!modalState || !modalState.item) return;
  const task = modalState.item;

  // 1. Title & Header Subtitle
  const titleEl = document.getElementById('task-title');
  if (titleEl) titleEl.textContent = task.name;

  const subtitleEl = document.getElementById('task-header-subtitle');
  if (subtitleEl) {
    subtitleEl.innerHTML = '';

    // Type Badge: TASK
    const typeBadge = document.createElement('span');
    typeBadge.className = 'badge-subtask';
    typeBadge.style.fontSize = '0.72rem';
    typeBadge.style.fontWeight = '700';
    typeBadge.style.background = 'var(--accent)';
    typeBadge.style.color = '#fff';
    typeBadge.textContent = 'TASK';
    subtitleEl.appendChild(typeBadge);

    // Priority Badge
    if (task.priority) {
      const pBadge = document.createElement('span');
      const pLower = task.priority.toLowerCase().replace(/[^a-z]/g, '');
      pBadge.className = `priority-badge priority-${pLower === 'dontdo' ? 'dontdo' : (pLower === 'optional' ? 'optional' : (pLower === 'important' ? 'important' : 'todo'))}`;
      pBadge.style.fontSize = '0.72rem';
      pBadge.textContent = task.priority;
      subtitleEl.appendChild(pBadge);
    }

    // Due / Deadline Date Badge
    if (task.deadline) {
      const dBadge = document.createElement('span');
      const isOverdue = task.deadline < getTodayDate();
      const isToday = task.deadline === getTodayDate();
      dBadge.className = `badge-deadline ${isOverdue ? 'overdue' : (isToday ? 'today' : '')}`;
      dBadge.style.fontSize = '0.72rem';
      dBadge.textContent = isOverdue ? `Overdue: ${task.deadline}` : (isToday ? `Due Today: ${task.deadline}` : `Due: ${task.deadline}`);
      subtitleEl.appendChild(dBadge);
    }
  }

  // 2. Objective Card
  const objCard = document.getElementById('task-objective-card');
  const objText = document.getElementById('task-objective-text');
  if (objCard && objText) {
    if (task.objective && task.objective.trim()) {
      objText.textContent = task.objective.trim();
      objCard.style.display = 'block';
    } else {
      objCard.style.display = 'none';
    }
  }

  // 3. Meta Pills
  const metaEl = document.getElementById('task-meta');
  if (metaEl) {
    metaEl.innerHTML = '';
    if (task.priority) {
      const pBadge = document.createElement('span');
      const pLower = task.priority.toLowerCase().replace(/[^a-z]/g, '');
      pBadge.className = `priority-badge priority-${pLower === 'dontdo' ? 'dontdo' : (pLower === 'optional' ? 'optional' : (pLower === 'important' ? 'important' : 'todo'))}`;
      pBadge.textContent = task.priority;
      metaEl.appendChild(pBadge);
    }
    if (task.deadline) {
      const dBadge = document.createElement('span');
      const isOverdue = task.deadline < getTodayDate();
      const isToday = task.deadline === getTodayDate();
      dBadge.className = `badge-deadline ${isOverdue ? 'overdue' : (isToday ? 'today' : '')}`;
      dBadge.textContent = isOverdue ? `Overdue: ${task.deadline}` : (isToday ? `Due Today: ${task.deadline}` : `Due: ${task.deadline}`);
      metaEl.appendChild(dBadge);
    }
    const startVal = task.startDate || task.taskDate;
    if (startVal) {
      const dtBadge = document.createElement('span');
      dtBadge.className = 'meta-pill';
      dtBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Start: ${startVal}`;
      metaEl.appendChild(dtBadge);
    }
    if (task.time) {
      const tBadge = document.createElement('span');
      tBadge.className = 'meta-pill';
      tBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${formatTimeForDisplay(task.time)}`;
      metaEl.appendChild(tBadge);
    }
    if (task.place) {
      const plBadge = document.createElement('span');
      plBadge.className = 'meta-pill';
      plBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${task.place}`;
      metaEl.appendChild(plBadge);
    }
    if (metaEl.children.length === 0) {
      metaEl.innerHTML = '<span style="font-size:0.8rem;color:var(--text-tertiary);">No additional parameters</span>';
    }
  }

  // 4. Primary Action Buttons Row
  const actionsRow = document.getElementById('task-actions-row');
  if (actionsRow) {
    actionsRow.innerHTML = '';

    // + Next Action button
    const addActionBtn = document.createElement('button');
    addActionBtn.type = 'button';
    addActionBtn.className = 'save-btn';
    addActionBtn.style.cssText = 'background:var(--accent);color:#fff;font-size:0.85rem;padding:8px 16px;width:auto;margin:0;min-height:40px;white-space:nowrap;font-weight:600;flex:1;min-width:130px;';
    addActionBtn.textContent = '+ Next Action';
    addActionBtn.onclick = () => {
      openAddActionModal('', task.name);
    };
    actionsRow.appendChild(addActionBtn);

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'save-btn';
    editBtn.style.cssText = 'background:var(--surface-hover);color:var(--text);border:1px solid var(--separator);font-size:0.85rem;padding:8px 14px;width:auto;margin:0;min-height:40px;white-space:nowrap;font-weight:600;flex:1;min-width:100px;';
    editBtn.innerHTML = `${icons.edit} Edit Task`;
    editBtn.onclick = () => {
      openEditItemModal(task, 'Task');
    };
    actionsRow.appendChild(editBtn);

    // Log Task Outcome button
    const logTaskBtn = document.createElement('button');
    logTaskBtn.type = 'button';
    logTaskBtn.className = 'save-btn';
    logTaskBtn.style.cssText = 'background:var(--surface-hover);color:var(--text-secondary);border:1px solid var(--separator);font-size:0.85rem;padding:8px 14px;width:auto;margin:0;min-height:40px;white-space:nowrap;font-weight:600;flex:1;min-width:140px;';
    logTaskBtn.innerHTML = `${icons.check} Log Task Outcome`;
    logTaskBtn.onclick = () => {
      openModal(task, 'Task');
    };
    actionsRow.appendChild(logTaskBtn);
  }

  // 5. Trigger button at top of Next Actions section
  const topAddActBtn = document.getElementById('add-action-trigger-btn');
  if (topAddActBtn) {
    topAddActBtn.onclick = () => openAddActionModal('', task.name);
  }

  // 6. Next Actions List
  renderTreeNodes(task, task, false);

  // 7. Secondary Card (Deadline, Reminder, Delete)
  const extendDate = document.getElementById('extend-deadline-date');
  if (extendDate) {
    extendDate.value = task.deadline || '';
  }
  const dHistEl = document.getElementById('task-deadline-history');
  if (dHistEl) {
    if (task.deadlineExtensions && task.deadlineExtensions.length > 0) {
      const exts = task.deadlineExtensions.map(e => `${e.date}: extended to ${e.newDeadline}${e.reason ? ` (${e.reason})` : ''}`).join('<br>');
      dHistEl.innerHTML = `<strong>Extension history:</strong><br>${exts}`;
      dHistEl.style.display = 'block';
    } else if (task.originalDeadline && task.originalDeadline !== task.deadline) {
      dHistEl.innerHTML = `Original deadline: ${task.originalDeadline}`;
      dHistEl.style.display = 'block';
    } else {
      dHistEl.style.display = 'none';
    }
  }

  const reminderTimeInput = document.getElementById('subtask-reminder-time');
  const setReminderBtn = document.getElementById('set-subtask-reminder-btn');
  if (reminderTimeInput && setReminderBtn) {
    const remVal = task.subtaskReminderTime || task.time;
    reminderTimeInput.value = remVal || '';
    if (remVal) {
      setReminderBtn.textContent = `Update (${formatTimeForDisplay(remVal)})`;
    } else {
      setReminderBtn.textContent = 'Enable';
    }
  }

  // Ensure content is visible
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'none';
  const contentEl = document.getElementById('task-content');
  if (contentEl) contentEl.style.display = 'block';
}

function renderTreeNodes(activeNode, task, isSubtaskView) {
  const container = document.getElementById('log-subtasks-list');
  if (!container) return;
  container.innerHTML = '';

  const actions = getTaskNextActions(task);
  task.nextActions = actions;

  if (actions.length === 0) {
    container.innerHTML = `
      <div style="background:var(--surface);border:1px dashed var(--separator);border-radius:var(--radius-sm);padding:24px 16px;text-align:center;color:var(--text-tertiary);">
        <p style="margin:0 0 8px 0;font-size:0.95rem;font-weight:600;color:var(--text);">No Next Actions yet</p>
        <p style="margin:0 0 16px 0;font-size:0.82rem;">What could you do next to move this Task forward?</p>
        <button type="button" class="save-btn" style="width:auto;margin:0 auto;padding:8px 18px;font-size:0.85rem;" onclick="openAddActionModal('', '${escapeHtml(task.name)}')">+ Add First Next Action</button>
      </div>`;
    return;
  }

  let nextUpFound = false;
  const activeActions = [];
  const completedActions = [];

  actions.forEach((act, idx) => {
    const isDone = act.status === 'Done' || act.done;
    if (isDone) {
      completedActions.push({ act, idx });
    } else {
      activeActions.push({ act, idx });
    }
  });

  // Render Active / Next Up Actions
  activeActions.forEach(({ act, idx }) => {
    const isNextUp = !nextUpFound;
    if (isNextUp) nextUpFound = true;
    const actCard = createActionCardElement(act, idx, actions, task, isNextUp, task);
    container.appendChild(actCard);
  });

  // Render Completed Actions (collapsible)
  if (completedActions.length > 0) {
    const compContainer = document.createElement('div');
    compContainer.style.cssText = 'margin-top:16px;border-top:1px dashed var(--separator);padding-top:12px;';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'completed-toggle-btn';
    toggleBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:0.82rem;font-weight:600;cursor:pointer;padding:4px 0;display:flex;align-items:center;gap:6px;';
    toggleBtn.innerHTML = `▸ Completed Next Actions (${completedActions.length})`;

    const listDiv = document.createElement('div');
    listDiv.style.cssText = 'display:none;margin-top:8px;opacity:0.8;';

    toggleBtn.onclick = () => {
      const isHidden = listDiv.style.display === 'none';
      listDiv.style.display = isHidden ? 'block' : 'none';
      toggleBtn.innerHTML = isHidden ? `▾ Completed Next Actions (${completedActions.length})` : `▸ Completed Next Actions (${completedActions.length})`;
    };

    completedActions.forEach(({ act, idx }) => {
      const compCard = createActionCardElement(act, idx, actions, task, false, task);
      listDiv.appendChild(compCard);
    });

    compContainer.appendChild(toggleBtn);
    compContainer.appendChild(listDiv);
    container.appendChild(compContainer);
  }
}

/**
 * Fallback renderer for other views (e.g. modals)
 */
function renderSubtaskCards() {
  renderActiveDetailView();
}

/**
 * Helper to construct an action card element with sequence ordering, quick complete, and edit support
 */
function createActionCardElement(act, idx, list, parentTask, isNextUp, parentNode) {
  const card = document.createElement('div');
  card.className = `card action-card ${isNextUp ? 'action-card-next-up' : ''}`;
  card.style.cssText = `margin-bottom:8px;padding:12px 14px;background:var(--surface);border:1px solid ${isNextUp ? 'var(--accent)' : 'var(--separator)'};border-radius:var(--radius-xs);cursor:pointer;transition:border-color 0.2s, background 0.2s;`;

  const isDone = act.status === 'Done' || act.done;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';

  // Quick check circle with sequence indicator symbol: ✓ for done, → for next up, ○ for pending
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = `action-check-circle ${isDone ? 'checked' : ''} ${isNextUp ? 'next-up' : ''}`;
  checkBtn.title = isDone ? 'Mark incomplete' : 'Mark complete';
  checkBtn.innerHTML = isDone
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
    : (isNextUp
        ? '<span style="font-size:0.85rem;line-height:1;font-weight:800;color:var(--accent);">→</span>'
        : '<span style="font-size:0.7rem;line-height:1;color:var(--text-tertiary);">○</span>');
  checkBtn.onclick = (e) => {
    e.stopPropagation();
    toggleNodeQuickComplete(act.id || act.name);
  };
  left.appendChild(checkBtn);

  // Sequence number and name
  const textDiv = document.createElement('div');
  textDiv.style.cssText = 'flex:1;min-width:0;';

  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

  const numSpan = document.createElement('span');
  numSpan.style.cssText = 'font-weight:700;color:var(--text-secondary);font-size:0.85rem;';
  numSpan.textContent = `${idx + 1}.`;

  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = `font-size:0.9rem;font-weight:${isNextUp ? '700' : '600'};color:${isDone ? 'var(--text-tertiary)' : (isNextUp ? 'var(--text)' : 'var(--text)')};${isDone ? 'text-decoration:line-through;' : ''}`;
  nameSpan.textContent = act.name;

  nameRow.appendChild(numSpan);
  nameRow.appendChild(nameSpan);

  if (isNextUp && !isDone) {
    const nextUpBadge = document.createElement('span');
    nextUpBadge.className = 'badge-next-up';
    nextUpBadge.style.cssText = 'background:var(--accent);color:#fff;font-size:0.68rem;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:0.02em;';
    nextUpBadge.textContent = 'Next Up';
    nameRow.appendChild(nextUpBadge);
  }

  if (act.priority) {
    const pBadge = document.createElement('span');
    const pLower = act.priority.toLowerCase().replace(/[^a-z]/g, '');
    pBadge.className = `priority-badge priority-${pLower === 'dontdo' ? 'dontdo' : (pLower === 'optional' ? 'optional' : (pLower === 'important' ? 'important' : 'todo'))}`;
    pBadge.style.fontSize = '0.68rem';
    pBadge.textContent = act.priority;
    nameRow.appendChild(pBadge);
  }

  if (act.status && act.status !== 'Done') {
    const sBadge = document.createElement('span');
    sBadge.style.fontSize = '0.68rem';
    if (act.status === 'Partially Done') {
      sBadge.className = 'badge-subtask';
    } else if (act.status === 'Skipped') {
      sBadge.className = 'priority-badge priority-optional';
    }
    sBadge.textContent = act.status;
    nameRow.appendChild(sBadge);
  }

  textDiv.appendChild(nameRow);

  // Meta details (time, place)
  const metaParts = [];
  if (act.time) metaParts.push(formatTimeForDisplay(act.time));
  if (act.place) metaParts.push(act.place);
  if (metaParts.length > 0) {
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'font-size:0.75rem;color:var(--text-tertiary);margin-top:3px;';
    metaRow.textContent = metaParts.join(' • ');
    textDiv.appendChild(metaRow);
  }

  left.appendChild(textDiv);
  row.appendChild(left);

  // Right side: Execute button & Order controls
  const orderControls = document.createElement('div');
  orderControls.style.cssText = 'display:flex;align-items:center;gap:6px;';

  const execBtn = document.createElement('button');
  execBtn.type = 'button';
  execBtn.className = 'save-btn';
  execBtn.style.cssText = `background:${isNextUp ? 'var(--accent)' : 'var(--surface-hover)'};color:${isNextUp ? '#fff' : 'var(--text)'};font-size:0.76rem;font-weight:600;padding:4px 10px;width:auto;margin:0;min-height:30px;white-space:nowrap;border:${isNextUp ? 'none' : '1px solid var(--separator)'};`;
  execBtn.textContent = isDone ? 'View Log' : 'Execute ▸';
  execBtn.onclick = (e) => {
    e.stopPropagation();
    window.location.href = `next-action.html?task=${encodeURIComponent(parentTask.name)}&actionId=${encodeURIComponent(act.id || act.name)}`;
  };
  orderControls.appendChild(execBtn);

  const editActionBtn = document.createElement('button');
  editActionBtn.type = 'button';
  editActionBtn.className = 'btn-order-move';
  editActionBtn.title = 'Edit Action';
  editActionBtn.innerHTML = `${icons.edit || '✎'}`;
  editActionBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:0.8rem;cursor:pointer;padding:2px 4px;';
  editActionBtn.onclick = (e) => {
    e.stopPropagation();
    openEditActionModal(act, parentNode || parentTask);
  };
  orderControls.appendChild(editActionBtn);

  if (idx > 0) {
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'btn-order-move';
    upBtn.title = 'Move Up';
    upBtn.innerHTML = '▲';
    upBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:0.7rem;cursor:pointer;padding:2px 4px;';
    upBtn.onclick = (e) => {
      e.stopPropagation();
      moveActionOrder(act.id || act.name, 'up');
    };
    orderControls.appendChild(upBtn);
  }

  if (idx < list.length - 1) {
    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'btn-order-move';
    downBtn.title = 'Move Down';
    downBtn.innerHTML = '▼';
    downBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:0.7rem;cursor:pointer;padding:2px 4px;';
    downBtn.onclick = (e) => {
      e.stopPropagation();
      moveActionOrder(act.id || act.name, 'down');
    };
    orderControls.appendChild(downBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn-order-move';
  delBtn.title = 'Delete Action';
  delBtn.innerHTML = '✕';
  delBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:0.78rem;cursor:pointer;padding:2px 4px;';
  delBtn.onclick = (e) => {
    e.stopPropagation();
    deleteNextAction(act.id || act.name);
  };
  orderControls.appendChild(delBtn);

  row.appendChild(orderControls);
  card.appendChild(row);

  card.onclick = () => {
    window.location.href = `next-action.html?task=${encodeURIComponent(parentTask.name)}&actionId=${encodeURIComponent(act.id || act.name)}`;
  };
  return card;
}

async function deleteNextAction(actionId) {
  if (!modalState || !modalState.item) return;
  const task = modalState.item;
  const found = findNodeInTaskTree(task, actionId);
  if (!found || !found.list) return;
  if (!confirm(`Delete Next Action "${found.node.name}"?`)) return;
  found.list.splice(found.index, 1);
  await dbPutTask(task);
  await dbAddToSyncQueue('updateItem', {
    action: 'updateItem',
    type: 'Task',
    ...task,
    nextActions: JSON.stringify(task.nextActions || []),
    subtasks: JSON.stringify(task.subtasks || [])
  });
  if (navigator.onLine) syncToSheets();
  renderActiveDetailView();
  showToast('Next Action deleted');
}

/**
 * Fallback renderer for other views (e.g. modals)
 */
function renderSubtaskCards() {
  if (document.getElementById('task-breadcrumbs')) {
    renderActiveDetailView();
    return;
  }

  const subtasksSection = document.getElementById('log-subtasks-section');
  const subtasksList = document.getElementById('log-subtasks-list');
  if (!subtasksSection || !subtasksList) return;

  const type = modalState.type;
  const item = modalState.item;
  if (type !== 'Task' || !item) {
    subtasksSection.style.display = 'none';
    return;
  }

  subtasksSection.style.display = 'block';
  subtasksList.innerHTML = '';
  renderTreeNodes(item, item, false);
}

/**
 * Helper to construct an action card element with sequence ordering, quick complete, and edit support
 */
function createActionCardElement(act, idx, list, parentTask, isNextUp, parentNode) {
  const card = document.createElement('div');
  card.className = `card action-card ${isNextUp ? 'action-card-next-up' : ''}`;
  card.style.cssText = `margin-bottom:8px;padding:12px;background:var(--surface);border:1px solid ${isNextUp ? 'var(--accent)' : 'var(--separator)'};border-radius:var(--radius-xs);cursor:pointer;transition:border-color 0.2s, background 0.2s;`;

  const isDone = act.status === 'Done' || act.done;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';

  // Quick check circle with sequence indicator symbol: ✓ for done, → for next up, ○ for pending
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = `action-check-circle ${isDone ? 'checked' : ''} ${isNextUp ? 'next-up' : ''}`;
  checkBtn.title = isDone ? 'Mark incomplete' : 'Mark complete';
  checkBtn.innerHTML = isDone
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
    : (isNextUp
        ? '<span style="font-size:0.8rem;line-height:1;font-weight:800;color:var(--accent);">→</span>'
        : '<span style="font-size:0.65rem;line-height:1;color:var(--text-tertiary);">○</span>');
  checkBtn.onclick = (e) => {
    e.stopPropagation();
    toggleNodeQuickComplete(act.id || act.name);
  };
  left.appendChild(checkBtn);

  // Sequence number and name
  const textDiv = document.createElement('div');
  textDiv.style.cssText = 'flex:1;min-width:0;';

  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

  const numSpan = document.createElement('span');
  numSpan.style.cssText = 'font-weight:700;color:var(--text-secondary);font-size:0.85rem;';
  numSpan.textContent = `${idx + 1}.`;

  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = `font-size:0.88rem;font-weight:600;color:${isDone ? 'var(--text-tertiary)' : 'var(--text)'};${isDone ? 'text-decoration:line-through;' : ''}`;
  nameSpan.textContent = act.name;

  nameRow.appendChild(numSpan);
  nameRow.appendChild(nameSpan);

  if (isNextUp) {
    const nextUpBadge = document.createElement('span');
    nextUpBadge.className = 'badge-next-up';
    nextUpBadge.style.cssText = 'background:var(--accent);color:#fff;font-size:0.68rem;font-weight:700;padding:1px 6px;border-radius:4px;letter-spacing:0.02em;';
    nextUpBadge.textContent = 'Next Up';
    nameRow.appendChild(nextUpBadge);
  }

  if (act.priority) {
    const pBadge = document.createElement('span');
    const pLower = act.priority.toLowerCase().replace(/[^a-z]/g, '');
    pBadge.className = `priority-badge priority-${pLower === 'dontdo' ? 'dontdo' : (pLower === 'optional' ? 'optional' : (pLower === 'important' ? 'important' : 'todo'))}`;
    pBadge.style.fontSize = '0.68rem';
    pBadge.textContent = act.priority;
    nameRow.appendChild(pBadge);
  }

  if (act.status && act.status !== 'Done') {
    const sBadge = document.createElement('span');
    sBadge.style.fontSize = '0.68rem';
    if (act.status === 'Partially Done') {
      sBadge.className = 'badge-subtask';
    } else if (act.status === 'Skipped') {
      sBadge.className = 'priority-badge priority-optional';
    }
    sBadge.textContent = act.status;
    nameRow.appendChild(sBadge);
  }

  textDiv.appendChild(nameRow);

  // Meta details (time, place)
  const metaParts = [];
  if (act.time) metaParts.push(formatTimeForDisplay(act.time));
  if (act.place) metaParts.push(act.place);
  if (metaParts.length > 0) {
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'font-size:0.75rem;color:var(--text-tertiary);margin-top:3px;';
    metaRow.textContent = metaParts.join(' • ');
    textDiv.appendChild(metaRow);
  }

  left.appendChild(textDiv);
  row.appendChild(left);

  // Right side: Edit, Move Up / Down
  const orderControls = document.createElement('div');
  orderControls.style.cssText = 'display:flex;align-items:center;gap:4px;';

  const editActionBtn = document.createElement('button');
  editActionBtn.type = 'button';
  editActionBtn.className = 'btn-order-move';
  editActionBtn.title = 'Edit Action';
  editActionBtn.innerHTML = `${icons.edit || '✎'}`;
  editActionBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:0.8rem;cursor:pointer;padding:2px 5px;';
  editActionBtn.onclick = (e) => {
    e.stopPropagation();
    openEditActionModal(act, parentNode || parentTask);
  };
  orderControls.appendChild(editActionBtn);

  if (idx > 0) {
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'btn-order-move';
    upBtn.title = 'Move Up';
    upBtn.innerHTML = '▲';
    upBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:0.7rem;cursor:pointer;padding:2px 4px;';
    upBtn.onclick = (e) => {
      e.stopPropagation();
      moveActionOrder(act.id || act.name, 'up');
    };
    orderControls.appendChild(upBtn);
  }

  if (idx < list.length - 1) {
    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'btn-order-move';
    downBtn.title = 'Move Down';
    downBtn.innerHTML = '▼';
    downBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:0.7rem;cursor:pointer;padding:2px 4px;';
    downBtn.onclick = (e) => {
      e.stopPropagation();
      moveActionOrder(act.id || act.name, 'down');
    };
    orderControls.appendChild(downBtn);
  }

  row.appendChild(orderControls);
  card.appendChild(row);

  card.onclick = () => openSubtaskModal(act, parentNode || parentTask);
  return card;
}

/**
 * Helper to construct a subtask element with collapsible branches, drill-down link, actions, and child subtasks
 */
function createSubtaskTreeElement(sub, idx, list, parentTask, hiddenCompletedItems, depth = 0, parentChain = [], parentNode = null) {
  const wrapper = document.createElement('div');
  wrapper.className = 'subtask-tree-node';
  wrapper.style.cssText = 'margin-bottom:12px;';

  const isDone = sub.status === 'Done' || sub.done;
  const childActions = getItemNextActions(sub);
  const childSubs = getTaskSubtasks(sub);
  const subProg = calculateTaskProgress(sub);
  const hasChildren = childActions.length > 0 || childSubs.length > 0;
  const isCollapsed = _collapsedSubtasks.has(sub.id);

  const card = document.createElement('div');
  card.className = 'card tree-subtask-card';
  card.style.cssText = 'padding:14px;background:var(--surface);border:1px solid var(--separator);border-radius:var(--radius-xs);cursor:pointer;';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';

  // Collapsible branch chevron button (if children exist)
  if (hasChildren) {
    const chevronBtn = document.createElement('button');
    chevronBtn.type = 'button';
    chevronBtn.className = 'tree-chevron-btn';
    chevronBtn.setAttribute('aria-label', isCollapsed ? 'Expand branch' : 'Collapse branch');
    chevronBtn.innerHTML = isCollapsed ? '▸' : '▾';
    chevronBtn.title = isCollapsed ? 'Expand branch' : 'Collapse branch';
    chevronBtn.onclick = (e) => {
      e.stopPropagation();
      if (_collapsedSubtasks.has(sub.id)) {
        _collapsedSubtasks.delete(sub.id);
      } else {
        _collapsedSubtasks.add(sub.id);
      }
      if (typeof renderActiveDetailView === 'function') {
        renderActiveDetailView();
      } else {
        renderSubtaskCards();
      }
    };
    left.appendChild(chevronBtn);
  }

  // Quick check circle
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = `action-check-circle ${isDone ? 'checked' : ''}`;
  checkBtn.innerHTML = isDone
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
    : '';
  checkBtn.title = isDone ? 'Mark incomplete' : 'Mark complete';
  checkBtn.onclick = (e) => {
    e.stopPropagation();
    toggleNodeQuickComplete(sub.id || sub.name);
  };
  left.appendChild(checkBtn);

  const textDiv = document.createElement('div');
  textDiv.style.cssText = 'flex:1;min-width:0;';

  // Breadcrumb for nested subtasks
  if (parentChain.length > 0) {
    const bcSpan = document.createElement('div');
    bcSpan.style.cssText = 'font-size:0.7rem;color:var(--accent);font-weight:600;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    bcSpan.textContent = parentChain.join(' › ');
    textDiv.appendChild(bcSpan);
  }

  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = `font-size:0.92rem;font-weight:600;color:${isDone ? 'var(--text-tertiary)' : 'var(--text)'};${isDone ? 'text-decoration:line-through;' : ''}`;
  nameSpan.textContent = sub.name;
  nameRow.appendChild(nameSpan);

  // Drill-down indicator icon
  const drillIcon = document.createElement('span');
  drillIcon.style.cssText = 'font-size:0.75rem;color:var(--text-tertiary);margin-left:2px;';
  drillIcon.innerHTML = '›';
  nameRow.appendChild(drillIcon);

  if (sub.priority) {
    const pBadge = document.createElement('span');
    const pLower = sub.priority.toLowerCase().replace(/[^a-z]/g, '');
    pBadge.className = `priority-badge priority-${pLower === 'dontdo' ? 'dontdo' : (pLower === 'optional' ? 'optional' : (pLower === 'important' ? 'important' : 'todo'))}`;
    pBadge.style.fontSize = '0.68rem';
    pBadge.textContent = sub.priority;
    nameRow.appendChild(pBadge);
  }

  if (sub.status) {
    const badge = document.createElement('span');
    badge.textContent = sub.status;
    badge.style.fontSize = '0.68rem';
    if (sub.status === 'Done') badge.className = 'badge-growth';
    else if (sub.status === 'Partially Done') badge.className = 'badge-subtask';
    else if (sub.status === 'Skipped') badge.className = 'priority-badge priority-optional';
    nameRow.appendChild(badge);
  }

  textDiv.appendChild(nameRow);

  // Meta details (dates, place, reminder)
  const parts = [];
  if (sub.startDate) parts.push(`Start: ${sub.startDate}`);
  if (sub.completeDate) parts.push(`Due: ${sub.completeDate}`);
  if (sub.place) parts.push(`Place: ${sub.place}`);
  if (sub.remind && sub.reminderTime) parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;">${icons.bell} ${formatTimeForDisplay(sub.reminderTime)}</span>`);

  if (parts.length > 0) {
    const metaRow = document.createElement('div');
    metaRow.className = 'card-meta';
    metaRow.style.cssText = 'margin-top:4px;font-size:0.75rem;';
    metaRow.innerHTML = parts.join(' • ');
    textDiv.appendChild(metaRow);
  }

  // Branch progress bar if subtask has children
  if (subProg !== null) {
    const pBar = document.createElement('div');
    pBar.style.cssText = 'margin-top:8px;';
    pBar.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-tertiary);margin-bottom:3px;">
        <span>Branch progress</span>
        <span>${subProg.pct}%</span>
      </div>
      <div style="height:4px;background:var(--surface-hover);border-radius:2px;overflow:hidden;">
        <div style="width:${subProg.pct}%;height:100%;background:var(--accent);"></div>
      </div>
    `;
    textDiv.appendChild(pBar);
  }

  left.appendChild(textDiv);
  titleRow.appendChild(left);

  // Action buttons on subtask: [ + Action ] [ + Subtask ] [ Edit ] [ Log ]
  const actionsRow = document.createElement('div');
  actionsRow.style.cssText = 'display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var(--separator);justify-content:flex-end;flex-wrap:wrap;';

  const addActionBtn = document.createElement('button');
  addActionBtn.type = 'button';
  addActionBtn.className = 'btn-subtask-action';
  addActionBtn.style.cssText = 'background:none;border:1px solid var(--separator);border-radius:var(--radius-xs);color:var(--accent);font-size:0.75rem;font-weight:600;padding:4px 10px;cursor:pointer;';
  addActionBtn.textContent = '+ Action';
  addActionBtn.onclick = (e) => {
    e.stopPropagation();
    openAddActionModal(sub.id || sub.name, sub.name);
  };

  const addSubBtn = document.createElement('button');
  addSubBtn.type = 'button';
  addSubBtn.className = 'btn-subtask-action';
  addSubBtn.style.cssText = 'background:none;border:1px solid var(--separator);border-radius:var(--radius-xs);color:var(--text-secondary);font-size:0.75rem;font-weight:600;padding:4px 10px;cursor:pointer;';
  addSubBtn.textContent = '+ Subtask';
  addSubBtn.onclick = (e) => {
    e.stopPropagation();
    openAddSubtaskModal(sub.id || sub.name, sub.name);
  };

  const editSubBtn = document.createElement('button');
  editSubBtn.type = 'button';
  editSubBtn.className = 'btn-subtask-action';
  editSubBtn.style.cssText = 'background:none;border:1px solid var(--separator);border-radius:var(--radius-xs);color:var(--text-secondary);font-size:0.75rem;font-weight:600;padding:4px 10px;cursor:pointer;';
  editSubBtn.textContent = 'Edit';
  editSubBtn.onclick = (e) => {
    e.stopPropagation();
    openEditSubtaskModal(sub, parentNode || parentTask);
  };

  const logBtn = document.createElement('button');
  logBtn.type = 'button';
  logBtn.className = 'btn-subtask-action';
  logBtn.style.cssText = 'background:none;border:1px solid var(--separator);border-radius:var(--radius-xs);color:var(--text);font-size:0.75rem;font-weight:600;padding:4px 10px;cursor:pointer;';
  logBtn.textContent = 'Log';
  logBtn.onclick = (e) => {
    e.stopPropagation();
    openSubtaskModal(sub, parentNode || parentTask);
  };

  actionsRow.appendChild(addActionBtn);
  actionsRow.appendChild(addSubBtn);
  actionsRow.appendChild(editSubBtn);
  actionsRow.appendChild(logBtn);

  card.appendChild(titleRow);
  card.appendChild(actionsRow);

  // Clicking the subtask card drills down into its dedicated view
  card.onclick = () => {
    if (document.getElementById('task-breadcrumbs')) {
      navigateToSubtask(sub.id);
    } else {
      openSubtaskModal(sub, parentNode || parentTask);
    }
  };

  wrapper.appendChild(card);

  // Progressive Disclosure: Render children container if not collapsed
  const indentPx = depth >= 2 ? '10px' : '18px';
  const childrenContainer = document.createElement('div');
  childrenContainer.className = 'subtask-tree-connector';
  childrenContainer.style.cssText = `margin-left:${indentPx};padding-left:12px;border-left:2px solid var(--separator);margin-top:8px;${isCollapsed ? 'display:none;' : ''}`;

  // Render child next actions
  if (childActions.length > 0) {
    let childNextUpFound = false;
    childActions.forEach((cAct, cIdx) => {
      const isCActDone = cAct.status === 'Done' || cAct.done;
      if (isCActDone && cAct.removeAfterCompletion !== false) {
        hiddenCompletedItems.push({ item: cAct, parent: sub, list: childActions, index: cIdx });
        return;
      }
      const isCNextUp = !isCActDone && !childNextUpFound;
      if (isCNextUp) childNextUpFound = true;

      const actEl = createActionCardElement(cAct, cIdx, childActions, parentTask, isCNextUp, sub);
      childrenContainer.appendChild(actEl);
    });
  }

  // Render child subtasks
  if (childSubs.length > 0) {
    childSubs.forEach((cSub, cIdx) => {
      const isCSubDone = cSub.status === 'Done' || cSub.done;
      if (isCSubDone && cSub.removeAfterCompletion !== false) {
        hiddenCompletedItems.push({ item: cSub, parent: sub, list: childSubs, index: cIdx });
        return;
      }
      const childTreeEl = createSubtaskTreeElement(cSub, cIdx, childSubs, parentTask, hiddenCompletedItems, depth + 1, [...parentChain, sub.name], sub);
      childrenContainer.appendChild(childTreeEl);
    });
  }

  if (hasChildren) {
    wrapper.appendChild(childrenContainer);
  }

  return wrapper;
}

/** Quick complete checkmark toggle for actions and subtasks */
async function toggleNodeQuickComplete(nodeId) {
  if (!modalState || !modalState.item) return;
  const task = modalState.item;
  const found = findNodeInTaskTree(task, nodeId);
  if (!found || !found.node) return;

  const node = found.node;
  const wasDone = node.done || node.status === 'Done';
  node.done = !wasDone;
  node.status = node.done ? 'Done' : '';
  if (node.done && !node.completeDate) {
    node.completeDate = new Date().toLocaleDateString('en-CA');
  }

  if (node.done) {
    const now = new Date();
    const logDate = now.toLocaleDateString('en-CA');
    const logTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const logEntry = {
      date: logDate,
      time: logTime,
      type: node.type === 'action' ? 'NextAction' : 'Subtask',
      name: node.name,
      status: 'Done',
      reason: '',
      notes: '',
      loggedAt: now.toISOString(),
      activityDate: logDate,
      activityStartTime: logTime,
      previousActivity: '',
      alternativeActivity: '',
      interruption: '',
      duration: '',
      place: node.place || '',
      priority: node.priority || task.priority || '',
      completedWork: node.name,
      outcome: 'Quick completed',
      problemsFaced: '',
      remainingWork: '',
      objective: task.objective || '',
      subtaskName: node.name,
      parentTaskName: task.name
    };
    await dbAddLog(logEntry);
    await dbAddToSyncQueue('saveLog', { action: 'saveLog', ...logEntry });
    invalidateSuggestionCache();
    if (typeof clearReflectionCache === 'function') clearReflectionCache();
  }

  await dbPutTask(task);
  await dbAddToSyncQueue('updateItem', {
    action: 'updateItem',
    type: 'Task',
    ...task,
    subtasks: JSON.stringify(task.subtasks || []),
    nextActions: JSON.stringify(task.nextActions || [])
  });
  if (navigator.onLine) syncToSheets();

  if (typeof renderActiveDetailView === 'function' && document.getElementById('task-breadcrumbs')) {
    renderActiveDetailView();
  } else {
    renderSubtaskCards();
    renderTaskDetailsMeta(task);
  }
  showToast(node.done ? `Completed: ${node.name}` : `Reopened: ${node.name}`);
}

/** Move next action sequence up or down */
async function moveActionOrder(actionId, direction) {
  if (!modalState || !modalState.item) return;
  const task = modalState.item;
  const found = findNodeInTaskTree(task, actionId);
  if (!found || !found.list) return;

  const list = found.list;
  const idx = found.index;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= list.length) return;

  const temp = list[idx];
  list[idx] = list[targetIdx];
  list[targetIdx] = temp;

  await dbPutTask(task);
  await dbAddToSyncQueue('updateItem', {
    action: 'updateItem',
    type: 'Task',
    ...task,
    subtasks: JSON.stringify(task.subtasks || []),
    nextActions: JSON.stringify(task.nextActions || [])
  });
  if (navigator.onLine) syncToSheets();

  if (typeof renderActiveDetailView === 'function' && document.getElementById('task-breadcrumbs')) {
    renderActiveDetailView();
  } else {
    renderSubtaskCards();
  }
}

function openAddSubtaskModal(parentId = '', parentLabel = '') {
  _editingSubtask = null;
  const overlay = document.getElementById('add-subtask-overlay');
  if (overlay) {
    const modalTitle = document.getElementById('add-subtask-modal-title');
    if (modalTitle) modalTitle.textContent = 'Create Subtask';

    const addBtn = document.getElementById('add-subtask-btn');
    if (addBtn) addBtn.textContent = '+ Create Subtask';

    const pIdInput = document.getElementById('new-subtask-parent-id');
    const pLabel = document.getElementById('new-subtask-parent-label');
    if (pIdInput) pIdInput.value = parentId || '';
    if (pLabel) {
      pLabel.textContent = parentLabel ? `Child of: ${parentLabel}` : 'Top-level Subtask';
      pLabel.style.display = parentLabel ? 'block' : 'none';
    }

    const nameInput = document.getElementById('new-subtask-name');
    const prioritySelect = document.getElementById('new-subtask-priority');
    const startInput = document.getElementById('new-subtask-start');
    const compInput = document.getElementById('new-subtask-complete');
    const timeInput = document.getElementById('new-subtask-time');
    const placeInput = document.getElementById('new-subtask-place');
    const initActionInput = document.getElementById('new-subtask-initial-action');
    const remindCheckbox = document.getElementById('new-subtask-remind');
    const reminderTimeInput = document.getElementById('new-subtask-reminder-time');
    const removeAfterInput = document.getElementById('new-subtask-remove-after-completion');

    if (nameInput) nameInput.value = '';
    if (prioritySelect) prioritySelect.value = '';
    if (startInput) startInput.value = '';
    if (compInput) compInput.value = '';
    if (timeInput) timeInput.value = '';
    if (placeInput) placeInput.value = '';
    if (initActionInput) {
      initActionInput.value = '';
      initActionInput.style.display = '';
      const initLabel = initActionInput.previousElementSibling;
      if (initLabel && initLabel.classList.contains('reason-label')) initLabel.style.display = '';
    }
    if (remindCheckbox) remindCheckbox.checked = false;
    if (reminderTimeInput) reminderTimeInput.value = '';
    if (removeAfterInput) removeAfterInput.checked = true;

    // Reset priority chips
    const pChips = document.querySelectorAll('#new-subtask-priority-chips .priority-chip');
    pChips.forEach(c => {
      c.classList.remove('active');
      c.onclick = () => {
        const wasActive = c.classList.contains('active');
        pChips.forEach(x => x.classList.remove('active'));
        if (!wasActive) {
          c.classList.add('active');
          if (prioritySelect) prioritySelect.value = c.dataset.value;
        } else {
          if (prioritySelect) prioritySelect.value = '';
        }
      };
    });

    // Load place suggestions
    loadSuggestionsForField('place', null, null).then(placeSugg => {
      const defaultPlaces = ['Home', 'Office', 'College', 'Outside', 'Desk'];
      const finalPlaces = [...new Set([...placeSugg, ...defaultPlaces])].slice(0, 6);
      renderSuggestionChips('suggest-new-subtask-place', 'new-subtask-place', finalPlaces);
    });

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
  }
}

function openEditSubtaskModal(sub, parent) {
  _editingSubtask = sub;
  const overlay = document.getElementById('add-subtask-overlay');
  if (!overlay) return;

  const modalTitle = document.getElementById('add-subtask-modal-title');
  if (modalTitle) modalTitle.textContent = 'Edit Subtask';

  const addBtn = document.getElementById('add-subtask-btn');
  if (addBtn) addBtn.textContent = 'Save Changes';

  const pIdInput = document.getElementById('new-subtask-parent-id');
  const pLabel = document.getElementById('new-subtask-parent-label');
  if (pIdInput) pIdInput.value = (parent && parent.id) ? parent.id : '';
  if (pLabel) {
    pLabel.textContent = parent ? `Under: ${parent.name}` : '';
    pLabel.style.display = parent ? 'block' : 'none';
  }

  const nameInput = document.getElementById('new-subtask-name');
  const prioritySelect = document.getElementById('new-subtask-priority');
  const startInput = document.getElementById('new-subtask-start');
  const compInput = document.getElementById('new-subtask-complete');
  const timeInput = document.getElementById('new-subtask-time');
  const placeInput = document.getElementById('new-subtask-place');
  const initActionInput = document.getElementById('new-subtask-initial-action');
  const remindCheckbox = document.getElementById('new-subtask-remind');
  const reminderTimeInput = document.getElementById('new-subtask-reminder-time');
  const removeAfterInput = document.getElementById('new-subtask-remove-after-completion');

  if (nameInput) nameInput.value = sub.name || '';
  if (prioritySelect) prioritySelect.value = sub.priority || '';
  if (startInput) startInput.value = sub.startDate || '';
  if (compInput) compInput.value = sub.completeDate || '';
  if (timeInput) timeInput.value = sub.time || '';
  if (placeInput) placeInput.value = sub.place || '';
  if (initActionInput) {
    initActionInput.value = '';
    initActionInput.style.display = 'none';
    const initLabel = initActionInput.previousElementSibling;
    if (initLabel && initLabel.classList.contains('reason-label')) initLabel.style.display = 'none';
  }
  if (remindCheckbox) remindCheckbox.checked = !!sub.remind;
  if (reminderTimeInput) reminderTimeInput.value = sub.reminderTime || '';
  if (removeAfterInput) removeAfterInput.checked = sub.removeAfterCompletion !== false;

  // Set active priority chip
  const pChips = document.querySelectorAll('#new-subtask-priority-chips .priority-chip');
  pChips.forEach(c => {
    c.classList.toggle('active', c.dataset.value === (sub.priority || ''));
    c.onclick = () => {
      const wasActive = c.classList.contains('active');
      pChips.forEach(x => x.classList.remove('active'));
      if (!wasActive) {
        c.classList.add('active');
        if (prioritySelect) prioritySelect.value = c.dataset.value;
      } else {
        if (prioritySelect) prioritySelect.value = '';
      }
    };
  });

  loadSuggestionsForField('place', null, null).then(placeSugg => {
    const defaultPlaces = ['Home', 'Office', 'College', 'Outside', 'Desk'];
    const finalPlaces = [...new Set([...placeSugg, ...defaultPlaces])].slice(0, 6);
    renderSuggestionChips('suggest-new-subtask-place', 'new-subtask-place', finalPlaces);
  });

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

function closeAddSubtaskModal() {
  _editingSubtask = null;
  const overlay = document.getElementById('add-subtask-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  document.body.style.overflow = '';
}

function initSubtaskAddButton() {
  const overlay = document.getElementById('add-subtask-overlay');
  if (overlay) {
    const closeBtn = document.getElementById('add-subtask-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeAddSubtaskModal);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAddSubtaskModal();
    });
  }

  const addBtn = document.getElementById('add-subtask-btn');
  if (!addBtn) return;
  addBtn.onclick = async () => {
    const nameInput = document.getElementById('new-subtask-name');
    const prioritySelect = document.getElementById('new-subtask-priority');
    const placeInput = document.getElementById('new-subtask-place');
    const startInput = document.getElementById('new-subtask-start');
    const compInput = document.getElementById('new-subtask-complete');
    const timeInput = document.getElementById('new-subtask-time');
    const initActionInput = document.getElementById('new-subtask-initial-action');
    const reminderTimeInput = document.getElementById('new-subtask-reminder-time');
    const remindCheckbox = document.getElementById('new-subtask-remind');
    const removeAfterInput = document.getElementById('new-subtask-remove-after-completion');
    const parentIdInput = document.getElementById('new-subtask-parent-id');

    const name = nameInput ? nameInput.value.trim() : '';
    const priority = prioritySelect ? prioritySelect.value : '';
    const place = placeInput ? placeInput.value.trim() : '';
    const startDate = startInput ? startInput.value : '';
    const completeDate = compInput ? compInput.value : '';
    const time = timeInput ? timeInput.value : '';
    const initActionName = initActionInput ? initActionInput.value.trim() : '';
    const reminderTime = reminderTimeInput ? reminderTimeInput.value : '';
    const remind = remindCheckbox ? remindCheckbox.checked : false;
    const removeAfterCompletion = removeAfterInput ? removeAfterInput.checked : true;
    const parentId = parentIdInput ? parentIdInput.value : '';

    if (!modalState || !modalState.item || modalState.type !== 'Task') return;
    const item = modalState.item;

    if (_editingSubtask) {
      // Edit existing subtask
      _editingSubtask.name = name || _editingSubtask.name;
      _editingSubtask.priority = priority;
      _editingSubtask.place = place;
      _editingSubtask.startDate = startDate;
      _editingSubtask.completeDate = completeDate;
      _editingSubtask.time = time;
      _editingSubtask.reminderTime = reminderTime;
      _editingSubtask.remind = remind;
      _editingSubtask.removeAfterCompletion = removeAfterCompletion;

      await dbPutTask(item);
      if (remind && reminderTime && typeof scheduleNotificationViaSW === 'function') {
        scheduleNotificationViaSW(`${item.name}: ${_editingSubtask.name}`, reminderTime, 'Task');
      }
      await dbAddToSyncQueue('updateItem', {
        action: 'updateItem',
        type: 'Task',
        ...item,
        subtasks: JSON.stringify(item.subtasks || []),
        nextActions: JSON.stringify(item.nextActions || [])
      });
      if (navigator.onLine) syncToSheets();

      _editingSubtask = null;
      closeAddSubtaskModal();
      if (typeof renderActiveDetailView === 'function' && document.getElementById('task-breadcrumbs')) {
        renderActiveDetailView();
      } else {
        renderSubtaskCards();
        renderTaskDetailsMeta(item);
      }
      const taskContainer = document.getElementById('tasks-container');
      if (taskContainer && typeof renderList === 'function') {
        const tasks = await dbGetAllTasks();
        renderList(tasks, 'Task', 'list');
      }
      showToast('Subtask updated');
      return;
    }

    const taskSubtasks = getTaskSubtasks(item);
    const subName = name || `Subtask ${taskSubtasks.length + 1}`;

    const newSub = {
      id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: subName,
      type: 'subtask',
      priority: priority,
      startDate: startDate,
      completeDate: completeDate,
      time: time,
      place: place,
      reminderTime: reminderTime,
      remind: remind,
      removeAfterCompletion: removeAfterCompletion,
      done: false,
      status: '',
      subtasks: [],
      nextActions: []
    };

    if (initActionName) {
      newSub.nextActions.push({
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        name: initActionName,
        type: 'action',
        priority: priority,
        time: time,
        place: place,
        removeAfterCompletion: removeAfterCompletion,
        done: false,
        status: ''
      });
    }

    if (parentId) {
      const found = findNodeInTaskTree(item, parentId);
      if (found && found.node) {
        found.node.subtasks = found.node.subtasks || [];
        found.node.subtasks.push(newSub);
      } else {
        item.subtasks = item.subtasks || [];
        item.subtasks.push(newSub);
      }
    } else {
      item.subtasks = item.subtasks || [];
      item.subtasks.push(newSub);
    }

    await dbPutTask(item);

    if (remind && reminderTime && typeof scheduleNotificationViaSW === 'function') {
      scheduleNotificationViaSW(`${item.name}: ${subName}`, reminderTime, 'Task');
    }

    await dbAddToSyncQueue('updateItem', {
      action: 'updateItem',
      type: 'Task',
      ...item,
      subtasks: JSON.stringify(item.subtasks || []),
      nextActions: JSON.stringify(item.nextActions || [])
    });

    if (navigator.onLine) syncToSheets();

    closeAddSubtaskModal();
    if (typeof renderActiveDetailView === 'function' && document.getElementById('task-breadcrumbs')) {
      renderActiveDetailView();
    } else {
      renderSubtaskCards();
      renderTaskDetailsMeta(item);
    }
    const taskContainer = document.getElementById('tasks-container');
    if (taskContainer && typeof renderList === 'function') {
      const tasks = await dbGetAllTasks();
      renderList(tasks, 'Task', 'list');
    }
    showToast('Subtask created');
  };
}

function openAddActionModal(parentId = '', parentLabel = '') {
  _editingAction = null;
  const overlay = document.getElementById('add-action-overlay');
  if (!overlay) return;

  const modalTitle = document.getElementById('add-action-modal-title');
  if (modalTitle) modalTitle.textContent = 'Create Next Action';

  const addBtn = document.getElementById('add-action-btn');
  if (addBtn) addBtn.textContent = '+ Create Next Action';

  const pIdInput = document.getElementById('new-action-parent-id');
  const pLabel = document.getElementById('new-action-parent-label');
  if (pIdInput) pIdInput.value = parentId || '';
  if (pLabel) pLabel.textContent = parentLabel ? `Under: ${parentLabel}` : 'Under: Main Task';

  const nameInput = document.getElementById('new-action-name');
  const prioritySelect = document.getElementById('new-action-priority');
  const timeInput = document.getElementById('new-action-time');
  const placeInput = document.getElementById('new-action-place');
  const removeAfterInput = document.getElementById('new-action-remove-after-completion');

  if (nameInput) nameInput.value = '';
  if (prioritySelect) prioritySelect.value = '';
  if (timeInput) timeInput.value = '';
  if (placeInput) placeInput.value = '';
  if (removeAfterInput) removeAfterInput.checked = true;

  const pChips = document.querySelectorAll('#new-action-priority-chips .priority-chip');
  pChips.forEach(c => {
    c.classList.remove('active');
    c.onclick = () => {
      const wasActive = c.classList.contains('active');
      pChips.forEach(x => x.classList.remove('active'));
      if (!wasActive) {
        c.classList.add('active');
        if (prioritySelect) prioritySelect.value = c.dataset.value;
      } else {
        if (prioritySelect) prioritySelect.value = '';
      }
    };
  });

  loadSuggestionsForField('place', null, null).then(placeSugg => {
    const defaultPlaces = ['Home', 'Office', 'College', 'Outside', 'Desk'];
    const finalPlaces = [...new Set([...placeSugg, ...defaultPlaces])].slice(0, 6);
    renderSuggestionChips('suggest-new-action-place', 'new-action-place', finalPlaces);
  });

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

function openEditActionModal(act, parent) {
  _editingAction = act;
  const overlay = document.getElementById('add-action-overlay');
  if (!overlay) return;

  const modalTitle = document.getElementById('add-action-modal-title');
  if (modalTitle) modalTitle.textContent = 'Edit Next Action';

  const addBtn = document.getElementById('add-action-btn');
  if (addBtn) addBtn.textContent = 'Save Changes';

  const pIdInput = document.getElementById('new-action-parent-id');
  const pLabel = document.getElementById('new-action-parent-label');
  if (pIdInput) pIdInput.value = (parent && parent.id) ? parent.id : '';
  if (pLabel) pLabel.textContent = parent ? `Under: ${parent.name}` : 'Under: Main Task';

  const nameInput = document.getElementById('new-action-name');
  const prioritySelect = document.getElementById('new-action-priority');
  const timeInput = document.getElementById('new-action-time');
  const placeInput = document.getElementById('new-action-place');
  const removeAfterInput = document.getElementById('new-action-remove-after-completion');

  if (nameInput) nameInput.value = act.name || '';
  if (prioritySelect) prioritySelect.value = act.priority || '';
  if (timeInput) timeInput.value = act.time || '';
  if (placeInput) placeInput.value = act.place || '';
  if (removeAfterInput) removeAfterInput.checked = act.removeAfterCompletion !== false;

  const pChips = document.querySelectorAll('#new-action-priority-chips .priority-chip');
  pChips.forEach(c => {
    c.classList.toggle('active', c.dataset.value === (act.priority || ''));
    c.onclick = () => {
      const wasActive = c.classList.contains('active');
      pChips.forEach(x => x.classList.remove('active'));
      if (!wasActive) {
        c.classList.add('active');
        if (prioritySelect) prioritySelect.value = c.dataset.value;
      } else {
        if (prioritySelect) prioritySelect.value = '';
      }
    };
  });

  loadSuggestionsForField('place', null, null).then(placeSugg => {
    const defaultPlaces = ['Home', 'Office', 'College', 'Outside', 'Desk'];
    const finalPlaces = [...new Set([...placeSugg, ...defaultPlaces])].slice(0, 6);
    renderSuggestionChips('suggest-new-action-place', 'new-action-place', finalPlaces);
  });

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

function closeAddActionModal() {
  _editingAction = null;
  const overlay = document.getElementById('add-action-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  document.body.style.overflow = '';
}

function initActionAddButton() {
  const overlay = document.getElementById('add-action-overlay');
  if (overlay) {
    const closeBtn = document.getElementById('add-action-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeAddActionModal);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAddActionModal();
    });
  }

  const addBtn = document.getElementById('add-action-btn');
  if (!addBtn) return;
  addBtn.onclick = async () => {
    const nameInput = document.getElementById('new-action-name');
    const prioritySelect = document.getElementById('new-action-priority');
    const timeInput = document.getElementById('new-action-time');
    const placeInput = document.getElementById('new-action-place');
    const removeAfterInput = document.getElementById('new-action-remove-after-completion');
    const parentIdInput = document.getElementById('new-action-parent-id');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      showToast('Please enter an action name');
      return;
    }

    const priority = prioritySelect ? prioritySelect.value : '';
    const time = timeInput ? timeInput.value : '';
    const place = placeInput ? placeInput.value.trim() : '';
    const removeAfterCompletion = removeAfterInput ? removeAfterInput.checked : true;
    const parentId = parentIdInput ? parentIdInput.value : '';

    if (!modalState || !modalState.item || modalState.type !== 'Task') return;
    const item = modalState.item;

    if (_editingAction) {
      _editingAction.name = name;
      _editingAction.priority = priority;
      _editingAction.time = time;
      _editingAction.place = place;
      _editingAction.removeAfterCompletion = removeAfterCompletion;

      await dbPutTask(item);
      await dbAddToSyncQueue('updateItem', {
        action: 'updateItem',
        type: 'Task',
        ...item,
        subtasks: JSON.stringify(item.subtasks || []),
        nextActions: JSON.stringify(item.nextActions || [])
      });
      if (navigator.onLine) syncToSheets();

      _editingAction = null;
      closeAddActionModal();
      if (typeof renderActiveDetailView === 'function' && document.getElementById('task-breadcrumbs')) {
        renderActiveDetailView();
      } else {
        renderSubtaskCards();
        renderTaskDetailsMeta(item);
      }
      const taskContainer = document.getElementById('tasks-container');
      if (taskContainer && typeof renderList === 'function') {
        const tasks = await dbGetAllTasks();
        renderList(tasks, 'Task', 'list');
      }
      showToast('Next Action updated');
      return;
    }

    const newAction = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name,
      type: 'action',
      priority: priority,
      time: time,
      place: place,
      removeAfterCompletion: removeAfterCompletion,
      done: false,
      status: ''
    };

    if (parentId) {
      const found = findNodeInTaskTree(item, parentId);
      if (found && found.node) {
        found.node.nextActions = found.node.nextActions || [];
        found.node.nextActions.push(newAction);
      } else {
        item.nextActions = item.nextActions || [];
        item.nextActions.push(newAction);
      }
    } else {
      item.nextActions = item.nextActions || [];
      item.nextActions.push(newAction);
    }

    await dbPutTask(item);
    await dbAddToSyncQueue('updateItem', {
      action: 'updateItem',
      type: 'Task',
      ...item,
      subtasks: JSON.stringify(item.subtasks || []),
      nextActions: JSON.stringify(item.nextActions || [])
    });

    if (navigator.onLine) syncToSheets();

    closeAddActionModal();
    if (typeof renderActiveDetailView === 'function' && document.getElementById('task-breadcrumbs')) {
      renderActiveDetailView();
    } else {
      renderSubtaskCards();
      renderTaskDetailsMeta(item);
    }
    const taskContainer = document.getElementById('tasks-container');
    if (taskContainer && typeof renderList === 'function') {
      const tasks = await dbGetAllTasks();
      renderList(tasks, 'Task', 'list');
    }
    showToast('Next Action created');
  };
}

// ============================================================
// Smart Suggestions — Past Entry Autocomplete
// ============================================================

/**
 * Load suggestions for a specific field from past logs.
 * Returns deduplicated, frequency-sorted string array (max 8).
 * @param {string} field — log field name (e.g. 'previousActivity', 'alternativeActivity')
 * @param {string|null} itemName — if set, only logs for this item
 * @param {string|null} statusFilter — if set, only logs with this status
 * @returns {Promise<string[]>}
 */
async function loadSuggestionsForField(field, itemName, statusFilter) {
  const cacheKey = `${field}|${itemName || ''}|${statusFilter || ''}`;
  if (_suggestionCache.has(cacheKey)) {
    return _suggestionCache.get(cacheKey);
  }

  try {
    let logsToScan;
    if (itemName && typeof dbGetLogsByName === 'function') {
      logsToScan = await dbGetLogsByName(itemName);
    } else if (typeof dbGetRecentLogs === 'function') {
      logsToScan = await dbGetRecentLogs(200);
    } else {
      logsToScan = await dbGetAllLogs();
    }
    const allLogs = logsToScan;

    let filtered = logsToScan;

    if (itemName) {
      filtered = filtered.filter(l => l.name === itemName || l.parentTaskName === itemName || l.subtaskName === itemName);
    }
    if (statusFilter) {
      filtered = filtered.filter(l => l.status === statusFilter);
    }

    // Count frequency of each unique value
    const counts = {};
    const extractVal = (l, f) => {
      if (f === 'beforeActivity') return l.beforeActivity || l.previousActivity;
      if (f === 'previousActivity') return l.previousActivity || l.beforeActivity;
      if (f === 'action') return l.action || l.actualAction || l.completedWork || l.resistActivity || l.alternativeActivity;
      return l[f];
    };

    filtered.forEach(l => {
      const val = extractVal(l, field);
      if (val && typeof val === 'string' && val.trim()) {
        const key = val.trim();
        const lowerKey = key.toLowerCase();
        if (!counts[lowerKey]) counts[lowerKey] = { display: key, count: 0 };
        counts[lowerKey].count++;
      }
    });

    // Also pull from all logs (broader context) for certain fields
    const broadFields = ['place', 'previousActivity', 'beforeActivity', 'physicalState', 'mentalState', 'action', 'alternativeActivity', 'interruption'];
    if (!itemName && broadFields.includes(field)) {
      allLogs.forEach(l => {
        const val = extractVal(l, field);
        if (val && typeof val === 'string' && val.trim()) {
          const key = val.trim();
          const lowerKey = key.toLowerCase();
          if (!counts[lowerKey]) counts[lowerKey] = { display: key, count: 0 };
          counts[lowerKey].count++;
        }
      });
    }

    const result = Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(c => c.display);

    _suggestionCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('Failed to load suggestions:', err);
    return [];
  }
}

/**
 * Render suggestion chips into a container.
 * Clicking a chip fills the associated input.
 * @param {string} containerId — ID of the .suggestion-chips div
 * @param {string} inputId — ID of the text input to fill
 * @param {string[]} suggestions — array of suggestion strings
 */
function renderSuggestionChips(containerId, inputId, suggestions) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!suggestions || suggestions.length === 0) return;

  suggestions.forEach(text => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'suggestion-chip';
    chip.textContent = text;
    chip.addEventListener('click', () => {
      const input = document.getElementById(inputId);
      if (input) {
        input.value = text;
        input.focus();
        // Trigger input event for any listeners
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    container.appendChild(chip);
  });
}

/**
 * Clear all suggestion chip containers.
 */
function clearAllSuggestions() {
  document.querySelectorAll('.suggestion-chips').forEach(el => {
    el.innerHTML = '';
  });
}

/**
 * Load and render suggestions for the main log modal based on status, type, and item.
 * Called when a status button is selected.
 * @param {string} status — 'Done' | 'Partially Done' | 'Skipped'
 * @param {string} type — 'Habit' | 'Task'
 * @param {string} itemName — current item name
 */
async function loadSuggestionsForStatus(status, type, itemName) {
  clearAllSuggestions();

  const behaviorType = modalState ? modalState.behaviorType : 'Good';
  const isQuit = type === 'Habit' && behaviorType === 'Bad';

  if (type === 'Habit') {
    // 1. Action suggestions
    let actionSugg = [];
    if (!isQuit) {
      if (status === 'Done') actionSugg = await loadSuggestionsForField('completedWork', itemName, 'Done');
      else if (status === 'Partially Done') actionSugg = await loadSuggestionsForField('actualAction', itemName, 'Partially Done');
      else if (status === 'Skipped') actionSugg = await loadSuggestionsForField('alternativeActivity', null, 'Skipped');
    } else {
      if (status === 'Done') actionSugg = await loadSuggestionsForField('resistActivity', itemName, 'Done');
      else if (status === 'Partially Done') actionSugg = await loadSuggestionsForField('resistActivity', itemName, 'Partially Done');
      else if (status === 'Skipped') actionSugg = await loadSuggestionsForField('completedWork', itemName, 'Skipped');
    }
    renderSuggestionChips('suggest-habit-action', 'log-habit-action', actionSugg);

    // 2. Before activity suggestions
    const beforeSugg = await loadSuggestionsForField('beforeActivity', null, null);
    const defaultBefore = ['Work', 'Commuting', 'Dinner', 'Idle / Phone', 'Resting', 'Exercising', 'Socializing'];
    const finalBefore = [...new Set([...beforeSugg, ...defaultBefore])].slice(0, 6);
    renderSuggestionChips('suggest-habit-before', 'log-habit-before', finalBefore);

    // 3. Physical state suggestions
    const physicalSugg = await loadSuggestionsForField('physicalState', null, null);
    const defaultPhysical = ['Rested', 'Energetic', 'Normal', 'Tired', 'Exhausted', 'Sore'];
    const finalPhysical = [...new Set([...physicalSugg, ...defaultPhysical])].slice(0, 6);
    renderSuggestionChips('suggest-habit-physical', 'log-habit-physical', finalPhysical);

    // 4. Mental state suggestions
    const mentalSugg = await loadSuggestionsForField('mentalState', null, null);
    const defaultMental = ['Focused', 'Calm', 'Motivated', 'Stressed', 'Distracted', 'Anxious', 'Bored'];
    const finalMental = [...new Set([...mentalSugg, ...defaultMental])].slice(0, 6);
    renderSuggestionChips('suggest-habit-mental', 'log-habit-mental', finalMental);

    // 5. Place suggestions
    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-habit-place', 'log-habit-place', placeSugg);
    return;
  }

  // Tasks suggestion loading
  if (status === 'Done') {
    const compSugg = await loadSuggestionsForField('completedWork', itemName, 'Done');
    renderSuggestionChips('suggest-done-completed', 'log-done-completed', compSugg);
    const outSugg = await loadSuggestionsForField('outcome', itemName, null);
    renderSuggestionChips('suggest-done-outcome', 'log-done-outcome', outSugg);
    const probSugg = await loadSuggestionsForField('problemsFaced', itemName, null);
    renderSuggestionChips('suggest-done-problems', 'log-done-problems', probSugg);
    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-done-place', 'log-done-place', placeSugg);
  } else if (status === 'Partially Done') {
    const compSugg = await loadSuggestionsForField('completedWork', itemName, 'Partially Done');
    renderSuggestionChips('suggest-partial-completed', 'log-partial-completed', compSugg);
    const remSugg = await loadSuggestionsForField('remainingWork', itemName, null);
    renderSuggestionChips('suggest-partial-remaining', 'log-partial-remaining', remSugg);
    const probSugg = await loadSuggestionsForField('problemsFaced', itemName, null);
    renderSuggestionChips('suggest-partial-problem', 'log-partial-problem', probSugg);
    const intSugg = await loadSuggestionsForField('interruption', null, 'Partially Done');
    renderSuggestionChips('suggest-task-interruption', 'log-task-interruption', intSugg);
    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-partial-place', 'log-partial-place', placeSugg);
  } else if (status === 'Skipped') {
    const altSugg = await loadSuggestionsForField('alternativeActivity', null, 'Skipped');
    renderSuggestionChips('suggest-alternative-activity', 'log-alternative-activity', altSugg);
  }
}

const _defaultTaskBefore = ['Work', 'Commuting', 'Dinner', 'Idle / Phone', 'Resting', 'Exercising', 'Socializing'];
const _defaultTaskPhysical = ['Rested', 'Energetic', 'Normal', 'Tired', 'Exhausted', 'Sore'];
const _defaultTaskMental = ['Focused', 'Calm', 'Motivated', 'Stressed', 'Distracted', 'Anxious', 'Bored'];
const _defaultTaskPlace = ['Home', 'Office', 'College', 'Outside', 'Desk'];

/**
 * Load and render suggestions for the subtask log modal.
 * @param {string} status — subtask status
 * @param {string} parentTaskName — parent task name for context
 * @param {string} [itemName] — optional subtask/action name
 */
async function loadSubtaskSuggestions(status, parentTaskName, itemName) {
  // Clear subtask-specific suggestion containers
  document.querySelectorAll('[id^="suggest-subtask-"]').forEach(el => { el.innerHTML = ''; });

  const queryName = itemName || parentTaskName || '';

  if (status === 'Done') {
    const compSugg = await loadSuggestionsForField('completedWork', queryName, 'Done');
    renderSuggestionChips('suggest-subtask-done-completed', 'subtask-done-completed', compSugg);

    const beforeSugg = await loadSuggestionsForField('beforeActivity', null, null);
    renderSuggestionChips('suggest-subtask-done-before', 'subtask-done-before', [...new Set([...beforeSugg, ..._defaultTaskBefore])].slice(0, 6));

    const physSugg = await loadSuggestionsForField('physicalState', null, null);
    renderSuggestionChips('suggest-subtask-done-physical', 'subtask-done-physical', [...new Set([...physSugg, ..._defaultTaskPhysical])].slice(0, 6));

    const mentSugg = await loadSuggestionsForField('mentalState', null, null);
    renderSuggestionChips('suggest-subtask-done-mental', 'subtask-done-mental', [...new Set([...mentSugg, ..._defaultTaskMental])].slice(0, 6));

    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-subtask-done-place', 'subtask-done-place', [...new Set([...placeSugg, ..._defaultTaskPlace])].slice(0, 6));
  } else if (status === 'Partially Done') {
    const compSugg = await loadSuggestionsForField('completedWork', queryName, 'Partially Done');
    renderSuggestionChips('suggest-subtask-partial-completed', 'subtask-partial-completed', compSugg);

    const remSugg = await loadSuggestionsForField('remainingWork', queryName, null);
    renderSuggestionChips('suggest-subtask-partial-remaining', 'subtask-partial-remaining', remSugg);

    const beforeSugg = await loadSuggestionsForField('beforeActivity', null, null);
    renderSuggestionChips('suggest-subtask-partial-before', 'subtask-partial-before', [...new Set([...beforeSugg, ..._defaultTaskBefore])].slice(0, 6));

    const physSugg = await loadSuggestionsForField('physicalState', null, null);
    renderSuggestionChips('suggest-subtask-partial-physical', 'subtask-partial-physical', [...new Set([...physSugg, ..._defaultTaskPhysical])].slice(0, 6));

    const mentSugg = await loadSuggestionsForField('mentalState', null, null);
    renderSuggestionChips('suggest-subtask-partial-mental', 'subtask-partial-mental', [...new Set([...mentSugg, ..._defaultTaskMental])].slice(0, 6));

    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-subtask-partial-place', 'subtask-partial-place', [...new Set([...placeSugg, ..._defaultTaskPlace])].slice(0, 6));
  } else if (status === 'Skipped') {
    const altSugg = await loadSuggestionsForField('alternativeActivity', null, 'Skipped');
    renderSuggestionChips('suggest-subtask-skipped-activity', 'subtask-skipped-activity', altSugg);

    const beforeSugg = await loadSuggestionsForField('beforeActivity', null, null);
    renderSuggestionChips('suggest-subtask-skipped-before', 'subtask-skipped-before', [...new Set([...beforeSugg, ..._defaultTaskBefore])].slice(0, 6));

    const physSugg = await loadSuggestionsForField('physicalState', null, null);
    renderSuggestionChips('suggest-subtask-skipped-physical', 'subtask-skipped-physical', [...new Set([...physSugg, ..._defaultTaskPhysical])].slice(0, 6));

    const mentSugg = await loadSuggestionsForField('mentalState', null, null);
    renderSuggestionChips('suggest-subtask-skipped-mental', 'subtask-skipped-mental', [...new Set([...mentSugg, ..._defaultTaskMental])].slice(0, 6));

    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-subtask-skipped-place', 'subtask-skipped-place', [...new Set([...placeSugg, ..._defaultTaskPlace])].slice(0, 6));
  }
}

/**
 * Load and render suggestions for the main task log on task-details.html.
 * @param {string} status — 'Done' | 'Partially Done' | 'Skipped'
 * @param {string} taskName — task name
 */
async function loadTaskDetailsSuggestions(status, taskName) {
  document.querySelectorAll('[id^="suggest-task-"]').forEach(el => { el.innerHTML = ''; });

  if (status === 'Done') {
    const compSugg = await loadSuggestionsForField('completedWork', taskName, 'Done');
    renderSuggestionChips('suggest-task-done-completed', 'task-done-completed', compSugg);

    const beforeSugg = await loadSuggestionsForField('beforeActivity', null, null);
    renderSuggestionChips('suggest-task-done-before', 'task-done-before', [...new Set([...beforeSugg, ..._defaultTaskBefore])].slice(0, 6));

    const physSugg = await loadSuggestionsForField('physicalState', null, null);
    renderSuggestionChips('suggest-task-done-physical', 'task-done-physical', [...new Set([...physSugg, ..._defaultTaskPhysical])].slice(0, 6));

    const mentSugg = await loadSuggestionsForField('mentalState', null, null);
    renderSuggestionChips('suggest-task-done-mental', 'task-done-mental', [...new Set([...mentSugg, ..._defaultTaskMental])].slice(0, 6));

    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-task-done-place', 'task-done-place', [...new Set([...placeSugg, ..._defaultTaskPlace])].slice(0, 6));
  } else if (status === 'Partially Done') {
    const compSugg = await loadSuggestionsForField('completedWork', taskName, 'Partially Done');
    renderSuggestionChips('suggest-task-partial-completed', 'task-partial-completed', compSugg);

    const remSugg = await loadSuggestionsForField('remainingWork', taskName, null);
    renderSuggestionChips('suggest-task-partial-remaining', 'task-partial-remaining', remSugg);

    const beforeSugg = await loadSuggestionsForField('beforeActivity', null, null);
    renderSuggestionChips('suggest-task-partial-before', 'task-partial-before', [...new Set([...beforeSugg, ..._defaultTaskBefore])].slice(0, 6));

    const physSugg = await loadSuggestionsForField('physicalState', null, null);
    renderSuggestionChips('suggest-task-partial-physical', 'task-partial-physical', [...new Set([...physSugg, ..._defaultTaskPhysical])].slice(0, 6));

    const mentSugg = await loadSuggestionsForField('mentalState', null, null);
    renderSuggestionChips('suggest-task-partial-mental', 'task-partial-mental', [...new Set([...mentSugg, ..._defaultTaskMental])].slice(0, 6));

    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-task-partial-place', 'task-partial-place', [...new Set([...placeSugg, ..._defaultTaskPlace])].slice(0, 6));
  } else if (status === 'Skipped') {
    const altSugg = await loadSuggestionsForField('alternativeActivity', null, 'Skipped');
    renderSuggestionChips('suggest-task-skipped-activity', 'task-skipped-activity', altSugg);

    const beforeSugg = await loadSuggestionsForField('beforeActivity', null, null);
    renderSuggestionChips('suggest-task-skipped-before', 'task-skipped-before', [...new Set([...beforeSugg, ..._defaultTaskBefore])].slice(0, 6));

    const physSugg = await loadSuggestionsForField('physicalState', null, null);
    renderSuggestionChips('suggest-task-skipped-physical', 'task-skipped-physical', [...new Set([...physSugg, ..._defaultTaskPhysical])].slice(0, 6));

    const mentSugg = await loadSuggestionsForField('mentalState', null, null);
    renderSuggestionChips('suggest-task-skipped-mental', 'task-skipped-mental', [...new Set([...mentSugg, ..._defaultTaskMental])].slice(0, 6));

    const placeSugg = await loadSuggestionsForField('place', null, null);
    renderSuggestionChips('suggest-task-skipped-place', 'task-skipped-place', [...new Set([...placeSugg, ..._defaultTaskPlace])].slice(0, 6));
  }
}

// ============================================================
// Behavioral Logging — Section Visibility & Inputs
// ============================================================

/** Hide all dynamic behavioral sections */
function hideAllBehavioralSections() {
  const habitSection = document.getElementById('habit-log-section');
  if (habitSection) {
    habitSection.classList.remove('visible');
    habitSection.style.display = 'none';
  }
  const taskSection = document.getElementById('task-log-section');
  if (taskSection) {
    taskSection.style.display = 'none';
  }
  const sectionIds = ['done-section', 'partial-section', 'skipped-section', 'extend-section'];
  sectionIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  });
  // Also hide optional field expansions
  ['done-optional-fields', 'partial-optional-fields', 'skipped-optional-fields', 'habit-place-fields'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  });
  const placeToggle = document.getElementById('habit-place-toggle');
  if (placeToggle) placeToggle.textContent = '▸ Place (optional)';
}

/** Clear all behavioral input fields */
function clearBehavioralInputs() {
  const inputIds = [
    'log-habit-action', 'log-habit-before', 'log-habit-physical', 'log-habit-mental', 'log-habit-place',
    'log-previous-activity', 'log-done-place', 'log-done-date', 'log-done-time',
    'log-done-completed', 'log-done-outcome', 'log-done-problems',
    'log-interruption', 'log-task-interruption', 'log-duration', 'log-partial-place', 'log-partial-date', 'log-partial-time',
    'log-partial-completed', 'log-partial-remaining', 'log-partial-problem',
    'log-partial-habit-completed',
    'log-alternative-activity', 'log-skipped-date', 'log-skipped-time',
    'resist-activity', 'resist-urge-count', 'log-resist-date', 'log-resist-time',
    'log-quit-partial-trigger', 'log-quit-partial-before', 'log-quit-partial-resist',
    'log-quit-done-trigger', 'log-quit-done-before',
    'notes', 'log-extend-date', 'log-extend-reason'
  ];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/** Show the appropriate behavioral section for the selected status */
function showBehavioralSection(status, type, behaviorType) {
  hideAllBehavioralSections();

  if (type === 'Habit') {
    const habitSection = document.getElementById('habit-log-section');
    if (!habitSection) return;
    habitSection.style.display = 'block';
    habitSection.classList.add('visible');

    const isQuit = behaviorType === 'Bad';
    const actionLabel = document.getElementById('log-habit-action-label');
    const actionInput = document.getElementById('log-habit-action');
    const fallbackBanner = document.getElementById('habit-fallback-banner');
    const fallbackUseBtn = document.getElementById('habit-use-fallback-btn');
    const replacementBanner = document.getElementById('habit-replacement-banner');
    const replacementUseBtn = document.getElementById('habit-use-replacement-btn');

    if (!isQuit) {
      // Growth Habit
      if (status === 'Done') {
        if (actionLabel) actionLabel.textContent = 'What did you do?';
        if (actionInput) {
          actionInput.placeholder = modalState.target ? `e.g. ${modalState.target}` : 'e.g. Completed target, read 15 pages...';
          if (!actionInput.value.trim() && modalState.target) actionInput.value = modalState.target;
        }
        if (fallbackBanner) fallbackBanner.style.display = 'none';
        if (replacementBanner) replacementBanner.style.display = 'none';
      } else if (status === 'Partially Done') {
        if (actionLabel) actionLabel.textContent = 'What did you actually do?';
        if (actionInput) actionInput.placeholder = 'e.g. 5 push-ups, read 2 pages...';
        if (fallbackBanner) {
          if (modalState.fallbackAction) {
            fallbackBanner.style.display = 'block';
            if (fallbackUseBtn) fallbackUseBtn.textContent = `Use: ${modalState.fallbackAction}`;
          } else {
            fallbackBanner.style.display = 'none';
          }
        }
        if (replacementBanner) replacementBanner.style.display = 'none';
      } else if (status === 'Skipped') {
        if (actionLabel) actionLabel.textContent = 'What did you do instead?';
        if (actionInput) actionInput.placeholder = 'e.g. Watched YouTube, stayed late at work...';
        if (fallbackBanner) fallbackBanner.style.display = 'none';
        if (replacementBanner) replacementBanner.style.display = 'none';
      }
    } else {
      // Quit Habit
      if (status === 'Done') {
        // Resisted
        if (actionLabel) actionLabel.textContent = 'What did you do instead?';
        if (actionInput) {
          actionInput.placeholder = modalState.replacementAction ? `e.g. ${modalState.replacementAction}` : 'e.g. Went for a walk, drank water, deep breathing...';
        }
        if (fallbackBanner) fallbackBanner.style.display = 'none';
        if (replacementBanner) {
          if (modalState.replacementAction) {
            replacementBanner.style.display = 'block';
            if (replacementUseBtn) replacementUseBtn.textContent = `Use: ${modalState.replacementAction}`;
          } else {
            replacementBanner.style.display = 'none';
          }
        }
      } else if (status === 'Partially Done') {
        // Partially Resisted
        if (actionLabel) actionLabel.textContent = 'What happened / what did you actually do?';
        if (actionInput) actionInput.placeholder = 'e.g. Resisted initial urge, delayed by 1 hour...';
        if (fallbackBanner) fallbackBanner.style.display = 'none';
        if (replacementBanner) {
          if (modalState.replacementAction) {
            replacementBanner.style.display = 'block';
            if (replacementUseBtn) replacementUseBtn.textContent = `Use: ${modalState.replacementAction}`;
          } else {
            replacementBanner.style.display = 'none';
          }
        }
      } else if (status === 'Skipped') {
        // Done (Quit behavior occurred)
        if (actionLabel) actionLabel.textContent = 'What did you do?';
        if (actionInput) {
          actionInput.placeholder = `e.g. ${modalState.name}`;
          if (!actionInput.value.trim()) actionInput.value = modalState.name;
        }
        if (fallbackBanner) fallbackBanner.style.display = 'none';
        if (replacementBanner) replacementBanner.style.display = 'none';
      }
    }
    return;
  }

  // Task logging section handling
  const taskSection = document.getElementById('task-log-section');
  if (taskSection) taskSection.style.display = 'block';

  if (status === 'Done') {
    const doneSection = document.getElementById('done-section');
    if (doneSection) doneSection.classList.add('visible');
  } else if (status === 'Partially Done') {
    const partialSection = document.getElementById('partial-section');
    if (partialSection) partialSection.classList.add('visible');
  } else if (status === 'Skipped') {
    const skippedSection = document.getElementById('skipped-section');
    if (skippedSection) skippedSection.classList.add('visible');
  } else if (status === 'Extended') {
    const extendSection = document.getElementById('extend-section');
    if (extendSection) extendSection.classList.add('visible');
  }
}

/** Save button validation and labels */
function updateSaveButton() {
  const btn = document.getElementById('save-btn');
  if (!btn) return;
  if (!modalState.status) {
    btn.disabled = true;
    btn.textContent = 'Save Log';
    return;
  }
  btn.disabled = false;
  if (modalState.type === 'Habit') {
    const isQuit = modalState.behaviorType === 'Bad';
    if (!isQuit) {
      btn.textContent = `Save Log (${modalState.status})`;
    } else {
      if (modalState.status === 'Done') btn.textContent = 'Save Log (Resisted)';
      else if (modalState.status === 'Partially Done') btn.textContent = 'Save Log (Partially Resisted)';
      else if (modalState.status === 'Skipped') btn.textContent = 'Save Log (Done)';
    }
  } else {
    btn.textContent = `Save Log (${modalState.status})`;
  }
}

/** Open the log modal for a specific habit/task. */
function openModal(item, type) {
  const name = item.name;
  const behaviorType = item.behaviorType || 'Good';
  modalState = {
    name,
    type,
    status: '',
    reason: '',
    behaviorType,
    item,
    target: item.target || '',
    fallbackAction: item.fallbackAction || item.fallback || '',
    replacementAction: item.replacementAction || item.replacement || '',
    usedFallback: false,
    usedReplacementAction: false
  };

  document.getElementById('modal-title').textContent = name;

  const editBtn = document.getElementById('edit-item-btn');
  if (editBtn) {
    editBtn.classList.remove('hidden');
    editBtn.textContent = type === 'Habit' ? 'Edit Habit' : 'Edit Task';
  }

  // Setup Badge & Button Labels with Subtexts
  const badge = document.getElementById('modal-badge');
  const textDone = document.getElementById('status-text-done');
  const subDone = document.getElementById('status-sub-done');
  const textPartial = document.getElementById('status-text-partial');
  const subPartial = document.getElementById('status-sub-partial');
  const textSkipped = document.getElementById('status-text-skipped');
  const subSkipped = document.getElementById('status-sub-skipped');
  const subExtended = document.getElementById('status-sub-extended');
  const quickTip = document.getElementById('quick-log-tip');
  if (quickTip) quickTip.style.display = 'none';

  if (type === 'Task') {
    badge.textContent = 'Task';
    badge.style.color = 'var(--accent)';
    textDone.textContent = 'Done';
    if (subDone) subDone.textContent = 'Completed';
    if (textPartial) textPartial.textContent = 'Partially Done';
    if (subPartial) subPartial.textContent = 'Some progress';
    if (textSkipped) textSkipped.textContent = 'Skipped';
    if (subSkipped) subSkipped.textContent = 'Did other activity';
    if (subExtended) subExtended.textContent = 'Move deadline';
  } else if (behaviorType === 'Bad') {
    badge.textContent = 'Bad Habit (To Quit)';
    badge.style.color = 'var(--danger)';
    textDone.textContent = 'Resisted';
    if (subDone) subDone.textContent = 'Urge resisted';
    if (textPartial) textPartial.textContent = 'Partially Resisted';
    if (subPartial) subPartial.textContent = 'Partly resisted';
    if (textSkipped) textSkipped.textContent = 'Done';
    if (subSkipped) subSkipped.textContent = 'Urge occurred';
  } else {
    badge.textContent = 'Good Habit (To Build)';
    badge.style.color = 'var(--success)';
    textDone.textContent = 'Done';
    if (subDone) subDone.textContent = 'Completed';
    if (textPartial) textPartial.textContent = 'Partially Done';
    if (subPartial) subPartial.textContent = 'Some progress';
    if (textSkipped) textSkipped.textContent = 'Skipped';
    if (subSkipped) subSkipped.textContent = 'Did other activity';
  }

  // Show/hide link habit button (only for habits)
  const linkHabitBtn = document.getElementById('link-habit-btn');
  if (linkHabitBtn) {
    linkHabitBtn.style.display = type === 'Habit' ? '' : 'none';
  }

  // Show Extend status button only for Tasks
  const extendStatusBtn = document.getElementById('status-btn-extended');
  if (extendStatusBtn) {
    extendStatusBtn.style.display = type === 'Task' ? '' : 'none';
  }

  // Reset Fallback UI elements
  const fallbackContainer = document.getElementById('partial-fallback-container');
  const fallbackText = document.getElementById('partial-fallback-text');
  const fallbackYes = document.getElementById('fallback-opt-yes');
  const fallbackNo = document.getElementById('fallback-opt-no');
  if (fallbackText) fallbackText.textContent = modalState.fallbackAction;
  if (fallbackYes && fallbackNo) {
    fallbackYes.classList.remove('active');
    fallbackNo.classList.add('active');
  }
  if (fallbackContainer) {
    fallbackContainer.style.display = 'none';
  }

  // Reset Habit Fallback Banner UI
  const habitFallbackBanner = document.getElementById('habit-fallback-banner');
  const habitFallbackText = document.getElementById('habit-fallback-text');
  const habitFallbackYes = document.getElementById('habit-fallback-yes');
  const habitFallbackNo = document.getElementById('habit-fallback-no');
  if (habitFallbackText) habitFallbackText.textContent = modalState.fallbackAction || '';
  if (habitFallbackYes && habitFallbackNo) {
    habitFallbackYes.classList.remove('active');
    habitFallbackNo.classList.add('active');
  }
  if (habitFallbackBanner) {
    habitFallbackBanner.style.display = 'none';
  }

  // Reset Quit Replacement UI elements
  const quitPartialReplContainer = document.getElementById('quit-partial-replacement-container');
  const quitPartialReplBtn = document.getElementById('quit-partial-use-replacement-btn');
  const quitPartialReplYes = document.getElementById('quit-partial-repl-yes');
  const quitPartialReplNo = document.getElementById('quit-partial-repl-no');
  if (quitPartialReplBtn) quitPartialReplBtn.textContent = modalState.replacementAction ? `Use: ${modalState.replacementAction}` : '';
  if (quitPartialReplYes && quitPartialReplNo) {
    quitPartialReplYes.classList.remove('active');
    quitPartialReplNo.classList.add('active');
  }
  if (quitPartialReplContainer) {
    quitPartialReplContainer.style.display = 'none';
  }

  const resistReplContainer = document.getElementById('resist-replacement-container');
  const resistReplBtn = document.getElementById('resist-use-replacement-btn');
  const resistReplYes = document.getElementById('resist-repl-yes');
  const resistReplNo = document.getElementById('resist-repl-no');
  if (resistReplBtn) resistReplBtn.textContent = modalState.replacementAction ? `Use: ${modalState.replacementAction}` : '';
  if (resistReplYes && resistReplNo) {
    resistReplYes.classList.remove('active');
    resistReplNo.classList.add('active');
  }
  if (resistReplContainer) {
    resistReplContainer.style.display = 'none';
  }

  // Reset Habit Replacement Banner UI
  const habitReplBanner = document.getElementById('habit-replacement-banner');
  const habitReplText = document.getElementById('habit-replacement-text');
  const habitReplYes = document.getElementById('habit-replacement-yes');
  const habitReplNo = document.getElementById('habit-replacement-no');
  if (habitReplText) habitReplText.textContent = modalState.replacementAction || '';
  if (habitReplYes && habitReplNo) {
    habitReplYes.classList.remove('active');
    habitReplNo.classList.add('active');
  }
  if (habitReplBanner) {
    habitReplBanner.style.display = 'none';
  }

  // Pre-fill Date & Time defaults in optional fields
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  
  ['log-done-date', 'log-partial-date', 'log-skipped-date', 'log-habit-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = dateStr;
  });
  ['log-done-time', 'log-partial-time', 'log-skipped-time', 'log-habit-time'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = timeStr;
  });

  // Reset habit place fields
  const habitPlaceFields = document.getElementById('habit-place-fields');
  const habitPlaceToggle = document.getElementById('habit-place-toggle');
  if (habitPlaceFields) habitPlaceFields.style.display = 'none';
  if (habitPlaceToggle) habitPlaceToggle.textContent = '▸ Optional: Add Place';

  // Reset status buttons
  document.querySelectorAll('.status-btn').forEach((b) => {
    if (!b.id.startsWith('subtask-')) b.className = 'status-btn';
  });

  // Clear behavioral inputs
  clearBehavioralInputs();
  hideAllBehavioralSections();

  // Reset notes
  const notesField = document.getElementById('notes');
  const toggleNotesBtn = document.getElementById('toggle-notes-btn');
  if (notesField) {
    notesField.value = '';
    notesField.classList.add('hidden');
  }
  if (toggleNotesBtn) {
    toggleNotesBtn.textContent = '+ Add Notes';
  }

  // Reset save button
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Save Log';
    saveBtn.classList.remove('saved');
  }

  // Render subtasks checklist for tasks
  renderSubtaskCards();

  // Show modal
  document.getElementById('modal-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/** Close the log modal. */
function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  document.body.style.overflow = '';
  if (typeof renderActiveDetailView === 'function' && document.getElementById('task-breadcrumbs')) {
    renderActiveDetailView();
  }
}

/** Handle the save button click — v4 behavioral logging, offline-first. */
async function handleSave() {
  const btn = document.getElementById('save-btn');
  const notes = (document.getElementById('notes') || {}).value || '';

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const now = new Date();
  const loggedAt = now.toISOString();
  const defaultDate = now.toLocaleDateString('en-CA');
  const defaultTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // Build log entry with v4 behavioral fields
  const logEntry = {
    date: defaultDate,
    time: defaultTime,
    type: modalState.type,
    name: modalState.name,
    status: modalState.status,
    reason: '',
    notes: notes.trim(),
    loggedAt: loggedAt,
    activityDate: defaultDate,
    activityStartTime: defaultTime,
    previousActivity: '',
    alternativeActivity: '',
    interruption: '',
    duration: '',
    place: '',
    priority: (modalState.item && modalState.item.priority) || '',
    // v5: New execution logging fields
    completedWork: '',
    outcome: '',
    problemsFaced: '',
    remainingWork: '',
    objective: (modalState.item && modalState.item.objective) || '',
    // v6: Quit-habit-specific fields
    trigger: '',
    beforeActivity: '',
    resistActivity: '',
    urgeCount: '',
    behaviorType: modalState.behaviorType || 'Good',
    // v7: Fallback & Replacement tracking
    fallbackAction: modalState.fallbackAction || '',
    usedFallback: modalState.usedFallback ? 'Yes' : 'No',
    actualAction: '',
    replacementAction: modalState.replacementAction || '',
    usedReplacementAction: modalState.usedReplacementAction ? 'Yes' : 'No',
    // Habit minimum useful evidence fields
    action: '',
    physicalState: '',
    mentalState: ''
  };

  const isQuit = modalState.type === 'Habit' && modalState.behaviorType === 'Bad';

  if (modalState.type === 'Habit') {
    // Habit Logging Flow: BEFORE ACTIVITY → PHYSICAL STATE → MENTAL STATE → TIME (Place optional)
    const actInput = document.getElementById('log-habit-action');
    const beforeInput = document.getElementById('log-habit-before');
    const physInput = document.getElementById('log-habit-physical');
    const mentInput = document.getElementById('log-habit-mental');
    const dateInput = document.getElementById('log-habit-date');
    const timeInput = document.getElementById('log-habit-time');
    const placeInput = document.getElementById('log-habit-place');

    const habitAction = actInput ? actInput.value.trim() : '';
    const habitBefore = beforeInput ? beforeInput.value.trim() : '';
    const habitPhysical = physInput ? physInput.value.trim() : '';
    const habitMental = mentInput ? mentInput.value.trim() : '';
    const habitDate = (dateInput && dateInput.value) || defaultDate;
    const habitTime = (timeInput && timeInput.value) || defaultTime;
    const habitPlace = placeInput ? placeInput.value.trim() : '';

    logEntry.action = habitAction;
    logEntry.beforeActivity = habitBefore;
    logEntry.previousActivity = habitBefore;
    logEntry.physicalState = habitPhysical;
    logEntry.mentalState = habitMental;
    logEntry.place = habitPlace;
    logEntry.condition = [habitPhysical, habitMental].filter(Boolean).join(', ');
    logEntry.activityDate = habitDate;
    logEntry.activityStartTime = habitTime;
    logEntry.fallbackAction = modalState.fallbackAction || '';
    logEntry.usedFallback = modalState.usedFallback ? 'Yes' : 'No';
    logEntry.replacementAction = modalState.replacementAction || '';
    logEntry.usedReplacementAction = modalState.usedReplacementAction ? 'Yes' : 'No';

    if (isQuit) {
      if (modalState.status === 'Done') { // Resisted
        logEntry.resistActivity = habitAction;
      } else if (modalState.status === 'Partially Done') { // Partially Resisted
        logEntry.actualAction = habitAction;
        logEntry.resistActivity = habitAction;
      } else if (modalState.status === 'Skipped') { // Done (urge occurred)
        logEntry.completedWork = habitAction;
      }
    } else {
      if (modalState.status === 'Done') { // Done
        logEntry.completedWork = habitAction;
      } else if (modalState.status === 'Partially Done') { // Partially Done
        logEntry.actualAction = habitAction;
        logEntry.completedWork = habitAction;
      } else if (modalState.status === 'Skipped') { // Skipped
        logEntry.alternativeActivity = habitAction;
      }
    }
  } else {
    // Populate behavioral fields based on status for Tasks
    const isTaskDetails = window.location.pathname.includes('task-details.html');

    if (modalState.status === 'Done') {
      const completed = document.getElementById(isTaskDetails ? 'task-done-completed' : 'log-done-completed');
      const outcome = document.getElementById(isTaskDetails ? 'task-done-outcome' : 'log-done-outcome');
      const problems = document.getElementById(isTaskDetails ? 'task-done-problems' : 'log-done-problems');
      const doneBefore = document.getElementById(isTaskDetails ? 'task-done-before' : 'log-done-before');
      const donePhys = document.getElementById(isTaskDetails ? 'task-done-physical' : 'log-done-physical');
      const doneMent = document.getElementById(isTaskDetails ? 'task-done-mental' : 'log-done-mental');
      const donePlace = document.getElementById(isTaskDetails ? 'task-done-place' : 'log-done-place');
      const doneDate = document.getElementById(isTaskDetails ? 'task-done-date' : 'log-done-date');
      const doneTime = document.getElementById(isTaskDetails ? 'task-done-time' : 'log-done-time');
      const doneEndTime = document.getElementById(isTaskDetails ? 'task-done-endtime' : 'log-done-endtime');

      logEntry.completedWork = completed ? completed.value.trim() : '';
      logEntry.outcome = outcome ? outcome.value.trim() : '';
      logEntry.problemsFaced = problems ? problems.value.trim() : '';
      logEntry.beforeActivity = doneBefore ? doneBefore.value.trim() : '';
      logEntry.previousActivity = logEntry.beforeActivity;
      logEntry.physicalState = donePhys ? donePhys.value.trim() : '';
      logEntry.mentalState = doneMent ? doneMent.value.trim() : '';
      logEntry.place = donePlace ? donePlace.value.trim() : '';
      logEntry.activityDate = (doneDate && doneDate.value) || defaultDate;
      logEntry.activityStartTime = (doneTime && doneTime.value) || defaultTime;
      if (doneEndTime && doneEndTime.value) logEntry.activityEndTime = doneEndTime.value;
    } else if (modalState.status === 'Partially Done') {
      const completed = document.getElementById(isTaskDetails ? 'task-partial-completed' : 'log-partial-completed');
      const remaining = document.getElementById(isTaskDetails ? 'task-partial-remaining' : 'log-partial-remaining');
      const problem = document.getElementById(isTaskDetails ? 'task-partial-problem' : 'log-partial-problem');
      const partialBefore = document.getElementById(isTaskDetails ? 'task-partial-before' : 'log-partial-before');
      const partialPhys = document.getElementById(isTaskDetails ? 'task-partial-physical' : 'log-partial-physical');
      const partialMent = document.getElementById(isTaskDetails ? 'task-partial-mental' : 'log-partial-mental');
      const taskInterrupt = document.getElementById('log-task-interruption');
      const duration = document.getElementById(isTaskDetails ? 'task-partial-duration' : 'log-duration');
      const partialPlace = document.getElementById(isTaskDetails ? 'task-partial-place' : 'log-partial-place');
      const partialDate = document.getElementById(isTaskDetails ? 'task-partial-date' : 'log-partial-date');
      const partialTime = document.getElementById(isTaskDetails ? 'task-partial-time' : 'log-partial-time');

      logEntry.completedWork = completed ? completed.value.trim() : '';
      logEntry.remainingWork = remaining ? remaining.value.trim() : '';
      logEntry.problemsFaced = problem ? problem.value.trim() : '';
      logEntry.beforeActivity = partialBefore ? partialBefore.value.trim() : '';
      logEntry.previousActivity = logEntry.beforeActivity;
      logEntry.physicalState = partialPhys ? partialPhys.value.trim() : '';
      logEntry.mentalState = partialMent ? partialMent.value.trim() : '';
      logEntry.interruption = taskInterrupt ? taskInterrupt.value.trim() : '';
      logEntry.duration = duration ? duration.value : '';
      logEntry.place = partialPlace ? partialPlace.value.trim() : '';
      logEntry.activityDate = (partialDate && partialDate.value) || defaultDate;
      logEntry.activityStartTime = (partialTime && partialTime.value) || defaultTime;

      // Integrated deadline extension for Partial
      const extToggle = document.getElementById(isTaskDetails ? 'task-partial-extend-toggle' : 'log-partial-extend-toggle');
      const extDate = document.getElementById(isTaskDetails ? 'task-partial-extend-date' : 'log-partial-extend-date');
      const extReason = document.getElementById(isTaskDetails ? 'task-partial-extend-reason' : 'log-partial-extend-reason');
      if (extToggle && extToggle.checked && extDate && extDate.value) {
        logEntry.newDeadline = extDate.value;
        logEntry.extensionReason = extReason ? extReason.value.trim() : '';
      }
    } else if (modalState.status === 'Skipped') {
      const altAct = document.getElementById(isTaskDetails ? 'task-skipped-activity' : 'log-alternative-activity');
      const skippedBefore = document.getElementById(isTaskDetails ? 'task-skipped-before' : 'log-skipped-before');
      const skippedPhys = document.getElementById(isTaskDetails ? 'task-skipped-physical' : 'log-skipped-physical');
      const skippedMent = document.getElementById(isTaskDetails ? 'task-skipped-mental' : 'log-skipped-mental');
      const skippedPlace = document.getElementById(isTaskDetails ? 'task-skipped-place' : 'log-skipped-place');
      const skippedDate = document.getElementById(isTaskDetails ? 'task-skipped-date' : 'log-skipped-date');
      const skippedTime = document.getElementById(isTaskDetails ? 'task-skipped-time' : 'log-skipped-time');

      logEntry.alternativeActivity = altAct ? altAct.value.trim() : '';
      logEntry.beforeActivity = skippedBefore ? skippedBefore.value.trim() : '';
      logEntry.previousActivity = logEntry.beforeActivity;
      logEntry.physicalState = skippedPhys ? skippedPhys.value.trim() : '';
      logEntry.mentalState = skippedMent ? skippedMent.value.trim() : '';
      logEntry.place = skippedPlace ? skippedPlace.value.trim() : '';
      logEntry.activityDate = (skippedDate && skippedDate.value) || defaultDate;
      logEntry.activityStartTime = (skippedTime && skippedTime.value) || defaultTime;

      // Integrated deadline extension for Skipped
      const extToggle = document.getElementById(isTaskDetails ? 'task-skipped-extend-toggle' : 'log-skipped-extend-toggle');
      const extDate = document.getElementById(isTaskDetails ? 'task-skipped-extend-date' : 'log-skipped-extend-date');
      const extReason = document.getElementById(isTaskDetails ? 'task-skipped-extend-reason' : 'log-skipped-extend-reason');
      if (extToggle && extToggle.checked && extDate && extDate.value) {
        logEntry.newDeadline = extDate.value;
        logEntry.extensionReason = extReason ? extReason.value.trim() : '';
      }
    } else if (modalState.status === 'Extended') {
      const extendDate = document.getElementById('log-extend-date');
      const extendReason = document.getElementById('log-extend-reason');
      const newDeadline = extendDate ? extendDate.value : '';
      logEntry.activityDate = defaultDate;
      logEntry.activityStartTime = defaultTime;
      logEntry.newDeadline = newDeadline;
      logEntry.extensionReason = extendReason ? extendReason.value.trim() : '';
    }
  }

  // Set the log date/time from actual activity date for sheet consistency
  logEntry.date = logEntry.activityDate;
  logEntry.time = logEntry.activityStartTime;

  try {
    // Handle Task Deadline Extension DB Update
    if (modalState.type === 'Task' && modalState.item && logEntry.newDeadline) {
      const task = modalState.item;
      if (!task.originalDeadline) {
        task.originalDeadline = task.deadline || '';
      }
      task.deadline = logEntry.newDeadline;
      if (!task.deadlineExtensions) task.deadlineExtensions = [];
      task.deadlineExtensions.push({
        newDeadline: task.deadline,
        reason: logEntry.extensionReason || '',
        date: defaultDate
      });
      await dbPutTask(task);
      await dbAddToSyncQueue('updateItem', {
        action: 'updateItem',
        type: 'Task',
        ...task,
        subtasks: JSON.stringify(task.subtasks || []),
        nextActions: JSON.stringify(task.nextActions || [])
      });
    }

    // 1. Save to IndexedDB immediately (always succeeds)
    await dbAddLog(logEntry);
    invalidateSuggestionCache();
    if (typeof clearReflectionCache === 'function') clearReflectionCache();

    // 2. Queue for sync to Sheets
    await dbAddToSyncQueue('saveLog', {
      action: 'saveLog',
      ...logEntry
    });
    
    // 2.5 Update Today's Plan if this log matches a planned item
    const todayPlan = await dbGetPlanByDate(logEntry.date);
    const planItem = todayPlan.find(p => p.targetName === logEntry.name && p.targetType === logEntry.type && p.status === 'Pending');
    if (planItem && logEntry.status !== 'Extended') {
      await dbCompletePlanItem(planItem.id, logEntry.status);
    }

    // 3. Save reflection entry (strategy / fail analysis) to separate Reflections store
    const reflEntry = {
      date: logEntry.date,
      type: logEntry.type,
      name: logEntry.name,
      status: logEntry.status,
      strategy: '',
      failReason: '',
      betterPlan: '',
      engagedActivity: '',
      synced: false
    };

    if (modalState.type === 'Habit') {
      if (isQuit) {
        if (logEntry.status === 'Done') {
          reflEntry.strategy = logEntry.action ? `Resisted: ${logEntry.action}` : 'Resisted urge';
          if (logEntry.usedReplacementAction === 'Yes') {
            reflEntry.strategy += ` | Used replacement: ${logEntry.replacementAction || 'Yes'}`;
          }
          reflEntry.engagedActivity = logEntry.beforeActivity || '';
        } else if (logEntry.status === 'Partially Done') {
          reflEntry.strategy = logEntry.action ? `Action: ${logEntry.action}` : 'Partially resisted';
          if (logEntry.usedReplacementAction === 'Yes') {
            reflEntry.strategy += ` | Used replacement: ${logEntry.replacementAction || 'Yes'}`;
          }
          reflEntry.engagedActivity = logEntry.beforeActivity || '';
          reflEntry.failReason = [logEntry.physicalState, logEntry.mentalState].filter(Boolean).join(', ');
        } else if (logEntry.status === 'Skipped') {
          reflEntry.failReason = logEntry.action || 'Performed quit behavior';
          reflEntry.engagedActivity = logEntry.beforeActivity || '';
        }
      } else {
        if (logEntry.status === 'Done') {
          reflEntry.strategy = logEntry.action ? `Action: ${logEntry.action}` : 'Completed target';
          reflEntry.engagedActivity = logEntry.beforeActivity || '';
        } else if (logEntry.status === 'Partially Done') {
          reflEntry.strategy = logEntry.action ? `Action: ${logEntry.action}` : 'Partial execution';
          if (logEntry.usedFallback === 'Yes') {
            reflEntry.strategy += ` | Used fallback: ${logEntry.fallbackAction || 'Yes'}`;
          }
          reflEntry.engagedActivity = logEntry.beforeActivity || '';
          reflEntry.failReason = [logEntry.physicalState, logEntry.mentalState].filter(Boolean).join(', ');
        } else if (logEntry.status === 'Skipped') {
          reflEntry.failReason = logEntry.action ? `Did instead: ${logEntry.action}` : 'Skipped';
          reflEntry.engagedActivity = logEntry.beforeActivity || '';
        }
      }
    } else {
      if (logEntry.status === 'Done') {
        reflEntry.strategy = logEntry.completedWork ? `Completed: ${logEntry.completedWork}` : '';
        if (logEntry.outcome) reflEntry.strategy += (reflEntry.strategy ? ' | ' : '') + `Outcome: ${logEntry.outcome}`;
        reflEntry.failReason = logEntry.problemsFaced || '';
        reflEntry.engagedActivity = logEntry.previousActivity || '';
      } else if (logEntry.status === 'Partially Done') {
        reflEntry.strategy = logEntry.completedWork ? `Completed: ${logEntry.completedWork}` : '';
        reflEntry.failReason = logEntry.problemsFaced || logEntry.interruption || '';
        reflEntry.betterPlan = logEntry.remainingWork ? `Remaining: ${logEntry.remainingWork}` : '';
        if (logEntry.duration) {
          reflEntry.strategy = (reflEntry.strategy ? reflEntry.strategy + ' | ' : '') + `Did ${logEntry.duration} min`;
        }
      } else if (logEntry.status === 'Skipped') {
        reflEntry.engagedActivity = logEntry.alternativeActivity || '';
        reflEntry.failReason = logEntry.alternativeActivity ? `Did instead: ${logEntry.alternativeActivity}` : '';
      }
    }

    // Only save reflection if there's meaningful content
    const hasReflection = reflEntry.strategy || reflEntry.failReason || reflEntry.betterPlan || reflEntry.engagedActivity;
    if (hasReflection) {
      await dbAddReflection(reflEntry);
    }

    // 4. Mark one-time tasks as completed
    if (modalState.type === 'Task' && modalState.status === 'Done') {
      const taskItem = modalState.item;
      const isRecurring = taskItem.recurrence && Array.isArray(taskItem.recurrence) && taskItem.recurrence.length > 0;
      if (!isRecurring) {
        taskItem.isCompleted = true;
        await dbPutTask(taskItem);
        await dbAddToSyncQueue('updateItem', {
          action: 'updateItem', type: 'Task', name: taskItem.name, isCompleted: 'true'
        });
      }
    }

    btn.textContent = 'Saved';
    btn.classList.add('saved');

    if (navigator.onLine) {
      showToast(`${modalState.name} logged as ${modalState.status}`);
      syncToSheets();
    } else {
      showToast(`Saved locally — will sync when online`);
    }

    setTimeout(async () => {
      closeModal();
      if (window.location.pathname.includes('plan.html')) {
        const today = todayDateStr();
        const updatedPlan = await dbGetPlanByDate(today);
        const updatedLogs = await dbGetLogsByDate(today);
        renderPlanList(updatedPlan, updatedLogs);
      }
    }, 600);
  } catch (err) {
    btn.textContent = 'Error — Tap to Retry';
    btn.disabled = false;
    console.error('Save failed:', err);
  }
}

/** Handle the item delete button click — offline-first. */
async function handleDeleteItem() {
  if (!confirm(`Are you sure you want to delete "${modalState.name}"? This removes it permanently. Historical logs will be preserved.`)) {
    return;
  }

  const btn = document.getElementById('delete-item-btn');
  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    // 1. Delete from IndexedDB immediately
    if (modalState.type === 'Habit') {
      await dbDeleteHabit(modalState.name);
    } else {
      await dbDeleteTask(modalState.name);
    }

    // 2. Cancel any scheduled notification
    cancelNotificationViaSW(modalState.name);

    // 3. Queue for sync
    await dbAddToSyncQueue('deleteItem', {
      action: 'deleteItem',
      type: modalState.type,
      name: modalState.name
    });

    showToast(`${modalState.name} deleted`);
    closeModal();

    // Re-render the list from IndexedDB
    const isTasksPage = window.location.pathname.includes('tasks.html');
    const isTaskDetails = window.location.pathname.includes('task-details.html');
    
    if (isTaskDetails) {
      window.location.href = 'tasks.html';
      return;
    }
    
    if (isTasksPage) {
      const items = await dbGetAllTasks();
      renderList(items, 'Task', 'list');
    } else {
      const items = await dbGetAllHabits();
      renderList(items, 'Habit', 'list');
    }

    await updateClientReminders();

    // Sync in background
    if (navigator.onLine) syncToSheets();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Delete';
    console.error('Delete failed:', err);
  }
}

/** Wire up all modal event listeners. Called once on page load. */
function initModal() {
  const overlay = document.getElementById('modal-overlay');
  
  if (overlay) {
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  // Status buttons — v4 behavioral logging
  document.querySelectorAll('.status-btn').forEach((btn) => {
    if (btn.id.startsWith('subtask-')) return;
    
    btn.addEventListener('click', () => {
      // Clear all active states for main buttons
      document.querySelectorAll('.status-btn').forEach((b) => {
        if (!b.id.startsWith('subtask-')) b.className = 'status-btn';
      });

      // Set active state with status-specific class
      const status = btn.dataset.status;
      const statusClass = status.toLowerCase().replace(/\s+/g, '-');
      btn.classList.add(`active-${statusClass}`);
      modalState.status = status;

      // Quick log tip visibility
      const quickTip = document.getElementById('quick-log-tip');
      const quickTipText = document.getElementById('quick-log-tip-text');
      if (quickTip) {
        if (status === 'Done') {
          quickTip.style.display = 'flex';
          if (quickTipText) {
            quickTipText.textContent = (modalState.type === 'Habit' && modalState.behaviorType === 'Bad')
              ? 'Urge resisted! Ready to save, or add details below.'
              : 'Completed! Ready to save, or add details below.';
          }
        } else {
          quickTip.style.display = 'none';
        }
      }

      // Show the appropriate behavioral section
      showBehavioralSection(status, modalState.type, modalState.behaviorType);
      updateSaveButton();

      // Load smart suggestions from past entries
      loadSuggestionsForStatus(status, modalState.type, modalState.name);
    });
  });

  // Optional field toggles
  ['done', 'partial', 'skipped', 'resist'].forEach(section => {
    const toggle = document.getElementById(`${section}-optional-toggle`);
    const fields = document.getElementById(`${section}-optional-fields`);
    if (toggle && fields) {
      toggle.addEventListener('click', () => {
        const isVisible = fields.classList.contains('visible');
        fields.classList.toggle('visible');
        toggle.textContent = isVisible ? '▸ Optional details' : '▾ Optional details';
      });
    }
  });

  // Task modal deadline extension toggles
  const logPartialExtToggle = document.getElementById('log-partial-extend-toggle');
  const logPartialExtFields = document.getElementById('log-partial-extend-fields');
  if (logPartialExtToggle && logPartialExtFields) {
    logPartialExtToggle.addEventListener('change', () => {
      logPartialExtFields.style.display = logPartialExtToggle.checked ? 'block' : 'none';
    });
  }
  const logSkippedExtToggle = document.getElementById('log-skipped-extend-toggle');
  const logSkippedExtFields = document.getElementById('log-skipped-extend-fields');
  if (logSkippedExtToggle && logSkippedExtFields) {
    logSkippedExtToggle.addEventListener('change', () => {
      logSkippedExtFields.style.display = logSkippedExtToggle.checked ? 'block' : 'none';
    });
  }

  // Notes toggle button
  const toggleNotesBtn = document.getElementById('toggle-notes-btn');
  if (toggleNotesBtn) {
    toggleNotesBtn.addEventListener('click', () => {
      const notesField = document.getElementById('notes');
      if (notesField) {
        const isHidden = notesField.classList.contains('hidden');
        if (isHidden) {
          notesField.classList.remove('hidden');
          toggleNotesBtn.textContent = '− Hide Notes';
          notesField.focus();
        } else {
          notesField.classList.add('hidden');
          toggleNotesBtn.textContent = '+ Add Notes';
        }
      }
    });
  }

  // Save button
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.addEventListener('click', handleSave);

  // Fallback buttons (Growth Habits)
  const fallbackYes = document.getElementById('fallback-opt-yes');
  const fallbackNo = document.getElementById('fallback-opt-no');
  if (fallbackYes && fallbackNo) {
    fallbackYes.addEventListener('click', () => {
      modalState.usedFallback = true;
      fallbackYes.classList.add('active');
      fallbackNo.classList.remove('active');
      const actualInput = document.getElementById('log-partial-habit-completed');
      if (actualInput && modalState.fallbackAction) {
        actualInput.value = modalState.fallbackAction;
      }
    });
    fallbackNo.addEventListener('click', () => {
      modalState.usedFallback = false;
      fallbackNo.classList.add('active');
      fallbackYes.classList.remove('active');
    });
  }

  // Replacement buttons (Quit Habits - Partially Resisted)
  const quitPartialReplBtn = document.getElementById('quit-partial-use-replacement-btn');
  const quitPartialReplYes = document.getElementById('quit-partial-repl-yes');
  const quitPartialReplNo = document.getElementById('quit-partial-repl-no');
  if (quitPartialReplBtn) {
    quitPartialReplBtn.addEventListener('click', () => {
      modalState.usedReplacementAction = true;
      if (quitPartialReplYes) quitPartialReplYes.classList.add('active');
      if (quitPartialReplNo) quitPartialReplNo.classList.remove('active');
      const resistInput = document.getElementById('log-quit-partial-resist');
      if (resistInput && modalState.replacementAction) {
        resistInput.value = modalState.replacementAction;
      }
    });
  }
  if (quitPartialReplYes && quitPartialReplNo) {
    quitPartialReplYes.addEventListener('click', () => {
      modalState.usedReplacementAction = true;
      quitPartialReplYes.classList.add('active');
      quitPartialReplNo.classList.remove('active');
      const resistInput = document.getElementById('log-quit-partial-resist');
      if (resistInput && !resistInput.value.trim() && modalState.replacementAction) {
        resistInput.value = modalState.replacementAction;
      }
    });
    quitPartialReplNo.addEventListener('click', () => {
      modalState.usedReplacementAction = false;
      quitPartialReplNo.classList.add('active');
      quitPartialReplYes.classList.remove('active');
    });
  }

  // Replacement buttons (Quit Habits - Resisted)
  const resistReplBtn = document.getElementById('resist-use-replacement-btn');
  const resistReplYes = document.getElementById('resist-repl-yes');
  const resistReplNo = document.getElementById('resist-repl-no');
  if (resistReplBtn) {
    resistReplBtn.addEventListener('click', () => {
      modalState.usedReplacementAction = true;
      if (resistReplYes) resistReplYes.classList.add('active');
      if (resistReplNo) resistReplNo.classList.remove('active');
      const resistInput = document.getElementById('resist-activity');
      if (resistInput && modalState.replacementAction) {
        resistInput.value = modalState.replacementAction;
      }
    });
  }
  if (resistReplYes && resistReplNo) {
    resistReplYes.addEventListener('click', () => {
      modalState.usedReplacementAction = true;
      resistReplYes.classList.add('active');
      resistReplNo.classList.remove('active');
      const resistInput = document.getElementById('resist-activity');
      if (resistInput && !resistInput.value.trim() && modalState.replacementAction) {
        resistInput.value = modalState.replacementAction;
      }
    });
    resistReplNo.addEventListener('click', () => {
      modalState.usedReplacementAction = false;
      resistReplNo.classList.add('active');
      resistReplYes.classList.remove('active');
    });
  }

  // Habit Logging: Place toggle
  const habitPlaceToggle = document.getElementById('habit-place-toggle');
  const habitPlaceFields = document.getElementById('habit-place-fields');
  if (habitPlaceToggle && habitPlaceFields) {
    habitPlaceToggle.addEventListener('click', () => {
      const isHidden = habitPlaceFields.style.display === 'none' || !habitPlaceFields.style.display;
      habitPlaceFields.style.display = isHidden ? 'block' : 'none';
      habitPlaceToggle.textContent = isHidden ? '▾ Hide Place' : '▸ Optional: Add Place';
    });
  }

  // Habit Logging: Fallback controls (Growth Habit Partial)
  const habitUseFallbackBtn = document.getElementById('habit-use-fallback-btn');
  const habitFallbackYes = document.getElementById('habit-fallback-yes');
  const habitFallbackNo = document.getElementById('habit-fallback-no');
  if (habitUseFallbackBtn) {
    habitUseFallbackBtn.addEventListener('click', () => {
      modalState.usedFallback = true;
      if (habitFallbackYes) habitFallbackYes.classList.add('active');
      if (habitFallbackNo) habitFallbackNo.classList.remove('active');
      const actionInput = document.getElementById('log-habit-action');
      if (actionInput && modalState.fallbackAction) {
        actionInput.value = modalState.fallbackAction;
      }
    });
  }
  if (habitFallbackYes && habitFallbackNo) {
    habitFallbackYes.addEventListener('click', () => {
      modalState.usedFallback = true;
      habitFallbackYes.classList.add('active');
      habitFallbackNo.classList.remove('active');
      const actionInput = document.getElementById('log-habit-action');
      if (actionInput && !actionInput.value.trim() && modalState.fallbackAction) {
        actionInput.value = modalState.fallbackAction;
      }
    });
    habitFallbackNo.addEventListener('click', () => {
      modalState.usedFallback = false;
      habitFallbackNo.classList.add('active');
      habitFallbackYes.classList.remove('active');
    });
  }

  // Habit Logging: Replacement controls (Quit Habit Resisted / Partially Resisted)
  const habitUseReplBtn = document.getElementById('habit-use-replacement-btn');
  const habitReplYes = document.getElementById('habit-replacement-yes');
  const habitReplNo = document.getElementById('habit-replacement-no');
  if (habitUseReplBtn) {
    habitUseReplBtn.addEventListener('click', () => {
      modalState.usedReplacementAction = true;
      if (habitReplYes) habitReplYes.classList.add('active');
      if (habitReplNo) habitReplNo.classList.remove('active');
      const actionInput = document.getElementById('log-habit-action');
      if (actionInput && modalState.replacementAction) {
        actionInput.value = modalState.replacementAction;
      }
    });
  }
  if (habitReplYes && habitReplNo) {
    habitReplYes.addEventListener('click', () => {
      modalState.usedReplacementAction = true;
      habitReplYes.classList.add('active');
      habitReplNo.classList.remove('active');
      const actionInput = document.getElementById('log-habit-action');
      if (actionInput && !actionInput.value.trim() && modalState.replacementAction) {
        actionInput.value = modalState.replacementAction;
      }
    });
    habitReplNo.addEventListener('click', () => {
      modalState.usedReplacementAction = false;
      habitReplNo.classList.add('active');
      habitReplYes.classList.remove('active');
    });
  }

  // Edit button
  const editBtn = document.getElementById('edit-item-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (modalState.item) {
        closeModal();
        openEditItemModal(modalState.item, modalState.type);
      }
    });
  }

  // Delete button
  const delBtn = document.getElementById('delete-item-btn');
  if (delBtn) delBtn.addEventListener('click', handleDeleteItem);

  // Plan Task button
  const planTaskBtn = document.getElementById('plan-task-btn');
  if (planTaskBtn) {
    planTaskBtn.addEventListener('click', () => {
      if (modalState.item) {
        closeModal();
        window.location.href = `plan.html?addTask=${encodeURIComponent(modalState.item.name)}`;
      }
    });
  }

  // Link habit button
  const linkBtn = document.getElementById('link-habit-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', () => {
      if (modalState.item && modalState.type === 'Habit') {
        openLinkHabitModal(modalState.item);
      }
    });
  }

  // Subtask dropdown toggle & preference checkbox
  const subtaskToggle = document.getElementById('subtask-dropdown-toggle');
  const subtaskContainer = document.getElementById('subtask-creation-container');
  if (subtaskToggle && subtaskContainer) {
    subtaskToggle.addEventListener('click', () => {
      const isHidden = subtaskContainer.style.display === 'none' || !subtaskContainer.style.display;
      subtaskContainer.style.display = isHidden ? 'block' : 'none';
      subtaskToggle.textContent = isHidden ? '▾ Create Subtask' : '▸ Create Subtask';
    });
  }

  const subtaskCheckbox = document.getElementById('dont-show-subtask-checkbox');
  if (subtaskCheckbox) {
    subtaskCheckbox.checked = localStorage.getItem('dontShowSubtaskPrompt') === 'true';
    subtaskCheckbox.addEventListener('change', (e) => {
      localStorage.setItem('dontShowSubtaskPrompt', e.target.checked ? 'true' : 'false');
      if (e.target.checked && subtaskContainer) {
        subtaskContainer.style.display = 'none';
        if (subtaskToggle) subtaskToggle.textContent = '▸ Create Subtask';
      }
    });
  }
}

// ============================================================
// Habit Chain — Link Modal
// ============================================================

let _linkHabitDirection = ''; // 'before' or 'after'
let _linkHabitTarget = null;

async function openLinkHabitModal(habit) {
  _linkHabitTarget = habit;
  const overlay = document.getElementById('link-habit-overlay');
  if (!overlay) return;

  const currentDisplay = document.getElementById('current-chain-display');
  if (currentDisplay) {
    let html = '';
    if (habit.prevHabit) html += `<p style="font-size:0.85rem;color:var(--text-secondary);"><span style="color:var(--text-tertiary);font-size:0.75rem;text-transform:uppercase;font-weight:600;letter-spacing:0.04em;">Previous:</span> <strong>${habit.prevHabit}</strong></p>`;
    if (habit.nextHabit) html += `<p style="font-size:0.85rem;color:var(--text-secondary);"><span style="color:var(--text-tertiary);font-size:0.75rem;text-transform:uppercase;font-weight:600;letter-spacing:0.04em;">Next:</span> <strong>${habit.nextHabit}</strong></p>`;
    if (!habit.prevHabit && !habit.nextHabit) html = '<p style="font-size:0.85rem;color:var(--text-tertiary);">No links yet.</p>';
    currentDisplay.innerHTML = html;
  }

  // Show remove button if links exist
  const removeBtn = document.getElementById('link-habit-remove');
  if (removeBtn) {
    removeBtn.classList.toggle('hidden', !habit.prevHabit && !habit.nextHabit);
  }

  // Hide list and save initially
  const list = document.getElementById('link-habit-list');
  const saveBtn = document.getElementById('link-habit-save');
  if (list) list.classList.add('hidden');
  if (saveBtn) saveBtn.classList.add('hidden');

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function initLinkHabitModal() {
  const overlay = document.getElementById('link-habit-overlay');
  if (!overlay) return;

  const closeBtn = document.getElementById('link-habit-close');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  const beforeBtn = document.getElementById('link-before-btn');
  const afterBtn = document.getElementById('link-after-btn');

  async function showHabitList(direction) {
    _linkHabitDirection = direction;
    const habits = await dbGetAllHabits();
    const list = document.getElementById('link-habit-list');
    const saveBtn = document.getElementById('link-habit-save');
    if (!list) return;

    list.innerHTML = '';
    list.classList.remove('hidden');
    if (saveBtn) saveBtn.classList.remove('hidden');

    const filtered = habits.filter(h => h.name !== _linkHabitTarget.name);
    if (filtered.length === 0) {
      list.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.85rem;">No other habits to link.</p>';
      return;
    }

    filtered.forEach(h => {
      const btn = document.createElement('button');
      btn.className = 'chain-select-item';
      btn.textContent = h.name;
      btn.addEventListener('click', () => {
        list.querySelectorAll('.chain-select-item').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      list.appendChild(btn);
    });
  }

  if (beforeBtn) beforeBtn.addEventListener('click', () => showHabitList('before'));
  if (afterBtn) afterBtn.addEventListener('click', () => showHabitList('after'));

  const saveBtn = document.getElementById('link-habit-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const selected = document.querySelector('.chain-select-item.selected');
      if (!selected || !_linkHabitTarget) return;

      const linkedName = selected.textContent;

      const allHabits = await dbGetAllHabits();
      const itemsToUpdate = new Map();
      itemsToUpdate.set(_linkHabitTarget.name, _linkHabitTarget);
      
      const clearCounterpart = (habitName, directionToClear) => {
          if (!habitName) return;
          let h = itemsToUpdate.get(habitName) || allHabits.find(x => x.name === habitName);
          if (h) {
              if (directionToClear === 'before') h.prevHabit = h.prevHabit === _linkHabitTarget.name ? '' : h.prevHabit;
              if (directionToClear === 'after') h.nextHabit = h.nextHabit === _linkHabitTarget.name ? '' : h.nextHabit;
              itemsToUpdate.set(h.name, h);
          }
      };

      if (_linkHabitDirection === 'before') {
        if (_linkHabitTarget.prevHabit && _linkHabitTarget.prevHabit !== linkedName) {
            clearCounterpart(_linkHabitTarget.prevHabit, 'after');
        }
        if (_linkHabitTarget.nextHabit === linkedName) {
            _linkHabitTarget.nextHabit = '';
            clearCounterpart(linkedName, 'before');
        }
        _linkHabitTarget.prevHabit = linkedName;
        let linkedHabit = itemsToUpdate.get(linkedName) || allHabits.find(h => h.name === linkedName);
        if (linkedHabit) {
            linkedHabit.nextHabit = _linkHabitTarget.name;
            itemsToUpdate.set(linkedHabit.name, linkedHabit);
        }
      } else {
        if (_linkHabitTarget.nextHabit && _linkHabitTarget.nextHabit !== linkedName) {
            clearCounterpart(_linkHabitTarget.nextHabit, 'before');
        }
        if (_linkHabitTarget.prevHabit === linkedName) {
            _linkHabitTarget.prevHabit = '';
            clearCounterpart(linkedName, 'after');
        }
        _linkHabitTarget.nextHabit = linkedName;
        let linkedHabit = itemsToUpdate.get(linkedName) || allHabits.find(h => h.name === linkedName);
        if (linkedHabit) {
            linkedHabit.prevHabit = _linkHabitTarget.name;
            itemsToUpdate.set(linkedHabit.name, linkedHabit);
        }
      }

      for (const [name, h] of itemsToUpdate.entries()) {
          await dbPutHabit(h);
          await dbAddToSyncQueue('updateItem', {
              action: 'updateItem', type: 'Habit', name: h.name,
              prevHabit: h.prevHabit || '',
              nextHabit: h.nextHabit || ''
          });
      }

      if (navigator.onLine) syncToSheets();
      showToast('Habit linked!');
      overlay.classList.remove('active');
      document.body.style.overflow = '';

      // Refresh list
      const items = await dbGetAllHabits();
      renderList(items, 'Habit', 'list');
    });
  }

  const removeBtn = document.getElementById('link-habit-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      if (!_linkHabitTarget) return;
      const oldPrev = _linkHabitTarget.prevHabit;
      const oldNext = _linkHabitTarget.nextHabit;
      _linkHabitTarget.prevHabit = '';
      _linkHabitTarget.nextHabit = '';

      await dbPutHabit(_linkHabitTarget);
      await dbAddToSyncQueue('updateItem', {
        action: 'updateItem', type: 'Habit', name: _linkHabitTarget.name,
        prevHabit: '', nextHabit: ''
      });

      const allHabits = await dbGetAllHabits();
      if (oldPrev) {
        const p = allHabits.find(h => h.name === oldPrev);
        if (p) {
          p.nextHabit = p.nextHabit === _linkHabitTarget.name ? '' : p.nextHabit;
          await dbPutHabit(p);
          await dbAddToSyncQueue('updateItem', { action: 'updateItem', type: 'Habit', name: p.name, prevHabit: p.prevHabit || '', nextHabit: p.nextHabit || '' });
        }
      }
      if (oldNext) {
        const n = allHabits.find(h => h.name === oldNext);
        if (n) {
          n.prevHabit = n.prevHabit === _linkHabitTarget.name ? '' : n.prevHabit;
          await dbPutHabit(n);
          await dbAddToSyncQueue('updateItem', { action: 'updateItem', type: 'Habit', name: n.name, prevHabit: n.prevHabit || '', nextHabit: n.nextHabit || '' });
        }
      }

      if (navigator.onLine) syncToSheets();
      showToast('Links removed');
      overlay.classList.remove('active');
      document.body.style.overflow = '';

      const items = await dbGetAllHabits();
      renderList(items, 'Habit', 'list');
    });
  }
}

// ============================================================
// Toast Notification
// ============================================================

/** Show a brief toast message at the bottom of the screen. */
function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// ============================================================
// Page Initializers — Offline-First Pattern
// ============================================================

/**
 * Load and display habits (index.html).
 */
async function initHabitsPage() {
  const loading = document.getElementById('loading');

  try {
    await dbInit();
    const hasData = await dbHasData();

    if (!hasData && navigator.onLine && API_URL) {
      loading.innerHTML = '<div class="loading-spinner"></div><p>Restoring data from cloud…</p>';
      await restoreFromSheets();
    } else if (!hasData && !navigator.onLine) {
      loading.classList.add('hidden');
      renderList([], 'Habit', 'list');
      return;
    }

    const items = await dbGetAllHabits();
    loading.classList.add('hidden');
    renderList(items, 'Habit', 'list');

    // Schedule active notification reminders via SW
    if (items && Array.isArray(items)) {
      items.forEach((item) => {
        if (item.remind && item.time) {
          scheduleNotificationViaSW(item.name, item.time, 'Habit');
        }
      });
    }

    // Background sync
    if (navigator.onLine && API_URL) {
      syncToSheets();
    }
  } catch (err) {
    loading.innerHTML = '<p>Could not load habits.<br>Check your connection.</p>';
    console.error(err);
  }
}

/**
 * Load and display tasks (tasks.html).
 */
async function initTasksPage() {
  const loading = document.getElementById('loading');

  try {
    await dbInit();
    const hasData = await dbHasData();

    if (!hasData && navigator.onLine && API_URL) {
      loading.innerHTML = '<div class="loading-spinner"></div><p>Restoring data from cloud…</p>';
      await restoreFromSheets();
    } else if (!hasData && !navigator.onLine) {
      loading.classList.add('hidden');
      renderList([], 'Task', 'list');
      return;
    }

    const items = await dbGetAllTasks();
    loading.classList.add('hidden');
    renderList(items, 'Task', 'list');

    // Initialize subtask and next action modal controls on tasks page
    initSubtaskAddButton();
    initActionAddButton();

    // Schedule active notification reminders via SW
    if (items && Array.isArray(items)) {
      items.forEach((item) => {
        if (item.remind && item.time) {
          scheduleNotificationViaSW(item.name, item.time, 'Task');
        }
      });
    }

    // Check if a specific task was requested via URL query param
    const urlParams = new URLSearchParams(window.location.search);
    const taskParam = urlParams.get('task');
    if (taskParam && items) {
      const targetTask = items.find(t => t.name === taskParam);
      if (targetTask) {
        window.location.replace(`task-details.html?task=${encodeURIComponent(taskParam)}`);
        return;
      }
    }

    // Background sync
    if (navigator.onLine && API_URL) {
      syncToSheets();
    }
  } catch (err) {
    loading.innerHTML = '<p>Could not load tasks.<br>Check your connection.</p>';
    console.error(err);
  }
}

// ============================================================
// Today's Plan Page (Checklist + Lightweight Timeline Architecture)
// ============================================================

let _currentPlanItem = null;
let _selectedAddMode = 'focus';
let _selectedAlterMode = 'focus';

// ============================================================
// Focus Execution Timer & Time Selection Component
// ============================================================
let _timerState = 'inactive'; // 'inactive' | 'running' | 'paused'
let _timerSeconds = 0;
let _timerInterval = null;
let _timerTask = null; // { name, type, startTime, endTime }
let _timerStartedAt = null;

/**
 * Configure an interactive time selector with presets and live duration badge.
 */
function setupTimeSelector(startInputId, endInputId, badgeId, presetsContainerId, onChangeCallback) {
  const startEl = document.getElementById(startInputId);
  const endEl = document.getElementById(endInputId);
  const badgeEl = document.getElementById(badgeId);
  const presetsEl = document.getElementById(presetsContainerId);
  if (!startEl || !endEl) return null;

  function updateDurationBadge() {
    const start = startEl.value;
    const end = endEl.value;
    if (badgeEl) {
      if (!start && !end) {
        badgeEl.textContent = 'Flexible / Anytime';
        badgeEl.classList.remove('active');
      } else if (start && !end) {
        badgeEl.textContent = `Starts at ${formatTimeForDisplay(start)}`;
        badgeEl.classList.add('active');
      } else if (start && end) {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
        if (diff < 0) diff += 1440;
        const hrs = Math.floor(diff / 60);
        const mins = diff % 60;
        let durText = '';
        if (hrs > 0 && mins > 0) durText = `${hrs}h ${mins}m`;
        else if (hrs > 0) durText = `${hrs} hr${hrs > 1 ? 's' : ''}`;
        else durText = `${mins} mins`;
        badgeEl.textContent = durText;
        badgeEl.classList.add('active');
      }
    }
    if (onChangeCallback) onChangeCallback(start, end);
  }

  startEl.oninput = updateDurationBadge;
  endEl.oninput = updateDurationBadge;

  if (presetsEl) {
    presetsEl.querySelectorAll('.time-preset-chip').forEach(chip => {
      chip.onclick = (e) => {
        e.preventDefault();
        const preset = chip.dataset.preset;
        const now = new Date();
        const curH = now.getHours();
        const curM = Math.round(now.getMinutes() / 5) * 5;
        now.setHours(curH, curM, 0, 0);

        if (preset === 'now-30') {
          const startStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          const endD = new Date(now.getTime() + 30 * 60000);
          const endStr = endD.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          startEl.value = startStr;
          endEl.value = endStr;
        } else if (preset === 'now-60') {
          const startStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          const endD = new Date(now.getTime() + 60 * 60000);
          const endStr = endD.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          startEl.value = startStr;
          endEl.value = endStr;
        } else if (preset === 'morning') {
          startEl.value = '09:00';
          endEl.value = '10:00';
        } else if (preset === 'afternoon') {
          startEl.value = '14:00';
          endEl.value = '15:00';
        } else if (preset === 'evening') {
          startEl.value = '19:00';
          endEl.value = '20:00';
        } else if (preset === 'plus-15' || preset === 'plus-30' || preset === 'plus-60') {
          const addMin = preset === 'plus-15' ? 15 : (preset === 'plus-30' ? 30 : 60);
          let baseStart = startEl.value;
          if (!baseStart) {
            baseStart = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          }
          const [bsh, bsm] = baseStart.split(':').map(Number);
          const dStart = new Date();
          dStart.setHours(bsh, (bsm || 0) + addMin, 0, 0);
          startEl.value = dStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          
          if (endEl.value) {
            const [beh, bem] = endEl.value.split(':').map(Number);
            const dEnd = new Date();
            dEnd.setHours(beh, (bem || 0) + addMin, 0, 0);
            endEl.value = dEnd.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          } else {
            const dEnd = new Date(dStart.getTime() + 30 * 60000);
            endEl.value = dEnd.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          }
        } else if (preset === 'clear') {
          startEl.value = '';
          endEl.value = '';
        }
        updateDurationBadge();
      };
    });
  }

  updateDurationBadge();
  return updateDurationBadge;
}

function updateTimerUI() {
  const digitsEl = document.getElementById('timer-digits');
  const badgeEl = document.getElementById('timer-state-badge');
  const cardEl = document.getElementById('plan-timer-card');
  const taskNameEl = document.getElementById('timer-task-name');
  const taskPlannedEl = document.getElementById('timer-task-planned');
  const startBtn = document.getElementById('timer-start-btn');
  const pauseBtn = document.getElementById('timer-pause-btn');
  const resumeBtn = document.getElementById('timer-resume-btn');
  const resetBtn = document.getElementById('timer-reset-btn');
  const finishBtn = document.getElementById('timer-finish-btn');
  const subtextEl = document.getElementById('timer-subtext');

  if (!digitsEl) return;

  const hrs = Math.floor(_timerSeconds / 3600);
  const mins = Math.floor((_timerSeconds % 3600) / 60);
  const secs = _timerSeconds % 60;
  digitsEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (_timerTask && _timerTask.name) {
    if (taskNameEl) taskNameEl.textContent = _timerTask.name;
    if (taskPlannedEl) {
      taskPlannedEl.textContent = _timerTask.startTime 
        ? `Scheduled: ${formatTimeForDisplay(_timerTask.startTime)}${_timerTask.endTime ? ` - ${formatTimeForDisplay(_timerTask.endTime)}` : ''}` 
        : 'Flexible planned task';
    }
  } else {
    if (taskNameEl) taskNameEl.textContent = 'Focus Execution Timer';
    if (taskPlannedEl) taskPlannedEl.textContent = 'Track real-time work on scheduled tasks';
  }

  if (_timerState === 'running') {
    if (cardEl) { cardEl.classList.add('running'); cardEl.classList.remove('paused'); }
    if (badgeEl) { badgeEl.className = 'timer-badge running'; badgeEl.textContent = 'Focusing'; }
    if (subtextEl) subtextEl.textContent = 'Focus session in progress — stay in flow';
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'inline-flex';
    if (resumeBtn) resumeBtn.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    if (finishBtn) finishBtn.style.display = 'inline-flex';
  } else if (_timerState === 'paused') {
    if (cardEl) { cardEl.classList.remove('running'); cardEl.classList.add('paused'); }
    if (badgeEl) { badgeEl.className = 'timer-badge paused'; badgeEl.textContent = 'Paused'; }
    if (subtextEl) subtextEl.textContent = 'Timer paused. Take a breath and resume when ready';
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'inline-flex';
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    if (finishBtn) finishBtn.style.display = 'inline-flex';
  } else {
    if (cardEl) { cardEl.classList.remove('running', 'paused'); }
    if (badgeEl) { badgeEl.className = 'timer-badge inactive'; badgeEl.textContent = 'Ready'; }
    if (subtextEl) subtextEl.textContent = 'Click Start or select a task from timeline to begin';
    if (startBtn) startBtn.style.display = 'inline-flex';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'none';
  }
}

function initPlanTimer(planItems) {
  const startBtn = document.getElementById('timer-start-btn');
  const pauseBtn = document.getElementById('timer-pause-btn');
  const resumeBtn = document.getElementById('timer-resume-btn');
  const resetBtn = document.getElementById('timer-reset-btn');
  const finishBtn = document.getElementById('timer-finish-btn');

  if (!startBtn) return;

  if (!_timerTask && planItems && planItems.length > 0) {
    const firstPending = planItems.find(p => p.status !== 'Completed');
    if (firstPending) {
      _timerTask = {
        name: firstPending.targetName,
        type: firstPending.targetType || 'Task',
        startTime: firstPending.currentStartTime,
        endTime: firstPending.currentEndTime
      };
    }
  }

  updateTimerUI();

  startBtn.onclick = () => {
    _timerState = 'running';
    _timerStartedAt = new Date();
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(() => {
      _timerSeconds++;
      updateTimerUI();
    }, 1000);
    updateTimerUI();
  };

  if (pauseBtn) {
    pauseBtn.onclick = () => {
      _timerState = 'paused';
      if (_timerInterval) clearInterval(_timerInterval);
      updateTimerUI();
    };
  }

  if (resumeBtn) {
    resumeBtn.onclick = () => {
      _timerState = 'running';
      if (_timerInterval) clearInterval(_timerInterval);
      _timerInterval = setInterval(() => {
        _timerSeconds++;
        updateTimerUI();
      }, 1000);
      updateTimerUI();
    };
  }

  if (resetBtn) {
    resetBtn.onclick = () => {
      if (_timerInterval) clearInterval(_timerInterval);
      _timerSeconds = 0;
      _timerState = 'inactive';
      updateTimerUI();
    };
  }

  if (finishBtn) {
    finishBtn.onclick = async () => {
      if (_timerInterval) clearInterval(_timerInterval);
      const elapsedSec = _timerSeconds;
      const elapsedMins = Math.max(1, Math.round(elapsedSec / 60));
      const now = new Date();
      const endTimeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const startTimeStr = _timerStartedAt ? _timerStartedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : endTimeStr;
      const taskName = _timerTask ? _timerTask.name : (document.getElementById('plan-item-select')?.value?.split(':')?.[1] || '');

      _timerSeconds = 0;
      _timerState = 'inactive';
      updateTimerUI();

      if (taskName) {
        await triggerTaskLogFlow(taskName);
        const durInput = document.getElementById('activity-duration') || document.getElementById('log-duration');
        if (durInput) durInput.value = elapsedMins;
        const sInput = document.getElementById('activity-start-time') || document.getElementById('log-done-time');
        if (sInput) sInput.value = startTimeStr;
        const eInput = document.getElementById('activity-end-time');
        if (eInput) eInput.value = endTimeStr;
        const doneBtn = document.getElementById('status-btn-done');
        if (doneBtn) doneBtn.click();
      } else {
        showToast(`Focus session logged (${elapsedMins} mins)`);
      }
    };
  }
}


/**
 * Calculate factual plan analytics without speculative behavioral inferences.
 */
function calculatePlanAnalytics(planItems, todayLogs, targetDate = (typeof _planSelectedDate !== 'undefined' ? _planSelectedDate : todayDateStr())) {
  const total = planItems.length;
  if (total === 0) {
    return { total: 0, completed: 0, partial: 0, skipped: 0, notLogged: 0, inProgress: 0, planned: 0, rescheduled: 0, adherencePct: 0 };
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const todayStr = todayDateStr();
  const isPast = targetDate < todayStr;
  const isFuture = targetDate > todayStr;

  let completed = 0;
  let partial = 0;
  let skipped = 0;
  let notLogged = 0;
  let inProgress = 0;
  let planned = 0;
  let rescheduled = 0;

  planItems.forEach(p => {
    if ((p.rescheduleCount && p.rescheduleCount > 0) || (p.changeLog && p.changeLog.length > 0)) {
      rescheduled++;
    }

    const log = todayLogs.find(l => l.name === p.targetName && (l.type === p.targetType || (!l.type && p.targetType === 'Task')));
    if (log) {
      if (log.status === 'Done') completed++;
      else if (log.status === 'Partially Done') partial++;
      else if (log.status === 'Skipped') skipped++;
    } else {
      if (isPast) {
        notLogged++;
      } else if (isFuture) {
        planned++;
      } else {
        if (p.currentStartTime) {
          const [h, m] = p.currentStartTime.split(':').map(Number);
          const startMinutes = h * 60 + (m || 0);
          let endMinutes = startMinutes + 30;
          if (p.currentEndTime) {
            const [eh, em] = p.currentEndTime.split(':').map(Number);
            endMinutes = eh * 60 + (em || 0);
          }

          if (currentMinutes > endMinutes) {
            notLogged++;
          } else if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
            inProgress++;
          } else {
            planned++;
          }
        } else {
          planned++;
        }
      }
    }
  });

  const adherencePct = total > 0 ? Math.round(((completed + partial * 0.5) / total) * 100) : 0;
  return { total, completed, partial, skipped, notLogged, inProgress, planned, rescheduled, adherencePct };
}

/**
 * Determine single-source-of-truth status and display strings for a plan item.
 */
function getPlanItemState(plan, todayLogs, targetDate = (typeof _planSelectedDate !== 'undefined' ? _planSelectedDate : todayDateStr())) {
  const log = todayLogs.find(l => l.name === plan.targetName && (l.type === plan.targetType || (!l.type && plan.targetType === 'Task')));
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const todayStr = todayDateStr();
  const isPast = targetDate < todayStr;
  const isFuture = targetDate > todayStr;

  let startMinutes = null;
  let endMinutes = null;
  if (plan.currentStartTime) {
    const [h, m] = plan.currentStartTime.split(':').map(Number);
    startMinutes = h * 60 + (m || 0);
    endMinutes = startMinutes + 30;
    if (plan.currentEndTime) {
      const [eh, em] = plan.currentEndTime.split(':').map(Number);
      endMinutes = eh * 60 + (em || 0);
    }
  }

  let state = 'Planned';
  let badgeClass = 'pending';
  let badgeIcon = icons.calendar;
  let badgeText = 'Planned';
  let actualTimeText = '';

  if (log) {
    if (log.status === 'Done') {
      state = 'Completed';
      badgeClass = 'done';
      badgeIcon = icons.check;
      badgeText = 'Completed';
    } else if (log.status === 'Partially Done') {
      state = 'Partially completed';
      badgeClass = 'partial';
      badgeIcon = icons.partial;
      badgeText = 'Partially Done';
    } else if (log.status === 'Skipped') {
      state = 'Skipped';
      badgeClass = 'skipped';
      badgeIcon = icons.skip;
      badgeText = 'Skipped';
    }

    const startTime = log.activityStartTime || log.time || '';
    const endTime = log.activityEndTime || '';
    const dur = log.duration ? `${log.duration}m` : '';
    if (startTime && endTime) {
      actualTimeText = `Actual: ${formatTimeForDisplay(startTime)} – ${formatTimeForDisplay(endTime)}${dur ? ` (${dur})` : ''}`;
    } else if (startTime) {
      actualTimeText = `Actual: Started at ${formatTimeForDisplay(startTime)}${dur ? ` (${dur})` : ''}`;
    } else if (dur) {
      actualTimeText = `Actual: ${dur}`;
    }
  } else {
    if (isPast) {
      state = 'Not logged';
      badgeClass = 'not-logged';
      badgeIcon = icons.alert;
      badgeText = 'Not Logged';
    } else if (isFuture) {
      state = 'Planned';
      badgeClass = 'pending';
      badgeIcon = icons.calendar;
      badgeText = 'Planned';
    } else {
      if (startMinutes !== null) {
        if (currentMinutes > endMinutes) {
          state = 'Not logged';
          badgeClass = 'not-logged';
          badgeIcon = icons.alert;
          badgeText = 'Not Logged';
        } else if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
          state = 'In progress / focus now';
          badgeClass = 'focus-now';
          badgeIcon = plan.mode === 'parallel' ? icons.parallel : icons.focus;
          badgeText = plan.mode === 'parallel' ? 'In Progress' : 'Focus Now';
        } else {
          state = 'Planned';
          badgeClass = 'pending';
          badgeIcon = icons.calendar;
          badgeText = 'Planned';
        }
      }
    }
  }

  const isRescheduled = (plan.rescheduleCount && plan.rescheduleCount > 0) || (plan.changeLog && plan.changeLog.length > 0);
  const isFocusNow = (!isPast && !isFuture && state === 'In progress / focus now');

  return { state, badgeClass, badgeIcon, badgeText, actualTimeText, isRescheduled, isFocusNow, log };
}

// Global Plan State
let _planSelectedDate = todayDateStr();
let _planCurrentView = 'day';

function updatePlanDateDisplay() {
  const dayLabel = document.getElementById('plan-current-day-label');
  const dateSub = document.getElementById('plan-current-date-sub');
  const datePicker = document.getElementById('plan-date-picker');
  const todayBtn = document.getElementById('plan-today-btn');
  const headerDateLabel = document.getElementById('plan-date-label');
  const timelineHeading = document.getElementById('plan-timeline-heading');

  const todayStr = todayDateStr();
  const d = new Date(_planSelectedDate + 'T00:00:00');
  const fullDateText = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const subDateText = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (datePicker) datePicker.value = _planSelectedDate;

  let relativeTitle = d.toLocaleDateString('en-US', { weekday: 'long' });
  if (_planSelectedDate === todayStr) {
    relativeTitle = 'Today';
  } else {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    if (_planSelectedDate === yest.toLocaleDateString('en-CA')) {
      relativeTitle = 'Yesterday';
    } else if (_planSelectedDate === tom.toLocaleDateString('en-CA')) {
      relativeTitle = 'Tomorrow';
    }
  }

  if (dayLabel) dayLabel.textContent = relativeTitle;
  if (dateSub) dateSub.textContent = subDateText;
  if (headerDateLabel) headerDateLabel.textContent = fullDateText;
  if (timelineHeading) {
    timelineHeading.textContent = _planSelectedDate === todayStr ? 'Today\'s Schedule' : `${relativeTitle}'s Schedule`;
  }

  if (todayBtn) {
    if (_planSelectedDate === todayStr) {
      todayBtn.style.opacity = '0.45';
      todayBtn.style.pointerEvents = 'none';
    } else {
      todayBtn.style.opacity = '1';
      todayBtn.style.pointerEvents = 'auto';
    }
  }
}

async function changePlanDate(deltaDays) {
  const current = new Date(_planSelectedDate + 'T00:00:00');
  current.setDate(current.getDate() + deltaDays);
  _planSelectedDate = current.toLocaleDateString('en-CA');
  updatePlanDateDisplay();
  await refreshPlanForSelectedDate();
}

async function setPlanDate(dateStr) {
  if (!dateStr) return;
  _planSelectedDate = dateStr;
  updatePlanDateDisplay();
  await refreshPlanForSelectedDate();
}

async function refreshPlanForSelectedDate() {
  const planItems = await dbGetPlanByDate(_planSelectedDate);
  const dateLogs = await dbGetLogsByDate(_planSelectedDate);
  renderPlanList(planItems, dateLogs);
  if (_planSelectedDate === todayDateStr()) {
    initPlanTimer(planItems);
  }
}

function switchPlanView(viewMode) {
  _planCurrentView = viewMode;

  const dayPanel = document.getElementById('plan-day-view');
  const historyPanel = document.getElementById('plan-history-view');
  const weekPanel = document.getElementById('plan-week-view');

  const tabDay = document.getElementById('plan-tab-day');
  const tabHistory = document.getElementById('plan-tab-history');
  const tabWeek = document.getElementById('plan-tab-week');

  if (tabDay) tabDay.className = `plan-tab${viewMode === 'day' ? ' active' : ''}`;
  if (tabHistory) tabHistory.className = `plan-tab${viewMode === 'history' ? ' active' : ''}`;
  if (tabWeek) tabWeek.className = `plan-tab${viewMode === 'week' ? ' active' : ''}`;

  if (dayPanel) dayPanel.style.display = viewMode === 'day' ? 'block' : 'none';
  if (historyPanel) historyPanel.style.display = viewMode === 'history' ? 'block' : 'none';
  if (weekPanel) weekPanel.style.display = viewMode === 'week' ? 'block' : 'none';

  if (viewMode === 'history') {
    renderPlanHistory();
  } else if (viewMode === 'week') {
    renderWeeklyReview();
  }
}

async function renderPlanHistory() {
  const container = document.getElementById('plan-history-content');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const allPlanItems = await dbGetAllPlanItems();
    if (!allPlanItems || allPlanItems.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <p style="font-size: 1rem; font-weight: 600; margin-bottom: 6px;">No Plan History Yet</p>
          <p style="font-size: 0.85rem; color: var(--text-tertiary); max-width: 420px; margin: 0 auto 16px auto;">
            As you plan and execute your daily routines, your past schedules and adherence records will appear here.
          </p>
          <button class="plan-action-btn primary" onclick="switchPlanView('day')" style="display: inline-flex;">Back to Today's Plan</button>
        </div>
      `;
      return;
    }

    const byDate = {};
    allPlanItems.forEach(item => {
      const d = item.date;
      if (!d) return;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(item);
    });

    const todayStr = todayDateStr();
    const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    let html = '';
    for (const date of sortedDates) {
      const items = byDate[date];
      const logs = await dbGetLogsByDate(date);
      const stats = calculatePlanAnalytics(items, logs, date);

      const dObj = new Date(date + 'T00:00:00');
      const dateFormatted = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const isToday = date === todayStr;

      const adherenceColor = stats.adherencePct >= 80 ? 'var(--success)' : stats.adherencePct >= 50 ? 'var(--accent)' : 'var(--warning)';
      const adherenceBg = stats.adherencePct >= 80 ? 'rgba(16, 185, 129, 0.12)' : stats.adherencePct >= 50 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(245, 158, 11, 0.12)';

      const itemsListHtml = items.map(p => {
        const { state, badgeClass, badgeText } = getPlanItemState(p, logs, date);
        const typeIcon = p.targetType === 'Habit' ? icons.habit : icons.task;
        return `
          <div class="plan-history-item-row">
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-flex; align-items: center; color: ${p.targetType === 'Habit' ? 'var(--success)' : 'var(--accent)'};">${typeIcon}</span>
              <span style="font-weight: 500; color: var(--text);">${escapeHtml(p.targetName)}</span>
              ${p.currentStartTime ? `<span style="font-size: 0.72rem; color: var(--text-tertiary);">${formatTimeForDisplay(p.currentStartTime)}</span>` : ''}
            </span>
            <span class="plan-status-badge ${badgeClass}" style="font-size: 0.7rem; padding: 2px 8px;">${badgeText}</span>
          </div>
        `;
      }).join('');

      html += `
        <div class="plan-history-day-card">
          <div class="plan-history-day-header">
            <div>
              <span class="plan-history-date">${dateFormatted}${isToday ? ' <span style="font-size: 0.72rem; color: var(--accent); font-weight: 700;">(Today)</span>' : ''}</span>
              <div style="font-size: 0.76rem; color: var(--text-tertiary); margin-top: 2px;">
                ${stats.completed}/${stats.total} completed • ${stats.rescheduled} rescheduled
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="plan-history-adherence" style="background: ${adherenceBg}; color: ${adherenceColor};">
                ${stats.adherencePct}% Adherence
              </span>
              <button class="plan-jump-btn" data-date="${date}">View Day</button>
            </div>
          </div>
          <div class="plan-history-items-list">
            ${itemsListHtml}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    container.querySelectorAll('.plan-jump-btn').forEach(btn => {
      btn.onclick = async () => {
        const targetDate = btn.getAttribute('data-date');
        if (targetDate) {
          _planSelectedDate = targetDate;
          switchPlanView('day');
          updatePlanDateDisplay();
          await refreshPlanForSelectedDate();
        }
      };
    });
  } catch (err) {
    console.error('Error rendering plan history:', err);
    container.innerHTML = '<p class="error-msg">Could not load plan history.</p>';
  }
}

async function renderWeeklyReview() {
  const container = document.getElementById('plan-week-content');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const today = new Date();
    const past7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      past7Days.push(d.toLocaleDateString('en-CA'));
    }

    let totalPlanned = 0;
    let totalCompleted = 0;
    let totalReschedules = 0;
    const dailyStats = [];

    for (const date of past7Days) {
      const items = await dbGetPlanByDate(date);
      const logs = await dbGetLogsByDate(date);
      const stats = calculatePlanAnalytics(items, logs, date);
      totalPlanned += stats.total;
      totalCompleted += stats.completed;
      totalReschedules += stats.rescheduled;

      const dObj = new Date(date + 'T00:00:00');
      const dayShort = dObj.toLocaleDateString('en-US', { weekday: 'short' });
      dailyStats.push({ date, dayShort, stats });
    }

    const overallAdherence = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

    const barsHtml = dailyStats.map(item => {
      const adh = item.stats.adherencePct;
      const height = item.stats.total > 0 ? Math.max(14, Math.round(adh)) : 8;
      const color = item.stats.total === 0 ? 'rgba(255,255,255,0.08)' : adh >= 80 ? 'var(--success)' : adh >= 50 ? 'var(--accent)' : 'var(--warning)';
      return `
        <div class="plan-week-bar-col" title="${item.dayShort} (${item.date}): ${adh}% adherence (${item.stats.completed}/${item.stats.total})">
          <div style="font-size: 0.68rem; font-weight: 700; color: var(--text-tertiary);">${item.stats.total > 0 ? adh + '%' : '—'}</div>
          <div class="plan-week-bar-fill" style="height: ${height}%; background: ${color};"></div>
          <div class="plan-week-bar-label">${item.dayShort}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="plan-week-kpi-grid">
        <div class="plan-week-kpi-card">
          <span class="plan-week-kpi-val">${totalPlanned}</span>
          <span class="plan-week-kpi-label">Items Planned</span>
        </div>
        <div class="plan-week-kpi-card">
          <span class="plan-week-kpi-val" style="color: var(--success);">${totalCompleted}</span>
          <span class="plan-week-kpi-label">Completed</span>
        </div>
        <div class="plan-week-kpi-card">
          <span class="plan-week-kpi-val" style="color: var(--accent);">${overallAdherence}%</span>
          <span class="plan-week-kpi-label">7-Day Adherence</span>
        </div>
        <div class="plan-week-kpi-card">
          <span class="plan-week-kpi-val" style="color: var(--text-tertiary);">${totalReschedules}</span>
          <span class="plan-week-kpi-label">Reschedules</span>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="font-size: 0.88rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin-bottom: 8px;">
          7-Day Adherence Trend
        </h3>
        <div class="plan-week-bars">
          ${barsHtml}
        </div>
      </div>

      <div class="plan-week-insight-card">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; color: var(--focus); margin-top: 1px;">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <div>
          <strong style="color: var(--text); display: block; margin-bottom: 2px;">Behavioral Observation</strong>
          <span>
            ${totalPlanned === 0
              ? 'Begin planning your daily habits and tasks consistently to establish a baseline execution rhythm.'
              : overallAdherence >= 75
              ? 'Higher plan adherence is observed when items are scheduled with specific focus time slots.'
              : 'Days with flexible/anytime slots tend to show higher reschedule frequency than dedicated time slots.'}
          </span>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error rendering weekly review:', err);
    container.innerHTML = '<p class="error-msg">Could not load weekly review.</p>';
  }
}

async function initPlanPage() {
  const loading = document.getElementById('loading');

  try {
    await dbInit();
    const hasData = await dbHasData();

    if (!hasData && navigator.onLine && API_URL) {
      loading.innerHTML = '<div class="loading-spinner"></div><p>Restoring data from cloud…</p>';
      await restoreFromSheets();
    }

    if (document.getElementById('modal-overlay')) {
      initModal();
    }

    _planSelectedDate = todayDateStr();
    updatePlanDateDisplay();

    // Wire date navigation
    const prevDateBtn = document.getElementById('plan-prev-date-btn');
    const nextDateBtn = document.getElementById('plan-next-date-btn');
    const todayBtn = document.getElementById('plan-today-btn');
    const datePicker = document.getElementById('plan-date-picker');
    const dateTrigger = document.getElementById('plan-date-display-trigger');

    if (prevDateBtn) prevDateBtn.onclick = () => changePlanDate(-1);
    if (nextDateBtn) nextDateBtn.onclick = () => changePlanDate(1);
    if (todayBtn) todayBtn.onclick = () => setPlanDate(todayDateStr());
    if (datePicker) {
      datePicker.onchange = (e) => {
        if (e.target.value) setPlanDate(e.target.value);
      };
    }
    if (dateTrigger && datePicker) {
      dateTrigger.onclick = (e) => {
        if (e.target !== datePicker) {
          if (typeof datePicker.showPicker === 'function') {
            datePicker.showPicker();
          } else {
            datePicker.click();
          }
        }
      };
    }

    // Wire view tabs
    const tabDay = document.getElementById('plan-tab-day');
    const tabHistory = document.getElementById('plan-tab-history');
    const tabWeek = document.getElementById('plan-tab-week');
    if (tabDay) tabDay.onclick = () => switchPlanView('day');
    if (tabHistory) tabHistory.onclick = () => switchPlanView('history');
    if (tabWeek) tabWeek.onclick = () => switchPlanView('week');

    // Load initial plan items and logs
    await refreshPlanForSelectedDate();

    // Modal triggers for Add to Plan
    const openAddBtn = document.getElementById('open-add-plan-btn');
    const addOverlay = document.getElementById('add-plan-overlay');
    const addCloseBtn = document.getElementById('add-plan-close');
    const addCancelBtn = document.getElementById('add-plan-cancel-btn');

    function resetAddPlanModal() {
      _selectedAddMode = 'focus';
      const mFocus = document.getElementById('add-plan-mode-focus');
      const mParallel = document.getElementById('add-plan-mode-parallel');
      if (mFocus) mFocus.className = 'plan-mode-option active focus';
      if (mParallel) mParallel.className = 'plan-mode-option';
      const notesEl = document.getElementById('plan-item-notes');
      if (notesEl) notesEl.value = '';
    }

    if (openAddBtn && addOverlay) {
      openAddBtn.onclick = () => {
        resetAddPlanModal();
        addOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      };
    }
    if (addCloseBtn && addOverlay) {
      addCloseBtn.onclick = () => {
        resetAddPlanModal();
        addOverlay.classList.remove('active');
        document.body.style.overflow = '';
      };
    }
    if (addCancelBtn && addOverlay) {
      addCancelBtn.onclick = () => {
        resetAddPlanModal();
        addOverlay.classList.remove('active');
        document.body.style.overflow = '';
      };
    }

    // Execution mode selection buttons
    const mFocus = document.getElementById('add-plan-mode-focus');
    const mParallel = document.getElementById('add-plan-mode-parallel');
    if (mFocus && mParallel) {
      mFocus.onclick = () => {
        _selectedAddMode = 'focus';
        mFocus.className = 'plan-mode-option active focus';
        mParallel.className = 'plan-mode-option';
      };
      mParallel.onclick = () => {
        _selectedAddMode = 'parallel';
        mParallel.className = 'plan-mode-option active';
        mFocus.className = 'plan-mode-option';
      };
    }

    // Interactive time selector for Add to Plan
    setupTimeSelector('plan-item-time', 'plan-item-end-time', 'add-plan-duration-badge', 'add-plan-presets');

    // Default mode to focus for DB backward compatibility
    _selectedAddMode = 'focus';

    // Populate the add-to-plan selector with existing Tasks AND Habits
    const [tasks, habits] = await Promise.all([dbGetAllTasks(), dbGetAllHabits()]);
    const select = document.getElementById('plan-item-select');
    if (select) {
      select.innerHTML = '<option value="">Select a habit or task to plan…</option>';

      const pendingTasks = tasks.filter(t => !t.isCompleted);
      if (pendingTasks.length > 0) {
        const taskGroup = document.createElement('optgroup');
        taskGroup.label = 'Tasks';
        pendingTasks.forEach(t => {
          const opt = document.createElement('option');
          opt.value = `Task:${t.name}`;
          const prioLabel = t.priority ? ` • ${t.priority}` : '';
          opt.textContent = `[Task] ${t.name}${prioLabel}`;
          taskGroup.appendChild(opt);
        });
        select.appendChild(taskGroup);
      }

      if (habits.length > 0) {
        const habitGroup = document.createElement('optgroup');
        habitGroup.label = 'Habits';
        habits.forEach(h => {
          const opt = document.createElement('option');
          opt.value = `Habit:${h.name}`;
          const prioLabel = h.priority ? ` • ${h.priority}` : '';
          opt.textContent = `[Habit] ${h.name}${prioLabel}`;
          habitGroup.appendChild(opt);
        });
        select.appendChild(habitGroup);
      }

      // Handle direct URL query parameter addTask or addHabit
      const urlParams = new URLSearchParams(window.location.search);
      const addTaskParam = urlParams.get('addTask');
      const addHabitParam = urlParams.get('addHabit');
      if (addTaskParam) {
        select.value = `Task:${addTaskParam}`;
        if (addOverlay) {
          addOverlay.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      } else if (addHabitParam) {
        select.value = `Habit:${addHabitParam}`;
        if (addOverlay) {
          addOverlay.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      }
    }

    // Add to Plan handler
    const addBtn = document.getElementById('plan-add-btn');
    if (addBtn) {
      addBtn.onclick = async () => {
        const selectEl = document.getElementById('plan-item-select');
        const timeInput = document.getElementById('plan-item-time');
        const endTimeInput = document.getElementById('plan-item-end-time');

        if (!selectEl || !selectEl.value) {
          showToast('Select a habit or task first');
          return;
        }

        const [targetType, ...nameParts] = selectEl.value.split(':');
        const targetName = nameParts.join(':');
        const startTime = timeInput ? timeInput.value : '';
        const endTime = endTimeInput ? endTimeInput.value : '';

        const targetDate = _planSelectedDate || todayDateStr();
        const currentPlan = await dbGetPlanByDate(targetDate);

        // Duplicate check on same date
        if (currentPlan.some(p => p.targetName === targetName && p.targetType === targetType)) {
          showToast(`${targetType} already planned for this day`);
          return;
        }

        const notesInput = document.getElementById('plan-item-notes');
        const planNotes = notesInput ? notesInput.value.trim() : '';

        await dbAddPlanItem({
          targetName,
          targetType,
          date: targetDate,
          startTime: startTime,
          time: startTime,
          endTime: endTime,
          originalStartTime: startTime,
          originalEndTime: endTime,
          currentStartTime: startTime,
          currentEndTime: endTime,
          mode: _selectedAddMode || 'focus',
          notes: planNotes,
          status: 'Pending',
          completionType: null,
          rescheduleCount: 0,
          changeLog: [],
          createdAt: new Date().toISOString(),
          completedAt: null
        });

        if (startTime && targetDate === todayDateStr()) {
          scheduleNotificationViaSW(targetName, startTime, targetType);
          if (typeof scheduleLoggingReminderViaSW === 'function') {
            scheduleLoggingReminderViaSW(targetName, endTime || startTime, targetType);
          }
        }

        showToast(`Added ${targetName} to plan`);
        selectEl.value = '';
        if (timeInput) timeInput.value = '';
        if (endTimeInput) endTimeInput.value = '';
        resetAddPlanModal();

        if (addOverlay) {
          addOverlay.classList.remove('active');
          document.body.style.overflow = '';
        }

        await refreshPlanForSelectedDate();
      };
    }

    loading.classList.add('hidden');

    if (navigator.onLine && API_URL) {
      syncToSheets();
    }
  } catch (err) {
    loading.innerHTML = '<p>Could not load plan.<br>Check your connection.</p>';
    console.error(err);
  }
}

async function renderPlanList(planItems, todayLogs, allTasks = null, allHabits = null) {
  const container = document.getElementById('plan-list');
  if (!container) return;
  container.innerHTML = '';

  if (!allTasks) {
    try { allTasks = await dbGetAllTasks(); } catch (e) { allTasks = []; }
  }
  if (!allHabits) {
    try { allHabits = await dbGetAllHabits(); } catch (e) { allHabits = []; }
  }

  const isToday = _planSelectedDate === todayDateStr();

  // Render Analytics Bar
  const analyticsCard = document.getElementById('plan-analytics-card');
  if (analyticsCard) {
    if (planItems.length > 0) {
      analyticsCard.style.display = 'block';
      const stats = calculatePlanAnalytics(planItems, todayLogs, _planSelectedDate);
      const totalEl = document.getElementById('plan-metric-total');
      const doneEl = document.getElementById('plan-metric-done');
      const adhEl = document.getElementById('plan-metric-adherence');
      const reschedEl = document.getElementById('plan-metric-rescheduled');
      const barEl = document.getElementById('plan-progress-bar');

      if (totalEl) totalEl.textContent = stats.total;
      if (doneEl) doneEl.textContent = stats.completed;
      if (adhEl) adhEl.textContent = `${stats.adherencePct}%`;
      if (reschedEl) reschedEl.textContent = stats.rescheduled;
      if (barEl) barEl.style.width = `${stats.adherencePct}%`;
    } else {
      analyticsCard.style.display = 'none';
    }
  }

  if (planItems.length === 0) {
    const dayLabel = isToday ? 'today' : `this date (${_planSelectedDate})`;
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <p style="font-size: 1rem; font-weight: 600; margin-bottom: 6px;">No items planned for ${dayLabel}.</p>
        <p style="font-size: 0.84rem; color: var(--text-tertiary); max-width: 380px; margin: 0 auto 16px auto;">
          Plan your habits and tasks to maintain clear daily focus and intentional execution.
        </p>
        <button class="plan-action-btn primary" onclick="document.getElementById('open-add-plan-btn').click()" style="display: inline-flex;">Add to Plan</button>
      </div>
    `;
    return;
  }

  // Sort by time: timed items first chronologically, untimed at the end
  planItems.sort((a, b) => {
    if (!a.currentStartTime && !b.currentStartTime) return 0;
    if (!a.currentStartTime) return 1;
    if (!b.currentStartTime) return -1;
    return a.currentStartTime.localeCompare(b.currentStartTime);
  });

  // Check if any focus item is active now to de-emphasize others
  const anyFocusActive = isToday && planItems.some(p => getPlanItemState(p, todayLogs, _planSelectedDate).isFocusNow);
  if (anyFocusActive) {
    container.classList.add('has-focus-active');
  } else {
    container.classList.remove('has-focus-active');
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Timeline grouping buckets: NOW, UP NEXT, LATER, COMPLETED
  const groups = {
    now: [],
    upNext: [],
    later: [],
    completed: []
  };

  planItems.forEach(plan => {
    const stateInfo = getPlanItemState(plan, todayLogs, _planSelectedDate);
    const isCompleted = stateInfo.log && (stateInfo.log.status === 'Done' || stateInfo.log.status === 'Partially Done');

    if (isCompleted) {
      groups.completed.push({ plan, stateInfo });
    } else if (isToday && stateInfo.isFocusNow) {
      groups.now.push({ plan, stateInfo });
    } else if (plan.currentStartTime) {
      if (isToday) {
        const [h, m] = plan.currentStartTime.split(':').map(Number);
        const startM = h * 60 + (m || 0);
        if (startM > currentMinutes) {
          groups.upNext.push({ plan, stateInfo });
        } else {
          groups.later.push({ plan, stateInfo });
        }
      } else {
        groups.upNext.push({ plan, stateInfo });
      }
    } else {
      groups.later.push({ plan, stateInfo });
    }
  });

  const groupConfigs = [
    { key: 'now', title: 'NOW', cls: 'group-now' },
    { key: 'upNext', title: isToday ? 'UP NEXT' : 'SCHEDULED', cls: 'group-up-next' },
    { key: 'later', title: isToday ? 'LATER / UNSCHEDULED' : 'UNSCHEDULED', cls: '' },
    { key: 'completed', title: 'COMPLETED', cls: 'group-completed' }
  ];

  let renderIndex = 0;

  groupConfigs.forEach(grp => {
    const itemsInGroup = groups[grp.key];
    if (itemsInGroup.length === 0) return;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'plan-group-header';
    groupHeader.innerHTML = `
      <span class="plan-group-title ${grp.cls}">${grp.title}</span>
      <span class="plan-group-count">${itemsInGroup.length}</span>
    `;
    container.appendChild(groupHeader);

    itemsInGroup.forEach(({ plan, stateInfo }) => {
      const { state, badgeClass, badgeIcon, badgeText, actualTimeText, isRescheduled, isFocusNow, log } = stateInfo;

      const el = document.createElement('div');
      el.className = `plan-item${isFocusNow ? ' focus-now' : ''}`;
      el.style.animationDelay = `${renderIndex * 0.04}s`;
      renderIndex++;

      const isTask = plan.targetType === 'Task';
      const taskObj = isTask && allTasks ? allTasks.find(t => t.name === plan.targetName) : null;
      const habitObj = !isTask && allHabits ? allHabits.find(h => h.name === plan.targetName) : null;

      const isParallel = plan.mode === 'parallel';
      const modeBadge = `<span class="plan-mode-badge ${isParallel ? 'parallel' : 'focus'}" title="${isParallel ? 'Parallel Execution' : 'Focus Mode'}">${isParallel ? 'Parallel' : 'Focus'}</span>`;

      const typeBadge = isTask
        ? `<span class="plan-mode-badge" style="background: rgba(79, 70, 229, 0.10); color: var(--accent); border: 1px solid rgba(79, 70, 229, 0.25); display: inline-flex; align-items: center; gap: 4px;">${icons.task} Task</span>`
        : `<span class="plan-mode-badge" style="background: rgba(16, 185, 129, 0.10); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.25); display: inline-flex; align-items: center; gap: 4px;">${icons.habit} Habit</span>`;

      let priorityBadge = '';
      const prio = taskObj ? taskObj.priority : (habitObj ? habitObj.priority : null);
      if (prio) {
        priorityBadge = `<span class="priority-badge ${prio.toLowerCase().replace(/[^a-z]/g, '-')}">${escapeHtml(prio)}</span>`;
      }

      let subtasksBadge = '';
      if (taskObj && taskObj.subtasks && taskObj.subtasks.length > 0) {
        const completedSubs = taskObj.subtasks.filter(s => s.isCompleted).length;
        subtasksBadge = `<span class="plan-mode-badge" style="background: var(--surface); border: 1px solid var(--separator); color: var(--text-secondary);">${completedSubs}/${taskObj.subtasks.length} subtasks</span>`;
      }

      let deadlineBadge = '';
      if (taskObj && taskObj.deadline) {
        const todayStr = todayDateStr();
        if (taskObj.deadline < todayStr) {
          deadlineBadge = `<span class="badge-deadline overdue">Overdue: ${taskObj.deadline}</span>`;
        } else if (taskObj.deadline === todayStr) {
          deadlineBadge = `<span class="badge-deadline today">Due Today</span>`;
        } else {
          deadlineBadge = `<span class="badge-deadline">Due ${taskObj.deadline}</span>`;
        }
      }

      // Next / Current step for progressive task execution
      let currentStepRow = '';
      if (isTask && taskObj && Array.isArray(taskObj.subtasks) && taskObj.subtasks.length > 0) {
        const nextSub = taskObj.subtasks.find(s => !s.isCompleted);
        if (nextSub) {
          const stepTitle = typeof nextSub === 'string' ? nextSub : (nextSub.title || nextSub.text || nextSub.name || '');
          if (stepTitle) {
            currentStepRow = `
              <div class="plan-current-step" style="display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-secondary); margin-top: 6px; padding: 4px 8px; background: var(--surface); border-radius: var(--radius-xs); border-left: 2px solid var(--accent);">
                <span style="font-weight: 600; color: var(--accent); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em;">Current Step:</span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(stepTitle)}</span>
              </div>
            `;
          }
        }
      }

      // Optional notes / context
      let notesRow = '';
      if (plan.notes) {
        notesRow = `
          <div class="plan-item-notes-text" style="font-size: 0.78rem; color: var(--text-tertiary); font-style: italic; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-flex; align-items: center; flex-shrink: 0;">${icons.note}</span>
            <span>${escapeHtml(plan.notes)}</span>
          </div>
        `;
      }

      const timeDisplay = plan.currentStartTime
        ? `<div class="plan-time-col">
             <span class="plan-time-primary">${formatTimeForDisplay(plan.currentStartTime)}</span>
             ${plan.currentEndTime ? `<span class="plan-time-sub">to ${formatTimeForDisplay(plan.currentEndTime)}</span>` : ''}
           </div>`
        : `<div class="plan-time-col">
             <span class="plan-time-primary" style="color: var(--text-tertiary); font-size: 0.78rem;">Anytime</span>
           </div>`;

      const actualRow = actualTimeText
        ? `<div class="plan-execution-row ${log && log.status === 'Done' ? 'done' : 'partial'}">
             ${icons.clock}
             <span>${actualTimeText}</span>
           </div>`
        : '';

      // Actual vs Planned comparison indicator on completed plan items
      let plannedVsActualRow = '';
      const isItemCompleted = log && (log.status === 'Done' || log.status === 'Partially Done');
      if (isItemCompleted && (plan.originalStartTime || plan.startTime || plan.currentStartTime)) {
        const plannedTime = formatTimeForDisplay(plan.originalStartTime || plan.startTime || plan.currentStartTime);
        const actualLoggedTime = log.activityStartTime ? formatTimeForDisplay(log.activityStartTime) : (log.time ? formatTimeForDisplay(log.time) : '');
        if (actualLoggedTime) {
          plannedVsActualRow = `
            <div class="plan-comparison-row" style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px; padding: 5px 10px; background: rgba(16, 185, 129, 0.08); border-radius: var(--radius-xs); border: 1px solid rgba(16, 185, 129, 0.2);">
              <span style="font-weight: 600; color: var(--text-secondary);">Planned: <strong>${plannedTime}</strong></span>
              <span style="color: var(--text-tertiary);">→</span>
              <span style="font-weight: 600; color: var(--success);">Actual: <strong>${actualLoggedTime}</strong>${log.duration ? ` (${log.duration}m)` : ''}</span>
            </div>
          `;
        }
      }

      let historyTrail = '';
      if (isRescheduled && plan.changeLog && plan.changeLog.length > 0) {
        const orig = formatTimeForDisplay(plan.originalStartTime || plan.startTime || '—');
        const shifts = plan.changeLog.map(c => {
          const to = formatTimeForDisplay(c.toStartTime || '—');
          const reason = c.reason ? ` (${c.reason})` : '';
          return `<span class="shift-step"><span class="shift-arrow">→</span> ${to}${reason}</span>`;
        }).join(' ');

        historyTrail = `
          <div class="plan-history-trail">
            ${icons.history}
            <span>Shift: ${orig} ${shifts}</span>
          </div>
        `;
      }

      const logButtonLabel = isTask ? 'Log Task' : 'Log Habit';
      const actionsRow = `
        <div class="plan-actions-row">
          ${!log ? `<button class="plan-action-btn primary log-btn" title="Log Execution">${icons.check} ${logButtonLabel}</button>` : ''}
          <button class="plan-action-btn alter-btn" title="Alter Planned Time">${icons.clock} Alter</button>
          ${!log ? `<button class="plan-action-btn tomorrow-btn" title="Move to tomorrow">${icons.arrowRight} Tomorrow</button>` : ''}
        </div>
      `;

      el.innerHTML = `
        <div class="plan-item-top">
          <div style="display: flex; gap: 12px; align-items: flex-start; flex: 1; min-width: 0;">
            ${timeDisplay}
            <div class="plan-details">
              <div class="plan-name-row">
                <span class="plan-name">${escapeHtml(plan.targetName)}</span>
              </div>
              <div class="plan-badges">
                ${modeBadge}
                ${typeBadge}
                ${priorityBadge}
                ${subtasksBadge}
                ${deadlineBadge}
                ${isRescheduled ? `<span class="plan-mode-badge" style="background: var(--surface); color: var(--text-secondary); border: 1px solid var(--separator);">${icons.history} Shifted (${plan.rescheduleCount || plan.changeLog.length}x)</span>` : ''}
              </div>
              ${notesRow}
              ${currentStepRow}
            </div>
          </div>
          <span class="plan-status-badge ${badgeClass}">${badgeIcon} ${badgeText}</span>
        </div>
        ${actualRow}
        ${plannedVsActualRow}
        ${historyTrail}
        ${actionsRow}
      `;

      const logBtn = el.querySelector('.log-btn');
      if (logBtn) {
        logBtn.onclick = async (e) => {
          e.stopPropagation();
          await triggerPlanItemLogFlow(plan.targetName, plan.targetType || 'Task');
        };
      }

      const alterBtn = el.querySelector('.alter-btn');
      if (alterBtn) {
        alterBtn.onclick = (e) => {
          e.stopPropagation();
          openAlterPlanModal(plan, planItems);
        };
      }

      const tomorrowBtn = el.querySelector('.tomorrow-btn');
      if (tomorrowBtn) {
        tomorrowBtn.onclick = async (e) => {
          e.stopPropagation();
          await movePlanItemToTomorrow(plan);
        };
      }

      el.onclick = () => {
        openAlterPlanModal(plan, planItems);
      };

      container.appendChild(el);
    });
  });
}

/**
 * Trigger logging flow for either a Habit or a Task.
 * Maintains existing log systems as single source of truth.
 */
async function triggerPlanItemLogFlow(targetName, targetType = 'Task') {
  if (targetType === 'Habit') {
    const habit = await dbGetHabit(targetName);
    if (!habit) {
      showToast('Habit not found');
      return;
    }
    if (typeof openModal === 'function' && document.getElementById('modal-overlay')) {
      openModal(habit, 'Habit');
    } else {
      window.location.href = `index.html?habit=${encodeURIComponent(targetName)}`;
    }
  } else {
    await triggerTaskLogFlow(targetName);
  }
}

/**
 * Trigger task logging flow:
 * If task has subtasks -> redirect to task-details.html?task=...
 * If task has 0 subtasks -> openModal(task, 'Task')
 */
async function triggerTaskLogFlow(taskName) {
  const task = await dbGetTask(taskName);
  if (!task) {
    showToast('Task not found');
    return;
  }

  if (task.subtasks && task.subtasks.length > 0) {
    window.location.href = `task-details.html?task=${encodeURIComponent(taskName)}`;
  } else {
    if (typeof openModal === 'function' && document.getElementById('modal-overlay')) {
      openModal(task, 'Task');
    } else {
      window.location.href = `tasks.html?task=${encodeURIComponent(taskName)}`;
    }
  }
}

/**
 * Explicitly move a plan item to tomorrow
 */
async function movePlanItemToTomorrow(plan) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA');

  await dbAddPlanItem({
    targetName: plan.targetName,
    targetType: plan.targetType,
    date: tomorrowStr,
    startTime: plan.currentStartTime,
    time: plan.currentStartTime,
    endTime: plan.currentEndTime,
    originalStartTime: plan.originalStartTime || plan.currentStartTime,
    originalEndTime: plan.originalEndTime || plan.currentEndTime,
    currentStartTime: plan.currentStartTime,
    currentEndTime: plan.currentEndTime,
    mode: plan.mode || 'focus',
    status: 'Pending',
    completionType: null,
    rescheduleCount: (plan.rescheduleCount || 0) + 1,
    changeLog: [
      ...(plan.changeLog || []),
      {
        fromStartTime: plan.currentStartTime,
        fromEndTime: plan.currentEndTime,
        toStartTime: plan.currentStartTime,
        toEndTime: plan.currentEndTime,
        reason: 'Moved to tomorrow',
        changedAt: new Date().toISOString()
      }
    ]
  });

  await dbDeletePlanItem(plan.id);
  cancelNotificationViaSW(plan.targetName);

  showToast(`Moved "${plan.targetName}" to tomorrow`);
  const targetDate = plan.date || _planSelectedDate || todayDateStr();
  const updatedPlan = await dbGetPlanByDate(targetDate);
  const tLogs = await dbGetLogsByDate(targetDate);
  renderPlanList(updatedPlan, tLogs);
}

function openAlterPlanModal(planItem, allPlanItems) {
  _currentPlanItem = planItem;
  
  const overlay = document.getElementById('alter-plan-overlay');
  if (!overlay) return;
  
  document.getElementById('alter-plan-title').textContent = planItem.targetName;
  document.getElementById('alter-plan-start').value = planItem.currentStartTime || '';
  document.getElementById('alter-plan-end').value = planItem.currentEndTime || '';

  const alterTypeBadge = document.getElementById('alter-plan-type-badge');
  if (alterTypeBadge) {
    const isParallel = planItem.mode === 'parallel';
    alterTypeBadge.className = `plan-mode-badge ${isParallel ? 'parallel' : 'focus'}`;
    alterTypeBadge.textContent = isParallel ? 'Parallel Mode' : 'Focus Mode';
  }

  // Visual Time Shift Card
  const origStart = planItem.originalStartTime || planItem.startTime || planItem.currentStartTime || '';
  const origEnd = planItem.originalEndTime || planItem.endTime || planItem.currentEndTime || '';
  const origDisplay = origStart ? `${formatTimeForDisplay(origStart)}${origEnd ? ` - ${formatTimeForDisplay(origEnd)}` : ''}` : 'Anytime';
  const origTimeEl = document.getElementById('alter-orig-time');
  const newTimeEl = document.getElementById('alter-new-time');
  if (origTimeEl) origTimeEl.textContent = origDisplay;

  function updateNewTimeDisplay(startVal, endVal) {
    if (newTimeEl) {
      if (!startVal && !endVal) {
        newTimeEl.textContent = 'Flexible / Anytime';
      } else {
        newTimeEl.textContent = `${formatTimeForDisplay(startVal)}${endVal ? ` - ${formatTimeForDisplay(endVal)}` : ''}`;
      }
    }
  }
  updateNewTimeDisplay(planItem.currentStartTime, planItem.currentEndTime);

  // Time selector with presets for Alter Plan
  setupTimeSelector('alter-plan-start', 'alter-plan-end', 'alter-plan-duration-badge', 'alter-plan-presets', (s, e) => {
    updateNewTimeDisplay(s, e);
  });

  const reasonInput = document.getElementById('alter-plan-reason-input');
  if (reasonInput) reasonInput.value = '';

  const conflictWarning = document.getElementById('alter-plan-conflict-warning');
  if (conflictWarning) conflictWarning.style.display = 'none';

  // Mode in Alter Plan defaults to existing item mode or focus
  _selectedAlterMode = planItem.mode || 'focus';

  // Quick reason chips
  document.querySelectorAll('.alter-reason-chip').forEach(chip => {
    chip.onclick = () => {
      if (reasonInput) reasonInput.value = chip.dataset.reason;
    };
  });

  // Render Time-Shift History
  const historyBox = document.getElementById('alter-plan-history-box');
  const historyList = document.getElementById('alter-plan-history-list');
  if (historyBox && historyList) {
    if (planItem.changeLog && planItem.changeLog.length > 0) {
      historyBox.style.display = 'block';
      let historyHtml = `
        <div class="plan-history-item">
          <div class="plan-history-times">Original: ${formatTimeForDisplay(planItem.originalStartTime || planItem.startTime || '—')}</div>
        </div>
      `;

      planItem.changeLog.forEach((c, idx) => {
        const timeStr = formatTimeForDisplay(c.toStartTime || '—');
        const endStr = c.toEndTime ? ` to ${formatTimeForDisplay(c.toEndTime)}` : '';
        const changedTime = c.changedAt ? new Date(c.changedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
        historyHtml += `
          <div class="plan-history-item">
            <div class="plan-history-times">
              Shift ${idx + 1}: ${timeStr}${endStr}
              ${changedTime ? `<span style="font-size: 0.7rem; color: var(--text-tertiary); font-weight: 400;">(${changedTime})</span>` : ''}
            </div>
            ${c.reason ? `<div class="plan-history-reason">Reason: ${c.reason}</div>` : ''}
          </div>
        `;
      });
      historyList.innerHTML = historyHtml;
    } else {
      historyBox.style.display = 'none';
      historyList.innerHTML = '';
    }
  }
  
  // Clone buttons to clear previous listeners
  const saveBtn = document.getElementById('alter-plan-save-btn');
  const logBtn = document.getElementById('alter-plan-log-btn');
  const timerBtn = document.getElementById('alter-plan-timer-btn');
  const tomorrowBtn = document.getElementById('alter-plan-tomorrow-btn');
  const deleteBtn = document.getElementById('alter-plan-delete-btn');
  const cancelBtn = document.getElementById('alter-plan-cancel-btn');
  
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.onclick = () => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    };
  }

  if (timerBtn) {
    const newTimerBtn = timerBtn.cloneNode(true);
    timerBtn.parentNode.replaceChild(newTimerBtn, timerBtn);
    newTimerBtn.onclick = () => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      _timerTask = {
        name: planItem.targetName,
        type: planItem.targetType,
        startTime: planItem.currentStartTime,
        endTime: planItem.currentEndTime
      };
      updateTimerUI();
      const timerCard = document.getElementById('plan-timer-card');
      if (timerCard) {
        timerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      showToast(`Focus session set: ${planItem.targetName}`);
    };
  }

  let newLogBtn = null;
  if (logBtn) {
    newLogBtn = logBtn.cloneNode(true);
    logBtn.parentNode.replaceChild(newLogBtn, logBtn);
  }

  let newTomorrowBtn = null;
  if (tomorrowBtn) {
    newTomorrowBtn = tomorrowBtn.cloneNode(true);
    tomorrowBtn.parentNode.replaceChild(newTomorrowBtn, tomorrowBtn);
  }
  
  const newDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
  
  // Save Changes
  newSaveBtn.addEventListener('click', async () => {
    const newStart = document.getElementById('alter-plan-start').value;
    const newEnd = document.getElementById('alter-plan-end').value;
    const reason = reasonInput ? reasonInput.value.trim() : '';
    
    await dbAlterPlanTime(planItem.id, newStart, newEnd, reason, _selectedAlterMode);
    showToast('Plan updated');
    
    if (newStart) {
      scheduleNotificationViaSW(planItem.targetName, newStart, planItem.targetType);
      if (typeof scheduleLoggingReminderViaSW === 'function') {
        scheduleLoggingReminderViaSW(planItem.targetName, newEnd || newStart, planItem.targetType);
      }
    }
    
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    
    const targetDate = planItem.date || _planSelectedDate || todayDateStr();
    const updatedPlan = await dbGetPlanByDate(targetDate);
    const targetLogs = await dbGetLogsByDate(targetDate);
    renderPlanList(updatedPlan, targetLogs);
    if (targetDate === todayDateStr()) {
      initPlanTimer(updatedPlan);
    }
  });

  // Log Item Now bridge
  if (newLogBtn) {
    newLogBtn.addEventListener('click', async () => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      await triggerPlanItemLogFlow(planItem.targetName, planItem.targetType || 'Task');
    });
  }

  // Move to Tomorrow
  if (newTomorrowBtn) {
    newTomorrowBtn.addEventListener('click', async () => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      await movePlanItemToTomorrow(planItem);
    });
  }
  
  // Remove from Plan
  newDeleteBtn.addEventListener('click', async () => {
    await dbDeletePlanItem(planItem.id);
    showToast('Removed from plan');
    cancelNotificationViaSW(planItem.targetName);
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    
    const targetDate = planItem.date || _planSelectedDate || todayDateStr();
    const updatedPlan = await dbGetPlanByDate(targetDate);
    const targetLogs = await dbGetLogsByDate(targetDate);
    renderPlanList(updatedPlan, targetLogs);
    if (targetDate === todayDateStr()) {
      initPlanTimer(updatedPlan);
    }
  });
  
  const closeBtn = document.getElementById('alter-plan-close');
  const newCloseBtn = closeBtn.cloneNode(true);
  closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
  newCloseBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  });
  
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// ============================================================
// Service Worker, Web Push & Periodic Sync Registration
// ============================================================
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      console.log('Service worker registered successfully.');

      if ('PushManager' in window) {
        try {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
          console.log('[Web Push] Subscribed successfully endpoint:', subscription.endpoint);
        } catch (e) {
          console.warn('[Web Push] Subscription failed:', e);
        }
      }

      if ('periodicSync' in registration) {
        try {
          const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (status.state === 'granted') {
            await registration.periodicSync.register('check-reminders', {
              minInterval: 12 * 60 * 60 * 1000
            });
            console.log('[Periodic Sync] Registered check-reminders successfully.');
          }
        } catch (e) {
          console.warn('[Periodic Sync] Registration failed:', e);
        }
      }
    } catch (err) {
      console.log('Service worker registration failed:', err);
    }
  });
}

// ============================================================
// Settings Modal
// ============================================================

function openSettingsModal() {
  const overlay = document.getElementById('settings-overlay');
  const input = document.getElementById('api-url-input');
  if (overlay && input) {
    input.value = API_URL;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeSettingsModal() {
  const overlay = document.getElementById('settings-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function saveSettings() {
  const input = document.getElementById('api-url-input');
  if (input) {
    const val = input.value.trim();
    localStorage.setItem('blog-api-url', val);
    API_URL = val;
    showToast('Settings saved. Refreshing...');
    setTimeout(() => location.reload(), 1000);
  }
}

async function resetAppAndClearCache() {
  if (!confirm("Are you sure you want to reset the app? This clears the saved Apps Script URL and deletes all local file caches to fetch the latest version.")) {
    return;
  }

  localStorage.clear();

  try {
    await dbClearAll();
  } catch (e) {
    console.warn('Could not clear IndexedDB:', e);
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (let registration of registrations) {
      await registration.unregister();
    }
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    for (let key of keys) {
      await caches.delete(key);
    }
  }

  showToast('App reset complete. Reloading...');
  setTimeout(() => {
    window.location.reload(true);
  }, 1000);
}

function initSettingsModal() {
  const btn = document.getElementById('settings-btn');
  const close = document.getElementById('settings-close');
  const save = document.getElementById('settings-save-btn');
  const reset = document.getElementById('settings-reset-btn');
  const overlay = document.getElementById('settings-overlay');

  if (btn) btn.addEventListener('click', openSettingsModal);
  if (close) close.addEventListener('click', closeSettingsModal);
  if (save) save.addEventListener('click', saveSettings);
  if (reset) reset.addEventListener('click', resetAppAndClearCache);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSettingsModal();
    });
  }
}

// ============================================================
// PWA Install Prompt
// ============================================================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.classList.remove('hidden');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      installBtn.classList.add('hidden');
    });
  }
});

window.addEventListener('appinstalled', (evt) => {
  console.log('PivotMe was installed.');
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.classList.add('hidden');
  }
});

// ============================================================
// Add Item Modal & Logic — Offline-First (v4 with priority, recurrence)
// ============================================================

function openAddItemModal() {
  const overlay = document.getElementById('add-item-overlay');
  if (overlay) {
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-time').value = '';
    document.getElementById('new-item-place').value = '';
    
    const objectiveInput = document.getElementById('new-item-objective');
    if (objectiveInput) objectiveInput.value = '';

    const prioritySelect = document.getElementById('new-item-priority');
    if (prioritySelect) prioritySelect.value = '';

    const startDateInput = document.getElementById('new-item-start-date');
    const deadlineInput = document.getElementById('new-item-deadline');
    if (startDateInput) startDateInput.value = '';
    if (deadlineInput) deadlineInput.value = '';

    // Habit target, fallback, replacement fields
    const targetInput = document.getElementById('new-item-target');
    const fallbackInput = document.getElementById('new-item-fallback');
    const replacementInput = document.getElementById('new-item-replacement');
    if (targetInput) targetInput.value = '';
    if (fallbackInput) fallbackInput.value = '';
    if (replacementInput) replacementInput.value = '';

    const growthFields = document.getElementById('growth-habit-config-fields');
    const quitFields = document.getElementById('quit-habit-config-fields');
    const nameLabel = document.getElementById('new-item-name-label');
    const nameInput = document.getElementById('new-item-name');
    const isTasksPage = window.location.pathname.includes('tasks.html');
    if (nameLabel) nameLabel.textContent = isTasksPage ? 'Task Name *' : 'Habit Name *';
    if (nameInput) nameInput.placeholder = isTasksPage ? 'e.g. Prepare presentation, File taxes' : 'e.g. Morning Exercise, Read 30 mins';
    if (growthFields && quitFields) {
      growthFields.style.display = 'block';
      quitFields.style.display = 'none';
    }

    // Reset recurrence toggles
    const recurrence = document.getElementById('new-item-recurrence');
    if (recurrence) {
      recurrence.querySelectorAll('.weekday-btn').forEach(btn => btn.classList.remove('active'));
    }

    // Reset type select if exists
    const typeSelect = document.getElementById('new-item-type');
    if (typeSelect) typeSelect.value = 'Good';

    // Handle Temporary Task Toggle
    const tempToggle = document.getElementById('new-item-is-temporary');
    const nonTempFields = document.getElementById('non-temp-fields');
    if (tempToggle) {
      tempToggle.checked = false;
      if (nonTempFields) nonTempFields.style.display = 'block';
      
      // Attach listener once
      if (!tempToggle.hasAttribute('data-listener')) {
        tempToggle.addEventListener('change', (e) => {
          if (nonTempFields) {
            nonTempFields.style.display = e.target.checked ? 'none' : 'block';
          }
        });
        tempToggle.setAttribute('data-listener', 'true');
      }
    }

    // Handle Remove after completion toggle
    const removeAfterCompToggle = document.getElementById('new-item-remove-after-completion');
    if (removeAfterCompToggle) {
      removeAfterCompToggle.checked = true;
    }

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeAddItemModal() {
  const overlay = document.getElementById('add-item-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';

    editItemState = { isEdit: false, oldName: '', item: null };
    const isTasksPage = window.location.pathname.includes('tasks.html');
    const type = isTasksPage ? 'Task' : 'Habit';
    document.getElementById('add-modal-title').textContent = `Create ${type}`;
    const saveBtn = document.getElementById('add-item-save-btn');
    if (saveBtn) saveBtn.textContent = `Create ${type}`;
  }
}

/** Submit new habit/task item — v4 with priority, recurrence, chain */
async function handleAddItemSave(type) {
  const nameInput = document.getElementById('new-item-name');
  const timeInput = document.getElementById('new-item-time');
  const placeInput = document.getElementById('new-item-place');
  const saveBtn = document.getElementById('add-item-save-btn');
  const prioritySelect = document.getElementById('new-item-priority');

  const name = nameInput.value.trim();
  const time = timeInput.value.trim();
  const place = placeInput.value.trim();
  const priority = prioritySelect ? prioritySelect.value : '';

  // Objective (task only)
  const objectiveInput = document.getElementById('new-item-objective');
  const objective = (type === 'Task' && objectiveInput) ? objectiveInput.value.trim() : '';

  // Task-specific fields
  const startDateInput = document.getElementById('new-item-start-date');
  const deadlineInput = document.getElementById('new-item-deadline');
  const startDate = (type === 'Task' && startDateInput) ? startDateInput.value : '';
  const deadline = (type === 'Task' && deadlineInput) ? deadlineInput.value : '';

  // Temporary Task flag
  const tempToggle = document.getElementById('new-item-is-temporary');
  const isTemporary = (type === 'Task' && tempToggle) ? tempToggle.checked : false;

  // Remove after completion (task only)
  const removeAfterCompToggle = document.getElementById('new-item-remove-after-completion');
  const removeAfterCompletion = (type === 'Task' && removeAfterCompToggle) ? removeAfterCompToggle.checked : true;

  // Recurrence
  let recurrence = [];
  const recurrenceContainer = document.getElementById('new-item-recurrence');
  if (type === 'Task' && recurrenceContainer) {
    recurrence = Array.from(recurrenceContainer.querySelectorAll('.weekday-btn.active'))
      .map(btn => parseInt(btn.dataset.day));
  }

  // Habit type
  const typeSelect = document.getElementById('new-item-type');
  const behaviorType = (type === 'Habit' && typeSelect) ? typeSelect.value : 'Good';

  // Habit target, fallback, replacement fields
  const targetInput = document.getElementById('new-item-target');
  const fallbackInput = document.getElementById('new-item-fallback');
  const replacementInput = document.getElementById('new-item-replacement');
  const target = (type === 'Habit' && targetInput) ? targetInput.value.trim() : '';
  const fallbackAction = (type === 'Habit' && fallbackInput) ? fallbackInput.value.trim() : '';
  const replacementAction = (type === 'Habit' && replacementInput) ? replacementInput.value.trim() : '';

  // Remind
  const remindCheckbox = document.getElementById('new-item-remind');
  const remind = remindCheckbox ? remindCheckbox.checked : false;

  if (!name) {
    showToast('Name is required');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const item = {
      name,
      time: time || '',
      place: place || '',
      behaviorType: behaviorType || 'Good',
      remind: remind,
      priority: priority,
      startDate: startDate,
      deadline: deadline,
      originalDeadline: (editItemState.isEdit && editItemState.item && editItemState.item.originalDeadline) ? editItemState.item.originalDeadline : (deadline || ''),
      deadlineExtensions: (editItemState.isEdit && editItemState.item && editItemState.item.deadlineExtensions) ? editItemState.item.deadlineExtensions : [],
      isTemporary: type === 'Task' ? isTemporary : false,
      removeAfterCompletion: type === 'Task' ? removeAfterCompletion : undefined,
      objective: type === 'Task' ? objective : '',
      subtasks: type === 'Task' ? currentSubtasks : [],
      nextActions: (editItemState.isEdit && editItemState.item && editItemState.item.nextActions) ? editItemState.item.nextActions : [],
      recurrence: type === 'Task' ? recurrence : [],
      target: type === 'Habit' ? target : '',
      fallbackAction: type === 'Habit' ? fallbackAction : '',
      replacementAction: type === 'Habit' ? replacementAction : '',
      isCompleted: (editItemState.isEdit && editItemState.item) ? !!editItemState.item.isCompleted : false,
      prevHabit: '',
      nextHabit: ''
    };

    // If editing, preserve chain links
    if (editItemState.isEdit && editItemState.item) {
      item.prevHabit = editItemState.item.prevHabit || '';
      item.nextHabit = editItemState.item.nextHabit || '';
    }

    if (editItemState.isEdit) {
      const oldName = editItemState.oldName;
      cancelNotificationViaSW(oldName);

      if (type === 'Habit') {
        if (name !== oldName) await dbDeleteHabit(oldName);
        await dbPutHabit(item);
      } else {
        if (name !== oldName) await dbDeleteTask(oldName);
        await dbPutTask(item);
      }

      await dbAddToSyncQueue('deleteItem', { action: 'deleteItem', type, name: oldName });
      await dbAddToSyncQueue('addItem', {
        action: 'addItem', type, name,
        time: time || '', place: place || '',
        behaviorType: behaviorType || 'Good',
        remind: remind ? 'true' : 'false',
        priority: priority,
        startDate, deadline,
        originalDeadline: item.originalDeadline || '',
        deadlineExtensions: JSON.stringify(item.deadlineExtensions || []),
        isTemporary: type === 'Task' ? (isTemporary ? 'true' : 'false') : 'false',
        removeAfterCompletion: type === 'Task' ? (removeAfterCompletion ? 'true' : 'false') : undefined,
        objective: type === 'Task' ? objective : '',
        subtasks: type === 'Task' ? JSON.stringify(currentSubtasks) : '[]',
        nextActions: type === 'Task' ? JSON.stringify(item.nextActions || []) : '[]',
        recurrence: type === 'Task' ? JSON.stringify(recurrence) : '[]',
        target: item.target || '',
        fallbackAction: item.fallbackAction || '',
        replacementAction: item.replacementAction || '',
        isCompleted: item.isCompleted ? 'true' : 'false',
        prevHabit: item.prevHabit || '',
        nextHabit: item.nextHabit || ''
      });

      if (remind && time) scheduleNotificationViaSW(name, time, type);

      showToast(navigator.onLine ? `${type} updated successfully` : `${type} updated locally — will sync when online`);
      if (navigator.onLine) syncToSheets();

      closeAddItemModal();
      const items = type === 'Habit' ? await dbGetAllHabits() : await dbGetAllTasks();
      renderList(items, type, 'list');
      await updateClientReminders();
      saveBtn.disabled = false;
      return;
    }

    // New item
    if (type === 'Habit') {
      await dbPutHabit(item);
    } else {
      await dbPutTask(item);
    }

    await dbAddToSyncQueue('addItem', {
      action: 'addItem', type, name,
      time: time || '', place: place || '',
      behaviorType: behaviorType || 'Good',
      remind: remind ? 'true' : 'false',
      priority: priority,
      startDate, deadline,
      originalDeadline: item.originalDeadline || '',
      deadlineExtensions: JSON.stringify(item.deadlineExtensions || []),
      isTemporary: type === 'Task' ? (isTemporary ? 'true' : 'false') : 'false',
      removeAfterCompletion: type === 'Task' ? (removeAfterCompletion ? 'true' : 'false') : undefined,
      objective: type === 'Task' ? objective : '',
      subtasks: type === 'Task' ? JSON.stringify(currentSubtasks) : '[]',
      nextActions: type === 'Task' ? JSON.stringify(item.nextActions || []) : '[]',
      recurrence: type === 'Task' ? JSON.stringify(recurrence) : '[]',
      target: item.target || '',
      fallbackAction: item.fallbackAction || '',
      replacementAction: item.replacementAction || '',
      isCompleted: 'false',
      prevHabit: '', nextHabit: ''
    });

    if (remind && time) scheduleNotificationViaSW(name, time, type);

    showToast(navigator.onLine ? `${type} created successfully` : `${type} saved locally — will sync when online`);
    if (navigator.onLine) syncToSheets();

    closeAddItemModal();
    const items = type === 'Habit' ? await dbGetAllHabits() : await dbGetAllTasks();
    renderList(items, type, 'list');
    await updateClientReminders();
    saveBtn.disabled = false;
    saveBtn.textContent = `Create ${type}`;
  } catch (err) {
    saveBtn.disabled = false;
    saveBtn.textContent = `Create ${type}`;
    console.error(err);
  }
}

function initAddItemModal(type) {
  const trigger = document.getElementById('add-item-trigger-btn');
  const close = document.getElementById('add-modal-close');
  const save = document.getElementById('add-item-save-btn');
  const overlay = document.getElementById('add-item-overlay');

  if (trigger) trigger.addEventListener('click', () => {
    requestNotificationPermission();
    openAddItemModal();
  });
  if (close) close.addEventListener('click', closeAddItemModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAddItemModal();
    });
  }
  if (save) save.addEventListener('click', () => handleAddItemSave(type));
  initSubtaskAddButton();

  // Habit type toggle for growth vs quit fields
  const typeSelect = document.getElementById('new-item-type');
  const growthFields = document.getElementById('growth-habit-config-fields');
  const quitFields = document.getElementById('quit-habit-config-fields');
  const nameLabel = document.getElementById('new-item-name-label');
  const nameInput = document.getElementById('new-item-name');
  if (typeSelect && growthFields && quitFields) {
    typeSelect.addEventListener('change', () => {
      const isBad = typeSelect.value === 'Bad';
      growthFields.style.display = isBad ? 'none' : 'block';
      quitFields.style.display = isBad ? 'block' : 'none';
      if (nameLabel) nameLabel.textContent = isBad ? 'Behavior being stopped *' : 'Habit Name *';
      if (nameInput) nameInput.placeholder = isBad ? 'e.g. Late night scrolling, Nail biting' : 'e.g. Morning Exercise, Read 30 mins';
    });
  }

  // Weekday toggle buttons
  const recurrence = document.getElementById('new-item-recurrence');
  if (recurrence) {
    recurrence.querySelectorAll('.weekday-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
  }
}

// ============================================================
// Notifications & Reminders — Service Worker Based
// ============================================================

async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

async function scheduleNotificationViaSW(name, timeString, itemType) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'schedule-notification',
    payload: { name, timeString, itemType }
  });

  if (timeString) {
    const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const ampm = match[3];

      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
      }

      const now = new Date();
      const reminderTime = new Date();
      reminderTime.setHours(hours, minutes, 0, 0);

      if (reminderTime <= now) {
        reminderTime.setDate(reminderTime.getDate() + 1);
      }

      try {
        await dbSaveReminder(name, reminderTime.getTime(), itemType);
      } catch(e) {
        console.warn('Failed to save offline reminder:', e);
      }
    }
  }
}

async function scheduleLoggingReminderViaSW(name, timeString, itemType) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'schedule-logging-reminder',
    payload: { name, timeString, itemType }
  });
}

function cancelNotificationViaSW(name) {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'cancel-notification',
    payload: { name }
  });
}

function playChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1318.51, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.2);
  } catch (e) {
    console.warn("Audio chime play blocked:", e);
  }
}

function sendLocalNotification(itemTitle) {
  const options = {
    body: `Time to log your status for: ${itemTitle}`,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'behavior-log-reminder',
    renotify: true
  };

  playChime();
  showInAppReminder(itemTitle);

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification('PivotMe Reminder', options).catch(e => console.warn('SW notification blocked:', e));
      });
    } else {
      new Notification('PivotMe Reminder', options);
    }
  } catch (e) {
    console.warn("System notification failed, relying on in-app banner", e);
  }
}

function showInAppReminder(itemTitle) {
  let banner = document.getElementById('in-app-reminder-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'in-app-reminder-banner';
    banner.style.position = 'fixed';
    banner.style.top = '-150px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.width = '90%';
    banner.style.maxWidth = '400px';
    banner.style.background = 'var(--bg-secondary)';
    banner.style.border = '1px solid var(--accent)';
    banner.style.borderRadius = '12px';
    banner.style.padding = '16px';
    banner.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5), 0 0 15px rgba(10, 132, 255, 0.3)';
    banner.style.zIndex = '99999';
    banner.style.transition = 'top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    banner.style.display = 'flex';
    banner.style.flexDirection = 'column';
    banner.style.gap = '8px';
    document.body.appendChild(banner);
  }
  
  banner.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--accent); display: flex;">${icons.bell || ''}</span>
        <h3 style="margin: 0; color: var(--text); font-size: 1.05rem; font-weight: 600;">Reminder</h3>
      </div>
      <button id="close-reminder-btn" style="background: none; border: none; color: var(--text-tertiary); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 4px;" aria-label="Close">${icons.close || 'Close'}</button>
    </div>
    <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem;">Time to log your status for:<br><strong style="color: var(--accent);">${itemTitle}</strong></p>
    <button id="log-now-btn" style="margin-top: 8px; background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 10px; font-weight: 600; cursor: pointer;">Log Now</button>
  `;
  
  setTimeout(() => { banner.style.top = '20px'; }, 50);
  
  const closeBanner = () => { banner.style.top = '-150px'; };
  
  document.getElementById('close-reminder-btn').onclick = closeBanner;
  document.getElementById('log-now-btn').onclick = () => {
    closeBanner();
    findItemAndOpenModal(itemTitle);
  };
  
  setTimeout(closeBanner, 30000);
}

async function findItemAndOpenModal(name) {
  const habits = await dbGetAllHabits();
  const tasks = await dbGetAllTasks();
  
  let item = habits.find(h => h.name === name);
  if (item) {
    if (window.location.pathname.includes('tasks.html')) window.location.href = 'index.html';
    else openModal(item, 'Habit');
    return;
  }
  
  item = tasks.find(t => t.name === name);
  if (item) {
    if (!window.location.pathname.includes('tasks.html')) window.location.href = 'tasks.html';
    else openModal(item, 'Task');
  }
}

// ============================================================
// Client-Side Persistent Alarm Fallbacks
// ============================================================
let firedRemindersToday = new Set();
let clientReminderIntervalId = null;

async function startClientReminderPoll() {
  if (clientReminderIntervalId) clearInterval(clientReminderIntervalId);
  clientReminderIntervalId = setInterval(checkAndFireReminders, 15000);
  await checkAndFireReminders();
}

async function checkAndFireReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA');
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  try {
    const habits = await dbGetAllHabits();
    const tasks = await dbGetAllTasks();
    const items = [...habits.map(h => ({ ...h, type: 'Habit' })), ...tasks.map(t => ({ ...t, type: 'Task' }))];

    items.forEach(item => {
      if (item.remind && item.time) {
        const match = item.time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (match) {
          let hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const ampm = match[3];

          if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
          }

          if (currentHour === hours && currentMinute === minutes) {
            const key = `${item.name}|${todayStr}`;
            if (!firedRemindersToday.has(key)) {
              firedRemindersToday.add(key);
              sendLocalNotification(item.name);
            }
          }
        }
      }
    });
  } catch (err) {
    console.warn('[Client Reminder] Poll error:', err);
  }
}

async function updateClientReminders() {
  await checkAndFireReminders();
}

// ============================================================
// Task Deadline Prompts
// ============================================================
async function checkPendingDeadlineTasks() {
  // Non-intrusive: do not interrupt the user with automatic blocking modal popups.
  // Deadlines and overdue statuses are displayed naturally on task cards, details, and plan views.
  return;
}

// ============================================================
// Common Init (runs on every page)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initModal();
  initSettingsModal();
  initLinkHabitModal();

  const isTasksPage = window.location.pathname.includes('tasks.html');
  const isPlanPage = window.location.pathname.includes('plan.html');
  const isReflectionPage = window.location.pathname.includes('reflection.html');
  const isHelpPage = window.location.pathname.includes('help.html');

  if (!isPlanPage && !isReflectionPage && !isHelpPage) {
    initAddItemModal(isTasksPage ? 'Task' : 'Habit');
  }

  requestNotificationPermission();

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  dbInit().then(async () => {
    await startClientReminderPoll();
  });
});

// ============================================================
// Task Details Page Logic
// ============================================================

async function initTaskDetailsPage() {
  initTheme();
  initSubtaskAddButton();
  initActionAddButton();
  initSubtaskModal();
  initModal();

  const urlParams = new URLSearchParams(window.location.search);
  const taskName = urlParams.get('task');

  if (!taskName) {
    document.getElementById('loading').innerHTML = '<p>No task specified.</p>';
    return;
  }

  try {
    await dbInit();
    const task = await dbGetTask(taskName);

    if (!task) {
      document.getElementById('loading').innerHTML = '<p>Task not found.</p>';
      return;
    }

    modalState = {
      name: task.name,
      type: 'Task',
      status: '',
      reason: '',
      behaviorType: 'Good',
      item: task
    };

    document.getElementById('task-title').textContent = task.name;
    
    renderTaskDetailsMeta(task);

    // Reset UI state for main task log
    document.querySelectorAll('.status-btn').forEach(b => {
      if (!b.id.startsWith('subtask-')) b.className = 'status-btn';
    });
    
    const taskDoneSection = document.getElementById('task-done-section');
    const taskPartialSection = document.getElementById('task-partial-section');
    const taskSkippedSection = document.getElementById('task-skipped-section');
    const mainLogSection = document.getElementById('main-task-log-section');
    
    if (mainLogSection) mainLogSection.style.display = 'block';
    if (taskDoneSection) taskDoneSection.style.display = 'none';
    if (taskPartialSection) taskPartialSection.style.display = 'none';
    if (taskSkippedSection) taskSkippedSection.style.display = 'none';
    
    const notesEl = document.getElementById('notes');
    if (notesEl) notesEl.value = '';
    
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Save Task Log';
      saveBtn.classList.remove('saved');
      
      const newSaveBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      
      newSaveBtn.addEventListener('click', async () => {
        await handleSave();
        window.location.href = 'tasks.html';
      });
    }

    // Main Task Log Status Buttons
    ['status-btn-done', 'status-btn-partial', 'status-btn-skipped'].forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.onclick = () => {
        ['status-btn-done', 'status-btn-partial', 'status-btn-skipped'].forEach(bId => {
          const b = document.getElementById(bId);
          if (b) b.className = 'status-btn';
        });
        const status = btn.dataset.status;
        const statusClass = status.toLowerCase().replace(/\s+/g, '-');
        btn.classList.add(`active-${statusClass}`);
        modalState.status = status;

        if (taskDoneSection) taskDoneSection.style.display = status === 'Done' ? 'block' : 'none';
        if (taskPartialSection) taskPartialSection.style.display = status === 'Partially Done' ? 'block' : 'none';
        if (taskSkippedSection) taskSkippedSection.style.display = status === 'Skipped' ? 'block' : 'none';

        const sBtn = document.getElementById('save-btn');
        if (sBtn) {
          sBtn.disabled = false;
          sBtn.textContent = `Save Task Log (${status})`;
        }

        // Load smart suggestions for task-details main log
        loadTaskDetailsSuggestions(status, task.name);
      };
    });

    // Dismissible Guide Card preference
    const guideCard = document.getElementById('behavioral-guide-card');
    const dismissGuideBtn = document.getElementById('dismiss-guide-btn');
    if (guideCard) {
      if (localStorage.getItem('hideTaskGuideCard') === 'true') {
        guideCard.style.display = 'none';
      }
      if (dismissGuideBtn) {
        dismissGuideBtn.onclick = () => {
          guideCard.style.display = 'none';
          localStorage.setItem('hideTaskGuideCard', 'true');
        };
      }
    }

    // Main task log extension toggles
    const pExtToggle = document.getElementById('task-partial-extend-toggle');
    const pExtFields = document.getElementById('task-partial-extend-fields');
    if (pExtToggle && pExtFields) {
      pExtToggle.onchange = () => {
        pExtFields.style.display = pExtToggle.checked ? 'block' : 'none';
      };
    }
    const sExtToggle = document.getElementById('task-skipped-extend-toggle');
    const sExtFields = document.getElementById('task-skipped-extend-fields');
    if (sExtToggle && sExtFields) {
      sExtToggle.onchange = () => {
        sExtFields.style.display = sExtToggle.checked ? 'block' : 'none';
      };
    }

    renderSubtaskCards();

    // Setup subtask reminder controls
    const reminderTimeInput = document.getElementById('subtask-reminder-time');
    const setReminderBtn = document.getElementById('set-subtask-reminder-btn');

    if (reminderTimeInput && setReminderBtn) {
      if (task.subtaskReminderTime) {
        reminderTimeInput.value = task.subtaskReminderTime;
        setReminderBtn.textContent = `Update Reminder (${formatTimeForDisplay(task.subtaskReminderTime)})`;
      } else if (task.time) {
        reminderTimeInput.value = task.time;
      }

      setReminderBtn.onclick = async () => {
        const timeVal = reminderTimeInput.value;
        if (!timeVal) {
          showToast('Please select a reminder time');
          return;
        }

        task.subtaskReminderTime = timeVal;
        task.subtaskRemind = true;
        await dbPutTask(task);

        if (typeof scheduleNotificationViaSW === 'function') {
          scheduleNotificationViaSW(`${task.name} (Start Subtasks)`, timeVal, 'Task');
        }

        showToast(`Subtask reminder set for ${formatTimeForDisplay(timeVal)}`);
        setReminderBtn.textContent = `Update Reminder (${formatTimeForDisplay(timeVal)})`;
      };
    }

    // Setup top right trigger buttons
    const topAddSubBtn = document.getElementById('add-subtask-trigger-btn');
    if (topAddSubBtn) {
      topAddSubBtn.onclick = () => {
        openAddSubtaskModal('', task.name);
      };
    }
    const topAddActionBtn = document.getElementById('add-action-trigger-btn');
    if (topAddActionBtn) {
      topAddActionBtn.onclick = () => {
        openAddActionModal('', task.name);
      };
    }

    // Setup extend deadline button
    const extendBtn = document.getElementById('extend-deadline-btn');
    const extendDate = document.getElementById('extend-deadline-date');
    if (extendBtn && extendDate) {
      if (task.deadline) extendDate.value = task.deadline;
      extendBtn.addEventListener('click', async () => {
        const newDate = extendDate.value;
        if (!newDate) {
          showToast('Please select a new deadline');
          return;
        }
        
        extendBtn.disabled = true;
        extendBtn.textContent = 'Saving...';
        
        try {
          if (!task.originalDeadline) {
            task.originalDeadline = task.deadline || '';
          }
          task.deadline = newDate;
          if (!task.deadlineExtensions) task.deadlineExtensions = [];
          task.deadlineExtensions.push({
            newDeadline: newDate,
            reason: 'Extended via Task Details',
            date: new Date().toLocaleDateString('en-CA')
          });

          await dbPutTask(task);
          
          await dbAddToSyncQueue('updateItem', {
            action: 'updateItem',
            type: 'Task',
            ...task,
            subtasks: JSON.stringify(task.subtasks || []),
            nextActions: JSON.stringify(task.nextActions || [])
          });
          
          if (navigator.onLine) syncToSheets();
          
          showToast('Deadline extended');
          renderTaskDetailsMeta(task);
        } catch(e) {
          console.error('Error extending deadline:', e);
          showToast('Error extending deadline');
        } finally {
          extendBtn.disabled = false;
          extendBtn.textContent = 'Extend';
        }
      });
    }

    // Setup delete task button
    const delTaskBtn = document.getElementById('delete-item-btn');
    if (delTaskBtn) {
      delTaskBtn.onclick = async () => {
        if (!confirm(`Are you sure you want to delete task "${task.name}"?`)) return;
        await dbDeleteTask(task.name);
        await dbAddToSyncQueue('deleteItem', { action: 'deleteItem', name: task.name, type: 'Task' });
        if (navigator.onLine) syncToSheets();
        showToast('Task deleted');
        window.location.href = 'tasks.html';
      };
    }

    document.getElementById('loading').style.display = 'none';
    document.getElementById('task-content').style.display = 'block';
  } catch (err) {
    console.error('Failed to load task details:', err);
    document.getElementById('loading').innerHTML = '<p>Failed to load task details.</p>';
  }
}

function renderTaskDetailsMeta(task) {
  renderActiveDetailView();
}

// ============================================================
// Next Action Dedicated Page Logic (next-action.html)
// ============================================================

async function initNextActionPage() {
  initTheme();
  const urlParams = new URLSearchParams(window.location.search);
  const taskName = urlParams.get('task');
  const actionId = urlParams.get('actionId');

  const backBtn = document.getElementById('action-back-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      window.location.href = taskName ? `task-details.html?task=${encodeURIComponent(taskName)}` : 'tasks.html';
    };
  }

  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('action-content');

  if (!taskName || !actionId) {
    if (loadingEl) loadingEl.innerHTML = '<p>No Next Action specified. <a href="tasks.html" style="color:var(--accent);">Return to Tasks</a></p>';
    return;
  }

  try {
    await dbInit();
    const task = await dbGetTask(taskName);
    if (!task) {
      if (loadingEl) loadingEl.innerHTML = '<p>Parent task not found. <a href="tasks.html" style="color:var(--accent);">Return to Tasks</a></p>';
      return;
    }

    const actions = getTaskNextActions(task);
    task.nextActions = actions;
    const action = actions.find(a => (a.id && a.id === actionId) || a.name === actionId);

    if (!action) {
      if (loadingEl) loadingEl.innerHTML = `<p>Next Action not found. <a href="task-details.html?task=${encodeURIComponent(taskName)}" style="color:var(--accent);">Return to Task Details</a></p>`;
      return;
    }

    // Populate Overview Card
    const titleEl = document.getElementById('action-title');
    if (titleEl) titleEl.textContent = action.name;

    const dispNameEl = document.getElementById('action-display-name');
    if (dispNameEl) dispNameEl.textContent = action.name;

    const parentLink = document.getElementById('parent-task-link');
    if (parentLink) {
      parentLink.textContent = task.name;
      parentLink.href = `task-details.html?task=${encodeURIComponent(task.name)}`;
    }

    function updateStatusBadge() {
      const badgeEl = document.getElementById('action-status-badge');
      if (!badgeEl) return;
      const isDone = action.status === 'Done' || action.done;
      const curStatus = isDone ? 'Done' : (action.status || 'Pending');
      badgeEl.textContent = curStatus;
      if (curStatus === 'Done') {
        badgeEl.style.background = 'rgba(16, 185, 129, 0.15)';
        badgeEl.style.color = '#10b981';
        badgeEl.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      } else if (curStatus === 'Partially Done') {
        badgeEl.style.background = 'rgba(245, 158, 11, 0.15)';
        badgeEl.style.color = '#f59e0b';
        badgeEl.style.border = '1px solid rgba(245, 158, 11, 0.3)';
      } else if (curStatus === 'Skipped') {
        badgeEl.style.background = 'rgba(239, 68, 68, 0.15)';
        badgeEl.style.color = '#ef4444';
        badgeEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      } else {
        badgeEl.style.background = 'var(--surface-hover)';
        badgeEl.style.color = 'var(--text-secondary)';
        badgeEl.style.border = '1px solid var(--separator)';
      }
    }
    updateStatusBadge();

    // Meta Badges
    const pillsEl = document.getElementById('action-meta-pills');
    if (pillsEl) {
      pillsEl.innerHTML = '';
      if (action.priority || task.priority) {
        const pVal = action.priority || task.priority;
        const pBadge = document.createElement('span');
        const pLower = pVal.toLowerCase().replace(/[^a-z]/g, '');
        pBadge.className = `priority-badge priority-${pLower === 'dontdo' ? 'dontdo' : (pLower === 'optional' ? 'optional' : (pLower === 'important' ? 'important' : 'todo'))}`;
        pBadge.textContent = pVal;
        pillsEl.appendChild(pBadge);
      }
      if (action.time) {
        const tBadge = document.createElement('span');
        tBadge.className = 'meta-pill';
        tBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${formatTimeForDisplay(action.time)}`;
        pillsEl.appendChild(tBadge);
      }
      if (action.place) {
        const plBadge = document.createElement('span');
        plBadge.className = 'meta-pill';
        plBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${escapeHtml(action.place)}`;
        pillsEl.appendChild(plBadge);
      }
    }

    // Start / Log button
    const startLogBtn = document.getElementById('start-log-action-btn');
    const startLogText = document.getElementById('start-log-btn-text');
    if (startLogBtn) {
      if (action.status === 'Done' || action.done) {
        if (startLogText) startLogText.textContent = 'Log Another Execution';
      }
      startLogBtn.onclick = () => {
        const logCard = document.getElementById('action-logging-card');
        if (logCard) {
          logCard.scrollIntoView({ behavior: 'smooth' });
        }
      };
    }

    // Status selector buttons
    const btnDone = document.getElementById('status-btn-done');
    const btnPartial = document.getElementById('status-btn-partial');
    const btnSkipped = document.getElementById('status-btn-skipped');
    const secDone = document.getElementById('section-done');
    const secPartial = document.getElementById('section-partial');
    const secSkipped = document.getElementById('section-skipped');
    const saveBtn = document.getElementById('save-action-log-btn');

    let currentStatus = null;

    function setupStatusChips(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const chips = container.querySelectorAll('.priority-chip');
      chips.forEach(c => {
        c.onclick = () => {
          const wasActive = c.classList.contains('active');
          chips.forEach(x => x.classList.remove('active'));
          if (!wasActive) c.classList.add('active');
        };
      });
    }

    setupStatusChips('chips-done-physical');
    setupStatusChips('chips-done-mental');
    setupStatusChips('chips-partial-physical');
    setupStatusChips('chips-partial-mental');
    setupStatusChips('chips-skipped-physical');
    setupStatusChips('chips-skipped-mental');

    function selectStatus(status) {
      currentStatus = status;
      [btnDone, btnPartial, btnSkipped].forEach(b => {
        if (!b) return;
        b.classList.remove('active-done', 'active-partially-done', 'active-skipped');
      });

      if (secDone) secDone.style.display = status === 'Done' ? 'block' : 'none';
      if (secPartial) secPartial.style.display = status === 'Partially Done' ? 'block' : 'none';
      if (secSkipped) secSkipped.style.display = status === 'Skipped' ? 'block' : 'none';

      if (status === 'Done' && btnDone) btnDone.classList.add('active-done');
      if (status === 'Partially Done' && btnPartial) btnPartial.classList.add('active-partially-done');
      if (status === 'Skipped' && btnSkipped) btnSkipped.classList.add('active-skipped');

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = `Save ${status} Log`;
      }

      // Suggestions
      if (status === 'Done') {
        loadSuggestionsForField('completedWork', task.name, 'Done').then(suggs => {
          renderSuggestionChips('suggest-done-completed', 'done-completed', suggs);
        });
        loadSuggestionsForField('previousActivity', task.name, null).then(suggs => {
          renderSuggestionChips('suggest-done-before', 'done-before', suggs);
        });
        loadSuggestionsForField('place', null, null).then(suggs => {
          const defaultPlaces = ['Desk', 'Home', 'Office', 'Outside'];
          const finalPlaces = [...new Set([...suggs, ...defaultPlaces])].slice(0, 6);
          renderSuggestionChips('suggest-done-place', 'done-place', finalPlaces);
        });
      } else if (status === 'Partially Done') {
        loadSuggestionsForField('completedWork', task.name, 'Partially Done').then(suggs => {
          renderSuggestionChips('suggest-partial-completed', 'partial-completed', suggs);
        });
        loadSuggestionsForField('remainingWork', task.name, 'Partially Done').then(suggs => {
          renderSuggestionChips('suggest-partial-remaining', 'partial-remaining', suggs);
        });
        loadSuggestionsForField('previousActivity', task.name, null).then(suggs => {
          renderSuggestionChips('suggest-partial-before', 'partial-before', suggs);
        });
        loadSuggestionsForField('interruption', null, null).then(suggs => {
          const defaultInts = ['Phone notification', 'Meeting', 'Fatigue', 'Context switch'];
          const finalInts = [...new Set([...suggs, ...defaultInts])].slice(0, 6);
          renderSuggestionChips('suggest-partial-interruption', 'partial-interruption', finalInts);
        });
        loadSuggestionsForField('place', null, null).then(suggs => {
          const defaultPlaces = ['Desk', 'Home', 'Office', 'Outside'];
          const finalPlaces = [...new Set([...suggs, ...defaultPlaces])].slice(0, 6);
          renderSuggestionChips('suggest-partial-place', 'partial-place', finalPlaces);
        });
      } else if (status === 'Skipped') {
        loadSuggestionsForField('alternativeActivity', null, 'Skipped').then(suggs => {
          const defaultAlts = ['Social media', 'Browsing', 'Urgent chore', 'Resting'];
          const finalAlts = [...new Set([...suggs, ...defaultAlts])].slice(0, 6);
          renderSuggestionChips('suggest-skipped-activity', 'skipped-activity', finalAlts);
        });
        loadSuggestionsForField('previousActivity', task.name, null).then(suggs => {
          renderSuggestionChips('suggest-skipped-before', 'skipped-before', suggs);
        });
        loadSuggestionsForField('place', null, null).then(suggs => {
          const defaultPlaces = ['Desk', 'Home', 'Office', 'Outside'];
          const finalPlaces = [...new Set([...suggs, ...defaultPlaces])].slice(0, 6);
          renderSuggestionChips('suggest-skipped-place', 'skipped-place', finalPlaces);
        });
      }
    }

    if (btnDone) btnDone.onclick = () => selectStatus('Done');
    if (btnPartial) btnPartial.onclick = () => selectStatus('Partially Done');
    if (btnSkipped) btnSkipped.onclick = () => selectStatus('Skipped');

    // Pre-fill time inputs
    const currentTime = getCurrentTime();
    ['done-time', 'partial-time', 'skipped-time'].forEach(tid => {
      const tel = document.getElementById(tid);
      if (tel) tel.value = action.time || currentTime;
    });

    // Pre-fill places
    ['done-place', 'partial-place', 'skipped-place'].forEach(pid => {
      const pel = document.getElementById(pid);
      if (pel && action.place) pel.value = action.place;
    });

    // Default to Done or current action status
    if (action.status === 'Partially Done') {
      selectStatus('Partially Done');
    } else if (action.status === 'Skipped') {
      selectStatus('Skipped');
    } else {
      selectStatus('Done');
    }

    // Pre-fill completed work with action name
    const doneCompInput = document.getElementById('done-completed');
    if (doneCompInput && !doneCompInput.value) {
      doneCompInput.value = action.name;
    }
    const partCompInput = document.getElementById('partial-completed');
    if (partCompInput && !partCompInput.value && action.completedWork) {
      partCompInput.value = action.completedWork;
    }

    function getActiveChipValue(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return '';
      const active = container.querySelector('.priority-chip.active');
      return active ? active.dataset.value : '';
    }

    // Save Log Button Handler
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!currentStatus) {
          showToast('Please select an outcome status');
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        let completedWork = '';
        let remainingWork = '';
        let previousActivity = '';
        let alternativeActivity = '';
        let interruption = '';
        let physicalState = '';
        let mentalState = '';
        let placeVal = '';
        let timeVal = '';

        if (currentStatus === 'Done') {
          completedWork = (document.getElementById('done-completed') ? document.getElementById('done-completed').value.trim() : '') || action.name;
          previousActivity = document.getElementById('done-before') ? document.getElementById('done-before').value.trim() : '';
          physicalState = getActiveChipValue('chips-done-physical');
          mentalState = getActiveChipValue('chips-done-mental');
          placeVal = (document.getElementById('done-place') ? document.getElementById('done-place').value.trim() : '') || action.place || '';
          timeVal = (document.getElementById('done-time') ? document.getElementById('done-time').value : '') || getCurrentTime();
        } else if (currentStatus === 'Partially Done') {
          completedWork = document.getElementById('partial-completed') ? document.getElementById('partial-completed').value.trim() : '';
          remainingWork = document.getElementById('partial-remaining') ? document.getElementById('partial-remaining').value.trim() : '';
          previousActivity = document.getElementById('partial-before') ? document.getElementById('partial-before').value.trim() : '';
          physicalState = getActiveChipValue('chips-partial-physical');
          mentalState = getActiveChipValue('chips-partial-mental');
          interruption = document.getElementById('partial-interruption') ? document.getElementById('partial-interruption').value.trim() : '';
          placeVal = (document.getElementById('partial-place') ? document.getElementById('partial-place').value.trim() : '') || action.place || '';
          timeVal = (document.getElementById('partial-time') ? document.getElementById('partial-time').value : '') || getCurrentTime();
        } else if (currentStatus === 'Skipped') {
          alternativeActivity = document.getElementById('skipped-activity') ? document.getElementById('skipped-activity').value.trim() : '';
          previousActivity = document.getElementById('skipped-before') ? document.getElementById('skipped-before').value.trim() : '';
          physicalState = getActiveChipValue('chips-skipped-physical');
          mentalState = getActiveChipValue('chips-skipped-mental');
          placeVal = (document.getElementById('skipped-place') ? document.getElementById('skipped-place').value.trim() : '') || action.place || '';
          timeVal = (document.getElementById('skipped-time') ? document.getElementById('skipped-time').value : '') || getCurrentTime();
        }

        // Update action object
        action.status = currentStatus;
        action.done = (currentStatus === 'Done');
        if (action.done) action.completedDate = getTodayDate();
        if (completedWork) action.completedWork = completedWork;
        if (remainingWork) action.remainingWork = remainingWork;
        if (placeVal) action.place = placeVal;

        // Save task
        await dbPutTask(task);
        await dbAddToSyncQueue('updateItem', {
          action: 'updateItem',
          type: 'Task',
          ...task,
          nextActions: JSON.stringify(task.nextActions || []),
          subtasks: JSON.stringify(task.subtasks || [])
        });

        // Save Log
        const logEntry = {
          id: generateUUID(),
          name: task.name,
          type: 'NextAction',
          date: getTodayDate(),
          time: timeVal,
          status: currentStatus,
          reason: (currentStatus === 'Skipped' ? alternativeActivity : (currentStatus === 'Partially Done' ? interruption : '')),
          mentalState: mentalState,
          physicalState: physicalState,
          previousActivity: previousActivity,
          alternativeActivity: alternativeActivity,
          interruption: interruption,
          duration: '',
          place: placeVal,
          priority: action.priority || task.priority || '',
          completedWork: completedWork,
          outcome: currentStatus,
          problemsFaced: interruption,
          remainingWork: remainingWork,
          objective: task.objective || '',
          actionName: action.name,
          actionId: action.id || action.name,
          parentTaskName: task.name,
          loggedAt: new Date().toISOString()
        };

        await dbAddLog(logEntry);
        await dbAddToSyncQueue('saveLog', { action: 'saveLog', ...logEntry });

        if (navigator.onLine) syncToSheets();
        invalidateSuggestionCache();
        if (typeof clearReflectionCache === 'function') clearReflectionCache();

        updateStatusBadge();
        await renderActionExecutionHistory(task.name, action.name, action.id);

        saveBtn.textContent = 'Saved ✓';
        saveBtn.style.background = 'var(--success, #10b981)';
        showToast(`Logged Next Action as ${currentStatus}`);

        setTimeout(() => {
          saveBtn.disabled = false;
          saveBtn.textContent = `Save ${currentStatus} Log`;
          saveBtn.style.background = 'var(--accent)';
        }, 1500);
      };
    }

    // Render initial history
    await renderActionExecutionHistory(task.name, action.name, action.id);

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

  } catch (e) {
    console.error('Failed to initialize Next Action page:', e);
    if (loadingEl) loadingEl.innerHTML = '<p>Failed to load Next Action.</p>';
  }
}

async function renderActionExecutionHistory(taskName, actionName, actionId) {
  const listEl = document.getElementById('action-history-list');
  if (!listEl) return;

  try {
    const allLogs = await dbGetAllLogs();
    const logs = allLogs.filter(l => {
      const matchParent = (l.parentTaskName && l.parentTaskName === taskName) || (l.name === taskName);
      const matchAction = (l.actionId && (l.actionId === actionId || l.actionId === actionName)) ||
                          (l.actionName && l.actionName === actionName) ||
                          (l.subtaskName && l.subtaskName === actionName);
      return matchParent && matchAction;
    });

    logs.sort((a, b) => {
      const da = (a.date || '') + ' ' + (a.time || '');
      const db = (b.date || '') + ' ' + (b.time || '');
      return db.localeCompare(da);
    });

    if (logs.length === 0) {
      listEl.innerHTML = '<p style="font-size:0.85rem;color:var(--text-tertiary);margin:0;">No logs recorded for this Next Action yet.</p>';
      return;
    }

    listEl.innerHTML = '';
    logs.forEach(log => {
      const itemCard = document.createElement('div');
      itemCard.style.cssText = 'background:var(--surface-hover);border:1px solid var(--separator);border-radius:var(--radius-xs);padding:12px;margin-bottom:10px;';

      const headerRow = document.createElement('div');
      headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;';

      const dateSpan = document.createElement('span');
      dateSpan.style.cssText = 'font-size:0.8rem;font-weight:700;color:var(--text);';
      dateSpan.textContent = `${log.date || ''} ${log.time ? formatTimeForDisplay(log.time) : ''}`;

      const statusBadge = document.createElement('span');
      statusBadge.style.cssText = 'font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:4px;';
      if (log.status === 'Done') {
        statusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        statusBadge.style.color = '#10b981';
        statusBadge.textContent = 'Done';
      } else if (log.status === 'Partially Done') {
        statusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        statusBadge.style.color = '#f59e0b';
        statusBadge.textContent = 'Partially Done';
      } else if (log.status === 'Skipped') {
        statusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBadge.style.color = '#ef4444';
        statusBadge.textContent = 'Skipped';
      } else {
        statusBadge.style.background = 'var(--surface)';
        statusBadge.style.color = 'var(--text-secondary)';
        statusBadge.textContent = log.status || 'Logged';
      }

      headerRow.appendChild(dateSpan);
      headerRow.appendChild(statusBadge);
      itemCard.appendChild(headerRow);

      // Body rows
      if (log.completedWork) {
        const cwEl = document.createElement('p');
        cwEl.style.cssText = 'margin:0 0 4px 0;font-size:0.82rem;color:var(--text);';
        cwEl.innerHTML = `<strong>Completed:</strong> ${escapeHtml(log.completedWork)}`;
        itemCard.appendChild(cwEl);
      }
      if (log.remainingWork) {
        const rwEl = document.createElement('p');
        rwEl.style.cssText = 'margin:0 0 4px 0;font-size:0.82rem;color:var(--warning, #f59e0b);';
        rwEl.innerHTML = `<strong>Remaining:</strong> ${escapeHtml(log.remainingWork)}`;
        itemCard.appendChild(rwEl);
      }
      if (log.alternativeActivity) {
        const aaEl = document.createElement('p');
        aaEl.style.cssText = 'margin:0 0 4px 0;font-size:0.82rem;color:var(--danger, #ef4444);';
        aaEl.innerHTML = `<strong>Engaged in instead:</strong> ${escapeHtml(log.alternativeActivity)}`;
        itemCard.appendChild(aaEl);
      }
      if (log.interruption) {
        const intEl = document.createElement('p');
        intEl.style.cssText = 'margin:0 0 4px 0;font-size:0.82rem;color:var(--text-secondary);';
        intEl.innerHTML = `<strong>Interruption:</strong> ${escapeHtml(log.interruption)}`;
        itemCard.appendChild(intEl);
      }

      // Meta chips row
      const metaChips = [];
      if (log.physicalState) metaChips.push(`Phys: ${log.physicalState}`);
      if (log.mentalState) metaChips.push(`Ment: ${log.mentalState}`);
      if (log.previousActivity) metaChips.push(`Before: ${log.previousActivity}`);
      if (log.place) metaChips.push(`Place: ${log.place}`);

      if (metaChips.length > 0) {
        const mcEl = document.createElement('div');
        mcEl.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;';
        metaChips.forEach(c => {
          const chip = document.createElement('span');
          chip.style.cssText = 'font-size:0.7rem;background:var(--surface);color:var(--text-secondary);padding:2px 6px;border-radius:4px;border:1px solid var(--separator);';
          chip.textContent = c;
          mcEl.appendChild(chip);
        });
        itemCard.appendChild(mcEl);
      }

      listEl.appendChild(itemCard);
    });
  } catch (e) {
    console.error('Failed to render action execution history:', e);
  }
}

// ============================================================
// Global Modal Dismissal: Escape Key & Backdrop Click
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.keyCode === 27) {
    const activeOverlays = document.querySelectorAll('.modal-overlay.active');
    activeOverlays.forEach(overlay => {
      overlay.classList.remove('active');
    });
    document.body.style.overflow = '';
  }
});

document.addEventListener('click', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});

