import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { registerCitizen, sendOTP, verifyOTP } from '../api/client';
import { SUPPORTED_LANGUAGES, LanguageCode } from '../types/language';
import {
  AlertCircle, CheckCircle, Phone, Mail, User, MapPin, Lock, Shield,
  Fingerprint, Loader2, Eye, EyeOff, Globe, Smartphone, PhoneCall,
} from 'lucide-react';

type DeviceType = 'smart' | 'feature';

export default function CitizenRegistration() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { setLanguage } = useLanguage();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deviceType, setDeviceType] = useState<DeviceType>('smart');
  const [deliveryMethod, setDeliveryMethod] = useState<'email' | 'sms'>('email');

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    phone: '', national_id: '', community_id: '', district: '', sub_county: '',
    location: '', language: 'en',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [registeredPhone, setRegisteredPhone] = useState('');

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const districts = [
    'Kampala', 'Gulu', 'Lira', 'Moroto', 'Jinja', 'Soroti', 'Arua',
    'Mbarara', 'Mbale', 'Tororo', 'Masaka', 'Fort Portal', 'Kabale', 'Busia', 'Adjumani',
  ];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }
    if (deviceType === 'feature' && !form.phone) {
      setError('Phone number is required for feature phone registration');
      setLoading(false);
      return;
    }

    try {
      const res = await registerCitizen({
        name: form.name, email: form.email, password: form.password,
        phone: form.phone, national_id: form.national_id, community_id: form.community_id,
        district: form.district, sub_county: form.sub_county, location: form.location,
        language: form.language, device_type: deviceType,
      });

      setRegisteredEmail(form.email);
      setRegisteredPhone(form.phone);

      // Send OTP via the appropriate channel
      const otpRes = await (window.fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          device_type: deviceType,
          phone: form.phone,
          purpose: 'registration',
        }),
      }).then(r => r.json()));

      setDeliveryMethod(otpRes.delivery_method || (deviceType === 'feature' ? 'sms' : 'email'));
      setSuccess(otpRes.message || 'OTP sent!');
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await verifyOTP(registeredEmail, otp);
      if (res.data.verified) {
        if (res.data.token && res.data.user) {
          sessionStorage.setItem('hs_token', res.data.token);
          sessionStorage.setItem('hs_user', JSON.stringify(res.data.user));
        }
        setSuccess('Verified! Redirecting to login…');
        setTimeout(() => navigate('/login'), 1500);
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const resendOTP = async () => {
    setLoading(true);
    setError('');
    try {
      await window.fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail, device_type: deviceType, phone: registeredPhone, purpose: 'registration' }),
      });
      setSuccess('OTP resent!');
    } catch { setError('Failed to resend OTP'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-700 relative overflow-hidden p-10 flex-col justify-between">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl border border-white/20">💧</div>
            <div>
              <div className="font-bold text-white text-lg">HYDROSENSE</div>
              <div className="text-blue-200 text-xs">Ministry of Water &amp; Environment</div>
            </div>
          </div>
          <div className="max-w-md">
            <h1 className="text-3xl font-bold text-white mb-3">Community Member Registration</h1>
            <p className="text-blue-100/80 text-sm leading-relaxed mb-6">
              Join the HydroSense community to report environmental incidents, track water quality issues,
              and help protect your community's water resources.
            </p>
          </div>
          <div className="space-y-4 mt-8">
            {[
              { icon: '📱', title: 'Smartphone Users', desc: 'OTP sent to your email address' },
              { icon: '📞', title: 'Button Phone Users', desc: 'OTP sent via SMS + USSD code delivery' },
              { icon: '🛡️', title: 'Secure & Private', desc: 'Your data is encrypted and protected' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-white/10 rounded-xl p-3 border border-white/10">
                <span className="text-xl">{item.icon}</span>
                <div>
                  <div className="text-white font-semibold text-sm">{item.title}</div>
                  <div className="text-blue-200/70 text-xs">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-blue-200/60 text-xs">
          Protected by 256-bit encryption · JWT Secured · ISO 27001 Compliant
        </div>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400 rounded-full blur-[100px]" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-400 rounded-full blur-[120px]" />
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-lg">

          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl">💧</div>
            <div className="font-bold text-gray-900 text-sm">HYDROSENSE</div>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm text-red-700">
              <AlertCircle size={16} className="flex-shrink-0 text-red-500" /><span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-sm text-green-700">
              <CheckCircle size={16} className="flex-shrink-0 text-green-500" /><span>{success}</span>
            </div>
          )}

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map(s => (
              <div key={s} className={`flex items-center gap-2 ${s < step ? 'text-green-600' : s === step ? 'text-blue-600' : 'text-gray-300'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${s < step ? 'bg-green-100 border-green-400' : s === step ? 'bg-blue-100 border-blue-400' : 'bg-gray-100 border-gray-300'}`}>
                  {s < step ? '✓' : s}
                </div>
                <span className="text-sm font-medium hidden sm:inline">{s === 1 ? 'Register' : 'Verify Code'}</span>
                {s < 2 && <div className="w-12 h-0.5 bg-gray-200 ml-2" />}
              </div>
            ))}
          </div>

          {/* ══════════════ STEP 1 ══════════════ */}
          {step === 1 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Create Your Account</h2>
              <p className="text-gray-500 text-sm mb-5">Fill in your details to become a community member</p>

              {/* ── Device type selector ── */}
              <div className="mb-5">
                <label className="block text-sm font-bold text-gray-700 mb-2">What type of phone do you use?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeviceType('smart')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
                      deviceType === 'smart'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Smartphone size={28} className={deviceType === 'smart' ? 'text-blue-600' : 'text-gray-400'} />
                    <div className="text-center">
                      <div className="font-bold text-sm">Smartphone</div>
                      <div className="text-xs mt-0.5 opacity-70">OTP sent to email</div>
                    </div>
                    {deviceType === 'smart' && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">Selected</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceType('feature')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
                      deviceType === 'feature'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <PhoneCall size={28} className={deviceType === 'feature' ? 'text-green-600' : 'text-gray-400'} />
                    <div className="text-center">
                      <div className="font-bold text-sm">Button Phone</div>
                      <div className="text-xs mt-0.5 opacity-70">OTP sent via SMS</div>
                    </div>
                    {deviceType === 'feature' && (
                      <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-[10px] font-bold">Selected</span>
                    )}
                  </button>
                </div>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name *</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={form.name} onChange={update('name')} required
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        placeholder="John Doe" />
                    </div>
                  </div>

                  {/* Email — optional label for feature phone */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Email Address {deviceType === 'feature' ? <span className="text-gray-400 font-normal">(optional)</span> : '*'}
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="email" value={form.email} onChange={update('email')}
                        required={deviceType === 'smart'}
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        placeholder="you@example.com" />
                    </div>
                    {deviceType === 'feature' && (
                      <p className="text-xs text-green-600 font-medium mt-1">✓ OTP will be sent via SMS to your phone</p>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Phone Number {deviceType === 'feature' ? '*' : '*'}
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="tel" value={form.phone} onChange={update('phone')} required
                        className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:bg-white ${
                          deviceType === 'feature'
                            ? 'border-green-300 focus:ring-green-500'
                            : 'border-gray-200 focus:ring-blue-500'
                        }`}
                        placeholder="+256 700 000 000" />
                    </div>
                    {deviceType === 'feature' && (
                      <p className="text-xs text-green-600 font-medium mt-1">✓ Verification code will be sent to this number</p>
                    )}
                  </div>

                  {/* National ID */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">National ID</label>
                    <div className="relative">
                      <Fingerprint size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={form.national_id} onChange={update('national_id')}
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        placeholder="CM00000000" />
                    </div>
                  </div>

                  {/* Community ID */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Community ID</label>
                    <input type="text" value={form.community_id} onChange={update('community_id')}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                      placeholder="Optional" />
                  </div>

                  {/* District */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">District *</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select value={form.district} onChange={update('district')} required
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none">
                        <option value="">Select district</option>
                        {districts.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Sub-county */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Sub-County</label>
                    <input type="text" value={form.sub_county} onChange={update('sub_county')}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                      placeholder="Sub-county" />
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Location/Area</label>
                    <input type="text" value={form.location} onChange={update('location')}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                      placeholder="Village or area" />
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      <Globe size={14} className="inline mr-1" />Preferred Language
                    </label>
                    <div className="relative">
                      <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select value={form.language}
                        onChange={e => { update('language')(e); setLanguage(e.target.value as LanguageCode); }}
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none">
                        {SUPPORTED_LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>{l.nativeName} ({l.name})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password *</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={update('password')} required minLength={6}
                        className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        placeholder="Min 6 characters" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm Password *</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={update('confirmPassword')} required minLength={6}
                        className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        placeholder="Re-enter password" />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                  <Shield size={12} />
                  <span>Your data is encrypted and used only for environmental reporting.</span>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60 transition-all">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : 'Create Account'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign In</Link>
              </p>
            </>
          )}

          {/* ══════════════ STEP 2 ══════════════ */}
          {step === 2 && (
            <>
              {deliveryMethod === 'sms' ? (
                /* ── USSD / Button Phone OTP UI ── */
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Verify Your Phone</h2>
                  <p className="text-gray-500 text-sm mb-5">
                    A verification code was sent via SMS to{' '}
                    <strong>{registeredPhone ? registeredPhone.slice(0, 7) + '****' : 'your phone'}</strong>
                  </p>

                  {/* USSD terminal display */}
                  <div className="rounded-2xl overflow-hidden mb-5 shadow-lg border-4 border-gray-700">
                    <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
                      <span className="text-green-400 font-mono text-xs font-bold">HYDROSENSE USSD</span>
                      <span className="text-gray-400 font-mono text-xs">*185#</span>
                    </div>
                    <div className="bg-black px-5 py-5 font-mono min-h-[140px]">
                      <p className="text-green-400 text-sm font-bold mb-2">Welcome to HydroSense</p>
                      <p className="text-green-300 text-xs mb-1">CON Registration Verification</p>
                      <div className="border-t border-green-900 my-2" />
                      <p className="text-green-400 text-xs mb-1">Your SMS code has been sent to</p>
                      <p className="text-white text-sm font-bold mb-2">
                        {registeredPhone ? registeredPhone.slice(0, 7) + '****' : 'your phone'}
                      </p>
                      <p className="text-green-300 text-xs">Enter code below to verify your account</p>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-green-400 text-xs">Reply:</span>
                        <span className="text-yellow-300 text-xs font-bold">Enter the 6-digit code</span>
                      </div>
                      <p className="text-gray-500 text-xs mt-3">Or dial <span className="text-green-400">*185#</span> from your phone</p>
                    </div>
                  </div>
                </>
              ) : (
                /* ── Smartphone / Email OTP UI ── */
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Check Your Email</h2>
                  <p className="text-gray-500 text-sm mb-5">
                    We sent a 6-digit code to{' '}
                    <strong className="text-gray-700">{registeredEmail}</strong>
                  </p>

                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
                    <Mail size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-blue-800">Email sent</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        Open your email app and look for a message from HydroSense.
                        Check your spam folder if you don't see it.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* OTP input — shared for both */}
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    {deliveryMethod === 'sms' ? 'Enter SMS Code' : 'Enter OTP Code'}
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={`w-full text-center text-3xl tracking-[0.6em] px-4 py-4 border-2 rounded-xl font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 transition-all ${
                      deliveryMethod === 'sms'
                        ? 'border-green-300 bg-gray-50 focus:ring-green-400 focus:border-green-400'
                        : 'border-blue-200 bg-gray-50 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                    placeholder="000000"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </div>

                <button type="submit" disabled={loading || otp.length < 6}
                  className={`w-full py-3.5 rounded-xl font-bold text-white text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 transition-all ${
                    deliveryMethod === 'sms'
                      ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-green-200'
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-200'
                  }`}>
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : 'Verify & Activate Account'}
                </button>

                <button type="button" onClick={resendOTP} disabled={loading}
                  className="w-full text-center text-sm text-gray-500 hover:text-blue-600 hover:underline disabled:opacity-50 transition-colors">
                  Didn't receive it? Resend code
                </button>
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
