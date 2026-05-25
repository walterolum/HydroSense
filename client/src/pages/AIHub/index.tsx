import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain, AlertTriangle, Droplets, Wrench, TestTube, CloudRain,
  Activity, TrendingUp, TrendingDown, Zap, RefreshCw, FileText,
  Shield, Eye, Cpu, BarChart3, ChevronRight, Map,
  MessageSquare, GitCompare, Target, Radio, Globe, Layers, Printer,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, Cell, PieChart, Pie,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAIDashboard, getFailurePredictions, getAnomalies,
  getAIClimateForecast, generateAIReport,
  getLiveRiskSummary, getDistrictRiskSummaries, getRiskHeatmap,
  getOperationalInsights, getPrioritizedIncidents, getResponseStrategy,
  getEnvironmentalRiskIndex,
  type AIDashboard, type AIAnomaly, type AIForecastMonth,
} from '../../api/aiClient';
import ConversationWorkspace from './ConversationWorkspace';
import { useAIService } from '../../contexts/AIServiceContext';

/* ── colour helpers ── */
const RISK_COLOR: Record<string, string> = {
  critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a',
};
const RISK_BG: Record<string, string> = {
  critical: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  high:     'bg-orange-50 dark:bg-orange-900/20 border-orange-200',
  medium:   'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200',
  low:      'bg-green-50 dark:bg-green-900/20 border-green-200',
};
const DROUGHT_COLOR: Record<string, string> = {
  extreme_drought: '#7f1d1d', severe_drought: '#dc2626', moderate_drought: '#ea580c',
  mild_drought: '#d97706', normal: '#16a34a', above_normal: '#0891b2', wet: '#2563eb',
};

const TABS = ['Overview', 'Live Intelligence', 'Predictions', 'Anomalies', 'Climate AI', 'Smart Alerts', 'Decision Support', 'AI Reports', 'Conversations'];

/* ── tab visibility per role ── */
const ROLE_TABS: Record<string, string[]> = {
  national_admin:      TABS,
  district_officer:    ['Overview', 'Live Intelligence', 'Predictions', 'Anomalies', 'Climate AI', 'Smart Alerts', 'Decision Support', 'AI Reports', 'Conversations'],
  ngo_officer:         ['Overview', 'Live Intelligence', 'Predictions', 'Smart Alerts', 'AI Reports', 'Conversations'],
  technician:          ['Overview', 'Predictions', 'Anomalies', 'Smart Alerts', 'Conversations'],
  health_officer:      ['Overview', 'Live Intelligence', 'Predictions', 'Anomalies', 'Smart Alerts', 'AI Reports', 'Conversations'],
  climate_scientist:   ['Overview', 'Live Intelligence', 'Climate AI', 'Anomalies', 'Smart Alerts', 'Conversations'],
  community_committee: ['Overview', 'Smart Alerts', 'Conversations'],
  citizen:             ['Overview', 'Smart Alerts', 'Conversations'],
};

/* ── AI Stat Card ── */
function AIStatCard({ label, value, sub, icon: Icon, color, trend }:
  { label: string; value: any; sub?: string; icon: any; color: string; trend?: 'up'|'down'|'neutral' }) {
  return (
    <div className={`card border-l-4`} style={{ borderLeftColor: color }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: color + '20' }}>
          <Icon size={20} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</div>
          <div className="text-2xl font-extrabold mt-0.5 dark:text-white"
            style={{ color }}>{value}</div>
          {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </div>
        {trend && (
          <div className={`text-xs font-bold ${trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : 'text-gray-400'}`}>
            {trend === 'up' ? <TrendingUp size={16} /> : trend === 'down' ? <TrendingDown size={16} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Risk Badge ── */
function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border border-red-200',
    high:     'bg-orange-100 text-orange-700 border border-orange-200',
    medium:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
    low:      'bg-green-100 text-green-700 border border-green-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${colors[level] || colors.low}`}>
      {level}
    </span>
  );
}

/* ── Intelligent recovery notice ── */
function AIRecovery() {
  const { status, checkNow, statusMessage, latency } = useAIService();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: status === 'reconnecting' ? 'rgba(234,179,8,0.15)' : 'rgba(37,99,235,0.15)', border: `1px solid ${status === 'reconnecting' ? 'rgba(234,179,8,0.3)' : 'rgba(37,99,235,0.3)'}` }}>
        {status === 'reconnecting' ? (
          <RefreshCw size={28} className="text-yellow-500 animate-spin" />
        ) : (
          <Brain size={28} className="text-blue-500" />
        )}
      </div>
      <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">
        {status === 'reconnecting' ? 'Reconnecting to Hydro AI...' : 'Restoring Environmental Intelligence Services...'}
      </h3>
      <p className="text-sm text-gray-400 mt-2 max-w-sm">
        {statusMessage}
      </p>
      <div className="flex items-center gap-2 mt-3">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-xs text-gray-400">Automatic reconnection in progress</span>
      </div>
      <button onClick={checkNow}
        className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2">
        <RefreshCw size={14} /> Check Connection
      </button>
      {latency !== null && (
        <span className="text-[10px] text-gray-400 mt-2">Last detected: {latency}ms latency</span>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   Live Intelligence Tab
════════════════════════════════════════════ */
function LiveIntelligenceTab() {
  const [liveRisk, setLiveRisk] = useState<any>(null);
  const [districtRisks, setDistrictRisks] = useState<any[]>([]);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [riskIndex, setRiskIndex] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getLiveRiskSummary(), getDistrictRiskSummaries(),
      getRiskHeatmap(), getOperationalInsights(), getEnvironmentalRiskIndex(),
    ]).then(([lr, dr, hm, oi, ri]) => {
      setLiveRisk(lr.data?.live_summary);
      setDistrictRisks(dr.data?.summaries || []);
      setHeatmap(hm.data?.heatmap || []);
      setInsights(oi.data?.insights);
      setRiskIndex(ri.data?.risk_index);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading live intelligence...</div>;

  const alertColors: Record<string, string> = {
    critical: 'bg-red-500', high: 'bg-orange-500', elevated: 'bg-yellow-500', normal: 'bg-green-500',
  };

  return (
    <div className="space-y-5">
      {/* Overall Alert Level */}
      {liveRisk && (
        <div className={`card border-l-4 ${liveRisk.overall_alert_level === 'critical' ? 'border-l-red-500' : liveRisk.overall_alert_level === 'high' ? 'border-l-orange-500' : liveRisk.overall_alert_level === 'elevated' ? 'border-l-yellow-500' : 'border-l-green-500'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${alertColors[liveRisk.overall_alert_level] || 'bg-gray-400'} animate-pulse`} />
            <div>
              <div className="text-sm font-bold uppercase text-gray-700 dark:text-gray-300">
                System Status: {liveRisk.overall_alert_level}
              </div>
              <div className="text-xs text-gray-400">Updated {new Date(liveRisk.generated_at).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* Live Risk KPI Cards */}
      {liveRisk && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <AIStatCard label="Critical Alerts" value={liveRisk.critical_alerts} icon={AlertTriangle} color="#dc2626" />
          <AIStatCard label="High Risk WPs" value={liveRisk.high_risk_water_points} icon={Droplets} color="#ea580c" />
          <AIStatCard label="Contamination (30d)" value={liveRisk.contamination_events_30d} icon={TestTube} color="#d97706" />
          <AIStatCard label="Drought Districts" value={liveRisk.drought_affected_districts} icon={CloudRain} color="#b45309" />
          <AIStatCard label="Active Outbreaks" value={liveRisk.active_outbreaks} icon={Activity} color="#dc2626" />
          <AIStatCard label="Pending Reports" value={liveRisk.pending_citizen_reports} icon={FileText} color="#2563eb" />
        </div>
      )}

      {/* Environmental Risk Index */}
      {riskIndex && (
        <div className="card">
          <h3 className="section-title mb-4"><Shield size={16} className="text-blue-600" /> Environmental Risk Index</h3>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <div className={`text-4xl font-black ${riskIndex.risk_level === 'critical' ? 'text-red-500' : riskIndex.risk_level === 'high' ? 'text-orange-500' : riskIndex.risk_level === 'medium' ? 'text-yellow-500' : 'text-green-500'}`}>
                {riskIndex.overall_risk_score}
              </div>
              <div className="text-xs text-gray-400 mt-1">Overall Risk</div>
            </div>
            <div className="flex-1 grid grid-cols-5 gap-2">
              {Object.entries(riskIndex.components || {}).map(([key, val]) => (
                <div key={key} className="text-center">
                  <div className="text-lg font-bold text-gray-700 dark:text-gray-300">{Math.round(val as number)}</div>
                  <div className="text-[10px] text-gray-400 capitalize">{key.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Operational Insights */}
      {insights && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AIStatCard label="Total Water Points" value={insights.total_water_points} icon={Droplets} color="#2563eb" />
          <AIStatCard label="Functionality Rate" value={`${insights.functionality_rate}%`} icon={Activity} color="#16a34a" />
          <AIStatCard label="Active Alerts" value={insights.active_alerts} icon={AlertTriangle} color="#ea580c" />
          <AIStatCard label="Pending Maintenance" value={insights.pending_maintenance} icon={Wrench} color="#d97706" />
        </div>
      )}

      {/* District Risk Heatmap */}
      {districtRisks.length > 0 && (
        <div className="card">
          <h3 className="section-title mb-4"><Map size={16} className="text-blue-600" /> District Risk Heatmap</h3>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">District</th>
                  <th className="th">Overall Risk</th>
                  <th className="th">Water Security</th>
                  <th className="th">Water Quality</th>
                  <th className="th">Infrastructure</th>
                  <th className="th">Climate</th>
                  <th className="th">Health</th>
                  <th className="th">Community</th>
                </tr>
              </thead>
              <tbody>
                {districtRisks.map(d => (
                  <tr key={d.district} className="tr">
                    <td className="td font-medium">{d.district}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${d.overall_risk}%`, background: d.risk_level === 'critical' ? '#dc2626' : d.risk_level === 'high' ? '#ea580c' : d.risk_level === 'medium' ? '#d97706' : '#16a34a' }} />
                        </div>
                        <span className="text-xs font-medium">{d.overall_risk}</span>
                      </div>
                    </td>
                    <td className="td">
                      <span className={`text-xs font-bold ${d.water_security_score >= 70 ? 'text-green-600' : d.water_security_score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {d.water_security_score}
                      </span>
                    </td>
                    <td className="td text-xs">{Math.round(d.components?.water_quality_risk || 0)}</td>
                    <td className="td text-xs">{Math.round(d.components?.infrastructure_risk || 0)}</td>
                    <td className="td text-xs">{Math.round(d.components?.climate_risk || 0)}</td>
                    <td className="td text-xs">{Math.round(d.components?.health_risk || 0)}</td>
                    <td className="td text-xs">{Math.round(d.components?.community_risk || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Point-level Heatmap */}
      {heatmap.length > 0 && (
        <div className="card">
          <h3 className="section-title mb-4"><Layers size={16} className="text-blue-600" /> High-Risk Water Points</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {heatmap.filter(h => h.risk_level !== 'low').slice(0, 12).map(h => (
              <div key={`${h.district}-${h.water_point_id || h.name}`} className={`p-3 rounded-xl border ${h.risk_level === 'critical' ? 'border-red-200 bg-red-50' : h.risk_level === 'high' ? 'border-orange-200 bg-orange-50' : 'border-yellow-200 bg-yellow-50'}`}>
                <div className="font-semibold text-sm text-gray-800">{h.name || h.district}</div>
                <div className="text-xs text-gray-500 mt-0.5">Risk: {h.risk_score} · {h.risk_level}</div>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] bg-white px-1.5 py-0.5 rounded">{h.alert_count} alerts</span>
                  <span className="text-[10px] bg-white px-1.5 py-0.5 rounded">{h.recent_reports} reports</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   Decision Support Tab
════════════════════════════════════════════ */
function DecisionSupportTab() {
  const [prioritized, setPrioritized] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);

  useEffect(() => {
    getPrioritizedIncidents(20).then(res => {
      setPrioritized(res.data?.incidents || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleGetStrategy = async (inc: any) => {
    setSelectedIncident(inc);
    try {
      const res = await getResponseStrategy(inc.incident_type || 'water_pollution', inc.severity || 'medium', inc.district, 0);
      setStrategy(res.data?.strategy);
    } catch {}
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading incidents...</div>;

  return (
    <div className="space-y-5">
      {/* Prioritized Incidents */}
      <div className="card">
        <h3 className="section-title mb-4"><Target size={16} className="text-blue-600" /> Prioritized Incidents</h3>
        {prioritized.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No pending incidents requiring prioritization.</p>
        ) : (
          <div className="space-y-2">
            {prioritized.map(inc => (
              <div key={inc.id} onClick={() => handleGetStrategy(inc)}
                className={`p-3 rounded-xl border cursor-pointer transition-colors ${selectedIncident?.id === inc.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-800">{inc.reporter_name}</span>
                      <RiskBadge level={inc.ai_severity || inc.severity} />
                      {inc.is_duplicate ? <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">Duplicate</span> : null}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{inc.incident_type} · {inc.district}</div>
                    <div className="text-xs text-gray-600 mt-1 line-clamp-2">{inc.description}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-gray-700">{inc.ai_risk_score || '—'}</div>
                    <div className="text-[10px] text-gray-400">AI Risk</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Response Strategy */}
      {strategy && (
        <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10">
          <h3 className="section-title mb-3"><GitCompare size={16} className="text-blue-600" /> Recommended Response Strategy</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 uppercase font-semibold mb-2">Timeline</div>
              <div className="text-lg font-bold text-blue-600">{strategy.response_timeline}</div>
              <div className="mt-3">
                <div className="text-xs text-gray-400 uppercase font-semibold mb-2">Responsible Departments</div>
                <div className="flex flex-wrap gap-1">
                  {strategy.responsible_departments.map((d: string) => (
                    <span key={d} className="text-xs bg-white px-2 py-1 rounded-lg border border-gray-200">{d.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase font-semibold mb-2">Recommended Actions</div>
              <div className="space-y-1">
                {strategy.recommended_actions.map((a: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 mt-0.5">→</span>
                    <span className="text-gray-700">{a}</span>
                  </div>
                ))}
              </div>
              {strategy.required_resources.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Required Resources</div>
                  <div className="flex flex-wrap gap-1">
                    {strategy.required_resources.map((r: string) => (
                      <span key={r} className="text-xs bg-yellow-50 px-2 py-0.5 rounded-lg border border-yellow-200 text-yellow-700">{r.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Decision Tools */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center">
          <Radio size={24} className="text-blue-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-gray-700">Auto-Escalate</div>
          <div className="text-xs text-gray-400 mt-1">AI evaluates if escalation is needed</div>
        </div>
        <div className="card text-center">
          <Target size={24} className="text-green-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-gray-700">Auto-Assign</div>
          <div className="text-xs text-gray-400 mt-1">Assign tasks to appropriate teams</div>
        </div>
        <div className="card text-center">
          <Globe size={24} className="text-purple-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-gray-700">Agency Coordination</div>
          <div className="text-xs text-gray-400 mt-1">Multi-agency response coordination</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════ */
export default function AIHub() {
  const { user } = useAuth();
  const { aiOnline: aiOnlineCtx, status } = useAIService();
  const [tab, setTab] = useState('Overview');
  const [dashboard, setDashboard] = useState<AIDashboard | null>(null);
  const [failures, setFailures]   = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<AIAnomaly[]>([]);
  const [forecast, setForecast]   = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [aiOffline, setAiOffline] = useState(false);
  const [aiRecovering, setAiRecovering] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [genReport, setGenReport]   = useState(false);

  const role     = user?.role || 'citizen';
  const district = user?.district;
  const tabs     = ROLE_TABS[role] || ['Overview', 'Smart Alerts'];

  const load = async () => {
    setLoading(true);
    setAiOffline(false);
    setAiRecovering(false);
    if (!aiOnlineCtx) {
      if (status === 'reconnecting' || status === 'offline' || status === 'error') {
        setAiRecovering(true);
      } else {
        setAiOffline(true);
      }
      setLoading(false);
      return;
    }
    try {
      const [dash, fail, anom, fore] = await Promise.all([
        getAIDashboard(role, district),
        getFailurePredictions(district),
        getAnomalies(district),
        getAIClimateForecast(district),
      ]);
      setDashboard(dash.data);
      setFailures(fail.data.predictions || []);
      setAnomalies(anom.data.anomalies || []);
      setForecast(fore.data);
    } catch {
      setAiRecovering(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [role, district, aiOnlineCtx]);

  // Auto-generate when user opens the AI Reports tab with no report yet
  useEffect(() => {
    if (tab === 'AI Reports' && !reportData && !genReport) {
      handleGenerateReport();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildLocalReport = () => {
    const aiSum    = (dashboard as any)?.ai_summary    || {};
    const sysStats = (dashboard as any)?.system_stats  || {};
    const climate  = (dashboard as any)?.climate_outlook || {};
    const recs     = (dashboard as any)?.ai_recommendations || [];
    const now      = new Date().toISOString();
    const scope    = district ? `District: ${district}` : 'National (All Districts)';
    const total    = sysStats.total_water_points   || 0;
    const func     = sysStats.functional_water_points ?? sysStats.functional ?? 0;
    const funcPct  = total > 0 ? Math.round((func / total) * 100) : 0;
    const critical = aiSum.critical_failure_risk   || 0;
    const hotspots = aiSum.contamination_hotspots  || 0;
    const anomCount= aiSum.sensor_anomalies        || 0;
    const smAlerts = aiSum.smart_alerts_generated  || 0;
    const pendMaint= sysStats.pending_maintenance  || 0;

    return {
      title: 'HYDROSENSE AI Executive Summary Report',
      generated_at: now,
      scope,
      role,
      executive_summary:
        `As of ${now.slice(0, 10)}, HYDROSENSE AI has analysed ${total} water points across ${scope}. ` +
        `${func} (${funcPct}%) are currently functional. ` +
        `${critical} sites are at critical failure risk, ${hotspots} contamination hotspots detected, ` +
        `and ${anomCount} sensor anomalies flagged in the last 24 hours. ` +
        `${smAlerts} AI-generated smart alerts are active and ${pendMaint} maintenance requests remain pending.`,
      key_findings: [
        `Total water points monitored: ${total}`,
        `Functional water points: ${func} (${funcPct}%)`,
        `Critical failure risk sites: ${critical}`,
        `Contamination hotspots detected: ${hotspots}`,
        `Sensor anomalies (last 24h): ${anomCount}`,
        `AI smart alerts generated: ${smAlerts}`,
        `Pending maintenance requests: ${pendMaint}`,
        climate.outlook ? `Climate outlook: ${String(climate.outlook).replace(/_/g, ' ')}` : null,
      ].filter(Boolean),
      recommendations: recs.length > 0 ? recs : [
        'Conduct immediate inspection of all critical-risk water points.',
        'Investigate contamination hotspots and issue public health advisories.',
        'Resolve flagged sensor anomalies to ensure accurate monitoring.',
        'Clear pending maintenance backlog to prevent service disruptions.',
        'Review and action all pending citizen environmental reports.',
      ],
      narrative: null,
    };
  };

  const handleGenerateReport = async () => {
    setGenReport(true);
    // Build report immediately from already-loaded dashboard data
    const localReport = buildLocalReport();
    setReportData(localReport);
    setTab('AI Reports');

    // Then try to enrich it with a Gemini narrative in the background
    try {
      const res = await generateAIReport('executive_summary', role, district);
      if (res.data?.report) {
        setReportData(res.data.report);
      } else if (localReport.narrative === null) {
        // API returned something but no report — keep local report, it's already set
      }
    } catch {
      // Network/server error — local report already visible, nothing to do
    } finally {
      setGenReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
            <Brain size={30} className="text-white" />
          </div>
          <div className="text-blue-700 dark:text-blue-400 font-bold">HYDROSENSE AI</div>
          <div className="text-gray-400 text-sm mt-1">Loading intelligence engine...</div>
          <div className="mt-3 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (aiOffline) return <AIRecovery />;
  if (aiRecovering) return <AIRecovery />;

  const aiSum  = dashboard?.ai_summary;
  const sysStats = dashboard?.system_stats;

  /* ── Prepare chart data ── */
  const failureChartData = failures.slice(0, 10).map(f => ({
    name:  f.name.length > 12 ? f.name.slice(0, 12) + '…' : f.name,
    score: f.failure_risk_score,
    fill:  RISK_COLOR[f.risk_level] || '#16a34a',
  }));

  const forecastChartData: AIForecastMonth[] = forecast?.forecast || [];

  const radarData = [
    { subject: 'Failure Risk',    A: Math.min((aiSum?.critical_failure_risk || 0) * 10, 100) },
    { subject: 'Contamination',   A: Math.min((aiSum?.contamination_hotspots || 0) * 15, 100) },
    { subject: 'Anomalies',       A: Math.min((aiSum?.sensor_anomalies || 0) * 8, 100) },
    { subject: 'Maintenance',     A: Math.min(((sysStats?.pending_maintenance || 0) / Math.max(sysStats?.total_water_points||1,1)) * 100, 100) },
    { subject: 'Alert Load',      A: Math.min((sysStats?.active_alerts || 0) * 5, 100) },
  ];

  const droughtDist = forecast?.summary?.drought_severity_distribution || {};
  const droughtPieData = Object.entries(droughtDist).map(([k, v]) => ({
    name: k.replace(/_/g, ' '), value: v as number, fill: DROUGHT_COLOR[k] || '#6b7280',
  }));

  return (
    <div className="space-y-5">

      {/* ── Hero Banner ── */}
      <div className="rounded-2xl p-4 sm:p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#1d4ed8 50%,#0891b2 100%)' }}>
        <div className="absolute -right-6 -top-6 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute right-8 bottom-0 w-24 h-24 rounded-full bg-white/4" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Brain size={16} className="text-cyan-300 flex-shrink-0" />
              <span className="text-cyan-300 text-xs font-semibold tracking-wide">HYDROSENSE AI ENGINE</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">AI Intelligence Hub</h2>
            <p className="text-blue-200 text-xs sm:text-sm mt-0.5 truncate">
              {role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              {district ? ` · ${district}` : ' · National'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                `${aiSum?.critical_failure_risk || 0} Critical`,
                `${aiSum?.sensor_anomalies || 0} Anomalies`,
                `${aiSum?.smart_alerts_generated || 0} AI Alerts`,
              ].map(t => (
                <span key={t} className="px-2 py-0.5 rounded-lg bg-white/15 text-[11px] font-semibold border border-white/20">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 items-start flex-shrink-0">
            <button onClick={load}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors border border-white/20"
              title="Refresh AI data">
              <RefreshCw size={15} className="text-white" />
            </button>
            <button onClick={handleGenerateReport} disabled={genReport}
              className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 border border-white/25 text-xs font-bold transition-colors flex items-center gap-1.5">
              {genReport ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                         : <FileText size={13} />}
              {genReport ? 'Generating…' : 'AI Report'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              tab === t
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
            }`}>{t}</button>
        ))}
      </div>

      {/* ══════════════ TAB: OVERVIEW ══════════════ */}
      {tab === 'Overview' && (
        <div className="space-y-5">
          {/* AI KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <AIStatCard label="Critical Failure Risk" value={aiSum?.critical_failure_risk || 0}
              sub="water points at critical risk" icon={AlertTriangle} color="#dc2626" trend="up" />
            <AIStatCard label="Contamination Hotspots" value={aiSum?.contamination_hotspots || 0}
              sub="high-risk sites detected" icon={TestTube} color="#ea580c" />
            <AIStatCard label="Sensor Anomalies" value={aiSum?.sensor_anomalies || 0}
              sub="detected in last 24h" icon={Cpu} color="#d97706" />
            <AIStatCard label="AI Smart Alerts" value={aiSum?.smart_alerts_generated || 0}
              sub="generated by AI engine" icon={Zap} color="#7c3aed" />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Risk Radar */}
            <div className="card">
              <h3 className="section-title mb-4"><Brain size={16} className="text-purple-500" /> AI Risk Radar</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <Radar name="Risk" dataKey="A" stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Top at-risk sites */}
            <div className="card">
              <div className="card-header">
                <h3 className="section-title"><AlertTriangle size={16} className="text-red-500" /> Top Failure Risks</h3>
                <button onClick={() => setTab('Predictions')} className="text-xs text-blue-600 hover:underline font-medium">View All →</button>
              </div>
              <div className="space-y-2">
                {(dashboard?.top_predictions || []).slice(0, 5).map(f => (
                  <div key={f.water_point_id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${RISK_BG[f.risk_level]}`}>
                    <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: RISK_COLOR[f.risk_level] }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{f.name}</div>
                      <div className="text-xs text-gray-500">{f.district} · {f.type?.replace(/_/g,' ')}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-extrabold" style={{ color: RISK_COLOR[f.risk_level] }}>
                        {f.failure_risk_score}%
                      </div>
                      <RiskBadge level={f.risk_level} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Recommendations */}
          {(dashboard?.ai_recommendations || []).length > 0 && (
            <div className="card" style={{ background: 'linear-gradient(135deg,#eff6ff,#f5f3ff)', border: '1px solid #bfdbfe' }}>
              <h3 className="section-title mb-3"><Brain size={16} className="text-blue-600" /> AI Recommendations</h3>
              <div className="space-y-2">
                {(dashboard?.ai_recommendations || []).map((r, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i+1}</span>
                    <span className="text-gray-700 dark:text-gray-300">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* District risk summary (admin only) */}
          {role === 'national_admin' && (dashboard?.district_risk_summary || []).length > 0 && (
            <div className="card">
              <h3 className="section-title mb-4"><BarChart3 size={16} className="text-blue-600" /> District Risk Summary</h3>
              <div className="table-container">
                <table className="table">
                  <thead><tr>
                    <th className="th">District</th><th className="th">Total Sites</th>
                    <th className="th">Critical</th><th className="th">High</th><th className="th">Avg Score</th>
                  </tr></thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                    {(dashboard?.district_risk_summary || []).slice(0, 10).map((d: any, i: number) => (
                      <tr key={d.district} className="tr">
                        <td className="td font-semibold">{d.district}</td>
                        <td className="td">{d.total}</td>
                        <td className="td"><span className="text-red-600 font-bold">{d.critical}</span></td>
                        <td className="td"><span className="text-orange-600 font-bold">{d.high}</span></td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${d.avg_score}%`, background: RISK_COLOR[d.avg_score >= 75 ? 'critical' : d.avg_score >= 50 ? 'high' : d.avg_score >= 25 ? 'medium' : 'low'] }} />
                            </div>
                            <span className="text-xs font-bold">{d.avg_score}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TAB: PREDICTIONS ══════════════ */}
      {tab === 'Predictions' && (
        <div className="space-y-5">
          {/* Bar chart */}
          <div className="card">
            <h3 className="section-title mb-4"><Activity size={16} className="text-blue-600" /> Water Failure Risk Scores (Top 10)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={failureChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={45} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Failure Risk']} />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {failureChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Full failure predictions table */}
          <div className="card">
            <h3 className="section-title mb-4"><Droplets size={16} className="text-blue-600" /> All Water Failure Predictions</h3>
            <div className="table-container">
              <table className="table">
                <thead><tr>
                  <th className="th">Water Point</th><th className="th">District</th>
                  <th className="th">Risk Score</th><th className="th">Risk Level</th>
                  <th className="th">Est. Days to Failure</th><th className="th">Beneficiaries</th>
                </tr></thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                  {failures.map(f => (
                    <tr key={f.water_point_id} className="tr">
                      <td className="td">
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{f.name}</div>
                        <div className="text-xs text-gray-400">{f.type?.replace(/_/g,' ')}</div>
                      </td>
                      <td className="td text-gray-600 dark:text-gray-400">{f.district}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${f.failure_risk_score}%`, background: RISK_COLOR[f.risk_level] }} />
                          </div>
                          <span className="text-sm font-bold" style={{ color: RISK_COLOR[f.risk_level] }}>{f.failure_risk_score}%</span>
                        </div>
                      </td>
                      <td className="td"><RiskBadge level={f.risk_level} /></td>
                      <td className="td text-gray-600 dark:text-gray-400">{f.days_to_failure ? `~${f.days_to_failure} days` : '—'}</td>
                      <td className="td">{(f.beneficiaries || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: ANOMALIES ══════════════ */}
      {tab === 'Anomalies' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {(['critical','high','medium'] as const).map(s => {
              const count = anomalies.filter(a => a.severity === s).length;
              return (
                <div key={s} className={`card border ${RISK_BG[s]} text-center`}>
                  <div className="text-2xl font-extrabold" style={{ color: RISK_COLOR[s] }}>{count}</div>
                  <div className="text-xs text-gray-500 capitalize mt-0.5">{s} Anomalies</div>
                </div>
              );
            })}
          </div>

          {anomalies.length === 0 ? (
            <div className="card text-center py-10">
              <Shield size={32} className="mx-auto text-green-400 mb-2" />
              <div className="text-green-600 font-bold">No Anomalies Detected</div>
              <div className="text-sm text-gray-400 mt-1">All sensor readings within normal range.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {anomalies.map((a, i) => (
                <div key={i} className={`card border ${RISK_BG[a.severity]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: RISK_COLOR[a.severity] + '20' }}>
                        <Eye size={18} style={{ color: RISK_COLOR[a.severity] }} />
                      </div>
                      <div>
                        <div className="font-bold text-gray-800 dark:text-gray-100 text-sm">
                          {a.sensor_type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())} · {a.water_point}
                        </div>
                        <div className="text-xs text-gray-500">{a.district} · {a.sensor_name}</div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{a.description}</p>
                        <p className="text-xs font-semibold mt-1" style={{ color: RISK_COLOR[a.severity] }}>
                          {a.recommendation}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xl font-extrabold" style={{ color: RISK_COLOR[a.severity] }}>
                        z={a.z_score}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {a.current_value} vs ~{a.expected_mean} {a.unit}
                      </div>
                      <RiskBadge level={a.severity} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TAB: CLIMATE AI ══════════════ */}
      {tab === 'Climate AI' && forecast && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Avg SPI',         value: forecast.summary?.avg_spi?.toFixed(2),    color: '#0891b2' },
              { label: 'Avg Rainfall (mm)',value: forecast.summary?.avg_rainfall_mm?.toFixed(1), color: '#2563eb' },
              { label: 'Avg Max Temp (°C)',value: forecast.summary?.avg_temp_max_c?.toFixed(1),  color: '#ea580c' },
              { label: 'SPI Trend',        value: forecast.summary?.spi_trend?.replace(/_/g,' '), color: '#7c3aed' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card text-center" style={{ borderTop: `3px solid ${color}` }}>
                <div className="text-xl font-extrabold" style={{ color }}>{value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* 6-month forecast chart */}
          <div className="card">
            <h3 className="section-title mb-4"><CloudRain size={16} className="text-blue-500" /> 6-Month AI Rainfall Forecast (mm)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={forecastChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v} mm`, 'Rainfall']} />
                <Area type="monotone" dataKey="predicted_rainfall_mm"
                  stroke="#2563eb" fill="url(#rainGrad)" strokeWidth={2} dot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* SPI forecast chart */}
          <div className="card">
            <h3 className="section-title mb-4"><TrendingDown size={16} className="text-orange-500" /> 6-Month Drought Index (SPI) Forecast</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={forecastChartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[-2.5, 2.5]} />
                <Tooltip formatter={(v: any) => [v, 'SPI']} />
                <Line type="monotone" dataKey="predicted_spi" stroke="#ea580c" strokeWidth={2.5}
                  dot={{ r: 5, fill: '#ea580c' }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-3 flex-wrap text-xs">
              {[['Extreme Drought','#7f1d1d'],['Severe','#dc2626'],['Moderate','#ea580c'],['Mild','#d97706'],['Normal','#16a34a']].map(([l,c]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: c }} />{l}
                </span>
              ))}
            </div>
          </div>

          {/* Drought distribution pie + monthly table */}
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="card">
              <h3 className="section-title mb-4"><BarChart3 size={16} className="text-cyan-500" /> Drought Severity Distribution</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={droughtPieData} cx="50%" cy="50%" outerRadius={75} innerRadius={30}
                    dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine>
                    {droughtPieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3 className="section-title mb-3"><CloudRain size={16} className="text-blue-500" /> Monthly Forecast Detail</h3>
              <div className="table-container">
                <table className="table">
                  <thead><tr>
                    <th className="th">Month</th><th className="th">Rain (mm)</th>
                    <th className="th">SPI</th><th className="th">Confidence</th>
                  </tr></thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100">
                    {forecastChartData.map(m => (
                      <tr key={m.month} className="tr">
                        <td className="td font-semibold">{m.month}</td>
                        <td className="td">{m.predicted_rainfall_mm}</td>
                        <td className="td"><span style={{ color: m.predicted_spi < 0 ? '#ea580c' : '#16a34a', fontWeight: 700 }}>{m.predicted_spi}</span></td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${m.confidence}%` }} />
                            </div>
                            <span className="text-xs">{m.confidence}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Climate Recommendations */}
          {(forecast?.recommendations || []).length > 0 && (
            <div className="card" style={{ background: 'linear-gradient(135deg,#ecfdf5,#f0fdf4)', border: '1px solid #bbf7d0' }}>
              <h3 className="section-title mb-3"><Brain size={16} className="text-green-600" /> AI Climate Recommendations</h3>
              {forecast.recommendations.map((r: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm text-green-800 mb-2">
                  <ChevronRight size={15} className="text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TAB: SMART ALERTS ══════════════ */}
      {tab === 'Smart Alerts' && (
        <div className="space-y-3">
          {(dashboard?.smart_alerts || []).length === 0 ? (
            <div className="card text-center py-10">
              <Shield size={32} className="mx-auto text-green-400 mb-2" />
              <div className="text-green-600 font-bold">No Smart Alerts</div>
              <div className="text-sm text-gray-400 mt-1">AI analysis found no high-priority issues.</div>
            </div>
          ) : (
            (dashboard?.smart_alerts || []).map((a: any, i: number) => (
              <div key={i} className={`card border ${RISK_BG[a.severity] || RISK_BG.medium}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: (RISK_COLOR[a.severity] || '#d97706') + '20' }}>
                    <Zap size={18} style={{ color: RISK_COLOR[a.severity] || '#d97706' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">{a.title}</span>
                      <RiskBadge level={a.severity} />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{a.message}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      <span>📍 {a.district}</span>
                      <span>🤖 {a.source}</span>
                      <span>Score: {Math.round(a.score)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════ TAB: AI REPORTS ══════════════ */}
      {tab === 'AI Reports' && (
        <div className="space-y-5">

          {/* Loading state */}
          {genReport && !reportData && (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                <Brain size={26} className="text-white animate-pulse" />
              </div>
              <div className="font-bold text-gray-700 dark:text-gray-300 text-base">Generating AI Report…</div>
              <div className="text-sm text-gray-400 mt-1">Analysing system data and compiling insights</div>
              <div className="mt-4 flex gap-1.5">
                {[0,1,2].map(i => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state — generation failed or not started yet */}
          {!genReport && !reportData && (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <FileText size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
              <div className="font-bold text-gray-600 dark:text-gray-300">No Report Yet</div>
              <p className="text-sm text-gray-400 mt-1 mb-5 max-w-xs">
                Generate an AI-powered executive summary of the current water infrastructure status.
              </p>
              <button onClick={handleGenerateReport} className="btn-primary flex items-center gap-2">
                <Brain size={15} /> Generate AI Report
              </button>
            </div>
          )}

          {/* Report content */}
          {reportData && (
            <div id="printable-report" className="space-y-4">

              {/* Report header */}
              <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="section-title"><FileText size={16} className="text-blue-600" /> {reportData.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {reportData.scope} · Generated {new Date(reportData.generated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                    >
                      <Printer size={13} /> Print / Save PDF
                    </button>
                    <button onClick={handleGenerateReport} disabled={genReport} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                      {genReport ? <><RefreshCw size={12} className="animate-spin" /> Generating…</> : <><RefreshCw size={12} /> Regenerate</>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Executive Summary + Key Findings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">Executive Summary</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{reportData.executive_summary}</p>
                  {reportData.narrative && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      {reportData.narrative}
                    </div>
                  )}
                </div>
                <div className="card">
                  <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">Key Findings</h4>
                  <div className="space-y-2">
                    {(reportData.key_findings || []).map((f: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="w-5 h-5 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i+1}</span>
                        <span className="text-gray-700 dark:text-gray-300">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Recommendations */}
              <div className="rounded-2xl shadow-sm p-3 sm:p-5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                <h3 className="text-base font-bold flex items-center gap-2 mb-3 text-gray-800 dark:text-gray-100">
                  <Brain size={16} className="text-purple-600 dark:text-purple-400" /> AI Recommendations
                </h3>
                {(reportData.recommendations || []).map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 mb-2">
                    <ChevronRight size={15} className="text-purple-500 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>

              {/* Print hint */}
              <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-2">
                Tap <strong>Print / Save PDF</strong> to download or print this report.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════
          Live Intelligence Tab
         ═══════════════════════════════════════════ */}
      {tab === 'Live Intelligence' && <LiveIntelligenceTab />}

      {/* ═══════════════════════════════════════════
          Decision Support Tab
         ═══════════════════════════════════════════ */}
      {tab === 'Decision Support' && <DecisionSupportTab />}

      {/* ═══════════════════════════════════════════
          Conversations Tab
         ═══════════════════════════════════════════ */}
      {tab === 'Conversations' && <ConversationWorkspace />}

    </div>
  );
}
