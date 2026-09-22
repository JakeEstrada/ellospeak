import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { getTtsConfig, statusPayload, synthesizeSpeech } from './server/openaiTts.js';

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
        const config = getTtsConfig(env);

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(statusPayload(config)));
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        try {
          const raw = await readRequestBody(req);
          const { text } = JSON.parse(raw || '{}');
          const audio = await synthesizeSpeech(text, config);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'no-store');
          res.end(audio);
        } catch (err) {
          res.statusCode = err?.status || 500;
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
