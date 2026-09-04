import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Navbar } from "./components/layout/Navbar";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { SyncStatusBar } from "./components/layout/SyncStatusBar";
import { DuplicateCheckModal } from "./components/common/DuplicateCheckModal";
import { PropertyListPage } from "./pages/properties/PropertyListPage";
import { PropertyFormPage } from "./pages/properties/PropertyFormPage";
import { PropertyDetailPage } from "./pages/properties/PropertyDetailPage";
import { UnverifiedListPage } from "./pages/unverified/UnverifiedListPage";
import { MapSurveyPage } from "./pages/map/MapSurveyPage";
import { CustomerListPage } from "./pages/customers/CustomerListPage";
import { CustomerDetailPage } from "./pages/customers/CustomerDetailPage";
import { StatisticsPage } from "./pages/statistics/StatisticsPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { ApiConfigPage } from "./pages/settings/ApiConfigPage";
import { SyncHistoryPage } from "./pages/settings/SyncHistoryPage";
import { PermissionOnboardingPage } from "./pages/onboarding/PermissionOnboardingPage";
import { ScrollRestoration } from "./components/layout/ScrollRestoration";
import { settingsManager } from "./data/local/settings-manager";
import { syncManager } from "./data/sync/sync-manager";

const AppContent: React.FC = () => {
  const location = useLocation();
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const isOnboarding = location.pathname === "/onboarding";

  // Check URL query action=check_duplicate (tương ứng App Shortcut check_duplicate)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("action") === "check_duplicate") {
      const timer = window.setTimeout(() => setDuplicateModalOpen(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [location.search]);

  // Connect Supabase Realtime & Auto-Sync when app is mounted
  useEffect(() => {
    const cleanupRealtime = syncManager.startRealtime();
    const cleanupAutoSync = syncManager.setupAutoSync();
    return () => {
      cleanupRealtime();
      cleanupAutoSync();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <ScrollRestoration />
      <OfflineBanner />

      {!isOnboarding && (
        <Navbar onOpenDuplicateCheck={() => setDuplicateModalOpen(true)} />
      )}

      <main className="flex-1">
        <Routes>
          <Route
            path="/"
            element={
              settingsManager.getSettings().hasShownOnboarding ? (
                <Navigate to="/properties" replace />
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route path="/onboarding" element={<PermissionOnboardingPage />} />

          {/* Properties Routes */}
          <Route path="/properties" element={<PropertyListPage />} />
          <Route path="/properties/new" element={<PropertyFormPage />} />
          <Route path="/properties/edit/:id" element={<PropertyFormPage />} />
          <Route path="/properties/:id/edit" element={<PropertyFormPage />} />
          <Route path="/properties/:id" element={<PropertyDetailPage />} />

          {/* Unverified Routes */}
          <Route path="/unverified" element={<UnverifiedListPage />} />
          <Route path="/unverified/:id" element={<PropertyDetailPage />} />

          {/* Map Survey */}
          <Route path="/map" element={<MapSurveyPage />} />

          {/* Customer CRM */}
          <Route path="/customers" element={<CustomerListPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />

          {/* Statistics */}
          <Route path="/statistics" element={<StatisticsPage />} />

          {/* Settings */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/api-config" element={<ApiConfigPage />} />
          <Route path="/settings/sync-history" element={<SyncHistoryPage />} />

          <Route path="*" element={<Navigate to="/properties" replace />} />
        </Routes>
      </main>

      {!isOnboarding && <SyncStatusBar />}

      <DuplicateCheckModal
        isOpen={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
