import { useEffect, useState } from 'react';
import { Wrench, CheckCircle, Clock, MapPin, AlertTriangle, Cpu, RefreshCw, ChevronRight } from 'lucide-react';
import { getMaintenanceRequests, updateMaintenanceRequest, getSensors } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import StatusBadge from '../../components/common/StatusBadge';

const PRIORITY_COLORS: Record<string,string> = {
  critical:'text-red-600 bg-red-50 border-red-200',
  high:'text-orange-600 bg-orange-50 border-orange-200',
  medium:'text-yellow-600 bg-yellow-50 border-yellow-200',
  low:'text-gray-500 bg-gray-50 border-gray-200',
};

const TYPE_ICONS: Record<string,string> = {
  pump_failure:'⚙️', breakdown:'🔧', water_quality:'🧪',
  contamination:'⚠️', shortage:'💧', infrastructure:'🏗️',
};

export default function TechnicianPortal() {
  const { user } = useAuth();
  const isCitizen = user?.role === 'citizen';
  const [tasks, setTasks]         = useState<any[]>([]);
  const [sensors, setSensors]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<'pending'|'in_progress'|'completed'>('pending');
  const [updating, setUpdating]   = useState<number|null>(null);
  const [selected, setSelected]   = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      getMaintenanceRequests({ limit: 100 }),
      getSensors({ limit: 50 }),
    ]).then(([mr, sr]) => {
      setTasks(mr.data.data || []);
      setSensors(sr.data.data || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = tasks.filter(t => t.status === activeTab || (activeTab === 'pending' && t.status === 'assigned'));

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try { await updateMaintenanceRequest(id, { status }); load(); }
    finally { setUpdating(null); }
  };

  const pending     = tasks.filter(t => t.status === 'pending' || t.status === 'assigned').length;
  const inProgress  = tasks.filter(t => t.status === 'in_progress').length;
  const completed   = tasks.filter(t => t.status === 'completed').length;
  const lowBattery  = sensors.filter(s => s.battery_level < 20).length;
  const offline     = sensors.filter(s => s.status === 'offline').length;

  return (
    <div className="space-y-5">

      {/* Technician header */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#78350f 0%,#92400e 50%,#d97706 100%)' }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wrench size={17} className="text-yellow-300" />
              <span className="text-yellow-300 text-sm font-semibold tracking-wide">
                {isCitizen ? 'FIELD OPERATIONS' : 'FIELD TECHNICIAN PORTAL'}
              </span>
            </div>
            <h2 className="text-2xl font-extrabold">
              {isCitizen ? 'Tasks & Work Orders' : 'My Tasks & Work Orders'}
            </h2>
            <p className="text-orange-100 text-sm mt-1">
              {isCitizen
                ? `${user?.district || 'All Zones'} · ${new Date().toLocaleDateString('en-UG', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}`
                : `${user?.name} · ${user?.district || 'All Zones'} · ${new Date().toLocaleDateString('en-UG', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}`}
            </p>
          </div>
          <button onClick={load} className="p-2.5 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 transition-colors">
            <RefreshCw size={16} className="text-white" />
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label:'Pending Tasks',  value:pending,    color:'#ea580c', icon:'📋' },
          { label:'In Progress',    value:inProgress, color:'#2563eb', icon:'🔧' },
          { label:'Completed Today',value:completed,  color:'#16a34a', icon:'✅' },
          { label:'Low Battery',    value:lowBattery, color:'#d97706', icon:'🔋' },
          { label:'Offline Sensors',value:offline,    color:'#dc2626', icon:'📡' },
        ].map(s => (
          <div key={s.label} className="card text-center py-3">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-extrabold" style={{ color:s.color }}>{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Priority alert */}
      {tasks.filter(t => t.priority === 'critical' && t.status !== 'completed').length > 0 && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 animate-pulse" />
          <div>
            <span className="font-bold text-red-800 text-sm">
              {tasks.filter(t => t.priority === 'critical' && t.status !== 'completed').length} Critical task(s) require immediate attention
            </span>
            <div className="text-xs text-red-600 mt-0.5">
              {tasks.filter(t => t.priority === 'critical' && t.status !== 'completed').map(t => t.water_point_name).join(', ')}
            </div>
          </div>
        </div>
      )}

      {/* Task tabs + list */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-3">
          {/* Tabs */}
          <div className="flex gap-1.5">
            {(['pending','in_progress','completed'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab===tab?'bg-orange-600 text-white shadow':'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                {tab === 'pending' ? `📋 Pending (${pending})` : tab === 'in_progress' ? `🔧 In Progress (${inProgress})` : `✅ Completed (${completed})`}
              </button>
            ))}
          </div>

          {loading
            ? Array(4).fill(0).map((_, i) => (
                <div key={i} className="card animate-pulse"><div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl" /></div>
              ))
            : filtered.length === 0
              ? (
                  <div className="card text-center py-10">
                    <CheckCircle size={32} className="mx-auto text-green-400 mb-2" />
                    <div className="text-gray-500 font-medium">No {activeTab.replace('_',' ')} tasks</div>
                    <div className="text-sm text-gray-400 mt-1">
                      {activeTab === 'completed' ? 'Complete some tasks to see them here.' : 'All caught up!'}
                    </div>
                  </div>
                )
              : filtered.map(task => (
                  <div key={task.id}
                    className={`card cursor-pointer transition-all hover:shadow-md border-l-4 ${selected?.id===task.id?'ring-2 ring-orange-500':''}`}
                    style={{ borderLeftColor: task.priority==='critical'?'#dc2626':task.priority==='high'?'#ea580c':task.priority==='medium'?'#d97706':'#6b7280' }}
                    onClick={() => setSelected(task)}>
                    <div className="flex items-start gap-3">
                      <div className="text-2xl flex-shrink-0 mt-0.5">{TYPE_ICONS[task.issue_type] || '🔧'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{task.water_point_name || `Water Point #${task.water_point_id}`}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_COLORS[task.priority]||''}`}>
                            {task.priority?.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 capitalize">{task.issue_type?.replace(/_/g,' ')}</div>
                        {task.description && <div className="text-xs text-gray-400 mt-1 line-clamp-1">{task.description}</div>}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin size={10} />{task.district}</span>
                          <span className="flex items-center gap-1"><Clock size={10} />{new Date(task.created_at).toLocaleDateString()}</span>
                          {task.estimated_cost && <span>Est: UGX {parseInt(task.estimated_cost).toLocaleString()}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <StatusBadge status={task.status} type="maintenance" />
                        <ChevronRight size={14} className="text-gray-300" />
                      </div>
                    </div>

                    {/* Action buttons — technicians/admins only */}
                    {task.status !== 'completed' && !isCitizen && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        {(task.status === 'pending' || task.status === 'assigned') && (
                          <button
                            onClick={e => { e.stopPropagation(); updateStatus(task.id, 'in_progress'); }}
                            disabled={updating === task.id}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-60"
                            style={{ background:'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                            {updating === task.id ? '⏳ Starting...' : '▶ Start Task'}
                          </button>
                        )}
                        {task.status === 'in_progress' && (
                          <button
                            onClick={e => { e.stopPropagation(); updateStatus(task.id, 'completed'); }}
                            disabled={updating === task.id}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-60"
                            style={{ background:'linear-gradient(135deg,#16a34a,#15803d)' }}>
                            {updating === task.id ? '⏳ Completing...' : '✅ Mark Complete'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
          }
        </div>

        {/* Detail panel + sensor health */}
        <div className="space-y-4">
          {selected ? (
            <div className="card sticky top-4">
              <div className="font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                <span className="text-xl">{TYPE_ICONS[selected.issue_type]||'🔧'}</span>
                Task Details
              </div>
              <div className="space-y-2">
                {[
                  ['Water Point',      selected.water_point_name || `#${selected.water_point_id}`],
                  ['District',         selected.district],
                  ['Issue Type',       selected.issue_type?.replace(/_/g,' ')],
                  ['Priority',         selected.priority],
                  ['Status',           selected.status?.replace(/_/g,' ')],
                  ...(selected.assigned_to_name ? [['Assigned To', selected.assigned_to_name]] : []),
                  ['Cost Est.',        selected.estimated_cost ? `UGX ${parseInt(selected.estimated_cost).toLocaleString()}` : '—'],
                  ['Created',          new Date(selected.created_at).toLocaleString()],
                ].map(([k,v]) => (
                  <div key={k} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-400 w-24 flex-shrink-0 text-xs">{k}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-200 capitalize">{v}</span>
                  </div>
                ))}
                {selected.description && (
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Description</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">{selected.description}</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card text-center py-8">
              <Wrench size={28} className="mx-auto text-gray-300 mb-2" />
              <div className="text-sm text-gray-400">Select a task to view details</div>
            </div>
          )}

          {/* Sensor health */}
          <div className="card">
            <h3 className="section-title mb-3"><Cpu size={16} className="text-blue-500" /> Sensor Health</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll">
              {sensors.slice(0, 15).map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-700 dark:text-gray-300 truncate">{s.sensor_name}</div>
                    <div className="text-gray-400">{s.district}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-bold ${s.battery_level < 20 ? 'text-red-500' : s.battery_level < 50 ? 'text-yellow-500' : 'text-green-500'}`}>
                      🔋{s.battery_level}%
                    </div>
                  </div>
                </div>
              ))}
              {sensors.length === 0 && !loading && <div className="text-center text-gray-400 py-4">No sensor data</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
