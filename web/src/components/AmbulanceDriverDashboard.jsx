
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ambulance,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Gauge,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
  Wind,
  Zap,
} from "lucide-react";

import { authenticatedFetch, supabase } from "../auth/supabase";
import { useAuth } from "../auth/AuthContext";

const API = import.meta.env.VITE_API_BASE_URL || "/api";

const ACTIVE_STATUSES = [
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "transporting",
];

const STATUS_OPTIONS = [
  ["assigned", "Assigned"],
  ["accepted", "Accept dispatch"],
  ["en_route", "En route"],
  ["arrived", "Arrived"],
  ["transporting", "Transporting"],
];

const fmt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
};

const upper = (value, fallback = "—") =>
  String(value ?? fallback)
    .replaceAll("_", " ")
    .toUpperCase();

const normaliseStatus = (value) =>
  String(value || "available").toLowerCase().replaceAll(" ", "_");

function StatCard({ icon: Icon, label, value, detail, tone = "teal" }) {
  return (
    <article className={`lgad-stat lgad-stat-${tone}`}>
      <div className="lgad-stat-icon">
        <Icon size={21} strokeWidth={1.8} />
      </div>
      <div className="lgad-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function SectionHeading({ number, eyebrow, title, icon: Icon, trailing }) {
  return (
    <div className="lgad-section-heading">
      <div className="lgad-section-title">
        <div className="lgad-eyebrow">
          <span>{number}</span>
          {eyebrow}
        </div>
        <h2>{title}</h2>
      </div>
      {trailing || (
        Icon && (
          <div className="lgad-heading-icon">
            <Icon size={20} />
          </div>
        )
      )}
    </div>
  );
}

function AssignmentCard({ item, selected, onClick }) {
  const severity = upper(item.severity, "STANDARD");
  const incidentStatus = upper(item.status, "OPEN");

  return (
    <button
      type="button"
      className={`lgad-assignment ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className="lgad-assignment-top">
        <div className="lgad-incident-icon">
          <AlertTriangle size={18} />
        </div>
        <div className="lgad-assignment-heading">
          <span>INCIDENT LG-{String(item.id).padStart(6, "0")}</span>
          <strong>{upper(item.emergency_type, "EMERGENCY")}</strong>
        </div>
        <span
          className={`lgad-severity ${
            severity.includes("CRITICAL") || severity.includes("HIGH")
              ? "severity-high"
              : ""
          }`}
        >
          {severity}
        </span>
      </div>

      <p className="lgad-assignment-description">
        {item.description || "No incident description supplied."}
      </p>

      <div className="lgad-assignment-meta">
        <span>
          <Users size={14} />
          {item.patient_count ?? 1} patient(s)
        </span>
        <span>
          <Clock3 size={14} />
          {fmt(item.created_at)}
        </span>
      </div>

      <div className="lgad-assignment-bottom">
        <span className="lgad-incident-state">
          <i />
          {incidentStatus}
        </span>
        <span className="lgad-view-incident">
          {selected ? "Selected" : "View incident"}
          <ArrowUpRight size={14} />
        </span>
      </div>
    </button>
  );
}

function ReadinessItem({ label, ready }) {
  return (
    <div className="lgad-readiness-item">
      <div className={`lgad-readiness-indicator ${ready ? "ready" : ""}`}>
        {ready ? <CheckCircle2 size={17} /> : <span>—</span>}
      </div>
      <div>
        <span>{label}</span>
        <strong>{ready ? "Available" : "Not confirmed"}</strong>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="lgad-empty">
      <div className="lgad-empty-icon">
        <Icon size={27} strokeWidth={1.7} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export default function AmbulanceDriverDashboard() {
  const { user, role } = useAuth();

  const [profile, setProfile] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("available");
  const [gpsState, setGpsState] = useState("STANDBY");
  const [accuracy, setAccuracy] = useState(null);
  const [network, setNetwork] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastSynced, setLastSynced] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const isAmbulanceRole =
    role === "ambulance" || role === "ambulance_driver";

  const ambulance = profile?.profile || {};

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError("");
    setNotice("");

    try {
      const [profileResponse, assignmentResponse] = await Promise.all([
        authenticatedFetch(
          `${API}/ambulances/my-profile`,
          { cache: "no-store" }
        ),
        authenticatedFetch(
          `${API}/matching/my-assignment`,
          { cache: "no-store" }
        ),
      ]);

      const profileText = await profileResponse.text();
      const assignmentText = await assignmentResponse.text();

      let profileData = {};
      let assignmentData = null;

      try {
        profileData = profileText ? JSON.parse(profileText) : {};
      } catch {
        throw new Error("The ambulance profile response was not valid JSON.");
      }

      try {
        assignmentData = assignmentText ? JSON.parse(assignmentText) : null;
      } catch {
        throw new Error("The ambulance assignment response was not valid JSON.");
      }

      if (!profileResponse.ok) {
        throw new Error(
          profileData?.detail ||
            `Unable to load ambulance profile (${profileResponse.status}).`
        );
      }

      if (!assignmentResponse.ok) {
        throw new Error(
          assignmentData?.detail ||
            `Unable to load ambulance assignment (${assignmentResponse.status}).`
        );
      }

      // The API returns only the authenticated driver's active dispatch.
      // A null response means there is currently no active assignment.
      const ordered = assignmentData && typeof assignmentData === "object"
        ? [{
            ...assignmentData,
            id: assignmentData.emergency_id,
            assigned_ambulance_id: assignmentData.ambulance_id,
            latitude: assignmentData.emergency_latitude,
            longitude: assignmentData.emergency_longitude,
            location_description: assignmentData.location_description,
            created_at: assignmentData.assigned_at,
            receiving_hospital_name: assignmentData.hospital_name,
            receiving_hospital_address: assignmentData.hospital_address,
          }]
        : [];

      setProfile(profileData);
      setIncidents(ordered);

      if (assignmentData?.status) {
        setStatus(normaliseStatus(assignmentData.status));
      } else if (profileData?.profile?.status) {
        setStatus(normaliseStatus(profileData.profile.status));
      }

      setLastSynced(new Date());

      if (manual) {
        setNotice("Operations data refreshed successfully.");
      }
    } catch (err) {
      console.error("LIFEGRID ambulance dashboard:", err);
      setError(err?.message || "Unable to load ambulance operations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAmbulanceRole) return undefined;

    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 10000);

    return () => window.clearInterval(timer);
  }, [isAmbulanceRole, load]);

  useEffect(() => {
    if (!isAmbulanceRole || !user?.id || !supabase) {
      setNetwork(false);
      return undefined;
    }

    const channel = supabase
      .channel(`lifegrid-ambulance-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "emergencies",
        },
        () => void load()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ambulances",
        },
        () => void load()
      )
      .subscribe((channelStatus) => {
        setNetwork(channelStatus === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAmbulanceRole, user?.id, load]);

  const assignments = useMemo(() => {
    const ambulanceId = Number(ambulance?.id);

    if (!ambulanceId) return [];

    return incidents.filter(
      (item) => Number(item.assigned_ambulance_id) === ambulanceId
    );
  }, [incidents, ambulance?.id]);

  useEffect(() => {
    if (!assignments.length) {
      setSelected(null);
      return;
    }

    setSelected((previous) => {
      if (
        previous &&
        assignments.some(
          (item) => Number(item.id) === Number(previous.id)
        )
      ) {
        return assignments.find(
          (item) => Number(item.id) === Number(previous.id)
        );
      }

      return assignments[0];
    });
  }, [assignments]);

  const active = selected || null;

  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assignments.filter((item) => {
      const matchesSearch =
        !query ||
        String(item.id).toLowerCase().includes(query) ||
        String(item.emergency_type || "").toLowerCase().includes(query) ||
        String(item.description || "").toLowerCase().includes(query) ||
        String(item.location_description || "").toLowerCase().includes(query);

      const incidentStatus = normaliseStatus(item.status);

      const matchesFilter =
        filter === "all" ||
        (filter === "active" &&
          ACTIVE_STATUSES.includes(incidentStatus)) ||
        (filter === "assigned" && incidentStatus === "assigned");

      return matchesSearch && matchesFilter;
    });
  }, [assignments, search, filter]);

  /*
   * Use real browser location only.
   * Tracking runs while available or during a response.
   * The backend remains responsible for ownership and authorization.
   */
  useEffect(() => {
    const ambulanceId = ambulance?.id;
    const currentStatus = normaliseStatus(status);

    const shouldTrack =
      isAmbulanceRole &&
      Boolean(ambulanceId) &&
      (currentStatus === "available" ||
        ACTIVE_STATUSES.includes(currentStatus));

    if (!shouldTrack) {
      setGpsState("STANDBY");
      setAccuracy(null);
      return undefined;
    }

    if (!navigator.geolocation) {
      setGpsState("UNAVAILABLE");
      return undefined;
    }

    let cancelled = false;
    let lastSentAt = 0;
    let lastPosition = null;

    const sendPosition = async (position) => {
      if (cancelled) return;

      lastPosition = position;
      const coords = position.coords;

      setAccuracy(
        Number.isFinite(coords.accuracy)
          ? Math.round(coords.accuracy)
          : null
      );

      if (Date.now() - lastSentAt < 5000) return;
      lastSentAt = Date.now();

      try {
        const response = await authenticatedFetch(
          `${API}/ambulances/my-location`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy_m: coords.accuracy ?? null,
              heading: coords.heading ?? null,
              speed: coords.speed ?? null,
              emergency_id: active?.id ?? null,
            }),
          }
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (!cancelled) {
            setGpsState("SYNC ERROR");
            console.error(
              "LIFEGRID location sync failed:",
              body?.detail || response.status
            );
          }
          return;
        }

        if (!cancelled) setGpsState("LIVE");
      } catch (err) {
        if (!cancelled) setGpsState("SYNC ERROR");
        console.error("LIFEGRID GPS synchronization failed:", err);
      }
    };

    setGpsState("REQUESTING GPS");

    const watchId = navigator.geolocation.watchPosition(
      sendPosition,
      (geoError) => {
        if (cancelled) return;

        if (geoError.code === geoError.PERMISSION_DENIED) {
          setGpsState("PERMISSION DENIED");
        } else if (geoError.code === geoError.TIMEOUT) {
          setGpsState("GPS TIMEOUT");
        } else {
          setGpsState("GPS ERROR");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      }
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      lastPosition = null;
    };
  }, [
    isAmbulanceRole,
    ambulance?.id,
    active?.id,
    status,
  ]);

  async function changeStatus(nextStatus) {
    if (!ambulance?.id || updatingStatus) return;

    const previousStatus = status;
    setUpdatingStatus(true);
    setError("");
    setNotice("");

    try {
      const response = await authenticatedFetch(
        `${API}/matching/my-assignment/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body?.detail ||
            `Unable to update vehicle status (${response.status}).`
        );
      }

      setStatus(nextStatus);
      setNotice(`Dispatch status updated to ${upper(nextStatus)}.`);
      await load();
    } catch (err) {
      setStatus(previousStatus);
      setError(err?.message || "Unable to update vehicle status.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (!isAmbulanceRole) return null;

  if (loading) {
    return (
      <main className="lgad-shell">
        <style>{styles}</style>
        <div className="lgad-loading">
          <div className="lgad-loading-mark">
            <Ambulance size={28} />
          </div>
          <div className="lgad-spinner" />
          <h1>Connecting to field operations</h1>
          <p>Verifying your ambulance profile and dispatch data.</p>
        </div>
      </main>
    );
  }

  const gpsIsLive = gpsState === "LIVE";
  const vehicleStatus = upper(status, "AVAILABLE");

  return (
    <main className="lgad-shell">
      <style>{styles}</style>

      <div className="lgad-container">
        <header className="lgad-header">
          <div className="lgad-brand">
            <div className="lgad-brand-mark">
              <Ambulance size={27} strokeWidth={1.8} />
            </div>

            <div className="lgad-brand-copy">
              <div className="lgad-brand-eyebrow">
                LIFEGRID <span> / </span> FIELD OPERATIONS
              </div>
              <h1>{ambulance.vehicle_number || "Ambulance unit"}</h1>
              <p>
                {ambulance.provider_name || "Emergency response team"}
                <span className="lgad-dot-separator">·</span>
                {user?.email || "Authenticated driver"}
              </p>
            </div>
          </div>

          <div className="lgad-header-actions">
            <div
              className={`lgad-connection ${
                network ? "connected" : "disconnected"
              }`}
            >
              {network ? <Wifi size={15} /> : <WifiOff size={15} />}
              <span>{network ? "Connected" : "Reconnecting"}</span>
            </div>

            <button
              type="button"
              className="lgad-button lgad-button-secondary"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              <RefreshCw
                size={16}
                className={refreshing ? "lgad-rotate" : ""}
              />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>

            <button
              type="button"
              className="lgad-button lgad-button-logout"
              onClick={() => void supabase.auth.signOut()}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </header>

        <div className="lgad-page-intro">
          <div>
            <div className="lgad-eyebrow">DRIVER WORKSPACE</div>
            <h2>Operations overview</h2>
            <p>
              Monitor your vehicle, review dispatch assignments, and update
              response progress.
            </p>
          </div>

          <div className="lgad-sync-meta">
            <span className={`lgad-live-dot ${network ? "pulse" : ""}`} />
            <div>
              <span>LAST DATA SYNC</span>
              <strong>{lastSynced ? fmt(lastSynced) : "Waiting for sync"}</strong>
            </div>
          </div>
        </div>

        {error && (
          <div className="lgad-alert lgad-alert-error" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>Operation needs attention</strong>
              <p>{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              aria-label="Retry loading operations"
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        )}

        {notice && !error && (
          <div className="lgad-alert lgad-alert-success" role="status">
            <CheckCircle2 size={18} />
            <p>{notice}</p>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              Dismiss
            </button>
          </div>
        )}

        <section className="lgad-stats" aria-label="Operations summary">
          <StatCard
            icon={Radio}
            label="VEHICLE STATUS"
            value={vehicleStatus}
            detail="Current unit state"
            tone={status === "available" ? "green" : "teal"}
          />
          <StatCard
            icon={Navigation}
            label="MY ASSIGNMENTS"
            value={assignments.length}
            detail="Incidents linked to this unit"
          />
          <StatCard
            icon={LocateFixed}
            label="GPS STATUS"
            value={gpsState}
            detail={
              accuracy !== null
                ? `Reported accuracy ±${accuracy} m`
                : "Waiting for location"
            }
            tone={gpsIsLive ? "green" : "amber"}
          />
          <StatCard
            icon={Gauge}
            label="VEHICLE CAPABILITY"
            value={upper(ambulance.ambulance_type, "STANDARD")}
            detail="Registered ambulance type"
          />
        </section>

        <section className="lgad-vehicle-grid">
          <article className="lgad-panel">
            <SectionHeading
              number="01"
              eyebrow="VEHICLE"
              title="Driver readiness"
              icon={ShieldCheck}
            />

            <div className="lgad-readiness-grid">
              <ReadinessItem
                label="Oxygen"
                ready={Boolean(ambulance.oxygen_available)}
              />
              <ReadinessItem
                label="Ventilator"
                ready={Boolean(ambulance.ventilator_available)}
              />
              <ReadinessItem
                label="Paramedic"
                ready={Boolean(ambulance.paramedic_available)}
              />
            </div>

            <div className="lgad-vehicle-foot">
              <div className="lgad-foot-icon">
                <Clock3 size={16} />
              </div>
              <div>
                <span>VEHICLE RECORD LAST UPDATED</span>
                <strong>{fmt(ambulance.last_updated)}</strong>
              </div>
              <ShieldCheck size={18} className="lgad-foot-check" />
            </div>
          </article>

          <article className="lgad-panel">
            <SectionHeading
              number="02"
              eyebrow="LOCATION"
              title="Field GPS"
              icon={MapPin}
            />

            <div
              className={`lgad-gps-banner ${
                gpsIsLive ? "gps-live" : "gps-waiting"
              }`}
            >
              <div className="lgad-gps-symbol">
                {gpsIsLive ? (
                  <LocateFixed size={21} />
                ) : (
                  <MapPin size={21} />
                )}
              </div>
              <div className="lgad-gps-copy">
                <span>LOCATION SERVICE</span>
                <strong>{gpsState}</strong>
              </div>
              <span className="lgad-gps-indicator">
                <i />
                {gpsIsLive ? "SYNCED" : "NOT LIVE"}
              </span>
            </div>

            <p className="lgad-panel-description">
              {gpsIsLive
                ? "A real device position was received and the location API accepted the update."
                : gpsState === "STANDBY"
                  ? "Location tracking is on standby until the unit is available or has an active response."
                  : gpsState === "PERMISSION DENIED"
                    ? "Location permission is blocked. Allow location access in your browser settings."
                    : "Waiting for a real GPS fix and confirmation from the location service."}
            </p>

            <div className="lgad-gps-note">
              <ShieldCheck size={15} />
              No simulated location or vehicle movement
            </div>
          </article>
        </section>

        <section className="lgad-dispatch-grid">
          <article className="lgad-panel lgad-assignment-panel">
            <SectionHeading
              number="03"
              eyebrow="DISPATCH"
              title="My assignments"
              trailing={
                <span className="lgad-count">
                  {assignments.length}
                  <small>total</small>
                </span>
              }
            />

            <div className="lgad-search">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search incident or description"
                aria-label="Search assignments"
              />
            </div>

            <div className="lgad-filters" aria-label="Filter assignments">
              {[
                ["all", "All"],
                ["active", "In progress"],
                ["assigned", "Assigned"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={filter === value ? "active" : ""}
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredAssignments.length ? (
              <div className="lgad-assignment-list">
                {filteredAssignments.map((item) => (
                  <AssignmentCard
                    key={item.id}
                    item={item}
                    selected={Number(selected?.id) === Number(item.id)}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={search || filter !== "all" ? Search : CheckCircle2}
                title={
                  search || filter !== "all"
                    ? "No matching assignments"
                    : "Unit available"
                }
                description={
                  search || filter !== "all"
                    ? "Try another search term or select a different filter."
                    : "No emergency is currently assigned to this ambulance."
                }
              />
            )}
          </article>

          <article className="lgad-panel lgad-response-panel">
            <SectionHeading
              number="04"
              eyebrow="RESPONSE"
              title="Driver response console"
              trailing={
                active ? (
                  <span className="lgad-incident-badge">
                    LG-{String(active.id).padStart(6, "0")}
                  </span>
                ) : null
              }
            />

            {!active ? (
              <EmptyState
                icon={Navigation}
                title="Waiting for dispatch"
                description="The response console will activate when a hospital dispatches an emergency to this ambulance."
              />
            ) : (
              <>
                <div className="lgad-incident-summary">
                  <div className="lgad-incident-summary-top">
                    <span className="lgad-eyebrow">ACTIVE INCIDENT</span>
                    <span className="lgad-incident-status">
                      <i />
                      {upper(active.status, "ASSIGNED")}
                    </span>
                  </div>

                  <h3>{upper(active.emergency_type, "EMERGENCY")}</h3>
                  <p>
                    {active.description ||
                      "No additional incident description was provided."}
                  </p>
                </div>

                <div className="lgad-detail-grid">
                  <div className="lgad-detail">
                    <div className="lgad-detail-icon">
                      <MapPin size={17} />
                    </div>
                    <div>
                      <span>INCIDENT LOCATION</span>
                      <strong>
                        {active.location_description ||
                          "Location details not supplied"}
                      </strong>
                    </div>
                  </div>

                  <div className="lgad-detail">
                    <div className="lgad-detail-icon">
                      <Users size={17} />
                    </div>
                    <div>
                      <span>PATIENT COUNT</span>
                      <strong>{active.patient_count ?? 1} patient(s)</strong>
                    </div>
                  </div>

                  <div className="lgad-detail">
                    <div className="lgad-detail-icon">
                      <Clock3 size={17} />
                    </div>
                    <div>
                      <span>REPORTED</span>
                      <strong>{fmt(active.created_at)}</strong>
                    </div>
                  </div>

                  <div className="lgad-detail">
                    <div className="lgad-detail-icon">
                      <Activity size={17} />
                    </div>
                    <div>
                      <span>SEVERITY</span>
                      <strong>{upper(active.severity, "NOT SPECIFIED")}</strong>
                    </div>
                  </div>
                </div>

                <div className="lgad-status-block">
                  <div className="lgad-status-heading">
                    <div>
                      <span className="lgad-eyebrow">RESPONSE WORKFLOW</span>
                      <h3>Update response status</h3>
                    </div>
                    {updatingStatus && (
                      <span className="lgad-saving">
                        <RefreshCw size={14} className="lgad-rotate" />
                        Saving
                      </span>
                    )}
                  </div>

                  <div className="lgad-status-options">
                    {STATUS_OPTIONS.map(([value, label], index) => {
                      const current = normaliseStatus(status);
                      const currentIndex = STATUS_OPTIONS.findIndex(
                        ([option]) => option === current
                      );
                      const isCurrent = current === value;
                      const isComplete =
                        currentIndex >= 0 && index < currentIndex;

                      return (
                        <button
                          type="button"
                          key={value}
                          disabled={updatingStatus || isCurrent}
                          className={[
                            "lgad-status-option",
                            isCurrent ? "current" : "",
                            isComplete ? "complete" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => void changeStatus(value)}
                        >
                          <span className="lgad-status-step">
                            {isComplete ? (
                              <CheckCircle2 size={16} />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <span>{label}</span>
                          {isCurrent && (
                            <span className="lgad-current-label">CURRENT</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <p className="lgad-status-help">
                    Status changes are sent to the LIFEGRID backend. If an
                    update fails, the previous status is retained.
                  </p>
                </div>

                <div className="lgad-driver-safety">
                  <ShieldCheck size={17} />
                  <p>
                    Follow authorized dispatch instructions and road-safety
                    procedures. LIFEGRID supports coordination and does not
                    replace clinical judgment or emergency command.
                  </p>
                </div>
              </>
            )}
          </article>
        </section>

        <footer className="lgad-footer">
          <div className="lgad-footer-brand">
            <Ambulance size={16} />
            LIFEGRID FIELD OPERATIONS
          </div>
          <span>Authenticated driver workspace</span>
          <span>
            {network ? <Wifi size={14} /> : <WifiOff size={14} />}
            {network ? "Realtime channel connected" : "Realtime channel reconnecting"}
          </span>
        </footer>
      </div>
    </main>
  );
}

const styles = `
.lgad-shell{
  --lgad-ink:#17352f;
  --lgad-muted:#71847f;
  --lgad-border:#e0e9e5;
  --lgad-green:#078b73;
  --lgad-green-dark:#086957;
  --lgad-green-pale:#e9f7f2;
  --lgad-page:#f4f7f6;
  min-height:100vh;
  background:var(--lgad-page);
  color:var(--lgad-ink);
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:14px;
  line-height:1.5;
  isolation:isolate;
}
.lgad-shell *{box-sizing:border-box}
.lgad-container{width:min(1480px,calc(100% - 48px));margin:0 auto;padding:25px 0 22px}
.lgad-header{
  display:flex;justify-content:space-between;align-items:center;gap:20px;
  padding:19px 22px;background:#fff;border:1px solid var(--lgad-border);
  border-radius:17px;box-shadow:0 3px 14px rgba(27,67,55,.035);
  animation:lgad-enter .42s ease both
}
.lgad-brand{display:flex;align-items:center;gap:15px;min-width:0}
.lgad-brand-mark{
  display:grid;place-items:center;flex:none;width:54px;height:54px;
  border-radius:15px;background:var(--lgad-green-pale);color:var(--lgad-green);
  border:1px solid #d3eee4
}
.lgad-brand-copy{min-width:0}
.lgad-brand-eyebrow,.lgad-eyebrow{
  display:flex;align-items:center;gap:7px;font-size:10px;font-weight:800;
  letter-spacing:.13em;color:#68857b;text-transform:uppercase
}
.lgad-brand-eyebrow span{color:#b0c3bc}
.lgad-brand-copy h1{font-size:24px;line-height:1.2;letter-spacing:-.035em;margin:5px 0;color:#15372f;font-weight:750}
.lgad-brand-copy p{margin:0;color:#7a8d86;font-size:12px;overflow-wrap:anywhere}
.lgad-dot-separator{padding:0 7px;color:#a3b4ad}
.lgad-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap}
.lgad-connection{display:flex;align-items:center;gap:7px;padding:8px 10px;font-size:11px;font-weight:750;border-radius:9px}
.lgad-connection.connected{background:#eaf8f1;color:#08775e}
.lgad-connection.disconnected{background:#fff5e8;color:#9a681c}
.lgad-button{
  min-height:39px;display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:0 13px;border:1px solid var(--lgad-border);border-radius:10px;
  background:#fff;color:#36584e;font:inherit;font-size:12px;font-weight:750;
  cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease;
}
.lgad-button:hover:not(:disabled){transform:translateY(-1px);background:#f7fbf9;border-color:#b9d7cb}
.lgad-button:disabled{opacity:.65;cursor:wait}
.lgad-button-logout{color:#a34a4a;border-color:#f0dddd}
.lgad-button-logout:hover:not(:disabled){background:#fff6f5;border-color:#e9c6c6}
.lgad-page-intro{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:29px 2px 19px}
.lgad-page-intro h2{font-size:27px;letter-spacing:-.04em;margin:4px 0;color:#193c33;font-weight:750}
.lgad-page-intro p{margin:0;color:#72867e;font-size:13px;max-width:620px}
.lgad-sync-meta{display:flex;align-items:center;gap:10px;padding:10px 13px;background:#fff;border:1px solid var(--lgad-border);border-radius:12px;flex:none}
.lgad-live-dot{width:9px;height:9px;border-radius:50%;background:#c8a05a;flex:none}
.lgad-live-dot.pulse{background:#18a67f;box-shadow:0 0 0 4px rgba(24,166,127,.10);animation:lgad-pulse 2.2s infinite}
.lgad-sync-meta div{display:grid;gap:2px}
.lgad-sync-meta span:not(.lgad-live-dot){font-size:9px;letter-spacing:.09em;color:#81948c;font-weight:800}
.lgad-sync-meta strong{font-size:11px;color:#34574b;font-weight:700}
.lgad-alert{display:flex;align-items:center;gap:11px;margin-bottom:14px;padding:13px 15px;border-radius:12px;font-size:12px;animation:lgad-enter .2s ease both}
.lgad-alert p{margin:2px 0 0}
.lgad-alert-error{background:#fff2f0;border:1px solid #f2d6d1;color:#a43e37}
.lgad-alert-success{background:#edf9f2;border:1px solid #d4eddf;color:#197653}
.lgad-alert>div{flex:1}
.lgad-alert>button{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:inherit;font:inherit;font-weight:750;cursor:pointer}
.lgad-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.lgad-stat{
  display:flex;align-items:center;gap:14px;min-width:0;padding:19px;
  border:1px solid var(--lgad-border);background:#fff;border-radius:15px;
  box-shadow:0 3px 12px rgba(27,67,55,.025);
  transition:transform .2s ease,box-shadow .2s ease;animation:lgad-enter .45s ease both
}
.lgad-stat:nth-child(2){animation-delay:.04s}.lgad-stat:nth-child(3){animation-delay:.08s}.lgad-stat:nth-child(4){animation-delay:.12s}
.lgad-stat:hover{transform:translateY(-2px);box-shadow:0 9px 22px rgba(27,67,55,.06)}
.lgad-stat-icon{width:45px;height:45px;display:grid;place-items:center;border-radius:12px;flex:none;background:#e9f7f2;color:#078b73}
.lgad-stat-green .lgad-stat-icon{background:#e8f8ee;color:#148357}
.lgad-stat-amber .lgad-stat-icon{background:#fff4e5;color:#ad7726}
.lgad-stat-copy{min-width:0;display:grid;gap:3px}
.lgad-stat-copy>span{font-size:9px;letter-spacing:.1em;color:#7b9087;font-weight:850}
.lgad-stat-copy strong{font-size:20px;line-height:1.3;letter-spacing:-.025em;color:#1c4338;overflow-wrap:anywhere}
.lgad-stat-copy small{font-size:11px;color:#879890;line-height:1.4}
.lgad-vehicle-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:15px}
.lgad-panel{min-width:0;padding:21px;background:#fff;border:1px solid var(--lgad-border);border-radius:16px;box-shadow:0 3px 12px rgba(27,67,55,.025);animation:lgad-enter .48s ease both}
.lgad-section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:19px}
.lgad-section-title{min-width:0}
.lgad-section-title h2{font-size:19px;line-height:1.3;letter-spacing:-.025em;margin:5px 0 0;color:#193c33;font-weight:750}
.lgad-eyebrow{font-size:9px;letter-spacing:.12em}
.lgad-eyebrow>span{color:#078b73}
.lgad-heading-icon{display:grid;place-items:center;width:38px;height:38px;flex:none;border-radius:11px;background:#eff8f4;color:#168b71}
.lgad-readiness-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.lgad-readiness-item{display:flex;align-items:center;gap:10px;min-width:0;padding:13px 11px;border:1px solid #e6eeea;background:#f9fbfa;border-radius:12px}
.lgad-readiness-indicator{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:10px;background:#edf1ef;color:#8d9b95;font-size:15px;font-weight:800}
.lgad-readiness-indicator.ready{background:#e4f6ec;color:#16865b}
.lgad-readiness-item>div:last-child{min-width:0;display:grid;gap:2px}
.lgad-readiness-item span{font-size:10px;color:#72867d;font-weight:650}
.lgad-readiness-item strong{font-size:11px;color:#35554a;font-weight:750;overflow-wrap:anywhere}
.lgad-vehicle-foot{display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid #edf1ef}
.lgad-foot-icon{width:33px;height:33px;display:grid;place-items:center;border-radius:10px;background:#f0f6f3;color:#628176;flex:none}
.lgad-vehicle-foot>div:nth-child(2){min-width:0;display:grid;gap:2px;flex:1}
.lgad-vehicle-foot span{font-size:9px;color:#81938b;font-weight:800;letter-spacing:.07em}
.lgad-vehicle-foot strong{font-size:11px;color:#3b5b50}
.lgad-foot-check{color:#168b71;flex:none}
.lgad-gps-banner{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e8eee9;border-radius:12px}
.lgad-gps-banner.gps-live{background:#effaf4;border-color:#d7eee1}
.lgad-gps-banner.gps-waiting{background:#fff9ef;border-color:#f3e7d1}
.lgad-gps-symbol{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;flex:none;background:#fff;color:#b17b2c}
.gps-live .lgad-gps-symbol{color:#16865b}
.lgad-gps-copy{display:grid;gap:2px;min-width:0;flex:1}
.lgad-gps-copy span{font-size:9px;letter-spacing:.1em;color:#7c8e85;font-weight:800}
.lgad-gps-copy strong{font-size:16px;color:#95681f;overflow-wrap:anywhere}
.gps-live .lgad-gps-copy strong{color:#167751}
.lgad-gps-indicator{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:850;color:#8d7b5d;flex:none}
.gps-live .lgad-gps-indicator{color:#167751}
.lgad-gps-indicator i{width:7px;height:7px;border-radius:50%;background:#d4a24d}
.gps-live .lgad-gps-indicator i{background:#1aa475;box-shadow:0 0 0 3px rgba(26,164,117,.12)}
.lgad-panel-description{font-size:12px;line-height:1.65;color:#758880;margin:14px 0}
.lgad-gps-note{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:650;color:#648378;padding-top:12px;border-top:1px solid #edf1ef}
.lgad-gps-note svg{color:#168b71;flex:none}
.lgad-dispatch-grid{display:grid;grid-template-columns:minmax(320px,.86fr) minmax(0,1.4fr);gap:15px;margin-top:15px;align-items:start}
.lgad-assignment-panel,.lgad-response-panel{min-height:410px}
.lgad-count{display:flex;align-items:center;gap:5px;padding:6px 9px;border-radius:9px;background:#eaf7f1;color:#08775f;font-size:16px;font-weight:850;flex:none}
.lgad-count small{font-size:9px;font-weight:750;color:#6d9284}
.lgad-search{display:flex;align-items:center;gap:9px;height:43px;padding:0 12px;border:1px solid #e0e9e4;border-radius:11px;color:#7a9388;background:#fbfcfb;transition:border-color .18s,box-shadow .18s}
.lgad-search:focus-within{border-color:#7dcbb0;box-shadow:0 0 0 3px rgba(7,139,115,.08)}
.lgad-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#24483c;font:inherit;font-size:12px}
.lgad-search input::placeholder{color:#9aa9a2}
.lgad-filters{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 13px}
.lgad-filters button{padding:7px 11px;border:1px solid #e1eae5;border-radius:8px;background:#fff;color:#73867e;font:inherit;font-size:10px;font-weight:750;cursor:pointer;transition:all .18s}
.lgad-filters button:hover{border-color:#9fcfba;color:#168269}
.lgad-filters button.active{background:#e8f7f0;border-color:#cfeadd;color:#08775f}
.lgad-assignment-list{display:grid;gap:10px;max-height:630px;overflow-y:auto;padding:1px 3px 2px 1px}
.lgad-assignment{
  width:100%;display:block;padding:14px;text-align:left;color:inherit;
  border:1px solid #e4ece7;border-radius:12px;background:#fff;cursor:pointer;
  transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;
}
.lgad-assignment:hover{transform:translateY(-1px);border-color:#b5d9c9;box-shadow:0 5px 15px rgba(28,84,63,.05)}
.lgad-assignment.is-selected{border-color:#55b999;background:#f5fbf8;box-shadow:0 0 0 2px rgba(7,139,115,.07)}
.lgad-assignment-top{display:flex;align-items:center;gap:10px;min-width:0}
.lgad-incident-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#fff0ed;color:#c75b4d;flex:none}
.lgad-assignment-heading{display:grid;gap:3px;min-width:0;flex:1}
.lgad-assignment-heading>span{font-size:9px;font-weight:800;letter-spacing:.06em;color:#7e9288}
.lgad-assignment-heading>strong{font-size:12px;color:#23483b;overflow-wrap:anywhere}
.lgad-severity{font-size:8px;font-weight:850;letter-spacing:.04em;padding:5px 7px;border-radius:6px;background:#f0f4f2;color:#71867b;flex:none}
.lgad-severity.severity-high{background:#fff0ed;color:#b74d40}
.lgad-assignment-description{font-size:11px;line-height:1.6;color:#72867d;margin:12px 0;overflow-wrap:anywhere}
.lgad-assignment-meta{display:flex;gap:13px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid #eaf0ec}
.lgad-assignment-meta span{display:flex;align-items:center;gap:5px;color:#7c9187;font-size:10px}
.lgad-assignment-bottom{display:flex;justify-content:space-between;align-items:center;gap:8px;padding-top:10px}
.lgad-incident-state{display:flex;align-items:center;gap:6px;color:#628276;font-size:9px;font-weight:800}
.lgad-incident-state i,.lgad-incident-status i{width:7px;height:7px;border-radius:50%;background:#d5a44f;flex:none}
.lgad-view-incident{display:flex;align-items:center;gap:4px;color:#078b73;font-size:10px;font-weight:800}
.lgad-response-panel{padding-bottom:19px}
.lgad-incident-badge{font-size:10px;letter-spacing:.04em;font-weight:850;color:#08775f;background:#e9f7f1;border:1px solid #d7eee3;padding:8px 10px;border-radius:8px;flex:none}
.lgad-incident-summary{padding:17px;border-radius:13px;background:linear-gradient(120deg,#f0faf5 0%,#f8fbf9 100%);border:1px solid #e0f0e7}
.lgad-incident-summary-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.lgad-incident-status{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:7px;background:#fff;border:1px solid #e1eee6;color:#52796a;font-size:9px;font-weight:800}
.lgad-incident-summary h3{font-size:22px;line-height:1.25;letter-spacing:-.025em;color:#1a4738;margin:12px 0 7px;overflow-wrap:anywhere}
.lgad-incident-summary p{font-size:12px;line-height:1.65;color:#6e8579;margin:0;overflow-wrap:anywhere}
.lgad-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.lgad-detail{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid #e7eeea;border-radius:11px;min-width:0}
.lgad-detail-icon{display:grid;place-items:center;width:33px;height:33px;border-radius:9px;background:#eff7f3;color:#288b70;flex:none}
.lgad-detail>div:last-child{min-width:0;display:grid;gap:4px}
.lgad-detail span{font-size:9px;font-weight:800;letter-spacing:.05em;color:#7e9288}
.lgad-detail strong{font-size:11px;line-height:1.5;color:#35574a;overflow-wrap:anywhere}
.lgad-status-block{margin-top:20px}
.lgad-status-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.lgad-status-heading h3{font-size:15px;color:#24483b;margin:4px 0 0}
.lgad-saving{display:flex;align-items:center;gap:6px;font-size:10px;color:#148267;font-weight:750}
.lgad-status-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.lgad-status-option{
  display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:9px;
  position:relative;min-width:0;min-height:94px;padding:11px 10px;border:1px solid #e2eae5;
  border-radius:11px;background:#fff;color:#6c8177;text-align:left;font:inherit;
  font-size:10px;font-weight:750;cursor:pointer;transition:all .18s ease
}
.lgad-status-option:hover:not(:disabled){border-color:#9bd2bc;background:#f8fcfa}
.lgad-status-option:disabled{cursor:default}
.lgad-status-step{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:#f0f4f2;color:#82948b;font-size:11px;font-weight:850}
.lgad-status-option.current{border-color:#61bd9c;background:#effaf4;color:#08775f;box-shadow:0 0 0 2px rgba(7,139,115,.055)}
.lgad-status-option.current .lgad-status-step,.lgad-status-option.complete .lgad-status-step{background:#d7f2e4;color:#08775f}
.lgad-status-option.complete{color:#40836a;border-color:#d8ece1}
.lgad-current-label{font-size:8px;letter-spacing:.04em;color:#168267}
.lgad-status-help{font-size:10px;line-height:1.6;color:#82938a;margin:11px 0 0}
.lgad-driver-safety{display:flex;align-items:flex-start;gap:9px;padding:12px;margin-top:17px;background:#f7f9f8;border:1px solid #e8eeeb;border-radius:10px}
.lgad-driver-safety svg{color:#648b7b;flex:none;margin-top:1px}
.lgad-driver-safety p{font-size:10px;line-height:1.65;color:#71857b;margin:0}
.lgad-empty{display:flex;align-items:center;flex-direction:column;justify-content:center;min-height:250px;padding:24px 15px;text-align:center}
.lgad-empty-icon{display:grid;place-items:center;width:58px;height:58px;border-radius:17px;background:#eff7f3;color:#278c70;margin-bottom:13px}
.lgad-empty h3{font-size:15px;color:#35574a;margin:0 0 6px}
.lgad-empty p{font-size:11px;line-height:1.7;color:#809188;max-width:310px;margin:0}
.lgad-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:18px 3px 0;color:#84968d;font-size:10px}
.lgad-footer>span:last-child{display:flex;align-items:center;gap:6px}
.lgad-footer-brand{display:flex;align-items:center;gap:7px;color:#537a6a;font-size:10px;font-weight:850;letter-spacing:.07em}
.lgad-loading{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:25px;text-align:center;background:#f4f7f6}
.lgad-loading-mark{display:grid;place-items:center;width:60px;height:60px;border-radius:18px;background:#e3f5ed;color:#078b73;margin-bottom:20px}
.lgad-spinner{width:28px;height:28px;border:3px solid #dcece5;border-top-color:#078b73;border-radius:50%;animation:lgad-spin .8s linear infinite}
.lgad-loading h1{font-size:21px;color:#24483b;margin:17px 0 5px}
.lgad-loading p{font-size:12px;color:#809188;margin:0}
.lgad-rotate{animation:lgad-spin .9s linear infinite}
@keyframes lgad-spin{to{transform:rotate(360deg)}}
@keyframes lgad-enter{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
@keyframes lgad-pulse{0%,100%{box-shadow:0 0 0 4px rgba(24,166,127,.10)}50%{box-shadow:0 0 0 7px rgba(24,166,127,.025)}}
@media(prefers-reduced-motion:reduce){
  .lgad-shell *, .lgad-shell *::before, .lgad-shell *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}
}
@media(min-width:1500px){
  .lgad-container{padding-top:30px}
  .lgad-panel{padding:24px}
  .lgad-stat{padding:21px}
}
@media(max-width:1100px){
  .lgad-container{width:calc(100% - 32px)}
  .lgad-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lgad-dispatch-grid{grid-template-columns:minmax(0,.9fr) minmax(0,1.2fr)}
  .lgad-readiness-grid{grid-template-columns:1fr}
  .lgad-readiness-item{padding:10px}
}
@media(max-width:850px){
  .lgad-header{align-items:flex-start;flex-direction:column}
  .lgad-header-actions{justify-content:flex-start;width:100%}
  .lgad-vehicle-grid,.lgad-dispatch-grid{grid-template-columns:1fr}
  .lgad-readiness-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lgad-assignment-list{max-height:460px}
  .lgad-page-intro{align-items:flex-start;flex-direction:column}
}
@media(max-width:560px){
  .lgad-container{width:calc(100% - 22px);padding:11px 0 18px}
  .lgad-header{padding:15px;border-radius:14px}
  .lgad-brand{align-items:flex-start;gap:11px}
  .lgad-brand-mark{width:43px;height:43px;border-radius:12px}
  .lgad-brand-copy h1{font-size:20px}
  .lgad-brand-copy p{font-size:11px;line-height:1.7}
  .lgad-brand-eyebrow{font-size:8px}
  .lgad-header-actions{gap:7px}
  .lgad-connection{padding:7px;font-size:10px}
  .lgad-button{min-height:36px;padding:0 9px;font-size:10px}
  .lgad-page-intro{padding:22px 2px 15px}
  .lgad-page-intro h2{font-size:23px}
  .lgad-page-intro p{font-size:12px;line-height:1.6}
  .lgad-sync-meta{width:100%}
  .lgad-stats{gap:9px}
  .lgad-stat{padding:12px;gap:9px;border-radius:12px;align-items:flex-start}
  .lgad-stat-icon{width:34px;height:34px;border-radius:9px}
  .lgad-stat-icon svg{width:18px;height:18px}
  .lgad-stat-copy>span{font-size:8px;letter-spacing:.05em}
  .lgad-stat-copy strong{font-size:16px}
  .lgad-stat-copy small{font-size:10px}
  .lgad-vehicle-grid,.lgad-dispatch-grid{gap:10px;margin-top:10px}
  .lgad-panel{padding:15px;border-radius:13px}
  .lgad-section-heading{margin-bottom:15px}
  .lgad-section-title h2{font-size:17px}
  .lgad-readiness-grid{grid-template-columns:1fr;gap:8px}
  .lgad-readiness-item{padding:10px}
  .lgad-gps-banner{padding:10px;gap:8px}
  .lgad-gps-symbol{width:35px;height:35px}
  .lgad-gps-copy strong{font-size:13px}
  .lgad-gps-indicator{font-size:8px}
  .lgad-detail-grid{grid-template-columns:1fr}
  .lgad-status-options{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lgad-status-option{min-height:83px}
  .lgad-incident-summary{padding:13px}
  .lgad-incident-summary h3{font-size:19px}
  .lgad-footer{align-items:flex-start;flex-direction:column;gap:9px}
}
`;

