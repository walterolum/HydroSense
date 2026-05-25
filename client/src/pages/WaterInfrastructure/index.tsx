import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Droplets, Plus, MapPin, Search, Users, Zap, Clock } from 'lucide-react';
import { getWaterPoints, getWaterPointStats, createWaterPoint } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { WaterPoint } from '../../types';
import StatusBadge from '../../components/common/StatusBadge';
import StatCard from '../../components/common/StatCard';
import WaterMap from '../../components/map/WaterMap';

import { ALL_DISTRICTS_WITH_ALL } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS_WITH_ALL;
const STATUSES = ['All', 'functional', 'non_functional', 'needs_repair', 'under_maintenance'];
const TYPES = ['All', 'borehole', 'spring', 'shallow_well', 'piped_scheme', 'rainwater_harvesting'];

// Roles permitted to create / add new water points
const CAN_ADD_ROLES = ['national_admin', 'district_officer', 'technician'];

const WI_STRINGS = [
  'Total Water Points','Avg Infrastructure Score','Total Beneficiaries','Non-functional',
  'Search water points...','Table','Map','Add Water Point',
  'Loading...','water points',
  'Name & Location','Type','Status','Beneficiaries','Infra Score','Pump / Solar','Last Maintained','Action',
  'No water points found matching filters.',
  'Water Points by District',
  'Add New Water Point','Cancel','Saving...','Solar Powered',
  'View',
];

function useWIStrings() {
  const { language, translate } = useLanguage();
  const cacheRef = useRef<Record<string, Record<string,string>>>({});
  const [ts, setTs] = useState<Record<string,string>>({});
  useEffect(() => {
    if (language === 'en') { setTs({}); return; }
    if (cacheRef.current[language]) { setTs(cacheRef.current[language]); return; }
    Promise.all(WI_STRINGS.map(s => translate(s).then(tr => [s,tr] as [string,string])))
      .then(pairs => { const m = Object.fromEntries(pairs); cacheRef.current[language]=m; setTs(m); });
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps
  return (s: string) => ts[s] || s;
}

export default function WaterInfrastructure() {
  const { user } = useAuth();
  const t = useWIStrings();
  const canAdd = CAN_ADD_ROLES.includes(user?.role || '');
  const [wps, setWps] = useState<WaterPoint[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [district, setDistrict] = useState('All');
  const [status, setStatus] = useState('All');
  const [type, setType] = useState('All');
  const [view, setView] = useState<'table' | 'map'>('table');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'borehole', status: 'functional', district: 'Gulu', lat: '2.774', lng: '32.299', beneficiaries: '', households: '', pump_type: '', solar_powered: false, depth_m: '', installed_date: '' });
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchData = () => {
    setLoading(true);
    const params: any = {};
    if (district !== 'All') params.district = district;
    if (status !== 'All') params.status = status;
    if (type !== 'All') params.type = type;
    Promise.all([getWaterPoints(params), getWaterPointStats(district !== 'All' ? { district } : {})]).then(([wpRes, stRes]) => {
      setWps(wpRes.data.data);
      setStats(stRes.data.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [district, status, type]);

  const filtered = wps.filter(wp => !search || wp.name.toLowerCase().includes(search.toLowerCase()) || wp.village?.toLowerCase().includes(search.toLowerCase()));

  const handleAddWP = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createWaterPoint({ ...form, lat: parseFloat(form.lat), lng: parseFloat(form.lng), solar_powered: form.solar_powered ? 1 : 0, beneficiaries: parseInt(form.beneficiaries) || 0, households: parseInt(form.households) || 0, depth_m: parseFloat(form.depth_m) || null });
      setSuccessMsg('Water point added successfully!');
      setShowModal(false);
      setForm({ name: '', type: 'borehole', status: 'functional', district: 'Gulu', lat: '2.774', lng: '32.299', beneficiaries: '', households: '', pump_type: '', solar_powered: false, depth_m: '', installed_date: '' });
      fetchData();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch { } finally { setSubmitting(false); }
  };

  const typeIcon: Record<string, string> = { borehole: '🕳', spring: '💦', shallow_well: '🪣', piped_scheme: '🚿', rainwater_harvesting: '🌧' };

  return (
    <div className="space-y-6">
      {successMsg && <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-lg text-sm">{successMsg}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title={t('Total Water Points')} value={stats.total} icon={Droplets} color="blue" />
          <StatCard title={t('Avg Infrastructure Score')} value={`${stats.avg_infrastructure_score}/100`} icon={Zap} color="cyan" />
          <StatCard title={t('Total Beneficiaries')} value={(stats.total_beneficiaries || 0).toLocaleString()} icon={Users} color="green" />
          <StatCard title={t('Non-functional')} value={stats.by_status?.find((s: any) => s.status === 'non_functional')?.count || 0} icon={Clock} color="red" />
        </div>
      )}

      {/* Filters & View Toggle */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder={t('Search water points...')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={district} onChange={e => setDistrict(e.target.value)}>
            {DISTRICTS.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="input w-auto" value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t.replace(/_/g, ' ')}</option>)}
          </select>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button onClick={() => setView('table')} className={`px-3 py-2 text-sm ${view === 'table' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{t('Table')}</button>
            <button onClick={() => setView('map')} className={`px-3 py-2 text-sm ${view === 'map' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{t('Map')}</button>
          </div>
          {canAdd && (
            <button onClick={() => setShowModal(true)} className="btn-primary ml-auto">
              <Plus size={16} /> {t('Add Water Point')}
            </button>
          )}
        </div>
      </div>

      {/* Map View */}
      {view === 'map' && (
        <div className="card p-0">
          <WaterMap waterPoints={filtered} height="550px" showHeatmap selectedDistrict={district} />
        </div>
      )}

      {/* Table View */}
      {view === 'table' && (
        <div className="card p-0">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm">
              {loading ? t('Loading...') : `${filtered.length} ${t('water points')}`}
            </span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">{t('Name & Location')}</th>
                  <th className="th">{t('Type')}</th>
                  <th className="th">{t('Status')}</th>
                  <th className="th">{t('Beneficiaries')}</th>
                  <th className="th">{t('Infra Score')}</th>
                  <th className="th">{t('Pump / Solar')}</th>
                  <th className="th">{t('Last Maintained')}</th>
                  <th className="th">{t('Action')}</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(wp => (
                  <tr key={wp.id} className="tr">
                    <td className="td">
                      <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{wp.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={10} /> {wp.village && `${wp.village}, `}{wp.sub_county}, {wp.district}
                      </div>
                    </td>
                    <td className="td text-gray-700 dark:text-gray-300">
                      <span>{typeIcon[wp.type] || '💧'} {wp.type?.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="td"><StatusBadge status={wp.status} type="water_point" /></td>
                    <td className="td text-gray-700 dark:text-gray-300">{(wp.beneficiaries || 0).toLocaleString()}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${wp.infrastructure_score}%`, background: wp.infrastructure_score >= 70 ? '#16a34a' : wp.infrastructure_score >= 50 ? '#d97706' : '#dc2626' }} />
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-300">{wp.infrastructure_score}</span>
                      </div>
                    </td>
                    <td className="td">
                      <div className="text-xs text-gray-700 dark:text-gray-300">
                        {wp.pump_type && <div>{wp.pump_type}</div>}
                        {wp.solar_powered === 1 && <span className="badge bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400">☀ Solar</span>}
                      </div>
                    </td>
                    <td className="td text-xs text-gray-500 dark:text-gray-400">
                      {wp.last_maintained ? new Date(wp.last_maintained).toLocaleDateString() : '—'}
                    </td>
                    <td className="td">
                      <Link to={`/water-infrastructure/${wp.id}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">{t('View')} →</Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={8} className="td text-center text-gray-400 dark:text-gray-500 py-8">{t('No water points found matching filters.')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* District Summary */}
      {stats?.by_district && view === 'table' && (
        <div className="card">
          <h3 className="section-title mb-4"><MapPin size={18} className="text-blue-600" /> {t('Water Points by District')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stats.by_district.slice(0, 15).map((d: any) => (
              <div key={d.district} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="font-semibold text-sm text-gray-700 dark:text-gray-100">{d.district}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{d.total} total · <span className="text-green-600 dark:text-green-400">{d.functional} functional</span></div>
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-2">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${d.total > 0 ? (d.functional / d.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Water Point Modal — only rendered for authorised roles */}
      {showModal && canAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">{t('Add New Water Point')}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleAddWP} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label">Name *</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gulu Community BH-012" /></div>
                <div><label className="label">Type *</label>
                  <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {['borehole', 'spring', 'shallow_well', 'piped_scheme', 'rainwater_harvesting'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div><label className="label">District *</label>
                  <select className="input" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })}>
                    {DISTRICTS.filter(d => d !== 'All').map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div><label className="label">Latitude</label><input className="input" type="number" step="0.0001" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} /></div>
                <div><label className="label">Longitude</label><input className="input" type="number" step="0.0001" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} /></div>
                <div><label className="label">Beneficiaries</label><input className="input" type="number" value={form.beneficiaries} onChange={e => setForm({ ...form, beneficiaries: e.target.value })} placeholder="Number of people" /></div>
                <div><label className="label">Households</label><input className="input" type="number" value={form.households} onChange={e => setForm({ ...form, households: e.target.value })} placeholder="Number of HHs" /></div>
                <div><label className="label">Pump Type</label><input className="input" value={form.pump_type} onChange={e => setForm({ ...form, pump_type: e.target.value })} placeholder="e.g. Afridev" /></div>
                <div><label className="label">Depth (m)</label><input className="input" type="number" value={form.depth_m} onChange={e => setForm({ ...form, depth_m: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Status *</label>
                  <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="functional">Functional</option>
                    <option value="non_functional">Non-Functional</option>
                    <option value="needs_repair">Needs Repair</option>
                    <option value="under_maintenance">Under Maintenance</option>
                  </select>
                </div>
                <div className="col-span-2"><label className="label">Installation Date</label><input className="input" type="date" value={form.installed_date} onChange={e => setForm({ ...form, installed_date: e.target.value })} /></div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="solar" checked={form.solar_powered} onChange={e => setForm({ ...form, solar_powered: e.target.checked })} className="w-4 h-4 text-blue-600" />
                  <label htmlFor="solar" className="text-sm text-gray-700">{t('Solar Powered')}</label>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">{t('Cancel')}</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">{submitting ? t('Saving...') : t('Add Water Point')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
