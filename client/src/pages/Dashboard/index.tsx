import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Droplets, AlertTriangle, Wrench, TestTube, Heart, CloudRain,
  Users, CheckCircle, XCircle, Activity, Cpu, Map,
  BarChart3, ShieldCheck, Zap, TrendingUp, Bell,
  MapPin, Clock, ChevronRight, Wind, Thermometer, Eye,
  Navigation, Sun, Cloud, CloudLightning, Snowflake,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { useWeather, weatherInfo } from '../../hooks/useWeather';
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
  national_admin:      { from: '#7c3aed', to: '#4f46e5', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200' },
  district_officer:    { from: '#1d4ed8', to: '#0284c7', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' },
  community_committee: { from: '#059669', to: '#0891b2', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' },
  citizen:             { from: '#475569', to: '#64748b', badge: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  ngo_officer:         { from: '#b45309', to: '#d97706', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' },
  technician:          { from: '#ca8a04', to: '#ea580c', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200' },
  health_officer:      { from: '#dc2626', to: '#e11d48', badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
  climate_scientist:   { from: '#0891b2', to: '#0284c7', badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200' },
};

/* ── 3-level severity ── */
const SEVERITY_LEVEL: Record<string, { label: string; color: string; bg: string; border: string; dot: string; text: string; sub: string }> = {
  emergency: { label: 'Emergency', color: 'text-red-700 dark:text-red-300',    bg: 'bg-red-50 dark:bg-red-950/60',    border: 'border-red-400 dark:border-red-600',    dot: 'bg-red-500',    text: 'text-red-900 dark:text-red-100',    sub: 'text-red-700 dark:text-red-300' },
  critical:  { label: 'High',      color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-950/60', border: 'border-orange-400 dark:border-orange-600', dot: 'bg-orange-500', text: 'text-orange-900 dark:text-orange-100', sub: 'text-orange-700 dark:text-orange-300' },
  warning:   { label: 'High',      color: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-50 dark:bg-yellow-950/60', border: 'border-yellow-400 dark:border-yellow-600', dot: 'bg-yellow-500', text: 'text-yellow-900 dark:text-yellow-100', sub: 'text-yellow-700 dark:text-yellow-300' },
  info:      { label: 'Minimal',   color: 'text-blue-700 dark:text-blue-300',   bg: 'bg-blue-50 dark:bg-blue-950/60',   border: 'border-blue-400 dark:border-blue-600',   dot: 'bg-blue-500',   text: 'text-blue-900 dark:text-blue-100',   sub: 'text-blue-700 dark:text-blue-300' },
};

import { ALL_DISTRICTS } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS;

/* Live clock */
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

interface QuickAction {
  to: string; icon: React.ElementType; label: string; sub: string;
  color: string; bg: string; border: string;
}
const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  national_admin: [
    { to: '/analytics',    icon: BarChart3,     label: 'National Analytics', sub: 'Full report',       color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/30',      border: 'border-blue-200 dark:border-blue-700' },
    { to: '/emergency',    icon: AlertTriangle, label: 'Emergency Center',   sub: 'View all alerts',   color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/30',        border: 'border-red-200 dark:border-red-700' },
    { to: '/governance',   icon: ShieldCheck,   label: 'Governance',         sub: 'Audit & budgets',   color: 'text-purple-700', bg: 'bg-purple-50 dark:bg-purple-900/30',  border: 'border-purple-200 dark:border-purple-700' },
    { to: '/gis',          icon: Map,           label: 'GIS Map',            sub: 'National overview', color: 'text-emerald-700',bg: 'bg-emerald-50 dark:bg-emerald-900/30',border: 'border-emerald-200 dark:border-emerald-700' },
  ],
  district_officer: [
    { to: '/water-infrastructure', icon: Droplets,     label: 'Water Points',    sub: 'Manage sources',    color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/30',     border: 'border-blue-200 dark:border-blue-700' },
    { to: '/maintenance',          icon: Wrench,       label: 'Maintenance',     sub: 'Approve requests',  color: 'text-orange-700', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-700' },
    { to: '/water-quality',        icon: TestTube,     label: 'Water Quality',   sub: 'District tests',    color: 'text-cyan-700',   bg: 'bg-cyan-50 dark:bg-cyan-900/30',     border: 'border-cyan-200 dark:border-cyan-700' },
    { to: '/emergency',            icon: AlertTriangle,label: 'District Alerts', sub: 'Active alerts',     color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/30',       border: 'border-red-200 dark:border-red-700' },
  ],
  community_committee: [
    { to: '/community',            icon: Users,        label: 'Submit Report',   sub: 'Report an issue',   color: 'text-emerald-700',bg: 'bg-emerald-50 dark:bg-emerald-900/30',border: 'border-emerald-200 dark:border-emerald-700' },
    { to: '/water-infrastructure', icon: Droplets,     label: 'Water Sources',   sub: 'Local water points',color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/30',     border: 'border-blue-200 dark:border-blue-700' },
    { to: '/maintenance',          icon: Wrench,       label: 'Request Repair',  sub: 'Maintenance req.',  color: 'text-orange-700', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-700' },
    { to: '/emergency',            icon: AlertTriangle,label: 'Emergency',       sub: 'Report emergency',  color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/30',       border: 'border-red-200 dark:border-red-700' },
  ],
  ngo_officer: [
    { to: '/water-infrastructure', icon: Droplets,    label: 'Project Points',    sub: 'Supported sources', color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/30',     border: 'border-blue-200 dark:border-blue-700' },
    { to: '/analytics',            icon: BarChart3,   label: 'Analytics',         sub: 'Area insights',     color: 'text-purple-700', bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-purple-200 dark:border-purple-700' },
    { to: '/community',            icon: Users,       label: 'Community Reports', sub: 'View & submit',     color: 'text-emerald-700',bg: 'bg-emerald-50 dark:bg-emerald-900/30',border: 'border-emerald-200 dark:border-emerald-700' },
    { to: '/governance',           icon: ShieldCheck, label: 'Governance',        sub: 'Transparency',      color: 'text-orange-700', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-700' },
  ],
  technician: [
    { to: '/maintenance',          icon: Wrench,       label: 'My Tasks',        sub: 'Assigned repairs',  color: 'text-orange-700', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-700' },
    { to: '/sensors',              icon: Cpu,          label: 'IoT Sensors',     sub: 'Sensor conditions', color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/30',     border: 'border-blue-200 dark:border-blue-700' },
    { to: '/water-infrastructure', icon: Droplets,     label: 'Water Points',    sub: 'Assigned sites',    color: 'text-cyan-700',   bg: 'bg-cyan-50 dark:bg-cyan-900/30',     border: 'border-cyan-200 dark:border-cyan-700' },
    { to: '/emergency',            icon: AlertTriangle,label: 'Alerts',          sub: 'Active issues',     color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/30',       border: 'border-red-200 dark:border-red-700' },
  ],
  health_officer: [
    { to: '/health',        icon: Heart,        label: 'Health Dashboard', sub: 'Incidents & cases',    color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/30',       border: 'border-red-200 dark:border-red-700' },
    { to: '/water-quality', icon: TestTube,     label: 'Water Quality',   sub: 'Quality tests',        color: 'text-cyan-700',   bg: 'bg-cyan-50 dark:bg-cyan-900/30',     border: 'border-cyan-200 dark:border-cyan-700' },
    { to: '/emergency',     icon: AlertTriangle,label: 'Emergency',       sub: 'Contamination alerts', color: 'text-orange-700', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-700' },
    { to: '/analytics',     icon: BarChart3,    label: 'Analytics',       sub: 'Health trends',        color: 'text-purple-700', bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-purple-200 dark:border-purple-700' },
  ],
  climate_scientist: [
    { to: '/climate',   icon: CloudRain,  label: 'Climate Monitor', sub: 'Forecasts & SPI',   color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/30',     border: 'border-blue-200 dark:border-blue-700' },
    { to: '/analytics', icon: BarChart3,  label: 'AI Forecasting',  sub: 'Predictive models', color: 'text-purple-700', bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-purple-200 dark:border-purple-700' },
    { to: '/sensors',   icon: Cpu,        label: 'IoT Sensors',     sub: 'Live readings',     color: 'text-cyan-700',   bg: 'bg-cyan-50 dark:bg-cyan-900/30',     border: 'border-cyan-200 dark:border-cyan-700' },
    { to: '/gis',       icon: Map,        label: 'GIS Mapping',     sub: 'Spatial analysis',  color: 'text-emerald-700',bg: 'bg-emerald-50 dark:bg-emerald-900/30',border: 'border-emerald-200 dark:border-emerald-700' },
  ],
  citizen: [
    { to: '/community',            icon: Users,        label: 'Report Issue',  sub: 'Submit a complaint', color: 'text-emerald-700',bg: 'bg-emerald-50 dark:bg-emerald-900/30',border: 'border-emerald-200 dark:border-emerald-700' },
    { to: '/emergency',            icon: AlertTriangle,label: 'Emergency',     sub: 'Report emergency',   color: 'text-red-700',    bg: 'bg-red-50 dark:bg-red-900/30',       border: 'border-red-200 dark:border-red-700' },
    { to: '/water-infrastructure', icon: Droplets,     label: 'Water Sources', sub: 'Find safe water',    color: 'text-blue-700',   bg: 'bg-blue-50 dark:bg-blue-900/30',     border: 'border-blue-200 dark:border-blue-700' },
    { to: '/community',            icon: Activity,     label: 'Announcements', sub: 'Local updates',      color: 'text-orange-700', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-700' },
  ],
};

function initials(name: string) {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function MetricCard({ label, value, sub, icon: Icon, from, to, loading, delay = 0 }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; from: string; to: string; loading: boolean; delay?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border shadow-sm ripple-hover animate-drop-in transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
      style={{ background: `linear-gradient(135deg, ${from}18 0%, ${to}12 100%)`, borderColor: `${from}40`, animationDelay: `${delay}ms` }}>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 animate-wave-swell rounded-b-2xl"
        style={{ background: `linear-gradient(90deg, ${from}60, ${to}60, ${from}60)` }} />
      <div className="relative p-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider leading-tight">{label}</p>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${from}22` }}>
            <Icon size={16} style={{ color: from }} />
          </div>
        </div>
        {loading
          ? <div className="h-8 w-20 rounded-lg animate-pulse bg-gray-200 dark:bg-gray-700" />
          : <p className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">{value}</p>
        }
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-tight font-medium">{sub}</p>}
      </div>
    </div>
  );
}

/* Alert grid card — clicking opens GIS map filtered to that district */
function AlertCard({ alert, index, onViewMap }: { alert: any; index: number; onViewMap: (district: string) => void }) {
  const cfg = SEVERITY_LEVEL[alert.severity] || SEVERITY_LEVEL.info;
  const stagger = `stagger-${Math.min(index + 1, 6)}`;

  return (
    <div
      onClick={() => alert.district && onViewMap(alert.district)}
      className={`relative overflow-hidden rounded-2xl border-2 ${cfg.bg} ${cfg.border} p-4 animate-alert-in ${stagger} transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ripple-hover cursor-pointer group`}
      title={alert.district ? `Click to view ${alert.district} on the map` : undefined}
    >
      {/* Wave bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none animate-wave-swell opacity-60"
        style={{ background: `linear-gradient(to top, rgba(0,0,0,0.06), transparent)` }} />

      {/* View on map hint */}
      <div className={`absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${cfg.color}`}>
        <MapPin size={9} /> View on Map
      </div>

      <div className="relative flex items-start gap-3">
        {/* Severity ring */}
        <div className="relative flex-shrink-0 mt-1">
          <span className={`w-3 h-3 rounded-full block ${cfg.dot}`} />
          <span className={`absolute inset-0 rounded-full ${cfg.dot} animate-severity-ring`} />
        </div>

        <div className="flex-1 min-w-0 pr-12">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${cfg.border} bg-white/60 dark:bg-black/20 ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <p className={`text-sm font-bold leading-snug ${cfg.text}`}>{alert.title}</p>
          {alert.message && (
            <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${cfg.sub}`}>{alert.message}</p>
          )}
          <div className={`flex flex-wrap items-center gap-3 mt-2 text-xs font-medium ${cfg.sub}`}>
            {alert.district && <span className="flex items-center gap-1"><MapPin size={10} />{alert.district}</span>}
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {new Date(alert.created_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useClock();
  const { weather, wError, loading: wLoading, fetchWeatherByDistrict } = useWeather(user?.district || 'Kampala');

  const [overview, setOverview]       = useState<any>(null);
  const [alerts, setAlerts]           = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [healthStats, setHealthStats] = useState<any>(null);
  const [droughtData, setDroughtData] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    Promise.all([
      getAnalyticsOverview(),
      getAlerts({ status: 'active', limit: 9 }),
      getMaintenanceRequests({ status: 'pending', limit: 6 }),
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

  const handleViewOnMap = useCallback((district: string) => {
    navigate(`/gis?district=${encodeURIComponent(district)}`);
  }, [navigate]);

  const role = user?.role || 'citizen';
  const quickActions = QUICK_ACTIONS[role] || QUICK_ACTIONS.citizen;
  const theme = ROLE_COLORS[role] || ROLE_COLORS.citizen;

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

  const showDistrict    = ['national_admin','district_officer','ngo_officer','community_committee'].includes(role);
  const showHealth      = ['national_admin','district_officer','health_officer','ngo_officer'].includes(role);
  const showClimate     = ['national_admin','district_officer','climate_scientist','health_officer'].includes(role);
  const showMaintenance = ['national_admin','district_officer','ngo_officer','technician','community_committee'].includes(role);
  const showAlerts      = role !== 'citizen';

  const weatherInfo_ = weather ? weatherInfo(weather.code) : null;

  return (
    <div className="space-y-6 pb-8">

      {/* ═══════════════════════════════════════════════════════
          ROW 1: Profile  ·  Hero Banner  ·  Weather + Clock
      ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">

        {/* ── Profile Card — large avatar, role, date ── */}
        <div className="rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 animate-drop-in bg-white dark:bg-gray-900 flex flex-col">
          {/* Gradient banner — no shimmer/position class so it doesn't overlap the avatar */}
          <div
            className="h-28 rounded-t-2xl flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
          />

          {/* Avatar — z-index keeps it above the banner, no clipping, no overlay */}
          <div
            className="flex flex-col items-center px-4 pb-5"
            style={{ marginTop: -60, position: 'relative', zIndex: 10 }}
          >
            <div
              style={{
                width: 112,
                height: 112,
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
                border: '5px solid white',
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {user?.avatar
                ? <img
                    src={user.avatar}
                    alt={user?.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'center top',
                      display: 'block',
                    }}
                  />
                : <span style={{ color: '#fff', fontSize: 36, fontWeight: 800, userSelect: 'none' }}>
                    {initials(user?.name || 'U')}
                  </span>}
            </div>

            {/* Online indicator */}
            <div className="flex items-center gap-1.5 mt-3 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-bold text-green-600 dark:text-green-400">Online</span>
            </div>

            {/* Role badge */}
            <span className={`px-3 py-1.5 rounded-full text-xs font-extrabold text-center ${theme.badge}`}>
              {ROLE_LABELS[role] || role}
            </span>

            {/* Date */}
            <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-semibold">
              <Clock size={11} />
              {now.toLocaleDateString('en-UG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* ── Hero banner ── */}
        <div className="md:col-span-2 rounded-2xl overflow-hidden shadow-sm relative water-shimmer animate-drop-in stagger-1"
          style={{ background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)` }}>
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 animate-current-drift" />
          <div className="relative p-5 h-full flex flex-col justify-between">
            <div>
              <p className="text-white/70 text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <TrendingUp size={10} /> HydroSense · Live Dashboard
              </p>
              <h1 className="text-xl font-extrabold text-white leading-tight">
                Good {now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.name?.split(' ')[0]} 👋
              </h1>
              <p className="text-white/80 text-xs mt-1 font-semibold">
                {ROLE_LABELS[role] || role} · {user?.district || 'Uganda'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label: 'Water Points',  value: loading ? '…' : (overview?.water_points?.total ?? 0),            icon: Droplets },
                { label: 'Active Alerts', value: loading ? '…' : (overview?.alerts?.total_active ?? 0),            icon: Bell },
                { label: 'Coverage',      value: loading ? '…' : `${overview?.water_points?.coverage_pct ?? 0}%`, icon: CheckCircle },
              ].map(s => (
                <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/25 hover:bg-white/25 transition-all">
                  <s.icon size={14} className="text-white/80 mb-1" />
                  <div className="text-xl font-extrabold text-white leading-none">{s.value}</div>
                  <div className="text-[11px] text-white/70 mt-0.5 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Weather + Clock card ── */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden animate-drop-in stagger-2">
          {/* Live clock */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight tabular-nums">
              {now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
              {now.toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* Weather */}
          <div className="px-4 py-3">
            {wLoading && !weather && (
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
                Fetching weather…
              </div>
            )}
            {!wLoading && !weather && wError && (
              <p className="text-xs text-gray-400 dark:text-gray-500">Weather unavailable</p>
            )}
            {weather && weatherInfo_ && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-extrabold text-gray-900 dark:text-white">{weather.temp}°</span>
                      <span className="text-sm text-gray-400 dark:text-gray-500 pb-1">C</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{weatherInfo_.label}</p>
                  </div>
                  <weatherInfo_.Icon size={36} className="text-blue-500 opacity-80" />
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
                  <Wind size={11} /> {weather.windspeed} km/h
                  <span className="mx-1">·</span>
                  <MapPin size={11} className="text-gray-400" /> <span className="truncate max-w-[100px]">{weather.placeName}</span>
                </div>
              </>
            )}
            
            {/* Premium Area Selector Dropdown */}
            <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-extrabold text-gray-400 dark:text-gray-500 flex-shrink-0">Area:</span>
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
      </div>

      {/* ═══════════════════════════════════════════════════════
          ROW 2: Metric Cards
      ═══════════════════════════════════════════════════════ */}
      {(showDistrict || role === 'national_admin') && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard loading={loading} delay={0}   label="Total Water Points"    icon={Droplets}      from="#2563eb" to="#0891b2" value={overview?.water_points?.total ?? 0}                                         sub={`${(overview?.water_points?.beneficiaries ?? 0).toLocaleString()} beneficiaries`} />
          <MetricCard loading={loading} delay={60}  label="Functional Points"     icon={CheckCircle}   from="#16a34a" to="#059669" value={`${overview?.water_points?.coverage_pct ?? 0}%`}                            sub={`${overview?.water_points?.functional ?? 0} of ${overview?.water_points?.total ?? 0} operational`} />
          {showAlerts && <MetricCard loading={loading} delay={120} label="Active Alerts"       icon={AlertTriangle} from="#dc2626" to="#e11d48" value={overview?.alerts?.total_active ?? 0}                              sub={`${overview?.alerts?.emergency ?? 0} emergency · ${overview?.alerts?.critical ?? 0} critical`} />}
          {showMaintenance && <MetricCard loading={loading} delay={180} label="Pending Maintenance" icon={Wrench}       from="#ea580c" to="#d97706" value={overview?.maintenance?.pending ?? 0}                         sub="Awaiting assignment or repair" />}
        </div>
      )}

      {(showHealth || showClimate) && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {showHealth && <>
            <MetricCard loading={loading} delay={0}   label="Avg Water Quality"    icon={TestTube}   from="#0891b2" to="#06b6d4" value={`${overview?.water_quality?.avg_score ?? 0}/100`} sub={`${overview?.water_quality?.unsafe_sources ?? 0} unsafe sources`} />
            <MetricCard loading={loading} delay={60}  label="Active Health Cases"  icon={Heart}      from="#dc2626" to="#f43f5e" value={overview?.health?.active_cases ?? 0}               sub={`${overview?.health?.active_incidents ?? 0} active incidents`} />
          </>}
          {showClimate && <>
            <MetricCard loading={loading} delay={120} label="Districts in Drought" icon={CloudRain}  from="#ca8a04" to="#d97706" value={overview?.climate?.districts_in_drought ?? 0}      sub="Requiring water intervention" />
            <MetricCard loading={loading} delay={180} label="Non-functional"       icon={XCircle}    from="#6b7280" to="#4b5563" value={overview?.water_points?.broken ?? 0}               sub="Require immediate attention" />
          </>}
        </div>
      )}

      {role === 'citizen' && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard loading={loading} delay={0}  label="Water Points Nearby" icon={Droplets}      from="#2563eb" to="#0891b2" value={overview?.water_points?.functional ?? 0} sub="Functional sources available" />
          <MetricCard loading={loading} delay={60} label="Active Alerts"       icon={AlertTriangle} from="#dc2626" to="#e11d48" value={overview?.alerts?.total_active ?? 0}    sub="In your area" />
        </div>
      )}

      {role === 'technician' && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard loading={loading} delay={0}  label="Pending Tasks"  icon={Wrench} from="#ea580c" to="#d97706" value={overview?.maintenance?.pending ?? 0} sub="Awaiting completion" />
          <MetricCard loading={loading} delay={60} label="Active Sensors" icon={Cpu}    from="#2563eb" to="#0891b2" value={overview?.sensors?.active ?? 0}       sub="Online IoT devices" />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 3: Alerts Grid (clickable → GIS map)
      ═══════════════════════════════════════════════════════ */}
      {showAlerts && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle size={15} className="text-red-500" />
                Active Alerts
                {criticalAlerts.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold animate-pulse ml-1">
                    {criticalAlerts.length} Critical
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                {loading ? 'Loading…' : alerts.length > 0
                  ? `${alerts.length} active alert${alerts.length !== 1 ? 's' : ''} — click a card to view on map`
                  : 'No active alerts'}
              </p>
            </div>
            <Link to="/emergency" className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
              View All <ChevronRight size={13} />
            </Link>
          </div>

          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
              {[1,2,3].map(i => <div key={i} className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
            </div>
          )}

          {!loading && alerts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
              {alerts.map((a, i) => (
                <AlertCard key={a.id} alert={a} index={i} onViewMap={handleViewOnMap} />
              ))}
            </div>
          )}

          {!loading && alerts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle size={22} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100">All Clear — No Active Alerts</p>
            </div>
          )}

          {!loading && alerts.length > 0 && (
            <Link to="/emergency" className="btn-danger mt-4 text-xs w-full justify-center">Open Emergency Center →</Link>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 4: Charts
      ═══════════════════════════════════════════════════════ */}
      {(showDistrict || role === 'national_admin') && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2"><Droplets size={14} className="text-blue-500" /> Water Point Status</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">Distribution across all monitored points</p>
              </div>
              <Link to="/water-infrastructure" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">View All <ChevronRight size={12} /></Link>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={72} innerRadius={32} dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {statusData.map((d, i) => (
                <div key={d.name} className="text-center p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                  <div className="text-xl font-extrabold" style={{ color: PIE_COLORS[i] }}>{d.value}</div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 font-semibold mt-0.5">{d.name}</div>
                </div>
              ))}
            </div>
          </div>

          {showClimate && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2"><CloudRain size={14} className="text-orange-500" /> District Drought Index</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">Standardised Precipitation Index by district</p>
                </div>
                <Link to="/climate" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">Details <ChevronRight size={12} /></Link>
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={droughtChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="district" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={46} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                  <Bar dataKey="spi" name="SPI" radius={[6,6,0,0]}>
                    {droughtChartData.map((e, i) => (
                      <Cell key={i} fill={e.spi < -1.5 ? '#dc2626' : e.spi < -0.5 ? '#ea580c' : e.spi < 0 ? '#d97706' : '#16a34a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-3 text-[11px] mt-1 flex-wrap font-semibold text-gray-600 dark:text-gray-300">
                {[['bg-red-600','Extreme'],['bg-orange-500','Moderate'],['bg-yellow-500','Mild'],['bg-green-600','Normal']].map(([c,l]) => (
                  <span key={l} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded ${c}`} />{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 5: Maintenance grid
      ═══════════════════════════════════════════════════════ */}
      {showMaintenance && maintenance.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2"><Wrench size={14} className="text-orange-500" /> Pending Maintenance</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">{maintenance.length} requests awaiting action</p>
            </div>
            <Link to="/maintenance" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">View All <ChevronRight size={12} /></Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {maintenance.map((m, i) => (
              <div key={m.id} className={`p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 animate-alert-in stagger-${Math.min(i+1,6)}`}>
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{m.water_point_name || 'Unknown Point'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium capitalize">{m.issue_type?.replace(/_/g,' ')} · {m.district}</p>
                <div className="mt-2"><StatusBadge status={m.priority} type="maintenance" /></div>
              </div>
            ))}
          </div>
          <Link to="/maintenance" className="btn-secondary mt-4 text-xs w-full justify-center">Manage All Maintenance</Link>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 6: Health
      ═══════════════════════════════════════════════════════ */}
      {showHealth && healthStats && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2"><Heart size={14} className="text-red-500" /> Public Health Surveillance</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">Disease cases, outbreaks and water-linked incidents</p>
            </div>
            <Link to="/health" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">Full Dashboard <ChevronRight size={12} /></Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Cases',      value: (healthStats.total_cases ?? 0).toLocaleString(), from: '#dc2626', to: '#f87171' },
              { label: 'Deaths',           value: healthStats.total_deaths ?? 0,                   from: '#b45309', to: '#f59e0b' },
              { label: 'Active Outbreaks', value: healthStats.active_outbreaks ?? 0,               from: '#7c3aed', to: '#a78bfa' },
              { label: 'Water-Linked',     value: healthStats.water_linked_incidents ?? 0,         from: '#0891b2', to: '#67e8f9' },
            ].map(h => (
              <div key={h.label} className="text-center p-3 rounded-2xl text-white transition-transform duration-300 hover:-translate-y-0.5"
                style={{ background: `linear-gradient(135deg, ${h.from}, ${h.to})` }}>
                <div className="text-2xl font-extrabold">{h.value}</div>
                <div className="text-xs text-white/90 font-semibold mt-0.5">{h.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ROW 7: Quick Actions
      ═══════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2"><Zap size={14} className="text-indigo-500" /> Quick Actions</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">Shortcuts to your most-used features</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action, i) => (
            <Link key={action.to + action.label} to={action.to}
              className={`group p-4 rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ripple-hover animate-alert-in ${action.bg} ${action.border} stagger-${Math.min(i+1,6)}`}>
              <action.icon size={20} className={`mb-2.5 ${action.color} transition-transform duration-300 group-hover:scale-110`} />
              <div className="text-sm font-extrabold text-gray-900 dark:text-white leading-tight">{action.label}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-medium">{action.sub}</div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
