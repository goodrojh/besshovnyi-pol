<?php
/**
 * Приём заявок с сайта gksphere.ru
 *
 * Зачем: закон требует, чтобы персональные данные россиян первично
 * записывались в базу на территории России. Раньше заявка уходила сразу
 * в Google Apps Script, то есть первая запись была на зарубежном сервере.
 * Теперь первая запись здесь, в MySQL на хостинге, а Google получает копию.
 *
 * Настройки лежат отдельным файлом ВЫШЕ корня сайта, чтобы их нельзя было
 * скачать по прямой ссылке даже при сбое PHP.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

const CONFIG_PATH = __DIR__ . '/../gksphere-config.php';

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function logline(array $cfg, string $msg): void
{
    $file = $cfg['log_file'] ?? '';
    if (!$file) {
        return;
    }
    @file_put_contents(
        $file,
        date('Y-m-d H:i:s') . ' ' . $msg . "\n",
        FILE_APPEND | LOCK_EX
    );
}

/* ---------- Настройки ---------- */

if (!is_file(CONFIG_PATH)) {
    out(['ok' => false, 'error' => 'config missing'], 500);
}
$cfg = require CONFIG_PATH;
if (!is_array($cfg)) {
    out(['ok' => false, 'error' => 'config broken'], 500);
}

/**
 * POST на сторонний адрес. На части хостингов curl выключен,
 * поэтому есть запасной путь через потоковый контекст.
 *
 * @return array{0:string,1:int,2:string} тело, код ответа, ошибка
 */
function post_to(string $url, array $payload, int $timeout = 20): array
{
    $data = http_build_query($payload);
    $type = 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8';

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $data,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_HTTPHEADER     => [$type],
        ]);
        $body = (string) curl_exec($ch);
        $err  = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$body, $code, $err];
    }

    $ctx = stream_context_create(['http' => [
        'method'        => 'POST',
        'header'        => $type,
        'content'       => $data,
        'timeout'       => $timeout,
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    $code = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('~^HTTP/\S+\s+(\d{3})~', $h, $m)) {
            $code = (int) $m[1];
        }
    }
    return [(string) $body, $code, $body === false ? 'запрос не прошёл' : ''];
}

/* ---------- Подключение к базе ---------- */

function db(array $cfg): PDO
{
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $cfg['db_host'] ?? 'localhost',
        $cfg['db_name'] ?? ''
    );
    return new PDO($dsn, $cfg['db_user'] ?? '', $cfg['db_pass'] ?? '', [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

/* ---------- Самопроверка: /lead.php?selftest=КЛЮЧ ---------- */

if (isset($_GET['selftest'])) {
    $key = (string) ($cfg['selftest_key'] ?? '');
    if ($key === '' || !hash_equals($key, (string) $_GET['selftest'])) {
        out(['ok' => false, 'error' => 'нет доступа'], 403);
    }
    $report = ['php' => PHP_VERSION];
    try {
        $pdo = db($cfg);
        $report['база'] = 'подключение есть';
        $row = $pdo->query("SHOW TABLES LIKE 'leads'")->fetch();
        $report['таблица leads'] = $row ? 'найдена' : 'НЕ НАЙДЕНА — выполните leads.sql';
        if ($row) {
            $n = $pdo->query('SELECT COUNT(*) AS n FROM leads')->fetch();
            $report['заявок в базе'] = (int) $n['n'];
        }
    } catch (Throwable $e) {
        $report['база'] = 'ОШИБКА: ' . $e->getMessage();
    }
    $crm = $cfg['crm_url'] ?? '';
    $report['адрес CRM'] = $crm ? 'прописан' : 'НЕ ПРОПИСАН';
    if ($crm) {
        [, $code, $err] = post_to($crm, ['ping' => '1'], 10);
        $report['CRM отвечает'] = $err ? ('ОШИБКА: ' . $err) : ('код ' . $code);
    }
    $report['curl'] = function_exists('curl_init') ? 'есть' : 'нет, работаем через потоки';
    $report['запись в журнал'] = is_writable(dirname((string) ($cfg['log_file'] ?? '/')))
        ? 'возможна' : 'НЕТ ПРАВ';
    out(['ok' => true, 'проверка' => $report]);
}

/* ---------- Приём заявки ---------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    out(['ok' => false, 'error' => 'method not allowed'], 405);
}

function field(string $name, int $max = 500): string
{
    $v = $_POST[$name] ?? '';
    if (!is_string($v)) {
        return '';
    }
    $v = str_replace(["\r", "\0"], '', trim($v));
    return mb_substr($v, 0, $max, 'UTF-8');
}

// Ловушка для роботов: поле скрыто от человека и всегда должно быть пустым.
if (field('company') !== '') {
    out(['ok' => true, 'skipped' => 'bot']);
}

$name   = field('Имя', 200);
$phone  = field('Телефон', 64);
$digits = preg_replace('/\D+/', '', $phone);

if (mb_strlen($name, 'UTF-8') < 2) {
    out(['ok' => false, 'error' => 'no name'], 422);
}
if (strlen((string) $digits) < 10) {
    out(['ok' => false, 'error' => 'no phone'], 422);
}

$lead = [
    'name'         => $name,
    'phone'        => $phone,
    'phone_digits' => substr((string) $digits, -10),
    'comment'      => field('Комментарий клиента', 4000) ?: field('Комментарий', 4000),
    'interest'     => field('Интересует', 255),
    'promo'        => field('Акция', 255),
    'source'       => field('Источник', 255),
    'page'         => field('Страница входа', 500),
    'referrer'     => field('Реферер', 500),
    'utm_source'   => field('utm_source', 255),
    'utm_medium'   => field('utm_medium', 255),
    'utm_campaign' => field('utm_campaign', 255),
    'utm_content'  => field('utm_content', 255),
    'utm_term'     => field('utm_term', 255),
    'ip'           => substr((string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''), 0, 45),
    'user_agent'   => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500),
];

/* ---------- 1. Первичная запись: база на хостинге ---------- */

$leadId  = null;
$dbError = null;
try {
    $pdo = db($cfg);
    $cols = array_keys($lead);
    $sql  = 'INSERT INTO leads (created_at, ' . implode(', ', $cols) . ') VALUES (NOW(), :'
          . implode(', :', $cols) . ')';
    $st = $pdo->prepare($sql);
    $st->execute($lead);
    $leadId = (int) $pdo->lastInsertId();
} catch (Throwable $e) {
    $dbError = $e->getMessage();
    logline($cfg, 'БАЗА НЕ ПРИНЯЛА: ' . $dbError . ' | ' . json_encode($lead, JSON_UNESCAPED_UNICODE));
}

/* ---------- 2. Копия в CRM ---------- */

$crmStatus = 'skipped';
$crmAnswer = '';
$crmUrl    = (string) ($cfg['crm_url'] ?? '');

if ($crmUrl !== '') {
    $payload = [
        'token'               => (string) ($cfg['crm_token'] ?? ''),
        'Имя'                 => $lead['name'],
        'Телефон'             => $lead['phone'],
        'Комментарий клиента' => $lead['comment'],
        'Интересует'          => $lead['interest'],
        'Акция'               => $lead['promo'],
        'Источник'            => $lead['source'],
        'Страница входа'      => $lead['page'],
        'Реферер'             => $lead['referrer'],
        'utm_source'          => $lead['utm_source'],
        'utm_medium'          => $lead['utm_medium'],
        'utm_campaign'        => $lead['utm_campaign'],
        'utm_content'         => $lead['utm_content'],
        'utm_term'            => $lead['utm_term'],
    ];
    [$body, $code, $err] = post_to($crmUrl, $payload, 20);

    if ($err) {
        $crmStatus = 'error';
        $crmAnswer = 'curl: ' . $err;
    } else {
        $decoded   = json_decode((string) $body, true);
        $ok        = is_array($decoded) && !empty($decoded['ok']);
        $crmStatus = $ok ? 'ok' : 'error';
        $crmAnswer = 'код ' . $code . ' ' . mb_substr((string) $body, 0, 400, 'UTF-8');
    }
    if ($crmStatus !== 'ok') {
        logline($cfg, 'CRM НЕ ПРИНЯЛА (заявка №' . ($leadId ?? '—') . '): ' . $crmAnswer);
    }
    if ($leadId) {
        try {
            $pdo->prepare('UPDATE leads SET crm_status = ?, crm_answer = ? WHERE id = ?')
                ->execute([$crmStatus, $crmAnswer, $leadId]);
        } catch (Throwable $e) {
            logline($cfg, 'не удалось отметить статус CRM: ' . $e->getMessage());
        }
    }
}

/* ---------- Ответ сайту ----------
   Заявка считается принятой, если сработал хотя бы один канал.
   Человек не должен видеть ошибку из-за наших внутренних сбоев. */

if ($leadId === null && $crmStatus !== 'ok') {
    out(['ok' => false, 'error' => 'storage failed'], 500);
}

out(['ok' => true, 'id' => $leadId, 'crm' => $crmStatus]);
