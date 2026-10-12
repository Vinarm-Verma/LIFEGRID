import { useEffect, useRef, useState } from "react";
import { authenticatedFetch, getAccessToken, supabase } from "../auth/supabase";
import {
  CheckCircle2,
  CloudOff,
  Database,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";

const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api";

async function getJson(url, signal) {
  const response = await authenticatedFetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      text || `${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

function normalizeSnapshot(data) {
  return {
    emergency: data?.emergency || null,
    ambulance: data?.ambulance || null,
    hospital: data?.hospital || null,
    ambulances: data?.ambulance ? [data.ambulance] : [],
    hospitals: data?.hospital ? [data.hospital] : [],
    resources: Array.isArray(data?.resources) ? data.resources : [],
    hospitalResponse: data?.hospitalResponse || null,
    matching: data?.matching || null,
    receivedAt: data?.receivedAt || new Date().toISOString(),
  };
}

export default function RealtimeNetworkSync({
  emergencyId,
  ambulance,
  hospital,
  onSnapshot,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  intervalMs = 5000,
}) {
  const [state, setState] = useState({
    connected: false,
    syncing: false,
    lastSync: null,
    error: "",
    cycle: 0,
  });

  const mountedRef = useRef(true);
  const onSnapshotRef = useRef(onSnapshot);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!emergencyId) {
      setState({
        connected: false,
        syncing: false,
        lastSync: null,
        error: "",
        cycle: 0,
      });
      return undefined;
    }

    let cancelled = false;
    let timerId = null;
    let channel = null;
    let websocket = null;
    let websocketReconnectTimer = null;
    let syncInFlight = false;

    const sync = async () => {
      if (cancelled || !mountedRef.current || syncInFlight) return;

      syncInFlight = true;
      const controller = new AbortController();

      setState((previous) => ({
        ...previous,
        syncing: true,
      }));

      try {
        /*
         * One authoritative backend snapshot keeps the citizen UI, provider
         * dashboards and coordinator UI on the same data contract. It also
         * avoids calling coordinator-only matching endpoints from citizen
         * sessions, which previously caused harmless but noisy 403 responses.
         */
        const data = await getJson(
          `${apiBaseUrl}/realtime/emergency/${emergencyId}`,
          controller.signal
        );

        if (cancelled || !mountedRef.current) return;

        const snapshot = normalizeSnapshot(data);

        // Preserve the initial assignment if the backend is briefly missing
        // a provider row during a transition.
        snapshot.ambulance ||= ambulance || null;
        snapshot.hospital ||= hospital || null;

        if (snapshot.ambulance) {
          snapshot.ambulances = [snapshot.ambulance];
        }
        if (snapshot.hospital) {
          snapshot.hospitals = [snapshot.hospital];
        }

        onSnapshotRef.current?.(snapshot);

        setState((previous) => ({
          ...previous,
          connected: true,
          syncing: false,
          lastSync: new Date(),
          error: "",
          cycle: previous.cycle + 1,
        }));
      } catch (error) {
        if (cancelled || !mountedRef.current) return;

        setState((previous) => ({
          ...previous,
          connected: false,
          syncing: false,
          error:
            error?.name === "AbortError"
              ? ""
              : error?.message || "Realtime sync unavailable",
        }));
      } finally {
        syncInFlight = false;
      }
    };

    const scheduleSync = () => {
      void sync();
    };

    /*
     * Backend WebSocket is the primary low-latency transport for local and
     * single-instance deployments. Supabase Realtime remains enabled as a
     * second transport, and HTTP polling is the final recovery path.
     */
    const connectWebSocket = async () => {
      if (cancelled) return;

      try {
        const token = await getAccessToken();
        if (!token) return;

        const api = new URL(apiBaseUrl, window.location.origin);
        const wsProtocol = api.protocol === "https:" ? "wss:" : "ws:";
        const basePath = api.pathname.replace(/\/api\/?$/, "");
        const websocketUrl = `${wsProtocol}//${api.host}${basePath}/api/realtime/ws/${emergencyId}`;

        websocket = new WebSocket(websocketUrl);

        websocket.onopen = () => {
          websocket?.send(JSON.stringify({ type: "auth", token }));
          setState((previous) => ({
            ...previous,
            connected: true,
            error: "",
          }));
        };

        websocket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data || "{}");
            if (payload?.type === "update" || payload?.type === "ready") {
              void sync();
            }
          } catch {
            void sync();
          }
        };

        websocket.onclose = () => {
          if (cancelled) return;
          setState((previous) => ({ ...previous, connected: false }));
          websocketReconnectTimer = window.setTimeout(connectWebSocket, 3000);
        };

        websocket.onerror = () => {
          setState((previous) => ({ ...previous, connected: false }));
        };
      } catch {
        if (!cancelled) {
          websocketReconnectTimer = window.setTimeout(connectWebSocket, 3000);
        }
      }
    };

    void connectWebSocket();

    try {
      if (supabase) {
        channel = supabase
        .channel(`lifegrid-emergency-${emergencyId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "emergencies",
            filter: `id=eq.${emergencyId}`,
          },
          scheduleSync
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "emergency_hospital_responses",
            filter: `emergency_id=eq.${emergencyId}`,
          },
          scheduleSync
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "lifegrid_dispatch_assignments",
            filter: `emergency_id=eq.${emergencyId}`,
          },
          scheduleSync
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "ambulances",
          },
          (payload) => {
            const changedId =
              payload?.new?.id ?? payload?.old?.id ?? null;
            const assignedId =
              ambulance?.id ?? null;

            if (
              assignedId == null ||
              changedId == null ||
              String(changedId) === String(assignedId)
            ) {
              scheduleSync();
            }
          }
        )
        .subscribe();
      }
    } catch {
      channel = null;
    }

    void sync();

    timerId = window.setInterval(
      sync,
      Math.max(5000, Number(intervalMs) || 5000)
    );

    return () => {
      cancelled = true;

      if (timerId) {
        window.clearInterval(timerId);
      }

      if (websocketReconnectTimer) {
        window.clearTimeout(websocketReconnectTimer);
      }

      if (websocket) {
        websocket.close();
      }

      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [
    emergencyId,
    ambulance?.id,
    hospital?.id,
    apiBaseUrl,
    intervalMs,
  ]);

  const timeLabel = state.lastSync
    ? state.lastSync.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "WAITING";

  return (
    <>
      <style>{`
        .lg-sync-bar {
          position: relative;
          z-index: 20;
          width: min(100%, 1660px);
          margin: 0 auto 14px;
          padding: 9px 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid rgba(84, 201, 255, .13);
          border-radius: 13px;
          background: rgba(3, 15, 35, .82);
          backdrop-filter: blur(12px);
          box-shadow: 0 10px 30px rgba(0,0,0,.14);
          color: #7395b5;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .09em;
        }

        .lg-sync-left,
        .lg-sync-right,
        .lg-sync-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .lg-sync-left strong {
          color: #b9d9f2;
          font-size: 9px;
          letter-spacing: .12em;
        }

        .lg-sync-status {
          color: #62e9bd;
        }

        .lg-sync-status.offline {
          color: #ff7b87;
        }

        .lg-sync-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 11px currentColor;
        }

        .lg-sync-spin {
          animation: lgSyncRotate 1s linear infinite;
        }

        .lg-sync-error {
          color: #ff7b87;
          max-width: 280px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .lg-sync-demo {
          color: #5e7f9e;
        }

        @keyframes lgSyncRotate {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 700px) {
          .lg-sync-bar {
            align-items: flex-start;
            flex-direction: column;
          }

          .lg-sync-right {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>

      <div className="lg-sync-bar">
        <div className="lg-sync-left">
          {state.syncing ? (
            <RefreshCw size={13} className="lg-sync-spin" />
          ) : (
            <Database size={13} />
          )}

          <strong>LIFEGRID REALTIME SYNC</strong>

          <span className="lg-sync-demo">
            live events + 5s recovery sync
          </span>
        </div>

        <div className="lg-sync-right">
          <span
            className={`lg-sync-status ${
              state.connected ? "" : "offline"
            }`}
          >
            <span className="lg-sync-dot" />

            {state.connected
              ? "NETWORK LINKED"
              : emergencyId
              ? "RECONNECTING"
              : "IDLE"}
          </span>

          <span>
            {state.connected ? (
              <Wifi size={12} />
            ) : (
              <WifiOff size={12} />
            )}
            {timeLabel}
          </span>

          {state.error ? (
            <span className="lg-sync-error">{state.error}</span>
          ) : state.connected ? (
            <span>
              <CheckCircle2
                size={12}
                style={{
                  verticalAlign: "middle",
                  marginRight: 4,
                }}
              />
              SYNC OK
            </span>
          ) : (
            <span>
              <CloudOff size={12} />
            </span>
          )}
        </div>
      </div>
    </>
  );
}
