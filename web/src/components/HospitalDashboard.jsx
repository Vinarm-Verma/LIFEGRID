import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  Clock3,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wifi,
  XCircle,
} from "lucide-react";
import { authenticatedFetch, supabase } from "../auth/supabase";
import { useAuth } from "../auth/AuthContext";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

function display(value, fallback = "—") {
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value);
}

function pretty(value, fallback = "Unknown") {
  return display(value, fallback).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function validCoordinates(item) {
  if (item?.latitude == null || item?.longitude == null) return null;
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) return null;
  return { latitude, longitude };
}

async function readResponse(response, label) {
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${label} returned an invalid response.`);
  }
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || `${label} failed (${response.status}).`);
  }
  return data;
}

function Metric({ icon: Icon, label, value, detail }) {
  return (
    <article className="hd-metric">
      <div className="hd-metric-icon"><Icon size={21} /></div>
      <div className="hd-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function EmergencyCard({ item, active, onClick }) {
  const severity = String(item.severity || "").toLowerCase();
  return (
    <button
      type="button"
      className={`hd-emergency ${active ? "is-active" : ""} ${severity === "critical" ? "is-critical" : ""}`}
      onClick={onClick}
    >
      <span className="hd-emergency-icon"><AlertTriangle size={19} /></span>
      <span className="hd-emergency-content">
        <span className="hd-emergency-top">
          <strong>LG-{String(item.id).padStart(6, "0")}</strong>
          <span className={`hd-severity ${severity}`}>{pretty(item.severity, "Unspecified")}</span>
        </span>
        <strong className="hd-emergency-type">{pretty(item.emergency_type, "Emergency")}</strong>
        <span className="hd-emergency-description">{display(item.description, "No description supplied.")}</span>
        <span className="hd-emergency-meta">
          <span><Users size={13} /> {display(item.patient_count, "1")} patient(s)</span>
          <span><Clock3 size={13} /> {formatDate(item.created_at)}</span>
        </span>
        <span className="hd-response-label">Response: {pretty(item.hospital_response_status, "Requested")}</span>
      </span>
    </button>
  );
}

export default function HospitalDashboard() {
  const { role, signOut } = useAuth();
  const [hospital, setHospital] = useState(null);
  const [emergencies, setEmergencies] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [live, setLive] = useState(false);

  const selected = useMemo(
    () => emergencies.find((item) => String(item.id) === String(selectedId)) || null,
    [emergencies, selectedId]
  );

  const filteredEmergencies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emergencies.filter((item) => {
      const status = String(item.hospital_response_status || "requested").toLowerCase();
      const matchesFilter = filter === "all" || status === filter;
      const searchable = [
        item.id, item.emergency_type, item.severity, item.description,
        item.location_description, status,
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesFilter && searchable.includes(q);
    });
  }, [emergencies, search, filter]);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/hospital/incoming-emergencies`,
        { cache: "no-store" }
      );
      const data = await readResponse(response, "Hospital emergency feed");
      setHospital(data?.hospital || null);
      const next = Array.isArray(data?.emergencies) ? data.emergencies : [];
      setEmergencies(next);
      setSelectedId((current) => (
        current != null && next.some((item) => String(item.id) === String(current))
          ? current
          : (next[0]?.id ?? null)
      ));
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load hospital emergency requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (role !== "hospital") return undefined;
    void load();
    const timer = window.setInterval(() => void load(true), 10000);
    const channel = supabase
      .channel("lifegrid-hospital-dashboard")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "emergency_hospital_responses",
      }, () => void load(true))
      .on("postgres_changes", {
        event: "*", schema: "public", table: "emergencies",
      }, () => void load(true))
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [role, load]);

  async function respond(id, status) {
    if (busy !== null) return;
    setBusy(`${id}:${status}`);
    setError("");
    setMessage("");

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/emergencies/${id}/hospital-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      await readResponse(response, "Hospital response");
      setEmergencies((current) => current.map((item) =>
        String(item.id) === String(id)
          ? { ...item, hospital_response_status: status }
          : item
      ));
      setMessage(`Emergency #${id}: response recorded as ${pretty(status)}.`);
      await load(true);
    } catch (err) {
      setError(err?.message || "Unable to save the hospital response.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSignOut() {
    try {
      if (typeof signOut === "function") {
        await signOut();
      } else {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
      }
    } catch (err) {
      setError(err?.message || "Unable to sign out.");
    }
  }

  if (role !== "hospital") return null;

  const coords = selected ? validCoordinates(selected) : null;
  const currentStatus = String(selected?.hospital_response_status || "requested").toLowerCase();
  const isTerminalResponse = ["accepted", "rejected"].includes(currentStatus);

  return (
    <main className="hd-shell">
      <style>{styles}</style>
      {loading ? (
        <div className="hd-loading">
          <span className="hd-spinner" />
          <h2>Loading hospital operations</h2>
          <p>Connecting to the LIFEGRID emergency network…</p>
        </div>
      ) : (
        <div className="hd-container">
          <header className="hd-header">
            <div className="hd-brand">
              <div className="hd-logo"><Activity size={27} /></div>
              <div>
                <span className="hd-eyebrow">HOSPITAL OPERATIONS</span>
                <h1>{display(hospital?.name, "Hospital Control")}</h1>
                <p>{display(hospital?.city, "LIFEGRID network")} · Incoming emergency management</p>
              </div>
            </div>
            <div className="hd-header-actions">
              <span className={`hd-live ${live ? "is-live" : ""}`}><i />{live ? "LIVE NETWORK" : "POLLING MODE"}</span>
              <button className="hd-button hd-secondary" type="button" onClick={() => void load(true)} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? "hd-spin" : ""} /> Refresh
              </button>
              <button className="hd-button hd-danger" type="button" onClick={() => void handleSignOut()}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </header>

          {error && <div className="hd-notice hd-error" role="alert"><AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
          {message && <div className="hd-notice hd-success" role="status"><CheckCircle2 size={18} /><span>{message}</span><button type="button" onClick={() => setMessage("")} aria-label="Dismiss message">×</button></div>}

          <section className="hd-page-intro">
            <div>
              <span className="hd-eyebrow">EMERGENCY RESPONSE NETWORK</span>
              <h2>Hospital command center</h2>
              <p>Review incoming emergencies, record your response, and keep your team informed.</p>
            </div>
            <div className="hd-verification"><ShieldCheck size={20} /><div><strong>{pretty(hospital?.verification_status, "Status unavailable")}</strong><span>Provider verification</span></div></div>
          </section>

          <section className="hd-metrics">
            <Metric icon={AlertTriangle} label="INCOMING" value={emergencies.length} detail="Requests assigned to this hospital" />
            <Metric icon={BedDouble} label="EMERGENCY BEDS" value={display(hospital?.emergency_beds_available, "0")} detail="Reported facility capacity" />
            <Metric icon={Activity} label="ICU" value={display(hospital?.icu_available, "0")} detail="Reported available units" />
            <Metric icon={ShieldCheck} label="NETWORK" value={live ? "Live" : "Polling"} detail="Connection status" />
          </section>

          <section className="hd-layout">
            <aside className="hd-inbox">
              <div className="hd-section-heading">
                <div><span className="hd-eyebrow">01 / INCOMING</span><h2>Hospital requests</h2></div>
                <span className="hd-count">{filteredEmergencies.length}</span>
              </div>

              <label className="hd-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search emergency requests…" /></label>
              <label className="hd-filter-label" htmlFor="hd-filter">Response status</label>
              <select id="hd-filter" className="hd-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">All requests</option>
                <option value="requested">Requested</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>

              {filteredEmergencies.length === 0 ? (
                <div className="hd-empty"><CheckCircle2 size={34} /><strong>No matching requests</strong><p>New requests from your hospital feed will appear here.</p>{(search || filter !== "all") && <button className="hd-button hd-secondary" type="button" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button>}</div>
              ) : (
                <div className="hd-emergency-list">
                  {filteredEmergencies.map((item) => <EmergencyCard key={item.id} item={item} active={String(selectedId) === String(item.id)} onClick={() => setSelectedId(item.id)} />)}
                </div>
              )}
            </aside>

            <section className="hd-details">
              {!selected ? (
                <div className="hd-empty hd-empty-details"><ShieldCheck size={40} /><h2>Select an emergency</h2><p>Choose a request from the inbox to review its details.</p></div>
              ) : (
                <>
                  <div className="hd-detail-heading">
                    <div><span className="hd-eyebrow">02 / EMERGENCY FILE</span><h2>LG-{String(selected.id).padStart(6, "0")}</h2><p>{pretty(selected.emergency_type, "Emergency")} · Reported {formatDate(selected.created_at)}</p></div>
                    <span className={`hd-severity ${String(selected.severity || "").toLowerCase()}`}>{pretty(selected.severity, "Unspecified")}</span>
                  </div>

                  <div className="hd-facts">
                    <div><span>EMERGENCY TYPE</span><strong>{pretty(selected.emergency_type, "Emergency")}</strong></div>
                    <div><span>PEOPLE</span><strong>{display(selected.patient_count, "1")}</strong></div>
                    <div><span>PRIORITY</span><strong>{pretty(selected.severity, "Unspecified")}</strong></div>
                    <div><span>REPORTED</span><strong>{formatDate(selected.created_at)}</strong></div>
                  </div>

                  <section className="hd-info-panel"><h3><Activity size={18} /> Incident description</h3><p>{display(selected.description, "No incident description supplied.")}</p></section>
                  <section className="hd-info-panel">
                    <h3><MapPin size={18} /> Incident location</h3>
                    <p>{display(selected.location_description, coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : "Location unavailable")}</p>
                    {coords && <a className="hd-map-link" href={`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`} target="_blank" rel="noreferrer"><MapPin size={15} /> Open location in Maps</a>}
                  </section>

                  <section className="hd-decision-panel">
                    <span className="hd-eyebrow">03 / HOSPITAL DECISION</span>
                    <h3>Confirm receiving capacity</h3>
                    <p>Confirm whether your facility can receive this emergency. Clinical treatment decisions remain with authorized medical staff.</p>
                    <div className="hd-capabilities">
                      <span><CheckCircle2 size={15} /> Emergency: {hospital?.emergency_capability ? "Active" : "Unconfirmed"}</span>
                      <span><CheckCircle2 size={15} /> Trauma: {hospital?.trauma_capability ? "Active" : "Unconfirmed"}</span>
                      <span><BedDouble size={15} /> Beds: {display(hospital?.emergency_beds_available, "0")}</span>
                    </div>

                    {currentStatus === "accepted" && <div className="hd-accepted"><CheckCircle2 size={19} /><div><strong>Hospital accepted</strong><p>The response was recorded. Ambulance coordination must be handled by the configured backend workflow.</p></div></div>}
                    {currentStatus === "rejected" && <div className="hd-rejected"><XCircle size={19} /><div><strong>Request declined</strong><p>This hospital has recorded a decline for this request.</p></div></div>}

                    <div className="hd-actions">
                      <button className="hd-button hd-danger" type="button" disabled={busy !== null || isTerminalResponse} onClick={() => void respond(selected.id, "rejected")}><XCircle size={17} /> Decline</button>
                      <button className="hd-button hd-primary" type="button" disabled={busy !== null || isTerminalResponse} onClick={() => void respond(selected.id, "accepted")}>{busy ? <RefreshCw size={17} className="hd-spin" /> : <CheckCircle2 size={17} />}{busy ? "Saving…" : currentStatus === "accepted" ? "Accepted" : "Accept emergency"}</button>
                    </div>
                    <p className="hd-current-response">CURRENT RESPONSE: <strong>{pretty(currentStatus)}</strong></p>
                  </section>

                  <div className="hd-process">
                    <div className="is-done"><CheckCircle2 size={16} /><span>Emergency received</span></div>
                    <div className={isTerminalResponse ? "is-done" : ""}><ShieldCheck size={16} /><span>Hospital decision</span></div>
                    <div><Activity size={16} /><span>Coordination</span></div>
                    <div><BedDouble size={16} /><span>Patient handoff</span></div>
                  </div>
                </>
              )}
            </section>
          </section>

          <footer className="hd-footer"><span>LIFEGRID · HOSPITAL OPERATIONS</span><span><Wifi size={14} />{live ? "Realtime subscription active" : "Automatic refresh enabled"}</span><span><ShieldCheck size={14} />Authenticated workspace</span></footer>
        </div>
      )}
    </main>
  );
}

const styles = `
.hd-shell{min-height:100vh;background:#f2f6f9;color:#19344b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.hd-shell *{box-sizing:border-box}
.hd-container{width:min(1500px,calc(100% - 40px));margin:auto;padding:22px 0 30px}
.hd-header,.hd-brand,.hd-header-actions,.hd-page-intro,.hd-section-heading,.hd-detail-heading,.hd-footer{display:flex;align-items:center;justify-content:space-between;gap:16px}
.hd-header{padding:20px 22px;background:#fff;border:1px solid #dce6ed;border-radius:16px;box-shadow:0 5px 18px #203b5008}
.hd-brand{justify-content:flex-start;min-width:0}
.hd-logo{width:52px;height:52px;flex:none;display:grid;place-items:center;border-radius:14px;background:#e4f5f2;color:#078c83}
.hd-eyebrow{display:block;color:#66839a;font-size:11px;font-weight:850;letter-spacing:.1em}
.hd-brand h1{margin:5px 0;font-size:clamp(19px,2vw,26px);line-height:1.25;overflow-wrap:anywhere}
.hd-brand p,.hd-page-intro p{margin:4px 0 0;color:#6c8293;font-size:13px;line-height:1.55}
.hd-header-actions{flex-wrap:wrap;justify-content:flex-end}
.hd-live{display:flex;align-items:center;gap:7px;color:#607c8e;font-size:11px;font-weight:850;white-space:nowrap}
.hd-live i{width:8px;height:8px;border-radius:50%;background:#9eacb7}
.hd-live.is-live{color:#13815f}.hd-live.is-live i{background:#32c99a;box-shadow:0 0 0 4px #e3f8ef}
.hd-button{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;border:1px solid transparent;border-radius:9px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;transition:background .15s}
.hd-button:disabled{opacity:.55;cursor:not-allowed}
.hd-secondary{background:#fff;color:#294960;border-color:#d3e0e8}.hd-secondary:hover:not(:disabled){background:#f2f7fa}
.hd-primary{background:#087f78;color:#fff}.hd-primary:hover:not(:disabled){background:#066c66}
.hd-danger{background:#fff;color:#b33b49;border-color:#edcbd0}.hd-danger:hover:not(:disabled){background:#fff1f2}
.hd-page-intro{align-items:flex-start;margin:28px 0 17px}
.hd-page-intro h2{margin:6px 0 0;font-size:clamp(25px,3vw,34px);letter-spacing:-.035em}
.hd-page-intro p{max-width:700px;font-size:14px}
.hd-verification{display:flex;align-items:center;gap:10px;padding:12px 15px;background:#fff;border:1px solid #dce6ed;border-radius:11px;color:#07877e}
.hd-verification strong,.hd-verification span{display:block}.hd-verification strong{color:#25465d;font-size:13px}.hd-verification span{margin-top:3px;color:#718697;font-size:11px}
.hd-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}
.hd-metric{display:flex;align-items:center;gap:13px;min-width:0;padding:17px;background:#fff;border:1px solid #dce6ed;border-radius:13px}
.hd-metric-icon{width:42px;height:42px;flex:none;display:grid;place-items:center;border-radius:11px;background:#effaf7;color:#23b990}
.hd-metric-copy{min-width:0}.hd-metric-copy span,.hd-metric-copy small{display:block;color:#6b8293;font-size:10px;font-weight:800;letter-spacing:.06em}
.hd-metric-copy strong{display:block;margin:4px 0;color:#17344c;font-size:24px;overflow-wrap:anywhere}.hd-metric-copy small{font-size:11px;font-weight:500;letter-spacing:0;line-height:1.4}
.hd-layout{display:grid;grid-template-columns:minmax(310px,.82fr) minmax(0,1.4fr);align-items:start;gap:15px;margin-top:16px}
.hd-inbox,.hd-details{min-width:0;padding:19px;background:#fff;border:1px solid #dce6ed;border-radius:14px;box-shadow:0 4px 14px #203b5005}
.hd-section-heading{margin-bottom:16px}.hd-section-heading h2{margin:5px 0 0;font-size:21px;letter-spacing:-.02em}
.hd-count{min-width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:#e6f5f2;color:#07877e;font-weight:850}
.hd-search{height:42px;display:flex;align-items:center;gap:9px;padding:0 11px;border:1px solid #d9e4ea;border-radius:9px;color:#708697}
.hd-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#19344b;font:inherit;font-size:12px}
.hd-filter-label{display:block;margin:13px 0 6px;color:#526d80;font-size:12px;font-weight:750}
.hd-filter{width:100%;height:39px;padding:0 10px;border:1px solid #d9e4ea;border-radius:9px;background:#fff;color:#294960;font:inherit;font-size:12px}
.hd-emergency-list{display:grid;gap:10px;max-height:690px;overflow:auto;margin-top:13px}
.hd-emergency{width:100%;display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid #e0e9ee;border-radius:11px;background:#fff;color:inherit;text-align:left;cursor:pointer}
.hd-emergency:hover,.hd-emergency.is-active{border-color:#8acdc3;background:#f3fbf9}
.hd-emergency.is-critical{border-left:3px solid #d74b5a}
.hd-emergency-icon{width:35px;height:35px;flex:none;display:grid;place-items:center;border-radius:9px;background:#fff0f1;color:#e85a68}
.hd-emergency-content{display:block;min-width:0;flex:1}
.hd-emergency-top{display:flex;align-items:center;justify-content:space-between;gap:7px}
.hd-emergency-top>strong{font-size:11px;color:#087f78}
.hd-emergency-type{display:block;margin:7px 0;font-size:14px}
.hd-emergency-description{display:block;color:#647c8e;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.hd-emergency-meta{display:flex;flex-wrap:wrap;gap:9px;margin-top:9px;color:#6f8494;font-size:10px}
.hd-emergency-meta span{display:inline-flex;align-items:center;gap:4px}
.hd-response-label{display:block;margin-top:9px;color:#526d80;font-size:10px;font-weight:800}
.hd-severity{display:inline-flex;align-items:center;padding:5px 7px;border-radius:6px;background:#fff4df;color:#8a5b0a;font-size:10px;font-weight:850;white-space:nowrap}
.hd-severity.critical{background:#fff0f1;color:#b62f3d}.hd-severity.high{background:#fff0e4;color:#a14e14}.hd-severity.medium{background:#fff7df;color:#86620b}.hd-severity.low{background:#e9f7ee;color:#23764b}
.hd-detail-heading{align-items:flex-start;padding-bottom:17px;border-bottom:1px solid #e5edf1}
.hd-detail-heading h2{margin:5px 0 0;font-size:24px}.hd-detail-heading p{margin:6px 0 0;color:#6b8192;font-size:12px;line-height:1.5}
.hd-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:16px 0}
.hd-facts>div{min-width:0;padding:12px;background:#f5f8fa;border:1px solid #e4ecef;border-radius:9px}
.hd-facts span{display:block;color:#718797;font-size:9px;font-weight:850;letter-spacing:.06em}
.hd-facts strong{display:block;margin-top:7px;font-size:12px;overflow-wrap:anywhere}
.hd-info-panel{margin-top:11px;padding:14px;border:1px solid #e0e9ee;border-radius:10px}
.hd-info-panel h3{display:flex;align-items:center;gap:8px;margin:0;font-size:14px}.hd-info-panel h3 svg{color:#07877e}
.hd-info-panel p{margin:9px 0 0;color:#526d80;font-size:13px;line-height:1.65;overflow-wrap:anywhere}
.hd-map-link{display:inline-flex;align-items:center;gap:6px;margin-top:10px;color:#087f78;font-size:12px;font-weight:800;text-decoration:none}.hd-map-link:hover{text-decoration:underline}
.hd-decision-panel{margin-top:14px;padding:16px;border:1px solid #d1e7e2;border-radius:12px;background:#f7fbfa}
.hd-decision-panel h3{margin:5px 0 0;font-size:17px}.hd-decision-panel>p{color:#5d7587;font-size:12px;line-height:1.65}
.hd-capabilities{display:flex;flex-wrap:wrap;gap:7px}.hd-capabilities span{display:inline-flex;align-items:center;gap:5px;padding:8px;border:1px solid #dcebe6;border-radius:8px;background:#fff;color:#397263;font-size:10px;font-weight:750}
.hd-accepted,.hd-rejected{display:flex;align-items:flex-start;gap:9px;margin-top:12px;padding:11px;border-radius:9px}.hd-accepted{border:1px solid #c7e8d6;background:#eef9f2;color:#24764c}.hd-rejected{border:1px solid #f0cdd1;background:#fff1f2;color:#a52d3a}
.hd-accepted svg,.hd-rejected svg{flex:none}.hd-accepted strong,.hd-rejected strong{font-size:12px}.hd-accepted p,.hd-rejected p{margin:4px 0 0;font-size:11px;line-height:1.5}
.hd-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:16px}
.hd-current-response{margin:10px 0 0;text-align:right;color:#718697;font-size:10px;font-weight:800;letter-spacing:.04em}.hd-current-response strong{color:#087f78}
.hd-process{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:12px}
.hd-process>div{min-height:45px;display:flex;align-items:center;gap:6px;padding:8px;border:1px solid #e1e9ed;border-radius:8px;color:#718697;font-size:10px;font-weight:750}
.hd-process>div.is-done{border-color:#cbe8df;background:#f0f9f6;color:#087f78}
.hd-empty{min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:22px;text-align:center;color:#708697}
.hd-empty>svg{color:#0b9586}.hd-empty strong,.hd-empty h2{margin:0;color:#294960;font-size:15px}.hd-empty p{max-width:300px;margin:0;color:#708697;font-size:12px;line-height:1.6}
.hd-empty-details{min-height:430px}
.hd-notice{display:flex;align-items:center;gap:10px;margin-top:13px;padding:12px 14px;border-radius:9px;font-size:12px;line-height:1.5}.hd-notice span{flex:1;overflow-wrap:anywhere}.hd-notice button{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}
.hd-error{border:1px solid #f0cdd1;background:#fff0f1;color:#a52d3a}.hd-success{border:1px solid #c7e8d6;background:#eef9f2;color:#24764c}
.hd-footer{flex-wrap:wrap;margin-top:17px;color:#6b8191;font-size:10px}.hd-footer span{display:inline-flex;align-items:center;gap:5px}
.hd-loading{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#637d8e;text-align:center}.hd-loading h2{margin:0;color:#19344b}.hd-loading p{margin:0;font-size:13px}
.hd-spinner{width:34px;height:34px;border:3px solid #d8ebe6;border-top-color:#087f78;border-radius:50%;animation:hdspin .8s linear infinite}.hd-spin{animation:hdspin .8s linear infinite}@keyframes hdspin{to{transform:rotate(360deg)}}
@media(max-width:1100px){.hd-header{align-items:flex-start;flex-direction:column}.hd-header-actions{justify-content:flex-start}.hd-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.hd-layout{grid-template-columns:1fr}.hd-emergency-list{max-height:430px}}
@media(max-width:700px){.hd-container{width:calc(100% - 20px);padding-top:10px}.hd-header,.hd-inbox,.hd-details{padding:14px}.hd-page-intro{align-items:stretch;flex-direction:column;margin-top:22px}.hd-header-actions{width:100%}.hd-header-actions .hd-button{flex:1;padding:0 9px}.hd-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.hd-process{grid-template-columns:repeat(2,minmax(0,1fr))}.hd-footer{align-items:flex-start;flex-direction:column}}
@media(max-width:450px){.hd-container{width:calc(100% - 14px)}.hd-metrics{grid-template-columns:1fr}.hd-brand{align-items:flex-start}.hd-actions{flex-direction:column-reverse}.hd-actions .hd-button{width:100%}.hd-detail-heading{flex-direction:column}}
`;
