import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/common/LanguageSwitcher';
import { CitizenReport } from '../types';
import { getMyReports } from '../api/client';
import { AlertCircle, CheckCircle, Clock, MapPin, ChevronRight, Loader2, RefreshCw, MessageSquare } from 'lucide-react';

const STATUS_FLOW = ['pending', 'under_investigation', 'assigned', 'resolved', 'escalated'];

const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  under_investigation: AlertCircle,
  assigned: MapPin,
  resolved: CheckCircle,
  escalated: AlertCircle,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  under_investigation: 'bg-blue-100 text-blue-700 border-blue-200',
  assigned: 'bg-purple-100 text-purple-700 border-purple-200',
  resolved: 'bg-green-100 text-green-700 border-green-200',
  escalated: 'bg-red-100 text-red-700 border-red-200',
};

export default function ReportStatus() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CitizenReport | null>(null);
  const [translations, setTranslations] = useState<Record<number, string>>({});

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await getMyReports();
      setReports(res.data.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, []);

  // Translate statuses
  useEffect(() => {
    if (language === 'en') return;
    reports.forEach(async r => {
      if (translations[r.id]) return;
      const resp = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hs_token') || sessionStorage.getItem('hs_token')}` },
        body: JSON.stringify({ text: r.description?.slice(0, 300) || '', target_language: language, source_language: 'en' }),
      });
      const data = await resp.json();
      if (data.translated_text) setTranslations(p => ({ ...p, [r.id]: data.translated_text }));
    });
  }, [reports, language]);

  const getStatusStep = (status: string) => STATUS_FLOW.indexOf(status);
  const currentStatusStep = (status: string) => getStatusStep(status) >= 0 ? getStatusStep(status) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-cyan-700 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">{t('report.track')}</h1>
            <p className="text-blue-200 text-xs mt-0.5">{reports.length} report{reports.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchReports} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
              <RefreshCw size={14} />
            </button>
            <LanguageSwitcher compact />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20">
            <MessageSquare size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No reports yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(report => (
              <div key={report.id} onClick={() => setSelected(selected?.id === report.id ? null : report)}
                className={`bg-white rounded-xl border transition-all cursor-pointer
                  ${selected?.id === report.id ? 'border-blue-300 shadow-md' : 'border-gray-100 shadow-sm hover:shadow'}`}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${STATUS_COLORS[report.status] || 'bg-gray-100 text-gray-600'}`}>
                          {t(`status.${report.status}`) || report.status}
                        </span>
                        <span className="text-[10px] text-gray-400">{new Date(report.created_at).toLocaleDateString()}</span>
                      </div>
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {t(`incident.${report.incident_type}`) || report.incident_type}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {language !== 'en' && translations[report.id]
                          ? translations[report.id]
                          : report.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                        <span>{report.district}</span>
                        {report.sub_county && <span>{report.sub_county}</span>}
                        {report.village && <span>{report.village}</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} className={`text-gray-300 mt-2 transition-transform ${selected?.id === report.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {selected?.id === report.id && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                    <div className="flex items-center gap-1 mb-3">
                      {STATUS_FLOW.map((s, i) => {
                        const Icon = STATUS_ICONS[s] || Clock;
                        const active = i <= currentStatusStep(report.status);
                        const isCurrent = s === report.status;
                        return (
                          <div key={s} className="flex-1 flex flex-col items-center">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center
                              ${isCurrent ? 'bg-blue-600 text-white' : active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-300'}`}>
                              <Icon size={12} />
                            </div>
                            <span className={`text-[8px] mt-1 text-center leading-tight ${active ? 'text-blue-600 font-medium' : 'text-gray-300'}`}>
                              {t(`status.${s}`)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {report.latest_note && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                        {report.latest_note}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
