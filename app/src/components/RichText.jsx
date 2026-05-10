import { Fragment } from "react";

// Renders an array of strings interleaved with { cite: N } objects.
// String segments support **bold**, `code`, and \n\n paragraph breaks.
export function RichText({ parts, onCite }) {
  return (
    <p>
      {parts.map((p, i) => {
        if (typeof p === "string") {
          const tokens = [];
          let s = p;
          let key = 0;
          const re = /(\*\*[^*]+\*\*|`[^`]+`|\n\n)/g;
          let last = 0;
          let m;
          while ((m = re.exec(s)) !== null) {
            if (m.index > last) tokens.push(s.slice(last, m.index));
            const tok = m[0];
            if (tok.startsWith("**")) tokens.push(<strong key={`b${i}-${key++}`}>{tok.slice(2, -2)}</strong>);
            else if (tok.startsWith("`")) tokens.push(<code key={`c${i}-${key++}`}>{tok.slice(1, -1)}</code>);
            else tokens.push(<br key={`br${i}-${key++}`} />);
            last = m.index + tok.length;
          }
          if (last < s.length) tokens.push(s.slice(last));
          return <Fragment key={i}>{tokens}</Fragment>;
        }
        return (
          <button
            key={i}
            className="cite"
            onClick={() => onCite(p.cite)}
            title={`Citation ${p.cite}`}
            aria-label={`Open citation ${p.cite}`}
          >
            {p.cite}
          </button>
        );
      })}
    </p>
  );
}
