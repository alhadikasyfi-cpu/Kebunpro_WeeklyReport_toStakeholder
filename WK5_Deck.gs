/**
 * File WK5: Deck.gs
 * Menu Weekly Report, rencana isi slide, dan pembuatan deck.
 *
 * Deck weekly adalah SATU file tetap: generate pertama membuat presentasi baru (ID disimpan di Document Properties
 * spreadsheet), generate berikutnya mengganti seluruh isi file yang sama sehingga link yang dibagikan ke
 * stakeholder tidak pernah berubah. Gaya slide disalin dari template monthly (slide konten; cover & penutup opsional).
 *
 * Isi deck: 2 slide untuk stakeholder yang sangat sibuk. Setiap slide: tanggal pekan laporan vs pembanding,
 * INSIGHT, dan speaker notes. Rincian temuan & tindak lanjut SEMUA bisnis ada di speaker notes slide 2.
 *   1 Pemakaian produk : WAU 3 aplikasi (grafik kecil 8 pekan, skala masing-masing) + total WAU, kebun aktif,
 *                        penetrasi akun (semua dengan % vs pekan lalu)
 *   2 Kesehatan pelanggan & tindakan : kebun berisiko, TBS tercatat, nilai penjualan; kebun baru mulai & kebun tanpa
 *                        aktivitas pekan ini; tabel bisnis prioritas (temuan + tindak lanjut + PIC)
 */

const WK_PROP_DECK = 'WK_DECK_ID';

/* ------------------------------------------------------------------------- */
/* Menu                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Menambah menu "📅 Weekly Report". Bila file ini satu proyek dengan Monthly Report (sudah punya onOpen),
 * tambahkan satu baris di akhir onOpen() monthly:  if (typeof wkAddMenu === 'function') wkAddMenu();
 */
function wkAddMenu() {
  try {
    SpreadsheetApp.getUi().createMenu('📅 Weekly Report')
      .addItem('1. Buat / perbaiki header tabel', 'wkBuatHeaderTabel')
      .addItem('2. Cek data weekly', 'wkCekData')
      .addItem('3. Salin paket data untuk Claude', 'wkSalinPaketClaude')
      .addItem('4. Generate Weekly Deck', 'wkGenerateWeeklyDeck')
      .addSeparator()
      .addItem('Buka deck weekly', 'wkBukaDeck')
      .addItem('Pakai file deck baru (link berubah)', 'wkResetDeck')
      .addToUi();
  } catch (e) { /* konteks non-UI */ }
}

function wkUi() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function wkAlert(msg) { const ui = wkUi(); if (ui) ui.alert(msg); else Logger.log(msg); }

function wkLoad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = wkGetSheet(ss);
  if (!sheet) return { error: `Sheet '${WK_CONFIG.SHEET_NAME}' belum ada. Jalankan menu "1. Buat / perbaiki header tabel".` };
  const t = wkReadSheet(sheet);
  if (t.errors.length) return { error: t.errors.join('\n') };
  if (!t.rows.length) return { error: `Sheet '${sheet.getName()}' belum berisi data. Tempel data mulai sel A2.` };
  const an = wkAnalyze(t.rows, new Date(), t.anchor, t.wau);
  an.alias = wkAliasMap(an);
  an.warnings = t.warnings.slice(0, 5).concat(t.warnings.length > 5 ? [`…dan ${t.warnings.length - 5} peringatan baris lainnya.`] : []).concat(an.warnings);
  if (t.missing.length) an.warnings.push(`Kolom tidak ada (bagian terkait dilewati): ${t.missing.join(', ')}.`);
  return { ss, sheet, table: t, an };
}

/** Ringkasan isi tabel tanpa membuat deck. */
function wkCekData() {
  const d = wkLoad();
  if (d.error) return wkAlert(d.error);
  const an = d.an;
  const lines = [
    `Baris terbaca: ${d.table.rows.length}`,
    `Awal pekan: ${WK_HARI[an.anchor]}`,
    `Pekan laporan: ${an.labelLaporan}`,
    `Pembanding: ${an.labelPembanding}`,
    `Pekan tren: ${an.portfolio.filter(p => p.has).length} dari ${an.weeks.length} pekan berisi data`,
    `Kebun: ${an.total} · aktif input pekan ini ${an.cur.aktif === null ? '-' : an.cur.aktif}`,
    `Status: ${an.risiko} berisiko · ${an.perhatian} perlu perhatian · ${an.total - an.risiko - an.perhatian} sehat`
  ];
  if (an.warnings.length) lines.push('', 'Peringatan:', ...an.warnings.map(w => '• ' + w));
  wkAlert(lines.join('\n'));
}

/* ------------------------------------------------------------------------- */
/* File deck tetap                                                           */
/* ------------------------------------------------------------------------- */

function wkDeckFile() {
  const id = WK_CONFIG.DECK_ID || PropertiesService.getDocumentProperties().getProperty(WK_PROP_DECK);
  if (!id) return null;
  try {
    const f = DriveApp.getFileById(id);
    return f.isTrashed() ? null : f;
  } catch (e) { return null; }
}

function wkCreateDeckFile(ss, warnings) {
  const pres = SlidesApp.create(WK_CONFIG.DECK_NAME);
  const file = DriveApp.getFileById(pres.getId());
  try {
    let folder = null;
    if (WK_CONFIG.OUTPUT_FOLDER_ID) folder = DriveApp.getFolderById(WK_CONFIG.OUTPUT_FOLDER_ID);
    else { const p = DriveApp.getFileById(WK_CONFIG.TEMPLATE_ID).getParents(); folder = p.hasNext() ? p.next() : null; }
    if (folder) file.moveTo(folder);
  } catch (e) { warnings.push(`Deck disimpan di My Drive karena folder tujuan tidak bisa diakses: ${e.message}`); }
  if (WK_CONFIG.SHARE_WITH_SHEET_USERS) {
    try {
      const me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
      const emails = list => list.map(u => u.getEmail()).filter(e => e && e.toLowerCase() !== me);
      const ed = emails(ss.getEditors()), vw = emails(ss.getViewers()).filter(e => ed.indexOf(e) < 0);
      if (ed.length) file.addEditors(ed);
      if (vw.length) file.addViewers(vw);
    } catch (e) { warnings.push(`Deck belum otomatis dibagikan: ${e.message}`); }
  }
  if (!WK_CONFIG.DECK_ID) PropertiesService.getDocumentProperties().setProperty(WK_PROP_DECK, file.getId());
  return file;
}

function wkBukaDeck() {
  const f = wkDeckFile();
  if (!f) return wkAlert('Deck weekly belum dibuat. Jalankan "3. Generate Weekly Deck".');
  wkShowLink(f.getUrl(), 'Deck weekly', []);
}

/** Melepas file deck lama (file tidak dihapus); generate berikutnya membuat file baru dengan link baru. */
function wkResetDeck() {
  const ui = wkUi();
  if (WK_CONFIG.DECK_ID) return wkAlert('DECK_ID diisi di WK_CONFIG; kosongkan dulu bila ingin memakai file baru.');
  if (ui && ui.alert('Pakai file deck baru?', 'File deck lama tidak dihapus, tetapi generate berikutnya membuat file baru dengan link baru.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getDocumentProperties().deleteProperty(WK_PROP_DECK);
  wkAlert('Selesai. Generate berikutnya membuat file deck weekly baru.');
}

/* ------------------------------------------------------------------------- */
/* Generate                                                                  */
/* ------------------------------------------------------------------------- */

const WK_PROP_FRAME = 'WK_FRAME_SLIDE_ID';

/**
 * Slide bingkai di deck weekly: slide yang ID-nya tersimpan, atau slide 1 yang belum berisi laporan (tanpa teks
 * "PEKAN INI" / "Pekan laporan"). null bila tidak ada (deck baru): slide memakai bingkai sederhana.
 */
function wkFindFrame(pres) {
  const slides = pres.getSlides();
  const saved = PropertiesService.getDocumentProperties().getProperty(WK_PROP_FRAME);
  const bySaved = saved && slides.find(s => s.getObjectId() === saved);
  if (bySaved) return bySaved;
  const first = slides[0];
  if (!first) return null;
  const txt = first.getShapes().map(sh => { try { return sh.getText().asString(); } catch (e) { return ''; } }).join(' ');
  return /PEKAN INI|Pekan laporan/i.test(txt) || first.getTables().length ? null : first;
}

function wkFindSlide(pres, text) {
  return pres.getSlides().find(s => s.getShapes().some(sh => {
    try { return sh.getText().asString().indexOf(text) >= 0; } catch (e) { return false; }
  })) || null;
}

/** Menghapus kartu INSIGHT dari salinan slide konten (untuk slide tabel/KPI lebar penuh). */
function wkRemoveInsightCard(slide) {
  const I = WK_CONFIG.LAYOUT.TEMPLATE_INSIGHT;
  slide.getShapes().forEach(sh => {
    try {
      const txt = sh.getText().asString().trim();
      const isCard = sh.getShapeType() === SlidesApp.ShapeType.ROUND_RECTANGLE &&
        Math.abs(sh.getLeft() - I.left) < 2 && Math.abs(sh.getTop() - I.top) < 2 && txt === '';
      if (isCard || txt === 'INSIGHT' || txt.indexOf('{{ai_insight}}') >= 0) sh.remove();
    } catch (e) { /* abaikan */ }
  });
}

function wkGenerateWeeklyDeck() {
  if (typeof Slides === 'undefined') return wkAlert('Aktifkan layanan "Google Slides API": editor Apps Script > Services (+) > Google Slides API > Add.');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return wkAlert('Deck weekly sedang dibuat oleh pengguna lain. Coba lagi beberapa menit lagi.');
  try {
    const d = wkLoad();
    if (d.error) return wkAlert(d.error);
    const an = d.an, warnings = an.warnings;

    let file = wkDeckFile();
    const isNew = !file;
    if (isNew) file = wkCreateDeckFile(d.ss, warnings);
    const presId = file.getId();
    const pres = SlidesApp.openById(presId);
    // Slide bingkai (slide 1 yang dibuat tim: logo, badge, kotak periode, pita bawah) disalin untuk setiap slide isi,
    // lalu dipindah ke akhir dan disembunyikan (skip) agar tidak tampil saat presentasi dan tidak terhapus.
    const frame = wkFindFrame(pres);
    if (!frame) warnings.push('Slide bingkai tidak ditemukan (slide 1 deck tanpa teks "PEKAN INI"); dipakai bingkai sederhana.');
    const old = pres.getSlides().filter(s => !frame || s.getObjectId() !== frame.getObjectId());

    const ai = wkReadAiAnswer(wkAiSheet(d.sheet).getRange(WK_AI_CELL).getValue(), an, warnings);
    const specs = wkPlanSlides(an, ai);
    specs.forEach((sp, i) => {
      const s = frame ? frame.duplicate() : pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
      if (frame) { s.move(i); try { s.setSkipped(false); } catch (e) { /* abaikan */ } }
      try { s.getNotesPage().getSpeakerNotesShape().getText().setText(sp.notes || ' '); } catch (e) { /* abaikan */ }
      sp.pageId = s.getObjectId();
    });
    old.forEach(s => s.remove());
    if (frame) {
      frame.move(pres.getSlides().length - 1);
      try { frame.setSkipped(true); } catch (e) { /* abaikan */ }
      PropertiesService.getDocumentProperties().setProperty(WK_PROP_FRAME, frame.getObjectId());
    }
    pres.saveAndClose();

    // 2. Gambar isi slide (Slides API)
    specs.forEach(sp => {
      const b = new WkBatch(sp.pageId);
      if (!frame) wkUiFallbackFrame(b);
      sp.draw(b);
      b.flush(presId);
    });

    wkShowLink(file.getUrl(), `Weekly Report · ${an.labelLaporan}${ai ? ' · teks dari Claude' : ' · teks otomatis'}`, warnings,
      (isNew ? 'File deck weekly baru dibuat. Generate berikutnya akan memperbarui file yang sama.' : 'Isi deck weekly diperbarui (link tetap sama).') +
      ' Slide bingkai disimpan di akhir deck dalam keadaan tersembunyi (skip); ubah slide itu untuk mengganti logo/pita.');
  } finally {
    lock.releaseLock();
  }
}

function wkShowLink(url, title, warnings, info) {
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5">
    <p><b>${esc(title)}</b></p>${info ? `<p>${esc(info)}</p>` : ''}
    <p><a href="${esc(url)}" target="_blank" style="color:#007200;font-weight:bold">Buka deck weekly</a></p>
    ${warnings && warnings.length ? `<p><b>Catatan:</b></p><ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>`;
  const ui = wkUi();
  if (ui) ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(warnings && warnings.length ? 340 : 170), 'Weekly Report KebunPRO');
  else Logger.log(`${title}: ${url}\n${(warnings || []).join('\n')}`);
}

/* ------------------------------------------------------------------------- */
/* Rencana 2 slide                                                           */
/* ------------------------------------------------------------------------- */

/**
 * ai: hasil wkReadAiAnswer() atau null. Teks Claude dipakai bila ada; bagian kosong memakai teks otomatis.
 * Speaker notes slide 2 selalu diakhiri rincian SEMUA bisnis (temuan + tindak lanjut), agar tidak ada yang terlewat.
 */
function wkPlanSlides(an, ai) {
  const F = WK_UI.FRAME, G = WK_UI.GAP, auto = wkAutoTexts(an);
  const text = (id, key) => (ai && ai[id] && ai[id][key]) || auto[id][key];
  const K = key => an.kpis.find(k => k.key === key);
  const labels = an.weeks.map((w, i) => wkLabelSumbu(w) + (i === an.weeks.length - 1 && an.reportDays < 7 ? '*' : ''));
  const tag = ai ? 'Insight AI' : 'Insight otomatis';
  const leftW = WK_UI.COL_SPLIT - F.left, rightL = WK_UI.COL_SPLIT + G, rightW = F.right - rightL;
  const kpiH = 46, bodyTop = F.top + kpiH + G;
  const foot = (b, y) => { if (an.reportDays < 7) b.text(`*Pekan berjalan ${an.reportDays} dari 7 hari; angka volume pekan lalu disetarakan ${an.reportDays}/7.`,
    F.left, y, leftW, 9, { size: 6.4, color: WK_UI.COLOR.MUTED }); };
  const specs = [];

  // 1. Pemakaian produk: KPI (kiri atas), tren WAU per aplikasi (kiri), observasi (kanan)
  const charts = wkUsageCharts(an);
  const cards = ['wauTotal', 'aktif', 'penetrasi', 'userAktif'].map(K).filter(Boolean).filter(k => charts.indexOf(k) < 0).slice(0, 3);
  specs.push({ id: 'pemakaian', title: text('pemakaian', 'title'), notes: text('pemakaian', 'notes'), draw: b => {
    wkUiHeader(b, text('pemakaian', 'title'), an);
    wkUiKpiRow(b, cards.map((k, i) => Object.assign({}, k, { colorIdx: [0, 3, 1][i] })), { left: F.left, top: F.top, width: leftW, height: kpiH });
    const panelH = F.bottom - bodyTop - (an.reportDays < 7 ? 10 : 0);
    const A = wkUiPanel(b, F.left, bodyTop, leftW, panelH,
      charts.some(k => /^wau/.test(k.key)) ? `TREN WAU PER APLIKASI · ${an.weeks.length} PEKAN` : `TREN KEAKTIFAN · ${an.weeks.length} PEKAN`,
      'kolom hijau = pekan laporan');
    const cw = (A.width - 2 * 14) / 3;
    charts.forEach((k, i) => wkUiSeriesChart(b, k, labels, WK_UI.SERIES[i], A.left + i * (cw + 14), A.top, cw, A.height));
    foot(b, F.bottom - 8);
    wkUiObservations(b, text('pemakaian', 'insight'), rightL, F.top, rightW, F.bottom - F.top, tag);
  } });

  // 2. Kesehatan pelanggan & tindakan: KPI, tren TBS & luas dipanen, status + perubahan pelanggan (kiri), observasi + rencana (kanan)
  const tl = wkFollowupList(an);
  const cards2 = ['risiko', 'ton', 'pendapatan'].map(K).filter(Boolean);
  const notes2 = text('pelanggan', 'notes') + '\n\nRINCIAN TEMUAN & TINDAK LANJUT PER BISNIS:\n' + wkAllBusinessNotes(an);
  const items = tl.slice(0, WK_CONFIG.ROWS_FOLLOWUP).map(k => {
    const r = wkFindingRow(k, k.findings), first = WK_TINDAK[k.findings[0].code];
    return { title: k.name, finding: k.findings[0].text + (k.findings.length > 1 ? ` (+${k.findings.length - 1} temuan)` : ''),
      action: first.aksi, pic: first.pic, target: r.target, urgent: r.target === WK_CONFIG.FINDING_TARGET.risiko };
  });
  specs.push({ id: 'pelanggan', title: text('pelanggan', 'title'), notes: notes2, draw: b => {
    wkUiHeader(b, text('pelanggan', 'title'), an);
    wkUiKpiRow(b, cards2.map((k, i) => Object.assign({}, k, { colorIdx: [1, 0, 3][i] })), { left: F.left, top: F.top, width: leftW, height: kpiH });
    // Tren produksi 8 pekan: tonase TBS dan luas dipanen (skala masing-masing)
    const prodH = 140;
    const P = wkUiPanel(b, F.left, bodyTop, leftW, prodH, `TREN PRODUKSI · ${an.weeks.length} PEKAN`, 'kolom hijau = pekan laporan');
    const prod = ['ton', 'luasPanen'].map(K).filter(Boolean), pw = (P.width - 14) / 2;
    prod.forEach((k, i) => wkUiSeriesChart(b, k, labels, WK_UI.PROD[i], P.left + i * (pw + 14), P.top, pw, P.height));
    // Status pelanggan (ringkas) dan perubahan pelanggan (mulai / berhenti)
    const rowTop = bodyTop + prodH + G, rowH = F.bottom - rowTop - (an.reportDays < 7 ? 10 : 0), half = (leftW - G) / 2;
    wkUiStatusCompact(b, an, wkUiPanel(b, F.left, rowTop, half, rowH, 'STATUS PELANGGAN', `${an.total} kebun`));
    wkUiChangeList(b, an, wkUiPanel(b, F.left + half + G, rowTop, half, rowH, 'PERUBAHAN PELANGGAN', 'pekan ini'));
    foot(b, F.bottom - 8);
    // tinggi panel observasi mengikuti panjang insight (pita pendek), sisanya untuk rencana tindak lanjut
    const obsText = wkStripBold(text('pelanggan', 'insight'));
    const obsH = Math.min(130, Math.max(70, 20 + 8 + wkEstLines(obsText, 8.8, rightW - 32, true) * 8.8 * 1.3 + 30));
    wkUiObservations(b, text('pelanggan', 'insight'), rightL, F.top, rightW, obsH, tag);
    wkUiActions(b, items, rightL, F.top + obsH + G, rightW, F.bottom - F.top - obsH - G, tl.length - items.length);
  } });
  return specs;
}

/** Daftar nama berpenanda titik warna; yang tidak muat diringkas "+N lainnya". */
function wkUiNameList(b, names, A, color) {
  const C = WK_UI.COLOR, lineH = 11, max = Math.max(1, Math.floor(A.height / lineH));
  if (!names.length) { b.text('Tidak ada', A.left, A.top, A.width, lineH, { size: 7.6, color: C.MUTED }); return; }
  const shown = names.length > max ? names.slice(0, max - 1) : names;
  shown.forEach((n, i) => {
    b.rect(A.left, A.top + i * lineH + 3.5, 4, 4, { round: true, fill: color });
    b.text(wkFitLine(n, 7.4, A.width - 8 - 14), A.left + 8, A.top + i * lineH, A.width - 8, lineH, { size: 7.4, color: C.TEXT, valign: 'MIDDLE' });
  });
  if (names.length > shown.length) b.text(`+${names.length - shown.length} lainnya (lihat speaker notes)`, A.left + 8, A.top + shown.length * lineH, A.width - 8, lineH, { size: 7, color: C.MUTED, valign: 'MIDDLE' });
}

/** 3 grafik WAU aplikasi; bila tabel WAU tidak ada, diganti indikator keaktifan input. */
function wkUsageCharts(an) {
  const K = key => an.kpis.find(k => k.key === key);
  const wau = ['wauEstate', 'wauMandor', 'wauAdmin'].map(K).filter(Boolean);
  if (wau.length) return wau;
  return ['aktif', 'userAktif', 'catatan'].map(K).filter(Boolean);
}

/** Rincian SEMUA bisnis bertemuan (untuk speaker notes): temuan, tindak lanjut + PIC, target. */
function wkAllBusinessNotes(an) {
  const tl = wkFollowupList(an);
  if (!tl.length) return 'Semua bisnis berstatus sehat; tidak ada temuan.';
  return tl.map((k, i) => {
    const r = wkFindingRow(k, k.findings);
    return `${i + 1}. ${k.name} (${k.status}) — Temuan: ${k.findings.map(f => f.text).join('; ')}. Tindak lanjut: ${r.actions.join('; ')}. Target: ${r.target}.`;
  }).join('\n');
}

/** "Input pekan ini: panen 120 (▲ 8%), muat 80 (▼ 3%), jual 40 (= 0%), rawat 25 (▲ baru); rata-rata 3,4 hari input per kebun (▼ 6%)." */
function wkInputSentence(an) {
  const K = key => an.kpis.find(k => k.key === key);
  const parts = [['catPanen', 'panen'], ['catMuat', 'muat'], ['catJual', 'jual'], ['catRawat', 'rawat']]
    .map(([key, nm]) => { const k = K(key); return k ? `${nm} **${k.value}** (${k.delta.txt})` : null; }).filter(Boolean);
  const hari = K('rataHari');
  if (!parts.length && !hari) return '';
  return (parts.length ? `Input pekan ini: ${parts.join(', ')}` : '') +
    (hari ? `${parts.length ? '; rata-rata' : 'Rata-rata'} ${hari.value} hari input per kebun (${hari.delta.txt})` : '') + '.';
}

/* ------------------------------------------------------------------------- */
/* Teks otomatis (dipakai bila jawaban Claude belum ada)                     */
/* ------------------------------------------------------------------------- */

function wkAutoTexts(an) {
  const K = key => an.kpis.find(k => k.key === key);
  const kv = (k, bold) => (k ? `${bold ? '**' : ''}${k.value}${k.unit === '%' ? '%' : (k.unit ? ' ' + k.unit : '')}${bold ? '**' : ''} (${k.delta.txt})` : '');
  const names = (list, n) => list.slice(0, n || 3).map(k => k.name).join(', ') + (list.length > (n || 3) ? ` dan ${list.length - (n || 3)} lainnya` : '');
  const fit = (t, alt) => (t.length <= WK_AI_LIMITS.TITLE ? t : alt);
  const total = K('wauTotal'), aktif = K('aktif'), pen = K('penetrasi'), charts = wkUsageCharts(an);
  const tl = wkFollowupList(an), ton = K('ton'), nilai = K('pendapatan'), luas = K('luasPanen');
  const partial = an.reportDays < 7 ? ` Pekan laporan baru ${an.reportDays} dari 7 hari; angka masih bisa bertambah.` : '';
  const withUnit = k => `${k.value}${k.unit === '%' ? '%' : (k.unit ? ' ' + k.unit : '')}`;
  const trendTxt = k => `${k.name} ${withUnit(k)} (${k.delta.txt} vs pekan lalu, tren ${an.weeks.length} pekan ${k.trend})`;

  // 1. Pemakaian
  const worst = charts.filter(k => k.delta.pct !== null).sort((a, b) => a.delta.pct - b.delta.pct)[0];
  const pemakaianTitle = total
    ? fit(`WAU ${total.value} pengguna (${total.delta.txt}), ${aktif ? aktif.value : '-'}/${an.total} kebun aktif`, `WAU ${total.value} pengguna (${total.delta.txt})`)
    : fit(`${aktif ? aktif.value : '-'} dari ${an.total} kebun aktif (${aktif ? aktif.delta.txt : '-'})`, 'Pemakaian KebunPRO pekan ini');
  const pemakaianInsight = [
    charts.map(k => `${k.name} ${kv(k, true)}`).join(', ') + '.',
    aktif && charts.indexOf(aktif) < 0 ? `Kebun aktif ${aktif.value} dari ${an.cur.kebun} (${aktif.delta.txt})${pen ? `, akun menginput ${kv(pen)} dari akun terdaftar` : ''}.`
      : (pen ? `Akun menginput ${kv(pen)} dari akun terdaftar.` : ''),
    wkInputSentence(an),
    worst && worst.delta.dir < 0 ? `${worst.name} turun paling dalam; perlu dicek penyebabnya pekan ini.`
      : (charts.some(k => /^wau/.test(k.key)) ? 'Tidak ada aplikasi yang turun pekan ini.' : '')
  ].filter(Boolean).join(' ');
  const pemakaianNotes = `Pekan laporan ${an.labelLaporan}, dibanding ${an.labelPembanding}.${partial} ` +
    charts.concat([total, aktif, pen].filter(Boolean)).map(k => trendTxt(k) + '.').join(' ') + ' ' +
    ['catPanen', 'catMuat', 'catJual', 'catRawat', 'rataHari'].map(K).filter(Boolean).map(k => trendTxt(k) + '.').join(' ');

  // 2. Pelanggan
  const pelangganTitle = fit(an.risiko ? `${an.risiko} kebun berisiko, ${an.diam.length} tanpa aktivitas pekan ini`
    : `${tl.length} bisnis perlu tindak lanjut, tidak ada yang berisiko`, `${tl.length} bisnis perlu tindak lanjut`);
  const pelangganInsight = wkCutSentence([
    `**${an.risiko} kebun berisiko** (pekan lalu ${an.prevRisiko}); ${an.diam.length} tanpa aktivitas, ${an.baru.length} kebun baru mulai.`,
    ton ? `TBS tercatat ${kv(ton)}${luas ? ` dari luas dipanen ${kv(luas)}` : ''}${nilai ? `, nilai penjualan ${kv(nilai)}` : ''}.` : ''
  ].filter(Boolean).join(' '), WK_AI_LIMITS.INSIGHT_STRIP);
  const pelangganNotes = `Status pelanggan: ${an.risiko} berisiko, ${an.perhatian} perlu perhatian, ${an.total - an.risiko - an.perhatian} sehat.` +
    ` Kebun tanpa aktivitas pekan ini: ${an.diam.length ? names(an.diam, 10) : 'tidak ada'}.` +
    ` Kebun baru mulai pekan ini: ${an.baru.length ? names(an.baru, 10) : 'tidak ada'}.` +
    (ton ? ` ${trendTxt(ton)}.` : '') + (luas ? ` ${trendTxt(luas)}.` : '') +
    (ton && luas && luas.raw ? ` TBS per hektar dipanen ${wkFmt(ton.raw / luas.raw, 2)} ton/ha.` : '') + (nilai ? ` ${trendTxt(nilai)}.` : '') + partial;

  return {
    pemakaian: { title: pemakaianTitle, insight: pemakaianInsight, notes: pemakaianNotes },
    pelanggan: { title: pelangganTitle, insight: pelangganInsight, notes: pelangganNotes }
  };
}
