/**
 * ГК Сфера — вторая часть кода CRM: аналитика и Авито.
 * Лежит отдельным файлом, чтобы вставлять по частям.
 * Работает вместе с Код.gs — функции видят друг друга.
 */
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
    reasons:  [], sources: [], utm: [], managers: [], ads: [],
    adsTotal: { balance: 0, spend: 0, leads: 0, deals: 0, revenue: 0, cpl: 0, cpa: 0, romi: null },
    area:     { inWork: 0, avg: 0, perM2: 0, perM2Deals: 0 },
    spendKnown: false
  };
  if (!sh || sh.getLastRow() < 2) return out;

  var from = (range && range.from) ? new Date(range.from + 'T00:00:00') : null;
  var to   = (range && range.to)   ? new Date(range.to   + 'T23:59:59') : null;
  var now = new Date();

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();

  // выбранные каналы: пустой список — считаем по всем
  var pick = null;
  if (range && range.sources && range.sources.length) {
    pick = {};
    range.sources.forEach(function (x) { pick[String(x)] = true; });
  }

  var bySource = {}, byUtm = {}, byManager = {}, byReason = {}, byPlatform = {};
  var m2Money = 0, m2Area = 0;
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
    if (pick && !pick[String(o['Источник'] || '')]) return;

    var platform = platformOf_(o);
    if (range && range.platform && platform !== range.platform) return;

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

    // ---- площадь и цена метра
    var area = areaOf_(o['Площадь, м²']);
    if (area) { areaSum += area; areaN++; }
    if (area && !isDeal && !isLost) out.area.inWork += area;

    // среднюю цену метра считаем только там, где заполнены и сумма, и площадь
    if (area && money) { m2Money += money; m2Area += area; out.area.perM2Deals++; }

    function bump(box, key) {
      var b = box[key] || (box[key] = { key: key, leads: 0, deals: 0, revenue: 0, lost: 0 });
      b.leads++;
      if (isDeal) { b.deals++; b.revenue += money; }
      if (isLost) b.lost++;
    }
    bump(bySource, srcKey);
    bump(byUtm, utmKey);
    bump(byManager, manKey);
    bump(byPlatform, platform);
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
  if (m2Area)            out.area.perM2 = Math.round(m2Money / m2Area);

  // ---- дни недели и часы
  var dowNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  var order = [1, 2, 3, 4, 5, 6, 0];
  order.forEach(function (d) { out.dow.push({ label: dowNames[d], n: dow[d] }); });
  for (var k = 0; k < 24; k++) out.hours.push({ label: (k < 10 ? '0' : '') + k, n: hours[k] });

  out.reasons = Object.keys(byReason).map(function (k) { return { reason: k, n: byReason[k] }; })
                  .sort(function (a, b) { return b.n - a.n; });

  // ---- расходы на рекламу
  var spend = spendBySource_(from, to, pick);
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

  // ---- рекламные площадки: остаток, расход, цена заявки
  var balances = adBalances_();
  var spendPlat = spendByPlatform_(from, to);
  var seen = {};
  Object.keys(byPlatform).forEach(function (k) { seen[k] = true; });
  Object.keys(spendPlat.by).forEach(function (k) { seen[k] = true; });
  Object.keys(balances).forEach(function (k) { seen[k] = true; });

  out.ads = Object.keys(seen).map(function (name) {
    var b = byPlatform[name] || { leads: 0, deals: 0, revenue: 0 };
    var sp = spendPlat.by[name] || 0;
    return {
      platform: name,
      balance: balances[name] === undefined ? null : balances[name],
      spend: sp,
      leads: b.leads, deals: b.deals, revenue: b.revenue,
      cpl: (sp && b.leads) ? Math.round(sp / b.leads) : 0,
      cpa: (sp && b.deals) ? Math.round(sp / b.deals) : 0,
      romi: sp ? Math.round((b.revenue - sp) / sp * 100) : null
    };
  }).sort(function (a, b) { return b.spend - a.spend || b.leads - a.leads; });

  var at = out.adsTotal;
  out.ads.forEach(function (r) {
    at.spend += r.spend; at.leads += r.leads; at.deals += r.deals; at.revenue += r.revenue;
    if (r.balance) at.balance += r.balance;
  });
  at.cpl = (at.spend && at.leads) ? Math.round(at.spend / at.leads) : 0;
  at.cpa = (at.spend && at.deals) ? Math.round(at.spend / at.deals) : 0;
  at.romi = at.spend ? Math.round((at.revenue - at.spend) / at.spend * 100) : null;

  out.sources = pack(bySource, true);
  out.utm = pack(byUtm, false);
  out.managers = pack(byManager, false);
  out.spendTotal = spend.total;
  out.romiTotal = spend.total ? Math.round((out.totals.revenue - spend.total) / spend.total * 100) : null;
  out.cplTotal = (spend.total && out.totals.leads) ? Math.round(spend.total / out.totals.leads) : 0;

  return out;
}

/** К какой рекламной площадке относится заявка. */
function platformOf_(o) {
  var utm = String(o['utm_source'] || '').toLowerCase();
  var src = String(o['Источник'] || '');
  for (var i = 0; i < PLATFORMS.length; i++) {
    var p = PLATFORMS[i];
    if (utm && p.utm.indexOf(utm) !== -1) return p.name;
    if (p.sources.indexOf(src) !== -1) return p.name;
  }
  return 'Другое';
}

/** Траты за период по площадкам. Старые строки с названием источника тоже поймём. */
function spendByPlatform_(from, to) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SPEND);
  var res = { by: {}, total: 0 };
  if (!sh || sh.getLastRow() < 2) return res;

  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    var d = (r[0] instanceof Date) ? r[0] : parseDate_(r[0]);
    if (!d) return;
    if (from && d < from) return;
    if (to && d > to) return;
    var sum = Number(r[2]) || 0;
    if (!sum) return;

    var label = String(r[1] || 'Другое');
    var name = 'Другое';
    for (var i = 0; i < PLATFORMS.length; i++) {
      if (PLATFORMS[i].name === label || PLATFORMS[i].sources.indexOf(label) !== -1) {
        name = PLATFORMS[i].name; break;
      }
    }
    res.by[name] = (res.by[name] || 0) + sum;
    res.total += sum;
  });
  return res;
}

/** Остатки на площадках: лист «Площадки» плюс живой баланс Авито. */
function adBalances_() {
  var out = {};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SITES);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var name = String(r[0] || '').trim();
      if (!name) return;
      var v = Number(r[1]);
      if (v) out[name] = v;
    });
  }
  return out;
}

/**
 * Площадь из ячейки. Встречается «800», «800 м2», «500-1000» —
 * из диапазона берём середину, из мусора — ноль.
 */
function areaOf_(v) {
  var s = String(v == null ? '' : v).replace(',', '.');
  var nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return 0;
  if (nums.length >= 2 && s.indexOf('-') !== -1) {
    return (Number(nums[0]) + Number(nums[1])) / 2;
  }
  return Number(nums[0]) || 0;
}

/** Рекламные траты за период, разложенные по источникам. */
function spendBySource_(from, to, pick) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SPEND);
  var res = { by: {}, total: 0 };
  if (!sh || sh.getLastRow() < 2) return res;

  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    var d = (r[0] instanceof Date) ? r[0] : parseDate_(r[0]);
    if (!d) return;
    if (from && d < from) return;
    if (to && d > to) return;
    var src = String(r[1] || 'без источника');
    if (pick && !pick[src]) return;
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

function avitoPost_(path, payload, extraHeaders) {
  var headers = { Authorization: 'Bearer ' + avitoToken_() };
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
  }
  var res = UrlFetchApp.fetch('https://api.avito.ru' + path, {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), text: res.getContentText() };
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
/** Общая часть: тянем список переписок и лист уже обработанных чатов. */
function avitoChats_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var self = avitoGet_('/core/v1/accounts/self');
  if (self.code !== 200) throw new Error('Авито не отдал профиль (' + self.code + '): ' + self.text.slice(0, 300));

  var accountId = String(JSON.parse(self.text).id || '');
  if (!accountId) throw new Error('В ответе Авито нет id аккаунта.');

  var res = avitoGet_('/messenger/v2/accounts/' + accountId + '/chats?limit=100');
  if (res.code !== 200) {
    throw new Error('Переписка недоступна (' + res.code + '): ' + res.text.slice(0, 300));
  }
  var list = [];
  try { list = JSON.parse(res.text).chats || []; }
  catch (e) { throw new Error('Не разобрал ответ Авито: ' + res.text.slice(0, 300)); }

  var sh = ss.getSheetByName(SHEET_AVITO);
  if (!sh) {
    sh = ss.insertSheet(SHEET_AVITO);
    sh.getRange(1, 1, 1, 4).setValues([['Чат', 'Заявка', 'Клиент', 'Перенесён']])
      .setFontWeight('bold').setBackground('#0f1820').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  var seen = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
      .forEach(function (r) { seen[String(r[0])] = true; });
  }
  return { accountId: accountId, list: list, sheet: sh, seen: seen };
}

/** Кто написал, о чём и по какому объявлению. */
function avitoChatInfo_(chat, accountId) {
  var name = '';
  (chat.users || []).forEach(function (u) {
    if (String(u.id) !== String(accountId) && !name) name = String(u.name || '');
  });
  var text = '', about = '';
  try { text = String(chat.last_message.content.text || ''); } catch (e) {}
  try { about = String(chat.context.value.title || ''); } catch (e) {}
  return { name: name, text: text, about: about };
}

/**
 * Помечает все нынешние переписки как обработанные, не заводя заявок.
 * Нужно один раз перед включением автосбора, чтобы старая переписка
 * не улетела в CRM пачкой.
 */
function avitoMarkSeen() {
  var d;
  try { d = avitoChats_(); } catch (e) { return 'Не получилось: ' + e.message; }

  var rows = [];
  d.list.forEach(function (chat) {
    var id = String(chat.id || '');
    if (!id || d.seen[id]) return;
    var info = avitoChatInfo_(chat, d.accountId);
    rows.push([id, '— старая переписка', info.name, new Date()]);
  });
  if (rows.length) d.sheet.getRange(d.sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);

  return 'Помечено как старые: ' + rows.length + '\nТеперь в CRM попадут только новые обращения.';
}

/**
 * Забирает новые обращения из мессенджера Авито и заводит их заявками.
 * Уже перенесённый чат второй раз не заводится.
 */
function avitoPull() {
  var d;
  try { d = avitoChats_(); } catch (e) { return 'Не получилось: ' + e.message; }

  try { avitoBalance(); } catch (e) {}   // заодно держим остаток свежим

  var fresh = d.list.filter(function (chat) {
    var id = String(chat.id || '');
    return id && !d.seen[id];
  });
  if (!fresh.length) return 'Новых обращений с Авито нет.';

  // при разовом наплыве не заваливаем Telegram — шлём одно письмо итогом
  var quiet = fresh.length > 5;
  var names = [];

  fresh.forEach(function (chat) {
    var info = avitoChatInfo_(chat, d.accountId);
    var lead = saveLeadRow_({
      'Источник': 'Авито',
      'Имя': info.name || 'Клиент с Авито',
      'Телефон': '',
      'Комментарий клиента': info.text,
      'Интересует': info.about,
      'Файлы': 'https://www.avito.ru/profile/messenger/channel/' + chat.id,
      'utm_source': 'avito'
    });
    d.sheet.appendRow([String(chat.id), lead['ID'], info.name, new Date()]);
    names.push(info.name || 'без имени');
    if (!quiet) notifyTelegram_(leadToTelegram_(lead));
  });

  if (quiet) {
    notifyTelegram_('<b>Авито: перенесено обращений — ' + fresh.length + '</b>\n' +
                    names.join(', '));
  }
  return 'Перенесено обращений: ' + fresh.length;
}

/**
 * Остаток денег на Авито. Пишем его в лист «Площадки», чтобы аналитика
 * показывала свежую цифру даже когда API недоступен.
 */
function avitoBalance() {
  var self = avitoGet_('/core/v1/accounts/self');
  if (self.code !== 200) return 'Авито не отдал профиль (' + self.code + ').';
  var id = String(JSON.parse(self.text).id || '');

  var res = avitoGet_('/core/v1/accounts/' + id + '/balance/');
  if (res.code !== 200) {
    return 'Авито не отдал баланс (' + res.code + '): ' + res.text.slice(0, 200) +
           '\nВпишите остаток вручную на листе «Площадки».';
  }

  var data;
  try { data = JSON.parse(res.text); } catch (e) { return 'Не разобрал ответ: ' + res.text.slice(0, 200); }
  var real = Number(data.real || 0);
  var bonus = Number(data.bonus || 0);

  if (real + bonus > 0) {
    writeBalance_('Авито', real + bonus);
    return 'Остаток на Авито: ' + (real + bonus) + ' ₽' +
           (bonus ? ' (из них бонусов ' + bonus + ')' : '');
  }

  // ноль — либо кошелёк пуст, либо деньги лежат на счёте продвижения.
  // Показываем оба ответа целиком, чтобы понять, откуда брать сумму.
  var cpa = avitoPost_('/cpa/v3/balanceInfo', {}, { 'X-Source': 'gksphere-crm' });
  return 'Кошелёк вернул ноль.' +
         '\n\nОтвет кошелька (' + res.code + '): ' + res.text.slice(0, 300) +
         '\n\nСчёт продвижения (' + cpa.code + '): ' + cpa.text.slice(0, 300) +
         '\n\nЕсли обе суммы нулевые — на счетах Авито действительно пусто, ' +
         'и остаток можно вписать вручную на листе «Площадки».';
}

/** Автосбор Авито раз в 10 минут. */
function avitoAuto(on) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'avitoPull') ScriptApp.deleteTrigger(t);
  });
  if (!on) return 'Автосбор с Авито выключен.';
  ScriptApp.newTrigger('avitoPull').timeBased().everyMinutes(10).create();
  return 'Автосбор включён: раз в 10 минут новые обращения с Авито будут ' +
         'сами появляться в CRM и в Telegram.';
}
