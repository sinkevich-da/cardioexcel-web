/* =====================================================================
   CardioEXCEL Web v18 — Рендерер информационных баннеров
   Читает автономный конфиг кампании window.CARDIO_AD_CAMPAIGN
   (генерируется ad-configurator.html в ad-config.js и кладётся в
   calculators/). Отображает слоты по placement. Работает без сети:
   изображения встроены как data:image/base64.
   © 2026 Врач-кардиолог, к.м.н. Синкевич Д.А., Иркутск
   ===================================================================== */
(() => {
'use strict';

// Маркер целостности: установлен, только если этот файл реально загружен.
window.__CARDIO_ADS_LOADED__ = true;

// Конфиг объявляется ad-config.js до подключения этого модуля.
// Флаг — что конфиг действительно читался и включён.
window.__CARDIO_ADS_FOUND__ = !!(window.CARDIO_AD_CAMPAIGN);

if (!window.CARDIO_AD_CAMPAIGN || !window.CARDIO_AD_CAMPAIGN.enabled) {
  return;
}

const campaign = window.CARDIO_AD_CAMPAIGN;
const slots = Array.isArray(campaign.slots) ? campaign.slots : [];

// Один случайный баннер на позицию при каждом показе главной (ротация).
// Выбираем без повторов, циклически: после всех — снова с первого.
const byPlacement = {};
slots.forEach(s => { (byPlacement[s.placement] = byPlacement[s.placement] || []).push(s); });
const pickOrder = {};
Object.keys(byPlacement).forEach(p => {
  const arr = byPlacement[p].slice();
  // тасуем один раз при загрузке (Fisher–Yates)
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  pickOrder[p] = { arr, idx: 0 };
});
function pickedSlot(placement){
  const rec = pickOrder[placement];
  if (!rec || !rec.arr.length) return null;
  const ad = rec.arr[rec.idx % rec.arr.length];
  rec.idx = (rec.idx + 1) % rec.arr.length;
  return ad;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function slotHTML(ad){
  const img = ad && ad.imageBase64
    ? `<img class="ad-image" src="${ad.imageBase64}" alt="${esc(ad.title || '')}" loading="lazy">`
    : '';
  const badge = ad.badge ? `<span class="ad-badge">${esc(ad.badge)}</span>` : '';
  const erid = ad.erid ? `<span class="ad-erid">erid:${esc(ad.erid)}</span>` : '';
  const title = ad.title ? `<span class="ad-title">${esc(ad.title)}</span>` : '';
  const text = ad.text ? `<span class="ad-text">${esc(ad.text)}</span>` : '';
  const disclaimer = ad.disclaimer ? `<span class="ad-disclaimer">${esc(ad.disclaimer)}</span>` : '';
  let inner = `${img}<span class="ad-body">${title}${text}${disclaimer}${badge}${erid}</span>`;
  const tag = `aria-label="Информационный баннер" role="complementary"`;
  if (ad && ad.link){
    inner = `<a href="${esc(ad.link)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    return `<div class="ad-slot" ${tag}>${inner}</div>`;
  }
  return `<div class="ad-slot" ${tag}>${inner}</div>`;
}

function mountPlacement(placement){
  const ad = pickedSlot(placement);
  if (!ad) return;
  const html = slotHTML(ad);

  if (placement === 'after-popular'){
    const sec = document.querySelector('#practiceSection, #popularGrid');
    if (!sec) return;
    const host = document.querySelector('#popularGrid') ? document.querySelector('#popularGrid').closest('.dash-section') : null;
    const container = document.createElement('div');
    container.className = 'ad-placement ad-placement--popular';
    container.innerHTML = html;
    if (host && host.nextElementSibling){
      host.parentNode.insertBefore(container, host.nextElementSibling);
    } else if (host){
      host.after(container);
    }
  } else if (placement === 'after-recent'){
    const recentSec = document.querySelector('#recentGrid') ? document.querySelector('#recentGrid').closest('.dash-section') : null;
    if (!recentSec) return;
    const container = document.createElement('div');
    container.className = 'ad-placement ad-placement--recent';
    container.innerHTML = html;
    recentSec.after(container);
  } else if (placement === 'footer'){
    const container = document.createElement('div');
    container.className = 'ad-placement ad-placement--footer';
    container.innerHTML = html;
    const foot = document.getElementById('legalFooter');
    if (foot){
      foot.before(container);
    } else {
      // Нет футера в оболочке — размещаем в конце дашборда.
      const dash = document.getElementById('viewDashboard');
      if (dash) dash.appendChild(container);
    }
  }
}

function clearPlacements(){
  document.querySelectorAll('.ad-placement').forEach(n => n.remove());
}

function renderAds(){
  clearPlacements();
  ['after-popular', 'after-recent', 'footer'].forEach(mountPlacement);
}

function renderAdsOnce(){
  if (!campaign) return;
  // при каждом показе главной выбирается следующий баннер позиции (ротация)
  renderAds();
}

window.renderAdsOnce = renderAdsOnce;

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => setTimeout(renderAds, 300));
} else {
  setTimeout(renderAds, 300);
}

})();