import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authenticateWithGoogle, logoutFromServer } from "../services/authApi";
import type { User } from "../types/auth";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadInitialAuth);
  const [isLoading, setIsLoading] = useState(false);

  const isAuthenticated = Boolean(user);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    setIsLoading(true);
    try {
      const data = await authenticateWithGoogle(idToken);
      const storedUser: User = {
        name: data.user.full_name,
        email: data.user.email,
        profile_picture: data.user.profile_picture,
      };
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(storedUser));
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
    () => ({ user, isAuthenticated, isLoading, loginWithGoogle, logout }),
    [user, isAuthenticated, isLoading, loginWithGoogle, logout],
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
