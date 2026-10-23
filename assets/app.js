(function () {
  'use strict';

  var S = window.SITE || {};
  var C = S.config || {};
  var PAGE = S.page || null;
  var LIST = S.perumahan || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); };
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var scrollBehavior = reduce ? 'auto' : 'smooth';

  /* ---------- Utilitas ---------- */
  function clean(s, n) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, n || 24);
  }
  function normalizePhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.indexOf('0') === 0) d = '62' + d.slice(1);
    else if (d.indexOf('8') === 0) d = '62' + d;
    return /^628\d{7,12}$/.test(d) ? d : null;
  }
  function makeCode() {
    return 'LD-' + Date.now().toString(36).toUpperCase().slice(-5) +
      Math.random().toString(36).toUpperCase().slice(2, 5);
  }

  /* ---------- Sumber iklan dan sales (terbawa antar halaman) ---------- */
  var KEYS = ['sales', 'src', 'utm_campaign', 'camp', 'utm_content', 'ad'];
  function readAttr() {
    var p = new URLSearchParams(location.search), a = {}, any = false;
    KEYS.forEach(function (k) {
      var v = clean(p.get(k), 40);
      if (v) { a[k] = v; any = true; }
    });
    try {
      if (any) { sessionStorage.setItem('attr', JSON.stringify(a)); return a; }
      var s = sessionStorage.getItem('attr');
      if (s) {
        var o = JSON.parse(s), r = {};
        KEYS.forEach(function (k) { if (o && o[k]) r[k] = clean(o[k], 40); });
        return r;
      }
    } catch (e) { /* penyimpanan tidak tersedia: lanjut tanpa itu */ }
    return a;
  }
  var attr = readAttr();
  var salesMap = C.sales || {};
  var salesReq = clean(attr.sales);
  var salesExplicit = has(salesMap, salesReq);
  var salesKey = salesExplicit ? salesReq : C.defaultSales;
  var salesEntry = salesMap[salesKey] || { name: 'Tim Marketing', wa: '' };
  var sales = { key: salesKey, name: salesEntry.name, wa: normalizePhone(salesEntry.wa) };
  var src = clean(attr.src) || 'langsung';
  var camp = clean(attr.utm_campaign || attr.camp, 40);
  var creative = clean(attr.utm_content || attr.ad, 40);

  // Tautan internal membawa parameter iklan; saat dibuka dari file, tambahkan index.html
  (function decorate() {
    var q = KEYS.filter(function (k) { return attr[k]; })
      .map(function (k) { return k + '=' + encodeURIComponent(attr[k]); }).join('&');
    var isFile = location.protocol === 'file:';
    $$('a[data-int]').forEach(function (a) {
      var href = a.getAttribute('href') || '', hash = '';
      var hi = href.indexOf('#');
      if (hi > -1) { hash = href.slice(hi); href = href.slice(0, hi); }
      if (!href) return; // tautan ke bagian di halaman yang sama
      var qi = href.indexOf('?'), path = qi > -1 ? href.slice(0, qi) : href, qs = qi > -1 ? href.slice(qi) : '';
      if (isFile && /\/$/.test(path)) path += 'index.html';
      if (q) qs += (qs ? '&' : '?') + q;
      a.setAttribute('href', path + qs + hash);
    });
  })();

  /* ---------- Meta Pixel (opsional) ---------- */
  if (C.metaPixelId) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', C.metaPixelId);
    fbq('track', 'PageView');
    if (PAGE) {
      var cur = LIST.filter(function (p) { return p.slug === PAGE.slug; })[0];
      fbq('track', 'ViewContent', { content_name: cur ? cur.nama : PAGE.slug, content_category: PAGE.lokasi });
    }
  }

  /* ---------- Katalog: pilihan dijual/disewa, jenis, dan lokasi (boleh digabung) ---------- */
  var tabsLokasi = $$('.tab[data-lokasi]'), tabsJenis = $$('.tab[data-jenis]'), tabsTransaksi = $$('.tab[data-transaksi]');
  var cards = $$('.kartu[data-lokasi]'), tiles = $$('.tile[data-lokasi]');
  var hitung = $('#hitung'), kosong = $('#kosong'), katalog = $('#katalog');
  var pilihLokasi = 'semua', pilihJenis = 'semua', pilihTransaksi = 'semua';

  function terapkan(push) {
    tabsLokasi.forEach(function (t) { t.setAttribute('aria-pressed', String(t.getAttribute('data-lokasi') === pilihLokasi)); });
    tabsJenis.forEach(function (t) { t.setAttribute('aria-pressed', String(t.getAttribute('data-jenis') === pilihJenis)); });
    tabsTransaksi.forEach(function (t) { t.setAttribute('aria-pressed', String(t.getAttribute('data-transaksi') === pilihTransaksi)); });
    tiles.forEach(function (t) {
      if (t.getAttribute('data-lokasi') === pilihLokasi) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
    });
    var n = 0;
    cards.forEach(function (c) {
      var show = (pilihLokasi === 'semua' || c.getAttribute('data-lokasi') === pilihLokasi) &&
        (pilihJenis === 'semua' || c.getAttribute('data-jenis') === pilihJenis) &&
        (pilihTransaksi === 'semua' || c.getAttribute('data-transaksi') === pilihTransaksi);
      c.hidden = !show;
      if (show) n++;
    });
    if (hitung) {
      var aktif = tabsJenis.filter(function (t) { return t.getAttribute('data-jenis') === pilihJenis; })[0];
      var sebut = (aktif && aktif.getAttribute('data-nama')) || hitung.getAttribute('data-sebut') || 'perumahan';
      var tr = tabsTransaksi.filter(function (t) { return t.getAttribute('data-transaksi') === pilihTransaksi; })[0];
      hitung.textContent = n + ' ' + sebut + ((tr && tr.getAttribute('data-akhiran')) || '');
    }
    if (kosong) kosong.hidden = n !== 0;
    if (push) {
      var h = pilihLokasi !== 'semua' ? pilihLokasi : (pilihJenis !== 'semua' ? pilihJenis : (pilihTransaksi !== 'semua' ? pilihTransaksi : ''));
      try { history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : '')); } catch (e) {}
    }
  }
  if (katalog && (tabsLokasi.length || tabsJenis.length || tabsTransaksi.length)) {
    tabsLokasi.forEach(function (t) {
      t.addEventListener('click', function () { pilihLokasi = t.getAttribute('data-lokasi'); terapkan(true); });
    });
    tabsJenis.forEach(function (t) {
      t.addEventListener('click', function () { pilihJenis = t.getAttribute('data-jenis'); terapkan(true); });
    });
    tabsTransaksi.forEach(function (t) {
      t.addEventListener('click', function () { pilihTransaksi = t.getAttribute('data-transaksi'); terapkan(true); });
    });
    tiles.forEach(function (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        pilihLokasi = t.getAttribute('data-lokasi');
        terapkan(true);
        katalog.scrollIntoView({ behavior: scrollBehavior });
      });
    });
    // Tautan seperti /#apartemen, /#depok, atau /#sewa langsung membuka daftar yang sudah disaring.
    var h = decodeURIComponent((location.hash || '').slice(1)).toLowerCase();
    var alias = { dijual: 'jual', disewa: 'sewa', disewakan: 'sewa' };
    var tr0 = has(alias, h) ? alias[h] : h;
    var cocokLokasi = tabsLokasi.some(function (t) { return t.getAttribute('data-lokasi') === h; });
    var cocokJenis = tabsJenis.some(function (t) { return t.getAttribute('data-jenis') === h; });
    var cocokTr = tabsTransaksi.some(function (t) { return t.getAttribute('data-transaksi') === tr0; });
    if (h && h !== 'semua' && (cocokLokasi || cocokJenis || cocokTr)) {
      if (cocokLokasi) pilihLokasi = h; else if (cocokJenis) pilihJenis = h; else pilihTransaksi = tr0;
      terapkan(false);
      katalog.scrollIntoView({ behavior: 'auto' });
    }
  }

  /* ---------- Video YouTube: dimuat saat diklik ---------- */
  $$('.video[data-yt]').forEach(function (box) {
    var id = String(box.getAttribute('data-yt') || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!id) return;
    box.style.backgroundImage = 'url(https://i.ytimg.com/vi/' + id + '/hqdefault.jpg)';
    var cap = $('.video-ket', box); if (cap) cap.hidden = true;
    var play = $('.video-putar', box);
    if (!play) return;
    play.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      f.title = box.getAttribute('data-judul') || 'Video perumahan';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      box.textContent = '';
      box.appendChild(f);
    });
  });

  /* ---------- Bar bawah di HP ---------- */
  var bar = $('#lengket'), cta = $('#cta');
  if (bar && cta && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      bar.classList.toggle('sembunyi', es[0].isIntersecting);
    }, { threshold: 0.15 }).observe(cta);
  }

  /* ---------- Tahun di footer ---------- */
  $$('[data-tahun]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Dialog kebijakan privasi ---------- */
  var priv = $('#privasi');
  $$('[data-buka-privasi]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (priv.showModal) priv.showModal(); else priv.setAttribute('open', '');
    });
  });

  /* ---------- Dialog form lead ---------- */
  var dlg = $('#lead'), form = $('#form-lead'), btn = $('#kirim');
  if (!dlg || !form) return;
  var sel = form.elements.minat;

  (function buildOptions() {
    var o = document.createElement('option');
    o.value = ''; o.textContent = 'Belum tahu, mau konsultasi';
    sel.appendChild(o);
    LIST.forEach(function (p) {
      var g = document.createElement('optgroup'); g.label = p.nama + (S.campur && p.transaksi === 'sewa' ? ' (disewa)' : '');
      var a = document.createElement('option'); a.value = p.slug + '|'; a.textContent = 'Semua tipe'; g.appendChild(a);
      p.tipe.forEach(function (t) {
        var x = document.createElement('option'); x.value = p.slug + '|' + t; x.textContent = t; g.appendChild(x);
      });
      sel.appendChild(g);
    });
  })();

  var siapa = $('#siapa');
  siapa.textContent = '';
  if (salesExplicit) {
    siapa.appendChild(document.createTextNode('Anda akan dihubungi oleh '));
    var sn = document.createElement('strong'); sn.textContent = sales.name; siapa.appendChild(sn);
    siapa.appendChild(document.createTextNode(' lewat WhatsApp.'));
  } else {
    siapa.textContent = 'Anda akan dihubungi tim marketing lewat WhatsApp.';
  }

  // Apps Script yang lama tidak dipakai perlu beberapa detik untuk "bangun". Supaya kiriman lead tidak
  // melewati batas waktu, skrip dibangunkan lebih dulu: saat pengunjung mulai berinteraksi dan saat
  // formulir dibuka. Paling sering satu kali per 4 menit, dan hasilnya tidak dipakai.
  var terakhirPanas = 0;
  function panaskan() {
    if (!C.appsScriptUrl) return;
    var skr = Date.now();
    if (skr - terakhirPanas < 240000) return;
    terakhirPanas = skr;
    try { fetch(C.appsScriptUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store', credentials: 'omit' }).catch(function () {}); } catch (e3) { /* diabaikan */ }
  }
  ['pointerdown', 'scroll', 'keydown'].forEach(function (nm) {
    window.addEventListener(nm, panaskan, { once: true, capture: true, passive: true });
  });

  function openLead(p, t) {
    panaskan();
    var want = p ? p + '|' + (t || '') : (PAGE ? PAGE.slug + '|' : '');
    sel.value = want;
    if (sel.value !== want) sel.value = p ? p + '|' : '';
    setError('nama', ''); setError('hp', '');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { form.elements.nama.focus(); }, 60);
  }
  function closeLead() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  $$('[data-buka-lead]').forEach(function (b) {
    b.addEventListener('click', function () { openLead(b.getAttribute('data-p'), b.getAttribute('data-t')); });
  });
  $$('[data-tutup]').forEach(function (b) { b.addEventListener('click', closeLead); });
  dlg.addEventListener('click', function (e) {
    if (e.target !== dlg) return;
    var r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeLead();
  });

  function setError(name, msg) {
    var span = $('[data-galat="' + name + '"]'); if (span) span.textContent = msg;
    var i = form.elements[name]; if (!i) return;
    if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
  }
  form.elements.nama.addEventListener('input', function () { setError('nama', ''); });
  form.elements.hp.addEventListener('input', function () { setError('hp', ''); });

  // Kirim lead ke Apps Script. Server boleh membalas {ok:true, wa:"62...", sales:"kunci"}
  // untuk menugaskan sales (mis. bergiliran). Kode lead dipakai server untuk mencegah data ganda.
  // Kalau server terlalu lambat atau gagal, WhatsApp tetap dibuka ke nomor bawaan (lead.sales), dan satu
  // kiriman cadangan memberi tahu server nomor mana yang dipakai supaya Sheet sesuai kenyataan.
  function kirimCadangan(lead) {
    try {
      if (navigator.sendBeacon) {
        var isi = Object.assign({}, lead, { cadangan: true, tujuan: lead.sales });
        navigator.sendBeacon(C.appsScriptUrl, new Blob([JSON.stringify(isi)], { type: 'text/plain;charset=utf-8' }));
      }
    } catch (e2) { /* diabaikan */ }
  }
  async function sendLead(lead) {
    if (!C.appsScriptUrl) return null;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 3500);
    try {
      var res = await fetch(C.appsScriptUrl, {
        method: 'POST',
        body: JSON.stringify(lead),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        signal: ctrl.signal
      });
      var balasan = await res.json();
      if (!balasan || balasan.ok !== true) { kirimCadangan(lead); return null; }
      return balasan;
    } catch (err) {
      kirimCadangan(lead);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function waUrl(wa, lead, namaProyek, tipe, sewa) {
    var minat = namaProyek ? namaProyek + (tipe ? ' ' + tipe : '') : (S.sebut || 'rumah') + ' di ' + (C.brand || 'website Anda');
    var text = 'Halo, saya ' + lead.nama + '. Saya tertarik ' + (sewa ? 'menyewa ' : 'dengan ') + minat +
      '. Mohon info ' + (sewa ? 'harga sewa' : 'harga') + ' dan jadwal survei. (Kode: ' + lead.kode + ')';
    return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(text);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var nama = form.elements.nama.value.trim();
    var hp = normalizePhone(form.elements.hp.value);
    var ok = true;
    setError('nama', ''); setError('hp', '');
    if (nama.length < 2) { setError('nama', 'Tulis nama Anda.'); ok = false; }
    if (!hp) { setError('hp', 'Nomor HP belum benar. Contoh: 0812 3456 7890'); ok = false; }
    if (!ok) { (nama.length < 2 ? form.elements.nama : form.elements.hp).focus(); return; }
    if (!sales.wa) { setError('hp', 'Nomor WhatsApp marketing belum diatur. Hubungi pengelola situs.'); return; }

    var parts = String(sel.value || '').split('|');
    var proyek = LIST.filter(function (p) { return p.slug === parts[0]; })[0] || null;
    var tipe = proyek ? (parts[1] || '') : '';
    // Properti sewa: kata "Sewa" ikut tercatat di kolom Tipe pada Sheet, supaya sales langsung tahu ini permintaan sewa.
    var sewa = proyek ? proyek.transaksi === 'sewa' : !!S.semuaSewa;
    var tipeCatat = sewa ? 'Sewa' + (tipe ? ': ' + tipe : '') : tipe;

    btn.disabled = true;
    btn.textContent = 'Membuka WhatsApp...';

    var lead = {
      kode: makeCode(),
      waktu: new Date().toISOString(),
      nama: nama,
      hp: hp,
      proyek: proyek ? proyek.slug : '',
      proyekNama: proyek ? proyek.nama : '',
      tipe: tipeCatat,
      sales: sales.key,
      salesLink: salesReq,
      src: src,
      kampanye: camp,
      iklan: creative,
      halaman: location.pathname
    };

    var target = sales.wa;
    var server = await sendLead(lead);
    if (server && server.wa) {
      var w = normalizePhone(server.wa);
      if (w) target = w;
    }

    if (window.fbq) fbq('track', 'Lead', { content_name: proyek ? proyek.nama : (C.brand || '') });
    setTimeout(function () { location.assign(waUrl(target, lead, proyek ? proyek.nama : '', tipe, sewa)); }, window.fbq ? 250 : 0);
  });

  // Kembali dari WhatsApp: aktifkan lagi tombol kirim
  window.addEventListener('pageshow', function () {
    btn.disabled = false;
    btn.textContent = 'Lanjut ke WhatsApp';
  });
})();
