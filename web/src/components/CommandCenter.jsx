import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { authenticatedFetch } from "../auth/supabase";
import {
  Activity,
  Ambulance,
  ArrowUpRight,
  Brain,
  Building2,
  CheckCircle2,
  Clock3,
  Cpu,
  Gauge,
  MapPin,
  Radio,
  ShieldAlert,
  Signal,
  Siren,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "/api";

const statusStyles = {
  operational: {
    label: "OPERATIONAL",
    className: "cc-status-operational",
  },
  assigned: {
    label: "ASSIGNED",
    className: "cc-status-assigned",
  },
  requested: {
    label: "REQUESTED",
    className: "cc-status-requested",
  },
  accepted: {
    label: "ACCEPTED",
    className: "cc-status-accepted",
  },
  enroute: {
    label: "EN ROUTE",
    className: "cc-status-enroute",
  },
};

function safeUpper(value, fallback = "UNKNOWN") {
  return String(value || fallback).replaceAll("_", " ").toUpperCase();
}

function getSeverityClass(severity) {
  const value = String(severity || "").toLowerCase();

  if (value.includes("critical")) return "cc-critical";
  if (value.includes("high")) return "cc-high";
  if (value.includes("moderate")) return "cc-moderate";
  return "cc-low";
}

function formatRelativeTime(dateValue) {
  if (!dateValue) return "JUST NOW";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "JUST NOW";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000)
  );

  if (seconds < 60) return `${seconds}s AGO`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m AGO`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h AGO`;
}

function StatusPill({ type = "operational", children }) {
  const style = statusStyles[type] || statusStyles.operational;

  return (
    <span className={`cc-status-pill ${style.className}`}>
      <span className="cc-status-dot" />
      {children || style.label}
    </span>
  );
}

function Metric({ icon: Icon, label, value, detail, tone = "" }) {
  return (
    <motion.div
      className={`cc-metric ${tone}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="cc-metric-icon">
        <Icon size={18} />
      </div>

      <div className="cc-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </motion.div>
  );
}

function ResourceRow({ resource }) {
  const quantity = Number(resource?.quantity_available ?? 0);
  const verified = Boolean(resource?.verified);

  return (
    <div className="cc-resource-row">
      <div className="cc-resource-main">
        <div className="cc-resource-icon">
          <Zap size={15} />
        </div>

        <div>
          <strong>
            {safeUpper(
              resource?.resource_name || resource?.resource_type,
              "RESOURCE"
            )}
          </strong>
          <span>
            {resource?.provider_name || "Verified network provider"}
          </span>
        </div>
      </div>

      <div className="cc-resource-value">
        <strong>{quantity}</strong>
        <span>{verified ? "VERIFIED" : "UNVERIFIED"}</span>
      </div>
    </div>
  );
}

function TimelineItem({ icon: Icon, title, description, time, active, last }) {
  return (
    <div className={`cc-timeline-item ${active ? "active" : ""}`}>
      <div className="cc-timeline-rail">
        <div className="cc-timeline-node">
          <Icon size={14} />
        </div>
        {!last && <div className="cc-timeline-line" />}
      </div>

      <div className="cc-timeline-content">
        <div className="cc-timeline-top">
          <strong>{title}</strong>
          <span>{time}</span>
        </div>
        <p>{description}</p>
      </div>
    </div>
  );
}

function CommandHeader({ emergency, onRefresh, refreshing }) {
  const severity = safeUpper(emergency?.severity, "ACTIVE");
  const emergencyId =
    emergency?.id ||
    emergency?.emergency_id ||
    emergency?.coordination?.emergency_id ||
    "DEMO";

  return (
    <div className="cc-header">
      <div className="cc-header-left">
        <div className="cc-command-icon">
          <Siren size={24} />
          <span />
        </div>

        <div>
          <div className="cc-eyebrow">
            <span className="cc-live-dot" />
            EMERGENCY COMMAND CENTER
          </div>

          <h2>Live Response Coordination</h2>

          <div className="cc-incident-id">
            INCIDENT ID <strong>LG-{String(emergencyId).slice(0, 8)}</strong>
          </div>
        </div>
      </div>

      <div className="cc-header-actions">
        <div className="cc-network">
          <Wifi size={15} />
          <span>NETWORK</span>
          <strong>ONLINE</strong>
        </div>

        <button
          className="cc-refresh-button"
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh command center"
        >
          <Activity size={16} className={refreshing ? "cc-spin" : ""} />
          {refreshing ? "SYNCING" : "SYNC"}
        </button>
      </div>
    </div>
  );
}

export default function CommandCenter({
  emergency,
  ambulance,
  hospital,
  resources = [],
}) {
  const [liveEmergency, setLiveEmergency] = useState(emergency);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState(Date.now());

  useEffect(() => {
    setLiveEmergency(emergency);
  }, [emergency]);

  useEffect(() => {
    const emergencyId =
      emergency?.id ||
      emergency?.emergency_id ||
      emergency?.coordination?.emergency_id;

    if (!emergencyId) return undefined;

    let cancelled = false;

    const refreshIncident = async () => {
      try {
        const response = await authenticatedFetch(
          `${API_BASE_URL}/emergencies/${emergencyId}`,
          { cache: "no-store", headers: { Accept: "application/json" } }
        );

        if (!response.ok) return;

        const data = await response.json();

        if (!cancelled && data) {
          setLiveEmergency((previous) => ({
            ...(previous || {}),
            ...data,
            analysis: data.analysis || previous?.analysis,
            coordination:
              data.coordination || previous?.coordination,
          }));
          setLastSync(Date.now());
        }
      } catch {
        // Prototype mode: keep the last known state if the API is unavailable.
      }
    };

    refreshIncident();

    const interval = window.setInterval(refreshIncident, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    emergency?.id,
    emergency?.emergency_id,
    emergency?.coordination?.emergency_id,
  ]);

  const activeEmergency = liveEmergency || emergency;

  const analysis = activeEmergency?.analysis || {};
  const coordination = activeEmergency?.coordination || {};

  const liveAmbulance =
    ambulance ||
    coordination?.ambulance ||
    coordination?.assigned_ambulance ||
    null;

  const liveHospital =
    hospital ||
    coordination?.hospital ||
    coordination?.selected_hospital ||
    null;

  const liveResources =
    resources?.length > 0
      ? resources
      : coordination?.resources ||
        coordination?.matched_resources ||
        [];

  const severity = safeUpper(
    activeEmergency?.severity ||
      analysis?.severity ||
      coordination?.severity,
    "ACTIVE"
  );

  const score =
    Number(
      activeEmergency?.severity_score ??
        analysis?.severity_score ??
        coordination?.severity_score ??
        0
    ) || 0;

  const patients =
    Number(
      activeEmergency?.patient_count ??
        analysis?.patient_count ??
        1
    ) || 1;

  const ambulanceStatus = String(
    liveAmbulance?.status || "assigned"
  ).toLowerCase();

  const hospitalStatus =
    coordination?.hospital_status ||
    liveHospital?.response_status ||
    "requested";

  const normalizedHospitalStatus = String(
    hospitalStatus
  ).toLowerCase();

  const isHospitalAccepted =
    normalizedHospitalStatus.includes("accept");

  const incidentStatus =
    String(activeEmergency?.status || "coordinated").toLowerCase();

  const routeDistance =
    Number(
      coordination?.route?.distance_km ??
        coordination?.distance_km ??
        0
    ) || 0;

  const routeEta =
    Number(
      coordination?.route?.eta_minutes ??
        coordination?.eta_minutes ??
        0
    ) || 0;

  const syncLabel = useMemo(
    () => formatRelativeTime(new Date(lastSync).toISOString()),
    [lastSync]
  );

  const timeline = [
    {
      icon: ShieldAlert,
      title: "Emergency detected",
      description:
        "SOS signal received and emergency record created.",
      time: formatRelativeTime(activeEmergency?.created_at),
      active: true,
    },
    {
      icon: Brain,
      title: "AI triage completed",
      description:
        `${severity} priority • ${patients} patient${
          patients === 1 ? "" : "s"
        } • score ${score}/100`,
      time: "ANALYZED",
      active: true,
    },
    {
      icon: Ambulance,
      title: "Ambulance matched",
      description:
        liveAmbulance?.vehicle_number
          ? `${liveAmbulance.vehicle_number} assigned to the incident.`
          : "Best available ambulance selected.",
      time: safeUpper(ambulanceStatus, "ASSIGNED"),
      active: Boolean(liveAmbulance),
    },
    {
      icon: Building2,
      title: "Hospital matched",
      description:
        liveHospital?.name
          ? `${liveHospital.name} selected using capability-aware matching.`
          : "Suitable receiving facility selected.",
      time: isHospitalAccepted ? "ACCEPTED" : "REQUESTED",
      active: Boolean(liveHospital),
    },
    {
      icon: MapPin,
      title: "Smart route calculated",
      description:
        routeDistance > 0
          ? `${routeDistance.toFixed(1)} km road route • ${
              routeEta > 0 ? `${Math.round(routeEta)} min ETA` : "ETA calculating"
            }`
          : "Road-following route prepared for response coordination.",
      time: routeDistance > 0 ? "ROUTE READY" : "READY",
      active: routeDistance > 0,
    },
    {
      icon: Radio,
      title: "Response coordinated",
      description:
        incidentStatus === "coordinated"
          ? "Ambulance, destination and emergency resources are linked."
          : "Waiting for response coordination.",
      time:
        incidentStatus === "coordinated"
          ? "LIVE"
          : safeUpper(incidentStatus),
      active: incidentStatus === "coordinated",
    },
  ];

  const handleRefresh = async () => {
    const emergencyId =
      activeEmergency?.id ||
      activeEmergency?.emergency_id ||
      activeEmergency?.coordination?.emergency_id;

    if (!emergencyId) return;

    setRefreshing(true);

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/emergencies/${emergencyId}`,
        { cache: "no-store", headers: { Accept: "application/json" } }
      );

      if (response.ok) {
        const data = await response.json();

        setLiveEmergency((previous) => ({
          ...(previous || {}),
          ...data,
          analysis: data.analysis || previous?.analysis,
          coordination:
            data.coordination || previous?.coordination,
        }));
      }
    } catch {
      // Keep current state in prototype mode.
    } finally {
      setLastSync(Date.now());
      window.setTimeout(() => setRefreshing(false), 450);
    }
  };

  return (
    <motion.section
      className="command-center"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: "easeOut" }}
    >
      <CommandHeader
        emergency={activeEmergency}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <div className="cc-alert-strip">
        <div className="cc-alert-pulse">
          <span />
          <span />
          <span />
        </div>

        <div className="cc-alert-copy">
          <strong>{severity} INCIDENT ACTIVE</strong>
          <span>
            LIFEGRID decision-support network is coordinating the response.
          </span>
        </div>

        <StatusPill type="operational">
          {safeUpper(incidentStatus, "COORDINATED")}
        </StatusPill>
      </div>

      <div className="cc-metrics">
        <Metric
          icon={Gauge}
          label="SEVERITY SCORE"
          value={`${score}/100`}
          detail={`${severity} PRIORITY`}
          tone={getSeverityClass(severity)}
        />

        <Metric
          icon={Users}
          label="PATIENTS"
          value={String(patients).padStart(2, "0")}
          detail="REPORTED PATIENT COUNT"
        />

        <Metric
          icon={Ambulance}
          label="AMBULANCE"
          value={liveAmbulance?.vehicle_number || "—"}
          detail={safeUpper(ambulanceStatus, "ASSIGNED")}
          tone="cc-blue"
        />

        <Metric
          icon={Clock3}
          label="ROAD ETA"
          value={routeEta > 0 ? `${Math.round(routeEta)}m` : "—"}
          detail={
            routeDistance > 0
              ? `${routeDistance.toFixed(1)} KM ROUTE`
              : "ROUTE CALCULATING"
          }
        />
      </div>

      <div className="cc-grid">
        <div className="cc-panel cc-incident-panel">
          <div className="cc-panel-heading">
            <div>
              <span>01 / INCIDENT</span>
              <h3>Emergency Intelligence</h3>
            </div>

            <div className={`cc-severity-badge ${getSeverityClass(severity)}`}>
              <ShieldAlert size={16} />
              {severity}
            </div>
          </div>

          <div className="cc-incident-description">
            <div className="cc-description-icon">
              <Brain size={20} />
            </div>

            <div>
              <span>AI RESPONSE SUMMARY</span>
              <p>
                {activeEmergency?.ai_summary ||
                  analysis?.ai_summary ||
                  "Emergency analysis completed. Response recommendations use the current verified LIFEGRID provider data available to the coordinator."}
              </p>
            </div>
          </div>

          <div className="cc-condition-grid">
            <div>
              <span>EMERGENCY TYPE</span>
              <strong>
                {safeUpper(
                  activeEmergency?.emergency_type ||
                    analysis?.emergency_type,
                  "EMERGENCY"
                )}
              </strong>
            </div>

            <div>
              <span>LOCATION</span>
              <strong>
                {activeEmergency?.location_description ||
                  "Location not provided"}
              </strong>
            </div>

            <div>
              <span>COORDINATES</span>
              <strong>
                {activeEmergency?.latitude != null
                  ? `${Number(activeEmergency.latitude).toFixed(4)}, ${Number(
                      activeEmergency.longitude
                    ).toFixed(4)}`
                  : "AVAILABLE"}
              </strong>
            </div>

            <div>
              <span>LAST SYNC</span>
              <strong>{syncLabel}</strong>
            </div>
          </div>

          <div className="cc-resource-section">
            <div className="cc-subheading">
              <span>REQUIRED / MATCHED RESOURCES</span>
              <small>{liveResources.length} ITEMS</small>
            </div>

            <div className="cc-resource-list">
              {liveResources.length > 0 ? (
                liveResources.slice(0, 4).map((resource, index) => (
                  <ResourceRow
                    key={
                      resource?.id ||
                      resource?.resource_name ||
                      `resource-${index}`
                    }
                    resource={resource}
                  />
                ))
              ) : (
                <div className="cc-empty-resource">
                  <Zap size={16} />
                  No resource records attached to this coordination yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="cc-panel cc-response-panel">
          <div className="cc-panel-heading">
            <div>
              <span>02 / RESPONSE</span>
              <h3>Network Assignments</h3>
            </div>

            <div className="cc-signal">
              <Signal size={16} />
              <span>LIVE</span>
            </div>
          </div>

          <div className="cc-assignment">
            <div className="cc-assignment-icon ambulance">
              <Ambulance size={21} />
            </div>

            <div className="cc-assignment-copy">
              <span>AMBULANCE UNIT</span>
              <strong>
                {liveAmbulance?.vehicle_number || "MATCHING UNIT"}
              </strong>
              <small>
                {liveAmbulance?.provider_name ||
                  "LIFEGRID response network"}
              </small>
            </div>

            <StatusPill type="assigned">
              {safeUpper(ambulanceStatus, "ASSIGNED")}
            </StatusPill>
          </div>

          <div className="cc-assignment">
            <div className="cc-assignment-icon hospital">
              <Building2 size={21} />
            </div>

            <div className="cc-assignment-copy">
              <span>RECEIVING FACILITY</span>
              <strong>
                {liveHospital?.name || "MATCHED HOSPITAL"}
              </strong>
              <small>
                {liveHospital?.address ||
                  "Capability-aware hospital match"}
              </small>
            </div>

            <StatusPill type={isHospitalAccepted ? "accepted" : "requested"}>
              {isHospitalAccepted ? "ACCEPTED" : "REQUESTED"}
            </StatusPill>
          </div>

          <div className="cc-route-box">
            <div className="cc-route-line">
              <div className="cc-route-node incident">
                <ShieldAlert size={14} />
              </div>

              <div className="cc-route-track">
                <span />
                <span />
                <span />
              </div>

              <div className="cc-route-node hospital">
                <Building2 size={14} />
              </div>
            </div>

            <div className="cc-route-meta">
              <div>
                <span>ROAD ROUTE</span>
                <strong>
                  {routeDistance > 0
                    ? `${routeDistance.toFixed(1)} KM`
                    : "CONNECTED"}
                </strong>
              </div>

              <div>
                <span>EST. TRAVEL</span>
                <strong>
                  {routeEta > 0
                    ? `${Math.round(routeEta)} MIN`
                    : "CALCULATING"}
                </strong>
              </div>
            </div>
          </div>

          <div className="cc-coordination-state">
            <div className="cc-coordination-icon">
              <CheckCircle2 size={20} />
            </div>

            <div>
              <strong>COORDINATION LINK ACTIVE</strong>
              <span>
                Incident, ambulance and receiving facility are connected.
              </span>
            </div>

            <ArrowUpRight size={18} />
          </div>
        </div>
      </div>

      <div className="cc-bottom-grid">
        <div className="cc-panel cc-timeline-panel">
          <div className="cc-panel-heading">
            <div>
              <span>03 / EVENT STREAM</span>
              <h3>Response Timeline</h3>
            </div>

            <div className="cc-processing">
              <Cpu size={15} />
              AI PROCESSING
            </div>
          </div>

          <div className="cc-timeline">
            {timeline.map((item, index) => (
              <TimelineItem
                key={item.title}
                {...item}
                last={index === timeline.length - 1}
              />
            ))}
          </div>
        </div>

        <div className="cc-panel cc-command-panel">
          <div className="cc-panel-heading">
            <div>
              <span>04 / SYSTEM HEALTH</span>
              <h3>Grid Diagnostics</h3>
            </div>
          </div>

          <div className="cc-health-grid">
            <div className="cc-health-card">
              <div>
                <Wifi size={17} />
                <span>API NETWORK</span>
              </div>
              <strong>ONLINE</strong>
              <small>5s sync interval</small>
            </div>

            <div className="cc-health-card">
              <div>
                <MapPin size={17} />
                <span>ROUTING</span>
              </div>
              <strong>
                {routeDistance > 0 ? "CONNECTED" : "READY"}
              </strong>
              <small>Road route engine</small>
            </div>

            <div className="cc-health-card">
              <div>
                <Brain size={17} />
                <span>AI ENGINE</span>
              </div>
              <strong>READY</strong>
              <small>Decision support</small>
            </div>

            <div className="cc-health-card">
              <div>
                <Radio size={17} />
                <span>RESPONSE LINK</span>
              </div>
              <strong>ACTIVE</strong>
              <small>Incident coordination</small>
            </div>
          </div>

          <div className="cc-command-footer">
            <div className="cc-command-orb">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 12,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <Activity size={25} />
              </motion.div>
            </div>

            <div>
              <span>LIFEGRID COMMAND NETWORK</span>
              <strong>ONE INCIDENT • ONE COORDINATED RESPONSE</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="cc-disclaimer">
        <Zap size={13} />
        Operational command center — response status and resource information are
        sourced from authenticated LIFEGRID provider updates. LIFEGRID is decision
        support and does not replace 112, ambulance dispatch, or qualified medical professionals.
      </div>

      <style>{`
        .command-center {
          width: 100%;
          margin: 34px 0 10px;
          padding: 26px;
          border: 1px solid rgba(89, 168, 255, 0.24);
          border-radius: 28px;
          background:
            radial-gradient(circle at 85% 0%, rgba(54, 132, 255, 0.12), transparent 32%),
            radial-gradient(circle at 0% 100%, rgba(123, 83, 255, 0.08), transparent 28%),
            rgba(3, 11, 29, 0.92);
          box-shadow:
            0 25px 80px rgba(0, 0, 0, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          color: #eaf2ff;
          font-family: inherit;
          overflow: hidden;
          position: relative;
        }

        .command-center::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(86, 153, 225, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(86, 153, 225, 0.035) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(to bottom, black, transparent 88%);
        }

        .cc-header,
        .cc-alert-strip,
        .cc-metrics,
        .cc-grid,
        .cc-bottom-grid,
        .cc-disclaimer {
          position: relative;
          z-index: 1;
        }

        .cc-header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: center;
          margin-bottom: 20px;
        }

        .cc-header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .cc-command-icon {
          width: 54px;
          height: 54px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          position: relative;
          background: linear-gradient(145deg, rgba(255, 75, 96, 0.18), rgba(73, 139, 255, 0.12));
          border: 1px solid rgba(255, 101, 116, 0.28);
          color: #ff6877;
          box-shadow: 0 0 28px rgba(255, 76, 94, 0.1);
        }

        .cc-command-icon span {
          position: absolute;
          width: 7px;
          height: 7px;
          right: 8px;
          top: 8px;
          border-radius: 50%;
          background: #ff5f6d;
          box-shadow: 0 0 12px #ff5f6d;
          animation: ccPulse 1.4s infinite;
        }

        .cc-eyebrow,
        .cc-panel-heading > div > span,
        .cc-condition-grid span,
        .cc-resource-section .cc-subheading > span,
        .cc-assignment-copy > span,
        .cc-route-meta span,
        .cc-health-card span,
        .cc-command-footer span {
          color: #7290b7;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
        }

        .cc-eyebrow {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .cc-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4dffb0;
          box-shadow: 0 0 12px rgba(77, 255, 176, 0.9);
        }

        .cc-header h2 {
          margin: 5px 0 4px;
          font-size: clamp(22px, 2.2vw, 31px);
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: #f4f8ff;
        }

        .cc-incident-id {
          color: #627fa8;
          font-size: 10px;
          letter-spacing: 0.12em;
        }

        .cc-incident-id strong {
          color: #a8c4e8;
          margin-left: 7px;
        }

        .cc-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .cc-network,
        .cc-refresh-button {
          min-height: 38px;
          border: 1px solid rgba(104, 152, 214, 0.2);
          background: rgba(7, 20, 44, 0.76);
          border-radius: 11px;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 12px;
          color: #7897be;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.09em;
        }

        .cc-network strong {
          color: #52f0aa;
        }

        .cc-network svg {
          color: #52f0aa;
        }

        .cc-refresh-button {
          color: #b9d3f2;
          cursor: pointer;
          transition: 0.2s ease;
        }

        .cc-refresh-button:hover {
          border-color: rgba(93, 171, 255, 0.48);
          transform: translateY(-1px);
        }

        .cc-refresh-button:disabled {
          opacity: 0.7;
          cursor: wait;
        }

        .cc-alert-strip {
          min-height: 62px;
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 12px 15px;
          margin-bottom: 14px;
          border: 1px solid rgba(255, 86, 102, 0.23);
          border-radius: 15px;
          background: linear-gradient(90deg, rgba(255, 73, 92, 0.09), rgba(22, 53, 90, 0.22));
        }

        .cc-alert-pulse {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .cc-alert-pulse span {
          width: 3px;
          height: 19px;
          border-radius: 2px;
          background: #ff6170;
          animation: ccBars 0.9s infinite ease-in-out;
        }

        .cc-alert-pulse span:nth-child(2) {
          animation-delay: 0.15s;
          height: 27px;
        }

        .cc-alert-pulse span:nth-child(3) {
          animation-delay: 0.3s;
          height: 13px;
        }

        .cc-alert-copy {
          display: grid;
          gap: 3px;
          flex: 1;
        }

        .cc-alert-copy strong {
          color: #ff7582;
          font-size: 12px;
          letter-spacing: 0.1em;
        }

        .cc-alert-copy span {
          color: #7f9abd;
          font-size: 11px;
        }

        .cc-status-pill {
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 9px;
          border-radius: 999px;
          border: 1px solid rgba(95, 156, 225, 0.22);
          background: rgba(10, 29, 57, 0.76);
          color: #8eb1d8;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .cc-status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 9px currentColor;
        }

        .cc-status-operational,
        .cc-status-accepted {
          color: #54eeb0;
        }

        .cc-status-assigned,
        .cc-status-enroute {
          color: #59b8ff;
        }

        .cc-status-requested {
          color: #f6bd65;
        }

        .cc-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .cc-metric {
          min-height: 100px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 15px;
          border: 1px solid rgba(90, 141, 205, 0.16);
          border-radius: 15px;
          background: rgba(6, 20, 43, 0.72);
        }

        .cc-metric-icon {
          width: 35px;
          height: 35px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          color: #66b9ff;
          background: rgba(65, 153, 255, 0.09);
          border: 1px solid rgba(65, 153, 255, 0.15);
        }

        .cc-metric-copy {
          display: grid;
          min-width: 0;
          gap: 3px;
        }

        .cc-metric-copy span,
        .cc-metric-copy small {
          color: #6e8bae;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.11em;
        }

        .cc-metric-copy strong {
          font-size: 21px;
          line-height: 1.1;
          color: #eef5ff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cc-metric-copy small {
          font-size: 8px;
          color: #597799;
        }

        .cc-metric.cc-critical .cc-metric-icon,
        .cc-metric.cc-high .cc-metric-icon {
          color: #ff6c7b;
          background: rgba(255, 77, 94, 0.09);
          border-color: rgba(255, 77, 94, 0.17);
        }

        .cc-metric.cc-blue .cc-metric-icon {
          color: #62c1ff;
        }

        .cc-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.22fr) minmax(0, 0.78fr);
          gap: 14px;
        }

        .cc-bottom-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
          gap: 14px;
          margin-top: 14px;
        }

        .cc-panel {
          border: 1px solid rgba(89, 142, 206, 0.17);
          border-radius: 18px;
          background: rgba(5, 17, 38, 0.78);
          padding: 18px;
          min-width: 0;
        }

        .cc-panel-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 17px;
        }

        .cc-panel-heading h3 {
          margin: 4px 0 0;
          font-size: 18px;
          color: #eaf2ff;
          letter-spacing: -0.015em;
        }

        .cc-severity-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 9px;
          border-radius: 9px;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.12em;
          border: 1px solid rgba(255, 77, 94, 0.24);
          color: #ff6b7a;
          background: rgba(255, 77, 94, 0.08);
        }

        .cc-high {
          color: #ffad62 !important;
        }

        .cc-moderate {
          color: #f4d468 !important;
        }

        .cc-low {
          color: #61e5a9 !important;
        }

        .cc-signal,
        .cc-processing {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #56efb0;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .cc-incident-description {
          display: flex;
          gap: 12px;
          padding: 13px;
          border-radius: 13px;
          border: 1px solid rgba(76, 150, 227, 0.14);
          background: rgba(9, 28, 56, 0.56);
          margin-bottom: 13px;
        }

        .cc-description-icon {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          color: #a878ff;
          background: rgba(137, 87, 255, 0.09);
          border: 1px solid rgba(137, 87, 255, 0.18);
        }

        .cc-incident-description span {
          color: #6e8caf;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .cc-incident-description p {
          margin: 5px 0 0;
          color: #b8c9df;
          font-size: 12px;
          line-height: 1.6;
        }

        .cc-condition-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 16px;
        }

        .cc-condition-grid > div {
          min-width: 0;
          padding: 11px;
          border-radius: 11px;
          background: rgba(9, 25, 49, 0.55);
          border: 1px solid rgba(86, 137, 199, 0.1);
        }

        .cc-condition-grid strong {
          display: block;
          margin-top: 5px;
          color: #dce9fa;
          font-size: 11px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .cc-resource-section {
          border-top: 1px solid rgba(91, 139, 198, 0.12);
          padding-top: 14px;
        }

        .cc-subheading {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 9px;
        }

        .cc-subheading small {
          color: #5f7c9f;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .cc-resource-list {
          display: grid;
          gap: 7px;
        }

        .cc-resource-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 9px;
          border-radius: 10px;
          background: rgba(8, 24, 48, 0.6);
          border: 1px solid rgba(88, 139, 201, 0.1);
        }

        .cc-resource-main {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }

        .cc-resource-icon {
          width: 29px;
          height: 29px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          color: #64e5b1;
          background: rgba(69, 222, 167, 0.08);
        }

        .cc-resource-main > div:last-child {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        .cc-resource-main strong {
          color: #bcd0e9;
          font-size: 9px;
          letter-spacing: 0.08em;
        }

        .cc-resource-main span {
          color: #5f7b9d;
          font-size: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cc-resource-value {
          text-align: right;
          flex: 0 0 auto;
        }

        .cc-resource-value strong {
          display: block;
          color: #ecf5ff;
          font-size: 14px;
        }

        .cc-resource-value span {
          color: #52e9aa;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .cc-empty-resource {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #718ba9;
          font-size: 10px;
          padding: 12px;
          border: 1px dashed rgba(91, 140, 199, 0.16);
          border-radius: 10px;
        }

        .cc-assignment {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 12px;
          border-radius: 13px;
          background: rgba(8, 25, 49, 0.65);
          border: 1px solid rgba(87, 138, 201, 0.12);
          margin-bottom: 8px;
        }

        .cc-assignment-icon {
          width: 39px;
          height: 39px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 11px;
        }

        .cc-assignment-icon.ambulance {
          color: #64c5ff;
          background: rgba(73, 171, 255, 0.09);
        }

        .cc-assignment-icon.hospital {
          color: #54e8ae;
          background: rgba(62, 225, 163, 0.08);
        }

        .cc-assignment-copy {
          display: grid;
          gap: 3px;
          min-width: 0;
          flex: 1;
        }

        .cc-assignment-copy strong {
          color: #e0ebfa;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cc-assignment-copy small {
          color: #5f7d9f;
          font-size: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cc-route-box {
          margin-top: 13px;
          padding: 15px;
          border-radius: 14px;
          background:
            radial-gradient(circle at 50% 30%, rgba(53, 150, 255, 0.11), transparent 42%),
            rgba(7, 23, 46, 0.72);
          border: 1px solid rgba(76, 156, 235, 0.14);
        }

        .cc-route-line {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cc-route-node {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          flex: 0 0 auto;
        }

        .cc-route-node.incident {
          color: #ff6c7a;
          background: rgba(255, 76, 95, 0.1);
          border: 1px solid rgba(255, 76, 95, 0.26);
        }

        .cc-route-node.hospital {
          color: #56e8ad;
          background: rgba(61, 225, 163, 0.09);
          border: 1px solid rgba(61, 225, 163, 0.24);
        }

        .cc-route-track {
          display: flex;
          align-items: center;
          gap: 5px;
          flex: 1;
        }

        .cc-route-track span {
          height: 2px;
          flex: 1;
          border-radius: 10px;
          background: linear-gradient(90deg, #ff6876, #62bdff, #54e6ae);
          box-shadow: 0 0 8px rgba(77, 176, 255, 0.45);
        }

        .cc-route-track span:nth-child(2) {
          animation: ccRoutePulse 1.5s infinite;
        }

        .cc-route-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 13px;
        }

        .cc-route-meta > div {
          padding: 9px;
          border-radius: 9px;
          background: rgba(10, 31, 58, 0.58);
        }

        .cc-route-meta strong {
          display: block;
          margin-top: 4px;
          color: #dceafa;
          font-size: 11px;
        }

        .cc-coordination-state {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 12px;
          padding: 11px;
          border-radius: 12px;
          border: 1px solid rgba(74, 229, 170, 0.15);
          background: rgba(54, 210, 154, 0.055);
        }

        .cc-coordination-icon {
          color: #55e6ac;
          flex: 0 0 auto;
        }

        .cc-coordination-state > div:nth-child(2) {
          display: grid;
          gap: 3px;
          flex: 1;
        }

        .cc-coordination-state strong {
          color: #74edbc;
          font-size: 9px;
          letter-spacing: 0.09em;
        }

        .cc-coordination-state span {
          color: #6485a7;
          font-size: 9px;
          line-height: 1.4;
        }

        .cc-coordination-state > svg {
          color: #5c7ea4;
        }

        .cc-timeline {
          display: grid;
          gap: 0;
        }

        .cc-timeline-item {
          display: grid;
          grid-template-columns: 31px 1fr;
          min-height: 62px;
        }

        .cc-timeline-rail {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .cc-timeline-node {
          width: 28px;
          height: 28px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          color: #6585aa;
          background: rgba(20, 44, 76, 0.75);
          border: 1px solid rgba(92, 143, 205, 0.16);
          z-index: 1;
        }

        .cc-timeline-item.active .cc-timeline-node {
          color: #66c5ff;
          border-color: rgba(91, 188, 255, 0.26);
          box-shadow: 0 0 16px rgba(80, 173, 255, 0.08);
        }

        .cc-timeline-line {
          width: 1px;
          flex: 1;
          background: rgba(87, 135, 192, 0.14);
          margin: -1px 0;
        }

        .cc-timeline-content {
          padding: 2px 0 15px 12px;
        }

        .cc-timeline-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .cc-timeline-top strong {
          color: #cdddf1;
          font-size: 11px;
        }

        .cc-timeline-top span {
          color: #5d7899;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }

        .cc-timeline-content p {
          margin: 4px 0 0;
          color: #617f9f;
          font-size: 9px;
          line-height: 1.5;
        }

        .cc-health-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .cc-health-card {
          padding: 11px;
          border-radius: 11px;
          border: 1px solid rgba(88, 138, 200, 0.11);
          background: rgba(9, 26, 50, 0.62);
        }

        .cc-health-card > div {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #7090b5;
        }

        .cc-health-card > div svg {
          color: #5dbaff;
        }

        .cc-health-card strong {
          display: block;
          margin-top: 8px;
          color: #58eab0;
          font-size: 11px;
        }

        .cc-health-card small {
          display: block;
          margin-top: 3px;
          color: #587695;
          font-size: 8px;
        }

        .cc-command-footer {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(88, 138, 200, 0.1);
        }

        .cc-command-orb {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: #65bfff;
          background: radial-gradient(circle, rgba(72, 177, 255, 0.17), rgba(70, 111, 255, 0.03));
          border: 1px solid rgba(92, 180, 255, 0.19);
        }

        .cc-command-footer strong {
          display: block;
          margin-top: 3px;
          color: #c7d9ef;
          font-size: 9px;
          letter-spacing: 0.08em;
        }

        .cc-disclaimer {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin-top: 13px;
          color: #526e90;
          font-size: 8px;
          line-height: 1.5;
        }

        .cc-disclaimer svg {
          flex: 0 0 auto;
          margin-top: 1px;
        }

        .cc-spin {
          animation: ccSpin 0.8s linear infinite;
        }

        @keyframes ccPulse {
          0%, 100% { opacity: 0.45; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        @keyframes ccBars {
          0%, 100% { transform: scaleY(0.7); opacity: 0.55; }
          50% { transform: scaleY(1); opacity: 1; }
        }

        @keyframes ccRoutePulse {
          0%, 100% { opacity: 0.35; transform: scaleX(0.8); }
          50% { opacity: 1; transform: scaleX(1); }
        }

        @keyframes ccSpin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1050px) {
          .cc-grid,
          .cc-bottom-grid {
            grid-template-columns: 1fr;
          }

          .cc-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .command-center {
            padding: 15px;
            border-radius: 20px;
          }

          .cc-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .cc-header-actions {
            width: 100%;
          }

          .cc-network,
          .cc-refresh-button {
            flex: 1;
            justify-content: center;
          }

          .cc-alert-strip {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .cc-alert-copy {
            min-width: 200px;
          }

          .cc-status-pill {
            margin-left: 0;
          }

          .cc-metrics {
            grid-template-columns: 1fr 1fr;
          }

          .cc-panel {
            padding: 14px;
          }

          .cc-condition-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 470px) {
          .cc-metrics {
            grid-template-columns: 1fr;
          }

          .cc-header h2 {
            font-size: 22px;
          }

          .cc-assignment {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .cc-assignment .cc-status-pill {
            margin-left: 50px;
          }

          .cc-health-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </motion.section>
  );
}
