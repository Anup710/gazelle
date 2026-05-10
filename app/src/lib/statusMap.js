// Maps backend job status enum onto the prototype's 4-stage UI labels.
// pending|transcribing → stage 0 (Extracting transcript)
// validating           → stage 1 (Building knowledge base)
// embedding            → stage 2 (Creating search index)
// ready                → stage 3 (Ready for questions)
// failed               → -1 (renders failure card instead)
export const STATUS_TO_STAGE_INDEX = {
  pending: 0,
  transcribing: 0,
  validating: 1,
  embedding: 2,
  ready: 3,
  failed: -1,
};

export const TERMINAL_STATUSES = new Set(["ready", "failed"]);
