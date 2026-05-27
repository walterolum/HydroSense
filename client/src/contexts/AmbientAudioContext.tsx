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

const GUIDE = [
  "Welcome to HydroSense, Uganda's national smart water governance platform. I will now guide you through every feature so you can use the system effectively. Please listen carefully as I explain each section.",
  "Your dashboard is the main control centre. At the top, you see your connection status, AI service status, and the current time. On the left panel, you find your profile card showing your name, role, and district. Below are four key metrics: water points count, active alerts, system health percentage, and your risk index score. These give you an instant snapshot of your water system's health.",
  "The main grid displays six stat cards: functional rate, active alerts, pending maintenance, sensors online, unsafe water tests, and pending reports. Each card shows a number with a trend indicator. Click any card to drill down for more details. Green numbers mean good performance, red numbers need your attention.",
  "The System Health panel shows four progress bars: water infrastructure, alert response, sensor network, and maintenance coverage. Each bar is colour coded green for good, yellow for moderate, and red for critical. Below that, the Upcoming Events section lists scheduled community meetings and maintenance activities. Click View All Events to see your full calendar.",
  "The Live Feed panel shows real-time notifications from across the system. Each notification has a coloured dot: red for urgent, orange for high priority, and cyan for information. Click any notification to take action. New alerts appear instantly without refreshing the page.",
  "To monitor water points, click the Water Points icon in the Quick Actions grid or use the sidebar menu. The water infrastructure page shows all 51 water points across 15 districts. You can filter by district, status, or type. Each water point card shows its location, yield in litres per hour, solar power status, and last maintenance date. Click a water point to see its full history and sensor data.",
  "The IoT Sensor page displays all connected sensors across your water network. Sensors track flow rate, water level, pH, turbidity, chlorine levels, solar voltage, and rainfall. The page shows a sensor health overview and a detailed list. Green sensors are online and reporting. Red sensors need attention. Click any sensor for a full data timeline.",
  "The AI Hub is your intelligent command centre. It analyses all system data and provides risk assessments, predictive forecasts up to six months ahead, and actionable recommendations. Visit the AI Hub regularly to review drought predictions, maintenance forecasts, and system optimisation suggestions. The AI Intelligence panel on your dashboard shows your top priority recommendations.",
  "The GIS Map provides an interactive spatial view of all water infrastructure. Water points appear as coloured markers: green for functional, red for non functional, orange for needs repair. You can click any marker for details, zoom in and out, and filter by district. The map also shows health incident clusters and flood risk zones.",
  "To submit a community report, go to the Citizen Hub or click Community in the sidebar. You can report water point issues, water quality concerns, or maintenance needs. Attach photos and provide a description. Your report will be tracked and you will receive updates when action is taken.",
  "The Emergency Center is for urgent situations like contamination events, drought emergencies, or infrastructure collapse. Click Emergency in the sidebar. Use the alert button to notify all relevant authorities. The system will send instant push notifications, SMS alerts, and in-app messages to the response team.",
  "The Governance section provides transparency tools for water management. View budgets, project timelines, and performance reports. District officers and national administrators can manage user roles and access permissions in the User Management section.",
  "To manage maintenance tasks, open the Maintenance page from the sidebar. View all pending work orders, assign technicians, track progress, and close completed tasks. Each work order includes the water point details, issue description, priority level, and assigned technician.",
  "The navigation sidebar on the left gives you access to all sections of HydroSense. Use it to jump between dashboard, water infrastructure, sensors, climate monitoring, water quality, maintenance, community, health, emergency, GIS, analytics, governance, and the AI Hub. The search bar at the top helps you find specific water points, districts, or reports quickly.",
  "You are now ready to use HydroSense. Start by exploring your dashboard, check your water points, review AI recommendations, and respond to any active alerts. For help, use the AI chatbot at the bottom right corner or contact your system administrator. Thank you for listening, and welcome to HydroSense.",
];

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
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
  const [isNarrating, setIsNarrating] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);

  useEffect(() => {
    const init = () => {
      const v = pickVoice();
      if (v) {
        voiceRef.current = v;
        setVoiceName(v.name);
      } else if (window.speechSynthesis.getVoices().length > 0) {
        voiceRef.current = window.speechSynthesis.getVoices()[0];
        setVoiceName(voiceRef.current.name);
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
    utterance.rate = 0.78;
    utterance.pitch = 1.0;
    utterance.volume = 0.75;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onend = onDone ?? null;
    utterance.onerror = () => onDone?.();
    window.speechSynthesis.speak(utterance);
  }, []);

  const startNarration = useCallback(() => {
    stopRef.current = false;
    setIsNarrating(true);
    let index = 0;
    const next = () => {
      if (stopRef.current || index >= GUIDE.length) {
        setIsNarrating(false);
        return;
      }
      speakSingle(GUIDE[index], next);
      index++;
    };
    const pause = setTimeout(next, 400);
    return () => clearTimeout(pause);
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
        }, 2000);
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
