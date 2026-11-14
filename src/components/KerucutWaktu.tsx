import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { FlyToInterpolator, type LayersList, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer, LineLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { ISPU_3D } from "./Stage3D";
import { ispuCat, ISPU_LAB } from "../lib/theme";
import { fmt, UG } from "../lib/format";

/**
 * Kerucut Waktu: peta ruang-waktu untuk Prakiraan 7 Hari.
 * Ketinggian = hari ke depan (tanah = hari terbit, puncak = H+7). Tiap stasiun punya 8 cakram bertumpuk:
 * luas cakram sebanding dengan PM2.5, warna = kategori ISPU, cincin tipis = batas atas rentang 80%.
 * Kerucut yang melebar ke atas = memburuk. Mode Putar Ulang menambah titik putih = nilai yang benar-benar terjadi.
 * Komponen terpisah dari Stage3D (peta bab lain tidak disentuh); hanya palet ISPU yang dipakai bersama.
 */

export type Kerucut = {
  code: string; nama: string; lon: number; lat: number;
  /** H0 (terukur saat terbit) lalu H+1..H+7 */
  nilai: (number | null)[];
  atas: (number | null)[];
  aktual?: (number | null)[];
  siaga?: boolean;
  label?: string | null;
};

type Props = {
  data: Kerucut[];
  hari: number;
  onPick?: (code: string) => void;
  pilih?: string | null;
  height?: number;
  fallback?: React.ReactNode;
};

const STEP = 52000;               // meter per hari pada sumbu tegak
const R = (v: number) => Math.min(130000, 4600 * Math.sqrt(Math.max(v, 0)) + 6000); // luas ~ nilai
const VIEW: MapViewState = { longitude: 112.5, latitude: -6.6, zoom: 4.05, pitch: 58, bearing: -8 };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let geoCache: Promise<unknown> | null = null;
const loadGeo = () => (geoCache ??= fetch("/data/indonesia.geojson").then((r) => (r.ok ? r.json() : null)).catch(() => null));
let _gl: boolean | null = null;
function webglOk() {
  if (_gl != null) return _gl;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    _gl = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { _gl = false; }
  return _gl;
}

type Disc = { k: Kerucut; i: number; v: number; atas: number | null; akt: number | null };

export default function KerucutWaktu({ data, hari, onPick, pilih, height = 520, fallback }: Props) {
  const [ok] = useState(webglOk);
  const [geo, setGeo] = useState<unknown>(null);
  const narrow = typeof innerWidth !== "undefined" ? Math.max(-1.2, Math.log2(Math.min(1, innerWidth / 1180))) : 0;
  const target = { ...VIEW, zoom: VIEW.zoom + narrow, pitch: narrow < -0.5 ? 50 : VIEW.pitch };
  const [vs, setVs] = useState<MapViewState>({ ...target, zoom: target.zoom - 0.5, pitch: 20, bearing: -30 });
  const [denyut, setDenyut] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { loadGeo().then(setGeo); }, []);
  useEffect(() => {
    setVs({ ...target, transitionDuration: reduced() ? 0 : 2000, transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }) });
  }, [target.zoom, target.pitch]); // eslint-disable-line react-hooks/exhaustive-deps
  // denyut cincin Kalender Siaga (dimatikan bila pengguna memilih gerak minimal)
  useEffect(() => {
    if (reduced() || !data.some((d) => d.siaga)) return;
    let raf = 0;
    const tick = (t: number) => { setDenyut((t / 1400) % 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data]);
  // lepas konteks WebGL saat dicopot (pola yang sama dengan Stage3D)
  useEffect(() => {
    const el = box.current;
    return () => {
      const cs = el ? [...el.querySelectorAll("canvas")] : [];
      setTimeout(() => {
        if (el?.isConnected) return;
        cs.forEach((c) => { try { (c.getContext("webgl2") as WebGL2RenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* abaikan */ } });
      }, 0);
    };
  }, []);

  const discs = useMemo<Disc[]>(() => data.flatMap((k) => k.nilai.map((v, i) => (v == null ? null : { k, i, v, atas: k.atas[i], akt: k.aktual?.[i] ?? null })).filter(Boolean) as Disc[]), [data]);
  const poros = useMemo(() => data.filter((k) => k.nilai.some((v) => v != null)), [data]);
  const tinggi = 7 * STEP;

  if (!ok) return <>{fallback ?? null}</>;

  const layers = [
    geo && new GeoJsonLayer({
      id: "darat", data: geo as never, filled: true, stroked: true,
      getFillColor: [26, 52, 66, 255], getLineColor: [110, 180, 196, 120], lineWidthMinPixels: 0.5,
    }),
    // bidang kaca: mengiris hari terpilih
    new PolygonLayer({
      id: "kaca", data: [{ z: hari * STEP }], pickable: false, stroked: true, filled: true,
      getPolygon: (d: { z: number }) => [[94, -11.5, d.z], [142, -11.5, d.z], [142, 6.5, d.z], [94, 6.5, d.z]],
      getFillColor: [200, 236, 242, 22], getLineColor: [200, 236, 242, 110], lineWidthMinPixels: 1,
      parameters: { depthWriteEnabled: false }, updateTriggers: { getPolygon: [hari] },
      transitions: { getPolygon: reduced() ? 0 : 450 },
    }),
    new LineLayer<Kerucut>({
      id: "poros", data: poros,
      getSourcePosition: (k) => [k.lon, k.lat, 0], getTargetPosition: (k) => [k.lon, k.lat, tinggi],
      getColor: (k) => (k.code === pilih ? [255, 255, 255, 220] : [190, 214, 222, 90]), getWidth: (k) => (k.code === pilih ? 2 : 1),
      widthUnits: "pixels", updateTriggers: { getColor: [pilih], getWidth: [pilih] },
    }),
    // cincin Kalender Siaga di tanah
    new ScatterplotLayer<Kerucut>({
      id: "siaga", data: data.filter((k) => k.siaga), stroked: true, filled: false,
      getPosition: (k) => [k.lon, k.lat, 200], radiusUnits: "meters",
      getRadius: 60000 + 30000 * denyut, lineWidthMinPixels: 2.5,
      getLineColor: [246, 160, 60, Math.round(230 * (1 - denyut))], updateTriggers: { getRadius: [denyut], getLineColor: [denyut] },
    }),
    // batas atas rentang 80%
    new ScatterplotLayer<Disc>({
      id: "rentang", data: discs.filter((d) => d.i > 0 && d.atas != null), stroked: true, filled: false,
      getPosition: (d) => [d.k.lon, d.k.lat, d.i * STEP], radiusUnits: "meters", getRadius: (d) => R(d.atas ?? d.v),
      lineWidthMinPixels: 1, getLineColor: (d) => (d.i === hari ? [255, 255, 255, 200] : [255, 255, 255, 70]),
      updateTriggers: { getLineColor: [hari] }, parameters: { depthWriteEnabled: false },
    }),
    new ScatterplotLayer<Disc>({
      id: "cakram", data: discs, pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 80],
      getPosition: (d) => [d.k.lon, d.k.lat, d.i * STEP], radiusUnits: "meters", getRadius: (d) => R(d.v),
      stroked: true, lineWidthMinPixels: 0.8, getLineColor: [10, 24, 34, 160],
      getFillColor: (d) => [...ISPU_3D[ispuCat(d.v)], d.i === hari ? 245 : d.i === 0 ? 150 : 95] as [number, number, number, number],
      updateTriggers: { getFillColor: [hari] }, parameters: { depthWriteEnabled: false },
      transitions: { getRadius: reduced() ? 0 : 500, getFillColor: reduced() ? 0 : 250 },
      onClick: (i: PickingInfo<Disc>) => { if (i.object) onPick?.(i.object.k.code); },
    }),
    // titik putih: yang benar-benar terjadi (Putar Ulang)
    new ScatterplotLayer<Disc>({
      id: "aktual", data: discs.filter((d) => d.i > 0 && d.akt != null), billboard: true,
      getPosition: (d) => [d.k.lon + 0.0001, d.k.lat, d.i * STEP], radiusUnits: "pixels", getRadius: (d) => (d.i === hari ? 5 : 3.2),
      getFillColor: [255, 255, 255, 255], stroked: true, getLineColor: [10, 24, 34, 255], lineWidthMinPixels: 1,
      updateTriggers: { getRadius: [hari] }, parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
    new TextLayer<Kerucut>({
      id: "nama", data: data.filter((k) => k.label),
      getPosition: (k) => [k.lon, k.lat, tinggi + 26000], getText: (k) => k.label ?? "",
      getSize: 12.5, getColor: [240, 246, 248, 255], fontWeight: 650, fontFamily: "Plus Jakarta Sans Variable, system-ui, sans-serif",
      background: true, getBackgroundColor: [10, 24, 34, 205], backgroundPadding: [6, 3], characterSet: "auto",
      fontSettings: { sdf: true, fontSize: 64, buffer: 6, radius: 12 }, billboard: true, getAlignmentBaseline: "bottom",
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
    // skala waktu di luar daratan (barat daya)
    new TextLayer<{ i: number }>({
      id: "skala", data: Array.from({ length: 8 }, (_, i) => ({ i })),
      getPosition: (d) => [96.2, -9.6, d.i * STEP], getText: (d) => (d.i === 0 ? "Hari terbit" : `H+${d.i}`),
      getSize: (d) => (d.i === hari ? 13 : 11), getColor: (d) => (d.i === hari ? [255, 255, 255, 255] : [170, 196, 204, 200]),
      fontWeight: 700, fontFamily: "Plus Jakarta Sans Variable, system-ui, sans-serif", characterSet: "auto",
      fontSettings: { sdf: true, fontSize: 64, buffer: 6, radius: 12 }, billboard: true, getTextAnchor: "end",
      updateTriggers: { getSize: [hari], getColor: [hari] }, parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
    new LineLayer<{ a: number }>({
      id: "skala-garis", data: [{ a: 0 }], getSourcePosition: () => [96.5, -9.6, 0], getTargetPosition: () => [96.5, -9.6, tinggi],
      getColor: [170, 196, 204, 160], getWidth: 1, widthUnits: "pixels",
    }),
  ].filter(Boolean);

  const tip = ({ object }: PickingInfo<Disc>) => {
    if (!object) return null;
    const { k, i, v, atas, akt } = object;
    const hdr = i === 0 ? "Terukur saat terbit" : `Prakiraan H+${i}`;
    return {
      html: `<b>${k.nama}</b><br/>${hdr}: <b>${fmt(v, 0)}</b> ${UG} · ${ISPU_LAB[ispuCat(v)]}` +
        (i > 0 && atas != null ? `<br/>Batas atas rentang 80%: ${fmt(atas, 0)}` : "") +
        (i > 0 && akt != null ? `<br/>Yang terjadi: <b>${fmt(akt, 0)}</b>` : ""),
      style: { background: "rgba(10,24,34,.92)", color: "#eef4f6", fontSize: "12px", borderRadius: "8px", padding: "8px 10px", fontFamily: "Plus Jakarta Sans Variable, system-ui, sans-serif" },
    };
  };

  return (
    <div className="stage3d kw" style={{ height }} ref={box}>
      <DeckGL
        viewState={vs}
        onViewStateChange={({ viewState }) => setVs(viewState as MapViewState)}
        controller={{ scrollZoom: false, dragRotate: true, touchRotate: true, inertia: true }}
        layers={layers as LayersList}
        getTooltip={tip as never}
        getCursor={({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab")}
      />
      <div className="stage-legend" aria-hidden>
        {ISPU_LAB.map((l, i) => <span key={l}><i style={{ background: `rgb(${ISPU_3D[i].join(",")})` }} />{l}</span>)}
      </div>
      <button className="stage-reset" onClick={() => setVs({ ...target, transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator() })}>
        ⟲ Sudut awal
      </button>
    </div>
  );
}
