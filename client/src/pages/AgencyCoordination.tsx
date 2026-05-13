import { useState, useEffect } from 'react';
import { getIncidentAnalysis, getTaskAssignments, getEmergencyDashboard } from '../api/client';
import { Users, Loader2, RefreshCw, Globe, Building, Phone, Mail } from 'lucide-react';

export default function AgencyCoordination() {
  const [agencies, setAgencies] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dashRes] = await Promise.all([
        getEmergencyDashboard(),
      ]);
      setAgencies(dashRes.data.data?.agencies || []);
      setIncidents(dashRes.data.data?.live_incidents || []);
    } catch { } finally {
      setLoading(false);
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
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Globe size={20} className="text-emerald-600" /></div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Multi-Agency Coordination</h1>
              <p className="text-gray-500 text-sm">Real-time collaboration between environmental agencies, responders, and community leaders</p>
            </div>
          </div>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Building size={16} className="text-emerald-500" /> Active Agencies & Responders</h3>
          {agencies.length === 0 ? (
            <div className="text-center py-8">
              <Users size={40} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No active agency assignments</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agencies.map((a: any) => (
                <div key={a.id} className="flex items-start justify-between p-4 rounded-xl bg-gray-50 border border-gray-100 hover:bg-emerald-50 hover:border-emerald-200 transition-all">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${a.agency_role === 'lead' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                      {a.agency_name?.[0] || 'A'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{a.agency_name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${a.agency_role === 'lead' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                          {a.agency_role}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${a.status === 'active' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {a.status}
                        </span>
                      </div>
                      {a.incident_title && (
                        <p className="text-xs text-gray-600 mt-0.5">Incident: {a.incident_title}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                        {a.officer_name && <span className="flex items-center gap-1"><Users size={10} /> {a.officer_name}</span>}
                        {a.contact && <span className="flex items-center gap-1"><Phone size={10} /> {a.contact}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    Assigned: {new Date(a.assigned_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Coordination Overview</h3>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
              <div className="text-2xl font-bold text-emerald-700">{agencies.length}</div>
              <div className="text-sm font-semibold text-emerald-600">Active Agency Assignments</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200">
              <div className="text-2xl font-bold text-blue-700">{incidents.length}</div>
              <div className="text-sm font-semibold text-blue-600">Active Incidents</div>
            </div>

            <h4 className="text-sm font-semibold text-gray-700 mt-4">Agency Roles</h4>
            <div className="space-y-2">
              {['lead', 'support', 'monitoring'].map(role => {
                const count = agencies.filter((a: any) => a.agency_role === role).length;
                if (count === 0) return null;
                return (
                  <div key={role} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-gray-600">{role}</span>
                    <span className="font-semibold text-gray-900">{count}</span>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Quick Contacts</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-gray-500">
                  <Mail size={10} /> emergency@mwe.go.ug
                </div>
                <div className="flex items-center gap-2 text-gray-500">
                  <Phone size={10} /> +256-800-123-456
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Related Active Incidents</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {incidents.slice(0, 6).map((inc: any) => (
            <div key={inc.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${inc.severity === 'emergency' ? 'bg-red-500 animate-pulse' : inc.severity === 'critical' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                <span className="text-sm font-semibold text-gray-900">{inc.title}</span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{inc.description}</p>
              <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                <span>📍 {inc.district}</span>
                <span className={`font-bold ${inc.severity === 'emergency' ? 'text-red-600' : inc.severity === 'critical' ? 'text-orange-600' : 'text-yellow-600'}`}>
                  {inc.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
