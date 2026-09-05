export const OVERLAY_FONT_PATH = "/overlay-font.ttf";
export const OVERLAY_FONT_URL = "/ffmpeg/0.12.10/fonts/dejavu-2.37/DejaVuSans.ttf";

// Split FFmpeg's filter/option syntax without splitting quoted or escaped text.
function splitUnquoted(value, separators) {
  const parts = [];
  let start = 0, quoted = false, escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === "'") { quoted = !quoted; continue; }
    if (!quoted && separators.includes(char)) {
      parts.push(value.slice(start, i), char);
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function withBundledFont(graph) {
  return splitUnquoted(graph, ",;").map((filter) => {
    const match = filter.match(/^(\s*(?:\[[^\]]+\]\s*)*drawtext(?:@[\w-]+)?=)([\s\S]*)$/);
    if (!match) return filter;
    const outputLabels = match[2].match(/\s*(?:\[[^\]]+\]\s*)+$/)?.[0] || "";
    const body = outputLabels ? match[2].slice(0, -outputLabels.length) : match[2];
    const options = splitUnquoted(body, ":").filter((_, index) => index % 2 === 0);
    // Replace hallucinated system font paths as well as supplying missing ones.
    // Don't match a literal "fontfile=" inside quoted text or change that text.
    const withoutFont = options.filter((option) => !/^\s*(?:fontfile|font)=/.test(option));
    return `${match[1]}fontfile=${OVERLAY_FONT_PATH}:${withoutFont.join(":")}${outputLabels}`;
  }).join("");
}

export function prepareOverlayFonts(args) {
  return args.map((arg, index) => {
    const option = args[index - 1];
    return option && /^(?:-vf|-af|-lavfi|-filter_complex|-filter(?::[va](?::\d+)?)?)$/.test(option)
      ? withBundledFont(arg) : arg;
  });
}

export function needsOverlayFont(args) {
  return args.some((arg, index) =>
    /^(?:-vf|-af|-lavfi|-filter_complex|-filter(?::[va](?::\d+)?)?)$/.test(args[index - 1] || "") &&
    arg.includes(`fontfile=${OVERLAY_FONT_PATH}`));
}
