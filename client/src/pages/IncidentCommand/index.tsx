import { useEffect, useState } from 'react';
import { Radio, AlertTriangle, Users, CheckCircle, Zap, RefreshCw, ChevronRight, Plus, Shield } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import axios from 'axios';
import StatCard from '../../components/common/StatCard';
import { useAuth } from '../../contexts/AuthContext';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => { const tok = localStorage.getItem('hs_token') || sessionStorage.getItem('hs_token'); if (tok) cfg.headers.Authorization = `Bearer ${tok}`; return cfg; });

const SEV_COLORS: Record<string,string> = { emergency:'#7f1d1d', critical:'#dc2626', high:'#ea580c', medium:'#d97706', low:'#16a34a' };
const SEV_BG: Record<string,string>     = { emergency:'border-red-600 bg-red-50', critical:'border-red-500 bg-red-50', high:'border-orange-500 bg-orange-50', medium:'border-yellow-400 bg-yellow-50', low:'border-green-400 bg-green-50' };
const STATUS_BG: Record<string,string>  = { active:'bg-orange-100 text-orange-700', investigating:'bg-blue-100 text-blue-700', contained:'bg-yellow-100 text-yellow-700', escalated:'bg-purple-100 text-purple-700', monitoring:'bg-cyan-100 text-cyan-700', resolved:'bg-green-100 text-green-700' };
const TYPES = ['industrial_discharge','sewage_overflow','illegal_dumping','agricultural_runoff','chemical_contamination','oil_spill'];
const AGENCIES = ['NEMA','Ministry of Water','Uganda Police','Ministry of Health','National Forestry Authority','KCCA','District Water Office','MoH Lab Team','Uganda Red Cross','NWSC'];
import { ALL_DISTRICTS } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS;

const BLANK_INC = { incident_type:'industrial_discharge', title:'', description:'', district:'Gulu', sub_county:'', village:'', severity:'medium', affected_population:0 };
const BLANK_AGN = { agency_name:'', agency_role:'support', officer_name:'', contact:'' };

export default function IncidentCommand() {
  const { user } = useAuth();
  const [dash, setDash]         = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [selectedAgencies, setSelectedAgencies] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'active'|'all'|'analytics'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAgencyModal, setShowAgencyModal] = useState(false);
  const [createForm, setCreateForm]   = useState(BLANK_INC);
  const [agencyForm, setAgencyForm]   = useState(BLANK_AGN);
  const [createError, setCreateError] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [msg, setMsg]                 = useState('');
  const canCommand = user && ['national_admin','district_officer'].includes(user.role);

  const load = () => {
    setLoading(true);
    const q = user?.district ? `?district=${user.district}` : '';
    Promise.all([
      api.get(`/incidents/dashboard${q}`),
      api.get(`/incidents/${q}`),
    ]).then(([d,i]) => {
      setDash(d.data.data);
      setIncidents(i.data.data||[]);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const selectIncident = async (inc: any) => {
    setSelected(inc);
    try { const r = await api.get(`/incidents/${inc.id}`); setSelectedAgencies(r.data.data.agencies||[]); } catch { setSelectedAgencies([]); }
  };

  const updateStatus = async (id: number, status: string) => {
    await api.put(`/incidents/${id}/status`, { status });
    load(); if (selected?.id===id) setSelected((prev: any) => ({...prev, status}));
  };

  const escalate = async (id: number) => {
    await api.post(`/incidents/${id}/escalate`, { reason:'Multi-agency national response required.' });
    setMsg('🚨 Incident escalated to national level. All relevant agencies notified.');
    load(); setTimeout(()=>setMsg(''),5000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) { setCreateError('Title is required.'); return; }
    setSubmitting(true); setCreateError('');
    try {
      await api.post('/incidents', createForm);
      setMsg('✅ Environmental incident logged and agencies notified.');
      setShowCreateModal(false); setCreateForm(BLANK_INC); load();
      setTimeout(()=>setMsg(''),5000);
    } catch (err: any) { setCreateError(err?.response?.data?.error||'Failed to create incident.'); }
    finally { setSubmitting(false); }
  };

  const handleAddAgency = async () => {
    if (!agencyForm.agency_name || !selected) return;
    await api.post(`/incidents/${selected.id}/agencies`, agencyForm);
    setShowAgencyModal(false); setAgencyForm(BLANK_AGN);
    selectIncident(selected);
  };

  const typeChart = dash?.by_type||[];
  const sevChart  = dash?.by_severity||[];
  const active    = incidents.filter(i=>i.status!=='resolved');

  return (
    <div className="space-y-5">

      {/* Banner */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{background:'linear-gradient(135deg,#0f0f23 0%,#1e1b4b 50%,#312e81 100%)'}}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/5"/>
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Radio size={17} className="text-indigo-300 animate-pulse"/>
              <span className="text-indigo-300 text-sm font-semibold tracking-wide">ENVIRONMENTAL INCIDENT COMMAND CENTER</span>
            </div>
            <h2 className="text-2xl font-extrabold">Multi-Agency Environmental Response</h2>
            <p className="text-indigo-100 text-sm mt-1">Real-time incident tracking · Escalation · Satellite verification · Agency coordination</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="p-2.5 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 transition-colors"><RefreshCw size={16} className="text-white"/></button>
            {canCommand&&<button onClick={()=>{setShowCreateModal(true);setCreateError('');}} className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold flex items-center gap-2"><Plus size={16}/> Log Incident</button>}
          </div>
        </div>
      </div>

      {msg&&<div className={`px-4 py-3 rounded-2xl text-sm font-medium border ${msg.startsWith('✅')?'bg-green-50 border-green-200 text-green-700':'bg-orange-50 border-orange-200 text-orange-700'}`}>{msg}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} title="Active Incidents" value={dash?.active_incidents||0} subtitle="Under monitoring" icon={AlertTriangle} color="red"/>
        <StatCard loading={loading} title="Critical / Emergency" value={dash?.critical_incidents||0} subtitle="Immediate response needed" icon={Zap} color="red"/>
        <StatCard loading={loading} title="GWN Pending Review" value={dash?.gwn_pending_review||0} subtitle="Citizen reports awaiting" icon={Users} color="orange"/>
        <StatCard loading={loading} title="Escalated" value={dash?.escalated_reports||0} subtitle="National-level escalation" icon={Shield} color="purple"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {(['active','all','analytics'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab===t?'text-white shadow':'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}
            style={tab===t?{background:'linear-gradient(135deg,#1e1b4b,#312e81)'}:undefined}>
            {t==='active'?`🔴 Active (${active.length})`:t==='all'?'📋 All Incidents':'📊 Analytics'}
          </button>
        ))}
      </div>

      {/* ══ ACTIVE / ALL ══ */}
      {(tab==='active'||tab==='all')&&(
        <div className="grid lg:grid-cols-3 gap-5">
          {/* List */}
          <div className="lg:col-span-2 space-y-3">
            {(tab==='active'?active:incidents).map(inc=>(
              <div key={inc.id}
                className={`card cursor-pointer transition-all hover:shadow-md border-l-4 ${selected?.id===inc.id?'ring-2 ring-indigo-500':''}`}
                style={{borderLeftColor:SEV_COLORS[inc.severity]||'#6b7280'}}
                onClick={()=>selectIncident(inc)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{inc.title}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{background:(SEV_COLORS[inc.severity]||'#6b7280')+'20',color:SEV_COLORS[inc.severity]||'#6b7280'}}>{inc.severity?.toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{inc.description}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                      <span>📍 {inc.district}</span>
                      <span>🤖 Risk: {inc.ai_risk_score?.toFixed(0)}%</span>
                      <span>👥 {(inc.affected_population||0).toLocaleString()} affected</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${STATUS_BG[inc.status]||'bg-gray-100 text-gray-500'}`}>{inc.status?.toUpperCase().replace(/_/g,' ')}</span>
                    {inc.agency_count>0&&<span className="text-[10px] text-gray-400">{inc.agency_count} agencies</span>}
                    <ChevronRight size={14} className="text-gray-300"/>
                  </div>
                </div>
              </div>
            ))}
            {!loading&&(tab==='active'?active:incidents).length===0&&(
              <div className="card text-center py-10"><CheckCircle size={32} className="mx-auto text-green-400 mb-2"/><div className="text-gray-500">No incidents found.</div></div>
            )}
          </div>

          {/* Detail panel */}
          <div>
            {selected?(
              <div className="card sticky top-4 space-y-4">
                <div className="font-bold text-gray-800 dark:text-gray-100">{selected.title}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[['District',selected.district],['Severity',selected.severity],['AI Risk',`${selected.ai_risk_score?.toFixed(0)}%`],['Status',selected.status],['Affected',(selected.affected_population||0).toLocaleString()],['Type',selected.incident_type?.replace(/_/g,' ')]].map(([k,v])=>(
                    <div key={k} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-gray-400">{k}</div>
                      <div className="font-semibold text-gray-700 dark:text-gray-200 capitalize">{v}</div>
                    </div>
                  ))}
                </div>
                {selected.description&&<p className="text-xs text-gray-600 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">{selected.description}</p>}

                {/* Agencies */}
                {selectedAgencies.length>0&&(
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Assigned Agencies</div>
                    {selectedAgencies.map(a=>(
                      <div key={a.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <span className="font-semibold text-gray-700 dark:text-gray-300 flex-1">{a.agency_name}</span>
                        <span className="text-gray-400 capitalize">{a.agency_role}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {canCommand&&selected.status!=='resolved'&&(
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Command Actions</div>
                    {selected.status==='active'&&<button onClick={()=>updateStatus(selected.id,'investigating')} className="btn-secondary text-xs w-full justify-center">Start Investigation</button>}
                    {selected.status==='investigating'&&<button onClick={()=>updateStatus(selected.id,'contained')} className="btn-secondary text-xs w-full justify-center">Mark Contained</button>}
                    {selected.status==='contained'&&<button onClick={()=>updateStatus(selected.id,'resolved')} className="btn-success text-xs w-full justify-center"><CheckCircle size={12}/>Mark Resolved</button>}
                    {selected.status!=='escalated'&&selected.severity!=='low'&&(
                      <button onClick={()=>escalate(selected.id)} className="text-xs py-2 rounded-xl font-bold text-white w-full flex items-center justify-center gap-1.5" style={{background:'linear-gradient(135deg,#1e1b4b,#7c3aed)'}}>
                        <Zap size={12}/>Escalate to National
                      </button>
                    )}
                    <button onClick={()=>setShowAgencyModal(true)} className="btn-secondary text-xs w-full justify-center"><Users size={12}/>Add Agency</button>
                  </div>
                )}
              </div>
            ):(
              <div className="card text-center py-10">
                <Radio size={28} className="mx-auto text-gray-300 mb-2"/>
                <div className="text-sm text-gray-400">Select an incident to view details</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ ANALYTICS ══ */}
      {tab==='analytics'&&(
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card">
            <h3 className="section-title mb-4">By Incident Type</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={typeChart} margin={{top:5,right:10,left:-20,bottom:30}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="incident_type" tick={{fontSize:8}} angle={-25} textAnchor="end" height={50} tickFormatter={(v: string)=>v?.replace(/_/g,' ').slice(0,14)}/>
                <YAxis tick={{fontSize:10}}/>
                <Tooltip/>
                <Bar dataKey="count" radius={[4,4,0,0]}>{typeChart.map((_: any,i: number)=><Cell key={i} fill={['#dc2626','#ea580c','#d97706','#16a34a','#2563eb','#7c3aed'][i%6]}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3 className="section-title mb-4">By Severity</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sevChart} margin={{top:5,right:10,left:-20,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="severity" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:10}}/>
                <Tooltip/>
                <Bar dataKey="count" radius={[4,4,0,0]}>{sevChart.map((s: any,i: number)=><Cell key={i} fill={SEV_COLORS[s.severity]||'#6b7280'}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card lg:col-span-2">
            <h3 className="section-title mb-4">Command Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[{label:'Active Incidents',value:dash?.active_incidents||0,color:'#dc2626'},{label:'Resolved (24h)',value:dash?.resolved_24h||0,color:'#16a34a'},{label:'Avg AI Risk',value:`${dash?.avg_ai_risk||0}%`,color:'#ea580c'},{label:'Response Agencies',value:AGENCIES.length,color:'#2563eb'}].map(({label,value,color})=>(
                <div key={label} className="p-4 rounded-2xl text-center" style={{background:color+'15',border:`1px solid ${color}30`}}>
                  <div className="text-2xl font-extrabold" style={{color}}>{value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ CREATE INCIDENT MODAL ══ */}
      {showCreateModal&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center" style={{background:'linear-gradient(135deg,#1e1b4b,#312e81)'}}>
              <span className="font-bold text-white flex items-center gap-2"><AlertTriangle size={16}/>Log Environmental Incident</span>
              <button onClick={()=>setShowCreateModal(false)} className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {createError&&<div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><span className="font-bold">✕</span> {createError}</div>}
              <div><label className="label">Title *</label><input className="input" required value={createForm.title} onChange={e=>setCreateForm({...createForm,title:e.target.value})} placeholder="Brief incident title..."/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Type</label>
                  <select className="input" value={createForm.incident_type} onChange={e=>setCreateForm({...createForm,incident_type:e.target.value})}>
                    {TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div><label className="label">Severity</label>
                  <select className="input" value={createForm.severity} onChange={e=>setCreateForm({...createForm,severity:e.target.value})}>
                    {['low','medium','high','critical','emergency'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="label">District *</label>
                  <select className="input" required value={createForm.district} onChange={e=>setCreateForm({...createForm,district:e.target.value})}>
                    {DISTRICTS.map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div><label className="label">Affected Population</label><input className="input" type="number" value={createForm.affected_population} onChange={e=>setCreateForm({...createForm,affected_population:parseInt(e.target.value)||0})}/></div>
              </div>
              <div><label className="label">Description</label><textarea className="input" rows={3} value={createForm.description} onChange={e=>setCreateForm({...createForm,description:e.target.value})}/></div>
              <div className="flex gap-3">
                <button type="button" onClick={()=>setShowCreateModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60" style={{background:'linear-gradient(135deg,#1e1b4b,#dc2626)'}}>
                  {submitting&&<span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>}
                  {submitting?'Logging...':'Log Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ ADD AGENCY MODAL ══ */}
      {showAgencyModal&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2"><Users size={16}/>Assign Response Agency</h3>
            <div className="space-y-3">
              <div><label className="label">Agency *</label>
                <select className="input" value={agencyForm.agency_name} onChange={e=>setAgencyForm({...agencyForm,agency_name:e.target.value})}>
                  <option value="">— Select agency —</option>
                  {AGENCIES.map(a=><option key={a}>{a}</option>)}
                </select>
              </div>
              <div><label className="label">Role</label>
                <select className="input" value={agencyForm.agency_role} onChange={e=>setAgencyForm({...agencyForm,agency_role:e.target.value})}>
                  {['lead','support','observer','enforcement'].map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div><label className="label">Officer Name</label><input className="input" value={agencyForm.officer_name} onChange={e=>setAgencyForm({...agencyForm,officer_name:e.target.value})}/></div>
              <div><label className="label">Contact</label><input className="input" value={agencyForm.contact} onChange={e=>setAgencyForm({...agencyForm,contact:e.target.value})} placeholder="+256..."/></div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={()=>setShowAgencyModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleAddAgency} className="btn-primary flex-1 justify-center">Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
