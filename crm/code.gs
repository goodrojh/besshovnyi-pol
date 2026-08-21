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

var SHEET_LEADS  = 'Заявки';
var SHEET_LOG    = 'История';
var SHEET_IMPORT = 'Импорт';
var SHEET_SPEND  = 'Расходы';
var SHEET_AVITO  = 'Авито';

var STATUSES = ['Новая', 'В работе', 'Замер', 'Смета', 'Договор', 'Отказ'];

// Этапы воронки по порядку. «Отказ» сюда не входит: с него можно уйти
// на любом шаге, поэтому он считается отдельно.
var FUNNEL = ['Новая', 'В работе', 'Замер', 'Смета', 'Договор'];

var REASONS = ['Дорого', 'Выбрали другого подрядчика', 'Отложили',
               'Не наш профиль', 'Площадь меньше 200 м²',
               'Не дозвонились', 'Другое'];

var TARGET_YN = ['Да', 'Нет'];

var SOURCES = ['Сайт: быстрая форма', 'Сайт: подбор системы', 'Сайт: галерея объектов',
               'Авито', 'Telegram', 'MAX', 'Звонок', 'Почта', 'Сарафан',
               'Партнёрство', 'Другое'];

// Порядок столбцов листа «Заявки». Менять только вместе с интерфейсом.
var HEADERS = [
  'ID', 'Создана', 'Источник', 'Имя', 'Телефон', 'Комментарий клиента',
  'Тип объекта', 'Площадь, м²', 'Нагрузка', 'Основание', 'Интересует',
  'Файлы', 'Акция', 'Статус', 'Сумма, ₽', 'Следующий контакт',
  'Ответственный', 'Заметки', 'Обновлена',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'Страница входа', 'Реферер',
  // добавлены ради аналитики; дописываются в конец, чтобы не сдвинуть старые
  'Первый контакт', 'Дошёл до', 'Договор от', 'Причина отказа', 'Целевая'
];

function col_(name) { return HEADERS.indexOf(name) + 1; }

/* ============================================================
   МЕНЮ В САМОЙ ТАБЛИЦЕ — чтобы не лазить в редактор кода
   ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ГК Сфера')
    .addItem('Починить телефоны', 'fixPhonesMenu')
    .addSeparator()
    .addItem('Создать лист для импорта', 'makeImportSheetMenu')
    .addItem('Загрузить заявки из листа «Импорт»', 'importLeadsMenu')
    .addSeparator()
    .addItem('Обновить таблицу под новые поля', 'migrateMenu')
    .addItem('Создать лист расходов на рекламу', 'makeSpendSheetMenu')
    .addSeparator()
    .addItem('Авито: проверить связь', 'avitoTestMenu')
    .addItem('Авито: забрать новые обращения', 'avitoPullMenu')
    .addSeparator()
    .addItem('Первичная настройка (один раз)', 'setupMenu')
    .addToUi();
}

function fixPhonesMenu() {
  SpreadsheetApp.getUi().alert(fixPhones());
}

function setupMenu() {
  setup();
  SpreadsheetApp.getUi().alert('Готово: листы и заголовки на месте.');
}

function makeImportSheetMenu() {
  var sh = makeImportSheet();
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sh);
  SpreadsheetApp.getUi().alert(
    'Лист «Импорт» готов.\n\n' +
    'Вставьте туда накопленные заявки: одна строка — один клиент. ' +
    'Обязательна только колонка «Телефон».\n\n' +
    'Потом: меню «ГК Сфера» → «Загрузить заявки из листа Импорт».');
}

function importLeadsMenu() {
  SpreadsheetApp.getUi().alert(importLeads());
}

function migrateMenu() {
  SpreadsheetApp.getUi().alert(migrate());
}

function makeSpendSheetMenu() {
  var sh = makeSpendSheet();
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sh);
  SpreadsheetApp.getUi().alert(
    'Лист «Расходы» готов.\n\n' +
    'Вносите сюда траты на рекламу: дата, источник, сумма. ' +
    'Тогда в аналитике появятся стоимость заявки, стоимость договора и окупаемость.');
}

function avitoTestMenu() {
  SpreadsheetApp.getUi().alert(avitoTest());
}

function avitoPullMenu() {
  SpreadsheetApp.getUi().alert(avitoPull());
}

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

  applyValidations_(sh);

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


function applyValidations_(sh) {
  var rest = sh.getMaxRows() - 1;
  function list(colName, values, strict) {
    sh.getRange(2, col_(colName), rest, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(values, true).setAllowInvalid(!strict).build());
  }
  list('Статус', STATUSES, true);
  list('Источник', SOURCES, false);
  list('Дошёл до', FUNNEL, false);
  list('Причина отказа', REASONS, false);
  list('Целевая', TARGET_YN, false);
}

/**
 * Обновление уже работающей таблицы под новые колонки.
 * В отличие от setup() ничего не стирает: дописывает недостающие
 * заголовки и заполняет «Дошёл до» по текущему статусу.
 * Повторный запуск безвреден.
 */
function migrate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_LEADS);
  if (!sh) return 'Нет листа «Заявки» — запустите «Первичная настройка».';

  var have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
               .map(function (h) { return String(h).trim(); });
  var added = [];
  HEADERS.forEach(function (h, i) {
    if (have[i] !== h) {
      sh.getRange(1, i + 1).setValue(h)
        .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
      if (!have[i]) added.push(h);
    }
  });
  sh.setFrozenRows(1);
  sh.getRange(2, col_('Телефон'), sh.getMaxRows() - 1, 1).setNumberFormat('@');
  applyValidations_(sh);

  // «Дошёл до» для старых строк: считаем, что заявка добралась
  // как минимум до своего текущего статуса
  var filled = 0;
  if (sh.getLastRow() > 1) {
    var n = sh.getLastRow() - 1;
    var st = sh.getRange(2, col_('Статус'), n, 1).getValues();
    var rg = sh.getRange(2, col_('Дошёл до'), n, 1);
    var cur = rg.getValues();
    for (var i = 0; i < n; i++) {
      if (cur[i][0]) continue;
      var idx = FUNNEL.indexOf(String(st[i][0]));
      if (idx > 0) { cur[i][0] = FUNNEL[idx]; filled++; }
    }
    rg.setValues(cur);
  }

  return 'Готово.\nДобавлено колонок: ' + (added.length ? added.join(', ') : 'ничего') +
         '\nПроставлен этап у старых заявок: ' + filled;
}

function makeSpendSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_SPEND);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET_SPEND);
  sh.getRange(1, 1, 1, 4).setValues([['Дата', 'Источник', 'Сумма, ₽', 'Комментарий']])
    .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(SOURCES, true).build());
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(4, 280);
  return sh;
}

/* ============================================================
   ИМПОРТ НАКОПЛЕННЫХ ЗАЯВОК
   Лист «Импорт» — перевалочный: туда вставляют выгрузку из Авито,
   блокнота или старой таблицы, и одной командой всё переезжает
   в «Заявки» с нормальными ID и без дублей по телефону.
   ============================================================ */

function makeImportSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_IMPORT) || ss.insertSheet(SHEET_IMPORT);
  sh.clear();
  sh.clearDataValidations();

  var head = ['Дата', 'Имя', 'Телефон', 'Комментарий', 'Источник', 'Статус', 'Сумма, ₽'];
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);

  var rest = sh.getMaxRows() - 1;
  sh.getRange(2, 3, rest, 1).setNumberFormat('@');   // телефон — только текстом
  sh.getRange(2, 5, rest, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(SOURCES, true).build());
  sh.getRange(2, 6, rest, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());

  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(3, 150);
  sh.setColumnWidth(4, 340);
  sh.setColumnWidth(5, 160);
  return sh;
}

function importLeads() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(SHEET_IMPORT);
  if (!src) return 'Листа «Импорт» нет. Сначала: меню «ГК Сфера» → «Создать лист для импорта».';

  var last = src.getLastRow(), wide = src.getLastColumn();
  if (last < 2) return 'В листе «Импорт» пусто — вставьте туда заявки и повторите.';

  var head = src.getRange(1, 1, 1, wide).getValues()[0]
               .map(function (h) { return String(h).trim(); });
  function at(row, names) {
    for (var i = 0; i < names.length; i++) {
      var k = head.indexOf(names[i]);
      if (k !== -1) return row[k];
    }
    return '';
  }

  var rows = src.getRange(2, 1, last - 1, wide).getValues();
  var sh = ss.getSheetByName(SHEET_LEADS);
  if (!sh) return 'Нет листа «Заявки» — запустите «Первичная настройка».';

  var known = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, col_('Телефон'), sh.getLastRow() - 1, 1).getValues()
      .forEach(function (r) { var d = digits_(r[0]); if (d) known[d] = true; });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var num = parseInt(nextId_(sh).replace(/\D/g, ''), 10);
    var now = new Date();
    var out = [], dupes = 0, noPhone = 0;

    rows.forEach(function (r) {
      var name  = String(at(r, ['Имя']) || '').trim();
      var phone = String(at(r, ['Телефон']) || '').trim();
      var d = digits_(phone);
      if (!d && !name) return;                    // пустая строка — молча пропускаем
      if (!d) { noPhone++; return; }
      if (known[d]) { dupes++; return; }
      known[d] = true;

      var lead = {};
      HEADERS.forEach(function (h) { lead[h] = ''; });
      lead['ID'] = 'ЗАЯВКА-' + ('000' + (num++)).slice(-4);
      lead['Создана'] = parseDate_(at(r, ['Дата'])) || now;
      lead['Обновлена'] = now;
      lead['Имя'] = name;
      lead['Телефон'] = phone;
      lead['Комментарий клиента'] = String(at(r, ['Комментарий', 'Комментарий клиента']) || '').trim();
      lead['Источник'] = String(at(r, ['Источник']) || '').trim() || 'Другое';
      lead['Статус'] = String(at(r, ['Статус']) || '').trim() || 'Новая';
      lead['Сумма, ₽'] = at(r, ['Сумма, ₽', 'Сумма']) || '';
      out.push(HEADERS.map(function (h) { return lead[h]; }));
    });

    var tail = '\nПропущено дублей (такой телефон уже есть): ' + dupes +
               '\nПропущено строк без телефона: ' + noPhone;
    if (!out.length) return 'Новых заявок не нашлось.' + tail;

    var first = sh.getLastRow() + 1;
    sh.getRange(first, col_('Телефон'), out.length, 1).setNumberFormat('@');
    sh.getRange(first, 1, out.length, HEADERS.length).setValues(out);

    src.deleteRows(2, last - 1);   // перенесённое убираем, чтобы не залить повторно
    return 'Загружено заявок: ' + out.length + tail;
  } finally {
    lock.releaseLock();
  }
}

function digits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

/** Дата из ячейки: настоящая дата, «21.08.2026» или «2026-08-21». */
function parseDate_(v) {
  if (v instanceof Date) return v;
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (m) {
    var y = Number(m[3]); if (y < 100) y += 2000;
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
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
  var msg = 'Починено номеров: ' + fixed;
  Logger.log(msg);
  return msg;
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
               me: Session.getActiveUser().getEmail() };
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

/* ============================================================
   АНАЛИТИКА
   Один запрос считает всё окно целиком: воронку, скорость,
   деньги, источники, менеджеров. Считаем по заявкам, созданным
   внутри периода, — так цифры сходятся с рекламными расходами.
   ============================================================ */

function apiStats(range) {
  guard_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_LEADS);

  var out = {
    totals:   { leads: 0, deals: 0, lost: 0, open: 0, revenue: 0, avgCheck: 0,
                target: 0, nonTarget: 0, unmarked: 0 },
    funnel:   [],
    speed:    { touched: 0, avgMin: 0, in15: 0, in60: 0, untouched: 0 },
    cycle:    { deals: 0, avgDays: 0 },
    stale:    { d2: 0, d7: 0 },
    dow:      [], hours: [],
    reasons:  [], sources: [], utm: [], managers: [],
    area:     { inWork: 0, avg: 0 },
    spendKnown: false
  };
  if (!sh || sh.getLastRow() < 2) return out;

  var from = (range && range.from) ? new Date(range.from + 'T00:00:00') : null;
  var to   = (range && range.to)   ? new Date(range.to   + 'T23:59:59') : null;
  var now = new Date();

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();

  var bySource = {}, byUtm = {}, byManager = {}, byReason = {};
  var dow = [0, 0, 0, 0, 0, 0, 0], hours = [];
  for (var h = 0; h < 24; h++) hours.push(0);

  var reachedCount = {};
  FUNNEL.forEach(function (st) { reachedCount[st] = 0; });

  var speedSum = 0, cycleSum = 0, areaSum = 0, areaN = 0;

  rows.forEach(function (r) {
    var o = rowToObj_(r);
    var created = o['Создана'];
    if (!(created instanceof Date)) return;
    if (from && created < from) return;
    if (to && created > to) return;

    var status  = String(o['Статус'] || '');
    var isDeal  = status === 'Договор';
    var isLost  = status === 'Отказ';
    var money   = Number(o['Сумма, ₽']) || 0;
    var srcKey  = String(o['Источник'] || 'без источника');
    var utmKey  = String(o['utm_source'] || '—');
    var manKey  = String(o['Ответственный'] || 'не назначен');

    out.totals.leads++;
    if (isDeal) { out.totals.deals++; out.totals.revenue += money; }
    else if (isLost) out.totals.lost++;
    else out.totals.open++;

    var mark = String(o['Целевая'] || '');
    if (mark === 'Нет') out.totals.nonTarget++;
    else if (mark === 'Да') out.totals.target++;
    else out.totals.unmarked++;

    // ---- воронка: самый дальний достигнутый этап
    var reached = Math.max(FUNNEL.indexOf(String(o['Дошёл до'] || '')),
                           FUNNEL.indexOf(status), 0);
    for (var i = 0; i <= reached; i++) reachedCount[FUNNEL[i]]++;

    // ---- скорость первого касания
    var ft = o['Первый контакт'];
    if (ft instanceof Date) {
      var min = (ft - created) / 60000;
      if (min >= 0) {
        out.speed.touched++;
        speedSum += min;
        if (min <= 15) out.speed.in15++;
        if (min <= 60) out.speed.in60++;
      }
    } else if (!isDeal && !isLost) {
      out.speed.untouched++;
    }

    // ---- цикл сделки
    var signed = o['Договор от'];
    if (isDeal && signed instanceof Date) {
      cycleSum += (signed - created) / 86400000;
      out.cycle.deals++;
    }

    // ---- заявки без движения
    if (!isDeal && !isLost) {
      var last = (o['Обновлена'] instanceof Date) ? o['Обновлена'] : created;
      var days = (now - last) / 86400000;
      if (days >= 7) out.stale.d7++;
      else if (days >= 2) out.stale.d2++;
    }

    // ---- когда приходят заявки
    dow[created.getDay()]++;
    hours[created.getHours()]++;

    // ---- причины отказа
    if (isLost) {
      var why = String(o['Причина отказа'] || 'не указана');
      byReason[why] = (byReason[why] || 0) + 1;
    }

    // ---- площадь
    var area = Number(String(o['Площадь, м²']).replace(/[^\d.]/g, '')) || 0;
    if (area) { areaSum += area; areaN++; }
    if (area && !isDeal && !isLost) out.area.inWork += area;

    function bump(box, key) {
      var b = box[key] || (box[key] = { key: key, leads: 0, deals: 0, revenue: 0, lost: 0 });
      b.leads++;
      if (isDeal) { b.deals++; b.revenue += money; }
      if (isLost) b.lost++;
    }
    bump(bySource, srcKey);
    bump(byUtm, utmKey);
    bump(byManager, manKey);
  });

  // ---- воронка с конверсиями между шагами
  var prev = 0;
  FUNNEL.forEach(function (st, i) {
    var n = reachedCount[st];
    out.funnel.push({
      stage: st, count: n,
      fromPrev: (i === 0 || !prev) ? null : Math.round(n / prev * 1000) / 10,
      fromStart: (!reachedCount[FUNNEL[0]]) ? null
                 : Math.round(n / reachedCount[FUNNEL[0]] * 1000) / 10
    });
    prev = n;
  });

  if (out.speed.touched) out.speed.avgMin = Math.round(speedSum / out.speed.touched);
  if (out.cycle.deals)   out.cycle.avgDays = Math.round(cycleSum / out.cycle.deals * 10) / 10;
  if (out.totals.deals)  out.totals.avgCheck = Math.round(out.totals.revenue / out.totals.deals);
  if (areaN)             out.area.avg = Math.round(areaSum / areaN);

  // ---- дни недели и часы
  var dowNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  var order = [1, 2, 3, 4, 5, 6, 0];
  order.forEach(function (d) { out.dow.push({ label: dowNames[d], n: dow[d] }); });
  for (var k = 0; k < 24; k++) out.hours.push({ label: (k < 10 ? '0' : '') + k, n: hours[k] });

  out.reasons = Object.keys(byReason).map(function (k) { return { reason: k, n: byReason[k] }; })
                  .sort(function (a, b) { return b.n - a.n; });

  // ---- расходы на рекламу
  var spend = spendBySource_(from, to);
  out.spendKnown = spend.total > 0;

  function pack(box, withSpend) {
    return Object.keys(box).map(function (k) {
      var b = box[k];
      var o2 = {
        key: k, leads: b.leads, deals: b.deals, lost: b.lost, revenue: b.revenue,
        conv: b.leads ? Math.round(b.deals / b.leads * 1000) / 10 : 0
      };
      if (withSpend) {
        var sp = spend.by[k] || 0;
        o2.spend = sp;
        o2.cpl = sp && b.leads ? Math.round(sp / b.leads) : 0;
        o2.cpa = sp && b.deals ? Math.round(sp / b.deals) : 0;
        o2.romi = sp ? Math.round((b.revenue - sp) / sp * 100) : null;
        o2.drr = b.revenue ? Math.round(sp / b.revenue * 1000) / 10 : null;
      }
      return o2;
    }).sort(function (a, b) { return b.leads - a.leads; });
  }

  out.sources = pack(bySource, true);
  out.utm = pack(byUtm, false);
  out.managers = pack(byManager, false);
  out.spendTotal = spend.total;
  out.romiTotal = spend.total ? Math.round((out.totals.revenue - spend.total) / spend.total * 100) : null;
  out.cplTotal = (spend.total && out.totals.leads) ? Math.round(spend.total / out.totals.leads) : 0;

  return out;
}

/** Рекламные траты за период, разложенные по источникам. */
function spendBySource_(from, to) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SPEND);
  var res = { by: {}, total: 0 };
  if (!sh || sh.getLastRow() < 2) return res;

  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    var d = (r[0] instanceof Date) ? r[0] : parseDate_(r[0]);
    if (!d) return;
    if (from && d < from) return;
    if (to && d > to) return;
    var src = String(r[1] || 'без источника');
    var sum = Number(r[2]) || 0;
    if (!sum) return;
    res.by[src] = (res.by[src] || 0) + sum;
    res.total += sum;
  });
  return res;
}


/* ============================================================
   АВИТО
   Ключи лежат в свойствах скрипта: AVITO_CLIENT_ID и AVITO_CLIENT_SECRET.
   В код их не вписываем — репозиторий сайта открытый.
   ============================================================ */

function avitoToken_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('avito_token');
  if (hit) return hit;

  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('AVITO_CLIENT_ID');
  var secret = p.getProperty('AVITO_CLIENT_SECRET');
  if (!id || !secret) throw new Error('Не заданы AVITO_CLIENT_ID и AVITO_CLIENT_SECRET в свойствах скрипта.');

  var res = UrlFetchApp.fetch('https://api.avito.ru/token/', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: { grant_type: 'client_credentials', client_id: id, client_secret: secret },
    muteHttpExceptions: true
  });
  var body = res.getContentText();
  if (res.getResponseCode() !== 200) {
    throw new Error('Авито не выдал токен (' + res.getResponseCode() + '): ' + body);
  }
  var data = JSON.parse(body);
  if (!data.access_token) throw new Error('В ответе Авито нет access_token: ' + body);

  // токен живёт около суток, держим в кэше час — дольше кэш не хранит
  cache.put('avito_token', data.access_token, 3000);
  return data.access_token;
}

function avitoGet_(path) {
  var res = UrlFetchApp.fetch('https://api.avito.ru' + path, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + avitoToken_() },
    muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), text: res.getContentText() };
}

/**
 * Проверка связи. Показывает, что именно ответил Авито, —
 * по этому ответу настраивается всё остальное.
 */
function avitoTest() {
  var lines = [];
  try {
    avitoToken_();
    lines.push('Токен получен — ключи рабочие.');
  } catch (e) {
    return 'Не получилось: ' + e.message;
  }

  var self = avitoGet_('/core/v1/accounts/self');
  lines.push('');
  lines.push('Профиль (' + self.code + '): ' + self.text.slice(0, 400));

  var id = '';
  try { id = String(JSON.parse(self.text).id || ''); } catch (e) {}

  if (id) {
    var chats = avitoGet_('/messenger/v2/accounts/' + id + '/chats?limit=3');
    lines.push('');
    lines.push('Мессенджер (' + chats.code + '): ' + chats.text.slice(0, 800));
    if (chats.code === 403) {
      lines.push('');
      lines.push('403 значит, что доступ к переписке для этих ключей не открыт — ' +
                 'его запрашивают отдельно в кабинете Авито.');
    }
  }
  return lines.join('\n');
}

/**
 * Забирает обращения из мессенджера Авито и заводит новые как заявки.
 * Чат, который уже переносили, второй раз не заводится — список
 * перенесённых лежит на листе «Авито».
 */
function avitoPull() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var self = avitoGet_('/core/v1/accounts/self');
  if (self.code !== 200) return 'Авито не отдал профиль (' + self.code + '): ' + self.text.slice(0, 300);

  var accountId = String(JSON.parse(self.text).id || '');
  if (!accountId) return 'В ответе Авито нет id аккаунта.';

  var chats = avitoGet_('/messenger/v2/accounts/' + accountId + '/chats?limit=100');
  if (chats.code !== 200) {
    return 'Переписка недоступна (' + chats.code + '): ' + chats.text.slice(0, 300) +
           '\n\nСкорее всего, доступ к мессенджеру не открыт для этих ключей.';
  }

  var list = [];
  try { list = JSON.parse(chats.text).chats || []; } catch (e) { return 'Не разобрал ответ Авито: ' + chats.text.slice(0, 300); }

  var seenSheet = ss.getSheetByName(SHEET_AVITO);
  if (!seenSheet) {
    seenSheet = ss.insertSheet(SHEET_AVITO);
    seenSheet.getRange(1, 1, 1, 4).setValues([['Чат', 'Заявка', 'Клиент', 'Перенесён']])
      .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
    seenSheet.setFrozenRows(1);
    seenSheet.hideSheet();
  }
  var seen = {};
  if (seenSheet.getLastRow() > 1) {
    seenSheet.getRange(2, 1, seenSheet.getLastRow() - 1, 1).getValues()
      .forEach(function (r) { seen[String(r[0])] = true; });
  }

  var added = 0;
  list.forEach(function (chat) {
    var chatId = String(chat.id || '');
    if (!chatId || seen[chatId]) return;

    var name = '';
    (chat.users || []).forEach(function (u) {
      if (String(u.id) !== accountId && !name) name = String(u.name || '');
    });

    var text = '';
    try { text = String(chat.last_message.content.text || ''); } catch (e) {}

    var about = '';
    try { about = String(chat.context.value.title || ''); } catch (e) {}

    var lead = saveLeadRow_({
      'Источник': 'Авито',
      'Имя': name || 'Клиент с Авито',
      'Телефон': '',
      'Комментарий клиента': text,
      'Интересует': about,
      'Файлы': 'https://www.avito.ru/profile/messenger/channel/' + chatId,
      'utm_source': 'avito'
    });

    seenSheet.appendRow([chatId, lead['ID'], name, new Date()]);
    notifyTelegram_(leadToTelegram_(lead));
    added++;
  });

  return 'Обращений с Авито перенесено: ' + added + '\nВсего чатов в ответе: ' + list.length;
}
