# Weekly Report KebunPRO untuk Stakeholder

Apps Script yang membuat **deck mingguan 2 slide** untuk stakeholder internal SawitPRO, yang waktunya sangat sedikit. Deck ini merangkum kesehatan pelanggan KebunPRO, yaitu estate owner, selama satu pekan. Hampir setiap angka dibandingkan dengan **pekan lalu (dalam %)** dan dilengkapi **tren pekan per pekan**.

Template slide-nya sama dengan Monthly Report. Deck weekly adalah **satu file tetap**: generate pertama membuat file baru, lalu generate berikutnya mengganti isi file yang sama, jadi link-nya tidak berubah.

## Isi deck (2 slide, tampilan dashboard)

**Bingkai slide.** Slide 1 di file deck weekly adalah **bingkai**: logo, badge *FOR INTERNAL USE ONLY*, kotak periode di kanan atas, dan pita hijau di bawah. Setiap generate, bingkai ini disalin untuk setiap slide isi, lalu dipindah ke **akhir deck dalam keadaan tersembunyi (skip)** supaya tidak tampil saat presentasi dan tidak ikut terhapus. Untuk mengganti logo atau pita, edit slide bingkai itu. Kalau deck belum punya bingkai, script menggambar bingkai sederhana.

**Warna (`WK_UI` di `WK7_Tampilan.gs`):**
- Kartu KPI diberi aksen warna di sebelah kiri.
- Perubahan vs pekan lalu: **hijau = membaik, merah = memburuk** (untuk "kebun berisiko", turun = membaik).
- Judul panel diberi aksen kuning; panel observasi dan rencana tindak lanjut memakai kepala hijau tua.
- Setiap aplikasi punya warna sendiri: biru = KebunPRO App, oranye = TimPRO Mandor, abu gelap = Web Admin. Pekan laporan diberi warna tua di atas kolom yang disorot.

| Slide | Isi |
|---|---|
| 1. Pemakaian produk | Judul dan periode (*PEKAN INI … vs …*). Kiri: kartu **Total WAU (unik)**, **kebun aktif input**, **akun menginput** (akun yang menginput data ÷ akun login terdaftar, contoh "Akun menginput (22/136)" = 16%), panel **Tren WAU per aplikasi · 8 pekan** (KebunPRO App, TimPRO Mandor, KebunPRO Web Admin; setiap batang berlabel angka dan tanggal; skala masing-masing; angka pekan ini dan % vs pekan lalu). Kanan: **Observasi utama** berisi kalimat sorotan dan butir-butir. |
| 2. Kesehatan pelanggan & tindakan | Kiri: kartu **kebun berisiko**, **TBS tercatat**, **nilai penjualan TBS**; panel **Tren produksi · 8 pekan** (tonase TBS dan luas dipanen pekan per pekan); **Status pelanggan** (berisiko / perlu perhatian / sehat dengan perubahan vs pekan lalu) dan **Perubahan pelanggan** (kebun mulai pekan ini dan kebun tanpa aktivitas, dengan tanggal input terakhir). Kanan: **Observasi utama** dan **Rencana tindak lanjut / PIC** (bisnis prioritas bernomor, chip PIC, dan target). **Speaker notes memuat rincian semua bisnis.** |

## Segmentasi kebun (slide 1)

Setiap kebun dikelompokkan pada setiap pekan, jadi segmennya bisa dibandingkan dengan pekan lalu:

| Segmen | Aturan |
|---|---|
| **Aktif rutin** | Ada input pekan ini, ≥ 3 hari input (`AKTIF_MIN_HARI`) |
| **Kurang aktif** | Ada input pekan ini, 1–2 hari input |
| **Pasif** | Pekan ini 0, tetapi ada input dalam 4 pekan terakhir (`SEGMENT_WEEKS`) |
| **Tidak aktif** | 0 selama 4 pekan atau lebih |

Tampilannya berupa batang bertumpuk berisi jumlah kebun, dengan legenda yang memuat jumlah dan % vs pekan lalu. Nama kebun di segmen kurang aktif, pasif, dan tidak aktif tertulis di speaker notes slide 1.

Jumlah kebun (pembagi) = semua bisnis yang muncul di hasil query weekly, yaitu yang punya input dalam ±180 hari sebelum periode sampai hari ini. Angka ini **belum** sama dengan jumlah pelanggan yang sedang berlangganan, karena kolom `akhir_langganan` masih kosong.

## Tabel WAU

Hasil query WAU ditempel di sheet `Weekly report`, di kanan tabel utama (contoh: mulai kolom AI). Header yang dibaca adalah `week_start_date`, `WAU_estate_app`, `WAU_timpro_mandorapp`, `WAU_admin_web`, dan `total_overall_WAU`, dengan satu baris per pekan untuk semua bisnis.

- **Awal pekan:** `week_start_date` harus memakai awal pekan yang sama dengan tabel utama (Senin atau Kamis).
- **Total WAU:** `total_overall_WAU` dipakai apa adanya. Pastikan angka ini menghitung **pengguna unik** lintas aplikasi, bukan penjumlahan ketiga kolom.

## Pekan Senin atau Kamis

- Di Metabase, pilih variabel **`awal_pekan`**: `Senin` (pekan Senin–Minggu) atau `Kamis` (pekan Kamis–Rabu). Kolom `week_start` hasil query berisi tanggal hari awal pekan tersebut.
- Script **mendeteksi hari awal pekan otomatis** dari `week_start`, jadi tidak perlu diatur. Bila perlu memaksa, ubah `WK_CONFIG.WEEK_START_DAY` menjadi `'senin'` atau `'kamis'`.
- **Aturan pekan laporan:** bila pekan berjalan baru berjalan **kurang dari 5 hari**, yang dilaporkan adalah **pekan sebelumnya**. Bila sudah 5 hari atau lebih, pekan berjalan yang dilaporkan, dan angka volume pekan lalu disetarakan dengan jumlah hari yang sama (ditandai *). Batasnya diatur di `WK_CONFIG.MIN_DAYS_CURRENT_WEEK`.
- Tanggal pekan laporan dan pekan pembanding selalu tampil di setiap slide, misalnya `Kamis, 22 Okt – Rabu, 28 Okt 2026`.

## Teks dari AI (Claude)

Judul, INSIGHT, dan speaker notes ditulis Claude dengan cara yang sama seperti monthly (script tidak memanggil API AI):

1. **📅 Weekly Report → 3. Salin paket data untuk Claude.** Salin paketnya, lalu tempel ke chat Claude. Panduan untuk Claude sudah ada di dalam paket, dan nama kebun disamarkan (KEBUN_01, ...).
2. Tempel jawaban JSON Claude ke sel **AF2 di sheet `Weekly report`**, di kanan tabel data (kolom A–AE). Sel AF1 diberi label kuning secara otomatis.
3. **4. Generate Weekly Deck.** Nama asli kebun dikembalikan otomatis.

Kalau sel AF2 kosong, atau jawaban Claude dibuat untuk data lama (ID_PAKET berbeda), deck tetap jadi dengan **teks otomatis** dari data.

## File

| File | Isi |
|---|---|
| `WK1_Config.gs` | Pengaturan: nama sheet, template, awal pekan, ambang analisis, gaya |
| `WK2_SheetTabel.gs` | Kolom tabel, pembuat header, pembaca tabel, deteksi awal pekan |
| `WK3_Analisis.gs` | Pekan laporan, perbandingan dengan pekan lalu, tren, status kebun, KPI |
| `WK4_Gambar.gs` | Kartu KPI, grafik mini, tabel, kartu INSIGHT (Google Slides API) |
| `WK5_Deck.gs` | Menu, file deck tetap, rencana 2 slide, teks otomatis |
| `WK6_Claude.gs` | Paket data untuk Claude dan pembaca jawaban (sel AF2) |
| `WK7_Tampilan.gs` | Tampilan dashboard: bingkai, kartu KPI, panel, grafik WAU, observasi, rencana tindak lanjut |
| `query_weekly_report.sql` | Query Metabase/ClickHouse untuk tabel `Weekly report` |
| `uji_weekly.js` | Uji lokal: `node uji_weekly.js` |

Semua nama global diawali `WK_` atau `wk`, jadi aman ditempel ke proyek Apps Script yang sama dengan Monthly Report.

## Pemasangan (sekali)

1. Spreadsheet → **Extensions → Apps Script**. Buat file `WK1_Config` s.d. `WK7_Tampilan`, lalu salin isinya dari repo.
2. Di `onOpen()` milik monthly (`5_MainController.gs`), tambahkan baris berikut sebelum `}` penutup:
   `if (typeof wkAddMenu === 'function') wkAddMenu();`
3. Pastikan layanan **Google Slides API** aktif (Services → Google Slides API).
4. Muat ulang spreadsheet. Menu **📅 Weekly Report** akan muncul.

Tanpa menu, fungsi bisa dijalankan dari editor. Buka file `WK5_Deck`, pilih `wkGenerateWeeklyDeck`, lalu klik Run. Fungsi `wkSalinPaketClaude` ada di `WK6_Claude`.

## Pemakaian tiap pekan

1. Jalankan `query_weekly_report.sql` di Metabase dengan memilih `awal_pekan`, lalu tempel hasilnya ke sheet `Weekly report` (mulai A1, header ikut).
2. **2. Cek data weekly**: memeriksa pekan laporan, pembanding, dan peringatan.
3. **3. Salin paket data untuk Claude**, lalu tempel jawaban Claude ke sel `AF2` sheet `Weekly report`. Langkah ini opsional.
4. **4. Generate Weekly Deck**.

## Kolom tabel `Weekly report`

`week_start, kebun_id, nama_kebun, lokasi, luas_total_ha, akhir_langganan, hari_aktif_input, tgl_input_terakhir, user_terdaftar, user_aktif, catatan_panen, catatan_muat, catatan_jual, catatan_rawat, jjg_dipanen, jjg_dimuat, jjg_masuk_trip, jjg_terjual, jjg_terjual_tanpa_berat, ton_terjual, luas_panen_ha, harga_rata_rp_kg, pendapatan_rp, biaya_panen_rp, biaya_muat_rp, biaya_rawat_rp, blok_tanpa_luas` (ditambah 4 kolom opsional tim SawitPRO).

Data boleh berubah-ubah setiap pekan: jumlah kebun bertambah atau berkurang, kebun baru belum punya riwayat, kolom tertentu kosong, atau pekan tertentu tidak ada. KPI yang datanya kosong dilewati, kebun baru tidak dihitung pada pekan sebelum ia terdaftar, dan pekan tanpa data tampil kosong di grafik.

## Aturan status kebun (`WK_CONFIG.THRESHOLDS`)

- **Berisiko** bila memenuhi salah satu:
  - tidak ada input 2 pekan berturut-turut, atau input terakhir ≥ 14 hari;
  - langganan berakhir ≤ 30 hari lagi dan kebun juga jarang atau tidak input.
- **Perlu perhatian** bila memenuhi salah satu:
  - input < 3 hari per pekan, atau hari input turun ≥ 3 hari;
  - akun aktif < 50%;
  - TBS turun > 20%;
  - janjang tanpa berat > 5%;
  - janjang belum tercatat terjual > 5%;
  - BJR di luar 3–35 kg;
  - ada blok tanpa luas;
  - langganan berakhir ≤ 30 hari lagi.
- **Sehat** bila tidak ada temuan.
