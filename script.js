/* ============================================================
   Behavior Log — Main Script
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
 * Save a new log entry.
 * @param {string} type   — "Habit" or "Task"
 * @param {string} name   — name of the habit/task
 * @param {string} status — "Done", "Failed", or "Skipped"
 * @param {string} reason — failure/skip reason (optional)
 * @param {string} notes  — free-text notes (optional)
 * @param {string} date   — custom date override
 * @param {string} time   — custom time override
 */
async function saveLog(type, name, status, reason, notes, date, time) {
  return apiCall({
    action: 'saveLog',
    date: date || new Date().toLocaleDateString('en-CA'),
    time: time || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    type,
    name,
    status,
    reason: reason || '',
    notes: notes || ''
  });
}

/**
 * Save a new custom item (Habit or Task).
 * @param {string} type         — "Habit" or "Task"
 * @param {string} name         — item name
 * @param {string} time         — optional time
 * @param {string} place        — optional place
 * @param {string} behaviorType — "Good" or "Bad" (optional)
 * @param {boolean} remind      — whether reminder notification is active
 */
async function apiAddItem(type, name, time, place, behaviorType, remind) {
  return apiCall({
    action: 'addItem',
    type,
    name,
    time: time || '',
    place: place || '',
    behaviorType: behaviorType || 'Good',
    remind: remind ? 'true' : 'false'
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
// List Rendering
// ============================================================

/**
 * Render an array of items as clickable cards.
 * @param {Array}  items       — [{name, time?, place?, behaviorType?}, ...]
 * @param {string} type        — "Habit" or "Task"
 * @param {string} containerId — ID of the target container
 */
// State for infinite scroll pagination
let _renderedItems = [];
let _renderedType = '';
let _renderedContainerId = '';
let _shownCount = 6;
let _scrollObserver = null;

function renderList(items, type, containerId) {
  _renderedItems = items || [];
  _renderedType = type;
  _renderedContainerId = containerId;
  _shownCount = 6;
  
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
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = `${i * 0.05}s`;

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.justifyContent = 'space-between';

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = item.name;
    titleRow.appendChild(name);

    // Bad Habit Badge
    if (_renderedType === 'Habit' && item.behaviorType === 'Bad') {
      const badge = document.createElement('span');
      badge.textContent = 'To Quit';
      badge.style.fontSize = '0.68rem';
      badge.style.fontWeight = '700';
      badge.style.background = 'rgba(255, 69, 58, 0.15)';
      badge.style.color = '#ff453a';
      badge.style.padding = '3px 8px';
      badge.style.borderRadius = '20px';
      badge.style.marginLeft = '8px';
      titleRow.appendChild(badge);
    }
    card.appendChild(titleRow);

    // Optional meta (time, place, dates)
    const parts = [];
    if (item.time) parts.push(formatTimeForDisplay(item.time));
    if (item.place) parts.push(item.place);
    if (_renderedType === 'Task') {
      if (item.taskDate) parts.push(`Date: ${item.taskDate}`);
      if (item.startDate) parts.push(`Start: ${item.startDate}`);
      if (item.deadline) parts.push(`Deadline: ${item.deadline}`);
    }
    if (parts.length) {
      const meta = document.createElement('span');
      meta.className = 'card-meta';
      meta.textContent = parts.join(' · ');
      card.appendChild(meta);
    }

    card.addEventListener('click', () => openModal(item, _renderedType));
    container.appendChild(card);
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
 * Passes through non-standard strings unchanged.
 * @param {string} timeStr
 * @returns {string}
 */
function formatTimeForDisplay(timeStr) {
  if (!timeStr) return '';
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr; // Already in friendly format or non-parseable
  let h = parseInt(match[1]);
  const m = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

// ============================================================
// Modal
// ============================================================
let modalState = { name: '', type: '', status: '', reason: '', behaviorType: 'Good' };

/** Open the log modal for a specific habit/task. */
function openModal(item, type) {
  const name = item.name;
  const behaviorType = item.behaviorType || 'Good';
  modalState = { name, type, status: '', reason: '', behaviorType };

  document.getElementById('modal-title').textContent = name;
  document.getElementById('notes').value = '';

  // Setup Badge & Button Labels based on Habit Type
  const badge = document.getElementById('modal-badge');
  const textDone = document.getElementById('status-text-done');
  const textFailed = document.getElementById('status-text-failed');
  const notesField = document.getElementById('notes');

  // Show/hide quit-specific chips and configure notes placeholder
  const quitChips = document.querySelectorAll('.quit-chip');
  const resistSection = document.getElementById('resist-section');
  const resistNotes = document.getElementById('resist-notes');
  const reasonLabel = document.getElementById('reason-section-label');

  if (type === 'Task') {
    badge.textContent = 'Task';
    badge.style.color = 'var(--accent)';
    textDone.textContent = 'Done';
    textFailed.textContent = 'Failed';
    quitChips.forEach(c => c.classList.add('hidden'));
    if (notesField) notesField.placeholder = 'Notes (optional)';
    if (reasonLabel) reasonLabel.textContent = 'What happened?';
  } else if (behaviorType === 'Bad') {
    badge.textContent = 'Bad Habit (To Quit)';
    badge.style.color = 'var(--danger)';
    textDone.textContent = 'Resisted (Success)';
    textFailed.textContent = 'Indulged (Failure)';
    quitChips.forEach(c => c.classList.remove('hidden'));
    if (notesField) notesField.placeholder = 'What triggered you? What could you do differently next time?';
    if (reasonLabel) reasonLabel.textContent = 'What made you give in?';
  } else {
    badge.textContent = 'Good Habit (To Build)';
    badge.style.color = 'var(--success)';
    textDone.textContent = 'Done';
    textFailed.textContent = 'Failed';
    quitChips.forEach(c => c.classList.add('hidden'));
    if (notesField) notesField.placeholder = 'Notes (optional)';
    if (reasonLabel) reasonLabel.textContent = 'What happened?';
  }

  // Pre-fill Date & Time inputs with local current date & time
  const now = new Date();
  const dateInput = document.getElementById('log-date');
  const timeInput = document.getElementById('log-time');
  if (dateInput) {
    dateInput.value = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
  }
  if (timeInput) {
    timeInput.value = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // HH:MM
  }

  // Pre-fill and configure reminder toggle
  const remindWrapper = document.getElementById('log-remind-wrapper');
  const remindCheckbox = document.getElementById('log-remind-checkbox');
  if (remindWrapper && remindCheckbox) {
    if (item.time) {
      remindWrapper.style.display = 'block';
      remindCheckbox.checked = !!item.remind;
      
      // Dynamically handle reminder toggle
      remindCheckbox.onclick = async () => {
        const newRemindState = remindCheckbox.checked;
        
        // Update locally in IndexedDB immediately
        item.remind = newRemindState;
        if (type === 'Habit') {
          await dbPutHabit(item);
        } else {
          await dbPutTask(item);
        }

        // Queue sync
        await dbAddToSyncQueue('toggleReminder', {
          action: 'toggleReminder',
          type,
          name,
          remind: newRemindState ? 'true' : 'false'
        });

        showToast(`Reminder ${newRemindState ? 'Enabled' : 'Disabled'}`);

        if (newRemindState) {
          scheduleNotificationViaSW(name, item.time, type);
        } else {
          cancelNotificationViaSW(name);
        }

        // Try to sync immediately if online
        if (navigator.onLine) syncToSheets();
      };
    } else {
      remindWrapper.style.display = 'none';
    }
  }

  // Reset status buttons
  document.querySelectorAll('.status-btn').forEach((b) => {
    b.className = 'status-btn';
  });

  // Reset reason chips
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));

  // Hide reason section and resist section
  document.getElementById('reason-section').classList.remove('visible');
  if (resistSection) resistSection.classList.remove('visible');
  if (resistNotes) resistNotes.value = '';

  // Clean up and reset new sections
  const buildDoneNotes = document.getElementById('build-done-notes');
  const buildFailNotes = document.getElementById('build-fail-notes');
  const buildBetterNotes = document.getElementById('build-better-notes');
  const taskDoneNotes = document.getElementById('task-done-notes');
  const taskFailNotes = document.getElementById('task-fail-notes');

  if (buildDoneNotes) buildDoneNotes.value = '';
  if (buildFailNotes) buildFailNotes.value = '';
  if (buildBetterNotes) buildBetterNotes.value = '';
  if (taskDoneNotes) taskDoneNotes.value = '';
  if (taskFailNotes) taskFailNotes.value = '';

  const buildDoneSection = document.getElementById('build-done-section');
  const buildFailSection = document.getElementById('build-fail-section');
  const taskDoneSection = document.getElementById('task-done-section');
  const taskFailSection = document.getElementById('task-fail-section');

  if (buildDoneSection) buildDoneSection.classList.remove('visible');
  if (buildFailSection) buildFailSection.classList.remove('visible');
  if (taskDoneSection) taskDoneSection.classList.remove('visible');
  if (taskFailSection) taskFailSection.classList.remove('visible');

  // Reset save button
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Save Log';
  saveBtn.classList.remove('saved');

  // Show modal
  document.getElementById('modal-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/** Close the log modal. */
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.body.style.overflow = '';
}

/** Enable the save button only when required fields are filled. */
function updateSaveButton() {
  const btn = document.getElementById('save-btn');
  if (!modalState.status) {
    btn.disabled = true;
    return;
  }

  if (modalState.type === 'Habit') {
    if (modalState.status === 'Done') {
      if (modalState.behaviorType === 'Bad') {
        // Quit habit resisted — require resist notes
        const resistNotes = document.getElementById('resist-notes');
        btn.disabled = !(resistNotes && resistNotes.value.trim());
      } else {
        // Build (good) habit done — require "how I did it"
        const buildDoneNotes = document.getElementById('build-done-notes');
        btn.disabled = !(buildDoneNotes && buildDoneNotes.value.trim());
      }
    } else if (modalState.status === 'Failed') {
      if (modalState.behaviorType === 'Good') {
        // Build habit failed — require both fail reasons and how to do better
        const failNotes = document.getElementById('build-fail-notes');
        const betterNotes = document.getElementById('build-better-notes');
        btn.disabled = !(failNotes && failNotes.value.trim() && betterNotes && betterNotes.value.trim());
      } else {
        btn.disabled = !modalState.reason;
      }
    } else if (modalState.status === 'Skipped') {
      btn.disabled = !modalState.reason;
    }
  } else if (modalState.type === 'Task') {
    if (modalState.status === 'Done') {
      // Task completed — require how it was achieved
      const taskDoneNotes = document.getElementById('task-done-notes');
      btn.disabled = !(taskDoneNotes && taskDoneNotes.value.trim());
    } else if (modalState.status === 'Failed') {
      // Task failed — require why it failed
      const taskFailNotes = document.getElementById('task-fail-notes');
      btn.disabled = !(taskFailNotes && taskFailNotes.value.trim());
    } else if (modalState.status === 'Skipped') {
      btn.disabled = !modalState.reason;
    }
  }
}

/** Handle the save button click — offline-first. */
async function handleSave() {
  const btn = document.getElementById('save-btn');
  let notes = document.getElementById('notes').value.trim();
  const dateVal = document.getElementById('log-date').value;
  const timeVal = document.getElementById('log-time').value;

  if (modalState.type === 'Habit') {
    if (modalState.behaviorType === 'Bad' && modalState.status === 'Done') {
      // For quit habits that were resisted, capture resist notes
      const resistNotes = document.getElementById('resist-notes');
      if (resistNotes && resistNotes.value.trim()) {
        notes = '[RESISTED] ' + resistNotes.value.trim();
      }
    } else if (modalState.behaviorType === 'Good' && modalState.status === 'Done') {
      // For build habits completed — capture how I did it
      const buildDoneNotes = document.getElementById('build-done-notes');
      if (buildDoneNotes && buildDoneNotes.value.trim()) {
        notes = '[DONE] How I did it: ' + buildDoneNotes.value.trim();
      }
    } else if (modalState.behaviorType === 'Good' && modalState.status === 'Failed') {
      // For build habits that failed, capture how it failed and how to do better
      const failNotes = document.getElementById('build-fail-notes');
      const betterNotes = document.getElementById('build-better-notes');
      if (failNotes && betterNotes) {
        notes = `[FAILED] How I failed: ${failNotes.value.trim()} | How to do better: ${betterNotes.value.trim()}`;
      }
    }
  } else if (modalState.type === 'Task') {
    if (modalState.status === 'Done') {
      // Task completed notes
      const taskDoneNotes = document.getElementById('task-done-notes');
      if (taskDoneNotes) {
        notes = '[DONE] How I achieved it: ' + taskDoneNotes.value.trim();
      }
    } else if (modalState.status === 'Failed') {
      // Task failed notes
      const taskFailNotes = document.getElementById('task-fail-notes');
      if (taskFailNotes) {
        notes = '[FAILED] Why I failed: ' + taskFailNotes.value.trim();
      }
    }
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const logEntry = {
    date: dateVal || new Date().toLocaleDateString('en-CA'),
    time: timeVal || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    type: modalState.type,
    name: modalState.name,
    status: modalState.status,
    reason: modalState.reason || '',
    notes: notes || ''
  };

  try {
    // 1. Save to IndexedDB immediately (always succeeds)
    await dbAddLog(logEntry);

    // 2. Queue for sync to Sheets
    await dbAddToSyncQueue('saveLog', {
      action: 'saveLog',
      ...logEntry
    });

    // 3. Save reflection entry (strategy / fail analysis) to separate Reflections store
    const reflEntry = {
      date:   logEntry.date,
      type:   logEntry.type,
      name:   logEntry.name,
      status: logEntry.status,
      strategy:   '',
      failReason: '',
      betterPlan: '',
      synced: false
    };

    if (modalState.type === 'Habit' && modalState.behaviorType === 'Good' && modalState.status === 'Done') {
      const bd = document.getElementById('build-done-notes');
      reflEntry.strategy = bd ? bd.value.trim() : '';
    } else if (modalState.type === 'Habit' && modalState.behaviorType === 'Bad' && modalState.status === 'Done') {
      const rn = document.getElementById('resist-notes');
      reflEntry.strategy = rn ? rn.value.trim() : '';
    } else if (modalState.type === 'Habit' && modalState.behaviorType === 'Good' && modalState.status === 'Failed') {
      const fn = document.getElementById('build-fail-notes');
      const bn = document.getElementById('build-better-notes');
      reflEntry.failReason = fn ? fn.value.trim() : '';
      reflEntry.betterPlan = bn ? bn.value.trim() : '';
    } else if (modalState.type === 'Task' && modalState.status === 'Done') {
      const td = document.getElementById('task-done-notes');
      reflEntry.strategy = td ? td.value.trim() : '';
    } else if (modalState.type === 'Task' && modalState.status === 'Failed') {
      const tf = document.getElementById('task-fail-notes');
      reflEntry.failReason = tf ? tf.value.trim() : '';
    }

    // Only save reflection if there's meaningful content
    const hasReflection = reflEntry.strategy || reflEntry.failReason || reflEntry.betterPlan;
    if (hasReflection) {
      await dbAddReflection(reflEntry);
    }

    btn.textContent = '✓ Saved';
    btn.classList.add('saved');

    if (navigator.onLine) {
      showToast(`${modalState.name} logged as ${modalState.status}`);
      // Sync in background
      syncToSheets();
    } else {
      showToast(`Saved locally — will sync when online`);
    }

    setTimeout(closeModal, 600);
  } catch (err) {
    btn.textContent = 'Error — Tap to Retry';
    btn.disabled = false;
    console.error('Save failed:', err);
  }
}

/** Handle the item delete button click — offline-first. */
async function handleDeleteItem() {
  if (!confirm(`Are you sure you want to delete "${modalState.name}"? This removes it permanently.`)) {
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
    if (isTasksPage) {
      const items = await dbGetAllTasks();
      renderList(items, 'Task', 'list');
    } else {
      const items = await dbGetAllHabits();
      renderList(items, 'Habit', 'list');
    }

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
  if (!overlay) return;

  // Close button
  document.getElementById('modal-close').addEventListener('click', closeModal);

  // Tap outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Status buttons
  document.querySelectorAll('.status-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Clear all active states
      document.querySelectorAll('.status-btn').forEach((b) => {
        b.className = 'status-btn';
      });

      // Set active state with status-specific class
      const status = btn.dataset.status;
      btn.classList.add(`active-${status.toLowerCase()}`);
      modalState.status = status;

      // Get sections
      const reasonSection   = document.getElementById('reason-section');
      const resistSection   = document.getElementById('resist-section');
      const buildDoneSection = document.getElementById('build-done-section');
      const buildFailSection = document.getElementById('build-fail-section');
      const taskDoneSection = document.getElementById('task-done-section');
      const taskFailSection = document.getElementById('task-fail-section');

      // Hide all dynamic sections first
      if (reasonSection)    reasonSection.classList.remove('visible');
      if (resistSection)    resistSection.classList.remove('visible');
      if (buildDoneSection) buildDoneSection.classList.remove('visible');
      if (buildFailSection) buildFailSection.classList.remove('visible');
      if (taskDoneSection)  taskDoneSection.classList.remove('visible');
      if (taskFailSection)  taskFailSection.classList.remove('visible');

      // Clear reason unless using chips
      modalState.reason = '';
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));

      if (modalState.type === 'Habit') {
        const isQuitHabit = modalState.behaviorType === 'Bad';
        if (status === 'Done') {
          if (isQuitHabit) {
            // Bad habit resisted
            if (resistSection) resistSection.classList.add('visible');
          } else {
            // Good (build) habit done — show how I did it
            if (buildDoneSection) buildDoneSection.classList.add('visible');
          }
        } else if (status === 'Failed') {
          if (isQuitHabit) {
            // Bad habit indulged — show reason chips
            if (reasonSection) reasonSection.classList.add('visible');
          } else {
            // Good habit failed — show text reflection inputs
            if (buildFailSection) buildFailSection.classList.add('visible');
          }
        } else if (status === 'Skipped') {
          if (reasonSection) reasonSection.classList.add('visible');
        }
      } else if (modalState.type === 'Task') {
        if (status === 'Done') {
          // Task completed
          if (taskDoneSection) taskDoneSection.classList.add('visible');
        } else if (status === 'Failed') {
          // Task failed
          if (taskFailSection) taskFailSection.classList.add('visible');
        } else if (status === 'Skipped') {
          if (reasonSection) reasonSection.classList.add('visible');
        }
      }

      updateSaveButton();
    });
  });

  // Wire up change/input listener for all dynamic textareas
  const inputsToTrack = ['resist-notes', 'build-done-notes', 'build-fail-notes', 'build-better-notes', 'task-done-notes', 'task-fail-notes'];
  inputsToTrack.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateSaveButton);
    }
  });

  // Reason chips
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      modalState.reason = chip.dataset.reason;
      updateSaveButton();
    });
  });

  // Save button
  document.getElementById('save-btn').addEventListener('click', handleSave);

  // Delete button
  const delBtn = document.getElementById('delete-item-btn');
  if (delBtn) delBtn.addEventListener('click', handleDeleteItem);
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
 * 1. Try IndexedDB first
 * 2. If empty + online → restore from Sheets
 * 3. If empty + offline → show empty state
 * 4. If has data → render, then background sync
 */
async function initHabitsPage() {
  const loading = document.getElementById('loading');

  try {
    // Initialize IndexedDB
    await dbInit();

    // Check if IndexedDB has data
    const hasData = await dbHasData();

    if (!hasData && navigator.onLine && API_URL) {
      // First load or cache cleared — restore from Sheets
      loading.innerHTML = '<div class="loading-spinner"></div><p>Restoring data from cloud…</p>';
      await restoreFromSheets();
    } else if (!hasData && !navigator.onLine) {
      loading.classList.add('hidden');
      renderList([], 'Habit', 'list');
      return;
    }

    // Load from IndexedDB (the primary source)
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

    // Background sync: push any queued changes
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
 * Same offline-first pattern as habits.
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

    // Schedule active notification reminders via SW
    if (items && Array.isArray(items)) {
      items.forEach((item) => {
        if (item.remind && item.time) {
          scheduleNotificationViaSW(item.name, item.time, 'Task');
        }
      });
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
// Service Worker Registration
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.log('Service worker registration failed:', err);
    });
  });
}

// ============================================================
// Settings Modal
// ============================================================

/** Open the settings modal. */
function openSettingsModal() {
  const overlay = document.getElementById('settings-overlay');
  const input = document.getElementById('api-url-input');
  if (overlay && input) {
    input.value = API_URL;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

/** Close the settings modal. */
function closeSettingsModal() {
  const overlay = document.getElementById('settings-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/** Save Settings to localStorage and reload page. */
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

/** Clear all data, unregister service workers, delete caches, and reload. */
async function resetAppAndClearCache() {
  if (!confirm("Are you sure you want to reset the app? This clears the saved Apps Script URL and deletes all local file caches to fetch the latest version.")) {
    return;
  }

  // 1. Clear local storage
  localStorage.clear();

  // 2. Clear IndexedDB
  try {
    await dbClearAll();
  } catch (e) {
    console.warn('Could not clear IndexedDB:', e);
  }

  // 3. Unregister service workers
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (let registration of registrations) {
      await registration.unregister();
    }
  }

  // 4. Clear PWA caches
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

/** Initialize settings modal events. */
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
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
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
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // We've used the prompt, and can't use it again, discard it
      deferredPrompt = null;
      // Hide the install button
      installBtn.classList.add('hidden');
    });
  }
});

window.addEventListener('appinstalled', (evt) => {
  console.log('Behavior Log was installed.');
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.classList.add('hidden');
  }
});

// ============================================================
// Add Item Modal & Logic — Offline-First
// ============================================================

/** Open the add item modal. */
function openAddItemModal() {
  const overlay = document.getElementById('add-item-overlay');
  if (overlay) {
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-time').value = '';
    document.getElementById('new-item-place').value = '';
    
    // Clear new task date fields if they exist
    const taskDateInput = document.getElementById('new-item-task-date');
    const startDateInput = document.getElementById('new-item-start-date');
    const deadlineInput = document.getElementById('new-item-deadline');
    
    if (taskDateInput) taskDateInput.value = '';
    if (startDateInput) startDateInput.value = '';
    if (deadlineInput) deadlineInput.value = '';

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

/** Close the add item modal. */
function closeAddItemModal() {
  const overlay = document.getElementById('add-item-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/** Submit new habit/task item — saves to IndexedDB first, then queues sync. */
async function handleAddItemSave(type) {
  const nameInput = document.getElementById('new-item-name');
  const timeInput = document.getElementById('new-item-time');
  const placeInput = document.getElementById('new-item-place');
  const saveBtn = document.getElementById('add-item-save-btn');

  const name = nameInput.value.trim();
  const time = timeInput.value.trim();
  const place = placeInput.value.trim();

  // Retrieve task specific fields if type is Task
  const taskDateInput = document.getElementById('new-item-task-date');
  const startDateInput = document.getElementById('new-item-start-date');
  const deadlineInput = document.getElementById('new-item-deadline');

  const taskDate = (type === 'Task' && taskDateInput) ? taskDateInput.value : '';
  const startDate = (type === 'Task' && startDateInput) ? startDateInput.value : '';
  const deadline = (type === 'Task' && deadlineInput) ? deadlineInput.value : '';

  // Retrieve behaviorType from select dropdown if on Habits page
  const typeSelect = document.getElementById('new-item-type');
  const behaviorType = (type === 'Habit' && typeSelect) ? typeSelect.value : 'Good';

  // Retrieve remind checkbox state
  const remindCheckbox = document.getElementById('new-item-remind');
  const remind = remindCheckbox ? remindCheckbox.checked : false;

  if (!name) {
    showToast('Name is required');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    // 1. Save to IndexedDB immediately
    const item = {
      name,
      time: time || '',
      place: place || '',
      behaviorType: behaviorType || 'Good',
      remind: remind,
      taskDate: taskDate,
      startDate: startDate,
      deadline: deadline
    };

    if (type === 'Habit') {
      await dbPutHabit(item);
    } else {
      await dbPutTask(item);
    }

    // 2. Queue for sync to Sheets
    await dbAddToSyncQueue('addItem', {
      action: 'addItem',
      type,
      name,
      time: time || '',
      place: place || '',
      behaviorType: behaviorType || 'Good',
      remind: remind ? 'true' : 'false',
      taskDate: taskDate,
      startDate: startDate,
      deadline: deadline
    });

    // 3. Schedule notification via SW if reminder is enabled
    if (remind && time) {
      scheduleNotificationViaSW(name, time, type);
    }

    if (navigator.onLine) {
      showToast(`${type} created successfully`);
      syncToSheets();
    } else {
      showToast(`${type} saved locally — will sync when online`);
    }

    closeAddItemModal();

    // Re-render list from IndexedDB
    if (type === 'Habit') {
      const items = await dbGetAllHabits();
      renderList(items, 'Habit', 'list');
    } else {
      const items = await dbGetAllTasks();
      renderList(items, 'Task', 'list');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = `Create ${type}`;
  } catch (err) {
    saveBtn.disabled = false;
    saveBtn.textContent = `Create ${type}`;
    console.error(err);
  }
}

/** Set up add item UI interactions. */
function initAddItemModal(type) {
  const trigger = document.getElementById('add-item-trigger-btn');
  const close = document.getElementById('add-modal-close');
  const save = document.getElementById('add-item-save-btn');
  const overlay = document.getElementById('add-item-overlay');

  if (trigger) trigger.addEventListener('click', () => {
    // Request permission for local notifications when user adds an item
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
}

// ============================================================
// Notifications & Reminders — Service Worker Based
// ============================================================

/** Request browser notification permission. */
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

/**
 * Schedule a notification by sending a message to the service worker.
 * The SW maintains timers that persist across page navigations.
 *
 * @param {string} name       — item name
 * @param {string} timeString — time in HH:MM (24h) or HH:MM AM/PM format
 * @param {string} itemType   — "Habit" or "Task"
 */
function scheduleNotificationViaSW(name, timeString, itemType) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'schedule-notification',
    payload: { name, timeString, itemType }
  });

  console.log(`Sent schedule request to SW for "${name}" at ${timeString}`);
}

/**
 * Cancel a scheduled notification via the service worker.
 * @param {string} name — item name
 */
function cancelNotificationViaSW(name) {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'cancel-notification',
    payload: { name }
  });
}

/**
 * Generate a soft sweet electronic chime sound using Web Audio API.
 * Avoids browser blockages and requires no external sound file downloads.
 */
function playChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Node 1: Crystal tone oscillator
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sine';
    // Sweet pure high frequency (E6 pitch)
    osc.frequency.setValueAtTime(1318.51, audioCtx.currentTime); 
    
    // Soft volume decay curve
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 1.2);
  } catch (e) {
    console.warn("Audio chime play blocked by user interaction requirements:", e);
  }
}

/** Show local notification banner. */
function sendLocalNotification(itemTitle) {
  const options = {
    body: `Time to log your status for: ${itemTitle}`,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'behavior-log-reminder',
    renotify: true
  };

  // Play audio chime
  playChime();

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification('Behavior Log Reminder', options);
    });
  } else {
    new Notification('Behavior Log Reminder', options);
  }
}

// ============================================================
// Common Init (runs on every page)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initModal();
  initSettingsModal();

  // Determine current page item type (Habit or Task)
  const isTasksPage = window.location.pathname.includes('tasks.html');
  initAddItemModal(isTasksPage ? 'Task' : 'Habit');

  // Request notification permissions implicitly on page load
  requestNotificationPermission();

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Initialize IndexedDB on every page load
  dbInit();
});
