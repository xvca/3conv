import { generateWithOpenRouter, GenerationError } from "../../../lib/generation.mjs";

export const maxDuration = 120;

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON request." }, 400); }

  // Personal keys belong only in browser → OpenRouter requests.
  if (body && Object.hasOwn(body, "apiKey")) {
    return json({ error: "Personal API keys must be sent directly to OpenRouter. Refresh the app." }, 400);
  }
  try {
    return json(await generateWithOpenRouter(body, {
      apiKey: process.env.OPENROUTER_API_KEY,
      signal: request.signal,
      usingServerKey: true,
    }));
  } catch (error) {
    if (error instanceof GenerationError) return json({ error: error.message }, error.status);
    return json({ error: "Could not generate a command. Please try again." }, 502);
  }
}
