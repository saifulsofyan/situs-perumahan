#!/usr/bin/env node
// Membuat situs statis dari folder perumahan/ dan data/rumah.json. Jalankan: npm run build  (atau: node build.mjs)
// Hasil ada di folder "situs/" (Cloudflare Pages membuatnya sendiri tiap kali ada perubahan di GitHub).
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInfo, slugify } from './lib/info.mjs';
import { daftarFoto, prosesFoto, muatSharp } from './lib/foto.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FINAL = process.env.OUT || join(ROOT, 'situs');
const OUT = FINAL + '.tmp'; // ditulis dulu di sini; baru menggantikan hasil lama kalau semuanya berhasil
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'rumah.json'), 'utf8'));
const C = data.config;
if (process.env.DEMO) C.demo = process.env.DEMO !== 'false';
const DEMO = Boolean(C.demo);

/* ---------- Pemeriksaan data (semua masalah ditampilkan sekaligus) ---------- */
const galat = [];
const berhenti = () => {
  rmSync(OUT, { recursive: true, force: true });
  console.error(`\nGALAT DATA (${galat.length} masalah). Perbaiki lalu simpan ulang:\n`);
  for (const g of galat) console.error(' - ' + g);
  console.error('\nBuild dihentikan. Hasil build sebelumnya tidak diganti.');
  process.exit(1);
};

if (Array.isArray(data.perumahan) && data.perumahan.length) {
  galat.push('data/rumah.json masih memuat daftar "perumahan" model lama. Pindahkan tiap rumah ke folder perumahan/<nama-rumah>/info.txt, lalu hapus bagian "perumahan" dan "lokasi" dari rumah.json');
}
for (const [k, s] of Object.entries(C.sales || {})) {
  if (!/^628\d{7,12}$/.test(s.wa)) galat.push(`sales "${k}": nomor WhatsApp harus berformat 628xxxxxxxxxx (tanpa +, spasi, atau 0 di depan)`);
}
if (!C.sales || !C.sales[C.defaultSales]) galat.push('defaultSales tidak ada di daftar sales');

const RUMAH_DIR = join(ROOT, 'perumahan');
const folders = existsSync(RUMAH_DIR)
  ? readdirSync(RUMAH_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && !/^[_.]/.test(d.name)).map((d) => d.name).sort()
  : [];
if (!folders.length) galat.push('belum ada perumahan. Buat folder perumahan/<nama-rumah>/ berisi info.txt dan foto (contoh isi ada di perumahan/_salin-ini/info.txt)');

const sharp = await muatSharp();
if (!sharp) {
  if (!DEMO) galat.push('modul sharp (pengecil foto) belum terpasang. Jalankan "npm install" dulu, atau biarkan Cloudflare yang membangun dari GitHub');
  else console.warn('Peringatan: modul sharp belum terpasang, foto disalin apa adanya tanpa dikecilkan.');
}

const daftarRumah = [];
const slugDari = new Map();
for (const folder of folders) {
  const slug = slugify(folder);
  if (!slug) { galat.push(`folder "${folder}": nama folder harus memuat huruf atau angka`); continue; }
  if (slugDari.has(slug)) { galat.push(`folder "${folder}" dan "${slugDari.get(slug)}" menghasilkan alamat halaman yang sama (${slug}). Ganti salah satu namanya`); continue; }
  slugDari.set(slug, folder);
  if (!DEMO && /^contoh(-|$)/.test(slug)) galat.push(`[${folder}] ini data contoh bawaan. Hapus folder ini (atau ganti namanya dan isinya dengan data asli) sebelum tayang`);
  const dir = join(RUMAH_DIR, folder);
  const infoFile = readdirSync(dir).find((f) => /^info(\.txt)*$/i.test(f));
  if (!infoFile) { galat.push(`[${folder}] tidak ada info.txt di folder ini`); continue; }
  const { rumah, galat: g } = parseInfo(readFileSync(join(dir, infoFile), 'utf8'), `[${folder}]`, { produksi: !DEMO });
  galat.push(...g);
  const { foto, ditolak } = daftarFoto(dir);
  for (const f of ditolak) galat.push(`[${folder}] ${f}: format HEIC/HEIF belum didukung. Simpan sebagai JPG`);
  if (!DEMO && !foto.length) galat.push(`[${folder}] belum ada foto. Mode tayang (demo:false) wajib memakai foto asli. Taruh foto JPG, PNG, atau WebP di folder ini`);
  daftarRumah.push({ ...rumah, slug, folder, fileFoto: foto });
}

// Lokasi diambil dari isian "lokasi:" tiap rumah (tulisan yang sama = lokasi yang sama).
const lokasiMap = new Map();
for (const p of daftarRumah) {
  const ls = slugify(p.lokasiNama);
  if (p.lokasiNama && !ls) galat.push(`[${p.folder}] lokasi "${p.lokasiNama}" harus memuat huruf atau angka`);
  p.lokasi = ls;
  if (ls && !lokasiMap.has(ls)) lokasiMap.set(ls, { slug: ls, nama: p.lokasiNama });
}
data.lokasi = [...lokasiMap.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
daftarRumah.sort((a, b) => a.urutan - b.urutan || a.slug.localeCompare(b.slug));
data.perumahan = daftarRumah;
if (galat.length) berhenti();

/* ---------- Pembantu ---------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const m = (s) => (DEMO ? `<mark class="isi">${esc(s)}</mark>` : esc(s));
const dc = DEMO ? ' data-contoh' : '';
const jsonInline = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function rupiah(n) {
  if (n >= 1e9) return 'Rp ' + String(Math.round((n / 1e9) * 100) / 100).replace('.', ',') + ' miliar';
  return 'Rp ' + Math.round(n / 1e6) + ' juta';
}
const avail = (p) => p.tipe.filter((t) => t.status !== 'Terjual');
const minHarga = (p) => { const a = avail(p); return a.length ? Math.min(...a.map((t) => t.harga)) : null; };
const minLt = (p) => Math.min(...(avail(p).length ? avail(p) : p.tipe).map((t) => t.lt));

const DEFAULT_AKSES = [
  { nama: 'Jalan raya utama', waktu: 'xx menit' },
  { nama: 'Stasiun atau halte', waktu: 'xx menit' },
  { nama: 'Sekolah dan pasar', waktu: 'xx menit' },
  { nama: 'Rumah sakit', waktu: 'xx menit' },
];

/* ---------- Ilustrasi contoh (dipakai hanya selama belum ada foto) ---------- */
const SETS = [
  { sky: '#D5EAE0', roof: '#1D4B3B', wall: '#FFFFFF', acc: '#F4B63F', hill: '#9CC4B0', ground: '#2E6B55' },
  { sky: '#E3EEF3', roof: '#5B3A2A', wall: '#FFF6EA', acc: '#2E6B55', hill: '#B5D3C2', ground: '#3C7A5F' },
  { sky: '#F1EBDD', roof: '#2F4858', wall: '#F4F8FA', acc: '#F4B63F', hill: '#A9CBB9', ground: '#2A6650' },
  { sky: '#DCEBE4', roof: '#7A3B33', wall: '#FFFFFF', acc: '#CFE5DB', hill: '#9CC4B0', ground: '#2E6B55' },
  { sky: '#E6EFEA', roof: '#3D5A40', wall: '#FBFBF3', acc: '#F4B63F', hill: '#B2D2C1', ground: '#34705A' },
];
function ilustrasi(i) {
  const c = SETS[i % SETS.length];
  const two = i % 2 === 1;
  const top = two ? 100 : 150;
  const roofBase = top + 6;
  const roofPeak = top - (two ? 56 : 58);
  const win = (x, y) =>
    `<rect x="${x}" y="${y}" width="34" height="30" rx="3" fill="${c.acc}"/><path d="M${x + 17} ${y}V${y + 30}M${x} ${y + 15}H${x + 34}" stroke="#fff" stroke-width="3"/>`;
  const windows = two ? win(126, 120) + win(240, 120) + win(126, 196) + win(240, 196) : win(126, 176) + win(240, 176);
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustrasi contoh rumah" focusable="false">
<rect width="400" height="300" fill="${c.sky}"/>
<circle cx="330" cy="62" r="26" fill="#F4B63F" opacity=".9"/>
<path d="M0 232 Q110 190 220 224 T400 210 V300 H0Z" fill="${c.hill}"/>
<path d="M0 262 Q140 238 280 258 T400 252 V300 H0Z" fill="${c.ground}"/>
<rect x="110" y="${top}" width="180" height="${262 - top}" rx="3" fill="${c.wall}"/>
<polygon points="92,${roofBase} 200,${roofPeak} 308,${roofBase}" fill="${c.roof}"/>
${windows}
<path d="M186 262V${two ? 236 : 222}a14 14 0 0 1 28 0V262Z" fill="${c.roof}"/>
<circle cx="58" cy="236" r="26" fill="${c.ground}"/><rect x="55" y="252" width="6" height="22" fill="${c.roof}"/>
<circle cx="348" cy="240" r="22" fill="${c.ground}"/><rect x="345" y="254" width="6" height="20" fill="${c.roof}"/>
</svg>`;
}
const labelContoh = DEMO ? '<span class="ph-label">Ilustrasi contoh</span>' : '';
function fotoKartu(p, i, base) {
  if (p.kartu) {
    return `<img src="${base}foto/${p.slug}/${esc(p.kartu.file)}" alt="${esc(p.nama)}" width="${p.kartu.w}" height="${p.kartu.h}" loading="lazy" decoding="async">`;
  }
  return ilustrasi(i) + labelContoh;
}

/* ---------- Isi bersama ---------- */
const IKON_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const JANJI = [
  { ikon: IKON_PIN, judul: 'Survei dulu, tanpa kewajiban membeli', ket: 'Lihat lokasi dan rumah contoh sebelum memutuskan.' },
  { ikon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>', judul: 'Legalitas dijelaskan sebelum booking', ket: 'Jenis sertifikat dan izin proyek disampaikan jelas.' },
  { ikon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>', judul: 'Pembayaran hanya ke rekening resmi', ket: 'Atas nama perusahaan, dengan kuitansi resmi.' },
  { ikon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2"/></svg>', judul: 'Simulasi KPR dibantu marketing', ket: 'Persetujuan KPR sepenuhnya keputusan bank.' },
];
const CARA = [
  ['Pilih perumahan dan tipe', 'Lihat daftar, lalu tekan Tanya harga pada rumah yang Anda minati.'],
  ['Isi nama dan nomor HP', 'WhatsApp terbuka dengan pesan yang sudah terisi, dan tim marketing menjawab di sana.'],
  ['Survei lokasi dan rumah contoh', 'Lihat langsung lingkungan dan unitnya, tanpa kewajiban membeli.'],
  ['Booking', 'Tanda jadi dibayar ke rekening resmi perusahaan, lalu Anda menerima kuitansi.'],
  ['KPR atau pembayaran, lalu akad', 'Marketing mendampingi sampai akad dan serah terima.'],
];
const FAQ = [
  ['Apakah harga di website sudah final?', 'Harga dan ketersediaan dapat berubah. Angka final disampaikan marketing saat booking.'],
  ['Apakah bisa dibeli dengan KPR?', 'Bisa. Tim marketing membantu simulasi dan menjelaskan syarat pengajuan KPR. Persetujuan KPR sepenuhnya keputusan bank.'],
  ['Biaya apa saja di luar harga rumah?', 'Biaya tambahan seperti pajak, notaris, dan biaya KPR dijelaskan secara tertulis oleh marketing sebelum Anda membayar tanda jadi.'],
  ['Ke mana pembayaran tanda jadi dikirim?', 'Hanya ke rekening resmi atas nama perusahaan, bukan rekening pribadi sales. Anda berhak meminta kuitansi resmi.'],
  ['Kapan bisa survei?', 'Jadwal survei diatur bersama tim marketing lewat WhatsApp.'],
];
// Bagian dengan judul di kiri dan isi di kanan (di layar lebar); bertumpuk di HP.
const seksi = (id, judul, intro, isi, garis = true) => `
<section class="bagian${garis ? ' bagian-garis' : ''}" id="${id}" aria-labelledby="h-${id}">
  <div class="wrap pecah">
    <div class="kepala"><h2 id="h-${id}">${judul}</h2>${intro ? `<p class="intro">${esc(intro)}</p>` : ''}</div>
    <div class="badan">${isi}</div>
  </div>
</section>`;
const caraSection = () => seksi('cara', 'Cara membeli', '',
  `<ol class="langkah">${CARA.map(([a, b]) => `<li><strong>${esc(a)}</strong><span>${esc(b)}</span></li>`).join('')}</ol>`);
const faqSection = () => seksi('faq', 'Pertanyaan yang sering muncul', '',
  `<div class="tanya-jawab">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`);
const ctaBlok = (judul, teks, slug) => `
<section class="masuk" id="cta" aria-labelledby="h-cta"><div class="wrap">
  <h2 id="h-cta">${judul}</h2>
  <p class="intro">${esc(teks)}</p>
  <button type="button" class="tombol" data-buka-lead${slug ? ` data-p="${slug}"` : ''}>Jadwalkan survei lewat WhatsApp</button>
</div></section>`;

/* ---------- Kartu perumahan ---------- */
function kartu(p, i, base, filter) {
  const lok = lokasiMap.get(p.lokasi);
  const a = avail(p), habis = a.length === 0, h = minHarga(p);
  const href = `${base}rumah/${p.slug}/`;
  return `
<article class="kartu"${filter ? ` data-lokasi="${p.lokasi}"` : ''}>
  <div class="kartu-foto-wrap" style="position:relative">
    <a class="kartu-foto" href="${href}" data-int tabindex="-1" aria-hidden="true">${fotoKartu(p, i, base)}</a>
    <span class="chip-lokasi">${esc(lok.nama)}</span>
  </div>
  <div class="kartu-isi">
    <h3><a href="${href}" data-int>${m(p.nama)}</a></h3>
    <p class="alamat">${m(p.alamat)}</p>
    <div class="harga-baris">${habis ? '<strong class="habis-teks">Semua tipe terjual</strong>' : `<small>Harga mulai</small><strong>${m(rupiah(h))}</strong>`}</div>
    <p class="spek-mini"><span>${habis ? p.tipe.length + ' tipe' : a.length + ' tipe tersedia'}</span><span>Tanah mulai ${m(minLt(p) + ' m²')}</span></p>
    <div class="aksi-kartu">
      <a class="tombol tombol-tipis" href="${href}" data-int>Lihat detail</a>
      ${habis ? '' : `<button type="button" class="tombol" data-buka-lead data-p="${p.slug}">Tanya harga</button>`}
    </div>
  </div>
</article>`;
}

/* ---------- Kerangka halaman ---------- */
function page({ depth, title, desc, main, canonicalPath, ogImage, pageInfo }) {
  const base = '../'.repeat(depth);
  const home = base || './';
  const canonical = C.domain ? C.domain.replace(/\/$/, '') + canonicalPath : '';
  const site = {
    config: { brand: C.brand, appsScriptUrl: C.appsScriptUrl, metaPixelId: C.metaPixelId, defaultSales: C.defaultSales, sales: C.sales, demo: DEMO },
    perumahan: data.perumahan.map((p) => ({ slug: p.slug, nama: p.nama, lokasi: p.lokasi, tipe: avail(p).map((t) => t.nama) })),
    page: pageInfo || null,
  };
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${DEMO ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<meta name="theme-color" content="#1D4B3B">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:url" content="${esc(canonical)}">\n` : ''}${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${base}assets/style.css">
</head>
<body>
${DEMO ? '<div class="contoh" role="note">Halaman contoh. Teks bertanda kuning adalah data contoh yang harus diganti sebelum iklan dijalankan.</div>\n' : ''}
<header class="atas"><div class="wrap atas-isi">
  <a class="merek" href="${home}" data-int>${m(C.brand)}</a>
  <nav class="menu" aria-label="Utama">
    <a href="${base}#katalog" data-int>Perumahan</a>
    <a href="${base}#cara" data-int>Cara membeli</a>
    <a href="${base}#kontak" data-int>Kontak</a>
  </nav>
  <button type="button" class="tombol tombol-tipis" data-buka-lead>Tanya harga</button>
</div></header>

<main>
${main}
</main>

<footer class="kaki" id="kontak">
  <div class="wrap">
    <strong>${m(C.perusahaan)}</strong>
    <p>${m(C.alamat)}</p>
    <p>Telepon: ${m(C.telepon)} &nbsp; Email: ${m(C.email)}</p>
    <p>Jam layanan: ${m(C.jamKerja)}</p>
    <p class="penafian">Gambar, render, dan denah bersifat ilustrasi. Harga, promo, dan ketersediaan unit dapat berubah sewaktu-waktu. Informasi final disampaikan tim marketing saat booking.</p>
    <p>&copy; <span data-tahun></span> ${m(C.perusahaan)} &nbsp; <button type="button" class="tautan-btn" data-buka-privasi>Kebijakan privasi</button></p>
  </div>
</footer>

<div class="lengket" id="lengket"><button type="button" class="tombol" data-buka-lead>Tanya harga dan jadwal survei</button></div>

<dialog class="dlg-lead" id="lead" aria-labelledby="h-lead">
  <button type="button" class="tutup" data-tutup aria-label="Tutup">&times;</button>
  <h2 id="h-lead">Tanya harga atau jadwalkan survei</h2>
  <p class="intro-dlg">Isi nama dan nomor HP. WhatsApp akan terbuka dengan pesan yang sudah terisi.</p>
  <form class="form" id="form-lead" novalidate>
    <label>Nama
      <input name="nama" type="text" autocomplete="name" required maxlength="60">
      <span class="galat" data-galat="nama" role="alert"></span>
    </label>
    <label>Nomor HP (WhatsApp)
      <input name="hp" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20" placeholder="0812 3456 7890">
      <span class="galat" data-galat="hp" role="alert"></span>
    </label>
    <label>Yang diminati
      <select name="minat"></select>
    </label>
    <button class="tombol" type="submit" id="kirim">Lanjut ke WhatsApp</button>
    <p class="siapa" id="siapa" aria-live="polite"></p>
    <p class="catatan-form">Dengan melanjutkan, Anda setuju nama dan nomor HP Anda dipakai tim marketing untuk menghubungi Anda. <button type="button" class="tautan-btn" data-buka-privasi>Kebijakan privasi</button></p>
  </form>
</dialog>

<dialog id="privasi" aria-labelledby="h-privasi">
  <h2 id="h-privasi">Kebijakan privasi</h2>
  <p>Kami mengumpulkan nama, nomor HP, perumahan dan tipe yang Anda pilih, serta asal iklan yang Anda klik. Data ini dipakai untuk menghubungi Anda tentang perumahan yang Anda minati.</p>
  <p>Data disimpan di sistem perusahaan dan hanya dilihat tim marketing serta pengelola proyek. Kami tidak menjual data Anda.</p>
  <p>Situs ini dapat memakai alat pengukur iklan seperti Meta Pixel untuk mengetahui iklan mana yang efektif.</p>
  <p>Untuk meminta data Anda dihapus, hubungi kami di ${m(C.telepon)}.</p>
  <form method="dialog"><button class="tombol" type="submit">Tutup</button></form>
</dialog>

<script>window.SITE=${jsonInline(site)};</script>
<script src="${base}assets/app.js" defer></script>
</body>
</html>
`;
}

/* ---------- Beranda ---------- */
function berandaMain() {
  const tiles = data.lokasi.map((l, i) => {
    const n = data.perumahan.filter((p) => p.lokasi === l.slug).length;
    return `<a class="tile t${i % 4}" href="#katalog" data-lokasi="${l.slug}">${IKON_PIN}<span class="tile-nama">${esc(l.nama)}</span><span class="tile-jumlah">${n} perumahan</span></a>`;
  }).join('');
  const tabs = [`<button type="button" class="tab" aria-pressed="true" data-lokasi="semua">Semua lokasi</button>`]
    .concat(data.lokasi.map((l) => `<button type="button" class="tab" aria-pressed="false" data-lokasi="${l.slug}">${esc(l.nama)}</button>`)).join('');
  const cards = data.perumahan.map((p, i) => kartu(p, i, '', true)).join('');
  return `
<section class="hero" aria-labelledby="judul"><div class="wrap hero-grid">
  <div class="hero-teks">
    <h1 id="judul">Cari rumah di lokasi yang Anda inginkan</h1>
    <p class="lead">Pilih area, bandingkan perumahan dan harganya, lalu jadwalkan survei bersama tim marketing kami.</p>
    <p class="catatan">Harga dan ketersediaan dapat berubah. Informasi final disampaikan marketing saat booking.</p>
    <div class="aksi">
      <a class="tombol" href="#katalog">Lihat perumahan</a>
      <button type="button" class="tombol tombol-tipis" data-buka-lead>Tanya lewat WhatsApp</button>
    </div>
  </div>
  <div class="pilih-lokasi">
    <h2>Pilih lokasi</h2>
    <div class="lokasi-grid">${tiles}</div>
  </div>
</div></section>

<section class="bagian" aria-label="Cara kami bekerja"><div class="wrap">
  <ul class="janji">${JANJI.map((j) => `<li><span class="ikon">${j.ikon}</span><strong>${esc(j.judul)}</strong><span class="ket">${esc(j.ket)}</span></li>`).join('')}</ul>
</div></section>

<section class="bagian bagian-garis" id="katalog" aria-labelledby="h-katalog"><div class="wrap">
  <h2 id="h-katalog">Perumahan pilihan</h2>
  <p class="intro">Pilih lokasi untuk menyaring daftar. Harga dan ketersediaan dapat berubah, jadi tanyakan ke marketing untuk angka terbaru.</p>
  <div class="tabs" role="group" aria-label="Saring menurut lokasi">${tabs}</div>
  <p class="hitung" id="hitung" aria-live="polite">${data.perumahan.length} perumahan</p>
  <div class="grid">${cards}</div>
  <p class="kosong" id="kosong" hidden>Belum ada perumahan di lokasi ini. Hubungi kami untuk info terbaru.</p>
</div></section>
${caraSection()}
${faqSection()}
${ctaBlok('Belum menemukan yang cocok?', 'Ceritakan kebutuhan Anda. Isi nama dan nomor HP, lalu WhatsApp terbuka dengan pesan yang sudah terisi.', '')}`;
}

/* ---------- Halaman perumahan ---------- */
function detailMain(p, idx) {
  const base = '../../';
  const lok = lokasiMap.get(p.lokasi);
  const a = avail(p), habis = a.length === 0, h = minHarga(p);

  const tipeRows = p.tipe.map((t) => {
    const sold = t.status === 'Terjual';
    return `<li${sold ? ' class="habis"' : ''}>
        <span class="nama">${m(t.nama)}</span>
        <span class="harga">${m(rupiah(t.harga))}</span>
        <span class="spek"${dc}><span>Tanah ${t.lt} m²</span><span>Bangunan ${t.lb} m²</span><span>${t.kt} kamar tidur</span><span>${t.km} kamar mandi</span></span>
        <span class="status${sold ? ' habis' : ''}">${esc(t.status || 'Tersedia')}</span>
        ${sold ? '' : `<button type="button" class="tombol tombol-tipis tanya" data-buka-lead data-p="${p.slug}" data-t="${esc(t.nama)}">Tanya tipe ini</button>`}
      </li>`;
  }).join('');

  const fas = (p.fasilitas || []).map((f) => `<li>${m(f)}</li>`).join('');
  // Tanpa isian "akses:" di info.txt: mode contoh menampilkan baris "xx menit" bertanda kuning, mode tayang menyembunyikannya.
  const akses = (p.akses || (DEMO ? DEFAULT_AKSES : [])).map((x) => `<div><dt>${esc(x.nama)}</dt><dd>${m(x.waktu)}</dd></div>`).join('');

  let galeri;
  if (p.foto && p.foto.length) {
    galeri = p.foto.map((f, k) => `<figure><img src="${base}foto/${p.slug}/${esc(f.file)}" alt="${esc(`${p.nama}, foto ${k + 1}`)}" width="${f.w}" height="${f.h}" loading="${k ? 'lazy' : 'eager'}" decoding="async"${k ? '' : ' fetchpriority="high"'}></figure>`).join('');
  } else {
    galeri = `<figure>${ilustrasi(idx)}${labelContoh}</figure>` +
      ['Foto 2: ruang tamu', 'Foto 3: kamar tidur', 'Foto 4: lingkungan'].map((t) => `<figure><div class="ph"><mark class="isi">${t}</mark></div></figure>`).join('');
  }

  const yt = String(p.youtube || '').replace(/[^A-Za-z0-9_-]/g, '');
  const videoSec = (yt || DEMO) ? seksi('video', 'Tonton videonya', 'Video dimuat saat Anda menekan tombol putar, supaya halaman tetap cepat dibuka di HP.', `<div class="video"${yt ? ` data-yt="${yt}"` : ''} data-judul="Video ${esc(p.nama)}">
    <button type="button" class="video-putar" aria-label="Putar video ${esc(p.nama)}"><span class="segitiga"></span></button>
    ${yt ? '' : '<p class="video-ket"><mark class="isi">Video belum dipasang. Isi ID YouTube di data perumahan.</mark></p>'}
  </div>`, false) : '';

  const peta = p.maps
    ? `<a class="tombol tombol-tipis peta" href="${esc(p.maps)}" target="_blank" rel="noopener">Buka di Google Maps</a>`
    : (DEMO ? '<p class="peta"><mark class="isi">Link Google Maps belum dipasang.</mark></p>' : '');

  const lain = [
    ...data.perumahan.filter((x) => x !== p && x.lokasi === p.lokasi),
    ...data.perumahan.filter((x) => x !== p && x.lokasi !== p.lokasi),
  ].slice(0, 3);
  const lainSec = lain.length ? `
<section class="bagian bagian-garis" aria-labelledby="h-lain"><div class="wrap">
  <h2 id="h-lain">Perumahan lainnya</h2>
  <div class="grid">${lain.map((x) => kartu(x, data.perumahan.indexOf(x), base, false)).join('')}</div>
  <p style="margin-top:20px"><a class="tautan" href="${base}#katalog" data-int>Lihat semua perumahan</a></p>
</div></section>` : '';

  return `
<div class="wrap">
  <nav class="remah" aria-label="Posisi halaman">
    <a href="${base}" data-int>Beranda</a><span aria-hidden="true">/</span>
    <a href="${base}#${p.lokasi}" data-int>${esc(lok.nama)}</a><span aria-hidden="true">/</span>
    <span aria-current="page">${m(p.nama)}</span>
  </nav>
</div>
<section class="judul-blok"><div class="wrap">
  <h1>${m(p.nama)}</h1>
  <p class="alamat">${m(p.alamat)}</p>
  ${habis ? '<p class="harga-blok"><strong>Semua tipe terjual</strong></p>' : `<p class="harga-blok"><small>Harga mulai</small><strong>${m(rupiah(h))}</strong></p>`}
  <p class="ringkas">${m(p.ringkas)}</p>
  <div class="aksi">
    ${habis ? '' : `<button type="button" class="tombol" data-buka-lead data-p="${p.slug}">Jadwalkan survei</button>`}
    <a class="tautan" href="#tipe">Lihat tipe dan harga</a>
  </div>
</div></section>
<div class="galeri" tabindex="0" role="region" aria-label="Galeri foto, geser ke samping">${galeri}</div>

${seksi('ringkas', 'Ringkasan proyek', '', `<dl class="fakta">
    <div><dt>Lokasi</dt><dd>${m(p.alamat)}</dd></div>
    <div><dt>Developer</dt><dd>${m(p.developer)}</dd></div>
    <div><dt>Sertifikat</dt><dd>${m(p.sertifikat)}</dd></div>
    ${p.kantor ? `<div><dt>Kantor pemasaran</dt><dd>${m(p.kantor)}</dd></div>` : ''}
  </dl>`, false)}
${seksi('tipe', 'Tipe rumah dan harga', 'Harga dan ketersediaan dapat berubah. Tanyakan ke marketing untuk angka terbaru.', `<ul class="tipe">${tipeRows}</ul>`)}
${fas ? seksi('fasilitas', 'Fasilitas', 'Hanya fasilitas yang benar-benar tersedia di perumahan ini.', `<ul class="fasilitas">${fas}</ul>`) : ''}
${videoSec}
${(akses || peta) ? seksi('lokasi', 'Lokasi dan akses', '', `${akses ? `<dl class="fakta">${akses}</dl>\n  ` : ''}${peta}`) : ''}
${caraSection()}
${faqSection()}
${lainSec}
${ctaBlok(`Jadwalkan survei ${m(p.nama)}`, 'Isi nama dan nomor HP, lalu WhatsApp terbuka dengan pesan yang sudah terisi.', habis ? '' : p.slug)}`;
}

/* ---------- Tulis berkas ---------- */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
cpSync(join(ROOT, 'assets'), join(OUT, 'assets'), { recursive: true });

// Foto: dikecilkan ke WebP, nama file memuat kode isinya, sehingga foto yang diganti langsung tampil baru.
let jumlahFoto = 0, byteFoto = 0;
for (const p of data.perumahan) {
  const r = await prosesFoto({ sharp, dirSumber: join(RUMAH_DIR, p.folder), dirKeluar: join(OUT, 'foto', p.slug), files: p.fileFoto });
  for (const g of r.galat) galat.push(`[${p.folder}] ${g}`);
  p.foto = r.foto; p.kartu = r.kartu; p.og = r.og;
  jumlahFoto += r.foto.length; byteFoto += r.byteKeluar;
}
if (galat.length) berhenti();
writeFileSync(join(OUT, '_headers'), '/foto/*\n  Cache-Control: public, max-age=31536000, immutable\n');

const namaLokasi = data.lokasi.map((l) => l.nama).join(', ');
const ogHome = C.ogImage || '';
writeFileSync(join(OUT, 'index.html'), page({
  depth: 0,
  title: `${C.brand} - Rumah dijual di ${namaLokasi}`,
  desc: 'Pilih lokasi, lihat perumahan dan harganya, lalu jadwalkan survei lewat WhatsApp.',
  main: berandaMain(),
  canonicalPath: '/',
  ogImage: ogHome,
}));

data.perumahan.forEach((p, idx) => {
  const lok = lokasiMap.get(p.lokasi);
  const h = minHarga(p);
  const foto0 = p.og && C.domain ? `${C.domain.replace(/\/$/, '')}/foto/${p.slug}/${p.og}` : ogHome;
  const dir = join(OUT, 'rumah', p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page({
    depth: 2,
    title: `${p.nama} - Rumah di ${lok.nama} | ${C.brand}`,
    desc: `${p.ringkas}${h ? ' Harga mulai ' + rupiah(h) + '.' : ''}`.slice(0, 200),
    main: detailMain(p, idx),
    canonicalPath: `/rumah/${p.slug}/`,
    ogImage: foto0,
    pageInfo: { slug: p.slug, lokasi: p.lokasi },
  }));
});

const dom = (C.domain || '').replace(/\/$/, '');
writeFileSync(join(OUT, 'robots.txt'), DEMO
  ? 'User-agent: *\nDisallow: /\n'
  : `User-agent: *\nAllow: /\n${dom ? `Sitemap: ${dom}/sitemap.xml\n` : ''}`);
if (!DEMO && dom) {
  const urls = ['/', ...data.perumahan.map((p) => `/rumah/${p.slug}/`)];
  writeFileSync(join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${dom}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
}

// Semua berhasil: baru sekarang hasil lama diganti.
rmSync(FINAL, { recursive: true, force: true });
renameSync(OUT, FINAL);

console.log(`Selesai: ${1 + data.perumahan.length} halaman di ${FINAL} (${DEMO ? 'mode contoh' : 'mode tayang'})`);
console.log(`Foto: ${jumlahFoto} file, total ${(byteFoto / 1024 / 1024).toFixed(1)} MB ${sharp ? 'setelah dikecilkan' : '(tidak dikecilkan)'}`);
console.log('Lokasi: ' + data.lokasi.map((l) => `${l.nama} (${data.perumahan.filter((p) => p.lokasi === l.slug).length})`).join(', '));
for (const p of data.perumahan) {
  const a = avail(p).length;
  console.log(`  - ${p.slug}: ${p.nama}, ${p.lokasiNama}, ${a} dari ${p.tipe.length} tipe tersedia, ${p.foto.length} foto${p.youtube ? ', ada video' : ''}`);
}
