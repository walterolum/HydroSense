import React, { useEffect, useState } from 'react';
import { ShieldCheck, DollarSign, Activity, FileText, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getTransparency, getBudget, getAuditLog, getPerformance, createBudget } from '../../api/client';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import { useTranslations } from '../../hooks/useTranslations';

export default function Governance() {
  const s = useTranslations({
    totalBudget: 'Total Budget',
    spent: 'Spent',
    utilization: 'Utilization',
    auditEntries: 'Audit Entries',
    projectBudgets: 'Project Budgets & Expenditure',
    addBudget: 'Add Budget',
    allocated: 'Allocated (UGX)',
    budgetChart: 'Budget Allocation vs Expenditure (UGX Millions)',
    reportResolution: 'Community Report Resolution Status',
    waterPointsDistrict: 'Water Points per District',
    auditTrail: 'Governance Audit Trail',
    addBudgetRecord: 'Add Budget Record',
    projectName: 'Project Name',
    fundingSource: 'Funding Source',
    fiscalYear: 'Fiscal Year',
  });
  const [transparency, setTransparency] = useState<any>(null);
  const [budget, setBudget] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'budget' | 'audit' | 'performance' | 'transparency'>('budget');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ district: 'Gulu', project_name: '', project_type: 'rehabilitation', allocated_amount: '', funding_source: 'Uganda Government', fiscal_year: '2024/2025', notes: '' });
  const [msg, setMsg] = useState('');

  const load = () => {
    Promise.all([getTransparency(), getBudget(), getAuditLog({ limit: 50 }), getPerformance()]).then(([tr, br, ar, pr]) => {
      setTransparency(tr.data.data);
      setBudget(br.data);
      setAudit(ar.data.data);
      setPerformance(pr.data.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createBudget({ ...form, allocated_amount: parseFloat(form.allocated_amount) });
      setMsg('Budget record created!');
      setShowModal(false);
      load();
      setTimeout(() => setMsg(''), 3000);
    } catch { setMsg('Failed.'); }
  };

  const actionColors: Record<string, string> = { CREATE: '#16a34a', UPDATE: '#3b82f6', DELETE: '#dc2626', APPROVE: '#8b5cf6', RESOLVE: '#06b6d4', DISPATCH: '#d97706', REPORT: '#ea580c', PUBLISH: '#0891b2' };

  const budgetChart = (budget?.data || []).map((b: any) => ({
    project: b.project_name?.slice(0, 20) + (b.project_name?.length > 20 ? '...' : ''),
    allocated: Math.round(b.allocated_amount / 1000000),
    spent: Math.round(b.spent_amount / 1000000),
    util: Math.round((b.spent_amount / b.allocated_amount) * 100),
  }));

  return (
    <div className="space-y-6">
      {msg && <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-lg text-sm">{msg}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} title={s.totalBudget} value={`UGX ${((budget?.summary?.total_allocated || 0) / 1000000).toFixed(0)}M`} icon={DollarSign} color="blue" />
        <StatCard loading={loading} title={s.spent} value={`UGX ${((budget?.summary?.total_spent || 0) / 1000000).toFixed(0)}M`} icon={DollarSign} color="green" />
        <StatCard loading={loading} title={s.utilization} value={`${budget?.summary?.utilization_pct || 0}%`} icon={Activity} color="purple" />
        <StatCard loading={loading} title={s.auditEntries} value={audit.length} icon={FileText} color="gray" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {(['budget', 'performance', 'transparency', 'audit'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium transition-all border-b-2 whitespace-nowrap flex-shrink-0 ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Budget Tab */}
      {tab === 'budget' && (
        <div className="space-y-6">
          <div className="card p-0">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
              <h3 className="section-title">{s.projectBudgets}</h3>
              <button onClick={() => setShowModal(true)} className="btn-primary text-xs"><Plus size={14} /> {s.addBudget}</button>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th className="th">Project</th><th className="th">District</th><th className="th">{s.allocated}</th><th className="th">Spent (UGX)</th><th className="th">{s.utilization}</th><th className="th">Source</th><th className="th">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(budget?.data || []).map((b: any) => (
                    <tr key={b.id} className="tr">
                      <td className="td"><div className="font-medium text-sm text-gray-800 dark:text-gray-100">{b.project_name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{b.project_type?.replace(/_/g, ' ')}</div></td>
                      <td className="td text-gray-700 dark:text-gray-200">{b.district}</td>
                      <td className="td font-semibold text-gray-800 dark:text-gray-100">{(b.allocated_amount || 0).toLocaleString()}</td>
                      <td className="td text-gray-700 dark:text-gray-200">{(b.spent_amount || 0).toLocaleString()}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, (b.spent_amount / b.allocated_amount) * 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-700 dark:text-gray-200">{Math.round((b.spent_amount / b.allocated_amount) * 100)}%</span>
                        </div>
                      </td>
                      <td className="td text-xs text-gray-700 dark:text-gray-200">{b.funding_source}</td>
                      <td className="td"><StatusBadge status={b.status} type="budget" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {budgetChart.length > 0 && (
            <div className="card">
              <h3 className="section-title mb-4">{s.budgetChart}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={budgetChart} margin={{ bottom: 40, left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="project" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [`UGX ${v}M`, '']} />
                  <Bar dataKey="allocated" name="Allocated" fill="#bfdbfe" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="spent" name="Spent" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Performance Tab */}
      {tab === 'performance' && performance && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(performance.kpis || []).map((kpi: any) => (
              <div key={kpi.name} className={`card ${kpi.status === 'on_track' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                <div className="text-sm font-semibold text-gray-700">{kpi.name}</div>
                <div className="text-2xl font-bold mt-1 text-gray-800">{kpi.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">Target: {kpi.target}</div>
                <div className={`badge mt-2 ${kpi.status === 'on_track' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{kpi.status === 'on_track' ? '✓ On Track' : '⚠ Below Target'}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <h3 className="section-title mb-3">{s.reportResolution}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(performance.community_report_resolution || []).map((r: any) => (
                <div key={r.status} className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-xl font-bold text-gray-800">{r.count}</div>
                  <div className="text-xs text-gray-500 capitalize mt-0.5">{r.status?.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transparency Tab */}
      {tab === 'transparency' && transparency && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="section-title mb-3"><ShieldCheck size={16} className="text-green-600" /> {s.waterPointsDistrict}</h3>
            <div className="table-container">
              <table className="table">
                <thead><tr><th className="th">District</th><th className="th">Total</th><th className="th">Functional</th><th className="th">Coverage</th><th className="th">Avg Score</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(transparency.water_points_per_district || []).map((d: any) => (
                    <tr key={d.district} className="tr">
                      <td className="td font-semibold text-gray-800 dark:text-gray-100">{d.district}</td>
                      <td className="td text-gray-700 dark:text-gray-200">{d.total}</td>
                      <td className="td text-green-700 dark:text-green-400 font-semibold">{d.functional}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${d.total > 0 ? (d.functional / d.total) * 100 : 0}%` }} /></div>
                          <span className="text-xs text-gray-700 dark:text-gray-200">{d.total > 0 ? Math.round((d.functional / d.total) * 100) : 0}%</span>
                        </div>
                      </td>
                      <td className="td"><span className={`font-bold ${d.avg_score >= 70 ? 'text-green-600 dark:text-green-400' : d.avg_score >= 50 ? 'text-orange-500' : 'text-red-600 dark:text-red-400'}`}>{d.avg_score}/100</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Audit Tab */}
      {tab === 'audit' && (
        <div className="card p-0">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="section-title">{s.auditTrail}</h3>
          </div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th className="th">Timestamp</th><th className="th">User</th><th className="th">Role</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Details</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {audit.map(a => (
                  <tr key={a.id} className="tr">
                    <td className="td text-xs text-gray-600 dark:text-gray-300">{new Date(a.timestamp).toLocaleString()}</td>
                    <td className="td font-medium text-sm text-gray-800 dark:text-gray-100">{a.user_name}</td>
                    <td className="td text-xs capitalize text-gray-600 dark:text-gray-300">{a.role?.replace(/_/g, ' ')}</td>
                    <td className="td">
                      <span className="badge text-xs font-bold" style={{ background: (actionColors[a.action] || '#6b7280') + '20', color: actionColors[a.action] || '#6b7280' }}>
                        {a.action}
                      </span>
                    </td>
                    <td className="td text-xs capitalize text-gray-600 dark:text-gray-300">{a.entity_type?.replace(/_/g, ' ')} #{a.entity_id}</td>
                    <td className="td text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Budget Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
              <h3 className="font-semibold">{s.addBudgetRecord}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl">&times;</button>
            </div>
            <form onSubmit={handleBudget} className="p-6 space-y-3">
              <div><label className="label">{s.projectName} *</label><input className="input" required value={form.project_name} onChange={e => setForm({ ...form, project_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">District</label><input className="input" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} /></div>
                <div><label className="label">{s.allocated} *</label><input className="input" required type="number" value={form.allocated_amount} onChange={e => setForm({ ...form, allocated_amount: e.target.value })} /></div>
                <div><label className="label">{s.fundingSource}</label><input className="input" value={form.funding_source} onChange={e => setForm({ ...form, funding_source: e.target.value })} /></div>
                <div><label className="label">{s.fiscalYear}</label><input className="input" value={form.fiscal_year} onChange={e => setForm({ ...form, fiscal_year: e.target.value })} /></div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center">Save Budget</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
