// Video yang diunggah langsung ke folder rumah (selain link YouTube).
// Aturan: format MP4 (H.264) atau WebM, maksimal 25 MB per file (batas Cloudflare Pages dan unggahan lewat web GitHub),
// maksimal 3 video per folder. Video dipasang di halaman rumah dan baru dimuat saat tombol putar ditekan.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

export const MAKS_BYTE = 25 * 1024 * 1024;
export const MAKS_VIDEO = 3;
const BISA = { '.mp4': 'video/mp4', '.webm': 'video/webm' };
const TOLAK = new Set(['.mov', '.m4v', '.avi', '.mkv', '.wmv', '.3gp', '.flv', '.mpg', '.mpeg']);
const banding = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

export const tipeVideo = (nama) => BISA[extname(nama).toLowerCase()] || '';

export function daftarVideo(dir) {
  const semua = readdirSync(dir).filter((f) => !f.startsWith('.') && !f.startsWith('_'));
  const video = semua.filter((f) => BISA[extname(f).toLowerCase()]).sort(banding);
  const ditolak = semua.filter((f) => TOLAK.has(extname(f).toLowerCase())).sort(banding);
  return { video, ditolak };
}

// Membaca kotak (box) tingkat atas file MP4: apakah data info (moov) ada sebelum data video (mdat) = bisa mulai diputar sebelum selesai diunduh.
// Kodek dibaca dari nama jenis di dalam file: avc1 = H.264 (aman di semua HP), hvc1 atau hev1 = HEVC (sering gagal diputar di Chrome dan Android).
export function analisaMp4(buf) {
  let urutan = [];
  let pos = 0;
  while (pos + 8 <= buf.length && urutan.length < 20) {
    let ukuran = buf.readUInt32BE(pos);
    const jenis = buf.toString('latin1', pos + 4, pos + 8);
    if (ukuran === 1 && pos + 16 <= buf.length) ukuran = Number(buf.readBigUInt64BE(pos + 8));
    else if (ukuran === 0) ukuran = buf.length - pos;
    if (!/^[\x20-\x7e]{4}$/.test(jenis) || ukuran < 8) break;
    urutan.push(jenis);
    pos += ukuran;
  }
  const h264 = buf.includes('avc1') || buf.includes('avc3');
  const hevc = buf.includes('hvc1') || buf.includes('hev1');
  const moov = urutan.indexOf('moov'), mdat = urutan.indexOf('mdat');
  return {
    mp4: urutan.includes('ftyp'),
    kodek: h264 ? 'h264' : (hevc ? 'hevc' : 'lain'),
    siapStream: moov >= 0 && (mdat < 0 || moov < mdat),
  };
}

// Memeriksa satu file video. Hasil: { galat: [teks], peringatan: [teks] }.
export function periksaVideo(dir, nama, ctx) {
  const galat = [], peringatan = [];
  const jalur = join(dir, nama);
  const ukuran = statSync(jalur).size;
  const mb = (ukuran / 1048576).toFixed(1).replace('.', ',');
  if (ukuran === 0) { galat.push(`${ctx} ${nama}: file video kosong. Unggah ulang`); return { galat, peringatan }; }
  if (ukuran > MAKS_BYTE) {
    galat.push(`${ctx} ${nama}: video berukuran ${mb} MB, melebihi batas 25 MB. Kecilkan dulu (resolusi 720p, format MP4 H.264), cara singkatnya ada di CARA-UBAH.txt`);
    return { galat, peringatan };
  }
  if (extname(nama).toLowerCase() === '.mp4') {
    const a = analisaMp4(readFileSync(jalur));
    if (!a.mp4) galat.push(`${ctx} ${nama}: isinya bukan video MP4 yang utuh. Ekspor ulang sebagai MP4 (H.264)`);
    else if (a.kodek === 'hevc') galat.push(`${ctx} ${nama}: video memakai kodek HEVC (H.265, bawaan rekaman iPhone) yang sering tidak bisa diputar di Chrome dan Android. Ubah ke MP4 H.264`);
    else if (!a.siapStream) peringatan.push(`${ctx} ${nama}: video belum "web optimized" (fast start), jadi baru mulai diputar setelah banyak terunduh. Ekspor ulang dengan pilihan Web Optimized`);
  }
  return { galat, peringatan };
}
