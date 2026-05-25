import { useEffect, useState } from 'react';
import { TestTube, AlertTriangle, CheckCircle, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getQualityTests, getQualityStats, submitQualityTest, getWaterPoints } from '../../api/client';
import StatCard from '../../components/common/StatCard';

import { useTranslations } from '../../hooks/useTranslations';

const BLANK_FORM = { water_point_id: '', turbidity_ntu: '', ph: '', tds_ppm: '', e_coli_cfu: '', nitrates_ppm: '', fluoride_ppm: '', chlorine_residual: '', temperature_c: '', notes: '' };

export default function WaterQuality() {
  const s = useTranslations({
    totalTests: 'Total Tests',
    safetyRate: 'Safety Rate',
    unsafeSources: 'Unsafe Sources',
    avgSafetyScore: 'Avg Safety Score',
    contaminated: 'Contaminated Water Sources — Urgent Action Required',
    qualityByDistrict: 'Water Quality by District',
    recentTests: 'Recent Water Quality Tests',
    logTest: 'Log Test',
    waterPoint: 'Water Point',
    tester: 'Tester',
    safe: 'Safe',
    score: 'Score',
    logTestTitle: 'Log Water Quality Test',
    whoStandards: 'WHO Drinking Water Standards Reference',
  });
  const [tests, setTests]         = useState<any[]>([]);
  const [stats, setStats]         = useState<any>(null);
  const [waterPoints, setWaterPoints] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [msg, setMsg]             = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      getQualityTests({ limit: 50 }),
      getQualityStats(),
      getWaterPoints({ limit: 100 }),
    ]).then(([tr, sr, wr]) => {
      setTests(tr.data.data);
      setStats(sr.data.data);
      setWaterPoints(wr.data.data || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openModal  = () => { setShowModal(true);  setModalError(''); setForm(BLANK_FORM); };
  const closeModal = () => { setShowModal(false); setModalError(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.water_point_id) { setModalError('Please select a water point.'); return; }
    setSubmitting(true);
    setModalError('');
    try {
      const r = await submitQualityTest({
        ...form,
        water_point_id:    parseInt(form.water_point_id),
        turbidity_ntu:     parseFloat(form.turbidity_ntu)     || 0,
        ph:                parseFloat(form.ph)                 || 7,
        tds_ppm:           parseFloat(form.tds_ppm)           || 0,
        e_coli_cfu:        parseFloat(form.e_coli_cfu)        || 0,
        nitrates_ppm:      parseFloat(form.nitrates_ppm)      || 0,
        fluoride_ppm:      parseFloat(form.fluoride_ppm)      || 0,
        chlorine_residual: parseFloat(form.chlorine_residual) || 0,
        temperature_c:     parseFloat(form.temperature_c)     || 0,
      });
      setMsg(r.data.safe
        ? '✅ Water quality test submitted — result: SAFE'
        : '⚠️ Water test submitted — CONTAMINATION DETECTED. Alert raised automatically!');
      closeModal();
      load();
      setTimeout(() => setMsg(''), 6000);
    } catch (err: any) {
      setModalError(err?.response?.data?.error || 'Submission failed. Please check server connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm border ${msg.includes('CONTAMINATION') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {msg}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} title={s.totalTests}      value={stats?.total_tests || 0}                          icon={TestTube}     color="blue"  />
        <StatCard loading={loading} title={s.safetyRate}      value={`${stats?.safety_rate_pct || 0}%`} subtitle={`${stats?.safe_tests || 0} safe tests`} icon={CheckCircle}  color="green" />
        <StatCard loading={loading} title={s.unsafeSources}   value={stats?.unsafe_tests || 0}          subtitle="Failed WHO standards" icon={AlertTriangle} color="red"   />
        <StatCard loading={loading} title={s.avgSafetyScore} value={`${stats?.avg_safety_score || 0}/100`}            icon={TestTube}     color="cyan"  />
      </div>

      {/* Contaminated Sources */}
      {stats?.contaminated_sources?.length > 0 && (
        <div className="card border-2 border-red-200 dark:border-red-800 dark:bg-red-950/10">
          <div className="card-header">
            <h3 className="section-title text-red-700 dark:text-red-400"><AlertTriangle size={18} /> {s.contaminated}</h3>
          </div>
          <div className="table-container">
            <table className="table">
              <thead><tr>
                <th className="th">{s.waterPoint}</th><th className="th">District</th>
                <th className="th">E.Coli</th><th className="th">Turbidity</th>
                <th className="th">pH</th><th className="th">{s.score}</th><th className="th">Last Tested</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-red-900/40">
                {stats.contaminated_sources.slice(0, 10).map((t: any) => (
                  <tr key={`${t.id}-${t.tested_at}`} className="tr bg-red-50 dark:bg-red-950/30">
                    <td className="td font-semibold text-red-800 dark:text-red-300">{t.name}</td>
                    <td className="td text-gray-700 dark:text-gray-300">{t.district}</td>
                    <td className="td"><span className={`font-bold ${t.e_coli_cfu > 50 ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>{t.e_coli_cfu?.toFixed(1)} CFU</span></td>
                    <td className="td text-gray-700 dark:text-gray-300">{t.turbidity_ntu?.toFixed(1)} NTU</td>
                    <td className="td text-gray-700 dark:text-gray-300">{t.ph?.toFixed(1)}</td>
                    <td className="td"><span className="font-bold text-red-700 dark:text-red-400">{t.water_safety_score}</span></td>
                    <td className="td text-xs text-gray-600 dark:text-gray-400">{new Date(t.tested_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* District Quality Chart */}
      {stats?.by_district && (
        <div className="card">
          <div className="card-header">
            <h3 className="section-title"><TestTube size={18} className="text-cyan-600" /> {s.qualityByDistrict}</h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.by_district} margin={{ top: 5, right: 10, left: -20, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={55} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="avg_score" name="Avg Safety Score" radius={[4, 4, 0, 0]}>
                {stats.by_district.map((d: any, i: number) => (
                  <Cell key={i} fill={d.avg_score >= 80 ? '#16a34a' : d.avg_score >= 60 ? '#d97706' : '#dc2626'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 text-xs mt-1 flex-wrap text-gray-600 dark:text-gray-300">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-600" /> ≥80 Excellent</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-500" /> 60–79 Acceptable</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-600" /> &lt;60 Poor</span>
          </div>
        </div>
      )}

      {/* Test Results Table */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h3 className="section-title">{s.recentTests}</h3>
          <button onClick={openModal} className="btn-primary text-xs"><Plus size={14} /> {s.logTest}</button>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th className="th">{s.waterPoint}</th><th className="th">District</th>
              <th className="th">pH</th><th className="th">Turbidity</th><th className="th">TDS</th>
              <th className="th">E.coli</th><th className="th">{s.safe}</th>
              <th className="th">{s.score}</th><th className="th">{s.tester}</th><th className="th">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {tests.map(t => (
                <tr key={t.id} className={`tr ${!t.overall_safe ? 'bg-red-50 dark:bg-red-950/30' : ''}`}>
                  <td className="td font-medium text-sm text-gray-800 dark:text-gray-100">{t.water_point_name}</td>
                  <td className="td text-xs text-gray-600 dark:text-gray-300">{t.district}</td>
                  <td className="td text-gray-700 dark:text-gray-200">{t.ph?.toFixed(1)}</td>
                  <td className="td text-gray-700 dark:text-gray-200">{t.turbidity_ntu?.toFixed(1)}</td>
                  <td className="td text-gray-700 dark:text-gray-200">{t.tds_ppm?.toFixed(0)}</td>
                  <td className="td"><span className={t.e_coli_cfu > 10 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-700 dark:text-gray-200'}>{t.e_coli_cfu?.toFixed(1)}</span></td>
                  <td className="td"><span className={`badge ${t.overall_safe ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'}`}>{t.overall_safe ? '✓ Safe' : '✗ Unsafe'}</span></td>
                  <td className="td"><span className={`font-bold ${t.water_safety_score >= 80 ? 'text-green-600 dark:text-green-400' : t.water_safety_score >= 60 ? 'text-orange-500 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>{t.water_safety_score}</span></td>
                  <td className="td text-xs text-gray-600 dark:text-gray-300">{t.tester_name || '—'}</td>
                  <td className="td text-xs text-gray-600 dark:text-gray-300">{new Date(t.tested_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {tests.length === 0 && !loading && (
                <tr><td colSpan={10} className="td text-center text-gray-400 dark:text-gray-500 py-8">No tests recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* WHO Standards */}
      <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <h3 className="section-title text-blue-800 dark:text-blue-300 mb-3">{s.whoStandards}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[['pH','6.5 – 8.5'],['Turbidity','< 5 NTU'],['E. coli','0 CFU/100ml'],['TDS','< 1000 mg/L'],['Nitrates','< 50 mg/L'],['Fluoride','< 1.5 mg/L'],['Chlorine','0.2 – 0.5 mg/L'],['Temperature','< 25°C']].map(([param, limit]) => (
            <div key={param} className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-blue-100 dark:border-blue-700">
              <div className="font-semibold text-blue-800 dark:text-blue-300">{param}</div>
              <div className="text-blue-600 dark:text-blue-400">{limit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Log Test Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-900 z-10">
              <h3 className="font-bold text-gray-800 dark:text-gray-100">{s.logTestTitle}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <span className="font-bold flex-shrink-0">✕</span> {modalError}
                </div>
              )}

              {/* Water Point Dropdown */}
              <div>
                <label className="label">Water Point *</label>
                <select
                  className="input"
                  required
                  value={form.water_point_id}
                  onChange={e => setForm({ ...form, water_point_id: e.target.value })}
                >
                  <option value="">— Select a water point —</option>
                  {waterPoints.map((wp: any) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.name} · {wp.district}
                    </option>
                  ))}
                </select>
              </div>

              {/* Measurement fields */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['pH',             'ph',                '6.5 – 8.5'],
                  ['Turbidity (NTU)', 'turbidity_ntu',    '< 5'],
                  ['TDS (mg/L)',      'tds_ppm',          '< 1000'],
                  ['E.coli (CFU)',    'e_coli_cfu',       '0'],
                  ['Nitrates (mg/L)', 'nitrates_ppm',     '< 50'],
                  ['Fluoride (mg/L)', 'fluoride_ppm',     '< 1.5'],
                  ['Chlorine (mg/L)', 'chlorine_residual','0.2 – 0.5'],
                  ['Temp (°C)',       'temperature_c',    '< 25'],
                ] as [string, string, string][]).map(([label, key, hint]) => (
                  <div key={key}>
                    <label className="label">
                      {label} <span className="text-gray-400 font-normal">({hint})</span>
                    </label>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={(form as any)[key]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} placeholder="Optional observations..."
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center gap-2">
                  {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {submitting ? 'Submitting...' : 'Submit Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
