import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  return (
    <div className="flex h-svh overflow-hidden bg-mist">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-leaf/15 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-forest transition-colors hover:bg-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          aria-label="Open navigation"
          aria-expanded={mobileNavOpen}
          aria-controls="dashboard-sidebar"
        >
          <MenuIcon />
        </button>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-forest">
            My Smart Journey
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-stone">
            Dashboard
          </p>
        </div>
      </header>

      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-8 pt-[calc(3.5rem+1.5rem)] sm:px-6 sm:pb-10 lg:px-8 lg:py-10">
        <Outlet />
      </main>
    </div>
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
