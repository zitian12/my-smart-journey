import { destinationCategories } from "../data/destinationCategories";

function PlaceCard({
  name,
  description,
  state,
  image,
}: {
  name: string;
  description: string;
  state: string;
  image: string;
}) {
  return (
    <article
      className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="aspect-[4/3] overflow-hidden">
        <img
          src={image}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </div>
      <div className="space-y-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">{name}</h3>
          <span className="shrink-0 rounded-full bg-leaf/10 px-2.5 py-0.5 text-xs font-medium text-leaf">
            {state}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-stone">{description}</p>
      </div>
    </article>
  );
}

export function DestinationsPage() {
  return (
    <div className="animate-fade-up">
      <header className="mb-12 max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wider text-leaf">
          Explore
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-forest sm:text-5xl">
          Trending Places in Malaysia
        </h1>
        <p className="mt-4 text-lg text-stone">
          Curated destinations across beaches, cities, highlands, and heritage
          towns — start dreaming about your next trip.
        </p>
      </header>

      <div className="space-y-16 sm:space-y-20">
        {destinationCategories.map((category) => (
          <section key={category.id} aria-labelledby={`category-${category.id}`}>
            <div className="mb-6 sm:mb-8">
              <h2
                id={`category-${category.id}`}
                className="font-display text-2xl font-semibold tracking-tight text-forest sm:text-3xl"
              >
                {category.title}
              </h2>
              <p className="mt-2 text-stone">{category.description}</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {category.places.map((place) => (
                <PlaceCard
                  key={place.id}
                  name={place.name}
                  description={place.description}
                  state={place.state}
                  image={place.image}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
