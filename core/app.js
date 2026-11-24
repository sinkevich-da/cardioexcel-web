/* =====================================================================
   CardioEXCEL Web v18 — Логика оболочки
   · каждый калькулятор открывается в собственном iframe;
   · iframe создаётся один раз и живёт до закрытия вкладки — состояние
     введённых данных не теряется при переключении;
   · контролируемый обмен с расчётами через postMessage;
   · версионирование и миграция из localStorage v17.
   © 2026 Врач-кардиолог, к.м.н. Синкевич Д.А., Иркутск
   ===================================================================== */
(() => {
'use strict';

const APP_VERSION = '18';
const SEC_PER_OPEN = 45;        // среднее время одного ручного расчёта в Excel (сек/открытие)
const MAX_IFRAMES = 8;          // верхний лимит одновременно открытых документов
const ERR_MSG = 'Не удалось открыть калькулятор. Попробуйте ещё раз.';

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const el = {
  dashboard: $('viewDashboard'),
  workspace: $('viewWorkspace'),
  frameWrap: $('workspaceFrameWrap'),
  tabsInner: $('excelTabsInner'),
  popular: $('popularGrid'),
  recent: $('recentGrid'),
  all: $('allGrid'),
  emptySearch: $('emptySearch'),
  search: $('searchInput'),
  resetTopBtn: $('resetTopBtn'),
  resetRecentBtn: $('resetRecentBtn'),
  resetOrderBtn: $('resetOrderBtn'),
  btnHome: $('btnHome'),
  btnCloseAll: $('btnCloseAll'),
  btnSettings: $('btnSettings'),
  btnResetAll: $('btnResetAll'),
  appMain: $('appMain'),
  brandHomeLink: $('brandHomeLink'),
  setupBanner: $('setupBanner'),
  bannerLoadBtn: $('bannerLoadBtn'),
  setupModal: $('setupModal'),
  settingsModal: $('settingsModal'),
  closeSetup: $('closeSetup'),
  closeSettings: $('closeSettings'),
  filePicker: $('filePicker'),
  filePickerReload: $('filePickerReload'),
  setupStatus: $('setupStatus'),
  setupProgress: $('setupProgress'),
  setupProgressBar: $('setupProgressBar'),
  footer: $('legalFooter'),
  togglePractice: $('togglePractice'),
  practiceSummary: $('practiceSummary'),
  practiceDetail: $('practiceDetail'),
  versionBadge: $('appVersionBadge')
};

// ---------- состояние ----------
const state = {
  contents:  {},       // { calcId: html }
  loadedFromDB: false, // содержимое уже прочитано из IndexedDB
  openTabs:  [],       // порядок открытия
  activeTab: null,
  view: 'dashboard',
  search: '',
  dailyActivity: {},
  lastUsed: {},
  pairOpens: {}, // { "fromId>toId": count } — реальные пары последовательных открытий
  lastOpenedId: null, // id последнего открытого инструмента (для цепочки пар)
  // iframe per tab: { [calcId]: { frame, loaded, pendingHash, error } }
  frames: {}
};

// ---------- localStorage-состояние (мелкие настройки) ----------
const ls = StorageManager.ls;
const LSKEY = {
  popularity: 'cardioexcel.popularity.v1',
  history: 'cardioexcel.history.v1',
  openTabs: 'cardioexcel.openTabs.v18',
  tabOrder: 'cardioexcel.tabOrder.v18',
  activeTab: 'cardioexcel.activeTab.v18',
  cardOrder: 'cardioexcel.cardOrder.v1',
  view: 'cardioexcel.view.v18',
  practiceOpen: 'cardioexcel.practiceOpen.v1',
  dailyActivity: 'cardioexcel.dailyActivity.v1',
  lastUsed: 'cardioexcel.lastUsed.v1',
  pairOpens: 'cardioexcel.pairOpens.v1'
};

state.popularity = ls.get(LSKEY.popularity, {});
state.history    = ls.get(LSKEY.history, []);
state.cardOrder  = ls.get(LSKEY.cardOrder, []);
state.practiceOpen = !!ls.get(LSKEY.practiceOpen, false);
state.dailyActivity = ls.get(LSKEY.dailyActivity, {});
try {
  const lu = JSON.parse(localStorage.getItem(LSKEY.lastUsed) || '{}');
  state.lastUsed = (lu && typeof lu === 'object') ? lu : {};
} catch(_) { state.lastUsed = {}; }
state.pairOpens = ls.get(LSKEY.pairOpens, {});

// ---------- утилиты ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MS_DAY = 86400000;

function localDayKey(input){
  const x = new Date(input);
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,'0');
  const d = String(x.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function persist(){
  ls.set(LSKEY.popularity, state.popularity);
  ls.set(LSKEY.history, state.history);
  ls.set(LSKEY.openTabs, state.openTabs);
  ls.set(LSKEY.activeTab, state.activeTab);
  ls.set(LSKEY.cardOrder, state.cardOrder);
  ls.set(LSKEY.view, state.view);
  ls.set(LSKEY.dailyActivity, state.dailyActivity);
  localStorage.setItem(LSKEY.lastUsed, JSON.stringify(state.lastUsed));
  ls.set(LSKEY.pairOpens, state.pairOpens);
}

function loadedCount(){
  return CALCULATORS.filter(c => !!state.contents[c.id]).length;
}
function isFullyLoaded(){
  return loadedCount() === CALCULATORS.length;
}

function trackUsage(id){
  const now = Date.now();
  const today = localDayKey(now);
  state.popularity[id] = (state.popularity[id] || 0) + 1;
  // Реальная пара последовательных открытий: from -> to.
  const prev = state.lastOpenedId;
  if (prev && prev !== id && CALC_MAP.has(prev) && CALC_MAP.has(id)){
    const k = prev + '>' + id;
    state.pairOpens[k] = (state.pairOpens[k] || 0) + 1;
  }
  state.lastOpenedId = id;
  state.history = state.history.filter(x => x !== id);
  state.history.unshift(id);
  if (state.history.length > 30) state.history.length = 30;

  state.dailyActivity[today] = (state.dailyActivity[today] || 0) + 1;
  state.lastUsed[id] = now;

  const cutoff = localDayKey(now - 365 * MS_DAY);
  Object.keys(state.dailyActivity || {}).forEach(d => {
    if (d < cutoff) delete state.dailyActivity[d];
  });
  try { localStorage.setItem('cardioexcel.lastUsed.v1', JSON.stringify(state.lastUsed)); } catch(_) {}
  try { ls.set(LSKEY.pairOpens, state.pairOpens); } catch(_) {}
}

// ---------- injectBase ----------
function injectBase(html){
  try {
    const baseTag = `<base href="about:srcdoc">`;
    const script = `
      <script>
        (function(){
          function req(msg){
            try { parent.postMessage(msg, '*'); } catch(e){}
          }
          document.addEventListener('click', function(e){
            var a = e.target.closest('a'); if (!a) return;
            var href = a.getAttribute('href'); if (!href) return;
            if (href.charAt(0) === '#'){ e.preventDefault();
              if (location.hash !== href) location.hash = href; return; }
            if (/^https?:\\/\\//i.test(href)) return;
            if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
            if (/\\.html?(\\?|#|$)/i.test(href)){
              e.preventDefault();
              var filename = href.split(/[?#]/)[0];
              var baseName = filename.replace(/^.*\\//, '').replace(/\\.html?$/i, '');
              var hashIdx = href.indexOf('#'); var hash = hashIdx !== -1 ? href.substring(hashIdx) : null;
              req({ t:'nav', file: baseName, hash: hash });
            }
          });
        })();
      <\/script>
    `;
    if (/<head[^>]*>/i.test(html)){
      return html.replace(/<head[^>]*>/i, m => m + baseTag + script);
    }
    return baseTag + script + html;
  } catch(e){ return html; }
}

/* =====================================================================
   ВКЛАДКИ
   ===================================================================== */

// Создаём iframe для calc, если ещё нет. Не пересоздаём при повторном
// открытии той же вкладки.
function ensureFrame(id){
  if (state.frames[id]) return state.frames[id];
  const content = state.contents[id];
  if (!content) return null;

  const wrap = document.createElement('div');
  wrap.className = 'frame-pane';
  wrap.setAttribute('data-calc-id', id);

  const frame = document.createElement('iframe');
  frame.className = 'calc-iframe';
  frame.title = (CALC_MAP.get(id) || {title:id}).title;
  // allow-same-origin + allow-scripts + allow-modals: внутрь загружается
  // собственный HTML, доступ к parent ограничен через postMessage.
  // allow-modals нужен, чтобы window.print() (кнопка «Печать» в рецепте 107-1/у)
  // работал внутри sandbox-iframe — без него браузер молча подавляет печать.
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals');
  frame.setAttribute('allow', '');

  const loader = document.createElement('div');
  loader.className = 'frame-loader';
  loader.innerHTML = '<span>Загрузка…</span>';

  wrap.appendChild(loader);
  wrap.appendChild(frame);

  const rec = { id, frame, wrap, loaded: false, error: false, pendingHash: null, loader };
  state.frames[id] = rec;
  el.frameWrap.appendChild(wrap);

  frame.onload = () => { rec.loaded = true; rec.loader.style.display = 'none'; };
  frame.onerror = () => {
    rec.error = true; rec.loader.style.display = 'none';
    showFrameError(rec, id);
  };

  try {
    frame.srcdoc = injectBase(content);
  } catch(e){
    rec.error = true; rec.loader.style.display = 'none';
    showFrameError(rec, id);
  }
  return rec;
}

function showFrameError(rec, id){
  const err = document.createElement('div');
  err.className = 'frame-error';
  err.innerHTML = `<p>${ERR_MSG}</p>
    <button type="button">Повторить</button>`;
  err.querySelector('button').addEventListener('click', () => {
    err.remove();
    rec.error = false;
    rec.loader.style.display = '';
    try { rec.frame.srcdoc = injectBase(state.contents[id]); } catch(e){}
  });
  rec.wrap.appendChild(err);
}

function applyView(){
  const showWork = state.view === 'workspace' && state.activeTab;
  el.dashboard.hidden = showWork;
  el.workspace.hidden = !showWork;

  // видимость панелей: только активная вкладка
  // CSS показывает pane через .frame-pane[data-active="1"]{display:block},
  // поэтому управляем атрибутом data-active (inline display:'' недостаточно —
  // без него применяется display:none из CSS).
  Object.keys(state.frames).forEach(id => {
    const f = state.frames[id];
    if (id === state.activeTab){
      f.wrap.setAttribute('data-active', '1');
    } else {
      f.wrap.removeAttribute('data-active');
    }
  });

  if (!el.dashboard.hidden) {
    renderPractice();
    if (typeof window.renderAdsOnce === 'function') window.renderAdsOnce();
  }

  // обновление индикатора активной вкладки
  updateTabs();
  el.appMain.scrollTop = 0;
  el.btnCloseAll.disabled = state.openTabs.length === 0;
}

function openCalculator(id, hash){
  const calc = CALC_MAP.get(id);
  if (!calc) return;
  const content = state.contents[id];
  if (!content){
    openSetupModal(`Калькулятор «${calc.shortTitle}» ещё не загружен. Выберите HTML-файлы калькуляторов.`);
    return;
  }
  const wasActive = state.activeTab === id && state.view === 'workspace';
  if (!wasActive) trackUsage(id);

  const rec = ensureFrame(id);
  if (rec && hash) rec.pendingHash = hash;
  if (!state.openTabs.includes(id)) state.openTabs.push(id);
  state.activeTab = id;
  state.view = 'workspace';
  persist();
  applyView();

  if (rec && rec.pendingHash && rec.loaded){
    try { rec.frame.contentWindow.location.hash = rec.pendingHash; } catch(e){}
    rec.pendingHash = null;
  }
}

function activateTab(id){
  if (!state.openTabs.includes(id)) return;
  const wasActive = state.activeTab === id && state.view === 'workspace';
  if (!wasActive) trackUsage(id);
  state.activeTab = id;
  state.view = 'workspace';
  persist();
  applyView();
}

function closeTab(id){
  // освобождение iframe
  const rec = state.frames[id];
  if (rec){
    try { rec.frame.removeAttribute('srcdoc'); } catch(_) {}
    rec.wrap.remove();
    delete state.frames[id];
  }
  state.openTabs = state.openTabs.filter(x => x !== id);
  if (state.activeTab === id){
    const remaining = state.openTabs;
    if (remaining.length){ state.activeTab = remaining[remaining.length-1]; state.view='workspace'; }
    else { state.activeTab = null; state.view = 'dashboard'; }
  }
  persist();
  applyView();
}

function closeAllTabs(){
  Object.keys(state.frames).forEach(id => {
    const rec = state.frames[id];
    try { rec.frame.removeAttribute('srcdoc'); } catch(_) {}
    rec.wrap.remove();
    delete state.frames[id];
  });
  state.openTabs = [];
  state.activeTab = null;
  state.view = 'dashboard';
  persist();
  applyView();
}

function goHome(){
  state.view = 'dashboard';
  persist();
  // перерисовать дашборд (популярные/последние/статистика), чтобы карточки
  // и количество вкладок отображались актуальными сразу при возврате
  renderDashboard();
  applyView();
}

// ---------- табы ----------
function updateTabs(){
  el.tabsInner.innerHTML = '';
  if (state.openTabs.length === 0){
    const empty = document.createElement('div');
    empty.className = 'tabs-empty';
    empty.textContent = 'Нет открытых калькуляторов — выберите на главной панели';
    el.tabsInner.appendChild(empty);
    return;
  }
  const ordered = state.openTabs; // порядок открытия
  ordered.forEach(id => {
    const calc = CALC_MAP.get(id);
    if (!calc) return;
    const tab = document.createElement('div');
    tab.className = 'tab' + (id === state.activeTab ? ' active' : '');
    tab.dataset.id = id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', id === state.activeTab ? 'true' : 'false');
    tab.title = calc.title;
    tab.innerHTML = `
      <span class="tab-label">${esc(calc.shortTitle)}</span>
      <button class="tab-close" type="button" aria-label="Закрыть ${esc(calc.shortTitle)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>`;
    tab.addEventListener('click', e => {
      if (e.target.closest('.tab-close')) return;
      activateTab(id);
    });
    tab.addEventListener('dragstart', onTabDragStart);
    tab.addEventListener('dragend', onTabDragEnd);
    tab.addEventListener('dragenter', onTabDragEnter);
    tab.addEventListener('dragover', e => { e.preventDefault(); });
    tab.addEventListener('drop', onTabDrop);
    tab.querySelector('.tab-close').addEventListener('click', e => { e.stopPropagation(); closeTab(id); });
    el.tabsInner.appendChild(tab);
  });
  const active = el.tabsInner.querySelector('.tab.active');
  if (active) active.scrollIntoView({ inline:'nearest', block:'nearest' });
}

// ---------- Drag-and-drop вкладок ----------
let _tabDragId = null;

function onTabDragStart(e){
  const tab = e.target.closest('.tab');
  if (!tab) return;
  _tabDragId = tab.dataset.id;
  tab.classList.add('dragging');
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', _tabDragId); } catch(_){}
}

function onTabDragEnd(e){
  const tab = e.target.closest('.tab');
  if (tab) tab.classList.remove('dragging');
  el.tabsInner.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('drag-over-left', 'drag-over-right');
  });
  _tabDragId = null;
}

function onTabDragEnter(e){
  const tab = e.target.closest('.tab');
  if (!tab || !_tabDragId || tab.dataset.id === _tabDragId) return;
  e.preventDefault();
  const rect = tab.getBoundingClientRect();
  const after = (e.clientX - rect.left) > rect.width / 2;
  tab.classList.remove('drag-over-left', 'drag-over-right');
  tab.classList.add(after ? 'drag-over-right' : 'drag-over-left');
}

function onTabDrop(e){
  e.preventDefault();
  const target = e.target.closest('.tab');
  if (!target || !_tabDragId || target.dataset.id === _tabDragId) return;
  const rect = target.getBoundingClientRect();
  const after = (e.clientX - rect.left) > rect.width / 2;

  const fromId = _tabDragId;
  const toId = target.dataset.id;
  const arr = state.openTabs.slice();
  const fromIdx = arr.indexOf(fromId);
  const toIdx = arr.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return;
  arr.splice(fromIdx, 1);
  const insertAt = arr.indexOf(toId) + (after ? 1 : 0);
  arr.splice(insertAt, 0, fromId);

  state.openTabs = arr;
  persist();
  updateTabs();
}

/* =====================================================================
   ДАШБОРД
   ===================================================================== */
function cardHTML(calc, popularityCount, opts){
  const reorderable = !!(opts && opts.reorderable);
  const hasContent = !!state.contents[calc.id];
  const iconSvg = ICONS[calc.icon] || ICONS.heart;
  const grip = reorderable ? `<span class="drag-grip" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg></span>` : '';
  return `
    <article class="calc-card${hasContent ? '' : ' loading'}${reorderable ? ' reorderable' : ''}"
             data-calc-id="${esc(calc.id)}" tabindex="0" role="button" aria-label="Открыть ${esc(calc.title)}">
      ${grip}
      <div class="calc-card-head">
        <div class="calc-icon" aria-hidden="true">${iconSvg}</div>
        <div class="calc-title-box">
          <h3 class="calc-title">${esc(calc.shortTitle)}</h3>
          <span class="calc-category">${esc(calc.category)}</span>
        </div>
      </div>
      <p class="calc-desc">${esc(calc.desc)}</p>
      <div class="calc-meta">
        <span>${popularityCount != null ? `<span class="calc-popularity">★ ${popularityCount}</span>` : ''}</span>
        <span class="open-hint">${hasContent ? 'Открыть' : 'Загрузить файл'}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></span>
      </div>
    </article>`;
}

function getOrderedIds(){
  const order = state.cardOrder.filter(id => CALC_MAP.has(id));
  CALCULATORS.forEach(c => { if (!order.includes(c.id)) order.push(c.id); });
  return order;
}

function renderAllGrid(){
  const q = state.search.trim().toLowerCase();
  const list = getOrderedIds().map(id => CALC_MAP.get(id)).filter(c => {
    if (!q) return true;
    return (c.title + ' ' + c.shortTitle + ' ' + c.category + ' ' + c.desc).toLowerCase().includes(q);
  });
  if (list.length === 0){
    el.all.innerHTML = '';
    el.emptySearch.hidden = false;
  } else {
    el.emptySearch.hidden = true;
    el.all.innerHTML = list.map(c => cardHTML(c, null, { reorderable:true })).join('');
    el.all.querySelectorAll('.calc-card').forEach(card => {
    card.draggable = true;
    card.addEventListener('dragstart', onCardDragStart);
    card.addEventListener('dragend', onCardDragEnd);
    card.addEventListener('dragenter', onCardDragEnter);
    card.addEventListener('dragover', e => { e.preventDefault(); });
    card.addEventListener('drop', onCardDrop);
  });
  }
  el.resetOrderBtn.hidden = state.cardOrder.length === 0;
}

// ---------- Drag-and-drop карточек «Все калькуляторы» ----------
let _dragId = null;

function onCardDragStart(e){
  const card = e.target.closest('.calc-card');
  if (!card) return;
  _dragId = card.dataset.calcId;
  card.classList.add('dragging');
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', _dragId); } catch(_){}
}

function onCardDragEnd(e){
  const card = e.target.closest('.calc-card');
  if (card) card.classList.remove('dragging');
  el.all.querySelectorAll('.calc-card').forEach(c => {
    c.classList.remove('drag-over-left', 'drag-over-right');
  });
  _dragId = null;
}

function onCardDragEnter(e){
  const card = e.target.closest('.calc-card');
  if (!card || !_dragId || card.dataset.calcId === _dragId) return;
  e.preventDefault();
  // определить сторону: слева или справа от центра перетаскиваемого
  const rect = card.getBoundingClientRect();
  const after = (e.clientX - rect.left) > rect.width / 2;
  card.classList.remove('drag-over-left', 'drag-over-right');
  card.classList.add(after ? 'drag-over-right' : 'drag-over-left');
}

function onCardDrop(e){
  e.preventDefault();
  const target = e.target.closest('.calc-card');
  if (!target || !_dragId || target.dataset.calcId === _dragId) return;
  const rect = target.getBoundingClientRect();
  const after = (e.clientX - rect.left) > rect.width / 2;

  const fromId = _dragId;
  const toId = target.dataset.calcId;
  const ids = getOrderedIds();
  const fromIdx = ids.indexOf(fromId);
  const toIdx = ids.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return;
  ids.splice(fromIdx, 1);
  const insertAt = ids.indexOf(toId) + (after ? 1 : 0);
  ids.splice(insertAt, 0, fromId);

  state.cardOrder = ids;
  ls.set(LSKEY.cardOrder, ids);
  renderAllGrid();
}

function renderDashboard(){
  const popular = CALCULATORS.map(c => ({ c, n: state.popularity[c.id] || 0 })).filter(x => x.n > 0).sort((a,b) => b.n - a.n).slice(0,5);
  el.popular.innerHTML = popular.length ? popular.map(x => cardHTML(x.c, x.n)).join('')
    : `<div class="empty-state">Здесь появятся калькуляторы, которые вы открывали чаще всего.</div>`;
  el.resetTopBtn.hidden = popular.length === 0;

  const recent = state.history.slice(0,10).map(id => CALC_MAP.get(id)).filter(Boolean);
  el.recent.innerHTML = recent.length ? recent.map(c => cardHTML(c, null)).join('')
    : `<div class="empty-state">Здесь появится история недавних обращений.</div>`;
  el.resetRecentBtn.hidden = recent.length === 0;

  renderAllGrid();
  renderPractice();
  el.setupBanner.hidden = isFullyLoaded();
}

/* ============================================================
   МОЯ ПРАКТИКА (статистика использования)
   ============================================================ */
function pluralDays(n){
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}
function pluralOpens(n){
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'открытие';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'открытия';
  return 'открытий';
}
function plural(n, one, two, five){
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return two;
  return five;
}
function pluralEnd(n){
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return '';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'а';
  return 'ов';
}

// Принимает СЕКУНДЫ. Формат:
//   < 60 сек            -> «NN сек»
//   < 60 мин            -> «NN мин» или «NN мин MM сек»
//   >= 60 мин           -> «NN ч» или «NN ч MM м»
function formatDuration(seconds){
  if (!seconds) return '0 сек';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return m ? `${h} ч ${m} м` : `${h} ч`;
  if (m > 0) return s ? `${m} мин ${s} сек` : `${m} мин`;
  return `${s} сек`;
}

function computeStreak(){
  const keys = Object.keys(state.dailyActivity).sort();
  if (!keys.length) return { current: 0, longest: 0 };
  const today = localDayKey(Date.now());
  const yesterday = localDayKey(Date.now() - MS_DAY);
  let cursor = state.dailyActivity[today] ? today
             : state.dailyActivity[yesterday] ? yesterday
             : null;
  let current = 0;
  if (cursor){
    let d = new Date(cursor + 'T12:00:00');
    while (state.dailyActivity[localDayKey(d)]){
      current++;
      d = new Date(d.getTime() - MS_DAY);
    }
  }
  let longest = 1, run = 1;
  for (let i = 1; i < keys.length; i++){
    const prev = new Date(keys[i-1] + 'T12:00:00').getTime();
    const cur  = new Date(keys[i]   + 'T12:00:00').getTime();
    if (cur - prev === MS_DAY) run++;
    else run = 1;
    if (run > longest) longest = run;
  }
  return { current, longest: Math.max(longest, current) };
}

function computeWeekComparison(){
  const now = new Date();
  now.setHours(12,0,0,0);
  const dow = (now.getDay() + 6) % 7;
  const thisWeekStart = new Date(now.getTime() - dow * MS_DAY);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * MS_DAY);
  const lastWeekEnd   = new Date(thisWeekStart.getTime() - MS_DAY);
  let thisWeek = 0, lastWeek = 0;
  Object.entries(state.dailyActivity).forEach(([day, cnt]) => {
    const d = new Date(day + 'T12:00:00');
    if (d >= thisWeekStart && d <= now) thisWeek += cnt;
    else if (d >= lastWeekStart && d <= lastWeekEnd) lastWeek += cnt;
  });
  let delta;
  if (lastWeek === 0 && thisWeek === 0){
    delta = { type:'flat', value: 0 };
  } else if (lastWeek === 0){
    delta = { type:'new', value: thisWeek };
  } else {
    const pct = Math.round((thisWeek - lastWeek) / lastWeek * 100);
    delta = { type: pct > 0 ? 'pos' : pct < 0 ? 'neg' : 'flat', value: pct };
  }
  return { thisWeek, lastWeek, delta };
}

function computeWeekReport(){
  const now = new Date();
  now.setHours(12,0,0,0);
  const dow = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getTime() - dow * MS_DAY);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * MS_DAY);
  const weekDays = new Set();
  const lastWeekDays = new Set();
  let weekOpens = 0, lastWeekOpens = 0;
  Object.entries(state.dailyActivity).forEach(([day, cnt]) => {
    const d = new Date(day + 'T12:00:00').getTime();
    if (d >= weekStart.getTime() && d <= now.getTime()){
      weekDays.add(day); weekOpens += cnt;
    } else if (d >= lastWeekStart.getTime() && d < weekStart.getTime()){
      lastWeekDays.add(day); lastWeekOpens += cnt;
    }
  });
  const weekUsed = new Set();
  Object.entries(state.lastUsed).forEach(([id, ts]) => {
    if (ts >= weekStart.getTime() && CALC_MAP.has(id)) weekUsed.add(id);
  });
  const weekHistory = state.history.filter(id => {
    const ts = state.lastUsed[id];
    return ts >= weekStart.getTime() && CALC_MAP.has(id);
  });
  let peakDay = null, peakCount = 0;
  weekDays.forEach(day => {
    const c = state.dailyActivity[day] || 0;
    if (c > peakCount){ peakDay = day; peakCount = c; }
  });
  const activeDays = weekDays.size;
  const newCalcs = weekHistory.filter(id => !lastUsedIn(id, lastWeekStart.getTime()));
  const totalCalcs = CALCULATORS.length;
  return {
    weekOpens, lastWeekOpens, activeDays, weekDays,
    weekUsedCount: weekUsed.size, totalCalcs,
    newCalcs, peakDay, peakCount, rangeStart: weekStart
  };
}
function lastUsedIn(id, since){
  const ts = state.lastUsed[id];
  return !!(ts && ts >= since);
}

function computePartners(){
  // Реальные пары последовательных открытий из state.pairOpens.
  // Для каждого "from" берём самый частый "to" (куда чаще всего переходили).
  const result = [];
  const byFrom = {};
  Object.entries(state.pairOpens || {}).forEach(([key, count]) => {
    const sep = key.indexOf('>');
    if (sep < 0) return;
    const from = key.slice(0, sep);
    const to   = key.slice(sep + 1);
    if (!CALC_MAP.has(from) || !CALC_MAP.has(to)) return;
    if (!byFrom[from]) byFrom[from] = {};
    byFrom[from][to] = (byFrom[from][to] || 0) + count;
  });
  for (const from in byFrom){
    let bestId = null, bestCount = 0;
    for (const to in byFrom[from]){
      if (byFrom[from][to] > bestCount){ bestId = to; bestCount = byFrom[from][to]; }
    }
    if (bestId) result.push({ fromId: from, toId: bestId, count: bestCount });
  }
  result.sort((a,b) => b.count - a.count);
  return result;
}

function computePracticeStats(){
  const totalOpens = Object.values(state.popularity).reduce((a, b) => a + (b || 0), 0);
  const activeDays = Object.keys(state.dailyActivity).length;
  const savedSeconds = totalOpens * SEC_PER_OPEN;
  const streak = computeStreak();
  const week = computeWeekComparison();
  const byCategory = {};
  Object.entries(state.popularity).forEach(([id, cnt]) => {
    const calc = CALC_MAP.get(id);
    if (!calc || !cnt) return;
    byCategory[calc.category] = (byCategory[calc.category] || 0) + cnt;
  });
  const usedIds = new Set([...Object.keys(state.popularity), ...state.history]);
  const neverUsed = CALCULATORS.filter(c => !usedIds.has(c.id));
  const partners = computePartners();
  return { totalOpens, activeDays, savedSeconds, streak, week, byCategory, neverUsed, partners };
}

function pBlock(title, content){
  return `<div class="practice-block">
    <h4 class="practice-block__title">${title}</h4>
    ${content}
  </div>`;
}

function renderCategoryBlock(byCategory){
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!entries.length){
    return pBlock('📊 По категориям', '<p class="empty-mini">Откройте калькулятор — категории появятся здесь</p>');
  }
  const max = Math.max(...entries.map(e => e[1]));
  const bars = entries.map(([cat, cnt]) => `
    <div class="category-bar__row">
      <span class="category-bar__label" title="${esc(cat)}">${esc(cat)}</span>
      <div class="category-bar__track">
        <div class="category-bar__fill" style="width:${Math.round(cnt/max*100)}%"></div>
      </div>
      <span class="category-bar__value">${cnt}</span>
    </div>`).join('');
  return pBlock('📊 По категориям', `<div class="category-bars">${bars}</div>`);
}

function renderCalendarBlock(){
  // Матрица из фиксированных 12 недель-столбцов по 7 дней.
  // Правая колонка — текущая неделя, далее слева направо идут прошлые.
  // В каждом столбце дни идут сверху вниз начиная с понедельника.
  function startOfWeek(d){
    const x = new Date(d);
    x.setHours(12, 0, 0, 0);
    const day = (x.getDay() + 6) % 7; // 0 = понедельник
    return new Date(x.getTime() - day * MS_DAY);
  }
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const curWeekStart = startOfWeek(now);
  const nWeeks = 12;
  // Заголовок дней недели (сверху вниз).
  const dayLabels = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const labelCells = dayLabels
    .map(l => `<span class="activity-day-label">${l}</span>`)
    .join('');
  const cells = [];
  // Карта предыдущего дня для расчёта %.
  const prevDayOf = {};
  for (let w = 0; w < nWeeks; w++){
    const weekStart = new Date(curWeekStart.getTime() - (nWeeks - 1 - w) * 7 * MS_DAY);
    for (let dd = 0; dd < 7; dd++){
      const d = new Date(weekStart.getTime() + dd * MS_DAY);
      const key = localDayKey(d);
      const prevKey = localDayKey(new Date(weekStart.getTime() + (dd - 1) * MS_DAY));
      prevDayOf[key] = prevKey;
    }
  }
  // Интенсивность каждого дня = нормированная активность именно этого дня:
  // отношение открытий дня к максимальному числу открытий среди всех дней окна.
  // Чем больше открытий в день — тем интенсивнее (темнее) ячейка, чем меньше —
  // тем светлее. Каждый новый день пересчитывает градиент динамически.
  const allDays = [];
  for (let w = 0; w < nWeeks; w++){
    const weekStart = new Date(curWeekStart.getTime() - (nWeeks - 1 - w) * 7 * MS_DAY);
    for (let dd = 0; dd < 7; dd++){
      const d = new Date(weekStart.getTime() + dd * MS_DAY);
      allDays.push({ key: localDayKey(d), d });
    }
  }
  // Максимум открытий за один день в окне (для нормировки).
  const dayCnt = {};
  let maxCnt = 0;
  allDays.forEach(({ key }) => {
    const c = state.dailyActivity[key] || 0;
    dayCnt[key] = c;
    if (c > maxCnt) maxCnt = c;
  });
  // Непрерывный градиент: цвет между светлым и тёмным по доле дня.
  const gradColor = (k) => {
    if (maxCnt <= 0) return null;
    const t = dayCnt[k] / maxCnt; // 0..1
    if (t <= 0.001) return null;
    // интерполируем между #c7dff5 (светлый) и #0d47a1 (тёмный)
    const c1 = [199, 223, 245], c2 = [13, 71, 161];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
  };
  // Колонки (недели): слева направо от 11 недель назад к текущей.
  allDays.forEach(({ key, d }) => {
    const cnt = state.dailyActivity[key] || 0;
    const future = d.getTime() > now.getTime();
    const color = future ? null : gradColor(key);
    const level = color ? 1 : 0;
    let label = `${fmtDateISO(key)}: ${cnt} ${pluralOpens(cnt)} (день: ${cnt})`;
    // % изменения к предыдущему календарному дню (если у него есть активность).
    if (!future){
      const prevFullKey = prevDayOf[key];
      if (prevFullKey && state.dailyActivity[prevFullKey] !== undefined
          && prevFullKey < key){
        const prevCnt = state.dailyActivity[prevFullKey] || 0;
        const diff = prevCnt === 0
          ? null
          : Math.round(((cnt - prevCnt) / prevCnt) * 100);
        label += `\nк пред. дню: ${diff === null ? 'н/д' : (diff > 0 ? '+' + diff : diff) + '%'}`;
      }
    }
    cells.push(`<div class="activity-day" data-level="${level}"${color ? ` style="background:${color}"` : ''} title="${label}"></div>`);
  });
  const grid = `<div class="activity-calendar">
      <div class="activity-calendar__labels">${labelCells}</div>
      <div class="activity-calendar__body">${cells.join('')}</div>
    </div>`;
  const legend = `
    <div class="activity-legend">
      <span>меньше</span>
      <span class="activity-legend__swatch" style="background:var(--line-2)"></span>
      <span class="activity-legend__swatch" style="background:#c7dff5"></span>
      <span class="activity-legend__swatch" style="background:#8bc0ea"></span>
      <span class="activity-legend__swatch" style="background:var(--accent)"></span>
      <span class="activity-legend__swatch" style="background:var(--accent-dark)"></span>
      <span>больше</span>
    </div>`;
  return pBlock('📅 Активность за 12 недель', `${grid}${legend}`);
}

function renderNeverUsedBlock(neverUsed){
  const top = neverUsed.slice(0, 5);
  if (!top.length){
    return pBlock('🧭 Не пробовали', '<p class="empty-mini">Вы опробовали все калькуляторы 🎉</p>');
  }
  const items = top.map(c => `
    <div class="rec-item" data-calc-id="${esc(c.id)}" role="button" tabindex="0">
      <span class="rec-item__title">${esc(c.shortTitle)}</span>
      <span class="rec-item__meta">${esc(c.category)}</span>
    </div>`).join('');
  return pBlock('🧭 Не пробовали', `<div class="rec-list">${items}</div>`);
}

function renderPartnersBlock(partners){
  const top = partners.slice(0, 5);
  if (!top.length){
    return pBlock('🔗 Часто открывают вместе', '<p class="empty-mini">Откройте несколько инструментов — увидите свои связки</p>');
  }
  const items = top.map(p => {
    const fromCalc = CALC_MAP.get(p.fromId);
    const toCalc   = CALC_MAP.get(p.toId);
    if (!fromCalc || !toCalc) return '';
    return `
      <div class="rec-item" data-calc-id="${esc(p.toId)}" role="button" tabindex="0" title="Открыть «${esc(toCalc.shortTitle)}»">
        <span class="rec-item__title">${esc(fromCalc.shortTitle)} <span class="partner-arrow">→</span> ${esc(toCalc.shortTitle)}</span>
        <span class="rec-item__meta rec-item__meta--strong">×${p.count}</span>
      </div>`;
  }).join('');
  return pBlock('🔗 Часто открывают вместе', `<div class="rec-list">${items}</div>`);
}

function fmtRangeLabel(start){
  const s = fmtDateISO(localDayKey(start));
  const e = fmtDateISO(localDayKey(Date.now()));
  return `${s} — ${e}`;
}

// Форматирует дату в формат «дд.мм.гггг»
function fmtDateISO(isoKey){
  if (!isoKey) return '';
  const parts = String(isoKey).split('-');
  if (parts.length !== 3) return isoKey;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function renderWeekReport(w){
  const t = w.weekOpens, l = w.lastWeekOpens;
  let delta;
  if (t === 0 && l === 0){
    delta = `<span class="delta delta--flat">нет данных за неделю</span>`;
  } else if (l === 0){
    delta = `<span class="delta delta--new">на этой неделе: впервые</span>`;
  } else {
    const pct = Math.round((t - l) / l * 100);
    const cls = pct > 0 ? 'pos' : pct < 0 ? 'neg' : 'flat';
    delta = `<span class="delta delta--${cls}" title="Прошлая неделя: ${l}">${pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : ''}${pct}% к прошлой</span>`;
  }
  const newCalcs = w.newCalcs.map(id => {
    const c = CALC_MAP.get(id);
    return c ? esc(c.shortTitle) : '';
  }).filter(Boolean);
  const newChips = newCalcs.length
    ? `<div class="week-report__fast"><span>Впервые за неделю:</span>${
        newCalcs.slice(0,4).map(n => `<span class="week-report__chip">${n}</span>`).join('')
      }${newCalcs.length > 4 ? `<span class="week-report__chip"><b>+${newCalcs.length-4}</b></span>` : ''}</div>`
    : '';
  const peakNote = w.peakDay
    ? `<div class="week-report__stat"><span class="week-report__stat-label">Пик нагрузки</span>
        <span class="week-report__stat-value">${w.peakCount} ${pluralOpens(w.peakCount)}</span>
        <span class="week-report__stat-hint">${fmtDateISO(w.peakDay)}</span>
       </div>`
    : '';
  const mastery = w.totalCalcs ? Math.round(w.weekUsedCount / w.totalCalcs * 100) : 0;
  return `<div class="week-report" role="region" aria-label="Недельный отчёт">
    <div class="week-report__head">
      <span class="week-report__title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/></svg>
        Недельный отчёт
      </span>
      <span class="week-report__range">${fmtRangeLabel(w.rangeStart)}</span>
      <span class="week-report__delta">${delta}</span>
    </div>
    <div class="week-report__stats">
      <div class="week-report__stat"><span class="week-report__stat-label">Расчётов за неделю</span>
        <span class="week-report__stat-value">${t}</span>
        <span class="week-report__stat-hint">vs ${l} на прошлой</span></div>
      <div class="week-report__stat"><span class="week-report__stat-label">Активных дней</span>
        <span class="week-report__stat-value">${w.activeDays} из 7</span>
        <span class="week-report__stat-hint">${w.weekDays.size === 0 ? 'начните первый расчёт' : 'ритм сохраняется'}</span></div>
      <div class="week-report__stat"><span class="week-report__stat-label">Задействовано инструментов</span>
        <span class="week-report__stat-value">${w.weekUsedCount} / ${w.totalCalcs}</span>
        <span class="week-report__stat-hint">охват ${mastery}% всех шкал</span></div>
      ${peakNote}
    </div>
    ${newChips}
    ${newCalcs.length ? `<div class="week-report__note">В этом цикле вы <span class="week-report__new">освоили ${plural(newCalcs.length,'новый','новых','новых')} инструмент${pluralEnd(newCalcs.length)}</span> — клинический арсенал продолжает расти.</div>` : ''}
  </div>`;
}

function renderPractice(){
  const summary  = el.practiceSummary;
  const detail   = el.practiceDetail;
  if (!summary || !detail) return;
  const s = computePracticeStats();
  summary.innerHTML = `
    <div class="stat-card">
      <span class="stat-card__label">Всего открытий</span>
      <span class="stat-card__value">${s.totalOpens.toLocaleString('ru')}</span>
      <span class="stat-card__hint">за всё время</span>
    </div>
    <div class="stat-card stat-card--days">
      <span class="stat-card__label">Дней активности</span>
      <span class="stat-card__value">${s.activeDays}</span>
      <span class="stat-card__hint">${s.activeDays === 1 ? 'день' : pluralDays(s.activeDays)}</span>
    </div>
    <div class="stat-card stat-card--streak">
      <span class="stat-card__label">Серия</span>
      <span class="stat-card__value">${s.streak.current} 🔥</span>
      <span class="stat-card__hint">рекорд: ${s.streak.longest}</span>
    </div>
    <div class="stat-card stat-card--time">
      <span class="stat-card__label">≈ Сэкономлено</span>
      <span class="stat-card__value">${formatDuration(s.savedSeconds)}</span>
      <span class="stat-card__hint">≈ ${SEC_PER_OPEN} сек / расчёт</span>
    </div>`;
  detail.innerHTML = [
    renderWeekReport(computeWeekReport()),
    renderCategoryBlock(s.byCategory),
    renderCalendarBlock(),
    renderPartnersBlock(s.partners),
    renderNeverUsedBlock(s.neverUsed)
  ].join('');
  detail.querySelectorAll('.rec-item[data-calc-id]').forEach(item => {
    const handler = () => openCalculator(item.dataset.calcId);
    item.addEventListener('click', handler);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); handler(); }
    });
  });
}
function applyPracticeOpenState(open){
  if (!el.togglePractice || !el.practiceDetail) return;
  el.practiceDetail.hidden = !open;
  el.togglePractice.textContent = open ? 'Свернуть ▴' : 'Подробнее ▾';
  el.togglePractice.setAttribute('aria-expanded', String(open));
  ls.set(LSKEY.practiceOpen, open);
}
function togglePractice(){
  const isOpen = el.practiceDetail.hidden;
  applyPracticeOpenState(isOpen);
}

/* ---------- загрузка файлов ---------- */
function openSetupModal(hintText){
  el.setupModal.hidden = false;
  el.setupProgress.hidden = true;
  el.setupProgressBar.style.width = '0%';
  const total = CALCULATORS.length;
  const loaded = loadedCount();
  let html = '';
  if (hintText) html += `<div class="stat stat-warn">ℹ ${esc(hintText)}</div>`;
  html += `
    <div class="stat ${loaded === total ? 'stat-ok' : 'stat-warn'}">
      <div><b>Загружено: ${loaded} из ${total}</b>
      ${loaded < total ? `<br>Осталось: ${total - loaded} файлов. Вы можете догрузить их сейчас.` : '<br>Все калькуляторы загружены и готовы к работе.'}</div>
    </div>`;
  el.setupStatus.innerHTML = html;
}
function closeSetupModal(){ el.setupModal.hidden = true; }

function renderResults(results){
  const total = CALCULATORS.length;
  const loaded = loadedCount();
  const pct = Math.round(loaded / total * 100);
  let html = `
    <div class="stat ${loaded === total ? 'stat-ok' : 'stat-warn'}">
      <div><b>Загружено ${loaded} из ${total} калькуляторов (${pct}%).</b>
      ${loaded === total ? '<br>Всё готово — можно закрыть это окно и пользоваться.' : `<br>Вы можете догрузить оставшиеся файлы или закрыть окно и работать с тем, что есть.`}</div>
    </div>`;
  if (results.loaded.length) html += `<div class="stat stat-ok"><div><b>✓ Успешно сохранено: ${results.loaded.length}</b></div></div>`;
  if (results.skipped.length) html += `<div class="stat stat-warn"><div><b>⚠ Пропущено (${results.skipped.length}):</b><ul>${results.skipped.map(x => `<li>${esc(x.name)} — ${esc(x.reason)}</li>`).join('')}</ul></div></div>`;
  if (results.failed.length) html += `<div class="stat stat-err"><div><b>✗ Ошибки (${results.failed.length}):</b><ul>${results.failed.map(x => `<li>${esc(x.name)} — ${esc(x.reason)}</li>`).join('')}</ul></div></div>`;
  el.setupStatus.innerHTML = html;
}

async function saveToDB(id, content){
  try {
    await StorageManager.put(id, content, { version: 2 });
    return true;
  } catch(e){
    console.error('IndexedDB save failed:', id, e);
    return false;
  }
}

async function processFiles(fileList){
  const files = Array.from(fileList || []).filter(f => /\.html?$/i.test(f.name));
  if (!files.length){ alert('Выберите HTML-файлы калькуляторов (расширение .html или .htm).'); return; }
  el.setupProgress.hidden = false;
  el.setupProgressBar.style.width = '0%';
  const results = { loaded: [], skipped: [], failed: [] };
  let done = 0;
  const total = files.length;

  for (const file of files){
    const baseName = file.name.replace(/\.html?$/i, '').trim();
    const calcId = findCalculatorId(baseName);
    const text = await new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || ''));
      r.onerror = () => res(null);
      r.readAsText(file, 'utf-8');
    });
    if (!calcId){ results.skipped.push({ name:file.name, reason:'не найден в реестре калькуляторов' }); }
    else if (text == null){ results.failed.push({ name:file.name, reason:'ошибка чтения файла' }); }
    else {
      state.contents[calcId] = text;
      if (await saveToDB(calcId, text)) results.loaded.push({ name:file.name, id:calcId });
      else results.failed.push({ name:file.name, reason:'не удалось сохранить в IndexedDB' });
    }
    done++;
    el.setupProgressBar.style.width = Math.round(done/total*100) + '%';
  }
  finishLoad(results);
}

async function finishLoad(results){
  pushToDB();
  renderResults(results);
  renderDashboard();
  updateTabs();
  applyView();
}

// Откладываемые записи в IndexedDB (обновления содержимого из состояния).
let pendingDirty = false;
function pushToDB(){
  if (pendingDirty) return;
  pendingDirty = true;
  setTimeout(async () => {
    for (const id in state.contents){
      try { await StorageManager.put(id, state.contents[id], { version: 2 }); }
      catch(_) {}
    }
    pendingDirty = false;
  }, 200);
}

/* ---------- сброс ---------- */
async function resetAll(){
  if (!confirm('Очистить все данные?\n\nБудут удалены:\n• загруженные калькуляторы\n• история и топ-5\n• открытые вкладки\n• пользовательский порядок карточек\n• статистика практики\n\nДействие необратимо.')) return;
  try { await StorageManager.clearAll(); } catch(_) {}
  Object.keys(LSKEY).forEach(k => ls.remove(LSKEY[k]));
  try { localStorage.removeItem('cardioexcel.lastUsed.v1'); } catch(_) {}
  try { localStorage.removeItem('cardioexcel.migrated.v18'); } catch(_) {}

  closeAllTabs();
  state.popularity = {}; state.history = []; state.cardOrder = [];
  state.contents = {}; state.search = '';
  el.search.value = '';
  renderDashboard();
  applyView();
  el.settingsModal.hidden = true;
  openSetupModal('Данные сброшены. Загрузите HTML-файлы калькуляторов для продолжения работы.');
}

/* =====================================================================
   postMessage от расчётов (навигация)
   Проверяем тип сообщения и допустимость данных.
   ===================================================================== */
window.addEventListener('message', e => {
  const data = e.data;
  if (!data || typeof data !== 'object' || data.t !== 'nav') return;
  const file = typeof data.file === 'string' ? data.file.trim().toLowerCase() : '';
  if (!file) return;
  const id = findCalculatorId(file);
  if (id && CALC_MAP.has(id)) openCalculator(id, typeof data.hash === 'string' ? data.hash : null);
});

/* =====================================================================
   Получение содержимого из IndexedDB + миграция
   ===================================================================== */
async function loadFromDB(){
  if (state.loadedFromDB) return;
  state.loadedFromDB = true;
  try {
    if (!StorageManager.isSupported() || !(await StorageManager.isAvailable())){
      // Фолбэк — попытка принудительной миграции+чтения из localStorage не даст результата.
      // Пользователь загрузит файлы через выбор файлов.
      console.warn('IndexedDB недоступна — калькуляторы будут храниться только в этой сессии через localStorage fallback.');
      return;
    }
    const all = await StorageManager.getAll();
    all.forEach(rec => {
      if (rec.value && typeof rec.value === 'string' && CALC_MAP.has(rec.id)){
        state.contents[rec.id] = rec.value;
      }
    });
  } catch(e){
    console.error('loadFromDB failed:', e);
  }
}

function tryRestoreFromLS(){
  // последняя страховка: если в localStorage v17 осталось содержимое
  try {
    const v17 = JSON.parse(localStorage.getItem('cardioexcel.contents.v1') || '{}');
    let any = false;
    Object.keys(v17).forEach(id => {
      if (!state.contents[id] && v17[id] && CALC_MAP.has(id)){
        state.contents[id] = v17[id]; any = true;
      }
    });
  } catch(_) {}
}

/* ---------- init ---------- */
function initContentProtection(){
  // В v18 не блокируем контекстное меню и копирование в рабочей области —
  // это мешает врачу. Оставляем защиту только там, где она была уместна:
  // предотвращение случайного закрытия не требуется. Политика в privacy.
}

function initHandlers(){
  el.appMain.addEventListener('click', e => {
    const card = e.target.closest('[data-calc-id]');
    if (card) openCalculator(card.dataset.calcId);
  });
  el.appMain.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-calc-id]');
    if (card){ e.preventDefault(); openCalculator(card.dataset.calcId); }
  });
  el.search.addEventListener('input', e => { state.search = e.target.value; renderAllGrid(); });

  el.resetTopBtn.addEventListener('click', () => { if(confirm('Очистить статистику популярных калькуляторов?')){ state.popularity={}; persist(); renderDashboard(); } });
  el.resetRecentBtn.addEventListener('click', () => { if(confirm('Очистить историю последних использованных калькуляторов?')){ state.history=[]; persist(); renderDashboard(); } });
  el.resetOrderBtn.addEventListener('click', () => { state.cardOrder=[]; ls.set(LSKEY.cardOrder, []); renderAllGrid(); });

  if (el.togglePractice) el.togglePractice.addEventListener('click', togglePractice);
  if (el.brandHomeLink) el.brandHomeLink.addEventListener('click', e => { e.preventDefault(); goHome(); });
  el.btnHome.addEventListener('click', goHome);
  el.btnCloseAll.addEventListener('click', () => { if(state.openTabs.length && confirm('Закрыть все открытые калькуляторы?')) closeAllTabs(); });
  el.btnSettings.addEventListener('click', () => { el.settingsModal.hidden = false; });
  el.closeSetup.addEventListener('click', closeSetupModal);
  el.setupModal.addEventListener('click', e => { if(e.target === el.setupModal) closeSetupModal(); });
  el.bannerLoadBtn.addEventListener('click', () => openSetupModal());
  el.filePicker.addEventListener('change', e => { processFiles(e.target.files); e.target.value=''; });
  el.closeSettings.addEventListener('click', () => { el.settingsModal.hidden = true; });
  el.settingsModal.addEventListener('click', e => { if(e.target === el.settingsModal) el.settingsModal.hidden = true; });
  el.filePickerReload.addEventListener('change', e => { processFiles(e.target.files); e.target.value=''; el.settingsModal.hidden=true; el.setupModal.hidden=false; });
  el.btnResetAll.addEventListener('click', resetAll);

  document.addEventListener('keydown', e => { if (e.key === 'Escape'){ el.setupModal.hidden = true; el.settingsModal.hidden = true; } });
}

async function init(){
  initHandlers();
  if (window.__CARDIO_GUARD_BLOCKED__) return;

  if (el.versionBadge) el.versionBadge.textContent = 'v' + APP_VERSION;
  applyPracticeOpenState(!!state.practiceOpen);
  renderPractice();

  await loadFromDB();
  tryRestoreFromLS();

  // Восстановление открытых вкладок
  state.view = ls.get(LSKEY.view, 'dashboard');
  if (state.view === 'workspace'){
    const activeId = ls.get(LSKEY.activeTab, null);
    const openIds = Array.isArray(ls.get(LSKEY.openTabs, [])) ? ls.get(LSKEY.openTabs, []) : [];
    state.openTabs = openIds.filter(id => CALC_MAP.has(id) && state.contents[id]);
    if (state.openTabs.length){
      // открываем iframe для сохранённых вкладок
      state.activeTab = openIds.includes(activeId) ? activeId : state.openTabs[0];
      state.openTabs.forEach(id => ensureFrame(id));
    } else {
      state.view = 'dashboard';
    }
  }
  persist();
  renderDashboard();
  applyView();

  if (!isFullyLoaded()){
    // Запускаем миграцию из v17, если есть что переносить.
    const v17len = (() => { try { return (localStorage.getItem('cardioexcel.contents.v1') || "").length; } catch(_) { return 0; } })();
    if (v17len > 100 && !Migration.isMigrated()){
      try {
        await Migration.run(res => {
          if (res.migrated > 0 || res.alreadyDone){
            // показать результат после перечитывания
          }
        });
        await loadFromDB();
        tryRestoreFromLS();
        renderDashboard(); applyView();
      } catch(e){ console.error('migration failed:', e); }
    } else if (loadedCount() === 0){
      openSetupModal('Первый запуск. Выберите все HTML-файлы калькуляторов из папки «calculators».');
    }
  }
}

window.openCalculator = openCalculator;
window.findCalculatorId = findCalculatorId;

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();