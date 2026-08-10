import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authenticateWithGoogle, logoutFromServer } from "../services/authApi";
import { mapApiUser, type User } from "../types/auth";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  getAccessToken: () => string | null;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (next: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<User>;
    if (!parsed.email || !parsed.name) return null;
    return {
      id: parsed.id ?? "",
      name: parsed.name,
      email: parsed.email,
      profile_picture: parsed.profile_picture ?? "",
      nickname: parsed.nickname ?? "",
      bio: parsed.bio ?? "",
      phone: parsed.phone ?? "",
      created_at: parsed.created_at ?? null,
    };
  } catch {
    return null;
  }
}

function loadStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function loadInitialAuth(): User | null {
  const token = loadStoredToken();
  const storedUser = loadStoredUser();
  if (!token || !storedUser) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return null;
  }
  return storedUser;
}

function persistUser(next: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(next));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadInitialAuth);
  const [isLoading, setIsLoading] = useState(false);

  const isAuthenticated = Boolean(user);

  const getAccessToken = useCallback(() => loadStoredToken(), []);

  const updateUser = useCallback((next: User) => {
    persistUser(next);
    setUser(next);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    setIsLoading(true);
    try {
      const data = await authenticateWithGoogle(idToken);
      const storedUser = mapApiUser(data.user);
      localStorage.setItem(TOKEN_KEY, data.access_token);
      persistUser(storedUser);
      setUser(storedUser);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutFromServer();
    } catch {
      // Server logout is optional; clear local state regardless
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      getAccessToken,
      loginWithGoogle,
      logout,
      updateUser,
    }),
    [
      user,
      isAuthenticated,
      isLoading,
      getAccessToken,
      loginWithGoogle,
      logout,
      updateUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
