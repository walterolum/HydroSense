import React from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Circle,
  LayersControl,
} from 'react-leaflet';
import L from 'leaflet';
import { WaterPoint } from '../../types';
import StatusBadge from '../common/StatusBadge';

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusColors: Record<string, string> = {
  functional: '#16a34a',
  non_functional: '#dc2626',
  needs_repair: '#ea580c',
  under_maintenance: '#d97706',
};

function createIcon(status: string) {
  const color = statusColors[status] || '#6b7280';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

/* ── Tile layer configs ── */
const TILES = {
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© <a href="https://www.esri.com/">Esri</a>, Maxar, GeoEye, Earthstar Geographics',
  },
  terrain: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
  dark: {
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  },
  light: {
    label: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  },
  humanitarian: {
    label: 'Humanitarian',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, Tiles courtesy of <a href="https://hot.openstreetmap.org/">HOT</a>',
  },
};

interface WaterMapProps {
  waterPoints: WaterPoint[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onSelect?: (wp: WaterPoint) => void;
  showHeatmap?: boolean;
  highlightDistrict?: string;
}

export default function WaterMap({
  waterPoints,
  center = [1.37, 32.29],
  zoom = 6,
  height = '500px',
  onSelect,
  showHeatmap = false,
}: WaterMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: '100%' }}
      className="rounded-xl z-0"
    >
      <LayersControl position="topright">

        {/* ── Base layers ── */}
        <LayersControl.BaseLayer checked name={TILES.street.label}>
          <TileLayer url={TILES.street.url} attribution={TILES.street.attribution} />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name={TILES.satellite.label}>
          <TileLayer url={TILES.satellite.url} attribution={TILES.satellite.attribution} />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name={TILES.terrain.label}>
          <TileLayer url={TILES.terrain.url} attribution={TILES.terrain.attribution} />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name={TILES.dark.label}>
          <TileLayer url={TILES.dark.url} attribution={TILES.dark.attribution} />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name={TILES.light.label}>
          <TileLayer url={TILES.light.url} attribution={TILES.light.attribution} />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name={TILES.humanitarian.label}>
          <TileLayer url={TILES.humanitarian.url} attribution={TILES.humanitarian.attribution} />
        </LayersControl.BaseLayer>

        {/* ── Overlay: water point markers ── */}
        <LayersControl.Overlay checked name="Water Points">
          <>
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
                    {wp.village && <div className="text-xs text-gray-500 mt-1">📍 {wp.village}, {wp.sub_county}</div>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </>
        </LayersControl.Overlay>

        {/* ── Overlay: non-functional radius heatmap ── */}
        {showHeatmap && (
          <LayersControl.Overlay checked name="Non-functional Radius">
            <>
              {waterPoints.filter(wp => wp.status === 'non_functional').map(wp => (
                <Circle
                  key={`heat_${wp.id}`}
                  center={[wp.lat, wp.lng]}
                  radius={5000}
                  pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.15, weight: 1 }}
                />
              ))}
            </>
          </LayersControl.Overlay>
        )}

      </LayersControl>
    </MapContainer>
  );
}
