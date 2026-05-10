/* global React */
const { useState, useEffect, useRef } = React;

// ─────────── Processing view ───────────
function ProcessingView({ session, onDone }) {
  const stages = window.PROCESSING_STAGES;
  const [activeIdx, setActiveIdx] = useState(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const totalMs = 7200;
    const start = performance.now();
    const tick = () => {
      if (cancelled) return;
      const t = (performance.now() - start) / totalMs;
      const p = Math.min(1, t);
      setPct(p);
      const idx = Math.min(stages.length - 1, Math.floor(p * stages.length));
      setActiveIdx(idx);
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(() => !cancelled && onDone(), 500);
    };
    requestAnimationFrame(tick);
    return () => { cancelled = true; };
  }, [session.id]);

  const r = 38, c = 2 * Math.PI * r;
  return (
    <div className="center">
      <div className="proc">
        <div className="ring">
          <svg width="96" height="96">
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--line)" strokeWidth="6"/>
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--accent)" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              style={{ transition: "stroke-dashoffset .25s linear" }}
            />
          </svg>
          <div className="pct">{Math.round(pct * 100)}<span style={{ fontSize: 14, color: "var(--ink-3)" }}>%</span></div>
        </div>
        <h2>Building your knowledge base</h2>
        <p>Hang tight — this usually takes about 30 seconds for a one-hour lecture.</p>
        <div className="stages">
          {stages.map((s, i) => {
            const status = i < activeIdx ? "done" : i === activeIdx ? "active" : "";
            return (
              <div key={s.id} className={`stage-row ${status}`}>
                <div className="stage-bullet">{i < activeIdx ? "✓" : i + 1}</div>
                <div>
                  <div>{s.label}{i === activeIdx && i < stages.length - 1 ? "…" : ""}</div>
                </div>
                <div className="stage-meta">{s.hint}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────── Citation Popover ───────────
function CitationPopover({ citation, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover" onClick={(e) => e.stopPropagation()}>
        <div className="popover-head">
          <div className="pop-num">{citation.id}</div>
          <div className="pop-ts">{citation.ts}</div>
          <div className="pop-rel">relevance · {(citation.relevance * 100).toFixed(0)}%</div>
        </div>
        <div className="popover-body">
          <em>From the source transcript</em>
          <p style={{ marginTop: 10 }}>{citation.text}</p>
        </div>
        <div className="popover-foot">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Render rich text array with cite markers
function RichText({ parts, onCite }) {
  return (
    <p>
      {parts.map((p, i) => {
        if (typeof p === "string") {
          // process **bold** and `code`
          const tokens = [];
          let s = p, key = 0;
          const re = /(\*\*[^*]+\*\*|`[^`]+`|\n\n)/g;
          let last = 0, m;
          while ((m = re.exec(s)) !== null) {
            if (m.index > last) tokens.push(s.slice(last, m.index));
            const tok = m[0];
            if (tok.startsWith("**")) tokens.push(<strong key={`b${i}-${key++}`}>{tok.slice(2, -2)}</strong>);
            else if (tok.startsWith("`")) tokens.push(<code key={`c${i}-${key++}`}>{tok.slice(1, -1)}</code>);
            else tokens.push(<br key={`br${i}-${key++}`} />);
            last = m.index + tok.length;
          }
          if (last < s.length) tokens.push(s.slice(last));
          return <React.Fragment key={i}>{tokens}</React.Fragment>;
        }
        return (
          <button key={i} className="cite" onClick={() => onCite(p.cite)} title={`Citation ${p.cite}`}>
            {p.cite}
          </button>
        );
      })}
    </p>
  );
}

// ─────────── TTS Button ───────────
function TTSButton({ messageId, ttsState, setTtsState }) {
  const state = ttsState[messageId] || { status: "idle", pct: 0 };
  const intRef = useRef(null);

  const start = () => {
    setTtsState((s) => ({ ...s, [messageId]: { status: "loading", pct: 0 } }));
    setTimeout(() => {
      setTtsState((s) => ({ ...s, [messageId]: { status: "playing", pct: 0 } }));
      const total = 18;
      let elapsed = 0;
      intRef.current = setInterval(() => {
        elapsed += 0.5;
        const pct = elapsed / total;
        if (pct >= 1) {
          clearInterval(intRef.current);
          setTtsState((s) => ({ ...s, [messageId]: { status: "idle", pct: 0 } }));
        } else {
          setTtsState((s) => ({ ...s, [messageId]: { status: "playing", pct } }));
        }
      }, 500);
    }, 700);
  };
  const stop = () => {
    if (intRef.current) clearInterval(intRef.current);
    setTtsState((s) => ({ ...s, [messageId]: { status: "idle", pct: 0 } }));
  };

  useEffect(() => () => intRef.current && clearInterval(intRef.current), []);

  if (state.status === "loading") {
    return <button className="tts-btn"><span style={{ display: "inline-block", width: 13, height: 13, border: "1.5px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} /> Loading…</button>;
  }
  if (state.status === "playing") {
    const total = 18;
    const cur = Math.floor(state.pct * total);
    const fmt = (n) => `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
    return (
      <button className="tts-btn playing" onClick={stop}>
        <window.Icon.Pause />
        <span className="tts-progress" style={{ "--p": `${state.pct * 100}%` }} />
        <span className="tts-time">{fmt(cur)} / {fmt(total)}</span>
      </button>
    );
  }
  return <button className="tts-btn" onClick={start}><window.Icon.Speaker /> Listen</button>;
}

window.ProcessingView = ProcessingView;
window.CitationPopover = CitationPopover;
window.RichText = RichText;
window.TTSButton = TTSButton;
