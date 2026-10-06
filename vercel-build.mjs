/* =====================================================================
   vercel-build.mjs — «بیلد» پروژه‌ی استاتیک کریپتوبین: دروازه‌ی دیپلوی

   این پروژه بیلد واقعی ندارد (HTML/CSS/JS خام سرو می‌شود)، اما ورسل باید
   یک Build Command داشته باشد تا:
     ۱) اگر Framework Preset داشبورد اشتباه انتخاب شده باشد (مثلاً Vite که
        دنبال `npm run build` و پوشه‌ی `dist` می‌گردد)، دیپلوی نشکند؛
     ۲) پیش از انتشار، سلامت پوسته (فایل‌ها، نحو JS، قفل‌های vercel.json،
        ترتیب اسکریپت‌ها و هم‌خوانی CSP) بررسی شود و درخت خراب دیپلوی نشود.

   محدودیت مهم: این فایل روی ورسل اجرا می‌شود، جایی که محتوای .vercelignore
   (یعنی tests/ و tools/) وجود ندارد. پس فقط به فایل‌های ریشه تکیه می‌کند
   و فقط از ماژول‌های داخلی Node استفاده می‌کند (بدون هیچ وابستگی).

   اجرای محلی (پیش‌پرواز دیپلوی):  npm run build
   ===================================================================== */
import {readFileSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const rf = p => readFileSync(join(ROOT, p), 'utf8');
const fail = m => { console.error('❌ دروازه‌ی دیپلوی: ' + m); process.exit(1); };
const ok = m => console.log('✅ ' + m);

/* ۱) همه‌ی فایل‌های ضروریِ پوسته باید موجود و غیرخالی باشند. */
const REQUIRED = [
  'index.html', 'app.js', 'analytics.js', 'market-data.js', 'short-engine.js',
  'indicator-worker.js', 'style.css', 'sw.js', 'robots.txt',
  'vercel.json', 'package.json', 'vercel-build.mjs'
];
for(const f of REQUIRED){
  let s;
  try{ s = statSync(join(ROOT, f)); }
  catch{ fail(`فایل ضروری «${f}» در ریشه‌ی دیپلوی نیست (Root Directory ورسل باید ریشه‌ی مخزن باشد)`); }
  if(!s.isFile() || s.size === 0) fail(`فایل ضروری «${f}» خالی است`);
}
ok(`${REQUIRED.length} فایل ضروری موجود و غیرخالی‌اند`);

/* ۲) نحو همه‌ی جاوااسکریپت‌ها باید سالم باشد — وگرنه صفحه‌ی دیپلوی‌شده
   سفید می‌ماند. (node --check هیچ کدی را اجرا نمی‌کند.) */
const SCRIPTS = ['app.js', 'analytics.js', 'market-data.js', 'short-engine.js', 'indicator-worker.js', 'vercel-build.mjs'];
for(const f of SCRIPTS){
  const r = spawnSync(process.execPath, ['--check', join(ROOT, f)], {encoding: 'utf8'});
  if(r.status !== 0) fail(`خطای نحوی در ${f}: ${(r.stderr || r.stdout || '').trim().split('\n')[0]}`);
}
ok('نحو هر ۶ فایل جاوااسکریپت سالم است (node --check)');

/* ۳) vercel.json باید معتبر باشد و پین‌های بیلد + قفل‌های کش را داشته باشد. */
let vercel;
try{ vercel = JSON.parse(rf('vercel.json')); }
catch{ fail('vercel.json معتبر نیست (JSON خراب)'); }
if(vercel.buildCommand !== 'npm run build') fail('vercel.json باید buildCommand را روی «npm run build» پین کند');
if(vercel.outputDirectory !== '.') fail('vercel.json باید outputDirectory را روی «.» (ریشه) پین کند');
if(vercel.installCommand !== 'npm install') fail('vercel.json باید installCommand را روی «npm install» پین کند');
const noCache = src => {
  const b = (vercel.headers || []).find(h => h.source === src);
  const cc = b && b.headers.find(h => h.key === 'Cache-Control');
  if(!cc || !/max-age=0/.test(cc.value)) fail(`${src} باید بدون کش بلند سرو شود`);
};
noCache('/sw.js'); noCache('/index.html');
if(!(vercel.headers || []).some(h => h.source === '/(.*)' && h.headers.some(x => x.key === 'Strict-Transport-Security')))
  fail('HSTS باید روی همه‌ی مسیرها فعال باشد');
ok('vercel.json معتبر است: پین‌های بیلد + قفل‌های کش و HSTS برقرارند');

/* ۴) همه‌ی اسکریپت‌ها باید با defer و پیش از app.js بارگذاری شوند، وگرنه
   نسخه‌ی دیپلوی‌شده با «X is not defined» می‌خوابد. */
const html = rf('index.html');
for(const f of ['analytics.js', 'market-data.js', 'short-engine.js']){
  if(!html.includes(`script src="${f}" defer`)) fail(`«${f}» با defer بارگذاری نمی‌شود`);
  if(!(html.indexOf(f) < html.indexOf('app.js'))) fail(`«${f}» باید پیش از app.js بارگذاری شود`);
}
if(!html.includes('script src="app.js" defer')) fail('app.js با defer بارگذاری نمی‌شود');
if(/\\sonclick=/i.test(html)) fail('هندلر inline در HTML ممنوع است');
ok('ترتیب و defer هر ۴ اسکریپت در index.html درست است');

/* ۵) پوسته‌ی Service Worker باید دقیقاً همان فایل‌هایی را کش کند که صفحه
   لازم دارد، وگرنه نسخه‌ی آفلاین/کش‌شده ناقص می‌ماند. */
const sw = rf('sw.js');
const shellMatch = sw.match(/SHELL=\[([^\]]+)\]/);
if(!shellMatch) fail('فهرست SHELL در sw.js پیدا نشد');
for(const f of ['./', './index.html', './style.css', './analytics.js', './market-data.js', './short-engine.js', './app.js', './indicator-worker.js']){
  if(!shellMatch[1].includes(`'${f}'`)) fail(`«${f}» در فهرست SHELL پوسته نیست`);
}
if(!/cryptobin-shell-v\d+/.test(sw)) fail('نسخه‌ی پوسته در sw.js پیدا نیست');
ok('فهرست SHELL در sw.js کامل است');

/* ۶) هر دامنه‌ای که کد واقعاً fetch می‌کند باید در connect-src باشد (وگرنه
   CSP بی‌صدا درخواست را می‌کُشد و سایتِ دیپلوی‌شده «خطا در اتصال» می‌دهد)
   و هیچ دامنه‌ی بی‌مصرفی هم نباید بماند. */
{
  const app = rf('app.js');
  const csp = (html.match(/connect-src([^;"]+)/) || [])[1] || '';
  const allowed = [...new Set([...csp.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]))].sort();
  const used = new Set();
  const apiHost = app.match(/const API\s*=\s*'https:\/\/([a-z0-9.-]+)/);
  if(apiHost) used.add(apiHost[1]);
  [...app.matchAll(/getJSON\('https:\/\/([a-z0-9.-]+)/g)].forEach(m => used.add(m[1]));
  const usedArr = [...used].sort();
  if(JSON.stringify(allowed) !== JSON.stringify(usedArr))
    fail(`connect-src با دامنه‌های واقعی فراخوان هم‌خوان نیست (مجاز: ${allowed.join(',') || '—'} / مصرفی: ${usedArr.join(',') || '—'})`);
  if(/connect-src[^;"]*\*/.test(html)) fail('wildcard در connect-src مجاز نیست');
}
ok('connect-src دقیقاً همان دامنه‌هایی است که کد فراخوانی می‌کند');

console.log('🎉 دروازه‌ی دیپلوی سبز شد — درخت برای انتشار روی ورسل سالم است');
