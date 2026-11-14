import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import Chart from "../components/Chart";
import { Card, Kpi, Page, Story } from "../components/Layout";
import { BarsViz, DotsViz } from "../components/Viz";
import type { Kerucut } from "../components/KerucutWaktu";
import { useData } from "../lib/data";
import { BULAN, fmt, fmtDate, UG } from "../lib/format";
import { useApp } from "../lib/state";
import { C, RAMP } from "../lib/theme";

const KerucutWaktu = lazy(() => import("../components/KerucutWaktu"));

/* ---------- bentuk data (ditulis oleh scripts/prakiraan/prakiraan.py v4) ---------- */
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
type Arsip = { mulai: string; rentang: Record<string, { musim: [number, number][]; luar: [number, number][] }>;
  stasiun: Record<string, { nilai: (number | null)[][]; peluang: (number | null)[][]; siaga: number[]; aktual: (number | null)[] }> };

/** Satu tampilan stasiun (terbit atau putar ulang) yang dipakai peta, daftar, dan detail. */
type Tampil = { code: string; nama: string; kembar: boolean; siaga: boolean; riwayat: (number | null)[]; h0: number | null; rasio: number | null;
  hari: { tgl: string; h: number; nilai: number; lo: number; hi: number; p: number; kelas: Kelas; akt: number | null }[] };

const TEAL = "#2ec4b6", TEAL_INK = "#0b5563", GREY = "#b9c9ce";
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const KELAS_LAB: Record<Kelas, string> = { rendah: "Rendah", sedang: "Sedang", tinggi: "Tinggi" };
const KELAS_COL: Record<Kelas, string> = { rendah: "#e9eff1", sedang: RAMP[2], tinggi: RAMP[5] };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const selisih = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const pendek = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`; };
const hariKe = (iso: string) => HARI[new Date(iso + "T00:00:00Z").getUTCDay()];
const kelasDari = (p: number): Kelas => (p > 0.7 ? "tinggi" : p >= 0.3 ? "sedang" : "rendah");
const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${fmt(v * 100, d)}%`);
const skillTxt = (s: number | null | undefined) => (s == null ? "–" : Math.abs(s) < 0.005 ? "Setara" : `${s > 0 ? "+" : "−"}${fmt(Math.abs(s) * 100, 0)}%`);
const resiko = (t: Tampil) => Math.max(...t.hari.map((x) => x.p));
const KEMBAR_NAMA = "Palangka Raya–Sampit";
/** Kategori ISPU 24 jam dari PM2.5 (µg/m³). Indeks 0 = Baik … 4 = Berbahaya. */
const ISPU_LAB = ["Baik", "Sedang", "Tidak Sehat", "Sangat Tidak Sehat", "Berbahaya"];
const ispuIdx = (v: number) => (v <= 15.5 ? 0 : v <= 55.4 ? 1 : v <= 150.4 ? 2 : v <= 250.4 ? 3 : 4);
const CERITA = [{ tgl: "2026-07-25", lab: "25 Jul: siaga sebelum lonjakan" }, { tgl: "2026-06-24", lab: "24 Jun: lonjakan tak terduga" }];

export default function Q7Prakiraan() {
  const d = useData<[Prak, Verif, Arsip]>("prakiraan_pm25", "prakiraan_verifikasi", "prakiraan_arsip");
  const { byCode } = useApp();
  const [pilih, setPilih] = useState<string | null>(null);
  const [hari, setHari] = useState(1);
  const [main, setMain] = useState(false);
  const [mode, setMode] = useState<"terbit" | "ulang">("terbit");
  const [fokus, setFokus] = useState<"semua" | "berubah">("semua");
  const [ulang, setUlang] = useState("2026-07-25");

  // putar H0 -> H+7 sekali
  useEffect(() => {
    if (!main) return;
    const t = window.setInterval(() => setHari((h) => { if (h >= 7) { setMain(false); return 7; } return h + 1; }), 800);
    return () => clearInterval(t);
  }, [main]);

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
      const rg = ar.rentang[code]?.[musim ? "musim" : "luar"];
      const rw = a.aktual.slice(Math.max(0, i - 29), i + 1);
      out.push({ code, nama: nm(code), kembar: code === "KTG-01" || code === "KTG-02", siaga: a.siaga[i] === 1, riwayat: rw, h0: a.aktual[i] ?? null, rasio: null,
        hari: v.map((x, h) => {
          const val = x ?? 0, l = Math.log1p(val);
          const pp = (p[h] ?? 0) / 100;
          return { tgl: addDays(ulang, h + 1), h: h + 1, nilai: val, lo: rg ? Math.expm1(l + rg[h][0]) : val, hi: rg ? Math.expm1(l + rg[h][1]) : val,
            p: pp, kelas: kelasDari(pp), akt: a.aktual[i + h + 1] ?? null };
        }) });
    }
    return out.sort((a, b) => resiko(b) - resiko(a) || b.hari[0].nilai - a.hari[0].nilai);
  }, [d, mode, ulang, byCode]);

  if (!d || !tampil) return <div className="loading">Memuat prakiraan…</div>;
  const [pk, vf, ar] = d;
  const U = vf.uji.per_horizon, Vd = vf.validasi.per_horizon;
  const h1 = U[0], h7 = U[U.length - 1];
  const kode = pilih && tampil.some((s) => s.code === pilih) ? pilih : tampil[0]?.code;
  const sel = tampil.find((s) => s.code === kode) ?? tampil[0];
  const terbit = fmtDate(pk.terbit);
  const nama = (c: string) => byCode[c]?.nama ?? c;
  const cak = U.reduce((a, r) => a + r.cakupan80, 0) / U.length;
  const stBagus = Math.min(...U.map((r) => r.stasiun_cakupan_70_90[0]));
  const lj = vf.lonjakan, sb = vf.struktur_bulanan;
  const hariUlang = selisih(ar.mulai, addDays(pk.terbit, -1));

  // label hanya 5 teratas; stasiun kembar satu label
  const top: Tampil[] = [];
  for (const t of tampil) {
    if (top.length >= 5) break;
    if (t.kembar && top.some((x) => x.kembar)) continue;
    top.push(t);
  }
  // stasiun yang kategori ISPU-nya berubah dalam 7 hari ke depan, diurutkan menurut besar perubahan
  const berubah = tampil.map((t) => {
    const k0 = ispuIdx(t.h0 ?? t.hari[0].nilai);
    let best = 0, bh = 1;
    t.hari.forEach((x) => { const dlt = Math.abs(ispuIdx(x.nilai) - k0); if (dlt > best) { best = dlt; bh = x.h; } });
    const x = t.hari[bh - 1];
    return { t, k0, kt: ispuIdx(x.nilai), bh, tgl: x.tgl, besar: best, akt: x.akt == null ? null : ispuIdx(x.akt) };
  }).filter((r) => r.besar > 0).sort((a, b) => b.besar - a.besar || b.kt - a.kt || b.t.hari[b.bh - 1].nilai - a.t.hari[a.bh - 1].nilai);
  const jumlahBerubah = berubah.filter((r) => !(r.t.code === "KTG-02" && tampil.some((x) => x.code === "KTG-01"))).length;
  const kerucutTampil = fokus === "berubah" ? tampil.filter((t) => berubah.some((r) => r.t.code === t.code)) : tampil;
  const kerucut: Kerucut[] = kerucutTampil.flatMap((t) => {
    const s = byCode[t.code];
    if (!s) return [];
    return [{ code: t.code, nama: t.kembar ? `${t.nama} (sinyal kembar)` : t.nama, lon: s.lon, lat: s.lat, siaga: t.siaga,
      nilai: [t.h0, ...t.hari.map((x) => x.nilai)], atas: [null, ...t.hari.map((x) => x.hi)],
      aktual: mode === "ulang" ? [null, ...t.hari.map((x) => x.akt)] : undefined,
      label: top.some((x) => x.code === t.code) ? (t.kembar ? KEMBAR_NAMA : t.nama) : null }];
  });

  return (
    <Page path="/prakiraan" noStage
      headline={pk.judul_risiko > 0 ? `${pk.judul_risiko} Stasiun Berpeluang Melewati 55 Minggu Ini` : "Tidak Ada Stasiun yang Berpeluang Melewati 55 Minggu Ini"}
      method={<div className="pk-method">
        <span>Dari data terakhir {terbit}. Prakiraan = rata-rata nilai hari ini dan model LightGBM yang menebak perubahan dari bentuk pergerakan 30 hari terakhir. Bila tanggal target pindah bulan, prakiraan memakai rasio level bulan yang sama tahun lalu di stasiun itu.</span>
        <span>Diuji jujur: setiap bulan model dilatih ulang hanya dengan data sebelum bulan itu. Penyetelan dan kalibrasi memakai 2025; semua angka akurasi di halaman ini dari 2026, dengan uji Diebold–Mariano dan selang kepercayaan.</span>
        <span>Ini alat bantu, bukan peringatan resmi BMKG atau ISPU. Lonjakan yang mengikuti pola pergantian bulan tahun lalu bisa diantisipasi; lonjakan baru yang menyimpang dari pola itu tidak.</span>
      </div>}
      kpis={<>
        <Kpi k="Berpeluang Melewati 55 Minggu Ini" v={`${pk.judul_risiko}`} viz={<DotsViz n={pk.judul_risiko} total={pk.stasiun.length - 1} tone="alert" />}
          note={`dari ${pk.stasiun.length - 1} lokasi · ${KEMBAR_NAMA} dihitung sekali · data terakhir ${terbit}`} />
        <Kpi k="Lebih Tepat dari Menyalin Nilai Hari Ini" v={skillTxt(h1.skill)}
          viz={<BarsViz values={[h1.mae_salin, h1.mae_model]} labels={["Salin", "Model"]} tone="focus" />}
          note={`besok meleset rata-rata ±${fmt(h1.mae_model, 0)} ${UG} · selang 95% di atas nol di ${U.every((r) => r.skill_ci[0] > 0) ? "semua 7 horizon" : "sebagian horizon"}`} />
        <Kpi k="Rentang 80% Teruji" v={pct(cak)} viz={<DotsViz n={Math.round(cak * 10)} total={10} tone="focus" cols={10} />}
          note={`nilai 2026 jatuh di dalam rentang · ${stBagus}–25 dari 25 stasiun di 70–90%`} />
      </>}
      main={<>
        <Card title="Kerucut Waktu: Tujuh Hari ke Depan"
          sub={<>Tanah = hari terbit, makin tinggi = makin jauh ke depan. Luas cakram = PM2.5, warna = kategori ISPU, cincin tipis = batas atas rentang 80%. Filter "Yang Berubah" hanya menampilkan stasiun yang pindah kategori.{mode === "ulang" && " Titik putih = yang benar-benar terjadi."}</>}
          note={<>{pk.dikecualikan.length > 0 && <>Tidak diramal: {pk.dikecualikan.map((x) => nama(x.code)).join(", ")} (data tidak cukup). </>}
            {KEMBAR_NAMA}: dua stasiun dengan data nyaris identik (korelasi 1,00), dihitung sekali. Cincin oranye di tanah = Kalender Siaga: bulan depan biasanya musim asap di stasiun itu.</>}>
          <div className="kw-bar">
            <div className="kw-mode" role="tablist" aria-label="Mode peta">
              <button role="tab" aria-selected={mode === "terbit"} className={mode === "terbit" ? "on" : ""} onClick={() => setMode("terbit")}>Terbit {pendek(pk.terbit)}</button>
              <button role="tab" aria-selected={mode === "ulang"} className={mode === "ulang" ? "on" : ""} onClick={() => setMode("ulang")}>Putar Ulang 2026</button>
            </div>
            <div className="kw-mode" role="tablist" aria-label="Tampilkan stasiun">
              <button role="tab" aria-selected={fokus === "berubah"} className={fokus === "berubah" ? "on" : ""} onClick={() => setFokus("berubah")}>Yang Berubah ({jumlahBerubah})</button>
              <button role="tab" aria-selected={fokus === "semua"} className={fokus === "semua" ? "on" : ""} onClick={() => setFokus("semua")}>Semua</button>
            </div>
            <div className="kw-hari" role="group" aria-label="Pilih hari">
              <button className="kw-play" onClick={() => { setHari(0); setMain(true); }} aria-label="Putar hari terbit sampai H+7">▶</button>
              {Array.from({ length: 8 }, (_, i) => (
                <button key={i} className={hari === i ? "on" : ""} onClick={() => { setMain(false); setHari(i); }}>{i === 0 ? "H0" : `H+${i}`}</button>
              ))}
            </div>
          </div>
          {mode === "ulang" && <div className="kw-ulang">
            <label>Tanggal terbit <b>{hariKe(ulang)} {fmtDate(ulang)}</b>
              <input type="range" min={0} max={hariUlang} value={selisih(ar.mulai, ulang)} onChange={(e) => setUlang(addDays(ar.mulai, +e.target.value))} aria-label="Tanggal terbit putar ulang" />
            </label>
            <div className="kw-cerita">{CERITA.map((c) => <button key={c.tgl} className={ulang === c.tgl ? "on" : ""} onClick={() => setUlang(c.tgl)}>{c.lab}</button>)}</div>
          </div>}
          <div className="kw-grid">
            <Suspense fallback={<div className="stage3d" style={{ height: 520 }} />}>
              <KerucutWaktu data={kerucut} hari={hari} pilih={kode} onPick={setPilih}
                fallback={<Peta st={tampil} kode={kode} onPilih={setPilih} />} />
            </Suspense>
            <aside className="kw-list">
              <h3>Yang Berubah Kategori, 7 Hari ke Depan</h3>
              <ol>
                {berubah.filter((r) => !(r.t.code === "KTG-02" && tampil.some((x) => x.code === "KTG-01"))).slice(0, 8).map((r) => (
                  <li key={r.t.code} className={r.t.code === kode ? "on" : ""}>
                    <button onClick={() => setPilih(r.t.code)}>
                      <span className="nm">{r.t.kembar ? KEMBAR_NAMA : r.t.nama}{r.t.siaga && <i className="kw-siaga" title="Kalender Siaga">siaga</i>}</span>
                      <em className={`kls k-${r.kt >= r.k0 ? "tinggi" : "rendah"}`}>{ISPU_LAB[r.k0]} → {ISPU_LAB[r.kt]}</em>
                      <small>
                        {r.kt > r.k0 ? "naik" : "turun"} pada {hariKe(r.tgl)} {pendek(r.tgl)} (H+{r.bh})
                        {r.t.rasio != null && <> · tahun lalu {r.t.rasio.toFixed(1).replace(".", ",")}× dari bulan ini</>}
                        {r.akt != null && <> · terjadi <b>{ISPU_LAB[r.akt]}</b> {r.akt === r.kt ? "✓" : "✗"}</>}
                      </small>
                    </button>
                  </li>
                ))}
              </ol>
              {berubah.length === 0 && <p className="note">Tidak ada stasiun yang berubah kategori dalam 7 hari ke depan.</p>}
              <p className="note">Kategori ISPU 24 jam. Hanya perubahan yang ditampilkan.</p>
            </aside>
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
                <em>{KELAS_LAB[x.kelas]}</em>
                {x.akt != null && <span className="akt">terjadi {fmt(x.akt, 0)}</span>}
                {!U[x.h - 1]?.nyata && <span className="setara">setara menyalin</span>}
              </li>
            ))}
          </ol>
        </Card>
      </>}
      stories={<>
        <Story tone="focus" title="Bertahan atau Datang?"
          big={pct(h1.tangkap55)} bigNote={`hari di atas 55 yang sudah ditandai sehari sebelumnya, uji 2026`}
          chart={<Chart option={bertahanOpt(U, lj)} height={300} ariaLabel="Hari di atas 55 yang tertangkap per horizon, dan awal lonjakan 2026" />}>
          <p>Kalau asap sudah datang, prakiraan tahu ia bertahan: {pct(h1.tangkap55)} hari di atas 55 tertangkap untuk besok, {pct(h7.tangkap55)} untuk H+7. Lonjakan awal bulan yang mengikuti pola tahun lalu sudah diantisipasi oleh lapis transisi; lonjakan yang menyimpang dari pola itu tetap tidak terduga. Kalender Siaga mencatat {lj.tertangkap} dari {lj.jumlah} lonjakan 2026 di bulan siaga.</p>
          <div className="pk-chips">{lj.kejadian.map((e) => (
            <span key={e.code + e.tgl} className={e.siaga ? "ya" : "tidak"}>{e.siaga ? "✓" : "✗"} {e.code === "KTG-01" || e.code === "KTG-02" ? `${nama(e.code)}*` : nama(e.code)} · {pendek(e.tgl)}</span>))}
          </div>
          <p className="note">✓ = jatuh di bulan siaga. * = sinyal kembar, sebenarnya satu kejadian. Selang kepercayaan 95%: {pct(lj.wilson95[0])}–{pct(lj.wilson95[1])}, karena kejadiannya sedikit.</p>
        </Story>
        <Story tone="gambut" flip title="Jarak Jauh: Kenapa Angka Harian Berhenti di 7 Hari"
          big="H+30" bigNote={`galat model ${fmt(vf.horizon_panjang.find((r) => r.h === 30)?.mae_model ?? 0, 1)} ${UG} vs ${fmt(vf.horizon_panjang.find((r) => r.h === 30)?.mae_salin ?? 0, 1)} menyalin`}
          chart={<Chart option={panjangOpt(vf.horizon_panjang)} height={300} ariaLabel="Galat model, menyalin, dan pola musiman per jarak hari" />}>
          <p>Model unggul atas menyalin dan atas pola musiman di semua jarak yang diuji, sampai H+78. Tetapi keunggulan jarak jauh sebagian besar berasal dari pergantian bulan yang berulang di dataset ini, bukan dari kemampuan meramal cuaca. Karena itu angka harian tetap dibatasi 7 hari; rentang 80% makin lebar seiring jarak. Untuk November–Desember: <NovDes vf={vf} nama={nama} /></p>
        </Story>
      </>}
      more={[
        <div key="t" data-title="Semua Stasiun × 7 Hari"><Peta st={tampil} kode={kode} onPilih={setPilih} /></div>,
        <div key="a" data-title="Akurasi"><Akurasi U={U} V={Vd} vf={vf} /></div>,
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

/* ---------- cerita 1: bertahan vs datang ---------- */
function bertahanOpt(U: PH[], lj: Verif["lonjakan"]): EChartsOption {
  const rows = U.filter((r) => [1, 3, 5, 7].includes(r.h));
  return {
    tooltip: { trigger: "axis", valueFormatter: (v: any) => `${fmt(v, 0)}%` },
    legend: { bottom: 0, data: ["Hari di atas 55 (episode berjalan)", "Awal lonjakan (model)"], textStyle: { fontSize: 11.5 } },
    grid: { left: 8, right: 12, top: 30, bottom: 40, containLabel: true },
    xAxis: { type: "category", data: rows.map((r) => `H+${r.h}`), axisLabel: { fontWeight: 650, color: C.ink } },
    yAxis: { type: "value", max: 100, name: "% tertangkap", axisLabel: { formatter: (v: number) => `${v}%` } },
    series: [
      { name: "Hari di atas 55 (episode berjalan)", type: "bar", barGap: "12%", data: rows.map((r) => +((r.tangkap55 ?? 0) * 100).toFixed(1)),
        itemStyle: { color: TEAL, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", formatter: (q: any) => `${fmt(q.value, 0)}%`, fontSize: 11, fontWeight: 700, color: C.ink } },
      { name: "Awal lonjakan (model)", type: "bar", data: rows.map(() => 0.6), itemStyle: { color: C.gambut, borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", formatter: () => "0", fontSize: 11, fontWeight: 700, color: C.gambut } },
    ] as any,
    graphic: [{ type: "text", right: 14, top: 4, style: { text: `Kalender Siaga: ${lj.tertangkap} dari ${lj.jumlah} lonjakan di bulan siaga`, fill: C.ink, fontSize: 11.5, fontWeight: 600 } }] as any,
  };
}

/* ---------- cerita 2: batas horizon ---------- */
function panjangOpt(P: Verif["horizon_panjang"]): EChartsOption {
  const x = P.map((r) => `H+${r.h}`);
  return {
    tooltip: { trigger: "axis", valueFormatter: (v: any) => `${fmt(v, 1)} ${UG}` },
    legend: { bottom: 0, data: ["Model", "Menyalin hari ini", "Pola musiman"], textStyle: { fontSize: 11.5 } },
    grid: { left: 8, right: 16, top: 28, bottom: 40, containLabel: true },
    xAxis: { type: "category", data: x, boundaryGap: false, axisLabel: { fontWeight: 650, color: C.ink } },
    yAxis: { type: "value", name: `galat (${UG})` },
    series: [
      { name: "Model", type: "line", data: P.map((r) => r.mae_model), symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5, color: TEAL_INK }, itemStyle: { color: TEAL_INK },
        markArea: { silent: true, itemStyle: { color: "rgba(46,196,182,0.08)" }, label: { show: true, position: "insideTop", formatter: "Ditampilkan", color: TEAL_INK, fontWeight: 700, fontSize: 11 },
          data: [[{ xAxis: "H+1" }, { xAxis: "H+7" }]] } },
      { name: "Menyalin hari ini", type: "line", data: P.map((r) => r.mae_salin), symbol: "none", lineStyle: { width: 1.6, color: GREY, type: "dashed" }, itemStyle: { color: GREY } },
      { name: "Pola musiman", type: "line", data: P.map((r) => r.mae_klimatologi), symbol: "circle", symbolSize: 6, lineStyle: { width: 2, color: C.gambut }, itemStyle: { color: C.gambut } },
    ] as any,
  };
}

function NovDes({ vf, nama }: { vf: Verif; nama: (c: string) => string }) {
  const lewat = vf.pola_nov_des.filter((r) => r.p55 >= 0.5);
  const thn = [...new Set(vf.pola_nov_des.flatMap((r) => r.tahun))].join(" dan ");
  return <>di {thn}, {lewat.length === 0 ? "tidak ada stasiun yang melewati 55" : <>hanya {lewat.map((r) => `${nama(r.code)} (rata-rata ${fmt(r.rata, 0)})`).join(", ")} yang biasanya melewati 55</>}; stasiun di jalur asap Kalimantan dan Sumatra turun di bawah 55. Risiko bergeser dari asap ke polusi kota dan industri.</>;
}

/* ---------- telusuri: akurasi ---------- */
function Akurasi({ U, V, vf }: { U: PH[]; V: PH[]; vf: Verif }) {
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
      <div><b>Struktur Dataset</b><span>Tingkat PM2.5 di dataset berganti pada tanggal 1 tiap bulan: {sb.awal_lonjakan_tgl1} dari {sb.awal_lonjakan} awal lonjakan dan {sb.lonjakan_besar_tgl1} dari {sb.lonjakan_besar} lonjakan besar jatuh pada tanggal 1. Sebelumnya struktur ini sengaja tidak dimanfaatkan; sekarang dipakai secara terbuka di lapis transisi, dan bergantung pada dataset ini.</span></div>
      <div><b>Batasan</b><span>Tanpa titik api dan curah hujan, model tidak bisa melihat kebakaran baru sebelum asapnya terukur. Angka harian di atas 7 hari tidak ditampilkan.</span></div>
    </div>
  );
}
