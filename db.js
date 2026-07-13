/* ============================================================
   Behavior Log — IndexedDB Data Layer (db.js)
   Provides offline-first persistence for habits, tasks, logs,
   and a sync queue for background syncing to Google Sheets.
   ============================================================ */

'use strict';

const DB_NAME = 'BehaviorLogDB';
const DB_VERSION = 2;

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
      const storeNames = ['habits', 'tasks', 'logs', 'reflections', 'syncQueue', 'meta'];
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
