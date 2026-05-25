import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  LayoutDashboard, Droplets, Cpu, CloudRain, TestTube, Users, Heart,
  AlertTriangle, BarChart3, Map, Wrench, ShieldCheck, LogOut, X, Globe,
  Brain, Shield, Radio, Hammer, UserCog, UserCircle,
} from 'lucide-react';
import ProfileModal from '../common/ProfileModal';

/* ─────────────────────────────────────────────────────────────
   Role type (all 8 original roles)
───────────────────────────────────────────────────────────── */
const ALL = [
  'national_admin', 'district_officer', 'community_committee',
  'citizen', 'ngo_officer', 'technician', 'health_officer', 'climate_scientist',
] as const;

type Role = typeof ALL[number];

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  citizenLabel?: string;
  roles: Role[];
  group: string;
  badge?: string;
}

/* ─────────────────────────────────────────────────────────────
   Navigation items — grouped by section
───────────────────────────────────────────────────────────── */
const navItems: NavItem[] = [

  // ── Core — all roles ──────────────────────────────────────
  { to:'/dashboard',          icon:LayoutDashboard, label:'Dashboard',
    roles:[...ALL], group:'core' },

  // ── Infrastructure ────────────────────────────────────────
  // Water Infrastructure: all authenticated users (write restricted at component/API level)
  { to:'/water-infrastructure', icon:Droplets, label:'Water Infrastructure',
    roles:[...ALL], group:'infra' },

  // IoT Sensors: Admins, IoT Engineers (technician), Water Quality Analysts (health_officer),
  //              Environmental Monitoring (climate_scientist), Gov Water Authorities (district_officer)
  { to:'/sensors',            icon:Cpu,     label:'IoT Sensors',
    roles:['national_admin','district_officer','technician','health_officer','climate_scientist'], group:'infra' },

  // Maintenance: Maintenance Teams, Field Technicians (technician), Operations Managers (district_officer)
  { to:'/maintenance',        icon:Wrench,  label:'Maintenance',
    roles:['national_admin','district_officer','technician'], group:'infra' },

  // ── Environment & Science ─────────────────────────────────
  { to:'/climate',            icon:CloudRain, label:'Climate Monitor',
    roles:['national_admin','district_officer','health_officer','climate_scientist'], group:'science' },
  { to:'/water-quality',      icon:TestTube,  label:'Water Quality',
    roles:['national_admin','district_officer','health_officer','ngo_officer','climate_scientist'], group:'science' },

  // ── Community & Health ────────────────────────────────────
  { to:'/community',          icon:Users,         label:'Community Reports',
    roles:['national_admin','district_officer','community_committee','ngo_officer','citizen'], group:'community' },
  { to:'/health',             icon:Heart,         label:'Health Surveillance',
    roles:['national_admin','district_officer','health_officer','ngo_officer'], group:'community' },

  // Emergency Response: Emergency Teams, Disaster Management (national_admin/district_officer),
  //                     Environmental Protection Authorities (health_officer), Government Officials
  { to:'/emergency',          icon:AlertTriangle, label:'Emergency Response',
    roles:['national_admin','district_officer','health_officer'], group:'community' },

  // ── Analytics ─────────────────────────────────────────────
  { to:'/gis',                icon:Map,     label:'GIS & Mapping',
    roles:['national_admin','district_officer','climate_scientist','ngo_officer','health_officer'], group:'analytics' },
  { to:'/analytics',          icon:BarChart3, label:'Analytics & AI',
    roles:['national_admin','district_officer','climate_scientist','health_officer'], group:'analytics' },

  // ── Guardian Water Network ────────────────────────────────
  // GWN: Citizens, Community Leaders, NGOs, Environmental Activists (ngo_officer),
  //      Researchers (climate_scientist), Environmental Officers (health_officer) + admin oversight
  { to:'/gwn',                icon:Shield,  label:'GWN Reporting',
    roles:['citizen','community_committee','ngo_officer','climate_scientist','health_officer','national_admin','district_officer'],
    group:'gwn', badge:'GWN' },

  { to:'/incident-command',   icon:Radio,   label:'Incident Command',
    roles:['national_admin','district_officer'],
    group:'gwn', badge:'NEW' },
  { to:'/incident-analysis',  icon:BarChart3, label:'AI Incident Analysis',
    roles:['national_admin','district_officer','health_officer','climate_scientist'],
    group:'gwn', badge:'AI' },
  { to:'/task-assignment',    icon:UserCog, label:'Task Assignment',
    roles:['national_admin','district_officer','technician','health_officer'],
    group:'gwn' },

  // ── Multilingual Reporting ─────────────────────────────
  { to:'/multilingual-report', icon:Globe,  label:'Report (Multilingual)',
    roles:['citizen','community_committee','ngo_officer','national_admin','district_officer'], group:'citizen', badge:'AI' },
  { to:'/track-reports',       icon:UserCircle, label:'Track Reports',
    roles:['citizen','community_committee','ngo_officer','national_admin','district_officer'], group:'citizen' },

  // ── Citizen Hub — all authenticated users ────────────────
  { to:'/citizen-hub',        icon:Globe,   label:'Citizen Hub',
    roles:[...ALL], group:'citizen', badge:'NEW' },

  // ── My Tasks — ALL authenticated users ───────────────────
  { to:'/technician-portal',  icon:Hammer,  label:'My Tasks', citizenLabel:'Tasks',
    roles:[...ALL], group:'tools' },

  // ── Administration & AI ───────────────────────────────────
  { to:'/governance',         icon:ShieldCheck, label:'Governance',
    roles:['national_admin','district_officer'], group:'admin' },

  // AI Hub: AI Analysts (climate_scientist), Data Scientists, Environmental Intelligence,
  //         Research Institutions, System Administrators — excludes citizens/NGOs/communities
  { to:'/ai-hub',             icon:Brain,   label:'AI Hub',
    roles:['national_admin','district_officer','technician','health_officer','climate_scientist'], group:'admin' },

  { to:'/users',              icon:UserCog, label:'User Management',
    roles:['national_admin'],
    group:'admin', badge:'ADMIN' },
];

/* ─────────────────────────────────────────────────────────────
   Role display config
───────────────────────────────────────────────────────────── */
const roleConfig: Record<string, { label:string; color:string; dot:string }> = {
  national_admin:     { label:'System Administrator',          color:'text-purple-300', dot:'bg-purple-400' },
  district_officer:   { label:'District Water Officer',        color:'text-blue-300',   dot:'bg-blue-400' },
  community_committee:{ label:'Community Leader',              color:'text-emerald-300',dot:'bg-emerald-400' },
  citizen:            { label:'Citizen',                       color:'text-gray-300',   dot:'bg-gray-400' },
  ngo_officer:        { label:'NGO / Environmental Activist',  color:'text-orange-300', dot:'bg-orange-400' },
  technician:         { label:'Field Technician / IoT Eng.',   color:'text-yellow-300', dot:'bg-yellow-400' },
  health_officer:     { label:'Environmental Monitoring Off.', color:'text-red-300',    dot:'bg-red-400' },
  climate_scientist:  { label:'Environmental Intelligence',    color:'text-cyan-300',   dot:'bg-cyan-400' },
};

const groupLabels: Record<string, string> = {
  core:      'Overview',
  infra:     'Infrastructure',
  science:   'Environment',
  community: 'Community & Health',
  analytics: 'Analytics',
  gwn:       '🛡️ Guardian Network',
  citizen:   '🌍 Citizen Hub',
  tools:     'Field Tools',
  admin:     'Administration & AI',
};

/* ─────────────────────────────────────────────────────────────
   Badge colour helper
───────────────────────────────────────────────────────────── */
const badgeStyle: Record<string, string> = {
  GWN:   'bg-emerald-500/25 text-emerald-300 border-emerald-500/30',
  NEW:   'bg-teal-500/25 text-teal-300 border-teal-500/30',
  ADMIN: 'bg-rose-500/25 text-rose-300 border-rose-500/30',
};

interface SidebarProps { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { language, translate } = useLanguage();
  const [showProfile, setShowProfile] = useState(false);
  const [translatedLabels, setTranslatedLabels] = useState<Record<string, string>>({});
  const translateCacheRef = useRef<Record<string, Record<string, string>>>({});

  const userRole  = (user?.role || '') as Role;
  const rc        = roleConfig[userRole] || { label:userRole, color:'text-gray-300', dot:'bg-gray-400' };
  const initials  = user ? user.name.split(' ').map(n=>n[0]).filter(Boolean).slice(0,2).join('').toUpperCase() : '?';

  const filtered  = navItems.filter(item => item.roles.includes(userRole));

  // Translate nav labels + group labels when language changes
  useEffect(() => {
    if (language === 'en') { setTranslatedLabels({}); return; }
    const cached = translateCacheRef.current[language];
    if (cached) { setTranslatedLabels(cached); return; }

    const allStrings = [
      ...filtered.map(i => i.label),
      ...filtered.filter(i => i.citizenLabel).map(i => i.citizenLabel as string),
      ...Object.values(groupLabels),
      'Sign Out',
    ];
    const unique = [...new Set(allStrings)];

    Promise.all(unique.map(s => translate(s).then(t => [s, t] as [string, string])))
      .then(pairs => {
        const map = Object.fromEntries(pairs);
        translateCacheRef.current[language] = map;
        setTranslatedLabels(map);
      });
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  const tl = (s: string) => translatedLabels[s] || s;

  const grouped: Record<string, NavItem[]> = {};
  filtered.forEach(item => {
    if (!grouped[item.group]) grouped[item.group] = [];
    grouped[item.group].push(item);
  });

  const ORDER = ['core','infra','science','community','analytics','gwn','citizen','tools','admin'];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[1050] lg:hidden"
          style={{ background:'rgba(0,0,0,0.55)', backdropFilter:'blur(2px)' }}
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-screen w-[260px] z-[1100] flex flex-col transition-transform duration-300 ${open?'translate-x-0':'-translate-x-full'} lg:translate-x-0`}
        style={{ background:'linear-gradient(180deg,#0f172a 0%,#111827 100%)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0"
            style={{ background:'linear-gradient(135deg,#2563eb,#0ea5e9)' }}>
            💧
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-sm tracking-wide truncate">HYDROSENSE</div>
            <div className="text-gray-500 text-[11px]">Climate-Resilient · Uganda</div>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-500 hover:text-white transition-colors">
            <X size={17}/>
          </button>
        </div>

        {/* User card — click avatar to edit profile */}
        {user && (
          <div className="mx-3 mt-3 rounded-2xl p-3.5 border border-white/8" style={{ background:'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3">
              {/* Clickable avatar */}
              <button
                onClick={() => setShowProfile(true)}
                title="Edit my profile"
                className="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden border-2 border-white/20 hover:border-blue-400 transition-colors focus:outline-none"
                style={{ background:'linear-gradient(135deg,#2563eb,#7c3aed)' }}
              >
                {user.avatar
                  ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-sm font-bold text-white">{initials}</span>}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{user.name}</div>
                <div className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${rc.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${rc.dot}`}/>
                  {rc.label}
                </div>
              </div>
              {/* Profile edit shortcut */}
              <button
                onClick={() => setShowProfile(true)}
                title="Edit profile"
                className="p-1 text-gray-600 hover:text-blue-400 transition-colors flex-shrink-0"
              >
                <UserCircle size={15}/>
              </button>
            </div>
            {(user.district || user.organization) && (
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-500">
                <Globe size={10}/>
                <span className="truncate">{user.district || user.organization}</span>
              </div>
            )}
          </div>
        )}

        {/* Profile modal */}
        {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5 custom-scroll">
          {ORDER.map(group => {
            const items = grouped[group];
            if (!items?.length) return null;
            return (
              <div key={group} className="mb-1">
                {group !== 'core' && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-600 select-none">
                    {tl(groupLabels[group] || group)}
                  </div>
                )}
                {items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      isActive
                        ? 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 mb-0.5 shadow-lg'
                        : 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-white/8 hover:text-white transition-all duration-200 mb-0.5'
                    }
                    style={({ isActive }) => isActive
                      ? { background: group === 'gwn'
                          ? 'linear-gradient(135deg,#065f46,#0891b2)'
                          : group === 'tools'
                          ? 'linear-gradient(135deg,#92400e,#d97706)'
                          : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                          boxShadow:'0 4px 14px rgba(37,99,235,0.35)' }
                      : undefined
                    }
                  >
                    <item.icon size={16} className="flex-shrink-0"/>
                    <span className="truncate flex-1">{tl(userRole === 'citizen' && item.citizenLabel ? item.citizenLabel : item.label)}</span>
                    {item.badge && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${badgeStyle[item.badge] || badgeStyle.NEW}`}>
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 pt-2 border-t border-white/8 space-y-1">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-all duration-200"
          >
            <LogOut size={16}/>
            <span>{tl('Sign Out')}</span>
          </button>
          <div className="text-center text-[10px] text-gray-700 pt-1">
            HYDROSENSE v2.0 &copy; 2026
          </div>
        </div>
      </aside>
    </>
  );
}
