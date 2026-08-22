import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePendingCounts } from "../context/PendingCountsContext";
import { LoginModal } from "./LoginModal";
import { UserAvatar } from "./UserAvatar";

type MenuItem = { id: string; label: string; to: string };

const menuItems: MenuItem[] = [
  { id: "overview", label: "Overview", to: "/dashboard" },
  { id: "destinations", label: "Destinations", to: "/dashboard/destinations" },
  { id: "planning", label: "Planning", to: "/dashboard/planning" },
  { id: "eco-score", label: "Eco Score", to: "/dashboard/eco-score" },
  { id: "my-trips", label: "My Trips", to: "/dashboard/my-trips" },
  { id: "favourites", label: "Favourites", to: "/dashboard/favourites" },
  { id: "connections", label: "Friends", to: "/dashboard/connections" },
  { id: "profile", label: "Settings", to: "/dashboard/profile" },
];

type SidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const { friendPending, tripPending } = usePendingCounts();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);

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
                "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors",
                isActive
                  ? "bg-leaf/10 text-forest"
                  : "text-stone hover:bg-mist hover:text-forest",
              ].join(" ")
            }
          >
            {item.label}
            {item.id === "connections" && friendPending > 0 ? (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                {friendPending}
              </span>
            ) : null}
            {item.id === "my-trips" && tripPending > 0 ? (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                {tripPending}
              </span>
            ) : null}
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
              <UserAvatar
                picture={user.profile_picture}
                name={user.name}
                className="h-10 w-10 text-sm"
              />
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
          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            className="w-full rounded-lg border border-leaf/30 px-3 py-2.5 text-sm font-medium text-forest transition-colors hover:border-leaf/50 hover:bg-leaf/5"
          >
            Sign In / Register
          </button>
        )}
      </div>

      <LoginModal
        open={loginOpen}
        title="Sign in to My Smart Journey"
        message="Use Google to sync trips, friends, and eco progress across devices."
        onClose={() => setLoginOpen(false)}
        onLoggedIn={() => {
          onClose();
          navigate("/dashboard", { replace: true });
        }}
      />
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
