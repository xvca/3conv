import { getInputNames, getExecutionArgs, validateCommand } from "./conversion.mjs";

import { needsOverlayFont, OVERLAY_FONT_PATH, OVERLAY_FONT_URL } from "./overlay-font.mjs";

const cancelled = () => new Error("Conversion cancelled.");

async function fetchOverlayFont(signal) {
  const response = await fetch(OVERLAY_FONT_URL, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    cache: "force-cache",
  });
  if (!response.ok) throw new Error("Could not load the text-overlay font. Please try again.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error("The text-overlay font is empty. Please try again.");
  return bytes;
}

function withTimeout(promise, ms, message, onTimeout) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
      onTimeout();
    }, ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export class FFmpegEngine {
  constructor({ onProgress = () => {}, createFFmpeg, loadFont = fetchOverlayFont, loadTimeout = 60000, runTimeout = 10 * 60 * 1000 } = {}) {
    this.createFFmpeg = createFFmpeg || (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      return new FFmpeg();
    });
    this.onProgress = onProgress;
    this.loadFont = loadFont;
    this.resourceController = null;
    this.loadTimeout = loadTimeout;
    this.runTimeout = runTimeout;
    this.generation = 0;
    this.logs = [];
    this.worker = null;
    this.loading = null;
    this.running = false;
  }

  reset() {
    this.generation++;
    this.resourceController?.abort();
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
  }

  load() {
    if (this.loading) return this.loading;
    if (this.worker?.loaded) return Promise.resolve(this.worker);
    const generation = this.generation;
    const pending = (async () => {
      const worker = await this.createFFmpeg();
      if (generation !== this.generation) {
        worker.terminate();
        throw cancelled();
      }
      this.worker = worker;
      worker.on("log", ({ message }) => {
        this.logs.push(message);
        if (this.logs.length > 100) this.logs.shift();
      });
      let lastUpdate = 0;
      let lastPercent = -1;
      worker.on("progress", ({ progress }) => {
        if (generation !== this.generation || !this.running || !Number.isFinite(progress)) return;
        // FFmpeg progress is approximate for trims/speed changes; reserve 100% for verified output.
        const percent = Math.max(0, Math.min(99, Math.round(progress * 100)));
        const now = Date.now();
        if (percent !== lastPercent && now - lastUpdate >= 100) {
          lastUpdate = now;
          lastPercent = percent;
          this.onProgress(percent);
        }
      });
      const variant = globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined" ? "core-mt" : "core";
      const base = new URL(`/ffmpeg/0.12.10/${variant}/`, globalThis.location?.href || "http://localhost").href;
      await worker.load({
        classWorkerURL: new URL("../wrapper-0.12.15/worker.js", base).href,
        coreURL: `${base}ffmpeg-core.js`,
        wasmURL: `${base}ffmpeg-core.wasm`,
        ...(variant === "core-mt" ? { workerURL: `${base}ffmpeg-core.worker.js` } : {}),
      });
      if (generation !== this.generation) throw cancelled();
      return worker;
    })();
    this.loading = withTimeout(pending, this.loadTimeout,
      "Loading the conversion engine timed out. Check your connection and try again.",
      () => { if (generation === this.generation) this.reset(); })
      .catch((error) => {
        if (generation === this.generation) this.reset();
        throw error;
      });
    return this.loading;
  }

  async run(files, rawCommand) {
    if (this.running) throw new Error("A conversion is already running.");
    const command = validateCommand(rawCommand, files.map((file) => file.name));
    if (files.some((file) => !file.size)) throw new Error("An input file is empty. Select a valid file.");
    this.running = true;
    this.logs = [];
    const generation = this.generation;
    const inputNames = getInputNames(files.map((file) => file.name));
    const outputName = `output.${command.outputExt}`;
    const args = getExecutionArgs(command.args);
    const usesFont = needsOverlayFont(args);
    const resources = new AbortController();
    this.resourceController = resources;
    try {
      const worker = await this.load();
      const checkActive = () => { if (generation !== this.generation) throw cancelled(); };
      const job = (async () => {
        if (usesFont) {
          const font = await this.loadFont(resources.signal);
          checkActive();
          await worker.writeFile(OVERLAY_FONT_PATH, font);
        }
        for (let i = 0; i < files.length; i++) {
          const bytes = new Uint8Array(await files[i].arrayBuffer());
          checkActive();
          await worker.writeFile(inputNames[i], bytes);
        }
        checkActive();
        const exitCode = await worker.exec(args, this.runTimeout);
        if (exitCode !== 0) throw new Error(`FFmpeg failed with exit code ${exitCode}.`);
        checkActive();
        const data = await worker.readFile(outputName);
        if (!data.byteLength) throw new Error("Conversion produced an empty output file.");
        for (const name of [...inputNames, outputName, ...(usesFont ? [OVERLAY_FONT_PATH] : [])]) await worker.deleteFile(name);
        checkActive();
        return data;
      })();
      return await withTimeout(job, this.runTimeout,
        "Conversion timed out after 10 minutes. Try a shorter clip or lower resolution.",
        () => { if (generation === this.generation) this.reset(); });
    } catch (error) {
      // A failed/crashed worker may contain partial files or unusable WASM state.
      // Termination releases both, and the next submission can load a fresh worker.
      if (generation === this.generation) this.reset();
      throw error;
    } finally {
      resources.abort();
      this.resourceController = null;
      this.running = false;
    }
  }
}
