/* رفع النسخة اليومية الكاملة إلى Google Drive — فولدر باسم التاريخ لكل يوم.
   يعمل داخل سير GitHub قبل خطوة التشفير، لأن نسخة الدرايف تُرفع خامًا
   إلى درايف المالك الخاص (وليس إلى المستودع العام).
   يتجاوز نفسه بهدوء إن لم تُضبط الأسرار — فلا يُفشل النسخ الاحتياطي. */
import { google } from 'googleapis';
import { readFileSync, existsSync, statSync } from 'fs';
import { Readable } from 'stream';

const SA_RAW = process.env.GDRIVE_SA || '';
const ROOT   = (process.env.GDRIVE_FOLDER || '').trim();
const KEEP   = parseInt(process.env.GDRIVE_KEEP_DAYS || '45', 10);

if (!SA_RAW || !ROOT) {
  console.log('drive-upload: GDRIVE_SA أو GDRIVE_FOLDER غير مضبوط — تخطّي الرفع');
  process.exit(0);
}

let sa;
try { sa = JSON.parse(SA_RAW); }
catch { console.log('::warning::GDRIVE_SA ليس JSON صالحًا — تخطّي الرفع'); process.exit(0); }

const auth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

const pad = n => String(n).padStart(2, '0');
const now = new Date();
const day = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;

async function folderFor(name, parent) {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents`
          + ` and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 1,
    supportsAllDrives: true, includeItemsFromAllDrives: true });
  if (found.data.files?.length) return found.data.files[0].id;
  const made = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
    fields: 'id', supportsAllDrives: true
  });
  return made.data.id;
}

async function put(localPath, name, parent) {
  if (!existsSync(localPath)) { console.log(`  – ${name}: غير موجود، تخطّي`); return; }
  const size = statSync(localPath).size;
  const body = Readable.from(readFileSync(localPath));
  await drive.files.create({
    requestBody: { name, parents: [parent] },
    media: { mimeType: 'application/json', body },
    fields: 'id', supportsAllDrives: true
  });
  console.log(`  ✓ ${name} — ${(size / 1024 / 1024).toFixed(2)} م.ب`);
}

/* حذف الفولدرات الأقدم من KEEP يومًا — حتى لا يمتلئ الدرايف */
async function prune(parent) {
  if (!(KEEP > 0)) return;
  const cut = new Date(Date.now() - KEEP * 86400000);
  const res = await drive.files.list({
    q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)', pageSize: 400,
    supportsAllDrives: true, includeItemsFromAllDrives: true
  });
  let n = 0;
  for (const f of res.data.files || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.name)) continue;      /* لا نلمس إلا فولدرات التواريخ */
    if (new Date(f.name + 'T00:00:00Z') >= cut) continue;
    try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); n++; } catch {}
  }
  if (n) console.log(`  🧹 حُذف ${n} فولدر أقدم من ${KEEP} يومًا`);
}

try {
  const dayFolder = await folderFor(day, ROOT);
  console.log(`drive-upload: فولدر ${day}`);
  await put('backups/bundle.json',      'backup-full.json',  dayFolder);
  await put('backups/photos.json',      'photos.json',       dayFolder);
  await put('backups/latest/_meta.json', '_meta.json',       dayFolder);
  await prune(ROOT);
  console.log('drive-upload: تم ✓');
} catch (e) {
  /* لا نُفشل النسخ الاحتياطي بسبب الدرايف — نُبلّغ ونكمل */
  console.log('::warning::drive-upload فشل — ' + (e?.message || e));
}
