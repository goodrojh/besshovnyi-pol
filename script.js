/* ============================================================
   ГК Сфера — interactions
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Scroll progress + nav state ---------- */
  var nav = document.getElementById('nav');
  var progress = document.getElementById('progress');
  function onScroll() {
    var st = window.scrollY || document.documentElement.scrollTop;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = (h > 0 ? (st / h) * 100 : 0) + '%';
    if (nav) nav.classList.toggle('scrolled', st > 40);
    updateProcLine();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobileMenu');
  var menuClose = document.getElementById('menuClose');
  function closeMenu() { if (menu) menu.classList.remove('open'); document.body.style.overflow = ''; }
  if (burger) burger.addEventListener('click', function () { menu.classList.add('open'); document.body.style.overflow = 'hidden'; });
  if (menuClose) menuClose.addEventListener('click', closeMenu);
  if (menu) menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });

  /* ---------- Reveal on scroll ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          if (e.target.hasAttribute('data-count')) runCount(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); var c = el.querySelector('[data-count]'); if (el.hasAttribute('data-count')) setCount(el); });
  }

  /* ---------- Count-up ---------- */
  function setCount(el) { el.textContent = el.getAttribute('data-count'); }
  function runCount(el) {
    if (reduce) { setCount(el); return; }
    var target = parseInt(el.getAttribute('data-count'), 10);
    var dur = 1400, start = null;
    function tick(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('ru-RU');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  // also observe standalone [data-count] inside stats that are themselves reveal targets
  document.querySelectorAll('.stat').forEach(function (stat) {
    var c = stat.querySelector('[data-count]');
    if (!c) return;
    if ('IntersectionObserver' in window && !reduce) {
      var ob = new IntersectionObserver(function (en) {
        en.forEach(function (e) { if (e.isIntersecting) { runCount(c); ob.unobserve(e.target); } });
      }, { threshold: 0.4 });
      ob.observe(stat);
    } else { setCount(c); }
  });

  /* ---------- Process line fill ---------- */
  var proc = document.getElementById('proc');
  var procFill = document.getElementById('procFill');
  var steps = document.querySelectorAll('.step');
  function updateProcLine() {
    if (!proc || !procFill) return;
    var rect = proc.getBoundingClientRect();
    var vh = window.innerHeight;
    var total = rect.height;
    var visible = Math.min(Math.max(vh * 0.55 - rect.top, 0), total);
    procFill.style.transform = 'scaleY(' + (total > 0 ? visible / total : 0) + ')';
    steps.forEach(function (s) {
      var r = s.getBoundingClientRect();
      s.classList.toggle('in', r.top < vh * 0.7);
    });
  }

  /* ---------- FAQ ---------- */
  document.querySelectorAll('.faq__item').forEach(function (item) {
    var q = item.querySelector('.faq__q');
    var a = item.querySelector('.faq__a');
    q.addEventListener('click', function () {
      var open = item.classList.contains('open');
      document.querySelectorAll('.faq__item.open').forEach(function (other) {
        if (other !== item) { other.classList.remove('open'); other.querySelector('.faq__a').style.maxHeight = null; }
      });
      item.classList.toggle('open', !open);
      a.style.maxHeight = open ? null : a.scrollHeight + 'px';
    });
  });

  /* ============================================================
     FLOATING MESSENGERS + PROMO
     ============================================================ */
  var fab = document.getElementById('fab');
  var promo = document.getElementById('promo');
  var promoClose = document.getElementById('promoClose');
  var promoCta = document.getElementById('promoCta');
  var promoShown = false;
  var promoTaken = false;
  var PROMO_KEY = 'gks_promo_hidden_until';
  var PROMO_HIDE_DAYS = 3; // на сколько дней плашка скрывается после закрытия

  // Открытый с ?promo=1 адрес сбрасывает эту паузу и показывает плашку сразу —
  // чтобы проверить акцию, не очищая данные сайта в браузере.
  var promoForced = /[?&]promo=1(&|$)/.test(location.search);
  if (promoForced) { try { localStorage.removeItem(PROMO_KEY); } catch (e) {} }

  function promoSuppressed() {
    if (promoForced) return false;
    try {
      var until = parseInt(localStorage.getItem(PROMO_KEY) || '0', 10);
      return until > Date.now();
    } catch (e) { return false; }
  }
  function suppressPromo(days) {
    try { localStorage.setItem(PROMO_KEY, String(Date.now() + days * 864e5)); } catch (e) {}
  }
  function hidePromo() {
    if (!promo) return;
    promo.hidden = true;
    document.body.classList.remove('promo-on');
  }
  function showPromo() {
    if (!promo || promoShown || promoSuppressed()) return;
    promoShown = true;
    promo.hidden = false;
    document.body.classList.add('promo-on');
    document.body.style.setProperty('--promo-h', promo.offsetHeight + 'px');
  }

  if (promo) {
    // показываем, когда посетитель прокрутил треть страницы или провёл на сайте 15 секунд
    if (promoForced) showPromo(); else setTimeout(showPromo, 15000);
    window.addEventListener('scroll', function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0 && (window.scrollY || document.documentElement.scrollTop) / h > 0.3) showPromo();
    }, { passive: true });
    window.addEventListener('resize', function () {
      if (!promo.hidden) document.body.style.setProperty('--promo-h', promo.offsetHeight + 'px');
    }, { passive: true });
  }
  if (promoClose) promoClose.addEventListener('click', function () { suppressPromo(3); hidePromo(); });
  // Кнопка в плашке со скидкой открывает форму на месте: по длинной странице
  // человека не гоняем.
  if (promoCta) promoCta.addEventListener('click', function () {
    promoTaken = true;
    suppressPromo(PROMO_HIDE_DAYS);
    hidePromo();
    openLead('Скидка 10% на монтаж', 'Получить расчёт со скидкой 10%',
      'Скидка действует на монтаж. Оставьте телефон — инженер перезвонит, уточнит задачу и пришлёт смету уже с учётом скидки.');
  });

  function updateFab() {
    if (!fab) return;
    fab.classList.toggle('in', (window.scrollY || document.documentElement.scrollTop) > window.innerHeight * 0.55);
  }
  window.addEventListener('scroll', updateFab, { passive: true });
  window.addEventListener('resize', updateFab, { passive: true });

  /* ============================================================
     LEAD SENDING
     Заявка уходит сразу по двум каналам: на почту через FormSubmit
     и в группу Telegram. Заявка считается принятой, если сработал
     хотя бы один канал — так лид не теряется, если почта отвалилась.

     ПОЧТА. ВАЖНО: первая заявка активирует адрес — на gksphere@inbox.ru
     придёт письмо со ссылкой подтверждения, её нужно один раз открыть.

     TELEGRAM. Чтобы включить уведомления в группу:
       1. @BotFather → /newbot → получите токен;
       2. создайте группу с коллегами и добавьте туда бота;
       3. впишите токен и id группы в две строки ниже.
     Учтите: токен виден в коде сайта. Бота заводите только под заявки
     и не делайте админом группы. Если начнётся спам — отзовите токен
     в @BotFather командой /revoke, сайт продолжит слать заявки на почту.
     ============================================================ */
  // Запоминаем отправленное, чтобы показать это на странице «спасибо»
  // и дать человеку заметить опечатку в номере. Живёт только во вкладке.
  var LEAD_MEMO_KEY = 'gks_last_lead';
  function rememberLead(fields, filesCount) {
    try {
      var memo = {};
      Object.keys(fields).forEach(function (k) { memo[k] = fields[k]; });
      if (filesCount) memo['Приложено файлов'] = filesCount;
      sessionStorage.setItem(LEAD_MEMO_KEY, JSON.stringify(memo));
    } catch (e) {}
  }
  // после успешной отправки уводим на отдельную страницу — она же цель в Метрике
  /* ---------- CRM: единая точка приёма заявок ----------
     Пока адрес пуст, сайт работает по-старому: почта + Telegram из браузера.
     Как только сюда вписан адрес веб-приложения Google Apps Script,
     заявка уходит одним запросом туда, а рассылку по каналам делает сервер. */
  var CRM_URL = 'https://script.google.com/macros/s/AKfycbwQsgW5oT1HD-kF8x6SuGG2f6qxD9OWoW9TYBeBPIb8gZ0_xl7jK-HSy_DQljh5xETj/exec';
  var CRM_TOKEN = 'GKSPHERE2004';

  /* ---------- Метки рекламы ----------
     Запоминаем, с какого объявления пришёл человек: он может ходить
     по сайту и оставить заявку уже без меток в адресе. */
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var UTM_STORE = 'gks_utm';

  function captureUtm() {
    var out = {};
    try {
      var saved = JSON.parse(sessionStorage.getItem(UTM_STORE) || 'null');
      if (saved) out = saved;
    } catch (e) {}

    var params = {};
    location.search.replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
      var v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      params[k] = v;
    });

    var fresh = false;
    UTM_KEYS.forEach(function (k) { if (params[k]) { out[k] = params[k]; fresh = true; } });
    if (fresh || !out['Страница входа']) {
      out['Страница входа'] = location.href.split('#')[0];
      out['Реферер'] = document.referrer || '';
    }
    try { sessionStorage.setItem(UTM_STORE, JSON.stringify(out)); } catch (e) {}
    return out;
  }
  var UTM = captureUtm();

  // Названия полей на сайте и столбцов в таблице CRM должны совпадать
  var CRM_FIELD_MAP = {
    'Комментарий': 'Комментарий клиента',
    'Файлы от клиента': 'Файлы',
    'Раздел': 'Интересует'
  };
  var CRM_SOURCE_MAP = {
    'Быстрая форма на сайте': 'Сайт: быстрая форма',
    'Подбор системы на сайте': 'Сайт: подбор системы',
    'Галерея объектов на сайте': 'Сайт: галерея объектов'
  };

  function sendToCrm(fields, done) {
    if (!CRM_URL || !window.fetch) { done(new Error('crm off')); return; }
    var body = { token: CRM_TOKEN };
    Object.keys(fields).forEach(function (k) {
      var key = CRM_FIELD_MAP[k] || k;
      var val = fields[k];
      if (key === 'Источник') val = CRM_SOURCE_MAP[val] || val;
      if (key === 'Интересует' && body['Интересует']) return; // не затираем уже заполненное
      body[key] = val;
    });
    Object.keys(UTM).forEach(function (k) { body[k] = UTM[k]; });
    var parts = [];
    Object.keys(body).forEach(function (k) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(body[k]));
    });
    fetch(CRM_URL, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: parts.join('&')
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) throw new Error(d && d.error ? d.error : 'crm error');
      done(null);
    }).catch(function (e) { done(e); });
  }

  // от корня: со внутренних страниц относительный путь уводил бы в никуда
  var THANKS_URL = '/thanks/';
  function goThanks() { try { location.assign(THANKS_URL); } catch (e) {} }
  // от корня: со внутренних страниц относительный путь уводил бы в никуда
  var THANKS_URL = '/thanks/';
  function goThanks() { try { location.assign(THANKS_URL); } catch (e) {} }
  var LEAD_FAIL = 'Не удалось отправить заявку. Позвоните нам — <a href="tel:+79191225271">+7 919 122-52-71</a>, ' +
    'напишите в <a href="https://t.me/+79191225271" target="_blank" rel="noopener">Telegram</a> ' +
    'или на <a href="mailto:gksphere@inbox.ru">gksphere@inbox.ru</a>.';

  /* ---------- Отправка заявки ----------
     Единственный канал — CRM на стороне сервера: она записывает заявку,
     шлёт уведомление в Telegram и письмо. Раньше браузер посетителя
     обращался к Telegram и к почтовому шлюзу напрямую, и ключ доступа
     к боту лежал в открытом script.js — это убрано: ключи остаются
     только в свойствах скрипта CRM.

     CRM отвечает через 3–4 секунды, держать человека на форме всё это
     время незачем: запрос доезжает до сервера, даже если браузер уже ушёл
     на «спасибо». Поэтому ответа ждём не дольше 1,2 секунды. */
  function submitLead(fields, files, onProgress, done) {
    if (typeof onProgress === 'function') onProgress(1, 1);
    var settled = false, grace = null;
    function ok() {
      if (settled) return;
      settled = true;
      clearTimeout(grace);
      rememberLead(fields, 0);
      done(null);
    }
    sendToCrm(fields, function (err) {
      if (!err) { ok(); return; }
      if (settled) return;
      settled = true;
      clearTimeout(grace);
      done(err);
    });
    grace = setTimeout(ok, 1200);
  }


  /* ---------- Уведомление о cookie ----------
     Сайт обязан сообщить посетителю, что использует cookie и счётчик
     статистики. Плашка показывается один раз, выбор хранится в браузере
     посетителя и никуда не передаётся. */
  var COOKIE_KEY = 'gks_cookie_notice';
  function cookieNoticeSeen() {
    try { return localStorage.getItem(COOKIE_KEY) === '1'; } catch (e) { return false; }
  }
  function showCookieNotice() {
    if (cookieNoticeSeen()) return;
    var box = document.createElement('div');
    box.className = 'cookiebar';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Уведомление об использовании cookie');
    box.innerHTML = '<p>Сайт использует cookie и Яндекс.Метрику, чтобы считать посещения ' +
      'и понимать, какие страницы полезны. Эти сведения обезличены. Подробности — в ' +
      '<a href="/privacy.html">политике обработки персональных данных</a>.</p>' +
      '<button type="button" class="btn btn--primary">Понятно</button>';
    box.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem(COOKIE_KEY, '1'); } catch (e) {}
      box.remove();
      document.body.classList.remove('has-cookiebar');
    });
    document.body.appendChild(box);
    document.body.classList.add('has-cookiebar');
  }
  showCookieNotice();

  /* ---------- Телефон: поле сразу начинается с +7 ---------- */
  function attachPhoneMask(el) {
    if (!el) return;
    el.setAttribute('inputmode', 'tel');
    function digitsOf(v) {
      var d = String(v).replace(/\D/g, '');
      // первая семёрка — это наш префикс «+7», который поле рисует само
      if (d.charAt(0) === '7' || d.charAt(0) === '8') d = d.slice(1);
      // а это код страны, который человек ввёл или вставил руками
      while (d.length > 10 && (d.charAt(0) === '7' || d.charAt(0) === '8')) d = d.slice(1);
      return d.slice(0, 10);
    }
    function render(d) {
      var s = '+7';
      if (d.length) s += ' (' + d.slice(0, 3);
      if (d.length >= 3) s += ')';
      if (d.length > 3) s += ' ' + d.slice(3, 6);
      if (d.length > 6) s += '-' + d.slice(6, 8);
      if (d.length > 8) s += '-' + d.slice(8, 10);
      return s;
    }
    el.addEventListener('focus', function () {
      if (!el.value) { el.value = '+7 '; el._d = ''; }
    });
    el.addEventListener('input', function (e) {
      var d = digitsOf(el.value);
      // backspace по скобке или дефису должен стирать цифру, а не топтаться на месте
      if (e && e.inputType && e.inputType.indexOf('delete') === 0 && d === el._d) d = d.slice(0, -1);
      el._d = d;
      el.value = render(d);
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (err) {}
    });
    el.addEventListener('blur', function () {
      if (digitsOf(el.value).length === 0) { el.value = ''; el._d = ''; }
    });
  }

  /* ---------- Список выбранных файлов ---------- */
  function attachFilePicker(inputId, listId, errId) {
    var input = document.getElementById(inputId);
    var list = document.getElementById(listId);
    var err = document.getElementById(errId);
    var state = { files: [] };
    state.clear = function () { state.files = []; };
    if (!input || !list) return state;

    function size(b) {
      return b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
    }
    function say(msg) {
      if (!err) return;
      err.hidden = !msg;
      err.textContent = msg || '';
    }
    function render() {
      list.innerHTML = '';
      state.files.forEach(function (f, i) {
        var li = document.createElement('li');
        var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = f.name;
        var sz = document.createElement('span'); sz.className = 'sz'; sz.textContent = size(f.size);
        var rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'rm'; rm.setAttribute('aria-label', 'Убрать файл');
        rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        rm.addEventListener('click', function () { state.files.splice(i, 1); say(''); render(); });
        li.appendChild(nm); li.appendChild(sz); li.appendChild(rm);
        list.appendChild(li);
      });
    }
    input.addEventListener('change', function () {
      var skippedBig = 0, skippedMany = 0;
      Array.prototype.forEach.call(input.files, function (f) {
        if (state.files.length >= MAX_FILES) { skippedMany++; return; }
        if (f.size > MAX_FILE_MB * 1024 * 1024) { skippedBig++; return; }
        state.files.push(f);
      });
      input.value = '';
      var msg = '';
      if (skippedBig) msg = 'Файл больше ' + MAX_FILE_MB + ' МБ приложить не получится — пришлите его на gksphere@inbox.ru или в Telegram.';
      else if (skippedMany) msg = 'Можно приложить не больше ' + MAX_FILES + ' файлов.';
      say(msg);
      render();
    });
    state.clear = function () { state.files = []; say(''); render(); };
    return state;
  }

  var galFiles = attachFilePicker('galFiles', 'galFileList', 'galFileErr');
  var lmFiles = attachFilePicker('lmFiles', 'lmFileList', 'lmFileErr');
  attachPhoneMask(document.getElementById('galPhone'));
  attachPhoneMask(document.getElementById('lmPhone'));
  attachPhoneMask(document.getElementById('hfPhone'));

  /* ============================================================
     БЫСТРАЯ ФОРМА ЗАЯВКИ
     Открывается кнопкой в первом экране и карточками систем —
     клиенту не обязательно проходить подбор системы, чтобы оставить номер.
     ============================================================ */
  var leadEl = document.getElementById('lead');
  var leadForm = document.getElementById('leadForm');
  var leadTitle = document.getElementById('leadTitle');
  var leadDesc = document.getElementById('leadDesc');
  var lmName = document.getElementById('lmName');
  var lmPhone = document.getElementById('lmPhone');
  var lmComment = document.getElementById('lmComment');
  var lmSubmit = document.getElementById('lmSubmit');
  var lmErr = document.getElementById('lmErr');
  var lmOk = document.getElementById('lmOk');
  var leadAlt = document.getElementById('leadAlt');
  var leadCtx = '';
  var leadReturnFocus = null;

  var LEAD_DEFAULT_DESC = 'Оставьте телефон — инженер перезвонит, уточнит задачу и посчитает смету. Можно приложить фото пола, тогда разговор будет предметным.';

  function resetLeadForm() {
    if (!leadForm) return;
    leadForm.querySelectorAll('.field, .btn, .consent').forEach(function (el) { el.hidden = false; });
    if (lmOk) lmOk.hidden = true;
    if (lmErr) lmErr.hidden = true;
    if (leadAlt) leadAlt.hidden = false;
    if (lmFiles && lmFiles.clear) lmFiles.clear();
    if (lmSubmit) { lmSubmit.disabled = false; lmSubmit.textContent = 'Отправить заявку'; }
  }

  function openLead(ctx, title, desc) {
    if (!leadEl) return;
    leadCtx = ctx || 'Быстрая форма на сайте';
    leadReturnFocus = document.activeElement;
    if (leadTitle) leadTitle.textContent = title || 'Подобрать систему под ваш объект';
    if (leadDesc) leadDesc.textContent = desc || LEAD_DEFAULT_DESC;
    resetLeadForm();
    leadEl.hidden = false;
    document.body.classList.add('qform-open');
    var close = leadEl.querySelector('.qform__close');
    if (close) close.focus();
  }

  function closeLead() {
    if (!leadEl || leadEl.hidden) return;
    leadEl.hidden = true;
    document.body.classList.remove('qform-open');
    if (leadReturnFocus && leadReturnFocus.focus) leadReturnFocus.focus();
  }

  document.querySelectorAll('[data-lead]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openLead(
        btn.getAttribute('data-lead'),
        btn.getAttribute('data-lead-title') || 'Подобрать систему под ваш объект',
        btn.getAttribute('data-lead-desc') || ('Вы выбрали: ' + btn.getAttribute('data-lead') + '. ' + LEAD_DEFAULT_DESC)
      );
    });
  });
  document.querySelectorAll('[data-lead-close]').forEach(function (b) {
    b.addEventListener('click', closeLead);
  });
  // Возврат со страницы «спасибо»: открываем форму с прошлыми данными,
  // чтобы человек поправил опечатку, а не набирал всё заново.
  if (/[?&]fix=1(&|$)/.test(location.search)) {
    var memo = null;
    try { memo = JSON.parse(sessionStorage.getItem(LEAD_MEMO_KEY) || 'null'); } catch (e) {}
    if (memo) {
      openLead('Исправленная заявка',
        'Проверьте данные и отправьте заново',
        'Мы подставили то, что вы отправили в прошлый раз. Поправьте, что нужно — например номер телефона — и отправьте ещё раз.');
      if (lmName) lmName.value = memo['Имя'] || '';
      if (lmPhone) lmPhone.value = memo['Телефон'] || '';
      if (lmComment) lmComment.value = (memo['Комментарий'] && memo['Комментарий'] !== '—') ? memo['Комментарий'] : '';
    }
  }


  // Проверяем контакты по отдельности: человек должен видеть, какое поле не так
  function phoneDigits(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.charAt(0) === '7' || d.charAt(0) === '8') d = d.slice(1);
    while (d.length > 10 && (d.charAt(0) === '7' || d.charAt(0) === '8')) d = d.slice(1);
    return d;
  }
  function markField(el, bad) {
    if (!el || !el.parentNode) return;
    var f = el.parentNode;
    while (f && f.classList && !f.classList.contains('field')) f = f.parentNode;
    if (f && f.classList) f.classList.toggle('field--err', !!bad);
    if (bad) { try { el.focus(); } catch (e) {} }
  }
  // Галочка согласия заранее не проставлена: согласие на обработку
  // персональных данных должно быть активным действием посетителя.
  function checkContacts(nameEl, phoneEl, agreeEl) {
    markField(nameEl, false);
    markField(phoneEl, false);
    if (agreeEl) agreeEl.closest('.consent').classList.remove('consent--bad');
    if (!nameEl || nameEl.value.trim().length < 2) {
      markField(nameEl, true);
      return 'Напишите, как к вам обращаться.';
    }
    if (!phoneEl || phoneDigits(phoneEl.value).length < 10) {
      markField(phoneEl, true);
      return 'Введите телефон полностью — 10 цифр после +7.';
    }
    if (agreeEl && !agreeEl.checked) {
      agreeEl.closest('.consent').classList.add('consent--bad');
      return 'Отметьте согласие на обработку персональных данных — без него мы не вправе принять заявку.';
    }
    return null;
  }
  if (leadForm) {
    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = lmName.value.trim();
      var phone = lmPhone.value.trim();
      var problem = checkContacts(lmName, lmPhone, document.getElementById('lmAgree'));
      if (problem) {
        lmErr.hidden = false;
        lmErr.textContent = problem;
        return;
      }
      lmErr.hidden = true;
      lmSubmit.disabled = true;
      lmSubmit.textContent = 'Отправляем…';
      submitLead({
        'Имя': name,
        'Телефон': phone,
        'Комментарий': lmComment.value.trim() || '—',
        'Интересует': leadCtx,
        'Акция': promoTaken ? 'Скидка 10% на монтаж' : '—',
        'Источник': 'Быстрая форма на сайте'
      }, lmFiles.files, function (n, total) {
        lmSubmit.textContent = 'Отправляем файл ' + n + ' из ' + total + '…';
      }, function (err) {
        if (err) {
          lmSubmit.disabled = false;
          lmSubmit.textContent = 'Отправить заявку';
          lmErr.hidden = false;
          lmErr.innerHTML = LEAD_FAIL;
          return;
        }
        leadForm.querySelectorAll('.field, .btn, .consent').forEach(function (el) { el.hidden = true; });
        if (leadAlt) leadAlt.hidden = true;
        lmOk.hidden = false;
        goThanks();
        // имя и телефон оставляем, комментарий чистим — он был про другой запрос
        lmComment.value = '';
      });
    });
  }

  /* ============================================================
     ФОРМА НА ПЕРВОМ ЭКРАНЕ
     ============================================================ */
  var heroForm = document.getElementById('heroForm');
  if (heroForm) {
    var hfName = document.getElementById('hfName');
    var hfPhone = document.getElementById('hfPhone');
    var hfComment = document.getElementById('hfComment');
    var hfSubmit = document.getElementById('hfSubmit');
    var hfErr = document.getElementById('hfErr');
    var hfOk = document.getElementById('hfOk');

    heroForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var problem = checkContacts(hfName, hfPhone, document.getElementById('hfAgree'));
      if (problem) {
        hfErr.hidden = false;
        hfErr.textContent = problem;
        return;
      }
      hfErr.hidden = true;
      hfSubmit.disabled = true;
      hfSubmit.textContent = 'Отправляем…';

      submitLead({
        'Имя': hfName.value.trim(),
        'Телефон': hfPhone.value.trim(),
        'Комментарий': hfComment.value.trim() || '—',
        'Интересует': 'Форма на первом экране',
        'Акция': promoTaken ? 'Скидка 10% на монтаж' : '—',
        'Источник': 'Быстрая форма на сайте'
      }, null, null, function (err) {
        if (err) {
          hfSubmit.disabled = false;
          hfSubmit.textContent = 'Получить расчёт';
          hfErr.hidden = false;
          hfErr.innerHTML = LEAD_FAIL;
          return;
        }
        heroForm.hidden = true;
        hfOk.hidden = false;
        goThanks();
      });
    });
  }

  /* ============================================================
     МЕНЮ РАЗДЕЛОВ
     ============================================================ */
  var menuItems = document.querySelectorAll('.menu__item');
  if (menuItems.length) {
    [].forEach.call(menuItems, function (item) {
      var btn = item.querySelector('.menu__btn');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = item.classList.contains('menu__item--open');
        [].forEach.call(menuItems, function (x) {
          x.classList.remove('menu__item--open');
          var b = x.querySelector('.menu__btn');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
        if (!open) {
          item.classList.add('menu__item--open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
      // на компьютере открываем наведением: так привычнее
      item.addEventListener('mouseenter', function () {
        if (window.matchMedia('(min-width: 1101px)').matches) item.classList.add('menu__item--open');
      });
      item.addEventListener('mouseleave', function () {
        if (window.matchMedia('(min-width: 1101px)').matches) item.classList.remove('menu__item--open');
      });
    });
    document.addEventListener('click', function () {
      [].forEach.call(menuItems, function (x) { x.classList.remove('menu__item--open'); });
    });
  }

  /* ============================================================
     ФОРМА НА ВНУТРЕННИХ СТРАНИЦАХ
     ============================================================ */
  var pageForm = document.getElementById('pageForm');
  if (pageForm) {
    var pfName = document.getElementById('pfName');
    var pfPhone = document.getElementById('pfPhone');
    var pfComment = document.getElementById('pfComment');
    var pfSubmit = document.getElementById('pfSubmit');
    var pfErr = document.getElementById('pfErr');
    var pfOk = document.getElementById('pfOk');
    attachPhoneMask(pfPhone);

    pageForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var problem = checkContacts(pfName, pfPhone, document.getElementById('pfAgree'));
      if (problem) {
        pfErr.hidden = false;
        pfErr.textContent = problem;
        return;
      }
      pfErr.hidden = true;
      pfSubmit.disabled = true;
      pfSubmit.textContent = 'Отправляем…';

      submitLead({
        'Имя': pfName.value.trim(),
        'Телефон': pfPhone.value.trim(),
        'Комментарий': pfComment.value.trim() || '—',
        // по какой странице пришла заявка — видно в CRM без лишних вопросов
        'Интересует': document.title.split('—')[0].trim(),
        'Акция': '—',
        'Источник': 'Быстрая форма на сайте'
      }, null, null, function (err) {
        if (err) {
          pfSubmit.disabled = false;
          pfSubmit.textContent = 'Получить расчёт';
          pfErr.hidden = false;
          pfErr.innerHTML = LEAD_FAIL;
          return;
        }
        pageForm.hidden = true;
        pfOk.hidden = false;
        goThanks();
      });
    });
  }

  /* ============================================================
     GALLERY — объекты по сегментам
     ============================================================ */
  var GAL = {
    food: {
      title: 'Пищевые производства',
      desc: 'Полиуретан-цементные и эпоксидные системы под горячую мойку, кислоты и жиры. Галтели, трапы и уклоны — по ХАССП и СанПиН.',
      caps: [
        'Цех мясопереработки · полиуретан-цемент 6 мм, трапы и уклоны',
        'Молочный завод, участок розлива · галтели по СанПиН',
        'Кондитерский цех · эпоксидная система с кварцем, 4 мм',
        'Пивоварня, зона розлива · уклоны к лоткам, стойкость к мойке',
        'Тамбур холодильной камеры · система под перепад температур',
        'Рыбный цех · противоскользящее покрытие с кварцевым наполнением',
        'Камера созревания сыра · бесшовный пол с галтелями',
        'Колбасный цех · полиуретан-цемент, обрамление трапов',
        'Участок мойки овощей · уклоны и водоотводные лотки',
        'Коридор между цехами · эпоксидный пол с разметкой'
      ]
    },
    ware: {
      title: 'Склады и логистика',
      desc: 'Обеспыливание, герметизация швов и ресурс под ричтраками. Работаем захватками — отгрузки не останавливаются.',
      caps: [
        'Стеллажный склад · упрочнённое покрытие, разметка проездов',
        'Зона погрузки · покрытие под ударные нагрузки у доков',
        'Новый складской корпус · обеспыливание, герметизация швов',
        'Зона напольного хранения · разметка мест под паллеты',
        'Кросс-докинг · выделенные пешеходные дорожки',
        'Зарядная зона техники · химстойкое покрытие',
        'Вид с антресоли · сплошное покрытие без швов',
        'Узкий проход под ричтрак · покрытие повышенной прочности',
        'Склад на пусконаладке · пол сдан, инженерию доделывают смежники',
        'Склад оптовой компании · эпоксидное покрытие 2 мм'
      ]
    },
    shop: {
      title: 'Производственные цеха',
      desc: 'Маслостойкие и нескользящие покрытия с разметкой зон. Держат станочную нагрузку, проливы СОЖ и проезд техники.',
      caps: [
        'Механический участок · маслостойкое покрытие, зонирование',
        'Сварочный пост · термостойкая система, зона безопасности',
        'Сборочный конвейер · разметка пешеходных зон',
        'Деревообработка · беспылевое покрытие',
        'Магистральный проезд цеха · разметка проездов',
        'Роботизированная ячейка · разметка зон безопасности',
        'Участок окраски · химстойкое покрытие с трапом',
        'Литьё пластмасс · покрытие под термонагрузку',
        'Ремонтный участок под краном · ударопрочная система',
        'Свежее покрытие цеха · эпоксидный наливной пол 3 мм'
      ]
    },
    pharm: {
      title: 'Фарма и чистые помещения',
      desc: 'Антистатические и GMP-совместимые покрытия с закруглением примыканий и полным пакетом документов для валидации.',
      caps: [
        'Коридор чистой зоны · бесшовный пол с галтелями',
        'Участок таблетирования · покрытие под класс чистоты',
        'Лаборатория · антистатическое покрытие с заземлением',
        'Шлюз переодевания · закругление примыканий',
        'Склад препаратов · беспылевое покрытие',
        'Чистый коридор · глянцевая система под влажную уборку',
        'Асептический участок · покрытие под требования GMP',
        'Чистое помещение на монтаже · пол сдан, потолок за смежниками',
        'Лаборатория · токопроводящее покрытие, светлый тон',
        'Шлюз передачи материалов · бесшовное покрытие'
      ]
    },
    park: {
      title: 'Паркинги',
      desc: 'Эластичные полиуретановые системы: защита плиты от реагентов и протечек, гидроизоляция, разметка под ключ.',
      caps: [
        'Подземный паркинг · полиуретановое покрытие, разметка',
        'Рампа · покрытие с противоскользящими насечками',
        'Паркинг торгового центра · разметка машиномест',
        'Паркинг после мойки · уклоны и водоотводные лотки',
        'Паркинг жилого дома · эластичное покрытие',
        'Въездная зона · покрытие под интенсивный трафик',
        'Пешеходная дорожка · выделенная зона в общем покрытии',
        'Открытая кровля-паркинг · гидроизоляционная система',
        'Деформационный шов · герметизация эластичным составом',
        'Мойка в паркинге · химстойкое покрытие с трапом'
      ]
    },
    comm: {
      title: 'Коммерция от 200 м²',
      desc: 'Автосервисы, кухни, медцентры и шоурумы. Смета за 1 день, монтаж за 3–5 дней, декоративные варианты покрытий.',
      caps: [
        'Автосервис · эпоксидный пол под подъёмник',
        'Кухня ресторана · противоскользящее покрытие, трапы',
        'Медицинский центр · декоративное покрытие с галтелями',
        'Автосалон · декоративный наливной пол с полировкой',
        'Обжарочный цех кофейни · бесшовное покрытие',
        'Зал функционального тренинга · спортивное покрытие',
        'Подсобное помещение магазина · эпоксидное покрытие',
        'Пекарня · покрытие с галтелями под влажную уборку',
        'Ветклиника · гигиеничное бесшовное покрытие',
        'Лофт-офис · декоративный пол с чипсами'
      ]
    }
  };

  var galEl = document.getElementById('gal');
  var galGrid = document.getElementById('galGrid');
  var galTitle = document.getElementById('galTitle');
  var galDesc = document.getElementById('galDesc');
  var lbEl = document.getElementById('lb');
  var lbImg = document.getElementById('lbImg');
  var lbCap = document.getElementById('lbCap');
  var lbCount = document.getElementById('lbCount');
  var current = { key: null, index: 0 };
  var lastFocus = null;

  function galSrc(key, i) {
    return 'assets/gal/' + key + '-' + (i < 9 ? '0' : '') + (i + 1) + '.jpg';
  }

  function openGal(key) {
    var data = GAL[key];
    if (!data || !galEl) return;
    current.key = key;
    lastFocus = document.activeElement;
    galTitle.textContent = data.title;
    galDesc.textContent = data.desc;
    galGrid.innerHTML = '';
    data.caps.forEach(function (cap, i) {
      var fig = document.createElement('figure');
      fig.className = 'gal__item';
      fig.setAttribute('role', 'button');
      fig.setAttribute('tabindex', '0');
      var img = document.createElement('img');
      img.src = galSrc(key, i);
      img.alt = cap;
      img.loading = 'lazy';
      var cp = document.createElement('figcaption');
      cp.textContent = cap;
      fig.appendChild(img);
      fig.appendChild(cp);
      fig.addEventListener('click', function () { openLb(i); });
      fig.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(i); }
      });
      galGrid.appendChild(fig);
    });
    resetGalForm();
    galEl.hidden = false;
    document.body.classList.add('gal-open');
    galEl.querySelector('.gal__close').focus();
  }

  function closeGal() {
    if (!galEl || galEl.hidden) return;
    galEl.hidden = true;
    document.body.classList.remove('gal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openLb(i) {
    var data = GAL[current.key];
    if (!data || !lbEl) return;
    current.index = (i + data.caps.length) % data.caps.length;
    lbImg.src = galSrc(current.key, current.index);
    lbImg.alt = data.caps[current.index];
    lbCap.textContent = data.caps[current.index];
    lbCount.textContent = (current.index + 1) + ' / ' + data.caps.length;
    lbEl.hidden = false;
  }
  function closeLb() { if (lbEl) lbEl.hidden = true; }
  function stepLb(d) { openLb(current.index + d); }

  document.querySelectorAll('[data-gal]').forEach(function (btn) {
    btn.addEventListener('click', function () { openGal(btn.getAttribute('data-gal')); });
  });
  document.querySelectorAll('[data-gal-close]').forEach(function (b) {
    b.addEventListener('click', closeGal);
  });
  document.querySelectorAll('[data-lb-close]').forEach(function (b) {
    b.addEventListener('click', closeLb);
  });
  var lbPrev = document.getElementById('lbPrev');
  var lbNext = document.getElementById('lbNext');
  if (lbPrev) lbPrev.addEventListener('click', function () { stepLb(-1); });
  if (lbNext) lbNext.addEventListener('click', function () { stepLb(1); });
  if (lbEl) lbEl.addEventListener('click', function (e) { if (e.target === lbEl) closeLb(); });

  document.addEventListener('keydown', function (e) {
    if (lbEl && !lbEl.hidden) {
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowLeft') stepLb(-1);
      if (e.key === 'ArrowRight') stepLb(1);
      return;
    }
    if (galEl && !galEl.hidden && e.key === 'Escape') { closeGal(); return; }
    if (leadEl && !leadEl.hidden && e.key === 'Escape') closeLead();
  });
  if (leadEl) leadEl.addEventListener('click', function (e) {
    if (e.target === leadEl) closeLead();
  });

  /* ---------- Форма заявки в галерее ---------- */
  var galForm = document.getElementById('galForm');
  var galName = document.getElementById('galName');
  var galPhone = document.getElementById('galPhone');
  var galComment = document.getElementById('galComment');
  var galSubmit = document.getElementById('galSubmit');
  var galErr = document.getElementById('galErr');
  var galOk = document.getElementById('galOk');

  function resetGalForm() {
    if (!galForm) return;
    galForm.querySelectorAll('.field, .btn, .consent').forEach(function (el) { el.hidden = false; });
    if (galOk) galOk.hidden = true;
    if (galErr) galErr.hidden = true;
    if (galFiles && galFiles.clear) galFiles.clear();
    if (galSubmit) { galSubmit.disabled = false; galSubmit.textContent = 'Оставить заявку'; }
  }

  if (galForm) {
    galForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = galName.value.trim();
      var phone = galPhone.value.trim();
      var problem = checkContacts(galName, galPhone, document.getElementById('galAgree'));
      if (problem) {
        galErr.hidden = false;
        galErr.textContent = problem;
        return;
      }
      galErr.hidden = true;
      galSubmit.disabled = true;
      galSubmit.textContent = 'Отправляем…';
      submitLead({
        'Имя': name,
        'Телефон': phone,
        'Комментарий': galComment && galComment.value.trim() ? galComment.value.trim() : '—',
        'Раздел': GAL[current.key] ? GAL[current.key].title : '—',
        'Акция': promoTaken ? 'Скидка 10% на монтаж' : '—',
        'Источник': 'Галерея объектов на сайте'
      }, galFiles.files, function (n, total) {
        galSubmit.textContent = 'Отправляем файл ' + n + ' из ' + total + '…';
      }, function (err) {
        if (err) {
          galSubmit.disabled = false;
          galSubmit.textContent = 'Оставить заявку';
          galErr.hidden = false;
          galErr.innerHTML = LEAD_FAIL;
          return;
        }
        galForm.querySelectorAll('.field, .btn, .consent').forEach(function (el) { el.hidden = true; });
        galOk.hidden = false;
        goThanks();
      });
    });
  }

  /* ---------- Форма в разделе расчёта ---------- */
  var calcForm = document.getElementById('calcForm');
  if (calcForm) {
    var cfName = document.getElementById('cfName');
    var cfPhone = document.getElementById('cfPhone');
    var cfComment = document.getElementById('cfComment');
    var cfSubmit = document.getElementById('cfSubmit');
    var cfErr = document.getElementById('cfErr');
    var cfOk = document.getElementById('cfOk');
    attachPhoneMask(cfPhone);

    calcForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var problem = checkContacts(cfName, cfPhone, document.getElementById('cfAgree'));
      if (problem) { cfErr.hidden = false; cfErr.textContent = problem; return; }
      cfErr.hidden = true;
      cfSubmit.disabled = true;
      cfSubmit.textContent = 'Отправляем…';

      submitLead({
        'Имя': cfName.value.trim(),
        'Телефон': cfPhone.value.trim(),
        'Комментарий': cfComment.value.trim() || '—',
        'Интересует': 'Расчёт сметы',
        'Акция': promoTaken ? 'Скидка 10% на монтаж' : '—',
        'Источник': 'Подбор системы на сайте'
      }, null, null, function (err) {
        if (err) {
          cfSubmit.disabled = false;
          cfSubmit.textContent = 'Получить расчёт';
          cfErr.hidden = false;
          cfErr.innerHTML = LEAD_FAIL;
          return;
        }
        calcForm.hidden = true;
        cfOk.hidden = false;
        goThanks();
      });
    });
  }

  onScroll();
  updateFab();
})();
