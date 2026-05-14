import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { registerCitizen, sendOTP, verifyOTP } from '../api/client';
import { SUPPORTED_LANGUAGES, LanguageCode } from '../types/language';
import { AlertCircle, CheckCircle, Phone, Mail, User, MapPin, Lock, Shield, Fingerprint, Loader2, Eye, EyeOff, Globe } from 'lucide-react';

export default function CitizenRegistration() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { setLanguage } = useLanguage();

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    phone: '', national_id: '', community_id: '', district: '', sub_county: '',
    location: '', language: 'en'
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const districts = [
    'Kampala', 'Gulu', 'Lira', 'Moroto', 'Jinja', 'Soroti', 'Arua',
    'Mbarara', 'Mbale', 'Tororo', 'Masaka', 'Fort Portal', 'Kabale', 'Busia', 'Adjumani'
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

    try {
      const res = await registerCitizen({
        name: form.name, email: form.email, password: form.password,
        phone: form.phone, national_id: form.national_id, community_id: form.community_id,
        district: form.district, sub_county: form.sub_county, location: form.location,
        language: form.language
      });
      setSuccess(res.data.message || 'Registration successful!');
      setRegisteredEmail(form.email);

      await sendOTP(form.email);
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
        setSuccess('Email verified! You can now log in.');
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

  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-700 relative overflow-hidden p-10 flex-col justify-between">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl border border-white/20">💧</div>
            <div>
              <div className="font-bold text-white text-lg">HYDROSENSE</div>
              <div className="text-blue-200 text-xs">Ministry of Water & Environment</div>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-3xl font-bold text-white mb-3">Community Member Registration</h1>
            <p className="text-blue-100/80 text-sm leading-relaxed mb-6">
              Join the HydroSense community to report environmental incidents, track water quality issues, 
              and help protect your community's water resources. Your voice matters.
            </p>
          </div>

          <div className="space-y-4 mt-8">
            {[
              { icon: '📱', title: 'Multi-Channel Reporting', desc: 'Report via SMS, WhatsApp, email, voice, or app' },
              { icon: '🔍', title: 'Track Your Reports', desc: 'Real-time status updates from submission to resolution' },
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
          Protected by 256-bit encryption &middot; JWT Secured &middot; ISO 27001 Compliant
        </div>

        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400 rounded-full blur-[100px]" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-400 rounded-full blur-[120px]" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-lg">

          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl">💧</div>
            <div className="font-bold text-gray-900 text-sm">HYDROSENSE</div>
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

          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map(s => (
              <div key={s} className={`flex items-center gap-2 ${s < step ? 'text-green-600' : s === step ? 'text-blue-600' : 'text-gray-300'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${s < step ? 'bg-green-100 border-green-400' : s === step ? 'bg-blue-100 border-blue-400' : 'bg-gray-100 border-gray-300'}`}>
                  {s < step ? '✓' : s}
                </div>
                <span className="text-sm font-medium hidden sm:inline">{s === 1 ? 'Register' : 'Verify OTP'}</span>
                {s < 2 && <div className="w-12 h-0.5 bg-gray-200 ml-2" />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Create Your Account</h2>
              <p className="text-gray-500 text-sm mb-6">Fill in your details to become a community member</p>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name *</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={form.name} onChange={update('name')} className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="John Doe" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address *</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="email" value={form.email} onChange={update('email')} className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="you@example.com" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number *</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="tel" value={form.phone} onChange={update('phone')} className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="+256 700 000 000" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">National ID</label>
                    <div className="relative">
                      <Fingerprint size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={form.national_id} onChange={update('national_id')} className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="CM00000000" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Community ID</label>
                    <input type="text" value={form.community_id} onChange={update('community_id')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Optional community ID" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">District *</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select value={form.district} onChange={update('district')} className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none" required>
                        <option value="">Select district</option>
                        {districts.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Sub-County</label>
                    <input type="text" value={form.sub_county} onChange={update('sub_county')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Sub-county" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Location/Area</label>
                    <input type="text" value={form.location} onChange={update('location')} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Village or area" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5"><Globe size={14} className="inline mr-1" />Preferred Language</label>
                    <div className="relative">
                      <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select value={form.language} onChange={e => { update('language')(e); setLanguage(e.target.value as LanguageCode); }}
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none">
                        {SUPPORTED_LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>{l.nativeName} ({l.name})</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Choose your preferred language for using the platform</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password *</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={update('password')} className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Min 6 characters" required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm Password *</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={update('confirmPassword')} className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Re-enter password" required minLength={6} />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                  <Shield size={12} />
                  <span>Your data is encrypted and will only be used for environmental reporting purposes.</span>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : 'Create Account'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign In</Link>
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Verify Your Email</h2>
              <p className="text-gray-500 text-sm mb-6">
                We've sent a 6-digit OTP to your phone and email (<strong>{registeredEmail}</strong>). Please enter it below.
              </p>

              <form onSubmit={handleVerifyOTP} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Enter OTP Code</label>
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full text-center text-2xl tracking-[0.5em] px-4 py-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    placeholder="000000" maxLength={6} required />
                </div>

                <button type="submit" disabled={loading || otp.length < 6}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg shadow-green-200 flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : 'Verify OTP'}
                </button>

                <button type="button" onClick={async () => {
                  setLoading(true);
                  try { await sendOTP(registeredEmail); setSuccess('OTP resent!'); } catch { setError('Failed to resend'); }
                  setLoading(false);
                }} disabled={loading}
                  className="w-full text-center text-sm text-blue-600 hover:underline disabled:opacity-50">
                  Resend OTP
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
