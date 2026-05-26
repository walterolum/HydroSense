import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { verifyEmail } from '../api/client';
import { MailCheck, AlertCircle, Loader2, Shield } from 'lucide-react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

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
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
          }, 2000);
        }
      } catch (err: any) {
        if (cancelled) return;
        setState('error');
        setErrorMsg(err.response?.data?.error || 'Verification failed. The link may be expired or invalid.');
      }
    })();

    return () => { cancelled = true; };
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-6 text-center">
          <div className="text-4xl mb-2">💧</div>
          <h1 className="text-xl font-bold text-white tracking-widest">HYDROSENSE</h1>
          <p className="text-blue-200/80 text-xs mt-1">Email Verification</p>
        </div>

        {/* Body */}
        <div className="px-8 py-10 text-center">
          {state === 'loading' && (
            <>
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
                <Loader2 size={40} className="text-blue-600 animate-spin" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Verifying your email</h2>
              <p className="text-gray-400 text-sm">Please wait while we verify your account...</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
                <MailCheck size={40} className="text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Email Verified!</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                Your account is now active. You will be redirected to your dashboard momentarily.
              </p>
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
                <AlertCircle size={40} className="text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Verification Failed</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">{errorMsg}</p>
              <Link
                to="/login"
                className="inline-block w-full py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-200 transition-all"
              >
                Back to Login
              </Link>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Shield size={11} />
            <span>256-bit Encrypted · JWT Secured</span>
          </div>
        </div>
      </div>
    </div>
  );
}