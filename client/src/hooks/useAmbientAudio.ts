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

interface TrackDef {
  label: string;
  file: string;
}

const TRACKS: Record<AmbientTheme, TrackDef> = {
  jarvis: {
    label: 'Soft Calm',
    file: '/audio/soft-calm-background.mp3',
  },
  nature: {
    label: 'Relaxing Ambient',
    file: '/audio/relaxing-ambient.mp3',
  },
  crystal: {
    label: 'Soft Calm',
    file: '/audio/soft-calm-background.mp3',
  },
  deepspace: {
    label: 'Relaxing Ambient',
    file: '/audio/relaxing-ambient.mp3',
  },
  cyberpunk: {
    label: 'Relaxing Ambient',
    file: '/audio/relaxing-ambient.mp3',
  },
};

const THEME_NAMES: Record<AmbientTheme, string> = {
  jarvis: 'Soft Calm Background',
  cyberpunk: 'Relaxing Ambient',
  nature: 'Relaxing Ambient',
  crystal: 'Soft Calm Background',
  deepspace: 'Relaxing Ambient',
};

function createAudio(url: string, volume: number, loop: boolean): HTMLAudioElement {
  const el = new Audio(url);
  el.preload = 'auto';
  el.loop = loop;
  el.volume = volume;
  return el;
}

export function useAmbientAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefsRef = useRef<AmbientPrefs>(loadPrefs());
  const playingRef = useRef(false);
  const [prefs, setPrefsState] = useState<AmbientPrefs>(prefsRef.current);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    audioRef.current = null;
    playingRef.current = false;
  }, []);

  const startTheme = useCallback((theme: AmbientTheme, volume: number, muted: boolean, loop: boolean) => {
    stop();
    const track = TRACKS[theme];
    if (!track) return;
    const el = createAudio(track.file, muted ? 0 : volume, loop);
    el.play().catch(() => {});
    audioRef.current = el;
    playingRef.current = true;
  }, [stop]);

  const play = useCallback((loop = true) => {
    const p = prefsRef.current;
    if (p.enabled && !playingRef.current) {
      startTheme(p.theme, p.volume, p.muted, loop);
    }
  }, [startTheme]);

  const toggleMute = useCallback(() => {
    const newPrefs = { ...prefsRef.current, muted: !prefsRef.current.muted };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    const a = audioRef.current;
    if (a) a.volume = newPrefs.muted ? 0 : newPrefs.volume;
  }, []);

  const setVolume = useCallback((vol: number) => {
    const newPrefs = { ...prefsRef.current, volume: vol, muted: false };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    const a = audioRef.current;
    if (a) a.volume = vol;
  }, []);

  const setTheme = useCallback((theme: AmbientTheme) => {
    const newPrefs = { ...prefsRef.current, theme };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (playingRef.current) {
      startTheme(theme, newPrefs.volume, newPrefs.muted, true);
    }
  }, [startTheme]);

  const toggleEnabled = useCallback(() => {
    const newPrefs = { ...prefsRef.current, enabled: !prefsRef.current.enabled };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (newPrefs.enabled) {
      startTheme(newPrefs.theme, newPrefs.volume, newPrefs.muted, true);
    } else {
      stop();
    }
  }, [startTheme, stop]);

  const playPreview = useCallback((theme: AmbientTheme) => {
    if (playingRef.current) stop();
    setTimeout(() => {
      startTheme(theme, 0.25, false, false);
      setTimeout(() => { stop(); }, 4000);
    }, 100);
  }, [startTheme, stop]);

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  useEffect(() => {
    const p = prefsRef.current;
    if (p.enabled) {
      startTheme(p.theme, p.volume, p.muted, true);
    }
    return () => { stop(); };
  }, []);

  return {
    prefs,
    isPlaying: playingRef.current,
    toggleMute,
    setVolume,
    setTheme,
    toggleEnabled,
    play,
    stop,
    playPreview,
    themeNames: THEME_NAMES,
    themes: Object.keys(TRACKS) as AmbientTheme[],
  };
}
