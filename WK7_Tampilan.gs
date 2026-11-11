/**
 * File WK7: Tampilan.gs
 * Tampilan dashboard weekly (gaya "Weekly Review"): bingkai dari slide 1 deck (logo, badge FOR INTERNAL USE ONLY,
 * kotak periode, pita hijau bawah), kartu KPI beraksen warna, panel bertajuk, grafik WAU per aplikasi dengan pekan
 * laporan disorot, panel observasi (AI insight), dan rencana tindak lanjut bernomor dengan chip PIC.
 *
 * Posisi dalam pt (slide 720 × 405), diukur dari slide bingkai.
 */

const WK_UI = {
  // Area bebas di dalam bingkai: di bawah garis judul, di atas pita hijau bawah
  FRAME: { left: 28, right: 699, titleTop: 54, top: 77, bottom: 367, period: { left: 524, top: 56, width: 175, height: 13 } },
  COL_SPLIT: 452,              // kolom kiri (KPI + panel) s.d. x ini; kolom kanan (observasi / tindak lanjut) sesudahnya
  GAP: 8,
  COLOR: {
    TEXT: '#1f2937', MUTED: '#6b7280', BORDER: '#e3e7df', CARD: '#ffffff',
    HEAD: '#2f5d1f',           // header panel gelap (Observasi, Rencana tindak lanjut)
    ACCENT: '#e8b400',         // aksen kuning di judul panel & kotak sorotan
    SOFT: '#eef4ea',           // latar sorotan (sama dengan kotak periode bingkai)
    WEEK: '#f0f6ea',           // latar kolom pekan laporan di grafik
    GOOD: '#15803d', BAD: '#dc2626', WARN: '#d97706', NEUTRAL: '#6b7280',
    SOFT_BAD: '#fdecec', SOFT_WARN: '#fdf1e2', SOFT_GOOD: '#e8f5ec',
    GRID: '#e5e7eb'
  },
  // Warna seri: aksen kartu KPI dan grafik per aplikasi (tua = pekan laporan, muda = pekan sebelumnya)
  SERIES: [
    { dark: '#2563eb', light: '#a9c2f7' },   // biru   – KebunPRO App / indikator 1
    { dark: '#c2410c', light: '#f2b394' },   // oranye – TimPRO Mandor / indikator 2
    { dark: '#374151', light: '#b8bec8' },   // gelap  – Web Admin / indikator 3
    { dark: '#d69e00', light: '#f1d98a' }    // kuning – indikator 4
  ],
  // Warna grafik produksi: tonase TBS (hijau) dan luas dipanen (kuning tua)
  PROD: [
    { dark: '#15803d', light: '#a7d7b5' },
    { dark: '#b7791f', light: '#ecd39c' }
  ]
};

/* ------------------------------------------------------------------------- */
/* Bingkai, judul, periode                                                   */
/* ------------------------------------------------------------------------- */

/** Bingkai cadangan bila deck belum punya slide bingkai: garis judul, kotak periode, pita hijau bawah. */
function wkUiFallbackFrame(b) {
  const F = WK_UI.FRAME, C = WK_UI.COLOR;
  b.line(F.left, 51, F.right, 51, WK_CONFIG.COLOR.GREEN, 0.75);
  b.rect(F.period.left, F.period.top, F.period.width, F.period.height, { round: true, fill: C.SOFT });
  b.rect(16, 375, 689, 18, { round: true, fill: WK_CONFIG.COLOR.GREEN });
  b.text('Materi Milik SawitPRO · Dilarang mempergunakan dan menyebarkan isi materi tanpa izin dari SawitPRO', 30, 375, 660, 18,
    { size: 7.9, color: '#ffffff', weight: WK_CONFIG.WEIGHT.STRONG, valign: 'MIDDLE' });
}

/** Judul slide (kiri) dan periode di kotak kanan atas: "PEKAN INI 4–10 Nov vs 28 Okt–3 Nov". */
function wkUiHeader(b, title, an) {
  const F = WK_UI.FRAME, C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT;
  b.text(title, F.left, F.titleTop, F.period.left - F.left - 10, 18, { size: 15, weight: W.HEAVY, color: C.TEXT, valign: 'MIDDLE' });
  const P = F.period;
  b.text('', P.left, P.top, P.width, P.height, { align: 'CENTER', valign: 'MIDDLE', segs: [
    { text: 'PEKAN INI  ', size: 7.2, weight: W.HEAVY, color: WK_CONFIG.COLOR.GREEN },
    { text: wkLabelPekanPendek(an.reportWeek, an.endDate) + (an.reportDays < 7 ? '*' : ''), size: 7.6, weight: W.HEAVY, color: C.TEXT },
    { text: '  vs  ', size: 7.2, weight: W.STRONG, color: C.MUTED },
    { text: wkLabelPekanPendek(an.prevWeek), size: 7.6, weight: W.HEAVY, color: C.TEXT }] });
}

/** "4–10 Nov" atau "28 Okt–3 Nov" (tanpa tahun); endDate opsional untuk pekan berjalan. */
function wkLabelPekanPendek(key, endDate) {
  const a = wkFromKey(key), e = endDate || wkAddDays(a, 6);
  return a.getMonth() === e.getMonth() ? `${a.getDate()}–${e.getDate()} ${WK_BULAN[e.getMonth()]}`
    : `${a.getDate()} ${WK_BULAN[a.getMonth()]}–${e.getDate()} ${WK_BULAN[e.getMonth()]}`;
}

/** Nama ringkas untuk tampilan padat (daftar, rencana): tanpa awalan "Business Farm Estate". Nama lengkap tetap di notes. */
function wkShortName(name) { return String(name || '').replace(/^\s*business\s+farm\s+estate\s+/i, '').trim() || String(name || ''); }

/** Potong teks agar muat satu baris selebar width (pt), diberi "…". */
function wkFitLine(text, size, width, heavy) {
  let t = String(text || '');
  if (wkEstWidth(t, size, heavy) <= width) return t;
  while (t.length > 1 && wkEstWidth(t + '…', size, heavy) > width) t = t.slice(0, -1);
  return t.replace(/[\s·,;:-]+$/, '') + '…';
}

/* ------------------------------------------------------------------------- */
/* Kartu KPI & panel                                                         */
/* ------------------------------------------------------------------------- */

function wkUiDeltaColor(k) {
  const C = WK_UI.COLOR;
  if (!k.delta || !k.delta.dir) return C.NEUTRAL;
  return (k.delta.dir > 0) !== !!k.goodDown ? C.GOOD : C.BAD;
}

/**
 * Baris kartu KPI: aksen warna di kiri, LABEL kecil, angka besar + satuan, perubahan vs pekan lalu (berwarna)
 * dan angka pekan lalu. kpis: hasil wkBuildKpis(); area: {left, top, width, height}
 */
function wkUiKpiRow(b, kpis, area) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT, gap = WK_UI.GAP, n = kpis.length;
  const w = (area.width - gap * (n - 1)) / n, P = 9, inner = w - P - 6;
  kpis.forEach((k, i) => {
    const l = area.left + i * (w + gap), t = area.top, h = area.height;
    const accent = (WK_UI.SERIES[k.colorIdx !== undefined ? k.colorIdx : i] || WK_UI.SERIES[0]).dark;
    b.rect(l, t, w, h, { round: true, fill: C.CARD, border: C.BORDER });
    b.rect(l, t + 5, 3, h - 10, { fill: accent });
    b.text(String(k.name).toUpperCase(), l + P, t + 5, inner, 10, { size: 6.8, weight: W.HEAVY, color: C.MUTED });
    const unit = k.unit === '%' ? '%' : (k.unit ? ' ' + k.unit : '');
    const vs = [19, 16, 13].find(sz => wkEstWidth(k.value, sz, true) + wkEstWidth(unit, 8.4, true) <= inner) || 13;
    b.text('', l + P, t + 15, inner, 21, { valign: 'BOTTOM', segs: [
      { text: String(k.value), size: vs, weight: W.HEAVY, color: C.TEXT },
      { text: unit, size: 8.4, weight: W.STRONG, color: C.MUTED }] });
    b.text('', l + P, t + h - 13, inner, 9, { segs: [
      { text: k.delta.txt, size: 7.4, weight: W.HEAVY, color: wkUiDeltaColor(k) },
      { text: '  ' + String(k.prevTxt || '').replace(/^Pekan lalu\*?/, 'vs'), size: 6.8, weight: W.STRONG, color: C.MUTED }] });
  });
}

/** Panel putih bertajuk: aksen kuning + JUDUL; teks kanan opsional. Mengembalikan area isi {left, top, width, height}. */
function wkUiPanel(b, l, t, w, h, title, right) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT, P = 9;
  b.rect(l, t, w, h, { round: true, fill: C.CARD, border: C.BORDER });
  b.rect(l + P, t + 8, 3, 11, { fill: C.ACCENT });
  b.text(title, l + P + 7, t + 7, w * 0.62, 13, { size: 8.4, weight: W.HEAVY, color: C.TEXT, valign: 'MIDDLE' });
  if (right) b.text(right, l + w * 0.6, t + 7, w * 0.4 - P, 13, { size: 6.8, weight: W.STRONG, color: C.MUTED, align: 'END', valign: 'MIDDLE' });
  return { left: l + P, top: t + 26, width: w - 2 * P, height: h - 26 - P };
}

/** Panel berkepala hijau gelap (Observasi / Rencana tindak lanjut). Mengembalikan area isi. */
function wkUiDarkPanel(b, l, t, w, h, title, tag) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT, P = 9, headH = 20;
  b.rect(l, t, w, h, { round: true, fill: C.CARD, border: C.BORDER });
  b.rect(l, t, w, headH, { fill: C.HEAD });
  b.rect(l, t, 3, headH, { fill: C.ACCENT });
  b.text(title, l + P + 2, t, w * 0.68, headH, { size: 8.4, weight: W.HEAVY, color: '#ffffff', valign: 'MIDDLE' });
  if (tag) b.text(tag, l + w * 0.62, t, w * 0.38 - P, headH, { size: 6.8, weight: W.STRONG, color: '#dfe9d6', align: 'END', valign: 'MIDDLE' });
  return { left: l + P, top: t + headH + 8, width: w - 2 * P, height: h - headH - 8 - P };
}

/* ------------------------------------------------------------------------- */
/* Grafik tren per seri (WAU per aplikasi)                                   */
/* ------------------------------------------------------------------------- */

/**
 * Grafik batang kecil satu seri: nama berpenanda warna, angka pekan ini + perubahan, batang 8 pekan (pekan laporan
 * berwarna tua di atas latar sorot), angka pekan pertama & terakhir, label pekan pertama & terakhir.
 */
function wkUiSeriesChart(b, k, labels, color, l, t, w, h) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT;
  b.rect(l, t + 3, 7, 7, { round: true, fill: color.dark });
  b.text(k.short || k.name, l + 11, t, w - 11, 12, { size: 8, weight: W.HEAVY, color: C.TEXT, valign: 'MIDDLE' });
  b.text('', l, t + 13, w, 18, { valign: 'BOTTOM', segs: [
    { text: String(k.value), size: 15, weight: W.HEAVY, color: C.TEXT },
    { text: k.unit === '%' ? '%' : (k.unit ? ' ' + k.unit : ''), size: 7.6, weight: W.STRONG, color: C.MUTED },
    { text: '  ' + k.delta.txt, size: 7.6, weight: W.HEAVY, color: wkUiDeltaColor(k) }] });
  // SEMUA titik data diberi label: angka di atas setiap batang, tanggal di bawah setiap batang
  const labelH = 9, bottomPad = 17, top = t + 44 + labelH, ch = h - 44 - labelH - bottomPad, yb = top + ch;
  const vals = k.spark.map(v => (v === null || v === undefined || !isFinite(v) ? null : v));
  const max = Math.max.apply(null, vals.filter(v => v !== null).concat([0])) || 1;
  const step = w / vals.length, bw = step * 0.62;
  // ukuran huruf angka mengikuti lebar kolom agar angka tidak saling menimpa
  const longest = vals.reduce((a, v) => Math.max(a, v === null ? 1 : String(k.fmt(v)).length), 1);
  const vSize = Math.max(4.8, Math.min(6.6, (step + 2) / (longest * WK_CONFIG.CHAR_W.HEAVY)));
  b.rect(l + step * (vals.length - 1), top - labelH - 3, step, ch + labelH + 3, { fill: C.WEEK });   // sorot pekan laporan
  b.line(l, yb, l + w, yb, C.GRID, 0.75);
  let prevMon = null;
  vals.forEach((v, i) => {
    const last = i === vals.length - 1, x = l + step * i;
    const bh = v !== null && v > 0 ? Math.max(ch * v / max, 0.8) : 0;
    if (bh) b.rect(x + (step - bw) / 2, yb - bh, bw, bh, { fill: last ? color.dark : color.light });
    b.text(v === null ? '–' : k.fmt(v), x - 3, yb - bh - labelH, step + 6, labelH - 1, { size: vSize, align: 'CENTER', valign: 'BOTTOM',
      weight: last ? W.HEAVY : W.STRONG, color: v === null ? C.MUTED : (last ? color.dark : C.TEXT) });
    // tanggal: hari di setiap batang, nama bulan hanya di batang pertama & saat bulan berganti
    const parts = String(labels[i] || '').split(' '), mon = (parts[1] || '').replace('*', '');
    const day = parts[0] + (String(labels[i]).indexOf('*') >= 0 ? '*' : '');
    b.text(mon && mon !== prevMon ? `${day}\n${mon}` : day, x - 3, yb + 1.5, step + 6, 15, { size: 5.8, align: 'CENTER', lineSpacing: 95,
      weight: last ? W.HEAVY : W.BODY, color: last ? C.TEXT : C.MUTED });
    prevMon = mon;
  });
}

/* ------------------------------------------------------------------------- */
/* Observasi (insight) & rencana tindak lanjut                               */
/* ------------------------------------------------------------------------- */

/** Pecah insight menjadi kalimat; kalimat pertama = sorotan, sisanya = butir. */
function wkUiSentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s+(?=[A-Z0-9*"'(])/).filter(Boolean);
}

/** Panel observasi: kotak sorotan (kalimat pertama, tebal) lalu butir untuk kalimat berikutnya. */
function wkUiObservations(b, text, l, t, w, h, tag) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT;
  const A = wkUiDarkPanel(b, l, t, w, h, 'OBSERVASI UTAMA', tag);
  const sents = wkUiSentences(text);
  const head = sents.shift() || '-';
  const headH = wkEstLines(wkStripBold(head), 8.8, A.width - 14, true) * 8.8 * 1.3 + 10;
  b.rect(A.left, A.top, A.width, headH, { fill: C.SOFT });
  b.rect(A.left, A.top, 3, headH, { fill: C.ACCENT });
  b.text('', A.left + 8, A.top + 5, A.width - 14, headH - 10, { lineSpacing: 120, valign: 'MIDDLE',
    segs: wkBoldSegs(head, 8.8, C.TEXT).map(s => Object.assign({}, s, { color: s.weight >= W.HEAVY ? WK_CONFIG.COLOR.GREEN : C.TEXT, weight: W.HEAVY })) });
  let y = A.top + headH + 8;
  sents.forEach(snt => {
    const lines = wkEstLines(wkStripBold(snt), 8.4, A.width - 12);
    const hh = lines * 8.4 * 1.3;
    if (y + hh > A.top + A.height) return;
    b.rect(A.left + 2, y + 4, 4, 4, { round: true, fill: WK_CONFIG.COLOR.GREEN });
    b.text('', A.left + 12, y, A.width - 12, hh, { lineSpacing: 120, segs: wkBoldSegs(snt, 8.4, C.TEXT) });
    y += hh + 6;
  });
}

/**
 * Rencana tindak lanjut bernomor: nama bisnis + temuan utama, tindakan, chip PIC dan target.
 * items: [{title, finding, action, pic, target, urgent}]; sisa yang tidak muat ditulis "+N bisnis lain".
 */
function wkUiActions(b, items, l, t, w, h, more) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT;
  const A = wkUiDarkPanel(b, l, t, w, h, 'RENCANA TINDAK LANJUT / PIC', items.length ? `${items.length + (more || 0)} bisnis` : '');
  if (!items.length) {
    b.text('Tidak ada bisnis yang berisiko atau perlu perhatian pekan ini.', A.left, A.top, A.width, 24, { size: 8.4, color: C.MUTED });
    return;
  }
  let y = A.top, shown = 0;
  const tw = A.width - 22;
  items.some(it => {
    const title = wkFitLine(wkShortName(it.title), 7.8, tw * 0.55, true);
    const t1 = `${title} — ${it.finding}`;
    const h1 = Math.min(2, wkEstLines(t1, 7.8, tw, true)) * 7.8 * 1.25, h2 = Math.min(2, wkEstLines(it.action, 7.6, tw)) * 7.6 * 1.25;
    const ih = h1 + 2 + h2 + 3 + 10;
    if (y + ih > A.top + A.height - (shown + 1 < items.length || more ? 10 : 0)) return true;
    b.rect(A.left, y, 15, 15, { round: true, fill: it.urgent ? C.BAD : C.HEAD });
    b.text(String(shown + 1), A.left, y, 15, 15, { size: 7.6, weight: W.HEAVY, color: '#ffffff', align: 'CENTER', valign: 'MIDDLE' });
    b.text('', A.left + 22, y, tw, h1, { lineSpacing: 115, segs: [
      { text: title, size: 7.8, weight: W.HEAVY, color: C.TEXT }, { text: ' — ' + it.finding, size: 7.8, weight: W.STRONG, color: C.TEXT }] });
    b.text(it.action, A.left + 22, y + h1 + 2, tw, h2, { size: 7.6, color: C.MUTED, lineSpacing: 115 });
    const cy = y + h1 + 2 + h2 + 3, picTxt = 'PIC · ' + it.pic;
    const pw = wkEstWidth(picTxt, 6.8, true) + 10;
    b.rect(A.left + 22, cy, pw, 10, { round: true, fill: C.SOFT });
    b.text(picTxt, A.left + 22, cy, pw, 10, { size: 6.8, weight: W.HEAVY, color: C.HEAD, align: 'CENTER', valign: 'MIDDLE' });
    const tgt = it.target, tw2 = wkEstWidth(tgt, 6.8, true) + 10;
    b.rect(A.left + 22 + pw + 4, cy, tw2, 10, { round: true, fill: it.urgent ? C.SOFT_BAD : C.SOFT_WARN });
    b.text(tgt, A.left + 22 + pw + 4, cy, tw2, 10, { size: 6.8, weight: W.HEAVY, color: it.urgent ? C.BAD : C.WARN, align: 'CENTER', valign: 'MIDDLE' });
    y += ih + 5;
    shown++;
    return false;
  });
  const rest = items.length - shown + (more || 0);
  if (rest > 0) b.text(`+${rest} bisnis lain: rincian di speaker notes`, A.left, A.top + A.height - 9, A.width, 9, { size: 6.8, color: C.MUTED });
  return shown;
}

/* ------------------------------------------------------------------------- */
/* Status pelanggan & daftar kebun                                           */
/* ------------------------------------------------------------------------- */

/** Batang horizontal status pelanggan (berisiko, perlu perhatian, sehat) dengan jumlah dan perubahan vs pekan lalu. */
function wkUiStatusBars(b, an, A) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT;
  const sehat = an.total - an.risiko - an.perhatian;
  const prevSehat = an.prev.kebun !== null && an.prev.kebun !== undefined ? an.prev.kebun - an.prevRisiko - an.prevPerhatian : null;
  const rows = [
    { name: 'Berisiko', v: an.risiko, p: an.prevRisiko, color: C.BAD, soft: C.SOFT_BAD, goodDown: true, note: 'tidak input ≥2 pekan / ≥14 hari' },
    { name: 'Perlu perhatian', v: an.perhatian, p: an.prevPerhatian, color: C.WARN, soft: C.SOFT_WARN, goodDown: true, note: 'ada temuan, belum kritis' },
    { name: 'Sehat', v: sehat, p: prevSehat, color: C.GOOD, soft: C.SOFT_GOOD, goodDown: false, note: 'tanpa temuan' }
  ];
  const labelW = 92, valW = 70, barW = A.width - labelW - valW - 8, rowH = Math.min(26, A.height / rows.length);
  rows.forEach((r, i) => {
    const y = A.top + i * rowH, bh = Math.min(13, rowH - 8);
    b.text('', A.left, y, labelW, bh + 8, { valign: 'MIDDLE', lineSpacing: 110, segs: [
      { text: r.name, size: 8, weight: W.HEAVY, color: C.TEXT }, { text: '\n' + r.note, size: 6.2, weight: W.STRONG, color: C.MUTED }] });
    b.rect(A.left + labelW, y + 4, barW, bh, { round: true, fill: r.soft });
    if (r.v > 0) b.rect(A.left + labelW, y + 4, Math.max(bh, barW * r.v / Math.max(an.total, 1)), bh, { round: true, fill: r.color });
    const d = wkDelta(r.v, r.p);
    b.text('', A.left + labelW + barW + 8, y, valW, bh + 8, { valign: 'MIDDLE', segs: [
      { text: `${r.v} kebun`, size: 8.4, weight: W.HEAVY, color: C.TEXT },
      { text: `\n${d.txt}`, size: 6.8, weight: W.HEAVY, color: wkUiDeltaColor({ delta: d, goodDown: r.goodDown }) }] });
  });
}

/** Status pelanggan ringkas: 3 baris (titik warna, nama, jumlah kebun, perubahan vs pekan lalu). */
function wkUiStatusCompact(b, an, A) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT;
  const sehat = an.total - an.risiko - an.perhatian;
  const prevSehat = an.prev.kebun !== null && an.prev.kebun !== undefined ? an.prev.kebun - an.prevRisiko - an.prevPerhatian : null;
  const rows = [
    { name: 'Berisiko', v: an.risiko, p: an.prevRisiko, color: C.BAD, goodDown: true },
    { name: 'Perlu perhatian', v: an.perhatian, p: an.prevPerhatian, color: C.WARN, goodDown: true },
    { name: 'Sehat', v: sehat, p: prevSehat, color: C.GOOD, goodDown: false }
  ];
  const rh = A.height / rows.length;
  rows.forEach((r, i) => {
    const y = A.top + i * rh, d = wkDelta(r.v, r.p);
    b.rect(A.left, y + rh / 2 - 3, 6, 6, { round: true, fill: r.color });
    b.text(r.name, A.left + 11, y, A.width * 0.5, rh, { size: 7.8, weight: W.STRONG, color: C.TEXT, valign: 'MIDDLE' });
    b.text('', A.left + A.width * 0.45, y, A.width * 0.55, rh, { align: 'END', valign: 'MIDDLE', segs: [
      { text: `${r.v} kebun`, size: 8.4, weight: W.HEAVY, color: r.color },
      { text: `  ${d.txt}`, size: 6.8, weight: W.HEAVY, color: wkUiDeltaColor({ delta: d, goodDown: r.goodDown }) }] });
    if (i < rows.length - 1) b.line(A.left, y + rh, A.left + A.width, y + rh, C.GRID, 0.5);
  });
}

/** Perubahan pelanggan: kebun baru mulai pekan ini (hijau) dan kebun tanpa aktivitas (merah, dengan input terakhir). */
function wkUiChangeList(b, an, A) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT;
  const groups = [
    { name: 'Mulai pekan ini', color: C.GOOD, items: an.baru.map(k => wkShortName(k.name)) },
    { name: 'Tanpa aktivitas', color: C.BAD, items: an.diam.map(k => wkShortName(k.name) + (k.lastInput ? ` (${wkTglPendek(k.lastInput)})` : '')) }
  ];
  const gh = A.height / 2;
  groups.forEach((g, i) => {
    const y = A.top + i * gh;
    b.text('', A.left, y, A.width, 10, { valign: 'MIDDLE', segs: [
      { text: g.name, size: 7.4, weight: W.HEAVY, color: C.TEXT }, { text: `  ${g.items.length} kebun`, size: 7.4, weight: W.HEAVY, color: g.color }] });
    // nama sebanyak muat (maks. baris tersedia); sisanya "+N lainnya" (rincian di speaker notes)
    const maxLines = Math.max(1, Math.floor((gh - 12) / (7 * 1.25)));
    let shown = g.items.slice(), txt;
    for (;;) {
      const rest = g.items.length - shown.length;
      txt = g.items.length ? shown.join(', ') + (rest ? `${shown.length ? ', ' : ''}+${rest} lainnya` : '') : 'Tidak ada';
      if (!shown.length || wkEstLines(txt, 7, A.width) <= maxLines) break;
      shown.pop();
    }
    b.text(txt, A.left, y + 11, A.width, gh - 12, { size: 7, color: g.items.length ? C.TEXT : C.MUTED, lineSpacing: 115 });
  });
}

/**
 * Segmentasi kebun: satu batang bertumpuk (aktif rutin, kurang aktif, pasif, tidak aktif) berisi jumlah kebun,
 * lalu legenda dengan jumlah dan perubahan vs pekan lalu.
 */
function wkUiSegmentBar(b, an, A) {
  const C = WK_UI.COLOR, W = WK_CONFIG.WEIGHT;
  const cur = an.cur.seg || {}, prev = an.prev.seg || {};
  const total = WK_SEGMENTS.reduce((a, sg) => a + (cur[sg.key] || 0), 0) || 1;
  const barH = 14;
  let x = A.left;
  WK_SEGMENTS.forEach(sg => {
    const v = cur[sg.key] || 0;
    if (!v) return;
    const w = A.width * v / total;
    b.rect(x, A.top, w, barH, { fill: sg.color });
    if (w >= 14) b.text(String(v), x, A.top, w, barH, { size: 7.4, weight: W.HEAVY, color: '#ffffff', align: 'CENTER', valign: 'MIDDLE' });
    x += w;
  });
  const lw = A.width / WK_SEGMENTS.length, ly = A.top + barH + 5;
  WK_SEGMENTS.forEach((sg, i) => {
    const l = A.left + i * lw, d = wkDelta(cur[sg.key] || 0, an.prev.has ? (prev[sg.key] || 0) : null);
    b.rect(l, ly + 3, 6, 6, { round: true, fill: sg.color });
    b.text('', l + 9, ly, lw - 10, 11, { valign: 'MIDDLE', segs: [
      { text: sg.name + ' ', size: 7.2, weight: W.HEAVY, color: C.TEXT },
      { text: String(cur[sg.key] || 0), size: 7.2, weight: W.HEAVY, color: sg.color === '#8fc28f' ? '#4d7c0f' : sg.color },
      { text: '  ' + d.txt, size: 6.4, weight: W.HEAVY, color: wkUiDeltaColor({ delta: d, goodDown: sg.goodDown }) }] });
    b.text(sg.note, l + 9, ly + 10, lw - 10, 9, { size: 6, color: C.MUTED });
  });
}
