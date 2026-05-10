import { STATUS_TO_STAGE_INDEX } from "../lib/statusMap.js";
import { failureMessage } from "../lib/humanizeError.js";

const STAGES = [
  { id: "extract", label: "Extracting transcript", hint: "audio → text" },
  { id: "kb", label: "Building knowledge base", hint: "content gate + chunking" },
  { id: "index", label: "Creating search index", hint: "embeddings + vector store" },
  { id: "ready", label: "Ready for questions", hint: "" },
];

export function ProcessingView({ session, onAbandon }) {
  const status = session.status || "pending";
  const failed = status === "failed";

  if (failed) {
    return (
      <div className="center">
        <div className="proc">
          <div className="ring">
            <svg width="96" height="96">
              <circle cx="48" cy="48" r="38" fill="none" stroke="var(--line)" strokeWidth="6" />
              <circle cx="48" cy="48" r="38" fill="none" stroke="var(--alert, #c0392b)" strokeWidth="6" strokeLinecap="round" />
            </svg>
            <div className="pct" style={{ color: "var(--alert, #c0392b)" }}>!</div>
          </div>
          <h2>Couldn't build the knowledge base</h2>
          <p>{failureMessage(session.failure_reason)}</p>
          <button className="btn btn-primary" onClick={onAbandon} style={{ marginTop: 18 }}>
            Try a different input
          </button>
        </div>
      </div>
    );
  }

  const idx = STATUS_TO_STAGE_INDEX[status] ?? 0;
  // Smooth progress bar fills as we cross stages: stage 0 → 25%, 1 → 50%, 2 → 75%, 3 → 100%.
  const pct = Math.min(1, (idx + 1) / STAGES.length);

  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="center">
      <div className="proc">
        <div className="ring">
          <svg width="96" height="96">
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
            <circle
              cx="48"
              cy="48"
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              style={{ transition: "stroke-dashoffset .35s ease" }}
            />
          </svg>
          <div className="pct">
            {Math.round(pct * 100)}
            <span style={{ fontSize: 14, color: "var(--ink-3)" }}>%</span>
          </div>
        </div>
        <h2>Building your knowledge base</h2>
        <p>Hang tight — this usually takes about 30 seconds for a one-hour lecture.</p>
        <div className="stages">
          {STAGES.map((s, i) => {
            const cls = i < idx ? "done" : i === idx ? "active" : "";
            return (
              <div key={s.id} className={`stage-row ${cls}`}>
                <div className="stage-bullet">{i < idx ? "✓" : i + 1}</div>
                <div>
                  <div>
                    {s.label}
                    {i === idx && i < STAGES.length - 1 ? "…" : ""}
                  </div>
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
