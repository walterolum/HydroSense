import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

export function useTranslations<T extends Record<string, string>>(defaults: T): T {
  const { language } = useLanguage();
  const [translated, setTranslated] = useState<T>(defaults);
  const cacheRef = useRef<Record<string, T>>({});
  const defaultsRef = useRef(defaults);

  useEffect(() => {
    if (language === 'en') { setTranslated(defaultsRef.current); return; }
    if (cacheRef.current[language]) { setTranslated(cacheRef.current[language]); return; }

    const keys = Object.keys(defaultsRef.current) as (keyof T)[];
    const texts = keys.map(k => defaultsRef.current[k]);
    const token = localStorage.getItem('hs_token') || sessionStorage.getItem('hs_token');

    fetch('/api/ai/translate/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ texts, target_language: language, source_language: 'en' }),
    })
      .then(r => r.json())
      .then(data => {
        const txts: string[] = data.texts ?? texts;
        const result = {} as T;
        keys.forEach((k, i) => { result[k] = (txts[i] ?? defaultsRef.current[k]) as T[keyof T]; });
        cacheRef.current[language] = result;
        setTranslated(result);
      })
      .catch(() => {}); // silently fall back to English on error
  }, [language]);

  return translated;
}
