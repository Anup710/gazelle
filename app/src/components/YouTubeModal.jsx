import { useEffect } from "react";
import { embedUrl, watchUrl } from "../lib/youtube.js";

export function YouTubeModal({ videoId, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover yt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="yt-modal-frame">
          <iframe
            src={embedUrl(videoId)}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="popover-foot">
          <a
            className="btn btn-ghost btn-sm"
            href={watchUrl(videoId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on YouTube
          </a>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
