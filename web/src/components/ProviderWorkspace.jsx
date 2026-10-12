import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Ambulance,
  CheckCircle2,
  Clock3,
  Crosshair,
  Gauge,
  LogOut,
  MapPin,
  Radio,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";

import { authenticatedFetch, supabase } from "../auth/supabase";
import { useAuth } from "../auth/AuthContext";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api";

const ACTIVE_STATUSES = new Set([
  "available",
  "assigned",
  "en_route",
  "arrived",
  "transporting",
  "busy",
]);

const STATUS_OPTIONS = [
  { value: "offline", label: "OFFLINE" },
  { value: "available", label: "AVAILABLE" },
  { value: "assigned", label: "ASSIGNED" },
  { value: "en_route", label: "EN ROUTE" },
  { value: "arrived", label: "ARRIVED" },
  { value: "transporting", label: "TRANSPORTING" },
  { value: "busy", label: "BUSY" },
];

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pretty(value) {
  return String(value || "—").replaceAll("_", " ");
}

function StatusBadge({ children, good = true }) {
  return (
    <span className={`pws-status ${good ? "good" : "bad"}`}>
      <span />
      {children}
    </span>
  );
}

function Metric({ icon: Icon, label, value, detail }) {
  return (
    <div className="pws-metric">
      <div className="pws-metric-icon">
        <Icon size={18} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="pws-field">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

export default function ProviderWorkspace() {
  const { role, profile, signOut } = useAuth();

  if (role !== "ambulance") {
    return null;
  }

  return <AmbulanceWorkspace initialProfile={profile} onSignOut={signOut} />;
}

function AmbulanceWorkspace({ initialProfile, onSignOut }) {
  const [profile, setProfile] = useState(initialProfile?.profile || null);
  const [loading, setLoading] = useState(!initialProfile?.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [gpsConnected, setGpsConnected] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const watchIdRef = useRef(null);
  const latestPositionRef = useRef(null);

  const status = String(profile?.status || "offline").toLowerCase();
  const active = ACTIVE_STATUSES.has(status);

  const loadProfile = async (silent = false) => {
    if (!silent) setRefreshing(true);

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/ambulances/my-profile`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Profile request failed (${response.status})`);
      }

      const data = await response.json();
      setProfile(data?.profile || null);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load ambulance profile.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const sendLocation = async (position) => {
    if (!position?.coords) return;

    const latitude = Number(position.coords.latitude);
    const longitude = Number(position.coords.longitude);
    const accuracy = Number(position.coords.accuracy);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    latestPositionRef.current = { latitude, longitude, accuracy };

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/ambulances/my-location`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude,
            longitude,
            accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `GPS update failed (${response.status})`);
      }

      const data = await response.json();
      setProfile(data?.ambulance || profile);
      setGpsConnected(true);
      setGpsError("");
    } catch (err) {
      setGpsError(err?.message || "Unable to publish GPS position.");
    }
  };

  useEffect(() => {
    loadProfile();

    const timer = window.setInterval(() => {
      loadProfile(true);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("lifegrid-ambulance-self")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ambulances",
        },
        (payload) => {
          const changed = payload?.new;
          if (!changed || String(changed.id) !== String(profile?.id)) return;
          setProfile((current) => ({ ...(current || {}), ...changed }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!active) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      setGpsConnected(false);
      return undefined;
    }

    if (!navigator.geolocation) {
      setGpsError("This device does not provide browser GPS.");
      return undefined;
    }

    setGpsError("");

    const onSuccess = (position) => {
      setGpsConnected(true);
      sendLocation(position);
    };

    const onError = (geoError) => {
      setGpsConnected(false);
      setGpsError(
        geoError?.message ||
          "GPS permission was denied or the device location is unavailable."
      );
    };

    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [active, profile?.id]);

  const changeStatus = async (nextStatus) => {
    setSavingStatus(true);
    setMessage("");
    setError("");

    try {
      if (ACTIVE_STATUSES.has(nextStatus)) {
        const position = latestPositionRef.current;
        if (!position) {
          throw new Error(
            "Allow GPS first. LIFEGRID requires a real device position before this ambulance becomes active."
          );
        }
      }

      const response = await authenticatedFetch(
        `${API_BASE_URL}/ambulances/my-status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Status update failed (${response.status})`);
      }

      const data = JSON.parse(text);
      setProfile(data?.ambulance || profile);
      setMessage(`Ambulance status changed to ${pretty(nextStatus).toUpperCase()}.`);
    } catch (err) {
      setError(err?.message || "Unable to change ambulance status.");
    } finally {
      setSavingStatus(false);
    }
  };

  const gpsLabel = useMemo(() => {
    if (!active) return "GPS STANDBY";
    if (gpsConnected) return "GPS LIVE";
    return "GPS WAITING";
  }, [active, gpsConnected]);

  if (loading) {
    return (
      <div className="ops-page">
        <section className="ops-card">
          <RefreshCw className="spin" size={22} />
          Loading authenticated ambulance profile…
        </section>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="ops-page">
        <section className="ops-card">
          <XCircle size={24} />
          <h2>AMBULANCE NOT LINKED</h2>
          <p>
            This approved provider account does not have an ambulance vehicle
            linked to it yet. A coordinator must complete the provider linkage.
          </p>
          <button className="ops-button" onClick={() => loadProfile()}>
            <RefreshCw size={16} /> RETRY
          </button>
        </section>
      </div>
    );
  }

  const lat = Number(profile.latitude);
  const lng = Number(profile.longitude);
  const accuracy = Number(profile.gps_accuracy_m);

  return (
    <div className="ops-page ambulance-page">
      <div className="ops-hero">
        <div>
          <span>LIFEGRID · FIELD RESPONSE · LIVE GPS</span>
          <h2>{profile.vehicle_number || "AMBULANCE UNIT"}</h2>
          <p>
            {profile.provider_name || "Registered provider"} · {pretty(profile.ambulance_type)}
          </p>
        </div>
        <StatusBadge good={active}>
          {active ? "CONNECTED TO RESPONSE NETWORK" : "STANDBY"}
        </StatusBadge>
      </div>

      <div className="critical-grid">
        <Metric
          icon={Radio}
          label="STATUS"
          value={pretty(status).toUpperCase()}
          detail={active ? "LIVE RESPONSE STATE" : "NOT DISPATCHABLE"}
        />
        <Metric
          icon={MapPin}
          label="LATITUDE"
          value={Number.isFinite(lat) ? lat.toFixed(6) : "—"}
          detail="DEVICE GPS"
        />
        <Metric
          icon={MapPin}
          label="LONGITUDE"
          value={Number.isFinite(lng) ? lng.toFixed(6) : "—"}
          detail="DEVICE GPS"
        />
        <Metric
          icon={Gauge}
          label="ACCURACY"
          value={Number.isFinite(accuracy) ? `${Math.round(accuracy)} m` : "—"}
          detail="LAST DEVICE REPORT"
        />
      </div>

      <section className="ops-card">
        <div className="ops-card-head">
          <div>
            <span>FIELD CONTROL</span>
            <h3>Ambulance availability</h3>
          </div>
          <Ambulance size={22} />
        </div>

        <div className="status-control-grid">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`status-control ${status === option.value ? "selected" : ""}`}
              disabled={savingStatus}
              onClick={() => changeStatus(option.value)}
            >
              {status === option.value ? <CheckCircle2 size={16} /> : <Radio size={16} />}
              {option.label}
            </button>
          ))}
        </div>

        <div className="gps-banner">
          {gpsConnected ? <Wifi size={17} /> : <WifiOff size={17} />}
          <div>
            <strong>{gpsLabel}</strong>
            <span>
              {active
                ? "The authenticated device is publishing its actual GPS position to LIFEGRID."
                : "Set the unit to an active status to begin live GPS tracking."}
            </span>
          </div>
        </div>

        {gpsError && <div className="ops-error">{gpsError}</div>}
        {error && <div className="ops-error">{error}</div>}
        {message && <div className="ops-success">{message}</div>}

        <div className="ops-actions">
          <button className="ops-button" onClick={() => loadProfile()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            REFRESH
          </button>
          <button className="ops-button danger" onClick={onSignOut}>
            <LogOut size={16} />
            SIGN OUT
          </button>
        </div>
      </section>

      <div className="pws-grid">
        <section className="ops-card">
          <div className="ops-card-head">
            <div>
              <span>FIELD UNIT</span>
              <h3>Verified capabilities</h3>
            </div>
            <ShieldCheck size={22} />
          </div>
          <div className="facility-details">
            <Field label="OXYGEN" value={profile.oxygen_available ? "AVAILABLE" : "NOT AVAILABLE"} />
            <Field
              label="VENTILATOR"
              value={profile.ventilator_available ? "AVAILABLE" : "NOT AVAILABLE"}
            />
            <Field
              label="PARAMEDIC"
              value={profile.paramedic_available ? "AVAILABLE" : "NOT AVAILABLE"}
            />
            <Field label="VERIFICATION" value={pretty(profile.verification_status).toUpperCase()} />
          </div>
        </section>

        <section className="ops-card">
          <div className="ops-card-head">
            <div>
              <span>LOCATION PROVENANCE</span>
              <h3>GPS audit state</h3>
            </div>
            <Crosshair size={22} />
          </div>
          <div className="facility-details">
            <Field label="SOURCE" value={pretty(profile.gps_source)} />
            <Field
              label="LOCATION UPDATED"
              value={
                profile.location_updated_at
                  ? new Date(profile.location_updated_at).toLocaleString()
                  : "—"
              }
            />
            <Field
              label="PROFILE UPDATED"
              value={
                profile.last_updated
                  ? new Date(profile.last_updated).toLocaleString()
                  : "—"
              }
            />
            <Field
              label="NETWORK STATE"
              value={active ? "DISPATCHABLE" : "NOT DISPATCHABLE"}
            />
          </div>
          <p className="ops-note">
            <Clock3 size={14} /> LIFEGRID does not generate simulated ambulance movement.
            The position shown here must originate from the authenticated provider device.
          </p>
        </section>
      </div>
    </div>
  );
}
