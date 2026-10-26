/**
 * Uji lokal (Node) untuk pembaca tabel, analisis, dan rencana slide weekly, tanpa layanan Google.
 * Jalankan: node uji_weekly.js
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let uuid = 0;
const ctx = { console, Utilities: { getUuid: () => `00000000-0000-0000-0000-${String(uuid++).padStart(12, '0')}` } };
vm.createContext(ctx);
['WK1_Config.gs', 'WK2_SheetTabel.gs', 'WK3_Analisis.gs', 'WK4_Gambar.gs', 'WK5_Deck.gs']
  .forEach(f => vm.runInContext(fs.readFileSync(`${__dirname}/${f}`, 'utf8'), ctx, { filename: f }));
const run = code => vm.runInContext(code, ctx);

// ---- format angka & tanggal
assert.strictEqual(run('wkFmt(1234567.891, 2)'), '1.234.567,89');
assert.strictEqual(run('wkFmtRp(234800000)'), 'Rp234,8 juta');
assert.strictEqual(run('wkFmtRp(1250000000)'), 'Rp1,25 miliar');
assert.strictEqual(run('wkNum("1.234,5")'), 1234.5);
assert.strictEqual(run('wkNum("1,234.5")'), 1234.5);
assert.strictEqual(run('wkNum("12.500")'), 12500);
assert.strictEqual(run('wkNum("Rp 2.500")'), 2500);
assert.strictEqual(run('wkNum("6,4")'), 6.4);
assert.strictEqual(run('wkKey(wkMonday(wkDate("2026-10-22")))'), '2026-10-19');
assert.strictEqual(run('wkKey(wkDate("25/10/2026"))'), '2026-10-25');
assert.strictEqual(run('wkLabelPekan("2026-10-19")'), '19–25 Okt 2026');
assert.strictEqual(run('wkLabelPekan("2026-09-28")'), '28 Sep–4 Okt 2026');
assert.strictEqual(run('wkLabelPekan("2025-12-29")'), '29 Des 2025–4 Jan 2026');

// ---- data contoh: 6 kebun × 9 pekan (pekan terakhir = pekan berjalan, harus diabaikan)
const header = run('WK_COLUMNS.map(c => c.key)');
const kebun = [
  { id: 'K01', nama: 'Becquini Dumai', hari: 6, ton: 60, akhir: '2027-06-30' },
  { id: 'K02', nama: 'Becquini Mahato', hari: 5, ton: 40, akhir: '2026-11-10' },   // langganan hampir habis
  { id: 'K03', nama: 'KPS Pagowan', hari: 3, ton: 12, akhir: '2027-01-31', stopLast: 2 }, // tidak input 2 pekan terakhir
  { id: 'K04', nama: 'KT Segati Kiri', hari: 4, ton: 6, akhir: '2027-03-01', noweight: 0.6 }, // banyak tanpa berat
  { id: 'K05', nama: 'Pak Wie', hari: 5, ton: 20, akhir: '2027-05-01', drop: true },        // TBS turun tajam pekan laporan
  { id: 'K06', nama: 'Julfi', hari: 2, ton: 8, akhir: '2027-05-01', missingLast: true }     // tidak ada baris pekan laporan
];
const weeks = [];
for (let i = 0; i < 9; i++) weeks.push(new Date(2026, 7, 31 + 7 * i));   // 31 Agu ... 26 Okt 2026
const values = [header];
weeks.forEach((w, wi) => kebun.forEach(k => {
  const isReport = wi === 7, idleWeek = k.stopLast && wi >= 8 - k.stopLast;
  if (k.missingLast && wi >= 7) return;
  const hari = idleWeek ? 0 : k.hari;
  const ton = idleWeek ? 0 : k.ton * (1 + 0.03 * wi) * (k.drop && isReport ? 0.5 : 1);
  const sold = Math.round(ton * 1000 / 14), nw = k.noweight ? Math.round(sold * k.noweight / (1 - k.noweight)) : 0;
  const row = {
    week_start: new Date(w.getFullYear(), w.getMonth(), w.getDate() + (wi % 3)),   // tanggal bukan Senin -> dibulatkan
    kebun_id: k.id, nama_kebun: k.nama, lokasi: 'Riau', luas_total_ha: 100, akhir_langganan: k.akhir,
    hari_aktif_input: hari, tgl_input_terakhir: idleWeek ? '2026-10-02' : new Date(w.getFullYear(), w.getMonth(), w.getDate() + 5),
    user_terdaftar: 6, user_aktif: idleWeek ? 0 : (k.id === 'K04' ? 2 : 5),
    catatan_panen: hari * 3, catatan_muat: hari * 2, catatan_jual: hari, catatan_rawat: hari,
    jjg_dipanen: Math.round((sold + nw) * 1.02), jjg_dimuat: sold + nw, jjg_masuk_trip: sold + nw, jjg_terjual: sold, jjg_terjual_tanpa_berat: nw,
    ton_terjual: ton, luas_panen_ha: idleWeek ? 0 : 25, harga_rata_rp_kg: '3.200',
    pendapatan_rp: ton * 3200000, biaya_panen_rp: ton * 300000, biaya_muat_rp: ton * 80000, biaya_rawat_rp: 1500000,
    blok_tanpa_luas: k.id === 'K04' ? 24 : 0,
    kunjungan_pendampingan: isReport && k.id === 'K04' ? 1 : '', tiket_dibuka: '', tiket_selesai: '', catatan_cs: isReport && k.id === 'K04' ? 'Pelatihan timbang' : ''
  };
  values.push(header.map(h => (row[h] === undefined ? '' : row[h])));
}));
values.push(header.map(() => ''));   // baris kosong

ctx.VALUES = values;
const t = run('wkParseValues(VALUES)');
assert.strictEqual(t.errors.length, 0, t.errors.join());
assert.strictEqual(t.rows.length, 9 * 6 - 2);
ctx.T = t;
const an = run('wkAnalyze(T.rows, new Date(2026, 9, 28))');   // Rabu 28 Okt 2026: pekan 26 Okt masih berjalan
ctx.AN = an;
assert.strictEqual(an.reportWeek, '2026-10-19');
assert.strictEqual(an.prevWeek, '2026-10-12');
assert.strictEqual(an.weeks.length, 8);
assert.strictEqual(an.total, 6);
const st = Object.fromEntries(an.kebun.map(k => [k.id, k]));
console.log(an.kebun.map(k => `${k.name}: ${k.status} | ${k.findings.map(f => f.text).join('; ')} | ${k.tindak}`).join('\n'));
assert.strictEqual(st.K01.status, 'sehat');
assert.strictEqual(st.K02.status, 'perlu perhatian');
assert.ok(st.K02.findings.some(f => f.code === 'langganan'));
assert.strictEqual(st.K03.status, 'berisiko');
assert.strictEqual(st.K06.status, 'perlu perhatian');   // baru 1 pekan tanpa baris
assert.ok(st.K04.findings.some(f => f.code === 'tanpa_berat'));
assert.ok(st.K04.findings.some(f => f.code === 'blok_luas'));
assert.ok(st.K04.findings.some(f => f.code === 'akun_pasif'));
assert.ok(st.K05.findings.some(f => f.code === 'tbs_turun'));
assert.strictEqual(an.cur.aktif, 4);
assert.ok(an.warnings.some(w => /masih berjalan/.test(w)));

// ---- rencana slide & gambar
const specs = run('wkPlanSlides(AN)');
specs.forEach(sp => {
  assert.ok(sp.title.length <= 47, `judul terlalu panjang: ${sp.title}`);
  const b = new ctx.WkBatch('p1');
  sp.draw(b);
  assert.ok(b.req.length > 0);
  console.log(`- ${sp.title}  [${b.req.length} request]${sp.insight ? `\n    INSIGHT (${sp.insight.split(/\s+/).length} kata): ${sp.insight}` : ''}`);
});
assert.ok(specs.some(s => /tindak lanjut/.test(s.title)));
assert.ok(specs.some(s => /pendampingan/.test(s.title)));
console.log('\nSemua uji lulus.');
