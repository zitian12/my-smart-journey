import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-mist">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto px-6 py-8 sm:px-8 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
