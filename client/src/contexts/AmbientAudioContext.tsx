import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useAmbientAudio } from '../hooks/useAmbientAudio';

type AmbientAudioApi = ReturnType<typeof useAmbientAudio>;

interface AmbientContextType extends AmbientAudioApi {
  isNarrating: boolean;
  stopNarration: () => void;
  startNarration: () => void;
  voiceName: string;
  voicesReady: boolean;
  currentSubtitle: string;
  isAIVisible: boolean;
  showAI: () => void;
  hideAI: () => void;
  activeAlerts: number;
}

const AmbientContext = createContext<AmbientContextType | null>(null);

interface SentenceDef {
  text: string;
  section?: string;
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function generateScript(userName: string, role: string): SentenceDef[] {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const tod = getTimeOfDay();
  const greeting = tod === 'morning' ? 'Good morning' : tod === 'afternoon' ? 'Good afternoon' : 'Good evening';

  return [
    { text: `${greeting}, ${userName}.` },
    { text: `Welcome to HydroSense — Uganda's national smart water governance platform.` },
    { text: `All systems are fully operational and you are connected to the Hydro Intelligence Network.` },
    { text: `Community systems, environmental monitoring, and AI analytics are active.` },
    { text: `Your dashboard is ready, ${roleLabel}.` },

    { text: `Let me explain what HydroSense can do for you.`, section: 'overview' },
    { text: `HydroSense is an intelligent water management system that combines real-time IoT sensors, AI-powered analytics, community reporting, and emergency response coordination across all 15 districts.` },
    { text: `The platform monitors water quality, flow rates, solar voltage, and rainfall through thousands of connected sensors deployed nationwide.` },
    { text: `This data is processed in real time by our AI engine to detect anomalies, predict maintenance needs, and alert authorities before problems escalate.` },

    { text: `The AI Assistant, which is speaking to you now, can answer questions, provide system recommendations, predict drought conditions up to six months ahead, and help you make informed decisions about water resource management.`, section: 'ai' },
    { text: `I analyse system-wide data continuously to identify patterns, forecast risks, and suggest optimisation strategies.` },
    { text: `You can find my detailed recommendations on the AI Hub page at any time.` },

    { text: `The Community Hub allows citizens to submit reports about water point issues, quality concerns, or maintenance needs.`, section: 'community' },
    { text: `Each report is tracked, verified, and routed to the appropriate response team automatically.` },
    { text: `The system provides full transparency — reporters receive updates when action is taken.` },

    { text: `The Emergency Center provides instant alerts for contamination events, drought emergencies, or infrastructure collapse.`, section: 'emergency' },
    { text: `Notifications are sent simultaneously via push, SMS, and in-app messaging to ensure rapid response from all relevant authorities.` },

    { text: `The GIS Map gives you an interactive spatial view of all water infrastructure across Uganda.`, section: 'gis' },
    { text: `Water points are colour-coded by status — green for functional, red for non-functional, and orange for maintenance needed.` },

    { text: `The IoT Sensor Network tracks flow rate, water level, pH, turbidity, chlorine, and solar voltage in real time.`, section: 'sensors' },
    { text: `Green sensors are online and reporting. Red sensors need immediate attention.` },

    { text: `Your dashboard displays key metrics — water points, active alerts, system health, and your risk index score.`, section: 'dashboard' },
    { text: `Each metric updates in real time and links to detailed views for deeper analysis.` },

    { text: `You are now ready to use HydroSense.`, section: 'ready' },
    { text: `Explore the system using the sidebar navigation on your left. Click any card on your dashboard to drill into detailed data.` },
    { text: `For help at any time, use the AI chat assistant at the bottom right or contact your system administrator.` },
    { text: `Thank you for listening. Welcome to HydroSense — the future of water intelligence.` },
  ];
}

const SENTENCES = generateScript('User', 'citizen');

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const priority = [
    'Microsoft Jenny Natural',
    'Google UK Female',
    'Microsoft Zira',
    'Samantha',
    'Microsoft Hazel',
    'Microsoft Sonia',
    'Microsoft Clara',
    'Google US English',
    'Microsoft Catherine',
    'Microsoft Linda',
  ];
  for (const name of priority) {
    const found = voices.find(v => v.name.includes(name));
    if (found) return found;
  }
  return voices.find(v => /female/i.test(v.name));
}

export function AmbientAudioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const audio = useAmbientAudio();

  const prevUserId = useRef<number | undefined>(undefined);
  const stopRef = useRef(false);
  const preVolumeRef = useRef(audio.prefs.volume);
  const scriptRef = useRef<SentenceDef[]>(SENTENCES);

  const [isNarrating, setIsNarrating] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [voicesReady, setVoicesReady] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [isAIVisible, setIsAIVisible] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);

  useEffect(() => {
    preVolumeRef.current = audio.prefs.volume;
  }, [audio.prefs.volume]);

  useEffect(() => {
    const init = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setVoicesReady(true);
      const v = pickVoice(voices);
      if (v) {
        voiceRef.current = v;
        setVoiceName(v.name);
      } else if (voices.length > 0) {
        voiceRef.current = voices[0];
        setVoiceName(voiceRef.current.name);
      }
    };
    init();
    window.speechSynthesis.addEventListener('voiceschanged', init);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', init);
  }, []);

  useEffect(() => {
    const unlock = () => {
      window.speechSynthesis.cancel();
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  const restoreVolume = useCallback(() => {
    audio.setAudioVolume(preVolumeRef.current);
  }, [audio]);

  const stopNarration = useCallback(() => {
    stopRef.current = true;
    window.speechSynthesis.cancel();
    setIsNarrating(false);
    setCurrentSubtitle('');
    restoreVolume();
  }, [restoreVolume]);

  const speakSingle = useCallback((text: string, onDone?: () => void) => {
    if (!voiceRef.current) {
      const voices = window.speechSynthesis.getVoices();
      const v = pickVoice(voices);
      if (v) voiceRef.current = v;
      else if (voices.length > 0) voiceRef.current = voices[0];
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.82;
    utterance.pitch = 1.05;
    utterance.volume = 0.9;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onend = onDone ?? null;
    utterance.onerror = () => {
      setTimeout(onDone ?? (() => {}), 300);
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const startNarration = useCallback(() => {
    const name = user?.name || 'User';
    const role = user?.role || 'citizen';
    const script = generateScript(name, role);
    scriptRef.current = script;

    stopRef.current = true;
    window.speechSynthesis.cancel();
    stopRef.current = false;
    preVolumeRef.current = audio.prefs.volume;
    audio.setAudioVolume(0.03);
    setIsNarrating(true);
    setIsAIVisible(true);

    let index = 0;
    const next = () => {
      if (stopRef.current) return;
      if (index >= script.length) {
        setIsNarrating(false);
        setCurrentSubtitle('');
        restoreVolume();
        return;
      }
      const sentence = script[index];
      setCurrentSubtitle(sentence.text);
      speakSingle(sentence.text, next);
      index++;
    };
    const pause = setTimeout(next, 400);
    return () => clearTimeout(pause);
  }, [speakSingle, restoreVolume, audio, user?.name, user?.role]);

  const showAI = useCallback(() => setIsAIVisible(true), []);
  const hideAI = useCallback(() => setIsAIVisible(false), []);

  useEffect(() => {
    if (user?.id && prevUserId.current !== user.id) {
      prevUserId.current = user.id;
      audio.play();
      const t = setTimeout(() => {
        startNarration();
      }, 600);
      return () => clearTimeout(t);
    } else if (!user) {
      audio.stop();
      stopNarration();
      prevUserId.current = undefined;
    }
  }, [user?.id]);

  return (
    <AmbientContext.Provider value={{
      ...audio, isNarrating, stopNarration, startNarration,
      voiceName, voicesReady, currentSubtitle, isAIVisible, showAI, hideAI, activeAlerts,
    }}>
      {children}
    </AmbientContext.Provider>
  );
}

export function useAmbient() {
  const ctx = useContext(AmbientContext);
  if (!ctx) throw new Error('useAmbient must be used within AmbientAudioProvider');
  return ctx;
}
