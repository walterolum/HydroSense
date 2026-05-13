import { useState, useEffect } from 'react';
import { getIncidentAnalysisDashboard, getPendingAnalysis, analyzeAllPending, analyzeCitizenReport, getIncidentAnalysis } from '../api/client';
import { IncidentAnalysisDashboard, IncidentAnalysis as IncidentAnalysisType, CitizenReport } from '../types';
import { Brain, AlertTriangle, Loader2, RefreshCw, Search, TrendingUp, CheckCircle, XCircle } from 'lucide-react';

export default function IncidentAnalysis() {
  const [dashboard, setDashboard] = useState<IncidentAnalysisDashboard | null>(null);
  const [analysis, setAnalysis] = useState<IncidentAnalysisType[]>([]);
  const [pendingReports, setPendingReports] = useState<CitizenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'dashboard' | 'analysis' | 'pending'>('dashboard');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dashRes, analysisRes, pendingRes] = await Promise.all([
        getIncidentAnalysisDashboard(),
        getIncidentAnalysis().catch(() => ({ data: { data: [] } })),
        getPendingAnalysis().catch(() => ({ data: { data: [] } })),
      ]);
      setDashboard(dashRes.data.data);
      setAnalysis(analysisRes.data.data || []);
      setPendingReports(pendingRes.data.data || []);
    } catch { } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    setMessage('');
    try {
      const res = await analyzeAllPending();
      setMessage(`✅ ${res.data.message || 'Analysis complete'}`);
      loadAll();
    } catch (err: any) {
      setMessage(`❌ ${err.response?.data?.error || 'Analysis failed'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeOne = async (id: number) => {
    try {
      await analyzeCitizenReport(id);
      setMessage(`✅ Report #${id} analyzed successfully`);
      loadAll();
    } catch (err: any) {
      setMessage(`❌ ${err.response?.data?.error || 'Analysis failed'}`);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI-Powered Incident Analysis Engine</h1>
          <p className="text-gray-500 text-sm mt-1">Automated severity detection, categorization, and intelligence for all citizen reports</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {message && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">{message}</div>
      )}

      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          {[
            { label: 'Total Analyzed', value: dashboard.total_analyzed, icon: '📊', color: 'bg-blue-50 border-blue-200 text-blue-700' },
            { label: 'High Risk', value: dashboard.high_risk, icon: '🔴', color: 'bg-red-50 border-red-200 text-red-700' },
            { label: 'Duplicates', value: dashboard.duplicates, icon: '🔄', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
            { label: 'False Reports', value: dashboard.false_reports, icon: '❌', color: 'bg-orange-50 border-orange-200 text-orange-700' },
            { label: 'Pending Analysis', value: dashboard.pending_analysis, icon: '⏳', color: 'bg-purple-50 border-purple-200 text-purple-700' },
            { label: 'Avg Confidence', value: `${dashboard.avg_confidence}%`, icon: '🎯', color: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Categories', value: dashboard.by_category?.length || 0, icon: '🏷️', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border-2 p-3 ${s.color}`}>
              <div className="flex items-center justify-between">
                <span className="text-lg">{s.icon}</span>
                <span className="text-xl font-bold">{s.value}</span>
              </div>
              <div className="text-xs font-semibold mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => setTab('dashboard')} className={`px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${tab === 'dashboard' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          <Brain size={14} className="inline mr-1.5" /> AI Dashboard
        </button>
        <button onClick={() => setTab('analysis')} className={`px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${tab === 'analysis' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          <TrendingUp size={14} className="inline mr-1.5" /> Analysis Results
        </button>
        <button onClick={() => setTab('pending')} className={`px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${tab === 'pending' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          <AlertTriangle size={14} className="inline mr-1.5" /> Pending ({pendingReports.length})
        </button>
      </div>

      {tab === 'dashboard' && dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Analysis by Category</h3>
            <div className="space-y-3">
              {dashboard.by_category?.map(c => (
                <div key={c.ai_category} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 capitalize">{c.ai_category.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(c.c / Math.max(...dashboard.by_category.map(x => x.c))) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-8 text-right">{c.c}</span>
                  </div>
                </div>
              ))}
              {(!dashboard.by_category || dashboard.by_category.length === 0) && (
                <p className="text-sm text-gray-400">No categories yet</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Distribution</h3>
            <div className="flex items-center justify-center h-40 gap-6">
              {[
                { label: 'High Risk', count: dashboard.high_risk, color: 'bg-red-500' },
                { label: 'Total Duplicates', count: dashboard.duplicates, color: 'bg-yellow-500' },
                { label: 'False Reports', count: dashboard.false_reports, color: 'bg-orange-500' },
                { label: 'Valid Reports', count: dashboard.total_analyzed - dashboard.duplicates - dashboard.false_reports, color: 'bg-green-500' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className={`w-16 h-16 rounded-2xl ${s.color} bg-opacity-20 flex items-center justify-center mx-auto mb-2`}>
                    <span className={`text-xl font-bold ${s.color.replace('bg-', 'text-')}`}>{s.count}</span>
                  </div>
                  <div className="text-xs font-medium text-gray-600">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Analysis Results</h3>
            <div className="space-y-3">
              {dashboard.recent?.slice(0, 8).map(a => (
                <div key={a.id} className="flex items-start justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`mt-0.5 text-lg ${a.ai_risk_score >= 70 ? '🔴' : a.ai_risk_score >= 45 ? '🟡' : '🟢'}`}></span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 capitalize">{a.ai_category?.replace(/_/g, ' ') || 'Uncategorized'}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${a.ai_risk_score >= 70 ? 'bg-red-100 text-red-700 border-red-200' : a.ai_risk_score >= 45 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                          Risk: {a.ai_risk_score}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.ai_summary || a.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                        <span>📍 {a.district}</span>
                        <span>🎯 {a.confidence_score}% confidence</span>
                        {a.is_duplicate ? <span className="text-yellow-600">🔄 Duplicate</span> : null}
                        {a.is_false_report ? <span className="text-red-600">❌ False report</span> : null}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{new Date(a.analyzed_at || a.report_date || '').toLocaleDateString()}</span>
                </div>
              ))}
              {(!dashboard.recent || dashboard.recent.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">No analysis results yet. Analyze pending reports.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'analysis' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">All Analysis Results</h3>
          <div className="space-y-3">
            {analysis.map(a => (
              <div key={a.id} className="flex items-start justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 capitalize">{a.ai_category?.replace(/_/g, ' ') || 'Uncategorized'}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${a.ai_risk_score >= 70 ? 'bg-red-100 text-red-700 border-red-200' : a.ai_risk_score >= 45 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                      Risk: {a.ai_risk_score}%
                    </span>
                    {a.is_duplicate ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">Duplicate</span> : null}
                    {a.is_false_report ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">False Report</span> : null}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{a.ai_summary || a.description}</p>
                  <div className="flex items-center gap-4 mt-1 text-[10px] text-gray-400 flex-wrap">
                    <span>📍 {a.district}</span>
                    <span>📊 Severity: {a.ai_severity}</span>
                    <span>🎯 Confidence: {a.confidence_score}%</span>
                    <span>⏱ Urgency: {a.ai_urgency}</span>
                  </div>
                  {a.response_recommendation && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                      <span className="text-[10px] font-bold text-blue-700">Recommendation:</span>
                      <p className="text-[10px] text-blue-600 mt-0.5">{a.response_recommendation}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {analysis.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No analysis results available.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'pending' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Pending Analysis ({pendingReports.length} reports)
            </h3>
            <button onClick={handleAnalyzeAll} disabled={analyzing || pendingReports.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg disabled:opacity-60">
              {analyzing ? <><Loader2 size={14} className="animate-spin" /> Analyzing...</> : <><Brain size={14} /> Analyze All Pending</>}
            </button>
          </div>

          {pendingReports.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle size={48} className="mx-auto text-green-400 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900">All reports analyzed!</h3>
              <p className="text-sm text-gray-500 mt-1">No pending reports waiting for AI analysis.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingReports.map(r => (
                <div key={r.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 capitalize">{r.incident_type?.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-gray-400">#{r.id}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{r.description}</p>
                    <div className="text-[10px] text-gray-400 mt-1">📍 {r.district} · 📅 {new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => handleAnalyzeOne(r.id)} disabled={analyzing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all disabled:opacity-50">
                    <Brain size={12} /> Analyze
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
