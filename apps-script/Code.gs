/**
 * PENCATAT LEAD UNTUK SITUS PERUMAHAN
 * Tempel seluruh file ini di Google Sheets: Ekstensi > Apps Script. Panduan lengkap: PENCATAT-LEAD.txt
 *
 * Alurnya: pengunjung mengisi nama dan HP di situs -> situs mengirim data ke sini -> lead tercatat di
 * lembar "Leads" dengan kode LD-xxxxx -> baru kemudian WhatsApp terbuka ke sales, dengan kode yang sama
 * di pesannya. Sales tidak punya akses ke lembar ini, jadi lead tidak bisa dihapus atau diubah oleh sales.
 */

var NAMA_LEADS = 'Leads';
var NAMA_SALES = 'Sales';
var NAMA_SET = 'Pengaturan';
var NAMA_DASH = 'Dashboard';
var NAMA_CEK = 'CekAcak';
var ZONA = 'Asia/Jakarta';

// Urutan kolom di lembar Leads (nomor kolom di Sheets = indeks + 1).
var KOLOM = ['Kode', 'Masuk', 'Nama', 'HP', 'Proyek', 'Tipe', 'Sales', 'Penugasan', 'Sumber', 'Kampanye', 'Iklan',
  'Halaman', 'Status', 'Catatan', 'Update terakhir', 'Diingatkan', 'Respon pertama (menit)'];
var COL = { KODE: 0, MASUK: 1, NAMA: 2, HP: 3, PROYEK: 4, TIPE: 5, SALES: 6, TUGAS: 7, SUMBER: 8, KAMPANYE: 9, IKLAN: 10,
  HALAMAN: 11, STATUS: 12, CATATAN: 13, UPDATE: 14, INGAT: 15, RESPON: 16 };

var STATUS = ['Baru', 'Dihubungi', 'Survei dijadwalkan', 'Sudah survei', 'Booking', 'Akad', 'Tidak tertarik', 'Tidak bisa dihubungi'];
var SURVEI_PLUS = ['Survei dijadwalkan', 'Sudah survei', 'Booking', 'Akad'];
var BOOKING_PLUS = ['Booking', 'Akad'];
var HASIL_CEK = ['Sudah dihubungi sales', 'Belum dihubungi', 'Tidak diangkat', 'Lainnya'];

var KOLOM_SALES = ['Kunci', 'Nama', 'WhatsApp', 'Email', 'Aktif', 'Ikut bergilir', 'Proyek'];
var KOLOM_CEK = ['Tanggal cek', 'Kode', 'Nama', 'HP', 'Sales', 'Status saat dipilih', 'Hasil cek', 'Catatan'];

var SET_AWAL = [
  ['EMAIL_PEMILIK', '', 'Alamat email penerima ringkasan dan pengingat. Kosong = email pemilik Sheet ini.'],
  ['BATAS_JAM_RESPON', 2, 'Lead berstatus Baru lebih lama dari ini (jam) dianggap terlambat dan diingatkan.'],
  ['JAM_MULAI', 8, 'Pengingat hanya dikirim mulai jam ini (WIB).'],
  ['JAM_SELESAI', 20, 'Pengingat berhenti pada jam ini (WIB).'],
  ['JUMLAH_CEK_ACAK', 5, 'Berapa lead yang dipilih acak untuk ditelepon balik tiap kali.'],
  ['HARI_CEK_ACAK', 7, 'Cek acak hanya memilih lead dari sekian hari terakhir.'],
  ['BATAS_PER_MENIT', 30, 'Perlindungan dari kiriman massal: lead melebihi jumlah ini per menit ditolak.']
];

/* ================= Penerimaan lead dari situs ================= */

function doGet() {
  return json_({ ok: true, layanan: 'pencatat-lead' });
}

function doPost(e) {
  var hasil;
  try {
    hasil = terima_(e);
  } catch (err) {
    console.error(String((err && err.stack) || err));
    hasil = { ok: false, error: 'galat server' };
  }
  return json_(hasil);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function terima_(e) {
  var mentah = e && e.postData && e.postData.contents;
  if (!mentah || mentah.length > 5000) return { ok: false, error: 'data tidak valid' };
  var d;
  try { d = JSON.parse(mentah); } catch (x) { return { ok: false, error: 'data tidak valid' }; }
  var lead = rapikan_(d);
  if (lead.error) return { ok: false, error: lead.error };

  var set = pengaturan_();
  if (terlaluPadat_(set.BATAS_PER_MENIT)) return { ok: false, error: 'padat' };

  var kunci = LockService.getScriptLock();
  if (!kunci.tryLock(10000)) return { ok: false, error: 'sibuk' };
  try {
    return simpan_(lead);
  } finally {
    kunci.releaseLock();
  }
}

function slug_(s, n) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, n || 40);
}

function nomor_(mentah) {
  var d = String(mentah == null ? '' : mentah).replace(/\D/g, '');
  if (d.indexOf('0') === 0) d = '62' + d.slice(1);
  else if (d.indexOf('8') === 0) d = '62' + d;
  return /^628\d{7,12}$/.test(d) ? d : '';
}

// Teks untuk sel: buang karakter kontrol, potong, dan cegah dibaca sebagai rumus (=, +, -, @).
function aman_(v, n) {
  var s = String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, n || 100);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function rapikan_(d) {
  if (!d || typeof d !== 'object') return { error: 'data tidak valid' };
  var kode = String(d.kode == null ? '' : d.kode).toUpperCase();
  if (!/^LD-[A-Z0-9]{5,12}$/.test(kode)) return { error: 'kode tidak valid' };
  var nama = aman_(d.nama, 60);
  if (nama.replace(/^'/, '').length < 2) return { error: 'nama tidak valid' };
  var hp = nomor_(d.hp);
  if (!hp) return { error: 'nomor HP tidak valid' };
  return {
    kode: kode,
    nama: nama,
    hp: hp,
    proyek: slug_(d.proyek, 60),
    proyekNama: aman_(d.proyekNama, 80),
    tipe: aman_(d.tipe, 60),
    sales: slug_(d.sales, 40),
    salesLink: slug_(d.salesLink, 40),
    src: aman_(slug_(d.src, 40), 40),
    kampanye: aman_(slug_(d.kampanye, 40), 40),
    iklan: aman_(slug_(d.iklan, 40), 40),
    halaman: aman_(String(d.halaman == null ? '' : d.halaman).replace(/[^A-Za-z0-9\/_.~%-]/g, ''), 100),
    cadangan: d.cadangan === true,
    tujuan: slug_(d.tujuan, 40)
  };
}

function terlaluPadat_(batas) {
  var cache = CacheService.getScriptCache();
  var kunci = 'laju_' + Utilities.formatDate(new Date(), ZONA, 'yyyyMMddHHmm');
  var n = Number(cache.get(kunci) || 0);
  if (n >= batas) return true;
  cache.put(kunci, String(n + 1), 120);
  return false;
}

function simpan_(lead) {
  var sh = lembar_(NAMA_LEADS);
  var sales = daftarSales_();
  var baris = cariBaris_(sh, lead.kode);

  if (baris) {
    // Kode sudah ada: kiriman ganda. Kiriman cadangan dari situs berarti situs terpaksa memakai nomor
    // tujuan sendiri (server terlalu lambat), jadi lembar disesuaikan dengan kenyataan itu.
    if (lead.cadangan && lead.tujuan) {
      sh.getRange(baris, COL.SALES + 1, 1, 2).setValues([[lead.tujuan, 'cadangan (server lambat)']]);
    }
    var ada = sh.getRange(baris, COL.SALES + 1, 1, 1).getValues()[0][0];
    var s = cariSales_(sales, String(ada));
    return { ok: true, kode: lead.kode, duplikat: true, sales: String(ada), nama: s ? s.nama : '', wa: s && s.wa ? s.wa : '' };
  }

  var tugas = tentukanSales_(lead, sales);
  var sekarang = new Date();
  sh.appendRow([
    lead.kode, sekarang, lead.nama, lead.hp, lead.proyekNama || lead.proyek, lead.tipe,
    tugas.kunci, tugas.asal, lead.src, lead.kampanye, lead.iklan, lead.halaman,
    'Baru', '', '', '', ''
  ]);
  var balas = { ok: true, kode: lead.kode, sales: tugas.kunci, nama: tugas.nama };
  if (tugas.wa) balas.wa = tugas.wa;
  return balas;
}

function cariBaris_(sh, kode) {
  var akhir = sh.getLastRow();
  if (akhir < 2) return 0;
  var kolom = sh.getRange(2, 1, akhir - 1, 1).getValues();
  for (var i = 0; i < kolom.length; i++) {
    if (String(kolom[i][0]) === kode) return i + 2;
  }
  return 0;
}

function cariSales_(sales, kunci) {
  for (var i = 0; i < sales.length; i++) if (sales[i].kunci === kunci) return sales[i];
  return null;
}

// Sales hanya bisa ditugaskan kalau Aktif dan nomor WhatsApp-nya valid.
function layak_(s) { return !!(s && s.aktif && s.wa); }

function tentukanSales_(lead, sales) {
  var hasil = function (s, asal) { return { kunci: s.kunci, nama: s.nama, wa: s.wa, asal: asal }; };

  if (lead.cadangan) {
    var t = cariSales_(sales, lead.tujuan);
    return { kunci: lead.tujuan || lead.sales, nama: t ? t.nama : '', wa: '', asal: 'cadangan (server lambat)' };
  }

  // 1. Link iklan menyebut sales tertentu dan sales itu masih aktif: tetap ke dia.
  var langsung = lead.salesLink ? cariSales_(sales, lead.salesLink) : null;
  if (layak_(langsung)) return hasil(langsung, 'link sales');

  // 2. Bergilir. Sales yang memegang proyek ini didahulukan; kalau tidak ada, sales umum (kolom Proyek kosong).
  var peserta = sales.filter(function (s) { return layak_(s) && s.bergilir; });
  var pool;
  if (!lead.proyek) {
    pool = peserta;
  } else {
    var khusus = peserta.filter(function (s) { return s.proyek.length && s.proyek.indexOf(lead.proyek) >= 0; });
    var umum = peserta.filter(function (s) { return !s.proyek.length; });
    pool = khusus.length ? khusus : umum;
  }
  if (pool.length) {
    var props = PropertiesService.getScriptProperties();
    var terakhir = props.getProperty('RR_TERAKHIR') || '';
    var idxTerakhir = -1;
    sales.forEach(function (s, i) { if (s.kunci === terakhir) idxTerakhir = i; });
    var pilih = pool[0];
    for (var i = 0; i < pool.length; i++) {
      if (sales.indexOf(pool[i]) > idxTerakhir) { pilih = pool[i]; break; }
    }
    props.setProperty('RR_TERAKHIR', pilih.kunci);
    return hasil(pilih, langsung ? 'bergilir (sales link nonaktif)' : 'bergilir');
  }

  // 3. Tidak ada yang bisa ditugaskan: situs memakai nomor bawaannya.
  var bawaan = cariSales_(sales, lead.sales);
  return { kunci: lead.sales, nama: bawaan ? bawaan.nama : '', wa: layak_(bawaan) ? bawaan.wa : '', asal: 'cadangan (tidak ada sales bergilir)' };
}

function ya_(v) {
  if (v === true) return true;
  return /^(ya|y|true|1|aktif)$/i.test(String(v == null ? '' : v).trim());
}

function daftarSales_() {
  var sh = lembar_(NAMA_SALES);
  var akhir = sh.getLastRow();
  if (akhir < 2) return [];
  var nilai = sh.getRange(2, 1, akhir - 1, KOLOM_SALES.length).getValues();
  var hasil = [];
  nilai.forEach(function (r) {
    var kunci = slug_(r[0], 40);
    if (!kunci) return;
    hasil.push({
      kunci: kunci,
      nama: String(r[1] || '').trim(),
      wa: nomor_(r[2]),
      email: String(r[3] || '').trim(),
      aktif: ya_(r[4]),
      bergilir: ya_(r[5]),
      proyek: String(r[6] || '').split(/[,;]/).map(function (x) { return slug_(x, 60); }).filter(Boolean)
    });
  });
  return hasil;
}

/* ================= Pencatatan perubahan status (otomatis saat Sheet diedit) ================= */

function onEdit(e) {
  try {
    var r = e && e.range;
    if (!r) return;
    var sh = r.getSheet();
    if (sh.getName() !== NAMA_LEADS) return;
    var c1 = r.getColumn(), c2 = r.getLastColumn();
    var status = COL.STATUS + 1, catatan = COL.CATATAN + 1;
    if (!((status >= c1 && status <= c2) || (catatan >= c1 && catatan <= c2))) return;
    var r1 = Math.max(r.getRow(), 2), r2 = r.getLastRow();
    if (r2 < r1) return;
    var n = r2 - r1 + 1;
    var nilai = sh.getRange(r1, 1, n, KOLOM.length).getValues();
    var sekarang = new Date();
    nilai.forEach(function (baris) {
      if (!baris[COL.KODE]) return;
      baris[COL.UPDATE] = sekarang;
      if (baris[COL.STATUS] && baris[COL.STATUS] !== 'Baru' && baris[COL.RESPON] === '' && tanggal_(baris[COL.MASUK])) {
        baris[COL.RESPON] = Math.max(0, Math.round((sekarang.getTime() - baris[COL.MASUK].getTime()) / 60000));
      }
    });
    sh.getRange(r1, COL.UPDATE + 1, n, 1).setValues(nilai.map(function (b) { return [b[COL.UPDATE]]; }));
    sh.getRange(r1, COL.RESPON + 1, n, 1).setValues(nilai.map(function (b) { return [b[COL.RESPON]]; }));
  } catch (x) {
    // onEdit tidak boleh mengganggu pengeditan; abaikan galat.
  }
}

function tanggal_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/* ================= Pengaturan dan pembacaan lembar ================= */

function lembar_(nama) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nama);
  if (!sh) throw new Error('Lembar "' + nama + '" belum ada. Jalankan menu Lead Perumahan > Siapkan lembar.');
  return sh;
}

function pengaturan_() {
  var hasil = {};
  SET_AWAL.forEach(function (r) { hasil[r[0]] = r[1]; });
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAMA_SET);
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var k = String(r[0] || '').trim();
      if (!k || !(k in hasil)) return;
      var v = r[1];
      if (typeof hasil[k] === 'number') {
        var angka = Number(v);
        if (v !== '' && isFinite(angka)) hasil[k] = angka;
      } else if (v !== '' && v != null) {
        hasil[k] = String(v).trim();
      }
    });
  }
  if (!hasil.EMAIL_PEMILIK) {
    try { hasil.EMAIL_PEMILIK = Session.getEffectiveUser().getEmail(); } catch (x) { /* tanpa email */ }
  }
  return hasil;
}

function semuaLead_() {
  var sh = lembar_(NAMA_LEADS);
  var akhir = sh.getLastRow();
  if (akhir < 2) return [];
  return sh.getRange(2, 1, akhir - 1, KOLOM.length).getValues().filter(function (r) { return r[COL.KODE]; });
}

function tgl_(d, pola) { return Utilities.formatDate(d, ZONA, pola || 'dd/MM HH:mm'); }

function kirimEmail_(ke, judul, isi) {
  if (!ke) return false;
  MailApp.sendEmail({ to: ke, subject: judul, body: isi });
  return true;
}

function barisLead_(r) {
  return '- ' + r[COL.KODE] + ' | ' + r[COL.NAMA] + ' | https://wa.me/' + r[COL.HP] + ' | ' + r[COL.PROYEK] +
    (r[COL.TIPE] ? ' ' + r[COL.TIPE] : '') + ' | masuk ' + (tanggal_(r[COL.MASUK]) ? tgl_(r[COL.MASUK]) : '?');
}

/* ================= Pengingat, ringkasan, dan cek acak ================= */

// Dijalankan tiap jam. Mengingatkan sales (dan pemilik) soal lead berstatus Baru yang terlalu lama.
function ingatkanBelumDihubungi() {
  var set = pengaturan_();
  var sekarang = new Date();
  var jam = Number(tgl_(sekarang, 'H'));
  if (jam < set.JAM_MULAI || jam >= set.JAM_SELESAI) return { dilewati: 'di luar jam kerja' };

  var sh = lembar_(NAMA_LEADS);
  var akhir = sh.getLastRow();
  if (akhir < 2) return { diingatkan: 0 };
  var data = sh.getRange(2, 1, akhir - 1, KOLOM.length).getValues();
  var batas = set.BATAS_JAM_RESPON * 3600000;
  var telat = [];
  data.forEach(function (r, i) {
    if (r[COL.KODE] && r[COL.STATUS] === 'Baru' && !r[COL.INGAT] && tanggal_(r[COL.MASUK]) &&
        sekarang.getTime() - r[COL.MASUK].getTime() > batas) telat.push(i);
  });
  if (!telat.length) return { diingatkan: 0 };

  var sales = daftarSales_();
  var perSales = {};
  telat.forEach(function (i) {
    var k = String(data[i][COL.SALES] || '(belum ditugaskan)');
    (perSales[k] = perSales[k] || []).push(data[i]);
  });

  var sisa = MailApp.getRemainingDailyQuota();
  var terkirim = 0;
  var teksPemilik = ['Lead berstatus Baru lebih dari ' + set.BATAS_JAM_RESPON + ' jam:'];
  Object.keys(perSales).forEach(function (k) {
    var s = cariSales_(sales, k);
    var nama = s && s.nama ? s.nama : k;
    var daftar = perSales[k].map(barisLead_).join('\n');
    teksPemilik.push('', 'Sales ' + nama + ' (' + perSales[k].length + ' lead):', daftar);
    if (s && s.email && sisa > 1) {
      kirimEmail_(s.email, 'Ada ' + perSales[k].length + ' lead yang belum Anda hubungi',
        'Halo ' + nama + ',\n\nLead berikut sudah lebih dari ' + set.BATAS_JAM_RESPON + ' jam berstatus Baru. Mohon segera dihubungi:\n\n' +
        daftar + '\n\nSetelah dihubungi, status di Sheet akan diperbarui oleh pengelola.');
      sisa--;
      terkirim++;
    }
  });
  if (sisa > 0 && kirimEmail_(set.EMAIL_PEMILIK, 'Lead belum dihubungi: ' + telat.length, teksPemilik.join('\n'))) terkirim++;
  // Tanpa email yang terkirim (kuota habis atau alamat kosong), jangan ditandai supaya dicoba lagi jam berikutnya.
  if (!terkirim) return { diingatkan: 0, dilewati: 'tidak ada email terkirim (kuota habis atau alamat kosong)' };

  // Tandai supaya tidak diingatkan berulang.
  var tanda = data.map(function (r) { return [r[COL.INGAT]]; });
  telat.forEach(function (i) { tanda[i][0] = sekarang; });
  sh.getRange(2, COL.INGAT + 1, tanda.length, 1).setValues(tanda);
  return { diingatkan: telat.length };
}

// Dijalankan tiap pagi: ringkasan untuk pemilik.
function kirimRingkasanHarian() {
  var set = pengaturan_();
  var sekarang = new Date();
  var data = semuaLead_();
  var sales = daftarSales_();
  var kemarin = tgl_(new Date(sekarang.getTime() - 86400000), 'yyyy-MM-dd');
  var perSales = {}, baru = [], kemarinTotal = 0;
  data.forEach(function (r) {
    if (!tanggal_(r[COL.MASUK])) return;
    if (tgl_(r[COL.MASUK], 'yyyy-MM-dd') === kemarin) {
      kemarinTotal++;
      var k = String(r[COL.SALES] || '(belum ditugaskan)');
      perSales[k] = (perSales[k] || 0) + 1;
    }
    if (r[COL.STATUS] === 'Baru' && sekarang.getTime() - r[COL.MASUK].getTime() > 24 * 3600000) baru.push(r);
  });
  var baris = ['Ringkasan lead ' + tgl_(sekarang, 'dd/MM/yyyy'), '',
    'Lead masuk kemarin: ' + kemarinTotal];
  Object.keys(perSales).forEach(function (k) {
    var s = cariSales_(sales, k);
    baris.push('  - ' + (s && s.nama ? s.nama : k) + ': ' + perSales[k]);
  });
  baris.push('', 'Lead yang masih berstatus Baru lebih dari 24 jam: ' + baru.length);
  baru.slice(0, 15).forEach(function (r) { baris.push(barisLead_(r)); });
  if (baru.length > 15) baris.push('  ... dan ' + (baru.length - 15) + ' lainnya, lihat lembar Leads.');
  baris.push('', 'Buka Sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  kirimEmail_(set.EMAIL_PEMILIK, 'Ringkasan lead ' + tgl_(sekarang, 'dd/MM/yyyy'), baris.join('\n'));
  return { kemarin: kemarinTotal, baruLama: baru.length };
}

function acak_(daftar, n) {
  var a = daftar.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, n);
}

// Memilih beberapa lead berstatus sudah dihubungi secara acak untuk ditelepon balik oleh pemilik,
// guna memastikan sales benar-benar menghubungi dan melaporkan statusnya dengan jujur.
function cekAcak() {
  var set = pengaturan_();
  var sekarang = new Date();
  var data = semuaLead_();
  var shCek = lembar_(NAMA_CEK);
  var sudah = {};
  if (shCek.getLastRow() >= 2) {
    shCek.getRange(2, 2, shCek.getLastRow() - 1, 1).getValues().forEach(function (r) { sudah[String(r[0])] = true; });
  }
  var dari = sekarang.getTime() - set.HARI_CEK_ACAK * 86400000;
  var kandidat = data.filter(function (r) {
    return r[COL.STATUS] && r[COL.STATUS] !== 'Baru' && r[COL.STATUS] !== 'Tidak bisa dihubungi' &&
      tanggal_(r[COL.MASUK]) && r[COL.MASUK].getTime() >= dari && !sudah[String(r[COL.KODE])];
  });
  var pilih = acak_(kandidat, set.JUMLAH_CEK_ACAK);
  if (!pilih.length) return { dipilih: 0 };
  var baris = pilih.map(function (r) {
    return [sekarang, r[COL.KODE], r[COL.NAMA], r[COL.HP], r[COL.SALES], r[COL.STATUS], '', ''];
  });
  shCek.getRange(shCek.getLastRow() + 1, 1, baris.length, KOLOM_CEK.length).setValues(baris);
  var teks = ['Telepon atau WhatsApp orang-orang berikut. Tanyakan apakah sales sudah menghubungi mereka dan bagaimana kelanjutannya.', ''];
  pilih.forEach(function (r) { teks.push(barisLead_(r) + ' | sales ' + r[COL.SALES] + ' | status ' + r[COL.STATUS]); });
  teks.push('', 'Catat hasilnya di lembar CekAcak: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  kirimEmail_(set.EMAIL_PEMILIK, 'Cek acak lead: ' + pilih.length + ' orang untuk dihubungi balik', teks.join('\n'));
  return { dipilih: pilih.length };
}

/* ================= Dashboard ================= */

function persen_(a, b) { return b ? Math.round((a / b) * 100) + '%' : ''; }

// Fungsi murni: menerima baris lead, daftar sales, pengaturan, waktu; mengembalikan blok-blok tabel.
function hitungDashboard_(data, sales, set, sekarang) {
  var tujuhHari = sekarang.getTime() - 7 * 86400000;
  var batas = set.BATAS_JAM_RESPON * 3600000;
  var namaSales = {};
  sales.forEach(function (s) { namaSales[s.kunci] = s.nama || s.kunci; });

  var per = {}; // kunci sales -> agregat
  var urut = sales.map(function (s) { return s.kunci; });
  function ambil(k) {
    if (!per[k]) {
      per[k] = { total: 0, tujuh: 0, baru: 0, telat: 0, hubungi: 0, survei: 0, booking: 0, responJumlah: 0, responTotal: 0 };
      if (urut.indexOf(k) < 0) urut.push(k);
    }
    return per[k];
  }
  var sumber = {}, kampanye = {}, proyek = {};
  function tambah(peta, kunci, r) {
    var a = peta[kunci] || (peta[kunci] = { lead: 0, survei: 0, booking: 0 });
    a.lead++;
    if (SURVEI_PLUS.indexOf(r[COL.STATUS]) >= 0) a.survei++;
    if (BOOKING_PLUS.indexOf(r[COL.STATUS]) >= 0) a.booking++;
  }

  data.forEach(function (r) {
    var a = ambil(String(r[COL.SALES] || '(belum ditugaskan)'));
    var masuk = tanggal_(r[COL.MASUK]) ? r[COL.MASUK].getTime() : null;
    a.total++;
    if (masuk !== null && masuk >= tujuhHari) a.tujuh++;
    if (r[COL.STATUS] === 'Baru') {
      a.baru++;
      if (masuk !== null && sekarang.getTime() - masuk > batas) a.telat++;
    } else {
      a.hubungi++;
    }
    if (SURVEI_PLUS.indexOf(r[COL.STATUS]) >= 0) a.survei++;
    if (BOOKING_PLUS.indexOf(r[COL.STATUS]) >= 0) a.booking++;
    if (r[COL.RESPON] !== '' && isFinite(Number(r[COL.RESPON]))) { a.responJumlah++; a.responTotal += Number(r[COL.RESPON]); }
    tambah(sumber, String(r[COL.SUMBER] || '(langsung)'), r);
    tambah(kampanye, String(r[COL.KAMPANYE] || '(tanpa)') + '||' + String(r[COL.IKLAN] || '(tanpa)'), r);
    tambah(proyek, String(r[COL.PROYEK] || '(umum)'), r);
  });

  var blokSales = [['Sales', 'Lead total', 'Lead 7 hari', 'Belum dihubungi', 'Lewat batas respon', 'Sudah dihubungi',
    'Survei dan seterusnya', 'Booking dan seterusnya', 'Rata-rata respon (menit)', '% dihubungi']];
  var jumlah = { total: 0, tujuh: 0, baru: 0, telat: 0, hubungi: 0, survei: 0, booking: 0, responJumlah: 0, responTotal: 0 };
  urut.forEach(function (k) {
    var a = ambil(k);
    blokSales.push([namaSales[k] || k, a.total, a.tujuh, a.baru, a.telat, a.hubungi, a.survei, a.booking,
      a.responJumlah ? Math.round(a.responTotal / a.responJumlah) : '', persen_(a.hubungi, a.total)]);
    Object.keys(jumlah).forEach(function (f) { jumlah[f] += a[f]; });
  });
  blokSales.push(['Jumlah', jumlah.total, jumlah.tujuh, jumlah.baru, jumlah.telat, jumlah.hubungi, jumlah.survei, jumlah.booking,
    jumlah.responJumlah ? Math.round(jumlah.responTotal / jumlah.responJumlah) : '', persen_(jumlah.hubungi, jumlah.total)]);

  function tabel(judulKolom, peta, pisah) {
    var out = [judulKolom];
    Object.keys(peta).sort(function (x, y) { return peta[y].lead - peta[x].lead || (x < y ? -1 : 1); }).forEach(function (k) {
      var a = peta[k];
      out.push((pisah ? k.split('||') : [k]).concat([a.lead, a.survei, a.booking]));
    });
    return out;
  }
  return [
    { judul: 'Per sales', baris: blokSales },
    { judul: 'Per sumber iklan', baris: tabel(['Sumber', 'Lead', 'Survei dan seterusnya', 'Booking dan seterusnya'], sumber, false) },
    { judul: 'Per kampanye dan iklan', baris: tabel(['Kampanye', 'Iklan', 'Lead', 'Survei dan seterusnya', 'Booking dan seterusnya'], kampanye, true) },
    { judul: 'Per proyek', baris: tabel(['Proyek', 'Lead', 'Survei dan seterusnya', 'Booking dan seterusnya'], proyek, false) }
  ];
}

function perbaruiDashboard() {
  var set = pengaturan_();
  var sekarang = new Date();
  var blok = hitungDashboard_(semuaLead_(), daftarSales_(), set, sekarang);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAMA_DASH);
  if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(NAMA_DASH);
  var lebar = 1;
  blok.forEach(function (b) { b.baris.forEach(function (r) { lebar = Math.max(lebar, r.length); }); });
  var isi = [['Diperbarui ' + tgl_(sekarang, 'dd/MM/yyyy HH:mm') + ' WIB']];
  var tebal = [1];
  blok.forEach(function (b) {
    isi.push([]);
    isi.push([b.judul]); tebal.push(isi.length);
    b.baris.forEach(function (r, i) { isi.push(r); if (i === 0) tebal.push(isi.length); });
  });
  isi = isi.map(function (r) { var x = r.slice(); while (x.length < lebar) x.push(''); return x; });
  sheet.clear();
  sheet.getRange(1, 1, isi.length, lebar).setValues(isi);
  tebal.forEach(function (n) { sheet.getRange(n, 1, 1, lebar).setFontWeight('bold'); });
  sheet.setFrozenRows(1);
  pasangValidasi_(lembar_(NAMA_LEADS));
  return blok;
}

/* ================= Penyiapan (dijalankan sekali dari menu) ================= */

function ambilAtauBuat_(ss, nama) {
  return ss.getSheetByName(nama) || ss.insertSheet(nama);
}

function tulisJudul_(sh, judul) {
  sh.getRange(1, 1, 1, judul.length).setValues([judul]).setFontWeight('bold').setBackground('#1D4B3B').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
}

function daftarPilihan_(daftar) {
  return SpreadsheetApp.newDataValidation().requireValueInList(daftar, true).setAllowInvalid(false).build();
}

// Dropdown status untuk baris yang ada dan ribuan baris ke depan.
function pasangValidasi_(sh) {
  var sampai = Math.max(sh.getLastRow() + 2000, 5000);
  if (sh.getMaxRows() < sampai) sh.insertRowsAfter(sh.getMaxRows(), sampai - sh.getMaxRows());
  sh.getRange(2, COL.STATUS + 1, sampai - 1, 1).setDataValidation(daftarPilihan_(STATUS));
}

function siapkan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sebelumnya = !!ss.getSheetByName(NAMA_LEADS);

  var leads = ambilAtauBuat_(ss, NAMA_LEADS);
  tulisJudul_(leads, KOLOM);
  pasangValidasi_(leads); // sekaligus memastikan lembar punya cukup baris untuk pemformatan di bawah
  // Semua kolom teks disimpan sebagai teks supaya nomor HP dan isian aneh tidak diubah Sheets.
  [COL.KODE, COL.NAMA, COL.HP, COL.PROYEK, COL.TIPE, COL.SALES, COL.TUGAS, COL.SUMBER, COL.KAMPANYE, COL.IKLAN, COL.HALAMAN, COL.CATATAN]
    .forEach(function (c) { leads.getRange(2, c + 1, 4999, 1).setNumberFormat('@'); });
  [COL.MASUK, COL.UPDATE, COL.INGAT].forEach(function (c) { leads.getRange(2, c + 1, 4999, 1).setNumberFormat('dd/mm/yyyy hh:mm'); });
  leads.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Baru').setBackground('#FBE3B5').setRanges([leads.getRange(2, COL.STATUS + 1, 4999, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Booking').setBackground('#CFE9D6').setRanges([leads.getRange(2, COL.STATUS + 1, 4999, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Akad').setBackground('#A8D8B5').setRanges([leads.getRange(2, COL.STATUS + 1, 4999, 1)]).build()
  ]);

  var sales = ambilAtauBuat_(ss, NAMA_SALES);
  tulisJudul_(sales, KOLOM_SALES);
  if (sales.getLastRow() < 2) {
    // Nomor sengaja belum diisi: sales tanpa nomor valid tidak akan pernah ditugaskan.
    sales.getRange(2, 1, 3, KOLOM_SALES.length).setValues([
      ['kantor', 'Tim Marketing', 'ISI-NOMOR', '', 'Ya', 'Tidak', ''],
      ['andi', 'Andi', 'ISI-NOMOR', '', 'Ya', 'Ya', ''],
      ['sari', 'Sari', 'ISI-NOMOR', '', 'Ya', 'Ya', '']
    ]);
  }
  sales.getRange(2, 3, 200, 1).setNumberFormat('@');
  sales.getRange(2, 5, 200, 2).setDataValidation(daftarPilihan_(['Ya', 'Tidak']));

  var peng = ambilAtauBuat_(ss, NAMA_SET);
  tulisJudul_(peng, ['Pengaturan', 'Nilai', 'Keterangan']);
  if (peng.getLastRow() < 2) peng.getRange(2, 1, SET_AWAL.length, 3).setValues(SET_AWAL);

  var cek = ambilAtauBuat_(ss, NAMA_CEK);
  tulisJudul_(cek, KOLOM_CEK);
  cek.getRange(2, 7, 500, 1).setDataValidation(daftarPilihan_(HASIL_CEK));

  ambilAtauBuat_(ss, NAMA_DASH);
  var info = sebelumnya ? 'Lembar diperiksa ulang. Data lead yang sudah ada tidak diubah.' : 'Lembar siap.';
  var zona = '';
  try { if (Session.getScriptTimeZone() !== ZONA) zona = ' Zona waktu skrip masih ' + Session.getScriptTimeZone() + ': ubah ke Asia/Jakarta di Setelan Proyek.'; } catch (x) { /* abaikan */ }
  ss.toast(info + ' Isi lembar Sales (nomor WhatsApp wajib), lalu pasang jadwal otomatis.' + zona, 'Lead Perumahan', 20);
}

function pasangJadwal() {
  var nama = ['ingatkanBelumDihubungi', 'perbaruiDashboard', 'kirimRingkasanHarian', 'cekAcak'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (nama.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ingatkanBelumDihubungi').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('perbaruiDashboard').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('kirimRingkasanHarian').timeBased().atHour(8).everyDays(1).create();
  ScriptApp.newTrigger('cekAcak').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Jadwal terpasang: pengingat dan dashboard tiap jam, ringkasan tiap pagi, cek acak tiap Senin.', 'Lead Perumahan', 15);
}

function ujiLead() {
  var hasil = terima_({ postData: { contents: JSON.stringify({
    kode: 'LD-TES' + Utilities.formatDate(new Date(), ZONA, 'HHmmss'), nama: 'TES hapus baris ini', hp: '6281200000000',
    proyek: '', proyekNama: '', tipe: '', sales: 'kantor', salesLink: '', src: 'tes', kampanye: '', iklan: '', halaman: '/'
  }) } });
  SpreadsheetApp.getActiveSpreadsheet().toast(hasil.ok ? 'Lead tes tercatat. Hapus barisnya di lembar Leads.' : 'Gagal: ' + hasil.error, 'Lead Perumahan', 15);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Lead Perumahan')
    .addItem('Siapkan lembar (pertama kali)', 'siapkan')
    .addItem('Pasang jadwal otomatis', 'pasangJadwal')
    .addSeparator()
    .addItem('Perbarui dashboard sekarang', 'perbaruiDashboard')
    .addItem('Kirim ringkasan sekarang', 'kirimRingkasanHarian')
    .addItem('Cek acak sekarang', 'cekAcak')
    .addItem('Tes catat satu lead', 'ujiLead')
    .addToUi();
}
