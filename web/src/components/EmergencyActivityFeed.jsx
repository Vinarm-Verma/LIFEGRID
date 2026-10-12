
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Ambulance,
  Brain,
  Building2,
  CheckCircle2,
  MapPin,
  Radio,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const BASE_EVENTS = [
  {
    key: "sos",
    icon: ShieldAlert,
    label: "Emergency signal received",
    detail: "LIFEGRID received the emergency report.",
    tone: "critical",
  },
  {
    key: "ai",
    icon: Brain,
    label: "Emergency analysis",
    detail: "Emergency details and severity are being assessed.",
    tone: "ai",
  },
  {
    key: "match",
    icon: Sparkles,
    label: "Hospital matching",
    detail: "Checking eligible receiving hospitals.",
    tone: "match",
  },
  {
    key: "hospital",
    icon: Building2,
    label: "Hospital response",
    detail: "Waiting for a hospital to accept the request.",
    tone: "hospital",
  },
  {
    key: "ambulance",
    icon: Ambulance,
    label: "Ambulance assignment",
    detail: "An ambulance will be assigned after hospital acceptance.",
    tone: "ambulance",
  },
  {
    key: "route",
    icon: MapPin,
    label: "Response route",
    detail: "Route information will appear when valid provider locations are available.",
    tone: "route",
  },
  {
    key: "live",
    icon: Radio,
    label: "Live response updates",
    detail: "LIFEGRID will refresh confirmed response information.",
    tone: "live",
  },
];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function elapsedLabel(seconds) {
  const value = Math.max(0, Math.floor(seconds));

  if (value < 60) {
    return `${String(value).padStart(2, "0")}s`;
  }

  return `${String(Math.floor(value / 60)).padStart(2, "0")}m ${String(
    value % 60
  ).padStart(2, "0")}s`;
}

export default function EmergencyActivityFeed({
  emergency,
  coordination,
  ambulance,
  hospitalResponse,
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!emergency?.id) {
      setElapsed(0);
      return undefined;
    }

    const createdAt = emergency.created_at
      ? new Date(emergency.created_at).getTime()
      : Date.now();

    const startTime = Number.isFinite(createdAt) ? createdAt : Date.now();

    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    };

    tick();

    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [emergency?.id, emergency?.created_at]);

  const responseStatus = normalize(
    hospitalResponse?.status ?? hospitalResponse
  );

  const ambulanceStatus = normalize(ambulance?.status);

  const hasAnalysis = Boolean(
    emergency?.analysis ||
      emergency?.ai_summary ||
      emergency?.severity
  );

  const hasHospitalRequest = Boolean(
    emergency?.selected_hospital_id ||
      emergency?.hospital_id ||
      hospitalResponse
  );

  const hasAmbulanceAssignment = Boolean(
    emergency?.assigned_ambulance_id ||
      emergency?.ambulance_id ||
      ambulance?.id
  );

  const hospitalAccepted = [
    "accepted",
    "confirmed",
    "hospital_accepted",
  ].includes(responseStatus);

  const routeAvailable = Boolean(
    coordination?.route ||
      coordination?.route_geometry ||
      coordination?.route_points
  );

  const connected = coordination?.connected === true;

  const completed = useMemo(() => {
    const keys = new Set();

    if (emergency?.id) keys.add("sos");
    if (hasAnalysis) keys.add("ai");
    if (hasHospitalRequest) keys.add("match");
    if (hospitalAccepted) keys.add("hospital");
    if (hasAmbulanceAssignment) keys.add("ambulance");
    if (routeAvailable) keys.add("route");
    if (connected) keys.add("live");

    return keys;
  }, [
    emergency?.id,
    hasAnalysis,
    hasHospitalRequest,
    hospitalAccepted,
    hasAmbulanceAssignment,
    routeAvailable,
    connected,
  ]);

  const currentKey = useMemo(() => {
    if (ambulanceStatus === "completed") return "live";
    if (ambulanceStatus === "arrived") return "live";
    if (ambulanceStatus === "en_route" || ambulanceStatus === "transporting") {
      return "route";
    }
    if (hasAmbulanceAssignment) return "ambulance";
    if (hospitalAccepted) return "ambulance";
    if (hasHospitalRequest) return "hospital";
    if (hasAnalysis) return "match";
    return "sos";
  }, [
    ambulanceStatus,
    hasAmbulanceAssignment,
    hospitalAccepted,
    hasHospitalRequest,
    hasAnalysis,
  ]);

  if (!emergency?.id) return null;

  return (
    <motion.section
      className="lg-activity-feed"
      aria-label="Emergency network activity"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <style>{`
        .lg-activity-feed {
          margin: 22px 0;
          padding: 22px;
          border: 1px solid #d9e5eb;
          border-radius: 18px;
          background: #fff;
          color: #17324a;
          box-shadow: 0 8px 26px rgba(20, 48, 68, 0.06);
          overflow: hidden;
        }

        .lg-activity-head {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 18px;
        }

        .lg-activity-title {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #173b51;
          font-size: 13px;
          font-weight: 850;
          letter-spacing: .06em;
        }

        .lg-activity-title svg {
          color: #087f7a;
        }

        .lg-activity-live {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 10px;
          border: 1px solid #cce9df;
          border-radius: 999px;
          background: #effaf6;
          color: #16775b;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .07em;
        }

        .lg-activity-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #20a879;
        }

        .lg-activity-clock {
          margin-left: auto;
          color: #6d8290;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }

        .lg-activity-list {
          position: relative;
          display: grid;
          gap: 9px;
        }

        .lg-activity-row {
          position: relative;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid #e3ebef;
          border-radius: 12px;
          background: #fbfcfd;
          transition: background .2s ease, border-color .2s ease;
        }

        .lg-activity-row.active {
          border-color: #b8dfd8;
          background: #f1faf8;
        }

        .lg-activity-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border: 1px solid #dce8ed;
          border-radius: 10px;
          background: #eef5f7;
          color: #39738b;
        }

        .lg-activity-row.critical .lg-activity-icon {
          background: #fff0ef;
          color: #bd3029;
        }

        .lg-activity-row.ai .lg-activity-icon {
          background: #f4efff;
          color: #7954bb;
        }

        .lg-activity-row.ambulance .lg-activity-icon {
          background: #fff7e6;
          color: #a66a00;
        }

        .lg-activity-row.hospital .lg-activity-icon {
          background: #eaf8f5;
          color: #087f7a;
        }

        .lg-activity-copy {
          min-width: 0;
        }

        .lg-activity-copy strong {
          display: block;
          color: #203e53;
          font-size: 13px;
          line-height: 1.4;
        }

        .lg-activity-copy span {
          display: block;
          margin-top: 3px;
          color: #718594;
          font-size: 12px;
          line-height: 1.45;
        }

        .lg-activity-state {
          color: #8b9ba5;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: .05em;
          text-align: right;
        }

        .lg-activity-state.done {
          color: #16805f;
        }

        .lg-activity-state.live {
          color: #087f7a;
        }

        @media (max-width: 640px) {
          .lg-activity-feed {
            padding: 15px;
            border-radius: 14px;
          }

          .lg-activity-head {
            align-items: flex-start;
          }

          .lg-activity-row {
            grid-template-columns: 34px minmax(0, 1fr);
            gap: 10px;
            padding: 10px;
          }

          .lg-activity-icon {
            width: 34px;
            height: 34px;
          }

          .lg-activity-state {
            grid-column: 2;
            text-align: left;
          }

          .lg-activity-clock {
            margin-left: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .lg-activity-row {
            transition: none;
          }
        }
      `}</style>

      <div className="lg-activity-head">
        <div className="lg-activity-title">
          <Activity size={18} />
          NETWORK ACTIVITY
        </div>

        <div className="lg-activity-live">
          <span className="lg-activity-live-dot" />
          LIVE STATUS
        </div>

        <div className="lg-activity-clock">
          T+ {elapsedLabel(elapsed)}
        </div>
      </div>

      <div className="lg-activity-list">
        <AnimatePresence initial={false}>
          {BASE_EVENTS.map((event, index) => {
            const Icon = event.icon;
            const isDone = completed.has(event.key);
            const isCurrent = currentKey === event.key;

            let detail = event.detail;

            if (event.key === "hospital" && hasHospitalRequest) {
              detail = hospitalAccepted
                ? "The hospital has accepted the emergency request."
                : "The request exists; the hospital has not yet accepted.";
            }

            if (event.key === "ambulance" && !hasAmbulanceAssignment) {
              detail = hospitalAccepted
                ? "Hospital accepted; waiting for confirmed ambulance assignment."
                : "No ambulance is marked assigned before hospital acceptance.";
            }

            if (event.key === "ambulance" && hasAmbulanceAssignment) {
              detail = `Assignment exists${
                ambulanceStatus ? `; current status: ${ambulanceStatus.replaceAll("_", " ")}.` : "."
              }`;
            }

            return (
              <motion.div
                key={event.key}
                className={`lg-activity-row ${event.tone} ${
                  isDone ? "active" : ""
                }`}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
              >
                <div className="lg-activity-icon">
                  <Icon size={17} />
                </div>

                <div className="lg-activity-copy">
                  <strong>{event.label}</strong>
                  <span>{detail}</span>
                </div>

                <span
                  className={`lg-activity-state ${
                    isCurrent ? "live" : isDone ? "done" : ""
                  }`}
                >
                  {isCurrent
                    ? "CURRENT"
                    : isDone
                    ? "CONFIRMED"
                    : "WAITING"}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
