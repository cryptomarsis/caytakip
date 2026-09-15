/*
 * Original, deterministic UI tones. No recordings, dependencies or licensed samples.
 * Run: node scripts/generate-feedback-sounds.cjs
 * Format: mono, 16-bit little-endian PCM WAV, 22,050 Hz.
 * The due reminder is also copied into an existing Android native resource tree.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');

const ROOT = path.resolve(path.dirname(module.filename), '..');
const SAMPLE_RATE = 22050;
const OUTPUT_DIR = path.join(ROOT, 'assets', 'sounds');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Brief ascending confirmations and a distinct, unhurried two-note reminder.
// Each note contains frequency (Hz), start (seconds), duration and relative gain.
const SOUNDS = [
  {
    name: 'harvest_saved.wav',
    duration: 0.88,
    peak: 0.38,
    notes: [
      [659.255, 0.015, 0.30, 0.75],
      [783.991, 0.145, 0.34, 0.70],
      [1046.502, 0.295, 0.55, 0.85],
    ],
  },
  {
    name: 'payment_received.wav',
    duration: 0.82,
    peak: 0.40,
    notes: [
      [783.991, 0.015, 0.34, 0.70],
      [1174.659, 0.175, 0.60, 0.90],
      [587.330, 0.175, 0.54, 0.23],
    ],
  },
  {
    name: 'due_reminder.wav',
    duration: 1.12,
    peak: 0.36,
    notes: [
      [783.991, 0.020, 0.42, 0.80],
      [1046.502, 0.410, 0.66, 0.82],
      [523.251, 0.410, 0.62, 0.20],
    ],
  },
];

function raisedCosine(progress) {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, progress)));
}

function synthesize(sound) {
  const samples = new Float64Array(Math.round(sound.duration * SAMPLE_RATE));
  for (const [frequency, start, duration, gain] of sound.notes) {
    const begin = Math.round(start * SAMPLE_RATE);
    const length = Math.round(duration * SAMPLE_RATE);
    for (let offset = 0; offset < length && begin + offset < samples.length; offset += 1) {
      const time = offset / SAMPLE_RATE;
      // Soft 12 ms onset and 90 ms release avoid hard waveform discontinuities.
      const envelope = raisedCosine(time / 0.012)
        * raisedCosine((duration - time) / 0.090)
        * Math.exp(-3.6 * time / duration);
      const phase = 2 * Math.PI * frequency * time;
      const tone = 0.86 * Math.sin(phase)
        + 0.10 * Math.sin(phase * 2)
        + 0.04 * Math.sin(phase * 3);
      samples[begin + offset] += gain * envelope * tone;
    }
  }

  const maximum = samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
  assert(maximum > 0, 'A generated tone must not be silent.');
  const pcm = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    pcm.writeInt16LE(Math.round(samples[index] / maximum * sound.peak * 32767), index * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // Linear PCM.
  header.writeUInt16LE(1, 22); // Mono.
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function inspect(wav, name) {
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), SAMPLE_RATE);
  assert.equal(wav.readUInt16LE(34), 16);
  const count = wav.readUInt32LE(40) / 2;
  let peak = 0;
  let squareSum = 0;
  for (let index = 0; index < count; index += 1) {
    const value = wav.readInt16LE(44 + index * 2) / 32768;
    peak = Math.max(peak, Math.abs(value));
    squareSum += value * value;
  }
  assert(count / SAMPLE_RATE <= 1.5);
  assert(peak > 0 && peak <= 0.5);
  assert.equal(wav.readInt16LE(44), 0);
  assert.equal(wav.readInt16LE(wav.length - 2), 0);
  return {
    name,
    format: 'PCM s16le mono',
    sampleRate: SAMPLE_RATE,
    seconds: count / SAMPLE_RATE,
    bytes: wav.length,
    peak: Number(peak.toFixed(4)),
    rms: Number(Math.sqrt(squareSum / count).toFixed(4)),
  };
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
for (const sound of SOUNDS) {
  const wav = synthesize(sound);
  const metadata = inspect(wav, sound.name);
  const destination = path.join(OUTPUT_DIR, sound.name);
  fs.writeFileSync(destination, wav);
  assert.deepEqual(fs.readFileSync(destination), wav);
  if (sound.name === 'due_reminder.wav' && fs.existsSync(ANDROID_RES)) {
    const nativeDirectory = path.join(ANDROID_RES, 'raw');
    fs.mkdirSync(nativeDirectory, { recursive: true });
    const nativeDestination = path.join(nativeDirectory, sound.name);
    fs.writeFileSync(nativeDestination, wav);
    assert.deepEqual(fs.readFileSync(nativeDestination), wav);
  }
  console.log(JSON.stringify(metadata));
}
