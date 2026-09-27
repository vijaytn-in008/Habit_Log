/* ============================================================
   Behavior Log — IndexedDB Data Layer (db.js)
   Provides offline-first persistence for habits, tasks, logs,
   and a sync queue for background syncing to Google Sheets.
   ============================================================ */

'use strict';

const DB_NAME = 'BehaviorLogDB';
const DB_VERSION = 5;

/** @type {IDBDatabase|null} */
let _db = null;

// ============================================================
// Database Initialization
// ============================================================

/**
 * Open (or upgrade) the IndexedDB database.
 * Creates object stores on first run or version bump.
 * @returns {Promise<IDBDatabase>}
 */
function dbInit() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // Habits store — keyed by name
      if (!db.objectStoreNames.contains('habits')) {
        db.createObjectStore('habits', { keyPath: 'name' });
      }

      // Tasks store — keyed by name
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'name' });
      }

      // Logs store — auto-increment key with indexes
      if (!db.objectStoreNames.contains('logs')) {
        const logStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        logStore.createIndex('by_date', 'date', { unique: false });
        logStore.createIndex('by_name', 'name', { unique: false });
        logStore.createIndex('by_date_name', ['date', 'name'], { unique: false });
      }

      // Add by_targetId index to logs (v4 migration)
      if (oldVersion < 4 && db.objectStoreNames.contains('logs')) {
        const logStore = event.target.transaction.objectStore('logs');
        if (!logStore.indexNames.contains('by_targetId')) {
          logStore.createIndex('by_targetId', 'name', { unique: false });
        }
      }

      // Reflections store — keyed by composite "date|type|name" to prevent duplicates
      if (!db.objectStoreNames.contains('reflections')) {
        const reflStore = db.createObjectStore('reflections', { keyPath: 'key' });
        reflStore.createIndex('by_name', 'name', { unique: false });
        reflStore.createIndex('by_type', 'type', { unique: false });
        reflStore.createIndex('by_synced', 'synced', { unique: false });
      }

      // Sync Queue — pending mutations to replay against API
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('by_timestamp', 'timestamp', { unique: false });
      }

      // Meta store — key-value pairs (lastSync, apiUrl, etc.)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }

      // Reminders store - for background periodic sync offline alarms
      if (!db.objectStoreNames.contains('reminders')) {
        const remStore = db.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
        remStore.createIndex('by_name', 'name', { unique: false });
      }

      // Today's Plan store (v4) — planning layer for daily schedule
      if (!db.objectStoreNames.contains('todaysPlan')) {
        const planStore = db.createObjectStore('todaysPlan', { keyPath: 'id', autoIncrement: true });
        planStore.createIndex('by_date', 'date', { unique: false });
        planStore.createIndex('by_date_target', ['date', 'targetName'], { unique: false });
      }

      // v5 migration for todaysPlan
      if (oldVersion < 5 && db.objectStoreNames.contains('todaysPlan')) {
        const planStore = event.target.transaction.objectStore('todaysPlan');
        if (!planStore.indexNames.contains('by_date_target')) {
          planStore.createIndex('by_date_target', ['date', 'targetName'], { unique: false });
        }
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ============================================================
// Generic Helpers
// ============================================================

/**
 * Run a transaction on a single store.
 * @param {string}      storeName — name of the object store
 * @param {'readonly'|'readwrite'} mode
 * @param {function(IDBObjectStore): IDBRequest|void} callback
 * @returns {Promise<*>}
 */
function dbTransaction(storeName, mode, callback) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = callback(store);

      if (result && typeof result.onsuccess !== 'undefined') {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      } else {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }
    });
  });
}

/**
 * Get all records from a store.
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
function dbGetAll(storeName) {
  return dbTransaction(storeName, 'readonly', (store) => store.getAll());
}

/**
 * Get a single record from a store by key.
 * @param {string} storeName
 * @param {string|number} key
 * @returns {Promise<Object>}
 */
function dbGet(storeName, key) {
  return dbTransaction(storeName, 'readonly', (store) => store.get(key));
}

/**
 * Put (upsert) a single record.
 * @param {string} storeName
 * @param {Object} record
 * @returns {Promise<void>}
 */
function dbPut(storeName, record) {
  return dbTransaction(storeName, 'readwrite', (store) => store.put(record));
}

/**
 * Delete a record by key.
 * @param {string} storeName
 * @param {*}      key
 * @returns {Promise<void>}
 */
function dbDelete(storeName, key) {
  return dbTransaction(storeName, 'readwrite', (store) => store.delete(key));
}

/**
 * Clear all records from a store.
 * @param {string} storeName
 * @returns {Promise<void>}
 */
function dbClearStore(storeName) {
  return dbTransaction(storeName, 'readwrite', (store) => store.clear());
}

// ============================================================
// Habits CRUD
// ============================================================

/** Get all habits from IndexedDB. @returns {Promise<Array>} */
function dbGetAllHabits() {
  return dbGetAll('habits');
}

/** Get a single habit by name. @param {string} name @returns {Promise<Object>} */
function dbGetHabit(name) {
  return dbGet('habits', name);
}

/** Upsert a single habit. @param {Object} item @returns {Promise<void>} */
function dbPutHabit(item) {
  return dbPut('habits', item);
}

/** Delete a habit by name. @param {string} name @returns {Promise<void>} */
function dbDeleteHabit(name) {
  return dbDelete('habits', name);
}

/** Bulk-insert habits (replaces all existing). @param {Array} items @returns {Promise<void>} */
function dbBulkPutHabits(items) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('habits', 'readwrite');
      const store = tx.objectStore('habits');
      store.clear();
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

// ============================================================
// Tasks CRUD
// ============================================================

/** Get all tasks from IndexedDB. @returns {Promise<Array>} */
function dbGetAllTasks() {
  return dbGetAll('tasks');
}

/** Get a single task by name. @param {string} name @returns {Promise<Object>} */
function dbGetTask(name) {
  return dbGet('tasks', name);
}

/** Upsert a single task. @param {Object} item @returns {Promise<void>} */
function dbPutTask(item) {
  return dbPut('tasks', item);
}

/** Delete a task by name. @param {string} name @returns {Promise<void>} */
function dbDeleteTask(name) {
  return dbDelete('tasks', name);
}

/** Bulk-insert tasks (replaces all existing). @param {Array} items @returns {Promise<void>} */
function dbBulkPutTasks(items) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tasks', 'readwrite');
      const store = tx.objectStore('tasks');
      store.clear();
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

// ============================================================
// Logs CRUD
// ============================================================

/** Get all logs from IndexedDB. @returns {Promise<Array>} */
function dbGetAllLogs() {
  return dbGetAll('logs');
}

/** Add a single log entry. @param {Object} entry @returns {Promise<number>} auto-generated ID */
function dbAddLog(entry) {
  return dbTransaction('logs', 'readwrite', (store) => store.add(entry));
}

/**
 * Query logs by date using the by_date index.
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {Promise<Array>}
 */
function dbGetLogsByDate(date) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('logs', 'readonly');
      const store = tx.objectStore('logs');
      const index = store.index('by_date');
      const req = index.getAll(date);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Query logs by item name using the by_name index.
 * @param {string} name
 * @returns {Promise<Array>}
 */
function dbGetLogsByName(name) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('logs', 'readonly');
      const store = tx.objectStore('logs');
      const index = store.index('by_name');
      const req = index.getAll(name);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Get the most recent logs using a reverse cursor on the primary key.
 * @param {number} limit - Maximum number of recent logs to return (default: 50)
 * @returns {Promise<Array>}
 */
function dbGetRecentLogs(limit = 50) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('logs', 'readonly');
      const store = tx.objectStore('logs');
      const results = [];
      const req = store.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/** Bulk-insert logs (replaces all existing). @param {Array} logs @returns {Promise<void>} */
function dbBulkPutLogs(logs) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('logs', 'readwrite');
      const store = tx.objectStore('logs');
      store.clear();
      logs.forEach((log) => store.add(log));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

// ============================================================
// Sync Queue
// ============================================================

/**
 * Add a mutation to the sync queue.
 * @param {string} action — API action name (e.g. 'saveLog', 'addItem', 'deleteItem', 'toggleReminder')
 * @param {Object} params — the full parameter object to send to the API
 * @returns {Promise<number>} queue entry ID
 */
function dbAddToSyncQueue(action, params) {
  const entry = {
    action,
    params,
    timestamp: Date.now()
  };
  return dbTransaction('syncQueue', 'readwrite', (store) => store.add(entry));
}

/** Get all pending sync queue items, ordered by timestamp. @returns {Promise<Array>} */
function dbGetSyncQueue() {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readonly');
      const store = tx.objectStore('syncQueue');
      const index = store.index('by_timestamp');
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

/** Remove a single sync queue item by ID. @param {number} id @returns {Promise<void>} */
function dbClearSyncQueueItem(id) {
  return dbDelete('syncQueue', id);
}

/** Get the count of pending sync items. @returns {Promise<number>} */
function dbGetSyncQueueCount() {
  return dbTransaction('syncQueue', 'readonly', (store) => store.count());
}

// ============================================================
// Meta Store (key-value)
// ============================================================

/**
 * Get a meta value by key.
 * @param {string} key
 * @returns {Promise<*>} the value, or undefined
 */
function dbGetMeta(key) {
  return dbTransaction('meta', 'readonly', (store) => store.get(key))
    .then((record) => record ? record.value : undefined);
}

/**
 * Set a meta value.
 * @param {string} key
 * @param {*}      value
 * @returns {Promise<void>}
 */
function dbSetMeta(key, value) {
  return dbPut('meta', { key, value });
}

// ============================================================
// Bulk Operations
// ============================================================

/**
 * Clear ALL data from all stores (used by app reset).
 * @returns {Promise<void>}
 */
function dbClearAll() {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const storeNames = ['habits', 'tasks', 'logs', 'reflections', 'syncQueue', 'meta', 'todaysPlan'];
      const tx = db.transaction(storeNames, 'readwrite');
      storeNames.forEach((name) => tx.objectStore(name).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

/**
 * Check if IndexedDB has any data (used to determine if restore is needed).
 * @returns {Promise<boolean>}
 */
function dbHasData() {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['habits', 'tasks'], 'readonly');
      const habitsReq = tx.objectStore('habits').count();
      const tasksReq = tx.objectStore('tasks').count();
      
      let habitsCount = 0;
      let tasksCount = 0;

      habitsReq.onsuccess = () => { habitsCount = habitsReq.result; };
      tasksReq.onsuccess = () => { tasksCount = tasksReq.result; };

      tx.oncomplete = () => resolve(habitsCount > 0 || tasksCount > 0);
      tx.onerror = () => reject(tx.error);
    });
  });
}

// ============================================================
// Reflections CRUD
// ============================================================

/**
 * Build the deduplication key for a reflection entry.
 * @param {string} date  — YYYY-MM-DD
 * @param {string} type  — 'Habit' | 'Task'
 * @param {string} name  — item name
 * @returns {string}
 */
function reflectionKey(date, type, name) {
  return `${date}|${type}|${name}`;
}

/**
 * Add a reflection if it doesn't already exist (dedup by key).
 * @param {Object} entry — { date, type, name, status, strategy, failReason, betterPlan, synced }
 * @returns {Promise<void>}  resolves immediately (no error on duplicate, just ignores)
 */
function dbAddReflection(entry) {
  entry.key = reflectionKey(entry.date, entry.type, entry.name);
  entry.synced = entry.synced || false;

  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reflections', 'readwrite');
      const store = tx.objectStore('reflections');

      // Check if key already exists
      const getReq = store.get(entry.key);
      getReq.onsuccess = () => {
        if (getReq.result) {
          // Already exists — do NOT overwrite, just resolve
          resolve(null);
        } else {
          store.put(entry);
          resolve(entry.key);
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

/** Get all reflections from IndexedDB. @returns {Promise<Array>} */
function dbGetAllReflections() {
  return dbGetAll('reflections');
}

/** Get all un-synced reflections (synced === false). @returns {Promise<Array>} */
function dbGetUnsyncedReflections() {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reflections', 'readonly');
      const store = tx.objectStore('reflections');
      const index = store.index('by_synced');
      const req = index.getAll(IDBKeyRange.only(false));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

/** Mark a reflection as synced by key. @param {string} key @returns {Promise<void>} */
function dbMarkReflectionSynced(key) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reflections', 'readwrite');
      const store = tx.objectStore('reflections');
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        if (getReq.result) {
          getReq.result.synced = true;
          store.put(getReq.result);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve();
    });
  });
}

/**
 * Bulk-put reflections from Sheets (used during restore).
 * Will NOT overwrite existing entries (dedup by key).
 * @param {Array} items
 * @returns {Promise<void>}
 */
function dbBulkPutReflections(items) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reflections', 'readwrite');
      const store = tx.objectStore('reflections');
      items.forEach((item) => {
        item.key = item.key || reflectionKey(item.date, item.type, item.name);
        item.synced = true; // came from Sheets, so already synced
        // Only write if key doesn't exist — use put (will upsert but key already set)
        store.put(item);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

// ============================================================
// Today's Plan CRUD
// ============================================================

/**
 * Get all plan items from IndexedDB.
 * @returns {Promise<Array>}
 */
function dbGetAllPlanItems() {
  return dbGetAll('todaysPlan');
}

/**
 * Get plan items for a specific date.
 * @param {string} date — YYYY-MM-DD
 * @returns {Promise<Array>}
 */
function dbGetPlanByDate(date) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('todaysPlan', 'readonly');
      const store = tx.objectStore('todaysPlan');
      const index = store.index('by_date');
      const req = index.getAll(IDBKeyRange.only(date));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Add a plan item.
 * @param {Object} item — { date, time, targetName, targetType, status }
 * @returns {Promise<number>} auto-generated ID
 */
function dbAddPlanItem(item) {
  return dbTransaction('todaysPlan', 'readwrite', (store) => store.add(item));
}

/**
 * Update a plan item.
 * @param {Object} item — must include id
 * @returns {Promise<void>}
 */
function dbPutPlanItem(item) {
  return dbPut('todaysPlan', item);
}

/**
 * Delete a plan item by ID.
 * @param {number} id
 * @returns {Promise<void>}
 */
function dbDeletePlanItem(id) {
  return dbDelete('todaysPlan', id);
}

/**
 * Alter the time and/or mode of an existing plan item.
 * Preserves originalStartTime, logs each shift in changeLog, and tracks reschedule count.
 * @param {number} id
 * @param {string} newStartTime
 * @param {string|null} newEndTime
 * @param {string} [reason='']
 * @param {string|null} [mode=null] 'focus' | 'parallel'
 * @returns {Promise<void>}
 */
function dbAlterPlanTime(id, newStartTime, newEndTime, reason = '', mode = null) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('todaysPlan', 'readwrite');
      const store = tx.objectStore('todaysPlan');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) return resolve();
        
        // Ensure originalStartTime is preserved
        if (!item.originalStartTime) {
          item.originalStartTime = item.currentStartTime || item.startTime || '';
        }
        if (!item.originalEndTime) {
          item.originalEndTime = item.currentEndTime || item.endTime || '';
        }

        item.changeLog = item.changeLog || [];
        item.changeLog.push({
          fromStartTime: item.currentStartTime,
          fromEndTime: item.currentEndTime,
          toStartTime: newStartTime,
          toEndTime: newEndTime,
          reason: reason || '',
          changedAt: new Date().toISOString()
        });
        
        item.currentStartTime = newStartTime;
        item.currentEndTime = newEndTime;
        if (mode) item.mode = mode;
        item.rescheduleCount = (item.rescheduleCount || 0) + 1;
        
        store.put(item);
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

/**
 * Mark a plan item as completed or skipped.
 * @param {number} id
 * @param {string} status 'Done' | 'Partially Done' | 'Skipped'
 * @returns {Promise<void>}
 */
function dbCompletePlanItem(id, status) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('todaysPlan', 'readwrite');
      const store = tx.objectStore('todaysPlan');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) return resolve();
        
        item.status = status;
        item.completedAt = new Date().toISOString();
        
        if (status === 'Done') {
          item.completionType = item.rescheduleCount > 0 ? 'after-reschedule' : 'as-planned';
        } else if (status === 'Partially Done') {
          item.completionType = 'partial';
        } else if (status === 'Skipped') {
          item.completionType = 'skipped';
        }
        
        store.put(item);
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

// ============================================================
// Background Reminders
// ============================================================

/**
 * Save a background reminder
 * @param {string} name - The item name
 * @param {number} targetTime - Timestamp in ms when it should trigger
 * @param {string} type - 'Habit' or 'Task'
 */
function dbSaveReminder(name, targetTime, type) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reminders', 'readwrite');
      const store = tx.objectStore('reminders');
      const req = store.add({ name, targetTime, type, triggered: false });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

/** Get all pending reminders that haven't been triggered */
function dbGetPendingReminders() {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reminders', 'readonly');
      const store = tx.objectStore('reminders');
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result || [];
        resolve(all.filter(r => !r.triggered));
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/** Mark a reminder as triggered */
function dbMarkReminderTriggered(id) {
  return dbInit().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reminders', 'readwrite');
      const store = tx.objectStore('reminders');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (data) {
          data.triggered = true;
          const putReq = store.put(data);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        } else {
          resolve();
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}
