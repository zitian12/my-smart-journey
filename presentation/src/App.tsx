import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import { Layout } from "./components/Layout";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DestinationDetailPage } from "./pages/DestinationDetailPage";
import { DestinationsPage } from "./pages/DestinationsPage";
import { Home } from "./pages/Home";
import { EcoScorePage } from "./pages/EcoScorePage";
import { ItineraryResultPage } from "./pages/ItineraryResultPage";
import { MyTripsPage } from "./pages/MyTripsPage";
import { PlanningPage } from "./pages/PlanningPage";
import { ProfilePage } from "./pages/ProfilePage";

function LegacyDestinationRedirect() {
  const { id } = useParams();
  return (
    <Navigate
      to={id ? `/dashboard/destinations/${id}` : "/dashboard/destinations"}
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

        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="destinations" element={<DestinationsPage />} />
          <Route path="destinations/:id" element={<DestinationDetailPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="planning/result" element={<ItineraryResultPage />} />
          <Route path="eco-score" element={<EcoScorePage />} />
          <Route path="my-trips" element={<MyTripsPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="destinations" element={<Navigate to="/dashboard/destinations" replace />} />
        <Route path="destinations/:id" element={<LegacyDestinationRedirect />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
