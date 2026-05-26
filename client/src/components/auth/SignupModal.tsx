import { useState, useEffect, useRef } from 'react';
import { registerCitizen } from '../../api/client';
import {
  X, User, Mail, Phone, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Loader2, Shield, MailCheck,
} from 'lucide-react';

interface SignupModalProps {
  open: boolean;
  onClose: () => void;
}

type FieldErrors = Partial<Record<string, string>>;

const PASSWORD_RULES = [
  { label: 'At least 6 characters', test: (v: string) => v.length >= 6 },
  { label: 'Contains a number', test: (v: string) => /\d/.test(v) },
  { label: 'Contains a letter', test: (v: string) => /[a-zA-Z]/.test(v) },
];

function getPasswordStrength(pw: string): { score: number; label: string; color: string; width: string } {
  if (!pw) return { score: 0, label: '', color: '', width: '0%' };
  const passed = PASSWORD_RULES.filter(r => r.test(pw)).length;
  if (passed <= 1) return { score: 1, label: 'Weak', color: '#ef4444', width: '25%' };
  if (passed === 2) return { score: 2, label: 'Fair', color: '#f59e0b', width: '50%' };
  if (passed === 3 && pw.length < 10) return { score: 3, label: 'Good', color: '#10b981', width: '75%' };
  return { score: 4, label: 'Strong', color: '#059669', width: '100%' };
}

export default function SignupModal({ open, onClose }: SignupModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [error, setError] = useState('');
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    if (open) {
      setFadeIn(false);
      requestAnimationFrame(() => setFadeIn(true));
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  function resetForm() {
    setName(''); setEmail(''); setPhone(''); setPassword('');
    setConfirmPassword(''); setShowPassword(false); setShowConfirm(false);
    setErrors({}); setTouched({}); setLoading(false); setSuccess(false);
    setVerificationSent(false); setError(''); setAgreeTerms(false);
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!name.trim()) errs.name = 'Full name is required';
    else if (name.trim().length > 100) errs.name = 'Name is too long';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Invalid email format';
    if (phone && !/^[\d\s\-\+\(\)]{6,20}$/.test(phone.trim())) errs.phone = 'Invalid phone number';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters';
    else if (password.length > 128) errs.password = 'Password too long';
    if (!confirmPassword) errs.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (!agreeTerms) errs.terms = 'You must agree to continue';
    return errs;
  }

  function handleBlur(field: string) {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  }

  function getError(field: string): string | undefined {
    return touched[field] ? errors[field] : undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allTouched = { name: true, email: true, phone: true, password: true, confirmPassword: true, terms: true };
    setTouched(allTouched);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    setError('');
    try {
      await registerCitizen({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });

      setSuccess(true);
      setVerificationSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const strength = getPasswordStrength(password);
  const fieldError = getError;

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Create your HydroSense account"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        fadeIn ? 'bg-black/50 backdrop-blur-sm' : 'bg-transparent'
      }`}
      onMouseDown={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className={`w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 ${
          fadeIn ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
        }`}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white/80 hover:bg-white/25 hover:text-white transition-all"
            aria-label="Close"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-xl border border-white/20">💧</div>
            <div>
              <div className="font-bold text-white text-sm tracking-widest">HYDROSENSE</div>
              <div className="text-blue-200/80 text-[10px]">Ministry of Water &amp; Environment · Uganda</div>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mt-4">
            {verificationSent ? 'Check Your Email' : 'Create Your Account'}
          </h2>
          <p className="text-blue-100/80 text-sm mt-1">
            {verificationSent
              ? 'We sent a verification link to your email address.'
              : 'Join the HydroSense community and help protect Uganda\'s water resources.'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-8 mt-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-sm text-red-700 animate-fade-in">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Success → Verification sent screen */}
        {verificationSent ? (
          <div className="px-8 py-10 text-center">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
              <MailCheck size={40} className="text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Verify your email</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-2">
              We sent a verification email to{' '}
              <strong className="text-gray-700">{email}</strong>
            </p>
            <p className="text-gray-400 text-xs leading-relaxed mb-6">
              Click the link in the email to activate your account. The link expires in 24 hours.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 inline-flex items-center gap-2 text-xs text-amber-700 mb-6">
              <Mail size={14} />
              <span>Didn't receive it? Check your spam folder.</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4 max-h-[60vh] overflow-y-auto">

            {/* Full Name */}
            <div>
              <label htmlFor="signup-name" className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name *</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="signup-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onBlur={() => handleBlur('name')}
                  placeholder="John Doe"
                  className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:bg-white text-gray-900 transition-all ${
                    fieldError('name') ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'
                  }`}
                  autoComplete="name"
                />
              </div>
              {fieldError('name') && <p className="text-red-500 text-xs mt-1">{fieldError('name')}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address *</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  placeholder="you@example.com"
                  className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:bg-white text-gray-900 transition-all ${
                    fieldError('email') ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'
                  }`}
                  autoComplete="email"
                />
              </div>
              {fieldError('email') && <p className="text-red-500 text-xs mt-1">{fieldError('email')}</p>}
            </div>

            {/* Phone (optional) */}
            <div>
              <label htmlFor="signup-phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Phone Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="signup-phone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onBlur={() => handleBlur('phone')}
                  placeholder="+256 700 000 000"
                  className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:bg-white text-gray-900 transition-all ${
                    fieldError('phone') ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'
                  }`}
                  autoComplete="tel"
                />
              </div>
              {fieldError('phone') && <p className="text-red-500 text-xs mt-1">{fieldError('phone')}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="signup-password" className="block text-sm font-semibold text-gray-700 mb-1.5">Password *</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={() => handleBlur('password')}
                  placeholder="Create a strong password"
                  className={`w-full pl-9 pr-10 py-3 border rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:bg-white text-gray-900 transition-all ${
                    fieldError('password') ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'
                  }`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: strength.width, background: strength.color }} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: strength.color }}>{strength.label}</p>
                </div>
              )}
              {fieldError('password') && <p className="text-red-500 text-xs mt-1">{fieldError('password')}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="signup-confirm" className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm Password *</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="signup-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onBlur={() => handleBlur('confirmPassword')}
                  placeholder="Re-enter your password"
                  className={`w-full pl-9 pr-10 py-3 border rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:bg-white text-gray-900 transition-all ${
                    fieldError('confirmPassword') ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'
                  }`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldError('confirmPassword') && <p className="text-red-500 text-xs mt-1">{fieldError('confirmPassword')}</p>}
            </div>

            {/* Terms */}
            <div className="flex items-start gap-3">
              <input
                id="signup-terms"
                type="checkbox"
                checked={agreeTerms}
                onChange={e => setAgreeTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
              />
              <label htmlFor="signup-terms" className="text-xs text-gray-500 cursor-pointer select-none leading-relaxed">
                I agree to the HydroSense{' '}
                <a href="#" className="text-blue-600 underline hover:text-blue-700">Terms of Service</a>{' '}
                and{' '}
                <a href="#" className="text-blue-600 underline hover:text-blue-700">Privacy Policy</a>.
                My data will be used for environmental reporting and community water management.
              </label>
            </div>
            {touched.terms && errors.terms && <p className="text-red-500 text-xs -mt-2">{errors.terms}</p>}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Creating Account…</>
              ) : (
                'Create Account'
              )}
            </button>

            {/* Security note */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <Shield size={11} />
              <span>256-bit encrypted · JWT secured · Your data is private</span>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 bg-gray-50/50">
          <p className="text-center text-sm text-gray-500">
            {verificationSent ? (
              <>Already verified?{' '}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-blue-600 font-semibold hover:text-blue-700 hover:underline transition-all"
                >
                  Sign In
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-blue-600 font-semibold hover:text-blue-700 hover:underline transition-all"
                >
                  Sign In
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
