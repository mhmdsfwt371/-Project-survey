// نسخة احتياطية يومية لكل كولكشنز Firestore → backups/latest (تاريخ git = آلة الزمن)
import admin from 'firebase-admin';
import { writeFileSync, mkdirSync } from 'fs';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const out = 'backups/latest';
mkdirSync(out, { recursive: true });

const iso = (k, v) => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : v;
const cols = await db.listCollections();
let total = 0; const report = []; const bundle = {};

for (const col of cols) {
  if (col.id === 'photos') {
    /* الصور ضخمة: تُحصى للملخّص، وتُكتب كاملة في ملف منفصل
       يرفعه drive-upload إلى درايف المالك — ولا يدخل المستودع أبدًا. */
    const snapP = await col.get();
    const ph = {};
    snapP.forEach(d => { ph[d.id] = d.data(); });
    writeFileSync('backups/photos.json', JSON.stringify(ph, iso, 0));
    report.push(`photos: ${snapP.size}`);
    continue;
  }
  const snap = await col.get();
  const docs = {};
  snap.forEach(d => { docs[d.id] = d.data(); });
  bundle[col.id] = docs;
  total += snap.size;
  report.push(`${col.id}: ${snap.size}`);
}

/* البيانات الخام لا تُكتب أبدًا كنص صريح في مستودع عام.
   تُجمَّع في حزمة واحدة يشفّرها سير العمل بمفتاح من الأسرار. */
writeFileSync(`${out}/../bundle.json`, JSON.stringify(bundle, iso, 1));

/* الملخّص وحده هو ما يُنشر صراحةً — أعداد بلا أي بيانات شخصية */
writeFileSync(`${out}/_meta.json`, JSON.stringify(
  { at: new Date().toISOString(), collections: report, totalDocs: total,
    note: 'البيانات الخام في backup.enc — مشفّرة. هذا الملف أعداد فقط.' }, null, 1));
console.log('backup ok —', report.join(' | '), '| total', total);
