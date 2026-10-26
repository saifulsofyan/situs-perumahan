// Mengambil foto dari folder perumahan lalu mengecilkannya otomatis (WebP) saat build.
// Foto asli tidak diubah. Hasilnya ditulis ke situs/foto/<slug>/ dengan nama yang memuat kode isi file,
// jadi foto yang diganti langsung tampil baru dan foto yang sama boleh disimpan lama di peramban.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const TOLAK = new Set(['.heic', '.heif']);
const VERSI = 'v2'; // ubah kalau pengaturan kompresi berubah, supaya nama file ikut berganti

export async function muatSharp() {
  try { return (await import('sharp')).default; } catch { return null; }
}

// Foto dalam satu folder, diurutkan menurut nama dengan angka dihitung sebagai angka (2 sebelum 10).
export function daftarFoto(dir) {
  const semua = readdirSync(dir).filter((f) => !f.startsWith('.') && !f.startsWith('_'));
  const foto = semua.filter((f) => EXT.has(extname(f).toLowerCase()));
  const ditolak = semua.filter((f) => TOLAK.has(extname(f).toLowerCase()));
  foto.sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
  return { foto, ditolak };
}

// Pasang foto ke kanvas W x H. Rasio mirip: dipotong di bagian yang paling menarik.
// Rasio jauh berbeda (foto tegak, panorama): ditampilkan utuh di atas latar buram dari foto yang sama.
async function render(sharp, buf, W, H, format) {
  const dasar = () => sharp(buf).rotate().flatten({ background: '#ffffff' });
  const meta = await sharp(buf).metadata();
  const miring = meta.orientation >= 5;
  const w0 = miring ? meta.height : meta.width;
  const h0 = miring ? meta.width : meta.height;
  const r = w0 / h0;
  const t = W / H;
  let pipe;
  if (r >= t / 1.4 && r <= t * 1.4) {
    pipe = dasar().resize(W, H, { fit: 'cover', position: sharp.strategy.attention, withoutEnlargement: true });
  } else {
    const latar = await dasar().resize(W, H, { fit: 'cover' }).blur(24).toBuffer();
    const depan = await dasar().resize(W, H, { fit: 'inside', withoutEnlargement: true }).toBuffer();
    pipe = sharp(latar).composite([{ input: depan, gravity: 'centre' }]);
  }
  pipe = format === 'jpg' ? pipe.jpeg({ quality: 80, mozjpeg: true }) : pipe.webp({ quality: 78 });
  return pipe.toBuffer({ resolveWithObject: true });
}

// Foto galeri di halaman detail: bentuk asli dipertahankan, jadi foto tegak dari HP tampil tegak, tidak mengecil di tengah.
// Hanya foto yang terlalu tinggi (lebih tegak dari 3:4) atau terlalu lebar (lebih lebar dari 16:9) yang dipotong ke batas itu.
async function renderGaleri(sharp, buf) {
  const dasar = () => sharp(buf).rotate().flatten({ background: '#ffffff' });
  const meta = await sharp(buf).metadata();
  const miring = meta.orientation >= 5;
  const w0 = miring ? meta.height : meta.width;
  const h0 = miring ? meta.width : meta.height;
  const r = w0 / h0;
  let pipe;
  if (r < 3 / 4) {
    const W = Math.min(960, w0);
    pipe = dasar().resize(W, Math.round((W * 4) / 3), { fit: 'cover', position: sharp.strategy.attention });
  } else if (r > 16 / 9) {
    const H = Math.min(720, h0);
    pipe = dasar().resize(Math.round((H * 16) / 9), H, { fit: 'cover', position: sharp.strategy.attention });
  } else {
    pipe = dasar().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true });
  }
  return pipe.webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
}

async function paralel(items, batas, fn) {
  const hasil = new Array(items.length);
  let next = 0;
  const pekerja = Array.from({ length: Math.min(batas, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      hasil[i] = await fn(items[i], i);
    }
  });
  await Promise.all(pekerja);
  return hasil;
}

/**
 * @param {object} a
 * @param {any} a.sharp        modul sharp, atau null (hanya menyalin file apa adanya)
 * @param {string} a.dirSumber folder foto asli
 * @param {string} a.dirKeluar folder tujuan di situs/
 * @param {string[]} a.files   nama file foto, sudah berurutan
 * @returns {Promise<{foto: {file:string,w:number,h:number}[], kartu: {file:string,w:number,h:number}|null, og: string|null, galat: string[], byteKeluar: number}>}
 */
export async function prosesFoto({ sharp, dirSumber, dirKeluar, files }) {
  const galat = [];
  let byteKeluar = 0;
  if (!files.length) return { foto: [], kartu: null, og: null, galat, byteKeluar };
  mkdirSync(dirKeluar, { recursive: true });

  const tulis = (nama, data) => { writeFileSync(join(dirKeluar, nama), data); byteKeluar += data.length; };
  const kode = (buf) => createHash('sha1').update(buf).update(VERSI).digest('hex').slice(0, 8);

  const foto = await paralel(files, 3, async (f, i) => {
    const buf = readFileSync(join(dirSumber, f));
    const no = String(i + 1).padStart(2, '0');
    const h = kode(buf);
    if (!sharp) {
      const nama = `${no}-${h}${extname(f).toLowerCase()}`;
      tulis(nama, buf);
      return { file: nama, w: 1280, h: 960 };
    }
    try {
      const { data, info } = await renderGaleri(sharp, buf);
      const nama = `${no}-${h}.webp`;
      tulis(nama, data);
      return { file: nama, w: info.width, h: info.height };
    } catch (e) {
      galat.push(`${f}: tidak bisa dibaca sebagai gambar (${String(e.message).split('\n')[0]}). Coba simpan ulang sebagai JPG`);
      return null;
    }
  });
  if (galat.length) return { foto: [], kartu: null, og: null, galat, byteKeluar };

  // Gambar sampul untuk kartu di beranda dan gambar pratinjau link (WhatsApp, Facebook).
  const pertama = readFileSync(join(dirSumber, files[0]));
  const h0 = kode(pertama);
  let kartu, og;
  if (!sharp) {
    kartu = { ...foto[0] };
    og = foto[0].file;
  } else {
    try {
      const k = await render(sharp, pertama, 720, 540, 'webp');
      kartu = { file: `kartu-${h0}.webp`, w: k.info.width, h: k.info.height };
      tulis(kartu.file, k.data);
      const o = await render(sharp, pertama, 1200, 630, 'jpg');
      og = `og-${h0}.jpg`;
      tulis(og, o.data);
    } catch (e) {
      galat.push(`${files[0]}: gagal membuat gambar sampul (${String(e.message).split('\n')[0]})`);
    }
  }
  return { foto, kartu, og, galat, byteKeluar };
}
