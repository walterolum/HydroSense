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
  jarvis:     { label: 'Soft Calm',       file: '/audio/soft-calm-background.mp3' },
  nature:     { label: 'Relaxing Ambient', file: '/audio/relaxing-ambient.mp3' },
  crystal:    { label: 'Soft Calm',       file: '/audio/soft-calm-background.mp3' },
  deepspace:  { label: 'Relaxing Ambient', file: '/audio/relaxing-ambient.mp3' },
  cyberpunk:  { label: 'Relaxing Ambient', file: '/audio/relaxing-ambient.mp3' },
};

const THEME_NAMES: Record<AmbientTheme, string> = {
  jarvis:     'Soft Calm Background',
  cyberpunk:  'Relaxing Ambient',
  nature:     'Relaxing Ambient',
  crystal:    'Soft Calm Background',
  deepspace:  'Relaxing Ambient',
};

export function useAmbientAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefsRef = useRef<AmbientPrefs>(loadPrefs());
  const playingRef = useRef(false);
  const volumeTargetRef = useRef(prefsRef.current.volume);
  const [prefs, setPrefsState] = useState<AmbientPrefs>(prefsRef.current);
  const [isPlaying, setIsPlaying] = useState(false);

  const applyVolume = useCallback(() => {
    const a = audioRef.current;
    if (a) a.volume = volumeTargetRef.current;
  }, []);

  const setAudioVolume = useCallback((vol: number) => {
    volumeTargetRef.current = vol;
    const a = audioRef.current;
    if (a) a.volume = vol;
  }, []);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    audioRef.current = null;
    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  const startTheme = useCallback((theme: AmbientTheme, muted: boolean, loop: boolean) => {
    stop();
    const track = TRACKS[theme];
    if (!track) return;
    const el = new Audio(track.file);
    el.preload = 'auto';
    el.loop = loop;
    el.volume = muted ? 0 : volumeTargetRef.current;
    audioRef.current = el;
    el.play().then(() => {
      playingRef.current = true;
      setIsPlaying(true);
    }).catch(() => {
      audioRef.current = null;
    });
  }, [stop]);

  const play = useCallback((loop = true) => {
    const p = prefsRef.current;
    if (p.enabled && !playingRef.current) {
      startTheme(p.theme, p.muted, loop);
    }
  }, [startTheme]);

  const toggleMute = useCallback(() => {
    const newPrefs = { ...prefsRef.current, muted: !prefsRef.current.muted };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (newPrefs.muted) {
      volumeTargetRef.current = 0;
      applyVolume();
    } else {
      volumeTargetRef.current = newPrefs.volume;
      applyVolume();
    }
  }, [applyVolume]);

  const setVolume = useCallback((vol: number) => {
    const newPrefs = { ...prefsRef.current, volume: vol, muted: false };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    volumeTargetRef.current = vol;
    applyVolume();
  }, [applyVolume]);

  const setTheme = useCallback((theme: AmbientTheme) => {
    const newPrefs = { ...prefsRef.current, theme };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (playingRef.current) {
      startTheme(theme, newPrefs.muted, true);
    }
  }, [startTheme]);

  const toggleEnabled = useCallback(() => {
    const newPrefs = { ...prefsRef.current, enabled: !prefsRef.current.enabled };
    prefsRef.current = newPrefs;
    savePrefs(newPrefs);
    setPrefsState(newPrefs);
    if (newPrefs.enabled) {
      startTheme(newPrefs.theme, newPrefs.muted, true);
    } else {
      stop();
    }
  }, [startTheme, stop]);

  const playPreview = useCallback((theme: AmbientTheme) => {
    if (playingRef.current) stop();
    setTimeout(() => {
      startTheme(theme, false, false);
      setTimeout(() => { stop(); }, 4000);
    }, 100);
  }, [startTheme, stop]);

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  useEffect(() => {
    const p = prefsRef.current;
    if (p.enabled) {
      startTheme(p.theme, p.muted, true);
    }
    return () => { stop(); };
  }, []);

  return {
    prefs,
    isPlaying,
    toggleMute,
    setVolume,
    setAudioVolume,
    setTheme,
    toggleEnabled,
    play,
    stop,
    playPreview,
    themeNames: THEME_NAMES,
    themes: Object.keys(TRACKS) as AmbientTheme[],
  };
}
