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
  tanpa_input: { pr: 1, aksi: 'Hubungi admin kebun, cari kendala input', pic: 'CS' },
  langganan: { pr: 2, aksi: 'Bahas perpanjangan langganan dengan owner', pic: 'Sales' },
  input_jarang: { pr: 3, aksi: 'Ingatkan dan dampingi input harian', pic: 'CS' },
  akun_pasif: { pr: 4, aksi: 'Latih ulang akun yang belum aktif', pic: 'CS' },
  tanpa_berat: { pr: 5, aksi: 'Dampingi pencatatan hasil timbang', pic: 'CS' },
  kebocoran: { pr: 6, aksi: 'Telusuri janjang yang belum tercatat terjual', pic: 'CS' },
  tbs_turun: { pr: 7, aksi: 'Konfirmasi penyebab TBS turun (rotasi, cuaca, data)', pic: 'CS · Agronomi' },
  bjr: { pr: 8, aksi: 'Cek data timbang dan janjang', pic: 'Agronomi' },
  blok_luas: { pr: 9, aksi: 'Lengkapi luas blok di KebunPRO', pic: 'CS' }
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
    else if (p && p.hari !== null && c.hari !== null && p.hari - c.hari >= T.HARI_TURUN) f.push({ code: 'input_jarang', sev: 'perhatian', text: `Hari input turun ${p.hari}→${c.hari}` });
    if (c.userTerdaftar && c.userAktif !== null && c.userAktif !== undefined && c.userAktif / c.userTerdaftar < T.AKUN_AKTIF_MIN) {
      f.push({ code: 'akun_pasif', sev: 'perhatian', text: `Akun aktif ${c.userAktif} dari ${c.userTerdaftar}` });
    }
    const dTon = wkPct(c.ton, p && p.ton);
    if (dTon !== null && dTon < -T.TBS_TURUN_PCT) f.push({ code: 'tbs_turun', sev: 'perhatian', text: `TBS turun ${wkFmt(-dTon, 0)}% (${wkFmtAuto(p.ton)}→${wkFmtAuto(c.ton)} ton)` });
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

/**
 * rows: hasil wkParseValues().rows; today: Date (untuk menentukan pekan yang masih berjalan).
 * Hasil: {reportWeek, prevWeek, weeks, kebun: [...], portfolio: [...per pekan], cur, prev, warnings}
 */
function wkAnalyze(rows, today) {
  const warnings = [];
  const allWeeks = Array.from(new Set(rows.map(r => r.week))).sort();
  if (!allWeeks.length) return null;
  let reportWeek = allWeeks[allWeeks.length - 1];
  if (WK_CONFIG.EXCLUDE_CURRENT_WEEK && today) {
    const done = allWeeks.filter(w => wkAddDays(wkFromKey(w), 6) < new Date(today.getFullYear(), today.getMonth(), today.getDate()));
    if (done.length) {
      if (done[done.length - 1] !== reportWeek) warnings.push(`Pekan ${wkLabelPekan(reportWeek)} masih berjalan, jadi tidak dilaporkan. Pekan laporan: ${wkLabelPekan(done[done.length - 1])}.`);
      reportWeek = done[done.length - 1];
    } else warnings.push(`Semua data berada di pekan yang masih berjalan; pekan ${wkLabelPekan(reportWeek)} dilaporkan apa adanya.`);
  }
  const reportDate = wkFromKey(reportWeek);
  const prevWeek = wkKey(wkAddDays(reportDate, -7));
  const endDate = wkAddDays(reportDate, 6);
  const n = Math.max(2, WK_CONFIG.TREND_WEEKS);
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) weeks.push(wkKey(wkAddDays(reportDate, -7 * i)));
  const present = weeks.filter(w => allWeeks.indexOf(w) >= 0);
  if (present.length < n) warnings.push(`Data tren hanya ${present.length} dari ${n} pekan (${wkLabelPekan(weeks[0])} s.d. ${wkLabelPekan(reportWeek)}); pekan tanpa data tampil kosong.`);
  if (allWeeks.indexOf(prevWeek) < 0) warnings.push(`Tidak ada data pekan lalu (${wkLabelPekan(prevWeek)}); perbandingan pekan lalu tidak tersedia.`);

  const by = {};
  rows.forEach(r => { by[`${r.id}|${r.week}`] = r; });
  // kebun yang muncul di jendela tren (kebun yang berhenti lebih lama dari jendela tidak dilaporkan)
  const ids = Array.from(new Set(rows.filter(r => r.week >= weeks[0] && r.week <= reportWeek).map(r => r.id)));

  const kebun = ids.map(id => {
    const recs = weeks.map(w => by[`${id}|${w}`] || null);
    const info = rows.filter(r => r.id === id && r.week <= reportWeek).sort((a, b) => (a.week < b.week ? -1 : 1)).pop() || {};
    const curRec = by[`${id}|${reportWeek}`] || null, prevRec = by[`${id}|${prevWeek}`] || null;
    const cur = wkMetrics(curRec), prev = wkMetrics(prevRec);
    // input terakhir: kolom tgl_input_terakhir terbaru, atau akhir pekan aktif terakhir bila kolom kosong
    let lastInput = null;
    rows.filter(r => r.id === id && r.week <= reportWeek).forEach(r => {
      const d = r.tgl_input_terakhir || (wkIsActive(r) ? wkAddDays(r.weekDate, 6) : null);
      if (d && d <= endDate && (!lastInput || d > lastInput)) lastInput = d;
    });
    const k = { id, name: info.nama_kebun || id, lokasi: info.lokasi || '', info, curRec, prevRec, cur, prev, lastInput, endDate,
      series: {
        ton: recs.map(r => (r ? r.ton_terjual : null)),
        hari: recs.map(r => (r ? r.hari_aktif_input : null)),
        aktif: recs.map(r => (r ? (wkIsActive(r) ? 1 : 0) : null))
      } };
    k.trendTon = wkTrend(k.series.ton);
    k.trendHari = wkTrend(k.series.hari);
    k.findings = wkFindings(k);
    k.status = wkStatusOf(k.findings);
    k.tindak = wkTindakLanjut(k.findings);
    return k;
  });

  // Agregat portofolio per pekan
  const portfolio = weeks.map(w => {
    const rs = ids.map(id => by[`${id}|${w}`]).filter(Boolean);
    const ms = rs.map(wkMetrics);
    const has = rs.length > 0;
    const sumKey = key => (has && wkAnyNum(rs.map(r => r[key])) ? wkSum(rs.map(r => r[key])) : null);
    const soldAll = has && wkAnyNum(ms.map(m => m.soldAll)) ? wkSum(ms.map(m => m.soldAll)) : null;
    const nw = sumKey('jjg_terjual_tanpa_berat');
    return {
      week: w, has, kebun: rs.length,
      aktif: has ? ms.filter(m => m.aktif).length : null,
      userAktif: sumKey('user_aktif'), userTerdaftar: sumKey('user_terdaftar'),
      ton: sumKey('ton_terjual'), pendapatan: sumKey('pendapatan_rp'),
      jjgPanen: sumKey('jjg_dipanen'), catatan: has && wkAnyNum(ms.map(m => m.catatan)) ? wkSum(ms.map(m => m.catatan)) : null,
      noweightPct: soldAll ? (nw || 0) / soldAll * 100 : null,
      kunjungan: sumKey('kunjungan_pendampingan'), tiketDibuka: sumKey('tiket_dibuka'), tiketSelesai: sumKey('tiket_selesai')
    };
  });
  const cur = portfolio[portfolio.length - 1], prev = portfolio[portfolio.length - 2];
  // status pekan lalu (untuk membandingkan jumlah kebun berisiko)
  const prevStatus = kebun.map(k => {
    const kp = Object.assign({}, k, { cur: k.prev, prev: wkMetrics(by[`${k.id}|${wkKey(wkAddDays(reportDate, -14))}`] || null),
      curRec: k.prevRec, endDate: wkAddDays(reportDate, -1),
      lastInput: k.lastInput && k.lastInput <= wkAddDays(reportDate, -1) ? k.lastInput : null });
    return k.prevRec ? wkStatusOf(wkFindings(kp)) : null;
  });
  const count = (list, s) => list.filter(x => x === s).length;
  return {
    reportWeek, prevWeek, weeks, kebun, portfolio, cur, prev, warnings, endDate,
    total: kebun.length,
    risiko: count(kebun.map(k => k.status), WK_STATUS.RISIKO),
    perhatian: count(kebun.map(k => k.status), WK_STATUS.PERHATIAN),
    prevRisiko: count(prevStatus, WK_STATUS.RISIKO),
    prevPerhatian: count(prevStatus, WK_STATUS.PERHATIAN),
    trendTon: wkTrend(portfolio.map(p => p.ton)),
    trendAktif: wkTrend(portfolio.map(p => p.aktif))
  };
}
