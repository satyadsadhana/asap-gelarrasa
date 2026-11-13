# Konsep Final v3: Prioritas Intervensi

**Status:** v3, menggantikan v2 · 13 November 2026
**Nama di dashboard:** "Wilayah Mana yang Didahulukan?"
**Lokasi:** halaman Simulasi & Rekomendasi (`/aksi`), setelah tabel per penyakit, sebelum Tujuh Langkah
**Berkas:** `src/components/Prioritas.tsx`, `src/lib/prioritas.ts`, `src/v4-prio.css`
**Dasar angka:**
- Semua angka dihitung ulang dari `asap-gelarrasa/public/data` dengan rumus simulator (`src/lib/sim.ts`).
- Angka per wilayah sudah dicocokkan dengan simulator satu RS:
  - Talang Betutu −1.327;
  - Pangkalan Bun −929;
  - Kota Jambi −582;
  - Palangka Raya −287.

**Yang berubah dari v2:**
- Blok "Coba Tebak Dulu" dihapus. Ia memperlambat pembaca tanpa menambah informasi.
- Teks dipangkas. Setiap blok kini satu judul temuan, satu angka besar, satu kalimat.
- Label "Stabil / Cukup Stabil / Belum Pasti" diganti satu lencana **belum pasti**, hanya muncul bila perlu (bagian 3).
- Blok "Catatan dan Batasan" dihapus. Isinya pindah ke tombol ⓘ di kepala bagian.
- Kurva Manfaat dan matriks tahun ke tahun diganti visual baru: peta + daftar berbatang, grafik garis efisiensi, dan bump chart.
- Susunan blok kini memakai pola yang sama dengan halaman lain (bagian 2).

---

## 1. Satu Kalimat Besarnya

**Default: 2025, batas 55, ISPA balita, 5 wilayah.**
> Lima wilayah menyumbang 71% dari seluruh kasus ISPA balita yang bisa dicegah, dan manfaatnya terkumpul pada Agustus–Oktober. Wilayah yang paling berasap belum tentu paling perlu didahulukan.

| Audiens | Yang dicari | Dijawab oleh |
|---|---|---|
| Juri | Metode benar, temuan tidak klise, jujur soal batasan | Cerita 1 dan 2, ⓘ |
| Pengambil kebijakan | Daftar wilayah, kapan bertindak, seberapa yakin | Jalur temuan, peta + daftar |
| Pembaca umum | Bisa diikuti tanpa istilah statistik | Jalur temuan, peta |

---

## 2. Alur dan Pola yang Dipakai

Bagian ini meminjam pola yang sudah ada di halaman lain, jadi pembaca tidak perlu belajar cara membaca yang baru.

| Urutan | Pola halaman | Isi | Default |
|---|---|---|---|
| Kepala | `sec-head` + ⓘ | Judul, subjudul "23 wilayah · kebijakan · periode", pilihan penyakit dan jumlah wilayah | ISPA balita, 5 wilayah |
| 1 | Jalur temuan (`Flow` + 3 `Kpi`) | **Berapa** · **Dibanding cara biasa** · **Kapan** | 4.083 · +20% · Agu–Okt |
| 2 | `Card` | **Di mana**: peta + daftar berbatang dengan garis potong | "5 Wilayah, 71% Manfaat" |
| 3 | `Story` (nada fokus) | **Kenapa bukan yang paling berasap** | 3,3× (Sintang vs Sampit) |
| 4 | `Story` (dibalik, nada gambut) | **Apakah daftar ini awet** | 2 wilayah inti; uji ke depan +9% / −4% |
| 5 | "Telusuri Lebih Dalam" | Tabel tiga faktor dan tiga cara memilih | Tertutup |

Hubungan dengan bab lain tetap:
- Simulator di atas menjawab **berapa**.
- Bagian ini menjawab **di mana dulu**.
- Tujuh Langkah menjawab **apa dan kapan**.

---

## 3. Rincian

### Kepala Bagian
- **Penyakit:** 7 pilihan.
- **Jumlah wilayah:** 1–10 dengan tombol −/+. Bila K melebihi wilayah terdampak, dipakai jumlah terdampak.
- **Kebijakan dan periode** ikut simulator di atas.
- **Tombol ⓘ "Cara Menghitung"** menggantikan blok Catatan v2. Isinya tiga kalimat:
  1. rumus dan tiga cara memilih;
  2. arti "belum pasti";
  3. wilayah yang tidak dinilai dan pembanding studi nyata.

### Jalur Temuan (Tiga Angka)

| Kartu | Angka | Visual mini | Catatan kecil |
|---|---|---|---|
| Kasus {Penyakit} Tercegah di {K} Wilayah | 4.083 | Titik: K dari wilayah terdampak | "71% dari seluruh manfaat · 5 dari 13 wilayah terdampak" |
| Dibanding Memilih yang Paling Berasap | +20% | Tiga batang: Terkotor, Terjauh, Model | "4.083 vs 3.405 kasus · beban polusi 8% lebih kecil" |
| Waktu Bertindak | Agu–Okt | Pita 12 bulan | "bulan yang menyumbang manfaat terbesar" |

- Kartu kedua menampilkan "Sama" dan "daftarnya persis sama" bila pilihan model identik dengan pembanding.
- Untuk kebijakan "kurangi persen", kartu ketiga menampilkan "Sepanjang Tahun".

### Peta + Daftar ("{K} Wilayah, {p}% Manfaat")
- **Peta (kiri):**
  - Lingkaran = kasus tercegah.
  - Wilayah pilihan berwarna teal dengan nomor urut di dalamnya. Nama tidak ditulis di peta karena sudah ada di daftar, dan label nama saling menumpuk di Sumatra.
  - Wilayah lain abu-abu. Samarinda dan Banjarbaru tampil sebagai lingkaran putus-putus dengan keterangan "tidak dinilai".
- **Daftar (kanan):**
  - Wilayah terdampak diurutkan dari kasus tercegah terbanyak.
  - Batang teal untuk pilihan, abu-abu untuk sisanya (pola penekanan dari panduan dataviz).
  - Garis putus-putus setelah baris ke-K: "71% manfaat di atas garis ini". Garis ini menggantikan Kurva Manfaat v2: pembaca melihat sekaligus siapa yang masuk dan berapa porsinya.

### Cerita 1: "Paling Berasap Belum Tentu Paling Perlu Didahulukan"
- **Angka besar:** 3,3×, yaitu kasus tercegah per µg di Sintang dibanding Sampit.
- **Grafik:**
  - Sebar: x = PM2.5 yang diturunkan (µg·hari), y = kasus tercegah, ukuran = jumlah pasien.
  - **Dua garis putus-putus dari titik nol** menembus Sintang dan Sampit. Kemiringannya adalah "kasus per µg": 185 vs 57 per 1.000 µg·hari. Pembaca melihat sendiri bahwa polusinya mirip, tetapi hasilnya jauh berbeda.
- **Satu kalimat:** pasien RS di Sampit kurang peka terhadap PM2.5 (risiko +33% vs +110% tiap PM2.5 berlipat dua).
- **Pemilihan pasangan otomatis:**
  - A masuk daftar, B tidak.
  - Beban polusi keduanya mirip (rasio 0,6–1,67).
  - Selisih efisiensi terbesar, minimal 1,5×.
- **Bila tidak ada pasangan:**
  - Kardiovaskular dan kematian memakai satu koefisien untuk semua RS. Kalimatnya menjelaskan bahwa urutan ditentukan jumlah pasien dan paparan.
  - Bila K besar sehingga hampir semua wilayah sudah masuk, kalimatnya menyarankan mengurangi jumlah wilayah.
- **Jangan menebak mengapa** kepekaan RS berbeda. Data tidak menjelaskannya.

### Cerita 2: "{n} Wilayah Selalu Masuk, Sisanya Bergeser"
- **Angka besar:** jumlah wilayah inti, yaitu yang masuk K besar di 2024, 2025, dan musim 2026. Default: 2 (Talang Betutu, Pangkalan Bun).
- **Bump chart:**
  - Peringkat tiap wilayah di tiga periode, dengan pita "5 besar".
  - Pewarnaan garis:
    - wilayah inti: garis teal tebal;
    - pendatang baru musim 2026 (Palangka Raya, Sampit): warna gambut;
    - lainnya: abu-abu.
  - Bentuk ini menggantikan matriks v2. Pergeseran terlihat sebagai garis yang naik dan turun, bukan angka di sel.
- **Dua cip uji ke depan:**
  - pilih dengan data tahun lalu, nilai di tahun berikutnya, dibanding cara paling berasap;
  - "Daftar 2024 dipakai 2025: +9%";
  - "Daftar 2025 dipakai musim 2026: −4%".
- **Satu kalimat:** "Daftar tahun lalu belum tentu cocok tahun ini: perbarui menjelang musim asap."
- **Jangan menulis "terbukti".** Uji ke depan hanya punya dua pasang tahun.

### Telusuri Lebih Dalam (tertutup)
- **Tabel tiga faktor per wilayah:**
  - Pasien;
  - Paparan;
  - Kepekaan;
  - Kasus Tercegah dengan rentang 90%.
- **Tiga kotak cara memilih:** Model, Paling Jauh Melewati Batas, Paling Kotor Rata-Rata. Dua pembanding digabung bila daftarnya sama.

---

## 4. Arti "Belum Pasti" (Menjawab Kebingungan "Stabil")

Di v2, "Stabil" terbaca seperti "wilayah ini aman, tidak perlu didahulukan". Maksud sebenarnya kebalikannya: wilayah itu **hampir pasti tetap masuk daftar prioritas** walaupun koefisiennya diundi ulang. Karena kata itu menyesatkan, v3 menghapusnya.

**Cara kerja di v3:**
- Wilayah pilihan tanpa lencana sudah yakin masuk daftar.
- Lencana kuning **belum pasti** muncul hanya bila wilayah itu masuk daftar di kurang dari 90% dari 1.000 undian koefisien. Artinya, tempatnya bisa digantikan wilayah lain.
- Definisinya ada di tombol ⓘ dan di tooltip lencana.
- Undian hanya mencakup ketidakpastian koefisien tiap RS (DerSimonian–Laird), bukan ketidakpastian model atau data.

---

## 5. Fakta dari Data (Sudah Diverifikasi)

| Fakta | Angka |
|---|---|
| Wilayah yang melewati 55 pada 2025 | 13 dari 23 |
| Total kasus ISPA balita yang bisa dicegah, 23 wilayah, 2025, batas 55 | 5.729 (+ Samarinda dan Banjarbaru = 5.973, sama dengan simulator) |
| Porsi 5 wilayah pilihan | 4.083 = 71%; 8 wilayah = 91%; 10 wilayah = 99% |
| Model vs paling jauh vs paling kotor | 4.083 vs 3.405 vs 1.951; beban 23.388 / 25.375 / 13.144 |
| Kasus tercegah per 1.000 µg·hari | Sintang 185, Pangkalan Bun 181, Pekanbaru 181, Kota Jambi 181, Talang Betutu 161, Palangka Raya 67, Sampit 57 |
| RR per lipat dua | Sintang 2,10 · Pangkalan Bun 2,07 · Talang Betutu 1,85 · Palangka Raya 1,35 · Sampit 1,33 · gabungan 1,56 |
| Beban musim 2026 vs 2025 | Palangka Raya 24.840 vs 4.287; Sampit 24.849 vs 4.295 |
| Kurangi 30% | Model 5.148 vs 4.692 (+10%) |
| Kematian, 2025, batas 55 | 366 vs 359 (+2%), 62% manfaat |

---

## 6. Validitas

| Uji | Hasil | Arti |
|---|---|---|
| Replikasi simulator | Sama persis per RS dan total | Angka konsisten dengan seluruh halaman |
| Undian koefisien, pilihan model tetap | 2025: unggul di 100% undian (+19,9%); 2024: 65% (seri); turun 30%: 100% (+10%) | Keunggulan 2025 bukan kebetulan koefisien |
| Uji ke depan | 2024→2025 +9%; 2025→2026 −4% | Daftar harus diperbarui tiap musim |
| Koefisien gabungan | 4 dari 5 pilihan sama | Wilayah inti tidak bergantung pada koefisien per RS |
| Tanpa Talang Betutu dan Medan | Tetap +20,1% | Data interpolasi tidak menentukan hasil |
| Pembanding studi nyata | Efek di data ini lebih besar | Angka dibaca relatif, ditulis di ⓘ |

**Yang tidak boleh diklaim:**
- "Model selalu lebih baik."
- "Mencegah 4.083 kasus" tanpa kata estimasi.
- Penyebab perbedaan kepekaan RS.
- Biaya.
- Efek asap lintas wilayah.

---

## 7. Dasar dari Riset

- **Rumus dampak** sama bentuknya dengan fungsi dampak log-linear BenMAP (US EPA). Paparannya memakai skala log2, sesuai model teman. Rujukan:
  - [EPA BenMAP-CE](https://19january2025snapshot.epa.gov/benmap/how-benmap-ce-estimates-health-and-economic-effects-air-pollution);
  - [PMC6022291](https://pmc.ncbi.nlm.nih.gov/articles/PMC6022291).
- **Musim kebakaran gambut** memuncak pada Agustus–Oktober. Rujukan: Hein dkk. 2022, [PMC9256533](https://pmc.ncbi.nlm.nih.gov/articles/PMC9256533).
- **Besar efek di studi nyata:**
  - RR asma anak 1,048 per 10 µg/m³, dengan heterogenitas tinggi (I² 95,7%). Rujukan: [PMC4977771](https://pmc.ncbi.nlm.nih.gov/articles/PMC4977771).
  - Data ini juga menunjukkan heterogenitas tinggi (I² 98%).
- **Menyampaikan ketidakpastian:** angka seperti "100%" bisa terbaca sebagai kepastian palsu, jadi dipakai satu tanda yang muncul hanya saat perlu. Rujukan:
  - [Hullman](https://arxiv.org/pdf/1908.01697);
  - [Padilla dkk.](https://pmc.ncbi.nlm.nih.gov/articles/PMC7868089).

---

## 8. Yang Dihapus dan Alasannya

| Elemen | Versi | Masalah | Pengganti |
|---|---|---|---|
| Kolom peluang 0%/100% | v1 | Terbaca sebagai kepastian palsu | Lencana "belum pasti" |
| Kolom n/7 | v1 | Lima penyakit napas berperingkat identik | Dihapus; ganti penyakit lewat pilihan |
| Coba Tebak Dulu | v2 | Menambah langkah dan teks tanpa informasi baru | Dihapus |
| Label Stabil / Cukup Stabil | v2 | "Stabil" terbaca sebagai "aman, bukan prioritas" | Lencana "belum pasti" (bagian 4) |
| Kurva Manfaat | v2 | Grafik ketiga yang mengulang angka porsi | Garis potong di daftar berbatang |
| Matriks tahun ke tahun | v2 | Tabel angka sulit dibaca sekilas | Bump chart |
| Catatan dan Batasan (4 kotak) | v2 | Panjang, jarang dibaca, tampilan berat | Tombol ⓘ di kepala bagian |
| Tabel tiga faktor di halaman utama | v2 | Terlalu padat untuk pembaca umum | Dipindah ke "Telusuri Lebih Dalam" |

---

## 9. Desain

- **Warna:**
  - teal untuk pilihan model, abu-abu untuk sisanya;
  - gambut untuk pendatang baru di bump chart;
  - teks tetap memakai warna tinta, bukan warna seri.
- **Gerak:**
  - daftar berbatang muncul bertahap saat masuk layar;
  - grafik beranimasi saat skenario berubah;
  - semua gerak mati bila pengguna memilih kurangi gerak.
- **Tata letak:**
  - peta dan daftar berdampingan di layar ≥ 980 px, bertumpuk di bawahnya;
  - Story bergantian kiri-kanan, sama seperti halaman lain.
- **Kinerja:**
  - hitungan ulang ditunda (`useDeferredValue`) sampai slider berhenti;
  - Monte Carlo hanya untuk periode terpilih.
- **Bahasa:** Title Case EYD untuk judul, satu angka utama per kartu.

---

## 10. Hasil Uji Saat Dibangun (13 Nov 2026)

1. **Angka default:**
   - 4.083 · +20% · Agu–Okt;
   - "5 Wilayah, 71% Manfaat";
   - garis potong setelah Kota Jambi;
   - 3,3× Sintang vs Sampit;
   - 2 wilayah inti;
   - cip +9% / −4%.
2. **Kasus tepi:**
   - Kematian: tanpa angka besar di cerita 1, cip "Setara" / −2%.
   - K = 10: K efektif 10, 99%, kartu kedua "Sama" dengan catatan "daftarnya persis sama", dan cerita 1 menyarankan mengurangi wilayah.
   - Kurangi 30%: 5.148 vs 4.692, pembanding "Terberat", waktu "Sepanjang Tahun".
   - 2024 + batas 300: kartu "Tidak Ada yang Perlu Didahulukan".
3. **Tampilan:**
   - lebar 375 px tanpa elemen meluber;
   - `tsc` dan `vite build` lolos.
