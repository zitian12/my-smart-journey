import { Link } from "react-router-dom";
import { MalaysiaMap } from "../components/MalaysiaMap";
import { HERO_IMAGE, destinations } from "../data/malaysia";

export function Home() {
  return (
    <div className="bg-mist">
      {/* Hero — full-bleed */}
      <section className="relative isolate flex min-h-[calc(100vh-4.5rem)] items-end overflow-hidden sm:items-center">
        <img
          src={HERO_IMAGE}
          alt="Petronas Twin Towers in Kuala Lumpur at dusk"
          className="absolute inset-0 -z-20 h-full w-full object-cover animate-hero-zoom"
        />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 via-ink/45 to-ink/20"
          aria-hidden
        />

        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-16">
          <div className="max-w-2xl animate-fade-up">
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              My Smart Journey
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/90 sm:text-xl">
              Plan Sustainable & Personalized Trips Across Malaysia
            </p>
            <Link
              to="/itinerary"
              className="mt-8 inline-flex items-center justify-center rounded-lg bg-leaf px-7 py-3.5 text-base font-semibold text-white no-underline shadow-lg shadow-ink/20 transition hover:bg-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Start Planning
            </Link>
          </div>
        </div>
      </section>

      {/* Popular destinations */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mb-10 max-w-2xl animate-fade-up">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            Discover Malaysia&apos;s Famous Places
          </h2>
          <p className="mt-3 text-stone">
            From city lights to highland mist — start with the destinations
            travelers love most.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((place, index) => (
            <article
              key={place.id}
              className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/5 transition duration-300 hover:-translate-y-1 hover:shadow-md animate-fade-up"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={place.image}
                  alt={place.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <div className="space-y-2 p-5">
                <h3 className="text-lg font-semibold text-ink">{place.name}</h3>
                <p className="text-sm leading-relaxed text-stone">
                  {place.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Interactive map */}
      <section className="border-t border-forest/10 bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
              Explore Malaysia
            </h2>
            <p className="mt-3 text-stone">
              Pan and zoom the map, then tap a marker to preview major cities
              across Peninsular and East Malaysia.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl ring-1 ring-forest/10 shadow-sm">
            <MalaysiaMap />
          </div>
        </div>
      </section>
    </div>
  );
}
