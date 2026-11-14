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
| **Apa dampaknya** bagi rumah sakit? | Perkiraan kasus napas 7 hari dan jam rawan | Sedang | Uji balik 2026: galat turun 21% di hari pindah bulan, 42% saat PM2.5 melompat |

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
- Jam rawan: tepat ±1 jam pada median 88% hari antarstasiun (Palangka Raya hanya 14%; lencana keandalan ditampilkan per stasiun).

---

## 4. Prinsip Menampilkan Uji Statistik

**Yang ditampilkan di depan adalah ukuran yang kuat dan benar. Semua ukuran lain tetap ada di tab Akurasi.** Tidak ada angka yang disembunyikan; juri yang menemukan angka tersembunyi akan menganggap tim tidak jujur.

| Tempat | Ukuran |
|---|---|
| KPI dan cerita | 25/25 stasiun; +17% besok, +25% di H+7; rentang 80% tepat 81%; bulan bahaya berulang 10/13 |
| Tab Akurasi | Galat per horizon dan 7 pembanding, FAIRMODE, Diebold–Mariano dengan dan tanpa Holm, keandalan peluang, sensitivitas bobot, uji tanda, cakupan pindah bulan, uji balik kasus napas |
| Tidak ditampilkan | R² dan "akurasi kategori": menyalin saja sudah memberi R² ≈ 1 pada data sehalus ini |

### Pertanyaan juri dan jawabannya

| Pertanyaan | Jawaban |
|---|---|
| "Setelah Holm hanya H+1 yang nyata." | Holm untuk 7 uji terpisah sangat konservatif. Secara gabungan model menang di 25/25 stasiun di setiap horizon. Semua hasil, termasuk Holm, ada di tab Akurasi; kotak hari H+2 ke atas diberi label "keyakinan lebih rendah". |
| "Data ini sintetis." | Benar, dan disebut terbuka. Yang bisa dipindahkan ke data nyata adalah metodenya: uji berjalan, pembanding naif, kalibrasi rentang. |
| "Palangka 1 Sep diramal 219, aktual 421." | Lapis transisi menangkap arah lompatan (dari 95), tidak besarnya, karena musim 2026 jauh lebih parah dari 2025. Cerita "Waktu Tetap, Besarnya Naik" menjelaskan batas ini. |
| "Kenapa hanya 7 hari?" | Lewat 7 hari keunggulan datang dari pola bulanan, yang sudah ditampilkan sebagai kalender. |
| "Kenapa tidak pakai cuaca atau titik api?" | Sudah diuji: tidak ada variabel di dataset yang bergerak sebelum lompatan. |

---

## 5. Susunan Halaman (sesuai yang dibangun)

```
Judul dinamis: "13 Stasiun Berpeluang Melewati 55 Minggu Ini"
KPI: 13 dari 24 lokasi · 25/25 stasiun · 10/13 bulan bahaya berulang
Kartu 1  Kalender Musim (visual utama)
Kartu 2  Minggu Ini: Yang Berubah Kategori + strip 7 hari 8 stasiun
Kartu 3  Detail Stasiun: 30 hari terakhir + 7 hari ke depan + kotak hari
Kartu 4  Dampak dan Jam Rawan (dua kolom)
Cerita 1 Waktu Tetap, Besarnya Naik
Cerita 2 Diuji Seperti Prakiraan Sungguhan
Telusuri Lebih Dalam: Semua Stasiun × 7 Hari · Akurasi · Kualitas Data · Cara Kerja
```

- **Kalender Musim.** Judulnya berupa jawaban: "Musim Asap Biasanya Berakhir 1 Nov di 11 Stasiun".
  - Baris: stasiun yang pernah > 55, dikelompokkan per pulau. Stasiun yang selalu di bawah 55 dan yang datanya kurang disebut di catatan.
  - Kolom: Jan–Des. Jan–Okt 2026 berisi data; bulan sesudahnya memakai pola 2025 (pudar). Bulan depan diberi bingkai.
  - Kolom kanan: rasio bulan terburuk ÷ terbaik 2024 → 2026.
  - Warna: kategori ISPU. Klik baris memilih stasiun.
- **Minggu Ini.** Mode Terbit 14 Okt dan Putar Ulang 2026 (penggeser tanggal, contoh 31 Agu dan 25 Jul). Bila tidak ada perubahan kategori, kartu menyebut perubahan berikutnya (1 Nov) dari pola tahun lalu.
- **Detail Stasiun.** Garis putus prakiraan, pita rentang 80%, penanda pergantian bulan. Kotak H+2 ke atas berlabel "keyakinan lebih rendah", dengan tooltip uji Holm.
- **Dampak dan Jam Rawan.**
  - Kasus napas 7 hari di RS pasangan stasiun, dihitung dengan rumus halaman Simulasi: kasus × (PM baru ÷ PM kini)^(b ÷ ln 2).
  - Jam rawan besok: profil 24 jam dari 7 hari terakhir, dengan lencana keandalan.
- **Cerita 2.** Plot titik 25 stasiun (keunggulan H+1); semua titik di kanan garis "setara menyalin".

### Keputusan peta

Kerucut Waktu 3D dihapus (`KerucutWaktu.tsx` dihapus dari repo). Alasannya:
- dengan 25 stasiun × 8 hari, label bertabrakan;
- wawasan prakiraan bersifat waktu, bukan ruang.

Sebaran ruang tetap dijawab peta 3D di Ringkasan, yang tidak diubah.

### Gaya

- Teal untuk prakiraan, warna ISPU untuk nilai, abu-abu untuk pembanding.
- Angka besar hanya di KPI dan cerita.
- Di layar 375 px kalender digeser horizontal dan dua kolom menjadi satu.

---

## 6. Berkas

| Berkas | Isi |
|---|---|
| `scripts/prakiraan/prakiraan.py` | Model, uji berjalan, kalibrasi rentang (termasuk pindah bulan), keluaran `prakiraan_pm25.json`, `prakiraan_verifikasi.json`, `prakiraan_arsip.json` |
| `scripts/prakiraan/tambahan_v6.py` | Kalender, uji tanda, kasus napas per RS, jam rawan → `prakiraan_v6.json` |
| `src/pages/Q7Prakiraan.tsx` | Halaman |
| `src/v4-prakiraan.css` | Gaya halaman |

Urutan menjalankan dari akar repo:

```
python scripts/prakiraan/prakiraan.py --pakai-setelan
python scripts/prakiraan/tambahan_v6.py
```

### Belum dibangun

- Tombol putar pada kalender.
- Garis skenario eskalasi di grafik detail; tidak dijadikan angka karena gagal di validasi 2025.
