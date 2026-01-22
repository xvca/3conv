"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";

const MODELS = [
  { id: "x-ai/grok-code-fast-1", name: "xAI: Grok Code Fast 1" },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek v3.2" },
  { id: "z-ai/glm-4.7-flash", name: "Z.AI: GLM 4.7 Flash" },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "google/gemini-3-flash-preview", name: "Gemeni 3 Flash Preview" },
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

  const ffmpegRef = useRef(null);

  useEffect(() => {
    const savedKey = localStorage.getItem("openrouter_api_key") || "";
    const savedModel = localStorage.getItem("openrouter_model") || MODELS[0].id;
    setApiKey(savedKey);
    setModel(savedModel);
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
    await ffmpeg.writeFile(inputName, fileData);

    const args = commandObj.args.map((arg) =>
      arg.match(/input\.[a-zA-Z0-9]+/)
        ? arg.replace(/input\.[a-zA-Z0-9]+/, inputName)
        : arg
    );

    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(outputName);

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
    };

    const blob = new Blob([data], {
      type: mimeTypes[commandObj.outputExt] || "application/octet-stream"
    });

    return blob;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || !file || !apiKey || isProcessing) return;

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
          <div className="title">
            <h1>3conv</h1>
            <p className="status">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="settings">
          <button
            className="settings-btn"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            ⚙
          </button>
          {settingsOpen && (
            <>
              <div
                className="settings-overlay"
                onClick={() => setSettingsOpen(false)}
              />
              <form
                className="settings-dropdown"
                onSubmit={(e) => e.preventDefault()}
                autoComplete="off"
              >
                <label htmlFor="api-key-input">OpenRouter API Key</label>
                <input
                  id="api-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  autoComplete="off"
                />
                <small>
                  Required. Stored locally in browser.{" "}
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
              </form>
            </>
          )}
        </div>
      </header>

      <div className="main-content">
        <div className="title">
          <h1>3conv</h1>
          <p>Convert media with natural language</p>
        </div>

        {status && (
          <div className={`status ${statusType === "pulse" ? "pulse" : ""} ${statusType}`}>
            {status}
          </div>
        )}

        {downloadUrl && (
          <div className="result-area">
            <a
              href={downloadUrl}
              download={downloadName}
              className="download-link"
            >
              ⬇ Download {downloadName}
            </a>
          </div>
        )}

        <form className="input-area" onSubmit={handleSubmit}>
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
                !apiKey
                  ? "Add your API key in settings..."
                  : file
                    ? "What do you want to do?"
                    : "Attach a file to start..."
              }
              rows={1}
              disabled={!apiKey || isProcessing}
            />
            <button
              type="submit"
              className="send-btn"
              disabled={!prompt.trim() || !file || !apiKey || isProcessing}
            >
              {isProcessing ? "..." : "↑"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
