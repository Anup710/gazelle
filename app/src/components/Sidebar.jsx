import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import { SessionItem } from "./SessionItem.jsx";
import { relativeDate } from "../lib/format.js";

const THEME_LABEL = { scholar: "Scholar", studio: "Studio", focus: "Focus" };
const ARCHIVE_OPEN_KEY = "gazelle.archiveOpen";

function activityISO(s) {
  return s.last_activity_at || s.created_at;
}

function byActivityDesc(a, b) {
  return +new Date(activityISO(b)) - +new Date(activityISO(a));
}

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  theme,
  onThemeChange,
  onArchive,
  onDelete,
}) {
  const [archiveOpen, setArchiveOpen] = useState(() => {
    try {
      return localStorage.getItem(ARCHIVE_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(ARCHIVE_OPEN_KEY, archiveOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [archiveOpen]);

  const sorted = [...sessions].sort(byActivityDesc);
  const active = sorted.filter((s) => !s.archived);
  const archived = sorted.filter((s) => s.archived);
  const today = active.filter((s) => relativeDate(activityISO(s)) === "Today");
  const earlier = active.filter((s) => relativeDate(activityISO(s)) !== "Today");

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark">
            <img src="/gazelle-logo.jpeg" alt="" />
          </div>
          <div>gazelle</div>
        </div>
      </div>
      <button className="btn-new" onClick={onNew}>
        <span className="plus">
          <Icon.Plus />
        </span>
        New chat
      </button>
      <div className="session-list">
        {today.length > 0 && <div className="session-section-label">Today</div>}
        {today.map((s) => (
          <SessionItem
            key={s.job_id}
            session={s}
            active={s.job_id === activeId}
            onClick={() => onSelect(s.job_id)}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ))}
        {earlier.length > 0 && <div className="session-section-label">Earlier</div>}
        {earlier.map((s) => (
          <SessionItem
            key={s.job_id}
            session={s}
            active={s.job_id === activeId}
            onClick={() => onSelect(s.job_id)}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ))}
        {archived.length > 0 && (
          <>
            <button
              type="button"
              className="session-section-label session-section-toggle"
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={archiveOpen}
            >
              <span>{archiveOpen ? "▾" : "▸"} Archived ({archived.length})</span>
            </button>
            {archiveOpen &&
              archived.map((s) => (
                <SessionItem
                  key={s.job_id}
                  session={s}
                  active={s.job_id === activeId}
                  onClick={() => onSelect(s.job_id)}
                  onArchive={onArchive}
                  onDelete={onDelete}
                />
              ))}
          </>
        )}
      </div>
      <div className="sidebar-foot">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
        Local · {active.length} session{active.length === 1 ? "" : "s"} ·
        <select
          aria-label="Theme"
          value={theme}
          onChange={(e) => onThemeChange(e.target.value)}
          style={{
            marginLeft: 4,
            background: "transparent",
            border: "none",
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {Object.entries(THEME_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label} theme
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
