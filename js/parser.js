// Membaca teks yang di-paste Danil. Mengenali 2 format:
//  A. Tabel dari portal operator (dipisah TAB, bisa terpecah ke beberapa baris)
//  B. Notifikasi Telegram "OLT Recovery" / "OLT Down"
// Hasil: array objek { hostname, vendor, tipe, area, regional, district,
//                      penyebab, date_down, date_up, lama_teks, sumber }
// Semua waktu dianggap WIB (UTC+7) dan dikembalikan sebagai ISO string.

const RE_DATETIME = /(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/g;
const RE_HOST = /\bGPON[0-9A-Z]*-[A-Z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+\b/;
const RE_CAUSE = /^\s*(\[[A-Z ]+\]\s*[A-Z0-9 /]+|OLT IDLE\s*\/\s*RELOKASI)\s*$/i;
const VENDORS = ['HUAWEI', 'ZTE', 'FIBERHOME', 'NOKIA', 'ALU'];

export function wibToIso(y, mo, d, h, mi, s) {
  const ms = Date.UTC(+y, +mo - 1, +d, +h - 7, +mi, +(s || 0));
  return new Date(ms).toISOString();
}

function allDates(text) {
  const out = [];
  for (const m of text.matchAll(RE_DATETIME)) out.push(wibToIso(m[1], m[2], m[3], m[4], m[5], m[6]));
  return out;
}

export function lamaTeks(downIso, upIso) {
  if (!downIso || !upIso) return '';
  const menit = Math.round((Date.parse(upIso) - Date.parse(downIso)) / 60000);
  if (menit < 0) return '';
  const j = Math.floor(menit / 60), m = menit % 60;
  if (j && m) return `${j} Jam ${m} Menit`;
  if (j) return `${j} Jam`;
  return `${m} Menit`;
}

// ---------- Format B: Telegram ----------
function parseTelegram(text) {
  const blocks = text.split(/(?=Node ID\s*:)/i).filter((b) => /Node ID\s*:/i.test(b));
  return blocks.map((b) => {
    const field = (name) => {
      const m = b.match(new RegExp(name + '\\s*:\\s*(.+)', 'i'));
      return m ? m[1].trim() : '';
    };
    const dd = allDates(field('Down At'));
    const du = allDates(field('Recovered At'));
    const status = field('Status').toUpperCase();
    return {
      hostname: field('Node ID').split(/\s+/)[0],
      vendor: '', tipe: '',
      area: field('Area'),
      regional: field('Region'),
      district: field('District').replace(/\s+/g, '').toUpperCase(),
      penyebab: '',
      date_down: dd[0] || null,
      date_up: status === 'DOWN' ? null : (du[0] || null),
      lama_teks: field('Down Duration'),
      sumber: 'telegram',
    };
  }).filter((r) => r.hostname && r.date_down);
}

// ---------- Format A: tabel portal operator ----------
// Tiap record dimulai di baris yang memuat hostname GPON...; semua baris
// sampai hostname berikutnya dianggap satu record.
function parsePortal(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const records = [];
  let cur = null;
  for (const line of lines) {
    if (RE_HOST.test(line)) { if (cur) records.push(cur); cur = [line]; }
    else if (cur) cur.push(line);
  }
  if (cur) records.push(cur);

  return records.map((recLines) => {
    const first = recLines[0];
    const joined = recLines.join('\n');
    const cells = first.split('\t').map((c) => c.trim());
    const hostIdx = cells.findIndex((c) => RE_HOST.test(c));
    const hostCell = cells[hostIdx] || '';
    const hostname = hostCell.match(RE_HOST)[0];

    // vendor bisa menempel di sel hostname ("GPON... HUAWEI") atau di sel sesudahnya
    let rest = hostCell.replace(hostname, '').trim();
    let after = cells.slice(hostIdx + 1).filter(Boolean);
    let vendor = '', tipe = '';
    const isVendor = (s) => VENDORS.includes((s || '').toUpperCase());
    if (rest && isVendor(rest.split(/\s+/)[0])) {
      vendor = rest.split(/\s+/)[0].toUpperCase();
      tipe = rest.split(/\s+/).slice(1).join(' ') || after.shift() || '';
    } else if (isVendor(after[0])) {
      vendor = after.shift().toUpperCase();
      tipe = after.shift() || '';
    } else {
      tipe = after.shift() || '';
    }

    const before = cells.slice(0, hostIdx);
    const [area = '', regional = '', district = ''] = before.length >= 3 ? before.slice(-3) : ['', '', before[before.length - 1] || ''];

    let penyebab = '';
    for (const l of recLines.slice(1).concat(cells)) {
      const m = (l || '').match(RE_CAUSE);
      if (m) { penyebab = m[1].replace(/\s+/g, ' ').trim().toUpperCase(); break; }
    }

    const dates = allDates(joined);
    const lamaM = joined.match(/(\d+\s*Jam(?:\s*\d+\s*Menit)?|\d+\s*Menit)/i);
    return {
      hostname, vendor, tipe: tipe.trim(),
      area, regional, district: district.replace(/\s+/g, '').toUpperCase(),
      penyebab,
      date_down: dates[0] || null,
      date_up: dates[1] || null,
      lama_teks: lamaM ? lamaM[1].replace(/\s+/g, ' ') : '',
      sumber: 'web',
    };
  }).filter((r) => r.date_down);
}

export function parsePaste(text) {
  if (!text || !text.trim()) return [];
  const RE_TG = /(?:[^\n]*Notifikasi[^\n]*\n\s*)?Node ID\s*:[\s\S]*?(?:Down Duration\s*:[^\n]*|(?=Node ID\s*:)|$)/gi;
  const tgText = (text.match(RE_TG) || []).join('\n');
  const rows = tgText ? parseTelegram(tgText) : [];
  // bagian di luar notifikasi dibaca sebagai format tabel portal operator
  const portal = parsePortal(text.replace(RE_TG, '\n'));
  const all = [...portal, ...rows];
  // buang duplikat di dalam satu paste (hostname + date_down)
  const seen = new Map();
  for (const r of all) {
    const k = r.hostname + '|' + r.date_down;
    const prev = seen.get(k);
    seen.set(k, prev ? { ...prev, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) } : r);
  }
  return [...seen.values()];
}
