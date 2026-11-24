/* =====================================================================
   CardioEXCEL Web v18 — Реестр калькуляторов и иконок
   Реестр встроен в JS, чтобы гарантировать автономную работу по file://
   (fetch для manifest.json может блокироваться при локальном запуске).
   manifest.json — независимый документ для аудита; согласованность
   проверяется скриптом build/check_manifest.py.
   © 2026 Врач-кардиолог, к.м.н. Синкевич Д.А., Иркутск
   ===================================================================== */
const CALCULATORS = [
  {id:'recept107',     title:'Рецептурный бланк 107-1/у', shortTitle:'Рецепт 107-1/у', category:'Документы', icon:'clipboard', desc:'Печатная форма № 107-1/у (A5) + база препаратов.'},
  {id:'egfr',          title:'рСКФ · Калькулятор ХБП', shortTitle:'рСКФ / ХБП', category:'Нефрология', icon:'flask', desc:'CKD-EPI 2009/2011, EKFC, CKD-EPI 2021, Cockcroft–Gault · стадии ХБП и дозы ПОАК.'},
  {id:'score2',        title:'SCORE2 · SCORE2-OP · PREVENT', shortTitle:'SCORE2 / PREVENT', category:'Риск ССЗ', icon:'target', desc:'10-летний риск ССЗ, PREVENT, подбор гиполипидемической терапии.'},
  {id:'score2dm',      title:'SCORE2-Diabetes · WATCH-DM', shortTitle:'SCORE2-DM', category:'Риск ССЗ · СД', icon:'package', desc:'Риск ССЗ при СД 2 типа + риск сердечной недостаточности (WATCH-DM).'},
  {id:'statins',       title:'Подбор оптимальной гипохолестериновой терапии', shortTitle:'Статины', category:'Липидология', icon:'pill', desc:'Индивидуальный подбор статина, эзетимиба, иPCSK9 и бемпедоевой кислоты.'},
  {id:'dlcn',          title:'Критерии DLCN — диагностика геСГХС', shortTitle:'DLCN', category:'Липидология', icon:'dna', desc:'Dutch Lipid Clinic Network Criteria для гетерозиготной семейной гиперхолестеринемии.'},
  {id:'samsci',        title:'SAMS-CI — статин-индуцированная миалгия', shortTitle:'SAMS-CI', category:'Липидология', icon:'dumbbell', desc:'Индекс вероятности статин-ассоциированных мышечных симптомов.'},
  {id:'maxhr',         title:'Зоны пульса (ЧСС) по формуле Inbar', shortTitle:'Зоны пульса', category:'Профилактика', icon:'heart', desc:'Тренировочные зоны пульса: HRmax = 205,8 − 0,685 × возраст.'},
  {id:'ibs',           title:'ПТВ ИБС — калькулятор и алгоритм КАГ', shortTitle:'ПТВ ИБС', category:'ИБС', icon:'heart', desc:'Претестовая вероятность обструктивной ИБС, RF-CL / CACS-CL и алгоритм КАГ.'},
  {id:'grace',         title:'GRACE & ЭКГ-паттерны ИМО', shortTitle:'GRACE', category:'ОКС', icon:'activity', desc:'Оценка внутригоспитальной и 6-месячной летальности при ОКС + справочник ЭКГ-паттернов.'},
  {id:'arc-hbr',       title:'Шкала ARC-HBR', shortTitle:'ARC-HBR', category:'ЧКВ · кровотечения', icon:'droplet', desc:'Оценка высокого риска кровотечений после ЧКВ (Academic Research Consortium).'},
  {id:'aspirin-doac',  title:'АСК + ПОАК при стабильной ИБС', shortTitle:'АСК + ПОАК', category:'Антитромботики', icon:'shield', desc:'Оценка риска ишемических и тромботических событий при стабильной ИБС.'},
  {id:'surgery',       title:'Операционный риск (RCRI, DASI, Gupta, AUB-HAS2, VSG, SPARK)', shortTitle:'Операционный риск', category:'Периоперационный риск', icon:'hospital', desc:'6 шкал для оценки кардиального и почечного риска при несердечных операциях.'},
  {id:'surgery-doac',  title:'Операция и ПОАК', shortTitle:'Операция + ПОАК', category:'ПОАК', icon:'clock', desc:'Сроки отмены/возобновления ПОАК и мост-терапия.'},
  {id:'hfpef',         title:'СНсФВ — H2FPEF, HFpEF-ABA', shortTitle:'СНсФВ', category:'ХСН', icon:'heart', desc:'Диагностика сердечной недостаточности с сохранённой ФВ + ХСН после ИМ.'},
  {id:'anemia',        title:'АНЕМИЯ — ХСН, дефицит железа', shortTitle:'Анемия / дефицит Fe', category:'ХСН · анемия', icon:'droplet', desc:'Диагностика ЖДА/АХЗ и расчёт дозы железа карбоксимальтозата.'},
  {id:'af',            title:'ФП — CHA₂DS₂-VA, HAS-BLED, антиаритмическая терапия', shortTitle:'ФП · ОАК', category:'Аритмии', icon:'activity', desc:'Риск инсульта и кровотечения, подбор антитромботической терапии.'},
  {id:'qt',            title:'Калькулятор корригированного интервала QT', shortTitle:'Интервал QT', category:'Аритмии', icon:'activity', desc:'6 базовых формул коррекции · пороги для мужчин и женщин · коррекция при широком QRS (ЛНПГ / ПНПГ) · метод касательной.'},
  {id:'aat',           title:'Экспресс-навигатор по антиаритмической терапии', shortTitle:'Антиаритмики (EHRA 2025)', category:'Аритмии', icon:'pill', desc:'Матрица тактики, дозы и классы ААП по EHRA 2025.'},
  {id:'va',            title:'Классификация желудочковых аритмий (РКО 2023)', shortTitle:'Желудочковые аритмии', category:'Аритмии', icon:'zap', desc:'Формирование клинического диагноза ЖА по классификации РКО 2023 г.'},
  {id:'valves',        title:'Клапанная болезнь сердца', shortTitle:'Клапанные пороки', category:'Пороки сердца', icon:'door', desc:'Шкалы тяжести пороков и классы показаний к хирургии (ESC/EACTS).'},
  {id:'carpreg',       title:'CARPREG II — риск при беременности', shortTitle:'CARPREG II', category:'Беременность', icon:'baby', desc:'Материнский риск при ССЗ и беременности + классификация mWHO 2.0.'},
  {id:'pregnancy',     title:'Лекарственные препараты при беременности', shortTitle:'Лекарства при беременности', category:'Беременность', icon:'user', desc:'Подбор терапии при беременности и лактации (ESC 2025).'},
  {id:'pe',            title:'ТЭЛА — Wells, Geneva, PESI, ESC, YEARS, IMPROVE', shortTitle:'ТЭЛА', category:'ТЭЛА', icon:'wind', desc:'6 валидированных шкал для диагностики и стратификации ТЭЛА.'},
  {id:'hcm',           title:'ГКМП — HCM-AF и HCM Risk-SCD', shortTitle:'ГКМП', category:'Кардиомиопатии', icon:'heart', desc:'Риск ФП и внезапной сердечной смерти при гипертрофической кардиомиопатии.'},
  {id:'cardiotoxic',   title:'Кардиоонкология — калькуляторы риска', shortTitle:'Кардиоонкология', category:'Кардиоонкология', icon:'ribbon', desc:'Стратификация кардиотоксичности и ВТЭО перед противоопухолевой терапией.'},
  {id:'prepcardiotoxic',  title:'Кардиотоксичность — поиск препарата', shortTitle:'Поиск препарата', category:'Кардиоонкология', icon:'search', desc:'Сердечно-сосудистые осложнения противоопухолевой лекарственной терапии солидных опухолей.'},
  {id:'nafld',         title:'НАЖБП — FIB-4, FLI, CDS, HSI', shortTitle:'НАЖБП', category:'Гепатология', icon:'flame', desc:'Неинвазивная оценка стеатоза и фиброза печени.'},
  {id:'aldosteron',    title:'Алгоритм диагностики первичного гиперальдостеронизма', shortTitle:'Первичный гиперальдостеронизм', category:'Эндокринология', icon:'stethoscope', desc:'Скрининг (альдостерон, ренин, АРС) → подтверждение диагноза → тест подавления.'},
  {id:'ie',            title:'Инфекционный эндокардит — схемы АБТ', shortTitle:'Инфекционный эндокардит', category:'Инфекции', icon:'bug', desc:'Эмпирическая и этиотропная антибактериальная терапия ИЭ.'},
  {id:'mehran2',       title:'Шкала Mehran-2 — риск КИН', shortTitle:'Mehran-2', category:'ЧКВ · почки', icon:'droplet', desc:'Риск контраст-индуцированной нефропатии после ЧКВ.'},
  {id:'bsa',           title:'ИМТ и ППТ с поправкой', shortTitle:'ИМТ и ППТ', category:'Антропометрия', icon:'user', desc:'ИМТ и ППТ с поправкой на ампутацию конечностей.'}
];

const FILE_TO_ID = {
  'aldosteron':'aldosteron', 'ARC-HBR':'arc-hbr', 'CardioToxic':'cardiotoxic',
  'dlcn':'dlcn', 'EGFR':'egfr', 'grace':'grace', 'IBS':'ibs', 'ie':'ie',
  'maxЧСС':'maxhr', 'mehran2':'mehran2', 'recept-107-1u':'recept107',
  'samc-ci':'samsci', 'SCORE2':'score2', 'SCORE2-DM':'score2dm',
  'ААТ':'aat', 'Анемия':'anemia', 'аск поак':'aspirin-doac',
  'беременность':'pregnancy', 'воз':'carpreg', 'гкмп':'hcm',
  'ЖА':'va', 'клапаны':'valves', 'нажбп':'nafld',
  'операция':'surgery', 'поак':'surgery-doac', 'статины':'statins',
  'ТЭЛА':'pe', 'ХСН':'hfpef', 'af':'af', 'qt':'qt', 'bsa':'bsa',
  'findcardiotoxic':'prepcardiotoxic'
};

const CALC_MAP = new Map(CALCULATORS.map(c => [c.id, c]));

function findCalculatorId(baseName){
  if (!baseName) return null;
  const norm = s => String(s).toLowerCase().replace(/[_\s\-]/g, '');
  if (FILE_TO_ID[baseName]) return FILE_TO_ID[baseName];
  const target = norm(baseName);
  for (const key in FILE_TO_ID){
    if (norm(key) === target) return FILE_TO_ID[key];
  }
  return null;
}

const ICONS = {
  stethoscope: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>',
  droplet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
  ribbon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4c0 6 4 10 8 14 4-4 8-8 8-14"/><path d="M12 18v4"/></svg>',
  dna: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M17 6l-2.5-2.5"/><path d="M14 8l-1-1"/><path d="M7 18l2.5 2.5"/><path d="M10 16l1 1"/><path d="M22 9c-6.667 6-13.333 0-20 6"/></svg>',
  flask: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>',
  activity: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  heart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  bug: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>',
  clipboard: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>',
  dumbbell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.828-2.829l.708-.708a2 2 0 1 1 2.829 2.829l-.708.708z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.535 3.515a2 2 0 1 1 2.829 2.829l-.708.708a2 2 0 1 1-2.829-2.829l.708-.708z"/><path d="m2.5 2.5 1.4 1.4"/><path d="m5.5 5.5 11 11"/></svg>',
  target: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  pill: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
  hospital: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/></svg>',
  clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  zap: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  door: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/></svg>',
  baby: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></svg>',
  user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  wind: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
  flame: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  package: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/></svg>'
};