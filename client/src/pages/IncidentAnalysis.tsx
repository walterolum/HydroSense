import { useState, useEffect } from 'react';
import { getIncidentAnalysisDashboard, getPendingAnalysis, analyzeAllPending, analyzeCitizenReport, getIncidentAnalysis } from '../api/client';
import { IncidentAnalysisDashboard, IncidentAnalysis as IncidentAnalysisType, CitizenReport } from '../types';
import { Brain, AlertTriangle, Loader2, RefreshCw, TrendingUp, CheckCircle, X, MapPin, Calendar, User, Phone, Mail, Droplets, Users, FileText, ChevronRight } from 'lucide-react';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:      'bg-green-100 text-green-700 border-green-200',
};

function ReportDetailModal({ report, onClose, onAnalyze, analyzing }: {
  report: CitizenReport;
  onClose: () => void;
  onAnalyze: (id: number) => void;
  analyzing: boolean;
}) {
  const sev = report.ai_severity || report.severity || 'medium';
  const severityStyle = SEVERITY_STYLE[sev] || SEVERITY_STYLE.medium;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-base capitalize">
                {report.incident_type?.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-gray-400">#{report.id}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${severityStyle}`}>
                {sev}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
              <Calendar size={11} />
              {new Date(report.created_at).toLocaleString()}
            </div>
          </div>
          <button onClick={onClose} className="ml-2 p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Reporter Info */}
          {!report.is_anonymous && (report.reporter_name || report.reporter_phone || report.reporter_email) && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 space-y-1.5">
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Reporter</div>
              {report.reporter_name && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <User size={13} className="text-blue-500 flex-shrink-0" />
                  {report.reporter_name}
                </div>
              )}
              {report.reporter_phone && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Phone size={13} className="text-blue-500 flex-shrink-0" />
                  {report.reporter_phone}
                </div>
              )}
              {report.reporter_email && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Mail size={13} className="text-blue-500 flex-shrink-0" />
                  {report.reporter_email}
                </div>
              )}
            </div>
          )}

          {/* Location */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Location</div>
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <MapPin size={13} className="text-red-500 mt-0.5 flex-shrink-0" />
              <span>
                {[report.village, report.sub_county, report.district].filter(Boolean).join(', ')}
              </span>
            </div>
            {(report.lat && report.lng) && (
              <div className="text-[11px] text-gray-400 ml-5">
                GPS: {Number(report.lat).toFixed(5)}, {Number(report.lng).toFixed(5)}
              </div>
            )}
          </div>

          {/* Full Description */}
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Full Description</div>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-xl p-3">
              {report.description}
            </p>
          </div>

          {/* Impact */}
          {(report.water_impact || report.affected_population) && (
            <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 space-y-1.5">
              <div className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-1">Impact</div>
              {report.water_impact && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Droplets size={13} className="text-orange-500 flex-shrink-0" />
                  {report.water_impact}
                </div>
              )}
              {report.affected_population != null && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Users size={13} className="text-orange-500 flex-shrink-0" />
                  {report.affected_population.toLocaleString()} people affected
                </div>
              )}
            </div>
          )}

          {/* Speech-to-text / Voice transcript */}
          {report.speech_to_text && (
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Voice Transcript</div>
              <p className="text-xs text-gray-600 leading-relaxed bg-purple-50 border border-purple-100 rounded-xl p-3 italic">
                "{report.speech_to_text}"
              </p>
            </div>
          )}

          {/* AI Analysis */}
          {(report.ai_category || report.ai_risk_score != null || report.response_recommendation) && (
            <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-3 space-y-2">
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">AI Analysis</div>
              <div className="flex flex-wrap gap-2">
                {report.ai_category && (
                  <span className="text-xs bg-white px-2 py-1 rounded-lg border border-blue-100 text-blue-700 capitalize">
                    {report.ai_category.replace(/_/g, ' ')}
                  </span>
                )}
                {report.ai_risk_score != null && (
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${report.ai_risk_score >= 70 ? 'bg-red-50 text-red-700 border-red-200' : report.ai_risk_score >= 45 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                    Risk: {report.ai_risk_score}%
                  </span>
                )}
                {report.confidence_score != null && (
                  <span className="text-xs bg-white px-2 py-1 rounded-lg border border-blue-100 text-gray-600">
                    Confidence: {report.confidence_score}%
                  </span>
                )}
              </div>
              {report.response_recommendation && (
                <div className="text-xs text-blue-700 bg-white rounded-lg border border-blue-100 p-2">
                  <ChevronRight size={11} className="inline mr-1" />
                  {report.response_recommendation}
                </div>
              )}
            </div>
          )}

          {/* Status + Channel */}
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <FileText size={11} /> Status: <span className="font-semibold capitalize text-gray-700">{report.status}</span>
            </span>
            <span className="flex items-center gap-1">
              Channel: <span className="font-semibold capitalize text-gray-700">{report.channel}</span>
            </span>
          </div>

          {/* Photos */}
          {report.media && report.media.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Photos ({report.media.length})
              </div>
              <div className="grid grid-cols-2 gap-2">
                {report.media.map(m => m.file_data || m.file_path ? (
                  <img
                    key={m.id}
                    src={m.file_data ? `data:${m.mime_type};base64,${m.file_data}` : m.file_path}
                    alt="Report photo"
                    className="w-full h-32 object-cover rounded-xl border border-gray-200"
                  />
                ) : null)}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 sticky bottom-0 bg-white flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Close
          </button>
          {(!report.ai_category) && (
            <button
              onClick={() => { onAnalyze(report.id); onClose(); }}
              disabled={analyzing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 transition-all"
            >
              {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />}
              Analyze with AI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IncidentAnalysis() {
  const [dashboard, setDashboard] = useState<IncidentAnalysisDashboard | null>(null);
  const [analysis, setAnalysis] = useState<IncidentAnalysisType[]>([]);
  const [pendingReports, setPendingReports] = useState<CitizenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'dashboard' | 'analysis' | 'pending'>('dashboard');
  const [selectedReport, setSelectedReport] = useState<CitizenReport | null>(null);

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
                <div
                  key={r.id}
                  onClick={() => setSelectedReport(r)}
                  className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 capitalize">{r.incident_type?.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-gray-400">#{r.id}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{r.description}</p>
                    <div className="text-[10px] text-gray-400 mt-1">📍 {r.district} · 📅 {new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleAnalyzeOne(r.id); }}
                    disabled={analyzing}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all disabled:opacity-50 ml-3"
                  >
                    <Brain size={12} /> Analyze
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onAnalyze={handleAnalyzeOne}
          analyzing={analyzing}
        />
      )}
    </div>
  );
}
