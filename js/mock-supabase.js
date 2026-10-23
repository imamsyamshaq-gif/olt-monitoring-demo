/* Pengganti Supabase untuk mode demo.
 * Semua data FIKTIF, dibuat acak (tetap sama tiap dibuka) relatif terhadap tanggal hari ini.
 * Perubahan (input, edit, hapus) hanya tersimpan di memori browser dan hilang saat halaman dimuat ulang. */
(function () {
  // ---------- PRNG agar data konsisten ----------
  let seed = 20261023;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const weighted = (pairs) => { const t = pairs.reduce((s, p) => s + p[1], 0); let r = rnd() * t; for (const [v, w] of pairs) { if ((r -= w) < 0) return v; } return pairs[0][0]; };

  const KATEGORI = ['[POWER SYSTEM] PLN', '[POWER SYSTEM] BATRE', '[POWER SYSTEM] RECTIFIER', '[POWER SYSTEM] MCB/KABEL',
    '[GGN OLT] CARD/MODUL', '[GGN OLT] FAN', '[GGN OLT] SFP', '[TRANSPORT] AKSES', '[TRANSPORT] BACKBONE', '[TRANSPORT] RADIO',
    '[UPLINK] METRO', '[UPLINK] OTN', '[UPLINK] WDM', '[CRA] UPGRADE', '[CRA] RT', 'OLT IDLE / RELOKASI'];
  const DISTRICTS = [
    { d: 'ARGAPURA', r: 'REGIONAL BARAT', code: 'AGU' },
    { d: 'BUANASARI', r: 'REGIONAL BARAT', code: 'BNT' },
    { d: 'CAKRAJAYA', r: 'REGIONAL BARAT', code: 'CKS' },
    { d: 'DIRGAMAS', r: 'REGIONAL TIMUR', code: 'DRB' },
    { d: 'ELANGSARI', r: 'REGIONAL TIMUR', code: 'ELR' },
    { d: 'FAJARMAS', r: 'REGIONAL TIMUR', code: 'FJK' },
  ];
  const VENDOR = [['ZTE', ['C320v2', 'C620', 'C600']], ['HUAWEI', ['MA5608T', 'MA5600T', 'MA5800-X2']], ['FIBERHOME', ['AN5516-04', 'AN6000-2', 'AN6000-17']]];
  const LOKASI = [['STO', 7], ['SHELTER', 2], ['OUTDOOR', 1], ['HRB', 1]];

  // ---------- master OLT ----------
  const olt = [];
  DISTRICTS.forEach((x, di) => {
    const n = 8 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const [merk, tipes] = pick(VENDOR);
      const site = String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + ((i * 7 + di) % 26));
      olt.push({ hostname: `GPON0${i % 4}-D9-${x.code}-${2 + (i % 3)}${site}`, district: x.d, witel: x.r, merk, tipe: pick(tipes), lokasi: weighted(LOKASI) });
    }
  });

  // ---------- gangguan ±290 hari terakhir ----------
  const now = Date.now(), DAY = 864e5;
  const gangguan = [];
  const cause = () => weighted([['[POWER SYSTEM] PLN', 40], ['[TRANSPORT] AKSES', 34], ['[UPLINK] METRO', 7], ['[CRA] RT', 4], ['[CRA] UPGRADE', 3],
    ['[TRANSPORT] RADIO', 2], ['[POWER SYSTEM] MCB/KABEL', 2], ['[GGN OLT] CARD/MODUL', 2], ['[POWER SYSTEM] BATRE', 1], ['[GGN OLT] SFP', 1], ['[GGN OLT] FAN', 1]]);
  const KET = ['FO putus terkena galian proyek', 'Listrik padam dari PLN, genset menyala', 'FO tertimpa pohon tumbang', 'Modul uplink diganti', '', '', '', ''];
  let id = 1;
  for (let k = 0; k < 260; k++) {
    const o = pick(olt);
    const dx = DISTRICTS.find((x) => x.d === o.district);
    const daysAgo = Math.floor(Math.pow(rnd(), 1.15) * 290);
    const down = now - daysAgo * DAY - Math.floor(rnd() * DAY);
    const p = cause();
    const dur = (p === '[TRANSPORT] AKSES' ? 60 + rnd() * 400 : 15 + rnd() * 120) * 60000;
    const up = down + dur;
    gangguan.push({
      id: id++, area: 'AREA DEMO', regional: dx.r, district: o.district, hostname: o.hostname, vendor: o.merk, tipe: o.tipe,
      penyebab: p, date_down: new Date(down).toISOString(), date_up: up < now ? new Date(up).toISOString() : null,
      keterangan: pick(KET) || null, sumber: 'demo',
    });
  }
  // beberapa gangguan hari ini & yang masih DOWN
  [3, 2.2, 0.8].forEach((h) => { const o = pick(olt); const dx = DISTRICTS.find((x) => x.d === o.district);
    gangguan.push({ id: id++, area: 'AREA DEMO', regional: dx.r, district: o.district, hostname: o.hostname, vendor: o.merk, tipe: o.tipe,
      penyebab: h > 1 ? '[POWER SYSTEM] PLN' : '[TRANSPORT] AKSES', date_down: new Date(now - h * 3600e3).toISOString(),
      date_up: h > 2.5 ? new Date(now - (h - 0.7) * 3600e3).toISOString() : null, keterangan: null, sumber: 'demo' }); });
  gangguan.sort((a, b) => a.date_down.localeCompare(b.date_down));

  // ---------- putaran GCU semester berjalan ----------
  const d0 = new Date(), y = d0.getFullYear(), sem2 = d0.getMonth() >= 6;
  const putaran = { kode: `${sem2 ? 'Q2' : 'Q1'} ${y}`, mulai: `${y}-${sem2 ? '07' : '01'}-01`, selesai: `${y}-${sem2 ? '12-31' : '06-30'}`, aktif: true };
  const startMs = Date.parse(putaran.mulai + 'T00:00:00+07:00');
  const frac = Math.min(1, (now - startMs) / (Date.parse(putaran.selesai) - startMs));
  const gcu = [];
  olt.forEach((o) => {
    if (rnd() < frac * 0.85) {
      const t = startMs + rnd() * (now - startMs - DAY);
      gcu.push({ putaran: putaran.kode, hostname: o.hostname, tanggal: new Date(t + 7 * 3600e3).toISOString().slice(0, 10) });
    }
  });

  const DB = {
    pengguna: [{ email: 'demo@contoh.id', nama: 'Pengguna Demo', peran: 'admin' }],
    kategori: KATEGORI.map((nama, i) => ({ nama, urutan: i + 1 })),
    olt, gangguan, gcu_putaran: [putaran], gcu, foto: [], laporan_log: [],
  };
  const PK = { gcu: ['putaran', 'hostname'], olt: ['hostname'], gangguan: ['id'] };

  // contoh teks untuk tombol "Isi contoh" di halaman input
  const ex1 = olt[2], ex2 = olt[olt.length - 3];
  const ts = (ms) => new Date(ms + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
  window.DEMO_SAMPLE =
    `AREA DEMO\tREGIONAL BARAT\t${ex1.district}\t${ex1.hostname} ${ex1.merk}\t${ex1.tipe}\t\n[TRANSPORT] AKSES\n \n\n${ts(now - 5 * 3600e3)}\t${ts(now - 3 * 3600e3)}\t2 Jam\n\n` +
    `✅✅Notifikasi OLT Recovery!✅✅\n\nNode ID : ${ex2.hostname}\nStatus : UP\nArea : AREA DEMO\nRegion : REGIONAL TIMUR\nDistrict : ${ex2.district}\nDown At : ${ts(now - 90 * 60e3)}\nRecovered At : ${ts(now - 40 * 60e3)}\nDown Duration : 50 Menit`;

  // ---------- query builder mirip supabase-js ----------
  function Q(t) { this.t = t; this.f = []; this.op = 'select'; this.ord = null; this.rg = null; this.one = 0; }
  const P = Q.prototype;
  P.select = function () { this.ret = true; return this; };
  P.eq = function (k, v) { this.f.push((r) => String(r[k]).toLowerCase() === String(v).toLowerCase()); return this; };
  P.lt = function (k, v) { this.f.push((r) => r[k] < v); return this; };
  P.gte = function (k, v) { this.f.push((r) => r[k] >= v); return this; };
  P.or = function () { return this; };
  P.order = function (k, o) { this.ord = [k, !(o && o.ascending === false)]; return this; };
  P.limit = function (n) { this.lim = n; return this; };
  P.range = function (a, b) { this.rg = [a, b]; return this; };
  P.maybeSingle = function () { this.one = 1; return this; };
  P.single = function () { this.one = 2; return this; };
  P.insert = function (rows) { this.op = 'insert'; this.rows = [].concat(rows); return this; };
  P.upsert = function (rows) { this.op = 'upsert'; this.rows = [].concat(rows); return this; };
  P.update = function (v) { this.op = 'update'; this.val = v; return this; };
  P.delete = function () { this.op = 'delete'; return this; };
  P.then = function (res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); };
  P.run = function () {
    const tbl = DB[this.t] || (DB[this.t] = []);
    const match = (r) => this.f.every((f) => f(r));
    let out = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      for (const row of this.rows) {
        const r = { ...row };
        if (this.t === 'gangguan' && !r.id) r.id = Math.max(0, ...tbl.map((x) => x.id)) + 1;
        if (this.t === 'laporan_log') { r.id = tbl.length + 1; r.dibuat = new Date().toISOString(); }
        const pk = PK[this.t];
        const ex = pk && tbl.find((x) => pk.every((k) => x[k] === r[k]));
        if (ex && this.op === 'upsert') Object.assign(ex, r);
        else if (ex) return { data: null, error: { message: 'Data sudah ada' } };
        else tbl.push(r);
        out.push(r);
      }
    } else if (this.op === 'update') {
      tbl.filter(match).forEach((r) => Object.assign(r, this.val)); out = tbl.filter(match);
    } else if (this.op === 'delete') {
      out = tbl.filter(match); DB[this.t] = tbl.filter((r) => !match(r));
    } else {
      out = tbl.filter(match);
      if (this.ord) { const [k, a] = this.ord; out = [...out].sort((x, y) => (x[k] > y[k] ? 1 : x[k] < y[k] ? -1 : 0) * (a ? 1 : -1)); }
      if (this.lim) out = out.slice(0, this.lim);
      if (this.rg) out = out.slice(this.rg[0], this.rg[1] + 1);
    }
    out = JSON.parse(JSON.stringify(out));
    return { data: this.one ? (out[0] || null) : out, error: null };
  };

  const session = { user: { email: 'demo@contoh.id' }, access_token: 'demo' };
  window.supabase = {
    createClient() {
      return {
        from: (t) => new Q(t),
        auth: {
          getSession: async () => ({ data: { session } }),
          signOut: async () => {}, signInWithPassword: async () => ({}), signInWithOAuth: async () => ({}),
        },
      };
    },
  };
})();
