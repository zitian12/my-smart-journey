import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { DailyViewer } from "../components/DailyViewer";
import { useAuth } from "../context/AuthContext";
import { usePendingCounts } from "../context/PendingCountsContext";
import {
  acceptFriendRequest,
  declineFriendRequest,
  listFriends,
  listPendingConnections,
  removeConnection,
  searchUsers,
  sendFriendRequest,
} from "../services/connectionApi";
import {
  createDaily,
  deleteDaily,
  listDailies,
  listDailyHistory,
} from "../services/dailyApi";
import { getItinerary, listItineraries } from "../services/itineraryApi";
import {
  inviteFriendToTrip,
  listSharesWithFriend,
  revokeTripShare,
} from "../services/tripShareApi";
import type {
  ConnectionItem,
  FriendShares,
  PendingConnections,
  TripShareItem,
  UserSearchResult,
} from "../types/connection";
import type { DailyFeed, DailyGroup, DailyItem } from "../types/daily";
import type { SavedItinerarySummary } from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";

const DAILY_SEEN_KEY = "daily_seen_user_ids";
const EMPTY_DAILY_USER = {
  id: "",
  email: "",
  full_name: "",
  nickname: "",
  profile_picture: "",
  bio: "",
};
const EMPTY_DAILY_FEED: DailyFeed = {
  me: { user: EMPTY_DAILY_USER, items: [] },
  friends: [],
};

function loadSeenDailyIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DAILY_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function persistSeenDailyIds(seen: Set<string>) {
  sessionStorage.setItem(DAILY_SEEN_KEY, JSON.stringify([...seen]));
}

function dailyDisplayName(group: DailyGroup): string {
  return group.user.nickname.trim() || group.user.full_name || group.user.email;
}

function isDailyExpired(item: DailyItem): boolean {
  if (!item.expires_at) return false;
  const expires = new Date(item.expires_at).getTime();
  if (Number.isNaN(expires)) return false;
  return expires <= Date.now();
}

function formatDailyWhen(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayName(item: ConnectionItem): string {
  return item.user.nickname.trim() || item.user.full_name || item.user.email;
}

function Avatar({
  picture,
  name,
  size = "md",
}: {
  picture: string;
  name: string;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "h-16 w-16 text-lg" : "h-12 w-12 text-sm";
  if (picture) {
    return (
      <img
        src={picture}
        alt={name}
        className={`${box} rounded-full object-cover ring-2 ring-leaf/20`}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      className={`flex ${box} items-center justify-center rounded-full bg-leaf/15 font-semibold text-forest`}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function RingAvatar({
  picture,
  name,
  active = false,
  seen = false,
  showAdd = false,
}: {
  picture: string;
  name: string;
  active?: boolean;
  seen?: boolean;
  showAdd?: boolean;
}) {
  const ring = active
    ? seen
      ? "bg-stone/40"
      : "bg-[conic-gradient(from_180deg,#f59e0b,#2d6a4f,#f59e0b)]"
    : "bg-transparent";

  return (
    <div className="relative">
      <div className={`rounded-full p-[2px] ${ring}`}>
        <div className="rounded-full bg-white p-[2px]">
          <Avatar picture={picture} name={name} />
        </div>
      </div>
      {showAdd ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold leading-none text-white ring-2 ring-white">
          +
        </span>
      ) : null}
    </div>
  );
}

export function ConnectionsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, getAccessToken } = useAuth();
  const { refreshPending } = usePendingCounts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchBusyId, setSearchBusyId] = useState<string | null>(null);
  const [friends, setFriends] = useState<ConnectionItem[]>([]);
  const [pending, setPending] = useState<PendingConnections>({
    incoming: [],
    outgoing: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shares, setShares] = useState<FriendShares>({
    from_friend: [],
    to_friend: [],
  });
  const [myTrips, setMyTrips] = useState<SavedItinerarySummary[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [dailyFeed, setDailyFeed] = useState<DailyFeed>(EMPTY_DAILY_FEED);
  const [seenDailyIds, setSeenDailyIds] = useState<Set<string>>(loadSeenDailyIds);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  const [draftCaption, setDraftCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<DailyItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archiveViewerIndex, setArchiveViewerIndex] = useState<number | null>(
    null,
  );

  const selectedFriend = friends.find((item) => item.id === selectedId) ?? null;
  const viewerGroups = [
    ...(dailyFeed.me.items.length > 0 ? [dailyFeed.me] : []),
    ...dailyFeed.friends,
  ];
  const ownName =
    user?.nickname.trim() || user?.name || dailyFeed.me.user.full_name || "You";
  const ownPicture = user?.profile_picture || dailyFeed.me.user.profile_picture || "";
  const archiveGroup: DailyGroup = {
    user: {
      id: user?.id || dailyFeed.me.user.id || "",
      email: user?.email || dailyFeed.me.user.email || "",
      full_name: user?.name || dailyFeed.me.user.full_name || "You",
      nickname: user?.nickname || dailyFeed.me.user.nickname || "",
      profile_picture: ownPicture,
      bio: user?.bio || dailyFeed.me.user.bio || "",
    },
    items: historyItems,
  };

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setFriends([]);
      setPending({ incoming: [], outgoing: [] });
      setDailyFeed(EMPTY_DAILY_FEED);
      setHistoryItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setHistoryLoading(true);
    setError(null);
    try {
      const [friendRows, pendingRows, dailyRows, historyRows] = await Promise.all([
        listFriends(token),
        listPendingConnections(token),
        listDailies(token),
        listDailyHistory(token),
      ]);
      setFriends(friendRows);
      setPending(pendingRows);
      setDailyFeed(dailyRows);
      setHistoryItems(historyRows.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load friends");
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  }, [getAccessToken]);

  const loadPanel = useCallback(
    async (friendUserId: string) => {
      const token = getAccessToken();
      if (!token) return;

      setPanelLoading(true);
      setPanelError(null);
      try {
        const [shareRows, trips] = await Promise.all([
          listSharesWithFriend(token, friendUserId),
          listItineraries(token),
        ]);
        setShares(shareRows);
        setMyTrips(trips);
      } catch (err) {
        setPanelError(
          err instanceof Error ? err.message : "Failed to load friend details",
        );
        setShares({ from_friend: [], to_friend: [] });
        setMyTrips([]);
      } finally {
        setPanelLoading(false);
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    void load();
  }, [load, isAuthenticated]);

  useEffect(() => {
    if (!selectedId) return;
    const friend = friends.find((item) => item.id === selectedId);
    if (!friend) return;
    void loadPanel(friend.user.id);
  }, [friends, loadPanel, selectedId]);

  useEffect(() => {
    if (!draftFile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [draftFile]);

  useEffect(() => {
    const token = getAccessToken();
    const query = searchQuery.trim();
    if (!token || query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchUsers(token, query);
          if (!cancelled) setSearchResults(rows);
        } catch (err) {
          if (!cancelled) {
            setSearchResults([]);
            setError(
              err instanceof Error ? err.message : "Failed to search users",
            );
          }
        } finally {
          if (!cancelled) setSearchLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [getAccessToken, searchQuery]);

  const onAddFromSearch = async (result: UserSearchResult) => {
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to add friends.");
      return;
    }

    setSearchBusyId(result.user.id);
    setError(null);
    setMessage(null);
    try {
      if (result.relationship === "pending_in" && result.connection_id) {
        const accepted = await acceptFriendRequest(token, result.connection_id);
        setMessage(`You are now connected with ${displayName(accepted)}.`);
      } else {
        const created = await sendFriendRequest(token, result.user.id);
        if (created.status === "accepted") {
          setMessage(`You are now connected with ${displayName(created)}.`);
        } else {
          setMessage(`Request sent to ${displayName(created)}.`);
        }
      }
      await load();
      await refreshPending();
      if (searchQuery.trim().length >= 2) {
        setSearchResults(await searchUsers(token, searchQuery.trim()));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSearchBusyId(null);
    }
  };

  const runAction = async (
    connectionId: string,
    action: (token: string) => Promise<unknown>,
    successMessage?: string,
  ) => {
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to continue.");
      return;
    }
    setBusyId(connectionId);
    setError(null);
    setMessage(null);
    try {
      await action(token);
      if (successMessage) setMessage(successMessage);
      if (selectedId === connectionId) setSelectedId(null);
      await load();
      await refreshPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const toggleFriend = (item: ConnectionItem) => {
    setSelectedId((current) => (current === item.id ? null : item.id));
    setPanelError(null);
  };

  const openSharedTrip = async (itineraryId: string) => {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(itineraryId);
    setPanelError(null);
    try {
      const detail = await getItinerary(token, itineraryId);
      const sharedBy = detail.shared_by;
      const state = {
        itinerary: detail.itinerary,
        places: detail.places,
        readOnly: Boolean(detail.is_read_only),
        sharedByName: sharedBy
          ? sharedBy.nickname.trim() || sharedBy.full_name || sharedBy.email
          : selectedFriend
            ? displayName(selectedFriend)
            : undefined,
      };
      sessionStorage.setItem(ITINERARY_RESULT_STORAGE_KEY, JSON.stringify(state));
      navigate("/dashboard/planning/result", { state });
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to open trip");
    } finally {
      setBusyId(null);
    }
  };

  const onInvite = async (trip: SavedItinerarySummary) => {
    if (!selectedFriend) return;
    const token = getAccessToken();
    if (!token) return;
    setInviteBusyId(trip.id);
    setPanelError(null);
    try {
      const created = await inviteFriendToTrip(
        token,
        trip.id,
        selectedFriend.user.id,
      );
      setShares((prev) => ({
        ...prev,
        to_friend: [
          created,
          ...prev.to_friend.filter((item) => item.itinerary_id !== trip.id),
        ],
      }));
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviteBusyId(null);
    }
  };

  const onRevoke = async (share: TripShareItem) => {
    if (!selectedFriend) return;
    const token = getAccessToken();
    if (!token) return;
    setInviteBusyId(share.itinerary_id);
    setPanelError(null);
    try {
      await revokeTripShare(token, share.itinerary_id, selectedFriend.user.id);
      setShares((prev) => ({
        ...prev,
        to_friend: prev.to_friend.filter((item) => item.id !== share.id),
      }));
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setInviteBusyId(null);
    }
  };

  const closeComposer = () => {
    setDraftFile(null);
    setDraftCaption("");
    setDraftPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const openViewer = (index: number) => {
    const group = viewerGroups[index];
    if (!group) return;
    setViewerIndex(index);
    setSeenDailyIds((current) => {
      const next = new Set(current);
      next.add(group.user.id);
      persistSeenDailyIds(next);
      return next;
    });
  };

  const onPickDaily = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Daily must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Daily must be 2 MB or smaller.");
      return;
    }
    setError(null);
    setDraftPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setDraftFile(file);
    setDraftCaption("");
  };

  const onPostDaily = async () => {
    const token = getAccessToken();
    if (!token || !draftFile) return;
    setPosting(true);
    setError(null);
    try {
      await createDaily(token, draftFile, draftCaption.trim());
      closeComposer();
      setMessage("Your daily is on your avatar for 24 hours.");
      const [dailyRows, historyRows] = await Promise.all([
        listDailies(token),
        listDailyHistory(token),
      ]);
      setDailyFeed(dailyRows);
      setHistoryItems(historyRows.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post daily");
    } finally {
      setPosting(false);
    }
  };

  const onDeleteDaily = async (dailyId: string) => {
    const token = getAccessToken();
    if (!token) return;
    await deleteDaily(token, dailyId);
    const [dailyRows, historyRows] = await Promise.all([
      listDailies(token),
      listDailyHistory(token),
    ]);
    setDailyFeed(dailyRows);
    setHistoryItems(historyRows.items);
  };

  const onOwnDailyClick = () => {
    if (dailyFeed.me.items.length > 0) {
      openViewer(0);
      return;
    }
    fileInputRef.current?.click();
  };

  const onFriendAvatarClick = (userId: string, fallback?: ConnectionItem) => {
    const index = viewerGroups.findIndex((group) => group.user.id === userId);
    if (index >= 0) {
      openViewer(index);
      return;
    }
    if (fallback) toggleFriend(fallback);
  };

  const sharedTripIds = new Set(shares.to_friend.map((item) => item.itinerary_id));
  const invitableTrips = myTrips.filter((trip) => !sharedTripIds.has(trip.id));

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl animate-fade-up rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-forest/5">
        <h1 className="font-display text-2xl font-semibold text-forest">Friends</h1>
        <p className="mt-2 text-sm text-stone">
          Sign in from the sidebar to connect with other travelers.
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="mt-6 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-leaf"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-leaf">
          Connections
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
          Friends
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone">
          Search for people already on My Smart Journey, then add them. Post a
          photo daily to your avatar — friends can tap it for 24 hours.
        </p>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPickDaily}
      />

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5 sm:p-6">
        <h2 className="text-sm font-semibold text-forest">Today</h2>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
          <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={onOwnDailyClick}
                className="rounded-full"
                aria-label={
                  dailyFeed.me.items.length > 0
                    ? "View your daily"
                    : "Post a daily"
                }
              >
                <RingAvatar
                  picture={ownPicture}
                  name={ownName}
                  active={dailyFeed.me.items.length > 0}
                  seen={seenDailyIds.has(dailyFeed.me.user.id)}
                />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Post a daily"
                className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold leading-none text-white ring-2 ring-white"
              >
                +
              </button>
            </div>
            <p className="w-16 truncate text-center text-[11px] text-stone">
              Your daily
            </p>
          </div>

          {dailyFeed.friends.map((group) => (
            <button
              key={group.user.id}
              type="button"
              onClick={() => onFriendAvatarClick(group.user.id)}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <RingAvatar
                picture={group.user.profile_picture}
                name={dailyDisplayName(group)}
                active
                seen={seenDailyIds.has(group.user.id)}
              />
              <p className="w-16 truncate text-center text-[11px] text-stone">
                {dailyDisplayName(group)}
              </p>
            </button>
          ))}
        </div>
        {dailyFeed.friends.length === 0 && dailyFeed.me.items.length === 0 ? (
          <p className="mt-3 text-xs text-stone">
            Tap + to share a photo. It only stays on your avatar for 24 hours.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-forest">My archive</h2>
            <p className="mt-1 text-xs text-stone">
              Your past dailies stay here after 24 hours. Only you can see this.
            </p>
          </div>
          <p className="shrink-0 text-xs text-stone">
            {historyLoading ? "…" : `${historyItems.length}`}
          </p>
        </div>
        {historyLoading ? (
          <p className="mt-4 text-sm text-stone">Loading archive…</p>
        ) : historyItems.length === 0 ? (
          <p className="mt-4 rounded-xl bg-mist/50 px-3 py-4 text-sm text-stone">
            No dailies yet. Post one from Today and it will show up here.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {historyItems.map((item, index) => {
              const expired = isDailyExpired(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setArchiveViewerIndex(index)}
                    className="group relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-mist ring-1 ring-forest/5 transition hover:ring-leaf/40"
                  >
                    <img
                      src={item.image_url}
                      alt={item.caption || "Daily"}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 text-left">
                      <span className="block truncate text-[11px] font-medium text-white">
                        {formatDailyWhen(item.created_at) || "Daily"}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-white/80">
                        {expired ? "Expired" : "Live"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5 sm:p-6">
        <label className="block text-sm font-medium text-forest">
          Find friends
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name, nickname, or email"
            className="mt-1.5 w-full rounded-xl border border-forest/10 bg-mist/40 px-3 py-2.5 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
          />
        </label>
        <p className="mt-2 text-xs text-stone">
          They must already have signed in with Google. Type at least 2
          characters.
        </p>

        {searchQuery.trim().length >= 2 ? (
          <div className="mt-4 space-y-2">
            {searchLoading ? (
              <p className="text-sm text-stone">Searching…</p>
            ) : searchResults.length === 0 ? (
              <p className="rounded-xl bg-mist/50 px-3 py-3 text-sm text-stone">
                No users found.
              </p>
            ) : (
              searchResults.map((result) => {
                const name =
                  result.user.nickname.trim() ||
                  result.user.full_name ||
                  result.user.email;
                const busy = searchBusyId === result.user.id;
                return (
                  <article
                    key={result.user.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist/40 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        picture={result.user.profile_picture}
                        name={name}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{name}</p>
                        <p className="truncate text-sm text-stone">
                          {result.user.email}
                        </p>
                      </div>
                    </div>
                    {result.relationship === "friends" ? (
                      <span className="rounded-xl px-3 py-2 text-sm font-medium text-stone ring-1 ring-forest/10">
                        Friends
                      </span>
                    ) : result.relationship === "pending_out" ? (
                      <span className="rounded-xl px-3 py-2 text-sm font-medium text-stone ring-1 ring-forest/10">
                        Request sent
                      </span>
                    ) : result.relationship === "pending_in" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onAddFromSearch(result)}
                        className="rounded-xl bg-forest px-3 py-2 text-sm font-semibold text-white transition hover:bg-leaf disabled:opacity-60"
                      >
                        {busy ? "…" : "Accept"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onAddFromSearch(result)}
                        className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                      >
                        {busy ? "…" : "Add friend"}
                      </button>
                    )}
                  </article>
                );
              })
            )}
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-xl bg-leaf/10 px-4 py-3 text-sm text-forest">{message}</p>
      ) : null}

      {loading ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5">
          Loading connections…
        </p>
      ) : (
        <>
          {pending.incoming.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-ink">
                Requests ({pending.incoming.length})
              </h2>
              {pending.incoming.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-forest/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar picture={item.user.profile_picture} name={displayName(item)} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{displayName(item)}</p>
                      <p className="truncate text-sm text-stone">{item.user.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void runAction(
                          item.id,
                          (token) => acceptFriendRequest(token, item.id),
                          `You are now connected with ${displayName(item)}.`,
                        )
                      }
                      className="rounded-xl bg-forest px-3 py-2 text-sm font-semibold text-white transition hover:bg-leaf disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void runAction(item.id, (token) =>
                          declineFriendRequest(token, item.id),
                        )
                      }
                      className="rounded-xl px-3 py-2 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-mist disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          {pending.outgoing.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-ink">Sent</h2>
              {pending.outgoing.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-forest/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar picture={item.user.profile_picture} name={displayName(item)} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{displayName(item)}</p>
                      <p className="truncate text-sm text-stone">{item.user.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() =>
                      void runAction(item.id, (token) =>
                        removeConnection(token, item.id),
                      )
                    }
                    className="rounded-xl px-3 py-2 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-mist disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </article>
              ))}
            </section>
          ) : null}

          <section className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setFriendsOpen((open) => {
                  if (open) setSelectedId(null);
                  return !open;
                });
              }}
              aria-expanded={friendsOpen}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 text-left ring-1 ring-forest/5 transition hover:ring-leaf/30"
            >
              <h2 className="text-lg font-semibold text-ink">
                Your friends ({friends.length})
              </h2>
              <span
                className={[
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone transition",
                  friendsOpen ? "bg-mist rotate-180" : "bg-mist",
                ].join(" ")}
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>

            {friendsOpen ? (
              friends.length === 0 ? (
                <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5">
                  No friends yet. Search above and tap Add friend.
                </p>
              ) : (
                friends.map((item) => {
                  const open = selectedId === item.id;
                  return (
                    <div key={item.id} className="space-y-2">
                      <article
                        className={[
                          "flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left ring-1 transition",
                          open
                            ? "ring-leaf/40"
                            : "ring-forest/5 hover:ring-leaf/30",
                        ].join(" ")}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              onFriendAvatarClick(item.user.id, item)
                            }
                            className="shrink-0 rounded-full"
                            aria-label={`Open ${displayName(item)} daily`}
                          >
                            <RingAvatar
                              picture={item.user.profile_picture}
                              name={displayName(item)}
                              active={dailyFeed.friends.some(
                                (group) => group.user.id === item.user.id,
                              )}
                              seen={seenDailyIds.has(item.user.id)}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFriend(item)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate font-semibold text-ink">
                              {displayName(item)}
                            </p>
                            <p className="truncate text-sm text-stone">
                              {item.user.email}
                            </p>
                            <p className="mt-0.5 text-xs text-leaf">
                              {open
                                ? "Hide details"
                                : "View profile and trips"}
                            </p>
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (
                              !window.confirm(
                                `Remove ${displayName(item)}? Shared trips between you will also be revoked.`,
                              )
                            ) {
                              return;
                            }
                            void runAction(item.id, (token) =>
                              removeConnection(token, item.id),
                            );
                          }}
                          className="rounded-xl px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          Unfriend
                        </button>
                      </article>

                      {open && selectedFriend ? (
                        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/10 sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <Avatar
                                picture={selectedFriend.user.profile_picture}
                                name={displayName(selectedFriend)}
                                size="lg"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-ink">
                                  {displayName(selectedFriend)}
                                </p>
                                <p className="text-sm text-stone">
                                  {selectedFriend.user.email}
                                </p>
                                <p className="mt-2 text-sm text-stone">
                                  {selectedFriend.user.bio?.trim()
                                    ? selectedFriend.user.bio
                                    : "No bio yet."}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedId(null)}
                              className="rounded-xl px-3 py-2 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-mist"
                            >
                              Close
                            </button>
                          </div>

                          {panelError ? (
                            <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                              {panelError}
                            </p>
                          ) : null}

                          {panelLoading ? (
                            <p className="mt-4 text-sm text-stone">
                              Loading trips…
                            </p>
                          ) : (
                            <div className="mt-5 space-y-5">
                              <div>
                                <h3 className="text-sm font-semibold text-forest">
                                  Shared with you
                                </h3>
                                {shares.from_friend.length === 0 ? (
                                  <p className="mt-2 text-sm text-stone">
                                    They have not shared a trip with you yet.
                                  </p>
                                ) : (
                                  <ul className="mt-2 space-y-2">
                                    {shares.from_friend.map((share) => (
                                      <li key={share.id}>
                                        <button
                                          type="button"
                                          disabled={
                                            busyId === share.itinerary_id
                                          }
                                          onClick={() =>
                                            void openSharedTrip(
                                              share.itinerary_id,
                                            )
                                          }
                                          className="w-full rounded-xl bg-mist/50 px-3 py-2.5 text-left transition hover:bg-mist disabled:opacity-60"
                                        >
                                          <p className="text-sm font-medium text-ink">
                                            {share.itinerary?.name ||
                                              "Shared trip"}
                                          </p>
                                          <p className="text-xs text-stone">
                                            {share.itinerary?.start_point} →{" "}
                                            {share.itinerary?.end_point}
                                          </p>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              <div>
                                <h3 className="text-sm font-semibold text-forest">
                                  Shared by you
                                </h3>
                                {shares.to_friend.length === 0 ? (
                                  <p className="mt-2 text-sm text-stone">
                                    You have not shared a trip with them yet.
                                  </p>
                                ) : (
                                  <ul className="mt-2 space-y-2">
                                    {shares.to_friend.map((share) => (
                                      <li
                                        key={share.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mist/50 px-3 py-2.5"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-ink">
                                            {share.itinerary?.name ||
                                              "Shared trip"}
                                          </p>
                                          <p className="text-xs text-stone">
                                            {share.status === "accepted"
                                              ? "Can view"
                                              : "Invite pending"}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          disabled={
                                            inviteBusyId === share.itinerary_id
                                          }
                                          onClick={() => void onRevoke(share)}
                                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
                                        >
                                          Revoke
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              <div>
                                <h3 className="text-sm font-semibold text-forest">
                                  Invite to a trip
                                </h3>
                                {invitableTrips.length === 0 ? (
                                  <p className="mt-2 text-sm text-stone">
                                    {myTrips.length === 0
                                      ? "Save a trip first, then invite them from here."
                                      : "All of your saved trips are already shared with them."}
                                  </p>
                                ) : (
                                  <ul className="mt-2 space-y-2">
                                    {invitableTrips.map((trip) => (
                                      <li
                                        key={trip.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mist/50 px-3 py-2.5"
                                      >
                                        <p className="min-w-0 truncate text-sm font-medium text-ink">
                                          {trip.name}
                                        </p>
                                        <button
                                          type="button"
                                          disabled={inviteBusyId === trip.id}
                                          onClick={() => void onInvite(trip)}
                                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                                        >
                                          Invite
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )
            ) : null}
          </section>
        </>
      )}

      {draftFile && draftPreview
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
              onClick={closeComposer}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 className="font-display text-xl font-semibold text-forest">
                  Share a daily
                </h2>
                <p className="mt-1 text-sm text-stone">
                  Friends will see this on your avatar for 24 hours.
                </p>
                <img
                  src={draftPreview}
                  alt="Daily preview"
                  className="mt-4 max-h-72 w-full rounded-xl object-cover"
                />
                <label className="mt-4 block text-sm font-medium text-forest">
                  Caption
                  <input
                    type="text"
                    maxLength={140}
                    value={draftCaption}
                    onChange={(event) => setDraftCaption(event.target.value)}
                    placeholder="What are you up to?"
                    className="mt-1.5 w-full rounded-xl border border-forest/10 bg-mist/40 px-3 py-2.5 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
                  />
                </label>
                <p className="mt-1 text-right text-xs text-stone">
                  {draftCaption.length}/140
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={posting}
                    onClick={closeComposer}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-mist disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={posting}
                    onClick={() => void onPostDaily()}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                  >
                    {posting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {viewerIndex !== null && viewerGroups[viewerIndex] ? (
        <DailyViewer
          groups={viewerGroups}
          startGroupIndex={viewerIndex}
          currentUserId={user?.id || dailyFeed.me.user.id}
          onClose={() => setViewerIndex(null)}
          onDelete={onDeleteDaily}
        />
      ) : null}

      {archiveViewerIndex !== null && historyItems.length > 0 ? (
        <DailyViewer
          groups={[archiveGroup]}
          startGroupIndex={0}
          startItemIndex={archiveViewerIndex}
          currentUserId={user?.id || dailyFeed.me.user.id}
          onClose={() => setArchiveViewerIndex(null)}
          onDelete={onDeleteDaily}
        />
      ) : null}
    </div>
  );
}
