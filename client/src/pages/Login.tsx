import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, AlertCircle, Shield, Wifi, UserPlus } from 'lucide-react';

const slides = [
  {
    icon: '💧',
    title: 'Smart Water Infrastructure',
    desc: 'Monitor 51+ water points across 15 districts with live IoT sensor data and real-time alerts.',
  },
  {
    icon: '🌤️',
    title: 'Climate Early Warning System',
    desc: 'AI-powered drought prediction, flood risk analysis, and rainfall forecasting for vulnerable communities.',
  },
  {
    icon: '👥',
    title: 'Community-Driven Governance',
    desc: 'Empower local water committees with transparent data, incident reporting, and collaborative tools.',
  },
];

const features = [
  {
    icon: '📡',
    text: '51 Water Points',
    desc: 'Monitor all 51 water access points across 15 districts. Track status, yield, beneficiaries, and maintenance history in real-time.',
    stat: '51 Active Sites',
  },
  {
    icon: '🔬',
    text: 'Live IoT Sensors',
    desc: 'Continuous data from rainfall, flow rate, water level, quality, and solar power sensors deployed across rural Uganda.',
    stat: '7 Sensor Types',
  },
  {
    icon: '🤖',
    text: 'AI Forecasting',
    desc: '6-month predictive models for drought risk, water demand, and infrastructure failure — powered by machine learning.',
    stat: '6-Month Outlook',
  },
  {
    icon: '🗺️',
    text: 'GIS Mapping',
    desc: 'Interactive spatial maps showing water point locations, health incident clusters, flood risk zones, and district coverage.',
    stat: '15 Districts',
  },
  {
    icon: '🏥',
    text: 'Health Surveillance',
    desc: 'Disease outbreak tracking linked to water source quality, with WHO-compliant reporting and automatic contamination alerts.',
    stat: 'WHO Standards',
  },
  {
    icon: '⚡',
    text: 'Real-time Alerts',
    desc: 'Instant push notifications for water point failures, contamination events, drought warnings, and climate emergencies.',
    stat: '4 Severity Levels',
  },
];

const bubbles = [
  { size: 28, left: '8%',  delay: '0s',   duration: '7s'   },
  { size: 44, left: '22%', delay: '1.2s', duration: '9s'   },
  { size: 20, left: '40%', delay: '0.6s', duration: '6s'   },
  { size: 36, left: '58%', delay: '2.5s', duration: '8s'   },
  { size: 52, left: '74%', delay: '1.8s', duration: '10s'  },
  { size: 24, left: '88%', delay: '3.2s', duration: '7.5s' },
  { size: 16, left: '30%', delay: '4s',   duration: '6.5s' },
  { size: 40, left: '65%', delay: '0.3s', duration: '8.5s' },
];

/* ─── Wave layer definitions ─── */
const waveLayers = [
  {
    // layer 1 — deepest, slowest, at very bottom
    height: 70,
    bottom: '0px',
    fill: 'rgba(255,255,255,0.07)',
    duration: '14s',
    reverse: false,
    H: 40,
  },
  {
    // layer 2 — second wave, slightly above
    height: 55,
    bottom: '20px',
    fill: 'rgba(103,232,249,0.06)',
    duration: '10s',
    reverse: true,
    H: 28,
  },
  {
    // layer 3 — faster, tertiary wave
    height: 45,
    bottom: '40px',
    fill: 'rgba(14,90,180,0.09)',
    duration: '7s',
    reverse: false,
    H: 20,
  },
  {
    // layer 4 — mid-panel accent wave
    height: 50,
    bottom: '40%',
    fill: 'rgba(56,189,248,0.05)',
    duration: '18s',
    reverse: true,
    H: 30,
  },
];

/* Build a repeating sinusoidal SVG path. H = peak amplitude, viewBox height = 120. */
function makeWavePath(H: number): string {
  // Two full repeats so the 200%-wide SVG tiles seamlessly when scrolled by 50%
  const segs = [0, 900, 1800, 2700].map(x =>
    `M${x},${H} C${x + 300},0 ${x + 600},${H * 2} ${x + 900},${H}`
  );
  return `${segs.join(' ')} L3600,120 L0,120 Z`;
}

/* ─── Caustic blob definitions ─── */
const causticBlobs = [
  { w: 320, h: 260, top: '-8%',  left: '-12%', blur: 70, color: 'rgba(14,90,180,0.4)',   delay: '0s',    duration: '18s' },
  { w: 220, h: 220, top: '15%',  left: '55%',  blur: 55, color: 'rgba(0,180,220,0.3)',   delay: '3s',    duration: '14s' },
  { w: 280, h: 200, top: '48%',  left: '10%',  blur: 65, color: 'rgba(56,189,248,0.25)', delay: '6s',    duration: '20s' },
  { w: 180, h: 180, top: '65%',  left: '70%',  blur: 40, color: 'rgba(14,90,180,0.35)',  delay: '1.5s',  duration: '16s' },
  { w: 240, h: 280, top: '30%',  left: '35%',  blur: 80, color: 'rgba(0,180,220,0.2)',   delay: '9s',    duration: '22s' },
  { w: 160, h: 160, top: '80%',  left: '20%',  blur: 45, color: 'rgba(56,189,248,0.3)',  delay: '4.5s',  duration: '12s' },
];

/* ─── Horizontal stream line definitions ─── */
const streamLines = [
  { top: '18%', width: '45%', left:  '5%', delay: '0s',    duration: '6s'  },
  { top: '33%', width: '30%', left: '15%', delay: '2.2s',  duration: '8s'  },
  { top: '52%', width: '55%', left:  '0%', delay: '0.8s',  duration: '5.5s'},
  { top: '68%', width: '38%', left: '20%', delay: '4s',    duration: '7s'  },
  { top: '82%', width: '60%', left:  '3%', delay: '1.5s',  duration: '9s'  },
];

/* ─── Light ray shaft definitions ─── */
const lightRays = [
  { left: '18%', width: '3px', rotate: '18deg', duration: '5s',  delay: '0s'   },
  { left: '48%', width: '2px', rotate: '22deg', duration: '7s',  delay: '2.5s' },
  { left: '76%', width: '4px', rotate: '15deg', duration: '4.5s',delay: '1.2s' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [activeFeature, setActiveFeature] = useState<number | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const locationState = useLocation().state as { from?: string } | null;

  useEffect(() => {
    const timer = setInterval(() => setActiveSlide(s => (s + 1) % slides.length), 4500);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setLoginSuccess(true);
      const redirectTo = locationState?.from || '/dashboard';
      setTimeout(() => navigate(redirectTo, { replace: true }), 800);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials. Please check your email and password.');
      setLoading(false);
    }
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError('');
  };

  return (
    <div className="min-h-screen flex overflow-hidden">

      {/* ══════════════════════════════════════════════
          LEFT PANEL — Water / Branding Section
      ══════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[44%] relative flex-col overflow-hidden">

        {/* ── Deep ocean gradient base ── */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#020d1f] via-[#062040] to-[#0a3a70]" />

        {/* ── Radial glow accents ── */}
        <div
          className="absolute rounded-full blur-3xl"
          style={{ width: 420, height: 420, top: '-10%', left: '-15%', background: 'radial-gradient(circle, rgba(14,90,180,0.35) 0%, transparent 70%)' }}
        />
        <div
          className="absolute rounded-full blur-3xl animate-pulse-slow"
          style={{ width: 300, height: 300, bottom: '20%', right: '-5%', background: 'radial-gradient(circle, rgba(0,180,220,0.2) 0%, transparent 70%)', animationDelay: '2s' }}
        />
        <div
          className="absolute rounded-full blur-2xl animate-pulse-slow"
          style={{ width: 200, height: 200, top: '55%', left: '30%', background: 'radial-gradient(circle, rgba(56,189,248,0.15) 0%, transparent 70%)', animationDelay: '1s' }}
        />

        {/* ════════════════════════════════════════════
            NEW WATER-FLOW EFFECTS
        ════════════════════════════════════════════ */}

        {/* 1. Water shimmer overlay — full-panel diagonal shimmer */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, transparent 40%, rgba(103,232,249,0.04) 50%, transparent 60%)',
            backgroundSize: '200% 200%',
            animation: 'shimmerWave 8s ease-in-out infinite',
          }}
        />

        {/* 2. Caustic light blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {causticBlobs.map((blob, i) => (
            <div
              key={`caustic-${i}`}
              className="absolute"
              style={{
                width: blob.w,
                height: blob.h,
                top: blob.top,
                left: blob.left,
                borderRadius: '50%',
                background: blob.color,
                filter: `blur(${blob.blur}px)`,
                animation: `causticDrift ${blob.duration} ${blob.delay} ease-in-out infinite`,
              }}
            />
          ))}
        </div>

        {/* 3. Light ray shafts — diagonal slow-pulsing columns */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {lightRays.map((ray, i) => (
            <div
              key={`ray-${i}`}
              className="absolute top-0"
              style={{
                left: ray.left,
                width: ray.width,
                height: '100%',
                background: 'rgba(103,232,249,0.06)',
                filter: 'blur(3px)',
                transform: `rotate(${ray.rotate})`,
                transformOrigin: 'top center',
                animation: `rayPulse ${ray.duration} ${ray.delay} ease-in-out infinite`,
              }}
            />
          ))}
        </div>

        {/* 4. Horizontal stream lines */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {streamLines.map((line, i) => (
            <div
              key={`stream-${i}`}
              className="absolute"
              style={{
                top: line.top,
                left: line.left,
                width: line.width,
                height: '1px',
                background: 'linear-gradient(to right, transparent, rgba(103,232,249,0.3), transparent)',
                animation: `streamPass ${line.duration} ${line.delay} linear infinite`,
              }}
            />
          ))}
        </div>

        {/* 5. Enhanced floating bubbles — bubbleRise with horizontal wobble */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {bubbles.map((b, i) => (
            <div
              key={`bubble-${i}`}
              className="absolute rounded-full border border-white/20"
              style={{
                width: b.size,
                height: b.size,
                left: b.left,
                bottom: '-8%',
                background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.04))',
                animation: `bubbleRise ${b.duration} ${b.delay} ease-in infinite`,
              }}
            />
          ))}
        </div>

        {/* 6. Animated scrolling wave layers — 4 layers at different heights */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {waveLayers.map((layer, i) => (
            <div
              key={`wave-layer-${i}`}
              className="absolute left-0 right-0"
              style={{ bottom: layer.bottom, height: layer.height }}
            >
              {/* 200%-wide SVG scrolls horizontally to create seamless loop */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox={`0 0 3600 120`}
                preserveAspectRatio="none"
                style={{
                  width: '200%',
                  height: '100%',
                  display: 'block',
                  animation: layer.reverse
                    ? `waveScrollReverse ${layer.duration} linear infinite`
                    : `waveScroll ${layer.duration} linear infinite`,
                }}
              >
                <path d={makeWavePath(layer.H)} fill={layer.fill} />
              </svg>
            </div>
          ))}
        </div>

        {/* ── Content (z-10, above all effects) ── */}
        <div className="relative z-10 flex flex-col h-full px-9 py-8">

          {/* Logo / Branding */}
          <div className="flex items-center gap-3 mb-auto">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)' }}
            >
              💧
            </div>
            <div>
              <div className="font-bold text-white text-base leading-tight tracking-widest">HYDROSENSE</div>
              <div className="text-blue-300/80 text-xs">Ministry of Water & Environment · Uganda</div>
            </div>
          </div>

          {/* Central Glassmorphism Card */}
          <div
            className="rounded-3xl p-7 my-8 shadow-2xl"
            style={{
              background: 'rgba(255,255,255,0.09)',
              border: '1px solid rgba(255,255,255,0.16)',
              backdropFilter: 'blur(16px)',
            }}
          >
            {/* SDG 6 Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-blue-100 mb-5"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <span>Clean Water &amp; Sanitation</span>
            </div>

            <h1 className="text-3xl font-extrabold text-white mb-2 leading-tight tracking-tight">
              Climate-Resilient<br />
              <span style={{ color: '#67e8f9' }}>Rural Water System</span>
            </h1>
            <p className="text-blue-200/90 text-sm leading-relaxed mb-6">
              A national smart water governance platform integrating IoT monitoring, climate forecasting,
              and community engagement for sustainable water security across Uganda.
            </p>

            {/* Animated slide content */}
            <div className="min-h-[64px] mb-5">
              <div className="flex items-start gap-3 transition-all duration-500">
                <span className="text-3xl leading-none mt-0.5">{slides[activeSlide].icon}</span>
                <div>
                  <div className="text-white font-semibold text-sm">{slides[activeSlide].title}</div>
                  <div className="text-blue-200/80 text-xs mt-1 leading-relaxed">{slides[activeSlide].desc}</div>
                </div>
              </div>
            </div>

            {/* Slider dots */}
            <div className="flex items-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSlide(i)}
                  className="rounded-full transition-all duration-300"
                  style={{
                    height: 5,
                    width: i === activeSlide ? 28 : 8,
                    background: i === activeSlide ? '#67e8f9' : 'rgba(255,255,255,0.3)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Feature grid — interactive buttons */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {features.map((f, i) => {
              const isActive = activeFeature === i;
              return (
                <button
                  key={f.text}
                  type="button"
                  onClick={() => setActiveFeature(isActive ? null : i)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all duration-200 active:scale-95 focus:outline-none"
                  style={{
                    background: isActive
                      ? 'rgba(103,232,249,0.18)'
                      : 'rgba(255,255,255,0.07)',
                    border: isActive
                      ? '1px solid rgba(103,232,249,0.55)'
                      : '1px solid rgba(255,255,255,0.12)',
                    boxShadow: isActive
                      ? '0 0 12px rgba(103,232,249,0.2)'
                      : 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.13)';
                      (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(255,255,255,0.28)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
                      (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(255,255,255,0.12)';
                    }
                  }}
                >
                  <span className="text-base leading-none flex-shrink-0">{f.icon}</span>
                  <span
                    className="text-xs font-semibold leading-tight"
                    style={{ color: isActive ? '#67e8f9' : 'rgba(219,234,254,0.9)' }}
                  >
                    {f.text}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Feature description panel — expands when a button is clicked */}
          <div
            className="mb-4 overflow-hidden transition-all duration-300 rounded-xl"
            style={{
              maxHeight: activeFeature !== null ? '100px' : '0px',
              opacity: activeFeature !== null ? 1 : 0,
            }}
          >
            {activeFeature !== null && (
              <div
                className="px-4 py-3 rounded-xl"
                style={{
                  background: 'rgba(103,232,249,0.1)',
                  border: '1px solid rgba(103,232,249,0.25)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-cyan-300">
                    {features[activeFeature].icon} {features[activeFeature].text}
                  </span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(103,232,249,0.2)', color: '#67e8f9' }}
                  >
                    {features[activeFeature].stat}
                  </span>
                </div>
                <p className="text-xs text-blue-200/80 leading-relaxed">
                  {features[activeFeature].desc}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-blue-400/70">
            <span>© 2026 HYDROSENSE · Uganda MWE</span>
            <div className="flex items-center gap-1.5">
              <Shield size={11} />
              <span>ISO 27001 Secured</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          RIGHT PANEL — Authentication Form
      ══════════════════════════════════════════════ */}
      <div className="flex-1 flex items-center justify-center bg-white p-6 lg:p-10 xl:p-14">
        <div className="w-full max-w-[420px] login-form-animate">

          {/* Mobile logo (hidden on desktop) */}
          <div className="flex items-center gap-3 mb-7 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl shadow">💧</div>
            <div>
              <div className="font-bold text-gray-900 text-sm tracking-widest">HYDROSENSE</div>
              <div className="text-gray-400 text-xs">Climate-Resilient Rural Water System</div>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Welcome back</h2>
            <p className="text-gray-400 text-sm mt-1">Sign in to access your dashboard</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-sm text-red-700 animate-fade-in">
              <AlertCircle size={16} className="flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Success overlay */}
          {loginSuccess && (
            <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3 text-sm text-green-700 animate-fade-in">
              <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span>Login successful! Redirecting to your dashboard...</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
              <input
                type="email"
                className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.go.ug"
                required
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-gray-700">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-4 py-3.5 pr-12 border border-gray-200 rounded-2xl text-sm bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-3">
              <div className="relative flex items-center">
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                />
              </div>
              <label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer select-none">
                Remember me for 30 days
              </label>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading || loginSuccess}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
              style={{
                background: loading || loginSuccess
                  ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                  : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                boxShadow: '0 8px 24px rgba(37, 99, 235, 0.35)',
              }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : loginSuccess ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Redirecting...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Security indicators */}
          <div className="flex items-center justify-center gap-4 mt-5">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Shield size={11} />
              <span>JWT Secured</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-gray-300" />
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Wifi size={11} />
              <span>256-bit Encryption</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-gray-300" />
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              <span>Live</span>
            </div>
          </div>

          {/* Citizen Registration Link */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <Link to="/register" className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold border-2 border-dashed border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all">
              <UserPlus size={16} />
              New to HydroSense? Register as a Community Member
            </Link>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 text-center">
              © {new Date().getFullYear()} HydroSense. All rights reserved.<br />
              Climate-Resilient Water Management · Uganda
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
