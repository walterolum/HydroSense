import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle, Plus, Truck, Radio } from 'lucide-react';
import { getAlerts, getAlertStats, createAlert, resolveAlert, acknowledgeAlert } from '../../api/client';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';

const ALERT_TYPES = ['drought','flood','contamination','infrastructure','health','climate','maintenance','security'];
const SEVERITIES  = ['info','warning','critical','emergency'];
const DISTRICTS   = ['Gulu','Arua','Lira','Moroto','Kotido','Soroti','Mbale','Jinja','Masaka','Mbarara','Kasese','Kabale','Hoima','Adjumani','Yumbe'];

const severityBg: Record<string,string>   = { emergency:'bg-red-600', critical:'bg-orange-500', warning:'bg-yellow-500', info:'bg-blue-500' };
const severityCard: Record<string,string> = { emergency:'border-red-500 bg-red-50', critical:'border-orange-500 bg-orange-50', warning:'border-yellow-400 bg-yellow-50', info:'border-blue-400 bg-blue-50' };
const typeIcon: Record<string,string>     = { drought:'🏜', flood:'🌊', contamination:'☣️', infrastructure:'🏗', health:'🏥', climate:'🌤', maintenance:'🔧', security:'🔒' };

export default function EmergencyCenter() {
  const [alerts, setAlerts]       = useState<any[]>([]);
  const [allAlerts, setAllAlerts] = useState<any[]>([]);
  const [stats, setStats]         = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ alert_type: 'drought', severity: 'warning', district: 'Gulu', title: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [msg, setMsg]               = useState('');
  const [tab, setTab]               = useState<'active'|'all'>('active');

  const load = () => {
    Promise.all([
      getAlerts({ status: 'active', limit: 100 }),
      getAlerts({ status: 'all',    limit: 50  }),
      getAlertStats(),
    ]).then(([ar, aar, sr]) => {
      setAlerts(ar.data.data);
      setAllAlerts(aar.data.data);
      setStats(sr.data.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const openModal  = () => { setShowModal(true);  setModalError(''); };
  const closeModal = () => { setShowModal(false); setModalError(''); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim())   { setModalError('Alert title is required.');   return; }
    if (!form.message.trim()) { setModalError('Alert message is required.');  return; }
    setSubmitting(true);
    setModalError('');
    try {
      await createAlert(form);
      setMsg('🚨 Alert created and notifications dispatched to all stakeholders!');
      closeModal();
      setForm({ alert_type: 'drought', severity: 'warning', district: 'Gulu', title: '', message: '' });
      load();
      setTimeout(() => setMsg(''), 6000);
    } catch (err: any) {
      setModalError(err?.response?.data?.error || 'Failed to create alert. Check the server connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: number) => { await resolveAlert(id);      load(); };
  const handleAck     = async (id: number) => { await acknowledgeAlert(id);  load(); };

  const emergency = alerts.filter(a => a.severity === 'emergency');
  const critical  = alerts.filter(a => a.severity === 'critical');

  return (
    <div className="space-y-6">
      {msg && (
        <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">{msg}</div>
      )}

      {/* Emergency banner */}
      {emergency.length > 0 && (
        <div className="bg-red-600 text-white rounded-2xl p-4 flex items-center gap-3 animate-pulse-slow">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">🚨</div>
          <div>
            <div className="font-bold text-lg">{emergency.length} EMERGENCY ALERT{emergency.length > 1 ? 'S' : ''} ACTIVE</div>
            <div className="text-red-100 text-sm">{emergency.map(a => a.district).join(' · ')} — Immediate response required</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-red-100 text-xs">Emergency Hotline</div>
            <div className="font-bold text-lg">0800 100 006</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} title="Active Alerts"  value={stats?.total_active || 0} icon={Bell}          color="red"    />
        <StatCard loading={loading} title="Emergency"      value={emergency.length}          subtitle="Immediate response" icon={AlertTriangle} color="red"    />
        <StatCard loading={loading} title="Critical"       value={critical.length}           subtitle="Urgent action"      icon={AlertTriangle} color="orange" />
        <StatCard loading={loading} title="Alert Types"    value={stats?.by_type?.length || 0} subtitle="Categories active" icon={Radio}        color="purple" />
      </div>

      {/* Emergency & Critical cards */}
      {(emergency.length > 0 || critical.length > 0) && (
        <div className="space-y-3">
          <h3 className="section-title"><AlertTriangle size={18} className="text-red-600" /> Emergency & Critical Alerts — Immediate Action Required</h3>
          {[...emergency, ...critical].map(a => (
            <div key={a.id} className={`border-2 rounded-2xl p-4 ${severityCard[a.severity]}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 ${severityBg[a.severity]} rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                  {a.severity === 'emergency' ? '🚨' : '⚠️'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-gray-900">{a.title}</span>
                    <StatusBadge status={a.severity} type="alert" />
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{a.message}</p>
                  <div className="text-xs text-gray-500">
                    📍 {a.district} · {typeIcon[a.alert_type]} {a.alert_type} · {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button onClick={() => handleAck(a.id)}     className="btn-secondary text-xs py-1">Acknowledge</button>
                  <button onClick={() => handleResolve(a.id)} className="btn-success text-xs py-1"><CheckCircle size={12} /> Resolve</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Response Protocols */}
      <div className="card bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <h3 className="section-title mb-3"><Truck size={18} className="text-blue-600" /> Emergency Response Protocols</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon:'🚛', title:'Water Trucking',  desc:'Deploy emergency water trucks to drought-affected communities', contact:'Call: 0414-660001' },
            { icon:'🔬', title:'Quality Testing', desc:'Rapid water quality assessment teams',                          contact:'Call: 0800-100-007' },
            { icon:'🏥', title:'Health Response', desc:'Cholera/typhoid outbreak rapid response',                       contact:'Call: 0800-100-066' },
            { icon:'⚙️', title:'Repair Teams',    desc:'Emergency borehole repair technicians',                        contact:'Call: 0700-REPAIR'  },
          ].map(p => (
            <div key={p.title} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 hover:shadow-sm transition-shadow">
              <div className="text-2xl mb-2">{p.icon}</div>
              <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{p.title}</div>
              <div className="text-xs text-gray-500 mt-1">{p.desc}</div>
              <div className="text-xs font-medium text-blue-600 mt-2">{p.contact}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts Table */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <div className="flex gap-2">
            <button onClick={() => setTab('active')} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${tab === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Active ({alerts.length})</button>
            <button onClick={() => setTab('all')}    className={`px-3 py-1.5 rounded-xl text-sm font-medium ${tab === 'all'    ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>All Alerts</button>
          </div>
          <button onClick={openModal} className="btn-primary text-xs ml-auto"><Plus size={14} /> Create Alert</button>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th className="th">Severity</th><th className="th">Type</th><th className="th">Title</th>
              <th className="th">District</th><th className="th">Status</th><th className="th">Time</th><th className="th">Actions</th>
            </tr></thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {(tab === 'active' ? alerts : allAlerts).map(a => (
                <tr key={a.id} className="tr">
                  <td className="td"><StatusBadge status={a.severity} type="alert" /></td>
                  <td className="td">{typeIcon[a.alert_type]} {a.alert_type}</td>
                  <td className="td">
                    <div className="font-medium text-sm text-gray-800 dark:text-gray-100">{a.title}</div>
                    <div className="text-xs text-gray-400 line-clamp-1">{a.message}</div>
                  </td>
                  <td className="td text-sm">{a.district}</td>
                  <td className="td"><StatusBadge status={a.status} type="alert" /></td>
                  <td className="td text-xs">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="td">
                    {a.status === 'active' ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleAck(a.id)}     className="text-xs text-blue-600 hover:underline">Ack</button>
                        <button onClick={() => handleResolve(a.id)} className="text-xs text-green-600 hover:underline">Resolve</button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{a.status}</span>
                    )}
                  </td>
                </tr>
              ))}
              {(tab === 'active' ? alerts : allAlerts).length === 0 && !loading && (
                <tr><td colSpan={7} className="td text-center text-gray-400 py-8">No alerts found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Alert Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle size={16} /> Create Emergency Alert
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {modalError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <span className="font-bold flex-shrink-0">✕</span> {modalError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Alert Type</label>
                  <select className="input" value={form.alert_type} onChange={e => setForm({ ...form, alert_type: e.target.value })}>
                    {ALERT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Severity</label>
                  <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {SEVERITIES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">District</label>
                  <select className="input" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })}>
                    {DISTRICTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Alert Title *</label>
                <input className="input" required value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Critical Drought Warning — Moroto" />
              </div>
              <div>
                <label className="label">Alert Message *</label>
                <textarea className="input" required rows={3} value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  placeholder="Describe the situation and required actions..." />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-danger flex-1 justify-center gap-2">
                  {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {submitting ? 'Sending...' : '🚨 Send Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
