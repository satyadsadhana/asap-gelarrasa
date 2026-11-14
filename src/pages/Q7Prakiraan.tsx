import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import Chart from "../components/Chart";
import { Card, Kpi, Page, Story } from "../components/Layout";
import { DotsViz } from "../components/Viz";
import { useData } from "../lib/data";
import { BULAN, fmt, fmtDate, UG } from "../lib/format";
import { useApp } from "../lib/state";
import { C, ISPU_COL, ISPU_LAB, ISPU_ON, ispuCat, RAMP } from "../lib/theme";

/* ---------- bentuk data (scripts/prakiraan/prakiraan.py v6 dan tambahan_v6.py) ---------- */
type Kelas = "rendah" | "sedang" | "tinggi";
type Hari = { tgl: string; h: number; nilai: number; lo: number; hi: number; p55: number; kelas: Kelas };
type StPrak = { code: string; nama: string; satuan_asumsi: boolean; kembar: boolean; siaga: boolean; hari_ini: number; rasio_bulan_lalu: number | null; riwayat: (number | null)[]; hari: Hari[] };
type Prak = { terbit: string; batas: number; bobot_model: number; judul_risiko: number; risiko_besok: number; nyata_sampai: number;
  stasiun: StPrak[]; dikecualikan: { code: string; alasan: string }[] };
type PH = {
  h: number; n: number; mae_model: number; mae_lgb: number; mae_salin: number; mae_ses: number; mae_ridge: number; mae_drift: number;
  mae_naif_musiman: number; mae_klimatologi: number; rasio_fairmode: number; mase_model: number; mase_salin: number;
  skill: number; skill_ci: [number, number]; p_dm: number; p_holm: number; nyata: boolean; stasiun_menang: [number, number]; p_tanda: number;
  bulan_menang: [number, number]; skill_musim: number | null; skill_luar: number | null; cakupan80: number; cakupan80_musim: number | null;
  cakupan80_lintas: number | null; cakupan80_biasa: number | null;
  kupiec_p: number | null; winkler: number; stasiun_cakupan_70_90: [number, number]; lebar80_musim: number | null; lebar80_luar: number | null;
  bss: number; bss_ci: [number, number]; bobot_peluang: number; kejadian55: number; tangkap55: number | null; presisi55: number | null;
  n_naik25: number; bias_naik25_model: number | null; bias_naik25_salin: number | null;
};
type Kualitas = { code: string; hari_sah: number; cakupan: number; cakupan_2026: number; celah_terpanjang: number; sah_7_terakhir: number;
  alat: string; jenis_alat: string; jam_beku: number; jam_interpolasi: number; diramal: boolean; lencana: string[]; skill_h1: number | null; cakupan80_h1: number | null };
type Verif = {
  terbit: string; bobot_model: number;
  uji: { periode: string; per_horizon: PH[]; keandalan: { h: number; kelas: { kelas: string; n: number; dikatakan: number; terjadi: number }[] }[];
    sensitivitas_bobot: { bobot: number; validasi: number[]; uji: number[] }[]; ses_alfa: number };
  validasi: { per_horizon: PH[] };
  horizon_panjang: { h: number; mae_model: number; mae_salin: number; mae_klimatologi: number }[];
  lonjakan: { kejadian: { code: string; tgl: string; nilai: number; siaga: boolean }[]; tertangkap: number; jumlah: number; wilson95: [number, number]; hari_siaga: number; siaga_tanpa_lonjakan: number };
  struktur_bulanan: { ubah_tgl1: number; ubah_lain: number; lonjakan_besar: number; lonjakan_besar_tgl1: number; awal_lonjakan: number; awal_lonjakan_tgl1: number; median_ubah_harian_pct: number; autokorelasi_lag1: number };
  kualitas: Kualitas[];
  pola_nov_des: { code: string; rata: number; p55: number; tahun: number[] }[];
  setelan: { percobaan: number; terbaik: Record<string, number | string>; jejak: { trial: number; mae: number }[] };
  fitur: string[]; musim_rata: Record<string, number>;
};
type Arsip = { mulai: string; rentang: Record<string, Record<string, [number, number][]>>;
  stasiun: Record<string, { nilai: (number | null)[][]; peluang: (number | null)[][]; siaga: number[]; aktual: (number | null)[] }> };
type KalSt = { code: string; wilayah: string; pulau: string; konsisten: boolean;
  tahun: Record<string, { bulan: (number | null)[]; lewat55: number[]; rasio: number | null }> };
type Uji4 = { n: number; mae_rata7: number; mae_prak: number; turun: number };
type V6 = {
  terbit: string; kalender: KalSt[]; uji_tanda: { h: number; menang: number; n: number; p: number }[];
  kasus: { rs: { rs: string; nama: string; code: string; rata7: number; riwayat: (number | null)[]; hari: { tgl: string; kasus: number; lo: number; hi: number }[] }[];
    uji: { semua: Uji4; biasa: Uji4; lintas: Uji4; lompat: Uji4 } };
  jam: { code: string; profil: number[]; buruk: number; bersih: number; andal: number; n: number }[];
};

/** Satu tampilan stasiun (terbit atau putar ulang) yang dipakai daftar, peta panas, dan detail. */
type Tampil = { code: string; nama: string; kembar: boolean; siaga: boolean; riwayat: (number | null)[]; h0: number | null; rasio: number | null;
  hari: { tgl: string; h: number; nilai: number; lo: number; hi: number; p: number; kelas: Kelas; akt: number | null }[] };

const TEAL = "#2ec4b6", TEAL_INK = "#0b5563", GREY = "#b9c9ce";
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const KELAS_LAB: Record<Kelas, string> = { rendah: "Rendah", sedang: "Sedang", tinggi: "Tinggi" };
const KELAS_COL: Record<Kelas, string> = { rendah: "#e9eff1", sedang: RAMP[2], tinggi: RAMP[5] };
const PULAU_URUT = ["Sumatra", "Kalimantan", "Jawa", "Sulawesi dan Papua", "Lainnya"];
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const selisih = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const pendek = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`; };
const hariKe = (iso: string) => HARI[new Date(iso + "T00:00:00Z").getUTCDay()];
const kelasDari = (p: number): Kelas => (p > 0.7 ? "tinggi" : p >= 0.3 ? "sedang" : "rendah");
const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${fmt(v * 100, d)}%`);
const skillTxt = (s: number | null | undefined) => (s == null ? "–" : Math.abs(s) < 0.005 ? "Setara" : `${s > 0 ? "+" : "−"}${fmt(Math.abs(s) * 100, 0)}%`);
const resiko = (t: Tampil) => Math.max(...t.hari.map((x) => x.p));
const kali = (v: number | null | undefined) => (v == null ? "–" : `×${fmt(v, 1)}`);
const jamTxt = (j: number) => `${String(j).padStart(2, "0")}.00`;
const KEMBAR_NAMA = "Palangka Raya–Sampit";
const ispuIdx = (v: number) => Math.max(0, ispuCat(v));
const CERITA = [{ tgl: "2026-08-31", lab: "31 Agu: sebelum lonjakan 1 Sep" }, { tgl: "2026-07-25", lab: "25 Jul: musim asap dimulai" }];
const lewatSemua = (k: KalSt) => ["2024", "2025", "2026"].some((y) => k.tahun[y]?.lewat55.length);

export default function Q7Prakiraan() {
  const d = useData<[Prak, Verif, Arsip, V6]>("prakiraan_pm25", "prakiraan_verifikasi", "prakiraan_arsip", "prakiraan_v6");
  const { byCode } = useApp();
  const [pilih, setPilih] = useState<string | null>(null);
  const [mode, setMode] = useState<"terbit" | "ulang">("terbit");
  const [ulang, setUlang] = useState(CERITA[0].tgl);

  const tampil = useMemo<Tampil[] | null>(() => {
    if (!d) return null;
    const [pk, , ar] = d;
    const nm = (c: string, f?: string) => byCode[c]?.nama ?? f ?? c;
    if (mode === "terbit") {
      return pk.stasiun.map((s) => ({ code: s.code, nama: nm(s.code, s.nama), kembar: s.kembar, siaga: s.siaga, riwayat: s.riwayat, h0: s.hari_ini, rasio: s.rasio_bulan_lalu,
        hari: s.hari.map((x) => ({ tgl: x.tgl, h: x.h, nilai: x.nilai, lo: x.lo, hi: x.hi, p: x.p55, kelas: x.kelas, akt: null })) }));
    }
    const i = selisih(ar.mulai, ulang);
    const musim = [7, 8, 9, 10].includes(+ulang.slice(5, 7));
    const out: Tampil[] = [];
    for (const [code, a] of Object.entries(ar.stasiun)) {
      const v = a.nilai[i], p = a.peluang[i];
      if (!v || v[0] == null) continue;
      const rs = ar.rentang[code];
      out.push({ code, nama: nm(code), kembar: code === "KTG-01" || code === "KTG-02", siaga: a.siaga[i] === 1,
        riwayat: a.aktual.slice(Math.max(0, i - 29), i + 1), h0: a.aktual[i] ?? null, rasio: null,
        hari: v.map((x, h) => {
          const tgl = addDays(ulang, h + 1), lintas = tgl.slice(5, 7) !== ulang.slice(5, 7);
          const base = musim ? "musim" : "luar";
          const rg = rs?.[lintas ? `${base}_lintas` : base] ?? rs?.[base];
          const val = x ?? 0, l = Math.log1p(val), pp = (p[h] ?? 0) / 100;
          return { tgl, h: h + 1, nilai: val, lo: rg ? Math.expm1(l + rg[h][0]) : val, hi: rg ? Math.expm1(l + rg[h][1]) : val,
            p: pp, kelas: kelasDari(pp), akt: a.aktual[i + h + 1] ?? null };
        }) });
    }
    return out.sort((a, b) => resiko(b) - resiko(a) || b.hari[0].nilai - a.hari[0].nilai);
  }, [d, mode, ulang, byCode]);

  if (!d || !tampil) return <div className="loading">Memuat prakiraan…</div>;
  const [pk, vf, ar, v6] = d;
  const U = vf.uji.per_horizon, Vd = vf.validasi.per_horizon;
  const h1 = U[0], h7 = U[U.length - 1];
  const kode = pilih && tampil.some((s) => s.code === pilih) ? pilih : tampil[0]?.code;
  const sel = tampil.find((s) => s.code === kode) ?? tampil[0];
  const terbit = fmtDate(pk.terbit);
  const nama = (c: string) => byCode[c]?.nama ?? c;
  const cak = U.reduce((a, r) => a + r.cakupan80, 0) / U.length;
  const sb = vf.struktur_bulanan;
  const hariUlang = selisih(ar.mulai, addDays(pk.terbit, -1));
  const ut = v6.uji_tanda, menangSemua = ut.every((r) => r.menang === r.n);
  const tanpaKembar = <T extends { code: string }>(xs: T[]) => xs.filter((x) => !(x.code === "KTG-02" && xs.some((y) => y.code === "KTG-01")));

  // kalender: bulan ini dan bulan depan dari tanggal terbit
  const bIni = +pk.terbit.slice(5, 7), bDepan = (bIni % 12) + 1;
  const musimSt = v6.kalender.filter(lewatSemua);
  const adaData = (k: KalSt) => ["2024", "2025", "2026"].some((y) => k.tahun[y]?.bulan.filter((v) => v != null).length >= 6);
  const datarSt = v6.kalender.filter((k) => !lewatSemua(k) && adaData(k));
  const kosongSt = v6.kalender.filter((k) => !lewatSemua(k) && !adaData(k));
  const sama = musimSt.filter((k) => {
    const s = ["2024", "2025", "2026"].map((y) => (k.tahun[y]?.lewat55 ?? []).filter((m) => m <= 10).join(","));
    return s[0] === s[1] && s[1] === s[2];
  }).length;
  const makinParah = musimSt.filter((k) => { const r = ["2024", "2025", "2026"].map((y) => k.tahun[y]?.rasio ?? 0); return r[0] < r[1] && r[1] < r[2]; }).length;
  const berakhir = tanpaKembar(v6.kalender.filter((k) => { const t = k.tahun["2025"]; return t && t.lewat55.includes(bIni) && !t.lewat55.includes(bDepan); }));

  // stasiun yang kategori ISPU-nya berubah dalam 7 hari
  const berubah = tanpaKembar(tampil).map((t) => {
    const k0 = ispuIdx(t.h0 ?? t.hari[0].nilai);
    let best = 0, bh = 1;
    t.hari.forEach((x) => { const dl = Math.abs(ispuIdx(x.nilai) - k0); if (dl > best) { best = dl; bh = x.h; } });
    const x = t.hari[bh - 1];
    return { code: t.code, t, k0, kt: ispuIdx(x.nilai), bh, tgl: x.tgl, besar: best, akt: x.akt == null ? null : ispuIdx(x.akt) };
  }).filter((r) => r.besar > 0).sort((a, b) => b.besar - a.besar || b.kt - a.kt);
  const atas8 = tanpaKembar(tampil).slice(0, 8);
  const ks = v6.kasus.uji;

  return (
    <Page path="/prakiraan" noStage
      headline={pk.judul_risiko > 0 ? `${pk.judul_risiko} Stasiun Berpeluang Melewati 55 Minggu Ini` : "Tidak Ada Stasiun yang Berpeluang Melewati 55 Minggu Ini"}
      method={<div className="pk-method">
        <span>Dari data terakhir {terbit}. Tiga lapis: kalender musim per stasiun (kapan), prakiraan 7 hari (seberapa parah), dan perkiraan kasus napas di rumah sakit pasangannya (dampaknya).</span>
        <span>Prakiraan 7 hari = rata-rata nilai hari ini dan model LightGBM; bila tanggal target pindah bulan, dipakai rasio level bulan yang sama tahun lalu. Diuji jujur sepanjang 2026: setiap bulan model hanya melihat data sebelum bulan itu.</span>
        <span>Ini alat bantu, bukan peringatan resmi BMKG atau ISPU.</span>
      </div>}
      kpis={<>
        <Kpi k="Berpeluang Melewati 55 Minggu Ini" v={`${pk.judul_risiko}`} viz={<DotsViz n={pk.judul_risiko} total={pk.stasiun.length - 1} tone="alert" />}
          note={`dari ${pk.stasiun.length - 1} lokasi · ${KEMBAR_NAMA} dihitung sekali · data terakhir ${terbit}`} />
        <Kpi k="Lebih Tepat dari Menyalin Nilai Hari Ini" v={`${ut[0].menang}/${ut[0].n}`} viz={<DotsViz n={ut[0].menang} total={ut[0].n} tone="focus" cols={13} />}
          note={`stasiun, ${menangSemua ? "di setiap horizon H+1–H+7" : "besok"} · galat ${skillTxt(h1.skill)} lebih kecil besok, ${skillTxt(h7.skill)} di H+7`} />
        <Kpi k="Bulan Bahaya Berulang" v={`${sama}/${musimSt.length}`} viz={<DotsViz n={sama} total={musimSt.length} tone="gambut" />}
          note="stasiun jalur asap dengan bulan > 55 yang sama pada 2024, 2025, dan 2026" />
      </>}
      main={<>
        <Card title={berakhir.length > 0 ? `Musim Asap Biasanya Berakhir 1 ${BULAN[bDepan - 1]} di ${berakhir.length} Stasiun` : "Kalender Musim per Stasiun"}
          sub={<>Warna = kategori ISPU dari median bulanan. Jan–{BULAN[bIni - 1]} 2026 = data; bulan sesudahnya = pola 2025 (pudar). Bingkai = bulan depan. Kolom kanan = bulan terburuk dibanding terbaik, 2024 → 2026.</>}
          note={<>{datarSt.length} stasiun lain tidak pernah melewati 55 selama 2024–2026: {datarSt.map((k) => nama(k.code)).join(", ")}.{kosongSt.length > 0 && <> Data tidak cukup: {kosongSt.map((k) => nama(k.code)).join(", ")}.</>} Klik baris untuk melihat stasiun.</>}>
          <Kalender st={musimSt} nama={nama} bIni={bIni} bDepan={bDepan} kode={kode} onPilih={setPilih} />
        </Card>
        <Card title={berubah.length > 0 ? `${berubah.length} Stasiun Pindah Kategori dalam 7 Hari` : "Tidak Ada Stasiun yang Pindah Kategori dalam 7 Hari"}
          sub={mode === "ulang" ? `Putar ulang: prakiraan seperti yang terbit ${fmtDate(ulang)}, dibandingkan dengan yang benar-benar terjadi.` : `Prakiraan terbit ${terbit}, kategori ISPU 24 jam.`}>
          <div className="kw-bar">
            <div className="kw-mode" role="tablist" aria-label="Mode prakiraan">
              <button role="tab" aria-selected={mode === "terbit"} className={mode === "terbit" ? "on" : ""} onClick={() => setMode("terbit")}>Terbit {pendek(pk.terbit)}</button>
              <button role="tab" aria-selected={mode === "ulang"} className={mode === "ulang" ? "on" : ""} onClick={() => setMode("ulang")}>Putar Ulang 2026</button>
            </div>
          </div>
          {mode === "ulang" && <div className="kw-ulang">
            <label>Tanggal terbit <b>{hariKe(ulang)} {fmtDate(ulang)}</b>
              <input type="range" min={0} max={hariUlang} value={selisih(ar.mulai, ulang)} onChange={(e) => setUlang(addDays(ar.mulai, +e.target.value))} aria-label="Tanggal terbit putar ulang" />
            </label>
            <div className="kw-cerita">{CERITA.map((c) => <button key={c.tgl} className={ulang === c.tgl ? "on" : ""} onClick={() => setUlang(c.tgl)}>{c.lab}</button>)}</div>
          </div>}
          <div className="pk-minggu">
            <aside className="kw-list">
              {berubah.length > 0 ? <ol>
                {berubah.slice(0, 8).map((r) => (
                  <li key={r.code} className={r.code === kode ? "on" : ""}>
                    <button onClick={() => setPilih(r.code)}>
                      <span className="nm">{r.t.kembar ? KEMBAR_NAMA : r.t.nama}</span>
                      <em className={`kls k-${r.kt >= r.k0 ? "tinggi" : "rendah"}`}>{ISPU_LAB[r.k0]} → {ISPU_LAB[r.kt]}</em>
                      <small>{r.kt > r.k0 ? "naik" : "turun"} {hariKe(r.tgl)} {pendek(r.tgl)} (H+{r.bh})
                        {r.akt != null && <> · terjadi <b>{ISPU_LAB[r.akt]}</b> {r.akt === r.kt ? "✓" : "✗"}</>}</small>
                    </button>
                  </li>))}
              </ol> : <div className="pk-kosong">
                <b>Kategori semua stasiun bertahan sampai {pendek(addDays(mode === "terbit" ? pk.terbit : ulang, 7))}.</b>
                {mode === "terbit" && berakhir.length > 0 && <p>Perubahan berikutnya diperkirakan 1 {BULAN[bDepan - 1]}: menurut pola tahun lalu, {berakhir.slice(0, 5).map((k) => nama(k.code)).join(", ")}{berakhir.length > 5 ? ` dan ${berakhir.length - 5} lainnya` : ""} turun di bawah 55.</p>}
              </div>}
            </aside>
            <div><Peta st={atas8} kode={kode} onPilih={setPilih} /></div>
          </div>
        </Card>
        <Card title={`${sel.kembar ? `${sel.nama} (sinyal kembar)` : sel.nama}: 30 Hari Terakhir dan 7 Hari ke Depan`}
          sub={`Garis putus = prakiraan · pita = rentang 80%${mode === "ulang" ? " · titik putih = yang terjadi" : ""} · terbit ${fmtDate(mode === "terbit" ? pk.terbit : ulang)}`}
          right={<select className="pick-select" value={kode} onChange={(e) => setPilih(e.target.value)} aria-label="Pilih stasiun">
            {tampil.map((s) => <option key={s.code} value={s.code}>{s.nama}</option>)}</select>}
          note={<Lencana k={vf.kualitas.find((q) => q.code === sel.code)} />}>
          <Detail s={sel} terbit={mode === "terbit" ? pk.terbit : ulang} batas={pk.batas} />
          <ol className="pk-days">
            {sel.hari.map((x) => (
              <li key={x.tgl} className={`k-${x.kelas}`}>
                <small>{hariKe(x.tgl)} {pendek(x.tgl)}</small>
                <b>{fmt(x.nilai, 0)}</b>
                <span>{fmt(x.lo, 0)}–{fmt(x.hi, 0)}</span>
                <em>{ISPU_LAB[ispuIdx(x.nilai)]}</em>
                {x.akt != null && <span className="akt">terjadi {fmt(x.akt, 0)}</span>}
                {!U[x.h - 1]?.nyata && <span className="setara" title="Keunggulan di hari ini tidak lolos uji Diebold–Mariano setelah koreksi Holm untuk 7 horizon. Rincian di tab Akurasi.">keyakinan lebih rendah</span>}
              </li>
            ))}
          </ol>
        </Card>
        <Card title={`Dampak dan Jam Rawan: ${sel.kembar ? KEMBAR_NAMA : sel.nama}`}
          sub="Kiri: perkiraan kasus napas di rumah sakit pasangan stasiun. Kanan: perkiraan PM2.5 per jam besok."
          note={<>Kasus diperkirakan dengan rumus yang sama dengan halaman Simulasi. Uji balik 2026: galat turun {pct(ks.lintas.turun)} di hari pindah bulan dan {pct(ks.lompat.turun)} saat PM2.5 melompat, dibanding rata-rata 7 hari terakhir. Profil jam dari 7 hari terakhir.</>}>
          <div className="pk-dua">
            <KasusRS v6={v6} code={sel.code} aktif={mode === "terbit"} />
            <JamBesok v6={v6} code={sel.code} besok={sel.hari[0]?.nilai ?? null} tgl={sel.hari[0]?.tgl ?? pk.terbit} />
          </div>
        </Card>
      </>}
      stories={<>
        <Story tone="gambut" title="Waktu Tetap, Besarnya Naik"
          big={`${makinParah}/${musimSt.length}`} bigNote="stasiun jalur asap yang musimnya makin parah tiap tahun"
          chart={<Chart option={tumbuhOpt(musimSt, nama)} height={320} ariaLabel="Rasio bulan terburuk terhadap terbaik per stasiun, 2024 sampai 2026" />}>
          <p>Bulan berbahayanya hampir tidak bergeser: {sama} dari {musimSt.length} stasiun jalur asap melewati 55 di bulan yang sama selama tiga tahun. Yang berubah adalah besarnya: bulan terburuk makin jauh dari bulan terbaik. Karena itu kalender dipakai untuk menjawab <b>kapan</b>, sedangkan <b>seberapa parah</b> dijawab prakiraan 7 hari dengan rentang.</p>
        </Story>
        <Story tone="focus" flip title="Diuji Seperti Prakiraan Sungguhan"
          big={`${ut[0].menang}/${ut[0].n}`} bigNote="stasiun lebih tepat dari menyalin nilai hari ini, uji 2026"
          chart={<Chart option={ujiOpt(vf.kualitas, nama)} height={Math.max(300, vf.kualitas.filter((q) => q.diramal).length * 15 + 60)} ariaLabel="Keunggulan prakiraan besok atas menyalin, per stasiun" />}>
          <p>Sepanjang Januari–Oktober 2026, setiap hari prakiraan dibuat hanya dari data sebelum hari itu, lalu dibandingkan dengan yang terjadi. Semua titik di kanan garis nol: model lebih tepat dari menyalin nilai hari ini di setiap stasiun.</p>
          <div className="pk-angka">
            <span><b>{skillTxt(h1.skill)}</b>galat lebih kecil untuk besok</span>
            <span><b>{pct(cak)}</b>nilai jatuh di rentang 80%</span>
            <span><b>{pct(ks.lintas.turun)}</b>galat kasus RS lebih kecil saat pindah bulan</span>
          </div>
          <p className="note">Rincian lengkap, termasuk uji Diebold–Mariano per horizon dengan dan tanpa koreksi Holm, ada di tab Akurasi.</p>
        </Story>
      </>}
      more={[
        <div key="t" data-title="Semua Stasiun × 7 Hari"><Peta st={tampil} kode={kode} onPilih={setPilih} /></div>,
        <div key="a" data-title="Akurasi"><Akurasi U={U} V={Vd} vf={vf} v6={v6} /></div>,
        <div key="k" data-title="Kualitas Data"><TabelKualitas vf={vf} nama={nama} /></div>,
        <div key="c" data-title="Cara Kerja"><CaraKerja vf={vf} sb={sb} /></div>,
      ]}
    />
  );
}

/* ---------- lencana kualitas data ---------- */
function Lencana({ k }: { k?: Kualitas }) {
  if (!k || k.lencana.length === 0) return null;
  const arti: Record<string, string> = {
    "satuan asumsi": "satuan data asli ppm, dikonversi dengan asumsi", "sinyal kembar": "data nyaris identik dengan stasiun lain",
    optik: "alat optik, bisa membaca lebih tinggi saat lembap", "sensor murah": "sensor murah, bias kelembapan lebih besar",
    "pernah beku": "sensor pernah membeku (dibersihkan)", "banyak interpolasi": "banyak jam kosong yang diisi", "data bolong": "banyak hari tanpa data",
  };
  return <span className="pk-badges">{k.lencana.map((l) => <i key={l} title={arti[l] ?? l}>{l}</i>)}</span>;
}

/* ---------- peta panas stasiun × hari (tab dan cadangan tanpa WebGL) ---------- */
function Peta({ st, kode, onPilih }: { st: Tampil[]; kode: string; onPilih: (c: string) => void }) {
  const sempit = typeof window !== "undefined" && window.innerWidth < 600;
  const tgl = st[0]?.hari.map((x) => x.tgl) ?? [];
  const opt = useMemo<EChartsOption>(() => {
    const ki = { rendah: 0, sedang: 1, tinggi: 2 } as const;
    const data = st.flatMap((s, yi) => s.hari.map((x, xi) => ({ value: [xi, yi, ki[x.kelas], x.nilai, x.lo, x.hi, x.p],
      label: { color: x.kelas === "tinggi" ? "#fff" : C.ink, fontWeight: s.code === kode ? 800 : 600 } })));
    return {
      tooltip: { formatter: (q: any) => { const [xi, yi, , v, lo, hi, p] = q.value; const s = st[yi];
        return `<b>${s.nama}</b> · ${hariKe(tgl[xi])} ${pendek(tgl[xi])} (H+${xi + 1})<br/>Prakiraan ${fmt(v, 0)} ${UG}<br/>Rentang 80%: ${fmt(lo, 0)}–${fmt(hi, 0)}<br/>Peluang &gt; 55: <b>${KELAS_LAB[kelasDari(p)]}</b>`; } },
      grid: { left: 8, right: 8, top: 34, bottom: 44, containLabel: true },
      xAxis: { type: "category", position: "top", data: tgl.map((t, i) => `${hariKe(t)} ${pendek(t)}\nH+${i + 1}`), axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { fontSize: 11, fontWeight: 600, color: C.ink, lineHeight: 14 } },
      yAxis: { type: "category", inverse: true, data: st.map((s) => (s.kembar ? `${s.nama}†` : s.nama)), axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { fontSize: sempit ? 10.5 : 12, color: C.ink, formatter: (v: string, i: number) => (st[i]?.code === kode ? `{b|${v}}` : v), rich: { b: { fontWeight: 800, color: TEAL_INK, fontSize: 12 } } } },
      visualMap: { type: "piecewise", dimension: 2, orient: "horizontal", left: "center", bottom: 0, itemWidth: 14, itemHeight: 12, itemGap: 14,
        pieces: (["rendah", "sedang", "tinggi"] as Kelas[]).map((k, i) => ({ value: i, color: KELAS_COL[k], label: KELAS_LAB[k] })),
        textStyle: { fontSize: 11.5, color: C.ink }, text: ["", "Peluang > 55:"] } as any,
      series: [{ type: "heatmap", data, label: { show: true, fontSize: sempit ? 9.5 : 11.5,
          formatter: (q: any) => (sempit && q.value[3] >= 1000 ? `${fmt(q.value[3] / 1000, 1)}rb` : fmt(q.value[3], 0)) },
        itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 4 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1.5 } } } as any],
    };
  }, [st, tgl, kode, sempit]);
  return <>
    <Chart option={opt} height={Math.max(260, st.length * 27 + 96)} ariaLabel="Prakiraan PM2.5 tujuh hari per stasiun"
      onClick={(p) => { const v = (p.value as number[] | undefined); if (v) onPilih(st[v[1]].code); }} />
    <p className="note">Angka = prakiraan ({UG}). † = sinyal kembar ({KEMBAR_NAMA}). Klik baris untuk melihat detail.</p>
  </>;
}

/* ---------- detail satu stasiun ---------- */
function Detail({ s, terbit, batas }: { s: Tampil; terbit: string; batas: number }) {
  const opt = useMemo<EChartsOption>(() => {
    const n = s.riwayat.length;
    const lalu = Array.from({ length: n }, (_, i) => addDays(terbit, i - n + 1));
    const x = [...lalu, ...s.hari.map((h) => h.tgl)];
    const pad = (k: number) => Array<null>(k).fill(null);
    const ukur = [...s.riwayat, ...pad(7)];
    const h0 = s.h0 ?? s.riwayat[n - 1] ?? null;
    const prak = [...pad(n - 1), h0, ...s.hari.map((h) => h.nilai)];
    const lo = [...pad(n - 1), h0, ...s.hari.map((h) => +h.lo.toFixed(1))];
    const lebar = [...pad(n - 1), 0, ...s.hari.map((h) => +(h.hi - h.lo).toFixed(1))];
    const akt = [...pad(n), ...s.hari.map((h) => h.akt)];
    const adaAkt = s.hari.some((h) => h.akt != null);
    return {
      tooltip: { trigger: "axis", formatter: (ps: any) => {
        const i = ps[0].dataIndex, t = x[i], f = i >= n ? s.hari[i - n] : null;
        return `<b>${hariKe(t)} ${fmtDate(t)}</b><br/>` + (f
          ? `Prakiraan H+${f.h}: <b>${fmt(f.nilai, 0)}</b> ${UG}<br/>Rentang 80%: ${fmt(f.lo, 0)}–${fmt(f.hi, 0)}<br/>Peluang &gt; 55: ${KELAS_LAB[f.kelas]}${f.akt != null ? `<br/>Yang terjadi: <b>${fmt(f.akt, 0)}</b>` : ""}`
          : `Terukur: <b>${ukur[i] == null ? "tidak ada data" : `${fmt(ukur[i]!, 1)} ${UG}`}</b>`);
      } },
      legend: { bottom: 0, data: ["Terukur", "Prakiraan", "Rentang 80%", ...(adaAkt ? ["Yang terjadi"] : [])], textStyle: { fontSize: 11.5 } },
      grid: { left: 8, right: 18, top: 24, bottom: 40, containLabel: true },
      xAxis: { type: "category", data: x, boundaryGap: false, axisLabel: { formatter: (v: string) => pendek(v), fontSize: 11, interval: 6 } },
      yAxis: { type: "value", name: UG, min: 0 },
      series: [
        { name: "lo", type: "line", data: lo, stack: "pita", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
        { name: "Rentang 80%", type: "line", data: lebar, stack: "pita", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: TEAL, opacity: 0.2 }, itemStyle: { color: TEAL }, silent: true },
        { name: "Terukur", type: "line", data: ukur, symbol: "circle", symbolSize: 4, connectNulls: false, lineStyle: { width: 2, color: C.ink }, itemStyle: { color: C.ink },
          markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: RAMP[4], width: 1.5 },
            label: { formatter: `Batas ${batas}`, position: "insideEndTop", color: RAMP[5], fontWeight: 700, fontSize: 11 },
            data: [{ yAxis: batas }, ...x.filter((t) => t.endsWith("-01")).map((t) => ({ xAxis: t, lineStyle: { color: C.gambut, type: "dotted", width: 1 },
              label: { formatter: `Pergantian bulan ${pendek(t)}`, position: "insideStartTop", color: C.gambut, fontSize: 10.5, fontWeight: 600 } }))] },
          markArea: { silent: true, itemStyle: { color: "rgba(46,196,182,0.06)" }, data: [[{ xAxis: terbit }, { xAxis: x[x.length - 1] }]] } },
        { name: "Prakiraan", type: "line", data: prak, symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5, type: "dashed", color: TEAL_INK }, itemStyle: { color: TEAL_INK } },
        ...(adaAkt ? [{ name: "Yang terjadi", type: "scatter", data: akt, symbolSize: 9, itemStyle: { color: "#fff", borderColor: C.ink, borderWidth: 2 }, z: 5 }] : []),
      ] as any,
    };
  }, [s, terbit, batas]);
  return <Chart option={opt} height={300} ariaLabel="PM2.5 terukur dan prakiraan untuk stasiun terpilih" />;
}

/* ---------- telusuri: akurasi ---------- */
function Akurasi({ U, V, vf, v6 }: { U: PH[]; V: PH[]; vf: Verif; v6: V6 }) {
  const kd = vf.uji.keandalan.find((k) => k.h === 7);
  return (
    <div className="pk-tab-wrap">
      <table className="pk-tab">
        <thead><tr>
          <th>Horizon</th><th>Model</th><th>Salin</th><th>SES</th><th>Ridge/AR</th><th>LightGBM Murni</th><th>Keunggulan [95%]</th><th>Uji DM (Holm)</th>
          <th>Stasiun Menang</th><th>Rentang 80%</th><th>RMSE ÷ Salin</th><th>Skor Peluang</th>
        </tr></thead>
        <tbody>{U.map((r) => (
          <tr key={r.h}>
            <td><b>H+{r.h}</b></td><td>{fmt(r.mae_model, 2)}</td><td>{fmt(r.mae_salin, 2)}</td><td>{fmt(r.mae_ses, 2)}</td><td>{fmt(r.mae_ridge, 2)}</td><td>{fmt(r.mae_lgb, 2)}</td>
            <td className={r.skill >= 0 ? "pos" : "neg"}>{skillTxt(r.skill)} <small>[{skillTxt(r.skill_ci[0])}, {skillTxt(r.skill_ci[1])}]</small></td>
            <td className={r.nyata ? "pos" : ""}>{r.nyata ? "Nyata" : "Setara"} <small>{r.p_holm < 0.001 ? "p<0,001" : `p=${fmt(r.p_holm, 3)}`}</small></td>
            <td>{r.stasiun_menang[0]}/{r.stasiun_menang[1]}</td>
            <td>{pct(r.cakupan80)}</td><td>{fmt(r.rasio_fairmode, 3)}</td>
            <td>{fmt(r.bss, 2)} <small>[{fmt(r.bss_ci[0], 2)}, {fmt(r.bss_ci[1], 2)}]</small></td>
          </tr>))}</tbody>
      </table>
      <p className="note">Galat = rata-rata selisih mutlak ({UG}), uji Jan–Okt 2026, {fmt(U[0].n, 0)} prakiraan per horizon. Keunggulan = 1 − galat model ÷ galat menyalin, selang dari bootstrap blok mingguan. Uji Diebold–Mariano dengan koreksi Harvey–Leybourne–Newbold, lalu koreksi Holm untuk 7 horizon. RMSE ÷ Salin ≤ 1 adalah tolok ukur FAIRMODE Eropa. Skor peluang = skor Brier relatif terhadap pola musiman (&gt; 0 = lebih baik). Pembanding lain: drift {fmt(U[0].mae_drift, 2)}, naif musiman {fmt(U[0].mae_naif_musiman, 2)}, klimatologi {fmt(U[0].mae_klimatologi, 2)} untuk besok. Validasi 2025: keunggulan {skillTxt(V[0].skill)} (H+1) sampai {skillTxt(V[V.length - 1].skill)} (H+7).</p>
      <div className="pk-dua">
        <div>
          <h4>Bobot Gabungan: Apakah Hasil Bergantung pada 0,5?</h4>
          <table className="pk-tab kecil"><thead><tr><th>Bobot model</th><th>Validasi 2025 (H+1/3/7)</th><th>Uji 2026 (H+1/3/7)</th></tr></thead>
            <tbody>{vf.uji.sensitivitas_bobot.map((s) => <tr key={s.bobot} className={s.bobot === vf.bobot_model ? "pilih" : ""}><td>{fmt(s.bobot, 2)}</td>
              <td>{s.validasi.map(skillTxt).join(" / ")}</td><td>{s.uji.map(skillTxt).join(" / ")}</td></tr>)}</tbody></table>
          <p className="note">Bobot 0,5 dipilih setelah melihat 2026 (diungkap terbuka). Semua bobot 0,25–0,75 tetap positif di 2026.</p>
        </div>
        {kd && <div>
          <h4>Keandalan Peluang (H+7)</h4>
          <table className="pk-tab kecil"><thead><tr><th>Dikatakan</th><th>Rata-rata</th><th>Terjadi</th><th>n</th></tr></thead>
            <tbody>{kd.kelas.map((k) => <tr key={k.kelas}><td>{k.kelas}%</td><td>{pct(k.dikatakan)}</td><td>{pct(k.terjadi)}</td><td>{fmt(k.n, 0)}</td></tr>)}</tbody></table>
          <p className="note">Kelas ujung sangat tepat; kelas tengah terlalu rendah di musim asap 2026. Karena itu peluang ditampilkan sebagai Rendah, Sedang, atau Tinggi.</p>
        </div>}
      </div>
      <div className="pk-dua">
        <div>
          <h4>Uji Tanda Antarstasiun</h4>
          <table className="pk-tab kecil"><thead><tr><th>Horizon</th><th>Stasiun menang</th><th>p</th><th>Rentang 80%: pindah bulan / biasa</th></tr></thead>
            <tbody>{v6.uji_tanda.map((t, i) => <tr key={t.h}><td>H+{t.h}</td><td>{t.menang}/{t.n}</td><td>{t.p < 0.0001 ? "<0,0001" : fmt(t.p, 4)}</td>
              <td>{pct(U[i]?.cakupan80_lintas)} / {pct(U[i]?.cakupan80_biasa)}</td></tr>)}</tbody></table>
          <p className="note">Uji tanda dua sisi: peluang model menang di sebanyak itu stasiun bila sebenarnya setara menyalin. Rentang hari pindah bulan dikalibrasi terpisah dari validasi 2025.</p>
        </div>
        <div>
          <h4>Uji Balik Perkiraan Kasus Napas</h4>
          <table className="pk-tab kecil"><thead><tr><th>Kondisi</th><th>n</th><th>Rata-rata 7 hari</th><th>Via prakiraan PM</th><th>Turun</th></tr></thead>
            <tbody>{([["Semua", v6.kasus.uji.semua], ["Hari biasa", v6.kasus.uji.biasa], ["Pindah bulan", v6.kasus.uji.lintas], ["PM2.5 melompat > 35%", v6.kasus.uji.lompat]] as const).map(([l, u]) =>
              <tr key={l}><td>{l}</td><td>{fmt(u.n, 0)}</td><td>{fmt(u.mae_rata7, 2)}</td><td>{fmt(u.mae_prak, 2)}</td><td className="pos">{pct(u.turun)}</td></tr>)}</tbody></table>
          <p className="note">Galat rata-rata kasus napas per hari, 24 RS, Jan–Okt 2026, H+1 sampai H+7. Di data ini kasus dibangkitkan dari PM2.5, jadi hubungannya lebih kuat daripada di dunia nyata.</p>
        </div>
      </div>
      <p className="note"><b>Kenapa R² tidak dipakai:</b> data harian ini sangat halus (median perubahan {fmt(vf.struktur_bulanan.median_ubah_harian_pct, 1)}% per hari, autokorelasi {fmt(vf.struktur_bulanan.autokorelasi_lag1, 3)}), sehingga menyalin nilai hari ini pun sudah memberi R² mendekati 1. Ukuran yang jujur adalah keunggulan terhadap pembanding.</p>
    </div>
  );
}

/* ---------- telusuri: kualitas data ---------- */
function TabelKualitas({ vf, nama }: { vf: Verif; nama: (c: string) => string }) {
  return (
    <div className="pk-tab-wrap">
      <table className="pk-tab">
        <thead><tr><th>Stasiun</th><th>Alat</th><th>Hari Sah</th><th>2026</th><th>Celah Terpanjang</th><th>Rentang Tepat H+1</th><th>Keunggulan H+1</th><th>Catatan</th></tr></thead>
        <tbody>{vf.kualitas.map((q) => (
          <tr key={q.code}>
            <td><b>{nama(q.code)}</b> <small>{q.code}</small></td><td>{q.jenis_alat}</td><td>{pct(q.cakupan)}</td><td>{pct(q.cakupan_2026)}</td>
            <td>{q.celah_terpanjang ? `${fmt(q.celah_terpanjang, 0)} hari` : "–"}</td>
            <td>{q.diramal ? pct(q.cakupan80_h1) : "–"}</td>
            <td className={(q.skill_h1 ?? 0) >= 0 ? "pos" : "neg"}>{q.diramal ? skillTxt(q.skill_h1) : "tidak diramal"}</td>
            <td className="kiri">{q.lencana.join(", ") || "–"}</td>
          </tr>))}</tbody>
      </table>
      <p className="note">Lubang data terpusat di sedikit stasiun; sisanya lengkap. Fitur model berupa selisih log, sehingga bias pengali antar-alat (BAM, optik, sensor murah) ikut hilang. Rentang 80% dikalibrasi per stasiun. Ramalan hanya terbit bila minimal 4 dari 7 hari terakhir sah. Detail sensor: Bab Jaringan.</p>
    </div>
  );
}

function CaraKerja({ vf, sb }: { vf: Verif; sb: Verif["struktur_bulanan"] }) {
  const b = vf.setelan.terbaik;
  return (
    <div className="pk-cara">
      <div><b>Data</b><span>PM2.5 harian dari panel yang sama dengan seluruh dashboard (aturan pembersihan notebook), 1 Jan 2024 – {fmtDate(vf.terbit)}. Stasiun dengan kurang dari 365 hari sah tidak diramal.</span></div>
      <div><b>Yang Ditebak</b><span>Perubahan dari hari ini (skala log), bukan nilainya, karena puncak 2026 lebih tinggi dari apa pun di data latih.</span></div>
      <div><b>Petunjuk yang Dipakai</b><span>{vf.fitur.length} ukuran bentuk pergerakan: selisih hari ini dengan 1–7, 14, dan 30 hari lalu, dengan rata-rata 3, 7, dan 30 hari, serta naik-turun 7 hari.</span></div>
      <div><b>Yang Diuji dan Ditolak</b><span>Cuaca (kelembapan, angin, suhu, hari kering), CO, rasio PM2.5/PM10, pola jam malam, stasiun tetangga searah angin, musim, dan tingkat absolut. Tidak ada yang menambah akurasi 2026; fitur musim terbaik di validasi tetapi terburuk di uji (menghafal).</span></div>
      <div><b>Penyetelan</b><span>{vf.setelan.percobaan} percobaan Optuna di 2025. Terpilih: {String(b.objective)}, {b.n_estimators} pohon, {b.num_leaves} daun.</span></div>
      <div><b>Rentang dan Peluang</b><span>Rentang 80% dari sebaran galat 2025 per stasiun, musim, dan horizon. Peluang &gt; 55 = gabungan model dan pola musiman per stasiun-bulan, bobotnya dipilih di 2025.</span></div>
      <div><b>Lapis Transisi Bulan</b><span>Saat tanggal target pindah bulan, prakiraan = nilai hari ini + selisih log level bulan target dan bulan asal tahun lalu di stasiun itu. Di uji 2026 galat log turun sekitar 65% pada lintas bulan (validasi 2025: sekitar 58–61%). Metode ini memanfaatkan pola tangga bulanan di dataset ini; pada sensor yang tidak berpola begitu, lapis ini tidak banyak membantu.</span></div>
      <div><b>Kalender Musim</b><span>Median PM2.5 bulanan per stasiun 2024–2026. Bulan dalam tahun menjelaskan sekitar 99,7% variasi level bulanan (median per stasiun, 2024–2025); bulan setelah data terakhir memakai pola 2025.</span></div>
      <div><b>Kasus Napas</b><span>Rata-rata kasus 7 hari terakhir × (PM2.5 prakiraan ÷ PM2.5 7 hari terakhir)^(b ÷ ln 2), b per RS dari model dampak halaman Simulasi. Diuji balik pada arsip prakiraan 2026.</span></div>
      <div><b>Jam Rawan</b><span>Bentuk profil per jam 7 hari terakhir dikalikan prakiraan besok. Keandalan per stasiun = seberapa sering jam puncak jatuh dalam ±1 jam dari profil itu sepanjang 2026.</span></div>
      <div><b>Struktur Dataset</b><span>Tingkat PM2.5 di dataset berganti pada tanggal 1 tiap bulan: {sb.awal_lonjakan_tgl1} dari {sb.awal_lonjakan} awal lonjakan dan {sb.lonjakan_besar_tgl1} dari {sb.lonjakan_besar} lonjakan besar jatuh pada tanggal 1. Sebelumnya struktur ini sengaja tidak dimanfaatkan; sekarang dipakai secara terbuka di lapis transisi, dan bergantung pada dataset ini.</span></div>
      <div><b>Batasan</b><span>Tanpa titik api dan curah hujan, model tidak bisa melihat kebakaran baru sebelum asapnya terukur. Angka harian di atas 7 hari tidak ditampilkan.</span></div>
    </div>
  );
}

/* ---------- kalender musim × stasiun ---------- */
function Kalender({ st, nama, bIni, bDepan, kode, onPilih }: { st: KalSt[]; nama: (c: string) => string; bIni: number; bDepan: number; kode: string; onPilih: (c: string) => void }) {
  const sempit = typeof window !== "undefined" && window.innerWidth < 600;
  const baris = useMemo(() => [...st].sort((a, b) => PULAU_URUT.indexOf(a.pulau) - PULAU_URUT.indexOf(b.pulau)
    || Math.max(...(b.tahun["2026"]?.bulan.map((v) => v ?? 0) ?? [0])) - Math.max(...(a.tahun["2026"]?.bulan.map((v) => v ?? 0) ?? [0]))), [st]);
  const opt = useMemo<EChartsOption>(() => {
    const data: any[] = [];
    baris.forEach((k, yi) => {
      for (let m = 1; m <= 12; m++) {
        const ini = k.tahun["2026"]?.bulan[m - 1];
        const pola = ini == null || m > bIni;
        const v = pola ? k.tahun["2025"]?.bulan[m - 1] : ini;
        if (v == null) continue;
        const c = ispuIdx(v), depan = m === bDepan;
        data.push({ value: [m - 1, yi, c, v, pola ? 1 : 0], itemStyle: { color: ISPU_COL[c], opacity: pola ? 0.4 : 1,
          borderColor: depan ? C.ink : "#fff", borderWidth: depan ? 2.5 : 2 }, label: { color: pola ? C.ink : ISPU_ON[c] } });
      }
    });
    return {
      tooltip: { formatter: (q: any) => { const [m, yi, c, v, pola] = q.value; const k = baris[yi];
        return `<b>${nama(k.code)}</b> · ${BULAN[m]} ${pola ? "(pola 2025)" : "2026"}<br/>Median ${fmt(v, 0)} ${UG} · ${ISPU_LAB[c]}<br/>Bulan > 55: ${["2024", "2025", "2026"].map((y) => `${y}: ${k.tahun[y]?.lewat55.map((b) => BULAN[b - 1]).join(", ") || "–"}`).join("<br/>")}`; } },
      visualMap: { show: false, type: "piecewise", dimension: 2, pieces: ISPU_COL.map((c, i) => ({ value: i, color: c })) } as any,
      grid: { left: 8, right: 8, top: 26, bottom: 8, containLabel: true },
      xAxis: { type: "category", position: "top", data: BULAN.map((b, i) => (i + 1 === bIni ? `${b}\nkini` : i + 1 === bDepan ? `${b}\ndepan` : b)),
        axisTick: { show: false }, axisLine: { show: false }, axisLabel: { fontSize: 11, fontWeight: 600, color: C.ink, lineHeight: 13 } },
      yAxis: [
        { type: "category", inverse: true, data: baris.map((k) => (k.code === "KTG-02" ? `${nama(k.code)}†` : nama(k.code))), axisTick: { show: false }, axisLine: { show: false },
          axisLabel: { fontSize: sempit ? 10.5 : 12, color: C.ink, formatter: (v: string, i: number) => (baris[i]?.code === kode ? `{b|${v}}` : v), rich: { b: { fontWeight: 800, color: TEAL_INK, fontSize: 12 } } } },
        { type: "category", inverse: true, position: "right", data: baris.map((k) => `${kali(k.tahun["2024"]?.rasio)} → ${kali(k.tahun["2026"]?.rasio)}`),
          axisTick: { show: false }, axisLine: { show: false }, axisLabel: { show: !sempit, fontSize: 11, color: C.ink, fontFamily: "var(--font-num)" } },
      ],
      series: [{ type: "heatmap", data, label: { show: !sempit, fontSize: 10.5, formatter: (q: any) => fmt(q.value[3], 0) },
        emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1.5 } } } as any],
    };
  }, [baris, nama, bIni, bDepan, kode, sempit]);
  return <>
    <Chart option={opt} height={baris.length * 28 + 60} ariaLabel="Kalender PM2.5 bulanan per stasiun jalur asap"
      onClick={(p) => { const v = p.value as number[] | undefined; if (v) onPilih(baris[v[1]].code); }} />
    <div className="pk-legenda">{ISPU_LAB.map((l, i) => <span key={l}><i style={{ background: ISPU_COL[i] }} />{l}</span>)}<span><i className="pudar" />pola 2025</span></div>
  </>;
}

/* ---------- perkiraan kasus napas di RS pasangan ---------- */
function KasusRS({ v6, code, aktif }: { v6: V6; code: string; aktif: boolean }) {
  const r = v6.kasus.rs.find((x) => x.code === code);
  const opt = useMemo<EChartsOption | null>(() => {
    if (!r) return null;
    const n = r.riwayat.length;
    const lalu = Array.from({ length: n }, (_, i) => addDays(v6.terbit, i - n + 1));
    const x = [...lalu, ...r.hari.map((h) => h.tgl)];
    const pad = (k: number) => Array<null>(k).fill(null);
    return {
      tooltip: { trigger: "axis", valueFormatter: (v: any) => (v == null ? "–" : `${fmt(v, 0)} kasus`) },
      legend: { bottom: 0, data: ["Tercatat", "Perkiraan"], textStyle: { fontSize: 11 } },
      grid: { left: 6, right: 10, top: 16, bottom: 34, containLabel: true },
      xAxis: { type: "category", data: x, axisLabel: { formatter: (v: string) => pendek(v), fontSize: 10.5, interval: 6 } },
      yAxis: { type: "value", name: "kasus/hari", min: 0 },
      series: [
        { name: "Tercatat", type: "bar", data: [...r.riwayat, ...pad(7)], itemStyle: { color: GREY, borderRadius: [3, 3, 0, 0] }, barCategoryGap: "25%" },
        { name: "Perkiraan", type: "bar", data: [...pad(n), ...r.hari.map((h) => h.kasus)], itemStyle: { color: TEAL, borderRadius: [3, 3, 0, 0] },
          markLine: { silent: true, symbol: "none", lineStyle: { color: TEAL_INK, type: "dashed" }, label: { formatter: `rata-rata 7 hari ${fmt(r.rata7, 0)}`, position: "insideEndTop", fontSize: 10.5, color: TEAL_INK }, data: [{ yAxis: r.rata7 }] } },
      ] as any,
    };
  }, [r, v6.terbit]);
  if (!r || !opt) return <div className="pk-blok"><h4>Kasus Napas</h4><p className="note">Stasiun ini tidak punya rumah sakit pasangan dengan model dampak.</p></div>;
  const total = r.hari.reduce((a, h) => a + h.kasus, 0), lalu = r.rata7 * 7, beda = total - lalu;
  return (
    <div className="pk-blok">
      <h4>{r.nama}</h4>
      {aktif ? <p className="pk-kalimat">Perkiraan <b>{fmt(total, 0)} kasus napas</b> dalam 7 hari ({beda >= 0 ? "+" : "−"}{fmt(Math.abs(beda), 0)} dibanding 7 hari terakhir).</p>
        : <p className="pk-kalimat">Perkiraan kasus memakai tanggal terbit {fmtDate(v6.terbit)}; kembali ke mode Terbit untuk membaca angka ini.</p>}
      <Chart option={opt} height={220} ariaLabel="Kasus napas tercatat dan perkiraan 7 hari" />
    </div>
  );
}

/* ---------- jam terburuk besok ---------- */
function JamBesok({ v6, code, besok, tgl }: { v6: V6; code: string; besok: number | null; tgl: string }) {
  const j = v6.jam.find((x) => x.code === code);
  const opt = useMemo<EChartsOption | null>(() => {
    if (!j || besok == null) return null;
    const v = j.profil.map((p) => p * besok);
    return {
      tooltip: { trigger: "axis", formatter: (ps: any) => `${jamTxt(ps[0].dataIndex)} · ${fmt(ps[0].value, 0)} ${UG}<br/>${ISPU_LAB[ispuIdx(ps[0].value)]}` },
      grid: { left: 6, right: 6, top: 16, bottom: 22, containLabel: true },
      xAxis: { type: "category", data: v.map((_, i) => String(i).padStart(2, "0")), axisLabel: { interval: 2, fontSize: 10.5 }, axisTick: { show: false } },
      yAxis: { type: "value", name: UG, min: 0 },
      series: [{ type: "bar", data: v.map((x, i) => ({ value: +x.toFixed(1), itemStyle: { color: ISPU_COL[ispuIdx(x)], opacity: i === j.buruk || i === (j.buruk + 1) % 24 ? 1 : 0.55, borderRadius: [3, 3, 0, 0] } })), barCategoryGap: "18%" }] as any,
    };
  }, [j, besok]);
  if (!j || !opt) return <div className="pk-blok"><h4>Jam Rawan Besok</h4><p className="note">Profil per jam tidak tersedia untuk stasiun ini.</p></div>;
  return (
    <div className="pk-blok">
      <h4>Jam Rawan {hariKe(tgl)} {pendek(tgl)}</h4>
      <p className="pk-kalimat">Paling rawan <b>{jamTxt(j.buruk)}–{jamTxt((j.buruk + 2) % 24)}</b>, paling bersih <b>{jamTxt(j.bersih)}–{jamTxt((j.bersih + 2) % 24)}</b>.
        <span className="pk-andal" title="Seberapa sering jam puncak hari berikutnya jatuh dalam ±1 jam dari profil 7 hari sebelumnya, sepanjang 2026">tepat ±1 jam pada {pct(j.andal)} hari</span></p>
      <Chart option={opt} height={220} ariaLabel="Perkiraan PM2.5 per jam besok" />
    </div>
  );
}

/* ---------- cerita 1: besarnya musim naik tiap tahun ---------- */
function tumbuhOpt(st: KalSt[], nama: (c: string) => string): EChartsOption {
  const th = ["2024", "2025", "2026"];
  const rows = st.filter((k) => k.code !== "KTG-02" && th.every((y) => k.tahun[y]?.rasio != null));
  const top = [...rows].sort((a, b) => (b.tahun["2026"].rasio ?? 0) - (a.tahun["2026"].rasio ?? 0)).slice(0, 4).map((k) => k.code);
  return {
    tooltip: { trigger: "item", formatter: (q: any) => `<b>${q.seriesName}</b><br/>${q.name}: bulan terburuk ${kali(q.value)} bulan terbaik` },
    grid: { left: 8, right: 120, top: 20, bottom: 20, containLabel: true },
    xAxis: { type: "category", data: th, boundaryGap: false, axisLabel: { fontWeight: 650, color: C.ink } },
    yAxis: { type: "log", name: "terburuk ÷ terbaik", min: 1, axisLabel: { formatter: (v: number) => `×${v}` } },
    series: rows.map((k) => {
      const hl = top.includes(k.code);
      return { name: k.code === "KTG-01" ? KEMBAR_NAMA : nama(k.code), type: "line", data: th.map((y) => k.tahun[y].rasio), symbol: "circle", symbolSize: hl ? 7 : 4,
        lineStyle: { width: hl ? 2.5 : 1.2, color: hl ? C.gambut : GREY }, itemStyle: { color: hl ? C.gambut : GREY }, z: hl ? 3 : 1,
        endLabel: { show: hl, formatter: (q: any) => `${q.seriesName} ${kali(q.value)}`, fontSize: 11, fontWeight: 650, color: C.ink } };
    }) as any,
  };
}

/* ---------- cerita 2: keunggulan per stasiun ---------- */
function ujiOpt(Q: Kualitas[], nama: (c: string) => string): EChartsOption {
  const rows = Q.filter((q) => q.diramal && q.skill_h1 != null).sort((a, b) => (a.skill_h1 ?? 0) - (b.skill_h1 ?? 0));
  return {
    tooltip: { formatter: (q: any) => `<b>${q.name}</b><br/>Galat besok ${fmt(q.value, 0)}% lebih kecil dari menyalin` },
    grid: { left: 8, right: 24, top: 10, bottom: 30, containLabel: true },
    xAxis: { type: "value", min: (v: any) => Math.min(-5, Math.floor(v.min / 5) * 5), name: "% galat lebih kecil (besok)", nameLocation: "middle", nameGap: 22, axisLabel: { formatter: (v: number) => `${v}%` } },
    yAxis: { type: "category", data: rows.map((q) => nama(q.code)), axisTick: { show: false }, axisLabel: { fontSize: 10.5, color: C.ink } },
    series: [{ type: "scatter", data: rows.map((q) => +((q.skill_h1 ?? 0) * 100).toFixed(1)), symbolSize: 9, itemStyle: { color: TEAL_INK },
      markLine: { silent: true, symbol: "none", lineStyle: { color: C.ink, type: "solid", width: 1 }, label: { formatter: "setara menyalin", position: "insideEndTop", fontSize: 10.5 }, data: [{ xAxis: 0 }] } }] as any,
  };
}
