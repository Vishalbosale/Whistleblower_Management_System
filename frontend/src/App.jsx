import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { MastersProvider } from "./context/MastersContext";

import Header from "./components/Header/Header";
import Footer from "./components/Footer/Footer";

import Home from "./components/Home/Home";
import WhistleblowerPolicy from "./components/WhistleblowerPolicy/WhistleblowerPolicy";
import Reporting from "./components/Reporting/Reporting";
import PostBoxLogin from "./components/PostBoxLogin/PostBoxLogin";
import PostBoxStatus from "./components/PostBoxStatus/PostBoxStatus";

import { AuthProvider, useAuth } from "./staff/context/AuthContext";
import ProtectedRoute from "./staff/components/ProtectedRoute";
import { WBC_ROLES, isInvestigationUnit, canActAsWbc, homeRouteFor } from "./staff/roles";
import StaffLayout from "./staff/layout/StaffLayout";
import Login from "./staff/pages/Login";
import ComplaintQueue from "./staff/pages/ComplaintQueue";
import ComplaintDetail from "./staff/pages/ComplaintDetail";
import CaseCreate from "./staff/pages/CaseCreate";
import CaseWorkbench from "./staff/pages/CaseWorkbench";
import MyCases from "./staff/pages/MyCases";
import CaseDetail from "./staff/pages/CaseDetail";
import CaseAssign from "./staff/pages/CaseAssign";
import UserManagement from "./staff/pages/UserManagement";
import CaseTransfers from "./staff/pages/CaseTransfers";
import SamlSettings from "./staff/pages/SamlSettings";
import SsoCallback from "./staff/pages/SsoCallback";

import "./App.css";

const PublicSite = () => (
  <div className="app-container">
    <Header />

    <main className="main-content">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/whistleblower-policy" element={<WhistleblowerPolicy />} />
        <Route path="/reporting" element={<Reporting />} />
        <Route path="/post-box-login" element={<PostBoxLogin />} />
        <Route path="/post-box-status" element={<PostBoxStatus />} />
      </Routes>
    </main>

    <Footer />
  </div>
);

const WBC_AND_ADMIN = WBC_ROLES;

// /staff sends each constituency to the screen it actually works from: the WB
// Committee and Admin to the complaint queue, the Investigation Unit to its
// cases.
const StaffHome = () => {
  const { roles } = useAuth();

  return <Navigate to={homeRouteFor(roles)} replace />;
};

// The Investigation Unit gets a simpler, list-first "My Cases" home instead
// of the committee/Admin Case Workbench (with its pipeline/workload panels,
// which mean little scoped to one officer's own files).
const CasesHome = () => {
  const { roles } = useAuth();

  return isInvestigationUnit(roles) && !canActAsWbc(roles) ? <MyCases /> : <CaseWorkbench />;
};

function App() {
  return (
    <BrowserRouter>
      <MastersProvider>
        <AuthProvider>
          <Routes>
            {/* Internal staff portal */}
            <Route path="/staff/login" element={<Login />} />
            {/* Reached via a redirect from the backend's SAML ACS, carrying a
                freshly-issued token in the query string — not behind
                ProtectedRoute since there's no session yet at this point. */}
            <Route path="/staff/sso-callback" element={<SsoCallback />} />

            <Route
              path="/staff"
              element={
                <ProtectedRoute>
                  <StaffLayout />
                </ProtectedRoute>
              }
            >
              {/* Complaint intake is the WB Committee's and Admin's. The
                  Investigation Unit lands on the case workbench instead — the
                  complaint API refuses it, so these screens would only 403. */}
              <Route index element={<StaffHome />} />

              <Route
                path="complaints"
                element={
                  <ProtectedRoute requireRole={WBC_AND_ADMIN}>
                    <ComplaintQueue />
                  </ProtectedRoute>
                }
              />

              <Route
                path="complaints/:id"
                element={
                  <ProtectedRoute requireRole={WBC_AND_ADMIN}>
                    <ComplaintDetail />
                  </ProtectedRoute>
                }
              />

              <Route path="cases" element={<CasesHome />} />
              <Route
                path="cases/new"
                element={
                  <ProtectedRoute requireRole={WBC_AND_ADMIN}>
                    <CaseCreate />
                  </ProtectedRoute>
                }
              />
              <Route path="cases/:id" element={<CaseDetail />} />
              <Route
                path="cases/:id/assign"
                element={
                  <ProtectedRoute requireRole={WBC_AND_ADMIN}>
                    <CaseAssign />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                    <ProtectedRoute requireRole="WBC_MEMBER">
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="transfers"
                element={
                    <ProtectedRoute requireRole="WBC_MEMBER">
                    <CaseTransfers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="saml-settings"
                element={
                    <ProtectedRoute requireRole="WBC_MEMBER">
                    <SamlSettings />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Public marketing / reporting site */}
            <Route path="/*" element={<PublicSite />} />
          </Routes>
        </AuthProvider>
      </MastersProvider>
    </BrowserRouter>
  );
}

export default App;