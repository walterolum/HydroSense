import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { LanguageCode } from '../types/language';
import VoiceRecorder, { VoiceResult } from '../components/reporting/VoiceRecorder';
import CameraCapture from '../components/common/CameraCapture';

const LANG_NAMES: Record<string, string> = {
  en: 'English', lug: 'Luganda', swa: 'Swahili', luo: 'Luo',
  nyn: 'Runyankore', teo: 'Teso', lgg: 'Lugbara', xog: 'Lusoga',
  cgg: 'Rukiga', ach: 'Acholi',
};
import LanguageSwitcher from '../components/common/LanguageSwitcher';
import { submitCitizenReport, createHealthIncident } from '../api/client';
import { ALL_DISTRICTS } from '../constants/districts';
import {
  AlertCircle, CheckCircle, Camera, Send,
  Shield, Loader2, MessageSquare, Phone, Image
} from 'lucide-react';

const INCIDENT_TYPES = [
  'water_contamination', 'broken_water_point', 'flooding',
  'sewage_leak', 'illegal_dumping', 'pollution',
  'environmental_hazard', 'infrastructure_damage', 'disease_report',
];

const DISEASE_TYPES = ['cholera','typhoid','diarrhea','dysentery','hepatitis_a','schistosomiasis','other'];

const DISTRICTS = ALL_DISTRICTS;

export default function MultilingualReport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, translateToEnglish, language } = useLanguage();

  const [step] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    incident_type: '', description: '', district: '', sub_county: '',
    village: '', lat: '', lng: '', severity: 'medium',
    is_anonymous: false, reporter_name: '', reporter_phone: '', reporter_email: '',
  });

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [, setAudioDuration] = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState<LanguageCode>(language);
  const [showCamera, setShowCamera] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null); // gallery / file picker
  const [disease, setDisease] = useState({ disease_type: 'cholera', other_name: '', cases: '', deaths: '', hospitalizations: '', water_source_linked: false });

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleVoiceResult = (result: VoiceResult) => {
    if (result.blob) { setAudioBlob(result.blob); setAudioDuration(result.durationMs); }
    setVoiceActive(false);
    setVoiceRecording(false);
    setForm(prev => ({
      ...prev,
      description: result.english || result.original || prev.description,
      ...(result.incidentType && !prev.incident_type ? { incident_type: result.incidentType } : {}),
      ...(result.severity ? { severity: result.severity } : {}),
    }));
  };

  const handleVoiceLiveUpdate = (text: string) => {
    setVoiceActive(true);
    setVoiceRecording(true);
    setForm(prev => ({ ...prev, description: text }));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.incident_type === 'disease_report' && (!disease.cases || parseInt(disease.cases) < 1)) {
      setError('Number of cases is required for disease reports (minimum 1)');
      return;
    }
    setLoading(true);

    try {
      let description = form.description;
      // Translate to English if not already English
      if (language !== 'en' && description) {
        description = await translateToEnglish(description, language);
      }

      const payload = {
        incident_type: form.incident_type,
        description,
        district: form.district,
        sub_county: form.sub_county || undefined,
        village: form.village || undefined,
        lat: form.lat ? parseFloat(form.lat) : undefined,
        lng: form.lng ? parseFloat(form.lng) : undefined,
        severity: form.severity,
        is_anonymous: form.is_anonymous,
        reporter_name: form.is_anonymous ? undefined : (form.reporter_name || user?.name),
        reporter_phone: form.is_anonymous ? undefined : (form.reporter_phone || user?.phone),
        reporter_email: form.is_anonymous ? undefined : (form.reporter_email || user?.email),
        channel: audioBlob ? 'voice' : 'app',
        source_language: language,
        original_text: language !== 'en' ? form.description : undefined,
      };

      const res = await submitCitizenReport(payload);
      const reportId = res.data.id;

      if (form.incident_type === 'disease_report' && disease.cases) {
        await createHealthIncident({
          district: form.district,
          sub_county: form.sub_county || undefined,
          village: form.village || undefined,
          disease_type: disease.disease_type === 'other' && disease.other_name.trim() ? disease.other_name.trim().toLowerCase() : disease.disease_type,
          cases: parseInt(disease.cases) || 1,
          deaths: parseInt(disease.deaths) || 0,
          hospitalizations: parseInt(disease.hospitalizations) || 0,
          water_source_linked: disease.water_source_linked ? 1 : 0,
          lat: form.lat ? parseFloat(form.lat) : undefined,
          lng: form.lng ? parseFloat(form.lng) : undefined,
          investigation_notes: description,
        });
      }

      // Upload audio if present
      if (audioBlob && reportId) {
        const audioData = new FormData();
        audioData.append('report_id', String(reportId));
        audioData.append('audio', audioBlob, 'recording.webm');
        await fetch('/api/citizen-reports/upload-media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionStorage.getItem('hs_token')}` },
          body: audioData,
        });
      }

      // Upload image if present
      if (imageFile && reportId) {
        const imgData = new FormData();
        imgData.append('report_id', String(reportId));
        imgData.append('image', imageFile);
        await fetch('/api/citizen-reports/upload-media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionStorage.getItem('hs_token')}` },
          body: imgData,
        });
      }

      setSuccess(t('alert.success.report'));
      setTimeout(() => navigate('/report-status'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || t('alert.error.report'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-cyan-700 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">{t('report.title')}</h1>
            <p className="text-blue-200 text-xs mt-0.5">{t('report.description')}</p>
          </div>
          <LanguageSwitcher compact />
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3 text-sm text-green-700 dark:text-green-300">
            <CheckCircle size={16} /> <span>{success}</span>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map(s => (
            <div key={s} className={`flex items-center gap-2 ${s < step ? 'text-green-600' : s === step ? 'text-blue-600' : 'text-gray-300'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${s < step ? 'bg-green-100 dark:bg-green-900 border-green-400' : s === step ? 'bg-blue-100 dark:bg-blue-900 border-blue-400' : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`}>
                {s < step ? '✓' : s}
              </div>
              <span className="text-sm font-medium hidden sm:inline">{s === 1 ? t('report.title') : t('report.track')}</span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Source Language */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Report Language</label>
              <select value={sourceLang} onChange={e => setSourceLang(e.target.value as LanguageCode)}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {[{ code: language, nativeName: `Current (${language.toUpperCase()})` }, ...useLanguage().supportedLanguages.filter(l => l.code !== language)].map(l => (
                  <option key={l.code} value={l.code}>{l.nativeName}</option>
                ))}
              </select>
            </div>

            {/* Incident Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{t('report.type')}</label>
              <select value={form.incident_type} onChange={update('incident_type')} required
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select type...</option>
                {INCIDENT_TYPES.map(type => (
                  <option key={type} value={type}>{t(`incident.${type}`)}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">{t('report.description')}</label>
                {voiceRecording && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    {sourceLang !== 'en'
                      ? `Translating ${LANG_NAMES[sourceLang] || sourceLang} → English…`
                      : 'Recording…'}
                  </span>
                )}
              </div>

              {/* Textarea wrapper — shows a recording overlay when no English text yet */}
              <div className="relative">
                <textarea
                  value={form.description}
                  onChange={e => { setVoiceActive(false); setVoiceRecording(false); update('description')(e); }}
                  rows={5}
                  required
                  readOnly={voiceRecording}
                  className={`w-full px-4 py-3 border-2 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-all duration-300 ${
                    voiceRecording && !form.description
                      ? 'border-red-400 ring-2 ring-red-100 dark:ring-red-900'
                      : voiceActive
                      ? 'border-green-400 ring-2 ring-green-100 dark:ring-green-900'
                      : 'border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  placeholder={
                    sourceLang !== 'en'
                      ? `Speak in ${LANG_NAMES[sourceLang] || sourceLang} — English translation will appear here automatically…`
                      : 'Describe the issue or use the microphone below…'
                  }
                />
                {/* Overlay when recording non-English and no translation arrived yet */}
                {voiceRecording && sourceLang !== 'en' && !form.description && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-red-50/80 border-2 border-red-300 gap-2 pointer-events-none">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-bold text-red-700">
                        Listening in {LANG_NAMES[sourceLang] || sourceLang}…
                      </span>
                    </div>
                    <p className="text-xs text-red-500 text-center px-4">
                      Speak now — your words will be translated to English automatically
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-2">
                <VoiceRecorder
                  onRecordingComplete={handleVoiceResult}
                  onLiveUpdate={handleVoiceLiveUpdate}
                  language={sourceLang}
                />
              </div>
            </div>

            {/* Disease details — shown only when disease_report is selected */}
            {form.incident_type === 'disease_report' && (
              <div className="rounded-2xl overflow-hidden border-2 border-rose-400 shadow-md">
                {/* Coloured header */}
                <div className="px-4 py-3 flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#be123c,#e11d48)' }}>
                  <span className="text-lg">🏥</span>
                  <div>
                    <div className="text-white font-bold text-sm">DISEASE / ILLNESS DETAILS</div>
                    <div className="text-rose-200 text-xs">Triggers health authority alert if ≥ 10 cases</div>
                  </div>
                </div>
                {/* Body */}
                <div className="bg-rose-50 dark:bg-rose-950 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-800 dark:text-rose-100 mb-1">Disease Type *</label>
                      <select value={disease.disease_type} onChange={e => setDisease(p => ({ ...p, disease_type: e.target.value, other_name: '' }))}
                        className="w-full px-3 py-2.5 border border-rose-200 dark:border-rose-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500 capitalize">
                        {DISEASE_TYPES.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-800 dark:text-rose-100 mb-1">Cases *</label>
                      <input type="number" min="1" value={disease.cases} onChange={e => setDisease(p => ({ ...p, cases: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-rose-200 dark:border-rose-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="People affected" />
                    </div>
                    {disease.disease_type === 'other' && (
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-gray-800 dark:text-rose-100 mb-1">Specify Disease Name *</label>
                        <input
                          type="text"
                          autoFocus
                          value={disease.other_name}
                          onChange={e => setDisease(p => ({ ...p, other_name: e.target.value }))}
                          placeholder="Enter the name of the disease or illness…"
                          className="w-full px-3 py-2.5 border-2 border-rose-400 dark:border-rose-500 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-gray-800 dark:text-rose-100 mb-1">Deaths</label>
                      <input type="number" min="0" value={disease.deaths} onChange={e => setDisease(p => ({ ...p, deaths: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-rose-200 dark:border-rose-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-800 dark:text-rose-100 mb-1">Hospitalizations</label>
                      <input type="number" min="0" value={disease.hospitalizations} onChange={e => setDisease(p => ({ ...p, hospitalizations: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-rose-200 dark:border-rose-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="0" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-700 rounded-xl cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors">
                        <input type="checkbox" checked={disease.water_source_linked} onChange={e => setDisease(p => ({ ...p, water_source_linked: e.target.checked }))}
                          className="w-4 h-4 accent-rose-600 flex-shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-rose-100 font-medium">Illness linked to a water source (borehole, river, well, etc.)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Photo upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{t('report.photo')}</label>

              {/* Gallery-only file input (no capture attr) */}
              <input ref={galleryRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />

              {imagePreview ? (
                /* already has a photo — show two replace options */
                <div className="flex rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 overflow-hidden bg-blue-50 dark:bg-blue-950 w-full">
                  <button type="button" onClick={() => setShowCamera(true)}
                    title="Retake with camera"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors border-r border-dashed border-blue-300 dark:border-blue-700">
                    <Camera size={16} /> Retake
                  </button>
                  <button type="button" onClick={() => galleryRef.current?.click()}
                    title="Choose different photo from gallery"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors">
                    <Image size={16} /> Change
                  </button>
                </div>
              ) : (
                /* no photo yet — camera + gallery side by side */
                <div className="flex rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-800 w-full">
                  <button type="button" onClick={() => setShowCamera(true)}
                    title="Open device camera"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-400 transition-colors border-r border-dashed border-gray-300 dark:border-gray-600">
                    <Camera size={16} /> Take Photo
                  </button>
                  <button type="button" onClick={() => galleryRef.current?.click()}
                    title="Choose from gallery"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    <Image size={16} /> From Gallery
                  </button>
                </div>
              )}
              {imagePreview && (
                <div className="mt-2 relative">
                  <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                  <button type="button" onClick={() => { setImagePreview(null); setImageFile(null); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center text-xs hover:bg-black/70">✕</button>
                </div>
              )}
            </div>

            {/* Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{t('report.district')}</label>
                <select value={form.district} onChange={update('district')} required
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select...</option>
                  {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{t('report.subcounty')}</label>
                <input type="text" value={form.sub_county} onChange={update('sub_county')}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{t('report.village')}</label>
                <input type="text" value={form.village} onChange={update('village')}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Latitude</label>
                  <input type="number" step="any" value={form.lat} onChange={update('lat')}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Longitude</label>
                  <input type="number" step="any" value={form.lng} onChange={update('lng')}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                </div>
              </div>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Severity</label>
              <div className="flex gap-2">
                {['low', 'medium', 'high', 'critical'].map(s => (
                  <button key={s} type="button" onClick={() => setForm(p => ({ ...p, severity: s }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all capitalize
                      ${form.severity === s
                        ? s === 'critical' ? 'bg-red-600 text-white border-red-600'
                          : s === 'high' ? 'bg-orange-500 text-white border-orange-500'
                          : s === 'medium' ? 'bg-yellow-500 text-white border-yellow-500'
                          : 'bg-green-500 text-white border-green-500'
                        : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Anonymous toggle */}
            <label className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <input type="checkbox" checked={form.is_anonymous} onChange={e => setForm(p => ({ ...p, is_anonymous: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('report.anonymous')}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">Your identity will not be shared</div>
              </div>
              <Shield size={16} className="text-gray-400 dark:text-gray-500" />
            </label>

            {/* Submit */}
            <button type="submit" disabled={loading || !form.incident_type || !form.description || !form.district}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <><Send size={16} /> {t('common.submit')}</>}
            </button>

            {/* Alternative channels */}
            <div className="text-center text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-800">
              <p className="mb-1">You can also report via:</p>
              <div className="flex items-center justify-center gap-4">
                <span className="flex items-center gap-1"><MessageSquare size={12} /> SMS: 8002</span>
                <span className="flex items-center gap-1"><Phone size={12} /> Toll-free: 0800 200 700</span>
              </div>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('alert.success.report')}</h2>
            <p className="text-gray-500 text-sm mb-6">Track your report status anytime</p>
            <button onClick={() => navigate('/report-status')}
              className="px-6 py-3 rounded-xl font-bold text-white text-sm bg-blue-600 hover:bg-blue-700 shadow-lg">
              {t('report.track')}
            </button>
          </div>
        )}
      </div>
    </div>

    {showCamera && (
      <CameraCapture
        onCapture={(dataUrl, file) => {
          setImagePreview(dataUrl);
          setImageFile(file);
          setShowCamera(false);
        }}
        onClose={() => setShowCamera(false)}
      />
    )}
    </>
  );
}
