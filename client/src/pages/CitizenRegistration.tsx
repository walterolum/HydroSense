import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { registerCitizen } from '../api/client';
import { SUPPORTED_LANGUAGES, LanguageCode } from '../types/language';
import {
  AlertCircle, CheckCircle, Phone, Mail, User, MapPin, Lock, Shield,
  Fingerprint, Loader2, Eye, EyeOff, Globe, Smartphone, PhoneCall,
  RefreshCw, Clock, ShieldCheck,
} from 'lucide-react';

type DeviceType = 'smart' | 'feature';

/* ── Multilingual OTP labels ── */
const OTP_LABELS: Record<string, { title: string; sub: string; enter: string; resend: string; wait: string }> = {
  en:  { title: 'Verify Your Account',  sub: 'Enter the code sent to you',        enter: 'Enter verification code', resend: 'Resend code',        wait: 'Resend available in' },
  lug: { title: 'Kakasa Akawunti Ko',   sub: 'Yingiza koodi eyatumibwa',           enter: 'Yingiza koodi',           resend: 'Tuma Nate',          wait: 'Lindirira' },
  swa: { title: 'Thibitisha Akaunti',   sub: 'Ingiza nambari iliyotumwa kwako',    enter: 'Ingiza nambari',          resend: 'Tuma tena',          wait: 'Subiri' },
  luo: { title: 'Genyi Akaunti Mari',   sub: 'Ket namba ma ioro negi',             enter: 'Ket namba',               resend: 'Or Matien',          wait: 'Kur' },
  nyn: { title: 'Kakasa Akaunti Yawe',  sub: 'Yingiza koodi eyatumibwa',           enter: 'Yingiza koodi',           resend: 'Tuma Nate',          wait: 'Lindira' },
};

/* ── 6-box OTP input component ── */
function OtpBoxes({ value, onChange, disabled, error }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; error?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, '').split('').slice(0, 6);

  const handleChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[i] = d;
    onChange(next.join('').trimEnd());
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!digits[i] && i > 0) refs.current[i - 1]?.focus();
      else { const n = [...digits]; n[i] = ''; onChange(n.join('').trimEnd()); }
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    setTimeout(() => refs.current[Math.min(pasted.length, 5)]?.focus(), 0);
  };

  return (
    <div className="flex gap-2 sm:gap-3 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          className={`w-11 h-14 sm:w-13 sm:h-16 text-center text-2xl font-extrabold border-2 rounded-xl transition-all duration-200 outline-none
            ${d ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-400'}
            ${error ? 'border-red-400 bg-red-50 animate-shake' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:bg-white hover:border-gray-300'}
          `}
          placeholder="·"
        />
      ))}
    </div>
  );
}

/* ── Countdown timer ── */
function CountdownTimer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    setLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (left <= 0) { if (!expiredRef.current) { expiredRef.current = true; onExpire(); } return; }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onExpire]);

  const m = Math.floor(left / 60);
  const s = left % 60;
  const pct = (left / seconds) * 100;
  const urgent = left <= 60;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
      urgent ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
    }`}>
      <Clock size={12} className={urgent ? 'animate-pulse' : ''} />
      {left > 0 ? `${m}:${String(s).padStart(2, '0')} remaining` : 'Code expired'}
      <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeDasharray={`${2 * Math.PI * 6}`}
          strokeDashoffset={`${2 * Math.PI * 6 * (1 - pct / 100)}`}
          strokeLinecap="round" transform="rotate(-90 8 8)" />
      </svg>
    </div>
  );
}

export default function CitizenRegistration() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { setLanguage } = useLanguage();

  const [step, setStep]               = useState(1);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [deviceType, setDeviceType]   = useState<DeviceType>('smart');
  const [deliveryMethod, setDelivery] = useState<'email' | 'sms'>('email');
  const [otp, setOtp]                 = useState('');
  const [otpError, setOtpError]       = useState(false);
  const [attemptsLeft, setAttempts]   = useState(5);
  const [blockedFor, setBlockedFor]   = useState(0);
  const [otpExpired, setOtpExpired]   = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpTimerKey, setOtpTimerKey] = useState(0); // resets timer on resend
  const resendTimerRef = useRef<ReturnType<typeof setInterval>>();

  const [registeredEmail, setRegisteredEmail] = useState('');
  const [registeredPhone, setRegisteredPhone] = useState('');
  const [phoneHint, setPhoneHint]             = useState('');

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    phone: '', national_id: '', community_id: '', district: '', sub_county: '',
    location: '', language: 'en',
  });

  const [showPw, setShowPw]   = useState(false);
  const [showCpw, setShowCpw] = useState(false);

  const lang = OTP_LABELS[form.language] || OTP_LABELS.en;

  const update = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));

  const districts = [
    'Kampala','Gulu','Lira','Moroto','Jinja','Soroti','Arua',
    'Mbarara','Mbale','Tororo','Masaka','Fort Portal','Kabale','Busia','Adjumani',
  ];

  /* ── Start resend cooldown ── */
  const startResendCooldown = useCallback((secs: number) => {
    setResendCooldown(secs);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown(c => { if (c <= 1) { clearInterval(resendTimerRef.current!); return 0; } return c - 1; });
    }, 1000);
  }, []);

  /* ── Send / Resend OTP ── */
  const sendOtp = useCallback(async (isResend = false) => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError('');
    setOtpExpired(false);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registeredEmail,
          device_type: deviceType,
          phone: registeredPhone,
          purpose: 'registration',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send code');
        if (data.secondsLeft) startResendCooldown(data.secondsLeft);
        return;
      }
      if (isResend) setSuccess('New code sent!');
      setDelivery(data.delivery_method || (deviceType === 'feature' ? 'sms' : 'email'));
      if (data.phone_hint) setPhoneHint(data.phone_hint);
      setOtp('');
      setOtpTimerKey(k => k + 1);
      startResendCooldown(60);
    } catch {
      setError('Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [registeredEmail, registeredPhone, deviceType, resendCooldown, startResendCooldown]);

  /* ── Register ── */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (deviceType === 'feature' && !form.phone) { setError('Phone number is required for feature phone registration'); return; }
    setLoading(true);
    try {
      await registerCitizen({
        name: form.name, email: form.email, password: form.password,
        phone: form.phone, national_id: form.national_id, community_id: form.community_id,
        district: form.district, sub_county: form.sub_county, location: form.location,
        language: form.language, device_type: deviceType,
      });
      setRegisteredEmail(form.email);
      setRegisteredPhone(form.phone);
      // Send OTP after registration
      const otpRes = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, device_type: deviceType, phone: form.phone, purpose: 'registration' }),
      }).then(r => r.json());
      setDelivery(otpRes.delivery_method || (deviceType === 'feature' ? 'sms' : 'email'));
      if (otpRes.phone_hint) setPhoneHint(otpRes.phone_hint);
      startResendCooldown(60);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Verify OTP ── */
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setError('');
    setOtpError(false);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        setOtpError(true);
        setError(data.error || 'Incorrect code');
        if (data.attemptsLeft !== undefined) setAttempts(data.attemptsLeft);
        if (data.blockedFor) setBlockedFor(data.blockedFor);
        setOtp('');
        return;
      }
      // Auto-login — store token and redirect to dashboard
      if (data.token && data.user) {
        sessionStorage.setItem('hs_token', data.token);
        sessionStorage.setItem('hs_user', JSON.stringify(data.user));
      }
      setSuccess('Account verified! Taking you to your dashboard…');
      setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => { if (resendTimerRef.current) clearInterval(resendTimerRef.current); }, []);

  /* ── Render ── */
  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[42%] bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-700 relative overflow-hidden p-10 flex-col justify-between">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl border border-white/20">💧</div>
            <div>
              <div className="font-bold text-white text-lg">HYDROSENSE</div>
              <div className="text-blue-200 text-xs">Ministry of Water &amp; Environment</div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Secure Community Registration</h1>
          <p className="text-blue-100/80 text-sm leading-relaxed mb-8">
            Join the HydroSense community to report environmental incidents and help protect Uganda's water resources.
          </p>
          <div className="space-y-3">
            {[
              { icon: '🔐', title: 'OTP-Verified Registration', desc: 'Every account verified via Email or SMS' },
              { icon: '📱', title: 'Smartphone & Button Phone', desc: 'Works on any device in any network area' },
              { icon: '🌍', title: '10 Local Languages', desc: 'Interface in Luganda, Swahili, Luo & more' },
              { icon: '⚡', title: '5-Minute Secure Code', desc: 'Auto-expiring codes, single-use only' },
              { icon: '🛡️', title: 'Brute-Force Protected', desc: 'Rate limiting and attempt blocking enabled' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-white/10 rounded-xl p-3 border border-white/10">
                <span className="text-lg">{item.icon}</span>
                <div>
                  <div className="text-white font-semibold text-sm">{item.title}</div>
                  <div className="text-blue-200/70 text-xs">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-blue-200/60 text-xs">256-bit Encryption · JWT Secured · ISO 27001</div>
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400 rounded-full blur-[100px]" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-400 rounded-full blur-[120px]" />
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center p-5 lg:p-10 overflow-y-auto">
        <div className="w-full max-w-lg">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl">💧</div>
            <div className="font-bold text-gray-900 text-sm">HYDROSENSE</div>
          </div>

          {/* Error / Success banners */}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-sm text-red-700">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" /><span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-sm text-green-700">
              <CheckCircle size={16} className="flex-shrink-0 text-green-500" /><span>{success}</span>
            </div>
          )}

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {['Register', 'Verify'].map((label, idx) => {
              const s = idx + 1;
              return (
                <div key={s} className={`flex items-center gap-2 ${s < step ? 'text-green-600' : s === step ? 'text-blue-600' : 'text-gray-300'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${s < step ? 'bg-green-100 border-green-400' : s === step ? 'bg-blue-100 border-blue-400' : 'bg-gray-100 border-gray-300'}`}>
                    {s < step ? '✓' : s}
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">{label}</span>
                  {idx < 1 && <div className="w-12 h-0.5 bg-gray-200 ml-2" />}
                </div>
              );
            })}
          </div>

          {/* ══════════════ STEP 1: REGISTER ══════════════ */}
          {step === 1 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Create Your Account</h2>
              <p className="text-gray-500 text-sm mb-5">Fill in your details to join the HydroSense community</p>

              {/* Device type selector */}
              <div className="mb-5">
                <label className="block text-sm font-bold text-gray-700 mb-2">What type of phone do you use?</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'smart',   icon: Smartphone, label: 'Smartphone',   sub: 'OTP via email + SMS',    color: 'blue' },
                    { key: 'feature', icon: PhoneCall,  label: 'Button Phone',  sub: 'OTP via SMS / USSD',    color: 'green' },
                  ] as const).map(({ key, icon: Icon, label, sub, color }) => (
                    <button key={key} type="button" onClick={() => setDeviceType(key)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
                        deviceType === key
                          ? color === 'blue' ? 'border-blue-500 bg-blue-50' : 'border-green-500 bg-green-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                      <Icon size={26} className={deviceType === key ? (color === 'blue' ? 'text-blue-600' : 'text-green-600') : 'text-gray-400'} />
                      <div className="text-center">
                        <div className={`font-bold text-sm ${deviceType === key ? (color === 'blue' ? 'text-blue-800' : 'text-green-800') : 'text-gray-600'}`}>{label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
                      </div>
                      {deviceType === key && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${color === 'blue' ? 'bg-blue-600' : 'bg-green-600'}`}>Selected</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name *</label>
                    <div className="relative"><User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={form.name} onChange={update('name')} required placeholder="John Doe"
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-gray-900" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Email {deviceType === 'feature' ? <span className="text-gray-400 font-normal text-xs">(optional)</span> : '*'}
                    </label>
                    <div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="email" value={form.email} onChange={update('email')} required={deviceType === 'smart'} placeholder="you@example.com"
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-gray-900" />
                    </div>
                    {deviceType === 'feature' && <p className="text-xs text-green-600 font-medium mt-1">✓ OTP sent via SMS to your phone</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number *</label>
                    <div className="relative"><Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="tel" value={form.phone} onChange={update('phone')} required placeholder="+256 700 000 000"
                        className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:bg-white text-gray-900 ${deviceType === 'feature' ? 'border-green-300 focus:ring-green-500' : 'border-gray-200 focus:ring-blue-500'}`} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">National ID</label>
                    <div className="relative"><Fingerprint size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={form.national_id} onChange={update('national_id')} placeholder="CM00000000"
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-gray-900" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">District *</label>
                    <div className="relative"><MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select value={form.district} onChange={update('district')} required
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none text-gray-900">
                        <option value="">Select district</option>
                        {districts.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Sub-County</label>
                    <input type="text" value={form.sub_county} onChange={update('sub_county')} placeholder="Sub-county"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-gray-900" />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Location/Village</label>
                    <input type="text" value={form.location} onChange={update('location')} placeholder="Village or area"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-gray-900" />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5"><Globe size={13} className="inline mr-1" />Preferred Language</label>
                    <div className="relative"><Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select value={form.language} onChange={e => { update('language')(e); setLanguage(e.target.value as LanguageCode); }}
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none text-gray-900">
                        {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.nativeName} ({l.name})</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password *</label>
                    <div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type={showPw ? 'text' : 'password'} value={form.password} onChange={update('password')} required minLength={6} placeholder="Min 6 characters"
                        className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-gray-900" />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm Password *</label>
                    <div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type={showCpw ? 'text' : 'password'} value={form.confirmPassword} onChange={update('confirmPassword')} required minLength={6} placeholder="Re-enter password"
                        className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-gray-900" />
                      <button type="button" onClick={() => setShowCpw(!showCpw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showCpw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Shield size={12} /><span>Your data is encrypted and used only for environmental reporting.</span>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60 transition-all">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Creating Account…</> : 'Create Account & Send Code'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-5">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign In</Link>
              </p>
            </>
          )}

          {/* ══════════════ STEP 2: VERIFY OTP ══════════════ */}
          {step === 2 && (
            <>
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck size={30} className="text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{lang.title}</h2>
                <p className="text-gray-500 text-sm mt-1">{lang.sub}</p>
              </div>

              {/* Delivery info cards */}
              {deliveryMethod === 'sms' ? (
                <div className="rounded-2xl overflow-hidden mb-5 shadow-lg border-4 border-gray-700">
                  <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
                    <span className="text-green-400 font-mono text-xs font-bold">HYDROSENSE USSD</span>
                    <span className="text-gray-400 font-mono text-xs">*185#</span>
                  </div>
                  <div className="bg-black px-5 py-4 font-mono space-y-2">
                    <p className="text-green-400 text-sm font-bold">Welcome to HydroSense</p>
                    <p className="text-green-300 text-xs">CON Registration Verification</p>
                    <div className="border-t border-green-900 my-2" />
                    <p className="text-green-400 text-xs">SMS code sent to:</p>
                    <p className="text-white text-sm font-bold">{phoneHint || registeredPhone.slice(0,7)+'****'}</p>
                    <p className="text-green-300 text-xs mt-2">Enter the 6-digit code below</p>
                    <p className="text-gray-500 text-xs mt-1">Or dial <span className="text-green-400">*185#</span> from your phone</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 mb-5">
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
                    <Mail size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-blue-800">📧 Email</p>
                      <p className="text-xs text-blue-700 font-semibold">{registeredEmail}</p>
                      <p className="text-xs text-blue-500 mt-1">Check inbox and spam folder</p>
                    </div>
                  </div>
                  {registeredPhone && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
                      <Phone size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-green-800">📱 SMS</p>
                        <p className="text-xs text-green-700 font-semibold">{phoneHint || registeredPhone.slice(0,7)+'****'}</p>
                        <p className="text-xs text-green-600 mt-1">Text message also sent to your phone</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Countdown timer */}
              <div className="flex justify-center mb-5">
                <CountdownTimer key={otpTimerKey} seconds={300} onExpire={() => setOtpExpired(true)} />
              </div>

              {otpExpired && (
                <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 text-center font-medium">
                  Your code has expired. Please request a new one.
                </div>
              )}

              {/* Blocked state */}
              {blockedFor > 0 && (
                <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
                  Account temporarily locked. Try again in {Math.ceil(blockedFor / 60)} minute(s).
                </div>
              )}

              {/* Attempts remaining warning */}
              {attemptsLeft < 5 && attemptsLeft > 0 && !blockedFor && (
                <div className="mb-4 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-700 text-center font-semibold">
                  ⚠️ {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before temporary lockout
                </div>
              )}

              {/* OTP form */}
              <form onSubmit={handleVerifyOTP} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 text-center">{lang.enter}</label>
                  <OtpBoxes
                    value={otp}
                    onChange={v => { setOtp(v); setOtpError(false); setError(''); }}
                    disabled={loading || (blockedFor > 0) || otpExpired}
                    error={otpError}
                  />
                </div>

                <button type="submit" disabled={loading || otp.length < 6 || (blockedFor > 0) || otpExpired}
                  className={`w-full py-3.5 rounded-xl font-bold text-white text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 transition-all ${
                    deliveryMethod === 'sms'
                      ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-green-200'
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-200'
                  }`}>
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : (
                    <><ShieldCheck size={16} /> Verify &amp; Activate Account</>
                  )}
                </button>

                {/* Resend button with cooldown */}
                <div className="text-center">
                  {resendCooldown > 0 ? (
                    <p className="text-sm text-gray-400 flex items-center justify-center gap-1.5">
                      <RefreshCw size={13} className="animate-spin" />
                      {lang.wait} {resendCooldown}s
                    </p>
                  ) : (
                    <button type="button" onClick={() => sendOtp(true)} disabled={loading}
                      className="text-sm text-blue-600 hover:underline font-semibold flex items-center gap-1.5 mx-auto disabled:opacity-50">
                      <RefreshCw size={13} /> {lang.resend}
                    </button>
                  )}
                </div>
              </form>
            </>
          )}

          <div className="flex items-center justify-center gap-4 mt-6 text-xs text-gray-400">
            <div className="flex items-center gap-1"><Shield size={11} /> JWT Secured</div>
            <div className="w-1 h-1 rounded-full bg-gray-300" />
            <span>256-bit Encryption</span>
          </div>
        </div>
      </div>
    </div>
  );
}
