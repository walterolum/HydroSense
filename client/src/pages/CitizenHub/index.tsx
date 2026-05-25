import { useEffect, useState, useRef } from 'react';
import {
  Shield, Droplets, AlertTriangle, BookOpen, Users, Trophy,
  MessageSquare, Heart, Plus, ThumbsUp, RefreshCw, Send,
  MapPin, Calendar, Clock, ChevronRight, Star, Award,
  Leaf, CloudRain, Zap, Camera, Eye, X, Loader2,
  CheckCircle, Globe, Wind, Flame, ImagePlus, Navigation, Crosshair,
  Mic, MicOff, Languages,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCitizenDashboard, getDiscussions, createDiscussion, likeDiscussion,
  getDiscussionReplies, postDiscussionReply,
  getVolunteerEvents, joinEvent, leaveEvent,
  getCitizenAchievements, submitObservation, voiceTranslate,
} from '../../api/client';

/* ─── Helpers ─────────────────────────────────────────────── */
const DISC_CATS = [
  { value: 'all',         label: '🌐 All',          color: '#6b7280' },
  { value: 'water_quality',label: '💧 Water Quality', color: '#2563eb' },
  { value: 'pollution',   label: '🏭 Pollution',      color: '#dc2626' },
  { value: 'climate',     label: '🌤️ Climate',        color: '#0891b2' },
  { value: 'health',      label: '🏥 Health',          color: '#16a34a' },
  { value: 'events',      label: '📅 Events',          color: '#7c3aed' },
  { value: 'governance',  label: '🏛️ Governance',     color: '#d97706' },
  { value: 'general',     label: '💬 General',         color: '#64748b' },
];

const UGANDA_DISTRICTS = [
  'Abim','Adjumani','Agago','Alebtong','Amolatar','Amudat','Amuria','Amuru',
  'Apac','Arua','Budaka','Bududa','Bugiri','Bugweri','Buikwe','Bukedea',
  'Bukwa','Bulambuli','Buliisa','Bundibugyo','Bunyangabu','Bukomansimbi',
  'Bushenyi','Busia','Butebo','Buvuma','Buyende','Dokolo','Gomba','Gulu',
  'Hoima','Ibanda','Iganga','Isingiro','Jinja','Kaabong','Kabale','Kabarole',
  'Kaberamaido','Kagadi','Kakumiro','Kalaki','Kalangala','Kaliro','Kalungu',
  'Kampala','Kamuli','Kamwenge','Kanungu','Kapelebyong','Kapchorwa','Kasanda',
  'Kasese','Katakwi','Kayunga','Kiboga','Kibuku','Kikuube','Kiryandongo',
  'Kisoro','Kitgum','Koboko','Kole','Kotido','Kumi','Kwania','Kween',
  'Kyankwanzi','Kyegegwa','Kyenjojo','Lamwo','Lira','Luuka','Luwero',
  'Lwengo','Lyantonde','Madi-Okollo','Manafwa','Maracha','Masaka','Masindi',
  'Mayuge','Mbale','Mbarara','Mitooma','Mityana','Moroto','Moyo','Mpigi',
  'Mubende','Mukono','Nabilatuk','Nakapiripirit','Nakaseke','Nakasongola',
  'Namayingo','Namisindwa','Namutumba','Napak','Nebbi','Ngora','Ntoroko',
  'Ntungamo','Nwoya','Obongi','Omoro','Otuke','Oyam','Pader','Pakwach',
  'Pallisa','Rakai','Rubanda','Rubirizi','Rukiga','Rukungiri','Rwampara',
  'Sembabule','Serere','Sheema','Sironko','Soroti','Terego','Tororo',
  'Wakiso','Yumbe','Zombo',
];

const OBS_TYPES = [
  '💧 Water Color/Clarity', '🐟 Dead Fish / Wildlife',
  '🏭 Industrial Discharge', '🌿 Algae Bloom',
  '💨 Bad Odor', '🗑️ Illegal Dumping',
  '🌊 Flooding / Overflow', '🔴 Oil Spill',
];

const OBS_LANGS = [
  // Official / widely spoken
  { code: 'en-US', srCode: 'en-US', label: 'English'               },
  { code: 'sw',    srCode: 'sw-KE', label: 'Kiswahili'             },
  // Bantu – Central & Southern Uganda
  { code: 'lg',    srCode: 'lg',    label: 'Luganda (Ganda)'        },
  { code: 'lsm',   srCode: 'en-UG', label: 'Lumasaba (Gisu)'       },
  { code: 'lunyole',srCode: 'en-UG', label: 'Lunyole'              },
  { code: 'lgw',   srCode: 'en-UG', label: 'Lugwere'               },
  { code: 'sog',   srCode: 'en-UG', label: 'Lusoga (Soga)'         },
  { code: 'lun',   srCode: 'en-UG', label: 'Lusamia'               },
  { code: 'lunyala',srCode: 'en-UG', label: 'Lunyala'              },
  // Bantu – Western Uganda
  { code: 'nyn',   srCode: 'en-UG', label: 'Runyankore (Nkore)'    },
  { code: 'cgg',   srCode: 'en-UG', label: 'Rukiga (Chiga)'        },
  { code: 'nyo',   srCode: 'en-UG', label: 'Runyoro (Nyoro)'       },
  { code: 'ttj',   srCode: 'en-UG', label: 'Rutooro (Tooro)'       },
  { code: 'xog',   srCode: 'en-UG', label: 'Lukhonzo (Konjo)'      },
  { code: 'lubwisi',srCode: 'en-UG', label: 'Lubwisi'              },
  { code: 'lugungu',srCode: 'en-UG', label: 'Lugungu'              },
  // Nilotic – Northern Uganda
  { code: 'ach',   srCode: 'en-UG', label: 'Acholi'                },
  { code: 'laj',   srCode: 'en-UG', label: 'Langi (Lango)'         },
  { code: 'alz',   srCode: 'en-UG', label: 'Alur'                  },
  { code: 'adh',   srCode: 'en-UG', label: 'Jopadhola (Adhola)'    },
  { code: 'kdi',   srCode: 'en-UG', label: 'Kumam'                 },
  // Nilotic – Eastern Uganda (Ateker cluster)
  { code: 'teo',   srCode: 'en-UG', label: 'Ateso (Teso)'          },
  { code: 'kdj',   srCode: 'en-UG', label: 'Karamojong'            },
  { code: 'dod',   srCode: 'en-UG', label: 'Dodos (Dodoth)'        },
  { code: 'jie',   srCode: 'en-UG', label: 'Jie'                   },
  { code: 'bku',   srCode: 'en-UG', label: 'Bokora'                },
  { code: 'pok',   srCode: 'en-UG', label: 'Pokot (Upe)'           },
  { code: 'kpz',   srCode: 'en-UG', label: 'Sabiny (Kupsabiny)'    },
  // Central Sudanic – West Nile
  { code: 'lgg',   srCode: 'en-UG', label: 'Lugbara'               },
  { code: 'mhi',   srCode: 'en-UG', label: 'Ma\'di'                },
  { code: 'ari',   srCode: 'en-UG', label: 'Aringa'                },
  { code: 'kke',   srCode: 'en-UG', label: 'Kakwa'                 },
  { code: 'ndo',   srCode: 'en-UG', label: 'Ndo'                   },
  // Other
  { code: 'iqo',   srCode: 'en-UG', label: 'Ik (Teuso)'            },
  { code: 'nub',   srCode: 'ar-SA', label: 'Kinubi (Nubi Arabic)'   },
];

const EVENT_TYPES: Record<string, { label: string; color: string; icon: string }> = {
  cleanup:     { label: 'Clean-Up',      color: '#16a34a', icon: '🧹' },
  planting:    { label: 'Tree Planting', color: '#15803d', icon: '🌱' },
  awareness:   { label: 'Awareness',     color: '#2563eb', icon: '📢' },
  monitoring:  { label: 'Monitoring',    color: '#0891b2', icon: '🔬' },
  training:    { label: 'Training',      color: '#7c3aed', icon: '📚' },
};

const EDUCATION_CONTENT = [
  { icon: '💧', title: 'Water Conservation at Home', tag: 'Tips', color: '#2563eb',
    body: 'Fix leaky taps immediately — a dripping tap wastes up to 20 litres daily. Install water-saving showerheads and collect rainwater for your garden. Turn off taps while brushing teeth or washing dishes.',
    link: 'https://www.who.int/water_sanitation_health/publications/en/' },
  { icon: '🌊', title: 'Reporting Pollution Incidents', tag: 'Guide', color: '#dc2626',
    body: 'When you see pollution, photograph it, note the GPS location, and report immediately via the GWN Portal. Include: type of pollutant, estimated quantity, source location, and time of observation.',
    link: null },
  { icon: '🌡️', title: 'Understanding Drought & Climate', tag: 'Science', color: '#ea580c',
    body: 'Uganda experiences two rainy seasons (March–May, October–December). The Standardised Precipitation Index (SPI) measures drought severity. An SPI below −1.0 signals drought conditions affecting boreholes and rivers.',
    link: null },
  { icon: '🦠', title: 'Waterborne Disease Prevention', tag: 'Health', color: '#16a34a',
    body: 'Always boil or treat water from unknown sources. Wash hands before eating and after using latrines. Cholera, typhoid, and diarrhoea spread through contaminated water — symptoms include vomiting, diarrhoea, and fever.',
    link: null },
  { icon: '🌱', title: 'Community Tree Planting', tag: 'Action', color: '#15803d',
    body: 'Trees reduce soil erosion, increase groundwater recharge, and cool communities by up to 5°C. Plant indigenous species near rivers and wetlands. Avoid cutting trees within 30 metres of any water body.',
    link: null },
  { icon: '♻️', title: 'Plastic & Waste Management', tag: 'Tips', color: '#7c3aed',
    body: 'Plastic waste clogs drainage channels and contaminates water sources. Use reusable bags and bottles. Join community clean-up events. Improper burning of waste releases toxins that pollute air and water.',
    link: null },
  { icon: '📊', title: 'Reading Water Quality Reports', tag: 'Science', color: '#0891b2',
    body: 'Safe drinking water has: pH 6.5–8.5, turbidity <5 NTU, zero E.coli. If your source has failed these tests, use an alternative and report to the District Water Office immediately.',
    link: null },
  { icon: '🏘️', title: 'Community Governance & Your Rights', tag: 'Rights', color: '#d97706',
    body: 'As a citizen you have the right to clean water and a safe environment. Water User Committees (WUCs) manage local boreholes. Attend their meetings, ask for quality test results, and report governance failures.',
    link: null },
];

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:      'bg-green-100 text-green-700 border-green-200',
};

const TABS = [
  { id: 'dashboard',     label: '🏠 Dashboard',       roles: 'all' },
  { id: 'education',     label: '📚 Education',        roles: 'all' },
  { id: 'transparency',  label: '🌍 Transparency',     roles: 'all' },
  { id: 'discussions',   label: '💬 Discussions',      roles: 'all' },
  { id: 'volunteer',     label: '🤝 Volunteer',        roles: 'all' },
  { id: 'achievements',  label: '🏆 Achievements',     roles: 'all' },
];

export default function CitizenHub() {
  const { user } = useAuth();
  const [tab, setTab] = useState('dashboard');

  /* dashboard */
  const [dashData, setDashData]   = useState<any>(null);
  const [dashLoad, setDashLoad]   = useState(true);

  /* discussions */
  const [discussions, setDiscussions]   = useState<any[]>([]);
  const [discCat,     setDiscCat]       = useState('all');
  const [discLoad,    setDiscLoad]      = useState(false);
  const [showNewDisc, setShowNewDisc]   = useState(false);
  const [newDiscTitle,setNewDiscTitle]  = useState('');
  const [newDiscBody, setNewDiscBody]   = useState('');
  const [newDiscCat,  setNewDiscCat]    = useState('general');
  const [discSaving,  setDiscSaving]    = useState(false);
  const [expandedDisc,setExpandedDisc]  = useState<number|null>(null);
  const [replies,     setReplies]       = useState<Record<number,any[]>>({});
  const [replyText,   setReplyText]     = useState('');
  const [replySaving, setReplySaving]   = useState(false);

  /* volunteer */
  const [events,    setEvents]    = useState<any[]>([]);
  const [evLoad,    setEvLoad]    = useState(false);
  const [showNewEv, setShowNewEv] = useState(false);
  const [evForm,    setEvForm]    = useState({ title:'', description:'', location:'', district:'Kampala', event_date:'', event_time:'09:00', event_type:'cleanup', max_volunteers:'50' });
  const [evSaving,  setEvSaving]  = useState(false);
  const [evMsg,     setEvMsg]     = useState('');
  const [joiningEv, setJoiningEv] = useState<Record<number,boolean>>({});

  /* achievements */
  const [achieve,   setAchieve]   = useState<any>(null);
  const [achLoad,   setAchLoad]   = useState(false);

  /* observation */
  const [showObs,   setShowObs]   = useState(false);
  const [obsForm,   setObsForm]   = useState({ observation_type: OBS_TYPES[0], district:'Kampala', location:'', description:'', lat: null as number|null, lng: null as number|null });
  const [obsSaving, setObsSaving] = useState(false);
  const [obsMsg,    setObsMsg]    = useState('');
  const obsFileRef    = useRef<HTMLInputElement>(null);
  const obsCameraRef  = useRef<HTMLInputElement>(null);
  const [obsPhoto,    setObsPhoto]      = useState<string|null>(null);
  const [obsPhotoUrl, setObsPhotoUrl]   = useState<string|null>(null);
  const [gpsLoading,  setGpsLoading]    = useState(false);
  const [gpsError,    setGpsError]      = useState('');
  /* observation voice + language */
  const [obsLang,       setObsLang]       = useState(OBS_LANGS[0]);
  const [obsRecording,  setObsRecording]  = useState(false);
  const [obsTranslating,setObsTranslating]= useState(false);
  const [obsOriginal,   setObsOriginal]   = useState('');
  const [voiceUnsupported, setVoiceUnsupported] = useState(false);
  const speechRef = useRef<any>(null);

  /* education expand */
  const [expandedEdu, setExpandedEdu] = useState<number|null>(null);

  /* ── Load functions ── */
  const loadDash = () => {
    setDashLoad(true);
    getCitizenDashboard().then(r => setDashData(r.data.data)).finally(() => setDashLoad(false));
  };
  const loadDisc = () => {
    setDiscLoad(true);
    getDiscussions({ category: discCat === 'all' ? undefined : discCat, limit: 30 })
      .then(r => setDiscussions(r.data.data || []))
      .finally(() => setDiscLoad(false));
  };
  const loadEvents = () => {
    setEvLoad(true);
    getVolunteerEvents().then(r => setEvents(r.data.data || [])).finally(() => setEvLoad(false));
  };
  const loadAchieve = () => {
    setAchLoad(true);
    getCitizenAchievements().then(r => setAchieve(r.data.data)).finally(() => setAchLoad(false));
  };

  useEffect(() => { loadDash(); }, []);
  useEffect(() => { if (tab === 'discussions') loadDisc(); }, [tab, discCat]);
  useEffect(() => { if (tab === 'volunteer')   loadEvents(); }, [tab]);
  useEffect(() => { if (tab === 'achievements') loadAchieve(); }, [tab]);

  /* ── Handlers ── */
  const submitDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiscTitle.trim() || !newDiscBody.trim()) return;
    setDiscSaving(true);
    try {
      await createDiscussion({ title: newDiscTitle.trim(), content: newDiscBody.trim(), category: newDiscCat });
      setShowNewDisc(false); setNewDiscTitle(''); setNewDiscBody('');
      loadDisc();
    } finally { setDiscSaving(false); }
  };

  const handleLike = async (id: number) => {
    await likeDiscussion(id);
    setDiscussions(prev => prev.map(d => d.id === id ? { ...d, like_count: d.i_liked ? d.like_count - 1 : d.like_count + 1, i_liked: !d.i_liked } : d));
  };

  const toggleReplies = async (id: number) => {
    if (expandedDisc === id) { setExpandedDisc(null); return; }
    setExpandedDisc(id);
    if (!replies[id]) {
      const r = await getDiscussionReplies(id);
      setReplies(prev => ({ ...prev, [id]: r.data.data || [] }));
    }
  };

  const submitReply = async (id: number) => {
    if (!replyText.trim()) return;
    setReplySaving(true);
    try {
      await postDiscussionReply(id, replyText.trim());
      setReplyText('');
      const r = await getDiscussionReplies(id);
      setReplies(prev => ({ ...prev, [id]: r.data.data || [] }));
      setDiscussions(prev => prev.map(d => d.id === id ? { ...d, reply_count: d.reply_count + 1 } : d));
    } finally { setReplySaving(false); }
  };

  const handleJoinLeave = async (ev: any) => {
    setJoiningEv(j => ({ ...j, [ev.id]: true }));
    try {
      if (ev.i_joined) { await leaveEvent(ev.id); } else { await joinEvent(ev.id); }
      loadEvents();
    } catch (err: any) { setEvMsg(err?.response?.data?.error || 'Action failed.'); }
    finally { setJoiningEv(j => ({ ...j, [ev.id]: false })); }
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEvSaving(true);
    try {
      await import('../../api/client').then(m => m.createVolunteerEvent({ ...evForm, max_volunteers: +evForm.max_volunteers }));
      setShowNewEv(false);
      loadEvents();
    } catch (err: any) { setEvMsg(err?.response?.data?.error || 'Failed to create event.'); }
    finally { setEvSaving(false); }
  };

  const handleObsPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setObsPhotoUrl(dataUrl);
      setObsPhoto(dataUrl.split(',')[1] || null);
    };
    reader.readAsDataURL(f);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setObsForm(f => ({
          ...f,
          lat: latitude,
          lng: longitude,
          location: f.location || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        }));
        setGpsLoading(false);
      },
      () => {
        setGpsError('Could not get location. Please enable GPS and try again.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleVoiceRecord = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceUnsupported(true); return; }
    if (obsRecording) { speechRef.current?.stop(); return; }

    const sr = new SR();
    speechRef.current = sr;
    sr.lang = obsLang.srCode;
    sr.interimResults = false;
    sr.maxAlternatives = 1;
    setObsRecording(true);
    setVoiceUnsupported(false);

    sr.onresult = async (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      setObsRecording(false);
      if (obsLang.code === 'en-US') {
        setObsForm(f => ({ ...f, description: f.description ? f.description + ' ' + transcript : transcript }));
      } else {
        setObsOriginal(transcript);
        setObsTranslating(true);
        try {
          const r = await voiceTranslate({ text: transcript, sourceLang: obsLang.code, languageName: obsLang.label });
          setObsForm(f => ({ ...f, description: r.data?.english || transcript }));
        } catch {
          setObsForm(f => ({ ...f, description: transcript }));
        } finally {
          setObsTranslating(false);
        }
      }
    };
    sr.onerror = () => setObsRecording(false);
    sr.onend   = () => setObsRecording(false);
    sr.start();
  };

  const handleTranslateTyped = async () => {
    if (!obsForm.description || obsLang.code === 'en-US') return;
    setObsOriginal(obsForm.description);
    setObsTranslating(true);
    try {
      const r = await voiceTranslate({ text: obsForm.description, sourceLang: obsLang.code, languageName: obsLang.label });
      if (r.data?.english) setObsForm(f => ({ ...f, description: r.data.english }));
    } catch {}
    finally { setObsTranslating(false); }
  };

  const submitObs = async (e: React.FormEvent) => {
    e.preventDefault();
    setObsSaving(true);
    try {
      await submitObservation({ ...obsForm, photo_base64: obsPhoto });
      setObsMsg('✓ Observation submitted! Thank you for contributing to citizen science.');
      setShowObs(false);
      setObsPhoto(null); setObsPhotoUrl(null);
      setGpsError('');
      setObsForm({ observation_type: OBS_TYPES[0], district: 'Gulu', location: '', description: '', lat: null, lng: null });
      setTimeout(() => setObsMsg(''), 7000);
    } catch { setObsMsg('Submission failed. Please try again.'); }
    finally { setObsSaving(false); }
  };

  const loadingCard = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array(4).fill(0).map((_, i) => (
        <div key={i} className="card"><div className="h-16 bg-gray-100 rounded-xl animate-pulse" /></div>
      ))}
    </div>
  );

  const canCreateEvent = user && ['national_admin','district_officer','ngo_officer','community_committee'].includes(user.role);

  /* ═══════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5">

      {/* ── Hero Banner ── */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#064e3b 0%,#065f46 40%,#0891b2 100%)' }}>
        <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-white/5" />
        <div className="absolute right-12 bottom-0 w-28 h-28 rounded-full bg-white/4" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe size={18} className="text-emerald-300" />
              <span className="text-emerald-300 text-sm font-semibold tracking-wide">CITIZEN ENVIRONMENTAL HUB</span>
            </div>
            <h2 className="text-2xl font-extrabold">Welcome, {user?.name?.split(' ')[0] || 'Citizen'} 👋</h2>
            <p className="text-emerald-100 text-sm mt-0.5">Your platform to monitor, report, learn, and protect Uganda's environment.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => { setShowObs(true); setObsMsg(''); }}
                className="px-3 py-1.5 rounded-xl bg-white/20 border border-white/25 text-xs font-bold hover:bg-white/30 transition-colors flex items-center gap-1.5">
                <Eye size={12} /> Submit Observation
              </button>
              <button onClick={() => setTab('discussions')}
                className="px-3 py-1.5 rounded-xl bg-white/20 border border-white/25 text-xs font-bold hover:bg-white/30 transition-colors flex items-center gap-1.5">
                <MessageSquare size={12} /> Community Forum
              </button>
              <button onClick={() => setTab('volunteer')}
                className="px-3 py-1.5 rounded-xl bg-white/20 border border-white/25 text-xs font-bold hover:bg-white/30 transition-colors flex items-center gap-1.5">
                <Heart size={12} /> Volunteer
              </button>
            </div>
          </div>
          <button onClick={loadDash} title="Refresh"
            className="p-2.5 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 transition-colors">
            <RefreshCw size={16} className="text-white" />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all
              ${tab === t.id
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ DASHBOARD TAB ══ */}
      {tab === 'dashboard' && (
        <div className="space-y-5">
          {dashLoad ? loadingCard() : dashData && (
            <>
              {/* Key stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: Droplets, label: 'Water Points Active', value: dashData.water.functional, sub: `${dashData.water.functionality_pct}% functional`, color: '#2563eb', bg: '#dbeafe' },
                  { icon: Shield,   label: 'People Served',       value: dashData.water.beneficiaries.toLocaleString(), sub: 'across 15 districts', color: '#16a34a', bg: '#dcfce7' },
                  { icon: AlertTriangle, label: 'Active Alerts',  value: dashData.alerts.total, sub: `${dashData.alerts.critical} critical`, color: '#dc2626', bg: '#fee2e2' },
                  { icon: Eye,      label: 'Pollution Reports',   value: dashData.gwn.total, sub: `${dashData.gwn.today} today`, color: '#7c3aed', bg: '#ede9fe' },
                ].map(c => (
                  <div key={c.label} className="card">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
                        <c.icon size={20} style={{ color: c.color }} />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 font-medium">{c.label}</div>
                        <div className="text-2xl font-extrabold" style={{ color: c.color }}>{c.value}</div>
                        <div className="text-xs text-gray-400">{c.sub}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Active alerts */}
              {dashData.alerts.recent.length > 0 && (
                <div className="card border-l-4 border-red-400">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-red-500" />
                    <h3 className="section-title">Active Environmental Alerts</h3>
                  </div>
                  <div className="space-y-2">
                    {dashData.alerts.recent.map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${SEVERITY_BADGE[a.severity] || SEVERITY_BADGE.medium}`}>
                          {a.severity?.toUpperCase()}
                        </span>
                        <span className="font-medium text-gray-800 dark:text-gray-100 flex-1">{a.title}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{a.district}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-5">
                {/* Climate summary */}
                <div className="card">
                  <h3 className="section-title mb-4"><CloudRain size={16} className="text-blue-500" /> Climate & Weather Summary</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: CloudRain, label: 'Avg Rainfall (7d)', value: `${dashData.climate.avg_rainfall_7d} mm`, color: '#2563eb' },
                      { icon: Flame,     label: 'Avg Temperature', value: `${dashData.climate.avg_temp_7d}°C`,       color: '#ea580c' },
                      { icon: Wind,      label: 'Max Rainfall (7d)', value: `${dashData.climate.max_rainfall_7d} mm`, color: '#0891b2' },
                    ].map(c => (
                      <div key={c.label} className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                        <c.icon size={20} className="mx-auto mb-1" style={{ color: c.color }} />
                        <div className="text-lg font-bold" style={{ color: c.color }}>{c.value}</div>
                        <div className="text-[10px] text-gray-400">{c.label}</div>
                      </div>
                    ))}
                  </div>
                  {dashData.climate.drought_breakdown.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <div className="text-xs font-semibold text-gray-500 mb-1">Drought Status</div>
                      {dashData.climate.drought_breakdown.map((d: any) => (
                        <div key={d.severity} className="flex items-center gap-2 text-xs">
                          <div className="w-2 h-2 rounded-full" style={{ background: d.severity === 'extreme_drought' ? '#dc2626' : d.severity === 'severe_drought' ? '#ea580c' : d.severity === 'moderate_drought' ? '#d97706' : d.severity === 'mild_drought' ? '#eab308' : '#16a34a' }} />
                          <span className="capitalize text-gray-600 dark:text-gray-400">{d.severity.replace(/_/g,' ')}</span>
                          <span className="ml-auto font-semibold">{d.c} district{d.c !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Water quality */}
                <div className="card">
                  <h3 className="section-title mb-4"><Droplets size={16} className="text-blue-500" /> Water Quality Status</h3>
                  <div className="text-center mb-4">
                    <div className="w-24 h-24 rounded-full border-8 mx-auto flex items-center justify-center"
                      style={{ borderColor: dashData.water.quality_score >= 70 ? '#16a34a' : dashData.water.quality_score >= 50 ? '#d97706' : '#dc2626' }}>
                      <div>
                        <div className="text-2xl font-black" style={{ color: dashData.water.quality_score >= 70 ? '#16a34a' : dashData.water.quality_score >= 50 ? '#d97706' : '#dc2626' }}>
                          {dashData.water.quality_score}
                        </div>
                        <div className="text-[10px] text-gray-400">/ 100</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-2">
                      {dashData.water.quality_score >= 70 ? '✅ Good' : dashData.water.quality_score >= 50 ? '⚠️ Moderate' : '🚨 Poor'} Water Quality
                    </div>
                    <div className="text-xs text-gray-400">{dashData.water.safe_tests_pct}% of recent tests passed</div>
                  </div>
                  <div className="space-y-2">
                    {(dashData.water.districts || []).slice(0, 5).map((d: any) => (
                      <div key={d.district} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-20 flex-shrink-0">{d.district}</span>
                        <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${d.total ? Math.round(d.func/d.total*100) : 0}%`, background: '#16a34a' }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-8 text-right">
                          {d.total ? Math.round(d.func/d.total*100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent GWN reports */}
              {dashData.gwn.recent.length > 0 && (
                <div className="card">
                  <h3 className="section-title mb-3"><Eye size={16} className="text-purple-500" /> Recent Community Reports</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {dashData.gwn.recent.map((r: any, i: number) => (
                      <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${SEVERITY_BADGE[r.severity] || SEVERITY_BADGE.medium}`}>{r.severity?.toUpperCase()}</span>
                          <span className="text-xs text-gray-500">{r.district}</span>
                        </div>
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 capitalize">{r.report_type?.replace(/_/g,' ')}</div>
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{r.description}</div>
                        <div className="text-[10px] text-gray-300 mt-1">{new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ EDUCATION TAB ══ */}
      {tab === 'education' && (
        <div className="space-y-5">
          <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#064e3b,#0891b2)' }}>
            <div className="flex items-center gap-2 mb-1"><BookOpen size={16} className="text-emerald-300" /><span className="font-bold">Environmental Education Centre</span></div>
            <p className="text-sm text-emerald-100">Learn about water conservation, climate change, pollution prevention, and your rights as a citizen.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {EDUCATION_CONTENT.map((e, i) => (
              <div key={i} className="card hover:shadow-md transition-shadow cursor-pointer flex flex-col"
                onClick={() => setExpandedEdu(expandedEdu === i ? null : i)}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-3xl flex-shrink-0">{e.icon}</div>
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: e.color }}>{e.tag}</span>
                    <div className="font-semibold text-sm text-gray-800 dark:text-gray-100 mt-1">{e.title}</div>
                  </div>
                </div>
                {expandedEdu === i && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    {e.body}
                  </div>
                )}
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-xs text-emerald-600 font-semibold">
                    {expandedEdu === i ? '▲ Less' : '▼ Read more'}
                  </span>
                  {e.link && (
                    <a href={e.link} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline" onClick={ev => ev.stopPropagation()}>
                      WHO Resource →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Environmental tips */}
          <div className="rounded-2xl shadow-sm p-3 sm:p-5 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/60">
            <h3 className="text-base font-bold flex items-center gap-2 mb-3 text-gray-800 dark:text-gray-100">
              <Leaf size={16} className="text-green-600 dark:text-green-400" /> Daily Environmental Tips
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                '💡 Turn off lights and electronics when not in use to reduce energy consumption.',
                '🚿 Limit showers to 5 minutes to save up to 100 litres of water.',
                '🛒 Bring a reusable bag to the market — one bag saves 150 plastic bags annually.',
                '🌳 Plant one tree this season — it absorbs up to 22 kg of CO₂ per year.',
                '🚶 Walk or cycle for short distances — reduces both emissions and costs.',
                '🥦 Eat locally grown food when available — reduces transport emissions.',
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <ChevronRight size={14} className="text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ TRANSPARENCY TAB ══ */}
      {tab === 'transparency' && (
        <div className="space-y-5">
          <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#1e1b4b,#2563eb)' }}>
            <div className="flex items-center gap-2 mb-1"><Globe size={16} className="text-blue-300" /><span className="font-bold">Public Transparency Portal</span></div>
            <p className="text-sm text-blue-100">View environmental incident statistics, government responses, and NGO activities in your community.</p>
          </div>

          {dashLoad ? loadingCard() : dashData && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total GWN Reports', value: dashData.gwn.total, icon: '📋', color: '#2563eb' },
                  { label: 'Critical Incidents', value: dashData.gwn.critical, icon: '🚨', color: '#dc2626' },
                  { label: 'Reported Today', value: dashData.gwn.today, icon: '📅', color: '#d97706' },
                  { label: 'Water Points Monitored', value: dashData.water.total_points, icon: '💧', color: '#16a34a' },
                ].map(s => (
                  <div key={s.label} className="card text-center">
                    <div className="text-3xl mb-2">{s.icon}</div>
                    <div className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* District water access table */}
              <div className="card p-0">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="section-title"><MapPin size={16} className="text-blue-500" /> District Water Access Status</h3>
                </div>
                <div className="table-container">
                  <table className="table">
                    <thead><tr>
                      <th className="th">District</th>
                      <th className="th">Total Sites</th>
                      <th className="th">Functional</th>
                      <th className="th">Coverage</th>
                    </tr></thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                      {(dashData.water.districts || []).map((d: any) => {
                        const pct = d.total ? Math.round(d.func / d.total * 100) : 0;
                        return (
                          <tr key={d.district} className="tr">
                            <td className="td font-semibold">{d.district}</td>
                            <td className="td">{d.total}</td>
                            <td className="td"><span className="text-green-600 font-bold">{d.func}</span></td>
                            <td className="td">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626' }} />
                                </div>
                                <span className="text-xs font-bold w-9 text-right">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent alerts timeline */}
              {dashData.alerts.recent.length > 0 && (
                <div className="card">
                  <h3 className="section-title mb-4"><Zap size={16} className="text-yellow-500" /> Recent Environmental Alerts</h3>
                  <div className="space-y-3">
                    {dashData.alerts.recent.map((a: any, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.severity === 'critical' || a.severity === 'emergency' ? '#dc2626' : a.severity === 'warning' ? '#d97706' : '#2563eb' }} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{a.title}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${SEVERITY_BADGE[a.severity] || SEVERITY_BADGE.medium}`}>{a.severity?.toUpperCase()}</span>
                          </div>
                          <div className="text-xs text-gray-400">{a.district} · {new Date(a.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card" style={{ background: 'linear-gradient(135deg,#f5f3ff,#eff6ff)', border: '1px solid #c4b5fd' }}>
                <h3 className="section-title mb-3"><Award size={16} className="text-purple-600" /> Your Rights as a Citizen</h3>
                <div className="space-y-2">
                  {[
                    'You have the right to clean, safe water under Uganda\'s National Water Act.',
                    'You can request water quality test results from your District Water Office.',
                    'Report unresolved water issues to the Ministry of Water & Environment.',
                    'Water User Committees are legally required to share financial records publicly.',
                    'You can submit FOI (Freedom of Information) requests for environmental data.',
                  ].map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle size={14} className="text-purple-500 flex-shrink-0 mt-0.5" />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ DISCUSSIONS TAB ══ */}
      {tab === 'discussions' && (
        <div className="space-y-4">
          {/* Category filter + new post */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {DISC_CATS.map(c => (
                <button key={c.value} onClick={() => setDiscCat(c.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all
                    ${discCat === c.value ? 'text-white shadow' : 'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700'}`}
                  style={discCat === c.value ? { background: c.color } : undefined}>
                  {c.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNewDisc(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center gap-2 shadow flex-shrink-0 transition-colors">
              <Plus size={14} /> New Post
            </button>
          </div>

          {/* New discussion form */}
          {showNewDisc && (
            <div className="card border-2 border-emerald-200 dark:border-emerald-800">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-3">Start a New Discussion</h3>
              <form onSubmit={submitDiscussion} className="space-y-3">
                <div>
                  <label className="label">Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DISC_CATS.slice(1).map(c => (
                      <button key={c.value} type="button" onClick={() => setNewDiscCat(c.value)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${newDiscCat === c.value ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                        style={newDiscCat === c.value ? { background: c.color } : undefined}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input className="input" required placeholder="Discussion title..."
                  value={newDiscTitle} onChange={e => setNewDiscTitle(e.target.value)} />
                <textarea className="input" rows={4} required placeholder="Share your thoughts, questions, or observations..."
                  value={newDiscBody} onChange={e => setNewDiscBody(e.target.value)} />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowNewDisc(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={discSaving}
                    className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#065f46,#0891b2)' }}>
                    {discSaving && <Loader2 size={13} className="animate-spin" />}
                    {discSaving ? 'Posting...' : '📤 Post Discussion'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Discussion list */}
          {discLoad ? (
            <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-emerald-500" /></div>
          ) : discussions.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              <MessageSquare size={32} className="mx-auto mb-2 text-gray-300" />
              <p>No discussions yet in this category.</p>
              <button onClick={() => setShowNewDisc(true)} className="mt-3 text-sm text-emerald-600 hover:underline">Start the first one →</button>
            </div>
          ) : (
            <div className="space-y-3">
              {discussions.map(d => {
                const cat = DISC_CATS.find(c => c.value === d.category);
                return (
                  <div key={d.id} className="card hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden" style={{ background: 'linear-gradient(135deg,#065f46,#0891b2)' }}>
                        {d.user_avatar
                          ? <img src={d.user_avatar} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                              {d.author_name?.charAt(0).toUpperCase()}
                            </div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">{d.title}</span>
                          {d.pinned === 1 && <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full border border-yellow-200">📌 PINNED</span>}
                          {cat && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: cat.color }}>{cat.label}</span>}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{d.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span>👤 {d.author_name}</span>
                          <span>🕐 {new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <button onClick={() => handleLike(d.id)}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${d.i_liked ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                          <ThumbsUp size={12} /> {d.like_count}
                        </button>
                        <button onClick={() => toggleReplies(d.id)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                          <MessageSquare size={12} /> {d.reply_count}
                        </button>
                      </div>
                    </div>

                    {/* Replies section */}
                    {expandedDisc === d.id && (
                      <div className="mt-3 pl-3 border-l-2 border-emerald-200 dark:border-emerald-800 space-y-2">
                        {(replies[d.id] || []).map((r: any, i: number) => (
                          <div key={i} className="text-sm bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1">
                              {r.user_avatar
                                ? <img src={r.user_avatar} className="w-5 h-5 rounded-lg object-cover" alt="" />
                                : <div className="w-5 h-5 rounded-lg bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">{r.author_name?.charAt(0)}</div>}
                              <span className="font-semibold text-xs text-gray-700 dark:text-gray-300">{r.author_name}</span>
                              <span className="text-[10px] text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">{r.content}</p>
                          </div>
                        ))}
                        <div className="flex gap-2 mt-2">
                          <input className="input flex-1 text-sm py-2"
                            placeholder="Write a reply..."
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(d.id); } }} />
                          <button onClick={() => submitReply(d.id)} disabled={replySaving || !replyText.trim()}
                            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors">
                            {replySaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ VOLUNTEER TAB ══ */}
      {tab === 'volunteer' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="rounded-xl p-4 text-white flex-1" style={{ background: 'linear-gradient(135deg,#4c1d95,#7c3aed)' }}>
              <div className="flex items-center gap-2 mb-1"><Heart size={16} className="text-purple-300" /><span className="font-bold">Volunteer & Community Action</span></div>
              <p className="text-sm text-purple-100">Join clean-up drives, tree planting events, and environmental campaigns in your district.</p>
            </div>
            {canCreateEvent && (
              <button onClick={() => setShowNewEv(true)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow flex-shrink-0 transition-colors">
                <Plus size={14} /> Create Event
              </button>
            )}
          </div>

          {evMsg && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{evMsg}</div>}

          {showNewEv && (
            <div className="card border-2 border-purple-200 dark:border-purple-800">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-3">Create Volunteer Event</h3>
              <form onSubmit={createEvent} className="space-y-3">
                <input className="input" required placeholder="Event title *" value={evForm.title} onChange={e => setEvForm(f => ({ ...f, title: e.target.value }))} />
                <textarea className="input" rows={3} placeholder="Describe the event and what volunteers will do..." value={evForm.description} onChange={e => setEvForm(f => ({ ...f, description: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Event Type</label>
                    <select className="input" value={evForm.event_type} onChange={e => setEvForm(f => ({ ...f, event_type: e.target.value }))}>
                      {Object.entries(EVENT_TYPES).map(([v, t]) => <option key={v} value={v}>{t.icon} {t.label}</option>)}
                    </select></div>
                  <div><label className="label">District</label>
                    <select className="input" value={evForm.district} onChange={e => setEvForm(f => ({ ...f, district: e.target.value }))}>
                      {UGANDA_DISTRICTS.map(d => <option key={d}>{d}</option>)}
                    </select></div>
                  <div><label className="label">Date *</label><input type="date" className="input" required value={evForm.event_date} onChange={e => setEvForm(f => ({ ...f, event_date: e.target.value }))} /></div>
                  <div><label className="label">Time</label><input type="time" className="input" value={evForm.event_time} onChange={e => setEvForm(f => ({ ...f, event_time: e.target.value }))} /></div>
                  <div><label className="label">Location / Venue</label><input className="input" placeholder="Meeting point..." value={evForm.location} onChange={e => setEvForm(f => ({ ...f, location: e.target.value }))} /></div>
                  <div><label className="label">Max Volunteers</label><input type="number" className="input" min="1" max="500" value={evForm.max_volunteers} onChange={e => setEvForm(f => ({ ...f, max_volunteers: e.target.value }))} /></div>
                </div>
                <div className="flex gap-3"><button type="button" onClick={() => setShowNewEv(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={evSaving} className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
                    {evSaving && <Loader2 size={13} className="animate-spin" />} {evSaving ? 'Creating...' : '📅 Create Event'}
                  </button></div>
              </form>
            </div>
          )}

          {evLoad ? (
            <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-purple-500" /></div>
          ) : events.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              <Calendar size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="font-semibold">No upcoming volunteer events</p>
              <p className="text-sm mt-1">Check back soon or ask your community leader to create one.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {events.map((ev: any) => {
                const et = EVENT_TYPES[ev.event_type] || { label: ev.event_type, color: '#6b7280', icon: '📅' };
                const pct = Math.min(100, Math.round((ev.registered_count / ev.max_volunteers) * 100));
                const full = ev.registered_count >= ev.max_volunteers;
                return (
                  <div key={ev.id} className="card flex flex-col border-t-4" style={{ borderTopColor: et.color }}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{et.icon}</span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: et.color }}>{et.label}</span>
                        </div>
                        <div className="font-bold text-gray-800 dark:text-gray-100 mt-1">{ev.title}</div>
                      </div>
                    </div>
                    {ev.description && <p className="text-sm text-gray-500 mb-2 line-clamp-2">{ev.description}</p>}
                    <div className="space-y-1 text-xs text-gray-400 mb-3">
                      {ev.event_date && <div className="flex items-center gap-1.5"><Calendar size={10} /> {new Date(ev.event_date).toLocaleDateString()} {ev.event_time && `at ${ev.event_time}`}</div>}
                      {ev.location && <div className="flex items-center gap-1.5"><MapPin size={10} /> {ev.location}</div>}
                      {ev.district && <div className="flex items-center gap-1.5"><Globe size={10} /> {ev.district} District</div>}
                    </div>
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">{ev.registered_count} / {ev.max_volunteers} volunteers</span>
                        <span className={full ? 'text-red-600 font-bold' : 'text-emerald-600'}>{full ? 'FULL' : `${ev.max_volunteers - ev.registered_count} spots left`}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: full ? '#dc2626' : et.color }} />
                      </div>
                    </div>
                    <button
                      onClick={() => handleJoinLeave(ev)}
                      disabled={!!joiningEv[ev.id] || (full && !ev.i_joined)}
                      className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${ev.i_joined ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'text-white'}`}
                      style={ev.i_joined ? undefined : { background: full ? '#9ca3af' : et.color }}>
                      {joiningEv[ev.id] ? <Loader2 size={13} className="animate-spin" /> : null}
                      {ev.i_joined ? '✗ Leave Event' : full ? '⛔ Event Full' : '✓ Join Event'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ ACHIEVEMENTS TAB ══ */}
      {tab === 'achievements' && (
        <div className="space-y-5">
          {achLoad ? loadingCard() : achieve && (
            <>
              {/* Score card */}
              <div className="rounded-2xl p-6 text-white text-center" style={{ background: 'linear-gradient(135deg,#1e1b4b,#4f46e5,#0891b2)' }}>
                <div className="text-5xl font-black mb-2">{achieve.score}</div>
                <div className="text-xl font-bold text-blue-200 mb-1">Citizen Points</div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 border border-white/25">
                  <Star size={14} className="text-yellow-300 fill-yellow-300" />
                  <span className="font-bold text-sm">{achieve.level}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 mt-5 text-sm">
                  {[
                    { label: 'GWN Reports', value: achieve.stats.gwnCount, icon: '🚨' },
                    { label: 'Discussions', value: achieve.stats.discCount, icon: '💬' },
                    { label: 'Events Joined', value: achieve.stats.eventCount, icon: '🤝' },
                    { label: 'Observations', value: achieve.stats.obsCount, icon: '🔬' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="text-2xl">{s.icon}</div>
                      <div className="text-xl font-black">{s.value}</div>
                      <div className="text-blue-300 text-[10px]">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Badges */}
              <div className="card">
                <h3 className="section-title mb-4"><Trophy size={16} className="text-yellow-500" /> Your Badges</h3>
                {achieve.badges.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    <Trophy size={32} className="mx-auto mb-2 text-gray-200" />
                    <p>No badges yet — start reporting pollution or joining discussions to earn your first badge!</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {achieve.badges.map((b: any) => (
                      <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border border-yellow-200 dark:border-yellow-800">
                        <span className="text-2xl">{b.icon}</span>
                        <div>
                          <div className="font-bold text-sm text-gray-800 dark:text-gray-100">{b.name}</div>
                          <div className="text-xs text-gray-500">{b.description}</div>
                        </div>
                      </div>
                    ))}
                    {/* Locked badges hint */}
                    {achieve.badges.length < 11 && (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 opacity-60">
                        <span className="text-2xl grayscale">🏅</span>
                        <div className="text-xs text-gray-400">
                          {11 - achieve.badges.length} more badge{11 - achieve.badges.length !== 1 ? 's' : ''} to unlock — keep participating!
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Recent GWN Reports */}
              {achieve.myGwnReports.length > 0 && (
                <div className="card">
                  <h3 className="section-title mb-3"><Shield size={16} className="text-purple-500" /> My Pollution Reports</h3>
                  <div className="space-y-2">
                    {achieve.myGwnReports.map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-sm p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${SEVERITY_BADGE[r.severity] || SEVERITY_BADGE.medium}`}>{r.severity?.toUpperCase()}</span>
                        <span className="flex-1 capitalize text-gray-700 dark:text-gray-300">{r.report_type?.replace(/_/g,' ')}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'resolved' ? 'bg-green-100 text-green-700' : r.status === 'investigating' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* My events */}
              {achieve.myEvents.length > 0 && (
                <div className="card">
                  <h3 className="section-title mb-3"><Calendar size={16} className="text-indigo-500" /> Events I Joined</h3>
                  <div className="space-y-2">
                    {achieve.myEvents.map((e: any, i: number) => {
                      const et = EVENT_TYPES[e.event_type] || { icon: '📅', color: '#6b7280' };
                      return (
                        <div key={i} className="flex items-center gap-3 text-sm p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
                          <span className="text-base">{et.icon}</span>
                          <span className="flex-1 font-medium text-gray-700 dark:text-gray-300">{e.title}</span>
                          {e.district && <span className="text-xs text-gray-400">{e.district}</span>}
                          {e.event_date && <span className="text-xs text-gray-400">{new Date(e.event_date).toLocaleDateString()}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ SUBMIT OBSERVATION MODAL ══ */}
      {showObs && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowObs(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 sticky top-0 z-10 flex justify-between items-center"
              style={{ background: 'linear-gradient(135deg,#064e3b,#0891b2)' }}>
              <div className="flex items-center gap-2"><Eye size={18} className="text-emerald-300" /><span className="font-bold text-white">Submit Environmental Observation</span></div>
              <button onClick={() => setShowObs(false)} className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>
            <form onSubmit={submitObs} className="p-5 space-y-4">
              <div>
                <label className="label">Observation Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {OBS_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setObsForm(f => ({ ...f, observation_type: t }))}
                      className={`px-3 py-2 rounded-xl text-xs font-medium text-left border transition-all ${obsForm.observation_type === t ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-600'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">District</label>
                <select className="input" value={obsForm.district} onChange={e => setObsForm(f => ({ ...f, district: e.target.value }))}>
                  {UGANDA_DISTRICTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Location / Area</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Village, river, road..."
                    value={obsForm.location}
                    onChange={e => setObsForm(f => ({ ...f, location: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={gpsLoading}
                    title="Share my GPS location"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all flex-shrink-0 ${
                      gpsLoading
                        ? 'border-blue-300 bg-blue-50 text-blue-500'
                        : obsForm.lat
                        ? 'border-green-400 bg-green-50 text-green-700'
                        : 'border-gray-200 dark:border-gray-700 hover:border-emerald-400 hover:bg-emerald-50 text-gray-500 hover:text-emerald-700'
                    }`}
                  >
                    {gpsLoading
                      ? <Loader2 size={14} className="animate-spin" />
                      : obsForm.lat
                      ? <CheckCircle size={14} />
                      : <Navigation size={14} />}
                    <span className="hidden sm:inline">{gpsLoading ? 'Locating…' : obsForm.lat ? 'Got GPS' : 'Use GPS'}</span>
                  </button>
                </div>
                {gpsError && <p className="text-xs text-red-500 mt-1">{gpsError}</p>}
                {obsForm.lat && (
                  <a
                    href={`https://www.google.com/maps?q=${obsForm.lat},${obsForm.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 mt-1 underline underline-offset-2 hover:text-green-800 active:opacity-70"
                  >
                    <MapPin size={10} /> GPS: {obsForm.lat.toFixed(5)}°, {obsForm.lng?.toFixed(5)}° — tap to view on map
                  </a>
                )}
              </div>
              {/* Language selector */}
              <div>
                <label className="label flex items-center gap-1.5"><Languages size={13} /> Language / Lingua</label>
                <select
                  className="input"
                  value={obsLang.code}
                  onChange={e => {
                    const lang = OBS_LANGS.find(l => l.code === e.target.value) || OBS_LANGS[0];
                    setObsLang(lang);
                    setObsOriginal('');
                  }}
                >
                  {OBS_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
                {obsLang.code !== 'en-US' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    You can speak or type in {obsLang.label} — we will translate to English automatically.
                  </p>
                )}
              </div>

              {/* Description + voice */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">What did you observe? *</label>
                  <button
                    type="button"
                    onClick={handleVoiceRecord}
                    title={obsRecording ? 'Stop recording' : 'Record voice'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      obsRecording
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                    }`}
                  >
                    {obsRecording ? <MicOff size={13} /> : <Mic size={13} />}
                    {obsRecording ? 'Stop' : 'Record Voice'}
                  </button>
                </div>

                {voiceUnsupported && (
                  <p className="text-xs text-red-500 mb-1.5">Voice input requires Chrome browser. Please type instead.</p>
                )}

                {obsTranslating ? (
                  <div className="input flex items-center justify-center gap-2 text-sm text-gray-400 min-h-[80px]">
                    <Loader2 size={14} className="animate-spin text-emerald-500" />
                    Translating to English…
                  </div>
                ) : (
                  <textarea
                    className="input"
                    rows={3}
                    required
                    placeholder={obsLang.code === 'en-US'
                      ? 'Describe what you saw in detail…'
                      : `Type in ${obsLang.label} or tap Record Voice…`}
                    value={obsForm.description}
                    onChange={e => { setObsForm(f => ({ ...f, description: e.target.value })); setObsOriginal(''); }}
                  />
                )}

                {/* Original text shown after translation */}
                {obsOriginal && (
                  <div className="mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">Original ({obsLang.label}):</span> {obsOriginal}
                  </div>
                )}

                {/* Manual translate button for typed non-English text */}
                {obsLang.code !== 'en-US' && obsForm.description && !obsOriginal && !obsTranslating && (
                  <button
                    type="button"
                    onClick={handleTranslateTyped}
                    className="mt-2 w-full py-2 rounded-xl text-xs font-semibold border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-2"
                  >
                    <Languages size={13} /> Translate to English
                  </button>
                )}
              </div>
              <div>
                <label className="label">Photo Evidence (optional)</label>
                {obsPhotoUrl ? (
                  <div className="relative">
                    <img src={obsPhotoUrl} alt="preview" className="w-full max-h-44 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                    <button
                      type="button"
                      onClick={() => { setObsPhoto(null); setObsPhotoUrl(null); if (obsFileRef.current) obsFileRef.current.value = ''; if (obsCameraRef.current) obsCameraRef.current.value = ''; }}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                    >
                      <X size={13} />
                    </button>
                    <div className="absolute bottom-2 left-2 text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full">Photo ready</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => obsFileRef.current?.click()}
                      className="flex flex-col items-center gap-2 px-3 py-5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all text-gray-400 hover:text-emerald-700"
                    >
                      <ImagePlus size={22} />
                      <span className="text-xs font-semibold">From Gallery</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => obsCameraRef.current?.click()}
                      className="flex flex-col items-center gap-2 px-3 py-5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-gray-400 hover:text-blue-700"
                    >
                      <Camera size={22} />
                      <span className="text-xs font-semibold">Take Photo</span>
                    </button>
                  </div>
                )}
                <input ref={obsFileRef} type="file" accept="image/*" className="hidden" onChange={handleObsPhoto} />
                <input ref={obsCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleObsPhoto} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowObs(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={obsSaving}
                  className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#064e3b,#0891b2)' }}>
                  {obsSaving && <Loader2 size={13} className="animate-spin" />}
                  {obsSaving ? 'Submitting...' : '🔬 Submit Observation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {obsMsg && (
        <div className="fixed bottom-24 right-6 z-50 px-5 py-3 bg-green-600 text-white rounded-2xl shadow-2xl text-sm font-semibold animate-fade-in flex items-center gap-2">
          <CheckCircle size={16} /> {obsMsg}
          <button onClick={() => setObsMsg('')} className="ml-2 text-white/70 hover:text-white"><X size={14}/></button>
        </div>
      )}
    </div>
  );
}
