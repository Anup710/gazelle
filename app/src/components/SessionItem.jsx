import { Icon } from "./Icon.jsx";
import { relativeDate } from "../lib/format.js";

const SOURCE_ICON = {
  youtube: <Icon.YouTube />,
  upload: <Icon.Upload />,
  transcript: <Icon.Doc />,
};

export function SessionItem({ session, active, onClick, onArchive, onDelete }) {
  const sourceIcon = SOURCE_ICON[session.source_type] || <Icon.Doc />;
  const activityISO = session.last_activity_at || session.created_at;
  const rel = relativeDate(activityISO);
  const dateLabel = rel === "Today" || rel === "Yesterday" ? "" : rel;
  const isFailed = session.status === "failed";
  const isReady = session.status === "ready";
  const isArchived = !!session.archived;

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  // Per the plan: failed → Delete; ready → Archive; archived → Restore + Delete forever.
  const renderActions = () => {
    if (isArchived) {
      return (
        <>
          <button
            className="si-btn"
            onClick={(e) => {
              e.stopPropagation();
              onArchive?.(session.job_id, false);
            }}
            title="Restore"
            aria-label="Restore session"
          >
            <Icon.Restore />
          </button>
          <button
            className="si-btn si-btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("Delete this session forever? This cannot be undone.")) {
                onDelete?.(session.job_id);
              }
            }}
            title="Delete forever"
            aria-label="Delete forever"
          >
            <Icon.Trash />
          </button>
        </>
      );
    }
    if (isFailed) {
      return (
        <button
          className="si-btn si-btn-danger"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm("Remove this failed ingestion?")) {
              onDelete?.(session.job_id);
            }
          }}
          title="Remove"
          aria-label="Remove failed ingestion"
        >
          <Icon.Trash />
        </button>
      );
    }
    if (isReady) {
      return (
        <button
          className="si-btn"
          onClick={(e) => {
            e.stopPropagation();
            onArchive?.(session.job_id, true);
          }}
          title="Archive"
          aria-label="Archive session"
        >
          <Icon.Archive />
        </button>
      );
    }
    return null;
  };

  return (
    <div
      className={`session-item ${active ? "active" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKey}
      title={isFailed ? "Failed" : !isReady && !isArchived ? "Processing…" : ""}
    >
      <span className="si-icon">{sourceIcon}</span>
      <span className="si-title">{session.title || "Untitled session"}</span>
      <span className="si-date">
        {isFailed ? "·failed" : !isReady && !isArchived ? "·…" : dateLabel}
      </span>
      <span className="si-action">{renderActions()}</span>
    </div>
  );
}
