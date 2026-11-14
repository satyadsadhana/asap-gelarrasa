#!/usr/bin/env python3
"""Prakiraan PM2.5 harian 1–7 hari ke depan untuk dashboard ASAP (v4).

Model berjalan sekali, hasilnya disimpan sebagai JSON; dashboard hanya membaca.

Alur
  1. Kalender harian lengkap per stasiun. Semua fitur memakai data s.d. hari terbit (t).
  2. Uji berjalan (rolling origin) bulanan: latih hanya dengan target yang sudah diketahui
     sebelum tanggal terbit, ramal sebulan berikutnya, geser, ulangi.
       - 2025 = validasi: penyetelan Optuna, kalibrasi rentang, bobot peluang
       - 2026 = uji: dilaporkan apa adanya
  3. Pembanding: menyalin hari ini, SES, drift, naif musiman, Ridge (AR), klimatologi, LightGBM murni.
  4. Rentang 80% per stasiun x musim x horizon; peluang > 55 = gabungan model dan pola musiman.
  5. Uji ketahanan: Diebold-Mariano (koreksi HLN) + Holm, bootstrap blok, uji tanda,
     sensitivitas bobot, Kupiec, skor Winkler, keandalan peluang, kejadian lonjakan unik.
  6. Model final dilatih dengan seluruh data; ramalan diterbitkan dari tanggal data terakhir.

Keputusan desain (bukti: docs/konsep/KONSEP_FINAL_PRAKIRAAN_PM25.md)
  - Target = perubahan log dari hari ini; fitur hanya pergerakan relatif. Fitur tingkat, musim,
    cuaca, kimia, dan tetangga sudah diuji dan tidak menambah akurasi 2026 (fitur musim menghafal).
  - Huber loss; hasil akhir = rata-rata model dan menyalin hari ini (bobot 0,5, lihat sensitivitas).
  - KTG-01 dan KTG-02 nyaris identik (korelasi 1,00): bobot latih masing-masing 0,5.
  - Ramalan hanya terbit bila >= 4 dari 7 hari terakhir sah.
  - Dataset berganti tingkat pada tanggal 1 tiap bulan; struktur ini sengaja TIDAK dimanfaatkan.

Pemakaian
  python -B scripts/prakiraan/prakiraan.py                 # dari root repo, ±10 menit
  python -B scripts/prakiraan/prakiraan.py --pakai-setelan # lewati Optuna, pakai setelan JSON lama

Sumber data: data_notebook/ (keluaran preprocessing/preprocess_notebook.py),
sama dengan sumber angka seluruh dashboard.
"""
from __future__ import annotations

import argparse
import json
import time
import warnings
from pathlib import Path

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
from scipy import stats
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")
optuna.logging.set_verbosity(optuna.logging.WARNING)

HZ = list(range(1, 8))
HZ_PANJANG = [1, 7, 14, 30, 45, 60, 78]   # hanya untuk membuktikan batas horizon
BATAS = 55.0
L55 = float(np.log1p(BATAS))
MIN_HARI = 365                     # stasiun dengan hari sah lebih sedikit tidak diramal
MIN_7 = 4                          # ramalan terbit bila >= 4 dari 7 hari terakhir sah
SATUAN_ASUMSI = {"MDN-01", "PSW-01", "BJB-01"}
KEMBAR = {"KTG-01", "KTG-02"}      # sinyal nyaris identik: bobot latih 0,5, dihitung sekali di judul
BULAN_MUSIM = (7, 8, 9, 10)
BOBOT = 0.5
SEED = 2026
ALFA = 0.2                         # rentang 80%

FITUR = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d14", "d30", "dm3", "dm7", "dm30", "sd7"]
PARAM_AWAL = dict(n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=40,
                  subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0, objective="huber")
rng = np.random.default_rng(SEED)
ex = np.expm1


# ---------------------------------------------------------------- data
def muat(path: Path) -> pd.DataFrame:
    """Panel RS x hari; satu stasiun bisa dipasangkan dengan lebih dari satu RS, jadi diambil unik."""
    d = pd.read_csv(path, encoding="utf-8-sig", low_memory=False, usecols=["date", "kode_stasiun", "pm25"])
    d = d.dropna(subset=["kode_stasiun"])
    d["date"] = pd.to_datetime(d["date"])
    dup = d.groupby(["kode_stasiun", "date"])["pm25"].nunique()
    if (dup > 1).any():
        raise ValueError(f"PM2.5 berbeda untuk stasiun-tanggal yang sama: {dup[dup > 1].head().to_dict()}")
    return d.drop_duplicates(["kode_stasiun", "date"])


def nama_stasiun(path: Path) -> dict[str, str]:
    try:
        return {s["code"]: s["nama"] for s in json.loads(path.read_text(encoding="utf-8"))["stasiun"]}
    except (OSError, KeyError, ValueError):
        return {}


def bangun(d: pd.DataFrame, hz=HZ) -> pd.DataFrame:
    """Satu baris per (stasiun, tanggal terbit t). Semua fitur memakai data <= t."""
    ujung = d["date"].max()
    parts = []
    for code, g in d.groupby("kode_stasiun"):
        g = g.set_index("date").sort_index()
        idx = pd.date_range(g.index.min(), ujung, freq="D")
        y = g["pm25"].reindex(idx).astype(float)
        ly = np.log1p(y)
        f = pd.DataFrame(index=idx)
        f["code"] = code
        f["y"] = y
        f["ly0"] = ly
        f["n7"] = y.rolling(7, min_periods=1).count()
        f["tenang"] = (y.rolling(7, min_periods=5).max() <= BATAS)
        for L in (1, 2, 3, 4, 5, 6, 7, 14, 30):
            f[f"d{L}"] = ly.shift(L) - ly
        for w, mp in ((3, 2), (7, 4), (30, 15)):
            f[f"dm{w}"] = ly.rolling(w, min_periods=mp).mean() - ly
        f["sd7"] = ly.rolling(7, min_periods=4).std()
        for h in hz:
            f[f"t{h}"] = ly.shift(-h)
            f[f"g{h}"] = ly.shift(-h) - ly
        parts.append(f)
    F = pd.concat(parts)
    F.index.name = "tgl"
    F = F.reset_index()
    F["w"] = np.where(F["code"].isin(KEMBAR), 0.5, 1.0)
    return F


def peluang_bulan(d: pd.DataFrame, sebelum: str) -> dict:
    """Peluang historis PM2.5 > 55 per (stasiun, bulan) dari data sebelum tanggal tertentu."""
    x = d[(d["date"] < sebelum) & d["pm25"].notna()]
    return x.assign(m=x["date"].dt.month).groupby(["kode_stasiun", "m"])["pm25"].apply(
        lambda s: float((s > BATAS).mean())).to_dict()


# ---------------------------------------------------------------- model
def klimatologi(train: pd.DataFrame) -> dict[str, np.ndarray]:
    """Rata-rata log PM2.5 per stasiun per hari-tahun, dihaluskan ±7 hari (melingkar)."""
    out = {}
    k = np.ones(15) / 15
    for code, g in train.dropna(subset=["ly0"]).groupby("code"):
        doy = g["tgl"].dt.dayofyear.clip(upper=365).values - 1
        s = np.bincount(doy, weights=g["ly0"].values, minlength=365)
        n = np.bincount(doy, minlength=365).astype(float)
        sm = np.convolve(np.tile(s, 3), k, "same")[365:730]
        nm = np.convolve(np.tile(n, 3), k, "same")[365:730]
        prof = np.where(nm > 0, sm / np.maximum(nm, 1e-9), np.nan)
        out[str(code)] = np.where(np.isnan(prof), np.nanmean(g["ly0"]), prof)
    return out


def latih_lgb(tr: pd.DataFrame, h: int, p: dict) -> lgb.LGBMRegressor:
    t = tr.dropna(subset=[f"g{h}"])
    m = lgb.LGBMRegressor(**p, subsample_freq=1, random_state=SEED, n_jobs=4, verbose=-1)
    m.fit(t[FITUR], t[f"g{h}"], sample_weight=t["w"])
    return m


def latih_ridge(tr: pd.DataFrame, h: int):
    t = tr.dropna(subset=[f"g{h}"])
    mu, sd = t[FITUR].mean(), t[FITUR].std().replace(0, 1)
    m = Ridge(alpha=1.0).fit(((t[FITUR] - mu) / sd).fillna(0), t[f"g{h}"], sample_weight=t["w"])
    return lambda D: D["ly0"].values + m.predict(((D[FITUR] - mu) / sd).fillna(0))


def gabung(ly0, delta, bobot: float = BOBOT):
    """Prakiraan akhir (log) = rata-rata berbobot model dan menyalin hari ini."""
    return ly0 + bobot * delta


def tabel_bulan(F: pd.DataFrame) -> dict:
    """Log median PM2.5 per (stasiun, tahun, bulan) dari panel. Dipakai lapis transisi bulan."""
    x = F[F["y"] > 0].dropna(subset=["y"])
    g = x.groupby(["code", x["tgl"].dt.year, x["tgl"].dt.month])["y"].median()
    return {k: float(np.log(v)) for k, v in g.items()}


def rasio_transisi(L: dict, code: str, t: pd.Timestamp, tt: pd.Timestamp):
    """Lapis transisi bulan: selisih log level bulan target dan bulan asal, diambil dari pasangan
    bulan yang sama setahun sebelumnya (analog). Hanya memakai data sebelum t. None bila tak ada."""
    if tt.month == t.month and tt.year == t.year:
        return None
    ya_t = tt.year - 1
    ya_o = t.year - 1 if t.year == tt.year else tt.year - 2
    a, b = L.get((code, ya_o, t.month)), L.get((code, ya_t, tt.month))
    if a is None or b is None:
        return None
    return b - a


def mu_transisi(L: dict, codes, tgls, h: int, ly0, mu_gab):
    """Untuk tanggal target yang pindah bulan, pakai lapis transisi; selainnya model gabungan."""
    mu = np.array(mu_gab, dtype=float).copy()
    lintas = np.zeros(len(mu), dtype=bool)
    for i, (c, t) in enumerate(zip(codes, tgls)):
        t = pd.Timestamp(t)
        tt = t + pd.Timedelta(days=h)
        if tt.month == t.month:
            continue
        lintas[i] = True
        r = rasio_transisi(L, c, t, tt)
        if r is not None and not np.isnan(ly0[i]):
            mu[i] = ly0[i] + r
    return mu, lintas


def uji_berjalan(F: pd.DataFrame, mulai: str, akhir: str, p: dict, pembanding: bool, langkah: int = 1, hz=HZ) -> pd.DataFrame:
    """Refit tiap `langkah` bulan. Untuk horizon h, latih hanya baris dengan t+h <= hari sebelum terbit."""
    akhir_data = F["tgl"].max()
    L = tabel_bulan(F)
    hasil = []
    for o in pd.date_range(mulai, akhir, freq=f"{langkah}MS"):
        nxt = min(o + pd.offsets.MonthBegin(langkah), akhir_data + pd.Timedelta(days=1))
        te = F[(F["tgl"] >= o) & (F["tgl"] < nxt) & F["ly0"].notna() & (F["n7"] >= MIN_7)]
        if te.empty:
            continue
        clim = klimatologi(F[F["tgl"] < o]) if pembanding else None
        for h in hz:
            tr = F[F["tgl"] <= o - pd.Timedelta(days=h + 1)]
            delta = latih_lgb(tr, h, p).predict(te[FITUR])
            ly0 = te["ly0"].values
            mu, lintas = mu_transisi(L, te["code"].values, pd.to_datetime(te["tgl"]).values, h, ly0, gabung(ly0, delta))
            r = pd.DataFrame({"code": te["code"].values, "tgl": te["tgl"].values, "h": h,
                              "mu": mu, "lintas": lintas, "mu_gab": gabung(ly0, delta), "mu_lgb": ly0 + delta,
                              "akt": te[f"t{h}"].values, "pers": ly0, "tenang": te["tenang"].values})
            if pembanding:
                r["lin"] = latih_ridge(tr, h)(te)
                tgt = (te["tgl"] + pd.Timedelta(days=h)).dt.dayofyear.clip(upper=365).values - 1
                r["klim"] = [clim.get(c, np.full(365, np.nan))[i] for c, i in zip(r["code"], tgt)]
            hasil.append(r)
    R = pd.concat(hasil, ignore_index=True)
    R = R[R["akt"].notna()].reset_index(drop=True)
    R["tgl"] = pd.to_datetime(R["tgl"])
    R["musim"] = R["tgl"].dt.month.isin(BULAN_MUSIM)
    return R


def mae(a, b) -> float:
    return float(np.mean(np.abs(ex(np.asarray(a)) - ex(np.asarray(b)))))


# ---------------------------------------------------------------- penyetelan
def setel(F: pd.DataFrame, n_trial: int) -> tuple[dict, list]:
    """Optuna di validasi 2025 (refit per kuartal agar cepat). Sasaran: MAE LightGBM sendiri."""
    def obj(trial: optuna.Trial) -> float:
        p = dict(
            n_estimators=trial.suggest_int("n_estimators", 150, 700, step=50),
            learning_rate=trial.suggest_float("learning_rate", 0.015, 0.12, log=True),
            num_leaves=trial.suggest_int("num_leaves", 7, 63),
            min_child_samples=trial.suggest_int("min_child_samples", 20, 300),
            subsample=trial.suggest_float("subsample", 0.6, 1.0),
            colsample_bytree=trial.suggest_float("colsample_bytree", 0.5, 1.0),
            reg_lambda=trial.suggest_float("reg_lambda", 1e-3, 20, log=True),
            objective=trial.suggest_categorical("objective", ["huber", "regression", "regression_l1"]),
        )
        R = uji_berjalan(F, "2025-01-01", "2025-10-01", p, pembanding=False, langkah=3)
        return float(np.mean([mae(g["mu_lgb"], g["akt"]) for _, g in R.groupby("h")]))

    st = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=SEED))
    st.enqueue_trial(PARAM_AWAL)
    st.optimize(obj, n_trials=n_trial)
    jejak = [{"trial": t.number, "mae": round(t.value, 3)} for t in st.trials if t.value is not None]
    return dict(st.best_params), jejak


# ---------------------------------------------------------------- rentang dan peluang
class Kalibrasi:
    """Rentang 80% per stasiun x musim x horizon dan peluang > 55 gabungan, dari validasi 2025."""

    def __init__(self, V: pd.DataFrame, d: pd.DataFrame):
        V = V.assign(r=V["akt"] - V["mu"])
        mad = lambda s: float(np.median(np.abs(s - np.median(s)))) + 1e-4
        self.sk_glob = {(int(h), bool(m)): mad(g["r"]) for (h, m), g in V.groupby(["h", "musim"])}
        self.sk = {(c, int(h), bool(m)): mad(g["r"]) for (c, h, m), g in V.groupby(["code", "h", "musim"]) if len(g) >= 30}
        V["z"] = V["r"] / [self.skala(c, h, m) for c, h, m in zip(V["code"], V["h"], V["musim"])]
        if "lintas" not in V:
            V["lintas"] = False
        # kuantil terpisah untuk hari lintas bulan (galatnya lebih lebar); kembali ke kuantil biasa bila sampel < 100
        self.z = {(int(h), bool(m)): g["z"].values for (h, m), g in V.groupby(["h", "musim"])}
        for (h, m, l), g in V.groupby(["h", "musim", "lintas"]):
            if len(g) >= 100:
                self.z[(int(h), bool(m), bool(l))] = g["z"].values
        self.q = {k: (float(np.quantile(v, ALFA / 2)), float(np.quantile(v, 1 - ALFA / 2))) for k, v in self.z.items()}
        # bobot gabungan peluang per horizon: dipilih di 2025, pola musiman dari data sebelum 2025
        pb = peluang_bulan(d, "2025-01-01")
        self.bobot_p = {}
        for h, g in V.groupby("h"):
            pm, pk, o = self.p_model(g), self.p_musim(g, pb), (g["akt"] > L55).values.astype(float)
            ws = np.linspace(0, 1, 21)
            self.bobot_p[int(h)] = float(ws[np.argmin([np.mean((w * pm + (1 - w) * pk - o) ** 2) for w in ws])])

    def kunci(self, h, m, l=False):
        k = (int(h), bool(m), bool(l))
        return k if k in self.q else (int(h), bool(m))

    def skala(self, c, h, m) -> float:
        return self.sk.get((c, int(h), bool(m)), self.sk_glob[(int(h), bool(m))])

    def rentang(self, D: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        ls = D["lintas"] if "lintas" in D else [False] * len(D)
        k = np.array([self.skala(c, h, m) for c, h, m in zip(D["code"], D["h"], D["musim"])])
        lo = np.array([self.q[self.kunci(h, m, l)][0] for h, m, l in zip(D["h"], D["musim"], ls)])
        hi = np.array([self.q[self.kunci(h, m, l)][1] for h, m, l in zip(D["h"], D["musim"], ls)])
        return D["mu"].values + lo * k, D["mu"].values + hi * k

    def p_model(self, D: pd.DataFrame) -> np.ndarray:
        out = []
        ls = D["lintas"] if "lintas" in D else [False] * len(D)
        for c, h, m, mu, l in zip(D["code"], D["h"], D["musim"], D["mu"], ls):
            out.append(float(np.mean(self.z[self.kunci(h, m, l)] * self.skala(c, h, m) > L55 - mu)))
        return np.array(out)

    @staticmethod
    def p_musim(D: pd.DataFrame, pb: dict) -> np.ndarray:
        bl = (pd.to_datetime(D["tgl"]) + pd.to_timedelta(D["h"], unit="D")).dt.month
        return np.array([pb.get((c, m), 0.0) for c, m in zip(D["code"], bl)])

    def peluang(self, D: pd.DataFrame, pb: dict) -> np.ndarray:
        w = np.array([self.bobot_p[int(h)] for h in D["h"]])
        return w * self.p_model(D) + (1 - w) * self.p_musim(D, pb)

    def tabel(self, codes) -> dict:
        """Rentang log (bawah, atas) per stasiun -> [musim, luar musim] -> horizon, untuk dihitung di browser."""
        out = {}
        for c in codes:
            out[c] = {}
            for m, nm in ((True, "musim"), (False, "luar")):
                for l, suf in ((False, ""), (True, "_lintas")):
                    out[c][nm + suf] = [[round(self.q[self.kunci(h, m, l)][0] * self.skala(c, h, m), 4),
                                         round(self.q[self.kunci(h, m, l)][1] * self.skala(c, h, m), 4)] for h in HZ]
        return out


def kelas(p: float) -> str:
    return "tinggi" if p > 0.7 else "sedang" if p >= 0.3 else "rendah"


# ---------------------------------------------------------------- uji statistik
def hln_dm(e_pemb: np.ndarray, e_model: np.ndarray, tgl, h: int) -> tuple[float, float]:
    """Diebold-Mariano dengan koreksi Harvey-Leybourne-Newbold; selisih dirata-rata per tanggal, varians HAC lag h-1."""
    dd = pd.Series(e_pemb - e_model, index=pd.to_datetime(tgl)).groupby(level=0).mean()
    n = len(dd)
    x = (dd - dd.mean()).values
    gam = [np.sum(x[k:] * x[:n - k]) / n for k in range(h)]
    var = (gam[0] + 2 * sum(gam[1:])) / n
    dm = dd.mean() / np.sqrt(var)
    kor = np.sqrt((n + 1 - 2 * h + h * (h - 1) / n) / n)
    st = float(dm * kor)
    return st, float(2 * stats.t.sf(abs(st), n - 1))


def holm(p: list[float]) -> list[float]:
    order = np.argsort(p)
    out, run = [0.0] * len(p), 0.0
    for r, i in enumerate(order):
        run = max(run, min(1.0, (len(p) - r) * p[i]))
        out[i] = run
    return out


def boot_ci(g: pd.DataFrame, a: str, b: str, B: int = 2000) -> list[float]:
    """Selang 95% untuk 1 - sum(a)/sum(b), bootstrap blok 7 hari."""
    G = g.groupby("tgl")[[a, b]].sum()
    days = G.index.values
    blocks = [days[i:i + 7] for i in range(0, len(days), 7)]
    sk = []
    for _ in range(B):
        pick = np.concatenate([blocks[i] for i in rng.integers(0, len(blocks), len(blocks))])
        s = G.loc[pick].sum()
        sk.append(1 - s[a] / s[b])
    return [round(float(v), 3) for v in np.percentile(sk, [2.5, 97.5])]


def kupiec(x: int, n: int, p: float) -> float | None:
    if x in (0, n):
        return None
    ph = x / n
    lr = -2 * ((n - x) * np.log(1 - p) + x * np.log(p) - (n - x) * np.log(1 - ph) - x * np.log(ph))
    return float(stats.chi2.sf(lr, 1))


def wilson(k: int, n: int, z: float = 1.96) -> list[float]:
    if n == 0:
        return [0.0, 1.0]
    p = k / n
    dn = 1 + z * z / n
    c = (p + z * z / (2 * n)) / dn
    hw = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / dn
    return [round(c - hw, 3), round(c + hw, 3)]


def ses(v: np.ndarray, a: float) -> np.ndarray:
    out, s = np.full(len(v), np.nan), np.nan
    for i, x in enumerate(v):
        if not np.isnan(x):
            s = x if np.isnan(s) else a * x + (1 - a) * s
        out[i] = s
    return out


def tambah_pembanding(T: pd.DataFrame, F: pd.DataFrame) -> tuple[pd.DataFrame, float]:
    """SES (alfa dipilih di 2024), drift 7 hari, naif musiman (364 hari lalu)."""
    W = F.pivot(index="tgl", columns="code", values="ly0")
    m24 = W.index < "2025-01-01"

    def err(a):
        e = []
        for c in W.columns:
            s, y = ses(W[c].values, a)[m24], W[c].values[m24]
            e.append(np.nanmean(np.abs(ex(s[:-1]) - ex(y[1:]))))
        return np.nanmean(e)
    alfa = min([0.3, 0.5, 0.7, 0.85, 0.95, 1.0], key=err)
    S = pd.DataFrame({c: ses(W[c].values, alfa) for c in W.columns}, index=W.index).stack()
    Ws = W.stack()
    look = lambda M, tg: M.reindex(list(zip(tg, T["code"]))).values
    tg = pd.to_datetime(T["tgl"])
    T = T.copy()
    T["ses"] = look(S, tg)
    T["sn"] = look(Ws, tg + pd.to_timedelta(T["h"], unit="D") - pd.Timedelta(days=364))
    T["drift"] = T["pers"] + T["h"] * (T["pers"] - look(Ws, tg - pd.Timedelta(days=7))) / 7
    return T, alfa


def akurasi(T: pd.DataFrame, V: pd.DataFrame, kal: Kalibrasi, pb_uji: dict, F: pd.DataFrame) -> dict:
    """Semua angka akurasi dan uji ketahanan untuk tab Akurasi dan dokumen konsep."""
    T, alfa = tambah_pembanding(T, F)
    W = F.pivot(index="tgl", columns="code", values="y")
    skala_mase = {c: float(np.nanmean(np.abs(np.diff(W.loc[:"2025-12-31", c].values)))) for c in W.columns}
    lo, hi = kal.rentang(T)
    T["lo"], T["hi"] = lo, hi
    T["p"] = kal.peluang(T, pb_uji)
    T["pk"] = kal.p_musim(T, pb_uji)
    rows, pv = [], []
    for h, g in T.groupby("h"):
        g = g.copy()
        a = ex(g["akt"].values)
        e = lambda col: np.abs(ex(g[col].values) - a)
        g["em"], g["ep"] = e("mu"), e("pers")
        r = {"h": int(h), "n": int(len(g))}
        for nm, col in (("model", "mu"), ("lgb", "mu_lgb"), ("salin", "pers"), ("ses", "ses"), ("ridge", "lin"),
                        ("drift", "drift"), ("naif_musiman", "sn"), ("klimatologi", "klim")):
            v = e(col)
            r[f"mae_{nm}"] = round(float(np.nanmean(v)), 2)
        r["rmse_model"] = round(float(np.sqrt(np.mean((ex(g["mu"]) - a) ** 2))), 2)
        r["rmse_salin"] = round(float(np.sqrt(np.mean((ex(g["pers"]) - a) ** 2))), 2)
        r["rasio_fairmode"] = round(r["rmse_model"] / r["rmse_salin"], 3)
        sc = g["code"].map(skala_mase).values
        r["mase_model"] = round(float(np.mean(g["em"] / sc)), 3)
        r["mase_salin"] = round(float(np.mean(g["ep"] / sc)), 3)
        r["skill"] = round(1 - g["em"].mean() / g["ep"].mean(), 3)
        r["skill_ci"] = boot_ci(g, "em", "ep")
        r["dm"], p = hln_dm(g["ep"].values, g["em"].values, g["tgl"].values, int(h))
        r["dm"] = round(r["dm"], 2)
        pv.append(p)
        st = g.groupby("code").apply(lambda x: x["em"].mean() < x["ep"].mean())
        r["stasiun_menang"] = [int(st.sum()), int(len(st))]
        r["p_tanda"] = round(float(stats.binomtest(int(st.sum()), len(st), 0.5, alternative="greater").pvalue), 5)
        bl = g.groupby(g["tgl"].dt.month).apply(lambda x: x["em"].mean() < x["ep"].mean())
        r["bulan_menang"] = [int(bl.sum()), int(len(bl))]
        ms = g["musim"].values
        r["skill_musim"] = round(1 - g["em"][ms].mean() / g["ep"][ms].mean(), 3) if ms.any() else None
        r["skill_luar"] = round(1 - g["em"][~ms].mean() / g["ep"][~ms].mean(), 3) if (~ms).any() else None
        # rentang
        L, U = ex(g["lo"].values), ex(g["hi"].values)
        ins = (a >= L) & (a <= U)
        r["cakupan80"] = round(float(ins.mean()), 3)
        r["cakupan80_musim"] = round(float(ins[ms].mean()), 3) if ms.any() else None
        lt = g["lintas"].values.astype(bool) if "lintas" in g else np.zeros(len(g), bool)
        r["cakupan80_lintas"] = round(float(ins[lt].mean()), 3) if lt.any() else None
        r["cakupan80_biasa"] = round(float(ins[~lt].mean()), 3) if (~lt).any() else None
        r["kupiec_p"] = kupiec(int((~ins).sum()), len(ins), ALFA)
        r["winkler"] = round(float(np.mean((U - L) + (2 / ALFA) * (L - a) * (a < L) + (2 / ALFA) * (a - U) * (a > U))), 2)
        pc = pd.Series(ins).groupby(g["code"].values).mean()
        r["stasiun_cakupan_70_90"] = [int(((pc >= .7) & (pc <= .9)).sum()), int(len(pc))]
        r["lebar80_musim"] = round(float(np.median((U - L)[ms])), 1) if ms.any() else None
        r["lebar80_luar"] = round(float(np.median((U - L)[~ms])), 1) if (~ms).any() else None
        # peluang dan kejadian > 55
        o = (a > BATAS).astype(float)
        g["bm"], g["bk"] = (g["p"] - o) ** 2, (g["pk"] - o) ** 2
        r["bss"] = round(1 - g["bm"].mean() / g["bk"].mean(), 3)
        r["bss_ci"] = boot_ci(g, "bm", "bk")
        r["bobot_peluang"] = kal.bobot_p[int(h)]
        al = g["p"].values >= 0.5
        r["kejadian55"] = int(o.sum())
        r["tangkap55"] = round(float(al[o == 1].mean()), 3) if o.sum() else None
        r["presisi55"] = round(float(o[al].mean()), 3) if al.any() else None
        lonjak = a > ex(g["pers"].values) * 1.25
        r["n_naik25"] = int(lonjak.sum())
        r["bias_naik25_model"] = round(float(np.mean((ex(g["mu"].values) - a)[lonjak])), 1) if lonjak.any() else None
        r["bias_naik25_salin"] = round(float(np.mean((ex(g["pers"].values) - a)[lonjak])), 1) if lonjak.any() else None
        rows.append(r)
    for r, p, ph in zip(rows, pv, holm(pv)):
        r["p_dm"], r["p_holm"] = round(p, 5), round(ph, 5)
        r["nyata"] = bool(ph < 0.05)
    # keandalan peluang
    kd = []
    for h in (1, 7):
        g = T[T["h"] == h]
        o = (g["akt"] > L55).astype(float)
        b = pd.cut(g["p"], [-.01, .1, .3, .5, .7, .9, 1.01], labels=["0–10", "10–30", "30–50", "50–70", "70–90", "90–100"])
        t = pd.DataFrame({"b": b, "p": g["p"], "o": o}).groupby("b", observed=True).agg(n=("o", "size"), dikatakan=("p", "mean"), terjadi=("o", "mean"))
        kd.append({"h": h, "kelas": [{"kelas": str(i), "n": int(x.n), "dikatakan": round(float(x.dikatakan), 3),
                                       "terjadi": round(float(x.terjadi), 3)} for i, x in t.iterrows()]})
    # sensitivitas bobot gabungan
    sens = []
    for w in (0, 0.25, 0.5, 0.75, 1.0):
        s = {"bobot": w}
        for nm, R in (("validasi", V), ("uji", T)):
            s[nm] = []
            for h in (1, 3, 7):
                g = R[R["h"] == h]
                mu = g["pers"] + w * (g["mu_lgb"] - g["pers"])
                s[nm].append(round(1 - mae(mu, g["akt"]) / mae(g["pers"], g["akt"]), 3))
        sens.append(s)
    return {"per_horizon": rows, "keandalan": kd, "sensitivitas_bobot": sens, "ses_alfa": alfa}, T


def kejadian_lonjakan(d: pd.DataFrame, pb_uji: dict, codes, mulai: str, akhir: pd.Timestamp) -> dict:
    """Awal lonjakan unik: > 55, >= 1,5x rata-rata 7 hari sebelumnya, setelah 7 hari <= 55."""
    akt = d.pivot_table(index="date", columns="kode_stasiun", values="pm25")
    ev = []
    for c in codes:
        y = akt[c]
        for i in range(7, len(y)):
            t = y.index[i]
            if t < pd.Timestamp(mulai) or np.isnan(y.iloc[i]):
                continue
            prev = y.iloc[i - 7:i]
            if y.iloc[i] > BATAS and (prev <= BATAS).all() and prev.notna().sum() >= 5 and y.iloc[i] >= 1.5 * prev.mean():
                ev.append({"code": c, "tgl": t.strftime("%Y-%m-%d"), "nilai": round(float(y.iloc[i]), 1),
                           "siaga": bool(pb_uji.get((c, t.month), 0) >= 0.5)})
    hit = sum(e["siaga"] for e in ev)
    # hari siaga yang tidak diikuti lonjakan dalam 7 hari
    tot = fa = 0
    for c in codes:
        y = akt[c]
        for t in y[mulai:akhir - pd.Timedelta(days=7)].index:
            w = y[t - pd.Timedelta(days=6):t]
            if (w <= BATAS).all() and w.notna().sum() >= 5 and pb_uji.get((c, (t + pd.Timedelta(days=7)).month), 0) >= 0.5:
                tot += 1
                fa += int(not (y[t + pd.Timedelta(days=1):t + pd.Timedelta(days=7)] > BATAS).any())
    return {"kejadian": ev, "tertangkap": int(hit), "jumlah": len(ev), "wilson95": wilson(int(hit), len(ev)),
            "hari_siaga": tot, "siaga_tanpa_lonjakan": fa}


def struktur_bulanan(d: pd.DataFrame) -> dict:
    """Bukti dataset berganti tingkat pada tanggal 1 (tidak dimanfaatkan model)."""
    x = d.dropna(subset=["pm25"]).sort_values(["kode_stasiun", "date"]).copy()
    x["lch"] = x.groupby("kode_stasiun")["pm25"].transform(lambda s: np.log(s.clip(lower=0.1)).diff().abs())
    x["t1"] = x["date"].dt.day == 1
    besar = x[x["lch"] > 0.4]
    ev = []
    for c, g in x.groupby("kode_stasiun"):
        y = g.set_index("date")["pm25"]
        for i in range(7, len(y)):
            p = y.iloc[i - 7:i]
            if y.iloc[i] > BATAS and (p <= BATAS).all() and y.iloc[i] >= 1.5 * p.mean():
                ev.append(y.index[i])
    return {"ubah_tgl1": round(float(x.loc[x["t1"], "lch"].mean()), 3), "ubah_lain": round(float(x.loc[~x["t1"], "lch"].mean()), 3),
            "lonjakan_besar": int(len(besar)), "lonjakan_besar_tgl1": int(besar["t1"].sum()),
            "awal_lonjakan": len(ev), "awal_lonjakan_tgl1": int(sum(t.day == 1 for t in ev)),
            "median_ubah_harian_pct": round(float(x.groupby("kode_stasiun")["pm25"].pct_change().abs().median() * 100), 2),
            "autokorelasi_lag1": round(float(x.groupby("kode_stasiun")["pm25"].apply(lambda s: s.autocorr(1)).median()), 3)}


def kualitas(d: pd.DataFrame, akhir: pd.Timestamp, root: Path, codes_uji: set, T: pd.DataFrame) -> list[dict]:
    """Tabel kualitas data per stasiun untuk tab Kualitas Data."""
    try:
        log = pd.read_csv(root / "data_notebook/log_preprocessing.csv").set_index("kode_stasiun")
    except OSError:
        log = pd.DataFrame()
    try:
        alat = pd.read_csv(root / "data_notebook/master_stasiun.csv").set_index("kode_stasiun")["pm25_equipment"]
    except (OSError, KeyError):
        alat = pd.Series(dtype=str)
    out = []
    for c, g in d.groupby("kode_stasiun"):
        y = g.set_index("date")["pm25"].reindex(pd.date_range("2024-01-01", akhir, freq="D"))
        ok = y.notna().values
        runs, cur = [], 0
        for v in ok:
            if not v:
                cur += 1
            else:
                if cur:
                    runs.append(cur)
                cur = 0
        if cur:
            runs.append(cur)
        a = str(alat.get(c, ""))
        jenis = "BAM" if "BAM" in a else "sensor murah" if "Aeroqual" in a else "optik" if a else "?"
        t1 = T[(T["code"] == c) & (T["h"] == 1)]
        lencana = []
        if c in SATUAN_ASUMSI: lencana.append("satuan asumsi")
        if c in KEMBAR: lencana.append("sinyal kembar")
        if jenis in ("optik", "sensor murah"): lencana.append(jenis)
        jb = int(log.loc[c, "jam_beku_pm25"]) if c in log.index else 0
        ji = int(log.loc[c, "jam_pm25_diinterpolasi"]) if c in log.index else 0
        if jb > 0: lencana.append("pernah beku")
        if ji > 2000: lencana.append("banyak interpolasi")
        if 0 < ok.mean() < 0.95: lencana.append("data bolong")
        out.append({"code": c, "hari_sah": int(ok.sum()), "cakupan": round(float(ok.mean()), 3),
                    "cakupan_2026": round(float(y["2026"].notna().mean()), 3), "celah_terpanjang": max(runs) if runs else 0,
                    "sah_7_terakhir": int(y.iloc[-7:].notna().sum()), "alat": a.replace("_", " "), "jenis_alat": jenis,
                    "jam_beku": jb, "jam_interpolasi": ji, "diramal": c in codes_uji, "lencana": lencana,
                    "skill_h1": round(1 - mae(t1["mu"], t1["akt"]) / mae(t1["pers"], t1["akt"]), 3) if len(t1) else None,
                    "cakupan80_h1": round(float(((t1["akt"] >= t1["lo"]) & (t1["akt"] <= t1["hi"])).mean()), 3) if len(t1) else None})
    return sorted(out, key=lambda r: r["cakupan"])


# ---------------------------------------------------------------- utama
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", default="data_notebook/panel_harian.csv")
    ap.add_argument("--keluar", default="public/data")
    ap.add_argument("--trial", type=int, default=30)
    ap.add_argument("--pakai-setelan", action="store_true", help="lewati Optuna, pakai setelan di prakiraan_verifikasi.json")
    a = ap.parse_args()
    t0 = time.time()
    root = Path(a.panel).resolve().parent.parent
    out = Path(a.keluar)

    d = muat(Path(a.panel))
    hari = d.dropna(subset=["pm25"]).groupby("kode_stasiun").size()
    nama = nama_stasiun(out / "stations.json")
    pakai = sorted(hari[hari >= MIN_HARI].index)
    dikecualikan = [{"code": c, "alasan": f"hanya {int(hari.get(c, 0))} hari data sah"}
                    for c in sorted(set(d["kode_stasiun"]) - set(pakai))]
    F = bangun(d[d["kode_stasiun"].isin(pakai)])
    akhir = F["tgl"].max()
    print(f"[data] {len(pakai)} stasiun, {len(F):,} baris, s.d. {akhir.date()}", flush=True)

    # 1. penyetelan (validasi 2025)
    lama = out / "prakiraan_verifikasi.json"
    if a.pakai_setelan and lama.exists():
        st = json.loads(lama.read_text(encoding="utf-8"))["setelan"]
        best, jejak, n_trial = st["terbaik"], st["jejak"], st["percobaan"]
        print(f"[setel] memakai setelan lama: {best}", flush=True)
    else:
        best, jejak = setel(F, a.trial)
        n_trial = a.trial
        print(f"[setel] {a.trial} percobaan, MAE {jejak[0]['mae']:.3f} -> {min(j['mae'] for j in jejak):.3f}  ({time.time()-t0:.0f}s)", flush=True)

    # 2. validasi 2025 -> kalibrasi; 3. uji 2026
    V = uji_berjalan(F, "2025-01-01", "2025-12-01", best, pembanding=True)
    kal = Kalibrasi(V, d)
    T = uji_berjalan(F, "2026-01-01", akhir.strftime("%Y-%m-01"), best, pembanding=True)
    pb_uji = peluang_bulan(d, "2026-01-01")
    akur, T = akurasi(T, V, kal, pb_uji, F)
    Vr = akurasi(V.copy(), V, kal, peluang_bulan(d, "2025-01-01"), F)[0]["per_horizon"]
    print(f"[uji] selesai ({time.time()-t0:.0f}s)", flush=True)
    for r in akur["per_horizon"]:
        print(f"  h{r['h']}: MAE {r['mae_model']} vs salin {r['mae_salin']} skill {r['skill']:+.3f} {r['skill_ci']} "
              f"p_holm {r['p_holm']} stasiun {r['stasiun_menang']} | cakupan {r['cakupan80']} | BSS {r['bss']} {r['bss_ci']}", flush=True)

    # 4. horizon panjang (bukti batas 7 hari)
    Fp = bangun(d[d["kode_stasiun"].isin(pakai)], HZ_PANJANG)
    Tp = uji_berjalan(Fp, "2026-01-01", akhir.strftime("%Y-%m-01"), best, pembanding=True, hz=HZ_PANJANG)
    panjang = []
    for h, g in Tp.groupby("h"):
        panjang.append({"h": int(h), "mae_model": round(mae(g["mu"], g["akt"]), 2), "mae_salin": round(mae(g["pers"], g["akt"]), 2),
                        "mae_klimatologi": round(float(np.nanmean(np.abs(ex(g["klim"]) - ex(g["akt"])))), 2)})
    print(f"[horizon panjang] {panjang}  ({time.time()-t0:.0f}s)", flush=True)

    # 5. kejadian lonjakan, struktur dataset, kualitas
    lonjak = kejadian_lonjakan(d, pb_uji, pakai, "2026-01-08", akhir)
    struktur = struktur_bulanan(d)
    print(f"[lonjakan] {lonjak['tertangkap']}/{lonjak['jumlah']} {lonjak['wilson95']}; struktur {struktur}", flush=True)

    # 6. model final -> ramalan terbit
    final = {h: latih_lgb(F, h, best) for h in HZ}
    pb_kini = peluang_bulan(d, f"{akhir.year}-01-01")
    now = F[F["tgl"] == akhir]
    L_kini = tabel_bulan(F)
    musim_kini = akhir.month in BULAN_MUSIM
    stasiun = []
    for _, row in now.iterrows():
        code = str(row["code"])
        if pd.isna(row["ly0"]) or row["n7"] < MIN_7:
            last = d[(d["kode_stasiun"] == code) & d["pm25"].notna()]["date"].max()
            dikecualikan.append({"code": code, "alasan": f"data kurang: {int(row['n7'])} dari 7 hari terakhir sah (data terakhir {last:%Y-%m-%d})"})
            continue
        X = now[now["code"] == code]
        mus = []
        for h in HZ:
            mu_h, _ = mu_transisi(L_kini, [code], [akhir], h, X["ly0"].values, gabung(X["ly0"].values, final[h].predict(X[FITUR])))
            mus.append(float(mu_h[0]))
        D = pd.DataFrame({"code": code, "tgl": akhir, "h": HZ, "musim": musim_kini, "mu": mus,
                          "lintas": [(akhir + pd.Timedelta(days=h)).month != akhir.month for h in HZ]})
        lo, hi = kal.rentang(D)
        p = kal.peluang(D, pb_kini)
        hist = F[(F["code"] == code) & (F["tgl"] > akhir - pd.Timedelta(days=30))]
        siaga = bool(row["tenang"]) and pb_kini.get((code, (akhir + pd.Timedelta(days=7)).month), 0) >= 0.5
        bulan_depan = akhir + pd.Timedelta(days=7)
        r_lalu = rasio_transisi(L_kini, code, akhir, bulan_depan) if bulan_depan.month != akhir.month else None
        stasiun.append({"code": code, "nama": nama.get(code, code), "satuan_asumsi": code in SATUAN_ASUMSI,
                        "rasio_bulan_lalu": None if r_lalu is None else round(float(np.exp(r_lalu)), 2),
                        "kembar": code in KEMBAR, "siaga": siaga, "hari_ini": round(float(row["y"]), 1),
                        "riwayat": [None if pd.isna(v) else round(float(v), 1) for v in hist["y"]],
                        "hari": [{"tgl": (akhir + pd.Timedelta(days=h)).strftime("%Y-%m-%d"), "h": h,
                                  "nilai": round(float(ex(D["mu"][i])), 1), "lo": round(float(ex(lo[i])), 1),
                                  "hi": round(float(ex(hi[i])), 1), "p55": round(float(p[i]), 3), "kelas": kelas(float(p[i]))}
                                 for i, h in enumerate(HZ)]})
    stasiun.sort(key=lambda s: (-max(x["p55"] for x in s["hari"]), -s["hari"][0]["nilai"]))
    # hitung judul: kembar dihitung sekali
    risiko = {("KTG" if s["kembar"] else s["code"]) for s in stasiun if max(x["p55"] for x in s["hari"]) >= 0.5}
    risiko_besok = {("KTG" if s["kembar"] else s["code"]) for s in stasiun if s["hari"][0]["p55"] >= 0.5}

    # 7. arsip Putar Ulang 2026: prakiraan bulat per tanggal terbit, peluang (persen), siaga
    tgl_uji = pd.date_range("2026-01-01", akhir - pd.Timedelta(days=1), freq="D")
    arsip = {}
    Tg = T.set_index(["code", "tgl", "h"]).sort_index()
    Fi = F.set_index(["code", "tgl"])
    for c in pakai:
        if c not in Tg.index.get_level_values(0):
            continue
        tc = Tg.loc[c]
        nil, pel, sg = [], [], []
        for t in tgl_uji:
            vs, ps = [], []
            for h in HZ:
                if (t, h) in tc.index:
                    r = tc.loc[(t, h)]
                    vs.append(int(round(float(ex(r["mu"]))))); ps.append(int(round(float(r["p"]) * 100)))
                else:
                    vs.append(None); ps.append(None)
            nil.append(vs); pel.append(ps)
            ten = bool(Fi.loc[(c, t), "tenang"]) if (c, t) in Fi.index else False
            sg.append(1 if ten and pb_uji.get((c, (t + pd.Timedelta(days=7)).month), 0) >= 0.5 else 0)
        y = F[(F["code"] == c) & (F["tgl"] >= "2026-01-01")].set_index("tgl")["y"].reindex(pd.date_range("2026-01-01", akhir, freq="D"))
        arsip[c] = {"nilai": nil, "peluang": pel, "siaga": sg,
                    "aktual": [None if pd.isna(v) else int(round(float(v))) for v in y]}

    # 8. pola November-Desember (tahun sebelumnya)
    nd = d[d["date"].dt.month.isin([11, 12]) & d["kode_stasiun"].isin(pakai)]
    pola_nd = [{"code": c, "rata": round(float(g["pm25"].mean()), 1), "p55": round(float((g["pm25"] > BATAS).mean()), 3),
                "tahun": sorted(g["date"].dt.year.unique().tolist())}
               for c, g in nd.dropna(subset=["pm25"]).groupby("kode_stasiun")]

    meta = {"versi": 6, "terbit": akhir.strftime("%Y-%m-%d"), "batas": BATAS, "horizon": len(HZ), "bobot_model": BOBOT,
            "model": "Rata-rata LightGBM (target perubahan log, fitur relatif, Huber) dan menyalin nilai hari ini",
            "rentang": "80%, per stasiun x musim x horizon, dari uji berjalan 2025",
            "peluang": "gabungan peluang model dan pola musiman per stasiun-bulan; bobot per horizon dipilih di 2025",
            "musim_kini": musim_kini}
    (out / "prakiraan_pm25.json").write_text(json.dumps({
        **meta, "judul_risiko": len(risiko), "risiko_besok": len(risiko_besok),
        "nyata_sampai": max([r["h"] for r in akur["per_horizon"] if r["nyata"]], default=0),
        "stasiun": stasiun, "dikecualikan": dikecualikan}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "prakiraan_verifikasi.json").write_text(json.dumps({
        **meta,
        "uji": {"periode": f"2026-01-01 s.d. {akhir:%Y-%m-%d}", "cara": "uji berjalan, refit tiap awal bulan", **akur},
        "validasi": {"periode": "2025", "per_horizon": Vr},
        "horizon_panjang": panjang,
        "lonjakan": lonjak,
        "struktur_bulanan": struktur,
        "kualitas": kualitas(d, akhir, root, set(s["code"] for s in stasiun), T),
        "pola_nov_des": pola_nd,
        "setelan": {"percobaan": n_trial, "terbaik": best, "jejak": jejak},
        "fitur": FITUR,
        "musim_rata": {str(y): round(float(F[(F["tgl"].dt.year == y) & F["tgl"].dt.month.isin(BULAN_MUSIM)]["y"].mean()), 1)
                       for y in sorted(F["tgl"].dt.year.unique())},
    }, ensure_ascii=False, separators=(",", ":"), default=str), encoding="utf-8")
    (out / "prakiraan_arsip.json").write_text(json.dumps({
        "mulai": "2026-01-01", "rentang": kal.tabel(pakai), "stasiun": arsip,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[tulis] {len(stasiun)} stasiun diramal, {len(dikecualikan)} dikecualikan  ({time.time()-t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
