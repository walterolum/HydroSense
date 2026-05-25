import { useEffect, useState, useRef } from 'react';
import {
  Shield, Camera, MapPin, AlertTriangle, CheckCircle, ThumbsUp, Plus, RefreshCw,
  Satellite, Filter, X, Eye, FileText, Phone, ExternalLink, Copy,
  ArrowUpCircle, AlertCircle, Loader2, MessageSquare,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie,
} from 'recharts';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import StatCard from '../../components/common/StatCard';

const GWN_STRINGS = [
  'GUARDIAN WATER NETWORK — CITIZEN SCIENCE',
  'Report Pollution · Protect Water · Save Lives',
  'Every report helps protect Uganda\'s water. Anonymous reporting available.',
  'Total Reports','Verified','Critical',
  'Report Incident',
  'Feed','Statistics','Hotspots','Analytics',
  'Filter Reports','All Districts','All Statuses','All Types',
  'Clear Filters','No reports found',
  'Total Reports','Resolved','Resolution Rate','Community Votes',
  'By Type','By District','By Severity',
  'Save','Cancel','Saving...',
  'Assigned Agency','Resolution Notes',
  'Escalate to National','Verified by authorities',
  'votes','Report Details','Close',
  'Hotspot Pollution Areas',
];

function useGWNStrings() {
  const { language, translate } = useLanguage();
  const cacheRef = useRef<Record<string, Record<string,string>>>({});
  const [ts, setTs] = useState<Record<string,string>>({});
  useEffect(() => {
    if (language === 'en') { setTs({}); return; }
    if (cacheRef.current[language]) { setTs(cacheRef.current[language]); return; }
    Promise.all(GWN_STRINGS.map(s => translate(s).then(tr => [s,tr] as [string,string])))
      .then(pairs => { const m = Object.fromEntries(pairs); cacheRef.current[language]=m; setTs(m); });
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps
  return (s: string) => ts[s] || s;
}

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const tok = localStorage.getItem('hs_token') || sessionStorage.getItem('hs_token');
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});

const REPORT_TYPES = [
  { value: 'illegal_dumping',  label: '🗑️ Illegal Dumping',      color: '#dc2626' },
  { value: 'sewage_leak',      label: '💧 Sewage Leak',           color: '#ea580c' },
  { value: 'oil_spill',        label: '🛢️ Oil / Chemical Spill',  color: '#7c2d12' },
  { value: 'algae_bloom',      label: '🌿 Algae Bloom',           color: '#16a34a' },
  { value: 'dead_fish',        label: '🐟 Dead Fish',             color: '#854d0e' },
  { value: 'discoloration',    label: '🎨 Water Discoloration',   color: '#1d4ed8' },
  { value: 'odor',             label: '💨 Bad Odor',              color: '#6b21a8' },
  { value: 'flood',            label: '🌊 Flood Incident',        color: '#0e7490' },
  { value: 'broken_infra',     label: '🏗️ Broken Infrastructure', color: '#374151' },
  { value: 'industrial_waste', label: '🏭 Industrial Waste',      color: '#9a3412' },
];

import { ALL_DISTRICTS } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS;

const COLORS = ['#dc2626', '#ea580c', '#d97706', '#16a34a', '#2563eb', '#7c3aed', '#0891b2', '#db2777', '#374151'];

const SEV_BG: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:      'bg-green-100 text-green-700 border-green-200',
};

const STATUS_BG: Record<string, string> = {
  submitted:     'bg-gray-100 text-gray-600 border border-gray-200',
  verified:      'bg-blue-100 text-blue-700 border border-blue-200',
  investigating: 'bg-orange-100 text-orange-700 border border-orange-200',
  resolved:      'bg-green-100 text-green-700 border border-green-200',
  rejected:      'bg-red-100 text-red-700 border border-red-200',
};

// Available status transitions per current status
const STATUS_ACTIONS: Record<string, Array<{ next: string; label: string; cls: string }>> = {
  submitted:     [
    { next: 'verified',      label: '✓ Verify',      cls: 'border-blue-200 text-blue-700 hover:bg-blue-50' },
    { next: 'investigating', label: '🔍 Investigate', cls: 'border-orange-200 text-orange-700 hover:bg-orange-50' },
    { next: 'rejected',      label: '✕ Reject',       cls: 'border-red-200 text-red-700 hover:bg-red-50' },
  ],
  verified:      [
    { next: 'investigating', label: '🔍 Investigate', cls: 'border-orange-200 text-orange-700 hover:bg-orange-50' },
    { next: 'rejected',      label: '✕ Reject',       cls: 'border-red-200 text-red-700 hover:bg-red-50' },
  ],
  investigating: [
    { next: 'resolved',      label: '✓ Resolve',      cls: 'border-green-200 text-green-700 hover:bg-green-50' },
    { next: 'rejected',      label: '✕ Reject',       cls: 'border-red-200 text-red-700 hover:bg-red-50' },
  ],
  resolved:      [],
  rejected:      [
    { next: 'submitted',     label: '↩ Reopen',       cls: 'border-gray-200 text-gray-600 hover:bg-gray-50' },
  ],
};

const BLANK = {
  reporter_name: '', reporter_phone: '', district: 'Gulu',
  sub_county: '', village: '', report_type: 'illegal_dumping',
  description: '', severity: 'medium', is_anonymous: false, channel: 'app',
};

export default function GWN() {
  const { user } = useAuth();
  const t = useGWNStrings();
  const [tab, setTab]               = useState('feed');
  const [stats, setStats]           = useState<any>(null);
  const [reports, setReports]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  // Submission modal
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState<typeof BLANK>(BLANK);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Feed filters
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterType,     setFilterType]     = useState('');

  // Detail/management modal
  const [detailReport,    setDetailReport]    = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [assignedAgency,  setAssignedAgency]  = useState('');
  const [savingDetail,    setSavingDetail]    = useState(false);

  // Per-card loading states
  const [statusUpdating, setStatusUpdating] = useState<Record<number, boolean>>({});
  const [voting,         setVoting]         = useState<Record<number, boolean>>({});

  // Copy feedback
  const [copied, setCopied] = useState<string | null>(null);

  const canManage = user && ['national_admin', 'district_officer'].includes(user.role);

  /* ── Load data ── */
  const load = () => {
    setLoading(true);
    const params: Record<string, string | number> = { limit: 60 };
    if (filterDistrict) params.district = filterDistrict;
    if (filterStatus)   params.status   = filterStatus;
    if (filterType)     params.type     = filterType;
    Promise.all([
      api.get('/gwn/stats'),
      api.get('/gwn/reports', { params }),
    ]).then(([s, r]) => {
      setStats(s.data.data);
      setReports(r.data.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filterDistrict, filterStatus, filterType]); // eslint-disable-line

  /* ── Photo ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      setImagePreview(url);
      setImageBase64(url.split(',')[1]);
    };
    reader.readAsDataURL(f);
  };
  const clearPhoto = () => {
    setImagePreview(null);
    setImageBase64(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── Submit report ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) { setModalError('Please describe the issue you observed.'); return; }
    setSubmitting(true); setModalError('');
    try {
      await api.post('/gwn/reports', { ...form, photo_base64: imageBase64 || null });
      setSuccessMsg("✅ Report submitted! Thank you for protecting Uganda's water. You'll receive updates on the action taken.");
      setShowModal(false);
      setForm(BLANK);
      clearPhoto();
      load();
      setTimeout(() => setSuccessMsg(''), 10000);
    } catch (err: any) {
      setModalError(err?.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Vote (optimistic) ── */
  const handleVote = async (id: number) => {
    if (voting[id]) return;
    setVoting(v => ({ ...v, [id]: true }));
    try {
      await api.post(`/gwn/reports/${id}/vote`);
      const updater = (r: any) =>
        r.id === id ? { ...r, community_votes: (r.community_votes || 0) + 1 } : r;
      setReports(prev => prev.map(updater));
      if (detailReport?.id === id) setDetailReport((p: any) => updater(p));
    } finally {
      setVoting(v => ({ ...v, [id]: false }));
    }
  };

  /* ── Status update (optimistic) ── */
  const updateStatus = async (id: number, status: string, extra: Record<string, any> = {}) => {
    setStatusUpdating(s => ({ ...s, [id]: true }));
    try {
      await api.put(`/gwn/reports/${id}`, { status, ...extra });
      const patch = { status, ...extra };
      setReports(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
      if (detailReport?.id === id) setDetailReport((p: any) => ({ ...p, ...patch }));
    } finally {
      setStatusUpdating(s => ({ ...s, [id]: false }));
    }
  };

  /* ── Escalate ── */
  const handleEscalate = async (id: number) => {
    setStatusUpdating(s => ({ ...s, [id]: true }));
    try {
      await api.put(`/gwn/reports/${id}`, { escalated: true, escalation_level: 'national' });
      setReports(prev => prev.map(r => r.id === id ? { ...r, escalated: 1 } : r));
      if (detailReport?.id === id) setDetailReport((p: any) => ({ ...p, escalated: 1 }));
    } finally {
      setStatusUpdating(s => ({ ...s, [id]: false }));
    }
  };

  /* ── Save detail admin fields ── */
  const saveDetailUpdate = async () => {
    if (!detailReport) return;
    const payload: Record<string, string> = {};
    if (resolutionNotes.trim() !== (detailReport.resolution_notes || ''))
      payload.resolution_notes = resolutionNotes.trim();
    if (assignedAgency.trim() !== (detailReport.assigned_agency || ''))
      payload.assigned_agency = assignedAgency.trim();
    if (!Object.keys(payload).length) return;
    setSavingDetail(true);
    try {
      await api.put(`/gwn/reports/${detailReport.id}`, payload);
      setDetailReport((p: any) => ({ ...p, ...payload }));
      setReports(prev => prev.map(r => r.id === detailReport.id ? { ...r, ...payload } : r));
    } finally {
      setSavingDetail(false);
    }
  };

  /* ── Open detail modal ── */
  const openDetail = (r: any) => {
    setDetailReport(r);
    setResolutionNotes(r.resolution_notes || '');
    setAssignedAgency(r.assigned_agency || '');
  };

  /* ── Copy to clipboard ── */
  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const typeChart = (stats?.byType || []).map((tc: any) => ({
    name: REPORT_TYPES.find(r => r.value === tc.report_type)?.label?.split(' ')[1] || tc.report_type.replace(/_/g, ' '),
    count: tc.count,
    value: tc.report_type,
  }));

  const hasFilters = !!(filterStatus || filterDistrict || filterType);

  /* ═══════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════ */
  return (
    <div className="space-y-5">

      {/* ── Banner ── */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#064e3b 0%,#065f46 50%,#0891b2 100%)' }}>
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield size={18} className="text-emerald-300" />
              <span className="text-emerald-300 text-sm font-semibold tracking-wide">{t('GUARDIAN WATER NETWORK — CITIZEN SCIENCE')}</span>
            </div>
            <h2 className="text-2xl font-extrabold">{t('Report Pollution · Protect Water · Save Lives')}</h2>
            <p className="text-emerald-100 text-sm mt-1">{t('Every report helps protect Uganda\'s water. Anonymous reporting available.')}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => { setFilterStatus(''); setFilterDistrict(''); setFilterType(''); setTab('feed'); }}
                className="px-2.5 py-1 rounded-xl bg-white/15 text-xs font-semibold border border-white/20 hover:bg-white/25 transition-colors">
                {stats?.total || 0} {t('Total Reports')}
              </button>
              <button onClick={() => { setFilterStatus('verified'); setTab('feed'); }}
                className="px-2.5 py-1 rounded-xl bg-white/15 text-xs font-semibold border border-white/20 hover:bg-white/25 transition-colors">
                {stats?.verified || 0} {t('Verified')}
              </button>
              <button onClick={() => { setTab('hotspots'); }}
                className="px-2.5 py-1 rounded-xl bg-white/15 text-xs font-semibold border border-white/20 hover:bg-white/25 transition-colors">
                {stats?.critical || 0} {t('Critical')}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} title="Refresh"
              className="p-2.5 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 transition-colors">
              <RefreshCw size={16} className="text-white" />
            </button>
            <button onClick={() => { setShowModal(true); setModalError(''); }}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold flex items-center gap-2 shadow-lg transition-colors">
              <Plus size={16} /> {t('Report Incident')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Success banner ── */}
      {successMsg && (
        <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-2xl text-sm text-green-700 font-medium flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-green-500 hover:text-green-700 ml-3 flex-shrink-0">
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Stat cards — click to filter ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div onClick={() => { setFilterStatus(''); setFilterDistrict(''); setFilterType(''); setTab('feed'); }}
          className="cursor-pointer" title="Show all reports">
          <StatCard loading={loading} title="Total GWN Reports" value={stats?.total || 0}
            subtitle={`${stats?.today || 0} today`} icon={Shield} color="green" />
        </div>
        <div onClick={() => { setFilterStatus('verified'); setTab('feed'); }}
          className="cursor-pointer" title="Filter by Verified">
          <StatCard loading={loading} title="Verified" value={stats?.verified || 0}
            subtitle="Click to filter" icon={CheckCircle} color="blue" />
        </div>
        <div onClick={() => { setFilterStatus('submitted'); setTab('feed'); }}
          className="cursor-pointer" title="Filter by Submitted">
          <StatCard loading={loading} title="Critical Alerts" value={stats?.critical || 0}
            subtitle="Click to filter feed" icon={AlertTriangle} color="red" />
        </div>
        <div onClick={() => setTab('hotspots')}
          className="cursor-pointer" title="View hotspots">
          <StatCard loading={loading} title="Active Hotspots" value={stats?.hotspots?.length || 0}
            subtitle="Click to view hotspots" icon={MapPin} color="orange" />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(['feed', 'hotspots', 'analytics', 'channels'] as const).map(tk => (
          <button key={tk} onClick={() => setTab(tk)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all
              ${tab === tk
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
            {tk === 'feed' ? `📡 ${t('Feed')}` : tk === 'hotspots' ? `🔥 ${t('Hotspots')}` : tk === 'analytics' ? `📊 ${t('Analytics')}` : `📱 Channels`}
          </button>
        ))}
      </div>

      {/* ══ LIVE FEED ══ */}
      {tab === 'feed' && (
        <div className="space-y-3">

          {/* Filter bar */}
          <div className="card py-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Filter size={15} className="text-gray-400 flex-shrink-0" />

              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                <option value="">{t('All Statuses')}</option>
                {['submitted', 'verified', 'investigating', 'resolved', 'rejected'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>

              <select value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                <option value="">{t('All Districts')}</option>
                {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                <option value="">{t('All Types')}</option>
                {REPORT_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </select>

              {hasFilters && (
                <button onClick={() => { setFilterStatus(''); setFilterDistrict(''); setFilterType(''); }}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                  <X size={12} /> {t('Clear Filters')}
                </button>
              )}

              <span className="ml-auto text-xs text-gray-400">{loading ? '…' : `${reports.length} reports`}</span>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-emerald-500" />
            </div>
          )}

          {/* Empty */}
          {!loading && reports.length === 0 && (
            <div className="card text-center py-10 text-gray-400">
              {hasFilters
                ? <><p className="font-semibold">No reports match your filters.</p>
                    <button onClick={() => { setFilterStatus(''); setFilterDistrict(''); setFilterType(''); }}
                      className="mt-3 text-sm text-emerald-600 hover:underline">Clear filters</button></>
                : 'No reports yet. Be the first to report an environmental issue!'}
            </div>
          )}

          {/* Report cards */}
          {!loading && reports.map(r => (
            <div key={r.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                {/* Type icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: (REPORT_TYPES.find(rt => rt.value === r.report_type)?.color || '#6b7280') + '20' }}>
                  {REPORT_TYPES.find(rt => rt.value === r.report_type)?.label?.split(' ')[0] || '🚨'}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-100 capitalize">
                      {r.report_type?.replace(/_/g, ' ')}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${SEV_BG[r.severity] || ''}`}>
                      {r.severity?.toUpperCase()}
                    </span>
                    {r.satellite_verified === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                        <Satellite size={9} /> SAT
                      </span>
                    )}
                    {r.escalated === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                        ⬆ ESCALATED
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{r.description}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
                    <span>📍 {r.village ? `${r.village}, ` : ''}{r.district}</span>
                    <span>👤 {r.is_anonymous ? 'Anonymous' : r.reporter_name || 'Unknown'}</span>
                    <span>📱 {r.channel}</span>
                    <span>🕐 {new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  {r.ai_score && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-400">AI Score:</span>
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${r.ai_score}%`, background: r.ai_score >= 75 ? '#dc2626' : r.ai_score >= 50 ? '#ea580c' : '#d97706' }} />
                      </div>
                      <span className="text-xs font-bold" style={{ color: r.ai_score >= 75 ? '#dc2626' : '#d97706' }}>
                        {r.ai_score?.toFixed(0)}%
                      </span>
                      {r.ai_risk && <span className="text-[10px] text-gray-400 italic">{r.ai_risk.replace(/_/g, ' ')}</span>}
                    </div>
                  )}
                </div>

                {/* Right action column */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0 min-w-[90px]">
                  {/* Status badge */}
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${STATUS_BG[r.status] || 'bg-gray-100 text-gray-500'}`}>
                    {r.status?.toUpperCase()}
                  </span>

                  {/* Vote */}
                  <button onClick={() => handleVote(r.id)} disabled={!!voting[r.id]}
                    title="Upvote this report"
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 transition-colors disabled:opacity-50">
                    {voting[r.id] ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
                    {r.community_votes || 0}
                  </button>

                  {/* Details */}
                  <button onClick={() => openDetail(r)}
                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
                    <Eye size={12} /> Details
                  </button>

                  {/* Admin quick status transitions */}
                  {canManage && (
                    statusUpdating[r.id]
                      ? <Loader2 size={13} className="animate-spin text-gray-400 mt-0.5" />
                      : (STATUS_ACTIONS[r.status] || []).map(action => (
                          <button key={action.next}
                            onClick={() => updateStatus(r.id, action.next)}
                            className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors ${action.cls}`}>
                            {action.label}
                          </button>
                        ))
                  )}

                  {/* Escalate (critical only, not yet escalated) */}
                  {canManage && !r.escalated && r.severity === 'critical' && !statusUpdating[r.id] && (
                    <button onClick={() => handleEscalate(r.id)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors">
                      ⬆ Escalate
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ HOTSPOTS ══ */}
      {tab === 'hotspots' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(stats?.hotspots || []).map((h: any, i: number) => (
              <div key={i} className="card border-l-4 flex flex-col"
                style={{ borderLeftColor: h.risk_level === 'critical' ? '#dc2626' : h.risk_level === 'high' ? '#ea580c' : '#d97706' }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold text-sm text-gray-800 dark:text-gray-100">{h.name}</div>
                    <div className="text-xs text-gray-400">📍 {h.district} · {h.hotspot_type}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SEV_BG[h.risk_level] || ''}`}>
                    {h.risk_level?.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${h.pollution_score}%`, background: h.risk_level === 'critical' ? '#dc2626' : '#ea580c' }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{h.pollution_score?.toFixed(0)}%</span>
                </div>
                <div className="text-xs text-gray-400 mb-3 flex-1">{h.report_count} reports · {h.dominant_type?.replace(/_/g, ' ')}</div>
                {/* View reports button */}
                <button
                  onClick={() => { setFilterDistrict(h.district); setFilterStatus(''); setFilterType(''); setTab('feed'); }}
                  className="w-full py-2 rounded-xl text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5">
                  <Eye size={12} /> View Reports in {h.district}
                </button>
              </div>
            ))}
            {(!stats?.hotspots || stats.hotspots.length === 0) && (
              <div className="card col-span-3 text-center py-8 text-gray-400">No hotspots recorded yet.</div>
            )}
          </div>
        </div>
      )}

      {/* ══ ANALYTICS ══ */}
      {tab === 'analytics' && (
        <div className="space-y-5">
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="card">
              <h3 className="section-title mb-1">Reports by Type</h3>
              <p className="text-xs text-gray-400 mb-4">Click a bar to filter the feed by that type</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={typeChart} margin={{ top: 5, right: 10, left: -20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={55} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer"
                    onClick={(data: any) => {
                      if (data?.value) { setFilterType(data.value); setTab('feed'); }
                    }}>
                    {typeChart.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3 className="section-title mb-1">Status Distribution</h3>
              <p className="text-xs text-gray-400 mb-4">Click a segment to filter the feed by that status</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats?.byStatus || []}
                    dataKey="count"
                    nameKey="status"
                    cx="50%" cy="50%"
                    outerRadius={80} innerRadius={35}
                    label={({ status, count }) => `${status}: ${count}`}
                    labelLine
                    cursor="pointer"
                    onClick={(data: any) => { if (data?.status) { setFilterStatus(data.status); setTab('feed'); } }}>
                    {(stats?.byStatus || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* District quick-filter buttons */}
          <div className="card">
            <h3 className="section-title mb-3">Filter Feed by District</h3>
            <div className="flex flex-wrap gap-2">
              {DISTRICTS.map(d => (
                <button key={d}
                  onClick={() => { setFilterDistrict(d); setFilterStatus(''); setFilterType(''); setTab('feed'); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1
                    ${filterDistrict === d
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>
                  <MapPin size={10} /> {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ CHANNELS ══ */}
      {tab === 'channels' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {([
            {
              icon: '📱', name: 'Mobile App', color: '#2563eb',
              desc: 'Full reports with photo, GPS, and real-time tracking.',
              actions: [
                { label: 'Download for Android', href: '#', type: 'link' as const },
                { label: 'Download for iOS',     href: '#', type: 'link' as const },
              ],
            },
            {
              icon: '💬', name: 'SMS', color: '#16a34a',
              desc: 'Text WATER + issue type. Works on any phone.',
              actions: [
                { label: 'SMS 8002',     href: 'sms:8002?body=WATER%20', type: 'sms' as const },
                { label: 'Copy Number', value: '8002',                   type: 'copy' as const },
              ],
            },
            {
              icon: '📟', name: 'USSD', color: '#7c3aed',
              desc: 'Works offline. No data needed. Any phone.',
              actions: [
                { label: 'Dial *285#', href: 'tel:*285%23', type: 'tel' as const },
                { label: 'Copy Code', value: '*285#',       type: 'copy' as const },
              ],
            },
            {
              icon: '📞', name: 'Voice Hotline', color: '#dc2626',
              desc: '24/7 in Luganda and English. Free to call.',
              actions: [
                { label: 'Call 0800 100 010', href: 'tel:0800100010', type: 'tel' as const },
                { label: 'Copy Number',       value: '0800100010',    type: 'copy' as const },
              ],
            },
            {
              icon: '🤝', name: 'In-Person', color: '#d97706',
              desc: 'Visit nearest Water Committee or District Water Office.',
              actions: [
                { label: 'hydrasense.gov.ug', value: 'hydrasense.gov.ug', type: 'copy' as const },
                { label: 'Report Incident',   href: '#',                  type: 'link' as const, onClick: () => { setShowModal(true); setModalError(''); } },
              ],
            },
            {
              icon: '🌐', name: 'Web Portal', color: '#0891b2',
              desc: 'Full reporting with map and incident tracking.',
              actions: [
                { label: 'Open Web Portal', href: 'https://gwn.hydrasense.gov.ug', type: 'link' as const },
                { label: 'Copy URL',        value: 'gwn.hydrasense.gov.ug',        type: 'copy' as const },
              ],
            },
          ] as const).map(c => (
            <div key={c.name} className="card hover:shadow-md transition-shadow flex flex-col">
              <div className="text-3xl mb-3">{c.icon}</div>
              <div className="font-bold text-gray-800 dark:text-gray-100">{c.name}</div>
              <p className="text-sm text-gray-500 mt-1 mb-4 flex-1">{c.desc}</p>
              <div className="flex flex-col gap-2">
                {(c.actions as unknown as any[]).map((action: any) => {
                  if (action.type === 'tel') return (
                    <a key={action.label} href={action.href}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                      style={{ background: c.color }}>
                      <Phone size={12} /> {action.label}
                    </a>
                  );
                  if (action.type === 'sms') return (
                    <a key={action.label} href={action.href}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                      style={{ background: c.color }}>
                      <MessageSquare size={12} /> {action.label}
                    </a>
                  );
                  if (action.type === 'link') return (
                    action.onClick
                      ? <button key={action.label} onClick={action.onClick}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                          style={{ background: c.color }}>
                          <Plus size={12} /> {action.label}
                        </button>
                      : <a key={action.label} href={action.href} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                          style={{ background: c.color }}>
                          <ExternalLink size={12} /> {action.label}
                        </a>
                  );
                  if (action.type === 'copy') return (
                    <button key={action.label} onClick={() => copyText(action.value, action.label)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors"
                      style={{
                        borderColor: (c.color as string) + '60',
                        color: copied === action.label ? 'white' : c.color,
                        background: copied === action.label ? c.color : 'transparent',
                      }}>
                      {copied === action.label ? '✓ Copied!' : <><Copy size={11} /> {action.label}</>}
                    </button>
                  );
                  return null;
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ REPORT SUBMISSION MODAL ══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center sticky top-0 z-10"
              style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)' }}>
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-emerald-300" />
                <span className="font-bold text-white">Report Environmental Incident</span>
              </div>
              <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Anonymous */}
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                <input type="checkbox" id="anon" checked={form.is_anonymous}
                  onChange={e => setForm({ ...form, is_anonymous: e.target.checked })}
                  className="accent-emerald-600" />
                <label htmlFor="anon" className="text-sm text-emerald-700 dark:text-emerald-300 font-medium cursor-pointer">
                  Submit anonymously
                </label>
              </div>

              {/* Name / Phone */}
              {!form.is_anonymous && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Your Name</label>
                    <input className="input" value={form.reporter_name}
                      onChange={e => setForm({ ...form, reporter_name: e.target.value })} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" value={form.reporter_phone}
                      onChange={e => setForm({ ...form, reporter_phone: e.target.value })} placeholder="+256..." />
                  </div>
                </div>
              )}

              {/* Incident type */}
              <div>
                <label className="label">Incident Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {REPORT_TYPES.map(rt => (
                    <button key={rt.value} type="button"
                      onClick={() => setForm({ ...form, report_type: rt.value })}
                      className={`px-3 py-2 rounded-xl text-xs font-medium text-left border transition-all
                        ${form.report_type === rt.value
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-600 dark:text-gray-400'}`}>
                      {rt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* District / Severity / Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">District *</label>
                  <select className="input" required value={form.district}
                    onChange={e => setForm({ ...form, district: e.target.value })}>
                    {DISTRICTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Severity</label>
                  <select className="input" value={form.severity}
                    onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {['low', 'medium', 'high', 'critical'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Village/Area</label>
                  <input className="input" value={form.village}
                    onChange={e => setForm({ ...form, village: e.target.value })} />
                </div>
                <div>
                  <label className="label">Sub-county</label>
                  <input className="input" value={form.sub_county}
                    onChange={e => setForm({ ...form, sub_county: e.target.value })} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="label">What did you observe? *</label>
                <textarea className="input" required rows={3}
                  placeholder="Describe what you saw, smelled, or noticed..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              {/* Photo upload */}
              <div>
                <label className="label">Upload Photo Evidence</label>
                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <img src={imagePreview} alt="preview" className="w-full max-h-40 object-cover" />
                    <button type="button" onClick={clearPhoto}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors shadow-lg">
                      <X size={14} />
                    </button>
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 rounded-lg text-white text-[10px]">
                      Photo attached
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                    onClick={() => fileRef.current?.click()}>
                    <Camera size={24} className="mx-auto text-gray-400 mb-2" />
                    <div className="text-sm text-gray-400">Click to upload photo evidence</div>
                    <div className="text-xs text-gray-300 mt-1">JPG, PNG, WebP supported</div>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,#065f46,#0891b2)' }}>
                  {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {submitting ? 'Submitting...' : '🛡️ Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ DETAIL / MANAGEMENT MODAL ══ */}
      {detailReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDetailReport(null); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center sticky top-0 z-10"
              style={{ background: 'linear-gradient(135deg,#1e1b4b,#2563eb)' }}>
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-blue-300" />
                <span className="font-bold text-white">Report #{detailReport.id} — Details</span>
              </div>
              <button onClick={() => setDetailReport(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Status badges */}
              <div className="flex items-center flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_BG[detailReport.status] || ''}`}>
                  {detailReport.status?.toUpperCase()}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${SEV_BG[detailReport.severity] || ''}`}>
                  {detailReport.severity?.toUpperCase()}
                </span>
                {detailReport.escalated === 1 && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                    ⬆ ESCALATED TO NATIONAL
                  </span>
                )}
                {detailReport.satellite_verified === 1 && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                    <Satellite size={9} /> SAT VERIFIED
                  </span>
                )}
              </div>

              {/* Core info */}
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {REPORT_TYPES.find(rt => rt.value === detailReport.report_type)?.label?.split(' ')[0] || '🚨'}
                  </span>
                  <div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 capitalize">
                      {detailReport.report_type?.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-gray-400">
                      📍 {detailReport.village ? `${detailReport.village}, ` : ''}{detailReport.district}
                      {detailReport.sub_county ? ` · ${detailReport.sub_county}` : ''}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{detailReport.description}</p>
                <div className="flex flex-wrap gap-3 text-xs text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span>👤 {detailReport.is_anonymous ? 'Anonymous' : detailReport.reporter_name || 'Unknown'}</span>
                  {detailReport.reporter_phone && <span>📞 {detailReport.reporter_phone}</span>}
                  <span>📱 {detailReport.channel}</span>
                  <span>🕐 {new Date(detailReport.created_at).toLocaleString()}</span>
                  <span>👍 {detailReport.community_votes || 0} community votes</span>
                </div>
              </div>

              {/* AI analysis */}
              {detailReport.ai_score && (
                <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3">
                  <div className="text-xs font-bold text-blue-600 mb-2">🤖 AI Analysis</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-blue-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{ width: `${detailReport.ai_score}%`, background: detailReport.ai_score >= 75 ? '#dc2626' : '#ea580c' }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: detailReport.ai_score >= 75 ? '#dc2626' : '#ea580c' }}>
                      {detailReport.ai_score?.toFixed(0)}% risk
                    </span>
                  </div>
                  {detailReport.ai_risk && (
                    <div className="text-xs text-blue-600 mt-1 capitalize">{detailReport.ai_risk.replace(/_/g, ' ')}</div>
                  )}
                </div>
              )}

              {/* Existing notes / agency */}
              {detailReport.resolution_notes && (
                <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 p-3">
                  <div className="text-xs font-bold text-green-700 mb-1">📝 Resolution Notes</div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{detailReport.resolution_notes}</p>
                </div>
              )}
              {detailReport.assigned_agency && (
                <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 p-3">
                  <div className="text-xs font-bold text-purple-700 mb-1">🏢 Assigned Agency</div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{detailReport.assigned_agency}</p>
                </div>
              )}

              {/* Vote from detail */}
              <button onClick={() => handleVote(detailReport.id)} disabled={!!voting[detailReport.id]}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-emerald-600 transition-colors disabled:opacity-50">
                {voting[detailReport.id] ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                Upvote ({detailReport.community_votes || 0} votes)
              </button>

              {/* ── Admin controls ── */}
              {canManage && (
                <div className="space-y-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Admin Controls</div>

                  {/* Status transitions */}
                  {(STATUS_ACTIONS[detailReport.status] || []).length > 0 && (
                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">Update Status</label>
                      <div className="flex flex-wrap gap-2">
                        {(STATUS_ACTIONS[detailReport.status] || []).map(action => (
                          <button key={action.next}
                            onClick={() => updateStatus(detailReport.id, action.next)}
                            disabled={!!statusUpdating[detailReport.id]}
                            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${action.cls}`}>
                            {statusUpdating[detailReport.id]
                              ? <Loader2 size={12} className="animate-spin inline mr-1" />
                              : null}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {detailReport.status === 'resolved' && (
                    <p className="text-xs text-green-600 font-semibold">✓ This report has been resolved.</p>
                  )}

                  {/* Escalate */}
                  {!detailReport.escalated && (
                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">Escalation</label>
                      <button
                        onClick={() => handleEscalate(detailReport.id)}
                        disabled={!!statusUpdating[detailReport.id]}
                        className="px-4 py-2 rounded-xl text-xs font-bold border border-purple-300 text-purple-700 hover:bg-purple-50 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                        <ArrowUpCircle size={13} /> Escalate to National Level
                      </button>
                    </div>
                  )}

                  {/* Satellite verify */}
                  {!detailReport.satellite_verified && (
                    <button
                      onClick={() => updateStatus(detailReport.id, detailReport.status, { satellite_verified: true })}
                      disabled={!!statusUpdating[detailReport.id]}
                      className="px-4 py-2 rounded-xl text-xs font-bold border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                      <Satellite size={13} /> Mark as Satellite Verified
                    </button>
                  )}

                  {/* Assign agency */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Assign Agency</label>
                    <input
                      className="input text-sm w-full"
                      placeholder="e.g. NEMA, District Environment Officer, Police..."
                      value={assignedAgency}
                      onChange={e => setAssignedAgency(e.target.value)}
                    />
                  </div>

                  {/* Resolution notes */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Resolution Notes</label>
                    <textarea
                      className="input text-sm w-full"
                      rows={3}
                      placeholder="Document actions taken, next steps, or resolution details..."
                      value={resolutionNotes}
                      onChange={e => setResolutionNotes(e.target.value)}
                    />
                  </div>

                  {/* Save notes/agency */}
                  {(assignedAgency.trim() !== (detailReport.assigned_agency || '') ||
                    resolutionNotes.trim() !== (detailReport.resolution_notes || '')) && (
                    <button onClick={saveDetailUpdate} disabled={savingDetail}
                      className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                      style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                      {savingDetail && <Loader2 size={14} className="animate-spin" />}
                      {savingDetail ? 'Saving...' : '💾 Save Changes'}
                    </button>
                  )}
                </div>
              )}

              {/* Close */}
              <button onClick={() => setDetailReport(null)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
