const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
function harness() {
  const state = { os: 'ios', app: 'active', prefs: { harvest: true, payment: true, due: true }, players: [], modes: [], timers: [], throws: false, pendingPrefs: null };
  const audio = {
    setAudioModeAsync: async (mode) => { if (state.throws) throw Error('native'); state.modes.push(mode); },
    createAudioPlayer: () => {
      const p = { plays: 0, removed: 0, volume: 1, loop: true, addListener: (_, cb) => { p.finish = cb; return { remove() {} }; }, remove: () => p.removed++, play: () => p.plays++ };
      state.players.push(p); return p;
    },
  };
  const mocks = {
    'react-native': { Platform: { get OS() { return state.os; } }, AppState: { get currentState() { return state.app; } } },
    './soundPreferences': { getSoundPreferences: async () => state.pendingPrefs || state.prefs },
    'expo-audio': audio,
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/services/feedbackSounds.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, require: (name) => name.endsWith('.wav') ? 1 : mocks[name], setTimeout: (fn) => { state.timers.push(fn); return 1; }, clearTimeout() {},
  });
  return { api: exports, state };
}
test('successful feedback is brief, quiet, non-background and cleaned up at finish', async () => {
  const h = harness(); await h.api.playFeedbackSound('harvest', 'u1');
  assert.equal(h.state.players.length, 1);
  const p = h.state.players[0]; assert.equal(p.plays, 1); assert.ok(p.volume <= 0.6); assert.equal(p.loop, false);
  assert.equal(h.state.modes[0].playsInSilentMode, false); assert.equal(h.state.modes[0].shouldPlayInBackground, false);
  assert.equal(h.state.modes[0].allowsRecording, undefined);
  p.finish({ didJustFinish: true }); assert.equal(p.removed, 1);
  h.api.stopFeedbackSound(); assert.equal(p.removed, 1);
});
test('disabled preference, web, background and assistant block suppress sound', async () => {
  for (const mode of ['disabled', 'web', 'background', 'assistant']) {
    const h = harness();
    if (mode === 'disabled') h.state.prefs.payment = false;
    if (mode === 'web') h.state.os = 'web';
    if (mode === 'background') h.state.app = 'background';
    if (mode === 'assistant') h.api.blockFeedbackSounds(true);
    await h.api.playFeedbackSound('payment', 'u1'); assert.equal(h.state.players.length, 0);
  }
});
test('pending cue is cancelled if assistant starts before preferences resolve', async () => {
  const h = harness(); let resolve;
  h.state.pendingPrefs = new Promise((done) => { resolve = done; });
  const pending = h.api.playFeedbackSound('harvest', 'u1');
  h.api.blockFeedbackSounds(true); resolve(h.state.prefs); await pending;
  assert.equal(h.state.players.length, 0);
});
test('second cue stops first, timeout cleans stalled playback; native errors do not escape', async () => {
  const h = harness(); await h.api.playFeedbackSound('harvest', 'u1'); await h.api.playFeedbackSound('payment', 'u1');
  assert.equal(h.state.players[0].removed, 1);
  h.state.timers.at(-1)(); assert.equal(h.state.players[1].removed, 1);
  h.state.throws = true; await assert.doesNotReject(() => h.api.playFeedbackSound('payment', 'u1'));
});
test('WAV assets use supported short mono PCM and native due resource matches', () => {
  for (const name of ['harvest_saved', 'payment_received', 'due_reminder']) {
    const data = fs.readFileSync(path.join(__dirname, `../assets/sounds/${name}.wav`));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF'); assert.equal(data.readUInt16LE(20), 1); assert.equal(data.readUInt16LE(22), 1); assert.equal(data.readUInt16LE(34), 16);
    assert.ok(data.readUInt32LE(40) / 2 / data.readUInt32LE(24) < 1.5);
  }
  const native = path.join(__dirname, '../android/app/src/main/res/raw/due_reminder.wav');
  if (fs.existsSync(native)) assert.deepEqual(fs.readFileSync(native), fs.readFileSync(path.join(__dirname, '../assets/sounds/due_reminder.wav')));
});
