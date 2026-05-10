import { useEffect, useState } from "react";
import { ingestText, ingestUpload, ingestYoutube } from "./api/ingest.js";
import { archiveJob, deleteJob } from "./api/job.js";
import { ragQuery } from "./api/rag.js";
import { listSessions } from "./api/sessions.js";
import { ChatView } from "./components/ChatView.jsx";
import { CitationPopover } from "./components/CitationPopover.jsx";
import { Icon } from "./components/Icon.jsx";
import { InputView } from "./components/InputView.jsx";
import { ProcessingView } from "./components/ProcessingView.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { useJobPolling } from "./hooks/useJobPolling.js";
import { useTweaks } from "./hooks/useTweaks.js";
import { adaptCitation, tokenizeWithCitations } from "./lib/citations.js";
import { updateHistory } from "./lib/conversation.js";
import { capitalize } from "./lib/format.js";
import { humanizeError } from "./lib/humanizeError.js";

const TWEAK_DEFAULTS = { theme: "scholar" };
const THEME_CLASSES = ["theme-scholar", "theme-studio", "theme-focus"];

const nowISO = () => new Date().toISOString();

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState("empty"); // "empty" | "input" | "processing" | "chat"
  const [pendingJob, setPendingJob] = useState(null);
  const [messagesBySession, setMessagesBySession] = useState({});
  const [historyBySession, setHistoryBySession] = useState({});
  const [thinkingFor, setThinkingFor] = useState(null);
  const [openCitation, setOpenCitation] = useState(null);
  const [toast, setToast] = useState(null);

  const activeSession = sessions.find((s) => s.job_id === activeId) || null;
  const messages = messagesBySession[activeId] || [];

  // Apply theme class on document.body so CSS variables cascade through `body`
  // (which sets background + color), not just the in-tree wrapper.
  useEffect(() => {
    const next = `theme-${t.theme || "scholar"}`;
    THEME_CLASSES.forEach((c) => document.body.classList.remove(c));
    document.body.classList.add(next);
  }, [t.theme]);

  const notify = (kind, message) => setToast({ kind, message });

  // Toast auto-dismiss after 4s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // Bootstrap: load sessions. Seed `last_activity_at` from `created_at`.
  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then(({ sessions: rows }) => {
        if (cancelled) return;
        setSessions(
          (rows || []).map((r) => ({
            ...r,
            last_activity_at: r.last_activity_at || r.created_at,
          })),
        );
      })
      .catch(() => !cancelled && notify("error", "Couldn't load your sessions."));
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the in-flight job (single concurrent ingest assumed in V1).
  useJobPolling(pendingJob?.job_id, {
    onProgress: (job) => setPendingJob((prev) => (prev ? { ...prev, ...job } : prev)),
    onReady: (job) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.job_id === job.job_id ? { ...s, ...job, last_activity_at: nowISO() } : s,
        ),
      );
      setPendingJob(null);
      setActiveId(job.job_id);
      setView("chat");
    },
    onFailed: (job) => {
      setSessions((prev) => prev.map((s) => (s.job_id === job.job_id ? { ...s, ...job } : s)));
      setPendingJob((prev) => (prev ? { ...prev, ...job } : prev));
    },
  });

  const handleNew = () => {
    setView("input");
    setActiveId(null);
  };

  const handleSelect = (id) => {
    const s = sessions.find((x) => x.job_id === id);
    if (!s) return;
    setActiveId(id);
    if (s.status === "ready") {
      setPendingJob(null);
      setView("chat");
    } else {
      setPendingJob(s);
      setView("processing");
    }
  };

  const handleSubmitInput = async ({ source, payload, title }) => {
    let res;
    try {
      if (source === "youtube") res = await ingestYoutube(payload.url);
      else if (source === "upload") res = await ingestUpload(payload.file);
      else res = await ingestText(payload.text);
    } catch (e) {
      notify("error", humanizeError(e));
      return;
    }
    const created = nowISO();
    const newSession = {
      job_id: res.job_id,
      title,
      source_type: source,
      status: "pending",
      archived: false,
      created_at: created,
      last_activity_at: created,
    };
    setSessions((prev) => [newSession, ...prev]);
    setMessagesBySession((m) => ({ ...m, [res.job_id]: [] }));
    setHistoryBySession((h) => ({
      ...h,
      [res.job_id]: { conversation_summary: null, recent_turns: [] },
    }));
    setActiveId(res.job_id);
    setPendingJob(newSession);
    setView("processing");
  };

  const handleAbandonFailure = () => {
    if (!pendingJob) {
      setView("input");
      return;
    }
    // Best-effort BE cleanup; UI moves on regardless.
    deleteJob(pendingJob.job_id).catch(() => {});
    pruneLocalSession(pendingJob.job_id);
    setPendingJob(null);
    setView("input");
  };

  const pruneLocalSession = (id) => {
    setSessions((prev) => prev.filter((s) => s.job_id !== id));
    setMessagesBySession((m) => {
      const c = { ...m };
      delete c[id];
      return c;
    });
    setHistoryBySession((h) => {
      const c = { ...h };
      delete c[id];
      return c;
    });
    if (activeId === id) {
      setActiveId(null);
      setView("empty");
    }
  };

  const handleArchive = async (sid, next) => {
    // Optimistic update.
    setSessions((prev) => prev.map((s) => (s.job_id === sid ? { ...s, archived: next } : s)));
    try {
      await archiveJob(sid, next);
    } catch (e) {
      // Revert on failure.
      setSessions((prev) => prev.map((s) => (s.job_id === sid ? { ...s, archived: !next } : s)));
      notify("error", humanizeError(e));
    }
  };

  const handleDelete = async (sid) => {
    try {
      await deleteJob(sid);
    } catch (e) {
      notify("error", humanizeError(e));
      return;
    }
    pruneLocalSession(sid);
  };

  const handleSend = async (text) => {
    const sid = activeId;
    if (!sid) return;
    const userMsg = { id: `u_${Date.now()}`, role: "user", text };
    setMessagesBySession((m) => ({ ...m, [sid]: [...(m[sid] || []), userMsg] }));
    setSessions((prev) =>
      prev.map((s) => (s.job_id === sid ? { ...s, last_activity_at: nowISO() } : s)),
    );
    setThinkingFor(sid);

    const turn_count = (messagesBySession[sid] || []).filter((m) => m.role === "user").length;
    const { conversation_summary, recent_turns } = historyBySession[sid] || {
      conversation_summary: null,
      recent_turns: [],
    };

    let res;
    try {
      res = await ragQuery({
        session_id: sid,
        query_text: text,
        turn_count,
        conversation_summary,
        recent_turns,
      });
    } catch (e) {
      setThinkingFor(null);
      notify("error", humanizeError(e));
      if (e?.code === "invalid_session") pruneLocalSession(sid);
      return;
    }

    const adapted = (res.citations || []).map(adaptCitation);
    const asstMsg = {
      id: `a_${Date.now()}`,
      role: "assistant",
      responseText: res.response.text,
      parts: tokenizeWithCitations(res.response.text),
      citations: adapted,
      lang: capitalize(res.response.language),
    };
    setMessagesBySession((m) => ({ ...m, [sid]: [...(m[sid] || []), asstMsg] }));
    setHistoryBySession((h) => updateHistory(h, sid, text, res.response.text, res.conversation_summary));
    setThinkingFor(null);
  };

  const showEmpty = view === "empty" || (view === "chat" && !activeSession);
  const emptyHeadline =
    sessions.length === 0
      ? "Upload a video or paste a transcript to get started"
      : "Pick a session, or start a new one";

  return (
    <>
      <div className="app">
        <Sidebar
          sessions={sessions}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          theme={t.theme}
          onThemeChange={(v) => setTweak("theme", v)}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
        <main className="main">
          <div className="topbar">
            <div className="crumb">
              {view === "input" && <span>New session</span>}
              {view === "processing" && pendingJob && (
                <span>
                  Building knowledge base · <b>{pendingJob.title || ""}</b>
                </span>
              )}
              {view === "chat" && activeSession && (
                <span>
                  <span>Sessions / </span>
                  <b>{activeSession.title}</b>
                </span>
              )}
            </div>
            {view === "chat" && activeSession?.detected_language && (
              <div className="badge-lang">Detected · {capitalize(activeSession.detected_language)}</div>
            )}
          </div>

          {view === "input" && <InputView onSubmit={handleSubmitInput} />}
          {view === "processing" && pendingJob && (
            <ProcessingView session={pendingJob} onAbandon={handleAbandonFailure} />
          )}
          {view === "chat" && activeSession && (
            <ChatView
              session={activeSession}
              messages={messages}
              onSend={handleSend}
              isThinking={thinkingFor === activeId}
              onPickCitation={(c) => setOpenCitation(c)}
              notify={notify}
            />
          )}
          {showEmpty && (
            <div className="center">
              <div className="empty-thread">
                <div className="et-mark">+</div>
                <h3 className="serif">{emptyHeadline}</h3>
                <p>Drop a YouTube link, upload a video, or paste a transcript to get started.</p>
                <button className="btn btn-primary" onClick={handleNew}>
                  New session <Icon.Plus />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {openCitation && <CitationPopover citation={openCitation} onClose={() => setOpenCitation(null)} />}
      {toast && <div className={`toast toast-${toast.kind}`}>{toast.message}</div>}
    </>
  );
}
