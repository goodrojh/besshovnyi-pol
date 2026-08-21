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
var SHEET_SITES  = 'Площадки';
var SHEET_AVITO  = 'Авито';

var STATUSES = ['Новая', 'В работе', 'Замер', 'Смета', 'Договор', 'Отказ'];

// Этапы воронки по порядку. «Отказ» сюда не входит: с него можно уйти
// на любом шаге, поэтому он считается отдельно.
var FUNNEL = ['Новая', 'В работе', 'Замер', 'Смета', 'Договор'];

var REASONS = ['Дорого', 'Выбрали другого подрядчика', 'Отложили',
               'Не наш профиль', 'Площадь меньше 200 м²',
               'Не дозвонились', 'Другое'];

var TARGET_YN = ['Да', 'Нет'];

var SOURCES = [
  'Сайт: быстрая форма', 'Сайт: подбор системы', 'Сайт: галерея объектов',
  'Сайт: звонок', 'Сайт: почта', 'Сайт: MAX', 'Сайт: Telegram',
  'Авито', 'Авито: звонок',
  'MAX', 'Telegram', 'Звонок', 'Почта',
  'Сарафан', 'Партнёрство', 'Другое'
];

// Рекламные площадки: куда уходят деньги. Заявка относится к площадке
// по utm-метке, а если её нет — по источнику.
var PLATFORMS = [
  { name: 'Авито',         sources: ['Авито', 'Авито: звонок'], utm: ['avito'] },
  { name: 'Яндекс Директ', sources: [], utm: ['yandex', 'yandex_direct', 'direct', 'ya'] },
  { name: 'Без рекламы',   sources: ['Сарафан', 'Партнёрство'], utm: [] }
];

// Каналы привлечения: по ним в аналитике включаются галочки одним нажатием.
var SOURCE_GROUPS = [
  { name: 'Сайт', items: ['Сайт: быстрая форма', 'Сайт: подбор системы',
                          'Сайт: галерея объектов', 'Сайт: звонок', 'Сайт: почта',
                          'Сайт: MAX', 'Сайт: Telegram'] },
  { name: 'Авито', items: ['Авито', 'Авито: звонок'] },
  { name: 'Мессенджеры', items: ['MAX', 'Telegram'] },
  { name: 'Без рекламы', items: ['Сарафан', 'Партнёрство'] },
  { name: 'Прочее', items: ['Звонок', 'Почта', 'Другое'] }
];

// Порядок столбцов листа «Заявки». Менять только вместе с интерфейсом.
var HEADERS = [
  'ID', 'Создана', 'Источник', 'Имя', 'Телефон', 'Комментарий клиента',
  'Тип объекта', 'Площадь, м²', 'Нагрузка', 'Основание', 'Интересует',
  'Файлы', 'Акция', 'Статус', 'Сумма, ₽', 'Следующий контакт',
  'Ответственный', 'Заметки', 'Обновлена',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'Страница входа', 'Реферер',
  // добавлены ради аналитики; дописываются в конец, чтобы не сдвинуть старые
  'Первый контакт', 'Дошёл до', 'Договор от', 'Причина отказа', 'Целевая',
  'Адрес объекта'
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
    .addItem('Авито: старые переписки не переносить', 'avitoMarkSeenMenu')
    .addItem('Авито: обновить остаток денег', 'avitoBalanceMenu')
    .addItem('Авито: включить автосбор', 'avitoAutoOnMenu')
    .addItem('Авито: выключить автосбор', 'avitoAutoOffMenu')
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

function avitoMarkSeenMenu() {
  var ui = SpreadsheetApp.getUi();
  var ans = ui.alert('Старые переписки Авито',
    'Все переписки, которые сейчас есть в Авито, будут помечены как уже обработанные — ' +
    'в CRM они не попадут. Заявки будут заводиться только по новым обращениям.\n\n' +
    'Продолжить?', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  ui.alert(avitoMarkSeen());
}

function avitoBalanceMenu() {
  SpreadsheetApp.getUi().alert(avitoBalance());
}

function avitoAutoOnMenu() {
  SpreadsheetApp.getUi().alert(avitoAuto(true));
}

function avitoAutoOffMenu() {
  SpreadsheetApp.getUi().alert(avitoAuto(false));
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

function platformNames_() {
  var out = PLATFORMS.map(function (p) { return p.name; });
  out.push('Другое');
  return out;
}

function makeSpendSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_SPEND);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SPEND);
    sh.getRange(1, 1, 1, 4).setValues([['Дата', 'Площадка', 'Сумма, ₽', 'Комментарий']])
      .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 180);
    sh.setColumnWidth(4, 280);
  }
  // лист мог быть создан раньше, когда колонка называлась «Источник»
  if (String(sh.getRange(1, 2).getValue()).trim() !== 'Площадка') {
    sh.getRange(1, 2).setValue('Площадка');
  }
  sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(platformNames_(), true).build());

  makeSitesSheet();
  return sh;
}

/** Остатки денег на рекламных площадках. Авито обновляется само, остальное — руками. */
function makeSitesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_SITES);
  if (sh) return sh;

  sh = ss.insertSheet(SHEET_SITES);
  sh.getRange(1, 1, 1, 3).setValues([['Площадка', 'Остаток, ₽', 'Обновлено']])
    .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 180);

  var rows = PLATFORMS.filter(function (p) { return p.name !== 'Без рекламы'; })
    .map(function (p) { return [p.name, '', '']; });
  sh.getRange(2, 1, rows.length, 3).setValues(rows);
  sh.getRange(rows.length + 3, 1).setValue('Остаток по Авито подтягивается сам. Остальные — впишите вручную.')
    .setFontColor('#74828e');
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
