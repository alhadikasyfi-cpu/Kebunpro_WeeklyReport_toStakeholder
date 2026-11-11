/**
 * Uji lokal (Node) untuk pembaca tabel, analisis, paket Claude, dan rencana slide weekly, tanpa layanan Google.
 * Jalankan: node uji_weekly.js
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let uuid = 0;
const ctx = { console, Utilities: { getUuid: () => `00000000-0000-0000-0000-${String(uuid++).padStart(12, '0')}` } };
vm.createContext(ctx);
['WK1_Config.gs', 'WK2_SheetTabel.gs', 'WK3_Analisis.gs', 'WK4_Gambar.gs', 'WK5_Deck.gs', 'WK6_Claude.gs', 'WK7_Tampilan.gs']
  .forEach(f => vm.runInContext(fs.readFileSync(`${__dirname}/${f}`, 'utf8'), ctx, { filename: f }));
const run = code => vm.runInContext(code, ctx);

// ---- format angka & tanggal
assert.strictEqual(run('wkFmt(1234567.891, 2)'), '1.234.567,89');
assert.strictEqual(run('wkFmtRp(234800000)'), 'Rp234,8 juta');
assert.strictEqual(run('wkNum("1.234,5")'), 1234.5);
assert.strictEqual(run('wkNum("12.500")'), 12500);
assert.strictEqual(run('wkNum("6,4")'), 6.4);
assert.strictEqual(run('wkKey(wkMonday(wkDate("2026-10-22")))'), '2026-10-19');
assert.strictEqual(run('wkKey(wkSnapWeek(wkDate("2026-10-26"), 4))'), '2026-10-22');   // Senin 26 Okt -> pekan Kamis 22 Okt
assert.strictEqual(run('wkLabelPekanHari("2026-10-22")'), 'Kamis, 22 Okt – Rabu, 28 Okt 2026');
assert.strictEqual(run('wkDelta(110, 100).txt'), '▲ 10%');
assert.strictEqual(run('wkDelta(5, 0).txt'), '▲ baru');
assert.strictEqual(run('wkDelta(6.5, 4, true).txt'), '▲ 2,5 pp');

// ---- data contoh: 6 kebun × 9 pekan
const header = run('WK_COLUMNS.map(c => c.key)');
const kebun = [
  { id: 'K01', nama: 'Becquini Dumai', hari: 6, ton: 60, akhir: '2027-06-30' },
  { id: 'K02', nama: 'Becquini Mahato', hari: 5, ton: 40, akhir: '2026-11-10' },   // langganan hampir habis
  { id: 'K03', nama: 'KPS Pagowan', hari: 3, ton: 12, akhir: '2027-01-31', stopLast: 2 }, // tidak input 2 pekan terakhir
  { id: 'K04', nama: 'KT Segati Kiri', hari: 4, ton: 6, akhir: '2027-03-01', noweight: 0.6 }, // banyak tanpa berat
  { id: 'K05', nama: 'Pak Wie', hari: 5, ton: 20, akhir: '2027-05-01', drop: true },        // TBS turun tajam pekan laporan
  { id: 'K06', nama: 'Julfi', hari: 2, ton: 8, akhir: '2027-05-01', missingLast: true },    // tidak ada baris pekan laporan
  { id: 'K07', nama: 'Mutiara', hari: 4, ton: 15, akhir: '2027-09-01', startAtReport: true } // kebun baru mulai pekan laporan
];
const WAU_HEAD = ['week_start_date', 'week_period', 'WAU_estate_app', 'WAU_timpro_mandorapp', 'WAU_admin_web', 'total_overall_WAU', 'business_names'];
/** first: tanggal awal pekan pertama; reportIdx: indeks pekan laporan; partialDays: hari pekan terakhir (7 = penuh). */
function makeValues(first, reportIdx, partialDays, withWau) {
  const values = [header.slice()];
  for (let wi = 0; wi < 9; wi++) {
    const w = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7 * wi);
    const f = wi === 8 ? partialDays / 7 : 1;
    kebun.forEach(k => {
      const isReport = wi === reportIdx, idleWeek = k.stopLast && wi > reportIdx - k.stopLast;
      if (k.missingLast && wi >= reportIdx) return;
      if (k.startAtReport && wi < reportIdx) return;
      const hari = idleWeek ? 0 : Math.min(k.hari, wi === 8 ? partialDays : 7);
      const ton = idleWeek ? 0 : k.ton * f * (1 + 0.03 * wi) * (k.drop && isReport ? 0.5 : 1);
      const sold = Math.round(ton * 1000 / 14), nw = k.noweight ? Math.round(sold * k.noweight / (1 - k.noweight)) : 0;
      const row = {
        week_start: w, kebun_id: k.id, nama_kebun: k.nama, lokasi: 'Riau', luas_total_ha: 100, akhir_langganan: k.akhir,
        hari_aktif_input: hari, tgl_input_terakhir: idleWeek ? '2026-09-30' : new Date(w.getFullYear(), w.getMonth(), w.getDate() + Math.min(5, partialDays - 1)),
        user_terdaftar: 6, user_aktif: idleWeek ? 0 : (k.id === 'K04' ? 2 : 5),
        catatan_panen: hari * 3, catatan_muat: hari * 2, catatan_jual: hari, catatan_rawat: hari,
        jjg_dipanen: Math.round((sold + nw) * 1.02), jjg_dimuat: sold + nw, jjg_masuk_trip: sold + nw, jjg_terjual: sold, jjg_terjual_tanpa_berat: nw,
        ton_terjual: ton, luas_panen_ha: idleWeek ? 0 : 25, harga_rata_rp_kg: '3.200',
        pendapatan_rp: ton * 3200000, biaya_panen_rp: ton * 300000, biaya_muat_rp: ton * 80000, biaya_rawat_rp: 1500000,
        blok_tanpa_luas: k.id === 'K04' ? 24 : 0
      };
      values.push(header.map(h => (row[h] === undefined ? '' : row[h])));
    });
  }
  values.push(header.map(() => ''));
  if (withWau !== false) {
    // tabel WAU 3 kolom kosong di kanan tabel utama (seperti AI–AO), satu baris per pekan; pekan laporan: estate turun
    const width = header.length + 3 + WAU_HEAD.length, c0 = header.length + 3;
    values.forEach(r => { while (r.length < width) r.push(''); });
    WAU_HEAD.forEach((h, i) => { values[0][c0 + i] = h; });
    for (let wi = 0; wi < 9; wi++) {
      const w = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7 * wi);
      const estate = wi === reportIdx ? 6 : 8 + (wi % 2), mandor = 40 + wi * 2, admin = 9;
      [w, `W${wi}`, estate, mandor, admin, estate + mandor + admin - 4, 'All Business'].forEach((v, i) => { values[1 + wi][c0 + i] = v; });
    }
  }
  return values;
}

function analyze(values, today) {
  ctx.VALUES = values;
  ctx.TODAY = today;
  const t = run('T = wkParseValues(VALUES)');
  assert.strictEqual(t.errors.length, 0, t.errors.join());
  const an = run('AN = wkAnalyze(T.rows, TODAY, T.anchor, T.wau); AN.alias = wkAliasMap(AN); AN');
  return { t, an };
}

// ---- 1. Pekan SENIN; hari ini Rabu 28 Okt (pekan berjalan baru 3 hari) -> laporkan pekan 19 Okt penuh
{
  const { t, an } = analyze(makeValues(new Date(2026, 7, 31), 7, 3), new Date(2026, 9, 28));
  assert.strictEqual(t.anchor, 1);
  assert.ok(!t.warnings.some(w => /dilewati/.test(w)), 'baris yang hanya berisi tabel WAU tidak boleh jadi peringatan');
  assert.strictEqual(an.reportWeek, '2026-10-19');
  assert.strictEqual(an.reportDays, 7);
  assert.strictEqual(an.labelLaporan, 'Senin, 19 Okt – Minggu, 25 Okt 2026');
  const st = Object.fromEntries(an.kebun.map(k => [k.id, k]));
  assert.strictEqual(st.K01.status, 'sehat');
  assert.ok(st.K02.findings.some(f => f.code === 'langganan'));
  assert.strictEqual(st.K03.status, 'berisiko');
  assert.ok(st.K04.findings.some(f => f.code === 'tanpa_berat'));
  assert.ok(st.K05.findings.some(f => f.code === 'tbs_turun'));
  assert.strictEqual(an.cur.aktif, 5);
  // kebun baru & kebun tanpa aktivitas
  assert.strictEqual(JSON.stringify(an.baru.map(k => k.id)), '["K07"]');
  assert.strictEqual(JSON.stringify(an.diam.map(k => k.id).sort()), '["K03","K06"]');
  // WAU per aplikasi ikut terbaca per pekan, dengan % vs pekan lalu
  const est = an.kpis.find(k => k.key === 'wauEstate');
  assert.strictEqual(est.raw, 6);
  assert.strictEqual(est.delta.txt, '▼ 25%');
  assert.ok(an.kpis.find(k => k.key === 'penetrasi'));
  // risiko punya tren pekan per pekan
  assert.ok(an.portfolio.every(p => p.risiko !== null));
  console.log('Pekan Senin:', an.labelLaporan, '| KPI:', an.kpis.map(k => `${k.name} ${k.value} ${k.unit} ${k.delta.txt}`).join(' · '));
}

// ---- 2. Pekan KAMIS; hari ini Minggu 1 Nov (pekan 29 Okt baru 4 hari) -> laporkan pekan 22 Okt
let A;
{
  const { t, an } = analyze(makeValues(new Date(2026, 8, 3), 7, 4), new Date(2026, 10, 1));
  assert.strictEqual(t.anchor, 4);
  assert.strictEqual(an.reportWeek, '2026-10-22');
  assert.strictEqual(an.labelPembanding, 'Kamis, 15 Okt – Rabu, 21 Okt 2026');
}

// ---- 3. Pekan KAMIS; hari ini Senin 2 Nov (hari ke-5) -> laporkan pekan berjalan 29 Okt (5/7), pembanding disetarakan
{
  const { an } = analyze(makeValues(new Date(2026, 8, 3), 8, 5), new Date(2026, 10, 2));
  assert.strictEqual(an.reportWeek, '2026-10-29');
  assert.strictEqual(an.reportDays, 5);
  assert.strictEqual(an.labelLaporan, 'Kamis, 29 Okt – Senin, 2 Nov 2026 (5 dari 7 hari)');
  const ton = an.kpis.find(k => k.key === 'ton');
  assert.ok(Math.abs(ton.delta.pct) < 15, `TBS pekan berjalan disetarakan, bukan turun ~29%: ${ton.delta.txt}`);
  A = an;
}

// ---- paket Claude & jawaban
ctx.AN = A;
const pk = run('wkBuildPacket(AN)');
assert.ok(pk.text.includes(`ID_PAKET: ${pk.id}`));
assert.ok(!/Becquini|Pagowan|Pak Wie/.test(pk.text), 'nama kebun asli tidak boleh ada di paket');
assert.ok(/KEBUN_0\d/.test(pk.text));
const alias = A.alias[A.kebun.find(k => k.id === 'K03').id];
const answer = 'Berikut jawabannya:\n```json\n' + JSON.stringify({ packet_id: pk.id, slides: [
  { id: 'pemakaian', title: 'WAU estate turun 25%, mandor naik', insight: `**WAU estate 6** (▼ 25%). ${alias} berhenti input.`, speaker_notes: `Catatan untuk ${alias}.` },
  { id: 'pelanggan', title: 'Judul yang terlalu panjang sekali sampai melewati batas empat puluh tujuh karakter', insight: 'Dua kebun berisiko.', speaker_notes: 'Ringkasan status.' }] }) + '\n```';
ctx.ANS = answer;
const warn = [];
ctx.WARN = warn;
const ai = run('wkReadAiAnswer(ANS, AN, WARN)');
assert.ok(ai.pemakaian.insight.includes('KPS Pagowan'), 'nama asli dikembalikan');
assert.strictEqual(ai.pelanggan.title, null);   // judul kepanjangan -> judul otomatis
assert.ok(warn.some(w => /lebih dari 47/.test(w)));
assert.strictEqual(run(`wkReadAiAnswer(ANS.replace('${pk.id}', 'deadbeef'), AN, [])`), null);

// ---- rencana 2 slide (teks otomatis & teks Claude), data contoh dan data besar
function checkSlides(an, aiAns, label) {
  ctx.AN = an;
  ctx.AI = aiAns;
  const specs = run('wkPlanSlides(AN, AI)');
  assert.strictEqual(specs.map(s => s.id).join(), 'pemakaian,pelanggan');
  console.log(`\n--- ${label}`);
  specs.forEach(sp => {
    assert.ok(sp.title.length <= 47, `judul terlalu panjang: ${sp.title}`);
    assert.ok(sp.notes && sp.notes.trim().length > 0);
    const b = new ctx.WkBatch('p1');
    sp.draw(b);
    // semua bentuk berada di area bebas bingkai: x 26–701, di bawah logo/garis (kecuali judul & periode) dan di atas pita hijau (375 pt)
    b.req.filter(r => r.createShape || r.createTable || r.createLine).forEach(r => {
      const ep = (r.createShape || r.createTable || r.createLine).elementProperties, x = ep.transform.translateX, y = ep.transform.translateY;
      const w = ep.size.width.magnitude, h = ep.size.height.magnitude;
      assert.ok(x >= 18 && x + w <= 709 && y >= 46 && y + h <= 372, `[${sp.id}] bentuk keluar area: x=${x.toFixed(1)} y=${y.toFixed(1)} w=${w.toFixed(1)} h=${h.toFixed(1)}`);
    });
    // periode tampil di kotak kanan atas
    assert.ok(b.req.some(r => r.insertText && /PEKAN INI/.test(r.insertText.text)), `[${sp.id}] periode tidak tampil`);
    // judul grafik kecil muat satu baris (lebar grafik ±126 pt)
    if (sp.id === 'pemakaian') run('wkUsageCharts(AN)').forEach(k =>
      assert.ok(run('wkEstWidth')(k.short, 8, true) <= 126 - 11, `judul grafik terlalu panjang: ${k.short}`));
    console.log(`- [${sp.id}] ${sp.title}  (${b.req.length} request)\n    NOTES: ${sp.notes.slice(0, 260).replace(/\n/g, ' / ')}${sp.notes.length > 260 ? '…' : ''}`);
  });
  // speaker notes slide 2 memuat SEMUA bisnis bertemuan beserta seluruh temuannya
  const notes2 = specs[1].notes;
  an.kebun.filter(k => k.findings.length).forEach(k => k.findings.forEach(f =>
    assert.ok(notes2.indexOf(k.name) >= 0 && notes2.indexOf(f.text) >= 0, `${label}: notes tanpa ${k.name} / ${f.text}`)));
  return specs;
}
checkSlides(A, null, 'teks otomatis');
checkSlides(A, ai, 'dengan jawaban Claude');
{
  const big = [];
  for (let i = 0; i < 40; i++) {
    const base = kebun[i % kebun.length];
    big.push(Object.assign({}, base, { id: `B${String(i).padStart(2, '0')}`, nama: `${base.nama} Blok Ekspansi ${i + 1}` }));
  }
  const saved = kebun.splice(0, kebun.length, ...big);
  const { an } = analyze(makeValues(new Date(2026, 8, 3), 7, 4), new Date(2026, 10, 1));
  checkSlides(an, null, 'data besar 40 kebun');
  kebun.splice(0, kebun.length, ...saved);
}
// tanpa tabel WAU: slide 1 memakai keaktifan input sebagai pengganti
{
  const { an } = analyze(makeValues(new Date(2026, 8, 3), 7, 4, false), new Date(2026, 10, 1));
  assert.ok(an.warnings.some(w => /Tabel WAU/.test(w)));
  checkSlides(an, null, 'tanpa tabel WAU');
}

ctx.AN = A;
const auto = run('wkAutoTexts(AN)');
console.log('\nINSIGHT otomatis:\n' + ['pemakaian', 'pelanggan'].map(id => `- ${id}: ${auto[id].insight}`).join('\n'));
console.log('\nSemua uji lulus.');
