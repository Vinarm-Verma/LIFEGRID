
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginScreen from "./auth/LoginScreen";
import ProviderPendingScreen from "./auth/ProviderPendingScreen";

import AmbulanceDriverDashboard from "./components/AmbulanceDriverDashboard";
import HospitalOperationsDashboard from "./components/HospitalOperationsDashboard";
import ProviderWorkspace from "./components/ProviderWorkspace";
import CoordinatorDashboard from "./components/CoordinatorDashboard";
import CitizenDashboard from "./components/CitizenDashboard";

import {
  Activity,
  AlertTriangle,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

function isPasswordRecoveryRoute() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("recovery") === "true" ||
    params.get("type") === "recovery"
  );
}

function LoadingScreen() {
  return (
    <main className="lifegrid-loading-screen">
      <div className="lifegrid-loading-card">
        <div className="lifegrid-loading-logo">
          <Activity size={25} />
        </div>

        <div className="lifegrid-spinner">
          <RefreshCw size={20} />
        </div>

        <h1>Connecting to LIFEGRID</h1>
        <p>Verifying your identity and workspace access.</p>

        <div className="lifegrid-loading-status">
          <span />
          Authentication services operational
        </div>
      </div>
    </main>
  );
}

function AccessVerificationScreen({ error, retry, signOut }) {
  return (
    <main className="lifegrid-access-screen">
      <section className="lifegrid-access-card">
        <div className="lifegrid-access-icon">
          <ShieldCheck size={28} />
        </div>

        <span className="lifegrid-eyebrow">
          ACCESS VERIFICATION
        </span>

        <h1>
          We could not verify
          <br />
          your workspace
        </h1>

        <p>
          Your authentication session is still protected.
          LIFEGRID could not complete backend role verification.
        </p>

        {error && (
          <div className="lifegrid-access-error">
            <AlertTriangle size={17} />
            <span>{error}</span>
          </div>
        )}

        <div className="lifegrid-access-actions">
          <button
            type="button"
            onClick={() => void retry()}
            className="lifegrid-primary-button"
          >
            <RefreshCw size={17} />
            Retry verification
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            className="lifegrid-secondary-button"
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

function AuthenticatedApp() {
  const {
    user,
    role,
    requestedRole,
    providerStatus,
    loading,
    authError,
    refreshAuth,
    signOut,
  } = useAuth();

  /*
   * IMPORTANT:
   * Password recovery must take priority over role-based routing.
   * The recovery link may already have created an authenticated
   * Supabase session. Do not send that session to a dashboard.
   */
  if (isPasswordRecoveryRoute()) {
    return <LoginScreen />;
  }

  if (loading && !user) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (loading && !role) {
    return <LoadingScreen />;
  }

  /*
   * Provider account awaiting approval.
   */
  if (
    requestedRole &&
    requestedRole !== "citizen" &&
    role === "citizen" &&
    providerStatus !== "approved"
  ) {
    return (
      <ProviderPendingScreen
        requestedRole={requestedRole}
        status={providerStatus || "pending"}
      />
    );
  }

  /*
   * Hospital operations.
   */
  if (role === "hospital") {
    return <HospitalOperationsDashboard />;
  }

  /*
   * Ambulance driver operations.
   */
  if (
    role === "ambulance" ||
    role === "ambulance_driver"
  ) {
    return <AmbulanceDriverDashboard />;
  }

  /*
   * Resource provider workspace.
   */
  if (role === "resource_provider") {
    return <ProviderWorkspace />;
  }

  /*
   * Coordinator / administrator.
   */
  if (role === "coordinator" || role === "admin") {
    return <CoordinatorDashboard />;
  }

  /*
   * Citizen emergency interface.
   */
  if (role === "citizen") {
    return <CitizenDashboard />;
  }

  /*
   * Never silently route an unknown role to another dashboard.
   */
  return (
    <AccessVerificationScreen
      error={
        authError ||
        "LIFEGRID could not determine your authorized workspace."
      }
      retry={refreshAuth}
      signOut={signOut}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
