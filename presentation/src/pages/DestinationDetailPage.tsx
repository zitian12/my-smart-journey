import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import { MalaysiaMap } from "../components/MalaysiaMap";
import { fetchDestinationById } from "../services/destinationApi";
import type { Destination } from "../types/destination";

export function DestinationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (!id) {
      setError("Destination not found");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDestinationById(id!);
        if (!cancelled) {
          setDestination(data);
          setActiveImage(0);
        }
      } catch (err) {
        if (!cancelled) {
          setDestination(null);
          setError(err instanceof Error ? err.message : "Destination not found");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <p className="animate-fade-up text-stone">Loading destination…</p>;
  }

  if (error || !destination) {
    return (
      <div className="animate-fade-up space-y-4">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error ?? "Destination not found"}
        </p>
        <Link to="/dashboard/destinations" className="text-sm font-medium text-leaf hover:underline">
          Back to destinations
        </Link>
      </div>
    );
  }

  const images = destination.images.length
    ? destination.images
    : [];
  const hasCoords =
    typeof destination.latitude === "number" &&
    typeof destination.longitude === "number";

  return (
    <div className="animate-fade-up space-y-10">
      <div>
        <Link
          to="/dashboard/destinations"
          className="text-sm font-medium text-leaf hover:underline"
        >
          ← Back to destinations
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-wider text-leaf">
              {destination.category_name ?? "Destination"}
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-forest sm:text-5xl">
              {destination.destination_name}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-stone">
              {destination.description}
            </p>
          </div>
          {destination.state ? (
            <span className="rounded-full bg-leaf/10 px-3 py-1 text-sm font-medium text-leaf">
              {destination.state}
            </span>
          ) : null}
        </div>
      </div>

      {images.length > 0 ? (
        <section className="space-y-3">
          <div className="overflow-hidden rounded-2xl bg-mist ring-1 ring-forest/10">
            <DestinationImage
              images={images.slice(activeImage).concat(images.slice(0, activeImage))}
              alt={destination.destination_name}
              className="aspect-[16/9] w-full object-cover"
            />
          </div>
          {images.length > 1 ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {images.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`h-20 w-28 shrink-0 overflow-hidden rounded-xl ring-2 transition ${
                    index === activeImage
                      ? "ring-leaf"
                      : "ring-transparent opacity-80 hover:opacity-100"
                  }`}
                >
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/80 p-5 ring-1 ring-forest/10">
          <h2 className="font-display text-xl font-semibold text-forest">
            Location
          </h2>
          <p className="mt-2 text-stone">
            {destination.location || destination.state || "Malaysia"}
          </p>
        </div>
        <div className="rounded-2xl bg-white/80 p-5 ring-1 ring-forest/10">
          <h2 className="font-display text-xl font-semibold text-forest">
            Operating hours
          </h2>
          <p className="mt-2 text-stone">
            {destination.operating_hours || "Hours vary — check locally before visiting."}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight text-forest">
          On the map
        </h2>
        {hasCoords ? (
          <MalaysiaMap
            key={destination.id}
            center={[destination.latitude!, destination.longitude!]}
            zoom={11}
            markers={[
              {
                id: destination.id,
                name: destination.destination_name,
                lat: destination.latitude!,
                lng: destination.longitude!,
              },
            ]}
            className="h-[min(60vh,480px)] w-full rounded-2xl z-0"
          />
        ) : (
          <p className="rounded-2xl bg-white/70 px-5 py-8 text-stone ring-1 ring-forest/10">
            Map coordinates are not available for this destination yet.
          </p>
        )}
      </section>
    </div>
  );
}
