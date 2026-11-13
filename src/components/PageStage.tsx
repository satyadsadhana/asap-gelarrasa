import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MapViewState } from "@deck.gl/core";
import Stage3D, { type VIEWS } from "./Stage3D";
import { useData } from "../lib/data";
import { useApp, useStationFilter } from "../lib/state";
import { fmt, fmtDate, fmtPct, UG } from "../lib/format";
import type { Daily, Station, Summary } from "../lib/types";
import { dateAt } from "../lib/state";

type Score = { code: string; grade: string; kategori: string; baris_sensor_beku: number };
type Annual = { per_stasiun: { code: string; tahun: number; rata2: number; lengkap: boolean; lampaui_PP22: boolean }[] };
type Iku = { buta_asap_2025: string[] };
type Pairs = { pasangan_r099: { jarak_km: number; "beda_level_%": number }[] };
type Dose = { pita: { label: string[]; Kematian: number[]; "hari-RS": number[] } };
/** Bagian angka_kunci.json yang dipakai panggung. */
type AK = {
  tren_1jan_14okt: Record<string, { "2024": number; "2026": number }>;
  puncak_bulanan_gambut: Record<string, number>;
  minggu_awal_risiko_gambut: Record<string, number>;
  "dekomposisi_variasi_%": Record<string, number>;
  "shap_pemicu_%": Record<string, number>;
  korelasi_lalu_lintas_pm25_JanJun: number;
  rr_per_lipat_dua: Record<string, { rr: number }>;
  ambang: Record<string, number>;
  jaringan: Record<string, number>;
};
type Year = "2024" | "2025" | "2026";
type View = keyof typeof VIEWS | MapViewState;

/** Satu langkah cerita: judul pendek, 1–2 kalimat, dan apa yang diubah di panggung 3D. */
type Step = { t: string; d: ReactNode; view?: View; values?: Record<string, number | null>; visible?: (c: string) => boolean; labels?: string[]; arah?: Record<string, { a?: "start" | "end"; dy?: number }>; years?: boolean; tinggi?: string };

const at = (s: { lon: number; lat: number } | undefined, zoom = 5.6, bearing = -18): View =>
  s ? { longitude: s.lon, latitude: s.lat - 1.1, zoom, pitch: 58, bearing } : "nasional";
/** Kamera lebih jauh dan lebih landai supaya label stasiun tetangga tidak terpotong (poin 10). */
const dekat = (s: { lon: number; lat: number } | undefined, zoom: number, bearing: number): View =>
  s ? { longitude: s.lon + 0.6, latitude: s.lat - 0.6, zoom, pitch: 45, bearing } : "nasional";

const KAWASAN_LABEL: Record<string, string> = { Roadside: "Tepi jalan", "Latar Bersih": "Latar bersih" };
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
// Palangka Raya dan Sampit berdekatan dan nilainya hampir sama: label dipisah supaya tidak menimpa
const KEMBAR = { "KTG-01": { a: "start" as const }, "KTG-02": { a: "end" as const } };
const STS = 150.4; // batas atas kategori ISPU Sangat Tidak Sehat

/** Fakta Pola Waktu yang dihitung dari daily.json + station_summary (tidak diketik), lihat REVISI_FINAL bagian D. */
function waktuFakta(daily: Daily, summ: Summary[], byCode: Record<string, Station>) {
  const bulan: Record<string, number> = {};
  const n2024: Record<string, number> = {};
  let puncak = { code: "", tgl: "", v: -1 }, sm = { tgl: "", v: -1 };
  let mrd = [Infinity, -Infinity], pky = [0, 0];
  for (const [code, arr] of Object.entries(daily.pm25)) {
    arr.forEach((v, i) => {
      if (v == null) return;
      const tgl = dateAt(i, daily.mulai), m = Number(tgl.slice(5, 7));
      if (v > STS) {
        bulan[tgl.slice(0, 7)] = (bulan[tgl.slice(0, 7)] ?? 0) + 1;
        if (tgl < "2025") n2024[code] = (n2024[code] ?? 0) + 1;
      }
      if (v > puncak.v) puncak = { code, tgl, v };
      if (code === "SM2-01" && tgl < "2025" && v > sm.v) sm = { tgl, v };
      if (code === "JKT-02") mrd = [Math.min(mrd[0], v), Math.max(mrd[1], v)];
      if (code === "KTG-01" && m <= 6) pky = [pky[0] + v, pky[1] + 1];
    });
  }
  const [bm, bn] = Object.entries(bulan).sort((a, b) => b[1] - a[1])[0];
  const kel: Record<string, number[]> = {};
  summ.forEach((s) => { const st = byCode[s.code]; if (st && !st.dikecualikan) (kel[st.kelompok] ??= []).push(s.rata2_pm25); });
  return {
    bulanTerburuk: { label: `${BULAN_PANJANG[Number(bm.slice(5)) - 1]} ${bm.slice(0, 4)}${bm === "2026-10" ? " (s.d. 14 Okt)" : ""}`, n: bn },
    puncak,
    sm2024: { hanyaSamarinda: Object.keys(n2024).length === 1 && "SM2-01" in n2024, n: n2024["SM2-01"] ?? 0, ...sm },
    kawasan: Object.entries(kel).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length] as const).sort((a, b) => b[1] - a[1]),
    marunda: mrd,
    pkyJanJun: pky[0] / pky[1],
  };
}

/**
 * Panggung 3D + langkah cerita di atas tiap halaman topik. Semua angka dibaca dari JSON yang sama
 * dengan kartu angka di halaman, supaya tidak ada dua angka berbeda untuk hal yang sama.
 */
export default function PageStage({ path, cap = null }: { path: string; cap?: number | null }) {
  const d = useData<[Summary[], Score[], Annual, AK, Iku, Pairs, Daily, Dose]>("station_summary", "scorecard", "annual", "angka_kunci", "iku", "pairs", "daily", "dose_response");
  const { byCode } = useApp();
  const filt = useStationFilter();
  const [year, setYear] = useState<Year>("2026");
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [path]);

  const sc = useMemo(() => Object.fromEntries((d?.[1] ?? []).map((s) => [s.code, s])), [d]);
  const andal = useCallback((c: string) => filt(c) && sc[c]?.kategori === "Andal", [filt, sc]);
  const steps = useMemo<Step[]>(() => {
    if (!d) return [];
    const [summ, , ann, ak, iku, pairs, daily, dose] = d;
    const per = (y: Year) => Object.fromEntries(summ.map((s) => [s.code, (s as unknown as Record<string, number | null>)[`periode_${y}`] ?? null]));
    const mean = Object.fromEntries(summ.map((s) => [s.code, s.rata2_pm25]));
    const a25 = ann.per_stasiun.filter((r) => r.tahun === 2025 && r.lengkap);
    const v25 = Object.fromEntries(a25.map((r) => [r.code, r.rata2]));
    switch (path) {
      case "/kondisi": {
        const pulau: Record<string, number[]> = {};
        summ.forEach((s) => (pulau[s.pulau] ??= []).push(s.rata2_pm25));
        const rank = Object.entries(pulau).map(([p, v]) => [p, v.reduce((a, b) => a + b, 0) / v.length] as const).sort((a, b) => b[1] - a[1]);
        // poin 21: tanpa dua stasiun ber-data lemah (grade C/D) Kalimantan tetap paling pekat?
        const kal = summ.filter((s) => s.pulau === "Kalimantan" && !["C", "D"].includes(byCode[s.code]?.grade));
        const kalAndal = kal.reduce((a, s) => a + s.rata2_pm25, 0) / kal.length;
        const blind = new Set(iku.buta_asap_2025);
        // dihitung dari rata-rata (bukan kolom ubah_% yang dibulatkan) supaya sama dengan kartu: +102%
        const ch = (g: string) => (ak.tren_1jan_14okt[g]["2026"] / ak.tren_1jan_14okt[g]["2024"] - 1) * 100;
        return [
          { t: "Hampir Semua di Atas Batas", view: "nasional", values: v25, tinggi: "rata-rata 2025",
            d: <><b>{a25.filter((r) => r.lampaui_PP22).length} dari {a25.length}</b> stasiun punya rata-rata 2025 di atas baku mutu tahunan 15 {UG}.</> },
          { t: "Kalimantan Paling Pekat", view: "kalimantan", values: mean, tinggi: "rata-rata 2024–2026",
            d: <>Rata-rata per pulau: {rank.map(([p, v], k) => <span key={p}>{k ? " · " : ""}{p} <b>{fmt(v)}</b></span>)} {UG}. Tanpa Samarinda dan Banjarbaru (data grade C/D), Kalimantan tetap tertinggi ({fmt(kalAndal)}).</> },
          { t: "Gambut Memburuk, Kota Datar", view: "barat", values: per("2026"), tinggi: "rata-rata 1 Jan–14 Okt 2026",
            d: <>1 Jan–14 Okt, 2024 → 2026: kawasan gambut <b>{fmtPct(ch("Gambut"), 0, true)}</b>, kawasan lain hanya {fmtPct(ch("Non-gambut"), 0, true)}.</> },
          { t: "IKU Bilang \"Baik\"", view: "nasional", values: v25, visible: (c) => blind.has(c), tinggi: "rata-rata 2025", labels: ["SM2-01", "KTG-01", "PLB-01"],
            d: <><b>{blind.size} stasiun</b> ber-IKU "Baik" padahal PM2.5 &gt; 35 {UG}, karena IKU hanya menghitung NO₂ dan SO₂.</> },
        ];
      }
      case "/waktu": {
        const pk = ak.puncak_bulanan_gambut, mg = ak.minggu_awal_risiko_gambut;
        const w = waktuFakta(daily, summ, byCode);
        const sm = byCode["SM2-01"];
        return [
          { t: "Makin Pekat Tiap Tahun, Terparah Sep–Okt 2026", view: "kalimantan", values: per(year), years: true, tinggi: `rata-rata ${year}${year === "2026" ? " (s.d. 14 Okt)" : ""}`, labels: ["KTG-01", "KTG-02"], arah: KEMBAR,
            d: <>Puncak bulanan kawasan gambut: <b>{fmt(pk["2024"], 0)} → {fmt(pk["2025"], 0)} → {fmt(pk["2026"], 0)}</b> {UG}. Bulan terburuk se-jaringan: <b>{w.bulanTerburuk.label}</b> ({w.bulanTerburuk.n} hari-stasiun di atas 150,4). Hari terburuk: {fmtDate(w.puncak.tgl)}, {byCode[w.puncak.code]?.nama} <b>{fmt(w.puncak.v, 0)} {UG}</b>, hari terakhir data.</> },
          { t: "Musim Mulai Akhir Juli", view: "nasional", values: per("2026"), tinggi: "rata-rata 1 Jan–14 Okt 2026", labels: ["KTG-01", "PLB-01", "SM2-01"],
            d: <>Musim risiko gambut dimulai <b>minggu ke-{mg["2026"]}</b> (2024 dan 2025: minggu ke-{mg["2024"]}) dan memuncak September–Oktober, jadi siaga bisa dijadwalkan sebelum asap datang.
              {w.sm2024.hanyaSamarinda && sm ? <> Pada 2024 satu-satunya stasiun di atas 150 adalah {sm.nama} (kawasan industri, data grade {sm.grade}): {w.sm2024.n} hari, puncak {fmtDate(w.sm2024.tgl)} ({fmt(w.sm2024.v, 0)} {UG}). Karena datanya lemah, {sm.nama} tidak dipakai sebagai bukti tren asap gambut.</> : null}</> },
          { t: "Jam Sibuk Ada, Akhir Pekan Tidak", view: "jawa", values: mean, tinggi: "rata-rata 2024–2026", labels: ["JKT-01", "JKT-03"],
            d: <>Stasiun tepi jalan memuncak <b>07–09 dan 17–19</b>. Akhir pekan praktis sama dengan hari kerja (selisih median di bawah 0,1%), jadi membatasi kendaraan hanya di akhir pekan tidak akan banyak menurunkan rata-rata.</> },
          { t: "Industri Kotor Sepanjang Tahun, Gambut Hanya Saat Musim", view: "nasional", values: mean, tinggi: "rata-rata 2024–2026", labels: ["JKT-02", "KTG-01", "JKT-01", "IDP-01"],
            d: <>Rata-rata 2024–2026 (stasiun sah): {w.kawasan.map(([k, v], n) => <span key={k}>{n ? " · " : ""}{KAWASAN_LABEL[k] ?? k} <b>{fmt(v)}</b></span>)} {UG}. Bedanya di pola: Marunda tidak pernah sehat tetapi tidak pernah ekstrem ({fmt(w.marunda[0], 0)}–{fmt(w.marunda[1], 0)}); Palangka Raya hanya Sedang di Januari–Juni (±{fmt(w.pkyJanJun, 0)}), lalu meledak.</> },
        ];
      }
      case "/pemicu": {
        const dv = ak["dekomposisi_variasi_%"], sh = ak["shap_pemicu_%"];
        const cuaca = sh["Suhu"] + sh["Kelembapan"] + sh["Angin (kecepatan & arah)"];
        return [
          { t: `Musim: ${fmt(dv["Musim/episode (stasiun-bulan)"], 0)}%`, view: "barat", values: per("2026"), tinggi: "rata-rata 1 Jan–14 Okt 2026",
            d: <>Naik-turun PM2.5 paling banyak ditentukan <b>musim dan episode asap</b>, bukan lokasi.</> },
          { t: `Lokasi: ${fmt(dv["Lokasi (antar stasiun)"], 0)}%`, view: "nasional", values: mean, tinggi: "rata-rata 2024–2026",
            d: <>Beda antarstasiun menjelaskan <b>{fmt(dv["Lokasi (antar stasiun)"], 0)}%</b>: kota dan kawasan industri selalu lebih kotor.</> },
          { t: "Kota: Lalu Lintas", view: "jawa", values: mean, tinggi: "rata-rata 2024–2026", labels: ["JKT-01", "JKT-03", "JKT-02"],
            d: <>Di luar musim asap (Jan–Jun), lalu lintas dan PM2.5 searah: <b>ρ = {fmt(ak.korelasi_lalu_lintas_pm25_JanJun, 2)}</b>.</> },
          { t: `Cuaca: ±${fmt(cuaca, 0)}%`, view: "rendah", values: mean, tinggi: "rata-rata 2024–2026",
            d: <>Suhu, kelembapan, dan angin ikut menggeser PM2.5 di dalam satu stasiun: porsinya sekitar <b>{fmt(cuaca, 0)}%</b> menurut model (SHAP), sesudah musim.</> },
        ];
      }
      case "/dampak": {
        const rr = ak.rr_per_lipat_dua;
        // pita 350–500 dan >500 dari dose_response.json (sudah dicek identik dengan dataset); dibobot jumlah hari-RS
        const pt = dose.pita, ix = pt.label.map((l, k) => [l, k] as const).filter(([l]) => l === "350–500" || l === ">500").map(([, k]) => k);
        const kematian350 = ix.reduce((a, k) => a + pt.Kematian[k] * pt["hari-RS"][k], 0) / ix.reduce((a, k) => a + pt["hari-RS"][k], 0);
        const p = (k: string) => fmtPct((rr[k].rr - 1) * 100, 0, true);
        return [
          { t: "PM2.5 Berlipat Dua", view: at(byCode["KTG-01"]), values: mean, labels: ["KTG-01"], tinggi: "rata-rata 2024–2026",
            d: <>Di 25 RS pasangan, kasus ISPA balita naik <b>{p("ISPA balita")}</b> dan kematian <b>{p("Kematian")}</b> setiap PM2.5 harian berlipat dua.</> },
          { t: "Di Hari yang Sama", view: "nasional", values: mean, tinggi: "rata-rata 2024–2026",
            d: <>Efeknya muncul <b>hari itu juga</b>. Jeda 1–3 hari dan uji plasebo tidak bermakna.</> },
          { t: "Balita ≈ Lansia", view: "nasional", values: mean, tinggi: "rata-rata 2024–2026",
            d: <>ISPA balita {p("ISPA balita")} dan lansia {p("ISPA lansia")}: kedua kelompok <b>sama rentan</b>.</> },
          { t: "Makin Pekat, Jantung Makin Terdampak", view: "kalimantan", values: per("2026"), tinggi: "rata-rata 1 Jan–14 Okt 2026",
            d: <>Kasus jantung dan kematian naik makin tajam saat PM2.5 sangat tinggi. Pada hari dengan PM2.5 di atas 350 {UG}, kematian sekitar <b>{fmt(kematian350, 0)}×</b> hari biasa.</> },
        ];
      }
      case "/jaringan": {
        const j = ak.jaringan;
        const beku = Object.values(sc).reduce((a, s) => a + (s.baris_sensor_beku ?? 0), 0);
        const kembar = pairs.pasangan_r099[0];
        // shortcut: daftar prioritas = Tabel 3.5 laporan (build_docx.py); ubah keduanya bersamaan
        // JMB-02 tidak punya tiang (dikecualikan), jadi labelnya dipasang di tetangganya JMB-01
        const prio = ["BJB-01", "SM2-01", "KTG-02", "JMB-01", "MER-01", "KTB-01"];
        return [
          { t: `${j.Andal} dari 27 Andal`, view: "nasional", values: mean, visible: andal,
            d: <>Tiang abu-abu pendek = <b>tidak andal</b>: {j["Diakui metadata"]} diakui metadata, {j["TERSEMBUNYI (status Active)"]} tersembunyi.</> },
          { t: "Beku, tetapi Berlabel VALID", view: dekat(byCode["BJB-01"], 5.2, -10), values: mean, labels: ["BJB-01", "SM2-01"],
            d: <>Banjarbaru membeku <b>{fmt(beku, 0)} jam</b> dengan label VALID. QC yang hanya membaca label tidak menangkapnya.</> },
          { t: "Kandidat Kembar", view: dekat(byCode["KTG-01"], 5.2, 20), values: mean, labels: ["KTG-01", "KTG-02"], arah: KEMBAR,
            d: <>Palangka Raya dan Sampit hanya beda level <b>{fmt(kembar["beda_level_%"], 1)}%</b> ({fmt(kembar.jarak_km, 0)} km). Perlu verifikasi lapangan.</> },
          // kamera digeser ke timur supaya Merauke masuk bingkai; label stasiun yang berdekatan
          // (Sumatra dan Kalimantan) dipisah ke kiri, kanan, atau bawah supaya tidak bertumpuk
          { t: "Titik Prioritas", view: { longitude: 120.5, latitude: -3.2, zoom: 3.45, pitch: 40, bearing: 0 }, values: mean, labels: prio,
            arah: { "KTB-01": { a: "end" }, "JMB-01": { dy: 26 }, "KTG-02": { a: "end" }, "BJB-01": { a: "start", dy: 6 } },
            d: <>Prioritas: <b>Kalsel & Kaltim</b>, koridor gambut Kalteng, Muaro Jambi (unit kedua JMB-02 tanpa data sah, dekat Kota Jambi), Papua Selatan (Merauke tanpa data sah), jalur asap Sumbar–Riau.</> },
        ];
      }
      default:
        return [];
    }
  }, [d, path, year, byCode, andal, sc]);

  if (!d) return <div className="stage3d" style={{ height: 400 }} />;

  // Simulasi: tanpa langkah; tiang = hari terburuk (p95) yang dipotong slider batas.
  if (path === "/aksi") {
    const p95 = Object.fromEntries(d[0].map((s) => [s.code, s.p95_pm25]));
    return (
      <div className="page-stage">
        <Stage3D values={p95} view="rendah" visible={filt} height={380} cap={cap}
          caption={cap != null
            ? <>Tinggi tiang = PM2.5 pada hari-hari terburuk (persentil 95). Bagian transparan = yang <b>dipotong</b> bila batas harian {cap} {UG} ditegakkan.</>
            : <>Tinggi tiang = PM2.5 pada hari-hari terburuk (persentil 95).</>} />
      </div>
    );
  }
  const s = steps[Math.min(i, steps.length - 1)];
  if (!s) return null;

  const cur = Math.min(i, steps.length - 1);
  return (
    <div className="page-stage split" data-tour="stage">
      <div className="lever">
        <div className="lever-head">
          <span>Langkah {cur + 1} dari {steps.length}</span>
          <span className="lever-nav">
            <button aria-label="Langkah sebelumnya" disabled={cur === 0} onClick={() => setI(cur - 1)}>‹</button>
            <button aria-label="Langkah berikutnya" disabled={cur === steps.length - 1} onClick={() => setI(cur + 1)}>›</button>
          </span>
        </div>
        <ol className="steps" aria-label="Langkah cerita" style={{ "--p": steps.length > 1 ? cur / (steps.length - 1) : 0 } as React.CSSProperties}>
          {steps.map((st, k) => (
            <li key={k}>
              <button aria-current={k === cur ? "step" : undefined} className={k < cur ? "done" : ""} onClick={() => setI(k)}>
                <span className="n">{k + 1}</span><b>{st.t}</b>
                <span className="d">{st.d}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="stage-pane">
        <Stage3D values={s.values ?? {}} view={s.view ?? "nasional"} visible={s.visible ?? filt} labels={s.labels} arah={s.arah} height={460}
          caption={s.tinggi ? <>Tinggi tiang: PM2.5 {s.tinggi}.</> : undefined} />
        {s.years && (
          <span className="stage-years seg" role="group" aria-label="Tahun">
            {(["2024", "2025", "2026"] as Year[]).map((y) => <button key={y} aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>)}
          </span>
        )}
      </div>
    </div>
  );
}
