/**
 * ГК Сфера — CRM. Файл: Яндекс Директ
 * Часть общего кода: все файлы проекта видят функции друг друга.
 *
 * Что умеет:
 *   1. Показывает остаток денег в Директе и пишет его в лист «Площадки».
 *   2. Подтягивает расходы по дням в лист «Расходы» — вручную вносить не нужно.
 *
 * Токен лежит в свойствах скрипта (YANDEX_TOKEN), в код не вписывается.
 * Логин кабинета — YANDEX_LOGIN, нужен для запроса баланса.
 */

var YANDEX_V5 = 'https://api.direct.yandex.com/json/v5/';
var YANDEX_V4 = 'https://api.direct.yandex.com/live/v4/json/';
var YANDEX_NAME = 'Яндекс Директ';   // как площадка называется в листах

function yandexCfg_() {
  var p = PropertiesService.getScriptProperties();
  return {
    token: p.getProperty('YANDEX_TOKEN') || '',
    login: p.getProperty('YANDEX_LOGIN') || ''
  };
}

function yandexPost_(url, payload, extraHeaders) {
  var cfg = yandexCfg_();
  if (!cfg.token) throw new Error('Не задан YANDEX_TOKEN в свойствах скрипта.');

  var headers = {
    Authorization: 'Bearer ' + cfg.token,
    'Accept-Language': 'ru'
  };
  // агентствам и представителям нужен логин клиента, себе — не обязателен
  if (cfg.login) headers['Client-Login'] = cfg.login;
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
  }

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), text: res.getContentText() };
}

/**
 * Проверка связи. Показывает сырые ответы Директа —
 * по ним видно, что именно не так, если что-то не так.
 */
function yandexTest() {
  var cfg = yandexCfg_();
  if (!cfg.token) return 'Не задан YANDEX_TOKEN в свойствах скрипта.';

  var lines = ['Логин из настроек: ' + (cfg.login || 'не задан')];

  var who = yandexPost_(YANDEX_V5 + 'clients', {
    method: 'get',
    params: { FieldNames: ['Login', 'Currency', 'Type', 'AccountQuality'] }
  });
  lines.push('');
  lines.push('Кабинет (' + who.code + '): ' + who.text.slice(0, 500));

  var money = yandexPost_(YANDEX_V4, {
    method: 'AccountManagement',
    token: cfg.token,
    param: { Action: 'Get', SelectionCriteria: { Logins: [cfg.login] } }
  });
  lines.push('');
  lines.push('Баланс (' + money.code + '): ' + money.text.slice(0, 600));

  if (who.code === 401 || money.code === 401) {
    lines.push('');
    lines.push('401 — токен не принят. Проверьте, что скопирован он целиком и без пробелов.');
  }
  return lines.join('\n');
}

/** Остаток денег в Директе. Пишем в лист «Площадки». */
function yandexBalance() {
  var cfg = yandexCfg_();
  if (!cfg.token) return 'Не задан YANDEX_TOKEN в свойствах скрипта.';
  if (!cfg.login) return 'Не задан YANDEX_LOGIN — впишите логин кабинета Директа.';

  var res = yandexPost_(YANDEX_V4, {
    method: 'AccountManagement',
    token: cfg.token,
    param: { Action: 'Get', SelectionCriteria: { Logins: [cfg.login] } }
  });
  if (res.code !== 200) {
    return 'Директ не отдал баланс (' + res.code + '): ' + res.text.slice(0, 300);
  }

  var data;
  try { data = JSON.parse(res.text); } catch (e) { return 'Не разобрал ответ: ' + res.text.slice(0, 300); }
  if (data.error_str || data.error_detail) {
    return 'Ошибка Директа: ' + (data.error_str || '') + ' ' + (data.error_detail || '');
  }

  var acc = (data.data && data.data.Accounts && data.data.Accounts[0]) || null;
  if (!acc) return 'В ответе нет данных по кабинету: ' + res.text.slice(0, 300);

  var amount = Number(acc.Amount) || 0;
  writeBalance_(YANDEX_NAME, amount);
  return 'Остаток в Директе: ' + amount + ' ₽';
}

/** Общая запись остатка в лист «Площадки». */
function writeBalance_(name, amount) {
  var sh = makeSitesSheet();
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  var row = 0;
  rows.forEach(function (r, i) { if (String(r[0]).trim() === name) row = i + 2; });
  if (!row) { sh.appendRow([name, '', '']); row = sh.getLastRow(); }
  sh.getRange(row, 2).setValue(amount);
  sh.getRange(row, 3).setValue(new Date());
}

/**
 * Расходы Директа по дням за последние N дней — в лист «Расходы».
 * Даты, которые уже внесены, пропускаются, поэтому повторный запуск
 * ничего не задваивает.
 */
function yandexSpend(days) {
  days = Number(days) || 30;
  var to = new Date();
  var from = new Date(to.getTime() - days * 86400000);

  var body = {
    params: {
      SelectionCriteria: { DateFrom: ymd_(from), DateTo: ymd_(to) },
      FieldNames: ['Date', 'Cost'],
      ReportName: 'Расход ' + new Date().getTime(),
      ReportType: 'ACCOUNT_PERFORMANCE_REPORT',
      DateRangeType: 'CUSTOM_DATE',
      Format: 'TSV',
      IncludeVAT: 'YES',
      IncludeDiscount: 'NO'
    }
  };
  var res = yandexPost_(YANDEX_V5 + 'reports', body, {
    processingMode: 'auto',
    returnMoneyInMicros: 'false',
    skipReportHeader: 'true',
    skipColumnHeader: 'false',
    skipReportSummary: 'true'
  });

  if (res.code === 201 || res.code === 202) {
    return 'Директ готовит отчёт. Подождите минуту и запустите ещё раз.';
  }
  if (res.code !== 200) {
    return 'Отчёт не получен (' + res.code + '): ' + res.text.slice(0, 400);
  }

  var lines = res.text.split('\n').filter(String);
  if (lines.length < 2) return 'За этот период расходов нет.';

  var head = lines[0].split('\t');
  var iDate = head.indexOf('Date'), iCost = head.indexOf('Cost');
  if (iDate === -1 || iCost === -1) return 'Неожиданные колонки в отчёте: ' + lines[0];

  var sh = makeSpendSheet();
  var have = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (String(r[1]).trim() !== YANDEX_NAME) return;
      var d = (r[0] instanceof Date) ? r[0] : parseDate_(r[0]);
      if (d) have[ymd_(d)] = true;
    });
  }

  var add = [], skipped = 0, total = 0;
  for (var i = 1; i < lines.length; i++) {
    var c = lines[i].split('\t');
    var day = String(c[iDate] || '').trim();
    var cost = Number(String(c[iCost] || '').replace(',', '.')) || 0;
    if (!day || !cost) continue;
    if (have[day]) { skipped++; continue; }
    add.push([new Date(day + 'T12:00:00'), YANDEX_NAME, cost, 'Директ, загружено автоматически']);
    total += cost;
  }

  if (!add.length) return 'Новых дней с расходами нет.\nПропущено уже внесённых: ' + skipped;

  sh.getRange(sh.getLastRow() + 1, 1, add.length, 4).setValues(add);
  return 'Добавлено дней: ' + add.length + '\nСумма: ' + Math.round(total) + ' ₽' +
         '\nПропущено уже внесённых: ' + skipped;
}

function ymd_(d) {
  return Utilities.formatDate(d, 'Europe/Moscow', 'yyyy-MM-dd');
}

/** Раз в сутки: обновить остаток и подтянуть расходы за последнюю неделю. */
function yandexDaily() {
  try { yandexBalance(); } catch (e) {}
  try { yandexSpend(7); } catch (e) {}
}

function yandexAuto(on) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'yandexDaily') ScriptApp.deleteTrigger(t);
  });
  if (!on) return 'Автообновление по Директу выключено.';
  ScriptApp.newTrigger('yandexDaily').timeBased().atHour(8).everyDays(1).create();
  return 'Готово: каждое утро остаток и расходы по Директу будут обновляться сами.';
}
