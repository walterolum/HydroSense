import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { LanguageCode, LANGUAGE_MAP, SUPPORTED_LANGUAGES } from '../types/language';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: string) => string;
  translate: (text: string, targetLang?: LanguageCode) => Promise<string>;
  translateToEnglish: (text: string, sourceLang?: LanguageCode) => Promise<string>;
  supportedLanguages: typeof SUPPORTED_LANGUAGES;
  currentLang: typeof LANGUAGE_MAP[LanguageCode];
  isTranslating: boolean;
  speak: (text: string, lang?: LanguageCode) => void;
  isSpeaking: boolean;
  offlineMode: boolean;
  setOfflineMode: (v: boolean) => void;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

const UI_STRINGS: Record<string, Record<string, string>> = {
  'nav.home': { en: 'Home', lug: 'Ennyumba', nyn: 'Eka', teo: 'Eka', luo: 'Ot', lgg: "E'yo", xog: 'Ewaka', cgg: 'Eka', ach: 'Tedo', swa: 'Nyumbani' },
  'nav.dashboard': { en: 'Dashboard', lug: 'Ddundi', nyn: 'Ekaragwe', teo: 'Ekaragwe', luo: 'Karaja', lgg: 'Dasi', xog: 'Dasi', cgg: 'Ekaragwe', ach: 'Ducu', swa: 'Dashibodi' },
  'nav.reports': { en: 'Reports', lug: 'Lipooti', nyn: 'Embaruha', teo: 'Iparit', luo: 'Tedo', lgg: 'Riipota', xog: 'Lipooti', cgg: 'Embaruha', ach: 'Tedo', swa: 'Ripoti' },
  'nav.tracking': { en: 'My Reports', lug: 'Lipooti Zange', nyn: 'Embaruha Zangye', teo: 'Iparit Ka', luo: 'Tedo Mago', lgg: 'Riipota Maa', xog: 'Lipooti Zange', cgg: 'Embaruha Zangye', ach: 'Tedo Mego', swa: 'Ripoti Zangu' },
  'nav.profile': { en: 'Profile', lug: 'Pulofaayo', nyn: 'Ebifa', teo: 'Ebe', luo: 'Kido', lgg: 'Pulofaayu', xog: 'Pulofaayo', cgg: 'Ebifa', ach: 'Kido', swa: 'Wasifu' },
  'nav.logout': { en: 'Logout', lug: 'Kuva mu', nyn: 'Kuva', teo: 'Irori', luo: 'Wuok', lgg: 'Logout', xog: 'Kuva', cgg: 'Kuva', ach: 'Wuok', swa: 'Toka' },
  'common.submit': { en: 'Submit', lug: 'Kuwa omu', nyn: 'Kureeta', teo: 'Ikir', luo: 'Chuno', lgg: 'Tuma', xog: 'Kuwa', cgg: 'Kureeta', ach: 'Cuno', swa: 'Wasilisha' },
  'common.cancel': { en: 'Cancel', lug: 'Kusaza', nyn: 'Kuhagarara', teo: 'Irori', luo: 'Gweko', lgg: 'Kansa', xog: 'Kusaza', cgg: 'Kuhagarara', ach: 'Gweko', swa: 'Ghairi' },
  'common.loading': { en: 'Loading...', lug: 'Zing\'a...', nyn: 'Ninetaha...', teo: 'Ejaale...', luo: 'Chako...', lgg: 'Loading...', xog: 'Zinga...', cgg: 'Ninetaha...', ach: 'Cako...', swa: 'Inapakia...' },
  'common.error': { en: 'Error', lug: 'Ensobi', nyn: 'Ensobi', teo: 'Aibe', luo: 'Bal', lgg: 'Eroro', xog: 'Ensobi', cgg: 'Ensobi', ach: 'Bal', swa: 'Hitilafu' },
  'common.success': { en: 'Success', lug: 'Okugwa', nyn: 'Okugwa', teo: 'Ejok', luo: 'Adier', lgg: 'Success', xog: 'Okugwa', cgg: 'Okugwa', ach: 'Adier', swa: 'Mafanikio' },
  'common.save': { en: 'Save', lug: 'Kukuuma', nyn: 'Kuhunza', teo: 'Itoni', luo: 'Gwoko', lgg: 'Seefu', xog: 'Kukuuma', cgg: 'Kuhunza', ach: 'Gwoko', swa: 'Hifadhi' },
  'common.delete': { en: 'Delete', lug: 'Kusangula', nyn: 'Kujura', teo: 'Irori', luo: 'Gwoko', lgg: 'Dilite', xog: 'Kusangula', cgg: 'Kujura', ach: 'Kelo', swa: 'Futa' },
  'common.search': { en: 'Search', lug: 'Kunoonya', nyn: 'Kushoroma', teo: 'Ikir', luo: 'Manyo', lgg: 'Saachi', xog: 'Kunoonya', cgg: 'Kushoroma', ach: 'Manyo', swa: 'Tafuta' },
  'common.back': { en: 'Back', lug: 'Emabega', nyn: 'Omushozi', teo: 'Ape', luo: 'Dog', lgg: 'Baki', xog: 'Emabega', cgg: 'Omushozi', ach: 'Dok', swa: 'Nyuma' },
  'common.next': { en: 'Next', lug: 'Emyuma', nyn: 'Omuma', teo: 'Ato', luo: 'Kwaro', lgg: 'Nekisi', xog: 'Emyuma', cgg: 'Omuma', ach: 'Kwaro', swa: 'Inayofuata' },
  'common.close': { en: 'Close', lug: 'Kugalawo', nyn: 'Kugara', teo: 'Irori', luo: 'Lor', lgg: 'Klosi', xog: 'Kugala', cgg: 'Kugara', ach: 'Lor', swa: 'Funga' },
  'common.retry': { en: 'Retry', lug: 'Yongerayo', nyn: 'Ija', teo: 'Ijan', luo: 'Tim', lgg: 'Ritrai', xog: 'Yongera', cgg: 'Ija', ach: 'Tim doki', swa: 'Jaribu tena' },
  'common.offline': { en: 'You are offline. Changes will sync when connected.', lug: 'Oli walawo mu ntabala. Enkyuka ejja kusync nga olina ntambula.', nyn: 'Ninye hanwa. Ebyahinduka bija kusync nga mwine.', teo: 'Ejaale ibe. Aibuin ija kusync.', luo: 'Intye gi wang\' ng\'eyo. Gini lok ne biro sync.', lgg: 'Ma koni off. Riiga ma koni neeti.', xog: 'Oli walawo. Enkyuka ejja kusync.', cgg: 'Ninye hanwa. Ebihinduka bija kusync.', ach: 'Itye ki wang\' ng\'eyo. Gin lok ne biro sync.', swa: 'Uko nje ya mtandao. Mabadiliko yatasawazisha.' },
  'report.title': { en: 'Report an Incident', lug: 'Teeka Lipoota', nyn: 'Kureeta Embaruha', teo: 'Ikir Iparit', luo: 'Chuno Tedo', lgg: "Riipota Ku'di", xog: 'Teeka Lipooti', cgg: 'Kureeta Embaruha', ach: 'Cuno Tedo', swa: 'Ripoti Tukio' },
  'report.description': { en: 'Describe what you saw or record a voice message', lug: 'Nyonyola ky\'olabye oba oyige eddoboozi', nyn: 'Nyetoora eky\'oraba oba kuhurira orurari', teo: 'Ikir aito luo', luo: 'Nyisa neno', lgg: "Andiko ri ma o'bi", xog: 'Nyonyola ky\'olabye', cgg: 'Nyetoora eky\'oraba', ach: 'Nyisa neno', swa: 'Elea ulichokiona au rekodi sauti' },
  'report.voice': { en: 'Record Voice', lug: 'Oyige Eddoboozi', nyn: 'Kuhurira Orurari', teo: 'Ikir Aitu', luo: 'Dwoko', lgg: 'Rikodi', xog: 'Oyige Eddoboozi', cgg: 'Kuhurira Orurari', ach: 'Dwoko', swa: 'Rekodi Sauti' },
  'report.type': { en: 'Incident Type', lug: 'Ekika ky\'Ensobi', nyn: 'Ekika', teo: 'Aibe', luo: 'Tedo', lgg: 'Taipu', xog: 'Ekika ky\'Ensobi', cgg: 'Ekika', ach: 'Tedo', swa: 'Aina ya Tukio' },
  'report.location': { en: 'Location', lug: 'Walawo', nyn: 'Aha', teo: 'Ka', luo: 'Wang', lgg: 'Lu', xog: 'Walawo', cgg: 'Aha', ach: 'Wang', swa: 'Mahali' },
  'report.district': { en: 'District', lug: 'Disitulikiti', nyn: 'Disitulikiti', teo: 'Disitulikiti', luo: 'Distrik', lgg: 'Disitulikiti', xog: 'Disitulikiti', cgg: 'Disitulikiti', ach: 'Distrik', swa: 'Wilaya' },
  'report.subcounty': { en: 'Sub-County', lug: 'Ggombolola', nyn: 'Sub-county', teo: 'Ebe', luo: 'Sub-county', lgg: 'Sub-county', xog: 'Ggombolola', cgg: 'Sub-county', ach: 'Sub-county', swa: 'Kata' },
  'report.village': { en: 'Village', lug: 'Kyalo', nyn: 'Omugyenge', teo: 'Ader', luo: 'Gweng', lgg: 'Anga', xog: 'Kyalo', cgg: 'Omugyenge', ach: 'Gweng', swa: 'Kijiji' },
  'report.photo': { en: 'Take Photo', lug: 'Funa Ekifaananyi', nyn: 'Gamba', teo: 'Ikir', luo: 'Mako', lgg: 'Foti', xog: 'Funa Ekifaananyi', cgg: 'Gamba', ach: 'Mako', swa: 'Piga Picha' },
  'report.anonymous': { en: 'Report Anonymously', lug: 'Teeka Lipoota Mu Kukyama', nyn: 'Kureeta Embajuha Ntama', teo: 'Ikir Iparit Kona', luo: 'Chuno Tedo Maling', lgg: 'Riipota Mu Kama', xog: 'Teeka Lipooti Mu Kukyama', cgg: 'Kureeta Embaruha Ntama', ach: 'Cuno Tedo Maling', swa: 'Ripoti Kwa Siri' },
  'report.track': { en: 'Track My Report', lug: 'Londolola Lipoota Yange', nyn: 'Kulondoola Embaruha Zangye', teo: 'Ikir Iparit Ka', luo: 'Luwo Tedo Maga', lgg: 'Londolola Riipota Maa', xog: 'Londolola Lipooti Yange', cgg: 'Kulondoola Embaruha Zangye', ach: 'Luwo Tedo Mego', swa: 'Fuatilia Ripoti Yangu' },
  'report.SMS': { en: 'Report via SMS', lug: 'Teeka Lipoota nga SMS', nyn: 'Kureeta SMS', teo: 'SMS Iparit', luo: 'SMS Tedo', lgg: 'SMS Riipota', xog: 'Teeka Lipooti nga SMS', cgg: 'Kureeta SMS', ach: 'SMS Tedo', swa: 'Ripoti kwa SMS' },
  'report.whatsapp': { en: 'Report via WhatsApp', lug: 'Teeka Lipoota nga WhatsApp', nyn: 'Kureeta WhatsApp', teo: 'WhatsApp Iparit', luo: 'WhatsApp Tedo', lgg: 'WhatsApp Riipota', xog: 'Teeka Lipooti nga WhatsApp', cgg: 'Kureeta WhatsApp', ach: 'WhatsApp Tedo', swa: 'Ripoti kwa WhatsApp' },
  'report.phone': { en: 'Call Toll-Free', lug: 'Yita ku Toll-Free', nyn: 'Kureeta ku Toll-Free', teo: 'Toll-Free Iparit', luo: 'Toll-Free Tedo', lgg: 'Toll-Free Riipota', xog: 'Yita ku Toll-Free', cgg: 'Kureeta ku Toll-Free', ach: 'Toll-Free Lan', swa: 'Piga Simu Bure' },
  'auth.login': { en: 'Login', lug: 'Yingira', nyn: 'Kwinyura', teo: 'Ilosi', luo: 'Donjo', lgg: 'Login', xog: 'Yingira', cgg: 'Kwinyura', ach: 'Donjo', swa: 'Ingia' },
  'auth.register': { en: 'Register', lug: 'Wewandise', nyn: 'Kwiyandiha', teo: 'Ikir', luo: 'Ndik', lgg: 'Rijista', xog: 'Wewandise', cgg: 'Kwiyandiha', ach: 'Ndik', swa: 'Jisajili' },
  'auth.email': { en: 'Email', lug: 'Imeyiro', nyn: 'Email', teo: 'Email', luo: 'Email', lgg: 'Email', xog: 'Imeyiro', cgg: 'Email', ach: 'Email', swa: 'Barua pepe' },
  'auth.password': { en: 'Password', lug: 'Ekinyigi Kyama', nyn: 'Ekihisho', teo: 'Ekihisho', luo: 'Mung', lgg: 'Pasiwodi', xog: 'Ekinyigi Kyama', cgg: 'Ekihisho', ach: 'Mung', swa: 'Neno la siri' },
  'auth.language': { en: 'Preferred Language', lug: 'Olulimi Lw\'Oyagala', nyn: 'Orurimi Orw\'orahenda', teo: 'Akaidi', luo: 'Leb Ma Ihero', lgg: 'Linda Ma Ozi', xog: 'Olulimi Lw\'Oyagala', cgg: 'Orurimi Orw\'orahenda', ach: 'Leb Ma Ihero', swa: 'Lugha Unayopendelea' },
  'auth.phone': { en: 'Phone Number', lug: 'Enamba ya Essimu', nyn: 'Enamba ya Simu', teo: 'Simu Namba', luo: 'Namba Simu', lgg: 'Namba Simu', xog: 'Enamba ya Essimu', cgg: 'Enamba ya Simu', ach: 'Namba Simu', swa: 'Nambari ya Simu' },
  'auth.name': { en: 'Full Name', lug: 'Erinya Lyonna', nyn: 'Eizina', teo: 'Ekon', luo: 'Nying', lgg: 'Ama Maa', xog: 'Erinya Lyonna', cgg: 'Eizina', ach: 'Nying', swa: 'Jina Kamili' },
  'chat.title': { en: 'Hydro AI Assistant', lug: 'Muyambi wa Hydro AI', nyn: 'Omuhwezi wa Hydro AI', teo: 'Hydro AI Ekon', luo: 'Hydro AI Jakony', lgg: 'Hydro AI Maa Taa', xog: 'Muyambi wa Hydro AI', cgg: 'Omuhwezi wa Hydro AI', ach: 'Hydro AI Jakony', swa: 'Msaidizi wa Hydro AI' },
  'chat.placeholder': { en: 'Ask a question in any language...', lug: 'Buuza ekibuuzo mu lulimi lwonna...', nyn: 'Buuza ekibuuzo mu rurimi orwona...', teo: 'Ikir Iparit...', luo: 'Penjo penjo...', lgg: 'Ena ri aza...', xog: 'Buuza ekibuuzo...', cgg: 'Buuza ekibuuzo...', ach: 'Penjo penjo...', swa: 'Uliza swali kwa lugha yoyote...' },
  'chat.send': { en: 'Send', lug: 'Tuma', nyn: 'Kohereza', teo: 'Ikir', luo: 'Cuno', lgg: 'Tuma', xog: 'Tuma', cgg: 'Kohereza', ach: 'Cuno', swa: 'Tuma' },
  'chat.voice': { en: 'Voice Message', lug: 'Ebboozi', nyn: 'Orurari', teo: 'Aitu', luo: 'Dwoko', lgg: 'Voisi', xog: 'Ebboozi', cgg: 'Orurari', ach: 'Dwoko', swa: 'Sauti' },
  'status.submitted': { en: 'Submitted', lug: 'Kuwawo', nyn: 'Kureetwa', teo: 'Ikir', luo: 'Ochuk', lgg: 'Tumawa', xog: 'Kuwawo', cgg: 'Kureetwa', ach: 'Ochuk', swa: 'Imewasilishwa' },
  'status.investigating': { en: 'Under Investigation', lug: 'Kupeereza', nyn: 'Okushoroma', teo: 'Aipar', luo: 'Non', lgg: 'Risoma', xog: 'Kupeereza', cgg: 'Okushoroma', ach: 'Non', swa: 'Inachunguzwa' },
  'status.assigned': { en: 'Assigned', lug: 'Kuwaweebwa', nyn: 'Kuheerwa', teo: 'Ikir', luo: 'Omiyo', lgg: 'Asayiniwa', xog: 'Kuwaweebwa', cgg: 'Kuheerwa', ach: 'Omiyo', swa: 'Imetengwa' },
  'status.resolved': { en: 'Resolved', lug: 'Kutereeza', nyn: 'Kuharurwa', teo: 'Aibuin', luo: 'Oseru', lgg: 'Risoru', xog: 'Kutereeza', cgg: 'Kuharurwa', ach: 'Oseru', swa: 'Imetatuliwa' },
  'status.escalated': { en: 'Escalated', lug: 'Kuwa yongerwa', nyn: 'Kureetwa Hembega', teo: 'Ikwan', luo: 'Omedo Malo', lgg: 'Esikileitiwa', xog: 'Kuwa Yongerwa', cgg: 'Kureetwa Hembega', ach: 'Omedo Malo', swa: 'Imepelekwa Juu' },
  'incident.water_contamination': { en: 'Water Contamination', lug: 'Okufuula Amazzi', nyn: 'Okutamya Ebijo', teo: 'Aipi', luo: 'Chilo', lgg: 'Ri Fula', xog: 'Okufuula Amazzi', cgg: 'Okutamya Ebijo', ach: 'Nyilo', swa: 'Uchafuzi wa Maji' },
  'incident.broken_water_point': { en: 'Broken Water Point', lug: 'Ettabi Lyamazzi Limenyese', nyn: 'Eky\'omwisho Kyamagara', teo: 'Amazi', luo: 'Ot', lgg: 'Ama Ri Fula', xog: 'Ettabi Lyamazzi Limenyese', cgg: 'Ekya\'omwisho Kyamagara', ach: 'Ot Ma Otyo', swa: 'Kituo cha Maji Kimeharibika' },
  'incident.flooding': { en: 'Flooding', lug: 'Amataba', nyn: 'Emataba', teo: 'Aipi', luo: 'Pii', lgg: 'Ama Fula', xog: 'Amataba', cgg: 'Emataba', ach: 'Pii', swa: 'Mafuriko' },
  'incident.sewage_leak': { en: 'Sewage Leak', lug: 'Okuseseeka Kw\'ekivundu', nyn: 'Okusaasaana Kw\'ekivundu', teo: 'Aibe', luo: 'Odeni', lgg: 'Sewage Leak', xog: 'Okuseseeka Kw\'ekivundu', cgg: 'Okusaasaana Kw\'ekivundu', ach: 'Odeni', swa: 'Kuvuja kwa Maji Taka' },
  'incident.illegal_dumping': { en: 'Illegal Dumping', lug: 'Okuteguka Kw\'amateeka', nyn: 'Okutegura Amateeka', teo: 'Aibe', luo: 'Kelo Odeni', lgg: 'Ilegal Dumping', xog: 'Okuteguka Kw\'amateeka', cgg: 'Okutegura Amateeka', ach: 'Kelo Neko', swa: 'Utekaji Nyara Haramu' },
  'incident.pollution': { en: 'Pollution', lug: 'Okufuula', nyn: 'Okutamya', teo: 'Aipi', luo: 'Chilo', lgg: 'Polushon', xog: 'Okufuula', cgg: 'Okutamya', ach: 'Chilo', swa: 'Uchafuzi' },
  'incident.environmental_hazard': { en: 'Environmental Hazard', lug: 'Akabi mu Bikolwa', nyn: 'Akabi', teo: 'Aibe', luo: 'Hazard', lgg: 'Hazard', xog: 'Akabi mu Bikolwa', cgg: 'Akabi', ach: 'Hazard', swa: 'Hatari ya Mazingira' },
  'incident.infrastructure_damage': { en: 'Infrastructure Damage', lug: 'Okwonona Ebyuma', nyn: 'Okwonona', teo: 'Aibuin', luo: 'Tyeko', lgg: 'Infrastructure Damage', xog: 'Okwonona Ebyuma', cgg: 'Okwonona', ach: 'Tyeko', swa: 'Uharibifu wa Miundombinu' },
  'incident.disease_report': { en: 'Disease / Illness Report', lug: 'Obulwadde / Bwanguzi', nyn: 'Endwara / Obulwadde', teo: 'Adwari / Abui', luo: 'Two / Tuo', lgg: 'Adwari Riipota', xog: 'Obulwadde', cgg: 'Endwara', ach: 'Two Riport', swa: 'Ripoti ya Ugonjwa' },
  'alert.success.report': { en: 'Your report has been submitted successfully!', lug: 'Lipoota yo yeeteekeddwa mu bwangu!', nyn: 'Embaruha yawe ehareetwa!', teo: 'Iparit ka ibuin!', luo: 'Tedo mari ochun!', lgg: 'Riipota maa tuma!', xog: 'Lipooti yo yeteekeddwa!', cgg: 'Embaruha yawe ehareetwa!', ach: 'Tedo meri ocun!', swa: 'Ripoti yako imewasilishwa kwa mafanikio!' },
  'alert.error.report': { en: 'Failed to submit report. Please try again.', lug: 'Kutayinza kuteeka lipoota. Nkwegayirira yongerayo.', nyn: 'Ensobi mukureeta. Ija.', teo: 'Iparit ibe. Ijan.', luo: 'Tedo ochun. Tim doki.', lgg: 'Riipota tuma. Ritrai.', xog: 'Kutayinza kuteeka lipooti. Yongerayo.', cgg: 'Ensobi mukureeta. Ija.', ach: 'Tedo ocun. Tim doki.', swa: 'Imeshindwa kuwasilisha ripoti. Jaribu tena.' },
  'alert.success.translate': { en: 'Translated successfully', lug: 'Ekivvuunulwa mu bwangu', nyn: 'Ekyahindurwa', teo: 'Aibuin', luo: 'Oseru', lgg: 'Transleitiwa', xog: 'Ekivvuunulwa mu bwangu', cgg: 'Ekyahindurwa', ach: 'Oseru', swa: 'Imetafsiriwa kwa mafanikio' },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [offlineMode, setOfflineModeState] = useState(false);
  const cacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const saved = localStorage.getItem('hs_language') as LanguageCode;
    if (saved && LANGUAGE_MAP[saved]) setLanguageState(saved);
    const offline = localStorage.getItem('hs_offline_mode') === 'true';
    setOfflineModeState(offline);
  }, []);

  const setLanguage = useCallback((code: LanguageCode) => {
    setLanguageState(code);
    localStorage.setItem('hs_language', code);
  }, []);

  const setOfflineMode = useCallback((v: boolean) => {
    setOfflineModeState(v);
    localStorage.setItem('hs_offline_mode', v.toString());
  }, []);

  const t = useCallback((key: string): string => {
    const entry = UI_STRINGS[key];
    if (!entry) return key;
    return entry[language] || entry['en'] || key;
  }, [language]);

  const translate = useCallback(async (text: string, targetLang?: LanguageCode): Promise<string> => {
    if (!text || targetLang === language) return text;
    const lang = targetLang || language;
    if (lang === 'en') return text;
    const cacheKey = `translate:${lang}:${text.slice(0, 200)}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) return cached;

    setIsTranslating(true);
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('hs_token')}` },
        body: JSON.stringify({ text, target_language: lang, source_language: 'en' }),
      });
      const data = await res.json();
      const translated = data.translated_text || text;
      cacheRef.current.set(cacheKey, translated);
      if (cacheRef.current.size > 200) cacheRef.current.clear();
      return translated;
    } catch { return text; }
    finally { setIsTranslating(false); }
  }, [language]);

  const translateToEnglish = useCallback(async (text: string, sourceLang?: LanguageCode): Promise<string> => {
    if (!text) return text;
    const lang = sourceLang || language;
    if (lang === 'en') return text;
    const cacheKey = `toEnglish:${text.slice(0, 200)}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) return cached;

    setIsTranslating(true);
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('hs_token')}` },
        body: JSON.stringify({ text, target_language: 'en', source_language: lang }),
      });
      const data = await res.json();
      const translated = data.translated_text || text;
      cacheRef.current.set(cacheKey, translated);
      return translated;
    } catch { return text; }
    finally { setIsTranslating(false); }
  }, [language]);

  const speak = useCallback((text: string, lang?: LanguageCode) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang || language;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [language]);

  return (
    <LanguageContext.Provider value={{
      language, setLanguage, t, translate, translateToEnglish,
      supportedLanguages: SUPPORTED_LANGUAGES,
      currentLang: LANGUAGE_MAP[language],
      isTranslating, speak, isSpeaking, offlineMode, setOfflineMode,
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
