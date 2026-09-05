"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { FFmpegEngine } from "../lib/ffmpeg-engine.mjs";
import { SUPPORTED_FORMATS, getFileExtension, getExecutionArgs } from "../lib/conversion.mjs";
import { MODELS, DEFAULT_EFFORT } from "../lib/models.mjs";
import { usePreferences, setPreferences } from "../lib/preferences.mjs";
import { generateClientCommand } from "../lib/generation.mjs";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import CommandDetails from "./components/CommandDetails";

function getFileType(ext) {
  if (SUPPORTED_FORMATS.video.includes(ext)) return "video";
  if (SUPPORTED_FORMATS.audio.includes(ext)) return "audio";
  if (SUPPORTED_FORMATS.image.includes(ext)) return "image";
  return null;
}

function parseFFmpegError(errorMessage, logs) {
  const msg = errorMessage?.toLowerCase() || "";
  const logText = logs.join("\n").toLowerCase();

  if (logText.includes("no font filename") || logText.includes("could not load font")) {
    return "The text-overlay font could not be read. See conversion details below.";
  }
  if (logText.includes("no such file") || logText.includes("does not exist")) {
    return "Input file could not be read. The file may be corrupted.";
  }
  if (
    logText.includes("invalid data found") ||
    logText.includes("invalid input")
  ) {
    return "File format not recognized. The file may be corrupted or in an unsupported format.";
  }
  if (logText.includes("decoder") && logText.includes("not found")) {
    return "This file uses a codec that isn't supported. Try converting to a different format first.";
  }
  if (logText.includes("unknown encoder") || (logText.includes("encoder") && logText.includes("not found"))) {
    return "The requested output format isn't supported. Try a different output format.";
  }
  if (logText.includes("codec not currently supported")) {
    return "This file uses a codec that isn't available in the browser. Try a different file.";
  }
  if (logText.includes("no such filter") || logText.includes("error initializing complex filters")) {
    return "The generated filter isn't supported or is invalid. Try rephrasing the request or choosing another model.";
  }
  if (logText.includes("permission denied")) {
    return "Browser permission error. Try refreshing the page.";
  }
  if (
    logText.includes("out of memory") ||
    logText.includes("memory allocation") || msg.includes("out of memory") || msg.includes("memory access out of bounds")
  ) {
    return "File too large for browser memory. Try a smaller file or compress it first.";
  }
  if (msg.includes("exit code")) {
    return "Conversion failed. See conversion details below for FFmpeg's error.";
  }

  return null;
}

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
};

const slideDown = {
  initial: { opacity: 0, y: -8, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.96 },
};

const spring = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

const smooth = {
  type: "tween",
  ease: [0.33, 1, 0.68, 1],
  duration: 0.25,
};

const EXAMPLE_PROMPTS = [
  "convert to gif",
  "extract the audio as mp3",
  "compress",
  "trim to first 10 seconds",
  "rotate 90 degrees clockwise",
  "convert to grayscale",
  "speed up 2x",
  "crop to square",
  "remove audio",
  "convert to webm",
  "remove 1:45-2:00",
  "combine image and audio into video",
];

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const { model, reasoningEffort, ready: settingsLoaded } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("normal");
  const [errorDetails, setErrorDetails] = useState(null);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState(null);
  const [command, setCommand] = useState(null);
  const [cost, setCost] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderFading, setPlaceholderFading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const engineRef = useRef(null);
  const jobRef = useRef(null);
  const textareaRef = useRef(null);
  const settingsRef = useRef(null);

  useEffect(() => {
    try {
      // Retire keys persisted by older versions; don't restore them into this session.
      localStorage.removeItem("openrouter_api_key");
    } catch { /* Storage can be unavailable in private/restricted browsing. */ }

    axios
      .get("/api/status", { timeout: 10000 })
      .then((res) => setHasServerKey(res.data.hasServerKey))
      .catch(() => setHasServerKey(false));
  }, []);

  useEffect(() => {
    const engine = new FFmpegEngine({ onProgress: setProgress });
    engineRef.current = engine;
    return () => {
      jobRef.current?.abort();
      engine.reset();
    };
  }, []);

  useEffect(() => {
    // Warm up while the user types, without blocking the UI on the WASM download.
    if (files.length) engineRef.current.load().catch(() => {});
  }, [files.length]);

  useEffect(() => {
    return () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); };
  }, [downloadUrl]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [settingsOpen]);

  useEffect(() => {
    let timeout;
    const interval = setInterval(() => {
      setPlaceholderFading(true);

      timeout = setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
        setPlaceholderFading(false);
      }, 500);
    }, 3000);

    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    const handlePaste = (e) => {
      if (jobRef.current) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault();

          const pastedFile = item.getAsFile();
          if (!pastedFile) continue;

          const ext = pastedFile.type.split('/')[1];
          const timestamp = Date.now();
          const renamedFile = new File(
            [pastedFile],
            `pasted-image-${timestamp}.${ext}`,
            { type: pastedFile.type }
          );

          console.log('[Clipboard] Pasted image:', renamedFile.name, renamedFile.size, 'bytes');

          if (!SUPPORTED_FORMATS.image.includes(ext)) {
            setStatus(`Unsupported image format: ${ext}`);
            setStatusType('error');
            return;
          }

          setFiles((prev) => [...prev, renamedFile]);
          setDownloadUrl(null);
          setDownloadName(null);
          setCommand(null);
          setCost(null);
          setStatus(null);

          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isProcessing]);

  useEffect(() => {
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isProcessing && !isDragging) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === document.body || e.target === document.documentElement) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (jobRef.current) return;

      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      if (droppedFiles.length === 0) return;

      const validFiles = [];
      for (const droppedFile of droppedFiles) {
        console.log('[DragDrop] Dropped file:', droppedFile.name, droppedFile.size, 'bytes');

        const ext = getFileExtension(droppedFile.name);
        const fileType = getFileType(ext);

        if (!fileType) {
          setStatus(
            `Unsupported format: .${ext}. Try ${SUPPORTED_FORMATS.video.slice(0, 3).join(", ")} for video, ${SUPPORTED_FORMATS.audio.slice(0, 3).join(", ")} for audio, or ${SUPPORTED_FORMATS.image.slice(0, 3).join(", ")} for images.`,
          );
          setStatusType('error');
          return;
        }

        validFiles.push(droppedFile);
      }

      if (validFiles.length > 0) {
        setFiles((prev) => [...prev, ...validFiles]);
        setDownloadUrl(null);
        setDownloadName(null);
        setCommand(null);
        setCost(null);
        setStatus(null);
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [isProcessing, isDragging]);

  const generateCommand = async (userPrompt, filenames, signal) => {
    const data = await generateClientCommand({
      prompt: userPrompt,
      filenames,
      model,
      reasoningEffort,
    }, { apiKey, signal });
    if (typeof data.cost === "number" && Number.isFinite(data.cost)) setCost(data.cost);
    return data.command;
  };

  const processFiles = async (jobFiles, commandObj) => {
    try {
      const data = await engineRef.current.run(jobFiles, commandObj);
      return new Blob([data], { type: getMimeType(commandObj.outputExt) });
    } catch (error) {
      const message = error?.message || String(error);
      const logs = engineRef.current.logs;
      setErrorDetails(logs.length ? logs.join("\n").slice(-8000) : message);
      throw new Error(parseFFmpegError(message, logs) || message);
    }
  };

  const getMimeType = (ext) => {
    const mimeTypes = {
      mp4: "video/mp4",
      webm: "video/webm",
      avi: "video/avi",
      mov: "video/quicktime",
      mkv: "video/x-matroska",
      gif: "image/gif",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      flac: "audio/flac",
      aac: "audio/aac",
      m4a: "audio/mp4",
      opus: "audio/ogg",
      webp: "image/webp",
      bmp: "image/bmp",
      tiff: "image/tiff",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    return mimeTypes[ext] || "application/octet-stream";
  };

  const getOutputFilename = (inputFilename, outputExt, suffix) => {
    const baseName = inputFilename.replace(/\.[^/.]+$/, "");
    const inputExt = getFileExtension(inputFilename);
    const descriptor = suffix || (inputExt === outputExt ? "converted" : null);

    if (descriptor) {
      return `${baseName}_${descriptor}.${outputExt}`;
    }
    return `${baseName}.${outputExt}`;
  };

  const canSubmit = !!apiKey.trim() || hasServerKey === true;
  const isCheckingKey = !settingsLoaded || (hasServerKey === null && !apiKey.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || files.length === 0 || !canSubmit || jobRef.current) return;
    if (files.length > 20 || files.some((file) => file.size === 0)) {
      setStatus("Select 1–20 non-empty media files.");
      setStatusType("error");
      return;
    }
    const controller = new AbortController();
    jobRef.current = controller;
    const jobFiles = [...files];

    setProgress(0);
    setErrorDetails(null);
    setIsProcessing(true);
    setDownloadUrl(null);
    setDownloadName(null);
    setCommand(null);
    setCost(null);

    try {
      setStatus("Preparing engine and generating command...");
      setStatusType("pulse");
      const [commandObj] = await Promise.all([
        generateCommand(prompt, jobFiles.map((file) => file.name), controller.signal),
        engineRef.current.load(),
      ]);
      controller.signal.throwIfAborted();
      setCommand(`ffmpeg ${getExecutionArgs(commandObj.args).join(" ")}`);
      setStatus(jobFiles.length > 1 ? "Processing files..." : "Processing file...");
      const outputBlob = await processFiles(jobFiles, commandObj);
      controller.signal.throwIfAborted();
      setDownloadUrl(URL.createObjectURL(outputBlob));
      setDownloadName(getOutputFilename(jobFiles[0].name, commandObj.outputExt, commandObj.suffix));
      setProgress(100);
      setStatus("Done!");
      setStatusType("success");
    } catch (error) {
      const wasCancelled = controller.signal.aborted;
      controller.abort();
      engineRef.current.reset();
      setStatus(wasCancelled ? "Cancelled." : `Error: ${error?.message || String(error)}`);
      setStatusType(wasCancelled ? "normal" : "error");
    } finally {
      jobRef.current = null;
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const cancelConversion = () => {
    jobRef.current?.abort();
    engineRef.current.reset();
  };

  const handleFileChange = (e) => {
    if (jobRef.current) return;
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const validFiles = [];
    for (const selectedFile of selectedFiles) {
      console.log(
        "[File] Selected:",
        selectedFile.name,
        selectedFile.size,
        "bytes",
        selectedFile.type,
      );

      const ext = getFileExtension(selectedFile.name);
      const fileType = getFileType(ext);

      if (!fileType) {
        setStatus(
          `Unsupported format: .${ext}. Try ${SUPPORTED_FORMATS.video.slice(0, 3).join(", ")} for video, ${SUPPORTED_FORMATS.audio.slice(0, 3).join(", ")} for audio, or ${SUPPORTED_FORMATS.image.slice(0, 3).join(", ")} for images.`,
        );
        setStatusType("error");
        e.target.value = "";
        return;
      }

      validFiles.push(selectedFile);
    }

    setFiles((prev) => [...prev, ...validFiles]);
    setDownloadUrl(null);
    setDownloadName(null);
    setCommand(null);
    setCost(null);
    setStatus(null);
    e.target.value = "";
  };

  const removeFile = (index) => {
    if (jobRef.current) return;
    setFiles(files.filter((_, i) => i !== index));
    setDownloadUrl(null);
    setDownloadName(null);
    setCommand(null);
    setCost(null);
    setStatus(null);
  };

  const handleTextareaChange = (e) => {
    setPrompt(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim() && files.length > 0 && canSubmit && !jobRef.current) {
        handleSubmit(e);
      }
    }
  };

  return (
    <div className="app">
      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="drag-overlay-content">
              <div className="drag-icon">📁</div>
              <div className="drag-text">Drop files here</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.header
        className="header"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <div className="settings" ref={settingsRef}>
          <motion.button
            className="settings-btn"
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            aria-controls="settings-dropdown"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            ⚙
          </motion.button>
          <AnimatePresence>
            {settingsOpen && (
              <>
                <motion.div
                  className="settings-overlay"
                  aria-hidden="true"
                  onClick={() => setSettingsOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
                <motion.form
                  id="settings-dropdown"
                  className="settings-dropdown"
                  aria-label="Settings"
                  onSubmit={(e) => e.preventDefault()}
                  autoComplete="off"
                  variants={slideDown}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={spring}
                >
                  <div className="settings-label-row">
                    <label htmlFor="api-key-input">OpenRouter key</label>
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Create a separate key with a spending limit"
                    >Get key ↗</a>
                  </div>
                  <input
                    id="api-key-input"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasServerKey ? "Optional — free credits available" : "sk-or-..."}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-describedby="key-privacy-note"
                  />
                  <small id="key-privacy-note">Not saved. Sent only to OpenRouter.</small>

                  <label htmlFor="model-select" style={{ marginTop: "1rem" }}>
                    Model
                  </label>
                  <select
                    id="model-select"
                    value={model}
                    onChange={(e) => {
                      const selected = MODELS.find((entry) => entry.id === e.target.value);
                      setPreferences({
                        model: selected.id,
                        reasoningEffort: selected.efforts.includes(reasoningEffort) ? reasoningEffort : DEFAULT_EFFORT,
                      });
                    }}
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · ${m.outputPrice}/M out
                      </option>
                    ))}
                  </select>

                  <label htmlFor="reasoning-effort" style={{ marginTop: "1rem" }}>Reasoning</label>
                  <select
                    id="reasoning-effort"
                    value={reasoningEffort}
                    onChange={(e) => setPreferences({ model, reasoningEffort: e.target.value })}
                  >
                    {MODELS.find((entry) => entry.id === model).efforts.map((effort) => (
                      <option key={effort} value={effort}>
                        {{ low: "Low", medium: "Medium", high: "High" }[effort]}
                      </option>
                    ))}
                  </select>
                </motion.form>
              </>
            )}
          </AnimatePresence>
        </div>
      </motion.header>

      <LayoutGroup>
        <div className="main-content">
          <motion.div
            className="title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          >
            <h1>3conv</h1>
            <p>Convert media with natural language</p>
            <AnimatePresence>
              {hasServerKey && !apiKey && (
                <motion.p
                  className="credits-note"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={smooth}
                >
                  Free credits available
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div className="status-area">
            {isProcessing && (
              <button type="button" className="cancel-btn" onClick={cancelConversion}>Cancel conversion</button>
            )}
            <AnimatePresence mode="wait">
              {status && (
                <motion.div
                  key={status}
                  className={`status ${statusType === "pulse" ? "pulse" : ""} ${statusType}`}
                  variants={fadeInUp}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={smooth}
                  layout
                >
                  {status}
                </motion.div>
              )}
            </AnimatePresence>

            {status && statusType === "error" && errorDetails && (
              <details className="error-details">
                <summary>Conversion details</summary>
                <pre>{errorDetails}</pre>
              </details>
            )}

            <AnimatePresence>
              {isProcessing && progress > 0 && (
                <motion.div
                  className="progress-bar"
                  initial={{ opacity: 0, scaleX: 0.8 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0.8 }}
                  transition={smooth}
                  layout
                >
                  <motion.div
                    className="progress-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {command && (
                <motion.div
                  key={command}
                  className="command-presence"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={smooth}
                >
                  <CommandDetails command={command} cost={cost} />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {downloadUrl && (
                <motion.div
                  className="result-area"
                  variants={scaleIn}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ...spring, staggerChildren: 0.1 }}
                  layout="position"
                >
                  <motion.div
                    className="preview-container"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, ...smooth }}
                  >
                    {downloadName?.match(/\.(mp4|webm|mov|avi|mkv)$/i) ? (
                      <video src={downloadUrl} className="preview" controls />
                    ) : downloadName?.match(/\.(gif|png|jpg|jpeg|webp)$/i) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Local blob preview: no server optimization or upload.
                      <img
                        src={downloadUrl}
                        className="preview"
                        alt="Output preview"
                      />
                    ) : downloadName?.match(/\.(mp3|wav|ogg|aac|m4a|flac|opus)$/i) ? (
                      <audio src={downloadUrl} controls />
                    ) : null}
                  </motion.div>
                  <motion.a
                    href={downloadUrl}
                    download={downloadName}
                    className="download-link"
                    title={downloadName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, ...smooth }}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    ⬇ <span>Download {downloadName}</span>
                  </motion.a>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.form
            className="input-area"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
            layout="position"
          >
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div
                  className="file-chips-container"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring}
                  layout
                >
                  {files.map((file, index) => (
                    <motion.div
                      key={`${file.name}-${index}`}
                      className="file-chip"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={spring}
                      layout
                    >
                      <span>{file.name}</span>
                      <motion.button
                        type="button"
                        onClick={() => removeFile(index)}
                        disabled={isProcessing}
                        aria-label={`Remove ${file.name}`}
                        whileHover={{
                          scale: 1.1,
                          backgroundColor: "rgba(0,0,0,0.1)",
                        }}
                        whileTap={{ scale: 0.9 }}
                      >
                        ×
                      </motion.button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div className="input-row" layout>
              <label
                className={`upload-label${isProcessing ? " disabled" : ""}`}
                aria-label="Attach files"
                title="Attach files (Cmd/Ctrl+click for multiple)"
              >
                📎
                <input
                  type="file"
                  accept="video/*,audio/*,image/*"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                  multiple
                />
              </label>
              <textarea
                ref={textareaRef}
                className={placeholderFading ? "placeholder-fade" : ""}
                value={prompt}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  isCheckingKey
                    ? "Loading..."
                    : !canSubmit
                      ? "Add your API key in settings..."
                      : EXAMPLE_PROMPTS[placeholderIndex]
                }
                rows={1}
                maxLength={4000}
                disabled={isCheckingKey || !canSubmit || isProcessing}
                aria-label="Conversion instruction"
              />
              <motion.button
                type="submit"
                className="send-btn"
                disabled={
                  isCheckingKey ||
                  !prompt.trim() ||
                  files.length === 0 ||
                  !canSubmit ||
                  isProcessing
                }
                aria-label={isProcessing ? "Processing" : "Submit"}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isProcessing ? <div className="spinner" /> : "↑"}
              </motion.button>
            </motion.div>
          </motion.form>
        </div>
      </LayoutGroup>
    </div>
  );
}
