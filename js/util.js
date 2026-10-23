import { CONFIG } from './config.js';

export const TZ = 'Asia/Jakarta';
export const S = {            // state bersama
  db: null, user: null, role: 'viewer',
  kategori: [], olt: new Map(), gangguan: [], foto: [],
  putaran: null, gcu: new Map(),   // hostname -> tanggal (putaran aktif)
};

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (n) => Number(n || 0).toLocaleString('id-ID');
export const pct = (a, b) => (b ? (a / b * 100) : 0);

// ---------- waktu WIB ----------
const fDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fHour = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
export const wibDate = (iso) => fDate.format(new Date(iso));                 // YYYY-MM-DD
export const wibHour = (iso) => +fHour.format(new Date(iso));
export const todayWib = () => wibDate(new Date().toISOString());
export const dayStart = (d) => new Date(d + 'T00:00:00+07:00').toISOString();
export const addDays = (d, n) => wibDate(new Date(Date.parse(d + 'T12:00:00+07:00') + n * 864e5).toISOString());
export const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const BULAN_P = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export function fmtDT(iso, withDate = true) {
  if (!iso) return '–';
  const p = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t)?.value;
  return withDate ? `${g('day')}/${g('month')} ${g('hour')}.${g('minute')}` : `${g('hour')}.${g('minute')}`;
}
export function fmtTanggalPanjang(d) {
  const dt = new Date(d + 'T12:00:00+07:00');
  return `${HARI[dt.getUTCDay()]}, ${+d.slice(8)} ${BULAN_P[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
}
export function lamaMenit(r) {
  return r.date_up ? Math.round((Date.parse(r.date_up) - Date.parse(r.date_down)) / 6e4) : null;
}
export function fmtLama(m, short = false) {
  if (m == null) return '–';
  if (m >= 1440 && short) return `${Math.floor(m / 1440)} hari`;
  const j = Math.floor(m / 60), mm = m % 60;
  if (short) return j ? `${j} j ${mm} m` : `${mm} m`;
  return j ? `${j} Jam${mm ? ' ' + mm + ' Menit' : ''}` : `${mm} Menit`;
}
export const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// hari kerja: Senin–Jumat, bukan tanggal merah
export const isWorkday = (d) => { const w = new Date(d + 'T12:00:00+07:00').getUTCDay(); return w !== 0 && w !== 6 && !CONFIG.HARI_LIBUR.includes(d); };
export function addWorkdays(d, n) { let x = d; while (n > 0) { x = addDays(x, 1); if (isWorkday(x)) n--; } return x; }
export function workdaysBetween(from, to) { let n = 0, x = from; while (x <= to) { if (isWorkday(x)) n++; x = addDays(x, 1); } return n; }

// ---------- UI kecil ----------
export function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), ms);
}
export function openDrawer(title, html) {
  $('#drawer-title').textContent = title;
  $('#drawer-body').innerHTML = html;
  $('#drawer').hidden = false;
}
export const closeDrawer = () => ($('#drawer').hidden = true);

export function countBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r) || '(kosong)'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ambil semua baris (Supabase membatasi 1000 per permintaan)
export async function fetchAll(table, select = '*', build = (q) => q) {
  const out = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await build(S.db.from(table).select(select)).range(from, from + step - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < step) break;
  }
  return out;
}
export const isAdmin = () => S.role === 'admin';
