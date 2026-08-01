// مزامنة سجل الأجهزة من نظام العميل → Firestore: settings/devices
// يخرج بهدوء إن لم تُضبط الأسرار بعد (لا يُفشل سير العمل)
import admin from 'firebase-admin';

const val = (k) => String(process.env[k] || '').trim();

const URL = val('DEVICES_API_URL');
const SA  = val('FIREBASE_SERVICE_ACCOUNT');
if (!URL || !SA) {
  console.log('devices sync: لم يُضبط بعد (DEVICES_API_URL أو مفتاح فايربيس) — تخطٍ بدون خطأ');
  process.exit(0);
}

const TOKEN  = val('DEVICES_API_TOKEN');
const HDR    = val('DEVICES_AUTH_HEADER') || 'Authorization';
const rawPre = val('DEVICES_AUTH_PREFIX');
const PREFIX = rawPre ? (rawPre.toLowerCase() === 'none' ? '' : rawPre + ' ') : 'Bearer ';
const JPATH  = val('DEVICES_JSON_PATH');
const F_SER  = val('DEVICES_FIELD_SERIAL') || 'serial';
const F_NAME = val('DEVICES_FIELD_NAME')   || 'name';
const FILTER = val('DEVICES_NAME_FILTER');

const headers = { Accept: 'application/json' };
if (TOKEN) headers[HDR] = PREFIX + TOKEN;

const res = await fetch(URL, { headers });
if (!res.ok) {
  console.error('فشل الطلب:', res.status, (await res.text().catch(() => '')).slice(0, 300));
  process.exit(1);
}

let data = await res.json();
if (JPATH) for (const k of JPATH.split('.')) data = data?.[k];
if (!Array.isArray(data)) {
  console.error('الاستجابة ليست مصفوفة — اضبط DEVICES_JSON_PATH (مثال: data.items)');
  process.exit(1);
}

const seen = new Set();
const list = [];
for (const it of data) {
  const s = String(it?.[F_SER] ?? '').trim();
  const n = String(it?.[F_NAME] ?? '').trim();
  if (!s || seen.has(s)) continue;
  if (FILTER && !(s + ' ' + n).toLowerCase().includes(FILTER.toLowerCase())) continue;
  seen.add(s);
  list.push({ s, n });
}

if (!list.length) {
  console.error('لم يُقرأ أي جهاز — راجع أسماء الحقول أو الفلتر');
  process.exit(1);
}
if (list.length > 8000) {
  console.error('العدد أكبر من الحد الآمن لمستند واحد (٨٠٠٠) — ضيّق الفلتر');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const at = new Date().toISOString().slice(0, 16).replace('T', ' ');
await admin.firestore().collection('settings').doc('devices')
  .set({ list, n: list.length, at, src: 'api' });

console.log('تمت مزامنة', list.length, 'جهاز');
