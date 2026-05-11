import { useEffect, useRef, useState } from "react";
import { transcribeVoice } from "../api/stt.js";
import { humanizeError } from "../lib/humanizeError.js";
import { filenameForMime, startRecording } from "../lib/recorder.js";
import { capitalize, formatSeconds } from "../lib/format.js";
import { extractVideoId, thumbnailUrl } from "../lib/youtube.js";
import { Icon } from "./Icon.jsx";
import { Message } from "./Message.jsx";
import { YouTubeModal } from "./YouTubeModal.jsx";

const SUGGESTIONS = [
  "Give me a one-paragraph summary",
  "What's the most important idea here?",
  "Quiz me on the first half",
];

const SOURCE_LABEL = { youtube: "YouTube", upload: "Upload", transcript: "Transcript" };
const REC_AUTO_STOP_MS = 8000;

export function ChatView({ session, messages, onSend, isThinking, onPickCitation, notify }) {
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [ttsState, setTtsState] = useState({});
  const [videoOpen, setVideoOpen] = useState(false);
  const taRef = useRef(null);
  const threadRef = useRef(null);
  const recRef = useRef(null);
  const autoStopRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length, isThinking]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(150, ta.scrollHeight) + "px";
  }, [draft]);

  // Reset draft when switching sessions.
  useEffect(() => {
    setDraft("");
    setTtsState({});
    setVideoOpen(false);
  }, [session.job_id]);

  const send = () => {
    const t = draft.trim();
    if (!t || isThinking) return;
    onSend(t);
    setDraft("");
  };

  const stopRec = async () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (!recRef.current) {
      setRecording(false);
      return;
    }
    setRecording(false);
    let blob;
    try {
      blob = await recRef.current.stop();
    } catch {
      recRef.current = null;
      notify?.("error", "Couldn't capture audio. Please type your question.");
      return;
    }
    recRef.current = null;
    if (!blob || blob.size === 0) {
      notify?.("error", "Couldn't capture audio. Please type your question.");
      return;
    }
    try {
      const { text } = await transcribeVoice(blob, filenameForMime(blob.type));
      if (text && text.trim()) {
        setDraft((d) => (d ? d + " " : "") + text.trim());
      }
    } catch (e) {
      notify?.("error", humanizeError(e));
    }
  };

  const startRec = async () => {
    try {
      recRef.current = await startRecording();
    } catch {
      notify?.("error", "Couldn't capture audio. Please type your question.");
      return;
    }
    setRecording(true);
    autoStopRef.current = setTimeout(() => {
      stopRec();
    }, REC_AUTO_STOP_MS);
  };

  const toggleRec = () => (recording ? stopRec() : startRec());

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (recRef.current) {
        recRef.current.stop().catch(() => {});
        recRef.current = null;
      }
    };
  }, []);

  const sourceLabel = SOURCE_LABEL[session.source_type] || "Source";
  const durationStr = session.duration_seconds ? formatSeconds(session.duration_seconds) : null;
  const langLabel = session.detected_language ? capitalize(session.detected_language) : null;
  const videoId =
    session.source_type === "youtube" ? extractVideoId(session.source) : null;
  const openVideo = () => setVideoOpen(true);

  return (
    <div className="chat">
      <div className="chat-head">
        {videoId ? (
          <button
            type="button"
            className="ch-thumb yt"
            onClick={openVideo}
            title="Watch video"
            aria-label="Watch video"
          >
            <img src={thumbnailUrl(videoId)} alt="" />
            <span className="ch-play" aria-hidden="true">▶</span>
          </button>
        ) : (
          <div className="ch-thumb" />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="ch-title">{session.title}</div>
          <div className="ch-meta">
            <span>{sourceLabel}</span>
            {videoId && (
              <span style={{ display: "contents" }}>
                <span className="dot" />
                <button type="button" className="ch-watch-link" onClick={openVideo}>
                  Watch video
                </button>
              </span>
            )}
            {durationStr && (
              <span style={{ display: "contents" }}>
                <span className="dot" />
                <span>{durationStr}</span>
              </span>
            )}
            {langLabel && (
              <span style={{ display: "contents" }}>
                <span className="dot" />
                <span>{langLabel}</span>
              </span>
            )}
            <span className="dot" />
            <span style={{ color: "var(--accent)" }}>● indexed · ready</span>
          </div>
        </div>
        <div className="ch-actions" />
      </div>

      <div className="thread" ref={threadRef}>
        <div className="thread-inner">
          {messages.length === 0 ? (
            <div className="empty-thread">
              <div className="et-mark">?</div>
              <h3 className="serif">Ask a question about this video</h3>
              <p>
                Gazelle answers from the transcript only — every answer comes with timestamps you can verify.
              </p>
              <div className="suggest">
                {SUGGESTIONS.map((q, i) => (
                  <button key={i} onClick={() => onSend(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                onPickCitation={onPickCitation}
                ttsState={ttsState}
                setTtsState={setTtsState}
                notify={notify}
              />
            ))
          )}
          {isThinking && (
            <div className="msg assistant">
              <div className="avatar">G</div>
              <div className="bubble">
                <div className="typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer-inner">
          <div className="composer">
            <textarea
              ref={taRef}
              rows={1}
              placeholder={recording ? "Listening…" : 'Ask a follow-up — try "Explain that again, simpler"'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={recording}
            />
            <button
              className={`icon-btn mic-btn ${recording ? "recording" : ""}`}
              onClick={toggleRec}
              title={recording ? "Stop recording" : "Voice query"}
              aria-pressed={recording}
              aria-label={recording ? "Stop recording" : "Voice query"}
            >
              <Icon.Mic />
            </button>
            <button
              className="send-btn"
              onClick={send}
              disabled={!draft.trim() || isThinking}
              title="Send"
              aria-label="Send"
            >
              <Icon.Send />
            </button>
          </div>
          <div className="composer-foot" aria-live="polite">
            <span>
              {recording ? (
                <span className="rec-banner">
                  <span className="rec-dot" /> Listening — auto-stops in a moment
                </span>
              ) : (
                <span>Answers are grounded in the transcript. Citations link to timestamps.</span>
              )}
            </span>
            <span>
              <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for newline
            </span>
          </div>
        </div>
      </div>

      {videoOpen && videoId && (
        <YouTubeModal videoId={videoId} onClose={() => setVideoOpen(false)} />
      )}
    </div>
  );
}
