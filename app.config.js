module.exports = ({ config: baseConfig }) => {
  const metaAppID = process.env.EXPO_PUBLIC_META_APP_ID?.trim();
  const metaClientToken = process.env.EXPO_PUBLIC_META_CLIENT_TOKEN?.trim();
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
  const googleServiceInfoPlist = process.env.GOOGLE_SERVICE_INFO_PLIST || './GoogleService-Info.plist';
  const plugins = [...(baseConfig.plugins || [])];

  plugins.push(
    ['@react-native-firebase/app', { ios: { disableSPM: true } }],
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
        autoLogAppEventsEnabled: false,
        isAutoInitEnabled: false,
        iosUserTrackingPermission:
          'İzninizle uygulama kullanım verileri reklam ortaklarının verileriyle eşleştirilerek kampanya performansı ölçülür ve reklamlar kişiselleştirilir.',
      },
    ]);
  }

  return {
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
  };
};
