/* =====================================================================
   tools/serve.mjs — سرور محلیِ توسعه (صفر وابستگی)
   اجرای:  npm start        یا:      node tools/serve.mjs
   پورت:   متغیر محیطی PORT (پیش‌فرض ۸۰۸۰)

   هدرهای کش با سیاست vercel.json هم‌خوان‌اند تا رفتار دیپلوی روی ورسل
   همین‌جا قابل بررسی باشد: صفحه و sw.js همیشه تازه، بقیه‌ی استاتیک
   با عمر کوتاه. هیچ مسیر بیرونی سرو نمی‌شود و «..» خنثی است.

   پیش‌نمایش زنده (iframe): هدر X-Frame-Options محیط توسعه را از جاسازی
   در iframe منع می‌کند. برای دیدن پیش‌نمایش داخل iframe، سرور را با
   `ALLOW_IFRAME=1 node tools/serve.mjs` اجرا کنید. رفتار پیش‌فرض
   (DENY، هم‌خوان با vercel.json) عوض نمی‌شود.
   ===================================================================== */
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};
/* هم‌خوان با vercel.json: صفحه و Service Worker هرگز کهنه سرو نمی‌شوند. */
const NO_CACHE = new Set(['/index.html', '/sw.js', '/']);
const cacheFor = p => NO_CACHE.has(p)
  ? 'public, max-age=0, must-revalidate'
  : 'public, max-age=300, stale-while-revalidate=3600';

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  /* پیش‌نمایش داخل iframe فقط با opt-in صریح؛ روی ورسل همیشه DENY است. */
  ...(process.env.ALLOW_IFRAME === '1' ? {} : {'X-Frame-Options': 'DENY'}),
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=()'
};

createServer(async (req, res) => {
  try {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400); return res.end('bad request'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

    let file = normalize(join(ROOT, path));
    /* فرار از ریشه ممنوع */
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403); return res.end(); }

    let s = await stat(file).catch(() => null);
    if (s && s.isDirectory()) { file = join(file, 'index.html'); s = await stat(file).catch(() => null); }
    if (!s || !s.isFile()) { res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}); return res.end('404 — ' + path); }

    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': cacheFor(path === '/' ? '/' : path),
      ...SECURITY
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    res.writeHead(500); res.end('500');
  }
}).listen(PORT, HOST, () => {
  console.log(`🪙 کریپتوبین →  http://localhost:${PORT}  (ریشه: ${ROOT})`);
});
