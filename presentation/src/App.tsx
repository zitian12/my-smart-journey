import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import { Layout } from "./components/Layout";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DestinationDetailPage } from "./pages/DestinationDetailPage";
import { DestinationsPage } from "./pages/DestinationsPage";
import { FavouritesPage } from "./pages/FavouritesPage";
import { Home } from "./pages/Home";
import { EcoScorePage } from "./pages/EcoScorePage";
import { ItineraryResultPage } from "./pages/ItineraryResultPage";
import { MyTripsPage } from "./pages/MyTripsPage";
import { PlanningPage } from "./pages/PlanningPage";
import { ProfilePage } from "./pages/ProfilePage";

/** Preserve search (and state when needed) while rewriting /dashboard/* → flat paths. */
function LegacyPathRedirect({ to }: { to: string }) {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: to, search: location.search }}
      state={location.state}
      replace
    />
  );
}

function LegacyDestinationDetailRedirect() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={{
        pathname: id ? `/destinations/${id}` : "/destinations",
        search: location.search,
      }}
      state={location.state}
      replace
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
        </Route>

        <Route element={<DashboardLayout />}>
          <Route path="overview" element={<DashboardPage />} />
          <Route path="destinations" element={<DestinationsPage />} />
          <Route path="destinations/:id" element={<DestinationDetailPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="planning/result" element={<ItineraryResultPage />} />
          <Route path="eco-score" element={<EcoScorePage />} />
          <Route path="my-trips" element={<MyTripsPage />} />
          <Route path="favourites" element={<FavouritesPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="profile" element={<ProfilePage />} />

          {/* Legacy /dashboard/* → flat paths */}
          <Route path="dashboard" element={<LegacyPathRedirect to="/overview" />} />
          <Route
            path="dashboard/destinations"
            element={<LegacyPathRedirect to="/destinations" />}
          />
          <Route
            path="dashboard/destinations/:id"
            element={<LegacyDestinationDetailRedirect />}
          />
          <Route
            path="dashboard/planning"
            element={<LegacyPathRedirect to="/planning" />}
          />
          <Route
            path="dashboard/planning/result"
            element={<LegacyPathRedirect to="/planning/result" />}
          />
          <Route
            path="dashboard/eco-score"
            element={<LegacyPathRedirect to="/eco-score" />}
          />
          <Route
            path="dashboard/my-trips"
            element={<LegacyPathRedirect to="/my-trips" />}
          />
          <Route
            path="dashboard/favourites"
            element={<LegacyPathRedirect to="/favourites" />}
          />
          <Route
            path="dashboard/connections"
            element={<LegacyPathRedirect to="/connections" />}
          />
          <Route
            path="dashboard/profile"
            element={<LegacyPathRedirect to="/profile" />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
