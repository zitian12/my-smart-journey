import { useRef } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type MenuItem = { id: string; label: string; to: string };

const menuItems: MenuItem[] = [
  { id: "overview", label: "Overview", to: "/dashboard" },
  { id: "destinations", label: "Destinations", to: "/dashboard/destinations" },
  { id: "planning", label: "Planning", to: "/dashboard/planning" },
  { id: "eco-score", label: "Eco Score", to: "/dashboard/eco-score" },
  { id: "my-trips", label: "My Trips", to: "/dashboard/my-trips" },
  { id: "favourites", label: "Favourites", to: "/dashboard/favourites" },
  { id: "profile", label: "Settings", to: "/dashboard/profile" },
];

type SidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { user, isAuthenticated, isLoading, loginWithGoogle, logout } = useAuth();
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
      onClose();
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };

  return (
    <aside
      id="dashboard-sidebar"
      className={[
        "flex h-svh w-64 shrink-0 flex-col border-r border-leaf/15 bg-white",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out",
        "lg:static lg:z-auto lg:translate-x-0",
        "print:hidden",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2 border-b border-leaf/10 px-5 py-5">
        <NavLink to="/" className="min-w-0 no-underline" onClick={onClose}>
          <p className="font-display text-lg font-semibold tracking-tight text-forest">
            My Smart Journey
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-stone">
            Dashboard
          </p>
        </NavLink>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-forest transition-colors hover:bg-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf lg:hidden"
          aria-label="Close navigation"
        >
          <CloseIcon />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Dashboard navigation">
        {menuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.to === "/dashboard"}
            onClick={onClose}
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
        ))}
      </nav>

      <div className="border-t border-leaf/10 p-4">
        {isAuthenticated && user ? (
          <div className="space-y-3">
            <NavLink
              to="/dashboard/profile"
              onClick={onClose}
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

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
