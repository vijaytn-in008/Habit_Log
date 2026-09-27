/* ============================================================
   PivotMe — Service Worker
   - Caches static shell for offline access
   - Handles scheduled push notifications via postMessage
   - API requests always go to network
   ============================================================ */

importScripts('./db.js');

const CACHE_NAME = 'pivotme-v14';

const STATIC_ASSETS = [
  './',
  './index.html',
  './tasks.html',
  './task-details.html',
  './next-action.html',
  './plan.html',
  './reflection.html',
  './help.html',
  './style.css',
  './script.js',
  './db.js',
  './sync.js',
  './analysis.js',
  './appscript.gs',
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
      scheduleNotificationTimer(name, timeString, itemType, 'action');
      break;
    }
    
    case 'schedule-logging-reminder': {
      const { name, timeString, itemType } = payload;
      scheduleNotificationTimer(name, timeString, itemType, 'logging');
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

function scheduleNotificationTimer(name, timeString, itemType, reminderType = 'action') {
  // Cancel any existing timer/trigger for this item and this type
  const timerKey = `${name}-${reminderType}`;
  cancelNotificationTimer(timerKey);

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

  // If it's a logging reminder, add 30 minutes to the time
  if (reminderType === 'logging') {
    reminderTime.setMinutes(reminderTime.getMinutes() + 30);
  }

  // If time has already passed today, schedule for tomorrow
  if (reminderTime <= now) {
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  const delayMs = reminderTime.getTime() - now.getTime();

  // Try to use Notification Trigger API (native OS alarms)
  if ('showTrigger' in Notification.prototype) {
    let body = `Reminder: Time to log "${name}"`;
    let url = itemType === 'Task' ? './tasks.html' : './index.html';
    let title = 'PivotMe';
    
    if (reminderType === 'action') {
      title = `Action Reminder: ${name}`;
      body = `Your planned ${itemType === 'Task' ? 'Task' : 'Habit'} starts now.`;
    } else if (reminderType === 'logging') {
      title = `Logging Reminder: ${name}`;
      body = `How did it go? Log Done, Partial or Skipped.`;
      url = itemType === 'Task' ? `./task-details.html?task=${encodeURIComponent(name)}` : './index.html';
    }

    const options = {
      body: body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: `reminder-${timerKey}`,
      showTrigger: new TimestampTrigger(reminderTime.getTime()),
      renotify: true,
      vibrate: [100, 50, 100],
      data: {
        name,
        type: itemType,
        url: url
      }
    };
    self.registration.showNotification(title, options).then(() => {
      console.log(`[SW] Native notification trigger scheduled for "${name}" (${reminderType}) at ${reminderTime.toLocaleString()}`);
    }).catch((err) => {
      console.warn('[SW] TimestampTrigger failed, using fallback:', err);
      scheduleFallback(name, delayMs, timeString, itemType, reminderType);
    });
  } else {
    scheduleFallback(name, delayMs, timeString, itemType, reminderType);
  }
}

function scheduleFallback(name, delayMs, timeString, itemType, reminderType = 'action') {
  console.log(`[SW] Scheduling fallback timer for "${name}" (${reminderType}) at delay ${Math.round(delayMs / 1000)}s`);
  const timerKey = `${name}-${reminderType}`;
  const timerId = setTimeout(() => {
    fireNotification(name, itemType, reminderType);
    scheduleNotificationTimer(name, timeString, itemType, reminderType);
  }, delayMs);
  scheduledTimers.set(timerKey, timerId);
}

/**
 * Cancel a scheduled notification timer/trigger.
 * @param {string} name
 */
function cancelNotificationTimer(name) {
  if (scheduledTimers.has(name)) {
    clearTimeout(scheduledTimers.get(name));
    scheduledTimers.delete(name);
  }
  if (self.registration && self.registration.getNotifications) {
    self.registration.getNotifications({ tag: `reminder-${name}` }).then((notifications) => {
      notifications.forEach((n) => n.close());
    }).catch((err) => console.warn('[SW] Error cancelling native trigger:', err));
  }
  console.log(`[SW] Cancelled notification for "${name}"`);
}

/**
 * Cancel all active timers.
 */
function cancelAllTimers() {
  for (const [name, timerId] of scheduledTimers) {
    clearTimeout(timerId);
  }
  scheduledTimers.clear();

  if (self.registration && self.registration.getNotifications) {
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((n) => {
        if (n.tag && n.tag.startsWith('reminder-')) {
          n.close();
        }
      });
    }).catch((err) => console.warn('[SW] Error cancelling all native triggers:', err));
  }
  console.log('[SW] All notification timers cancelled');
}

/**
 * Fire a notification for a habit/task.
 * @param {string} name     — item name
 * @param {string} itemType — "Habit" or "Task"
 */
function fireNotification(name, itemType, reminderType = 'action') {
  let title = 'PivotMe';
  let body = 'Time to log your habits and tasks!';
  let url = './index.html';
  
  if (reminderType === 'action') {
    title = `Action Reminder: ${name}`;
    body = `Your planned ${itemType === 'Task' ? 'Task' : 'Habit'} starts now.`;
    url = itemType === 'Task' ? `./tasks.html` : `./index.html`;
  } else if (reminderType === 'logging') {
    title = `Logging Reminder: ${name}`;
    body = `How did it go? Log Done, Partial or Skipped.`;
    url = itemType === 'Task' ? `./task-details.html?task=${encodeURIComponent(name)}` : `./index.html`;
  }

  const options = {
    body: body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: `reminder-${name}-${reminderType}`,
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      name,
      type: itemType,
      url: url
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  self.registration.showNotification(title, options);
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

// ============================================================
// Web Push API (Online Background Reminders)
// ============================================================

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      data = { title: 'Reminder', body: event.data.text() };
    }
  }
  
  let title = data.title || 'PivotMe';
  let body = data.body || 'Time to log your habits and tasks!';
  let url = './index.html';

  if (data.type === 'action') {
    title = `Action Reminder: ${data.name}`;
    body = `Your planned ${data.itemType || 'activity'} "${data.name}" starts now.`;
    url = data.itemType === 'Task' ? `./tasks.html` : `./index.html`;
  } else if (data.type === 'logging') {
    title = `Logging Reminder: ${data.name}`;
    body = `How did "${data.name}" go? Log Done, Partial or Skipped.`;
    url = data.itemType === 'Task' ? `./task-details.html?task=${encodeURIComponent(data.name)}` : `./index.html`;
  } else {
    title = data.title || 'PivotMe Reminder';
  }

  const options = {
    body: body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    renotify: true,
    vibrate: [100, 50, 100],
    data: { ...data, url }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ============================================================
// Periodic Background Sync (Offline Reminders)
// ============================================================

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-reminders') {
    console.log('[SW] Periodic sync triggered: check-reminders');
    event.waitUntil(checkOfflineReminders());
  }
});

async function checkOfflineReminders() {
  try {
    const pendingReminders = await dbGetPendingReminders();
    const now = Date.now();
    
    for (const reminder of pendingReminders) {
      if (now >= reminder.targetTime) {
        // Time has passed, fire the notification
        const typeLabel = reminder.type === 'Task' ? 'Task' : 'Habit';
        const options = {
          body: `${typeLabel} Reminder: Time to log "${reminder.name}"`,
          icon: 'icon-192.png',
          badge: 'icon-192.png',
          tag: `reminder-${reminder.name}`,
          renotify: true,
          vibrate: [100, 50, 100],
          data: {
            name: reminder.name,
            type: reminder.type,
            url: reminder.type === 'Task' ? './tasks.html' : './index.html'
          },
          actions: [
            { action: 'open', title: 'Open App' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        };
        
        await self.registration.showNotification('PivotMe', options);
        await dbMarkReminderTriggered(reminder.id);
        console.log(`[SW] Offline reminder fired and marked triggered: "${reminder.name}"`);
      }
    }
  } catch (err) {
    console.error('[SW] Error checking offline reminders:', err);
  }
}
