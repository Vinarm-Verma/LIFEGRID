import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";

import {
  Ambulance,
  Building2,
  Navigation,
  Radio,
  ShieldAlert,
  Zap,
} from "lucide-react";

import "leaflet/dist/leaflet.css";


// --------------------------------------------------
// ICONS
// --------------------------------------------------

const emergencyIcon = L.divIcon({
  className: "lifegrid-map-icon",
  html: `
    <div class="map-marker emergency-marker">
      <div class="marker-pulse"></div>
      <div class="marker-symbol">!</div>
    </div>
  `,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const ambulanceIcon = L.divIcon({
  className: "lifegrid-map-icon",
  html: `
    <div class="map-marker ambulance-marker">
      <div class="marker-symbol">+</div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const hospitalIcon = L.divIcon({
  className: "lifegrid-map-icon",
  html: `
    <div class="map-marker hospital-marker">
      <div class="marker-symbol">H</div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const resourceIcon = L.divIcon({
  className: "lifegrid-map-icon",
  html: `
    <div class="map-marker resource-marker">
      <div class="marker-symbol">+</div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});


// --------------------------------------------------
// MAP CAMERA
// --------------------------------------------------

function MapController({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) {
      return;
    }

    const validPoints = points
      .filter(Boolean)
      .map((point) => [
        Number(point.latitude),
        Number(point.longitude),
      ])
      .filter(
        ([lat, lng]) =>
          Number.isFinite(lat) &&
          Number.isFinite(lng)
      );

    if (validPoints.length === 0) {
      return;
    }

    const bounds = L.latLngBounds(validPoints);

    map.fitBounds(bounds, {
      padding: [70, 70],
      maxZoom: 14,
      animate: true,
    });
  }, [map, points]);

  return null;
}


// --------------------------------------------------
// DISTANCE
// --------------------------------------------------

function distanceKm(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const earthRadius = 6371;

  const lat1 =
    (Number(latitude1) * Math.PI) / 180;

  const lat2 =
    (Number(latitude2) * Math.PI) / 180;

  const deltaLat =
    ((Number(latitude2) -
      Number(latitude1)) *
      Math.PI) /
    180;

  const deltaLng =
    ((Number(longitude2) -
      Number(longitude1)) *
      Math.PI) /
    180;

  const a =
    Math.sin(deltaLat / 2) *
      Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}


// --------------------------------------------------
// SMART ROUTE
// --------------------------------------------------

async function buildRoadRoute(emergency, ambulance, hospital) {
  if (!emergency || !ambulance || !hospital) return [];

  const points = [
    [Number(ambulance.longitude), Number(ambulance.latitude)],
    [Number(emergency.longitude), Number(emergency.latitude)],
    [Number(hospital.longitude), Number(hospital.latitude)],
  ];

  if (points.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))) return [];

  const routingBase = (import.meta.env.VITE_ROUTING_URL || "https://router.project-osrm.org").replace(/\/$/, "");
  const url = `${routingBase}/route/v1/driving/${points.map(([lng, lat]) => `${lng},${lat}`).join(";")}?overview=full&geometries=geojson&steps=false`;

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
    const data = await response.json();
    const coordinates = data?.routes?.[0]?.geometry?.coordinates || [];
    return coordinates.map(([lng, lat]) => [lat, lng]);
  } catch (error) {
    console.warn("LIFEGRID road routing unavailable; showing direct live connection:", error);
    return points.map(([lng, lat]) => [lat, lng]);
  }
}


// --------------------------------------------------
// MAIN MAP
// --------------------------------------------------

export default function LifeGridMap({
  emergency,
  ambulance,
  hospital,
  resources = [],
}) {
  const [route, setRoute] = useState([]);
  const [routeSource, setRouteSource] = useState("none");

  // --------------------------------------------------
  // LIVE AMBULANCE POSITION
  // --------------------------------------------------
  // The ambulance prop is refreshed from the authenticated
  // Supabase Realtime network. The map therefore renders the
  // latest database coordinates instead of simulating movement.

  const emergencyPoint =
    emergency
      ? {
          latitude: Number(
            emergency.latitude
          ),
          longitude: Number(
            emergency.longitude
          ),
        }
      : null;

  const ambulancePoint =
    ambulance
      ? {
          latitude: Number(
            ambulance.latitude
          ),
          longitude: Number(
            ambulance.longitude
          ),
        }
      : null;

  const ambulanceStatus = String(
    ambulance?.status || "assigned"
  ).toLowerCase().replaceAll("-", "_");

  const ambulanceStatusLabel = {
    available: "AVAILABLE",
    assigned: "ASSIGNED",
    en_route: "EN ROUTE",
    arrived: "ARRIVED",
    transporting: "TRANSPORTING",
    hospital: "AT HOSPITAL",
    busy: "BUSY",
    offline: "OFFLINE",
  }[ambulanceStatus] || ambulanceStatus.replaceAll("_", " ").toUpperCase();

  const ambulanceStatusClass =
    ambulanceStatus === "en_route"
      ? "en-route"
      : ambulanceStatus === "arrived"
      ? "arrived"
      : ambulanceStatus === "transporting"
      ? "transporting"
      : ambulanceStatus === "hospital"
      ? "hospital-state"
      : "assigned";

  const hospitalPoint =
    hospital
      ? {
          latitude: Number(
            hospital.latitude
          ),
          longitude: Number(
            hospital.longitude
          ),
        }
      : null;


  useEffect(() => {
    let cancelled = false;

    async function loadRoute() {
      if (!emergencyPoint || !ambulancePoint || !hospitalPoint) {
        setRoute([]);
        setRouteSource("none");
        return;
      }

      const points = await buildRoadRoute(
        emergencyPoint,
        ambulancePoint,
        hospitalPoint
      );
      if (cancelled) return;
      setRoute(points);
      setRouteSource(points.length > 3 ? "road" : "direct");
    }

    void loadRoute();
    return () => { cancelled = true; };
  }, [
    emergencyPoint?.latitude, emergencyPoint?.longitude,
    ambulancePoint?.latitude, ambulancePoint?.longitude,
    hospitalPoint?.latitude, hospitalPoint?.longitude,
  ]);


  const mapPoints = useMemo(() => {
    const points = [];

    if (emergencyPoint) {
      points.push(
        emergencyPoint
      );
    }

    if (ambulancePoint) {
      points.push(
        ambulancePoint
      );
    }

    if (hospitalPoint) {
      points.push(
        hospitalPoint
      );
    }

    resources.forEach(
      (resource) => {
        if (
          resource.latitude != null &&
          resource.longitude != null
        ) {
          points.push({
            latitude:
              Number(
                resource.latitude
              ),
            longitude:
              Number(
                resource.longitude
              ),
          });
        }
      }
    );

    return points;
  }, [
    emergencyPoint,
    ambulancePoint,
    hospitalPoint,
    resources,
  ]);


  if (!emergencyPoint) {
    return (
      <div className="map-empty-state">
        <Navigation size={32} />

        <strong>
          Emergency Map Ready
        </strong>

        <span>
          Activate an emergency to
          display the coordinated
          response network.
        </span>
      </div>
    );
  }


  const ambulanceDistance =
    ambulancePoint
      ? distanceKm(
          ambulancePoint.latitude,
          ambulancePoint.longitude,
          emergencyPoint.latitude,
          emergencyPoint.longitude
        )
      : null;


  const hospitalDistance =
    hospitalPoint
      ? distanceKm(
          emergencyPoint.latitude,
          emergencyPoint.longitude,
          hospitalPoint.latitude,
          hospitalPoint.longitude
        )
      : null;


  const ambulanceEta =
    ambulanceDistance != null
      ? Math.max(
          2,
          Math.round(
            ambulanceDistance * 3
          )
        )
      : null;


  return (
    <div className="lifegrid-map-wrapper">

      <div className="map-header">

        <div className="map-title">

          <div className="map-title-icon">
            <Navigation size={18} />
          </div>

          <div>
            <span>
              RESPONSE NETWORK
            </span>

            <strong>
              Live road routing
            </strong>
          </div>

        </div>


        <div className="map-live-status">

          <span className="map-live-dot" />

          {routeSource === "road" ? "ROAD ROUTE ACTIVE" : "LIVE POSITIONS"}

        </div>

      </div>


      <div className="map-container">

        <MapContainer
          center={[
            emergencyPoint.latitude,
            emergencyPoint.longitude,
          ]}
          zoom={13}
          scrollWheelZoom={true}
          zoomControl={true}
          className="lifegrid-leaflet-map"
        >

          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />


          <MapController
            points={mapPoints}
          />


          {/* EMERGENCY */}

          <Circle
            center={[
              emergencyPoint.latitude,
              emergencyPoint.longitude,
            ]}
            radius={900}
            pathOptions={{
              color: "#ff5968",
              fillColor: "#ff5968",
              fillOpacity: 0.07,
              weight: 1,
            }}
          />

          <Marker
            position={[
              emergencyPoint.latitude,
              emergencyPoint.longitude,
            ]}
            icon={emergencyIcon}
          >

            <Popup>

              <div className="map-popup">

                <ShieldAlert size={20} />

                <div>
                  <strong>
                    EMERGENCY
                  </strong>

                  <span>
                    {emergency.emergency_type ||
                      "Emergency Incident"}
                  </span>

                  <small>
                    Severity:{" "}
                    {emergency.severity ||
                      "Unknown"}
                  </small>
                </div>

              </div>

            </Popup>

          </Marker>


          {/* LIVE DATABASE AMBULANCE */}

          {ambulancePoint && (
            <Marker
              position={[
                ambulancePoint.latitude,
                ambulancePoint.longitude,
              ]}
              icon={ambulanceIcon}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="map-popup">
                  <Ambulance size={20} />
                  <div>
                    <strong>LIVE AMBULANCE</strong>
                    <span>
                      {ambulance?.vehicle_number || "Assigned Unit"}
                    </span>
                    <small>{ambulanceStatusLabel} • DATABASE POSITION</small>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* HOSPITAL */}

          {hospitalPoint && (
            <Marker
              position={[
                hospitalPoint.latitude,
                hospitalPoint.longitude,
              ]}
              icon={hospitalIcon}
            >

              <Popup>

                <div className="map-popup">

                  <Building2
                    size={20}
                  />

                  <div>
                    <strong>
                      SELECTED HOSPITAL
                    </strong>

                    <span>
                      {hospital.name ||
                        "Hospital"}
                    </span>

                    <small>
                      Distance:{" "}
                      {hospitalDistance?.toFixed(
                        1
                      )} km
                    </small>
                  </div>

                </div>

              </Popup>

            </Marker>
          )}


          {/* RESOURCES */}

          {resources.map(
            (resource) => {
              if (
                resource.latitude ==
                  null ||
                resource.longitude ==
                  null
              ) {
                return null;
              }

              return (
                <Marker
                  key={
                    resource.id ||
                    `${resource.provider_name}-${resource.resource_name}`
                  }
                  position={[
                    Number(
                      resource.latitude
                    ),
                    Number(
                      resource.longitude
                    ),
                  ]}
                  icon={resourceIcon}
                >

                  <Popup>

                    <div className="map-popup">

                      <Zap size={18} />

                      <div>
                        <strong>
                          RESOURCE
                        </strong>

                        <span>
                          {resource.resource_name ||
                            resource.resource_type}
                        </span>

                        <small>
                          Available:{" "}
                          {
                            resource.quantity_available
                          }
                        </small>
                      </div>

                    </div>

                  </Popup>

                </Marker>
              );
            }
          )}


          {/* RESPONSE ROUTE */}

          {route.length > 1 && (
            <>
              <Polyline
                positions={route}
                pathOptions={{
                  color: "#54c9ff",
                  weight: 7,
                  opacity: 0.18,
                }}
              />

              <Polyline
                positions={route}
                pathOptions={{
                  color: "#54c9ff",
                  weight: 3,
                  opacity: 0.9,
                  dashArray: "10 8",
                  className: "lg-live-route",
                }}
              />
            </>
          )}

        </MapContainer>


        {/* MAP LEGEND */}

        <div className="map-legend">

          <div>
            <span className="legend-emergency" />
            Emergency
          </div>

          <div>
            <span className="legend-ambulance" />
            Ambulance
          </div>

          <div>
            <span className="legend-hospital" />
            Hospital
          </div>

          <div>
            <span className="legend-resource" />
            Resource
          </div>

        </div>

      </div>


      {/* RESPONSE INFO */}

      <div className="route-information">

        <div className="route-card">

          <div className="route-card-icon ambulance">
            <Ambulance size={20} />
          </div>

          <div>
            <span>
              LIVE AMBULANCE • {ambulanceStatusLabel}
            </span>

            <strong>
              {ambulance?.vehicle_number ||
                "Searching..."}
            </strong>

            <small>
              {ambulanceDistance != null
                ? `${ambulanceDistance.toFixed(
                    1
                  )} km from incident`
                : "Location unavailable"}
            </small>
          </div>

        </div>


        <div className="route-connector">
          <Radio size={16} />
        </div>


        <div className="route-card">

          <div className="route-card-icon emergency">
            <ShieldAlert size={20} />
          </div>

          <div>
            <span>
              INCIDENT
            </span>

            <strong>
              {emergency.severity?.toUpperCase() ||
                "ACTIVE"}
            </strong>

            <small>
              AI-coordinated emergency
            </small>
          </div>

        </div>


        <div className="route-connector">
          <Radio size={16} />
        </div>


        <div className="route-card">

          <div className="route-card-icon hospital">
            <Building2 size={20} />
          </div>

          <div>
            <span>
              DESTINATION
            </span>

            <strong>
              {hospital?.name ||
                "Hospital matching..."}
            </strong>

            <small>
              {hospitalDistance != null
                ? `${hospitalDistance.toFixed(
                    1
                  )} km from incident`
                : "Calculating route..."}
            </small>
          </div>

        </div>

      </div>


      <div className="map-disclaimer">
        <Zap size={13} />
        Ambulance coordinates and status are sourced from the
        LIFEGRID realtime database. Road geometry is provided by the configured routing service; provider positions remain live database data.
      </div>

    </div>
  );
}