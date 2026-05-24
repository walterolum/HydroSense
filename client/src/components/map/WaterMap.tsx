import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Circle,
  ZoomControl, GeoJSON, useMap, useMapEvents,
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

const ESRI_SAT  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_TOPO = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';

// CartoDB label-only overlays (OSM data — good Uganda/Kampala coverage)
// dark_only_labels = white text → readable on satellite/imagery
// voyager_only_labels = coloured text → readable on light basemaps
const CARTO_DARK_LABELS  = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';
const CARTO_LIGHT_LABELS = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';

interface LayerDef { label: string; url: string; attribution: string; subdomains: string; maxNativeZoom: number; labelsUrl?: string; }

const BASE_LAYERS: Record<LayerKey, LayerDef> = {
  street:    { label: '🗺 Street',    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',    attribution: '© OpenStreetMap contributors', subdomains: 'abc',  maxNativeZoom: 19, labelsUrl: CARTO_LIGHT_LABELS },
  hot:       { label: '🏥 HOT',       url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', attribution: '© OpenStreetMap, HOT',         subdomains: 'abc',  maxNativeZoom: 19, labelsUrl: CARTO_LIGHT_LABELS },
  hybrid:    { label: '🛰 Hybrid',    url: ESRI_SAT,  attribution: '© Esri',                        subdomains: 'a',   maxNativeZoom: 19, labelsUrl: CARTO_DARK_LABELS },
  satellite: { label: '🌍 Satellite', url: ESRI_SAT,  attribution: '© Esri',                        subdomains: 'a',   maxNativeZoom: 19, labelsUrl: CARTO_DARK_LABELS },
  terrain:   { label: '⛰ Terrain',   url: ESRI_TOPO, attribution: '© Esri',                        subdomains: 'a',   maxNativeZoom: 19, labelsUrl: CARTO_LIGHT_LABELS },
};

const LAYER_ORDER: LayerKey[] = ['street', 'hot', 'hybrid', 'satellite', 'terrain'];

// ── Helpers that must render inside MapContainer ──────────────────────────────

/** Captures the Leaflet map instance into a ref (must be inside MapContainer) */
function CaptureMap({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  mapRef.current = useMap();
  return null;
}

/** Listens for map clicks and calls onPin when drop-pin mode is active */
function MapClickHandler({ active, onPin }: { active: boolean; onPin: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => { if (active) onPin(e.latlng.lat, e.latlng.lng); } });
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
  const [locationLabel, setLocationLabel] = useState<{ place: string; road: string; district: string } | null>(null);
  const [isManualPin, setIsManualPin] = useState(false);
  const [dropPinMode, setDropPinMode] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Step 1 — getCurrentPosition: zoom + name card (reliable one-shot, never hangs)
  // Step 2 — watchPosition: silently improves dot accuracy in background
  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    setUserLocation(null);
    setUserAccuracy(null);
    setLocationLabel(null);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        let bestAccuracy = pos.coords.accuracy;
        setUserLocation(latlng);
        setUserAccuracy(bestAccuracy);
        setIsManualPin(false);
        setLocating(false);
        mapRef.current?.flyTo(latlng, 17, { duration: 1.5 });
        geocode(latlng[0], latlng[1]);

        // Step 2: watch and auto-pan whenever GPS accuracy improves meaningfully
        watchIdRef.current = navigator.geolocation.watchPosition(
          wp => {
            const newLatlng: [number, number] = [wp.coords.latitude, wp.coords.longitude];
            const newAcc = wp.coords.accuracy;
            setUserLocation(newLatlng);
            setUserAccuracy(newAcc);
            if (newAcc < bestAccuracy * 0.6) {
              bestAccuracy = newAcc;
              mapRef.current?.panTo(newLatlng, { animate: true, duration: 0.8 });
              geocode(newLatlng[0], newLatlng[1]);
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 0 }
        );
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const dismissLocation = () => {
    setLocationLabel(null);
    setUserLocation(null);
    setUserAccuracy(null);
    setIsManualPin(false);
    setDropPinMode(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  // Reverse-geocode helper
  const geocode = useCallback((lat: number, lng: number) =>
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
      .then(r => r.json())
      .then(data => {
        const a = data.address || {};
        const place = a.neighbourhood || a.suburb || a.village || a.hamlet
          || a.town || a.city || a.county || 'Your Location';
        const road = a.road || a.pedestrian || a.path || '';
        const district = a.city || a.city_district || a.county || a.state_district || '';
        setLocationLabel({ place, road, district });
      })
      .catch(() => setLocationLabel({ place: 'Your Location', road: '', district: '' }))
  , []);

  // Manual pin — user taps exact spot on map
  const handleManualPin = useCallback((lat: number, lng: number) => {
    setUserLocation([lat, lng]);
    setUserAccuracy(null);
    setIsManualPin(true);
    setDropPinMode(false);
    geocode(lat, lng);
  }, [geocode]);

  // Share location via Web Share API (mobile) or copy to clipboard (desktop)
  const handleShare = useCallback(async () => {
    if (!userLocation || !locationLabel) return;
    const mapsUrl = `https://maps.google.com/?q=${userLocation[0]},${userLocation[1]}`;
    const parts = [locationLabel.place, locationLabel.road, locationLabel.district].filter(Boolean).join(', ');
    const text = `📍 ${parts}\n${userLocation[0].toFixed(5)}°N, ${userLocation[1].toFixed(5)}°E\n\nOpen in Maps: ${mapsUrl}`;
    if (navigator.share) {
      try { await navigator.share({ title: locationLabel.place, text, url: mapsUrl }); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch {}
    }
  }, [userLocation, locationLabel]);

  // Place search — forward geocode with 400 ms debounce, Uganda only
  const handleSearchInput = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(() => {
      setSearching(true);
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&countrycodes=ug&limit=6`,
        { headers: { 'Accept-Language': 'en' } }
      )
        .then(r => r.json())
        .then(data => { setSearchResults(data); setSearching(false); })
        .catch(() => setSearching(false));
    }, 400);
  }, []);

  const handleSelectPlace = useCallback((result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const latlng: [number, number] = [lat, lng];
    const a = result.address || {};
    const place = a.neighbourhood || a.suburb || a.village || a.hamlet
      || a.town || a.city || result.display_name.split(',')[0] || 'Your Location';
    const road = a.road || '';
    const district = a.city || a.county || a.state_district || '';
    setSearchQuery(place);
    setSearchResults([]);
    setUserLocation(latlng);
    setUserAccuracy(null);
    setIsManualPin(true);
    setLocationLabel({ place, road, district });
    mapRef.current?.flyTo(latlng, 16, { duration: 1.5 });
  }, []);

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
    <div style={{ position: 'relative', height, width: '100%', cursor: dropPinMode ? 'crosshair' : undefined }}>
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
        <CaptureMap mapRef={mapRef} />
        <MapClickHandler active={dropPinMode} onPin={handleManualPin} />
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

        {/* Place-name labels overlay — CartoDB OSM labels for all modes */}
        {base.labelsUrl && (
          <TileLayer
            key={`${activeLayer}-labels`}
            url={base.labelsUrl}
            subdomains="abcd"
            maxZoom={20}
            maxNativeZoom={20}
            attribution=""
            opacity={1}
            zIndex={500}
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

        {/* GPS accuracy circle — only for GPS fix, not manual pin */}
        {userLocation && userAccuracy && !isManualPin && (
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

      {/* ── Place search bar (below layer switcher) ── */}
      <div style={{ position: 'absolute', top: 56, left: 12, zIndex: 1000, width: 270 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Search a place in Uganda…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 34px 8px 32px',
              borderRadius: 10, border: 'none',
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
              fontSize: 12, outline: 'none', color: '#1e293b',
            }}
          />
          {(searching) && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>⏳</span>
          )}
          {searchQuery && !searching && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, lineHeight: 1 }}>×</button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            style={{ marginTop: 4, background: 'white', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}
          >
            {searchResults.map((r, i) => {
              const label = r.display_name.split(',').slice(0, 3).join(', ');
              return (
                <button
                  key={i}
                  onPointerDown={e => { e.preventDefault(); handleSelectPlace(r); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 12px', border: 'none', background: 'none',
                    borderBottom: i < searchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                    cursor: 'pointer', fontSize: 12, color: '#1e293b',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  📍 {label}
                </button>
              );
            })}
          </div>
        )}
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

      {/* ── Drop-pin mode banner ── */}
      {dropPinMode && (
        <div style={{
          position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: '#1e293b', color: 'white', borderRadius: 10,
          padding: '7px 16px', fontSize: 12, fontWeight: 600,
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)', display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <span>📌 Tap your exact location on the map</span>
          <button onClick={() => setDropPinMode(false)}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Live location card ── */}
      {locationLabel && userLocation && (
        <div style={{
          position: 'absolute', bottom: 140, right: 10, zIndex: 1000,
          background: 'white', borderRadius: 14, padding: '10px 12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.22)', width: 230,
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{isManualPin ? '📌' : '📍'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {locationLabel.place}
              </div>
              {locationLabel.road && (
                <div style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>{locationLabel.road}</div>
              )}
              {locationLabel.district && (
                <div style={{ fontSize: 11, color: '#64748b' }}>{locationLabel.district}</div>
              )}
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                {userLocation[0].toFixed(5)}°N, {userLocation[1].toFixed(5)}°E
              </div>
              {!isManualPin && userAccuracy && (
                <div style={{ fontSize: 10, marginTop: 1, color: userAccuracy < 30 ? '#16a34a' : userAccuracy < 100 ? '#d97706' : '#dc2626' }}>
                  ±{Math.round(userAccuracy)}m accuracy
                </div>
              )}
              {isManualPin && (
                <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 1 }}>📌 Manually placed</div>
              )}
            </div>
            <button onClick={dismissLocation}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {/* Share */}
            <button onClick={handleShare} style={{
              flex: 1, padding: '5px 0', borderRadius: 8, border: 'none',
              background: '#2563eb', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>
              {shareCopied ? '✓ Copied!' : '🔗 Share'}
            </button>
            {/* Fix pin manually if GPS is inaccurate */}
            {!isManualPin && (
              <button onClick={() => setDropPinMode(true)} style={{
                flex: 1, padding: '5px 0', borderRadius: 8, border: '1.5px solid #e2e8f0',
                background: 'white', color: '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>
                📌 Fix Pin
              </button>
            )}
          </div>
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
