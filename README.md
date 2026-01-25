# 3conv

Browser-based media converter using FFmpeg.wasm and natural language commands.

## What it does

Upload a video, audio, or image file. Describe what you want to do in plain English. The app generates the FFmpeg command and runs it in your browser.

## Setup

Install dependencies:
```bash
npm install
```

Run locally:
```bash
npm run dev
```

Open http://localhost:3000

Add your OpenRouter API key in settings (or set `OPENROUTER_API_KEY` in `.env.local` for server-side free credits).

## Tech

- Next.js 16 + React 19
- FFmpeg.wasm for client-side media processing
- OpenRouter API for natural language → FFmpeg translation
- Framer Motion for animations
