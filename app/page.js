"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState("");

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || !file) return;
    console.log("Processing", file.name, "with prompt:", prompt);
  };

  return (
    <div className="app">
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
              placeholder={file ? "What do you want to do?" : "Attach a file to start..."}
              rows={1}
            />
            <button type="submit" className="send-btn" disabled={!prompt.trim() || !file}>
              ↑
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
