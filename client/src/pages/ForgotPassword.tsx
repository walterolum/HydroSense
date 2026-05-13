import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowLeft, AlertCircle, CheckCircle, Shield, Loader2, KeyRound } from 'lucide-react';
import api from '../api/client';

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState<'email' | 'otp' | 'reset' | 'done'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSuccess('A password reset OTP has been sent to your email.');
      setStep('otp');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send OTP. Check your email address.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length < 6) { setError('Please enter the complete 6-digit OTP'); return; }
    setLoading(true);
    try {
      await api.post('/auth/verify-otp', { email, otp });
      setSuccess('OTP verified. Please set your new password.');
      setStep('reset');
      setOtp('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, otp, password });
      setSuccess('Password reset successful! You can now log in with your new password.');
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = ['email', 'otp', 'reset'];
    const labels = ['Email', 'Verify', 'Reset'];
    const currentIdx = steps.indexOf(step);
    return (
      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s} className={`flex items-center gap-2 ${i < currentIdx ? 'text-green-600' : i === currentIdx ? 'text-blue-600' : 'text-gray-300'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${i < currentIdx ? 'bg-green-100 border-green-400' : i === currentIdx ? 'bg-blue-100 border-blue-400' : 'bg-gray-100 border-gray-300'}`}>
              {i < currentIdx ? '✓' : i + 1}
            </div>
            <span className="text-sm font-medium hidden sm:inline">{labels[i]}</span>
            {i < steps.length - 1 && <div className="w-10 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>
    );
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
            <h1 className="text-3xl font-bold text-white mb-3">Reset Your Password</h1>
            <p className="text-blue-100/80 text-sm leading-relaxed mb-6">
              Forgot your password? No problem. Enter your registered email address and we'll send you a one-time password (OTP) to securely reset it.
            </p>
          </div>
          <div className="space-y-4 mt-8">
            {[
              { icon: '🔐', title: 'Secure Reset Process', desc: 'OTP-verified password reset keeps your account safe' },
              { icon: '⚡', title: 'Quick & Easy', desc: 'Reset in under 2 minutes with email verification' },
              { icon: '🛡️', title: 'Your Data Stays Safe', desc: 'All transactions are encrypted end-to-end' },
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
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl">💧</div>
            <div className="font-bold text-gray-900 text-sm">HYDROSENSE</div>
          </div>

          {renderStepIndicator()}

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm text-red-700 animate-fade-in">
              <AlertCircle size={16} className="flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-sm text-green-700 animate-fade-in">
              <CheckCircle size={16} className="flex-shrink-0 text-green-500" />
              <span>{success}</span>
            </div>
          )}

          {step === 'email' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Forgot Password</h2>
              <p className="text-gray-500 text-sm mb-6">Enter your email to receive a password reset OTP</p>
              <form onSubmit={handleSendOTP} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="your@email.go.ug" required />
                  </div>
                </div>
                <button type="submit" disabled={loading || !email}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Sending OTP...</> : 'Send Reset OTP'}
                </button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Enter OTP</h2>
              <p className="text-gray-500 text-sm mb-6">Enter the 6-digit code sent to <strong>{email}</strong></p>
              <form onSubmit={handleVerifyOTP} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">OTP Code</label>
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full text-center text-2xl tracking-[0.5em] px-4 py-4 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    placeholder="000000" maxLength={6} required />
                </div>
                <button type="submit" disabled={loading || otp.length < 6}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : 'Verify OTP'}
                </button>
                <button type="button" onClick={async () => {
                  setLoading(true); setError('');
                  try { await api.post('/auth/forgot-password', { email }); setSuccess('OTP resent!'); } catch { setError('Failed to resend'); }
                  setLoading(false);
                }} disabled={loading} className="w-full text-center text-sm text-blue-600 hover:underline disabled:opacity-50">
                  Resend OTP
                </button>
              </form>
            </>
          )}

          {step === 'reset' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Set New Password</h2>
              <p className="text-gray-500 text-sm mb-6">Choose a strong password for your account</p>
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">New Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Min 6 characters" required minLength={6} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" placeholder="Re-enter password" required minLength={6} />
                  </div>
                </div>
                <button type="submit" disabled={loading || !password || !confirmPassword}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg shadow-green-200 flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Resetting...</> : 'Reset Password'}
                </button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={40} className="text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Reset Complete!</h2>
              <p className="text-gray-500 text-sm mb-6">You can now log in with your new password.</p>
              <Link to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200">
                <ArrowLeft size={16} /> Go to Login
              </Link>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 mt-6 text-xs text-gray-400">
            <div className="flex items-center gap-1"><Shield size={11} /> JWT Secured</div>
            <div className="w-1 h-1 rounded-full bg-gray-300" />
            <span>256-bit Encryption</span>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4">
            Remember your password?{' '}
            <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
