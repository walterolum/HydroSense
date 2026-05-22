import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplets, AlertTriangle, Wrench, TestTube, Heart, CloudRain,
  Users, CheckCircle, XCircle, Activity, Cpu, Map,
  BarChart3, ShieldCheck, Zap, TrendingUp, Bell, Calendar,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import StatusBadge from '../../components/common/StatusBadge';
import {
  getAnalyticsOverview, getAlerts, getMaintenanceRequests,
  getHealthStats, getDroughtIndex,
} from '../../api/client';

const PIE_COLORS = ['#16a34a', '#dc2626', '#ea580c', '#d97706'];

const ROLE_LABELS: Record<string, string> = {
  national_admin: 'System Administrator',
  district_officer: 'District Officer',
  community_committee: 'Committee Member',
  citizen: 'Citizen',
  ngo_officer: 'NGO Officer',
  technician: 'Field Technician',
  health_officer: 'Health Officer',
  climate_scientist: 'Climate Scientist',
};

const ROLE_COLORS: Record<string, { from: string; to: string; badge: string }> = {
  national_admin:      { from: '#7c3aed', to: '#4f46e5', badge: 'bg-purple-100 text-purple-700' },
  district_officer:    { from: '#1d4ed8', to: '#0284c7', badge: 'bg-blue-100 text-blue-700' },
  community_committee: { from: '#059669', to: '#0891b2', badge: 'bg-emerald-100 text-emerald-700' },
  citizen:             { from: '#475569', to: '#64748b', badge: 'bg-gray-100 text-gray-700' },
  ngo_officer:         { from: '#b45309', to: '#d97706', badge: 'bg-amber-100 text-amber-700' },
  technician:          { from: '#ca8a04', to: '#ea580c', badge: 'bg-yellow-100 text-yellow-700' },
  health_officer:      { from: '#dc2626', to: '#e11d48', badge: 'bg-red-100 text-red-700' },
  climate_scientist:   { from: '#0891b2', to: '#0284c7', badge: 'bg-cyan-100 text-cyan-700' },
};

interface QuickAction { to: string; icon: React.ElementType; label: string; sub: string; color: string; bg: string; border: string; }

const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  national_admin: [
    { to: '/analytics',    icon: BarChart3,     label: 'National Analytics', sub: 'Full report',       color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200 dark:border-blue-800' },
    { to: '/emergency',    icon: AlertTriangle, label: 'Emergency Center',   sub: 'View all alerts',   color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200 dark:border-red-800' },
    { to: '/governance',   icon: ShieldCheck,   label: 'Governance',         sub: 'Audit & budgets',   color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800' },
    { to: '/gis',          icon: Map,           label: 'GIS Map',            sub: 'National overview', color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-900/20',border: 'border-emerald-200 dark:border-emerald-800' },
  ],
  district_officer: [
    { to: '/water-infrastructure', icon: Droplets,     label: 'Water Points',    sub: 'Manage sources',    color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200' },
    { to: '/maintenance',          icon: Wrench,       label: 'Maintenance',     sub: 'Approve requests',  color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200' },
    { to: '/water-quality',        icon: TestTube,     label: 'Water Quality',   sub: 'District tests',    color: 'text-cyan-600',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',     border: 'border-cyan-200' },
    { to: '/emergency',            icon: AlertTriangle,label: 'District Alerts', sub: 'Active alerts',     color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200' },
  ],
  community_committee: [
    { to: '/community',            icon: Users,        label: 'Submit Report',   sub: 'Report an issue',   color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-900/20',border: 'border-emerald-200' },
    { to: '/water-infrastructure', icon: Droplets,     label: 'Water Sources',   sub: 'Local water points',color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200' },
    { to: '/maintenance',          icon: Wrench,       label: 'Request Repair',  sub: 'Maintenance req.',  color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200' },
    { to: '/emergency',            icon: AlertTriangle,label: 'Emergency',       sub: 'Report emergency',  color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200' },
  ],
  ngo_officer: [
    { to: '/water-infrastructure', icon: Droplets,    label: 'Project Points',    sub: 'Supported sources', color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200' },
    { to: '/analytics',            icon: BarChart3,   label: 'Analytics',         sub: 'Area insights',     color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200' },
    { to: '/community',            icon: Users,       label: 'Community Reports', sub: 'View & submit',     color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-900/20',border: 'border-emerald-200' },
    { to: '/governance',           icon: ShieldCheck, label: 'Governance',        sub: 'Transparency',      color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200' },
  ],
  technician: [
    { to: '/maintenance',          icon: Wrench,       label: 'My Tasks',        sub: 'Assigned repairs',  color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200' },
    { to: '/sensors',              icon: Cpu,          label: 'IoT Sensors',     sub: 'Sensor conditions', color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200' },
    { to: '/water-infrastructure', icon: Droplets,     label: 'Water Points',    sub: 'Assigned sites',    color: 'text-cyan-600',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',     border: 'border-cyan-200' },
    { to: '/emergency',            icon: AlertTriangle,label: 'Alerts',          sub: 'Active issues',     color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200' },
  ],
  health_officer: [
    { to: '/health',    icon: Heart,        label: 'Health Dashboard', sub: 'Incidents & cases',    color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200' },
    { to: '/water-quality', icon: TestTube, label: 'Water Quality',   sub: 'Quality tests',        color: 'text-cyan-600',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',     border: 'border-cyan-200' },
    { to: '/emergency', icon: AlertTriangle,label: 'Emergency',       sub: 'Contamination alerts', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200' },
    { to: '/analytics', icon: BarChart3,    label: 'Analytics',       sub: 'Health trends',        color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200' },
  ],
  climate_scientist: [
    { to: '/climate',   icon: CloudRain,  label: 'Climate Monitor', sub: 'Forecasts & SPI',   color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200' },
    { to: '/analytics', icon: BarChart3,  label: 'AI Forecasting',  sub: 'Predictive models', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200' },
    { to: '/sensors',   icon: Cpu,        label: 'IoT Sensors',     sub: 'Live readings',     color: 'text-cyan-600',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',     border: 'border-cyan-200' },
    { to: '/gis',       icon: Map,        label: 'GIS Mapping',     sub: 'Spatial analysis',  color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-900/20',border: 'border-emerald-200' },
  ],
  citizen: [
    { to: '/community',            icon: Users,        label: 'Report Issue',  sub: 'Submit a complaint', color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-900/20',border: 'border-emerald-200' },
    { to: '/emergency',            icon: AlertTriangle,label: 'Emergency',     sub: 'Report emergency',   color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200' },
    { to: '/water-infrastructure', icon: Droplets,     label: 'Water Sources', sub: 'Find safe water',    color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200' },
    { to: '/community',            icon: Activity,     label: 'Announcements', sub: 'Local updates',      color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200' },
  ],
};

const severityColors: Record<string, string> = {
  emergency: 'border-red-400 bg-red-50 dark:bg-red-900/20',
  critical:  'border-orange-400 bg-orange-50 dark:bg-orange-900/20',
  warning:   'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
  info:      'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
};
const severityDot: Record<string, string> = {
  emergency: 'bg-red-500', critical: 'bg-orange-500',
  warning: 'bg-yellow-500', info: 'bg-blue-500',
};

function initials(name: string) {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function MetricCard({ label, value, sub, icon: Icon, accent, loading }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent: string; loading: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 border ${accent} bg-white dark:bg-gray-900`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
          {loading
            ? <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg mt-1 animate-pulse" />
            : <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-0.5">{value}</p>
          }
          {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 truncate">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2"
          style={{ background: 'currentColor', color: 'transparent' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'rgba(99,102,241,0.1)'}}>
            <Icon size={18} className="text-indigo-500" />
          </div>
        </div>
      </div>
      {/* Bottom accent line */}
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${accent.replace('border-','bg-').split(' ')[0]}`} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [healthStats, setHealthStats] = useState<any>(null);
  const [droughtData, setDroughtData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();

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
  const roleTheme = ROLE_COLORS[role] || ROLE_COLORS.citizen;

  const statusData = overview ? [
    { name: 'Functional',    value: overview.water_points?.functional || 0 },
    { name: 'Non-functional',value: overview.water_points?.broken || 0 },
    { name: 'Needs Repair',  value: Math.max(0, (overview.water_points?.total || 0) - (overview.water_points?.functional || 0) - (overview.water_points?.broken || 0)) },
  ] : [];

  const droughtChartData = droughtData.map(d => ({
    district: d.district,
    spi: parseFloat(d.spi_value?.toFixed(2) || 0),
  }));

  const criticalAlerts = alerts.filter(a => a.severity === 'emergency' || a.severity === 'critical');

  const showNationalStats    = ['national_admin'].includes(role);
  const showDistrictStats    = ['national_admin','district_officer','ngo_officer','community_committee'].includes(role);
  const showHealthStats_     = ['national_admin','district_officer','health_officer','ngo_officer'].includes(role);
  const showClimateStats     = ['national_admin','district_officer','climate_scientist','health_officer'].includes(role);
  const showMaintenanceStats = ['national_admin','district_officer','ngo_officer','technician','community_committee'].includes(role);
  const showAlertStats       = role !== 'citizen';

  return (
    <div className="space-y-5 pb-6">

      {/* ═══════════════════════════════════════════════════════
          ROW 1: Profile Card + Hero Stats
      ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── User Profile Card ── */}
        <div className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800">
          {/* Gradient header */}
          <div
            className="h-20"
            style={{ background: `linear-gradient(135deg, ${roleTheme.from} 0%, ${roleTheme.to} 100%)` }}
          />
          {/* Avatar overlapping header */}
          <div className="px-5 pb-5 bg-white dark:bg-gray-900">
            <div className="flex items-end gap-4 -mt-9 mb-3">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-extrabold shadow-lg border-4 border-white dark:border-gray-900 flex-shrink-0 overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${roleTheme.from}, ${roleTheme.to})` }}
              >
                {user?.avatar
                  ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  : initials(user?.name || 'U')}
              </div>
              <div className="pb-1 min-w-0">
                <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Logged in</div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-600 font-semibold">Online</span>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">{user?.name}</h2>
            <p className="text-xs text-gray-400 truncate mt-0.5">✉ {user?.email}</p>

            <div className="flex flex-wrap gap-2 mt-3">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${roleTheme.badge}`}>
                {ROLE_LABELS[role] || role}
              </span>
              {user?.district && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  📍 {user.district}
                </span>
              )}
              {user?.organization && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 truncate max-w-[140px]">
                  🏢 {user.organization}
                </span>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 text-xs text-gray-400">
              <Calendar size={12} />
              <span>{now.toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* ── Hero Stats (spans 2 cols) ── */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden shadow-sm relative"
          style={{ background: `linear-gradient(135deg, ${roleTheme.from} 0%, ${roleTheme.to} 100%)` }}>
          {/* Decorative blobs */}
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10" />
          <div className="absolute right-16 bottom-4 w-24 h-24 rounded-full bg-white/5" />

          <div className="relative p-6 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-white/70 text-xs font-medium mb-1">
                <TrendingUp size={12} />
                HydroSense · Live Dashboard
              </div>
              <h1 className="text-2xl font-extrabold text-white leading-tight">
                Good {now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.name?.split(' ')[0]} 👋
              </h1>
              <p className="text-white/70 text-sm mt-1">
                {ROLE_LABELS[role] || role} · {user?.district || 'Uganda'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-5">
              {[
                { label: 'Water Points',  value: loading ? '—' : (overview?.water_points?.total || 0),           icon: Droplets },
                { label: 'Active Alerts', value: loading ? '—' : (overview?.alerts?.total_active || 0),           icon: Bell },
                { label: 'Coverage',      value: loading ? '—' : `${overview?.water_points?.coverage_pct || 0}%`, icon: CheckCircle },
              ].map(s => (
                <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                  <s.icon size={16} className="text-white/80 mb-1" />
                  <div className="text-xl font-extrabold text-white">{s.value}</div>
                  <div className="text-[11px] text-white/60 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          EMERGENCY BANNER
      ═══════════════════════════════════════════════════════ */}
      {criticalAlerts.length > 0 && (
        <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-600 animate-pulse" />
            <span className="font-bold text-red-800 dark:text-red-300 text-sm">Active Emergency / Critical Alerts</span>
            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">{criticalAlerts.length} Active</span>
          </div>
          <div className="space-y-2">
            {criticalAlerts.map(a => (
              <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl border-l-4 ${severityColors[a.severity]}`}>
                <span className={`w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0 ${severityDot[a.severity]}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{a.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">📍 {a.district} · {new Date(a.created_at).toLocaleString()}</div>
                </div>
                <StatusBadge status={a.severity} type="alert" />
              </div>
            ))}
          </div>
          <Link to="/emergency" className="btn-danger mt-3 text-xs w-full justify-center">View Emergency Center →</Link>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 2: 4-Column Metric Cards
      ═══════════════════════════════════════════════════════ */}
      {(showDistrictStats || showNationalStats) && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard loading={loading} label="Total Water Points" icon={Droplets} accent="border-blue-200 dark:border-blue-800"
            value={overview?.water_points?.total || 0}
            sub={`${(overview?.water_points?.beneficiaries || 0).toLocaleString()} beneficiaries`} />
          <MetricCard loading={loading} label="Functional Points" icon={CheckCircle} accent="border-green-200 dark:border-green-800"
            value={`${overview?.water_points?.coverage_pct || 0}%`}
            sub={`${overview?.water_points?.functional || 0} of ${overview?.water_points?.total || 0} operational`} />
          {showAlertStats && (
            <MetricCard loading={loading} label="Active Alerts" icon={AlertTriangle} accent="border-red-200 dark:border-red-800"
              value={overview?.alerts?.total_active || 0}
              sub={`${overview?.alerts?.emergency || 0} emergency · ${overview?.alerts?.critical || 0} critical`} />
          )}
          {showMaintenanceStats && (
            <MetricCard loading={loading} label="Pending Maintenance" icon={Wrench} accent="border-orange-200 dark:border-orange-800"
              value={overview?.maintenance?.pending || 0}
              sub="Awaiting assignment or repair" />
          )}
        </div>
      )}

      {(showHealthStats_ || showClimateStats) && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {showHealthStats_ && (
            <>
              <MetricCard loading={loading} label="Avg Water Quality" icon={TestTube} accent="border-cyan-200 dark:border-cyan-800"
                value={`${overview?.water_quality?.avg_score || 0}/100`}
                sub={`${overview?.water_quality?.unsafe_sources || 0} unsafe sources`} />
              <MetricCard loading={loading} label="Health Cases" icon={Heart} accent="border-red-200 dark:border-red-800"
                value={overview?.health?.active_cases || 0}
                sub={`${overview?.health?.active_incidents || 0} active incidents`} />
            </>
          )}
          {showClimateStats && (
            <>
              <MetricCard loading={loading} label="Districts in Drought" icon={CloudRain} accent="border-yellow-200 dark:border-yellow-800"
                value={overview?.climate?.districts_in_drought || 0}
                sub="Requiring water intervention" />
              <MetricCard loading={loading} label="Non-functional" icon={XCircle} accent="border-gray-200 dark:border-gray-700"
                value={overview?.water_points?.broken || 0}
                sub="Require immediate attention" />
            </>
          )}
        </div>
      )}

      {role === 'citizen' && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard loading={loading} label="Water Points Nearby" icon={Droplets} accent="border-blue-200 dark:border-blue-800"
            value={overview?.water_points?.functional || 0} sub="Functional sources available" />
          <MetricCard loading={loading} label="Active Alerts" icon={AlertTriangle} accent="border-red-200 dark:border-red-800"
            value={overview?.alerts?.total_active || 0} sub="In your area" />
        </div>
      )}

      {role === 'technician' && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard loading={loading} label="Pending Tasks" icon={Wrench} accent="border-orange-200 dark:border-orange-800"
            value={overview?.maintenance?.pending || 0} sub="Awaiting completion" />
          <MetricCard loading={loading} label="Active Sensors" icon={Cpu} accent="border-blue-200 dark:border-blue-800"
            value={overview?.sensors?.active || 0} sub="Online IoT devices" />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 3: Charts Grid
      ═══════════════════════════════════════════════════════ */}
      {(showDistrictStats || showNationalStats) && (
        <div className="grid lg:grid-cols-2 gap-5">

          {/* Water Point Status Pie */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-2">
                <Droplets size={15} className="text-blue-500" /> Water Point Status
              </h3>
              <Link to="/water-infrastructure" className="text-xs text-blue-600 hover:underline font-medium">View All →</Link>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={72} innerRadius={32} dataKey="value"
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {statusData.map((d, i) => (
                <div key={d.name} className="text-center p-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg font-extrabold" style={{ color: PIE_COLORS[i] }}>{d.value}</div>
                  <div className="text-[10px] text-gray-500 leading-tight">{d.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Drought Index or Alerts */}
          {showClimateStats ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-2">
                  <CloudRain size={15} className="text-orange-500" /> District Drought Index (SPI)
                </h3>
                <Link to="/climate" className="text-xs text-blue-600 hover:underline font-medium">Details →</Link>
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={droughtChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="district" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={46} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="spi" name="SPI" radius={[6,6,0,0]}>
                    {droughtChartData.map((e, i) => (
                      <Cell key={i} fill={e.spi < -1.5 ? '#dc2626' : e.spi < -0.5 ? '#ea580c' : e.spi < 0 ? '#d97706' : '#16a34a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-3 text-[10px] mt-1 flex-wrap">
                {[['bg-red-600','Extreme'],['bg-orange-500','Moderate'],['bg-yellow-500','Mild'],['bg-green-600','Normal']].map(([c,l]) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded ${c}`} />{l}
                  </span>
                ))}
              </div>
            </div>
          ) : showAlertStats ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-2">
                  <AlertTriangle size={15} className="text-red-500" /> Recent Alerts
                </h3>
                <Link to="/emergency" className="text-xs text-blue-600 hover:underline font-medium">View All →</Link>
              </div>
              <div className="space-y-2">
                {alerts.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-8">No active alerts</p>}
                {alerts.slice(0,5).map(a => (
                  <div key={a.id} className={`flex items-start gap-3 p-2.5 rounded-xl border-l-4 ${severityColors[a.severity]}`}>
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDot[a.severity]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{a.title}</div>
                      <div className="text-xs text-gray-400">{a.district} · {new Date(a.created_at).toLocaleDateString()}</div>
                    </div>
                    <StatusBadge status={a.severity} type="alert" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 4: Alerts + Maintenance
      ═══════════════════════════════════════════════════════ */}
      {(showDistrictStats || showNationalStats) && showClimateStats && (showAlertStats || showMaintenanceStats) && (
        <div className="grid lg:grid-cols-2 gap-5">
          {showAlertStats && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-2">
                  <AlertTriangle size={15} className="text-red-500" /> Recent Active Alerts
                </h3>
                <Link to="/emergency" className="text-xs text-blue-600 hover:underline font-medium">View All →</Link>
              </div>
              <div className="space-y-2">
                {alerts.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-8">No active alerts</p>}
                {alerts.slice(0,5).map(a => (
                  <div key={a.id} className={`flex items-start gap-3 p-2.5 rounded-xl border-l-4 ${severityColors[a.severity]}`}>
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDot[a.severity]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{a.title}</div>
                      <div className="text-xs text-gray-400">{a.district} · {new Date(a.created_at).toLocaleDateString()}</div>
                    </div>
                    <StatusBadge status={a.severity} type="alert" />
                  </div>
                ))}
              </div>
              <Link to="/emergency" className="btn-secondary mt-3 text-xs w-full justify-center">Manage All Alerts</Link>
            </div>
          )}

          {showMaintenanceStats && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-2">
                  <Wrench size={15} className="text-orange-500" /> Pending Maintenance
                </h3>
                <Link to="/maintenance" className="text-xs text-blue-600 hover:underline font-medium">View All →</Link>
              </div>
              <div className="space-y-2">
                {maintenance.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-8">No pending requests</p>}
                {maintenance.slice(0,5).map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{m.water_point_name}</div>
                      <div className="text-xs text-gray-400">{m.issue_type?.replace(/_/g,' ')} · {m.district}</div>
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

      {/* ═══════════════════════════════════════════════════════
          ROW 5: Health Summary
      ═══════════════════════════════════════════════════════ */}
      {showHealthStats_ && healthStats && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-2">
              <Heart size={15} className="text-red-500" /> Public Health Surveillance
            </h3>
            <Link to="/health" className="text-xs text-blue-600 hover:underline font-medium">Full Dashboard →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Cases',      value: healthStats.total_cases?.toLocaleString() || 0,  from: '#dc2626', to: '#f87171' },
              { label: 'Deaths',           value: healthStats.total_deaths || 0,                   from: '#b45309', to: '#f59e0b' },
              { label: 'Active Outbreaks', value: healthStats.active_outbreaks || 0,               from: '#7c3aed', to: '#a78bfa' },
              { label: 'Water-Linked',     value: healthStats.water_linked_incidents || 0,         from: '#0891b2', to: '#67e8f9' },
            ].map(h => (
              <div key={h.label} className="text-center p-3 rounded-2xl text-white"
                style={{ background: `linear-gradient(135deg, ${h.from}, ${h.to})` }}>
                <div className="text-2xl font-extrabold">{h.value}</div>
                <div className="text-xs text-white/80 mt-0.5">{h.label}</div>
              </div>
            ))}
          </div>
          {healthStats.by_disease?.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>{['Disease','Cases','Deaths','Incidents'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {healthStats.by_disease.slice(0,4).map((d: any) => (
                    <tr key={d.disease_type} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-2.5 font-semibold capitalize text-gray-800 dark:text-gray-100">{d.disease_type}</td>
                      <td className="px-4 py-2.5 text-red-600 font-bold">{d.total_cases}</td>
                      <td className="px-4 py-2.5 text-orange-600">{d.total_deaths}</td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{d.incidents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 6: Quick Actions Grid
      ═══════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-2 mb-4">
          <Zap size={15} className="text-indigo-500" /> Quick Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map(action => (
            <Link
              key={action.to + action.label}
              to={action.to}
              className={`group p-4 rounded-2xl border transition-all hover:shadow-md hover:-translate-y-0.5 ${action.bg} ${action.border}`}
            >
              <action.icon size={20} className={`mb-2 ${action.color} group-hover:scale-110 transition-transform`} />
              <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{action.label}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{action.sub}</div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
