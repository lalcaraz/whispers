// Expo dynamic config. Reads the static config from app.json (passed in as
// `config`, already flattened — no `expo` wrapper) and overlays operator values
// from .env (see .env.example):
//   PACKAGE_NAME    - iOS bundle id / Android package
//   EAS_PROJECT_ID  - EAS project id used for push tokens
import 'dotenv/config';

export default ({ config }) => {
  const pkg =
    process.env.PACKAGE_NAME ||
    config.android?.package ||
    config.ios?.bundleIdentifier ||
    'com.lalcaraz.whispers';

  return {
    ...config,
    ios: {
      ...(config.ios || {}),
      bundleIdentifier: pkg,
    },
    android: {
      ...(config.android || {}),
      package: pkg,
    },
    extra: {
      ...(config.extra || {}),
      eas: {
        ...(config.extra?.eas || {}),
        projectId: process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
      },
    },
  };
};
