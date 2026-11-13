import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import Chart from "../components/Chart";
import { Card, Kpi, Page, Story } from "../components/Layout";
import { BarsViz, DotsViz } from "../components/Viz";
import { useData } from "../lib/data";
import { BULAN, fmt, fmtDate, UG } from "../lib/format";
import { useApp } from "../lib/state";
import { C, RAMP } from "../lib/theme";

/* ---------- bentuk data (ditulis oleh scripts/prakiraan/prakiraan.py) ---------- */
type Hari = { tgl: string; h: number; nilai: number; lo: number; hi: number; p55: number };
type StPrak = { code: string; nama: string; satuan_asumsi: boolean; hari_ini: number; riwayat: (number | null)[]; hari: Hari[] };
type Meta = { terbit: string; batas: number; horizon: number; bobot_model: number; model: string; rentang: string; musim_kini: boolean };
type Prak = Meta & { stasiun: StPrak[]; dikecualikan: { code: string; alasan: string }[] };
type PH = {
  h: number; n: number; mae_model: number; mae_lgb: number; mae_persis: number; rmse_model: number; rmse_persis: number;
  cakupan80: number; cakupan80_musim: number | null; presisi55: number; recall55: number; presisi55_persis: number; recall55_persis: number;
  kejadian55: number; mae_klim?: number; mae_linear?: number; skill: number; skill_lgb: number; skill_musim: number | null; skill_luar: number | null;
};
type Bln = { bulan: string; h: number; mae_model: number; mae_persis: number; skill: number | null; n: number; rata_aktual: number };
type Verif = Meta & {
  uji: { periode: string; cara: string; per_horizon: PH[]; per_bulan: Bln[] };
  validasi: { periode: string; per_horizon: PH[] };
  setelan: { percobaan: number; terbaik: Record<string, number | string>; jejak: { trial: number; mae: number }[] };
  fitur: string[];
  musim_rata: Record<string, number>; luar_musim_rata: Record<string, number>;
  per_stasiun: { code: string; n: number; mae_model: number; mae_persis: number; skill: number | null }[];
  riwayat: Record<string, { mulai: string; aktual: (number | null)[]; h1: (number | null)[]; h3: (number | null)[] }>;
};

const TEAL = "#2ec4b6", TEAL_INK = "#0b5563", GREY = "#b9c9ce";
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pendek = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`; };
const hariKe = (iso: string) => HARI[new Date(iso + "T00:00:00Z").getUTCDay()];
/** Persen bertanda untuk skill: "+6%", "−3%", atau "Setara" bila di bawah 1 poin. */
const skillTxt = (s: number | null | undefined) => (s == null ? "–" : Math.abs(s) < 0.01 ? "Setara" : `${s > 0 ? "+" : "−"}${fmt(Math.abs(s) * 100, 0)}%`);
const PIECES = [
  { min: 0, max: 10, color: "#e9eff1", label: "< 10%" },
  { min: 10, max: 50, color: RAMP[1], label: "10–50%" },
  { min: 50, max: 90, color: RAMP[3], label: "50–90%" },
  { min: 90, max: 100.1, color: RAMP[5], label: "≥ 90%" },
];
const gelap = (p: number) => p >= 50;

export default function Q7Prakiraan() {
  const d = useData<[Prak, Verif]>("prakiraan_pm25", "prakiraan_verifikasi");
  const { byCode } = useApp();
  const [pilih, setPilih] = useState<string | null>(null);

  if (!d) return <div className="loading">Memuat prakiraan…</div>;
  const [pk, vf] = d;
  const nama = (c: string) => byCode[c]?.nama ?? pk.stasiun.find((s) => s.code === c)?.nama ?? c;
  const st = pk.stasiun;
  const kode = pilih && st.some((s) => s.code === pilih) ? pilih : st[0]?.code;
  const sel = st.find((s) => s.code === kode)!;
  const U = vf.uji.per_horizon, Vd = vf.validasi.per_horizon;
  const h1 = U[0], h7 = U[U.length - 1];
  const besok = st.filter((s) => s.hari[0].p55 >= 0.5).length;
  const minggu = st.filter((s) => s.hari.some((x) => x.p55 >= 0.5)).length;
  const cak = U.reduce((a, r) => a + r.cakupan80, 0) / U.length;
  const terbit = fmtDate(pk.terbit);
  const tgl = st[0]?.hari.map((x) => x.tgl) ?? [];

  return (
    <Page path="/prakiraan" noStage
      headline={minggu > 0 ? `${minggu} Stasiun Diprakirakan Melewati 55 dalam 7 Hari` : "Tidak Ada Stasiun yang Diprakirakan Melewati 55"}
      method={<div className="pk-method">
        <span>Prakiraan = rata-rata dua tebakan: nilai hari ini, dan model LightGBM yang menebak perubahan dari hari ini berdasarkan bentuk pergerakan 30 hari terakhir. Satu model per horizon (H+1 sampai H+7).</span>
        <span>Diuji jujur: setiap bulan model dilatih ulang hanya dengan data sebelum bulan itu, lalu meramal bulan itu. Penyetelan ({vf.setelan.percobaan} percobaan Optuna) dan kalibrasi rentang memakai 2025; angka akurasi di halaman ini dari 2026.</span>
        <span>Rentang 80% berasal dari sebaran galat 2025, dipisah musim asap (Jul–Okt) dan di luar musim. Ini alat bantu, bukan peringatan resmi BMKG atau ISPU.</span>
      </div>}
      kpis={<>
        <Kpi k="Berpeluang Melewati 55 Besok" v={`${besok}`} viz={<DotsViz n={besok} total={st.length} tone="alert" />}
          note={`dari ${st.length} stasiun · terbit ${terbit}`} />
        <Kpi k="Dibanding Menyalin Nilai Hari Ini" v={skillTxt(h1.skill)}
          viz={<BarsViz values={[h1.mae_persis, h1.mae_model]} labels={["Salin", "Model"]} tone="focus" />}
          note={`galat prakiraan besok ${fmt(h1.mae_model, 2)} vs ${fmt(h1.mae_persis, 2)} ${UG} · uji 2026`} />
        <Kpi k="Rentang 80% Teruji" v={`${fmt(cak * 100, 0)}%`} viz={<DotsViz n={Math.round(cak * 10)} total={10} tone="focus" cols={10} />}
          note="hari uji 2026 yang nilai aktualnya jatuh di dalam rentang" />
      </>}
      main={<>
        <Card title="Tujuh Hari ke Depan" sub={`Warna = peluang PM2.5 harian melewati 55 ${UG} · angka = prakiraan · klik baris untuk melihat detail`}
          note={pk.dikecualikan.length ? <>Tidak diramal: {pk.dikecualikan.map((x, i) => <span key={x.code}>{i ? "; " : ""}{nama(x.code)} ({x.alasan})</span>)}.
            {st.some((s) => s.satuan_asumsi) && " Tanda * = satuan data diasumsikan (lihat Jaringan)."}</> : undefined}>
          <Peta st={st} tgl={tgl} nama={nama} kode={kode} onPilih={setPilih} />
        </Card>
        <Card title={`${nama(sel.code)}: 30 Hari Terakhir dan 7 Hari ke Depan`}
          sub={`Garis putus = prakiraan · pita = rentang 80% · terbit ${terbit}`}
          right={<select className="pick-select" value={kode} onChange={(e) => setPilih(e.target.value)} aria-label="Pilih stasiun">
            {st.map((s) => <option key={s.code} value={s.code}>{nama(s.code)}</option>)}</select>}>
          <Detail s={sel} terbit={pk.terbit} batas={pk.batas} />
          <ol className="pk-days">
            {sel.hari.map((x) => (
              <li key={x.tgl} className={x.p55 >= 0.5 ? "on" : ""}>
                <small>{hariKe(x.tgl)} {pendek(x.tgl)}</small>
                <b>{fmt(x.nilai, 0)}</b>
                <span>{fmt(x.lo, 0)}–{fmt(x.hi, 0)}</span>
                <em>{fmt(x.p55 * 100, 0)}% &gt; 55</em>
              </li>
            ))}
          </ol>
        </Card>
      </>}
      stories={<>
        <Story tone="focus" title="Lebih Baik dari Menyalin Nilai Hari Ini?"
          big={skillTxt(h1.skill)} bigNote={`galat prakiraan besok dibanding "besok sama dengan hari ini", uji Jan–Okt 2026`}
          chart={<Chart option={skillOpt(U, Vd)} height={300} ariaLabel="Keunggulan model per horizon, validasi 2025 dan uji 2026" />}>
          <p>Di 2025 model unggul {skillTxt(Vd[0].skill)} untuk besok. Di 2026 keunggulannya {h1.skill >= 0.01 ? `tinggal ${skillTxt(h1.skill)}` : "hilang"}, dan pada H+{h7.h} menjadi {skillTxt(h7.skill).toLowerCase()}. Makin jauh harinya, makin lebar rentangnya.</p>
        </Story>
        <Story tone="gambut" flip title="Musim Asap 2026 Menguji Semua Model"
          big={`${fmt(vf.musim_rata["2026"], 0)}`} bigNote={`${UG} rata-rata Jul–Okt 2026, dibanding ${fmt(vf.musim_rata["2025"], 0)} di 2025 dan ${fmt(vf.musim_rata["2024"], 0)} di 2024`}
          chart={<Chart option={bulanOpt(vf.uji.per_bulan)} height={300} ariaLabel="Keunggulan prakiraan besok per bulan 2026" />}>
          <p>Di luar musim asap model unggul {skillTxt(h1.skill_luar)}. Saat musim asap keunggulannya menyusut ke {skillTxt(h1.skill_musim)} untuk besok dan {(h7.skill_musim ?? 0) < 0.01 ? "habis" : `tinggal ${skillTxt(h7.skill_musim)}`} di H+{h7.h}, karena puncaknya bertahan berminggu-minggu. Karena itu model dicampur setengah-setengah dengan nilai hari ini supaya tidak meleset jauh.</p>
        </Story>
      </>}
      more={[
        <div key="t" data-title="Uji per Horizon"><TabelUji U={U} /></div>,
        <div key="r" data-title="Prakiraan vs Aktual 2026"><Riwayat vf={vf} code={kode} nama={nama} /></div>,
        <div key="s" data-title="Per Stasiun"><PerStasiun vf={vf} nama={nama} /></div>,
        <div key="c" data-title="Cara Kerja"><CaraKerja vf={vf} /></div>,
      ]}
    />
  );
}

/* ---------- peta panas stasiun × hari ---------- */
function Peta({ st, tgl, nama, kode, onPilih }: { st: StPrak[]; tgl: string[]; nama: (c: string) => string; kode: string; onPilih: (c: string) => void }) {
  const sempit = typeof window !== "undefined" && window.innerWidth < 600;
  const opt = useMemo<EChartsOption>(() => {
    const data = st.flatMap((s, yi) => s.hari.map((x, xi) => {
      const p = x.p55 * 100;
      return { value: [xi, yi, p, x.nilai, x.lo, x.hi], label: { color: gelap(p) ? "#fff" : C.ink, fontWeight: s.code === kode ? 800 : 600 } };
    }));
    return {
      tooltip: { formatter: (q: any) => { const [xi, yi, p, v, lo, hi] = q.value; const s = st[yi];
        return `<b>${nama(s.code)}</b> · ${hariKe(tgl[xi])} ${pendek(tgl[xi])} (H+${xi + 1})<br/>Prakiraan ${fmt(v, 0)} ${UG}<br/>Rentang 80%: ${fmt(lo, 0)}–${fmt(hi, 0)}<br/>Peluang &gt; 55: <b>${fmt(p, 0)}%</b>`; } },
      grid: { left: 8, right: 8, top: 34, bottom: 44, containLabel: true },
      xAxis: { type: "category", position: "top", data: tgl.map((t, i) => `${hariKe(t)} ${pendek(t)}\nH+${i + 1}`), axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { fontSize: 11, fontWeight: 600, color: C.ink, lineHeight: 14 }, splitArea: { show: false } },
      yAxis: { type: "category", inverse: true, data: st.map((s) => `${nama(s.code)}${s.satuan_asumsi ? "*" : ""}`), axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { fontSize: sempit ? 10.5 : 12, color: C.ink, formatter: (v: string, i: number) => (st[i]?.code === kode ? `{b|${v}}` : v), rich: { b: { fontWeight: 800, color: TEAL_INK, fontSize: 12 } } } },
      visualMap: { type: "piecewise", dimension: 2, pieces: PIECES, orient: "horizontal", left: "center", bottom: 0, itemWidth: 14, itemHeight: 12, itemGap: 14,
        textStyle: { fontSize: 11.5, color: C.ink }, text: ["", "Peluang > 55:"], showLabel: true } as any,
      series: [{ type: "heatmap", data, label: { show: true, fontSize: sempit ? 9.5 : 11.5,
          formatter: (q: any) => (sempit && q.value[3] >= 1000 ? `${fmt(q.value[3] / 1000, 1)}rb` : fmt(q.value[3], 0)) },
        itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 4 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1.5 } } } as any],
    };
  }, [st, tgl, nama, kode, sempit]);
  return <Chart option={opt} height={Math.max(260, st.length * 27 + 96)} ariaLabel="Prakiraan PM2.5 tujuh hari per stasiun"
    onClick={(p) => { const v = (p.value as number[] | undefined); if (v) onPilih(st[v[1]].code); }} />;
}

/* ---------- detail satu stasiun: 30 hari data + 7 hari prakiraan ---------- */
function Detail({ s, terbit, batas }: { s: StPrak; terbit: string; batas: number }) {
  const opt = useMemo<EChartsOption>(() => {
    const n = s.riwayat.length;
    const lalu = Array.from({ length: n }, (_, i) => addDays(terbit, i - n + 1));
    const x = [...lalu, ...s.hari.map((h) => h.tgl)];
    const pad = (k: number) => Array<null>(k).fill(null);
    const ukur = [...s.riwayat, ...pad(7)];
    const prak = [...pad(n - 1), s.hari_ini, ...s.hari.map((h) => h.nilai)];
    const lo = [...pad(n - 1), s.hari_ini, ...s.hari.map((h) => h.lo)];
    const lebar = [...pad(n - 1), 0, ...s.hari.map((h) => +(h.hi - h.lo).toFixed(1))];
    return {
      tooltip: { trigger: "axis", formatter: (ps: any) => {
        const i = ps[0].dataIndex, t = x[i], f = i >= n ? s.hari[i - n] : null;
        return `<b>${hariKe(t)} ${fmtDate(t)}</b><br/>` + (f
          ? `Prakiraan H+${f.h}: <b>${fmt(f.nilai, 0)}</b> ${UG}<br/>Rentang 80%: ${fmt(f.lo, 0)}–${fmt(f.hi, 0)}<br/>Peluang &gt; 55: ${fmt(f.p55 * 100, 0)}%`
          : `Terukur: <b>${ukur[i] == null ? "tidak ada data" : `${fmt(ukur[i]!, 1)} ${UG}`}</b>`);
      } },
      legend: { bottom: 0, data: ["Terukur", "Prakiraan", "Rentang 80%"], textStyle: { fontSize: 11.5 } },
      grid: { left: 8, right: 18, top: 24, bottom: 40, containLabel: true },
      xAxis: { type: "category", data: x, boundaryGap: false, axisLabel: { formatter: (v: string) => pendek(v), fontSize: 11, interval: 6 } },
      yAxis: { type: "value", name: UG, scale: false, min: 0 },
      series: [
        { name: "lo", type: "line", data: lo, stack: "pita", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
        { name: "Rentang 80%", type: "line", data: lebar, stack: "pita", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: TEAL, opacity: 0.2 }, itemStyle: { color: TEAL }, silent: true },
        { name: "Terukur", type: "line", data: ukur, symbol: "circle", symbolSize: 4, connectNulls: false, lineStyle: { width: 2, color: C.ink }, itemStyle: { color: C.ink },
          markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: RAMP[4], width: 1.5 },
            label: { formatter: `Batas ${batas}`, position: "insideEndTop", color: RAMP[5], fontWeight: 700, fontSize: 11 }, data: [{ yAxis: batas }] },
          markArea: { silent: true, itemStyle: { color: "rgba(46,196,182,0.06)" }, data: [[{ xAxis: terbit }, { xAxis: x[x.length - 1] }]] } },
        { name: "Prakiraan", type: "line", data: prak, symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5, type: "dashed", color: TEAL_INK }, itemStyle: { color: TEAL_INK } },
      ] as any,
    };
  }, [s, terbit, batas]);
  return <Chart option={opt} height={300} ariaLabel="PM2.5 terukur dan prakiraan untuk stasiun terpilih" />;
}

/* ---------- cerita 1: keunggulan per horizon ---------- */
function skillOpt(U: PH[], V: PH[]): EChartsOption {
  const pct = (r: PH) => +(r.skill * 100).toFixed(1);
  return {
    tooltip: { trigger: "axis", valueFormatter: (v: any) => `${fmt(v, 1)}%` },
    legend: { bottom: 0, data: ["Validasi 2025", "Uji 2026"], textStyle: { fontSize: 11.5 } },
    grid: { left: 8, right: 12, top: 30, bottom: 40, containLabel: true },
    xAxis: { type: "category", data: U.map((r) => `H+${r.h}`), axisLabel: { fontWeight: 650, color: C.ink } },
    yAxis: { type: "value", name: "% lebih akurat", axisLabel: { formatter: (v: number) => `${v}%` } },
    series: [
      { name: "Validasi 2025", type: "bar", data: V.map(pct), itemStyle: { color: GREY, borderRadius: [4, 4, 0, 0] }, barGap: "12%" },
      { name: "Uji 2026", type: "bar", data: U.map((r) => ({ value: pct(r), itemStyle: { color: r.skill >= 0 ? TEAL : C.gambut, borderRadius: r.skill >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })),
        itemStyle: { color: TEAL }, label: { show: true, position: "top", formatter: (q: any) => `${q.value > 0 ? "+" : ""}${fmt(q.value, 0)}%`, fontSize: 11, fontWeight: 700, color: C.ink },
        markLine: { silent: true, symbol: "none", lineStyle: { color: C.ink, width: 1 }, label: { show: false }, data: [{ yAxis: 0 }] } },
    ] as any,
  };
}

/* ---------- cerita 2: keunggulan per bulan 2026 ---------- */
function bulanOpt(B: Bln[]): EChartsOption {
  const b1 = B.filter((r) => r.h === 1);
  return {
    tooltip: { trigger: "axis", formatter: (ps: any) => { const r = b1[ps[0].dataIndex];
      return `<b>${BULAN[+r.bulan.slice(5) - 1]} ${r.bulan.slice(0, 4)}</b><br/>Keunggulan prakiraan besok: <b>${skillTxt(r.skill)}</b><br/>Galat ${fmt(r.mae_model, 2)} vs ${fmt(r.mae_persis, 2)} ${UG}<br/>Rata-rata PM2.5: ${fmt(r.rata_aktual, 0)} ${UG}`; } },
    grid: { left: 8, right: 12, top: 30, bottom: 24, containLabel: true },
    xAxis: { type: "category", data: b1.map((r) => BULAN[+r.bulan.slice(5) - 1]), axisLabel: { fontWeight: 650, color: C.ink } },
    yAxis: { type: "value", name: "% lebih akurat (H+1)", axisLabel: { formatter: (v: number) => `${v}%` } },
    series: [{
      type: "bar", barWidth: "58%",
      data: b1.map((r) => { const v = +((r.skill ?? 0) * 100).toFixed(1); return { value: v, itemStyle: { color: v >= 0 ? TEAL : C.gambut, borderRadius: v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } }; }),
      label: { show: true, position: "top", formatter: (q: any) => `${q.value > 0 ? "+" : ""}${fmt(q.value, 0)}`, fontSize: 10.5, color: C.ink },
      markArea: { silent: true, itemStyle: { color: "rgba(212,98,42,0.08)" }, label: { show: true, position: "insideTop", formatter: "Musim Asap", color: C.gambut, fontWeight: 700, fontSize: 11.5 },
        data: [[{ xAxis: "Jul" }, { xAxis: "Okt" }]] },
      markLine: { silent: true, symbol: "none", lineStyle: { color: C.ink, width: 1 }, label: { show: false }, data: [{ yAxis: 0 }] },
    } as any],
  };
}

/* ---------- telusuri ---------- */
function TabelUji({ U }: { U: PH[] }) {
  const p = (v: number | null | undefined) => (v == null ? "–" : `${fmt(v * 100, 0)}%`);
  return (
    <div className="pk-tab-wrap">
      <table className="pk-tab">
        <thead><tr>
          <th>Horizon</th><th>Galat Model</th><th>Galat Hari Ini</th><th>Keunggulan</th><th>Musim Asap</th><th>Di Luar Musim</th>
          <th>Rentang 80% Kena</th><th>Kejadian &gt; 55 Tertangkap</th><th>Peringatan Benar</th>
        </tr></thead>
        <tbody>{U.map((r) => (
          <tr key={r.h}>
            <td><b>H+{r.h}</b></td><td>{fmt(r.mae_model, 2)}</td><td>{fmt(r.mae_persis, 2)}</td>
            <td className={r.skill >= 0 ? "pos" : "neg"}>{skillTxt(r.skill)}</td>
            <td className={(r.skill_musim ?? 0) >= 0 ? "pos" : "neg"}>{skillTxt(r.skill_musim)}</td>
            <td className={(r.skill_luar ?? 0) >= 0 ? "pos" : "neg"}>{skillTxt(r.skill_luar)}</td>
            <td>{p(r.cakupan80)}</td>
            <td>{p(r.recall55)} <small>(hari ini {p(r.recall55_persis)})</small></td>
            <td>{p(r.presisi55)} <small>(hari ini {p(r.presisi55_persis)})</small></td>
          </tr>))}</tbody>
      </table>
      <p className="note">Galat = rata-rata selisih mutlak ({UG}). "Hari ini" = tebakan besok sama dengan hari ini. Klimatologi (rata-rata hari yang sama di tahun lalu) meleset {fmt(U[0].mae_klim, 1)} {UG} untuk besok, jauh lebih buruk. Uji Jan–14 Okt 2026, {fmt(U[0].n, 0)} prakiraan per horizon.</p>
    </div>
  );
}

function Riwayat({ vf, code, nama }: { vf: Verif; code: string; nama: (c: string) => string }) {
  const r = vf.riwayat[code];
  if (!r) return <p className="note">Belum ada riwayat uji untuk stasiun ini.</p>;
  const x = r.aktual.map((_, i) => addDays(r.mulai, i));
  const opt: EChartsOption = {
    tooltip: { trigger: "axis", valueFormatter: (v: any) => (v == null ? "–" : `${fmt(v, 1)} ${UG}`) },
    legend: { bottom: 0, textStyle: { fontSize: 11.5 } },
    grid: { left: 8, right: 16, top: 24, bottom: 64, containLabel: true },
    xAxis: { type: "category", data: x, axisLabel: { formatter: (v: string) => pendek(v), fontSize: 11 } },
    yAxis: { type: "value", name: UG },
    dataZoom: [{ type: "slider", bottom: 26, height: 16, startValue: Math.max(0, x.length - 120) }, { type: "inside" }],
    series: [
      { name: "Terukur", type: "line", data: r.aktual, symbol: "none", lineStyle: { width: 2, color: C.ink }, itemStyle: { color: C.ink } },
      { name: "Prakiraan H+1", type: "line", data: r.h1, symbol: "none", lineStyle: { width: 1.8, color: TEAL }, itemStyle: { color: TEAL } },
      { name: "Prakiraan H+3", type: "line", data: r.h3, symbol: "none", lineStyle: { width: 1.6, color: RAMP[3], type: "dashed" }, itemStyle: { color: RAMP[3] } },
    ],
  };
  return <>
    <p className="note">{nama(code)}: setiap titik prakiraan dibuat sebelum hari itu, dengan model yang dilatih ulang tiap awal bulan. Pilih stasiun lain di kartu detail di atas.</p>
    <Chart option={opt} height={320} ariaLabel="Prakiraan dan aktual 2026 untuk stasiun terpilih" />
  </>;
}

function PerStasiun({ vf, nama }: { vf: Verif; nama: (c: string) => string }) {
  const rows = [...vf.per_stasiun].sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0));
  const opt: EChartsOption = {
    tooltip: { trigger: "axis", formatter: (ps: any) => { const r = rows[ps[0].dataIndex];
      return `<b>${nama(r.code)}</b><br/>Keunggulan H+1: ${skillTxt(r.skill)}<br/>Galat ${fmt(r.mae_model, 2)} vs ${fmt(r.mae_persis, 2)} ${UG}`; } },
    grid: { left: 8, right: 30, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", axisLabel: { formatter: (v: number) => `${v}%` } },
    yAxis: { type: "category", inverse: true, data: rows.map((r) => nama(r.code)), axisLabel: { fontSize: 11.5, color: C.ink } },
    series: [{ type: "bar", barWidth: "62%",
      data: rows.map((r) => { const v = +((r.skill ?? 0) * 100).toFixed(1); return { value: v, itemStyle: { color: v >= 0 ? TEAL : C.gambut, borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } }; }),
      label: { show: true, position: "right", formatter: (q: any) => `${q.value > 0 ? "+" : ""}${fmt(q.value, 0)}%`, fontSize: 10.5, color: C.ink } } as any],
  };
  return <>
    <p className="note">Keunggulan prakiraan besok dibanding nilai hari ini, per stasiun, uji 2026.</p>
    <Chart option={opt} height={Math.max(260, rows.length * 22 + 30)} ariaLabel="Keunggulan prakiraan per stasiun" />
  </>;
}

function CaraKerja({ vf }: { vf: Verif }) {
  const b = vf.setelan.terbaik;
  const j = vf.setelan.jejak;
  return (
    <div className="pk-cara">
      <div><b>Data</b><span>PM2.5 harian dari panel yang sama dengan seluruh dashboard (aturan pembersihan notebook), 1 Jan 2024 – {fmtDate(vf.terbit)}. Hari tanpa data tidak diisi; stasiun dengan kurang dari 365 hari sah tidak diramal.</span></div>
      <div><b>Yang Ditebak</b><span>Perubahan dari hari ini (skala log), bukan nilainya. Model pohon tidak bisa menebak di atas nilai tertinggi yang pernah dilihat, padahal puncak 2026 lebih tinggi dari 2024–2025.</span></div>
      <div><b>Petunjuk yang Dipakai</b><span>{vf.fitur.length} ukuran bentuk pergerakan: selisih hari ini dengan 1–7, 14, dan 30 hari lalu, dengan rata-rata 3, 7, dan 30 hari, serta naik-turun 7 hari. Tanggal, kode stasiun, dan cuaca sengaja tidak dipakai: dengan hanya dua musim asap, model menghafal pola 2024–2025 yang tidak berulang di 2026.</span></div>
      <div><b>Penyetelan</b><span>{vf.setelan.percobaan} percobaan Optuna di 2025. Galat validasi {fmt(j[0].mae, 3)} → {fmt(Math.min(...j.map((x) => x.mae)), 3)}. Terpilih: {String(b.objective)}, {b.n_estimators} pohon, laju {fmt(Number(b.learning_rate), 3)}, {b.num_leaves} daun.</span></div>
      <div><b>Hasil Akhir</b><span>Rata-rata model dan nilai hari ini (bobot {fmt(vf.bobot_model, 1)}). Gabungan sederhana ini lebih tahan terhadap tahun yang berbeda dari biasanya.</span></div>
      <div><b>Batasan</b><span>Tanpa data titik api dan prakiraan cuaca, model tidak bisa melihat kebakaran baru sebelum asapnya terukur. Akurasi di atas 7 hari tidak diuji.</span></div>
    </div>
  );
}
