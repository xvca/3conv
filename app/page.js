"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";

const MODELS = [
  { id: "x-ai/grok-code-fast-1", name: "xAI: Grok Code Fast 1" },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek v3.2" },
  { id: "z-ai/glm-4.7-flash", name: "Z.AI: GLM 4.7 Flash" },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "google/gemini-3-flash-preview", name: "Gemeni 3 Flash Preview" },
];

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const slideDown = {
  initial: { opacity: 0, y: -8, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.96 },
};

const smooth = {
  type: "tween",
  ease: [0.33, 1, 0.68, 1],
  duration: 0.25,
};

const spring = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

const SUPPORTED_FORMATS = {
  video: ["mp4", "webm", "avi", "mov", "mkv", "flv", "wmv", "m4v", "mpeg", "mpg", "3gp", "ogv"],
  audio: ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus"],
  image: ["gif", "png", "jpg", "jpeg", "webp", "bmp", "tiff"],
};

const ALL_SUPPORTED = [
  ...SUPPORTED_FORMATS.video,
  ...SUPPORTED_FORMATS.audio,
  ...SUPPORTED_FORMATS.image,
];

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("normal");
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(null);

  const ffmpegRef = useRef(null);

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

  const loadFFmpeg = async () => {
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm");

      await ffmpeg.load({ coreURL, wasmURL });
      setFfmpegLoaded(true);
    } catch (err) {
      setStatus("Failed to load FFmpeg");
      setStatusType("error");
    }
  };

  const generateCommand = async (userPrompt, filename) => {
    try {
      const { data } = await axios.post("/api/generate", {
        prompt: userPrompt,
        filename,
        model,
        apiKey: apiKey || undefined,
      });

      return data.command;
    } catch (err) {
      const message = err.response?.data?.error || "Failed to generate command";
      throw new Error(message);
    }
  };

  const processFile = async (commandObj) => {
    const { fetchFile } = await import("@ffmpeg/util");

    const ffmpeg = ffmpegRef.current;
    const inputExt = file.name.split(".").pop().toLowerCase();
    const inputName = `input.${inputExt}`;
    const outputName = `output.${commandObj.outputExt}`;

    const fileData = await fetchFile(file);

    if (fileData.byteLength === 0) {
      throw new Error("File is empty. Please select a valid file.");
    }

    await ffmpeg.writeFile(inputName, fileData);

    const args = commandObj.args.map((arg) =>
      arg.match(/input\.[a-zA-Z0-9]+/)
        ? arg.replace(/input\.[a-zA-Z0-9]+/, inputName)
        : arg
    );

    try {
      await ffmpeg.exec(args);
    } catch (err) {
      throw new Error("Conversion failed. The file may use an unsupported codec.");
    }

    const data = await ffmpeg.readFile(outputName);

    if (!data || data.length === 0) {
      throw new Error("Conversion produced no output. The file may use an unsupported codec.");
    }

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    const mimeTypes = {
      mp4: "video/mp4",
      webm: "video/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      png: "image/png",
      jpg: "image/jpeg",
      gif: "image/gif",
      ogg: "audio/ogg",
      avi: "video/avi",
      mov: "video/quicktime",
    };

    const blob = new Blob([data], {
      type: mimeTypes[commandObj.outputExt] || "application/octet-stream"
    });

    return blob;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || !file || (!apiKey && !hasServerKey) || isProcessing) return;

    setIsProcessing(true);
    setDownloadUrl(null);
    setDownloadName(null);

    try {
      setStatus("Generating command...");
      setStatusType("pulse");

      const commandObj = await generateCommand(prompt, file.name);

      setStatus("Processing file...");
      const outputBlob = await processFile(commandObj);

      const outputUrl = URL.createObjectURL(outputBlob);
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setDownloadUrl(outputUrl);
      setDownloadName(`${baseName}_${commandObj.suffix}.${commandObj.outputExt}`);
      setStatus("Done!");
      setStatusType("success");
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setStatusType("error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.split(".").pop().toLowerCase();
      if (!ALL_SUPPORTED.includes(ext)) {
        setStatus(`Unsupported format: .${ext}. Try mp4, mp3, gif, or other common formats.`);
        setStatusType("error");
        e.target.value = "";
        return;
      }
      setFile(selectedFile);
      setDownloadUrl(null);
      setDownloadName(null);
      setStatus(null);
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
            <p className="status">Loading...</p>
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
        <div className="settings">
          <motion.button
            className="settings-btn"
            onClick={() => setSettingsOpen(!settingsOpen)}
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
                  onClick={() => setSettingsOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
                <motion.form
                  className="settings-dropdown"
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
                    placeholder={hasServerKey ? "(using free credits)" : "sk-or-..."}
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
            >
              {status}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {downloadUrl && (
            <motion.div
              className="result-area"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={spring}
            >
              <motion.a
                href={downloadUrl}
                download={downloadName}
                className="download-link"
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
              >
                ⬇ Download {downloadName}
              </motion.a>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.form
          className="input-area"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        >
          <div className="input-row">
            <label className="upload-label">
              📎
              <input
                type="file"
                accept="video/*,audio/*,image/*"
                onChange={handleFileChange}
              />
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                hasServerKey === null
                  ? "Loading..."
                  : !apiKey && !hasServerKey
                    ? "Add your API key in settings..."
                    : file
                      ? "What do you want to do?"
                      : "Attach a file to start..."
              }
              rows={1}
              disabled={hasServerKey === null || (!apiKey && !hasServerKey) || isProcessing}
            />
            <motion.button
              type="submit"
              className="send-btn"
              disabled={
                hasServerKey === null ||
                !prompt.trim() ||
                !file ||
                (!apiKey && !hasServerKey) ||
                isProcessing
              }
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isProcessing ? "..." : "↑"}
            </motion.button>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
