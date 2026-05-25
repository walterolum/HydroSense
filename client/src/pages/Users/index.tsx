import { useEffect, useState, useRef } from 'react';
import {
  Users, Shield, MapPin, Mail, Building2, Plus, Search,
  RefreshCw, Edit2, Key, UserX, UserCheck, QrCode, Printer,
  X, AlertCircle, CheckCircle, Eye, EyeOff, Loader2, Trash2,
  MessageCircle, PhoneCall,
} from 'lucide-react';
import { getUsers, createUser, updateUser, resetUserPassword, deleteUser } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

/* Format phone for WhatsApp / tel links (Uganda default +256) */
function fmtPhone(raw?: string): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('256')) return '+' + d;
  if (d.startsWith('0'))   return '+256' + d.slice(1);
  if (d.length >= 9)       return '+' + d;
  return null;
}

/* ── Constants ─────────────────────────────────────────────────── */
const ROLE_COLORS: Record<string, string> = {
  national_admin:     'bg-purple-100 text-purple-700 border-purple-200',
  district_officer:   'bg-blue-100 text-blue-700 border-blue-200',
  community_committee:'bg-emerald-100 text-emerald-700 border-emerald-200',
  citizen:            'bg-gray-100 text-gray-600 border-gray-200',
  ngo_officer:        'bg-orange-100 text-orange-700 border-orange-200',
  technician:         'bg-yellow-100 text-yellow-700 border-yellow-200',
  health_officer:     'bg-red-100 text-red-700 border-red-200',
  climate_scientist:  'bg-cyan-100 text-cyan-700 border-cyan-200',
};

const ROLE_LABELS: Record<string, string> = {
  national_admin:     'National Admin',
  district_officer:   'District Officer',
  community_committee:'Committee Member',
  citizen:            'Citizen',
  ngo_officer:        'NGO Officer',
  technician:         'Technician',
  health_officer:     'Health Officer',
  climate_scientist:  'Climate Scientist',
};

const ROLE_ICONS: Record<string, string> = {
  national_admin: '👑', district_officer: '🏛️', community_committee: '🤝',
  citizen: '👤', ngo_officer: '🌍', technician: '🔧',
  health_officer: '🏥', climate_scientist: '🌤️',
};

import { ALL_DISTRICTS } from '../../constants/districts';
const DISTRICTS = ALL_DISTRICTS;

const AVATAR_COLORS: Record<string, string> = {
  national_admin: '#7c3aed', district_officer: '#2563eb',
  community_committee: '#059669', citizen: '#6b7280',
  ngo_officer: '#d97706', technician: '#ca8a04',
  health_officer: '#dc2626', climate_scientist: '#0891b2',
};

const BLANK_FORM = {
  name: '', email: '', password: '', role: 'citizen' as string,
  district: '', sub_county: '', organization: '', phone: '',
};

/* ── Helpers ────────────────────────────────────────────────────── */
const initials = (name: string) =>
  name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const generatePassword = () => {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
  return rand(upper) + rand(lower) + rand(digits) +
    Array.from({ length: 6 }, () => rand(all)).join('');
};

/* Build QR URL — scans open the public profile verification page */
const qrText = (u: any, _pwd?: string) =>
  `${window.location.origin}/verify/${u.id}`;

/* Free QR image URL (no package needed) */
const qrUrl = (text: string, size = 200) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&format=png&margin=10`;

/* ── Main component ─────────────────────────────────────────────── */
export default function UserManagement() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'national_admin';

  const [users,      setUsers]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  /* Modal state */
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState<any>(null);   // null = create new
  const [form,        setForm]        = useState(BLANK_FORM);
  const [showPwd,     setShowPwd]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  /* Password reset modal */
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [resetPwd,    setResetPwd]    = useState('');
  const [resetShow,   setResetShow]   = useState(false);
  const [resetting,   setResetting]   = useState(false);
  const [resetMsg,    setResetMsg]    = useState('');

  /* QR modal */
  const [qrUser,      setQrUser]      = useState<any>(null);
  const [qrPassword,  setQrPassword]  = useState('');   // known only after create/reset

  /* Per-row action loading */
  const [toggling,  setToggling]  = useState<Record<number, boolean>>({});
  const [deleting,  setDeleting]  = useState<Record<number, boolean>>({});

  /* Delete confirmation */
  const [deleteTarget,  setDeleteTarget]  = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const printRef = useRef<HTMLDivElement>(null);

  /* ── Data ── */
  const load = () => {
    setLoading(true);
    getUsers().then(r => setUsers(r.data.data || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = users.filter(u => {
    const matchRole   = roleFilter === 'all' || u.role === roleFilter;
    const matchSearch = !search
      || u.name.toLowerCase().includes(search.toLowerCase())
      || u.email.toLowerCase().includes(search.toLowerCase())
      || (u.district || '').toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const byRole = users.reduce((acc: any, u: any) => {
    acc[u.role] = (acc[u.role] || 0) + 1; return acc;
  }, {});

  /* ── Open add/edit form ── */
  const openCreate = () => {
    setEditTarget(null);
    setForm(BLANK_FORM);
    setFormError(''); setFormSuccess('');
    setShowForm(true);
  };

  const openEdit = (u: any) => {
    setEditTarget(u);
    setForm({
      name: u.name, email: u.email, password: '',
      role: u.role, district: u.district || '',
      sub_county: u.sub_county || '', organization: u.organization || '',
      phone: u.phone || '',
    });
    setFormError(''); setFormSuccess('');
    setShowForm(true);
  };

  /* ── Save user (create or update) ── */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(''); setFormSuccess('');
    if (!form.name.trim())  { setFormError('Name is required.'); return; }
    if (!form.email.trim()) { setFormError('Email is required.'); return; }
    if (!editTarget && form.password.length < 6) {
      setFormError('Password must be at least 6 characters.'); return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        const payload: any = {
          name: form.name, email: form.email, role: form.role,
          district: form.district || null, sub_county: form.sub_county || null,
          organization: form.organization || null, phone: form.phone || null,
        };
        await updateUser(editTarget.id, payload);
        setFormSuccess('User updated successfully.');
        load();
      } else {
        const payload = {
          name: form.name, email: form.email, password: form.password,
          role: form.role, district: form.district || null,
          sub_county: form.sub_county || null, organization: form.organization || null,
          phone: form.phone || null,
        };
        const res = await createUser(payload);
        const newId = res.data.id;
        setFormSuccess(`User created! ID: ${newId}`);
        load();
        /* Show QR immediately with known password */
        const newUser = { name: form.name, email: form.email, role: form.role, district: form.district, organization: form.organization, id: newId };
        setTimeout(() => {
          setShowForm(false);
          setQrUser(newUser);
          setQrPassword(form.password);
        }, 800);
      }
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Toggle active (deactivate / reactivate) ── */
  const handleToggle = async (u: any) => {
    setToggling(t => ({ ...t, [u.id]: true }));
    try {
      const newActive = u.active ? 0 : 1;
      await updateUser(u.id, { active: newActive });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: newActive } : x));
    } catch { /* ignore */ }
    finally { setToggling(t => ({ ...t, [u.id]: false })); }
  };

  /* ── Hard delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(d => ({ ...d, [deleteTarget.id]: true }));
    try {
      await deleteUser(deleteTarget.id);
      setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirm('');
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Delete failed.');
    } finally {
      setDeleting(d => ({ ...d, [deleteTarget?.id]: false }));
    }
  };

  /* ── Reset password ── */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetPwd.length < 6) { setResetMsg('Password must be at least 6 characters.'); return; }
    setResetting(true); setResetMsg('');
    try {
      await resetUserPassword(resetTarget.id, resetPwd);
      setResetMsg('✓ Password reset successfully!');
      /* Show QR with new password */
      const pwd = resetPwd;
      setTimeout(() => {
        setResetTarget(null); setResetPwd('');
        setQrUser(resetTarget);
        setQrPassword(pwd);
      }, 600);
    } catch (err: any) {
      setResetMsg(err?.response?.data?.error || 'Reset failed.');
    } finally {
      setResetting(false);
    }
  };

  /* ── Print QR cards ── */
  const printAll = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const cards = users.map(u => {
      const text = qrText(u);
      const url = qrUrl(text, 160);
      return `
        <div class="card">
          <div class="header">
            <span class="icon">💧</span>
            <span class="sys">HYDROSENSE</span>
          </div>
          <img src="${url}" alt="QR" />
          <div class="name">${u.name}</div>
          <div class="info">📧 ${u.email}</div>
          <div class="info">🎭 ${ROLE_LABELS[u.role] || u.role}</div>
          ${u.district ? `<div class="info">📍 ${u.district}</div>` : ''}
          <div class="badge">${ROLE_ICONS[u.role] || '👤'} ${ROLE_LABELS[u.role] || u.role}</div>
        </div>`;
    }).join('');

    win.document.documentElement.innerHTML = `<head><title>HYDROSENSE — User QR Cards</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
  h1 { text-align: center; margin-bottom: 20px; font-size: 18px; color: #1e1b4b; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .card {
    background: white; border: 1.5px solid #e2e8f0; border-radius: 12px;
    padding: 16px; text-align: center; break-inside: avoid;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
  .header { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 10px; }
  .icon { font-size: 20px; }
  .sys { font-size: 12px; font-weight: 800; letter-spacing: 2px; color: #1e1b4b; }
  img { width: 140px; height: 140px; margin: 8px auto; display: block; border: 1px solid #e2e8f0; border-radius: 8px; }
  .name { font-weight: 700; font-size: 13px; color: #1e293b; margin: 8px 0 4px; }
  .info { font-size: 10px; color: #64748b; margin: 2px 0; }
  .badge { margin-top: 8px; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: #eff6ff; color: #2563eb; display: inline-block; }
  hr { border: none; border-top: 1px dashed #e2e8f0; margin: 8px 0; }
  @media print {
    body { background: white; padding: 10px; }
    .grid { grid-template-columns: repeat(3, 1fr); }
    .no-print { display: none; }
  }
</style></head><body>
<h1>HYDROSENSE — User Credential QR Cards &nbsp;|&nbsp; ${new Date().toLocaleDateString()}</h1>
<div class="no-print" style="text-align:center;margin-bottom:16px">
  <button onclick="window.print()" style="padding:10px 24px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer">🖨️ Print All Cards</button>
</div>
<div class="grid">${cards}</div>
</body>`;
    win.document.close();
  };

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#2563eb 100%)' }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield size={17} className="text-indigo-300" />
              <span className="text-indigo-300 text-sm font-semibold tracking-wide">USER MANAGEMENT</span>
            </div>
            <h2 className="text-2xl font-extrabold">System Users &amp; Role Administration</h2>
            <p className="text-indigo-100 text-sm mt-1">
              {isAdmin
                ? 'Create accounts, assign roles, manage access, and generate QR credential cards.'
                : 'View system users and their roles.'}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={load} title="Refresh"
              className="p-2.5 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 transition-colors">
              <RefreshCw size={16} className="text-white" />
            </button>
            {isAdmin && (
              <>
                <button onClick={printAll}
                  className="px-4 py-2.5 rounded-xl bg-white/20 border border-white/25 hover:bg-white/30 text-white text-sm font-semibold flex items-center gap-2 transition-colors">
                  <Printer size={15} /> Print QR Cards
                </button>
                <button onClick={openCreate}
                  className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold flex items-center gap-2 shadow-lg transition-colors">
                  <Plus size={16} /> Add User
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Role summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <div key={role}
            className={`card cursor-pointer transition-all hover:shadow-md border ${roleFilter === role ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{ROLE_ICONS[role]}</span>
                <div className="text-xs text-gray-500 font-medium">{label}</div>
              </div>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                style={{ background: AVATAR_COLORS[role] || '#6b7280' }}>
                {byRole[role] || 0}
              </div>
            </div>
            <span className={`mt-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_COLORS[role] || ''}`}>
              {role.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* ── Search + filter bar ── */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
            <Search size={15} className="text-gray-400 flex-shrink-0" />
            <input type="text" placeholder="Search by name, email, or district..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none text-sm text-gray-700 dark:text-gray-300 w-full placeholder-gray-400" />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'national_admin', 'district_officer', 'technician', 'health_officer', 'citizen'].map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${roleFilter === r ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
                {r === 'all' ? `All (${users.length})` : ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Users table ── */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h3 className="section-title">
            <Users size={16} className="text-blue-600" />
            {loading ? 'Loading...' : `${filtered.length} User${filtered.length !== 1 ? 's' : ''}`}
          </h3>
          {isAdmin && (
            <span className="text-xs text-gray-400">
              Admin: click <Edit2 size={11} className="inline" /> to edit · <QrCode size={11} className="inline" /> for QR card
            </span>
          )}
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th className="th">User</th>
              <th className="th">Role</th>
              <th className="th">District / Org</th>
              <th className="th">Contact</th>
              <th className="th">Last Login</th>
              <th className="th">Status</th>
              <th className="th">Actions</th>
            </tr></thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {loading
                ? Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="tr">
                      {Array(7).fill(0).map((__, j) => (
                        <td key={j} className="td"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map(u => (
                    <tr key={u.id} className={`tr ${u.id === me?.id ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''} ${!u.active ? 'opacity-60' : ''}`}>
                      {/* Name + avatar */}
                      <td className="td">
                        <div className="flex items-center gap-3">
                          {/* Avatar — photo if set, otherwise initials */}
                          <div className="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700"
                            style={{ background: AVATAR_COLORS[u.role] || '#6b7280' }}>
                            {u.avatar
                              ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">{initials(u.name)}</div>}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                              {u.name}
                              {u.id === me?.id && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-bold">YOU</span>}
                              {!u.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">INACTIVE</span>}
                            </div>
                            <div className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} />{u.email}</div>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="td">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                            <span>{ROLE_ICONS[u.role]}</span>
                            <span>{ROLE_LABELS[u.role] || u.role}</span>
                          </span>
                        </div>
                      </td>
                      {/* District */}
                      <td className="td text-sm">
                        <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                          {u.district && <><MapPin size={11} className="flex-shrink-0" /><span>{u.district}</span></>}
                          {u.organization && <><Building2 size={11} className="flex-shrink-0" /><span>{u.organization}</span></>}
                          {!u.district && !u.organization && <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      {/* Contact — clickable email / WhatsApp / call */}
                      <td className="td">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Email */}
                          <a href={`mailto:${u.email}?subject=HYDROSENSE`}
                            title={`Email ${u.name}`}
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            onClick={e => e.stopPropagation()}>
                            <Mail size={13} />
                          </a>
                          {/* WhatsApp */}
                          {fmtPhone(u.phone) && (
                            <a href={`https://wa.me/${fmtPhone(u.phone)?.replace('+','')}`}
                              title={`WhatsApp ${u.name}`}
                              target="_blank" rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                              onClick={e => e.stopPropagation()}>
                              <MessageCircle size={13} />
                            </a>
                          )}
                          {/* Phone call */}
                          {fmtPhone(u.phone) && (
                            <a href={`tel:${fmtPhone(u.phone)}`}
                              title={`Call ${u.name}`}
                              className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                              onClick={e => e.stopPropagation()}>
                              <PhoneCall size={13} />
                            </a>
                          )}
                          {!u.phone && <span className="text-xs text-gray-300">—</span>}
                        </div>
                      </td>
                      {/* Last login */}
                      <td className="td text-xs text-gray-500">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : <span className="text-gray-300">Never</span>}
                      </td>
                      {/* Status */}
                      <td className="td">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="td">
                        <div className="flex items-center gap-1.5">
                          {/* QR Code (everyone can view their own, admin sees all) */}
                          {(isAdmin || u.id === me?.id) && (
                            <button onClick={() => { setQrUser(u); setQrPassword(''); }}
                              title="View QR credential card"
                              className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                              <QrCode size={14} />
                            </button>
                          )}
                          {isAdmin && u.id !== me?.id && (
                            <>
                              <button onClick={() => openEdit(u)} title="Edit user"
                                className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => { setResetTarget(u); setResetPwd(''); setResetMsg(''); }}
                                title="Reset password"
                                className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                                <Key size={14} />
                              </button>
                              <button onClick={() => handleToggle(u)}
                                disabled={!!toggling[u.id]}
                                title={u.active ? 'Deactivate user' : 'Activate user'}
                                className={`p-1.5 rounded-lg transition-colors ${u.active ? 'text-amber-500 hover:bg-amber-50' : 'text-green-500 hover:bg-green-50'}`}>
                                {toggling[u.id]
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                              </button>
                              {/* Hard delete */}
                              <button
                                onClick={() => { setDeleteTarget(u); setDeleteConfirm(''); }}
                                title="Permanently delete user"
                                disabled={!!deleting[u.id]}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40">
                                {deleting[u.id] ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
              }
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="td text-center text-gray-400 py-10">No users match your filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          ADD / EDIT USER MODAL
      ══════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 sticky top-0 z-10 flex justify-between items-center border-b border-gray-100 dark:border-gray-800"
              style={{ background: 'linear-gradient(135deg,#1e1b4b,#2563eb)' }}>
              <div className="flex items-center gap-2">
                {editTarget ? <Edit2 size={18} className="text-blue-300" /> : <Plus size={18} className="text-blue-300" />}
                <span className="font-bold text-white">{editTarget ? `Edit — ${editTarget.name}` : 'Add New User'}</span>
              </div>
              <button onClick={() => setShowForm(false)} className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0" /> {formError}
                </div>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <CheckCircle size={15} className="flex-shrink-0" /> {formSuccess}
                </div>
              )}

              {/* Name + Email */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="label">Full Name *</label>
                  <input className="input" required placeholder="e.g. John Okello"
                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Email Address *</label>
                  <input className="input" type="email" required placeholder="e.g. john@mwe.go.ug"
                    value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="label">{editTarget ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                <div className="relative">
                  <input className="input pr-20" type={showPwd ? 'text' : 'password'}
                    required={!editTarget}
                    minLength={6}
                    placeholder={editTarget ? 'Leave blank to keep unchanged' : 'Min. 6 characters'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })} />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="p-1 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, password: generatePassword() })}
                      title="Auto-generate password"
                      className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors">
                      GEN
                    </button>
                  </div>
                </div>
                {form.password && (
                  <div className="mt-1 text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                    Password preview: {form.password}
                  </div>
                )}
              </div>

              {/* Role */}
              <div>
                <label className="label">Role *</label>
                <select className="input" required value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {Object.entries(ROLE_LABELS).map(([r, label]) => (
                    <option key={r} value={r}>{ROLE_ICONS[r]} {label}</option>
                  ))}
                </select>
              </div>

              {/* District + Sub-county */}
              {['district_officer','community_committee','technician','health_officer','climate_scientist'].includes(form.role) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">District</label>
                    <select className="input" value={form.district}
                      onChange={e => setForm({ ...form, district: e.target.value })}>
                      <option value="">— Select —</option>
                      {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Sub-county</label>
                    <input className="input" placeholder="Optional"
                      value={form.sub_county} onChange={e => setForm({ ...form, sub_county: e.target.value })} />
                  </div>
                </div>
              )}

              {/* Organization + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Organization</label>
                  <input className="input" placeholder="e.g. NEMA Uganda"
                    value={form.organization} onChange={e => setForm({ ...form, organization: e.target.value })} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" placeholder="+256..."
                    value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,#1e1b4b,#2563eb)' }}>
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Saving...' : editTarget ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          RESET PASSWORD MODAL
      ══════════════════════════════════════════════════════ */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setResetTarget(null); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center"
              style={{ background: 'linear-gradient(135deg,#78350f,#d97706)' }}>
              <div className="flex items-center gap-2">
                <Key size={18} className="text-amber-200" />
                <span className="font-bold text-white">Reset Password</span>
              </div>
              <button onClick={() => setResetTarget(null)} className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>
            <form onSubmit={handleReset} className="p-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Setting new password for <strong>{resetTarget.name}</strong>
              </p>
              {resetMsg && (
                <div className={`px-3 py-2 rounded-xl text-sm flex items-center gap-2
                  ${resetMsg.startsWith('✓')
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {resetMsg}
                </div>
              )}
              <div>
                <label className="label">New Password</label>
                <div className="relative">
                  <input className="input pr-20" type={resetShow ? 'text' : 'password'}
                    minLength={6} required
                    placeholder="Min. 6 characters"
                    value={resetPwd}
                    onChange={e => setResetPwd(e.target.value)} />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button type="button" onClick={() => setResetShow(v => !v)}
                      className="p-1 text-gray-400 hover:text-gray-600">
                      {resetShow ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button type="button" onClick={() => setResetPwd(generatePassword())}
                      className="px-1.5 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-600 rounded hover:bg-orange-200">
                      GEN
                    </button>
                  </div>
                </div>
                {resetPwd && <div className="mt-1 text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Preview: {resetPwd}</div>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setResetTarget(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={resetting}
                  className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#78350f,#d97706)' }}>
                  {resetting && <Loader2 size={14} className="animate-spin" />}
                  {resetting ? 'Resetting...' : '🔑 Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          QR CODE MODAL
      ══════════════════════════════════════════════════════ */}
      {qrUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) { setQrUser(null); setQrPassword(''); } }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center"
              style={{ background: 'linear-gradient(135deg,#1e1b4b,#4f46e5)' }}>
              <div className="flex items-center gap-2">
                <QrCode size={18} className="text-indigo-300" />
                <span className="font-bold text-white">QR Credential Card</span>
              </div>
              <button onClick={() => { setQrUser(null); setQrPassword(''); }}
                className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>

            {/* Card content */}
            <div className="p-6" ref={printRef}>
              {/* Printable credential card */}
              <div className="border-2 border-indigo-100 dark:border-indigo-900 rounded-2xl p-5 text-center">
                {/* Logo */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-2xl">💧</span>
                  <span className="font-black text-sm tracking-widest text-indigo-900 dark:text-indigo-300">HYDROSENSE</span>
                </div>

                {/* QR image */}
                <div className="flex justify-center mb-4">
                  <img
                    src={qrUrl(qrText(qrUser, qrPassword || undefined), 180)}
                    alt="QR Code"
                    className="w-44 h-44 rounded-xl border border-indigo-100 dark:border-indigo-800"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>

                {/* User info */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-base font-bold mx-auto mb-3"
                  style={{ background: AVATAR_COLORS[qrUser.role] || '#6b7280' }}>
                  {initials(qrUser.name)}
                </div>
                <div className="font-bold text-gray-900 dark:text-white text-base">{qrUser.name}</div>
                <div className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
                  <Mail size={10} /> {qrUser.email}
                </div>
                <div className="mt-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${ROLE_COLORS[qrUser.role] || ''}`}>
                    {ROLE_ICONS[qrUser.role]} {ROLE_LABELS[qrUser.role] || qrUser.role}
                  </span>
                </div>
                {qrUser.district && (
                  <div className="text-xs text-gray-400 mt-1.5 flex items-center justify-center gap-1">
                    <MapPin size={10} /> {qrUser.district}
                  </div>
                )}

                {/* Password section */}
                <div className="mt-4 border-t border-dashed border-indigo-200 dark:border-indigo-800 pt-3">
                  {qrPassword ? (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 rounded-xl p-3">
                      <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide mb-1">Password (shown once)</div>
                      <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400 tracking-widest">
                        {qrPassword}
                      </div>
                      <div className="text-[10px] text-emerald-500 mt-1">Save this securely — it won't be shown again</div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">
                      Password was set by the system administrator.<br />
                      <span className="text-indigo-500">Contact admin to reset if needed.</span>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-gray-300 dark:text-gray-600 mt-3">
                  {window.location.origin}/verify/{qrUser?.id}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => {
                  const win = window.open('', '_blank');
                  if (!win) return;
                  win.document.documentElement.innerHTML = `<head><title>QR Card — ${qrUser.name}</title>
<style>
  body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;margin:0}
  .card{background:white;border:2px solid #e0e7ff;border-radius:16px;padding:28px;text-align:center;width:280px;box-shadow:0 4px 16px rgba(0,0,0,0.1)}
  .logo{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px}
  .logo-text{font-weight:900;font-size:13px;letter-spacing:3px;color:#1e1b4b}
  img{width:180px;height:180px;border-radius:12px;border:1px solid #e0e7ff;margin:0 auto 12px;display:block}
  .name{font-weight:700;font-size:15px;color:#1e293b}
  .email{font-size:11px;color:#94a3b8;margin:4px 0}
  .badge{display:inline-block;margin:8px 0;padding:4px 12px;border-radius:20px;font-size:10px;font-weight:700;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe}
  .district{font-size:11px;color:#94a3b8}
  .pwd-box{margin-top:12px;padding:10px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;border-top:2px dashed #86efac}
  .pwd-label{font-size:9px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
  .pwd-val{font-family:monospace;font-size:16px;font-weight:700;color:#15803d;letter-spacing:2px}
  .pwd-note{font-size:9px;color:#86efac;margin-top:3px}
  .footer{font-size:9px;color:#cbd5e1;margin-top:12px}
  @media print{body{background:white}.no-print{display:none}}
</style></head><body>
<div class="card">
  <div class="logo"><span style="font-size:22px">💧</span><span class="logo-text">HYDROSENSE</span></div>
  <img src="${qrUrl(qrText(qrUser, qrPassword || undefined), 180)}" alt="QR" />
  <div class="name">${qrUser.name}</div>
  <div class="email">📧 ${qrUser.email}</div>
  <span class="badge">${ROLE_ICONS[qrUser.role] || '👤'} ${ROLE_LABELS[qrUser.role] || qrUser.role}</span>
  ${qrUser.district ? `<div class="district">📍 ${qrUser.district}</div>` : ''}
  ${qrPassword
    ? `<div class="pwd-box"><div class="pwd-label">Password (shown once)</div><div class="pwd-val">${qrPassword}</div><div class="pwd-note">Save securely — not shown again</div></div>`
    : `<div style="font-size:10px;color:#94a3b8;margin-top:10px">Contact admin to get/reset password</div>`
  }
  <div class="footer">${window.location.origin}/verify/${qrUser?.id}</div>
</div>
</body>`;
                  win.document.close();
                  setTimeout(() => win.print(), 400);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center gap-1.5 transition-colors">
                <Printer size={14} /> Print Card
              </button>
              <button onClick={() => { setQrUser(null); setQrPassword(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DELETE CONFIRMATION MODAL
      ══════════════════════════════════════════════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) { setDeleteTarget(null); setDeleteConfirm(''); } }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center"
              style={{ background: 'linear-gradient(135deg,#7f1d1d,#dc2626)' }}>
              <div className="flex items-center gap-2">
                <Trash2 size={18} className="text-red-200" />
                <span className="font-bold text-white">Delete User</span>
              </div>
              <button onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}
                className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Warning */}
              <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 dark:text-red-400">
                  <strong>This action is permanent.</strong> Deleting <strong>{deleteTarget.name}</strong> will
                  remove their account, login access, and all associated data. This cannot be undone.
                </div>
              </div>

              {/* User info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0"
                  style={{ background: AVATAR_COLORS[deleteTarget.role] || '#6b7280' }}>
                  {deleteTarget.avatar
                    ? <img src={deleteTarget.avatar} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">{initials(deleteTarget.name)}</div>}
                </div>
                <div>
                  <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{deleteTarget.name}</div>
                  <div className="text-xs text-gray-400">{deleteTarget.email}</div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${ROLE_COLORS[deleteTarget.role] || ''}`}>
                    {ROLE_LABELS[deleteTarget.role] || deleteTarget.role}
                  </span>
                </div>
              </div>

              {/* Type-to-confirm */}
              <div>
                <label className="label text-red-600">
                  Type <strong>{deleteTarget.name.split(' ')[0]}</strong> to confirm deletion
                </label>
                <input
                  className="input border-red-200 focus:ring-red-400"
                  placeholder={deleteTarget.name.split(' ')[0]}
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}
                  className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirm !== deleteTarget.name.split(' ')[0] || !!deleting[deleteTarget.id]}
                  className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                  {deleting[deleteTarget.id] && <Loader2 size={14} className="animate-spin" />}
                  {deleting[deleteTarget.id] ? 'Deleting...' : '🗑️ Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
