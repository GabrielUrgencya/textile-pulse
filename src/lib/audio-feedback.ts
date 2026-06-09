/**
 * Audio feedback using Web Audio API for Aduana validation.
 * Story 8.5 — beep patterns for green/orange/red states.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine"
) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0.3;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration / 1000);
}

/** Green: short high beep */
export function playSuccess() {
  playTone(880, 150, "sine");
}

/** Orange: double beep */
export function playWarning() {
  playTone(660, 200, "sine");
  setTimeout(() => playTone(660, 200, "sine"), 300);
}

/** Red: low grave tone */
export function playError() {
  playTone(440, 400, "sawtooth");
}
