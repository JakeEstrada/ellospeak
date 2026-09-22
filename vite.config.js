import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function openAiTtsPlugin(env) {
  return {
    name: 'openai-tts-proxy',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        const key = env.OPENAI_API_KEY?.trim();
        const voice = (env.OPENAI_TTS_VOICE || 'shimmer').trim();
        const model = (env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
        const instructions = (
          env.OPENAI_TTS_INSTRUCTIONS ||
          'Speak warmly and gently, like a kind preschool teacher talking to a toddler. Soft, clear, cheerful, and unhurried — never robotic or stern.'
        ).trim();

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              enabled: Boolean(key),
              voice: key ? voice : null,
              model: key ? model : null,
            })
          );
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        if (!key) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not set' }));
          return;
        }

        try {
          const raw = await readRequestBody(req);
          const { text } = JSON.parse(raw || '{}');
          const spoken = String(text || '').trim().slice(0, 120);
          if (!spoken) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing text' }));
            return;
          }

          const payload = {
            model,
            voice,
            input: spoken,
            response_format: 'mp3',
          };
          // Style steering is supported on gpt-4o-mini-tts (makes it feel more kid-friendly)
          if (model.includes('gpt-4o') && instructions) {
            payload.instructions = instructions;
          }

          const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!upstream.ok) {
            // Fall back to older TTS model if the mini model isn't available on this key
            const fallbackVoice = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(
              voice
            )
              ? voice
              : 'nova';
            const fallback = await fetch('https://api.openai.com/v1/audio/speech', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${key}`,
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
              res.statusCode = fallback.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: errText || 'OpenAI TTS failed' }));
              return;
            }

            const buf = Buffer.from(await fallback.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-store');
            res.end(buf);
            return;
          }

          const buf = Buffer.from(await upstream.arrayBuffer());
          res.statusCode = 200;
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'no-store');
          res.end(buf);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'TTS proxy error' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), openAiTtsPlugin(env)],
  };
});
