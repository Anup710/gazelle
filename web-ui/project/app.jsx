/* global React, ReactDOM */
const { useState, useEffect, useMemo, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "scholar",
  "density": "regular",
  "showSuggestions": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [sessions, setSessions] = useState(() => window.SAMPLE_SESSIONS);
  const [activeId, setActiveId] = useState("sess_001");
  const [view, setView] = useState("chat"); // "chat" | "input" | "processing"
  const [pendingSession, setPendingSession] = useState(null);
  const [messagesBySession, setMessagesBySession] = useState({
    sess_001: [],
    sess_002: [],
    sess_003: [],
    sess_004: [],
    sess_005: [],
  });
  const [thinkingFor, setThinkingFor] = useState(null);
  const [openCitation, setOpenCitation] = useState(null);
  const [toast, setToast] = useState(null);

  const activeSession = sessions.find(s => s.id === activeId);
  const messages = messagesBySession[activeId] || [];

  const handleNew = () => { setView("input"); setActiveId(null); };
  const handleSelect = (id) => { setActiveId(id); setView("chat"); };

  const handleSubmitInput = ({ source, title }) => {
    const id = "sess_" + Math.random().toString(36).slice(2, 8);
    const newSession = {
      id, title, source,
      durationStr: source === "transcript" ? "—" : "42:18",
      createdAt: "Today",
      detectedLanguage: "English",
      suggestions: [
        "Give me a one-paragraph summary",
        "What's the most important idea here?",
        "Quiz me on the first half",
      ],
    };
    setSessions((prev) => [newSession, ...prev]);
    setMessagesBySession((m) => ({ ...m, [id]: [] }));
    setActiveId(id);
    setPendingSession(newSession);
    setView("processing");
  };

  const handleProcessingDone = () => {
    setView("chat");
    setPendingSession(null);
  };

  const handleSend = (text) => {
    const userMsg = { id: "m" + Date.now(), role: "user", text };
    const sid = activeId;
    setMessagesBySession((m) => ({ ...m, [sid]: [...(m[sid] || []), userMsg] }));
    setThinkingFor(sid);

    setTimeout(() => {
      const existing = messagesBySession[sid] || [];
      const isFollowup = existing.length >= 2;
      const reply = isFollowup ? window.MOCK_REPLIES.followup : window.MOCK_REPLIES.default;
      const asstMsg = {
        id: "m" + Date.now() + "a",
        role: "assistant",
        parts: reply.text,
        citations: reply.citations,
        lang: reply.lang,
      };
      setMessagesBySession((m) => ({ ...m, [sid]: [...(m[sid] || []), asstMsg] }));
      setThinkingFor(null);
    }, 1400);
  };

  const themeClass = `theme-${t.theme || "scholar"}`;

  return (
    <div className={themeClass} style={{ height: "100%" }}>
      <div className="app">
        <Sidebar
          sessions={sessions}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          theme={t.theme}
        />
        <main className="main">
          <div className="topbar">
            <div className="crumb">
              {view === "input" && <span>New session</span>}
              {view === "processing" && <span>Building knowledge base · <b>{pendingSession ? pendingSession.title : ""}</b></span>}
              {view === "chat" && activeSession && <span><span>Sessions / </span><b>{activeSession.title}</b></span>}
            </div>
            {view === "chat" && activeSession && (
              <div className="badge-lang">Detected · {activeSession.detectedLanguage}</div>
            )}
          </div>

          {view === "input" && <InputView onSubmit={handleSubmitInput} />}
          {view === "processing" && pendingSession && (
            <ProcessingView session={pendingSession} onDone={handleProcessingDone} />
          )}
          {view === "chat" && activeSession && (
            <ChatView
              session={activeSession}
              messages={messages}
              onSend={handleSend}
              isThinking={thinkingFor === activeId}
              onPickCitation={(c) => setOpenCitation(c)}
            />
          )}
          {view === "chat" && !activeSession && (
            <div className="center">
              <div className="empty-thread">
                <div className="et-mark">+</div>
                <h3 className="serif">Pick a session, or start a new one</h3>
                <p>Upload a video, paste a transcript, or open one of your existing sessions from the sidebar.</p>
                <button className="btn btn-primary" onClick={handleNew}>New session <Icon.Plus /></button>
              </div>
            </div>
          )}
        </main>
      </div>

      {openCitation && <CitationPopover citation={openCitation} onClose={() => setOpenCitation(null)} />}
      {toast && <div className="toast">{toast}</div>}

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio
          label="Aesthetic"
          value={t.theme}
          options={[
            { value: "scholar", label: "Scholar" },
            { value: "studio", label: "Studio" },
            { value: "focus", label: "Focus" },
          ]}
          onChange={(v) => setTweak("theme", v)}
        />
        <div style={{ fontSize: 10.5, color: "rgba(41,38,27,.55)", lineHeight: 1.45, marginTop: -2 }}>
          {t.theme === "scholar" && "Warm cream paper · serif headlines · forest accent"}
          {t.theme === "studio" && "Crisp neutral · geometric sans · indigo accent"}
          {t.theme === "focus" && "Calm dark · evening study · phosphor green"}
        </div>
        <TweakSection label="Demo" />
        <TweakButton onClick={() => { setView("input"); setActiveId(null); }}>Jump to upload screen</TweakButton>
        <TweakButton onClick={() => {
          const sid = activeId || "sess_001";
          setActiveId(sid);
          setView("chat");
          setMessagesBySession((m) => ({ ...m, [sid]: [] }));
        }}>Reset chat (empty state)</TweakButton>
        <TweakButton onClick={() => {
          const sid = activeId || "sess_001";
          setActiveId(sid);
          setView("chat");
          // pre-load demo conversation
          const demo = [
            { id: "u1", role: "user", text: "Can you explain eigenvalues like I'm new to linear algebra?" },
            { id: "a1", role: "assistant", parts: window.MOCK_REPLIES.default.text, citations: window.MOCK_REPLIES.default.citations, lang: "English" },
          ];
          setMessagesBySession((m) => ({ ...m, [sid]: demo }));
        }}>Load demo conversation</TweakButton>
      </TweaksPanel>
    </div>
  );
}

const Fragment = React.Fragment;

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
