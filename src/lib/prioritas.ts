import type { HospitalDaily, ModelDampak } from "./types";
import { apply, factor, type Skenario } from "./sim";
import { dateAt } from "./state";

/** Bentuk rr.json yang dipakai di sini: RR per RS beserta rentang 95%-nya. */
export type RRFile = {
  kunci: Record<string, string>;
  per_rs: { hospital_id: string; code: string; outcome: string; rr: number; lo: number; hi: number; rr_shrunk: number }[];
};

/** Hasil satu kali jalan per wilayah untuk satu periode dan satu kebijakan. */
export type Dasar = {
  hid: string; code: string;
  av: Record<string, number>;      // kasus tercegah per penyakit
  avGab: number;                   // kasus tercegah penyakit terpilih bila koefisien gabungan dipakai
  kasus: Record<string, number>;   // kasus tercatat per penyakit (hari yang PM2.5-nya ada)
  beban: number;                   // µg/m³ × hari yang diturunkan
  hari: number;                    // hari yang PM2.5-nya diturunkan
  pmMean: number;
  bulan: Record<string, number>;   // kasus tercegah penyakit terpilih per bulan (01–12)
};

export type Wilayah = Dasar & { lo?: number; hi?: number; peluang?: number };
export type Cara = { id: "model" | "kotor" | "jauh"; label: string; pilih: string[]; kasus: number; beban: number };
export type Pilihan = { kEfektif: number; terdampak: string[]; model: string[]; jauh: string[]; kotor: string[] };

export type HasilPrioritas = {
  wilayah: Wilayah[];          // urut menurut kasus tercegah penyakit terpilih
  terdampak: number;
  kEfektif: number;
  total: number;               // seluruh kasus yang bisa dicegah (23 wilayah)
  cara: Cara[];
  terkuat: Cara | null;
  adaMC: boolean;
  hinge: boolean;
  kurva: { model: number[]; jauh: number[]; kotor: number[] };   // porsi kumulatif, indeks 0 = 1 wilayah
  bulan: string[];             // bulan ("01".."12") yang menyumbang ≥ 5% manfaat pilihan model
  gabSama: number | null;      // berapa pilihan tetap sama bila memakai koefisien gabungan
};

/** Kandidat = RS dalam model dampak dengan stasiun grade A atau B. */
export const kandidatDari = (h: HospitalDaily, gradeOf: (code: string) => string | undefined) =>
  h.model.filter((hid) => ["A", "B"].includes(gradeOf(h.rs[hid].code) ?? ""));

/** Generator acak berbenih supaya rentang tidak berubah-ubah saat halaman dimuat ulang. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
}

/** Simpangan baku koefisien per RS setelah shrinkage (DerSimonian–Laird dari rr.json). */
function sdShrunk(rr: RRFile, outcomeKey: string): Record<string, number> | null {
  const lab = Object.keys(rr.kunci).find((k) => rr.kunci[k] === outcomeKey);
  const rows = rr.per_rs.filter((x) => x.outcome === lab);
  if (!rows.length) return null;
  const b = rows.map((x) => Math.log(x.rr));
  const se = rows.map((x) => (Math.log(x.hi) - Math.log(x.lo)) / (2 * 1.96));
  const w = se.map((s) => 1 / (s * s));
  const sw = w.reduce((p, c) => p + c, 0);
  const bf = w.reduce((p, wi, i) => p + wi * b[i], 0) / sw;
  const Q = w.reduce((p, wi, i) => p + wi * (b[i] - bf) ** 2, 0);
  const tau2 = Math.max(0, (Q - (rows.length - 1)) / (sw - w.reduce((p, wi) => p + wi * wi, 0) / sw));
  return Object.fromEntries(rows.map((x, i) => [x.hospital_id, Math.sqrt((tau2 * se[i] ** 2) / (tau2 + se[i] ** 2))]));
}

export const isHinge = (m: ModelDampak, o: string) => typeof m.ambang[o] === "object";
const topK = (ids: string[], score: (id: string) => number, k: number) => [...ids].sort((a, b) => score(b) - score(a)).slice(0, k);
export const sama = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Satu kali jalan per wilayah (rumus simulator). `mc` diisi (y, log2 rasio) untuk Monte Carlo. */
export function jalan(h: HospitalDaily, m: ModelDampak, kandidat: string[], s: Skenario, from: string, to: string, outcome: string,
  mc?: Record<string, { y: number[]; l: number[] }>): Dasar[] {
  const hinge = isHinge(m, outcome);
  const bg = m.b_gabungan[outcome];
  return kandidat.map((hid) => {
    const r = h.rs[hid];
    const av: Record<string, number> = {}, kasus: Record<string, number> = {};
    for (const o of h.outcome) { av[o] = 0; kasus[o] = 0; }
    const bulan: Record<string, number> = {};
    let beban = 0, hari = 0, sum = 0, n = 0, avGab = 0;
    const y: number[] = [], l: number[] = [];
    for (let i = 0; i < h.n; i++) {
      const pm = r.pm25[i];
      if (pm == null) continue;
      const d = dateAt(i, h.mulai);
      if (d < from || d > to) continue;
      const obs = Math.max(1, pm), nw = apply(s, obs);
      sum += pm; n++;
      if (nw < obs) { beban += obs - nw; hari++; }
      for (const o of h.outcome) {
        const v = r[o][i];
        if (v == null) continue;
        kasus[o] += v;
        const a = v * (1 - factor(m, hid, o, obs, nw));
        av[o] += a;
        if (o === outcome) {
          const mm = d.slice(5, 7);
          bulan[mm] = (bulan[mm] ?? 0) + a;
          avGab += hinge ? a : v * (1 - Math.pow(nw / obs, bg / Math.LN2));
          if (mc && !hinge) { y.push(v); l.push(Math.log2(nw / obs)); }
        }
      }
    }
    if (mc) mc[hid] = { y, l };
    return { hid, code: r.code, av, avGab, kasus, beban, hari, pmMean: n ? sum / n : 0, bulan };
  });
}

/** Tiga cara memilih K wilayah dari kandidat yang sama. */
export function pilih(ds: Dasar[], outcome: string, K: number): Pilihan {
  const by = Object.fromEntries(ds.map((d) => [d.hid, d]));
  const ids = ds.map((d) => d.hid);
  const terdampak = ids.filter((id) => by[id].beban > 1e-9);
  const k = Math.min(K, terdampak.length);
  return {
    kEfektif: k, terdampak,
    model: topK(terdampak, (x) => by[x].av[outcome], k),
    jauh: topK(ids, (x) => by[x].beban, k),
    kotor: topK(ids, (x) => by[x].pmMean, k),
  };
}

export function hitungPrioritas(
  h: HospitalDaily, m: ModelDampak, rr: RRFile, kandidat: string[],
  s: Skenario, from: string, to: string, outcome: string, K: number, nMC = 1000,
): HasilPrioritas {
  const hinge = isHinge(m, outcome);
  const mcData: Record<string, { y: number[]; l: number[] }> = {};
  const ds = jalan(h, m, kandidat, s, from, to, outcome, mcData);
  const wil: Wilayah[] = ds.map((d) => ({ ...d }));
  const by = Object.fromEntries(wil.map((w) => [w.hid, w]));
  const ids = wil.map((w) => w.hid);
  const p = pilih(ds, outcome, K);
  const { kEfektif, terdampak } = p;

  // Monte Carlo koefisien per RS (tidak untuk penyakit model gabungan).
  const sd = hinge ? null : sdShrunk(rr, outcome);
  const adaMC = !!sd && kEfektif > 0;
  if (adaMC) {
    const g = rng(20261113);
    const draws: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
    const masuk: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const cur: Record<string, number> = {};
    for (let t = 0; t < nMC; t++) {
      for (const id of ids) {
        const b = m.b_per_rs[id][outcome] + (sd![id] ?? 0) * g();
        const { y, l } = mcData[id];
        let a = 0;
        for (let j = 0; j < y.length; j++) a += y[j] * (1 - Math.exp(b * l[j]));
        cur[id] = a; draws[id].push(a);
      }
      for (const id of topK(terdampak, (x) => cur[x], kEfektif)) masuk[id]++;
    }
    for (const id of ids) {
      const q = draws[id].sort((a, b) => a - b);
      by[id].lo = q[Math.floor(0.05 * nMC)]; by[id].hi = q[Math.floor(0.95 * nMC)];
      by[id].peluang = masuk[id] / nMC;
    }
  }

  const total = ids.reduce((a, id) => a + Math.max(0, by[id].av[outcome]), 0);
  const jumlah = (sel: string[]) => ({ kasus: sel.reduce((a, id) => a + by[id].av[outcome], 0), beban: sel.reduce((a, id) => a + by[id].beban, 0) });
  const labelJauh = s.jenis === "batas" ? "Paling Jauh Melewati Batas" : "Paling Besar Bebannya";
  const cara: Cara[] = [{ id: "model", label: "Pilihan Model", pilih: p.model, ...jumlah(p.model) }];
  if (sama(p.kotor, p.jauh)) cara.push({ id: "jauh", label: `Paling Kotor Rata-Rata (= ${labelJauh})`, pilih: p.jauh, ...jumlah(p.jauh) });
  else cara.push({ id: "jauh", label: labelJauh, pilih: p.jauh, ...jumlah(p.jauh) }, { id: "kotor", label: "Paling Kotor Rata-Rata", pilih: p.kotor, ...jumlah(p.kotor) });
  const terkuat = kEfektif ? cara.slice(1).reduce((a, b) => (b.kasus > a.kasus ? b : a)) : null;

  // Kurva manfaat: porsi kumulatif untuk 1..jumlah wilayah terdampak.
  const urut = (score: (id: string) => number) => [...ids].sort((a, b) => score(b) - score(a));
  const kum = (order: string[]) => { let c = 0; return terdampak.map((_, i) => { c += by[order[i]].av[outcome]; return total ? c / total : 0; }); };
  const kurva = {
    model: kum(urut((x) => (by[x].beban > 1e-9 ? by[x].av[outcome] : -Infinity))),
    jauh: kum(urut((x) => by[x].beban)),
    kotor: kum(urut((x) => by[x].pmMean)),
  };

  // Bulan manfaat dari pilihan model.
  const perBulan: Record<string, number> = {};
  for (const id of p.model) for (const [mm, v] of Object.entries(by[id].bulan)) perBulan[mm] = (perBulan[mm] ?? 0) + v;
  const tb = Object.values(perBulan).reduce((a, v) => a + Math.max(0, v), 0);
  const bulan = Object.keys(perBulan).filter((mm) => tb > 0 && perBulan[mm] / tb >= 0.05).sort();

  // Uji koefisien gabungan: pilihan tetap sama berapa?
  const gab = topK(terdampak, (x) => by[x].avGab, kEfektif);
  const gabSama = hinge || !kEfektif ? null : gab.filter((x) => p.model.includes(x)).length;

  wil.sort((a, b) => b.av[outcome] - a.av[outcome]);
  return { wilayah: wil, terdampak: terdampak.length, kEfektif, total, cara, terkuat, adaMC, hinge, kurva, bulan, gabSama };
}

/** Pasangan penjelas (blok 3): beban mirip, hasil per µg paling berbeda. */
export function pasanganPenjelas(r: HasilPrioritas, outcome: string): { a: Wilayah; b: Wilayah } | null {
  if (r.hinge) return null;
  const ws = r.wilayah.filter((w) => w.beban > 1e-9 && w.av[outcome] > 0);
  const pick = new Set(r.cara[0].pilih);
  let best: { a: Wilayah; b: Wilayah; s: number } | null = null;
  for (const a of ws) {
    if (!pick.has(a.hid)) continue;
    for (const b of ws) {
      if (pick.has(b.hid)) continue;
      const rb = a.beban / b.beban;
      if (rb < 0.6 || rb > 1.67) continue;
      const s = (a.av[outcome] / a.beban) / (b.av[outcome] / b.beban);
      if (s > 1.5 && (!best || s > best.s)) best = { a, b, s };
    }
  }
  return best ? { a: best.a, b: best.b } : null;
}
