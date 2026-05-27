import { useCallback, useRef, useEffect } from 'react';

export type NotificationSound = 'chime' | 'new_event' | 'event_start' | 'reminder' | 'mention' | 'reply' | 'alert';

interface SoundPreferences {
  volume: number;
  muted: boolean;
  soundMap: Record<NotificationSound, string>;
}

const DEFAULT_PREFS: SoundPreferences = {
  volume: 0.7,
  muted: false,
  soundMap: {
    chime: 'chime',
    new_event: 'new_event',
    event_start: 'event_start',
    reminder: 'reminder',
    mention: 'mention',
    reply: 'reply',
    alert: 'alert',
  },
};

function loadPrefs(): SoundPreferences {
  try {
    const raw = localStorage.getItem('hs_notif_sound_prefs');
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

function savePrefs(prefs: SoundPreferences) {
  localStorage.setItem('hs_notif_sound_prefs', JSON.stringify(prefs));
}

// Synthesize notification tones using Web Audio API — no external files needed
function playSynthesizedTone(type: NotificationSound, volume: number) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'chime': {
        // Soft two-tone chime: C5 → E5
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 523.25;
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0.001, now);
        g1.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc1.connect(g1).connect(masterGain);
        osc1.start(now);
        osc1.stop(now + 0.25);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 659.25;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.001, now + 0.12);
        g2.gain.exponentialRampToValueAtTime(0.3, now + 0.14);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc2.connect(g2).connect(masterGain);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.45);
        break;
      }
      case 'new_event': {
        // Rising three-note arpeggio: C5 → E5 → G5
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          const g = ctx.createGain();
          const t = now + i * 0.12;
          g.gain.setValueAtTime(0.001, t);
          g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc.connect(g).connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.3);
        });
        break;
      }
      case 'event_start': {
        // Urgent descending alarm: G5 → E5 → C5 → G4 (repeated)
        const notes = [783.99, 659.25, 523.25, 392];
        for (let rep = 0; rep < 2; rep++) {
          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            const t = now + rep * 0.8 + i * 0.15;
            g.gain.setValueAtTime(0.001, t);
            g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
            osc.connect(g).connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.14);
          });
        }
        break;
      }
      case 'reminder': {
        // Gentle two-note pulse: A4 → A4
        [440, 440].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const g = ctx.createGain();
          const t = now + i * 0.3;
          g.gain.setValueAtTime(0.001, t);
          g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          osc.connect(g).connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.2);
        });
        break;
      }
      case 'mention': {
        // Quick bright chirp
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(g).connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }
      case 'reply': {
        // Soft pop
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 660;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(g).connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }
      case 'alert': {
        // Short emergency beep
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 660;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
        g.gain.linearRampToValueAtTime(0.15, now + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g).connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
    }

    // Clean up after all sounds finish
    setTimeout(() => ctx.close(), type === 'event_start' ? 2000 : 1000);
  } catch {}
}

export function useNotificationSound() {
  const prefsRef = useRef<SoundPreferences>(loadPrefs());

  useEffect(() => {
    prefsRef.current = loadPrefs();
  }, []);

  const play = useCallback((type: NotificationSound = 'chime') => {
    const prefs = loadPrefs();
    prefsRef.current = prefs;
    if (prefs.muted) return;
    playSynthesizedTone(type, prefs.volume);
  }, []);

  const preview = useCallback((type: NotificationSound) => {
    playSynthesizedTone(type, 0.5);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const prefs = loadPrefs();
    prefs.volume = Math.max(0, Math.min(1, vol));
    savePrefs(prefs);
    prefsRef.current = prefs;
  }, []);

  const setMuted = useCallback((m: boolean) => {
    const prefs = loadPrefs();
    prefs.muted = m;
    savePrefs(prefs);
    prefsRef.current = prefs;
  }, []);

  const getPrefs = useCallback(() => loadPrefs(), []);

  return { play, preview, setVolume, setMuted, getPrefs };
}
