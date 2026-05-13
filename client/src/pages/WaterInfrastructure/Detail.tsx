import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Droplets, TestTube, Wrench, AlertTriangle, Cpu, DollarSign, MapPin } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getWaterPoint, getSensorReadings } from '../../api/client';
import StatusBadge from '../../components/common/StatusBadge';

export default function WaterPointDetail() {
  const { id } = useParams();
  const [wp, setWp] = useState<any>(null);
  const [sensorReadings, setSensorReadings] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getWaterPoint(parseInt(id)).then(async r => {
      const data = r.data.data;
      setWp(data);
      const readings: Record<number, any[]> = {};
      for (const sensor of (data.sensors || []).slice(0, 3)) {
        const rr = await getSensorReadings(sensor.id, 24);
        readings[sensor.id] = rr.data.data.map((rd: any) => ({
          time: new Date(rd.timestamp).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }),
          value: rd.value,
        }));
      }
      setSensorReadings(readings);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading water point details...</div>;
  if (!wp) return <div className="text-center text-gray-500 py-12">Water point not found.</div>;

  const statusColor: Record<string, string> = { functional: 'bg-green-500', non_functional: 'bg-red-500', needs_repair: 'bg-orange-500', under_maintenance: 'bg-yellow-500' };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/water-infrastructure" className="btn-secondary"><ArrowLeft size={16} /> Back</Link>
        <div>
          <h2 className="text-xl font-bold text-gray-800">{wp.name}</h2>
          <div className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
            <MapPin size={13} /> {wp.village && `${wp.village}, `}{wp.sub_county}, {wp.district} District
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <StatusBadge status={wp.status} type="water_point" />
          {wp.solar_powered === 1 && <span className="badge bg-yellow-100 text-yellow-700">☀ Solar</span>}
        </div>
      </div>

      {/* Active Alerts */}
      {wp.alerts?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="font-semibold text-red-800 mb-2 flex items-center gap-2"><AlertTriangle size={16} /> {wp.alerts.length} Active Alert(s)</div>
          {wp.alerts.map((a: any) => <div key={a.id} className="text-sm text-red-700">&bull; {a.title}</div>)}
        </div>
      )}

      {/* Key Info Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="section-title mb-3"><Droplets size={16} className="text-blue-600" /> Technical Specs</h3>
            <dl className="space-y-2 text-sm">
              {[
                ['Type', wp.type?.replace(/_/g, ' ')],
                ['Pump Type', wp.pump_type || '—'],
                ['Depth', wp.depth_m ? `${wp.depth_m}m` : '—'],
                ['Water Table', wp.water_table_m ? `${wp.water_table_m}m` : '—'],
                ['Yield', wp.yield_lph ? `${wp.yield_lph} L/hr` : '—'],
                ['Infra Score', `${wp.infrastructure_score}/100`],
                ['Installed', wp.installed_date ? new Date(wp.installed_date).toLocaleDateString() : '—'],
                ['Last Maintained', wp.last_maintained ? new Date(wp.last_maintained).toLocaleDateString() : '—'],
                ['Next Due', wp.next_maintenance ? new Date(wp.next_maintenance).toLocaleDateString() : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-gray-50 pb-1">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-800">{v}</span>
                </div>
              ))}
            </dl>
          </div>

          <div className="card">
            <h3 className="section-title mb-3"><MapPin size={16} className="text-blue-600" /> Location & Community</h3>
            <dl className="space-y-2 text-sm">
              {[
                ['District', wp.district],
                ['Sub-county', wp.sub_county || '—'],
                ['Village', wp.village || '—'],
                ['Beneficiaries', (wp.beneficiaries || 0).toLocaleString()],
                ['Households', (wp.households || 0).toLocaleString()],
                ['Coordinates', `${wp.lat?.toFixed(4)}, ${wp.lng?.toFixed(4)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-gray-50 pb-1">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-800">{v}</span>
                </div>
              ))}
            </dl>
            {/* Infrastructure Score Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Infrastructure Health</span>
                <span className="font-semibold">{wp.infrastructure_score}/100</span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${statusColor[wp.status] || 'bg-blue-500'}`} style={{ width: `${wp.infrastructure_score}%` }} />
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {wp.infrastructure_score >= 80 ? 'Excellent condition' : wp.infrastructure_score >= 60 ? 'Good — minor attention needed' : wp.infrastructure_score >= 40 ? 'Fair — maintenance required' : 'Poor — urgent intervention needed'}
              </div>
            </div>
          </div>

          {/* Maintenance Fund */}
          {wp.fund && (
            <div className="card sm:col-span-2">
              <h3 className="section-title mb-3"><DollarSign size={16} className="text-green-600" /> Maintenance Fund</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-bold text-green-700">UGX {(wp.fund.balance || 0).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Current Balance</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-bold text-blue-700">UGX {(wp.fund.total_collected || 0).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Total Collected</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-lg font-bold text-orange-700">UGX {(wp.fund.total_spent || 0).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Total Spent</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sensors */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="section-title mb-3"><Cpu size={16} className="text-purple-600" /> IoT Sensors ({wp.sensors?.length || 0})</h3>
            {wp.sensors?.map((s: any) => (
              <div key={s.id} className="mb-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium text-gray-700">{s.sensor_name}</div>
                  <StatusBadge status={s.status} type="sensor" />
                </div>
                <div className="text-xl font-bold text-blue-600">{s.last_reading?.toFixed(2) || '—'} <span className="text-xs font-normal text-gray-500">{s.unit}</span></div>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>🔋 {s.battery_level}%</span>
                  <span>📶 {s.signal_strength}%</span>
                  <span>Updated {s.last_seen ? new Date(s.last_seen).toLocaleTimeString() : '—'}</span>
                </div>
                {sensorReadings[s.id]?.length > 0 && (
                  <div className="mt-2">
                    <ResponsiveContainer width="100%" height={60}>
                      <LineChart data={sensorReadings[s.id].slice(-20)}>
                        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
            {(!wp.sensors || wp.sensors.length === 0) && <p className="text-sm text-gray-400">No sensors installed</p>}
          </div>
        </div>
      </div>

      {/* Recent Tests & Maintenance */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="section-title mb-3"><TestTube size={16} className="text-cyan-600" /> Recent Water Quality Tests</h3>
          {wp.recentTests?.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead><tr><th className="th">Date</th><th className="th">pH</th><th className="th">Turbidity</th><th className="th">E.coli</th><th className="th">Safe</th><th className="th">Score</th></tr></thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {wp.recentTests.map((t: any) => (
                    <tr key={t.id} className="tr">
                      <td className="td text-xs">{new Date(t.tested_at).toLocaleDateString()}</td>
                      <td className="td">{t.ph?.toFixed(1)}</td>
                      <td className="td">{t.turbidity_ntu?.toFixed(1)} NTU</td>
                      <td className="td">{t.e_coli_cfu?.toFixed(1)}</td>
                      <td className="td"><span className={`badge ${t.overall_safe ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.overall_safe ? 'Safe' : 'Unsafe'}</span></td>
                      <td className="td font-semibold">{t.water_safety_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-gray-400">No test records</p>}
        </div>

        <div className="card">
          <h3 className="section-title mb-3"><Wrench size={16} className="text-orange-600" /> Recent Maintenance</h3>
          {wp.recentMaintenance?.length > 0 ? (
            <div className="space-y-2">
              {wp.recentMaintenance.map((m: any) => (
                <div key={m.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium text-gray-700 capitalize">{m.issue_type?.replace(/_/g, ' ')}</div>
                    <StatusBadge status={m.status} type="maintenance" />
                  </div>
                  <div className="text-xs text-gray-500">{m.description?.slice(0, 80)}...</div>
                  <div className="text-xs text-gray-400 mt-1">{m.technician_name ? `👷 ${m.technician_name}` : '—'} · {new Date(m.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">No maintenance records</p>}
          <Link to="/maintenance" className="btn-secondary mt-3 text-xs">Request Maintenance</Link>
        </div>
      </div>

      {wp.notes && (
        <div className="card">
          <h3 className="section-title mb-2">Notes</h3>
          <p className="text-sm text-gray-600">{wp.notes}</p>
        </div>
      )}
    </div>
  );
}
