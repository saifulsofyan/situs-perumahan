#!/usr/bin/env node
// Membuat situs statis dari folder perumahan/ dan data/rumah.json. Jalankan: npm run build  (atau: node build.mjs)
// Hasil ada di folder "situs/" (Cloudflare Pages membuatnya sendiri tiap kali ada perubahan di GitHub).
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseInfo, slugify, JENIS, KATEGORI_AKSES, gabungInfo, petakanGalat, jadikanHalamanTipe } from './lib/info.mjs';
import { daftarFoto, prosesFoto, muatSharp } from './lib/foto.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
// Kode isi file tampilan dan skrip, ditempel di alamatnya (?v=...), supaya peramban pasti memuat yang baru setelah ada perubahan.
const verAset = (nama) => createHash('sha1').update(readFileSync(join(ROOT, 'assets', nama))).digest('hex').slice(0, 8);
const V_CSS = verAset('style.css'), V_JS = verAset('app.js');
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
const cariInfo = (d) => readdirSync(d).find((f) => /^info(\.txt)*$/i.test(f));
const galatSekali = new Set();
const tambahGalat = (...g) => { for (const x of g) if (!galatSekali.has(x)) { galatSekali.add(x); galat.push(x); } };
for (const folder of folders) {
  const slug = slugify(folder);
  if (!slug) { galat.push(`folder "${folder}": nama folder harus memuat huruf atau angka`); continue; }
  if (slugDari.has(slug)) { galat.push(`folder "${folder}" dan "${slugDari.get(slug)}" menghasilkan alamat halaman yang sama (${slug}). Ganti salah satu namanya`); continue; }
  slugDari.set(slug, folder);
  if (!DEMO && /^contoh(-|$)/.test(slug)) galat.push(`[${folder}] ini data contoh bawaan. Hapus folder ini (atau ganti namanya dan isinya dengan data asli) sebelum tayang`);
  const dir = join(RUMAH_DIR, folder);
  const infoFile = cariInfo(dir);
  if (!infoFile) { galat.push(`[${folder}] tidak ada info.txt di folder ini`); continue; }
  const teksInfo = readFileSync(join(dir, infoFile), 'utf8');
  const { foto, ditolak } = daftarFoto(dir);
  for (const f of ditolak) galat.push(`[${folder}] ${f}: format HEIC/HEIF belum didukung. Simpan sebagai JPG`);
  // Subfolder yang punya info.txt = satu tipe, dengan kartu dan halamannya sendiri.
  const subTipe = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !/^[_.]/.test(d.name) && cariInfo(join(dir, d.name)))
    .map((d) => d.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));

  if (!subTipe.length) {
    const { rumah, galat: g } = parseInfo(teksInfo, `[${folder}]`, { produksi: !DEMO });
    galat.push(...g);
    if (!DEMO && !foto.length) galat.push(`[${folder}] belum ada foto. Mode tayang (demo:false) wajib memakai foto asli. Taruh foto JPG, PNG, atau WebP di folder ini`);
    daftarRumah.push({ ...rumah, slug, folder, fileFoto: foto });
    continue;
  }
  subTipe.forEach((sub, idx) => {
    const slugT = `${slug}-${slugify(sub)}`;
    const ctxT = `[${folder}/${sub}]`;
    if (!slugify(sub)) { galat.push(`folder tipe "${folder}/${sub}": nama folder harus memuat huruf atau angka`); return; }
    if (slugDari.has(slugT)) { galat.push(`folder "${folder}/${sub}" dan "${slugDari.get(slugT)}" menghasilkan alamat halaman yang sama (${slugT}). Ganti salah satu namanya`); return; }
    slugDari.set(slugT, `${folder}/${sub}`);
    const subDir = join(dir, sub);
    const g = gabungInfo(teksInfo, readFileSync(join(subDir, cariInfo(subDir)), 'utf8'), `[${folder}]`, ctxT);
    const { rumah, galat: gp } = parseInfo(g.teks, ctxT, { produksi: !DEMO });
    tambahGalat(...g.galat, ...petakanGalat(gp, g.peta));
    jadikanHalamanTipe(rumah, ctxT, galat);
    const ft = daftarFoto(subDir);
    for (const f of ft.ditolak) galat.push(`${ctxT} ${f}: format HEIC/HEIF belum didukung. Simpan sebagai JPG`);
    if (!DEMO && !ft.foto.length && !foto.length) galat.push(`${ctxT} belum ada foto. Mode tayang (demo:false) wajib memakai foto asli. Taruh foto JPG, PNG, atau WebP di folder tipe ini`);
    daftarRumah.push({ ...rumah, slug: slugT, folder: `${folder}/${sub}`, kawasanSlug: slug, kawasanFolder: folder, fileFoto: ft.foto, fileFotoKawasan: foto, urutanTipe: g.urutanTipe ?? 1000 + idx });
  });
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
// Tipe satu kawasan berdampingan, berurutan menurut urutan tipe.
daftarRumah.sort((a, b) => a.urutan - b.urutan || (a.kawasanSlug || a.slug).localeCompare(b.kawasanSlug || b.slug) || (a.urutanTipe ?? 0) - (b.urutanTipe ?? 0) || a.slug.localeCompare(b.slug));
data.perumahan = daftarRumah;
if (galat.length) berhenti();

// Jenis yang dipakai (urutan tetap: perumahan, apartemen, ruko). Kalau lebih dari satu, teks situs memakai kata "properti".
const jenisAda = Object.keys(JENIS).filter((j) => daftarRumah.some((p) => p.jenis === j));
const banyakJenis = jenisAda.length > 1;
const solo = banyakJenis ? null : jenisAda[0];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const PROP = banyakJenis ? 'properti' : JENIS[solo].nama.toLowerCase(); // perumahan | apartemen | ruko | properti
const RUMAH = banyakJenis ? 'properti' : ({ perumahan: 'rumah', apartemen: 'apartemen', ruko: 'ruko' })[solo];
const UNIT = solo === 'perumahan' ? 'rumah' : 'unit';
// Transaksi: jual (dijual) atau sewa (disewa). Kalau ada dua-duanya ("campur"), situs menampilkan pilihan Dijual/Disewa.
const sewaP = (p) => p.transaksi === 'sewa';
const adaSewa = daftarRumah.some(sewaP);
const adaJual = daftarRumah.some((p) => !sewaP(p));
const campur = adaSewa && adaJual;
const MODE = campur ? 'campur' : adaSewa ? 'sewa' : 'jual';
const AKSI = { jual: 'dijual', sewa: 'disewakan', campur: 'dijual dan disewakan' }[MODE];
const RUMAH_H1 = MODE === 'sewa' ? RUMAH + ' sewa' : RUMAH;
const gabung = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' dan ' + a[a.length - 1]);

/* ---------- Pembantu ---------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const m = (s) => (DEMO ? `<mark class="isi">${esc(s)}</mark>` : esc(s));
const dc = DEMO ? ' data-contoh' : '';
const jsonInline = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function rupiah(n) {
  if (n >= 1e9) return 'Rp ' + String(Math.round((n / 1e9) * 100) / 100).replace('.', ',') + ' miliar';
  if (n >= 1e6) return 'Rp ' + String(Math.round((n / 1e6) * 100) / 100).replace('.', ',') + ' juta';
  return 'Rp ' + Math.round(n / 1e3) + ' ribu';
}
const avail = (p) => p.tipe.filter((t) => t.status !== 'Terjual');
// Harga ditulis lengkap dengan satuan waktu untuk properti sewa, misalnya "Rp 25 juta/tahun".
const hargaTeks = (p, t) => rupiah(t.harga) + (sewaP(p) ? '/' + t.periode : '');
const perBulan = (t) => t.harga / (t.periode === 'tahun' ? 12 : 1);
// Tipe tersedia dengan harga terendah (untuk sewa dibandingkan per bulan, supaya /bulan dan /tahun adil).
const minTipe = (p) => {
  const a = avail(p);
  if (!a.length) return null;
  return a.reduce((b, t) => ((sewaP(p) ? perBulan(t) < perBulan(b) : t.harga < b.harga) ? t : b));
};
const hargaMulaiLabel = (p) => (sewaP(p) ? 'Sewa mulai' : 'Harga mulai');
const habisTeks = (p) => (sewaP(p) ? 'Semua tipe sudah disewa' : 'Semua tipe terjual');
// Lencana di kartu dan halaman detail: jenis (kalau ada beberapa jenis) dan dijual/disewa (kalau ada keduanya).
function labelProp(p) {
  const bag = [];
  if (banyakJenis) bag.push(JENIS[p.jenis].nama);
  if (campur) bag.push(sewaP(p) ? 'Disewa' : 'Dijual');
  return bag.join(' · ');
}
const lencana = (p) => (labelProp(p) ? `<p class="jenis-label${campur && sewaP(p) ? ' sewa' : ''}">${esc(labelProp(p))}</p>` : '');
const dasar = (p) => (avail(p).length ? avail(p) : p.tipe);
// Ukuran terkecil yang ditampilkan di kartu: tanah untuk perumahan dan ruko, luas unit untuk apartemen.
function ukuranMulai(p) {
  if (p.jenis === 'apartemen') return `Unit mulai ${Math.min(...dasar(p).map((t) => t.lb))} m²`;
  return `Tanah mulai ${Math.min(...dasar(p).map((t) => t.lt))} m²`;
}
// Baris spesifikasi satu tipe di halaman detail.
function spekTipe(p, t) {
  const r = [];
  if (p.jenis === 'apartemen') {
    r.push(`Unit ${t.lb} m²`);
    if (typeof t.lt === 'number') r.push(`Tanah ${t.lt} m²`);
    r.push(t.kt === 0 ? 'Studio' : `${t.kt} kamar tidur`);
    r.push(`${t.km} kamar mandi`);
    if (typeof t.lantai === 'number') r.push(`Lantai ${t.lantai}`);
    return r;
  }
  if (typeof t.lt === 'number') r.push(`Tanah ${t.lt} m²`);
  r.push(`Bangunan ${t.lb} m²`);
  if (typeof t.lantai === 'number') r.push(`${t.lantai} lantai`);
  if (typeof t.kt === 'number') r.push(`${t.kt} kamar tidur`);
  if (typeof t.km === 'number') r.push(`${t.km} kamar mandi`);
  return r;
}

const DEFAULT_AKSES = [
  { kategori: 'belanja', nama: 'Pusat belanja terdekat', waktu: 'xx menit' },
  { kategori: 'belanja', nama: 'Pasar atau minimarket', waktu: 'xx menit' },
  { kategori: 'kesehatan', nama: 'Rumah sakit terdekat', waktu: 'xx menit' },
  { kategori: 'kesehatan', nama: 'Klinik', waktu: 'xx menit' },
  { kategori: 'akses', nama: 'Pintu tol', waktu: 'xx menit' },
  { kategori: 'akses', nama: 'Stasiun atau halte', waktu: 'xx menit' },
];

/* ---------- Ikon bagian "Lokasi dan akses" dan "Fasilitas" ---------- */
const svg = (isi) => `<svg viewBox="0 0 24 24" aria-hidden="true">${isi}</svg>`;
const IKON = {
  belanja: svg('<path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  kesehatan: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  pendidikan: svg('<path d="M2 9l10-5 10 5-10 5L2 9z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>'),
  akses: svg('<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>'),
  rekreasi: svg('<path d="M12 3a5 5 0 0 0-4.6 7A4 4 0 0 0 8 18h8a4 4 0 0 0 .6-8A5 5 0 0 0 12 3z"/><path d="M12 18v3"/>'),
  pin: svg('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  aman: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>'),
  bulan: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  kolam: svg('<path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>'),
  olahraga: svg('<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>'),
  air: svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
  listrik: svg('<path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z"/>'),
  parkir: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V8h3a2.5 2.5 0 0 1 0 5h-3"/>'),
  gedung: svg('<path d="M4 21V9l8-5 8 5v12M4 21h16M10 21v-6h4v6"/>'),
  api: svg('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.4-4.8.3 1.6 1 2.6 2 3C11 8.5 11 5.5 12 3z"/>'),
  centang: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>'),
};
// Ikon fasilitas dipilih dari kata di namanya. Tidak cocok dengan apa pun: tanda centang.
const IKON_FASILITAS = [
  [/gate|gerbang|cctv|keaman|satpam|security|24 jam|portal/i, 'aman'],
  [/musala|mushola|masjid|ibadah/i, 'bulan'],
  [/barbecue|bbq|panggang|api unggun|grill/i, 'api'],
  [/kolam|renang|pool|jacuzzi/i, 'kolam'],
  [/olahraga|jogging|lari|gym|fitness|lapangan|basket|futsal|badminton|tenis/i, 'olahraga'],
  [/taman|bermain|playground|hijau|terbuka|pohon/i, 'rekreasi'],
  [/jalan|paving|aspal|cor beton|jalur/i, 'akses'],
  [/drainase|saluran|air bersih|pdam|pam\b|sumur|air tanah|\bair\b/i, 'air'],
  [/listrik|pln|genset|solar/i, 'listrik'],
  [/parkir|carport|garasi/i, 'parkir'],
  [/club ?house|lounge|co-?working|balai|aula|serbaguna/i, 'gedung'],
  [/minimarket|toko|kafe|cafe|kantin|restoran|food|kuliner|retail/i, 'belanja'],
];
const ikonFasilitas = (teks) => IKON[(IKON_FASILITAS.find(([re]) => re.test(teks)) || [null, 'centang'])[1]];

/* ---------- Ilustrasi contoh (dipakai hanya selama belum ada foto) ---------- */
const SETS = [
  { sky: '#D5EAE0', roof: '#1D4B3B', wall: '#FFFFFF', acc: '#F4B63F', hill: '#9CC4B0', ground: '#2E6B55' },
  { sky: '#E3EEF3', roof: '#5B3A2A', wall: '#FFF6EA', acc: '#2E6B55', hill: '#B5D3C2', ground: '#3C7A5F' },
  { sky: '#F1EBDD', roof: '#2F4858', wall: '#F4F8FA', acc: '#F4B63F', hill: '#A9CBB9', ground: '#2A6650' },
  { sky: '#DCEBE4', roof: '#7A3B33', wall: '#FFFFFF', acc: '#CFE5DB', hill: '#9CC4B0', ground: '#2E6B55' },
  { sky: '#E6EFEA', roof: '#3D5A40', wall: '#FBFBF3', acc: '#F4B63F', hill: '#B2D2C1', ground: '#34705A' },
];
// Ilustrasi menara apartemen dan deretan ruko, untuk contoh sebelum ada foto asli.
function ilustrasiBangunan(i, jenis) {
  const c = SETS[i % SETS.length];
  const awal = `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustrasi contoh ${jenis}" focusable="false">
<rect width="400" height="300" fill="${c.sky}"/>
<circle cx="338" cy="58" r="24" fill="#F4B63F" opacity=".9"/>
<path d="M0 232 Q110 190 220 224 T400 210 V300 H0Z" fill="${c.hill}"/>
<path d="M0 262 Q140 238 280 258 T400 252 V300 H0Z" fill="${c.ground}"/>`;
  const jendela = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${c.acc}"/>`;
  let isi = '';
  if (jenis === 'apartemen') {
    isi += `<rect x="138" y="44" width="124" height="218" rx="3" fill="${c.wall}"/><rect x="132" y="36" width="136" height="12" rx="3" fill="${c.roof}"/>`;
    for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) isi += jendela(152 + k * 36, 62 + r * 31, 24, 20);
    isi += `<rect x="268" y="108" width="62" height="154" rx="3" fill="${c.wall}"/><rect x="264" y="102" width="70" height="9" rx="3" fill="${c.roof}"/>`;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) isi += jendela(278 + k * 26, 122 + r * 31, 18, 20);
    isi += `<rect x="70" y="170" width="68" height="92" rx="3" fill="${c.wall}"/><rect x="66" y="164" width="76" height="9" rx="3" fill="${c.roof}"/>`;
    for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) isi += jendela(80 + k * 28, 184 + r * 26, 20, 16);
    isi += `<path d="M186 262V238a14 14 0 0 1 28 0V262Z" fill="${c.roof}"/>`;
  } else {
    isi += `<rect x="54" y="92" width="292" height="170" rx="3" fill="${c.wall}"/><rect x="48" y="84" width="304" height="12" rx="3" fill="${c.roof}"/>`;
    for (let k = 0; k < 4; k++) {
      const x = 54 + k * 73;
      isi += jendela(x + 14, 112, 45, 26) + jendela(x + 14, 160, 45, 26);
      isi += `<rect x="${x + 8}" y="214" width="57" height="8" fill="${c.acc}"/><rect x="${x + 12}" y="224" width="49" height="38" fill="${c.roof}"/>`;
      if (k) isi += `<rect x="${x - 1}" y="96" width="3" height="166" fill="${c.hill}"/>`;
    }
  }
  return awal + isi + '\n</svg>';
}
function ilustrasi(i, jenis = 'perumahan') {
  if (jenis !== 'perumahan') return ilustrasiBangunan(i, jenis);
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
function fotoKartu(p, i, base, atas = false) {
  if (p.kartu) {
    // Dua kartu teratas di beranda dimuat langsung (terlihat tanpa scroll), sisanya menunggu didekati.
    const muat = atas ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    return `<img src="${base}foto/${p.kartu.dir || p.slug}/${esc(p.kartu.file)}" alt="${esc(p.nama)}" width="${p.kartu.w}" height="${p.kartu.h}" ${muat} decoding="async">`;
  }
  return ilustrasi(i, p.jenis) + labelContoh;
}

/* ---------- Isi bersama ---------- */
const IKON_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const IK_DOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
const IK_PERISAI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>';
const IK_KALK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2"/></svg>';
// Teks per mode: jual (dijual saja), sewa (disewa saja), campur (keduanya). Situs yang hanya menjual memakai teks yang sama seperti sebelumnya.
const TEKS = {
  jual: {
    caraJudul: 'Cara membeli',
    janji: [
      { ikon: IKON_PIN, judul: 'Survei dulu, tanpa kewajiban membeli', ket: `Lihat lokasi dan ${UNIT} contoh sebelum memutuskan.` },
      { ikon: IK_DOK, judul: 'Legalitas dijelaskan sebelum booking', ket: 'Jenis sertifikat dan izin proyek disampaikan jelas.' },
      { ikon: IK_PERISAI, judul: 'Pembayaran hanya ke rekening resmi', ket: 'Atas nama perusahaan, dengan kuitansi resmi.' },
      { ikon: IK_KALK, judul: 'Simulasi KPR dibantu marketing', ket: 'Persetujuan KPR sepenuhnya keputusan bank.' },
    ],
    cara: [
      [`Pilih ${PROP} dan tipe`, `Lihat daftar, lalu tekan Tanya harga pada ${UNIT} yang Anda minati.`],
      ['Isi nama dan nomor HP', 'WhatsApp terbuka dengan pesan yang sudah terisi, dan tim marketing menjawab di sana.'],
      [`Survei lokasi dan ${UNIT} contoh`, 'Lihat langsung lingkungan dan unitnya, tanpa kewajiban membeli.'],
      ['Booking', 'Tanda jadi dibayar ke rekening resmi perusahaan, lalu Anda menerima kuitansi.'],
      ['KPR atau pembayaran, lalu akad', 'Marketing mendampingi sampai akad dan serah terima.'],
    ],
    faq: [
      ['Apakah harga di website sudah final?', 'Harga dan ketersediaan dapat berubah. Angka final disampaikan marketing saat booking.'],
      ['Apakah bisa dibeli dengan KPR?', 'Bisa. Tim marketing membantu simulasi dan menjelaskan syarat pengajuan KPR. Persetujuan KPR sepenuhnya keputusan bank.'],
      [`Biaya apa saja di luar harga ${UNIT}?`, 'Biaya tambahan seperti pajak, notaris, dan biaya KPR dijelaskan secara tertulis oleh marketing sebelum Anda membayar tanda jadi.'],
      ['Ke mana pembayaran tanda jadi dikirim?', 'Hanya ke rekening resmi atas nama perusahaan, bukan rekening pribadi sales. Anda berhak meminta kuitansi resmi.'],
      ['Kapan bisa survei?', 'Jadwal survei diatur bersama tim marketing lewat WhatsApp.'],
    ],
  },
  sewa: {
    caraJudul: 'Cara menyewa',
    janji: [
      { ikon: IKON_PIN, judul: 'Survei dulu, tanpa kewajiban menyewa', ket: `Lihat lokasi dan ${UNIT} contoh sebelum memutuskan.` },
      { ikon: IK_DOK, judul: 'Syarat sewa dijelaskan tertulis', ket: 'Lama sewa, uang jaminan, dan biaya lain disampaikan jelas sebelum Anda membayar.' },
      { ikon: IK_PERISAI, judul: 'Pembayaran hanya ke rekening resmi', ket: 'Sesuai perjanjian sewa, dengan kuitansi.' },
      { ikon: IK_KALK, judul: 'Didampingi sampai serah terima', ket: 'Marketing membantu sampai perjanjian ditandatangani dan unit diserahkan.' },
    ],
    cara: [
      [`Pilih ${PROP} dan tipe`, `Lihat daftar, lalu tekan Tanya harga pada ${UNIT} yang Anda minati.`],
      ['Isi nama dan nomor HP', 'WhatsApp terbuka dengan pesan yang sudah terisi, dan tim marketing menjawab di sana.'],
      [`Survei lokasi dan ${UNIT}`, 'Lihat langsung lingkungan dan unitnya, tanpa kewajiban menyewa.'],
      ['Sepakati syarat sewa', 'Lama sewa, uang jaminan, dan biaya lain dijelaskan tertulis sebelum Anda membayar.'],
      ['Bayar sewa, lalu serah terima', 'Pembayaran ke rekening yang tercantum di perjanjian sewa, dengan kuitansi. Setelah itu unit diserahkan kepada Anda.'],
    ],
    faq: [
      ['Apakah harga sewa di website sudah final?', 'Harga dan ketersediaan dapat berubah. Angka final disampaikan marketing saat booking.'],
      ['Berapa lama minimal sewa?', 'Berbeda untuk tiap unit. Marketing menjelaskan lama sewa minimal dan cara perpanjangannya sebelum Anda membayar.'],
      ['Biaya apa saja di luar harga sewa?', 'Uang jaminan, biaya pengelolaan, serta listrik dan air dijelaskan secara tertulis oleh marketing sebelum Anda membayar.'],
      ['Ke mana pembayaran dikirim?', 'Hanya ke rekening yang tercantum di perjanjian sewa, bukan rekening pribadi sales. Anda berhak meminta kuitansi.'],
      ['Kapan bisa survei?', 'Jadwal survei diatur bersama tim marketing lewat WhatsApp.'],
    ],
  },
  campur: {
    caraJudul: 'Cara membeli atau menyewa',
    janji: [
      { ikon: IKON_PIN, judul: 'Survei dulu, tanpa kewajiban', ket: `Lihat lokasi dan ${UNIT} contoh sebelum memutuskan.` },
      { ikon: IK_DOK, judul: 'Legalitas dan syarat dijelaskan dulu', ket: 'Sertifikat dan izin untuk yang dijual, syarat sewa untuk yang disewa.' },
      { ikon: IK_PERISAI, judul: 'Pembayaran hanya ke rekening resmi', ket: 'Sesuai dokumen resmi, dengan kuitansi.' },
      { ikon: IK_KALK, judul: 'Didampingi marketing', ket: 'Simulasi KPR untuk pembelian, serah terima untuk sewa. Persetujuan KPR keputusan bank.' },
    ],
    cara: [
      [`Pilih ${PROP}, dijual atau disewa`, `Lihat daftar, lalu tekan Tanya harga pada ${UNIT} yang Anda minati.`],
      ['Isi nama dan nomor HP', 'WhatsApp terbuka dengan pesan yang sudah terisi, dan tim marketing menjawab di sana.'],
      [`Survei lokasi dan ${UNIT}`, 'Lihat langsung lingkungan dan unitnya, tanpa kewajiban membeli atau menyewa.'],
      ['Booking', 'Tanda jadi atau pembayaran awal sewa dibayar ke rekening resmi, lalu Anda menerima kuitansi.'],
      ['Akad atau perjanjian sewa', 'Marketing mendampingi sampai akad (untuk pembelian) atau serah terima (untuk sewa).'],
    ],
    faq: [
      ['Apakah harga di website sudah final?', 'Harga dan ketersediaan dapat berubah. Angka final disampaikan marketing saat booking.'],
      ['Apakah bisa dibeli dengan KPR?', 'Untuk properti yang dijual, bisa. Tim marketing membantu simulasi dan menjelaskan syarat pengajuan KPR. Persetujuan KPR sepenuhnya keputusan bank.'],
      ['Biaya apa saja di luar harga?', 'Untuk pembelian: pajak, notaris, dan biaya KPR. Untuk sewa: uang jaminan dan biaya pengelolaan. Semuanya dijelaskan tertulis oleh marketing sebelum Anda membayar.'],
      ['Ke mana pembayaran dikirim?', 'Hanya ke rekening resmi yang tercantum di dokumen, bukan rekening pribadi sales. Anda berhak meminta kuitansi.'],
      ['Kapan bisa survei?', 'Jadwal survei diatur bersama tim marketing lewat WhatsApp.'],
    ],
  },
};
const JANJI = TEKS[MODE].janji;
// Bagian dengan judul di kiri dan isi di kanan (di layar lebar); bertumpuk di HP.
const seksi = (id, judul, intro, isi, garis = true) => `
<section class="bagian${garis ? ' bagian-garis' : ''}" id="${id}" aria-labelledby="h-${id}">
  <div class="wrap pecah">
    <div class="kepala"><h2 id="h-${id}">${judul}</h2>${intro ? `<p class="intro">${esc(intro)}</p>` : ''}</div>
    <div class="badan">${isi}</div>
  </div>
</section>`;
const caraSection = (mode = MODE) => seksi('cara', TEKS[mode].caraJudul, '',
  `<ol class="langkah">${TEKS[mode].cara.map(([a, b]) => `<li><strong>${esc(a)}</strong><span>${esc(b)}</span></li>`).join('')}</ol>`);
const faqSection = (mode = MODE) => seksi('faq', 'Pertanyaan yang sering muncul', '',
  `<div class="tanya-jawab">${TEKS[mode].faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`);
const ctaBlok = (judul, teks, slug) => `
<section class="masuk" id="cta" aria-labelledby="h-cta"><div class="wrap">
  <h2 id="h-cta">${judul}</h2>
  <p class="intro">${esc(teks)}</p>
  <button type="button" class="tombol" data-buka-lead${slug ? ` data-p="${slug}"` : ''}>Jadwalkan survei lewat WhatsApp</button>
</div></section>`;

/* ---------- Kartu perumahan ---------- */
function kartu(p, i, base, filter) {
  const lok = lokasiMap.get(p.lokasi);
  const a = avail(p), habis = a.length === 0, mt = minTipe(p);
  const href = `${base}rumah/${p.slug}/`;
  return `
<article class="kartu"${filter ? ` data-lokasi="${p.lokasi}" data-jenis="${p.jenis}" data-transaksi="${p.transaksi}"` : ''}>
  <div class="kartu-foto-wrap" style="position:relative">
    <a class="kartu-foto" href="${href}" data-int tabindex="-1" aria-hidden="true">${fotoKartu(p, i, base, filter && i < 2)}</a>
    <span class="chip-lokasi">${esc(lok.nama)}</span>
  </div>
  <div class="kartu-isi">
    ${lencana(p)}
    <h3><a href="${href}" data-int>${m(p.nama)}</a></h3>
    <p class="alamat">${m(p.alamat)}</p>
    <div class="harga-baris">${habis ? `<strong class="habis-teks">${habisTeks(p)}</strong>` : `<small>${hargaMulaiLabel(p)}</small><strong>${m(hargaTeks(p, mt))}</strong>`}</div>
    <p class="spek-mini">${p.kawasanSlug ? spekTipe(p, p.tipe[0]).slice(0, 2).map((x) => `<span>${m(x)}</span>`).join('') : `<span>${habis ? p.tipe.length + ' tipe' : a.length + ' tipe tersedia'}</span><span>${m(ukuranMulai(p))}</span>`}</p>
    <div class="aksi-kartu">
      <a class="tombol tombol-tipis" href="${href}" data-int>Lihat detail</a>
      ${habis ? '' : `<button type="button" class="tombol" data-buka-lead data-p="${p.slug}">Tanya harga</button>`}
    </div>
  </div>
</article>`;
}

/* ---------- Menu atas: pilihan langsung ke daftar yang sudah disaring ---------- */
// Beberapa jenis: satu tautan per jenis (Perumahan, Apartemen, Ruko). Ada properti dijual DAN disewa: tambah "Sewa".
// Satu jenis saja tapi ada jual dan sewa: "Dijual" dan "Sewa". Satu jenis dan satu transaksi: satu tautan ke daftar.
const NAV_KAT = (() => {
  const a = [];
  if (banyakJenis) for (const j of jenisAda) a.push({ teks: JENIS[j].nama, key: j });
  else if (campur) a.push({ teks: 'Dijual', key: 'jual' });
  else a.push({ teks: cap(PROP), key: 'semua' });
  if (campur) a.push({ teks: 'Sewa', key: 'sewa' });
  return a;
})();

/* ---------- Kerangka halaman ---------- */
function page({ depth, title, desc, main, canonicalPath, ogImage, pageInfo }) {
  const base = '../'.repeat(depth);
  const home = base || './';
  const canonical = C.domain ? C.domain.replace(/\/$/, '') + canonicalPath : '';
  const site = {
    config: { brand: C.brand, appsScriptUrl: C.appsScriptUrl, metaPixelId: C.metaPixelId, defaultSales: C.defaultSales, sales: C.sales, demo: DEMO },
    perumahan: data.perumahan.map((p) => ({ slug: p.slug, nama: p.nama, lokasi: p.lokasi, jenis: p.jenis, transaksi: p.transaksi, tipe: avail(p).map((t) => t.nama) })),
    sebut: RUMAH,
    semuaSewa: MODE === 'sewa',
    campur,
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
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"></noscript>
<link rel="stylesheet" href="${base}assets/style.css?v=${V_CSS}">
</head>
<body>
${DEMO ? '<div class="contoh" role="note">Halaman contoh. Teks bertanda kuning adalah data contoh yang harus diganti sebelum iklan dijalankan.</div>\n' : ''}
<header class="atas"><div class="wrap atas-isi">
  <a class="merek" href="${home}" data-int>${m(C.brand)}</a>
  <nav class="menu" aria-label="Utama">
    ${NAV_KAT.map((k) => `<a href="${base}${k.key === 'semua' ? '#katalog' : '#' + k.key}" data-int data-nav="${k.key}">${esc(k.teks)}</a>`).join('\n    ')}
    <a href="${base}#cara" data-int>${TEKS[MODE].caraJudul}</a>
    <a href="${base}#kontak" data-int>Kontak</a>
  </nav>
  <button type="button" class="tombol tombol-tipis" data-buka-lead>Tanya harga</button>
</div>
</header>
${NAV_KAT.length > 1 ? `<div class="wrap"><nav class="menu-hp" data-n="${NAV_KAT.length}" aria-label="Pilih jenis properti">
  ${NAV_KAT.map((k) => `<a href="${base}#${k.key}" data-int data-nav="${k.key}">${esc(k.teks)}</a>`).join('\n  ')}
</nav></div>
` : ''}
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
  <p>Kami mengumpulkan nama, nomor HP, ${PROP} dan tipe yang Anda pilih, serta asal iklan yang Anda klik. Data ini dipakai untuk menghubungi Anda tentang ${PROP} yang Anda minati.</p>
  <p>Data disimpan di sistem perusahaan dan hanya dilihat tim marketing serta pengelola proyek. Kami tidak menjual data Anda.</p>
  <p>Situs ini dapat memakai alat pengukur iklan seperti Meta Pixel untuk mengetahui iklan mana yang efektif.</p>
  <p>Untuk meminta data Anda dihapus, hubungi kami di ${m(C.telepon)}.</p>
  <form method="dialog"><button class="tombol" type="submit">Tutup</button></form>
</dialog>

<script>window.SITE=${jsonInline(site)};</script>
<script src="${base}assets/app.js?v=${V_JS}" defer></script>
</body>
</html>
`;
}

/* ---------- Beranda ---------- */
function berandaMain() {
  const tiles = data.lokasi.map((l, i) => {
    const n = data.perumahan.filter((p) => p.lokasi === l.slug).length;
    return `<a class="tile t${i % 4}" href="#katalog" data-lokasi="${l.slug}">${IKON_PIN}<span class="tile-nama">${esc(l.nama)}</span><span class="tile-jumlah">${n} ${PROP}</span></a>`;
  }).join('');
  const tabs = [`<button type="button" class="tab" aria-pressed="true" data-lokasi="semua">Semua lokasi</button>`]
    .concat(data.lokasi.map((l) => `<button type="button" class="tab" aria-pressed="false" data-lokasi="${l.slug}">${esc(l.nama)}</button>`)).join('');
  // Pilihan jenis hanya muncul kalau ada lebih dari satu jenis.
  const tabsJenis = banyakJenis
    ? [`<button type="button" class="tab" aria-pressed="true" data-jenis="semua" data-nama="${PROP}">Semua jenis (${data.perumahan.length})</button>`]
      .concat(jenisAda.map((j) => `<button type="button" class="tab" aria-pressed="false" data-jenis="${j}" data-nama="${JENIS[j].nama.toLowerCase()}">${JENIS[j].nama} (${data.perumahan.filter((p) => p.jenis === j).length})</button>`)).join('')
    : '';
  const cards = data.perumahan.map((p, i) => kartu(p, i, '', true)).join('');
  // Pilihan Dijual/Disewa hanya muncul kalau situs punya dua-duanya.
  const nJual = data.perumahan.filter((p) => !sewaP(p)).length, nSewa = data.perumahan.length - nJual;
  const tabsTransaksi = campur
    ? `<button type="button" class="tab" aria-pressed="true" data-transaksi="semua" data-akhiran="">Semua (${data.perumahan.length})</button>` +
      `<button type="button" class="tab" aria-pressed="false" data-transaksi="jual" data-akhiran=" dijual">Dijual (${nJual})</button>` +
      `<button type="button" class="tab" aria-pressed="false" data-transaksi="sewa" data-akhiran=" disewa">Disewa (${nSewa})</button>`
    : '';
  const barisSaring = [];
  if (campur) barisSaring.push(['transaksi', 'Dijual atau disewa', tabsTransaksi]);
  if (banyakJenis) barisSaring.push(['jenis', 'Jenis', tabsJenis]);
  barisSaring.push(['lokasi', 'Lokasi', tabs]);
  const saring = barisSaring.length > 1
    ? barisSaring.map(([k, lab, html]) => `<p class="saring-label" id="lab-${k}">${lab}</p>\n  <div class="tabs" role="group" aria-labelledby="lab-${k}">${html}</div>`).join('\n  ')
    : `<div class="tabs" role="group" aria-label="Saring menurut lokasi">${tabs}</div>`;
  const pilihan = gabung([...(campur ? ['dijual atau disewa'] : []), ...(banyakJenis ? ['jenis'] : []), 'lokasi']);
  return `
<section class="hero" aria-labelledby="judul"><div class="wrap hero-grid">
  <div class="hero-teks">
    <h1 id="judul">Cari ${RUMAH_H1} di lokasi yang Anda inginkan</h1>
    <p class="lead">Pilih area, bandingkan ${PROP} dan harganya, lalu jadwalkan survei bersama tim marketing kami.</p>
    <p class="catatan">Harga dan ketersediaan dapat berubah. Informasi final disampaikan marketing saat booking.</p>
    <div class="aksi">
      <a class="tombol" href="#katalog">Lihat ${PROP}</a>
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
  <h2 id="h-katalog">${cap(PROP)} pilihan</h2>
  <p class="intro">Pilih ${pilihan} untuk menyaring daftar. Harga dan ketersediaan dapat berubah, jadi tanyakan ke marketing untuk angka terbaru.</p>
  ${saring}
  <p class="hitung" id="hitung" data-sebut="${PROP}" aria-live="polite">${data.perumahan.length} ${PROP}</p>
  <div class="grid">${cards}</div>
  <p class="kosong" id="kosong" hidden>Belum ada ${PROP} yang cocok dengan pilihan ini. Hubungi kami untuk info terbaru.</p>
</div></section>
${caraSection()}
${faqSection()}
${ctaBlok('Belum menemukan yang cocok?', 'Ceritakan kebutuhan Anda. Isi nama dan nomor HP, lalu WhatsApp terbuka dengan pesan yang sudah terisi.', '')}`;
}

/* ---------- Halaman perumahan ---------- */
function detailMain(p, idx) {
  const base = '../../';
  const lok = lokasiMap.get(p.lokasi);
  const a = avail(p), habis = a.length === 0, mt = minTipe(p);
  const sewa = sewaP(p);

  const tipeRows = p.tipe.map((t) => {
    const sold = t.status === 'Terjual';
    return `<li${sold ? ' class="habis"' : ''}>
        <span class="nama">${m(t.nama)}</span>
        <span class="harga">${m(hargaTeks(p, t))}</span>
        <span class="spek"${dc}>${spekTipe(p, t).map((x) => `<span>${x}</span>`).join('')}</span>
        <span class="status${sold ? ' habis' : ''}">${esc(sold && sewa ? 'Sudah disewa' : (t.status || 'Tersedia'))}</span>
        ${sold ? '' : `<button type="button" class="tombol tombol-tipis tanya" data-buka-lead data-p="${p.slug}" data-t="${esc(t.nama)}">Tanya tipe ini</button>`}
      </li>`;
  }).join('');

  const fas = (p.fasilitas || []).map((f) => `<li><span class="ikon-bulat">${ikonFasilitas(f)}</span><span>${m(f)}</span></li>`).join('');
  // Tanpa isian "akses:" di info.txt: mode contoh menampilkan baris "xx menit" bertanda kuning, mode tayang menyembunyikannya.
  const aksesData = p.akses || (DEMO ? DEFAULT_AKSES : []);
  const kelompok = Object.entries(KATEGORI_AKSES)
    .map(([k, v]) => ({ k, ...v, isi: aksesData.filter((x) => x.kategori === k) }))
    .filter((g) => g.isi.length);
  const kolomSekitar = kelompok.map((g) => `
        <div class="sek-kol">
          <span class="ikon-bulat besar">${IKON[g.k]}</span>
          <h3>${esc(g.nama)}</h3>
          <p class="sek-sub">${esc(g.ket)}</p>
          <ul class="sek-daftar">${g.isi.map((x) => `<li><span>${esc(x.nama)}</span><b>${m(x.waktu)}</b></li>`).join('')}</ul>
        </div>`).join('');

  // Cicilan mulai: hanya untuk properti dijual yang masih ada tipe tersedia. Tanpa isian: mode contoh menampilkan tempat kosong bertanda kuning, mode tayang menyembunyikannya.
  const adaCicilan = !sewaP(p) && !!minTipe(p) && (p.cicilan || DEMO);
  const cicilanHtml = adaCicilan ? `<p class="cicilan-blok"><small>Cicilan mulai</small><strong>${p.cicilan ? m(rupiah(p.cicilan.harga) + '/bulan') : '<mark class="isi">Rp xx juta/bulan</mark>'}</strong></p>
  <p class="cicilan-ket">${p.cicilan && p.cicilan.ket ? `Simulasi: ${esc(p.cicilan.ket)}. ` : 'Simulasi perkiraan. '}Cicilan sebenarnya ditentukan bank saat persetujuan KPR.</p>` : '';

  // Foto galeri punya versi kecil untuk HP. Lebar tampil: tinggi bingkai (300px HP, 440px layar lebar) x rasio foto.
  const srcsetFoto = (p, f, base) => {
    if (!f.kecil) return '';
    const r = f.w / f.h;
    const sizes = `(min-width:800px) ${Math.round(440 * r)}px, ${Math.min(Math.round(300 * r), 350)}px`;
    return ` srcset="${base}foto/${f.dir || p.slug}/${esc(f.kecil.file)} ${f.kecil.w}w, ${base}foto/${f.dir || p.slug}/${esc(f.file)} ${f.w}w" sizes="${sizes}"`;
  };
  let galeri;
  if (p.foto && p.foto.length) {
    galeri = p.foto.map((f, k) => `<figure class="foto"><img src="${base}foto/${f.dir || p.slug}/${esc(f.file)}"${srcsetFoto(p, f, base)} alt="${esc(`${p.nama}, foto ${k + 1}`)}" width="${f.w}" height="${f.h}" loading="${k ? 'lazy' : 'eager'}" decoding="async"${k ? '' : ' fetchpriority="high"'}></figure>`).join('');
  } else {
    galeri = `<figure>${ilustrasi(idx, p.jenis)}${labelContoh}</figure>` +
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

  // Yang serupa didahulukan: sejenis dan selokasi, lalu sejenis, lalu selokasi, lalu sisanya.
  const skor = (x) => (x.jenis === p.jenis ? 2 : 0) + (x.lokasi === p.lokasi ? 1 : 0);
  const saudara = p.kawasanSlug ? data.perumahan.filter((x) => x !== p && x.kawasanSlug === p.kawasanSlug) : [];
  const saudaraSec = saudara.length ? `
<section class="bagian bagian-garis" id="tipe-lain" aria-labelledby="h-saudara"><div class="wrap">
  <h2 id="h-saudara">Tipe lain di ${m(p.kawasan)}</h2>
  <div class="grid">${saudara.map((x) => kartu(x, data.perumahan.indexOf(x), base, false)).join('')}</div>
</div></section>` : '';
  const lain = data.perumahan.filter((x) => x !== p && !saudara.includes(x))
    .sort((x, y) => skor(y) - skor(x) || data.perumahan.indexOf(x) - data.perumahan.indexOf(y))
    .slice(0, 3);
  const lainSec = lain.length ? `
<section class="bagian bagian-garis" aria-labelledby="h-lain"><div class="wrap">
  <h2 id="h-lain">${cap(PROP)} lainnya</h2>
  <div class="grid">${lain.map((x) => kartu(x, data.perumahan.indexOf(x), base, false)).join('')}</div>
  <p style="margin-top:20px"><a class="tautan" href="${base}#katalog" data-int>Lihat semua ${PROP}</a></p>
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
  ${lencana(p) ? lencana(p) + '\n  ' : ''}<h1>${m(p.nama)}</h1>
  <p class="alamat">${m(p.alamat)}</p>
  ${habis ? `<p class="harga-blok"><strong>${habisTeks(p)}</strong></p>` : `<p class="harga-blok${cicilanHtml ? ' ada-cicilan' : ''}"><small>${hargaMulaiLabel(p)}</small><strong>${m(hargaTeks(p, mt))}</strong></p>${cicilanHtml}`}
  <p class="ringkas">${m(p.ringkas)}</p>
  <div class="aksi">
    ${habis ? '' : `<button type="button" class="tombol" data-buka-lead data-p="${p.slug}">Jadwalkan survei</button>`}
    <a class="tautan" href="#tipe">Lihat tipe dan harga</a>${saudara.length ? '\n    <a class="tautan" href="#tipe-lain">Lihat tipe lain</a>' : ''}
  </div>
</div></section>
<div class="galeri" tabindex="0" role="region" aria-label="Galeri foto, geser ke samping">${galeri}</div>

${seksi('ringkas', 'Ringkasan proyek', '', `<dl class="fakta">
    <div><dt>Lokasi</dt><dd>${m(p.alamat)}</dd></div>
    <div><dt>${sewa ? 'Pengelola' : 'Developer'}</dt><dd>${m(p.developer)}</dd></div>
    ${p.sertifikat ? `<div><dt>Sertifikat</dt><dd>${m(p.sertifikat)}</dd></div>` : ''}
    ${p.kantor ? `<div><dt>Kantor pemasaran</dt><dd>${m(p.kantor)}</dd></div>` : ''}
  </dl>`, false)}
${seksi('tipe', `${JENIS[p.jenis].tipeNama} dan harga${sewa ? ' sewa' : ''}`, 'Harga dan ketersediaan dapat berubah. Tanyakan ke marketing untuk angka terbaru.', `<ul class="tipe">${tipeRows}</ul>`)}
${saudaraSec}
${fas ? seksi('fasilitas', 'Fasilitas', `Hanya fasilitas yang benar-benar tersedia di ${JENIS[p.jenis].nama.toLowerCase()} ini.`, `<ul class="fasilitas">${fas}</ul>`) : ''}
${videoSec}
${kelompok.length ? `
<section class="bagian sekitar" id="lokasi" aria-labelledby="h-lokasi">
  <div class="wrap">
    <div class="sek-kartu">
      <div class="sek-kepala">
        <div><p class="sek-atas">Di sekitar ${m(p.nama)}</p><h2 id="h-lokasi">Lokasi dan akses</h2></div>
        <p class="sek-ket">Perkiraan waktu tempuh dari lokasi proyek. Waktu sebenarnya bisa berbeda tergantung lalu lintas.</p>
      </div>
      <div class="sek-kisi" data-n="${kelompok.length}">${kolomSekitar}
      </div>
      ${peta ? `<div class="sek-kaki">${peta}</div>` : ''}
    </div>
  </div>
</section>` : (peta ? seksi('lokasi', 'Lokasi', '', peta) : '')}
${caraSection(sewa ? 'sewa' : 'jual')}
${faqSection(sewa ? 'sewa' : 'jual')}
${lainSec}
${ctaBlok(`Jadwalkan survei ${m(p.nama)}`, 'Isi nama dan nomor HP, lalu WhatsApp terbuka dengan pesan yang sudah terisi.', habis ? '' : p.slug)}`;
}

/* ---------- Tulis berkas ---------- */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
cpSync(join(ROOT, 'assets'), join(OUT, 'assets'), { recursive: true });

// Foto: dikecilkan ke WebP, nama file memuat kode isinya, sehingga foto yang diganti langsung tampil baru.
let jumlahFoto = 0, byteFoto = 0;
const fotoKawasan = new Map(); // foto kawasan diproses sekali, dipakai semua tipe di kawasan itu
for (const p of data.perumahan) {
  const r = await prosesFoto({ sharp, dirSumber: join(RUMAH_DIR, p.folder), dirKeluar: join(OUT, 'foto', p.slug), files: p.fileFoto });
  for (const g of r.galat) galat.push(`[${p.folder}] ${g}`);
  p.foto = r.foto.map((f) => ({ ...f, dir: p.slug }));
  p.kartu = r.kartu ? { ...r.kartu, dir: p.slug } : null;
  p.og = r.og; p.ogDir = p.slug;
  jumlahFoto += r.foto.length; byteFoto += r.byteKeluar;
  if (p.kawasanSlug && p.fileFotoKawasan.length) {
    let k = fotoKawasan.get(p.kawasanSlug);
    if (!k) {
      k = await prosesFoto({ sharp, dirSumber: join(RUMAH_DIR, p.kawasanFolder), dirKeluar: join(OUT, 'foto', p.kawasanSlug), files: p.fileFotoKawasan });
      for (const g of k.galat) galat.push(`[${p.kawasanFolder}] ${g}`);
      fotoKawasan.set(p.kawasanSlug, k);
      jumlahFoto += k.foto.length; byteFoto += k.byteKeluar;
    }
    // Foto kawasan yang isinya sama dengan foto tipe tidak ditampilkan dua kali (misalnya foto lama yang belum dihapus dari folder proyek).
    const sudahAda = new Set(r.foto.map((f) => f.id));
    p.foto.push(...k.foto.filter((f) => !sudahAda.has(f.id)).map((f) => ({ ...f, dir: p.kawasanSlug })));
    if (!p.kartu && k.kartu) { p.kartu = { ...k.kartu, dir: p.kawasanSlug }; p.og = k.og; p.ogDir = p.kawasanSlug; }
  }
}
if (galat.length) berhenti();
writeFileSync(join(OUT, '_headers'), '/foto/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n');

const namaLokasi = data.lokasi.map((l) => l.nama).join(', ');
const ogHome = C.ogImage || '';
writeFileSync(join(OUT, 'index.html'), page({
  depth: 0,
  title: `${C.brand} - ${cap(RUMAH)} ${AKSI} di ${namaLokasi}`,
  desc: `Pilih lokasi, lihat ${PROP} dan harganya, lalu jadwalkan survei lewat WhatsApp.`,
  main: berandaMain(),
  canonicalPath: '/',
  ogImage: ogHome,
}));

data.perumahan.forEach((p, idx) => {
  const lok = lokasiMap.get(p.lokasi);
  const mt = minTipe(p);
  const foto0 = p.og && C.domain ? `${C.domain.replace(/\/$/, '')}/foto/${p.ogDir || p.slug}/${p.og}` : ogHome;
  const dir = join(OUT, 'rumah', p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page({
    depth: 2,
    title: `${p.nama} - ${({ perumahan: 'Rumah', apartemen: 'Apartemen', ruko: 'Ruko' })[p.jenis]}${sewaP(p) ? ' disewakan' : ''} di ${lok.nama} | ${C.brand}`,
    desc: `${p.ringkas}${mt ? ` ${hargaMulaiLabel(p)} ${hargaTeks(p, mt)}.` : ''}`.slice(0, 200),
    main: detailMain(p, idx),
    canonicalPath: `/rumah/${p.slug}/`,
    ogImage: foto0,
    pageInfo: { slug: p.slug, lokasi: p.lokasi, jenis: p.jenis, transaksi: p.transaksi },
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
console.log('Jenis: ' + jenisAda.map((j) => `${JENIS[j].nama} (${data.perumahan.filter((p) => p.jenis === j).length})`).join(', '));
console.log('Transaksi: ' + [['Dijual', adaJual ? data.perumahan.filter((p) => !sewaP(p)).length : 0], ['Disewa', data.perumahan.filter(sewaP).length]].filter(([, n]) => n).map(([k, n]) => `${k} (${n})`).join(', '));
console.log('Lokasi: ' + data.lokasi.map((l) => `${l.nama} (${data.perumahan.filter((p) => p.lokasi === l.slug).length})`).join(', '));
for (const p of data.perumahan) {
  const a = avail(p).length;
  console.log(`  - ${p.slug}: ${p.nama} [${p.jenis}${sewaP(p) ? ', sewa' : ''}], ${p.lokasiNama}, ${a} dari ${p.tipe.length} tipe tersedia, ${p.foto.length} foto${p.youtube ? ', ada video' : ''}`);
}
