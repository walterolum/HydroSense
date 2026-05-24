import { useEffect, useState } from 'react';
import { Heart, AlertTriangle, Users, Activity, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getHealthIncidents, getHealthStats, createHealthIncident, updateHealthIncident } from '../../api/client';
import StatCard from '../../components/common/StatCard';

const DISEASES  = ['cholera','typhoid','diarrhea','dysentery','hepatitis_a','schistosomiasis','other'];
import { ALL_DISTRICTS } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS;

export default function HealthSurveillance() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [stats, setStats]         = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ district: 'Gulu', sub_county: '', village: '', disease_type: 'cholera', cases: '', deaths: '', hospitalizations: '', water_source_linked: false, investigation_notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [msg, setMsg]               = useState('');

  const load = () => {
    Promise.all([getHealthIncidents(), getHealthStats()]).then(([ir, sr]) => {
      setIncidents(ir.data.data);
      setStats(sr.data.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openModal  = () => { setShowModal(true);  setModalError(''); };
  const closeModal = () => { setShowModal(false); setModalError(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cases || parseInt(form.cases) < 1) { setModalError('Number of cases is required (minimum 1).'); return; }
    setSubmitting(true);
    setModalError('');
    try {
      await createHealthIncident({
        ...form,
        cases:               parseInt(form.cases)            || 0,
        deaths:              parseInt(form.deaths)           || 0,
        hospitalizations:    parseInt(form.hospitalizations) || 0,
        water_source_linked: form.water_source_linked ? 1 : 0,
      });
      const autoAlert = parseInt(form.cases) >= 10 ? ' ⚠️ Outbreak alert raised automatically!' : '';
      setMsg(`✅ Health incident logged successfully.${autoAlert}`);
      closeModal();
      setForm({ district: 'Gulu', sub_county: '', village: '', disease_type: 'cholera', cases: '', deaths: '', hospitalizations: '', water_source_linked: false, investigation_notes: '' });
      load();
      setTimeout(() => setMsg(''), 6000);
    } catch (err: any) {
      setModalError(err?.response?.data?.error || 'Failed to log incident. Please check the server connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (id: number, status: string) => {
    await updateHealthIncident(id, { outbreak_status: status });
    load();
  };

  const outbreakColors: Record<string,string> = { monitoring:'#3b82f6', alert:'#ea580c', outbreak:'#dc2626', contained:'#d97706', resolved:'#16a34a' };

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm border ${msg.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
          {msg}
        </div>
      )}

      {/* Active Outbreaks Banner */}
      {stats?.active_outbreaks > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={20} className="text-red-600 animate-pulse" />
            <span className="font-bold text-red-800 text-base">
              {stats.active_outbreaks} Active Disease Outbreak(s) — Immediate Response Required
            </span>
          </div>
          {incidents.filter(i => i.outbreak_status === 'outbreak' || i.outbreak_status === 'alert').map(i => (
            <div key={i.id} className="ml-7 text-sm text-red-700">
              &bull; <strong>{i.disease_type?.toUpperCase()}</strong> in {i.village}, {i.district}:
              {' '}{i.cases} cases, {i.deaths} deaths {i.water_source_linked ? '· 🔗 Water-linked' : ''}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} title="Total Cases"     value={(stats?.total_cases || 0).toLocaleString()} icon={Users}          color="red"    />
        <StatCard loading={loading} title="Deaths"          value={stats?.total_deaths || 0}                   icon={Heart}          color="red"    />
        <StatCard loading={loading} title="Active Outbreaks" value={stats?.active_outbreaks || 0}              icon={AlertTriangle}  color="orange" />
        <StatCard loading={loading} title="Water-linked"    value={stats?.water_linked_incidents || 0} subtitle="Linked to water sources" icon={Activity} color="purple" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="section-title mb-3">Cases by Disease Type</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats?.by_disease || []} margin={{ left: -20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="disease_type" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="total_cases"  name="Cases"  fill="#dc2626" radius={[4,4,0,0]} />
              <Bar dataKey="total_deaths" name="Deaths" fill="#7f1d1d" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="section-title mb-3">Cases by District</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={(stats?.by_district || []).slice(0,8)} layout="vertical" margin={{ left:50, right:20, top:0, bottom:0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="district" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="total_cases" name="Total Cases" fill="#ea580c" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h3 className="section-title">Disease Incident Registry</h3>
          <button onClick={openModal} className="btn-primary text-xs"><Plus size={14} /> Log Incident</button>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th className="th">Location</th><th className="th">Disease</th><th className="th">Cases</th>
              <th className="th">Deaths</th><th className="th">Hosp.</th><th className="th">Water-linked</th>
              <th className="th">Status</th><th className="th">Reported</th><th className="th">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {incidents.map(i => (
                <tr key={i.id} className={`tr ${
                  i.outbreak_status === 'outbreak'  ? 'bg-red-50    dark:bg-red-950/40'    :
                  i.outbreak_status === 'alert'     ? 'bg-amber-50  dark:bg-amber-950/40'  :
                  i.outbreak_status === 'contained' ? 'bg-green-50/60 dark:bg-green-950/20' : ''
                }`}>
                  <td className="td">
                    <div className="font-semibold text-sm text-gray-800 dark:text-gray-100">{i.district}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{i.village}, {i.sub_county}</div>
                  </td>
                  <td className="td font-medium text-gray-700 dark:text-gray-200 capitalize">{i.disease_type?.replace(/_/g, ' ')}</td>
                  <td className="td font-bold text-red-600 dark:text-red-400">{i.cases.toLocaleString()}</td>
                  <td className={`td font-semibold ${i.deaths > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{i.deaths}</td>
                  <td className="td text-gray-700 dark:text-gray-200">{i.hospitalizations}</td>
                  <td className="td">
                    {i.water_source_linked
                      ? <span className="badge bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">Yes</span>
                      : <span className="badge bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">No</span>}
                  </td>
                  <td className="td">
                    <span className="badge" style={{ background: outbreakColors[i.outbreak_status] + '22', color: outbreakColors[i.outbreak_status] }}>
                      {i.outbreak_status}
                    </span>
                  </td>
                  <td className="td text-xs text-gray-600 dark:text-gray-300">{new Date(i.reported_date).toLocaleDateString()}</td>
                  <td className="td">
                    {(i.outbreak_status === 'monitoring' || i.outbreak_status === 'alert' || i.outbreak_status === 'outbreak') &&
                      <button onClick={() => handleStatus(i.id, 'contained')} className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline">Contain</button>}
                    {i.outbreak_status === 'contained' &&
                      <button onClick={() => handleStatus(i.id, 'resolved')} className="text-xs font-medium text-green-600 dark:text-green-400 hover:underline">Resolve</button>}
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && !loading && (
                <tr><td colSpan={9} className="td text-center text-gray-400 py-8">No incidents recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Incident Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 dark:text-gray-100">Log Health Incident</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              {modalError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <span className="font-bold flex-shrink-0">✕</span> {modalError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">District *</label>
                  <select className="input" required value={form.district} onChange={e => setForm({ ...form, district: e.target.value })}>
                    {DISTRICTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Sub-county</label>
                  <input className="input" value={form.sub_county} onChange={e => setForm({ ...form, sub_county: e.target.value })} />
                </div>
                <div>
                  <label className="label">Village</label>
                  <input className="input" value={form.village} onChange={e => setForm({ ...form, village: e.target.value })} />
                </div>
                <div>
                  <label className="label">Disease Type *</label>
                  <select className="input" required value={form.disease_type} onChange={e => setForm({ ...form, disease_type: e.target.value })}>
                    {DISEASES.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Cases *</label>
                  <input className="input" required type="number" min="1" placeholder="Number of cases"
                    value={form.cases} onChange={e => setForm({ ...form, cases: e.target.value })} />
                </div>
                <div>
                  <label className="label">Deaths</label>
                  <input className="input" type="number" min="0" placeholder="0"
                    value={form.deaths} onChange={e => setForm({ ...form, deaths: e.target.value })} />
                </div>
                <div>
                  <label className="label">Hospitalizations</label>
                  <input className="input" type="number" min="0" placeholder="0"
                    value={form.hospitalizations} onChange={e => setForm({ ...form, hospitalizations: e.target.value })} />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input type="checkbox" id="wsl" checked={form.water_source_linked}
                    onChange={e => setForm({ ...form, water_source_linked: e.target.checked })}
                    className="w-4 h-4 accent-blue-600" />
                  <label htmlFor="wsl" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">Linked to water source</label>
                </div>
              </div>
              <div>
                <label className="label">Investigation Notes</label>
                <textarea className="input" rows={3} placeholder="Describe findings and response actions..."
                  value={form.investigation_notes} onChange={e => setForm({ ...form, investigation_notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-danger flex-1 justify-center gap-2">
                  {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {submitting ? 'Logging...' : 'Log Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
