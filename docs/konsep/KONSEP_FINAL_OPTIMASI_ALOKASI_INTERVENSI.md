# Konsep Final v4: Prioritas Intervensi

**Status:** v4, menggantikan v3 · 14 November 2026 · commit `ae94f7f`
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

**Yang berubah dari v3 (14 Nov 2026):**
- Cerita 1 diganti dari grafik sebar menjadi **batang terurut** "kasus tercegah per 1.000 µg", dengan urutan asap di samping nama. Grafik sebar sulit dibaca dan tidak langsung memperlihatkan bahwa wilayah paling berasap tidak di atas.
- Cerita 2 berganti judul jadi **"{n} dari {K} Wilayah Tetap Prioritas"**. "Selalu Masuk" terbaca seperti masalahnya belum selesai.
- Warna gambut di bump chart kini untuk **semua wilayah yang tidak ada di daftar periode pertama tetapi ada di periode terakhir**. Sebelumnya hanya yang baru masuk di periode terakhir, sehingga Sampit dan Palangka Raya (Kematian) tampil abu-abu padahal naik ke peringkat 1–2.
- Cip uji ke depan tanpa warna merah/hijau, dengan label "Daftar 2024 diuji di 2025, dibanding memilih yang paling berasap".
- Teks semua cerita dipangkas jadi kalimat pendek yang menyesuaikan penyakit terpilih.

**Yang berubah dari v2 (v3):**
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
| 3 | `Story` (nada fokus) | **Kenapa bukan yang paling berasap** | 3,3× (Sintang vs Sampit); Talang Betutu (paling berasap) urutan 7 dari 13 per µg |
| 4 | `Story` (dibalik, nada gambut) | **Apakah daftar ini awet** | 2/5 wilayah tetap prioritas; uji ke depan +9% / −4% |
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

**Pertanyaan:** kenapa daftar prioritas tidak sama dengan daftar wilayah paling berasap?

- **Angka besar:** 3,3×, yaitu lebih banyak kasus tercegah per µg di Sintang dibanding Sampit.
- **Grafik: batang horizontal terurut.**
  - Panjang batang = kasus tercegah per 1.000 µg·hari PM2.5 yang diturunkan (efisiensi). Paling efisien di atas.
  - Di samping nama ada kotak **urutan asap** (1 = rata-rata PM2.5 tertinggi). Tiga wilayah paling berasap kotaknya oranye, batangnya oranye muda.
  - Sintang (teal) dan Sampit (abu tua) disorot sebagai pasangan pembanding; wilayah lain abu-abu muda.
  - Tooltip: urutan asap, kasus per 1.000 µg, total kasus dan beban, kepekaan RS.
- **Dua kalimat** (default ISPA balita):
  1. "Wilayah paling berasap, **Talang Betutu**, hanya di urutan **7** dari 13 untuk manfaat per µg. Kotak oranye = 3 wilayah paling berasap."
  2. "Sintang unggul atas Sampit karena pasiennya lebih peka: jika PM2.5 dua kali lipat, kasus naik **+110%**, dibanding **+33%** di Sampit."
- **Kenapa grafik sebar v3 diganti:** pembaca harus membandingkan sudut dua garis, label tertutup lingkaran, dan pesan "paling berasap tidak di atas" tidak terlihat. Batang terurut + urutan asap menampilkan pesan itu langsung.
- **Siapkan untuk juri:** Talang Betutu tetap prioritas nomor 1 di daftar atas karena **total** kasus tercegahnya paling besar (pasien banyak, musim panjang). Cerita ini mengukur manfaat **per µg**, bukan total. Daftar prioritas memakai total; cerita ini menjelaskan kenapa urutan asap saja tidak cukup.
- **Pemilihan pasangan otomatis:**
  - A masuk daftar, B tidak.
  - Beban polusi keduanya mirip (rasio 0,6–1,67).
  - Selisih efisiensi terbesar, minimal 1,5×.
- **Bila tidak ada pasangan:**
  - Kardiovaskular dan kematian memakai satu koefisien untuk semua RS. Kalimatnya: "kepekaan dianggap sama di semua RS, jadi urutan hanya ditentukan jumlah pasien dan paparan."
  - Bila K besar sehingga hampir semua wilayah sudah masuk, kalimatnya menyarankan mengurangi jumlah wilayah.
- **Jangan menebak mengapa** kepekaan RS berbeda. Data tidak menjelaskannya.

### Cerita 2: "{n} dari {K} Wilayah Tetap Prioritas"

**Pertanyaan:** apakah daftar tahun lalu bisa dipakai lagi tahun ini?

- **Angka besar:** "{n}/{K}", jumlah wilayah yang masuk K besar di setiap periode (2024, 2025, musim 2026). Default: **2/5**.
- **Bump chart:**
  - Peringkat tiap wilayah di tiga periode menurut kasus tercegah, dengan pita "K besar".
  - Pewarnaan garis:
    - wilayah inti (masuk K besar di semua periode): teal tebal;
    - wilayah yang naik masuk (tidak ada di daftar periode pertama, ada di periode terakhir): gambut;
    - lainnya: abu-abu.
  - Peringkat adalah **posisi relatif**. Naik ke peringkat 1 berarti bagian kasus tercegahnya paling besar di periode itu, bukan otomatis memburuk.
- **Teks** (default ISPA balita):

  > **2/5**: Talang Betutu dan Pangkalan Bun bertahan di 5 besar 3 periode berturut-turut.
  >
  > Bertahan karena di sanalah asap yang turun paling banyak mencegah ISPA balita.
  >
  > **Sintang, Palangka Raya dan Sampit** menyusul setelah 2024.
  >
  > **Daftar lama masih ampuh?**

  - Nama penyakit dan nama wilayah berganti otomatis.
  - Kalimat "bertahan karena…" menjawab salah baca "tetap di atas = belum beres".
- **Dua cip uji ke depan** (warna netral):
  - "Daftar 2024 diuji di 2025: +9%, dibanding memilih yang paling berasap";
  - "Daftar 2025 diuji di musim 2026: −4%".
  - Cara hitung: daftar dipilih dari data periode sebelumnya, lalu kasus tercegahnya dinilai di periode berikutnya dan dibandingkan dengan pembanding terbaik (paling kotor atau paling jauh melewati batas). "Setara" bila selisih < 2%.
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
| Uji ke depan | 2024→2025 +9%; 2025→2026 −4% (K = 6: Setara / −9%) | Daftar harus diperbarui tiap musim |
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
| Grafik sebar efisiensi + dua garis kemiringan | v3 | Sulit dibaca, label tertutup, pesan utama tidak terlihat | Batang terurut + urutan asap |
| Judul "Selalu Masuk, Sisanya Bergeser" | v3 | Terbaca seperti masalah belum selesai | "{n} dari {K} Wilayah Tetap Prioritas" |
| Cip merah/hijau | v3 | −4% merah mengundang "model kalah" | Cip netral dengan label pembanding |

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

## 10. Insight untuk Pemaparan

1. **Fokus memberi hasil besar.** 5 dari 13 wilayah terdampak menyumbang 71% kasus ISPA balita yang bisa dicegah.
2. **Asap tertinggi tidak sama dengan manfaat tertinggi.** Memilih dengan model dampak (pasien × kepekaan × kelebihan asap) memberi +20% kasus tercegah dengan beban polusi 8% lebih kecil dibanding memilih yang paling berasap. Talang Betutu paling berasap, tetapi hanya urutan 7 untuk manfaat per µg.
3. **Kepekaan pasien berbeda jauh antar-RS.** Sintang +110% vs Sampit +33% per PM2.5 dua kali lipat; dengan usaha sama, Sintang mencegah 3,3× lebih banyak kasus.
4. **Waktunya sempit dan bisa diduga:** Agustus–Oktober.
5. **Daftar harus diperbarui tiap musim.** Hanya 2 wilayah yang bertahan; Palangka Raya dan Sampit naik tajam karena musim 2026 jauh lebih parah. Daftar 2025 yang dipakai di 2026 kalah 4% dari cara paling berasap.
6. **Batasan:** angka adalah estimasi dari model asosiasi pada data sintetis (efek lebih besar dari studi nyata), bukan uji intervensi.

---

## 11. Hasil Uji Saat Dibangun (13 Nov 2026, diperbarui 14 Nov)

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
