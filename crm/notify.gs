/**
 * ГК Сфера — CRM. Файл: Уведомления
 * Часть общего кода: все файлы проекта видят функции друг друга.
 */

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

function notifyTelegram_(text, thread) {
  var cfg = CONFIG_();
  if (!cfg.telegramToken || !cfg.chatId) return;
  var payload = {
    chat_id: cfg.chatId, text: text,
    parse_mode: 'HTML', disable_web_page_preview: true
  };
  var t = (thread === undefined) ? cfg.threadId : thread;
  if (t) payload.message_thread_id = Number(t);
  UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.telegramToken + '/sendMessage', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}

/** Напоминания уходят в свою тему группы, чтобы не мешаться с заявками. */
function notifyReminders_(text) {
  var cfg = CONFIG_();
  notifyTelegram_(text, cfg.threadRemind || cfg.threadId);
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
  var cfg = CONFIG_();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LEADS);
  if (!sh || sh.getLastRow() < 2) return 'Заявок нет.';

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  var dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  var dayEnd = new Date();   dayEnd.setHours(23, 59, 59, 999);

  var late = [], today = [];
  rows.forEach(function (r) {
    var lead = rowToObj_(r);
    if (lead['Статус'] === 'Договор' || lead['Статус'] === 'Отказ') return;
    var next = lead['Следующий контакт'];
    if (!(next instanceof Date)) return;          // без назначенной даты — не тревожим
    if (next < dayStart) late.push(lead);
    else if (next <= dayEnd) today.push(lead);
  });

  if (!late.length && !today.length) {
    return 'На сегодня звонков не запланировано — сообщение не отправлено.';
  }

  function byDate(a, b) { return a['Следующий контакт'] - b['Следующий контакт']; }
  late.sort(byDate);
  today.sort(byDate);

  var parts = ['<b>Напоминания на ' + fmtDay_(dayStart) + '</b>'];

  if (today.length) {
    parts.push('');
    parts.push('📅 <b>Сегодня созвон — ' + today.length + '</b>');
    today.forEach(function (l, i) { parts.push(cardText_(l, i + 1, false)); });
  }

  if (late.length) {
    parts.push('');
    parts.push('⏰ <b>Просрочено, ждут звонка — ' + late.length + '</b>');
    late.forEach(function (l, i) { parts.push(cardText_(l, i + 1, true)); });
  }

  parts.push('');
  parts.push('Всего звонков: <b>' + (late.length + today.length) + '</b>');
  if (cfg.crmUrl) parts.push('<a href="' + cfg.crmUrl + '">Открыть CRM</a>');

  var text = parts.join('\n');
  if (text.length > 3900) text = text.slice(0, 3800) + '\n\n…список обрезан, остальное в CRM.';

  notifyReminders_(text);
  return 'Отправлено: сегодня ' + today.length + ', просрочено ' + late.length + '.';
}

/** Один клиент в напоминании: кто, сколько метров, о чём говорили. */
function cardText_(l, num, isLate) {
  var head = num + '. <b>' + esc_(l['Имя'] || 'без имени') + '</b>';
  var area = areaText_(l['Площадь, м²']);
  if (area) head += ' · <b>' + esc_(area) + '</b>';

  var lines = ['', head];
  lines.push('📞 ' + esc_(l['Телефон'] || 'телефона нет'));

  var where = [];
  if (l['Тип объекта']) where.push(String(l['Тип объекта']));
  if (l['Адрес объекта']) where.push(String(l['Адрес объекта']));
  if (where.length) lines.push('🏢 ' + esc_(where.join(', ')));

  var tail = [String(l['Статус'] || '')];
  if (l['Источник']) tail.push(String(l['Источник']));
  if (isLate) tail.push('ждёт с ' + fmtDay_(l['Следующий контакт']) + ', ' +
                        daysAgo_(l['Следующий контакт']));
  if (l['Сумма, ₽']) tail.push('на ' + Number(l['Сумма, ₽']).toLocaleString('ru-RU') + ' ₽');
  lines.push('📌 ' + esc_(tail.join(' · ')));

  var note = lastNote_(l);
  if (note) lines.push('💬 ' + esc_(note));

  return lines.join('\n');
}

/** Последняя заметка менеджера, а если её нет — что писал клиент. */
function lastNote_(l) {
  var notes = String(l['Заметки'] || '').trim();
  var text = '';
  if (notes) {
    text = notes.split('\n')[0].replace(/^\[[^\]]*\]\s*/, '');   // убираем метку даты и автора
  }
  if (!text) text = String(l['Комментарий клиента'] || '').trim();
  if (!text) text = String(l['Интересует'] || '').trim();
  text = text.replace(/\s+/g, ' ');
  return text.length > 110 ? text.slice(0, 110) + '…' : text;
}

function areaText_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  return /м²|м2|кв/i.test(s) ? s : s + ' м²';
}

function fmtDay_(d) {
  return (d instanceof Date) ? Utilities.formatDate(d, 'Europe/Moscow', 'd MMMM') : '';
}

function daysAgo_(d) {
  if (!(d instanceof Date)) return '';
  var day = new Date(); day.setHours(0, 0, 0, 0);
  var n = Math.round((day - d) / 86400000);
  if (n <= 0) return 'сегодня';
  if (n === 1) return 'вчера';
  var last = n % 10, two = n % 100;
  var word = (last === 1 && two !== 11) ? 'день'
           : ((last >= 2 && last <= 4) && (two < 10 || two >= 20)) ? 'дня' : 'дней';
  return n + ' ' + word + ' назад';
}
