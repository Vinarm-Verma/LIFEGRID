import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  Clock3,
  LogOut,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { supabase } from "./supabase";
import { useAuth } from "./AuthContext";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000/api";

const labels = {
  ambulance: "Ambulance Driver",
  hospital: "Hospital / Clinic",
  resource_provider:
    "Resource Provider",
};

export default function ProviderPendingScreen({
  requestedRole,
  status = "pending",
}) {
  const {
    user,
    signOut,
    refreshAuth,
  } = useAuth();

  const [currentStatus, setCurrentStatus] =
    useState(status);

  const [organization, setOrganization] =
    useState("");

  const [reason, setReason] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const roleLabel = useMemo(
    () =>
      labels[requestedRole] ||
      "Provider",
    [requestedRole]
  );

  async function checkStatus({
    refresh = false,
  } = {}) {
    try {
      setError("");

      const {
        data: sessionData,
      } =
        await supabase.auth.getSession();

      const token =
        sessionData?.session
          ?.access_token;

      if (!token) {
        return;
      }

      const response =
        await fetch(
          `${API_BASE_URL}/auth/onboarding/status`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
              Accept:
                "application/json",
            },
            cache: "no-store",
          }
        );

      const data =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Unable to check verification status."
        );
      }

      setCurrentStatus(
        String(
          data?.status ||
            "pending"
        ).toLowerCase()
      );

      setOrganization(
        data?.organization_name ||
          ""
      );

      setReason(
        data?.rejection_reason ||
          ""
      );

      if (
        data?.status ===
          "approved" ||
        refresh
      ) {
        await refreshAuth();
      }
    } catch (err) {
      setError(
        err?.message ||
          "Unable to check account status."
      );
    }
  }

  useEffect(() => {
    void checkStatus();

    const timer =
      setInterval(
        () =>
          void checkStatus(),
        10000
      );

    return () =>
      clearInterval(timer);
  }, []);

  async function handleRefresh() {
    setBusy(true);

    try {
      await checkStatus({
        refresh: true,
      });

      window.location.reload();
    } catch (err) {
      setError(
        err?.message ||
          "Unable to refresh access."
      );
    } finally {
      setBusy(false);
    }
  }

  const rejected =
    currentStatus ===
    "rejected";

  const approved =
    currentStatus ===
    "approved";

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.logo}>
          L
        </div>

        <div style={styles.badge}>
          {approved ? (
            <CheckCircle2
              size={16}
            />
          ) : rejected ? (
            <XCircle
              size={16}
            />
          ) : (
            <Clock3
              size={16}
            />
          )}

          {approved
            ? "VERIFIED"
            : rejected
              ? "REGISTRATION NOT APPROVED"
              : "VERIFICATION PENDING"}
        </div>

        <h1>
          {roleLabel} account
        </h1>

        <p style={styles.lead}>
          {approved
            ? "Your provider registration has been approved. Refreshing your secure access..."
            : rejected
              ? "Your provider registration needs attention before operational access can be granted."
              : "Your account is created and your email/OTP verification is complete. Provider access is waiting for authorized LIFEGRID verification."}
        </p>

        <div
          style={
            styles.accountBox
          }
        >
          <div>
            <span>
              ACCOUNT
            </span>

            <strong>
              {user?.email ||
                "Authenticated account"}
            </strong>
          </div>

          <div>
            <span>
              REQUESTED ROLE
            </span>

            <strong>
              {roleLabel}
            </strong>
          </div>

          {organization ? (
            <div>
              <span>
                ORGANIZATION
              </span>

              <strong>
                {organization}
              </strong>
            </div>
          ) : null}
        </div>

        {rejected &&
        reason ? (
          <div
            style={
              styles.rejectedBox
            }
          >
            <strong>
              Verification note
            </strong>

            <p>
              {reason}
            </p>
          </div>
        ) : null}

        {!rejected &&
        !approved ? (
          <div
            style={
              styles.steps
            }
          >
            <div
              style={
                styles.stepDone
              }
            >
              <CheckCircle2
                size={18}
              />

              <span>
                Account created
              </span>
            </div>

            <div
              style={
                styles.stepDone
              }
            >
              <CheckCircle2
                size={18}
              />

              <span>
                OTP / email verified
              </span>
            </div>

            <div
              style={
                styles.stepActive
              }
            >
              <ShieldCheck
                size={18}
              />

              <span>
                Provider verification
              </span>
            </div>

            <div
              style={
                styles.stepWait
              }
            >
              <Clock3
                size={18}
              />

              <span>
                Dashboard access after approval
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            style={
              styles.error
            }
          >
            {error}
          </div>
        ) : null}

        <div
          style={
            styles.actions
          }
        >
          <button
            style={
              styles.primary
            }
            onClick={
              handleRefresh
            }
            disabled={busy}
          >
            <RefreshCw
              size={17}
              className={
                busy
                  ? "driver-spin"
                  : ""
              }
            />

            Check verification
          </button>

          <button
            style={
              styles.secondary
            }
            onClick={signOut}
          >
            <LogOut
              size={17}
            />

            Sign out
          </button>
        </div>

        <footer
          style={
            styles.footer
          }
        >
          LIFEGRID · Secure provider
          onboarding · No emergency
          privileges until verification
        </footer>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "#f4f8fa",
    color: "#17324d",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },

  card: {
    width: "min(620px, 100%)",
    background: "#fff",
    border:
      "1px solid #d8e4ea",
    borderRadius: 18,
    padding: 30,
    boxShadow:
      "0 12px 35px rgba(23,50,77,.08)",
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "#eaf7f5",
    color: "#138a86",
    fontSize: 24,
    fontWeight: 900,
    marginBottom: 18,
  },

  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 10px",
    borderRadius: 999,
    background: "#eef6f7",
    color: "#138a86",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: ".05em",
  },

  lead: {
    color: "#667d8e",
    lineHeight: 1.6,
    fontSize: 15,
  },

  accountBox: {
    display: "grid",
    gap: 12,
    marginTop: 20,
    padding: 15,
    background: "#f7fafb",
    border:
      "1px solid #e0e9ed",
    borderRadius: 12,
  },

  steps: {
    display: "grid",
    gap: 9,
    marginTop: 18,
  },

  stepDone: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#13815f",
    fontWeight: 700,
  },

  stepActive: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#138a86",
    fontWeight: 800,
  },

  stepWait: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#718694",
    fontWeight: 600,
  },

  rejectedBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    background: "#fff1f1",
    color: "#a52e2e",
  },

  error: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    background: "#fff1f1",
    color: "#a52e2e",
    fontSize: 13,
  },

  actions: {
    display: "flex",
    gap: 9,
    marginTop: 22,
    flexWrap: "wrap",
  },

  primary: {
    minHeight: 42,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: 0,
    borderRadius: 9,
    padding: "0 15px",
    background: "#138a86",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },

  secondary: {
    minHeight: 42,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border:
      "1px solid #d8e4ea",
    borderRadius: 9,
    padding: "0 15px",
    background: "#fff",
    color: "#17324d",
    fontWeight: 800,
    cursor: "pointer",
  },

  footer: {
    marginTop: 22,
    paddingTop: 15,
    borderTop:
      "1px solid #e4ecef",
    color: "#8294a0",
    fontSize: 11,
  },
};