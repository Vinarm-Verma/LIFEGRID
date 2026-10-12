
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Ambulance,
  Building2,
  CheckCircle2,
  Clock3,
  Radio,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const STEPS = [
  {
    id: "sos",
    title: "SOS RECEIVED",
    description: "Emergency report was received by LIFEGRID.",
    icon: ShieldAlert,
  },
  {
    id: "analysis",
    title: "AI TRIAGE",
    description: "Emergency type and severity were analyzed.",
    icon: Sparkles,
  },
  {
    id: "ambulance",
    title: "AMBULANCE ASSIGNED",
    description: "A verified ambulance assignment was confirmed.",
    icon: Ambulance,
  },
  {
    id: "hospital",
    title: "HOSPITAL RESPONSE",
    description: "The selected hospital has been asked to respond.",
    icon: Building2,
  },
  {
    id: "enroute",
    title: "EN ROUTE",
    description: "The assigned driver has reported en-route status.",
    icon: Radio,
  },
  {
    id: "arrived",
    title: "ARRIVED",
    description: "The driver has explicitly reported arrival.",
    icon: CheckCircle2,
  },
];

function clock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60
  ).padStart(2, "0")}`;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

export default function EmergencyTimeline({
  emergency,
  coordination,
  ambulance,
  hospitalResponse,
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!emergency?.created_at) {
      setElapsed(0);
      return undefined;
    }

    const createdAt = new Date(emergency.created_at).getTime();

    if (!Number.isFinite(createdAt)) {
      setElapsed(0);
      return undefined;
    }

    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - createdAt) / 1000)));
    };

    tick();

    const timerId = window.setInterval(tick, 1000);
    return () => window.clearInterval(timerId);
  }, [emergency?.created_at]);

  const normalizedHospitalResponse = normalize(
    hospitalResponse?.status ?? hospitalResponse
  );

  const hospitalAccepted = [
    "accepted",
    "confirmed",
    "hospital_accepted",
  ].includes(normalizedHospitalResponse);

  const ambulanceStatus = normalize(ambulance?.status);

  const hasRealAmbulanceAssignment = Boolean(
    emergency?.assigned_ambulance_id ||
      emergency?.ambulance_id ||
      ambulance?.id
  );

  const hasHospitalRequest = Boolean(
    emergency?.selected_hospital_id ||
      emergency?.hospital_id ||
      hospitalResponse
  );

  const hasAnalysis = Boolean(
    emergency?.analysis ||
      emergency?.ai_summary ||
      emergency?.severity
  );

  const activeStep = useMemo(() => {
    if (!emergency) return -1;

    let step = 0;

    if (hasAnalysis) step = 1;

    if (hasHospitalRequest) step = 2;

    if (hospitalAccepted) step = 3;

    if (
      hasRealAmbulanceAssignment &&
      ["assigned", "accepted"].includes(ambulanceStatus)
    ) {
      step = 3;
    }

    if (
      hasRealAmbulanceAssignment &&
      ["en_route", "enroute", "transporting"].includes(ambulanceStatus)
    ) {
      step = 4;
    }

    if (
      hasRealAmbulanceAssignment &&
      ["arrived", "at_scene"].includes(ambulanceStatus)
    ) {
      step = 5;
    }

    return step;
  }, [
    emergency,
    hasAnalysis,
    hasHospitalRequest,
    hospitalAccepted,
    hasRealAmbulanceAssignment,
    ambulanceStatus,
  ]);

  if (!emergency) return null;

  const statusText =
    ambulanceStatus === "completed"
      ? "RESPONSE COMPLETED"
      : activeStep >= 5
      ? "AMBULANCE ARRIVED"
      : activeStep >= 4
      ? "AMBULANCE EN ROUTE"
      : hasRealAmbulanceAssignment
      ? "AMBULANCE ASSIGNED"
      : hospitalAccepted
      ? "HOSPITAL ACCEPTED"
      : hasHospitalRequest
      ? "AWAITING HOSPITAL"
      : hasAnalysis
      ? "ANALYSIS COMPLETE"
      : "REPORT RECEIVED";

  const progress = Math.max(
    0,
    Math.min(100, (Math.max(activeStep, 0) / (STEPS.length - 1)) * 100)
  );

  return (
    <section
      className="emergency-timeline clean-panel"
      aria-label="Emergency response timeline"
    >
      <div className="timeline-header">
        <div className="timeline-heading">
          <div className="timeline-heading-icon">
            <Clock3 size={22} />
          </div>

          <div>
            <span className="timeline-eyebrow">EMERGENCY RESPONSE</span>
            <h2 className="timeline-title">Live response chain</h2>
          </div>
        </div>

        <div className="timeline-live">
          <span className="timeline-live-dot" />
          <strong>{statusText}</strong>
          <span className="timeline-clock">{clock(elapsed)}</span>
        </div>
      </div>

      <div className="timeline-track">
        <div className="timeline-line" aria-hidden="true">
          <motion.div
            className="timeline-line-progress"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35 }}
          />
        </div>

        {STEPS.map((step, index) => {
          const Icon = step.icon;

          const done = index < activeStep;
          const active = index === activeStep;

          const hospitalStep = step.id === "hospital";
          const ambulanceStep = step.id === "ambulance";

          let title = step.title;
          let description = step.description;

          if (hospitalStep && !hasHospitalRequest) {
            title = "HOSPITAL MATCHING";
            description = "Waiting for a suitable receiving hospital.";
          } else if (hospitalStep && !hospitalAccepted) {
            title = "HOSPITAL REQUESTED";
            description = "Waiting for the hospital to accept or decline.";
          }

          if (ambulanceStep && !hasRealAmbulanceAssignment) {
            title = "AMBULANCE PENDING";
            description = hospitalAccepted
              ? "Hospital accepted. Waiting for a confirmed ambulance assignment."
              : "An ambulance is assigned only after hospital acceptance.";
          }

          return (
            <div
              key={step.id}
              className={`timeline-step ${done ? "done" : ""} ${
                active ? "active" : ""
              }`}
            >
              <div className="timeline-node">
                <Icon size={18} />
              </div>

              <span className="timeline-step-title">{title}</span>
              <p className="timeline-description">{description}</p>
            </div>
          );
        })}
      </div>

      <div className="timeline-footer">
        <span className="timeline-footer-status">
          <CheckCircle2 size={14} />
          {hospitalAccepted
            ? "RECEIVING FACILITY ACCEPTED"
            : hasHospitalRequest
            ? "WAITING FOR RECEIVING FACILITY"
            : "WAITING FOR HOSPITAL MATCHING"}
        </span>

        <span className="timeline-footer-note">
          Only confirmed provider updates are displayed.
        </span>
      </div>
    </section>
  );
}
