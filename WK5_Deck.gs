/**
 * File WK5: Deck.gs
 * Menu Weekly Report, rencana isi slide, dan pembuatan deck.
 *
 * Deck weekly adalah SATU file tetap: generate pertama membuat presentasi baru (ID disimpan di Document Properties
 * spreadsheet), generate berikutnya mengganti seluruh isi file yang sama sehingga link yang dibagikan ke
 * stakeholder tidak pernah berubah. Gaya slide disalin dari template monthly (slide konten; cover & penutup opsional).
 *
 * Isi deck (maks. 3 slide, untuk stakeholder yang sangat sibuk). Setiap slide: tanggal pekan laporan vs pembanding,
 * kartu INSIGHT, dan speaker notes.
 *   1 Ringkasan pekan  : 6 KPI, masing-masing % perubahan vs pekan lalu + tren mini 8 pekan
 *   2 Tren pekan per pekan : 4 grafik kecil 8 pekan + perbandingan dengan rata-rata 8 pekan + kebun penggerak
 *   3 Kebun perlu tindak lanjut : status, % perubahan per kebun, temuan, tindak lanjut & PIC
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
  const an = wkAnalyze(t.rows, new Date(), t.anchor);
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
/* Rencana 3 slide                                                           */
/* ------------------------------------------------------------------------- */

/**
 * ai: hasil wkReadAiAnswer() atau null. Setiap slide: judul, baris tanggal pekan, isi, INSIGHT, speaker notes.
 * Teks Claude dipakai bila ada; bagian yang kosong memakai teks otomatis dari data.
 */
function wkPlanSlides(an, ai) {
  const L = WK_CONFIG.LAYOUT, auto = wkAutoTexts(an);
  const text = (id, key) => (ai && ai[id] && ai[id][key]) || auto[id][key];
  const period = `Pekan laporan: ${an.labelLaporan}  ·  Pembanding: ${an.labelPembanding}` +
    (an.reportDays < 7 ? `  ·  *volume pekan lalu disetarakan ${an.reportDays}/7 hari` : '');
  const labels = an.weeks.map((w, i) => wkLabelSumbu(w) + (i === an.weeks.length - 1 && an.reportDays < 7 ? '*' : ''));
  const side = (b, id) => wkDrawInsightCard(b, text(id, 'insight'), L.INSIGHT.left, L.INSIGHT.top, L.INSIGHT.width, L.INSIGHT.height);
  const specs = [];

  // 1. Ringkasan: kartu KPI (nilai, % vs pekan lalu, tren mini 8 pekan)
  specs.push({ id: 'ringkasan', title: text('ringkasan', 'title'), notes: text('ringkasan', 'notes'), draw: b => {
    wkDrawPeriod(b, period);
    wkDrawKpiCards(b, an.kpis, L.CONTENT, an.kpis.length === 4 ? 2 : 3);
    side(b, 'ringkasan');
  } });

  // 2. Tren pekan per pekan: 4 grafik kecil
  const pick = ['aktif', 'userAktif', 'ton', 'risiko'].map(key => an.kpis.find(k => k.key === key)).filter(Boolean);
  an.kpis.forEach(k => { if (pick.length < 4 && pick.indexOf(k) < 0) pick.push(k); });
  specs.push({ id: 'tren', title: text('tren', 'title'), notes: text('tren', 'notes'), draw: b => {
    wkDrawPeriod(b, period);
    const A = L.CONTENT, gap = 8, w = (A.width - gap) / 2, h = (A.height - gap) / 2;
    pick.forEach((k, i) => wkDrawMiniChart(b, { title: k.name + (k.unit && k.unit.length <= 8 ? ` (${k.unit})` : ''),
      delta: k.delta, goodDown: k.goodDown, values: k.spark, fmt: k.fmt }, labels,
      A.left + (i % 2) * (w + gap), A.top + Math.floor(i / 2) * (h + gap), w, h));
    side(b, 'tren');
  } });

  // 3. Kebun perlu tindak lanjut (tabel lebar penuh + INSIGHT di bawah)
  const tl = wkFollowupList(an), fpages = wkFindingPages(an);
  const rows = (tl.length ? tl : an.kebun.slice().sort((a, b) => Math.abs(b.dTon.pct || 0) - Math.abs(a.dTon.pct || 0)))
    .slice(0, WK_CONFIG.ROWS_FOLLOWUP);
  specs.push({ id: 'tindak', title: text('tindak', 'title'), notes: text('tindak', 'notes'), draw: b => {
    wkDrawPeriod(b, period);
    const W = L.RIGHT - L.MARGIN, T = WK_CONFIG.TYPE;
    const widths = [1.8, 1.1, 1.1, 1.3, 2.9, 2.9], sum = widths.reduce((x, y) => x + y, 0);
    const data = [['Kebun', 'Status', 'Hari input\nvs pekan lalu', 'TBS ton\nvs pekan lalu', 'Temuan utama', 'Tindak lanjut · PIC']]
      .concat(rows.map(k => [k.name, k.status,
        `${k.dHari.txt}\n${wkFmt(k.cur ? k.cur.hari : 0)} hari`, `${k.dTon.txt}\n${wkFmtAuto(k.cur ? k.cur.ton : 0)} ton`,
        k.findings.length ? k.findings[0].text + (k.findings.length > 1 ? ` (+${k.findings.length - 1} temuan)` : '') : 'Tidak ada temuan',
        k.tindak || 'Pantau rutin (PIC: CS)']));
    b.table(L.MARGIN, L.BODY_TOP, W, data, { colWidths: widths, fontSize: T.TABLE_CELL_MIN, rowHeight: 30,
      cellColor: (r, c, t) => (c === 1 ? wkStatusColor(t) : null) });
    // perkiraan tinggi tabel (baris bisa meninggi bila teks terlipat) untuk menaruh INSIGHT di bawahnya
    const colW = i => W * widths[i] / sum - 10;
    let y = L.BODY_TOP + 30 + data.slice(1).reduce((acc, row) => acc + Math.max(30,
      Math.max.apply(null, [0, 4, 5].map(i => wkEstLines(row[i], T.TABLE_CELL_MIN, colW(i), i === 0))) * T.TABLE_CELL_MIN * 1.25 + 10), 0);
    const more = tl.length - rows.length;
    if (more > 0) {
      b.text(`+${more} kebun lain perlu perhatian; semua temuan dan tindak lanjut dirinci di slide ${wkSlideRange(4, fpages.length)}`, L.MARGIN, y + 3, W, 11, { size: T.CAPTION, color: WK_CONFIG.COLOR.MUTED });
      y += 15;
    }
    const top = y + 8;
    if (L.BOTTOM - top >= 40) wkDrawInsightCard(b, text('tindak', 'insight'), L.MARGIN, top, W, L.BOTTOM - top);
  } });

  // 4+. Temuan & tindak lanjut SEMUA kebun, per kelompok (keaktifan & churn, pencatatan, produksi)
  fpages.forEach(pg => {
    const at = wkAutoFindingTexts(an, pg);
    const ft = key => (ai && ai[pg.id] && ai[pg.id][key]) || at[key];
    specs.push({ id: pg.id, title: ft('title'), notes: ft('notes'), draw: b => {
      wkDrawPeriod(b, period);
      wkDrawStrip(b, ft('insight'), L.BODY_TOP, L.FINDING_TABLE_TOP - L.BODY_TOP - 8);
      const W = L.RIGHT - L.MARGIN, T = WK_CONFIG.TYPE;
      b.table(L.MARGIN, L.FINDING_TABLE_TOP, W, [WK_FINDING_COLS.head].concat(pg.rows.map(r => r.cells)),
        { colWidths: WK_FINDING_COLS.widths, fontSize: T.TABLE_CELL_MIN, rowHeight: 26,
          cellColor: (r, c, t) => (c === 1 ? wkStatusColor(t) : (c === 4 && t === WK_CONFIG.FINDING_TARGET.risiko ? WK_CONFIG.COLOR.DANGER : null)) });
      if (pg.overflow.length) {
        const y = L.FINDING_TABLE_TOP + 28 + pg.rows.reduce((a, r) => a + wkFindingRowHeight(r.cells), 0) + 3;
        b.text(`+${pg.overflow.length} kebun lain di kelompok ini (${pg.overflow.slice(0, 4).map(r => r.k.name).join(', ')}${pg.overflow.length > 4 ? ', …' : ''}): rincian di speaker notes`,
          L.MARGIN, Math.min(y, L.BOTTOM - 11), W, 11, { size: T.CAPTION, color: WK_CONFIG.COLOR.MUTED });
      }
    } });
  });
  return specs;
}

/** "4–6" untuk slide isi ke-4 s.d. ke-6 (bergeser 1 bila cover ditampilkan). */
function wkSlideRange(first, count) {
  const a = first + (WK_CONFIG.WITH_COVER_CLOSING ? 1 : 0);
  return count > 1 ? `${a}–${a + count - 1}` : String(a);
}

/** Teks otomatis slide temuan satu halaman (dipakai bila jawaban Claude tidak memuat slide ini). */
function wkAutoFindingTexts(an, pg) {
  const fit = (t, alt) => (t.length <= WK_AI_LIMITS.TITLE ? t : alt);
  const suffix = pg.pages > 1 ? ` (${pg.page}/${pg.pages})` : '';
  const title = fit(pg.group.title(pg.total, pg.risiko) + suffix, fit(`${pg.group.name}: ${pg.total} kebun${suffix}`, pg.group.name + suffix));
  // jumlah kebun per jenis temuan di kelompok ini
  const count = {};
  pg.allRows.forEach(r => r.findings.forEach(f => { count[f.code] = (count[f.code] || 0) + 1; }));
  const parts = Object.keys(count).sort((a, b) => count[b] - count[a]).map(c => `${count[c]} ${WK_TINDAK[c].label}`);
  const urgent = pg.allRows.filter(r => r.target === WK_CONFIG.FINDING_TARGET.risiko);
  const insight = `**${pg.total} kebun** dengan temuan ${pg.group.name.toLowerCase()}: ${parts.join(', ')}. ` +
    (urgent.length ? `Tindak lanjut pekan ini: ${urgent.slice(0, 3).map(r => `**${r.k.name}**`).join(', ')}${urgent.length > 3 ? ` dan ${urgent.length - 3} lainnya` : ''}.`
      : 'Tidak ada yang berisiko; tindak lanjut dalam 2 pekan.');
  const line = r => `${r.k.name} (${r.k.status}): ${r.findings.map(f => f.text).join('; ')}. Tindak lanjut: ${r.actions.join('; ')}. Target: ${r.target}.`;
  const notes = `${pg.group.name}, pekan ${an.labelLaporan}. ` + pg.rows.map(line).join(' ') +
    (pg.overflow.length ? ` Kebun lain di kelompok ini: ${pg.overflow.map(line).join(' ')}` : '');
  return { title, insight, notes };
}

/* ------------------------------------------------------------------------- */
/* Teks otomatis (dipakai bila jawaban Claude belum ada)                     */
/* ------------------------------------------------------------------------- */

function wkAutoTexts(an) {
  const K = key => an.kpis.find(k => k.key === key);
  const kv = (k, bold) => (k ? `${bold ? '**' : ''}${k.value}${k.unit ? ' ' + k.unit : ''}${bold ? '**' : ''} (${k.delta.txt} vs pekan lalu)` : '');
  const nameList = list => list.slice(0, 3).map(k => k.name).join(', ') + (list.length > 3 ? ` dan ${list.length - 3} lainnya` : '');
  const fit = (t, alt) => (t.length <= WK_AI_LIMITS.TITLE ? t : alt);
  const aktif = K('aktif'), ton = K('ton'), akun = K('userAktif'), nilai = K('pendapatan');
  const tl = wkFollowupList(an), mv = wkMovers(an);
  const partial = an.reportDays < 7 ? ` Pekan laporan baru ${an.reportDays} dari 7 hari; angka volume pekan lalu disetarakan.` : '';

  // vs rata-rata pekan-pekan sebelumnya (tanpa pekan laporan); volume disetarakan bila pekan laporan belum penuh
  const vsAvg = k => {
    const hist = k.spark.slice(0, -1).filter(v => v !== null && v !== undefined);
    if (!hist.length) return '';
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
    const ref = k.prorate ? avg * an.scale : avg;
    return `${k.name} ${k.value}${k.unit && k.unit.length <= 8 ? ' ' + k.unit : ''}, tren ${k.trend}, ` +
      `${wkDelta(k.raw, ref, k.isPct).txt} vs rata-rata ${hist.length} pekan (${k.fmt(avg)}${k.prorate && an.scale < 1 ? ', disetarakan' : ''})`;
  };

  const ringkasanTitle = fit(an.risiko
    ? `${an.risiko} kebun berisiko, ${aktif ? aktif.value : '-'} dari ${an.total} kebun aktif`
    : `${aktif ? aktif.value : '-'} dari ${an.total} kebun aktif (${aktif ? aktif.delta.txt : '-'})`, 'Ringkasan pekan ini');
  const ringkasanInsight = [
    aktif ? `**${aktif.value} dari ${an.cur.kebun} kebun** menginput data (${aktif.delta.txt} vs pekan lalu)${akun ? `; akun aktif ${kv(akun)}` : ''}.` : '',
    ton ? `TBS tercatat ${kv(ton)}${nilai ? `, nilai penjualan ${kv(nilai)}` : ''}.` : '',
    `${an.risiko} kebun berisiko (pekan lalu ${an.prevRisiko}); rincian tindak lanjut di slide 3.`
  ].filter(Boolean).join(' ');
  const ringkasanNotes = `Pekan laporan ${an.labelLaporan}, dibanding ${an.labelPembanding}.${partial} ` +
    an.kpis.map(k => `${k.name}: ${k.value}${k.unit ? ' ' + k.unit : ''}, ${k.delta.txt} vs pekan lalu, tren 8 pekan ${k.trend}.`).join(' ') +
    ` Status pelanggan: ${an.risiko} berisiko, ${an.perhatian} perlu perhatian, ${an.total - an.risiko - an.perhatian} sehat.` +
    (tl.length ? ` Yang diminta dari stakeholder: dukungan tindak lanjut untuk ${nameList(tl)}.` : ' Tidak ada kebun yang perlu tindak lanjut khusus.');

  const trenK = ['aktif', 'userAktif', 'ton', 'risiko'].map(K).filter(Boolean);
  const main = aktif || an.kpis[0];
  const short = { aktif: 'kebun aktif', userAktif: 'akun aktif', risiko: 'kebun berisiko', ton: 'TBS' };
  const trenTitle = fit(`Tren ${an.weeks.length} pekan: ${short[main.key] || main.name} ${main.trend}` + (ton && ton !== main ? `, TBS ${ton.trend}` : ''), 'Tren pekan per pekan');
  const trenInsight = trenK.slice(0, 3).map(vsAvg).filter(Boolean).map(t => t + '.').join(' ');
  const trenNotes = trenK.map(vsAvg).filter(Boolean).map(t => t + '.').join(' ') +
    (mv.stopped.length ? ` Berhenti input pekan ini: ${nameList(mv.stopped)}.` : '') +
    (mv.started.length ? ` Mulai atau kembali input: ${nameList(mv.started)}.` : '') +
    (mv.up.length ? ` TBS naik terbesar: ${mv.up.map(k => `${k.name} ${k.dTon.txt}`).join(', ')}.` : '') +
    (mv.down.length ? ` TBS turun terbesar: ${mv.down.map(k => `${k.name} ${k.dTon.txt}`).join(', ')}.` : '') + partial;

  const tindakTitle = tl.length ? fit(`${tl.length} kebun perlu tindak lanjut, ${an.risiko} berisiko`, 'Kebun perlu tindak lanjut') : 'Semua kebun sehat pekan ini';
  const tindakInsight = tl.length
    ? `Prioritas pekan ini: ${tl.slice(0, 2).map(k => `**${k.name}** (${k.findings[0].text.charAt(0).toLowerCase() + k.findings[0].text.slice(1)})`).join(' dan ')}. ` +
      `Kebun berisiko ${an.risiko} (pekan lalu ${an.prevRisiko}); tindak lanjut CS dan Sales perlu dimulai pekan ini.`
    : `Tidak ada kebun berisiko atau perlu perhatian. Tabel menampilkan perubahan TBS terbesar sebagai pantauan.`;
  const tindakNotes = tl.length
    ? tl.map(k => `${k.name} (${k.status}): ${k.findings.map(f => f.text).join('; ')}. Tindak lanjut: ${k.tindak}.`).join(' ')
    : 'Semua kebun berstatus sehat; pendampingan rutin tetap berjalan.';

  return {
    ringkasan: { title: ringkasanTitle, insight: ringkasanInsight, notes: ringkasanNotes },
    tren: { title: trenTitle, insight: trenInsight || 'Data tren belum cukup.', notes: trenNotes || 'Data tren belum cukup.' },
    tindak: { title: tindakTitle, insight: tindakInsight, notes: tindakNotes }
  };
}

