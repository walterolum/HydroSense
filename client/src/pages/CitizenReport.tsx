import { useState } from 'react';
import { submitCitizenReport, createHealthIncident } from '../api/client';
import { AlertCircle, CheckCircle, Loader2, Upload, Camera, Mic, MessageSquare, Mail as MailIcon, Phone, Send, Image as ImageIcon } from 'lucide-react';
import CameraCapture from '../components/common/CameraCapture';

const incidentTypes = [
  { value: 'water_pollution', label: 'Water Pollution', icon: '💧', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'illegal_dumping', label: 'Illegal Dumping', icon: '🗑️', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'sewage_leak', label: 'Sewage Leak', icon: '⚠️', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'flooding', label: 'Flooding', icon: '🌊', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'environmental_hazard', label: 'Environmental Hazard', icon: '☣️', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'infrastructure_damage', label: 'Infrastructure Damage', icon: '🏗️', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'water_contamination', label: 'Water Contamination', icon: '🧪', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'disease_report', label: 'Disease / Illness Report', icon: '🏥', color: 'bg-pink-100 text-pink-700 border-pink-200' },
];

const DISEASE_TYPES = ['cholera','typhoid','diarrhea','dysentery','hepatitis_a','schistosomiasis','other'];

const districts = ['Kampala', 'Gulu', 'Lira', 'Moroto', 'Jinja', 'Soroti', 'Arua', 'Mbarara', 'Mbale', 'Tororo', 'Masaka', 'Fort Portal', 'Kabale', 'Busia', 'Adjumani'];

export default function CitizenReport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [channel, setChannel] = useState('app');
  const [anonymous, setAnonymous] = useState(false);
  const [mediaFiles, setMediaFiles]   = useState<{ type: string; data: string; mime: string }[]>([]);
  const [showCamera, setShowCamera]   = useState(false);
  const [disease, setDisease] = useState({ disease_type: 'cholera', cases: '', deaths: '', hospitalizations: '', water_source_linked: false });

  const [form, setForm] = useState({
    incident_type: '', description: '', district: '', sub_county: '', village: '',
    lat: '', lng: '', severity: 'medium', water_impact: '', affected_population: 0,
    reporter_name: '', reporter_phone: '', reporter_email: '',
  });

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleMediaCapture = (type: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'audio' ? 'audio/*' : type === 'video' ? 'video/*' : 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const data = ev.target?.result as string;
          setMediaFiles(prev => [...prev, { type, data, mime: file.type }]);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const removeMedia = (idx: number) => setMediaFiles(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!form.incident_type || !form.description || !form.district) {
      setError('Incident type, description, and district are required');
      setLoading(false);
      return;
    }
    if (form.incident_type === 'disease_report' && (!disease.cases || parseInt(disease.cases) < 1)) {
      setError('Number of cases is required for disease reports (minimum 1)');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...form,
        channel,
        is_anonymous: anonymous,
        lat: form.lat ? parseFloat(form.lat) : undefined,
        lng: form.lng ? parseFloat(form.lng) : undefined,
        affected_population: form.affected_population || 0,
        media: mediaFiles.map(m => ({ media_type: m.type, file_data: m.data, mime_type: m.mime })),
      };

      if (anonymous) {
        delete payload.reporter_name;
        delete payload.reporter_phone;
        delete payload.reporter_email;
      }

      const res = await submitCitizenReport(payload);

      if (form.incident_type === 'disease_report') {
        await createHealthIncident({
          district: form.district,
          sub_county: form.sub_county || undefined,
          village: form.village || undefined,
          disease_type: disease.disease_type,
          cases: parseInt(disease.cases) || 1,
          deaths: parseInt(disease.deaths) || 0,
          hospitalizations: parseInt(disease.hospitalizations) || 0,
          water_source_linked: disease.water_source_linked ? 1 : 0,
          lat: form.lat ? parseFloat(form.lat) : undefined,
          lng: form.lng ? parseFloat(form.lng) : undefined,
          investigation_notes: form.description,
        });
      }

      setSuccess(`Report submitted successfully! Reference ID: ${res.data.id}. Track your report status.`);
      setForm({ incident_type: '', description: '', district: '', sub_county: '', village: '', lat: '', lng: '', severity: 'medium', water_impact: '', affected_population: 0, reporter_name: '', reporter_phone: '', reporter_email: '' });
      setMediaFiles([]);
      setDisease({ disease_type: 'cholera', cases: '', deaths: '', hospitalizations: '', water_source_linked: false });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  const channels = [
    { id: 'app', icon: <Send size={14} />, label: 'App' },
    { id: 'sms', icon: <MessageSquare size={14} />, label: 'SMS' },
    { id: 'whatsapp', icon: '💬', label: 'WhatsApp' },
    { id: 'email', icon: <MailIcon size={14} />, label: 'Email' },
    { id: 'phone', icon: <Phone size={14} />, label: 'Phone' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Report an Environmental Incident</h1>
        <p className="text-gray-500 text-sm mt-1">Submit your report through any channel. All reports are analyzed by AI for priority response.</p>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-sm text-green-700">
          <CheckCircle size={16} className="flex-shrink-0 text-green-500" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">1. Incident Type</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {incidentTypes.map(it => (
              <button key={it.value} type="button" onClick={() => setForm(prev => ({ ...prev, incident_type: it.value }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${form.incident_type === it.value ? `${it.color} border-current shadow-md` : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}>
                <span className="text-xl block mb-1">{it.icon}</span>
                <span className="text-xs font-semibold">{it.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">2. Description & Location</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description *</label>
              <textarea value={form.description} onChange={update('description')} rows={4}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                placeholder="Describe what you observed: what happened, when, where, and any other important details..." required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">District *</label>
                <select value={form.district} onChange={update('district')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" required>
                  <option value="">Select district</option>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Sub-County</label>
                <input type="text" value={form.sub_county} onChange={update('sub_county')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Sub-county" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Village/Area</label>
                <input type="text" value={form.village} onChange={update('village')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Village or area name" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Latitude</label>
                <input type="number" step="any" value={form.lat} onChange={update('lat')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="0.0000" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Longitude</label>
                <input type="number" step="any" value={form.lng} onChange={update('lng')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="0.0000" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Severity</label>
                <select value={form.severity} onChange={update('severity')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Water Impact</label>
                <select value={form.water_impact} onChange={update('water_impact')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                  <option value="">Select impact level</option>
                  <option value="none">No Impact</option>
                  <option value="minor">Minor Impact</option>
                  <option value="moderate">Moderate Impact</option>
                  <option value="severe">Severe Impact</option>
                  <option value="critical">Critical Impact</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Affected Population</label>
                <input type="number" value={form.affected_population} onChange={update('affected_population')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="0" min={0} />
              </div>
            </div>
          </div>
        </div>

        {form.incident_type === 'disease_report' && (
          <div className="rounded-2xl overflow-hidden shadow-md border-2 border-rose-400">
            {/* Coloured header */}
            <div className="px-6 py-3 flex items-center gap-3"
              style={{ background: 'linear-gradient(135deg,#be123c,#e11d48)' }}>
              <span className="text-xl">🏥</span>
              <div className="flex-1">
                <div className="text-white font-bold text-sm tracking-wide">DISEASE / ILLNESS DETAILS</div>
                <div className="text-rose-200 text-xs">Shared directly with health authorities — triggers outbreak alerts if ≥ 10 cases</div>
              </div>
            </div>
            {/* Body */}
            <div className="bg-rose-50 dark:bg-rose-950 p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-rose-100 mb-1.5">Disease Type *</label>
                  <select value={disease.disease_type} onChange={e => setDisease(p => ({ ...p, disease_type: e.target.value }))}
                    className="w-full px-4 py-3 border border-rose-200 dark:border-rose-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500 capitalize">
                    {DISEASE_TYPES.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-rose-100 mb-1.5">Number of Cases *</label>
                  <input type="number" min="1" value={disease.cases} onChange={e => setDisease(p => ({ ...p, cases: e.target.value }))}
                    className="w-full px-4 py-3 border border-rose-200 dark:border-rose-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="How many people affected?" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-rose-100 mb-1.5">Deaths</label>
                  <input type="number" min="0" value={disease.deaths} onChange={e => setDisease(p => ({ ...p, deaths: e.target.value }))}
                    className="w-full px-4 py-3 border border-rose-200 dark:border-rose-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-rose-100 mb-1.5">Hospitalizations</label>
                  <input type="number" min="0" value={disease.hospitalizations} onChange={e => setDisease(p => ({ ...p, hospitalizations: e.target.value }))}
                    className="w-full px-4 py-3 border border-rose-200 dark:border-rose-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="0" />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-700 rounded-xl cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors">
                    <input type="checkbox" checked={disease.water_source_linked} onChange={e => setDisease(p => ({ ...p, water_source_linked: e.target.checked }))}
                      className="w-4 h-4 accent-rose-600 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-rose-100 font-medium">Illness is linked to a water source (contaminated water, borehole, river, etc.)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">3. Media & Channel</h2>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Submission Channel</label>
            <div className="flex flex-wrap gap-2">
              {channels.map(ch => (
                <button key={ch.id} type="button" onClick={() => setChannel(ch.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${channel === ch.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'}`}>
                  {typeof ch.icon === 'string' ? <span>{ch.icon}</span> : ch.icon}
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Attach Media Evidence</label>
            <div className="flex flex-wrap gap-3 mb-3">

              {/* Photo: camera modal OR gallery file picker */}
              <div className="flex rounded-xl border-2 border-dashed border-gray-300 overflow-hidden bg-gray-50">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  title="Open device camera"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all border-r border-dashed border-gray-300"
                >
                  <Camera size={16} /> Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => handleMediaCapture('image')}
                  title="Choose from gallery"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all"
                >
                  <ImageIcon size={16} /> From Gallery
                </button>
              </div>

              <button type="button" onClick={() => handleMediaCapture('video')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-all bg-gray-50">
                <Upload size={16} /> Upload Video
              </button>
              <button type="button" onClick={() => handleMediaCapture('audio')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-all bg-gray-50">
                <Mic size={16} /> Record Audio
              </button>
            </div>

            {mediaFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mediaFiles.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                    {m.type === 'image' ? '📷' : m.type === 'video' ? '🎥' : '🎤'} {m.mime?.split('/')[1] || m.type}
                    <button type="button" onClick={() => removeMedia(i)} className="text-red-500 hover:text-red-700 font-bold ml-1">&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">4. Reporter Information</h2>

          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700 font-medium">Submit anonymously</span>
            </label>
          </div>

          {!anonymous && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your Name</label>
                <input type="text" value={form.reporter_name} onChange={update('reporter_name')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Your name" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone</label>
                <input type="tel" value={form.reporter_phone} onChange={update('reporter_phone')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="+256..." />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
                <input type="email" value={form.reporter_email} onChange={update('reporter_email')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="your@email.com" />
              </div>
            </div>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-4 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? <><Loader2 size={16} className="animate-spin" /> Submitting Report...</> : <><Send size={16} /> Submit Report</>}
        </button>
      </form>

      {showCamera && (
        <CameraCapture
          onCapture={(dataUrl, file) => {
            setMediaFiles(prev => [...prev, { type: 'image', data: dataUrl, mime: file.type }]);
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
