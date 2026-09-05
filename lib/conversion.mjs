import { prepareOverlayFonts } from "./overlay-font.mjs";

export const SUPPORTED_FORMATS = {
  video: ["mp4", "webm", "avi", "mov", "mkv", "flv", "wmv", "m4v", "mpeg", "mpg", "3gp", "ogv"],
  audio: ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus"],
  image: ["gif", "png", "jpg", "jpeg", "webp", "bmp", "tiff"],
};
export const ALL_SUPPORTED = Object.values(SUPPORTED_FORMATS).flat();
export const getFileExtension = (name) => name.split(".").pop().toLowerCase();

export function getInputNames(filenames) {
  if (!Array.isArray(filenames) || !filenames.length || filenames.length > 20 ||
      filenames.some((name) => typeof name !== "string" || name.length > 255 ||
        !ALL_SUPPORTED.includes(getFileExtension(name)))) {
    throw new Error("Provide 1–20 supported media filenames.");
  }
  return filenames.map((name, index) =>
    `input${filenames.length === 1 ? "" : index}.${getFileExtension(name)}`);
}

export function validateCommand(command, filenames) {
  const inputNames = getInputNames(filenames);
  if (!command || !ALL_SUPPORTED.includes(command.outputExt) ||
      !Array.isArray(command.args) || command.args.length < 3 || command.args.length > 200 ||
      command.args.some((arg) => typeof arg !== "string" || !arg.length || arg.length > 8000 || arg.includes("\0"))) {
    throw new Error("The model returned an invalid conversion command. Try rephrasing your request.");
  }
  const { args, outputExt } = command;
  if (args[0] === "ffmpeg" || args.at(-1) !== `output.${outputExt}`) {
    throw new Error("The model returned an incorrect output filename.");
  }
  let inputs = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-i") {
      if (!inputNames.includes(args[++i])) throw new Error("The command references an unknown input file.");
      inputs++;
    }
  }
  if (!inputs) throw new Error("The command has no input file.");
  return {
    args: [...args],
    outputExt,
    suffix: typeof command.suffix === "string"
      ? command.suffix.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) : "converted",
  };
}

// Automatic thread counts can exhaust the WASM pthread pool (or memory) and
// hang even tiny x264 jobs. Bound decoder, encoder, and filter threads explicitly.
export function getExecutionArgs(args) {
  const bounded = ["-filter_threads", "2", "-filter_complex_threads", "2"];
  for (let i = 0; i < args.length - 1; i++) {
    const arg = args[i];
    if (/^-threads(?::.*)?$/.test(arg) || arg === "-filter_threads" || arg === "-filter_complex_threads") {
      i++;
      continue;
    }
    if (arg === "-i") bounded.push("-threads", "2");
    bounded.push(arg);
  }
  return prepareOverlayFonts([...bounded, "-threads", "2", args.at(-1)]);
}

export function parseCommandResponse(content, filenames) {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The model returned no command. Try a lower reasoning effort or another model.");
  }
  const json = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let command;
  try { command = JSON.parse(json); }
  catch { throw new Error("The model returned invalid JSON. Try another model or rephrase the request."); }
  return validateCommand(command, filenames);
}
