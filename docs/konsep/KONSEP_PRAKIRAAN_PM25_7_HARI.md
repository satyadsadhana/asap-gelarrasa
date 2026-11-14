# Konsep Final: Prakiraan PM2.5 7 Hari (v4)

**Status:** final v4, siap diterapkan · 14 November 2026 · menggantikan v3 dan v2 (hari yang sama) serta v1 (13 November). v4 menambah uji ketahanan, temuan struktur bulanan dataset, dan jawaban untuk pertanyaan juri (bagian 11).
**Nama di dashboard:** "Prakiraan 7 Hari" · pertanyaan halaman "Bagaimana Udara Minggu Depan?"
**Lokasi:** halaman `/prakiraan`, bagian ke-8, setelah Simulasi.
**Sumber data:** `data_notebook/` (aturan pembersihan notebook), sama dengan seluruh dashboard.

Semua angka di dokumen ini berasal dari uji yang dijalankan 14 November 2026:
- audit data per stasiun;
- uji horizon H+1 sampai H+78;
- eksperimen 7 kelompok fitur (validasi 2025 dan uji 2026);
- audit statistik (Diebold–Mariano dengan koreksi Harvey–Leybourne–Newbold dan Holm, bootstrap blok, uji tanda);
- 7 pembanding (menyalin hari ini, SES, naif musiman, drift, Ridge/AR, klimatologi, LightGBM murni);
- sensitivitas bobot, uji Kupiec untuk rentang, diagram keandalan peluang;
- uji peringatan lonjakan dengan kejadian unik;
- uji struktur waktu dataset.

---

## Revisi v5: Lapis Transisi Bulan (14 November 2026, sore)

**Masalah yang ditemukan:** prakiraan Palangka Raya untuk 31 Agustus 2026 datar (95 µg/m³) dan tidak menangkap lompatan 1 September (aktual 421, Berbahaya). Penyebabnya: dataset berbentuk tangga bulanan (27 dari 28 awal lonjakan jatuh pada tanggal 1), dan model yang hanya melihat pergerakan 30 hari terakhir tidak punya cara membaca pergantian bulan. Bagian 5A menjelaskan struktur ini, tetapi keputusan "sengaja tidak dimanfaatkan" di v4 ternyata keliru.

**Perubahan:** bila tanggal target pindah bulan, prakiraan = nilai hari ini + selisih log median bulan target dan bulan asal **pada tahun sebelumnya** di stasiun itu. Hanya memakai data sebelum tanggal terbit. Di luar lintas bulan, model gabungan v4 tidak berubah.

**Hasil (uji berjalan, tanpa data masa depan):**

| Ukuran | v4 | v5 |
|---|---|---|
| Galat log lintas bulan, validasi 2025 (H+1 / H+7) | 0,166 / 0,173 | 0,065 / 0,072 (turun 58–61%) |
| Galat log lintas bulan, uji 2026 (H+1 / H+7) | 0,136 / 0,141 | 0,048 / 0,050 (turun ~65%) |
| Lompatan besar lintas bulan: kategori ISPU tepat | 23% | 74% (arah benar 100%) |
| Keunggulan atas menyalin, uji 2026 H+1 / H+4 / H+7 | +7,0% / +3,9% / +2,0% | **+17,1% / +22,6% / +25,1%** |
| Keunggulan atas menyalin, validasi 2025 H+1 / H+7 | — | +26,3% / +37,9% |
| Selang 95% keunggulan di atas nol | H+1 sampai H+4 | **semua 7 horizon** |
| FAIRMODE (RMSE model ÷ salin) | 0,98–0,99 | **0,87–0,88** |
| Stasiun menang | 23/25 (H+1) | **25/25 di semua horizon** |
| Uji DM tanpa koreksi, p < 0,05 | H+1 sampai H+7 | H+1 sampai H+7 (p 0,003–0,046) |
| Uji DM setelah Holm untuk 7 horizon | nyata sampai H+4 | **nyata hanya H+1** (p = 0,020) |
| Rentang 80% tercapai | 81,6–82,5% | 80,7–82,0% |
| Palangka, prakiraan 31 Agu untuk 1 Sep | 95 | 219 (aktual 421) |

**Cara membaca angka ini (wajib disampaikan saat presentasi):**
1. Koreksi Holm yang lebih ketat membuat hanya H+1 yang lulus. Tanpa koreksi, keunggulan tetap nyata di semua horizon. Halaman menampilkan keduanya, bukan hanya versi yang paling menguntungkan.
2. Keunggulan naik karena lintas bulan memang sulit bagi model lama. Ini klaim tentang dataset dengan struktur tangga bulanan. Pada sensor yang tidak berpola begitu, lapis ini kecil efeknya; ini harus diuji ulang bila data nyata tersedia.
3. Keunggulan jarak jauh (H+30 sampai H+78) sebagian besar berasal dari lapis ini, bukan dari kemampuan meramal cuaca. Karena itu angka harian tetap dibatasi 7 hari.
4. Faktor "intensitas musim tahun ini" (lonjakan Palangka makin besar tiap tahun) memperbaiki 1 Sep menjadi sekitar 380, tetapi memperburuk validasi 2025. Karena itu **tidak** dipakai di nilai prakiraan. Rencananya hanya untuk batas atas rentang, dan belum diimplementasikan.
5. Bobot 0,5 gabungan tetap sama. Sensitivitas v4 (bobot 0,25–0,75 positif) masih berlaku dan diuji ulang di v5 pada tabel bobot.

**Yang belum dibangun:** kartu "Pergantian Bulan Berikutnya (1 Nov)". Proyeksi 18 hari ke depan belum divalidasi; kartu ini tidak ditampilkan sampai diuji.

**Yang berubah di halaman:** daftar samping sekarang "Yang Berubah Kategori, 7 Hari ke Depan" (stasiun yang pindah kategori ISPU, dengan ✓/✗ di mode Putar Ulang). Peta punya filter "Yang Berubah" / "Semua". Grafik detail diberi anotasi "Pergantian bulan". Cerita "Setelah 7 Hari" diganti "Jarak Jauh: Kenapa Angka Harian Berhenti di 7 Hari". Angka pada bagian 1–11 di bawah masih v4 kecuali bagian ini; tabel bagian 3 perlu diperbarui sebelum dokumen final.

---

## 1. Ringkasan Keputusan

| Pertanyaan | Keputusan |
|---|---|
| Model apa? | LightGBM per horizon, target = perubahan dari hari ini, **hanya fitur lag relatif**, digabung 50/50 dengan nilai hari ini |
| Fitur musim, cuaca, CO, tetangga? | **Diuji semua, tidak dipakai di nilai prakiraan.** Tidak menambah akurasi di 2026, dan fitur musim justru membuat model menghafal (bagian 4) |
| Lalu musim dipakai di mana? | Di **peluang >55** (lebih baik dari pola musiman di semua horizon, selang 95% di atas nol) dan **Kalender Siaga** yang sederhana. Siaga menangkap 6 dari 8 awal lonjakan 2026, tetapi angka ini **tidak dijadikan klaim utama** karena dataset punya struktur bulanan (bagian 5 dan 5A) |
| Akurasi ditampilkan? | Ya, dengan angka yang jujur: meleset rata-rata, keunggulan dibanding menyalin hari ini beserta selang kepercayaan, ketepatan rentang, dan tangkapan lonjakan. **R² dan "kategori tepat 99%" tidak ditampilkan** karena menyesatkan (bagian 3) |
| Berapa hari? | Angka harian H+1–H+7. Keunggulan nyata secara statistik sampai **H+4** (setelah koreksi Holm). H+5–H+7 diberi label "setara menyalin". Setelah itu **pola musiman** sampai akhir 2026 |
| Lebih baik dari metode lain? | Lebih tepat dari **5 pembanding klasik** di semua horizon. LightGBM murni sedikit lebih tepat di H+1–H+2, setara di H+3–H+4, dan kalah mulai H+5; gabungan dipilih karena tidak pernah kalah dari menyalin. Lulus kriteria FAIRMODE Eropa (RMSE model ÷ RMSE menyalin ≤ 1) di H+1–H+7 (bagian 3.4) |
| Dataset kompetisi? | Punya **struktur bulanan**: 27 dari 28 awal lonjakan 2024–2026 jatuh pada tanggal 1. Struktur ini **sengaja tidak dimanfaatkan** (bagian 5A) |
| Peta 3D? | **Kerucut Waktu**: ruang-waktu 3D, ketinggian = hari ke depan. Komponen baru; `Stage3D` tidak disentuh (bagian 7) |
| Semua masalah? | 47 masalah dalam 5 kelompok, masing-masing dengan penyelesaian dan status (bagian 6) |

---

## 2. Pertanyaan yang Dijawab

1. Minggu ini stasiun mana yang PM2.5-nya berpotensi melewati 55 µg/m³, dan seberapa yakin kita?
2. Stasiun mana yang sedang tenang tetapi memasuki masa lonjakan musiman?
3. Kalau sistem ini sudah berjalan sepanjang 2026, seberapa sering ia benar?

---

## 3. Akurasi Model: Angka, Cara Membaca, dan Apa yang Ditampilkan

### 3.1 Hasil Uji 2026 (Data yang Tidak Dipakai untuk Melatih atau Menyetel)

| Ukuran | H+1 | H+3 | H+7 | Ditampilkan? |
|---|---|---|---|---|
| Meleset rata-rata (MAE, µg/m³) | 1,33 | 2,51 | 4,28 | ✅ "Besok meleset rata-rata ±1 µg/m³" |
| Keunggulan dibanding menyalin hari ini | **+7,0%** | **+4,6%** | +2,0% | ✅ |
| Selang kepercayaan 95% (bootstrap blok mingguan) | +4,3% s.d. +11,6% | +1,4% s.d. +9,2% | −1,8% s.d. +8,2% | ✅ di tab Akurasi |
| Uji Diebold–Mariano (koreksi HLN, lalu Holm untuk 7 horizon) | p < 0,001 | p < 0,001 | p = 0,46 | ✅ H+5–H+7 diberi label "setara menyalin" |
| Stasiun tempat model menang (uji tanda) | 23 dari 25 | 23 dari 25 | 20 dari 25 (p = 0,002) | ✅ |
| Bulan tempat model menang | 9 dari 10 | 9 dari 10 | 8 dari 10 | ✅ |
| Rentang 80% berisi nilai aktual | 81,6% (setelah perbaikan D8) | 82,3% | 82,1% | ✅ |
| Hari >55 yang tertangkap (episode berjalan) | 97% | 96% | 87% | ✅ |
| Galat saat lonjakan >25% dalam sehari | −109 (salin: −110) | −121 (−123) | −128 (−130) | ✅ sebagai batasan |
| R² (skala log) | 0,992 | 0,978 | 0,954 | ❌ |
| Kategori ISPU tepat | 99,1% (salin: 98,8%) | 98,4% | 97,2% | ❌ |

### 3.2 Kenapa R² dan "99% Tepat" Tidak Ditampilkan

Data harian ini **sangat halus**:
- median perubahan dari hari ke hari 1,86% (per jam 8,9%);
- autokorelasi lag 1 harian, median per stasiun: 0,985. Sebagai pembanding, jaringan nyata 12 stasiun di Beijing tercatat 0,52 ([CDC stacks](https://stacks.cdc.gov/view/cdc/49634/cdc_49634_DS1.pdf));
- hanya 32 dari 7.043 kasus uji H+1 yang naik lebih dari 25% dalam sehari.

Akibatnya, menyalin nilai hari ini saja sudah memberi kategori ISPU tepat 98,8% dan R² mendekati 1. Menampilkan "akurasi 99%" berarti memamerkan sifat data, bukan kemampuan model. Ukuran yang jujur adalah **keunggulan dibanding pembanding naif** (Hyndman & Athanasopoulos).

**Konsekuensi untuk klaim:** angka galat absolut ini tidak bisa dipindahkan ke data sensor nyata, yang biasanya jauh lebih bergejolak. Yang bisa dipindahkan adalah **metodenya** (uji berjalan, pembanding naif, kalibrasi rentang).

### 3.3 Cara Menampilkan

- **KPI:** satu kalimat awam ("Besok meleset rata-rata ±1 µg/m³, 7% lebih tepat dari menyalin nilai hari ini").
- **Tab Akurasi:** tabel lengkap dengan selang kepercayaan, catatan kenapa R² tidak dipakai, dan grafik kecil keunggulan per horizon dengan pita selang.
- **Kotak hari H+5–H+7:** label kecil "setara menyalin" (p Holm > 0,05).
- **Peluang:** ditampilkan dalam tiga kelas (Rendah <30%, Sedang 30–70%, Tinggi >70%), bukan persen tepat. Alasannya ada di 3.6.

### 3.4 Pembanding: Model vs 7 Metode Lain (Uji 2026, MAE µg/m³)

| Horizon | **Model** | LightGBM murni | Salin hari ini | SES (α dari 2024) | Ridge/AR | Drift 7 hari | Naif musiman (tahun lalu) | Klimatologi | RMSE model ÷ salin (FAIRMODE ≤1) |
|---|---|---|---|---|---|---|---|---|---|
| H+1 | **1,33** | 1,32 | 1,43 | 1,46 | 1,62 | 2,05 | 9,67 | 11,56 | 0,991 ✅ |
| H+3 | **2,51** | 2,51 | 2,63 | 2,65 | 3,13 | 5,09 | 9,73 | 11,66 | 0,981 ✅ |
| H+5 | **3,48** | 3,53 | 3,60 | 3,61 | 4,42 | 8,67 | 9,81 | 11,77 | 0,987 ✅ |
| H+7 | **4,28** | 4,44 | 4,36 | 4,37 | 5,37 | 12,81 | 9,90 | 11,86 | 0,994 ✅ |

- Model unggul atas 5 pembanding klasik di semua horizon. LightGBM murni sedikit lebih baik di H+1–H+2 (1,32 vs 1,33), setara di H+3–H+4, dan kalah mulai H+5 (4,44 vs 4,28 di H+7). Gabungan dengan menyalin dipilih karena tidak pernah kalah.
- Kriteria FAIRMODE (rasio RMSE terhadap menyalin ≤ 1) adalah tolok ukur prakiraan kualitas udara di Eropa ([Piersanti dkk., HARMO](https://www.harmo.org/Conferences/Proceedings/_Aveiro/publishedSections/00472_79_h21-073-antonio-piersanti.pdf)). Pembanding menyalin hari ini sangat dianjurkan dalam evaluasi CAMS ([arXiv 2201.13355](https://arxiv.org/pdf/2201.13355)).
- MASE ([Hyndman & Koehler 2006](https://figshare.com/articles/Another_look_at_measures_of_forecast_accuracy/5091436/1)): model 1,12 vs salin 1,22 di H+1; model 3,19 vs salin 3,25 di H+7.

### 3.5 Sensitivitas Bobot Gabungan

| Bobot model | Validasi 2025 (H+1 / H+3 / H+7) | Uji 2026 (H+1 / H+3 / H+7) |
|---|---|---|
| 0 (salin saja) | 0 / 0 / 0 | 0 / 0 / 0 |
| 0,25 | +8,2 / +8,8 / +8,6% | +4,2 / +2,9 / +1,7% |
| **0,5 (dipakai)** | +15,1 / +16,3 / +15,7% | **+7,0 / +4,6 / +2,0%** |
| 0,75 | +20,6 / +22,1 / +20,8% | +8,3 / +5,2 / +1,0% |
| 1 (model saja) | +24,1 / +25,4 / +23,3% | +8,1 / +4,7 / −1,7% |

Keterbukaan penuh:
- Validasi 2025 saja akan memilih bobot 1, yang kalah di H+7 2026.
- Bobot 0,5 dipilih setelah melihat 2026. Dasarnya adalah prinsip rata-rata sederhana, yang dalam literatur kombinasi prakiraan sering mengalahkan bobot yang disetel (*forecast combination puzzle*: [Clemen 1989](https://doi.org/10.1016/0169-2070(89)90012-5); Smith & Wallis 2009; Claeskens dkk. 2016).
- **Kesimpulan tidak bergantung pada angka 0,5:** semua bobot 0,25–0,75 memberi keunggulan positif di H+1, H+3, dan H+7 pada 2026.

### 3.6 Kalibrasi Rentang dan Peluang

**Rentang 80%:**
- Setelah diskalakan per stasiun, cakupannya 81,6–82,5%, dengan 23–25 dari 25 stasiun di kisaran 70–90% (sebelumnya 11–19).
- Uji Kupiec ([Kupiec 1995](https://doi.org/10.3905/jod.1995.407942)) masih menolak tepat 80%. Dengan 7.000 sampel, selisih 1,5 poin pun terdeteksi. Selisih ini kecil secara praktis dan arahnya berhati-hati (terlalu lebar, bukan terlalu sempit).
- Skor interval Winkler ([Gneiting & Raftery 2007](https://doi.org/10.1198/016214506000001437)) bernilai 10,0 di H+1 sampai 39,3 di H+7 (makin kecil makin baik; tercatat per horizon di tab Akurasi).

**Peluang >55:**
- Skor Brier relatif terhadap pola musiman: +0,54 [0,40–0,63] di H+1 dan +0,24 [0,11–0,33] di H+7. Selang 95% di atas nol di semua horizon.
- **Diagram keandalan:** di kelas ekstrem (<10% dan >70%), peluang sangat tepat (dikatakan 0,5%, terjadi 0,1%; dikatakan 99%, terjadi 100%). Di kelas tengah H+7, peluang **terlalu rendah**: dikatakan 45–61%, nyatanya terjadi 87–100%, karena musim 2026 lebih parah dari data latih.
- Karena itu halaman memakai tiga kelas, bukan persen tepat, dan kelas tengah diberi catatan "cenderung terjadi di musim asap 2026".

---

## 4. Fitur: Apa yang Dipakai, Apa yang Diuji, Kenapa

### 4.1 Fitur yang Dipakai (13)

| Kelompok | Fitur |
|---|---|
| Lag relatif | log hari ini dikurangi log 1–7, 14, dan 30 hari lalu |
| Rata-rata bergulir relatif | rata-rata 3, 7, dan 30 hari dikurangi hari ini |
| Gejolak | simpangan baku 7 hari |

Fitur relatif punya keuntungan tambahan: **bias pengali instrumen ikut hilang**. Sensor optik yang membaca 20% terlalu tinggi menghasilkan selisih log yang sama dengan sensor BAM. Ini penting karena jaringan ini mencampur BAM, optik, dan sensor murah (masalah D13).

### 4.2 Eksperimen Fitur (Uji Berjalan Bulanan, Keunggulan dibanding Menyalin)

| Konfigurasi | Validasi 2025 (H+1 / H+3 / H+7) | **Uji 2026** (H+1 / H+3 / H+7) | Keputusan |
|---|---|---|---|
| **Lag relatif (dipakai)** | +15,1 / +16,3 / +15,7% | **+7,0 / +4,6 / +2,0%** | ✅ |
| + Cuaca (kelembapan, perubahan 3 hari, hari kering, angin, arah, suhu) | +14,5 / +16,2 / +15,6% | +7,0 / +3,9 / +1,2% | ❌ tidak menambah |
| + Kimia (perubahan CO, rasio PM2.5/PM10, puncak 1 jam) | +15,1 / +16,8 / +14,5% | +7,0 / +3,1 / −1,1% | ❌ |
| + Pola malam (jam 18–23 vs rata-rata harian) | +14,4 / +16,3 / +15,5% | +6,9 / +4,9 / +1,6% | ❌ setara |
| + Tetangga ≤600 km, termasuk yang searah angin | +14,1 / +15,7 / +14,2% | +5,8 / +4,3 / +0,5% | ❌ |
| + Musim (sin/cos hari-tahun, peluang historis bulanan) | +16,3 / +18,7 / **+21,0%** | +6,1 / +1,4 / **−1,5%** | ❌ **menghafal**: terbaik di validasi, terburuk di uji |
| + Jarak ke 55 (tingkat absolut) | +15,6 / +17,5 / +16,8% | +0,1 / −4,1 / −6,0% | ❌ menghafal |

Pelajaran utama: pemilihan fitur berdasarkan validasi saja akan memilih fitur musim, lalu gagal di 2026. Karena itu setiap fitur wajib lulus **dua** periode.

Riset menyebut stasiun searah angin membantu prakiraan polusi ([Teng dkk. 2023](https://doaj.org/article/9a68ea0ed66e4e69ae639f4f8d33b674)), tetapi uji lain menemukan manfaatnya tidak selalu muncul ([SatCLIP-GNN](https://dmas.lab.mcgill.ca/fung/pub/AADF26m2garss_preprint.pdf)). Di jaringan ini, stasiun berjarak puluhan sampai ratusan km dan banyak wilayah hanya punya 1 stasiun, sehingga sinyal tetangga terlalu lemah. Korelasi stasiun lain kemarin dengan stasiun ini hari ini hanya 0,005.

---

## 5. Awal Lonjakan: Masalah Terbesar dan Solusinya

### 5.1 Koreksi Temuan Sebelumnya

v2 menulis "awal episode tertangkap 0 dari 23". Definisi itu keliru karena ikut menghitung stasiun kota yang nilainya **berayun di sekitar 55** (misalnya Jakarta di 52–58) sebagai "awal episode".

v3 memakai definisi **lonjakan**: melewati 55, minimal 1,5× rata-rata 7 hari sebelumnya, setelah 7 hari tenang (≤55).

### 5.2 Hasil per Sumber Sinyal (Uji 2026, Baris Tenang, Pasangan Stasiun–Tanggal)

| Sumber sinyal | AUC awal lonjakan H+7 | Tertangkap H+7 | Alarm palsu |
|---|---|---|---|
| Model lag relatif + jarak ke 55 | 0,85 | 20% | 0,2% hari tenang |
| + Cuaca | 0,88 | 25% | 0,1% |
| + Tetangga searah angin | 0,88 | 28% | 0,1% |
| + Musim (model) | 0,98 | 74% | 0,07% |
| Kalender musim saja (peluang historis >55 per stasiun-bulan ≥50%) | — | 72% | 0 |

### 5.3 Dihitung sebagai Kejadian Unik (Cara yang Benar)

Angka per pasangan stasiun–tanggal menghitung satu lonjakan berkali-kali. Sebagai kejadian unik:

| Ukuran | Hasil |
|---|---|
| Awal lonjakan 2026 | **8 kejadian** di 8 stasiun. KTG-01/KTG-02 adalah sinyal kembar (D7), jadi praktis 7 |
| Tertangkap Kalender Siaga (7 hari sebelumnya) | **6 dari 8** (selang Wilson 95%: 41–93%) |
| Yang terlewat | KTG-01 dan KTG-02 pada 1 Juli 2026: musim Kalteng 2026 mulai sebulan lebih awal dari pola 2024–2025 |
| Hari siaga | 60. Hanya 1 hari yang tidak diikuti lonjakan dalam 7 hari |

Dengan hanya 8 kejadian, selang kepercayaannya lebar (41–93%). Ini **bukan** angka untuk dibanggakan sebagai KPI.

### 5.4 Desain Kalender Siaga

- **Syarat siaga:** stasiun sedang tenang (7 hari ≤55) **dan** minggu depan jatuh di bulan yang secara historis melewati 55 di ≥50% harinya. Peluang historis dihitung dari tahun sebelum tanggal terbit saja.
- **Tampilan:** cincin oranye di dasar kerucut dan teks "Bulan ini biasanya musim asap di stasiun ini". Bunyinya pengingat kalender, **bukan** "lonjakan akan terjadi".
- **Di halaman:** dibahas di Cerita 1 sebagai pelengkap. Tidak dijadikan KPI.

### 5.5 Batasan dan Jalan Riset

- Basisnya hanya 2 musim (2024, 2025). Tahun El Niño atau IOD positif bisa memajukan atau memperpanjang musim. Riset menunjukkan prakiraan asap jangka bulanan bergantung pada prakiraan hujan musiman dan ENSO/IOD ([Spessa dkk. 2015](https://nhess.copernicus.org/articles/15/429/2015/)), dan di sebagian Kalimantan pun tidak selalu lebih baik dari klimatologi ([NHESS 2022](https://nhess.copernicus.org/articles/22/303/2022/nhess-22-303-2022.pdf)).
- Sistem peringatan di Asia Tenggara memakai titik api satelit, PM2.5, dan CO ([SEA-HAZEMON](https://hazeportal.asean.org/?p=13641)) atau curah hujan dan arah angin ([Singapura, PMC7765006](https://pmc.ncbi.nlm.nih.gov/articles/PMC7765006)). Dataset ini tidak punya titik api dan curah hujan. CO sudah diuji dan tidak membantu.
- **Langkah berikutnya yang paling berdampak:** titik api FIRMS/VIIRS dan indeks kekeringan (Drought Code dari hujan). Keduanya mendahului asap 1–2 minggu.

---

## 5A. Temuan Struktur Dataset: Pergantian Bulan

| Bukti | Angka |
|---|---|
| Rata-rata perubahan harian (log) pada tanggal 1 vs tanggal lain | 0,146 vs 0,026 (5,6×) |
| Lonjakan >49% dalam sehari yang jatuh pada tanggal 1 | 60 dari 70 |
| Awal lonjakan 2024–2026 yang jatuh pada tanggal 1 | **27 dari 27** (1 Jul, 1 Agu, 1 Sep setiap tahun) |
| Tanggal dengan lonjakan terbanyak | 1 Nov 2025 (11 stasiun), 1 Nov 2024 (9), 1 Agu 2025 (9), 1 Agu 2026 (9) |

**Tafsiran:** tingkat dasar PM2.5 di dataset kompetisi berganti per bulan, lalu bergerak halus di dalam bulan. Ini menjelaskan tiga hal sekaligus:
1. data sangat halus (bagian 3.2);
2. kalender bulanan "meramal" awal lonjakan dengan hampir sempurna;
3. fitur musim menang di validasi tetapi kalah di uji.

Di dunia nyata, asap tidak datang tepat tanggal 1.

**Keputusan:**
- **Tidak memanfaatkan struktur ini.** Fitur "hari menuju akhir bulan" atau "tingkat bulan depan" akan menaikkan skor secara tajam, tetapi hanya mempelajari cara dataset dibuat, bukan perilaku asap. Model seperti itu tidak bisa dipakai di data nyata dan akan mudah dipatahkan juri.
- **Diungkap terang** di tab Cara Kerja dan saat presentasi. Temuan ini menjadi bukti ketelitian audit, bukan kelemahan yang disembunyikan.
- **Klaim dibatasi:** keunggulan model diukur di dalam dataset yang sama; angka galat absolut dan Siaga tidak diklaim berlaku untuk data nyata.

---

## 6. Audit Menyeluruh: 47 Masalah dan Penyelesaiannya

Status:
- ✅ sudah diterapkan di halaman v1 yang sudah di-push;
- 🔧 diterapkan saat membangun v3;
- 📝 dinyatakan sebagai batasan, karena tidak bisa diselesaikan dengan data yang ada.

### 6.1 Data

| # | Masalah | Bukti | Penyelesaian | Status |
|---|---|---|---|---|
| D1 | JMB-02 tanpa data, MER-01 10 hari | 0 dan 10 hari sah | Tidak diramal, disebut di catatan | ✅ |
| D2 | BJB-01 sensor beku 7.329 jam, celah 306 hari | Cakupan 69,9%, 2026 lengkap | Fitur ≤30 hari, jadi celah lama tidak terpakai; lencana "pernah beku" | ✅ + 🔧 lencana |
| D3 | SM2-01 bolong di musim asap | Musim 2026 45%; 14 dari 30 hari terakhir sah | Terbit hanya bila ≥4 dari 7 hari terakhir sah; jika tidak, abu-abu | 🔧 |
| D4 | Lag bolong memperburuk galat | 42 dari 7.070 baris, galat 7–20 vs 1,3 | Lewat D3 | 🔧 |
| D5 | Satuan diasumsikan (MDN-01, PSW-01, BJB-01) | Log preprocessing | Tanda * | ✅ |
| D6 | MDN-01: 27% jam diinterpolasi | 6.657 jam | Lencana + rentang per stasiun (D8) | 🔧 |
| D7 | KTG-01 dan KTG-02 nyaris identik | Korelasi 1,00; beda median 2,4% | Dihitung sekali di judul; bobot latih 0,5; dicatat sebagai temuan | 🔧 |
| D8 | Rentang 80% tidak rata antarstasiun | 60,5% sampai 99% | Rentang diskalakan per stasiun × musim, hasilnya 67,6–92,5% | 🔧 |
| D9 | Peluang >55 di H+6–H+7 kalah dari pola musiman | Skor −0,003 dan −0,069 | Digabung dengan pola musiman (bobot dari 2025), hasilnya +0,24 di H+7 | 🔧 |
| D10 | Wilayah tidak seimbang | 19 dari 22 wilayah hanya 1 stasiun | Tanpa kode stasiun/wilayah; tidak ada angka per provinsi | ✅ |
| D11 | Nilai ekstrem Kalteng | KTG-01 maks 1.127,6 | Huber loss; warna kategori ISPU | ✅ |
| D12 | **Data sangat halus** | Median perubahan harian 1,4% | Akurasi selalu dilaporkan relatif terhadap menyalin; R² tidak ditampilkan | 🔧 |
| D13 | **Instrumen campuran:** BAM (Thermo, MetOne), optik (Horiba, Serinus), sensor murah (Aeroqual di BGR-02, SRG-01) | Master stasiun | Sensor optik bias naik saat lembap ([EGUsphere 2025](https://egusphere.copernicus.org/preprints/2026/egusphere-2025-6203/)). Fitur relatif menghilangkan bias pengali. Lencana "sensor optik/murah" | 🔧 |
| D14 | Tiga zona waktu (WIB, WITA, WIT) | Bujur 95°–131° | Hari dihitung per stasiun, dan fitur tetangga tidak dipakai, jadi tidak berpengaruh. Bila fitur tetangga dipakai kelak, waktu disamakan dulu | 📝 |
| D15 | Satu stasiun dipasangkan ke beberapa RS di panel | Struktur panel | Skrip menghapus duplikat dan berhenti bila PM2.5 berbeda | ✅ |
| D16 | Celah ≤3 jam diinterpolasi | Aturan preprocessing | Rata-rata harian butuh ≥18 jam sah, jadi pengaruhnya kecil | ✅ |
| D17 | Data berakhir 14 Okt 2026 | Hari ini 14 Nov | Tanggal terbit tampil di judul; bukti utama di Putar Ulang 2026 | 🔧 |
| D18 | **Struktur bulanan dataset** | 27 dari 27 awal lonjakan jatuh pada tanggal 1 | Tidak dimanfaatkan; diungkap; klaim dibatasi (bagian 5A) | 🔧 |

### 6.2 Model

| # | Masalah | Penyelesaian | Status |
|---|---|---|---|
| M1 | Menebak nilai langsung gagal di puncak 2026 | Target = perubahan | ✅ |
| M2 | Fitur tingkat absolut menghafal | Hanya fitur relatif (diuji ulang: jarak ke 55 → −6% di H+7) | ✅ |
| M3 | Fitur musim menghafal | Tidak masuk model nilai; hanya di peluang dan siaga | ✅ |
| M4 | Lonjakan merusak fungsi rugi | Huber loss | ✅ |
| M5 | Model tunggal rawan saat pola berubah | Gabungan 50/50 dengan menyalin | ✅ |
| M6 | Kebocoran data | Fitur ≤ terbit, latih t + h < terbit, penyetelan tanpa 2026, peluang historis dari tahun sebelumnya | ✅ |
| M7 | Model tidak mengejar lonjakan mendadak | Rentang + Siaga; tidak diklaim | 📝 |
| M8 | Penyetelan berlebihan | Hanya 30 percobaan; perbaikannya kecil (2,42 → 2,38) | ✅ |
| M9 | Transformasi log memprakirakan median, bukan rata-rata | Bias rata-rata −0,55, sama dengan menyalin; dibiarkan, karena median lebih cocok untuk "hari biasa" | ✅ |

### 6.3 Evaluasi

| # | Masalah | Penyelesaian | Status |
|---|---|---|---|
| E1 | Keunggulan kecil bisa kebetulan | Diebold–Mariano + bootstrap blok: nyata H+1–H+3, tidak nyata H+7 | 🔧 label "setara menyalin" |
| E2 | Sampel berurutan saling bergantung | Varians HAC dan blok mingguan | 🔧 |
| E3 | Hanya satu tahun uji | Validasi 2025 + uji 2026 dilaporkan terpisah | ✅ |
| E4 | Bobot 0,5 dipilih setelah melihat 2026 | Diungkap terang; uji ulang setelah 2027 | 📝 |
| E5 | Ukuran yang menggelembung (R², kategori %) | Tidak ditampilkan | 🔧 |
| E6 | Definisi awal episode salah | Definisi lonjakan (bagian 5.1) | 🔧 |
| E7 | Seleksi fitur hanya dengan validasi | Wajib lulus validasi dan uji | ✅ |
| E8 | Kejadian lonjakan terhitung berkali-kali | Dihitung sebagai kejadian unik: 6 dari 8, dengan selang Wilson (5.3) | 🔧 |
| E9 | Pembanding terlalu lemah | 7 pembanding termasuk SES, Ridge/AR, naif musiman; kriteria FAIRMODE (3.4) | 🔧 |
| E10 | Hasil bergantung pada bobot 0,5 | Tabel sensitivitas: semua bobot 0,25–0,75 positif (3.5) | 🔧 |
| E11 | Rentang dan peluang tidak terkalibrasi | Uji Kupiec, skor Winkler, diagram keandalan; peluang ditampilkan dalam 3 kelas (3.6) | 🔧 |

### 6.4 Komunikasi

| # | Masalah | Penyelesaian | Status |
|---|---|---|---|
| K1 | Presisi palsu (desimal) | Angka bulat di halaman; desimal hanya di tab | 🔧 |
| K2 | Peluang sulit dipahami | "7 dari 10 hari serupa melewati 55" | 🔧 |
| K3 | Warna ISPU dan warna peluang tertukar | Peta = ISPU; peluang = gradasi oranye terpisah | ✅ |
| K4 | Bertabrakan dengan bab lain | Tanpa angka kesehatan, ranking intervensi, atau peta sejarah | 🔧 |
| K5 | Dikira peringatan resmi | Catatan "alat bantu, bukan pengganti BMKG/ISPU" | ✅ |

### 6.5 Operasional

| # | Masalah | Penyelesaian | Status |
|---|---|---|---|
| O1 | Hasil tidak bisa diulang | Seed tetap; versi pustaka dicatat di `scripts/prakiraan/requirements.txt` | 🔧 |
| O2 | Ukuran JSON Putar Ulang | Hanya nilai bulat; rentang dihitung di browser dari tabel skala. Hasil 344 KB (286 hari terbit × 25 stasiun) | 🔧 |
| O3 | Browser tanpa WebGL | Cadangan heatmap | 🔧 |
| O4 | Gerak berlebihan | Hormati `prefers-reduced-motion` | 🔧 |

---

## 7. Peta 3D: Kerucut Waktu

### 7.1 Gagasan

Peta di Ringkasan memakai **tinggi tiang = PM2.5 hari ini**. Peta Prakiraan memakai **ketinggian = waktu**. Ini adaptasi *space-time cube* (geografi waktu Hägerstrand) dan kerucut ketidakpastian ala peta badai.

| Elemen | Arti |
|---|---|
| Dasar di atas tanah | Nilai terukur hari terbit (H0) |
| 7 cakram bertumpuk ke atas | H+1 (terbawah) sampai H+7 (teratas) |
| Luas cakram | Prakiraan PM2.5. Luas, bukan jari-jari, sebanding dengan nilai, supaya persepsi tidak berlebihan |
| Warna cakram | Kategori ISPU |
| Cincin tipis di luar cakram | Batas atas rentang 80%. Melebar ke atas, sehingga kerucut terlihat makin tidak pasti |
| Bentuk keseluruhan | Melebar ke atas = memburuk, menyempit = membaik, lurus = stabil. Terbaca dalam sekali lihat |
| Cincin oranye di tanah | Kalender Siaga: bulan musim asap stasiun ini |
| Bidang kaca horizontal | Mengiris hari terpilih; digerakkan penggeser H0–H+7. Cakram di bidang itu menyala, yang lain meredup |

### 7.2 Mode Putar Ulang 2026

- Penggeser tanggal terbit mencakup seluruh 2026 (Januari – 7 Oktober).
- Kerucut menampilkan prakiraan saat itu, dan **titik putih** menunjukkan nilai yang benar-benar terjadi.
- Pembaca melihat sendiri apakah kenyataan jatuh di dalam kerucut.
- Tanggal cerita yang disarankan: 25 Juli 2026. Pekanbaru, Jambi, dan Sintang sudah siaga, lalu melonjak 1 Agustus; kerucutnya sendiri masih lurus (model tidak melihat lonjakan datang). Pembanding jujurnya adalah 24 Juni 2026 di Palangka Raya: tanpa siaga, tetapi lonjakan datang 1 Juli.

### 7.3 Interaksi

- **Kamera:** dibuka dari sudut nasional, lalu terbang ke kelompok stasiun dengan risiko tertinggi.
- **Label:** hanya 5 stasiun paling berisiko. KTG-01/KTG-02 ditampilkan sebagai satu kerucut berlabel "Palangka Raya–Sampit (sinyal kembar)".
- **Klik kerucut:** membuka detail stasiun di bawah peta.
- **Seluler:** penggeser menjadi 8 tombol. Kerucut tetap, kamera lebih landai.

### 7.4 Teknis

- **Komponen baru:** `src/components/KerucutWaktu.tsx`. `Stage3D.tsx` dan `PageStage.tsx` tidak diubah.
- **Lapisan deck.gl:**
  - `GeoJsonLayer` daratan (berkas sama dengan peta lain);
  - `ScatterplotLayer` cakram di posisi `[lon, lat, ketinggian hari]` dengan `billboard: false`;
  - `ScatterplotLayer` bergaris untuk cincin rentang;
  - `LineLayer` poros tegak;
  - `TextLayer` label;
  - `ScatterplotLayer` titik putih untuk Putar Ulang.
- **Cadangan tanpa WebGL:** heatmap stasiun × hari.

---

## 8. Susunan Halaman (Dipadatkan)

| Urutan | Isi | Teks maksimal |
|---|---|---|
| Kepala | "{n} Stasiun Berpeluang Melewati 55 Minggu Ini" · "Dari data terakhir 14 Okt 2026" | 1 baris |
| KPI ① | Berpeluang >55 minggu ini (KTG kembar dihitung sekali) | angka + 1 baris |
| KPI ② | "Besok meleset ±1 µg/m³ · 7% lebih tepat dari menyalin" | angka + 1 baris |
| KPI ③ | "Rentang 80% teruji: 82% · 23–25 dari 25 stasiun di 70–90%" | angka + 1 baris |
| **Kerucut Waktu** | Peta 3D + penggeser hari + tombol Putar Ulang + daftar 5 teratas | legenda 1 baris |
| Detail Stasiun | 30 hari terukur + 7 hari prakiraan + pita 80% + garis 55; 7 kotak hari; lencana kualitas | 1 kalimat |
| Cerita 1 | **"Bertahan atau Datang?"** Kiri: episode berjalan (97% tertangkap). Kanan: kalender siaga (stasiun × bulan) dengan lonjakan 2026 yang tertangkap dan terlewat | 2 kalimat |
| Cerita 2 | **"Setelah 7 Hari: Pola, Bukan Prakiraan"**: garis galat model / menyalin / pola musiman per horizon, lalu kartu Nov–Des | 2 kalimat |
| Telusuri | Semua Stasiun × 7 Hari · Akurasi · Kualitas Data · Cara Kerja | — |

Posisi dalam alur dashboard:
- Bab 1–7 menjawab "apa yang sudah terjadi dan apa yang bisa dilakukan".
- Bab 8 menutup dengan "kapan bertindak minggu ini".
- Bab 8 tidak memuat angka kesehatan (milik Bab Dampak), ranking intervensi (milik Bab Aksi), atau peta sejarah (milik Bab Kondisi dan Waktu).

---

## 9. Pola Musiman sampai Akhir 2026

| Horizon | Galat model | Galat pola musiman |
|---|---|---|
| H+45 | 16,1 | 13,6 |
| H+78 (akhir 2026) | 24,0 | 15,6 |

Dari H+45 ke atas, pola musiman lebih tepat dari model, jadi November–Desember ditampilkan sebagai pola, bukan prakiraan.

November–Desember 2024–2025:
- Tidak ada stasiun di jalur asap yang melewati 55.
- Hanya JKT-02 Marunda (industri, rata-rata 58,0) yang melewati 55 setiap hari.

Pesannya: setelah Oktober, risiko bergeser dari asap ke polusi kota dan industri. Basisnya dua tahun.

---

## 10. Perubahan Teknis

| # | Berkas | Perubahan |
|---|---|---|
| 1 | `prakiraan.py` | D3, D7, D8, D9; label signifikansi per horizon (E1); keluaran Kalender Siaga; uji ketahanan (pembanding, HLN-DM + Holm, sensitivitas bobot, Kupiec, keandalan) ditulis ke `prakiraan_verifikasi.json` |
| 2 | `prakiraan.py` | Arsip Putar Ulang 2026 (nilai bulat H+1–H+7 + tabel skala rentang), kalender siaga, galat per horizon sampai H+78, pola Nov–Des, tabel kualitas data, tabel akurasi + selang |
| 3 | `scripts/prakiraan/requirements.txt` | Versi pustaka |
| 4 | `KerucutWaktu.tsx` | Komponen 3D baru (bagian 7) |
| 5 | `Q7Prakiraan.tsx`, `v4-prakiraan.css` | Susunan bagian 8 |
| 6 | Uji | `tsc`, build, browser desktop + 375 px, `git diff` memastikan `Stage3D.tsx`/`PageStage.tsx` tidak berubah |

---

## 11. Pertanyaan Juri dan Jawabannya

Setiap jawaban merujuk ke bukti di dokumen ini dan ke rujukan.

| # | Pertanyaan yang mungkin muncul | Jawaban singkat | Bukti |
|---|---|---|---|
| 1 | "Keunggulan 7% itu kecil, apa artinya?" | Pembandingnya adalah menyalin nilai hari ini, yang paling sulit dikalahkan pada data sangat halus (autokorelasi 0,985). Lembaga Eropa (FAIRMODE) menganggap prakiraan layak bila RMSE ≤ menyalin; model lulus di semua horizon. Ukuran yang relevan adalah keunggulan relatif, bukan besar galat | 3.2, 3.4 |
| 2 | "Bisa saja kebetulan." | Diebold–Mariano dengan koreksi Harvey–Leybourne–Newbold dan varians HAC: p < 0,001 sampai H+3 dan p = 0,009 di H+4 setelah koreksi Holm untuk 7 horizon; H+5–H+7 diberi label setara. Model menang di 23 dari 25 stasiun dan 9 dari 10 bulan pada H+1 | 3.1 |
| 3 | "Kenapa H+5–H+7 tetap ditampilkan kalau tidak nyata?" | Ditampilkan dengan label "setara menyalin" sebagai rentang dan peluang. Peluang >55 masih lebih baik dari pola musiman di H+7 (+0,24, selang 0,11–0,33) | 3.3, 3.6 |
| 4 | "R²-nya berapa?" | 0,99, tetapi menyalin hari ini pun hampir sama. R² tidak mengukur kemampuan model pada data ini, sehingga tidak dipakai. Rujukan: Hyndman & Koehler 2006 soal ukuran berskala | 3.2 |
| 5 | "Kenapa tidak LSTM, Prophet, atau ARIMA?" | Sudah dibandingkan dengan keluarga eksponensial (SES), autoregresif (Ridge/AR), naif musiman, dan drift; model menang. Data per stasiun hanya ±1.000 hari dengan struktur bulanan, sehingga model besar berisiko menghafal. Pada uji berjalan, model yang lebih kompleks sering gagal mengalahkan menyalin ([arXiv 2603.20315](https://arxiv.org/pdf/2603.20315)) | 3.4, 4.2 |
| 6 | "Bobot 0,5 dicocok-cocokkan?" | Diakui: dipilih setelah melihat 2026. Tetapi semua bobot 0,25–0,75 positif di 2026, dan rata-rata sederhana punya dasar teori (*forecast combination puzzle*) | 3.5 |
| 7 | "Kenapa tidak pakai cuaca? Asap jelas dipengaruhi angin dan hujan." | Diuji: kelembapan, angin, arah, suhu, hari kering, plus CO, PM10, jam malam, dan tetangga searah angin. Tidak ada yang menambah di 2026. Dataset tidak memuat curah hujan dan titik api, dua sinyal terkuat di literatur | 4.2, 5.5 |
| 8 | "Fitur musim kok dibuang?" | Fitur musim menang di validasi (+21%) tetapi kalah di uji (−1,5%): tanda menghafal. Musim tetap dipakai, tetapi di tempat yang aman: peluang dan kalender | 4.2 |
| 9 | "Dataset banyak lubang dan sensor bermasalah." | Lubang terpusat di 6 dari 27 stasiun; 21 lainnya lengkap. Setiap stasiun bermasalah punya aturan sendiri (D1–D18). Hubungan kelengkapan data dengan keunggulan model hampir nol | 6.1 |
| 10 | "Wilayahnya tidak seimbang." | Model tidak memakai kode stasiun atau wilayah, dan tidak ada angka per provinsi. Rentang dikalibrasi per stasiun, jadi stasiun yang jarang tidak dipaksa mengikuti sebaran stasiun lain | D8, D10 |
| 11 | "Sensor murah dan BAM dicampur." | Fitur relatif (selisih log) menghilangkan bias pengali antar-alat; sensor optik/murah diberi lencana. Bias kelembapan sensor optik terdokumentasi di literatur | 4.1, D13 |
| 12 | "Dataset ini sintetis atau aneh?" | Kami menemukan struktur pergantian bulan (27 dari 27 awal lonjakan pada tanggal 1), dan sengaja tidak memanfaatkannya agar metode tetap berlaku untuk data nyata | 5A |
| 13 | "Bisa memprediksi kapan asap datang?" | Tidak, dan kami tidak mengklaimnya. Kalender Siaga hanya pengingat bulan musim asap (6 dari 8, selang 41–93%). Peringatan awal sungguhan butuh titik api dan hujan | 5 |
| 14 | "Kenapa tidak sampai akhir tahun?" | Di H+45 ke atas, pola musiman lebih tepat dari model (13,6 vs 16,1). Prakiraan berbulan-bulan butuh ENSO/IOD dan hujan musiman (Spessa dkk. 2015) | 9 |
| 15 | "Rentang 80% benar 80%?" | 81,5%, sedikit lebih lebar (berhati-hati). Uji Kupiec menolak tepat 80% karena sampel 7.000, tetapi 22–25 dari 25 stasiun berada di 70–90%, dan skor Winkler membaik | 3.6 |
| 16 | "Ada kebocoran data?" | Fitur hanya sampai hari terbit; baris latih t + h < terbit; penyetelan tanpa 2026; peluang historis dari tahun sebelumnya; uji berjalan dengan refit bulanan | M6 |
| 17 | "Ramalannya sudah lewat (14 Okt)." | Diakui di judul. Bukti utamanya justru Putar Ulang 2026: setiap tanggal terbit 2026 bisa dicek terhadap kenyataan | 7.2 |

---

## 12. Yang Tidak Diklaim

- Akurasi tanpa pembanding.
- Angka harian di atas 7 hari, atau keunggulan nyata di H+5–H+7.
- Bahwa galat ini berlaku untuk data sensor nyata yang lebih bergejolak.
- Bahwa Kalender Siaga akan tetap tepat di tahun El Niño, atau di data nyata yang tidak berganti per bulan.
- Bahwa model memprakirakan awal lonjakan.
- Angka per provinsi.
- Bahwa KTG-01/KTG-02 adalah dua pengukuran independen.
- Peringatan resmi.

---

## 13. Rujukan

- Hyndman & Athanasopoulos, *Forecasting: Principles and Practice*: pembanding naif, uji berjalan.
- Diebold & Mariano (1995), *Journal of Business & Economic Statistics* 13(3): uji beda akurasi prakiraan.
- Harvey, Leybourne & Newbold (1997), *International Journal of Forecasting* 13(2): koreksi sampel kecil uji Diebold–Mariano.
- Holm (1979), *Scandinavian Journal of Statistics* 6(2): koreksi uji berganda.
- [Hyndman & Koehler (2006)](https://figshare.com/articles/Another_look_at_measures_of_forecast_accuracy/5091436/1), *International Journal of Forecasting* 22(4): MASE.
- Murphy (1988), *Monthly Weather Review* 116: skor keunggulan (*skill score*).
- [Kupiec (1995)](https://doi.org/10.3905/jod.1995.407942), *Journal of Derivatives* 3(2): uji cakupan rentang.
- [Gneiting & Raftery (2007)](https://doi.org/10.1198/016214506000001437), *JASA* 102: skor interval.
- Smith & Wallis (2009), *Oxford Bulletin of Economics and Statistics* 71(3); Claeskens dkk. (2016), *International Journal of Forecasting* 32(3): *forecast combination puzzle*.
- [Piersanti dkk., HARMO/FAIRMODE](https://www.harmo.org/Conferences/Proceedings/_Aveiro/publishedSections/00472_79_h21-073-antonio-piersanti.pdf): tolok ukur prakiraan kualitas udara terhadap menyalin.
- [Kalibrasi prakiraan CAMS (arXiv 2201.13355)](https://arxiv.org/pdf/2201.13355): skor keunggulan terhadap menyalin.
- [Evaluasi horizon dengan uji berjalan (arXiv 2603.20315)](https://arxiv.org/pdf/2603.20315): peringkat model bergantung desain evaluasi.
- [Autokorelasi PM2.5 harian Beijing (CDC)](https://stacks.cdc.gov/view/cdc/49634/cdc_49634_DS1.pdf): lag 1 ≈ 0,52.
- Clemen (1989), *International Journal of Forecasting* 5(4): kombinasi prakiraan.
- Hägerstrand (1970), *Papers of the Regional Science Association* 24: geografi waktu (*space-time cube*).
- Spessa dkk. (2015), *NHESS* 15: [prakiraan musiman kebakaran Kalimantan](https://nhess.copernicus.org/articles/15/429/2015/).
- *NHESS* 22 (2022): [prakiraan musiman + peluang kebakaran](https://nhess.copernicus.org/articles/22/303/2022/nhess-22-303-2022.pdf).
- Teng dkk. (2023), *Environment International*: [GNN-LSTM searah angin](https://doaj.org/article/9a68ea0ed66e4e69ae639f4f8d33b674).
- [SatCLIP-GNN (McGill)](https://dmas.lab.mcgill.ca/fung/pub/AADF26m2garss_preprint.pdf): penghubung searah angin tidak selalu menang.
- [SEA-HAZEMON, ASEAN](https://hazeportal.asean.org/?p=13641): deteksi kebakaran dari PM2.5 dan CO.
- [Kualitas udara Singapura dan kebakaran hutan, PMC7765006](https://pmc.ncbi.nlm.nih.gov/articles/PMC7765006).
- [EGUsphere 2025-6203](https://egusphere.copernicus.org/preprints/2026/egusphere-2025-6203/): bias kelembapan sensor optik.
- Hein dkk. (2022): [musim asap Indonesia Agustus–Oktober](https://pmc.ncbi.nlm.nih.gov/articles/PMC9256533).
