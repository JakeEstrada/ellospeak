import { useCallback, useEffect, useRef, useState } from 'react';

const enginePref = (import.meta.env.VITE_TTS_ENGINE || 'auto').toLowerCase();

// Let themed SFX finish before the spoken word so they don't smear together
const SPEECH_START_DELAY_MS = 320;

function preferBrowser() {
  return enginePref === 'browser';
}

function preferOpenAI() {
  return enginePref === 'openai' || enginePref === 'auto';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = en.length ? en : voices;
  const preferred =
    pool.find((v) => /google us english|samantha|karen|moira|zira|female|nova/i.test(v.name)) ||
    pool.find((v) => !/male|david|mark|daniel/i.test(v.name)) ||
    pool[0];
  return preferred || null;
}

function speakBrowser(word, voiceRef) {
  if (!('speechSynthesis' in window)) return false;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume?.();

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.92;
    utterance.pitch = 1.08;
    utterance.lang = 'en-US';
    const voice = voiceRef.current || pickVoice();
    if (voice) {
      voiceRef.current = voice;
      utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

async function fetchSpeechBlob(word) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: word }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `TTS failed (${res.status})`);
  }
  return res.blob();
}

function stopAudio(audioRef) {
  if (!audioRef.current) return;
  try {
    audioRef.current.pause();
    const prev = audioRef.current.src;
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
  } catch {
    // ignore
  }
  audioRef.current = null;
}

function playBlob(blob, audioRef) {
  return new Promise((resolve, reject) => {
    try {
      stopAudio(audioRef);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      audioRef.current = audio;

      let settled = false;
      const finish = (ok, err) => {
        if (settled) return;
        settled = true;
        if (!ok) URL.revokeObjectURL(url);
        if (ok) resolve(true);
        else reject(err || new Error('Audio playback failed'));
      };

      audio.onended = () => {
        URL.revokeObjectURL(url);
        finish(true);
      };
      audio.onerror = () => finish(false);

      const start = () => {
        audio.currentTime = 0;
        const play = audio.play();
        if (play?.catch) play.catch((err) => finish(false, err));
      };

      // Wait until the clip is buffered enough — avoids the first-tap glitch
      if (audio.readyState >= 3) start();
      else {
        audio.addEventListener('canplaythrough', start, { once: true });
        audio.load();
      }
    } catch (err) {
      reject(err);
    }
  });
}

export function useSpeech() {
  const [muted, setMuted] = useState(false);
  const [openaiAvailable, setOpenaiAvailable] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const voiceRef = useRef(null);
  const audioRef = useRef(null);
  const cacheRef = useRef(new Map());
  const inflightRef = useRef(new Map());
  const openaiOkRef = useRef(false);
  const speakGenRef = useRef(0);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    const load = () => {
      voiceRef.current = pickVoice();
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, []);

  useEffect(() => {
    if (!preferOpenAI() || preferBrowser()) return undefined;
    let cancelled = false;
    fetch('/api/tts')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        openaiOkRef.current = Boolean(data?.enabled);
        setOpenaiAvailable(Boolean(data?.enabled));
      })
      .catch(() => {
        if (cancelled) return;
        openaiOkRef.current = false;
        setOpenaiAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureCached = useCallback(async (word) => {
    if (cacheRef.current.has(word)) return cacheRef.current.get(word);
    if (inflightRef.current.has(word)) return inflightRef.current.get(word);

    const pending = fetchSpeechBlob(word)
      .then((blob) => {
        cacheRef.current.set(word, blob);
        inflightRef.current.delete(word);
        return blob;
      })
      .catch((err) => {
        inflightRef.current.delete(word);
        throw err;
      });

    inflightRef.current.set(word, pending);
    return pending;
  }, []);

  const prefetch = useCallback(
    async (words = []) => {
      if (!openaiOkRef.current || preferBrowser()) return;
      const unique = [...new Set(words.filter(Boolean))];
      await Promise.allSettled(unique.map((word) => ensureCached(word)));
    },
    [ensureCached]
  );

  const speak = useCallback(
    async (word) => {
      if (mutedRef.current) return;
      if (typeof window === 'undefined') return;

      const gen = ++speakGenRef.current;
      const useOpenAI =
        preferOpenAI() && !preferBrowser() && openaiOkRef.current && enginePref !== 'browser';

      // Effect first, then voice — avoids the crunch/slurp + speech smear
      await wait(SPEECH_START_DELAY_MS);
      if (gen !== speakGenRef.current || mutedRef.current) return;

      if (useOpenAI) {
        try {
          const blob = await ensureCached(word);
          if (gen !== speakGenRef.current || mutedRef.current) return;
          await playBlob(blob, audioRef);
          return;
        } catch {
          if (gen !== speakGenRef.current || mutedRef.current) return;
          speakBrowser(word, voiceRef);
          return;
        }
      }

      speakBrowser(word, voiceRef);
    },
    [ensureCached]
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        speakGenRef.current += 1;
        try {
          window.speechSynthesis?.cancel();
        } catch {
          // ignore
        }
        stopAudio(audioRef);
      }
      return next;
    });
  }, []);

  return { speak, muted, toggleMute, mutedRef, openaiAvailable, prefetch };
}
