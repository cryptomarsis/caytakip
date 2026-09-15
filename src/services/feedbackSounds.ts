import { AppState, Platform } from 'react-native';
import { getSoundPreferences } from './soundPreferences';

type Kind = 'harvest' | 'payment' | 'due';
const sources = {
  harvest: require('../../assets/sounds/harvest_saved.wav'),
  payment: require('../../assets/sounds/payment_received.wav'),
  due: require('../../assets/sounds/due_reminder.wav'),
};
let generation = 0;
let blocked = false;
let release: (() => void) | undefined;
export const stopFeedbackSound = () => { generation++; release?.(); release = undefined; };
export const blockFeedbackSounds = (value: boolean) => { blocked = value; if (value) stopFeedbackSound(); };

// Decorative sound failure must never change the outcome of a persisted record.
export const playFeedbackSound = async (kind: Kind, userId: string) => {
  if (Platform.OS === 'web' || AppState.currentState !== 'active' || blocked) return;
  stopFeedbackSound();
  const ticket = generation;
  const started = Date.now();
  const valid = () => generation === ticket && !blocked && AppState.currentState === 'active' && Date.now() - started < 2000;
  try {
    const prefs = await getSoundPreferences(userId);
    if (!prefs[kind] || !valid()) return;
    const Audio = await import('expo-audio');
    if (!valid()) return;
    // Never request microphone access, enable background audio, or override iOS mute.
    await Audio.setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
    if (!valid()) return;
    const player = Audio.createAudioPlayer(sources[kind], { keepAudioSessionActive: false, updateInterval: 100 });
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (timer) clearTimeout(timer);
      try { subscription.remove(); } catch { /* Listener may already be removed. */ }
      try { player.remove(); } catch { /* Already released by the native runtime. */ }
      if (release === dispose) release = undefined;
    };
    const subscription = player.addListener('playbackStatusUpdate', (status) => { if (status.didJustFinish) dispose(); });
    release = dispose;
    player.volume = 0.55;
    player.loop = false;
    timer = setTimeout(dispose, 4000);
    player.play();
  } catch { if (generation === ticket) stopFeedbackSound(); }
};
