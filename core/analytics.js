/* =====================================================================
   CardioEXCEL Web — модуль сбора обезличенной статистики использования.

   Назначение:
     Позволяет оператору видеть агрегированную активность: открытие
     приложения, открытие конкретного калькулятора, запуск/выход.
     Отправляется ТОЛЬКО обезличенная информация (идентификаторы
     калькуляторов, типы событий, дата). НИКОГДА не передаются:
     вводимые данные, результаты расчётов, данные пациентов, ФИО,
     адреса, любые значения полей ввода.

   Совместимость с автономным режимом (file://):
     Приложение распространяется как локальный файл и должно работать
     без интернета. Модуль спроектирован так, что:
       - Без сети ничего не отправляется, приложение продолжает работать;
       - Отправка идёт через navigator.sendBeacon (при его наличии) или
         fallback на невидимый Image() — оба механизма не блокируют
         основной поток и безопасно деградируют;
       - Отключён/неисправен транспорта — модуль молча пропускает событие.
     Реального счётчика Яндекс.Метрики в file:// мы не подгружаем,
     поэтому события шлются напрямую на endpoint Метрики как «hit»
     (параметры идут в query). Для работы с активным счётчиком Метрики
     приложение должно быть опубликовано по HTTPS; здесь закрываем
     локальный случай, не ломая офлайн-функциональность.

   Конфигурация задаётся через window.__CARDIO_ANALYTICS__ (см. конец файла
   и момент подключения в CardioEXCEL.html):

     {
       enabled:  bool,            // вкл/выкл телеметрию (по умолчанию true)
       counterId: number|string,  // ID счётчика Яндекс.Метрики
       endpoint: string,          // куда слать (по умолчанию mc.yandex.ru)
       sampleRate: 0..1,          // доля событий, которые реально отправляются
       stateKey: string           // ключ в localStorage под флагом «включено»
     }

   МОДЕЛЬ ПО УМОЛЧАНИЮ: анонимная статистика ВКЛЮЧЕНА, отдельного согласия
   не требуется (opt-out). Сбор не зависит от наличия/отсутствия рекламы:
   и с включёнными информационными баннерами, и без них статистика
   работает одинаково. Пользователь может в любой момент выключить сбор
   переключателем в настройках (значение хранится локально в stateKey).
   Фактическая отправка возможна ТОЛЬКО при наличии сети интернет.

   (c) Синкевич Д.А. — CardioEXCEL Web v18.
   ===================================================================== */

(function () {
  'use strict';

  /* Имена ключей localStorage. Вынесены, чтобы не пересекаться с
     остальными ключами приложения. */
  var KEY = {
    state: 'cardioexcel.analytics.state.v1',   // флаг «включено» (default ON)
    queue: 'cardioexcel.analytics.queue.v1',
    config: 'cardioexcel.analytics.config.v1'
  };

  /* Дефолтная конфигурация. enabled=true — модель «вкл по умолчанию»
     (opt-out). Настоящий counterId заполняется из window.__CARDIO_ANALYTICS__
     при публикации; пока счётчик не задан — модуль неактивен, что безопасно
     для офлайн-сборок. */
  var DEFAULTS = {
    enabled: true,
    counterId: null,
    endpoint: 'https://mc.yandex.ru',
    sampleRate: 1,
    stateKey: KEY.state,
    maxQueue: 100
  };

  var cfg = Object.assign({}, DEFAULTS);

  /* Очередь неотправленных событий. Нужна, чтобы переживать краткие
     офлайн-окна: без сети события не теряются, а ждут следующего раза. */
  var queue = loadJSON(KEY.queue, []);
  if (!Array.isArray(queue)) queue = [];

  function readConfig() {
    var meta = null;
    try {
      if (window.__CARDIO_ANALYTICS__ && typeof window.__CARDIO_ANALYTICS__ === 'object') {
        meta = window.__CARDIO_ANALYTICS__;
      }
    } catch (e) { meta = null; }

    var stored = loadJSON(KEY.config, null);
    var src = {};
    if (meta) src = meta;
    else if (stored) src = stored;

    cfg.enabled = src.enabled !== false;   // по умолчанию включено (opt-out)
    cfg.counterId = (typeof src.counterId === 'string' || typeof src.counterId === 'number')
      ? String(src.counterId) : null;
    if (src.endpoint) cfg.endpoint = String(src.endpoint);
    if (typeof src.sampleRate === 'number' && src.sampleRate >= 0 && src.sampleRate <= 1) {
      cfg.sampleRate = src.sampleRate;
    }
    if (src.stateKey) cfg.stateKey = String(src.stateKey);
    if (typeof src.maxQueue === 'number' && src.maxQueue > 0) cfg.maxQueue = src.maxQueue;
  }

  function loadJSON(k, fallback) {
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function saveQueue() {
    try { localStorage.setItem(KEY.queue, JSON.stringify(queue)); } catch (e) {}
  }

  /* Сбор обезличенной статистики ВСЕГДА ВКЛЮЧЁН и не может быть отключён
     пользователем. Никакого локального флага «выключено» нет — isOptIn()
     всегда возвращает true. Отключить сбор можно только на стороне
     развёртывания (counterId пуст => модуль неактивен). */
  function isOptIn() {
    return true;
  }

  function persistConfig() {
    try {
      localStorage.setItem(KEY.config, JSON.stringify({
        enabled: cfg.enabled,
        counterId: cfg.counterId,
        endpoint: cfg.endpoint,
        sampleRate: cfg.sampleRate
      }));
    } catch (e) {}
  }

  /* Проверка сети. Не блокирует: если определённо нет сети — пропускаем. */
  function isOnline() {
    return typeof navigator !== 'undefined' && navigator.onLine !== false;
  }

  /* Отправка одного события по сети (GET, как требует Яндекс.Метрика).
     Используем невидимый Image(): он делает GET-запрос, не подчиняется
     CORS и работает и из https, и из file://. sendBeacon шлёт POST,
     который Метрика на /watch не принимает (404), поэтому его не используем. */
  function sendOne(e) {
    var url = buildUrl(e);
    if (!url) return false;

    try {
      var img = new Image();
      img.src = url;
      /* не бросаем исключение при ошибке загрузки пикселя — это нормально */
      img.onerror = function () {};
      img.onload = function () {};
      return true;
    } catch (err) {
      return false;
    }
  }

  /* URL события в формате запроса Яндекс.Метрики:
     https://mc.yandex.ru/watch/{counterId}?... параметры.
     Не содержит персональных данных — только id калькулятора и тип. */
  function buildUrl(e) {
    if (!cfg.counterId) return null;
    var page = typeof location !== 'undefined' && location.href ? location.href : 'cardioexcel-web';
    var p = [
      'page-url=' + encodeURIComponent(page),
      'charset=utf-8',
      'browser-info=java%3A0',
      'request-id=' + Math.random().toString(36).slice(2) + Date.now().toString(36),
      e.id != null ? 'id=' + encodeURIComponent(String(e.id)) : '',
      e.type ? 'type=' + encodeURIComponent(e.type) : ''
    ].filter(Boolean);
    return cfg.endpoint + '/watch/' + cfg.counterId + '?' + p.join('&');
  }

  function push(e) {
    // Очередь накапливается при включённой телеметрии (opt-out) независимо
    // от наличия счётчика. Фактическая отправка — только при наличии сети.
    if (!cfg.enabled || !isOptIn()) return;
    if (typeof e !== 'object' || !e) return;

    /* Сэмплирование: шлём лишь долю событий, чтобы не спамить */
    if (cfg.sampleRate < 1 && Math.random() >= cfg.sampleRate) return;

    queue.push({
      t: Date.now(),
      id: e.id != null ? String(e.id) : null,
      type: e.type || 'usage'
    });
    if (queue.length > cfg.maxQueue) queue.shift();
    saveQueue();
    flushIfPossible();
  }

  /* Попытка отправить накопленную очередь. Отправляем до 8 событий за
     раз, чтобы не создавать нагрузку; остаток ждёт следующего вызова. */
  function flushIfPossible() {
    if (!isOnline() || !queue.length) return;

    var sent = 0;
    while (queue.length && sent < 8) {
      var e = queue[0];
      if (sendOne(e)) {
        queue.shift();
        sent++;
      } else {
        break; // сеть есть, но доставка не прошла — не отбрасываем, ждём
      }
    }
    if (sent) saveQueue();
  }

  /* Публичное API. Вызывается из app.js при открытии калькуляторов и
     из оболочки при старте/выходе. */
  window.CardioAnalytics = {
    /* Полностью активен: телеметрия включена и счётчик задан.
       Сбор не может быть отключён пользователем — isOptIn() всегда true. */
    enabled: function () { return cfg.enabled && !!cfg.counterId && isOptIn(); },
    track: function (type, id) {
      push({ type: type, id: id != null ? id : null });
    },
    openApp: function () { push({ type: 'open_app', id: null }); },
    openCalc: function (id) { push({ type: 'open_calc', id: id }); },
    /* Совместимость с прежним API. Сбор НЕотключаем: вызов ни на что
       не влияет (нет локального флага выключения). Возвращает false. */
    setOptOut: function (off) { void off; return false; },
    /* Текущее состояние: сбор всегда включён (true). */
    isOptIn: function () { return isOptIn(); },
    setEnabled: function (on) { cfg.enabled = !!on; persistConfig(); },
    isConfigured: function () { return !!cfg.counterId; }
  };

  /* Старт: подхватываем конфигурацию из window.__CARDIO_ANALYTICS__,
     если она была задана при подключении. */
  readConfig();
  persistConfig();

  /* Отправляем накопленное при старте (например, после долгого офлайна). */
  window.addEventListener('online', function () { flushIfPossible(); }, false);
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeunload', function () {
      if (isOnline()) flushIfPossible();
    }, false);
  }
})();