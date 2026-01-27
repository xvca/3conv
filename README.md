# 3conv

A web app that converts media files using plain English. Upload a video, audio file, or image, type what you want ("make this a gif", "extract the audio", "compress this"), and it runs the right FFmpeg command.

The conversion happens in browser. The file never leaves your machine.

## How it works

1. You upload a file and describe what you want
2. An LLM figures out the FFmpeg command
3. FFmpeg.wasm runs it client-side
4. You download the result

## Setup

```bash
nvm use 20
npm install
npm run dev
```

You'll need an OpenRouter API key. Either set `OPENROUTER_API_KEY` in `.env.local` or paste your key in the settings menu.

## Tech

- Next.js
- FFmpeg.wasm (runs in browser via WebAssembly)
- OpenRouter for the LLM calls
