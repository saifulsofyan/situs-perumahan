// Membaca info.txt satu perumahan. Format sederhana "kunci: nilai", tanpa tanda kutip atau koma JSON.
// Dipakai oleh build.mjs. Semua pesan galat memakai bahasa Indonesia dan menyebut barisnya.

export function slugify(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Jenis properti. "wajib" = ukuran yang harus ada di tiap baris tipe; yang lain boleh ditulis kalau relevan.
// Kunci urutan dipakai untuk menampilkan jenis di beranda.
export const JENIS = {
  perumahan: { nama: 'Perumahan', wajib: ['lt', 'lb', 'kt', 'km'], contoh: 'LT 60 | LB 30 | KT 2 | KM 1', tipeNama: 'Tipe rumah', unit: 'rumah' },
  apartemen: { nama: 'Apartemen', wajib: ['lb', 'kt', 'km'], contoh: 'LB 36 | KT 2 | KM 1', tipeNama: 'Tipe unit', unit: 'unit' },
  ruko: { nama: 'Ruko', wajib: ['lt', 'lb', 'lantai'], contoh: 'LT 72 | LB 180 | Lantai 3', tipeNama: 'Tipe ruko', unit: 'unit' },
};
const SINONIM_JENIS = {
  perumahan: 'perumahan', rumah: 'perumahan', cluster: 'perumahan', townhouse: 'perumahan', 'rumah tapak': 'perumahan',
  apartemen: 'apartemen', apartment: 'apartemen', apartement: 'apartemen', apartemenn: 'apartemen', rusun: 'apartemen', condo: 'apartemen', kondominium: 'apartemen',
  ruko: 'ruko', rukan: 'ruko', shophouse: 'ruko', 'rumah toko': 'ruko', 'rumah kantor': 'ruko',
};
export function normalJenis(raw) {
  return SINONIM_JENIS[String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim()] || null;
}

// Kategori tempat di sekitar proyek (bagian "Lokasi dan akses"). Urutan di sini = urutan tampil.
export const KATEGORI_AKSES = {
  belanja: { nama: 'Mall & Lifestyle', ket: 'Belanja, kuliner, dan kebutuhan keluarga' },
  kesehatan: { nama: 'Rumah Sakit', ket: 'Layanan kesehatan dalam jangkauan' },
  pendidikan: { nama: 'Sekolah & Kampus', ket: 'Pendidikan untuk anak dan keluarga' },
  akses: { nama: 'Fasilitas & Akses', ket: 'Jalan tol, stasiun, dan akses harian' },
  rekreasi: { nama: 'Taman & Rekreasi', ket: 'Ruang terbuka, olahraga, dan hiburan' },
};
const SINONIM_AKSES = {
  belanja: ['mall & lifestyle', 'mall dan lifestyle', 'mall', 'lifestyle', 'belanja', 'kuliner', 'pusat belanja', 'supermarket', 'pasar'],
  kesehatan: ['rumah sakit', 'rs', 'kesehatan', 'klinik', 'rumah sakit & klinik'],
  pendidikan: ['sekolah & kampus', 'sekolah dan kampus', 'sekolah', 'kampus', 'pendidikan', 'universitas'],
  akses: ['fasilitas & akses', 'fasilitas dan akses', 'akses', 'tol', 'jalan tol', 'transportasi', 'stasiun', 'fasilitas'],
  rekreasi: ['taman & rekreasi', 'taman dan rekreasi', 'taman', 'rekreasi', 'olahraga', 'wisata', 'hiburan'],
};
export function normalKategoriAkses(raw) {
  const k = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [kunci, daftar] of Object.entries(SINONIM_AKSES)) if (daftar.includes(k)) return kunci;
  return null;
}

// Transaksi: dijual atau disewa. Bawaan: jual.
export const TRANSAKSI = { jual: { nama: 'Dijual' }, sewa: { nama: 'Disewa' } };
const SINONIM_TRANSAKSI = {
  jual: 'jual', dijual: 'jual', beli: 'jual', 'dijual dan dibeli': 'jual',
  sewa: 'sewa', disewa: 'sewa', disewakan: 'sewa', sewakan: 'sewa', kontrak: 'sewa', dikontrakkan: 'sewa', dikontrakan: 'sewa', rent: 'sewa', rental: 'sewa',
};
export function normalTransaksi(raw) {
  return SINONIM_TRANSAKSI[String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim()] || null;
}

// Nama kunci yang diterima (dan sinonimnya).
const KUNCI = {
  nama: 'nama', lokasi: 'lokasi', kota: 'lokasi', area: 'lokasi',
  jenis: 'jenis', kategori: 'jenis', tipeproperti: 'jenis', jenisproperti: 'jenis',
  transaksi: 'transaksi', penawaran: 'transaksi', jualsewa: 'transaksi',
  alamat: 'alamat', developer: 'developer', pengembang: 'developer', pengelola: 'developer', pemilik: 'developer',
  sertifikat: 'sertifikat', ringkas: 'ringkas', ringkasan: 'ringkas', deskripsi: 'ringkas',
  kantor: 'kantor', kantorpemasaran: 'kantor',
  fasilitas: 'fasilitas', youtube: 'youtube', video: 'youtube',
  maps: 'maps', peta: 'maps', googlemaps: 'maps',
  tipe: 'tipe', akses: 'akses', urutan: 'urutan',
  cicilan: 'cicilan', kpr: 'cicilan', angsuran: 'cicilan',
  tentang: 'tentang', penjelasan: 'tentang',
};
// Tempat yang belum jadi boleh ditulis tanpa waktu tempuh, memakai salah satu keterangan ini sebagai ganti waktu.
const STATUS_BELUM = /^(sedang dibangun|sedang dalam pembangunan|dalam pembangunan|akan dibangun|segera dibangun|rencana)$/i;
const DAFTAR = new Set(['tipe', 'akses', 'fasilitas']); // kunci yang isinya berupa daftar (baris diawali "-")
const normKunci = (s) => s.toLowerCase().replace(/[\s_]+/g, '');

function jarak(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
function saran(k) {
  let best = '', bd = 3;
  for (const kk of Object.keys(KUNCI)) {
    const d = jarak(k, kk);
    if (d < bd) { bd = d; best = kk; }
  }
  return best;
}

// "850 juta", "1,05 miliar", "Rp 850.000.000", "850000000", "Rp850jt" -> angka rupiah.
export function parseHarga(raw) {
  let s = String(raw ?? '').toLowerCase().replace(/rp\.?/g, '').replace(/[,.\s]*-+\s*$/, '').replace(/\s+/g, ' ').trim();
  const mt = s.match(/^([\d.,]+)\s*(miliar|milyar|juta|jt|ribu|rb|m)$/);
  if (mt) {
    if ((mt[1].match(/[.,]/g) || []).length > 1) return NaN;
    const n = parseFloat(mt[1].replace(',', '.'));
    const kali = mt[2] === 'juta' || mt[2] === 'jt' ? 1e6 : mt[2] === 'ribu' || mt[2] === 'rb' ? 1e3 : 1e9;
    return Math.round(n * kali);
  }
  if (/^[\d.,\s]+$/.test(s)) {
    const digits = s.replace(/[.,\s]/g, '');
    return digits ? Number(digits) : NaN;
  }
  return NaN;
}

// Harga sewa: "25 juta/tahun", "3,5 juta per bulan", "2jt/bln" -> { teks: "25 juta", periode: "tahun" }.
// Tanpa satuan waktu -> periode ''.
export function pisahPeriode(raw) {
  const s = String(raw ?? '').trim();
  const mt = s.match(/^(.*?)\s*(?:\/\s*|\b(?:per|tiap|setiap)\s+)(bulan|bln|tahun|thn)\.?$/i);
  if (!mt) return { teks: s, periode: '' };
  const w = mt[2].toLowerCase();
  return { teks: mt[1].trim(), periode: w === 'bulan' || w === 'bln' ? 'bulan' : 'tahun' };
}

// Link YouTube apa pun, atau ID-nya langsung -> ID. Kosong -> ''. Tidak dikenali -> null.
export function youtubeId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}

const STATUS = {
  terjual: 'Terjual', sold: 'Terjual', 'sold out': 'Terjual', habis: 'Terjual',
  disewa: 'Terjual', tersewa: 'Terjual', 'sudah disewa': 'Terjual', 'sudah tersewa': 'Terjual', penuh: 'Terjual', full: 'Terjual',
  tersedia: 'Tersedia', ready: 'Tersedia', 'ready stock': 'Tersedia', available: 'Tersedia',
};

const NAMA_UKURAN = { lt: 'LT', lb: 'LB', kt: 'KT', km: 'KM', lantai: 'Lantai' };
const ARTI_UKURAN = { lt: 'luas tanah', lb: 'luas bangunan atau unit', kt: 'kamar tidur', km: 'kamar mandi', lantai: 'jumlah lantai' };

function parseTipe(teks, ctx, galat, jenis, transaksi) {
  const J = JENIS[jenis];
  const sewa = transaksi === 'sewa';
  const bagian = teks.split('|').map((x) => x.trim()).filter(Boolean);
  const nama = bagian[0];
  if (!nama || bagian.length < 2) {
    galat.push(`${ctx}: baris tipe harus berbentuk "- Nama tipe | ${sewa ? '25 juta/tahun' : 'harga'} | ${J.contoh} | Tersedia" (ditemukan: "${teks}")`);
    return null;
  }
  const { teks: teksHarga, periode } = pisahPeriode(bagian[1]);
  const contohHarga = sewa ? '25 juta/tahun atau 3,5 juta/bulan' : '850 juta, 1,05 miliar, atau 850000000';
  const harga = parseHarga(teksHarga);
  if (!Number.isFinite(harga)) {
    galat.push(`${ctx} "${nama}": harga "${bagian[1]}" tidak terbaca. Tulis misalnya ${contohHarga}`);
    return null;
  }
  if (sewa) {
    if (!periode) {
      galat.push(`${ctx} "${nama}": harga sewa harus memakai satuan waktu. Tulis misalnya 25 juta/tahun atau 3,5 juta/bulan (ditemukan: "${bagian[1]}")`);
      return null;
    }
    const [lo, hi] = periode === 'bulan' ? [2e5, 3e8] : [2e6, 5e9];
    if (harga < lo || harga > hi) {
      galat.push(`${ctx} "${nama}": harga sewa ${harga} per ${periode} tidak masuk akal. Tulis lengkap dengan satuan, misalnya ${periode === 'bulan' ? '3,5 juta/bulan' : '25 juta/tahun'}`);
      return null;
    }
  } else {
    if (periode) {
      galat.push(`${ctx} "${nama}": harga jual tidak memakai /${periode}. Hapus "/${periode}", atau tulis "transaksi: sewa" kalau ini properti yang disewakan`);
      return null;
    }
    if (harga < 1e7 || harga > 1e11) {
      galat.push(`${ctx} "${nama}": harga ${harga} tidak masuk akal. Tulis lengkap dengan satuan, misalnya 850 juta`);
      return null;
    }
  }
  const t = { nama, harga, status: 'Tersedia' };
  if (sewa) t.periode = periode;
  let adaStatus = false;
  for (const b of bagian.slice(2)) {
    const lb = b.match(/^(lt|lb|kt|km|lantai)\s*[:=]?\s*(\d+)(?![\d])/i);
    if (lb) {
      const k = lb[1].toLowerCase();
      if (typeof t[k] === 'number') {
        galat.push(`${ctx} "${nama}": ${NAMA_UKURAN[k]} ditulis dua kali`);
        return null;
      }
      t[k] = Number(lb[2]);
      continue;
    }
    if (/^\d/.test(b)) {
      galat.push(`${ctx} "${nama}": "${b}" harus diberi label, contoh "LT 60" (luas tanah), "LB 30" (luas bangunan atau unit), "KT 2" (kamar tidur), "KM 1" (kamar mandi), "Lantai 3" (jumlah lantai)`);
      return null;
    }
    if (adaStatus) {
      galat.push(`${ctx} "${nama}": status ditulis dua kali ("${b}")`);
      return null;
    }
    adaStatus = true;
    t.status = STATUS[b.toLowerCase()] || b;
  }
  const kurang = J.wajib.filter((k) => typeof t[k] !== 'number');
  if (kurang.length) {
    galat.push(`${ctx} "${nama}": belum ada ${kurang.map((k) => `${NAMA_UKURAN[k]} (${ARTI_UKURAN[k]})`).join(', ')}. Untuk ${J.nama.toLowerCase()} tulis misalnya: ${J.contoh}`);
    return null;
  }
  const hasil = { nama: t.nama, harga: t.harga, status: t.status };
  if (sewa) hasil.periode = t.periode;
  for (const k of ['lt', 'lb', 'kt', 'km', 'lantai']) if (typeof t[k] === 'number') hasil[k] = t[k];
  return hasil;
}

/**
 * @param {string} teks isi info.txt
 * @param {string} ctx  nama folder, dipakai di awal pesan galat
 * @param {{produksi?: boolean}} opsi
 * @returns {{rumah: object, galat: string[]}}
 */
export function parseInfo(teks, ctx, opsi = {}) {
  const galat = [];
  const baris = String(teks ?? '').replace(/^\p{Cf}+/u, '').split(/\r?\n/);
  const isi = {}; // kunci baku -> { nilai, item[], baris }
  let aktif = null;

  baris.forEach((mentah, i) => {
    const no = i + 1;
    const b = mentah.trim();
    if (!b || b.startsWith('#')) return;

    if (b.startsWith('-')) {
      if (!aktif || !DAFTAR.has(aktif)) {
        galat.push(`${ctx} info.txt baris ${no}: baris diawali "-" hanya boleh di bawah tipe:, akses:, atau fasilitas:`);
        return;
      }
      isi[aktif].item.push({ teks: b.replace(/^-+\s*/, ''), no });
      return;
    }

    const kv = b.match(/^([^:]{1,40}):\s*(.*)$/);
    if (kv) {
      const mentahKunci = kv[1].trim();
      const baku = KUNCI[normKunci(mentahKunci)];
      if (baku) {
        if (isi[baku]) {
          galat.push(`${ctx} info.txt baris ${no}: "${mentahKunci}" ditulis dua kali`);
          aktif = null;
          return;
        }
        isi[baku] = { nilai: kv[2].trim(), item: [], no };
        aktif = baku;
        return;
      }
      if (/^[A-Za-z][A-Za-z ]{0,18}$/.test(mentahKunci)) {
        const s = saran(normKunci(mentahKunci));
        galat.push(`${ctx} info.txt baris ${no}: kunci "${mentahKunci}" tidak dikenal${s ? ` (maksud Anda "${s}"?)` : ''}. Kalau ini lanjutan kalimat sebelumnya, hapus tanda titik dua`);
        aktif = null;
        return;
      }
    }

    // Lanjutan kalimat dari baris sebelumnya.
    if (aktif && !(aktif === 'tipe' || aktif === 'akses')) {
      isi[aktif].nilai = (isi[aktif].nilai + ' ' + b).trim();
    } else if (aktif) {
      galat.push(`${ctx} info.txt baris ${no}: di bawah ${aktif}: setiap baris harus diawali "-" ("${b}")`);
    } else {
      galat.push(`${ctx} info.txt baris ${no}: baris ini tidak berada di bawah kunci apa pun ("${b}")`);
    }
  });

  const skalar = (k) => (isi[k] ? isi[k].nilai.trim() : '');
  const rumah = {
    nama: skalar('nama'),
    jenis: 'perumahan', // bawaan kalau "jenis:" tidak ditulis
    transaksi: 'jual', // bawaan kalau "transaksi:" tidak ditulis
    lokasiNama: skalar('lokasi'),
    alamat: skalar('alamat'),
    developer: skalar('developer'),
    sertifikat: skalar('sertifikat'),
    ringkas: skalar('ringkas'),
    kantor: skalar('kantor'),
    youtube: '',
    maps: skalar('maps'),
    fasilitas: [],
    tipe: [],
    akses: undefined,
    tentangJudul: '',
    tentangIsi: '',
    urutan: 1000,
  };

  if (isi.jenis && isi.jenis.nilai) {
    const j = normalJenis(isi.jenis.nilai);
    if (!j) galat.push(`${ctx} info.txt baris ${isi.jenis.no}: jenis "${isi.jenis.nilai}" tidak dikenal. Tulis salah satu: ${Object.keys(JENIS).join(', ')}`);
    else rumah.jenis = j;
  }
  if (isi.transaksi && isi.transaksi.nilai) {
    const tr = normalTransaksi(isi.transaksi.nilai);
    if (!tr) galat.push(`${ctx} info.txt baris ${isi.transaksi.no}: transaksi "${isi.transaksi.nilai}" tidak dikenal. Tulis jual (dijual) atau sewa (disewa)`);
    else rumah.transaksi = tr;
  }

  // Sertifikat wajib untuk properti dijual; untuk properti disewa boleh dikosongkan.
  for (const k of ['nama', 'lokasiNama', 'alamat', 'developer', 'sertifikat', 'ringkas']) {
    if (k === 'sertifikat' && rumah.transaksi === 'sewa') continue;
    if (!rumah[k]) galat.push(`${ctx} info.txt: "${k === 'lokasiNama' ? 'lokasi' : k}:" belum diisi`);
  }
  if (rumah.nama.length > 80) galat.push(`${ctx} info.txt: nama terlalu panjang (maksimal 80 huruf)`);

  // Bagian "Tentang": uraian lebih panjang. Tulis "Judul | isi uraian". Tanpa tanda | seluruhnya dianggap isi.
  if (isi.tentang && isi.tentang.nilai) {
    // Dua garis tegak berurutan (||) = pindah paragraf. Disimpan dulu sebagai penanda supaya tidak dikira pemisah judul.
    const PARA = '\u0001';
    const mentah = isi.tentang.nilai.replace(/\|\|/g, PARA);
    const garis = mentah.indexOf('|');
    const judul = (garis >= 0 ? mentah.slice(0, garis) : '').replace(new RegExp(PARA, 'g'), ' ').trim();
    const paragraf = (garis >= 0 ? mentah.slice(garis + 1) : mentah).split(PARA).map(t => t.trim()).filter(Boolean);
    const uraian = paragraf.join('\n\n');
    const c = `${ctx} info.txt baris ${isi.tentang.no}`;
    if (!uraian) galat.push(`${c}: tentang: belum ada isinya. Tulis "Judul | uraian"`);
    else if (judul.length > 100) galat.push(`${c}: judul tentang terlalu panjang (maksimal 100 huruf)`);
    else if (uraian.length > 1500) galat.push(`${c}: uraian tentang terlalu panjang (maksimal 1500 huruf)`);
    else { rumah.tentangJudul = judul || `Tentang ${rumah.nama}`; rumah.tentangIsi = uraian; }
  }
  if (isi.youtube) {
    const id = youtubeId(isi.youtube.nilai);
    if (id === null) galat.push(`${ctx} info.txt: link YouTube tidak dikenali. Tempel link videonya atau ID 11 huruf-nya`);
    else rumah.youtube = id;
  }
  if (rumah.maps && !/^https:\/\//.test(rumah.maps)) {
    galat.push(`${ctx} info.txt: link maps harus diawali https:// (salin dari tombol Bagikan di Google Maps)`);
  }
  if (isi.urutan) {
    const n = Number(isi.urutan.nilai);
    if (!Number.isInteger(n) || n < 0 || n > 100000) galat.push(`${ctx} info.txt: urutan harus angka bulat, contoh 1 (angka kecil tampil lebih dulu)`);
    else rumah.urutan = n;
  }

  if (isi.fasilitas) {
    const daftar = [isi.fasilitas.nilai, ...isi.fasilitas.item.map((x) => x.teks)]
      .join(';').split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    rumah.fasilitas = daftar;
  }
  if (isi.tipe) {
    if (isi.tipe.nilai) galat.push(`${ctx} info.txt baris ${isi.tipe.no}: tulis "tipe:" lalu daftar tipe di baris-baris berikutnya, masing-masing diawali "-"`);
    for (const it of isi.tipe.item) {
      const t = parseTipe(it.teks, `${ctx} info.txt baris ${it.no}`, galat, rumah.jenis, rumah.transaksi);
      if (t) rumah.tipe.push(t);
    }
    const nama = new Set();
    for (const t of rumah.tipe) {
      if (nama.has(t.nama.toLowerCase())) galat.push(`${ctx} info.txt: tipe "${t.nama}" ditulis dua kali`);
      nama.add(t.nama.toLowerCase());
    }
  }
  if (!rumah.tipe.length && !(isi.tipe && isi.tipe.item.length)) {
    galat.push(`${ctx} info.txt: belum ada tipe. Tambahkan "tipe:" diikuti baris "- Tipe 30/60 | ${rumah.transaksi === 'sewa' ? '25 juta/tahun' : '850 juta'} | ${JENIS[rumah.jenis].contoh} | Tersedia"`);
  }
  // Cicilan KPR per bulan (khusus dijual): "9,5 juta/bulan" atau "9,5 juta/bulan | tenor 20 tahun, DP 10%".
  if (isi.cicilan && isi.cicilan.nilai) {
    const [angka, ...sisa] = isi.cicilan.nilai.split('|').map((x) => x.trim());
    const ket = sisa.join(' | ').trim();
    const { teks, periode } = pisahPeriode(angka);
    const n = parseHarga(teks);
    const c = `${ctx} info.txt baris ${isi.cicilan.no}`;
    if (rumah.transaksi === 'sewa') galat.push(`${c}: cicilan hanya untuk properti dijual. Hapus baris cicilan untuk properti sewa`);
    else if (periode === 'tahun') galat.push(`${c}: cicilan ditulis per bulan, contoh 9,5 juta/bulan`);
    else if (!Number.isFinite(n) || n < 5e5 || n > 5e8) galat.push(`${c}: cicilan "${angka}" tidak masuk akal. Tulis lengkap dengan satuan, contoh 9,5 juta/bulan`);
    else if (ket.length > 120) galat.push(`${c}: catatan cicilan terlalu panjang (maksimal 120 huruf)`);
    else {
      const tersedia = rumah.tipe.filter((t) => t.status !== 'Terjual');
      const termurah = Math.min(...(tersedia.length ? tersedia : rumah.tipe).map((t) => t.harga));
      if (Number.isFinite(termurah) && n * 12 >= termurah) galat.push(`${c}: cicilan ${angka} per bulan terlalu besar dibanding harga termurah (cicilan setahun sudah melebihi harga). Cek angkanya`);
      else rumah.cicilan = { harga: n, ket };
    }
  }

  if (isi.akses) {
    rumah.akses = [];
    const contohAkses = '"- Rumah Sakit | Mitra Keluarga | 5 menit" (kategori | nama tempat | waktu tempuh)';
    for (const it of isi.akses.item) {
      const bagian = it.teks.split('|').map((x) => x.trim());
      if (bagian.length > 3 || bagian.length < 2) { galat.push(`${ctx} info.txt baris ${it.no}: akses harus berbentuk ${contohAkses}`); continue; }
      // Bentuk lama "nama | waktu" tanpa kategori masuk ke "Fasilitas & Akses".
      const [kat, nama, waktu] = bagian.length === 3 ? bagian : ['akses', bagian[0], bagian[1]];
      const kunci = normalKategoriAkses(kat);
      if (!kunci) galat.push(`${ctx} info.txt baris ${it.no}: kategori "${kat}" tidak dikenal. Tulis salah satu: ${Object.values(KATEGORI_AKSES).map((x) => x.nama).join(', ')}`);
      else if (!nama || !waktu) galat.push(`${ctx} info.txt baris ${it.no}: akses harus berbentuk ${contohAkses}`);
      else if (!/\d/.test(waktu) && !STATUS_BELUM.test(waktu)) galat.push(`${ctx} info.txt baris ${it.no}: waktu tempuh "${waktu}" harus memakai angka, contoh 5 menit. Untuk tempat yang belum jadi, tulis sedang dibangun. Kalau belum dicek, hapus barisnya`);
      else rumah.akses.push({ kategori: kunci, nama, waktu, ...(STATUS_BELUM.test(waktu) ? { belum: true } : {}) });
    }
    if (!rumah.akses.length) rumah.akses = undefined;
  }

  if (opsi.produksi) {
    const teksSemua = [
      ...Object.entries(rumah).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k === 'lokasiNama' ? 'lokasi' : k.startsWith('tentang') ? 'tentang' : k, v]),
      ...rumah.fasilitas.map((v) => ['fasilitas', v]),
      ...rumah.tipe.flatMap((t) => [['tipe', t.nama], ['tipe', t.status]]),
      ...(rumah.akses || []).flatMap((a) => [['akses', a.nama], ['akses', a.waktu]]),
      ...(rumah.cicilan && rumah.cicilan.ket ? [['cicilan', rumah.cicilan.ket]] : []),
    ];
    const sudah = new Set();
    for (const [k, v] of teksSemua) {
      if (/\[isi\b/i.test(v) && !sudah.has(k)) {
        sudah.add(k);
        galat.push(`${ctx} info.txt: "${k}" masih berisi teks contoh [ISI]. Ganti dengan data asli`);
      }
    }
  }

  return { rumah, galat };
}

/* ---------- Satu kartu per tipe ----------
   Folder perumahan/<kawasan>/ berisi info.txt kawasan (data bersama) dan foto kawasan.
   Di dalamnya, tiap subfolder yang punya info.txt adalah satu tipe: isinya tipe:, harga, foto, dan
   (kalau perlu) ringkas:, cicilan:, youtube:. Kunci yang tidak ditulis di info.txt tipe diambil dari kawasan.
   Hasilnya satu kartu dan satu halaman per tipe. */

// Ditulis hanya di info.txt tipe (tidak diwariskan dari kawasan).
const HANYA_TIPE = new Set(['tipe', 'cicilan']);

// Memecah teks info.txt menjadi blok per kunci. Komentar dan baris kosong ikut blok di atasnya.
function pecahBlok(teks, ctx) {
  const blok = [{ baku: null, baris: [] }];
  String(teks ?? '').replace(/^\p{Cf}+/u, '').split(/\r?\n/).forEach((t, i) => {
    const kv = t.trim().startsWith('-') || t.trim().startsWith('#') ? null : t.trim().match(/^([^:]{1,40}):/);
    const baku = kv ? KUNCI[normKunci(kv[1].trim())] : null;
    if (baku) blok.push({ baku, baris: [] });
    blok[blok.length - 1].baris.push({ t, ctx, no: i + 1 });
  });
  return blok;
}

/**
 * Menggabungkan info.txt kawasan dengan info.txt satu tipe. Kunci yang ada di tipe menggantikan kunci kawasan.
 * @returns {{ teks: string, peta: {ctx:string,no:number}[], galat: string[], urutanTipe: number|null }}
 */
export function gabungInfo(teksKawasan, teksTipe, ctxKawasan, ctxTipe) {
  const galat = [];
  const k = pecahBlok(teksKawasan, ctxKawasan);
  const t = pecahBlok(teksTipe, ctxTipe);
  const kunciT = new Set(t.map((b) => b.baku).filter(Boolean));
  for (const b of k) {
    if (HANYA_TIPE.has(b.baku)) {
      galat.push(`${ctxKawasan} info.txt baris ${b.baris[0].no}: "${b.baku}:" ditulis di info.txt tiap tipe (di dalam folder tipe), bukan di info.txt kawasan`);
    }
  }
  const nama = t.find((b) => b.baku === 'nama');
  if (nama) galat.push(`${ctxTipe} info.txt baris ${nama.baris[0].no}: nama proyek ditulis di info.txt kawasan. Nama tipe ditulis di baris "tipe:"`);
  // Urutan di info.txt tipe = urutan antar tipe dalam satu kawasan (bukan urutan kawasan).
  let urutanTipe = null;
  const ut = t.find((b) => b.baku === 'urutan');
  if (ut) {
    const v = ut.baris[0].t.replace(/^[^:]*:/, '').trim();
    const n = Number(v);
    if (!/^\d+$/.test(v) || n > 100000) galat.push(`${ctxTipe} info.txt baris ${ut.baris[0].no}: urutan harus angka bulat, contoh 1 (angka kecil tampil lebih dulu)`);
    else urutanTipe = n;
  }
  // urutan di info.txt kawasan selalu dipakai (urutan di info.txt tipe sudah diambil terpisah di atas).
  const dipakaiK = k.filter((b) => !(b.baku && ((kunciT.has(b.baku) && b.baku !== 'urutan') || HANYA_TIPE.has(b.baku))));
  const dipakaiT = t.filter((b) => b.baku !== 'urutan' && b.baku !== 'nama');
  const baris = [...dipakaiK, ...dipakaiT].flatMap((b) => b.baris);
  return { teks: baris.map((x) => x.t).join('\n'), peta: baris.map((x) => ({ ctx: x.ctx, no: x.no })), galat, urutanTipe };
}

// Pesan galat dari teks gabungan ditulis ulang supaya menunjuk file dan baris yang benar.
export function petakanGalat(daftar, peta) {
  return daftar.map((g) => g.replace(/^(\[[^\]]*\]) info\.txt baris (\d+)/, (semua, ctx, no) => {
    const p = peta[Number(no) - 1];
    return p ? `${p.ctx} info.txt baris ${p.no}` : semua;
  }));
}

// Setelah parseInfo pada teks gabungan: pastikan hanya satu tipe, lalu beri nama halaman "<Kawasan> Tipe <Tipe>".
export function jadikanHalamanTipe(rumah, ctx, galat) {
  if (rumah.tipe.length !== 1) {
    if (rumah.tipe.length > 1) galat.push(`${ctx} info.txt: tiap folder tipe hanya boleh berisi satu baris tipe (ada ${rumah.tipe.length}). Buat folder terpisah untuk tipe lain`);
    return rumah;
  }
  rumah.kawasan = rumah.nama;
  rumah.tipeNama = rumah.tipe[0].nama;
  rumah.nama = `${rumah.kawasan} Tipe ${rumah.tipeNama.replace(/^(tipe|type)\s+/i, '')}`;
  if (rumah.nama.length > 80) galat.push(`${ctx} info.txt: nama kawasan dan tipe digabung terlalu panjang (maksimal 80 huruf): "${rumah.nama}"`);
  return rumah;
}
