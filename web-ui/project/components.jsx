/* global React, ReactDOM */
const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

// ─────────── Icons ───────────
const Icon = {
  Plus: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  YouTube: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8A3 3 0 0 0 2.6 19.9c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z"/></svg>,
  Upload: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Doc: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>,
  Send: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12l14-7-5 7 5 7z"/></svg>,
  ArrowRight: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  Mic: (p) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 11a7 7 0 0 1-14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>,
  Speaker: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>,
  Pause: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" {...p}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>,
  Search: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  Copy: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Sparkle: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6z"/></svg>,
};
window.Icon = Icon;

// ─────────── Sidebar ───────────
function Sidebar({ sessions, activeId, onSelect, onNew, theme }) {
  const today = sessions.filter(s => s.createdAt === "Today");
  const earlier = sessions.filter(s => s.createdAt !== "Today");
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark">
            <img src="assets/gazelle-logo.jpeg" alt="" onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.parentElement.dataset.fallback='1'; }} />
          </div>
          <div>gazelle</div>
        </div>
      </div>
      <button className="btn-new" onClick={onNew}>
        <span className="plus"><Icon.Plus /></span>
        New chat
      </button>
      <div className="session-list">
        {today.length > 0 && <div className="session-section-label">Today</div>}
        {today.map(s => <SessionItem key={s.id} session={s} active={s.id === activeId} onClick={() => onSelect(s.id)} />)}
        {earlier.length > 0 && <div className="session-section-label">Earlier</div>}
        {earlier.map(s => <SessionItem key={s.id} session={s} active={s.id === activeId} onClick={() => onSelect(s.id)} />)}
      </div>
      <div className="sidebar-foot">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
        Local · 5 sessions · {theme === 'focus' ? 'Focus' : theme === 'studio' ? 'Studio' : 'Scholar'} theme
      </div>
    </aside>
  );
}

function SessionItem({ session, active, onClick }) {
  const sourceIcon = session.source === "youtube" ? <Icon.YouTube /> : session.source === "upload" ? <Icon.Upload /> : <Icon.Doc />;
  return (
    <button className={`session-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="si-icon">{sourceIcon}</span>
      <span className="si-title">{session.title}</span>
      <span className="si-date">{session.createdAt === "Today" || session.createdAt === "Yesterday" ? '' : session.createdAt}</span>
    </button>
  );
}

// ─────────── Input view ───────────
function InputView({ onSubmit }) {
  const [mode, setMode] = useState("youtube");
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);

  const validateUrl = (u) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(u.trim());

  const handleSubmit = () => {
    setError("");
    if (mode === "youtube") {
      if (!url.trim()) { setError("Please enter a YouTube link"); return; }
      if (!validateUrl(url)) { setError("Please enter a valid YouTube link"); return; }
      onSubmit({ source: "youtube", url, title: "Linear Algebra: Eigenvalues & Eigenvectors" });
    } else if (mode === "upload") {
      if (!file) { setError("Please choose a video file"); return; }
      onSubmit({ source: "upload", title: file.name.replace(/\.[^.]+$/, "") });
    } else {
      if (transcript.trim().length < 80) { setError("Paste at least a few paragraphs of transcript"); return; }
      onSubmit({ source: "transcript", title: "Pasted Transcript · " + transcript.slice(0, 32).trim() + "…" });
    }
  };

  const handleFile = (f) => {
    if (!f) return;
    const ok = /\.(mp4|mov|avi|mkv)$/i.test(f.name);
    if (!ok) { setError("File format not supported. Use MP4, MOV, AVI, or MKV"); setFile(null); return; }
    if (f.size > 500 * 1024 * 1024) { setError("File exceeds 500 MB limit"); setFile(null); return; }
    setError(""); setFile(f);
  };

  const exampleClick = (kind) => {
    setError("");
    if (kind === "yt") {
      setMode("youtube");
      setUrl("https://www.youtube.com/watch?v=PFDu9oVAE-g");
    } else if (kind === "tr") {
      setMode("transcript");
      setTranscript("Welcome back, everyone. Today we're going to talk about eigenvalues and eigenvectors — probably the single most important idea in linear algebra after the matrix itself. The intuition I want you to leave with is this: when a matrix acts on a vector, most vectors get rotated and stretched. But for any square matrix, there are a few special directions where the matrix only stretches — it doesn't rotate. Those directions are the eigenvectors, and the amount of stretch is the eigenvalue…");
    }
  };

  return (
    <div className="center">
      <div className="center-inner">
        <div className="h-eyebrow">New session</div>
        <h1 className="h-title serif">Drop in a lecture. Ask anything.</h1>
        <p className="h-sub">Gazelle turns any educational video or transcript into a citable, conversational tutor — grounded in exactly what was said.</p>

        <div className="tabs" role="tablist">
          <button className={`tab ${mode === 'youtube' ? 'active' : ''}`} onClick={() => setMode('youtube')}><Icon.YouTube /> YouTube</button>
          <button className={`tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}><Icon.Upload /> Upload</button>
          <button className={`tab ${mode === 'transcript' ? 'active' : ''}`} onClick={() => setMode('transcript')}><Icon.Doc /> Paste transcript</button>
        </div>

        <div className="card">
          {mode === "youtube" && (
            <Fragment>
              <div className="url-row">
                <div className="field">
                  <span className="field-icon"><Icon.YouTube /></span>
                  <input
                    type="url"
                    placeholder="https://youtube.com/watch?v=…"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); if (error) setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
                <button className="btn btn-primary" onClick={handleSubmit}>Go <Icon.ArrowRight /></button>
              </div>
              <div className="helper">Works with youtube lectures, tutorials, and explainers.</div>
            </Fragment>
          )}

          {mode === "upload" && (
            <Fragment>
              <div
                className={`dropzone ${over ? 'over' : ''}`}
                onClick={() => fileRef.current && fileRef.current.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files[0]); }}
              >
                <div className="dz-icon"><Icon.Upload /></div>
                <div className="dz-title">{file ? file.name : "Drop a video here, or click to browse"}</div>
                <div className="dz-sub">{file ? `${(file.size/1024/1024).toFixed(1)} MB · ready to upload` : "Up to 500 MB"}</div>
                <div className="dz-formats"><span>.mp4</span><span>.mov</span><span>.avi</span><span>.mkv</span></div>
                <input ref={fileRef} type="file" accept=".mp4,.mov,.avi,.mkv,video/*" hidden onChange={(e) => handleFile(e.target.files[0])} />
              </div>
              {file && (
                <button className="btn btn-primary" style={{ marginTop: 14, width: "100%", justifyContent: "center" }} onClick={handleSubmit}>
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
                onChange={(e) => { setTranscript(e.target.value); if (error) setError(""); }}
              />
              <div className="ta-foot">
                <span>{transcript.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
                <button className="btn btn-primary btn-sm" onClick={handleSubmit}>Submit transcript <Icon.ArrowRight /></button>
              </div>
            </Fragment>
          )}

          {error && (
            <div className="alert error">
              <span className="alert-icon"><span>!</span></span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="examples">
          <button className="example" onClick={() => exampleClick("yt")}>
            <span className="ex-mark">L</span>
            <span>
              <div className="ex-title">3Blue1Brown — Essence of Linear Algebra</div>
              <div className="ex-meta">YouTube · try a sample lecture</div>
            </span>
          </button>
          <button className="example" onClick={() => exampleClick("tr")}>
            <span className="ex-mark">T</span>
            <span>
              <div className="ex-title">Eigenvalues — Lecture transcript</div>
              <div className="ex-meta">Transcript · paste & try</div>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
window.InputView = InputView;
