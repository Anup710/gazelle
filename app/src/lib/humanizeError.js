// Map backend ApiError → user-facing string for toasts.
// `insufficient_context` is intentionally absent — that path returns 200 with
// the refusal text in the response body and is rendered as a normal bubble.
export function humanizeError(e) {
  switch (e?.code) {
    case "invalid_session":
      return "This session is no longer available.";
    case "stt_failed":
      return "Couldn't capture audio. Please type your question.";
    case "generation_failed":
      return "Something went wrong. Please try again.";
    case "invalid_input":
      return e.message || "Please check your input.";
    case "network_error":
      return "Connection issue. Check your network and retry.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// Map a failed-job's `failure_reason` enum to the failure copy shown in ProcessingView.
export function failureMessage(failureReason) {
  if (failureReason === "non_educational") {
    return "This content doesn't appear to be educational. Please try a lecture, tutorial, or explainer.";
  }
  return "Could not process this video. Please try another.";
}
