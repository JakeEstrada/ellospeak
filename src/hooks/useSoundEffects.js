import { useCallback, useRef } from 'react';

function ensureContext(ref) {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ref.current) ref.current = new AC();
  if (ref.current.state === 'suspended') {
    ref.current.resume().catch(() => {});
  }
  return ref.current;
}

// Priming a silent buffer avoids the first-interaction audio crackle on some browsers
function primeOutput(ctx) {
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // ignore
  }
}

function noiseBuffer(ctx, seconds) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function tone(ctx, { freq, endFreq, duration, type = 'sine', volume = 0.12, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 40), t0 + duration);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst(ctx, { duration, volume, delay = 0, type = 'bandpass', freq = 1200, Q = 4 }) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, duration);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  filter.Q.value = Q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.01);
}

function crunch(ctx) {
  // Chewy crackle: a few sharp noise bites
  for (let i = 0; i < 4; i++) {
    noiseBurst(ctx, {
      duration: 0.04,
      volume: 0.16 - i * 0.02,
      delay: i * 0.05,
      freq: 900 + i * 350,
      Q: 2.2,
    });
  }
  tone(ctx, { freq: 180, endFreq: 90, duration: 0.1, type: 'triangle', volume: 0.04, delay: 0.02 });
}

function slurp(ctx) {
  // Wet sip: descending whoosh + bubbly noise
  noiseBurst(ctx, { duration: 0.28, volume: 0.12, delay: 0, type: 'lowpass', freq: 900, Q: 0.7 });
  noiseBurst(ctx, { duration: 0.18, volume: 0.08, delay: 0.08, type: 'bandpass', freq: 1400, Q: 1.2 });
  tone(ctx, { freq: 420, endFreq: 140, duration: 0.26, type: 'sine', volume: 0.06, delay: 0 });
  tone(ctx, { freq: 260, endFreq: 90, duration: 0.22, type: 'triangle', volume: 0.035, delay: 0.05 });
}

function more(ctx) {
  tone(ctx, { freq: 520, duration: 0.08, volume: 0.12, delay: 0 });
  tone(ctx, { freq: 660, duration: 0.08, volume: 0.12, delay: 0.07 });
  tone(ctx, { freq: 820, duration: 0.12, volume: 0.14, delay: 0.14 });
}

function done(ctx) {
  tone(ctx, { freq: 380, endFreq: 160, duration: 0.18, type: 'triangle', volume: 0.14 });
  noiseBurst(ctx, { duration: 0.08, volume: 0.1, delay: 0.02, type: 'lowpass', freq: 400, Q: 0.8 });
}

function playToy(ctx) {
  tone(ctx, { freq: 520, endFreq: 780, duration: 0.12, type: 'square', volume: 0.07, delay: 0 });
  tone(ctx, { freq: 780, endFreq: 520, duration: 0.14, type: 'square', volume: 0.06, delay: 0.1 });
  tone(ctx, { freq: 980, duration: 0.1, type: 'triangle', volume: 0.08, delay: 0.2 });
}

function helpAlert(ctx) {
  tone(ctx, { freq: 880, duration: 0.1, volume: 0.14, delay: 0 });
  tone(ctx, { freq: 880, duration: 0.1, volume: 0.14, delay: 0.14 });
  tone(ctx, { freq: 1175, duration: 0.16, volume: 0.12, delay: 0.28 });
}

function diaper(ctx) {
  noiseBurst(ctx, { duration: 0.18, volume: 0.12, type: 'highpass', freq: 1800, Q: 0.6 });
  tone(ctx, { freq: 300, endFreq: 180, duration: 0.16, type: 'sine', volume: 0.08, delay: 0.02 });
}

function hug(ctx) {
  tone(ctx, { freq: 330, endFreq: 440, duration: 0.22, type: 'sine', volume: 0.1, delay: 0 });
  tone(ctx, { freq: 440, endFreq: 554, duration: 0.28, type: 'sine', volume: 0.09, delay: 0.12 });
  tone(ctx, { freq: 554, duration: 0.2, type: 'triangle', volume: 0.07, delay: 0.28 });
}

const EFFECTS = {
  eat: crunch,
  drink: slurp,
  more,
  done,
  play: playToy,
  help: helpAlert,
  diaper,
  hug,
};

export function useSoundEffects({ mutedRef }) {
  const ctxRef = useRef(null);

  const unlock = useCallback(() => {
    const ctx = ensureContext(ctxRef);
    if (ctx) primeOutput(ctx);
  }, []);

  const playEffect = useCallback(
    (buttonId) => {
      if (mutedRef.current) return;
      const ctx = ensureContext(ctxRef);
      if (!ctx) return;
      try {
        primeOutput(ctx);
        const fx = EFFECTS[buttonId];
        if (fx) fx(ctx);
        else {
          tone(ctx, { freq: 620, endFreq: 220, duration: 0.1, volume: 0.1 });
        }
      } catch {
        // ignore
      }
    },
    [mutedRef]
  );

  return { playEffect, unlock };
}
