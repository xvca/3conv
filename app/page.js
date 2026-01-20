"use client";

import { useState, useEffect } from "react";

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

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || !file || !apiKey) return;
    console.log("Processing", file.name, "with prompt:", prompt, "using model:", model);
  };

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
              disabled={!apiKey}
            />
            <button
              type="submit"
              className="send-btn"
              disabled={!prompt.trim() || !file || !apiKey}
            >
              ↑
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
