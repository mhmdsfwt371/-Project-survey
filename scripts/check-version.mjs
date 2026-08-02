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

function docxVer(f){
  try {
    const xml = execSync(`unzip -p ${f} word/document.xml`, { encoding: 'utf8' });
    const m = xml.match(/(V\d+\.\d+)/);
    if (!m) { fail.push(`${f}: لا يحمل رقم نسخة`); return null; }
    return m[1];
  } catch { fail.push(`${f}: تعذّرت قراءته`); return null; }
}
const docx   = docxVer('docs/nusuk-guide.docx');
const manual = docxVer('docs/nusuk-user-manual.docx');

const want = app;
const seen = { 'sw.js': cache && 'V' + cache, 'docs/api-schema.json': schema,
               'docs/system.md': sysmd, 'docs/nusuk-guide.docx': docx,
               'docs/nusuk-user-manual.docx': manual };
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

/* ── حارس النطاقات: يمنع تكرار خطأ isOwner (V7.0) ────────────────
   كل <script> نطاق مستقل. دالة معرّفة في كتلة ومُستدعاة في أخرى
   بلا window. تنفجر وقت التشغيل فقط — لا يمسكها node --check.     */
{
  const src = readFileSync('index.html', 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  const blocks = []; let m;
  while ((m = re.exec(src))) blocks.push({ a: m.index, b: re.lastIndex, code: m[2] });
  const isLib = c => c.length > 50000 && c.length / (c.split('\n').length) > 400;
  const lib = new Set(blocks.map((x, i) => (isLib(x.code) ? i : -1)).filter(i => i >= 0));
  const blk = p => { for (let i = 0; i < blocks.length; i++) if (p >= blocks[i].a && p < blocks[i].b) return i; return null; };

  const defs = new Map();
  for (const d of src.matchAll(/\bfunction\s+([A-Za-z_]\w{3,})\s*\(/g)) {
    const i = blk(d.index); if (i === null || lib.has(i)) continue;
    if (!defs.has(d[1])) defs.set(d[1], new Set());
    defs.get(d[1]).add(i);
  }
  const leaks = [];
  for (const [name, where] of defs) {
    if (where.size > 1) continue;
    const home = [...where][0];
    const rx = new RegExp('(?<![\\w.$])' + name + '\\s*\\(', 'g');
    for (const u of src.matchAll(rx)) {
      const i = blk(u.index); if (i === null || lib.has(i) || i === home) continue;
      const pre = src.slice(Math.max(0, u.index - 9), u.index);
      if (pre.includes('window.') || pre.includes('function ')) continue;
      leaks.push(`${name}() معرّفة في كتلة ${home} ومُستدعاة في ${i}`);
      break;
    }
  }
  if (leaks.length) {
    for (const l of leaks) fail.push(`مرجع عابر للنطاق — ${l} — صدّرها بـ window.`);
  } else ok.push('لا مراجع عابرة بين كتل السكربت ✓');
}

ok.forEach(x => console.log('✓', x));
if (fail.length) { fail.forEach(x => console.error('✗', x)); process.exit(1); }
console.log('\nالتوثيق متطابق مع التطبيق ✅');
