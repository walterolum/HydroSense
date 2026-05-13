import { useState, useEffect } from 'react';
import { getEmergencyDashboard, getResponseTickets, getLiveMapData, createResponseTicket, updateTicketStatus, broadcastNotification } from '../api/client';
import { EmergencyDashboard, ResponseTicket } from '../types';
import { AlertTriangle, Loader2, RefreshCw, MapPin, Radio, Bell, Users, Ticket, Plus, Send } from 'lucide-react';

export default function EmergencyResponse() {
  const [dashboard, setDashboard] = useState<EmergencyDashboard | null>(null);
  const [tickets, setTickets] = useState<ResponseTicket[]>([]);
  const [liveMap, setLiveMap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'tickets' | 'map'>('overview');
  const [message, setMessage] = useState('');

  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({ title: '', description: '', priority: 'medium', assigned_team: '', assigned_agency: '', district: '', location: '', response_deadline: '' });
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastDistrict, setBroadcastDistrict] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dashRes, ticketRes, mapRes] = await Promise.all([
        getEmergencyDashboard(),
        getResponseTickets().catch(() => ({ data: { data: [] } })),
        getLiveMapData().catch(() => ({ data: { data: { incidents: [], reports: [], hotspots: [] } } })),
      ]);
      setDashboard(dashRes.data.data);
      setTickets(ticketRes.data.data || []);
      setLiveMap(mapRes.data.data);
    } catch { } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createResponseTicket(ticketForm);
      setMessage('✅ Ticket created successfully');
      setShowTicketModal(false);
      setTicketForm({ title: '', description: '', priority: 'medium', assigned_team: '', assigned_agency: '', district: '', location: '', response_deadline: '' });
      loadAll();
    } catch (err: any) {
      setMessage(`❌ ${err.response?.data?.error || 'Failed'}`);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    try {
      await broadcastNotification({ district: broadcastDistrict || undefined, channel: 'emergency', subject: 'Emergency Alert', message: broadcastMsg });
      setMessage('✅ Emergency broadcast sent');
      setBroadcastMsg('');
    } catch (err: any) {
      setMessage(`❌ ${err.response?.data?.error || 'Failed'}`);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Emergency Response Coordination</h1>
              <p className="text-gray-500 text-sm">Centralized incident management and multi-agency coordination</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTicketModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 shadow-lg">
            <Plus size={14} /> New Ticket
          </button>
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">{message}</div>
      )}

      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Active Incidents', value: dashboard.summary.active_incidents, icon: '🚨', color: 'bg-red-50 border-red-200 text-red-700' },
            { label: 'Critical', value: dashboard.summary.critical_incidents, icon: '🔴', color: 'bg-rose-50 border-rose-200 text-rose-700' },
            { label: 'Citizen Reports', value: dashboard.summary.citizen_reports, icon: '📋', color: 'bg-blue-50 border-blue-200 text-blue-700' },
            { label: 'Pending Tasks', value: dashboard.summary.pending_tasks, icon: '📌', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
            { label: 'Active Tickets', value: dashboard.summary.active_tickets, icon: '🎫', color: 'bg-purple-50 border-purple-200 text-purple-700' },
            { label: 'Active Alerts', value: dashboard.summary.active_alerts, icon: '🔔', color: 'bg-orange-50 border-orange-200 text-orange-700' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border-2 p-3 ${s.color}`}>
              <span className="text-lg">{s.icon}</span>
              <div className="text-xl font-bold mt-1">{s.value}</div>
              <div className="text-xs font-semibold">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6">
        {(['overview', 'tickets', 'map'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${tab === t ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {t === 'overview' ? <><Radio size={14} className="inline mr-1.5" /> Overview</> :
             t === 'tickets' ? <><Ticket size={14} className="inline mr-1.5" /> Tickets ({tickets.length})</> :
             <><MapPin size={14} className="inline mr-1.5" /> Live Map</>}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <input value={broadcastDistrict} onChange={e => setBroadcastDistrict(e.target.value)} placeholder="District (optional)" className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 w-32" />
          <input value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Emergency broadcast message..." className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 flex-1 min-w-[200px]" />
          <button onClick={handleBroadcast} disabled={!broadcastMsg.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
            <Bell size={12} /> Broadcast
          </button>
        </div>
      </div>

      {tab === 'overview' && dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Radio size={16} className="text-red-500" /> Live Incidents</h3>
            <div className="space-y-3">
              {dashboard.live_incidents?.slice(0, 8).map((inc: any) => (
                <div key={inc.id} className="flex items-start justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${inc.severity === 'emergency' ? 'bg-red-500 animate-pulse' : inc.severity === 'critical' ? 'bg-orange-500' : inc.severity === 'high' ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                      <span className="text-sm font-semibold text-gray-900">{inc.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${inc.severity === 'emergency' ? 'bg-red-100 text-red-700 border-red-200' : inc.severity === 'critical' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
                        {inc.severity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{inc.description?.slice(0, 100)}...</p>
                    <div className="text-[10px] text-gray-400 mt-1">📍 {inc.district} · 👥 {inc.affected_population || 0} affected</div>
                  </div>
                  {inc.ai_risk_score && <span className="text-xs font-bold text-red-600">{inc.ai_risk_score}%</span>}
                </div>
              ))}
              {(!dashboard.live_incidents || dashboard.live_incidents.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">No active incidents</p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Users size={16} className="text-blue-500" /> Active Agencies</h3>
              <div className="space-y-2">
                {dashboard.agencies?.slice(0, 8).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{a.agency_name}</span>
                      <span className="text-xs text-gray-500 ml-2">({a.agency_role})</span>
                      <p className="text-xs text-gray-400 mt-0.5">{a.incident_title?.slice(0, 60)}</p>
                    </div>
                    {a.officer_name && <span className="text-xs text-gray-500">{a.officer_name}</span>}
                  </div>
                ))}
                {(!dashboard.agencies || dashboard.agencies.length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-4">No active agency assignments</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Environmental Risk Levels</h3>
              {dashboard.risk_levels?.map((r: any) => (
                <div key={r.district} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700">{r.district}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.overall_resilience_score >= 70 ? 'bg-green-500' : r.overall_resilience_score >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${r.overall_resilience_score}%` }} />
                    </div>
                    <span className={`text-xs font-bold ${r.overall_resilience_score >= 70 ? 'text-green-600' : r.overall_resilience_score >= 45 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {r.overall_resilience_score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Incident Statistics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">By Severity</h4>
                <div className="space-y-2">
                  {dashboard.by_severity?.map((s: any) => (
                    <div key={s.severity} className="flex items-center justify-between">
                      <span className="text-sm capitalize text-gray-600">{s.severity}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${s.severity === 'emergency' ? 'bg-red-500' : s.severity === 'critical' ? 'bg-orange-500' : s.severity === 'high' ? 'bg-yellow-500' : 'bg-blue-500'}`}
                            style={{ width: `${(s.c / Math.max(1, ...(dashboard.by_severity?.map((x: any) => x.c) || [1]))) * 100}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 w-8 text-right">{s.c}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">By Type</h4>
                <div className="space-y-2">
                  {dashboard.by_type?.slice(0, 5).map((t: any) => (
                    <div key={t.incident_type} className="flex items-center justify-between">
                      <span className="text-sm capitalize text-gray-600">{t.incident_type?.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-semibold text-gray-700">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'tickets' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Response Tickets ({tickets.length})</h3>
            <button onClick={() => setShowTicketModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200">
              <Plus size={14} /> New Ticket
            </button>
          </div>

          {tickets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No response tickets yet.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map(t => (
                <div key={t.id} className="flex items-start justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-gray-400">{t.ticket_number}</span>
                      <span className="text-sm font-semibold text-gray-900">{t.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.priority === 'emergency' ? 'bg-red-100 text-red-700 border-red-200' : t.priority === 'high' ? 'bg-orange-100 text-orange-700 border-orange-200' : t.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                        {t.priority}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.status === 'open' ? 'bg-green-100 text-green-700 border-green-200' : t.status === 'in_progress' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                    {t.description && <p className="text-xs text-gray-500 mt-1">{t.description}</p>}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400 flex-wrap">
                      <span>📍 {t.district}{t.location ? `, ${t.location}` : ''}</span>
                      {t.assigned_team && <span>👥 {t.assigned_team}</span>}
                      {t.assigned_agency && <span>🏛️ {t.assigned_agency}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
                    <span className="text-[10px] text-gray-400">{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'map' && liveMap && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><MapPin size={16} className="text-red-500" /> Active Incidents ({liveMap.incidents?.length || 0})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {liveMap.incidents?.map((i: any) => (
                <div key={i.id} className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <span className="font-semibold">{i.title}</span>
                  <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${i.severity === 'emergency' ? 'bg-red-100 text-red-700' : i.severity === 'critical' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{i.severity}</span>
                  <div className="text-gray-400 mt-0.5">📍 {i.district} · {i.lat?.toFixed(4)}, {i.lng?.toFixed(4)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">📋 Citizen Reports ({liveMap.reports?.length || 0})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {liveMap.reports?.map((r: any) => (
                <div key={r.id} className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <span className="font-semibold capitalize">{r.incident_type?.replace(/_/g, ' ')}</span>
                  <div className="text-gray-400 mt-0.5">📍 {r.district}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">🔥 Pollution Hotspots ({liveMap.hotspots?.length || 0})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {liveMap.hotspots?.map((h: any) => (
                <div key={h.id} className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <span className="font-semibold">{h.name}</span>
                  <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${h.risk_level === 'high' ? 'bg-red-100 text-red-700' : h.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{h.risk_level}</span>
                  <div className="text-gray-400 mt-0.5">📍 {h.district} · Score: {h.pollution_score}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTicketModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create Response Ticket</h3>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Title *</label>
                <input type="text" value={ticketForm.title} onChange={e => setTicketForm(p => ({ ...p, title: e.target.value }))} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                <textarea value={ticketForm.description} onChange={e => setTicketForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Priority</label>
                  <select value={ticketForm.priority} onChange={e => setTicketForm(p => ({ ...p, priority: e.target.value }))} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">District *</label>
                  <input type="text" value={ticketForm.district} onChange={e => setTicketForm(p => ({ ...p, district: e.target.value }))} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Assigned Team</label>
                  <input type="text" value={ticketForm.assigned_team} onChange={e => setTicketForm(p => ({ ...p, assigned_team: e.target.value }))} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Assigned Agency</label>
                  <input type="text" value={ticketForm.assigned_agency} onChange={e => setTicketForm(p => ({ ...p, assigned_agency: e.target.value }))} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowTicketModal(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
                <button type="submit" className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-2"><Ticket size={14} /> Create Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
