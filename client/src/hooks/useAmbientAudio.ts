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

/* ─── Chord-based music engine ─── */

interface NoteDef {
  freq: number;
  gain: number;
  type: OscillatorType;
}

interface ChordProgression {
  name: string;
  chords: NoteDef[][];
  bpm: number;
}

const PROGRESSIONS: Record<AmbientTheme, ChordProgression> = {
  jarvis: {
    name: 'Jarvis Intelligence',
    bpm: 65,
    chords: [
      // C major (I)
      [
        { freq: 261.63, gain: 0.045, type: 'sine' },
        { freq: 329.63, gain: 0.035, type: 'sine' },
        { freq: 392.00, gain: 0.025, type: 'triangle' },
      ],
      // G major (V)
      [
        { freq: 196.00, gain: 0.035, type: 'sine' },
        { freq: 246.94, gain: 0.03, type: 'sine' },
        { freq: 293.66, gain: 0.02, type: 'triangle' },
      ],
      // A minor (vi)
      [
        { freq: 220.00, gain: 0.04, type: 'sine' },
        { freq: 261.63, gain: 0.03, type: 'sine' },
        { freq: 329.63, gain: 0.025, type: 'triangle' },
      ],
      // F major (IV)
      [
        { freq: 174.61, gain: 0.035, type: 'sine' },
        { freq: 220.00, gain: 0.03, type: 'sine' },
        { freq: 261.63, gain: 0.02, type: 'triangle' },
      ],
    ],
  },
  nature: {
    name: 'Primal Flow',
    bpm: 70,
    chords: [
      // D major (I)
      [
        { freq: 293.66, gain: 0.04, type: 'sine' },
        { freq: 369.99, gain: 0.03, type: 'triangle' },
        { freq: 440.00, gain: 0.02, type: 'sine' },
      ],
      // B minor (vi)
      [
        { freq: 246.94, gain: 0.035, type: 'sine' },
        { freq: 293.66, gain: 0.025, type: 'sine' },
        { freq: 369.99, gain: 0.02, type: 'triangle' },
      ],
      // G major (IV)
      [
        { freq: 196.00, gain: 0.035, type: 'sine' },
        { freq: 246.94, gain: 0.025, type: 'triangle' },
        { freq: 293.66, gain: 0.02, type: 'sine' },
      ],
      // A major (V)
      [
        { freq: 220.00, gain: 0.035, type: 'sine' },
        { freq: 277.18, gain: 0.025, type: 'sine' },
        { freq: 329.63, gain: 0.02, type: 'triangle' },
      ],
    ],
  },
  crystal: {
    name: 'Crystal Resonance',
    bpm: 60,
    chords: [
      // A minor (i)
      [
        { freq: 220.00, gain: 0.04, type: 'sine' },
        { freq: 261.63, gain: 0.03, type: 'triangle' },
        { freq: 329.63, gain: 0.02, type: 'sine' },
      ],
      // F major (VI)
      [
        { freq: 174.61, gain: 0.035, type: 'triangle' },
        { freq: 220.00, gain: 0.025, type: 'sine' },
        { freq: 261.63, gain: 0.02, type: 'sine' },
      ],
      // C major (III)
      [
        { freq: 261.63, gain: 0.04, type: 'sine' },
        { freq: 329.63, gain: 0.03, type: 'triangle' },
        { freq: 392.00, gain: 0.02, type: 'sine' },
      ],
      // G major (VII)
      [
        { freq: 196.00, gain: 0.035, type: 'sine' },
        { freq: 246.94, gain: 0.025, type: 'sine' },
        { freq: 293.66, gain: 0.02, type: 'triangle' },
      ],
    ],
  },
  deepspace: {
    name: 'Deep Space',
    bpm: 55,
    chords: [
      // C minor (i)
      [
        { freq: 261.63, gain: 0.04, type: 'sine' },
        { freq: 311.13, gain: 0.03, type: 'triangle' },
        { freq: 392.00, gain: 0.02, type: 'sine' },
      ],
      // A-flat major (VI)
      [
        { freq: 207.65, gain: 0.035, type: 'triangle' },
        { freq: 261.63, gain: 0.025, type: 'sine' },
        { freq: 311.13, gain: 0.02, type: 'sine' },
      ],
      // E-flat major (III)
      [
        { freq: 155.56, gain: 0.035, type: 'sine' },
        { freq: 196.00, gain: 0.025, type: 'triangle' },
        { freq: 233.08, gain: 0.02, type: 'sine' },
      ],
      // B-flat major (VII)
      [
        { freq: 233.08, gain: 0.035, type: 'sine' },
        { freq: 293.66, gain: 0.025, type: 'triangle' },
        { freq: 349.23, gain: 0.02, type: 'sine' },
      ],
    ],
  },
  cyberpunk: {
    name: 'Cyber Pulse',
    bpm: 75,
    chords: [
      // F minor (i)
      [
        { freq: 174.61, gain: 0.03, type: 'sawtooth' },
        { freq: 220.00, gain: 0.025, type: 'square' },
        { freq: 261.63, gain: 0.02, type: 'triangle' },
      ],
      // D-flat major (VI)
      [
        { freq: 138.59, gain: 0.025, type: 'sawtooth' },
        { freq: 185.00, gain: 0.02, type: 'square' },
        { freq: 220.00, gain: 0.015, type: 'triangle' },
      ],
      // A-flat major (III)
      [
        { freq: 103.83, gain: 0.025, type: 'sawtooth' },
        { freq: 138.59, gain: 0.02, type: 'square' },
        { freq: 185.00, gain: 0.015, type: 'triangle' },
      ],
      // E-flat major (VII)
      [
        { freq: 155.56, gain: 0.025, type: 'sawtooth' },
        { freq: 196.00, gain: 0.02, type: 'square' },
        { freq: 233.08, gain: 0.015, type: 'triangle' },
      ],
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
  const currentChordRef = useRef<{ oscs: OscillatorNode[]; gains: GainNode[] }[]>([]);
  const chordIndexRef = useRef(0);
  const [prefs, setPrefsState] = useState<AmbientPrefs>(prefsRef.current);

  const stopChord = useCallback(() => {
    for (const layer of currentChordRef.current) {
      for (let i = 0; i < layer.oscs.length; i++) {
        try { layer.gains[i]?.gain.linearRampToValueAtTime(0, actxRef.current!.currentTime + 0.15); } catch {}
        try { layer.oscs[i]?.stop(actxRef.current!.currentTime + 0.2); } catch {}
      }
    }
    setTimeout(() => {
      for (const layer of currentChordRef.current) {
        for (let i = 0; i < layer.oscs.length; i++) {
          try { layer.oscs[i]?.disconnect(); } catch {}
          try { layer.gains[i]?.disconnect(); } catch {}
        }
      }
      currentChordRef.current = [];
    }, 250);
  }, []);

  const playChord = useCallback((notes: NoteDef[], master: GainNode, ctx: AudioContext) => {
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const now = ctx.currentTime;

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.freq;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(n.gain, now + 0.3);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(now + 5);
      oscs.push(osc);
      gains.push(g);
    }
    return { oscs, gains };
  }, []);

  const scheduleProgression = useCallback((theme: AmbientTheme, volume: number, muted: boolean) => {
    const prog = PROGRESSIONS[theme];
    if (!prog) return;

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

      const chordDurationMs = (60000 / prog.bpm) * 4;
      chordIndexRef.current = 0;
      isPlayingRef.current = true;

      const playCurrentChord = () => {
        if (!isPlayingRef.current || !master) return;
        stopChord();
        const notes = prog.chords[chordIndexRef.current];
        const layer = playChord(notes, master, ctx);
        currentChordRef.current = [layer];
        chordIndexRef.current = (chordIndexRef.current + 1) % prog.chords.length;
      };

      playCurrentChord();
      chordTimerRef.current = setInterval(playCurrentChord, chordDurationMs);
    } catch {}
  }, [stopChord, playChord]);

  const stop = useCallback(() => {
    if (chordTimerRef.current) {
      clearInterval(chordTimerRef.current);
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
      scheduleProgression(p.theme, p.volume, p.muted);
    }
  }, [scheduleProgression]);

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
      scheduleProgression(theme, newPrefs.volume, newPrefs.muted);
    }
  }, [scheduleProgression]);

  const toggleEnabled = useCallback(() => {
    const newPrefs = { ...prefsRef.current, enabled: !prefsRef.current.enabled };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (newPrefs.enabled) {
      scheduleProgression(newPrefs.theme, newPrefs.volume, newPrefs.muted);
    } else {
      stop();
    }
  }, [scheduleProgression, stop]);

  const playPreview = useCallback((theme: AmbientTheme) => {
    if (isPlayingRef.current) stop();
    setTimeout(() => {
      scheduleProgression(theme, 0.2, false);
      setTimeout(() => { stop(); }, 4000);
    }, 100);
  }, [scheduleProgression, stop]);

  useEffect(() => {
    return () => {
      stop();
      if (actxRef.current) actxRef.current.close();
    };
  }, [stop]);

  useEffect(() => {
    const p = prefsRef.current;
    if (p.enabled) {
      scheduleProgression(p.theme, p.volume, p.muted);
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
    themes: Object.keys(PROGRESSIONS) as AmbientTheme[],
  };
}
