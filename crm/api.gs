/**
 * ГК Сфера — CRM. Файл: Интерфейс
 * Часть общего кода: все файлы проекта видят функции друг друга.
 */

/* ============================================================
   ВЕБ-ИНТЕРФЕЙС
   ============================================================ */

/** Вставка одного html-файла проекта в другой: <?!= include('CRM_css'); ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function doGet(e) {
  var key = (e && e.parameter && e.parameter.k) ? String(e.parameter.k) : '';
  var role = roleFor_({ __k: key });

  if (!role) {
    return HtmlService.createHtmlOutput(
      '<div style="font:16px/1.5 Arial;padding:40px;text-align:center;color:#0f1820">' +
      '<h2>Нет доступа</h2>' +
      '<p>Откройте CRM по личной ссылке, которую вам выдали.<br>' +
      'Она заканчивается на <b>?k=</b> и набор букв — без этой части вход не работает.</p>' +
      '<p style="color:#74828e;font-size:14px">Если ссылки нет — попросите её у владельца: ' +
      'меню «ГК Сфера» → «Доступ: ссылки для сотрудников».</p></div>');
  }

  var t = HtmlService.createTemplateFromFile('CRM');
  t.role = role;
  t.key = key;
  return t.evaluate()
    .setTitle('CRM — ГК Сфера')
    // Apps Script принимает только эти метатеги, остальные ломают страницу
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes');
}

/* ============================================================
   ДОСТУП
   Google отдаёт почту вошедшего только владельцу скрипта: у веб-приложения,
   которое работает «от моего имени», для чужих личных аккаунтов почта пустая.
   Поэтому у каждого сотрудника своя ссылка с личным ключом, а почта — как
   запасной способ узнать своих.
   ============================================================ */

var ROLES = ['владелец', 'менеджер', 'аналитик'];

function makeAccessSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_ACCESS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_ACCESS);
    sh.getRange(1, 1, 1, 4).setValues([['Имя', 'Роль', 'Ключ', 'Личная ссылка']])
      .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 130);
    sh.setColumnWidth(3, 220); sh.setColumnWidth(4, 460);
    sh.getRange(2, 1, 3, 2).setValues([
      ['Владелец', 'владелец'], ['Менеджер', 'менеджер'], ['Аналитик', 'аналитик']
    ]);
  }
  sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ROLES, true).build());

  var base = PropertiesService.getScriptProperties().getProperty('CRM_URL') || '';
  if (!base) { try { base = ScriptApp.getService().getUrl(); } catch (e) {} }

  var last = sh.getLastRow();
  if (last > 1) {
    var rows = sh.getRange(2, 1, last - 1, 4).getValues();
    rows.forEach(function (r, i) {
      if (!String(r[0]).trim()) return;                 // пустая строка — пропускаем
      if (!String(r[2]).trim()) r[2] = newKey_();       // ключа нет — выдаём
      r[3] = base ? (base + '?k=' + r[2]) : 'впишите CRM_URL в свойства скрипта';
    });
    sh.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return sh;
}

function newKey_() {
  var abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  var out = '';
  for (var i = 0; i < 18; i++) out += abc.charAt(Math.floor(Math.random() * abc.length));
  return out;
}

/** Роль по личному ключу из ссылки. */
function roleByKey_(key) {
  key = String(key || '').trim();
  if (!key) return '';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ACCESS);
  if (!sh || sh.getLastRow() < 2) return '';

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][2]).trim() === key) {
      var role = String(rows[i][1]).trim().toLowerCase();
      return ROLES.indexOf(role) === -1 ? 'менеджер' : role;
    }
  }
  return '';
}

/** Роль по почте — работает для владельца и для аккаунтов того же домена. */
function roleByEmail_() {
  var me = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!me) return '';

  var p = PropertiesService.getScriptProperties();
  var set = (p.getProperty('OWNER_EMAIL') || '').toLowerCase().trim();
  var owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (set ? me === set : (owner && me === owner)) return 'владелец';

  var cfg = CONFIG_();
  if (!cfg.allowed.length || cfg.allowed.indexOf(me) !== -1) return 'менеджер';
  return '';
}

/**
 * Кто к нам пришёл. Ключ приходит вместе с запросом от интерфейса:
 * страница знает его из адреса, а google.script.run адрес не передаёт.
 */
var CURRENT_WHO = '';   // кто выполняет текущий запрос: почта или роль по ключу

function roleFor_(payload) {
  var byEmail = roleByEmail_();
  var role = byEmail;
  if (byEmail !== 'владелец') {
    role = roleByKey_(payload && payload.__k) || byEmail;
  }
  CURRENT_WHO = (Session.getActiveUser().getEmail() || '') ||
                (role ? nameByKey_(payload && payload.__k) || role : '');
  return role;
}

/** Имя сотрудника из листа «Доступ» — им подписываются заметки. */
function nameByKey_(key) {
  key = String(key || '').trim();
  if (!key) return '';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ACCESS);
  if (!sh || sh.getLastRow() < 2) return '';
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][2]).trim() === key) return String(rows[i][0]).trim();
  }
  return '';
}

function guard_(payload) {
  if (!roleFor_(payload)) throw new Error('Нет доступа');
}

function writeGuard_(payload) {
  var role = roleFor_(payload);
  if (role !== 'владелец' && role !== 'менеджер') {
    throw new Error('У этой роли только просмотр');
  }
}

function ownerGuard_(payload) {
  if (roleFor_(payload) !== 'владелец') {
    throw new Error('Это может делать только владелец CRM');
  }
}

function isOwner_(payload) { return roleFor_(payload) === 'владелец'; }

function rowToObj_(r) {
  var o = {};
  HEADERS.forEach(function (h, i) { o[h] = r[i]; });
  return o;
}

function fmtDates_(o) {
  // отдельно кладём дату создания в виде для поля ввода: 2026-08-22T10:30
  if (o['Создана'] instanceof Date) {
    o.createdInput = Utilities.formatDate(o['Создана'], 'Europe/Moscow', "yyyy-MM-dd'T'HH:mm");
  }
  ['Создана', 'Обновлена', 'Следующий контакт', 'Первый контакт', 'Договор от']
    .forEach(function (k) {
      o[k] = (o[k] instanceof Date)
        ? Utilities.formatDate(o[k], 'Europe/Moscow',
            k === 'Следующий контакт' ? 'yyyy-MM-dd' : 'dd.MM.yyyy HH:mm')
        : '';
    });
  return o;
}

/** Список заявок для интерфейса. */
function apiList(filter) {
  filter = filter || {};
  guard_(filter);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var base = { statuses: STATUSES, sources: SOURCES, reasons: REASONS,
               groups: SOURCE_GROUPS, platforms: platformNames_(),
               me: Session.getActiveUser().getEmail() || '',
               role: roleFor_(filter), owner: isOwner_(filter) };
  if (!sh || sh.getLastRow() < 2) { base.leads = []; return base; }

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  var q = String(filter.q || '').toLowerCase().trim();
  var today = new Date(); today.setHours(23, 59, 59, 999);

  var dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

  var leads = values.map(function (r, i) {
    var o = rowToObj_(r);
    o.__row = i + 2;
    var when = o['Следующий контакт'];
    var open = ['Договор', 'Отказ'].indexOf(o['Статус']) === -1;
    o.overdue = (when instanceof Date) && when <= today && open;
    o.istoday = (when instanceof Date) && when >= dayStart && when <= today && open;
    return o;
  }).filter(function (o) {
    // фильтры, общие для всех вкладок — по ним же считаются счётчики
    if (filter.source && o['Источник'] !== filter.source) return false;
    if (q) {
      var hay = [o['Имя'], o['Телефон'], o['Комментарий клиента'], o['ID'], o['Заметки']]
        .join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  // счётчики для вкладок: сколько заявок в каждом статусе
  var counts = { '': leads.length, 'overdue': 0, 'today': 0 };
  STATUSES.forEach(function (s) { counts[s] = 0; });
  leads.forEach(function (o) {
    if (counts[o['Статус']] !== undefined) counts[o['Статус']]++;
    if (o.overdue) counts.overdue++;
    if (o.istoday) counts.today++;
  });

  leads = leads.filter(function (o) {
    if (filter.onlyToday) return o.istoday;
    if (filter.onlyOverdue) return o.overdue;
    if (filter.status) return o['Статус'] === filter.status;
    return true;
  }).map(fmtDates_);

  leads.reverse();
  base.leads = leads;
  base.counts = counts;
  return base;
}

/**
 * План на сегодня: кому обещали позвонить сегодня и кого уже просрочили.
 * Заявки в статусах «Договор» и «Отказ» не показываем — они закрыты.
 */
function apiToday(ctx) {
  guard_(ctx);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var res = { today: [], overdue: [], noPlan: 0 };
  if (!sh || sh.getLastRow() < 2) return res;

  var start = new Date(); start.setHours(0, 0, 0, 0);
  var end = new Date();   end.setHours(23, 59, 59, 999);

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  values.forEach(function (r, i) {
    var o = rowToObj_(r);
    if (['Договор', 'Отказ'].indexOf(String(o['Статус'])) !== -1) return;

    var when = o['Следующий контакт'];
    o.__row = i + 2;

    if (!(when instanceof Date)) {
      // без даты и без ответа — тоже задача, про неё легко забыть
      if (!(o['Первый контакт'] instanceof Date)) res.noPlan++;
      return;
    }
    var one = fmtDates_(o);
    if (when < start) res.overdue.push(one);
    else if (when <= end) res.today.push(one);
  });

  function byDate(a, b) {
    return String(a['Следующий контакт']).localeCompare(String(b['Следующий контакт']));
  }
  res.today.sort(byDate);
  res.overdue.sort(byDate);
  return res;
}

/** Сохранение карточки: статус, сумма, дата следующего контакта, ответственный. */
function apiSave(patch) {
  writeGuard_(patch);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var row = Number(patch.__row);
  if (!row || row < 2) throw new Error('Заявка не найдена');

  var changes = [];
  markFirstTouch_(sh, row);

  // тип объекта и площадь меняет только владелец: от них зависит аналитика
  ['Тип объекта', 'Площадь, м²'].forEach(function (h) {
    if (patch[h] === undefined) return;
    ownerGuard_(patch);
    var c = col_(h);
    var was = sh.getRange(row, c).getValue();
    if (String(was) === String(patch[h])) return;
    sh.getRange(row, c).setValue(patch[h]);
    changes.push(h + ': ' + (was || '—') + ' → ' + (patch[h] || '—'));
  });

  ['Статус', 'Источник', 'Сумма, ₽', 'Ответственный', 'Причина отказа', 'Целевая',
   'Адрес объекта'].forEach(function (h) {
    if (patch[h] === undefined) return;
    var c = col_(h);
    var was = sh.getRange(row, c).getValue();
    if (String(was) !== String(patch[h])) {
      sh.getRange(row, c).setValue(patch[h]);
      changes.push(h + ': ' + (was || '—') + ' → ' + (patch[h] || '—'));
    }
  });

  // дату заявки правит только владелец: вручную занесённые заявки
  // иначе встают одним днём и перекашивают статистику
  if (patch['Создана'] !== undefined && String(patch['Создана'])) {
    ownerGuard_(patch);
    var when = parseInput_(patch['Создана']);
    if (when) {
      var cc = col_('Создана');
      var wasDate = sh.getRange(row, cc).getValue();
      sh.getRange(row, cc).setValue(when);
      changes.push('дата заявки: ' + fmtWhen_(wasDate) + ' → ' + fmtWhen_(when));
    }
  }

  if (patch['Следующий контакт'] !== undefined) {
    var c2 = col_('Следующий контакт');
    var v = patch['Следующий контакт'] ? new Date(patch['Следующий контакт'] + 'T00:00:00') : '';
    sh.getRange(row, c2).setValue(v);
    changes.push('следующий контакт: ' + (patch['Следующий контакт'] || 'снята дата'));
  }

  if (patch['Статус'] !== undefined) markStage_(sh, row, patch['Статус']);

  sh.getRange(row, col_('Обновлена')).setValue(new Date());
  if (changes.length) logAction_(sh.getRange(row, 1).getValue(), changes.join('; '));
  return apiGetOne(row);
}

/** Первое действие менеджера по заявке — от него считаем скорость реакции. */
function markFirstTouch_(sh, row) {
  var c = col_('Первый контакт');
  if (!sh.getRange(row, c).getValue()) sh.getRange(row, c).setValue(new Date());
}

/** Самый дальний этап, до которого дошла заявка, и дата договора. */
function markStage_(sh, row, status) {
  var idx = FUNNEL.indexOf(String(status));
  if (idx > 0) {
    var c = col_('Дошёл до');
    var was = FUNNEL.indexOf(String(sh.getRange(row, c).getValue()));
    if (idx > was) sh.getRange(row, c).setValue(FUNNEL[idx]);
  }
  if (status === 'Договор') {
    var d = col_('Договор от');
    if (!sh.getRange(row, d).getValue()) sh.getRange(row, d).setValue(new Date());
  }
}

/** «2026-08-22T10:30» из поля ввода — в дату. */
function parseInput_(v) {
  var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
                  Number(m[4]), Number(m[5]), 0);
}

function fmtWhen_(d) {
  return (d instanceof Date)
    ? Utilities.formatDate(d, 'Europe/Moscow', 'dd.MM.yyyy HH:mm')
    : '—';
}

/**
 * Удаление заявки. Только владелец и только с подтверждением ID —
 * чтобы случайный сдвиг строк не увёл нож не туда.
 */
function apiDelete(row, id, ctx) {
  ownerGuard_(ctx);

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  row = Number(row);
  if (!row || row < 2 || row > sh.getLastRow()) throw new Error('Заявка не найдена');

  var real = String(sh.getRange(row, 1).getValue() || '');
  if (String(id) !== real) {
    throw new Error('Список устарел, обновите страницу и повторите');
  }

  var name = String(sh.getRange(row, col_('Имя')).getValue() || '');
  var phone = String(sh.getRange(row, col_('Телефон')).getValue() || '');
  logAction_(real, 'ЗАЯВКА УДАЛЕНА: ' + name + ' ' + phone);
  sh.deleteRow(row);

  return apiList({});
}

/** Добавить заметку — дописывается сверху с датой и автором. */
function apiAddNote(row, text, ctx) {
  writeGuard_(ctx);
  text = String(text || '').trim();
  if (!text) return apiGetOne(row);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var c = col_('Заметки');
  var was = String(sh.getRange(row, c).getValue() || '');
  var stamp = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH:mm');
  var who = (CURRENT_WHO || 'сотрудник').split('@')[0];
  var line = '[' + stamp + ' · ' + who + '] ' + text;
  sh.getRange(row, c).setValue(was ? line + '\n' + was : line);
  markFirstTouch_(sh, row);
  sh.getRange(row, col_('Обновлена')).setValue(new Date());
  logAction_(sh.getRange(row, 1).getValue(), 'заметка: ' + text);
  return apiGetOne(row);
}

/** Заявка, заведённая руками — из мессенджера или по звонку. */
function apiCreate(data) {
  writeGuard_(data);
  if (!String(data['Телефон'] || '').replace(/\D/g, '')) throw new Error('Нужен телефон');
  var lead = saveLeadRow_(data);
  logAction_(lead['ID'], 'заявка заведена вручную');
  notifyTelegram_(leadToTelegram_(lead));
  return apiList({});
}

function apiGetOne(row) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var o = rowToObj_(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
  o.__row = row;
  return fmtDates_(o);
}

function logAction_(leadId, what) {
  var log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOG);
  if (!log) return;
  log.appendRow([new Date(), CURRENT_WHO || '—', leadId, what]);
}

/** Сводка для директолога: заявки и суммы по источникам. */
function apiSummary(range) {
  guard_(range);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  if (!sh || sh.getLastRow() < 2) return { rows: [], total: { leads: 0, deals: 0, sum: 0 } };

  var from = null, to = null;
  if (range && range.from) { from = new Date(range.from + 'T00:00:00'); }
  if (range && range.to)   { to   = new Date(range.to   + 'T23:59:59'); }

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  var by = {}, total = { leads: 0, deals: 0, sum: 0 };

  rows.forEach(function (r) {
    var o = rowToObj_(r);
    var created = o['Создана'];
    if (from && (!(created instanceof Date) || created < from)) return;
    if (to && (!(created instanceof Date) || created > to)) return;

    var key = o['utm_source'] || o['Источник'] || 'без источника';
    by[key] = by[key] || { source: key, leads: 0, deals: 0, sum: 0 };
    by[key].leads++; total.leads++;
    if (o['Статус'] === 'Договор') {
      var money = Number(o['Сумма, ₽']) || 0;
      by[key].deals++; by[key].sum += money;
      total.deals++; total.sum += money;
    }
  });

  return {
    rows: Object.keys(by).map(function (k) { return by[k]; })
            .sort(function (a, b) { return b.leads - a.leads; }),
    total: total
  };
}
