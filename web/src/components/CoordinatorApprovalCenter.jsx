import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Hospital,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserRound,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { authenticatedFetch } from "../auth/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api";

const ROLE_META = {
  ambulance: {
    label: "AMBULANCE",
    icon: Truck,
    description: "Emergency response vehicle / EMS operator",
  },
  hospital: {
    label: "HOSPITAL",
    icon: Hospital,
    description: "Hospital emergency-care organization",
  },
  resource_provider: {
    label: "RESOURCE PROVIDER",
    icon: Database,
    description: "Verified blood, oxygen, ventilator or resource provider",
  },
};

function prettyRole(value) {
  return String(value || "unknown")
    .replaceAll("_", " ")
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function payloadObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

export default function CoordinatorApprovalCenter() {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadRegistrations = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/auth/registrations`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );

      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `Registration queue returned ${response.status}: ${text}`
        );
      }

      const data = JSON.parse(text);
      setRegistrations(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      console.error("Coordinator registration queue error:", err);
      setError(
        err?.message ||
          "Unable to load registration approvals. Coordinator/admin access is required."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRegistrations(false);
    const timer = window.setInterval(() => loadRegistrations(true), 15000);
    return () => window.clearInterval(timer);
  }, [loadRegistrations]);

  const pending = useMemo(
    () => registrations.filter((item) => item?.status === "pending"),
    [registrations]
  );

  const approved = useMemo(
    () => registrations.filter((item) => item?.status === "approved"),
    [registrations]
  );

  const rejected = useMemo(
    () => registrations.filter((item) => item?.status === "rejected"),
    [registrations]
  );

  const performAction = async (registrationId, action, reason = "") => {
    if (!registrationId) return;

    setBusyId(registrationId);
    setActionError("");

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/auth/registrations/${registrationId}/${action}`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: action === "reject" ? JSON.stringify({ reason }) : undefined,
        }
      );

      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `Registration action returned ${response.status}: ${text}`
        );
      }

      setRejectingId(null);
      setRejectionReason("");
      await loadRegistrations(true);
    } catch (err) {
      console.error(`Registration ${action} error:`, err);
      setActionError(
        err?.message || `Unable to ${action} this registration.`
      );
    } finally {
      setBusyId(null);
    }
  };

  const approve = (registrationId) => {
    performAction(registrationId, "approve");
  };

  const openReject = (registrationId) => {
    setActionError("");
    setRejectionReason("");
    setRejectingId(registrationId);
  };

  const reject = (registrationId) => {
    performAction(
      registrationId,
      "reject",
      rejectionReason.trim() || "Registration was not approved."
    );
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      style={styles.shell}
    >
      <div style={styles.scanline} />

      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <div style={styles.orb}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={styles.eyebrow}>TRUST & ACCESS CONTROL</div>
            <h2 style={styles.title}>Registration Command</h2>
            <p style={styles.subtitle}>
              Review provider identity requests before privileged LIFEGRID access is granted.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadRegistrations(true)}
          disabled={refreshing || loading}
          style={styles.refreshButton}
        >
          <RefreshCw
            size={15}
            style={{
              animation: refreshing ? "lifegridApprovalSpin .8s linear infinite" : "none",
            }}
          />
          SYNC REGISTRY
        </button>
      </div>

      <div style={styles.statusBar}>
        <span style={styles.liveStatus}>
          <span style={styles.liveDot} />
          ACCESS GATE ACTIVE
        </span>
        <span>{pending.length} PENDING</span>
        <span>{approved.length} APPROVED</span>
        <span>{rejected.length} REJECTED</span>
      </div>

      {(error || actionError) && (
        <div style={styles.errorBox}>
          <XCircle size={17} />
          <span>{actionError || error}</span>
        </div>
      )}

      {loading ? (
        <div style={styles.emptyState}>
          <RefreshCw size={26} style={{ animation: "lifegridApprovalSpin .8s linear infinite" }} />
          <strong>LOADING TRUST REGISTRY</strong>
          <span>Checking pending provider registrations.</span>
        </div>
      ) : pending.length === 0 ? (
        <div style={styles.emptyState}>
          <CheckCircle2 size={28} />
          <strong>NO PENDING REGISTRATIONS</strong>
          <span>The provider access queue is clear.</span>
        </div>
      ) : (
        <div style={styles.queue}>
          {pending.map((registration, index) => {
            const role = ROLE_META[registration?.requested_role] || {
              label: prettyRole(registration?.requested_role),
              icon: UserRound,
              description: "Provider registration request",
            };
            const Icon = role.icon;
            const details = payloadObject(registration?.payload);
            const organization =
              registration?.organization_name ||
              firstValue(details, [
                "organization_name",
                "provider_name",
                "hospital_name",
              ]) ||
              "Organization not supplied";
            const identifier =
              firstValue(details, [
                "vehicle_number",
                "license_number",
                "registration_number",
                "resource_name",
              ]) || "Identity details pending verification";
            const isBusy = busyId === registration?.id;

            return (
              <motion.article
                key={registration?.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                style={styles.card}
              >
                <div style={styles.cardTop}>
                  <div style={styles.roleIcon}>
                    <Icon size={21} />
                  </div>
                  <div style={styles.cardIdentity}>
                    <div style={styles.roleLine}>
                      <span style={styles.roleBadge}>{role.label}</span>
                      <span style={styles.pendingBadge}>
                        <Clock3 size={11} /> PENDING REVIEW
                      </span>
                    </div>
                    <h3 style={styles.cardName}>
                      {registration?.full_name || "Unnamed applicant"}
                    </h3>
                    <div style={styles.cardMeta}>
                      {registration?.email || "No email"}
                      {registration?.phone ? ` · ${registration.phone}` : ""}
                    </div>
                  </div>
                </div>

                <div style={styles.detailGrid}>
                  <Detail label="ORGANIZATION" value={organization} />
                  <Detail label="IDENTIFIER" value={identifier} />
                  <Detail
                    label="REQUESTED"
                    value={formatDate(registration?.created_at)}
                  />
                </div>

                {registration?.rejection_reason && (
                  <div style={styles.previousNote}>
                    Previous review: {registration.rejection_reason}
                  </div>
                )}

                <div style={styles.cardFooter}>
                  <div style={styles.accessNote}>
                    <Zap size={13} />
                    Approval grants the requested provider role through secure server-side metadata.
                  </div>
                  <div style={styles.actions}>
                    <button
                      type="button"
                      onClick={() => openReject(registration.id)}
                      disabled={isBusy}
                      style={styles.rejectButton}
                    >
                      <X size={14} /> REJECT
                    </button>
                    <button
                      type="button"
                      onClick={() => approve(registration.id)}
                      disabled={isBusy}
                      style={styles.approveButton}
                    >
                      {isBusy ? (
                        <RefreshCw size={14} style={{ animation: "lifegridApprovalSpin .8s linear infinite" }} />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      {isBusy ? "PROCESSING" : "APPROVE ACCESS"}
                    </button>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <div style={styles.footerNote}>
        <Building2 size={13} />
        <span>
          Provider accounts remain restricted until a coordinator/admin completes review. Users must sign in again after approval to receive the new role.
        </span>
      </div>

      <AnimatePresence>
        {rejectingId !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.overlay}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              style={styles.modal}
            >
              <div style={styles.modalIcon}>
                <XCircle size={21} />
              </div>
              <div>
                <div style={styles.eyebrow}>ACCESS DECISION</div>
                <h3 style={styles.modalTitle}>Reject registration?</h3>
                <p style={styles.modalText}>
                  Add a short reason so the review decision is auditable.
                </p>
              </div>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Reason for rejection..."
                maxLength={500}
                style={styles.textarea}
                autoFocus
              />
              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setRejectingId(null)}
                  disabled={busyId !== null}
                  style={styles.cancelButton}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => reject(rejectingId)}
                  disabled={busyId !== null}
                  style={styles.modalRejectButton}
                >
                  {busyId !== null ? "PROCESSING..." : "CONFIRM REJECTION"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes lifegridApprovalSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.section>
  );
}


function Detail({ label, value }) {
  return (
    <div
      style={{
        minWidth: 0,
        minHeight: 66,
        padding: "13px 15px",
        boxSizing: "border-box",
        border: "1px solid #e1e7ed",
        borderRadius: 11,
        background: "#ffffff",
      }}
    >
      <span
        style={{
          display: "block",
          color: "#687789",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.07em",
          lineHeight: 1.4,
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: "block",
          marginTop: 7,
          color: "#1e293b",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.45,
          overflowWrap: "anywhere",
          whiteSpace: "normal",
        }}
      >
        {value || "Not provided"}
      </strong>
    </div>
  );
}

const styles = {

shell: {
  position: "relative",
  overflow: "hidden",
  marginTop: 16,
  padding: 24,
  boxSizing: "border-box",
  borderRadius: 18,
  border: "1px solid #e1e7ed",
  background: "#ffffff",
  boxShadow: "0 8px 28px rgba(15, 23, 42, 0.045)",
},

  scanline: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: 0.22,
    background:
      "linear-gradient(transparent 49%, rgba(105, 177, 255, .045) 50%, transparent 51%)",
    backgroundSize: "100% 7px",
  },
  header: {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
  },
  titleGroup: {
    display: "flex",
    alignItems: "center",
    gap: 13,
    minWidth: 0,
  },
  orb: {
    width: 45,
    height: 45,
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    color: "#72c7ff",
    borderRadius: 14,
    background: "radial-gradient(circle, rgba(73,181,255,.16), rgba(73,181,255,.035))",
    border: "1px solid rgba(92, 187, 255, .22)",
    boxShadow: "0 0 25px rgba(70, 165, 255, .08)",
  },
  eyebrow: {
    color: "#6583aa",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: ".16em",
  },
  title: {
    margin: "4px 0 3px",
    color: "#edf5ff",
    fontSize: 23,
    letterSpacing: "-.02em",
  },
  subtitle: {
    margin: 0,
    color: "#7389a7",
    fontSize: 11,
    lineHeight: 1.45,
  },
  refreshButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    padding: "0 12px",
    borderRadius: 11,
    border: "1px solid rgba(105, 165, 230, .18)",
    background: "rgba(9, 25, 48, .78)",
    color: "#a9c7e8",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: ".08em",
  },
  statusBar: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 15,
    flexWrap: "wrap",
    marginTop: 16,
    padding: "9px 11px",
    borderRadius: 11,
    border: "1px solid rgba(90, 164, 229, .10)",
    background: "rgba(4, 17, 35, .65)",
    color: "#607998",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: ".08em",
  },
  liveStatus: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "#54e9ae",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#54e9ae",
    boxShadow: "0 0 11px rgba(84,233,174,.85)",
  },
  errorBox: {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    marginTop: 13,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255, 83, 100, .22)",
    background: "rgba(255, 83, 100, .06)",
    color: "#ff9aa6",
    fontSize: 11,
    lineHeight: 1.45,
  },
  queue: {
    position: "relative",
    display: "grid",
    gap: 10,
    marginTop: 13,
  },

card: {
  minWidth: 0,
  padding: 20,
  boxSizing: "border-box",
  borderRadius: 15,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  boxShadow: "none",
},

  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  roleIcon: {
    width: 42,
    height: 42,
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    color: "#70c4ff",
    background: "rgba(74, 166, 255, .08)",
    border: "1px solid rgba(82, 171, 255, .16)",
  },
  cardIdentity: {
    minWidth: 0,
    flex: 1,
  },
  roleLine: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  roleBadge: {
    color: "#70c4ff",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: ".10em",
  },
  pendingBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: "#f5c46c",
    fontSize: 7,
    fontWeight: 900,
    letterSpacing: ".08em",
  },
  cardName: {
    margin: "5px 0 2px",
    color: "#eaf3ff",
    fontSize: 15,
  },
  cardMeta: {
    color: "#6e87a7",
    fontSize: 10,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr 1fr",
    gap: 8,
    marginTop: 13,
  },
  detail: {
    minWidth: 0,
    padding: "9px 10px",
    borderRadius: 10,
    background: "rgba(4, 15, 31, .62)",
    border: "1px solid rgba(104, 157, 214, .08)",
  },
  detailLabel: {},
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
    paddingTop: 11,
    borderTop: "1px solid rgba(255,255,255,.05)",
  },
  accessNote: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 200,
    color: "#607995",
    fontSize: 8,
    lineHeight: 1.4,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 7,
  },
  rejectButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    padding: "0 11px",
    borderRadius: 9,
    border: "1px solid rgba(255, 96, 111, .18)",
    background: "rgba(255, 78, 97, .055)",
    color: "#ff9ba5",
    cursor: "pointer",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: ".07em",
  },
  approveButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 9,
    border: "1px solid rgba(75, 231, 169, .22)",
    background: "linear-gradient(135deg, rgba(60, 218, 156, .13), rgba(55, 138, 255, .08))",
    color: "#73edbd",
    cursor: "pointer",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: ".07em",
  },
  previousNote: {
    marginTop: 9,
    padding: "8px 10px",
    borderRadius: 9,
    color: "#8ea0b9",
    background: "rgba(255, 190, 70, .04)",
    border: "1px solid rgba(255, 190, 70, .09)",
    fontSize: 9,
  },
  emptyState: {
    position: "relative",
    minHeight: 145,
    marginTop: 13,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    borderRadius: 15,
    border: "1px dashed rgba(99, 158, 214, .13)",
    color: "#6d86a5",
    textAlign: "center",
  },
  footerNote: {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 13,
    paddingTop: 11,
    borderTop: "1px solid rgba(255,255,255,.05)",
    color: "#526b89",
    fontSize: 8,
    lineHeight: 1.5,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "rgba(1, 6, 14, .78)",
    backdropFilter: "blur(10px)",
  },
  modal: {
    width: "min(460px, 100%)",
    padding: 20,
    borderRadius: 19,
    border: "1px solid rgba(255, 89, 105, .20)",
    background: "linear-gradient(145deg, rgba(12, 23, 43, .98), rgba(5, 11, 23, .98))",
    boxShadow: "0 30px 100px rgba(0,0,0,.5)",
  },
  modalIcon: {
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    marginBottom: 13,
    borderRadius: 12,
    color: "#ff7c89",
    background: "rgba(255, 83, 100, .08)",
    border: "1px solid rgba(255, 83, 100, .16)",
  },
  modalTitle: {
    margin: "5px 0 4px",
    color: "#f0f6ff",
    fontSize: 21,
  },
  modalText: {
    margin: 0,
    color: "#7c90ad",
    fontSize: 10,
    lineHeight: 1.5,
  },
  textarea: {
    width: "100%",
    minHeight: 105,
    boxSizing: "border-box",
    resize: "vertical",
    marginTop: 14,
    padding: 12,
    borderRadius: 11,
    outline: "none",
    border: "1px solid rgba(106, 153, 211, .16)",
    background: "rgba(2, 10, 22, .8)",
    color: "#dce8f7",
    fontSize: 11,
    fontFamily: "inherit",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  cancelButton: {
    minHeight: 36,
    padding: "0 13px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,.08)",
    background: "rgba(255,255,255,.035)",
    color: "#8194ae",
    cursor: "pointer",
    fontSize: 8,
    fontWeight: 900,
  },
  modalRejectButton: {
    minHeight: 36,
    padding: "0 13px",
    borderRadius: 9,
    border: "1px solid rgba(255, 83, 100, .22)",
    background: "rgba(255, 83, 100, .09)",
    color: "#ff929e",
    cursor: "pointer",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: ".05em",
  },
};

