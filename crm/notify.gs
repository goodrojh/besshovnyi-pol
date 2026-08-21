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
