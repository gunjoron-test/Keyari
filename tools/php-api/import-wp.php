<?php
/**
 * ওয়ার্ডপ্রেসের মন্তব্য ও পড়ার সংখ্যা → কেয়ারির নতুন টেবিলে আনা (একই ডেটাবেসে থাকা ওয়ার্ডপ্রেস থেকে)।
 *
 * ব্যবহার (ব্রাউজারে):
 *   যাচাই (কিছু বদলায় না):  https://আপনার-সাইট/keyari-api/import-wp.php?key=আমদানির-কী
 *   সত্যিই আনা:               https://আপনার-সাইট/keyari-api/import-wp.php?key=আমদানির-কী&go=1
 * যতবার খুশি চালানো যায় — একই মন্তব্য দুবার ঢোকে না, পড়ার সংখ্যা বসে "পুরোনো ভিত্তি" হিসেবে (নতুন সাইটের গণনা তার ওপর যোগ হয়)।
 * কাজ শেষে এই ফাইল মুছে ফেলবেন।
 */
declare(strict_types=1);
header('Content-Type: text/plain; charset=utf-8');
mb_internal_encoding('UTF-8');
$cfg = require __DIR__ . '/config.php';
if (!isset($_GET['key']) || !hash_equals((string)($cfg['import_key'] ?? ''), (string)$_GET['key']) || ($cfg['import_key'] ?? '') === '') { http_response_code(403); exit("অনুমতি নেই\n"); }
$go = isset($_GET['go']);
$px = preg_replace('/[^A-Za-z0-9_]/', '', (string)($cfg['wp_prefix'] ?? 'wp_'));

$pdo = new PDO('mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4', $cfg['db_user'], $cfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
// টেবিল নিশ্চিত করা (index.php-র মতোই)
$pdo->exec("CREATE TABLE IF NOT EXISTS keyari_comments (id VARCHAR(40) NOT NULL PRIMARY KEY, post VARCHAR(80) NOT NULL, title VARCHAR(200) NOT NULL DEFAULT '', url VARCHAR(400) NOT NULL DEFAULT '', name VARCHAR(80) NOT NULL DEFAULT '', text TEXT NOT NULL, ts BIGINT NOT NULL, status CHAR(1) NOT NULL DEFAULT 'p', reply TEXT NULL, reply_ts BIGINT NOT NULL DEFAULT 0, KEY k_post (post, status, ts), KEY k_ts (ts)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS keyari_views (post VARCHAR(80) NOT NULL PRIMARY KEY, n INT NOT NULL DEFAULT 0, base INT NOT NULL DEFAULT 0) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

echo $go ? "== সত্যিই আনা হচ্ছে ==\n\n" : "== যাচাই (কিছু বদলানো হচ্ছে না; সত্যিই আনতে শেষে &go=1 যোগ করুন) ==\n\n";

// ---------- মন্তব্য ----------
$rows = $pdo->query("SELECT c.comment_ID, c.comment_post_ID, c.comment_author, c.comment_content, c.comment_date_gmt, c.comment_parent, c.user_id, p.post_title, p.post_status
  FROM {$px}comments c JOIN {$px}posts p ON p.ID = c.comment_post_ID
  WHERE c.comment_approved = '1' AND c.comment_type IN ('', 'comment') AND p.post_type = 'post'
  ORDER BY c.comment_date_gmt ASC")->fetchAll();
$byId = [];
foreach ($rows as $r) { $byId[(int)$r['comment_ID']] = $r; }
$nC = 0; $nR = 0;
$ins = $pdo->prepare("INSERT INTO keyari_comments (id,post,title,url,name,text,ts,status,reply,reply_ts) VALUES (?,?,?,?,?,?,?, 'a', ?, ?) ON DUPLICATE KEY UPDATE reply=VALUES(reply), reply_ts=VALUES(reply_ts)");
$replies = [];
foreach ($rows as $r) {   // সম্পাদকের (লগইন-করা ব্যবহারকারীর) উত্তর → মূল মন্তব্যের "উত্তর" ঘরে
    $pid = (int)$r['comment_parent'];
    if ($pid && (int)$r['user_id'] > 0 && isset($byId[$pid])) { $replies[$pid] = $r; }
}
foreach ($rows as $r) {
    $id = (int)$r['comment_ID'];
    $pid = (int)$r['comment_parent'];
    if ($pid && (int)$r['user_id'] > 0 && isset($byId[$pid])) { $nR++; continue; }   // উত্তর হিসেবে বসেছে
    $post = 'wp-' . $r['comment_post_ID'];
    $ts = (int)(strtotime($r['comment_date_gmt'] . ' UTC') * 1000);
    $text = trim(html_entity_decode(strip_tags((string)$r['comment_content']), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($pid && isset($byId[$pid])) { $text = '@' . $byId[$pid]['comment_author'] . ' ' . $text; }
    $rep = $replies[$id] ?? null;
    $repText = $rep ? trim(html_entity_decode(strip_tags((string)$rep['comment_content']), ENT_QUOTES | ENT_HTML5, 'UTF-8')) : null;
    $repTs = $rep ? (int)(strtotime($rep['comment_date_gmt'] . ' UTC') * 1000) : 0;
    if ($go) {
        $ins->execute(['wp' . $id, safe($post), mb_substr((string)$r['post_title'], 0, 200), '', mb_substr(trim((string)$r['comment_author']) ?: 'পাঠক', 0, 60), $text, $ts, $repText, $repTs]);
    }
    $nC++;
}
function safe(string $s): string { return mb_substr((string)preg_replace('/[^\w-]/', '_', $s), 0, 80); }
echo "মন্তব্য: {$nC}টি আনা হবে/হয়েছে (এর মধ্যে সম্পাদকের উত্তর {$nR}টি মূল মন্তব্যের সঙ্গে জোড়া)\n\n";

// ---------- পড়ার সংখ্যা ----------
$views = [];
$found = [];
foreach (['views', 'post_views_count', '_post_views_count', 'wpb_post_views_count', 'hits', 'post_views', '_views', 'pageviews'] as $key) {
    $q = $pdo->prepare("SELECT post_id, meta_value FROM {$px}postmeta WHERE meta_key = ?");
    $q->execute([$key]);
    $cnt = 0;
    foreach ($q->fetchAll() as $m) { $v = (int)$m['meta_value']; if ($v > 0) { $views['wp-' . $m['post_id']] = max($views['wp-' . $m['post_id']] ?? 0, $v); $cnt++; } }
    if ($cnt) { $found[] = "postmeta '{$key}' থেকে {$cnt}টি লেখা"; }
}
try {   // "Post Views Counter" প্লাগিনের নিজস্ব টেবিল (type 4 = মোট)
    $t = $pdo->query("SELECT id, SUM(count) c FROM {$px}post_views WHERE period = 'total' AND type = 4 GROUP BY id")->fetchAll();
    $cnt = 0;
    foreach ($t as $m) { $v = (int)$m['c']; if ($v > 0) { $views['wp-' . $m['id']] = max($views['wp-' . $m['id']] ?? 0, $v); $cnt++; } }
    if ($cnt) { $found[] = "{$px}post_views টেবিল থেকে {$cnt}টি লেখা"; }
} catch (Throwable $e) { /* টেবিল নেই */ }

if (!$views) {
    echo "পড়ার সংখ্যা: ওয়ার্ডপ্রেসে পরিচিত কোনো ভিউ-প্লাগিনের তথ্য পাওয়া যায়নি।\n";
    echo "(ভিউ-প্লাগিন ব্যবহার না করলে সংখ্যা ওয়ার্ডপ্রেসে ছিলই না — তখন নতুন সাইট থেকেই গোনা শুরু হবে। অন্য প্লাগিন হলে তার নাম জানান।)\n";
} else {
    echo "পড়ার সংখ্যা পাওয়া গেছে: " . implode('; ', $found) . "\n";
    arsort($views);
    $i = 0;
    foreach ($views as $k => $v) { if ($i++ < 5) { echo "  সর্বোচ্চ: {$k} → {$v}\n"; } }
    if ($go) {
        $u = $pdo->prepare('INSERT INTO keyari_views (post, base) VALUES (?, ?) ON DUPLICATE KEY UPDATE base = VALUES(base)');
        foreach ($views as $k => $v) { $u->execute([safe($k), $v]); }
    }
    echo count($views) . "টি লেখার সংখ্যা " . ($go ? "বসানো হয়েছে" : "বসানো হবে") . "।\n";
}
echo $go ? "\nশেষ। কাজ হয়ে গেলে এই import-wp.php ফাইল মুছে ফেলুন।\n" : "\nসব ঠিক দেখালে ঠিকানার শেষে &go=1 যোগ করে আবার খুলুন।\n";
