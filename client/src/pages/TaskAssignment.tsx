import { useState, useEffect } from 'react';
import { getTaskAssignments, getTaskStats, autoAssignTask, createTaskAssignment, updateTaskStatus } from '../api/client';
import { TaskAssignment as TaskAssignmentType } from '../types';
import { Hammer, Loader2, RefreshCw, Plus, CheckCircle, AlertCircle } from 'lucide-react';

export default function TaskAssignment() {
  const [tasks, setTasks] = useState<TaskAssignmentType[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [taskRes, statRes] = await Promise.all([
        getTaskAssignments(),
        getTaskStats().catch(() => ({ data: { data: null } })),
      ]);
      setTasks(taskRes.data.data || []);
      setStats(statRes.data.data || null);
    } catch { } finally {
      setLoading(false);
    }
  };

  const handleAutoAssign = async () => {
    try {
      const res = await autoAssignTask({});
      setMessage(res.data.message || '✅ Auto-assignment complete');
      loadAll();
    } catch (err: any) {
      setMessage(`❌ ${err.response?.data?.error || 'Failed'}`);
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await updateTaskStatus(id, { status });
      setMessage(`✅ Task ${status === 'completed' ? 'completed' : status === 'in_progress' ? 'started' : 'updated'}`);
      loadAll();
    } catch (err: any) {
      setMessage(`❌ ${err.response?.data?.error || 'Failed'}`);
    }
  };

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Hammer size={20} className="text-amber-600" /></div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Intelligent Task Assignment</h1>
              <p className="text-gray-500 text-sm">AI-powered task allocation and response ticket management</p>
            </div>
          </div>
        </div>
        <button onClick={handleAutoAssign} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-lg">
          <Loader2 size={14} /> Auto-Assign Tasks
        </button>
      </div>

      {message && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">{message}</div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Total Tasks', value: stats.total, icon: '📋', color: 'bg-blue-50 border-blue-200 text-blue-700' },
            { label: 'Pending', value: stats.pending, icon: '⏳', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
            { label: 'Completed', value: stats.completed, icon: '✅', color: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Departments', value: stats.by_department?.length || 0, icon: '🏢', color: 'bg-purple-50 border-purple-200 text-purple-700' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border-2 p-3 ${s.color}`}>
              <span className="text-lg">{s.icon}</span>
              <div className="text-xl font-bold mt-1">{s.value}</div>
              <div className="text-xs font-semibold">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${filter === 'all' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          All ({tasks.length})
        </button>
        {['assigned', 'in_progress', 'completed'].map(s => {
          const c = tasks.filter(t => t.status === s).length;
          return (
            <button key={s} onClick={() => setFilter(s)} className={`px-4 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${filter === s ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {s.replace('_', ' ')} ({c})
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={loadAll} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No tasks found</h3>
          <p className="text-gray-500 text-sm">Use auto-assign to generate tasks from pending reports.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <div key={task.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{task.task_type}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${task.priority === 'emergency' ? 'bg-red-100 text-red-700 border-red-200' : task.priority === 'high' ? 'bg-orange-100 text-orange-700 border-orange-200' : task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                      {task.priority}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${task.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : task.status === 'in_progress' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                    {task.department && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">{task.department}</span>}
                  </div>
                  {task.description && <p className="text-xs text-gray-600 mt-1">{task.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                    <span>📍 {task.district || task.report_district}{task.location ? `, ${task.location}` : ''}</span>
                    {task.assigned_to_name && <span>👤 Assigned to: {task.assigned_to_name}</span>}
                    {task.assigned_by_name && <span>📝 by {task.assigned_by_name}</span>}
                    {task.incident_type && <span className="capitalize">📋 {task.incident_type.replace(/_/g, ' ')}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {task.status === 'assigned' && (
                    <button onClick={() => handleUpdateStatus(task.id, 'in_progress')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all">
                      Start
                    </button>
                  )}
                  {task.status === 'in_progress' && (
                    <button onClick={() => handleUpdateStatus(task.id, 'completed')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-all">
                      <CheckCircle size={12} className="inline mr-1" /> Complete
                    </button>
                  )}
                  <span className="text-[10px] text-gray-400 text-center">{new Date(task.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {stats && stats.by_department && stats.by_department.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tasks by Department</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {stats.by_department.map((d: any) => (
              <div key={d.department} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-lg font-bold text-gray-900">{d.c}</div>
                <div className="text-xs text-gray-600">{d.department}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
