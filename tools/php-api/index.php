<?php
/**
 * কেয়ারির মন্তব্য ও পড়ার-সংখ্যা সার্ভার (PHP + MySQL) — নিজের হোস্টিং-এ চলে, Cloudflare লাগে না।
 * Cloudflare Worker (tools/comments-worker.js)-এর হুবহু একই API: /comments, /view, /views, /admin/comments
 * সেটআপ: SETUP-bn.txt দেখুন।
 */
declare(strict_types=1);
mb_internal_encoding('UTF-8');
$cfg = require __DIR__ . '/config.php';

const MAX_TEXT = 2000;
const MAX_NAME = 60;
const PER_HOUR = 5;

// ---------- CORS ----------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_values(array_filter(array_map(fn($o) => rtrim(trim($o), '/'), explode(',', (string)($cfg['allowed_origins'] ?? '')))));
if (!$allowed) {
    header('Access-Control-Allow-Origin: *');
} elseif ($origin && in_array(rtrim($origin, '/'), $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: content-type, authorization');
header('Access-Control-Max-Age: 86400');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

function out($data, int $status = 200, string $cache = 'no-store'): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: ' . $cache);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function safe_id($s): string { return mb_substr((string)preg_replace('/[^\w-]/', '_', (string)$s), 0, 80); }
function body(): array { $j = json_decode((string)file_get_contents('php://input'), true); return is_array($j) ? $j : []; }
function now_ms(): int { return (int)round(microtime(true) * 1000); }

// ---------- ডেটাবেস ----------
try {
    $pdo = new PDO('mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4', $cfg['db_user'], $cfg['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
} catch (Throwable $e) {
    out(['error' => 'ডেটাবেসে সংযোগ হয়নি — config.php-র তথ্য দেখুন'], 500);
}

$pdo->exec("CREATE TABLE IF NOT EXISTS keyari_comments (
  id VARCHAR(40) NOT NULL PRIMARY KEY, post VARCHAR(80) NOT NULL, title VARCHAR(200) NOT NULL DEFAULT '', url VARCHAR(400) NOT NULL DEFAULT '',
  name VARCHAR(80) NOT NULL DEFAULT '', text TEXT NOT NULL, ts BIGINT NOT NULL, status CHAR(1) NOT NULL DEFAULT 'p',
  reply TEXT NULL, reply_ts BIGINT NOT NULL DEFAULT 0, KEY k_post (post, status, ts), KEY k_ts (ts)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS keyari_views (
  post VARCHAR(80) NOT NULL PRIMARY KEY, n INT NOT NULL DEFAULT 0, base INT NOT NULL DEFAULT 0
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS keyari_rl (
  k VARCHAR(64) NOT NULL PRIMARY KEY, n INT NOT NULL DEFAULT 0, exp INT NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

function rl_get(PDO $pdo, string $k): int {
    $s = $pdo->prepare('SELECT n FROM keyari_rl WHERE k=? AND exp>?');
    $s->execute([$k, time()]);
    $r = $s->fetch();
    return $r ? (int)$r['n'] : 0;
}
function rl_inc(PDO $pdo, string $k, int $ttl): void {
    // মেয়াদ শেষ হলে নতুন করে ১ থেকে শুরু; নইলে ১ বাড়ে
    $now = time();
    $pdo->prepare('INSERT INTO keyari_rl (k,n,exp) VALUES (?,1,?) ON DUPLICATE KEY UPDATE n=IF(exp>?,n+1,1), exp=IF(exp>?,exp,?)')
        ->execute([$k, $now + $ttl, $now, $now, $now + $ttl]);
    if (mt_rand(1, 50) === 1) { $pdo->prepare('DELETE FROM keyari_rl WHERE exp<?')->execute([$now]); }
}
function client_hash(array $cfg, string $extra = ''): string {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'x';
    return substr(hash('sha256', ($cfg['salt'] ?? 'keyari') . '|' . $ip . '|' . $extra), 0, 24);
}
function is_admin(array $cfg): bool {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$h && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') { $h = $v; } }
    }
    $t = (string)($cfg['admin_token'] ?? '');
    return $t !== '' && hash_equals('Bearer ' . $t, (string)$h);
}

// ---------- রাউটিং ----------
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($base !== '' && strpos($path, $base) === 0) { $path = substr($path, strlen($base)); }
$path = '/' . trim((string)preg_replace('#^/index\.php#', '', $path), '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// পাঠক: অনুমোদিত মন্তব্য
if ($path === '/comments' && $method === 'GET') {
    $post = safe_id($_GET['post'] ?? '');
    if (!$post) out(['comments' => []]);
    $s = $pdo->prepare("SELECT id,name,text,ts,reply,reply_ts FROM keyari_comments WHERE post=? AND status='a' ORDER BY ts ASC");
    $s->execute([$post]);
    out(['comments' => array_map(fn($c) => [
        'id' => $c['id'], 'name' => $c['name'], 'text' => $c['text'], 'ts' => (int)$c['ts'],
        'reply' => (string)$c['reply'], 'reply_ts' => (int)$c['reply_ts'],
    ], $s->fetchAll())]);
}

// পাঠক: নতুন মন্তব্য (অপেক্ষমাণ হয়ে জমা হয়)
if ($path === '/comments' && $method === 'POST') {
    $b = body();
    if (!empty($b['website'])) out(['ok' => true, 'id' => 'x', 'status' => 'pending']); // স্প্যাম-ফাঁদ
    $post = safe_id($b['post'] ?? '');
    $text = trim((string)($b['text'] ?? ''));
    $name = mb_substr(trim((string)($b['name'] ?? '')), 0, MAX_NAME);
    if (!$post) out(['error' => 'লেখা চেনা যায়নি'], 400);
    if ($name === '') out(['error' => 'আপনার নাম লিখুন'], 400);
    if (mb_strlen($text) < 2) out(['error' => 'মন্তব্য খুব ছোট'], 400);
    if (mb_strlen($text) > MAX_TEXT) out(['error' => 'মন্তব্য ' . MAX_TEXT . ' অক্ষরের মধ্যে রাখুন'], 400);
    if (preg_match_all('#https?://#i', $text) > 2) out(['error' => 'একসাথে অনেক লিংক দেওয়া যাবে না'], 400);
    $rk = 'r:' . client_hash($cfg);
    if (rl_get($pdo, $rk) >= PER_HOUR) out(['error' => 'অনেকগুলো মন্তব্য পাঠানো হয়েছে, একটু পরে আবার চেষ্টা করুন'], 429);
    rl_inc($pdo, $rk, 3600);
    $ts = now_ms();
    $id = base_convert((string)$ts, 10, 36) . substr(bin2hex(random_bytes(4)), 0, 5);
    $pdo->prepare("INSERT INTO keyari_comments (id,post,title,url,name,text,ts,status) VALUES (?,?,?,?,?,?,?,'p')")
        ->execute([$id, $post, mb_substr((string)($b['title'] ?? ''), 0, 200), mb_substr((string)($b['url'] ?? ''), 0, 400), $name, $text, $ts]);
    out(['ok' => true, 'id' => $id, 'status' => 'pending']);
}

// পড়ার সংখ্যা (একই আইপি থেকে একই লেখা ৩০ মিনিটে একবার)
if ($path === '/view' && $method === 'POST') {
    $post = safe_id(body()['post'] ?? '');
    if (!$post) out(['error' => 'লেখা চেনা যায়নি'], 400);
    $rk = 'v:' . client_hash($cfg, $post);
    if (rl_get($pdo, $rk) > 0) out(['ok' => true, 'counted' => false]);
    rl_inc($pdo, $rk, 1800);
    $pdo->prepare('INSERT INTO keyari_views (post,n) VALUES (?,1) ON DUPLICATE KEY UPDATE n=n+1')->execute([$post]);
    out(['ok' => true, 'counted' => true]);
}
if ($path === '/views' && $method === 'GET') {
    $views = [];
    foreach ($pdo->query('SELECT post, n+base AS t FROM keyari_views') as $r) { $views[$r['post']] = (int)$r['t']; }
    out(['views' => (object)$views], 200, 'public, max-age=120');
}

// অ্যাডমিন
if (strpos($path, '/admin/') === 0) {
    if (!is_admin($cfg)) out(['error' => 'অনুমতি নেই'], 401);

    if ($path === '/admin/comments' && $method === 'GET') {
        $status = $_GET['status'] ?? 'all';
        $cnt = ['p' => 0, 'a' => 0];
        foreach ($pdo->query('SELECT status, COUNT(*) c FROM keyari_comments GROUP BY status') as $r) { $cnt[$r['status']] = (int)$r['c']; }
        $where = ($status === 'p' || $status === 'a') ? ' WHERE status=' . $pdo->quote($status) : '';
        $rows = $pdo->query('SELECT * FROM keyari_comments' . $where . ' ORDER BY ts DESC LIMIT 200')->fetchAll();
        $items = array_map(fn($c) => [
            'id' => $c['id'], 'post' => $c['post'], 'title' => $c['title'], 'url' => $c['url'], 'name' => $c['name'], 'text' => $c['text'],
            'ts' => (int)$c['ts'], 'reply' => (string)$c['reply'], 'reply_ts' => (int)$c['reply_ts'],
            'key' => 'c:' . $c['post'] . ':' . $c['id'], 'status' => $c['status'] === 'a' ? 'approved' : 'pending',
        ], $rows);
        out(['comments' => $items, 'counts' => ['pending' => $cnt['p'], 'approved' => $cnt['a']]]);
    }

    if ($path === '/admin/comments' && $method === 'POST') {
        $b = body();
        $parts = explode(':', (string)($b['key'] ?? ''), 3);
        if (count($parts) !== 3 || $parts[0] !== 'c') out(['error' => 'ভুল কী'], 400);
        $s = $pdo->prepare('SELECT * FROM keyari_comments WHERE id=? AND post=?');
        $s->execute([$parts[2], $parts[1]]);
        $c = $s->fetch();
        if (!$c) out(['error' => 'মন্তব্যটি পাওয়া যায়নি'], 404);
        $act = $b['action'] ?? '';
        if ($act === 'delete') { $pdo->prepare('DELETE FROM keyari_comments WHERE id=?')->execute([$c['id']]); out(['ok' => true]); }
        $st = $c['status']; $text = $c['text']; $reply = (string)$c['reply']; $rts = (int)$c['reply_ts'];
        if ($act === 'approve') $st = 'a';
        if ($act === 'unapprove') $st = 'p';
        if (isset($b['reply']) && is_string($b['reply'])) { $reply = mb_substr(trim($b['reply']), 0, MAX_TEXT); $rts = $reply !== '' ? now_ms() : 0; }
        if (isset($b['text']) && is_string($b['text']) && trim($b['text']) !== '') { $text = mb_substr(trim($b['text']), 0, MAX_TEXT); }
        $pdo->prepare('UPDATE keyari_comments SET status=?, text=?, reply=?, reply_ts=? WHERE id=?')->execute([$st, $text, $reply, $rts, $c['id']]);
        out(['ok' => true, 'status' => $st === 'a' ? 'approved' : 'pending']);
    }
}

if ($path === '/' || $path === '/health') out(['ok' => true, 'service' => 'keyari-comments-php']);
out(['error' => 'পাওয়া যায়নি'], 404);
