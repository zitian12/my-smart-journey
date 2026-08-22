import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import { FavouriteHeartButton } from "../components/FavouriteHeartButton";
import { useAuth } from "../context/AuthContext";
import {
  fetchDestinationCategories,
  fetchDestinations,
  fetchDestinationStates,
} from "../services/destinationApi";
import {
  addFavourite,
  listFavouriteIds,
  removeFavourite,
} from "../services/favouriteApi";
import type {
  Destination,
  DestinationCategory,
} from "../types/destination";
import {
  categoryPlaceholderClass,
  realDestinationImages,
} from "../utils/destinationMedia";

const PAGE_SIZE = 28;

function PlaceCard({
  destination,
  isFavourite,
  onToggleFavourite,
}: {
  destination: Destination;
  isFavourite: boolean;
  onToggleFavourite: (destinationId: string) => void;
}) {
  const images = realDestinationImages(destination.images);
  const label =
    destination.category_name ||
    destination.category_slug ||
    "Destination";

  const handleHeartClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleFavourite(destination.id);
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg">
      <FavouriteHeartButton
        filled={isFavourite}
        onClick={handleHeartClick}
        className="absolute right-3 top-3 z-10 bg-white/85 shadow-sm backdrop-blur-sm"
      />
      <Link
        to={`/dashboard/destinations/${destination.id}`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
      >
        <article>
          <div className="aspect-[4/3] overflow-hidden bg-mist">
            {images.length > 0 ? (
              <DestinationImage
                images={images}
                alt={destination.destination_name}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div
                className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br px-4 text-center ${categoryPlaceholderClass(destination.category_slug)}`}
                aria-hidden
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-forest/45">
                  {label}
                </span>
                <span className="line-clamp-2 font-display text-lg font-semibold text-forest/35">
                  {destination.destination_name}
                </span>
              </div>
            )}
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
            {destination.description ? (
              <p className="line-clamp-3 text-sm leading-relaxed text-stone">
                {destination.description}
              </p>
            ) : (
              <p className="text-sm text-stone/70">Open for details and map</p>
            )}
          </div>
        </article>
      </Link>
    </div>
  );
}

export function DestinationsPage() {
  const { isAuthenticated, getAccessToken } = useAuth();
  const [categories, setCategories] = useState<DestinationCategory[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(new Set());
  const [nameQuery, setNameQuery] = useState("");
  const [debouncedName, setDebouncedName] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favouriteMessage, setFavouriteMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedName(nameQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [nameQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedName, stateFilter, categoryFilter]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

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

    async function loadStates() {
      try {
        const states = await fetchDestinationStates();
        if (cancelled) {
          return;
        }
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

    void loadStates();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFavouriteIds() {
      if (!isAuthenticated) {
        setFavouriteIds(new Set());
        return;
      }
      const token = getAccessToken();
      if (!token) {
        setFavouriteIds(new Set());
        return;
      }
      try {
        const ids = await listFavouriteIds(token);
        if (!cancelled) {
          setFavouriteIds(new Set(ids));
        }
      } catch {
        if (!cancelled) {
          setFavouriteIds(new Set());
        }
      }
    }

    void loadFavouriteIds();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessToken]);

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
          page,
          page_size: PAGE_SIZE,
        });
        if (!cancelled) {
          setDestinations(data.items);
          setTotal(data.total);
          const maxPage = Math.max(1, Math.ceil(data.total / data.page_size) || 1);
          if (page > maxPage) {
            setPage(maxPage);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setDestinations([]);
          setTotal(0);
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
  }, [debouncedName, stateFilter, categoryFilter, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const goToTypedPage = () => {
    const parsed = Number.parseInt(pageInput.trim(), 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(page));
      return;
    }
    const next = Math.min(totalPages, Math.max(1, parsed));
    setPage(next);
    setPageInput(String(next));
  };

  const handleToggleFavourite = async (destinationId: string) => {
    if (!isAuthenticated) {
      setFavouriteMessage("Please sign in from the sidebar to save favourites.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setFavouriteMessage("Please sign in from the sidebar to save favourites.");
      return;
    }

    const wasFavourite = favouriteIds.has(destinationId);
    setFavouriteMessage(null);
    setFavouriteIds((current) => {
      const next = new Set(current);
      if (wasFavourite) {
        next.delete(destinationId);
      } else {
        next.add(destinationId);
      }
      return next;
    });

    try {
      if (wasFavourite) {
        await removeFavourite(token, destinationId);
      } else {
        await addFavourite(token, destinationId);
      }
    } catch (err) {
      setFavouriteIds((current) => {
        const next = new Set(current);
        if (wasFavourite) {
          next.add(destinationId);
        } else {
          next.delete(destinationId);
        }
        return next;
      });
      setFavouriteMessage(
        err instanceof Error ? err.message : "Failed to update favourite",
      );
    }
  };

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
          Popular places appear first, then places with photos. Tap the heart to
          save places you love.
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

      {favouriteMessage ? (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
          {favouriteMessage}
        </p>
      ) : null}

      {loading ? (
        <p className="text-stone">Loading destinations…</p>
      ) : destinations.length === 0 ? (
        <p className="rounded-2xl bg-white/70 px-5 py-8 text-stone ring-1 ring-forest/10">
          No destinations found. Run the Places seed script to populate places,
          then refresh this page.
        </p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {destinations.map((destination) => (
              <PlaceCard
                key={destination.id}
                destination={destination}
                isFavourite={favouriteIds.has(destination.id)}
                onToggleFavourite={handleToggleFavourite}
              />
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-stone">
              Showing{" "}
              <span className="font-medium text-forest">
                {rangeStart}–{rangeEnd}
              </span>{" "}
              of <span className="font-medium text-forest">{total}</span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm font-medium text-forest transition hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-sm text-stone">
                Page{" "}
                <span className="font-medium text-forest">{page}</span> of{" "}
                <span className="font-medium text-forest">{totalPages}</span>
              </p>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm font-medium text-forest transition hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
              <form
                className="flex items-center gap-2 border-l border-forest/10 pl-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  goToTypedPage();
                }}
              >
                <label className="flex items-center gap-2 text-sm text-stone">
                  <span className="whitespace-nowrap">Go to</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                    onBlur={goToTypedPage}
                    aria-label="Page number"
                    className="w-16 rounded-xl border border-forest/15 bg-white px-2 py-2 text-center text-sm text-ink outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/20"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-xl bg-forest px-3 py-2 text-sm font-medium text-white transition hover:bg-forest/90"
                >
                  Go
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
