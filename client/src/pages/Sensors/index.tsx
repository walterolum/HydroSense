import React, { useEffect, useState, useRef } from 'react';
import { Cpu, Wifi, Battery, Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getSensors, getSensorStats, getSensorReadings } from '../../api/client';
import { Sensor } from '../../types';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import { io } from 'socket.io-client';

export default function SensorsPage() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [readings, setReadings] = useState<Record<number, number>>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null);
  const [sensorHistory, setSensorHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [liveCount, setLiveCount] = useState(0);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    Promise.all([getSensors(), getSensorStats()]).then(([sr, str]) => {
      setSensors(sr.data.data);
      setStats(str.data.data);
      const initReadings: Record<number, number> = {};
      sr.data.data.forEach((s: Sensor) => { if (s.last_reading !== undefined) initReadings[s.id] = s.last_reading!; });
      setReadings(initReadings);
    }).finally(() => setLoading(false));

    // Socket.io real-time updates
    socketRef.current = io('/', { transports: ['websocket', 'polling'] });
    socketRef.current.on('sensor_updates', (updates: any[]) => {
      setLiveCount(c => c + 1);
      setReadings(prev => {
        const next = { ...prev };
        updates.forEach(u => { next[u.sensor_id] = u.value; });
        return next;
      });
      const now = new Date().toLocaleTimeString();
      setChartData(prev => {
        const point: any = { time: now };
        updates.slice(0, 5).forEach(u => { point[`S${u.sensor_id}`] = u.value; });
        return [...prev.slice(-29), point];
      });
    });
    return () => socketRef.current?.disconnect();
  }, []);

  const loadSensorHistory = async (sensor: Sensor) => {
    setSelectedSensor(sensor);
    const r = await getSensorReadings(sensor.id, 24);
    setSensorHistory(r.data.data.map((rd: any) => ({
      time: new Date(rd.timestamp).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }),
      value: parseFloat(rd.value?.toFixed(2)),
    })));
  };

  const filtered = sensors.filter(s => filter === 'all' || s.status === filter || s.sensor_type === filter);

  const sensorTypeIcon: Record<string, string> = { water_level: '🌊', flow_rate: '💧', water_quality: '🧪', rainfall: '🌧', temperature: '🌡', solar_power: '☀', groundwater: '⛏' };

  const SENSOR_COLORS = ['#3b82f6', '#16a34a', '#ea580c', '#8b5cf6', '#06b6d4', '#d97706'];

  return (
    <div className="space-y-6">
      {/* Live indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-green-700 font-medium">Live Sensor Feed Active</span>
          <span className="badge bg-green-100 text-green-700">{liveCount} updates received</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} title="Total Sensors" value={stats?.total || 0} subtitle="Deployed across Uganda" icon={Cpu} color="blue" />
        <StatCard loading={loading} title="Active Sensors" value={stats?.by_status?.find((s: any) => s.status === 'active')?.count || 0} subtitle="Transmitting data" icon={Activity} color="green" />
        <StatCard loading={loading} title="Low Battery" value={stats?.low_battery || 0} subtitle="Below 20% charge" icon={Battery} color="orange" />
        <StatCard loading={loading} title="Offline Sensors" value={stats?.offline || 0} subtitle="No signal > 1 hour" icon={Wifi} color="red" />
      </div>

      {/* Real-time Chart */}
      <div className="card">
        <div className="card-header">
          <h3 className="section-title"><Activity size={18} className="text-blue-600" /> Real-time Sensor Feed</h3>
          <div className="text-xs text-gray-500 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live (updates every 30s)
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend />
              {Object.keys(chartData[0] || {}).filter(k => k !== 'time').slice(0, 5).map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={SENSOR_COLORS[i % SENSOR_COLORS.length]} strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Waiting for live sensor data...</div>
        )}
      </div>

      {/* Filter bar */}
      <div className="card py-3">
        <div className="flex flex-wrap gap-2">
          {['all', 'active', 'faulty', 'inactive', 'water_level', 'flow_rate', 'rainfall', 'temperature', 'solar_power', 'groundwater'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {sensorTypeIcon[f] || ''} {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Sensor Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(sensor => {
          const live = readings[sensor.id];
          const pct = sensor.max_threshold && live ? Math.min(100, (live / sensor.max_threshold) * 100) : 50;
          const isLow = sensor.min_threshold && live && live < sensor.min_threshold;
          return (
            <div key={sensor.id} className={`card cursor-pointer hover:shadow-md transition-all ${isLow ? 'border-2 border-orange-400' : ''}`} onClick={() => loadSensorHistory(sensor)}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-lg">{sensorTypeIcon[sensor.sensor_type] || '📡'}</div>
                  <div className="text-xs font-semibold text-gray-600 mt-1">{sensor.sensor_name}</div>
                </div>
                <StatusBadge status={sensor.status} type="sensor" />
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {live !== undefined ? live.toFixed(2) : (sensor.last_reading?.toFixed(2) || '—')}
                <span className="text-sm font-normal text-gray-500 ml-1">{sensor.unit}</span>
              </div>
              {isLow && <div className="text-xs text-orange-600 font-medium mt-1">⚠ Below threshold ({sensor.min_threshold} {sensor.unit})</div>}
              <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-400">
                <span className="flex items-center gap-0.5"><Battery size={10} /> {sensor.battery_level}%</span>
                <span className="flex items-center gap-0.5"><Wifi size={10} /> {sensor.signal_strength}%</span>
              </div>
              <div className="text-xs text-gray-400 mt-1 truncate">📍 {sensor.water_point_name || sensor.district}</div>
            </div>
          );
        })}
      </div>

      {/* Sensor Detail Modal */}
      {selectedSensor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSensor(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{selectedSensor.sensor_name}</h3>
                <div className="text-xs text-gray-500">S/N: {selectedSensor.serial_number} · {selectedSensor.water_point_name}</div>
              </div>
              <button onClick={() => setSelectedSensor(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-xl font-bold text-blue-700">{readings[selectedSensor.id]?.toFixed(2) || '—'}</div>
                  <div className="text-xs text-gray-500">Current {selectedSensor.unit}</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-xl font-bold text-green-700">{selectedSensor.battery_level}%</div>
                  <div className="text-xs text-gray-500">Battery</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-xl font-bold text-purple-700">{selectedSensor.signal_strength}%</div>
                  <div className="text-xs text-gray-500">Signal</div>
                </div>
              </div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">24-Hour Reading History</h4>
              {sensorHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={sensorHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [`${v} ${selectedSensor.unit}`, 'Reading']} />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    {selectedSensor.min_threshold && <Line type="monotone" dataKey={() => selectedSensor.min_threshold} stroke="#dc2626" strokeDasharray="5 5" strokeWidth={1} name="Min Threshold" dot={false} />}
                    {selectedSensor.max_threshold && <Line type="monotone" dataKey={() => selectedSensor.max_threshold} stroke="#ea580c" strokeDasharray="5 5" strokeWidth={1} name="Max Threshold" dot={false} />}
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Loading history...</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
