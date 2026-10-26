/**
 * File WK2: SheetTabel.gs
 * Definisi kolom tabel weekly, pembuat header di sheet "Weekly report", dan pembaca tabel.
 *
 * Bentuk tabel: SATU tabel panjang, 1 baris = 1 kebun × 1 pekan (Senin–Minggu). Hasil query/export cukup
 * ditempel sekali mulai sel A2 (atau A1 bila header ikut ditempel). Tempel minimal TREND_WEEKS pekan terakhir
 * agar pembanding pekan lalu dan tren pekan per pekan bisa dihitung. Kebun yang tidak input apa pun pada suatu
 * pekan TETAP diberi baris (angka 0) agar kebun yang "diam" terdeteksi.
 * Angka turunan (BJR, ton/ha, % kebocoran, laba, selisih vs pekan lalu) TIDAK perlu kolom: dihitung script.
 */

// type: date | text | int | num  ·  req: wajib ada di header  ·  group: menentukan warna header
const WK_COLUMNS = [
  { key: 'week_start', group: 'id', type: 'date', req: true, note: 'Tanggal Senin awal pekan (yyyy-mm-dd). Tanggal lain otomatis dibulatkan ke Senin pekan itu.' },
  { key: 'kebun_id', group: 'id', type: 'text', req: true, note: 'ID unik kebun di KebunPRO (membedakan kebun bernama sama).' },
  { key: 'nama_kebun', group: 'id', type: 'text', req: true, note: 'Nama kebun pelanggan.' },
  { key: 'lokasi', group: 'id', type: 'text', note: 'Lokasi kebun.' },
  { key: 'luas_total_ha', group: 'id', type: 'num', note: 'Luas kebun terdaftar (ha).' },
  { key: 'akhir_langganan', group: 'id', type: 'date', note: 'Tanggal berakhir langganan KebunPRO (yyyy-mm-dd).' },

  { key: 'hari_aktif_input', group: 'aktif', type: 'int', note: 'Jumlah hari (0–7) dalam pekan ini yang ada input data apa pun.' },
  { key: 'tgl_input_terakhir', group: 'aktif', type: 'date', note: 'Tanggal input terakhir (oleh siapa pun) sampai akhir pekan ini.' },
  { key: 'user_terdaftar', group: 'aktif', type: 'int', note: 'Jumlah akun admin + mandor terdaftar.' },
  { key: 'user_aktif', group: 'aktif', type: 'int', note: 'Jumlah akun yang menginput pada pekan ini.' },
  { key: 'catatan_panen', group: 'aktif', type: 'int', note: 'Jumlah transaksi/catatan panen pekan ini.' },
  { key: 'catatan_muat', group: 'aktif', type: 'int', note: 'Jumlah catatan muat pekan ini.' },
  { key: 'catatan_jual', group: 'aktif', type: 'int', note: 'Jumlah catatan penjualan/trip pekan ini.' },
  { key: 'catatan_rawat', group: 'aktif', type: 'int', note: 'Jumlah catatan perawatan pekan ini.' },

  { key: 'jjg_dipanen', group: 'produksi', type: 'int', note: 'Janjang dipanen pekan ini.' },
  { key: 'jjg_dimuat', group: 'produksi', type: 'int', note: 'Janjang dimuat pekan ini.' },
  { key: 'jjg_masuk_trip', group: 'produksi', type: 'int', note: 'Janjang masuk trip/pengiriman pekan ini.' },
  { key: 'jjg_terjual', group: 'produksi', type: 'int', note: 'Janjang terjual DENGAN catatan berat.' },
  { key: 'jjg_terjual_tanpa_berat', group: 'produksi', type: 'int', note: 'Janjang terjual TANPA catatan berat.' },
  { key: 'ton_terjual', group: 'produksi', type: 'num', note: 'Tonase TBS terjual (ton) dari janjang yang ada beratnya.' },
  { key: 'luas_panen_ha', group: 'produksi', type: 'num', note: 'Luas blok yang dipanen pekan ini (ha).' },
  { key: 'harga_rata_rp_kg', group: 'produksi', type: 'int', note: 'Harga jual TBS rata-rata (Rp/kg).' },

  { key: 'pendapatan_rp', group: 'uang', type: 'int', note: 'Pendapatan penjualan TBS pekan ini (Rp).' },
  { key: 'biaya_panen_rp', group: 'uang', type: 'int', note: 'Biaya pekerja panen (Rp).' },
  { key: 'biaya_muat_rp', group: 'uang', type: 'int', note: 'Biaya pekerja muat (Rp).' },
  { key: 'biaya_rawat_rp', group: 'uang', type: 'int', note: 'Biaya pekerja rawat/upkeep (Rp).' },

  { key: 'blok_tanpa_luas', group: 'mutu', type: 'int', note: 'Jumlah blok dengan luas 0 / kosong di KebunPRO.' },

  { key: 'kunjungan_pendampingan', group: 'tim', type: 'int', note: 'OPSIONAL (isi manual CS): jumlah kunjungan/sesi pendampingan pekan ini.' },
  { key: 'tiket_dibuka', group: 'tim', type: 'int', note: 'OPSIONAL: tiket support/keluhan baru pekan ini.' },
  { key: 'tiket_selesai', group: 'tim', type: 'int', note: 'OPSIONAL: tiket support yang selesai pekan ini.' },
  { key: 'catatan_cs', group: 'tim', type: 'text', note: 'OPSIONAL: catatan singkat CS (maks. ±80 karakter).' }
];

const WK_GROUP_COLOR = { id: '#007200', aktif: '#1f6f8b', produksi: '#4c9a4c', uang: '#8a6d00', mutu: '#c0392b', tim: '#595959' };
const WK_NUMBER_FORMAT = { date: 'yyyy-mm-dd', text: '@', int: '#,##0', num: '#,##0.00' };

/* ------------------------------------------------------------------------- */
/* Menu: buat / perbaiki header                                              */
/* ------------------------------------------------------------------------- */

function wkGetSheet(ss) {
  const want = WK_CONFIG.SHEET_NAME.trim().toLowerCase();
  return ss.getSheets().find(s => s.getName().trim().toLowerCase() === want) || null;
}

/** Menulis header tabel weekly di baris 1 sheet "Weekly report" (sheet dibuat bila belum ada). Data di bawahnya tidak diubah. */
function wkBuatHeaderTabel() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = wkUi();
  let sh = wkGetSheet(ss);
  if (!sh) sh = ss.insertSheet(WK_CONFIG.SHEET_NAME);
  const keys = WK_COLUMNS.map(c => c.key);
  const width = Math.max(sh.getLastColumn(), keys.length);
  const cur = sh.getRange(1, 1, 1, width).getDisplayValues()[0];
  const same = keys.every((k, i) => wkNorm(cur[i]) === k) && cur.slice(keys.length).every(v => !String(v).trim());
  if (!same && cur.some(v => String(v).trim()) && ui) {
    const ok = ui.alert('Header lama akan diganti',
      `Baris 1 sheet '${sh.getName()}' sudah berisi teks lain. Ganti dengan header weekly (${keys.length} kolom)? Data di baris 2 ke bawah tidak diubah.`,
      ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return;
  }
  if (width > keys.length) sh.getRange(1, keys.length + 1, 1, width - keys.length).clearContent().clearNote().setBackground(null);
  if (sh.getMaxColumns() < keys.length) sh.insertColumnsAfter(sh.getMaxColumns(), keys.length - sh.getMaxColumns());

  const head = sh.getRange(1, 1, 1, keys.length);
  head.setValues([keys])
    .setNotes([WK_COLUMNS.map(c => (c.req ? 'WAJIB. ' : '') + c.note)])
    .setBackgrounds([WK_COLUMNS.map(c => WK_GROUP_COLOR[c.group])])
    .setFontColor('#ffffff').setFontWeight('bold').setVerticalAlignment('middle').setWrap(false);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  WK_COLUMNS.forEach((c, i) => sh.getRange(2, i + 1, rows, 1).setNumberFormat(WK_NUMBER_FORMAT[c.type]));
  sh.autoResizeColumns(1, keys.length);

  const msg = `Header ${keys.length} kolom sudah dibuat di sheet '${sh.getName()}'.\n\n` +
    'Tempel data mulai sel A2: 1 baris = 1 kebun × 1 pekan (Senin–Minggu), minimal ' + WK_CONFIG.TREND_WEEKS + ' pekan terakhir. ' +
    'Kebun tanpa input tetap diberi baris dengan angka 0. Arahkan kursor ke tiap header untuk melihat penjelasannya. ' +
    'Kolom berwarna abu (tim SawitPRO) opsional.';
  if (ui) ui.alert(msg); else Logger.log(msg);
}

/* ------------------------------------------------------------------------- */
/* Pembaca tabel                                                             */
/* ------------------------------------------------------------------------- */

function wkNorm(s) { return String(s === null || s === undefined ? '' : s).trim().toLowerCase().replace(/\s+/g, '_'); }
function wkBlank(v) { return v === null || v === undefined || String(v).trim() === ''; }

/** Angka dari sel: menerima angka asli atau teks format Indonesia/Inggris ("1.234,5", "1,234.5", "Rp 2.500"). */
function wkNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (wkBlank(v)) return null;
  let s = String(v).replace(/[^0-9,.\-]/g, '');
  if (!s || s === '-') return null;
  const hasC = s.indexOf(',') >= 0, hasD = s.indexOf('.') >= 0;
  if (hasC && hasD) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (hasC) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (hasD && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/** Tanggal dari sel: objek Date, "yyyy-mm-dd", "dd/mm/yyyy", "dd-mm-yyyy", atau nomor seri Sheets. */
function wkDate(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {   // nomor seri tanggal Sheets (hari sejak 30-12-1899)
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return wkValidDate(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (m) return wkValidDate(+m[3], +m[2] - 1, +m[1]);
  return null;
}
function wkValidDate(y, m, d) {
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
}

/**
 * Membaca nilai sheet (array 2D) menjadi baris kebun-pekan.
 * Hasil: {rows, errors, warnings, missing (kolom opsional yang tidak ada)}.
 */
function wkParseValues(values) {
  const out = { rows: [], errors: [], warnings: [], missing: [] };
  let hr = -1;
  for (let r = 0; r < Math.min(values.length, 20) && hr < 0; r++) {
    if (values[r].some(v => wkNorm(v) === 'week_start')) hr = r;
  }
  if (hr < 0) { out.errors.push("Header 'week_start' tidak ditemukan. Jalankan menu 'Buat / perbaiki header tabel'."); return out; }
  const header = values[hr].map(wkNorm);
  const col = {};
  WK_COLUMNS.forEach(c => { const i = header.indexOf(c.key); if (i >= 0) col[c.key] = i; });
  const reqMissing = WK_COLUMNS.filter(c => c.req && !(c.key in col)).map(c => c.key);
  if (reqMissing.length) { out.errors.push(`Kolom wajib tidak ada: ${reqMissing.join(', ')}.`); return out; }
  out.missing = WK_COLUMNS.filter(c => !(c.key in col)).map(c => c.key);

  const seen = {};
  for (let r = hr + 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(wkBlank)) continue;
    if (wkNorm(row[col.week_start]) === 'week_start') continue;   // header ikut tertempel lagi
    const d = wkDate(row[col.week_start]);
    const id = String(wkBlank(row[col.kebun_id]) ? row[col.nama_kebun] : row[col.kebun_id]).trim();
    if (!d || !id) { out.warnings.push(`Baris ${r + 1} dilewati: week_start atau kebun_id/nama_kebun kosong/tidak terbaca.`); continue; }
    const week = wkMonday(d);
    const rec = { sheetRow: r + 1, id, week: wkKey(week), weekDate: week };
    WK_COLUMNS.forEach(c => {
      if (c.key === 'week_start' || !(c.key in col)) return;
      const v = row[col[c.key]];
      rec[c.key] = c.type === 'text' ? String(wkBlank(v) ? '' : v).trim() : (c.type === 'date' ? wkDate(v) : wkNum(v));
    });
    if (!rec.nama_kebun) rec.nama_kebun = id;
    const k = `${id}|${rec.week}`;
    if (seen[k]) out.warnings.push(`Kebun '${rec.nama_kebun}' pekan ${rec.week} muncul lebih dari sekali (baris ${seen[k]} dan ${r + 1}); dipakai baris terakhir.`);
    seen[k] = r + 1;
    out.rows.push(rec);
  }
  // baris duplikat: simpan yang terakhir
  const last = {};
  out.rows.forEach(x => { last[`${x.id}|${x.week}`] = x; });
  out.rows = out.rows.filter(x => last[`${x.id}|${x.week}`] === x);
  return out;
}

function wkReadSheet(sheet) { return wkParseValues(sheet.getDataRange().getValues()); }

/* ------------------------------------------------------------------------- */
/* Utilitas tanggal pekan                                                    */
/* ------------------------------------------------------------------------- */

function wkMonday(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7); }
function wkAddDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function wkKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function wkFromKey(k) { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function wkDaysBetween(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); }
