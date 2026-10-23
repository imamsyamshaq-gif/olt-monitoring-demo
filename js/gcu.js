import { CONFIG } from './config.js';
import { S, $, $$, esc, num, pct, todayWib, addDays, isWorkday, workdaysBetween, toast, openDrawer, isAdmin, fmtTanggalPanjang, countBy } from './util.js';
import { exportJpg, exportPdf } from './report.js';
import { clockWidget, startClock, loadData, rerender } from './app.js';

const pretty = (d) => d || '–';
const LOKASI = ['STO', 'SHELTER', 'OUTDOOR', 'HRB', 'CSF'];

function stats(asOf = todayWib()) {
  const olts = [...S.olt.values()];
  const done = (o) => { const t = S.gcu.get(o.hostname); return t && t <= asOf; };
  const total = olts.length, sudah = olts.filter(done).length, sisa = total - sudah;
  const end = S.putaran?.selesai || asOf;
  const hariKerja = Math.max(1, workdaysBetween(addDays(asOf, 1), end));
  const perHari = Math.ceil(sisa / hariKerja);
  // jadwal ideal: proporsional hari kerja sejak awal putaran
  const start = S.putaran?.mulai || asOf;
  const totHK = Math.max(1, workdaysBetween(start, end)), lewat = workdaysBetween(start, asOf);
  const targetNow = Math.round(total * Math.min(1, lewat / totHK));
  const districts = [...new Set(olts.map((o) => o.district))].sort();
  const lok = [...new Set(olts.map((o) => o.lokasi || '-'))].sort((a, b) => (LOKASI.indexOf(a) + 99 * (LOKASI.indexOf(a) < 0)) - (LOKASI.indexOf(b) + 99 * (LOKASI.indexOf(b) < 0)));
  const perD = districts.map((d) => { const all = olts.filter((o) => o.district === d); const s = all.filter(done).length; return { d, total: all.length, sudah: s, p: pct(s, all.length) }; });
  const matrix = districts.map((d) => ({ d, cells: lok.map((l) => { const all = olts.filter((o) => o.district === d && (o.lokasi || '-') === l); return { total: all.length, sudah: all.filter(done).length }; }) }));
  return { olts, done, total, sudah, sisa, hariKerja, perHari, targetNow, perD, lok, matrix, end };
}

// warna sel: merah muda (rendah) → biru (tinggi)
const heat = (p) => p >= 75 ? '#D9E7FF' : p >= 50 ? '#E8F0FD' : p >= 25 ? '#FFF1E6' : '#FFE3D3';

// =====================================================================
// DASHBOARD GCU
// =====================================================================
export function viewGcuDashboard(el) {
  if (!S.putaran) { el.innerHTML = '<div class="card">Belum ada putaran GCU aktif. Tambahkan di tabel gcu_putaran.</div>'; return; }
  const st = stats();
  const onTrack = st.sudah >= st.targetNow;
  el.innerHTML = `
  <header class="page-head"><div><span class="eyebrow">GCU · GENERAL CHECK-UP UNIT</span><h1>GCU ${esc(S.putaran.kode)}</h1>
    <span class="muted">Periode ${fmtTanggalPanjang(S.putaran.mulai)} – ${fmtTanggalPanjang(S.putaran.selesai)}</span></div>
    <div class="actions">${isAdmin() ? '<a class="btn" href="#/gcu/input">Input GCU</a>' : ''}<a class="btn btn-primary" href="#/gcu/laporan">Buat laporan pagi</a></div></header>
  <section class="grid g-kpi">
    ${clockWidget()}
    <div class="card kpi"><span>Progres</span><b>${pct(st.sudah, st.total).toFixed(1)}%</b><small>${num(st.sudah)} dari ${num(st.total)} OLT</small>
      <div class="progress" style="margin-top:6px"><i style="width:${pct(st.sudah, st.total)}%"></i></div></div>
    <div class="card kpi ${onTrack ? '' : 'warn'}"><span>${onTrack ? 'Sesuai jadwal' : 'Tertinggal dari jadwal'}</span><b>${num(Math.abs(st.sudah - st.targetNow))}</b><small>${onTrack ? 'OLT lebih cepat dari target' : 'OLT di bawah target hari ini'} (${num(st.targetNow)})</small></div>
    <div class="card kpi"><span>Target per hari kerja</span><b>${num(st.perHari)}</b><small>${num(st.sisa)} OLT sisa · ${st.hariKerja} hari kerja lagi</small></div>
  </section>
  <section class="grid g-2">
    <div class="card"><div class="card-head"><h2>Progres per district</h2><span class="muted">klik untuk lihat OLT yang belum</span></div>
      <div class="hbars">${st.perD.sort((a, b) => a.p - b.p).map((x) => `<button type="button" class="hbar" data-d="${esc(x.d)}"><span class="nm">${esc(pretty(x.d))}</span><span class="tr"><i style="width:${x.p}%;background:${x.p < 30 ? '#E8590C' : 'var(--blue)'}"></i></span><span class="n">${x.p.toFixed(0)}%</span></button>`).join('')}</div></div>
    <div class="card"><div class="card-head"><h2>GCU 14 hari terakhir</h2></div>${dailyBars()}</div>
  </section>
  <section class="card"><div class="card-head"><h2>District × lokasi</h2><span class="muted">sudah / total</span></div>${matrixTable(st)}</section>`;
  startClock();
  $$('[data-d]', el).forEach((b) => b.onclick = () => belumList(b.dataset.d));
}

function dailyBars() {
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayWib(), i - 13));
  const vals = days.map((d) => [...S.gcu.values()].filter((t) => t === d).length);
  const max = Math.max(1, ...vals);
  return `<div class="vbars" style="height:160px">${vals.map((n, i) => `<div class="vbar" style="cursor:default"><em>${n || ''}</em><i style="height:${Math.round(n / max * 120)}px;${isWorkday(days[i]) ? '' : 'opacity:.35'}"></i></div>`).join('')}</div>
    <div class="vlabels">${days.map((d) => `<span>${+d.slice(8)}</span>`).join('')}</div>`;
}

function matrixTable(st) {
  return `<div class="tbl-wrap"><table class="matrix"><thead><tr><th>District</th>${st.lok.map((l) => `<th>${esc(l)}</th>`).join('')}<th>Total</th></tr></thead><tbody>
  ${st.matrix.map((r) => { const s = r.cells.reduce((a, c) => a + c.sudah, 0), t = r.cells.reduce((a, c) => a + c.total, 0);
    return `<tr><td>${esc(pretty(r.d))}</td>${r.cells.map((c) => c.total ? `<td class="mono" style="background:${heat(pct(c.sudah, c.total))}">${c.sudah}/${c.total}</td>` : '<td class="muted">–</td>').join('')}<td class="mono" style="font-weight:600;background:${heat(pct(s, t))}">${s}/${t} · ${pct(s, t).toFixed(0)}%</td></tr>`; }).join('')}
  </tbody></table></div>`;
}

function belumList(d) {
  const list = [...S.olt.values()].filter((o) => o.district === d && !S.gcu.get(o.hostname));
  const byLok = countBy(list, (o) => o.lokasi);
  openDrawer(`Belum GCU · ${pretty(d)}`, `
    <div class="mini-kpi"><div><b>${list.length}</b><span>OLT belum</span></div>${byLok.slice(0, 2).map(([k, n]) => `<div><b>${n}</b><span>${esc(k)}</span></div>`).join('')}</div>
    <div class="card" style="padding:0"><div class="tbl-wrap" style="margin:0"><table><thead><tr><th>Hostname</th><th>Lokasi</th><th>Merk / Tipe</th></tr></thead><tbody>
    ${list.map((o) => `<tr><td class="mono">${esc(o.hostname)}</td><td>${esc(o.lokasi || '–')}</td><td>${esc(o.merk || '')} ${esc(o.tipe || '')}</td></tr>`).join('')}
    </tbody></table></div></div>`);
}

// =====================================================================
// INPUT GCU
// =====================================================================
let pilih = new Set();
export function viewGcuInput(el) {
  if (!isAdmin()) { el.innerHTML = '<div class="card">Halaman ini khusus admin.</div>'; return; }
  if (!S.putaran) { el.innerHTML = '<div class="card">Belum ada putaran GCU aktif.</div>'; return; }
  const belum = [...S.olt.values()].filter((o) => !S.gcu.get(o.hostname));
  el.innerHTML = `
  <header class="page-head"><div><span class="eyebrow">GCU ${esc(S.putaran.kode)}</span><h1>Input GCU</h1><span class="muted">Cari hostname atau tempel daftar hostname (satu per baris), pilih tanggal, simpan.</span></div></header>
  <section class="grid g-2">
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <label>Cari hostname<input id="g-q" list="g-list" placeholder="contoh: GPON00-D2-BJT-3" autocomplete="off"></label>
      <datalist id="g-list">${belum.map((o) => `<option value="${esc(o.hostname)}">${esc(pretty(o.district))} · ${esc(o.lokasi || '')}</option>`).join('')}</datalist>
      <label>Atau tempel banyak hostname<textarea id="g-bulk" rows="5" placeholder="Satu hostname per baris"></textarea></label>
      <button class="btn" id="g-add" type="button">Tambahkan ke daftar</button>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="card-head" style="margin:0"><h2>Akan disimpan · <span id="g-n">0</span> OLT</h2><button class="btn btn-sm" id="g-clear" type="button">Kosongkan</button></div>
      <div id="g-sel" style="display:flex;flex-wrap:wrap;gap:6px;min-height:40px"></div>
      <label>Tanggal GCU<input type="date" id="g-date" value="${todayWib()}"></label>
      <button class="btn btn-primary" id="g-save" type="button">Simpan</button>
      <p class="muted" id="g-msg" style="margin:0;font-size:12px"></p>
    </div>
  </section>
  <section class="card"><div class="card-head"><h2>Input terakhir</h2><span class="muted">klik × untuk membatalkan</span></div><div id="g-last"></div></section>`;

  const drawSel = () => {
    $('#g-n').textContent = pilih.size;
    $('#g-sel').innerHTML = [...pilih].map((h) => `<span class="chip new" style="display:inline-flex;gap:6px;align-items:center">${esc(h)}<button type="button" data-rm="${esc(h)}" aria-label="Hapus ${esc(h)}" style="border:0;background:none;cursor:pointer;color:inherit;font-weight:700">×</button></span>`).join('') || '<span class="muted">Belum ada.</span>';
    $$('[data-rm]').forEach((b) => b.onclick = () => { pilih.delete(b.dataset.rm); drawSel(); });
  };
  const add = (names) => {
    const unknown = [], already = [];
    for (const raw of names) {
      const h = raw.trim().toUpperCase(); if (!h) continue;
      const key = [...S.olt.keys()].find((k) => k.toUpperCase() === h);
      if (!key) unknown.push(h); else if (S.gcu.get(key)) already.push(key); else pilih.add(key);
    }
    $('#g-msg').textContent = [unknown.length ? `${unknown.length} tidak dikenal: ${unknown.slice(0, 5).join(', ')}` : '', already.length ? `${already.length} sudah GCU sebelumnya` : ''].filter(Boolean).join(' · ');
    drawSel();
  };
  $('#g-q').onchange = () => { add([$('#g-q').value]); $('#g-q').value = ''; };
  $('#g-add').onclick = () => { add($('#g-bulk').value.split(/[\n,;\t]+/)); $('#g-bulk').value = ''; };
  $('#g-clear').onclick = () => { pilih.clear(); drawSel(); };
  $('#g-save').onclick = async () => {
    if (!pilih.size) return toast('Daftar masih kosong');
    const tanggal = $('#g-date').value;
    const rows = [...pilih].map((hostname) => ({ putaran: S.putaran.kode, hostname, tanggal }));
    const { error } = await S.db.from('gcu').upsert(rows);
    if (error) return toast('Gagal: ' + error.message);
    toast(`${rows.length} OLT tersimpan`); pilih.clear(); await loadData(); rerender();
  };
  drawSel(); drawLast();
}

function drawLast() {
  const last = [...S.gcu.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, 30);
  $('#g-last').innerHTML = last.length ? `<div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th>Hostname</th><th>District</th><th></th></tr></thead><tbody>
    ${last.map(([h, t]) => `<tr><td class="mono">${esc(t)}</td><td class="mono">${esc(h)}</td><td>${esc(pretty(S.olt.get(h)?.district))}</td><td><button class="btn btn-sm" type="button" data-undo="${esc(h)}" aria-label="Batalkan ${esc(h)}">×</button></td></tr>`).join('')}
  </tbody></table></div>` : '<p class="muted">Belum ada.</p>';
  $$('[data-undo]').forEach((b) => b.onclick = async () => {
    if (!confirm(`Batalkan GCU ${b.dataset.undo}?`)) return;
    const { error } = await S.db.from('gcu').delete().eq('putaran', S.putaran.kode).eq('hostname', b.dataset.undo);
    if (error) return toast(error.message);
    await loadData(); rerender();
  });
}

// =====================================================================
// LAPORAN PAGI (GCU)
// =====================================================================
export function viewGcuLaporan(el) {
  if (!S.putaran) { el.innerHTML = '<div class="card">Belum ada putaran GCU aktif.</div>'; return; }
  el.innerHTML = `
  <header class="page-head"><div><span class="eyebrow">GCU ${esc(S.putaran.kode)}</span><h1>Laporan Pagi</h1><span class="muted">Progres sampai akhir hari kerja sebelumnya</span></div>
    <div class="actions"><label style="flex-direction:row;align-items:center">Tanggal <input type="date" id="rd" value="${todayWib()}"></label>
      <button class="btn" id="b-jpg" type="button">Unduh JPG</button><button class="btn btn-primary" id="b-pdf" type="button">Unduh PDF</button></div></header>
  <div class="report-stage"><div class="report" id="report"></div></div>`;
  const draw = () => { $('#report').innerHTML = reportGcu($('#rd').value); };
  $('#rd').onchange = draw; draw();
  const name = () => `Rekap-GCU-${S.putaran.kode.replace(/\s+/g, '')}-${$('#rd').value}`;
  const log = () => isAdmin() && S.db.from('laporan_log').insert({ jenis: 'gcu' }).then(() => {});
  $('#b-jpg').onclick = async () => { await exportJpg($('#report'), name()); log(); };
  $('#b-pdf').onclick = async () => { await exportPdf($('#report'), name()); log(); };
}

function reportGcu(d) {
  // "kemarin" = hari kerja sebelumnya; laporan Senin ikut menghitung Sabtu–Minggu
  let prev = addDays(d, -1); while (!isWorkday(prev) && prev > addDays(d, -7)) prev = addDays(prev, -1);
  const asOf = addDays(d, -1);
  const st = stats(asOf);
  const baru = [...S.gcu.entries()].filter(([, t]) => t >= prev && t <= asOf).map(([h, t]) => ({ h, t, o: S.olt.get(h) }))
    .sort((a, b) => (a.o?.district || '').localeCompare(b.o?.district || '') || a.h.localeCompare(b.h));
  const onTrack = st.sudah >= st.targetNow;
  return `
  <div class="rp-head"><div class="rp-top"><img src="${CONFIG.LOGO}" alt="OLT Monitoring" crossorigin="anonymous"><span>Dibuat ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hourCycle: 'h23' })} WIB</span></div>
    <div><h1>${esc(CONFIG.JUDUL_LAPORAN_GCU)} ${esc(S.putaran.kode)}</h1><p>${fmtTanggalPanjang(d)} · data sampai ${fmtTanggalPanjang(asOf)}</p></div></div>
  <div class="rp-body">
    <div class="rp-kpi"><div><span>Progres</span><b>${pct(st.sudah, st.total).toFixed(1)}%</b></div><div><span>Sudah GCU</span><b>${num(st.sudah)}<span style="font-size:13px;color:#3E5677"> / ${num(st.total)}</span></b></div>
      <div><span>GCU kemarin</span><b>${baru.length}</b></div><div class="${onTrack ? '' : 'w'}"><span>Target / hari kerja</span><b>${num(st.perHari)}</b></div></div>
    <div class="rp-sec"><div class="progress" style="height:16px"><i style="width:${pct(st.sudah, st.total)}%"></i></div>
      <p style="margin:6px 0 0;font-size:11.5px;color:#3E5677">${onTrack ? 'Sesuai jadwal' : `Tertinggal ${num(st.targetNow - st.sudah)} OLT dari jadwal`} · sisa ${num(st.sisa)} OLT dalam ${st.hariKerja} hari kerja sampai ${fmtTanggalPanjang(st.end)}</p></div>
    <div class="rp-sec"><h2>PROGRES PER DISTRICT</h2>${st.perD.sort((a, b) => b.p - a.p).map((x) => `<div class="rp-bar" style="grid-template-columns:150px 1fr 120px;white-space:nowrap"><span>${esc(pretty(x.d))}</span><i style="width:${Math.max(2, x.p)}%;background:${x.p < 30 ? '#E8590C' : '#1E4FD8'}"></i><b>${x.sudah}/${x.total} · ${x.p.toFixed(0)}%</b></div>`).join('')}</div>
    <div class="rp-sec"><h2>DISTRICT × LOKASI (SUDAH / TOTAL)</h2>
      <table class="rp-matrix"><thead><tr><th>District</th>${st.lok.map((l) => `<th>${esc(l)}</th>`).join('')}<th>Total</th></tr></thead><tbody>
      ${st.matrix.map((r) => { const s = r.cells.reduce((a, c) => a + c.sudah, 0), t = r.cells.reduce((a, c) => a + c.total, 0);
        return `<tr><td>${esc(pretty(r.d))}</td>${r.cells.map((c) => c.total ? `<td class="mono" style="background:${heat(pct(c.sudah, c.total))}">${c.sudah}/${c.total}</td>` : '<td>–</td>').join('')}<td class="mono" style="font-weight:600">${s}/${t}</td></tr>`; }).join('')}
      <tr><td><b>Grand Total</b></td>${st.lok.map((l, i) => { const s = st.matrix.reduce((a, r) => a + r.cells[i].sudah, 0), t = st.matrix.reduce((a, r) => a + r.cells[i].total, 0); return `<td class="mono"><b>${s}/${t}</b></td>`; }).join('')}<td class="mono"><b>${st.sudah}/${st.total}</b></td></tr>
      </tbody></table></div>
    <div class="rp-sec"><h2>OLT YANG DI-GCU ${prev === asOf ? 'KEMARIN' : `${+prev.slice(8)}–${+asOf.slice(8)} ${''}`.trim()} · ${baru.length}</h2>
      ${baru.length ? `<div class="rp-tbl"><div class="rp-row h" style="grid-template-columns:26px 1.4fr 1fr 80px 1fr"><span>No</span><span>Hostname</span><span>District</span><span>Lokasi</span><span>Merk / Tipe</span></div>
      ${baru.map((b, i) => `<div class="rp-row" style="grid-template-columns:26px 1.4fr 1fr 80px 1fr"><span class="mono">${i + 1}</span><span class="host">${esc(b.h)}</span><span>${esc(pretty(b.o?.district))}</span><span>${esc(b.o?.lokasi || '–')}</span><span>${esc(b.o?.merk || '')} ${esc(b.o?.tipe || '')}</span></div>`).join('')}</div>` : '<div class="rp-empty">Tidak ada GCU pada periode ini.</div>'}</div>
  </div>
  <div class="rp-foot"><span>Sumber: OLT Monitoring · LIST HOSTNAME OLT</span><span class="mono">${esc(d)}</span></div>`;
}
