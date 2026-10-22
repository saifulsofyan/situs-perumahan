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

// Nama kunci yang diterima (dan sinonimnya).
const KUNCI = {
  nama: 'nama', lokasi: 'lokasi', kota: 'lokasi', area: 'lokasi',
  alamat: 'alamat', developer: 'developer', pengembang: 'developer',
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
  const mt = s.match(/^([\d.,]+)\s*(miliar|milyar|juta|jt|m)$/);
  if (mt) {
    if ((mt[1].match(/[.,]/g) || []).length > 1) return NaN;
    const n = parseFloat(mt[1].replace(',', '.'));
    return Math.round(n * (mt[2] === 'juta' || mt[2] === 'jt' ? 1e6 : 1e9));
  }
  if (/^[\d.,\s]+$/.test(s)) {
    const digits = s.replace(/[.,\s]/g, '');
    return digits ? Number(digits) : NaN;
  }
  return NaN;
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
  tersedia: 'Tersedia', ready: 'Tersedia', 'ready stock': 'Tersedia', available: 'Tersedia',
};

function parseTipe(teks, ctx, galat) {
  const bagian = teks.split('|').map((x) => x.trim()).filter(Boolean);
  const nama = bagian[0];
  if (!nama || bagian.length < 2) {
    galat.push(`${ctx}: baris tipe harus berbentuk "- Nama tipe | harga | LT 60 | LB 30 | KT 2 | KM 1 | Tersedia" (ditemukan: "${teks}")`);
    return null;
  }
  const harga = parseHarga(bagian[1]);
  if (!Number.isFinite(harga)) {
    galat.push(`${ctx} "${nama}": harga "${bagian[1]}" tidak terbaca. Tulis misalnya 850 juta, 1,05 miliar, atau 850000000`);
    return null;
  }
  if (harga < 1e7 || harga > 1e11) {
    galat.push(`${ctx} "${nama}": harga ${harga} tidak masuk akal. Tulis lengkap dengan satuan, misalnya 850 juta`);
    return null;
  }
  const t = { nama, harga, status: 'Tersedia' };
  let adaStatus = false;
  for (const b of bagian.slice(2)) {
    const lb = b.match(/^(lt|lb|kt|km)\s*[:=]?\s*(\d+)(?![\d])/i);
    if (lb) { t[lb[1].toLowerCase()] = Number(lb[2]); continue; }
    if (/^\d/.test(b)) {
      galat.push(`${ctx} "${nama}": "${b}" harus diberi label, contoh "LT 60" (luas tanah), "LB 30" (luas bangunan), "KT 2" (kamar tidur), "KM 1" (kamar mandi)`);
      return null;
    }
    if (adaStatus) {
      galat.push(`${ctx} "${nama}": status ditulis dua kali ("${b}")`);
      return null;
    }
    adaStatus = true;
    t.status = STATUS[b.toLowerCase()] || b;
  }
  const kurang = ['lt', 'lb', 'kt', 'km'].filter((k) => typeof t[k] !== 'number');
  if (kurang.length) {
    galat.push(`${ctx} "${nama}": belum ada ${kurang.map((k) => k.toUpperCase()).join(', ')} (contoh: LT 60 | LB 30 | KT 2 | KM 1)`);
    return null;
  }
  return { nama: t.nama, harga: t.harga, lt: t.lt, lb: t.lb, kt: t.kt, km: t.km, status: t.status };
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

  for (const k of ['nama', 'lokasiNama', 'alamat', 'developer', 'sertifikat', 'ringkas']) {
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
      const t = parseTipe(it.teks, `${ctx} info.txt baris ${it.no}`, galat);
      if (t) rumah.tipe.push(t);
    }
    const nama = new Set();
    for (const t of rumah.tipe) {
      if (nama.has(t.nama.toLowerCase())) galat.push(`${ctx} info.txt: tipe "${t.nama}" ditulis dua kali`);
      nama.add(t.nama.toLowerCase());
    }
  }
  if (!rumah.tipe.length && !(isi.tipe && isi.tipe.item.length)) {
    galat.push(`${ctx} info.txt: belum ada tipe rumah. Tambahkan "tipe:" diikuti baris "- Tipe 30/60 | 850 juta | LT 60 | LB 30 | KT 2 | KM 1 | Tersedia"`);
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
