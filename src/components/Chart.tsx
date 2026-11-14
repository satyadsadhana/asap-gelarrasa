import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { UI } from "../lib/theme";

const FONT = `${UI.fontBody ?? "'Fira Sans'"}, system-ui, sans-serif`;
const axis = {
  axisLine: { lineStyle: { color: "#cfcac0" } },
  axisTick: { lineStyle: { color: "#cfcac0" } },
  axisLabel: { color: UI.inkSoft, fontSize: 11 },
  splitLine: { lineStyle: { color: UI.line } },
  nameTextStyle: { color: UI.inkSoft, fontSize: 11 },
};
echarts.registerTheme("nn", {
  textStyle: { fontFamily: FONT, color: UI.ink },
  color: [UI.ink, UI.inkSoft],
  grid: { containLabel: true },
  categoryAxis: axis, valueAxis: axis, logAxis: axis, timeAxis: axis,
  legend: { textStyle: { color: UI.inkSoft, fontSize: 12 }, itemWidth: 14, itemHeight: 10 },
  tooltip: { backgroundColor: "#ffffff", borderColor: UI.line, textStyle: { color: UI.ink, fontSize: 13 }, extraCssText: "box-shadow:0 6px 20px rgba(0,0,0,.12);border-radius:8px;" },
  markLine: { label: { color: UI.inkSoft, fontSize: 11 } },
});

type Props = {
  option: EChartsOption;
  height?: number | string;
  onClick?: (p: echarts.ECElementEvent) => void;
  /** Dipanggil saat pengguna menggeser/zoom sumbu x: [indeks awal, indeks akhir]. */
  onZoom?: (range: [number, number]) => void;
  ariaLabel?: string;
  /** Tampilkan slider perbesar. Default: otomatis untuk grafik titik dan garis. */
  zoom?: boolean;
};

const angka = (v: unknown) => (typeof v === "number" ? v.toLocaleString("id-ID", { maximumFractionDigits: Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0 }) : "");

/** Grafik titik dan garis bisa di-zoom dengan cubit/gulir (sama seperti grafik "Asap Naik, Pasien Ikut Naik"). */
function bisaZoom(o: EChartsOption, z?: boolean) {
  if (z != null) return z;
  const ser = o.series;
  return !o.dataZoom && Array.isArray(ser) && ser.some((s: any) => s?.type === "scatter" || s?.type === "line") && !ser.some((s: any) => s?.coordinateSystem === "geo");
}
function denganZoom(o: EChartsOption, z?: boolean): EChartsOption {
  if (!bisaZoom(o, z)) return o;
  const nx = ([] as unknown[]).concat((o as any).xAxis ?? []).length || 1;
  const ys = ([] as any[]).concat((o as any).yAxis ?? []);
  const sebar = (o.series as any[]).some((s) => s?.type === "scatter");
  const dz: any[] = [{ type: "inside", xAxisIndex: Array.from({ length: nx }, (_, i) => i), filterMode: "none" }];
  // grafik titik: sumbu y ikut diperbesar (kecuali sumbu kategori atau berlabel khusus, mis. nama pulau)
  const yv = ys.map((y, i) => [y, i] as const).filter(([y]) => y?.type !== "category" && !y?.axisLabel?.formatter).map(([, i]) => i);
  if (sebar && yv.length) dz.push({ type: "inside", yAxisIndex: yv, filterMode: "none" });
  // saat di-zoom, ujung sumbu bisa pecahan (mis. 3.04): bulatkan label sumbu angka yang belum punya formatter
  const rapi = (ax: any) => (ax && ax.type !== "category" && !ax.axisLabel?.formatter ? { ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => angka(Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10) } } : ax);
  const tiap = (a: any) => (Array.isArray(a) ? a.map(rapi) : rapi(a));
  return { ...o, xAxis: tiap((o as any).xAxis), yAxis: tiap((o as any).yAxis), dataZoom: dz } as EChartsOption;
}

/** Batang tanpa label diberi angka kecil di ujungnya (kecuali batang bertumpuk). */
function labelBatang(o: EChartsOption): EChartsOption {
  const ser = o.series;
  if (!Array.isArray(ser)) return o;
  const yAxes = ([] as any[]).concat((o as any).yAxis ?? []);
  return { ...o, series: ser.map((s: any) => {
    if (s?.type !== "bar" || s.label || s.stack) return s;
    const horiz = yAxes[s.yAxisIndex ?? 0]?.type === "category";
    return { ...s, label: { show: true, position: horiz ? "right" : "top", fontSize: 10, color: UI.inkSoft, formatter: (p: any) => angka(Array.isArray(p.value) ? p.value[horiz ? 0 : 1] : p.value) } };
  }) } as EChartsOption;
}

export default function Chart({ option, height = 320, onClick, onZoom, ariaLabel, zoom }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;

  useEffect(() => {
    const c = echarts.init(el.current!, "nn", { renderer: "canvas" });
    inst.current = c;
    c.on("click", (p) => clickRef.current?.(p));
    c.on("datazoom", () => {
      const dz = (c.getOption() as any).dataZoom?.[0];
      if (dz && dz.startValue != null) zoomRef.current?.([dz.startValue, dz.endValue]);
    });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current!);
    return () => { ro.disconnect(); c.dispose(); };
  }, []);

  useEffect(() => {
    inst.current?.setOption(
      { animationDuration: 500, textStyle: { fontFamily: FONT }, ...denganZoom(labelBatang(option), zoom) } as EChartsOption,
      { notMerge: true },
    );
  }, [option]);

  // pembungkus selalu ada supaya kanvas ECharts tidak dibuat ulang saat jenis grafik berubah
  return (
    <div className="chart-zoom">
      <div ref={el} role="img" aria-label={ariaLabel} style={{ width: "100%", height }} />
      {bisaZoom(option, zoom) && <div className="chart-zoom-hint">
        <button onClick={() => inst.current?.dispatchAction({ type: "dataZoom", start: 0, end: 100 })}>Reset zoom</button>
      </div>}
    </div>
  );
}
