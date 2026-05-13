import { useState, useRef } from 'react';
import { X, Camera, Loader2, CheckCircle, AlertCircle, User, Phone, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { updateProfile, changePassword } from '../../api/client';

/* Compress image to a square thumbnail (256×256, JPEG 80%) */
async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 256;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      // centre-crop to square
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = url;
  });
}

interface Props {
  onClose: () => void;
}

export default function ProfileModal({ onClose }: Props) {
  const { user, patchUser } = useAuth();
  const [name,  setName]  = useState(user?.name  || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar || null);
  const [avatarData,    setAvatarData]    = useState<string | null>(null);
  const [saving,   setSaving]  = useState(false);
  const [msg,      setMsg]     = useState('');
  const [isError,  setIsError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Password change state
  const [activeTab,    setActiveTab]    = useState<'profile'|'password'>('profile');
  const [currentPwd,   setCurrentPwd]   = useState('');
  const [newPwd,       setNewPwd]       = useState('');
  const [confirmPwd,   setConfirmPwd]   = useState('');
  const [showCurrent,  setShowCurrent]  = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [pwdSaving,    setPwdSaving]    = useState(false);
  const [pwdMsg,       setPwdMsg]       = useState('');
  const [pwdError,     setPwdError]     = useState(false);

  const handlePwdChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(''); setPwdError(false);
    if (!currentPwd) { setPwdError(true); setPwdMsg('Enter your current password.'); return; }
    if (newPwd.length < 6) { setPwdError(true); setPwdMsg('New password must be at least 6 characters.'); return; }
    if (newPwd !== confirmPwd) { setPwdError(true); setPwdMsg('Passwords do not match.'); return; }
    setPwdSaving(true);
    try {
      await changePassword(currentPwd, newPwd);
      setPwdError(false);
      setPwdMsg('✓ Password changed successfully!');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      setPwdError(true);
      setPwdMsg(err?.response?.data?.error || 'Password change failed.');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setIsError(true); setMsg('Please choose an image file.'); return; }
    if (f.size > 8 * 1024 * 1024) { setIsError(true); setMsg('Image must be under 8 MB.'); return; }
    const compressed = await compressImage(f);
    setAvatarPreview(compressed);
    setAvatarData(compressed);
    setMsg(''); setIsError(false);
  };

  const removeAvatar = () => {
    setAvatarPreview(null);
    setAvatarData('');  // empty string = signal to clear
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setIsError(true); setMsg('Name cannot be empty.'); return; }
    setSaving(true); setMsg(''); setIsError(false);
    try {
      const payload: any = { name: name.trim(), phone: phone.trim() || null };
      if (avatarData !== null) payload.avatar = avatarData || null;
      const res = await updateProfile(payload);
      patchUser(res.data.user);
      setIsError(false);
      setMsg('✓ Profile updated!');
      setTimeout(onClose, 900);
    } catch (err: any) {
      setIsError(true);
      setMsg(err?.response?.data?.error || 'Update failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const initials = user?.name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center"
          style={{ background: 'linear-gradient(135deg,#1e1b4b,#2563eb)' }}>
          <div className="flex items-center gap-2">
            <User size={18} className="text-blue-300" />
            <span className="font-bold text-white">My Profile</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {(['profile', 'password'] as const).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors
                ${activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              {tab === 'profile' ? <><User size={13} /> Profile</> : <><Lock size={13} /> Password</>}
            </button>
          ))}
        </div>

        {/* ── PASSWORD TAB ── */}
        {activeTab === 'password' && (
          <form onSubmit={handlePwdChange} className="p-5 space-y-4">
            {pwdMsg && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${pwdError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {pwdError ? <AlertCircle size={14} /> : <CheckCircle size={14} />} {pwdMsg}
              </div>
            )}
            <div>
              <label className="label">Current Password</label>
              <div className="relative">
                <input className="input pr-10" type={showCurrent ? 'text' : 'password'} required
                  placeholder="Enter current password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
                <button type="button" onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showCurrent ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>
            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <input className="input pr-10" type={showNew ? 'text' : 'password'} required minLength={6}
                  placeholder="Min. 6 characters" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNew ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              {/* Strength indicator */}
              {newPwd && (
                <div className="flex gap-1 mt-1.5">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      newPwd.length >= i * 3
                        ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-orange-400' : i <= 3 ? 'bg-yellow-400' : 'bg-green-500'
                        : 'bg-gray-100 dark:bg-gray-700'}`} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input className={`input ${confirmPwd && confirmPwd !== newPwd ? 'border-red-300 focus:ring-red-400' : ''}`}
                type="password" required placeholder="Repeat new password"
                value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
              {confirmPwd && confirmPwd !== newPwd && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={pwdSaving}
                className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                {pwdSaving && <Loader2 size={14} className="animate-spin"/>}
                {pwdSaving ? 'Changing...' : '🔒 Change Password'}
              </button>
            </div>
          </form>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
        <form onSubmit={handleSave} className="p-5 space-y-5">

          {/* Avatar upload */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-white dark:border-gray-700 shadow-lg"
                style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">{initials}</div>}
              </div>
              {/* Overlay on hover */}
              <button type="button" onClick={() => fileRef.current?.click()}
                className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={22} className="text-white" />
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-1.5 transition-colors">
                <Camera size={12} /> {avatarPreview ? 'Change Photo' : 'Upload Photo'}
              </button>
              {avatarPreview && (
                <button type="button" onClick={removeAvatar}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-colors">
                  <X size={12} /> Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </div>

          {/* Message */}
          {msg && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {isError ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
              {msg}
            </div>
          )}

          {/* Read-only info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Mail size={11} /> <span>{user?.email}</span>
            </div>
            <div className="text-xs text-gray-400">Role: <span className="font-semibold text-gray-600 dark:text-gray-300">{user?.role?.replace(/_/g,' ')}</span></div>
            {user?.district && <div className="text-xs text-gray-400">District: <span className="font-semibold text-gray-600 dark:text-gray-300">{user.district}</span></div>}
          </div>

          {/* Editable fields */}
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input className="input" placeholder="+256..." value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
        )} {/* end profile tab */}
      </div>
    </div>
  );
}
