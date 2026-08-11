import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import {
  fetchDestinationCategories,
  fetchDestinations,
} from "../services/destinationApi";
import type {
  Destination,
  DestinationCategory,
} from "../types/destination";

function PlaceCard({ destination }: { destination: Destination }) {
  return (
    <Link
      to={`/dashboard/destinations/${destination.id}`}
      className="group block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
    >
      <article>
        <div className="aspect-[4/3] overflow-hidden bg-mist">
          <DestinationImage
            images={destination.images}
            alt={destination.destination_name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </div>
        <div className="space-y-2 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-ink">
              {destination.destination_name}
            </h3>
            {destination.state ? (
              <span className="shrink-0 rounded-full bg-leaf/10 px-2.5 py-0.5 text-xs font-medium text-leaf">
                {destination.state}
              </span>
            ) : null}
          </div>
          {destination.category_name ? (
            <p className="text-xs font-medium uppercase tracking-wide text-forest/70">
              {destination.category_name}
            </p>
          ) : null}
          <p className="line-clamp-3 text-sm leading-relaxed text-stone">
            {destination.description}
          </p>
        </div>
      </article>
    </Link>
  );
}

export function DestinationsPage() {
  const [categories, setCategories] = useState<DestinationCategory[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [nameQuery, setNameQuery] = useState("");
  const [debouncedName, setDebouncedName] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedName(nameQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [nameQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const data = await fetchDestinationCategories();
        if (!cancelled) {
          setCategories(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load categories");
        }
      }
    }

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailableStates() {
      try {
        const data = await fetchDestinations({
          name: debouncedName || undefined,
          category: categoryFilter || undefined,
        });
        if (cancelled) {
          return;
        }

        const states = Array.from(
          new Set(data.map((item) => item.state.trim()).filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b));

        setAvailableStates(states);
        setStateFilter((current) =>
          current && !states.includes(current) ? "" : current,
        );
      } catch {
        if (!cancelled) {
          setAvailableStates([]);
        }
      }
    }

    void loadAvailableStates();
    return () => {
      cancelled = true;
    };
  }, [debouncedName, categoryFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadDestinations() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDestinations({
          name: debouncedName || undefined,
          state: stateFilter || undefined,
          category: categoryFilter || undefined,
        });
        if (!cancelled) {
          setDestinations(data);
        }
      } catch (err) {
        if (!cancelled) {
          setDestinations([]);
          setError(
            err instanceof Error ? err.message : "Failed to load destinations",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDestinations();
    return () => {
      cancelled = true;
    };
  }, [debouncedName, stateFilter, categoryFilter]);

  return (
    <div className="animate-fade-up">
      <header className="mb-10 max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wider text-leaf">
          Explore
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-forest sm:text-5xl">
          Destinations in Malaysia
        </h1>
        <p className="mt-4 text-lg text-stone">
          Browse AI-curated places across nature, culture, heritage, adventure,
          and shopping — tap a card for full details and a map.
        </p>
      </header>

      <div className="mb-10 grid gap-4 rounded-2xl bg-white/80 p-4 ring-1 ring-forest/10 sm:grid-cols-3 sm:p-5">
        <label className="block space-y-1.5 sm:col-span-1">
          <span className="text-xs font-medium uppercase tracking-wide text-forest/70">
            Search name
          </span>
          <input
            type="search"
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder="e.g. Langkawi"
            className="w-full rounded-xl border border-forest/15 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/20"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-forest/70">
            State
          </span>
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
            className="w-full rounded-xl border border-forest/15 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/20"
          >
            <option value="">All states</option>
            {availableStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-forest/70">
            Category
          </span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="w-full rounded-xl border border-forest/15 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/20"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-stone">Loading destinations…</p>
      ) : destinations.length === 0 ? (
        <p className="rounded-2xl bg-white/70 px-5 py-8 text-stone ring-1 ring-forest/10">
          No destinations found. Run the Gemini sync seed script to populate
          places, then refresh this page.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {destinations.map((destination) => (
            <PlaceCard key={destination.id} destination={destination} />
          ))}
        </div>
      )}
    </div>
  );
}
