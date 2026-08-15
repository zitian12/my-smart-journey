import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import { FavouriteHeartButton } from "../components/FavouriteHeartButton";
import { useAuth } from "../context/AuthContext";
import {
  addFolderItem,
  createFavouriteFolder,
  deleteFavouriteFolder,
  listFavouriteFolders,
  listFavourites,
  listFolderItems,
  removeFavourite,
  removeFolderItem,
  renameFavouriteFolder,
} from "../services/favouriteApi";
import type { Destination } from "../types/destination";
import type { FavouriteFolder } from "../types/favourite";
import {
  categoryPlaceholderClass,
  realDestinationImages,
} from "../utils/destinationMedia";

type Selection = "all" | string;

function FavouriteCard({
  destination,
  onUnfavourite,
  onAddToFolder,
  onRemoveFromFolder,
  showAddToFolder,
  showRemoveFromFolder,
}: {
  destination: Destination;
  onUnfavourite: (destinationId: string) => void;
  onAddToFolder?: (destinationId: string) => void;
  onRemoveFromFolder?: (destinationId: string) => void;
  showAddToFolder?: boolean;
  showRemoveFromFolder?: boolean;
}) {
  const images = realDestinationImages(destination.images);
  const label =
    destination.category_name ||
    destination.category_slug ||
    "Destination";

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/5">
      <div className="relative aspect-[4/3] overflow-hidden bg-mist">
        <FavouriteHeartButton
          filled
          onClick={() => onUnfavourite(destination.id)}
          className="absolute right-3 top-3 z-10 bg-white/85 shadow-sm backdrop-blur-sm"
        />
        <Link to={`/dashboard/destinations/${destination.id}`} className="block h-full">
          {images.length > 0 ? (
            <DestinationImage
              images={images}
              alt={destination.destination_name}
              className="h-full w-full object-cover"
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
        </Link>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <Link
            to={`/dashboard/destinations/${destination.id}`}
            className="text-lg font-semibold text-ink no-underline hover:text-forest"
          >
            {destination.destination_name}
          </Link>
          {destination.state ? (
            <p className="mt-1 text-xs font-medium text-leaf">{destination.state}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {showAddToFolder && onAddToFolder ? (
            <button
              type="button"
              onClick={() => onAddToFolder(destination.id)}
              className="rounded-lg border border-leaf/30 px-2.5 py-1.5 text-xs font-medium text-forest transition-colors hover:bg-leaf/5"
            >
              Add to folder
            </button>
          ) : null}
          {showRemoveFromFolder && onRemoveFromFolder ? (
            <button
              type="button"
              onClick={() => onRemoveFromFolder(destination.id)}
              className="rounded-lg border border-forest/15 px-2.5 py-1.5 text-xs font-medium text-stone transition-colors hover:bg-mist"
            >
              Remove from folder
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function FavouritesPage() {
  const { isAuthenticated, getAccessToken } = useAuth();
  const [selection, setSelection] = useState<Selection>("all");
  const [folders, setFolders] = useState<FavouriteFolder[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [allFavourites, setAllFavourites] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [addTargetId, setAddTargetId] = useState<string | null>(null);
  const [pickDestinationId, setPickDestinationId] = useState("");

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selection) ?? null,
    [folders, selection],
  );

  const loadFolders = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const data = await listFavouriteFolders(token);
    setFolders(data);
  }, [getAccessToken]);

  const loadContent = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const favourites = await listFavourites(token);
      setAllFavourites(favourites);
      if (selection === "all") {
        setDestinations(favourites);
      } else {
        const items = await listFolderItems(token, selection);
        setDestinations(items);
      }
      await loadFolders();
    } catch (err) {
      setDestinations([]);
      setError(err instanceof Error ? err.message : "Failed to load favourites");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, loadFolders, selection]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFolders([]);
      setDestinations([]);
      setAllFavourites([]);
      setLoading(false);
      setError(null);
      return;
    }
    void loadContent();
  }, [isAuthenticated, loadContent]);

  useEffect(() => {
    if (selectedFolder) {
      setRenameValue(selectedFolder.name);
    } else {
      setRenameValue("");
    }
  }, [selectedFolder]);

  const requireToken = () => {
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in from the sidebar to manage favourites.");
      return null;
    }
    return token;
  };

  const handleCreateFolder = async () => {
    const token = requireToken();
    if (!token) return;
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError(null);
    try {
      const folder = await createFavouriteFolder(token, name);
      setNewFolderName("");
      setFolders((current) => [folder, ...current]);
      setSelection(folder.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!selectedFolder) return;
    const token = requireToken();
    if (!token) return;
    const name = renameValue.trim();
    if (!name || name === selectedFolder.name) return;
    setRenaming(true);
    setError(null);
    try {
      const updated = await renameFavouriteFolder(token, selectedFolder.id, name);
      setFolders((current) =>
        current.map((folder) => (folder.id === updated.id ? updated : folder)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename folder");
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!selectedFolder) return;
    const token = requireToken();
    if (!token) return;
    if (
      !window.confirm(
        `Delete folder “${selectedFolder.name}”? Destinations stay in All favourites.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteFavouriteFolder(token, selectedFolder.id);
      setSelection("all");
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete folder");
    }
  };

  const handleUnfavourite = async (destinationId: string) => {
    const token = requireToken();
    if (!token) return;
    setError(null);
    try {
      await removeFavourite(token, destinationId);
      setDestinations((current) =>
        current.filter((item) => item.id !== destinationId),
      );
      setAllFavourites((current) =>
        current.filter((item) => item.id !== destinationId),
      );
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove favourite");
    }
  };

  const handleRemoveFromFolder = async (destinationId: string) => {
    if (selection === "all") return;
    const token = requireToken();
    if (!token) return;
    setError(null);
    try {
      await removeFolderItem(token, selection, destinationId);
      setDestinations((current) =>
        current.filter((item) => item.id !== destinationId),
      );
      await loadFolders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove from folder",
      );
    }
  };

  const handleAddToFolder = async (destinationId: string, folderId: string) => {
    const token = requireToken();
    if (!token) return;
    setError(null);
    try {
      await addFolderItem(token, folderId, destinationId);
      setAddTargetId(null);
      await loadFolders();
      if (selection === folderId) {
        await loadContent();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to folder");
    }
  };

  const handleAddFromPicker = async () => {
    if (selection === "all" || !pickDestinationId) return;
    await handleAddToFolder(pickDestinationId, selection);
    setPickDestinationId("");
  };

  const folderEligible = useMemo(() => {
    if (selection === "all") return [];
    const inFolder = new Set(destinations.map((item) => item.id));
    return allFavourites.filter((item) => !inFolder.has(item.id));
  }, [allFavourites, destinations, selection]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-up space-y-4">
        <p className="text-sm font-medium uppercase tracking-wider text-leaf">
          Favourites
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-forest">
          Your saved places
        </h1>
        <p className="rounded-2xl bg-white/80 px-5 py-8 text-stone ring-1 ring-forest/10">
          Sign in from the sidebar to save destinations and organise them into
          folders.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-8">
      <header className="max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wider text-leaf">
          Favourites
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-forest sm:text-5xl">
          Your saved places
        </h1>
        <p className="mt-4 text-lg text-stone">
          Keep destinations you love, then sort them into folders for later trips.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-2xl bg-white/80 p-4 ring-1 ring-forest/10">
          <nav className="space-y-1" aria-label="Favourite folders">
            <button
              type="button"
              onClick={() => setSelection("all")}
              className={[
                "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                selection === "all"
                  ? "bg-leaf/10 text-forest"
                  : "text-stone hover:bg-mist hover:text-forest",
              ].join(" ")}
            >
              <span>All favourites</span>
              <span className="text-xs text-forest/60">{allFavourites.length}</span>
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setSelection(folder.id)}
                className={[
                  "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  selection === folder.id
                    ? "bg-leaf/10 text-forest"
                    : "text-stone hover:bg-mist hover:text-forest",
                ].join(" ")}
              >
                <span className="truncate">{folder.name}</span>
                <span className="shrink-0 text-xs text-forest/60">
                  {folder.item_count}
                </span>
              </button>
            ))}
          </nav>

          <div className="space-y-2 border-t border-forest/10 pt-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-forest/70">
                New folder
              </span>
              <input
                type="text"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Weekend escapes"
                className="w-full rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/20"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                void handleCreateFolder();
              }}
              disabled={creatingFolder || !newFolderName.trim()}
              className="w-full rounded-lg bg-forest px-3 py-2 text-sm font-medium text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingFolder ? "Creating…" : "Create folder"}
            </button>
          </div>
        </aside>

        <section className="space-y-5">
          {selectedFolder ? (
            <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-forest/10">
              <label className="min-w-[200px] flex-1 space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-forest/70">
                  Folder name
                </span>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  className="w-full rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/20"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  void handleRenameFolder();
                }}
                disabled={
                  renaming ||
                  !renameValue.trim() ||
                  renameValue.trim() === selectedFolder.name
                }
                className="rounded-lg border border-leaf/30 px-3 py-2 text-sm font-medium text-forest transition-colors hover:bg-leaf/5 disabled:opacity-50"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteFolder();
                }}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                Delete folder
              </button>
            </div>
          ) : null}

          {selectedFolder ? (
            <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-forest/10">
              <label className="min-w-[220px] flex-1 space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-forest/70">
                  Add from favourites
                </span>
                <select
                  value={pickDestinationId}
                  onChange={(event) => setPickDestinationId(event.target.value)}
                  className="w-full rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/20"
                >
                  <option value="">Select a destination</option>
                  {folderEligible.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.destination_name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  void handleAddFromPicker();
                }}
                disabled={!pickDestinationId}
                className="rounded-lg bg-leaf px-3 py-2 text-sm font-medium text-white transition hover:bg-leaf/90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : null}

          {loading ? (
            <p className="text-stone">Loading favourites…</p>
          ) : destinations.length === 0 ? (
            <p className="rounded-2xl bg-white/70 px-5 py-8 text-stone ring-1 ring-forest/10">
              {selection === "all"
                ? "No favourites yet. Browse Destinations and tap the heart to save places here."
                : "This folder is empty. Add destinations from your favourites above."}
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {destinations.map((destination) => (
                <FavouriteCard
                  key={destination.id}
                  destination={destination}
                  onUnfavourite={(destinationId) => {
                    void handleUnfavourite(destinationId);
                  }}
                  showAddToFolder={selection === "all" && folders.length > 0}
                  showRemoveFromFolder={selection !== "all"}
                  onAddToFolder={(destinationId) => setAddTargetId(destinationId)}
                  onRemoveFromFolder={(destinationId) => {
                    void handleRemoveFromFolder(destinationId);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {addTargetId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-forest/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-to-folder-title"
          onClick={() => setAddTargetId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg ring-1 ring-forest/10"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="add-to-folder-title"
              className="font-display text-xl font-semibold text-forest"
            >
              Add to folder
            </h2>
            <p className="mt-1 text-sm text-stone">
              Choose a folder for this destination.
            </p>
            <div className="mt-4 space-y-2">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    void handleAddToFolder(addTargetId, folder.id);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-forest/10 px-3 py-2.5 text-left text-sm font-medium text-forest transition hover:bg-mist"
                >
                  <span>{folder.name}</span>
                  <span className="text-xs text-stone">{folder.item_count}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddTargetId(null)}
              className="mt-4 w-full rounded-lg border border-forest/15 px-3 py-2 text-sm font-medium text-stone hover:bg-mist"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
