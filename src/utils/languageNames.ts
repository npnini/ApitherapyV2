export interface LanguageInfo {
  id: string;
  name: string;
}

// Codes an admin can pick from ApplicationSettings' language shuttle-selector.
// Display names are resolved via Intl.DisplayNames, not hardcoded, so adding
// a code here is enough — no separate name string to keep in sync.
const LANGUAGE_CODES = ['en', 'es', 'fr', 'de', 'he', 'ar', 'zh', 'ru'];

const englishLanguageNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'language' })
  : null;

export function getLanguageName(code: string): string {
  try {
    return englishLanguageNames?.of(code) || code;
  } catch {
    return code;
  }
}

export const ALL_LANGUAGES: LanguageInfo[] = LANGUAGE_CODES.map(id => ({
  id,
  name: getLanguageName(id),
}));
