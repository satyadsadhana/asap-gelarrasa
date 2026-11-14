# Konsep Final Fitur Prakiraan PM2.5

**Status:** sudah dibangun (v6) · 14 November 2026 · halaman `/prakiraan`. Dokumen ini menggantikan `KONSEP_PRAKIRAAN_PM25_7_HARI.md` (v4–v5).

Data: `data_notebook/` (AQMS harian dan per jam, panel RS, master stasiun). Prakiraan terbit 14 Okt 2026 (data terakhir).

---

## 1. Ide Inti

Halaman Prakiraan menjawab tiga pertanyaan, dari yang paling pasti ke yang paling tidak pasti:

| Pertanyaan | Jawaban di halaman | Keyakinan | Bukti |
|---|---|---|---|
| **Kapan** bahaya datang di wilayah saya? | Kalender musim per stasiun | Tinggi | Bulan dalam tahun menjelaskan 99,7% variasi bulanan; 10 dari 13 stasiun jalur asap punya bulan > 55 yang sama pada 2024, 2025, 2026 |
| **Seberapa parah** minggu ini? | Prakiraan 7 hari dan rentang 80% | Sedang | Lebih tepat dari menyalin di 25/25 stasiun di setiap horizon |
| **Apa dampaknya** bagi rumah sakit? | Perkiraan kasus napas 7 hari | Sedang | Uji balik 2026: galat turun 21% di hari pindah bulan, 42% saat PM2.5 melompat |

Kalimat pemaparan:

> "Musim menentukan **waktu**, sedangkan besarnya naik tiap tahun. Prakiraan kami memanfaatkan pola itu secara terbuka, diuji seperti prakiraan sungguhan sepanjang 2026, lalu diterjemahkan ke jumlah pasien yang perlu disiapkan."

### Sifat dataset yang menentukan desain

- Nilai harian berbentuk tangga bulanan: di dalam bulan bergerak halus (sd ≈ 5%), lompatan terjadi di tanggal 1 (27 dari 28 awal musim).
- Bulan > 55 berulang tiap tahun (Agu–Okt di jalur asap Sumatra–Kalimantan); besarnya naik tiap tahun (contoh rasio bulan terburuk ÷ terbaik Kota Jambi 2,7 → 5,8 → 39).
- Tidak ada variabel di dataset (polutan lain, cuaca, amplitudo per jam) yang bergerak sebelum lompatan (|ρ| ≤ 0,05). PM10 melompat bersamaan (ρ 0,98), jadi tidak bisa dipakai sebagai penanda awal.
- Stasiun yang berjauhan berkorelasi 0,99+; pola ini tanda data sintetis. Karena itu data luar (titik api, ENSO) tidak dipakai.

---

## 2. Model

1. **Dasar:** LightGBM pada log PM2.5, dicampur 0,5 dengan nilai hari ini (bobot dipilih di validasi 2025, bukan di uji 2026).
2. **Lapis transisi bulan (v5):** bila hari sasaran jatuh di bulan berbeda dari hari terbit, prakiraan = log nilai kini + (log median bulan sasaran − log median bulan asal) dari tahun sebelumnya di stasiun yang sama.
3. **Rentang 80%:** kuantil galat uji berjalan per horizon, musim, dan (v6) terpisah untuk hari pindah bulan bila sampel ≥ 100.
4. **Peluang > 55:** dari sebaran galat yang sama.

Fitur yang diuji lalu ditolak:
- faktor intensitas per stasiun (galat validasi 2025 naik 0,041 → 0,062);
- penggabungan antarklaster (lebih buruk);
- tren antartahun (tidak bisa diuji dengan 3 tahun);
- faktor eskalasi sebagai angka utama (gagal di validasi 2025).

---

## 3. Hasil Uji (uji berjalan 2026, Jan–Okt)

| Horizon | Keunggulan atas menyalin [95%] | Stasiun menang | Rentang 80% (semua / pindah bulan) |
|---|---|---|---|
| H+1 | +17% [+9%, +28%] | 25/25 | 81% / 74% |
| H+3 | +21% [+9%, +37%] | 25/25 | 82% / 85% |
| H+7 | +25% [+10%, +46%] | 25/25 | 80% / 80% |

- Uji tanda antarstasiun: p = 6 × 10⁻⁸ di setiap horizon.
- FAIRMODE 0,87–0,88 (< 1 = memenuhi).
- Diebold–Mariano: p < 0,05 di semua horizon tanpa koreksi; setelah koreksi Holm untuk 7 horizon hanya H+1 yang nyata (p = 0,020).
- Validasi 2025: keunggulan +26% sampai +38%.
- Kasus napas (uji balik 2026, galat absolut rata-rata): pindah bulan 6,11 → 4,80 (−21%), PM2.5 melompat 34,8 → 20,0 (−42%), hari biasa −5%, semua −8%.
- Jam rawan (dihitung, tidak ditampilkan): tepat ±1 jam pada median 88% hari antarstasiun, tetapi hanya 14% di Palangka Raya.

---

## 4. Prinsip Menampilkan Uji Statistik

**Yang ditampilkan di depan adalah ukuran yang kuat dan benar. Semua ukuran lain tetap ada di tab Akurasi.** Tidak ada angka yang disembunyikan; juri yang menemukan angka tersembunyi akan menganggap tim tidak jujur.

| Tempat | Ukuran |
|---|---|
| KPI dan cerita | 25/25 stasiun; galat 17% lebih kecil besok, 25% di H+7; 81% masuk rentang 80%; bulan asap sama 10/13 |
| Tab Akurasi | Galat per horizon dan 7 pembanding, FAIRMODE, Diebold–Mariano dengan dan tanpa Holm, keandalan peluang, sensitivitas bobot, uji tanda, cakupan pindah bulan, uji balik kasus napas |
| Tidak ditampilkan | R² dan "akurasi kategori": menyalin saja sudah memberi R² ≈ 1 pada data sehalus ini |

### Pertanyaan juri dan jawabannya

| Pertanyaan | Jawaban |
|---|---|
| "Setelah Holm hanya H+1 yang nyata." | Holm untuk 7 uji terpisah sangat konservatif. Secara gabungan model menang di 25/25 stasiun di setiap horizon. Semua hasil, termasuk Holm, ada di tab Akurasi; kotak hari H+2 ke atas diberi garis putus. |
| "Data ini sintetis." | Benar, dan disebut terbuka. Yang bisa dipindahkan ke data nyata adalah metodenya: uji berjalan, pembanding naif, kalibrasi rentang. |
| "Palangka 1 Sep diramal 219, aktual 421." | Lapis transisi menangkap arah lompatan (dari 95), tidak besarnya, karena musim 2026 jauh lebih parah dari 2025. Mode "Uji di Tanggal Lain" menampilkan kasus ini apa adanya. |
| "Kenapa hanya 7 hari?" | Lewat 7 hari keunggulan datang dari pola bulanan, yang sudah ditampilkan sebagai kalender. |
| "Kenapa tidak pakai cuaca atau titik api?" | Sudah diuji: tidak ada variabel di dataset yang bergerak sebelum lompatan. |

---

## 5. Susunan Halaman (sesuai yang dibangun)

```
Judul: "13 Lokasi Diperkirakan di Atas 55 Sampai 21 Okt"
KPI: 13 dari 24 lokasi · 25/25 stasiun · 10/13 bulan asap sama 3 tahun
1. Lokasi           pemilih lokasi (warna = kategori besok, urut dari terburuk) + grafik + kotak 7 hari
2. Dampak RS        kasus napas 7 hari di rumah sakit pasangan lokasi terpilih
3. Musim            jumlah hari di atas 55 per bulan 2026 + kolom bulan depan
4. Bisa Dipercaya?  plot titik 25 stasiun + 3 angka
Telusuri Lebih Dalam: Akurasi · Kualitas Data · Cara Kerja
```

Alurnya satu arah: satu lokasi minggu depan → dampaknya ke rumah sakit → kapan musim asap selesai → bukti bahwa prakiraan bisa dipercaya. Lokasi terpilih dipakai bersama oleh kartu 1–3.

- **Lokasi.** Peta panas semua lokasi × 7 hari dihapus; gantinya pemilih lokasi berbentuk pil kecil berwarna kategori ISPU besok, urut dari terburuk, jadi daftar lokasi berbahaya tetap terbaca sekilas tanpa tabel angka.
  - Judul berupa jawaban ("Palangka Raya–Sampit: Berbahaya Besok").
  - Sub-judul memakai keunggulan lokasi itu sepanjang 2026 (contoh Palangka Raya–Sampit: 11% lebih tepat dari menyalin), bukan 30 hari terakhir, karena 30 hari terlalu sedikit untuk dibandingkan.
  - **Rekam jejak** (baru): garis teal di bagian riwayat = nilai yang diramal sehari sebelumnya. Galat terlihat langsung, termasuk lompatan yang terlambat ditangkap (1 Okt dan 14 Okt di Palangka Raya–Sampit). Praktik ini dipakai sistem verifikasi operasional (NOAA, Environment Canada VAQUM): prakiraan ditumpuk dengan pengamatan dalam satu deret waktu.
  - Mode "Uji di Tanggal Lain" hanya mengubah kartu ini (contoh 31 Agu: diramal 219, terjadi 421).
  - Kotak H+2 ke atas bergaris putus karena keunggulannya belum lolos uji Holm.
- **Dampak RS.** Judul memuat selisih kasus 7 hari. Rumus sama dengan halaman Simulasi: kasus × (PM baru ÷ PM kini)^(b ÷ ln 2).
- **Musim.** Ukurannya **jumlah hari PM2.5 di atas 55 per bulan**, bukan median.
  - Median menyembunyikan bulan yang belum penuh atau naik di akhir bulan (Kototabang: median Okt 52, tetapi 6 dari 14 hari sudah di atas 55), dan besarnya sudah dijawab grafik prakiraan.
  - Jumlah hari menjawab "kapan" dan langsung terkait kesehatan ("14 dari 14 hari tidak sehat").
  - Warna satu hue oranye empat tingkat (0 hari, beberapa hari, sekitar separuh, hampir setiap hari). Angka hanya di kolom Okt dan Nov.
  - Kolom Nov* = rata-rata November 2024 dan 2025: 0 hari di atas 55 di 11 lokasi yang kini sedang musim asap. Marunda di atas 55 sepanjang tahun.
  - Lokasi yang tidak pernah di atas 55 diringkas menjadi satu baris "9 lokasi lain" (namanya di tooltip).
- **Bisa Dipercaya?** Plot titik 25 stasiun (keunggulan H+1); semua titik di kanan garis "sama dengan menyalin".

Dihapus karena tidak menambah jawaban atau sulit dibaca: peta panas semua lokasi × 7 hari, daftar "Yang Berubah Kategori", jam rawan (profil per jam hampir datar dan tepat hanya 14% hari di Palangka Raya), cerita "Waktu Tetap, Besarnya Naik", kolom rasio di kalender.

### Sinyal kembar Palangka Raya–Sampit

Data PM2.5 harian Palangka Raya (KTG-01) dan Sampit (KTG-02) di sumber berkorelasi 0,99995 (1.018 hari, selisih median 2,4%), padahal jaraknya sekitar 110 km dan alatnya berbeda (Thermo 5014i dan Met One BAM-1020). Stasiun lain yang paling mirip dengan Palangka Raya hanya berkorelasi 0,75 (Pangkalan Bun).

Ini sifat data sumber, bukan hasil model, jadi tidak bisa diperbaiki dengan pemodelan ulang. Membuat deret Sampit "sendiri" dari stasiun tetangga berarti mengarang data. Keputusannya: keduanya ditampilkan sebagai satu lokasi "Palangka Raya–Sampit", dihitung sekali di KPI, dengan catatan korelasi di kartu lokasi dan lencana di tab Kualitas Data.

### Keputusan peta

Kerucut Waktu 3D dihapus (`KerucutWaktu.tsx` dihapus dari repo). Alasannya:
- dengan 25 stasiun × 8 hari, label bertabrakan;
- wawasan prakiraan bersifat waktu, bukan ruang.

Sebaran ruang tetap dijawab peta 3D di Ringkasan, yang tidak diubah.

### Gaya

- Teal untuk prakiraan, warna ISPU untuk nilai, abu-abu untuk pembanding.
- Angka besar hanya di KPI dan cerita.
- Di layar 375 px label bulan kalender memakai inisial dan pemilih lokasi digeser horizontal.

---

## 6. Berkas

| Berkas | Isi |
|---|---|
| `scripts/prakiraan/prakiraan.py` | Model, uji berjalan, kalibrasi rentang (termasuk pindah bulan), keluaran `prakiraan_pm25.json`, `prakiraan_verifikasi.json`, `prakiraan_arsip.json` |
| `scripts/prakiraan/tambahan_v6.py` | Kalender (median dan hari di atas 55 per bulan), uji tanda, kasus napas per RS, jam rawan → `prakiraan_v6.json` |
| `src/pages/Q7Prakiraan.tsx` | Halaman |
| `src/v4-prakiraan.css` | Gaya halaman |

Urutan menjalankan dari akar repo:

```
python scripts/prakiraan/prakiraan.py --pakai-setelan
python scripts/prakiraan/tambahan_v6.py
```

### Belum dibangun

- Garis skenario eskalasi di grafik detail; tidak dijadikan angka karena gagal di validasi 2025.
