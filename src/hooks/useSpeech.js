import { useCallback, useEffect, useRef, useState } from 'react';

const enginePref = (import.meta.env.VITE_TTS_ENGINE || 'auto').toLowerCase();

function preferBrowser() {
  return enginePref === 'browser';
}

function preferOpenAI() {
  return enginePref === 'openai' || enginePref === 'auto';
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

function playBlob(blob, audioRef) {
  return new Promise((resolve, reject) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        const prev = audioRef.current.src;
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.preload = 'auto';
      audioRef.current = audio;
      audio.onended = () => resolve(true);
      audio.onerror = () => reject(new Error('Audio playback failed'));
      const play = audio.play();
      if (play?.catch) play.catch(reject);
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

      const useOpenAI =
        preferOpenAI() && !preferBrowser() && openaiOkRef.current && enginePref !== 'browser';

      if (useOpenAI) {
        // Instant path: already warmed
        if (cacheRef.current.has(word)) {
          try {
            await playBlob(cacheRef.current.get(word), audioRef);
            return;
          } catch {
            // fall through
          }
        }

        // Not ready yet — speak immediately with device voice, warm cache in background
        speakBrowser(word, voiceRef);
        ensureCached(word).catch(() => {});
        return;
      }

      speakBrowser(word, voiceRef);
    },
    [ensureCached]
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        try {
          window.speechSynthesis?.cancel();
        } catch {
          // ignore
        }
        if (audioRef.current) {
          audioRef.current.pause();
        }
      }
      return next;
    });
  }, []);

  return { speak, muted, toggleMute, mutedRef, openaiAvailable, prefetch };
}
