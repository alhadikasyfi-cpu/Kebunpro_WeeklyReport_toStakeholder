/**
 * File WK3: Analisis.gs
 * Menghitung pekan laporan vs pekan lalu, tren beberapa pekan, angka turunan per kebun, status kesehatan
 * pelanggan (sehat / perlu perhatian / berisiko), temuan, dan saran tindak lanjut dengan PIC internal.
 * Semua fungsi di file ini murni (tanpa layanan Google) agar bisa diuji di Node (uji_weekly.js).
 */

/* ------------------------------------------------------------------------- */
/* Format angka & tanggal (format Indonesia)                                 */
/* ------------------------------------------------------------------------- */

function wkFmt(n, dec) {
  if (n === null || n === undefined || !isFinite(n)) return '-';
  const d = dec === undefined ? 0 : dec;
  const parts = Math.abs(n).toFixed(d).split('.');
  const s = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (parts[1] ? ',' + parts[1] : '');
  return (n < 0 && Number(Math.abs(n).toFixed(d)) !== 0 ? '-' : '') + s;
}
/** Angka ringkas: desimal hanya bila nilainya kecil (mis. 4,6 ton; 128 ton). */
function wkFmtAuto(n) { return n === null || n === undefined ? '-' : wkFmt(n, Math.abs(n) < 10 ? 1 : 0); }
function wkFmtRp(n) {
  if (n === null || n === undefined || !isFinite(n)) return '-';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}Rp${wkFmt(a / 1e9, 2)} miliar`;
  if (a >= 1e6) return `${sign}Rp${wkFmt(a / 1e6, 1)} juta`;
  return `${sign}Rp${wkFmt(a, 0)}`;
}
function wkPct(cur, ref) {
  return cur === null || cur === undefined || ref === null || ref === undefined || !ref ? null : (cur - ref) / Math.abs(ref) * 100;
}
/** "▲ 12%" / "▼ 8%" / "= 0%" ; null -> "-" */
function wkArrow(p) {
  if (p === null || p === undefined) return '-';
  if (Math.round(Math.abs(p)) === 0) return '= 0%';
  return `${p > 0 ? '▲' : '▼'} ${wkFmt(Math.abs(p), 0)}%`;
}
/** "naik 12%" / "turun 8%" / "sama" ; null -> "" */
function wkArah(p) {
  if (p === null || p === undefined) return '';
  if (Math.round(Math.abs(p)) === 0) return 'sama dengan';
  return `${p > 0 ? 'naik' : 'turun'} ${wkFmt(Math.abs(p), 0)}% dari`;
}
/**
 * Perubahan vs pekan lalu: {pct, txt, dir}. Angka persen (mis. % tanpa berat) memakai poin persen (pp).
 * pekan lalu 0 dan kini > 0 -> "▲ baru".
 */
function wkDelta(cur, prev, isPct) {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return { pct: null, txt: '-', dir: 0 };
  if (isPct) {
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return { pct: 0, txt: '= 0 pp', dir: 0 };
    return { pct: d, txt: `${d > 0 ? '▲' : '▼'} ${wkFmt(Math.abs(d), 1)} pp`, dir: d > 0 ? 1 : -1 };
  }
  if (!prev) return cur ? { pct: null, txt: '▲ baru', dir: 1 } : { pct: 0, txt: '= 0%', dir: 0 };
  const p = (cur - prev) / Math.abs(prev) * 100;
  return { pct: p, txt: wkArrow(p), dir: Math.round(Math.abs(p)) === 0 ? 0 : (p > 0 ? 1 : -1) };
}
/** "naik 12%" / "turun 8%" / "tetap" (untuk judul) */
function wkArahPendek(p) {
  if (p === null || p === undefined) return '';
  return Math.round(Math.abs(p)) === 0 ? 'tetap' : `${p > 0 ? 'naik' : 'turun'} ${wkFmt(Math.abs(p), 0)}%`;
}
function wkTglPendek(d) { return d ? `${d.getDate()} ${WK_BULAN[d.getMonth()]}` : '-'; }
function wkTglPanjang(d) { return d ? `${d.getDate()} ${WK_BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}` : '-'; }
/** "19–25 Okt 2026" atau "29 Sep–5 Okt 2026" */
function wkLabelPekan(key) {
  const a = wkFromKey(key), b = wkAddDays(a, 6);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${WK_BULAN[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} ${WK_BULAN[a.getMonth()]}${a.getFullYear() !== b.getFullYear() ? ' ' + a.getFullYear() : ''}–${b.getDate()} ${WK_BULAN[b.getMonth()]} ${b.getFullYear()}`;
}
/** Label sumbu grafik: tanggal Senin, mis. "19 Okt". */
function wkLabelSumbu(key) { return wkTglPendek(wkFromKey(key)); }

/* ------------------------------------------------------------------------- */
/* Angka turunan per baris kebun-pekan                                       */
/* ------------------------------------------------------------------------- */

function wkSum(arr) { return arr.reduce((a, b) => a + (b || 0), 0); }
function wkAnyNum(arr) { return arr.some(v => v !== null && v !== undefined); }

/** Kebun dianggap aktif pada pekan itu bila ada hari aktif, atau (bila kolom kosong) ada catatan/janjang. */
function wkIsActive(rec) {
  if (!rec) return false;
  if (rec.hari_aktif_input !== null && rec.hari_aktif_input !== undefined) return rec.hari_aktif_input > 0;
  return wkSum([rec.catatan_panen, rec.catatan_muat, rec.catatan_jual, rec.catatan_rawat, rec.jjg_dipanen]) > 0;
}

function wkMetrics(rec) {
  if (!rec) return null;
  const sold = rec.jjg_terjual, nw = rec.jjg_terjual_tanpa_berat;
  const soldAll = wkAnyNum([sold, nw]) ? wkSum([sold, nw]) : null;
  const biaya = wkAnyNum([rec.biaya_panen_rp, rec.biaya_muat_rp, rec.biaya_rawat_rp])
    ? wkSum([rec.biaya_panen_rp, rec.biaya_muat_rp, rec.biaya_rawat_rp]) : null;
  const ton = rec.ton_terjual;
  return {
    aktif: wkIsActive(rec),
    hari: rec.hari_aktif_input,
    userAktif: rec.user_aktif, userTerdaftar: rec.user_terdaftar,
    catatan: wkAnyNum([rec.catatan_panen, rec.catatan_muat, rec.catatan_jual, rec.catatan_rawat])
      ? wkSum([rec.catatan_panen, rec.catatan_muat, rec.catatan_jual, rec.catatan_rawat]) : null,
    ton, pendapatan: rec.pendapatan_rp, biaya,
    laba: rec.pendapatan_rp !== null && rec.pendapatan_rp !== undefined && biaya !== null ? rec.pendapatan_rp - biaya : null,
    bjr: ton && sold ? ton * 1000 / sold : null,
    yieldHa: ton && rec.luas_panen_ha ? ton / rec.luas_panen_ha : null,
    harga: rec.harga_rata_rp_kg,
    jjgPanen: rec.jjg_dipanen, jjgMuat: rec.jjg_dimuat, soldAll, noweight: nw,
    noweightPct: soldAll ? (nw || 0) / soldAll * 100 : null,
    // janjang dipanen yang belum tercatat terjual pada pekan yang sama (bisa juga karena penjualan bergeser ke pekan berikutnya)
    lossPct: rec.jjg_dipanen && soldAll !== null ? Math.max(0, rec.jjg_dipanen - soldAll) / rec.jjg_dipanen * 100 : null,
    blokTanpaLuas: rec.blok_tanpa_luas
  };
}

/** Tren regresi linier: {dir: naik|turun|stabil|data kurang, pctPerWeek}. */
function wkTrend(values) {
  const pts = values.map((v, i) => [i, v]).filter(p => p[1] !== null && p[1] !== undefined && isFinite(p[1]));
  if (pts.length < WK_CONFIG.MIN_WEEKS_FOR_TREND) return { dir: 'data kurang', pctPerWeek: null };
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) * (p[0] - mx), 0);
  const slope = sxx ? pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
  if (!my) return { dir: slope > 0 ? 'naik' : 'stabil', pctPerWeek: null };
  const pct = slope / Math.abs(my) * 100, th = WK_CONFIG.THRESHOLDS.TREND_PCT_PER_WEEK;
  return { dir: pct >= th ? 'naik' : (pct <= -th ? 'turun' : 'stabil'), pctPerWeek: pct };
}

/* ------------------------------------------------------------------------- */
/* Temuan & tindak lanjut                                                    */
/* ------------------------------------------------------------------------- */

// pr = prioritas (kecil = paling penting); pic = penanggung jawab internal SawitPRO
const WK_TINDAK = {
  tanpa_input: { pr: 1, label: 'tidak ada input', aksi: 'Hubungi admin kebun, cari kendala input', pic: 'CS' },
  langganan: { pr: 2, label: 'langganan hampir habis', aksi: 'Bahas perpanjangan langganan dengan owner', pic: 'Sales' },
  input_jarang: { pr: 3, label: 'input jarang', aksi: 'Ingatkan dan dampingi input harian', pic: 'CS' },
  akun_pasif: { pr: 4, label: 'akun pasif', aksi: 'Latih ulang akun yang belum aktif', pic: 'CS' },
  tanpa_berat: { pr: 5, label: 'janjang tanpa berat tinggi', aksi: 'Dampingi pencatatan hasil timbang', pic: 'CS' },
  kebocoran: { pr: 6, label: 'janjang belum tercatat terjual', aksi: 'Telusuri janjang yang belum tercatat terjual', pic: 'CS' },
  tbs_turun: { pr: 7, label: 'TBS turun tajam', aksi: 'Konfirmasi penyebab TBS turun (rotasi, cuaca, data)', pic: 'CS · Agronomi' },
  bjr: { pr: 8, label: 'BJR tidak wajar', aksi: 'Cek data timbang dan janjang', pic: 'Agronomi' },
  blok_luas: { pr: 9, label: 'blok tanpa luas', aksi: 'Lengkapi luas blok di KebunPRO', pic: 'CS' }
};
const WK_STATUS = { SEHAT: 'sehat', PERHATIAN: 'perlu perhatian', RISIKO: 'berisiko' };

/**
 * Temuan satu kebun. k: {cur, prev, curRec, prevRec, lastInput, endDate, info}
 * Hasil: [{code, text, sev: 'risiko'|'perhatian'}]
 */
function wkFindings(k) {
  const T = WK_CONFIG.THRESHOLDS, f = [];
  const c = k.cur, p = k.prev;
  const gap = k.lastInput ? wkDaysBetween(k.lastInput, k.endDate) : null;
  if (!c || !c.aktif) {
    const twoWeeks = !p || !p.aktif;
    const lama = gap !== null && gap >= T.LAMA_TANPA_INPUT_HARI;
    const txt = !k.curRec ? 'Tidak ada baris data pekan ini' : 'Tidak ada input pekan ini';
    f.push({ code: 'tanpa_input', sev: twoWeeks || lama ? 'risiko' : 'perhatian',
      text: txt + (k.lastInput ? `; input terakhir ${wkTglPendek(k.lastInput)} (${gap} hari)` : (twoWeeks ? '; 2 pekan berturut-turut' : '')) });
  } else {
    if (c.hari !== null && c.hari !== undefined && c.hari < T.AKTIF_MIN_HARI) f.push({ code: 'input_jarang', sev: 'perhatian', text: `Input hanya ${c.hari} hari` });
    else if (p && p.hari !== null && c.hari !== null && p.hari * (k.scale || 1) - c.hari >= T.HARI_TURUN) f.push({ code: 'input_jarang', sev: 'perhatian', text: `Hari input turun ${p.hari}→${c.hari}` });
    if (c.userTerdaftar && c.userAktif !== null && c.userAktif !== undefined && c.userAktif / c.userTerdaftar < T.AKUN_AKTIF_MIN) {
      f.push({ code: 'akun_pasif', sev: 'perhatian', text: `Akun aktif ${c.userAktif} dari ${c.userTerdaftar}` });
    }
    const dTon = wkPct(c.ton, p && p.ton !== null && p.ton !== undefined ? p.ton * (k.scale || 1) : null);
    if (dTon !== null && dTon < -T.TBS_TURUN_PCT) f.push({ code: 'tbs_turun', sev: 'perhatian', text: `TBS turun ${wkFmt(-dTon, 0)}% (${wkFmtAuto(p.ton * (k.scale || 1))}→${wkFmtAuto(c.ton)} ton${(k.scale || 1) < 1 ? ', pekan lalu disetarakan' : ''})` });
    if (c.noweightPct !== null && c.noweightPct > T.NOWEIGHT_PCT) f.push({ code: 'tanpa_berat', sev: 'perhatian', text: `${wkFmt(c.noweightPct, 0)}% janjang terjual tanpa berat` });
    if (c.lossPct !== null && c.lossPct > T.FLOW_LOSS_PCT) f.push({ code: 'kebocoran', sev: 'perhatian', text: `${wkFmt(c.lossPct, 0)}% janjang dipanen belum tercatat terjual` });
    if (c.bjr !== null && (c.bjr < T.BJR_MIN_KG || c.bjr > T.BJR_MAX_KG)) f.push({ code: 'bjr', sev: 'perhatian', text: `BJR ${wkFmt(c.bjr, 1)} kg tidak wajar` });
  }
  const blok = c ? c.blokTanpaLuas : null;
  if (blok) f.push({ code: 'blok_luas', sev: 'perhatian', text: `${wkFmt(blok, 0)} blok tanpa luas` });
  const akhir = k.info.akhir_langganan;
  if (akhir) {
    const sisa = wkDaysBetween(k.endDate, akhir);
    if (sisa <= T.LANGGANAN_HARI) {
      const masalahAktif = f.some(x => x.code === 'tanpa_input' || x.code === 'input_jarang');
      f.push({ code: 'langganan', sev: masalahAktif ? 'risiko' : 'perhatian',
        text: sisa < 0 ? `Langganan berakhir ${wkTglPendek(akhir)} (lewat ${-sisa} hari)` : `Langganan berakhir ${wkTglPendek(akhir)} (${sisa} hari lagi)` });
    }
  }
  return f.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'risiko' ? -1 : 1) || WK_TINDAK[a.code].pr - WK_TINDAK[b.code].pr);
}

function wkStatusOf(findings) {
  if (findings.some(x => x.sev === 'risiko')) return WK_STATUS.RISIKO;
  return findings.length ? WK_STATUS.PERHATIAN : WK_STATUS.SEHAT;
}

/** Teks tindak lanjut (maks. 2 aksi berbeda), mis. "Hubungi admin kebun... (PIC: CS)". */
function wkTindakLanjut(findings) {
  const seen = {};
  return findings.map(x => WK_TINDAK[x.code]).filter(t => !seen[t.aksi] && (seen[t.aksi] = true)).slice(0, 2)
    .map(t => `${t.aksi} (PIC: ${t.pic})`).join('; ');
}

/* ------------------------------------------------------------------------- */
/* Analisis utama                                                            */
/* ------------------------------------------------------------------------- */

/** "Kamis, 15 Okt – Rabu, 21 Okt 2026"; endDate opsional (pekan berjalan: s.d. hari ini). */
function wkLabelPekanHari(key, endDate) {
  const a = wkFromKey(key), b = endDate || wkAddDays(a, 6);
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${WK_HARI[a.getDay()]}, ${a.getDate()} ${WK_BULAN[a.getMonth()]}${sameYear ? '' : ' ' + a.getFullYear()} – ` +
    `${WK_HARI[b.getDay()]}, ${b.getDate()} ${WK_BULAN[b.getMonth()]} ${b.getFullYear()}`;
}

/** Evaluasi satu kebun pada satu pekan (temuan & status). */
function wkEvalWeek(info, mine, curRec, prevRec, weekKey, endDate, scale) {
  let lastInput = null;
  mine.forEach(r => {   // input terakhir: tgl_input_terakhir, atau akhir pekan aktif bila kolom kosong
    const d = r.tgl_input_terakhir || (wkIsActive(r) ? wkAddDays(r.weekDate, 6) : null);
    if (r.week <= weekKey && d && d <= endDate && (!lastInput || d > lastInput)) lastInput = d;
  });
  const k = { info, curRec, prevRec, cur: wkMetrics(curRec), prev: wkMetrics(prevRec), lastInput, endDate, scale };
  k.findings = wkFindings(k);
  k.status = wkStatusOf(k.findings);
  k.tindak = wkTindakLanjut(k.findings);
  return k;
}

/**
 * rows: hasil wkParseValues().rows; today: Date; anchor: hari awal pekan (hasil wkParseValues().anchor).
 * Hasil: {reportWeek, prevWeek, weeks, anchor, kebun, portfolio (per pekan), cur, prev, kpis, warnings, ...}
 */
function wkAnalyze(rows, today, anchor) {
  const warnings = [];
  const allWeeks = Array.from(new Set(rows.map(r => r.week))).sort();
  if (!allWeeks.length) return null;
  const A = anchor === undefined || anchor === null ? wkFromKey(allWeeks[0]).getDay() : anchor;
  // Pekan laporan: pekan berjalan bila sudah berjalan ≥ MIN_DAYS_CURRENT_WEEK hari, selain itu pekan sebelumnya.
  const t = today || new Date();
  const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const thisStart = wkSnapWeek(t0, A);
  const daysRun = wkDaysBetween(thisStart, t0) + 1;   // hari awal pekan = 1 ... = 7
  const target = wkKey(daysRun >= WK_CONFIG.MIN_DAYS_CURRENT_WEEK ? thisStart : wkAddDays(thisStart, -7));
  const eligible = allWeeks.filter(w => w <= target);
  const reportWeek = eligible.length ? eligible[eligible.length - 1] : allWeeks[allWeeks.length - 1];
  if (reportWeek !== target) warnings.push(`Data pekan ${wkLabelPekanHari(target)} belum ada di sheet; yang dilaporkan pekan ${wkLabelPekanHari(reportWeek)}.`);
  const reportDate = wkFromKey(reportWeek);
  const prevWeek = wkKey(wkAddDays(reportDate, -7));
  const fullEnd = wkAddDays(reportDate, 6);
  const endDate = fullEnd > t0 ? t0 : fullEnd;              // pekan berjalan: data s.d. hari ini
  const reportDays = wkDaysBetween(reportDate, endDate) + 1;
  const scale = reportDays / 7;                               // pembanding volume disetarakan jumlah harinya
  if (reportDays < 7) warnings.push(`Pekan laporan masih berjalan (${reportDays} dari 7 hari, s.d. ${wkTglPanjang(endDate)}); angka volume pekan lalu disetarakan ${reportDays}/7 sebagai pembanding.`);
  const n = Math.max(2, WK_CONFIG.TREND_WEEKS);
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) weeks.push(wkKey(wkAddDays(reportDate, -7 * i)));
  const present = weeks.filter(w => allWeeks.indexOf(w) >= 0);
  if (present.length < n) warnings.push(`Data tren hanya ${present.length} dari ${n} pekan; pekan tanpa data tampil kosong.`);
  if (allWeeks.indexOf(prevWeek) < 0) warnings.push(`Tidak ada data pekan pembanding (${wkLabelPekanHari(prevWeek)}); perbandingan pekan lalu tidak tersedia.`);

  const by = {};
  rows.forEach(r => { by[`${r.id}|${r.week}`] = r; });
  // kebun yang muncul di jendela tren (kebun yang berhenti lebih lama dari jendela tidak dilaporkan)
  const ids = Array.from(new Set(rows.filter(r => r.week >= weeks[0] && r.week <= reportWeek).map(r => r.id)));
  const weekEnd = w => { const e = wkAddDays(wkFromKey(w), 6); return e > t0 ? t0 : e; };

  const kebun = ids.map(id => {
    const mine = rows.filter(r => r.id === id && r.week <= reportWeek).sort((a, b) => (a.week < b.week ? -1 : 1));
    const info = mine[mine.length - 1] || {};
    const first = mine.length ? mine[0].week : reportWeek;
    // evaluasi tiap pekan tren (null = kebun belum terdaftar pada pekan itu)
    const evals = weeks.map((w, i) => (w < first ? null : wkEvalWeek(info, mine, by[`${id}|${w}`] || null,
      by[`${id}|${wkKey(wkAddDays(wkFromKey(w), -7))}`] || null, w, weekEnd(w), i === weeks.length - 1 ? scale : 1)));
    const now = evals[evals.length - 1];
    const recs = weeks.map(w => by[`${id}|${w}`] || null);
    const k = Object.assign({ id, name: info.nama_kebun || id, lokasi: info.lokasi || '', first, evals,
      series: {
        ton: recs.map((r, i) => (evals[i] ? (r ? r.ton_terjual || 0 : 0) : null)),
        hari: recs.map((r, i) => (evals[i] ? (r ? r.hari_aktif_input || 0 : 0) : null))
      } }, now);
    k.trendTon = wkTrend(k.series.ton);
    k.trendHari = wkTrend(k.series.hari);
    k.dTon = wkDelta(k.cur ? k.cur.ton : 0, k.prev && k.prev.ton !== null && k.prev.ton !== undefined ? k.prev.ton * scale : null);
    k.dHari = wkDelta(k.cur ? k.cur.hari : 0, k.prev && k.prev.hari !== null && k.prev.hari !== undefined ? k.prev.hari * scale : null);
    return k;
  });

  // Agregat portofolio per pekan (hanya kebun yang sudah terdaftar pada pekan itu)
  const portfolio = weeks.map((w, i) => {
    const ex = kebun.filter(k => k.evals[i]);
    const rs = ex.map(k => k.evals[i].curRec).filter(Boolean);
    const ms = rs.map(wkMetrics);
    const has = rs.length > 0;
    const sumKey = key => (has && wkAnyNum(rs.map(r => r[key])) ? wkSum(rs.map(r => r[key])) : null);
    const soldAll = has && wkAnyNum(ms.map(m => m.soldAll)) ? wkSum(ms.map(m => m.soldAll)) : null;
    const hariKnown = has && wkAnyNum(rs.map(r => r.hari_aktif_input));
    const end = weekEnd(w);
    const withAkhir = ex.filter(k => k.info.akhir_langganan);
    return {
      week: w, has, kebun: ex.length,
      aktif: has ? ex.filter(k => k.evals[i].cur && k.evals[i].cur.aktif).length : null,
      userAktif: sumKey('user_aktif'), userTerdaftar: sumKey('user_terdaftar'),
      rataHari: hariKnown && ex.length ? wkSum(ex.map(k => (k.evals[i].curRec && k.evals[i].curRec.hari_aktif_input) || 0)) / ex.length : null,
      catatan: has && wkAnyNum(ms.map(m => m.catatan)) ? wkSum(ms.map(m => m.catatan)) : null,
      ton: sumKey('ton_terjual'), pendapatan: sumKey('pendapatan_rp'), jjgPanen: sumKey('jjg_dipanen'),
      noweightPct: soldAll ? (sumKey('jjg_terjual_tanpa_berat') || 0) / soldAll * 100 : null,
      risiko: ex.length ? ex.filter(k => k.evals[i].status === WK_STATUS.RISIKO).length : null,
      perhatian: ex.length ? ex.filter(k => k.evals[i].status === WK_STATUS.PERHATIAN).length : null,
      renewal: withAkhir.length ? withAkhir.filter(k => {
        const sisa = wkDaysBetween(end, k.info.akhir_langganan);
        return sisa >= 0 && sisa <= WK_CONFIG.THRESHOLDS.LANGGANAN_HARI;
      }).length : null
    };
  });
  const cur = portfolio[portfolio.length - 1], prev = portfolio[portfolio.length - 2];
  const an = {
    reportWeek, prevWeek, weeks, anchor: A, kebun, portfolio, cur, prev, warnings, endDate, reportDays, scale,
    total: kebun.length,
    risiko: cur.risiko || 0, perhatian: cur.perhatian || 0,
    prevRisiko: prev.risiko || 0, prevPerhatian: prev.perhatian || 0,
    labelLaporan: wkLabelPekanHari(reportWeek, endDate) + (reportDays < 7 ? ` (${reportDays} dari 7 hari)` : ''),
    labelPembanding: wkLabelPekanHari(prevWeek)
  };
  an.kpis = wkBuildKpis(an);
  return an;
}

/**
 * Indikator utama untuk stakeholder (urutan = prioritas). Hanya indikator yang datanya ada yang dipakai.
 * prorate: angka volume (bertambah tiap hari) -> pembanding pekan lalu disetarakan bila pekan laporan belum penuh.
 * isPct: angka berupa persen -> perubahan dalam poin persen (pp). goodDown: turun = baik.
 */
const WK_KPI_DEFS = [
  { key: 'aktif', name: 'Kebun aktif input', unit: an => `dari ${an.cur.kebun}`, fmt: v => wkFmt(v), why: 'adopsi: kebun yang benar-benar memakai KebunPRO' },
  { key: 'userAktif', name: 'Akun aktif', unit: an => (an.cur.userTerdaftar ? `dari ${wkFmt(an.cur.userTerdaftar)}` : 'akun'), fmt: v => wkFmt(v), why: 'penetrasi pengguna di kebun pelanggan' },
  { key: 'risiko', name: 'Kebun berisiko', unit: () => 'kebun', fmt: v => wkFmt(v), goodDown: true, why: 'risiko churn' },
  { key: 'renewal', name: 'Perpanjangan ≤30 hari', unit: () => 'kebun', fmt: v => wkFmt(v), goodDown: true, why: 'langganan yang perlu ditindaklanjuti sales' },
  { key: 'ton', name: 'TBS tercatat terjual', unit: () => 'ton', fmt: v => wkFmtAuto(v), prorate: true, why: 'nilai operasional yang dikelola lewat platform' },
  { key: 'pendapatan', name: 'Nilai penjualan TBS', unit: () => '', fmt: v => wkFmtRp(v), prorate: true, why: 'nilai transaksi pelanggan yang tercatat' },
  { key: 'rataHari', name: 'Hari input / kebun', unit: () => 'hari', fmt: v => wkFmt(v, 1), prorate: true, why: 'kedalaman pemakaian harian' },
  { key: 'catatan', name: 'Catatan diinput', unit: () => 'catatan', fmt: v => wkFmt(v), prorate: true, why: 'volume transaksi di aplikasi' },
  { key: 'noweightPct', name: 'Janjang tanpa berat', unit: () => '%', fmt: v => wkFmt(v, 1), isPct: true, goodDown: true, why: 'kualitas data pelanggan' }
];

function wkBuildKpis(an) {
  const max = WK_CONFIG.KPI_COUNT || 6;
  return WK_KPI_DEFS.filter(d => an.cur[d.key] !== null && an.cur[d.key] !== undefined).slice(0, max).map(d => {
    const cur = an.cur[d.key], prevRaw = an.prev[d.key];
    const prev = prevRaw === null || prevRaw === undefined ? null : (d.prorate ? prevRaw * an.scale : prevRaw);
    const delta = wkDelta(cur, prev, d.isPct);
    // "Rp1,25 miliar" -> angka "Rp1,25" + satuan "miliar" agar angka besar muat di kartu
    const full = d.fmt(cur), m = d.unit(an) ? null : full.match(/^(.*) (juta|miliar)$/);
    return {
      key: d.key, name: d.name, why: d.why, value: m ? m[1] : full, raw: cur, unit: m ? m[2] : d.unit(an), delta, goodDown: !!d.goodDown,
      prevRaw, prevTxt: prevRaw === null || prevRaw === undefined ? 'Pekan lalu: -'
        // pekan berjalan: pembanding volume ditampilkan versi setara jumlah hari (*), dijelaskan di baris tanggal slide
        : (d.prorate && an.scale < 1 ? `Pekan lalu* ${d.fmt(prev)}` : `Pekan lalu ${d.fmt(prevRaw)}${d.unit(an) === '%' ? '%' : ''}`),
      spark: an.portfolio.map(p => p[d.key]), fmt: d.fmt, isPct: !!d.isPct, prorate: !!d.prorate,
      trend: wkTrend(an.portfolio.slice(0, an.scale < 1 ? -1 : undefined).map(p => p[d.key])).dir
    };
  });
}
