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
    // Chrome can leave speechSynthesis paused/stuck; nudge it awake.
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume?.();

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.88;
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

async function speakOpenAI(word, audioRef, cacheRef) {
  const cached = cacheRef.current.get(word);
  if (cached) {
    return playBlob(cached, audioRef);
  }

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: word }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `TTS failed (${res.status})`);
  }

  const blob = await res.blob();
  cacheRef.current.set(word, blob);
  return playBlob(blob, audioRef);
}

function playBlob(blob, audioRef) {
  return new Promise((resolve, reject) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve(true);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Audio playback failed'));
      };
      audio.play().catch(reject);
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

  const speak = useCallback(async (word) => {
    if (mutedRef.current) return;
    if (typeof window === 'undefined') return;

    const useOpenAI =
      preferOpenAI() && !preferBrowser() && openaiOkRef.current && enginePref !== 'browser';

    if (useOpenAI) {
      try {
        await speakOpenAI(word, audioRef, cacheRef);
        return;
      } catch {
        // Fall through to free browser speech
      }
    }

    speakBrowser(word, voiceRef);
  }, []);

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

  return { speak, muted, toggleMute, mutedRef, openaiAvailable };
}
