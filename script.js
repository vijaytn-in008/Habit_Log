/* ============================================================
   Behavior Log — Main Script
   Handles API calls, modal, theme, list rendering, and
   service worker registration.
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

/**
 * Generic API call. Encodes all params as query strings.
 * @param {Object} params — key-value pairs sent to Apps Script
 * @returns {Promise<Object>} parsed JSON response
 */
async function apiCall(params) {
  if (!API_URL) {
    showToast('Please set your Apps Script URL in Settings first.');
    openSettingsModal();
    throw new Error('API URL not configured');
  }
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_URL}?${query}`);
  return response.json();
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
 */
async function saveLog(type, name, status, reason, notes) {
  const now = new Date();
  return apiCall({
    action: 'saveLog',
    date: now.toLocaleDateString('en-CA'),                              // YYYY-MM-DD
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), // HH:MM
    type,
    name,
    status,
    reason: reason || '',
    notes: notes || ''
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
 * @param {Array}  items       — [{name, time?, place?}, ...]
 * @param {string} type        — "Habit" or "Task"
 * @param {string} containerId — ID of the target container
 */
function renderList(items, type, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">No items yet. Add them in Google Sheets.</div>';
    return;
  }

  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = `${i * 0.05}s`;

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = item.name;
    card.appendChild(name);

    // Optional meta (time, place)
    const parts = [];
    if (item.time) parts.push(item.time);
    if (item.place) parts.push(item.place);
    if (parts.length) {
      const meta = document.createElement('span');
      meta.className = 'card-meta';
      meta.textContent = parts.join(' · ');
      card.appendChild(meta);
    }

    card.addEventListener('click', () => openModal(item.name, type));
    container.appendChild(card);
  });
}

// ============================================================
// Modal
// ============================================================
let modalState = { name: '', type: '', status: '', reason: '' };

/** Open the log modal for a specific habit/task. */
function openModal(name, type) {
  modalState = { name, type, status: '', reason: '' };

  document.getElementById('modal-title').textContent = name;
  document.getElementById('notes').value = '';

  // Reset status buttons
  document.querySelectorAll('.status-btn').forEach((b) => {
    b.className = 'status-btn';
  });

  // Reset reason chips
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));

  // Hide reason section
  document.getElementById('reason-section').classList.remove('visible');

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
  if (modalState.status === 'Done') {
    btn.disabled = false;
  } else if (modalState.status === 'Failed' || modalState.status === 'Skipped') {
    btn.disabled = !modalState.reason;
  } else {
    btn.disabled = true;
  }
}

/** Handle the save button click. */
async function handleSave() {
  const btn = document.getElementById('save-btn');
  const notes = document.getElementById('notes').value.trim();

  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await saveLog(modalState.type, modalState.name, modalState.status, modalState.reason, notes);
    btn.textContent = '✓ Saved';
    btn.classList.add('saved');
    showToast(`${modalState.name} logged as ${modalState.status}`);
    setTimeout(closeModal, 600);
  } catch (err) {
    btn.textContent = 'Error — Tap to Retry';
    btn.disabled = false;
    console.error('Save failed:', err);
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

      // Show or hide reason section
      const reasonSection = document.getElementById('reason-section');
      if (status === 'Failed' || status === 'Skipped') {
        reasonSection.classList.add('visible');
      } else {
        reasonSection.classList.remove('visible');
        modalState.reason = '';
        document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      }

      updateSaveButton();
    });
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
// Page Initializers
// ============================================================

/** Load and display habits (index.html). */
async function initHabitsPage() {
  const loading = document.getElementById('loading');
  try {
    const data = await fetchHabits();
    loading.classList.add('hidden');
    renderList(data.data || data, 'Habit', 'list');
  } catch (err) {
    loading.innerHTML = '<p>Could not load habits.<br>Check your connection.</p>';
    console.error(err);
  }
}

/** Load and display tasks (tasks.html). */
async function initTasksPage() {
  const loading = document.getElementById('loading');
  try {
    const data = await fetchTasks();
    loading.classList.add('hidden');
    renderList(data.data || data, 'Task', 'list');
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

/** Initialize settings modal events. */
function initSettingsModal() {
  const btn = document.getElementById('settings-btn');
  const close = document.getElementById('settings-close');
  const save = document.getElementById('settings-save-btn');
  const overlay = document.getElementById('settings-overlay');

  if (btn) btn.addEventListener('click', openSettingsModal);
  if (close) close.addEventListener('click', closeSettingsModal);
  if (save) save.addEventListener('click', saveSettings);
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
// Common Init (runs on every page)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initModal();
  initSettingsModal();

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
});
