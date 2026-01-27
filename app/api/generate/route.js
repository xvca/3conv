const SYSTEM_PROMPT = `You are an FFmpeg command generator for FFmpeg.wasm (browser-based). Output ONLY FFmpeg arguments as JSON.

Available codecs in FFmpeg.wasm:
- Video encoders: libx264, libx265, libvpx/libvpx-vp9, theora, mpeg1video, mpeg2video
- Audio encoders: libmp3lame, aac, libvorbis, libopus, flac, pcm_*
- Image: gif (with palettegen/paletteuse), libwebp
- Subtitles: libass (srt, ass)

Common filters: scale, crop, trim, setpts, fps, reverse, hflip, vflip, transpose, rotate, colorchannelmixer, eq, hue, volume, atempo, adelay, afade, drawtext

Input file: "input.{ext}"
Output file: "output.{ext}"

Preserve original format unless user asks to convert.

JSON format:
{
  "args": ["-i", "input.ext", ...args..., "output.ext"],
  "outputExt": "ext",
  "suffix": "descriptor"
}

Suffix: short descriptor like grayscale, compressed, trimmed, resized, converted, slow, fast, muted, reversed, rotated

No "ffmpeg" prefix. No explanation. Just valid JSON.`

export async function POST(request) {
  try {
    const { prompt, filename, model, apiKey: userApiKey } = await request.json()

    // Use user's API key if provided, otherwise use server key
    const apiKey = userApiKey || process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      return Response.json(
        { error: 'No API key configured' },
        { status: 401 }
      )
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'x-ai/grok-code-fast-1',
        max_tokens: 500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `File: ${filename}\nRequest: ${prompt}` }
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API] OpenRouter error:', errorText)

      let errorMessage = 'Failed to generate command'
      const usingServerKey = !userApiKey

      try {
        const errorData = JSON.parse(errorText)
        const code = errorData.error?.code

        if (code === 402 || code === 429) {
          if (usingServerKey) {
            errorMessage = 'Daily free credits exhausted. Add your own API key in settings, or try again tomorrow.'
          } else {
            errorMessage = 'API credit limit reached. Check your OpenRouter account.'
          }
        } else if (code === 401) {
          errorMessage = usingServerKey
            ? 'Server API key is invalid. Please add your own key in settings.'
            : 'Invalid API key. Check your key in settings.'
        } else if (errorData.error?.message) {
          errorMessage = errorData.error.message
        }
      } catch {
        // Couldn't parse error, use default message
      }

      return Response.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    const data = await response.json()
    const content = data.choices[0].message.content

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json(
        { error: 'Invalid response format' },
        { status: 500 }
      )
    }

    const parsed = JSON.parse(jsonMatch[0])

    return Response.json({
      command: parsed,
      cost: data.usage?.cost,
    })
  } catch (error) {
    console.error('[API] Error:', error)
    return Response.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
