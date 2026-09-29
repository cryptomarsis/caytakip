# Android release optimization

EAS excludes `/android/` and generates a fresh native project. Release settings
therefore belong in the existing `expo-build-properties` entry in `app.json`:

- `android.enableMinifyInReleaseBuilds: true`
- `android.enableShrinkResourcesInReleaseBuilds: true`

The checked-in Android Gradle properties already have these flags enabled. Do not
upgrade AGP/Kotlin independently of Expo or add blanket `-keep`/`-dontwarn` rules
to hide failures. Existing SDK consumer rules remain responsible for reflection
and JNI entry points. iOS build settings are unchanged.

## Before publishing a new Android bundle

1. Run the tests and build a **release AAB**, not a debug APK. AAB 26 predates this
   configuration change and cannot acquire optimization after it is built.
2. Check the new AAB for `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`
   and, when supplied by the bundled AGP version, `BUNDLE-METADATA/com.android.tools/r8.json`.
   Keep the mapping belonging to that exact version for crash analysis.
3. Test the optimized build via Google Play internal testing: cold launch, login,
   harvest/payment save, receipt reading, quota, notifications, ads, purchase and restore.
   JS unit tests and a debug build do not prove R8 runtime compatibility.
4. Inspect Play's report for the **new version code**. Enabling R8 is not proof of
   a particular percentage: retained SDK code and Play's analysis affect the score.

No EAS build or store upload is triggered by changing these settings.
