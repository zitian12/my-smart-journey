import { useEffect, useRef, useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { UserAvatar } from "./UserAvatar";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors no-underline",
    isActive
      ? "bg-leaf/10 text-forest"
      : "text-stone hover:bg-leaf/5 hover:text-forest",
  ].join(" ");

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "block rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors",
    isActive
      ? "bg-leaf/10 text-forest"
      : "text-stone hover:bg-leaf/5 hover:text-forest",
  ].join(" ");

export function Navbar() {
  const { user, isAuthenticated, isLoading, loginWithGoogle, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const googleLoginRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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
      setMenuOpen(false);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-leaf/15 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
        <NavLink
          to="/"
          className="min-w-0 shrink no-underline"
          onClick={() => setMenuOpen(false)}
        >
          <span className="block truncate font-display text-lg font-semibold tracking-tight text-forest sm:text-xl">
            My Smart Journey
          </span>
          <span className="hidden text-xs font-medium uppercase tracking-wider text-stone lg:block">
            Sustainable travel
          </span>
        </NavLink>

        <nav
          className="hidden items-center gap-1 md:flex md:gap-2"
          aria-label="Main navigation"
        >
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/dashboard/destinations" className={navLinkClass}>
            Destinations
          </NavLink>
        </nav>

        <div className="hidden shrink-0 items-center gap-2 md:flex md:gap-3">
          {isAuthenticated && user ? (
            <>
              <NavLink
                to="/dashboard"
                className="rounded-lg px-3 py-2 text-sm font-medium text-forest no-underline transition-colors hover:bg-leaf/5 sm:px-4"
              >
                Dashboard
              </NavLink>
              <div className="flex items-center gap-2 sm:gap-3">
                <UserAvatar
                  picture={user.profile_picture}
                  name={user.name}
                  className="h-8 w-8 text-xs"
                />
                <span className="hidden max-w-[10rem] truncate text-sm font-medium text-forest sm:inline">
                  {user.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  void logout();
                }}
                className="rounded-lg border border-leaf/30 bg-transparent px-3 py-2 text-sm font-medium text-forest transition-colors hover:border-leaf/50 hover:bg-leaf/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf sm:px-4"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={openGoogleSignIn}
                disabled={isLoading}
                className="rounded-lg border border-leaf/30 bg-transparent px-3 py-2 text-sm font-medium text-forest transition-colors hover:border-leaf/50 hover:bg-leaf/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf disabled:opacity-50 sm:px-4"
              >
                Login
              </button>
              <button
                type="button"
                onClick={openGoogleSignIn}
                disabled={isLoading}
                className="rounded-lg bg-leaf px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-ink/10 transition-colors hover:bg-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf disabled:opacity-50 sm:px-4"
              >
                Sign Up
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-forest transition-colors hover:bg-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-main-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {menuOpen ? (
        <div
          id="mobile-main-nav"
          className="border-t border-leaf/15 bg-white px-4 py-3 md:hidden"
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
            <NavLink to="/" end className={mobileNavLinkClass}>
              Home
            </NavLink>
            <NavLink
              to="/dashboard/destinations"
              className={mobileNavLinkClass}
            >
              Destinations
            </NavLink>
            {isAuthenticated ? (
              <NavLink to="/dashboard" className={mobileNavLinkClass}>
                Dashboard
              </NavLink>
            ) : null}
          </nav>

          <div className="mt-3 flex flex-col gap-2 border-t border-leaf/10 pt-3">
            {isAuthenticated && user ? (
              <>
                <div className="flex items-center gap-3 px-1">
                  <UserAvatar
                    picture={user.profile_picture}
                    name={user.name}
                    className="h-9 w-9 text-xs"
                  />
                  <span className="truncate text-sm font-medium text-forest">
                    {user.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void logout();
                    setMenuOpen(false);
                  }}
                  className="rounded-lg border border-leaf/30 px-3 py-2.5 text-sm font-medium text-forest transition-colors hover:bg-leaf/5"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openGoogleSignIn}
                  disabled={isLoading}
                  className="rounded-lg border border-leaf/30 px-3 py-2.5 text-sm font-medium text-forest transition-colors hover:bg-leaf/5 disabled:opacity-50"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={openGoogleSignIn}
                  disabled={isLoading}
                  className="rounded-lg bg-leaf px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest disabled:opacity-50"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div ref={googleLoginRef} className="sr-only" aria-hidden="true">
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() =>
            console.error("Google sign-in was cancelled or failed")
          }
        />
      </div>
    </header>
  );
}

function MenuIcon() {
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
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
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
