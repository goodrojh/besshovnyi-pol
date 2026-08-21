/**
 * ГК Сфера — CRM на Google Apps Script.
 *
 * Что делает:
 *   1. Принимает заявки с сайта (doPost) и складывает в лист «Заявки».
 *   2. Сразу шлёт уведомление в Telegram и на почту — уже с сервера Google,
 *      а не из браузера клиента, поэтому ничего не теряется.
 *   3. Отдаёт веб-интерфейс CRM (doGet) для работы с заявками.
 *   4. Раз в день напоминает о клиентах, которым обещали перезвонить.
 *
 * Все ключи хранятся в «Свойствах скрипта», а не в коде.
 */

/* ============================================================
   НАСТРОЙКИ
   ============================================================ */

function CONFIG_() {
  var p = PropertiesService.getScriptProperties();
  return {
    telegramToken: p.getProperty('TELEGRAM_TOKEN') || '',
    chatId:        p.getProperty('TELEGRAM_CHAT_ID') || '',
    threadId:      p.getProperty('TELEGRAM_THREAD_ID') || '',
    notifyEmail:   p.getProperty('NOTIFY_EMAIL') || '',
    // кто может открывать CRM: адреса Google-аккаунтов через запятую
    allowed:       (p.getProperty('ALLOWED_EMAILS') || '').split(',')
                     .map(function (s) { return s.trim().toLowerCase(); })
                     .filter(String),
    // общий секрет: сайт присылает его вместе с заявкой
    formToken:     p.getProperty('FORM_TOKEN') || ''
  };
}

var SHEET_LEADS = 'Заявки';
var SHEET_LOG   = 'История';

var STATUSES = ['Новая', 'В работе', 'Замер', 'Смета', 'Договор', 'Отказ'];

var SOURCES = ['Сайт: быстрая форма', 'Сайт: подбор системы', 'Сайт: галерея объектов',
               'Telegram', 'MAX', 'Звонок', 'Почта', 'Сарафан', 'Партнёрство', 'Другое'];

// Порядок столбцов листа «Заявки». Менять только вместе с интерфейсом.
var HEADERS = [
  'ID', 'Создана', 'Источник', 'Имя', 'Телефон', 'Комментарий клиента',
  'Тип объекта', 'Площадь, м²', 'Нагрузка', 'Основание', 'Интересует',
  'Файлы', 'Акция', 'Статус', 'Сумма, ₽', 'Следующий контакт',
  'Ответственный', 'Заметки', 'Обновлена',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'Страница входа', 'Реферер'
];

function col_(name) { return HEADERS.indexOf(name) + 1; }

/* ============================================================
   ПЕРВИЧНАЯ НАСТРОЙКА — запустить один раз вручную
   ============================================================ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sh = ss.getSheetByName(SHEET_LEADS) || ss.insertSheet(SHEET_LEADS);
  sh.clear();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidth(col_('Комментарий клиента'), 260);
  sh.setColumnWidth(col_('Заметки'), 360);
  sh.setColumnWidth(col_('Файлы'), 220);
  // Номер начинается с «+», и без текстового формата Таблицы считают его
  // формулой и показывают #ERROR!
  sh.getRange(2, col_('Телефон'), sh.getMaxRows() - 1, 1).setNumberFormat('@');

  sh.getRange(2, col_('Статус'), sh.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES, true).setAllowInvalid(false).build());

  sh.getRange(2, col_('Источник'), sh.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(SOURCES, true).setAllowInvalid(true).build());

  var log = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG);
  if (log.getLastRow() === 0) {
    log.getRange(1, 1, 1, 4).setValues([['Когда', 'Кто', 'Заявка', 'Что сделал']])
      .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
    log.setFrozenRows(1);
  }

  // ежедневное напоминание в 9 утра
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(9).everyDays(1).create();

  return 'Готово. Листы созданы, ежедневное напоминание включено.';
}

/* ============================================================
   ПРИЁМ ЗАЯВОК С САЙТА
   ============================================================ */

function doPost(e) {
  try {
    var cfg = CONFIG_();
    var data = (e && e.parameter) ? e.parameter : {};

    if (cfg.formToken && data.token !== cfg.formToken) {
      return json_({ ok: false, error: 'bad token' });
    }
    if (!String(data['Телефон'] || '').replace(/\D/g, '')) {
      return json_({ ok: false, error: 'no phone' });
    }

    var lead = saveLeadRow_(data);
    notifyTelegram_(leadToTelegram_(lead));
    notifyEmail_(lead);
    return json_({ ok: true, id: lead['ID'] });
  } catch (err) {
    // Заявку терять нельзя: если что-то упало, хотя бы напишем в Telegram
    try {
      notifyTelegram_('Ошибка приёма заявки: ' + err.message + '\n\n' +
                      JSON.stringify(e && e.parameter));
    } catch (e2) {}
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveLeadRow_(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
    var id = nextId_(sh);
    var now = new Date();

    var lead = {};
    HEADERS.forEach(function (h) { lead[h] = (data[h] !== undefined) ? data[h] : ''; });
    lead['ID'] = id;
    lead['Создана'] = now;
    lead['Обновлена'] = now;
    lead['Статус'] = 'Новая';
    if (!lead['Источник']) lead['Источник'] = 'Другое';
    if (lead['Акция'] === '—') lead['Акция'] = '';
    if (lead['Комментарий клиента'] === '—') lead['Комментарий клиента'] = '';

    sh.appendRow(HEADERS.map(function (h) { return lead[h]; }));
    // Телефон дописываем отдельно в текстовую ячейку: иначе «+7 …»
    // уедет в формулу и станет #ERROR!
    var pc = col_('Телефон');
    sh.getRange(sh.getLastRow(), pc).setNumberFormat('@').setValue(lead['Телефон']);
    return lead;
  } finally {
    lock.releaseLock();
  }
}


/**
 * Разовый ремонт: номера, записанные до исправления, лежат в таблице
 * как формулы и показываются как #ERROR!. Достаём исходный текст
 * из формулы и возвращаем его обычным текстом.
 * Запускать вручную из редактора, повторный запуск безвреден.
 */
function fixPhones() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  if (!sh || sh.getLastRow() < 2) return 'Заявок нет.';
  var pc = col_('Телефон');
  var rng = sh.getRange(2, pc, sh.getLastRow() - 1, 1);
  var formulas = rng.getFormulas();
  var values = rng.getValues();
  var fixed = 0;

  for (var i = 0; i < values.length; i++) {
    var f = formulas[i][0];
    var v = values[i][0];
    var text = '';
    if (f) text = String(f).replace(/^=/, '');            // было формулой
    else if (v === '#ERROR!' || v === '') continue;
    else continue;                                         // обычный текст — не трогаем
    var cell = sh.getRange(i + 2, pc);
    cell.setNumberFormat('@').setValue(text);
    fixed++;
  }
  rng.setNumberFormat('@');
  return 'Починено номеров: ' + fixed;
}
function nextId_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 'ЗАЯВКА-0001';
  var prev = String(sh.getRange(last, 1).getValue() || '');
  var n = parseInt(prev.replace(/\D/g, ''), 10) || 0;
  return 'ЗАЯВКА-' + ('000' + (n + 1)).slice(-4);
}

/* ============================================================
   УВЕДОМЛЕНИЯ
   ============================================================ */

function leadToTelegram_(lead) {
  var lines = ['<b>Новая заявка — ' + esc_(lead['ID']) + '</b>', ''];
  ['Имя', 'Телефон', 'Комментарий клиента', 'Интересует', 'Тип объекта',
   'Площадь, м²', 'Нагрузка', 'Основание', 'Файлы', 'Акция', 'Источник',
   'utm_source', 'utm_campaign'].forEach(function (k) {
    var v = lead[k];
    if (v === '' || v === null || v === undefined) return;
    lines.push('<b>' + esc_(k) + ':</b> ' + esc_(v));
  });
  return lines.join('\n');
}

function esc_(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function notifyTelegram_(text) {
  var cfg = CONFIG_();
  if (!cfg.telegramToken || !cfg.chatId) return;
  var payload = {
    chat_id: cfg.chatId, text: text,
    parse_mode: 'HTML', disable_web_page_preview: true
  };
  if (cfg.threadId) payload.message_thread_id = Number(cfg.threadId);
  UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.telegramToken + '/sendMessage', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}

function notifyEmail_(lead) {
  var cfg = CONFIG_();
  if (!cfg.notifyEmail) return;
  var skip = ['Заметки', 'Обновлена', 'Ответственный', 'Статус'];
  var rows = HEADERS.filter(function (h) {
    return lead[h] !== '' && skip.indexOf(h) === -1;
  }).map(function (h) {
    return '<tr><td style="padding:6px 12px;color:#666">' + esc_(h) +
           '</td><td style="padding:6px 12px"><b>' + esc_(lead[h]) + '</b></td></tr>';
  }).join('');
  MailApp.sendEmail({
    to: cfg.notifyEmail,
    subject: 'Заявка с сайта ГК Сфера — ' + lead['ID'] + ', ' + (lead['Имя'] || ''),
    htmlBody: '<h2>Новая заявка</h2>' +
              '<table style="border-collapse:collapse;font-family:Arial">' + rows + '</table>'
  });
}

/* ============================================================
   ЕЖЕДНЕВНОЕ НАПОМИНАНИЕ
   ============================================================ */

function dailyDigest() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  var today = new Date(); today.setHours(23, 59, 59, 999);

  var due = [], fresh = [];
  rows.forEach(function (r) {
    var lead = rowToObj_(r);
    if (lead['Статус'] === 'Договор' || lead['Статус'] === 'Отказ') return;
    var next = lead['Следующий контакт'];
    if (next instanceof Date && next <= today) due.push(lead);
    if (lead['Статус'] === 'Новая') fresh.push(lead);
  });

  if (!due.length && !fresh.length) return;

  var parts = ['<b>Что на сегодня</b>', ''];
  if (fresh.length) {
    parts.push('<b>Новые, ещё не взяты в работу: ' + fresh.length + '</b>');
    fresh.slice(0, 10).forEach(function (l) {
      parts.push('• ' + esc_(l['Имя'] || 'без имени') + ' — ' + esc_(l['Телефон']));
    });
    parts.push('');
  }
  if (due.length) {
    parts.push('<b>Обещали связаться: ' + due.length + '</b>');
    due.slice(0, 10).forEach(function (l) {
      parts.push('• ' + esc_(l['Имя'] || 'без имени') + ' — ' + esc_(l['Телефон']) +
                 ' (' + esc_(l['Статус']) + ')');
    });
  }
  notifyTelegram_(parts.join('\n'));
}

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
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
  ['Создана', 'Обновлена', 'Следующий контакт'].forEach(function (k) {
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
  var base = { statuses: STATUSES, sources: SOURCES, me: Session.getActiveUser().getEmail() };
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

/** Сохранение карточки: статус, сумма, дата следующего контакта, ответственный. */
function apiSave(patch) {
  guard_();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  var row = Number(patch.__row);
  if (!row || row < 2) throw new Error('Заявка не найдена');

  var changes = [];
  ['Статус', 'Сумма, ₽', 'Ответственный'].forEach(function (h) {
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

  sh.getRange(row, col_('Обновлена')).setValue(new Date());
  if (changes.length) logAction_(sh.getRange(row, 1).getValue(), changes.join('; '));
  return apiGetOne(row);
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
