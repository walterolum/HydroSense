import { useEffect, useState, useRef } from 'react';
import { Wrench, Clock, CheckCircle, AlertTriangle, Plus, DollarSign } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  getMaintenanceRequests, getMaintenanceStats, createMaintenanceRequest,
  updateMaintenanceRequest, getMaintenanceFunds, getWaterPoints,
} from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';

const MNT_STRINGS = [
  'Total Requests','Pending / Assigned','Overdue','Avg Resolution',
  '> 7 days unresolved','Hours to complete',
  'By Status','By Priority','Maintenance Funds','Spare Parts Inventory','Maintenance Requests',
  'Total Balance','Total Collected','Total Spent','No fund data',
  'Low stock',
  'Water Point','District','Issue','Priority','Status','Technician','Cost Est.','Created','Action',
  'Unassigned','Start','Complete','✓ Done',
  'New Request','Cancel','Saving...','Submit Request',
];

function useMntStrings() {
  const { language, translate } = useLanguage();
  const cacheRef = useRef<Record<string, Record<string,string>>>({});
  const [ts, setTs] = useState<Record<string,string>>({});
  useEffect(() => {
    if (language === 'en') { setTs({}); return; }
    if (cacheRef.current[language]) { setTs(cacheRef.current[language]); return; }
    Promise.all(MNT_STRINGS.map(s => translate(s).then(tr => [s,tr] as [string,string])))
      .then(pairs => { const m = Object.fromEntries(pairs); cacheRef.current[language]=m; setTs(m); });
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps
  return (s: string) => ts[s] || s;
}

const COLORS        = ['#6b7280', '#3b82f6', '#d97706', '#16a34a', '#dc2626'];
const BLANK_FORM    = { water_point_id: '', issue_type: 'pump_failure', description: '', priority: 'medium', estimated_cost: '' };
const ISSUE_TYPES   = ['pump_failure','breakdown','water_quality','contamination','shortage','infrastructure'];
const PRIORITIES    = ['low','medium','high','critical'];

export default function MaintenancePage() {
  const t = useMntStrings();
  const [requests, setRequests]       = useState<any[]>([]);
  const [stats, setStats]             = useState<any>(null);
  const [funds, setFunds]             = useState<any>(null);
  const [waterPoints, setWaterPoints] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');
  const [showModal, setShowModal]     = useState(false);
  const [form, setForm]               = useState(BLANK_FORM);
  const [submitting, setSubmitting]   = useState(false);
  const [modalError, setModalError]   = useState('');
  const [msg, setMsg]                 = useState('');

  const load = () => {
    setLoading(true);
    const params: any = {};
    if (filter !== 'all') params.status = filter;
    Promise.all([
      getMaintenanceRequests(params),
      getMaintenanceStats(),
      getMaintenanceFunds(),
      getWaterPoints({ limit: 100 }),
    ]).then(([rr, sr, fr, wr]) => {
      setRequests(rr.data.data);
      setStats(sr.data.data);
      setFunds(fr.data);
      setWaterPoints(wr.data.data || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filter]);

  const openModal  = () => { setShowModal(true);  setModalError(''); setForm(BLANK_FORM); };
  const closeModal = () => { setShowModal(false); setModalError(''); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.water_point_id) { setModalError('Please select a water point.'); return; }
    setSubmitting(true);
    setModalError('');
    try {
      await createMaintenanceRequest({
        ...form,
        water_point_id: parseInt(form.water_point_id),
        estimated_cost: parseFloat(form.estimated_cost) || 0,
      });
      setMsg('✅ Maintenance request submitted successfully!');
      closeModal();
      load();
      setTimeout(() => setMsg(''), 5000);
    } catch (err: any) {
      setModalError(err?.response?.data?.error || 'Submission failed. Please check the server connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    await updateMaintenanceRequest(id, { status });
    load();
  };

  const priorityColors: Record<string, string> = {
    critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#6b7280',
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm border ${msg.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} title={t('Total Requests')}     value={requests.length} icon={Wrench}        color="blue"   />
        <StatCard loading={loading} title={t('Pending / Assigned')}
          value={(stats?.by_status?.find((s: any) => s.status === 'pending')?.count || 0) +
                 (stats?.by_status?.find((s: any) => s.status === 'assigned')?.count || 0)}
          icon={Clock} color="orange" />
        <StatCard loading={loading} title={t('Overdue')}            value={stats?.overdue || 0} subtitle={t('> 7 days unresolved')} icon={AlertTriangle} color="red"   />
        <StatCard loading={loading} title={t('Avg Resolution')}     value={`${stats?.avg_resolution_hours || 0}h`} subtitle={t('Hours to complete')} icon={CheckCircle} color="green" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card">
          <h3 className="section-title mb-3">{t('By Status')}</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={stats?.by_status || []} dataKey="count" nameKey="status"
                cx="50%" cy="50%" outerRadius={65} label={({ count }) => `${count}`}>
                {(stats?.by_status || []).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any, n: any) => [v, String(n).replace(/_/g, ' ')]} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="section-title mb-3">{t('By Priority')}</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={stats?.by_priority || []} dataKey="count" nameKey="priority"
                cx="50%" cy="50%" outerRadius={65} label={({ count }) => `${count}`}>
                {(stats?.by_priority || []).map((d: any, i: number) => (
                  <Cell key={i} fill={priorityColors[d.priority] || '#6b7280'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="section-title mb-3"><DollarSign size={16} className="text-green-600" /> {t('Maintenance Funds')}</h3>
          {funds?.summary ? (
            <div className="space-y-3">
              {[
                { label: t('Total Balance'),   value: funds.summary.total_balance   || 0, color: 'text-green-700',  bg: 'bg-green-50'  },
                { label: t('Total Collected'), value: funds.summary.total_collected || 0, color: 'text-blue-700',   bg: 'bg-blue-50'   },
                { label: t('Total Spent'),     value: funds.summary.total_spent     || 0, color: 'text-orange-700', bg: 'bg-orange-50' },
              ].map(f => (
                <div key={f.label} className={`text-center p-3 ${f.bg} rounded-lg`}>
                  <div className={`text-lg font-bold ${f.color}`}>UGX {f.value.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{f.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">{t('No fund data')}</p>
          )}
        </div>
      </div>

      {/* Spare Parts */}
      {stats?.spare_parts?.length > 0 && (
        <div className="card">
          <h3 className="section-title mb-3">{t('Spare Parts Inventory')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stats.spare_parts.map((p: any) => (
              <div key={p.id} className={`p-3 rounded-lg border ${p.quantity <= p.min_quantity ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                <div className="text-sm font-semibold text-gray-700">{p.part_name}</div>
                <div className={`text-xl font-bold mt-1 ${p.quantity <= p.min_quantity ? 'text-red-600' : 'text-gray-800'}`}>{p.quantity}</div>
                <div className="text-xs text-gray-500">Min: {p.min_quantity}</div>
                {p.quantity <= p.min_quantity && <div className="text-xs text-red-600 mt-1">⚠ {t('Low stock')}</div>}
                <div className="text-xs text-gray-400 mt-1">UGX {(p.unit_cost || 0).toLocaleString()}/unit</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requests Table */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-3">
          <h3 className="section-title">{t('Maintenance Requests')}</h3>
          <div className="flex gap-2 ml-4 flex-wrap">
            {['all','pending','assigned','in_progress','completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <button onClick={openModal} className="btn-primary text-xs ml-auto"><Plus size={14} /> {t('New Request')}</button>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th className="th">#</th><th className="th">{t('Water Point')}</th><th className="th">{t('District')}</th>
              <th className="th">{t('Issue')}</th><th className="th">{t('Priority')}</th><th className="th">{t('Status')}</th>
              <th className="th">{t('Technician')}</th><th className="th">{t('Cost Est.')}</th>
              <th className="th">{t('Created')}</th><th className="th">{t('Action')}</th>
            </tr></thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {requests.map(r => (
                <tr key={r.id} className="tr">
                  <td className="td text-xs text-gray-400">#{r.id}</td>
                  <td className="td font-medium text-sm">{r.water_point_name}</td>
                  <td className="td text-xs">{r.district}</td>
                  <td className="td text-xs capitalize">{r.issue_type?.replace(/_/g, ' ')}</td>
                  <td className="td"><StatusBadge status={r.priority} type="maintenance" /></td>
                  <td className="td"><StatusBadge status={r.status}   type="maintenance" /></td>
                  <td className="td text-xs">{r.technician_name || <span className="text-gray-400">{t('Unassigned')}</span>}</td>
                  <td className="td text-xs">{r.estimated_cost ? `UGX ${parseInt(r.estimated_cost).toLocaleString()}` : '—'}</td>
                  <td className="td text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="td">
                    {r.status === 'pending'     && <button onClick={() => handleStatusUpdate(r.id, 'in_progress')} className="text-xs text-blue-600 hover:underline">{t('Start')}</button>}
                    {r.status === 'in_progress' && <button onClick={() => handleStatusUpdate(r.id, 'completed')}  className="text-xs text-green-600 hover:underline">{t('Complete')}</button>}
                    {r.status === 'completed'   && <span className="text-xs text-green-500">{t('✓ Done')}</span>}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && !loading && (
                <tr><td colSpan={10} className="td text-center text-gray-400 py-8">No requests found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 dark:text-gray-100">New Maintenance Request</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {modalError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <span className="font-bold flex-shrink-0">✕</span> {modalError}
                </div>
              )}

              {/* Water Point Dropdown */}
              <div>
                <label className="label">Water Point *</label>
                <select
                  className="input"
                  required
                  value={form.water_point_id}
                  onChange={e => setForm({ ...form, water_point_id: e.target.value })}
                >
                  <option value="">— Select a water point —</option>
                  {waterPoints.map((wp: any) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.name} · {wp.district}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Issue Type</label>
                <select className="input" value={form.issue_type}
                  onChange={e => setForm({ ...form, issue_type: e.target.value })}>
                  {ISSUE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Priority</label>
                <select className="input" value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea className="input" rows={3} placeholder="Describe the issue in detail..."
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              <div>
                <label className="label">Estimated Cost (UGX)</label>
                <input className="input" type="number" placeholder="e.g. 500000"
                  value={form.estimated_cost} onChange={e => setForm({ ...form, estimated_cost: e.target.value })} />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center gap-2">
                  {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
