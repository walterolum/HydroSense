import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useAmbientAudio } from '../hooks/useAmbientAudio';

type AmbientAudioApi = ReturnType<typeof useAmbientAudio>;

interface AmbientContextType extends AmbientAudioApi {
  isNarrating: boolean;
  stopNarration: () => void;
  startNarration: () => void;
  voiceName: string;
}

const AmbientContext = createContext<AmbientContextType | null>(null);

const WELCOME_KEY = 'hs_welcome_spoken';

const EXPLANATION = [
  "Welcome to HydroSense, Uganda's national smart water governance platform. I am your AI companion, here to guide you through our comprehensive water management system.",
  "Our platform monitors over 51 water access points across 15 districts, providing real-time data on water availability, quality, and infrastructure health at your fingertips.",
  "IoT sensors deployed at water points continuously track flow rates, water levels, solar power status, and critical quality parameters including pH, turbidity, and chlorine levels. All sensor data updates in real time, giving you complete visibility.",
  "Our AI forecasting engine is the brain of the system. It analyzes historical data and climate patterns to predict drought risks, water demand fluctuations, and potential infrastructure failures up to six months in advance, enabling proactive management.",
  "The health surveillance module integrates with the Ministry of Health to link water quality data with disease outbreak tracking. This enables early warning for waterborne diseases such as cholera, typhoid, and dysentery, potentially saving thousands of lives.",
  "Community engagement is at the heart of HydroSense. Citizens can submit reports about water point issues, maintenance needs, and water quality concerns through the Citizen Hub and mobile application. Every voice matters in building a resilient water system.",
  "Our real-time alert system sends instant push notifications, SMS messages, and in-app alerts for water point failures, contamination events, drought warnings, and climate emergencies. You are always informed, always prepared.",
  "The interactive GIS mapping system provides spatial visualizations of water point locations, health incident clusters, flood risk zones, and district coverage. You can explore data geographically and act on location intelligence.",
  "Powerful analytics dashboards, maintenance tracking, task assignments, and governance tools help you collaborate effectively across the entire water management ecosystem.",
  "HydroSense is your comprehensive solution for climate-resilient water management across Uganda. Explore your dashboard to monitor water points, review AI insights, and take action. Together, we can ensure clean water for every community.",
];

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const priority = [
    'Google UK Female',
    'Samantha',
    'Microsoft Jenny Natural',
    'Microsoft Zira',
    'Microsoft Hazel',
    'Microsoft Susan',
    'Google US English',
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
  const [isNarrating, setIsNarrating] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);

  useEffect(() => {
    const init = () => {
      const v = pickVoice();
      if (v) {
        voiceRef.current = v;
        setVoiceName(v.name);
      }
    };
    init();
    window.speechSynthesis.addEventListener('voiceschanged', init);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', init);
  }, []);

  const stopNarration = useCallback(() => {
    stopRef.current = true;
    window.speechSynthesis.cancel();
    setIsNarrating(false);
  }, []);

  const speakSingle = useCallback((text: string, onDone?: () => void) => {
    if (stopRef.current) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 0.7;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onend = onDone ?? null;
    window.speechSynthesis.speak(utterance);
  }, []);

  const startNarration = useCallback(() => {
    stopRef.current = false;
    setIsNarrating(true);
    let index = 0;
    const next = () => {
      if (stopRef.current || index >= EXPLANATION.length) {
        setIsNarrating(false);
        return;
      }
      speakSingle(EXPLANATION[index], next);
      index++;
    };
    next();
  }, [speakSingle]);

  useEffect(() => {
    if (user?.id && prevUserId.current !== user.id) {
      prevUserId.current = user.id;
      audio.play();
      const already = sessionStorage.getItem(`${WELCOME_KEY}_${user.id}`);
      if (!already) {
        const t = setTimeout(() => {
          startNarration();
          sessionStorage.setItem(`${WELCOME_KEY}_${user.id}`, 'true');
        }, 1500);
        return () => clearTimeout(t);
      }
    } else if (!user) {
      audio.stop();
      stopNarration();
    }
  }, [user?.id]);

  return (
    <AmbientContext.Provider value={{ ...audio, isNarrating, stopNarration, startNarration, voiceName }}>
      {children}
    </AmbientContext.Provider>
  );
}

export function useAmbient() {
  const ctx = useContext(AmbientContext);
  if (!ctx) throw new Error('useAmbient must be used within AmbientAudioProvider');
  return ctx;
}
