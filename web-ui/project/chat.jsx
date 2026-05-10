/* global React */
const { useState, useRef, useEffect, useMemo } = React;

// ─────────── Chat View ───────────
function ChatView({ session, messages, onSend, isThinking, onPickCitation }) {
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [ttsState, setTtsState] = useState({});
  const taRef = useRef(null);
  const threadRef = useRef(null);

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

  const send = () => {
    const t = draft.trim();
    if (!t || isThinking) return;
    onSend(t);
    setDraft("");
  };

  const toggleRec = () => {
    if (recording) {
      setRecording(false);
      // simulate transcription
      setTimeout(() => {
        setDraft((d) => (d ? d + " " : "") + "Walk me through the determinant trick from the example");
      }, 350);
    } else {
      setRecording(true);
      // auto-stop after 3.5s
      setTimeout(() => {
        setRecording((r) => {
          if (r) {
            setTimeout(() => setDraft((d) => (d ? d + " " : "") + "Walk me through the determinant trick from the example"), 250);
          }
          return false;
        });
      }, 3500);
    }
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <div className="ch-thumb" />
        <div style={{ minWidth: 0 }}>
          <div className="ch-title">{session.title}</div>
          <div className="ch-meta">
            <span>{session.source === "youtube" ? "YouTube" : session.source === "upload" ? "Upload" : "Transcript"}</span>
            {session.durationStr !== "—" && <span style={{ display: "contents" }}><span className="dot" /><span>{session.durationStr}</span></span>}
            <span className="dot" /><span>{session.detectedLanguage}</span>
            <span className="dot" /><span style={{ color: "var(--accent)" }}>● indexed · ready</span>
          </div>
        </div>
        <div className="ch-actions">
          <button className="icon-btn" title="Search transcript"><window.Icon.Search /></button>
        </div>
      </div>

      <div className="thread" ref={threadRef}>
        <div className="thread-inner">
          {messages.length === 0 ? (
            <div className="empty-thread">
              <div className="et-mark">?</div>
              <h3 className="serif">Ask a question about this video</h3>
              <p>Gazelle answers from the transcript only — every answer comes with timestamps you can verify.</p>
              <div className="suggest">
                {session.suggestions.map((q, i) => (
                  <button key={i} onClick={() => onSend(q)}>{q}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <Message key={m.id} message={m} onPickCitation={onPickCitation} ttsState={ttsState} setTtsState={setTtsState} />
            ))
          )}
          {isThinking && (
            <div className="msg assistant">
              <div className="avatar">G</div>
              <div className="bubble"><div className="typing"><span /><span /><span /></div></div>
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
              placeholder={recording ? "Listening…" : "Ask a follow-up — try \"Explain that again, simpler\""}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              disabled={recording}
            />
            <button className={`icon-btn mic-btn ${recording ? 'recording' : ''}`} onClick={toggleRec} title={recording ? "Stop recording" : "Voice query"}>
              <window.Icon.Mic />
            </button>
            <button className="send-btn" onClick={send} disabled={!draft.trim() || isThinking} title="Send">
              <window.Icon.Send />
            </button>
          </div>
          <div className="composer-foot">
            <span>{recording ? <span className="rec-banner"><span className="rec-dot" /> Listening — auto-stops in a moment</span> : <span>Answers are grounded in the transcript. Citations link to timestamps.</span>}</span>
            <span><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for newline</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const Fragment = React.Fragment;

function Message({ message, onPickCitation, ttsState, setTtsState }) {
  if (message.role === "user") {
    return (
      <div className="msg user">
        <div className="avatar">You</div>
        <div className="bubble">{message.text}</div>
      </div>
    );
  }
  return (
    <div className="msg assistant">
      <div className="avatar">G</div>
      <div className="bubble">
        <window.RichText parts={message.parts} onCite={(id) => onPickCitation(message.citations.find(c => c.id === id))} />
        <div className="msg-foot">
          <span className="lang-chip">{message.lang}</span>
          <window.TTSButton messageId={message.id} ttsState={ttsState} setTtsState={setTtsState} />
          <button className="tts-btn" title="Copy"><window.Icon.Copy /> Copy</button>
        </div>
      </div>
    </div>
  );
}

window.ChatView = ChatView;
