import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch, supabase } from "../auth/supabase";
import { useAuth } from "../auth/AuthContext";
import { motion } from "framer-motion";
import {
  Activity,
  Ambulance,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  Gauge,
  MapPin,
  Navigation,
  Radio,
  ShieldAlert,
  Siren,
  TimerReset,
  Wifi,
  Wind,
  XCircle,
  Zap,
} from "lucide-react";

const STATUS_STEPS = [
  {
    key: "assigned",
    label: "ASSIGNED",
    title: "Unit assigned",
    description: "LIFEGRID has linked this ambulance to the incident.",
    icon: Ambulance,
  },
  {
    key: "en_route",
    label: "EN ROUTE",
    title: "Travelling to incident",
    description: "Crew is moving toward the emergency location.",
    icon: Navigation,
  },
  {
    key: "arrived",
    label: "ARRIVED",
    title: "At incident",
    description: "Ambulance has reached the reported incident point.",
    icon: MapPin,
  },
  {
    key: "transporting",
    label: "TRANSPORTING",
    title: "Patient transport",
    description: "Crew is transporting the patient toward the receiving facility.",
    icon: Siren,
  },
  {
    key: "hospital",
    label: "AT HOSPITAL",
    title: "Destination reached",
    description: "Ambulance has reached the coordinated receiving facility.",
    icon: CheckCircle2,
  },
];

const STATUS_ORDER = STATUS_STEPS.map((step) => step.key);

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatEta(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) {
    return "—";
  }

  const value = Math.max(0, Math.round(Number(minutes)));

  if (value < 1) {
    return "<1 min";
  }

  return `${value} min`;
}

function StatusPill({ children, active = false, danger = false }) {
  return (
    <span
      className={`lg-ambulance-pill ${
        active ? "active" : ""
      } ${danger ? "danger" : ""}`}
    >
      <span className="lg-ambulance-pill-dot" />
      {children}
    </span>
  );
}

function Metric({ icon: Icon, label, value, detail, tone = "" }) {
  return (
    <div className={`lg-ambulance-metric ${tone}`}>
      <div className="lg-ambulance-metric-icon">
        <Icon size={19} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export default function AmbulanceDashboard({
  emergency,
  ambulance,
  hospital,
  resources = [],
  responseStatus = "assigned",
  onResponseChange,
}) {
  const [status, setStatus] = useState(responseStatus || ambulance?.status || "assigned");
  const [lastActionAt, setLastActionAt] = useState(Date.now());
  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");
  const [eventCount, setEventCount] = useState(0);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [gpsStatus, setGpsStatus] = useState("OFF");
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const { role } = useAuth();

  useEffect(() => {
    setStatus(responseStatus || ambulance?.status || "assigned");
  }, [responseStatus, ambulance?.status]);

  useEffect(() => {
    const ambulanceId = ambulance?.id ?? ambulance?.ambulance_id;
    const shouldTrack =
      role === "ambulance" &&
      ambulanceId &&
      ["assigned", "en_route", "arrived", "transporting"].includes(
        String(responseStatus || ambulance?.status || "assigned").toLowerCase()
      );

    if (!shouldTrack) {
      setGpsStatus(role === "ambulance" ? "STANDBY" : "OFF");
      setGpsAccuracy(null);
      return undefined;
    }

    if (!navigator.geolocation) {
      setGpsStatus("UNAVAILABLE");
      return undefined;
    }

    let cancelled = false;
    let watchId = null;
    let lastSentAt = 0;
    let pendingPosition = null;
    let sendTimer = null;

    const sendPosition = async (position) => {
      if (cancelled || !position) return;

      const now = Date.now();
      if (now - lastSentAt < 5000) {
        pendingPosition = position;
        if (!sendTimer) {
          sendTimer = window.setTimeout(() => {
            sendTimer = null;
            const next = pendingPosition;
            pendingPosition = null;
            sendPosition(next);
          }, Math.max(250, 5000 - (now - lastSentAt)));
        }
        return;
      }

      lastSentAt = now;
      const coords = position.coords;
      setGpsAccuracy(
        Number.isFinite(Number(coords.accuracy))
          ? Math.round(Number(coords.accuracy))
          : null
      );

      try {
        const response = await authenticatedFetch(
          `${API_BASE_URL}/ambulances/my-location`,
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
              emergency_id:
                emergency?.id ?? emergency?.emergency_id ?? null,
            }),
          }
        );

        if (!response.ok) {
          setGpsStatus("SYNC ERROR");
          return;
        }

        if (!cancelled) {
          setGpsStatus("LIVE");
          setLastActionAt(Date.now());
        }
      } catch {
        if (!cancelled) setGpsStatus("SYNC ERROR");
      }
    };

    const handleSuccess = (position) => {
      setGpsStatus("LOCATING");
      void sendPosition(position);
    };

    const handleError = (error) => {
      if (cancelled) return;
      if (error?.code === 1) setGpsStatus("PERMISSION");
      else setGpsStatus("GPS ERROR");
    };

    setGpsStatus("REQUESTING");
    watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    );

    return () => {
      cancelled = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (sendTimer) window.clearTimeout(sendTimer);
    };
  }, [
    ambulance?.id,
    ambulance?.ambulance_id,
    ambulance?.status,
    emergency?.id,
    emergency?.emergency_id,
    responseStatus,
    role,
  ]);

  useEffect(() => {
    const ambulanceId = ambulance?.id ?? ambulance?.ambulance_id;
    if (!ambulanceId) {
      setRealtimeStatus("NO UNIT");
      return undefined;
    }

    let cancelled = false;
    let channel;
    let refreshTimer;

    const refreshUnit = async () => {
      try {
        const response = await authenticatedFetch(
          `${API_BASE_URL}/ambulances`,
          { cache: "no-store", headers: { Accept: "application/json" } }
        );
        if (!response.ok) return;
        const rows = await response.json();
        const unit = Array.isArray(rows)
          ? rows.find((item) => Number(item.id) === Number(ambulanceId))
          : null;
        if (!cancelled && unit?.status) {
          setStatus(unit.status);
          setLastActionAt(Date.now());
        }
      } catch {
        // Realtime remains authoritative when the optional refresh is unavailable.
      }
    };

    channel = supabase
      .channel(`lifegrid-ambulance-${ambulanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ambulances", filter: `id=eq.${ambulanceId}` },
        () => {
          setEventCount((value) => value + 1);
          window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(refreshUnit, 120);
        }
      )
      .subscribe((subscriptionStatus) => {
        if (cancelled) return;
        if (subscriptionStatus === "SUBSCRIBED") setRealtimeStatus("LIVE");
        else if (subscriptionStatus === "CHANNEL_ERROR") setRealtimeStatus("FALLBACK");
        else if (subscriptionStatus === "TIMED_OUT") setRealtimeStatus("TIMEOUT");
        else setRealtimeStatus(subscriptionStatus || "CONNECTING");
      });

    refreshUnit();

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [ambulance?.id, ambulance?.ambulance_id]);

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    "/api";

  const emergencyData = emergency || {};
  const ambulanceData = ambulance || {};
  const hospitalData = hospital || {};

  const severity =
    emergencyData?.severity ||
    emergencyData?.analysis?.severity ||
    "critical";

  const severityScore = normalizeNumber(
    emergencyData?.severity_score ??
      emergencyData?.analysis?.severity_score,
    90
  );

  const patientCount = normalizeNumber(
    emergencyData?.patient_count ??
      emergencyData?.analysis?.patient_count,
    1
  );

  const emergencyLat = normalizeNumber(
    emergencyData?.latitude,
    27.6
  );

  const emergencyLng = normalizeNumber(
    emergencyData?.longitude,
    78.055
  );

  const ambulanceLat = normalizeNumber(
    ambulanceData?.latitude,
    27.603
  );

  const ambulanceLng = normalizeNumber(
    ambulanceData?.longitude,
    78.052
  );

  const distanceApprox = useMemo(() => {
    const latDelta = (ambulanceLat - emergencyLat) * 111;
    const lngDelta =
      (ambulanceLng - emergencyLng) *
      111 *
      Math.cos((emergencyLat * Math.PI) / 180);

    return Math.sqrt(
      latDelta * latDelta +
        lngDelta * lngDelta
    );
  }, [
    ambulanceLat,
    ambulanceLng,
    emergencyLat,
    emergencyLng,
  ]);

  const routeEta = useMemo(() => {
    if (status === "arrived") {
      return 0;
    }

    if (
      status === "transporting" ||
      status === "hospital"
    ) {
      return 4;
    }

    return Math.max(
      2,
      Math.round(distanceApprox * 3)
    );
  }, [distanceApprox, status]);

  const currentIndex = Math.max(
    0,
    STATUS_ORDER.indexOf(status)
  );

  const changeStatus = async (nextStatus) => {
    const ambulanceId = ambulanceData?.id ?? ambulanceData?.ambulance_id;
    if (!ambulanceId || statusBusy) return;

    setStatusBusy(true);
    setStatusError("");

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/ambulances/my-status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

      if (!response.ok) {
        throw new Error(data?.detail || text || `Status update failed (${response.status}).`);
      }

      const savedStatus = data?.status || data?.ambulance?.status || nextStatus;
      setStatus(savedStatus);
      setLastActionAt(Date.now());
      onResponseChange?.(savedStatus);
    } catch (error) {
      console.error("Ambulance status error:", error);
      setStatusError(error?.message || "Could not save ambulance status.");
    } finally {
      setStatusBusy(false);
    }
  };

  const nextStep =
    STATUS_STEPS[
      Math.min(
        currentIndex + 1,
        STATUS_STEPS.length - 1
      )
    ];

  const canAdvance =
    currentIndex < STATUS_STEPS.length - 1;

  const statusTime = new Date(lastActionAt).toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );

  return (
    <section className="lg-ambulance-dashboard">
      <style>{`
        .lg-ambulance-dashboard {
          position: relative;
          width: min(100%, 1660px);
          margin: 34px auto 0;
          padding: 28px;
          border: 1px solid rgba(84, 201, 255, 0.20);
          border-radius: 28px;
          overflow: hidden;
          background:
            radial-gradient(circle at 88% 4%, rgba(0, 220, 180, 0.08), transparent 25%),
            radial-gradient(circle at 4% 14%, rgba(84, 201, 255, 0.08), transparent 26%),
            linear-gradient(145deg, rgba(5, 20, 48, 0.98), rgba(2, 10, 27, 0.98));
          box-shadow:
            0 30px 90px rgba(0, 0, 0, 0.28),
            inset 0 1px 0 rgba(255,255,255,0.03);
          color: #e9f4ff;
        }

        .lg-ambulance-dashboard::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .35;
          background-image:
            linear-gradient(rgba(84,201,255,.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(84,201,255,.035) 1px, transparent 1px);
          background-size: 38px 38px;
        }

        .lg-ambulance-content {
          position: relative;
          z-index: 1;
        }

        .lg-ambulance-header {
          display: flex;
          justify-content: space-between;
          gap: 22px;
          align-items: flex-start;
          margin-bottom: 22px;
        }

        .lg-ambulance-title-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .lg-ambulance-logo {
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          color: #54c9ff;
          background: rgba(84, 201, 255, .10);
          border: 1px solid rgba(84, 201, 255, .24);
          box-shadow: 0 0 30px rgba(84, 201, 255, .08);
        }

        .lg-ambulance-eyebrow {
          display: block;
          margin-bottom: 4px;
          color: #6e9ac1;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .18em;
        }

        .lg-ambulance-title {
          margin: 0;
          font-size: clamp(25px, 3vw, 38px);
          line-height: 1;
          letter-spacing: -.035em;
        }

        .lg-ambulance-subtitle {
          margin: 8px 0 0;
          color: #7899b9;
          font-size: 13px;
        }

        .lg-ambulance-header-actions {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .lg-ambulance-network {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 13px;
          border-radius: 12px;
          border: 1px solid rgba(0, 255, 190, .18);
          background: rgba(0, 255, 190, .045);
          color: #62e9bd;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .12em;
        }

        .lg-ambulance-network-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #42e7ad;
          box-shadow: 0 0 13px #42e7ad;
          animation: lgAmbPulse 1.6s infinite;
        }

        .lg-ambulance-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 12px;
          border-radius: 999px;
          border: 1px solid rgba(84, 201, 255, .17);
          background: rgba(84, 201, 255, .05);
          color: #84b4da;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .12em;
        }

        .lg-ambulance-pill.active {
          color: #65efc0;
          border-color: rgba(101,239,192,.24);
          background: rgba(101,239,192,.06);
        }

        .lg-ambulance-pill.danger {
          color: #ff7784;
          border-color: rgba(255,89,104,.26);
          background: rgba(255,89,104,.06);
        }

        .lg-ambulance-pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 10px currentColor;
        }

        .lg-ambulance-alert {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 15px 17px;
          margin-bottom: 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 89, 104, .22);
          background: linear-gradient(
            90deg,
            rgba(255,89,104,.10),
            rgba(84,201,255,.035)
          );
        }

        .lg-ambulance-alert-main {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .lg-ambulance-alert-icon {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #ff6877;
          background: rgba(255,89,104,.10);
        }

        .lg-ambulance-alert strong,
        .lg-ambulance-alert span {
          display: block;
        }

        .lg-ambulance-alert strong {
          color: #ff7784;
          font-size: 13px;
          letter-spacing: .10em;
        }

        .lg-ambulance-alert span {
          margin-top: 3px;
          color: #7899b9;
          font-size: 12px;
        }

        .lg-ambulance-grid {
          display: grid;
          grid-template-columns: 1.25fr .75fr;
          gap: 18px;
        }

        .lg-ambulance-panel {
          min-width: 0;
          border: 1px solid rgba(84,201,255,.12);
          border-radius: 20px;
          background: rgba(5, 22, 48, .68);
          padding: 18px;
        }

        .lg-ambulance-panel-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 16px;
        }

        .lg-ambulance-panel-head span {
          color: #6e9ac1;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .16em;
        }

        .lg-ambulance-panel-head strong {
          color: #dcecff;
          font-size: 16px;
        }

        .lg-ambulance-unit {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 15px;
          align-items: center;
          padding: 17px;
          border-radius: 17px;
          background: rgba(84,201,255,.045);
          border: 1px solid rgba(84,201,255,.12);
        }

        .lg-ambulance-unit-icon {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          color: #54c9ff;
          background: rgba(84,201,255,.10);
        }

        .lg-ambulance-unit span,
        .lg-ambulance-unit small {
          display: block;
        }

        .lg-ambulance-unit span {
          color: #6e9ac1;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .14em;
        }

        .lg-ambulance-unit strong {
          display: block;
          margin: 4px 0;
          font-size: 22px;
        }

        .lg-ambulance-unit small {
          color: #6d8aa7;
          font-size: 11px;
        }

        .lg-ambulance-status-big {
          text-align: right;
        }

        .lg-ambulance-status-big span {
          color: #6e9ac1;
        }

        .lg-ambulance-status-big strong {
          color: #63edbf;
          font-size: 14px;
          letter-spacing: .08em;
        }

        .lg-ambulance-metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 10px;
        }

        .lg-ambulance-metric {
          display: flex;
          gap: 11px;
          padding: 13px;
          border-radius: 14px;
          background: rgba(2, 13, 31, .58);
          border: 1px solid rgba(84,201,255,.08);
        }

        .lg-ambulance-metric-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          color: #54c9ff;
          background: rgba(84,201,255,.08);
        }

        .lg-ambulance-metric span,
        .lg-ambulance-metric small {
          display: block;
        }

        .lg-ambulance-metric span {
          color: #6e9ac1;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .13em;
        }

        .lg-ambulance-metric strong {
          display: block;
          margin: 3px 0;
          font-size: 17px;
        }

        .lg-ambulance-metric small {
          color: #68839f;
          font-size: 10px;
        }

        .lg-ambulance-metric.danger .lg-ambulance-metric-icon {
          color: #ff6877;
          background: rgba(255,89,104,.08);
        }

        .lg-ambulance-metric.good .lg-ambulance-metric-icon {
          color: #63edbf;
          background: rgba(99,237,191,.08);
        }

        .lg-ambulance-timeline {
          display: grid;
          gap: 9px;
        }

        .lg-ambulance-step {
          position: relative;
          display: grid;
          grid-template-columns: 42px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 11px;
          border-radius: 14px;
          border: 1px solid transparent;
          transition: .25s ease;
        }

        .lg-ambulance-step.active {
          border-color: rgba(84,201,255,.18);
          background: rgba(84,201,255,.055);
        }

        .lg-ambulance-step.complete {
          opacity: .78;
        }

        .lg-ambulance-step-icon {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #537b9d;
          background: rgba(84,201,255,.045);
          border: 1px solid rgba(84,201,255,.08);
        }

        .lg-ambulance-step.active .lg-ambulance-step-icon {
          color: #54c9ff;
          border-color: rgba(84,201,255,.25);
          box-shadow: 0 0 22px rgba(84,201,255,.09);
        }

        .lg-ambulance-step.complete .lg-ambulance-step-icon {
          color: #63edbf;
        }

        .lg-ambulance-step span {
          display: block;
          color: #6e9ac1;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .12em;
        }

        .lg-ambulance-step strong {
          display: block;
          margin-top: 3px;
          color: #dcecff;
          font-size: 13px;
        }

        .lg-ambulance-step small {
          display: block;
          margin-top: 2px;
          color: #66839f;
          font-size: 10px;
        }

        .lg-ambulance-step-time {
          color: #577590;
          font-size: 9px;
          font-weight: 800;
          text-align: right;
        }

        .lg-ambulance-command {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 14px;
        }

        .lg-ambulance-button {
          min-height: 46px;
          border: 1px solid rgba(84,201,255,.18);
          border-radius: 13px;
          background: rgba(84,201,255,.055);
          color: #a8c9e5;
          cursor: pointer;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .09em;
          transition: .2s ease;
        }

        .lg-ambulance-button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(84,201,255,.34);
          background: rgba(84,201,255,.09);
        }

        .lg-ambulance-button.primary {
          color: #07192b;
          background: #54c9ff;
          border-color: #54c9ff;
          box-shadow: 0 10px 30px rgba(84,201,255,.13);
        }

        .lg-ambulance-button.primary:hover:not(:disabled) {
          background: #75d5ff;
        }

        .lg-ambulance-button:disabled {
          cursor: not-allowed;
          opacity: .35;
        }

        .lg-ambulance-route {
          margin-top: 10px;
          padding: 15px;
          border-radius: 15px;
          background: rgba(2, 13, 31, .58);
          border: 1px solid rgba(84,201,255,.08);
        }

        .lg-ambulance-route-line {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .lg-ambulance-route-node {
          width: 10px;
          height: 10px;
          flex: 0 0 10px;
          border-radius: 50%;
          background: #54c9ff;
          box-shadow: 0 0 13px rgba(84,201,255,.65);
        }

        .lg-ambulance-route-node.incident {
          background: #ff6877;
          box-shadow: 0 0 13px rgba(255,104,119,.55);
        }

        .lg-ambulance-route-node.hospital {
          background: #63edbf;
          box-shadow: 0 0 13px rgba(99,237,191,.55);
        }

        .lg-ambulance-route-segment {
          height: 2px;
          flex: 1;
          background: linear-gradient(
            90deg,
            rgba(84,201,255,.8),
            rgba(99,237,191,.7)
          );
        }

        .lg-ambulance-route-labels {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-top: 10px;
        }

        .lg-ambulance-route-labels div:nth-child(2) {
          text-align: center;
        }

        .lg-ambulance-route-labels div:last-child {
          text-align: right;
        }

        .lg-ambulance-route-labels span {
          display: block;
          color: #5f7e9b;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .12em;
        }

        .lg-ambulance-route-labels strong {
          display: block;
          margin-top: 3px;
          color: #cfe4f7;
          font-size: 11px;
        }

        .lg-ambulance-equipment {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 10px;
        }

        .lg-ambulance-equipment-item {
          padding: 11px 8px;
          text-align: center;
          border-radius: 12px;
          border: 1px solid rgba(84,201,255,.08);
          background: rgba(2,13,31,.48);
        }

        .lg-ambulance-equipment-item svg {
          color: #63edbf;
        }

        .lg-ambulance-equipment-item strong,
        .lg-ambulance-equipment-item span {
          display: block;
        }

        .lg-ambulance-equipment-item strong {
          margin-top: 5px;
          font-size: 10px;
        }

        .lg-ambulance-equipment-item span {
          margin-top: 2px;
          color: #5e7d99;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .08em;
        }

        .lg-ambulance-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 15px;
          padding-top: 13px;
          border-top: 1px solid rgba(84,201,255,.07);
          color: #55728d;
          font-size: 9px;
        }

        @keyframes lgAmbPulse {
          50% { opacity: .45; transform: scale(.72); }
        }

        @media (max-width: 980px) {
          .lg-ambulance-grid {
            grid-template-columns: 1fr;
          }

          .lg-ambulance-header {
            flex-direction: column;
          }

          .lg-ambulance-header-actions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 620px) {
          .lg-ambulance-dashboard {
            padding: 16px;
            border-radius: 20px;
          }

          .lg-ambulance-alert,
          .lg-ambulance-unit {
            grid-template-columns: 1fr;
          }

          .lg-ambulance-unit {
            display: flex;
            flex-wrap: wrap;
          }

          .lg-ambulance-status-big {
            text-align: left;
          }

          .lg-ambulance-metrics,
          .lg-ambulance-command {
            grid-template-columns: 1fr;
          }

          .lg-ambulance-route-labels {
            grid-template-columns: 1fr;
          }

          .lg-ambulance-route-labels div,
          .lg-ambulance-route-labels div:nth-child(2),
          .lg-ambulance-route-labels div:last-child {
            text-align: left;
          }
        }
      `}</style>

      <div className="lg-ambulance-content">
        <header className="lg-ambulance-header">
          <div className="lg-ambulance-title-row">
            <div className="lg-ambulance-logo">
              <Ambulance size={28} />
            </div>

            <div>
              <span className="lg-ambulance-eyebrow">
                AMBULANCE OPERATIONS NETWORK
              </span>

              <h2 className="lg-ambulance-title">
                EMS Response Console
              </h2>

              <p className="lg-ambulance-subtitle">
                Live operational view for the assigned emergency unit.
              </p>
            </div>
          </div>

          <div className="lg-ambulance-header-actions">
            <div className="lg-ambulance-network">
              <span className="lg-ambulance-network-dot" />
              <Wifi size={14} />
              NETWORK {realtimeStatus === "LIVE" ? "LIVE" : realtimeStatus}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <StatusPill active>
                {STATUS_STEPS[currentIndex]?.label || "ASSIGNED"}
              </StatusPill>
              <StatusPill active={gpsStatus === "LIVE"} danger={["PERMISSION", "GPS ERROR", "SYNC ERROR"].includes(gpsStatus)}>
                GPS {gpsStatus}
              </StatusPill>
              <span style={{ color: "#5f88aa", fontSize: 9, fontWeight: 800, letterSpacing: ".1em" }}>
                EVENTS {eventCount}
              </span>
            </div>
          </div>
        </header>

        <div className="lg-ambulance-alert">
          <div className="lg-ambulance-alert-main">
            <div className="lg-ambulance-alert-icon">
              <ShieldAlert size={21} />
            </div>

            <div>
              <strong>
                CRITICAL RESPONSE CHANNEL
              </strong>

              <span>
                Incident #{emergencyData?.id ?? emergencyData?.emergency_id ?? "LG-DEMO"} •{" "}
                {patientCount} patient{patientCount === 1 ? "" : "s"} •{" "}
                {String(severity).toUpperCase()} priority
              </span>
            </div>
          </div>

          <StatusPill danger>
            SCORE {Math.round(severityScore)}/100
          </StatusPill>
        </div>

        <div className="lg-ambulance-grid">
          <div className="lg-ambulance-panel">
            <div className="lg-ambulance-panel-head">
              <div>
                <span>01 / UNIT CONTROL</span>
                <strong>Assigned Ambulance</strong>
              </div>

              <CircleDot
                size={18}
                color="#63edbf"
              />
            </div>

            <div className="lg-ambulance-unit">
              <div className="lg-ambulance-unit-icon">
                <Ambulance size={25} />
              </div>

              <div>
                <span>VEHICLE IDENTIFIER</span>
                <strong>
                  {ambulanceData?.vehicle_number ||
                    "LG-AMB-001"}
                </strong>
                <small>
                  {ambulanceData?.provider_name ||
                    "LIFEGRID EMS"}{" "}
                  •{" "}
                  {ambulanceData?.ambulance_type ||
                    "Advanced Unit"}
                </small>
              </div>

              <div className="lg-ambulance-status-big">
                <span>LIVE STATUS</span>
                <strong>
                  {STATUS_STEPS[currentIndex]?.label}
                </strong>
              </div>
            </div>

            <div className="lg-ambulance-metrics">
              <Metric
                icon={Clock3}
                label="ROAD ETA"
                value={formatEta(routeEta)}
                detail="Estimated road travel time"
              />

              <Metric
                icon={MapPin}
                label="INCIDENT DISTANCE"
                value={`${distanceApprox.toFixed(1)} km`}
                detail="Approx. unit-to-incident"
              />

              <Metric
                icon={Gauge}
                label="PRIORITY"
                value={`${Math.round(severityScore)}/100`}
                detail={String(severity).toUpperCase()}
                tone="danger"
              />

              <Metric
                icon={Radio}
                label="RESPONSE LINK"
                value="ACTIVE"
                detail={`Last action ${statusTime}`}
                tone="good"
              />
            </div>

            <div className="lg-ambulance-route">
              <div className="lg-ambulance-panel-head">
                <div>
                  <span>RESPONSE CORRIDOR</span>
                  <strong>Incident → Receiving Facility</strong>
                </div>

                <StatusPill active>
                  ROUTE LINKED
                </StatusPill>
              </div>

              <div className="lg-ambulance-route-line">
                <span className="lg-ambulance-route-node" />
                <span className="lg-ambulance-route-segment" />
                <span className="lg-ambulance-route-node incident" />
                <span className="lg-ambulance-route-segment" />
                <span className="lg-ambulance-route-node hospital" />
              </div>

              <div className="lg-ambulance-route-labels">
                <div>
                  <span>UNIT</span>
                  <strong>
                    {ambulanceData?.vehicle_number ||
                      "LG-AMB-001"}
                  </strong>
                </div>

                <div>
                  <span>INCIDENT</span>
                  <strong>
                    {String(
                      emergencyData?.emergency_type ||
                        emergencyData?.analysis?.emergency_type ||
                        "Road Accident"
                    )
                      .replaceAll("_", " ")
                      .toUpperCase()}
                  </strong>
                </div>

                <div>
                  <span>DESTINATION</span>
                  <strong>
                    {hospitalData?.name ||
                      "Receiving Facility"}
                  </strong>
                </div>
              </div>
            </div>

            <div className="lg-ambulance-equipment">
              <div className="lg-ambulance-equipment-item">
                <Wind size={17} />
                <strong>
                  {ambulanceData?.oxygen_available
                    ? "OXYGEN"
                    : "OXYGEN"}
                </strong>
                <span>
                  {ambulanceData?.oxygen_available
                    ? "AVAILABLE"
                    : "NOT REPORTED"}
                </span>
              </div>

              <div className="lg-ambulance-equipment-item">
                <Activity size={17} />
                <strong>VENTILATOR</strong>
                <span>
                  {ambulanceData?.ventilator_available
                    ? "AVAILABLE"
                    : "NOT REPORTED"}
                </span>
              </div>

              <div className="lg-ambulance-equipment-item">
                <Zap size={17} />
                <strong>PARAMEDIC</strong>
                <span>
                  {ambulanceData?.paramedic_available
                    ? "AVAILABLE"
                    : "NOT REPORTED"}
                </span>
              </div>
            </div>
          </div>

          <div className="lg-ambulance-panel">
            <div className="lg-ambulance-panel-head">
              <div>
                <span>02 / RESPONSE STATE</span>
                <strong>Operational Timeline</strong>
              </div>

              <TimerReset
                size={18}
                color="#54c9ff"
              />
            </div>

            <div className="lg-ambulance-timeline">
              {STATUS_STEPS.map(
                (step, index) => {
                  const Icon = step.icon;
                  const isActive =
                    index === currentIndex;
                  const isComplete =
                    index < currentIndex;

                  return (
                    <motion.div
                      key={step.key}
                      className={`lg-ambulance-step ${
                        isActive ? "active" : ""
                      } ${
                        isComplete ? "complete" : ""
                      }`}
                      animate={
                        isActive
                          ? {
                              x: [0, 2, 0],
                            }
                          : { x: 0 }
                      }
                      transition={{
                        duration: 2.4,
                        repeat: isActive ? Infinity : 0,
                      }}
                    >
                      <div className="lg-ambulance-step-icon">
                        <Icon size={18} />
                      </div>

                      <div>
                        <span>{step.label}</span>
                        <strong>{step.title}</strong>
                        <small>
                          {step.description}
                        </small>
                      </div>

                      <div className="lg-ambulance-step-time">
                        {isActive
                          ? "LIVE"
                          : isComplete
                          ? "DONE"
                          : "PENDING"}
                      </div>
                    </motion.div>
                  );
                }
              )}
            </div>

            {statusError && (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,89,104,.22)", background: "rgba(255,89,104,.06)", color: "#ff7a87", fontSize: 10, fontWeight: 800 }}>
                {statusError}
              </div>
            )}

            <div className="lg-ambulance-command">
              <button
                className="lg-ambulance-button primary"
                type="button"
                disabled={!canAdvance || statusBusy}
                onClick={() =>
                  changeStatus(nextStep.key)
                }
              >
                {canAdvance
                  ? `MARK ${nextStep.label}`
                  : "RESPONSE COMPLETE"}
              </button>

              <button
                className="lg-ambulance-button"
                type="button"
                disabled={currentIndex === 0 || statusBusy}
                onClick={() =>
                  changeStatus(
                    STATUS_ORDER[
                      Math.max(
                        0,
                        currentIndex - 1
                      )
                    ]
                  )
                }
              >
                PREVIOUS STATE
              </button>
            </div>

            <div className="lg-ambulance-route">
              <div className="lg-ambulance-panel-head">
                <div>
                  <span>03 / RECEIVING FACILITY</span>
                  <strong>
                    {hospitalData?.name ||
                      "Hospital matching"}
                  </strong>
                </div>

                {status === "hospital" ? (
                  <StatusPill active>
                    ARRIVED
                  </StatusPill>
                ) : (
                  <StatusPill>
                    COORDINATED
                  </StatusPill>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "auto 1fr",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <div className="lg-ambulance-unit-icon">
                  <MapPin size={22} />
                </div>

                <div>
                  <strong
                    style={{
                      display: "block",
                      fontSize: "13px",
                    }}
                  >
                    {hospitalData?.name ||
                      "LIFEGRID Receiving Facility"}
                  </strong>

                  <span
                    style={{
                      display: "block",
                      marginTop: "4px",
                      color: "#66839f",
                      fontSize: "10px",
                    }}
                  >
                    {hospitalData?.address ||
                      hospitalData?.city ||
                      "Coordinated destination"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg-ambulance-footer">
          <span>
            <Radio
              size={11}
              style={{
                verticalAlign: "middle",
                marginRight: 5,
              }}
            />
            LIFEGRID EMS response coordination • Realtime events {eventCount}
          </span>
          <span>
            <MapPin
              size={11}
              style={{
                verticalAlign: "middle",
                marginRight: 5,
              }}
            />
            GPS {gpsStatus}{gpsAccuracy != null ? ` • ±${gpsAccuracy}m` : ""}
          </span>

          <span>
            <ArrowRight
              size={11}
              style={{
                verticalAlign: "middle",
                marginRight: 5,
              }}
            />
            Status changes are recorded from authenticated provider events
          </span>

          <span>
            <XCircle
              size={11}
              style={{
                verticalAlign: "middle",
                marginRight: 5,
              }}
            />
            Decision support; official dispatch authority remains responsible for emergency operations
          </span>
        </div>
      </div>
    </section>
  );
}
