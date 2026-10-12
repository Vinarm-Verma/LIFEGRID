
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ambulance,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  ShieldCheck,
  Siren,
  Truck,
  Users,
  X,
  XCircle,
  MapPinned,
  Radio,
} from "lucide-react";
import { authenticatedFetch, supabase } from "../auth/supabase";
import { useAuth } from "../auth/AuthContext";
import CoordinatorApprovalCenter from "./CoordinatorApprovalCenter";
import LifeGridMap from "./LifeGridMap";
import "./coordinator-dashboard.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "/api"
).replace(/\/$/, "");

const ACTIVE_STATUSES = new Set([
  "new",
  "reported",
  "active",
  "coordinated",
  "assigned",
  "accepted",
  "hospital_accepted",
  "ambulance_requested",
  "en_route",
  "arrived",
  "transporting",
]);

const CLOSED_STATUSES = new Set([
  "resolved",
  "completed",
  "closed",
  "cancelled",
]);

function pretty(value, fallback = "Not available") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;

  return text
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function readResponse(response) {
  const text = await response.text();
  const data = readJson(text);

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.message ||
      `Request failed (${response.status}).`
    );
  }

  return data;
}

function getEmergencyId(item) {
  return item?.id ?? item?.emergency_id ?? null;
}

function getCoordinates(item) {
  if (!item) return null;

  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);

  if (
    item.latitude == null ||
    item.longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  return { latitude, longitude };
}

function getAccuracy(item) {
  const raw =
    item?.gps_accuracy_m ??
    item?.location_accuracy_m ??
    item?.accuracy_m ??
    item?.location_accuracy;

  if (raw == null || raw === "") return null;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(value) {
  if (!value) return "Time unavailable";

  const date = new Date(value).getTime();
  if (!Number.isFinite(date)) return "Time unavailable";

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - date) / 60000)
  );

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  return `${Math.floor(hours / 24)} day(s) ago`;
}

function severityMeta(value) {
  const severity = String(value || "").toLowerCase();

  if (severity === "critical") {
    return { label: "Critical", className: "critical" };
  }
  if (severity === "high") {
    return { label: "High", className: "high" };
  }
  if (severity === "medium" || severity === "moderate") {
    return { label: "Moderate", className: "medium" };
  }
  if (severity === "low") {
    return { label: "Low", className: "low" };
  }

  return { label: pretty(value, "Unrated"), className: "pending" };
}

function statusMeta(value) {
  const status = String(value || "reported").toLowerCase();

  if (CLOSED_STATUSES.has(status)) {
    return { label: pretty(status), className: "closed" };
  }
  if (["en_route", "transporting", "arrived"].includes(status)) {
    return { label: pretty(status), className: "moving" };
  }
  if (
    [
      "coordinated",
      "assigned",
      "accepted",
      "hospital_accepted",
      "ambulance_requested",
    ].includes(status)
  ) {
    return { label: pretty(status), className: "assigned" };
  }

  return { label: pretty(status, "Reported"), className: "waiting" };
}

function distanceLabel(value) {
  const distance = Number(value);
  return Number.isFinite(distance) && distance >= 0
    ? `${distance.toFixed(1)} km`
    : "Distance unavailable";
}

function etaLabel(value) {
  const eta = Number(value);
  return Number.isFinite(eta) && eta >= 0
    ? `${Math.round(eta)} min estimated`
    : "ETA unavailable";
}

export default function CoordinatorDashboard({ onSelectEmergency }) {
  const { user, role, signOut } = useAuth();

  const [emergencies, setEmergencies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [matching, setMatching] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [matchingMessage, setMatchingMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [realtime, setRealtime] = useState("Connecting");
  const [lastSync, setLastSync] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadEmergencies = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/emergencies`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );

      const payload = await readResponse(response);
      const rows = Array.isArray(payload?.emergencies)
        ? payload.emergencies
        : Array.isArray(payload)
          ? payload
          : [];

      setEmergencies(rows);
      setLastSync(Date.now());
      setError("");
    } catch (err) {
      console.error("LIFEGRID emergency queue:", err);
      setError(err?.message || "Unable to load emergency reports.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    void loadEmergencies();

    const channel = supabase
      .channel("lifegrid-coordinator-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emergencies" },
        () => {
          if (alive) void loadEmergencies(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lifegrid_dispatch_assignments",
        },
        () => {
          if (alive) void loadEmergencies(true);
        }
      )
      .subscribe((status) => {
        if (!alive) return;

        if (status === "SUBSCRIBED") setRealtime("Live");
        else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          setRealtime("Polling");
        } else {
          setRealtime("Connecting");
        }
      });

    const timer = window.setInterval(() => {
      if (alive) void loadEmergencies(true);
    }, 10000);

    return () => {
      alive = false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadEmergencies]);

  const visibleEmergencies = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...emergencies]
      .filter((item) => {
        const status = String(item?.status || "reported").toLowerCase();
        const severity = String(item?.severity || "").toLowerCase();

        if (filter === "active" && !ACTIVE_STATUSES.has(status)) return false;
        if (filter === "critical" && severity !== "critical") return false;
        if (filter === "coordinated" && ![
          "coordinated",
          "assigned",
          "accepted",
          "hospital_accepted",
          "ambulance_requested",
          "en_route",
          "arrived",
          "transporting",
        ].includes(status)) return false;
        if (filter === "resolved" && !CLOSED_STATUSES.has(status)) return false;

        if (!query) return true;

        const haystack = [
          item?.id,
          item?.emergency_id,
          item?.emergency_type,
          item?.description,
          item?.status,
          item?.severity,
        ].join(" ").toLowerCase();

        return haystack.includes(query);
      })
      .sort(
        (a, b) =>
          new Date(b?.created_at || 0).getTime() -
          new Date(a?.created_at || 0).getTime()
      );
  }, [emergencies, filter, search]);

  const activeCount = emergencies.filter((item) =>
    ACTIVE_STATUSES.has(String(item?.status || "reported").toLowerCase())
  ).length;

  const criticalCount = emergencies.filter(
    (item) => String(item?.severity || "").toLowerCase() === "critical"
  ).length;

  const coordinatedCount = emergencies.filter((item) =>
    [
      "coordinated",
      "assigned",
      "accepted",
      "hospital_accepted",
      "ambulance_requested",
      "en_route",
      "arrived",
      "transporting",
    ].includes(String(item?.status || "").toLowerCase())
  ).length;

  const resolvedCount = emergencies.filter((item) =>
    CLOSED_STATUSES.has(String(item?.status || "").toLowerCase())
  ).length;

  async function openEmergency(item) {
    const id = getEmergencyId(item);
    if (id == null) return;

    setSelected(null);
    setMatching(null);
    setError("");
    setMatchingMessage("");
    setActionMessage("");
    setLoadingDetail(true);
    setSidebarOpen(false);

    try {
      const detailResponse = await authenticatedFetch(
        `${API_BASE_URL}/emergencies/${id}`,
        { cache: "no-store", headers: { Accept: "application/json" } }
      );
      const detail = await readResponse(detailResponse);

      // Show the emergency even when matching is unavailable.
      const emergency = {
        ...item,
        ...detail,
        id: detail?.id ?? id,
      };

      setSelected(emergency);
      onSelectEmergency?.(emergency);

      try {
        const matchingResponse = await authenticatedFetch(
          `${API_BASE_URL}/matching/emergency/${id}`,
          { cache: "no-store", headers: { Accept: "application/json" } }
        );
        const match = await readResponse(matchingResponse);
        setMatching(match);
        setMatchingMessage("");
      } catch (matchError) {
        console.error("LIFEGRID provider matching:", matchError);
        setMatching(null);
        setMatchingMessage(
          matchError?.message ||
          "Provider matching is currently unavailable. Refresh to try again."
        );
      }
    } catch (err) {
      console.error("LIFEGRID emergency detail:", err);
      setError(err?.message || `Unable to open emergency ${id}.`);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function refreshMatching() {
    if (!selected?.id) return;

    setMatchingLoading(true);
    setMatchingMessage("");

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/matching/emergency/${selected.id}`,
        { cache: "no-store", headers: { Accept: "application/json" } }
      );

      const data = await readResponse(response);
      setMatching(data);
      setMatchingMessage("");
    } catch (err) {
      console.error("LIFEGRID matching refresh:", err);
      setMatching(null);
      setMatchingMessage(
        err?.message || "Unable to refresh provider matching."
      );
    } finally {
      setMatchingLoading(false);
    }
  }

  async function coordinateEmergency() {
    if (!selected?.id || dispatching) return;

    setDispatching(true);
    setError("");
    setActionMessage("");

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/matching/emergency/${selected.id}/coordinate`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      const data = await readResponse(response);

      setActionMessage(
        data?.message ||
        "The backend accepted the coordination request. Verify the assignment status below."
      );

      await loadEmergencies(true);

      // Reload detail and matching without discarding the success message.
      const [detailResponse, matchResponse] = await Promise.all([
        authenticatedFetch(
          `${API_BASE_URL}/emergencies/${selected.id}`,
          { cache: "no-store" }
        ),
        authenticatedFetch(
          `${API_BASE_URL}/matching/emergency/${selected.id}`,
          { cache: "no-store" }
        ),
      ]);

      if (detailResponse.ok) {
        const detail = await readResponse(detailResponse);
        setSelected((current) => ({
          ...current,
          ...detail,
          id: detail?.id ?? current?.id,
        }));
      }

      if (matchResponse.ok) {
        setMatching(await readResponse(matchResponse));
      }
    } catch (err) {
      // A 409/403 response is shown as a real reason, not hidden behind a disabled button.
      setError(err?.message || "Coordination could not be completed.");
    } finally {
      setDispatching(false);
    }
  }

  const recommendedAmbulance = matching?.recommended_ambulance ?? null;
  const recommendedHospital = matching?.recommended_hospital ?? null;
  const coordinates = getCoordinates(selected);
  const accuracy = getAccuracy(selected);

  const selectedStatus = String(selected?.status || "reported").toLowerCase();
  const canRequestCoordination =
    Boolean(selected) &&
    !CLOSED_STATUSES.has(selectedStatus) &&
    !dispatching;

  return (
    <main className="coordinator-shell">
      <aside className={`coordinator-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark"><Activity size={25} /></div>
          <div>
            <strong>LIFEGRID</strong>
            <span>Emergency network</span>
          </div>
          <button
            className="sidebar-close"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Coordinator navigation">
          <a className="sidebar-link active" href="#overview" onClick={() => setSidebarOpen(false)}>
            <LayoutDashboard size={19} />
            <span>Overview</span>
          </a>
          <a className="sidebar-link" href="#queue" onClick={() => setSidebarOpen(false)}>
            <Siren size={19} />
            <span>Emergency queue</span>
            <span className="sidebar-count">{activeCount}</span>
          </a>
          <a className="sidebar-link" href="#response" onClick={() => setSidebarOpen(false)}>
            <Truck size={19} />
            <span>Response coordination</span>
          </a>
          <a className="sidebar-link" href="#approvals" onClick={() => setSidebarOpen(false)}>
            <ShieldCheck size={19} />
            <span>Provider approvals</span>
          </a>
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-safety">
          <ShieldCheck size={20} />
          <strong>Verified response</strong>
          <p>Only eligible, verified providers should be assigned to an incident.</p>
        </div>

        <div className="sidebar-account">
          <div className="account-avatar">
            {(user?.email || "C").slice(0, 1).toUpperCase()}
          </div>
          <div className="account-info">
            <strong>{user?.email || "Coordinator"}</strong>
            <span>{pretty(role, "Coordinator")}</span>
          </div>
          <button
            type="button"
            className="account-logout"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <section className="coordinator-main" id="overview">
        <header className="coordinator-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <div>
              <span className="topbar-kicker">OPERATIONS CENTER</span>
              <strong>Coordinator dashboard</strong>
            </div>
          </div>

          <div className="topbar-right">
            <span className={`connection-pill ${realtime === "Live" ? "connected" : ""}`}>
              <span className="connection-dot" />
              {realtime === "Live" ? "Live updates" : realtime}
            </span>
            <button
              type="button"
              className="topbar-refresh"
              onClick={() => void loadEmergencies(true)}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? "spin" : ""} size={17} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <div className="coordinator-content">
          <section className="dashboard-hero">
            <div>
              <p className="eyebrow">EMERGENCY RESPONSE • LIVE OPERATIONS</p>
              <h1>Response overview</h1>
              <p>
                Review incident reports, verify provider availability and coordinate
                the next response step with accurate, recorded information.
              </p>
            </div>
            <div className="hero-sync">
              <Radio size={18} />
              <div>
                <strong>{lastSync ? "Queue synchronized" : "Connecting to queue"}</strong>
                <span>{lastSync ? `Last sync ${new Date(lastSync).toLocaleTimeString()}` : "Waiting for API"}</span>
              </div>
            </div>
          </section>

          {error && (
            <div className="dashboard-alert error-alert" role="alert">
              <XCircle size={21} />
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
                <X size={18} />
              </button>
            </div>
          )}

          {actionMessage && (
            <div className="dashboard-alert success-alert" role="status">
              <CheckCircle2 size={21} />
              <span>{actionMessage}</span>
              <button type="button" onClick={() => setActionMessage("")} aria-label="Dismiss message">
                <X size={18} />
              </button>
            </div>
          )}

          <section className="overview-metrics" aria-label="Emergency metrics">
            <Metric icon={Siren} label="Active incidents" value={activeCount} tone="teal" hint="Open response cases" />
            <Metric icon={AlertTriangle} label="Critical priority" value={criticalCount} tone="red" hint="Requires urgent review" />
            <Metric icon={Truck} label="Coordinated cases" value={coordinatedCount} tone="purple" hint="Response in progress" />
            <Metric icon={CheckCircle2} label="Resolved cases" value={resolvedCount} tone="lime" hint="Closed records" />
          </section>

          <section className="operations-layout">
            <div className="surface-card queue-surface" id="queue">
              <div className="surface-heading">
                <div>
                  <p className="eyebrow">INCIDENT MANAGEMENT</p>
                  <h2>Emergency queue</h2>
                  <p className="section-subtitle">Select a report to inspect its details.</p>
                </div>
                <span className="queue-total">{visibleEmergencies.length} shown</span>
              </div>

              <div className="queue-tools">
                <label className="search-field">
                  <span className="sr-only">Search emergencies</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search ID, type or description…"
                  />
                </label>
              </div>

              <div className="queue-filter-row" role="group" aria-label="Filter emergencies">
                {[
                  ["active", "Active"],
                  ["critical", "Critical"],
                  ["coordinated", "Coordinated"],
                  ["resolved", "Resolved"],
                  ["all", "All"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`queue-filter ${filter === value ? "selected" : ""}`}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="queue-empty">
                  <RefreshCw className="spin" size={28} />
                  <strong>Loading emergency reports</strong>
                  <span>Connecting to the LIFEGRID API…</span>
                </div>
              ) : visibleEmergencies.length === 0 ? (
                <div className="queue-empty">
                  <CheckCircle2 size={32} />
                  <strong>No reports match this filter</strong>
                  <span>Try another filter or refresh the queue.</span>
                </div>
              ) : (
                <div className="incident-list">
                  {visibleEmergencies.map((item) => {
                    const id = getEmergencyId(item);
                    const severity = severityMeta(item?.severity);
                    const status = statusMeta(item?.status);
                    const active = String(getEmergencyId(selected) ?? "") === String(id ?? "");

                    return (
                      <button
                        type="button"
                        key={id}
                        className={`incident-card ${active ? "is-selected" : ""}`}
                        onClick={() => void openEmergency(item)}
                      >
                        <span className={`incident-severity-rail ${severity.className}`} />
                        <div className="incident-card-body">
                          <div className="incident-card-heading">
                            <strong>{pretty(item?.emergency_type, "Emergency report")}</strong>
                            <span className={`severity-badge ${severity.className}`}>
                              {severity.label}
                            </span>
                          </div>
                          <p>{item?.description || "No description supplied."}</p>
                          <div className="incident-card-meta">
                            <span>#{id}</span>
                            <span>{timeAgo(item?.created_at)}</span>
                            <span className={`status-badge ${status.className}`}>{status.label}</span>
                          </div>
                          <div className="incident-card-date">{formatDate(item?.created_at)}</div>
                        </div>
                        <ArrowUpRight className="incident-open-icon" size={19} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="surface-card incident-detail" id="response">
              {loadingDetail ? (
                <div className="detail-loading">
                  <RefreshCw className="spin" size={30} />
                  <strong>Loading incident details…</strong>
                </div>
              ) : !selected ? (
                <div className="detail-empty">
                  <div className="detail-empty-icon"><MapPinned size={30} /></div>
                  <p className="eyebrow">INCIDENT WORKSPACE</p>
                  <h2>Select an emergency</h2>
                  <p>
                    The incident workspace will show recorded coordinates, severity,
                    response options and the next available action.
                  </p>
                </div>
              ) : (
                <>
                  <div className="detail-title-row">
                    <div>
                      <p className="eyebrow">INCIDENT #{selected.id}</p>
                      <h2>{pretty(selected.emergency_type, "Emergency report")}</h2>
                      <p className="detail-created">
                        Reported {formatDate(selected.created_at)} · {timeAgo(selected.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="close-detail"
                      onClick={() => {
                        setSelected(null);
                        setMatching(null);
                        setMatchingMessage("");
                        setActionMessage("");
                      }}
                      aria-label="Close incident"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="detail-badges">
                    <span className={`severity-badge large ${severityMeta(selected.severity).className}`}>
                      {severityMeta(selected.severity).label} priority
                    </span>
                    <span className={`status-badge ${statusMeta(selected.status).className}`}>
                      {statusMeta(selected.status).label}
                    </span>
                    {selected.patient_count != null && (
                      <span className="neutral-badge">
                        <Users size={15} /> {selected.patient_count} people involved
                      </span>
                    )}
                  </div>

                  <section className="detail-section">
                    <div className="detail-section-heading">
                      <div className="section-icon teal"><Siren size={20} /></div>
                      <div>
                        <h3>Emergency report</h3>
                        <p>Information supplied by the reporting citizen.</p>
                      </div>
                    </div>
                    <div className="report-description">
                      {selected.description || "No description supplied."}
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="detail-section-heading">
                      <div className="section-icon blue"><MapPin size={20} /></div>
                      <div>
                        <h3>Reported GPS location</h3>
                        <p>Coordinates are shown from the saved incident record.</p>
                      </div>
                    </div>

                    {coordinates ? (
                      <div className="gps-panel">
                        <div className="gps-coordinate-grid">
                          <Coordinate label="Latitude" value={coordinates.latitude.toFixed(6)} />
                          <Coordinate label="Longitude" value={coordinates.longitude.toFixed(6)} />
                        </div>
                        <div className="gps-status-line">
                          <MapPin size={16} />
                          <span>
                            {accuracy != null
                              ? `Reported GPS accuracy ±${Math.round(accuracy)} m`
                              : "GPS accuracy was not recorded"}
                          </span>
                        </div>
                        <a
                          className="map-open-button"
                          href={`https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MapPinned size={17} />
                          Verify location on map
                          <ArrowUpRight size={16} />
                        </a>
                        <p className="gps-note">
                          No city is inferred from the coordinates. Verify the pin before
                          dispatch if the reported address or description conflicts with GPS.
                        </p>
                      </div>
                    ) : (
                      <div className="location-unavailable">
                        <AlertTriangle size={20} />
                        <div>
                          <strong>No valid GPS coordinates recorded</strong>
                          <p>Use the citizen's reported address or landmark. Do not assume a location.</p>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="detail-section">
                    <div className="detail-section-heading section-heading-with-action">
                      <div className="section-icon purple"><Activity size={20} /></div>
                      <div>
                        <h3>Response resources</h3>
                        <p>Recommendations from the current provider-matching API.</p>
                      </div>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void refreshMatching()}
                        disabled={matchingLoading}
                      >
                        <RefreshCw className={matchingLoading ? "spin" : ""} size={16} />
                        Refresh
                      </button>
                    </div>

                    {matchingMessage && (
                      <div className="matching-notice" role="status">
                        <AlertTriangle size={18} />
                        <span>{matchingMessage}</span>
                      </div>
                    )}

                    <div className="resource-grid">
                      <ProviderCard
                        icon={Ambulance}
                        label="Recommended ambulance"
                        item={recommendedAmbulance}
                        empty="No eligible verified ambulance is currently recommended."
                        detail={recommendedAmbulance
                          ? `${distanceLabel(recommendedAmbulance.distance_km)} · ${etaLabel(recommendedAmbulance.estimated_eta_minutes)}`
                          : ""}
                      />
                      <ProviderCard
                        icon={Building2}
                        label="Recommended hospital"
                        item={recommendedHospital}
                        empty="No eligible hospital with current availability is currently recommended."
                        detail={recommendedHospital
                          ? `${distanceLabel(recommendedHospital.distance_km)} · ${etaLabel(recommendedHospital.estimated_eta_minutes)}`
                          : ""}
                      />
                    </div>
                  </section>

                  <section className="dispatch-control">
                    <div className="dispatch-control-copy">
                      <p className="eyebrow">COORDINATOR ACTION</p>
                      <h3>
                        {dispatching ? "Processing coordination…" : "Coordinate response"}
                      </h3>
                      <p>
                        The backend will validate provider availability and permissions.
                        If no eligible ambulance or hospital is available, the API will
                        return the reason instead of creating a false assignment.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="coordinate-button"
                      disabled={!canRequestCoordination}
                      onClick={() => void coordinateEmergency()}
                    >
                      {dispatching
                        ? <RefreshCw className="spin" size={19} />
                        : <Truck size={19} />}
                      {dispatching ? "Checking availability…" : "Coordinate response"}
                    </button>
                  </section>

                  {selected.assigned_ambulance_id && (
                    <section className="detail-section">
                      <div className="detail-section-heading">
                        <div className="section-icon teal"><Radio size={20} /></div>
                        <div>
                          <h3>Live response map</h3>
                          <p>Uses saved emergency and provider coordinates.</p>
                        </div>
                      </div>
                      <LifeGridMap
                        emergency={selected}
                        ambulance={matching?.recommended_ambulance || null}
                        hospital={matching?.recommended_hospital || null}
                        resources={matching?.resources || []}
                      />
                    </section>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="approval-surface" id="approvals">
            <div className="approval-surface-heading">
              <div>
                <p className="eyebrow">TRUST & SAFETY</p>
                <h2>Provider approvals</h2>
                <p>Review providers before they participate in coordinated response.</p>
              </div>
              <ShieldCheck size={27} />
            </div>
            <CoordinatorApprovalCenter />
          </section>

          <footer className="coordinator-footer">
            <span><ShieldCheck size={16} /> LIFEGRID supports authorized responders.</span>
            <span>For a real emergency, contact official emergency services.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value, tone, hint }) {
  return (
    <article className="overview-metric">
      <div className={`metric-symbol ${tone}`}><Icon size={22} /></div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
      <span className={`metric-edge ${tone}`} />
    </article>
  );
}

function Coordinate({ label, value }) {
  return (
    <div className="coordinate-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProviderCard({ icon: Icon, label, item, empty, detail }) {
  return (
    <article className="resource-card">
      <div className="resource-card-top">
        <div className="resource-icon"><Icon size={21} /></div>
        <span className={`resource-state ${item ? "available" : "unavailable"}`}>
          <span />
          {item ? "Matched" : "Not matched"}
        </span>
      </div>
      <span className="resource-label">{label}</span>
      {item ? (
        <>
          <strong className="resource-name">
            {item.name || item.vehicle_number || item.provider_name || "Verified provider"}
          </strong>
          <p className="resource-description">
            {item.provider_name || item.address || "Provider details returned by API"}
          </p>
          {detail && <div className="resource-detail">{detail}</div>}
        </>
      ) : (
        <p className="resource-empty">{empty}</p>
      )}
    </article>
  );
}
