import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, changePassword } from '../api/client';
import { User, Mail, Phone, MapPin, Shield, Save, Loader2, CheckCircle, AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import { useTranslations } from '../hooks/useTranslations';

export default function Profile() {
  const s = useTranslations({
    myProfile: 'My Profile',
    editProfile: 'Edit Profile',
    name: 'Name',
    phone: 'Phone',
    saveChanges: 'Save Changes',
    changePassword: 'Change Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
  });
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await updateProfile({ name, phone });
      await refreshUser();
      setMessage('Profile updated successfully');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!currentPassword || !newPassword) {
      setError('Both passwords are required');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setMessage('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Password change failed');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const roleLabels: Record<string, string> = {
    national_admin: 'System Administrator',
    district_officer: 'District Water Officer',
    technician: 'Field Technician',
    health_officer: 'Environmental Monitoring Officer',
    climate_scientist: 'Environmental Intelligence',
    ngo_officer: 'NGO Officer',
    community_committee: 'Community Leader',
    citizen: 'Citizen',
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{s.myProfile}</h1>

      {message && (
        <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-sm text-green-700">
          <CheckCircle size={16} className="flex-shrink-0 text-green-500" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white">
            {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
            <p className="text-sm text-gray-500">{roleLabels[user.role] || user.role}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"><Mail size={16} className="text-gray-400" /> {user.email}</div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"><Phone size={16} className="text-gray-400" /> {user.phone || 'Not set'}</div>
          {user.district && <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"><MapPin size={16} className="text-gray-400" /> {user.district}{user.sub_county ? `, ${user.sub_county}` : ''}</div>}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"><Shield size={16} className="text-gray-400" /> {roleLabels[user.role] || user.role}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{s.editProfile}</h3>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{s.name}</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{s.phone}</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-bold text-white text-sm bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {s.saveChanges}</>}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{s.changePassword}</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{s.currentPassword}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type={showPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><Eye size={14} /></button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{s.newPassword}</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" required minLength={6} />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-bold text-white text-sm bg-purple-600 hover:bg-purple-700 flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Updating...</> : <><Lock size={14} /> Change Password</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
