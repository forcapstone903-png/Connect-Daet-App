// Lightweight, dependency-free translation layer for the user-facing settings
// surfaces. English is the source of truth; every other locale falls back to it
// so a missing key can never render an empty label.

export const DEFAULT_LANGUAGE = 'en'

export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English', region: 'Default' },
  { code: 'fil', label: 'Filipino', nativeLabel: 'Filipino', region: 'Philippines' },
  { code: 'bik', label: 'Bikol', nativeLabel: 'Bikol', region: 'Bicol Region' },
]

const en = {
  'common.cancel': 'Cancel',
  'settings.privacy.unavailable': 'The additional controls below are not yet enforced and are unavailable. Profile visibility above uses the existing profile privacy rules.',
  'settings.notifications.unavailable': 'Category filters are not yet connected to notification delivery. Use device push permissions below; the category controls are unavailable.',
  'settings.status.signOutFailed': 'Could not sign out all devices. Please try again.',
  'settings.data.resetHint': 'Reset these preferences on this device? Choose Save changes afterward to update your account.',
  'common.on': 'On',
  'common.off': 'Off',
  'common.saving': 'Saving...',
  'common.save': 'Save changes',
  'common.saved': 'Saved',
  'common.reset': 'Reset to defaults',
  'common.unsaved': 'Unsaved changes',

  'settings.title': 'Settings',
  'settings.subtitle': 'Appearance, language, privacy, and account controls',
  'settings.nav.appearance': 'Appearance',
  'settings.nav.language': 'Language',
  'settings.nav.notifications': 'Notifications',
  'settings.nav.privacy': 'Privacy',
  'settings.nav.security': 'Account',
  'settings.nav.data': 'Data & storage',
  'settings.nav.legal': 'About & legal',

  'settings.appearance.title': 'Appearance',
  'settings.appearance.description': 'Pick the look that is easiest on your eyes. This is saved on this device.',
  'settings.appearance.theme': 'Theme',
  'settings.appearance.themeHint': 'Applies across the whole app immediately.',
  'settings.appearance.light': 'Light',
  'settings.appearance.lightHint': 'Bright surfaces for daytime',
  'settings.appearance.dark': 'Dark',
  'settings.appearance.darkHint': 'Dim surfaces for low light',
  'settings.appearance.system': 'System',
  'settings.appearance.systemHint': 'Follows your device setting',
  'settings.appearance.reduceMotion': 'Reduce motion',
  'settings.appearance.reduceMotionHint': 'Turns off page animations and smooth scrolling.',
  'settings.appearance.currentTheme': 'Active theme',

  'settings.language.title': 'Language',
  'settings.language.description': 'Choose the language used for settings and community labels.',
  'settings.language.label': 'Display language',
  'settings.language.hint': 'Your choice is stored on your profile and on this device.',
  'settings.language.preview': 'Preview',

  'settings.notifications.title': 'Notifications',
  'settings.notifications.description': 'Control what the community sends your way.',
  'settings.notifications.emailAlerts': 'Email alerts',
  'settings.notifications.activityDigest': 'Activity digest',
  'settings.notifications.newFollowers': 'New followers',
  'settings.notifications.forumMentions': 'Mentions and replies',
  'settings.notifications.announcementAlerts': 'Announcement alerts',
  'settings.notifications.push': 'Device push notifications',
  'settings.notifications.pushHint': 'Get alerts even when Daet Connect is closed.',

  'settings.privacy.title': 'Privacy',
  'settings.privacy.description': 'Decide who can find you and what visitors can see.',
  'settings.privacy.profileVisibility': 'Profile visibility',
  'settings.privacy.public': 'Public',
  'settings.privacy.publicHint': 'Anyone signed in can open your profile.',
  'settings.privacy.private': 'Private',
  'settings.privacy.privateHint': 'Hidden from search and discovery; only you can open it.',
  'settings.privacy.showOnlineStatus': 'Show online status',
  'settings.privacy.showOnlineStatusHint': 'Let others see when you are active.',
  'settings.privacy.showActivity': 'Show activity in feed',
  'settings.privacy.showActivityHint': 'Include your posts, likes, and comments in community feeds.',
  'settings.privacy.allowMessagesFrom': 'Who can message you',
  'settings.privacy.everyone': 'Everyone',
  'settings.privacy.connections': 'People I follow',
  'settings.privacy.allowMentions': 'Allow mentions and tags',
  'settings.privacy.allowMentionsHint': 'Others can mention you in posts and comments.',
  'settings.privacy.searchable': 'Appear in search results',
  'settings.privacy.searchableHint': 'Show your name in people search and the community directory.',

  'settings.security.title': 'Account & security',
  'settings.security.description': 'Manage your sign-in details and active sessions.',
  'settings.security.email': 'Sign-in email',
  'settings.security.resetPassword': 'Change password',
  'settings.security.resetPasswordHint': 'We will email you a secure reset link.',
  'settings.security.signOutAll': 'Sign out of all devices',
  'settings.security.signOutAllHint': 'Ends every other session using this account.',
  'settings.security.profile': 'Edit public profile',
  'settings.security.profileHint': 'Name, bio, photo, and cover image.',
  'settings.security.twoFactor': 'Two-factor authentication',
  'settings.security.twoFactorHint': 'Add a second step to protect your account.',

  'settings.data.title': 'Data & storage',
  'settings.data.description': 'Manage what is cached on this device.',
  'settings.data.clearCache': 'Clear cached data',
  'settings.data.clearCacheHint': 'Removes feed, profile, and search caches saved on this device.',
  'settings.data.cleared': 'Cached data cleared.',
  'settings.data.download': 'Download my settings',
  'settings.data.downloadHint': 'Exports your saved preferences as a JSON file.',
  'settings.data.install': 'Install app',
  'settings.data.installReady': 'Use the install prompt when available, or your browser menu.',
  'settings.data.installHint': 'Add Daet Connect to your home screen.',
  'settings.data.storageStatus': 'Local storage',

  'settings.legal.title': 'About & legal',
  'settings.legal.description': 'Policies that apply to your account and data.',
  'settings.legal.privacy': 'Privacy policy',
  'settings.legal.terms': 'Terms and conditions',
  'settings.legal.dataPrivacy': 'Data privacy act notice',
  'settings.legal.support': 'Send feedback',

  'settings.status.notSignedIn': 'Please sign in to save your settings.',
  'settings.status.offline': 'You are offline. Display preferences stay on this device. Reconnect and press Save changes to save account preferences.',
  'settings.status.saveFailed': 'Account settings were not fully saved. Display preferences remain on this device. Please retry.',
}

const fil = {
  'common.cancel': 'Kanselahin',
  'settings.privacy.unavailable': 'Hindi pa ipinapatupad ang mga karagdagang kontrol sa ibaba kaya hindi magagamit. Ang visibility ng profile sa itaas ay gumagamit ng kasalukuyang privacy rules.',
  'settings.notifications.unavailable': 'Hindi pa konektado sa pagpapadala ng abiso ang mga kategorya. Gamitin ang pahintulot para sa push notifications sa ibaba.',
  'settings.status.signOutFailed': 'Hindi na-sign out ang lahat ng device. Subukan muli.',
  'settings.data.resetHint': 'I-reset ang mga setting sa device na ito? Pindutin ang I-save pagkatapos upang baguhin ang account.',
  'common.on': 'Bukas',
  'common.off': 'Sarado',
  'common.saving': 'Sine-save...',
  'common.save': 'I-save ang mga pagbabago',
  'common.saved': 'Nai-save',
  'common.reset': 'Ibalik sa default',
  'common.unsaved': 'May hindi pa nai-save',

  'settings.title': 'Mga Setting',
  'settings.subtitle': 'Itsura, wika, privacy, at mga kontrol sa account',
  'settings.nav.appearance': 'Itsura',
  'settings.nav.language': 'Wika',
  'settings.nav.notifications': 'Abiso',
  'settings.nav.privacy': 'Privacy',
  'settings.nav.security': 'Account',
  'settings.nav.data': 'Data at storage',
  'settings.nav.legal': 'Tungkol at legal',

  'settings.appearance.title': 'Itsura',
  'settings.appearance.description': 'Piliin ang itsurang komportable sa mata. Naka-save ito sa device na ito.',
  'settings.appearance.theme': 'Tema',
  'settings.appearance.themeHint': 'Agad na nagbabago sa buong app.',
  'settings.appearance.light': 'Maliwanag',
  'settings.appearance.lightHint': 'Para sa maliwanag na paligid',
  'settings.appearance.dark': 'Madilim',
  'settings.appearance.darkHint': 'Para sa madilim na paligid',
  'settings.appearance.system': 'Sistema',
  'settings.appearance.systemHint': 'Sinusundan ang setting ng device',
  'settings.appearance.reduceMotion': 'Bawasan ang galaw',
  'settings.appearance.reduceMotionHint': 'Pinapatay ang animations at smooth scrolling.',
  'settings.appearance.currentTheme': 'Aktibong tema',

  'settings.language.title': 'Wika',
  'settings.language.description': 'Piliin ang wikang gagamitin sa settings at mga label.',
  'settings.language.label': 'Wika ng display',
  'settings.language.hint': 'Naka-save ang pinili mo sa profile at sa device na ito.',

  'settings.notifications.title': 'Abiso',
  'settings.notifications.description': 'Kontrolin ang ipinapadalang abiso ng komunidad.',
  'settings.notifications.emailAlerts': 'Email alerts',
  'settings.notifications.activityDigest': 'Buod ng aktibidad',
  'settings.notifications.newFollowers': 'Bagong followers',
  'settings.notifications.forumMentions': 'Mentions at replies',
  'settings.notifications.announcementAlerts': 'Mga announcement',
  'settings.notifications.push': 'Push notification ng device',
  'settings.notifications.pushHint': 'Tumanggap ng abiso kahit sarado ang app.',

  'settings.privacy.title': 'Privacy',
  'settings.privacy.description': 'Piliin kung sino ang makakahanap at makakakita sa iyo.',
  'settings.privacy.profileVisibility': 'Visibility ng profile',
  'settings.privacy.public': 'Pampubliko',
  'settings.privacy.publicHint': 'Kahit sinong naka-login ay makakabukas ng profile mo.',
  'settings.privacy.private': 'Pribado',
  'settings.privacy.privateHint': 'Hindi makikita sa search at discovery.',
  'settings.privacy.showOnlineStatus': 'Ipakita ang online status',
  'settings.privacy.showOnlineStatusHint': 'Makikita ng iba kung aktibo ka.',
  'settings.privacy.showActivity': 'Ipakita ang aktibidad sa feed',
  'settings.privacy.showActivityHint': 'Isama ang posts, likes, at comments sa feed.',
  'settings.privacy.allowMessagesFrom': 'Sino ang makakapag-message',
  'settings.privacy.everyone': 'Lahat',
  'settings.privacy.connections': 'Mga sinusundan ko',
  'settings.privacy.allowMentions': 'Payagan ang mentions at tags',
  'settings.privacy.allowMentionsHint': 'Puwedeng banggitin ka ng iba sa posts at comments.',
  'settings.privacy.searchable': 'Lumabas sa resulta ng search',
  'settings.privacy.searchableHint': 'Ipakita ang pangalan sa people search.',

  'settings.security.title': 'Account at seguridad',
  'settings.security.description': 'Pamahalaan ang sign-in at mga aktibong session.',
  'settings.security.email': 'Email pang-sign in',
  'settings.security.resetPassword': 'Palitan ang password',
  'settings.security.resetPasswordHint': 'Padadalhan ka namin ng secure na link.',
  'settings.security.signOutAll': 'Mag-log out sa lahat ng device',
  'settings.security.signOutAllHint': 'Isasara ang lahat ng session ng account na ito.',
  'settings.security.profile': 'I-edit ang pampublikong profile',
  'settings.security.profileHint': 'Pangalan, bio, larawan, at cover.',
  'settings.security.twoFactor': 'Two-factor authentication',
  'settings.security.twoFactorHint': 'Magdagdag ng pangalawang hakbang sa pag-login.',

  'settings.data.title': 'Data at storage',
  'settings.data.description': 'Pamahalaan ang naka-cache sa device na ito.',
  'settings.data.clearCache': 'Burahin ang cache',
  'settings.data.clearCacheHint': 'Tinatanggal ang cache ng feed, profile, at search.',
  'settings.data.cleared': 'Nabura na ang cache.',
  'settings.data.download': 'I-download ang settings',
  'settings.data.downloadHint': 'I-export ang preferences bilang JSON file.',
  'settings.data.install': 'I-install ang app',
  'settings.data.installHint': 'Idagdag ang Daet Connect sa home screen.',
  'settings.data.storageStatus': 'Local storage',

  'settings.legal.title': 'Tungkol at legal',
  'settings.legal.description': 'Mga patakarang sakop ng account at data mo.',
  'settings.legal.privacy': 'Patakaran sa privacy',
  'settings.legal.terms': 'Mga tuntunin at kondisyon',
  'settings.legal.dataPrivacy': 'Paunawa sa Data Privacy Act',
  'settings.legal.support': 'Magpadala ng feedback',

  'settings.status.notSignedIn': 'Mag-sign in para ma-save ang mga setting.',
  'settings.status.offline': 'Offline ka. Display settings lang ang nasa device. Kumonekta at pindutin ang I-save muli.',
  'settings.status.saveFailed': 'Hindi lubos na-save ang account settings. Display settings lang ang nasa device. Subukan muli.',
}

const bik = {
  'common.cancel': 'Kanselahon',
  'settings.privacy.unavailable': 'Dai pa ipinapatupad an mga dagdag na kontrol sa ibaba kaya dai magagamit. An profile visibility sa itaas naggagamit kan kasalukuyang privacy rules.',
  'settings.notifications.unavailable': 'Dai pa konektado sa pagpadara nin abiso an mga kategorya. Gamiton an push notification permission sa ibaba.',
  'settings.status.signOutFailed': 'Dai na-sign out an gabos na device. Subukan giraray.',
  'settings.data.resetHint': 'I-reset an settings sa device na ini? I-save pagkatapos para mabago an account.',
  'common.on': 'Bukas',
  'common.off': 'Sarang',
  'common.saving': 'Sini-save...',
  'common.save': 'I-save an mga binago',
  'common.saved': 'Na-save',
  'common.reset': 'Ibalik sa default',
  'common.unsaved': 'May dai pa na-save',

  'settings.title': 'Mga Setting',
  'settings.subtitle': 'Itsura, tataramon, privacy, asin kontrol kan account',
  'settings.nav.appearance': 'Itsura',
  'settings.nav.language': 'Tataramon',
  'settings.nav.notifications': 'Abiso',
  'settings.nav.privacy': 'Privacy',
  'settings.nav.security': 'Account',
  'settings.nav.data': 'Data asin storage',
  'settings.nav.legal': 'Manungod asin legal',

  'settings.appearance.title': 'Itsura',
  'settings.appearance.description': 'Pilion an itsura na komportable sa mata. Naka-save ini sa device na ini.',
  'settings.appearance.theme': 'Tema',
  'settings.appearance.themeHint': 'Tulos na nagbabago sa bilog na app.',
  'settings.appearance.light': 'Maliwanag',
  'settings.appearance.lightHint': 'Para sa maliwanag na lugar',
  'settings.appearance.dark': 'Madiklom',
  'settings.appearance.darkHint': 'Para sa madiklom na lugar',
  'settings.appearance.system': 'Sistema',
  'settings.appearance.systemHint': 'Sinusundan an setting kan device',
  'settings.appearance.reduceMotion': 'Pababaon an hiro',
  'settings.appearance.reduceMotionHint': 'Pinapatay an animation asin smooth scrolling.',
  'settings.appearance.currentTheme': 'Aktibong tema',

  'settings.language.title': 'Tataramon',
  'settings.language.description': 'Pilion an tataramon na gagamiton sa settings.',
  'settings.language.label': 'Tataramon sa display',
  'settings.language.hint': 'Naka-save an pinili mo sa profile asin sa device na ini.',

  'settings.notifications.title': 'Abiso',
  'settings.notifications.description': 'Kontrolon an mga abiso hali sa komunidad.',
  'settings.notifications.emailAlerts': 'Email alerts',
  'settings.notifications.activityDigest': 'Buod kan aktibidad',
  'settings.notifications.newFollowers': 'Bagong followers',
  'settings.notifications.forumMentions': 'Mentions asin replies',
  'settings.notifications.announcementAlerts': 'Mga announcement',
  'settings.notifications.push': 'Push notification kan device',
  'settings.notifications.pushHint': 'Makaresibe nin abiso maski sarado an app.',

  'settings.privacy.title': 'Privacy',
  'settings.privacy.description': 'Pilion kun siisay an makakahanap asin makakakita saimo.',
  'settings.privacy.profileVisibility': 'Visibility kan profile',
  'settings.privacy.public': 'Publiko',
  'settings.privacy.publicHint': 'Maski siisay na naka-login puwedeng magbukas.',
  'settings.privacy.private': 'Pribado',
  'settings.privacy.privateHint': 'Dai makikita sa search asin discovery.',
  'settings.privacy.showOnlineStatus': 'Ipahiling an online status',
  'settings.privacy.showOnlineStatusHint': 'Makikita kan iba kun aktibo ka.',
  'settings.privacy.showActivity': 'Ipahiling an aktibidad sa feed',
  'settings.privacy.showActivityHint': 'Iiba an posts, likes, asin comments sa feed.',
  'settings.privacy.allowMessagesFrom': 'Siisay an makakapag-message',
  'settings.privacy.everyone': 'Gabos',
  'settings.privacy.connections': 'Mga sinusundan ko',
  'settings.privacy.allowMentions': 'Tugutan an mentions asin tags',
  'settings.privacy.allowMentionsHint': 'Puwedeng idamay ka kan iba sa posts.',
  'settings.privacy.searchable': 'Lumataw sa resulta kan search',
  'settings.privacy.searchableHint': 'Ipahiling an pangaran sa people search.',

  'settings.security.title': 'Account asin seguridad',
  'settings.security.description': 'Pamahalaon an sign-in asin mga aktibong session.',
  'settings.security.email': 'Email sa pag-sign in',
  'settings.security.resetPassword': 'Salidahan an password',
  'settings.security.resetPasswordHint': 'Padadalahan ka mi nin secure na link.',
  'settings.security.signOutAll': 'Mag-log out sa gabos na device',
  'settings.security.signOutAllHint': 'Isasara an gabos na session kan account.',
  'settings.security.profile': 'I-edit an publiko mong profile',
  'settings.security.profileHint': 'Pangaran, bio, retrato, asin cover.',
  'settings.security.twoFactor': 'Two-factor authentication',
  'settings.security.twoFactorHint': 'Magdagdag nin ikaduwang hakbang sa pag-login.',

  'settings.data.title': 'Data asin storage',
  'settings.data.description': 'Pamahalaon an naka-cache sa device na ini.',
  'settings.data.clearCache': 'Buraon an cache',
  'settings.data.clearCacheHint': 'Tinatanggal an cache kan feed, profile, asin search.',
  'settings.data.cleared': 'Nabura na an cache.',
  'settings.data.download': 'I-download an settings',
  'settings.data.downloadHint': 'I-export an preferences bilang JSON file.',
  'settings.data.install': 'I-install an app',
  'settings.data.installHint': 'Idagdag an Daet Connect sa home screen.',
  'settings.data.storageStatus': 'Local storage',

  'settings.legal.title': 'Manungod asin legal',
  'settings.legal.description': 'Mga patakaran na sakop kan account asin data mo.',
  'settings.legal.privacy': 'Patakaran sa privacy',
  'settings.legal.terms': 'Mga tuntunin asin kondisyon',
  'settings.legal.dataPrivacy': 'Paunawa sa Data Privacy Act',
  'settings.legal.support': 'Magpadara nin feedback',

  'settings.status.notSignedIn': 'Mag-sign in tanganing ma-save an settings.',
  'settings.status.offline': 'Offline ka. Display settings sana an nasa device. Kumonekta asin i-save giraray.',
  'settings.status.saveFailed': 'Dai gabos na-save an account settings. Display settings sana an nasa device. Subukan giraray.',
}

const DICTIONARIES = { en, fil, bik }

export function isSupportedLanguage(code) {
  return Object.prototype.hasOwnProperty.call(DICTIONARIES, String(code || ''))
}

export function normalizeLanguage(code) {
  const value = String(code || '').trim().toLowerCase()
  if (isSupportedLanguage(value)) return value
  if (value.startsWith('tl') || value.startsWith('fil')) return 'fil'
  if (value.startsWith('bik') || value.startsWith('bcl')) return 'bik'
  return DEFAULT_LANGUAGE
}

export function getLanguage(code) {
  const normalized = normalizeLanguage(code)
  return LANGUAGES.find((language) => language.code === normalized) || LANGUAGES[0]
}

/**
 * Creates a translator bound to a locale. Usage:
 *   const t = createTranslator('fil')
 *   t('settings.privacy.title')            // translated label
 *   t('settings.missing.key', 'Fallback')  // English, then explicit fallback
 */
export function createTranslator(locale = DEFAULT_LANGUAGE) {
  const language = normalizeLanguage(locale)
  const table = DICTIONARIES[language] || en

  return function translate(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key]
    if (Object.prototype.hasOwnProperty.call(en, key)) return en[key]
    return fallback ?? key
  }
}

export const TRANSLATIONS = DICTIONARIES

// Inline preview sentence shown next to the language picker so the effect of the
// choice is visible before it is saved.
export const LANGUAGE_PREVIEW_KEYS = [
  'settings.title',
  'settings.appearance.theme',
  'settings.privacy.profileVisibility',
  'settings.notifications.newFollowers',
]