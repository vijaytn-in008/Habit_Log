/* ============================================================
   Behavior Log — Sync Engine (sync.js)
   Handles bidirectional sync between IndexedDB and Google Sheets.
   - syncToSheets(): Replay queued mutations when online
   - restoreFromSheets(): Fetch all data from Sheets → IndexedDB
   - Online/offline event listeners with visual indicator
   ============================================================ */

'use strict';

// ============================================================
// Sync State
// ============================================================

/** @type {'online'|'offline'|'syncing'} */
let _syncStatus = navigator.onLine ? 'online' : 'offline';

/** @type {boolean} Prevents concurrent sync operations */
let _isSyncing = false;

// ============================================================
// Sync Status UI
// ============================================================

/**
 * Update the sync indicator badge in the header.
 * Looks for an element with id="sync-indicator".
 */
function updateSyncIndicator(status) {
  _syncStatus = status;
  const el = document.getElementById('sync-indicator');
  if (!el) return;

  el.className = 'sync-indicator';

  switch (status) {
    case 'online':
      el.classList.add('sync-online');
      el.title = 'Online — Synced';
      el.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`;
      break;

    case 'syncing':
      el.classList.add('sync-syncing');
      el.title = 'Syncing…';
      el.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 4v6h6"/>
          <path d="M23 20v-6h-6"/>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
        </svg>`;
      break;

    case 'offline':
      el.classList.add('sync-offline');
      el.title = 'Offline — Changes saved locally';
      el.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>`;
      break;
  }
}

/**
 * Show or hide the offline banner at the top of the page.
 */
function toggleOfflineBanner(show) {
  let banner = document.getElementById('offline-banner');
  if (show) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      banner.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
        <span>You're offline — changes are saved locally and will sync when you reconnect</span>`;
      document.body.prepend(banner);
      // Trigger animation
      requestAnimationFrame(() => banner.classList.add('visible'));
    }
  } else {
    if (banner) {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    }
  }
}

// ============================================================
// Sync to Sheets (Upload queued mutations)
// ============================================================

/**
 * Process the sync queue: replay each pending mutation against the API.
 * Items are removed from the queue only on successful API response.
 * @returns {Promise<{synced: number, failed: number}>}
 */
async function syncToSheets() {
  if (_isSyncing) return { synced: 0, failed: 0 };
  if (!navigator.onLine) {
    updateSyncIndicator('offline');
    return { synced: 0, failed: 0 };
  }
  if (!API_URL) return { synced: 0, failed: 0 };

  _isSyncing = true;
  updateSyncIndicator('syncing');

  let synced = 0;
  let failed = 0;

  try {
    const queue = await dbGetSyncQueue();
    if (queue.length === 0) {
      updateSyncIndicator('online');
      _isSyncing = false;
      return { synced: 0, failed: 0 };
    }

    for (const entry of queue) {
      try {
        // Replay the API call
        const query = new URLSearchParams(entry.params).toString();
        const response = await fetch(`${API_URL}?${query}`);
        const data = await response.json();

        if (data && data.error) {
          console.warn(`Sync failed for action ${entry.action}:`, data.error);
          failed++;
        } else {
          // Success — remove from queue
          await dbClearSyncQueueItem(entry.id);
          synced++;
        }
      } catch (err) {
        console.warn(`Sync network error for action ${entry.action}:`, err);
        failed++;
        // Stop trying if we went offline mid-sync
        if (!navigator.onLine) break;
      }
    }
  } catch (err) {
    console.error('Sync queue read error:', err);
  }

  _isSyncing = false;
  updateSyncIndicator(navigator.onLine ? 'online' : 'offline');

  // ---- 2. Push any unsynced Reflections ----------------------------
  let reflSynced = 0;
  try {
    const unsynced = await dbGetUnsyncedReflections();
    for (const refl of unsynced) {
      try {
        const query = new URLSearchParams({
          action:     'saveReflection',
          key:        refl.key,
          date:       refl.date,
          type:       refl.type,
          name:       refl.name,
          status:     refl.status,
          strategy:   refl.strategy   || '',
          failReason: refl.failReason  || '',
          betterPlan: refl.betterPlan  || ''
        }).toString();
        const response = await fetch(`${API_URL}?${query}`);
        const data     = await response.json();
        if (data && !data.error) {
          await dbMarkReflectionSynced(refl.key);
          reflSynced++;
        }
      } catch (err) {
        console.warn('Reflection sync error:', err);
        if (!navigator.onLine) break;
      }
    }
  } catch (err) {
    console.error('Reflection sync read error:', err);
  }

  if (synced > 0 || reflSynced > 0) {
    console.log(`Sync complete: ${synced} logs, ${reflSynced} reflections synced, ${failed} failed`);
    await dbSetMeta('lastSyncTimestamp', Date.now());
  }

  return { synced, failed };
}

// ============================================================
// Restore from Sheets (Download all data → IndexedDB)
// ============================================================

/**
 * Fetch all habits, tasks, and logs from Google Sheets and
 * populate IndexedDB. Used on first load or after cache clear.
 * @returns {Promise<boolean>} true if restore succeeded
 */
async function restoreFromSheets() {
  if (!API_URL) return false;
  if (!navigator.onLine) return false;

  updateSyncIndicator('syncing');

  try {
    // Fetch all four data sets in parallel
    const [habitsRes, tasksRes, logsRes, reflRes] = await Promise.all([
      fetch(`${API_URL}?action=getHabits`).then(r => r.json()),
      fetch(`${API_URL}?action=getTasks`).then(r => r.json()),
      fetch(`${API_URL}?action=getLogs`).then(r => r.json()),
      fetch(`${API_URL}?action=getReflections`).then(r => r.json())
    ]);

    const habits      = (habitsRes.data || habitsRes || []);
    const tasks       = (tasksRes.data  || tasksRes  || []);
    const logs        = (logsRes.data   || logsRes   || []);
    const reflections = (reflRes.data   || []);

    // Bulk write to IndexedDB
    if (Array.isArray(habits)      && habits.length      > 0) await dbBulkPutHabits(habits);
    if (Array.isArray(tasks)       && tasks.length       > 0) await dbBulkPutTasks(tasks);
    if (Array.isArray(logs)        && logs.length        > 0) await dbBulkPutLogs(logs);
    if (Array.isArray(reflections) && reflections.length > 0) await dbBulkPutReflections(reflections);

    await dbSetMeta('lastSyncTimestamp', Date.now());
    updateSyncIndicator('online');
    console.log(`Restore complete: ${habits.length} habits, ${tasks.length} tasks, ${logs.length} logs, ${reflections.length} reflections`);
    return true;
  } catch (err) {
    console.error('Restore from Sheets failed:', err);
    updateSyncIndicator(navigator.onLine ? 'online' : 'offline');
    return false;
  }
}

// ============================================================
// Online / Offline Event Listeners
// ============================================================

window.addEventListener('online', async () => {
  console.log('Device is online — starting sync…');
  toggleOfflineBanner(false);
  updateSyncIndicator('syncing');

  // First sync any queued changes
  const result = await syncToSheets();
  if (result.synced > 0 && typeof showToast === 'function') {
    showToast(`${result.synced} change${result.synced > 1 ? 's' : ''} synced to Sheets ✓`);
  }
  updateSyncIndicator('online');
});

window.addEventListener('offline', () => {
  console.log('Device went offline');
  toggleOfflineBanner(true);
  updateSyncIndicator('offline');
});

// ============================================================
// Initial Sync Status on Load
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  if (!navigator.onLine) {
    toggleOfflineBanner(true);
    updateSyncIndicator('offline');
  } else {
    updateSyncIndicator('online');
  }
});
