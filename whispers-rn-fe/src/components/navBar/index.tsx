import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useNavBar from '@hooks/useNavBar';
import { styles } from './styles';

export default function NavBar() {
  const { config } = useNavBar();
  const insets = useSafeAreaInsets();

  if (!config.visible) {
    return null;
  }

  // Always render the navbar container
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.leftSection}>
        {config.leftAction && (
          <TouchableOpacity onPress={config.leftAction} style={styles.button}>
            <Text style={styles.buttonText}>{config.leftIcon || '←'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.centerSection}>
        {config.title ? (
          <Text style={styles.title} numberOfLines={1}>
            {config.title}
          </Text>
        ) : null}
      </View>

      <View style={styles.rightSection}>
        {config.rightAction && (
          <TouchableOpacity onPress={config.rightAction} style={styles.button}>
            <Text style={styles.buttonText}>{config.rightIcon || '⋯'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
