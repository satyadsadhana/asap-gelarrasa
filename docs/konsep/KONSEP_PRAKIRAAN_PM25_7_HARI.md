# Konsep Final: Prakiraan PM2.5 7 Hari

**Status:** final v1, sudah dibangun · 13 November 2026
**Nama di dashboard:** "Prakiraan 7 Hari" · pertanyaan halaman "Bagaimana Udara Minggu Depan?"
**Lokasi:** halaman baru `/prakiraan`, bagian ke-8 di sidebar, setelah Simulasi.
**Berkas:**
- `scripts/prakiraan/prakiraan.py`: model, uji, dan penulisan JSON;
- `public/data/prakiraan_pm25.json`: ramalan terbit;
- `public/data/prakiraan_verifikasi.json`: hasil uji;
- `src/pages/Q7Prakiraan.tsx` dan `src/v4-prakiraan.css`: halaman.

**Sumber data:** `data_notebook/panel_harian.csv`, keluaran `preprocessing/preprocess_notebook.py`. Ini sumber yang sama dengan seluruh angka dashboard. `data_bersih/` tidak dipakai.

---

## 1. Pertanyaan yang Dijawab

> Dalam 7 hari ke depan, stasiun mana yang PM2.5-nya berpotensi melewati 55 µg/m³, dan seberapa yakin kita?

---

## 2. Arsitektur: Model Berjalan Sekali, Dashboard Hanya Membaca

1. Skrip `prakiraan.py` dijalankan dari root repo (sekitar 6–10 menit). Ia melakukan:
   - penyetelan;
   - uji berjalan 2025 dan 2026;
   - pelatihan model final;
   - penulisan dua JSON.
2. Dashboard hanya memuat JSON. Tidak ada model di browser.
3. Setiap ramalan menyimpan tanggal terbit. File verifikasi menyimpan seluruh prakiraan uji dan nilai aktualnya, jadi akurasi bisa diaudit.
4. Untuk memperbarui saat ada data baru: jalankan ulang preprocessing, lalu `python -B scripts/prakiraan/prakiraan.py`.

---

## 3. Analisis Data yang Mendasari Desain

| Temuan | Angka | Keputusan |
|---|---|---|
| Autokorelasi PM2.5 harian (rata-rata 25 stasiun) | lag 1: 0,90 · lag 7: 0,83 | Nilai hari ini adalah petunjuk terkuat. Persistence menjadi pembanding wajib |
| Perubahan harian berkorelasi negatif | −0,15 (median antarstasiun) | Ada derau kecil di sekitar tingkat yang bergerak pelan. Ada ruang perbaikan, tetapi kecil |
| Stasiun lain kemarin → stasiun ini hari ini | korelasi 0,005 (median) | Fitur dari stasiun tetangga tidak dipakai |
| Menarik tren 3 hari ke depan | lebih buruk dari persistence | Tidak dipakai |
| Klimatologi (rata-rata hari yang sama tahun lalu) | galat sekitar 11–12 µg/m³ | Hampir tidak berguna; hanya untuk pembanding |
| Musim asap 2026 jauh lebih tinggi | rata-rata Jul–Okt: 2024 50,9 · 2025 59,6 · 2026 80,7 µg/m³. Palangka Raya bertahan di sekitar 420 selama berhari-hari | Model harus bisa mengikuti puncak yang belum pernah terlihat |

### Masalah yang Ditemukan Selama Membangun, dan Perbaikannya

Angka di kolom Bukti berasal dari uji awal dengan `data_bersih`, sebelum sumber data diganti (masalah 6). Keputusannya diperiksa ulang dengan `data_notebook` di bagian 5.

| # | Masalah | Bukti | Perbaikan |
|---|---|---|---|
| 1 | Model pohon menebak nilai langsung dan gagal mengikuti puncak 2026 | Galat H+1 4,5× persistence, musim asap 7,6× | Target diganti menjadi **perubahan dari hari ini** |
| 2 | Fitur tingkat absolut, kode stasiun, kalender, dan cuaca membuat model menghafal musim 2024–2025 ("kalau setinggi ini, besok turun") | Unggul 17–36% di validasi 2025, kalah 4–30% di uji 2026, apa pun susunan fiturnya | Hanya fitur **bentuk pergerakan relatif** |
| 3 | Lonjakan ekstrem merusak fungsi rugi kuadrat | Huber lebih baik di validasi dan uji | **Huber loss** |
| 4 | Bobot data terbaru (waktu paruh 60–240 hari) | Lebih buruk di validasi | Tidak dipakai |
| 5 | Model tunggal masih rawan saat rezim berubah | Lihat bagian 5 | **Rata-rata model dan persistence**, bobot 0,5 |
| 6 | Skrip awal memakai `data_bersih` | Bertentangan dengan keputusan sumber angka 12 Nov | Diganti ke `data_notebook` |
| 7 | Rentang tunggal untuk sepanjang tahun | Galat musim asap jauh lebih lebar | Rentang dihitung **terpisah untuk musim asap dan di luar musim** |
| 8 | Menu kiri dengan 8 item bisa terpotong di layar pendek | — | Versi padat untuk tinggi layar ≤ 760 px |

**Keterbukaan soal bobot 0,5:** bobot ini punya dasar sebelumnya, yaitu rata-rata sederhana yang dalam literatur kombinasi prakiraan sering lebih tahan daripada bobot yang disetel. Namun saat membangun, saya sudah melihat hasil uji 2026 untuk bobot 1; 0,75; dan 0,5. Karena itu uji 2026 tidak sepenuhnya buta untuk pilihan bobot ini. Semua pilihan lain (fitur, Huber, hyperparameter, rentang) diputuskan dari validasi 2025.

---

## 4. Metode

| Bagian | Pilihan |
|---|---|
| Fitur (13) | Selisih log hari ini dengan 1–7, 14, dan 30 hari lalu; selisih dengan rata-rata 3, 7, dan 30 hari; simpangan baku 7 hari |
| Target | log(1+PM2.5) pada t+h dikurangi log hari ini |
| Model | LightGBM, satu model per horizon (H+1 sampai H+7), Huber loss |
| Penyetelan | 30 percobaan Optuna (TPE, seed tetap), uji berjalan per kuartal di 2025 |
| Hasil akhir | log hari ini + 0,5 × perubahan tebakan model |
| Rentang 80% | Kuantil 10% dan 90% residu validasi 2025, per horizon dan per musim |
| Peluang > 55 | Proporsi residu validasi yang membuat prakiraan melewati 55 |
| Uji | Uji berjalan: model dilatih ulang tiap awal bulan hanya dengan target yang sudah diketahui sebelum bulan itu |
| Stasiun | Minimal 365 hari data sah, dan ada data pada tanggal terbit |

**Pencegahan kebocoran:**
- Fitur hanya memakai data sampai hari terbit.
- Untuk horizon h, baris latih dibatasi pada t + h ≤ hari sebelum terbit.
- Data tidak diacak.
- Penyetelan tidak menyentuh 2026.

---

## 5. Hasil Uji

Data `data_notebook`. Validasi = 2025 (dipakai untuk penyetelan dan kalibrasi rentang). Uji = Januari sampai 14 Oktober 2026, tidak disentuh saat penyetelan (kecuali catatan bobot 0,5 di atas). Galat dalam µg/m³. Keunggulan = 1 − galat model ÷ galat persistence.

### 5.1 Per Horizon, Uji 2026

| Horizon | Galat Model | Galat Persistence | Keunggulan | Musim Asap | Di Luar Musim | Rentang 80% Tercapai |
|---|---|---|---|---|---|---|
| H+1 | 1,42 | 1,53 | +7,2% | +4,5% | +13,3% | 83% |
| H+2 | 2,02 | 2,14 | +5,6% | +3,6% | +11,4% | 85% |
| H+3 | 2,55 | 2,69 | +5,2% | +2,8% | +11,2% | 85% |
| H+4 | 3,02 | 3,15 | +4,1% | +2,0% | +11,8% | 85% |
| H+5 | 3,49 | 3,62 | +3,6% | +1,0% | +12,5% | 85% |
| H+6 | 3,93 | 4,02 | +2,2% | −0,3% | +11,8% | 85% |
| H+7 | 4,31 | 4,38 | +1,6% | −1,4% | +13,2% | 85% |

- Model unggul atas persistence di semua horizon secara keseluruhan.
- Di musim asap 2026, keunggulan habis di H+6 dan H+7 (selisih galat 0,03 dan 0,14 µg/m³). Dashboard menuliskannya terang-terangan.
- Ridge (galat H+1 1,68, H+7 5,27) dan klimatologi (sekitar 11,6–11,9) kalah di semua horizon.
- LightGBM tanpa kombinasi lebih baik di H+1–H+3 (+9,2% di H+1) tetapi kalah dari persistence di H+6–H+7 (−0,5% dan −3,0%). Kombinasi 0,5 membuat model tidak pernah kalah secara keseluruhan.
- Rentang 80% tercapai 83–85% secara keseluruhan dan 90–93% di musim asap. Rentang sedikit terlalu lebar, artinya berhati-hati, bukan terlalu yakin.
- Melewati 55 (1.248–1.273 kejadian per horizon): presisi 97–99%, recall 92–97%. Sama atau sedikit lebih baik dari persistence.

### 5.2 Validasi 2025

Keunggulan +14% (H+1) sampai +17% (H+3–H+4); rentang 80% tepat 80% (memang dikalibrasi di sini). Penurunan dari validasi ke uji terjadi karena musim asap 2026 jauh lebih tinggi dari apa pun di data latih.

### 5.3 Per Bulan 2026 (H+1)

| Bulan | Jan | Feb | Mar | Apr | Mei | Jun | Jul | Agu | Sep | Okt |
|---|---|---|---|---|---|---|---|---|---|---|
| Rata-rata PM2.5 | 27,8 | 26,6 | 26,7 | 28,1 | 30,5 | 33,9 | 44,2 | 71,6 | 99,0 | 144,1 |
| Keunggulan | +15,3% | +12,5% | +14,3% | +13,1% | +13,4% | +10,6% | +6,0% | +8,0% | +5,9% | +1,4% |

Keunggulan positif di setiap bulan, tetapi menyusut tajam saat PM2.5 naik. Pada Oktober 2026 model hampir sama dengan menyalin nilai hari ini.

### 5.4 Penyetelan dan Ramalan Terbit

- Optuna 30 percobaan, galat validasi 2,422 → 2,378. Terbaik: 200 pohon, laju belajar 0,038, 23 daun, minimal 69 sampel per daun, subsample 0,96, colsample 0,95, lambda 5,67.
- Terbit 14 Oktober 2026 untuk 25 stasiun. 14 stasiun berpeluang ≥ 50% melewati 55 besok.
- Per stasiun (H+1): keunggulan tertinggi BGR-02 (+19,5%), terendah KTG-02 (−0,4%) dan KTG-01 (−0,1%).
- Dikecualikan: JMB-02 (tidak ada data sah) dan MER-01 (10 hari), karena di bawah 365 hari.
- Pemeriksaan keluaran: batas bawah ≤ nilai ≤ batas atas dan peluang di rentang 0–1 untuk semua sel.

---

## 6. Horizon: Kenapa 7 Hari

- Galat persistence naik dari H+1 ke H+7, tetapi tetap jauh di bawah klimatologi. Masih ada informasi sampai hari ke-7.
- Keunggulan model menyusut seiring horizon. Karena itu dashboard menampilkan rentang yang melebar dan peluang, bukan hanya satu angka.
- Lebih dari 7 hari tidak diuji dan tidak ditampilkan.

---

## 7. Halaman Dashboard

| Urutan | Pola halaman | Isi |
|---|---|---|
| Kepala | Judul dinamis + ⓘ | "{n} Stasiun Diprakirakan Melewati 55 dalam 7 Hari"; ⓘ menjelaskan metode, uji, dan batasan |
| Jalur temuan | 3 `Kpi` | Stasiun berpeluang > 55 besok · keunggulan dibanding nilai hari ini · rentang 80% teruji |
| Kartu 1 | Peta panas stasiun × 7 hari | Warna = peluang > 55, angka = prakiraan, klik baris untuk detail |
| Kartu 2 | Detail stasiun | 30 hari terukur + 7 hari prakiraan + pita 80% + garis 55, dan tujuh kotak hari |
| Cerita 1 | `Story` | "Lebih Baik dari Menyalin Nilai Hari Ini?": keunggulan per horizon, validasi 2025 vs uji 2026 |
| Cerita 2 | `Story` (dibalik) | "Musim Asap 2026 Menguji Semua Model": keunggulan per bulan 2026 |
| Telusuri | 4 tab | Tabel uji per horizon · prakiraan vs aktual 2026 · per stasiun · cara kerja |

**Kenapa halaman baru, bukan di Simulasi:**
- Simulasi menjawab "kalau polusi diturunkan, berapa kasus tercegah".
- Prakiraan menjawab "minggu ini stasiun mana yang berbahaya".
- Datanya berbeda (historis vs terbaru) dan Simulasi sudah padat.

**Kenapa di akhir, bukan setelah Waktu:**
- Alurnya menjadi "apa yang bisa dilakukan" → "kapan harus bertindak minggu ini".
- Penomoran bagian di tur cerita (Bagian 2–7) tidak berubah.

---

## 8. Yang Tidak Diklaim

- "Prakiraan akurat" tanpa pembanding persistence.
- Akurasi di atas 7 hari.
- Penyebab lonjakan. Belum ada data titik api dan prakiraan cuaca.
- Peringatan resmi. Ini alat bantu, bukan pengganti BMKG atau ISPU.
- Tanggal terbit adalah tanggal data terakhir (14 Okt 2026), bukan hari ini.

---

## 9. Pengembangan Berikutnya

1. Titik api (FIRMS/VIIRS) dan prakiraan cuaca (angin, hujan) sebagai fitur. Ini sumber petunjuk terkuat untuk asap yang belum ada di data.
2. Jalankan skrip harian secara otomatis dan simpan arsip prakiraan vs aktual.
3. Uji ulang bobot kombinasi setelah musim asap 2027, dengan data yang benar-benar baru.

---

## 10. Rujukan

- Hyndman & Athanasopoulos, *Forecasting: Principles and Practice*: uji berjalan dan pembanding naif.
- Kombinasi prakiraan dengan rata-rata sederhana: Clemen (1989), *International Journal of Forecasting* 5(4).
- Musim asap Indonesia memuncak Agustus–Oktober: Hein dkk. 2022, [PMC9256533](https://pmc.ncbi.nlm.nih.gov/articles/PMC9256533).
