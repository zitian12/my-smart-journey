/**
 * Mode breakdown pie + bar charts for Eco Score (UC 5.2).
 * Pure SVG — no chart libraries, no Google Maps / external APIs.
 *
 * Place at: presentation/src/components/ModeBreakdownChart.tsx
 */

import { useMemo, useState } from "react";
import { modeLabel } from "../utils/sustainability";

export type ModeBreakdownRow = {
  mode: string;
  carbon_kg: number;
  distance_km?: number;
  share_percent?: number;
};

type ChartView = "pie" | "bar";

const MODE_COLORS: Record<string, string> = {
  walking: "#2d6a4f",
  cycling: "#40916c",
  train: "#1b4332",
  bus: "#52b788",
  transit: "#74c69d",
  driving: "#bc6c25",
  motorcycle: "#d4a373",
  ev: "#95d5b2",
  flight: "#9b2226",
};

const FALLBACK_PALETTE = [
  "#2d6a4f",
  "#40916c",
  "#74c69d",
  "#bc6c25",
  "#1b4332",
  "#52b788",
  "#d4a373",
  "#95d5b2",
];

function colorForMode(mode: string, index: number): string {
  const key = mode.trim().toLowerCase();
  return MODE_COLORS[key] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

function formatKg(value: number): string {
  return `${value.toFixed(2)} kg`;
}

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    "M",
    cx,
    cy,
    "L",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArc,
    0,
    end.x,
    end.y,
    "Z",
  ].join(" ");
}

type Slice = ModeBreakdownRow & {
  color: string;
  share: number;
  startAngle: number;
  endAngle: number;
};

function buildSlices(rows: ModeBreakdownRow[]): Slice[] {
  const cleaned = rows
    .map((row) => ({
      ...row,
      carbon_kg: Math.max(0, Number(row.carbon_kg) || 0),
      distance_km: Math.max(0, Number(row.distance_km) || 0),
    }))
    .filter((row) => row.carbon_kg > 0 || row.distance_km > 0);

  const totalCarbon = cleaned.reduce((sum, row) => sum + row.carbon_kg, 0);
  if (cleaned.length === 0) return [];

  // If every mode is zero-carbon (e.g. all walking), slice by distance instead.
  const useDistance = totalCarbon <= 0;
  const total = useDistance
    ? cleaned.reduce((sum, row) => sum + row.distance_km, 0)
    : totalCarbon;

  if (total <= 0) return [];

  let angle = 0;
  return cleaned.map((row, index) => {
    const value = useDistance ? row.distance_km : row.carbon_kg;
    const share =
      row.share_percent != null && !useDistance
        ? Math.max(0, Math.min(100, Number(row.share_percent)))
        : (value / total) * 100;
    const sweep = (share / 100) * 360;
    const startAngle = angle;
    const endAngle = angle + Math.max(sweep, cleaned.length === 1 ? 360 : 0.01);
    angle = endAngle;
    return {
      ...row,
      color: colorForMode(row.mode, index),
      share,
      startAngle,
      endAngle: Math.min(endAngle, 360),
    };
  });
}

function PieChart({ slices }: { slices: Slice[] }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 88;
  const [active, setActive] = useState<number | null>(null);

  if (slices.length === 1) {
    const only = slices[0];
    return (
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto h-auto w-full max-w-[220px]"
        role="img"
        aria-label={`${modeLabel(only.mode)} ${only.share.toFixed(0)} percent`}
      >
        <circle cx={cx} cy={cy} r={radius} fill={only.color} />
        <circle cx={cx} cy={cy} r={48} fill="#ffffff" />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-forest"
          style={{ fontSize: "18px", fontWeight: 600 }}
        >
          {only.share.toFixed(0)}%
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          className="fill-stone"
          style={{ fontSize: "11px" }}
        >
          {modeLabel(only.mode)}
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto h-auto w-full max-w-[220px]"
      role="img"
      aria-label="Carbon emissions by transport mode"
    >
      {slices.map((slice, index) => (
        <path
          key={`${slice.mode}-${index}`}
          d={describeArc(cx, cy, radius, slice.startAngle, slice.endAngle)}
          fill={slice.color}
          opacity={active === null || active === index ? 1 : 0.45}
          className="cursor-pointer transition-opacity"
          onMouseEnter={() => setActive(index)}
          onMouseLeave={() => setActive(null)}
        >
          <title>
            {modeLabel(slice.mode)}: {formatKg(slice.carbon_kg)} (
            {slice.share.toFixed(1)}%)
          </title>
        </path>
      ))}
      <circle cx={cx} cy={cy} r={48} fill="#ffffff" />
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        className="fill-forest"
        style={{ fontSize: "15px", fontWeight: 600 }}
      >
        {active != null ? `${slices[active].share.toFixed(0)}%` : "Modes"}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        className="fill-stone"
        style={{ fontSize: "10px" }}
      >
        {active != null ? modeLabel(slices[active].mode) : "by carbon"}
      </text>
    </svg>
  );
}

function BarChart({ slices }: { slices: Slice[] }) {
  const maxCarbon = Math.max(...slices.map((s) => s.carbon_kg), 0.001);

  return (
    <ul className="space-y-3" aria-label="Carbon by transport mode">
      {slices.map((slice, index) => {
        const widthPct = Math.max(4, (slice.carbon_kg / maxCarbon) * 100);
        return (
          <li key={`${slice.mode}-${index}`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-ink">{modeLabel(slice.mode)}</span>
              <span className="shrink-0 text-xs text-stone">
                {formatKg(slice.carbon_kg)} · {slice.share.toFixed(0)}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${widthPct}%`, backgroundColor: slice.color }}
                title={`${modeLabel(slice.mode)}: ${formatKg(slice.carbon_kg)}`}
              />
            </div>
            {slice.distance_km != null && slice.distance_km > 0 ? (
              <p className="mt-0.5 text-[11px] text-stone">
                {slice.distance_km.toFixed(1)} km
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ModeBreakdownChart({
  rows,
  title = "Emissions by transport mode",
  defaultView = "pie",
}: {
  rows: ModeBreakdownRow[];
  title?: string;
  defaultView?: ChartView;
}) {
  const [view, setView] = useState<ChartView>(defaultView);
  const slices = useMemo(() => buildSlices(rows), [rows]);

  if (slices.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-3 text-sm text-stone">
          No transport-mode carbon data for this itinerary yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="inline-flex rounded-xl bg-mist/80 p-1 ring-1 ring-forest/10">
          <button
            type="button"
            onClick={() => setView("pie")}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === "pie"
                ? "bg-forest text-white"
                : "text-stone hover:text-forest",
            ].join(" ")}
          >
            Pie
          </button>
          <button
            type="button"
            onClick={() => setView("bar")}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === "bar"
                ? "bg-forest text-white"
                : "text-stone hover:text-forest",
            ].join(" ")}
          >
            Bar
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center">
        <div>
          {view === "pie" ? <PieChart slices={slices} /> : <BarChart slices={slices} />}
        </div>

        <ul className="space-y-2">
          {slices.map((slice, index) => (
            <li
              key={`${slice.mode}-legend-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-mist/60 px-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden
                />
                <span className="truncate text-sm font-medium text-ink">
                  {modeLabel(slice.mode)}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm">
                <span className="font-semibold text-forest">
                  {formatKg(slice.carbon_kg)}
                </span>
                <span className="mt-0.5 block text-[11px] text-stone">
                  {slice.share.toFixed(1)}%
                  {slice.distance_km != null && slice.distance_km > 0
                    ? ` · ${slice.distance_km.toFixed(1)} km`
                    : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-stone">
        Shares are based on carbon (kg CO₂e) per mode. Walking and cycling show 0
        kg; if every leg is zero-carbon, the chart uses distance instead.
      </p>
    </section>
  );
}
