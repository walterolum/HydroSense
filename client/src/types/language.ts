export type LanguageCode =
  | 'en' | 'lug' | 'nyn' | 'teo' | 'luo' | 'lgg' | 'xog' | 'cgg' | 'ach' | 'swa'
  | 'nyo' | 'ttj' | 'laj' | 'alz' | 'myx' | 'kdj' | 'spy' | 'koo';

export interface LanguageDef {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { code: 'en',  name: 'English',       nativeName: 'English',      flag: '🇬🇧', direction: 'ltr' },
  { code: 'lug', name: 'Luganda',       nativeName: 'Luganda',      flag: '🇺🇬', direction: 'ltr' },
  { code: 'nyn', name: 'Runyankole',    nativeName: 'Runyankore',   flag: '🇺🇬', direction: 'ltr' },
  { code: 'cgg', name: 'Rukiga',        nativeName: 'Rukiga',       flag: '🇺🇬', direction: 'ltr' },
  { code: 'nyo', name: 'Runyoro',       nativeName: 'Runyoro',      flag: '🇺🇬', direction: 'ltr' },
  { code: 'ttj', name: 'Rutoro',        nativeName: 'Rutooro',      flag: '🇺🇬', direction: 'ltr' },
  { code: 'xog', name: 'Lusoga',        nativeName: 'Lusoga',       flag: '🇺🇬', direction: 'ltr' },
  { code: 'myx', name: 'Lumasaba',      nativeName: 'Lumasaba',     flag: '🇺🇬', direction: 'ltr' },
  { code: 'luo', name: 'Luo',           nativeName: 'Dho Lwo',      flag: '🇺🇬', direction: 'ltr' },
  { code: 'ach', name: 'Acholi',        nativeName: 'Luo Acholi',   flag: '🇺🇬', direction: 'ltr' },
  { code: 'laj', name: 'Langi',         nativeName: 'Leb Lango',    flag: '🇺🇬', direction: 'ltr' },
  { code: 'alz', name: 'Alur',          nativeName: 'Dho Alur',     flag: '🇺🇬', direction: 'ltr' },
  { code: 'teo', name: 'Ateso',         nativeName: 'Ateso',        flag: '🇺🇬', direction: 'ltr' },
  { code: 'kdj', name: 'Ngakarimojong', nativeName: 'Ngakarimojong',flag: '🇺🇬', direction: 'ltr' },
  { code: 'lgg', name: 'Lugbara',       nativeName: 'Lugbara',      flag: '🇺🇬', direction: 'ltr' },
  { code: 'spy', name: 'Sabiny',        nativeName: 'Kupsabiny',    flag: '🇺🇬', direction: 'ltr' },
  { code: 'koo', name: 'Rukonzo',        nativeName: 'Rukonzo',      flag: '🇺🇬', direction: 'ltr' },
  { code: 'swa', name: 'Swahili',       nativeName: 'Kiswahili',    flag: '🇹🇿', direction: 'ltr' },
];

export const LANGUAGE_MAP = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(l => [l.code, l])
) as Record<LanguageCode, LanguageDef>;

export const REPORT_STATUSES: Record<string, string> = {
  pending: 'Submitted',
  under_investigation: 'Under Investigation',
  assigned: 'Assigned',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

export const INCIDENT_TYPES: Record<string, string> = {
  water_contamination: 'Water Contamination',
  broken_water_point: 'Broken Water Point',
  flooding: 'Flooding',
  sewage_leak: 'Sewage Leak',
  illegal_dumping: 'Illegal Dumping',
  pollution: 'Pollution',
  environmental_hazard: 'Environmental Hazard',
  infrastructure_damage: 'Infrastructure Damage',
};
