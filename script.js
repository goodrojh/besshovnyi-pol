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
  if (promoCta) promoCta.addEventListener('click', function () {
    promoTaken = true;
    suppressPromo(PROMO_HIDE_DAYS);
    hidePromo();
    var q = document.getElementById('quiz');
    if (q) q.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
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
  var THANKS_URL = 'thanks/';
  function goThanks() { try { location.assign(THANKS_URL); } catch (e) {} }
  var LEAD_URL = 'https://formsubmit.co/ajax/gksphere@inbox.ru';
  var TG_TOKEN = '8603826856:AAGFikvpRmOfoeWyIbzfqwtfoyjJIyJSQlE'; // бот @GKSphere_leads_bot
  var TG_CHAT_ID = '-1004309963490';  // группа «ГК Сфера»
  var TG_THREAD_ID = 2;               // тема «Заявки с сайта» (у группы включены темы)
  var LEAD_FAIL = 'Не удалось отправить заявку. Позвоните нам — <a href="tel:+79191225271">+7 919 122-52-71</a>, ' +
    'напишите в <a href="https://t.me/+79191225271" target="_blank" rel="noopener">Telegram</a> ' +
    'или на <a href="mailto:gksphere@inbox.ru">gksphere@inbox.ru</a>.';

  function sendLead(fields, done) {
    if (!window.fetch) { done(new Error('fetch unsupported')); return; }
    var body = { _subject: 'Заявка с сайта ГК Сфера', _template: 'table', _captcha: 'false' };
    Object.keys(fields).forEach(function (k) { body[k] = fields[k]; });
    fetch(LEAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      // FormSubmit отвечает 200 даже когда письмо НЕ отправлено
      // (например, форма ещё не активирована), поэтому проверяем поле success
      if (!data || String(data.success) !== 'true') {
        throw new Error(data && data.message ? data.message : 'lead not delivered');
      }
      done(null);
    }).catch(function (e) { done(e); });
  }

  function tgEscape(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function sendTelegram(fields, done) {
    if (!TG_TOKEN || !TG_CHAT_ID) { done(new Error('telegram not configured')); return; }
    if (!window.fetch) { done(new Error('fetch unsupported')); return; }
    var lines = ['<b>Новая заявка с сайта ГК Сфера</b>', ''];
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      if (v === '' || v === '—' || v === null || typeof v === 'undefined') return;
      lines.push('<b>' + tgEscape(k) + ':</b> ' + tgEscape(v));
    });
    var payload = {
      chat_id: TG_CHAT_ID,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (TG_THREAD_ID) payload.message_thread_id = TG_THREAD_ID;
    fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) throw new Error(d && d.description ? d.description : 'telegram failed');
      done(null);
    }).catch(function (e) { done(e); });
  }

  /* ---------- Вложения: грузим в Telegram, в письмо кладём ссылки ---------- */
  var MAX_FILES = 5;
  var MAX_FILE_MB = 45;

  function tgUpload(file, caption, done) {
    // фото до 9 МБ шлём как photo (показывается в чате), остальное — как файл без сжатия
    var asPhoto = /^image\//.test(file.type) && file.size <= 9 * 1024 * 1024;
    var fd = new FormData();
    fd.append('chat_id', TG_CHAT_ID);
    if (TG_THREAD_ID) fd.append('message_thread_id', String(TG_THREAD_ID));
    if (caption) fd.append('caption', caption);
    fd.append(asPhoto ? 'photo' : 'document', file, file.name);
    fetch('https://api.telegram.org/bot' + TG_TOKEN + '/' + (asPhoto ? 'sendPhoto' : 'sendDocument'), {
      method: 'POST', body: fd
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) throw new Error(d && d.description ? d.description : 'upload failed');
      var res = d.result || {};
      var fileId = res.document ? res.document.file_id
        : (res.photo && res.photo.length ? res.photo[res.photo.length - 1].file_id
          : (res.video ? res.video.file_id : null));
      if (!fileId) { done(null, null); return null; }
      return fetch('https://api.telegram.org/bot' + TG_TOKEN + '/getFile?file_id=' + encodeURIComponent(fileId))
        .then(function (r) { return r.json(); })
        .then(function (f) {
          var path = f && f.ok && f.result ? f.result.file_path : null;
          done(null, path ? 'https://api.telegram.org/file/bot' + TG_TOKEN + '/' + path : null);
        });
    }).catch(function (e) { done(e, null); });
  }

  function tgUploadAll(files, caption, onProgress, done) {
    if (!files.length || !TG_TOKEN || !TG_CHAT_ID) { done([]); return; }
    var links = [], i = 0;
    (function next() {
      if (i >= files.length) { done(links); return; }
      if (onProgress) onProgress(i + 1, files.length);
      tgUpload(files[i], caption, function (err, link) {
        if (link) links.push(link);
        i++; next();
      });
    })();
  }

  // Шлём заявку во все каналы разом; принято — если сработал хотя бы один
  // Telegram шлём первым и с одним повтором: запрос идёт из браузера
  // посетителя, и на части сетей api.telegram.org недоступен. Итог
  // доставки подставляем в письмо, чтобы было видно недошедшие заявки.
  function sendTelegramRetry(fields, done) {
    sendTelegram(fields, function (err) {
      if (!err) { done(null); return; }
      setTimeout(function () { sendTelegram(fields, done); }, 1200);
    });
  }

  function submitLead(fields, files, onProgress, done) {
    files = files || [];
    var caption = 'Заявка с сайта: ' + (fields['Имя'] || '') + ', ' + (fields['Телефон'] || '');
    tgUploadAll(files, caption, onProgress, function (links) {
      var mail = {}, tg = {};
      Object.keys(fields).forEach(function (k) { mail[k] = fields[k]; tg[k] = fields[k]; });
      if (files.length) {
        mail['Файлы от клиента'] = links.length ? links.join('\n')
          : (TG_TOKEN && TG_CHAT_ID ? files.length + ' шт. — смотрите в группе Telegram'
            : files.length + ' шт. — передать не удалось, запросите у клиента');
        tg['Файлы от клиента'] = files.length + ' шт. — прикреплены сообщениями выше';
      }
      sendTelegramRetry(tg, function (tgErr) {
        if (TG_TOKEN && TG_CHAT_ID) {
          mail['Дублировано в Telegram'] = tgErr ? 'НЕТ — не дошло с устройства клиента' : 'да';
        }
        sendLead(mail, function (mailErr) {
          if (!tgErr || !mailErr) { rememberLead(fields, files.length); done(null); return; }
          done(mailErr || tgErr);
        });
      });
    });
  }

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

  var qFiles = attachFilePicker('qFiles', 'qFileList', 'qFileErr');
  var galFiles = attachFilePicker('galFiles', 'galFileList', 'galFileErr');
  var lmFiles = attachFilePicker('lmFiles', 'lmFileList', 'lmFileErr');
  attachPhoneMask(document.getElementById('qPhone'));
  attachPhoneMask(document.getElementById('galPhone'));
  attachPhoneMask(document.getElementById('lmPhone'));

  /* ============================================================
     БЫСТРАЯ ФОРМА ЗАЯВКИ
     Открывается кнопкой в первом экране и карточками систем —
     клиенту не обязательно проходить подбор системы, чтобы оставить номер.
     ============================================================ */
  var leadEl = document.getElementById('lead');
  var leadForm = document.getElementById('leadForm');
  var leadTitle = document.getElementById('leadTitle');
  var leadDesc = document.getElementById('leadDesc');
  var leadEyebrow = document.getElementById('leadEyebrow');
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

  function openLead(ctx, title, desc, eyebrow) {
    if (!leadEl) return;
    leadCtx = ctx || 'Быстрая форма на сайте';
    leadReturnFocus = document.activeElement;
    if (leadEyebrow) leadEyebrow.textContent = eyebrow || 'Заявка';
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
        btn.getAttribute('data-lead-desc') || ('Вы выбрали: ' + btn.getAttribute('data-lead') + '. ' + LEAD_DEFAULT_DESC),
        btn.getAttribute('data-lead-eyebrow') || 'Заявка'
      );
    });
  });
  document.querySelectorAll('[data-lead-close]').forEach(function (b) {
    b.addEventListener('click', closeLead);
  });
  var leadToQuiz = document.getElementById('leadToQuiz');
  if (leadToQuiz) leadToQuiz.addEventListener('click', function () {
    closeLead();
    var q = document.getElementById('quiz');
    if (q) q.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  });
  // Возврат со страницы «спасибо»: открываем форму с прошлыми данными,
  // чтобы человек поправил опечатку, а не набирал всё заново.
  if (/[?&]fix=1(&|$)/.test(location.search)) {
    var memo = null;
    try { memo = JSON.parse(sessionStorage.getItem(LEAD_MEMO_KEY) || 'null'); } catch (e) {}
    if (memo) {
      openLead('Исправленная заявка',
        'Проверьте данные и отправьте заново',
        'Мы подставили то, что вы отправили в прошлый раз. Поправьте, что нужно — например номер телефона — и отправьте ещё раз.',
        'Исправление');
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
  function checkContacts(nameEl, phoneEl) {
    markField(nameEl, false);
    markField(phoneEl, false);
    if (!nameEl || nameEl.value.trim().length < 2) {
      markField(nameEl, true);
      return 'Напишите, как к вам обращаться.';
    }
    if (!phoneEl || phoneDigits(phoneEl.value).length < 10) {
      markField(phoneEl, true);
      return 'Введите телефон полностью — 10 цифр после +7.';
    }
    return null;
  }
  if (leadForm) {
    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = lmName.value.trim();
      var phone = lmPhone.value.trim();
      var problem = checkContacts(lmName, lmPhone);
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
      title: 'Коммерция от 100 м²',
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
      var problem = checkContacts(galName, galPhone);
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

  /* ============================================================
     QUIZ / CALCULATOR
     ============================================================ */
  // Цену клиенту не показываем — квиз только собирает вводные по объекту
  // и отдаёт их менеджеру вместе с заявкой.
  var quiz = {
    type: null, typeLabel: '',
    area: 1000,
    loadSel: false, loadLabel: '',
    baseLabel: '',
    step: 1, totalSteps: 5
  };

  var qBar = document.getElementById('quizBar');
  var qCount = document.getElementById('quizCount');
  var qNext = document.getElementById('quizNext');
  var qBack = document.getElementById('quizBack');
  var qSteps = document.querySelectorAll('.qstep');
  var areaRange = document.getElementById('areaRange');
  var areaVal = document.getElementById('areaVal');

  function showStep(n) {
    quiz.step = n;
    qSteps.forEach(function (s) { s.classList.toggle('active', parseInt(s.getAttribute('data-step'), 10) === n); });
    if (qBar) qBar.style.width = Math.min((n / quiz.totalSteps) * 100, 100) + '%';
    if (qCount) qCount.textContent = n <= quiz.totalSteps ? ('Шаг ' + n + ' из ' + quiz.totalSteps) : 'Готово';
    if (qBack) qBack.style.visibility = (n > 1 && n <= quiz.totalSteps) ? 'visible' : 'hidden';
    if (qNext) {
      if (n > quiz.totalSteps) { qNext.style.display = 'none'; qBack.style.display = 'none'; }
      else {
        qNext.style.display = '';
        qNext.textContent = (n === quiz.totalSteps) ? 'Получить смету' : 'Далее';
        qNext.disabled = !stepValid(n);
      }
    }
  }

  function stepValid(n) {
    if (n === 1) return !!quiz.type;
    if (n === 2) return true;
    if (n === 3) return quiz.loadSel;
    if (n === 4) return quiz.baseLabel !== '';
    if (n === 5) {
      var name = document.getElementById('qName').value.trim();
      var phone = document.getElementById('qPhone').value.replace(/\D/g, '');
      return name.length >= 2 && phone.length >= 10;
    }
    return true;
  }

  // option groups
  document.querySelectorAll('.opts').forEach(function (group) {
    group.querySelectorAll('.opt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        group.querySelectorAll('.opt').forEach(function (o) { o.classList.remove('sel'); });
        opt.classList.add('sel');
        var g = group.getAttribute('data-group');
        if (g === 'type') { quiz.type = opt.getAttribute('data-val'); quiz.typeLabel = opt.getAttribute('data-val'); }
        if (g === 'load') { quiz.loadSel = true; quiz.loadLabel = opt.getAttribute('data-val'); }
        if (g === 'base') { quiz.baseLabel = opt.getAttribute('data-val'); }
        if (qNext) qNext.disabled = !stepValid(quiz.step);
      });
    });
  });

  // area range
  if (areaRange) {
    areaRange.addEventListener('input', function () {
      quiz.area = parseInt(areaRange.value, 10);
      if (areaVal) areaVal.textContent = quiz.area.toLocaleString('ru-RU');
    });
  }

  // contact validation live
  ['qName', 'qPhone'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { if (qNext) qNext.disabled = !stepValid(quiz.step); });
  });

  var qErr = document.getElementById('qErr');

  if (qNext) qNext.addEventListener('click', function () {
    if (!stepValid(quiz.step)) return;
    if (quiz.step === quiz.totalSteps) {
      if (qErr) qErr.hidden = true;
      qNext.disabled = true;
      qNext.textContent = 'Отправляем…';
      var qComment = document.getElementById('qComment');
      submitLead({
        'Имя': document.getElementById('qName').value.trim(),
        'Телефон': document.getElementById('qPhone').value.trim(),
        'Комментарий': qComment && qComment.value.trim() ? qComment.value.trim() : '—',
        'Тип объекта': quiz.typeLabel,
        'Площадь, м²': quiz.area,
        'Нагрузка': quiz.loadLabel,
        'Основание': quiz.baseLabel,
        'Акция': promoTaken ? 'Скидка 10% на монтаж' : '—',
        'Источник': 'Подбор системы на сайте'
      }, qFiles.files, function (n, total) {
        qNext.textContent = 'Отправляем файл ' + n + ' из ' + total + '…';
      }, function (err) {
        qNext.disabled = false;
        qNext.textContent = 'Получить смету';
        if (err) {
          if (qErr) { qErr.hidden = false; qErr.innerHTML = LEAD_FAIL; }
          return;
        }
        showStep(quiz.totalSteps + 1);
        goThanks();
      });
      return;
    }
    showStep(quiz.step + 1);
  });
  if (qBack) qBack.addEventListener('click', function () { if (quiz.step > 1) showStep(quiz.step - 1); });

  // init
  if (areaVal) areaVal.textContent = quiz.area.toLocaleString('ru-RU');
  showStep(1);
  onScroll();
  updateFab();
})();
