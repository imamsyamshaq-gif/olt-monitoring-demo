# OLT Monitoring — Demo

Demo website monitoring gangguan OLT dan progres GCU (General Check-up Unit).

**Semua data di demo ini fiktif** (nama district, hostname, tanggal, angka dibuat acak di browser). Tidak terhubung ke database; perubahan hilang saat halaman dimuat ulang.

Fitur: dashboard interaktif (klik grafik untuk rincian), jam WIB, input gangguan dari teks paste (2 format), edit data, laporan harian JPG/PDF, dashboard & laporan progres GCU.

Stack versi produksi: HTML/CSS/JavaScript, Supabase (Postgres + Auth + RLS), Google Apps Script (sinkron Google Sheets & foto Drive), Cloudflare Pages.

Deploy: Cloudflare Pages, framework preset None, tanpa build command, output directory `/`.
