import { useDeferredValue, useEffect, useMemo, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import Chart from "./Chart";
import { Card, Kpi, Story } from "./Layout";
import { BarsViz, DotsViz, Flow, InfoTip, Reveal, WeeksViz } from "./Viz";
import { fmt, UG } from "../lib/format";
import { C, UI } from "../lib/theme";
import type { Skenario } from "../lib/sim";
import type { HospitalDaily, ModelDampak, Station } from "../lib/types";
import {
  hitungPrioritas, isHinge, jalan, kandidatDari, pasanganPenjelas, pilih, sama,
  type Dasar, type HasilPrioritas, type RRFile,
} from "../lib/prioritas";

export type Periode = { key: string; label: string; pendek: string; from: string; to: string };
type Props = {
  h: HospitalDaily; m: ModelDampak; rr: RRFile; byCode: Record<string, Station>;
  sk: Skenario; per: Periode; periodeTahunan: Periode[];
};

/** Warna peran (emphasis): pilihan model = toska, sisanya abu; pendatang baru = oranye gambut. */
const TEAL = "#2ec4b6", TEAL_INK = "#0b5563", GREY = "#b9c9ce", GREY_D = "#8a9aa0";
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const n0 = (v: number) => fmt(v, 0);
const pct = (v: number) => `${fmt(100 * v, 0)}%`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const judul = (s: string) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

let geoState: "unknown" | "ok" | "none" = "unknown";
const loadGeo = () => fetch("/data/indonesia.geojson").then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((g) => { echarts.registerMap("indonesia", g); geoState = "ok"; }).catch(() => { geoState = "none"; });

export default function Prioritas({ h, m, rr, byCode, sk, per, periodeTahunan }: Props) {
  const [outcome, setOutcome] = useState("resp_admissions_under5");
  const [K, setK] = useState(5);
  const kandidat = useMemo(() => kandidatDari(h, (c) => byCode[c]?.grade), [h, byCode]);
  const keluar = h.model.filter((hid) => !kandidat.includes(hid));
  const nama = (hid: string) => byCode[h.rs[hid].code]?.nama ?? hid;

  // Ditunda: slider simulator tetap halus, bagian ini menyusul begitu geseran berhenti.
  const skKey = useDeferredValue(sk.jenis === "batas" ? `b${sk.nilai}` : `k${sk.persen}`);
  const s: Skenario = useMemo(() => (skKey[0] === "b" ? { jenis: "batas", nilai: +skKey.slice(1) } : { jenis: "kurangi", persen: +skKey.slice(1) }), [skKey]);
  const batas = s.jenis === "batas";
  const r = useMemo(() => hitungPrioritas(h, m, rr, kandidat, s, per.from, per.to, outcome, K), [h, m, rr, kandidat, s, per, outcome, K]);
  const tahunan = useMemo(() => periodeTahunan.map((p) => ({ p, ds: jalan(h, m, kandidat, s, p.from, p.to, outcome) })), [h, m, kandidat, s, periodeTahunan, outcome]);

  const label = /^[A-Z]{2,}/.test(h.label[outcome]) ? h.label[outcome] : lower(h.label[outcome]);
  const kebijakan = batas ? `Batas harian ${s.nilai} ${UG}` : `PM2.5 turun ${s.persen}%`;
  const model = r.cara[0];
  const porsi = r.total ? model.kasus / r.total : 0;
  const kuat = r.terkuat;
  const lebih = kuat && kuat.kasus > 0 ? model.kasus / kuat.kasus - 1 : 0;
  const bulanTeks = r.bulan.length >= 10 ? "Sepanjang Tahun" : r.bulan.length ? `${BLN[+r.bulan[0] - 1]}–${BLN[+r.bulan[r.bulan.length - 1] - 1]}` : "–";
  const wk = (mm: number, end: boolean) => Math.round(((mm - (end ? 0 : 1)) * 52) / 12) + (end ? 0 : 1);

  return (
    <section className="alok" aria-labelledby="alok-h">
      <div className="sec-head">
        <div>
          <h2 id="alok-h">Wilayah Mana yang Didahulukan?</h2>
          <p>{kandidat.length} wilayah · {kebijakan} · {per.label}
            <InfoTip title="Cara Menghitung">
              <span>Rumus sama dengan simulator: kasus skenario = kasus aktual × (PM skenario ÷ PM aktual)^(b ÷ ln 2), per hari, per wilayah (stasiun + RS pasangannya). Model memilih wilayah dengan kasus tercegah terbanyak; pembanding memilih yang PM2.5-nya paling tinggi atau paling jauh di atas batas. Beban = µg/m³ × hari yang diturunkan, bukan biaya.</span>
              <span>Tanda "belum pasti" = wilayah itu masuk daftar di kurang dari 90% dari 1.000 undian koefisien RS. Tanpa tanda berarti hampir selalu masuk.</span>
              <span>{daftar(keluar.map(nama))} tidak dinilai karena data sensornya terlalu banyak bolong. Data sintetis: efek PM2.5 di sini lebih besar dari studi nyata (sekitar 2,5–4,8% per 10 µg/m³ pada anak), jadi angka dibaca sebagai perbandingan antarwilayah.</span>
            </InfoTip>
          </p>
        </div>
        <div className="alok-ctrl">
          <select className="pick-select" value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Pilih penyakit">
            {h.outcome.map((o) => <option key={o} value={o}>{h.label[o]}</option>)}
          </select>
          <span className="alok-k" role="group" aria-label="Jumlah wilayah yang didahulukan">
            <button type="button" onClick={() => setK((k) => Math.max(1, k - 1))} disabled={K <= 1} aria-label="Kurangi wilayah">−</button>
            <b aria-live="polite">{K} wilayah</b>
            <button type="button" onClick={() => setK((k) => Math.min(10, k + 1))} disabled={K >= 10} aria-label="Tambah wilayah">+</button>
          </span>
        </div>
      </div>

      {r.kEfektif === 0 ? (
        <Card title="Tidak Ada yang Perlu Didahulukan"><p className="note">Tidak ada wilayah yang melewati {lower(kebijakan)} pada {lower(per.label)}.</p></Card>
      ) : <>
        <Flow label="Temuan prioritas">
          <Kpi k={`Kasus ${judul(h.label[outcome])} Tercegah di ${r.kEfektif} Wilayah`} v={n0(model.kasus)}
            viz={<DotsViz n={r.kEfektif} total={Math.min(24, r.terdampak)} tone="focus" />}
            note={`${pct(porsi)} dari seluruh manfaat · ${r.kEfektif} dari ${r.terdampak} wilayah terdampak`} />
          <Kpi k="Dibanding Memilih yang Paling Berasap" v={kuat && !sama(model.pilih, kuat.pilih) ? `${lebih >= 0 ? "+" : "−"}${fmt(Math.abs(100 * lebih), 0)}%` : "Sama"}
            viz={<BarsViz values={[...r.cara.slice(1).map((c) => c.kasus).reverse(), model.kasus]} labels={[...r.cara.slice(1).map((c) => (c.id === "kotor" ? "Terkotor" : batas ? "Terjauh" : "Terberat")).reverse(), "Model"]} tone="focus" />}
            note={kuat && sama(model.pilih, kuat.pilih) ? "daftarnya persis sama: di sini cara mana pun memberi hasil serupa" : kuat ? `${n0(model.kasus)} vs ${n0(kuat.kasus)} kasus · beban polusi ${model.beban <= kuat.beban ? `${pct(1 - model.beban / kuat.beban)} lebih kecil` : `${pct(model.beban / kuat.beban - 1)} lebih besar`}` : undefined} />
          <Kpi k="Waktu Bertindak" v={bulanTeks}
            viz={r.bulan.length ? <WeeksViz from={wk(+r.bulan[0], false)} to={wk(+r.bulan[r.bulan.length - 1], true)} label={bulanTeks} /> : undefined}
            note={batas ? "bulan yang menyumbang manfaat terbesar" : "penurunan persen berlaku tiap hari"} />
        </Flow>

        <Card title={`${r.kEfektif} Wilayah, ${pct(porsi)} Manfaat`} sub={`Lingkaran = kasus ${label} tercegah · ${per.label}`}>
          <div className="alok-peta">
            <Peta r={r} outcome={outcome} byCode={byCode} keluar={keluar.map((id) => h.rs[id].code)} />
            <Urutan r={r} outcome={outcome} nama={nama} porsi={porsi} />
          </div>
        </Card>

        <div className="stories">
          <Efisiensi r={r} m={m} outcome={outcome} label={label} nama={nama} hinge={isHinge(m, outcome)} />
          <Awet tahunan={tahunan} outcome={outcome} K={K} nama={nama} batas={batas} label={label} />
        </div>

        <Detail r={r} m={m} outcome={outcome} label={label} nama={nama} batas={batas} hinge={isHinge(m, outcome)} />
      </>}
    </section>
  );
}

const daftar = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} dan ${xs[xs.length - 1]}`);

/* ---------- Peta prioritas ---------- */
function Peta({ r, outcome, byCode, keluar }: { r: HasilPrioritas; outcome: string; byCode: Record<string, Station>; keluar: string[] }) {
  const [geo, setGeo] = useState(geoState);
  useEffect(() => { if (geoState === "unknown") loadGeo().then(() => setGeo(geoState)); }, []);
  const opt = useMemo<EChartsOption>(() => {
    const urut = r.cara[0].pilih;
    const max = Math.max(1, ...r.wilayah.map((w) => w.av[outcome]));
    const useGeo = geo === "ok";
    const coord = useGeo ? { coordinateSystem: "geo" as const } : { xAxisIndex: 0, yAxisIndex: 0 };
    const pts = r.wilayah.map((w) => {
      const s = byCode[w.code], v = Math.max(0, w.av[outcome]), k = urut.indexOf(w.hid);
      return {
        name: s.nama, value: [s.lon, s.lat, v], w, k,
        symbolSize: v <= 0.5 ? 6 : Math.max(k >= 0 ? 20 : 8, 10 + 38 * Math.sqrt(v / max)),
        itemStyle: { color: k >= 0 ? TEAL : v > 0.5 ? GREY : "#dfe7ea", borderColor: k >= 0 ? TEAL_INK : "#fff", borderWidth: k >= 0 ? 2 : 1, opacity: 0.92 },
        label: k >= 0 ? { show: true, formatter: `${k + 1}`, position: "inside" as const, color: "#fff", fontWeight: 800, fontSize: 12, textBorderColor: TEAL_INK, textBorderWidth: 2 } : undefined,
        z: k >= 0 ? 10 : 2,
      };
    });
    const out = keluar.map((c) => ({ name: byCode[c].nama, value: [byCode[c].lon, byCode[c].lat, null], keluar: true, symbolSize: 9,
      itemStyle: { color: "#fff", borderColor: GREY_D, borderWidth: 1.5, borderType: "dashed" as const } }));
    return {
      tooltip: { trigger: "item", formatter: (p: any) => p.data.keluar
        ? `<b>${p.name}</b><br/>Tidak dinilai: data sensor terlalu banyak bolong`
        : `<b>${p.name}</b>${p.data.k >= 0 ? ` · prioritas ${p.data.k + 1}` : ""}<br/>${n0(p.value[2])} kasus tercegah<br/>${n0(p.data.w.beban)} µg·hari diturunkan` },
      ...(useGeo
        ? { geo: { map: "indonesia", roam: false, center: [113.2, -1.6], zoom: 1.32, itemStyle: { areaColor: UI.mapLand, borderColor: "#fff", borderWidth: 0.7 }, emphasis: { disabled: true }, silent: true } }
        : { grid: { left: 8, right: 8, top: 8, bottom: 8 }, xAxis: { type: "value", min: 94, max: 142, show: false }, yAxis: { type: "value", min: -11.5, max: 6.5, show: false } }),
      series: [{ type: "scatter", ...coord, data: [...pts, ...out], animationDurationUpdate: 500 } as any],
    };
  }, [geo, r, outcome, byCode, keluar]);
  return <div className="alok-map"><Chart option={opt} height={400} ariaLabel="Peta wilayah prioritas" /></div>;
}

/* ---------- Urutan (batang menurun, emphasis) ---------- */
function Urutan({ r, outcome, nama, porsi }: { r: HasilPrioritas; outcome: string; nama: (id: string) => string; porsi: number }) {
  const ws = r.wilayah.filter((w) => w.beban > 1e-9);
  const max = Math.max(1, ...ws.map((w) => w.av[outcome]));
  const pick = new Set(r.cara[0].pilih);
  return (
    <Reveal as="ol" className="alok-rank">
      {ws.map((w, i) => {
        const v = Math.max(0, w.av[outcome]);
        const ragu = pick.has(w.hid) && w.peluang != null && w.peluang < 0.9;
        return (
          <li key={w.hid} className={pick.has(w.hid) ? "pick" : ""} style={{ "--k": i } as React.CSSProperties}>
            <span className="n">{i + 1}</span>
            <span className="nm">{nama(w.hid)}{ragu && <em title={`Masuk daftar di ${Math.round(100 * w.peluang!)}% undian koefisien`}>belum pasti</em>}</span>
            <span className="bar"><i style={{ width: `${(v / max) * 100}%` }} /></span>
            <b>{v <= 0.5 ? "≈ 0" : n0(v)}</b>
            {i === r.kEfektif - 1 && i < ws.length - 1 && <span className="cut">{pct(porsi)} manfaat di atas garis ini</span>}
          </li>
        );
      })}
    </Reveal>
  );
}

/* ---------- Cerita 1: paling berasap ≠ paling perlu ---------- */
function Efisiensi({ r, m, outcome, label, nama, hinge }: { r: HasilPrioritas; m: ModelDampak; outcome: string; label: string; nama: (id: string) => string; hinge: boolean }) {
  const pas = pasanganPenjelas(r, outcome);
  const ws = r.wilayah.filter((w) => w.beban > 1e-9);
  const eff = (w: { av: Record<string, number>; beban: number }) => (1000 * w.av[outcome]) / w.beban;
  const rrOf = (hid: string) => Math.exp(m.b_per_rs[hid][outcome]);
  // Urutan asap (rata-rata PM2.5) vs urutan manfaat per µg yang diturunkan.
  const asapRank = Object.fromEntries([...ws].sort((a, b) => b.pmMean - a.pmMean).map((w, i) => [w.hid, i + 1]));
  const urut = [...ws].sort((a, b) => eff(b) - eff(a));
  const terkotor = urut.find((w) => asapRank[w.hid] === 1);
  const posKotor = terkotor ? urut.indexOf(terkotor) + 1 : 0;
  const isA = (id: string) => !!pas && id === pas.a.hid, isB = (id: string) => !!pas && id === pas.b.hid;
  const warnaBar = (id: string) => (isA(id) ? TEAL : isB(id) ? GREY_D : asapRank[id] <= 3 ? "#f2b183" : "#dfe7ea");
  const maxE = Math.max(1, ...urut.map(eff));
  const opt: EChartsOption = {
    tooltip: { trigger: "item", formatter: (p: any) => { const w = urut[p.dataIndex]; return `<b>${nama(w.hid)}</b> · asap urutan ${asapRank[w.hid]}<br/><b>${n0(eff(w))}</b> kasus tercegah per 1.000 µg diturunkan<br/>${n0(w.av[outcome])} kasus dari ${n0(w.beban)} µg·hari${hinge ? "" : `<br/>Kasus +${fmt(100 * (rrOf(w.hid) - 1), 0)}% jika PM2.5 dua kali lipat`}`; } },
    grid: { left: 4, right: 52, top: 26, bottom: 4, containLabel: true },
    xAxis: { type: "value", max: maxE * 1.04, show: false },
    yAxis: { type: "category", inverse: true, data: urut.map((w) => w.hid), axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { interval: 0, margin: 10, formatter: (id: string) => `{${isA(id) || isB(id) ? "b" : "n"}|${nama(id)}}  {${asapRank[id] <= 3 ? "h" : "t"}|${asapRank[id]}}`,
        rich: { n: { fontSize: 11.5, color: GREY_D }, b: { fontSize: 12, fontWeight: 800, color: C.ink },
          t: { fontSize: 10, color: GREY_D, backgroundColor: "#eef3f4", borderRadius: 4, padding: [2, 5], width: 14, align: "center" },
          h: { fontSize: 10, fontWeight: 800, color: "#8a3b12", backgroundColor: "#fde3cf", borderRadius: 4, padding: [2, 5], width: 14, align: "center" } } } },
    graphic: [{ type: "text", right: 52, top: 2, style: { text: "kasus tercegah per 1.000 µg", fontSize: 10.5, fill: GREY_D, align: "right" } },
      { type: "text", left: 4, top: 2, style: { text: "wilayah  ·  urutan asap", fontSize: 10.5, fill: GREY_D } }],
    series: [{
      type: "bar", barWidth: "62%", animationDuration: 700,
      data: urut.map((w) => ({ value: Math.max(0, eff(w)), itemStyle: { color: warnaBar(w.hid), borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: "right", fontSize: 11, fontFamily: "var(--font-num)", formatter: (p: any) => n0(p.value),
        color: C.ink, fontWeight: 650 },
      markLine: undefined,
    } as any],
  };
  const ratio = pas ? eff(pas.a) / eff(pas.b) : 0;
  return (
    <Story tone="focus" title="Paling Berasap Belum Tentu Paling Perlu Didahulukan"
      big={pas ? `${fmt(ratio, ratio < 10 ? 1 : 0)}×` : undefined}
      bigNote={pas ? `lebih banyak kasus tercegah per µg di ${nama(pas.a.hid)} dibanding ${nama(pas.b.hid)}` : undefined}
      chart={<Chart option={opt} height={urut.length * 26 + 36} ariaLabel={`Kasus ${label} tercegah per 1.000 µg PM2.5 yang diturunkan, per wilayah, dengan urutan asap`} />}>
      {terkotor && posKotor > 1 && <p>Wilayah paling berasap, <b>{nama(terkotor.hid)}</b>, hanya di urutan <b>{posKotor}</b> dari {urut.length} untuk manfaat per µg. Kotak oranye = 3 wilayah paling berasap.</p>}
      {pas && !hinge
        ? <p>{nama(pas.a.hid)} unggul atas {nama(pas.b.hid)} karena pasiennya lebih peka: jika PM2.5 dua kali lipat, kasus naik <b>+{fmt(100 * (rrOf(pas.a.hid) - 1), 0)}%</b>, dibanding <b>+{fmt(100 * (rrOf(pas.b.hid) - 1), 0)}%</b> di {nama(pas.b.hid)}.</p>
        : hinge
          ? <p>Untuk {label}, kepekaan dianggap sama di semua RS, jadi urutan hanya ditentukan jumlah pasien dan paparan.</p>
          : <p>Dengan {r.kEfektif} wilayah, hampir semua yang terdampak sudah masuk daftar, jadi tidak ada pasangan sebanding untuk dibandingkan. Kurangi jumlah wilayah untuk melihat perbedaannya.</p>}
    </Story>
  );
}

/* ---------- Cerita 2: apakah daftar ini awet? (bump chart) ---------- */
function Awet({ tahunan, outcome, K, nama, batas, label }: { tahunan: { p: Periode; ds: Dasar[] }[]; outcome: string; K: number; nama: (id: string) => string; batas: boolean; label: string }) {
  const pil = tahunan.map((t) => ({ ...t, pl: pilih(t.ds, outcome, K) }));
  const rank = pil.map((t) => {
    const av = Object.fromEntries(t.ds.map((d) => [d.hid, d.av[outcome]]));
    const order = [...t.pl.terdampak].sort((a, b) => av[b] - av[a]);
    return Object.fromEntries(order.map((id, i) => [id, i + 1]));
  });
  const ids = [...new Set(pil.flatMap((t) => t.pl.model))];
  const cnt = (id: string) => pil.filter((t) => t.pl.model.includes(id)).length;
  const inti = ids.filter((id) => cnt(id) === pil.length);
  const baru = ids.filter((id) => pil[pil.length - 1].pl.model.includes(id) && !pil[0].pl.model.includes(id));
  const maxR = Math.max(K + 2, ...ids.flatMap((id) => rank.map((rk) => rk[id] ?? 0)));

  // Uji ke depan: pilih di periode i, nilai di periode i+1 (jumlah wilayah sama).
  const maju = pil.slice(0, -1).map((a, i) => {
    const b = pil[i + 1];
    const avB = Object.fromEntries(b.ds.map((d) => [d.hid, d.av[outcome]]));
    const nilai = (sel: string[]) => sel.reduce((s, id) => s + (avB[id] ?? 0), 0);
    const best = Math.max(nilai(a.pl.jauh), nilai(a.pl.kotor));
    return { a: a.p.pendek, b: b.p.pendek, kosong: !a.pl.kEfektif || !b.pl.kEfektif, beda: best ? nilai(a.pl.model) / best - 1 : 0 };
  });

  const warna = (id: string) => (inti.includes(id) ? TEAL : baru.includes(id) ? C.gambut : GREY);
  const opt: EChartsOption = {
    tooltip: { trigger: "item", formatter: (p: any) => `<b>${p.seriesName}</b><br/>${pil[p.dataIndex].p.pendek}: peringkat ${p.value ?? "–"}` },
    grid: { left: 8, right: 110, top: 14, bottom: 10, containLabel: true },
    xAxis: { type: "category", data: pil.map((t) => t.p.pendek), boundaryGap: false, axisLabel: { fontWeight: 650, color: C.ink } },
    yAxis: { type: "value", inverse: true, min: 1, max: maxR, interval: 1, splitLine: { show: false } },
    series: ids.map((id) => ({
      name: nama(id), type: "line" as const, data: rank.map((rk) => rk[id] ?? null), connectNulls: false,
      symbol: "circle", symbolSize: inti.includes(id) ? 11 : 8,
      lineStyle: { width: inti.includes(id) ? 4 : baru.includes(id) ? 3 : 2, color: warna(id) }, itemStyle: { color: warna(id), borderColor: "#fff", borderWidth: 1.5 },
      z: inti.includes(id) ? 5 : baru.includes(id) ? 4 : 2,
      endLabel: { show: true, formatter: nama(id), color: inti.includes(id) || baru.includes(id) ? C.ink : GREY_D, fontWeight: inti.includes(id) ? 700 : 500, fontSize: 11.5 },
      markArea: id === ids[0] ? { silent: true, itemStyle: { color: "rgba(46,196,182,.08)" }, label: { show: true, position: "insideTopLeft", formatter: `${K} besar`, color: TEAL_INK, fontSize: 11, fontWeight: 650 }, data: [[{ yAxis: 0.6 }, { yAxis: K + 0.4 }]] } : undefined,
    })) as any,
  };
  return (
    <Story flip tone="gambut" title={inti.length ? `${inti.length} dari ${K} Wilayah Tetap Prioritas` : "Daftar Berganti Tiap Periode"}
      big={`${inti.length}/${K}`} bigNote={inti.length ? `${inti.length <= 3 ? daftar(inti.map(nama)) : `${inti.length} wilayah ini`} bertahan di ${K} besar ${pil.length} periode berturut-turut` : `Tidak ada wilayah yang bertahan di ${K} besar`}
      chart={<Chart option={opt} height={320} ariaLabel="Peringkat wilayah per periode" />}>
      {inti.length ? <p>Bertahan karena di sanalah asap yang turun paling banyak mencegah {label}.</p> : null}
      {baru.length ? <p><b>{daftar(baru.map(nama))}</b> menyusul setelah {pil[0].p.pendek}.</p> : null}
      <p className="alok-nota"><b>Daftar lama masih ampuh?</b></p>
      <div className="alok-uji" aria-label="Uji daftar lama pada periode berikutnya">
        {maju.map((u) => (
          <span key={u.a}>
            <small>Daftar {u.a} diuji di {u.b}</small>
            <b>{u.kosong ? "–" : Math.abs(u.beda) < 0.02 ? "Setara" : `${u.beda > 0 ? "+" : "−"}${fmt(Math.abs(100 * u.beda), 0)}%`}</b>
            <small>dibanding memilih yang {batas ? "paling berasap" : "terberat"}</small>
          </span>
        ))}
      </div>
    </Story>
  );
}

/* ---------- Telusuri: tabel tiga faktor ---------- */
function Detail({ r, m, outcome, label, nama, batas, hinge }: { r: HasilPrioritas; m: ModelDampak; outcome: string; label: string; nama: (id: string) => string; batas: boolean; hinge: boolean }) {
  const [open, setOpen] = useState(false);
  const ws = r.wilayah.filter((w) => w.beban > 1e-9);
  const pick = new Set(r.cara[0].pilih);
  const maxP = Math.max(1, ...ws.map((w) => w.kasus[outcome]));
  const maxB = Math.max(1, ...ws.map((w) => w.beban));
  const rrOf = (hid: string) => Math.exp(m.b_per_rs[hid][outcome]);
  const maxR = hinge ? 1 : Math.max(0.01, ...ws.map((w) => rrOf(w.hid) - 1));
  const maxV = Math.max(1, ...ws.map((w) => Math.max(w.hi ?? 0, w.av[outcome])));
  return (
    <section className={`more-panel${open ? " open" : ""}`}>
      <button className="more-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="more-ico" aria-hidden>{open ? "−" : "+"}</span>
        <span><b>Telusuri Lebih Dalam</b><small>Tiga faktor tiap wilayah dan tiga cara memilih</small></span>
      </button>
      {open && (
        <div className="more-body">
          <div className="faktor" role="table" aria-label={`Tiga faktor kasus ${label} tercegah`}>
            <div className="f-row f-head" role="row"><span /><span>Wilayah</span><span>Pasien</span><span>Paparan</span><span>Kepekaan</span><span>Kasus Tercegah · Rentang 90%</span></div>
            {ws.map((w, i) => {
              const v = w.av[outcome];
              return (
                <div key={w.hid} className={`f-row${pick.has(w.hid) ? " pick" : ""}`} role="row">
                  <span className="f-no">{i + 1}</span>
                  <span className="f-name"><b>{nama(w.hid)}</b><small>{w.code}</small></span>
                  <span className="f-mini"><i style={{ width: `${(w.kasus[outcome] / maxP) * 100}%` }} /><small>{n0(w.kasus[outcome])}</small></span>
                  <span className="f-mini"><i style={{ width: `${(w.beban / maxB) * 100}%` }} /><small>{batas ? `${w.hari} hari · ` : ""}{n0(w.beban)}</small></span>
                  <span className="f-mini">{hinge ? <small>sama</small> : <><i style={{ width: `${(Math.max(0, rrOf(w.hid) - 1) / maxR) * 100}%` }} /><small>+{fmt(100 * (rrOf(w.hid) - 1), 0)}%</small></>}</span>
                  <span className="f-res">
                    <span className="rk-bar" aria-hidden>
                      <i className="rk-fill" style={{ width: `${(Math.max(0, v) / maxV) * 100}%` }} />
                      {w.lo != null && w.hi != null && v > 0.5 && <i className="rk-ci" style={{ left: `${(Math.max(0, w.lo) / maxV) * 100}%`, width: `${((Math.max(0, w.hi) - Math.max(0, w.lo)) / maxV) * 100}%` }} />}
                    </span>
                    <b>{v <= 0.5 ? "≈ 0" : n0(v)}</b>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="alok-cara">
            {r.cara.map((c) => (
              <div key={c.id} className={c.id === "model" ? "is-model" : ""}>
                <b>{c.label}</b><span>{n0(c.kasus)} kasus · {n0(c.beban)} µg·hari</span>
                <small>{c.pilih.map(nama).join(", ")}</small>
              </div>
            ))}
          </div>
          <p className="note">Pasien = kasus {label} tercatat. Paparan = PM2.5 yang diturunkan (µg·hari). Kepekaan = kenaikan risiko tiap PM2.5 berlipat dua.</p>
        </div>
      )}
    </section>
  );
}
