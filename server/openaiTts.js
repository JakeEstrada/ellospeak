const DEFAULT_INSTRUCTIONS =
  'Speak warmly and gently, like a kind preschool teacher talking to a toddler. Soft, clear, cheerful, and unhurried — never robotic or stern.';

const CLASSIC_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export function getTtsConfig(env = process.env) {
  const key = (env.OPENAI_API_KEY || '').trim();
  const voice = (env.OPENAI_TTS_VOICE || 'shimmer').trim();
  const model = (env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
  const instructions = (env.OPENAI_TTS_INSTRUCTIONS || DEFAULT_INSTRUCTIONS).trim();
  return { key, voice, model, instructions, enabled: Boolean(key) };
}

export function statusPayload(config) {
  return {
    enabled: config.enabled,
    voice: config.enabled ? config.voice : null,
    model: config.enabled ? config.model : null,
  };
}

export async function synthesizeSpeech(text, config = getTtsConfig()) {
  const spoken = String(text || '').trim().slice(0, 120);
  if (!spoken) {
    const err = new Error('Missing text');
    err.status = 400;
    throw err;
  }
  if (!config.key) {
    const err = new Error('OPENAI_API_KEY is not set');
    err.status = 503;
    throw err;
  }

  const payload = {
    model: config.model,
    voice: config.voice,
    input: spoken,
    response_format: 'mp3',
  };
  if (config.model.includes('gpt-4o') && config.instructions) {
    payload.instructions = config.instructions;
  }

  const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (upstream.ok) {
    return Buffer.from(await upstream.arrayBuffer());
  }

  const fallbackVoice = CLASSIC_VOICES.includes(config.voice) ? config.voice : 'nova';
  const fallback = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice: fallbackVoice,
      input: spoken,
      response_format: 'mp3',
    }),
  });

  if (!fallback.ok) {
    const errText = await fallback.text();
    const err = new Error(errText || 'OpenAI TTS failed');
    err.status = fallback.status;
    throw err;
  }

  return Buffer.from(await fallback.arrayBuffer());
}
