import { useRef, useCallback, useState, useEffect } from 'react';

export type AmbientTheme = 'jarvis' | 'cyberpunk' | 'nature' | 'crystal' | 'deepspace';

interface AmbientPrefs {
  enabled: boolean;
  theme: AmbientTheme;
  volume: number;
  muted: boolean;
}

const DEFAULT_PREFS: AmbientPrefs = {
  enabled: true,
  theme: 'jarvis',
  volume: 0.15,
  muted: false,
};

const STORAGE_KEY = 'hs_ambient_audio_prefs';

function loadPrefs(): AmbientPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

function savePrefs(prefs: AmbientPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

interface NoteDef {
  freq: number;
  gain: number;
  type: OscillatorType;
  detune?: number;
}

interface ProgressionStep {
  notes: NoteDef[];
  beats: number;
}

interface SongProfile {
  name: string;
  bpm: number;
  steps: ProgressionStep[];
}

const SONGS: Record<AmbientTheme, SongProfile> = {
  jarvis: {
    name: 'Jarvis Intelligence',
    bpm: 72,
    steps: [
      { beats: 4, notes: [
        { freq: 130.81, gain: 0.055, type: 'sine' },
        { freq: 261.63, gain: 0.04, type: 'triangle' },
        { freq: 329.63, gain: 0.035, type: 'triangle' },
        { freq: 392.00, gain: 0.03, type: 'sine' },
        { freq: 261.63, gain: 0.025, type: 'sawtooth', detune: 7 },
        { freq: 523.25, gain: 0.018, type: 'sine' },
      ]},
      { beats: 4, notes: [
        { freq: 98.00, gain: 0.055, type: 'sine' },
        { freq: 246.94, gain: 0.04, type: 'triangle' },
        { freq: 293.66, gain: 0.035, type: 'triangle' },
        { freq: 392.00, gain: 0.03, type: 'sine' },
        { freq: 196.00, gain: 0.025, type: 'sawtooth', detune: 7 },
        { freq: 493.88, gain: 0.018, type: 'sine' },
      ]},
      { beats: 4, notes: [
        { freq: 110.00, gain: 0.05, type: 'sine' },
        { freq: 220.00, gain: 0.04, type: 'triangle' },
        { freq: 261.63, gain: 0.03, type: 'triangle' },
        { freq: 329.63, gain: 0.025, type: 'sine' },
        { freq: 220.00, gain: 0.022, type: 'sawtooth', detune: -5 },
        { freq: 440.00, gain: 0.015, type: 'sine' },
      ]},
      { beats: 4, notes: [
        { freq: 87.31, gain: 0.05, type: 'sine' },
        { freq: 174.61, gain: 0.04, type: 'triangle' },
        { freq: 220.00, gain: 0.035, type: 'triangle' },
        { freq: 261.63, gain: 0.025, type: 'sine' },
        { freq: 174.61, gain: 0.022, type: 'sawtooth', detune: 7 },
        { freq: 349.23, gain: 0.015, type: 'sine' },
      ]},
      { beats: 2, notes: [
        { freq: 130.81, gain: 0.05, type: 'sine' },
        { freq: 261.63, gain: 0.04, type: 'triangle' },
        { freq: 329.63, gain: 0.035, type: 'triangle' },
        { freq: 392.00, gain: 0.03, type: 'sine' },
        { freq: 329.63, gain: 0.022, type: 'sawtooth', detune: -5 },
        { freq: 523.25, gain: 0.015, type: 'sine' },
      ]},
      { beats: 2, notes: [
        { freq: 87.31, gain: 0.05, type: 'sine' },
        { freq: 174.61, gain: 0.04, type: 'triangle' },
        { freq: 220.00, gain: 0.035, type: 'triangle' },
        { freq: 261.63, gain: 0.025, type: 'sine' },
        { freq: 174.61, gain: 0.022, type: 'sawtooth', detune: 7 },
        { freq: 349.23, gain: 0.015, type: 'sine' },
      ]},
      { beats: 4, notes: [
        { freq: 98.00, gain: 0.05, type: 'sine' },
        { freq: 196.00, gain: 0.04, type: 'triangle' },
        { freq: 246.94, gain: 0.035, type: 'triangle' },
        { freq: 293.66, gain: 0.025, type: 'sine' },
        { freq: 196.00, gain: 0.022, type: 'sawtooth', detune: -5 },
        { freq: 392.00, gain: 0.015, type: 'sine' },
      ]},
      { beats: 4, notes: [
        { freq: 130.81, gain: 0.06, type: 'sine' },
        { freq: 261.63, gain: 0.045, type: 'triangle' },
        { freq: 329.63, gain: 0.04, type: 'triangle' },
        { freq: 392.00, gain: 0.035, type: 'sine' },
        { freq: 261.63, gain: 0.025, type: 'sawtooth', detune: 7 },
        { freq: 523.25, gain: 0.02, type: 'sine' },
      ]},
    ],
  },
  nature: {
    name: 'Primal Flow',
    bpm: 68,
    steps: [
      { beats: 4, notes: [
        { freq: 146.83, gain: 0.05, type: 'sine' },
        { freq: 293.66, gain: 0.04, type: 'triangle' },
        { freq: 369.99, gain: 0.035, type: 'sine' },
        { freq: 440.00, gain: 0.025, type: 'triangle' },
        { freq: 293.66, gain: 0.02, type: 'sawtooth', detune: 6 },
      ]},
      { beats: 4, notes: [
        { freq: 110.00, gain: 0.05, type: 'sine' },
        { freq: 220.00, gain: 0.04, type: 'triangle' },
        { freq: 277.18, gain: 0.03, type: 'sine' },
        { freq: 329.63, gain: 0.025, type: 'triangle' },
        { freq: 220.00, gain: 0.02, type: 'sawtooth', detune: -6 },
      ]},
      { beats: 4, notes: [
        { freq: 98.00, gain: 0.05, type: 'sine' },
        { freq: 196.00, gain: 0.04, type: 'triangle' },
        { freq: 246.94, gain: 0.03, type: 'sine' },
        { freq: 293.66, gain: 0.025, type: 'triangle' },
        { freq: 196.00, gain: 0.02, type: 'sawtooth', detune: 6 },
      ]},
      { beats: 4, notes: [
        { freq: 130.81, gain: 0.05, type: 'sine' },
        { freq: 261.63, gain: 0.04, type: 'triangle' },
        { freq: 329.63, gain: 0.03, type: 'sine' },
        { freq: 392.00, gain: 0.025, type: 'triangle' },
        { freq: 261.63, gain: 0.02, type: 'sawtooth', detune: -6 },
      ]},
    ],
  },
  crystal: {
    name: 'Crystal Resonance',
    bpm: 62,
    steps: [
      { beats: 4, notes: [
        { freq: 110.00, gain: 0.045, type: 'sine' },
        { freq: 220.00, gain: 0.035, type: 'triangle' },
        { freq: 261.63, gain: 0.03, type: 'sine' },
        { freq: 329.63, gain: 0.02, type: 'triangle' },
        { freq: 220.00, gain: 0.018, type: 'sawtooth', detune: 5 },
      ]},
      { beats: 4, notes: [
        { freq: 87.31, gain: 0.045, type: 'sine' },
        { freq: 174.61, gain: 0.035, type: 'triangle' },
        { freq: 220.00, gain: 0.03, type: 'sine' },
        { freq: 261.63, gain: 0.02, type: 'triangle' },
        { freq: 174.61, gain: 0.018, type: 'sawtooth', detune: -5 },
      ]},
      { beats: 4, notes: [
        { freq: 130.81, gain: 0.045, type: 'sine' },
        { freq: 261.63, gain: 0.035, type: 'triangle' },
        { freq: 329.63, gain: 0.03, type: 'sine' },
        { freq: 392.00, gain: 0.02, type: 'triangle' },
        { freq: 261.63, gain: 0.018, type: 'sawtooth', detune: 5 },
      ]},
      { beats: 4, notes: [
        { freq: 98.00, gain: 0.045, type: 'sine' },
        { freq: 196.00, gain: 0.035, type: 'triangle' },
        { freq: 246.94, gain: 0.03, type: 'sine' },
        { freq: 293.66, gain: 0.02, type: 'triangle' },
        { freq: 196.00, gain: 0.018, type: 'sawtooth', detune: -5 },
      ]},
    ],
  },
  deepspace: {
    name: 'Deep Space',
    bpm: 58,
    steps: [
      { beats: 4, notes: [
        { freq: 130.81, gain: 0.05, type: 'sine' },
        { freq: 261.63, gain: 0.035, type: 'triangle' },
        { freq: 311.13, gain: 0.03, type: 'sine' },
        { freq: 392.00, gain: 0.025, type: 'triangle' },
        { freq: 261.63, gain: 0.02, type: 'sawtooth', detune: 4 },
      ]},
      { beats: 4, notes: [
        { freq: 103.83, gain: 0.045, type: 'sine' },
        { freq: 207.65, gain: 0.035, type: 'triangle' },
        { freq: 261.63, gain: 0.03, type: 'sine' },
        { freq: 311.13, gain: 0.025, type: 'triangle' },
        { freq: 207.65, gain: 0.02, type: 'sawtooth', detune: -4 },
      ]},
      { beats: 4, notes: [
        { freq: 77.78, gain: 0.045, type: 'sine' },
        { freq: 155.56, gain: 0.035, type: 'triangle' },
        { freq: 196.00, gain: 0.03, type: 'sine' },
        { freq: 233.08, gain: 0.025, type: 'triangle' },
        { freq: 155.56, gain: 0.02, type: 'sawtooth', detune: 4 },
      ]},
      { beats: 4, notes: [
        { freq: 116.54, gain: 0.045, type: 'sine' },
        { freq: 233.08, gain: 0.035, type: 'triangle' },
        { freq: 293.66, gain: 0.03, type: 'sine' },
        { freq: 349.23, gain: 0.025, type: 'triangle' },
        { freq: 233.08, gain: 0.02, type: 'sawtooth', detune: -4 },
      ]},
    ],
  },
  cyberpunk: {
    name: 'Cyber Pulse',
    bpm: 76,
    steps: [
      { beats: 4, notes: [
        { freq: 87.31, gain: 0.035, type: 'sine' },
        { freq: 174.61, gain: 0.03, type: 'sawtooth' },
        { freq: 220.00, gain: 0.025, type: 'square' },
        { freq: 261.63, gain: 0.02, type: 'triangle' },
        { freq: 174.61, gain: 0.018, type: 'sawtooth', detune: 10 },
      ]},
      { beats: 4, notes: [
        { freq: 69.30, gain: 0.035, type: 'sine' },
        { freq: 138.59, gain: 0.03, type: 'sawtooth' },
        { freq: 185.00, gain: 0.025, type: 'square' },
        { freq: 220.00, gain: 0.02, type: 'triangle' },
        { freq: 138.59, gain: 0.018, type: 'sawtooth', detune: -10 },
      ]},
      { beats: 4, notes: [
        { freq: 51.91, gain: 0.035, type: 'sine' },
        { freq: 103.83, gain: 0.03, type: 'sawtooth' },
        { freq: 138.59, gain: 0.025, type: 'square' },
        { freq: 185.00, gain: 0.02, type: 'triangle' },
        { freq: 103.83, gain: 0.018, type: 'sawtooth', detune: 10 },
      ]},
      { beats: 4, notes: [
        { freq: 77.78, gain: 0.035, type: 'sine' },
        { freq: 155.56, gain: 0.03, type: 'sawtooth' },
        { freq: 196.00, gain: 0.025, type: 'square' },
        { freq: 233.08, gain: 0.02, type: 'triangle' },
        { freq: 155.56, gain: 0.018, type: 'sawtooth', detune: -10 },
      ]},
    ],
  },
};

const THEME_NAMES: Record<AmbientTheme, string> = {
  jarvis: 'Jarvis Intelligence',
  cyberpunk: 'Cyber Pulse',
  nature: 'Primal Flow',
  crystal: 'Crystal Resonance',
  deepspace: 'Deep Space',
};

export function useAmbientAudio() {
  const actxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const prefsRef = useRef<AmbientPrefs>(loadPrefs());
  const isPlayingRef = useRef(false);
  const chordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentChordRef = useRef<{ oscs: OscillatorNode[]; gains: GainNode[] }>({ oscs: [], gains: [] });
  const stepIndexRef = useRef(0);
  const [prefs, setPrefsState] = useState<AmbientPrefs>(prefsRef.current);

  const stopChord = useCallback(() => {
    const { oscs, gains } = currentChordRef.current;
    if (oscs.length === 0) return;
    const ctx = actxRef.current;
    if (ctx) {
      for (let i = 0; i < oscs.length; i++) {
        try { gains[i]?.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15); } catch {}
      }
    }
    setTimeout(() => {
      for (let i = 0; i < oscs.length; i++) {
        try { oscs[i]?.stop(); } catch {}
        try { oscs[i]?.disconnect(); } catch {}
        try { gains[i]?.disconnect(); } catch {}
      }
      currentChordRef.current = { oscs: [], gains: [] };
    }, 200);
  }, []);

  const playStep = useCallback((step: ProgressionStep, master: GainNode, ctx: AudioContext) => {
    stopChord();
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const now = ctx.currentTime;
    const durSec = ((60000 / SONGS.jarvis.bpm) * step.beats) / 1000;

    for (const n of step.notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.freq;
      if (n.detune) osc.detune.value = n.detune;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(n.gain, now + 0.35);
      g.gain.setValueAtTime(n.gain, now + durSec * 0.85);
      g.gain.linearRampToValueAtTime(0, now + durSec);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(now + durSec + 0.1);
      oscs.push(osc);
      gains.push(g);
    }
    currentChordRef.current = { oscs, gains };
  }, [stopChord]);

  const scheduleSong = useCallback((theme: AmbientTheme, volume: number, muted: boolean) => {
    const song = SONGS[theme];
    if (!song) return;

    try {
      if (!actxRef.current) {
        actxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = actxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      if (chordTimerRef.current) {
        clearInterval(chordTimerRef.current);
        chordTimerRef.current = null;
      }
      stopChord();

      if (!masterGainRef.current) {
        const mg = ctx.createGain();
        mg.gain.value = muted ? 0 : volume;
        mg.connect(ctx.destination);
        masterGainRef.current = mg;
      } else {
        masterGainRef.current.gain.linearRampToValueAtTime(muted ? 0 : volume, ctx.currentTime + 0.2);
      }
      const master = masterGainRef.current;
      isPlayingRef.current = true;

      const scheduleNext = () => {
        if (!isPlayingRef.current || !master) return;
        const step = song.steps[stepIndexRef.current];
        playStep(step, master, ctx);
        const durMs = (60000 / song.bpm) * step.beats;
        stepIndexRef.current = (stepIndexRef.current + 1) % song.steps.length;
        chordTimerRef.current = setTimeout(scheduleNext, durMs);
      };

      stepIndexRef.current = 0;
      scheduleNext();
    } catch {}
  }, [stopChord, playStep]);

  const stop = useCallback(() => {
    if (chordTimerRef.current) {
      clearTimeout(chordTimerRef.current);
      chordTimerRef.current = null;
    }
    if (masterGainRef.current && actxRef.current) {
      masterGainRef.current.gain.linearRampToValueAtTime(0, actxRef.current.currentTime + 0.5);
      setTimeout(() => {
        stopChord();
        isPlayingRef.current = false;
      }, 600);
    } else {
      stopChord();
      isPlayingRef.current = false;
    }
  }, [stopChord]);

  const play = useCallback(() => {
    const p = prefsRef.current;
    if (p.enabled && !isPlayingRef.current) {
      scheduleSong(p.theme, p.volume, p.muted);
    }
  }, [scheduleSong]);

  const toggleMute = useCallback(() => {
    const newPrefs = { ...prefsRef.current, muted: !prefsRef.current.muted };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (masterGainRef.current && actxRef.current) {
      masterGainRef.current.gain.linearRampToValueAtTime(
        newPrefs.muted ? 0 : newPrefs.volume,
        actxRef.current.currentTime + 0.3
      );
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    const newPrefs = { ...prefsRef.current, volume: vol, muted: false };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (masterGainRef.current && actxRef.current) {
      masterGainRef.current.gain.linearRampToValueAtTime(vol, actxRef.current.currentTime + 0.3);
    }
  }, []);

  const setTheme = useCallback((theme: AmbientTheme) => {
    const newPrefs = { ...prefsRef.current, theme };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (isPlayingRef.current) {
      scheduleSong(theme, newPrefs.volume, newPrefs.muted);
    }
  }, [scheduleSong]);

  const toggleEnabled = useCallback(() => {
    const newPrefs = { ...prefsRef.current, enabled: !prefsRef.current.enabled };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (newPrefs.enabled) {
      scheduleSong(newPrefs.theme, newPrefs.volume, newPrefs.muted);
    } else {
      stop();
    }
  }, [scheduleSong, stop]);

  const playPreview = useCallback((theme: AmbientTheme) => {
    if (isPlayingRef.current) stop();
    setTimeout(() => {
      scheduleSong(theme, 0.2, false);
      setTimeout(() => { stop(); }, 4000);
    }, 100);
  }, [scheduleSong, stop]);

  useEffect(() => {
    return () => {
      stop();
      if (actxRef.current) actxRef.current.close();
    };
  }, [stop]);

  useEffect(() => {
    const p = prefsRef.current;
    if (p.enabled) {
      scheduleSong(p.theme, p.volume, p.muted);
    }
    return () => { stop(); };
  }, []);

  return {
    prefs,
    isPlaying: isPlayingRef.current,
    toggleMute,
    setVolume,
    setTheme,
    toggleEnabled,
    play,
    stop,
    playPreview,
    themeNames: THEME_NAMES,
    themes: Object.keys(SONGS) as AmbientTheme[],
  };
}
