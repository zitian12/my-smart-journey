import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/destinations", label: "Destinations" },
  { to: "/itinerary", label: "Itinerary" },
  { to: "/dashboard", label: "Dashboard" },
] as const;

export function Navbar() {
  return (
    <header className="border-b border-leaf/15 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
        <NavLink to="/" className="group flex items-baseline gap-2 no-underline">
          <span className="font-display text-xl font-semibold tracking-tight text-forest">
            My Smart Journey
          </span>
          <span className="hidden text-xs font-medium uppercase tracking-wider text-stone sm:inline">
            Sustainable travel
          </span>
        </NavLink>

        <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
          {links.map(({ to, label, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest ? rest.end : false}
              className={({ isActive }) =>
                [
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors no-underline",
                  isActive
                    ? "bg-leaf/10 text-forest"
                    : "text-stone hover:bg-mist hover:text-ink",
                ].join(" ")
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
