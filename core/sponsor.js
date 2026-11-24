/* =====================================================================
   CardioEXCEL Web v18 — Спонсорская заставка «при поддержке»
   Автономный рендерер. Показывается при запуске приложения поверх
   дашборда: полупрозрачная (матовая) подложка + карточка спонсора с
   лого, названием и до 6 примеров препаратов. Исчезает через 5 секунд.
   Работает без сети: лого встроено как data:image/base64.
   Конфиг заставки берётся из window.CARDIO_AD_CAMPAIGN.splash — он
   генерируется ad-configurator.html в файл calculators/ad-config.js.
   © 2026 Врач-кардиолог, к.м.н. Синкевич Д.А., Иркутск
   ===================================================================== */
(() => {
'use strict';

// Маркер целостности: установлен, только если этот файл реально загружен.
window.__CARDIO_SPONSOR_LOADED__ = true;

function loadCfg(){
  try {
    const c = window.CARDIO_AD_CAMPAIGN && window.CARDIO_AD_CAMPAIGN.splash
      ? window.CARDIO_AD_CAMPAIGN.splash
      : null;
    if (!c || !c.enabled || !c.companyName) return null;
    if (!Array.isArray(c.products)) c.products = [];
    c.products = c.products.slice(0, 6);
    return c;
  } catch(_) { return null; }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function splashHTML(cfg){
  const logo = cfg.logoBase64
    ? `<img class="sponsor-logo" src="${cfg.logoBase64}" alt="Логотип ${esc(cfg.companyName)}">`
    : `<span class="sponsor-logo sponsor-logo--placeholder">${esc((cfg.companyName||'?').charAt(0))}</span>`;

  const blocks = (cfg.products && cfg.products.length)
    ? cfg.products.map(p => {
        // Блок препарата: картинка (пример упаковки) + подпись.
        const img = p && p.imageBase64
          ? `<span class="sponsor-prod-img"><img src="${esc(p.imageBase64)}" alt="${esc(p && p.name || '')}" loading="lazy"></span>`
          : '';
        const nm = p && p.name ? `<b class="sponsor-prod-name">${esc(p.name)}</b>` : '<b class="sponsor-prod-name">—</b>';
        const tx = p && p.text ? `<span class="sponsor-prod-text">${esc(p.text)}</span>` : '';
        return `<div class="sponsor-prod">${img}${nm}${tx}</div>`;
      }).join('')
    : '<div class="sponsor-prod sponsor-prod--empty">Препараты не указаны</div>';

  const note = cfg.note ? `<div class="sponsor-note">${esc(cfg.note)}</div>` : '';

  return `
    <div class="sponsor-splash" id="sponsorSplash" role="dialog" aria-modal="true" aria-label="Информационный экран спонсора">
      <div class="sponsor-backdrop"></div>
      <div class="sponsor-card">
        <button type="button" class="sponsor-close" id="sponsorClose" aria-label="Закрыть">✕</button>
        <div class="sponsor-head">
          <div class="sponsor-support">При поддержке</div>
          <div class="sponsor-brand">${logo}</div>
        </div>
        <div class="sponsor-body">
          <div class="sponsor-prods">
            ${blocks}
          </div>
        </div>
        ${note}
        <div class="sponsor-erid">${cfg.erid ? 'erid:' + esc(cfg.erid) : ''}</div>
        <div class="sponsor-footer">Информация для специалистов здравоохранения</div>
      </div>
    </div>`;
}

function dismiss(){
  const el = document.getElementById('sponsorSplash');
  if (el){
    el.classList.add('sponsor-splash--exit');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
  }
  window.__sponsorSplashShown__ = true;
}

function show(cfg){
  const host = document.body;
  const div = document.createElement('div');
  div.innerHTML = splashHTML(cfg).trim();
  host.insertBefore(div.firstChild, host.firstChild);

  const closeBtn = document.getElementById('sponsorClose');
  if (closeBtn) closeBtn.addEventListener('click', dismiss);

  // Автозакрытие через 5 секунд (5100 с учётом анимации).
  setTimeout(dismiss, 5100);
}

function maybeShow(){
  if (window.__sponsorSplashShown__) return;
  const cfg = loadCfg();
  if (!cfg) return;
  // Небольшая задержка, чтобы дашборд успел отрисоваться.
  setTimeout(() => show(cfg), 400);
}

window.__sponsorSplashShown__ = false;
window.sponsorShowNowForTest = function(){ const c = loadCfg(); if (c) show(c); };

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', maybeShow);
} else {
  maybeShow();
}

})();