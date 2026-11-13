#!/usr/bin/env python3
"""Prakiraan PM2.5 harian 1–7 hari ke depan untuk dashboard ASAP.

Model berjalan sekali, hasilnya disimpan sebagai JSON; dashboard hanya membaca.

Alur
  1. Kalender harian lengkap per stasiun. Semua fitur memakai data s.d. hari terbit (t).
  2. Uji berjalan (rolling origin) bulanan: latih hanya dengan target yang sudah diketahui
     sebelum tanggal terbit, ramal sebulan berikutnya, geser, ulangi.
       - 2025 = validasi: penyetelan Optuna dan kalibrasi rentang
       - 2026 = uji: dilaporkan apa adanya
  3. Pembanding: persistence (nilai hari ini), klimatologi per stasiun, Ridge.
  4. Rentang 80% dan peluang > 55 dari sebaran residu validasi, per horizon dan per musim.
  5. Model final dilatih dengan seluruh data; ramalan diterbitkan dari tanggal data terakhir.

Keputusan desain (dari analisis data, lihat docs/konsep/KONSEP_PRAKIRAAN_PM25_7_HARI.md)
  - Target = perubahan log dari hari ini, bukan nilainya. Model pohon tidak bisa menebak
    di atas nilai tertinggi yang pernah dilihat; musim asap 2026 jauh lebih tinggi.
  - Fitur hanya bentuk pergerakan relatif (lag dan rata-rata dikurangi hari ini). Fitur
    tingkat absolut, kode stasiun, kalender, dan cuaca membuat model menghafal musim
    2024–2025 ("kalau setinggi ini, besok turun") yang tidak berlaku di 2026.
  - Huber loss: tahan terhadap lonjakan ekstrem.
  - Hasil akhir = rata-rata model dan persistence (bobot 0,5). Kombinasi sederhana lebih
    tahan terhadap perubahan rezim daripada model tunggal.

Pemakaian
  python -B scripts/prakiraan/prakiraan.py            # dari root repo, ±10 menit

Sumber data: data_notebook/panel_harian.csv (keluaran preprocessing/preprocess_notebook.py),
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
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")
optuna.logging.set_verbosity(optuna.logging.WARNING)

HZ = list(range(1, 8))
BATAS = 55.0
MIN_HARI = 365                     # stasiun dengan hari sah lebih sedikit tidak diramal
SATUAN_ASUMSI = {"MDN-01", "PSW-01", "BJB-01"}
BULAN_MUSIM = (7, 8, 9, 10)        # rentang dihitung terpisah untuk musim asap
BOBOT = 0.5                        # bobot model dalam kombinasi dengan persistence
SEED = 2026

FITUR = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d14", "d30", "dm3", "dm7", "dm30", "sd7"]
PARAM_AWAL = dict(n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=40,
                  subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0, objective="huber")


# ---------------------------------------------------------------- data
def muat(path: Path) -> pd.DataFrame:
    """Panel RS × hari; satu stasiun bisa dipasangkan dengan lebih dari satu RS, jadi diambil unik."""
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


def bangun(d: pd.DataFrame) -> pd.DataFrame:
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
        for L in (1, 2, 3, 4, 5, 6, 7, 14, 30):
            f[f"d{L}"] = ly.shift(L) - ly
        for w, mp in ((3, 2), (7, 4), (30, 15)):
            f[f"dm{w}"] = ly.rolling(w, min_periods=mp).mean() - ly
        f["sd7"] = ly.rolling(7, min_periods=4).std()
        for h in HZ:
            f[f"t{h}"] = ly.shift(-h)              # log1p PM2.5 pada t+h
            f[f"g{h}"] = ly.shift(-h) - ly         # target model: perubahan dari hari ini
        parts.append(f)
    F = pd.concat(parts)
    F.index.name = "tgl"
    return F.reset_index()


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
    m.fit(t[FITUR], t[f"g{h}"])
    return m


def latih_ridge(tr: pd.DataFrame, h: int):
    t = tr.dropna(subset=[f"g{h}"])
    mu, sd = t[FITUR].mean(), t[FITUR].std().replace(0, 1)
    m = Ridge(alpha=1.0).fit(((t[FITUR] - mu) / sd).fillna(0), t[f"g{h}"])
    return lambda D: D["ly0"].values + m.predict(((D[FITUR] - mu) / sd).fillna(0))


def gabung(ly0: np.ndarray, delta: np.ndarray) -> np.ndarray:
    """Prakiraan akhir (log) = rata-rata berbobot model dan persistence."""
    return ly0 + BOBOT * delta


def uji_berjalan(F: pd.DataFrame, mulai: str, akhir: str, p: dict, pembanding: bool, langkah: int = 1) -> pd.DataFrame:
    """Refit tiap `langkah` bulan. Untuk horizon h, latih hanya baris dengan t+h <= hari sebelum terbit."""
    akhir_data = F["tgl"].max()
    hasil = []
    for o in pd.date_range(mulai, akhir, freq=f"{langkah}MS"):
        nxt = min(o + pd.offsets.MonthBegin(langkah), akhir_data + pd.Timedelta(days=1))
        te = F[(F["tgl"] >= o) & (F["tgl"] < nxt) & F["ly0"].notna()]
        if te.empty:
            continue
        clim = klimatologi(F[F["tgl"] < o]) if pembanding else None
        for h in HZ:
            tr = F[F["tgl"] <= o - pd.Timedelta(days=h + 1)]
            delta = latih_lgb(tr, h, p).predict(te[FITUR])
            ly0 = te["ly0"].values
            r = pd.DataFrame({"code": te["code"].values, "tgl": te["tgl"].values, "h": h,
                              "mu": gabung(ly0, delta), "mu_lgb": ly0 + delta,
                              "akt": te[f"t{h}"].values, "pers": ly0})
            if pembanding:
                r["lin"] = latih_ridge(tr, h)(te)
                tgt = (te["tgl"] + pd.Timedelta(days=h)).dt.dayofyear.clip(upper=365).values - 1
                r["klim"] = [clim.get(c, np.full(365, np.nan))[i] for c, i in zip(r["code"], tgt)]
            hasil.append(r)
    R = pd.concat(hasil, ignore_index=True)
    R = R[R["akt"].notna()].reset_index(drop=True)
    R["musim"] = pd.to_datetime(R["tgl"]).dt.month.isin(BULAN_MUSIM)
    return R


def mae(a, b) -> float:
    return float(np.mean(np.abs(np.expm1(np.asarray(a)) - np.expm1(np.asarray(b)))))


# ---------------------------------------------------------------- penyetelan
def setel(F: pd.DataFrame, n_trial: int) -> tuple[dict, list]:
    """Optuna di validasi 2025 (refit per kuartal agar cepat). Sasaran: MAE model sendiri."""
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


# ---------------------------------------------------------------- rentang dan metrik
def kuantil(V: pd.DataFrame) -> dict:
    """Sebaran residu log (aktual − prakiraan) per (horizon, musim) dari validasi."""
    out = {}
    for (h, m), g in V.groupby(["h", "musim"]):
        e = (g["akt"] - g["mu"]).values
        out[(int(h), bool(m))] = {"q10": float(np.quantile(e, 0.10)), "q90": float(np.quantile(e, 0.90)), "res": e}
    return out


def ringkas(R: pd.DataFrame, q: dict) -> list[dict]:
    out = []
    for h, g in R.groupby("h"):
        akt = np.expm1(g["akt"].values)
        mu = g["mu"].values
        pred = np.expm1(mu)
        lgbp = np.expm1(g["mu_lgb"].values)
        pers = np.expm1(g["pers"].values)
        ms = g["musim"].values
        q10 = np.array([q[(int(h), bool(m))]["q10"] for m in ms])
        q90 = np.array([q[(int(h), bool(m))]["q90"] for m in ms])
        lo, hi = np.expm1(mu + q10), np.expm1(mu + q90)
        a55, p55 = akt > BATAS, pred > BATAS
        tp = int((a55 & p55).sum())
        ab = lambda x, msk=slice(None): round(float(np.mean(np.abs(x[msk] - akt[msk]))), 2)
        r = {
            "h": int(h), "n": int(len(g)),
            "mae_model": ab(pred), "mae_lgb": ab(lgbp), "mae_persis": ab(pers),
            "rmse_model": round(float(np.sqrt(np.mean((pred - akt) ** 2))), 2),
            "rmse_persis": round(float(np.sqrt(np.mean((pers - akt) ** 2))), 2),
            "cakupan80": round(float(np.mean((akt >= lo) & (akt <= hi))), 3),
            "cakupan80_musim": round(float(np.mean(((akt >= lo) & (akt <= hi))[ms])), 3) if ms.any() else None,
            "presisi55": round(tp / max(1, int(p55.sum())), 3),
            "recall55": round(tp / max(1, int(a55.sum())), 3),
            "presisi55_persis": round(int((a55 & (pers > BATAS)).sum()) / max(1, int((pers > BATAS).sum())), 3),
            "recall55_persis": round(int((a55 & (pers > BATAS)).sum()) / max(1, int(a55.sum())), 3),
            "kejadian55": int(a55.sum()),
            "mae_musim_model": ab(pred, ms) if ms.any() else None,
            "mae_musim_persis": ab(pers, ms) if ms.any() else None,
            "mae_luar_model": ab(pred, ~ms) if (~ms).any() else None,
            "mae_luar_persis": ab(pers, ~ms) if (~ms).any() else None,
        }
        if "klim" in g:
            r["mae_klim"] = round(float(np.nanmean(np.abs(np.expm1(g["klim"].values) - akt))), 2)
            r["mae_linear"] = ab(np.expm1(g["lin"].values))
        sk = lambda a, b: None if a is None or not b else round(1 - a / b, 3)
        r["skill"] = sk(r["mae_model"], r["mae_persis"])
        r["skill_lgb"] = sk(r["mae_lgb"], r["mae_persis"])
        r["skill_musim"] = sk(r["mae_musim_model"], r["mae_musim_persis"])
        r["skill_luar"] = sk(r["mae_luar_model"], r["mae_luar_persis"])
        out.append(r)
    return out


def per_bulan(R: pd.DataFrame, hs=(1, 3, 7)) -> list[dict]:
    out = []
    R = R.assign(bln=pd.to_datetime(R["tgl"]).dt.strftime("%Y-%m"))
    for (b, h), g in R[R["h"].isin(hs)].groupby(["bln", "h"]):
        mm, mp = mae(g["mu"], g["akt"]), mae(g["pers"], g["akt"])
        out.append({"bulan": b, "h": int(h), "mae_model": round(mm, 2), "mae_persis": round(mp, 2),
                    "skill": round(1 - mm / mp, 3) if mp else None, "n": int(len(g)),
                    "rata_aktual": round(float(np.mean(np.expm1(g["akt"]))), 1)})
    return out


# ---------------------------------------------------------------- utama
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", default="data_notebook/panel_harian.csv")
    ap.add_argument("--keluar", default="public/data")
    ap.add_argument("--trial", type=int, default=30)
    a = ap.parse_args()
    t0 = time.time()

    d = muat(Path(a.panel))
    hari = d.dropna(subset=["pm25"]).groupby("kode_stasiun").size()
    nama = nama_stasiun(Path(a.keluar) / "stations.json")
    pakai = sorted(hari[hari >= MIN_HARI].index)
    dikecualikan = [{"code": c, "alasan": f"hanya {int(hari.get(c, 0))} hari data sah"}
                    for c in sorted(set(d["kode_stasiun"]) - set(pakai))]
    F = bangun(d[d["kode_stasiun"].isin(pakai)])
    akhir = F["tgl"].max()
    print(f"[data] {len(pakai)} stasiun, {len(F):,} baris, s.d. {akhir.date()}", flush=True)

    # 1. penyetelan (validasi 2025)
    best, jejak = setel(F, a.trial)
    print(f"[setel] {a.trial} percobaan, MAE awal {jejak[0]['mae']:.3f} -> terbaik {min(j['mae'] for j in jejak):.3f}: {best}  ({time.time()-t0:.0f}s)", flush=True)

    # 2. validasi 2025 -> kalibrasi rentang
    V = uji_berjalan(F, "2025-01-01", "2025-12-01", best, pembanding=True)
    q = kuantil(V)
    # 3. uji 2026
    T = uji_berjalan(F, "2026-01-01", akhir.strftime("%Y-%m-01"), best, pembanding=True)
    val, uji = ringkas(V, q), ringkas(T, q)
    for nm, rows in (("validasi 2025", val), ("uji 2026", uji)):
        print(f"[{nm}]")
        for r in rows:
            print(f"  h{r['h']}: MAE {r['mae_model']:.2f} (lgb {r['mae_lgb']:.2f}) vs persis {r['mae_persis']:.2f} "
                  f"skill {r['skill']:+.3f} | musim {r['skill_musim']} luar {r['skill_luar']} | cakupan {r['cakupan80']:.2f}"
                  f" (musim {r['cakupan80_musim']}) | recall55 {r['recall55']:.3f}/{r['recall55_persis']:.3f} "
                  f"presisi {r['presisi55']:.3f}/{r['presisi55_persis']:.3f} | linear {r['mae_linear']:.2f} klim {r['mae_klim']:.2f}")

    # 4. model final -> ramalan terbit
    final = {h: latih_lgb(F, h, best) for h in HZ}
    now = F[F["tgl"] == akhir]
    musim_kini = akhir.month in BULAN_MUSIM
    stasiun = []
    for _, row in now.iterrows():
        code = str(row["code"])
        if pd.isna(row["ly0"]):
            last = d[(d["kode_stasiun"] == code) & d["pm25"].notna()]["date"].max()
            dikecualikan.append({"code": code, "alasan": f"tidak ada data sah sejak {last.strftime('%Y-%m-%d')}"})
            continue
        X = now[now["code"] == code]
        hari_l = []
        for h in HZ:
            mu = float(gabung(X["ly0"].values, final[h].predict(X[FITUR]))[0])
            k = q[(h, musim_kini)]
            hari_l.append({
                "tgl": (akhir + pd.Timedelta(days=h)).strftime("%Y-%m-%d"), "h": h,
                "nilai": round(float(np.expm1(mu)), 1),
                "lo": round(float(np.expm1(mu + k["q10"])), 1),
                "hi": round(float(np.expm1(mu + k["q90"])), 1),
                "p55": round(float(np.mean(np.expm1(mu + k["res"]) > BATAS)), 3),
            })
        hist = F[(F["code"] == code) & (F["tgl"] > akhir - pd.Timedelta(days=30))]
        stasiun.append({"code": code, "nama": nama.get(code, code), "satuan_asumsi": code in SATUAN_ASUMSI,
                        "hari_ini": round(float(row["y"]), 1),
                        "riwayat": [None if pd.isna(v) else round(float(v), 1) for v in hist["y"]],
                        "hari": hari_l})
    stasiun.sort(key=lambda s: (-max(x["p55"] for x in s["hari"]), -s["hari"][0]["nilai"]))

    # 5. riwayat uji 2026 per stasiun: prakiraan H+1 dan H+3 vs aktual, disusun per tanggal sasaran
    riw = {}
    for code, g in T[T["h"].isin([1, 3])].groupby("code"):
        g = g.assign(tt=pd.to_datetime(g["tgl"]) + pd.to_timedelta(g["h"], unit="D"))
        piv = g.pivot_table(index="tt", columns="h", values="mu")
        ak = g.drop_duplicates("tt").set_index("tt")["akt"]
        idx = pd.date_range(piv.index.min(), piv.index.max(), freq="D")
        cv = lambda s: [None if pd.isna(v) else round(float(np.expm1(v)), 1) for v in s.reindex(idx)]
        riw[code] = {"mulai": idx[0].strftime("%Y-%m-%d"), "aktual": cv(ak),
                     "h1": cv(piv[1]) if 1 in piv else [None] * len(idx),
                     "h3": cv(piv[3]) if 3 in piv else [None] * len(idx)}

    per_st = []
    for code, g in T[T["h"] == 1].groupby("code"):
        mm, mp = mae(g["mu"], g["akt"]), mae(g["pers"], g["akt"])
        per_st.append({"code": code, "n": int(len(g)), "mae_model": round(mm, 2), "mae_persis": round(mp, 2),
                       "skill": round(1 - mm / mp, 3) if mp else None})

    out = Path(a.keluar)
    meta = {"terbit": akhir.strftime("%Y-%m-%d"), "batas": BATAS, "horizon": len(HZ), "bobot_model": BOBOT,
            "model": "Rata-rata LightGBM (target perubahan log, fitur relatif, Huber) dan persistence",
            "rentang": "80%, dari sebaran residu uji berjalan 2025, dipisah musim asap (Jul–Okt) dan di luar musim",
            "musim_kini": musim_kini}
    (out / "prakiraan_pm25.json").write_text(json.dumps({**meta, "stasiun": stasiun, "dikecualikan": dikecualikan},
                                                         ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "prakiraan_verifikasi.json").write_text(json.dumps({
        **meta,
        "uji": {"periode": f"2026-01-01 s.d. {akhir.strftime('%Y-%m-%d')}", "cara": "uji berjalan, refit tiap awal bulan",
                "per_horizon": uji, "per_bulan": per_bulan(T)},
        "validasi": {"periode": "2025", "per_horizon": val},
        "setelan": {"percobaan": a.trial, "terbaik": best, "jejak": jejak},
        "fitur": FITUR,
        "musim_rata": {str(y): round(float(F[(F["tgl"].dt.year == y) & F["tgl"].dt.month.isin(BULAN_MUSIM)]["y"].mean()), 1)
                       for y in sorted(F["tgl"].dt.year.unique())},
        "luar_musim_rata": {str(y): round(float(F[(F["tgl"].dt.year == y) & ~F["tgl"].dt.month.isin(BULAN_MUSIM)]["y"].mean()), 1)
                            for y in sorted(F["tgl"].dt.year.unique())},
        "per_stasiun": per_st,
        "riwayat": riw,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[tulis] {len(stasiun)} stasiun diramal, {len(dikecualikan)} dikecualikan  ({time.time()-t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
