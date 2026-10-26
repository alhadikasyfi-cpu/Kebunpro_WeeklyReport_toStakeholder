/**
 * File WK1: Config.gs
 * Konfigurasi Weekly Report KebunPRO untuk STAKEHOLDER INTERNAL SawitPRO: aktivitas semua kebun pelanggan
 * selama pekan sebelumnya, selalu dibandingkan dengan pekan lalu dan tren beberapa pekan terakhir.
 *
 * Semua nama global di proyek ini berawalan WK_ / wk agar file-file ini aman ditempel ke proyek Apps Script
 * yang sama dengan Monthly Report (spreadsheet "Template deck Data") tanpa bentrok nama fungsi/konstanta.
 *
 * Semua ukuran dalam point (pt) pada slide 16:9 Google Slides = 720 x 405 pt (sama dengan deck monthly).
 */

const WK_CONFIG = {
  // Nama sheet tabel weekly (dicari tanpa membedakan huruf besar/kecil). Dibuat otomatis oleh menu "Buat header".
  SHEET_NAME: 'Weekly report',

  // Template slide SAMA dengan monthly (cover, slide konten ber-kartu INSIGHT, penutup).
  TEMPLATE_ID: '16Hib9X3FkvTGbeVWyUnT0-iUFzr0N_GCNvgkZjA0KT4',

  // Deck weekly: SATU file tetap. Generate pertama membuat file baru dan menyimpan ID-nya di Document Properties
  // spreadsheet ini; generate berikutnya MENGGANTI isi file yang sama (link tidak berubah).
  // Isi DECK_ID bila ingin memaksa memakai file tertentu.
  DECK_NAME: 'Weekly Report KebunPRO - Stakeholder',
  DECK_ID: '',
  // Folder tujuan deck baru. Kosong = folder yang sama dengan template.
  OUTPUT_FOLDER_ID: '',
  // Bagikan deck baru ke semua editor/viewer spreadsheet ini (hanya saat file pertama kali dibuat).
  SHARE_WITH_SHEET_USERS: true,

  // Pekan yang masih berjalan (belum sampai Minggu) tidak dijadikan pekan laporan.
  EXCLUDE_CURRENT_WEEK: true,
  // Jumlah pekan di grafik & perhitungan tren (termasuk pekan laporan).
  TREND_WEEKS: 8,
  // Minimal pekan berisi data agar tren dihitung; di bawah ini tren = "data kurang".
  MIN_WEEKS_FOR_TREND: 4,

  // Baris tabel per slide (tabel lebih panjang dipecah ke slide lanjutan).
  ROWS_PER_TABLE: 10,
  ROWS_PER_FOLLOWUP: 6,

  // Ambang analisis (berlaku sama untuk semua kebun)
  THRESHOLDS: {
    AKTIF_MIN_HARI: 3,          // hari_aktif_input < 3 hari dalam sepekan -> "input jarang"
    HARI_TURUN: 3,              // hari aktif turun ≥ 3 hari dari pekan lalu -> perlu perhatian
    LAMA_TANPA_INPUT_HARI: 14,  // input terakhir ≥ 14 hari sebelum akhir pekan -> berisiko
    AKUN_AKTIF_MIN: 0.5,        // akun aktif < 50% akun terdaftar -> akun pasif
    TBS_TURUN_PCT: 20,          // TBS terjual turun > 20% dari pekan lalu -> perlu dikonfirmasi
    NOWEIGHT_PCT: 5,            // janjang terjual tanpa berat > 5% -> pencatatan timbang belum lengkap
    FLOW_LOSS_PCT: 5,           // janjang dipanen belum tercatat terjual > 5% -> kebocoran / tertahan
    BJR_MIN_KG: 3,              // BJR di luar 3–35 kg tidak wajar -> salah catat
    BJR_MAX_KG: 35,
    LANGGANAN_HARI: 30,         // langganan berakhir ≤ 30 hari lagi -> sales perlu menindaklanjuti
    TREND_PCT_PER_WEEK: 2       // |kemiringan tren| ≥ 2% dari rata-rata per pekan -> "naik"/"turun"
  },

  // ---------------- Gaya (sama dengan design system SawitPRO CBR di deck monthly) ----------------
  COLOR: {
    GREEN: '#007200', YELLOW: '#fcd102', INK: '#141414', MUTED: '#595959', SURFACE: '#ffffff',
    TINT: '#f4f9f6', BORDER: '#b9d6c2', ON_GREEN: '#ffffff', WARNING: '#e08e00', DANGER: '#c0392b',
    NEUTRAL: '#bfbfbf', DIVIDER: '#dfdfdf', CHART_MID: '#4c9a4c', CHART_LIGHT: '#8fc28f'
  },
  FONT: 'Plus Jakarta Sans',
  WEIGHT: { BODY: 500, STRONG: 600, TITLE: 700, HEAVY: 800 },
  TYPE: {
    SLIDE_TITLE: 22.5, KPI_VALUE: 31.5, KPI_COMPACT: 25.9, KPI_UNIT: 11.25, KPI_LABEL: 8.4,
    LEAD: 11.25, BODY: 10.1, CAPTION: 8.4, TABLE_HEADER: 9, TABLE_SMALL: 7.9, TABLE_CELL: 9, TABLE_CELL_MIN: 8.4
  },
  TEXT_INSET: { X: 7.2, Y: 3.6 },
  CHAR_W: { BODY: 0.53, HEAVY: 0.6 },
  LAYOUT: {
    MARGIN: 40.5, RIGHT: 679.5, BODY_TOP: 74.25, BOTTOM: 373,
    TITLE: { left: 40.5, top: 22.5, width: 639, height: 27 },
    CONTENT: { left: 40.5, top: 74.25, width: 415.5, height: 298.75 },
    INSIGHT: { left: 471.75, top: 74.25 },
    CARD_PAD: 13.5, CARD_GAP: 10.7
  }
};

const WK_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const WK_BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
  'September', 'Oktober', 'November', 'Desember'];
