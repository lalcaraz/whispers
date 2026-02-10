import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import useTranslation from '@hooks/useTranslation';
import { localeNames, Locale } from '@locales/index';
import { styles } from './styles';

export default function LanguageSelector() {
  const { locale, setLocale } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Language</Text>
      <ScrollView>
        {(Object.keys(localeNames) as Locale[]).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.option, locale === key && styles.optionActive]}
            onPress={() => setLocale(key)}
          >
            <Text style={[styles.optionText, locale === key && styles.optionTextActive]}>
              {localeNames[key]}
            </Text>
            {locale === key && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
