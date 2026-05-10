import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { RichText } from "./RichText.jsx";
import { TTSButton } from "./TTSButton.jsx";

const TTS_CHAR_LIMIT = 3500;

export function Message({ message, onPickCitation, ttsState, setTtsState, notify }) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="msg user">
        <div className="avatar">You</div>
        <div className="bubble">{message.text}</div>
      </div>
    );
  }

  const tooLong = (message.responseText || "").length > TTS_CHAR_LIMIT;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.responseText || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify?.("error", "Couldn't copy to clipboard.");
    }
  };

  return (
    <div className="msg assistant">
      <div className="avatar">G</div>
      <div className="bubble">
        <RichText
          parts={message.parts}
          onCite={(id) => {
            const c = (message.citations || []).find((x) => x.id === id);
            if (c) onPickCitation(c);
          }}
        />
        <div className="msg-foot">
          <span className="lang-chip">{message.lang}</span>
          <TTSButton
            messageId={message.id}
            text={message.responseText}
            language={message.lang}
            ttsState={ttsState}
            setTtsState={setTtsState}
            notify={notify}
          />
          <button className="tts-btn" title="Copy" aria-label="Copy answer" onClick={handleCopy}>
            <Icon.Copy /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {tooLong && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontStyle: "italic", marginTop: 6 }}>
            Audio truncated to the last complete paragraph that fit (3,500-character cap).
          </div>
        )}
      </div>
    </div>
  );
}
