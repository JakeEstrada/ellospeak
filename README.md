# Tap & Say

A simple AAC (augmentative and alternative communication) board for young kids. Large picture buttons speak a word out loud when tapped — helping a child connect **picture → word → something happens**.

## Features

- 8 big, colorful buttons: Eat, Drink, More, All done, Play, Help, Diaper, Hug
- Tap sound effects plus spoken word feedback
- Mute toggle and a short “how to use” guide for caregivers
- Works with free built-in browser speech (offline)
- Optional OpenAI TTS for clearer, warmer voices

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://127.0.0.1:5173/`). Best on a tablet in landscape.

## Optional: OpenAI voice

Browser speech works with no setup. For a nicer voice:

```bash
cp .env.example .env
```

Then set `OPENAI_API_KEY` in `.env` and restart the dev server.

Useful settings (see `.env.example` for full notes):

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables cloud TTS via a local `/api/tts` proxy |
| `OPENAI_TTS_VOICE` | e.g. `shimmer`, `nova`, `coral`, `sage` |
| `OPENAI_TTS_MODEL` | Prefer `gpt-4o-mini-tts` for style instructions |
| `OPENAI_TTS_INSTRUCTIONS` | How the voice should sound (kid-friendly tone) |
| `VITE_TTS_ENGINE` | `auto` (default), `browser`, or `openai` |

OpenAI does not offer true child character voices. For that, a provider like ElevenLabs would be needed.

## Customize the board

Edit `src/components/boardButtons.js` to change words, emoji, or labels. Each button `id` needs matching colors in `src/components/CommunicationBoard.css` (`--<id>` and `--<id>-ink`).

Run any vocabulary or layout changes past the child’s speech-language pathologist — **consistent placement matters**.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |

## Stack

React + Vite. Speech uses the Web Speech API by default, or OpenAI audio when configured.
