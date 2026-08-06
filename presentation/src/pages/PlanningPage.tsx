import { useMemo, useState, type ReactNode } from "react";

const MALAYSIA_PLACES = [
  "Kuala Lumpur",
  "Johor Bahru",
  "George Town",
  "Penang",
  "Melaka",
  "Ipoh",
  "Seremban",
  "Langkawi",
  "Kota Kinabalu",
  "Kuching",
  "Cameron Highlands",
  "Putrajaya",
  "Alor Setar",
  "Kota Bharu",
  "Kuantan",
] as const;

function IconPlane() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12l7.5-7.5M3 12h18" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4m0 0h9l-1.5 3L14 10H5" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-stone" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2" />
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

function FieldShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-leaf/20 bg-mist/40 px-3 py-2.5 focus-within:border-leaf/50 focus-within:ring-2 focus-within:ring-leaf/20">
      {children}
    </div>
  );
}

function Counter({
  label,
  value,
  onChange,
  min = 0,
  max = 30,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-mist/80 px-4 py-3 ring-1 ring-forest/5">
      <span className="text-sm font-medium text-stone">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-leaf/25 text-forest transition hover:bg-leaf/10"
        >
          −
        </button>
        <span className="min-w-[4.5rem] text-center text-sm font-semibold text-ink">
          {value}
          {suffix ? ` ${suffix}` : ""}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-leaf/25 text-forest transition hover:bg-leaf/10"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function PlanningPage() {
  const [startPoint, setStartPoint] = useState("kuala lumpur");
  const [endPoint, setEndPoint] = useState("johor");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([
    "Seremban",
  ]);
  const [days, setDays] = useState(3);
  const [nights, setNights] = useState(2);
  const [hoursPerDay, setHoursPerDay] = useState(7);

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

  const filteredPlaces = useMemo(() => {
    const q = destinationQuery.trim().toLowerCase();
    if (!q) return [];
    return MALAYSIA_PLACES.filter(
      (place) =>
        place.toLowerCase().includes(q) &&
        !selectedDestinations.includes(place),
    ).slice(0, 6);
  }, [destinationQuery, selectedDestinations]);

  const toggleDestination = (place: string) => {
    setSelectedDestinations((prev) =>
      prev.includes(place) ? prev.filter((p) => p !== place) : [...prev, place],
    );
    setDestinationQuery("");
  };

  const removeDestination = (place: string) => {
    setSelectedDestinations((prev) => prev.filter((p) => p !== place));
  };

  return (
    <div className="mx-auto max-w-4xl animate-fade-up space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            Planning
          </h1>
          <p className="mt-1 text-sm text-stone">{todayLabel}</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          <IconSparkle />
          Plan a Trip
        </button>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
        <h2 className="text-xl font-semibold text-ink">Plan your route</h2>

        <form
          className="mt-6 space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone">Starting Point</span>
              <FieldShell>
                <IconPlane />
                <input
                  type="text"
                  value={startPoint}
                  onChange={(e) => setStartPoint(e.target.value)}
                  placeholder="e.g. Kuala Lumpur"
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-stone/60"
                />
              </FieldShell>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone">Ending Point</span>
              <FieldShell>
                <IconFlag />
                <input
                  type="text"
                  value={endPoint}
                  onChange={(e) => setEndPoint(e.target.value)}
                  placeholder="e.g. Johor Bahru"
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-stone/60"
                />
              </FieldShell>
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-stone">Select Destinations</span>
              <span className="rounded-full bg-leaf/10 px-2.5 py-0.5 text-xs font-medium text-leaf">
                MY Malaysia only
              </span>
            </div>

            <div className="relative">
              <FieldShell>
                <IconSearch />
                <input
                  type="search"
                  value={destinationQuery}
                  onChange={(e) => setDestinationQuery(e.target.value)}
                  placeholder="Search destinations…"
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-stone/60"
                />
              </FieldShell>

              {filteredPlaces.length > 0 ? (
                <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-forest/10">
                  {filteredPlaces.map((place) => (
                    <li key={place}>
                      <button
                        type="button"
                        onClick={() => toggleDestination(place)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-mist"
                      >
                        <IconPin />
                        {place}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {selectedDestinations.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {selectedDestinations.map((place) => (
                  <span
                    key={place}
                    className="inline-flex items-center gap-1.5 rounded-full bg-forest px-3 py-1.5 text-xs font-medium text-white"
                  >
                    {place}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-sm text-stone">
              <span>
                {selectedDestinations.length} selected
                {selectedDestinations.length > 0 ? ":" : ""}
              </span>
              {selectedDestinations.map((place) => (
                <button
                  key={`chip-${place}`}
                  type="button"
                  onClick={() => removeDestination(place)}
                  className="inline-flex items-center gap-1 rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-forest ring-1 ring-leaf/20 transition hover:bg-leaf/10"
                >
                  {place}
                  <span aria-hidden>×</span>
                </button>
              ))}
              {selectedDestinations.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedDestinations([])}
                  className="text-xs font-medium text-leaf hover:underline"
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-sm font-medium text-stone">Duration</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <Counter label="Days" value={days} onChange={setDays} min={1} />
              <Counter label="Nights" value={nights} onChange={setNights} min={0} />
            </div>
            <p className="text-sm text-stone">
              {days} day{days === 1 ? "" : "s"} · {nights} night
              {nights === 1 ? "" : "s"}
            </p>
          </div>

          <div className="space-y-3">
            <span className="text-sm font-medium text-stone">Hours per day</span>
            <Counter
              label="Hours per day"
              value={hoursPerDay}
              onChange={setHoursPerDay}
              min={1}
              max={16}
              suffix="hrs per day"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-forest/5 pt-6">
            <button
              type="button"
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone transition hover:bg-mist hover:text-forest"
            >
              Back
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-leaf"
            >
              Continue
              <span aria-hidden>→</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
