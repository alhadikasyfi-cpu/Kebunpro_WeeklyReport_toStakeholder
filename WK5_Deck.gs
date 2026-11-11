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

    const tpl = SlidesApp.openById(WK_CONFIG.TEMPLATE_ID);
    const tCover = tpl.getSlides()[0];   // dipakai hanya bila WITH_COVER_CLOSING
    const tContent = wkFindSlide(tpl, '{{slide_title}}');
    const tClosing = wkFindSlide(tpl, 'Terima Kasih') || wkFindSlide(tpl, 'Thank You');
    if (!tContent) return wkAlert('Slide master {{slide_title}} tidak ditemukan di template. Jalankan "Siapkan Template SawitPRO" (menu monthly) terlebih dahulu.');

    let file = wkDeckFile();
    const isNew = !file;
    if (isNew) file = wkCreateDeckFile(d.ss, warnings);
    const presId = file.getId();
    const pres = SlidesApp.openById(presId);
    const old = pres.getSlides();

    // 1. Salin slide template lalu isi judul; kartu INSIGHT template dihapus (digambar ulang sesuai tata letak weekly)
    const pageIds = [];
    if (WK_CONFIG.WITH_COVER_CLOSING) {
      const cover = pres.appendSlide(tCover);
      cover.replaceAllText('MONTHLY REPORT KEBUNPRO', 'WEEKLY REPORT KEBUNPRO');
      ['{{TITLE}}', '{{title}}'].forEach(p => cover.replaceAllText(p, 'Aktivitas Pelanggan KebunPRO'));
      ['{{PERIOD}}', '{{period}}'].forEach(p => cover.replaceAllText(p, an.labelLaporan));
      cover.replaceAllText('Lokasi:', 'Cakupan:');
      cover.replaceAllText('{{location}}', `${an.total} kebun pelanggan · internal SawitPRO`);
      pageIds.push(cover.getObjectId());
    }

    const ai = wkReadAiAnswer(wkAiSheet(d.sheet).getRange(WK_AI_CELL).getValue(), an, warnings);
    const specs = wkPlanSlides(an, ai);
    specs.forEach(sp => {
      const s = pres.appendSlide(tContent);
      s.replaceAllText('{{slide_title}}', sp.title);
      wkRemoveInsightCard(s);
      try { s.getNotesPage().getSpeakerNotesShape().getText().setText(sp.notes || ' '); } catch (e) { /* abaikan */ }
      sp.pageId = s.getObjectId();
      pageIds.push(sp.pageId);
    });
    if (WK_CONFIG.WITH_COVER_CLOSING && tClosing) pageIds.push(pres.appendSlide(tClosing).getObjectId());
    old.forEach(s => s.remove());
    pres.saveAndClose();

    // 2. Gambar KPI, grafik, tabel (Slides API) lalu nomor halaman
    specs.forEach(sp => { const b = new WkBatch(sp.pageId); sp.draw(b); b.flush(presId); });
    Slides.Presentations.batchUpdate({ requests: pageIds.map((id, i) => ({ replaceAllText: {
      containsText: { text: '{{page}}', matchCase: true }, replaceText: String(i + 1), pageObjectIds: [id] } })) }, presId);

    wkShowLink(file.getUrl(), `Weekly Report · ${an.labelLaporan}${ai ? ' · teks dari Claude' : ' · teks otomatis'}`, warnings,
      isNew ? 'File deck weekly baru dibuat. Generate berikutnya akan memperbarui file yang sama.' : 'Isi deck weekly diperbarui (link tetap sama).');
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
  const L = WK_CONFIG.LAYOUT, T = WK_CONFIG.TYPE, C = WK_CONFIG.COLOR, auto = wkAutoTexts(an);
  const text = (id, key) => (ai && ai[id] && ai[id][key]) || auto[id][key];
  const K = key => an.kpis.find(k => k.key === key);
  const period = `Pekan laporan: ${an.labelLaporan}  ·  Pembanding: ${an.labelPembanding}` +
    (an.reportDays < 7 ? `  ·  *volume pekan lalu disetarakan ${an.reportDays}/7 hari` : '');
  const labels = an.weeks.map((w, i) => wkLabelSumbu(w) + (i === an.weeks.length - 1 && an.reportDays < 7 ? '*' : ''));
  const specs = [];

  // 1. Pemakaian produk: 3 grafik kecil WAU per aplikasi (skala sendiri) + 3 kartu
  const charts = wkUsageCharts(an);
  const cards = ['wauTotal', 'aktif', 'penetrasi', 'userAktif'].map(K).filter(Boolean)
    .filter(k => charts.indexOf(k) < 0).slice(0, 3);
  specs.push({ id: 'pemakaian', title: text('pemakaian', 'title'), notes: text('pemakaian', 'notes'), draw: b => {
    wkDrawPeriod(b, period);
    const A = L.CONTENT, gap = 8, w = (A.width - gap * 2) / 3, topH = 150;
    charts.forEach((k, i) => wkDrawMiniChart(b, { title: k.short, delta: k.delta, goodDown: k.goodDown, values: k.spark, fmt: k.fmt },
      labels, A.left + i * (w + gap), A.top, w, topH));
    if (cards.length) wkDrawKpiCards(b, cards, { left: A.left, top: A.top + topH + gap, width: A.width, height: A.height - topH - gap }, cards.length);
    wkDrawInsightCard(b, text('pemakaian', 'insight'), L.INSIGHT.left, L.INSIGHT.top, L.INSIGHT.width, L.INSIGHT.height);
  } });

  // 2. Kesehatan pelanggan & tindakan
  const tl = wkFollowupList(an);
  const cards2 = ['risiko', 'ton', 'pendapatan'].map(K).filter(Boolean);
  const notes2 = text('pelanggan', 'notes') + '\n\nRINCIAN TEMUAN & TINDAK LANJUT PER BISNIS:\n' + wkAllBusinessNotes(an);
  specs.push({ id: 'pelanggan', title: text('pelanggan', 'title'), notes: notes2, draw: b => {
    wkDrawPeriod(b, period);
    const W = L.RIGHT - L.MARGIN, gap = 8;
    let y = L.BODY_TOP;
    wkDrawStrip(b, text('pelanggan', 'insight'), y, 34);
    y += 34 + gap;
    if (cards2.length) { wkDrawCompactCards(b, cards2, { left: L.MARGIN, top: y, width: W, height: 58 }); y += 58 + gap; }
    const half = (W - gap) / 2, listH = 46;
    wkDrawListBox(b, 'Kebun baru mulai pekan ini', an.baru.map(k => k.name), L.MARGIN, y, half, listH, C.GREEN);
    wkDrawListBox(b, 'Kebun tanpa aktivitas pekan ini', an.diam.map(k => k.name + (k.lastInput ? ` (terakhir ${wkTglPendek(k.lastInput)})` : '')),
      L.MARGIN + half + gap, y, half, listH, C.DANGER);
    y += listH + gap;
    // tabel bisnis prioritas: baris sebanyak muat sampai batas bawah; sisanya "+N bisnis lain" (rincian di speaker notes)
    const avail = L.BOTTOM - y - 28 - 13;
    const rows = [];
    let h = 0;
    tl.slice(0, WK_CONFIG.ROWS_FOLLOWUP).map(k => wkFindingRow(k, k.findings)).some(r => {
      const rh = wkFindingRowHeight(r.cells);
      if (h + rh > avail) return true;
      rows.push(r); h += rh; return false;
    });
    if (rows.length) {
      b.table(L.MARGIN, y, W, [WK_FINDING_COLS.head].concat(rows.map(r => r.cells)),
        { colWidths: WK_FINDING_COLS.widths, fontSize: T.TABLE_CELL_MIN, rowHeight: 26,
          cellColor: (r, c, t) => (c === 1 ? wkStatusColor(t) : (c === 4 && t === WK_CONFIG.FINDING_TARGET.risiko ? C.DANGER : null)) });
      const more = tl.length - rows.length;
      if (more > 0) b.text(`+${more} bisnis lain perlu tindak lanjut: rincian semua bisnis di speaker notes`,
        L.MARGIN, Math.min(y + 28 + h + 2, L.BOTTOM - 11), W, 11, { size: T.CAPTION, color: C.MUTED });
    } else {
      b.text('Tidak ada bisnis yang berisiko atau perlu perhatian pekan ini.', L.MARGIN, y, W, 14, { size: T.BODY, color: C.MUTED });
    }
  } });
  return specs;
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

/* ------------------------------------------------------------------------- */
/* Teks otomatis (dipakai bila jawaban Claude belum ada)                     */
/* ------------------------------------------------------------------------- */

function wkAutoTexts(an) {
  const K = key => an.kpis.find(k => k.key === key);
  const kv = (k, bold) => (k ? `${bold ? '**' : ''}${k.value}${k.unit === '%' ? '%' : (k.unit ? ' ' + k.unit : '')}${bold ? '**' : ''} (${k.delta.txt})` : '');
  const names = (list, n) => list.slice(0, n || 3).map(k => k.name).join(', ') + (list.length > (n || 3) ? ` dan ${list.length - (n || 3)} lainnya` : '');
  const fit = (t, alt) => (t.length <= WK_AI_LIMITS.TITLE ? t : alt);
  const total = K('wauTotal'), aktif = K('aktif'), pen = K('penetrasi'), charts = wkUsageCharts(an);
  const tl = wkFollowupList(an), ton = K('ton'), nilai = K('pendapatan');
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
    aktif && charts.indexOf(aktif) < 0 ? `Kebun aktif ${aktif.value} dari ${an.cur.kebun} (${aktif.delta.txt})${pen ? `, penetrasi akun ${kv(pen)}` : ''}.`
      : (pen ? `Penetrasi akun ${kv(pen)}.` : ''),
    worst && worst.delta.dir < 0 ? `${worst.name} turun paling dalam; perlu dicek penyebabnya pekan ini.`
      : (charts.some(k => /^wau/.test(k.key)) ? 'Tidak ada aplikasi yang turun pekan ini.' : '')
  ].filter(Boolean).join(' ');
  const pemakaianNotes = `Pekan laporan ${an.labelLaporan}, dibanding ${an.labelPembanding}.${partial} ` +
    charts.concat([total, aktif, pen].filter(Boolean)).map(k => trendTxt(k) + '.').join(' ');

  // 2. Pelanggan
  const pelangganTitle = fit(an.risiko ? `${an.risiko} kebun berisiko, ${an.diam.length} tanpa aktivitas pekan ini`
    : `${tl.length} bisnis perlu tindak lanjut, tidak ada yang berisiko`, `${tl.length} bisnis perlu tindak lanjut`);
  const pelangganInsight = wkCutSentence([
    `**${an.risiko} kebun berisiko** (pekan lalu ${an.prevRisiko}); ${an.diam.length} tanpa aktivitas, ${an.baru.length} kebun baru mulai.`,
    ton ? `TBS tercatat ${kv(ton)}${nilai ? `, nilai penjualan ${kv(nilai)}` : ''}.` : ''
  ].filter(Boolean).join(' '), WK_AI_LIMITS.INSIGHT_STRIP);
  const pelangganNotes = `Status pelanggan: ${an.risiko} berisiko, ${an.perhatian} perlu perhatian, ${an.total - an.risiko - an.perhatian} sehat.` +
    ` Kebun tanpa aktivitas pekan ini: ${an.diam.length ? names(an.diam, 10) : 'tidak ada'}.` +
    ` Kebun baru mulai pekan ini: ${an.baru.length ? names(an.baru, 10) : 'tidak ada'}.` +
    (ton ? ` ${trendTxt(ton)}.` : '') + (nilai ? ` ${trendTxt(nilai)}.` : '') + partial;

  return {
    pemakaian: { title: pemakaianTitle, insight: pemakaianInsight, notes: pemakaianNotes },
    pelanggan: { title: pelangganTitle, insight: pelangganInsight, notes: pelangganNotes }
  };
}
