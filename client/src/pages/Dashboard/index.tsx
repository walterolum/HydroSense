import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplets, AlertTriangle, Wrench, TestTube, Heart, CloudRain,
  Users, CheckCircle, XCircle, Activity, Cpu, Map,
  BarChart3, ShieldCheck, Zap,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import {
  getAnalyticsOverview, getAlerts, getMaintenanceRequests,
  getHealthStats, getDroughtIndex,
} from '../../api/client';

const PIE_COLORS = ['#16a34a', '#dc2626', '#ea580c', '#d97706'];

/* ─────────────────────────────────────────────────────────────
   Role-specific quick-action configs
───────────────────────────────────────────────────────────── */
interface QuickAction { to: string; icon: React.ElementType; label: string; sub: string; color: string; bg: string; }

const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  national_admin: [
    { to: '/analytics',          icon: BarChart3,    label: 'National Analytics', sub: 'Full report',         color: 'text-blue-600',   bg: 'bg-blue-50 hover:bg-blue-100' },
    { to: '/emergency',          icon: AlertTriangle,label: 'Emergency Center',   sub: 'View all alerts',     color: 'text-red-600',    bg: 'bg-red-50 hover:bg-red-100' },
    { to: '/governance',         icon: ShieldCheck,  label: 'Governance',         sub: 'Audit & budgets',     color: 'text-purple-600', bg: 'bg-purple-50 hover:bg-purple-100' },
    { to: '/gis',                icon: Map,          label: 'GIS Map',            sub: 'National overview',   color: 'text-emerald-600',bg: 'bg-emerald-50 hover:bg-emerald-100' },
  ],
  district_officer: [
    { to: '/water-infrastructure',icon: Droplets,    label: 'My District Points', sub: 'Manage water points', color: 'text-blue-600',   bg: 'bg-blue-50 hover:bg-blue-100' },
    { to: '/maintenance',        icon: Wrench,       label: 'Maintenance',        sub: 'Approve requests',    color: 'text-orange-600', bg: 'bg-orange-50 hover:bg-orange-100' },
    { to: '/water-quality',      icon: TestTube,     label: 'Water Quality',      sub: 'District tests',      color: 'text-cyan-600',   bg: 'bg-cyan-50 hover:bg-cyan-100' },
    { to: '/emergency',          icon: AlertTriangle,label: 'District Alerts',    sub: 'Active alerts',       color: 'text-red-600',    bg: 'bg-red-50 hover:bg-red-100' },
  ],
  community_committee: [
    { to: '/community',          icon: Users,        label: 'Submit Report',      sub: 'Report an issue',     color: 'text-emerald-600',bg: 'bg-emerald-50 hover:bg-emerald-100' },
    { to: '/water-infrastructure',icon: Droplets,    label: 'Water Sources',      sub: 'Local water points',  color: 'text-blue-600',   bg: 'bg-blue-50 hover:bg-blue-100' },
    { to: '/maintenance',        icon: Wrench,       label: 'Request Repair',     sub: 'Maintenance request', color: 'text-orange-600', bg: 'bg-orange-50 hover:bg-orange-100' },
    { to: '/emergency',          icon: AlertTriangle,label: 'Emergency Alert',    sub: 'Report emergency',    color: 'text-red-600',    bg: 'bg-red-50 hover:bg-red-100' },
  ],
  ngo_officer: [
    { to: '/water-infrastructure',icon: Droplets,    label: 'Project Points',     sub: 'Supported sources',   color: 'text-blue-600',   bg: 'bg-blue-50 hover:bg-blue-100' },
    { to: '/analytics',          icon: BarChart3,    label: 'Analytics',          sub: 'Area insights',       color: 'text-purple-600', bg: 'bg-purple-50 hover:bg-purple-100' },
    { to: '/community',          icon: Users,        label: 'Community Reports',  sub: 'View & submit',       color: 'text-emerald-600',bg: 'bg-emerald-50 hover:bg-emerald-100' },
    { to: '/governance',         icon: ShieldCheck,  label: 'Governance',         sub: 'Transparency',        color: 'text-orange-600', bg: 'bg-orange-50 hover:bg-orange-100' },
  ],
  technician: [
    { to: '/maintenance',        icon: Wrench,       label: 'My Tasks',           sub: 'Assigned repairs',    color: 'text-orange-600', bg: 'bg-orange-50 hover:bg-orange-100' },
    { to: '/sensors',            icon: Cpu,          label: 'IoT Sensors',        sub: 'Sensor conditions',   color: 'text-blue-600',   bg: 'bg-blue-50 hover:bg-blue-100' },
    { to: '/water-infrastructure',icon: Droplets,    label: 'Water Points',       sub: 'Assigned sites',      color: 'text-cyan-600',   bg: 'bg-cyan-50 hover:bg-cyan-100' },
    { to: '/emergency',          icon: AlertTriangle,label: 'Alerts',             sub: 'Active issues',       color: 'text-red-600',    bg: 'bg-red-50 hover:bg-red-100' },
  ],
  health_officer: [
    { to: '/health',             icon: Heart,        label: 'Health Dashboard',   sub: 'Incidents & cases',   color: 'text-red-600',    bg: 'bg-red-50 hover:bg-red-100' },
    { to: '/water-quality',      icon: TestTube,     label: 'Water Quality',      sub: 'Quality tests',       color: 'text-cyan-600',   bg: 'bg-cyan-50 hover:bg-cyan-100' },
    { to: '/emergency',          icon: AlertTriangle,label: 'Emergency',          sub: 'Contamination alerts',color: 'text-orange-600', bg: 'bg-orange-50 hover:bg-orange-100' },
    { to: '/analytics',          icon: BarChart3,    label: 'Analytics',          sub: 'Health trends',       color: 'text-purple-600', bg: 'bg-purple-50 hover:bg-purple-100' },
  ],
  climate_scientist: [
    { to: '/climate',            icon: CloudRain,    label: 'Climate Monitor',    sub: 'Forecasts & SPI',     color: 'text-blue-600',   bg: 'bg-blue-50 hover:bg-blue-100' },
    { to: '/analytics',          icon: BarChart3,    label: 'AI Forecasting',     sub: 'Predictive models',   color: 'text-purple-600', bg: 'bg-purple-50 hover:bg-purple-100' },
    { to: '/sensors',            icon: Cpu,          label: 'IoT Sensors',        sub: 'Live readings',       color: 'text-cyan-600',   bg: 'bg-cyan-50 hover:bg-cyan-100' },
    { to: '/gis',                icon: Map,          label: 'GIS Mapping',        sub: 'Spatial analysis',    color: 'text-emerald-600',bg: 'bg-emerald-50 hover:bg-emerald-100' },
  ],
  citizen: [
    { to: '/community',          icon: Users,        label: 'Report Issue',       sub: 'Submit a complaint',  color: 'text-emerald-600',bg: 'bg-emerald-50 hover:bg-emerald-100' },
    { to: '/emergency',          icon: AlertTriangle,label: 'Emergency',          sub: 'Report emergency',    color: 'text-red-600',    bg: 'bg-red-50 hover:bg-red-100' },
    { to: '/water-infrastructure',icon: Droplets,    label: 'Water Sources',      sub: 'Find safe water',     color: 'text-blue-600',   bg: 'bg-blue-50 hover:bg-blue-100' },
    { to: '/community',          icon: Activity,     label: 'Announcements',      sub: 'Local updates',       color: 'text-orange-600', bg: 'bg-orange-50 hover:bg-orange-100' },
  ],
};

type RoleContextFn = string | ((arg?: string) => string);
const roleContextLabel: Record<string, RoleContextFn> = {
  national_admin:      'National Dashboard · All Districts · Uganda',
  district_officer:    (d?: string) => `District Dashboard · ${d || 'Your District'}`,
  community_committee: (d?: string) => `Community Dashboard · ${d || 'Your Community'}`,
  technician:          (d?: string) => `Field Technician Dashboard · ${d || 'Assigned Zone'}`,
  health_officer:      (d?: string) => `Health Surveillance Dashboard · ${d || 'Your District'}`,
  climate_scientist:   'Climate & Environment Dashboard · Uganda',
  ngo_officer:         (o?: string) => `NGO Dashboard · ${o || 'Project Area'}`,
  citizen:             (d?: string) => `Community Portal · ${d || 'Your Area'}`,
};

function getRoleContext(role: string, district?: string, organization?: string) {
  const entry = roleContextLabel[role];
  if (!entry) return 'Water Management Dashboard';
  if (typeof entry === 'function') return entry(district || organization);
  return entry;
}

const severityColors: Record<string, string> = {
  emergency: 'border-red-500 bg-red-50',
  critical:  'border-orange-500 bg-orange-50',
  warning:   'border-yellow-500 bg-yellow-50',
  info:      'border-blue-500 bg-blue-50',
};
const severityDot: Record<string, string> = {
  emergency: 'bg-red-500',
  critical:  'bg-orange-500',
  warning:   'bg-yellow-500',
  info:      'bg-blue-500',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [healthStats, setHealthStats] = useState<any>(null);
  const [droughtData, setDroughtData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAnalyticsOverview(),
      getAlerts({ status: 'active', limit: 6 }),
      getMaintenanceRequests({ status: 'pending', limit: 5 }),
      getHealthStats(),
      getDroughtIndex(),
    ]).then(([ov, al, ma, hs, dr]) => {
      setOverview(ov.data.data);
      setAlerts(al.data.data);
      setMaintenance(ma.data.data);
      setHealthStats(hs.data.data);
      setDroughtData(dr.data.data?.slice(0, 8) || []);
    }).finally(() => setLoading(false));
  }, []);

  const role = user?.role || 'citizen';
  const quickActions = QUICK_ACTIONS[role] || QUICK_ACTIONS.citizen;

  const statusData = overview ? [
    { name: 'Functional',    value: overview.water_points?.functional || 0 },
    { name: 'Non-functional',value: overview.water_points?.broken || 0 },
    { name: 'Needs Repair',  value: Math.max(0, (overview.water_points?.total || 0) - (overview.water_points?.functional || 0) - (overview.water_points?.broken || 0)) },
  ] : [];

  const droughtChartData = droughtData.map(d => ({
    district: d.district,
    spi: parseFloat(d.spi_value?.toFixed(2) || 0),
    recharge: d.groundwater_recharge,
  }));

  const criticalAlerts = alerts.filter(a => a.severity === 'emergency' || a.severity === 'critical');

  /* ── Role-specific stat visibility ── */
  const showNationalStats   = ['national_admin'].includes(role);
  const showDistrictStats   = ['national_admin', 'district_officer', 'ngo_officer', 'community_committee'].includes(role);
  const showHealthStats     = ['national_admin', 'district_officer', 'health_officer', 'ngo_officer'].includes(role);
  const showClimateStats    = ['national_admin', 'district_officer', 'climate_scientist', 'health_officer'].includes(role);
  const showMaintenanceStats= ['national_admin', 'district_officer', 'ngo_officer', 'technician', 'community_committee'].includes(role);
  const showAlertStats      = !['citizen'].includes(role);

  return (
    <div className="space-y-5">

      {/* ── Welcome Banner ── */}
      <div
        className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)' }}
      >
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/8" />
        <div className="absolute -right-2 top-12 w-24 h-24 rounded-full bg-white/5" />

        <div className="relative flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold leading-tight">
              Welcome back, {user?.name?.split(' ')[0]} 👋
            </h2>
            <p className="text-blue-100 text-sm mt-0.5">
              {getRoleContext(role, user?.district, user?.organization)}
            </p>

            {/* Role badge */}
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 border border-white/25 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              {role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
          </div>

          <div className="text-right hidden sm:block flex-shrink-0">
            <div className="text-xs font-medium text-blue-200">System Status</div>
            <div className="flex items-center gap-1.5 justify-end mt-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-semibold">Live · Active</span>
            </div>
            {overview && (
              <div className="text-xs text-blue-200 mt-1">
                {overview.water_points?.total || 0} points · {overview.alerts?.total_active || 0} alerts
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Emergency Alerts Banner ── */}
      {criticalAlerts.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={17} className="text-red-600 animate-pulse flex-shrink-0" />
            <span className="font-bold text-red-800 dark:text-red-300 text-sm">Active Emergency / Critical Alerts</span>
            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">
              {criticalAlerts.length} Active
            </span>
          </div>
          <div className="space-y-2">
            {criticalAlerts.map(a => (
              <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl border-l-4 ${severityColors[a.severity]}`}>
                <div className={`w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0 animate-blink ${severityDot[a.severity]}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{a.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.message}</div>
                  <div className="text-xs text-gray-400 mt-0.5">📍 {a.district} · {new Date(a.created_at).toLocaleString()}</div>
                </div>
                <StatusBadge status={a.severity} type="alert" />
              </div>
            ))}
          </div>
          <Link to="/emergency" className="btn-danger mt-3 text-xs w-full justify-center">
            View Emergency Center →
          </Link>
        </div>
      )}

      {/* ── Stats Grid ── */}
      {(showDistrictStats || showNationalStats) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard loading={loading} title="Total Water Points" value={overview?.water_points?.total || 0}
            subtitle={`${(overview?.water_points?.beneficiaries || 0).toLocaleString()} beneficiaries`}
            icon={Droplets} color="blue" />
          <StatCard loading={loading} title="Functional Points" value={`${overview?.water_points?.coverage_pct || 0}%`}
            subtitle={`${overview?.water_points?.functional || 0} of ${overview?.water_points?.total || 0} operational`}
            icon={CheckCircle} color="green" />
          {showAlertStats && (
            <StatCard loading={loading} title="Active Alerts" value={overview?.alerts?.total_active || 0}
              subtitle={`${overview?.alerts?.emergency || 0} emergency, ${overview?.alerts?.critical || 0} critical`}
              icon={AlertTriangle} color="red" />
          )}
          {showMaintenanceStats && (
            <StatCard loading={loading} title="Pending Maintenance" value={overview?.maintenance?.pending || 0}
              subtitle="Awaiting assignment or repair"
              icon={Wrench} color="orange" />
          )}
        </div>
      )}

      {(showHealthStats || showClimateStats) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {showHealthStats && (
            <>
              <StatCard loading={loading} title="Avg Water Quality" value={`${overview?.water_quality?.avg_score || 0}/100`}
                subtitle={`${overview?.water_quality?.unsafe_sources || 0} unsafe sources`}
                icon={TestTube} color="cyan" />
              <StatCard loading={loading} title="Active Health Cases" value={overview?.health?.active_cases || 0}
                subtitle={`${overview?.health?.active_incidents || 0} active incidents`}
                icon={Heart} color="red" />
            </>
          )}
          {showClimateStats && (
            <>
              <StatCard loading={loading} title="Districts in Drought" value={overview?.climate?.districts_in_drought || 0}
                subtitle="Requiring water intervention"
                icon={CloudRain} color="yellow" />
              <StatCard loading={loading} title="Non-functional Points" value={overview?.water_points?.broken || 0}
                subtitle="Require immediate attention"
                icon={XCircle} color="gray" />
            </>
          )}
        </div>
      )}

      {/* Citizen simplified stats */}
      {role === 'citizen' && (
        <div className="grid grid-cols-2 gap-4">
          <StatCard loading={loading} title="Water Points Nearby" value={overview?.water_points?.functional || 0}
            subtitle="Functional sources available"
            icon={Droplets} color="blue" />
          <StatCard loading={loading} title="Active Alerts" value={overview?.alerts?.total_active || 0}
            subtitle="In your area"
            icon={AlertTriangle} color="red" />
        </div>
      )}

      {/* Technician simplified stats */}
      {role === 'technician' && (
        <div className="grid grid-cols-2 gap-4">
          <StatCard loading={loading} title="Pending Tasks" value={overview?.maintenance?.pending || 0}
            subtitle="Awaiting completion"
            icon={Wrench} color="orange" />
          <StatCard loading={loading} title="Active Sensors" value={overview?.sensors?.active || 0}
            subtitle="Online IoT devices"
            icon={Cpu} color="blue" />
        </div>
      )}

      {/* ── Charts Row ── */}
      {(showDistrictStats || showNationalStats) && (
        <div className="grid lg:grid-cols-2 gap-5">

          {/* Water Point Status Pie */}
          <div className="card">
            <div className="card-header">
              <h3 className="section-title"><Droplets size={16} className="text-blue-600" /> Water Point Status</h3>
              <Link to="/water-infrastructure" className="text-xs text-blue-600 hover:underline font-medium">View All →</Link>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={75} innerRadius={30} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {statusData.map((d, i) => (
                <div key={d.name} className="text-center p-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg font-bold" style={{ color: PIE_COLORS[i] }}>{d.value}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{d.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Drought Index */}
          {showClimateStats && (
            <div className="card">
              <div className="card-header">
                <h3 className="section-title"><CloudRain size={16} className="text-orange-500" /> District Drought Index (SPI)</h3>
                <Link to="/climate" className="text-xs text-blue-600 hover:underline font-medium">Details →</Link>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={droughtChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={46} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="spi" name="SPI Value" radius={[6, 6, 0, 0]}>
                    {droughtChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.spi < -1.5 ? '#dc2626' : entry.spi < -0.5 ? '#ea580c' : entry.spi < 0 ? '#d97706' : '#16a34a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-3 text-xs mt-1 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-600" /> Extreme</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-500" /> Moderate</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-500" /> Mild</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-600" /> Normal</span>
              </div>
            </div>
          )}

          {/* Alerts table (if climate not shown, fill second column) */}
          {!showClimateStats && showAlertStats && (
            <div className="card">
              <div className="card-header">
                <h3 className="section-title"><AlertTriangle size={16} className="text-red-500" /> Recent Alerts</h3>
                <Link to="/emergency" className="text-xs text-blue-600 hover:underline font-medium">View All →</Link>
              </div>
              <div className="space-y-2">
                {alerts.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-6">No active alerts</p>}
                {alerts.slice(0, 5).map(a => (
                  <div key={a.id} className={`flex items-start gap-3 p-2.5 rounded-xl border-l-4 ${severityColors[a.severity]}`}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDot[a.severity]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{a.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{a.district} · {new Date(a.created_at).toLocaleDateString()}</div>
                    </div>
                    <StatusBadge status={a.severity} type="alert" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Alerts & Maintenance Row ── */}
      {(showDistrictStats || showNationalStats) && showClimateStats && (
        <div className="grid lg:grid-cols-2 gap-5">

          {/* Recent Alerts */}
          {showAlertStats && (
            <div className="card">
              <div className="card-header">
                <h3 className="section-title"><AlertTriangle size={16} className="text-red-500" /> Recent Active Alerts</h3>
                <Link to="/emergency" className="text-xs text-blue-600 hover:underline font-medium">View All →</Link>
              </div>
              <div className="space-y-2">
                {alerts.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-6">No active alerts</p>}
                {alerts.slice(0, 5).map(a => (
                  <div key={a.id} className={`flex items-start gap-3 p-2.5 rounded-xl border-l-4 ${severityColors[a.severity]}`}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDot[a.severity]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{a.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{a.district} · {new Date(a.created_at).toLocaleDateString()}</div>
                    </div>
                    <StatusBadge status={a.severity} type="alert" />
                  </div>
                ))}
              </div>
              <Link to="/emergency" className="btn-secondary mt-3 text-xs w-full justify-center">Manage All Alerts</Link>
            </div>
          )}

          {/* Pending Maintenance */}
          {showMaintenanceStats && (
            <div className="card">
              <div className="card-header">
                <h3 className="section-title"><Wrench size={16} className="text-orange-500" /> Pending Maintenance</h3>
                <Link to="/maintenance" className="text-xs text-blue-600 hover:underline font-medium">View All →</Link>
              </div>
              <div className="space-y-2">
                {maintenance.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-6">No pending requests</p>}
                {maintenance.slice(0, 5).map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{m.water_point_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{m.issue_type?.replace(/_/g, ' ')} · {m.district}</div>
                    </div>
                    <StatusBadge status={m.priority} type="maintenance" />
                  </div>
                ))}
              </div>
              <Link to="/maintenance" className="btn-secondary mt-3 text-xs w-full justify-center">Manage Maintenance</Link>
            </div>
          )}
        </div>
      )}

      {/* ── Health Summary ── */}
      {showHealthStats && healthStats && (
        <div className="card">
          <div className="card-header">
            <h3 className="section-title"><Heart size={16} className="text-red-500" /> Public Health Surveillance Summary</h3>
            <Link to="/health" className="text-xs text-blue-600 hover:underline font-medium">Full Dashboard →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Cases',      value: healthStats.total_cases?.toLocaleString() || 0,  color: 'gradient-card-red',    text: 'text-red-700' },
              { label: 'Deaths',           value: healthStats.total_deaths || 0,                   color: 'gradient-card-orange', text: 'text-orange-700' },
              { label: 'Active Outbreaks', value: healthStats.active_outbreaks || 0,               color: 'gradient-card-purple', text: 'text-purple-700' },
              { label: 'Water-Linked',     value: healthStats.water_linked_incidents || 0,         color: 'gradient-card-yellow', text: 'text-yellow-700' },
            ].map(h => (
              <div key={h.label} className={`text-center p-3 rounded-2xl ${h.color}`}>
                <div className={`text-2xl font-extrabold ${h.text}`}>{h.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{h.label}</div>
              </div>
            ))}
          </div>
          {healthStats.by_disease?.length > 0 && (
            <div className="table-container">
              <table className="table">
                <thead><tr>
                  <th className="th">Disease</th>
                  <th className="th">Cases</th>
                  <th className="th">Deaths</th>
                  <th className="th">Incidents</th>
                </tr></thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {healthStats.by_disease.slice(0, 4).map((d: any) => (
                    <tr key={d.disease_type} className="tr">
                      <td className="td font-semibold capitalize">{d.disease_type}</td>
                      <td className="td text-red-700 font-bold">{d.total_cases}</td>
                      <td className="td text-orange-700">{d.total_deaths}</td>
                      <td className="td">{d.incidents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="card">
        <h3 className="section-title mb-4">
          <Zap size={16} className="text-blue-600" /> Quick Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map(action => (
            <Link
              key={action.to + action.label}
              to={action.to}
              className={`p-4 rounded-2xl transition-colors text-center group dark:brightness-90 ${action.bg}`}
            >
              <action.icon size={22} className={`mx-auto mb-2 ${action.color} group-hover:scale-110 transition-transform`} />
              <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{action.label}</div>
              <div className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">{action.sub}</div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
