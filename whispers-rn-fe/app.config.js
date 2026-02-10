// Expo app.config.js - dynamic config using .env
import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  expo: {
    ...config.expo,
    ios: {
      ...((config.expo && config.expo.ios) || {}),
      bundleIdentifier: process.env.PACKAGE_NAME || 'com.example.default',
    },
    android: {
      ...((config.expo && config.expo.android) || {}),
      package: process.env.PACKAGE_NAME || 'com.example.default',
    },
    extra: {
      ...((config.expo && config.expo.extra) || {}),
      eas: {
        ...(((config.expo && config.expo.extra && config.expo.extra.eas) || {})),
        projectId: process.env.EAS_PROJECT_ID || 'YOUR_DEFAULT_PROJECT_ID',
      },
    },
  },
});
