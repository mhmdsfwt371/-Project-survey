// حارس التوثيق: يفشل إن تخلّف أي ملف عن نسخة التطبيق، أو اختلّ توازن أقسام اللوحة
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const fail = [];
const ok   = [];

function grab(file, re, what){
  let s = '';
  try { s = readFileSync(file, 'utf8'); }
  catch { fail.push(`${file}: الملف غير موجود`); return null; }
  const m = s.match(re);
  if (!m) { fail.push(`${file}: تعذّر استخراج ${what}`); return null; }
  return m[1];
}

/* ١ — رقم النسخة في كل ملف */
const app    = grab('index.html', /نسخة\s*(V\d+\.\d+)/, 'رقم النسخة من الهيدر');
const cache  = grab('sw.js', /nusuk-survey-v(\d+\.\d+)/, 'سلسلة CACHE');
const schema = grab('docs/api-schema.json', /"app_version"\s*:\s*"(V\d+\.\d+)"/, 'app_version');
const sysmd  = grab('docs/system.md', /النسخة\s*`(V\d+\.\d+)`/, 'رقم النسخة');

let docx = null;
try {
  const xml = execSync('unzip -p docs/nusuk-guide.docx word/document.xml', { encoding: 'utf8' });
  const m = xml.match(/(V\d+\.\d+)/);
  docx = m ? m[1] : null;
  if (!docx) fail.push('docs/nusuk-guide.docx: لا يحمل رقم نسخة');
} catch { fail.push('docs/nusuk-guide.docx: تعذّرت قراءته'); }

const want = app;
const seen = { 'sw.js': cache && 'V' + cache, 'docs/api-schema.json': schema,
               'docs/system.md': sysmd, 'docs/nusuk-guide.docx': docx };
if (want) {
  ok.push(`نسخة التطبيق: ${want}`);
  for (const [f, v] of Object.entries(seen)) {
    if (v === null || v === undefined) continue;
    if (v !== want) fail.push(`${f}: النسخة ${v} بينما التطبيق ${want} — حدّثه في نفس الدفعة`);
    else ok.push(`${f}: ${v} ✓`);
  }
}

/* ٢ — توازن أقسام لوحة المتابعة (قسم غير مغلق يبتلع ما بعده ويُخفيه مع التبويب) */
try {
  const s = readFileSync('index.html', 'utf8');
  const i = s.indexOf('function render(){');
  const j = s.indexOf("$i('dWrap').innerHTML=h;");
  if (i > -1 && j > i) {
    const seg = s.slice(i, j);
    const opens  = (seg.match(/<section class=\\?"dSec/g) || []).length;
    const closes = (seg.match(/<\/section>/g) || []).length;
    if (opens !== closes)
      fail.push(`أقسام اللوحة غير متوازنة: ${opens} فتح مقابل ${closes} إغلاق — قسم غير مغلق سيبتلع ما بعده ويختفي مع إخفاء التبويب`);
    else ok.push(`أقسام اللوحة متوازنة: ${opens} ✓`);
  }
} catch {}

/* ٣ — كل قسم له تبويب */
try {
  const s = readFileSync('index.html', 'utf8');
  const secs = [...new Set([...s.matchAll(/data-sec="([a-z]+)"/g)].map(m => m[1]))];
  const tabsBlock = s.slice(s.indexOf('var DTABS=['), s.indexOf('function tabOf'));
  const mapped = new Set([...tabsBlock.matchAll(/'([a-z]+)'/g)].map(m => m[1]));
  const orphan = secs.filter(x => !mapped.has(x));
  if (orphan.length) fail.push(`أقسام بلا تبويب فلن تظهر لأحد: ${orphan.join(' · ')}`);
  else ok.push(`كل الأقسام (${secs.length}) لها تبويب ✓`);
} catch {}

ok.forEach(x => console.log('✓', x));
if (fail.length) { fail.forEach(x => console.error('✗', x)); process.exit(1); }
console.log('\nالتوثيق متطابق مع التطبيق ✅');
