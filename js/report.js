// Ekspor elemen laporan ke JPG (bisa terpecah jadi beberapa gambar) atau PDF A4.
import { toast } from './util.js';

async function capture(el) {
  await document.fonts.ready;
  return html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 900 });
}
function download(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

// Gambar panjang dipotong per ±1500 px (ukuran layar) agar enak dibaca di WhatsApp.
export async function exportJpg(el, baseName) {
  toast('Menyiapkan gambar…');
  const c = await capture(el);
  const sliceH = Math.round(1500 * 2);
  const parts = Math.max(1, Math.ceil(c.height / sliceH));
  for (let i = 0; i < parts; i++) {
    const h = Math.min(sliceH, c.height - i * sliceH);
    const p = document.createElement('canvas'); p.width = c.width; p.height = h;
    p.getContext('2d').drawImage(c, 0, i * sliceH, c.width, h, 0, 0, c.width, h);
    download(p.toDataURL('image/jpeg', 0.9), parts > 1 ? `${baseName}-${i + 1}.jpg` : `${baseName}.jpg`);
  }
  toast(parts > 1 ? `${parts} gambar diunduh` : 'Gambar diunduh');
}

export async function exportPdf(el, baseName) {
  toast('Menyiapkan PDF…');
  const c = await capture(el);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  const pageHpx = Math.floor(c.width * ph / pw);
  for (let y = 0, i = 0; y < c.height; y += pageHpx, i++) {
    const h = Math.min(pageHpx, c.height - y);
    const p = document.createElement('canvas'); p.width = c.width; p.height = h;
    p.getContext('2d').drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);
    if (i) pdf.addPage();
    pdf.addImage(p.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, h * pw / c.width);
  }
  pdf.save(`${baseName}.pdf`);
  toast('PDF diunduh');
}
