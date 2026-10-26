/**
 * File WK4: Gambar.gs
 * Kartu KPI, grafik batang, dan tabel digambar dengan layanan lanjutan "Google Slides API"
 * (1 batchUpdate per slide). Gaya sama dengan deck monthly (design system SawitPRO CBR).
 *
 * WAJIB: Editor Apps Script > Services (+) > Google Slides API > Add (identifier: Slides).
 */

function wkRgb(hex) {
  const h = hex.replace('#', '');
  return { red: parseInt(h.substr(0, 2), 16) / 255, green: parseInt(h.substr(2, 2), 16) / 255, blue: parseInt(h.substr(4, 2), 16) / 255 };
}
function wkPt(v) { return { magnitude: v, unit: 'PT' }; }
function wkSolid(hex) { return { solidFill: { color: { rgbColor: wkRgb(hex) } } }; }
function wkEstWidth(text, size, heavy) { return String(text || '').length * size * (heavy ? WK_CONFIG.CHAR_W.HEAVY : WK_CONFIG.CHAR_W.BODY); }
function wkEstLines(text, size, width, heavy) {
  const perLine = Math.max(1, Math.floor(width / (size * (heavy ? WK_CONFIG.CHAR_W.HEAVY : WK_CONFIG.CHAR_W.BODY))));
  return String(text || '').split('\n').reduce((n, para) => {
    let lines = 1, cur = 0;
    para.split(/\s+/).filter(Boolean).forEach(w => {
      if (cur && cur + 1 + w.length > perLine) { lines++; cur = 0; }
      cur += (cur ? 1 : 0) + w.length;
    });
    return n + lines;
  }, 0);
}

/* ------------------------------------------------------------------------- */
/* Pembangun request batch                                                   */
/* ------------------------------------------------------------------------- */

function WkBatch(pageId) {
  this.page = pageId;
  this.n = 0;
  this.req = [];
}
WkBatch.prototype.id = function () { return `wk_${Utilities.getUuid().replace(/-/g, '').slice(0, 10)}_${this.n++}`; };
WkBatch.prototype.props = function (l, t, w, h) {
  return { pageObjectId: this.page, size: { width: wkPt(Math.max(w, 0.01)), height: wkPt(Math.max(h, 0.01)) },
    transform: { scaleX: 1, scaleY: 1, translateX: l, translateY: t, shearX: 0, shearY: 0, unit: 'PT' } };
};

/** Kotak; o: {round, fill, border} */
WkBatch.prototype.rect = function (l, t, w, h, o) {
  o = o || {};
  if (!(w > 0) || !(h > 0)) return null;
  const id = this.id();
  this.req.push({ createShape: { objectId: id, shapeType: o.round ? 'ROUND_RECTANGLE' : 'RECTANGLE', elementProperties: this.props(l, t, w, h) } });
  const outline = o.border ? { outlineFill: wkSolid(o.border), weight: wkPt(0.75), propertyState: 'RENDERED' } : { propertyState: 'NOT_RENDERED' };
  this.req.push({ updateShapeProperties: { objectId: id,
    shapeProperties: { shapeBackgroundFill: wkSolid(o.fill || WK_CONFIG.COLOR.TINT), outline },
    fields: 'shapeBackgroundFill.solidFill.color,outline' } });
  return id;
};

/**
 * Kotak teks; area teks = (l, t, w, h) rancangan (jarak dalam Google Slides dikompensasi).
 * o: {size, color, weight, align START|CENTER|END, valign TOP|MIDDLE|BOTTOM, lineSpacing, segs:[{text,size,weight,color}]}
 */
WkBatch.prototype.text = function (str, l, t, w, h, o) {
  o = o || {};
  const id = this.id(), I = WK_CONFIG.TEXT_INSET, W = WK_CONFIG.WEIGHT;
  const segs = o.segs || [{ text: String(str === null || str === undefined || str === '' ? ' ' : str) }];
  const txt = segs.map(s => s.text).join('');
  this.req.push({ createShape: { objectId: id, shapeType: 'TEXT_BOX', elementProperties: this.props(l - I.X, t - I.Y, w + 2 * I.X, h + 2 * I.Y) } });
  this.req.push({ insertText: { objectId: id, text: txt } });
  let pos = 0;
  segs.forEach(s => {
    const len = s.text.length;
    if (!len) return;
    this.req.push({ updateTextStyle: { objectId: id, textRange: { type: 'FIXED_RANGE', startIndex: pos, endIndex: pos + len },
      style: { fontSize: wkPt(s.size || o.size || WK_CONFIG.TYPE.CAPTION),
        foregroundColor: { opaqueColor: { rgbColor: wkRgb(s.color || o.color || WK_CONFIG.COLOR.INK) } },
        weightedFontFamily: { fontFamily: WK_CONFIG.FONT, weight: s.weight || o.weight || W.BODY } },
      fields: 'fontSize,foregroundColor,weightedFontFamily' } });
    pos += len;
  });
  this.req.push({ updateParagraphStyle: { objectId: id, textRange: { type: 'ALL' },
    style: { alignment: o.align || 'START', lineSpacing: o.lineSpacing || 100, spaceAbove: wkPt(0), spaceBelow: wkPt(0) },
    fields: 'alignment,lineSpacing,spaceAbove,spaceBelow' } });
  this.req.push({ updateShapeProperties: { objectId: id, shapeProperties: { contentAlignment: o.valign || 'TOP' }, fields: 'contentAlignment' } });
  return id;
};

WkBatch.prototype.line = function (x1, y1, x2, y2, color, weight) {
  const id = this.id();
  this.req.push({ createLine: { objectId: id, lineCategory: 'STRAIGHT',
    elementProperties: this.props(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)) } });
  this.req.push({ updateLineProperties: { objectId: id, lineProperties: { lineFill: wkSolid(color), weight: wkPt(weight || 0.75) },
    fields: 'lineFill.solidFill.color,weight' } });
  return id;
};

/**
 * Tabel DataTable SawitPRO: header putih di hijau, baris berselang tint. data[0] = header.
 * o: {colWidths:[rasio], numCols:[index rata kanan], fontSize, rowHeight, cellColor(r,c,txt) -> warna|null}
 */
WkBatch.prototype.table = function (l, t, w, data, o) {
  o = o || {};
  const C = WK_CONFIG.COLOR, T = WK_CONFIG.TYPE, W = WK_CONFIG.WEIGHT;
  const rows = data.length, cols = data[0].length, rowH = o.rowHeight || 22;
  const id = this.id();
  this.req.push({ createTable: { objectId: id, rows, columns: cols, elementProperties: {
    pageObjectId: this.page, size: { width: wkPt(w), height: wkPt(rowH * rows) },
    transform: { scaleX: 1, scaleY: 1, translateX: l, translateY: t, unit: 'PT' } } } });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const loc = { rowIndex: r, columnIndex: c };
      const txt = String(data[r][c] === '' || data[r][c] === null || data[r][c] === undefined ? '-' : data[r][c]);
      this.req.push({ insertText: { objectId: id, cellLocation: loc, text: txt } });
      if ((o.numCols || []).indexOf(c) >= 0) this.req.push({ updateParagraphStyle: { objectId: id, cellLocation: loc, textRange: { type: 'ALL' },
        style: { alignment: 'END' }, fields: 'alignment' } });
      const custom = r > 0 && o.cellColor ? o.cellColor(r, c, txt) : null;
      const delta = r > 0 && /^[▲▼]/.test(txt) ? (txt[0] === '▲' ? C.GREEN : C.DANGER) : null;
      const color = r === 0 ? C.ON_GREEN : (custom || delta || (c === 0 ? C.INK : C.MUTED));
      const weight = r === 0 ? W.HEAVY : (c === 0 ? W.STRONG : (custom || delta ? W.TITLE : W.BODY));
      this.req.push({ updateTextStyle: { objectId: id, cellLocation: loc, textRange: { type: 'ALL' },
        style: { weightedFontFamily: { fontFamily: WK_CONFIG.FONT, weight },
          fontSize: wkPt(r === 0 ? T.TABLE_HEADER : (o.fontSize || T.TABLE_CELL)),
          foregroundColor: { opaqueColor: { rgbColor: wkRgb(color) } } },
        fields: 'weightedFontFamily,fontSize,foregroundColor' } });
      const nl = txt.indexOf('\n');   // header dua baris: baris kedua keterangan kecil
      if (r === 0 && nl > 0) this.req.push({ updateTextStyle: { objectId: id, cellLocation: loc,
        textRange: { type: 'FIXED_RANGE', startIndex: nl + 1, endIndex: txt.length },
        style: { fontSize: wkPt(T.TABLE_SMALL), weightedFontFamily: { fontFamily: WK_CONFIG.FONT, weight: W.STRONG } },
        fields: 'fontSize,weightedFontFamily' } });
    }
    this.req.push({ updateTableCellProperties: { objectId: id,
      tableRange: { location: { rowIndex: r, columnIndex: 0 }, rowSpan: 1, columnSpan: cols },
      tableCellProperties: { tableCellBackgroundFill: wkSolid(r === 0 ? C.GREEN : (r % 2 === 1 ? C.TINT : C.SURFACE)), contentAlignment: 'MIDDLE' },
      fields: 'tableCellBackgroundFill.solidFill.color,contentAlignment' } });
  }
  this.req.push({ updateTableBorderProperties: { objectId: id,
    tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: rows, columnSpan: cols },
    borderPosition: 'ALL', tableBorderProperties: { tableBorderFill: wkSolid(C.BORDER), weight: wkPt(0.75) },
    fields: 'tableBorderFill.solidFill.color,weight' } });
  if (o.colWidths) {
    const sum = o.colWidths.reduce((a, b) => a + b, 0);
    o.colWidths.forEach((cw, i) => this.req.push({ updateTableColumnProperties: { objectId: id, columnIndices: [i],
      tableColumnProperties: { columnWidth: wkPt(w * cw / sum) }, fields: 'columnWidth' } }));
  }
  this.req.push({ updateTableRowProperties: { objectId: id, rowIndices: [...Array(rows).keys()],
    tableRowProperties: { minRowHeight: wkPt(rowH) }, fields: 'minRowHeight' } });
  return id;
};

WkBatch.prototype.flush = function (presId) {
  for (let i = 0; i < this.req.length; i += 400) {
    Slides.Presentations.batchUpdate({ requests: this.req.slice(i, i + 400) }, presId);
  }
};

/* ------------------------------------------------------------------------- */
/* Komponen                                                                  */
/* ------------------------------------------------------------------------- */

/** Teks dengan **tebal**: dipecah menjadi segmen (angka kunci tebal hijau). */
function wkBoldSegs(text, size, color) {
  const W = WK_CONFIG.WEIGHT;
  return String(text || ' ').split('**').map((part, i) => ({ text: part, size,
    weight: i % 2 ? W.HEAVY : W.BODY, color: i % 2 ? WK_CONFIG.COLOR.GREEN : color })).filter(x => x.text);
}
function wkStripBold(text) { return String(text || '').replace(/\*\*/g, ''); }

/** Baris tanggal di bawah garis judul: pekan laporan vs pekan pembanding (dipasang di setiap slide). */
function wkDrawPeriod(b, text) {
  const L = WK_CONFIG.LAYOUT, T = WK_CONFIG.TYPE;
  b.text(text, L.MARGIN, L.PERIOD_Y, L.RIGHT - L.MARGIN, 12, { size: T.CAPTION, weight: WK_CONFIG.WEIGHT.HEAVY, color: WK_CONFIG.COLOR.GREEN });
}

/** Kartu INSIGHT (gaya kartu template): label + teks dengan angka kunci tebal. Mengembalikan tinggi kartu. */
function wkDrawInsightCard(b, text, l, t, w, h) {
  const C = WK_CONFIG.COLOR, T = WK_CONFIG.TYPE, P = WK_CONFIG.LAYOUT.INSIGHT.pad;
  const inner = w - 2 * P;
  const textH = wkEstLines(wkStripBold(text), T.BODY, inner) * T.BODY * 1.5;
  const cardH = h || (P + T.CAPTION * 1.3 + 6 + textH + P);
  b.rect(l, t, w, cardH, { round: true, fill: C.TINT, border: C.BORDER });
  b.text('INSIGHT', l + P, t + P, inner, T.CAPTION * 1.3, { size: T.CAPTION, weight: WK_CONFIG.WEIGHT.HEAVY, color: C.GREEN });
  b.text('', l + P, t + P + T.CAPTION * 1.3 + 6, inner, Math.max(textH, cardH - 2 * P - T.CAPTION * 1.3 - 6),
    { segs: wkBoldSegs(text, T.BODY, C.MUTED), lineSpacing: 150 });
  return cardH;
}

/** Grafik batang mini (sparkline) tren pekan per pekan; pekan laporan hijau tua. */
function wkDrawSpark(b, values, l, t, w, h) {
  const C = WK_CONFIG.COLOR;
  const vals = values.map(v => (v === null || v === undefined || !isFinite(v) ? null : v));
  const max = Math.max.apply(null, vals.filter(v => v !== null).concat([0])) || 1;
  const step = w / vals.length, bw = step * 0.62;
  b.line(l, t + h, l + w, t + h, C.BORDER, 0.75);
  vals.forEach((v, i) => {
    if (v === null || v <= 0) return;
    const bh = Math.max(h * v / max, 0.8);
    b.rect(l + step * i + (step - bw) / 2, t + h - bh, bw, bh, { fill: i === vals.length - 1 ? C.GREEN : C.CHART_LIGHT });
  });
}

/** Warna perubahan: naik baik (hijau) kecuali goodDown (mis. % tanpa berat: turun = baik). */
function wkDeltaColor(d, goodDown) {
  const C = WK_CONFIG.COLOR;
  if (!d || !d.dir) return C.INK;
  return (d.dir > 0) !== !!goodDown ? C.GREEN : C.DANGER;
}

/**
 * Kartu KPI: LABEL → angka (+satuan) → % perubahan vs pekan lalu → grafik mini 8 pekan → angka pekan lalu.
 * kpis: [{name, value, unit, delta: wkDelta(), goodDown, prevTxt, spark: [..]}]; area: {left, top, width, height}
 */
function wkDrawKpiCards(b, kpis, area, cols) {
  const C = WK_CONFIG.COLOR, T = WK_CONFIG.TYPE, W = WK_CONFIG.WEIGHT, gap = 8, P = 10;
  const rows = Math.ceil(kpis.length / cols);
  const w = (area.width - gap * (cols - 1)) / cols, h = (area.height - gap * (rows - 1)) / rows, inner = w - 2 * P;
  kpis.forEach((k, i) => {
    const left = area.left + (i % cols) * (w + gap), top = area.top + Math.floor(i / cols) * (h + gap);
    b.rect(left, top, w, h, { round: true, fill: C.TINT, border: C.BORDER });
    let y = top + P;
    b.text(String(k.name).toUpperCase(), left + P, y, inner, 11, { size: T.KPI_LABEL, weight: W.TITLE, color: C.MUTED });
    y += 14;
    const unitW = k.unit ? wkEstWidth(' ' + k.unit, T.KPI_UNIT, true) : 0;
    const vs = [T.KPI_COMPACT, 22, 18, 15].find(sz => wkEstWidth(k.value, sz, true) + unitW <= inner) || 15;
    const segs = [{ text: String(k.value), size: vs, weight: W.HEAVY, color: C.GREEN }];
    if (k.unit) segs.push({ text: ' ' + k.unit, size: T.KPI_UNIT, weight: W.STRONG, color: C.MUTED });
    b.text('', left + P, y, inner, 28, { segs, valign: 'BOTTOM' });
    y += 31;
    b.text('', left + P, y, inner, 13, { segs: [
      { text: k.delta.txt, size: T.BODY, weight: W.HEAVY, color: wkDeltaColor(k.delta, k.goodDown) },
      { text: ' vs pekan lalu', size: T.CAPTION, weight: W.STRONG, color: C.MUTED }] });
    y += 16;
    const sparkH = Math.max(12, top + h - P - 12 - 4 - y);
    wkDrawSpark(b, k.spark, left + P, y, inner, sparkH);
    b.text(k.prevTxt || ' ', left + P, top + h - P - 11, inner, 11, { size: T.CAPTION, color: C.MUTED });
  });
}

/**
 * Grafik kecil tren pekan per pekan (small multiple): judul + % perubahan, batang 8 pekan,
 * nilai pekan laporan di atas batang terakhir, label pekan pertama & terakhir di bawah.
 */
function wkDrawMiniChart(b, m, labels, l, t, w, h) {
  const C = WK_CONFIG.COLOR, T = WK_CONFIG.TYPE, W = WK_CONFIG.WEIGHT;
  b.rect(l, t, w, h, { round: true, fill: C.SURFACE, border: C.BORDER });
  const P = 9, inner = w - 2 * P;
  b.text(m.title, l + P, t + P, inner * 0.62, 12, { size: T.CAPTION, weight: W.HEAVY, color: C.INK });
  b.text(m.delta.txt, l + P + inner * 0.62, t + P, inner * 0.38, 12, { size: T.CAPTION, weight: W.HEAVY, align: 'END',
    color: wkDeltaColor(m.delta, m.goodDown) });
  const chartTop = t + P + 30, chartH = h - P - 30 - 14 - P;
  const vals = m.values.map(v => (v === null || v === undefined || !isFinite(v) ? null : v));
  const max = Math.max.apply(null, vals.filter(v => v !== null).concat([0])) || 1;
  const step = inner / vals.length, bw = step * 0.6, yb = chartTop + chartH;
  b.line(l + P, yb, l + P + inner, yb, C.MUTED, 0.75);
  vals.forEach((v, i) => {
    const last = i === vals.length - 1, x = l + P + step * i;
    if (v !== null && v > 0) {
      const bh = Math.max(chartH * v / max, 0.8);
      b.rect(x + (step - bw) / 2, yb - bh, bw, bh, { fill: last ? C.GREEN : C.CHART_LIGHT });
    }
    // nilai: pekan laporan (tebal) dan pekan pertama sebagai acuan awal tren
    // label rata kiri di batang pertama dan rata kanan di batang terakhir agar tidak keluar dari kartu
    if ((last || i === 0) && v !== null) b.text(m.fmt(v), last ? x + step - 60 : x, yb - (v > 0 ? chartH * v / max : 0) - 13, 60, 11,
      { size: T.CAPTION, weight: last ? W.HEAVY : W.STRONG, color: last ? C.GREEN : C.MUTED, align: last ? 'END' : 'START' });
  });
  b.text(labels[0], l + P, yb + 3, 60, 11, { size: T.CAPTION, color: C.MUTED });
  b.text(labels[labels.length - 1], l + P + inner - 60, yb + 3, 60, 11, { size: T.CAPTION, weight: W.HEAVY, color: C.INK, align: 'END' });
}

/** Warna kata status (sehat hijau, perlu perhatian oranye, berisiko merah). */
function wkStatusColor(txt) {
  const C = WK_CONFIG.COLOR;
  if (txt === WK_STATUS.RISIKO) return C.DANGER;
  if (txt === WK_STATUS.PERHATIAN) return C.WARNING;
  if (txt === WK_STATUS.SEHAT) return C.GREEN;
  return null;
}
