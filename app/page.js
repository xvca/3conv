"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import "./globals.css";

const MODELS = [
  { id: "x-ai/grok-code-fast-1", name: "xAI: Grok Code Fast 1" },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek v3.2" },
  { id: "z-ai/glm-4.7-flash", name: "Z.AI: GLM 4.7 Flash" },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "google/gemini-3-flash-preview", name: "Gemeni 3 Flash Preview" },
];

const SUPPORTED_FORMATS = {
  video: [
    "mp4",
    "webm",
    "avi",
    "mov",
    "mkv",
    "flv",
    "wmv",
    "m4v",
    "mpeg",
    "mpg",
    "3gp",
    "ogv",
  ],
  audio: ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus"],
  image: ["gif", "png", "jpg", "jpeg", "webp", "bmp", "tiff"],
};

const ALL_SUPPORTED = [
  ...SUPPORTED_FORMATS.video,
  ...SUPPORTED_FORMATS.audio,
  ...SUPPORTED_FORMATS.image,
];

function getFileType(ext) {
  if (SUPPORTED_FORMATS.video.includes(ext)) return "video";
  if (SUPPORTED_FORMATS.audio.includes(ext)) return "audio";
  if (SUPPORTED_FORMATS.image.includes(ext)) return "image";
  return null;
}

function parseFFmpegError(errorMessage, logs) {
  const msg = errorMessage?.toLowerCase() || "";
  const logText = logs.join("\n").toLowerCase();

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
  if (logText.includes("encoder") && logText.includes("not found")) {
    return "The requested output format isn't supported. Try a different output format.";
  }
  if (logText.includes("codec not currently supported")) {
    return "This file uses a codec that isn't available in the browser. Try a different file.";
  }
  if (logText.includes("permission denied")) {
    return "Browser permission error. Try refreshing the page.";
  }
  if (
    logText.includes("out of memory") ||
    logText.includes("memory allocation")
  ) {
    return "File too large for browser memory. Try a smaller file or compress it first.";
  }
  if (msg.includes("exit code")) {
    return "Conversion failed. The file may be corrupted or use an unsupported codec.";
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

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("normal");
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState(null);
  const [command, setCommand] = useState(null);
  const [cost, setCost] = useState(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(null);

  const ffmpegRef = useRef(null);
  const ffmpegLogsRef = useRef([]);
  const textareaRef = useRef(null);
  const settingsRef = useRef(null);

  useEffect(() => {
    const savedKey = localStorage.getItem("openrouter_api_key") || "";
    const savedModel = localStorage.getItem("openrouter_model") || MODELS[0].id;
    setApiKey(savedKey);
    setModel(savedModel);

    axios
      .get("/api/status")
      .then((res) => setHasServerKey(res.data.hasServerKey))
      .catch(() => setHasServerKey(false));
  }, []);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("openrouter_api_key", apiKey);
    }
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("openrouter_model", model);
  }, [model]);

  useEffect(() => {
    loadFFmpeg();
  }, []);

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

  const loadFFmpeg = async () => {
    try {
      console.log("[FFmpeg] Loading...");

      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on("log", ({ message }) => {
        console.log("[FFmpeg]", message);
        ffmpegLogsRef.current.push(message);
        if (ffmpegLogsRef.current.length > 100) {
          ffmpegLogsRef.current.shift();
        }
      });

      ffmpeg.on("progress", ({ progress, time }) => {
        console.log("[FFmpeg Progress]", { progress, time });
        setProgress(Math.round(progress * 100));
      });

      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
      const coreURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        "text/javascript",
      );
      const wasmURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm",
      );

      await ffmpeg.load({ coreURL, wasmURL });
      console.log("[FFmpeg] Loaded successfully");
      setFfmpegLoaded(true);
    } catch (err) {
      console.error("[FFmpeg] Failed to load:", err);
      setStatus("Failed to load FFmpeg");
      setStatusType("error");
    }
  };

  const getFileExtension = (filename) => {
    return filename.split(".").pop().toLowerCase();
  };

  const generateCommand = async (userPrompt, filename) => {
    console.log("[API] Generating command for:", {
      userPrompt,
      filename,
      model,
    });

    try {
      const { data } = await axios.post("/api/generate", {
        prompt: userPrompt,
        filename,
        model,
        apiKey: apiKey || undefined,
      });

      console.log("[API] Response:", data);

      if (data.cost !== undefined) {
        setCost(data.cost);
      }

      return data.command;
    } catch (err) {
      const message = err.response?.data?.error || "Failed to generate command";
      console.log({ error: err.response?.data, status: err.response?.status });
      throw new Error(message);
    }
  };

  const processFile = async (commandObj) => {
    const { fetchFile } = await import("@ffmpeg/util");

    ffmpegLogsRef.current = [];

    const ffmpeg = ffmpegRef.current;
    const inputExt = getFileExtension(file.name);
    const inputName = `input.${inputExt}`;
    const outputName = `output.${commandObj.outputExt}`;

    if (!ALL_SUPPORTED.includes(inputExt)) {
      throw new Error(
        `Unsupported file format: .${inputExt}. Supported formats: ${ALL_SUPPORTED.join(", ")}`,
      );
    }

    console.log("[Process] Input file:", inputName);
    console.log("[Process] Output file:", outputName);
    console.log("[Process] Command args:", commandObj.args);

    const fileData = await fetchFile(file);
    console.log("[Process] Input file size:", fileData.byteLength, "bytes");

    if (fileData.byteLength === 0) {
      throw new Error("File is empty. Please select a valid file.");
    }

    await ffmpeg.writeFile(inputName, fileData);

    const filesBefore = await ffmpeg.listDir("/");
    console.log("[Process] Files before exec:", filesBefore);

    const args = commandObj.args.map((arg) => {
      if (arg.match(/input\.[a-zA-Z0-9]+/)) {
        return arg.replace(/input\.[a-zA-Z0-9]+/, inputName);
      }
      return arg;
    });
    console.log("[Process] Final args:", args);

    console.log("[Process] Executing FFmpeg...");
    try {
      await ffmpeg.exec(args);
      console.log("[Process] FFmpeg exec completed");
    } catch (err) {
      console.error("[Process] FFmpeg exec error:", err);
      const friendlyError = parseFFmpegError(
        err.message,
        ffmpegLogsRef.current,
      );
      throw new Error(
        friendlyError || "Conversion failed. Check console for details.",
      );
    }

    const filesAfter = await ffmpeg.listDir("/");
    console.log("[Process] Files after exec:", filesAfter);

    console.log("[Process] Reading output file:", outputName);
    let data;
    try {
      data = await ffmpeg.readFile(outputName);
      console.log(
        "[Process] Output data type:",
        typeof data,
        data.constructor.name,
      );
      console.log(
        "[Process] Output data length:",
        data.length || data.byteLength,
        "bytes",
      );
    } catch (err) {
      console.error("[Process] Failed to read output file:", err);
      const friendlyError = parseFFmpegError(
        err.message,
        ffmpegLogsRef.current,
      );
      throw new Error(
        friendlyError ||
          "Conversion produced no output. The file may use an unsupported codec.",
      );
    }

    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
      console.log("[Process] Cleanup complete");
    } catch (err) {
      console.warn("[Process] Cleanup warning:", err);
    }

    const blob = new Blob([data], { type: getMimeType(commandObj.outputExt) });
    console.log("[Process] Blob size:", blob.size, "bytes");

    return blob;
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

  const canSubmit = apiKey || hasServerKey === true;
  const isCheckingKey = hasServerKey === null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || !file || !canSubmit || isProcessing) return;

    setIsProcessing(true);
    setDownloadUrl(null);
    setDownloadName(null);
    setCommand(null);
    setCost(null);
    setProgress(0);

    try {
      setStatus("Generating command...");
      setStatusType("pulse");

      const commandObj = await generateCommand(prompt, file.name);
      setCommand(`ffmpeg ${commandObj.args.join(" ")}`);

      setStatus("Processing file...");
      const outputBlob = await processFile(commandObj);

      if (outputBlob.size === 0) {
        throw new Error("Output file is empty - FFmpeg may have failed");
      }

      const outputUrl = URL.createObjectURL(outputBlob);
      setDownloadUrl(outputUrl);
      setDownloadName(
        getOutputFilename(file.name, commandObj.outputExt, commandObj.suffix),
      );
      setStatus("Done!");
      setStatusType("success");
    } catch (error) {
      console.error("[Error]", error);
      setStatus(`Error: ${error.message}`);
      setStatusType("error");
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
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

      setFile(selectedFile);
      setDownloadUrl(null);
      setDownloadName(null);
      setCommand(null);
      setCost(null);
      setStatus(null);
    }
  };

  const removeFile = () => {
    setFile(null);
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
      if (prompt.trim() && file && canSubmit && ffmpegLoaded && !isProcessing) {
        handleSubmit(e);
      }
    }
  };

  if (!ffmpegLoaded) {
    return (
      <div className="app">
        <div className="main-content">
          <motion.div
            className="title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          >
            <h1>3conv</h1>
            <p className="status">
              Loading
              <span className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
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
            aria-haspopup="true"
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
                  className="settings-dropdown"
                  role="menu"
                  onSubmit={(e) => e.preventDefault()}
                  autoComplete="off"
                  variants={slideDown}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={spring}
                >
                  <label htmlFor="api-key-input">OpenRouter API Key</label>
                  <input
                    id="api-key-input"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      hasServerKey ? "(using free credits)" : "sk-or-..."
                    }
                    autoComplete="off"
                  />
                  <small>
                    {hasServerKey
                      ? "Optional. Free credits reset daily."
                      : "Required. Stored locally in browser."}{" "}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Get your own key
                    </a>{" "}
                    for unlimited use.
                  </small>

                  <label htmlFor="model-select" style={{ marginTop: "1rem" }}>
                    Model
                  </label>
                  <select
                    id="model-select"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
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
                  Free credits available daily
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div className="status-area" layout transition={smooth}>
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
                  className="command-area"
                  variants={fadeInUp}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={smooth}
                  layout
                >
                  <div className="command">{command}</div>
                  {cost !== null && (
                    <div className="cost">${cost.toFixed(6)}</div>
                  )}
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
                  layout
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
                      <img
                        src={downloadUrl}
                        className="preview"
                        alt="Output preview"
                      />
                    ) : downloadName?.match(/\.(mp3|wav|ogg|aac)$/i) ? (
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
            layout
          >
            <AnimatePresence>
              {file && (
                <motion.div
                  className="file-chip"
                  initial={{ opacity: 0, scale: 0.8, height: 0 }}
                  animate={{ opacity: 1, scale: 1, height: "auto" }}
                  exit={{ opacity: 0, scale: 0.8, height: 0 }}
                  transition={spring}
                  layout
                >
                  <span>{file.name}</span>
                  <motion.button
                    type="button"
                    onClick={removeFile}
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
              )}
            </AnimatePresence>
            <motion.div className="input-row" layout>
              <label
                className={`upload-label${isProcessing ? " disabled" : ""}`}
                aria-label="Attach file"
              >
                📎
                <input
                  type="file"
                  accept="video/*,audio/*,image/*"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                />
              </label>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  isCheckingKey
                    ? "Loading..."
                    : !canSubmit
                      ? "Add your API key in settings..."
                      : file
                        ? "What do you want to do?"
                        : "Attach a file to start..."
                }
                rows={1}
                disabled={isCheckingKey || !canSubmit || isProcessing}
                aria-label="Conversion instruction"
              />
              <motion.button
                type="submit"
                className="send-btn"
                disabled={
                  isCheckingKey ||
                  !prompt.trim() ||
                  !file ||
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
