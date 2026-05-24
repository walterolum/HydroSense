import React, { useEffect, useState } from 'react';
import { Users, MessageSquare, Plus, Phone, Filter } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { getCommunityReports, getCommunityReportStats, submitCommunityReport, updateCommunityReport } from '../../api/client';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';

const CHANNELS = ['sms', 'ussd', 'app', 'voice', 'in_person'];
const ISSUE_TYPES = ['breakdown', 'water_quality', 'contamination', 'shortage', 'infrastructure', 'pump_failure', 'vandalism', 'other'];
const COLORS = ['#3b82f6', '#16a34a', '#ea580c', '#8b5cf6', '#d97706', '#06b6d4'];
import { ALL_DISTRICTS } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS;

export default function CommunityReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ reporter_name: '', reporter_phone: '', district: 'Gulu', sub_county: '', village: '', issue_type: 'breakdown', description: '', severity: 'medium', channel: 'app' });
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = () => {
    const params: any = {};
    if (filter !== 'all') params.status = filter;
    Promise.all([getCommunityReports(params), getCommunityReportStats()]).then(([rr, sr]) => {
      setReports(rr.data.data);
      setStats(sr.data.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError('');
    try {
      await submitCommunityReport(form);
      setMsg('✅ Report submitted! Our team will respond within 24 hours.');
      setShowModal(false);
      setForm({ reporter_name: '', reporter_phone: '', district: 'Gulu', sub_county: '', village: '', issue_type: 'breakdown', description: '', severity: 'medium', channel: 'app' });
      load();
      setTimeout(() => setMsg(''), 6000);
    } catch (err: any) {
      setModalError(err?.response?.data?.error || 'Submission failed. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (id: number, status: string) => {
    await updateCommunityReport(id, { status });
    load();
  };

  const channelIcons: Record<string, string> = { sms: '📱', ussd: '📟', app: '📲', voice: '📞', in_person: '🤝' };
  const issueIcons: Record<string, string> = { breakdown: '🔧', water_quality: '🧪', contamination: '⚠️', shortage: '💧', infrastructure: '🏗', pump_failure: '⚙️', vandalism: '🚫', other: '❓' };

  return (
    <div className="space-y-6">
      {msg && <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-lg text-sm">{msg}</div>}

      {/* SMS/USSD Quick Report Banner */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-4 text-white">
        <div className="flex items-start gap-3">
          <Phone size={24} className="flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">Multiple Reporting Channels Available</h3>
            <div className="text-sm text-green-100 mt-1 grid sm:grid-cols-3 gap-2">
              <div>📱 <strong>SMS:</strong> Text WATER to 8002</div>
              <div>📟 <strong>USSD:</strong> Dial *285# then select 2</div>
              <div>📞 <strong>Hotline:</strong> 0800 100 006 (Free)</div>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="ml-auto btn bg-white text-green-700 hover:bg-green-50 text-sm flex-shrink-0">
            <Plus size={14} /> Submit Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} title="Total Reports" value={stats?.total || 0} icon={MessageSquare} color="blue" />
        <StatCard loading={loading} title="Open Reports" value={stats?.by_status?.find((s: any) => s.status === 'open')?.count || 0} subtitle="Awaiting response" icon={MessageSquare} color="red" />
        <StatCard loading={loading} title="Resolved" value={stats?.by_status?.find((s: any) => s.status === 'resolved')?.count || 0} icon={Users} color="green" />
        <StatCard loading={loading} title="Critical Open" value={stats?.open_critical || 0} subtitle="High severity unresolved" icon={Filter} color="orange" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card">
          <h3 className="section-title mb-3">By Issue Type</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={stats?.by_issue?.slice(0, 6) || []} dataKey="count" nameKey="issue_type" cx="50%" cy="50%" outerRadius={65} label={({ issue_type, count }) => `${count}`}>
                {(stats?.by_issue || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, n: any) => [v, n?.replace(/_/g, ' ')]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="section-title mb-3">By Channel</h3>
          <div className="space-y-2">
            {(stats?.by_channel || []).map((c: any) => (
              <div key={c.channel} className="flex items-center gap-2">
                <span className="w-24 text-sm text-gray-600 dark:text-gray-300">{channelIcons[c.channel]} {c.channel}</span>
                <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2" style={{ width: `${(c.count / (stats?.total || 1)) * 100}%` }}>
                    <span className="text-xs text-white font-bold">{c.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="section-title mb-3">By District</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={(stats?.by_district || []).slice(0, 6)} layout="vertical" margin={{ left: 40, right: 10, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="district" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter & Table */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <h3 className="section-title">Community Reports</h3>
          <div className="flex gap-2 ml-4">
            {['all', 'open', 'under_review', 'in_progress', 'resolved'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{f.replace(/_/g, ' ')}</button>
            ))}
          </div>
          <button onClick={() => { setShowModal(true); setModalError(''); }} className="btn-primary text-xs ml-auto"><Plus size={14} /> New Report</button>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th className="th">Reporter</th>
                <th className="th">District / Village</th>
                <th className="th">Issue</th>
                <th className="th">Severity</th>
                <th className="th">Channel</th>
                <th className="th">Status</th>
                <th className="th">Date</th>
                <th className="th">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {reports.map(r => (
                <tr key={r.id} className="tr">
                  <td className="td">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{r.reporter_name || 'Anonymous'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{r.reporter_phone || '—'}</div>
                  </td>
                  <td className="td text-xs text-gray-700 dark:text-gray-200">{r.village ? `${r.village}, ` : ''}{r.sub_county}, {r.district}</td>
                  <td className="td">
                    <div className="text-sm text-gray-700 dark:text-gray-200">{issueIcons[r.issue_type] || '❓'} {r.issue_type?.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{r.description}</div>
                  </td>
                  <td className="td">
                    <span className={`badge ${
                      r.severity === 'high'   ? 'bg-red-100    dark:bg-red-900/50    text-red-700    dark:text-red-400'    :
                      r.severity === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400' :
                                                'bg-gray-100   dark:bg-gray-700      text-gray-600   dark:text-gray-300'
                    }`}>{r.severity}</span>
                  </td>
                  <td className="td text-sm text-gray-700 dark:text-gray-200">{channelIcons[r.channel]} {r.channel}</td>
                  <td className="td"><StatusBadge status={r.status} type="report" /></td>
                  <td className="td text-xs text-gray-600 dark:text-gray-300">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="td">
                    {r.status === 'open'        && <button onClick={() => handleStatus(r.id, 'in_progress')} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Accept</button>}
                    {r.status === 'in_progress' && <button onClick={() => handleStatus(r.id, 'resolved')}    className="text-xs font-medium text-green-600 dark:text-green-400 hover:underline">Resolve</button>}
                    {r.status === 'resolved'    && <span className="text-xs text-green-500 dark:text-green-400">✓</span>}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && !loading && <tr><td colSpan={8} className="td text-center text-gray-400 dark:text-gray-500 py-8">No reports found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
              <h3 className="font-semibold">Submit Community Water Report</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              {modalError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <span className="font-bold">✕</span> {modalError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Your Name</label><input className="input" value={form.reporter_name} onChange={e => setForm({ ...form, reporter_name: e.target.value })} placeholder="Optional" /></div>
                <div><label className="label">Phone Number</label><input className="input" value={form.reporter_phone} onChange={e => setForm({ ...form, reporter_phone: e.target.value })} placeholder="+256..." /></div>
                <div><label className="label">District *</label>
                  <select className="input" required value={form.district} onChange={e => setForm({ ...form, district: e.target.value })}>
                    {DISTRICTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div><label className="label">Village</label><input className="input" value={form.village} onChange={e => setForm({ ...form, village: e.target.value })} /></div>
                <div><label className="label">Issue Type *</label>
                  <select className="input" required value={form.issue_type} onChange={e => setForm({ ...form, issue_type: e.target.value })}>
                    {ISSUE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div><label className="label">Severity</label>
                  <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {['low', 'medium', 'high'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="label">Reporting Channel</label>
                  <select className="input" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                    {CHANNELS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">Description *</label><textarea className="input" required rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe the water issue in detail..." /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setModalError(''); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center gap-2">
                  {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
