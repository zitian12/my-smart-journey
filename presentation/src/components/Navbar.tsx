import { useRef } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Navbar() {
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
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };

  return (
    <header className="border-b border-leaf/15 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
        <NavLink to="/" className="group flex min-w-0 items-baseline gap-2 no-underline">
          <span className="font-display text-lg font-semibold tracking-tight text-forest sm:text-xl">
            My Smart Journey
          </span>
          <span className="hidden text-xs font-medium uppercase tracking-wider text-stone sm:inline">
            Sustainable travel
          </span>
        </NavLink>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {isAuthenticated && user ? (
            <>
              <NavLink
                to="/dashboard"
                className="rounded-lg px-3 py-2 text-sm font-medium text-forest no-underline transition-colors hover:bg-leaf/5 sm:px-4"
              >
                Dashboard
              </NavLink>
              <div className="flex items-center gap-2 sm:gap-3">
                {user.profile_picture ? (
                  <img
                    src={user.profile_picture}
                    alt={user.name}
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-leaf/20"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-leaf/15 text-xs font-semibold text-forest">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
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
                Logout
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
              <div ref={googleLoginRef} className="sr-only" aria-hidden="true">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() =>
                    console.error("Google sign-in was cancelled or failed")
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
