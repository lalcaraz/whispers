import { DEFAULT_LOCALE } from '@/constants';
import { en } from './en';
import { es } from './es';
import { de } from './de';
import { it } from './it';
import { pt } from './pt';
import * as Localization from 'expo-localization';

export type Locale = 'en' | 'es' | 'de' | 'it' | 'pt';

export const locales: Record<Locale, typeof en> = {
  en,
  es,
  de,
  it,
  pt,
};

export const defaultLocale: Locale = DEFAULT_LOCALE;

/**
 * Get the device's locale and map it to a supported locale.
 * Falls back to English if the device's locale is not supported.
 */
export function getDeviceLocale(): Locale {
  const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
  
  // Map device language code to supported locale
  // e.g., 'es-MX', 'es-ES' -> 'es'
  const languageCode = deviceLocale.split('-')[0].toLowerCase();
  
  // Check if we have a translation for this language
  if (languageCode in locales) {
    return languageCode as Locale;
  }
  
  // Default to English if not supported
  return 'en';
}

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
};
