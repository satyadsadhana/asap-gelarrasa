"""
Tambahan halaman Prakiraan v6 -> public/data/prakiraan_v6.json

Dijalankan setelah prakiraan.py (membaca keluarannya):
  1. Kalender musim per stasiun: median bulanan 2024-2026, bulan > 55, rasio bulan tertinggi / terendah.
  2. Uji tanda antarstasiun per horizon (dari stasiun_menang di prakiraan_verifikasi.json).
  3. Perkiraan kasus napas 7 hari per RS: rumus simulator (kasus x (PM baru / PM kini)^(b / ln 2)),
     dengan uji balik pada arsip Putar Ulang 2026.
  4. Jam terburuk besok: profil per jam 7 hari terakhir, dengan keandalan per stasiun dari 2026.

Jalankan dari akar repo:  python scripts/prakiraan/tambahan_v6.py
"""
from __future__ import annotations

import json
from math import comb
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DN, OUT = ROOT / "data_notebook", ROOT / "public" / "data"
BATAS = 55
PULAU = {"Aceh": "Sumatra", "Sumatera Utara": "Sumatra", "Sumatera Barat": "Sumatra", "Riau": "Sumatra", "Kepulauan Riau": "Sumatra",
         "Jambi": "Sumatra", "Sumatera Selatan": "Sumatra", "Bengkulu": "Sumatra", "Lampung": "Sumatra",
         "Kalimantan Barat": "Kalimantan", "Kalimantan Tengah": "Kalimantan", "Kalimantan Selatan": "Kalimantan", "Kalimantan Timur": "Kalimantan",
         "Jakarta": "Jawa", "Bogor": "Jawa", "Jawa Timur": "Jawa", "Yogyakarta": "Jawa",
         "Sulawesi Selatan": "Sulawesi dan Papua", "Sulawesi Tengah": "Sulawesi dan Papua", "Papua": "Sulawesi dan Papua",
         "Papua Barat Daya": "Sulawesi dan Papua"}


def r1(v, d=1):
    return None if v is None or pd.isna(v) else round(float(v), d)


def kalender(a: pd.DataFrame, master: pd.DataFrame) -> list[dict]:
    a = a.assign(y=a["tanggal"].dt.year, m=a["tanggal"].dt.month)
    L = a.groupby(["kode_stasiun", "y", "m"])["pm25"].median()
    a = a[a["pm25"].notna()]
    H = a.assign(atas=a["pm25"] > BATAS).groupby(["kode_stasiun", "y", "m"])["atas"].agg(["sum", "count"])
    out = []
    for c, row in master.set_index("kode_stasiun").iterrows():
        rec = {"code": c, "wilayah": row["region_group"], "pulau": PULAU.get(row["region_group"], "Lainnya"), "tahun": {}}
        for y in (2024, 2025, 2026):
            v = [r1(L.get((c, y, m))) for m in range(1, 13)]
            ok = [x for x in v if x is not None]
            hari = [[int(H.loc[(c, y, m), "sum"]), int(H.loc[(c, y, m), "count"])] if (c, y, m) in H.index else None for m in range(1, 13)]
            rec["tahun"][str(y)] = {"bulan": v, "hari55": hari, "lewat55": [m + 1 for m, x in enumerate(v) if x is not None and x > BATAS],
                                    "rasio": r1(max(ok) / min(ok)) if len(ok) >= 6 and min(ok) > 0 else None}
        b = [set(rec["tahun"][str(y)]["lewat55"]) for y in (2024, 2025)]
        rec["konsisten"] = b[0] == b[1]
        out.append(rec)
    return out


def musim(a: pd.DataFrame, akhir: pd.Timestamp) -> list[dict]:
    """Periode musim asap per stasiun per tahun: deretan hari PM2.5 > 55 (celah <= 10 hari digabung), yang terpanjang."""
    w = a.pivot_table(index="tanggal", columns="kode_stasiun", values="pm25").asfreq("D")
    out = []
    for c in w.columns:
        rec = {"code": c, "tahun": {}}
        for y in (2024, 2025, 2026):
            s = w[c][str(y)]
            s = s[s.index <= akhir]
            if s.notna().sum() < 60:
                rec["tahun"][str(y)] = None
                continue
            atas = s.gt(BATAS).astype(float).where(s.notna()).ffill(limit=3).fillna(0).astype(bool)
            hari = list(atas[atas].index)
            runs, mulai, prev = [], None, None
            for t in hari:
                if mulai is None:
                    mulai = t
                elif (t - prev).days > 10:
                    runs.append((mulai, prev)); mulai = t
                prev = t
            if mulai is not None:
                runs.append((mulai, prev))
            runs = [r for r in runs if (r[1] - r[0]).days >= 4]
            if not runs:
                rec["tahun"][str(y)] = {"mulai": None}
                continue
            m0, m1 = max(runs, key=lambda r: (r[1] - r[0]).days)
            seg = s[m0:m1]
            rec["tahun"][str(y)] = {"mulai": m0.strftime("%Y-%m-%d"), "akhir": m1.strftime("%Y-%m-%d"), "rata": r1(seg.mean(), 0),
                                    "hari": int((seg > BATAS).sum()), "berlanjut": bool(y == akhir.year and m1 == s.dropna().index.max())}
        if any(v and v.get("mulai") for v in rec["tahun"].values()):
            out.append(rec)
    return out


def uji_tanda(vf: dict) -> list[dict]:
    res = []
    for r in vf["uji"]["per_horizon"]:
        k, n = r["stasiun_menang"]
        p = min(1.0, 2 * sum(comb(n, i) for i in range(k, n + 1)) / 2 ** n)
        res.append({"h": r["h"], "menang": k, "n": n, "p": p})
    return res


def kasus_rs(panel: pd.DataFrame, md: dict, pk: dict, ar: dict, master: pd.DataFrame) -> dict:
    nama_rs = master.set_index("hospital_id")["nama_rumah_sakit"].to_dict()
    akhir = pd.Timestamp(pk["terbit"])
    prak = {s["code"]: s for s in pk["stasiun"]}
    per_rs, uji = [], []
    m0 = pd.Timestamp(ar["mulai"])
    for rs, g in panel.groupby("hospital_id"):
        c = g["kode_stasiun"].iloc[0]
        b = md["b_per_rs"].get(rs, {}).get("resp")
        if b is None:
            continue
        g = g.set_index("date").sort_index()
        r7 = g["resp"].rolling(7, min_periods=5).mean()
        pm7 = g["pm25"].rolling(7, min_periods=5).mean()
        e = b / np.log(2)
        if c in prak and akhir in g.index and not pd.isna(r7.get(akhir)) and not pd.isna(pm7.get(akhir)):
            base, pm = float(r7[akhir]), max(float(pm7[akhir]), 1.0)
            hari = [{"tgl": x["tgl"], "kasus": r1(base * (max(x["nilai"], 1) / pm) ** e),
                     "lo": r1(base * (max(x["lo"], 1) / pm) ** e), "hi": r1(base * (max(x["hi"], 1) / pm) ** e)} for x in prak[c]["hari"]]
            per_rs.append({"rs": rs, "nama": nama_rs.get(rs, rs), "code": c, "rata7": r1(base),
                           "riwayat": [r1(v) for v in g["resp"].loc[akhir - pd.Timedelta(days=29):akhir]], "hari": hari})
        s = ar["stasiun"].get(c)
        if not s:
            continue
        for i, v in enumerate(s["nilai"]):
            t = m0 + pd.Timedelta(days=i)
            if not v or v[0] is None or t not in g.index or pd.isna(r7.get(t)) or pd.isna(pm7.get(t)):
                continue
            for h in range(1, 8):
                tt = t + pd.Timedelta(days=h)
                if tt not in g.index or pd.isna(g["resp"][tt]) or v[h - 1] is None:
                    continue
                pr = r7[t] * (max(v[h - 1], 1) / max(pm7[t], 1)) ** e
                lompat = abs(np.log(max(g["pm25"].get(tt, np.nan), 1) / max(pm7[t], 1))) > 0.3
                uji.append((h, tt.month != t.month, bool(lompat), g["resp"][tt], r7[t], pr))
    U = pd.DataFrame(uji, columns=["h", "lintas", "lompat", "akt", "salin", "prak"]).dropna()

    def ring(S):
        e0, e1 = float(np.abs(S["salin"] - S["akt"]).mean()), float(np.abs(S["prak"] - S["akt"]).mean())
        return {"n": int(len(S)), "mae_rata7": round(e0, 2), "mae_prak": round(e1, 2), "turun": round(1 - e1 / e0, 3)}

    return {"rs": per_rs, "uji": {"semua": ring(U), "biasa": ring(U[~U["lintas"]]), "lintas": ring(U[U["lintas"]]),
                                  "lompat": ring(U[U["lompat"]])}}


def jam_terburuk(akhir: pd.Timestamp) -> list[dict]:
    h = pd.read_csv(DN / "aqms_per_jam.csv", usecols=["waktu", "kode_stasiun", "pm25"], parse_dates=["waktu"])
    h = h[h["pm25"] > 0]
    h["d"], h["j"] = h["waktu"].dt.normalize(), h["waktu"].dt.hour
    h["rel"] = h["pm25"] / h.groupby(["kode_stasiun", "d"])["pm25"].transform("mean")
    P = h.pivot_table(index=["kode_stasiun", "d"], columns="j", values="rel").dropna()
    out = []
    for c, g in P.groupby(level=0):
        g = g.droplevel(0).sort_index()
        prof = g.rolling(7).mean().shift(1)
        ok = prof.dropna().index.intersection(g.index)
        ok = ok[ok >= "2026-01-01"]
        if len(ok) < 30:
            continue
        benar = np.abs(g.loc[ok].values.argmax(1) - prof.loc[ok].values.argmax(1))
        benar = np.minimum(benar, 24 - benar) <= 1
        kini = g[g.index <= akhir].tail(7).mean()
        two = (kini + kini.shift(-1, fill_value=kini.iloc[0])).values
        buruk, bersih = int(np.argmax(two)), int(np.argmin(two))
        out.append({"code": c, "profil": [round(float(v), 3) for v in kini.values], "buruk": buruk, "bersih": bersih,
                    "andal": round(float(benar.mean()), 3), "n": int(len(ok))})
    return out


def main() -> None:
    master = pd.read_csv(DN / "master_stasiun.csv")
    a = pd.read_csv(DN / "aqms_harian.csv", parse_dates=["tanggal"])
    panel = pd.read_csv(DN / "panel_harian.csv", usecols=["date", "hospital_id", "kode_stasiun", "resp", "pm25"], parse_dates=["date"])
    pk = json.loads((OUT / "prakiraan_pm25.json").read_text(encoding="utf-8"))
    vf = json.loads((OUT / "prakiraan_verifikasi.json").read_text(encoding="utf-8"))
    ar = json.loads((OUT / "prakiraan_arsip.json").read_text(encoding="utf-8"))
    md = json.loads((OUT / "model_dampak.json").read_text(encoding="utf-8"))
    hasil = {"terbit": pk["terbit"], "kalender": kalender(a, master), "musim": musim(a, pd.Timestamp(pk["terbit"])), "uji_tanda": uji_tanda(vf),
             "kasus": kasus_rs(panel, md, pk, ar, master), "jam": jam_terburuk(pd.Timestamp(pk["terbit"]))}
    (OUT / "prakiraan_v6.json").write_text(json.dumps(hasil, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    k = hasil["kasus"]["uji"]
    print(f"[v6] kalender {len(hasil['kalender'])} stasiun | uji tanda {[(r['h'], r['menang'], r['p']) for r in hasil['uji_tanda']][:2]}")
    print(f"[v6] kasus RS: {len(hasil['kasus']['rs'])} RS | uji {k}")
    print(f"[v6] jam: {len(hasil['jam'])} stasiun, keandalan median {np.median([j['andal'] for j in hasil['jam']]):.2f}")


if __name__ == "__main__":
    main()
