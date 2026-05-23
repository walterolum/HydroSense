import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Shield, AlertCircle, CheckCircle, Loader2, Smartphone } from 'lucide-react';
import api from '../api/client';

export default function OTPVerification() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';

  const [otp, setOtp] = useState('');
  const [localOtpDisplay, setLocalOtpDisplay] = useState(searchParams.get('otp_display') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (!email) navigate('/login');
  }, [email, navigate]);

  useEffect(() => {
    if (timer > 0 && !canResend) {
      const t = setInterval(() => setTimer(p => p - 1), 1000);
      return () => clearInterval(t);
    }
    if (timer === 0) setCanResend(true);
  }, [timer, canResend]);

  useEffect(() => {
    const otpParam = searchParams.get('otp_display') || '';
    if (otpParam) {
      setOtp(otpParam);
      setLocalOtpDisplay(otpParam);
    }
  }, [searchParams]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length < 6) { setError('Please enter the complete 6-digit code'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email, otp });
      if (res.data.verified) {
        if (res.data.token && res.data.user) {
          sessionStorage.setItem('hs_token', res.data.token);
          sessionStorage.setItem('hs_user', JSON.stringify(res.data.user));
        }
        setSuccess('Verification successful!');
        setTimeout(() => navigate('/dashboard'), 1500);
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/send-otp', { email });
      setSuccess(res.data.message || 'OTP resent successfully!');
      if (res.data.otp_display) {
        setOtp(res.data.otp_display);
        setLocalOtpDisplay(res.data.otp_display);
      } else {
        setLocalOtpDisplay('');
      }
      setTimer(60);
      setCanResend(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend OTP');
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
            <h1 className="text-3xl font-bold text-white mb-3">Two-Factor Verification</h1>
            <p className="text-blue-100/80 text-sm leading-relaxed mb-6">
              We've sent a one-time verification code to your email. This extra security step ensures your account stays protected.
            </p>
          </div>
          <div className="space-y-4 mt-8">
            {[
              { icon: '🛡️', title: 'Extra Security Layer', desc: 'Two-factor authentication protects against unauthorised access' },
              { icon: '⚡', title: 'Quick Verification', desc: 'Enter the 6-digit code sent to your registered email' },
              { icon: '🔐', title: 'Session Secured', desc: 'Your session will be encrypted and securely managed' },
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
          Protected by 256-bit encryption &middot; MFA Enabled &middot; ISO 27001 Compliant
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

          {localOtpDisplay && (
            <div className="mb-5 px-4 py-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm animate-fade-in">
              <div className="flex gap-2.5 items-start">
                <span className="text-lg mt-0.5">🔧</span>
                <div>
                  <strong className="font-bold block mb-1">Developer Mode / Mock Delivery</strong>
                  No SMS or Email delivery provider is configured. Use the verification code below to activate your account:
                  <div className="mt-3 font-mono text-2xl font-extrabold tracking-widest text-center bg-white border border-amber-100 rounded-lg py-2 select-all">
                    {localOtpDisplay}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <Smartphone size={32} className="text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Verify Your Identity</h2>
              <p className="text-gray-500 text-sm">
                Enter the 6-digit code sent to<br />
                <strong className="text-gray-700">{email || 'your email'}</strong>
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 text-center">One-Time Password (OTP)</label>
                <input
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full text-center text-3xl tracking-[0.5em] px-4 py-4 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono"
                  placeholder="000000"
                  maxLength={6}
                  required
                  autoFocus
                />
                <p className="text-center text-xs text-gray-400 mt-2">
                  {canResend
                    ? 'Didn\'t receive the code?'
                    : `Resend code in ${timer}s`
                  }
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                ) : (
                  'Verify & Continue'
                )}
              </button>

              {canResend && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="w-full text-center text-sm text-blue-600 hover:underline disabled:opacity-50 py-2"
                >
                  Resend OTP
                </button>
              )}
            </form>
          </div>

          <div className="flex items-center justify-center gap-4 mt-6 text-xs text-gray-400">
            <div className="flex items-center gap-1"><Shield size={11} /> MFA Enabled</div>
            <div className="w-1 h-1 rounded-full bg-gray-300" />
            <span>256-bit Encryption</span>
            <div className="w-1 h-1 rounded-full bg-gray-300" />
            <span>OTP Valid for 10 min</span>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4">
            <Link to="/login" className="text-blue-600 hover:underline">Back to Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
