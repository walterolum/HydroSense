import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Map, Filter, Layers, Info } from 'lucide-react';
import { getWaterPoints, getDroughtIndex, getFloodAlerts } from '../../api/client';
import { WaterPoint } from '../../types';
import WaterMap from '../../components/map/WaterMap';
import StatusBadge from '../../components/common/StatusBadge';

import { ALL_DISTRICTS_WITH_ALL } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS_WITH_ALL;
const STATUSES = ['All', 'functional', 'non_functional', 'needs_repair', 'under_maintenance'];

export default function GISMap() {
  const [searchParams] = useSearchParams();
  const [wps, setWps] = useState<WaterPoint[]>([]);
  const [drought, setDrought] = useState<any[]>([]);
  const [flood, setFlood] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WaterPoint | null>(null);
  const urlDistrict = searchParams.get('district') || 'All';
  const [district, setDistrict] = useState(urlDistrict);
  const [status, setStatus] = useState('All');
  const [layer, setLayer] = useState<'water_points' | 'drought' | 'flood'>('water_points');

  // Re-apply district if URL param changes (e.g. navigated from alert card)
  useEffect(() => { setDistrict(urlDistrict); }, [urlDistrict]);

  useEffect(() => {
    const params: any = {};
    if (district !== 'All') params.district = district;
    if (status !== 'All') params.status = status;
    Promise.all([getWaterPoints(params), getDroughtIndex(), getFloodAlerts()]).then(([wr, dr, fr]) => {
      setWps(wr.data.data);
      setDrought(dr.data.data);
      setFlood(fr.data.data);
    }).finally(() => setLoading(false));
  }, [district, status]);

  const SEVERITY_COLORS: Record<string, string> = { extreme_drought: '#7f1d1d', severe_drought: '#dc2626', moderate_drought: '#ea580c', mild_drought: '#d97706', normal: '#16a34a', wet: '#2563eb' };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card py-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Layer:</span>
            {(['water_points', 'drought', 'flood'] as const).map(l => (
              <button key={l} onClick={() => setLayer(l)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${layer === l ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {l === 'water_points' ? '💧 Water Points' : l === 'drought' ? '🏜 Drought Index' : '🌊 Flood Risk'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Filter size={14} className="text-gray-400" />
            <select className="input w-auto text-sm py-1.5" value={district} onChange={e => setDistrict(e.target.value)}>
              {DISTRICTS.map(d => <option key={d}>{d}</option>)}
            </select>
            <select className="input w-auto text-sm py-1.5" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="text-xs text-gray-500">{loading ? 'Loading...' : `${wps.length} points shown`}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Map */}
        <div className="lg:col-span-3 card p-0">
          <WaterMap waterPoints={wps} height="580px" onSelect={setSelected} showHeatmap={layer === 'water_points'} selectedDistrict={district} />
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Legend */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Info size={14} /> Legend</h3>
            {layer === 'water_points' && (
              <div className="space-y-1.5 text-xs">
                {[['functional', '#16a34a'], ['needs_repair', '#ea580c'], ['non_functional', '#dc2626'], ['under_maintenance', '#d97706']].map(([s, c]) => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: c }} />
                    <span className="text-gray-600 capitalize">{s.replace(/_/g, ' ')}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                  <span className="w-6 h-2 rounded" style={{ background: '#dc2626', opacity: 0.4 }} />
                  <span className="text-gray-500">Non-functional radius</span>
                </div>
              </div>
            )}
            {layer === 'drought' && (
              <div className="space-y-1.5 text-xs">
                {Object.entries(SEVERITY_COLORS).map(([s, c]) => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded" style={{ background: c }} />
                    <span className="text-gray-600 capitalize">{s.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            )}
            {layer === 'flood' && (
              <div className="space-y-1.5 text-xs">
                {[['critical', '#7f1d1d'], ['high', '#dc2626'], ['moderate', '#d97706'], ['low', '#16a34a']].map(([s, c]) => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: c }} />
                    <span className="text-gray-600 capitalize">{s} risk</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Drought / Flood Data Panel */}
          {layer === 'drought' && (
            <div className="card max-h-80 overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Drought Status</h3>
              {drought.map(d => (
                <div key={d.district} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium text-gray-700">{d.district}</span>
                  <div className="text-right">
                    <div className="text-xs font-bold" style={{ color: SEVERITY_COLORS[d.severity] }}>{d.spi_value?.toFixed(1)}</div>
                    <div className="text-xs text-gray-400" style={{ color: SEVERITY_COLORS[d.severity] }}>{d.severity?.replace(/_/g, ' ')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {layer === 'flood' && (
            <div className="card max-h-80 overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Flood Monitoring</h3>
              {flood.map(f => (
                <div key={f.id} className="mb-2 p-2 rounded-lg border" style={{ borderColor: f.flood_risk === 'critical' ? '#dc2626' : f.flood_risk === 'high' ? '#ea580c' : '#d97706', background: f.flood_risk === 'critical' ? '#fef2f2' : '#fff' }}>
                  <div className="font-semibold text-sm text-gray-800">{f.district}</div>
                  <div className="text-xs text-gray-600">{f.river_name} · {f.water_level_m}m</div>
                  <div className="text-xs font-medium mt-0.5" style={{ color: f.flood_risk === 'critical' ? '#dc2626' : f.flood_risk === 'high' ? '#ea580c' : '#d97706' }}>{f.flood_risk?.toUpperCase()} RISK</div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Water Point */}
          {selected && layer === 'water_points' && (
            <div className="card border-2 border-blue-300">
              <div className="font-semibold text-gray-800 text-sm mb-2 flex items-center gap-1.5">
                <Map size={14} className="text-blue-600" /> {selected.name}
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <div><strong>District:</strong> {selected.district}</div>
                <div><strong>Type:</strong> {selected.type?.replace(/_/g, ' ')}</div>
                <div><strong>Village:</strong> {selected.village || '—'}</div>
                <div><strong>Beneficiaries:</strong> {(selected.beneficiaries || 0).toLocaleString()}</div>
                <div><strong>Infra Score:</strong> {selected.infrastructure_score}/100</div>
                <div><strong>Pump:</strong> {selected.pump_type || '—'} {selected.solar_powered ? '☀' : ''}</div>
              </div>
              <div className="mt-2"><StatusBadge status={selected.status} type="water_point" /></div>
              <a href={`/water-infrastructure/${selected.id}`} className="text-xs text-blue-600 hover:underline mt-2 block">View full details →</a>
            </div>
          )}

          {/* Stats Summary */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Map Summary</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Functional</span><span className="font-medium text-green-600">{wps.filter(w => w.status === 'functional').length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Non-functional</span><span className="font-medium text-red-600">{wps.filter(w => w.status === 'non_functional').length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Needs Repair</span><span className="font-medium text-orange-600">{wps.filter(w => w.status === 'needs_repair').length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Solar Powered</span><span className="font-medium text-yellow-600">{wps.filter(w => w.solar_powered === 1).length}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
