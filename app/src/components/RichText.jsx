import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// Flatten markdown's default <p> so each segment flows inline with the
// citation buttons that live between segments.
const mdComponents = {
  p: ({ children }) => <>{children}</>,
};

const remarkPlugins = [remarkMath];
const rehypePlugins = [rehypeKatex];

function renderMarkdownPart(text, baseKey) {
  // Preserve the original \n\n → <br/> behavior. react-markdown would
  // otherwise produce sibling <p> blocks which we've flattened, losing
  // the visual break entirely.
  const segments = text.split(/\n\n/);
  const out = [];
  segments.forEach((seg, idx) => {
    out.push(
      <ReactMarkdown
        key={`${baseKey}-md-${idx}`}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={mdComponents}
      >
        {seg}
      </ReactMarkdown>,
    );
    if (idx < segments.length - 1) {
      out.push(<br key={`${baseKey}-br-${idx}`} />);
    }
  });
  return out;
}

// Renders an array of strings interleaved with { cite: N } objects.
// String segments support markdown (bold, code, lists) and LaTeX math
// via \(...\) inline and \[...\] display.
export function RichText({ parts, onCite }) {
  return (
    <div className="rich-text">
      {parts.map((p, i) => {
        if (typeof p === "string") {
          return <Fragment key={i}>{renderMarkdownPart(p, i)}</Fragment>;
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
    </div>
  );
}
