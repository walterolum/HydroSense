import { useState, useEffect } from 'react';
import { getMyReports, getMyReportStats } from '../api/client';
import { CitizenReport, CitizenReportStats } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { Clock, AlertCircle, CheckCircle, Search, Loader2, Eye, Globe, MessageSquare, Phone } from 'lucide-react';
import LanguageSwitcher from '../components/common/LanguageSwitcher';

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Submitted', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: '📤' },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '📤' },
  under_investigation: { label: 'Under Investigation', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '🔍' },
  assigned: { label: 'Assigned', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: '👤' },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700 border-green-200', icon: '✅' },
  escalated: { label: 'Escalated', color: 'bg-red-100 text-red-700 border-red-200', icon: '🚨' },
};

const incidentIcons: Record<string, string> = {
  water_pollution: '💧', illegal_dumping: '🗑️', sewage_leak: '⚠️',
  flooding: '🌊', environmental_hazard: '☣️', infrastructure_damage: '🏗️', water_contamination: '🧪',
};

export default function CitizenTracking() {
  const { t, translate, translateToEnglish, language } = useLanguage();
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [stats, setStats] = useState<CitizenReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<CitizenReport | null>(null);
  const [filter, setFilter] = useState('all');
  const [translating, setTranslating] = useState<Record<number, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [repRes, statRes] = await Promise.all([getMyReports(), getMyReportStats()]);
      setReports(repRes.data.data || []);
      setStats(statRes.data.data || null);
    } catch { } finally {
      setLoading(false);
    }
  };

  const translateStatus = async (reportId: number, status: string) => {
    if (language === 'en') return status;
    const label = statusConfig[status]?.label || status;
    const translated = await translate(label, language);
    setTranslating(prev => ({ ...prev, [reportId]: '' }));
    return translated;
  };

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  const statsCards = [
    { label: t('nav.tracking'), count: stats?.total || 0, icon: '📋', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { label: t('status.submitted'), count: stats?.pending || 0, icon: '⏳', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
    { label: t('status.investigating'), count: stats?.in_progress || 0, icon: '🔄', color: 'bg-purple-50 border-purple-200 text-purple-700' },
    { label: t('status.resolved'), count: stats?.resolved || 0, icon: '✅', color: 'bg-green-50 border-green-200 text-green-700' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('nav.tracking')}</h1>
          <p className="text-gray-500 text-sm mt-1">Track the status of your submitted environmental reports</p>
        </div>
        <LanguageSwitcher compact />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {statsCards.map(s => (
          <div key={s.label} className={`rounded-xl border-2 p-4 ${s.color}`}>
            <div className="flex items-center justify-between">
              <span className="text-2xl">{s.icon}</span>
              <span className="text-2xl font-bold">{s.count}</span>
            </div>
            <div className="text-sm font-semibold mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {stats && stats.status_flow && stats.status_flow.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Report Status Flow</h3>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {stats.status_flow.filter(s => s.count > 0).map((s, i) => (
              <div key={s.status} className="flex items-center">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap"
                  style={{
                    background: i === 0 ? '#dbeafe' : i === stats.status_flow.length - 1 ? '#dcfce7' : '#f3e8ff',
                    color: i === 0 ? '#1d4ed8' : i === stats.status_flow.length - 1 ? '#15803d' : '#7c3aed'
                  }}>
                  <span>{['📤', '🔍', '👤', '✅', '🚨'][i] || '📋'}</span>
                  {s.label}
                </div>
                {i < stats.status_flow.filter(s => s.count > 0).length - 1 && (
                  <div className="w-8 h-0.5 bg-gray-200" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${filter === 'all' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          {t('nav.home')} ({reports.length})
        </button>
        {['pending', 'under_investigation', 'assigned', 'resolved', 'escalated'].map(st => {
          const count = reports.filter(r => r.status === st).length;
          if (count === 0) return null;
          const cfg = statusConfig[st];
          return (
            <button key={st} onClick={() => setFilter(st)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${filter === st ? `${cfg.color} border-current` : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {cfg.icon} {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 font-medium">No reports found</p>
            <p className="text-gray-400 text-sm mt-1">Submit your first environmental report to start tracking</p>
          </div>
        ) : filtered.map(report => {
          const cfg = statusConfig[report.status] || statusConfig.pending;
          return (
            <div key={report.id}
              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{incidentIcons[report.incident_type] || '📋'}</span>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm capitalize">{report.incident_type?.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-gray-400">{report.district}{report.sub_county ? `, ${report.sub_county}` : ''}</div>
                  </div>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 ${cfg.color}`}>
                  {language !== 'en' ? t(`status.${report.status}`) : cfg.label}
                </div>
              </div>

              <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                {language !== 'en' && report.description ? report.description : report.description}
              </p>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Clock size={12} /> {new Date(report.created_at).toLocaleDateString()}</span>
                <span className="flex items-center gap-1">
                  {report.channel === 'sms' ? <MessageSquare size={12} /> : report.channel === 'whatsapp' ? '💬' : report.channel === 'voice' ? '🎤' : <Globe size={12} />}
                  {report.channel}
                </span>
                {report.ai_risk_score && (
                  <span className={`font-semibold ${report.ai_risk_score >= 70 ? 'text-red-500' : report.ai_risk_score >= 45 ? 'text-orange-500' : 'text-green-500'}`}>
                    Risk: {Math.round(report.ai_risk_score)}%
                  </span>
                )}
              </div>

              {selectedReport?.id === report.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="space-y-3">
                    {report.tracking?.map((t: any, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-700">
                            {language !== 'en' ? t(`status.${t.status}`) : (statusConfig[t.status]?.label || t.status)}
                          </div>
                          <div className="text-xs text-gray-400">{new Date(t.created_at).toLocaleString()}</div>
                          {t.note && <div className="text-xs text-gray-500 mt-0.5">{t.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {report.response_recommendation && (
                    <div className="mt-3 px-3 py-2 bg-blue-50 rounded-xl text-xs text-blue-700">
                      <strong>Recommendation:</strong> {report.response_recommendation}
                    </div>
                  )}

                  <button onClick={(e) => { e.stopPropagation(); window.location.href = `/report-status?id=${report.id}`; }}
                    className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold">
                    <Eye size={12} /> View Full Details
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
