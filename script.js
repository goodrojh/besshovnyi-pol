/* ============================================================
   Бесшовный пол — interactions
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

  if (qNext) qNext.addEventListener('click', function () {
    if (!stepValid(quiz.step)) return;
    if (quiz.step === quiz.totalSteps) {
      // "submit" — no backend; show success. TODO: connect to CRM/email/Telegram.
      showStep(quiz.totalSteps + 1);
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
