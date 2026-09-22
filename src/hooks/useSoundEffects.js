import { useCallback, useRef } from 'react';

// Soft synthetic pops/chimes so taps feel responsive even before speech starts.
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

function tone(ctx, { freq, endFreq, duration, type = 'sine', volume = 0.16, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 40), t0 + duration);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function useSoundEffects({ mutedRef }) {
  const ctxRef = useRef(null);

  const unlock = useCallback(() => {
    ensureContext(ctxRef);
  }, []);

  const playTap = useCallback(() => {
    if (mutedRef.current) return;
    const ctx = ensureContext(ctxRef);
    if (!ctx) return;
    try {
      // Quick pop so the tap is heard immediately
      tone(ctx, { freq: 620, endFreq: 220, duration: 0.11, volume: 0.14 });
      // Soft confirmation chime
      tone(ctx, { freq: 880, duration: 0.08, volume: 0.07, delay: 0.05 });
      tone(ctx, { freq: 1175, duration: 0.12, volume: 0.06, delay: 0.11 });
    } catch {
      // AudioContext unavailable; ignore
    }
  }, [mutedRef]);

  return { playTap, unlock };
}
