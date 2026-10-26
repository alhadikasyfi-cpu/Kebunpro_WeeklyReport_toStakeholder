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

/** Paragraf pembuka lebar penuh; mengembalikan posisi bawahnya. */
function wkDrawLead(b, text, top) {
  const L = WK_CONFIG.LAYOUT, T = WK_CONFIG.TYPE, w = L.RIGHT - L.MARGIN;
  const h = wkEstLines(text, T.LEAD, w) * T.LEAD * 1.5;
  b.text(text, L.MARGIN, top, w, h, { size: T.LEAD, color: WK_CONFIG.COLOR.MUTED, lineSpacing: 150 });
  return top + h;
}

/**
 * Kartu KPI (3 kolom; 4 kartu = 1 baris). kpis: [{name, value, unit, note, tone: good|bad|null}]
 * Kartu mengisi ruang dari top0 sampai batas bawah slide.
 */
function wkDrawKpiCards(b, kpis, top0) {
  const C = WK_CONFIG.COLOR, L = WK_CONFIG.LAYOUT, T = WK_CONFIG.TYPE, W = WK_CONFIG.WEIGHT;
  const n = kpis.length, cols = n === 4 ? 4 : Math.min(3, n), rows = Math.ceil(n / cols);
  const gap = L.CARD_GAP, P = L.CARD_PAD;
  const w = (L.RIGHT - L.MARGIN - gap * (cols - 1)) / cols, inner = w - 2 * P;
  const cardH = (L.BOTTOM - top0 - gap * (rows - 1)) / rows;
  kpis.forEach((k, i) => {
    const left = L.MARGIN + (i % cols) * (w + gap), top = top0 + Math.floor(i / cols) * (cardH + gap);
    b.rect(left, top, w, cardH, { round: true, fill: C.TINT, border: C.BORDER });
    const room = inner - (k.unit ? wkEstWidth(' ' + k.unit, T.KPI_UNIT, true) : 0);
    const vs = wkEstWidth(k.value, T.KPI_VALUE, true) <= room ? T.KPI_VALUE : T.KPI_COMPACT;
    const noteH = wkEstLines(k.note, T.BODY, inner) * T.BODY * 1.4;
    const contentH = T.KPI_LABEL * 1.3 + 4.5 + vs * 1.1 + 4.5 + noteH;
    let y = top + Math.max(P, (cardH - contentH) / 2);
    b.text(String(k.name).toUpperCase(), left + P, y, inner, T.KPI_LABEL * 1.3, { size: T.KPI_LABEL, weight: W.TITLE, color: C.MUTED });
    y += T.KPI_LABEL * 1.3 + 4.5;
    const segs = [{ text: String(k.value), size: vs, weight: W.HEAVY, color: C.GREEN }];
    if (k.unit) segs.push({ text: ' ' + k.unit, size: T.KPI_UNIT, weight: W.STRONG, color: C.MUTED });
    b.text('', left + P, y, inner, vs * 1.1, { segs, valign: 'BOTTOM' });
    y += vs * 1.1 + 4.5;
    b.text(k.note || ' ', left + P, y, inner, noteH, { size: T.BODY, weight: W.STRONG, lineSpacing: 130,
      color: k.tone === 'good' ? C.GREEN : (k.tone === 'bad' ? C.DANGER : C.INK) });
  });
}

/** Skala sumbu "bagus" (kelipatan 1/2/2,5/5 × 10^k). */
function wkNiceScale(maxVal) {
  const hi = Math.max(0, maxVal) || 1;
  const raw = hi * 1.15 / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const max = Math.ceil(hi * 1.15 / step) * step;
  const ticks = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { max, ticks };
}

/**
 * Grafik batang pekan per pekan di area konten kiri (kartu INSIGHT di kanan).
 * labels/values sejajar; pekan terakhir (pekan laporan) hijau tua, pekan lain hijau muda.
 * o: {caption, labelFmt, axisFmt}
 */
function wkDrawBarChart(b, labels, values, o) {
  o = o || {};
  const A = WK_CONFIG.LAYOUT.CONTENT, C = WK_CONFIG.COLOR, T = WK_CONFIG.TYPE, W = WK_CONFIG.WEIGHT;
  const padL = 40, padT = 30, padR = 6, padB = 22;
  const x0 = A.left + padL, y0 = A.top + padT, pw = A.width - padL - padR, ph = A.height - padT - padB, yb = y0 + ph;
  const vals = values.map(v => (v === null || v === undefined || !isFinite(v) ? null : v));
  const sc = wkNiceScale(Math.max.apply(null, vals.filter(v => v !== null).concat([0])));
  const yOf = v => yb - ph * (Math.max(0, v) / sc.max);
  const lf = o.labelFmt || wkFmtAuto, af = o.axisFmt || lf;
  if (o.caption) b.text(o.caption, A.left, A.top, A.width, 14, { size: T.CAPTION, weight: W.TITLE, color: C.MUTED });
  sc.ticks.forEach(t => {
    if (t) b.line(x0, yOf(t), x0 + pw, yOf(t), C.DIVIDER, 0.75);
    b.text(af(t), A.left, yOf(t) - 6, padL - 4, 12, { size: T.CAPTION, color: C.MUTED, align: 'END', valign: 'MIDDLE' });
  });
  b.line(x0, yb, x0 + pw, yb, C.MUTED, 0.75);
  const step = pw / vals.length, bw = step * 0.62;
  vals.forEach((v, i) => {
    const cx = x0 + step * (i + 0.5), last = i === vals.length - 1;
    b.text(labels[i], cx - step / 2, yb + 4, step, 12, { size: T.CAPTION, color: last ? C.INK : C.MUTED, weight: last ? W.HEAVY : W.BODY, align: 'CENTER' });
    if (v === null) { b.text('-', cx - step / 2, yb - 16, step, 12, { size: T.CAPTION, color: C.NEUTRAL, align: 'CENTER' }); return; }
    const top = yOf(v);
    b.rect(cx - bw / 2, top, bw, Math.max(yb - top, 0.5), { fill: last ? C.GREEN : C.CHART_LIGHT });
    b.text(lf(v), cx - step / 2, top - 15, step, 12, { size: T.CAPTION, color: last ? C.GREEN : C.MUTED, weight: last ? W.HEAVY : W.STRONG, align: 'CENTER' });
  });
}

/** Tabel lebar penuh di bawah judul. */
function wkDrawFullTable(b, data, o) {
  const L = WK_CONFIG.LAYOUT;
  b.table(L.MARGIN, L.BODY_TOP, L.RIGHT - L.MARGIN, data, o);
}

/** Warna kata status (sehat hijau, perlu perhatian oranye, berisiko merah). */
function wkStatusColor(txt) {
  const C = WK_CONFIG.COLOR;
  if (txt === WK_STATUS.RISIKO) return C.DANGER;
  if (txt === WK_STATUS.PERHATIAN) return C.WARNING;
  if (txt === WK_STATUS.SEHAT) return C.GREEN;
  return null;
}
