import { CONFIG } from './config.js';
import {
  S, $, $$, esc, num, pct, todayWib, dayStart, addDays, wibDate, wibHour, fmtDT, fmtLama, lamaMenit, median,
  countBy, toast, openDrawer, closeDrawer, isAdmin, BULAN, fmtTanggalPanjang, addWorkdays,
} from './util.js';
import { parsePaste } from './parser.js';
import { exportJpg, exportPdf } from './report.js';
import { clockWidget, startClock, loadData, rerender } from './app.js';

const pretty = (d) => d || '–';
const ADA_FOTO = () => !!CONFIG.FOTO_ENDPOINT;

// =====================================================================
// DASHBOARD
// =====================================================================
let periode = 'tahun';
function rowsPeriode() {
  const t = todayWib();
  if (periode === 'hari') return S.gangguan.filter((g) => wibDate(g.date_down) === t);
  if (periode === 'bulan') return S.gangguan.filter((g) => wibDate(g.date_down).slice(0, 7) === t.slice(0, 7));
  return S.gangguan.filter((g) => wibDate(g.date_down).slice(0, 4) === t.slice(0, 4));
}

function hbars(list, max, kind, dark = false) {
  return `<div class="hbars">${list.map(([k, n]) => `
    <button type="button" class="hbar ${dark ? 'dark' : ''}" data-f="${kind}" data-v="${esc(k)}">
      <span class="nm">${esc(kind === 'district' ? pretty(k) : k)}</span>
      <span class="tr"><i style="width:${(n / max * 100).toFixed(1)}%"></i></span>
      <span class="n">${num(n)}</span></button>`).join('')}</div>`;
}

export function viewGgnDashboard(el) {
  const rows = rowsPeriode();
  const open = S.gangguan.filter((g) => !g.date_up).sort((a, b) => b.date_down.localeCompare(a.date_down));
  const med = median(rows.map(lamaMenit));
  const unik = new Set(rows.map((r) => r.hostname)).size;
  const label = { tahun: 'Tahun ' + todayWib().slice(0, 4), bulan: 'Bulan ini', hari: 'Hari ini' }[periode];

  const tahun = todayWib().slice(0, 4), blnNow = +todayWib().slice(5, 7);
  const perBulan = Array.from({ length: blnNow }, (_, i) => [i + 1, S.gangguan.filter((g) => wibDate(g.date_down).startsWith(`${tahun}-${String(i + 1).padStart(2, '0')}`)).length]);
  const mMax = Math.max(1, ...perBulan.map((x) => x[1]));
  const causes = countBy(rows, (r) => r.penyebab);
  const districts = countBy(rows, (r) => r.district);
  const vendors = countBy(rows, (r) => r.vendor);
  const hours = Array.from({ length: 24 }, (_, h) => rows.filter((r) => wibHour(r.date_down) === h).length);
  const hMax = Math.max(1, ...hours);
  const top = countBy(rows, (r) => r.hostname).slice(0, 8);
  const vColors = ['#0B1B33', '#1E4FD8', '#7FD3F2', '#9BB3D1'];

  el.innerHTML = `
  <header class="page-head">
    <div><span class="eyebrow">DATA GGN · AVAILABILITY OLT DOWN · DEMO</span><h1>Dashboard Gangguan</h1>
      <span class="muted">${rows.length ? 'Data terakhir: ' + fmtDT(S.gangguan.at(-1)?.date_down) : 'Belum ada data pada periode ini'}</span></div>
    <div class="actions">
      <div class="card" style="padding:4px;border-radius:999px;display:flex" role="group" aria-label="Periode">
        ${['hari', 'bulan', 'tahun'].map((p) => `<button type="button" class="btn btn-sm ${p === periode ? 'btn-dark' : ''}" style="${p === periode ? '' : 'box-shadow:none'}" data-per="${p}">${{ hari: 'Hari ini', bulan: 'Bulan ini', tahun: tahun }[p]}</button>`).join('')}
      </div>
      <a class="btn btn-primary" href="#/ggn/laporan">Buat laporan sore</a>
    </div>
  </header>

  <section class="grid g-kpi">
    ${clockWidget()}
    <div class="card kpi"><span>Gangguan · ${esc(label)}</span><b>${num(rows.length)}</b><small>${num(unik)} OLT berbeda</small></div>
    <button type="button" class="card kpi ${open.length ? 'warn' : ''}" data-f="open" style="text-align:left;border:0;cursor:pointer;font:inherit"><span>Masih DOWN</span><b>${num(open.length)}</b><small>Klik untuk lihat daftar</small></button>
    <div class="card kpi"><span>Lama gangguan (median)</span><b>${med == null ? '–' : num(med)}<span style="font-size:18px"> mnt</span></b><small>Separuh gangguan selesai di bawah angka ini</small></div>
  </section>

  <section class="grid g-2">
    <div class="card"><div class="card-head"><h2>Gangguan per bulan · ${tahun}</h2><span class="muted">klik batang untuk rincian</span></div>
      <div class="vbars">${perBulan.map(([m, n]) => `<button type="button" class="vbar" data-f="bulan" data-v="${m}" aria-label="${BULAN[m - 1]}: ${n}"><em>${n}</em><i style="height:${Math.round(n / mMax * 150)}px"></i></button>`).join('')}</div>
      <div class="vlabels">${perBulan.map(([m]) => `<span>${BULAN[m - 1]}</span>`).join('')}</div>
    </div>
    <div class="card"><div class="card-head"><h2>Penyebab gangguan</h2><span class="muted">${esc(label)}</span></div>
      ${causes.length ? hbars(causes, causes[0][1], 'penyebab') : '<p class="muted">Belum ada data.</p>'}</div>
  </section>

  <section class="grid g-3">
    <div class="card"><div class="card-head"><h2>Per district</h2></div>${districts.length ? hbars(districts, districts[0][1], 'district', true) : '<p class="muted">–</p>'}</div>
    <div class="card"><div class="card-head"><h2>Per vendor</h2></div>
      <div class="stack">${vendors.map(([k, n], i) => `<i style="width:${pct(n, rows.length)}%;background:${vColors[i % 4]}"></i>`).join('')}</div>
      <div class="legend">${vendors.map(([k, n], i) => `<button type="button" data-f="vendor" data-v="${esc(k)}"><span class="sw" style="background:${vColors[i % 4]}"></span><span style="flex:1">${esc(k)}</span><span class="mono">${num(n)} · ${pct(n, rows.length).toFixed(1)}%</span></button>`).join('')}</div>
      <div style="border-top:1px solid var(--line2);margin-top:16px;padding-top:14px">
        <div class="card-head" style="margin-bottom:8px"><h2 style="font-size:13px">Jam rawan gangguan</h2><span class="muted" style="font-size:11px">jam mulai DOWN</span></div>
        <div class="hours">${hours.map((n, h) => `<i title="${String(h).padStart(2, '0')}.00 · ${n} gangguan" data-f="jam" data-v="${h}" style="cursor:pointer;background:rgba(30,79,216,${(0.08 + 0.92 * n / hMax).toFixed(2)})"></i>`).join('')}</div>
        <div class="hours-axis mono"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><h2>OLT paling sering down</h2><span class="muted">${esc(label)}</span></div>
      ${top.length ? hbars(top, top[0][1], 'hostname') : '<p class="muted">–</p>'}</div>
  </section>

  <section class="card"><div class="card-head"><h2>Masih DOWN · ${open.length}</h2><span class="muted">Otomatis jadi UP saat data dengan Date UP di-paste</span></div>
    ${tableRows(open.slice(0, 30), true)}</section>`;

  startClock();
  $$('[data-per]', el).forEach((b) => b.onclick = () => { periode = b.dataset.per; viewGgnDashboard(el); });
  $$('[data-f]', el).forEach((b) => b.onclick = () => drill(b.dataset.f, b.dataset.v));
  bindRowClicks(el);
}

function drill(f, v) {
  const base = f === 'bulan' || f === 'open' ? S.gangguan : rowsPeriode();
  const tahun = todayWib().slice(0, 4);
  const fn = {
    open: (r) => !r.date_up,
    bulan: (r) => wibDate(r.date_down).startsWith(`${tahun}-${String(v).padStart(2, '0')}`),
    penyebab: (r) => (r.penyebab || '(kosong)') === v,
    district: (r) => (r.district || '(kosong)') === v,
    vendor: (r) => (r.vendor || '(kosong)') === v,
    hostname: (r) => r.hostname === v,
    jam: (r) => wibHour(r.date_down) === +v,
  }[f];
  const rows = base.filter(fn).sort((a, b) => b.date_down.localeCompare(a.date_down));
  const title = { open: 'Masih DOWN', bulan: `${BULAN[v - 1]} ${tahun}`, jam: `Jam ${String(v).padStart(2, '0')}.00–${String(v).padStart(2, '0')}.59`, district: pretty(v) }[f] || v;
  showDetail(title, rows, f);
}

function showDetail(title, rows, f) {
  const med = median(rows.map(lamaMenit));
  const sub = f === 'penyebab' ? countBy(rows, (r) => r.district) : countBy(rows, (r) => r.penyebab);
  openDrawer(title, `
    <div class="mini-kpi"><div><b>${num(rows.length)}</b><span>gangguan</span></div><div><b>${new Set(rows.map((r) => r.hostname)).size}</b><span>OLT terdampak</span></div><div><b>${fmtLama(med, true)}</b><span>median lama</span></div></div>
    <div><h3 style="font-size:13px;margin-bottom:8px">${f === 'penyebab' ? 'Per district' : 'Per penyebab'}</h3>${sub.length ? hbars(sub.slice(0, 8), sub[0][1], 'x') : ''}</div>
    <div class="card" style="padding:0">${tableRows(rows.slice(0, 300), f === 'open')}</div>
    ${rows.length > 300 ? '<p class="muted">Menampilkan 300 terbaru.</p>' : ''}`);
  bindRowClicks($('#drawer-body'));
}

function tableRows(rows, showAge = false) {
  if (!rows.length) return '<p class="muted" style="padding:12px 22px">Tidak ada data.</p>';
  const now = Date.now();
  return `<div class="tbl-wrap" style="margin:0"><table><thead><tr><th>Date Down</th><th>OLT</th><th>Penyebab</th><th>${showAge ? 'Sudah berapa lama' : 'Lama'}</th></tr></thead><tbody>
  ${rows.map((r) => `<tr data-id="${r.id}" style="cursor:${isAdmin() ? 'pointer' : 'default'}">
    <td class="mono">${fmtDT(r.date_down)}</td>
    <td><span class="mono" style="font-weight:600">${esc(r.hostname)}</span><br><small class="muted">${esc(pretty(r.district))}</small></td>
    <td>${esc(r.penyebab || '–')}${r.keterangan ? `<br><small class="muted">${esc(r.keterangan)}</small>` : ''}</td>
    <td class="mono">${r.date_up ? fmtLama(lamaMenit(r), true) : `<span class="chip down">${showAge ? fmtLama(Math.round((now - Date.parse(r.date_down)) / 6e4), true) : 'DOWN'}</span>`}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function bindRowClicks(root) {
  if (!isAdmin()) return;
  $$('tr[data-id]', root).forEach((tr) => tr.onclick = () => editGangguan(+tr.dataset.id));
}

// ---------- Edit satu gangguan (admin) ----------
const toLocalInput = (iso) => iso ? wibDate(iso) + 'T' + fmtDT(iso, false).replace('.', ':') : '';
function editGangguan(id) {
  const r = S.gangguan.find((g) => g.id === id); if (!r) return;
  const foto = S.foto.filter((f) => f.gangguan_id === id);
  openDrawer(r.hostname, `
    <p class="muted">${esc(pretty(r.district))} · ${esc(r.vendor || '')} ${esc(r.tipe || '')}</p>
    <form id="f-edit" style="display:flex;flex-direction:column;gap:12px">
      <label>Penyebab GGN<select id="e-pen">${optKategori(r.penyebab)}</select></label>
      <label>Date Down (WIB)<input type="datetime-local" id="e-down" value="${toLocalInput(r.date_down)}"></label>
      <label>Date UP (WIB) — kosongkan bila masih DOWN<input type="datetime-local" id="e-up" value="${toLocalInput(r.date_up)}"></label>
      <label>Keterangan<textarea id="e-ket" rows="3" style="font-family:inherit">${esc(r.keterangan || '')}</textarea></label>
      ${ADA_FOTO() ? `<label>Tambah foto evident<input type="file" id="e-foto" accept="image/*" multiple></label><p class="muted" style="margin:0">${foto.length} foto tersimpan · terhapus otomatis 3 hari kerja setelah upload</p>` : ''}
      <div class="actions"><button class="btn btn-primary" type="submit">Simpan</button><button class="btn" type="button" id="e-del" style="color:var(--warn)">Hapus data ini</button></div>
    </form>`);
  $('#f-edit').onsubmit = async (e) => {
    e.preventDefault();
    const toIso = (v) => v ? new Date(v + ':00+07:00').toISOString() : null;
    const upd = { penyebab: $('#e-pen').value || null, date_down: toIso($('#e-down').value), date_up: toIso($('#e-up').value), keterangan: $('#e-ket').value.trim() || null };
    const { error } = await S.db.from('gangguan').update(upd).eq('id', id);
    if (error) return toast('Gagal menyimpan: ' + error.message);
    const files = $('#e-foto')?.files;
    if (files?.length) await uploadFotos(id, files);
    toast('Tersimpan'); await loadData(); closeDrawer(); rerender();
  };
  $('#e-del').onclick = async () => {
    if (!confirm(`Hapus data ${r.hostname} ${fmtDT(r.date_down)}?`)) return;
    const { error } = await S.db.from('gangguan').delete().eq('id', id);
    if (error) return toast('Gagal menghapus: ' + error.message);
    toast('Data dihapus'); await loadData(); closeDrawer(); rerender();
  };
}

const optKategori = (sel) => `<option value="">Pilih penyebab…</option>` + S.kategori.map((k) => `<option ${k === sel ? 'selected' : ''}>${esc(k)}</option>`).join('');

// =====================================================================
// FOTO → Google Drive (lewat Apps Script)
// =====================================================================
async function resize(file, max = 1600) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}
async function token() { return (await S.db.auth.getSession()).data.session?.access_token; }
export async function uploadFotos(gangguanId, files) {
  if (!ADA_FOTO()) return;
  const t = await token();
  for (const f of files) {
    try {
      const data = await resize(f);
      const res = await fetch(CONFIG.FOTO_ENDPOINT, { method: 'POST', body: JSON.stringify({ action: 'upload', token: t, name: `${gangguanId}-${f.name}`, data }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error);
      await S.db.from('foto').insert({ gangguan_id: gangguanId, drive_id: j.id, hapus_pada: addWorkdays(todayWib(), 3) });
    } catch (e) { toast('Foto gagal diupload: ' + (e.message || e)); }
  }
}
export async function fotoDataUrl(driveId) {
  const t = await token();
  const res = await fetch(`${CONFIG.FOTO_ENDPOINT}?action=img&id=${encodeURIComponent(driveId)}&token=${encodeURIComponent(t)}`);
  const j = await res.json();
  return j.ok ? `data:${j.mime};base64,${j.data}` : null;
}

// =====================================================================
// INPUT (paste dari portal operator / notifikasi Telegram)
// =====================================================================
let draft = [];
const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) <= 120000; // toleransi 2 menit

export function viewGgnInput(el) {
  if (!isAdmin()) { el.innerHTML = '<div class="card">Halaman ini khusus admin.</div>'; return; }
  el.innerHTML = `
  <header class="page-head"><div><span class="eyebrow">DATA GGN</span><h1>Input Gangguan</h1><span class="muted">Copy dari portal operator atau notifikasi bot Telegram, tempel di bawah. Data langsung terbaca.</span></div></header>
  <section class="card" style="display:flex;flex-direction:column;gap:12px">
    <div class="card-head" style="margin:0"><label for="paste" style="font-size:15px;font-weight:600;color:var(--ink)">1 · Tempel data</label>
      <div class="actions">${window.DEMO_SAMPLE ? '<button class="btn btn-sm btn-dark" type="button" id="demo-fill">Isi contoh</button>' : ''}<label class="btn btn-sm" style="flex-direction:row">Pilih file .txt<input type="file" id="txt" accept=".txt,text/plain" hidden></label></div></div>
    <textarea id="paste" rows="6" placeholder="Tempel di sini…"></textarea>
    <span class="muted" style="font-size:12px">Data yang sudah ada otomatis dilewati. Notifikasi "OLT Recovery" akan meng-update Date UP gangguan yang masih DOWN.</span>
  </section>
  <section class="card" id="preview" hidden>
    <div class="card-head"><h2 id="pv-title">2 · Periksa & lengkapi</h2><div class="actions" id="pv-chips"></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Status</th><th>OLT</th><th>Date Down</th><th>Date UP</th><th>Lama</th><th>Penyebab GGN</th><th>Keterangan</th>${ADA_FOTO() ? '<th>Foto</th>' : ''}</tr></thead><tbody id="pv-body"></tbody></table></div>
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-top:16px">
      <span class="muted" style="font-size:12px">Setelah disimpan, data juga tersalin ke Google Sheets sebagai cadangan.</span>
      <button class="btn btn-primary" id="btn-save" type="button">Simpan</button></div>
  </section>`;
  const ta = $('#paste');
  const go = () => { draft = buildDraft(ta.value); renderDraft(); };
  ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(go, 250); });
  $('#txt').onchange = async (e) => { const f = e.target.files[0]; if (f) { ta.value = await f.text(); go(); } };
  $('#btn-save').onclick = saveDraft;
  const df = $('#demo-fill'); if (df) df.onclick = () => { ta.value = window.DEMO_SAMPLE; go(); };
}

function buildDraft(text) {
  return parsePaste(text).map((p) => {
    const o = S.olt.get(p.hostname);
    const ex = S.gangguan.find((g) => g.hostname === p.hostname && near(g.date_down, p.date_down));
    let status = 'new';
    if (ex) status = (!ex.date_up && p.date_up) ? 'upd' : 'same';
    return {
      ...p,
      vendor: p.vendor || o?.merk || '', tipe: p.tipe || o?.tipe || '',
      district: p.district || o?.district || '',
      penyebab: S.kategori.includes(p.penyebab) ? p.penyebab : (ex?.penyebab || ''),
      keterangan: ex?.keterangan || '',
      dikenal: !!o, ex, status, files: null,
    };
  });
}

function renderDraft() {
  const pv = $('#preview'); pv.hidden = !draft.length; if (!draft.length) return;
  const c = { new: 0, upd: 0, same: 0 }; draft.forEach((d) => c[d.status]++);
  $('#pv-title').textContent = `2 · Hasil pembacaan · ${draft.length} baris`;
  $('#pv-chips').innerHTML = `<span class="chip new">${c.new} baru</span><span class="chip upd">${c.upd} update jadi UP</span><span class="chip same">${c.same} sudah ada · dilewati</span>`;
  const label = { new: '<span class="chip new">Baru</span>', upd: '<span class="chip upd">Update → UP</span>', same: '<span class="chip same">Sudah ada</span>' };
  $('#pv-body').innerHTML = draft.map((d, i) => {
    const lama = d.date_up ? fmtLama(lamaMenit(d), true) : '<span class="chip down">DOWN</span>';
    if (d.status === 'same') return `<tr class="dim"><td>${label.same}</td><td class="mono">${esc(d.hostname)}</td><td class="mono">${fmtDT(d.date_down)}</td><td class="mono">${fmtDT(d.date_up)}</td><td class="mono">${lama}</td><td colspan="${ADA_FOTO() ? 3 : 2}">Dilewati, tidak ada perubahan</td></tr>`;
    return `<tr>
      <td>${label[d.status]}</td>
      <td><span class="mono" style="font-weight:600">${esc(d.hostname)}</span><br><small class="muted">${esc(pretty(d.district))} · ${esc(d.vendor)} ${esc(d.tipe)}</small>${d.dikenal ? '' : '<br><small style="color:var(--warn)">Tidak ada di LIST HOSTNAME</small>'}</td>
      <td class="mono" style="white-space:nowrap">${fmtDT(d.date_down)}</td>
      <td class="mono" style="white-space:nowrap">${fmtDT(d.date_up)}</td>
      <td class="mono" style="white-space:nowrap">${lama}</td>
      <td><select data-i="${i}" data-k="penyebab" aria-label="Penyebab ${esc(d.hostname)}" class="${d.penyebab ? '' : 'req'}" style="width:220px">${optKategori(d.penyebab)}</select></td>
      <td><input data-i="${i}" data-k="keterangan" value="${esc(d.keterangan)}" placeholder="Opsional" aria-label="Keterangan ${esc(d.hostname)}" style="width:200px"></td>
      ${ADA_FOTO() ? `<td><input type="file" data-i="${i}" data-k="files" accept="image/*" multiple aria-label="Foto ${esc(d.hostname)}" style="width:190px"></td>` : ''}
    </tr>`;
  }).join('');
  $$('#pv-body [data-k]').forEach((inp) => inp.onchange = inp.oninput = () => {
    const d = draft[+inp.dataset.i];
    d[inp.dataset.k] = inp.dataset.k === 'files' ? inp.files : inp.value;
    if (inp.dataset.k === 'penyebab') inp.classList.toggle('req', !inp.value);
  });
  const n = c.new + c.upd;
  $('#btn-save').textContent = n ? `Simpan ${n} perubahan` : 'Tidak ada perubahan';
  $('#btn-save').disabled = !n;
}

async function saveDraft() {
  const work = draft.filter((d) => d.status !== 'same');
  if (work.some((d) => d.status === 'new' && !d.penyebab) && !confirm('Ada gangguan baru yang penyebabnya belum dipilih. Tetap simpan?')) return;
  const btn = $('#btn-save'); btn.disabled = true; btn.textContent = 'Menyimpan…';
  let ok = 0;
  for (const d of work) {
    let id, error;
    if (d.status === 'new') {
      const res = await S.db.from('gangguan').insert({
        area: d.area || null, regional: d.regional || null, district: d.district, hostname: d.hostname,
        vendor: d.vendor || null, tipe: d.tipe || null, penyebab: d.penyebab || null,
        date_down: d.date_down, date_up: d.date_up, keterangan: d.keterangan || null, sumber: d.sumber,
      }).select('id').single();
      id = res.data?.id; error = res.error;
    } else {
      id = d.ex.id;
      ({ error } = await S.db.from('gangguan').update({ date_up: d.date_up, penyebab: d.penyebab || d.ex.penyebab, keterangan: d.keterangan || d.ex.keterangan }).eq('id', id));
    }
    if (error) { toast(`${d.hostname}: ${error.message}`); continue; }
    ok++;
    if (d.files?.length) await uploadFotos(id, d.files);
  }
  toast(`${ok} data tersimpan`);
  await loadData(); draft = []; $('#paste').value = ''; renderDraft();
}

// =====================================================================
// SEMUA DATA
// =====================================================================
export function viewGgnData(el) {
  el.innerHTML = `
  <header class="page-head"><div><span class="eyebrow">DATA GGN</span><h1>Semua Data</h1><span class="muted">${num(S.gangguan.length)} gangguan dimuat${isAdmin() ? ' · klik baris untuk edit' : ''}</span></div></header>
  <section class="card">
    <div class="actions" style="margin-bottom:14px">
      <input id="q" type="search" placeholder="Cari hostname, district, penyebab…" style="flex:1;min-width:220px" aria-label="Cari">
      <input id="qm" type="month" value="${todayWib().slice(0, 7)}" aria-label="Bulan">
    </div>
    <div id="tbl"></div>
  </section>`;
  const draw = () => {
    const q = $('#q').value.trim().toUpperCase(), m = $('#qm').value;
    const rows = S.gangguan.filter((r) => (!m || wibDate(r.date_down).startsWith(m)) &&
      (!q || [r.hostname, r.district, r.penyebab, r.keterangan, r.vendor].join(' ').toUpperCase().includes(q)))
      .sort((a, b) => b.date_down.localeCompare(a.date_down));
    $('#tbl').innerHTML = `<p class="muted" style="margin:0 0 8px">${num(rows.length)} baris</p>` + tableRows(rows.slice(0, 500));
    bindRowClicks($('#tbl'));
  };
  $('#q').oninput = draw; $('#qm').onchange = draw; draw();
}

// =====================================================================
// LAPORAN SORE (GGN)
// =====================================================================
export async function viewGgnLaporan(el) {
  el.innerHTML = `
  <header class="page-head"><div><span class="eyebrow">DATA GGN</span><h1>Laporan Sore</h1><span class="muted">Periode 00.00–23.59 WIB pada tanggal yang dipilih</span></div>
    <div class="actions"><label style="flex-direction:row;align-items:center">Tanggal <input type="date" id="rd" value="${todayWib()}"></label>
      <button class="btn" id="b-jpg" type="button">Unduh JPG</button><button class="btn btn-primary" id="b-pdf" type="button">Unduh PDF</button></div></header>
  <div class="report-stage"><div class="report" id="report"></div></div>`;
  const draw = async () => {
    const d = $('#rd').value;
    const { data: logs } = await S.db.from('laporan_log').select('dibuat').eq('jenis', 'ggn').lt('dibuat', dayStart(d)).order('dibuat', { ascending: false }).limit(1);
    $('#report').innerHTML = reportGgn(d, logs?.[0]?.dibuat);
    loadReportPhotos();
  };
  $('#rd').onchange = draw; await draw();
  const name = () => `Laporan-OLT-Down-${$('#rd').value}`;
  const log = () => isAdmin() && S.db.from('laporan_log').insert({ jenis: 'ggn' }).then(() => {});
  $('#b-jpg').onclick = async () => { await exportJpg($('#report'), name()); log(); };
  $('#b-pdf').onclick = async () => { await exportPdf($('#report'), name()); log(); };
}

function reportGgn(d, lastLog) {
  const s = dayStart(d), e = dayStart(addDays(d, 1));
  const rows = S.gangguan.filter((g) => g.date_down >= s && g.date_down < e).sort((a, b) => a.date_down.localeCompare(b.date_down));
  const susulan = lastLog ? S.gangguan.filter((g) => g.date_down >= lastLog && g.date_down < s) : [];
  const open = rows.filter((r) => !r.date_up);
  const durs = rows.map(lamaMenit).filter((x) => x != null);
  const causes = countBy(rows, (r) => r.penyebab), dists = countBy(rows, (r) => r.district);
  const bars = (list, cls) => list.length ? list.map(([k, n]) => `<div class="rp-bar ${cls}"><span>${esc(cls ? pretty(k) : k)}</span><i style="width:${(n / list[0][1] * 100).toFixed(0)}%"></i><b>${n}</b></div>`).join('') : '<div class="rp-empty">–</div>';
  const rowHtml = (r, i) => `<div class="rp-row"><span class="mono">${i + 1}</span>
      <div><span class="host">${esc(r.hostname)}</span><small>${esc(pretty(r.district))} · ${esc(r.vendor || '')} ${esc(r.tipe || '')}</small></div>
      <span>${esc(r.penyebab || '–')}</span><span class="mono">${fmtDT(r.date_down, wibDate(r.date_down) !== d)}</span>
      <span class="mono">${r.date_up ? fmtDT(r.date_up, wibDate(r.date_up) !== d) : '<span class="chip down">DOWN</span>'}</span>
      <span class="mono" style="text-align:right;font-weight:600">${r.date_up ? fmtLama(lamaMenit(r), true) : '–'}</span>
      ${r.keterangan ? `<div class="rp-ket">Keterangan: ${esc(r.keterangan)}</div>` : ''}</div>`;
  const tbl = (list) => `<div class="rp-tbl"><div class="rp-row h"><span>No</span><span>OLT</span><span>Penyebab</span><span>Down</span><span>UP</span><span style="text-align:right">Lama</span></div>${list.map(rowHtml).join('')}</div>`;
  const fotos = S.foto.filter((f) => rows.concat(susulan).some((r) => r.id === f.gangguan_id));
  const now = new Date().toISOString();

  return `
  <div class="rp-head"><div class="rp-top"><img src="${CONFIG.LOGO}" alt="OLT Monitoring" crossorigin="anonymous"><span>Dibuat ${fmtDT(now)} WIB</span></div>
    <div><h1>${esc(CONFIG.JUDUL_LAPORAN)}</h1><p>${fmtTanggalPanjang(d)} · periode 00.00 – 23.59 WIB</p></div></div>
  <div class="rp-body">
    <div class="rp-kpi"><div><span>OLT down</span><b>${rows.length}</b></div><div><span>Sudah UP</span><b>${rows.length - open.length}</b></div>
      <div class="${open.length ? 'w' : ''}"><span>Masih DOWN</span><b>${open.length}</b></div><div><span>Gangguan terlama</span><b style="font-size:20px;line-height:1.55">${durs.length ? fmtLama(Math.max(...durs), true) : '–'}</b></div></div>
    ${rows.length ? `<div class="rp-2"><div class="rp-sec"><h2>PENYEBAB GANGGUAN</h2>${bars(causes, '')}</div><div class="rp-sec"><h2>PER DISTRICT</h2>${bars(dists, 'd')}</div></div>
    <div class="rp-sec"><h2>DETAIL GANGGUAN</h2>${tbl(rows)}</div>` : '<div class="rp-empty">Tidak ada OLT down pada tanggal ini.</div>'}
    ${susulan.length ? `<div class="rp-sec"><h2>SUSULAN · SETELAH LAPORAN ${fmtDT(lastLog)}</h2>${tbl(susulan)}</div>` : ''}
    ${fotos.length ? `<div class="rp-sec"><h2>FOTO EVIDENT</h2><div class="rp-foto">${fotos.map((f) => {
      const g = S.gangguan.find((x) => x.id === f.gangguan_id);
      return `<figure><img data-drive="${esc(f.drive_id)}" alt="Foto ${esc(g?.hostname)}"><figcaption>${esc(g?.hostname)}</figcaption></figure>`;
    }).join('')}</div></div>` : ''}
  </div>
  <div class="rp-foot"><span>Sumber: OLT Monitoring · data demo (fiktif)</span><span class="mono">${esc(d)}</span></div>`;
}

async function loadReportPhotos() {
  for (const img of $$('img[data-drive]')) {
    try { const src = await fotoDataUrl(img.dataset.drive); if (src) img.src = src; } catch { /* abaikan */ }
  }
}
