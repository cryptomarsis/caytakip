# Apple review follow-up — 1.0.16 (53)

## Code changes

- The native ATT request runs after the startup animation, before the login/onboarding screens mount. There is no iOS pre-permission persuasive/dismissible dialog.
- Requests wait for the app to be active; concurrent callers share one request. Undetermined results are not persisted as answered permissions. Denied/restricted users can still use the app.
- Native Meta auto-init/auto-event logging and AdMob delayed measurement flags prevent automatic startup. Meta/Firebase measurement is enabled only after explicit consent. Existing native denial overrides saved consent.
- Ad components wait for ATT resolution and Google UMP readiness. With tracking denied, ad requests are non-personalized; unavailable consent leaves ads hidden, not the app blocked.
- Expo config changes require a new native binary; the reviewed build 53 does not contain these fixes.

## Evidence still required (not completed by code tests)

1. Install the NEW TestFlight build on a physical iPhone/iPad. Make sure tracking permission is still undetermined and the device/account permits requesting tracking. A global OS restriction or a prior denial must not be bypassed.
2. Capture a genuine screen recording: launch, ATT system prompt, user's choice, subsequent login/app flow. Test both acceptance and denial. Do not show real private user/financial data.
3. Use the physical iPad/latest OS requested by Apple if available. Local mocked tests cannot establish iPadOS 27 behavior or prove network timing; verify SDK diagnostics/network behavior on the device too.
4. Replace all Android-derived App Store screenshots, including every affected iPad/iPhone slot in View All Sizes in Media Manager, with genuine iOS app screenshots. Do not fabricate an iOS status bar over Android captures.
5. Attach the recording via App Review correspondence and provide its location in App Review Information notes. Only then state that the requested evidence is attached and resubmit for public review.

Do not claim a physical-device recording, screenshot replacement or Apple approval until actually completed. No such evidence has been produced in the local test suite.
