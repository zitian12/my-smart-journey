import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";

export function Layout() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main
        className={
          isHome
            ? "w-full flex-1"
            : "mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6"
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
