import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import { FavouriteHeartButton } from "../components/FavouriteHeartButton";
import { MalaysiaMap } from "../components/MalaysiaMap";
import { useAuth } from "../context/AuthContext";
import { fetchDestinationById } from "../services/destinationApi";
import {
  addFavourite,
  listFavouriteIds,
  removeFavourite,
} from "../services/favouriteApi";
import type { Destination } from "../types/destination";
import { realDestinationImages } from "../utils/destinationMedia";

export function DestinationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, getAccessToken } = useAuth();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [isFavourite, setIsFavourite] = useState(false);
  const [favouriteMessage, setFavouriteMessage] = useState<string | null>(null);
  const [favouriteBusy, setFavouriteBusy] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    async function loadFavouriteState() {
      if (!id || !isAuthenticated) {
        setIsFavourite(false);
        return;
      }
      const token = getAccessToken();
      if (!token) {
        setIsFavourite(false);
        return;
      }
      try {
        const ids = await listFavouriteIds(token);
        if (!cancelled) {
          setIsFavourite(ids.includes(id));
        }
      } catch {
        if (!cancelled) {
          setIsFavourite(false);
        }
      }
    }

    void loadFavouriteState();
    return () => {
      cancelled = true;
    };
  }, [id, isAuthenticated, getAccessToken]);

  const handleToggleFavourite = async () => {
    if (!destination) return;
    if (!isAuthenticated) {
      setFavouriteMessage("Please sign in from the sidebar to save favourites.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setFavouriteMessage("Please sign in from the sidebar to save favourites.");
      return;
    }

    const next = !isFavourite;
    setFavouriteBusy(true);
    setFavouriteMessage(null);
    setIsFavourite(next);
    try {
      if (next) {
        await addFavourite(token, destination.id);
      } else {
        await removeFavourite(token, destination.id);
      }
    } catch (err) {
      setIsFavourite(!next);
      setFavouriteMessage(
        err instanceof Error ? err.message : "Failed to update favourite",
      );
    } finally {
      setFavouriteBusy(false);
    }
  };

  if (loading) {
    return <p className="animate-fade-up text-stone">Loading destination…</p>;
  }

  if (error || !destination) {
    return (
      <div className="animate-fade-up space-y-4">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error ?? "Destination not found"}
        </p>
        <Link to="/destinations" className="text-sm font-medium text-leaf hover:underline">
          Back to destinations
        </Link>
      </div>
    );
  }

  const images = realDestinationImages(destination.images);
  const hasCoords =
    typeof destination.latitude === "number" &&
    typeof destination.longitude === "number";

  return (
    <div className="animate-fade-up space-y-10">
      <div>
        <Link
          to="/destinations"
          className="text-sm font-medium text-leaf hover:underline"
        >
          ← Back to destinations
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-wider text-leaf">
              {destination.category_name ?? "Destination"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl font-semibold tracking-tight text-forest sm:text-5xl">
                {destination.destination_name}
              </h1>
              <FavouriteHeartButton
                filled={isFavourite}
                onClick={() => {
                  void handleToggleFavourite();
                }}
                disabled={favouriteBusy}
                size="md"
                className="bg-white ring-1 ring-forest/10"
              />
            </div>
            {destination.description ? (
              <p className="mt-4 text-lg leading-relaxed text-stone">
                {destination.description}
              </p>
            ) : (
              <p className="mt-4 text-lg leading-relaxed text-stone/70">
                Details will appear here once the description is ready.
              </p>
            )}
            {favouriteMessage ? (
              <p className="mt-3 text-sm text-amber-800">{favouriteMessage}</p>
            ) : null}
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
