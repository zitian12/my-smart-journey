import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DailyGroup } from "../types/daily";

const SLIDE_MS = 5000;

function displayName(group: DailyGroup): string {
  return group.user.nickname.trim() || group.user.full_name || group.user.email;
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" />
    </svg>
  );
}

export function DailyViewer({
  groups,
  startGroupIndex,
  startItemIndex = 0,
  currentUserId,
  onClose,
  onDelete,
}: {
  groups: DailyGroup[];
  startGroupIndex: number;
  startItemIndex?: number;
  currentUserId: string;
  onClose: () => void;
  onDelete?: (dailyId: string) => Promise<void>;
}) {
  const [feed, setFeed] = useState(() =>
    groups.filter((group) => group.items.length > 0),
  );
  const [groupIndex, setGroupIndex] = useState(() =>
    Math.max(0, Math.min(startGroupIndex, Math.max(feed.length - 1, 0))),
  );
  const [itemIndex, setItemIndex] = useState(() => {
    const startGroup =
      feed[Math.max(0, Math.min(startGroupIndex, Math.max(feed.length - 1, 0)))];
    if (!startGroup || startGroup.items.length === 0) return 0;
    return Math.max(
      0,
      Math.min(startItemIndex, startGroup.items.length - 1),
    );
  });
  const [paused, setPaused] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const group = feed[groupIndex] ?? null;
  const item = group?.items[itemIndex] ?? null;
  const isOwn = group?.user.id === currentUserId;

  const goNext = useCallback(() => {
    const currentGroup = feed[groupIndex];
    if (!currentGroup) return;
    if (itemIndex < currentGroup.items.length - 1) {
      setItemIndex(itemIndex + 1);
      return;
    }
    if (groupIndex < feed.length - 1) {
      setGroupIndex(groupIndex + 1);
      setItemIndex(0);
      return;
    }
    onClose();
  }, [feed, groupIndex, itemIndex, onClose]);

  const goPrev = useCallback(() => {
    if (itemIndex > 0) {
      setItemIndex(itemIndex - 1);
      return;
    }
    if (groupIndex > 0) {
      const previous = feed[groupIndex - 1];
      setGroupIndex(groupIndex - 1);
      setItemIndex(Math.max(0, previous.items.length - 1));
    }
  }, [feed, groupIndex, itemIndex]);

  useEffect(() => {
    if (!group) {
      onClose();
    }
  }, [group, onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!group || paused || deleting || confirmOpen) return;
    const timer = window.setTimeout(goNext, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [confirmOpen, deleting, goNext, group, itemIndex, paused]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirmOpen) {
          setConfirmOpen(false);
          return;
        }
        onClose();
      }
      if (confirmOpen) return;
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, goNext, goPrev, onClose]);

  const confirmDelete = async () => {
    if (!item || !onDelete || !group) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
      setConfirmOpen(false);
      const nextFeed = feed
        .map((entry) =>
          entry.user.id === group.user.id
            ? {
                ...entry,
                items: entry.items.filter((daily) => daily.id !== item.id),
              }
            : entry,
        )
        .filter((entry) => entry.items.length > 0);
      if (nextFeed.length === 0) {
        onClose();
        return;
      }
      setFeed(nextFeed);
      setGroupIndex((current) => Math.min(current, nextFeed.length - 1));
      setItemIndex(0);
    } finally {
      setDeleting(false);
    }
  };

  if (!group || !item) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black"
      onClick={onClose}
    >
      <div
        className="relative h-svh w-full max-w-[420px] overflow-hidden bg-black text-white sm:h-[min(100svh,840px)] sm:rounded-2xl sm:shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={item.image_url}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-75"
        />
        <img
          src={item.image_url}
          alt={item.caption || "Daily"}
          className="relative z-[1] h-full w-full object-contain"
        />

        <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex gap-1">
            {group.items.map((daily, index) => (
              <div
                key={daily.id}
                className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                <div
                  key={`${daily.id}-${index === itemIndex ? itemIndex : "done"}`}
                  className={[
                    "h-full bg-white",
                    index < itemIndex ? "w-full" : "",
                    index > itemIndex ? "w-0" : "",
                    index === itemIndex ? "animate-daily-progress" : "",
                    index === itemIndex && paused
                      ? "[animation-play-state:paused]"
                      : "",
                  ].join(" ")}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {group.user.profile_picture ? (
                <img
                  src={group.user.profile_picture}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-white/40"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-semibold ring-1 ring-white/40">
                  {displayName(group).charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <p className="truncate text-sm font-semibold drop-shadow">
                {displayName(group)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isOwn && onDelete ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmOpen(true)}
                  aria-label="Remove daily"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white transition hover:bg-black/55 disabled:opacity-60"
                >
                  <TrashIcon />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white transition hover:bg-black/55"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Previous"
          className="absolute inset-y-0 left-0 z-10 w-1/3"
          onClick={goPrev}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        />
        <button
          type="button"
          aria-label="Next"
          className="absolute inset-y-0 right-0 z-10 w-2/3"
          onClick={goNext}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        />

        {item.caption ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-12 text-sm drop-shadow">
            {item.caption}
          </p>
        ) : null}

        {confirmOpen ? (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-daily-title"
            onClick={() => {
              if (!deleting) setConfirmOpen(false);
            }}
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-ink shadow-2xl ring-1 ring-black/5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-red-100 bg-gradient-to-br from-red-50 to-white px-5 pb-4 pt-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700 ring-8 ring-red-50">
                  <TrashIcon />
                </div>
                <h2
                  id="remove-daily-title"
                  className="mt-4 font-display text-lg font-semibold tracking-tight"
                >
                  Remove this daily?
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-stone">
                  It will disappear from your avatar and archive. This cannot be
                  undone.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone ring-1 ring-forest/15 transition hover:bg-mist disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void confirmDelete()}
                  className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
