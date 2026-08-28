import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LazyMalaysiaMap } from "../components/MalaysiaMap";
import { HERO_IMAGE, destinations as fallbackDestinations } from "../data/malaysia";
import { fetchDestinations } from "../services/destinationApi";
import type { Destination } from "../types/destination";

type PopularPlace = {
  id: string;
  name: string;
  description: string;
  image: string;
};

function toPopularPlace(destination: Destination): PopularPlace {
  return {
    id: destination.id,
    name: destination.destination_name,
    description: destination.description,
    image: destination.images[0] ?? "",
  };
}

export function Home() {
  const [popular, setPopular] = useState<PopularPlace[]>(
    fallbackDestinations.map((place) => ({
      id: place.id,
      name: place.name,
      description: place.description,
      image: place.image,
    })),
  );
  const [fromApi, setFromApi] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPopular() {
      try {
        const data = await fetchDestinations({ page: 1, page_size: 6 });
        if (cancelled || data.items.length === 0) {
          return;
        }
        setPopular(data.items.slice(0, 6).map(toPopularPlace));
        setFromApi(true);
      } catch {
        // Keep static fallback when API/sync is unavailable.
      }
    }

    void loadPopular();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-mist">
      <section className="relative isolate flex min-h-[calc(100vh-4.5rem)] items-end overflow-hidden sm:items-center">
        <img
          src={HERO_IMAGE}
          alt="Petronas Twin Towers in Kuala Lumpur at dusk"
          className="absolute inset-0 -z-20 h-full w-full object-cover animate-hero-zoom"
        />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/90 via-ink/50 to-forest/25"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-t from-ink/70 to-transparent"
          aria-hidden
        />

        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-16">
          <div className="max-w-2xl animate-fade-up">
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white drop-shadow-sm sm:text-6xl lg:text-7xl">
              My Smart Journey
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/90 sm:text-xl">
              Plan Sustainable & Personalized Trips Across Malaysia
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/planning"
                className="inline-flex items-center justify-center rounded-xl bg-leaf px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-ink/30 transition duration-300 hover:-translate-y-0.5 hover:bg-forest hover:shadow-xl active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Start Planning
              </Link>
              <Link
                to="/destinations"
                className="text-sm font-semibold text-white/85 underline-offset-4 transition hover:text-white hover:underline"
              >
                Explore destinations
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wider text-leaf">
              Explore
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
              Discover Malaysia&apos;s Famous Places
            </h2>
            <p className="mt-3 text-stone">
              From city lights to highland mist — start with the destinations
              travelers love most.
            </p>
          </div>
          {fromApi ? (
            <Link
              to="/destinations"
              className="text-sm font-semibold text-leaf transition hover:text-forest"
            >
              View all destinations →
            </Link>
          ) : null}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {popular.map((place, index) => {
            const card = (
              <>
                <div className="relative aspect-[4/3] overflow-hidden">
                  {place.image ? (
                    <img
                      src={place.image}
                      alt={place.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-leaf/20 to-forest/30" />
                  )}
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent"
                    aria-hidden
                  />
                  <div className="absolute inset-x-0 bottom-0 space-y-1 p-5">
                    <h3 className="font-display text-xl font-semibold text-white drop-shadow">
                      {place.name}
                    </h3>
                    {place.description ? (
                      <p className="line-clamp-2 text-sm leading-relaxed text-white/85">
                        {place.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </>
            );

            const className =
              "group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/10 transition duration-300 hover:-translate-y-1 hover:shadow-lg animate-fade-up";

            if (fromApi) {
              return (
                <Link
                  key={place.id}
                  to={`/destinations/${place.id}`}
                  className={`${className} block`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  {card}
                </Link>
              );
            }

            return (
              <article
                key={place.id}
                className={className}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {card}
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-forest/10 bg-gradient-to-b from-white/80 to-mist">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mb-8 max-w-2xl animate-fade-up">
            <p className="text-sm font-medium uppercase tracking-wider text-leaf">
              Map
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
              Explore Malaysia
            </h2>
            <p className="mt-3 text-stone">
              Pan and zoom the map, then tap a marker to preview major cities
              across Peninsular and East Malaysia.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-forest/10">
            <LazyMalaysiaMap />
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              to="/destinations"
              className="inline-flex items-center justify-center rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white shadow-md transition duration-300 hover:-translate-y-0.5 hover:bg-leaf hover:shadow-lg active:translate-y-0"
            >
              Browse destinations
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
