import { useEffect } from "react";

export function CitationPopover({ citation, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
