import { useState } from "react";
import { YOUTUBE_RE } from "../lib/validators.js";
import { capitalize, formatSeconds } from "../lib/format.js";
import { Icon } from "./Icon.jsx";

const SOURCE_ICON = {
  youtube: <Icon.YouTube />,
  upload: <Icon.Upload />,
  transcript: <Icon.Doc />,
};

const SUGGESTIONS = [
  { icon: <Icon.Sparkle />, label: "What's the single big idea here?" },
  { icon: <Icon.Check />, label: "Quiz me on what was just covered" },
  { icon: <Icon.Restore />, label: "Explain that part again, simpler" },
  { icon: <Icon.Target />, label: "Where did the lecturer prove that?" },
];

function activityISO(s) {
  return s.last_activity_at || s.created_at;
}

function byActivityDesc(a, b) {
  return +new Date(activityISO(b)) - +new Date(activityISO(a));
}

export function Landing({ sessions, onSelect, onYouTubeSubmit, onSwitchToMode }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const recent = sessions
    .filter((s) => s.status === "ready" && !s.archived)
    .sort(byActivityDesc)
    .slice(0, 2);

  const submit = () => {
    const trimmed = url.trim();
    if (!trimmed) return setError("Please enter a YouTube link");
    if (!YOUTUBE_RE.test(trimmed)) return setError("Please enter a valid YouTube link");
    setError("");
    onYouTubeSubmit({ url: trimmed, title: trimmed });
  };

  return (
    <div className="landing-scroll">
      <div className="landing">
        <div className="landing-eyebrow">
          <span className="landing-eyebrow-dot" />
          Ready when you are
        </div>

        <h1 className="landing-title serif">
          What would you like
          <br />
          <span className="landing-title-accent">to learn today?</span>
        </h1>

        <p className="landing-sub">
          Drop a YouTube lecture, upload a video, or paste a transcript — gazelle reads,
          indexes, and answers your questions with timestamps you can verify.
        </p>

        <div className="landing-bar">
          <span className="landing-bar-icon">
            <Icon.YouTube />
          </span>
          <input
            type="url"
            placeholder="Paste a YouTube link to start asking…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button className="landing-bar-btn" onClick={submit}>
            Start <Icon.ArrowRight />
          </button>
        </div>
        {error && <div className="landing-bar-error">{error}</div>}

        <div className="landing-mode-links">
          <span className="landing-mode-or">or</span>
          <button
            type="button"
            className="landing-mode-link"
            onClick={() => onSwitchToMode("upload")}
          >
            <Icon.Upload /> Upload a file
          </button>
          <span className="landing-mode-sep">·</span>
          <button
            type="button"
            className="landing-mode-link"
            onClick={() => onSwitchToMode("transcript")}
          >
            <Icon.Doc /> Paste a transcript
          </button>
        </div>

        <div className="landing-section">
          <div className="landing-section-label">Once it's indexed, try asking</div>
          <div className="landing-suggest-grid">
            {SUGGESTIONS.map((s, i) => (
              <div key={i} className="landing-suggest-card">
                <span className="landing-suggest-icon">{s.icon}</span>
                <span className="landing-suggest-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {recent.length > 0 && (
          <div className="landing-section">
            <div className="landing-section-label">Pick up where you left off</div>
            <div className="landing-recent-row">
              {recent.map((s) => {
                const meta = [
                  formatSeconds(s.duration_seconds || 0) !== "0:00"
                    ? formatSeconds(s.duration_seconds)
                    : null,
                  capitalize(s.detected_language || ""),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={s.job_id}
                    className="landing-recent-card"
                    onClick={() => onSelect(s.job_id)}
                  >
                    <span className="landing-recent-icon">
                      {SOURCE_ICON[s.source_type] || <Icon.Doc />}
                    </span>
                    <span className="landing-recent-body">
                      <span className="landing-recent-title">
                        {s.title || "Untitled session"}
                      </span>
                      {meta && <span className="landing-recent-meta">{meta}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
