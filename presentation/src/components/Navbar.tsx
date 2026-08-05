import { NavLink } from "react-router-dom";

export function Navbar() {
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
          <button
            type="button"
            className="rounded-lg border border-leaf/30 bg-transparent px-3 py-2 text-sm font-medium text-forest transition-colors hover:border-leaf/50 hover:bg-leaf/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf sm:px-4"
          >
            Login
          </button>
          <button
            type="button"
            className="rounded-lg bg-leaf px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-ink/10 transition-colors hover:bg-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf sm:px-4"
          >
            Sign Up
          </button>
        </div>
      </div>
    </header>
  );
}
