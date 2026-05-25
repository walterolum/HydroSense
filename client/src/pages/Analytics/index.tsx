import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Brain, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, Legend } from 'recharts';
import { getAnalyticsOverview, getWaterSecurity, getAnalyticsTrends, getPredictions, getClimateRisk } from '../../api/client';
import StatCard from '../../components/common/StatCard';
import { useTranslations } from '../../hooks/useTranslations';

export default function Analytics() {
  const s = useTranslations({
    title: 'AI-Powered Analytics & Predictive Forecasting',
    waterCoverage: 'Water Coverage',
    peopleServed: 'People Served',
    avgQuality: 'Avg Quality Score',
    activeHealth: 'Active Health Cases',
    climateTrends: '6-Month Climate Trends by District',
    maintenance: 'Monthly Maintenance Requests & Completions',
    aiModel: 'AI Predictive Model — 6-Month Outlook',
    predictedRisk: 'Predicted Risk Indicators (Next 6 Months)',
    boreholeRisk: 'Borehole Failure Risk',
    droughtProb: 'Drought Probability',
    floodProb: 'Flood Probability',
    demandIncrease: 'Water Demand Increase',
    contaminationRisk: 'Contamination Risk',
    highRisk: 'High-Risk Water Points (Drought Zones)',
    districtRanking: 'District Resilience Ranking',
    totalPoints: 'Total Points',
    coverage: 'Coverage',
    beneficiaries: 'Beneficiaries',
    infraScore: 'Infra Score',
  });
  const [overview, setOverview] = useState<any>(null);
  const [waterSecurity, setWaterSecurity] = useState<any[]>([]);
  const [trends, setTrends] = useState<any>(null);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [climateRisk, setClimateRisk] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'predictions' | 'climate' | 'security'>('overview');

  useEffect(() => {
    Promise.all([getAnalyticsOverview(), getWaterSecurity(), getAnalyticsTrends(6), getPredictions(), getClimateRisk()]).then(([ov, ws, tr, pr, cr]) => {
      setOverview(ov.data.data);
      setWaterSecurity(ws.data.data);
      setTrends(tr.data.data);
      setPredictions(pr.data.data);
      setClimateRisk(cr.data.data);
    }).finally(() => setLoading(false));
  }, []);


  return (
    <div className="space-y-6">
      {/* AI Badge */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl p-4 flex items-center gap-3">
        <Brain size={28} className="flex-shrink-0" />
        <div>
          <div className="font-bold">{s.title}</div>
          <div className="text-purple-100 text-sm">Integrated machine learning models analyzing climate, infrastructure, and health data for Uganda rural water security</div>
        </div>
        <span className="ml-auto badge bg-white/20 text-white">Live Model</span>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {(['overview', 'predictions', 'climate', 'security'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${tab === t ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard loading={loading} title={s.waterCoverage} value={`${overview?.water_points?.coverage_pct || 0}%`} subtitle={`${overview?.water_points?.functional || 0}/${overview?.water_points?.total || 0} functional`} icon={Activity} color="blue" />
            <StatCard loading={loading} title={s.peopleServed} value={(overview?.water_points?.beneficiaries || 0).toLocaleString()} icon={Activity} color="green" />
            <StatCard loading={loading} title={s.avgQuality} value={`${overview?.water_quality?.avg_score || 0}/100`} icon={BarChart3} color="cyan" />
            <StatCard loading={loading} title={s.activeHealth} value={overview?.health?.active_cases || 0} icon={TrendingUp} color="red" />
          </div>

          {/* Trends Charts */}
          {trends?.climate?.length > 0 && (
            <div className="card">
              <h3 className="section-title mb-4">{s.climateTrends}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={trends.climate.slice(-30)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="avg_rainfall" name="Avg Rainfall (mm)" stroke="#3b82f6" fill="#bfdbfe" />
                  <Area type="monotone" dataKey="avg_temp" name="Avg Temp (°C)" stroke="#dc2626" fill="#fee2e2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {trends?.maintenance?.length > 0 && (
            <div className="card">
              <h3 className="section-title mb-4">{s.maintenance}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trends.maintenance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="requests" name="Requests" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {tab === 'predictions' && (
        <div className="space-y-6">
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700/50 rounded-xl p-4">
            <div className="font-semibold text-purple-800 dark:text-purple-200 flex items-center gap-2"><Brain size={18} /> {s.aiModel}</div>
            <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">Based on historical rainfall patterns, infrastructure degradation rates, groundwater recharge levels, and seasonal disease cycles.</p>
          </div>
          <div className="card">
            <h3 className="section-title mb-4">{s.predictedRisk}</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={predictions}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v: any) => [`${v?.toFixed(1)}%`, '']} />
                <Legend />
                <Line type="monotone" dataKey="borehole_failure_risk_pct" name={s.boreholeRisk} stroke="#dc2626" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="drought_probability_pct" name={s.droughtProb} stroke="#d97706" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="flood_probability_pct" name={s.floodProb} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="water_demand_increase_pct" name={s.demandIncrease} stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {predictions.map(p => (
              <div key={p.month} className="card">
                <div className="font-bold text-lg text-gray-800 dark:text-gray-100">{p.month} Forecast</div>
                <div className="space-y-2 mt-3 text-sm">
                  {[
                    { label: s.boreholeRisk, val: p.borehole_failure_risk_pct, color: '#dc2626' },
                    { label: s.droughtProb, val: p.drought_probability_pct, color: '#d97706' },
                    { label: s.floodProb, val: p.flood_probability_pct, color: '#3b82f6' },
                    { label: s.demandIncrease, val: p.water_demand_increase_pct, color: '#8b5cf6' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                        <span className="font-semibold" style={{ color: item.color }}>{item.val?.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-full rounded-full" style={{ width: `${item.val}%`, background: item.color }} /></div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{s.contaminationRisk}: </span>
                  <span className={`font-bold ${p.contamination_risk === 'high' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>{p.contamination_risk}</span>
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Est. {p.maintenance_needed_est} repairs needed</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'climate' && climateRisk && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="section-title mb-3">{s.highRisk}</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(climateRisk.high_risk_water_points || []).map((wp: any) => (
                  <div key={wp.id} className="flex items-center gap-3 p-2.5 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900/40">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{wp.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{wp.district} · {wp.type?.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-red-600 dark:text-red-400">{wp.drought_severity?.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">SPI {wp.spi_value?.toFixed(1)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <h3 className="section-title mb-3">{s.districtRanking}</h3>
              <div className="space-y-2">
                {(climateRisk.resilience_scores || []).map((r: any) => (
                  <div key={r.district} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-gray-700 dark:text-gray-300 font-medium">{r.district}</div>
                    <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all" style={{ width: `${r.overall_resilience_score}%`, background: r.overall_resilience_score < 40 ? '#dc2626' : r.overall_resilience_score < 60 ? '#d97706' : '#16a34a' }}>
                        <span className="text-white text-xs font-bold">{r.overall_resilience_score}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-6">
          <div className="table-container card p-0">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">District</th>
                  <th className="th">{s.totalPoints}</th>
                  <th className="th">Functional</th>
                  <th className="th">{s.coverage}</th>
                  <th className="th">{s.beneficiaries}</th>
                  <th className="th">{s.infraScore}</th>
                  <th className="th">Quality Score</th>
                  <th className="th">Resilience</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-700">
                {waterSecurity.map((d: any) => (
                  <tr key={d.district} className="tr">
                    <td className="td font-semibold text-gray-800 dark:text-gray-100">{d.district}</td>
                    <td className="td text-gray-700 dark:text-gray-300">{d.total_points}</td>
                    <td className="td text-green-700 dark:text-green-400 font-semibold">{d.functional}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-2 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${d.total_points > 0 ? (d.functional / d.total_points) * 100 : 0}%` }} /></div>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{d.total_points > 0 ? Math.round((d.functional / d.total_points) * 100) : 0}%</span>
                      </div>
                    </td>
                    <td className="td text-gray-700 dark:text-gray-300">{(d.total_beneficiaries || 0).toLocaleString()}</td>
                    <td className="td"><span className={`font-bold ${d.avg_infra_score >= 70 ? 'text-green-600 dark:text-green-400' : d.avg_infra_score >= 50 ? 'text-orange-500 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>{Math.round(d.avg_infra_score || 0)}</span></td>
                    <td className="td"><span className={`font-bold ${d.avg_quality_score >= 80 ? 'text-green-600 dark:text-green-400' : d.avg_quality_score >= 60 ? 'text-orange-500 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>{Math.round(d.avg_quality_score || 0)}</span></td>
                    <td className="td"><span className={`font-bold ${d.overall_resilience_score >= 70 ? 'text-green-600 dark:text-green-400' : d.overall_resilience_score >= 50 ? 'text-orange-500 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>{d.overall_resilience_score || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
