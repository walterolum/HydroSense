import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Circle,
  ZoomControl, GeoJSON, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { WaterPoint } from '../../types';
import StatusBadge from '../common/StatusBadge';

// Fix Leaflet default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const STATUS_COLORS: Record<string, string> = {
  functional: '#16a34a',
  non_functional: '#dc2626',
  needs_repair: '#ea580c',
  under_maintenance: '#d97706',
};

function createIcon(status: string) {
  const color = STATUS_COLORS[status] || '#6b7280';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -36] });
}

// ── Tile layer definitions ────────────────────────────────────────────────────
type LayerKey = 'street' | 'hot' | 'hybrid' | 'satellite' | 'terrain';

const ESRI_SAT   = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_TOPO  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
const CARTO_LABELS = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';

interface LayerDef { label: string; url: string; attribution: string; subdomains: string; maxNativeZoom: number; labelsUrl?: string; }

const BASE_LAYERS: Record<LayerKey, LayerDef> = {
  street:    { label: '🗺 Street',    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',    attribution: '© OpenStreetMap contributors', subdomains: 'abc',  maxNativeZoom: 19 },
  hot:       { label: '🏥 HOT',       url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', attribution: '© OpenStreetMap, HOT',         subdomains: 'abc',  maxNativeZoom: 19 },
  hybrid:    { label: '🛰 Hybrid',    url: ESRI_SAT,  attribution: '© Esri',                        subdomains: 'a',   maxNativeZoom: 19, labelsUrl: CARTO_LABELS },
  satellite: { label: '🌍 Satellite', url: ESRI_SAT,  attribution: '© Esri',                        subdomains: 'a',   maxNativeZoom: 19, labelsUrl: CARTO_LABELS },
  terrain:   { label: '⛰ Terrain',   url: ESRI_TOPO, attribution: '© Esri',                        subdomains: 'a',   maxNativeZoom: 19 },
};

const LAYER_ORDER: LayerKey[] = ['street', 'hot', 'hybrid', 'satellite', 'terrain'];

// ── Helpers that must render inside MapContainer ──────────────────────────────

/** Captures the Leaflet map instance into a ref (must be inside MapContainer) */
function CaptureMap({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  mapRef.current = useMap();
  return null;
}

/** Normalize string for fuzzy district matching */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Flies the map to the selected district's bounding box */
function FlyToDistrict({ district, geo }: { district?: string; geo: any }) {
  const map = useMap();
  useEffect(() => {
    if (!district || district === 'All' || !geo?.features) return;
    const feature = geo.features.find((f: any) => {
      const n = f.properties?.shapeName || f.properties?.NAME_1 || f.properties?.admin1Name || '';
      return norm(n) === norm(district) ||
             norm(n).includes(norm(district)) ||
             norm(district).includes(norm(n));
    });
    if (!feature) return;
    try {
      map.flyToBounds(L.geoJSON(feature).getBounds(), { duration: 1.2, padding: [40, 40], maxZoom: 13 });
    } catch { /* ignore invalid geometry */ }
  }, [district, geo, map]);
  return null;
}

// ── Component props ────────────────────────────────────────────────────────────

interface WaterMapProps {
  waterPoints: WaterPoint[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onSelect?: (wp: WaterPoint) => void;
  showHeatmap?: boolean;
  /** District name from filter dropdown — zooms map and highlights boundary */
  selectedDistrict?: string;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WaterMap({
  waterPoints,
  center = [1.37, 32.29],
  zoom = 7,
  height = '500px',
  onSelect,
  showHeatmap = false,
  selectedDistrict,
}: WaterMapProps) {
  const [activeLayer, setActiveLayer] = useState<LayerKey>('street');
  const [districtGeo, setDistrictGeo] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState<{ place: string; district: string } | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const hasFlewRef = useRef(false);

  // Clean up GPS watch on unmount
  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  // Fetch Uganda ADM1 (district) GeoJSON from geoBoundaries — two-step: metadata → download
  useEffect(() => {
    setGeoLoading(true);
    const FALLBACK = 'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/UGA/ADM1/geoBoundaries-UGA-ADM1.geojson';
    fetch('https://www.geoboundaries.org/api/current/gbOpen/UGA/ADM1/')
      .then(r => r.json())
      .then(meta => fetch(meta.gjDownloadURL))
      .then(r => r.json())
      .then(data => { setDistrictGeo(data); setGeoLoading(false); })
      .catch(() =>
        fetch(FALLBACK)
          .then(r => r.json())
          .then(data => { setDistrictGeo(data); setGeoLoading(false); })
          .catch(() => setGeoLoading(false))
      );
  }, []);

  // Style function for district polygons — highlights the selected one
  const geoStyle = useCallback((feature: any) => {
    const name = feature?.properties?.shapeName || feature?.properties?.NAME_1 || '';
    const isSelected =
      selectedDistrict && selectedDistrict !== 'All' &&
      (norm(name) === norm(selectedDistrict) || norm(name).includes(norm(selectedDistrict)));
    return {
      color:       isSelected ? '#2563eb' : '#94a3b8',
      weight:      isSelected ? 2.5 : 1,
      fillColor:   isSelected ? '#3b82f6' : '#64748b',
      fillOpacity: isSelected ? 0.18 : 0.04,
      dashArray:   isSelected ? undefined : '4 7',
    };
  }, [selectedDistrict]);

  // Bind tooltip showing district name on hover
  const onEachFeature = useCallback((feature: any, layer: any) => {
    const name = feature?.properties?.shapeName || feature?.properties?.NAME_1 || '';
    if (name) {
      layer.bindTooltip(`<span class="uga-district-label">${name} District</span>`, {
        permanent: false,
        direction: 'center',
        className: 'uga-district-tooltip',
        opacity: 0.95,
      });
    }
  }, []);

  // "Find My Location" — waits for GPS accuracy ≤ 50 m before flying (max 20 s wait)
  const handleLocate = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    setUserLocation(null);
    setUserAccuracy(null);
    setLocationLabel(null);
    hasFlewRef.current = false;
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);

    const GOOD_ACCURACY_M = 50;
    const startTime = Date.now();
    const MAX_WAIT_MS = 20_000;

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const acc = pos.coords.accuracy;
        setUserLocation(latlng);
        setUserAccuracy(acc);

        // Fly only once we have a good fix OR have waited long enough
        if (!hasFlewRef.current && (acc <= GOOD_ACCURACY_M || Date.now() - startTime >= MAX_WAIT_MS)) {
          hasFlewRef.current = true;
          setLocating(false);
          mapRef.current?.flyTo(latlng, 17, { duration: 1.5 });
          fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng[0]}&lon=${latlng[1]}&zoom=16&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          )
            .then(r => r.json())
            .then(data => {
              const a = data.address || {};
              const place = a.village || a.hamlet || a.suburb || a.town || a.city || a.county || 'Your Location';
              const district = a.county || a.state_district || a.state || '';
              setLocationLabel({ place, district });
            })
            .catch(() => setLocationLabel({ place: 'Your Location', district: '' }));
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const dismissLocation = () => {
    setLocationLabel(null);
    setUserLocation(null);
    setUserAccuracy(null);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const liveLocationIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:22px;height:22px;">
      <div style="
        position:absolute;inset:0;border-radius:50%;
        background:rgba(37,99,235,0.25);
        animation:pulse-ring 1.8s ease-out infinite;
        pointer-events:none;
      "></div>
      <div style="
        position:absolute;top:50%;left:50%;
        transform:translate(-50%,-50%);
        width:14px;height:14px;border-radius:50%;
        background:#2563eb;
        border:2.5px solid white;
        box-shadow:0 0 0 2px #2563eb;
        cursor:pointer;
      "></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });

  const base = BASE_LAYERS[activeLayer];

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={5}
        maxZoom={20}
        zoomControl={false}
        scrollWheelZoom
        dragging
        touchZoom
        doubleClickZoom
        style={{ height: '100%', width: '100%', touchAction: 'none' }}
        className="rounded-xl z-0"
      >
        {/* Capture map ref + helpers */}
        <CaptureMap mapRef={mapRef} />
        <ZoomControl position="bottomright" />

        {/* Base tile layer */}
        <TileLayer
          key={activeLayer}
          url={base.url}
          attribution={base.attribution}
          subdomains={base.subdomains}
          maxZoom={20}
          maxNativeZoom={base.maxNativeZoom}
        />

        {/* Village / place-name labels overlay for satellite and hybrid */}
        {base.labelsUrl && (
          <TileLayer
            key={`${activeLayer}-labels`}
            url={base.labelsUrl}
            subdomains="abcd"
            maxZoom={20}
            maxNativeZoom={19}
            attribution=""
            pane="shadowPane"
          />
        )}

        {/* Uganda district boundary polygons */}
        {districtGeo && (
          <GeoJSON
            key={`districts-${selectedDistrict ?? 'all'}`}
            data={districtGeo}
            style={geoStyle}
            onEachFeature={onEachFeature}
          />
        )}

        {/* Fly to selected district */}
        <FlyToDistrict district={selectedDistrict} geo={districtGeo} />

        {/* Water point markers */}
        {waterPoints.map(wp => (
          <Marker
            key={wp.id}
            position={[wp.lat, wp.lng]}
            icon={createIcon(wp.status)}
            eventHandlers={{ click: () => onSelect?.(wp) }}
          >
            <Popup maxWidth={280}>
              <div className="p-1">
                <h3 className="font-semibold text-gray-800 text-sm mb-1">{wp.name}</h3>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                  <span><strong>District:</strong> {wp.district}</span>
                  <span><strong>Type:</strong> {wp.type?.replace(/_/g, ' ')}</span>
                  <span><strong>Beneficiaries:</strong> {(wp.beneficiaries || 0).toLocaleString()}</span>
                  <span><strong>Score:</strong> {wp.infrastructure_score}/100</span>
                  {wp.yield_lph && <span><strong>Yield:</strong> {wp.yield_lph} L/hr</span>}
                  {wp.pump_type && <span><strong>Pump:</strong> {wp.pump_type}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={wp.status} type="water_point" />
                  {wp.solar_powered === 1 && <span className="badge bg-yellow-100 text-yellow-700">☀ Solar</span>}
                </div>
                {wp.village && (
                  <div className="text-xs text-gray-500 mt-1">📍 {wp.village}{wp.sub_county ? `, ${wp.sub_county}` : ''}</div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Live user location — accuracy circle + dot */}
        {userLocation && userAccuracy && (
          <Circle
            center={userLocation}
            radius={userAccuracy}
            pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.1, weight: 1.5, dashArray: '4 4' }}
          />
        )}
        {userLocation && (
          <Marker position={userLocation} icon={liveLocationIcon} />
        )}

        {/* Non-functional coverage radius */}
        {showHeatmap && waterPoints
          .filter(wp => wp.status === 'non_functional')
          .map(wp => (
            <Circle
              key={`heat_${wp.id}`}
              center={[wp.lat, wp.lng]}
              radius={5000}
              pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.15, weight: 1 }}
            />
          ))
        }
      </MapContainer>

      {/* ── Layer switcher (top-left overlay) ── */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {LAYER_ORDER.map(key => (
          <button
            key={key}
            onClick={() => setActiveLayer(key)}
            style={{
              padding: '5px 11px',
              borderRadius: 20,
              border: activeLayer === key ? '2px solid #2563eb' : '2px solid rgba(255,255,255,0.6)',
              background: activeLayer === key ? '#2563eb' : 'rgba(255,255,255,0.92)',
              color: activeLayer === key ? '#fff' : '#1e293b',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              backdropFilter: 'blur(4px)',
              transition: 'all 0.2s',
            }}
          >
            {BASE_LAYERS[key].label}
          </button>
        ))}
      </div>

      {/* ── Find My Location button (bottom-right, above zoom controls) ── */}
      <button
        onClick={handleLocate}
        title="Find my location — waits for accurate GPS fix"
        style={{
          position: 'absolute',
          bottom: 90,
          right: 10,
          zIndex: 1000,
          minWidth: 38,
          height: 38,
          borderRadius: locating && userAccuracy ? 20 : '50%',
          padding: locating && userAccuracy ? '0 10px' : '0',
          border: '2px solid rgba(255,255,255,0.9)',
          background: locating ? '#2563eb' : 'white',
          color: locating ? 'white' : 'inherit',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          cursor: locating ? 'default' : 'pointer',
          fontSize: locating && userAccuracy ? 11 : 18,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          transition: 'all 0.3s',
          whiteSpace: 'nowrap',
        }}
      >
        {locating
          ? (userAccuracy ? `±${Math.round(userAccuracy)}m` : '⏳')
          : '📍'}
      </button>

      {/* ── Live location label card ── */}
      {locationLabel && userLocation && (
        <div style={{
          position: 'absolute', bottom: 140, right: 10, zIndex: 1000,
          background: 'white', borderRadius: 12, padding: '8px 12px',
          boxShadow: '0 4px 18px rgba(0,0,0,0.22)', maxWidth: 220,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>📍</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {locationLabel.place}
            </div>
            {locationLabel.district && (
              <div style={{ fontSize: 11, color: '#64748b' }}>{locationLabel.district}</div>
            )}
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
              {userLocation[0].toFixed(5)}°N, {userLocation[1].toFixed(5)}°E
            </div>
            {userAccuracy && (
              <div style={{ fontSize: 10, color: userAccuracy < 30 ? '#16a34a' : userAccuracy < 100 ? '#d97706' : '#dc2626', marginTop: 1 }}>
                ±{Math.round(userAccuracy)}m accuracy
              </div>
            )}
          </div>
          <button
            onClick={dismissLocation}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}
          >×</button>
        </div>
      )}

      {/* District GeoJSON loading indicator */}
      {geoLoading && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
          background: 'rgba(255,255,255,0.92)', borderRadius: 8,
          padding: '4px 12px', fontSize: 11, color: '#64748b',
          backdropFilter: 'blur(4px)', boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
        }}>
          🗺 Loading district boundaries…
        </div>
      )}
    </div>
  );
}
