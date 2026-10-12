
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Ambulance,
  Baby,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Flame,
  HeartPulse,
  LogOut,
  MapPin,
  Mic,
  Phone,
  Search,
  Shield,
  ShieldAlert,
  Siren,
  Train,
  Users,
  X,
} from "lucide-react";
import { authenticatedFetch } from "../auth/supabase";
import { useAuth } from "../auth/AuthContext";
import RealtimeNetworkSync from "./RealtimeNetworkSync";
import EmergencyTimeline from "./EmergencyTimeline";
import EmergencyActivityFeed from "./EmergencyActivityFeed";
import EmergencyReportModal from "./EmergencyReportModal";
import LifeGridMap from "./LifeGridMap";
import "./citizen-dashboard.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"
).replace(/\/$/, "");

const GOVERNMENT_CONTACTS = [
  {
    number: "112",
    title: "National Emergency",
    description: "Police, fire, health and other emergency response services.",
    category: "Emergency",
    icon: Siren,
    officialUrl: "https://112.gov.in/",
  },
  {
    number: "100",
    title: "Police",
    description: "Police emergency assistance.",
    category: "Emergency",
    icon: Shield,
    officialUrl: "https://www.india.gov.in/directory/helpline",
  },
  {
    number: "101",
    title: "Fire & Rescue",
    description: "Fire and rescue emergency services.",
    category: "Emergency",
    icon: Flame,
    officialUrl: "https://www.india.gov.in/directory/helpline",
  },
  {
    number: "102",
    title: "National Ambulance",
    description: "National Ambulance Service.",
    category: "Emergency",
    icon: Ambulance,
    officialUrl: "https://www.india.gov.in/directory/helpline",
  },
  {
    number: "1073",
    title: "Road Accident",
    description: "Road accident emergency helpline.",
    category: "Road",
    icon: Ambulance,
    officialUrl: "https://www.india.gov.in/directory/helpline",
  },
  {
    number: "1906",
    title: "LPG Leak",
    description: "LPG leak emergency helpline.",
    category: "Safety",
    icon: Flame,
    officialUrl: "https://www.india.gov.in/directory/helpline",
  },
  {
    number: "1930",
    title: "Cyber Crime",
    description: "National cybercrime and financial fraud helpline.",
    category: "Digital",
    icon: Shield,
    officialUrl: "https://www.cybercrime.gov.in/",
  },
  {
    number: "181",
    title: "Women Helpline",
    description: "Women in distress and domestic violence support.",
    category: "Support",
    icon: HeartPulse,
    officialUrl: "https://depwd.gov.in/en/others-helplines/",
  },
  {
    number: "1098",
    title: "Child Helpline",
    description: "Support for children in distress or at risk.",
    category: "Support",
    icon: Baby,
    officialUrl: "https://depwd.gov.in/en/others-helplines/",
  },
  {
    number: "14567",
    title: "Elderline",
    description: "Support for senior citizens, including rescue and protection.",
    category: "Support",
    icon: Users,
    officialUrl: "https://depwd.gov.in/en/others-helplines/",
  },
  {
    number: "139",
    title: "Railway Helpline",
    description: "Railway assistance, security and medical support.",
    category: "Travel",
    icon: Train,
    officialUrl: "https://www.india.gov.in/directory/helpline",
  },
  {
    number: "1363",
    title: "Tourist Helpline",
    description: "National tourist assistance.",
    category: "Travel",
    icon: Building2,
    officialUrl: "https://www.incredibleindia.gov.in/en/emergency",
  },
  {
    number: "1070",
    title: "Disaster Relief",
    description: "Relief Commissioner helpline for natural calamities.",
    category: "Disaster",
    icon: ShieldAlert,
    officialUrl: "https://www.india.gov.in/directory/helpline",
  },
  {
    number: "1933",
    title: "National Narcotics Helpline",
    description: "MANAS national narcotics helpline.",
    category: "Support",
    icon: HeartPulse,
    officialUrl: "https://www.india.gov.in/directory/helpline",
  },
];

const CONTACT_CATEGORIES = [
  "All",
  "Emergency",
  "Road",
  "Safety",
  "Digital",
  "Support",
  "Travel",
  "Disaster",
];

function GovernmentEmergencyDirectory() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return GOVERNMENT_CONTACTS.filter((contact) => {
      if (category !== "All" && contact.category !== category) {
        return false;
      }

      if (!normalized) return true;

      return [
        contact.number,
        contact.title,
        contact.description,
        contact.category,
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [category, query]);

  return (
    <aside
      className="citizen-government-card"
      aria-label="Government emergency contacts"
    >
      <div className="citizen-government-heading">
        <div className="citizen-government-icon">
          <Siren size={20} />
        </div>
        <div>
          <span>OFFICIAL GOVERNMENT SERVICES</span>
          <h2>Emergency support</h2>
          <p>
            Quick access to verified national helplines and official
            government websites.
          </p>
        </div>
      </div>

      <div className="citizen-urgent-contact">
        <div className="citizen-urgent-icon">
          <Phone size={19} />
        </div>
        <div className="citizen-urgent-copy">
          <span>IMMEDIATE DANGER</span>
          <a
            href="https://112.gov.in/"
            target="_blank"
            rel="noreferrer"
            className="citizen-urgent-number"
          >
            112 <ExternalLink size={13} />
          </a>
          <p>India's unified emergency response number.</p>
        </div>
        <div className="citizen-urgent-actions">
          <a
            className="citizen-contact-call citizen-contact-call-primary"
            href="tel:112"
          >
            <Phone size={15} /> Call
          </a>
          <a
            className="citizen-contact-site"
            href="https://112.gov.in/"
            target="_blank"
            rel="noreferrer"
          >
            Official site <ExternalLink size={13} />
          </a>
        </div>
      </div>

      <div className="citizen-contact-tools">
        <label className="citizen-contact-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search helpline or service"
            aria-label="Search government helplines"
          />
        </label>

        <div
          className="citizen-contact-filters"
          role="tablist"
          aria-label="Helpline categories"
        >
          {CONTACT_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="citizen-contact-list">
        {filteredContacts.map((contact) => {
          const Icon = contact.icon;

          return (
            <article className="citizen-contact-row" key={contact.number}>
              <div className="citizen-contact-icon">
                <Icon size={17} />
              </div>

              <div className="citizen-contact-main">
                <div className="citizen-contact-title-line">
                  <a
                    href={contact.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="citizen-contact-number"
                  >
                    {contact.number} <ExternalLink size={11} />
                  </a>
                  <span>{contact.category}</span>
                </div>
                <strong>{contact.title}</strong>
                <p>{contact.description}</p>
              </div>

              <a
                className="citizen-contact-call"
                href={`tel:${contact.number.replace(/[^0-9+]/g, "")}`}
                aria-label={`Call ${contact.title}`}
                title={`Call ${contact.number}`}
              >
                <Phone size={14} />
              </a>
            </article>
          );
        })}

        {!filteredContacts.length && (
          <div className="citizen-contact-empty">
            No helpline matched your search.
          </div>
        )}
      </div>

      <a
        className="citizen-full-directory"
        href="https://www.india.gov.in/directory/helpline"
        target="_blank"
        rel="noreferrer"
      >
        View complete Government of India helpline directory{" "}
        <ExternalLink size={14} />
      </a>

      <p className="citizen-government-note">
        Official numbers can vary by service or state. LIFEGRID does not
        replace government emergency services.
      </p>
    </aside>
  );
}

export default function CitizenDashboard() {
  const { user, signOut } = useAuth();

  const [emergency, setEmergency] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coordinating, setCoordinating] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [liveNetwork, setLiveNetwork] = useState(null);

  const getDeviceLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new Error("This browser does not provide location services.")
        );
        return;
      }

      const fail = (e) => {
        const messages = {
          1: "Location permission was denied. Allow location access and try again.",
          2: "Your current location could not be determined.",
          3: "Location request timed out. Try again from a device with location enabled.",
        };

        reject(
          new Error(
            messages[e?.code] || "Unable to determine your location."
          )
        );
      };

      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : 0,
          }),
        fail,
        {
          enableHighAccuracy: true,
          timeout: 2500,
          maximumAge: 60000,
        }
      );
    });

  const submitEmergency = async ({
    description,
    patientCount,
    emergencyType,
    sceneSafety,
    warningSigns,
    locationText,
  }) => {
    if (loading) return;

    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      // Try to obtain a fresh location quickly, but never block emergency
      // reporting for a long GPS timeout. A report without GPS is still saved;
      // hospital matching can remain pending until valid coordinates exist.
      let location = null;
      try {
        location = await getDeviceLocation();
      } catch (locationError) {
        console.warn("LIFEGRID location unavailable; submitting without GPS:", locationError);
      }

      const warningText =
        Array.isArray(warningSigns) && warningSigns.length
          ? warningSigns.join(", ")
          : "None reported";

      const fullDescription = [
        String(description || "").trim(),
        `Scene safety: ${sceneSafety || "Unknown"}`,
        `Critical warning signs: ${warningText}`,
      ].join("\n\n");

      const response = await authenticatedFetch(
        `${API_BASE_URL}/emergencies/intelligent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            description: fullDescription,
            patient_count: Math.max(1, Number(patientCount) || 1),
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null,
            location_description: [
              locationText?.trim() || "",
              location
                ? `Device GPS • accuracy approximately ${Math.round(location.accuracy)} m`
                : "GPS unavailable at submission; location needs confirmation",
            ].filter(Boolean).join(" • ") || null,
            emergency_type: emergencyType || undefined,
          }),
        }
      );

      const responseText = await response.text();

      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : data.detail
              ? JSON.stringify(data.detail)
              : responseText || response.statusText;

        throw new Error(
          `Emergency request failed (${response.status}): ${detail}`
        );
      }

      const id =
        data.id ??
        data.emergency_id ??
        data.emergency?.id ??
        data.emergency?.emergency_id;

      if (id == null) {
        throw new Error(
          "The server responded successfully but did not return an emergency ID. Check the backend response before submitting again."
        );
      }

      const analysis = data.analysis || data.emergency?.analysis || data;

      setEmergency({
        ...data,
        id,
        emergency_id: id,
        latitude:
          data.latitude ?? data.emergency?.latitude ?? location?.latitude ?? null,
        longitude:
          data.longitude ?? data.emergency?.longitude ?? location?.longitude ?? null,
        emergency_type:
          data.emergency_type ??
          data.emergency?.emergency_type ??
          analysis.emergency_type ??
          emergencyType,
        patient_count:
          data.patient_count ??
          data.emergency?.patient_count ??
          Math.max(1, Number(patientCount) || 1),
        severity:
          data.severity ?? data.emergency?.severity ?? analysis.severity,
        analysis,
        coordination: null,
      });

      setLiveNetwork(null);
      setReportOpen(false);
      setSuccessMessage(
        `Emergency report submitted successfully. Your reference ID is LG-${id}.`
      );
    } catch (err) {
      console.error("LIFEGRID emergency submission error", err);

      const message =
        err?.message || "Unable to create the emergency request.";

      if (
        err instanceof TypeError &&
        /fetch/i.test(message)
      ) {
        setError(
          "Cannot reach the LIFEGRID API. Check that the backend is running and its CORS settings allow http://localhost:5173. No successful submission has been confirmed."
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const coordinateEmergency = async () => {
    if (!emergency?.id || coordinating) return;

    setCoordinating(true);
    setError("");

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/matching/emergency/${emergency.id}/coordinate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      const responseText = await response.text();

      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : responseText || response.statusText;

        throw new Error(
          `Coordination failed (${response.status}): ${detail}`
        );
      }

      setEmergency((previous) =>
        previous ? { ...previous, coordination: data } : previous
      );
    } catch (err) {
      console.error("LIFEGRID coordination error", err);
      setError(err?.message || "Unable to coordinate this emergency.");
    } finally {
      setCoordinating(false);
    }
  };

  const coordination = emergency?.coordination || null;

  const liveEmergency = liveNetwork?.emergency
    ? { ...emergency, ...liveNetwork.emergency }
    : emergency;

  const ambulance =
    liveNetwork?.ambulance ||
    coordination?.recommended_ambulance ||
    coordination?.ambulance ||
    coordination?.assigned_ambulance ||
    null;

  const hospital =
    liveNetwork?.hospital ||
    coordination?.recommended_hospital ||
    coordination?.hospital ||
    coordination?.selected_hospital ||
    null;

  const hospitalResponseStatus =
    liveNetwork?.hospitalResponse?.status || null;

  const resources =
    Array.isArray(liveNetwork?.resources) && liveNetwork.resources.length
      ? liveNetwork.resources
      : Array.isArray(coordination?.resources)
        ? coordination.resources
        : [];

  return (
    <div className="citizen-shell">
      <AnimatePresence>
        {successMessage && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              zIndex: 10000,
              width: "min(420px, calc(100vw - 32px))",
              padding: "18px",
              borderRadius: "14px",
              background: "#ffffff",
              border: "1px solid #a7e8cf",
              boxShadow: "0 12px 36px rgba(15, 40, 50, 0.18)",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <CheckCircle2
              size={24}
              color="#079669"
              style={{ flexShrink: 0 }}
            />

            <div style={{ flex: 1 }}>
              <strong
                style={{
                  display: "block",
                  color: "#123c32",
                }}
              >
                Report submitted successfully
              </strong>
              <p
                style={{
                  margin: "6px 0 0",
                  color: "#49635c",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                {successMessage}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              aria-label="Dismiss confirmation"
              style={{
                border: 0,
                background: "transparent",
                cursor: "pointer",
                color: "#49635c",
              }}
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="citizen-header">
        <div className="citizen-brand">
          <div className="citizen-brand-mark">
            <Activity size={22} />
          </div>
          <div>
            <strong>LIFEGRID</strong>
            <span>Emergency Response Network</span>
          </div>
        </div>

        <div className="citizen-header-actions">
          <div className="citizen-user">
            <span className="citizen-user-dot" />
            <span>{user?.email || "Signed in"}</span>
          </div>

          <button
            className="citizen-signout"
            type="button"
            onClick={() => void signOut()}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <main className="citizen-main">
        <section className="citizen-hero">
          <div className="citizen-hero-copy">
            <div className="citizen-eyebrow">
              <span /> CITIZEN SAFETY
            </div>

            <h1>
              Get help when <span>it matters.</span>
            </h1>

            <p>
              Report an emergency with the details responders need. Use text
              or voice, share your location, and follow the response as
              connected providers update the case.
            </p>

            <div className="citizen-hero-actions">
              <button
                className="citizen-sos"
                type="button"
                onClick={() => {
                  setError("");
                  setSuccessMessage("");
                  setReportOpen(true);
                }}
              >
                <Siren size={22} />
                <span>
                  <strong>Report an emergency</strong>
                  <small>Type or speak what is happening</small>
                </span>
              </button>

              <a className="citizen-call" href="tel:112">
                <Phone size={18} /> Call 112
              </a>
            </div>

            <div className="citizen-safety-line">
              <CheckCircle2 size={17} />
              Your location is requested only when you submit an emergency.
            </div>
          </div>

          <GovernmentEmergencyDirectory />
        </section>

        <section className="citizen-quick-grid">
          <article className="citizen-quick-card">
            <div className="quick-icon teal">
              <Mic size={20} />
            </div>
            <div>
              <strong>Voice reporting</strong>
              <p>Speak your emergency instead of typing.</p>
            </div>
          </article>

          <article className="citizen-quick-card">
            <div className="quick-icon blue">
              <MapPin size={20} />
            </div>
            <div>
              <strong>Location aware</strong>
              <p>Share GPS only when an emergency is submitted.</p>
            </div>
          </article>

          <article className="citizen-quick-card">
            <div className="quick-icon red">
              <Ambulance size={20} />
            </div>
            <div>
              <strong>Response tracking</strong>
              <p>See verified response updates when available.</p>
            </div>
          </article>

          <article className="citizen-quick-card">
            <div className="quick-icon violet">
              <Building2 size={20} />
            </div>
            <div>
              <strong>Hospital coordination</strong>
              <p>Follow the hospital and ambulance response from one case.</p>
            </div>
          </article>
        </section>

        {error && (
          <div className="citizen-error" role="alert">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        {emergency?.id ? (
          <>
            <RealtimeNetworkSync
              emergencyId={emergency.id}
              ambulance={ambulance}
              hospital={hospital}
              onSnapshot={setLiveNetwork}
            />

            <section className="citizen-status-card">
              <div className="citizen-status-heading">
                <div>
                  <span className="citizen-eyebrow">
                    <span /> ACTIVE EMERGENCY
                  </span>
                  <h2>Emergency request #{emergency.id}</h2>
                </div>

                <span className="citizen-live-badge">
                  {liveNetwork ? "LIVE UPDATES" : "CONNECTING"}
                </span>
              </div>

              <div className="citizen-status-grid">
                <div>
                  <small>TYPE</small>
                  <strong>
                    {String(
                      liveEmergency?.emergency_type || "Emergency"
                    ).replaceAll("_", " ")}
                  </strong>
                </div>

                <div>
                  <small>PEOPLE</small>
                  <strong>{liveEmergency?.patient_count || 1}</strong>
                </div>

                <div>
                  <small>SEVERITY</small>
                  <strong>
                    {String(liveEmergency?.severity || "Pending").replaceAll(
                      "_",
                      " "
                    )}
                  </strong>
                </div>

                <div>
                  <small>STATUS</small>
                  <strong>
                    {String(liveEmergency?.status || "reported").replaceAll(
                      "_",
                      " "
                    )}
                  </strong>
                </div>
              </div>

              <div className="citizen-coordinated">
                <CheckCircle2 size={18} />
                <span>
                  {ambulance
                    ? "A verified ambulance has been assigned and its status will update from the provider device."
                    : hospital
                      ? "A hospital has received the emergency. Waiting for the ambulance assignment."
                      : "Emergency received. Waiting for the connected hospital and response network to act on the request."}
                </span>
              </div>
            </section>

            <section className="citizen-dashboard-grid">
              <div className="citizen-live-map">
                <LifeGridMap
                  emergency={emergency}
                  ambulance={ambulance}
                  hospital={hospital}
                  resources={resources}
                />
              </div>

              <div className="citizen-side-status">
                <div className="citizen-section-head">
                  <div>
                    <span>RESPONSE STATUS</span>
                    <h3>What happens next</h3>
                  </div>
                  <Clock3 size={20} />
                </div>

                <div className="citizen-provider-row">
                  <div className="provider-icon">
                    <Building2 size={19} />
                  </div>
                  <div>
                    <strong>Hospital</strong>
                    <p>
                      {hospital
                        ? "Hospital response received"
                        : "Waiting for hospital response"}
                    </p>
                  </div>
                  <span>{hospital ? "LIVE" : "PENDING"}</span>
                </div>

                <div className="citizen-provider-row">
                  <div className="provider-icon">
                    <Ambulance size={19} />
                  </div>
                  <div>
                    <strong>Ambulance</strong>
                    <p>
                      {ambulance
                        ? "Provider data received"
                        : "Waiting for assignment"}
                    </p>
                  </div>
                  <span>{ambulance ? "LIVE" : "PENDING"}</span>
                </div>

                <div className="citizen-provider-row">
                  <div className="provider-icon">
                    <Users size={19} />
                  </div>
                  <div>
                    <strong>Resources</strong>
                    <p>
                      {resources.length
                        ? `${resources.length} verified resource${
                            resources.length > 1 ? "s" : ""
                          } connected`
                        : "No resource response yet"}
                    </p>
                  </div>
                  <span>{resources.length ? "LIVE" : "PENDING"}</span>
                </div>
              </div>
            </section>

            <EmergencyTimeline
              emergency={liveEmergency}
              coordination={coordination}
              ambulance={ambulance}
              hospitalResponse={hospitalResponseStatus}
            />

            <EmergencyActivityFeed
              emergency={liveEmergency}
              coordination={coordination}
              ambulance={ambulance}
              hospitalResponse={hospitalResponseStatus}
            />
          </>
        ) : (
          <section className="citizen-preparedness">
            <div>
              <span>BEFORE AN EMERGENCY</span>
              <h2>Keep these details ready</h2>
            </div>

            <div className="preparedness-list">
              <div>
                <strong>Know your location</strong>
                <p>
                  Be ready to describe the address or landmark if GPS is
                  unavailable.
                </p>
              </div>

              <div>
                <strong>Describe what you see</strong>
                <p>
                  Mention consciousness, breathing, bleeding, injury and the
                  number of people involved.
                </p>
              </div>

              <div>
                <strong>Use 112 when immediate help is needed</strong>
                <p>
                  LIFEGRID complements government emergency services; it does
                  not replace them.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="citizen-footer">
        <span>LIFEGRID</span>
        <span>Emergency decision support</span>
        <span>For a real emergency, call 112.</span>
      </footer>

      <AnimatePresence>
        {reportOpen && (
          <EmergencyReportModal
            onSubmit={submitEmergency}
            onClose={() => {
              if (!loading) setReportOpen(false);
            }}
            disabled={loading}
            onCall112={() => {
              window.location.href = "tel:112";
            }}
          />
        )}
      </AnimatePresence>

      {loading && (
        <div className="citizen-loading" role="status">
          <div className="citizen-spinner" />
          <strong>Submitting emergency request</strong>
          <span>
            Sending the report securely. GPS is checked briefly and will not hold up submission.
          </span>
        </div>
      )}
    </div>
  );
}
