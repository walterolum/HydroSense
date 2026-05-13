import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { SUPPORTED_LANGUAGES, LanguageCode } from '../../types/language';
import { Globe, ChevronDown, Check } from 'lucide-react';

interface Props {
  compact?: boolean;
  align?: 'left' | 'right';
}

export default function LanguageSwitcher({ compact = false, align = 'right' }: Props) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = SUPPORTED_LANGUAGES.find(l => l.code === language) || SUPPORTED_LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-xl border transition-all ${
          compact
            ? 'px-3 py-1.5 text-xs border-white/20 bg-white/10 text-white hover:bg-white/20'
            : 'px-4 py-2.5 text-sm border-gray-200 bg-white text-gray-700 hover:border-gray-300 shadow-sm'
        }`}
      >
        <Globe size={compact ? 14 : 16} />
        <span className={compact ? '' : 'font-semibold'}>
          {compact ? current.code.toUpperCase() : current.nativeName}
        </span>
        <ChevronDown size={compact ? 12 : 14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white shadow-xl py-1 max-h-80 overflow-y-auto ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {SUPPORTED_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              type="button"
              onClick={() => { setLanguage(lang.code as LanguageCode); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                language === lang.code
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              <div className="flex-1 text-left">
                <div className="text-sm">{lang.nativeName}</div>
                <div className="text-xs text-gray-400">{lang.name}</div>
              </div>
              {language === lang.code && <Check size={16} className="text-blue-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
