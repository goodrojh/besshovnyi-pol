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

  /* ---------- Hero sound toggle ---------- */
  var video = document.getElementById('heroVideo');
  var soundBtn = document.getElementById('soundBtn');
  var soundLabel = document.getElementById('soundLabel');
  if (soundBtn && video) {
    soundBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      var on = !video.muted;
      soundBtn.classList.toggle('on', on);
      soundBtn.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
      if (soundLabel) soundLabel.textContent = on ? 'Звук вкл.' : 'Звук выкл.';
      if (on) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
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
     LEAD SENDING
     Заявки уходят на почту через FormSubmit (без бэкенда).
     ВАЖНО: первая заявка активирует адрес — на GKSphere@yandex.com
     придёт письмо со ссылкой подтверждения, её нужно один раз открыть.
     ============================================================ */
  var LEAD_URL = 'https://formsubmit.co/ajax/GKSphere@yandex.com';
  var LEAD_FAIL = 'Не удалось отправить заявку. Позвоните нам: +7 919 122-52-71 или напишите на GKSphere@yandex.com';

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
    }).then(function () { done(null); }).catch(function (e) { done(e); });
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
    if (galEl && !galEl.hidden && e.key === 'Escape') closeGal();
  });

  /* ---------- Форма заявки в галерее ---------- */
  var galForm = document.getElementById('galForm');
  var galName = document.getElementById('galName');
  var galPhone = document.getElementById('galPhone');
  var galSubmit = document.getElementById('galSubmit');
  var galErr = document.getElementById('galErr');
  var galOk = document.getElementById('galOk');

  function resetGalForm() {
    if (!galForm) return;
    galForm.querySelectorAll('.field, .btn, .consent').forEach(function (el) { el.hidden = false; });
    if (galOk) galOk.hidden = true;
    if (galErr) galErr.hidden = true;
    if (galSubmit) { galSubmit.disabled = false; galSubmit.textContent = 'Оставить заявку'; }
  }

  if (galForm) {
    galForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = galName.value.trim();
      var phone = galPhone.value.trim();
      if (name.length < 2 || phone.replace(/\D/g, '').length < 10) {
        galErr.hidden = false;
        galErr.textContent = 'Укажите имя и телефон — инженер перезвонит по нему.';
        return;
      }
      galErr.hidden = true;
      galSubmit.disabled = true;
      galSubmit.textContent = 'Отправляем…';
      sendLead({
        'Имя': name,
        'Телефон': phone,
        'Раздел': GAL[current.key] ? GAL[current.key].title : '—',
        'Источник': 'Галерея объектов на сайте'
      }, function (err) {
        if (err) {
          galSubmit.disabled = false;
          galSubmit.textContent = 'Оставить заявку';
          galErr.hidden = false;
          galErr.textContent = LEAD_FAIL;
          return;
        }
        galForm.querySelectorAll('.field, .btn, .consent').forEach(function (el) { el.hidden = true; });
        galOk.hidden = false;
      });
    });
  }

  /* ============================================================
     QUIZ / CALCULATOR
     ============================================================ */
  var quiz = {
    type: null, typePrice: 0, typeLabel: '',
    area: 1000,
    loadMult: 0, loadLabel: '',
    baseAdd: 0, baseLabel: '',
    step: 1, totalSteps: 5
  };

  var qBar = document.getElementById('quizBar');
  var qCount = document.getElementById('quizCount');
  var qNext = document.getElementById('quizNext');
  var qBack = document.getElementById('quizBack');
  var qSteps = document.querySelectorAll('.qstep');
  var estVal = document.getElementById('estVal');
  var estHint = document.getElementById('estHint');
  var areaRange = document.getElementById('areaRange');
  var areaVal = document.getElementById('areaVal');

  function fmt(n) { return Math.round(n).toLocaleString('ru-RU'); }

  function calc() {
    if (!quiz.type || !quiz.loadMult) {
      if (estVal) estVal.innerHTML = '<small>укажите параметры объекта</small>';
      if (estHint) estHint.textContent = 'Выберите параметры объекта, чтобы увидеть расчёт.';
      return;
    }
    var perM2 = quiz.typePrice * quiz.loadMult + quiz.baseAdd;
    var total = perM2 * quiz.area;
    var low = total * 0.88, high = total * 1.12;
    if (estVal) estVal.innerHTML = 'от ' + fmt(low) + ' до ' + fmt(high) + ' <small>₽</small>';
    if (estHint) estHint.textContent = 'Примерно ' + fmt(perM2) + ' ₽/м² · ' + fmt(quiz.area) + ' м². Точную смету пришлём после выезда.';
  }

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
    if (n === 3) return !!quiz.loadMult;
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
        if (g === 'type') { quiz.type = opt.getAttribute('data-val'); quiz.typePrice = parseFloat(opt.getAttribute('data-price')); quiz.typeLabel = opt.getAttribute('data-val'); }
        if (g === 'load') { quiz.loadMult = parseFloat(opt.getAttribute('data-mult')); quiz.loadLabel = opt.getAttribute('data-val'); }
        if (g === 'base') { quiz.baseAdd = parseFloat(opt.getAttribute('data-add')); quiz.baseLabel = opt.getAttribute('data-val'); }
        calc();
        if (qNext) qNext.disabled = !stepValid(quiz.step);
      });
    });
  });

  // area range
  if (areaRange) {
    areaRange.addEventListener('input', function () {
      quiz.area = parseInt(areaRange.value, 10);
      if (areaVal) areaVal.textContent = quiz.area.toLocaleString('ru-RU');
      calc();
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
      var perM2 = quiz.typePrice * quiz.loadMult + quiz.baseAdd;
      if (qErr) qErr.hidden = true;
      qNext.disabled = true;
      qNext.textContent = 'Отправляем…';
      sendLead({
        'Имя': document.getElementById('qName').value.trim(),
        'Телефон': document.getElementById('qPhone').value.trim(),
        'Тип объекта': quiz.typeLabel,
        'Площадь, м²': quiz.area,
        'Нагрузка': quiz.loadLabel,
        'Основание': quiz.baseLabel,
        'Ориентир, ₽/м²': Math.round(perM2),
        'Ориентир по объекту, ₽': Math.round(perM2 * quiz.area),
        'Источник': 'Калькулятор на сайте'
      }, function (err) {
        qNext.disabled = false;
        qNext.textContent = 'Получить смету';
        if (err) {
          if (qErr) { qErr.hidden = false; qErr.textContent = LEAD_FAIL; }
          return;
        }
        showStep(quiz.totalSteps + 1);
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
})();
