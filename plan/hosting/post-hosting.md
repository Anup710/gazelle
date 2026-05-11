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

…and the orchestrator logs `ingest.unknown_failure` for the job. Local dev keeps working because residential IPs aren't on YouTube's watchlist.

**Cause:** YouTube aggressively bot-walls requests from cloud provider IP ranges (Render, AWS, GCP, Fly, etc.). Anonymous datacenter requests look exactly like scrapers to YouTube's anti-abuse systems.

**Fix — two layers, in order:**

1. **Player-client fallbacks (cheap, may help).** Tell yt-dlp to impersonate less-scrutinized YouTube clients in `gaz-server/src/pipeline/transcription/youtube.py`:
   ```python
   _YT_EXTRACTOR_ARGS = {"youtube": {"player_client": ["tv_embedded", "web_safari", "mweb"]}}
   ```
   Sometimes enough on its own. Often not.

2. **Cookies (the real fix).** Hand the backend a copy of your logged-in YouTube session. yt-dlp attaches the cookies to every request and YouTube treats it as a real user.

The code reads the cookies path from `settings.YOUTUBE_COOKIES_FILE`. If the env var is set and the file exists, yt-dlp uses it; otherwise it falls back to just the player-client trick (so local dev with no cookies file still works fine).

`captions.py` uses `youtube-transcript-api`, a separate code path that doesn't hit the same wall — leave it alone.

### 10.1 Runbook — uploading cookies to Render

Cookies are sensitive (they grant access to your YouTube account). Never commit them, never put them in plain env vars where they'd show in build logs. Use Render's **Secret Files** feature instead.

1. **Export cookies from your browser.**
   - Install a browser extension that exports cookies in Netscape format. Recommended: **"Get cookies.txt LOCALLY"** (Chrome) or **"cookies.txt"** (Firefox). Pick one with strong reviews — avoid sketchy ones, you're handing it access to your cookies.
   - Open `https://www.youtube.com` in a tab where you're **logged in**.
   - Click the extension icon → **Export** (or **Download**) → it gives you a `youtube.com_cookies.txt` (or similar) file. Save it somewhere you can find it.
   - Open the file in a text editor and sanity check: it should start with `# Netscape HTTP Cookie File` and contain lines with `.youtube.com` and tokens like `LOGIN_INFO`, `SID`, `SAPISID`, `HSID`.

2. **Upload as a Render Secret File.**
   - Render dashboard → backend service → left sidebar → **Environment** → scroll to **Secret Files** section → **Add Secret File**.
   - **Filename:** `youtube_cookies.txt`
   - **File Contents:** paste the entire contents of the exported file (or use the upload button).
   - Save. Render mounts it at `/etc/secrets/youtube_cookies.txt` inside the container.

3. **Add the env var that points to it.**
   - Same Environment page → **Environment Variables** → **Add**.
   - **Key:** `YOUTUBE_COOKIES_FILE`
   - **Value:** `/etc/secrets/youtube_cookies.txt`
   - Save.

4. **Redeploy.** Render auto-restarts the container after env changes (~30 sec). The new env var is now in scope, the file is on disk, and yt-dlp will pick it up on the next ingest. If a restart didn't happen automatically (rare), trigger **Manual Deploy → Deploy latest commit**.

5. **Verify.** Submit a YouTube URL through the FE. Watch Render Logs — you should NOT see `Sign in to confirm`. You should see `youtube.captions_used` (captions path) or audio-download progress (ASR path). If you see `youtube.cookies_file_missing` in the logs, the path in the env var doesn't match where Render actually mounted the file — re-check step 3.

### 10.2 When cookies expire

YouTube session cookies typically last weeks to a few months, then YouTube invalidates them and you'll start seeing `Sign in to confirm` again. **The fix is a re-upload, not a code change:**

1. Re-export from your browser (same extension, same flow).
2. Render dashboard → Secret Files → click the existing `youtube_cookies.txt` → **Update / Edit** → paste new contents → Save.
3. Render restarts the container. Done.

No commit, no redeploy from git, no code touched.

### 10.3 Diagnostic shortcut

If a future YouTube failure surfaces as `ingest.unknown_failure`:
- Grep Render logs for `Sign in to confirm` → cookies are gone/expired → re-upload (§10.2).
- Grep for `youtube.cookies_file_missing` → `YOUTUBE_COOKIES_FILE` is set but file isn't where it claims to be → check the env var path matches the Secret File mount.
- Neither shows up → not a bot-wall issue, dig elsewhere.
