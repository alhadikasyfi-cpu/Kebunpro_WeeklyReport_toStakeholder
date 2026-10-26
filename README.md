# Weekly Report KebunPRO untuk Stakeholder

Apps Script yang membuat **deck mingguan untuk stakeholder internal SawitPRO**. Isinya aktivitas semua kebun pelanggan pada pekan sebelumnya, dan **setiap angka dibandingkan dengan pekan lalu** serta tren 8 pekan terakhir.

Template slide-nya sama dengan Monthly Report (cover, slide konten dengan kartu INSIGHT, dan penutup). Bedanya, deck weekly adalah **satu file tetap**: generate pertama membuat file baru, lalu setiap generate berikutnya mengganti isi file yang sama. Jadi link yang dibagikan ke stakeholder tidak pernah berubah.

## File

| File | Isi |
|---|---|
| `WK1_Config.gs` | Konfigurasi: nama sheet, ID template, ambang analisis, gaya |
| `WK2_SheetTabel.gs` | Definisi kolom, menu pembuat header, pembaca tabel |
| `WK3_Analisis.gs` | Perbandingan dengan pekan lalu, tren, status kebun, temuan, tindak lanjut |
| `WK4_Gambar.gs` | Kartu KPI, grafik batang, tabel (Google Slides API) |
| `WK5_Deck.gs` | Menu, file deck tetap, rencana slide, generate |
| `uji_weekly.js` | Uji lokal dengan data contoh: `node uji_weekly.js` |

Semua nama global diawali `WK_` atau `wk`, jadi aman ditempel ke **proyek Apps Script yang sama dengan Monthly Report** tanpa bentrok nama.

## Pemasangan (sekali saja)

1. Buka spreadsheet **Template deck Data**, lalu buka **Extensions → Apps Script** (proyek monthly).
2. Buat 5 file script baru bernama `WK1_Config` s.d. `WK5_Deck`, lalu salin isi file `.gs` dari repo ini ke masing-masing file.
3. Di `5_MainController.gs` (monthly), tambahkan satu baris di akhir fungsi `onOpen()`, sebelum tanda `}` penutup:
   ```js
   if (typeof wkAddMenu === 'function') wkAddMenu();
   ```
4. Pastikan layanan **Google Slides API** sudah aktif (Services → Google Slides API). Biasanya sudah aktif untuk monthly. `appsscript.json` di repo ini sama dengan manifest monthly.
5. Muat ulang spreadsheet. Menu **📅 Weekly Report** akan muncul.

## Pemakaian tiap pekan

1. **📅 Weekly Report → 1. Buat / perbaiki header tabel**: membuat header 31 kolom di sheet `Weekly report` (sheet dibuat bila belum ada). Arahkan kursor ke tiap header untuk melihat penjelasannya. Langkah ini cukup sekali.
2. Tempel data mulai sel **A2**:
   - 1 baris = 1 kebun × 1 pekan (Senin–Minggu).
   - Tempel minimal **8 pekan terakhir**.
   - Kebun yang tidak input apa pun tetap diberi baris dengan angka 0.
3. **2. Cek data weekly**: memeriksa pekan laporan, jumlah kebun, status, dan peringatan data.
4. **3. Generate Weekly Deck**: memperbarui deck weekly. Link tetap sama.

Menu lain:
- **Buka deck weekly**: menampilkan link deck.
- **Pakai file deck baru**: generate berikutnya membuat file baru. File lama tidak dihapus.

## Kolom tabel (`Weekly report`)

| Kelompok | Kolom |
|---|---|
| Identitas (wajib: 3 kolom pertama) | `week_start`, `kebun_id`, `nama_kebun`, `lokasi`, `luas_total_ha`, `akhir_langganan` |
| Keaktifan KebunPRO | `hari_aktif_input`, `tgl_input_terakhir`, `user_terdaftar`, `user_aktif`, `catatan_panen`, `catatan_muat`, `catatan_jual`, `catatan_rawat` |
| Alur janjang & produksi | `jjg_dipanen`, `jjg_dimuat`, `jjg_masuk_trip`, `jjg_terjual` (dengan berat), `jjg_terjual_tanpa_berat`, `ton_terjual`, `luas_panen_ha`, `harga_rata_rp_kg` |
| Keuangan | `pendapatan_rp`, `biaya_panen_rp`, `biaya_muat_rp`, `biaya_rawat_rp` |
| Kualitas data | `blok_tanpa_luas` |
| Tim SawitPRO (opsional, manual) | `kunjungan_pendampingan`, `tiket_dibuka`, `tiket_selesai`, `catatan_cs` |

Aturan pengisian:
- `week_start` boleh berisi tanggal mana pun dalam pekan itu; script membulatkannya ke hari Senin.
- Angka boleh ditulis dalam format Indonesia (`1.234,5`) maupun Inggris.
- Angka turunan tidak perlu dibuat kolom, karena dihitung script: BJR, ton/ha, % janjang tanpa berat, % janjang belum terjual, laba kotor, selisih dengan pekan lalu, dan tren.

## Isi deck

1. **Cover**: "WEEKLY REPORT KEBUNPRO", pekan laporan, jumlah kebun.
2. **Ringkasan pekan**: paragraf ringkas dan 6 kartu KPI. Setiap kartu dibandingkan dengan pekan lalu:
   - kebun aktif input
   - akun aktif
   - TBS terjual
   - pendapatan pelanggan
   - % janjang tanpa berat
   - jumlah kebun yang perlu tindak lanjut
3. **Tren TBS terjual**: grafik 8 pekan dan INSIGHT.
4. **Tren keaktifan**: jumlah kebun yang input per pekan dan INSIGHT.
5. **Keaktifan per kebun**: hari input pekan ini vs pekan lalu, akun aktif, input terakhir, tren, status.
6. **Kinerja per kebun**: TBS vs pekan lalu, BJR, % tanpa berat, % belum terjual, pendapatan, tren TBS.
7. **Kebun perlu tindak lanjut**: temuan, saran tindak lanjut, dan PIC internal (CS / Sales / Agronomi).
8. **Aktivitas tim SawitPRO**: hanya muncul bila kolom opsional diisi.
9. **Penutup**.

Tabel yang panjang otomatis dipecah ke beberapa slide (10 baris per slide, atau 6 baris untuk tindak lanjut).

## Aturan status kebun (ubah ambangnya di `WK_CONFIG.THRESHOLDS`)

- **Berisiko** bila memenuhi salah satu:
  - tidak ada input 2 pekan berturut-turut, atau input terakhir sudah ≥ 14 hari;
  - langganan berakhir ≤ 30 hari lagi dan kebun juga jarang atau tidak input.
- **Perlu perhatian** bila memenuhi salah satu:
  - input < 3 hari dalam sepekan, atau hari input turun ≥ 3 hari dari pekan lalu;
  - akun aktif < 50% dari akun terdaftar;
  - TBS turun > 20% dari pekan lalu;
  - janjang tanpa berat > 5%;
  - janjang dipanen yang belum tercatat terjual > 5%;
  - BJR di luar 3–35 kg;
  - ada blok tanpa luas;
  - langganan berakhir ≤ 30 hari lagi.
- **Sehat** bila tidak ada temuan.

Pekan yang masih berjalan (belum sampai hari Minggu) tidak dijadikan pekan laporan.
