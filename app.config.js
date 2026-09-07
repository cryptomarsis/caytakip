const baseConfig = require('./app.json').expo;

const metaAppID = process.env.EXPO_PUBLIC_META_APP_ID?.trim();
const metaClientToken = process.env.EXPO_PUBLIC_META_CLIENT_TOKEN?.trim();
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
const googleServiceInfoPlist = process.env.GOOGLE_SERVICE_INFO_PLIST || './GoogleService-Info.plist';

const plugins = [...(baseConfig.plugins || [])];

plugins.push(
  [
    '@react-native-firebase/app',
    {
      ios: {
        disableSPM: true,
      },
    },
  ],
  '@react-native-firebase/analytics',
);

if (metaAppID && metaClientToken) {
  plugins.push([
    'react-native-fbsdk-next',
    {
      appID: metaAppID,
      clientToken: metaClientToken,
      displayName: 'Çaylık',
      scheme: `fb${metaAppID}`,
      advertiserIDCollectionEnabled: false,
      autoLogAppEventsEnabled: true,
      isAutoInitEnabled: true,
      iosUserTrackingPermission:
        'Reklamların performansını ölçmek ve size daha uygun tanıtımlar sunmak için izin verin.',
    },
  ]);
}

module.exports = {
  expo: {
    ...baseConfig,
    extra: baseConfig.extra,
    ios: {
      ...baseConfig.ios,
      googleServicesFile: googleServiceInfoPlist,
    },
    android: {
      ...baseConfig.android,
      googleServicesFile,
    },
    plugins,
  },
};
