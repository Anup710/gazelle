// Mock data for the prototype.

const SAMPLE_SESSIONS = [
  {
    id: "sess_001",
    title: "Linear Algebra: Eigenvalues & Eigenvectors",
    source: "youtube",
    durationStr: "42:18",
    createdAt: "Today",
    detectedLanguage: "English",
    suggestions: [
      "What is an eigenvalue, in plain language?",
      "Walk me through the determinant trick from the example",
      "Why does the characteristic polynomial work?",
    ],
  },
  {
    id: "sess_002",
    title: "Photosynthesis — Light & Dark Reactions",
    source: "youtube",
    durationStr: "28:04",
    createdAt: "Today",
    detectedLanguage: "English",
    suggestions: [
      "Explain the Calvin cycle simply",
      "What's the role of NADPH?",
    ],
  },
  {
    id: "sess_003",
    title: "Pasted Transcript · CS 101 Lecture 4",
    source: "transcript",
    durationStr: "—",
    createdAt: "Yesterday",
    detectedLanguage: "English",
    suggestions: ["Summarize the lecture in 5 bullets"],
  },
  {
    id: "sess_004",
    title: "क्वांटम मैकेनिक्स की शुरुआत",
    source: "youtube",
    durationStr: "55:30",
    createdAt: "May 6",
    detectedLanguage: "Hindi",
    suggestions: ["वेव-पार्टिकल द्वैत क्या है?"],
  },
  {
    id: "sess_005",
    title: "World War II — The Pacific Theater",
    source: "upload",
    durationStr: "1:12:00",
    createdAt: "May 4",
    detectedLanguage: "English",
    suggestions: ["What led to Pearl Harbor?"],
  },
];

// Pre-baked Q&A so the prototype feels real.
const MOCK_REPLIES = {
  default: {
    text: [
      "Eigenvalues and eigenvectors describe the directions in which a linear transformation only **stretches or compresses** space — without rotating it ",
      { cite: 1 },
      ". For a square matrix A, an eigenvector v satisfies `A·v = λ·v`, where λ (the eigenvalue) is the scaling factor along that direction ",
      { cite: 2 },
      ".\n\nThe lecturer's intuition was helpful: imagine pushing a rubber sheet. Most arrows you draw on it tilt and twist after the push, but a few special arrows just get longer or shorter while keeping their orientation. Those are eigenvectors ",
      { cite: 3 },
      ". The amount each one stretches by is its eigenvalue.\n\nIn practice, you find them by solving `det(A − λI) = 0` for λ, then back-substituting to recover v.",
    ],
    citations: [
      { id: 1, ts: "08:14 – 08:42", relevance: 0.91, text: "...so the key idea is that an eigenvector is a vector whose direction is preserved under the transformation. The matrix can stretch it, flip it, or shrink it, but it stays on the same line through the origin..." },
      { id: 2, ts: "10:02 – 10:36", relevance: 0.87, text: "Mathematically we write this as A times v equals lambda times v. That equation is the definition. Lambda is just a number — it tells you how much the eigenvector got scaled by." },
      { id: 3, ts: "12:48 – 13:22", relevance: 0.79, text: "The picture I want you to keep in mind is a rubber sheet. You push on it, most arrows tilt and twist, but a select few — these are the eigenvectors — just get longer or shorter and don't change direction at all." },
    ],
    lang: "English",
  },
  followup: {
    text: [
      "Sure — let's slow it down. The **determinant trick** comes from rewriting `A·v = λv` as `(A − λI)·v = 0` ",
      { cite: 1 },
      ". For a non-zero v to satisfy this, the matrix `(A − λI)` must be **singular** (otherwise we could just multiply by its inverse and get v = 0). A matrix is singular exactly when its determinant is zero — so we set `det(A − λI) = 0` and solve for λ ",
      { cite: 2 },
      ".\n\nIn the lecture's 2×2 example, this reduced to a quadratic in λ, and the two roots were the two eigenvalues.",
    ],
    citations: [
      { id: 1, ts: "15:04 – 15:38", relevance: 0.88, text: "We rearrange A v equals lambda v to get A minus lambda I, all multiplied by v, equals the zero vector. Now we want a non-trivial v..." },
      { id: 2, ts: "16:12 – 16:55", relevance: 0.84, text: "...which is exactly when the determinant of that matrix is zero. So we end up with this characteristic equation, det of A minus lambda I equals zero, and that's a polynomial in lambda we can solve." },
    ],
    lang: "English",
  },
};

const PROCESSING_STAGES = [
  { id: "extract",  label: "Extracting transcript",       hint: "audio → text" },
  { id: "kb",       label: "Building knowledge base",     hint: "chunking + embeddings" },
  { id: "index",    label: "Creating search index",       hint: "vector store" },
  { id: "ready",    label: "Ready for questions",         hint: "" },
];

window.SAMPLE_SESSIONS = SAMPLE_SESSIONS;
window.MOCK_REPLIES = MOCK_REPLIES;
window.PROCESSING_STAGES = PROCESSING_STAGES;
