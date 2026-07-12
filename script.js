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

async function apiCall(params) {
  if (!API_URL) {
    showToast('Please set your Apps Script URL in Settings first.');
    openSettingsModal();
    throw new Error('API URL not configured');
  }
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_URL}?${query}`);
  const data = await response.json();
  if (data && data.error) {
    showToast(`API Error: ${data.error}`);
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

/**
 * Save a new custom item (Habit or Task).
 * @param {string} type  — "Habit" or "Task"
 * @param {string} name  — item name
 * @param {string} time  — optional time
 * @param {string} place — optional place
 */
async function apiAddItem(type, name, time, place) {
  return apiCall({
    action: 'addItem',
    type,
    name,
    time: time || '',
    place: place || ''
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
// Add Item Modal & Logic
// ============================================================

/** Open the add item modal. */
function openAddItemModal() {
  const overlay = document.getElementById('add-item-overlay');
  if (overlay) {
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-time').value = '';
    document.getElementById('new-item-place').value = '';
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

/** Submit new habit/task item to spreadsheet. */
async function handleAddItemSave(type) {
  const nameInput = document.getElementById('new-item-name');
  const timeInput = document.getElementById('new-item-time');
  const placeInput = document.getElementById('new-item-place');
  const saveBtn = document.getElementById('add-item-save-btn');

  const name = nameInput.value.trim();
  const time = timeInput.value.trim();
  const place = placeInput.value.trim();

  if (!name) {
    showToast('Name is required');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    await apiAddItem(type, name, time, place);
    showToast(`${type} created successfully`);
    closeAddItemModal();
    // Schedule a reminder notification for this item if a time was provided
    if (time) {
      scheduleNotification(name, time);
    }
    setTimeout(() => location.reload(), 800);
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
// Notifications & Reminders
// ============================================================

/** Request browser notification permission. */
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

/**
 * Schedule a client-side reminder using service worker.
 * Checks for standard time strings (e.g. HH:MM AM/PM or HH:MM)
 */
function scheduleNotification(title, timeString) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  
  // Parse time input (e.g. "07:00 AM", "19:30", "7:00 PM")
  const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return; // Ignore unstructured text time inputs

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

  // If time has already passed today, schedule for tomorrow
  if (reminderTime <= now) {
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  const delayMs = reminderTime.getTime() - now.getTime();
  
  console.log(`Scheduling reminder for "${title}" at ${reminderTime} (in ${Math.round(delayMs / 1000)} seconds)`);

  setTimeout(() => {
    sendLocalNotification(title);
    // Re-schedule for next day
    scheduleNotification(title, timeString);
  }, delayMs);
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
});
