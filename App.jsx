import { useState } from "react";
import { authenticatedFetch } from "./auth/supabase";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginScreen from "./auth/LoginScreen";
import ProviderWorkspace from "./components/ProviderWorkspace";
import HospitalOperationsDashboard from "./components/HospitalOperationsDashboard";
import AmbulanceDriverDashboard from "./components/AmbulanceDriverDashboard";
import CoordinatorDashboard from "./components/CoordinatorDashboard";

import { Canvas, useFrame } from "@react-three/fiber";

import {
  Float,
  OrbitControls,
  PerspectiveCamera,
  Stars,
} from "@react-three/drei";
import CommandCenter from "./components/CommandCenter";
import HospitalDashboard from "./components/HospitalDashboard";
import AmbulanceDashboard from "./components/AmbulanceDashboard";
import RealtimeNetworkSync from "./components/RealtimeNetworkSync";
import EmergencyTimeline from "./components/EmergencyTimeline";
import EmergencyActivityFeed from "./components/EmergencyActivityFeed";
import EmergencyReportModal from "./components/EmergencyReportModal";

import { motion, AnimatePresence } from "framer-motion";

import {
  Activity,
  Ambulance,
  Brain,
  Building2,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Phone,
  Radio,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
  LogOut,
} from "lucide-react";

import LifeGridMap from "./components/LifeGridMap";


const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000/api";


// ==================================================
// 3D NETWORK
// ==================================================

function NetworkNode({
  position,
  color,
  size = 0.18,
  speed = 1,
}) {
  const ref = { current: null };

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.x =
        clock.getElapsedTime() *
        0.2 *
        speed;

      ref.current.rotation.y =
        clock.getElapsedTime() *
        0.3 *
        speed;
    }
  });

  return (
    <Float
      speed={1.5 * speed}
      rotationIntensity={1}
      floatIntensity={1.2}
    >
      <mesh
        position={position}
        ref={ref}
      >
        <sphereGeometry
          args={[size, 32, 32]}
        />

        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
        />
      </mesh>
    </Float>
  );
}


function NetworkScene() {
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0, 0, 7]}
      />

      <ambientLight intensity={0.5} />

      <pointLight
        position={[0, 2, 4]}
        intensity={12}
      />

      <pointLight
        position={[-3, -2, 2]}
        intensity={8}
      />

      <Stars
        radius={80}
        depth={50}
        count={2200}
        factor={2}
        saturation={0}
        fade
        speed={0.5}
      />

      <NetworkNode
        position={[-1.8, 0.8, 0]}
        color="#ff4b5c"
        size={0.25}
        speed={1.2}
      />

      <NetworkNode
        position={[0, 1.5, 0]}
        color="#b45cff"
      />

      <NetworkNode
        position={[1.8, 0.9, 0]}
        color="#63e6be"
        size={0.18}
      />

      <NetworkNode
        position={[-0.8, -1.1, 0]}
        color="#ffd43b"
        size={0.22}
      />

      <NetworkNode
        position={[1.2, -1.2, 0]}
        color="#66d9ef"
        size={0.2}
      />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.35}
      />
    </>
  );
}


// ==================================================
// METRIC CARD
// ==================================================

function MetricCard({
  icon: Icon,
  title,
  value,
  label,
}) {
  return (
    <motion.div
      className="metric-card"
      whileHover={{
        y: -5,
        scale: 1.02,
      }}
    >
      <div className="metric-icon">
        <Icon size={21} />
      </div>

      <div>
        <div className="metric-title">
          {title}
        </div>

        <div className="metric-value">
          {value}
        </div>

        <div className="metric-label">
          {label}
        </div>
      </div>
    </motion.div>
  );
}


// ==================================================
// INTELLIGENCE CARD
// ==================================================

function IntelligenceCard({
  icon: Icon,
  title,
  text,
}) {
  return (
    <motion.div
      className="intelligence-card"
      whileHover={{
        y: -5,
      }}
    >
      <div className="intelligence-top">
        <div className="intelligence-icon">
          <Icon size={20} />
        </div>

        <span className="status-dot">
          ●
        </span>
      </div>

      <h3>{title}</h3>

      <p>{text}</p>
    </motion.div>
  );
}


// ==================================================
// EMERGENCY MODAL
// ==================================================

function EmergencyModal({
  emergency,
  loading,
  error,
  onClose,
  onCoordinate,
  coordinating,
  allowCoordinate = false,
}) {
  if (!emergency) {
    return null;
  }

  const analysis =
    emergency.analysis || {};

  const severity =
    analysis.severity ||
    emergency.severity ||
    "UNKNOWN";

  const severityScore =
    analysis.severity_score ??
    emergency.severity_score ??
    0;

  const emergencyType =
    analysis.emergency_type ||
    emergency.emergency_type ||
    "Unknown";

  const patientCount =
    analysis.patient_count ??
    emergency.patient_count ??
    0;

  const conditions =
    Array.isArray(
      analysis.conditions
    )
      ? analysis.conditions
      : [];

  const resources =
    Array.isArray(
      analysis.required_resources
    )
      ? analysis.required_resources
      : [];

  const summary =
    analysis.ai_summary ||
    emergency.ai_summary ||
    "";


  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{
          opacity: 0,
        }}
        animate={{
          opacity: 1,
        }}
        exit={{
          opacity: 0,
        }}
      >

        <motion.div
          className="emergency-modal"
          initial={{
            opacity: 0,
            scale: 0.9,
            y: 30,
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
          }}
          exit={{
            opacity: 0,
            scale: 0.9,
            y: 30,
          }}
        >

          <button
            className="modal-close"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>


          <div className="modal-header">

            <div className="modal-alert-icon">
              <ShieldAlert
                size={28}
              />
            </div>

            <div>

              <div className="modal-kicker">
                EMERGENCY INTELLIGENCE
              </div>

              <h2>
                {loading
                  ? "Processing Emergency"
                  : "Emergency Report Submitted"}
              </h2>

            </div>

          </div>


          {loading ? (
            <div className="processing-state">

              <div className="loader-ring" />

              <h3>
                AI analysing emergency...
              </h3>

              <p>
                Extracting emergency type,
                severity, conditions and
                required resources.
              </p>

            </div>
          ) : (
            <>

              {error && (
                <div className="error-box">

                  <TriangleAlert
                    size={20}
                  />

                  <div>

                    <strong>
                      Response coordination
                      issue
                    </strong>

                    <p>
                      {error}
                    </p>

                  </div>

                </div>
              )}


              <div className="severity-panel">

                <div>

                  <span>
                    AI SEVERITY
                  </span>

                  <strong
                    className={`severity-${String(
                      severity
                    ).toLowerCase()}`}
                  >
                    {String(
                      severity
                    ).toUpperCase()}
                  </strong>

                </div>


                <div className="severity-score">

                  <span>
                    SCORE
                  </span>

                  <strong>
                    {severityScore}/100
                  </strong>

                </div>

              </div>


              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  marginBottom: 16,
                  border: "1px solid rgba(97,244,213,.18)",
                  borderRadius: 12,
                  background: "rgba(97,244,213,.045)",
                }}
              >
                <MapPin size={18} />
                <div>
                  <strong style={{ display: "block", fontSize: 12 }}>
                    DEVICE LOCATION CAPTURED
                  </strong>
                  <span style={{ color: "#93a0b4", fontSize: 11 }}>
                    {Number.isFinite(emergency?.latitude) &&
                    Number.isFinite(emergency?.longitude)
                      ? `${Number(emergency.latitude).toFixed(6)}, ${Number(
                          emergency.longitude
                        ).toFixed(6)}`
                      : "GPS coordinates recorded with the emergency."}
                  </span>
                </div>
              </div>

              <div className="analysis-grid">

                <div className="analysis-item">

                  <span>
                    Emergency Type
                  </span>

                  <strong>
                    {String(
                      emergencyType
                    )
                      .replaceAll(
                        "_",
                        " "
                      )
                      .toUpperCase()}
                  </strong>

                </div>


                <div className="analysis-item">

                  <span>
                    Patients
                  </span>

                  <strong>
                    {patientCount}
                  </strong>

                </div>

              </div>


              <div className="analysis-section">

                <span>
                  Detected Conditions
                </span>

                <div className="tag-list">

                  {conditions.length ===
                  0 ? (
                    <span className="empty-tag">
                      No conditions detected
                    </span>
                  ) : (
                    conditions.map(
                      (condition) => (
                        <span
                          className="condition-tag"
                          key={condition}
                        >
                          {String(
                            condition
                          ).replaceAll(
                            "_",
                            " "
                          )}
                        </span>
                      )
                    )
                  )}

                </div>

              </div>


              <div className="analysis-section">

                <span>
                  Required Resources
                </span>

                <div className="tag-list">

                  {resources.length ===
                  0 ? (
                    <span className="empty-tag">
                      No resources identified
                    </span>
                  ) : (
                    resources.map(
                      (resource) => (
                        <span
                          className="resource-tag"
                          key={resource}
                        >
                          <Zap size={13} />

                          {String(
                            resource
                          ).replaceAll(
                            "_",
                            " "
                          )}
                        </span>
                      )
                    )
                  )}

                </div>

              </div>


              <div className="ai-summary">

                <Brain size={20} />

                <div>

                  <span>
                    AI SUMMARY
                  </span>

                  <p>
                    {summary ||
                      "AI analysis completed."}
                  </p>

                </div>

              </div>


              {allowCoordinate && !emergency.coordination && (
                <button
                  className="coordinate-button"
                  onClick={
                    onCoordinate
                  }
                  disabled={
                    coordinating ||
                    !emergency.id
                  }
                  type="button"
                >

                  {coordinating ? (
                    <>
                      <div className="button-spinner" />

                      Coordinating
                      Response...
                    </>
                  ) : (
                    <>
                      <Radio size={20} />

                      Coordinate
                      Emergency Response
                    </>
                  )}

                </button>
              )}


              {emergency.coordination && (
                <div className="coordination-success">

                  <CheckCircle2
                    size={25}
                  />

                  <div>

                    <strong>
                      Emergency Coordinated
                    </strong>

                    <p>
                      Ambulance and
                      hospital response
                      have been matched.
                    </p>

                  </div>

                </div>
              )}

            </>
          )}


          <div className="demo-notice">

            <TriangleAlert size={15} />

            LIFEGRID prototype —
            response data is simulated
            demo data.

          </div>

        </motion.div>

      </motion.div>
    </AnimatePresence>
  );
}


// ==================================================
// MAIN APP
// ==================================================

function CitizenEmergencyApp() {

  const { user, role, signOut } = useAuth();

  // IMPORTANT:
  // emergency data stays alive after
  // popup is closed.
  const [
    emergency,
    setEmergency,
  ] = useState(null);


  // Controls ONLY whether popup is visible.
  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);


  const [
    loading,
    setLoading,
  ] = useState(false);


  const [
    coordinating,
    setCoordinating,
  ] = useState(false);


  const [
    error,
    setError,
  ] = useState("");

  // Hospital response state — isolated from the existing emergency flow.
  const [hospitalResponse, setHospitalResponse] = useState("requested");
  const [ambulanceResponseStatus, setAmbulanceResponseStatus] =
    useState("assigned");

  // Step 20 — shared live snapshot from the LIFEGRID backend.
  const [liveNetwork, setLiveNetwork] = useState(null);

  // STEP 31 — real user emergency intake and device location.
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);




  // ==================================================
  // REAL SOS / EMERGENCY INTAKE
  // ==================================================

  const openEmergencyReport = () => {
    setError("");
    setReportModalOpen(true);
  };


  const closeEmergencyReport = () => {
    if (!loading && !coordinating) {
      setReportModalOpen(false);
    }
  };


  // STEP 55 — resilient browser location acquisition.
  // Desktop browsers often time out when high-accuracy GPS is requested.
  // Try a cached/network location first, then fall back to high accuracy.
  const getDeviceLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new Error(
            "This device/browser does not provide location services."
          )
        );
        return;
      }

      const locationMessage = (locationError) => {
        const messages = {
          1: "Location permission was denied. Allow location access and try SOS again.",
          2: "Your current location could not be determined. Check GPS/location services and try again.",
          3: "Location request timed out. We could not get a fresh position in time.",
        };

        return (
          messages[locationError?.code] ||
          "Unable to determine your current location."
        );
      };

      let settled = false;

      const succeed = (position) => {
        if (settled) return;
        settled = true;

        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : 0,
        });
      };

      const tryHighAccuracy = () => {
        navigator.geolocation.getCurrentPosition(
          succeed,
          (locationError) => {
            if (settled) return;
            settled = true;
            reject(new Error(locationMessage(locationError)));
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000,
          }
        );
      };

      // First request: network/cached location. This is much more reliable
      // on laptops/desktops that do not have a dedicated GPS receiver.
      navigator.geolocation.getCurrentPosition(
        succeed,
        (locationError) => {
          if (settled) return;

          // Permission denied should not trigger another prompt.
          if (locationError?.code === 1) {
            settled = true;
            reject(new Error(locationMessage(locationError)));
            return;
          }

          // Position unavailable/timeout: give the browser a longer
          // high-accuracy attempt before failing the SOS request.
          tryHighAccuracy();
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 120000,
        }
      );
    });


  const activateEmergency = async ({
    description,
    patientCount,
    emergencyType,
  }) => {
    console.log("LIFEGRID SOS activated");

    setError("");
    setModalOpen(true);
    setReportModalOpen(false);
    setEmergency(null);
    setHospitalResponse("requested");
    setAmbulanceResponseStatus("assigned");
    setLiveNetwork(null);
    setLoading(true);

    try {
      const location = await getDeviceLocation();

      setUserLocation(location);

      const safeDescription =
        String(description || "").trim();

      if (!safeDescription) {
        throw new Error(
          "Please describe what is happening before sending SOS."
        );
      }

      const numericPatientCount = Math.max(
        1,
        Number(patientCount) || 1
      );

      const response = await authenticatedFetch(
        `${API_BASE_URL}/emergencies/intelligent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description: safeDescription,
            patient_count: numericPatientCount,
            latitude: location.latitude,
            longitude: location.longitude,
            location_description:
              `Device GPS location • accuracy approximately ${Math.round(
                location.accuracy
              )} m`,
            emergency_type: emergencyType || undefined,
          }),
        }
      );

      const responseText = await response.text();

      console.log(
        "Backend status:",
        response.status
      );

      console.log(
        "Backend response:",
        responseText
      );

      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status}: ${responseText}`
        );
      }

      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "Backend returned invalid JSON."
        );
      }

      const emergencyId =
        data.id ??
        data.emergency_id ??
        data.emergency?.id ??
        data.emergency?.emergency_id;

      const analysis =
        data.analysis ||
        data.emergency?.analysis ||
        data;

      if (
        emergencyId === undefined ||
        emergencyId === null
      ) {
        throw new Error(
          "Emergency was created, but no emergency ID was returned."
        );
      }

      setEmergency({
        ...data,

        id: emergencyId,

        emergency_id: emergencyId,

        latitude:
          data.latitude ??
          data.emergency?.latitude ??
          location.latitude,

        longitude:
          data.longitude ??
          data.emergency?.longitude ??
          location.longitude,

        emergency_type:
          data.emergency_type ??
          data.emergency?.emergency_type ??
          analysis.emergency_type ??
          emergencyType,

        patient_count:
          data.patient_count ??
          data.emergency?.patient_count ??
          numericPatientCount,

        severity:
          data.severity ??
          data.emergency?.severity ??
          analysis.severity,

        analysis,

        coordination: null,
      });
    } catch (err) {
      console.error("SOS error:", err);

      setModalOpen(false);

      setError(
        err?.message ||
          "Unable to create the emergency request."
      );
    } finally {
      setLoading(false);
    }
  };


  // ==================================================
  // COORDINATE RESPONSE
  // ==================================================

  const coordinateEmergency =
    async () => {

      if (!emergency?.id) {

        setError(
          "Emergency ID is missing."
        );

        return;

      }


      setCoordinating(true);

      setError("");


      try {

        const response =
          await authenticatedFetch(
            `${API_BASE_URL}/matching/emergency/${emergency.id}/coordinate`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },
            }
          );


        const responseText =
          await response.text();


        console.log(
          "Coordination status:",
          response.status
        );


        console.log(
          "Coordination response:",
          responseText
        );


        if (!response.ok) {

          throw new Error(
            `Coordination failed (${response.status}): ${responseText}`
          );

        }


        let data;

        try {

          data =
            JSON.parse(
              responseText
            );

        } catch {

          data = {
            raw_response:
              responseText,
          };

        }


        setEmergency(
          (previous) => ({
            ...previous,

            coordination:
              data,
          })
        );


      } catch (err) {

        console.error(
          "Coordination error:",
          err
        );

        setError(
          err?.message ||
            "Unable to coordinate emergency."
        );


      } finally {

        setCoordinating(false);

      }

    };


  // ==================================================
  // CLOSE POPUP
  // ==================================================

  const closeModal =
    () => {

      if (
        !loading &&
        !coordinating
      ) {

        // IMPORTANT:
        // DO NOT DELETE emergency data.
        // Only close the popup.
        setModalOpen(false);

      }

    };


  // ==================================================
  // COORDINATION DATA
  // ==================================================

  const coordination =
    emergency?.coordination ||
    null;


  const coordinatedAmbulance =
    coordination?.recommended_ambulance ||
    coordination?.ambulance ||
    coordination?.assigned_ambulance ||
    coordination?.selected_ambulance ||
    null;


  const coordinatedHospital =
    coordination?.recommended_hospital ||
    coordination?.hospital ||
    coordination?.selected_hospital ||
    null;


  const coordinatedResources =
    Array.isArray(
      coordination?.resources
    )
      ? coordination.resources
      : [];


  const baseAmbulance =
    coordinatedAmbulance ||
    coordination?.ranked_ambulances?.[0] ||
    null;


  const baseHospital =
    coordinatedHospital ||
    coordination?.ranked_hospitals?.[0] ||
    null;


  const ambulance =
    liveNetwork?.ambulance ||
    baseAmbulance ||
    null;


  const hospital =
    liveNetwork?.hospital ||
    baseHospital ||
    null;


  return (
    <div className="lifegrid-app">

      <div className="background-grid" />


      <div className="scene">

        <Canvas>

          <NetworkScene />

        </Canvas>

      </div>


      {/* =========================================
          HEADER
      ========================================= */}

      <header className="topbar">

        <div className="brand">

          <div className="brand-symbol">
            <Activity size={25} />
          </div>

          <div>

            <div className="brand-name">
              LIFEGRID
            </div>

            <div className="brand-subtitle">
              Emergency Intelligence
              Network
            </div>

          </div>

        </div>


        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 10,
              background: "rgba(255,255,255,.03)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#61f4d5",
                boxShadow: "0 0 12px rgba(97,244,213,.8)",
              }}
            />
            <span
              style={{
                color: "#cbd4e3",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: ".05em",
                maxWidth: 210,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.email || "AUTHENTICATED USER"}
            </span>
            <span
              style={{
                color: "#61f4d5",
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: ".08em",
              }}
            >
              {String(role || "citizen").toUpperCase()}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              minHeight: 36,
              padding: "8px 11px",
              border: "1px solid rgba(255,83,100,.20)",
              borderRadius: 10,
              background: "rgba(255,83,100,.045)",
              color: "#ff9da8",
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: ".07em",
              cursor: "pointer",
            }}
            title="Sign out of LIFEGRID"
          >
            <LogOut size={15} />
            SIGN OUT
          </button>

          <div className="system-status">
            <span className="online-pulse" />
            SYSTEM ONLINE
          </div>
        </div>

      </header>


      {emergency?.id && (
        <RealtimeNetworkSync
          emergencyId={emergency.id}
          ambulance={baseAmbulance}
          hospital={baseHospital}
          onSnapshot={(snapshot) => {
            setLiveNetwork(snapshot);

            if (snapshot?.hospitalResponse?.status) {
              setHospitalResponse(snapshot.hospitalResponse.status);
            }
          }}
        />
      )}


      <main className="dashboard">


        {/* =========================================
            HERO
        ========================================= */}

        <section className="hero">

          <motion.div
            className="hero-content"
            initial={{
              opacity: 0,
              y: 30,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.8,
            }}
          >

            <div className="hero-badge">

              <Sparkles size={16} />

              INTELLIGENT
              EMERGENCY RESPONSE

            </div>


            <h1>

              One Emergency.

              <br />

              <span>
                One Intelligent Grid.
              </span>

            </h1>


            <p className="hero-description">

              LIFEGRID connects emergency
              intelligence, ambulances,
              hospitals and critical
              resources into one coordinated
              response network.

            </p>


            <button
              className="sos-button"
              onClick={
                openEmergencyReport
              }
              type="button"
            >

              <div className="sos-icon">

                <ShieldAlert
                  size={30}
                />

              </div>


              <div>

                <strong>
                  ACTIVATE SOS
                </strong>

                <span>
                  Start emergency
                  intelligence
                </span>

              </div>


              <div className="sos-arrow">
                →
              </div>

            </button>

          </motion.div>


          <div className="hero-intelligence">

            <div className="intelligence-orbit">

              <div className="orbit-ring orbit-one" />

              <div className="orbit-ring orbit-two" />

              <div className="orbit-core">

                <Brain size={42} />

              </div>

            </div>


            <div className="intelligence-copy">

              <span className="live-label">
                AI INTELLIGENCE
              </span>

              <strong>
                READY
              </strong>

              <p>
                Awaiting emergency signal
              </p>

            </div>

          </div>

        </section>


        {/* =========================================
            METRICS
        ========================================= */}

        <section className="metrics">

          <MetricCard
            icon={Ambulance}
            title="AMBULANCES"
            value="LIVE"
            label="Connected response units"
          />

          <MetricCard
            icon={Building2}
            title="HOSPITALS"
            value="LIVE"
            label="Connected facilities"
          />

          <MetricCard
            icon={Activity}
            title="RESOURCES"
            value="LIVE"
            label="Verified resources"
          />

          <MetricCard
            icon={Clock3}
            title="RESPONSE"
            value="LIVE"
            label="Real-time coordination"
          />

        </section>



        {/* =========================================
            EMERGENCY RESPONSE TIMELINE
        ========================================= */}

        {emergency?.id && (
          <EmergencyTimeline
            emergency={emergency}
            coordination={coordination}
            hospitalResponse={hospitalResponse}
          />
        )}

        {/* =========================================
            LIVE NETWORK ACTIVITY
        ========================================= */}

        {emergency?.id && (
          <EmergencyActivityFeed
            emergency={emergency}
            coordination={coordination}
            hospitalResponse={hospitalResponse}
          />
        )}

        {/* =========================================
            MAP
        ========================================= */}

        {emergency?.analysis && (

          <motion.section
            className="live-map-section"
            initial={{
              opacity: 0,
              y: 30,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.7,
            }}
          >

            <LifeGridMap

              emergency={{
                ...emergency,

                latitude:
                  emergency.latitude,

                longitude:
                  emergency.longitude,
              }}

              ambulance={
                ambulance
              }

              hospital={
                hospital
              }

              resources={
                liveNetwork?.resources?.length
                  ? liveNetwork.resources
                  : coordinatedResources
              }

            />

          </motion.section>

        )}
        {emergency?.coordination && (
  <CommandCenter
    emergency={emergency}
    ambulance={ambulance}
    hospital={hospital}
    resources={coordinatedResources}
    hospitalResponse={hospitalResponse}
  />
)}
        <HospitalDashboard
          emergency={emergency}
          ambulance={ambulance}
          hospital={hospital}
          resources={coordinatedResources}
          response={hospitalResponse}
          onResponseChange={setHospitalResponse}
        />

        {emergency?.coordination && (
          <AmbulanceDashboard
            emergency={emergency}
            ambulance={ambulance}
            hospital={hospital}
            resources={coordinatedResources}
            responseStatus={ambulanceResponseStatus}
            onResponseChange={setAmbulanceResponseStatus}
          />
        )}


        {/* =========================================
            INTELLIGENCE
        ========================================= */}

        <section className="intelligence-section">

          <div className="section-heading">

            <div>

              <span>
                NETWORK INTELLIGENCE
              </span>

              <h2>
                Response Infrastructure
              </h2>

            </div>


            <div className="live-indicator">

              <span />

              LIVE NETWORK

            </div>

          </div>


          <div className="intelligence-grid">

            <IntelligenceCard
              icon={Brain}
              title="AI TRIAGE"
              text="Understands emergency descriptions and extracts critical conditions."
            />

            <IntelligenceCard
              icon={Ambulance}
              title="AMBULANCE MATCHING"
              text="Matches emergency severity with available ambulance capabilities."
            />

            <IntelligenceCard
              icon={Building2}
              title="HOSPITAL MATCHING"
              text="Ranks facilities by capability, specialty, availability and distance."
            />

            <IntelligenceCard
              icon={MapPin}
              title="SMART ROUTING"
              text="Coordinates emergency location, ambulance and hospital response."
            />

          </div>

        </section>


        {/* =========================================
            FOOTER
        ========================================= */}

        <footer className="footer">

          <span>
            LIFEGRID v1.0
          </span>

          <span>
            Emergency Intelligence Network
          </span>

          <span>
            Decision Support •
            Not Medical Diagnosis
          </span>

        </footer>

      </main>


      {/* =========================================
          REAL EMERGENCY REPORT
      ========================================= */}

      {reportModalOpen && (
        <EmergencyReportModal
          onSubmit={activateEmergency}
          onClose={closeEmergencyReport}
          disabled={loading || coordinating}
          onCall112={() => {
            window.location.href = "tel:112";
          }}
        />
      )}


      {/* =========================================
          EMERGENCY RESULT POPUP
      ========================================= */}

      {modalOpen && (

        <EmergencyModal

          emergency={
            emergency
          }

          loading={
            loading
          }

          error={
            error
          }

          onClose={
            closeModal
          }

          onCoordinate={
            coordinateEmergency
          }

          coordinating={
            coordinating
          }

        />

      )}

    </div>
  );
}

function AuthenticatedApp() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#05070b",
          color: "#dce4f5",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <div
            className="loader-ring"
            style={{ margin: "0 auto 18px" }}
          />
          <strong
            style={{
              display: "block",
              letterSpacing: "0.12em",
            }}
          >
            CONNECTING TO LIFEGRID
          </strong>
          <span
            style={{
              display: "block",
              marginTop: 8,
              color: "#78849a",
              fontSize: 13,
            }}
          >
            Verifying your emergency network identity...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Dedicated operational workspaces by provider role.
  if (role === "hospital") {
    return <HospitalOperationsDashboard />;
  }

  if (role === "ambulance") {
    return <AmbulanceDriverDashboard />;
  }

  if (role === "resource_provider") {
    return <ProviderWorkspace />;
  }

  if (role === "coordinator" || role === "admin") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#04060b",
          color: "#e8eef8",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <CoordinatorDashboard />
      </div>
    );
  }

  return <CitizenEmergencyApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
