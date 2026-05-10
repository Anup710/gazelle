import { Fragment, useRef, useState } from "react";
import { YOUTUBE_RE } from "../lib/validators.js";
import { Icon } from "./Icon.jsx";

const VIDEO_EXT_RE = /\.(mp4|mov|avi|mkv)$/i;
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function InputView({ onSubmit, initialMode = "youtube" }) {
  const [mode, setMode] = useState(initialMode);
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);

  const handleSubmit = () => {
    setError("");
    if (mode === "youtube") {
      if (!url.trim()) return setError("Please enter a YouTube link");
      if (!YOUTUBE_RE.test(url.trim())) return setError("Please enter a valid YouTube link");
      onSubmit({
        source: "youtube",
        payload: { url: url.trim() },
        title: url.trim(),
      });
    } else if (mode === "upload") {
      if (!file) return setError("Please choose a video file");
      onSubmit({
        source: "upload",
        payload: { file },
        title: file.name.replace(/\.[^.]+$/, ""),
      });
    } else {
      if (transcript.trim().length < 80) return setError("Paste at least a few paragraphs of transcript");
      onSubmit({
        source: "transcript",
        payload: { text: transcript.trim() },
        title: "Pasted Transcript · " + transcript.slice(0, 32).trim() + "…",
      });
    }
  };

  const handleFile = (f) => {
    if (!f) return;
    if (!VIDEO_EXT_RE.test(f.name)) {
      setError("File format not supported. Use MP4, MOV, AVI, or MKV");
      setFile(null);
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError("File exceeds 500 MB limit");
      setFile(null);
      return;
    }
    setError("");
    setFile(f);
  };

  return (
    <div className="center">
      <div className="center-inner">
        <div className="tabs" role="tablist">
          <button className={`tab ${mode === "youtube" ? "active" : ""}`} onClick={() => setMode("youtube")}>
            <Icon.YouTube /> YouTube
          </button>
          <button className={`tab ${mode === "upload" ? "active" : ""}`} onClick={() => setMode("upload")}>
            <Icon.Upload /> Upload
          </button>
          <button className={`tab ${mode === "transcript" ? "active" : ""}`} onClick={() => setMode("transcript")}>
            <Icon.Doc /> Paste transcript
          </button>
        </div>

        <div className="card">
          {mode === "youtube" && (
            <Fragment>
              <div className="url-row">
                <div className="field">
                  <span className="field-icon">
                    <Icon.YouTube />
                  </span>
                  <input
                    type="url"
                    placeholder="https://youtube.com/watch?v=…"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      if (error) setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
                <button className="btn btn-primary" onClick={handleSubmit}>
                  Go <Icon.ArrowRight />
                </button>
              </div>
              <div className="helper">Works with youtube lectures, tutorials, and explainers.</div>
            </Fragment>
          )}

          {mode === "upload" && (
            <Fragment>
              <div
                className={`dropzone ${over ? "over" : ""}`}
                onClick={() => fileRef.current && fileRef.current.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  handleFile(e.dataTransfer.files[0]);
                }}
              >
                <div className="dz-icon">
                  <Icon.Upload />
                </div>
                <div className="dz-title">{file ? file.name : "Drop a video here, or click to browse"}</div>
                <div className="dz-sub">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ready to upload` : "Up to 500 MB"}</div>
                <div className="dz-formats">
                  <span>.mp4</span>
                  <span>.mov</span>
                  <span>.avi</span>
                  <span>.mkv</span>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".mp4,.mov,.avi,.mkv,video/*"
                  hidden
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>
              {file && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                  onClick={handleSubmit}
                >
                  Upload & build knowledge base <Icon.ArrowRight />
                </button>
              )}
            </Fragment>
          )}

          {mode === "transcript" && (
            <Fragment>
              <textarea
                className="ta"
                placeholder="Paste a transcript here. Plain text — no formatting needed. Speaker labels are fine."
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  if (error) setError("");
                }}
              />
              <div className="ta-foot">
                <span>{transcript.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
                <button className="btn btn-primary btn-sm" onClick={handleSubmit}>
                  Submit transcript <Icon.ArrowRight />
                </button>
              </div>
            </Fragment>
          )}

          {error && (
            <div className="alert error">
              <span className="alert-icon">
                <span>!</span>
              </span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
