/**
 * ГК Сфера — CRM. Файл: Интерфейс
 * Часть общего кода: все файлы проекта видят функции друг друга.
 */

/* ============================================================
   ВЕБ-ИНТЕРФЕЙС
   ============================================================ */

function doGet() {
  if (!isAllowed_()) {
    return HtmlService.createHtmlOutput(
      '<div style="font:16px/1.5 Arial;padding:40px;text-align:center">' +
      '<h2>Нет доступа</h2><p>Этот Google-аккаунт не в списке разрешённых.<br>' +
      'Войдите под рабочим аккаунтом или попросите добавить вас.</p></div>');
  }
  return HtmlService.createTemplateFromFile('CRM').evaluate()
    .setTitle('CRM — ГК Сфера')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-status-bar-style', 'default')
    .addMetaTag('apple-mobile-web-app-title', 'CRM Сфера')
    .addMetaTag('theme-color', '#0f1820');
}

function isAllowed_() {
  var cfg = CONFIG_();
  if (!cfg.allowed.length) return true; // список не задан — пускаем всех, кто открыл ссылку
  var me = (Session.getActiveUser().getEmail() || '').toLowerCase();
  return cfg.allowed.indexOf(me) !== -1;
}

function guard_() {
  if (!isAllowed_()) throw new Error('Нет доступа');
}

function rowToObj_(r) {
  var o = {};
  HEADERS.forEach(function (h, i) { o[h] = r[i]; });
  return o;
}

function fmtDates_(o) {
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
  guard_();
  filter = filter || {};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var base = { statuses: STATUSES, sources: SOURCES, reasons: REASONS,
               groups: SOURCE_GROUPS, me: Session.getActiveUser().getEmail() };
  if (!sh || sh.getLastRow() < 2) { base.leads = []; return base; }

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  var q = String(filter.q || '').toLowerCase().trim();
  var today = new Date(); today.setHours(23, 59, 59, 999);

  var leads = values.map(function (r, i) {
    var o = rowToObj_(r);
    o.__row = i + 2;
    o.overdue = (o['Следующий контакт'] instanceof Date) &&
                o['Следующий контакт'] <= today &&
                ['Договор', 'Отказ'].indexOf(o['Статус']) === -1;
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
  var counts = { '': leads.length, 'overdue': 0 };
  STATUSES.forEach(function (s) { counts[s] = 0; });
  leads.forEach(function (o) {
    if (counts[o['Статус']] !== undefined) counts[o['Статус']]++;
    if (o.overdue) counts.overdue++;
  });

  leads = leads.filter(function (o) {
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
function apiToday() {
  guard_();
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
  guard_();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var row = Number(patch.__row);
  if (!row || row < 2) throw new Error('Заявка не найдена');

  var changes = [];
  markFirstTouch_(sh, row);

  ['Статус', 'Сумма, ₽', 'Ответственный', 'Причина отказа', 'Целевая'].forEach(function (h) {
    if (patch[h] === undefined) return;
    var c = col_(h);
    var was = sh.getRange(row, c).getValue();
    if (String(was) !== String(patch[h])) {
      sh.getRange(row, c).setValue(patch[h]);
      changes.push(h + ': ' + (was || '—') + ' → ' + (patch[h] || '—'));
    }
  });

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

/** Добавить заметку — дописывается сверху с датой и автором. */
function apiAddNote(row, text) {
  guard_();
  text = String(text || '').trim();
  if (!text) return apiGetOne(row);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var c = col_('Заметки');
  var was = String(sh.getRange(row, c).getValue() || '');
  var stamp = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH:mm');
  var who = (Session.getActiveUser().getEmail() || '').split('@')[0];
  var line = '[' + stamp + ' · ' + who + '] ' + text;
  sh.getRange(row, c).setValue(was ? line + '\n' + was : line);
  markFirstTouch_(sh, row);
  sh.getRange(row, col_('Обновлена')).setValue(new Date());
  logAction_(sh.getRange(row, 1).getValue(), 'заметка: ' + text);
  return apiGetOne(row);
}

/** Заявка, заведённая руками — из мессенджера или по звонку. */
function apiCreate(data) {
  guard_();
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
  log.appendRow([new Date(), Session.getActiveUser().getEmail() || '—', leadId, what]);
}

/** Сводка для директолога: заявки и суммы по источникам. */
function apiSummary(range) {
  guard_();
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
