# WAMM Remote Media Upload (cPanel / PHP)

Put this file at:

- `/home/wearethe/public_html/music/upload.php`

And create a secret token in your server env or hardcoded config.

## 1) `upload.php`

```php
<?php
header('Content-Type: application/json; charset=utf-8');

$expectedToken = 'CHANGE_THIS_TO_LONG_RANDOM_TOKEN';
$incomingToken = $_SERVER['HTTP_X_WAMM_TOKEN'] ?? '';
if (!$incomingToken || !hash_equals($expectedToken, $incomingToken)) {
  http_response_code(401);
  echo json_encode(['message' => 'Unauthorized']);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['message' => 'Method not allowed']);
  exit;
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
  http_response_code(400);
  echo json_encode(['message' => 'File is required']);
  exit;
}

function clean_segment($value, $fallback = 'item') {
  $value = strtolower(trim((string)$value));
  $value = preg_replace('/[^a-z0-9._-]+/', '-', $value);
  $value = preg_replace('/-{2,}/', '-', $value);
  $value = trim($value, '-.');
  return $value ?: $fallback;
}

function clean_filename($value, $fallback = 'file.bin') {
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

$artistSlug = clean_segment($_POST['artistSlug'] ?? 'artist', 'artist');
$releaseSlug = clean_segment($_POST['releaseSlug'] ?? 'single', 'single');
$trackSlug = clean_segment($_POST['trackSlug'] ?? 'track', 'track');
$kind = clean_segment($_POST['kind'] ?? 'asset', 'asset');
$targetFileName = clean_filename($_POST['targetFileName'] ?? $_FILES['file']['name'], 'file.bin');

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
  http_response_code(500);
  echo json_encode(['message' => 'Failed to create target directory']);
  exit;
}

$targetPath = $targetDir . '/' . $targetFileName;
if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
  http_response_code(500);
  echo json_encode(['message' => 'Failed to move uploaded file']);
  exit;
}

@chmod($targetPath, 0644);

$relativePath = 'artists/' . $artistSlug;
$relativeTail = str_replace(realpath(__DIR__ . '/artists/' . $artistSlug), '', realpath(dirname($targetPath)) ?: dirname($targetPath));
$relativeTail = str_replace('\\', '/', $relativeTail);
$relativeTail = ltrim($relativeTail, '/');
if ($relativeTail !== '') {
  $relativePath .= '/' . $relativeTail;
}
$relativePath .= '/' . $targetFileName;

$url = 'https://wearetheartmakers.com/music/' . $relativePath;

echo json_encode([
  'ok' => true,
  'path' => $relativePath,
  'url' => $url,
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
