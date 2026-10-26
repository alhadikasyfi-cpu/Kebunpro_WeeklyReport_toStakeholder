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
['WK1_Config.gs', 'WK2_SheetTabel.gs', 'WK3_Analisis.gs', 'WK4_Gambar.gs', 'WK5_Deck.gs', 'WK6_Claude.gs']
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
  { id: 'K06', nama: 'Julfi', hari: 2, ton: 8, akhir: '2027-05-01', missingLast: true }     // tidak ada baris pekan laporan
];
/** first: tanggal awal pekan pertama; reportIdx: indeks pekan laporan; partialDays: hari pekan terakhir (7 = penuh). */
function makeValues(first, reportIdx, partialDays) {
  const values = [header];
  for (let wi = 0; wi < 9; wi++) {
    const w = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7 * wi);
    const f = wi === 8 ? partialDays / 7 : 1;
    kebun.forEach(k => {
      const isReport = wi === reportIdx, idleWeek = k.stopLast && wi > reportIdx - k.stopLast;
      if (k.missingLast && wi >= reportIdx) return;
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
  return values;
}

function analyze(values, today) {
  ctx.VALUES = values;
  ctx.TODAY = today;
  const t = run('T = wkParseValues(VALUES)');
  assert.strictEqual(t.errors.length, 0, t.errors.join());
  const an = run('AN = wkAnalyze(T.rows, TODAY, T.anchor); AN.alias = wkAliasMap(AN); AN');
  return { t, an };
}

// ---- 1. Pekan SENIN; hari ini Rabu 28 Okt (pekan berjalan baru 3 hari) -> laporkan pekan 19 Okt penuh
{
  const { t, an } = analyze(makeValues(new Date(2026, 7, 31), 7, 3), new Date(2026, 9, 28));
  assert.strictEqual(t.anchor, 1);
  assert.strictEqual(an.reportWeek, '2026-10-19');
  assert.strictEqual(an.reportDays, 7);
  assert.strictEqual(an.labelLaporan, 'Senin, 19 Okt – Minggu, 25 Okt 2026');
  const st = Object.fromEntries(an.kebun.map(k => [k.id, k]));
  assert.strictEqual(st.K01.status, 'sehat');
  assert.ok(st.K02.findings.some(f => f.code === 'langganan'));
  assert.strictEqual(st.K03.status, 'berisiko');
  assert.ok(st.K04.findings.some(f => f.code === 'tanpa_berat'));
  assert.ok(st.K05.findings.some(f => f.code === 'tbs_turun'));
  assert.strictEqual(an.cur.aktif, 4);
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
  { id: 'ringkasan', title: '4 dari 6 kebun aktif, 1 berisiko', insight: `**4 kebun** aktif (▼ 20%). ${alias} berhenti input.`, speaker_notes: `Catatan untuk ${alias}.` },
  { id: 'tren', title: 'Judul yang terlalu panjang sekali sampai melewati batas empat puluh tujuh karakter', insight: 'Tren stabil.', speaker_notes: 'x' },
  { id: 'tindak', title: '5 kebun perlu tindak lanjut', insight: 'Prioritas.', speaker_notes: 'y' }] }) + '\n```';
ctx.ANS = answer;
const warn = [];
ctx.WARN = warn;
const ai = run('wkReadAiAnswer(ANS, AN, WARN)');
assert.ok(ai.ringkasan.insight.includes('KPS Pagowan'), 'nama asli dikembalikan');
assert.strictEqual(ai.tren.title, null);   // judul kepanjangan -> judul otomatis
assert.ok(warn.some(w => /lebih dari 47/.test(w)));
const stale = run(`wkReadAiAnswer(ANS.replace('${pk.id}', 'deadbeef'), AN, [])`);
assert.strictEqual(stale, null);

// ---- rencana 3 slide (teks otomatis & teks Claude)
[null, ai].forEach((aiAns, idx) => {
  ctx.AI = aiAns;
  const specs = run('wkPlanSlides(AN, AI)');
  assert.strictEqual(specs.length, 3);
  console.log(idx ? '\n--- dengan jawaban Claude' : '\n--- teks otomatis');
  specs.forEach(sp => {
    assert.ok(sp.title.length <= 47, `judul terlalu panjang: ${sp.title}`);
    assert.ok(sp.notes && sp.notes.trim().length > 0);
    const b = new ctx.WkBatch('p1');
    sp.draw(b);
    assert.ok(b.req.length > 0);
    // semua bentuk berada di dalam slide 720 × 405 pt (footer mulai 382 pt)
    b.req.filter(r => r.createShape || r.createTable).forEach(r => {
      const ep = (r.createShape || r.createTable).elementProperties, x = ep.transform.translateX, y = ep.transform.translateY;
      const w = ep.size.width.magnitude, h = ep.size.height.magnitude;
      assert.ok(x >= 30 && x + w <= 690 && y >= 15 && y + h <= 385, `[${sp.id}] bentuk keluar area: x=${x.toFixed(1)} y=${y.toFixed(1)} w=${w.toFixed(1)} h=${h.toFixed(1)}`);
    });
    console.log(`- [${sp.id}] ${sp.title}  (${b.req.length} request)\n    NOTES: ${sp.notes.slice(0, 220)}${sp.notes.length > 220 ? '…' : ''}`);
  });
});
const auto = run('wkAutoTexts(AN)');
console.log('\nINSIGHT otomatis:\n' + ['ringkasan', 'tren', 'tindak'].map(id => `- ${id}: ${auto[id].insight}`).join('\n'));
console.log('\nSemua uji lulus.');
