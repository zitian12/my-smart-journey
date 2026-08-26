/**
 * Mode breakdown pie + bar charts for Eco Score (UC 5.2).
 * - metric "saved": shares = carbon saved vs private-car baseline (driving = 0)
 * - metric "carbon": shares = carbon footprint (includes Car); used for All trips + Monthly
 * Pure SVG — no chart libraries, no Google Maps / external APIs.
 */

import { useMemo, useState } from "react";
import { modeLabel } from "../utils/sustainability";

export type ModeBreakdownRow = {
  mode: string;
  carbon_kg: number;
  /** kg CO₂e saved vs car baseline; driving should be 0. */
  saved_kg?: number;
  distance_km?: number;
  share_percent?: number;
  /** Trips in period that used this mode (All trips + Monthly). */
  trip_count?: number;
};

type ChartView = "pie" | "bar";
export type ModeChartMetric = "saved" | "carbon";

/** Fixed colors for monthly Car / PT / Walking buckets. */
const MONTHLY_MODE_COLORS: Record<string, string> = {
  driving: "#dc2626",
  car: "#dc2626",
  transit: "#eab308",
  bus: "#eab308",
  train: "#eab308",
  public_transport: "#eab308",
  walking: "#16a34a",
  cycling: "#16a34a",
  foot: "#16a34a",
};

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

function colorForMode(
  mode: string,
  index: number,
  metric: ModeChartMetric,
): string {
  const key = mode.trim().toLowerCase();
  if (metric === "carbon") {
    return (
      MONTHLY_MODE_COLORS[key] ??
      MODE_COLORS[key] ??
      FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
    );
  }
  return MODE_COLORS[key] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

function formatKg(value: number): string {
  return `${value.toFixed(2)} kg`;
}

function savedForRow(row: ModeBreakdownRow): number {
  if (row.saved_kg != null && Number.isFinite(row.saved_kg)) {
    return Math.max(0, Number(row.saved_kg));
  }
  const mode = row.mode.trim().toLowerCase();
  if (mode === "driving" || mode === "car") return 0;
  return Math.max(0, Number(row.carbon_kg) || 0);
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
  value: number;
  color: string;
  share: number;
  startAngle: number;
  endAngle: number;
};

function buildSlices(
  rows: ModeBreakdownRow[],
  metric: ModeChartMetric,
): Slice[] {
  if (metric === "saved") {
    const cleaned = rows
      .map((row) => ({
        ...row,
        carbon_kg: Math.max(0, Number(row.carbon_kg) || 0),
        distance_km: Math.max(0, Number(row.distance_km) || 0),
        value: savedForRow(row),
      }))
      .filter((row) => row.value > 0);

    const total = cleaned.reduce((sum, row) => sum + row.value, 0);
    if (cleaned.length === 0 || total <= 0) return [];

    let angle = 0;
    return cleaned.map((row, index) => {
      const share = (row.value / total) * 100;
      const sweep = (share / 100) * 360;
      const startAngle = angle;
      const endAngle =
        angle + Math.max(sweep, cleaned.length === 1 ? 360 : 0.01);
      angle = endAngle;
      return {
        ...row,
        color: colorForMode(row.mode, index, metric),
        share,
        startAngle,
        endAngle: Math.min(endAngle, 360),
      };
    });
  }

  // metric === "carbon": include Walking (0 kg) when it has trips/distance
  const cleaned = rows
    .map((row) => ({
      ...row,
      carbon_kg: Math.max(0, Number(row.carbon_kg) || 0),
      distance_km: Math.max(0, Number(row.distance_km) || 0),
      trip_count: Math.max(0, Number(row.trip_count) || 0),
      value: Math.max(0, Number(row.carbon_kg) || 0),
    }))
    .filter(
      (row) =>
        row.value > 0 || row.trip_count > 0 || row.distance_km > 0,
    );

  if (cleaned.length === 0) return [];

  const totalCarbon = cleaned.reduce((sum, row) => sum + row.value, 0);
  const zeroCarbon = cleaned.filter((row) => row.value <= 0);
  // Reserve a visible green sliver for zero-emission modes (e.g. Walking)
  const MIN_ZERO_DEG = 12;
  const reservedDeg =
    totalCarbon > 0 ? zeroCarbon.length * MIN_ZERO_DEG : 0;
  const carbonDeg = Math.max(0, 360 - reservedDeg);

  let angle = 0;
  return cleaned.map((row, index) => {
    let share: number;
    let sweep: number;
    if (totalCarbon <= 0) {
      // All zero-carbon (e.g. only walking): share by trip count / distance
      const weights = cleaned.map(
        (r) => r.trip_count || r.distance_km || 1,
      );
      const weightTotal = weights.reduce((a, b) => a + b, 0) || 1;
      const w = row.trip_count || row.distance_km || 1;
      share = (w / weightTotal) * 100;
      sweep = (share / 100) * 360;
    } else if (row.value > 0) {
      share = (row.value / totalCarbon) * 100;
      sweep = (row.value / totalCarbon) * carbonDeg;
    } else {
      share = 0;
      sweep = MIN_ZERO_DEG;
    }

    const startAngle = angle;
    const endAngle =
      angle + Math.max(sweep, cleaned.length === 1 ? 360 : 0.01);
    angle = endAngle;
    return {
      ...row,
      color: colorForMode(row.mode, index, metric),
      share,
      startAngle,
      endAngle: Math.min(endAngle, 360),
    };
  });
}

function PieChart({
  slices,
  metric,
}: {
  slices: Slice[];
  metric: ModeChartMetric;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 88;
  const [active, setActive] = useState<number | null>(null);
  const centerSub = metric === "carbon" ? "CO₂e" : "vs car";

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
      aria-label={
        metric === "carbon"
          ? "Total CO₂e by transport mode"
          : "Carbon saved by transport mode"
      }
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
            {modeLabel(slice.mode)}: {formatKg(slice.carbon_kg)}
            {slice.trip_count != null && slice.trip_count > 0
              ? ` · ${slice.trip_count} trips`
              : ""}{" "}
            ({slice.share.toFixed(1)}%)
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
        {active != null ? `${slices[active].share.toFixed(0)}%` : metric === "carbon" ? "Total" : "Saved"}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        className="fill-stone"
        style={{ fontSize: "10px" }}
      >
        {active != null ? modeLabel(slices[active].mode) : centerSub}
      </text>
    </svg>
  );
}

function BarChart({
  slices,
  metric,
}: {
  slices: Slice[];
  metric: ModeChartMetric;
}) {
  const maxValue = Math.max(
    ...slices.map((s) =>
      s.value > 0
        ? s.value
        : metric === "carbon"
          ? Math.max(s.trip_count ?? 0, s.distance_km ?? 0, 0.001)
          : 0.001,
    ),
    0.001,
  );

  return (
    <ul
      className="space-y-3"
      aria-label={
        metric === "carbon"
          ? "Total CO₂e by transport mode"
          : "Carbon saved by transport mode"
      }
    >
      {slices.map((slice, index) => {
        const barValue =
          slice.value > 0
            ? slice.value
            : metric === "carbon"
              ? Math.max(slice.trip_count ?? 0, slice.distance_km ?? 0, 0.001)
              : 0.001;
        const widthPct = Math.max(4, (barValue / maxValue) * 100);
        return (
          <li key={`${slice.mode}-${index}`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-ink">{modeLabel(slice.mode)}</span>
              <span className="shrink-0 text-xs text-stone">
                {formatKg(slice.carbon_kg)}
                {metric === "saved" ? " saved" : ""} · {slice.share.toFixed(0)}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${widthPct}%`, backgroundColor: slice.color }}
                title={`${modeLabel(slice.mode)}: ${formatKg(slice.carbon_kg)}`}
              />
            </div>
            <p className="mt-0.5 text-[11px] text-stone">
              {slice.trip_count != null && slice.trip_count > 0
                ? `${slice.trip_count} trip${slice.trip_count === 1 ? "" : "s"}`
                : null}
              {slice.trip_count != null &&
              slice.trip_count > 0 &&
              slice.distance_km != null &&
              slice.distance_km > 0
                ? " · "
                : ""}
              {slice.distance_km != null && slice.distance_km > 0
                ? `${slice.distance_km.toFixed(1)} km`
                : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function ModeBreakdownChart({
  rows,
  title = "Carbon saved by transport mode",
  defaultView = "pie",
  metric = "saved",
}: {
  rows: ModeBreakdownRow[];
  title?: string;
  defaultView?: ChartView;
  metric?: ModeChartMetric;
}) {
  const [view, setView] = useState<ChartView>(defaultView);
  const slices = useMemo(() => buildSlices(rows, metric), [rows, metric]);
  const hasLegs = rows.some(
    (row) =>
      (row.distance_km ?? 0) > 0 ||
      (row.carbon_kg ?? 0) > 0 ||
      (row.trip_count ?? 0) > 0,
  );

  if (slices.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-3 text-sm text-stone">
          {hasLegs
            ? metric === "carbon"
              ? "No transport-mode CO₂e to chart for this period yet."
              : "No carbon saved yet — private car matches the baseline (0 kg saved). Switch some legs to walking or public transport to see savings here."
            : "No transport-mode data for this itinerary yet."}
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
          {view === "pie" ? (
            <PieChart slices={slices} metric={metric} />
          ) : (
            <BarChart slices={slices} metric={metric} />
          )}
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
                  {metric === "carbon"
                    ? formatKg(slice.carbon_kg)
                    : `${formatKg(slice.value)} saved`}
                </span>
                <span className="mt-0.5 block text-[11px] text-stone">
                  {slice.share.toFixed(1)}%
                  {slice.trip_count != null && slice.trip_count > 0
                    ? ` · ${slice.trip_count} trip${slice.trip_count === 1 ? "" : "s"}`
                    : ""}
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
        {metric === "carbon"
          ? "Shares are kg CO₂e by mode for trips in this period. Walking is 0 kg CO₂e but still listed (green) when used; trip counts include each itinerary that used that mode at least once."
          : "Shares are kg CO₂e saved versus a private-car baseline for the same distance. Car / driving always contributes 0 kg saved."}
      </p>
    </section>
  );
}
