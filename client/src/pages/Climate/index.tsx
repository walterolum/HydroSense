import React, { useEffect, useState } from 'react';
import { CloudRain, Thermometer, Droplets, AlertTriangle, TrendingDown, Wind, MapPin } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend, Cell } from 'recharts';
import { getDroughtIndex, getFloodAlerts, getClimateForecast, getClimateSummary, getResilienceScores } from '../../api/client';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useWeather, weatherInfo } from '../../hooks/useWeather';

const SEVERITY_COLORS: Record<string, string> = { extreme_drought: '#7f1d1d', severe_drought: '#dc2626', moderate_drought: '#ea580c', mild_drought: '#d97706', normal: '#16a34a', wet: '#2563eb' };
const FLOOD_COLORS: Record<string, string> = { critical: '#dc2626', high: '#ea580c', moderate: '#d97706', low: '#16a34a' };

import { ALL_DISTRICTS } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS;

export default function ClimateMonitor() {
  const { user } = useAuth();
  const { weather, wError, loading: wLoading, fetchWeatherByDistrict } = useWeather(user?.district || 'Kampala');

  const [drought, setDrought] = useState<any[]>([]);
  const [flood, setFlood] = useState<any[]>([]);
  const [forecast, setForecast] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [resilience, setResilience] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDroughtIndex(), getFloodAlerts(), getClimateForecast(), getClimateSummary(), getResilienceScores()]).then(([dr, fl, fc, sm, rs]) => {
      setDrought(dr.data.data);
      setFlood(fl.data.data);
      setForecast(fc.data.forecast);
      setSummary(sm.data.data);
      setResilience(rs.data.data.slice(0, 8));
    }).finally(() => setLoading(false));
  }, []);

  const radarData = resilience.slice(0, 6).map(r => ({
    district: r.district,
    'Water Access': r.water_access_score,
    'Infrastructure': r.infrastructure_score,
    'Climate Adapt.': r.climate_adaptation_score,
    'Governance': r.governance_score,
    'Community': r.community_capacity_score,
  }));

  const weatherInfo_ = weather ? weatherInfo(weather.code) : null;

  return (
    <div className="space-y-6">
      {/* MASTER TOP GRID: Stats + Weather Widget */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Stats Grid */}
        <div className="xl:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard loading={loading} title="Districts in Drought" value={summary?.districts_in_drought || 0} subtitle="Requiring water intervention" icon={TrendingDown} color="orange" />
          <StatCard loading={loading} title="Districts Flood Risk" value={summary?.districts_flood_risk || 0} subtitle="High/critical flood alert" icon={CloudRain} color="blue" />
          <StatCard loading={loading} title="Avg Recent Rainfall" value={`${summary?.avg_recent_rainfall_mm || 0} mm`} subtitle="Last 3 months average" icon={Droplets} color="cyan" />
          <StatCard loading={loading} title="Critical Alerts" value={flood.filter(f => f.flood_risk === 'critical').length + drought.filter(d => d.severity === 'extreme_drought').length} subtitle="Extreme drought + flood" icon={AlertTriangle} color="red" />
        </div>

        {/* Live Weather Widget */}
        <div className="xl:col-span-1 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <CloudRain size={13} className="text-blue-500 animate-pulse" /> Live Weather
              </span>
              {wLoading && (
                <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
              )}
            </div>
            
            {!weather && wLoading && (
              <div className="flex items-center justify-center h-20 text-xs text-gray-400">
                Fetching weather data...
              </div>
            )}

            {!weather && !wLoading && wError && (
              <div className="flex items-center justify-center h-20 text-xs text-red-500 font-medium">
                Weather information unavailable
              </div>
            )}

            {weather && weatherInfo_ && (
              <div className="mt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-end gap-0.5">
                      <span className="text-3xl font-extrabold text-gray-900 dark:text-white">{weather.temp}°</span>
                      <span className="text-sm font-semibold text-gray-400 pb-0.5">C</span>
                    </div>
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mt-0.5">{weatherInfo_.label}</p>
                  </div>
                  <weatherInfo_.Icon size={38} className="text-blue-500 opacity-80" />
                </div>
                
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">
                  <span className="flex items-center gap-1"><Wind size={12} /> {weather.windspeed} km/h</span>
                  <span className="flex items-center gap-1"><MapPin size={12} className="text-gray-400" /> {weather.placeName}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-extrabold text-gray-400 dark:text-gray-500">Area:</span>
            <select
              value={weather?.placeName || user?.district || 'Kampala'}
              onChange={(e) => fetchWeatherByDistrict(e.target.value)}
              className="text-[11px] font-bold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer flex-1 w-full"
            >
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Drought Index Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="section-title"><TrendingDown size={18} className="text-orange-500" /> District Drought Index (SPI — Standardized Precipitation)</h3>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
          {drought.map(d => (
            <div key={d.district} className="p-3 rounded-xl border-2 transition-all hover:shadow-sm" style={{ borderColor: SEVERITY_COLORS[d.severity] + '60', background: SEVERITY_COLORS[d.severity] + '18' }}>
              <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{d.district}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: SEVERITY_COLORS[d.severity] }}>{d.spi_value?.toFixed(2)}</div>
              <div className="text-xs mt-1" style={{ color: SEVERITY_COLORS[d.severity] }}>{d.severity?.replace(/_/g, ' ')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">GW Recharge: {d.groundwater_recharge}%</div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-2">
                <div className="h-full rounded-full" style={{ width: `${Math.max(5, d.groundwater_recharge || 10)}%`, background: SEVERITY_COLORS[d.severity] }} />
              </div>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={drought} margin={{ top: 0, right: 10, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={55} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => [v?.toFixed(2), 'SPI']} />
            <Bar dataKey="spi_value" name="SPI Index" radius={[4, 4, 0, 0]}>
              {drought.map((entry, i) => <Cell key={i} fill={SEVERITY_COLORS[entry.severity] || '#6b7280'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {Object.entries(SEVERITY_COLORS).map(([key, color]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: color }} />
              {key.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Flood Alerts */}
      <div className="card">
        <div className="card-header">
          <h3 className="section-title"><CloudRain size={18} className="text-blue-600" /> Active Flood Monitoring</h3>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {flood.map(f => (
            <div key={f.id} className={`p-4 rounded-xl border-l-4 ${f.flood_risk === 'critical' ? 'bg-red-50 dark:bg-red-950/30 border-red-500' : f.flood_risk === 'high' ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-500' : f.flood_risk === 'moderate' ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-500' : 'bg-blue-50 dark:bg-blue-950/30 border-blue-400'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-gray-800 dark:text-gray-100">{f.district}</div>
                <span className="badge" style={{ background: FLOOD_COLORS[f.flood_risk] + '30', color: FLOOD_COLORS[f.flood_risk] }}>{f.flood_risk} risk</span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">🌊 {f.river_name} · Level: <strong>{f.water_level_m}m</strong></div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Communities: {f.affected_communities}</div>
              {f.flood_risk === 'critical' && (
                <div className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle size={12} /> IMMEDIATE EVACUATION MAY BE REQUIRED
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 6-Month AI Forecast */}
      <div className="card">
        <div className="card-header">
          <h3 className="section-title"><CloudRain size={18} className="text-purple-600" /> 6-Month AI Climate Forecast</h3>
          <span className="badge bg-purple-100 text-purple-700">AI Generated</span>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={forecast} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="predicted_rainfall_mm" name="Predicted Rainfall (mm)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="groundwater_recharge" name="GW Recharge" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
          {forecast.map(f => (
            <div key={f.month} className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="font-semibold text-sm text-gray-700 dark:text-gray-200">{f.month}</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{f.predicted_rainfall_mm} mm</div>
              <div className={`text-xs mt-0.5 font-medium ${f.drought_risk === 'high' ? 'text-red-600 dark:text-red-400' : f.drought_risk === 'moderate' ? 'text-orange-500 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                {f.drought_risk} drought
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500">{f.confidence_pct}% conf.</div>
            </div>
          ))}
        </div>
      </div>

      {/* Resilience Scores */}
      <div className="card">
        <div className="card-header">
          <h3 className="section-title"><Wind size={18} className="text-cyan-600" /> District Climate Resilience Scores</h3>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">District</th>
                  <th className="th">Water Access</th>
                  <th className="th">Infrastructure</th>
                  <th className="th">Climate Adapt.</th>
                  <th className="th">Overall</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-700">
                {resilience.map(r => (
                  <tr key={r.district} className="tr">
                    <td className="td font-semibold text-gray-800 dark:text-gray-100">{r.district}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${r.water_access_score}%` }} /></div>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{r.water_access_score}</span>
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${r.infrastructure_score}%` }} /></div>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{r.infrastructure_score}</span>
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${r.climate_adaptation_score}%` }} /></div>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{r.climate_adaptation_score}</span>
                      </div>
                    </td>
                    <td className="td">
                      <span className={`font-bold ${r.overall_resilience_score < 40 ? 'text-red-600 dark:text-red-400' : r.overall_resilience_score < 60 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>{r.overall_resilience_score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {radarData.length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={[radarData[0]]}>
                <PolarGrid />
                <PolarAngleAxis dataKey="district" tick={{ fontSize: 11 }} />
                {Object.keys(radarData[0]).filter(k => k !== 'district').map((key, i) => (
                  <Radar key={key} name={key} dataKey={key} stroke={['#3b82f6', '#16a34a', '#ea580c', '#8b5cf6', '#06b6d4'][i]} fill={['#3b82f6', '#16a34a', '#ea580c', '#8b5cf6', '#06b6d4'][i]} fillOpacity={0.2} />
                ))}
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
