# Konsep Final Fitur Prakiraan PM2.5

**Status:** v7, sudah dibangun · 14 November 2026 · halaman `/prakiraan` · commit `62b2594`
**Menggantikan:** v6 (dokumen ini versi sebelumnya) dan `KONSEP_PRAKIRAAN_PM25_7_HARI.md` (v4–v5)
**Data:** `data_notebook/` (AQMS harian dan per jam, panel RS, master stasiun). Prakiraan terbit 14 Okt 2026, hari data terakhir.

**Yang berubah dari v6** (mengikuti revisi tim, bagian 8):
- Halaman dibingkai ulang: **peringatan musim asap** di atas, angka harian turun ke bawah.
- Angka harian yang terlalu presisi (contoh "1.147, rentang 1.127–1.167") diganti kategori ISPU dan nilai dibulatkan.
- Batas model ditulis terbuka di halaman sebagai temuan.
- Peringatan pergantian bulan ditampilkan.
- Klaim akurasi dirapikan: selisih absolut ditulis, H+7 ditandai belum lolos uji, cakupan rentang ditulis "mendekati 80%".
- Linimasa musim didesain ulang supaya terbaca sekali lihat.

---

## 1. Ide Inti

Halaman Prakiraan menjawab tiga pertanyaan, dari yang paling bisa dipegang ke yang paling tidak pasti:

| Urutan | Pertanyaan | Jawaban di halaman | Keyakinan | Bukti |
|---|---|---|---|---|
| 1 | **Kapan** musim asap selesai di wilayah saya? | Linimasa musim asap | Tinggi | Akhir musim sama (31 Okt) pada 2024 dan 2025 di 10 dari 12 lokasi yang sedang musim asap |
| 2 | **Seberapa parah** minggu ini? | Kategori ISPU besok, hari di atas 55, peringatan ganti bulan | Sedang | Prakiraan besok lebih tepat dari menyalin di 25/25 stasiun |
| 3 | **Apa dampaknya** bagi rumah sakit? | Perkiraan kasus napas 7 hari | Sedang | Uji balik 2026: galat 42% lebih kecil saat PM2.5 melompat |

Kalimat pemaparan:

> "Di data ini, yang bisa diramal dengan yakin adalah **kapan** musim asap datang dan selesai. Angka harian kami tunjukkan sebagai kategori, karena lonjakan besar datang di pergantian bulan dan tidak ada data yang memberi tanda sebelumnya. Itu kami tulis terbuka sebagai temuan."

---

## 2. Sifat Dataset yang Menentukan Desain

Semua angka dari `struktur_bulanan` dan `uji.per_horizon` di `public/data/prakiraan_verifikasi.json`. Sudah dicocokkan ulang satu per satu (14 Nov 2026).

| Fakta | Angka | Arti |
|---|---|---|
| Awal musim asap (naik dari ≤ 55 selama 7 hari ke > 55) yang jatuh di tanggal 1 | **27 dari 28** | Musim asap mulai di pergantian bulan |
| Lonjakan besar (perubahan harian > 0,4 log, sekitar ±50%) yang jatuh di tanggal 1 | **62 dari 76** | Lompatan besar hampir selalu di tanggal 1 |
| Peluang level berubah di tanggal 1 vs hari lain | 14,9% vs 2,7% | Lima kali lebih sering |
| Median perubahan harian | 1,86% | Di dalam bulan data hampir datar |
| Autokorelasi lag 1 | 0,985 | Nilai besok hampir sama dengan hari ini |
| Bulan > 55 berulang tiap tahun | Agu–Okt di jalur asap Sumatra–Kalimantan | Waktu musim bisa diramal |
| Besarnya naik tiap tahun | Palangka Raya–Sampit rata-rata musim 58 → 90 → 289 | Besarnya tidak bisa diramal dari tahun lalu |
| Variabel yang bergerak sebelum lompatan | Tidak ada (\|ρ\| ≤ 0,05); PM10 melompat bersamaan (ρ 0,98) | Tidak ada penanda awal di dataset |

**Catatan definisi.** "Awal musim asap" hanya menghitung kenaikan dari udara bersih (≤ 55 selama 7 hari). Kenaikan saat sudah di atas 55, seperti Pangkalan Bun 8–14 Okt 2026 (sekitar 150 → 640 bertahap), tidak terhitung, dan kenaikan hariannya di bawah ambang lonjakan besar. Kalau juri bertanya soal grafik itu, jawabannya ada di sini.

Stasiun yang berjauhan berkorelasi 0,99+, tanda data sintetis. Karena itu data luar (titik api, ENSO) tidak dipakai.

---

## 3. Model dan Metode

### 3.1 Model prakiraan (tidak diubah dari v6)

1. **Dasar:** LightGBM yang menebak **perubahan** log PM2.5 dari hari ini, bukan nilainya, karena puncak 2026 lebih tinggi dari apa pun di data latih. Hasilnya dicampur dengan nilai hari ini; bobot campuran dipilih di validasi 2025, bukan di uji 2026.
2. **Fitur:** ukuran bentuk pergerakan saja, yaitu selisih hari ini dengan 1–7, 14, dan 30 hari lalu, rata-rata 3, 7, dan 30 hari, serta naik-turun 7 hari.
3. **Penyetelan:** Optuna di data 2025.
4. **Lapis transisi bulan:** bila hari sasaran jatuh di bulan berbeda dari hari terbit, prakiraan = log nilai kini + (log median bulan sasaran − log median bulan asal) tahun sebelumnya di stasiun yang sama. Di uji 2026 galat log turun sekitar 65% pada hari lintas bulan.
5. **Rentang 80%:** kuantil galat per stasiun, musim, dan horizon, terpisah untuk hari pindah bulan bila sampel ≥ 100.
6. **Peluang > 55:** gabungan model dan pola musiman per stasiun-bulan; bobotnya dipilih di 2025.

**Fitur yang diuji lalu ditolak:** cuaca (kelembapan, angin, suhu, hari kering), CO, rasio PM2.5/PM10, pola jam malam, stasiun tetangga searah angin, musim, tingkat absolut, faktor intensitas per stasiun, penggabungan antarklaster, tren antartahun. Tidak ada yang menambah akurasi 2026. Fitur musim terbaik di validasi tetapi terburuk di uji (menghafal).

### 3.2 Cara menguji

- **Uji berjalan 2026 (Jan–Okt):** tiap hari prakiraan dibuat hanya dari data sebelum hari itu, lalu dicocokkan dengan yang terjadi. Ini meniru prakiraan sungguhan.
- **Pembanding:** menyalin hari ini, SES, drift, Ridge, naif musiman, klimatologi.
- **Uji statistik:** Diebold–Mariano per horizon dengan koreksi Holm untuk 7 horizon, uji tanda antarstasiun, Kupiec untuk cakupan rentang, skor Brier relatif untuk peluang.

### 3.3 Linimasa musim asap (`tambahan_v6.py`, fungsi `musim`)

- Periode musim = deretan hari PM2.5 > 55 yang terpanjang per stasiun per tahun. Celah sampai 10 hari digabung, nilai kosong diisi maju sampai 3 hari, deretan minimal 5 hari.
- Keluaran per tahun: mulai, akhir, rata-rata selama musim, jumlah hari di atas 55, dan tanda "masih berlangsung".
- **Sisa musim 2026** = sampai tanggal akhir musim 2025 di lokasi itu. Ini perkiraan dari pola, bukan keluaran model.

### 3.4 Peringatan pergantian bulan

- Perubahan median bulanan tahun lalu di lokasi itu, dari bulan berjalan ke bulan berikutnya (contoh Palangka Raya–Sampit: masuk November −82%; Pangkalan Bun −75%).
- Ditampilkan sebagai **arah** ("Turun tajam" ≤ −50%, "Turun" ≤ −15%, "Relatif sama", "Naik", "Naik tajam" ≥ +50%), dengan keterangan "pola 1 tahun (2025) di lokasi ini: −82%". Alasannya: hanya satu tahun analog, dan 2025 tahun ringan (Palangka Raya Okt 2025 = 125, Nov 2025 = 22, sedangkan Okt 2026 = 870 µg/m³).
- Diberi warna peringatan bila tanggal 1 jatuh dalam 7 hari ke depan. Di tanggal terbit 14 Okt, 1 Nov masih 18 hari lagi, jadi tampil sebagai informasi biasa. Peringatannya muncul di mode "Uji di Tanggal Lain".

### 3.5 Kasus napas di rumah sakit

Rata-rata kasus 7 hari terakhir × (PM2.5 prakiraan ÷ PM2.5 7 hari terakhir)^(b ÷ ln 2), b per RS dari model dampak halaman Simulasi. Diuji balik pada arsip prakiraan 2026.

**Ekstrapolasi:** PM2.5 tertinggi Palangka Raya sebelum Okt 2026 = 422 µg/m³, sedangkan Okt 2026 rata-rata 870 dan prakiraan sekitar 1.150. Angka kasus di luar rentang data pembentuk rumus, dan rentangnya hanya dari rentang PM (tanpa ketidakpastian koefisien). Catatan ini tertulis di kartu RS.

---

## 4. Hasil Uji (uji berjalan 2026)

| Horizon | Galat model vs menyalin (µg/m³) | Selisih | Keunggulan | Lolos Holm? | Stasiun menang | Cakupan rentang 80% |
|---|---|---|---|---|---|---|
| H+1 | 1,19 vs 1,43 | 0,24 | 17% | **Ya** (p = 0,020) | 25/25 | 81% (Kupiec p = 0,034) |
| H+2 | 1,67 vs 2,08 | 0,41 | 20% | Tidak (p = 0,079) | 25/25 | 82% |
| H+3 | 2,07 vs 2,63 | 0,56 | 21% | Tidak (p = 0,112) | 25/25 | 82% |
| H+7 | 3,27 vs 4,36 | 1,09 | 25% | Tidak (p = 0,120) | 25/25 | 80% (Kupiec p = 0,62) |

Ukuran lain:

| Ukuran | Angka | Catatan |
|---|---|---|
| Keunggulan besok di dalam vs di luar musim asap | 14,9% vs 21,5% | Saat paling dibutuhkan, keunggulannya paling kecil |
| RMSE vs MAE besok | 9,97 vs 1,19 | Galat terkumpul di sedikit hari (tanggal 1) |
| Bias saat PM2.5 naik ≥ 25 (H+1) | −83,5 µg/m³ (menyalin −109,6) | Hanya 32 kejadian; model tetap telat |
| Cakupan rentang di hari pindah bulan (H+1) | 74% | Rentang terlalu sempit tepat saat paling penting |
| Peluang > 55: tertangkap / presisi (H+1) | 97,4% / 99,7% | Tinggi karena data datar; tidak ada angka pembanding, jangan dijadikan klaim |
| Skor Brier relatif peluang (H+1) | 0,61 | Terhadap pola musiman |
| FAIRMODE | 0,87–0,88 | < 1 berarti memenuhi |
| Kasus napas, galat saat PM2.5 melompat | 34,8 → 20,0 (−42%) | Dibanding rata-rata 7 hari |

---

## 5. Susunan Halaman (sesuai yang dibangun)

```
Judul: "13 Lokasi Diperkirakan di Atas 55 Sampai 21 Okt"
KPI:   10/12 bulan asap sama 3 tahun · 13 di atas 55 minggu ini · 25/25 stasiun (selisih 0,2 µg/m³)
1. Musim asap      3 angka ringkas + linimasa per lokasi + keterangan
2. Lokasi          kategori besok · hari di atas 55 · ganti bulan + pemilih + grafik + 7 kotak + kotak temuan
3. Dampak RS       kasus napas 7 hari di rumah sakit pasangan
4. Bisa Dipercaya? plot titik 25 stasiun + 3 angka jujur
Telusuri Lebih Dalam: Akurasi · Kualitas Data · Cara Kerja
```

Alurnya dari yang paling pasti ke yang paling tidak pasti: kapan musim selesai → kondisi satu lokasi minggu ini → dampaknya ke rumah sakit → bukti seberapa bisa dipercaya.

### 5.1 Kartu Musim Asap

Judul: **"Pada 2024 dan 2025, Level Turun di 1 Nov"** (akhir musim 2025 yang paling umum + 1 hari). Sub-judul: "Kalau pola dua tahun itu berulang, sisa musim tinggal 17 hari dari 14 Okt. Ini pola kalender data, bukan ramalan model." Kata "diperkirakan berakhir" tidak dipakai (revisi tahap 2, bagian 8.5).

**Tiga angka ringkas di atas grafik:**
- **10/12** lokasi selesai di 31 Okt pada 2024 dan 2025.
- **8** lokasi makin parah tiap tahun, terbesar Palangka Raya–Sampit 90 → 289.
- **1** lokasi baru pertama kali di atas 55: Kototabang, sejak 9 Okt.

**Cara membaca linimasa:**

| Unsur | Arti |
|---|---|
| Batang tebal | Musim asap 2026 (PM2.5 di atas 55). Makin gelap makin parah, menurut rata-rata selama musim: 55–70, 70–100, 100–150, 150–250, ≥ 250 µg/m³ |
| Garis tipis abu-abu di bawah batang | Musim asap 2025, untuk membandingkan panjangnya |
| Batang bergaris putus | Sisa musim 2026 (perkiraan, sampai akhir musim tahun lalu) |
| Wajik hitam | Akhir musim 2025 |
| Bulatan kosong | Akhir musim 2024 |
| Garis hitam "kini 14 Okt" | Hari terbit |
| Area oranye muda sampai garis putus "berakhir 31 Okt" | 17 hari sisa musim |
| Kolom kanan, contoh "90 → 289 ▲221%" | **Rata-rata selama musim** 2025 → 2026, bukan nilai harian; label "baru" untuk lokasi tanpa musim 2025 |

**Kenapa hanya 12 baris dari 24 lokasi:** hanya lokasi yang pernah punya musim di atas 55 pada 2024–2026. Marunda di atas 55 sepanjang tahun (bukan musim), jadi dikeluarkan dari linimasa dan disebut di catatan bawah grafik. Banjarbaru diberi tanda **data beku** (sensor beku 7.329 jam; rata-rata musim persis 81 tiga tahun). **Dua yang tidak ikut "10/12":** Kototabang (belum punya riwayat) dan Sintang (2024 berakhir sedikit lebih awal).

Warna ISPU dipakai hanya untuk nilai harian. Linimasa memakai gradasi oranye musim asap (`RAMP` di `theme.ts`).

### 5.2 Kartu Lokasi

- **Judul berupa jawaban:** "Palangka Raya–Sampit: Berbahaya Besok".
- **Tiga angka utama** (tanpa angka presisi):
  1. **Besok:** kategori ISPU ("Berbahaya"), lalu "sekitar 1.150 µg/m³" (dibulatkan ke 50 untuk ≥ 1.000, ke 10 untuk ≥ 100).
  2. **Di atas 55, 7 hari ke depan:** "7 dari 7 hari", lalu "hampir pasti" / "kemungkinan besar" / "masih bisa berubah" dari peluang terendah.
  3. **Masuk {bulan}:** perubahan level tahun lalu, contoh "−82%".
- **Pemilih lokasi:** pil kecil, titik berwarna kategori ISPU besok, urut dari terburuk. Pil yang aktif bergaris dan bertulisan biru tua.
- **Grafik:** terukur, "diramal sehari sebelumnya" (rekam jejak, garis teal), prakiraan, dan pita rentang 80%. Angka lengkap hanya di tooltip.
- **7 kotak hari:** kategori + nilai bulat (≈ 1.150). Kotak H+2 ke atas bergaris putus karena belum lolos uji Holm. Kotak tanggal 1 diberi tanda "ganti bulan".
- **Kotak temuan:**
  > **27 dari 28 awal musim asap jatuh di tanggal 1.** Hari-hari sebelumnya tidak memberi tanda, jadi angka harian tidak bisa mendahuluinya. Yang bisa dipegang: kapan musim mulai dan selesai, dan berapa hari di atas 55.
- **Mode "Uji di Tanggal Lain":** angka utama berubah jadi diramal / terjadi / selisih (contoh 31 Agu: diramal 219, terjadi 421).

### 5.3 Kartu Dampak RS

Judul memuat selisih kasus 7 hari (contoh "+124 Kasus Napas dalam 7 Hari"). Rumus sama dengan halaman Simulasi.

### 5.4 Cerita "Seberapa Bisa Dipercaya?"

- Angka besar **25/25**: stasiun yang prakiraan besoknya lebih tepat dari menyalin.
- Kalimat: "Unggul tipis tapi konsisten."
- Tiga angka:
  - **17%** galat besok lebih kecil, rata-rata 0,24 µg/m³;
  - **25%** H+7, belum lolos uji statistik;
  - **81%** masuk rentang 80%, mendekati target.

### 5.5 Telusuri Lebih Dalam

- **Akurasi:** galat per horizon dan 7 pembanding, FAIRMODE, Diebold–Mariano dengan dan tanpa Holm, keandalan peluang, sensitivitas bobot, uji tanda, cakupan pindah bulan, uji balik kasus napas, alasan R² tidak dipakai.
- **Kualitas Data:** lencana per stasiun (satuan asumsi, sinyal kembar, optik, sensor murah, beku, interpolasi, bolong).
- **Cara Kerja:** data, yang ditebak, fitur, yang ditolak, penyetelan, rentang dan peluang, lapis transisi, linimasa, rekam jejak, kasus napas, struktur dataset, batasan.

---

## 6. Prinsip Menampilkan Angka

| Tempat | Yang ditampilkan |
|---|---|
| Angka besar dan kartu | Kategori, jumlah hari, perubahan musim, 25/25 dengan selisih absolut |
| Tooltip | Angka µg/m³ lengkap dan rentang 80% |
| Tab Akurasi | Semua uji, termasuk yang tidak menguntungkan |
| Tidak ditampilkan | R² dan "akurasi kategori": menyalin saja sudah memberi R² ≈ 1 pada data sehalus ini |

Tidak ada angka yang disembunyikan. Angka yang lemah tetap ada, hanya diberi label yang jujur.

**Yang tidak boleh diklaim:**
- "Model akurat 7 hari ke depan." Hanya H+1 yang lolos Holm.
- "Rentang terkalibrasi." Kupiec p = 0,034 di H+1; tulis "mendekati 80%".
- "Bisa meramal lonjakan." Model rata-rata kurang 83 µg/m³ saat lonjakan.
- "November aman." Linimasa berhenti di 31 Okt, dan di bawah 55 masih kategori Sedang.

---

## 7. Pertanyaan Juri dan Jawabannya

| Pertanyaan | Jawaban |
|---|---|
| "Setelah Holm hanya H+1 yang nyata." | Benar, dan itu yang kami tulis. H+7 ditandai "belum lolos uji", kotaknya bergaris putus. Secara gabungan model tetap menang di 25/25 stasiun di setiap horizon. |
| "Keunggulannya cuma 0,2 µg/m³." | Benar. Di dalam bulan data hampir datar, jadi menyalin pun sudah dekat. Karena itu angka harian tidak kami jadikan pesan utama; pesan utamanya kapan musim selesai. |
| "Grafik Pangkalan Bun naik 8–14 Okt, bukan tanggal 1." | "Awal musim asap" dihitung dari udara bersih (≤ 55). Pangkalan Bun sudah di atas 55 sejak Agustus; kenaikan 8–14 Okt bertahap dan tidak melewati ambang lonjakan besar. |
| "Data ini sintetis." | Benar, dan disebut terbuka. Yang bisa dipindahkan ke data nyata adalah metodenya: uji berjalan, pembanding naif, koreksi Holm, kalibrasi rentang. |
| "Palangka 1 Sep diramal 219, terjadi 421." | Lapis transisi menangkap arah lompatan (dari 95), tidak besarnya, karena musim 2026 jauh lebih parah. Mode "Uji di Tanggal Lain" menampilkan kasus ini apa adanya. |
| "Apa peran LightGBM kalau unggulnya cuma 0,24 µg/m³?" | Unggul tipis tapi konsisten di 25/25 stasiun. Nilai utama halaman ada di kalender musim dan peringatan pindah bulan, bukan di angka harian. Laporan tidak mengklaim lebih dari itu. |
| "Kenapa musim selalu 1 Agu–31 Okt persis?" | Itu pola kalender di data (sebagian lokasi mulai persis 1 Agu dan selesai persis 31 Okt), dari 2 tahun pembanding. Karena itu judulnya "Pada 2024 dan 2025, level turun di 1 Nov", bukan ramalan. |
| "Kenapa tidak modeling ulang?" | Model lain pun tidak bisa mendahului lompatan yang tidak punya tanda. Model yang menghafal pola tanggal 1 akan terlihat bagus tapi overfitting pada data sintetis. |
| "Kenapa tidak pakai cuaca atau titik api?" | Sudah diuji: tidak ada variabel di dataset yang bergerak sebelum lompatan. |
| "Apakah November aman?" | Tahun lalu 10 lokasi turun di bawah 55 mulai 1 Nov. Di bawah 55 masih kategori Sedang, bukan Baik, dan itu perkiraan dari pola, bukan model. |

---

## 8. Revisi Tim (14 Nov 2026) dan Insight

Sumber: catatan revisi Aditya (`REVISI_PRAKIRAAN.md`), dasar `prakiraan_verifikasi.json` v6 dan halaman di commit `ae94f7f`.

### 8.1 Diagnosis tim

> Di dalam satu bulan data hampir datar; lonjakan datang di pergantian bulan tanpa tanda sebelumnya. Model unggul tipis atas "salin hari ini" (sekitar 0,2 µg/m³) dan tetap telat saat lonjakan. Rentang di layar terlalu sempit untuk nilai ribuan sehingga memberi kesan presisi palsu. **Jangan ganti model; ubah cara menyajikan.**

Semua angka di catatan tim sudah dicocokkan dengan JSON dan **cocok**: 62/76, 27/28, 14,9% vs 2,7%, 1,86%, 0,985, 1,19 vs 1,43, 3,27 vs 4,36, −83,5 vs −109,6, 97,4% / 99,7%, 81% (Kupiec p = 0,034).

### 8.2 Usulan tim dan penerapannya

| Prioritas | Usulan | Diterapkan |
|---|---|---|
| P0 | Bingkai ulang: peringatan musim, bukan angka harian | Linimasa musim jadi kartu pertama; KPI "Bulan Asap Sama 3 Tahun" jadi KPI pertama |
| P0 | Hilangkan presisi palsu | Angka utama = kategori ISPU + nilai dibulatkan; rentang 80% hanya di tooltip dan pita grafik; kotak harian tanpa rentang |
| P1 | Tulis batas model secara jujur | Kotak temuan "27 dari 28 awal musim asap jatuh di tanggal 1" di kartu lokasi |
| P1 | Tampilkan peringatan pergantian bulan | Angka ketiga "Masuk Nov, 18 hari lagi: −82%"; tanda "ganti bulan" di kotak tanggal 1 |
| P2 | Rapikan klaim akurasi | Selisih 0,24 µg/m³ di KPI dan cerita; H+7 "belum lolos uji statistik"; cakupan "mendekati target" |
| — | Yang tidak diubah | Model, uji berjalan, pembanding, Diebold–Mariano + Holm, kartu RS, penggabungan Palangka Raya–Sampit |

**Belum diterapkan:** usulan memindahkan 7 kotak harian ke lipatan Telusuri. Kotaknya tetap di kartu lokasi, tetapi isinya sudah kategori dan nilai bulat.

### 8.3 Temuan tambahan saat verifikasi

1. **Hanya H+1 yang lolos Holm.** H+2 sampai H+7 p_holm 0,08–0,12. Klaim "25% di H+7" kini selalu disertai "belum lolos uji".
2. **Galat terkumpul di sedikit hari.** RMSE 9,97 vs MAE 1,19: hampir semua hari galatnya kecil, beberapa hari (tanggal 1) meleset jauh.
3. **Rentang 80% tidak palsu secara statistik** (cakupan 81%). Sempitnya karena data memang datar. Masalahnya di hari pindah bulan: cakupan turun ke 74%.
4. **97,4% / 99,7% untuk peluang > 55 tidak berarti banyak.** Saat data datar, menyalin pun hampir pasti benar, dan JSON tidak menyimpan pembandingnya.
5. **Keunggulan lebih kecil di dalam musim asap** (14,9%) daripada di luar musim (21,5%).
6. **Definisi "awal lonjakan"** hanya menghitung kenaikan dari udara bersih (bagian 2). Kalimat di halaman diganti dari "lonjakan dimulai tanggal 1" menjadi "awal musim asap jatuh di tanggal 1" supaya tidak bertentangan dengan grafik seperti Pangkalan Bun.

### 8.4 Insight

1. **Waktu bisa diramal, besarnya tidak.** Musim asap hampir selalu selesai 31 Okt, tetapi rata-ratanya melonjak (Palangka Raya–Sampit 90 → 289). Untuk perencanaan, tanggal adalah informasi paling berguna; untuk kesiapsiagaan, anggap besarnya bisa jauh di atas tahun lalu.
2. **Keterbatasan model adalah sifat data, bukan kelemahan metode.** Lonjakan di tanggal 1 tanpa tanda sebelumnya berarti tidak ada model harian yang bisa mendahuluinya. Menuliskannya terbuka lebih kuat di mata juri daripada menyembunyikannya.
3. **Prakiraan harian berguna sebagai kategori, bukan angka.** Selisih 0,2 µg/m³ pada nilai ribuan tidak bermakna bagi pembaca; "Berbahaya, 7 dari 7 hari" langsung bisa dipakai.
4. **Peringatan pergantian bulan adalah satu-satunya cara jujur "meramal" lonjakan.** Level bulan tahun lalu memberi arah perubahan (contoh −82% masuk November), walaupun besarnya tetap tidak pasti.
5. **Musim makin luas.** Kototabang baru pertama kali di atas 55 pada 2026; delapan lokasi makin parah tiap tahun.

Kalimat yang sama bisa dipakai di laporan BAB III/IV.

### 8.5 Revisi tahap 2 (cek ulang commit `62b2594`)

| # | Masalah menurut tim | Diterapkan |
|---|---|---|
| 1 | "Musim berakhir 31 Okt" terbaca sebagai ramalan, padahal pola kalender data dari 2 tahun | Judul kartu "Pada 2024 dan 2025, Level Turun di 1 Nov"; sub-judul "pola kalender data, bukan ramalan model"; garis "turun 1 Nov (2024–2025)"; legenda "sisa musim jika mengikuti 2025" |
| 2 | "Minggu Depan" membingungkan (prakiraan 15–21 Okt, juri menilai November) | Kepala halaman "Bagaimana Udara Sepekan Setelah Data Terakhir (14 Okt 2026)?"; ⓘ "Disimulasikan per 14 Okt 2026, hari terakhir data" |
| 3 | "Masuk Nov: −82%" dari 1 tahun analog yang ringan | Angka utama jadi arah ("Turun tajam"), persen pindah ke keterangan "pola 1 tahun (2025)" |
| 4 | Kasus RS ekstrapolasi | Catatan di kartu RS: "PM2.5 musim 2026 jauh di atas rentang data pembentuk rumus, jadi angka kasus bersifat ekstrapolasi". Batas PM 422 tidak dipakai supaya angka tetap konsisten dengan halaman Simulasi |
| 5 | Linimasa memuat stasiun bermasalah | Marunda keluar dari linimasa (catatan "di atas 55 sepanjang tahun, bukan musim"); Banjarbaru diberi tanda "data beku" |
| 6 | Peran LightGBM tipis | Jawaban juri ditambahkan di bagian 7; halaman tidak diubah |
| Kecil | "10 dari 13" vs "10/12" | Dokumen memakai 10/12 |

**Insight tambahan dari tahap 2:** halaman kini memisahkan dengan jelas tiga jenis informasi: **pola kalender** (kapan level turun, dari 2 tahun data), **prakiraan model** (7 hari, kategori ISPU), dan **ekstrapolasi** (kasus RS di luar rentang data). Juri bisa melihat sendiri mana yang diramal, mana yang pola, dan mana yang perkiraan kasar.

---

## 9. Sinyal Kembar Palangka Raya–Sampit

Data PM2.5 harian Palangka Raya (KTG-01) dan Sampit (KTG-02) berkorelasi 0,99995 (1.018 hari, selisih median 2,4%), padahal jaraknya sekitar 110 km dan alatnya berbeda (Thermo 5014i dan Met One BAM-1020). Stasiun lain yang paling mirip hanya berkorelasi 0,75 (Pangkalan Bun).

Ini sifat data sumber, bukan hasil model, jadi tidak bisa diperbaiki dengan pemodelan ulang. Keduanya ditampilkan sebagai satu lokasi "Palangka Raya–Sampit", dihitung sekali di KPI, dengan catatan di kartu lokasi dan lencana di tab Kualitas Data.

---

## 10. Gaya

- Teal untuk prakiraan, warna ISPU untuk nilai harian, gradasi oranye untuk musim asap, abu-abu untuk pembanding.
- Angka besar hanya di KPI, angka ringkas musim, dan cerita.
- Di layar sempit, angka ringkas musim jadi satu kolom, angka kanan linimasa disembunyikan (ada di tooltip), dan pemilih lokasi digeser horizontal.

Dihapus sejak v5: kalender bulanan, peta panas lokasi × 7 hari, daftar "Yang Berubah Kategori", jam rawan, Kerucut Waktu 3D, rentang 80% sebagai angka utama.

---

## 11. Berkas dan Cara Menjalankan

| Berkas | Isi |
|---|---|
| `scripts/prakiraan/prakiraan.py` | Model, uji berjalan, kalibrasi rentang, `struktur_bulanan` → `prakiraan_pm25.json`, `prakiraan_verifikasi.json`, `prakiraan_arsip.json` |
| `scripts/prakiraan/tambahan_v6.py` | Kalender bulanan, periode musim per tahun, uji tanda, kasus napas per RS, jam rawan → `prakiraan_v6.json` |
| `src/pages/Q7Prakiraan.tsx` | Halaman (komponen `Linimasa`, `Angka`, `Detail`, `KasusRS`) |
| `src/v4-prakiraan.css` | Gaya halaman |

```
python scripts/prakiraan/prakiraan.py --pakai-setelan
python scripts/prakiraan/tambahan_v6.py
```

### Belum dibangun

- Memindahkan 7 kotak harian ke Telusuri (usulan tim P0).
- Kalimat eksplisit soal kondisi November di kartu musim.
- Garis skenario eskalasi; tidak dijadikan angka karena gagal di validasi 2025.
