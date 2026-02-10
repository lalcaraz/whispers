import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { locales, getDeviceLocale, Locale } from '@locales/index';
import { Translation } from '@locales/en';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '@/constants';

type TranslationContextType = {
  t: Translation;
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getDeviceLocale());

  // Load saved locale preference on mount
  useEffect(() => {
    const loadLocale = async () => {
      try {
        const savedLocale = await SecureStore.getItemAsync(STORAGE_KEYS.LOCALE);
        if (savedLocale && savedLocale in locales) {
          setLocaleState(savedLocale as Locale);
        }
      } catch (error) {
        console.error('Error loading locale:', error);
      }
    };
    loadLocale();
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
  }, []);

  const t = locales[locale];

  return (
    <TranslationContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </TranslationContext.Provider>
  );
}

export default function useTranslation() {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
