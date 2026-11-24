/* =====================================================================
   CardioEXCEL Web v18 — Миграция данных из v17 (localStorage) в IndexedDB
   Безопасно: не удаляет исходные ключи v17, повторяемая, идемпотентная.
   © 2026 Синкевич Д.А., Иркутск
   ===================================================================== */
'use strict';

const Migration = (() => {

  // Ключи v17 в localStorage, которые относятся к содержимому калькуляторов.
  const V17_CONTENTS_KEY = 'cardioexcel.contents.v1';
  const MIGRATION_FLAG = 'cardioexcel.migrated.v18';

  // Соответствие id записи в содержимом и id объекта хранилища.
  // В v17 содержимое хранится как { [calcId]: "<html>" }.

  function isMigrated(){
    try { return localStorage.getItem(MIGRATION_FLAG) === 'v18-ok'; }
    catch(_) { return false; }
  }

  function markMigrated(){
    try { localStorage.setItem(MIGRATION_FLAG, 'v18-ok'); } catch(_) {}
  }

  // Подсчёт контрольной суммы (быстрая, по содержимому).
  function checksum(str){
    let h = 5381;
    for (let i = 0; i < str.length; i++){
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16);
  }

  async function run(report){
    const result = { migrated: 0, skipped: 0, failed: 0, alreadyDone: false, records: [] };

    if (!StorageManager.isSupported()){
      result.failed = -1;
      result.reason = 'IndexedDB не поддерживается браузером';
      if (report) report(result);
      return result;
    }

    if (isMigrated()){
      // Проверяем, что данные действительно есть в IndexedDB.
      const all = await StorageManager.getAll();
      if (all && all.length){
        result.alreadyDone = true;
        result.migrated = all.length;
        if (report) report(result);
        return result;
      }
      // Флаг есть, но данные отсутствуют — возможен сброс. Продолжаем миграцию из localStorage.
    }

    let v17;
    try { v17 = JSON.parse(localStorage.getItem(V17_CONTENTS_KEY) || '{}'); }
    catch(_) { v17 = {}; }

    const ids = Object.keys(v17 || {}).filter(id => typeof v17[id] === 'string' && v17[id].length > 50);

    for (const id of ids){
      const content = v17[id];
      const existing = await StorageManager.has(id);
      try {
        if (!existing){
          await StorageManager.put(id, content, { version: 1 });
          result.migrated++;
          result.records.push({ id, checksum: checksum(content) });
        } else {
          result.skipped++;
        }
      } catch(e){
        result.failed++;
        result.records.push({ id, error: String(e && e.message || e) });
      }
    }

    if (result.failed === 0){
      markMigrated();
    }
    if (report) report(result);
    return result;
  }

  return { run, isMigrated };
})();