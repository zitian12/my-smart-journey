import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const quickActions = [
  {
    id: "planning",
    title: "Planning",
    description: "Generate a personalized sustainable itinerary.",
    to: "/dashboard/planning",
  },
  {
    id: "eco-score",
    title: "Eco Score",
    description: "Track the environmental impact of your trips.",
    to: "/dashboard/eco-score",
  },
  {
    id: "my-trips",
    title: "My Trips",
    description: "Review and manage saved itineraries.",
    to: "/dashboard/my-trips",
  },
  {
    id: "favourites",
    title: "Favourites",
    description: "Keep your favorite destinations in one place.",
    to: "/dashboard/favourites",
  },
];

export function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const greetingName =
    isAuthenticated && user
      ? user.nickname.trim() || user.name.split(" ")[0]
      : "Traveler";

  return (
    <div className="mx-auto max-w-4xl animate-fade-up space-y-10">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wider text-leaf">
          Dashboard
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
          Welcome back, {greetingName}
        </h1>
        <p className="max-w-2xl text-stone">
          Your sustainable travel hub. Explore upcoming tools below — more
          features are on the way.
        </p>
      </header>

      {isAuthenticated && user ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-forest/5">
          <div className="flex min-w-0 items-center gap-4">
            {user.profile_picture ? (
              <img
                src={user.profile_picture}
                alt={user.name}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-leaf/20"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf/15 text-lg font-semibold text-forest">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{user.name}</p>
              <p className="truncate text-sm text-stone">{user.email}</p>
              {user.bio ? (
                <p className="mt-1 line-clamp-2 text-sm text-stone">{user.bio}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/profile")}
            className="rounded-lg border border-leaf/30 px-3 py-2 text-sm font-medium text-forest transition-colors hover:border-leaf/50 hover:bg-leaf/5"
          >
            Settings
          </button>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-forest">Quick actions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => navigate(action.to)}
              className="rounded-2xl bg-white p-5 text-left ring-1 ring-forest/5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="font-semibold text-ink">{action.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-stone">
                {action.description}
              </p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wider text-leaf">
                Open
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
