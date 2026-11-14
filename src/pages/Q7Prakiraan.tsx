import { useMemo, useState, type ReactNode } from "react";
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
  tahun: Record<string, { bulan: (number | null)[]; hari55: ([number, number] | null)[]; lewat55: number[]; rasio: number | null }> };
type Uji4 = { n: number; mae_rata7: number; mae_prak: number; turun: number };
type MusimSt = { code: string; tahun: Record<string, { mulai: string | null; akhir?: string; rata?: number; hari?: number; berlanjut?: boolean } | null> };
type V6 = {
  terbit: string; kalender: KalSt[]; musim: MusimSt[]; uji_tanda: { h: number; menang: number; n: number; p: number }[];
  kasus: { rs: { rs: string; nama: string; code: string; rata7: number; riwayat: (number | null)[]; hari: { tgl: string; kasus: number; lo: number; hi: number }[] }[];
    uji: { semua: Uji4; biasa: Uji4; lintas: Uji4; lompat: Uji4 } };
  jam: { code: string; profil: number[]; buruk: number; bersih: number; andal: number; n: number }[];
};

/** Satu tampilan stasiun (terbit atau putar ulang) yang dipakai peta panas dan detail. */
type Tampil = { code: string; nama: string; kembar: boolean; siaga: boolean; riwayat: (number | null)[]; h0: number | null;
  hari: { tgl: string; h: number; nilai: number; lo: number; hi: number; p: number; kelas: Kelas; akt: number | null }[] };

const TEAL = "#2ec4b6", TEAL_INK = "#0b5563", GREY = "#b9c9ce";
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const selisih = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const pendek = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`; };
const hariKe = (iso: string) => HARI[new Date(iso + "T00:00:00Z").getUTCDay()];
const kelasDari = (p: number): Kelas => (p > 0.7 ? "tinggi" : p >= 0.3 ? "sedang" : "rendah");
const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${fmt(v * 100, d)}%`);
const skillTxt = (s: number | null | undefined) => (s == null ? "–" : Math.abs(s) < 0.005 ? "Setara" : `${s > 0 ? "+" : "−"}${fmt(Math.abs(s) * 100, 0)}%`);
const KEMBAR_NAMA = "Palangka Raya–Sampit";
const ispuIdx = (v: number) => Math.max(0, ispuCat(v));
const CERITA = [{ tgl: "2026-08-31", lab: "31 Agu, sehari sebelum lonjakan" }, { tgl: "2026-07-25", lab: "25 Jul, awal musim asap" }];
const tanpaKembar = <T extends { code: string }>(xs: T[]) => xs.filter((x) => !(x.code === "KTG-02" && xs.some((y) => y.code === "KTG-01")));
const puncak = (t: Tampil) => Math.max(...t.hari.map((x) => x.nilai));

function bangun(pk: Prak, ar: Arsip, mode: "terbit" | "ulang", ulang: string, nm: (c: string, f?: string) => string): Tampil[] {
  if (mode === "terbit") {
    return pk.stasiun.map((s) => ({ code: s.code, nama: nm(s.code, s.nama), kembar: s.kembar, siaga: s.siaga, riwayat: s.riwayat, h0: s.hari_ini,
      hari: s.hari.map((x) => ({ tgl: x.tgl, h: x.h, nilai: x.nilai, lo: x.lo, hi: x.hi, p: x.p55, kelas: x.kelas, akt: null })) }))
      .sort((a, b) => puncak(b) - puncak(a));
  }
  const i = selisih(ar.mulai, ulang);
  const musim = [7, 8, 9, 10].includes(+ulang.slice(5, 7));
  const out: Tampil[] = [];
  for (const [code, a] of Object.entries(ar.stasiun)) {
    const v = a.nilai[i], p = a.peluang[i];
    if (!v || v[0] == null) continue;
    const rs = ar.rentang[code];
    out.push({ code, nama: nm(code), kembar: code === "KTG-01" || code === "KTG-02", siaga: a.siaga[i] === 1,
      riwayat: a.aktual.slice(Math.max(0, i - 29), i + 1), h0: a.aktual[i] ?? null,
      hari: v.map((x, h) => {
        const tgl = addDays(ulang, h + 1), lintas = tgl.slice(5, 7) !== ulang.slice(5, 7);
        const base = musim ? "musim" : "luar";
        const rg = rs?.[lintas ? `${base}_lintas` : base] ?? rs?.[base];
        const val = x ?? 0, l = Math.log1p(val), pp = (p[h] ?? 0) / 100;
        return { tgl, h: h + 1, nilai: val, lo: rg ? Math.expm1(l + rg[h][0]) : val, hi: rg ? Math.expm1(l + rg[h][1]) : val,
          p: pp, kelas: kelasDari(pp), akt: a.aktual[i + h + 1] ?? null };
      }) });
  }
  return out.sort((a, b) => puncak(b) - puncak(a));
}

export default function Q7Prakiraan() {
  const d = useData<[Prak, Verif, Arsip, V6]>("prakiraan_pm25", "prakiraan_verifikasi", "prakiraan_arsip", "prakiraan_v6");
  const { byCode } = useApp();
  const [pilih, setPilih] = useState<string | null>(null);
  const [mode, setMode] = useState<"terbit" | "ulang">("terbit");
  const [ulang, setUlang] = useState(CERITA[0].tgl);
  const nm = (c: string, f?: string) => byCode[c]?.nama ?? f ?? c;

  const terbitSt = useMemo(() => (d ? bangun(d[0], d[2], "terbit", "", nm) : null), [d, byCode]);
  const modeSt = useMemo(() => (d ? (mode === "terbit" ? terbitSt : bangun(d[0], d[2], "ulang", ulang, nm)) : null), [d, mode, ulang, terbitSt, byCode]);

  if (!d || !terbitSt || !modeSt) return <div className="loading">Memuat prakiraan…</div>;
  const [pk, vf, ar, v6] = d;
  const U = vf.uji.per_horizon, Vd = vf.validasi.per_horizon;
  const h1 = U[0], h7 = U[U.length - 1];
  const nama = (c: string) => byCode[c]?.nama ?? c;
  const label = (t: { code: string; nama: string; kembar: boolean }) => (t.kembar ? KEMBAR_NAMA : t.nama);
  const daftar = tanpaKembar(modeSt);
  const kode = pilih && daftar.some((s) => s.code === pilih) ? pilih : daftar[0]?.code;
  const sel = daftar.find((s) => s.code === kode) ?? daftar[0];
  const dasar = mode === "terbit" ? pk.terbit : ulang;
  const terbit = fmtDate(pk.terbit);
  const cak = U.reduce((a, r) => a + r.cakupan80, 0) / U.length;
  const ut = v6.uji_tanda;
  const hariUlang = selisih(ar.mulai, addDays(pk.terbit, -1));

  const lokasi = tanpaKembar(terbitSt);
  const atas = lokasi.filter((t) => t.hari.some((x) => x.nilai > pk.batas));
  const akhir7 = pendek(addDays(pk.terbit, 7));

  // rekam jejak: prakiraan besok yang dibuat sehari sebelumnya, untuk 30 hari terakhir
  const jejak = (() => {
    const a = ar.stasiun[sel.code];
    const n = sel.riwayat.length, maks = selisih(ar.mulai, dasar) - 1;
    const f = Array.from({ length: n }, (_, j) => {
      const i = selisih(ar.mulai, addDays(dasar, j - n + 1)) - 1;
      return a && i >= 0 && i <= maks ? a.nilai[i]?.[0] ?? null : null;
    });
    return { f };
  })();

  // musim asap: periode PM2.5 > 55 per lokasi per tahun
  const akhirLalu = (m: MusimSt) => m.tahun["2025"]?.akhir ?? m.tahun["2024"]?.akhir ?? null;
  const musimSt = v6.musim.filter((m) => m.code !== "KTG-02" && TAHUN3.some((y) => (m.tahun[y]?.rata ?? 0) > pk.batas))
    .sort((a, b) => Number(!!a.tahun["2026"]?.mulai?.endsWith("01-01")) - Number(!!b.tahun["2026"]?.mulai?.endsWith("01-01"))
      || (b.tahun["2026"]?.rata ?? 0) - (a.tahun["2026"]?.rata ?? 0));
  const musimIni = musimSt.filter((m) => m.tahun["2026"]?.berlanjut && !m.tahun["2026"]?.mulai?.endsWith("01-01"));
  const akhirList = musimIni.map(akhirLalu).filter(Boolean) as string[];
  const akhirUmum = akhirList.length ? akhirList.sort((a, b) => akhirList.filter((x) => x === b).length - akhirList.filter((x) => x === a).length)[0] : null;
  const akhirSama = akhirUmum ? musimIni.filter((m) => ["2024", "2025"].every((y) => !m.tahun[y]?.akhir || m.tahun[y]!.akhir!.slice(5) === akhirUmum.slice(5))).length : 0;
  const sisa = akhirUmum ? selisih(pk.terbit, geser(akhirUmum)) : null;
  const naik = musimSt.filter((m) => { const r = TAHUN3.map((y) => m.tahun[y]?.rata ?? 0); return r[0] > 0 && r[1] > r[0] && r[2] > r[1]; });
  const terNaik = [...naik].sort((a, b) => (b.tahun["2026"]!.rata! - b.tahun["2025"]!.rata!) - (a.tahun["2026"]!.rata! - a.tahun["2025"]!.rata!))[0];
  const baru = musimSt.filter((m) => m.tahun["2026"]?.mulai && !m.tahun["2024"]?.mulai && !m.tahun["2025"]?.mulai);
  const labelKode = (c: string) => (c === "KTG-01" ? KEMBAR_NAMA : nama(c));
  const lewatAll = v6.kalender.filter((k) => k.code !== "KTG-02" && ["2024", "2025", "2026"].some((y) => k.tahun[y]?.lewat55.length));
  const sama = lewatAll.filter((k) => {
    const s = ["2024", "2025", "2026"].map((y) => (k.tahun[y]?.lewat55 ?? []).filter((m) => m <= 10).join(","));
    return s[0] === s[1] && s[1] === s[2];
  }).length;

  // dampak RS (selalu tanggal terbit)
  const rs = v6.kasus.rs.find((x) => x.code === kode);
  const rsTot = rs ? rs.hari.reduce((a, h) => a + h.kasus, 0) : 0, rsBeda = rs ? rsTot - rs.rata7 * 7 : 0;
  const ks = v6.kasus.uji;
  const besok = sel.hari[0];

  // pergantian bulan berikutnya: perubahan median bulanan tahun lalu di lokasi ini
  const transisi = (() => {
    const d0 = new Date(dasar + "T00:00:00Z"), bl = (d0.getUTCMonth() + 1) % 12;
    const tgl1 = new Date(Date.UTC(d0.getUTCFullYear() + (bl === 0 ? 1 : 0), bl, 1)).toISOString().slice(0, 10);
    const k = v6.kalender.find((x) => x.code === sel.code);
    const dari = bl === 0 ? k?.tahun["2024"]?.bulan[11] : k?.tahun["2025"]?.bulan[bl - 1], ke = k?.tahun["2025"]?.bulan[bl];
    const hari = selisih(dasar, tgl1);
    return { bulan: bl, ubah: dari && ke ? ke / dari - 1 : null, hari, dalam7: hari <= 7 };
  })();

  return (
    <Page path="/prakiraan" noStage
      headline={atas.length > 0 ? `${atas.length} Lokasi Diperkirakan di Atas 55 Sampai ${akhir7}` : `Semua Lokasi Diperkirakan di Bawah 55 Sampai ${akhir7}`}
      method={<span>Prakiraan dari data terakhir {terbit}, diuji pada seluruh 2026. Alat bantu, bukan peringatan resmi.</span>}
      kpis={<>
        <Kpi k="Bulan Asap Sama 3 Tahun" v={`${sama}/${lewatAll.length}`} viz={<DotsViz n={sama} total={lewatAll.length} tone="gambut" />}
          note="lokasi jalur asap, 2024–2026" />
        <Kpi k="Di Atas 55 Minggu Ini" v={`${atas.length}`} viz={<DotsViz n={atas.length} total={lokasi.length} tone="alert" />}
          note={`dari ${lokasi.length} lokasi`} />
        <Kpi k="Prakiraan Besok Lebih Tepat" v={`${ut[0].menang}/${ut[0].n}`} viz={<DotsViz n={ut[0].menang} total={ut[0].n} tone="focus" cols={13} />}
          note={`stasiun, dibanding menyalin hari ini · selisih ${fmt(h1.mae_salin - h1.mae_model, 1)} ${UG}`} />
      </>}
      main={<>
        <Card title={akhirUmum && sisa != null && sisa > 0 ? `Musim Asap Diperkirakan Berakhir ${pendek(geser(akhirUmum))}, ${sisa} Hari Lagi` : "Musim Asap per Lokasi"}
          sub="Batang = musim asap 2026, saat PM2.5 di atas 55. Warna makin gelap, makin parah.">
          <div className="pk-musim-stat">
            {akhirUmum && <div><b>{akhirSama}<small>/{musimIni.length}</small></b><span>lokasi selesai di {pendek(geser(akhirUmum))} pada 2024 dan 2025</span></div>}
            <div><b>{naik.length}</b><span>lokasi makin parah tiap tahun{terNaik ? <>, terbesar <em>{labelKode(terNaik.code)}</em> {fmt(terNaik.tahun["2025"]!.rata!, 0)} → {fmt(terNaik.tahun["2026"]!.rata!, 0)}</> : null}</span></div>
            {baru.length > 0 && <div className="baru"><b>{baru.length}</b><span>baru pertama kali di atas 55: <em>{baru.map((m) => labelKode(m.code)).join(", ")}</em>, sejak {pendek(baru[0].tahun["2026"]!.mulai!)}</span></div>}
          </div>
          <Linimasa st={musimSt} label={labelKode} terbit={pk.terbit} akhirLalu={akhirLalu} akhirUmum={akhirUmum} kode={kode} onPilih={setPilih} />
          <div className="pk-legenda" aria-label="Keterangan linimasa musim">
            <b className="pk-leg-judul">Rata-rata 2026 ({UG})</b>
            {MUSIM_LAB.map((l, i) => <span key={l}><i style={{ background: MUSIM_COL[i] }} />{l}</span>)}
            <span><i className="putus" />sisa musim</span>
            <span><i className="garis" />musim 2025</span>
            <span><i className="wajik" />akhir 2025</span>
            <span><i className="bulat" />akhir 2024</span>
          </div>
        </Card>

        <Card title={mode === "terbit" || besok.akt == null ? `${label(sel)}: ${ISPU_LAB[ispuIdx(besok.nilai)]} ${mode === "terbit" ? "Besok" : `pada ${pendek(besok.tgl)}`}`
          : `${label(sel)} ${pendek(besok.tgl)}: Diramal ${ISPU_LAB[ispuIdx(besok.nilai)]}, Terjadi ${ISPU_LAB[ispuIdx(besok.akt)]}`}
          sub="Garis teal = yang diramal sehari sebelumnya. Arahkan kursor ke grafik untuk angka lengkap.">
          <Angka s={sel} ulang={mode === "ulang"} batas={pk.batas} transisi={transisi} />
          <Pilih st={daftar} kode={kode} onPilih={setPilih} label={label} />
          <div className="pk-bar">
            <div className="kw-mode" role="tablist" aria-label="Mode prakiraan">
              <button role="tab" aria-selected={mode === "terbit"} className={mode === "terbit" ? "on" : ""} onClick={() => setMode("terbit")}>Prakiraan {pendek(pk.terbit)}</button>
              <button role="tab" aria-selected={mode === "ulang"} className={mode === "ulang" ? "on" : ""} onClick={() => setMode("ulang")}>Uji di Tanggal Lain</button>
            </div>
            {mode === "ulang" && <div className="kw-cerita">{CERITA.map((c) => <button key={c.tgl} className={ulang === c.tgl ? "on" : ""} onClick={() => setUlang(c.tgl)}>{c.lab}</button>)}</div>}
          </div>
          {mode === "ulang" && <label className="pk-geser">
            <span>Terbit <b>{hariKe(ulang)} {fmtDate(ulang)}</b></span>
            <input type="range" min={0} max={hariUlang} value={selisih(ar.mulai, ulang)} onChange={(e) => setUlang(addDays(ar.mulai, +e.target.value))} aria-label="Tanggal terbit uji" />
          </label>}
          <Detail s={sel} terbit={dasar} batas={pk.batas} jejak={jejak.f} />
          <ol className="pk-days">
            {sel.hari.map((x) => {
              const c = ispuIdx(x.nilai), awal = x.tgl.endsWith("-01");
              return (
                <li key={x.tgl} className={`${U[x.h - 1]?.nyata ? "" : "lemah"}${awal ? " awal" : ""}`} style={{ borderTopColor: ISPU_COL[c] }}
                  title={`${fmt(x.nilai, 0)} ${UG}, rentang 80% ${fmt(x.lo, 0)}–${fmt(x.hi, 0)}`}>
                  <small>{hariKe(x.tgl)} {pendek(x.tgl)}</small>
                  <em className="pk-kat" style={{ background: ISPU_COL[c], color: ISPU_ON[c] }}>{ISPU_LAB[c]}</em>
                  {x.akt != null ? <span className="akt">terjadi: {ISPU_LAB[ispuIdx(x.akt)]}</span> : <span>≈ {fmt(bulat(x.nilai), 0)}</span>}
                  {awal && <span className="awas">ganti bulan</span>}
                </li>
              );
            })}
          </ol>
          <p className="note">Kotak bergaris putus: belum terbukti lebih tepat dari menyalin hari ini.
            {sel.kembar && <> Data Palangka Raya dan Sampit di sumber hampir identik (korelasi 0,99995), jadi ditampilkan sebagai satu lokasi.</>} <Lencana k={vf.kualitas.find((q) => q.code === sel.code)} /></p>
          <div className="pk-temuan">
            <b>{vf.struktur_bulanan.awal_lonjakan_tgl1} dari {vf.struktur_bulanan.awal_lonjakan} lonjakan dimulai tanggal 1.</b>
            <span>Hari-hari sebelumnya tidak memberi tanda, jadi angka harian tidak bisa mendahuluinya. Yang bisa dipegang: kapan musim mulai dan selesai, dan berapa hari di atas 55.</span>
          </div>
        </Card>

        <Card title={rs ? `${rs.nama}: ${rsBeda >= 0 ? "+" : "−"}${fmt(Math.abs(rsBeda), 0)} Kasus Napas dalam 7 Hari` : `${label(sel)}: Tidak Ada Rumah Sakit Pasangan`}
          sub={rs ? `Perkiraan ${fmt(rsTot, 0)} kasus sampai ${akhir7}, dibanding ${fmt(rs.rata7 * 7, 0)} pada 7 hari terakhir.` : undefined}
          note={rs ? `Rumus sama dengan halaman Simulasi. Uji 2026: galat ${pct(ks.lompat.turun)} lebih kecil dari rata-rata 7 hari saat PM2.5 melompat.` : undefined}>
          {rs ? <KasusRS r={rs} terbit={v6.terbit} /> : <p className="note">Pilih lokasi lain untuk melihat dampak ke rumah sakit.</p>}
        </Card>
      </>}
      stories={
        <Story tone="focus" flip title="Seberapa Bisa Dipercaya?"
          big={`${ut[0].menang}/${ut[0].n}`} bigNote="stasiun: prakiraan besok lebih tepat dari menyalin nilai hari ini"
          chart={<Chart option={ujiOpt(vf.kualitas, nama)} height={Math.max(300, vf.kualitas.filter((q) => q.diramal).length * 15 + 60)} ariaLabel="Keunggulan prakiraan besok atas menyalin, per stasiun" />}>
          <p>Tiap hari di 2026 prakiraan dibuat hanya dari data sebelumnya, lalu dicocokkan dengan yang terjadi. Unggul tipis tapi konsisten.</p>
          <div className="pk-angka">
            <span><b>{pct(h1.skill)}</b>galat besok lebih kecil, rata-rata {fmt(h1.mae_salin - h1.mae_model, 2)} {UG}</span>
            <span><b>{pct(h7.skill)}</b>H+7, {h7.nyata ? "lolos uji" : "belum lolos uji statistik"}</span>
            <span><b>{pct(cak)}</b>masuk rentang 80%, mendekati target</span>
          </div>
        </Story>
      }
      more={[
        <div key="a" data-title="Akurasi"><Akurasi U={U} V={Vd} vf={vf} v6={v6} /></div>,
        <div key="k" data-title="Kualitas Data"><TabelKualitas vf={vf} nama={nama} /></div>,
        <div key="c" data-title="Cara Kerja"><CaraKerja vf={vf} sb={vf.struktur_bulanan} /></div>,
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
  return <span className="pk-badges">{k.lencana.filter((l) => l !== "sinyal kembar").map((l) => <i key={l} title={arti[l] ?? l}>{l}</i>)}</span>;
}

/* ---------- angka utama lokasi terpilih: kategori dulu, angka dibulatkan ---------- */
type Transisi = { bulan: number; ubah: number | null; hari: number; dalam7: boolean } | null;
const bulat = (v: number) => (v >= 1000 ? Math.round(v / 50) * 50 : v >= 100 ? Math.round(v / 10) * 10 : Math.round(v));

function Angka({ s, ulang, batas, transisi }: { s: Tampil; ulang: boolean; batas: number; transisi: Transisi }) {
  const b = s.hari[0], c = ispuIdx(b.nilai);
  const item = (k: string, v: string, n: ReactNode, o: { warna?: number; cls?: string } = {}) => (
    <div className={`pk-angka-item${o.cls ? ` ${o.cls}` : ""}`}>
      <small>{k}</small>
      <b>{v}</b>
      <span className="n">{o.warna != null && <i style={{ background: ISPU_COL[o.warna] }} />}{n}</span>
    </div>);
  if (ulang && b.akt != null) {
    const ms = Math.abs(b.nilai - b.akt) / Math.max(b.akt, 1);
    return <div className="pk-angka-baris">
      {item(`Diramal untuk ${pendek(b.tgl)}`, ISPU_LAB[c], `sekitar ${fmt(bulat(b.nilai), 0)} ${UG}`, { warna: c })}
      {item("Yang terjadi", ISPU_LAB[ispuIdx(b.akt)], `${fmt(bulat(b.akt), 0)} ${UG}`, { warna: ispuIdx(b.akt) })}
      {item("Selisih", `${fmt(ms * 100, 0)}%`, b.akt > b.nilai ? "terjadi lebih tinggi" : "terjadi lebih rendah")}
    </div>;
  }
  const atas = s.hari.filter((x) => x.nilai > batas);
  const pMin = atas.length ? Math.min(...atas.map((x) => x.p)) : 0;
  const yakin = !atas.length ? "tidak ada hari di atas 55" : pMin >= 0.9 ? "hampir pasti" : pMin >= 0.7 ? "kemungkinan besar" : "masih bisa berubah";
  return <div className="pk-angka-baris">
    {item(`Besok, ${hariKe(b.tgl)} ${pendek(b.tgl)}`, ISPU_LAB[c], `sekitar ${fmt(bulat(b.nilai), 0)} ${UG}`, { warna: c })}
    {item("Di atas 55, 7 hari ke depan", `${atas.length} dari 7 hari`, yakin)}
    {transisi && item(transisi.dalam7 ? `Masuk ${BULAN[transisi.bulan]}, pekan ini` : `Masuk ${BULAN[transisi.bulan]}, ${transisi.hari} hari lagi`,
      transisi.ubah == null ? "–" : `${transisi.ubah > 0 ? "+" : "−"}${fmt(Math.abs(transisi.ubah) * 100, 0)}%`,
      "perubahan level tahun lalu di lokasi ini", { cls: transisi.dalam7 ? "awas" : "" })}
  </div>;
}

/* ---------- pemilih lokasi: diurutkan dari terburuk, warna = kategori besok ---------- */
function Pilih({ st, kode, onPilih, label }: { st: Tampil[]; kode: string; onPilih: (c: string) => void; label: (t: Tampil) => string }) {
  return (
    <div className="pk-pilih" role="radiogroup" aria-label="Pilih lokasi">
      {st.map((s) => {
        const c = ispuIdx(s.hari[0].nilai);
        return (
          <button key={s.code} role="radio" aria-checked={s.code === kode} className={s.code === kode ? "on" : ""} onClick={() => onPilih(s.code)}
            title={`${label(s)}: ${fmt(s.hari[0].nilai, 0)} ${UG} besok (${ISPU_LAB[c]})`}>
            <i style={{ background: ISPU_COL[c] }} />{label(s)}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- detail satu lokasi: terukur, rekam jejak, prakiraan ---------- */
function Detail({ s, terbit, batas, jejak }: { s: Tampil; terbit: string; batas: number; jejak: (number | null)[] }) {
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
    const lalu1 = [...jejak, ...pad(7)];
    const akt = [...pad(n), ...s.hari.map((h) => h.akt)];
    const adaAkt = s.hari.some((h) => h.akt != null), adaJejak = jejak.some((v) => v != null);
    return {
      tooltip: { trigger: "axis", formatter: (ps: any) => {
        const i = ps[0].dataIndex, t = x[i], f = i >= n ? s.hari[i - n] : null;
        return `<b>${hariKe(t)} ${fmtDate(t)}</b><br/>` + (f
          ? `Prakiraan H+${f.h}: <b>${fmt(f.nilai, 0)}</b> ${UG}<br/>Rentang 80%: ${fmt(f.lo, 0)}–${fmt(f.hi, 0)}${f.akt != null ? `<br/>Yang terjadi: <b>${fmt(f.akt, 0)}</b>` : ""}`
          : `Terukur: <b>${ukur[i] == null ? "tidak ada data" : `${fmt(ukur[i]!, 0)} ${UG}`}</b>${lalu1[i] != null ? `<br/>Diramal sehari sebelumnya: ${fmt(lalu1[i]!, 0)}` : ""}`);
      } },
      legend: { bottom: 0, data: ["Terukur", ...(adaJejak ? ["Diramal sehari sebelumnya"] : []), "Prakiraan", "Rentang 80%", ...(adaAkt ? ["Yang terjadi"] : [])], textStyle: { fontSize: 11.5 } },
      grid: { left: 8, right: 18, top: 24, bottom: 40, containLabel: true },
      xAxis: { type: "category", data: x, boundaryGap: false, axisLabel: { formatter: (v: string) => pendek(v), fontSize: 11, interval: 6 } },
      yAxis: { type: "value", name: UG, min: 0 },
      series: [
        { name: "lo", type: "line", data: lo, stack: "pita", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
        { name: "Rentang 80%", type: "line", data: lebar, stack: "pita", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: TEAL, opacity: 0.2 }, itemStyle: { color: TEAL }, silent: true },
        { name: "Terukur", type: "line", data: ukur, symbol: "circle", symbolSize: 4, connectNulls: false, lineStyle: { width: 2, color: C.ink }, itemStyle: { color: C.ink },
          markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: RAMP[4], width: 1.5 },
            label: { formatter: `Batas ${batas}`, position: "insideEndTop", color: RAMP[5], fontWeight: 700, fontSize: 11 },
            data: [{ yAxis: batas }] },
          markArea: { silent: true, itemStyle: { color: "rgba(46,196,182,0.06)" }, data: [[{ xAxis: terbit }, { xAxis: x[x.length - 1] }]] } },
        ...(adaJejak ? [{ name: "Diramal sehari sebelumnya", type: "line", data: lalu1, symbol: "none", connectNulls: false, lineStyle: { width: 2, color: TEAL, opacity: 0.9 }, itemStyle: { color: TEAL }, z: 1 }] : []),
        { name: "Prakiraan", type: "line", data: prak, symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5, type: "dashed", color: TEAL_INK }, itemStyle: { color: TEAL_INK } },
        ...(adaAkt ? [{ name: "Yang terjadi", type: "scatter", data: akt, symbolSize: 9, itemStyle: { color: "#fff", borderColor: C.ink, borderWidth: 2 }, z: 5 }] : []),
      ] as any,
    };
  }, [s, terbit, batas, jejak]);
  return <Chart option={opt} height={300} ariaLabel="PM2.5 terukur, prakiraan sehari sebelumnya, dan prakiraan 7 hari untuk lokasi terpilih" />;
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
      <div><b>Linimasa Musim</b><span>Periode PM2.5 di atas 55 per lokasi per tahun (hari berurutan, celah sampai 10 hari digabung). Sisa musim 2026 = sampai tanggal akhir musim 2025 di lokasi itu; akhir musim sama pada 2024 dan 2025 di hampir semua lokasi.</span></div><div><b>Rekam Jejak</b><span>Garis teal di grafik lokasi = prakiraan besok yang dibuat sehari sebelumnya, diambil dari arsip uji berjalan 2026.</span></div>
      <div><b>Kasus Napas</b><span>Rata-rata kasus 7 hari terakhir × (PM2.5 prakiraan ÷ PM2.5 7 hari terakhir)^(b ÷ ln 2), b per RS dari model dampak halaman Simulasi. Diuji balik pada arsip prakiraan 2026.</span></div>
      <div><b>Struktur Dataset</b><span>Tingkat PM2.5 di dataset berganti pada tanggal 1 tiap bulan: {sb.awal_lonjakan_tgl1} dari {sb.awal_lonjakan} awal lonjakan dan {sb.lonjakan_besar_tgl1} dari {sb.lonjakan_besar} lonjakan besar jatuh pada tanggal 1. Sebelumnya struktur ini sengaja tidak dimanfaatkan; sekarang dipakai secara terbuka di lapis transisi, dan bergantung pada dataset ini.</span></div>
      <div><b>Batasan</b><span>Tanpa titik api dan curah hujan, model tidak bisa melihat kebakaran baru sebelum asapnya terukur. Angka harian di atas 7 hari tidak ditampilkan.</span></div>
    </div>
  );
}

/* ---------- linimasa musim asap: periode PM2.5 > 55 per lokasi, 2024 / 2025 / 2026 ---------- */
const TAHUN3 = ["2024", "2025", "2026"] as const;
const MUSIM_BATAS = [70, 100, 150, 250];
const MUSIM_COL = [RAMP[1], RAMP[2], RAMP[3], RAMP[4], RAMP[5]];
const MUSIM_LAB = ["55–70", "70–100", "100–150", "150–250", "≥ 250"];
const binMusim = (v: number) => MUSIM_BATAS.filter((b) => v >= b).length;
const geser = (iso: string) => `2026${iso.slice(4)}`;
const ts = (iso: string) => Date.parse(iso + "T00:00:00Z");

function Linimasa({ st, label, terbit, akhirLalu, akhirUmum, kode, onPilih }: { st: MusimSt[]; label: (c: string) => string; terbit: string;
  akhirLalu: (m: MusimSt) => string | null; akhirUmum: string | null; kode: string; onPilih: (c: string) => void }) {
  const sempit = typeof window !== "undefined" && window.innerWidth < 600;
  const x0 = ts("2026-06-15"), x1 = ts("2026-11-30");
  const kini = ts(terbit) + 864e5, akhir = akhirUmum ? ts(geser(akhirUmum)) + 864e5 : null;
  const opt = useMemo<EChartsOption>(() => {
    const data: any[] = [];
    const klip = (iso: string, plus = 0) => Math.min(Math.max(ts(geser(iso)) + plus, x0), x1);
    st.forEach((m, yi) => {
      const t = m.tahun["2026"], t25 = m.tahun["2025"], t24 = m.tahun["2024"];
      if (t25?.mulai && t25.akhir) data.push({ value: [klip(t25.mulai), klip(t25.akhir, 864e5), yi, 0, 0], info: { y: "2025", t: t25 } });
      if (t?.mulai && t.akhir && t.rata != null) {
        data.push({ value: [klip(t.mulai), klip(t.akhir, 864e5), yi, 1, binMusim(t.rata)], info: { y: "2026", t } });
        const e = t.berlanjut ? akhirLalu(m) : null;
        if (e && ts(geser(e)) > ts(t.akhir)) data.push({ value: [klip(t.akhir, 864e5), klip(e, 864e5), yi, 2, binMusim(t.rata)], info: { y: "2026", t, sampai: e } });
      }
      if (t24?.akhir) data.push({ value: [klip(t24.akhir, 864e5), 0, yi, 3, 0], info: { y: "2024", t: t24, titik: true } });
      if (t25?.akhir) data.push({ value: [klip(t25.akhir, 864e5), 0, yi, 4, 0], info: { y: "2025", t: t25, titik: true } });
    });
    const ubah = (m: MusimSt) => {
      const a = m.tahun["2025"]?.rata, b = m.tahun["2026"]?.rata;
      return a && b ? b / a - 1 : null;
    };
    return {
      tooltip: { formatter: (q: any) => {
        const { y, t, sampai, titik } = q.data.info, m = st[q.value[2]];
        if (sampai) return `<b>${label(m.code)}</b><br/>Sisa musim 2026 (perkiraan): sampai ${pendek(geser(sampai))}, sama dengan akhir musim tahun lalu`;
        if (titik) return `<b>${label(m.code)}</b><br/>Musim ${y} berakhir ${pendek(t.akhir)}`;
        return `<b>${label(m.code)} · musim ${y}</b><br/>${pendek(t.mulai)} – ${pendek(t.akhir)}${t.berlanjut ? " (masih berlangsung)" : ""}<br/>${t.hari} hari di atas 55 · rata-rata ${fmt(t.rata, 0)} ${UG}`;
      } },
      grid: { left: 8, right: sempit ? 10 : 122, top: 46, bottom: 26, containLabel: true },
      graphic: sempit ? [] : [{ type: "text", right: 8, top: 24, style: { text: "rata-rata 2025 → 2026", fontSize: 10.5, fontWeight: 600, fill: "#8a979c", align: "right" } }],
      xAxis: { type: "time", min: x0, max: x1, position: "top", axisLine: { show: false }, axisTick: { show: false }, splitNumber: 6,
        splitLine: { show: true, lineStyle: { color: "#eef2f3" } },
        axisLabel: { fontSize: 11, fontWeight: 650, color: C.ink, formatter: (v: number) => BULAN[new Date(v + 12 * 36e5).getMonth()] } },
      yAxis: [
        { type: "category", inverse: true, data: st.map((m) => label(m.code)), axisTick: { show: false }, axisLine: { show: false },
          axisLabel: { fontSize: sempit ? 10.5 : 12, color: C.ink, formatter: (v: string, i: number) => (st[i]?.code === kode ? `{b|${v}}` : v), rich: { b: { fontWeight: 800, color: TEAL_INK, fontSize: 12 } } } },
        { type: "category", inverse: true, position: "right", data: st.map((_m, i) => `${i}`), axisTick: { show: false }, axisLine: { show: false },
          axisLabel: { show: !sempit, formatter: (v: string) => {
            const m = st[+v], a = m.tahun["2025"]?.rata, b = m.tahun["2026"]?.rata, u = ubah(m);
            if (b == null) return "";
            if (a == null) return `{baru|baru} {b|${fmt(b, 0)}}`;
            return `{a|${fmt(a, 0)}}{p|→}{b|${fmt(b, 0)}}${u != null && Math.abs(u) >= 0.05 ? `{${u > 0 ? "up" : "dn"}|${u > 0 ? "▲" : "▼"}${fmt(Math.abs(u) * 100, 0)}%}` : "{eq|sama}"}`;
          }, rich: {
            a: { color: "#8a979c", fontSize: 11, fontFamily: "var(--font-num)", width: 24, align: "right" }, p: { color: "#b9c4c8", fontSize: 10, padding: [0, 3] },
            b: { color: C.ink, fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font-num)", width: 28, align: "right" },
            up: { color: RAMP[5], fontSize: 10.5, fontWeight: 750, padding: [0, 0, 0, 5] }, dn: { color: TEAL_INK, fontSize: 10.5, fontWeight: 750, padding: [0, 0, 0, 5] },
            eq: { color: "#8a979c", fontSize: 10.5, padding: [0, 0, 0, 5] },
            baru: { color: "#fff", backgroundColor: RAMP[5], borderRadius: 4, padding: [2, 5], fontSize: 10, fontWeight: 750 } } } },
      ] as any,
      series: [{ type: "custom", data, encode: { x: [0, 1], y: 2 }, z: 3,
        renderItem: (_p: any, api: any) => {
          const jenis = api.value(3), a = api.coord([api.value(0), api.value(2)]);
          const band = api.size([0, 1])[1], cy = a[1];
          if (jenis >= 3) {
            const r = Math.max(3.5, band * 0.12);
            return jenis === 4
              ? { type: "path", shape: { pathData: `M${a[0]},${cy - r - 1}L${a[0] + r},${cy}L${a[0]},${cy + r + 1}L${a[0] - r},${cy}Z` }, style: { fill: C.ink, stroke: "#fff", lineWidth: 1 }, z2: 6 }
              : { type: "circle", shape: { cx: a[0], cy: cy - r * 2.1, r: r * 0.75 }, style: { fill: "#fff", stroke: C.ink, lineWidth: 1.2 }, z2: 5 };
          }
          const b = api.coord([api.value(1), api.value(2)]), w = Math.max(3, b[0] - a[0]);
          if (jenis === 0) return { type: "rect", shape: { x: a[0], y: cy + band * 0.25, width: w, height: Math.max(2, band * 0.07), r: 1 }, style: { fill: "#c3ced2" } };
          const h = band * 0.42, col = MUSIM_COL[api.value(4)];
          if (jenis === 2) return { type: "rect", shape: { x: a[0], y: cy - h / 2, width: w, height: h, r: [0, 5, 5, 0] },
            style: { fill: col, opacity: 0.25, stroke: col, lineWidth: 1.4, lineDash: [4, 3] } };
          return { type: "rect", shape: { x: a[0], y: cy - h / 2, width: w, height: h, r: 5 }, style: { fill: col } };
        },
        markArea: akhir && akhir > kini ? { silent: true, itemStyle: { color: "rgba(232,93,4,0.07)" }, label: { show: false },
          data: [[{ xAxis: kini }, { xAxis: akhir }]] } : undefined,
        markLine: { silent: true, symbol: "none", data: [
          { xAxis: kini, lineStyle: { color: C.ink, type: "solid", width: 1.2 }, label: { formatter: `kini ${pendek(terbit)}`, position: "end", fontSize: 10.5, fontWeight: 700, color: C.ink } },
          ...(akhir ? [{ xAxis: akhir, lineStyle: { color: RAMP[5], type: "dashed", width: 1.4 }, label: { formatter: `berakhir ${pendek(geser(akhirUmum!))}`, position: "end", fontSize: 10.5, fontWeight: 800, color: RAMP[5] } }] : []),
        ] } } as any],
    };
  }, [st, label, terbit, kode, sempit, akhirLalu, akhir, kini, akhirUmum]);
  return <Chart option={opt} height={st.length * 34 + 78} ariaLabel="Musim asap 2026 per lokasi dibanding 2025, dengan akhir musim tahun lalu"
    onClick={(p) => { const v = p.value as number[] | undefined; if (v && st[v[2]]) onPilih(st[v[2]].code); }} />;
}

/* ---------- perkiraan kasus napas di RS pasangan ---------- */
function KasusRS({ r, terbit }: { r: V6["kasus"]["rs"][number]; terbit: string }) {
  const opt = useMemo<EChartsOption>(() => {
    const n = r.riwayat.length;
    const lalu = Array.from({ length: n }, (_, i) => addDays(terbit, i - n + 1));
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
          markLine: { silent: true, symbol: "none", lineStyle: { color: TEAL_INK, type: "dashed" }, label: { formatter: `rata-rata 7 hari lalu ${fmt(r.rata7, 0)}`, position: "insideStartTop", fontSize: 10.5, color: TEAL_INK }, data: [{ yAxis: r.rata7 }] } },
      ] as any,
    };
  }, [r, terbit]);
  return <Chart option={opt} height={240} ariaLabel="Kasus napas tercatat dan perkiraan 7 hari" />;
}

/* ---------- cerita 2: keunggulan per stasiun ---------- */
function ujiOpt(Q: Kualitas[], nama: (c: string) => string): EChartsOption {
  const rows = Q.filter((q) => q.diramal && q.skill_h1 != null).sort((a, b) => (a.skill_h1 ?? 0) - (b.skill_h1 ?? 0));
  return {
    tooltip: { formatter: (q: any) => `<b>${q.name}</b><br/>Galat besok ${fmt(q.value, 0)}% lebih kecil dari menyalin` },
    grid: { left: 8, right: 24, top: 10, bottom: 30, containLabel: true },
    xAxis: { type: "value", min: (v: any) => Math.min(-5, Math.floor(v.min / 5) * 5), name: "% galat lebih kecil (besok)", nameLocation: "middle", nameGap: 22, axisLabel: { formatter: (v: number) => `${v}%` } },
    yAxis: { type: "category", data: rows.map((q) => nama(q.code)), axisTick: { show: false }, axisLabel: { fontSize: 10.5, color: C.ink } },
    series: [{ type: "scatter", data: rows.map((q, i) => ({ value: +((q.skill_h1 ?? 0) * 100).toFixed(1), label: { show: i === 0 || i === rows.length - 1, position: "right", formatter: (v: any) => `${fmt(v.value, 0)}%`, fontSize: 11, fontWeight: 700, color: TEAL_INK } })), symbolSize: 10, itemStyle: { color: TEAL_INK, borderColor: "#fff", borderWidth: 1.5 },
      markLine: { silent: true, symbol: "none", lineStyle: { color: C.ink, type: "solid", width: 1 }, label: { formatter: "sama dengan menyalin", position: "insideEndTop", fontSize: 10.5 }, data: [{ xAxis: 0 }] } }] as any,
  };
}
