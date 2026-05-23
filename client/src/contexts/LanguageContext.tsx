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
  'nav.home': {
    en: 'Home', lug: 'Ennyumba', nyn: 'Eka', teo: 'Eka', luo: 'Ot', lgg: "E'yo",
    xog: 'Ewaka', cgg: 'Eka', ach: 'Tedo', swa: 'Nyumbani',
    nyo: 'Eka', ttj: 'Eka', laj: 'Ot', alz: 'Ot', myx: 'Omwi', kdj: 'Awi',
  },
  'nav.dashboard': {
    en: 'Dashboard', lug: 'Ddundi', nyn: 'Ekaragwe', teo: 'Ekaragwe', luo: 'Karaja',
    lgg: 'Dasi', xog: 'Dasi', cgg: 'Ekaragwe', ach: 'Ducu', swa: 'Dashibodi',
    nyo: 'Ekaragwe', ttj: 'Ekaragwe', laj: 'Deski', alz: 'Deski', myx: 'Dashi', kdj: 'Deski',
  },
  'nav.reports': {
    en: 'Reports', lug: 'Lipooti', nyn: 'Embaruha', teo: 'Iparit', luo: 'Tedo',
    lgg: 'Riipota', xog: 'Lipooti', cgg: 'Embaruha', ach: 'Tedo', swa: 'Ripoti',
    nyo: 'Oburuha', ttj: 'Embaruha', laj: 'Lipooti', alz: 'Riport', myx: 'Lipooti', kdj: 'Riipota',
  },
  'nav.tracking': {
    en: 'My Reports', lug: 'Lipooti Zange', nyn: 'Embaruha Zangye', teo: 'Iparit Ka',
    luo: 'Tedo Mago', lgg: 'Riipota Maa', xog: 'Lipooti Zange', cgg: 'Embaruha Zangye',
    ach: 'Tedo Mego', swa: 'Ripoti Zangu',
    nyo: 'Oburuha Bwangu', ttj: 'Embaruha Zangye', laj: 'Lipooti Maga', alz: 'Riport Maga',
    myx: 'Lipooti Yange', kdj: 'Riipota Ka',
  },
  'nav.profile': {
    en: 'Profile', lug: 'Pulofaayo', nyn: 'Ebifa', teo: 'Ebe', luo: 'Kido',
    lgg: 'Pulofaayu', xog: 'Pulofaayo', cgg: 'Ebifa', ach: 'Kido', swa: 'Wasifu',
    nyo: 'Obwangu', ttj: 'Ebifa', laj: 'Kor', alz: 'Kor', myx: 'Profiilo', kdj: 'Ebe',
  },
  'nav.logout': {
    en: 'Logout', lug: 'Kuva mu', nyn: 'Kuva', teo: 'Irori', luo: 'Wuok',
    lgg: 'Logout', xog: 'Kuva', cgg: 'Kuva', ach: 'Wuok', swa: 'Toka',
    nyo: 'Kuva', ttj: 'Kuva', laj: 'Wot', alz: 'Wot', myx: 'Fuluma', kdj: 'Irori',
  },
  'common.submit': {
    en: 'Submit', lug: 'Kuwa omu', nyn: 'Kureeta', teo: 'Ikir', luo: 'Chuno',
    lgg: 'Tuma', xog: 'Kuwa', cgg: 'Kureeta', ach: 'Cuno', swa: 'Wasilisha',
    nyo: 'Kuheereza', ttj: 'Kuheereza', laj: 'Cwalo', alz: 'Cwal', myx: 'Siima', kdj: 'Ikar',
  },
  'common.cancel': {
    en: 'Cancel', lug: 'Kusaza', nyn: 'Kuhagarara', teo: 'Irori', luo: 'Gweko',
    lgg: 'Kansa', xog: 'Kusaza', cgg: 'Kuhagarara', ach: 'Gweko', swa: 'Ghairi',
    nyo: 'Kuhagarara', ttj: 'Kuhagarara', laj: 'Juk', alz: 'Juk', myx: 'Dema', kdj: 'Irori',
  },
  'common.loading': {
    en: 'Loading...', lug: "Zing'a...", nyn: 'Ninetaha...', teo: 'Ejaale...', luo: 'Chako...',
    lgg: 'Loading...', xog: 'Zinga...', cgg: 'Ninetaha...', ach: 'Cako...', swa: 'Inapakia...',
    nyo: 'Nitaahirwa...', ttj: 'Niitaho...', laj: 'Tye ka cano...', alz: 'Tye ka cano...',
    myx: 'Zinga...', kdj: 'Ejaale...',
  },
  'common.error': {
    en: 'Error', lug: 'Ensobi', nyn: 'Ensobi', teo: 'Aibe', luo: 'Bal',
    lgg: 'Eroro', xog: 'Ensobi', cgg: 'Ensobi', ach: 'Bal', swa: 'Hitilafu',
    nyo: 'Ensobi', ttj: 'Ensobi', laj: 'Bal', alz: 'Bal', myx: 'Obubi', kdj: 'Aibe',
  },
  'common.success': {
    en: 'Success', lug: 'Okugwa', nyn: 'Okugwa', teo: 'Ejok', luo: 'Adier',
    lgg: 'Success', xog: 'Okugwa', cgg: 'Okugwa', ach: 'Adier', swa: 'Mafanikio',
    nyo: 'Okugwa', ttj: 'Okugwa', laj: 'Adyer', alz: 'Adier', myx: 'Okutuuka', kdj: 'Ejok',
  },
  'common.save': {
    en: 'Save', lug: 'Kukuuma', nyn: 'Kuhunza', teo: 'Itoni', luo: 'Gwoko',
    lgg: 'Seefu', xog: 'Kukuuma', cgg: 'Kuhunza', ach: 'Gwoko', swa: 'Hifadhi',
    nyo: 'Kuhunza', ttj: 'Kuhunza', laj: 'Gwoko', alz: 'Gwoko', myx: 'Bika', kdj: 'Itoni',
  },
  'common.delete': {
    en: 'Delete', lug: 'Kusangula', nyn: 'Kujura', teo: 'Irori', luo: 'Gwoko',
    lgg: 'Dilite', xog: 'Kusangula', cgg: 'Kujura', ach: 'Kelo', swa: 'Futa',
    nyo: 'Kujura', ttj: 'Kujura', laj: 'Kwany', alz: 'Kwany', myx: 'Sangula', kdj: 'Ikwany',
  },
  'common.search': {
    en: 'Search', lug: 'Kunoonya', nyn: 'Kushoroma', teo: 'Ikir', luo: 'Manyo',
    lgg: 'Saachi', xog: 'Kunoonya', cgg: 'Kushoroma', ach: 'Manyo', swa: 'Tafuta',
    nyo: 'Kushoroma', ttj: 'Kushoroma', laj: 'Yeny', alz: 'Yeny', myx: 'Nonya', kdj: 'Yeny',
  },
  'common.back': {
    en: 'Back', lug: 'Emabega', nyn: 'Omushozi', teo: 'Ape', luo: 'Dog',
    lgg: 'Baki', xog: 'Emabega', cgg: 'Omushozi', ach: 'Dok', swa: 'Nyuma',
    nyo: 'Omushozi', ttj: 'Omushozi', laj: 'Dok', alz: 'Dok', myx: 'Emabega', kdj: 'Ape',
  },
  'common.next': {
    en: 'Next', lug: 'Emyuma', nyn: 'Omuma', teo: 'Ato', luo: 'Kwaro',
    lgg: 'Nekisi', xog: 'Emyuma', cgg: 'Omuma', ach: 'Kwaro', swa: 'Inayofuata',
    nyo: 'Omuma', ttj: 'Omuma', laj: 'Kwaro', alz: 'Kwaro', myx: 'Emyuma', kdj: 'Ato',
  },
  'common.close': {
    en: 'Close', lug: 'Kugalawo', nyn: 'Kugara', teo: 'Irori', luo: 'Lor',
    lgg: 'Klosi', xog: 'Kugala', cgg: 'Kugara', ach: 'Lor', swa: 'Funga',
    nyo: 'Kugara', ttj: 'Kugara', laj: 'Lor', alz: 'Lor', myx: 'Gala', kdj: 'Ilor',
  },
  'common.retry': {
    en: 'Retry', lug: 'Yongerayo', nyn: 'Ija', teo: 'Ijan', luo: 'Tim',
    lgg: 'Ritrai', xog: 'Yongera', cgg: 'Ija', ach: 'Tim doki', swa: 'Jaribu tena',
    nyo: 'Ija', ttj: 'Ija', laj: 'Tim Doki', alz: 'Tim Doki', myx: 'Yongera', kdj: 'Ijan',
  },
  'common.offline': {
    en: 'You are offline. Changes will sync when connected.',
    lug: 'Oli walawo mu ntabala. Enkyuka ejja kusync nga olina ntambula.',
    nyn: 'Ninye hanwa. Ebyahinduka bija kusync nga mwine.',
    teo: 'Ejaale ibe. Aibuin ija kusync.',
    luo: "Intye gi wang' ng'eyo. Gini lok ne biro sync.",
    lgg: 'Ma koni off. Riiga ma koni neeti.',
    xog: 'Oli walawo. Enkyuka ejja kusync.',
    cgg: 'Ninye hanwa. Ebihinduka bija kusync.',
    ach: "Itye ki wang' ng'eyo. Gin lok ne biro sync.",
    swa: 'Uko nje ya mtandao. Mabadiliko yatasawazisha.',
    nyo: 'Nihaire. Ebyahinduka bija kusync.',
    ttj: 'Torero. Ebyahinduka bija kusync.',
    laj: 'Pe kimet. Gin bic lokke ka kimet.',
    alz: 'Pe kimet. Gin bic lokke ka kimet.',
    myx: 'Toolina simu. Ebihinduka bijja kusync.',
    kdj: 'Mam simu. Gin bic naa kusync.',
  },
  'report.title': {
    en: 'Report an Incident', lug: 'Teeka Lipoota', nyn: 'Kureeta Embaruha',
    teo: 'Ikir Iparit', luo: 'Chuno Tedo', lgg: "Riipota Ku'di", xog: 'Teeka Lipooti',
    cgg: 'Kureeta Embaruha', ach: 'Cuno Tedo', swa: 'Ripoti Tukio',
    nyo: 'Kureeta Oburuha', ttj: 'Kureeta Embaruha', laj: 'Cwal Lipooti', alz: 'Cwal Riport',
    myx: 'Siima Lipooti', kdj: 'Ikar Riipota',
  },
  'report.description': {
    en: 'Describe what you saw or record a voice message',
    lug: "Nyonyola ky'olabye oba oyige eddoboozi",
    nyn: "Nyetoora eky'oraba oba kuhurira orurari",
    teo: 'Ikir aito luo', luo: 'Nyisa neno', lgg: "Andiko ri ma o'bi",
    xog: "Nyonyola ky'olabye", cgg: "Nyetoora eky'oraba",
    ach: 'Nyisa neno', swa: 'Elea ulichokiona au rekodi sauti',
    nyo: "Nyetoora eky'oraba oba kuhurira orurari",
    ttj: "Nyetoora eky'oraba oba kuhurira orurari",
    laj: 'Nyut gin ma ineno oba kwero dwoko',
    alz: 'Nyut gin ma ineno oba kwero dwoko',
    myx: "Nyonyola kyo walabye oba osoze eddoboozi",
    kdj: 'Ikir aito luo',
  },
  'report.voice': {
    en: 'Record Voice', lug: 'Oyige Eddoboozi', nyn: 'Kuhurira Orurari', teo: 'Ikir Aitu',
    luo: 'Dwoko', lgg: 'Rikodi', xog: 'Oyige Eddoboozi', cgg: 'Kuhurira Orurari',
    ach: 'Dwoko', swa: 'Rekodi Sauti',
    nyo: 'Kuhurira Orurari', ttj: 'Kuhurira Orurari', laj: 'Kwero Dwoko', alz: 'Kwero Dwoko',
    myx: 'Oyize Eddoboozi', kdj: 'Ikir Aitu',
  },
  'report.type': {
    en: 'Incident Type', lug: "Ekika ky'Ensobi", nyn: 'Ekika', teo: 'Aibe', luo: 'Tedo',
    lgg: 'Taipu', xog: "Ekika ky'Ensobi", cgg: 'Ekika', ach: 'Tedo', swa: 'Aina ya Tukio',
    nyo: 'Ekika', ttj: 'Ekika', laj: 'Kit', alz: 'Kit', myx: 'Ekika', kdj: 'Aibe',
  },
  'report.location': {
    en: 'Location', lug: 'Walawo', nyn: 'Aha', teo: 'Ka', luo: 'Wang',
    lgg: 'Lu', xog: 'Walawo', cgg: 'Aha', ach: 'Wang', swa: 'Mahali',
    nyo: 'Aha', ttj: 'Aha', laj: 'Kabedo', alz: 'Kakuot', myx: 'Walawo', kdj: 'Ka',
  },
  'report.district': {
    en: 'District', lug: 'Disitulikiti', nyn: 'Disitulikiti', teo: 'Disitulikiti',
    luo: 'Distrik', lgg: 'Disitulikiti', xog: 'Disitulikiti', cgg: 'Disitulikiti',
    ach: 'Distrik', swa: 'Wilaya',
    nyo: 'Disitulikiti', ttj: 'Disitulikiti', laj: 'Distrik', alz: 'Distrik',
    myx: 'Disitulikiti', kdj: 'Disitulikiti',
  },
  'report.subcounty': {
    en: 'Sub-County', lug: 'Ggombolola', nyn: 'Sub-county', teo: 'Ebe', luo: 'Sub-county',
    lgg: 'Sub-county', xog: 'Ggombolola', cgg: 'Sub-county', ach: 'Sub-county', swa: 'Kata',
    nyo: 'Sub-county', ttj: 'Sub-county', laj: 'Sub-county', alz: 'Sub-county',
    myx: 'Ggombolola', kdj: 'Sub-county',
  },
  'report.village': {
    en: 'Village', lug: 'Kyalo', nyn: 'Omugyenge', teo: 'Ader', luo: 'Gweng',
    lgg: 'Anga', xog: 'Kyalo', cgg: 'Omugyenge', ach: 'Gweng', swa: 'Kijiji',
    nyo: 'Omugyenge', ttj: 'Omugyenge', laj: 'Gweng', alz: 'Wang', myx: 'Kyalo', kdj: 'Ader',
  },
  'report.photo': {
    en: 'Take Photo', lug: 'Funa Ekifaananyi', nyn: 'Gamba', teo: 'Ikir', luo: 'Mako',
    lgg: 'Foti', xog: 'Funa Ekifaananyi', cgg: 'Gamba', ach: 'Mako', swa: 'Piga Picha',
    nyo: 'Gambeera', ttj: 'Gambeera', laj: 'Mak Cal', alz: 'Mak Cal',
    myx: 'Funa Ekifaananyi', kdj: 'Ikir Foto',
  },
  'report.anonymous': {
    en: 'Report Anonymously', lug: 'Teeka Lipoota Mu Kukyama', nyn: 'Kureeta Embajuha Ntama',
    teo: 'Ikir Iparit Kona', luo: 'Chuno Tedo Maling', lgg: 'Riipota Mu Kama',
    xog: 'Teeka Lipooti Mu Kukyama', cgg: 'Kureeta Embaruha Ntama',
    ach: 'Cuno Tedo Maling', swa: 'Ripoti Kwa Siri',
    nyo: 'Kureeta Oburuha Ntama', ttj: 'Kureeta Embaruha Ntama',
    laj: 'Cwal Lipooti Maling', alz: 'Cwal Riport Maling',
    myx: 'Siima Lipooti Mu Kukyama', kdj: 'Ikar Riipota Kona',
  },
  'report.track': {
    en: 'Track My Report', lug: 'Londolola Lipoota Yange', nyn: 'Kulondoola Embaruha Zangye',
    teo: 'Ikir Iparit Ka', luo: 'Luwo Tedo Maga', lgg: 'Londolola Riipota Maa',
    xog: 'Londolola Lipooti Yange', cgg: 'Kulondoola Embaruha Zangye',
    ach: 'Luwo Tedo Mego', swa: 'Fuatilia Ripoti Yangu',
    nyo: 'Kulondoola Oburuha', ttj: 'Kulondoola Embaruha',
    laj: 'Luwo Lipooti Maga', alz: 'Luwo Riport Maga',
    myx: 'Londolola Lipooti Yange', kdj: 'Ikir Riipota Ka',
  },
  'report.SMS': {
    en: 'Report via SMS', lug: 'Teeka Lipoota nga SMS', nyn: 'Kureeta SMS',
    teo: 'SMS Iparit', luo: 'SMS Tedo', lgg: 'SMS Riipota', xog: 'Teeka Lipooti nga SMS',
    cgg: 'Kureeta SMS', ach: 'SMS Tedo', swa: 'Ripoti kwa SMS',
    nyo: 'Kureeta SMS', ttj: 'Kureeta SMS', laj: 'Cwal SMS', alz: 'Cwal SMS',
    myx: 'Siima SMS', kdj: 'Ikar SMS',
  },
  'report.whatsapp': {
    en: 'Report via WhatsApp', lug: 'Teeka Lipoota nga WhatsApp', nyn: 'Kureeta WhatsApp',
    teo: 'WhatsApp Iparit', luo: 'WhatsApp Tedo', lgg: 'WhatsApp Riipota',
    xog: 'Teeka Lipooti nga WhatsApp', cgg: 'Kureeta WhatsApp',
    ach: 'WhatsApp Tedo', swa: 'Ripoti kwa WhatsApp',
    nyo: 'Kureeta WhatsApp', ttj: 'Kureeta WhatsApp', laj: 'Cwal WhatsApp', alz: 'Cwal WhatsApp',
    myx: 'Siima WhatsApp', kdj: 'Ikar WhatsApp',
  },
  'report.phone': {
    en: 'Call Toll-Free', lug: 'Yita ku Toll-Free', nyn: 'Kureeta ku Toll-Free',
    teo: 'Toll-Free Iparit', luo: 'Toll-Free Tedo', lgg: 'Toll-Free Riipota',
    xog: 'Yita ku Toll-Free', cgg: 'Kureeta ku Toll-Free',
    ach: 'Toll-Free Lan', swa: 'Piga Simu Bure',
    nyo: 'Yita Toll-Free', ttj: 'Yita Toll-Free', laj: 'Yer Simu Toll-Free',
    alz: 'Yer Simu Toll-Free', myx: 'Yita Toll-Free', kdj: 'Yer Simu Toll-Free',
  },
  'auth.login': {
    en: 'Login', lug: 'Yingira', nyn: 'Kwinyura', teo: 'Ilosi', luo: 'Donjo',
    lgg: 'Login', xog: 'Yingira', cgg: 'Kwinyura', ach: 'Donjo', swa: 'Ingia',
    nyo: 'Kwinyura', ttj: 'Kwinyura', laj: 'Donyo', alz: 'Donjo', myx: 'Yingira', kdj: 'Ilosi',
  },
  'auth.register': {
    en: 'Register', lug: 'Wewandise', nyn: 'Kwiyandiha', teo: 'Ikir', luo: 'Ndik',
    lgg: 'Rijista', xog: 'Wewandise', cgg: 'Kwiyandiha', ach: 'Ndik', swa: 'Jisajili',
    nyo: 'Kwiyandiha', ttj: 'Kwiyandiha', laj: 'Ndik', alz: 'Ndik', myx: 'Wewandise', kdj: 'Ikir',
  },
  'auth.email': {
    en: 'Email', lug: 'Imeyiro', nyn: 'Email', teo: 'Email', luo: 'Email',
    lgg: 'Email', xog: 'Imeyiro', cgg: 'Email', ach: 'Email', swa: 'Barua pepe',
    nyo: 'Email', ttj: 'Email', laj: 'Email', alz: 'Email', myx: 'Imeyiro', kdj: 'Email',
  },
  'auth.password': {
    en: 'Password', lug: 'Ekinyigi Kyama', nyn: 'Ekihisho', teo: 'Ekihisho', luo: 'Mung',
    lgg: 'Pasiwodi', xog: 'Ekinyigi Kyama', cgg: 'Ekihisho', ach: 'Mung', swa: 'Neno la siri',
    nyo: 'Ekihisho', ttj: 'Ekihisho', laj: 'Mung', alz: 'Mung', myx: 'Ekinyigi Kyama', kdj: 'Ekihisho',
  },
  'auth.language': {
    en: 'Preferred Language', lug: "Olulimi Lw'Oyagala", nyn: "Orurimi Orw'orahenda",
    teo: 'Akaidi', luo: 'Leb Ma Ihero', lgg: 'Linda Ma Ozi',
    xog: "Olulimi Lw'Oyagala", cgg: "Orurimi Orw'orahenda",
    ach: 'Leb Ma Ihero', swa: 'Lugha Unayopendelea',
    nyo: "Orurimi Orw'orahenda", ttj: 'Orurimi', laj: 'Leb Ma Ihero', alz: 'Leb Ma Ihero',
    myx: "Olulimi Lw'oyagala", kdj: 'Akaidi',
  },
  'auth.phone': {
    en: 'Phone Number', lug: 'Enamba ya Essimu', nyn: 'Enamba ya Simu', teo: 'Simu Namba',
    luo: 'Namba Simu', lgg: 'Namba Simu', xog: 'Enamba ya Essimu', cgg: 'Enamba ya Simu',
    ach: 'Namba Simu', swa: 'Nambari ya Simu',
    nyo: 'Enamba ya Simu', ttj: 'Enamba ya Simu', laj: 'Namba Simu', alz: 'Namba Simu',
    myx: 'Enamba ya Simu', kdj: 'Simu Namba',
  },
  'auth.name': {
    en: 'Full Name', lug: 'Erinya Lyonna', nyn: 'Eizina', teo: 'Ekon', luo: 'Nying',
    lgg: 'Ama Maa', xog: 'Erinya Lyonna', cgg: 'Eizina', ach: 'Nying', swa: 'Jina Kamili',
    nyo: 'Eizina', ttj: 'Eizina', laj: 'Nying', alz: 'Nying', myx: 'Erinya', kdj: 'Ekon',
  },
  'chat.title': {
    en: 'Hydro AI Assistant', lug: 'Muyambi wa Hydro AI', nyn: 'Omuhwezi wa Hydro AI',
    teo: 'Hydro AI Ekon', luo: 'Hydro AI Jakony', lgg: 'Hydro AI Maa Taa',
    xog: 'Muyambi wa Hydro AI', cgg: 'Omuhwezi wa Hydro AI',
    ach: 'Hydro AI Jakony', swa: 'Msaidizi wa Hydro AI',
    nyo: 'Muyambi wa Hydro AI', ttj: 'Muyambi wa Hydro AI',
    laj: 'Muyambi wa Hydro AI', alz: 'Muyambi wa Hydro AI',
    myx: 'Muyambi wa Hydro AI', kdj: 'Muyambi wa Hydro AI',
  },
  'chat.placeholder': {
    en: 'Ask a question in any language...',
    lug: 'Buuza ekibuuzo mu lulimi lwonna...',
    nyn: 'Buuza ekibuuzo mu rurimi orwona...',
    teo: 'Ikir Iparit...',
    luo: 'Penjo penjo...',
    lgg: 'Ena ri aza...',
    xog: 'Buuza ekibuuzo...',
    cgg: 'Buuza ekibuuzo...',
    ach: 'Penjo penjo...',
    swa: 'Uliza swali kwa lugha yoyote...',
    nyo: 'Buuza ekibuuzo mu rurimi orwona...',
    ttj: 'Buuza ekibuuzo mu rurimi orwona...',
    laj: 'Penj ki leb mo...',
    alz: 'Penj ki leb mo...',
    myx: 'Buuza ekibuuzo mu lulimi lwonna...',
    kdj: 'Ikir ekibuuzo...',
  },
  'chat.send': {
    en: 'Send', lug: 'Tuma', nyn: 'Kohereza', teo: 'Ikir', luo: 'Cuno',
    lgg: 'Tuma', xog: 'Tuma', cgg: 'Kohereza', ach: 'Cuno', swa: 'Tuma',
    nyo: 'Kohereza', ttj: 'Kohereza', laj: 'Cwalo', alz: 'Cwal', myx: 'Tuma', kdj: 'Ikar',
  },
  'chat.voice': {
    en: 'Voice Message', lug: 'Ebboozi', nyn: 'Orurari', teo: 'Aitu', luo: 'Dwoko',
    lgg: 'Voisi', xog: 'Ebboozi', cgg: 'Orurari', ach: 'Dwoko', swa: 'Sauti',
    nyo: 'Orurari', ttj: 'Orurari', laj: 'Dwoko', alz: 'Dwoko', myx: 'Eddoboozi', kdj: 'Aitu',
  },
  'status.submitted': {
    en: 'Submitted', lug: 'Kuwawo', nyn: 'Kureetwa', teo: 'Ikir', luo: 'Ochuk',
    lgg: 'Tumawa', xog: 'Kuwawo', cgg: 'Kureetwa', ach: 'Ochuk', swa: 'Imewasilishwa',
    nyo: 'Kureetwa', ttj: 'Kureetwa', laj: 'Okicwalo', alz: 'Ocwalo', myx: 'Waweebwa', kdj: 'Iparit',
  },
  'status.investigating': {
    en: 'Under Investigation', lug: 'Kupeereza', nyn: 'Okushoroma', teo: 'Aipar',
    luo: 'Non', lgg: 'Risoma', xog: 'Kupeereza', cgg: 'Okushoroma', ach: 'Non', swa: 'Inachunguzwa',
    nyo: 'Okushoroma', ttj: 'Okushoroma', laj: 'Tye ka nono', alz: 'Tye ka nono',
    myx: 'Kupeereza', kdj: 'Aipar',
  },
  'status.assigned': {
    en: 'Assigned', lug: 'Kuwaweebwa', nyn: 'Kuheerwa', teo: 'Ikir', luo: 'Omiyo',
    lgg: 'Asayiniwa', xog: 'Kuwaweebwa', cgg: 'Kuheerwa', ach: 'Omiyo', swa: 'Imetengwa',
    nyo: 'Kuheerwa', ttj: 'Kuheerwa', laj: 'Omiye', alz: 'Omiye', myx: 'Weeberwa', kdj: 'Ikir',
  },
  'status.resolved': {
    en: 'Resolved', lug: 'Kutereeza', nyn: 'Kuharurwa', teo: 'Aibuin', luo: 'Oseru',
    lgg: 'Risoru', xog: 'Kutereeza', cgg: 'Kuharurwa', ach: 'Oseru', swa: 'Imetatuliwa',
    nyo: 'Kuharurwa', ttj: 'Kuharurwa', laj: 'Otum', alz: 'Otum', myx: 'Kutereeza', kdj: 'Aibuin',
  },
  'status.escalated': {
    en: 'Escalated', lug: 'Kuwa yongerwa', nyn: 'Kureetwa Hembega', teo: 'Ikwan',
    luo: 'Omedo Malo', lgg: 'Esikileitiwa', xog: 'Kuwa Yongerwa', cgg: 'Kureetwa Hembega',
    ach: 'Omedo Malo', swa: 'Imepelekwa Juu',
    nyo: 'Kureetwa Hembega', ttj: 'Kureetwa Hembega', laj: 'Okiwilo Malo', alz: 'Owilo Malo',
    myx: 'Yongerwa', kdj: 'Ikwan',
  },
  'incident.water_contamination': {
    en: 'Water Contamination', lug: 'Okufuula Amazzi', nyn: 'Okutamya Ebijo',
    teo: 'Aipi', luo: 'Chilo', lgg: 'Ri Fula', xog: 'Okufuula Amazzi',
    cgg: 'Okutamya Ebijo', ach: 'Nyilo', swa: 'Uchafuzi wa Maji',
    nyo: 'Okutamya Amazi', ttj: 'Okutamya Amazi', laj: 'Pii Otaone', alz: 'Pi Otaone',
    myx: 'Okufuula Amakasi', kdj: 'Ngikai Taone',
  },
  'incident.broken_water_point': {
    en: 'Broken Water Point', lug: 'Ettabi Lyamazzi Limenyese',
    nyn: "Eky'omwisho Kyamagara", teo: 'Amazi', luo: 'Ot',
    lgg: 'Ama Ri Fula', xog: 'Ettabi Lyamazzi Limenyese',
    cgg: "Ekya'omwisho Kyamagara", ach: 'Ot Ma Otyo', swa: 'Kituo cha Maji Kimeharibika',
    nyo: "Eky'omwisho Kyamagara", ttj: "Eky'omwisho Kyamagara",
    laj: 'Kabedo Pa Pii Oballe', alz: 'Kabedo Pa Pi Oballe',
    myx: 'Ettabi Lyamakasi Limenyese', kdj: 'Ngikai Aballe',
  },
  'incident.flooding': {
    en: 'Flooding', lug: 'Amataba', nyn: 'Emataba', teo: 'Aipi', luo: 'Pii',
    lgg: 'Ama Fula', xog: 'Amataba', cgg: 'Emataba', ach: 'Pii', swa: 'Mafuriko',
    nyo: 'Emataba', ttj: 'Emataba', laj: 'Pii Olaro', alz: 'Pi Olaro',
    myx: 'Amataba', kdj: 'Ngikai Laro',
  },
  'incident.sewage_leak': {
    en: 'Sewage Leak', lug: "Okuseseeka Kw'ekivundu", nyn: "Okusaasaana Kw'ekivundu",
    teo: 'Aibe', luo: 'Odeni', lgg: 'Sewage Leak', xog: "Okuseseeka Kw'ekivundu",
    cgg: "Okusaasaana Kw'ekivundu", ach: 'Odeni', swa: 'Kuvuja kwa Maji Taka',
    nyo: "Okusaasaana Kw'ekivundu", ttj: "Okusaasaana Kw'ekivundu",
    laj: 'Nyo Ojwayo', alz: 'Nyo Ojwayo', myx: "Okuseseeka Kw'ekivundu", kdj: 'Nyo Ojwayo',
  },
  'incident.illegal_dumping': {
    en: 'Illegal Dumping', lug: "Okuteguka Kw'amateeka", nyn: 'Okutegura Amateeka',
    teo: 'Aibe', luo: 'Kelo Odeni', lgg: 'Ilegal Dumping', xog: "Okuteguka Kw'amateeka",
    cgg: 'Okutegura Amateeka', ach: 'Kelo Neko', swa: 'Utekaji Nyara Haramu',
    nyo: 'Okutegura Amateeka', ttj: 'Okutegura Amateeka',
    laj: 'Cwalo Kwere Marac', alz: 'Cwalo Kwere Marac',
    myx: "Okuteguka Amateeka", kdj: 'Kwero Marac',
  },
  'incident.pollution': {
    en: 'Pollution', lug: 'Okufuula', nyn: 'Okutamya', teo: 'Aipi', luo: 'Chilo',
    lgg: 'Polushon', xog: 'Okufuula', cgg: 'Okutamya', ach: 'Chilo', swa: 'Uchafuzi',
    nyo: 'Okutamya', ttj: 'Okutamya', laj: 'Taone', alz: 'Taone', myx: 'Okufuula', kdj: 'Taone',
  },
  'incident.environmental_hazard': {
    en: 'Environmental Hazard', lug: 'Akabi mu Bikolwa', nyn: 'Akabi',
    teo: 'Aibe', luo: 'Hazard', lgg: 'Hazard', xog: 'Akabi mu Bikolwa',
    cgg: 'Akabi', ach: 'Hazard', swa: 'Hatari ya Mazingira',
    nyo: 'Akabi mu Bikolwa', ttj: 'Akabi mu Bikolwa',
    laj: 'Arem me Lobo', alz: 'Arem me Lobo', myx: 'Akabi mu Bikolwa', kdj: 'Arem me Ka',
  },
  'incident.infrastructure_damage': {
    en: 'Infrastructure Damage', lug: 'Okwonona Ebyuma', nyn: 'Okwonona',
    teo: 'Aibuin', luo: 'Tyeko', lgg: 'Infrastructure Damage', xog: 'Okwonona Ebyuma',
    cgg: 'Okwonona', ach: 'Tyeko', swa: 'Uharibifu wa Miundombinu',
    nyo: 'Okwonona', ttj: 'Okwonona', laj: 'Balle Marac', alz: 'Balle Marac',
    myx: 'Okwonona Ebyuma', kdj: 'Aibuin',
  },
  'incident.disease_report': {
    en: 'Disease / Illness Report', lug: 'Obulwadde / Bwanguzi', nyn: 'Endwara / Obulwadde',
    teo: 'Adwari / Abui', luo: 'Two / Tuo', lgg: 'Adwari Riipota',
    xog: 'Obulwadde', cgg: 'Endwara', ach: 'Two Riport', swa: 'Ripoti ya Ugonjwa',
    nyo: 'Endwara / Obulwadde', ttj: 'Endwara / Obulwadde',
    laj: 'Tyen / Two Lipooti', alz: 'Tyen / Two Riport',
    myx: 'Obulwadde / Bwanguzi', kdj: 'Ngidwari / Abui',
  },
  'alert.success.report': {
    en: 'Your report has been submitted successfully!',
    lug: 'Lipoota yo yeeteekeddwa mu bwangu!',
    nyn: 'Embaruha yawe ehareetwa!',
    teo: 'Iparit ka ibuin!',
    luo: 'Tedo mari ochun!',
    lgg: 'Riipota maa tuma!',
    xog: 'Lipooti yo yeteekeddwa!',
    cgg: 'Embaruha yawe ehareetwa!',
    ach: 'Tedo meri ocun!',
    swa: 'Ripoti yako imewasilishwa kwa mafanikio!',
    nyo: 'Oburuha bwawe ehareetwa!',
    ttj: 'Embaruha yawe ehareetwa!',
    laj: 'Lipooti mago ocwalo maber!',
    alz: 'Riport mago ocwalo maber!',
    myx: 'Lipooti yo yeteekeddwa!',
    kdj: 'Riipota ka ibuin!',
  },
  'alert.error.report': {
    en: 'Failed to submit report. Please try again.',
    lug: 'Kutayinza kuteeka lipoota. Nkwegayirira yongerayo.',
    nyn: 'Ensobi mukureeta. Ija.',
    teo: 'Iparit ibe. Ijan.',
    luo: 'Tedo ochun. Tim doki.',
    lgg: 'Riipota tuma. Ritrai.',
    xog: 'Kutayinza kuteeka lipooti. Yongerayo.',
    cgg: 'Ensobi mukureeta. Ija.',
    ach: 'Tedo ocun. Tim doki.',
    swa: 'Imeshindwa kuwasilisha ripoti. Jaribu tena.',
    nyo: 'Ensobi mukureeta. Ija.',
    ttj: 'Ensobi mukureeta. Ija.',
    laj: 'Lipooti pe ocwalo. Tim doki.',
    alz: 'Riport pe ocwalo. Tim doki.',
    myx: 'Kutayinza kuteeka lipooti. Yongera.',
    kdj: 'Riipota ibe. Ijan.',
  },
  'alert.success.translate': {
    en: 'Translated successfully', lug: 'Ekivvuunulwa mu bwangu', nyn: 'Ekyahindurwa',
    teo: 'Aibuin', luo: 'Oseru', lgg: 'Transleitiwa', xog: 'Ekivvuunulwa mu bwangu',
    cgg: 'Ekyahindurwa', ach: 'Oseru', swa: 'Imetafsiriwa kwa mafanikio',
    nyo: 'Ekyahindurwa', ttj: 'Ekyahindurwa', laj: 'Okitroco maber', alz: 'Okitroco maber',
    myx: 'Ekivvuunulwa', kdj: 'Okitroco maber',
  },
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
