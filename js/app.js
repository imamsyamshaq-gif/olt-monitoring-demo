import { CONFIG } from './config.js';
import { S, $, $$, esc, num, pct, todayWib, fetchAll, toast, closeDrawer, isAdmin, fmtTanggalPanjang } from './util.js';
import { viewGgnDashboard, viewGgnInput, viewGgnData, viewGgnLaporan } from './ggn.js';
import { viewGcuDashboard, viewGcuInput, viewGcuLaporan } from './gcu.js';

// ---------------- Loader (video + persen) ----------------
const loader = { pct: 0, videoDone: false, dataDone: false };
function setPct(p) {
  loader.pct = Math.max(loader.pct, Math.min(100, Math.round(p)));
  $('#loader-num').textContent = loader.pct;
  $('#loader-fill').style.width = loader.pct + '%';
  maybeHideLoader();
}
function maybeHideLoader() {
  if (loader.pct >= 100 && loader.videoDone && !loader.hidden) {
    loader.hidden = true;
    $('#loader').classList.add('done');
    setTimeout(() => $('#loader').remove(), 500);
  }
}
function startLoader() {
  const v = $('#loader-video');
  const finish = () => { loader.videoDone = true; maybeHideLoader(); };
  if (!CONFIG.LOADER_VIDEO) { v.remove(); setTimeout(finish, 2600); }
  else $('#loader-logo')?.remove();
  if (!CONFIG.LOADER_VIDEO) { const tick = setInterval(() => { if (loader.pct < 85) setPct(loader.pct + 4); else clearInterval(tick); }, 90); return; }
  v.src = CONFIG.LOADER_VIDEO;
  v.addEventListener('ended', finish);          // berhenti di frame terakhir sampai data siap
  v.addEventListener('error', finish);
  setTimeout(finish, 6000);                     // pengaman bila video lambat
  v.play().catch(finish);
  // persen naik pelan sambil menunggu, lalu dikejar ke 100 saat selesai
  const tick = setInterval(() => { if (loader.pct < 85) setPct(loader.pct + 3); else clearInterval(tick); }, 120);
}

// ---------------- Auth ----------------
async function initAuth() {
  S.db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  $('#login-logo').src = CONFIG.LOGO; $('#side-logo').src = CONFIG.LOGO;

  $('#btn-google').onclick = () => S.db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  $('#form-email').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await S.db.auth.signInWithPassword({ email: $('#in-email').value.trim(), password: $('#in-pass').value });
    if (error) $('#login-msg').textContent = 'Email atau password salah.';
    else location.reload();
  };
  $('#btn-logout').onclick = async () => { await S.db.auth.signOut(); location.hash = ''; location.reload(); };

  const { data: { session } } = await S.db.auth.getSession();
  setPct(20);
  if (!session) return false;
  S.user = session.user;
  const { data: me } = await S.db.from('pengguna').select('*').eq('email', S.user.email.toLowerCase()).maybeSingle();
  if (!me) {
    await S.db.auth.signOut();
    $('#login-msg').textContent = `${S.user.email} belum terdaftar. Hubungi admin.`;
    return false;
  }
  S.role = me.peran;
  $('#who-name').textContent = me.nama || S.user.email;
  $('#who-role').textContent = me.peran === 'admin' ? 'Admin' : 'Viewer';
  $('#who-init').textContent = (me.nama || S.user.email)[0].toUpperCase();
  return true;
}

// ---------------- Data ----------------
export async function loadData() {
  const tahun = new Date().getFullYear();
  const [kat, olt, ggn, put] = await Promise.all([
    S.db.from('kategori').select('nama').order('urutan'),
    fetchAll('olt', 'hostname,district,witel,merk,tipe,lokasi'),
    fetchAll('gangguan', '*', (q) => q.or(`date_down.gte.${tahun - 1}-12-01,date_up.is.null`).order('date_down')),
    S.db.from('gcu_putaran').select('*').eq('aktif', true).maybeSingle(),
  ]);
  setPct(75);
  S.kategori = (kat.data || []).map((k) => k.nama);
  S.olt = new Map(olt.map((o) => [o.hostname, o]));
  S.gangguan = ggn;
  S.putaran = put.data;
  if (S.putaran) {
    const g = await fetchAll('gcu', 'hostname,tanggal', (q) => q.eq('putaran', S.putaran.kode));
    S.gcu = new Map(g.map((r) => [r.hostname, r.tanggal]));
  }
  const f = await S.db.from('foto').select('*').gte('hapus_pada', todayWib());
  S.foto = f.data || [];
}

// ---------------- Beranda ----------------
let clockTimer;
export function clockWidget() {
  return `<div class="card kpi clock"><span>Jam WIB</span><b id="clock">--:--:--</b><small id="clock-date"></small></div>`;
}
export function startClock() {
  clearInterval(clockTimer);
  const f = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const run = () => {
    const el = $('#clock'); if (!el) return clearInterval(clockTimer);
    el.textContent = f.format(new Date()).replace(/\./g, ':');
    $('#clock-date').textContent = fmtTanggalPanjang(todayWib());
  };
  run(); clockTimer = setInterval(run, 1000);
}

function viewHome(el) {
  const today = todayWib();
  const open = S.gangguan.filter((g) => !g.date_up);
  const hariIni = S.gangguan.filter((g) => g.date_down >= new Date(today + 'T00:00:00+07:00').toISOString());
  const total = S.olt.size, done = S.gcu.size;
  el.innerHTML = `
    <header class="page-head"><div><span class="eyebrow">OLT MONITORING · DEMO</span><h1>Ringkasan</h1></div></header>
    <section class="grid g-kpi">
      ${clockWidget()}
      <a class="card kpi ${open.length ? 'warn' : ''}" href="#/ggn" style="text-decoration:none"><span>OLT masih DOWN</span><b>${num(open.length)}</b><small>Lihat dashboard gangguan</small></a>
      <a class="card kpi" href="#/ggn" style="text-decoration:none"><span>Gangguan hari ini</span><b>${num(hariIni.length)}</b><small>Sejak 00.00 WIB</small></a>
      <a class="card kpi" href="#/gcu" style="text-decoration:none"><span>Progres GCU ${esc(S.putaran?.kode || '')}</span><b>${pct(done, total).toFixed(0)}%</b><small>${num(done)} dari ${num(total)} OLT</small></a>
    </section>
    <section class="grid g-2">
      <div class="card"><div class="card-head"><h2>Laporan pagi · GCU</h2><span class="muted">08–09 WIB</span></div><p class="muted">Rekap progres GCU untuk dikirim ke grup.</p><a class="btn btn-dark" href="#/gcu/laporan">Buat laporan GCU</a></div>
      <div class="card"><div class="card-head"><h2>Laporan sore · Gangguan</h2><span class="muted">16–17 WIB</span></div><p class="muted">Rekap OLT down hari ini beserta foto teknisi.</p><a class="btn btn-primary" href="#/ggn/laporan">Buat laporan gangguan</a></div>
    </section>`;
  startClock();
}

// ---------------- Router ----------------
const ROUTES = {
  '/': viewHome,
  '/ggn': viewGgnDashboard, '/ggn/input': viewGgnInput, '/ggn/data': viewGgnData, '/ggn/laporan': viewGgnLaporan,
  '/gcu': viewGcuDashboard, '/gcu/input': viewGcuInput, '/gcu/laporan': viewGcuLaporan,
};
function route() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const fn = ROUTES[path] || viewHome;
  closeDrawer();
  $$('.nav-group a').forEach((a) => a.classList.toggle('on', a.dataset.nav === path));
  const el = $('#view');
  try { fn(el); } catch (e) { console.error(e); el.innerHTML = `<div class="card">Terjadi kesalahan: ${esc(e.message)}</div>`; }
  el.focus({ preventScroll: true }); window.scrollTo(0, 0);
}
export const rerender = route;

// ---------------- Start ----------------
(async function main() {
  startLoader();
  $('#drawer-close').onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  try {
    const ok = await initAuth();
    if (!ok) { setPct(100); $('#login').hidden = false; return; }
    await loadData();
    if (!isAdmin()) $$('[data-admin]').forEach((a) => a.remove());
    setPct(100);
    $('#app').hidden = false;
    window.addEventListener('hashchange', route);
    route();
  } catch (e) {
    console.error(e); setPct(100);
    $('#login').hidden = false;
    $('#login-msg').textContent = 'Gagal memuat data. Cek koneksi lalu muat ulang.';
    toast(e.message || String(e));
  }
})();
