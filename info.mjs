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
};
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
  if (isi.akses) {
    rumah.akses = [];
    for (const it of isi.akses.item) {
      const [nama, waktu] = it.teks.split('|').map((x) => x.trim());
      if (!nama || !waktu) galat.push(`${ctx} info.txt baris ${it.no}: akses harus berbentuk "- Jalan raya utama | 5 menit"`);
      else rumah.akses.push({ nama, waktu });
    }
    if (!rumah.akses.length) rumah.akses = undefined;
  }

  if (opsi.produksi) {
    const teksSemua = [
      ...Object.entries(rumah).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k === 'lokasiNama' ? 'lokasi' : k, v]),
      ...rumah.fasilitas.map((v) => ['fasilitas', v]),
      ...rumah.tipe.flatMap((t) => [['tipe', t.nama], ['tipe', t.status]]),
      ...(rumah.akses || []).flatMap((a) => [['akses', a.nama], ['akses', a.waktu]]),
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
