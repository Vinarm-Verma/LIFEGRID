import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Ambulance, BedDouble, Building2, CheckCircle2,
  Clock3, FileText, HeartPulse, LogOut, MapPin, RefreshCw, Search,
  ShieldCheck, Stethoscope, Users, Wifi, XCircle, Zap,
} from "lucide-react";
import { authenticatedFetch, supabase } from "../auth/supabase";
import { useAuth } from "../auth/AuthContext";

const API = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api").replace(/\/+$/, "");
const textValue = (value, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const labelValue = (value, fallback = "UNKNOWN") => String(value || fallback).replace(/_/g, " ").toUpperCase();
const dateValue = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};
const severityValue = (value) => {
  const v = String(value || "").toLowerCase();
  if (["critical", "emergency"].includes(v)) return "critical";
  if (["high", "urgent"].includes(v)) return "high";
  if (["medium", "moderate"].includes(v)) return "medium";
  if (["low", "minor"].includes(v)) return "low";
  return "unknown";
};
const responseValue = (item) => String(item?.hospital_response_status || "requested").toLowerCase();

async function readResponse(response, label) {
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`${label} returned an invalid JSON response.`); }
  if (!response.ok) throw new Error(data?.detail || `${label} failed (${response.status}).`);
  return data;
}

function Metric({ icon: Icon, label, value, detail }) {
  return <article className="hg-metric"><div className="hg-metric-icon"><Icon size={21} /></div><div className="hg-metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}
function StatusBadge({ status }) {
  const value = String(status || "requested").toLowerCase();
  const kind = value === "accepted" ? "accepted" : ["rejected", "declined"].includes(value) ? "rejected" : "pending";
  return <span className={`hg-status ${kind}`}><i />{labelValue(value)}</span>;
}
function IncidentCard({ item, active, onSelect }) {
  const severity = severityValue(item.severity);
  return <button type="button" className={`hg-incident ${active ? "active" : ""}`} onClick={onSelect}>
    <span className={`hg-severity-line ${severity}`} /><span className="hg-incident-icon"><AlertTriangle size={19} /></span>
    <span className="hg-incident-content">
      <span className="hg-incident-heading"><strong>LG-{String(item.id).padStart(6, "0")}</strong><span className={`hg-priority ${severity}`}>{labelValue(item.severity, "PENDING")}</span></span>
      <strong className="hg-incident-type">{labelValue(item.emergency_type, "EMERGENCY")}</strong>
      <span className="hg-incident-description">{textValue(item.description, "No description supplied.")}</span>
      <span className="hg-incident-meta"><span><Users size={13} /> {item.patient_count ?? 1} patient(s)</span><span><Clock3 size={13} /> {dateValue(item.created_at)}</span></span>
      <span className="hg-incident-footer"><StatusBadge status={responseValue(item)} /><span>{active ? "SELECTED" : "VIEW DETAILS"}</span></span>
    </span>
  </button>;
}
function EmptyState({ icon: Icon, title, description }) {
  return <div className="hg-empty"><div className="hg-empty-icon"><Icon size={30} /></div><strong>{title}</strong><p>{description}</p></div>;
}

export default function HospitalOperationsDashboard() {
  const { user, role } = useAuth();
  const [profile, setProfile] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [responseStatus, setResponseStatus] = useState("requested");
  const [dispatch, setDispatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const hospital = profile?.profile || {};

  const selected = useMemo(() => incidents.find((item) => Number(item.id) === Number(selectedId)) || null, [incidents, selectedId]);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [profileRes, incomingRes] = await Promise.all([
        authenticatedFetch(`${API}/auth/onboarding/profile`, { cache: "no-store" }),
        authenticatedFetch(`${API}/emergencies/hospital/incoming`, { cache: "no-store" }),
      ]);
      const [profileData, incomingData] = await Promise.all([
        readResponse(profileRes, "Hospital profile"),
        readResponse(incomingRes, "Incoming emergency feed"),
      ]);
      setProfile(profileData);
      const list = Array.isArray(incomingData?.emergencies) ? incomingData.emergencies : [];
      setIncidents(list);
      setSelectedId((currentId) => currentId !== null && list.some((item) => Number(item.id) === Number(currentId)) ? currentId : (list[0]?.id ?? null));
      setError("");
    } catch (err) {
      console.error("Hospital dashboard load failed:", err);
      setError(err?.message || "Unable to load hospital operations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (role !== "hospital") { setLoading(false); return undefined; }
    void load();
    const timer = window.setInterval(() => { void load(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [role, load]);

  useEffect(() => {
    if (role !== "hospital" || !user?.id) return undefined;
    const channel = supabase.channel(`hospital-operations-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "emergencies" }, () => { void load(true); })
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_hospital_responses" }, () => { void load(true); })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, [role, user?.id, load]);

  // Keep the coordination result while polling refreshes the incident object.
  // Clear it only when the user selects a different emergency.
  useEffect(() => {
    setResponseStatus(responseValue(selected));
  }, [selected?.id, selected?.hospital_response_status]);

  useEffect(() => {
    setDispatch(null);
  }, [selected?.id]);

  const filteredIncidents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return incidents.filter((item) => {
      const status = responseValue(item);
      const matchesFilter = filter === "all"
        || (filter === "pending" && ["requested", "pending"].includes(status))
        || (filter === "accepted" && status === "accepted")
        || (filter === "declined" && ["rejected", "declined"].includes(status));
      const haystack = [item.id, item.emergency_type, item.description, item.location_description, item.severity, status].filter(Boolean).join(" ").toLowerCase();
      return matchesFilter && haystack.includes(query);
    });
  }, [incidents, search, filter]);

  const pendingCount = incidents.filter((item) => ["requested", "pending"].includes(responseValue(item))).length;
  const acceptedCount = incidents.filter((item) => responseValue(item) === "accepted").length;

  async function decide(nextStatus) {
    if (!selected || busy) return;

    const hospitalId = hospital?.id;
    if (!hospitalId) {
      setError("Hospital profile ID is missing. Refresh your profile and try again.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    if (nextStatus !== "accepted") setDispatch(null);

    try {
      const result = await authenticatedFetch(
        `${API}/emergencies/${selected.id}/hospital-response`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
            hospital_id: hospitalId,
            note: nextStatus === "accepted"
              ? "Hospital accepted emergency."
              : "Hospital declined emergency.",
          }),
        }
      );

      const resultData = await readResponse(result, "Hospital response");
      const savedStatus = String(resultData?.status || nextStatus).toLowerCase();
      setResponseStatus(savedStatus);

      if (nextStatus !== "accepted") {
        setNotice("Hospital decline recorded successfully.");
        await load(true);
        return;
      }

      // Acceptance and dispatch are separate backend operations. If dispatch
      // fails, preserve the saved acceptance and explain the partial success.
      let dispatchError = null;
      try {
        const dispatchRes = await authenticatedFetch(
          `${API}/matching/emergency/${selected.id}/coordinate?hospital_id=${encodeURIComponent(hospitalId)}`,
          {
            method: "POST",
            headers: { Accept: "application/json" },
          }
        );
        const dispatchData = await readResponse(dispatchRes, "Ambulance coordination");
        setDispatch(dispatchData);

        const assigned =
          Boolean(dispatchData?.ambulance_id) ||
          Boolean(dispatchData?.recommended_ambulance?.id) ||
          Boolean(dispatchData?.ambulance?.id);

        setNotice(
          dispatchData?.message ||
          (assigned
            ? "Hospital accepted the emergency and an ambulance was assigned."
            : "Hospital acceptance was saved. Ambulance matching is pending.")
        );
      } catch (err) {
        dispatchError = err;
      }

      await load(true);

      if (dispatchError) {
        setNotice("Hospital acceptance was saved, but ambulance dispatch still needs attention.");
        setError(
          `Acceptance was recorded, but ambulance coordination failed: ${
            dispatchError?.message || "Unknown dispatch error"
          }`
        );
      }
    } catch (err) {
      console.error("Hospital response action failed:", err);
      setError(err?.message || "Unable to update hospital response.");
    } finally {
      setBusy(false);
    }
  }

  async function retryCoordination() {
    if (!selected || busy) return;

    const hospitalId = hospital?.id;
    if (!hospitalId) {
      setError("Hospital profile ID is missing. Refresh your profile and try again.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await authenticatedFetch(
        `${API}/matching/emergency/${selected.id}/coordinate?hospital_id=${encodeURIComponent(hospitalId)}`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        }
      );
      const data = await readResponse(response, "Ambulance coordination");
      setDispatch(data);
      setNotice(
        data?.message ||
        (data?.ambulance_id || data?.recommended_ambulance?.id
          ? "An ambulance has been assigned."
          : "Coordination returned. Review the current dispatch status.")
      );
      await load(true);
    } catch (err) {
      console.error("Ambulance coordination retry failed:", err);
      setError(err?.message || "Unable to retry ambulance coordination.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (err) { setError(err?.message || "Unable to sign out."); }
  }

  if (role !== "hospital") return null;
  if (loading) return <main className="hg-shell"><style>{styles}</style><div className="hg-loading"><span className="hg-spinner" /><strong>Loading hospital operations…</strong><p>Connecting to the LIFEGRID emergency network.</p></div></main>;

  const location = selected?.location_description || (selected?.latitude != null && selected?.longitude != null ? `${Number(selected.latitude).toFixed(5)}, ${Number(selected.longitude).toFixed(5)}` : "Location unavailable");
  const mapUrl = selected?.latitude != null && selected?.longitude != null ? `https://www.google.com/maps?q=${encodeURIComponent(`${selected.latitude},${selected.longitude}`)}` : null;
  const ambulance = dispatch?.recommended_ambulance || {};

  return <main className="hg-shell"><style>{styles}</style><div className="hg-container">
    <header className="hg-header">
      <div className="hg-brand"><div className="hg-logo"><Building2 size={26} /></div><div><span className="hg-eyebrow">HOSPITAL OPERATIONS</span><h1>{textValue(hospital.name, "Receiving Hospital")}</h1><p>{textValue(hospital.city, "LIFEGRID NETWORK")}{user?.email ? ` · ${user.email}` : ""}</p></div></div>
      <div className="hg-header-actions"><span className={`hg-live ${live ? "on" : ""}`}><i />{live ? "LIVE NETWORK" : "POLLING ACTIVE"}</span>
        <button className="hg-button secondary" type="button" disabled={refreshing} onClick={() => { void load(true); }}><RefreshCw size={15} className={refreshing ? "hg-spin" : ""} />{refreshing ? "REFRESHING" : "REFRESH"}</button>
        <button className="hg-button secondary" type="button" onClick={() => { void signOut(); }}><LogOut size={15} /> SIGN OUT</button>
      </div>
    </header>
    {error && <div className="hg-alert error" role="alert"><AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="hg-alert success" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
    <section className="hg-welcome"><div><span className="hg-eyebrow">FACILITY CONTROL CENTER</span><h2>Hospital response overview</h2><p>Review incoming emergencies, respond to requests and coordinate ambulance dispatch.</p></div><div className="hg-verification"><ShieldCheck size={20} /><div><span>FACILITY VERIFICATION</span><strong>{labelValue(hospital.verification_status, "UNKNOWN")}</strong></div></div></section>
    <section className="hg-stats">
      <Metric icon={AlertTriangle} label="INCOMING" value={incidents.length} detail="Requests assigned to this hospital" />
      <Metric icon={Clock3} label="AWAITING RESPONSE" value={pendingCount} detail="Requests needing review" />
      <Metric icon={CheckCircle2} label="ACCEPTED" value={acceptedCount} detail="Accepted requests" />
      <Metric icon={BedDouble} label="EMERGENCY BEDS" value={textValue(hospital.emergency_beds_available, "0")} detail="Reported available capacity" />
      <Metric icon={HeartPulse} label="ICU UNITS" value={textValue(hospital.icu_available, "0")} detail="Reported available units" />
      <Metric icon={Zap} label="VENTILATORS" value={textValue(hospital.ventilators_available, "0")} detail="Reported available units" />
    </section>
    <section className="hg-workspace">
      <aside className="hg-inbox">
        <div className="hg-inbox-heading"><div><span className="hg-eyebrow">01 / INCOMING</span><h2>Hospital requests</h2><p>Select a request to review its details.</p></div><span className="hg-count">{filteredIncidents.length}</span></div>
        <label className="hg-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, type or location…" aria-label="Search incoming emergencies" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>}</label>
        <div className="hg-filters">{[["all", "All"], ["pending", "Pending"], ["accepted", "Accepted"], ["declined", "Declined"]].map(([value, label]) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
        {filteredIncidents.length === 0
          ? <EmptyState icon={ShieldCheck} title={incidents.length ? "No matching requests" : "No incoming requests"} description={incidents.length ? "Try another search term or status filter." : "Requests assigned to your hospital will appear here."} />
          : <div className="hg-list">{filteredIncidents.map((item) => <IncidentCard key={item.id} item={item} active={Number(item.id) === Number(selectedId)} onSelect={() => setSelectedId(item.id)} />)}</div>}
        <div className="hg-inbox-footer"><span><Wifi size={14} />{live ? "Realtime connected" : "Automatic refresh active"}</span><span>5-second polling</span></div>
      </aside>
      <section className="hg-case">
        {!selected ? <EmptyState icon={FileText} title="Select an emergency" description="Choose a request from the incoming list to see its details and response options." /> : <>
          <div className="hg-case-heading"><div><span className="hg-eyebrow">02 / EMERGENCY FILE</span><h2>LG-{String(selected.id).padStart(6, "0")}</h2><p>{labelValue(selected.emergency_type, "EMERGENCY")}</p></div><span className={`hg-severity-badge ${severityValue(selected.severity)}`}>{labelValue(selected.severity, "PENDING")}</span></div>
          <div className="hg-info-grid"><div className="hg-info"><span>EMERGENCY TYPE</span><strong>{labelValue(selected.emergency_type, "EMERGENCY")}</strong></div><div className="hg-info"><span>PEOPLE INVOLVED</span><strong>{selected.patient_count ?? 1}</strong></div><div className="hg-info"><span>PRIORITY</span><strong>{labelValue(selected.severity, "PENDING")}</strong></div><div className="hg-info"><span>REPORTED</span><strong>{dateValue(selected.created_at)}</strong></div></div>
          <div className="hg-detail"><span><FileText size={16} /> INCIDENT DESCRIPTION</span><p>{textValue(selected.description, "No description supplied.")}</p></div>
          <div className="hg-location"><MapPin size={22} /><div><span>INCIDENT LOCATION</span><strong>{location}</strong></div>{mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer">Open map</a>}</div>
          <section className="hg-decision">
            <div className="hg-decision-heading"><div><span className="hg-eyebrow">03 / HOSPITAL DECISION</span><h3>Response management</h3></div><Stethoscope size={22} /></div>
            <p>Confirm whether your facility can receive this emergency. Clinical treatment decisions remain with authorized medical staff.</p>
            <div className="hg-capabilities"><span><CheckCircle2 size={15} /> Emergency: {hospital.emergency_capability ? "ACTIVE" : "UNCONFIRMED"}</span><span><CheckCircle2 size={15} /> Trauma: {hospital.trauma_capability ? "ACTIVE" : "UNCONFIRMED"}</span><span><BedDouble size={15} /> Beds: {textValue(hospital.emergency_beds_available, "0")}</span></div>
            {responseStatus === "accepted" && <div className="hg-outcome accepted"><CheckCircle2 size={20} /><div><strong>HOSPITAL ACCEPTED</strong><span>Acceptance was recorded. Review the ambulance coordination result below.</span></div></div>}
            {["rejected", "declined"].includes(responseStatus) && <div className="hg-outcome rejected"><XCircle size={20} /><div><strong>REQUEST DECLINED</strong><span>The hospital response was recorded.</span></div></div>}
            {dispatch && <div className="hg-dispatch"><div><Ambulance size={22} /><div><strong>AMBULANCE COORDINATION RESULT</strong><span>{textValue(ambulance.vehicle_number, dispatch.ambulance_id ? `Unit #${dispatch.ambulance_id}` : "Dispatch response received")}</span></div></div><div><span>DESTINATION</span><strong>{textValue(dispatch?.receiving_hospital?.name || hospital.name, "Receiving hospital")}</strong></div><div><span>UNIT STATUS</span><strong>{labelValue(ambulance.status || dispatch.status, "SEE DISPATCH RESULT")}</strong></div></div>}
            <div className="hg-actions">
              {responseStatus === "accepted" && !dispatch && (
                <button
                  type="button"
                  className="hg-button secondary"
                  disabled={busy}
                  onClick={() => { void retryCoordination(); }}
                >
                  {busy ? <RefreshCw size={17} className="hg-spin" /> : <Ambulance size={17} />}
                  {busy ? "PROCESSING…" : "RETRY AMBULANCE MATCHING"}
                </button>
              )}
              <button type="button" className="hg-button danger" disabled={busy || ["accepted", "rejected", "declined"].includes(responseStatus)} onClick={() => { void decide("rejected"); }}><XCircle size={17} /> DECLINE</button>
              <button type="button" className="hg-button primary" disabled={busy || ["accepted", "rejected", "declined"].includes(responseStatus)} onClick={() => { void decide("accepted"); }}>{busy ? <RefreshCw size={17} className="hg-spin" /> : <CheckCircle2 size={17} />}{busy ? "PROCESSING…" : "ACCEPT EMERGENCY"}</button>
            </div>
            <div className="hg-response-status">CURRENT HOSPITAL RESPONSE <StatusBadge status={responseStatus} /></div>
          </section>
          <section className="hg-timeline"><span className="hg-eyebrow">04 / RESPONSE WORKFLOW</span><h3>Emergency progress</h3><div className="hg-timeline-grid"><div className="done"><CheckCircle2 size={16} /> Request received</div><div className={["accepted", "rejected", "declined"].includes(responseStatus) ? "done" : ""}><Stethoscope size={16} /> Hospital decision</div><div className={dispatch ? "done" : ""}><Ambulance size={16} /> Ambulance coordination</div><div><BedDouble size={16} /> Patient handoff</div></div></section>
        </>}
      </section>
    </section>
    <footer className="hg-footer"><span>LIFEGRID · HOSPITAL OPERATIONS</span><span><ShieldCheck size={14} /> Authenticated facility workspace</span><span><Activity size={14} /> {live ? "Realtime connection active" : "Polling fallback active"}</span></footer>
  </div></main>;
}

const styles = `
.hg-shell{min-height:100vh;padding:24px 0;background:#f3f7f9;color:#17324d;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.hg-shell *{box-sizing:border-box}
.hg-container{width:min(1680px,calc(100% - 48px));margin:auto}
.hg-header,.hg-metric,.hg-inbox,.hg-case{background:#fff;border:1px solid #d8e5eb;box-shadow:0 7px 26px #24485a08}
.hg-header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px;border-radius:17px}
.hg-brand{display:flex;align-items:center;gap:14px;min-width:0}
.hg-logo,.hg-metric-icon,.hg-incident-icon,.hg-empty-icon{display:grid;place-items:center;flex-shrink:0;color:#07867e;background:#eaf8f5;border-radius:12px}
.hg-logo{width:54px;height:54px;border:1px solid #cbeae4}
.hg-eyebrow{display:block;color:#087f7b;font-size:10px;font-weight:850;letter-spacing:.12em}
.hg-brand h1{margin:5px 0;color:#17324d;font-size:clamp(20px,2vw,27px);overflow-wrap:anywhere}
.hg-brand p{margin:0;color:#73899a;font-size:12px;overflow-wrap:anywhere}
.hg-header-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}
.hg-live{display:inline-flex;align-items:center;gap:7px;padding:7px 9px;border-radius:7px;background:#fff6e6;color:#936516;font-size:10px;font-weight:850}
.hg-live i,.hg-status i{width:7px;height:7px;border-radius:50%;background:currentColor}
.hg-live.on{background:#e9f8ef;color:#17835c}
.hg-button{min-height:41px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 13px;border:1px solid transparent;border-radius:9px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
.hg-button:disabled{opacity:.55;cursor:not-allowed}
.hg-button.secondary{background:#fff;border-color:#d5e2e8;color:#3a566b}
.hg-button.primary{background:#087f7b;color:#fff}
.hg-button.danger{background:#fff;color:#b43f45;border-color:#efcecf}
.hg-alert{display:flex;align-items:center;gap:10px;margin-top:13px;padding:12px 14px;border-radius:10px;font-size:13px}
.hg-alert span{flex:1;overflow-wrap:anywhere}
.hg-alert button{border:0;background:transparent;color:inherit;font-size:21px;cursor:pointer}
.hg-alert.error{background:#fff0f0;border:1px solid #f0cccc;color:#9c3030}
.hg-alert.success{background:#eaf8f1;border:1px solid #c6e8d7;color:#206f51}
.hg-welcome{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:24px 0 17px}
.hg-welcome h2{margin:7px 0;color:#17324d;font-size:clamp(24px,2.7vw,33px);letter-spacing:-.035em}
.hg-welcome p{max-width:700px;margin:0;color:#637b8e;font-size:13px;line-height:1.6}
.hg-verification{display:flex;align-items:center;gap:10px;padding:13px;border:1px solid #d8e5eb;border-radius:11px;background:#fff;color:#087f7b}
.hg-verification span,.hg-info span,.hg-location span,.hg-dispatch>div>span{display:block;color:#73899a;font-size:9px;font-weight:850;letter-spacing:.07em}
.hg-verification strong{display:block;margin-top:4px;color:#28495f;font-size:12px}
.hg-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.hg-metric{display:flex;align-items:center;gap:12px;min-width:0;min-height:98px;padding:15px;border-radius:13px}
.hg-metric-icon{width:42px;height:42px}
.hg-metric-copy{min-width:0;display:grid;gap:4px}
.hg-metric-copy span{color:#708699;font-size:9px;font-weight:850;letter-spacing:.06em}
.hg-metric-copy strong{color:#17324d;font-size:23px;overflow-wrap:anywhere}
.hg-metric-copy small{color:#7890a1;font-size:10px;line-height:1.4}
.hg-workspace{display:grid;grid-template-columns:minmax(310px,.85fr) minmax(0,1.45fr);align-items:start;gap:15px;margin-top:16px}
.hg-inbox,.hg-case{min-width:0;border-radius:15px;overflow:hidden}
.hg-inbox-heading,.hg-case-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px}
.hg-inbox-heading h2{margin:6px 0;color:#17324d;font-size:21px}
.hg-inbox-heading p{margin:5px 0 0;color:#73899a;font-size:12px}
.hg-count{display:grid;place-items:center;min-width:34px;height:34px;padding:0 8px;border-radius:9px;background:#eaf8f5;color:#087f7b;font-weight:850}
.hg-search{display:flex;align-items:center;gap:9px;margin:0 15px 12px;padding:0 11px;border:1px solid #dce7eb;border-radius:9px;color:#7790a0}
.hg-search:focus-within{border-color:#72bdb6;box-shadow:0 0 0 3px #087f7b12}
.hg-search input{width:100%;min-width:0;padding:12px 0;border:0;outline:0;background:transparent;color:#17324d;font:inherit;font-size:12px}
.hg-search button{border:0;background:transparent;font-size:20px;color:#71899a;cursor:pointer}
.hg-filters{display:flex;gap:6px;padding:0 15px 14px;overflow-x:auto}
.hg-filters button{flex-shrink:0;padding:8px 10px;border:1px solid #dce6eb;border-radius:20px;background:#fff;color:#5f7789;font-size:11px;font-weight:750;cursor:pointer}
.hg-filters button.active{background:#087f7b;border-color:#087f7b;color:#fff}
.hg-list{max-height:720px;overflow:auto;border-top:1px solid #e8eef1}
.hg-incident{position:relative;display:flex;align-items:flex-start;gap:10px;width:100%;padding:15px;border:0;border-bottom:1px solid #e8eef1;background:#fff;color:inherit;text-align:left;cursor:pointer}
.hg-incident:hover{background:#f8fbfc}
.hg-incident.active{background:#f0faf8}
.hg-severity-line{position:absolute;left:0;top:0;bottom:0;width:3px}
.hg-severity-line.critical{background:#d93434}.hg-severity-line.high{background:#e57b20}.hg-severity-line.medium{background:#c69a20}.hg-severity-line.low{background:#1b9a70}.hg-severity-line.unknown{background:#9aabb4}
.hg-incident-icon{width:35px;height:35px}
.hg-incident-content{display:block;min-width:0;flex:1}
.hg-incident-heading,.hg-incident-meta,.hg-incident-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.hg-incident-heading>strong{color:#087f7b;font-size:10px}
.hg-priority{font-size:9px;font-weight:900}
.hg-priority.critical{color:#b93131}.hg-priority.high{color:#a75c12}.hg-priority.medium{color:#8e6c13}.hg-priority.low{color:#197653}.hg-priority.unknown{color:#73899a}
.hg-incident-type{display:block;margin-top:6px;color:#17324d;font-size:12px}
.hg-incident-description{display:block;margin-top:5px;color:#657d8f;font-size:11px;line-height:1.5;overflow-wrap:anywhere}
.hg-incident-meta{justify-content:flex-start;margin-top:9px;color:#7c909e;font-size:10px}
.hg-incident-meta span{display:inline-flex;align-items:center;gap:4px}
.hg-incident-footer{margin-top:10px}
.hg-incident-footer>span:last-child{color:#087f7b;font-size:9px;font-weight:850}
.hg-status{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border-radius:6px;background:#fff6e6;color:#986a1c;font-size:9px;font-weight:850}
.hg-status i{width:6px;height:6px}
.hg-status.accepted{background:#e9f8ef;color:#17835c}
.hg-status.rejected{background:#fff0f0;color:#b43f45}
.hg-inbox-footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:12px 15px;color:#8295a1;background:#fbfdfe;font-size:10px}
.hg-inbox-footer span{display:inline-flex;align-items:center;gap:5px}
.hg-case{padding:21px}
.hg-case-heading{padding:0 0 16px;border-bottom:1px solid #e7eef1}
.hg-case-heading h2{margin:6px 0;color:#17324d;font-size:26px}
.hg-case-heading p{margin:0;color:#698092;font-size:12px;font-weight:750}
.hg-severity-badge{flex-shrink:0;padding:7px 9px;border:1px solid #e1e7eb;border-radius:7px;background:#f5f8fa;color:#617786;font-size:10px;font-weight:900}
.hg-severity-badge.critical{background:#fff0f0;color:#b93131;border-color:#f0cccc}
.hg-severity-badge.high{background:#fff5e9;color:#a75c12;border-color:#f2ddc5}
.hg-severity-badge.medium{background:#fff9e7;color:#8e6c13;border-color:#eee2bb}
.hg-severity-badge.low{background:#eaf8f0;color:#197653;border-color:#cde9dc}
.hg-info-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:15px}
.hg-info{min-width:0;padding:12px;border:1px solid #e1eaee;border-radius:9px;background:#f7fafb}
.hg-info strong{display:block;margin-top:7px;color:#23465e;font-size:11px;line-height:1.5;overflow-wrap:anywhere}
.hg-detail{margin-top:9px;padding:13px;border:1px solid #e1eaee;border-radius:10px}
.hg-detail>span{display:flex;align-items:center;gap:7px;color:#087f7b;font-size:10px;font-weight:850}
.hg-detail p{margin:9px 0 0;color:#3f5b70;font-size:12px;line-height:1.65;overflow-wrap:anywhere}
.hg-location{display:flex;align-items:center;gap:11px;margin-top:9px;padding:13px;border:1px solid #dce9eb;border-radius:10px;background:#f4faf9;color:#087f7b}
.hg-location>div{min-width:0;flex:1}
.hg-location strong{display:block;margin-top:5px;color:#34566b;font-size:11px;line-height:1.5;overflow-wrap:anywhere}
.hg-location a{color:#087f7b;font-size:11px;font-weight:800;white-space:nowrap}
.hg-decision{margin-top:13px;padding:16px;border:1px solid #d1e9e3;border-radius:12px;background:#f9fcfb}
.hg-decision-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#087f7b}
.hg-decision-heading h3,.hg-timeline h3{margin:6px 0 0;color:#173d53;font-size:18px}
.hg-decision>p{color:#607c8d;font-size:12px;line-height:1.65}
.hg-capabilities{display:flex;flex-wrap:wrap;gap:7px}
.hg-capabilities>span{display:inline-flex;align-items:center;gap:5px;padding:8px;border:1px solid #d9ebe5;border-radius:7px;background:#eef8f4;color:#27765b;font-size:10px;font-weight:800}
.hg-outcome{display:flex;align-items:flex-start;gap:10px;margin-top:12px;padding:12px;border-radius:9px}
.hg-outcome.accepted{background:#eaf8f1;border:1px solid #c8e9d8;color:#16845f}
.hg-outcome.rejected{background:#fff0f0;border:1px solid #f0cccc;color:#b44343}
.hg-outcome strong,.hg-outcome span{display:block}
.hg-outcome strong{font-size:11px}
.hg-outcome span{margin-top:4px;font-size:11px;line-height:1.5}
.hg-dispatch{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px;margin-top:12px;padding:13px;border:1px solid #cce7df;border-radius:10px;background:#f0faf6}
.hg-dispatch>div:first-child{display:flex;align-items:center;gap:9px;color:#087f7b}
.hg-dispatch strong{display:block;margin-top:5px;color:#345b4d;font-size:11px;overflow-wrap:anywhere}
.hg-dispatch>div:first-child strong{margin-top:0;color:#247357;font-size:10px}
.hg-dispatch>div:first-child span{display:block;margin-top:5px;color:#4c8170;font-size:11px}
.hg-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:16px}
.hg-response-status{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-top:12px;color:#7b929e;font-size:9px;font-weight:850}
.hg-timeline{margin-top:17px;padding-top:16px;border-top:1px solid #e7eef1}
.hg-timeline-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:12px}
.hg-timeline-grid>div{display:flex;align-items:center;gap:7px;min-width:0;min-height:54px;padding:9px;border:1px solid #e1e9ed;border-radius:8px;background:#f7fafb;color:#8395a1;font-size:10px;line-height:1.4}
.hg-timeline-grid>div.done{background:#edf8f3;border-color:#d2ebdf;color:#16845f}
.hg-empty{min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:25px;text-align:center}
.hg-empty-icon{width:52px;height:52px;border-radius:14px}
.hg-empty>strong{margin-top:13px;color:#28495f;font-size:14px}
.hg-empty>p{max-width:300px;margin:8px 0 0;color:#778d9b;font-size:12px;line-height:1.6}
.hg-case>.hg-empty{min-height:420px}
.hg-footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:18px;color:#7b909d;font-size:10px}
.hg-footer span{display:inline-flex;align-items:center;gap:5px}
.hg-loading{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;color:#36586b}
.hg-loading p{color:#758b99;font-size:13px}
.hg-spinner{width:32px;height:32px;border:3px solid #dcefeb;border-top-color:#087f7b;border-radius:50%;animation:hg-spin .8s linear infinite}
.hg-spin{animation:hg-spin .8s linear infinite}
@keyframes hg-spin{to{transform:rotate(360deg)}}
@media(min-width:1500px){.hg-stats{grid-template-columns:repeat(6,minmax(0,1fr))}}
@media(max-width:1150px){.hg-workspace{grid-template-columns:minmax(280px,.85fr) minmax(0,1.15fr)}.hg-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hg-dispatch{grid-template-columns:1fr}.hg-timeline-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){.hg-container{width:calc(100% - 30px)}.hg-header{align-items:flex-start;flex-direction:column}.hg-header-actions{justify-content:flex-start;width:100%}.hg-welcome{align-items:flex-start;flex-direction:column}.hg-workspace{grid-template-columns:1fr}.hg-list{max-height:520px}}
@media(max-width:600px){.hg-shell{padding:10px 0 20px}.hg-container{width:calc(100% - 20px)}.hg-header{padding:15px}.hg-logo{width:44px;height:44px}.hg-header-actions .hg-live{width:100%;justify-content:center}.hg-welcome h2{font-size:25px}.hg-verification{width:100%}.hg-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.hg-metric{gap:8px;padding:10px;min-height:90px}.hg-metric-icon{width:33px;height:33px}.hg-metric-copy strong{font-size:19px}.hg-metric-copy small{font-size:9px}.hg-case{padding:14px}.hg-case-heading h2{font-size:22px}.hg-info-grid{gap:6px}.hg-info{padding:9px}.hg-info span{font-size:8px}.hg-info strong{font-size:10px}.hg-location{flex-wrap:wrap}.hg-location a{margin-left:32px}.hg-decision{padding:12px}.hg-actions{flex-direction:column-reverse}.hg-actions .hg-button{width:100%}.hg-response-status{justify-content:flex-start}.hg-footer{flex-direction:column}}
@media(max-width:370px){.hg-stats{grid-template-columns:1fr}.hg-timeline-grid{grid-template-columns:1fr}.hg-incident{padding:12px 9px}}
`;
