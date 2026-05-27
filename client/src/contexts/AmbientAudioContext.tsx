import { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getSmartDashboardWelcome } from '../api/client';
import { useAmbientAudio } from '../hooks/useAmbientAudio';

type AmbientAudioApi = ReturnType<typeof useAmbientAudio>;

const AmbientAudioContext = createContext<AmbientAudioApi | null>(null);

const WELCOME_KEY = 'hs_welcome_spoken';

function speak(text: string) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 0.7;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    v => v.name.includes('Google UK Female') || v.name.includes('Samantha') || v.name.includes('Microsoft Zira')
  );
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

export function AmbientAudioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const audio = useAmbientAudio();
  const prevUserId = useRef<number | undefined>(undefined);

  const speakWelcome = useCallback(async () => {
    try {
      const res = await getSmartDashboardWelcome();
      const data = res.data.data;
      if (data?.greeting) {
        speak(`${data.greeting}. ${data.motivational || ''}. ${data.aiInsight || ''}`);
      }
    } catch {
      speak('Welcome to HydroSense, your water management system.');
    }
  }, []);

  useEffect(() => {
    if (user?.id && prevUserId.current !== user.id) {
      prevUserId.current = user.id;
      audio.play();
      const already = sessionStorage.getItem(`${WELCOME_KEY}_${user.id}`);
      if (!already) {
        const t = setTimeout(() => {
          speakWelcome();
          sessionStorage.setItem(`${WELCOME_KEY}_${user.id}`, 'true');
        }, 1500);
        return () => clearTimeout(t);
      }
    } else if (!user) {
      audio.stop();
    }
  }, [user?.id]);

  return (
    <AmbientAudioContext.Provider value={audio}>
      {children}
    </AmbientAudioContext.Provider>
  );
}

export function useAmbient() {
  const ctx = useContext(AmbientAudioContext);
  if (!ctx) throw new Error('useAmbient must be used within AmbientAudioProvider');
  return ctx;
}
