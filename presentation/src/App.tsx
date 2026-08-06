import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { DestinationsPage } from "./pages/DestinationsPage";
import { Home } from "./pages/Home";
import { EcoScorePage } from "./pages/EcoScorePage";
import { MyTripsPage } from "./pages/MyTripsPage";
import { PlanningPage } from "./pages/PlanningPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="destinations" element={<DestinationsPage />} />
        </Route>

        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="eco-score" element={<EcoScorePage />} />
          <Route path="my-trips" element={<MyTripsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
