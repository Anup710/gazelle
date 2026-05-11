# Gazelle — Post-Hosting Operations Guide

> **When to read this:** after `hosting.md` is done and the app is live. This is the day-2 reference — how to change things, ship updates, tune knobs, and debug without a full re-read of the deploy guide.

---

## 1. How updates reach production (the mental model)

Both Render and Vercel are wired to your GitHub repo. They watch the `main` branch and auto-deploy on every push.

```text
You edit code → git commit → git push origin main
                                       │
              ┌────────────────────────┼─────────────────────────┐
              ▼                                                  ▼
   Render (backend)                                   Vercel (frontend)
   - Rebuilds Docker image                            - Runs `npm run build`
   - ~3–5 min                                         - ~1 min
   - Old container keeps serving                      - Old build keeps serving
     until new one is healthy                           until new one is ready
   - Auto-switches traffic                            - Auto-switches traffic
```

**Branches other than `main`:** Vercel auto-generates preview URLs for them (`gazelle-git-<branch>.vercel.app`). Render ignores them. So feature branches are safe to push — they won't touch production.

**Manual deploy** is available in both dashboards if you want to redeploy without a new commit (e.g., after changing env vars or to retry a flaky build).

---

## 2. The env var escape hatch (don't always need a commit)

Most "I want to change X" tasks don't actually need a code change. The backend is built with **pydantic-settings**, which means **every field in `gaz-server/src/core/config.py` is also an environment variable of the same name** — case-insensitive, no extra wiring needed.

Look at the `Settings` class. Anything there can be overridden from Render's Environment tab without touching code:

```python
# gaz-server/src/core/config.py
class Settings(BaseSettings):
    OPENAI_API_KEY: str
    GROQ_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    QDRANT_URL: str
    QDRANT_API_KEY: str
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    QDRANT_COLLECTION: str = "transcript_chunks"
    EMBED_MODEL: str = "text-embedding-3-small"
    GEN_MODEL: str = "gpt-4o-mini"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3-turbo"
    TTS_MODEL: str = "tts-1"
    TTS_VOICE: str = "alloy"

    MIN_SIMILARITY_SCORE: float = 0.72   # ← override on Render to retune retrieval
    TOP_K: int = 5                        # ← override on Render to change # of chunks
    LOG_LEVEL: str = "INFO"
```

If you want to switch the chat model to `gpt-4o` for an A/B test: set `GEN_MODEL=gpt-4o` on Render. No commit. Render restarts the container in ~30 sec and the new model is live.

---

## 3. Render vs Vercel env vars — important difference

| Platform | Effect of changing an env var | How fast |
|---|---|---|
| **Render (backend)** | Container restarts. Docker image is **not rebuilt**. | ~30 sec |
| **Vercel (frontend)** | Requires a **redeploy** — Vite inlines `VITE_*` vars at build time, so they're baked into the JS bundle. Saving an env var alone does nothing until you click **Redeploy**. | ~1 min after clicking |

> ⚠ **The Vercel gotcha:** if you change `VITE_API_BASE_URL` and refresh the live URL without redeploying, you'll see the *old* backend URL. This has bitten every Vercel user at least once. After changing any `VITE_*` var, click **Deployments → ⋯ → Redeploy** (or push any commit to `main`).

---

## 4. Quick reference — "I want to change X, what's the path?"

| Change | Path | Restart/rebuild? |
|---|---|---|
| Retrieval threshold (`MIN_SIMILARITY_SCORE`) | Render → Environment | Container restart, ~30 sec |
| Top-K chunks (`TOP_K`) | Render → Environment | Container restart |
| Generation model (`GEN_MODEL`) | Render → Environment | Container restart |
| Embedding model (`EMBED_MODEL`) | Render → Environment | Container restart ⚠ see note below |
| TTS voice (`TTS_VOICE`) | Render → Environment | Container restart |
| CORS allow-list (`ALLOWED_ORIGINS`) | Render → Environment | Container restart |
| Rotate an API key (`OPENAI_API_KEY`, etc.) | Render → Environment | Container restart |
| Backend URL on FE (`VITE_API_BASE_URL`) | Vercel → Environment + **Redeploy** | Full rebuild ~1 min |
| Anything in `gaz-server/src/*.py` | Edit → commit → push `main` | Render Docker rebuild ~3–5 min |
| Anything in `app/src/*` | Edit → commit → push `main` | Vercel rebuild ~1 min |
| Add a system package (e.g., another binary) | Edit `gaz-server/Dockerfile` → commit → push | Render Docker rebuild ~4–6 min |
| Add a new Python dep | Edit `requirements.txt` → commit → push | Render Docker rebuild ~4–6 min |
| Add a new npm dep | `npm install <x>` locally → commit lockfile → push | Vercel rebuild ~1–2 min |

> ⚠ **Changing `EMBED_MODEL` is not just an env change.** All existing embeddings in Qdrant were generated with the *old* model and are not comparable to queries embedded with a *new* model. You'd need to re-embed every chunk (i.e., re-ingest every session) for retrieval to work again. Don't change this casually.

---

## 5. The threshold incident (2026-05-11) — what to remember

**Symptom:** prod returned "I don't have enough context to answer that" for every question. Render logs showed `raw_count: 5, filtered_count: 0` for every retrieval.

**Cause:** local `gaz-server/.env` had `MIN_SIMILARITY_SCORE=0.2`, but Render had no override → fell back to the code default of `0.72`. The same embeddings that scored well enough at 0.2 were filtered out at 0.72.

**Fix:** add `MIN_SIMILARITY_SCORE=0.2` to Render's Environment tab. ~30 sec restart. Retrieval starts producing chunks again.

**Lesson — keep dev and prod env vars in sync.** Before going live, diff your local `gaz-server/.env` against Render's Environment tab. Anything in the local file that isn't in Render will silently fall back to a default that may not match what you've been testing against. A useful audit command:

```bash
grep -v "^#" gaz-server/.env | grep -v "^$" | cut -d= -f1
```

That prints every key set locally. Cross-check each against Render → Environment.

---

## 6. Common ops tasks

### Trigger a fresh deploy without changing code
- Render: dashboard → service → **Manual Deploy → Deploy latest commit**.
- Vercel: dashboard → project → **Deployments → ⋯ → Redeploy**.

### View backend logs
Render → service → **Logs**. Live tail. Filter by severity. Search by string. This is your primary debugging surface — most "it doesn't work in prod" issues are visible here within the first 5 lines of output.

### View frontend errors
There's no Vercel-side log for runtime FE errors — open the live URL → DevTools → Console. Vercel only has *build* logs (Deployments → click a deploy → Build Logs).

### Wake the free-tier backend before a demo
Render free tier spins down after 15 min idle. Hit any endpoint ~1 min before your demo to wake it:
```bash
curl https://gazelle-backend-oo01.onrender.com/sessions > /dev/null
```
First call takes 30–60 sec, subsequent calls are fast.

### Roll back a bad deploy
- Render: **Deploys** tab → find the last good deploy → **Rollback**.
- Vercel: **Deployments** tab → find the last good deploy → **⋯ → Promote to Production**.

### See if Render is talking to Supabase/Qdrant/OpenAI
Watch Render Logs while you submit a query from the FE. You should see (in order):
- `query.received`
- `query.augmented`
- `retrieval.done` with `raw_count`, `filtered_count`
- Either a token-stream (success) or `refusal.insufficient_context` (no chunks passed threshold)

If `raw_count: 0` → Qdrant is empty for that session or the API key is wrong.
If `raw_count > 0` but `filtered_count: 0` → threshold too high (see §5).
If you don't see `query.augmented` after `query.received` → OpenAI key / billing issue.

---

## 7. Cost monitoring

- **OpenAI:** https://platform.openai.com/usage — check at least weekly during active use. If it spikes, the most likely cause is a runaway loop in the FE re-submitting the same query.
- **Render:** Free tier capped at ~750 hours/month per workspace. The dashboard shows current usage under Billing.
- **Vercel:** Free tier is generous; very unlikely to hit limits on a prototype.
- **Supabase / Qdrant / Groq:** all on free tiers with comfortable headroom for V1 scale.

---

## 8. Pre-demo checklist (5 min before)

- [ ] Hit `/sessions` on the Render URL to wake the backend
- [ ] Open the live Vercel URL — sidebar loads, no console errors
- [ ] Submit a fresh test session end-to-end (transcript paste is fastest — no upload time)
- [ ] Ask one question, get a grounded answer with citations
- [ ] Click a citation → popover renders correctly
- [ ] Refresh page → session persists in sidebar

If any of these fail, check Render Logs first. 90% of demo-day failures are: (a) backend not awake, (b) recently-changed env var that didn't propagate, or (c) something in OpenAI/Groq billing.

---

## 9. When something breaks — debug order

1. **Browser DevTools → Console** — frontend errors, CORS, undefined env vars
2. **Browser DevTools → Network** — what URL is the FE actually calling? What status code came back?
3. **Render → Logs** — backend exceptions, retrieval scores, refusal reasons
4. **Supabase → SQL Editor** — `select * from jobs where id = '<job_id>' order by updated_at desc limit 1;` to see the actual row state
5. **curl from your laptop against the Render URL** — isolates "is the backend itself broken" from "is the FE→BE wiring broken"

90% of bugs are env-var mismatches (this file's whole reason to exist).
9% are CORS.
1% are real code bugs.

---

## 10. The YouTube bot-wall incident (2026-05-11) — what to remember

**Symptom:** YouTube ingest jobs fail on Render (works fine locally). Render logs show:

```
ERROR: [youtube] <video_id>: Sign in to confirm you're not a bot.
Use --cookies-from-browser or --cookies for the authentication.
```

…and the orchestrator logs `ingest.unknown_failure` for the job. Appeared after a cold start, but the cold start is incidental — the real trigger is YouTube's bot detection flagging Render's datacenter IP.

**Cause:** YouTube aggressively bot-walls requests from cloud provider IP ranges (Render, AWS, GCP, Fly, etc.). The default yt-dlp `web` player client is the most heavily scrutinized — it's the one a real browser would use, so YouTube applies the strictest checks to it. Residential IPs (your laptop) are not on the watchlist, which is why local dev works.

**Fix:** Tell yt-dlp to impersonate alternative YouTube clients that are less heavily inspected. In `gaz-server/src/pipeline/transcription/youtube.py`:

```python
_YT_EXTRACTOR_ARGS = {"youtube": {"player_client": ["tv_embedded", "web_safari", "mweb"]}}
```

Wire it into **both** `_get_metadata` and `_download_audio` opts (`extractor_args=_YT_EXTRACTOR_ARGS`) — otherwise the bot wall just moves from step 1 to step 2. Also bump the `yt-dlp` floor in `requirements.txt` (e.g. `>=2025.1.15`) so pip resolves a newer build with fresher bypasses. Deploy with Render → **Manual Deploy → Clear build cache & deploy** so Docker doesn't reuse the cached pip layer.

`captions.py` uses `youtube-transcript-api`, a separate code path that doesn't hit the same wall — leave it alone.

**Lesson — this fix is temporary by design.** YouTube and yt-dlp are in a constant cat-and-mouse loop; the player-client trick can break again in weeks or months. The durable workaround is cookies:

1. Install a "Get cookies.txt" extension in your browser, log into YouTube, export `youtube.com` cookies.
2. Upload as a Render Secret File at `/etc/secrets/youtube_cookies.txt`.
3. Add `"cookiefile": "/etc/secrets/youtube_cookies.txt"` to the yt-dlp `opts` dict.

Cookies expire (weeks to months), so they need periodic refresh — but a refresh is much cheaper than a code change that may not work. Treat the player-client trick as the "happy path" and cookies as the fallback.

**Diagnostic shortcut.** If a future YouTube-related failure surfaces as `ingest.unknown_failure` with no obvious cause, grep the Render log for `Sign in to confirm` — if present, the bot wall is back and the cookie fallback is the next step.
