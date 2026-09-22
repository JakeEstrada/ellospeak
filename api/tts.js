import { getTtsConfig, statusPayload, synthesizeSpeech } from '../server/openaiTts.js';

function readText(req) {
  if (req.body == null || req.body === '') return undefined;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body).text;
    } catch {
      return undefined;
    }
  }
  if (typeof req.body === 'object') return req.body.text;
  return undefined;
}

export default async function handler(req, res) {
  const config = getTtsConfig();

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(statusPayload(config));
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const audio = await synthesizeSpeech(readText(req), config);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: err?.message || 'TTS proxy error' });
  }
}
