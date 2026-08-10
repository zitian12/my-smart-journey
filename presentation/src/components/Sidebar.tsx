import { useRef } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useComingSoonToast } from "./ComingSoonToast";

type MenuItem =
  | { id: string; label: string; to: string; ready: true }
  | { id: string; label: string; ready: false };

const menuItems: MenuItem[] = [
  { id: "overview", label: "Overview", to: "/dashboard", ready: true },
  { id: "destinations", label: "Destinations", to: "/destinations", ready: true },
  { id: "planning", label: "Planning", to: "/dashboard/planning", ready: true },
  { id: "eco-score", label: "Eco Score", to: "/dashboard/eco-score", ready: true },
  { id: "my-trips", label: "My Trips", to: "/dashboard/my-trips", ready: true },
  { id: "profile", label: "Settings", to: "/dashboard/profile", ready: true },
  { id: "favourites", label: "Favourites", ready: false },
];

export function Sidebar() {
  const { user, isAuthenticated, isLoading, loginWithGoogle, logout } = useAuth();
  const { showComingSoon } = useComingSoonToast();
  const navigate = useNavigate();
  const googleLoginRef = useRef<HTMLDivElement>(null);

  const openGoogleSignIn = () => {
    const button = googleLoginRef.current?.querySelector(
      'div[role="button"]',
    ) as HTMLElement | null;
    button?.click();
  };

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return;
    try {
      await loginWithGoogle(response.credential);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-leaf/15 bg-white">
      <div className="border-b border-leaf/10 px-5 py-5">
        <NavLink to="/" className="no-underline">
          <p className="font-display text-lg font-semibold tracking-tight text-forest">
            My Smart Journey
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-stone">
            Dashboard
          </p>
        </NavLink>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Dashboard navigation">
        {menuItems.map((item) =>
          item.ready ? (
            <NavLink
              key={item.id}
              to={item.to}
              end
              className={({ isActive }) =>
                [
                  "block rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors",
                  isActive
                    ? "bg-leaf/10 text-forest"
                    : "text-stone hover:bg-mist hover:text-forest",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => showComingSoon(item.label)}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-stone transition-colors hover:bg-mist hover:text-forest"
            >
              {item.label}
            </button>
          ),
        )}
      </nav>

      <div className="border-t border-leaf/10 p-4">
        {isAuthenticated && user ? (
          <div className="space-y-3">
            <NavLink
              to="/dashboard/profile"
              className="flex items-center gap-3 rounded-lg p-1 no-underline transition-colors hover:bg-mist"
            >
              {user.profile_picture ? (
                <img
                  src={user.profile_picture}
                  alt={user.name}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-leaf/20"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf/15 text-sm font-semibold text-forest">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-forest">{user.name}</p>
                <p className="truncate text-xs text-stone">{user.email}</p>
              </div>
            </NavLink>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => navigate("/", { replace: true }));
              }}
              className="w-full rounded-lg border border-leaf/30 px-3 py-2 text-sm font-medium text-forest transition-colors hover:border-leaf/50 hover:bg-leaf/5"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={openGoogleSignIn}
              disabled={isLoading}
              className="w-full rounded-lg border border-leaf/30 px-3 py-2.5 text-sm font-medium text-forest transition-colors hover:border-leaf/50 hover:bg-leaf/5 disabled:opacity-50"
            >
              Sign In / Register
            </button>
            <div ref={googleLoginRef} className="sr-only" aria-hidden="true">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() =>
                  console.error("Google sign-in was cancelled or failed")
                }
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
