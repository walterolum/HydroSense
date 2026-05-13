export type LanguageCode =
  | 'en' | 'lug' | 'nyn' | 'teo' | 'luo' | 'lgg' | 'xog' | 'cgg' | 'ach' | 'swa';

export interface LanguageDef {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { code: 'en',  name: 'English',     nativeName: 'English',    flag: '🇬🇧', direction: 'ltr' },
  { code: 'lug', name: 'Luganda',     nativeName: 'Luganda',    flag: '🇺🇬', direction: 'ltr' },
  { code: 'nyn', name: 'Runyankole',  nativeName: 'Runyankole', flag: '🇺🇬', direction: 'ltr' },
  { code: 'teo', name: 'Ateso',       nativeName: 'Ateso',      flag: '🇺🇬', direction: 'ltr' },
  { code: 'luo', name: 'Luo',         nativeName: 'Luo',        flag: '🇺🇬', direction: 'ltr' },
  { code: 'lgg', name: 'Lugbara',     nativeName: 'Lugbara',    flag: '🇺🇬', direction: 'ltr' },
  { code: 'xog', name: 'Lusoga',      nativeName: 'Lusoga',     flag: '🇺🇬', direction: 'ltr' },
  { code: 'cgg', name: 'Rukiga',      nativeName: 'Rukiga',     flag: '🇺🇬', direction: 'ltr' },
  { code: 'ach', name: 'Acholi',      nativeName: 'Acholi',     flag: '🇺🇬', direction: 'ltr' },
  { code: 'swa', name: 'Swahili',     nativeName: 'Kiswahili',  flag: '🇹🇿', direction: 'ltr' },
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
