/** iOS system permission is authoritative; the old custom prompt's dismissal isn't consent. */
export function shouldRequestTracking(platform: string, onboardingDone: boolean, promptSeen: boolean, state: string): boolean {
  if (!onboardingDone) return false;
  if (platform === 'ios') return state === 'not-determined';
  return platform === 'android' && !promptSeen && state === 'disabled';
}
