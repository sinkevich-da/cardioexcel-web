/* =====================================================================
   CardioEXCEL Web v18 — Storage Manager
   Хранилище на IndexedDB + тонкая обёртка над localStorage для настроек.
   © 2026 Врач-кардиолог, к.м.н. Синкевич Д.А., Иркутск
   ===================================================================== */
'use strict';

const StorageManager = (() => {

  const DB_NAME = 'cardioexcel_web_v18';
  const DB_VERSION = 1;

  // Схема: одна object store «records» — все документы/ресурсы.
  // Запись: { id, type, value, version, updatedAt }
  const STORE = 'records';

  const STORAGE_VERSION_KEY = 'cardioexcel.storageVersion.v18';

  // ---- вспомогательные ----------
  function promisifyRequest(req){
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error || new Error('IndexedDB request failed'));
    });
  }

  let _db = null;

  function openDB(){
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error || new Error('Невозможно открыть IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB заблокирована другим окном'));
    });
  }

  // ---- чтение/запись записи ----------
  async function get(type, id){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Read failed'));
    });
  }

  async function put(type, id, value, meta){
    const db = await openDB();
    const rec = {
      id,
      type,
      value,
      version: meta && meta.version ? meta.version : 1,
      updatedAt: Date.now()
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve(rec);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Write aborted'));
      tx.objectStore(STORE).put(rec);
    });
  }

  async function remove(type, id){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Delete failed'));
      tx.objectStore(STORE).delete(id);
    });
  }

  async function _all(type){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const out = [];
      const cur = store.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c){ out.push(c.value); c.continue(); }
        else resolve(out);
      };
      cur.onerror = () => reject(cur.error || new Error('Cursor failed'));
    });
  }

  // ---- публичное API ----------
  return {
    DB_NAME, DB_VERSION, STORE,

    isSupported(){
      return typeof indexedDB !== 'undefined';
    },

    async isAvailable(){
      try { await openDB(); return true; }
      catch(_) { return false; }
    },

    async getStorageEstimate(){
      try {
        if (navigator.storage && navigator.storage.estimate){
          const est = await navigator.storage.estimate();
          return { usage: est.usage || 0, quota: est.quota || 0 };
        }
      } catch(_) {}
      return { usage: 0, quota: 0 };
    },

    async get(id){ return get('doc', id); },
    async put(id, value, meta){ return put('doc', id, value, meta); },
    async has(id){ const r = await get('doc', id); return !!r; },
    async remove(id){ return remove('doc', id); },

    async getAll(){ return _all('doc'); },

    async clearAll(){
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Clear failed'));
        tx.objectStore(STORE).clear();
      });
    },

    // ---- тонкие настройки (localStorage) ----------
    ls: {
      get(key, fallback){
        try {
          const raw = localStorage.getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch(_) { return fallback; }
      },
      set(key, value){
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch(_) { return false; }
      },
      remove(key){ try { localStorage.removeItem(key); } catch(_){} }
    },

    storageVersion: {
      read(){ try { return parseInt(localStorage.getItem(STORAGE_VERSION_KEY) || '0', 10); } catch(_) { return 0; } },
      write(v){ try { localStorage.setItem(STORAGE_VERSION_KEY, String(v)); return true; } catch(_) { return false; } }
    }
  };
})();