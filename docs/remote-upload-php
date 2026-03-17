# WAMM Remote Media Upload (cPanel / PHP)

Put this file at:

- `/home/wearethe/public_html/music/upload.php`

And create a secret token in your server env or hardcoded config.

## 1) `upload.php`

```php
<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-WAMM-TOKEN');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  echo json_encode(['ok' => true]);
  exit;
}

function json_response(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

function clean_segment($value, string $fallback = 'item'): string {
  $value = strtolower(trim((string)$value));
  $value = preg_replace('/[^a-z0-9._-]+/', '-', $value);
  $value = preg_replace('/-{2,}/', '-', $value);
  $value = trim((string)$value, '-.');
  return $value !== '' ? $value : $fallback;
}

function clean_filename($value, string $fallback = 'file.bin'): string {
  $name = basename((string)$value);
  if ($name === '' || $name === '.' || $name === '..') {
    $name = $fallback;
  }
  $ext = pathinfo($name, PATHINFO_EXTENSION);
  $stem = pathinfo($name, PATHINFO_FILENAME);
  $stem = clean_segment($stem, 'file');
  $ext = preg_replace('/[^a-zA-Z0-9]/', '', (string)$ext);
  return $ext ? ($stem . '.' . strtolower($ext)) : $stem;
}

function ini_bytes(string $value): int {
  $value = trim($value);
  if ($value === '') return 0;
  $unit = strtolower(substr($value, -1));
  $num = (float)$value;
  switch ($unit) {
    case 'g': return (int)($num * 1024 * 1024 * 1024);
    case 'm': return (int)($num * 1024 * 1024);
    case 'k': return (int)($num * 1024);
    default:  return (int)$num;
  }
}

$debug = [
  'contentLength'      => isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : null,
  'upload_max_filesize'=> ini_get('upload_max_filesize'),
  'post_max_size'      => ini_get('post_max_size'),
  'memory_limit'       => ini_get('memory_limit'),
  'max_file_uploads'   => ini_get('max_file_uploads'),
  'upload_tmp_dir'     => ini_get('upload_tmp_dir'),
  'sys_temp_dir'       => sys_get_temp_dir(),
  'php_sapi'           => PHP_SAPI,
];

$expectedToken = 'TOKEN-BURAYA';
$incomingToken = $_SERVER['HTTP_X_WAMM_TOKEN'] ?? '';

if (!$incomingToken || !hash_equals($expectedToken, $incomingToken)) {
  json_response(401, ['message' => 'Unauthorized']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_response(405, ['message' => 'Method not allowed']);
}

// Eğer Content-Length post_max_size'i geçiyorsa PHP çoğu zaman $_FILES'i boş bırakır
$postMaxBytes = ini_bytes((string)ini_get('post_max_size'));
if ($postMaxBytes > 0 && isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > $postMaxBytes) {
  json_response(400, [
    'message' => 'Request exceeds post_max_size',
    'debug'   => $debug,
  ]);
}

$uploadErrorMap = [
  UPLOAD_ERR_OK         => 'OK',
  UPLOAD_ERR_INI_SIZE   => 'UPLOAD_ERR_INI_SIZE',
  UPLOAD_ERR_FORM_SIZE  => 'UPLOAD_ERR_FORM_SIZE',
  UPLOAD_ERR_PARTIAL    => 'UPLOAD_ERR_PARTIAL',
  UPLOAD_ERR_NO_FILE    => 'UPLOAD_ERR_NO_FILE',
  UPLOAD_ERR_NO_TMP_DIR => 'UPLOAD_ERR_NO_TMP_DIR',
  UPLOAD_ERR_CANT_WRITE => 'UPLOAD_ERR_CANT_WRITE',
  UPLOAD_ERR_EXTENSION  => 'UPLOAD_ERR_EXTENSION',
];

if (!isset($_FILES['file'])) {
  json_response(400, [
    'message' => 'File is required',
    'debug'   => $debug,
  ]);
}

$file = $_FILES['file'];
if (!isset($file['error']) || (int)$file['error'] !== UPLOAD_ERR_OK) {
  json_response(400, [
    'message'         => 'Upload failed',
    'uploadErrorCode' => isset($file['error']) ? (int)$file['error'] : null,
    'uploadError'     => $uploadErrorMap[(int)($file['error'] ?? -1)] ?? 'UNKNOWN',
    'debug'           => array_merge($debug, [
      'fileName' => $file['name'] ?? null,
      'fileSize' => isset($file['size']) ? (int)$file['size'] : null,
    ]),
  ]);
}

$artistSlug     = clean_segment($_POST['artistSlug'] ?? 'artist', 'artist');
$releaseSlug    = clean_segment($_POST['releaseSlug'] ?? 'single', 'single');
$trackSlug      = clean_segment($_POST['trackSlug'] ?? 'track', 'track');
$kind           = clean_segment($_POST['kind'] ?? 'asset', 'asset');
$targetFileName = clean_filename($_POST['targetFileName'] ?? ($file['name'] ?? 'file.bin'), 'file.bin');

$baseDir = __DIR__ . '/artists/' . $artistSlug;

switch ($kind) {
  case 'artist-avatar':
  case 'artist-banner':
    $targetDir = $baseDir . '/profile';
    break;
  case 'release-cover':
    $targetDir = $baseDir . '/releases/' . $releaseSlug . '/covers';
    break;
  case 'track-cover':
    $targetDir = $baseDir . '/releases/' . $releaseSlug . '/tracks/' . $trackSlug . '/covers';
    break;
  case 'track-audio':
  default:
    $targetDir = $baseDir . '/releases/' . $releaseSlug . '/tracks/' . $trackSlug;
    break;
}

if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true)) {
  json_response(500, [
    'message' => 'Failed to create target directory',
    'debug'   => ['targetDir' => $targetDir],
  ]);
}

$targetPath = $targetDir . '/' . $targetFileName;

if (!is_uploaded_file($file['tmp_name'])) {
  json_response(400, [
    'message' => 'Invalid uploaded file',
    'debug'   => ['tmp_name' => $file['tmp_name'] ?? null],
  ]);
}

if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
  json_response(500, [
    'message' => 'Failed to move uploaded file',
    'debug'   => [
      'tmp_name'   => $file['tmp_name'] ?? null,
      'targetPath' => $targetPath,
    ],
  ]);
}

@chmod($targetPath, 0644);

// URL üretimi
$relativePath = ltrim(str_replace(__DIR__, '', $targetPath), '/\\');
$relativePath = str_replace('\\', '/', $relativePath);
$url = 'https://wearetheartmakers.com/music/' . $relativePath;

json_response(200, [
  'ok'   => true,
  'path' => $relativePath,
  'url'  => $url,
]);
```

## 2) Optional `.htaccess` in `/public_html/music/`

```apache
<IfModule mod_headers.c>
  Header set Access-Control-Allow-Origin "*"
  Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
  Header set Access-Control-Allow-Headers "Content-Type, X-WAMM-TOKEN"
</IfModule>

RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=200,L]
```

## 3) Railway env vars

Set these variables on service `wamm-web-gh`:

- `REMOTE_MEDIA_UPLOAD_URL=https://wearetheartmakers.com/music/upload.php`
- `REMOTE_MEDIA_PUBLIC_BASE_URL=https://wearetheartmakers.com/music`
- `REMOTE_MEDIA_TOKEN=CHANGE_THIS_TO_LONG_RANDOM_TOKEN`

After this, artist uploads from Studio are copied to your cPanel storage automatically and streamed from `wearetheartmakers.com`.
