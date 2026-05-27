import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets, AlertTriangle, Activity, Bell, Zap, Cpu, Heart,
  Users, TrendingUp, BarChart3, ShieldCheck, Map, Clock,
  ChevronRight, CheckCircle, XCircle, Wrench, Sun, Moon,
  Volume2, VolumeX, Radio, ArrowRight, Brain, Sparkles,
  Thermometer, Wind, Eye, Navigation, Github, Calendar,
  Headphones, Play,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useWeather, weatherInfo } from '../../hooks/useWeather';
import { useNotifications } from '../../contexts/NotificationContext';
import { useSocket } from '../../contexts/SocketContext';
import { useAIService } from '../../contexts/AIServiceContext';
import {
  getSmartDashboardWelcome,
  getSmartDashboardData,
  getSmartDashboardRecommendations,
  postSmartDashboardBehavior,
} from '../../api/client';
import { useAmbient } from '../../contexts/AmbientAudioContext';
import type { AmbientTheme } from '../../hooks/useAmbientAudio';
import AIWelcome, { AIWelcomeData } from '../../components/Dashboard/AIWelcome';

const ROLE_LABELS: Record<string, string> = {
  national_admin: 'System Administrator',
  district_officer: 'District Officer',
  community_committee: 'Committee Member',
  citizen: 'Citizen',
  ngo_officer: 'NGO Officer',
  technician: 'Field Technician',
  health_officer: 'Health Officer',
  climate_scientist: 'Climate Scientist',
};

const ROLE_COLORS: Record<string, { from: string; to: string; glow: string; badge: string }> = {
  national_admin:      { from: '#7c3aed', to: '#4f46e5', glow: 'rgba(124,58,237,0.3)', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  district_officer:    { from: '#1d4ed8', to: '#0284c7', glow: 'rgba(29,78,216,0.3)', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  community_committee: { from: '#059669', to: '#0891b2', glow: 'rgba(5,150,105,0.3)', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  citizen:             { from: '#475569', to: '#64748b', glow: 'rgba(71,85,105,0.3)', badge: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  ngo_officer:         { from: '#b45309', to: '#d97706', glow: 'rgba(180,83,9,0.3)', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  technician:          { from: '#ca8a04', to: '#ea580c', glow: 'rgba(202,138,4,0.3)', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  health_officer:      { from: '#dc2626', to: '#e11d48', glow: 'rgba(220,38,38,0.3)', badge: 'bg-red-500/20 text-red-300 border-red-500/30' },
  climate_scientist:   { from: '#0891b2', to: '#0284c7', glow: 'rgba(8,145,178,0.3)', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
};

function initials(name: string) {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function GlassCard({ children, className = '', glow = 'rgba(6,182,212,0.15)', delay = 0 }: {
  children: React.ReactNode; className?: string; glow?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] ${className}`}
      style={{ boxShadow: `0 8px 32px rgba(0,0,0,0.3), 0 0 60px ${glow}` }}
    >
      {children}
    </motion.div>
  );
}

function NeonGlow({ color = 'rgba(6,182,212,0.15)', className = '' }) {
  return (
    <div
      className={`absolute -top-16 -right-16 w-32 h-32 rounded-full blur-2xl pointer-events-none ${className}`}
      style={{ background: `radial-gradient(circle, ${color}, transparent)` }}
    />
  );
}

function StatWidget({ label, value, icon: Icon, color, sub, trend }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string; trend?: { dir: 'up' | 'down'; val: string };
}) {
  return (
    <GlassCard glow={`${color}20`} className="p-4 group hover:border-white/20 transition-all duration-300">
      <NeonGlow color={`${color}10`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{label}</p>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}15`, boxShadow: `0 0 20px ${color}20` }}
          >
            <Icon size={16} style={{ color }} />
          </div>
        </div>
        <p className="text-3xl font-extrabold text-white tracking-tight">{value}</p>
        {(sub || trend) && (
          <div className="flex items-center gap-2 mt-1.5">
            {sub && <p className="text-xs text-white/70 font-medium">{sub}</p>}
            {trend && (
              <span className={`text-[11px] font-bold flex items-center gap-0.5 ${trend.dir === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                <TrendingUp size={10} className={trend.dir === 'down' ? 'rotate-180' : ''} />
                {trend.val}
              </span>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function AIInsightPanel({ recommendations, onAction }: {
  recommendations: any[]; onAction: (link: string) => void;
}) {
  if (!recommendations || recommendations.length === 0) return null;
  return (
    <GlassCard className="p-5" glow="rgba(124,58,237,0.15)">
      <NeonGlow color="rgba(124,58,237,0.1)" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Brain size={16} className="text-purple-400" />
          <h3 className="text-sm font-bold text-white">AI Intelligence</h3>
          
          <span className="ml-auto text-[10px] font-mono text-purple-400/60 bg-purple-500/10 px-2 py-0.5 rounded-full">
            LIVE
          </span>
        </div>
        <div className="space-y-3">
          {recommendations.slice(0, 4).map((rec, i) => (
            <motion.div
              key={rec.title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`p-3 rounded-xl border backdrop-blur-sm cursor-pointer transition-all duration-200 hover:scale-[1.02] group ${
                rec.priority === 'high'
                  ? 'bg-red-500/10 border-red-500/20 hover:border-red-500/40'
                  : 'bg-gray-900/40 border-white/10 hover:border-white/20'
              }`}
              onClick={() => onAction(rec.link)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      rec.priority === 'high' ? 'text-red-400' : 'text-cyan-400'
                    }`}>
                      {rec.type}
                    </span>
                    {rec.priority === 'high' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-white truncate">{rec.title}</p>
                  <p className="text-xs text-white/75 mt-0.5 line-clamp-2">{rec.description}</p>
                </div>
                <ArrowRight size={14} className="text-white/20 group-hover:text-white/60 transition-colors flex-shrink-0 mt-1" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function NotificationFeed({ notifications }: { notifications: any[] }) {
  if (!notifications || notifications.length === 0) return null;
  return (
    <GlassCard className="p-5" glow="rgba(245,158,11,0.1)">
      <NeonGlow color="rgba(245,158,11,0.08)" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={16} className="text-amber-400" />
          <h3 className="text-sm font-bold text-white">Live Feed</h3>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-400/60">REALTIME</span>
          </span>
        </div>
        <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
          {notifications.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-900/40 transition-colors"
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                n.priority === 'urgent' ? 'bg-red-400 animate-pulse' :
                n.priority === 'high' ? 'bg-orange-400' : 'bg-cyan-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/90 truncate">{n.title || n.subject}</p>
                <p className="text-xs text-white/70 mt-0.5 line-clamp-1">{n.message}</p>
              </div>
              <span className="text-[10px] text-white/50 font-mono flex-shrink-0">
                {new Date(n.sent_at || n.time).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function SystemMeter({ label, value, max = 100, color = '#06b6d4' }: {
  label: string; value: number; max?: number; color?: string;
}) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/80 font-medium">{label}</span>
        <span className="text-white font-bold font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${color}60, ${color})`,
            boxShadow: `0 0 10px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}

export default function SmartDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useClock();
  const { connected } = useSocket();
  const { status: aiStatus, aiOnline } = useAIService();
  const { addNotification } = useNotifications();
  const { weather, loading: wLoading, fetchWeatherByDistrict } = useWeather(user?.district || 'Kampala');

  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeData, setWelcomeData] = useState<AIWelcomeData | null>(null);
  const [welcomeLoading, setWelcomeLoading] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  const [dashboardData, setDashboardData] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [riskScore, setRiskScore] = useState(0);
  const [riskLevel, setRiskLevel] = useState('stable');
  const [dataLoading, setDataLoading] = useState(true);

  const { prefs: audioPrefs, toggleMute, setVolume, setTheme, playPreview, themeNames, themes, isNarrating, stopNarration, startNarration, voiceName } = useAmbient();
  const [showAudioBar, setShowAudioBar] = useState(false);

  const role = user?.role || 'citizen';
  const theme = ROLE_COLORS[role] || ROLE_COLORS.citizen;

  useEffect(() => {
    if (!user) return;
    postSmartDashboardBehavior('dashboard_view', { role: user.role, district: user.district });
  }, [user]);

  useEffect(() => {
    if (!user || !showWelcome) return;
    setWelcomeLoading(true);
    getSmartDashboardWelcome()
      .then((r) => setWelcomeData(r.data.data))
      .catch(() => {})
      .finally(() => setWelcomeLoading(false));
  }, [user, showWelcome]);

  useEffect(() => {
    if (!user) return;
    setDataLoading(true);
    Promise.all([
      getSmartDashboardData(),
      getSmartDashboardRecommendations(),
    ]).then(([d, r]) => {
      setDashboardData(d.data.data);
      const recs = r.data.data;
      setRecommendations(recs.recommendations || []);
      setRiskScore(recs.overallRiskScore || 0);
      setRiskLevel(recs.riskLevel || 'stable');
    }).catch(() => {}).finally(() => setDataLoading(false));
  }, [user]);

  const handleWelcomeDismiss = useCallback(() => {
    setShowWelcome(false);
    postSmartDashboardBehavior('welcome_dismissed', {});
  }, []);

  const handleTtsToggle = useCallback(() => {
    setTtsEnabled((p) => !p);
  }, []);

  const handleRecommendationAction = useCallback((link: string) => {
    navigate(link);
    postSmartDashboardBehavior('recommendation_clicked', { link });
  }, [navigate]);

  const weatherInfo_ = weather ? weatherInfo(weather.code) : null;

  const s = dashboardData?.systemHealth || {};
  const events = dashboardData?.upcomingEvents || [];
  const notifs = dashboardData?.recentNotifications || [];
  const healthScore = dashboardData?.healthScore || 0;

  return (
    <>
      <AnimatePresence>
        {showWelcome && (
          <AIWelcome
            data={welcomeData}
            loading={welcomeLoading}
            onDismiss={handleWelcomeDismiss}
            ttsEnabled={ttsEnabled}
            onTtsToggle={handleTtsToggle}
            userName={user?.name}
          />
        )}
      </AnimatePresence>

      <div className="relative min-h-screen bg-gray-950">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 -left-40 w-80 h-80 rounded-full blur-[100px]" style={{ background: `${theme.from}06` }} />
          <div className="absolute bottom-0 -right-40 w-80 h-80 rounded-full blur-[100px]" style={{ background: `${theme.to}06` }} />
        </div>

        <div className="relative z-10 space-y-6 pb-8 max-w-[1600px] mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-between pt-2"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono text-emerald-400/80">{connected ? 'CONNECTED' : 'RECONNECTING'}</span>
              </div>
              <span className="text-white/10">|</span>
              <div className="flex items-center gap-1.5">
                <Cpu size={11} className={aiOnline ? 'text-cyan-400' : 'text-red-400'} />
                <span className={`text-xs font-mono ${aiOnline ? 'text-cyan-400/80' : 'text-red-400/80'}`}>
                  AI {aiOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <span className="text-white/10">|</span>
              <span className="text-xs font-mono text-white/70">
                {now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isNarrating ? (
                <button
                  onClick={stopNarration}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs transition-all animate-pulse"
                >
                  <Headphones size={12} />
                  AI Voice
                </button>
              ) : (
                <button
                  onClick={startNarration}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 text-xs transition-all"
                >
                  <Play size={12} />
                  AI Guide
                </button>
              )}
              <button
                onClick={() => setShowAudioBar(!showAudioBar)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs transition-all"
              >
                {audioPrefs.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                Soundscape
              </button>
              <Link
                to="/ai-hub"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-300 text-xs transition-all"
              >
                <Sparkles size={12} />
                AI Hub
              </Link>
            </div>
          </motion.div>

          <AnimatePresence>
            {showAudioBar && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <GlassCard className="p-4">
                  <div className="relative z-10 flex flex-wrap items-center gap-4">
                    <span className="text-xs font-bold text-white/80 uppercase tracking-widest">Soundscape</span>
                    <button
                      onClick={toggleMute}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                        audioPrefs.muted
                          ? 'bg-red-500/10 border-red-500/20 text-red-400'
                          : 'bg-white/5 border-white/10 text-white/90 hover:text-white'
                      }`}
                    >
                      {audioPrefs.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      {audioPrefs.muted ? 'Muted' : 'Active'}
                    </button>
                    <div className="flex items-center gap-2">
                          <span className="text-[10px] text-white/60">Vol</span>
                          <input
                            type="range"
                            min="0"
                            max="0.5"
                            step="0.01"
                            value={audioPrefs.volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            className="w-20 h-1 accent-cyan-500"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-white/60">Theme</span>
                      <select
                        value={audioPrefs.theme}
                        onChange={(e) => setTheme(e.target.value as AmbientTheme)}
                        className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white/90"
                      >
                        {themes.map((t) => (
                          <option key={t} value={t} className="bg-gray-900">{themeNames[t]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => playPreview(audioPrefs.theme)}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs"
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <GlassCard
                  glow={`${theme.from}20`}
                  className="overflow-hidden"
                >
                  <div
                    className="relative p-6"
                    style={{
                      background: `linear-gradient(135deg, ${theme.from}40 0%, ${theme.to}30 100%)`,
                    }}
                  >
                    <NeonGlow color={`${theme.from}15`} />
                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/10"
                        style={{
                          background: `linear-gradient(135deg, ${theme.from}40, ${theme.to}30)`,
                          boxShadow: `0 0 30px ${theme.from}30`,
                        }}
                      >
                        {user?.avatar
                          ? <img src={user.avatar} alt="" className="w-full h-full rounded-2xl object-cover" />
                          : <span className="text-xl font-extrabold text-white">{initials(user?.name || 'U')}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                          {user?.name || 'User'}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${theme.badge}`}>
                            {ROLE_LABELS[role] || role}
                          </span>
                            {user?.district && (
                            <span className="text-xs text-white/75 flex items-center gap-1">
                              <Map size={10} /> {user.district}
                            </span>
                          )}
                          {user?.organization && (
                            <span className="text-xs text-white/70">{user.organization}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-2xl font-extrabold text-white font-mono tracking-tight">
                            {now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[11px] text-white/75 font-medium">
                            {now.toLocaleDateString('en-UG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                      {[
                        { label: 'Water Points', value: s.waterPoints ?? '—', icon: Droplets, color: '#06b6d4' },
                        { label: 'Active Alerts', value: s.activeAlerts ?? '—', icon: Bell, color: '#f59e0b' },
                        { label: 'System Health', value: `${healthScore}%`, icon: Activity, color: '#10b981' },
                        { label: 'Risk Index', value: `${riskScore}`, icon: ShieldCheck, color: riskScore >= 50 ? '#ef4444' : '#06b6d4' },
                      ].map((item, i) => (
                        <motion.div
                          key={item.label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 + i * 0.05 }}
                          className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-3 border border-white/10 hover:bg-gray-900/70 transition-all"
                        >
                          <item.icon size={13} className="mb-1.5" style={{ color: item.color }} />
                          <div className="text-lg font-extrabold text-white">{item.value}</div>
                          <div className="text-[10px] text-white/70 font-medium mt-0.5">{item.label}</div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>

              {dataLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1,2,3,4,5,6].map((i) => (
                    <div key={i} className="h-32 rounded-2xl bg-gray-900/40 animate-pulse border border-white/10" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    <StatWidget
                      label="Functional Rate"
                      value={s.functionalRate ?? 0}
                      icon={CheckCircle}
                      color="#10b981"
                      sub={`${s.func ?? 0} of ${s.waterPoints ?? 0} operational`}
                      trend={s.functionalRate >= 70 ? { dir: 'up', val: `${s.functionalRate}%` } : { dir: 'down', val: `${s.functionalRate}%` }}
                    />
                    <StatWidget
                      label="Active Alerts"
                      value={s.activeAlerts ?? 0}
                      icon={AlertTriangle}
                      color={s.criticalAlerts > 0 ? '#ef4444' : '#f59e0b'}
                      sub={`${s.criticalAlerts ?? 0} critical`}
                    />
                    <StatWidget
                      label="Pending Maintenance"
                      value={s.pendingMaintenance ?? 0}
                      icon={Wrench}
                      color="#f97316"
                      sub="Awaiting action"
                    />
                    <StatWidget
                      label="Sensors Online"
                      value={s.sensorsOnline ?? 0}
                      icon={Radio}
                      color="#06b6d4"
                      sub={`${s.sensorsOffline ?? 0} offline`}
                    />
                    <StatWidget
                      label="Unsafe Water Tests"
                      value={s.unsafeQualityTests ?? 0}
                      icon={Thermometer}
                      color={s.unsafeQualityTests > 0 ? '#ef4444' : '#10b981'}
                      sub="Flagged this period"
                    />
                    <StatWidget
                      label="Pending Reports"
                      value={s.pendingCitizenReports ?? 0}
                      icon={Users}
                      color="#8b5cf6"
                      sub="Awaiting analysis"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <GlassCard className="p-5" glow="rgba(6,182,212,0.1)">
                      <NeonGlow color="rgba(6,182,212,0.08)" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-5">
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <BarChart3 size={14} className="text-cyan-400" /> System Health
                          </h3>
                          <span className="text-2xl font-extrabold font-mono" style={{ color: healthScore >= 70 ? '#10b981' : healthScore >= 40 ? '#f59e0b' : '#ef4444' }}>
                            {healthScore}
                            <span className="text-xs text-white/50">/100</span>
                          </span>
                        </div>
                        <div className="space-y-3">
                          <SystemMeter label="Water Infrastructure" value={s.functionalRate ?? 0} color="#10b981" />
                          <SystemMeter label="Alert Response" value={Math.max(0, 100 - (s.activeAlerts ?? 0) * 3)} color="#06b6d4" />
                          <SystemMeter label="Sensor Network" value={s.sensorsOnline > 0 ? Math.round((s.sensorsOnline / Math.max(s.sensorsOnline + (s.sensorsOffline ?? 0), 1)) * 100) : 0} color="#8b5cf6" />
                          <SystemMeter label="Maintenance Coverage" value={s.pendingMaintenance > 0 ? Math.max(0, 100 - s.pendingMaintenance * 3) : 100} color="#f97316" />
                        </div>
                      </div>
                    </GlassCard>

                    <GlassCard className="p-5" glow="rgba(16,185,129,0.1)">
                      <NeonGlow color="rgba(16,185,129,0.08)" />
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                          <Calendar size={14} className="text-emerald-400" />
                          <h3 className="text-sm font-bold text-white">Upcoming Events</h3>
                        </div>
                        {events.length === 0 ? (
                          <p className="text-xs text-white/60 py-6 text-center">No upcoming events</p>
                        ) : (
                          <div className="space-y-2">
                            {events.map((ev: any, i: number) => (
                              <motion.div
                                key={ev.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-900/40 transition-colors"
                              >
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-bold text-emerald-300">
                                    {new Date(ev.event_date).getDate()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/90 truncate">{ev.title}</p>
                <p className="text-xs text-white/70">
                                    {new Date(ev.event_date).toLocaleDateString('en-UG', { month: 'short' })}
                                    {ev.event_time ? ` · ${ev.event_time}` : ''}
                                    {ev.district ? ` · ${ev.district}` : ''}
                                  </p>
                                </div>
                                <ChevronRight size={14} className="text-white/40 flex-shrink-0 mt-1" />
                              </motion.div>
                            ))}
                          </div>
                        )}
                        <Link
                          to="/community"
                          className="flex items-center justify-center gap-1 mt-4 text-xs text-cyan-400/80 hover:text-cyan-300 transition-colors"
                        >
                          View All Events <ChevronRight size={10} />
                        </Link>
                      </div>
                    </GlassCard>
                  </div>

                  <NotificationFeed notifications={notifs} />

                  {dashboardData?.weather && (
                    <GlassCard className="p-5" glow="rgba(251,191,36,0.1)">
                      <NeonGlow color="rgba(251,191,36,0.08)" />
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                          <Sun size={14} className="text-yellow-400" />
                          <h3 className="text-sm font-bold text-white">Climate & Environment</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-3 rounded-xl bg-gray-900/40 border border-white/10">
                            <Thermometer size={16} className="mx-auto mb-1.5 text-orange-400" />
                            <p className="text-lg font-extrabold text-white">{dashboardData.weather.temperature ?? '—'}°C</p>
                            <p className="text-[10px] text-white/60 font-medium">Temperature</p>
                          </div>
                          <div className="text-center p-3 rounded-xl bg-gray-900/40 border border-white/10">
                            <Wind size={16} className="mx-auto mb-1.5 text-cyan-400" />
                            <p className="text-lg font-extrabold text-white">{dashboardData.weather.humidity ?? '—'}%</p>
                            <p className="text-[10px] text-white/60 font-medium">Humidity</p>
                          </div>
                          <div className="text-center p-3 rounded-xl bg-gray-900/40 border border-white/10">
                            <CloudRain size={16} className="mx-auto mb-1.5 text-blue-400" />
                            <p className="text-lg font-extrabold text-white">{dashboardData.weather.rainfall ?? '—'}mm</p>
                            <p className="text-[10px] text-white/60 font-medium">Rainfall</p>
                          </div>
                          <div className="text-center p-3 rounded-xl bg-gray-900/40 border border-white/10">
                            <Map size={16} className="mx-auto mb-1.5 text-emerald-400" />
                            <p className="text-lg font-extrabold text-white">{dashboardData.weather.district || user?.district || '—'}</p>
                            <p className="text-[10px] text-white/60 font-medium">District</p>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  )}
                </>
              )}
            </div>

            <div className="space-y-4">
              <GlassCard className="p-5" glow={`${theme.from}15`}>
                <NeonGlow color={`${theme.from}10`} />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu size={14} className="text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">Quick Actions</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <QuickActionButton icon={BarChart3} label="Analytics" to="/analytics" color="#8b5cf6" />
                    <QuickActionButton icon={AlertTriangle} label="Emergency" to="/emergency" color="#ef4444" />
                    <QuickActionButton icon={Map} label="GIS Map" to="/gis" color="#10b981" />
                    <QuickActionButton icon={Droplets} label="Water Points" to="/water-infrastructure" color="#06b6d4" />
                    <QuickActionButton icon={Wrench} label="Maintenance" to="/maintenance" color="#f97316" />
                    <QuickActionButton icon={Heart} label="Health" to="/health" color="#e11d48" />
                    <QuickActionButton icon={Brain} label="AI Hub" to="/ai-hub" color="#a855f7" />
                    <QuickActionButton icon={Users} label="Community" to="/community" color="#059669" />
                  </div>
                </div>
              </GlassCard>

              <AIInsightPanel recommendations={recommendations} onAction={handleRecommendationAction} />

              <GlassCard className="p-5" glow="rgba(6,182,212,0.1)">
                <NeonGlow color="rgba(6,182,212,0.08)" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={14} className="text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">System Status</h3>
                  </div>
                  <div className="space-y-2.5">
                    <StatusRow label="Database" status="operational" />
                    <StatusRow label="AI Service" status={aiOnline ? 'operational' : 'offline'} />
                    <StatusRow label="WebSocket" status={connected ? 'operational' : 'degraded'} />
                    <StatusRow label="Sensor Network" status={s.sensorsOnline > 0 ? 'operational' : 'degraded'} />
                    <StatusRow label="Notifications" status="operational" />
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function QuickActionButton({ icon: Icon, label, to, color }: {
  icon: React.ElementType; label: string; to: string; color: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 p-3 rounded-xl bg-gray-900/40 border border-white/10 hover:bg-gray-900/60 hover:border-white/20 transition-all group"
    >
      <Icon size={16} style={{ color }} className="group-hover:scale-110 transition-transform" />
      <span className="text-[10px] text-white/75 font-medium group-hover:text-white transition-colors">{label}</span>
    </Link>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const colors: Record<string, string> = {
    operational: 'bg-emerald-400',
    degraded: 'bg-yellow-400',
    offline: 'bg-red-400',
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/75">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${colors[status] || 'bg-gray-400'}`} />
        <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">{status}</span>
      </div>
    </div>
  );
}

function CloudRain({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 13v8" /><path d="M8 13v8" /><path d="M12 15v8" />
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
    </svg>
  );
}
