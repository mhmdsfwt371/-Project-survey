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
let total = 0; const report = [];

for (const col of cols) {
  if (col.id === 'photos') {
    // الصور ضخمة — تُحصى فقط هنا، وأرشفتها الكاملة مرحلة لاحقة
    const c = (await col.count().get()).data().count;
    report.push(`photos: ${c} (count only)`);
    continue;
  }
  const snap = await col.get();
  const docs = {};
  snap.forEach(d => { docs[d.id] = d.data(); });
  writeFileSync(`${out}/${col.id}.json`, JSON.stringify(docs, iso, 1));
  total += snap.size;
  report.push(`${col.id}: ${snap.size}`);
}

writeFileSync(`${out}/_meta.json`, JSON.stringify(
  { at: new Date().toISOString(), collections: report, totalDocs: total }, null, 1));
console.log('backup ok —', report.join(' | '), '| total', total);
