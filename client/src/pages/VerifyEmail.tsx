import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { verifyEmail } from '../api/client';
import { MailCheck, AlertCircle, Loader2, Shield, CheckCircle2 } from 'lucide-react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMsg('No verification token provided. Please use the link from your email.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await verifyEmail(token);
        if (cancelled) return;
        const { token: jwt, user } = res.data;
        if (jwt && user) {
          localStorage.setItem('hs_token', jwt);
          localStorage.setItem('hs_user', JSON.stringify(user));
          setState('success');
        }
      } catch (err: any) {
        if (cancelled) return;
        setState('error');
        setErrorMsg(err.response?.data?.error || 'Verification failed. The link may be expired or invalid.');
      }
    })();

    return () => { cancelled = true; };
  }, [token, navigate]);

  useEffect(() => {
    if (state !== 'success') return;
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); navigate('/dashboard', { replace: true }); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [state, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.15)] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-7 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-4 left-6 w-32 h-32 bg-blue-400 rounded-full blur-[60px]" />
            <div className="absolute -bottom-8 right-4 w-40 h-40 bg-cyan-400 rounded-full blur-[80px]" />
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-3xl mx-auto mb-3 border border-white/20 relative">💧</div>
          <h1 className="text-xl font-bold text-white tracking-widest relative">HYDROSENSE</h1>
          <p className="text-blue-200/80 text-xs mt-1 relative">Email Verification</p>
        </div>

        {/* Body */}
        <div className="px-8 py-10 text-center">
          {state === 'loading' && (
            <div className="animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center mx-auto mb-5 shadow-inner">
                <div className="relative">
                  <Loader2 size={36} className="text-blue-600 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                  </div>
                </div>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Verifying your email</h2>
              <p className="text-gray-400 text-sm">Please wait while we verify your account...</p>
              <div className="mt-6 flex justify-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                ))}
              </div>
            </div>
          )}

          {state === 'success' && (
            <div className="animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center mx-auto mb-5 shadow-inner">
                <div className="relative">
                  <CheckCircle2 size={40} className="text-green-600" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
                </div>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Email Verified!</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Your account is now active. Redirecting to your dashboard in <strong className="text-blue-600">{countdown}s</strong>.
              </p>
              <Link
                to="/dashboard"
                className="inline-block w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-200/50 transition-all active:scale-[0.98]"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {state === 'error' && (
            <div className="animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-50 to-rose-50 flex items-center justify-center mx-auto mb-5 shadow-inner">
                <AlertCircle size={40} className="text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Verification Failed</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">{errorMsg}</p>
              <Link
                to="/login"
                className="inline-block w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-200/50 transition-all active:scale-[0.98]"
              >
                Back to Sign In
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
            <Shield size={11} /><span>256-bit Encrypted</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span>JWT Secured</span>
          </div>
        </div>
      </div>
    </div>
  );
}
