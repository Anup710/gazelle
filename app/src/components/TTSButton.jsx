import { useEffect, useRef } from "react";
import { synthesizeTTS } from "../api/tts.js";
import { humanizeError } from "../lib/humanizeError.js";
import { formatSeconds } from "../lib/format.js";
import { Icon } from "./Icon.jsx";

export function TTSButton({ messageId, text, language, ttsState, setTtsState, notify }) {
  const state = ttsState[messageId] || { status: "idle", pct: 0 };
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  // Cleanup on unmount: stop audio and revoke object URL.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  const start = async () => {
    if (!text) return;
    setTtsState((s) => ({ ...s, [messageId]: { status: "loading", pct: 0 } }));
    let url;
    try {
      url = await synthesizeTTS({ text, language });
    } catch (e) {
      setTtsState((s) => ({ ...s, [messageId]: { status: "error", pct: 0 } }));
      notify?.("error", humanizeError({ ...e, code: "tts_failed" }) || "Unable to generate audio. Please try again.");
      return;
    }
    urlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.ontimeupdate = () => {
      const dur = audio.duration || 0;
      const pct = dur ? audio.currentTime / dur : 0;
      setTtsState((s) => ({ ...s, [messageId]: { status: "playing", pct, dur } }));
    };
    audio.onended = () => {
      setTtsState((s) => ({ ...s, [messageId]: { status: "idle", pct: 0 } }));
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      audioRef.current = null;
    };
    audio.onerror = () => {
      setTtsState((s) => ({ ...s, [messageId]: { status: "error", pct: 0 } }));
      notify?.("error", "Unable to play audio. Please try again.");
    };
    try {
      await audio.play();
      setTtsState((s) => ({ ...s, [messageId]: { status: "playing", pct: 0, dur: audio.duration || 0 } }));
    } catch {
      setTtsState((s) => ({ ...s, [messageId]: { status: "error", pct: 0 } }));
      notify?.("error", "Unable to play audio. Please try again.");
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setTtsState((s) => ({ ...s, [messageId]: { status: "idle", pct: 0 } }));
  };

  if (state.status === "loading") {
    return (
      <button className="tts-btn" aria-label="Loading audio" disabled>
        <span
          style={{
            display: "inline-block",
            width: 13,
            height: 13,
            border: "1.5px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin .8s linear infinite",
          }}
        />{" "}
        Loading…
      </button>
    );
  }
  if (state.status === "playing") {
    const dur = state.dur || 0;
    const cur = dur * (state.pct || 0);
    return (
      <button className="tts-btn playing" onClick={stop} aria-label="Pause audio">
        <Icon.Pause />
        <span className="tts-progress" style={{ "--p": `${(state.pct || 0) * 100}%` }} />
        <span className="tts-time">
          {formatSeconds(cur)} / {formatSeconds(dur)}
        </span>
      </button>
    );
  }
  if (state.status === "error") {
    return (
      <button className="tts-btn" onClick={start} aria-label="Retry audio">
        <Icon.Speaker /> Retry
      </button>
    );
  }
  return (
    <button className="tts-btn" onClick={start} aria-label="Listen">
      <Icon.Speaker /> Listen
    </button>
  );
}
