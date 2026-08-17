import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { listPendingConnections } from "../services/connectionApi";
import { listPendingTripShares } from "../services/tripShareApi";

type PendingCountsValue = {
  friendPending: number;
  tripPending: number;
  refreshPending: () => Promise<void>;
};

const PendingCountsContext = createContext<PendingCountsValue | null>(null);

export function PendingCountsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getAccessToken } = useAuth();
  const [friendPending, setFriendPending] = useState(0);
  const [tripPending, setTripPending] = useState(0);

  const refreshPending = useCallback(async () => {
    if (!isAuthenticated) {
      setFriendPending(0);
      setTripPending(0);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setFriendPending(0);
      setTripPending(0);
      return;
    }

    try {
      const [connections, shares] = await Promise.all([
        listPendingConnections(token),
        listPendingTripShares(token),
      ]);
      setFriendPending(connections.incoming.length);
      setTripPending(shares.length);
    } catch {
      setFriendPending(0);
      setTripPending(0);
    }
  }, [getAccessToken, isAuthenticated]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  const value = useMemo(
    () => ({
      friendPending,
      tripPending,
      refreshPending,
    }),
    [friendPending, refreshPending, tripPending],
  );

  return (
    <PendingCountsContext.Provider value={value}>
      {children}
    </PendingCountsContext.Provider>
  );
}

export function usePendingCounts(): PendingCountsValue {
  const context = useContext(PendingCountsContext);
  if (!context) {
    throw new Error("usePendingCounts must be used within PendingCountsProvider");
  }
  return context;
}
