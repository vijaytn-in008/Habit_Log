/* ============================================================
   Behavior Log — Service Worker
   - Caches static shell for offline access
   - Handles scheduled push notifications via postMessage
   - API requests always go to network
   ============================================================ */

const CACHE_NAME = 'behavior-log-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './tasks.html',
  './reflection.html',
  './style.css',
  './script.js',
  './db.js',
  './sync.js',
  './analysis.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ============================================================
// Scheduled Notifications — In-memory timer map
// ============================================================

/** @type {Map<string, number>} Map of item name → timeout ID */
const scheduledTimers = new Map();

// ============================================================
// Install: Cache the static shell
// ============================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ============================================================
// Activate: Remove old caches
// ============================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ============================================================
// Fetch: Cache-first for static, network-only for API
// ============================================================

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls (Google Apps Script) always go to network
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('script.googleusercontent.com')) {
    return; // Let the browser handle it normally
  }

  // Google Fonts — network first, then cache
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets — cache first, then network (update cache on network success)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Return cache immediately, but also update cache in background
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// ============================================================
// Message Handler — Scheduled Notifications
// ============================================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'schedule-notification': {
      const { name, timeString, itemType } = payload;
      scheduleNotificationTimer(name, timeString, itemType);
      break;
    }

    case 'cancel-notification': {
      const { name } = payload;
      cancelNotificationTimer(name);
      break;
    }

    case 'cancel-all-notifications': {
      cancelAllTimers();
      break;
    }
  }
});

/**
 * Schedule a notification timer for a specific item.
 * Parses a time string (HH:MM in 24h or HH:MM AM/PM) and sets a timeout.
 *
 * @param {string} name       — item name for the notification title
 * @param {string} timeString — time input (e.g. "07:00", "19:30", "07:00 AM")
 * @param {string} itemType   — "Habit" or "Task"
 */
function scheduleNotificationTimer(name, timeString, itemType) {
  // Cancel any existing timer for this item
  cancelNotificationTimer(name);

  if (!timeString) return;

  // Parse time input (supports "HH:MM", "HH:MM AM/PM", "H:MM AM/PM")
  const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return;

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

  console.log(`[SW] Scheduling notification for "${name}" at ${reminderTime.toLocaleTimeString()} (in ${Math.round(delayMs / 1000)}s)`);

  const timerId = setTimeout(() => {
    fireNotification(name, itemType);
    // Re-schedule for next day
    scheduleNotificationTimer(name, timeString, itemType);
  }, delayMs);

  scheduledTimers.set(name, timerId);
}

/**
 * Cancel a scheduled notification timer.
 * @param {string} name
 */
function cancelNotificationTimer(name) {
  if (scheduledTimers.has(name)) {
    clearTimeout(scheduledTimers.get(name));
    scheduledTimers.delete(name);
    console.log(`[SW] Cancelled notification for "${name}"`);
  }
}

/**
 * Cancel all active timers.
 */
function cancelAllTimers() {
  for (const [name, timerId] of scheduledTimers) {
    clearTimeout(timerId);
  }
  scheduledTimers.clear();
  console.log('[SW] All notification timers cancelled');
}

/**
 * Fire a notification for a habit/task.
 * @param {string} name     — item name
 * @param {string} itemType — "Habit" or "Task"
 */
function fireNotification(name, itemType) {
  const typeLabel = itemType === 'Task' ? '📋 Task' : '✅ Habit';
  const options = {
    body: `${typeLabel} Reminder: Time to log "${name}"`,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: `reminder-${name}`,
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      name,
      type: itemType,
      url: itemType === 'Task' ? './tasks.html' : './index.html'
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  self.registration.showNotification('Behavior Log', options);
}

// ============================================================
// Notification Click Handler
// ============================================================

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  // Open the relevant page
  const url = event.notification.data?.url || './index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing window if available
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});
