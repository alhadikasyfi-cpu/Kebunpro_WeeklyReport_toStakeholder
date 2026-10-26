/**
 * File WK5: Deck.gs
 * Menu Weekly Report, rencana isi slide, dan pembuatan deck.
 *
 * Deck weekly adalah SATU file tetap: generate pertama membuat presentasi baru (ID disimpan di Document Properties
 * spreadsheet), generate berikutnya mengganti seluruh isi file yang sama sehingga link yang dibagikan ke
 * stakeholder tidak pernah berubah. Slide disalin dari template monthly (cover, slide konten, penutup).
 *
 * Urutan deck:
 *   1 Cover · 2 Ringkasan pekan (KPI vs pekan lalu) · 3 Tren TBS · 4 Tren keaktifan · 5 Keaktifan per kebun
 *   · 6 Kinerja per kebun · 7 Kebun perlu tindak lanjut · 8 Aktivitas tim SawitPRO (bila kolomnya diisi) · Penutup
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
      .addItem('3. Generate Weekly Deck', 'wkGenerateWeeklyDeck')
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
  const an = wkAnalyze(t.rows, new Date());
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
    `Pekan laporan: ${wkLabelPekan(an.reportWeek)} (dibanding ${wkLabelPekan(an.prevWeek)})`,
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
  const I = WK_CONFIG.LAYOUT.INSIGHT;
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
    const tCover = tpl.getSlides()[0];
    const tContent = wkFindSlide(tpl, '{{slide_title}}');
    const tClosing = wkFindSlide(tpl, 'Terima Kasih') || wkFindSlide(tpl, 'Thank You');
    if (!tContent) return wkAlert('Slide master {{slide_title}} tidak ditemukan di template. Jalankan "Siapkan Template SawitPRO" (menu monthly) terlebih dahulu.');

    let file = wkDeckFile();
    const isNew = !file;
    if (isNew) file = wkCreateDeckFile(d.ss, warnings);
    const presId = file.getId();
    const pres = SlidesApp.openById(presId);
    const old = pres.getSlides();

    // 1. Salin slide template lalu isi judul & teks INSIGHT
    const pageIds = [];
    const cover = pres.appendSlide(tCover);
    cover.replaceAllText('MONTHLY REPORT KEBUNPRO', 'WEEKLY REPORT KEBUNPRO');
    ['{{TITLE}}', '{{title}}'].forEach(p => cover.replaceAllText(p, 'Aktivitas Pelanggan KebunPRO'));
    ['{{PERIOD}}', '{{period}}'].forEach(p => cover.replaceAllText(p, `Pekan ${wkLabelPekan(an.reportWeek)}`));
    cover.replaceAllText('Lokasi:', 'Cakupan:');
    cover.replaceAllText('{{location}}', `${an.total} kebun pelanggan · internal SawitPRO`);
    pageIds.push(cover.getObjectId());

    const specs = wkPlanSlides(an);
    specs.forEach(sp => {
      const s = pres.appendSlide(tContent);
      s.replaceAllText('{{slide_title}}', sp.title);
      if (sp.insight) s.replaceAllText('{{ai_insight}}', sp.insight); else wkRemoveInsightCard(s);
      if (sp.notes) { try { s.getNotesPage().getSpeakerNotesShape().getText().setText(sp.notes); } catch (e) { /* abaikan */ } }
      sp.pageId = s.getObjectId();
      pageIds.push(sp.pageId);
    });
    if (tClosing) pageIds.push(pres.appendSlide(tClosing).getObjectId());
    old.forEach(s => s.remove());
    pres.saveAndClose();

    // 2. Gambar KPI, grafik, tabel (Slides API) lalu nomor halaman
    specs.forEach(sp => { const b = new WkBatch(sp.pageId); sp.draw(b); b.flush(presId); });
    Slides.Presentations.batchUpdate({ requests: pageIds.map((id, i) => ({ replaceAllText: {
      containsText: { text: '{{page}}', matchCase: true }, replaceText: String(i + 1), pageObjectIds: [id] } })) }, presId);

    wkShowLink(file.getUrl(), `Weekly Report pekan ${wkLabelPekan(an.reportWeek)}`, warnings,
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
/* Rencana slide: judul (jawaban, bukan nama topik), INSIGHT, dan gambar     */
/* ------------------------------------------------------------------------- */

const WK_TITLE_MAX = 47;   // ± satu baris judul 22,5pt di lebar 639pt
function wkTitle(text, fallback) { return String(text).length <= WK_TITLE_MAX ? text : fallback; }

function wkPlanSlides(an) {
  const specs = [];
  const C = WK_CONFIG.COLOR, cur = an.cur, prev = an.prev;
  const labels = an.weeks.map(wkLabelSumbu);
  const dTon = wkPct(cur.ton, prev.ton);
  const perluTL = an.kebun.filter(k => k.status !== WK_STATUS.SEHAT);
  const nama = list => list.slice(0, 3).map(k => k.name).join(', ') + (list.length > 3 ? ` dan ${list.length - 3} lainnya` : '');

  // 1. Ringkasan pekan
  const lead = [
    `Pekan ${wkLabelPekan(an.reportWeek)}: ${wkFmt(cur.aktif)} dari ${an.total} kebun menginput data` +
      (prev.has ? ` (pekan lalu ${wkFmt(prev.aktif)}).` : '.'),
    cur.ton !== null ? `TBS terjual seluruh pelanggan ${wkFmtAuto(cur.ton)} ton` +
      (dTon !== null ? `, ${wkArah(dTon)} pekan lalu (${wkFmtAuto(prev.ton)} ton).` : '.') : '',
    perluTL.length ? `${an.risiko} kebun berisiko dan ${an.perhatian} kebun perlu perhatian, terutama ${nama(perluTL)}.`
      : 'Semua kebun berstatus sehat pekan ini.'
  ].filter(Boolean).join(' ');
  const kpis = [
    { name: 'Kebun aktif input', value: wkFmt(cur.aktif), unit: `dari ${an.total}`,
      note: prev.has ? `Pekan lalu ${wkFmt(prev.aktif)}` : 'Pekan lalu: tidak ada data',
      tone: prev.has && cur.aktif !== prev.aktif ? (cur.aktif > prev.aktif ? 'good' : 'bad') : null },
    cur.userAktif !== null ? { name: 'Akun aktif', value: wkFmt(cur.userAktif), unit: cur.userTerdaftar ? `dari ${wkFmt(cur.userTerdaftar)}` : '',
      note: prev.userAktif !== null ? `Pekan lalu ${wkFmt(prev.userAktif)}` : 'Pekan lalu: -',
      tone: prev.userAktif !== null && cur.userAktif !== prev.userAktif ? (cur.userAktif > prev.userAktif ? 'good' : 'bad') : null }
      : { name: 'Catatan diinput', value: wkFmt(cur.catatan), unit: 'catatan', note: `Pekan lalu ${wkFmt(prev.catatan)}`,
        tone: wkPct(cur.catatan, prev.catatan) === null ? null : (cur.catatan >= prev.catatan ? 'good' : 'bad') },
    { name: 'TBS terjual', value: wkFmtAuto(cur.ton), unit: 'ton', note: dTon !== null ? `${wkArrow(dTon)} vs ${wkFmtAuto(prev.ton)} ton pekan lalu` : 'Pekan lalu: -',
      tone: dTon === null || Math.round(dTon) === 0 ? null : (dTon > 0 ? 'good' : 'bad') },
    { name: 'Pendapatan pelanggan', value: wkFmtRp(cur.pendapatan).replace(/ (juta|miliar)$/, ''), unit: (wkFmtRp(cur.pendapatan).match(/(juta|miliar)$/) || [''])[0],
      note: wkPct(cur.pendapatan, prev.pendapatan) !== null ? `${wkArrow(wkPct(cur.pendapatan, prev.pendapatan))} vs ${wkFmtRp(prev.pendapatan)}` : 'Pekan lalu: -',
      tone: wkPct(cur.pendapatan, prev.pendapatan) === null ? null : (cur.pendapatan >= prev.pendapatan ? 'good' : 'bad') },
    { name: 'Janjang tanpa berat', value: cur.noweightPct === null ? '-' : wkFmt(cur.noweightPct, 1), unit: '%',
      note: prev.noweightPct !== null ? `Pekan lalu ${wkFmt(prev.noweightPct, 1)}% · batas ${WK_CONFIG.THRESHOLDS.NOWEIGHT_PCT}%` : `Batas wajar ${WK_CONFIG.THRESHOLDS.NOWEIGHT_PCT}%`,
      tone: cur.noweightPct === null ? null : (cur.noweightPct > WK_CONFIG.THRESHOLDS.NOWEIGHT_PCT ? 'bad' : 'good') },
    { name: 'Perlu tindak lanjut', value: wkFmt(perluTL.length), unit: 'kebun',
      note: `${an.risiko} berisiko (pekan lalu ${an.prevRisiko}) · ${an.perhatian} perlu perhatian`,
      tone: an.risiko > an.prevRisiko ? 'bad' : (an.risiko < an.prevRisiko ? 'good' : null) }
  ];
  specs.push({
    title: wkTitle(an.risiko ? `${an.risiko} kebun berisiko, ${wkFmt(cur.aktif)} dari ${an.total} kebun aktif`
      : `${wkFmt(cur.aktif)} dari ${an.total} kebun aktif, TBS ${dTon === null ? 'tercatat' : wkArahPendek(dTon)}`,
      'Ringkasan pekan ini'),
    notes: lead,
    draw: b => wkDrawKpiCards(b, kpis, wkDrawLead(b, lead, WK_CONFIG.LAYOUT.BODY_TOP) + 12)
  });

  // 2. Tren TBS
  const tons = an.portfolio.map(p => p.ton);
  const withTon = an.portfolio.filter(p => p.ton !== null);
  const avgTon = withTon.length ? wkSum(withTon.map(p => p.ton)) / withTon.length : null;
  const best = withTon.slice().sort((a, b) => b.ton - a.ton)[0];
  specs.push({
    title: wkTitle(cur.ton === null ? 'TBS terjual belum tercatat pekan ini'
      : `TBS pelanggan ${wkFmtAuto(cur.ton)} ton${dTon !== null ? `, ${wkArahPendek(dTon)}` : ''}`,
      'Tren TBS terjual pekan per pekan'),
    insight: [
      cur.ton !== null ? `TBS terjual pekan ini ${wkFmtAuto(cur.ton)} ton${dTon !== null ? `, ${wkArah(dTon)} pekan lalu` : ''}.` : 'TBS terjual pekan ini belum tercatat.',
      avgTon !== null ? `Rata-rata ${withTon.length} pekan ${wkFmtAuto(avgTon)} ton; tren ${an.trendTon.dir}.` : '',
      best ? `Pekan tertinggi ${wkLabelPekan(best.week)} (${wkFmtAuto(best.ton)} ton).` : ''
    ].filter(Boolean).join(' '),
    draw: b => wkDrawBarChart(b, labels, tons, { caption: 'TBS terjual semua kebun (ton) per pekan, label = Senin awal pekan' })
  });

  // 3. Tren keaktifan
  const aktifs = an.portfolio.map(p => p.aktif);
  const turunAktif = an.kebun.filter(k => k.prev && k.prev.aktif && !(k.cur && k.cur.aktif));
  const naikAktif = an.kebun.filter(k => k.cur && k.cur.aktif && !(k.prev && k.prev.aktif));
  specs.push({
    title: wkTitle(`${wkFmt(cur.aktif)} dari ${an.total} kebun aktif input pekan ini`, 'Tren keaktifan input kebun'),
    insight: [
      `Kebun yang menginput pekan ini ${wkFmt(cur.aktif)}${prev.has ? `, pekan lalu ${wkFmt(prev.aktif)}` : ''}; tren ${an.trendAktif.dir}.`,
      turunAktif.length ? `Berhenti input pekan ini: ${nama(turunAktif)}.` : '',
      naikAktif.length ? `Kembali/mulai input: ${nama(naikAktif)}.` : '',
      cur.userAktif !== null ? `Akun aktif ${wkFmt(cur.userAktif)}${cur.userTerdaftar ? ` dari ${wkFmt(cur.userTerdaftar)}` : ''}.` : ''
    ].filter(Boolean).join(' '),
    draw: b => wkDrawBarChart(b, labels, aktifs, { caption: 'Jumlah kebun yang menginput data per pekan', labelFmt: v => wkFmt(v, 0) })
  });

  // 4. Keaktifan per kebun (berisiko & kurang aktif di atas)
  const rank = { [WK_STATUS.RISIKO]: 0, [WK_STATUS.PERHATIAN]: 1, [WK_STATUS.SEHAT]: 2 };
  const byRisk = an.kebun.slice().sort((a, b) => rank[a.status] - rank[b.status] ||
    ((a.cur && a.cur.hari) || 0) - ((b.cur && b.cur.hari) || 0) || a.name.localeCompare(b.name));
  const hariTxt = m => (!m ? 'tidak ada' : (m.hari !== null && m.hari !== undefined ? `${wkFmt(m.hari)} hari` : (m.aktif ? 'aktif' : '0 hari')));
  const akunTxt = m => (m && m.userTerdaftar ? `${wkFmt(m.userAktif)}/${wkFmt(m.userTerdaftar)}` : (m && m.userAktif !== null && m.userAktif !== undefined ? wkFmt(m.userAktif) : '-'));
  const tanpaInput = an.kebun.filter(k => !(k.cur && k.cur.aktif)).length;
  wkPaged(byRisk, WK_CONFIG.ROWS_PER_TABLE).forEach((page, i, all) => specs.push({
    title: wkTitle(`${tanpaInput ? `${tanpaInput} kebun tanpa input pekan ini` : 'Semua kebun menginput pekan ini'}${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}`, 'Keaktifan input per kebun'),
    draw: b => wkDrawFullTable(b, [['Kebun', 'Hari input\npekan ini', 'Hari input\npekan lalu', 'Akun aktif\n/terdaftar', 'Input\nterakhir', 'Tren hari\ninput', 'Status']]
      .concat(page.map(k => [k.name, hariTxt(k.cur), hariTxt(k.prev), akunTxt(k.cur), wkTglPendek(k.lastInput), k.trendHari.dir, k.status])),
      { colWidths: [3.2, 1.3, 1.3, 1.3, 1.2, 1.2, 1.6], numCols: [1, 2, 3], cellColor: (r, c, t) => (c === 6 ? wkStatusColor(t) : null) })
  }));

  // 5. Kinerja per kebun (TBS terbesar di atas)
  const byTon = an.kebun.slice().sort((a, b) => ((b.cur && b.cur.ton) || 0) - ((a.cur && a.cur.ton) || 0) || a.name.localeCompare(b.name));
  const tbsTurun = an.kebun.filter(k => k.findings.some(f => f.code === 'tbs_turun'));
  const pctCell = (v, bad) => (v === null || v === undefined ? '-' : `${wkFmt(v, 0)}%${v > bad ? ' ⚠' : ''}`);
  wkPaged(byTon, WK_CONFIG.ROWS_PER_TABLE).forEach((page, i, all) => specs.push({
    title: wkTitle(`${tbsTurun.length ? `${tbsTurun.length} kebun TBS turun >${WK_CONFIG.THRESHOLDS.TBS_TURUN_PCT}%` : 'Tidak ada kebun dengan TBS turun tajam'}${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}`, 'Kinerja produksi per kebun'),
    draw: b => wkDrawFullTable(b, [['Kebun', 'TBS terjual\nton', 'vs pekan\nlalu', 'BJR\nkg', 'Tanpa berat\n% jjg terjual', 'Belum terjual\n% jjg dipanen', 'Pendapatan', 'Tren TBS\n' + an.weeks.length + ' pekan']]
      .concat(page.map(k => {
        const c = k.cur || {}, p = k.prev || {};
        return [k.name, wkFmtAuto(c.ton), wkArrow(wkPct(c.ton, p.ton)), c.bjr ? wkFmt(c.bjr, 1) : '-',
          pctCell(c.noweightPct, WK_CONFIG.THRESHOLDS.NOWEIGHT_PCT), pctCell(c.lossPct, WK_CONFIG.THRESHOLDS.FLOW_LOSS_PCT),
          wkFmtRp(c.pendapatan), k.trendTon.dir];
      })),
      { colWidths: [2.6, 1.2, 1.1, 0.9, 1.4, 1.4, 1.6, 1.2], numCols: [1, 2, 3, 4, 5, 6],
        cellColor: (r, c, t) => ((c === 4 || c === 5) && /⚠/.test(t) ? C.DANGER : (c === 7 ? (t === 'naik' ? C.GREEN : t === 'turun' ? C.DANGER : null) : null)) })
  }));

  // 6. Kebun perlu tindak lanjut
  const tl = byRisk.filter(k => k.status !== WK_STATUS.SEHAT);
  if (!tl.length) {
    specs.push({ title: 'Semua kebun sehat, tidak ada tindak lanjut khusus',
      draw: b => wkDrawLead(b, 'Tidak ada kebun yang berisiko atau perlu perhatian pada pekan ini. Pendampingan rutin tetap berjalan sesuai jadwal.', WK_CONFIG.LAYOUT.BODY_TOP) });
  } else {
    wkPaged(tl, WK_CONFIG.ROWS_PER_FOLLOWUP).forEach((page, i, all) => specs.push({
      title: wkTitle(`${tl.length} kebun perlu tindak lanjut pekan ini${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}`, 'Kebun perlu tindak lanjut'),
      notes: page.map(k => `${k.name} (${k.status}): ${k.findings.map(f => f.text).join('; ')}. Tindak lanjut: ${k.tindak}.`).join('\n'),
      draw: b => wkDrawFullTable(b, [['Kebun', 'Status', 'Temuan pekan ini', 'Tindak lanjut · PIC']]
        .concat(page.map(k => [k.name, k.status, k.findings.slice(0, 2).map(f => f.text).join('; ') + (k.findings.length > 2 ? ` (+${k.findings.length - 2})` : ''), k.tindak])),
        { colWidths: [2, 1.3, 4, 3.6], fontSize: WK_CONFIG.TYPE.TABLE_CELL_MIN, rowHeight: 34, cellColor: (r, c, t) => (c === 1 ? wkStatusColor(t) : null) })
    }));
  }

  // 7. Aktivitas tim SawitPRO (hanya bila kolom opsional diisi)
  const timRows = an.kebun.filter(k => [k.curRec, k.prevRec].some(r => r && (r.kunjungan_pendampingan || r.tiket_dibuka || r.tiket_selesai || r.catatan_cs)));
  if (timRows.length) {
    const sumTxt = (a, b) => `${wkFmt(a || 0)} (pekan lalu ${wkFmt(b || 0)})`;
    const timLead = `Kunjungan/pendampingan ${sumTxt(cur.kunjungan, prev.kunjungan)}; tiket baru ${sumTxt(cur.tiketDibuka, prev.tiketDibuka)}; tiket selesai ${sumTxt(cur.tiketSelesai, prev.tiketSelesai)}.`;
    wkPaged(timRows, WK_CONFIG.ROWS_PER_TABLE - 2).forEach((page, i, all) => specs.push({
      title: wkTitle(`${wkFmt(cur.kunjungan || 0)} pendampingan, ${wkFmt(cur.tiketSelesai || 0)} tiket selesai${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}`, 'Aktivitas tim SawitPRO pekan ini'),
      draw: b => {
        const top = wkDrawLead(b, timLead, WK_CONFIG.LAYOUT.BODY_TOP) + 10;
        const L = WK_CONFIG.LAYOUT;
        b.table(L.MARGIN, top, L.RIGHT - L.MARGIN, [['Kebun', 'Kunjungan', 'Tiket baru', 'Tiket selesai', 'Catatan CS']]
          .concat(page.map(k => { const r = k.curRec || {}; return [k.name, wkFmt(r.kunjungan_pendampingan || 0), wkFmt(r.tiket_dibuka || 0), wkFmt(r.tiket_selesai || 0), r.catatan_cs || '-']; })),
          { colWidths: [2.2, 1, 1, 1, 4.8], numCols: [1, 2, 3], fontSize: WK_CONFIG.TYPE.TABLE_CELL_MIN });
      }
    }));
  }
  return specs;
}

function wkPaged(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [[]];
}
