import { useEffect } from "react";
import { getJob } from "../api/job.js";
import { TERMINAL_STATUSES } from "../lib/statusMap.js";

const POLL_INTERVAL_MS = 2000;

// Polls GET /job/{jobId} every 2s. Calls onProgress on every tick (for stage label),
// onReady when status === "ready", and onFailed when status === "failed".
// Transient network errors are swallowed; polling continues until terminal or unmount.
export function useJobPolling(jobId, { onProgress, onReady, onFailed }) {
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const job = await getJob(jobId);
        if (cancelled) return;
        onProgress?.(job);
        if (job.status === "ready") return onReady?.(job);
        if (job.status === "failed") return onFailed?.(job);
        if (TERMINAL_STATUSES.has(job.status)) return;
      } catch {
        // Transient error — keep polling.
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
}
