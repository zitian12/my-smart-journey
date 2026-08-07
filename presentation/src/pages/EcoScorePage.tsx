import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CARBON_BY_TRANSPORT,
  ECO_PROFILE_SCORES,
  ECO_RECOMMENDATIONS,
  TRANSPORT_LEGEND,
  type EcoRecommendation,
} from "../data/ecoScoreDummy";

const CHART_SIZE = 280;
const CHART_CENTER = CHART_SIZE / 2;
const CHART_RADIUS = 100;

function polarToCartesian(angleDeg: number, radius: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CHART_CENTER + radius * Math.cos(angleRad),
    y: CHART_CENTER + radius * Math.sin(angleRad),
  };
}

function EcoRadarChart() {
  const axes = ECO_PROFILE_SCORES.length;
  const gridLevels = [25, 50, 75, 100];

  const axisPoints = useMemo(
    () =>
      ECO_PROFILE_SCORES.map((_, index) => {
        const angle = (360 / axes) * index;
        return polarToCartesian(angle, CHART_RADIUS);
      }),
    [axes],
  );

  const dataPoints = useMemo(
    () =>
      ECO_PROFILE_SCORES.map((dim, index) => {
        const angle = (360 / axes) * index;
        const radius = (dim.score / 100) * CHART_RADIUS;
        return polarToCartesian(angle, radius);
      }),
    [axes],
  );

  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
      className="mx-auto h-auto w-full max-w-[280px]"
      role="img"
      aria-label="Eco profile radar chart"
    >
      {gridLevels.map((level) => {
        const r = (level / 100) * CHART_RADIUS;
        const points = Array.from({ length: axes }, (_, index) => {
          const angle = (360 / axes) * index;
          const point = polarToCartesian(angle, r);
          return `${point.x},${point.y}`;
        }).join(" ");
        return (
          <polygon
            key={level}
            points={points}
            fill="none"
            stroke="#2d6a4f"
            strokeOpacity={0.12}
            strokeWidth={1}
          />
        );
      })}

      {axisPoints.map((point, index) => (
        <line
          key={ECO_PROFILE_SCORES[index].id}
          x1={CHART_CENTER}
          y1={CHART_CENTER}
          x2={point.x}
          y2={point.y}
          stroke="#2d6a4f"
          strokeOpacity={0.15}
          strokeWidth={1}
        />
      ))}

      <polygon
        points={dataPolygon}
        fill="#2d6a4f"
        fillOpacity={0.2}
        stroke="#2d6a4f"
        strokeWidth={2}
      />

      {dataPoints.map((point, index) => (
        <circle
          key={ECO_PROFILE_SCORES[index].id}
          cx={point.x}
          cy={point.y}
          r={4}
          fill="#2d6a4f"
        />
      ))}

      {ECO_PROFILE_SCORES.map((dim, index) => {
        const angle = (360 / axes) * index;
        const labelPoint = polarToCartesian(angle, CHART_RADIUS + 22);
        return (
          <text
            key={dim.id}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-stone text-[10px] font-medium"
          >
            {dim.label}
          </text>
        );
      })}
    </svg>
  );
}

function CarbonBarChart() {
  const maxTotal = 180;
  const chartHeight = 200;
  const barWidth = 28;
  const gap = 18;
  const chartWidth =
    CARBON_BY_TRANSPORT.length * barWidth +
    (CARBON_BY_TRANSPORT.length - 1) * gap +
    40;
  const leftPad = 36;
  const topPad = 12;
  const bottomPad = 28;

  const yTicks = [0, 45, 90, 135, 180];

  return (
    <svg
      viewBox={`0 0 ${chartWidth + leftPad} ${chartHeight + topPad + bottomPad}`}
      className="h-auto w-full"
      role="img"
      aria-label="Carbon emissions by transport mode"
    >
      {yTicks.map((tick) => {
        const y =
          topPad + chartHeight - (tick / maxTotal) * chartHeight;
        return (
          <g key={tick}>
            <line
              x1={leftPad}
              y1={y}
              x2={chartWidth + leftPad - 4}
              y2={y}
              stroke="#2d6a4f"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
            <text
              x={leftPad - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-stone text-[9px]"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {CARBON_BY_TRANSPORT.map((entry, index) => {
        const x = leftPad + index * (barWidth + gap);
        const segments = [
          { value: entry.flight, color: TRANSPORT_LEGEND[0].color },
          { value: entry.car, color: TRANSPORT_LEGEND[1].color },
          { value: entry.train, color: TRANSPORT_LEGEND[2].color },
          { value: entry.bike, color: TRANSPORT_LEGEND[3].color },
        ];

        let stackBottom = topPad + chartHeight;

        return (
          <g key={entry.month}>
            {segments.map((segment, segmentIndex) => {
              const height = (segment.value / maxTotal) * chartHeight;
              stackBottom -= height;
              const isTop = segmentIndex === segments.length - 1;
              return (
                <rect
                  key={segment.color}
                  x={x}
                  y={stackBottom}
                  width={barWidth}
                  height={height}
                  fill={segment.color}
                  rx={isTop ? 3 : 0}
                  ry={isTop ? 3 : 0}
                />
              );
            })}
            <text
              x={x + barWidth / 2}
              y={topPad + chartHeight + 16}
              textAnchor="middle"
              className="fill-stone text-[10px] font-medium"
            >
              {entry.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.8l-1.6-5.6L5 10.6 10.4 9 12 3.5Z" />
    </svg>
  );
}

function IconTrain() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path strokeLinecap="round" d="M4 11h16M8 17v2M16 17v2M8 5V3M16 5V3" />
    </svg>
  );
}

function IconStay() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4 9v12h16V9l-8-6Z" />
      <path strokeLinecap="round" d="M9 21v-6h6v6" />
    </svg>
  );
}

function IconWaste() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M8 6h8l-1 14H9L8 6Z" />
      <path strokeLinecap="round" d="M10 10v6M14 10v6" />
    </svg>
  );
}

function RecommendationIcon({ type }: { type: EcoRecommendation["icon"] }) {
  if (type === "train") return <IconTrain />;
  if (type === "stay") return <IconStay />;
  return <IconWaste />;
}

export function EcoScorePage() {
  const navigate = useNavigate();

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [],
  );

  return (
    <div className="mx-auto max-w-6xl animate-fade-up space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            Eco Score
          </h1>
          <p className="mt-1 text-sm text-stone">{todayLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard/planning")}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          <IconSparkle />
          Plan a Trip
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Eco Profile</h2>
          <div className="mt-6">
            <EcoRadarChart />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ECO_PROFILE_SCORES.map((dim) => (
              <div
                key={dim.id}
                className="rounded-xl bg-mist/80 px-4 py-3 text-center ring-1 ring-leaf/10"
              >
                <p className="font-display text-2xl font-semibold text-leaf">
                  {dim.score}
                </p>
                <p className="mt-0.5 text-xs font-medium text-stone">{dim.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">
            Carbon by Transport{" "}
            <span className="text-sm font-normal text-stone">(kg CO₂)</span>
          </h2>
          <div className="mt-6">
            <CarbonBarChart />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {TRANSPORT_LEGEND.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs font-medium text-stone">{item.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">AI Eco Recommendations</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ECO_RECOMMENDATIONS.map((tip) => (
            <article
              key={tip.id}
              className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-leaf/10">
                <RecommendationIcon type={tip.icon} />
              </div>
              <p className="text-sm leading-relaxed text-stone">{tip.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
