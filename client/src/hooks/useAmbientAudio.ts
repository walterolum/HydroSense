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

type OscType = OscillatorType;

interface ToneLayer {
  osc: OscillatorNode | null;
  gain: GainNode | null;
  type: OscType;
  freq: number;
  detune: number;
  gainVal: number;
}

const THEME_CONFIGS: Record<AmbientTheme, ToneLayer[]> = {
  jarvis: [
    { osc: null, gain: null, type: 'sine', freq: 55, detune: 0, gainVal: 0.04 },
    { osc: null, gain: null, type: 'sine', freq: 82.41, detune: 5, gainVal: 0.03 },
    { osc: null, gain: null, type: 'sine', freq: 110, detune: -3, gainVal: 0.02 },
    { osc: null, gain: null, type: 'sine', freq: 220, detune: 7, gainVal: 0.015 },
    { osc: null, gain: null, type: 'triangle', freq: 440, detune: 0, gainVal: 0.008 },
  ],
  cyberpunk: [
    { osc: null, gain: null, type: 'sawtooth', freq: 65.41, detune: -10, gainVal: 0.025 },
    { osc: null, gain: null, type: 'square', freq: 98, detune: 15, gainVal: 0.015 },
    { osc: null, gain: null, type: 'sine', freq: 130.81, detune: -5, gainVal: 0.03 },
    { osc: null, gain: null, type: 'triangle', freq: 261.63, detune: 10, gainVal: 0.02 },
    { osc: null, gain: null, type: 'sawtooth', freq: 523.25, detune: -20, gainVal: 0.01 },
  ],
  nature: [
    { osc: null, gain: null, type: 'sine', freq: 60, detune: 0, gainVal: 0.035 },
    { osc: null, gain: null, type: 'sine', freq: 90, detune: 8, gainVal: 0.025 },
    { osc: null, gain: null, type: 'triangle', freq: 120, detune: -4, gainVal: 0.02 },
    { osc: null, gain: null, type: 'sine', freq: 180, detune: 6, gainVal: 0.015 },
    { osc: null, gain: null, type: 'sine', freq: 360, detune: 0, gainVal: 0.008 },
  ],
  crystal: [
    { osc: null, gain: null, type: 'sine', freq: 110, detune: 0, gainVal: 0.03 },
    { osc: null, gain: null, type: 'sine', freq: 165, detune: 10, gainVal: 0.02 },
    { osc: null, gain: null, type: 'triangle', freq: 220, detune: -8, gainVal: 0.025 },
    { osc: null, gain: null, type: 'sine', freq: 330, detune: 5, gainVal: 0.015 },
    { osc: null, gain: null, type: 'sine', freq: 440, detune: -12, gainVal: 0.01 },
  ],
  deepspace: [
    { osc: null, gain: null, type: 'sine', freq: 27.5, detune: 0, gainVal: 0.05 },
    { osc: null, gain: null, type: 'sine', freq: 41.2, detune: -15, gainVal: 0.04 },
    { osc: null, gain: null, type: 'triangle', freq: 55, detune: 10, gainVal: 0.03 },
    { osc: null, gain: null, type: 'sine', freq: 82.41, detune: -5, gainVal: 0.02 },
    { osc: null, gain: null, type: 'sawtooth', freq: 110, detune: 20, gainVal: 0.008 },
  ],
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
  const layersRef = useRef<ToneLayer[]>([]);
  const prefsRef = useRef<AmbientPrefs>(loadPrefs());
  const isPlayingRef = useRef(false);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [prefs, setPrefsState] = useState<AmbientPrefs>(prefsRef.current);

  const applyVolume = useCallback((vol: number) => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.linearRampToValueAtTime(vol, actxRef.current!.currentTime + 0.3);
    }
  }, []);

  const stopLayers = useCallback(() => {
    for (const layer of layersRef.current) {
      try { layer.osc?.stop(); } catch {}
      try { layer.osc?.disconnect(); } catch {}
      try { layer.gain?.disconnect(); } catch {}
    }
    layersRef.current = [];
  }, []);

  const startTheme = useCallback((theme: AmbientTheme, volume: number, muted: boolean) => {
    try {
      if (!actxRef.current) {
        actxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = actxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      stopLayers();

      const mg = ctx.createGain();
      mg.gain.value = muted ? 0 : volume;
      mg.connect(ctx.destination);
      masterGainRef.current = mg;

      const config = THEME_CONFIGS[theme];
      if (!config) return;

      const newLayers: ToneLayer[] = config.map((tpl) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = tpl.type;
        osc.frequency.value = tpl.freq;
        osc.detune.value = tpl.detune;
        g.gain.value = tpl.gainVal;
        osc.connect(g);
        g.connect(mg);
        osc.start();
        return { ...tpl, osc, gain: g };
      });

      layersRef.current = newLayers;
      isPlayingRef.current = true;

      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      let count = 0;
      fadeTimerRef.current = setInterval(() => {
        count++;
        for (const layer of layersRef.current) {
          try {
            if (layer.osc) {
              const drift = Math.sin(count * 0.01) * 0.3;
              layer.osc.detune.value = layer.detune + drift;
            }
          } catch {}
        }
      }, 100);
    } catch {}
  }, [stopLayers]);

  const stop = useCallback(() => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (masterGainRef.current && actxRef.current) {
      masterGainRef.current.gain.linearRampToValueAtTime(0, actxRef.current.currentTime + 0.5);
      setTimeout(() => {
        stopLayers();
        isPlayingRef.current = false;
      }, 600);
    } else {
      stopLayers();
      isPlayingRef.current = false;
    }
  }, [stopLayers]);

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
    applyVolume(vol);
  }, [applyVolume]);

  const setTheme = useCallback((theme: AmbientTheme) => {
    const newPrefs = { ...prefsRef.current, theme };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (isPlayingRef.current) {
      startTheme(theme, newPrefs.volume, newPrefs.muted);
    }
  }, [startTheme]);

  const toggleEnabled = useCallback(() => {
    const newPrefs = { ...prefsRef.current, enabled: !prefsRef.current.enabled };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (newPrefs.enabled) {
      startTheme(newPrefs.theme, newPrefs.volume, newPrefs.muted);
    } else {
      stop();
    }
  }, [startTheme, stop]);

  const play = useCallback(() => {
    const p = prefsRef.current;
    if (p.enabled && !isPlayingRef.current) {
      startTheme(p.theme, p.volume, p.muted);
    }
  }, [startTheme]);

  const playPreview = useCallback((theme: AmbientTheme) => {
    if (isPlayingRef.current) stop();
    setTimeout(() => {
      startTheme(theme, 0.2, false);
      setTimeout(() => {
        stop();
      }, 3000);
    }, 100);
  }, [startTheme, stop]);

  useEffect(() => {
    return () => {
      stop();
      if (actxRef.current) actxRef.current.close();
    };
  }, [stop]);

  useEffect(() => {
    const p = prefsRef.current;
    if (p.enabled) {
      startTheme(p.theme, p.volume, p.muted);
    }
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    themes: Object.keys(THEME_CONFIGS) as AmbientTheme[],
  };
}
